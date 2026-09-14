/**
 * A2 组件：kb-qa（RAG 一体）+ report（markdown/docx 报告）
 * @module core/platform/workflow/nodes/a2-nodes
 * @description kb-qa：检索+拼接 context+LLM 生成一个节点完成（对标 Bisheng 文档知识库问答）；
 *              report：模板渲染 → markdown 直出 / docx 落盘（PDF 走前端导出——spec R1/P3）。
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { KnowledgeBaseService } from '../../services/knowledge-base.service'
import { augmentWithDialogFiles, mergeRetrievalResults, effectiveTopK } from './dialog-file-retriever'
import { callAIStream } from '../../services/ai-call'
import { getDocumentTools } from '../../services/document-tools/document-tools'
import { knowledgeQaDirectMinScore } from '@shared/utils/knowledge-params'
import { DOCUMENT_TEMPLATES } from '../../services/document-tools/templates'
import { getPathProvider } from '../../../interfaces/path.interface'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'

/** 默认 RAG 系统提示词（用户可覆盖） */
const DEFAULT_KB_QA_SYSTEM_PROMPT = `你是知识库问答助手。仅依据下面的参考资料回答用户问题；资料中没有的内容请如实说明未找到，不要编造。`

/**
 * 检索上下文拼接：逐条 [文档名] + 章节路径/摘要（M3）+ 内容，整体按 maxChars 截断
 * （整条丢弃不切半）。
 */
function buildKbContext(
  results: Array<{ documentName: string; content: string; chapterPath?: string[]; chapterSummary?: string }>,
  maxChars: number,
): string {
  if (results.length === 0) return '（未检索到相关内容）'
  const parts: string[] = []
  let total = 0
  for (const r of results) {
    const header = [`[${r.documentName}]`]
    // M3：章节上下文——让命中片段在「出自哪一章、该章讲什么」的语境中被理解
    if (r.chapterPath && r.chapterPath.length > 0) header.push(`章节: ${r.chapterPath.join(' › ')}`)
    if (r.chapterSummary) header.push(`章节摘要: ${r.chapterSummary}`)
    const part = `${header.join('\n')}\n${r.content}`
    if (total + part.length > maxChars) break // 超限整条丢弃
    parts.push(part)
    total += part.length
  }
  return parts.length > 0 ? parts.join('\n\n') : '（检索结果超出长度限制被截断）'
}

// ==================== kb-qa 知识库问答 ====================

