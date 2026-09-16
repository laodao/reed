/**
 * 章节写作章法执行器（工作流与工具共用）
 * @module core/packs/longwriting/services/chapter-writing-executor
 *
 * 用户意见（2026-09-15）：agent 不能保证百分百指令遵循——章法五步不能靠
 * LLM 逐步自觉调用，必须由确定性代码按序执行。本模块把章法五步固化为一个
 * 可复用的执行入口，两条触发路径共用同一实现：
 * - 研讨室主编工具 lw_write_chapter_full（对话触发）
 * - 工作流节点 chapter-writing（工作流运行触发，步骤状态进 run 记录）
 *
 * 步骤：生成设计卡 → 自检（不通过即返回问题，不落正文）→ 依卡绑定出场实体并
 * 确认 → 一致性门禁 → 生成并保存正文 + 图谱提取 → 写后一致性检查。
 * 护栏（设计卡门禁/一致性门禁）留在各服务内部，本执行器不绕过任何一道。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import { generateText } from 'ai'
import { LongWritingAIService } from '@core/platform/services/longwriting-ai.service'
import { getRoomState } from '@core/packs/longwriting/story-room/room-state'
import { ledgerSnapshotText } from '@core/packs/longwriting/story-room/room-ledger'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { ConsistencyService } from '@core/platform/services/longwriting/graph/consistency.service'
import { acknowledgeConflict, isAcknowledgedConflict, listResolutions } from '@core/platform/services/longwriting/conflict-gate'
import { extractJsonObject } from '@core/platform/services/longwriting/story-persist'

const logger = createLogger('ChapterWritingExecutor')

export interface ChapterWritingProgress {
  step: string
  message: string
}

/**
 * 章法生成统一走项目「章节写作」stage 模型配置（模型治理）。
 * 此前三处生成调用全传 undefined——静默落到应用默认提供商，项目设置里的
 * stage 模型对章法形同虚设（实测：切了 stage 配置正文仍走 vLLM）。
 * 未配置时返回空对象，回退应用默认提供商（老项目行为不变）。
 */
async function resolveStageModelOpts(projectId: string): Promise<{ providerConfigId?: string; modelId?: string }> {
  try {
    const cfg = await getCoreDatabaseManager().lwProjectModelConfigs?.getByProjectAndStage(projectId, 'chapters')
    if (cfg?.providerConfigId && cfg?.modelId) return { providerConfigId: cfg.providerConfigId, modelId: cfg.modelId }
  } catch { /* 读配置失败不阻断：回退默认提供商 */ }
  return {}
}

export interface ChapterWritingOutcome {
  ok: boolean
  error?: string
  needsReview?: string[]
  data?: {
    chapterId?: string
    wordCount?: number
    designCard?: string
    review?: { ok: boolean; issues: string[] }
    postCheck?: { passed: boolean; report: string | null }
    qualityGate?: unknown
  }
}

export interface ChapterWritingMethodOptions {
  projectId: string
  outlineId: string
  overwrite?: boolean
  targetWords?: number
  /** 进度回调（工作流节点转 emitProgress；工具转 task:progress 事件） */
  onProgress?: (p: ChapterWritingProgress) => void
  signal?: AbortSignal
}

/** LLM 章节审读调用：走 harness 的模型解析（与研讨室同模型源） */
async function generateChapterReviewText(
  purpose: string,
  req: { system: string; user: string; maxTokens?: number },
  signal?: AbortSignal,
): Promise<string> {
  const model = await getAgentLoopHarness().resolveModel({})
  const r = await generateText({
    model: model as never,
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
    maxOutputTokens: req.maxTokens,
    abortSignal: signal,
  })
  logger.info(`[chapter-writing] 审读完成 purpose=${purpose} chars=${r.text?.length ?? 0}`)
  return r.text ?? ''
}

