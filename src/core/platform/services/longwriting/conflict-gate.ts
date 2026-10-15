/**
 * 逐章一致性门禁（52 号流程闭环）
 * @module core/platform/services/longwriting/conflict-gate
 *
 * 用户拍板的固定流程：每章写完（保存+提取）即执行一致性检查，未解决的疑点
 * 阻止下一章生成——批量事后检查时问题相互纠缠，修复难度随章节数平方增长。
 *
 * 三种解除方式（均登记后不再拦截）：
 * 1. AI 解题执行受控动作（自动登记）；
 * 2. 作者人工修改后重扫消失；
 * 3. 作者「知情保留」（显式确认，如续篇钩子类伏笔）。
 *
 * 纯函数 + 薄封装，便于单测。
 */

import { mutateWizardState } from './wizard-state-rmw'

export interface ConflictLike {
  rule?: string
  message?: string
  entityName?: string
  entityId?: string
  chapterNumber?: number
  /** R10 专用锚点：大纲承诺拍原文（保留/撤销按拍内容相似度匹配，文案改写不失效） */
  beatText?: string
  /** §3c 写前门禁豁免：false=仅提醒不阻断（R8 超期）；未标记=维持现状拦截 */
  blocking?: boolean
}

/** 稳定 key：规则 + 实体 + 章节号 + 消息短哈希（重扫消息尾部变化不漂移） */
export function conflictKey(c: ConflictLike): string {
  const msg = String(c.message || '')
  let h = 0
  for (let i = 0; i < msg.length; i++) h = (h * 31 + msg.charCodeAt(i)) | 0
  const hash = (h >>> 0).toString(36).slice(0, 8)
  return [c.rule || '', c.entityName || c.entityId || '', c.chapterNumber ?? '', hash].join('|')
}

/** 从疑点里抠出引用的全部章节号（item 字段优先，消息文本兜底） */
export function conflictChapters(c: ConflictLike): number[] {
  const out = new Set<number>()
  if (Number.isFinite(c.chapterNumber)) out.add(Number(c.chapterNumber))
  for (const m of String(c.message || '').matchAll(/第\s*(\d+)\s*章/g)) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) out.add(n)
  }
  return [...out]
}

/**
 * 过滤出会阻断第 N 章生成的疑点：
 * - 扫描器显式标记 blocking===false 的（R8 超期等节奏提醒）不拦——§3c 降级；
 * - 作者已登记（解决/知情保留）的不拦；
 * - 只引用未来章节（> N）的疑点不拦——那是后续章节要处理的；
 * - 其余（含本章与已写章节的）全部拦截。
 * 第三个参数兼容两种形态：裸 key 集合（仅精确匹配）或完整保留记录
 * （R10 走节拍相似度顺延，见 isAcknowledgedConflict）。
 */
export function filterBlockingConflicts<T extends ConflictLike>(
  conflicts: T[],
  uptoChapter: number,
  acknowledged: Set<string> | ResolutionRow[],
): T[] {
  const rows: ResolutionRow[] = acknowledged instanceof Set ? [...acknowledged].map((key) => ({ key })) : acknowledged
  return conflicts.filter((c) => {
    if (c.blocking === false) return false
    if (isAcknowledgedConflict(c, rows)) return false
    const chs = conflictChapters(c)
    if (chs.length === 0) return true
    return chs.some((n) => n <= uptoChapter)
  })
}

/**
 * RV 审读疑点的展示文案（天下捕快实跑修复）：登记侧（chapter-writing-executor）
 * 与扫描侧（ConsistencyService.scanStoredReviewConflicts）必须用同一函数生成
 * message——conflictKey 对 message 做哈希，两侧不同源则"知情保留/AI 解题"永远
 * 对不上号，闭环断裂。
 */
export function formatReviewConflictMessage(e: {
  message?: string
  evidence?: string
  why?: string
  chapterNumber?: number
}): string {
  return `写后审读疑点（第 ${e.chapterNumber ?? '?'} 章）：${e.message ?? ''}${
    e.evidence ? `｜证据：${String(e.evidence).slice(0, 60)}` : ''
  }${e.why ? `｜原因：${String(e.why).slice(0, 60)}` : ''}`
}

