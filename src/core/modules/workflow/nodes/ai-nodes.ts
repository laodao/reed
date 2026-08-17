/**
 * AI 能力任务节点（第二批：kb / 搜索 / 翻译 / 图像 / 语音 / 长文 共 9 个）
 * @module core/modules/workflow/nodes/ai-nodes
 * @description 全部复用系统既有服务层（架构铁律：节点是服务的薄适配器）。
 *              config 由引擎统一深解析；本文件不 import 渲染层、不做存储访问。
 *
 *              取消能力说明（catalog.cancellable 必须与实际一致）：
 *              - kb-retrieve：信号量检查点取消（嵌入调用前后；HTTP 级中断待
 *                KnowledgeBaseService.search 的 signal 透传补齐）
 *              - 其余 AI 节点底层服务不支持 AbortSignal → cancellable=false，
 *                引擎按取消降级语义处理（结果丢弃、节点标 cancelled）
 */

import { KnowledgeBaseService } from '../../../services/knowledge-base.service'
import { getSearchEngineService } from '../../../services/search-engine.service'
import { TranslationService } from '../../../services/translation.service'
import { ImageService } from '../../../services/image.service'
import { VoiceService } from '../../../services/voice.service'
import { LongWritingAIService } from '../../../services/longwriting-ai.service'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

/** 信号已取消则抛错（可取消节点的检查点） */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('已取消')
}

/** 信号感知轮询等待：每 intervalMs 检查一次直到 predicate 返回非 undefined 或超时 */
async function pollUntil<T>(
  check: () => Promise<T | undefined>,
  opts: { intervalMs: number; timeoutMs: number; signal: AbortSignal }
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    throwIfAborted(opts.signal)
    const result = await check()
    if (result !== undefined) return result
    await new Promise(r => setTimeout(r, opts.intervalMs))
  }
  throw new Error('等待超时')
}

/** 通用的服务响应解包：{success, data?, error?} → 失败抛错/成功返 data */
function unwrap<T>(resp: { success: boolean; data?: T; error?: string }, what: string): T {
  if (!resp.success) throw new Error(`${what}失败: ${resp.error ?? '未知错误'}`)
  return resp.data as T
}

// ==================== 知识库检索 ====================

const kbRetrieveNode: WorkflowNodeHandler = {
  type: 'kb-retrieve',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'results', type: 'json', desc: '[{ content, score, documentId, documentName }]' },
    { key: 'count', type: 'number', desc: '命中数量' },
  ],
  validateConfig(config) {
    const cfg = config as { knowledgeBaseId?: string; query?: string }
    const errors: string[] = []
    if (!cfg.knowledgeBaseId) errors.push('必须选择知识库')
    if (cfg.query === undefined || stringifyValue(cfg.query).trim() === '') errors.push('查询内容不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      knowledgeBaseId: string
      query: string
      topK?: number
      threshold?: number
    }
    throwIfAborted(ctx.signal)
    const service = new KnowledgeBaseService()
    const resp = await service.search({
      knowledgeBaseId: cfg.knowledgeBaseId,
      query: stringifyValue(cfg.query),
      topK: cfg.topK,
      threshold: cfg.threshold,
    })
    throwIfAborted(ctx.signal)
    const results = unwrap(resp, '知识库检索') ?? []
    return {
      status: 'succeeded',
      output: {
        results: results.map(r => ({
          content: r.content,
          score: r.score,
          documentId: r.documentId,
          documentName: r.documentName,
        })),
        count: results.length,
      },
    }
  },
}

// ==================== 知识库入库 ====================

