/**
 * 信息搜集：管线编排服务（主设计 §3 八阶段的最小实现核心）
 * @module core/packs/info-collection/services/ic-collection.service
 *
 * 职责：任务编排（检索获取 → 正文提取 → 引句锚定抽取 → 裁决入库）+ 人审确认/驳回。
 * 全部外部效应（repos/llm/search/fetch/extract/kb/snapshotStore）走 deps 注入
 * （照搬 kb-brain 纪律），生产缺省在 ic-defaults.ts 装配，测试全内存。
 *
 * 纪律（主设计 §3）：
 * - 先保命再解析：抓到的正文先落快照（有 snapshotStore 时），再进抽取；
 * - 引句锚定：quote 回验不过的抽取**拒收**（防编造硬机制），拒收计数进 stats；
 * - 分域查重：content_hash 只在本项目内比较，重复 → merged（不新增行）；
 * - fail-soft：单源失败只记 fetch_status 继续，绝不阻断整批；
 * - 判停：预算熔断 + 连续 marginalRounds 轮无新 IR 满足即停；
 * - 负结果：must/should IR 未满足如实记录，不装作没发生；
 * - 入库闸门：无 tier_rationale 的源不允许确认入库（信源分级必须带依据）。
 */

import { checkBlueprint } from '@shared/utils/info-collection-blueprint'
import type { IcBlueprintCheckResult } from '@shared/utils/info-collection-blueprint'
import { verifyQuote } from '@shared/utils/info-collection-quote'
import { normalizeUrl } from '@shared/utils/info-collection-url'
import { contentHash } from '@shared/utils/info-collection-content-hash'
import { parseJsonObject } from '@shared/utils/info-collection-json'
import { clusterSources } from '@shared/utils/info-collection-cluster'
import { detectValueConflicts, type IcValueConflictGroup } from '@shared/utils/info-collection-conflicts'
import { isCandidateRelevant } from '@shared/utils/info-collection-relevance'
import {
  detectDirectDocumentUrl,
  detectAudioUrl,
  detectImageUrl,
  detectVideoPageUrl,
  IC_AUDIO_MAX_BYTES,
  IC_MAX_TRANSCRIBE_SEC,
  IC_DOCUMENT_MAX_BYTES,
  IC_IMAGE_MAX_BYTES,
  IC_MAX_IMAGE_DESCRIPTIONS,
} from '@shared/utils/info-collection-document'
import type {
  IcBlueprint,
  IcReviewStatus,
  IcRowMeasure,
  IcRowStatus,
  IcSourceTier,
} from '@shared/types/info-collection.types'
import type {
  IcCollectionDeps,
  IcFetchedDoc,
  IcLlmFn,
  IcRepos,
  IcSearchFn,
  IcAssetPort,
  IcVideoMeta,
} from './ic-deps'
import type { IcProjectRow } from '@core/database/repositories/ic-project.repository'
import type { IcTaskRow } from '@core/database/repositories/ic-task.repository'
import type { IcSourceRow } from '@core/database/repositories/ic-source.repository'
import type { IcRowItem } from '@core/database/repositories/ic-row.repository'
import { draftBlueprint } from './ic-blueprint.service'
import { generateProjectReport } from './ic-report.service'

export { checkBlueprint }

/** 抽取 prompt 每源正文的字符预算（超长截断——成本护栏，截断在 stats 如实标记） */
const EXTRACT_TEXT_MAX_CHARS = 12000

/** URL → 文件名（资产卡命名兜底；标题缺失时用） */
function documentFileName(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname).split('/').pop() ?? ''
    return last || 'document'
  } catch {
    return 'document'
  }
}

/** 临时下载文件清理（资产服务已复制进统一资产目录；文件已被移动/清理时静默） */
async function cleanupTempFile(path: string): Promise<void> {
  try {
    const fs = await import('fs/promises')
    await fs.unlink(path)
  } catch {
    /* ENOENT 等静默 */
  }
}

/** 任务执行统计（stats_json 的形状；质量仪表的数据源） */
export interface IcTaskStats {
  searches: number
  toolCalls: number
  budgetMax: number
  sourcesNew: number
  sourcesFailed: number
  /** 候选相关性软闸拦下的跑题源数（2026-10-08 验收：引擎可能返回门户噪音） */
  candidatesFiltered: number
  /** VLM 图片描述次数（多模态 M2；按张计费的预算熔断计数） */
  imageDescriptions: number
  rowsDraft: number
  rowsRejectedQuote: number
  rowsMerged: number
  rowsSchemaRejected: number
  /** 双模型复核：复核总数 / 判不一致数（M2 质量层） */
  reviewTotal: number
  reviewInconsistent: number
  /** 阶段 5 裁决：转载簇数 / 冲突组数 / 完成归因数 / 孤证行数 */
  clusters: number
  conflictsFound: number
  conflictsAttributed: number
  singleSourceRows: number
  textTruncated: boolean
  negativeResults: Array<{ irId: string; question: string; note: string }>
  irCoverage: Record<string, boolean>
  coverage: number
}

interface ExtractedRow {
  requirementId?: string
  schemaId?: string
  row: Record<string, unknown>
  quote?: string
  confidence?: 'high' | 'low'
}

interface ExtractionOutput {
  source: { tier?: IcSourceTier; rationale?: string; publishedAt?: string }
  rows: ExtractedRow[]
}

const EXTRACT_SYSTEM = `你是信息抽取员。从给定正文中，按"信息需求清单 + 抽取规格"抽出结构化条目。

纪律（违反任何一条都会让这条数据作废）：
1. 每条抽取必须携带 quote——**逐字**复制正文中支撑该条目的原文片段（一句话到一段话）。quote 必须能在正文中找到，系统会逐字回验，找不到 = 幻觉 = 拒收。
2. 只抽正文里真实存在的信息；推算、补全、"应该是"都不允许。
3. 数值保持原文单位，不要换算；千位逗号可去掉。
4. row 的字段与结构必须符合对应 schema 的 jsonSchema。
5. 无法确认的条目 confidence 标 "low"；不要为了凑数硬抽。
6. 同时给出来源评估：tier 按 1官方机构/2官方媒体/3互联网媒体/4互联网搜索 定级，rationale 必填（依据：机构性质/域名属性/署名），提取页面发布时间（没有就省略）。
7. 只输出一个 JSON 对象：{"source":{"tier":1,"rationale":"…","publishedAt":"YYYY-MM-DD"},"rows":[{"requirementId":"R1","schemaId":"s1","row":{…},"quote":"…","confidence":"high"}]}`

/** measure 约定列投影：convention 声明的字段从 row 提取为可计算投影（数值清洗容错） */
export function projectMeasure(bp: IcBlueprint, schemaId: string, row: Record<string, unknown>): IcRowMeasure | null {
  const convention = bp.schemas.find(s => s.id === schemaId)?.convention
  if (!convention || convention.type !== 'measure') return null
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
  const rawValue = row[convention.map.value]
  let value: number | null = null
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) value = rawValue
  else if (typeof rawValue === 'string') {
    const cleaned = rawValue.replace(/[,，\s]/g, '').replace(/％/g, '%')
    const n = Number(cleaned.replace(/%$/, ''))
    if (Number.isFinite(n)) value = n
  }
  const dims: Record<string, unknown> | null = {}
  for (const dim of convention.map.dims ?? []) {
    const v = row[dim]
    if (v !== undefined && v !== null) dims[dim] = v
  }
  return {
    value,
    unit: str(row[convention.map.unit ?? '']),
    period: str(row[convention.map.period ?? '']),
    metric: str(row[convention.map.metric ?? '']),
    dims: Object.keys(dims).length > 0 ? dims : null,
  }
}

