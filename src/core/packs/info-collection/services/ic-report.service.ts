/**
 * 信息搜集：整理产出服务（主设计 §3 阶段 5 后半 + §4.5 质量报告）
 * @module core/packs/info-collection/services/ic-report.service
 *
 * 分工纪律——**确定性的归确定性，叙述的才给 LLM**：
 * - 数据表 / 时间线 / 引用清单 / 质量报告：直接从条目与源记录渲染（零幻觉面）；
 * - 要点卡：LLM 起草，但每条陈述必须结构化挂证据行 id，数值经反查校验回链，
 *   回链不到即剔（宁可空缺不可无据）；孤证/低置信条目必须如实标注；
 * - 整理稿第二模型审：覆盖 / 充分 / 忠实三问，审出问题以"审核备注"随稿交付（标注制）。
 * 整理文档整体入项目知识库（内容唯一存储在 kb），同时返回 markdown 给 UI 预览。
 */

import type { IcRepos, IcLlmFn, IcKbPort } from './ic-deps'
import type { IcProjectRow } from '@core/database/repositories/ic-project.repository'
import type { IcRowItem } from '@core/database/repositories/ic-row.repository'
import type { IcTaskRow } from '@core/database/repositories/ic-task.repository'
import { verifyStatements, type IcDraftEntry, type IcDraftStatement } from '@shared/utils/info-collection-verify-draft'
import { clusterSources } from '@shared/utils/info-collection-cluster'
import { detectValueConflicts } from '@shared/utils/info-collection-conflicts'
import { parseJsonObject } from '@shared/utils/info-collection-json'

const CARDS_SYSTEM = `你是整理撰稿人，把已确认的搜集条目写成要点卡。

硬纪律（违反会被程序化反查剔除）：
1. 每条陈述（statement）必须挂 evidenceRowIds——只允许引用给定条目列表里的 rowId。
2. 陈述中的**每个数字**（含年份、百分比）必须来自所挂条目（其值/期间/引句/字段中真实出现）；条目里没有的数字写出来就会被剔除。
3. 只归纳、不外推：不得添加条目之外的因果解释、预测或背景知识。
4. 孤证条目要在陈述末尾标"（孤证）"；低置信标"（低置信，待复核）"。
5. 只输出一个 JSON 对象：{"cards":[{"irId":"R1","title":"卡片标题","statements":[{"text":"…","evidenceRowIds":["r-1"]}]}]}`

const REPORT_REVIEW_SYSTEM = `你是整理稿的第二模型审稿人（独立意见），只审三问：
1. 覆盖：must 级信息需求是否都有对应内容，缺失是否如实说明；
2. 充分：孤证 / 低置信 / 待复核是否被如实标注（而不是被藏起来）；
3. 忠实：整理稿是否比条目"多说了什么"（外推、因果、评价）。
只报告问题，不重写；没问题就返回空数组。只输出 JSON：{"issues":["…"]}`

export interface IcReportDeps {
  repos: IcRepos
  llm: IcLlmFn
  reviewLlm: IcLlmFn
  kbAdd: IcKbPort['addDocument']
  newId: (prefix: string) => string
  /** 整理结果登记为文本资产卡（统一登记层 §5；缺省不登记） */
  registerAsset?: (input: {
    name: string
    text: string
    url?: string
    metadata?: Record<string, unknown>
    sourceRef?: string
  }) => Promise<{ id: string } | null>
}

export interface IcReportResult {
  markdown: string
  /** 反查校验剔除的陈述数（宁可空缺不可无据） */
  strippedStatements: number
  /** 第二模型审的问题清单（随稿"审核备注"交付） */
  reviewIssues: string[]
  imported: boolean
  documentId: string | null
}

