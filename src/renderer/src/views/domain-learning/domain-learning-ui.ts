/**
 * 领域共学空间 —— 纯 UI 映射（图例 / 文案 / 状态色）
 * @module views/domain-learning/domain-learning-ui
 * @description 仅承载展示层派生常量：节点类型图例（颜色/标签/说明）、关系类型中文文案、
 *              掌握度状态文案。数据一律来自后端（shared 契约枚举），本文件不做任何业务数据。
 *              枚举变更时同步这里（与 dl_* 仓储校验同源）。
 */
import type {
  DlMastery,
  DlNodeType,
  DlRelationType,
} from '@shared/types/domain-learning.types'

// ==================== 节点类型图例（Atlas / 结构索引着色用） ====================

/** 单类型图例元数据 */
export interface DlNodeTypeMeta {
  label: string
  color: string
  desc: string
}

/** 全部节点类型图例（覆盖 shared DlNodeType 全 16 种 + group 目录） */
export const DL_NODE_TYPE_META: Record<DlNodeType, DlNodeTypeMeta> = {
  group: { label: '目录', color: '#909399', desc: '大纲分组（非知识节点）' },
  concept: { label: '概念', color: '#409EFF', desc: '领域基本单元' },
  fact: { label: '事实', color: '#4DB6AC', desc: '具体事实/数据点' },
  definition: { label: '定义', color: '#00A8A8', desc: '术语界定' },
  axiom: { label: '公理/假设', color: '#5B8C5A', desc: '不加证明的出发点' },
  theory: { label: '理论/模型', color: '#8A5CF6', desc: '解释性结构' },
  method: { label: '方法/流程', color: '#00B4A6', desc: '怎么做' },
  artifact: { label: '产物/工件', color: '#7A8B99', desc: '实践产出物' },
  paper: { label: '论文/文献', color: '#F0A020', desc: '知识一手载体' },
  standard: { label: '标准/协议', color: '#607D8B', desc: '技术/国际标准' },
  regulation: { label: '法规/监管', color: '#E05A4E', desc: '约束性规则' },
  procedure: { label: '操作规范', color: '#E08A2A', desc: '合规/作业要求' },
  case: { label: '案例', color: '#9E7B4F', desc: '情境化实例' },
  person: { label: '人物/机构', color: '#5B8C5A', desc: '生产者与主体' },
  controversy: { label: '争议/开放问题', color: '#D9539A', desc: '未决点' },
  principle: { label: '原则', color: '#9C88FF', desc: '判断准则' },
}

/** 未知类型兜底（画像侧重等非枚举值展示用） */
const DL_NODE_TYPE_FALLBACK_META: DlNodeTypeMeta = {
  label: '其他',
  color: '#909399',
  desc: '未归类节点',
}

/** 取类型图例（未知字符串回退兜底，避免整页白屏） */
export function nodeTypeMeta(t: string): DlNodeTypeMeta {
  return DL_NODE_TYPE_META[t as DlNodeType] ?? DL_NODE_TYPE_FALLBACK_META
}

// ==================== 关系类型中文文案 ====================

/** 关系类型 → 中文文案（讲义 related 区 / Atlas 档案关系标注） */
export const DL_RELATION_LABELS: Record<DlRelationType, string> = {
  prerequisite: '前置',
  is_a: '归类',
  part_of: '包含',
  compare: '对比',
  cause: '因果',
  supports: '支撑',
  cites: '引用',
  constrains: '约束',
  updates: '取代',
  related: '相关',
}

/** 关系类型中文文案（未知类型直接原样回显） */
export function relLabel(type: string): string {
  return DL_RELATION_LABELS[type as DlRelationType] ?? type
}

// ==================== 掌握度文案与样式键 ====================

/** 掌握度 → 展示文案（mastered 绿 / learning 橙 / untouched+review 灰） */
export const DL_MASTERY_LABELS: Record<DlMastery, string> = {
  mastered: '已理解',
  learning: '学习中',
  untouched: '待学',
  review: '待复习',
}

/** 掌握度 → 展示文案（未知原样回显） */
export function masteryLabel(m: DlMastery): string {
  return DL_MASTERY_LABELS[m] ?? '待学'
}

/** 掌握度 → Element 标签 type（主状态色；灰态用 info） */
export function masteryTagType(m: DlMastery): 'success' | 'warning' | 'info' {
  return m === 'mastered' ? 'success' : m === 'learning' ? 'warning' : 'info'
}

/** 掌握度 → 圆点 css 类（树行/统计圆点用；灰态复用 todo 样式） */
export function masteryDotClass(m: DlMastery): string {
  return m === 'mastered' ? 'dot-mastered' : m === 'learning' ? 'dot-learning' : 'dot-todo'
}

// ==================== 系统知识库选项（建空间 / 空间设置下拉共用） ====================

/** 系统知识库列表项（knowledge-base:list 返回；只取下拉所需字段） */
export interface DlKbOption {
  id: string
  name: string
}

/** 读系统知识库列表（失败静默返回空，由调用方给兜底提示） */
export async function listKnowledgeBases(): Promise<DlKbOption[]> {
  try {
    const kb = (window as {
      electronAPI?: { knowledgeBase?: { list: () => Promise<{ success?: boolean; data?: DlKbOption[] }> } }
    }).electronAPI?.knowledgeBase
    if (!kb) return []
    const r = await kb.list()
    return r?.success ? (r.data ?? []) : []
  } catch (e) {
    console.warn('[domain-learning] 读取知识库列表失败:', e)
    return []
  }
}
