/**
 * 共识账本服务（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-ledger
 *
 * 账本是「讨论成果的轻量沉淀」：tentative（讨论中）/ confirmed（已定）/
 * rejected（已否决，同样保留——防主编重复推荐被否方案）。写入渠道：
 * 1. 静默共识提取：每轮对话成功后直调 LLM 从增量提取（fail-soft，失败跳过）；
 * 2. 用户操作：确认/否决/修改一句话/丢弃（ledger:update IPC）；
 * 3. agent 工具 lw_update_ledger（用户拍板/纠错时补记或翻转状态——机制层是
 *    本文件底部的纯函数，工具薄封装在 room-agent-tools）。
 * 注入契约（设计文档 §3）：confirmed + rejected 全量注入主编上下文，
 * rejected 标注「已否决，勿重复推荐」。
 */

import { createLogger } from '@core/utils/logger'
import type { ConsensusEntry, ConsensusKind, ConsensusStatus, LedgerOpInput, RoomEvent, RoomPhaseId } from '@shared/types/story-room.types'
import { extractJsonObject, extractJsonArray } from '@core/platform/services/longwriting/story-persist'
import { generateRoomText } from './room-llm'
import { getRoomState, mutateRoomState, patchRoomState } from './room-state'
import { nextPhase, getPhaseDef } from './room-phases'
import { emitRoomEvent } from './room-events'

const logger = createLogger('StoryRoomLedger')

/** 账本容量上限（超出时丢弃最老的 tentative/rejected，confirmed 保留） */
const LEDGER_CAP = 60
const KINDS: ConsensusKind[] = ['premise', 'character', 'plot', 'world', 'tone', 'taboo']

export function normalizeTitle(t: string): string {
  return String(t || '').replace(/[\s，。：:；;、!！?？·]/g, '').toLowerCase()
}

/** 账本 → 主编上下文段落（注入 snapshot） */
export function ledgerSnapshotText(ledger: ConsensusEntry[]): string {
  if (!ledger || ledger.length === 0) return ''
  const kindLabel: Record<ConsensusKind, string> = {
    premise: '前提', character: '人物', plot: '故事线', world: '世界', tone: '基调', taboo: '禁忌',
  }
  const lines: string[] = ['【共识账本】（研讨中已定与已否的方向——已否决项切勿重复推荐）']
  for (const status of ['confirmed', 'tentative', 'rejected'] as ConsensusStatus[]) {
    const entries = ledger.filter((e) => e.status === status)
    if (entries.length === 0) continue
    const tag = status === 'confirmed' ? '已定' : status === 'tentative' ? '讨论中' : '已否决'
    for (const e of entries) {
      const points = e.points.length > 0 ? `（${e.points.join('；')}）` : ''
      lines.push(`- [${tag}·${kindLabel[e.kind] || e.kind}] ${e.title}${points}`)
    }
  }
  return lines.join('\n')
}

// ==================== 静默共识提取 ====================

export interface SilentExtractInput {
  userText: string
  assistantText: string
  turnNo: number
  llmOpts?: { providerConfigId?: string; modelId?: string }
}

/** 门建议（阶段成熟时由提取器顺带产出） */
export interface GateSuggestion {
  toPhase: RoomPhaseId
  reason: string
}

const EXTRACT_SYSTEM = `你是创作研讨记录员。从刚结束的一轮对话增量中提取"共识条目"——故事本身的方向性结论（前提/人物/剧情/世界观层面的决定）。

硬性规则：
1. 只记故事事实，不记对话过程：禁止"用户说/主编认为/待用户拍板/尚待确认/与某条矛盾"这类元描述；条目就是设定本身的一句话（如"女主核心破案手段=审计师查账"）。
2. status 只允许两个值：tentative（新提出或讨论中）/ rejected（明确否决）。confirmed 由用户在界面上确认产生，你不要输出 confirmed。
3. rejected 条目的 points 只写"为什么被否"，不得为被否方向辩护，也不得附带"正确做法应该是"。
4. title 是不超过 30 字的一句话；points 最多 3 条、每条不超过 40 字，只放落地细节，不放论证过程。
5. 已有账本里已有的条目不要重复输出；本轮若推翻了某条已有条目，输出 {"op":"conflict","conflictWith":"被推翻条目标题"}，由系统处理，不要自行改状态。
6. 若用户明确提出内容目标（长篇小说/短剧剧本）且与当前目标不同，输出 "target":"novel" 或 "script"。仅限用户明确提出；主编的建议、设想、反问都不算。
7. 阶段门：若当前阶段素材已成熟，输出 gate 建议推进到下一阶段并给一句理由；不确定就不输出。

只输出一个 JSON 对象，无其他文字：
{"entries":[{"op":"add","kind":"premise","title":"...","points":["..."],"status":"tentative"}],"target":"script","gate":{"toPhase":"characters","reason":"概要三要素齐了"}}
没有可提取的结论且不建议推进、无目标变更就输出 {"entries":[]}。`

