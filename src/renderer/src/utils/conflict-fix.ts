/**
 * 一致性疑点的展示与修正消息组装（研讨室疑点抽屉与写作台疑点面板共用）
 * @module renderer/utils/conflict-fix
 */

/**
 * 疑点定位摘要行：有 locs 显示章节/段落/摘录；否则显示章节级提示。
 * 无任何定位信息返回空串（调用方不渲染该行）。
 */
export function conflictLocLine(c: any): string {
  const loc = c?.locs?.[0]
  if (loc) {
    const more = c.locs.length > 1 ? `（共 ${c.locs.length} 处标记）` : ''
    return `第${loc.chapterNumber}章 第${loc.paragraph}段 · 「${loc.excerpt}」${more}`
  }
  if (c?.chapterNumber) return `第${c.chapterNumber}章 · 无精确正文位置（章节级）`
  return ''
}

/**
 * 组装「交主编修正」消息（分级）：
 * - 有 exact 摘录：把章节/段落/偏移/摘录/疑点 key 全部交给主编，直接精确替换；
 * - 章节级/mention：只给章节与问题描述，让主编读章自行定位（避免拿模糊锚点乱改）。
 * 两级都要求主编先出方案、用户确认后再调 lw_patch_chapter——正文修改权在作者。
 */
export function buildConflictFixMessage(c: any): string {
  const loc = c?.locs?.[0]
  const where = c?.chapterNumber ? `第${c.chapterNumber}章` : c?.outlineId ? `大纲节点 ${c.outlineId}` : ''
  const lines = [
    `请修正以下一致性疑点：[${c?.rule || '?'}] ${c?.description || c?.message}`,
    where ? `位置：${where}${loc ? ` 第${loc.paragraph}段（字符偏移 ${loc.start}-${loc.end}）` : ''}` : '',
    loc ? `原文摘录：「${loc.excerpt}」` : '',
    c?.beatText ? `大纲承诺拍：「${c.beatText}」` : '',
    // key 由后端 annotateConflicts 回填（conflictKey 契约）——原样带给主编，
    // 修正成功后它传给 lw_patch_chapter 的 conflictKey 参数即可自动登记 resolved
    c?.key ? `疑点 key：${c.key}（调 lw_patch_chapter 时作为 conflictKey 参数原样传入）` : '',
    loc?.kind === 'exact'
      ? '摘录可信。给出修正方案，我确认后用 lw_patch_chapter 按摘录精确替换。'
      : '请先用 lw_query_chapter 读该章定位问题根由，给出修正方案，我确认后再局部修正。',
  ]
  return lines.filter(Boolean).join('\n')
}