export async function generateProjectReport(deps: IcReportDeps, projectId: string): Promise<IcReportResult> {
  const project = await requireProject(deps.repos, projectId)
  const rows = await deps.repos.rows.listByProject(projectId)
  const usable = rows.filter(r => r.status === 'confirmed' || r.status === 'stale')
  if (usable.length === 0) throw new Error('还没有已确认的条目——先在人审工作台确认，再生成整理报告')
  const sources = await deps.repos.sources.listByProject(projectId)
  const tasks = await deps.repos.tasks.listByProject(projectId)
  const latestTask = tasks.find(t => t.stats) ?? null

  const sourceOf = new Map(sources.map(s => [s.id, s]))
  const entries: IcDraftEntry[] = usable.map(r => ({
    rowId: r.id,
    value: r.measure.value,
    period: r.measure.period,
    quote: r.quote,
    row: (r.row && typeof r.row === 'object' ? r.row : null) as Record<string, unknown> | null,
  }))

  // ---- ① 要点卡（LLM 起草 → 结构化反查 → 剔除违规陈述） ----
  let cardsMarkdown = ''
  let strippedStatements = 0
  if (usable.length > 0) {
    try {
      const cards = await draftCards(deps.llm, project, usable)
      const statements: IcDraftStatement[] = []
      for (const card of cards) for (const st of card.statements) statements.push(st)
      const verdict = verifyStatements(statements, entries)
      strippedStatements = verdict.stripped.length
      const okByText = new Set(verdict.passed.map(v => v.statement))
      const lines: string[] = []
      for (const card of cards) {
        const kept = card.statements.filter(st => okByText.has(st))
        if (kept.length === 0) continue
        lines.push(`### ${card.title}`)
        for (const st of kept) {
          lines.push(`- ${st.text}（证据：${st.evidenceRowIds.join('、')}）`)
        }
        lines.push('')
      }
      cardsMarkdown = lines.join('\n')
    } catch {
      cardsMarkdown = '（要点卡生成失败——条目不受影响，可重试）\n'
    }
  }

  // ---- ② 数据表（确定性渲染） ----
  const dataTableLines: string[] = ['| 指标 | 数值 | 单位 | 期间 | 维度 | 标记 | 来源 |', '| --- | --- | --- | --- | --- | --- | --- |']
  for (const r of usable) {
    if (r.measure.value === null || r.measure.value === undefined) continue
    const marks = [r.singleSource ? '孤证' : '', r.confidence === 'low' ? '低置信' : '', r.needsReview ? '待复核' : '']
      .filter(Boolean)
      .join('/')
    const dims = r.measure.dims && Object.keys(r.measure.dims).length
      ? Object.entries(r.measure.dims).map(([k, v]) => `${k}=${String(v)}`).join(' ')
      : '—'
    const tier = r.sourceId ? sourceOf.get(r.sourceId)?.tier ?? null : null
    dataTableLines.push(
      `| ${esc(r.measure.metric ?? '—')} | ${r.measure.value} | ${esc(r.measure.unit ?? '—')} | ${esc(r.measure.period ?? '—')} | ${esc(dims)} | ${marks || '—'} | ${tier ? `T${tier}` : '—'} |`,
    )
  }
  const dataTableMd = dataTableLines.length > 2 ? dataTableLines.join('\n') : '（无数值条目）'

  // ---- ③ 时间线（确定性：按期间排序） ----
  const timeline = usable
    .filter(r => r.measure.period)
    .sort((a, b) => (a.measure.period! < b.measure.period! ? -1 : 1))
    .map(r => {
      const tier = r.sourceId ? sourceOf.get(r.sourceId)?.tier ?? null : null
      const v = r.measure.value !== null ? ` ${r.measure.value}${r.measure.unit ?? ''}` : ''
      return `- **${r.measure.period}** ${esc(r.measure.metric ?? r.requirementId ?? '')}${v}${tier ? `（来源 T${tier}）` : ''}`
    })
  const timelineMd = timeline.length > 0 ? timeline.join('\n') : '（无带期间条目）'

  // ---- ④ 引用清单（确定性） ----
  const confirmedSources = sources.filter(s => s.reviewStatus === 'confirmed')
  const sourceListMd =
    confirmedSources.map(s => {
      const date = s.collectedAt?.toISOString().slice(0, 10) ?? '未知'
      const hits = s.irHits.join('/') || '—'
      return `- [T${s.tier ?? '?'}] ${s.url} —— ${s.tierRationale ?? ''}（采集 ${date}；满足 ${hits}）`
    }).join('\n') || '（无已确认来源）'

  // ---- ⑤ 质量报告（确定性统计 + 最近任务统计） ----
  const clusterResult = clusterSources(sources.map(s => ({ sourceId: s.id, fingerprint: s.textFingerprint, tier: s.tier, publishedAt: s.publishedAt })))
  const conflicts = detectValueConflicts(
    rows.filter(r => r.status !== 'superseded').map(r => ({
      rowId: r.id, sourceId: r.sourceId ?? '', schemaId: r.schemaId,
      metric: r.measure.metric, period: r.measure.period, dims: r.measure.dims, value: r.measure.value,
    })),
  )
  const tierCounts = new Map<string, number>()
  for (const s of confirmedSources) {
    const key = s.tier ? `T${s.tier}` : '未定级'
    tierCounts.set(key, (tierCounts.get(key) ?? 0) + 1)
  }
  const lowConfidence = usable.filter(r => r.confidence === 'low').length
  const needsReviewCount = rows.filter(r => r.needsReview).length
  const singleSourceCount = usable.filter(r => r.singleSource).length
  const stats = latestTask?.stats as Partial<IcTaskStatsLike> | null
  const negative = stats?.negativeResults ?? []
  const qualityLines = [
    `- 来源构成：${confirmedSources.length} 个已确认源（${[...tierCounts.entries()].map(([k, v]) => `${k}×${v}`).join('、') || '无'}）；转载簇 ${clusterResult.clusters} 个`,
    `- 条目：确认/有效 ${usable.length} 条；低置信 ${lowConfidence}；孤证 ${singleSourceCount}；待复核标记 ${needsReviewCount}`,
    `- 数值冲突组：${conflicts.length}（归因结论见各条目备注）`,
    `- 最近任务：覆盖率 ${stats?.coverage !== undefined ? Math.round(stats.coverage * 100) + '%' : '无记录'}；工具调用 ${stats?.toolCalls ?? '—'}/${stats?.budgetMax ?? '—'}`,
    `- 引句回验拒收 ${stats?.rowsRejectedQuote ?? 0}；重复并入 ${stats?.rowsMerged ?? 0}；第二模型复核 ${stats?.reviewTotal ?? 0} 条（不一致 ${stats?.reviewInconsistent ?? 0}）`,
  ]
  if (negative.length > 0) {
    qualityLines.push(`- **未满足的需求（${negative.length}）**：`)
    for (const n of negative) qualityLines.push(`  - ${n.irId} ${n.question}`)
  }
  const qualityMd = qualityLines.join('\n')

  const markdown = [
    `# 【信息搜集】${project.name} 整理报告`,
    '',
    `> 蓝图 v${project.blueprintVersion} ｜ 生成时间 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ｜ 反查校验剔除 ${strippedStatements} 句`,
    '',
    '## 一、要点卡',
    cardsMarkdown || '（无）',
    '## 二、数据表',
    dataTableMd,
    '',
    '## 三、时间线',
    timelineMd,
    '',
    '## 四、引用清单',
    sourceListMd,
    '',
    '## 五、质量报告',
    qualityMd,
  ].join('\n')

  // ---- ⑥ 整理稿第二模型审（标注制；fail-soft） ----
  let reviewIssues: string[] = []
  try {
    reviewIssues = await reviewDraft(deps.reviewLlm, markdown, project, latestTask)
  } catch {
    reviewIssues = []
  }
  const finalMarkdown =
    reviewIssues.length > 0
      ? `${markdown}\n\n## 审核备注（第二模型审）\n${reviewIssues.map(i => `- ${i}`).join('\n')}`
      : markdown

  // ---- ⑦ 入项目知识库（内容唯一存储在 kb） ----
  let imported = false
  let documentId: string | null = null
  if (project.kbId) {
    const resp = await deps.kbAdd(project.kbId, {
      name: `【整理】${project.name}`,
      content: finalMarkdown,
      sourceId: `ic:report:${projectId}`,
    })
    imported = !!resp.documentId
    documentId = resp.documentId
  }

  // 整理结果登记为文本资产卡（统一登记层：处理结果可从资产中心检索；fail-soft 不影响交付）
  if (deps.registerAsset) {
    try {
      await deps.registerAsset({
        name: `【整理报告】${project.name}`.slice(0, 80),
        text: finalMarkdown,
        metadata: {
          mediaKind: 'report',
          projectId,
          kbDocumentId: documentId,
          strippedStatements,
          reviewIssueCount: reviewIssues.length,
        },
        sourceRef: projectId,
      })
    } catch {
      /* 登记失败不阻断报告交付 */
    }
  }

  return { markdown: finalMarkdown, strippedStatements, reviewIssues, imported, documentId }
}