/**
 * 静默共识提取（每轮后调用）：从增量对话提取条目并入账本。
 * 任何失败返回 null（fail-soft——不影响对话、不抛错）。
 */
export async function silentExtractLedger(
  db: any,
  projectId: string,
  input: SilentExtractInput,
  signal?: AbortSignal,
): Promise<ConsensusEntry[] | null> {
  try {
    const state = await getRoomState(db, projectId)
    const currentPhase = state.phase
    const existingText = state.ledger.length > 0
      ? state.ledger.map((e) => `- [${e.status}] ${e.title}`).join('\n')
      : '（空）'
    const user = [
      `【现有账本】\n${existingText}`,
      `【当前内容目标】${state.contentTarget === 'script' ? '短剧剧本' : '长篇小说'}`,
      `【本轮对话】第 ${input.turnNo} 轮\n用户：${input.userText.slice(0, 2000)}\n主编：${input.assistantText.slice(0, 2000)}`,
    ].join('\n\n')

    let raw = await generateRoomText('ledger-extract', { system: EXTRACT_SYSTEM, user, maxTokens: 1200 }, input.llmOpts, signal)
    if (!raw.trim()) {
      // 偶发空输出重试一次（provider 抖动，实测 chars=0 案例）
      raw = await generateRoomText('ledger-extract-retry', { system: EXTRACT_SYSTEM, user, maxTokens: 1200 }, input.llmOpts, signal)
    }
    // 兼容两种形态：{"entries":[...],"gate":{...}}（现约定）与裸数组（容错）
    const parsed = extractJsonObject(raw)
    const ops: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.entries)
        ? parsed.entries
        : (extractJsonArray(raw) || [])
    const gate = (!Array.isArray(parsed) && parsed?.gate || null) as GateSuggestion | null
    // 内容目标变更（六扇门复盘：用户第 3 轮明说短剧，contentTarget 停在 novel 十二轮，
    // 阶段策略一直按长篇给——用户明确表达的全局目标必须落结构化状态）。
    // 只解析不落库：真正写入在下方队列内 mutator 与账本合并一步完成（对抗 review
    // P2-5：LLM 调用期间用户可能经 roomSetTarget 手动改目标，用陈旧快照比较会
    // 重复 patch 甚至回滚用户操作）——mutator 拿队列内最新状态判断
    const parsedTarget = (!Array.isArray(parsed) && (parsed?.target === 'novel' || parsed?.target === 'script'))
      ? (parsed.target as 'novel' | 'script')
      : null

    // 门建议：只朝下一阶段建议（不允许跳跃/回退），当前已是最后阶段则忽略
    if (gate?.toPhase) {
      const allowed = nextPhase(currentPhase)
      if (allowed && gate.toPhase === allowed) {
        emitRoomEvent(projectId, {
          type: 'gate:suggest',
          toPhase: allowed,
          reason: String(gate.reason || `${getPhaseDef(allowed).label}阶段素材已成熟`).slice(0, 120),
        })
      }
    }

    // 早退守卫须放行「仅目标变更」轮（{"entries":[],"target":"script"} 不是空提取）
    if ((!Array.isArray(ops) || ops.length === 0) && !parsedTarget) return null

    const seen = new Set(state.ledger.map((e) => normalizeTitle(e.title)))
    const added: ConsensusEntry[] = []
    const conflictKeys: string[] = []
    for (const op of ops) {
      // conflict op 没有 title（只有 conflictWith）——必须先于 title 空检查分流，
      // 否则提取器报告的「推翻某条共识」会被静默丢弃（实测：conflict 降级从未生效）
      if (op?.op === 'conflict') {
        conflictKeys.push(normalizeTitle(String(op?.conflictWith || '')))
        continue
      }
      const title = String(op?.title || '').trim()
      if (!title) continue
      const key = normalizeTitle(title)
      if (seen.has(key)) continue
      seen.add(key)
      added.push({
        id: `ce_${input.turnNo}_${state.ledger.length + added.length + 1}_${Date.now().toString(36).slice(-4)}`,
        kind: KINDS.includes(op?.kind) ? op.kind : 'premise',
        // 钳制：提取器只产 tentative/rejected（confirmed 是用户操作专属——六扇门复盘
        // 曾把元观察「待用户拍板」提为已定）；title/points 截断防过程叙事膨胀
        status: op?.status === 'rejected' ? 'rejected' : 'tentative',
        title: title.slice(0, 40),
        points: Array.isArray(op?.points) ? op.points.slice(0, 3).map((p: any) => String(p).slice(0, 40)) : [],
        sourceTurn: input.turnNo,
        updatedAt: Date.now(),
      })
    }
    if (added.length === 0 && !ops.some((op: any) => op?.op === 'conflict') && !parsedTarget) return null

    // 队列内 RMW（评审 P1-4）：以队列内最新账本为基线合并，消除「读在队列外」丢更新窗口
    const nextState = await mutateRoomState(db, projectId, (current) => {
      for (const ck of conflictKeys) {
        const target = current.ledger.find((e) => normalizeTitle(e.title) === ck)
        if (target && target.status === 'confirmed') target.status = 'tentative'
      }
      const seenNow = new Set(current.ledger.map((e) => normalizeTitle(e.title)))
      const freshAdded = added.filter((a) => !seenNow.has(normalizeTitle(a.title)))
      const all = [...current.ledger, ...freshAdded]
      // 目标变更与账本同事务落（比较对象是队列内最新 contentTarget）
      const contentTarget = parsedTarget && parsedTarget !== current.contentTarget ? parsedTarget : current.contentTarget
      return { ...current, ledger: compactLedger(all), contentTarget }
    })
    if (nextState.contentTarget !== state.contentTarget) {
      emitRoomEvent(projectId, { type: 'target:changed', target: nextState.contentTarget } as RoomEvent)
      logger.info(`[story-room] 内容目标切换 project=${projectId} → ${nextState.contentTarget}（turn=${input.turnNo}）`)
    }
    logger.info(`[story-room] 账本静默提取 project=${projectId} turn=${input.turnNo}`)
    return nextState.ledger
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e) || String(e)
    logger.warn(`[story-room] 账本静默提取失败（fail-soft 跳过）project=${projectId} err=${msg}`)
    return null
  }
}

