/**
 * AI 能力任务节点（第二批：kb / 搜索 / 翻译 / 图像 / 语音 / 长文 共 9 个）
 * @module core/platform/workflow/nodes/ai-nodes
 * @description 全部复用系统既有服务层（架构铁律：节点是服务的薄适配器）。
 *              config 由引擎统一深解析；本文件不 import 渲染层、不做存储访问。
 *
 *              取消能力说明（catalog.cancellable 必须与实际一致）：
 *              - kb-retrieve：信号量检查点取消（嵌入调用前后；HTTP 级中断待
 *                KnowledgeBaseService.search 的 signal 透传补齐）
 *              - 其余 AI 节点底层服务不支持 AbortSignal → cancellable=false，
 *                引擎按取消降级语义处理（结果丢弃、节点标 cancelled）
 */

import { KnowledgeBaseService } from '../../services/knowledge-base.service'
import { augmentWithDialogFiles, mergeRetrievalResults, effectiveTopK } from './dialog-file-retriever'
import { getSearchEngineService } from '../../services/search-engine.service'
import { TranslationService } from '../../services/translation.service'
import { ImageService } from '../../services/image.service'
import { VoiceService } from '../../services/voice.service'
import { getVideoMetadata, extractAudioSegment } from '../../episode-production/reference-video/ffmpeg-helpers'
import { dirname, basename, join, isAbsolute } from 'path'
import { existsSync, readFileSync, rmSync } from 'fs'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { WORKFLOW_DEFAULTS, WORKFLOW_RUN_EVENT_CHANNEL, WORKFLOW_RUN_EVENT_TYPES } from '@shared/types/workflow.types'
import { pollUntil } from '../engine/async-utils'
import { submitWithTransientRetry } from './retry-submit'
import { getEventEmitter } from '@core/interfaces/event.interface'

/** 长任务节点'提交即返回'的输出状态值（三处共用唯一写法） */
const NODE_SUBMITTED_STATUS = 'submitted'

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
      includeDialogFiles?: boolean
      useRerank?: boolean
      vectorWeight?: number
    }
    if (ctx.signal.aborted) throw new Error('已取消')
    const service = new KnowledgeBaseService()
    const resp = await service.search({
      knowledgeBaseId: cfg.knowledgeBaseId,
      query: stringifyValue(cfg.query),
      topK: cfg.topK,
      threshold: cfg.threshold,
      useRerank: cfg.useRerank,
      vectorWeight: cfg.vectorWeight,
      signal: ctx.signal, // HTTP 级取消（透传到嵌入调用）
    })
    if (ctx.signal.aborted) throw new Error('已取消')
    const results = unwrap(resp, '知识库检索') ?? []
    // C4：合并对话附件命中（F1：dialog 优先——用户刚上传的文件最相关；整体截断 topK）
    const topK = effectiveTopK(cfg.topK)
    const dialogHits = await augmentWithDialogFiles(ctx, cfg.includeDialogFiles, stringifyValue(cfg.query), topK)
    const merged = mergeRetrievalResults(
      results.map(r => ({ content: r.content, score: r.score, documentId: r.documentId, documentName: r.documentName, source: 'kb' as const })),
      dialogHits,
      topK
    )
    return {
      status: 'succeeded',
      output: {
        results: merged,
        count: merged.length,
      },
    }
  },
}

// ==================== 知识库多库合并检索 ====================

/**
 * 归一化知识库选择：数组原样；JSON 数组字符串/逗号/空白分隔 → 字符串数组。
 * 引擎 resolveConfigDeep 对单个模板占位符会透传数组/字符串原值，双保险兼容两种形态。
 */
function normalizeKbIds(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(x => String(x).trim()).filter(Boolean)
  if (input === undefined || input === null) return []
  const s = String(input).trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.map((x: unknown) => String(x).trim()).filter(Boolean)
  } catch { /* 非 JSON 数组，走分隔符解析 */ }
  return s
    .split(/[,，\s]+/)
    .map(x => x.trim())
    .filter(Boolean)
}

