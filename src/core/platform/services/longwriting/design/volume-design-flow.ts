/**
 * 卷设计流编排（2026-09-16 结构化设定方案 M1-W2，设计文档 §5.3 D2-D8）
 *
 * 确定性多 pass 编排：gather（程序装配）→ 骨架 → 人物层 → 网格分批(loop) →
 * 整合，每个 pass 输出完整卷设计文档并过 L0 校验，失败进修复回路（≤N 轮）。
 * LLM 以函数注入（生产=LongwritingAiService，测试=假实现）——本模块保持
 * 纯逻辑可单测；流程由 volume-design 工作流节点托管（引擎管调度/互斥/审计）。
 */

import { createLogger } from '@core/utils/logger'
import {
  validateVolumeDesign,
  formatIssues,
  type DesignIssue,
  type SpineDoc,
  type VolumeDesignDoc,
} from '@shared/contracts/longwriting-design'
import {
  buildSkeletonSystemPrompt,
  buildCastSystemPrompt,
  buildGridBatchSystemPrompt,
  buildIntegrateSystemPrompt,
  buildRepairSystemPrompt,
  buildSkeletonUserPrompt,
  buildCastUserPrompt,
  buildGridBatchUserPrompt,
  buildIntegrateUserPrompt,
  buildRepairUserPrompt,
  type VolumeDesignPromptContext,
} from './volume-design-prompts'

const logger = createLogger('VolumeDesignFlow')

export type VolumeDesignLlm = (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>

export interface VolumeDesignFlowOptions {
  volumeId: string
  title?: string
  focus?: string
  /** 章界：缺省从已确认 spine 的卷声明解析；两处都没有则失败 */
  chapterFrom?: number
  chapterTo?: number
  gridBatchSize?: number
  maxRepairRounds?: number
  maxTokens?: number
  llm: VolumeDesignLlm
  onProgress?: (p: { pass: string; message: string }) => void
}

export interface VolumeDesignFlowResult {
  ok: boolean
  doc?: VolumeDesignDoc
  errors?: DesignIssue[]
  /** 执行轨迹（pass 名 + 每次修复），审计与测试断言用 */
  passes: string[]
  repairs: number
  message: string
}

// ---------- gather：程序侧输入装配（D2） ----------

export interface GatheredContext {
  spine?: SpineDoc
  spineSummary?: string
  ledgerText?: string
  openForeshadowsText?: string
  entityRosterText?: string
  chapterFrom: number
  chapterTo: number
  volumeTitle?: string
  volumeFocus?: string
}

export async function gatherVolumeDesignContext(
  db: Record<string, any> | null | undefined,
  projectId: string,
  opts: Pick<VolumeDesignFlowOptions, 'volumeId' | 'title' | 'focus' | 'chapterFrom' | 'chapterTo'>,
): Promise<GatheredContext> {
  // spine：最近一份已确认总纲——卷标题/焦点/章界的权威来源
  let spine: SpineDoc | undefined
  try {
    const spineRow = await db?.lwDesignDocuments?.getLatest(projectId, 'spine')
    if (spineRow && spineRow.status === 'confirmed') spine = spineRow.doc as SpineDoc
  } catch (e: any) {
    logger.warn(`[volume-design] spine 读取失败（忽略，按参数兜底）: ${e?.message}`)
  }
  const spineVol = spine?.volumes.find(v => v.id === opts.volumeId)
  const chapterFrom = opts.chapterFrom ?? spineVol?.chapter_range.from
  const chapterTo = opts.chapterTo ?? spineVol?.chapter_range.to
  if (!chapterFrom || !chapterTo || chapterFrom > chapterTo) {
    throw new Error(`卷 ${opts.volumeId} 章界未知：请传 chapterFrom/chapterTo 或先确认含该卷声明的 spine`)
  }

  // 共识账本 confirmed（可缺：读 wizard_state 失败不阻塞流程）
  let ledgerText: string | undefined
  try {
    const { getRoomState } = await import('@core/packs/longwriting/story-room/room-state')
    const { ledgerSnapshotText } = await import('@core/packs/longwriting/story-room/room-ledger')
    const room = await getRoomState(db, projectId)
    const entries = (room?.ledger ?? []).filter(e => e.status === 'confirmed')
    if (entries.length > 0) ledgerText = ledgerSnapshotText(entries)
  } catch {
    /* 非研讨室路径无房间状态——正常 */
  }

  // 开放伏笔账（未回收，W2 要求逐条表态）
  let openForeshadowsText: string | undefined
  try {
    const fbs = (await db?.lwForeshadows?.getByProjectId(projectId)) || []
    const open = fbs.filter((f: any) => f.status === 'open')
    if (open.length > 0) {
      openForeshadowsText = open
        .map((f: any) => `- ${f.content}（埋于第 ${f.plantedChapter ?? '?'} 章${f.payoffChapter ? `，计划第 ${f.payoffChapter} 章回收` : '，未定回收章'}）`)
        .join('\n')
    }
  } catch {
    /* 无伏笔仓储——跳过 */
  }

  // 既有实体名册（引用沿用原名原 ID）
  let entityRosterText: string | undefined
  try {
    const lines: string[] = []
    for (const [key, repo] of [
      ['人物', 'lwCharacters'],
      ['地点', 'lwLocations'],
      ['物品', 'lwItems'],
      ['势力', 'lwFactions'],
    ] as const) {
      const rows = (await db?.[repo]?.getByProjectId(projectId)) || []
      if (rows.length > 0) lines.push(`${key}：${rows.slice(0, 80).map((r: any) => r.name).join('、')}`)
    }
    if (lines.length > 0) entityRosterText = lines.join('\n')
  } catch {
    /* 名册缺失——跳过 */
  }

  const spineSummary = spine
    ? `核心：${spine.core.premise}｜主题：${spine.core.theme}｜结局：${spine.core.ending}\n主线：${spine.main_lines.map(l => `${l.title}（${l.stages.join('→')}）`).join('；')}\n核心人物：${spine.core_cast.join('、')}`
    : undefined

  return {
    spine,
    spineSummary,
    ledgerText,
    openForeshadowsText,
    entityRosterText,
    chapterFrom,
    chapterTo,
    volumeTitle: opts.title ?? spineVol?.title,
    volumeFocus: opts.focus ?? spineVol?.focus,
  }
}

// ---------- 容错 JSON 提取 ----------

export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  if (start < 0) throw new Error('输出中未找到 JSON 对象')
  // 从末尾找与之配对的 '}'（容忍模型尾部赘述）
  const end = cleaned.lastIndexOf('}')
  if (end <= start) throw new Error('输出中未找到完整 JSON 对象')
  return JSON.parse(cleaned.slice(start, end + 1))
}

