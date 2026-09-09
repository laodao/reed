/**
 * 知识全景 Atlas 原型数据
 * @module views/domain-learning/atlas-data
 * @description 界面原型专用（原型豁免）。Atlas 的类型化知识图谱数据：
 *              - 节点带知识类型（concept/regulation/paper/method…），学习空间 mock 只有简单概念；
 *              - 领域画像（profile）= 侧重类型集 + 说明，决定视图与呈现侧重；
 *              - 提供 2 个深度画像示例：T5 金融合规（fincompliance）、T7 前沿技术（llmfrontier）；
 *              - 其余空间（rag/diffusion）用其概念图回退生成基础图谱。
 */

import { findSpace, type RelationEdge } from './mock-data'

// ==================== 节点类型元数据 ====================

/** Atlas 知识节点类型（对齐 atlas-design.md §1.3 全集的子集） */
export type AtlasNodeType =
  | 'concept'      // 概念/术语
  | 'theory'       // 理论/模型
  | 'method'       // 方法/算法/流程
  | 'paper'        // 论文/文献
  | 'regulation'   // 法规/监管要求
  | 'procedure'    // 操作规范/作业流程
  | 'standard'     // 标准/协议
  | 'case'         // 案例/判例
  | 'person'       // 人物/机构/监管主体
  | 'benchmark'    // 基准/评测集
  | 'data'         // 事实/数据/指标
  | 'controversy'  // 争议/开放问题
  | 'principle'    // 原则/价值观

export interface AtlasNodeTypeMeta {
  label: string
  color: string
  /** 类型一句话说明（图例/帮助） */
  desc: string
}

export const ATLAS_NODE_TYPE_META: Record<AtlasNodeType, AtlasNodeTypeMeta> = {
  concept: { label: '概念', color: '#409EFF', desc: '领域基本单元' },
  theory: { label: '理论/模型', color: '#8A5CF6', desc: '解释性结构' },
  method: { label: '方法/流程', color: '#00B4A6', desc: '怎么做' },
  paper: { label: '论文/文献', color: '#F0A020', desc: '知识一手载体' },
  regulation: { label: '法规/监管', color: '#E05A4E', desc: '约束性规则' },
  procedure: { label: '操作规范', color: '#E08A2A', desc: '合规/作业要求' },
  standard: { label: '标准/协议', color: '#607D8B', desc: '技术/国际标准' },
  case: { label: '案例', color: '#9E7B4F', desc: '情境化实例' },
  person: { label: '人物/机构', color: '#5B8C5A', desc: '生产者与主体' },
  benchmark: { label: '基准/评测', color: '#7A8B99', desc: '衡量标准' },
  data: { label: '事实/数据', color: '#4DB6AC', desc: '具体事实/指标' },
  controversy: { label: '争议/开放问题', color: '#D9539A', desc: '未决点' },
  principle: { label: '原则', color: '#9C88FF', desc: '判断准则' },
}

/** 领域画像说明 */
export interface AtlasProfile {
  id: string
  /** 领域画像名（T5/T7 等） */
  kindLabel: string
  /** 一句话领域性质 */
  nature: string
  /** 侧重知识类型（展示顺序 = 关注度） */
  emphasis: AtlasNodeType[]
}

export const ATLAS_PROFILE: Record<string, AtlasProfile> = {
  fincompliance: {
    id: 'T5',
    kindLabel: '专业实务 · 法规驱动',
    nature: '法规要求 → 落到操作：强约束、强时效、案例导向',
    emphasis: ['regulation', 'procedure', 'concept', 'case', 'standard', 'person'],
  },
  llmfrontier: {
    id: 'T7',
    kindLabel: '前沿交叉 · 论文驱动',
    nature: '快速演进：论文/方法/基准是主角，争议与开放问题醒目',
    emphasis: ['paper', 'method', 'concept', 'benchmark', 'controversy', 'theory'],
  },
}

// ==================== Atlas 节点/边 ====================

export interface AtlasNode {
  id: string
  name: string
  type: AtlasNodeType
  /** 分组（Atlas 网络图分区/大纲树分组） */
  group: string
  /** 展示掌握度（学习侧）；Atlas 原型沿用演示值 */
  mastery?: 'mastered' | 'learning' | 'todo'
  /** 节点档案：定义/要点 */
  desc: string
  /** 节点档案：类型专属字段（如法规：效力/施行；论文：作者/年份/出处） */
  attrs?: Record<string, string>
  /** 节点档案：关联内容标题列表（论文/方法/规范/最新成果等，随类型侧重） */
  related?: string[]
}

export interface AtlasEdge extends RelationEdge {}

export interface AtlasGraph {
  spaceId: string
  nodes: AtlasNode[]
  edges: AtlasEdge[]
}

// ==================== T5：金融合规 · 反洗钱（深度示例） ====================