export class IcCollectionService {
  private readonly deps: IcCollectionDeps
  private readonly llmFn: IcLlmFn
  private readonly searchFn: IcSearchFn

  constructor(deps: IcCollectionDeps = {}) {
    this.deps = deps
    // 未注入的缺省走惰性 import（ic-defaults），测试全内存注入
    this.llmFn = deps.llm ?? (async req => (await import('./ic-defaults')).defaultIcLlm('ic-collect')(req))
    this.searchFn = deps.search ?? (async (q, m) => (await import('./ic-defaults')).defaultIcSearch(q, m))
  }

  private repos(): IcRepos {
    const r = this.deps.repos ? this.deps.repos() : null
    if (!r) throw new Error('数据库尚未就绪，请稍后重试')
    return r
  }

  private async fetchDoc(url: string) {
    return this.deps.fetch ? this.deps.fetch(url) : (await import('./ic-defaults')).defaultIcFetch(url)
  }

  /** 文档/图片/音频直链下载（多模态；缺省 executeHttpFetch file 模式，落盘临时目录） */
  private async fetchDocument(url: string, opts?: { headers?: Record<string, string>; maxBytes?: number }) {
    return this.deps.documentFetch
      ? this.deps.documentFetch(url, opts)
      : (await import('./ic-defaults')).defaultIcDocumentFetch(url, opts)
  }

  /** 音频转写（多模态 M4；缺省按用户设置走本地 whisper / 云 API） */
  private async transcribe(audioPath: string, mimeType?: string) {
    const fn = this.deps.transcribe ?? (await import('./ic-defaults')).defaultIcTranscribe
    return fn({ audioPath, mimeType })
  }

  /** 统一资产建卡（缺省接平台 getAssetService；未装配时抛错由调用方 fail-soft 吞掉） */
  private async assetsCreate(input: Parameters<IcAssetPort['create']>[0]): Promise<{ id: string }> {
    const port = this.deps.assets ?? (await import('./ic-defaults')).defaultIcAssets
    return port.create(input)
  }

  /** 资产删卡删原件（驳回时；资产不存在静默成功） */
  private async assetsRemove(id: string): Promise<void> {
    const port = this.deps.assets ?? (await import('./ic-defaults')).defaultIcAssets
    return port.remove(id)
  }

  /** 视觉描述（多模态 M2；缺省宿主模型走平台多模态链路） */
  private async describeImage(filePath: string, mimeType?: string): Promise<{ ok: boolean; text?: string; error?: string }> {
    const fn = this.deps.vision ?? (await import('./ic-defaults')).defaultIcVision
    return fn({
      imagePath: filePath,
      mimeType,
      prompt:
        '请客观描述这张图片的内容：主体是什么、可见文字逐字照录（OCR）、图表中的关键数值（若有，注明"读自图表，可能有读数误差"）、图像风格与用途。不要推测图片之外的信息。只输出描述正文。',
    })
  }

  /**
   * 图片直链分支（多模态 M2）：下载原件 → VLM 描述（单任务熔断）→ 统一资产建卡 → 源记录。
   * 描述文本即内容化文本（进快照与 textContent）；描述失败时资产只存原件，源如实标注待补。
   * 独立短流程：不跑引文抽取（描述文本通常短于抽取预算，且图片数值宜人工复核）。
   */
  private async collectImageSource(ctx: {
    projectId: string
    taskId: string
    projectName: string
    url: string
    title: string
    stats: IcTaskStats
  }): Promise<void> {
    const repos = this.repos()
    ctx.stats.toolCalls += 1
    const df = await this.fetchDocument(ctx.url)
    const norm = normalizeUrl(ctx.url) ?? ctx.url
    const failed = async (blocked: boolean, note: string, tempPath?: string): Promise<void> => {
      const source = await repos.sources.create({
        id: this.newId('src'),
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        url: ctx.url,
        urlNormalized: norm,
        fetchStatus: blocked ? 'blocked' : 'failed',
      })
      if (note) await repos.sources.patch(source.id, { tierRationale: note })
      ctx.stats.sourcesFailed += 1
      if (tempPath) void cleanupTempFile(tempPath)
    }
    if (!df.ok || !df.filePath) {
      await failed(df.status === 403 || df.status === 429, '图片下载失败')
      return
    }
    if (df.bytes && df.bytes > IC_IMAGE_MAX_BYTES) {
      await failed(false, `图片超过单件上限（${Math.round(df.bytes / 1024 / 1024)}MB > 8MB）`, df.filePath)
      return
    }

    // VLM 描述：按张计费——单任务 IC_MAX_IMAGE_DESCRIPTIONS 张封顶；模型无 vision 时 fail-soft
    let description = ''
    if (ctx.stats.imageDescriptions < IC_MAX_IMAGE_DESCRIPTIONS) {
      ctx.stats.toolCalls += 1
      ctx.stats.imageDescriptions += 1
      const v = await this.describeImage(df.filePath, df.mimeType)
      if (v.ok && v.text) description = v.text.trim()
    }

    const source = await repos.sources.create({
      id: this.newId('src'),
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      url: ctx.url,
      urlNormalized: norm,
      fetchStatus: 'ok',
    })
    if (this.snapshots && description) {
      const p = await this.snapshots.write(ctx.projectId, source.id, '', description)
      if (p) await repos.sources.patch(source.id, { snapshotPath: p })
    }
    // 分级：直链图片无法程序化认证来源 → 保守 T3 + 依据写明（确认闸门要求 tier+rationale）
    await repos.sources.patch(source.id, {
      tier: 3,
      tierRationale: description
        ? '图片直链，未经官方认证按互联网媒体处理；已生成视觉描述'
        : '图片直链，未经官方认证按互联网媒体处理；视觉描述生成失败（未配置视觉模型或模型不支持）——原件已存，内容化待补',
      contentHash: contentHash(description || ctx.url),
    })
    try {
      const card = await this.assetsCreate({
        name: (ctx.title?.trim() || documentFileName(ctx.url)).slice(0, 80),
        category: 'image',
        subCategory: ctx.projectName,
        tags: ['信息搜集', ctx.projectName],
        filePath: df.filePath,
        textContent: description || undefined,
        url: ctx.url,
        metadata: { mediaKind: 'image', ext: detectImageUrl(ctx.url)?.ext, sourceId: source.id, projectId: ctx.projectId, described: !!description },
        sourceType: 'info-collection',
        sourceRef: ctx.projectId,
      })
      await repos.sources.patch(source.id, { assetId: card.id })
    } catch {
      /* 登记失败不影响采集（fail-soft） */
    }
    void cleanupTempFile(df.filePath)
    ctx.stats.sourcesNew += 1
  }