/** 门禁报错文案：列出疑点 + 解除指引 */
export function buildConflictGateError(chapterNumber: number, blocking: ConflictLike[]): string | null {  if (blocking.length === 0) return null
  const list = blocking
    .slice(0, 5)
    .map((c) => `· [${c.rule || '?'}] ${String(c.message || '').slice(0, 60)}`)
    .join('\n')
  const more = blocking.length > 5 ? `\n…等共 ${blocking.length} 处` : ''
  return `无法生成第 ${chapterNumber} 章正文：存在 ${blocking.length} 处未处理的一致性疑点：\n${list}${more}\n\n请在研讨室「写作」面板用「AI 解题」处理，或对确要保留的疑点点「知情保留」，之后即可继续生成。`
}

// ==================== 已处理登记（存 wizard_state.conflictResolutions） ====================

interface ResolutionRow {
  key: string
  rule?: string
  status: 'resolved' | 'kept'
  note?: string
  at: number
  /** 锚点：登记时的章节号（R10 相似度顺延时校验同章） */
  chapterNumber?: number
  /** 锚点：R10 大纲承诺拍原文——大纲改写后按相似度续用，替代易漂移的消息哈希 */
  beatText?: string
}

/** R10 节拍相似度达到该值视为"同一承诺改写"（保留顺延）；低于则视为新承诺（重新拦截） */
export const R10_BEAT_SIMILARITY_THRESHOLD = 0.6

