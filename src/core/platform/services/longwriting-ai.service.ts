/**
 * 长文写作 AI 服务
 * @module platform/services/longwriting-ai.service
 * @description 处理长文写作模块的 AI 生成功能
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type {
  ChapterContextItem,
  ChapterContextResult,
  ChapterPromptParts,
} from './longwriting/chapter-context'
import { composeChapterPrompt, estimateContextTokens, trimChapterPartsToBudget, buildChapterSegmentSection, CHAPTER_SEGMENT_THRESHOLD_WORDS, CHAPTER_SEGMENT_TARGET_WORDS, CHAPTER_SEGMENT_MAX_COUNT } from './longwriting/chapter-context'
import { buildStateSummaryChainContext } from './longwriting/state-summary-context'
import { scanExcerptConflicts, type ExcerptCharacterInfo } from './longwriting/excerpt-review'
import { applyChapterQualityGate } from './longwriting/chapter-quality-gate'
import { buildChapterCardMarkdown, parseCardHookType, validateChapterCard, type ChapterCardData } from './longwriting/chapter-card'
import { buildChapterCardDesignSystemPrompt, CHAPTER_CARD_REVIEW_SYSTEM_PROMPT, buildChapterCardReviewPrompt } from '@core/packs/longwriting/skills/chapter-writing'
import { assessBibleReadiness, buildBibleGateError, buildCastRosterConstraint } from './longwriting/bible-readiness-gate'
import { ConsistencyService } from './longwriting/graph/consistency.service'
import { buildConflictGateError, conflictChapters } from './longwriting/conflict-gate'
import {
  buildNovelChapterDiscipline,
  buildScriptChapterDiscipline,
  buildScriptOutlineSystemPrompt,
  enrichScriptEpisodeSummary,
  resolveContentTarget,
} from './writing-methodology'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { createProvider } from '@core/platform/providers/llm'
import type { ChatOptions } from '@core/platform/providers/llm/base-provider'
import { callAIStreamWithBrain, type BrainGenerationDeps } from './longwriting/brain-generation'
import { parseJsonPayload, extractArrayField } from './longwriting/json-payload'
import type { ProviderAdapter } from '@core/platform/agent-runtime/provider/provider-adapter'
import { PROVIDER_TEMPLATES, isApiKeyOptional } from '@core/platform/services/provider-template.service'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import type { ProviderTemplate, UserProviderConfig, ChatContext } from '@shared/types'
import { longwritingParams } from '@shared/utils/longwriting-params'
import { createLogger } from '@core/utils/logger'
import { AsyncLocalStorage } from 'node:async_hooks'

const logger = createLogger('longwriting-ai')

/** W3.2 用量上下文：高层生成方法用 enterWith 挂载，callAI/callAIStream 记账时读取。
 *  每个 IPC 调用链有独立异步上下文，并行章节互不串扰；未挂载（其余入口）不记行。 */
const usageContextStorage = new AsyncLocalStorage<{ projectId: string; purpose: string; chapterId?: string }>()

/** W1.3：生成失败自动重试次数（指数退避 1s/2s）。取消与 4xx 客户端错误不重试。 */
const AI_RETRY_COUNT = 2

/** W1.3：可重试错误判定——「已取消」与 4xx（鉴权/参数类，重试必败）直接排除（导出供单测） */
export function isRetryableAiError(e: unknown): boolean {
  const msg = String((e as any)?.message || e || '')
  if (msg.includes('已取消')) return false
  const status = (e as any)?.status ?? (e as any)?.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500) return false
  if (/\b(400|401|403|404)\b/.test(msg) || /api key|unauthorized|forbidden|invalid request|invalid argument|bad request/i.test(msg)) return false
  return true
}

/** W3.2：token 粗估（UTF-8 字节/4，与章节工作台同口径）——provider 未返回 usage 时记账用 */
function estimateTokensFromText(text: string): number {
  if (!text) return 0
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4)
}

/**
 * 生成任务类型
 */
export type GenerationTask =
  | 'story-overview'    // 故事概要
  | 'plots'             // 故事情节
  | 'characters'        // 角色建议
  | 'skills-items'      // 技能物品
  | 'outline-story'     // 故事大纲
  | 'outline-comment'   // 评论大纲
  | 'chapter'           // 章节内容
  | 'section'           // 段落内容
  | 'polish-background' // 润色背景

/**
 * 生成请求参数
 */
export interface GenerateRequest {
  task: GenerationTask
  projectId: string
  prompt?: string
  targetWords?: number
  context?: Record<string, any>
}

/**
 * 生成响应
 */
export interface GenerateResponse {
  success: boolean
  data?: any
  error?: string
}

/**
 * 流式生成事件
 */
export interface GenerationStreamEvent {
  type: 'start' | 'content' | 'done' | 'error' | 'progress'
  content?: string
  data?: any
  error?: string
}

/**
 * 长文写作 AI 服务
 */
export class LongWritingAIService {
  private static instance: LongWritingAIService

  /** 生成中的 AbortController 表（cancelGeneration 中断流式） */
  private readonly abortControllers = new Map<string, AbortController>()