/**
 * 账本容量控制（纯函数）：超限时从最老 tentative 开始丢，tentative 丢尽才丢
 * 最老 rejected（rejected 是"防重复推荐"的机制载体，尽量保留）；confirmed 不动，
 * budget 按 CAP - confirmed 夹紧（confirmed 自身不因超限被挤掉）。
 */
export function compactLedger(ledger: ConsensusEntry[], cap = LEDGER_CAP): ConsensusEntry[] {
  if (ledger.length <= cap) return ledger
  const keepConfirmed = ledger.filter((e) => e.status === 'confirmed')
  const rest = ledger.filter((e) => e.status !== 'confirmed')
  const byAge = (a: ConsensusEntry, b: ConsensusEntry) => a.sourceTurn - b.sourceTurn
  const dropOrder = [
    ...rest.filter((e) => e.status === 'tentative').sort(byAge),
    ...rest.filter((e) => e.status === 'rejected').sort(byAge),
  ]
  const budget = Math.max(0, cap - keepConfirmed.length)
  const dropSet = new Set(dropOrder.slice(0, Math.max(0, rest.length - budget)).map((e) => e.id))
  return [...keepConfirmed, ...rest.filter((e) => !dropSet.has(e.id))]
}

// ==================== 用户操作（账本状态机） ====================