/** 归一化：去标点/空白/引号，只留文字与数字——大纲微调标点不影响相似度 */
export function normalizeBeatText(text: string): string {
  return String(text || '').replace(/[\s\p{P}\p{S}「」『』“”‘’"']/gu, '')
}

/**
 * 节拍相似度：归一化后字符 bigram 的非对称重叠系数（|A∩B| / min(|A|,|B|)）。
 * 选非对称而非 Jaccard：大纲修订的常见形态是"同一拍补细节变长"（逐户核对→
 * 夜访临安城逐户核对），分子不变分母取短边才能续用；Jaccard 会被拉长稀释。
 */
export function beatSimilarity(a: string, b: string): number {
  const na = normalizeBeatText(a)
  const nb = normalizeBeatText(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const ba = bigrams(na)
  const bb = bigrams(nb)
  let inter = 0
  for (const g of ba) if (bb.has(g)) inter++
  const min = Math.min(ba.size, bb.size)
  return min === 0 ? 0 : inter / min
}

/**
 * 疑点是否已登记（解决/知情保留）：
 * 1. 精确 key 命中（所有规则）；
 * 2. R10 锚点顺延：登记时的节拍原文与当前节拍相似度达阈值且同章——
 *    大纲按共识改写后旧保留不失效，换了承诺才重新拦截。
 */
export function isAcknowledgedConflict(conflict: ConflictLike, rows: ResolutionRow[]): boolean {
  return matchResolution(conflict, rows) !== null
}

/** 命中的保留记录（无则 null）——标注时顺带带回 note/at 供展示 */
export function matchResolution(conflict: ConflictLike, rows: ResolutionRow[]): ResolutionRow | null {
  const key = conflictKey(conflict)
  for (const r of rows) {
    if (r.key === key) return r
  }
  if (conflict.rule === 'R10' && conflict.beatText) {
    for (const r of rows) {
      if (r.rule !== 'R10' || !r.beatText) continue
      if (
        Number.isFinite(conflict.chapterNumber) &&
        Number.isFinite(r.chapterNumber) &&
        conflict.chapterNumber !== r.chapterNumber
      ) continue
      if (beatSimilarity(r.beatText, conflict.beatText) >= R10_BEAT_SIMILARITY_THRESHOLD) return r
    }
  }
  return null
}

/**
 * 扫描结果标注处理状态（handler 层一次扫描同时供待处理/已保留两个视图）。
 * 0916 review（conflictKey 契约）：每个条目回填 key=conflictKey(c)——此前 key 只在
 * 登记侧使用、全链路无合法生产者，agent/前端拿不到合法 key，lw_patch_chapter 的
 * conflictKey 参数只能靠编造。回填后前端修正消息与工具回执都可原样携带。
 */
export function annotateConflicts<T extends ConflictLike>(
  conflicts: T[],
  rows: ResolutionRow[],
): Array<T & { status: 'pending' | 'kept'; note?: string; keptAt?: number; key: string }> {
  return conflicts.map((c) => {
    const row = matchResolution(c, rows)
    return row
      ? { ...c, key: conflictKey(c), status: 'kept' as const, note: row.note, keptAt: row.at }
      : { ...c, key: conflictKey(c), status: 'pending' as const }
  })
}

export async function listResolutions(db: any, projectId: string): Promise<ResolutionRow[]> {
  try {
    const project = await db?.lwProjects?.getById(projectId)
    const ws = (project?.wizardState || {}) as Record<string, any>
    const rows: ResolutionRow[] = Array.isArray(ws.conflictResolutions) ? ws.conflictResolutions : []
    return rows
  } catch {
    return []
  }
}

export async function listAcknowledgedKeys(db: any, projectId: string): Promise<Set<string>> {
  const rows = await listResolutions(db, projectId)
  return new Set(rows.map((r) => r.key))
}

export async function acknowledgeConflict(
  db: any,
  projectId: string,
  conflict: ConflictLike,
  status: 'resolved' | 'kept' = 'kept',
  note?: string,
): Promise<void> {
  // 复核修复：wizardState 的读-改-写必须走共享 per-project 串行队列——
  // 旧实现在队列外裸 RMW，与研讨室轮次写（turnNo/账本/设计包）并发会丢更新
  await mutateWizardState<void>(db, projectId, (wizard) => {
    const ws = (wizard || {}) as Record<string, any>
    const rows: ResolutionRow[] = Array.isArray(ws.conflictResolutions) ? ws.conflictResolutions : []
    const key = conflictKey(conflict)
    if (!rows.some((r) => r.key === key)) {
      rows.push({
        key,
        rule: conflict.rule,
        status,
        note,
        at: Date.now(),
        chapterNumber: Number.isFinite(conflict.chapterNumber) ? conflict.chapterNumber : undefined,
        beatText: conflict.beatText ? String(conflict.beatText).slice(0, 120) : undefined,
      })
    }
    return {
      next: { ...(wizard || {}), conflictResolutions: rows } as WizardStateFullLike,
      result: undefined,
    }
  })
}

/** 按 key 直接登记（lw_patch_chapter 修正成功后消除关联疑点）——已存在返回 false */
export async function acknowledgeConflictByKey(
  db: any,
  projectId: string,
  key: string,
  status: 'resolved' | 'kept' = 'resolved',
  note?: string,
): Promise<boolean> {
  let added = false
  await mutateWizardState<void>(db, projectId, (wizard) => {
    const ws = (wizard || {}) as Record<string, any>
    const rows: ResolutionRow[] = Array.isArray(ws.conflictResolutions) ? ws.conflictResolutions : []
    if (!rows.some((r) => r.key === key)) {
      rows.push({ key, status, note, at: Date.now() })
      added = true
    }
    return {
      next: { ...(wizard || {}), conflictResolutions: rows } as WizardStateFullLike,
      result: undefined,
    }
  })
  return added
}

/** 撤销保留：精确 key 命中，或 R10 同章相似拍——撤销也要按锚点语义撤销 */
export async function unacknowledgeConflict(db: any, projectId: string, conflict: ConflictLike): Promise<number> {
  let removed = 0
  await mutateWizardState<void>(db, projectId, (wizard) => {
    const ws = (wizard || {}) as Record<string, any>
    const rows: ResolutionRow[] = Array.isArray(ws.conflictResolutions) ? ws.conflictResolutions : []
    const key = conflictKey(conflict)
    const kept = rows.filter((r) => {
      const hit =
        r.key === key ||
        (conflict.rule === 'R10' &&
          r.rule === 'R10' &&
          !!r.beatText &&
          !!conflict.beatText &&
          (!Number.isFinite(conflict.chapterNumber) ||
            !Number.isFinite(r.chapterNumber) ||
            conflict.chapterNumber === r.chapterNumber) &&
          beatSimilarity(r.beatText!, conflict.beatText!) >= R10_BEAT_SIMILARITY_THRESHOLD)
      if (hit) removed++
      return !hit
    })
    return {
      next: { ...(wizard || {}), conflictResolutions: kept } as WizardStateFullLike,
      result: undefined,
    }
  })
  return removed
}

/** 与 @shared/types/longwriting WizardStateFull 同构（此处仅类型引用，避免额外依赖） */
type WizardStateFullLike = Record<string, unknown>