  /** 回忆/闪回语义关键词（buildRecallSection 用） */
  private readonly recallKeywords = ['回忆', '闪回', '回想', '往事', '记忆深处']

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): LongWritingAIService {
    if (!LongWritingAIService.instance) {
      LongWritingAIService.instance = new LongWritingAIService()
    }
    return LongWritingAIService.instance
  }

  /**
   * 公共一次性文本生成（卷设计流 W2 的 pass 调用入口；2026-09-16 M1）。
   * 与抽取器同走 callAIStream（进度事件/取消/超时语义一致），只是暴露为公共方法
   * 供工作流节点注入 VolumeDesignLlm。
   */
  async generateDesignPassText(
    eventId: string,
    prompt: string,
    systemPrompt: string,
    maxTokens: number,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<string> {
    return this.callAIStream(eventId, prompt, systemPrompt, maxTokens, providerConfigId, modelId)
  }

  /**
   * 取消指定 eventId 的生成（中断流式请求；非流式为竞态丢弃）
   */
  cancelGeneration(eventId: string): void {
    const ctrl = this.abortControllers.get(eventId)
    if (ctrl) ctrl.abort()
  }

  /**
   * 取消某项目名下全部进行中的 AI 生成（评审 #43：打断不再只打断总结——
   * 决策/动作/总结的 eventId 均含 `-{projectId}-` 片段，统一按此匹配 abort）
   * @returns 取消的调用数
   */
  cancelAllForProject(projectId: string): number {
    let n = 0
    for (const [eventId, ctrl] of this.abortControllers) {
      if (eventId.includes(`-${projectId}-`)) {
        ctrl.abort()
        n++
      }
    }
    return n
  }

  // ==================== Agent 对话基础能力（对话式工作流） ====================

  /**
   * Agent 决策调用：非流式短输出（AI 返回 JSON：reply + actions）。
   * maxTokens 1280：决策 JSON 短小，防止长输出拖慢。
   */
  async agentDecide(
    context: { systemPrompt: string; userPrompt: string },
    providerConfigId?: string,
    modelId?: string,
    eventId?: string
  ): Promise<string> {
    return this.callAI(context.userPrompt, context.systemPrompt, 1280, providerConfigId, modelId, eventId)
  }

  /**
   * Agent 总结调用：流式输出（正文经 longwriting:generate:${eventId} 推送，返回全文）。
   */
  async agentSummarize(
    eventId: string,
    context: { systemPrompt: string; userPrompt: string },
    providerConfigId?: string,
    modelId?: string,
  ): Promise<string> {
    return this.callAIStream(eventId, context.userPrompt, context.systemPrompt, 2048, providerConfigId, modelId)
  }

  /**
   * 获取提供商配置
   */
  private async getProviderConfig(providerConfigId?: string): Promise<{
    config: UserProviderConfig
    template: ProviderTemplate
    apiKey: string
  } | null> {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.providerConfigs) {
      return null
    }

    let config: UserProviderConfig | null = null

    // 如果指定了提供商配置 ID，优先使用
    if (providerConfigId) {
      config = await dbManager.providerConfigs.getById(providerConfigId)
    }

    // 如果没有指定或找不到，尝试获取默认提供商
    if (!config) {
      config = await dbManager.providerConfigs.getDefault()
    }

    // 如果没有默认，获取第一个启用的
    if (!config) {
      const enabledConfigs = await dbManager.providerConfigs.getEnabled()
      if (enabledConfigs.length > 0) {
        config = enabledConfigs[0]
      }
    }

    // 获取模板（空密钥挡板需要模板判定免密钥提供商，故先于挡板解析）
    const template = config ? PROVIDER_TEMPLATES.find(t => t.id === config.templateId) : undefined
    if (!config || !template) {
      return null
    }

    // 空密钥挡板：免密钥提供商（如 llama.cpp 本地推理）允许不配置密钥
    if (!config.apiKey && !isApiKeyOptional(template)) {
      return null
    }

    // 解密 API 密钥（免密钥提供商可无密钥，置空串）
    const secureStorage = getSecureStorage()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const apiKey = config.apiKey ? secureStorage.decrypt(config.apiKey) : ''

    return { config, template, apiKey }
  }

  /**
   * W3.2 用量记账（fail-soft）：挂在用量上下文的调用链才记账（章法卡/正文等高层入口）。
   * provider 返回 usage 用原子数据；否则估算（UTF-8 字节/4）并置 is_estimated。
   */
  private async recordTokenUsage(params: {
    prompt: string
    completion?: string
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    providerConfigId?: string
    modelId?: string
    durationMs: number
  }): Promise<void> {
    try {
      const ctx = usageContextStorage.getStore()
      if (!ctx) return
      const db = getCoreDatabaseManager()
      if (!db.lwTokenUsages) return
      const isEstimated = !params.usage
      const promptTokens = params.usage?.promptTokens ?? estimateTokensFromText(params.prompt)
      const completionTokens = params.usage?.completionTokens ?? estimateTokensFromText(params.completion || '')
      const totalTokens = params.usage?.totalTokens ?? promptTokens + completionTokens
      await db.lwTokenUsages.create({
        projectId: ctx.projectId,
        chapterId: ctx.chapterId ?? null,
        purpose: ctx.purpose,
        providerConfigId: params.providerConfigId ?? null,
        modelId: params.modelId ?? null,
        promptTokens,
        completionTokens,
        totalTokens,
        isEstimated,
        durationMs: params.durationMs,
      })
    } catch {
      // 计量绝不影响生成主链
    }
  }

  /**
   * 调用 AI 生成
   */
  private async callAI(
    prompt: string,
    systemPrompt?: string,
    maxTokens?: number,
    providerConfigId?: string,
    modelId?: string,
    eventId?: string,
    opts?: { responseFormat?: ChatOptions['responseFormat'] }
  ): Promise<string> {
    const providerInfo = await this.getProviderConfig(providerConfigId)
    if (!providerInfo) {
      throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
    }

    const { config, template, apiKey } = providerInfo

    // 确定使用的模型
    const effectiveModelId = modelId || config.models?.[0]?.id || ''

    // 创建 Provider 实例
    const provider = createProvider(
      template.id,
      {
        apiKey,
        baseUrl: config.baseUrl,
        defaultModel: effectiveModelId
      },
      template,
      config
    )

    // 构建消息上下文 - 使用 ChatContext 格式
    const context: ChatContext = {
      systemPrompt: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    }

    // 调用 AI（非流式）。评审 #43：传 eventId 时登记 AbortController，
    // 取消立即以「已取消」抛出（竞态丢弃后续结果，不等服务端返回）
    const controller = eventId ? new AbortController() : null
    if (eventId && controller) this.abortControllers.set(eventId, controller)
    try {
      const aborted = controller ? new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('已取消')), { once: true })
      }) : null
      // W1.3：网络抖动/限流指数退避重试（取消与 4xx 不重试）
      const startedAt = Date.now()
      for (let attempt = 0; ; attempt++) {
        try {
          const syncPromise = provider.chatSync(context, opts?.responseFormat ? { responseFormat: opts.responseFormat } : undefined)
          const result = aborted
            ? await Promise.race([syncPromise, aborted])
            : await syncPromise
          // W3.2 用量记账（fail-soft，不阻塞返回）
          void this.recordTokenUsage({
            prompt,
            completion: result.content || '',
            usage: result.usage,
            providerConfigId,
            modelId,
            durationMs: Date.now() - startedAt,
          })
          return result.content || ''
        } catch (e) {
          if (attempt >= AI_RETRY_COUNT || !isRetryableAiError(e) || controller?.signal.aborted) throw e
          const delayMs = 1000 * 2 ** attempt
          logger.warn(`[longwriting] AI 调用失败（第 ${attempt + 1} 次），${delayMs}ms 后重试：${(e as any)?.message || e}`)
          await new Promise((r) => setTimeout(r, delayMs))
        }
      }
    } finally {
      if (eventId) this.abortControllers.delete(eventId)
    }
  }

  /**
   * 流式调用 AI 生成
   */
  private async callAIStream(
        eventId: string,
    prompt: string,
    systemPrompt?: string,
    maxTokens?: number,
    providerConfigId?: string,
    modelId?: string,
    opts?: { responseFormat?: ChatOptions['responseFormat'] }
  ): Promise<string> {
    const providerInfo = await this.getProviderConfig(providerConfigId)
    if (!providerInfo) {
      throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
    }

    const { config, template, apiKey } = providerInfo

    // 确定使用的模型：优先使用传入的 modelId，其次使用配置中的默认模型
    const effectiveModelId = modelId || config.models?.[0]?.id || ''

    // 创建 Provider 实例
    const provider = createProvider(
      template.id,
      {
        apiKey,
        baseUrl: config.baseUrl,
        defaultModel: effectiveModelId
      },
      template,
      config
    )

    // 构建消息上下文 - 使用 ChatContext 格式
    const context: ChatContext = {
      systemPrompt: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    }

    // 发送开始事件
    getEventEmitter().emit(`longwriting:generate:${eventId}`, {
      type: 'start'
    } as GenerationStreamEvent)

    // 取消支持：eventId → AbortController（cancelGeneration 触发 abort）
    const controller = new AbortController()
    this.abortControllers.set(eventId, controller)

    // 流式调用 AI
    let fullContent = ''
    // W1.3 重试防重：一旦向事件流产出过 delta 就不再重试——重试会让前端重复拼接
    let emittedAnyDelta = false
    const startedAt = Date.now()
    try {
      for (let attempt = 0; ; attempt++) {
        if (controller.signal.aborted) throw new Error('已取消')
        fullContent = ''
        try {
          const streamResp = await provider.chatStream(
            context,
            (event) => {
              // Provider 发送 delta 事件，转换为 content 事件发送给前端
              if (event.type === 'delta' && event.content) {
                emittedAnyDelta = true
                fullContent += event.content
                getEventEmitter().emit(`longwriting:generate:${eventId}`, {
                  type: 'content',
                  content: event.content
                } as GenerationStreamEvent)
              }
            },
            controller.signal,
            // max_tokens 兜底：优先调用方传入，其次读模型定义的 maxOutputTokens，最后 8192。
            // 原写死 4096 会在长 JSON 生成时被截断。
            {
              maxTokens: maxTokens || config.models?.find(m => m.id === effectiveModelId)?.maxOutputTokens || 8192,
              // 结构化输出约束（解码层 JSON 模式）：Anthropic 等不支持的端点由 provider 侧降级忽略
              ...(opts?.responseFormat ? { responseFormat: opts.responseFormat } : {})
            }
          )
          // W3.2 用量记账（fail-soft）：provider 流式返回带 usage 用原子数据，否则估算
          void this.recordTokenUsage({
            prompt,
            completion: fullContent,
            usage: (streamResp as any)?.usage ?? undefined,
            providerConfigId,
            modelId,
            durationMs: Date.now() - startedAt,
          })
          break
        } catch (e) {
          if (
            attempt >= AI_RETRY_COUNT ||
            !isRetryableAiError(e) ||
            emittedAnyDelta ||
            controller.signal.aborted
          ) throw e
          const delayMs = 1000 * 2 ** attempt
          logger.warn(`[longwriting] 流式生成失败（第 ${attempt + 1} 次，未产出内容），${delayMs}ms 后重试：${(e as any)?.message || e}`)
          getEventEmitter().emit(`longwriting:generate:${eventId}`, {
            type: 'progress',
            content: `连接中断，正在重试（第 ${attempt + 1} 次）…`
          } as GenerationStreamEvent)
          await new Promise((r) => setTimeout(r, delayMs))
        }
      }

      // 发送完成事件
      getEventEmitter().emit(`longwriting:generate:${eventId}`, {
        type: 'done',
        content: fullContent
      } as GenerationStreamEvent)
    } catch (error: any) {
      // 发送错误事件
      getEventEmitter().emit(`longwriting:generate:${eventId}`, {
        type: 'error',
        error: error.message || 'AI 生成失败'
      } as GenerationStreamEvent)
      throw error
    } finally {
      this.abortControllers.delete(eventId)
    }

    return fullContent
  }

  // ==================== 大脑工具位生成（拉取式，见 brain-generation） ====================

  /** ProviderAdapter 惰性单例（与工作流 agent 同源模型解析；动态 import 延迟绑定） */
  private brainAdapterLoader: Promise<ProviderAdapter> | null = null

  /** 大脑工具位生成依赖：回退=callAIStream 原链路；事件走同一 emitter 通道 */
  private getBrainGenerationDeps(): BrainGenerationDeps {
    return {
      resolveModel: async (opts) => {
        this.brainAdapterLoader ??= import('@core/platform/agent-runtime/provider/provider-adapter').then(
          (m) => new m.ProviderAdapter(),
        )
        return (await this.brainAdapterLoader).resolveModel(opts)
      },
      fallback: (eventId, prompt, systemPrompt, maxTokens, providerConfigId, modelId) =>
        this.callAIStream(eventId, prompt, systemPrompt, maxTokens, providerConfigId, modelId),
      emit: (eventId, ev) => getEventEmitter().emit(`longwriting:generate:${eventId}`, ev),
    }
  }

  /** 章法创作调用（设计卡/正文）统一入口：模型可自主检索大脑，失败回退原链路 */
  private async generateWithBrainTool(
    eventId: string,
    prompt: string,
    systemPrompt?: string,
    maxTokens?: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<string> {
    const controller = new AbortController()
    this.abortControllers.set(eventId, controller)
    try {
      return await callAIStreamWithBrain(
        eventId,
        prompt,
        systemPrompt,
        maxTokens,
        providerConfigId,
        modelId,
        this.getBrainGenerationDeps(),
        controller.signal
      )
    } finally {
      this.abortControllers.delete(eventId)
    }
  }

  // ==================== 故事概要生成 ====================

  /**
   * 生成故事概要
   */
  async generateStoryOverview(
        eventId: string,
    projectId: string,
    input: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取项目信息
    const project = await dbManager.lwProjects?.getById(projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请根据用户的想法，生成一个完整的故事概要。

概要是整部作品的宪法与总纲：后续每一章的角色言行、情节走向、节奏与风格都以它为唯一准绳。一份合格的概要必须让读者看完就知道"这是一个关于什么的故事、主角如何成长、最终走向哪里"，并且让写作者能直接从中推导出：每章该写什么、角色为什么会这样行动、全书用什么笔触去写。

你必须返回一个完整的 JSON 对象，包含以下所有字段（一个都不能少）：
- title: 故事标题
- storyType: 故事类型（wuxia/xianxia/xuanhuan/kehuan/xuanyi/dushi/yanqing/lishi/other）
- summary: 核心故事概要（400-600字，一条完整主线，质量标准见下）
- styleTone: 风格基调与写作指导（100-200字：叙事视角、节奏、情绪底色、爽点类型、语言质感，以及对后续写作的硬性指导——如"第三人称限知视角，贴着程野写，信息只给他看过的"；禁止空泛形容词堆砌）
- coreConflict: 核心冲突（150-300字：主角想要什么/谁或什么在阻碍/失败的赌注是什么）
- keyCharacters: 关键角色数组（必须包含主角、重要配角、反派等关键人物，不能为空数组！）
- keyLocations: 主要场景数组（必须包含故事发生的主要地点，不能为空数组！）
- estimatedChapters: 预估章节数

**summary 的质量标准（结果导向，结构由你设计）**：
不同题材有不同的主线套路——升级流、复仇昭雪、解谜揭盖、生存经营、情感羁绊、群像权谋等，骨架各不相同。不要套用任何固定模板：先判断这个故事属于哪类叙事，再为它设计最合适的主线骨架。无论哪种骨架，结果上必须做到：
1. 一条完整主线：从主角的具体起点走到明确的终局，中间的波折与转折真实可感（"什么事件让他失去了什么/看清了什么"），而不是形容词堆砌
2. 紧扣主角命运：全程写"这个人身上发生了什么"，禁止写成世界观介绍或背景说明
3. 起点、欲望、阻碍三者具体化：用事实与处境说话（"生母被害的庶女"而非"可怜的女孩"）
4. 终局方向明确：读者能想象出最后一章的画面
5. 可执行性：主线上每个关键转折都能回答"这一步逼主角做了什么选择/付出什么代价"——后续每章写作都要能从概要里找到自己的位置；凡是概要承诺过的转折，正文必须兑现

**高质量概要示范（拆解它为什么好，禁止照抄设定）**：
"十二年前，大梁最强盛的赤焰军以谋反罪名被剿，七万将士葬身梅岭，唯有少帅林殊生还——身中火寒之毒、容貌尽改。他化名梅长苏，以'琅琊榜首、江左梅郎'之名重返帝都，以病弱之躯搅动朝局。他要拨开重重迷雾、智博奸佞，为七万冤魂昭雪，辅佐靖王重整山河——而这每一步，都在把他拖回那个他最不愿面对的真相。"
好在哪里：起点是具体事件（蒙冤剿杀+毁容）；欲望具体（昭雪）；阻碍制度化（帝都朝局）；转机与代价绑定（每一步复仇都在逼近真相）；终局有画面（昭雪+重整山河）。

**关于角色生成**：
- 必须包含：主角、重要配角、反派/对立角色；反派是推动剧情的关键，不能缺席
- 每个角色必须包含：name(姓名), role(主角/配角/反派/中立), brief(80-150字：身份+欲望+与主线的纠缠，禁止一句话带过), importance(main/secondary/minor)
- 每个场景必须包含：name(名称), type(类型), brief(80-150字：地点+在故事中的功能+氛围), importance(main/secondary/minor)

**JSON 格式示例**：
{
  "title": "暗线追凶",
  "storyType": "other",
  "summary": "（按质量标准写足400-600字的完整主线）",
  "styleTone": "第三人称限知视角，冷峻克制，双线叙事，真相反转的智性爽感",
  "coreConflict": "（主角想要什么/谁在阻碍/失败的赌注）",
  "keyCharacters": [
    {"name": "林锋", "role": "主角", "brief": "前警员，因坚持调查真相被迫离职，六年后重启调查", "importance": "main"},
    {"name": "陈雪", "role": "配角", "brief": "警局法医，暗中协助林锋，提供关键证据分析", "importance": "secondary"},
    {"name": "老局长", "role": "反派", "brief": "警局高层，暗中操控案件，是六年前的真凶", "importance": "main"}
  ],
  "keyLocations": [
    {"name": "0714案发现场", "type": "城市", "brief": "六年前的凶杀案发生地，遗留关键线索", "importance": "main"},
    {"name": "警局档案室", "type": "建筑", "brief": "存放旧案卷宗，林锋在此发现矛盾细节", "importance": "secondary"}
  ],
  "estimatedChapters": 24
}

请直接输出 JSON，不要有任何其他文字。`

    const prompt = `请根据以下想法，生成一个故事概要：

${input}

请严格按照 JSON 格式模板返回，确保所有字段都填写完整。`

    try {
      const result = await this.callAIStream(
        eventId,
        prompt,
        systemPrompt,
        undefined,
        providerConfigId,
        modelId
      )

      // 打印AI返回的原始内容
      // 复核修复 P2-4：此前 console.log 逐字打印 AI 返回全文与解析后的数据
      //（含用户私有创作正文），且 logger 会落盘 —— 违反 CLAUDE.md「敏感信息不能
      // 出现在日志中」，并造成日志体积膨胀。只保留长度与极小片头部用于排障。
      console.log('[LongWritingAIService] AI返回原始内容长度:', result.length)
      console.log('[LongWritingAIService] AI返回头部片段:', result.slice(0, 80))

      // 尝试解析 JSON
      try {
        // 先清理可能的多余内容
        let jsonStr = result.trim()

        // 移除可能的 markdown 代码块标记
        if (jsonStr.includes('```json')) {
          jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        } else if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```\s*/g, '')
        }

        // 找到第一个 { 和最后一个 } 的位置
        const firstBrace = jsonStr.indexOf('{')
        const lastBrace = jsonStr.lastIndexOf('}')

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonContent = jsonStr.substring(firstBrace, lastBrace + 1)
          // 同上：不打印正文，只留长度与字段概览
          console.log('[LongWritingAIService] 提取的JSON内容长度:', jsonContent.length)
          const data = JSON.parse(jsonContent)
          console.log(
            '[LongWritingAIService] 解析成功, 顶层字段:',
            data && typeof data === 'object' ? Object.keys(data).join(',') : typeof data,
          )
          return { success: true, data }
        }

        // 如果找不到完整JSON，尝试正则匹配
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0])
          return { success: true, data }
        }

        // 如果无法解析为 JSON，返回原始文本
        return { success: true, data: { summary: result } }
      } catch (parseError: any) {
        console.error('[LongWritingAIService] JSON 解析失败:', parseError.message)
        // 解析失败，返回原始内容
        return { success: true, data: { summary: result, parseError: parseError.message } }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 角色建议生成 ====================

  /**
   * 生成角色建议
   */
  async generateCharacters(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string,
    requirements?: string  // 额外的角色要求
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，生成角色。

你必须返回 JSON 数组格式，每个角色必须严格按照以下顺序包含所有字段，不得遗漏任何字段：
1. name - 角色名称
2. gender - 性别（male/female/other）
3. age - 年龄
4. height - 身高(cm)
5. weight - 体重(kg)
6. race - 人种（asian/european/other）
7. occupation - 职业
8. position - 职务
9. rolePosition - 角色定位（protagonist/supporting/antagonist/minor）
10. appearance - 外貌描述（必须包含脸型、肤色描述）
11. background - 背景故事
12. personality - 性格特点
13. abilities - 能力特长
14. majorEvents - 角色在故事中的主要事件（这是必需字段，描述该角色参与的关键剧情）
15. relations - 该角色与其他角色的关系数组（可选，没有明确关系可留空数组）。每项：{"targetName": "对方角色名（必须是本项目角色名）", "relationType": "关系类型（师徒/宿敌/恋人/同门/主仆/父子/挚友/竞争对手等）", "description": "关系说明（20-40字）"}

示例返回格式：
[{"name":"张三","gender":"male","age":28,"height":175,"weight":70,"race":"asian","occupation":"剑客","position":"掌门弟子","rolePosition":"protagonist","appearance":"瓜子脸，小麦色皮肤，剑眉星目","background":"出身寒门，自幼被掌门收养","personality":"沉稳内敛，重情重义","abilities":"剑法高超，轻功卓越","majorEvents":"在门派大比中击败宿敌，揭开身世之谜","relations":[{"targetName":"李四","relationType":"师徒","description":"李四是张三的授业恩师"}]}]

请确保每个角色都包含全部必需字段（1-14），relations（第15项）按需填写。

**质量硬性要求（不达标即不合格，禁止一句话人设）**：
1. background（背景故事）：主要人物（主角/重要配角/反派）不少于 150 字，必须覆盖五层且每层具体化：出身处境（用事实说话）、核心欲望（他最想得到/改变什么）、最大障碍或代价、秘密或反差（藏着的与表面相反的东西）、说话方式与行为习惯（口头禅/语气特征/标志性小动作——后续每章对话都要靠它保持"这个人说话像他"）
2. majorEvents 必须写"该角色在主线中的关键节点"——做了什么、导致什么后果，与故事概要的核心冲突直接挂钩；禁止"参与了许多事件"式的空话
3. personality 要写出内在张力（如"善良但对背叛睚眦必报"），单一扁平标签（"善良""冷酷"）不合格
4. 反派必须有作恶的动机链（他要什么→为什么用这种方式→他的底气是什么），禁止为坏而坏`

    // 构建提示词上下文
    const storyTypeNames: Record<string, string> = {
      wuxia: '武侠', xianxia: '仙侠', xuanhuan: '玄幻', kehuan: '科幻',
      xuanyi: '悬疑', dushi: '都市', yanqing: '言情', lishi: '历史', other: '其他'
    }
    const storyTypeName = storyTypeNames[overview.storyType] || overview.storyType || '未指定'

    // 构建关键角色信息
    let keyCharactersInfo = ''
    if (overview.keyCharacters && overview.keyCharacters.length > 0) {
      keyCharactersInfo = overview.keyCharacters.map(c =>
        `${c.name}（${c.role}，${c.brief}）`
      ).join('、')
    }

    // 构建主要场景信息
    let keyLocationsInfo = ''
    if (overview.keyLocations && overview.keyLocations.length > 0) {
      keyLocationsInfo = overview.keyLocations.map(l =>
        `${l.name}（${l.brief}）`
      ).join('、')
    }

    // 构建基础提示词
    let prompt = `请根据以下故事概要，生成建议的角色：

故事标题：${overview.title || '未命名'}
故事类型：${storyTypeName}
核心构思：${overview.coreIdea || '未指定'}
故事摘要：${overview.summary || '未指定'}
核心冲突：${overview.coreConflict || '未指定'}
${keyCharactersInfo ? `关键角色：${keyCharactersInfo}` : ''}
${keyLocationsInfo ? `主要场景：${keyLocationsInfo}` : ''}`

    // 故事线（情节）注入：角色设计应与已确认的故事情节呼应
    const plots = await dbManager.lwPlots?.getByProjectId(projectId) || []
    if (plots.length > 0) {
      prompt += `

已确认的故事线（生成角色时请呼应这些情节）：
${plots.map(p => `- ${p.title}：${p.summary}`).join('\n')}`
    }

    // 已有角色注入：避免重复生成同名角色
    const existingCharacters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    if (existingCharacters.length > 0) {
      prompt += `

项目已有角色（请不要重复生成这些角色）：
${existingCharacters.map(c => `- ${c.name}（${c.rolePosition || '未定位'}）`).join('\n')}`
    }

    // 如果有额外要求，添加到提示词中
    if (requirements && requirements.trim()) {
      prompt += `

用户要求：${requirements.trim()}`
    }

    prompt += `

请返回 JSON 数组，确保每个角色都包含所有必需字段。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)
      console.log(`[LongWritingAI] generateCharacters 内容长度: ${result.length}`)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0])
          console.log(`[LongWritingAI] generateCharacters 解析成功, 角色数: ${Array.isArray(data) ? data.length : 0}`)
          return { success: true, data }
        } catch (parseError: any) {
          console.error(`[LongWritingAI] generateCharacters JSON 解析失败:`, parseError.message)
          // 即使服务端解析失败，前端也可能解析成功，所以返回原始内容
          return { success: true, data: result }
        }
      }

      console.log(`[LongWritingAI] generateCharacters 未找到 JSON 数组`)
      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      console.error(`[LongWritingAI] generateCharacters 错误:`, error)
      return { success: false, error: error.message }
    }
  }

  // ==================== 技能物品建议生成 ====================

  /**
   * 生成技能物品建议
   */
  async generateSkillsItems(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要和角色
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，生成建议的技能和物品。
你的回复应该是 JSON 对象格式，包含两个字段：
- skills: 技能数组，每个技能包含：name, type(martial/magic/ability/tech/other), level(beginner/intermediate/advanced/master), system, description
- items: 物品数组，每个物品包含：name, type(weapon/artifact/medicine/manual/token/other), level(common/rare/legendary/divine), description`

    const characterNames = characters.map(c => c.name).join('、')
    const prompt = `请根据以下故事概要，生成建议的技能体系和物品：

故事标题：${overview?.title || '未命名'}
故事类型：${overview?.storyType || '未指定'}
故事摘要：${overview?.summary || '未指定'}
已有角色：${characterNames || '暂无'}

请直接返回 JSON 对象格式的结果，包含 skills 和 items 两个字段。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 生成技能和物品类型配置
   */
  async generateSkillItemTypes(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const storyType = overview?.storyType || 'other'

    const systemPrompt = `你是一位专业的小说世界观设计师。请根据故事类型，生成适合的技能类型和物品类型配置。
你的回复必须是 JSON 对象格式，包含两个字段：
- skillTypes: 技能类型数组，每个类型包含 code（英文编码）和 name（中文名称）
- itemTypes: 物品类型数组，每个类型包含 code（英文编码）和 name（中文名称）

示例：
{
  "skillTypes": [
    {"code": "martial", "name": "武功"},
    {"code": "magic", "name": "法术"}
  ],
  "itemTypes": [
    {"code": "weapon", "name": "武器"},
    {"code": "artifact", "name": "神器"}
  ]
}

注意：code 使用英文小写，name 使用中文。每种类型生成3-6个即可。`

    const prompt = `故事标题：${overview?.title || '未命名'}
故事类型：${storyType}
故事摘要：${overview?.summary || '未指定'}

请根据故事类型和内容，生成适合的技能类型和物品类型配置。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 只生成技能建议
   */
  async generateSkillsOnly(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要、角色和已配置的技能类型
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const skillTypes = await dbManager.lwTypeConfig?.getSkillTypeConfigs(projectId) || []
    const skillLevelsMap: Record<string, any[]> = {}

    for (const type of skillTypes) {
      const levels = await dbManager.lwTypeConfig?.getSkillLevels(projectId, type.code) || []
      skillLevelsMap[type.code] = levels
    }

    const skillTypesInfo = skillTypes.map(t => {
      const levels = skillLevelsMap[t.code] || []
      return `${t.name}(${t.code}): 等级包括 ${levels.map(l => l.name).join('、') || '未配置'}`
    }).join('\n')

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要和现有配置，生成具体的技能设定。
你的回复必须是 JSON 对象格式，包含一个 skills 字段：
{
  "skills": [
    {
      "name": "技能名称",
      "type": "类型编码（使用已有类型）",
      "level": "等级编码（使用已有等级）",
      "system": "所属体系/门派",
      "description": "技能描述"
    }
  ]
}

注意：
1. type 和 level 必须使用已有配置中的编码
2. 生成5-10个技能即可
3. 每个技能要有独特的名称和描述`

    const characterNames = characters.map(c => c.name).join('、')
    const prompt = `故事标题：${overview?.title || '未命名'}
故事摘要：${overview?.summary || '未指定'}
已有角色：${characterNames || '暂无'}

已配置的技能类型：
${skillTypesInfo || '暂无配置'}

请生成适合的技能设定（只返回JSON）：`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 只生成物品建议
   */
  async generateItemsOnly(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要、角色和已配置的物品类型
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const itemTypes = await dbManager.lwTypeConfig?.getItemTypeConfigs(projectId) || []
    const itemLevelsMap: Record<string, any[]> = {}

    for (const type of itemTypes) {
      const levels = await dbManager.lwTypeConfig?.getItemLevels(projectId, type.code) || []
      itemLevelsMap[type.code] = levels
    }

    const itemTypesInfo = itemTypes.map(t => {
      const levels = itemLevelsMap[t.code] || []
      return `${t.name}(${t.code}): 等级包括 ${levels.map(l => l.name).join('、') || '未配置'}`
    }).join('\n')

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要和现有配置，生成具体的物品设定。
你的回复必须是 JSON 对象格式，包含一个 items 字段：
{
  "items": [
    {
      "name": "物品名称",
      "type": "类型编码（使用已有类型）",
      "level": "等级编码（使用已有等级）",
      "description": "物品描述"
    }
  ]
}

注意：
1. type 和 level 必须使用已有配置中的编码
2. 生成5-10个物品即可
3. 每个物品要有独特的名称和描述`

    const characterNames = characters.map(c => c.name).join('、')
    const prompt = `故事标题：${overview?.title || '未命名'}
故事摘要：${overview?.summary || '未指定'}
已有角色：${characterNames || '暂无'}

已配置的物品类型：
${itemTypesInfo || '暂无配置'}

请生成适合的物品设定（只返回JSON）：`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 大纲生成 ====================

  /**
   * 生成故事大纲 - 分步生成，降低JSON解析失败风险
   * 第一步：只生成卷结构
   */
  async generateOutlineStory(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string,
    structureLevel?: number,
    opts?: { contentTarget?: 'novel' | 'script'; episodeCount?: number }
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()
    // 默认使用三级结构
    const level = structureLevel || 3

    // 获取故事概要、角色、故事线、背景（50 号：故事线上提到入口统一加载）
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const plots = await dbManager.lwPlots?.getByProjectId(projectId) || []
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)
    const plotsSummary = plots.length > 0
      ? plots.map(p => `${p.title}：${p.summary}`).join('\n')
      : ''

    // 50 号：圣经就绪门——概要/角色/故事线未设定前禁止生成大纲（固定流程：概要→角色→故事线→大纲→正文）
    const gateError = buildBibleGateError('大纲', assessBibleReadiness({ overview, characters, plots }).missing)
    if (gateError) return { success: false, error: gateError }
    const castConstraint = buildCastRosterConstraint(characters)

    // 49 号：script（短剧分集）模式——分集大纲走专属节拍纪律，集数=大纲章数。
    // 评审 P2-3：与 novel 路径同语义，try/catch 收拢成 {success:false,error}
    try {
      const roomTarget = this.readRoomContentTarget(
        await dbManager.lwProjects?.getById(projectId)
      )
      if (resolveContentTarget(opts?.contentTarget, roomTarget, undefined) === 'script') {
        const episodeCount = opts?.episodeCount || overview?.estimatedChapters || 10
        return await this.generateScriptEpisodesOutline(
          eventId, overview, background, plotsSummary, castConstraint, episodeCount, providerConfigId, modelId
        )
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }

    const characterInfo = characters.slice(0, 5).map(c =>
      `${c.name}（${c.rolePosition === 'protagonist' ? '主角' : c.rolePosition === 'antagonist' ? '反派' : '配角'}）`
    ).join('、') + (castConstraint ? `\n${castConstraint}` : '')

    // 大纲结构应承接已确认的故事情节（50 号：plotsSummary 已在入口统一加载）

    const storyInfo = {
      title: overview?.title || '未命名',
      coreTheme: overview?.coreIdea || '未指定',
      summary: overview?.summary || '未指定',
      targetWords: (overview?.estimatedChapters || 20) * 5000,
      characterInfo: characterInfo || '暂无',
      eraDescription: background?.eraDescription || '未指定',
      plotsSummary,
    }

    try {
      if (level === 3) {
        // 三级结构：卷 → 章 → 节
        return await this.generateThreeLevelOutline(eventId, projectId, storyInfo, providerConfigId, modelId)
      } else if (level === 2) {
        // 二级结构：章 → 节
        return await this.generateTwoLevelOutline(eventId, projectId, storyInfo, providerConfigId, modelId)
      } else {
        // 一级结构：仅章
        return await this.generateOneLevelOutline(eventId, projectId, storyInfo, providerConfigId, modelId)
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 生成短剧分集大纲（49 号 script 模式）：节拍纪律见 writing-methodology，
   * 扩展字段（hook/highlight/cliffhanger/hookType）以结构化后缀并入 summary——
   * 零迁移落库，章节生成经 taskText 天然携带。
   */
  private async generateScriptEpisodesOutline(
    eventId: string,
    overview: any,
    background: any,
    plotsSummary: string,
    castLine: string,
    episodeCount: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const systemPrompt = buildScriptOutlineSystemPrompt(episodeCount)
    // keyCharacters 历史上有对象/字符串两种形态，统一渲染成「名（角色）」
    const charNames = (Array.isArray(overview?.keyCharacters) ? overview.keyCharacters : [])
      .map((c: any) => (typeof c === 'string' ? c : `${c?.name ?? ''}${c?.role ? `（${c.role}）` : ''}`.trim()))
      .filter(Boolean)
      .join('、')
    // 评审 P2-3：名册约束就位时由名册接管人物清单，避免概要自由文本与名册互相矛盾
    const castBlock = castLine || `主要人物：${charNames || '暂无'}`
    const prompt = `故事标题：${overview?.title || '未命名'}
故事摘要：${overview?.summary || '未指定'}
核心冲突：${overview?.coreConflict || '未指定'}
故事线：${plotsSummary || '暂无'}
${castBlock}
时代背景：${background?.eraDescription || '未指定'}

请生成本剧的分集大纲（共 ${episodeCount} 集，只返回JSON数组）：`

    getEventEmitter().emit(`longwriting:generate:${eventId}`, {
      type: 'progress',
      content: `正在生成 ${episodeCount} 集分集大纲（短剧节拍纪律）...`
    })

    const result = await this.callAIStream(eventId, prompt, systemPrompt, 8192, providerConfigId, modelId)
    const episodes = this.parseJsonArray(result)
    if (!episodes || episodes.length === 0) {
      return { success: false, error: '生成分集大纲失败' }
    }
    return {
      success: true,
      data: episodes.slice(0, episodeCount).map((ep: any) => ({
        name: String(ep.name || ''),
        summary: enrichScriptEpisodeSummary(String(ep.summary || ''), {
          hook: ep.hook, highlight: ep.highlight, cliffhanger: ep.cliffhanger, hookType: ep.hookType,
        }),
        estimatedWords: Number(ep.estimatedWords) || 1800,
        hook: ep.hook, highlight: ep.highlight, cliffhanger: ep.cliffhanger, hookType: ep.hookType,
      })),
    }
  }

  /** 读取项目 wizard_state.room.contentTarget（49 号评审 P0-1：仓储 DTO 已把 wizardState 解析成对象，兼容字符串形状） */
  private readRoomContentTarget(project: unknown): string | null {
    const ws = (project as { wizardState?: { room?: { contentTarget?: string } } | string | null } | null | undefined)?.wizardState
    if (!ws) return null
    if (typeof ws === 'object') return ws.room?.contentTarget ?? null
    try {
      return (JSON.parse(ws) as { room?: { contentTarget?: string } }).room?.contentTarget ?? null
    } catch {
      return null
    }
  }

  /**
   * 生成三级结构大纲：卷 → 章 → 节
   */
  private async generateThreeLevelOutline(
        eventId: string,
    projectId: string,
    storyInfo: any,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    // 第一步：生成卷结构（不含章节详情）
    const volumeSystemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，生成卷级别的大纲结构。
你的回复必须是严格的 JSON 数组格式，只包含卷的信息，不要包含章节详情。
格式要求：
[
  {
    "name": "卷名",
    "summary": "卷概要（120-200字：本卷核心冲突、关键转折、卷末局面，以及与全书主线的推进关系）",
    "estimatedWords": 预估字数（数字）
  }
]

注意：
1. 根据故事规模，生成1-3卷
2. 预估字数总计应该与故事概要中的目标字数相近
3. 只返回JSON数组，不要有任何其他文字`

    const volumePrompt = `故事标题：${storyInfo.title}
核心主题：${storyInfo.coreTheme}
故事摘要：${storyInfo.summary}
故事线：${storyInfo.plotsSummary || '暂无'}
目标字数：${storyInfo.targetWords}字
主要角色：${storyInfo.characterInfo}
时代背景：${storyInfo.eraDescription}

请生成卷级别的大纲结构（只返回JSON数组）：`

    const volumeResult = await this.callAIStream(eventId, volumePrompt, volumeSystemPrompt, 2048, providerConfigId, modelId)
    const volumes = this.parseJsonArray(volumeResult)

    if (!volumes || volumes.length === 0) {
      return { success: false, error: '生成卷结构失败' }
    }

    // 为每个卷生成章节
    const fullOutline = []
    for (let i = 0; i < volumes.length; i++) {
      const volume = volumes[i]
      getEventEmitter().emit(`longwriting:generate:${eventId}`, {
        type: 'progress',
        content: `正在生成第 ${i + 1} 卷「${volume.name}」的章节...`
      })

      const chapters = await this.generateVolumeChapters(
        eventId, projectId, volume, storyInfo, providerConfigId, modelId
      )

      fullOutline.push({
        ...volume,
        chapters: chapters || []
      })
    }

    return { success: true, data: fullOutline }
  }

  /**
   * 生成二级结构大纲：章 → 节
   */
  private async generateTwoLevelOutline(
        eventId: string,
    projectId: string,
    storyInfo: any,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    // 直接生成章（带节）
    const chapterSystemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，直接生成章级别的大纲结构。
你的回复必须是严格的 JSON 数组格式，每章包含小节信息。
格式要求：
[
  {
    "name": "章节名",
    "summary": "章节概要（150-300字）",
    "estimatedWords": 预估字数（数字）,
    "sections": [
      {
        "name": "小节名",
        "summary": "小节概要（60-100字）",
        "estimatedWords": 预估字数（数字）
      }
    ]
  }
]

注意：
1. 根据故事规模，生成5-15章
2. 每章2-5节
3. 预估字数总计应该与故事概要中的目标字数相近
4. 章节概要必须写足150-300字：本章核心事件与冲突推进（起因→推进→转折）、出场角色、章末局面变化与结尾钩子；小节概要60-100字：本节场景、事件与出场角色。禁止一句话剧情简介
5. 只返回JSON数组，不要有任何其他文字`

    const chapterPrompt = `故事标题：${storyInfo.title}
核心主题：${storyInfo.coreTheme}
故事摘要：${storyInfo.summary}
故事线：${storyInfo.plotsSummary || '暂无'}
目标字数：${storyInfo.targetWords}字
主要角色：${storyInfo.characterInfo}
时代背景：${storyInfo.eraDescription}

请生成章级别的大纲结构（只返回JSON数组）：`

    getEventEmitter().emit(`longwriting:generate:${eventId}`, {
      type: 'progress',
      content: '正在生成章节大纲...'
    })

    const chapterResult = await this.callAIStream(eventId, chapterPrompt, chapterSystemPrompt, 8192, providerConfigId, modelId)
    const chapters = this.parseJsonArray(chapterResult)

    if (!chapters || chapters.length === 0) {
      return { success: false, error: '生成章节结构失败' }
    }

    return { success: true, data: chapters }
  }

  /**
   * 生成一级结构大纲：仅章
   */
  private async generateOneLevelOutline(
        eventId: string,
    projectId: string,
    storyInfo: any,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    // 仅生成章（无节）
    const chapterSystemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，生成章级别的大纲结构。
你的回复必须是严格的 JSON 数组格式，只包含章的信息，不要包含小节。
格式要求：
[
  {
    "name": "章节名",
    "summary": "章节概要（150-300字）",
    "estimatedWords": 预估字数（数字）
  }
]

注意：
1. 根据故事规模，生成5-15章
2. 预估字数总计应该与故事概要中的目标字数相近
3. 章节概要必须写足150-300字，覆盖：本章核心事件与冲突推进（起因→推进→转折）、出场角色及其动作、章末局面变化与结尾钩子、与全书主线的关系；禁止一句话剧情简介
4. 只返回JSON数组，不要有任何其他文字`

    const chapterPrompt = `故事标题：${storyInfo.title}
核心主题：${storyInfo.coreTheme}
故事摘要：${storyInfo.summary}
故事线：${storyInfo.plotsSummary || '暂无'}
目标字数：${storyInfo.targetWords}字
主要角色：${storyInfo.characterInfo}
时代背景：${storyInfo.eraDescription}

请生成章级别的大纲结构（只返回JSON数组）：`

    getEventEmitter().emit(`longwriting:generate:${eventId}`, {
      type: 'progress',
      content: '正在生成章节大纲...'
    })

    const chapterResult = await this.callAIStream(eventId, chapterPrompt, chapterSystemPrompt, 4096, providerConfigId, modelId)
    const chapters = this.parseJsonArray(chapterResult)

    if (!chapters || chapters.length === 0) {
      return { success: false, error: '生成章节结构失败' }
    }

    return { success: true, data: chapters }
  }

  /**
   * 为单个卷生成章节
   */
  private async generateVolumeChapters(
        eventId: string,
    projectId: string,
    volume: any,
    storyInfo: any,
    providerConfigId?: string,
    modelId?: string
  ): Promise<any[]> {
    const chapterSystemPrompt = `你是一位专业的小说创作顾问。请为指定的卷生成章节大纲。
你的回复必须是严格的 JSON 数组格式。
格式要求：
[
  {
    "name": "章节名",
    "summary": "章节概要（150-300字）",
    "estimatedWords": 预估字数（数字）,
    "sections": [
      {
        "name": "小节名",
        "summary": "小节概要（60-100字）",
        "estimatedWords": 预估字数（数字）
      }
    ]
  }
]

注意：
1. 每卷生成3-10章
2. 每章2-5节
3. 章节概要必须写足150-300字：本章核心事件与冲突推进、出场角色、章末局面变化与结尾钩子；小节概要60-100字：本节场景、事件与出场角色。禁止一句话剧情简介
4. 只返回JSON数组，不要有任何其他文字`

    const chapterPrompt = `故事标题：${storyInfo.title}
卷名：${volume.name}
卷概要：${volume.summary}
卷预估字数：${volume.estimatedWords}字
故事线：${storyInfo.plotsSummary || '暂无'}
主要角色：${storyInfo.characterInfo}

请为本卷生成章节大纲（只返回JSON数组）：`

    try {
      const subEventId = `${eventId}-chapters-${Date.now()}`
      const result = await this.callAIStream(subEventId, chapterPrompt, chapterSystemPrompt, 4096, providerConfigId, modelId)
      return this.parseJsonArray(result) || []
    } catch (error) {
      return []
    }
  }

  /**
   * 解析JSON数组，带容错处理
   */
  private parseJsonArray(content: string): any[] | null {
    try {
      // 提取JSON数组
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return null

      let jsonStr = jsonMatch[0]

      // 修复常见的JSON问题
      // 1. 移除注释
      jsonStr = jsonStr.replace(/\/\/.*$/gm, '')
      jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '')

      // 2. 移除末尾逗号
      jsonStr = jsonStr.replace(/,\s*]/g, ']')
      jsonStr = jsonStr.replace(/,\s*}/g, '}')

      // 3. 尝试找到完整的JSON
      let depth = 0
      let endIndex = 0
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '[' || jsonStr[i] === '{') depth++
        if (jsonStr[i] === ']' || jsonStr[i] === '}') {
          depth--
          if (depth === 0) {
            endIndex = i + 1
            break
          }
        }
      }

      if (endIndex > 0) {
        jsonStr = jsonStr.substring(0, endIndex)
      }

      const parsed = JSON.parse(jsonStr)
      return Array.isArray(parsed) ? parsed : null
    } catch (error) {
      return null
    }
  }

  /**
   * 生成评论大纲
   */
  async generateOutlineComment(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要和素材
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const materials = await dbManager.lwMaterials?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的评论写作顾问。请根据主题和素材，生成一个评论文章大纲。
你的回复应该是 JSON 数组格式，表示段落列表，每个段落包含：
- name: 段落标题
- summary: 段落要点
- estimatedWords: 预估字数

注意：生成4-8个段落，包含引言、主体论证、结论等部分。段落间应该有逻辑递进关系。`

    const materialInfo = materials.slice(0, 5).map(m => m.name).join('、')

    const prompt = `请根据以下信息，生成评论大纲：

评论主题：${overview?.title || '未命名'}
核心观点：${overview?.coreIdea || '未指定'}
目标字数：${(overview?.estimatedChapters || 2) * 2500}字
已收集素材：${materialInfo || '暂无'}

请直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 章节内容生成 ====================

  /**
   * 生成章节预写（人物、时间、地点、事件概要）
   */
  async generateChapterPrewrite(
        eventId: string,
    projectId: string,
    outlineId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 评审 P2-1：预写提纲同属长文内容，无名册时【人物】段必然造名，同过就绪门
    const prewriteGateError = await this.checkBibleGate(projectId, '章节预写提纲')
    if (prewriteGateError) return { success: false, error: prewriteGateError }
    const pwConflictErr = await this.checkChapterConflictGate(projectId, outlineId)
    if (pwConflictErr) return { success: false, error: pwConflictErr }

    // 获取相关数据
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)
    const outline = await dbManager.lwOutlines?.getById(outlineId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []
    const plots = await dbManager.lwPlots?.getByProjectId(projectId) || []

    if (!outline) {
      return { success: false, error: '大纲节点不存在' }
    }

    // 获取相关角色和地点信息
    const involvedCharacters = (outline.involvedCharacters || [])
      .map(id => characters.find(c => c.id === id))
      .filter(Boolean)

    const involvedLocations = (outline.involvedLocations || [])
      .map(id => locations.find(l => l.id === id))
      .filter(Boolean)

    // 查找相关情节
    const relevantPlots = plots.filter(p =>
      p.title?.includes(outline.name) ||
      outline.summary?.includes(p.title)
    )

    const systemPrompt = `你是一位专业的小说创作顾问。请根据章节大纲信息，生成章节预写提纲。

预写提纲需要包含：
1. 【时间】章节发生的时间背景
2. 【地点】场景设置和地点描述
3. 【人物】参与的角色及其状态
4. 【事件】将要发生的核心事件
5. 【冲突】可能的矛盾或冲突点
6. 【情感】情感基调和氛围

请用清晰的条目格式输出，不要输出 JSON，直接输出预写内容。`

    const characterInfo = involvedCharacters.map(c =>
      `${c!.name}（${c!.rolePosition === 'protagonist' ? '主角' : c!.rolePosition === 'antagonist' ? '反派' : '配角'}，${c!.personality || '性格待定'}）`
    ).join('、')

    const locationInfo = involvedLocations.map(l =>
      `${l!.name}（${l!.type}，${l!.description || '待描述'}）`
    ).join('、')

    const plotInfo = relevantPlots.map(p => `${p.title}: ${p.summary}`).join('\n')

    const prompt = `故事标题：${overview?.title || '未命名'}
故事摘要：${overview?.summary || '未指定'}
时代背景：${background?.eraDescription || '未指定'}

章节名称：${outline.name}
章节概要：${outline.summary || '未指定'}
预估字数：${outline.estimatedWords || 3000}字

涉及角色：${characterInfo || '暂无指定'}
涉及地点：${locationInfo || '暂无指定'}
相关情节：
${plotInfo || '暂无相关情节'}

请为这个章节生成预写提纲：`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 50 号：圣经就绪门（正文）——概要/角色/故事线缺一不可。
   * 名册为空时正文必然自由造名，是角色漂移的源头；预览（getChapterContextItems）不拦截。
   */
  private async checkBibleGate(projectId: string, purpose: string): Promise<string | null> {
    const dbManager = getCoreDatabaseManager()
    const [overview, characters, plots] = await Promise.all([
      dbManager.lwStoryOverviews?.getByProjectId(projectId),
      dbManager.lwCharacters?.getByProjectId(projectId),
      dbManager.lwPlots?.getByProjectId(projectId),
    ])
    return buildBibleGateError(purpose, assessBibleReadiness({ overview, characters, plots }).missing)
  }

  /**
   * 52 号流程闭环：逐章一致性门禁——已写章节存在未处理疑点时，
   * 禁止生成下一章（正文/预写），直到 AI 解题、人工修改或知情保留。
   */
  /** 逐章一致性门禁检查（54 号）：返回拦截文本或 null=通过。公开供章法"写后检查"复用。
   *  skipCurrentChapterOnlyDoubts：重写（overwrite）本章时，仅引用本章的未处理疑点
   *  描述的是将被替换的旧正文，不应拦截重写（跨章疑点仍然拦截）——否则旧稿疑点
   *  与重写互为死锁（忘川渡实跑：R10 旧稿未落点疑点挡住 overwrite 重写，而语义
   *  复核只在写后运行）。 */
  async checkChapterConflictGate(
    projectId: string,
    outlineId: string,
    opts?: { skipCurrentChapterOnlyDoubts?: boolean }
  ): Promise<string | null> {
    try {
      const cs = ConsistencyService.getInstance()
      const chapterNo = await cs.chapterNumberOf(projectId, outlineId)
      let blocking = await cs.scanBlockingConflicts(projectId, chapterNo)
      if (opts?.skipCurrentChapterOnlyDoubts) {
        blocking = blocking.filter((c) => {
          const chs = conflictChapters(c)
          return !(chs.length > 0 && chs.every((n) => n === chapterNo))
        })
      }
      return buildConflictGateError(chapterNo, blocking)
    } catch (e: any) {
      // 门禁自身异常不阻断生成（扫描依赖的图谱数据缺失等），记日志
      console.warn('[longwriting] 一致性门禁异常（跳过）:', e?.message)
      return null
    }
  }

  /**
   * 54 号章法门：正文生成前必须有已确认的「章节设计卡」——
   * 先设计（情节概要/钩子/爽点/出场实体）→ 自检 → 确认 → 才动笔。
   * script 分集项目不设此门。2026-09-18 用户指令：删除 skipChapterCardGate 旁路，
   * 卡门禁对 novel 项目一律生效。
   */
  private async checkChapterCardGate(projectId: string, outlineId: string): Promise<string | null> {
    try {
      const dbManager = getCoreDatabaseManager()
      const roomProject = await dbManager.lwProjects?.getById(projectId)
      const roomTarget = this.readRoomContentTarget(roomProject)
      if (roomTarget === 'script') return null
      const prewrite = await dbManager.lwPrewrites?.getByOutlineId(outlineId)
      if (!prewrite?.isConfirmed) {
        return '本章还没有已确认的「章节设计卡」。按写作章法请先设计本章（情节概要/开场钩子/爽点/章尾卡点/出场实体）并确认，再生成正文。'
      }
      return null
    } catch (e: any) {
      console.warn('[longwriting] 章节卡门禁异常（跳过）:', e?.message)
      return null
    }
  }

  /**
   * 54 号章法：章节设计卡生成 + 自检（先设计→自检→确认→后动笔的第一步）。
   * 输入：全书概要/核心冲突 + 本章大纲 + 相关故事线 + 上一章状态与钩型（轮换约束）。
   * 输出：结构化设计卡 + markdown（落库由 handler 完成）+ LLM 自检问题清单。
   */
  async generateChapterCard(
        eventId: string,
    projectId: string,
    outlineId: string,
    providerConfigId?: string,
    modelId?: string,
    consensusText?: string,
    opts?: { overwrite?: boolean }
  ): Promise<GenerateResponse> {
    // W3.2：挂用量上下文（本章设计卡链路的所有 LLM 调用记入 'chapter-card'）
    usageContextStorage.enterWith({ projectId, purpose: 'chapter-card' })
    const dbManager = getCoreDatabaseManager()
    const gateError = await this.checkBibleGate(projectId, '章节设计卡')
    if (gateError) return { success: false, error: gateError }
    const conflictErr = await this.checkChapterConflictGate(projectId, outlineId, {
      skipCurrentChapterOnlyDoubts: opts?.overwrite === true,
    })
    if (conflictErr) return { success: false, error: conflictErr }

    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const outline = await dbManager.lwOutlines?.getById(outlineId)
    if (!outline) return { success: false, error: '大纲节点不存在' }
    const characters = (await dbManager.lwCharacters?.getByProjectId(projectId)) || []
    const plots = (await dbManager.lwPlots?.getByProjectId(projectId)) || []
    const outlines = (await dbManager.lwOutlines?.getByProjectId(projectId)) || []

    // 文档序章号 / 前一章（钩型轮换） / 前情状态摘要
    const { buildOutlineDocOrder, outlineChapterNumber } = await import('./longwriting/outline-order')
    const order = buildOutlineDocOrder(outlines)
    const chapterNo = outlineChapterNumber(order, outlineId) ?? 1
    const chapterOutlines = outlines
      .filter((o: any) => o.nodeType === 'chapter')
      .sort((a: any, b: any) => (order.leafNumbers.get(a.id) ?? 0) - (order.leafNumbers.get(b.id) ?? 0))
    const idx = chapterOutlines.findIndex((o: any) => o.id === outlineId)
    const prevOutline = idx > 0 ? chapterOutlines[idx - 1] : null
    const prevPrewrite = prevOutline ? await dbManager.lwPrewrites?.getByOutlineId(prevOutline.id) : null
    const prevHookType = parseCardHookType(prevPrewrite?.content)
    const prevState = await dbManager.lwChapterStateSummaries?.getLatestBeforeChapter(projectId, chapterNo)

    // 故事线匹配（天下捕快实跑修复）：旧实现要求"大纲概要包含故事线标题全名"，
    // 而标题带"（第X—Y章）"区间后缀——几乎恒为假，【相关故事线】长期是"暂无"，
    // 设计卡拿不到单元案 canon。改为优先按标题区间与本章号求交，退回名字包含。
    const parsePlotRange = (title: string): { from: number; to: number } | null => {
      const m = title.match(/第\s*(\d+)\s*[—–\-~至]\s*(\d+)\s*(?:＋|\+)?\s*章/)
      return m ? { from: Number(m[1]), to: Number(m[2]) } : null
    }
    const relevantPlots = plots.filter(p => {
      if (!p?.title) return false
      const range = parsePlotRange(p.title)
      if (range) return chapterNo >= range.from && chapterNo <= range.to
      return p.title.includes(outline.name) || !!outline.summary?.includes(p.title)
    })
    const castNames = (outline.involvedCharacters || [])
      .map(id => characters.find(c => c.id === id)?.name)
      .filter(Boolean)

    // 提示词来自章法 skill 定义（单一事实源）：改章法改 skills/chapter-writing.ts
    // 前瞻防剧透（忘川渡实跑修复）：注入下一章大纲概要，设计卡与自检都能发现
    // 「本章提前坐实后续章核心反转/关键线索」的进度冲突
    const idxForNext = idx
    const nextOutline = idxForNext >= 0 && idxForNext + 1 < chapterOutlines.length ? chapterOutlines[idxForNext + 1] : null
    const nextOutlineText = nextOutline
      ? `第${outlineChapterNumber(order, nextOutline.id) ?? '?'}章 ${nextOutline.name}：${(nextOutline.summary || '').slice(0, 160)}`
      : ''
    const systemPrompt = buildChapterCardDesignSystemPrompt(prevHookType, nextOutlineText)

    // 作者拍板的共识与修正（研讨室账本）：设计卡必须遵守，否则会反复回退到已被
    // 否决的旧设定（实跑：《长夜提灯人》第 2 章大纲写"乘客活下来了"，对话已拍板
    // "救不回"，设计卡连续 4 次回退旧写法与自检死循环）
    const consensusBlock = (consensusText || '').trim()
      ? `\n【作者已拍板的共识与修正（最高优先级——与上文任何内容冲突时以此为准；已被否决的写法禁止再出现）】\n${consensusText!.trim()}\n`
      : ''

    const prompt = `【全书核心故事概要】
${overview?.summary || '未指定'}

【全书核心冲突】
${overview?.coreConflict || '未指定'}
${consensusBlock}
【本章大纲】第${chapterNo}章 ${outline.name}
${outline.summary || '（无概要，请依据全书概要与故事线合理设计）'}

【相关故事线】
${relevantPlots.map(p => `${p.title}：${p.summary}`).join('\n') || '暂无'}

【上一章结束状态】
${prevState ? `时间：${prevState.storyTime || '未知'}；位置：${prevState.currentLocation || '未知'}；人物状态：${prevState.characterStates || '未知'}` : '（本章为开篇或无前情记录）'}

【本章大纲建议出场角色】${castNames.join('、') || '未指定'}

请生成本章设计卡（JSON）。`

    try {
      const raw = await this.generateWithBrainTool(eventId, prompt, systemPrompt, 2500, providerConfigId, modelId)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { success: false, error: '设计卡返回格式错误，请重试' }
      const card = JSON.parse(jsonMatch[0]) as ChapterCardData

      // 结构校验（硬伤直接打回）
      const structureIssues = validateChapterCard(card)
      if (structureIssues.length > 0) {
        return { success: false, error: `设计卡不合格：${structureIssues.join('；')}` }
      }

      // LLM 自检：对照全书总纲与前情，审这张卡能不能落地
      const markdown = buildChapterCardMarkdown(card, `第${chapterNo}章 ${outline.name}`)
      let review: { ok: boolean; issues: string[] } = { ok: true, issues: [] }
      try {
        const reviewRaw = await this.callAIStream(
          eventId + '-review',
          buildChapterCardReviewPrompt({
            overviewSummary: overview?.summary || '',
            prevStateText: prevState?.characterStates || prevState?.storyTime || '',
            markdown,
            ledgerText: consensusText,
            nextOutlineText,
          }),
          CHAPTER_CARD_REVIEW_SYSTEM_PROMPT,
          800,
          providerConfigId,
          modelId
        )
        const rMatch = reviewRaw.match(/\{[\s\S]*\}/)
        if (rMatch) {
          const parsed = JSON.parse(rMatch[0])
          review = { ok: !!parsed.ok, issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [] }
        }
      } catch (e: any) {
        console.warn('[longwriting] 设计卡自检失败（不阻断）:', e?.message)
      }

      return { success: true, data: { card, markdown, review, chapterNo } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 生成章节内容
   */
  async generateChapter(
        eventId: string,
    projectId: string,
    outlineId: string,
    targetWords?: number,
    providerConfigId?: string,
    modelId?: string,
    style?: string,
    extraPrompt?: string,
    options?: { overwrite?: boolean }
  ): Promise<GenerateResponse> {
    const gateError = await this.checkBibleGate(projectId, '章节正文')
    if (gateError) return { success: false, error: gateError }
    const conflictErr = await this.checkChapterConflictGate(projectId, outlineId, {
      skipCurrentChapterOnlyDoubts: options?.overwrite === true,
    })
    if (conflictErr) return { success: false, error: conflictErr }
    // 2026-09-18 用户指令：章法卡门禁不再可跳过（删除 skipChapterCardGate 旁路）
    const cardGateErr = await this.checkChapterCardGate(projectId, outlineId)
    if (cardGateErr) return { success: false, error: cardGateErr }
    // W3.2：正文链路用量上下文（分段/扩写流都记入 'chapter-body'；章节 id 落库前未知记 null）
    usageContextStorage.enterWith({ projectId, purpose: 'chapter-body' })
    const asm = await this.assembleChapterGeneration(projectId, outlineId, { targetWords, style, extraPrompt })
    if ('error' in asm) return { success: false, error: asm.error }
    try {
      const targetWordsFinal = asm.composeOpts.targetWords
      // W3.1 长章分段：目标超阈值走场景段顺序生成（段间只做非空校验，R 门禁/写后检查整章一次——OQ-1 默认方案）
      const draft =
        targetWordsFinal > CHAPTER_SEGMENT_THRESHOLD_WORDS
          ? await this.generateChapterSegmented(eventId, asm, targetWordsFinal, providerConfigId, modelId)
          : await this.generateWithBrainTool(eventId, asm.prompt, asm.systemPrompt, asm.maxTokens, providerConfigId, modelId)

      // 49 号：字数质量门——欠字数扩写一次而非整章重生成（保留情节与文风）。
      // 评审 P2-1：扩写用独立 eventId 流（不进 UI 累加流），原通道只发进度提示
      const gated = await applyChapterQualityGate(draft, targetWordsFinal, (expandPrompt) => {
        getEventEmitter().emit(`longwriting:generate:${eventId}`, { type: 'progress', content: '初稿字数未达标，正在扩写…' })
        return this.callAIStream(eventId + '-expand', expandPrompt, asm.systemPrompt, asm.maxTokens, providerConfigId, modelId)
      })

      return { success: true, data: { content: gated.content, qualityGate: gated.gate } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * W3.1 长章分段生成：按场景段顺序生成再拼接。
   * - 段数 = ceil(目标/2500) 封顶 8；每段 prompt = 九分区上下文 + 本章已生成前文 + 段指令
   * - 首段保留知识大脑工具位，后续段直调（同上下文重复检索是纯开销）
   * - 每段生成流注册在同一 eventId 下——UI 取消中止当前段并立即上抛
   */
  private async generateChapterSegmented(
    eventId: string,
    asm: { prompt: string; systemPrompt: string; maxTokens: number; composeOpts: { targetWords: number } },
    targetWords: number,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<string> {
    const segCount = Math.min(CHAPTER_SEGMENT_MAX_COUNT, Math.ceil(targetWords / CHAPTER_SEGMENT_TARGET_WORDS))
    const segTarget = Math.ceil(targetWords / segCount)
    const segMaxTokens = Math.min(segTarget * 2, asm.maxTokens)
    const segments: string[] = []
    for (let i = 0; i < segCount; i++) {
      getEventEmitter().emit(`longwriting:generate:${eventId}`, {
        type: 'progress',
        content: `长章分段生成：第 ${i + 1}/${segCount} 段（每段约 ${segTarget} 字）`,
      } as GenerationStreamEvent)
      const prior = segments.join('\n\n')
      const segPrompt = asm.prompt + buildChapterSegmentSection(targetWords, segCount, i, segTarget, prior)
      const seg =
        i === 0
          ? await this.generateWithBrainTool(eventId, segPrompt, asm.systemPrompt, segMaxTokens, providerConfigId, modelId)
          : await this.callAIStream(eventId, segPrompt, asm.systemPrompt, segMaxTokens, providerConfigId, modelId)
      if (!seg.trim()) throw new Error(`分段生成第 ${i + 1}/${segCount} 段产出为空`)
      segments.push(seg.trim())
    }
    return segments.join('\n\n')
  }

  /**
   * W4 选区 AI 编辑（excerpt 级轻量通道；OQ-2 默认方案下的章法收口豁免）：
   * - 不走章法工作流/整章门禁——红线：只处理选区文本、结果过 excerpt 复查、
   *   采纳经编辑器自动保存建版本（version_type='manual'）
   * - 上下文 = 选区 + 前后文各一段（excerpt 级），不拼九分区与设计卡
   * - 复查 warning 随结果返回（不阻断采纳），前端展示供人工判断
   */
  async rewriteSelection(input: {
    projectId: string
    selection: string
    action: 'rewrite' | 'expand' | 'shorten' | 'polish' | 'continue' | 'custom'
    instruction?: string
    contextBefore?: string
    contextAfter?: string
    providerConfigId?: string
    modelId?: string
  }): Promise<{ success: boolean; error?: string; data?: { result: string; warnings: string[] } }> {
    const { projectId, selection, action } = input
    if (!selection?.trim() && action !== 'continue') {
      return { success: false, error: '请先在正文中选中要处理的文字（「续写一句」可作用于光标处）' }
    }
    usageContextStorage.enterWith({ projectId, purpose: 'selection' })

    const ACTION_LABELS: Record<string, string> = {
      rewrite: '改写：保持原意与信息量，换一种更好的写法（句式/节奏/画面感）',
      expand: '扩写：在不新增情节转折的前提下，补足场面调度、动作神态与关键对白的展开，篇幅变为约 1.5-2 倍',
      shorten: '缩写：保留全部关键信息与情节功能，删掉冗余修饰，篇幅压缩到约一半',
      polish: '润色：只修语病、错字与不通顺处，尽量保持原句结构与长度',
      continue: '续写：从给定文字（或光标处）自然续写约一两句话，紧接其文风与节奏',
      custom: input.instruction?.trim() || '按用户指令处理',
    }
    const label = ACTION_LABELS[action] || ACTION_LABELS.custom
    const before = (input.contextBefore || '').slice(-300)
    const after = (input.contextAfter || '').slice(0, 300)
    const userPrompt = `【任务】${label}${input.instruction && action !== 'custom' ? `\n【补充要求】${input.instruction.trim()}` : ''}

【选区前文（仅供理解上下文，不要输出）】
${before || '（无）'}

【处理对象：选区原文】
${selection || '（空——从光标处续写）'}

【选区后文（仅供理解上下文，不要输出）】
${after || '（无）'}

只输出处理后的正文文字，不要任何解释、引号或标题。`

    const systemPrompt = '你是一位资深的小说编辑，对给定选区执行精确的文字操作：只输出处理后的正文文字，不复述任务说明，不添加任何解释。'
    const maxTokens = Math.min(8192, Math.max(2048, estimateContextTokens(selection) * 4 + 1024))
    try {
      const result = await this.callAI(
        userPrompt,
        systemPrompt,
        maxTokens,
        input.providerConfigId,
        input.modelId,
      )
      const cleaned = result.trim()
      if (!cleaned) return { success: false, error: 'AI 返回为空' }

      // W4 excerpt 复查（warning 性质）：死亡角色出场近似检查
      const warnings: string[] = []
      try {
        const db = getCoreDatabaseManager()
        const chars = (await db.lwCharacters?.getByProjectId(projectId)) || []
        const limited = chars.slice(0, 60)
        const withState: ExcerptCharacterInfo[] = []
        for (const c of limited) {
          const st = await db.lwEntityStates?.getLatestEntityState?.(projectId, 'character', c.id)
          withState.push({ name: c.name, aliases: (c as any).aliases, stateSummary: st?.stateSummary || '' })
        }
        warnings.push(...scanExcerptConflicts(cleaned, withState))
      } catch { /* 复查失败不阻断 */ }

      return { success: true, data: { result: cleaned, warnings } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 章节工作台（38 号）：结构化暴露本次生成的全部上下文项（含 token 估算与窗口预算）。
   * 与 generateChapter 共用 assembleChapterGeneration——预览=实际，杜绝两套组装漂移。
   */
  async getChapterContextItems(
    projectId: string,
    outlineId: string,
    opts: { targetWords?: number; style?: string; extraPrompt?: string; enabledItemIds?: string[] } = {}
  ): Promise<{ success: boolean; error?: string; data?: ChapterContextResult }> {
    const asm = await this.assembleChapterGeneration(projectId, outlineId, opts)
    if ('error' in asm) return { success: false, error: asm.error }
    // 传入 enabledItemIds 时按当前勾选重组 prompt（面板「⚡ 预览」实时预览）
    const enabled = new Set(opts.enabledItemIds ?? asm.items.map((i) => i.id))
    const promptText = opts.enabledItemIds
      ? composeChapterPrompt(asm.parts, (id) => enabled.has(id), asm.composeOpts)
      : asm.prompt
    return {
      success: true,
      data: {
        items: asm.items,
        promptText,
        estimateTokens: opts.enabledItemIds ? estimateContextTokens(promptText) : asm.estimateTokens,
        windowTokens: asm.windowTokens,
        trimmedSections: asm.trimmedSections,
      },
    }
  }

  /**
   * 按勾选上下文生成（38 号）：enabledItemIds 过滤重组装；流式/落库与 generateChapter 同链路。
   * 未传 enabledItemIds = 全部默认项（与 generateChapter 等价）。
   */
  /**
   * 章节生成组装（38 号重构）：generateChapter / getChapterContextItems / generateChapterWithContext
   * 的单一事实源。产出可控制上下文项（items）+ 组装原料（parts）+ 默认组装结果（prompt）。
   */
  private async assembleChapterGeneration(
    projectId: string,
    outlineId: string,
    opts: { targetWords?: number; style?: string; extraPrompt?: string } = {}
  ): Promise<
    | { error: string }
    | {
        ok: true
        prompt: string
        systemPrompt: string
        maxTokens: number
        estimateTokens: number
        windowTokens: number
        items: ChapterContextItem[]
        parts: ChapterPromptParts
        /** W2.1：超预算时被裁剪的分区（空=未触发裁剪） */
        trimmedSections: string[]
        composeOpts: { targetWords: number; style?: string; extraPrompt?: string }
      }
  > {
    const dbManager = getCoreDatabaseManager()
    // 「参数设置 → 长文写作 → 章节生成」：方法内现读（不要在模块顶层读，否则不跟随重注入）
    const {
      windowTokens: windowTokensParam,
      maxOutputTokens,
      chapterTargetWords,
      previousChapterEndingChars,
    } = longwritingParams().writing

    // 获取大纲节点
    const outline = await dbManager.lwOutlines?.getById(outlineId)
    if (!outline) {
      return { error: '大纲节点不存在' }
    }

    // 获取故事上下文
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 新增：获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取前置章节内容（作为上下文）
    const siblings = await dbManager.lwOutlines?.getTreeByProjectId(projectId) || []
    const currentIndex = siblings.findIndex(s => s.id === outlineId)
    const previousOutlines = siblings.slice(0, currentIndex).slice(-3) // 最近3个

    // 计算章节序号（用于获取相关记忆）
    const chapterNumber = this.calculateChapterNumber(siblings, outlineId)

    // 新增：获取上一章正文结尾
    const previousChapterOutlines = previousOutlines.filter(o => o.nodeType === 'chapter')
    const lastChapterOutline = previousChapterOutlines[previousChapterOutlines.length - 1]

    let previousChapterEnding = ''
    if (lastChapterOutline) {
      const lastChapter = await dbManager.lwChapters?.getByOutlineId(lastChapterOutline.id)
      if (lastChapter?.content) {
        previousChapterEnding = this.extractEndingContentByParagraph(
          lastChapter.content,
          previousChapterEndingChars,
        )
      }
    }

    // 获取记忆上下文
    const memoryContext = await this.getMemoryContext(projectId, chapterNumber)

    // 获取章节状态摘要上下文（上一章结束时的状态）
    const chapterStateSummaryContext = await this.getChapterStateSummaryContext(projectId, chapterNumber)

    // 获取实体状态上下文
    const involvedEntities: Array<{ type: string; id: string }> = []

    // 添加涉及的角色
    for (const charId of outline.involvedCharacters || []) {
      involvedEntities.push({ type: 'character', id: charId })
    }

    // 添加涉及的地点
    for (const locId of outline.involvedLocations || []) {
      involvedEntities.push({ type: 'location', id: locId })
    }

    const entityStateContext = await this.getEntityStateContext(projectId, chapterNumber, involvedEntities)

    // 获取预写内容（如果存在）
    const prewrite = await dbManager.lwPrewrites?.getByOutlineId(outlineId)

    // 新增：构建背景设定上下文
    const backgroundContext = this.buildBackgroundContext(background)

    // 设定资产库（2026-09-24 P0）：体系/规则类设定活引用直注入（预算 longwriting.worldContextMaxTokens）
    let worldLibraryContext = ''
    try {
      const { buildWorldLibraryContext } = await import('@core/platform/services/longwriting/library/library-context')
      // 2c 触发式注入扫描窗口：本章大纲 + 设计卡 + 上一章结尾（命中条目名/别名才注入，命中清单随文本可见）
      const scanText = [outline.summary, prewrite?.content, previousChapterEnding].filter(Boolean).join('\n')
      worldLibraryContext = await buildWorldLibraryContext(projectId, scanText)
    } catch (e: any) {
      console.warn('[longwriting] 世界观库上下文构建失败（不影响生成）:', e?.message || e)
    }

    // 新增：计算故事进度阶段
    const totalChapters = overview?.estimatedChapters || 30
    const progressStage = this.calculateStoryProgressStage(chapterNumber, totalChapters)

    // 新增：获取故事类型名称
    const storyTypeName = this.getStoryTypeName(overview?.storyType || '')

    // 新增：构建角色完整信息
    const characterItems: ChapterContextItem[] = []
    for (const charId of outline.involvedCharacters || []) {
      const char = characters.find(c => c.id === charId)
      if (char) {
        // 获取该角色的实体状态
        const charState = await dbManager.lwEntityStates?.getEntityStateAtChapter(
          projectId,
          'character',
          charId,
          chapterNumber - 1
        )
        const text = this.buildCharacterFullInfo(char, charState)
        characterItems.push({
          id: `character:${charId}`,
          sectionKey: 'character',
          title: `角色：${char.name || charId.slice(0, 8)}`,
          text,
          tokens: estimateContextTokens(text),
          defaultChecked: true,
        })
      }
    }
    // 新增：构建地点完整信息
    const locationItems: ChapterContextItem[] = []
    for (const locId of outline.involvedLocations || []) {
      const loc = locations.find(l => l.id === locId)
      if (loc) {
        // 获取该地点的实体状态
        const locState = await dbManager.lwEntityStates?.getEntityStateAtChapter(
          projectId,
          'location',
          locId,
          chapterNumber - 1
        )
        const text = this.buildLocationFullInfo(loc, locState)
        locationItems.push({
          id: `location:${locId}`,
          sectionKey: 'location',
          title: `地点：${loc.name || locId.slice(0, 8)}`,
          text,
          tokens: estimateContextTokens(text),
          defaultChecked: true,
        })
      }
    }
    // 新系统提示词
    const baseWriterPrompt = `你是一位资深的网络小说作家，擅长创作情节紧凑、人物生动、场景细腻的章节内容。

## 写作核心原则

### 1. 章节衔接技巧
- **开头衔接**：从上一章结尾自然过渡，避免突兀跳跃
- **时间连贯**：本章开始时间应从上一章结束时间之后自然延续
- **场景过渡**：如果场景转换，需要合理的过渡描写
- **情绪承接**：保持上一章结尾的情绪氛围，或自然转换情绪

### 2. 人物塑造要求
- 对话要符合人物性格特点
- 行为举止要符合人物背景和能力设定
- 外貌描写要与设定保持一致
- 注意人物当前状态

### 3. 场景描写原则
- 场景要具体可感，调动读者的感官体验
- 环境要与时代背景设定一致
- 重要场景要突出独特特征

### 4. 情节推进技巧
- 本章要有明确的推进目标
- 情节要紧凑，避免拖沓和冗余
- 注意呼应前文伏笔
- 适当铺垫后续情节

### 5. 写作禁忌
- **禁止**：已死亡的角色再次出现
- **禁止**：已学会的技能再次"初学"
- **禁止**：已获得的物品再次"首次获得"
- **禁止**：忽略已建立的人物关系
- **禁止**：与前情事实表冲突——已交付的信物/凭证/授权不得再次"首次"交付，人物身份、称谓与来历不得另起说法
- **禁止**：复刻已被正文推翻的旧设定——当【本章大纲】【相关故事线】与【前情事实表】【关键道具口径】冲突时，一律以前情与道具口径为准。事实仲裁序：作者共识 > 已写正文确立的事实（前情事实表/道具口径/实体状态） > 本章大纲与故事线 > 自由发挥
- **禁止**：与世界观设定冲突的内容

### 6. 输出要求
直接输出章节正文内容，不需要标题，不需要额外说明。`

    // 49 号：写作纪律按内容目标分叉（script=短剧四拍引擎 / novel=章节钩子+黄金三章），
    // 并注入"下一章去向卡"（R3 AI_NovelGenerator 配方：让本章知道故事要落到哪里）。
    // 评审 P1-1/P1-2：getTreeByProjectId 返回根树（子节点挂 children）——拍平后定位当前章，
    // 否则三级结构下去向卡永远找不到、章节号恒 1 导致"黄金三章"误注入所有章。
    const flatNodes: any[] = []
    const walkTree = (nodes: any[]) => {
      for (const n of nodes || []) {
        flatNodes.push(n)
        walkTree(n.children || [])
      }
    }
    walkTree(siblings)
    const flatIndex = flatNodes.findIndex((s) => s.id === outlineId)
    const nextChapter = flatIndex >= 0
      ? flatNodes.slice(flatIndex + 1).find((s) => s.nodeType === 'chapter')
      : undefined
    const chapterNo = flatIndex >= 0
      ? flatNodes.slice(0, flatIndex).filter((s) => s.nodeType === 'chapter').length + 1
      : chapterNumber
    const roomProject = await dbManager.lwProjects?.getById(projectId)
    const roomTarget = this.readRoomContentTarget(roomProject)
    const contentTarget = resolveContentTarget(undefined, roomTarget, outline.summary)
    const discipline = contentTarget === 'script'
      ? buildScriptChapterDiscipline(nextChapter ? { name: nextChapter.name, summary: nextChapter.summary ?? undefined } : null)
      : buildNovelChapterDiscipline(chapterNo)
    const systemPrompt = `${baseWriterPrompt}\n\n${discipline}`

    // 构建预写部分
    const prewriteSection = prewrite?.content
      ? `\n## 七、预写提纲\n\n${prewrite.content}\n`
      : ''

    // 阶段2：图谱关系与事件段（时间线一致性注入）
    const graphSection = await this.buildGraphContextSection(projectId, outline, chapterNumber)

    // 阶段2：回忆/闪回场景提示（回忆时间点的实体状态以历史切片为准）
    const recallSection = this.buildRecallSection(outline, projectId, characters, locations, chapterNumber)

    // —— 38 号：可控制上下文项清单（与下方 prompt 组装共用同源文本） ——
    // 背景独立成段（42号 review：曾内嵌于此——'background' 勾选是死开关）
    // 54 号：全书概要与风格基调必须进每一章——概要是全书核心基调（用户意见：
    // "把最核心的故事主线简要介绍，把故事的风格说清楚，指导后续的写作"），
    // 旧版 overviewText 只有标题/类型/冲突，概要从未进入正文上下文
    const coreSummary = (overview?.summary || '').trim()
    const overviewText = `**故事标题**：${overview?.title || '未命名'}\n**故事类型**：${storyTypeName}\n**核心冲突**：${overview?.coreConflict || '未指定'}\n**预估总章节数**：${totalChapters}章\n**当前进度**：第${chapterNumber}章（${progressStage}）${coreSummary ? `\n**核心故事概要（全书总纲，本章写作不得偏离）**：\n${coreSummary}` : ''}${overview?.style ? `\n**风格基调**：${String(overview.style).slice(0, 200)}` : ''}`
    const taskText = `**章节名称**：${outline.name}\n**章节概要**：${outline.summary}`
    const prevEndingText = previousChapterEnding || '这是开篇章节'
    const constraintsText = `${memoryContext}${entityStateContext}${chapterStateSummaryContext}`
    // W6.6 风格样章 few-shot：作者粘贴的自认可文注入 Style 分区（模仿文风，禁止照抄内容）
    const overviewStyleSample = String((overview as any)?.styleSample || '').trim()
    const styleText = [
      opts.style ? `本章要求以「${opts.style}」的风格写作。请贯彻到遣词造句、节奏与氛围中。` : '',
      overviewStyleSample ? `【风格样章（模仿其文风、句式节奏与叙事腔调；禁止照抄其内容、人物或具体情节）】
${overviewStyleSample.slice(0, 1200)}` : '',
    ].filter(Boolean).join('\n\n')
    const extraText = opts.extraPrompt && opts.extraPrompt.trim() ? opts.extraPrompt.trim() : ''

    const items: ChapterContextItem[] = [
      { id: 'overview', sectionKey: 'overview', title: '故事宏观背景', text: overviewText, tokens: estimateContextTokens(overviewText), defaultChecked: true },
      { id: 'background', sectionKey: 'background', title: '世界观设定', text: backgroundContext || '', tokens: estimateContextTokens(backgroundContext || ''), defaultChecked: !!backgroundContext },
      ...(worldLibraryContext ? [{ id: 'worldLibrary' as const, sectionKey: 'background' as const, title: '世界观库', text: worldLibraryContext, tokens: estimateContextTokens(worldLibraryContext), defaultChecked: true }] : []),
      ...characterItems,
      ...locationItems,
      { id: 'prevEnding', sectionKey: 'prevChapters', title: '上一章结尾', text: prevEndingText, tokens: estimateContextTokens(prevEndingText), defaultChecked: true },
      { id: 'memory', sectionKey: 'graph', title: '相关记忆与关键约束', text: constraintsText, tokens: estimateContextTokens(constraintsText), defaultChecked: !!constraintsText },
      ...(prewriteSection ? [{ id: 'prewrite', sectionKey: 'prewrite' as const, title: '预写提纲', text: prewrite?.content || '', tokens: estimateContextTokens(prewrite?.content || ''), defaultChecked: true }] : []),
      ...(graphSection ? [{ id: 'graph', sectionKey: 'graph' as const, title: '图谱关系与事件', text: graphSection, tokens: estimateContextTokens(graphSection), defaultChecked: true }] : []),
      ...(recallSection ? [{ id: 'recall', sectionKey: 'graph' as const, title: '回忆/闪回场景提示', text: recallSection, tokens: estimateContextTokens(recallSection), defaultChecked: true }] : []),
    ]

    const parts: ChapterPromptParts = {
      overviewText,
      backgroundText: backgroundContext || '',
      worldLibraryText: worldLibraryContext || '',
      taskText,
      characterItems,
      locationItems,
      prevEndingText,
      constraintsText,
      prewriteContent: prewrite?.content || '',
      graphSection,
      recallSection,
      styleText,
      extraText,
    }

    const targetWordsFinal = opts.targetWords || outline.estimatedWords || chapterTargetWords
    // W2.1 预算硬裁剪：超窗口时按分区价值阶梯裁剪（低于预算零改动，prompt 不变）
    const trimmed = trimChapterPartsToBudget(parts, systemPrompt, windowTokensParam, (p) =>
      composeChapterPrompt(p, () => true, { targetWords: targetWordsFinal, style: opts.style, extraPrompt: opts.extraPrompt }),
    )
    const effectiveParts = trimmed.steps.length > 0 ? trimmed.parts : parts
    if (trimmed.steps.length > 0) {
      logger.warn(
        `[longwriting] 章节上下文超预算，已裁剪：${trimmed.steps.join(' → ')}（${trimmed.estimateTokens}/${windowTokensParam} tokens）`,
      )
    }
    const prompt = composeChapterPrompt(effectiveParts, () => true, { targetWords: targetWordsFinal, style: opts.style, extraPrompt: opts.extraPrompt })
    // 评审 P3-1：纪律注入后 systemPrompt 也有千字级体量，预算估算应包含它
    const estimateTokens = estimateContextTokens(prompt) + estimateContextTokens(systemPrompt)
    const windowTokens = windowTokensParam

    return {
      ok: true,
      prompt,
      systemPrompt,
      maxTokens: Math.min(targetWordsFinal * 2, maxOutputTokens),
      estimateTokens,
      windowTokens,
      items,
      parts: effectiveParts,
      trimmedSections: trimmed.steps,
      composeOpts: { targetWords: targetWordsFinal, style: opts.style, extraPrompt: opts.extraPrompt },
    }
  }
  /**
   * 构建"图谱关系与事件"上下文段（阶段2）：
   * - 本章涉及实体的"生效关系边"（edgesAt，带有效期）
   * - 本项目已发生的事件摘要（涉及本章实体的，按章节倒序取最近 5 条）
   * - 前情事实表（54 号复测：最近三章已发生事件，跨实体——实体过滤会饿死关键事实）
   */
  private async buildGraphContextSection(
    projectId: string,
    outline: any,
    chapterNumber: number,
  ): Promise<string> {
    try {
      const { GraphService } = await import('@core/platform/services/longwriting/graph/graph.service')
      const dbManager = getCoreDatabaseManager()
      const graph = new GraphService(dbManager)

      const involvedIds = [
        ...(outline.involvedCharacters || []).map((id: string) => ({ type: 'character' as const, id })),
        ...(outline.involvedLocations || []).map((id: string) => ({ type: 'location' as const, id })),
        ...(outline.involvedItems || []).map((id: string) => ({ type: 'item' as const, id })),
        ...(outline.involvedFactions || []).map((id: string) => ({ type: 'faction' as const, id })),
        ...(outline.involvedSkills || []).map((id: string) => ({ type: 'skill' as const, id })),
      ]

      // 1. 生效关系边（本章时间点）
      const edgeLines: string[] = []
      const seenEdges = new Set<string>()
      // 实体 ID → 名称缓存；评审 #62：实体已删（悬空边）不注入 UUID 占位，
      // 整条边跳过——UUID 对 AI 是噪声还可能被当名字复述
      const nameCache = new Map<string, string | null>()
      const nameOf = async (type: string, id: string): Promise<string | null> => {
        const key = `${type}:${id}`
        if (nameCache.has(key)) return nameCache.get(key)!
        const node = await graph.getNode(projectId, type as any, id).catch(() => null)
        const name = node?.name ?? null
        nameCache.set(key, name)
        return name
      }
      for (const ent of involvedIds) {
        const edges = await graph.edgesAt(projectId, ent.id, chapterNumber)
        for (const e of edges) {
          const key = `${e.sourceId}:${e.targetId}:${e.relationType}`
          if (seenEdges.has(key)) continue
          seenEdges.add(key)
          const srcName = await nameOf(e.sourceType, e.sourceId)
          const tgtName = await nameOf(e.targetType, e.targetId)
          if (!srcName || !tgtName) continue // 悬空边：实体已删，跳过
          const validFrom = e.validFromChapter !== undefined ? `自第${e.validFromChapter}章起` : ''
          const validUntil = e.validUntilChapter !== undefined ? `，至第${e.validUntilChapter}章失效` : ''
          edgeLines.push(`- ${srcName} → ${tgtName}：${e.relationType}${e.label ? `（${e.label}）` : ''}（${validFrom}${validUntil}）`)
        }
      }

      // 2. 相关事件摘要（本章之前发生的，涉及本章实体；planned/retconned 不进写作上下文）
      const events = (await dbManager.lwEvents?.getByProjectId(projectId)) || []
      const involvedIdSet = new Set(involvedIds.map(x => x.id))
      const relatedEvents = events
        .filter(e => (e.state ?? 'happened') === 'happened')
        .filter(e => e.chapterNumber > 0 && e.chapterNumber < chapterNumber && (e.involvedEntities || []).some(ent => involvedIdSet.has(ent.id)))
        .sort((a, b) => b.chapterNumber - a.chapterNumber)
        .slice(0, 5)
        .map(e => `- 第${e.chapterNumber}章：${e.name}${e.description ? `（${e.description.slice(0, 60)}）` : ''}`)

      // 2.5 涉及实体的状态切片（第 N 章时间点，44 号：写前对齐"人物此刻什么状态"）
      const stateLines: string[] = []
      for (const ent of involvedIds) {
        try {
          const snap = await graph.stateAt(projectId, ent.type as any, ent.id, chapterNumber)
          if (snap?.stateSummary) {
            const nm = await nameOf(ent.type, ent.id)
            if (nm) stateLines.push(`- ${nm}：${snap.stateSummary}`)
          }
        } catch { /* 单实体状态读取失败不阻断 */ }
        if (stateLines.length >= 8) break
      }

      // 2.5b 关键道具口径（天下捕快实跑修复）：道具的来源/持有人/内容是跨章
      // 同一性最高的事实——告密信曾在相邻两章被写成「遗言信」与「伪造告密信」，
      // 根因是道具口径从未进入写前上下文，模型只能按设计卡自由发挥。此处显式注入：
      // (a) 本章涉及道具的物品册描述；(b) 道具最新状态切片（近几章，名册外也算——
      // 状态切片里有而名册没有的，恰恰是最容易翻转的"黑户道具"）。
      const parts: string[] = []  // H2 修复：声明上移——下方道具口径段在旧声明位置之前使用（TDZ 崩溃，blame 111f8384）
      const propLines: string[] = []
      try {
        const rosterItems = (await dbManager.lwItems?.getByProjectId(projectId)) || []
        const involvedItemIds = new Set((outline.involvedItems || []) as string[])
        for (const it of rosterItems) {
          if (!involvedItemIds.has(it.id) && it.importance !== 'main') continue
          const ownerName = it.ownerId ? await nameOf('character', it.ownerId) : null
          propLines.push(`- ${it.name}：${String((it as any).description || '').slice(0, 120)}${ownerName ? `（当前持有人：${ownerName}）` : ''}`)
          if (propLines.length >= 8) break
        }
        const itemStates = ((await dbManager.lwEntityStates?.getByProjectId(projectId)) || [])
          .filter((s: any) => s.entityType === 'item' && s.chapterNumber > 0 && s.chapterNumber < chapterNumber)
          .sort((a: any, b: any) => b.chapterNumber - a.chapterNumber)
        const seenProps = new Set<string>()
        for (const s of itemStates) {
          if (seenProps.has(s.entityName)) continue
          seenProps.add(s.entityName)
          propLines.push(`- ${s.entityName}（截至第 ${s.chapterNumber} 章的状态）：${String(s.stateSummary || '').slice(0, 120)}`)
          if (seenProps.size >= 8) break
        }
      } catch { /* 道具口径读取失败不阻断 */ }
      if (propLines.length > 0) {
        parts.push(`【关键道具口径（已确立事实——来源/持有人/内容/外观不得另起说法或翻转）】\n${propLines.join('\n')}`)
      }

      // 2.6 待回收伏笔（open 状态，防忘记回收/重复埋设）
      const foreshadowLines: string[] = []
      try {
        const foreshadows = (await dbManager.lwForeshadows?.getByProjectId(projectId)) || []
        for (const f of foreshadows.filter(x => x.status === 'open').slice(0, 6)) {
          foreshadowLines.push(`- 第${f.plantedChapter}章埋设：${f.content}`)
        }
      } catch { /* 伏笔读取失败不阻断 */ }

      // 2.6 前情事实表（54 号复测）：跨实体取最近三章已发生事件。
      // 上文 2.2 的实体过滤会饿死关键事实——《大宋女捕·复测》中第 2 章"乔镜知授予
      // 勘验权"已被事件提取落库，但第 3 章生成时未进入上下文，正文照样"郑横再次
      // 交出勘验令牌"。事实表不筛实体、按章聚合、封顶 12 条防撑爆上下文预算。
      const factLines: string[] = []
      try {
        const allEvents = (await dbManager.lwEvents?.getByProjectId(projectId)) || []
        const happened = allEvents
          .filter(e => (e.state ?? 'happened') === 'happened')
          .filter(e => e.chapterNumber > 0 && e.chapterNumber < chapterNumber)
        const recentChapters = [...new Set(happened.map(e => e.chapterNumber))].sort((a, b) => b - a).slice(0, 3)
        const seenFactNames = new Set<string>()
        for (const cn of recentChapters) {
          for (const e of happened.filter(x => x.chapterNumber === cn)) {
            if (seenFactNames.has(e.name)) continue
            seenFactNames.add(e.name)
            factLines.push(`- 第${e.chapterNumber}章：${e.name}${e.description ? `（${e.description.slice(0, 40)}）` : ''}`)
            if (factLines.length >= 12) break
          }
          if (factLines.length >= 12) break
        }
      } catch { /* 前情事实读取失败不阻断 */ }

      if (edgeLines.length > 0) {
        parts.push(`【生效关系（第 ${chapterNumber} 章时间点）】\n${edgeLines.join('\n')}`)
      }
      if (stateLines.length > 0) {
        parts.push(`【实体当前状态（截至第 ${chapterNumber - 1} 章）】\n${stateLines.join('\n')}`)
      }
      if (relatedEvents.length > 0) {
        parts.push(`【已发生事件（涉及本章实体）】\n${relatedEvents.join('\n')}`)
      }
      if (factLines.length > 0) {
        parts.push(`【前情事实表（最近三章，全书已发生）】\n${factLines.join('\n')}`)
      }
      if (foreshadowLines.length > 0) {
        parts.push(`【待回收伏笔】\n${foreshadowLines.join('\n')}`)
      }
      if (parts.length > 0) {
        parts.push('注意：写作须符合上述关系与事件的时间线状态（已失效关系不得沿用，已发生事件不得重复）；前情已交付的信物、凭证、授权（如令牌、资格）不得在本章再次"首次"交付，人物的身份、称谓与来历一经前文确立不得另起说法；本章若回收了某条伏笔，请在章末自然呼应。')
        return parts.join('\n\n')
      }
      return ''
    } catch (e) {
      console.error('[LongWritingAI] 图谱上下文构建失败:', e)
      return ''
    }
  }

  /**
   * 回忆/闪回场景提示（阶段2）：
   * 大纲概要含回忆关键词时，提示 AI 以"回忆时间点"的实体状态为准，避免与当前时间线冲突。
   */
  private buildRecallSection(
    outline: any,
    projectId: string,
    characters: any[],
    locations: any[],
    _chapterNumber: number,
  ): string {
    const summary = outline?.summary || ''
    if (!this.recallKeywords.some(kw => summary.includes(kw))) return ''

    const involvedNames = [
      ...(outline.involvedCharacters || []).map((id: string) => characters.find((c: any) => c.id === id)?.name).filter(Boolean),
      ...(outline.involvedLocations || []).map((id: string) => locations.find((l: any) => l.id === id)?.name).filter(Boolean),
    ]
    return `\n【回忆场景提示】本章为回忆/闪回内容（概要：${summary.slice(0, 40)}…）。写作时：
1. 涉及实体（${involvedNames.join('、') || '相关角色'}）的状态以"回忆发生的时间点"为准，而非当前章节状态
2. 回忆内容不得与既定时间线冲突（如回忆中人物已死亡/关系已破裂则矛盾）
3. 若无法确定回忆时间点，默认使用故事早期状态，并避免与本章后续情节矛盾`
  }

  /**
   * 计算章节序号
   */
  private calculateChapterNumber(outlines: any[], targetId: string): number {
    let count = 0
    for (const outline of outlines) {
      if (outline.nodeType === 'chapter') {
        count++
      }
      if (outline.id === targetId) {
        return count
      }
    }
    return count || 1
  }

  // ==================== 章节写作辅助函数 ====================

  /**
   * 计算中文字数
   * 中文字符按字符计算，英文按单词计算
   */
  private countChineseChars(text: string): number {
    if (!text) return 0
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
    return chineseChars + englishWords
  }

  /**
   * 从上一章正文结尾按段落截取指定字数的内容
   * @param content 章节正文内容
   * @param targetChars 目标字数（缺省取「参数设置 → 长文写作 → 上章结尾注入字数」）
   */
  private extractEndingContentByParagraph(
    content: string,
    targetChars: number = longwritingParams().writing.previousChapterEndingChars
  ): string {
    if (!content || content.length <= targetChars) {
      return content || ''
    }

    // 按段落分割（处理换行符）
    const paragraphs = content.split(/\n+/).filter(p => p.trim().length > 0)

    // 从末尾向前累加段落，确保段落完整
    const resultParagraphs: string[] = []
    let totalChars = 0

    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const paragraph = paragraphs[i]
      const paragraphChars = this.countChineseChars(paragraph)

      // 如果已经达到目标字数且当前段落会导致超出太多，则停止
      if (totalChars + paragraphChars > targetChars + 50 && totalChars >= 500) {
        break
      }

      resultParagraphs.unshift(paragraph)
      totalChars += paragraphChars

      // 达到目标字数的下限即可停止
      if (totalChars >= targetChars - 50) {
        break
      }
    }

    return resultParagraphs.join('\n')
  }

  /**
   * 构建角色完整信息
   * @param character 角色信息
   * @param entityState 实体状态（可选）
   */
  private buildCharacterFullInfo(
    character: any,
    entityState?: { stateSummary: string } | null
  ): string {
    const genderMap: Record<string, string> = { male: '男', female: '女', other: '其他' }
    const rolePositionMap: Record<string, string> = {
      protagonist: '主角',
      supporting: '配角',
      antagonist: '反派',
      minor: '小角色'
    }

    let info = `【${character.name}】\n`
    info += `- 基本信息：${genderMap[character.gender] || '未知'}，${character.age}岁`
    if (character.occupation) info += `，职业：${character.occupation}`
    info += '\n'

    if (character.appearance) info += `- 外貌特征：${character.appearance}\n`
    if (character.personality) info += `- 性格特点：${character.personality}\n`
    if (character.background) info += `- 背景故事：${character.background}\n`
    if (character.abilities) info += `- 能力特长：${character.abilities}\n`
    // 四层人设（设定资产库 P0 列 / IP 库导入随行；M2 修复：此前只存不注入）
    if (character.motivation) info += `- 核心欲望：${character.motivation}（其行动的内在引擎，剧情选择应与之自洽）\n`
    if (character.flaw) info += `- 软肋：${character.flaw}（欲望的反差面——诱惑/威胁面前最容易失守之处）\n`
    if (character.characterArc) info += `- 人物弧光：${character.characterArc}（成长终点方向，非既成事实——按当前进度逐步演进，勿一步到位）\n`

    info += `- 角色定位：${rolePositionMap[character.rolePosition] || '未指定'}\n`

    if (entityState?.stateSummary) {
      info += `- 当前状态：${entityState.stateSummary}\n`
    }

    return info
  }

  /**
   * 构建地点完整信息
   * @param location 地点信息
   * @param entityState 实体状态（可选）
   */
  private buildLocationFullInfo(
    location: any,
    entityState?: { stateSummary: string } | null
  ): string {
    const typeMap: Record<string, string> = {
      city: '城市',
      village: '村庄',
      mountain: '山脉',
      palace: '宫殿',
      forest: '森林',
      sea: '海域',
      building: '建筑',
      other: '其他'
    }
    const importanceMap: Record<string, string> = {
      main: '主要场景',
      important: '重要场景',
      auxiliary: '辅助场景'
    }

    let info = `【${location.name}】\n`
    info += `- 地点类型：${typeMap[location.type] || '其他'}\n`
    info += `- 重要程度：${importanceMap[location.importance] || '一般'}\n`

    if (location.description) {
      info += `- 详细描述：${location.description}\n`
    }

    if (entityState?.stateSummary) {
      info += `- 当前状态：${entityState.stateSummary}\n`
    }

    return info
  }

  /**
   * 构建背景设定上下文
   * @param background 背景设定
   */
  private buildBackgroundContext(background: any | null): string {
    if (!background) return ''

    const eraTypeMap: Record<string, string> = {
      ancient: '古代',
      modern: '现代',
      future: '未来',
      fictional: '虚构世界'
    }

    let context = '【世界观设定】\n'
    context += `- 时代背景：${eraTypeMap[background.eraType] || '未知'}\n`

    if (background.eraDescription) {
      context += `- 时代描述：${background.eraDescription}\n`
    }
    if (background.socialStructure) {
      context += `- 社会结构：${background.socialStructure}\n`
    }
    if (background.techLevel) {
      context += `- 技术水平：${background.techLevel}\n`
    }
    if (background.specialRules) {
      context += `- 特殊规则：${background.specialRules}\n`
    }
    if (background.factionDistribution) {
      context += `- 势力分布：${background.factionDistribution}\n`
    }
    if (background.geographicOrientation) {
      context += `- 地理方位：${background.geographicOrientation}\n`
    }

    return context
  }

  /**
   * 计算故事进度阶段
   * @param chapterNumber 当前章节序号
   * @param totalChapters 预估总章节数
   */
  private calculateStoryProgressStage(
    chapterNumber: number,
    totalChapters: number
  ): string {
    if (totalChapters <= 0) return '故事展开阶段'

    const progress = chapterNumber / totalChapters

    if (progress <= 0.1) return '故事开端阶段'
    if (progress <= 0.3) return '故事展开阶段'
    if (progress <= 0.5) return '故事深化阶段'
    if (progress <= 0.7) return '故事高潮铺垫阶段'
    if (progress <= 0.9) return '故事高潮阶段'
    return '故事收尾阶段'
  }

  /**
   * 获取故事类型名称
   */
  private getStoryTypeName(storyType: string): string {
    const typeNames: Record<string, string> = {
      wuxia: '武侠',
      xianxia: '仙侠',
      xuanhuan: '玄幻',
      kehuan: '科幻',
      xuanyi: '悬疑',
      dushi: '都市',
      yanqing: '言情',
      lishi: '历史',
      other: '其他'
    }
    return typeNames[storyType] || storyType || '未指定'
  }

  /**
   * 生成评论段落内容
   */
  async generateSection(
        eventId: string,
    projectId: string,
    outlineId: string,
    targetWords?: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()
    // 「参数设置 → 长文写作 → 段落目标字数」：方法内现读
    const { sectionTargetWords } = longwritingParams().writing

    // 获取大纲节点
    const outline = await dbManager.lwOutlines?.getById(outlineId)
    if (!outline) {
      return { success: false, error: '大纲节点不存在' }
    }

    // 获取主题和素材
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const materials = await dbManager.lwMaterials?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的评论文章作者。请根据大纲节点信息，撰写段落内容。
要求：
1. 观点明确，论证有力
2. 引用素材时要自然融入
3. 语言要专业但不晦涩
4. 控制字数在目标范围内

直接输出段落内容，不需要标题、不需要额外说明。`

    const relevantMaterials = materials.filter(m =>
      outline.involvedCharacters?.includes(m.id) || materials.indexOf(m) < 3
    ).slice(0, 3)

    const materialContext = relevantMaterials.map(m =>
      `【${m.name}】\n${m.content?.slice(0, 500) || '内容未加载'}`
    ).join('\n\n')

    const prompt = `请根据以下信息，撰写评论段落：

文章主题：${overview?.title || '未命名'}
核心观点：${overview?.coreIdea || '未指定'}
段落标题：${outline.name}
段落要点：${outline.summary}
目标字数：${targetWords || outline.estimatedWords || sectionTargetWords}字

可用素材：
${materialContext || '无特定素材'}

请开始撰写段落内容：`

    try {
      const result = await this.callAIStream(
        eventId,
        prompt,
        systemPrompt,
        Math.min((targetWords || outline.estimatedWords || sectionTargetWords) * 2, 4096),
        providerConfigId,
        modelId
      )

      return { success: true, data: { content: result } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 情节生成 ====================

  /**
   * 生成故事情节
   */
  async generatePlots(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    // 获取角色列表
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取地点列表
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 获取技能物品
    const skills = await dbManager.lwSkills?.getByProjectId(projectId) || []
    const items = await dbManager.lwItems?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要、背景设定、角色等信息，生成主要的故事情节列表。
你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每个情节包含以下字段：
- title: 情节标题（不超过 15 字）
- summary: 情节概要（100-200字，必须覆盖四拍：起因→冲突升级→转折→本线阶段性终点，并写明与核心主线的纠缠点；禁止一句话剧情简介）
- involvedCharacters: 涉及的角色名称列表（字符串数组）
- entityRelations: 本情节中体现的实体间**确定关系**（可选数组，没有可留空）。每项：{"sourceType": "character/location/item/faction", "sourceName": "源实体名（必须与项目中实体名逐字一致）", "targetType": "character/location/item/faction", "targetName": "目标实体名（逐字一致）", "relationType": "关系类型（师徒/宿敌/所在/持有等）", "description": "关系说明（20-40字）"}

要求：
1. 第一条必须是主线（承载故事概要的核心冲突与终局）；其余情节需说明与主线的纠缠关系
2. 情节按时间顺序排列，相邻情节间要有因果推动，禁止纯并列罗列
3. 情节之间要有逻辑关联，考虑背景设定的世界观
4. 情节数量根据预估章节数合理设置（约 10-30 个）
5. 每个情节要明确涉及的角色
6. 充分利用背景设定中的时代、社会结构等元素
7. 可以融入技能、物品等元素增加故事丰富度
8. entityRelations 只输出情节中明确体现的关系，用于构建人物/地点/物品关系网络

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建角色信息
    const characterInfo = characters.map(c => {
      let info = `${c.name}`
      if (c.rolePosition) info += `（${c.rolePosition}）`
      if (c.personality) info += `，性格：${c.personality}`
      return info
    }).join('\n')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代：${background.eraDescription}\n`
      if (background.socialStructure) backgroundInfo += `社会结构：${background.socialStructure}\n`
      if (background.techLevel) backgroundInfo += `技术水平：${background.techLevel}\n`
    }

    // 构建地点信息
    const locationInfo = locations.map(l => l.name).join('、')

    // 构建技能物品信息
    const skillInfo = skills.map(s => s.name).join('、')
    const itemInfo = items.map(i => `${i.name}${i.ownerId ? `（持有者：${characters.find(c => c.id === i.ownerId)?.name || '未知'}）` : ''}`).join('、')

    const prompt = `请根据以下故事信息生成主要情节：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}
【核心冲突】${overview.coreConflict || '未指定'}
【预估章节】${overview.estimatedChapters || 20} 章

【主要角色】
${characterInfo || '暂无'}

【背景设定】
${backgroundInfo || '暂无'}

【主要地点】${locationInfo || '暂无'}

【技能体系】${skillInfo || '暂无'}

【重要物品】${itemInfo || '暂无'}

请生成 10-30 个主要情节，按时间顺序排列。充分考虑角色性格、背景设定、地点等元素。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 8192, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 背景润色 ====================

  /**
   * 润色背景设定
   */
  async polishBackground(
        eventId: string,
    projectId: string,
    field: 'eraDescription' | 'socialStructure' | 'techLevel' | 'specialRules' | 'factionDistribution' | 'geographicOrientation',
    eraType: string,
    content: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要作为上下文
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)

    const fieldLabels: Record<string, string> = {
      eraDescription: '时代描述',
      socialStructure: '社会结构',
      techLevel: '技术水平',
      specialRules: '特殊规则',
      factionDistribution: '势力分布',
      geographicOrientation: '地理方位'
    }

    // 不同字段的润色提示
    const fieldPrompts: Record<string, string> = {
      eraDescription: '请扩展成详细的时代背景描述，内容控制在 200-400 字。',
      socialStructure: '请扩展成详细的社会结构描述，包括阶层划分、社会制度、权力结构等，内容控制在 200-400 字。',
      techLevel: '请扩展成详细的技术水平描述，包括主要技术特点、科技发展程度、对生活的影响等，内容控制在 200-400 字。',
      specialRules: '请扩展成详细的世界规则描述，包括具体的等级划分、能力体系、限制条件、特殊法则等，内容控制在 300-500 字。',
      factionDistribution: '请扩展成详细的势力分布描述，包括各势力的地理位置、势力范围、相互关系、主要冲突等，内容控制在 300-500 字。',
      geographicOrientation: '请扩展成详细的地理方位描述，包括各区域的气候特点、地形地貌、标志性地理特征等，内容控制在 300-500 字。'
    }

    const systemPrompt = `你是一位专业的小说创作顾问，擅长丰富和润色故事背景设定。
请根据用户提供的故事概要和简要描述，扩展成更加详细、生动的背景设定。

要求：
1. 背景设定必须与故事概要紧密相关，为故事服务
2. 保持原文核心意图，不要偏离主题
3. 增加细节和氛围感，让设定更加具体
4. 语言要有画面感，适合小说创作使用
5. 根据不同字段的特点进行针对性扩展

直接输出润色后的内容，不需要标题、不需要额外说明。`

    const eraTypeLabels: Record<string, string> = {
      ancient: '古代',
      modern: '现代',
      future: '未来',
      fictional: '架空'
    }

    // 构建故事概要上下文
    const overviewContext = overview ? `
【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}
【核心冲突】${overview.coreConflict || '未指定'}
${overview.keyCharacters?.length ? `【关键角色】${overview.keyCharacters.map((c: any) => c.name).join('、')}` : ''}
${overview.keyLocations?.length ? `【主要场景】${overview.keyLocations.map((l: any) => l.name).join('、')}` : ''}
` : ''

    const prompt = `请根据以下故事信息，润色${fieldLabels[field] || '背景设定'}：

${overviewContext}
【时代类型】${eraTypeLabels[eraType] || eraType}
【原始描述】${content}

${fieldPrompts[field] || '请扩展成详细的描述，内容控制在 200-400 字。'}

注意：背景设定要与故事内容相呼应，为故事发展提供支撑。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 1024, providerConfigId, modelId)

      return { success: true, data: { content: result } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 地点生成 ====================

  /**
   * AI 生成地点建议
   */
  async generateLocations(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取已有地图
    const maps = await dbManager.lwMaps?.getByProjectId(projectId) || []

    // 获取已有地点
    const existingLocations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说世界观设计师，擅长设计丰富多彩的地点设定。
请根据用户提供的信息，生成适合故事背景的地点建议。

**重要**：请控制回复长度，总字数不超过1500字。

你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每个地点包含以下字段：
{
  "name": "地点名称",
  "type": "地点类型，可选值：city/village/mountain/palace/forest/sea/building/other",
  "importance": "重要程度，可选值：main/important/auxiliary",
  "description": "地点描述（120-200字，必须覆盖四层：可感的场景特征——视听嗅至少两种感官细节、独有氛围、在故事中的功能——哪类情节在此发生/它如何推动主线、与角色的关系——谁常来/谁怕这里/这里发生过什么；禁止一句风景介绍）",
  "suggestedMapId": "建议关联的地图ID（从已有地图中选择，如果没有合适的可不填）"
}

地点类型说明：
- city: 城市
- village: 村庄
- mountain: 山脉
- palace: 宫殿
- forest: 森林
- sea: 海域
- building: 建筑
- other: 其他

重要程度说明：
- main: 主要地点（故事核心场景，多次出现）
- important: 重要地点（关键情节发生地）
- auxiliary: 辅助地点（背景或过场场景）

生成原则：
1. 根据地理方位描述生成符合世界观的地点
2. 地点应该有明确的功能和故事意义
3. 不要重复已有地点
4. 建议生成 3-6 个地点
5. 如果有地图，尽量为地点匹配合适的地图

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建地图信息
    const mapInfo = maps.map(m => `${m.name}(${m.id})-${m.orientation || '方位未指定'}`).join('、')

    // 构建已有地点信息
    const existingLocationInfo = existingLocations.map(l => `${l.name}(${l.type})`).join('、')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代描述：${background.eraDescription}\n`
      if (background.geographicOrientation) backgroundInfo += `地理方位：${background.geographicOrientation}\n`
      if (background.factionDistribution) backgroundInfo += `势力分布：${background.factionDistribution}\n`
    }

    const prompt = `请根据以下信息生成地点建议：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}

【背景设定】
${backgroundInfo || '暂无'}

【已有地图】${mapInfo || '暂无'}

【已有地点】${existingLocationInfo || '暂无'}

请生成适合这个故事的地点建议。如果有地图，请为每个地点建议合适的地图关联。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 势力生成 ====================

  /**
   * AI 生成势力建议
   */
  async generateFactions(
        eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取已有地点
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 获取已有势力
    const existingFactions = await dbManager.lwFactions?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说世界观设计师，擅长设计丰富多彩的势力设定。
请根据用户提供的信息，生成适合故事背景的势力建议。

**重要**：请控制回复长度，总字数不超过1500字。

你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每个势力包含以下字段：
{
  "factionType": "势力类型，可选值：country/camp/sect",
  "name": "势力名称",
  "suggestedLocationName": "建议关联的地点名称（从已有地点中选择，如果没有合适的可不填）",
  "description": "势力描述（50-100字，说明势力的特点、主要成员、在故事中的作用）"
}

势力类型说明：
- country: 国别（国家、王国、帝国等）
- camp: 阵营（正派、反派、中立阵营等）
- sect: 门派（宗门、教派、帮派等）

生成原则：
1. 根据势力分布描述生成符合世界观的势力
2. 势力应该有明确的定位和故事意义
3. 不要重复已有势力
4. 势力名称要与故事类型匹配
5. 建议生成 3-6 个势力
6. 如果有地点，尽量为势力建议合适的所在地

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建地点信息
    const locationInfo = locations.map(l => `${l.name}(${l.id})`).join('、')

    // 构建已有势力信息
    const existingFactionInfo = existingFactions.map(f => `${f.name}(${f.factionType === 'country' ? '国别' : f.factionType === 'camp' ? '阵营' : '门派'})`).join('、')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代描述：${background.eraDescription}\n`
      if (background.factionDistribution) backgroundInfo += `势力分布：${background.factionDistribution}\n`
      if (background.specialRules) backgroundInfo += `特殊规则：${background.specialRules}\n`
    }

    const prompt = `请根据以下信息生成势力建议：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}

【背景设定】
${backgroundInfo || '暂无'}

【已有地点】${locationInfo || '暂无'}

【已有势力】${existingFactionInfo || '暂无'}

请生成适合这个故事的势力建议。如果有地点，请为每个势力建议合适的所在地。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 地图数据生成 ====================

  /**
   * 生成地图数据
   */
  async generateMapData(
        eventId: string,
    projectId: string,
    mapId: string,
    userPrompt: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取已有地点
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 获取已有势力
    const factions = await dbManager.lwFactions?.getByProjectId(projectId) || []

    // 获取地图信息
    const map = mapId ? await dbManager.lwMaps?.getById(mapId) : null

    const systemPrompt = `你是一位专业的小说世界观设计师，擅长设计丰富多彩的地图设定。
请根据用户提供的信息，生成详细的地图数据。

**重要**：请控制回复长度，总字数不超过1000字。

你的回复必须是纯 JSON 格式（不要包含 \`\`\`json 标记），包含以下字段：
{
  "regions": [
    {
      "name": "区域名称",
      "description": "区域描述（50-100字）",
      "features": ["特征1", "特征2"]
    }
  ],
  "landmarks": [
    {
      "name": "地标名称",
      "type": "地标类型（如城市、山脉、河流等）",
      "description": "地标描述（30-50字）"
    }
  ],
  "terrain": [
    {
      "type": "地形类型",
      "description": "地形描述",
      "area": "分布区域"
    }
  ],
  "climate": "气候特征描述",
  "resources": ["资源1", "资源2", "资源3"],
  "conflicts": [
    {
      "type": "冲突类型",
      "description": "冲突描述",
      "parties": ["冲突方1", "冲突方2"]
    }
  ]
}

请直接输出 JSON 对象，不要有任何额外文字。`

    // 构建地点信息
    const locationInfo = locations.map(l => `${l.name}（${l.type}）`).join('、')

    // 构建势力信息
    const factionInfo = factions.map(f => `${f.name}（${f.factionType === 'country' ? '国别' : f.factionType === 'camp' ? '阵营' : '门派'}）`).join('、')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代：${background.eraDescription}\n`
      if (background.socialStructure) backgroundInfo += `社会结构：${background.socialStructure}\n`
      if (background.techLevel) backgroundInfo += `技术水平：${background.techLevel}\n`
    }

    const prompt = `请根据以下信息生成地图数据：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}

【背景设定】
${backgroundInfo || '暂无'}

【已有地点】${locationInfo || '暂无'}

【已有势力】${factionInfo || '暂无'}

${map ? `【地图名称】${map.name}
【地图方位】${map.orientation || '未指定'}
【地图特点】${map.characteristics || '未指定'}` : ''}

【用户需求】
${userPrompt || '请根据故事背景生成合适的地图数据'}

请生成详细的地图数据，包含区域、地标、地形、气候、资源和冲突信息。直接返回 JSON 格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 记忆提取 ====================

  /**
   * 从预写内容中提取记忆
   */
  async extractMemories(
        eventId: string,
    projectId: string,
    outlineId: string,
    prewriteContent: string,
    chapterNumber: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取项目中的角色、地点、物品、势力等信息，用于实体匹配
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []
    const skills = await dbManager.lwSkills?.getByProjectId(projectId) || []
    const items = await dbManager.lwItems?.getByProjectId(projectId) || []
    const factions = await dbManager.lwFactions?.getByProjectId(projectId) || []

    // 构建实体参考列表
    const entityReference = {
      characters: characters.map(c => ({ id: c.id, name: c.name })),
      locations: locations.map(l => ({ id: l.id, name: l.name })),
      skills: skills.map(s => ({ id: s.id, name: s.name })),
      items: items.map(i => ({ id: i.id, name: i.name })),
      factions: factions.map(f => ({ id: f.id, name: f.name }))
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请从章节预写内容中提取关键记忆信息。

**重要**：请控制回复长度，总字数不超过1500字。

你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每条记忆包含以下字段：
- memoryType: 记忆类型，可选值：
  - character_event（角色事件：角色的重要经历、成长、变化）
  - location_event（地点事件：地点的重要变化、发现）
  - item_event（物品事件：物品的获得、失去、变化）
  - relationship_change（关系变化：角色间关系的建立、改变、破裂）
  - faction_event（势力事件：势力的兴衰、更替、冲突）
  - general（一般事件：其他重要情节）
- title: 简短标题（10-20字）
- description: 详细描述（50-100字，说明事件的来龙去脉）
- involvedEntities: 涉及的实体数组，格式：[{type, id, name}]
  - type 可选：character/location/item/skill/faction
  - id 使用提供的实体列表中的 ID
  - name 使用实体的名称
- importance: 重要程度
  - critical（关键：改变故事走向的重大事件，如主角突破、重要角色死亡、势力覆灭）
  - normal（重要：有长期影响的情节，如学到新技能、结交盟友、获得重要物品）
  - minor（次要：有记录价值但影响有限，如日常互动、小冲突）

提取原则：
1. 只提取有长期影响的信息，不要提取临时性的对话或场景描写
2. 重点关注：角色成长、关系变化、物品得失、势力变动、重要发现
3. 每个事件独立成条，避免重复
4. 如果预写内容中没有值得记录的事件，返回空数组 []

请直接输出 JSON 数组，不要有任何额外文字。`

    const prompt = `【已知实体参考】
角色：${entityReference.characters.map(c => `${c.name}(${c.id})`).join('、') || '无'}
地点：${entityReference.locations.map(l => `${l.name}(${l.id})`).join('、') || '无'}
技能：${entityReference.skills.map(s => `${s.name}(${s.id})`).join('、') || '无'}
物品：${entityReference.items.map(i => `${i.name}(${i.id})`).join('、') || '无'}
势力：${entityReference.factions.map(f => `${f.name}(${f.id})`).join('、') || '无'}

【章节预写内容】
${prewriteContent}

请从以上预写内容中提取关键记忆信息。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      // 如果没有匹配到数组，可能没有提取到记忆
      return { success: true, data: [] }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取章节生成时的记忆上下文
   */
  private async getMemoryContext(projectId: string, chapterNumber: number): Promise<string> {
    const dbManager = getCoreDatabaseManager()
    // 「参数设置 → 长文写作 → 记忆注入条数」：方法内现读
    const { normalMemoryLimit, minorMemoryLimit } = longwritingParams().writing
    const memories = await dbManager.lwMemories?.getMemoriesBeforeChapter(projectId, chapterNumber) || []

    if (memories.length === 0) {
      return ''
    }

    // 按重要程度分组
    const criticalMemories = memories.filter(m => m.importance === 'critical')
    const normalMemories = memories.filter(m => m.importance === 'normal')
    const minorMemories = memories.filter(m => m.importance === 'minor')

    // 构建记忆上下文
    let context = '\n\n【重要记忆】请确保以下情节要点在写作中保持一致：\n'

    // 关键记忆
    if (criticalMemories.length > 0) {
      context += '\n【关键事件】\n'
      criticalMemories.forEach(m => {
        context += `- [${this.getMemoryTypeLabel(m.memoryType)}] ${m.title}：${m.description}\n`
      })
    }

    // 重要记忆
    if (normalMemories.length > 0) {
      context += '\n【重要情节】\n'
      normalMemories.slice(0, normalMemoryLimit).forEach(m => {
        context += `- [${this.getMemoryTypeLabel(m.memoryType)}] ${m.title}：${m.description}\n`
      })
      if (normalMemories.length > normalMemoryLimit) {
        context += `  ... 还有 ${normalMemories.length - normalMemoryLimit} 条记忆\n`
      }
    }

    // 次要记忆（只显示最近几条）
    if (minorMemories.length > 0) {
      context += '\n【其他参考】\n'
      minorMemories.slice(-minorMemoryLimit).forEach(m => {
        context += `- ${m.title}\n`
      })
    }

    return context
  }

  /**
   * 获取记忆类型标签
   */
  private getMemoryTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      character_event: '角色',
      location_event: '地点',
      item_event: '物品',
      relationship_change: '关系',
      faction_event: '势力',
      skill_event: '技能',
      general: '事件'
    }
    return labels[type] || '事件'
  }

  // ==================== 实体状态提取 ====================

  /**
   * 从章节正文中提取实体状态快照
   */
  async extractEntityStates(
        eventId: string,
    projectId: string,
    outlineId: string,
    chapterContent: string,
    chapterNumber: number,
    involvedEntities: Array<{ type: string; id: string; name: string }>,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取每个实体在上一章节的状态
    const previousStates: Array<{ entity: any; state: any }> = []
    for (const entity of involvedEntities) {
      const prevState = await dbManager.lwEntityStates?.getEntityStateAtChapter(
        projectId,
        entity.type as any,
        entity.id,
        chapterNumber - 1
      )
      previousStates.push({
        entity,
        state: prevState
      })
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请分析章节正文内容，提取涉及实体的最新状态。

**重要**：请控制回复长度，总字数不超过3500字。这份状态是后续章节一致性检查（写后审查）的数据面——漏一个实体，下一章的矛盾就查不出来，覆盖优先于简洁。

## 实体类型说明（各维度尽可能覆盖全面）
- character（角色）：存活状态、当前位置、身体状态与永久性标记（伤病/疤/茧/孕等）、能力与技能变化（新习得/生疏/丧失）、持有物品变化（得到/交出/丢失了什么）、人际关系变化（与谁结成/破裂/转变了什么关系）、身份地位变化、知情范围（知道/不知道哪些关键信息）
- location（地点）：状态（正常/毁坏/戒严/发现中）、归属势力、重要特征变化
- item（物品）：持有者、状态（完好/损坏/丢失/易主）、当前位置
- faction（势力）：领导者、状态（兴盛/衰落/覆灭）、控制区域变化
- skill（技能）：掌握者列表、传承情况、等级分布

## 输出格式
返回 JSON 数组，每个实体一条记录：
{
  "entityType": "character/location/item/faction/skill",
  "entityId": "实体ID",
  "entityName": "实体名称",
  "stateSummary": "完整的状态摘要描述（100-200字，包含所有关键状态信息）",
  "keyChanges": ["本章节导致的关键变化列表（分类覆盖：发生的事件/能力变化/持有物变化/关系变化/身体变化/知情变化，有什么写什么）"]
}

## 状态摘要原则
1. 状态是"最新结果"，不是"过程描述"——如"已死亡"而非"第2章受伤，第3章死亡"
2. 状态摘要应完整，包含该实体当前所有关键信息
3. 只描述正文实际确立的状态（接地硬约束）：不得推断尚未揭示的目的/动机/隐藏标记/特殊体质；角色台词里的将来时与假设（"七日后将死""若不……就……"）是威胁不是当前状态，禁止写成已发生
4. 如果实体在本章节无变化，但有上一状态，则继承上一状态并补充新变化
5. 如果实体首次出现且无上一状态，从章节内容和设定信息推断初始状态
6. keyChanges 只记录本章节新增的变化，便于追溯
7. 全要素覆盖（硬约束）：只要实体在本章正文有戏份（出场/被提及行动/状态被改变），就必须输出该实体——即使状态无变化也输出继承状态；禁止因"整体变化不大"而整章跳过

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建上一状态信息
    const previousStatesInfo = previousStates
      .filter(s => s.state)
      .map(s => `【${s.entity.name}】（第${s.state.chapterNumber}章状态）：${s.state.stateSummary}`)
      .join('\n')

    const prompt = `【章节正文内容】
${chapterContent.substring(0, 12000)}${chapterContent.length > 12000 ? '...(内容已截断)' : ''}

【涉及的实体】
${involvedEntities.map(e => `- ${e.name}（类型：${e.type}，ID：${e.id}）`).join('\n')}

【实体上一章节状态】
${previousStatesInfo || '无历史状态'}

请分析以上章节内容，为涉及的实体生成状态快照。涉及实体中只要在本章正文有戏份的都必须输出；完全未出场的实体可以不输出。返回 JSON 对象 {"items": [...]}，items 为状态快照数组。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 4000, providerConfigId, modelId, {
        responseFormat: { type: 'json_object' },
      })

      const parsed = parseJsonPayload(result)
      const arr = parsed.ok ? extractArrayField(parsed.data, 'items') : null
      if (arr) {
        return { success: true, data: arr }
      }

      // 如果没有提取到状态变化，返回空数组（上层按"无切片"处理）
      return { success: true, data: [] }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取章节生成时的实体状态上下文
   */
  async getEntityStateContext(
    projectId: string,
    chapterNumber: number,
    involvedEntities: Array<{ type: string; id: string }>
  ): Promise<string> {
    const dbManager = getCoreDatabaseManager()

    if (!involvedEntities || involvedEntities.length === 0) {
      return ''
    }

    // 获取每个实体在上一章节的状态
    const states: Array<{ entity: any; state: any }> = []
    for (const entity of involvedEntities) {
      const state = await dbManager.lwEntityStates?.getEntityStateAtChapter(
        projectId,
        entity.type as any,
        entity.id,
        chapterNumber - 1
      )
      if (state) {
        states.push({ entity, state })
      }
    }

    if (states.length === 0) {
      return ''
    }

    // 按实体类型分组
    const byType: Record<string, typeof states> = {
      character: [],
      location: [],
      item: [],
      faction: [],
      skill: []
    }

    for (const item of states) {
      byType[item.state.entityType]?.push(item)
    }

    // 构建状态上下文
    let context = '\n\n【重要：实体状态一致性】请确保以下实体状态在写作中保持一致：\n'

    // 角色状态
    if (byType.character.length > 0) {
      context += '\n【角色状态】\n'
      byType.character.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 地点状态
    if (byType.location.length > 0) {
      context += '\n【地点状态】\n'
      byType.location.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 物品状态
    if (byType.item.length > 0) {
      context += '\n【物品状态】\n'
      byType.item.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 势力状态
    if (byType.faction.length > 0) {
      context += '\n【势力状态】\n'
      byType.faction.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 技能状态
    if (byType.skill.length > 0) {
      context += '\n【技能状态】\n'
      byType.skill.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    context += '\n【注意事项】\n'
    context += '1. 已死亡的角色不能再出现\n'
    context += '2. 已学会的技能不能再"初学"\n'
    context += '3. 已获得的物品不能再"首次获得"\n'
    context += '4. 已建立的关系不能忽略\n'
    context += '5. 状态变化需要合乎逻辑\n'

    return context
  }

  // ==================== 章节实体识别 ====================

  /**
   * 从章节正文中自动识别涉及的实体（角色、地点等）
   * 用于在没有手动设置涉及实体时自动识别
   */
  async recognizeChapterEntities(
        eventId: string,
    projectId: string,
    chapterContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 获取项目中的所有角色、地点和物品
    const characters = (await dbManager.lwCharacters?.getByProjectId(projectId)) || []
    const locations = (await dbManager.lwLocations?.getByProjectId(projectId)) || []
    await dbManager.lwItems?.getByProjectId(projectId)

    const systemPrompt = `你是一位专业的小说内容分析师。请分析章节正文，识别其中涉及的角色和地点。

**重要**：请控制回复长度，总字数不超过500字。

## 任务说明
1. 对照项目角色库和地点库，识别章节中出现的角色和地点
2. 即使角色/地点只是被提及（没有实际出场），只要章节内容中有提及就应该列出
3. 使用精确匹配：只识别确实存在于项目库中的角色和地点

## 输出格式
返回 JSON 对象：
{
  "characters": ["角色ID1", "角色ID2", ...],
  "locations": ["地点ID1", "地点ID2", ...],
  "events": ["事件1简述", "事件2简述", ...]
}

如果某个类别没有识别到，返回空数组即可。请直接输出 JSON，不要有任何额外文字。`

    // 构建角色和地点列表
    const characterList = characters.map(c => `- ${c.name}（ID: ${c.id}）`).join('\n')
    const locationList = locations.map(l => `- ${l.name}（ID: ${l.id}）`).join('\n')

    const prompt = `【项目角色库】
${characterList || '无'}

【项目地点库】
${locationList || '无'}

【章节正文内容】
${chapterContent.substring(0, 12000)}${chapterContent.length > 12000 ? '...(内容已截断)' : ''}

请分析以上章节内容，识别其中涉及的角色和地点，并简要列出发生的事件。直接返回 JSON 格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 1500, providerConfigId, modelId)

      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      let recognizedCharacters: any[] = []
      let recognizedLocations: any[] = []
      let events: string[] = []

      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        // 转换为完整的实体信息
        recognizedCharacters = (data.characters || []).map((id: string) => {
          const char = characters.find(c => c.id === id)
          return char ? { id: char.id, name: char.name } : null
        }).filter(Boolean)

        recognizedLocations = (data.locations || []).map((id: string) => {
          const loc = locations.find(l => l.id === id)
          return loc ? { id: loc.id, name: loc.name } : null
        }).filter(Boolean)

        events = data.events || []
      }

      // 检测新实体
      let newEntities = null
      try {
        const { LwEntityDetectionService } = await import('@core/platform/episode-production/auto-binding/lw-entity-detection.service')
        newEntities = await LwEntityDetectionService.detectNewEntities(
          projectId,
          chapterContent,
          undefined, // sourceOutlineId - 暂时不知道，可以后续补充
          undefined  // chapterNumber - 暂时不知道
        )

        // 如果检测到新实体，发送事件通知前端
        if (newEntities && (
          newEntities.newCharacters.length > 0 ||
          newEntities.newLocations.length > 0 ||
          newEntities.newItems.length > 0
        )) {
          getEventEmitter().emit(`longwriting:new-entities-detected:${eventId}`, {
            type: 'new_entities',
            newEntities
          })
        }
      } catch (err) {
        console.error('[LongWritingAI] 新实体检测失败:', err)
        // 新实体检测失败不影响主流程
      }

      return {
        success: true,
        data: {
          characters: recognizedCharacters,
          locations: recognizedLocations,
          events,
          newEntities: newEntities ? {
            newCharacters: newEntities.newCharacters,
            newLocations: newEntities.newLocations,
            newItems: newEntities.newItems
          } : null
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 章节状态摘要 ====================

  /**
   * 从章节正文中提取章节状态摘要
   * 包括：故事时间、当前位置、角色状态、待处理事件
   */
  async extractChapterStateSummary(
        eventId: string,
    projectId: string,
    outlineId: string,
    chapterContent: string,
    chapterNumber: number,
    previousSummary?: {
      storyTime: string
      currentLocation: string
      characterStates: string
      pendingEvents: string
    },
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const systemPrompt = `你是一位专业的小说内容分析师。请分析章节正文，提取章节结束时的故事状态摘要。

## 任务说明
1. 确定章节结束时的"故事内时间"（如：第一年春三月十五日傍晚）
2. 确定章节结束时的"当前位置"（主要场景或主角所在位置）
3. 总结"角色状态"：各主要角色在章节结束时的状态、位置、心情等
4. 列出"待处理事件"：未解决的伏笔、悬念、待发生的事件
5. 总结"关键变化"：本章发生的重要变化

## 时间确定原则
- 如果是第一章，时间从故事开始算起
- 如果有上一章的时间信息，要确保时间连续性
- 时间格式要符合小说世界观设定

## 输出格式
返回 JSON 对象：
{
  "storyTime": "故事内时间",
  "currentLocation": "当前地点",
  "characterStates": "角色状态概要（简洁描述各主要角色状态）",
  "pendingEvents": "待处理事件/伏笔（如果没有则为空字符串）",
  "keyChanges": "本章关键变化"
}

请直接输出 JSON，不要有任何额外文字。`

    // 构建上一章信息（如果有）
    const previousInfo = previousSummary
      ? `\n【上一章结束状态】
故事时间：${previousSummary.storyTime}
当前位置：${previousSummary.currentLocation}
角色状态：${previousSummary.characterStates}
待处理事件：${previousSummary.pendingEvents || '无'}`
      : '\n【说明】这是第一章，没有上一章信息。'

    const prompt = `【章节正文内容】
${chapterContent.substring(0, 12000)}${chapterContent.length > 12000 ? '...(内容已截断)' : ''}

【章节序号】第${chapterNumber}章
${previousInfo}

请分析以上章节内容，提取章节结束时的故事状态摘要。直接返回 JSON 格式的结果。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 1500, providerConfigId, modelId, {
        responseFormat: { type: 'json_object' },
      })

      const parsed = parseJsonPayload(result)
      if (parsed.ok && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
        const data = parsed.data as Record<string, unknown>
        return {
          success: true,
          data: {
            storyTime: String(data.storyTime || ''),
            currentLocation: String(data.currentLocation || ''),
            characterStates: String(data.characterStates || ''),
            pendingEvents: String(data.pendingEvents || ''),
            keyChanges: String(data.keyChanges || '')
          }
        }
      }

      return { success: false, error: `AI 返回格式错误（${parsed.error || '状态摘要不是 JSON 对象'}）` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取章节生成时的状态摘要上下文
   * W2.2 状态摘要链：注入最近 N 章的结束状态（N=参数 stateSummaryChainLimit，默认 3）——
   * 更早章节压缩回顾一行一条，上一章保留原全量格式；单条时输出与旧行为逐字节一致。
   */
  async getChapterStateSummaryContext(
    projectId: string,
    chapterNumber: number
  ): Promise<string> {
    const dbManager = getCoreDatabaseManager()

    const chainLimit = Math.max(1, longwritingParams().writing.stateSummaryChainLimit || 1)
    const recent = await dbManager.lwChapterStateSummaries?.getRecentBeforeChapter?.(projectId, chapterNumber, chainLimit)
    if (!recent || recent.length === 0) {
      return ''
    }

    return buildStateSummaryChainContext(recent, chapterNumber, chainLimit)
  }

  // ==================== 章节事件提取（图谱：故事内已发生的事实） ====================

  /**
   * 从章节正文提取"故事内事件"（图谱事件节点数据）。
   * 事件 = 已发生的事实（谁/在哪/发生什么/结果），随章节确认累积；
   * 与创作层情节（plot，计划中的故事线）区分。
   */
  /**
   * 提取章节伏笔（42 号 P1：写作教练位——每章完成自动登记"埋了什么"）
   * 与 extractChapterEvents 同构：callAIStream + JSON 容错解析。
   */
  async extractChapterForeshadows(
    eventId: string,
    projectId: string,
    chapterContent: string,
    chapterNumber: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    void projectId
    const systemPrompt = `你是小说连载顾问。分析章节正文，识别本章"新埋下的伏笔"——被刻意强调但未在本章解释的人/物/话/异常，且对后续剧情有明确回收价值。
只识别新埋设（本章首次出现的悬念装置），不把普通情节当伏笔。

## 输出格式
返回 JSON 对象（不要返回裸数组）：{"items": [{"content":"伏笔内容一句话（含关键物证/台词）","plantedChapter":${chapterNumber}}]}

要求：
1. 0-3 条；没有就返回 {"items": []}
2. 宁缺毋滥：只登记有明确回收意图的
3. 正文锚定（硬约束）：每条伏笔必须能在本章正文里指出对应原句；正文没明写的推测、脑补、依据大纲"应该有"的设定一律禁止登记
4. content 末尾用《》附上正文原句关键片段（≤15字）；给不出原句依据的条目必须丢弃
5. 直接输出 JSON，不要任何额外文字`

    const prompt = `【本章正文（第 ${chapterNumber} 章）】
${chapterContent.substring(0, 12000)}${chapterContent.length > 12000 ? '...(内容已截断)' : ''}

请识别本章新埋下的伏笔，直接返回 JSON 对象（{"items": [...]}）。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 1024, providerConfigId, modelId, {
        responseFormat: { type: 'json_object' },
      })
      const parsed = parseJsonPayload(result)
      const arr = parsed.ok ? extractArrayField(parsed.data, 'items') : null
      if (arr) {
        return { success: true, data: arr }
      }
      return { success: false, error: `未返回有效 JSON（${parsed.error}）` }
    } catch (e: any) {
      return { success: false, error: e?.message || '伏笔提取失败' }
    }
  }

  async extractChapterEvents(
    eventId: string,
    projectId: string,
    outlineId: string,
    chapterContent: string,
    chapterNumber: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    // 读项目实体作参考（名称→ID 匹配用）
    const characters = (await dbManager.lwCharacters?.getByProjectId(projectId)) || []
    const locations = (await dbManager.lwLocations?.getByProjectId(projectId)) || []
    const items = (await dbManager.lwItems?.getByProjectId(projectId)) || []
    const factions = (await dbManager.lwFactions?.getByProjectId(projectId)) || []
    // P0：技能纳入名册参考——此前技能在自动管线中没有任何建边路径（5/5 永久孤立）
    const skills = (await dbManager.lwSkills?.getByProjectId(projectId)) || []

    const entityRef = (list: Array<{ id: string; name: string }>, _type: string): string =>
      list.length > 0
        ? list.map(e => `- ${e.name}（ID: ${e.id}）`).join('\n')
        : ''

    const systemPrompt = `你是一位专业的小说内容分析师。请分析章节正文，提取本章发生的"故事事件"。
每个事件是故事内已经发生的事实（谁、在哪里、发生了什么事、结果如何）。
事件示例："林家在比武大会夺魁"、"顾言向林晓提出和离"、"无名剑在拍卖会被神秘人拍走"。

## 输出格式
返回 JSON 对象（不要返回裸数组），结构：
{"items": [
  {
    "name": "事件名（不超过 15 字）",
    "storyTime": "事件发生的故事内时间（用正文原词，如：二更天/上元夜/三个月前；正文未明示则填空串）",
    "description": "事件经过描述（50-100 字）",
    "evidence": "正文原句关键片段（不超过 20 字，必须能在正文逐字找到）",
    "involvedEntities": [
      {"type": "character/location/item/faction/skill", "id": "实体ID（必须使用提供的ID）", "name": "实体名"}
    ],
    "stateBefore": "事件发生前相关实体的关键状态（如：林晓重伤未愈）",
    "stateAfter": "事件发生后相关实体的关键状态（如：林晓夺魁扬名）"
  }
]}

要求：
1. 只提取本章实际发生的事件（2-8 个，优先保证主角与主线事件的完整性），不要提取计划/回忆中的内容
1.5. 幅度忠实（硬约束）：事件名/描述的幅度不得超出正文实际揭示范围——本章只发现线索的不许写成"揭露真相/查明实情"；正文没给出答案的悬念不得在 stateAfter 里给出结论
2. involvedEntities 必须包含事件中出现的**全部具名人物/地点/物品/势力/技能**，一个都不能漏：
   - 名册内的实体：必须使用下方提供的 ID；
   - 名册外的实体（新配角/受害人/证人等）：照写名字，id 留空——系统会自动登记为「未登记人物」待作者确认，禁止因此省略；
   - 只统计"事件里真实出现"的实体，不要把没出场的主角硬塞进去
3. 状态变化是"结果"而非"过程"
4. evidence 锚定（硬约束）：每个事件必须给出能在正文逐字找到的原句片段；给不出原句依据的事件（正文没演、只在大纲/回忆/对话里提到）必须丢弃
5. 直接输出 JSON，不要有任何额外文字`

    const prompt = `【本章正文】
${chapterContent.substring(0, 12000)}${chapterContent.length > 12000 ? '...(内容已截断)' : ''}

【项目角色】
${entityRef(characters, 'character') || '暂无'}

【项目地点】
${entityRef(locations, 'location') || '暂无'}

【项目物品】
${entityRef(items, 'item') || '暂无'}

【项目势力】
${entityRef(factions, 'faction') || '暂无'}

【项目技能】
${entityRef(skills, 'skill') || '暂无'}

请提取本章发生的 2-8 个故事事件，直接返回 JSON 对象（{"items": [...]}）。`

    try {
      // JSON 模式（解码层约束）+ 容错解析兜底：Anthropic 等不支持 response_format 的
      // 端点由 provider 降级忽略，此处 parseJsonPayload 负责围栏/废话抢救
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 4096, providerConfigId, modelId, {
        responseFormat: { type: 'json_object' },
      })

      const parsed = parseJsonPayload(result)
      const arr = parsed.ok ? extractArrayField(parsed.data, 'items') : null
      if (arr && arr.length > 0) {
        return { success: true, data: arr }
      }
      // 解析失败必须报失败（空转防线）：旧实现这里返回 success:true + 原始字符串，
      // 调用方 Array.isArray 过滤后成空数组且不算失败步骤——整章事件静默丢失（ep11 事故根因）
      return { success: false, error: `AI 返回格式错误：事件提取结果不是合法 JSON（${parsed.error || 'items 字段缺失或为空'}）` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * AI 提取章节人物关系演变（图谱管线第 6 步）：结婚/决裂/反目/结盟/师徒反目…
   * 输入本章正文 + 当前仍生效的人物关系（作为"演变前事实"防止凭空提关系），
   * 输出变化提案数组，由 GraphService.applyRelationChanges 做"关旧开新"落库。
   */
  async extractChapterRelationChanges(
    eventId: string,
    projectId: string,
    chapterContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()
    const characters = (await dbManager.lwCharacters?.getByProjectId(projectId)) || []
    // P0：势力纳入关系提取范围（人物↔势力 隶属/敌对是图上常见边，此前只做人物↔人物）
    const factions = (await dbManager.lwFactions?.getByProjectId(projectId)) || []

    // 当前仍生效的人物间关系（演变前事实）
    let activeRelationsText = '暂无'
    try {
      const edges = (await dbManager.lwGraphEdges?.getByProjectId(projectId)) || []
      const nameOf = (id: string): string => characters.find(c => c.id === id)?.name ?? id
      activeRelationsText =
        edges
          .filter(
            e =>
              e.validUntilChapter === undefined &&
              e.sourceType === 'character' &&
              e.targetType === 'character',
          )
          .map(e => `- ${nameOf(e.sourceId)} ↔ ${nameOf(e.targetId)}：${e.relationType}`)
          .join('\n') || '暂无'
    } catch {
      activeRelationsText = '暂无'
    }

    const systemPrompt = `你是一位小说连续性分析师。请分析章节正文，提取本章内**实际发生**的人物关系变化（不是设定层静态关系，是剧情推动的演变）。
变化类型：
- new：本章结成新关系（结拜、结盟、收徒、相爱、投效门派/势力…）
- ended：本章终结原有关系（决裂、离婚、恩断义绝、脱离势力…）
- changed：关系性质转变（仇人→挚友、师徒→敌对…，需给 newRelationType）

## 输出格式
返回 JSON 对象（不要返回裸数组），结构：
{"items": [
  {
    "changeType": "new|ended|changed",
    "sourceType": "character（默认，可省略）|faction",
    "sourceName": "实体名（必须用项目名册原名）",
    "targetType": "character（默认，可省略）|faction",
    "targetName": "对方实体名",
    "relationType": "ended=被终结的原关系名；new=新关系名",
    "newRelationType": "仅 changed 需要：转变后的关系名",
    "description": "一句话依据（本章哪个情节导致）"
  }
]}

要求：
1. 只提本章情节实际推动的变化（0-3 条），没有变化返回 {"items": []}
2. 不要把"当前关系清单"里已有的关系再报一遍
3. relationType 用短词（夫妻/师徒/结义/盟友/敌对/主仆/隶属…）
4. sourceName/targetName 必须能在下方名册或正文里找到；人物↔势力关系用 faction 类型
5. 直接输出 JSON，不要有任何额外文字`

    const prompt = `【本章正文】
${chapterContent.substring(0, 12000)}${chapterContent.length > 12000 ? '...(内容已截断)' : ''}

【项目角色】
${characters.map(c => `- ${c.name}`).join('\n') || '暂无'}

【项目势力】
${factions.map(f => `- ${f.name}`).join('\n') || '暂无'}

【当前仍有效的人物关系（演变前事实）】
${activeRelationsText}

请提取本章的人物关系变化，直接返回 JSON 对象（{"items": [...]}）。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 1024, providerConfigId, modelId, {
        responseFormat: { type: 'json_object' },
      })
      const parsed = parseJsonPayload(result)
      const arr = parsed.ok ? extractArrayField(parsed.data, 'items') : null
      if (arr) {
        return { success: true, data: arr }
      }
      // 空数组是合法结果（本章无变化）；解析失败必须报失败——
      // 旧实现在 parse 失败时返回 success:true + 原始字符串，调用方过滤成空数组后
      // 不再重跑，关系演变静默丢失
      return { success: false, error: `AI 返回格式错误：关系演变结果不是合法 JSON（${parsed.error}）` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 图谱关系构建（设定层面实体关系网络） ====================

  /**
   * AI 识别实体间关系（图谱关系构建的"关系提案"）。
   * 读项目当前全部设定 → AI 输出关系网络（人物-人物/人物-地点/人物-物品/人物-势力/物品-地点…），
   * 由 GraphService.syncEntityRelations 做名称→ID 解析并幂等落库 lw_graph_edges。
   * 与章节流水线的"事件 involves"边互补：这里是静态设定关系，那边是动态故事事实。
   */
  async generateEntityRelations(
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getCoreDatabaseManager()

    const [overview, characters, locations, items, factions, skills, plots] = await Promise.all([
      dbManager.lwStoryOverviews?.getByProjectId(projectId) ?? Promise.resolve(null),
      dbManager.lwCharacters?.getByProjectId(projectId) ?? Promise.resolve([]),
      dbManager.lwLocations?.getByProjectId(projectId) ?? Promise.resolve([]),
      dbManager.lwItems?.getByProjectId(projectId) ?? Promise.resolve([]),
      dbManager.lwFactions?.getByProjectId(projectId) ?? Promise.resolve([]),
      dbManager.lwSkills?.getByProjectId(projectId) ?? Promise.resolve([]),
      dbManager.lwPlots?.getByProjectId(projectId) ?? Promise.resolve([]),
    ])

    // 实体清单（名称必须逐字匹配，供 AI 引用）
    const listBlock = (title: string, list: Array<{ name: string; description?: string | null }>, fields: string[]): string => {
      if (list.length === 0) return ''
      return `【${title}】\n${list.map((e: any) => {
        const parts = fields.map(f => (e[f] ? `${f}:${e[f]}` : '')).filter(Boolean)
        return `- ${e.name}（${parts.join('，')}）`
      }).join('\n')}`
    }

    const systemPrompt = `你是一位专业的小说设定分析师。请分析项目的全部设定，识别实体之间**确定且有意义**的关系，构建故事的关系网络。

## 输出格式
返回 JSON 数组，每条关系一条记录：
{
  "sourceType": "character/location/item/faction/skill",
  "sourceName": "源实体名称（必须与下方清单逐字完全一致）",
  "targetType": "character/location/item/faction/skill",
  "targetName": "目标实体名称（必须与下方清单逐字完全一致）",
  "relationType": "关系类型（如：师徒/宿敌/恋人/同门/主仆/父子/所属/所在/持有/使用/存放/出产/相邻/隶属…）",
  "description": "关系说明（20-40 字，说明这段关系的由来或意义）"
}

## 关系类型参考（不限于此，但要贴合故事）
- 人物→人物：师徒、宿敌、恋人、同门、主仆、父子、挚友、竞争对手、恩人、仇人…
- 人物→地点：所在、常驻、出生地、求学地、镇守地…
- 人物→物品：持有、使用、守护、追寻、宿命之物…
- 人物→势力：所属、敌对、效忠、出身…
- 物品→地点：存放、出产、埋藏…
- 地点→地点：相邻、隶属、对峙…

## 要求
1. 只输出**确定**的关系（从设定文本中能直接读出）；不确定的不要编造
2. sourceName/targetName 必须与下方实体清单**逐字完全一致**（否则无法入库）
3. 不要输出"人物 A 与人物 B 是同一人"这类无意义关系；不要自环
4. 每条关系都应能支撑后续创作（写作时作为"已建立的关系"约束）
5. 关系数量 10-40 条，质量优先
6. 请直接输出 JSON 数组，不要有任何额外文字`

    const prompt = `【故事概要】
${overview ? `标题：${overview.title || '未命名'}，摘要：${overview.summary || ''}，核心冲突：${overview.coreConflict || ''}` : '暂无'}

${listBlock('人物', characters, ['rolePosition', 'personality', 'occupation'])}
${listBlock('地点', locations, ['type', 'description'])}
${listBlock('物品', items, ['type', 'description'])}
${listBlock('势力', factions, ['factionType', 'description'])}
${listBlock('技能', skills, ['type', 'description'])}

${plots.length > 0 ? `【故事线】\n${plots.map((p: any) => `- ${p.title}：${p.summary}`).join('\n')}` : ''}

请基于以上设定，识别实体间确定且有意义的关系，直接返回 JSON 数组。`

    try {
      const result = await this.callAIStream(eventId, prompt, systemPrompt, 4096, providerConfigId, modelId)

      // 容错解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0])
          if (Array.isArray(data)) {
            return { success: true, data }
          }
        } catch (parseError: any) {
          console.error('[LongWritingAI] generateEntityRelations JSON 解析失败:', parseError.message)
          return { success: true, data: result }
        }
      }
      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}

/**
 * 获取长文写作 AI 服务实例
 */
export const getLongWritingAIService = (): LongWritingAIService =>
  LongWritingAIService.getInstance()