const finNodes: AtlasNode[] = [
  { id: 'aml', name: '反洗钱', type: 'concept', group: '核心概念', mastery: 'mastered', desc: '识别并把阻断"非法所得合法化"的行为与资金链。', related: ['义务主体范围', '三大洗钱阶段'] },
  { id: 'cdd', name: '客户尽职调查', type: 'concept', group: '核心概念', mastery: 'learning', desc: '建立业务关系前识别客户身份、了解交易目的并评估风险。', related: ['KYC 与 CDD 差异', '强化尽调 EDD'] },
  { id: 'kyc', name: '客户身份识别', type: 'concept', group: '核心概念', desc: '核实客户真实身份，是 CDD 的第一步。' },
  { id: 'ubo', name: '受益所有人识别', type: 'concept', group: '核心概念', desc: '穿透识别实际控制人/受益所有人。' },
  { id: 'law', name: '《反洗钱法》(2025 修订)', type: 'regulation', group: '法规依据', desc: '反洗钱义务的法律源头；新法强化特定非金融机构义务。', attrs: { 效力: '法律', 施行: '2026-01-01' }, related: ['义务主体扩展', '处罚力度变化'] },
  { id: 'pbocRule', name: '人民银行反洗钱规定', type: 'regulation', group: '法规依据', desc: '将法律落到金融机构具体内控与报告要求。', attrs: { 效力: '部门规章' } },
  { id: 'fatf', name: 'FATF 国际标准', type: 'standard', group: '法规依据', desc: '四十条建议：反洗钱/反恐融资国际基线，各国互评估依据。', attrs: { 组织: '金融行动特别工作组' } },
  { id: 'cddProc', name: '客户尽调作业流程', type: 'procedure', group: '操作要求', desc: '接洽→KYC→风险评级→(高风险)EDD→持续监测的落地步骤。', attrs: { 触发: '建立业务关系前' }, related: ['评级矩阵'] },
  { id: 'str', name: '可疑交易报告流程', type: 'procedure', group: '操作要求', desc: '监测→甄别→内部报告→向监测中心提交 STR 的时限化流程。', attrs: { 时限: '可疑交易发生后规定时限内' } },
  { id: 'sancCheck', name: '制裁名单筛查', type: 'procedure', group: '操作要求', desc: '交易对手/受益人与制裁名单比对，命中即冻结拒绝。' },
  { id: 'amlCase', name: '某外资银行反洗钱罚单', type: 'case', group: '案例', desc: '因 CDD 缺失与可疑监测失效被重罚——合规失效的典型样本。', attrs: { 领域: '跨境支付' }, related: ['处罚要点拆解'] },
  { id: 'camlm', name: '反洗钱监测分析中心', type: 'person', group: '监管与主体', desc: '接收并分析金融机构报送的可疑交易报告。', attrs: { 性质: '监测机构' } },
  { id: 'rp', name: '风险为本原则', type: 'principle', group: '监管与主体', desc: '按风险高低分配尽调资源：高风险强管、低风险简化。' },
]

const finEdges: AtlasEdge[] = [
  { source: 'law', target: 'aml', type: '约束' },
  { source: 'law', target: 'cdd', type: '要求' },
  { source: 'pbocRule', target: 'cddProc', type: '细化' },
  { source: 'fatf', target: 'law', type: '对标' },
  { source: 'cdd', target: 'kyc', type: '包含' },
  { source: 'cdd', target: 'ubo', type: '深化' },
  { source: 'cdd', target: 'cddProc', type: '落地为' },
  { source: 'cddProc', target: 'rp', type: '遵循' },
  { source: 'aml', target: 'str', type: '手段' },
  { source: 'aml', target: 'sancCheck', type: '手段' },
  { source: 'str', target: 'camlm', type: '报送' },
  { source: 'amlCase', target: 'aml', type: '反面印证' },
  { source: 'amlCase', target: 'cddProc', type: '失效点' },
  { source: 'kyc', target: 'cddProc', type: '步骤' },
]

// ==================== T7：大模型前沿（深度示例） ====================

const llmNodes: AtlasNode[] = [
  { id: 'scaling', name: '规模定律', type: 'theory', group: '基础理论', mastery: 'mastered', desc: '模型能力随参数/数据/算力按幂律提升。', related: ['Kaplan vs Chinchilla', '数据质量优先'] },
  { id: 'arch', name: '架构演进', type: 'concept', group: '基础理论', mastery: 'learning', desc: 'Dense Transformer → MoE / 混合注意力的迭代。' },
  { id: 'moe', name: '混合专家 MoE', type: 'method', group: '基础理论', desc: '稀疏激活子网络：同算力更多参数。', attrs: { 典型: 'Switch/GShard/Mixtral' } },
  { id: 'rft', name: '推理时扩展', type: 'method', group: '训练与对齐', desc: '推理时多步思考/搜索换取更强能力（o1 类）。', related: ['测试时计算'] },
  { id: 'rftPaper', name: 'OpenAI o1 技术报告', type: 'paper', group: '训练与对齐', attrs: { 年份: '2024', 组织: 'OpenAI' }, desc: '首次系统展示推理时扩展（test-time scaling）。' },
  { id: 'alignment', name: 'RLHF/DPO 对齐', type: 'method', group: '训练与对齐', desc: '让模型行为符合人类偏好与意图。' },
  { id: 'instructPaper', name: 'InstructGPT 论文', type: 'paper', group: '训练与对齐', attrs: { 年份: '2022', 组织: 'OpenAI' }, desc: 'RLHF 规模化应用的奠基工作。' },
  { id: 'hallucination', name: '幻觉与可验证性', type: 'controversy', group: '评估与开放问题', desc: '模型生成无依据内容；RAG/引用是缓解方向。', related: ['可验证生成'] },
  { id: 'benchmark', name: 'MMLU/GSM8K 等基准', type: 'benchmark', group: '评估与开放问题', desc: '标准评测集；前沿模型渐趋饱和。', attrs: { 用途: '衡量知识与推理' } },
  { id: 'benchSat', name: '基准饱和之争', type: 'controversy', group: '评估与开放问题', desc: '静态基准区分度下降，评测方法论面临更新。' },
  { id: 'kv', name: 'KV Cache 优化', type: 'method', group: '工程实践', desc: '推理吞吐/显存优化的关键课题。' },
  { id: 'scalingPaper', name: 'Scaling Laws(Kaplan)', type: 'paper', group: '基础理论', attrs: { 年份: '2020' }, desc: '提出参数量-数据-算力的幂律关系。' },
  { id: 'agent', name: '智能体与工具调用', type: 'concept', group: '应用前沿', desc: '模型自主规划并调用工具/API 完成任务。', related: ['多步规划', '可靠性挑战'] },
]