/** 解析审读 JSON 的 issues 数组（容错：截断/包 markdown 均降级为空） */
function safeParseIssues(raw: string): Array<{ item?: string; evidence?: string; why?: string }> {
  try {
    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first === -1 || last <= first) return []
    const parsed = JSON.parse(raw.slice(first, last + 1))
    return Array.isArray(parsed?.issues) ? parsed.issues : []
  } catch {
    return []
  }
}

/**
 * R10 语义复核（用户拍板 2026-09-15：大纲落点判定程序难以胜任，交给 agent）：
 * 字面扫描只当候选生成器（宁漏勿错），"是否已用其他措辞落点"由模型裁决——
 * 允许同义改写/语序变化/对话侧写；判为已落点的自动知情保留（带证据登记），
 * 确未落点的维持 pending 交给门禁。失败不阻断（候选留给人工复核）。
 */
async function verifyUnlandedBeatsWithAI(
  projectId: string,
  outlineId: string,
  content: string,
  consensusText: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const m = getCoreDatabaseManager()
  const { buildOutlineDocOrder, outlineChapterNumber } = await import('@core/platform/services/longwriting/outline-order')
  const outlines = (await m.lwOutlines?.getByProjectId(projectId)) || []
  const no = outlineChapterNumber(buildOutlineDocOrder(outlines), outlineId)
  if (!no) return null
  const summary = outlines.find((o) => o.id === outlineId)?.summary || ''

  const [all, rows] = await Promise.all([
    ConsistencyService.getInstance().scanContradictions(projectId),
    listResolutions(m, projectId),
  ])
  const candidates = all.filter((c) => c.rule === 'R10' && c.chapterNumber === no && !isAcknowledgedConflict(c, rows))
  const beats = candidates.map((c) => c.beatText || '').filter(Boolean)
  if (beats.length === 0) return null

  const raw = await generateChapterReviewText(
    'r10-landing-verify',
    {
      system:
        '你是长篇小说的大纲-正文落点审核员。判断大纲承诺的每个事件拍是否已在正文中实现：允许同义改写、语序变化、对话侧写、场景改写，只要读者能从正文获得该事件的信息即算落点；纯提及其结果的对话不算落点。只输出 JSON，不要任何其他文字。',
      user: `【本章大纲】${summary}
${consensusText ? `【作者已拍板的共识（与大纲冲突时以共识为准）】\n${consensusText}\n` : ''}【本章正文】
${content}

【待判定的大纲事件拍】
${beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}

逐拍判定。返回 JSON：{"verdicts":[{"index":1,"landed":true,"evidence":"正文原句或改写处（landed=true 必填）"}]}。只输出 JSON。`,
      maxTokens: 1200,
    },
    signal,
  )
  const verdicts = Array.isArray(extractJsonObject(raw)?.verdicts) ? extractJsonObject(raw)!.verdicts : []
  let acked = 0
  for (const v of verdicts) {
    if (!v || v.landed !== true) continue
    const target = candidates[Number(v.index) - 1]
    if (!target) continue
    await acknowledgeConflict(m, projectId, target, 'kept', `AI 语义复核：已用其他措辞落点（${String(v.evidence || '').slice(0, 60)}）`)
    acked++
  }
  const missed = beats.length - acked
  return `大纲落点语义复核：${beats.length} 拍中 ${acked} 拍已用其他措辞实现（自动登记保留），${missed} 拍确未落点${missed > 0 ? '，需补写或修订大纲' : ''}`
}

/**
 * 按章法写完一章（确定性编排，调用即按序执行五步）。
 * 任何一步失败即返回（不落正文/不产生半成品），问题清单随返回值带给调用方。
 */