const kbIngestNode: WorkflowNodeHandler = {
  type: 'kb-ingest',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'documentId', type: 'string', desc: '文档 ID' },
    { key: 'status', type: 'string', desc: 'waitForCompletion=false 时为 submitted' },
  ],
  validateConfig(config) {
    const cfg = config as { knowledgeBaseId?: string; title?: string; content?: string }
    const errors: string[] = []
    if (!cfg.knowledgeBaseId) errors.push('必须选择知识库')
    if (stringifyValue(cfg.title).trim() === '') errors.push('文档标题不能为空')
    if (stringifyValue(cfg.content).trim() === '') errors.push('文档内容不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      knowledgeBaseId: string
      title: string
      content: string
      waitForCompletion?: boolean
    }
    const service = new KnowledgeBaseService()
    const title = stringifyValue(cfg.title)
    const resp = await service.addDocument(cfg.knowledgeBaseId, {
      name: title,
      type: 'text',
      content: stringifyValue(cfg.content),
    })
    const result = unwrap(resp, '知识库入库')
    // AddDocumentResult 含文档记录（防御式取 id）
    const documentId = (result as { documentId?: string; document?: { id?: string } }).documentId
      ?? (result as { document?: { id?: string } }).document?.id
      ?? ''

    if (!cfg.waitForCompletion) {
      return { status: 'succeeded', output: { documentId, status: 'submitted' } }
    }
    // 等待后台解析/向量化完成（轮询文档状态）
    const doc = await pollUntil(
      async () => {
        const docsResp = await service.getDocuments(cfg.knowledgeBaseId)
        const docs = unwrap(docsResp, '读取知识库文档') ?? []
        const doc = (docs as Array<{ id?: string; documentId?: string; status?: string }>).find(
          d => d.id === documentId || d.documentId === documentId
        )
        if (!doc) return undefined
        if (doc.status === 'completed' || doc.status === 'failed') return doc
        return undefined
      },
      { intervalMs: 500, timeoutMs: 120_000, signal: ctx.signal }
    )
    if (doc.status === 'failed') {
      return { status: 'failed', error: '知识库文档处理失败', retryable: true }
    }
    return { status: 'succeeded', output: { documentId, status: 'completed' } }
  },
}

// ==================== 联网搜索 ====================

const webSearchNode: WorkflowNodeHandler = {
  type: 'web-search',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'results', type: 'json', desc: '[{ title, url, snippet }]' },
    { key: 'count', type: 'number', desc: '结果数量' },
  ],
  validateConfig(config) {
    const cfg = config as { query?: string }
    if (stringifyValue(cfg.query).trim() === '') return ['搜索关键词不能为空']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      query: string
      engineType?: string
      searchConfigId?: string
      maxResults?: number
    }
    const service = getSearchEngineService()
    // 未指定引擎时用用户默认配置
    let engineType = cfg.engineType as never
    let configId = cfg.searchConfigId
    if (!engineType) {
      const def = await service.getDefaultConfig()
      if (def?.engineType) {
        engineType = def.engineType
        configId = configId ?? def.id
      } else {
        return { status: 'failed', error: '未配置搜索引擎', retryable: false }
      }
    }
    const resp = await service.search(
      stringifyValue(cfg.query),
      engineType,
      configId,
      cfg.maxResults
    )
    if (!resp.success) {
      return { status: 'failed', error: `搜索失败: ${resp.error ?? '未知错误'}` }
    }
    const results = (resp.results ?? []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    }))
    return { status: 'succeeded', output: { results, count: results.length } }
  },
}

// ==================== 翻译 ====================

const translateNode: WorkflowNodeHandler = {
  type: 'translate',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [{ key: 'text', type: 'string', desc: '译文' }],
  validateConfig(config) {
    const cfg = config as { text?: string; targetLang?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.text).trim() === '') errors.push('待翻译内容不能为空')
    if (!cfg.targetLang) errors.push('必须指定目标语言')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      text: string
      sourceLang?: string
      targetLang: string
      providerConfigId?: string
      modelId?: string
    }
    const text = stringifyValue(cfg.text)
    const resp = await TranslationService.translateText({
      text,
      ...(cfg.sourceLang ? { sourceLanguage: cfg.sourceLang as never } : {}),
      targetLanguage: cfg.targetLang as never,
      ...(cfg.providerConfigId ? { providerId: cfg.providerConfigId } : {}),
      ...(cfg.modelId ? { modelId: cfg.modelId } : {}),
    })
    const data = unwrap(resp, '翻译')
    if (!data?.translatedText) {
      return { status: 'failed', error: '翻译服务未返回译文' }
    }
    return { status: 'succeeded', output: { text: data.translatedText } }
  },
}

// ==================== 图像生成 ====================