const kbQaNode: WorkflowNodeHandler = {
  type: 'kb-qa',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'answer', type: 'string', desc: '基于知识库的回答' },
    { key: 'sources', type: 'json', desc: '引用来源 [{documentName, score}]' },
  ],
  validateConfig(config) {
    const cfg = config as { knowledgeBaseId?: string; question?: string }
    const errors: string[] = []
    if (!cfg.knowledgeBaseId) errors.push('必须选择知识库')
    if (stringifyValue(cfg.question).trim() === '') errors.push('问题不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      knowledgeBaseId: string
      question: string
      systemPrompt?: string
      topK?: number
      threshold?: number
      resultMaxLength?: number
      providerConfigId?: string
      modelId?: string
      temperature?: number
      includeDialogFiles?: boolean
      useRerank?: boolean
      vectorWeight?: number
    }
    // 0. D1 QA 直出路径：命中标准问答对 → 答案直出（不过 LLM）；未命中 → 走 RAG
    //    （searchQa 内部对无 QA 对的知识库快速返回，无额外嵌入开销）
    const qaResp = await new KnowledgeBaseService().searchQa({
      knowledgeBaseId: cfg.knowledgeBaseId,
      query: stringifyValue(cfg.question),
      topK: 1,
      // 直出阈值更严（跳过 LLM 的答案不容含糊）：复用 threshold 覆盖，
      // 缺省走「参数设置 → 知识库 → 检索 → QA 直出最低相似度」（改造前固定 0.75）
      // M5b：直出阈值与 RAG threshold 解耦（放宽 RAG 不应连带放宽直出）
      threshold: knowledgeQaDirectMinScore(),
      signal: ctx.signal,
    })
    if (qaResp.success && qaResp.data && qaResp.data.length > 0) {
      const hit = qaResp.data[0]
      ctx.emitProgress(100, 'QA 直出')
      return {
        status: 'succeeded',
        output: {
          answer: hit.answer,
          sources: [{ documentName: hit.question, score: hit.score, source: 'qa' }],
        },
      }
    }

    // 1. 检索（signal 透传——HTTP 级取消）
    const service = new KnowledgeBaseService()
    const searchResp = await service.search({
      knowledgeBaseId: cfg.knowledgeBaseId,
      query: stringifyValue(cfg.question),
      topK: cfg.topK,
      threshold: cfg.threshold,
      useRerank: cfg.useRerank,
      vectorWeight: cfg.vectorWeight,
      signal: ctx.signal,
    })
    if (!searchResp.success) {
      return { status: 'failed', error: `知识库检索失败: ${searchResp.error ?? '未知错误'}` }
    }
    const results = searchResp.data ?? []
    // C4：追加对话附件命中（与 KB 结果同形状合并入 context 与 sources）
    const topK = effectiveTopK(cfg.topK)
    const dialogHits = await augmentWithDialogFiles(ctx, cfg.includeDialogFiles, stringifyValue(cfg.question), topK)
    ctx.emitProgress(30, `检索到 ${results.length + dialogHits.length} 条`)

    // 2. 拼接 context（P4：默认走 WORKFLOW_DEFAULTS.kbQaContextMaxChars）
    const maxChars = cfg.resultMaxLength && cfg.resultMaxLength > 0
      ? cfg.resultMaxLength
      : workflowRuntimeParams().polling.kbQaContextMaxChars
    // F1：dialog 命中优先入 context（maxChars 截断"超限整条丢弃"不再系统性牺牲附件命中）
    const context = buildKbContext(mergeRetrievalResults(results, dialogHits, topK), maxChars)
    const systemPrompt = `${cfg.systemPrompt?.trim() || DEFAULT_KB_QA_SYSTEM_PROMPT}\n\n===== 参考资料 =====\n${context}`

    // 3. 生成（signal + 进度）
    const { content } = await callAIStream({
      prompt: stringifyValue(cfg.question),
      systemPrompt,
      providerConfigId: cfg.providerConfigId,
      modelId: cfg.modelId,
      temperature: cfg.temperature,
      signal: ctx.signal,
      onDelta: d => ctx.emitProgress(-1, d.slice(-30)),
    })
    ctx.emitProgress(100)

    return {
      status: 'succeeded',
      output: {
        answer: content,
        sources: [
          ...results.map(r => ({ documentName: r.documentName, score: r.score })),
          ...dialogHits.map(h => ({ documentName: h.documentName, score: h.score })),
        ],
      },
    }
  },
}

// ==================== report 报告 ====================