// ---------- 流程主体 ----------

const MAX_GRID_BATCH = 10

export async function runVolumeDesignFlow(
  db: Record<string, any> | null | undefined,
  projectId: string,
  opts: VolumeDesignFlowOptions,
): Promise<VolumeDesignFlowResult> {
  const ctxBase = await gatherVolumeDesignContext(db, projectId, opts)
  const promptCtx: VolumeDesignPromptContext = {
    volumeId: opts.volumeId,
    volumeTitle: ctxBase.volumeTitle,
    volumeFocus: ctxBase.volumeFocus,
    chapterFrom: ctxBase.chapterFrom,
    chapterTo: ctxBase.chapterTo,
    spineSummary: ctxBase.spineSummary,
    ledgerText: ctxBase.ledgerText,
    openForeshadowsText: ctxBase.openForeshadowsText,
    entityRosterText: ctxBase.entityRosterText,
  }
  const maxTokens = opts.maxTokens ?? 8192
  const maxRepair = opts.maxRepairRounds ?? 2
  const passes: string[] = []
  let repairs = 0

  /** 执行单个 pass：生成 → 解析 → 校验 → 修复回路；修复耗尽抛错（含错误清单） */
  async function runPass(passName: string, systemPrompt: string, userPrompt: string): Promise<VolumeDesignDoc> {
    opts.onProgress?.({ pass: passName, message: `${passName} 生成中` })
    const raw = await opts.llm(systemPrompt, userPrompt, maxTokens)
    let doc = extractJsonObject(raw) as VolumeDesignDoc
    passes.push(passName)

    let issues = validateVolumeDesign(doc, ctxBase.spine).errors
    let round = 0
    while (issues.length > 0 && round < maxRepair) {
      round += 1
      repairs += 1
      opts.onProgress?.({ pass: passName, message: `${passName} 校验未过（${issues.length} 项），修复第 ${round} 轮` })
      const fixed = await opts.llm(buildRepairSystemPrompt(), buildRepairUserPrompt(doc, formatIssues(issues)), maxTokens)
      doc = extractJsonObject(fixed) as VolumeDesignDoc
      passes.push(`${passName}:repair${round}`)
      issues = validateVolumeDesign(doc, ctxBase.spine).errors
    }
    if (issues.length > 0) {
      throw new VolumeDesignValidationError(`${passName} 修复 ${maxRepair} 轮后仍有 ${issues.length} 项校验错误`, issues)
    }
    return doc
  }

  try {
    // pass 1：卷骨架
    let doc = await runPass(
      '骨架',
      buildSkeletonSystemPrompt(),
      buildSkeletonUserPrompt(promptCtx),
    )

    // pass 2：人物与实体层
    doc = await runPass('人物层', buildCastSystemPrompt(), buildCastUserPrompt(promptCtx, doc))

    // pass 3：网格分批（loop 语义——每批只细化一个章区间，系统性防输出超预算）
    const batchSize = Math.min(opts.gridBatchSize ?? MAX_GRID_BATCH, MAX_GRID_BATCH)
    for (let from = ctxBase.chapterFrom; from <= ctxBase.chapterTo; from += batchSize) {
      const to = Math.min(from + batchSize - 1, ctxBase.chapterTo)
      doc = await runPass(
        `网格${from}-${to}`,
        buildGridBatchSystemPrompt(from, to),
        buildGridBatchUserPrompt(promptCtx, doc, from, to),
      )
    }

    // pass 4：整合修订
    doc = await runPass('整合', buildIntegrateSystemPrompt(), buildIntegrateUserPrompt(promptCtx, doc))

    return {
      ok: true,
      doc,
      passes,
      repairs,
      message: `卷 ${opts.volumeId} 设计生成完成（${passes.length} 次调用，含 ${repairs} 轮修复）`,
    }
  } catch (e: any) {
    if (e instanceof VolumeDesignValidationError) {
      return { ok: false, errors: e.issues, passes, repairs, message: e.message }
    }
    logger.error(`[volume-design] 流程失败 project=${projectId} volume=${opts.volumeId}:`, e)
    return { ok: false, passes, repairs, message: e?.message || '卷设计流程异常' }
  }
}

export class VolumeDesignValidationError extends Error {
  constructor(message: string, readonly issues: DesignIssue[]) {
    super(message)
  }
}
