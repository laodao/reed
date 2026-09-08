/**
 * 共识账本服务（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-ledger
 *
 * 账本是「讨论成果的轻量沉淀」：tentative（讨论中）/ confirmed（已定）/
 * rejected（已否决，同样保留——防主编重复推荐被否方案）。写入渠道：
 * 1. 静默共识提取：每轮对话成功后直调 LLM 从增量提取（fail-soft，失败跳过）；
 * 2. 用户操作：确认/否决/修改一句话/丢弃（ledger:update IPC）。
 * 注入契约（设计文档 §3）：confirmed + rejected 全量注入主编上下文，
 * rejected 标注「已否决，勿重复推荐」。
 */

import { createLogger } from '@core/utils/logger'
import type { ConsensusEntry, ConsensusKind, ConsensusStatus, LedgerOpInput, RoomPhaseId } from '@shared/types/story-room.types'
import { extractJsonObject, extractJsonArray } from '@core/platform/services/longwriting/story-persist'
import { generateRoomText } from './room-llm'
import { getRoomState, patchRoomState } from './room-state'
import { nextPhase, getPhaseDef } from './room-phases'
import { emitRoomEvent } from './room-events'

const logger = createLogger('StoryRoomLedger')

/** 账本容量上限（超出时丢弃最老的 tentative/rejected，confirmed 保留） */
const LEDGER_CAP = 60
const KINDS: ConsensusKind[] = ['premise', 'character', 'plot', 'world', 'tone', 'taboo']
const STATUSES: ConsensusStatus[] = ['tentative', 'confirmed', 'rejected']

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

const EXTRACT_SYSTEM = `你是创作研讨记录员。从刚结束的一轮对话增量中提取"共识条目"——讨论中双方明确达成、明确否决、或新提出待定的方向性结论。

只提取方向级结论（如"主角动机=洗冤复仇"），不记录寒暄、不确定的随口设想、纯事实问答。
每条输出：kind（premise/character/plot/world/tone/taboo 之一）、title（一句话短句）、
points（支撑细节，最多 3 条）、status（tentative=新提出待确认 / confirmed=双方明确同意 / rejected=明确否决）。
已有账本里已有的条目不要重复输出；若本轮与某条已定共识矛盾，输出一条 op=conflict 的条目（title 指出矛盾）。

另外，判断当前阶段素材是否成熟（阶段门，设计文档 §6）：若当前阶段的门条件已满足，
输出 gate 字段建议推进到下一阶段并给一句理由；不确定就不输出 gate。

只输出一个 JSON 对象，无其他文字：
{"entries":[{"op":"add","kind":"premise","title":"...","points":["..."],"status":"tentative"}],"gate":{"toPhase":"characters","reason":"概要三要素齐了"}}
没有可提取的结论且不建议推进就输出 {"entries":[]}。`

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
      `【本轮对话】第 ${input.turnNo} 轮\n用户：${input.userText.slice(0, 2000)}\n主编：${input.assistantText.slice(0, 2000)}`,
    ].join('\n\n')

    const raw = await generateRoomText('ledger-extract', { system: EXTRACT_SYSTEM, user, maxTokens: 1200 }, input.llmOpts, signal)
    // 兼容两种形态：{"entries":[...],"gate":{...}}（现约定）与裸数组（容错）
    const parsed = extractJsonObject(raw)
    const ops: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.entries)
        ? parsed.entries
        : (extractJsonArray(raw) || [])
    const gate = (!Array.isArray(parsed) && parsed?.gate || null) as GateSuggestion | null

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

    if (!Array.isArray(ops) || ops.length === 0) return null

    const seen = new Set(state.ledger.map((e) => normalizeTitle(e.title)))
    const added: ConsensusEntry[] = []
    for (const op of ops) {
      const title = String(op?.title || '').trim()
      if (!title) continue
      const key = normalizeTitle(title)
      // op=conflict：与既有共识矛盾 → 原条目转 tentative（重开讨论），并记新条目
      if (op?.op === 'conflict') {
        const conflictKey = normalizeTitle(String(op?.conflictWith || ''))
        const target = state.ledger.find((e) => normalizeTitle(e.title) === conflictKey)
        if (target && target.status === 'confirmed') target.status = 'tentative'
      }
      if (seen.has(key)) continue
      seen.add(key)
      added.push({
        id: `ce_${input.turnNo}_${state.ledger.length + added.length + 1}_${Date.now().toString(36).slice(-4)}`,
        kind: KINDS.includes(op?.kind) ? op.kind : 'premise',
        title,
        points: Array.isArray(op?.points) ? op.points.slice(0, 3).map((p: any) => String(p).slice(0, 60)) : [],
        status: STATUSES.includes(op?.status) ? op.status : 'tentative',
        sourceTurn: input.turnNo,
        updatedAt: Date.now(),
      })
    }
    if (added.length === 0 && !ops.some((op: any) => op?.op === 'conflict')) return null

    let ledger = [...state.ledger, ...added]
    // 容量控制：超限时先丢最老 tentative，再丢最老 rejected，confirmed 不动
    if (ledger.length > LEDGER_CAP) {
      const keepConfirmed = ledger.filter((e) => e.status === 'confirmed')
      const rest = ledger.filter((e) => e.status !== 'confirmed')
      const byAge = (a: ConsensusEntry, b: ConsensusEntry) => a.sourceTurn - b.sourceTurn
      const tentatives = rest.filter((e) => e.status === 'tentative').sort(byAge)
      const rejecteds = rest.filter((e) => e.status === 'rejected').sort(byAge)
      const budget = LEDGER_CAP - keepConfirmed.length
      const keptRest = [...rejecteds, ...tentatives].slice(Math.max(0, rest.length - budget))
      ledger = [...keepConfirmed, ...keptRest]
    }

    await patchRoomState(db, projectId, { ledger })
    logger.info(`[story-room] 账本静默提取 +${added.length} project=${projectId} turn=${input.turnNo}`)
    return ledger
  } catch (e) {
    logger.warn(`[story-room] 账本静默提取失败（fail-soft 跳过）project=${projectId}`, e)
    return null
  }
}

// ==================== 用户操作（账本状态机） ====================

export type LedgerOp = LedgerOpInput

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
      if (op.title?.trim()) entry.title = op.title.trim()
      if (Array.isArray(op.points)) entry.points = op.points.slice(0, 3).map((p) => String(p).slice(0, 60))
      break
  }
  ledger[idx] = entry
  await patchRoomState(db, projectId, { ledger })
  return ledger
}
