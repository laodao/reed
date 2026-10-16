/**
 * 研讨室回合「完成宣称」审计（§2 防编造，2026-09-20）
 * @module core/packs/longwriting/story-room/turn-audit
 *
 * 背景（实测）：主编在零工具调用的情况下编造「正文已保存（2454 字）+ 两段检查结论」。
 * 本模块提供确定性审计：回复文本命中完成宣称模式、而本轮写工具执行记录为空 → 判违规。
 * 处置由 room-session 执行：先自动纠问一轮（允许「历史事实」诚实声明），仍违规再挂系统尾注。
 * 写工具判定优先 def.dangerLevel === 'write'（未来新增写工具自动纳入），名单仅兜底。
 */

/** 完成宣称模式（中文语料实测：已保存/已完成/已生成 为编造高频词） */
export const COMPLETION_CLAIM_RE = /(已保存|已完成|已生成|已落库|保存成功|已入库|写完了?)/

/** 硬编码兜底写工具名单（正常路径以 def.dangerLevel === 'write' 判定） */
export const FALLBACK_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'lw_write_chapter_full',
  'lw_write_chapter',
  'lw_patch_chapter',
  'lw_save_card',
  'lw_save_event',
  'lw_save_relation',
  'lw_save_design_doc',
  'lw_confirm_chapter_card',
  'lw_update_ledger',
])

/** 自动纠问质询文案：明确允许两种诚实回答，堵死「无凭据坚持完成表述」 */
export const AUDIT_CHALLENGE = [
  '【系统审计】你上面的回复出现了「已完成/已保存」类表述，但本轮系统没有记录到任何写工具调用。',
  '请二选一如实回答：',
  '① 给出本轮工具回执的关键凭据（如章法 run id / 章节 id）；',
  '② 明确声明所引为历史事实、本轮无新增写入。',
  '禁止在无凭据的情况下坚持完成表述。',
].join('\n')

/** 纠问后仍违规时追加的系统尾注 */
export const AUDIT_NOTE = '\n\n> ⚠️ 系统校验：本回复宣称完成但本轮无任何写工具调用记录，内容不可信，请人工核实。'

export interface AuditInput {
  /** 本轮主编回复全文 */
  content: string
  /** 本轮实际执行的写工具名（dangerLevel==='write' 或命中兜底名单） */
  writeToolsUsed: string[]
}

export interface AuditVerdict {
  violation: boolean
  /** 命中的宣称词（去重保序） */
  claims: string[]
}

/** 回合完成宣称审计（纯函数） */
export function auditCompletionClaims(input: AuditInput): AuditVerdict {
  const claims: string[] = []
  for (const m of String(input.content || '').matchAll(new RegExp(COMPLETION_CLAIM_RE.source, 'g'))) {
    if (!claims.includes(m[0])) claims.push(m[0])
  }
  return { violation: claims.length > 0 && input.writeToolsUsed.length === 0, claims }
}

/**
 * 纠问回复是否仍在无凭据宣称。诚实出口两条：
 * ① 声明历史事实/无新增写入；② 给出工具回执凭据（章法 run id / 章节 id / 版本 id）。
 */
export function stillClaimingAfterChallenge(reply: string): boolean {
  const text = String(reply || '')
  if (!COMPLETION_CLAIM_RE.test(text)) return false
  if (/(历史事实|无新增写入)/.test(text)) return false
  if (/(wfrun_[A-Za-z0-9_]+|chapter_[A-Za-z0-9_]+|ver_[A-Za-z0-9_]+)/.test(text)) return false
  return true
}
