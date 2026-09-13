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

export interface ConflictLike {
  rule?: string
  message?: string
  entityName?: string
  entityId?: string
  chapterNumber?: number
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
 * - 作者已登记（解决/知情保留）的不拦；
 * - 只引用未来章节（> N）的疑点不拦——那是后续章节要处理的；
 * - 其余（含本章与已写章节的）全部拦截。
 */
export function filterBlockingConflicts<T extends ConflictLike>(
  conflicts: T[],
  uptoChapter: number,
  acknowledgedKeys: Set<string>,
): T[] {
  return conflicts.filter((c) => {
    if (acknowledgedKeys.has(conflictKey(c))) return false
    const chs = conflictChapters(c)
    if (chs.length === 0) return true
    return chs.some((n) => n <= uptoChapter)
  })
}

/** 门禁报错文案：列出疑点 + 解除指引 */
export function buildConflictGateError(chapterNumber: number, blocking: ConflictLike[]): string | null {
  if (blocking.length === 0) return null
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
}

export async function listAcknowledgedKeys(db: any, projectId: string): Promise<Set<string>> {
  try {
    const project = await db?.lwProjects?.getById(projectId)
    const ws = (project?.wizardState || {}) as Record<string, any>
    const rows: ResolutionRow[] = Array.isArray(ws.conflictResolutions) ? ws.conflictResolutions : []
    return new Set(rows.map((r) => r.key))
  } catch {
    return new Set()
  }
}

export async function acknowledgeConflict(
  db: any,
  projectId: string,
  conflict: ConflictLike,
  status: 'resolved' | 'kept' = 'kept',
  note?: string,
): Promise<void> {
  const project = await db?.lwProjects?.getById(projectId)
  if (!project) throw new Error('项目不存在')
  const ws = (project.wizardState || {}) as Record<string, any>
  const rows: ResolutionRow[] = Array.isArray(ws.conflictResolutions) ? ws.conflictResolutions : []
  const key = conflictKey(conflict)
  if (!rows.some((r) => r.key === key)) {
    rows.push({ key, rule: conflict.rule, status, note, at: Date.now() })
  }
  const merged = { ...(project.wizardState || {}), conflictResolutions: rows }
  const updated = await db.lwProjects.update(projectId, { wizardState: merged })
  if (!updated) throw new Error('登记失败（项目不存在）')
}