const imageGenNode: WorkflowNodeHandler = {
  type: 'image-gen',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'taskId', type: 'string', desc: '生成任务 ID' },
    { key: 'images', type: 'json', desc: '[{ url, base64?, width, height }]' },
  ],
  validateConfig(config) {
    const cfg = config as { prompt?: string; modelId?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.prompt).trim() === '') errors.push('提示词不能为空')
    if (!cfg.modelId) errors.push('必须指定图像模型（图像服务暂无默认模型机制）')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      prompt: string
      negativePrompt?: string
      width?: number
      height?: number
      count?: number
      providerConfigId?: string
      modelId: string
    }
    const resp = await ImageService.generateImage({
      model: cfg.modelId,
      prompt: stringifyValue(cfg.prompt),
      ...(cfg.negativePrompt ? { negativePrompt: cfg.negativePrompt } : {}),
      width: cfg.width ?? 1024,
      height: cfg.height ?? 1024,
      ...(cfg.count ? { count: cfg.count } : {}),
      ...(cfg.providerConfigId ? { providerConfigId: cfg.providerConfigId } : {}),
    } as never)
    if (!resp.success) {
      return { status: 'failed', error: `图像生成失败: ${resp.error ?? '未知错误'}` }
    }
    // 同步 Provider 直接返回图；异步 Provider 返回 taskId 需轮询
    let images = resp.images ?? []
    let taskId = resp.taskId ?? ''
    if (images.length === 0 && taskId) {
      const task = await pollUntil(
        async () => {
          const st = await ImageService.getTaskStatus(taskId)
          ctx.emitProgress(st.progress ?? -1)
          if (st.status === 'completed') return st
          if (st.status === 'failed') throw new Error(st.error ?? '图像生成失败')
          return undefined
        },
        { intervalMs: 2000, timeoutMs: 300_000, signal: ctx.signal }
      )
      images = task.images ?? []
      ctx.emitProgress(100)
    }
    if (images.length === 0) {
      return { status: 'failed', error: '图像服务未返回图片' }
    }
    return {
      status: 'succeeded',
      output: {
        ...(taskId ? { taskId } : {}),
        images: images.map(im => ({
          ...(im.url ? { url: im.url } : {}),
          ...(im.base64 ? { hasBase64: true } : {}),
          width: im.width,
          height: im.height,
        })),
      },
    }
  },
}

// ==================== 语音合成（TTS） ====================

const ttsNode: WorkflowNodeHandler = {
  type: 'tts',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'audioPath', type: 'string', desc: '音频文件路径' },
    { key: 'durationMs', type: 'number', desc: '音频时长（毫秒）' },
  ],
  validateConfig(config) {
    const cfg = config as { text?: string }
    if (stringifyValue(cfg.text).trim() === '') return ['合成文本不能为空']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      text: string
      voiceId?: string
      speed?: number
      providerConfigId?: string
      modelId?: string
    }
    if (!cfg.voiceId) {
      return { status: 'failed', error: '必须指定音色（voiceId）', retryable: false }
    }
    const resp = await VoiceService.generateSpeech({
      text: stringifyValue(cfg.text),
      voiceId: cfg.voiceId,
      ...(cfg.speed !== undefined ? { speed: cfg.speed } : {}),
      ...(cfg.providerConfigId ? { providerId: cfg.providerConfigId } : {}),
      ...(cfg.modelId ? { modelId: cfg.modelId } : {}),
    } as never)
    const data = unwrap(resp, '语音合成')
    return {
      status: 'succeeded',
      output: {
        audioPath: data.audioPath,
        durationMs: data.duration,
      },
    }
  },
}

// ==================== 语音识别（STT） ====================

const sttNode: WorkflowNodeHandler = {
  type: 'stt',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [{ key: 'text', type: 'string', desc: '识别文本' }],
  validateConfig(config) {
    const cfg = config as { audio?: string }
    if (stringifyValue(cfg.audio).trim() === '') return ['音频来源不能为空']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      audio: string
      language?: string
      providerConfigId?: string
      modelId?: string
    }
    const audio = stringifyValue(cfg.audio)
    // 音频来源支持：文件路径（含 file:// 前缀）或 base64 数据
    const isPath = !audio.startsWith('data:')
    const resp = await VoiceService.recognizeSpeech({
      ...(isPath ? { audioPath: audio } : { audioData: audio.replace(/^data:[^,]*,/, '') }),
      ...(cfg.language ? { language: cfg.language as never } : {}),
      ...(cfg.providerConfigId ? { providerId: cfg.providerConfigId } : {}),
      ...(cfg.modelId ? { modelId: cfg.modelId } : {}),
    } as never)
    const data = unwrap(resp, '语音识别')
    return { status: 'succeeded', output: { text: data.text ?? '' } }
  },
}

// ==================== 长文·生成章节 ====================