  /**
   * 音频直链分支（多模态 M4）：下载原件 → 按用户设置转写（本地 whisper / 云 API）。
   * 未启用/失败：原件照存（category=audio），源如实标注"待转写"，绝不编造文本。
   */
  private async collectAudioSource(ctx: {
    projectId: string
    taskId: string
    projectName: string
    url: string
    title: string
    stats: IcTaskStats
  }): Promise<void> {
    const repos = this.repos()
    ctx.stats.toolCalls += 1
    const df = await this.fetchDocument(ctx.url, { maxBytes: IC_AUDIO_MAX_BYTES })
    const norm = normalizeUrl(ctx.url) ?? ctx.url
    const failed = async (blocked: boolean, note: string, tempPath?: string): Promise<void> => {
      const source = await repos.sources.create({
        id: this.newId('src'),
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        url: ctx.url,
        urlNormalized: norm,
        fetchStatus: blocked ? 'blocked' : 'failed',
      })
      if (note) await repos.sources.patch(source.id, { tierRationale: note })
      ctx.stats.sourcesFailed += 1
      if (tempPath) void cleanupTempFile(tempPath)
    }
    if (!df.ok || !df.filePath) {
      await failed(df.status === 403 || df.status === 429, '音频下载失败')
      return
    }
    if (df.bytes && df.bytes > IC_AUDIO_MAX_BYTES) {
      await failed(false, `音频超过单件上限（${Math.round(df.bytes / 1024 / 1024)}MB > 100MB）`, df.filePath)
      return
    }

    // 转写（off → 如实未启用；长音频由云端/本地自限）
    ctx.stats.toolCalls += 1
    const tr = await this.transcribe(df.filePath, df.mimeType)
    const transcript = tr.ok && tr.text ? tr.text.trim() : ''
    const transcribeNote = tr.ok
      ? `已转写（${tr.provider === 'local' ? '本地 whisper' : '云端 API'}）`
      : `转写未完成：${tr.error ?? '未知原因'}——原件已存，待转写`

    const source = await repos.sources.create({
      id: this.newId('src'),
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      url: ctx.url,
      urlNormalized: norm,
      fetchStatus: 'ok',
    })
    if (this.snapshots && transcript) {
      const p = await this.snapshots.write(ctx.projectId, source.id, '', transcript)
      if (p) await repos.sources.patch(source.id, { snapshotPath: p })
    }
    // 分级：直链音频无法程序化认证来源 → 保守 T3 + 依据写明（确认闸门要求 tier+rationale）
    await repos.sources.patch(source.id, {
      tier: 3,
      tierRationale: `音频直链，未经官方认证按互联网媒体处理；${transcribeNote}`,
      contentHash: contentHash(transcript || ctx.url),
    })
    try {
      const card = await this.assetsCreate({
        name: (ctx.title?.trim() || documentFileName(ctx.url)).slice(0, 80),
        category: 'audio',
        subCategory: ctx.projectName,
        tags: ['信息搜集', ctx.projectName],
        filePath: df.filePath,
        textContent: transcript || undefined,
        url: ctx.url,
        metadata: {
          mediaKind: 'audio',
          sourceId: source.id,
          projectId: ctx.projectId,
          transcribed: tr.ok,
          transcribeProvider: tr.provider,
          durationSec: tr.durationSec,
        },
        sourceType: 'info-collection',
        sourceRef: ctx.projectId,
      })
      await repos.sources.patch(source.id, { assetId: card.id })
    } catch {
      /* 登记失败不影响采集（fail-soft） */
    }
    void cleanupTempFile(df.filePath)
    ctx.stats.sourcesNew += 1
  }

  /**
   * 视频页分支（多模态 M3 元数据档）：标题/简介/UP主/时长 + CC 字幕全文（可得时）为内容化文本，
   * 建纯文本资产卡。不下载视频原件（设计红线）。youtube/抖音等未支持站点如实 failed。
   */
  private async collectVideoSource(ctx: {
    projectId: string
    taskId: string
    projectName: string
    url: string
    title: string
    stats: IcTaskStats
  }): Promise<void> {
    const repos = this.repos()
    const norm = normalizeUrl(ctx.url) ?? ctx.url
    const failed = async (note: string): Promise<void> => {
      const source = await repos.sources.create({
        id: this.newId('src'),
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        url: ctx.url,
        urlNormalized: norm,
        fetchStatus: 'failed',
      })
      await repos.sources.patch(source.id, { tierRationale: note })
      ctx.stats.sourcesFailed += 1
    }
    const platform = detectVideoPageUrl(ctx.url)?.platform
    if (platform !== 'bilibili') {
      await failed('该视频站点暂不支持（当前仅 B站）——可手动下载后本地导入')
      return
    }
    ctx.stats.toolCalls += 1
    const fn = this.deps.videoMeta ?? (await import('./ic-defaults')).defaultIcVideoMeta
    const meta: IcVideoMeta = await fn(ctx.url)
    if (!meta.ok) {
      await failed(`视频元数据获取失败：${meta.error ?? '未知原因'}`)
      return
    }
    // 语音转写（M4）：无 CC 字幕且用户启用转写时，解析 B站音频直链 → 下载 → 转写。
    // 时长上限 2 小时熔断；失败如实标注，不阻断元数据交付。
    let transcriptText = ''
    if (!meta.subtitleText && (meta.durationSec ?? 0) <= IC_MAX_TRANSCRIBE_SEC) {
      try {
        ctx.stats.toolCalls += 1
        const resolve = this.deps.resolveVideoAudio ?? (await import('./ic-defaults')).defaultIcResolveVideoAudio
        const resolved = await resolve(ctx.url)
        if (resolved.ok && resolved.audioUrl) {
          const audio = await this.fetchDocument(resolved.audioUrl, { headers: resolved.headers, maxBytes: IC_AUDIO_MAX_BYTES })
          if (audio.ok && audio.filePath) {
            const tr = await this.transcribe(audio.filePath, audio.mimeType)
            if (tr.ok && tr.text) transcriptText = tr.text.trim()
            void cleanupTempFile(audio.filePath)
          }
        }
      } catch {
        /* 解析/下载/转写任一失败 → 走"待转写"标注 */
      }
    }

    // 内容化文本：标题/UP主/时长/简介 + 字幕全文或语音转写（如有）
    const dur = meta.durationSec ? `${Math.floor(meta.durationSec / 60)}分${meta.durationSec % 60}秒` : '未知'
    const speechPart = meta.subtitleText
      ? `【字幕全文】\n${meta.subtitleText}`
      : transcriptText
        ? `【语音转写】\n${transcriptText}`
        : '【语音内容】本视频无可匿名获取的CC字幕，且转写未启用或失败——语音内容待转写'
    const parts = [
      `《${meta.title ?? ctx.title}》`,
      `UP主：${meta.owner ?? '未知'}｜时长：${dur}｜平台：bilibili`,
      meta.desc ? `简介：${meta.desc}` : null,
      speechPart,
    ].filter(Boolean) as string[]
    const canonical = parts.join('\n\n')

    const source = await repos.sources.create({
      id: this.newId('src'),
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      url: ctx.url,
      urlNormalized: norm,
      fetchStatus: 'ok',
    })
    if (this.snapshots) {
      const p = await this.snapshots.write(ctx.projectId, source.id, '', canonical)
      if (p) await repos.sources.patch(source.id, { snapshotPath: p })
    }
    await repos.sources.patch(source.id, {
      tier: 3,
      tierRationale: meta.subtitleText
        ? 'B站视频页（含CC字幕全文），按互联网媒体处理'
        : transcriptText
          ? 'B站视频页（语音已转写），按互联网媒体处理'
          : 'B站视频页（仅元数据，字幕/转写不可得），按互联网媒体处理',
      contentHash: contentHash(canonical),
    })
    try {
      const port = this.deps.assets ?? (await import('./ic-defaults')).defaultIcAssets
      const card = await port.createText({
        name: (meta.title ?? ctx.title).slice(0, 80),
        category: 'video',
        subCategory: ctx.projectName,
        tags: ['信息搜集', ctx.projectName],
        text: canonical,
        url: ctx.url,
        metadata: {
          mediaKind: 'video',
          platform: 'bilibili',
          sourceId: source.id,
          projectId: ctx.projectId,
          hasSubtitle: !!meta.subtitleText,
          hasTranscript: !!meta.subtitleText || !!transcriptText,
        },
        sourceType: 'info-collection',
        sourceRef: ctx.projectId,
      })
      await repos.sources.patch(source.id, { assetId: card.id })
    } catch {
      /* 登记失败不影响采集（fail-soft） */
    }
    ctx.stats.sourcesNew += 1
  }

