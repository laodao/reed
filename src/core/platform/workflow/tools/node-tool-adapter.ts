/**
 * 节点即工具适配（25 号 M2 批3 / 01 号 §9 / 02 号 M2.1）
 * @module core/platform/workflow/tools/node-tool-adapter
 *
 * 把工作流节点的能力导出为 LLM tool（source='node'）：每条目手写 zod 入参 schema
 * （禁止从 UI 表单 schema 硬凑），执行器直调节点 handler 同款底层服务/函数
 * （"路线 A"延续——不伪造 WorkflowNodeContext；行为一致性由"同一执行器链"保证）。
 *
 * 首批选择标准：对 LLM 有增量价值（LLM 自身做不了/做不好的能力）。
 * template-transform / parameter-extractor / kb-qa 不导出——分别是纯文本拼接、
 * LLM 自身擅长的抽取、kb-retrieve+LLM 合成的封装，导出无增量（14 号 §3 工具
 * 价值原则）；kb-qa 的问答直出路径由 agent 先 wf_kb_retrieve 再自行合成替代。
 *
 * 出网工具经 politeFetch/validateOutboundUrl 强制 SSRF 闸门；写/花费类
 * （image-gen/tts）dangerLevel=write + requiresApproval。
 */

import { z } from 'zod'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { validateOutboundUrl } from '@core/utils/outbound-url'
import { politeFetch } from '../nodes/http-politeness'
import { readTextWithLimit } from '../nodes/response-body'
import { extractArticleContent, truncateTextSmart, extractPageLinks } from '../nodes/extra-nodes'
import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import { KnowledgeBaseService } from '../../services/knowledge-base.service'
import { TranslationService } from '../../services/translation.service'
import { ImageService } from '../../services/image.service'
import { VoiceService } from '../../services/voice.service'

// ==================== wf_web_extract（读；网页正文提取，web-extract 节点同链） ====================

const WebExtractInput = z.object({
  url: z.string().describe('完整 http(s) 地址'),
  maxLength: z.number().int().positive().max(200_000).optional().describe('正文最大字符数（缺省 100000，按句子/段落边界智能截断）'),
  maxLinks: z.number().int().min(0).max(100).optional().describe('页面内链接提取上限（缺省 30，0=不提取）'),
})

const webExtractTool: AgentToolDef<z.infer<typeof WebExtractInput>> = {
  name: 'wf_web_extract',
  description: '抓取网页并提取正文（去脚本/样式/导航噪声，文本密度选主内容），附页面标题与链接列表。适合阅读文章全文。',
  inputSchema: WebExtractInput,
  dangerLevel: 'read',
  autoApprovableInWorkflow: true,
  execute: async (input, ctx) => {
    const guard = validateOutboundUrl(input.url)
    if (!guard.ok) throw new Error(`URL 校验失败：${guard.reason}`)
    // 与 web-extract 节点同链：礼貌抓取（同站单线程+随机间隔）→ 限长读取 → 启发式正文提取
    const timeout = Math.min(WORKFLOW_DEFAULTS.httpRequestTimeoutMs, WORKFLOW_LIMITS.httpTimeoutMs)
    const signal = AbortSignal.any([ctx.signal ?? new AbortController().signal, AbortSignal.timeout(timeout)])
    const res = await politeFetch(
      input.url,
      { signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; the-bot-workflow)' } },
      {},
    )
    if (!res.ok) throw new Error(`请求失败：HTTP ${res.status}`)
    const html = await readTextWithLimit(res)
    const { title, text } = extractArticleContent(html)
    const max = input.maxLength && input.maxLength > 0 ? input.maxLength : 100_000
    const trimmed = text.length > max ? truncateTextSmart(text, max) : text
    const links = extractPageLinks(html, input.url, input.maxLinks ?? 30)
    return { title, text: trimmed, length: trimmed.length, links }
  },
}

// ==================== wf_translate（读；翻译服务，与 translate 节点同链） ====================

const TranslateInput = z.object({
  text: z.string().describe('待翻译内容'),
  targetLang: z.string().describe('目标语言（如 英语 / 中文 / 日语）'),
  sourceLang: z.string().optional().describe('源语言（缺省自动检测）'),
})

const translateTool: AgentToolDef<z.infer<typeof TranslateInput>> = {
  name: 'wf_translate',
  description: '调用翻译服务翻译文本（专用翻译链，非 LLM 自译）。',
  inputSchema: TranslateInput,
  dangerLevel: 'read',
  autoApprovableInWorkflow: true,
  execute: async (input) => {
    // 展开写法会让 TS 把条件收窄成 never——显式构造请求对象
    const request: Record<string, unknown> = { text: input.text, targetLanguage: input.targetLang }
    if (input.sourceLang) request.sourceLanguage = input.sourceLang
    const resp = await TranslationService.translateText(request as never)
    if (!resp.success || !resp.data?.translatedText) {
      throw new Error(resp.error ?? '翻译服务未返回译文')
    }
    return { text: resp.data.translatedText }
  },
}

// ==================== wf_kb_retrieve（读；知识库检索，与 kb-retrieve 节点同链） ====================

