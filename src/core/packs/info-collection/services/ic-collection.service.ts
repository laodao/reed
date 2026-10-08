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
import type {
  IcBlueprint,
  IcReviewStatus,
  IcRowMeasure,
  IcRowStatus,
  IcSourceTier,
} from '@shared/types/info-collection.types'
import type {
  IcCollectionDeps,
  IcLlmFn,
  IcRepos,
  IcSearchFn,
} from './ic-deps'
import type { IcProjectRow } from '@core/database/repositories/ic-project.repository'
import type { IcTaskRow } from '@core/database/repositories/ic-task.repository'
import type { IcSourceRow } from '@core/database/repositories/ic-source.repository'
import type { IcRowItem } from '@core/database/repositories/ic-row.repository'
import { draftBlueprint } from './ic-blueprint.service'

export { checkBlueprint }

/** 抽取 prompt 每源正文的字符预算（超长截断——成本护栏，截断在 stats 如实标记） */
const EXTRACT_TEXT_MAX_CHARS = 12000

/** 任务执行统计（stats_json 的形状；质量仪表的数据源） */
export interface IcTaskStats {
  searches: number
  toolCalls: number
  budgetMax: number
  sourcesNew: number
  sourcesFailed: number
  rowsDraft: number
  rowsRejectedQuote: number
  rowsMerged: number
  rowsSchemaRejected: number
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
    const done: Promise<void> = this.executeTask(task.id, project.id, bp).catch(async () => {
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
  private async executeTask(taskId: string, projectId: string, bp: IcBlueprint): Promise<void> {
    const repos = this.repos()
    const pass = await repos.passes.startAttempt({ id: this.newId('pass'), projectId, taskId, passKey: 'collect' })
    const stats: IcTaskStats = {
      searches: 0,
      toolCalls: 0,
      budgetMax: bp.stopRules.budget.maxToolCalls,
      sourcesNew: 0,
      sourcesFailed: 0,
      rowsDraft: 0,
      rowsRejectedQuote: 0,
      rowsMerged: 0,
      rowsSchemaRejected: 0,
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

          // 抓取（先保命：有 snapshotStore 时抓到即落快照）
          stats.toolCalls += 1
          const doc = await this.fetchDoc(item.url)
          const blocked = doc.blocked || doc.status === 403 || doc.status === 429
          const source = await repos.sources.create({
            id: this.newId('src'),
            projectId,
            taskId,
            url: item.url,
            urlNormalized: norm,
            fetchStatus: doc.ok && doc.body ? 'ok' : blocked ? 'blocked' : 'failed',
          })
          if (!doc.ok || !doc.body) {
            stats.sourcesFailed += 1
            continue
          }

          // 先提取正文（本地纯 CPU，不耗预算），让快照带上 markdown（提取失败快照仍存 HTML）
          let markdown = ''
          try {
            markdown = this.extractText(doc.body, item.url).trim()
          } catch {
            markdown = ''
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
            await repos.rows.create({
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
            stats.rowsDraft += 1
            if (r.requirementId) {
              irHits.add(r.requirementId)
              irSatisfiedRound.set(r.requirementId, round)
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

function parseDate(v: string | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