  private extractText(html: string, baseUrl: string): string {
    return this.deps.extract ? this.deps.extract(html, baseUrl) : html
  }

  private async kbAdd(kbId: string, doc: { name: string; content: string; sourceId: string }) {
    return this.deps.kb
      ? this.deps.kb.addDocument(kbId, doc)
      : (await import('./ic-defaults')).defaultIcKb.addDocument(kbId, doc)
  }

  private get snapshots() {
    return this.deps.snapshotStore ?? null
  }

  private newId(prefix: string): string {
    return this.deps.newId ? this.deps.newId(prefix) : `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
  }

  /** 确认蓝图（快速模式自检通过后自动调用 / 精调模式人审调用）：置 autoConfirm 并落库升版 */
  async confirmBlueprint(projectId: string): Promise<IcProjectRow> {
    const repos = this.repos()
    const project = await this.requireProject(repos, projectId)
    const bp = project.blueprint
    if (!bp) throw new Error('蓝图缺失或已损坏，无法确认')
    const check = checkBlueprint(bp)
    if (!check.ok) {
      throw new Error(`蓝图自检未通过：${check.errors[0]?.message ?? '存在结构性缺陷'}`)
    }
    const confirmed: IcBlueprint = { ...bp, autoConfirm: true }
    await repos.projects.patch(projectId, { blueprint: confirmed })
    return (await repos.projects.getById(projectId))!
  }

  /**
   * 创建项目 + 起草蓝图：mode=quick 且自检通过 → 蓝图自动确认（autoConfirm 置位），
   * 否则保持待确认（精调模式 / 自检有 error）。
   */
  async createProject(input: {
    name: string
    goal: string
    mode?: 'quick' | 'review'
  }): Promise<{ project: IcProjectRow; check: IcBlueprintCheckResult }> {
    const mode = input.mode ?? 'quick'
    const draft = await draftBlueprint(input.goal, { llm: this.llmFn })
    const blueprint: IcBlueprint = {
      ...draft.blueprint,
      autoConfirm: mode === 'quick' && draft.check.ok,
    }
    const repos = this.repos()
    const project = await repos.projects.create({
      id: this.newId('proj'),
      name: input.name?.trim() || input.goal.slice(0, 30),
      goal: input.goal,
      blueprint,
    })
    // quick 模式自检通过 → 立即开跑。2026-10-08 真机发现：此前只置 autoConfirm 不跑，
    // 与界面"蓝图已确认，任务已在后台开跑"的承诺不符（用户必须再手动点一次开始搜集）。
    if (blueprint.autoConfirm) {
      void this.runTask(project.id).catch(() => undefined)
    }
    return { project, check: draft.check }
  }

  /** 绑定/改绑项目知识库（内容唯一存储在 kb；M1 由用户指定，自动建库下一步接 embedding 配置） */
  async setProjectKb(projectId: string, kbId: string | null): Promise<void> {
    const repos = this.repos()
    await this.requireProject(repos, projectId)
    await repos.projects.patch(projectId, { kbId })
  }

  async listProjects(status?: 'active' | 'archived'): Promise<IcProjectRow[]> {
    return this.repos().projects.list(status)
  }

  async getProject(projectId: string): Promise<IcProjectRow | null> {
    return this.repos().projects.getById(projectId)
  }

  async listTasks(projectId: string): Promise<IcTaskRow[]> {
    return this.repos().tasks.listByProject(projectId)
  }

  async listSources(projectId: string, reviewStatus?: IcReviewStatus): Promise<IcSourceRow[]> {
    return this.repos().sources.listByProject(projectId, { reviewStatus })
  }

  async listRows(projectId: string, filter?: { schemaId?: string; status?: IcRowStatus }): Promise<IcRowItem[]> {
    return this.repos().rows.listByProject(projectId, filter)
  }

  /** 生成整理报告（要点卡反查校验 + 确定性数据表/时间线/引用清单 + 质量报告 + 第二模型审；入项目 kb） */
  async generateReport(projectId: string) {
    const repos = this.repos()
    await this.requireProject(repos, projectId)
    return generateProjectReport(
      {
        repos,
        llm: this.llmFn,
        reviewLlm: req => this.reviewLlm(req),
        kbAdd: (id, d) => this.kbAdd(id, d),
        newId: p => this.newId(p),
        registerAsset: async input => {
          try {
            const port = this.deps.assets ?? (await import('./ic-defaults')).defaultIcAssets
            return await port.createText({
              name: input.name,
              category: 'text',
              subCategory: (await repos.projects.getById(projectId))?.name,
              tags: ['信息搜集', '整理报告'],
              text: input.text,
              url: input.url,
              metadata: input.metadata,
              sourceType: 'info-collection',
              sourceRef: input.sourceRef ?? projectId,
            })
          } catch {
            return null // 资产服务未装配/失败：报告照常交付
          }
        },
      },
      projectId,
    )
  }

  /**
   * 发起搜集任务：校验蓝图 → 建任务（后台执行）→ 立即返回 taskId。
   * `done` 供测试/调用方等待完成；生产走 listTasks 轮询（与 dl 前端同款模式）。
   */
  async runTask(projectId: string): Promise<{ taskId: string; done: Promise<void> }> {
    const repos = this.repos()
    const project = await this.requireProject(repos, projectId)
    const bp = project.blueprint
    if (!bp) throw new Error('蓝图缺失或已损坏，无法执行')
    const check = checkBlueprint(bp)
    if (!check.ok) {
      throw new Error(`蓝图自检未通过，禁止执行：${check.errors[0]?.message ?? '存在结构性缺陷'}`)
    }
    const task = await repos.tasks.create({ id: this.newId('task'), projectId, blueprintVersion: project.blueprintVersion })
    await repos.tasks.patch(task.id, { status: 'running' })
    // 后台执行：fail-soft 兜底（崩溃/未捕获错误落到任务终态，不悬 running）
    const done: Promise<void> = this.executeTask(task.id, project.id, bp, project.name).catch(async () => {
      try {
        const pass = (await repos.passes.listByTask(task.id)).at(-1)
        if (pass && pass.status === 'running') await repos.passes.fail(pass.id)
        const current = await repos.tasks.getById(task.id)
        if (current && (current.status === 'running' || current.status === 'pending')) {
          await repos.tasks.patch(task.id, { status: 'failed', finishedAt: new Date() })
        }
      } catch {
        /* 终态兜底失败只能吞掉（db 不可用时无事可做） */
      }
    })
    return { taskId: task.id, done }
  }

  /** 管线主体（后台执行；所有失败路径都以任务终态收口） */
  private async executeTask(taskId: string, projectId: string, bp: IcBlueprint, projectName: string): Promise<void> {
    const repos = this.repos()
    const pass = await repos.passes.startAttempt({ id: this.newId('pass'), projectId, taskId, passKey: 'collect' })
    const stats: IcTaskStats = {
      searches: 0,
      toolCalls: 0,
      budgetMax: bp.stopRules.budget.maxToolCalls,
      sourcesNew: 0,
      sourcesFailed: 0,
      candidatesFiltered: 0,
      imageDescriptions: 0,
      rowsDraft: 0,
      rowsRejectedQuote: 0,
      rowsMerged: 0,
      rowsSchemaRejected: 0,
      reviewTotal: 0,
      reviewInconsistent: 0,
      clusters: 0,
      conflictsFound: 0,
      conflictsAttributed: 0,
      singleSourceRows: 0,
      textTruncated: false,
      negativeResults: [],
      irCoverage: {},
      coverage: 0,
    }
    try {
      // 增量：项目已有源全部进 seen（刷新时跳过已采 URL）
      const seenUrls = new Set<string>()
      for (const s of await repos.sources.listByProject(projectId)) seenUrls.add(s.urlNormalized)

      const irSatisfiedRound = new Map<string, number>()
      let round = 0
      let lastNewIrRound = 0
      let textTruncated = false

      outer: for (const query of bp.sourceStrategy.seedQueries) {
        round += 1
        if (stats.toolCalls >= stats.budgetMax) break
        const searchRes = await this.searchFn(query, 10)
        stats.toolCalls += 1
        stats.searches += 1
        if (searchRes.error) continue

        for (const item of searchRes.items) {
          if (stats.toolCalls >= stats.budgetMax) break outer
          const norm = normalizeUrl(item.url)
          if (!norm || seenUrls.has(norm)) continue
          seenUrls.add(norm)
          // 候选相关性软闸：标题/摘要需含查询片段，跑题源（如引擎只搜了首词返回的门户首页）不烧抓取预算
          if (!isCandidateRelevant(item.title, item.snippet, query)) {
            stats.candidatesFiltered += 1
            continue
          }

          // 抓取（先保命：有 snapshotStore 时抓到即落快照）
          stats.toolCalls += 1
          // 音频直链分支（多模态 M4）：下载原件 → 按用户设置转写为内容化文本
          if (detectAudioUrl(item.url)) {
            await this.collectAudioSource({
              projectId,
              taskId,
              projectName,
              url: item.url,
              title: item.title,
              stats,
            })
            continue
          }

          // 视频页分支（多模态 M3 元数据档）：不下载视频，取标题/简介/CC字幕为内容化文本
          if (detectVideoPageUrl(item.url)) {
            await this.collectVideoSource({
              projectId,
              taskId,
              projectName,
              url: item.url,
              title: item.title,
              stats,
            })
            continue
          }

          // 图片直链分支（多模态 M2）：下载原件 → VLM 描述 → 建卡（独立短流程，不走网页管线）
          if (detectImageUrl(item.url)) {
            await this.collectImageSource({
              projectId,
              taskId,
              projectName,
              url: item.url,
              title: item.title,
              stats,
            })
            continue
          }

          // 文档直链分支（多模态 M1）：.pdf/.docx/... 下载原件提文本，不走网页抓取
          const docProbe = detectDirectDocumentUrl(item.url)
          let docFile: { filePath: string; mimeType?: string; bytes?: number } | null = null
          let doc: IcFetchedDoc
          if (docProbe) {
            const df = await this.fetchDocument(item.url)
            if (df.ok && df.filePath) {
              docFile = { filePath: df.filePath, mimeType: df.mimeType, bytes: df.bytes }
              doc = { ok: true, status: df.status, body: '' }
            } else {
              doc = {
                ok: false,
                status: df.status,
                body: '',
                blocked: df.status === 403 || df.status === 429,
                error: df.error,
              }
            }
          } else {
            doc = await this.fetchDoc(item.url)
          }
          const blocked = doc.blocked || doc.status === 403 || doc.status === 429
          const source = await repos.sources.create({
            id: this.newId('src'),
            projectId,
            taskId,
            url: item.url,
            urlNormalized: norm,
            fetchStatus: (doc.ok && (doc.body || docFile)) ? 'ok' : blocked ? 'blocked' : 'failed',
          })
          if (!doc.ok || (!doc.body && !docFile)) {
            stats.sourcesFailed += 1
            continue
          }

          // 先提取正文（本地纯 CPU，不耗预算），让快照带上 markdown（提取失败快照仍存 HTML）
          let markdown = ''
          if (docFile) {
            // 文档原件 → extract-text 纯函数提结构化 markdown（惰性 import：@firecrawl 原生模块很重，不进模块加载链）
            try {
              const { extractTextFromFile, inferFileType } = await import('@core/utils/extract-text')
              const fileType = inferFileType(`doc.${docProbe!.ext}`) ?? 'txt'
              if (docFile.bytes && docFile.bytes > IC_DOCUMENT_MAX_BYTES) {
                await repos.sources.patch(source.id, {
                  fetchStatus: 'failed',
                  tierRationale: `文档超过单件下载上限（${Math.round(docFile.bytes / 1024 / 1024)}MB > 50MB）`,
                })
                stats.sourcesFailed += 1
                void cleanupTempFile(docFile.filePath)
                continue
              }
              markdown = (await extractTextFromFile(docFile.filePath, fileType, { asMarkdown: true })).trim()
            } catch {
              markdown = ''
            }
          } else {
            try {
              markdown = this.extractText(doc.body, item.url).trim()
            } catch {
              markdown = ''
            }
          }
          // 文档提不出文本（扫描版 PDF 等）：如实标失败，原件不建卡
          if (docFile && markdown.length < 100) {
            await repos.sources.patch(source.id, {
              fetchStatus: 'failed',
              tierRationale: '文档文本提取失败或为空（疑似扫描版/加密文档），建议手动处理',
            })
            stats.sourcesFailed += 1
            void cleanupTempFile(docFile.filePath)
            continue
          }
          // 先保命：有 snapshotStore 时抓到即落快照（html + markdown 双段）
          if (this.snapshots) {
            const p = await this.snapshots.write(projectId, source.id, doc.body, markdown)
            if (p) await repos.sources.patch(source.id, { snapshotPath: p })
          }
          if (markdown.length < 300) {
            await repos.sources.patch(source.id, {
              fetchStatus: 'partial',
              tierRationale: '正文提取过短（疑似动态渲染页或反爬墙），建议手动导入',
            })
            stats.sourcesFailed += 1
            continue
          }
          const sourceText = markdown.length > EXTRACT_TEXT_MAX_CHARS ? markdown.slice(0, EXTRACT_TEXT_MAX_CHARS) : markdown
          if (markdown.length > EXTRACT_TEXT_MAX_CHARS) textTruncated = true
          await repos.sources.patch(source.id, {
            contentHash: contentHash(sourceText),
            tierRationale: null,
          })

          // 统一资产登记（多模态 M1：抓取成功即建卡，"一资产一文件一正文"；fail-soft，登记失败不影响采集）
          if (docFile) {
            try {
              const card = await this.assetsCreate({
                name: (item.title?.trim() || documentFileName(item.url)).slice(0, 80),
                category: 'document',
                subCategory: projectName,
                tags: ['信息搜集', projectName],
                filePath: docFile.filePath,
                textContent: markdown,
                url: item.url,
                metadata: { mediaKind: 'document', ext: docProbe!.ext, sourceId: source.id, projectId },
                sourceType: 'info-collection',
                sourceRef: projectId,
              })
              await repos.sources.patch(source.id, { assetId: card.id })
            } catch {
              /* 资产服务未装配/登记失败：不建卡，ic_source.assetId 留空（内容仍在快照与 ic_source 可溯源） */
            }
            // 建卡后清理临时下载文件（资产服务已复制进统一资产目录；未建卡也不留垃圾）
            void cleanupTempFile(docFile.filePath)
          }

          // 抽取（引句锚定 + 来源评估）
          stats.toolCalls += 1
          let extraction: ExtractionOutput
          try {
            extraction = await this.extractRows(bp, { url: item.url, title: item.title, text: sourceText })
          } catch {
            await repos.sources.patch(source.id, { fetchStatus: 'partial', tierRationale: '抽取输出无法解析，该源未结构化（正文已留存，可手动处理）' })
            continue
          }
          if (extraction.source.tier && extraction.source.rationale) {
            const publishedAt = parseDate(extraction.source.publishedAt)
            await repos.sources.patch(source.id, {
              tier: extraction.source.tier,
              tierRationale: extraction.source.rationale,
              publishedAt,
            })
          }

          // 裁决入库：引句回验 → schema 校验 → 分域查重 → 落 draft
          const irHits = new Set<string>()
          const createdRows: Array<{ id: string; row: Record<string, unknown>; quote: string | null }> = []
          for (const r of extraction.rows) {
            const quote = r.quote?.trim() ?? ''
            if (!quote || verifyQuote(quote, sourceText).verdict === 'miss') {
              stats.rowsRejectedQuote += 1
              continue
            }
            if (!r.schemaId || !bp.schemas.some(s => s.id === r.schemaId)) {
              stats.rowsSchemaRejected += 1
              continue
            }
            const rowHash = contentHash(r.row, quote)
            if (await repos.rows.findByHash(projectId, r.schemaId, rowHash)) {
              stats.rowsMerged += 1
              continue
            }
            const created = await repos.rows.create({
              id: this.newId('row'),
              projectId,
              taskId,
              schemaId: r.schemaId,
              row: r.row,
              measure: projectMeasure(bp, r.schemaId, r.row),
              sourceId: source.id,
              requirementId: r.requirementId ?? null,
              quote,
              confidence: r.confidence === 'low' ? 'low' : 'high',
              contentHash: rowHash,
            })
            createdRows.push({ id: created.id, row: r.row, quote })
            stats.rowsDraft += 1
            if (r.requirementId) {
              irHits.add(r.requirementId)
              irSatisfiedRound.set(r.requirementId, round)
            }
          }

          // 双模型复核（第二意见；照搬飞轮"自己蒸馏自己不可靠"教训）：
          // 数值条目对原文核数、表述条目核引句忠实性——不一致 → low confidence + needs_review
          if (createdRows.length > 0) {
            try {
              const verdicts = await this.reviewRows(sourceText, createdRows)
              let inconsistent = 0
              for (const v of verdicts) {
                const target = createdRows[v.index]
                if (!target || v.verdict !== 'inconsistent') continue
                inconsistent += 1
                await repos.rows.patch(target.id, {
                  confidence: 'low',
                  needsReview: true,
                  reviewNote: v.reason ?? '第二模型复核不支持该条目',
                })
              }
              stats.reviewTotal += createdRows.length
              stats.reviewInconsistent += inconsistent
              if (inconsistent / createdRows.length > 0.2) {
                await repos.sources.patch(source.id, {
                  tierRationale: `${extraction.source.rationale ?? '来源评估'}（第二模型复核不一致率超 20%，整源降级待审）`,
                })
              }
            } catch {
              // 复核通道不可用 → fail-soft：条目照常入库，复核缺失在 stats.reviewTotal 可见
            }
          }
          stats.sourcesNew += 1
          if (irHits.size > 0) {
            await repos.sources.patch(source.id, { irHits: [...irHits] })
            lastNewIrRound = round
          }
        }
        // 判停：连续 marginalRounds 轮无新 IR 满足
        if (round - lastNewIrRound >= bp.stopRules.marginalRounds) break
      }

      // 阶段 5 裁决（转载簇/冲突归因/孤证）——fail-soft：裁决失败不掩盖已交付统计
      try {
        const adj = await this.adjudicateProject(projectId)
        stats.clusters = adj.clusters
        stats.conflictsFound = adj.conflictsFound
        stats.conflictsAttributed = adj.conflictsAttributed
        stats.singleSourceRows = adj.singleSourceRows
      } catch {
        /* 裁决失败留空：人审工作台仍可处理，或手动触发 ic:adjudicate */
      }

      // 负结果 + 覆盖率（如实统计，不掩盖）
      const satisfied = new Set<string>()
      for (const req of bp.requirements) {
        const hit = irSatisfiedRound.has(req.id)
        stats.irCoverage[req.id] = hit
        if (hit) satisfied.add(req.id)
        else if (req.priority !== 'nice') {
          stats.negativeResults.push({
            irId: req.id,
            question: req.question,
            note: '本轮查询未获得满足该需求的条目（试过的种子查询见查询日志）',
          })
        }
      }
      stats.coverage = bp.requirements.length > 0 ? satisfied.size / bp.requirements.length : 0
      stats.textTruncated = textTruncated

      await repos.passes.finish(pass.id, { stats: { ...stats } })
      await repos.tasks.patch(taskId, {
        status: 'reviewing',
        stats: { ...stats } as Record<string, unknown>,
        finishedAt: new Date(),
      })
    } catch (e) {
      await repos.passes.fail(pass.id, { stats: { error: e instanceof Error ? e.message : String(e) } })
      throw e
    }
  }

  /** 人审确认：源 staged → confirmed；无 tier+rationale 的源拒绝入库（信源分级必须带依据）；有 kb 时每源一文档导入 */
  async confirmBatch(
    projectId: string,
    sourceIds: string[],
  ): Promise<{ confirmed: string[]; skipped: Array<{ id: string; reason: string }> }> {
    const repos = this.repos()
    const project = await this.requireProject(repos, projectId)
    const confirmed: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []
    for (const id of sourceIds) {
      const source = await repos.sources.getById(id)
      if (!source || source.projectId !== projectId) {
        skipped.push({ id, reason: '源不存在或不属于该项目' })
        continue
      }
      if (source.reviewStatus !== 'staged') {
        skipped.push({ id, reason: `当前状态 ${source.reviewStatus}，只有待审源可确认` })
        continue
      }
      if (source.fetchStatus !== 'ok') {
        skipped.push({ id, reason: `抓取状态为 ${source.fetchStatus}，不可入库` })
        continue
      }
      if (!source.tier || !source.tierRationale) {
        skipped.push({ id, reason: '缺少信源分级或分级依据（入库闸门：无依据的定级不允许入库）' })
        continue
      }
      // kb 导入（内容唯一存储在 kb；每源一文档，文档头带溯源元数据）
      if (project.kbId) {
        const markdown = this.snapshots ? await this.readSnapshotMarkdown(source) : null
        if (markdown) {
          const header =
            `> 来源：${source.url}\n> 分级：T${source.tier}（${source.tierRationale}）\n` +
            `> 采集时间：${source.collectedAt?.toISOString() ?? '未知'}${source.publishedAt ? `｜发布：${source.publishedAt.toISOString().slice(0, 10)}` : ''}\n\n`
          const kbResp = await this.kbAdd(project.kbId, {
            name: `【搜集】${source.urlNormalized.slice(0, 80)}`,
            content: header + markdown,
            sourceId: `ic:${source.id}`,
          })
          if (kbResp.documentId) await repos.sources.patch(source.id, { kbDocumentId: kbResp.documentId })
        }
        // 无快照存档时：源仍可确认（正文在原站），但溯源完整度在质量报告体现
      }
      await repos.sources.patch(source.id, { reviewStatus: 'confirmed' })
      const sourceRows = await repos.rows.listBySource(source.id)
      await repos.rows.confirmRows(sourceRows.filter(r => r.status === 'draft').map(r => r.id))
      confirmed.push(id)
    }
    return { confirmed, skipped }
  }

  async rejectBatch(projectId: string, sourceIds: string[], reason?: string): Promise<number> {
    const repos = this.repos()
    let n = 0
    for (const id of sourceIds) {
      const source = await repos.sources.getById(id)
      if (!source || source.projectId !== projectId || source.reviewStatus !== 'staged') continue
      await repos.sources.patch(id, {
        reviewStatus: 'rejected',
        tierRationale: reason ? `${source.tierRationale ?? ''}（驳回原因：${reason}）`.trim() : source.tierRationale,
      })
      // 多模态 M1：带原件的来源驳回 → 删登记卡与原件（不要的资料不占盘；fail-soft 不阻断批量）
      if (source.assetId) {
        try {
          await this.assetsRemove(source.assetId)
        } catch {
          /* 卡已删/资产服务未装配时静默 */
        }
      }
      n += 1
    }
    return n
  }

  private async readSnapshotMarkdown(source: { snapshotPath: string | null }): Promise<string | null> {
    if (!source.snapshotPath || !this.deps.snapshotStore) return null
    const raw = await this.deps.snapshotStore.read(source.snapshotPath)
    if (!raw) return null
    // 快照文件格式：HTML 与 markdown 以分隔符共存（write 时写入）；读取 md 段
    const marker = '\n===== IC-SNAPSHOT-MARKDOWN =====\n'
    const idx = raw.indexOf(marker)
    return idx >= 0 ? raw.slice(idx + marker.length) : raw
  }

  // ==================== M2 质量层：双模型复核 / 裁决（转载簇 · 冲突归因 · 孤证） ====================

  private async reviewLlm(req: { system: string; user: string; maxTokens?: number }): Promise<string> {
    return this.deps.reviewLlm
      ? this.deps.reviewLlm(req)
      : (await import('./ic-defaults')).defaultIcLlm('ic-review')(req)
  }

  /**
   * 第二模型逐条复核：row 的数值/表述是否被正文真实支持。
   * 失败抛错（调用方 fail-soft）——复核是增益闸门不是阻断闸门。
   */
  private async reviewRows(
    sourceText: string,
    rows: Array<{ id: string; row: Record<string, unknown>; quote: string | null }>,
  ): Promise<Array<{ index: number; verdict: 'consistent' | 'inconsistent'; reason?: string }>> {
    const payload = rows.map((r, i) => ({ index: i, row: r.row, quote: r.quote }))
    const user =
      `正文：\n${sourceText}\n\n待复核条目（index/row/quote）：\n${JSON.stringify(payload, null, 2)}\n\n` +
      `逐条核验：row 的内容是否被正文真实支持（数值是否与正文一致、表述是否忠实于引句与上下文）。` +
      `只输出 JSON：{"rows":[{"index":0,"verdict":"consistent|inconsistent","reason":"不一致时说明，一致可省略"}]}`
    const text = await this.reviewLlm({ system: REVIEW_SYSTEM, user, maxTokens: 3000 })
    const parsed = parseJsonObject(text)
    const list = Array.isArray(parsed?.rows) ? parsed.rows : []
    const out: Array<{ index: number; verdict: 'consistent' | 'inconsistent'; reason?: string }> = []
    for (const v of list) {
      if (!v || typeof v !== 'object') continue
      const rec = v as Record<string, unknown>
      if (typeof rec.index !== 'number') continue
      out.push({
        index: rec.index,
        verdict: rec.verdict === 'inconsistent' ? 'inconsistent' : 'consistent',
        reason: typeof rec.reason === 'string' ? rec.reason : undefined,
      })
    }
    return out
  }

  /**
   * 阶段 5 裁决（对全项目，可重复运行）：
   * ① 转载簇识别 + 主源选择（派生结论——重跑即随更优一手源升级）；
   * ② 数值冲突 → LLM 归因四分类 → revision 关旧开新 / 其余 needs_review 并排；
   * ③ 孤证标记（must 级 IR 独立来源单位 = 转载簇/单例，仅 1 个单位 → single_source）。
   * 分域纪律：只在 (user, project) 内比较，跨项目永不互裁。
   */
  async adjudicateProject(
    projectId: string,
  ): Promise<{ clusters: number; conflictsFound: number; conflictsAttributed: number; singleSourceRows: number }> {
    const repos = this.repos()
    const project = await this.requireProject(repos, projectId)
    const bp = project.blueprint
    if (!bp) throw new Error('蓝图缺失或已损坏，无法裁决')
    const sources = await repos.sources.listByProject(projectId)
    const rows = await repos.rows.listByProject(projectId)

    // ① 转载簇
    const clusterResult = clusterSources(
      sources.map(s => ({ sourceId: s.id, fingerprint: s.textFingerprint, tier: s.tier, publishedAt: s.publishedAt })),
    )
    for (const s of sources) {
      const cid = clusterResult.clusterOf.get(s.id) ?? s.id
      const pid = clusterResult.primaryOf.get(s.id) ?? s.id
      const shouldBePrimary = pid === s.id
      if (s.clusterId !== cid || s.isPrimary !== shouldBePrimary) {
        await repos.sources.patch(s.id, { clusterId: cid, isPrimary: shouldBePrimary })
      }
    }

    // ② 数值冲突 → 归因四分类（排除已废弃行：它们已退位，不参与"现行数据"的冲突）
    const conflictGroups = detectValueConflicts(
      rows
        .filter(r => r.status !== 'superseded')
        .map(r => ({
          rowId: r.id,
          sourceId: r.sourceId ?? '',
          schemaId: r.schemaId,
          metric: r.measure.metric,
          period: r.measure.period,
          dims: r.measure.dims,
          value: r.measure.value,
        })),
    )
    let attributed = 0
    for (const g of conflictGroups) {
      try {
        const attribution = await this.attributeConflict(g, rows, sources)
        attributed += 1
        if (attribution.type === 'revision' && attribution.keepRowId && g.members.some(m => m.rowId === attribution.keepRowId)) {
          // 修订关系：关旧开新（历史可回溯）
          for (const m of g.members) {
            if (m.rowId === attribution.keepRowId) {
              await repos.rows.patch(m.rowId, { reviewNote: `冲突归因：修订关系——${attribution.note ?? ''}`.trim() })
            } else {
              await repos.rows.supersede(m.rowId, attribution.keepRowId)
            }
          }
        } else {
          const label =
            attribution.type === 'time' ? '时点不同' : attribution.type === 'caliber' ? '口径不同' : '真矛盾（归因不了，按此处理）'
          for (const m of g.members) {
            await repos.rows.patch(m.rowId, {
              needsReview: true,
              reviewNote: `冲突归因：${label}${attribution.note ? `——${attribution.note}` : ''}`,
            })
          }
        }
      } catch {
        // 归因失败 → 全组按真矛盾进人审（宁降级不误杀，A1 教训）
        for (const m of g.members) {
          await repos.rows.patch(m.rowId, { needsReview: true, reviewNote: '冲突归因失败，按真矛盾进人审' })
        }
      }
    }

    // ③ 孤证标记（must 级 IR）
    let singleSourceRows = 0
    for (const req of bp.requirements) {
      if (req.priority !== 'must') continue
      const reqRows = rows.filter(r => r.requirementId === req.id && (r.status === 'draft' || r.status === 'confirmed'))
      const units = new Set(reqRows.map(r => clusterResult.clusterOf.get(r.sourceId ?? '') ?? r.sourceId ?? 'unknown'))
      if (units.size <= 1) {
        for (const r of reqRows) {
          // 重读新鲜行：冲突归因阶段可能刚写入 reviewNote，不得用过期快照覆盖
          const fresh = await repos.rows.getById(r.id)
          if (!fresh || fresh.singleSource) continue
          await repos.rows.patch(r.id, {
            singleSource: true,
            reviewNote: fresh.reviewNote ?? '孤证：must 级需求仅一个独立来源支撑',
          })
          singleSourceRows += 1
        }
      }
    }

    return { clusters: clusterResult.clusters.length, conflictsFound: conflictGroups.length, conflictsAttributed: attributed, singleSourceRows }
  }

  /** 冲突归因四分类（time/caliber/revision/conflict）；解析失败抛错 → 调用方按真矛盾处理 */
  private async attributeConflict(
    g: IcValueConflictGroup,
    rows: IcRowItem[],
    sources: IcSourceRow[],
  ): Promise<{ type: 'time' | 'caliber' | 'revision' | 'conflict'; keepRowId?: string; note?: string }> {
    const memberBrief = g.members.map(m => {
      const row = rows.find(r => r.id === m.rowId)
      const src = sources.find(s => s.id === m.sourceId)
      return {
        rowId: m.rowId,
        value: m.value,
        quote: row?.quote ?? '',
        sourceTier: src?.tier ?? null,
        sourceUrl: src?.urlNormalized ?? '',
        publishedAt: src?.publishedAt?.toISOString().slice(0, 10) ?? null,
      }
    })
    const user =
      `同一数据点出现不同数值，请归因四选一：\n` +
      `- time：时点不同（数值实际来自不同年份/期次，period 标注可能有误）\n` +
      `- caliber：口径不同（如统计口径差异、初步数 vs 快报）\n` +
      `- revision：修订关系（后期核实数替代前期初步数）——给出 keepRowId=最权威应保留的行\n` +
      `- conflict：真矛盾（无法归因）\n\n` +
      `归因失败宁可 conflict（高风险裁决降级人审），不要猜测。\n\n` +
      `数据点：metric=${g.metric}｜period=${g.period}｜dims=${g.dimsKey || '（无）'}\n` +
      `成员：\n${JSON.stringify(memberBrief, null, 2)}\n\n` +
      `只输出 JSON：{"type":"time|caliber|revision|conflict","keepRowId":"仅 revision 时给","note":"一句依据"}`
    const text = await this.llmFn({ system: ATTRIBUTION_SYSTEM, user, maxTokens: 1500 })
    const parsed = parseJsonObject(text)
    const type = parsed?.type
    if (type !== 'time' && type !== 'caliber' && type !== 'revision' && type !== 'conflict') {
      throw new Error('attribution: bad type')
    }
    return {
      type,
      keepRowId: typeof parsed?.keepRowId === 'string' ? parsed.keepRowId : undefined,
      note: typeof parsed?.note === 'string' ? parsed.note : undefined,
    }
  }

  private async extractRows(
    bp: IcBlueprint,
    source: { url: string; title: string; text: string },
  ): Promise<ExtractionOutput> {
    const schemaBrief = bp.schemas
      .map(s => `- schema "${s.id}"（${s.title}）：${JSON.stringify(s.jsonSchema)}${s.convention ? `，约定列映射 ${JSON.stringify(s.convention.map)}` : ''}`)
      .join('\n')
    const reqBrief = bp.requirements
      .map(r => `- ${r.id} [${r.priority}/${r.form}] ${r.question}${r.schemaId ? `（用 schema ${r.schemaId}）` : ''}`)
      .join('\n')
    const user = `信息需求清单：\n${reqBrief}\n\n抽取规格：\n${schemaBrief || '（无自定义 schema：全部输出为引文卡 {statement, context}，schemaId 省略）'}\n\n来源：${source.title}\nURL：${source.url}\n\n正文：\n${source.text}`
    const text = await this.llmFn({ system: EXTRACT_SYSTEM, user, maxTokens: 6000 })
    const parsed = parseJsonObject(text)
    if (!parsed) throw new Error('extraction: unparseable')
    const sourceInfo = (parsed.source && typeof parsed.source === 'object' ? parsed.source : {}) as Record<string, unknown>
    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : []
    const rows: ExtractedRow[] = []
    for (const r of rawRows) {
      if (!r || typeof r !== 'object') continue
      const rec = r as Record<string, unknown>
      if (!rec.row || typeof rec.row !== 'object') continue
      rows.push({
        requirementId: typeof rec.requirementId === 'string' ? rec.requirementId : undefined,
        schemaId: typeof rec.schemaId === 'string' ? rec.schemaId : undefined,
        row: rec.row as Record<string, unknown>,
        quote: typeof rec.quote === 'string' ? rec.quote : undefined,
        confidence: rec.confidence === 'low' ? 'low' : 'high',
      })
    }
    return {
      source: {
        tier: sourceInfo.tier === 1 || sourceInfo.tier === 2 || sourceInfo.tier === 3 || sourceInfo.tier === 4 ? sourceInfo.tier : undefined,
        rationale: typeof sourceInfo.rationale === 'string' ? sourceInfo.rationale : undefined,
        publishedAt: typeof sourceInfo.publishedAt === 'string' ? sourceInfo.publishedAt : undefined,
      },
      rows,
    }
  }

  private async requireProject(repos: IcRepos, projectId: string): Promise<IcProjectRow> {
    const project = await repos.projects.getById(projectId)
    if (!project) throw new Error('搜集项目不存在')
    return project
  }
}

const REVIEW_SYSTEM = `你是独立的第二模型复核员（第一意见来自另一位抽取员，你不信任它）。
逐条核验待复核条目：row 的数值/表述是否被正文真实支持——数值逐位对（注意单位与千位分隔），表述不得超出正文所说。
拿不准就判 inconsistent（宁误报不漏报：不一致只会让条目进人审，漏报会放行错数）。只输出一个 JSON 对象。`

const ATTRIBUTION_SYSTEM = `你是数据仲裁员。两个来源对同一数据点给出不同数值时，做四选一归因并给出依据。
关键纪律：归因失败宁可判 conflict（进人审），绝不允许猜测——错误地把"真矛盾"归因为"时点不同"会放行错数。
只输出一个 JSON 对象。`

function parseDate(v: string | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