const KbRetrieveInput = z.object({
  knowledgeBaseId: z.string().describe('知识库 id'),
  query: z.string().describe('查询内容'),
  topK: z.number().int().min(1).max(50).optional().describe('返回条数（缺省 5）'),
  threshold: z.number().min(0).max(1).optional().describe('相似度阈值（0-1）'),
})

const kbRetrieveTool: AgentToolDef<z.infer<typeof KbRetrieveInput>> = {
  name: 'wf_kb_retrieve',
  description: '在指定知识库中语义检索相关片段（返回 content/score/documentName），用于回答基于私有资料的问题。',
  inputSchema: KbRetrieveInput,
  dangerLevel: 'read',
  autoApprovableInWorkflow: true,
  execute: async (input, ctx) => {
    const resp = await new KnowledgeBaseService().search({
      knowledgeBaseId: input.knowledgeBaseId,
      query: input.query,
      topK: input.topK,
      threshold: input.threshold,
      signal: ctx.signal,
    })
    if (!resp.success) throw new Error(resp.error ?? '知识库检索失败')
    const results = (resp.data ?? []).map((r) => ({
      content: r.content,
      score: r.score,
      documentId: r.documentId,
      documentName: r.documentName,
    }))
    return { results, count: results.length }
  },
}

// ==================== wf_image_gen（write + 需批准；图像生成，与 image-gen 节点同链） ====================

const ImageGenInput = z.object({
  prompt: z.string().describe('图像生成提示词'),
  negativePrompt: z.string().optional().describe('负向提示词'),
  width: z.number().int().positive().optional().describe('宽度 px'),
  height: z.number().int().positive().optional().describe('高度 px'),
  count: z.number().int().min(1).max(4).optional().describe('生成张数'),
  modelId: z.string().describe('图像模型 id（必填——图像服务无默认模型机制，与 image-gen 节点同约束）'),
})

const imageGenTool: AgentToolDef<z.infer<typeof ImageGenInput>> = {
  name: 'wf_image_gen',
  description: '调用图像生成服务产出图片（产生费用与副作用），返回图片 URL/本地路径。需人工批准后执行。',
  inputSchema: ImageGenInput,
  dangerLevel: 'write',
  requiresApproval: true,
  execute: async (input) => {
    const resp = await ImageService.generateImage({
      model: input.modelId,
      prompt: input.prompt,
      ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
      width: input.width,
      height: input.height,
      ...(input.count ? { count: input.count } : {}),
    } as never)
    if (!resp.success) throw new Error(resp.error ?? '图像生成失败')
    // 异步 provider：images 空 + taskId 有值（与 image-gen 节点的 pollUntil 等价
    // 轮询为节点私有逻辑；工具场景如实返回状态并提示，review B14）
    const note = (!resp.images || resp.images.length === 0) && resp.taskId
      ? '该提供商为异步出图，结果未就绪；请改用 image-gen 工作流节点（自带轮询）或稍后重试'
      : undefined
    return { taskId: resp.taskId, images: resp.images, ...(note ? { note } : {}) }
  },
}

// ==================== wf_tts（write + 需批准；语音合成，与 tts 节点同链） ====================

const TtsInput = z.object({
  text: z.string().describe('合成文本'),
  voiceId: z.string().describe('音色 id'),
  speed: z.number().min(0.5).max(2).optional().describe('语速（0.5-2，缺省 1）'),
})

const ttsTool: AgentToolDef<z.infer<typeof TtsInput>> = {
  name: 'wf_tts',
  description: '把文本合成为语音文件（产生费用与副作用），返回音频路径与时长。需人工批准后执行。',
  inputSchema: TtsInput,
  dangerLevel: 'write',
  requiresApproval: true,
  execute: async (input) => {
    const resp = await VoiceService.generateSpeech({
      text: input.text,
      voiceId: input.voiceId,
      ...(input.speed !== undefined ? { speed: input.speed } : {}),
    } as never)
    if (!resp.success || !resp.data) throw new Error(resp.error ?? '语音合成失败')
    const data = resp.data as { audioPath?: string; duration?: number }
    return { audioPath: data.audioPath, durationMs: data.duration }
  },
}

// ==================== 注册 ====================

/** 首批节点工具（workflow-boot 装配注册，source='node'） */
export const NODE_TOOL_EXPORTS = [
  webExtractTool,
  translateTool,
  kbRetrieveTool,
  imageGenTool,
  ttsTool,
] as const

export function registerNodeAgentTools(registry: AgentToolRegistry): void {
  for (const tool of NODE_TOOL_EXPORTS) {
    try {
      // as AgentToolDef：注册表泛型入口只收 unknown 形态（运行时以 zod 校验收口）
      registry.register(tool as AgentToolDef, { source: 'node' })
    } catch (e) {
      // 单工具注册失败不整体炸掉 harness（review B13：曾直达 boot 大 catch，
      // 其后的 ProviderAdapter/harness 注册全部跳过——agent-loop 节点整体不可用）
      console.warn(`[node-tool-adapter] 节点工具 ${tool.name} 注册失败（跳过）：${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