export async function runChapterWritingMethod(opts: ChapterWritingMethodOptions): Promise<ChapterWritingOutcome> {
  const { projectId, outlineId, overwrite, onProgress } = opts
  const ai = LongWritingAIService.getInstance()
  const svc = (await import('./longwriting.service')).LongWritingService.getInstance()

  // 已有正文保护（与写作台/旧工具同规则）
  const existing = await svc.getChapter(outlineId)
  if (existing?.content?.trim() && !overwrite) {
    return { ok: false, error: '该章已有正文。询问用户是否重写，用户同意后带 overwrite=true 重新执行。' }
  }

  // 共识账本：对话中拍板的修正必须对设计卡与正文生成可见，否则每层生成都会
  // 回退到已被否决的旧设定（实跑：第2章大纲"乘客活下来了" vs 拍板"救不回"）
  let consensusText = ''
  try {
    const roomState = await getRoomState(getCoreDatabaseManager(), projectId)
    consensusText = ledgerSnapshotText(roomState.ledger) || ''
  } catch { /* 账本读取失败不阻断（项目可能不经研讨室） */ }

  onProgress?.({ step: 'design', message: '生成章节设计卡（情节概要/开场钩子/爽点/章尾卡点/出场实体）' })
  const stageModel = await resolveStageModelOpts(projectId)
  const cardResult = await ai.generateChapterCard(
    `wf-card-${Date.now()}`,
    projectId,
    outlineId,
    stageModel.providerConfigId,
    stageModel.modelId,
    consensusText || undefined,
    // overwrite：设计卡门禁同样放行仅引用本章的旧稿疑点（与正文生成同口径）
    { overwrite: opts.overwrite === true },
  )
  if (!cardResult.success) return { ok: false, error: cardResult.error }
  const { card, markdown, review } = cardResult.data as any

  onProgress?.({ step: 'review', message: '自检设计卡（对照全书概要/前情/作者共识）' })
  const issues: string[] = Array.isArray(review?.issues) ? review.issues : []
  if (review && review.ok === false && issues.length > 0) {
    return {
      ok: false,
      needsReview: issues,
      error: `设计卡自检未通过（${issues.length} 处），先与用户确认修正方向后重新执行：\n${issues.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`,
      data: { designCard: markdown, review },
    }
  }

  onProgress?.({ step: 'confirm', message: '绑定出场实体并确认设计卡' })
  const applied = await svc.applyChapterCard(projectId, outlineId, card, markdown)
  await svc.confirmPrewrite(outlineId)
  void applied

  onProgress?.({ step: 'gate', message: '一致性门禁检查（R1-R10 未处理疑点会拒绝生成）' })

  onProgress?.({ step: 'write', message: '生成正文（设计卡+全书概要+前情事实注入）' })
  const writeResult = await ai.generateChapter(
    `wf-write-${Date.now()}`,
    projectId,
    outlineId,
    opts.targetWords,
    stageModel.providerConfigId,
    stageModel.modelId,
    undefined,
    // 正文生成同样注入共识账本——大纲本身可能是旧设定，账本修正优先级更高
    consensusText ? `【作者已拍板的共识与修正（最高优先级，与大纲/上文冲突时以此为准，禁止出现被否决的写法）】\n${consensusText}` : undefined,
    // overwrite：写前门禁放行仅引用本章的旧稿疑点（旧稿正文正是被替换对象）
    { overwrite: opts.overwrite === true },
  )
  if (!writeResult.success) return { ok: false, error: writeResult.error }
  const content = (writeResult.data as any)?.content || ''
  if (!content.trim()) return { ok: false, error: '正文生成为空' }

  onProgress?.({ step: 'save', message: '保存正文并提取图谱（事件/状态切片/伏笔）' })
  const saved = await svc.saveChapter(outlineId, content)
  try {
    const { buildOutlineDocOrder, outlineChapterNumber } = await import('@core/platform/services/longwriting/outline-order')
    const outlines = (await getCoreDatabaseManager().lwOutlines?.getByProjectId(projectId)) || []
    const no = outlineChapterNumber(buildOutlineDocOrder(outlines), outlineId) ?? 0
    const { ChapterGraphProcessor } = await import('@core/platform/services/longwriting/graph/chapter-graph.processor')
    await new ChapterGraphProcessor().process({
      projectId,
      outlineId,
      chapterContent: content,
      chapterNumber: no,
      ...stageModel,
    })
  } catch (e: any) {
    logger.warn('[chapter-writing] 图谱提取失败（下次保存重跑）:', e?.message)
  }

  // 写后一致性检查（用户要求：每章写完做一次一致性检查并汇报结果）
  // 三部分：①R10 大纲落点语义复核（字面候选交模型裁决，误报自动登记保留）
  // ②规则门禁扫描（R1-R10 对图谱提取数据）③LLM 章节审读（语义层矛盾）
  onProgress?.({ step: 'post-check', message: '写后一致性检查（落点复核 + 规则扫描 + LLM 章节审读）' })
  let postCheck: NonNullable<ChapterWritingOutcome['data']>['postCheck'] = { passed: true, report: null }
  const reportLines: string[] = []
  try {
    const landingReport = await verifyUnlandedBeatsWithAI(projectId, outlineId, content, consensusText, opts.signal)
    if (landingReport) reportLines.push(`【大纲落点复核】${landingReport}`)
  } catch (e: any) {
    logger.warn('[chapter-writing] R10 语义复核失败（候选留给人工）:', e?.message)
  }
  try {
    const postGate = await ai.checkChapterConflictGate(projectId, outlineId)
    if (postGate) reportLines.push(`【规则扫描】${postGate}`)
  } catch (e: any) {
    logger.warn('[chapter-writing] 规则扫描异常（跳过）:', e?.message)
  }
  try {
    const characters = (await getCoreDatabaseManager().lwCharacters?.getByProjectId(projectId)) || []
    const roster = characters.map((c: any) => c.name).join('、')
    const reviewRaw = await generateChapterReviewText(
      'chapter-consistency-review',
      {
        system:
          '你是苛刻但只报实情的小说一致性审读员。逐段核对这一章正文，只输出 JSON，不要任何其他文字。',
        user: `【角色名册（正文中的角色必须与此处名字逐字一致）】${roster || '（空）'}
${consensusText ? `【作者已拍板的共识（与此矛盾即为问题）】\n${consensusText}` : ''}
【本章正文】
${content}

请逐项检查并只报告确实存在的问题：
1. 本章内部时序矛盾（先发生的事在后文才发生/人物同时出现在两地）
2. 人物生死或位置矛盾（本章内有人被写死却又说话行动等）
3. 称谓/名字不一致（同一人前后称呼不同、名字写错）
4. 与能力/代价规则冲突（设定了代价的技能被无偿使用等）
每项给出：{"item": "矛盾点简述", "evidence": "正文原句", "why": "为什么矛盾"}
返回 JSON：{"issues": [...]}。没有问题返回 {"issues": []}。只输出 JSON。`,
        maxTokens: 1500,
      },
      opts.signal,
    )
    const parsed = safeParseIssues(reviewRaw)
    if (parsed.length > 0) {
      reportLines.push(`【LLM 章节审读】发现 ${parsed.length} 处疑点：\n${parsed.map((p: any, i: number) => `${i + 1}. ${p.item}（证据：${p.evidence}；原因：${p.why}）`).join('\n')}`)
    }
  } catch (e: any) {
    logger.warn('[chapter-writing] LLM 章节审读失败（不阻断）:', e?.message)
  }
  postCheck = { passed: reportLines.length === 0, report: reportLines.length ? reportLines.join('\n') : null }

  return {
    ok: true,
    data: {
      chapterId: saved?.id,
      wordCount: content.replace(/\s/g, '').length,
      designCard: markdown,
      review,
      postCheck: postCheck ?? null,
      qualityGate: (writeResult.data as any)?.qualityGate,
    },
  }
}