const llmEdges: AtlasEdge[] = [
  { source: 'scalingPaper', target: 'scaling', type: '提出' },
  { source: 'scaling', target: 'arch', type: '驱动' },
  { source: 'arch', target: 'moe', type: '分支' },
  { source: 'scaling', target: 'alignment', type: '伴生问题' },
  { source: 'instructPaper', target: 'alignment', type: '奠基' },
  { source: 'alignment', target: 'hallucination', type: '相关议题' },
  { source: 'rftPaper', target: 'rft', type: '提出' },
  { source: 'rft', target: 'benchSat', type: '触发争议' },
  { source: 'benchmark', target: 'hallucination', type: '暴露' },
  { source: 'benchSat', target: 'benchmark', type: '质疑' },
  { source: 'arch', target: 'kv', type: '工程制约' },
  { source: 'agent', target: 'hallucination', type: '放大风险' },
  { source: 'agent', target: 'rft', type: '受益' },
]

// ==================== 深度图谱注册表 ====================

const DEEP_ATLAS: Record<string, AtlasGraph> = {
  fincompliance: { spaceId: 'fincompliance', nodes: finNodes, edges: finEdges },
  llmfrontier: { spaceId: 'llmfrontier', nodes: llmNodes, edges: llmEdges },
}

// ==================== 回退：普通空间用概念图生成基础图谱 ====================

const CONCEPT_GROUP_FALLBACK = '概念'

/** 从学习空间的概念图生成基础 Atlas 图谱（无深度数据时的兜底，M1 演示够用） */
function buildFallbackAtlas(spaceId: string): AtlasGraph | null {
  const space = findSpace(spaceId)
  if (!space || space.concepts.length === 0) return null
  const nodes: AtlasNode[] = space.concepts.map(c => ({
    id: c.id,
    name: c.name,
    type: 'concept' as AtlasNodeType,
    group: c.group,
    mastery: c.mastery,
    desc: c.desc,
  }))
  // 无关系数据时补一个分组概念节点便于展示
  if (space.relations.length === 0) {
    nodes.push({ id: `${CONCEPT_GROUP_FALLBACK}领域`, name: `${space.name}知识域`, type: 'concept', group: '总览', desc: '该领域的知识体系总览节点。' })
  }
  return { spaceId, nodes, edges: space.relations }
}

/** 取某空间的 Atlas 图谱（深度优先，回退基础）。
 *  深度图谱节点 id 与学习空间概念池对齐（dl_concept.id 语义），
 *  掌握度以学习侧实时值为准（无概念对应的纯图谱节点保留演示值）。 */
export function atlasForSpace(spaceId: string): AtlasGraph | null {
  const deep = DEEP_ATLAS[spaceId]
  if (deep) {
    const space = findSpace(spaceId)
    if (!space) return deep
    const masteryById = new Map(space.concepts.map(c => [c.id, c.mastery]))
    const nodes = deep.nodes.map(n => {
      const m = masteryById.get(n.id)
      return m && m !== n.mastery ? { ...n, mastery: m } : n
    })
    return { ...deep, nodes }
  }
  return buildFallbackAtlas(spaceId)
}

/** 取某空间的领域画像（无深度画像时给通用） */
export function profileForSpace(spaceId: string): AtlasProfile {
  return (
    ATLAS_PROFILE[spaceId] ?? {
      id: 'T4',
      kindLabel: '通用 · 概念为主',
      nature: '概念网络 + 学习讲义驱动的通用领域',
      emphasis: ['concept', 'method', 'theory'],
    }
  )
}

/** 类型标签/颜色查询 */
export function nodeTypeMeta(t: AtlasNodeType): AtlasNodeTypeMeta {
  return ATLAS_NODE_TYPE_META[t] ?? ATLAS_NODE_TYPE_META.concept
}