// ==================== 内部 ====================

interface IcTaskStatsLike {
  coverage?: number
  toolCalls?: number
  budgetMax?: number
  rowsRejectedQuote?: number
  rowsMerged?: number
  reviewTotal?: number
  reviewInconsistent?: number
  negativeResults?: Array<{ irId: string; question: string; note: string }>
}

async function requireProject(repos: IcRepos, projectId: string): Promise<IcProjectRow> {
  const p = await repos.projects.getById(projectId)
  if (!p) throw new Error('搜集项目不存在')
  return p
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

async function draftCards(
  llm: IcLlmFn,
  project: IcProjectRow,
  rows: IcRowItem[],
): Promise<Array<{ irId: string; title: string; statements: IcDraftStatement[] }>> {
  const entriesBrief = rows.map(r => ({
    rowId: r.id,
    requirementId: r.requirementId,
    metric: r.measure.metric,
    value: r.measure.value,
    unit: r.measure.unit,
    period: r.measure.period,
    dims: r.measure.dims,
    quote: r.quote,
    singleSource: r.singleSource,
    confidence: r.confidence,
  }))
  const reqBrief = (project.blueprint?.requirements ?? [])
    .map(r => `${r.id}[${r.priority}] ${r.question}`)
    .join('\n')
  const user =
    `信息需求：\n${reqBrief}\n\n已确认条目：\n${JSON.stringify(entriesBrief, null, 2)}\n\n` +
    `按 must → should 顺序写要点卡；没有可用条目的需求不要硬写卡片。`
  const text = await llm({ system: CARDS_SYSTEM, user, maxTokens: 4000 })
  const parsed = parseJsonObject(text)
  const cards = Array.isArray(parsed?.cards) ? parsed.cards : []
  const out: Array<{ irId: string; title: string; statements: IcDraftStatement[] }> = []
  for (const c of cards) {
    if (!c || typeof c !== 'object') continue
    const rec = c as Record<string, unknown>
    const rawStatements = Array.isArray(rec.statements) ? rec.statements : []
    const statements: IcDraftStatement[] = []
    for (const st of rawStatements) {
      if (!st || typeof st !== 'object') continue
      const s = st as Record<string, unknown>
      if (typeof s.text !== 'string' || !s.text.trim()) continue
      statements.push({
        text: s.text,
        evidenceRowIds: Array.isArray(s.evidenceRowIds) ? s.evidenceRowIds.filter((x): x is string => typeof x === 'string') : [],
      })
    }
    if (statements.length === 0) continue
    out.push({ irId: typeof rec.irId === 'string' ? rec.irId : '', title: typeof rec.title === 'string' ? rec.title : '要点', statements })
  }
  return out
}

async function reviewDraft(
  reviewLlm: IcLlmFn,
  markdown: string,
  project: IcProjectRow,
  latestTask: IcTaskRow | null,
): Promise<string[]> {
  const mustReqs = (project.blueprint?.requirements ?? []).filter(r => r.priority === 'must').map(r => r.id)
  const stats = latestTask?.stats as Partial<IcTaskStatsLike> | null
  const user =
    `must 级需求：${mustReqs.join('、') || '（无）'}\n` +
    `已知统计：覆盖率 ${stats?.coverage ?? '无'}；低置信与孤证已在稿内标注。\n\n整理稿：\n${markdown.slice(0, 12000)}\n\n只报告问题（覆盖/充分/忠实三问），只输出 JSON：{"issues":["…"]}`
  const text = await reviewLlm({ system: REPORT_REVIEW_SYSTEM, user, maxTokens: 2000 })
  const parsed = parseJsonObject(text)
  const issues = Array.isArray(parsed?.issues) ? parsed.issues : []
  return issues.filter((i): i is string => typeof i === 'string' && !!i.trim())
}
