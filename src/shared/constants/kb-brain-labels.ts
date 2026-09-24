/**
 * 知识大脑中文名标签（纯数据，非代码路径）
 * @module shared/constants/kb-brain-labels
 *
 * 存储与模型契约保持英文小写字面量（提示词/ajv schema/DB 值不改动），
 * 仅显示层经此字典转中文；未知值回退原样（前向兼容新类型）。
 */

export const KB_ATOM_TYPE_LABELS: Record<string, string> = {
  fact: '事实',
  claim: '观点',
  concept: '概念',
  method: '手法',
  insight: '洞见',
  'open-question': '悬置问题',
}

export const KB_ATOM_STATUS_LABELS: Record<string, string> = {
  supported: '已采纳',
  suspected: '存疑',
  contradicted: '已反驳',
  superseded: '已被替代',
  stale: '已过期',
  archived: '已归档',
}

export const KB_ATOM_ORIGIN_LABELS: Record<string, string> = {
  ai: 'AI 提炼',
  human: '我的记录',
}

export const KB_NOTE_TYPE_LABELS: Record<string, string> = {
  methodology: '方法论',
  insight: '思想洞见',
  synthesis: '综合经验',
  'plot-pattern': '情节模式',
  'setting-pattern': '设定模式',
  'character-pattern': '人物原型',
  lens: '观察视角',
  'skill-seed': '技能种子',
}

export const KB_NOTE_STATUS_LABELS: Record<string, string> = {
  proposed: '待审',
  draft: '草稿',
  published: '已入库',
  archived: '已归档',
}

function makeLabeler(map: Record<string, string>): (v: string | null | undefined) => string {
  return (v) => (v ? (map[v] ?? v) : '—')
}

export const kbAtomTypeLabel = makeLabeler(KB_ATOM_TYPE_LABELS)
export const kbAtomStatusLabel = makeLabeler(KB_ATOM_STATUS_LABELS)
export const kbNoteTypeLabel = makeLabeler(KB_NOTE_TYPE_LABELS)
export const kbAtomOriginLabel = makeLabeler(KB_ATOM_ORIGIN_LABELS)
export const kbNoteStatusLabel = makeLabeler(KB_NOTE_STATUS_LABELS)