export type LedgerOp = LedgerOpInput

// ==================== Agent 写账本（lw_update_ledger 的机制层） ====================
// 策略（用户拍板 2026-09-15）：账本此前只有「检索」工具，条目出错（互相矛盾的
// 钩子方案、被误标已否决的正确方案）时 agent 无任何手段修正。本组纯函数承载
// 定位/翻转/新增的通用逻辑（便于单测），队列写入与回执组装由 room-agent-tools
// 的 lw_update_ledger 薄封装。回执必须由代码生成真实数据——本地模型会幻觉成功。

/** 回执/候选用的条目摘要 */
export interface LedgerEntryBrief {
  id: string
  title: string
  status: ConsensusStatus
}

export type LedgerLocateFailure =
  | { ref: string; reason: 'not-found' }
  | { ref: string; reason: 'ambiguous'; candidates: LedgerEntryBrief[] }

export type LedgerLocateResult =
  | { entry: ConsensusEntry }
  | { reason: 'not-found' }
  | { reason: 'ambiguous'; candidates: LedgerEntryBrief[] }

function toBrief(e: ConsensusEntry): LedgerEntryBrief {
  return { id: e.id, title: e.title, status: e.status }
}

/**
 * 条目定位（纯函数，lw_update_ledger 定位规则）：先按 id 精确匹配；否则按标题
 * 归一化子串匹配（normalizeTitle 抹空白/标点+小写——模型传来的标题常带全半角/
 * 标点差异，而字符过滤对拼接可分配，原始包含必推出归一化包含，不会漏判）。
 * 命中多条不猜——返回候选列表让上层向模型澄清。
 */
export function locateLedgerEntry(ledger: ConsensusEntry[], ref: string): LedgerLocateResult {
  const key = String(ref || '').trim()
  if (!key) return { reason: 'not-found' }
  const byId = ledger.find((e) => e.id === key)
  if (byId) return { entry: byId }
  const norm = normalizeTitle(key)
  if (!norm) return { reason: 'not-found' }
  const hits = ledger.filter((e) => normalizeTitle(e.title).includes(norm))
  if (hits.length === 1) return { entry: hits[0] }
  if (hits.length > 1) return { reason: 'ambiguous', candidates: hits.map(toBrief) }
  return { reason: 'not-found' }
}

export interface LedgerSetStatusOutcome {
  /** 翻转后的全量账本（有定位失败时原样返回——原子语义） */
  ledger: ConsensusEntry[]
  /** 改后回执（代码生成，含前后状态） */
  updated: Array<LedgerEntryBrief & { from: ConsensusStatus }>
  failures: LedgerLocateFailure[]
}

/**
 * 批量状态翻转（纯函数，原子）：任一 ref 定位失败则整批不动并逐条给原因与候选；
 * 全部命中才翻转（同条目多 ref 幂等去重），updatedAt 刷新。
 */
export function setLedgerEntriesStatus(
  ledger: ConsensusEntry[],
  refs: string[],
  status: ConsensusStatus,
  now = Date.now(),
): LedgerSetStatusOutcome {
  const failures: LedgerLocateFailure[] = []
  const resolved = new Map<string, ConsensusEntry>()
  for (const ref of refs) {
    const r = locateLedgerEntry(ledger, ref)
    if ('entry' in r) {
      resolved.set(r.entry.id, r.entry)
    } else if (r.reason === 'ambiguous') {
      failures.push({ ref: String(ref), reason: 'ambiguous', candidates: r.candidates })
    } else {
      failures.push({ ref: String(ref), reason: 'not-found' })
    }
  }
  if (failures.length > 0) return { ledger, updated: [], failures }
  const updated: LedgerSetStatusOutcome['updated'] = []
  const next = ledger.map((e) => {
    if (!resolved.has(e.id)) return e
    updated.push({ id: e.id, title: e.title, status, from: e.status })
    return { ...e, status, updatedAt: now }
  })
  return { ledger: next, updated, failures: [] }
}