const reportNode: WorkflowNodeHandler = {
  type: 'report',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'markdown', type: 'string', desc: '渲染后的 markdown 全文' },
    { key: 'format', type: 'string', desc: 'markdown / docx' },
    { key: 'filePath', type: 'string', desc: 'docx 落盘路径（桌面端）' },
    { key: 'title', type: 'string', desc: '报告标题/文件名' },
  ],
  validateConfig(config) {
    const cfg = config as { template?: string; format?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.template).trim() === '') errors.push('模板内容不能为空')
    if (cfg.format && !['markdown', 'docx'].includes(cfg.format)) errors.push('format 只能是 markdown 或 docx')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      title: string
      template: string
      format: 'markdown' | 'docx'
    }
    // 模板已由引擎深解析（多占位拼接为字符串）——但模板字段是"模板文本"语义，
    // 经 read-asset 间接引入的模板资产内容中的 {{}} 占位在此渲染（与 report-image 同纪律）
    const markdown = ctx.resolveTemplate<string>(stringifyValue(cfg.template))
    const title = stringifyValue(cfg.title) || '报告'
    const output: Record<string, unknown> = { markdown, format: cfg.format ?? 'markdown', title }

    if (cfg.format === 'docx') {
      // 文档工具层（唯一实现）：Web 端无平台渲染器时 docx 仍可产出（core 纯能力）
      const rendered = await getDocumentTools().renderDocx({ markdown, title })
      const dir = join(getPathProvider().getDataPath(), 'workflow-reports')
      mkdirSync(dir, { recursive: true })
      const safeId = `${ctx.runId}_${ctx.nodeId}`.replace(/[^\w.-]/g, '_')
      const filePath = join(dir, `${safeId}.docx`)
      writeFileSync(filePath, rendered.buffer)
      output.filePath = filePath
      ctx.logger.info('报告已生成', { filePath })
    }
    return { status: 'succeeded', output }
  },
}

// ==================== report-image 长图报告（文档工具层消费方） ====================

const reportImageNode: WorkflowNodeHandler = {
  type: 'report-image',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'markdown', type: 'string', desc: '渲染前的 markdown 全文' },
    { key: 'format', type: 'string', desc: 'image（桌面端）/ html（Web 端降级）' },
    { key: 'filePath', type: 'string', desc: 'PNG 长图落盘路径（桌面端）' },
    { key: 'html', type: 'string', desc: '完整排版 HTML（Web 端/预览/打印兜底）' },
    { key: 'title', type: 'string', desc: '报告标题' },
  ],
  validateConfig(config) {
    const cfg = config as { template?: string; templateId?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.template).trim() === '') errors.push('模板内容不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { title: string; template: string; templateId?: string; width?: number }
    // template 字段是"模板文本"语义：可能经 read-asset 等间接引入（如模板资产内容），
    // 其中的 {{start.xx}} / {{gen1.xx}} 占位需在此渲染（引擎深解析只处理 config 直接引用的模板；
    // 直接写在 config 里的模板已被解析为实值，此处无 {{}} 则原样返回）
    const markdown = ctx.resolveTemplate<string>(stringifyValue(cfg.template))
    const title = stringifyValue(cfg.title) || '长图报告'
    // 排版模板：按 templateId 选择（早报/周报/通用版式），未知 id 回退通用文档
    const layout = DOCUMENT_TEMPLATES[cfg.templateId ?? ''] ?? DOCUMENT_TEMPLATES.generic
    const rendered = await getDocumentTools().renderImage({
      markdown,
      title,
      template: layout,
    })
    const output: Record<string, unknown> = {
      markdown,
      format: rendered.format,
      // html 仅作预览/打印兜底（正文以 markdown 为准）：上限 1M 防 node_run 膨胀
      html: rendered.html.slice(0, 1_000_000),
      title,
    }
    if (rendered.format === 'image') {
      const dir = join(getPathProvider().getDataPath(), 'workflow-reports')
      mkdirSync(dir, { recursive: true })
      const safeId = `${ctx.runId}_${ctx.nodeId}${ctx.iterationIndex > 0 ? `_i${ctx.iterationIndex}` : ''}`.replace(/[^\w.-]/g, '_')
      const filePath = join(dir, `${safeId}.png`)
      writeFileSync(filePath, rendered.buffer)
      output.filePath = filePath
      ctx.logger.info('长图已生成', { filePath })
    } else {
      ctx.logger.warn('当前端无长图渲染能力，已产出排版 HTML（前端可打印/截图）')
    }
    return { status: 'succeeded', output }
  },
}

export const A2_NODE_HANDLERS: WorkflowNodeHandler[] = [kbQaNode, reportNode, reportImageNode]