const kbQueryMultiNode: WorkflowNodeHandler = {
  type: 'kb-query-multi',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'results', type: 'json', desc: '[{ content, score, documentId, documentName, knowledgeBaseId }]（按分数降序，跨库去重合并）' },
    { key: 'count', type: 'number', desc: '合并后命中数量' },
    { key: 'sources', type: 'json', desc: '命中的知识库 id 去重列表（供来源标注）' },
  ],
  validateConfig(config) {
    const cfg = config as { knowledgeBaseIds?: unknown; query?: string }
    const errors: string[] = []
    if (normalizeKbIds(cfg.knowledgeBaseIds).length === 0) errors.push('必须至少选择一个知识库')
    if (cfg.query === undefined || stringifyValue(cfg.query).trim() === '') errors.push('查询内容不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      knowledgeBaseIds: unknown
      query: string
      /** 每库检索条数（默认 5） */
      topKPerKb?: number
      /** 跨库合并后最多返回条数（默认 20） */
      maxResults?: number
      threshold?: number
      useRerank?: boolean
      vectorWeight?: number
    }
    const ids = normalizeKbIds(cfg.knowledgeBaseIds)
    if (ids.length === 0) {
      // 用户未选择知识库：合法场景（脚本/大纲纯文案生成），直通空结果
      return { status: 'succeeded', output: { results: [], count: 0, sources: [] } }
    }
    if (ctx.signal.aborted) throw new Error('已取消')
    const service = new KnowledgeBaseService()
    const query = stringifyValue(cfg.query)
    const perKb = Math.max(1, Math.min(20, Number(cfg.topKPerKb) || 5))
    const mergedCap = Math.max(1, Math.min(60, Number(cfg.maxResults) || 20))

    const rows: Array<{
      content: string
      score: number
      documentId: string
      documentName: string
      knowledgeBaseId: string
    }> = []
    for (const kbId of ids) {
      if (ctx.signal.aborted) throw new Error('已取消')
      const resp = await service.search({
        knowledgeBaseId: kbId,
        query,
        topK: perKb,
        threshold: cfg.threshold,
        useRerank: cfg.useRerank,
        vectorWeight: cfg.vectorWeight,
        signal: ctx.signal, // 与 kb-retrieve 同语义：HTTP 级取消
      })
      if (ctx.signal.aborted) throw new Error('已取消')
      const hits = unwrap(resp, '知识库检索') ?? []
      for (const r of hits) {
        rows.push({
          content: r.content,
          score: r.score,
          documentId: r.documentId,
          documentName: r.documentName,
          knowledgeBaseId: kbId,
        })
      }
    }
    // 跨库合并：按分数降序（同文档内容去重——优先保留高分记录）
    rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const seen = new Set<string>()
    const merged = rows.filter(r => {
      const key = `${r.knowledgeBaseId}|${r.documentId}|${r.content.slice(0, 80)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, mergedCap)
    return {
      status: 'succeeded',
      output: {
        results: merged,
        count: merged.length,
        sources: [...new Set(merged.map(r => r.knowledgeBaseId))],
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
    const cfg = config as { knowledgeBaseId?: string; title?: string; content?: string; passthrough?: unknown }
    const errors: string[] = []
    if (!cfg.knowledgeBaseId) errors.push('必须选择知识库')
    if (stringifyValue(cfg.title).trim() === '') errors.push('文档标题不能为空')
    if (stringifyValue(cfg.content).trim() === '') errors.push('文档内容不能为空')
    if (cfg.passthrough !== undefined && (typeof cfg.passthrough !== 'object' || Array.isArray(cfg.passthrough))) {
      errors.push('passthrough 必须是对象（{字段: 值模板}）')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      knowledgeBaseId: string
      title: string
      content: string
      waitForCompletion?: boolean
      /** 可选来源键：传值时按 (workflow, sourceKey) 幂等 upsert——重复运行覆盖不堆积 */
      sourceKey?: string
      /** 透传字段：{字段: 值}（引擎已解析模板），合并进输出——循环体内供下游聚合引用正文 */
      passthrough?: Record<string, unknown>
    }
    const kbId = stringifyValue(cfg.knowledgeBaseId).trim()
    // 知识库未选（模板解析为空）→ 跳过保存，流程继续
    if (!kbId) {
      return { status: 'succeeded', output: { documentId: '', status: 'skipped', ...(cfg.passthrough ?? {}) } }
    }
    const service = new KnowledgeBaseService()
    const title = stringifyValue(cfg.title)
    const sourceKey = stringifyValue(cfg.sourceKey).trim()
    const resp = await service.addDocument(kbId, {
      name: title,
      type: 'text',
      content: stringifyValue(cfg.content),
      ...(sourceKey ? { source: { type: 'workflow' as const, id: sourceKey } } : {}),
    })
    const result = unwrap(resp, '知识库入库')
    // AddDocumentResult 含文档记录（防御式取 id）
    const documentId = (result as { documentId?: string; document?: { id?: string } }).documentId
      ?? (result as { document?: { id?: string } }).document?.id
      ?? ''

    if (!cfg.waitForCompletion) {
      return { status: 'succeeded', output: { documentId, status: NODE_SUBMITTED_STATUS, ...(cfg.passthrough ?? {}) } }
    }
    // 等待后台解析/向量化完成（轮询文档状态）
    const doc = await pollUntil(
      async () => {
        const docsResp = await service.getDocuments(kbId)
        const docs = unwrap(docsResp, '读取知识库文档') ?? []
        const doc = (docs as Array<{ id?: string; documentId?: string; status?: string }>).find(
          d => d.id === documentId || d.documentId === documentId
        )
        if (!doc) return undefined
        if (doc.status === 'completed' || doc.status === 'failed') return doc
        return undefined
      },
      { intervalMs: WORKFLOW_DEFAULTS.kbIngestPollIntervalMs, timeoutMs: WORKFLOW_DEFAULTS.kbIngestWaitTimeoutMs, signal: ctx.signal }
    )
    if (doc.status === 'failed') {
      return { status: 'failed', error: '知识库文档处理失败', retryable: true }
    }
    return { status: 'succeeded', output: { documentId, status: 'completed', ...(cfg.passthrough ?? {}) } }
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
    // 搜索引擎解析优先级：显式 engineType > 已配置引擎（configId）> quick: 免Key 快速引擎 > 用户默认配置
    let engineType = cfg.engineType as never
    let configId = cfg.searchConfigId
    if (!engineType && typeof configId === 'string' && configId.startsWith('quick:')) {
      // quick: 前缀 = 免 Key 快速引擎（百度/必应/Google 等网页抓取型），无需配置
      engineType = configId.slice('quick:'.length) as never
      configId = undefined
    }
    if (!engineType && configId) {
      const stored = await service.getConfig(configId)
      if (stored?.templateId) {
        engineType = stored.templateId as never
      }
    }
    if (!engineType) {
      const def = await service.getDefaultConfig()
      // 配置字段为 templateId（用户默认引擎）
      if (def?.templateId) {
        engineType = def.templateId as never
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
      /** 参考图：本地文件路径数组（file 输入 .path 或下游产物路径），读取为 base64 data URL 透传 */
      referenceImages?: unknown
      /**
       * 是否允许模型/平台扩写提示词。缺省 undefined → provider 默认（DashScope 为 true）。
       * 一致性场景（商品套图/人像）必须显式 false：扩写会弱化参考图约束导致主体漂移。
       */
      promptExtend?: boolean
      /** 随机种子（一致性：同 prompt+seed 生成同构图；重生成/同主体多场景用） */
      seed?: number
    }
    // 参考图：路径 → base64 data URL（电商海报等场景保留商品主体）
    let referenceImages: string[] | undefined
    const rawRefs = cfg.referenceImages
    if (rawRefs !== undefined && rawRefs !== null) {
      const list = Array.isArray(rawRefs) ? rawRefs : [rawRefs]
      const resolved: string[] = []
      for (const item of list) {
        const p = stringifyValue(item).trim()
        if (!p) continue
        if (!existsSync(p)) {
          return { status: 'failed', error: `参考图文件不存在: ${p}` }
        }
        resolved.push(`data:image/png;base64,${readFileSync(p).toString('base64')}`)
      }
      if (resolved.length > 0) referenceImages = resolved
    }
    const actualPrompt = stringifyValue(cfg.prompt)
    const request = {
      model: cfg.modelId,
      prompt: actualPrompt,
      ...(cfg.negativePrompt ? { negativePrompt: cfg.negativePrompt } : {}),
      width: cfg.width,
      height: cfg.height,
      ...(cfg.count ? { count: cfg.count } : {}),
      ...(cfg.providerConfigId ? { providerConfigId: cfg.providerConfigId } : {}),
      ...(cfg.promptExtend !== undefined ? { promptExtend: cfg.promptExtend } : {}),
      ...(cfg.seed !== undefined && cfg.seed >= 0 ? { seed: cfg.seed } : {}),
      ...(referenceImages ? { referenceImages } : {}),
    } as never
    // 评审 #105（图像侧）：提交阶段的瞬时网络失败（fetch/连接/网关 5xx/超时）
    // 内部重试一次，避免偶发抖动直接让整场工作流失败（与 video-gen 共用 retry-submit）
    const resp = await submitWithTransientRetry(() => ImageService.generateImage(request), {
      label: '图像',
      logger: ctx.logger,
    })
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
        { intervalMs: WORKFLOW_DEFAULTS.imagePollIntervalMs, timeoutMs: WORKFLOW_DEFAULTS.imagePollTimeoutMs, signal: ctx.signal }
      )
      images = task.images ?? []
      ctx.emitProgress(100)
    }
    if (images.length === 0) {
      return { status: 'failed', error: '图像服务未返回图片' }
    }
    // 输出统一形态：url=远程/可访问链接（若有）、path=本地绝对路径（filePath 相对路径解析）、
    // localUrl=local-*:// 协议链接（前端可直接加载）
    const pathProvider = getPathProvider()
    const dataRoot = pathProvider.getDataPath()
    return {
      status: 'succeeded',
      output: {
        ...(taskId ? { taskId } : {}),
        // 回传实际使用的 prompt（下游确认/重生成环节引用；与 seed 配套）
        prompt: actualPrompt,
        ...(cfg.seed !== undefined && cfg.seed >= 0 ? { seed: cfg.seed } : {}),
        images: images.map(im => {
          const out: Record<string, unknown> = {
            width: im.width,
            height: im.height,
          }
          if (im.url) out.url = im.url
          if (im.base64) out.hasBase64 = true
          // filePath：兼容「纯相对路径」与「local-*:// 协议 URL」两种上游形态 → 本地绝对路径 + local 协议 URL
          const rawPath = im.filePath
          if (rawPath) {
            const stripped = String(rawPath).replace(/^local-[a-z]+:\/\//i, '')
            const abs = isAbsolute(stripped) ? stripped : join(dataRoot, stripped.replace(/^\/+/, ''))
            out.path = abs
            out.localUrl = pathProvider.toAssetUrl(stripped, 'image')
          }
          return out
        }),
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
    const cfg = config as { text?: string; voiceId?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.text).trim() === '') errors.push('合成文本不能为空')
    if (!cfg.voiceId) errors.push('必须指定音色（voiceId）')
    return errors
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

/**
 * 分段转写缺省段长（分钟）：DashScope 同步识别单次 data-uri 上限 20MB，
 * 16kHz 单声道 wav 约 8 分钟即触顶（base64 膨胀 4/3），取 4 分钟留足余量。
 */
const STT_SEGMENT_DEFAULT_MINUTES = 4

/**
 * 超长音频分段转写：按段切 wav → 逐段识别 → 合并（多段时以「第 N 段」标注保留时序）。
 * 失败即抛错（段错误不静默吞掉）。
 */
async function transcribeLongAudio(
  audioPath: string,
  segmentMinutes: number,
  opts: { language?: string; providerId?: string; modelId?: string },
  ctx: WorkflowNodeContext,
): Promise<string> {
  const meta = await getVideoMetadata(audioPath)
  const totalSec = meta.durationSec > 0 ? meta.durationSec : segmentMinutes * 60
  const segmentSec = segmentMinutes * 60
  const totalSegs = Math.max(1, Math.ceil(totalSec / segmentSec))
  const dir = dirname(audioPath)
  const base = basename(audioPath).replace(/\.wav$/i, '')
  const texts: string[] = []
  const segPaths: string[] = []
  try {
    for (let i = 0; i < totalSegs; i++) {
      const startSec = i * segmentSec
      const segPath = join(dir, `${base}_seg${i + 1}.wav`)
      segPaths.push(segPath)
      await extractAudioSegment(audioPath, segPath, startSec, segmentSec)
      ctx.emitProgress(Math.round(((i + 1) / totalSegs) * 90), `转写第 ${i + 1}/${totalSegs} 段`)
      const resp = await VoiceService.recognizeSpeech({
        audioPath: segPath,
        ...(opts.language ? { language: opts.language as never } : {}),
        ...(opts.providerId ? { providerId: opts.providerId } : {}),
        ...(opts.modelId ? { modelId: opts.modelId } : {}),
      } as never)
      const data = unwrap(resp, `语音识别（第 ${i + 1} 段）`)
      texts.push(data.text ?? '')
    }
  } finally {
    // 清理分段临时 wav（长音频多次运行磁盘累积，报告分组 17 🟡3）
    for (const p of segPaths) {
      try { rmSync(p, { force: true }) } catch { /* 已删/占用则忽略 */ }
    }
  }
  const joined = texts
    .map((t, i) => (t.trim() ? (totalSegs > 1 ? `【第 ${i + 1} 段】\n${t.trim()}` : t.trim()) : ''))
    .filter(Boolean)
  return joined.join('\n\n')
}

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
      segmentMinutes?: number
    }
    const audio = stringifyValue(cfg.audio)
    // 音频来源支持：文件路径（含 file:// 前缀）或 base64 数据
    const isPath = !audio.startsWith('data:')

    // 超长音频自动分段转写（防单次 data-uri 20MB 超限）；元数据读取失败则降级单段
    let audioMeta: { durationSec: number } | null = null
    if (isPath) {
      try {
        audioMeta = await getVideoMetadata(audio)
      } catch {
        audioMeta = null // 元数据失败不阻断：走单段（真正失败由 VoiceService 明确报错）
      }
    }
    if (audioMeta && isPath) {
      const segMin = cfg.segmentMinutes !== undefined && Number(cfg.segmentMinutes) > 0
        ? Number(cfg.segmentMinutes)
        : STT_SEGMENT_DEFAULT_MINUTES
      if (audioMeta.durationSec > segMin * 60) {
        const text = await transcribeLongAudio(audio, segMin, {
          language: cfg.language,
          providerId: cfg.providerConfigId,
          modelId: cfg.modelId,
        }, ctx)
        return { status: 'succeeded', output: { text } }
      }
    }

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
    // 经引擎事件通道推送（前端 ElNotification 呈现）——静态 import 统一事件发射器实例（防双实例分离）
    getEventEmitter().emit(WORKFLOW_RUN_EVENT_CHANNEL, {
      type: WORKFLOW_RUN_EVENT_TYPES.notify,
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
  kbQueryMultiNode,
  kbIngestNode,
  webSearchNode,
  translateNode,
  imageGenNode,
  ttsNode,
  sttNode,
  appNotifyNode,
]