const lwGenerateChapterNode: WorkflowNodeHandler = {
  type: 'lw-generate-chapter',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'eventId', type: 'string', desc: '生成事件 ID' },
    { key: 'chapterId', type: 'string', desc: 'waitForCompletion=true 时' },
    { key: 'content', type: 'string', desc: 'waitForCompletion=true 时章节内容' },
  ],
  validateConfig(config) {
    const cfg = config as { projectId?: string; outlineId?: string }
    const errors: string[] = []
    if (!cfg.projectId) errors.push('必须指定长文项目')
    if (!cfg.outlineId) errors.push('必须指定章节大纲')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      projectId: string
      outlineId: string
      targetWords?: number
      providerConfigId?: string
      modelId?: string
      waitForCompletion?: boolean
    }
    const eventId = `wf_${ctx.runId}_${ctx.nodeId}_${ctx.iterationIndex}`
    const service = LongWritingAIService.getInstance()
    const run = () =>
      service.generateChapter(
        eventId,
        cfg.projectId,
        cfg.outlineId,
        cfg.targetWords,
        cfg.providerConfigId,
        cfg.modelId
      )
    if (cfg.waitForCompletion) {
      const resp = await run()
      if (!resp.success) {
        return { status: 'failed', error: `章节生成失败: ${resp.error ?? '未知错误'}` }
      }
      const data = resp.data as { id?: string; content?: string; chapterId?: string } | undefined
      return {
        status: 'succeeded',
        output: {
          eventId,
          chapterId: data?.chapterId ?? data?.id ?? '',
          content: stringifyValue(data?.content ?? ''),
        },
      }
    }
    // 提交即成功：后台跑生成（流式进度经 longwriting:generate:${eventId} 事件），
    // 失败只记日志（下游按 eventId 自行订阅进度）
    void run().catch(e => ctx.logger.error('章节生成（后台）失败', e))
    return { status: 'succeeded', output: { eventId, status: 'submitted' } }
  },
}

// ==================== 长文·润色 ====================

const lwPolishNode: WorkflowNodeHandler = {
  type: 'lw-polish',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [{ key: 'content', type: 'string', desc: '润色后内容' }],
  validateConfig(config) {
    const cfg = config as { projectId?: string; field?: string; content?: string }
    const errors: string[] = []
    if (!cfg.projectId) errors.push('必须指定长文项目')
    if (!cfg.field) errors.push('必须指定润色字段')
    if (stringifyValue(cfg.content).trim() === '') errors.push('待润色内容不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      projectId: string
      field: string
      content: string
      eraType?: string
      providerConfigId?: string
      modelId?: string
      waitForCompletion?: boolean
    }
    const eventId = `wf_${ctx.runId}_${ctx.nodeId}_${ctx.iterationIndex}`
    const run = () =>
      LongWritingAIService.getInstance().polishBackground(
        eventId,
        cfg.projectId,
        cfg.field as never,
        cfg.eraType ?? '',
        stringifyValue(cfg.content),
        cfg.providerConfigId,
        cfg.modelId
      )
    const resp = await run()
    if (!resp.success) {
      return { status: 'failed', error: `润色失败: ${resp.error ?? '未知错误'}` }
    }
    const data = resp.data as { content?: string; polished?: string; text?: string } | undefined
    return {
      status: 'succeeded',
      output: { content: data?.content ?? data?.polished ?? data?.text ?? '' },
    }
  },
}

// ==================== 应用内通知 ====================

const appNotifyNode: WorkflowNodeHandler = {
  type: 'app-notify',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [{ key: 'sent', type: 'boolean', desc: '是否已发送' }],
  validateConfig(config) {
    const cfg = config as { title?: string; message?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.title).trim() === '') errors.push('通知标题不能为空')
    if (stringifyValue(cfg.message).trim() === '') errors.push('通知内容不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      title: string
      message: string
      level?: 'info' | 'success' | 'warning' | 'error'
    }
    // 经引擎事件通道推送（前端 ElNotification 呈现）
    const { getEventEmitter } = await import('../../../interfaces/event.interface')
    getEventEmitter().emit('wf:run-event', {
      type: 'notify',
      runId: ctx.runId,
      level: cfg.level ?? 'info',
      title: stringifyValue(cfg.title),
      message: stringifyValue(cfg.message),
    })
    return { status: 'succeeded', output: { sent: true } }
  },
}

/** AI 能力节点集合 */
export const AI_NODE_HANDLERS: WorkflowNodeHandler[] = [
  kbRetrieveNode,
  kbIngestNode,
  webSearchNode,
  translateNode,
  imageGenNode,
  ttsNode,
  sttNode,
  lwGenerateChapterNode,
  lwPolishNode,
  appNotifyNode,
]