export interface LedgerAddInput {
  kind: ConsensusKind
  title: string
  points: string[]
  /** 缺省 confirmed（用户拍板后让 agent 补记的场景） */
  status?: ConsensusStatus
}

export type LedgerAddOutcome =
  | { ok: true; entry: ConsensusEntry; ledger: ConsensusEntry[] }
  | { ok: false; error: string; duplicateOf?: LedgerEntryBrief; ledger: ConsensusEntry[] }

/**
 * 新增条目（纯函数）：规范化对齐静默提取（title≤40、points≤3×40、kind 枚举外
 * 钳为 premise）；归一化标题查重——同题即拒（改状态走 set-status，防同题双条）。
 * id 对齐静默提取的 `ce_<轮>_<序>_<时间尾>` 风格。
 */
export function addLedgerEntry(
  ledger: ConsensusEntry[],
  input: LedgerAddInput,
  turnNo: number,
  now = Date.now(),
): LedgerAddOutcome {
  const title = String(input.title || '').trim()
  if (!title) return { ok: false, error: 'title 不能为空', ledger }
  const norm = normalizeTitle(title)
  const dup = norm ? ledger.find((e) => normalizeTitle(e.title) === norm) : undefined
  if (dup) {
    return {
      ok: false,
      error: `账本已有同题条目「${dup.title}」（id=${dup.id}，status=${dup.status}）——改状态用 set-status`,
      duplicateOf: toBrief(dup),
      ledger,
    }
  }
  // id 唯一化：容量满时 compact 使 ledger.length 回弹、同轮内 now 尾片恒定，
  // 连续 add 会撞出重复 id（忘川渡实跑：ce_60_61_rb3y ×5）——按现有 id 去重递增
  const existingIds = new Set(ledger.map((e) => e.id))
  let seq = ledger.length + 1
  let id = `ce_${turnNo}_${seq}_${now.toString(36).slice(-4)}`
  while (existingIds.has(id)) {
    seq += 1
    id = `ce_${turnNo}_${seq}_${now.toString(36).slice(-4)}${seq.toString(36).slice(-2)}`
  }
  const entry: ConsensusEntry = {
    id,
    kind: KINDS.includes(input.kind) ? input.kind : 'premise',
    status: input.status ?? 'confirmed',
    title: title.slice(0, 40),
    points: Array.isArray(input.points) ? input.points.slice(0, 3).map((p) => String(p).slice(0, 40)) : [],
    sourceTurn: turnNo,
    updatedAt: now,
  }
  return { ok: true, entry, ledger: [...ledger, entry] }
}

/** 全账本状态计数（回执用：confirmed/tentative/rejected 各多少） */
export function ledgerStatusCounts(ledger: ConsensusEntry[]): { confirmed: number; tentative: number; rejected: number } {
  const counts = { confirmed: 0, tentative: 0, rejected: 0 }
  for (const e of ledger) {
    if (e.status in counts) counts[e.status] += 1
  }
  return counts
}

/** 用户操作账本条目：确认 / 否决 / 修改一句话 / 丢弃。返回更新后的账本。 */
export async function applyLedgerOp(
  db: any,
  projectId: string,
  op: LedgerOp,
): Promise<ConsensusEntry[]> {
  const state = await getRoomState(db, projectId)
  const idx = state.ledger.findIndex((e) => e.id === op.entryId)
  if (idx === -1) throw new Error(`账本条目不存在：${op.entryId}`)
  const ledger = [...state.ledger]
  const entry = { ...ledger[idx], updatedAt: Date.now() }

  switch (op.action) {
    case 'confirm': entry.status = 'confirmed'; break
    case 'reject': entry.status = 'rejected'; break
    case 'discard':
      ledger.splice(idx, 1)
      await patchRoomState(db, projectId, { ledger })
      return ledger
    case 'revise':
      if (op.title?.trim()) entry.title = op.title.trim().slice(0, 40)
      if (Array.isArray(op.points)) entry.points = op.points.slice(0, 3).map((p) => String(p).slice(0, 40))
      break
  }
  ledger[idx] = entry
  await patchRoomState(db, projectId, { ledger })
  return ledger
}
