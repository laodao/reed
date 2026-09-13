/**
 * 领域共学空间（前端原型）样例数据
 * @module views/domain-learning/mock-data
 * @description 界面原型专用演示数据（原型豁免，非正式业务数据）。
 *              演示领域：RAG（主示例，完整）+ 扩散模型（第二示例，轻量）。
 *              结构：一个主题 = 概念节点 + 关系边 + 讲义 + 追问对话。
 */

/** 概念掌握度：mastered=已理解（绿） learning=学习中（橙） todo=待学（灰） */
export type Mastery = 'mastered' | 'learning' | 'todo'

export interface ConceptNode {
  id: string
  /** 显示名 */
  name: string
  /** 副题（英文术语） */
  en: string
  /** 分组（左栏树一级 / 全景图 subgraph） */
  group: string
  /** 概念类型（学习空间展示用；Atlas 有独立类型化图谱数据） */
  kind: string
  /** 一句话定义 */
  desc: string
  /** 用户掌握度 */
  mastery: Mastery
  /** 关联讲义 id（无则"学习中·待生成"占位；有 card 时优先块化渲染） */
  lessonId?: string
  /** 块化知识卡片（content-template-design：essence_type + blocks） */
  card?: ConceptCard
}

/** 知识点本质类型（content-template-design §1/design-v3 §3.1） */
export type EssenceType = 'K-concept' | 'K-oper' | 'K-stmt' | 'K-inst' | 'K-agent' | 'K-open'

/** 区视觉样式（少量，非碎片卡片）：intro=引言衬底 / body=正文 / note=注意 / review=检验 */
export type SectionStyle = 'intro' | 'body' | 'note' | 'review'

/** 知识讲义区（content-template-design v4：类型化模板的粗粒度区） */
export interface CardSection {
  key: string
  /** 区标题（模板语义，如：本质/陈述/依据/步骤…；缺省由 key 映射默认标题） */
  title?: string
  style?: SectionStyle
  /** 区内 md（可含图/表/mermaid/KaTeX 公式）；深水区可折叠 */
  md: string
  /** 深水内容默认折叠（证明/长条文） */
  folded?: boolean
}

/** 相关著作/一手文献（works 区，有则显示） */
export interface WorkRef {
  kind: '论文' | '专著' | '标准' | '法规' | '报告'
  title: string
  authors?: string
  year?: string
  url?: string
  note?: string
}

/** 相关知识点（related 区，由关系边派生；原型由页面计算传入） */
export interface RelatedRef {
  conceptId: string
  name: string
  /** 关系描述（前置/后继/对比/…） */
  rel?: string
}

export interface ConceptCard {
  essenceType: EssenceType
  sections: CardSection[]
  /** 相关著作（可空 → works 区不显示） */
  works?: WorkRef[]
}

export interface RelationEdge {
  source: string
  target: string
  type: string
}

export interface LessonDoc {
  id: string
  conceptIds: string[]
  title: string
  seq: number
  md: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  sourceLabel?: string
  suggestsResearch?: boolean
}

export interface SpaceProject {
  id: string
  name: string
  goal: string
  /** 列表卡片的一句话说明 */
  tagline: string
  /** 学习目标档位（展示） */
  goalLevel: '入门' | '工作应用' | '前沿'
  concepts: ConceptNode[]
  relations: RelationEdge[]
  lessons: LessonDoc[]
  turns: ChatTurn[]
  /**
   * 大纲树（左栏知识地图层级展示用）。分支/模块可嵌套任意深；
   * 叶子引用概念（conceptId）。缺省时按 concepts[].group 生成两级树。
   */
  tree?: KnowledgeTreeNode[]
}

/** 知识大纲树节点：非叶子=分支/模块（带 children）；叶子=概念（conceptId） */
export interface KnowledgeTreeNode {
  id: string
  name: string
  /** 叶子：对应概念 id（非叶子无） */
  conceptId?: string
  children?: KnowledgeTreeNode[]
}

/** 收集树中全部叶子概念 id（深度优先） */
export function collectLeafConceptIds(nodes: KnowledgeTreeNode[]): string[] {
  const out: string[] = []
  const walk = (list: KnowledgeTreeNode[]) => {
    for (const n of list) {
      if (n.conceptId) out.push(n.conceptId)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** 由概念表构建默认两级大纲树（分组 = 树一级），老主题兼容 */
export function fallbackTreeOf(space: SpaceProject): KnowledgeTreeNode[] {
  const byGroup = new Map<string, ConceptNode[]>()
  for (const c of space.concepts) {
    const g = c.group || '概念'
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(c)
  }
  return [...byGroup.entries()].map(([name, cs]) => ({
    id: `g-${name}`,
    name,
    children: cs.map(c => ({ id: `c-${c.id}`, name: c.name, conceptId: c.id })),
  }))
}

// ===================================================================
// 主题一：检索增强生成（RAG）—— 完整示例
// ===================================================================

const ragConcepts: ConceptNode[] = [
  { id: 'rag', name: '检索增强生成', en: 'RAG', group: '基础概念', kind: '概念', desc: '先检索相关资料，再让大模型基于资料回答，减少幻觉', mastery: 'mastered', lessonId: 'lesson-rag' },
  { id: 'chunk', name: '文本切分', en: 'Chunking', group: '基础概念', kind: '方法', desc: '把长文档切成有语义边界的片段，是后续向量化的前置', mastery: 'mastered', lessonId: 'lesson-chunk' },
  { id: 'embed', name: '向量嵌入', en: 'Embedding', group: '基础概念', kind: '技术', desc: '把文本映射成向量，语义相近的文本在向量空间里距离近', mastery: 'learning', lessonId: 'lesson-embed' },
  { id: 'vector-db', name: '向量检索', en: 'Vector Search', group: '检索链路', kind: '技术', desc: '在向量库里找与问题最相似的若干片段（TopK 召回）', mastery: 'todo', lessonId: 'lesson-retrieval' },
  { id: 'hybrid', name: '混合检索', en: 'Hybrid Search', group: '检索链路', kind: '技术', desc: '向量检索 + 关键词检索互补，再统一融合排序', mastery: 'todo' },
  { id: 'rerank', name: '重排', en: 'Rerank', group: '检索链路', kind: '技术', desc: '对召回片段做精细排序，把最相关的顶到前面', mastery: 'todo' },
  { id: 'context', name: '上下文组装', en: 'Context Assembly', group: '生成与评估', kind: '方法', desc: '把精选片段按顺序组装成送给大模型的上下文', mastery: 'todo' },
  { id: 'answer', name: '答案生成', en: 'Grounded Answering', group: '生成与评估', kind: '概念', desc: '大模型基于给定资料作答并尽量引用来源', mastery: 'todo' },
  { id: 'eval', name: '评测', en: 'Evaluation', group: '生成与评估', kind: '方法', desc: '从召回率/答案正确性等维度衡量 RAG 系统好坏', mastery: 'todo' },
]

const ragRelations: RelationEdge[] = [
  { source: 'rag', target: 'chunk', type: '包含' },
  { source: 'rag', target: 'embed', type: '包含' },
  { source: 'rag', target: 'vector-db', type: '包含' },
  { source: 'rag', target: 'answer', type: '包含' },
  { source: 'chunk', target: 'embed', type: '前置依赖' },
  { source: 'embed', target: 'vector-db', type: '前置依赖' },
  { source: 'vector-db', target: 'hybrid', type: '相关' },
  { source: 'vector-db', target: 'rerank', type: '流程' },
  { source: 'rerank', target: 'context', type: '流程' },
  { source: 'context', target: 'answer', type: '流程' },
  { source: 'eval', target: 'rag', type: '评估对象' },
]

const ragLessons: LessonDoc[] = [
  {
    id: 'lesson-rag',
    conceptIds: ['rag'],
    title: '第 1 课 · 一张图看懂 RAG',
    seq: 1,
    md: `# 检索增强生成（RAG）入门

**目标**：看懂 RAG 是什么、解决什么问题、系统由哪些环节组成。

## 为什么要 RAG

大模型的知识停在训练那一刻，且会"一本正经地胡说"（幻觉）。RAG 的思路是：**回答前先查资料**——把相关资料放进上下文，再让模型作答。

## 一张图看懂 RAG

\`\`\`mermaid
flowchart LR
  U[用户提问] --> Q[问题处理]
  Q --> R[检索: 向量库 TopK]
  R --> C[组装上下文]
  C --> G[大模型生成答案]
  G --> A[带引用的回答]
  D[(文档库)] --> CH[切分] --> EM[向量化] --> DB[(向量库)]
  DB -.-> R
\`\`\`

## 与传统问答的差别

| 维度 | 直接问大模型 | RAG |
|---|---|---|
| 知识时效 | 训练截止 | 资料更新即可用 |
| 幻觉风险 | 高 | 低（可引用来源） |
| 可解释 | 差 | 好（答案带出处） |
| 私域知识 | 不知道 | 可以基于你的文档 |

## 类比

像一个**开卷考试**：模型不是凭记忆答题，而是先翻到你指定章节，再组织答案。

## 自测

1. RAG 相比直接提问，主要解决了哪两个问题？
2. 答案"带出处"为什么重要？`,
  },
  {
    id: 'lesson-chunk',
    conceptIds: ['chunk'],
    title: '第 2 课 · 文本切分 Chunking',
    seq: 2,
    md: `# 文本切分（Chunking）

**概念**：把长文档切成若干有语义边界的片段（chunk），供后续向量化与检索。切得好不好，直接决定检索能不能命中。

## 为什么不能整篇喂进去

- 向量化的上下文长度有限；
- 整篇的向量"什么都像又什么都不像"，检索精度差；
- 片段越小越精准，但太小会丢失上下文语义——需要平衡。

## 切分策略对比

| 策略 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| 固定长度 | 按字符数硬切 | 简单 | 切断语义/句子 |
| 按段落 | 按段落边界切 | 语义完整 | 长段落仍超限 |
| 递归字符切分 | 优先保留段落/句/词层级 | 兼顾 | 实现较复杂 |
| 结构感知 | 按 markdown 标题/表格切 | 保留结构语义 | 依赖文档格式 |

## 判断切得好不好的信号

- 一个 chunk 是否"主题单一、自成一段可理解的话"；
- 问题能否整体命中某一个 chunk，而不是答案被劈成两半。

## 自测

1. chunk 太小的副作用是什么？
2. 为什么按标题切分通常比按固定长度好？`,
  },
  {
    id: 'lesson-embed',
    conceptIds: ['embed'],
    title: '第 3 课 · 向量嵌入 Embedding',
    seq: 3,
    md: `# 向量嵌入（Embedding）

**概念**：把一段文本映射成一个向量（一串数字），使**语义相近的文本在向量空间里距离近**。这是"用语义而非关键词找资料"的基础。

## 直觉类比

把每句话看作高维空间里的一个点：\`"猫在睡觉"\` 和 \`"猫咪睡着了"\` 应该离得很近，而和 \`"股票上涨"\` 离得很远。**Embedding 模型就是负责把文字搬到这个空间里的地图**。

## 关键性质

| 性质 | 含义 | 影响 |
|---|---|---|
| 语义编码 | 同义词/改写后距离仍近 | 比关键词检索更抗表述差异 |
| 维度 | 如 1024 维 | 越高表达力越强、存储越大 |
| 长度敏感 | 句子 vs 段落向量语义不同 | 检索片段与问题长度需匹配 |
| 领域适配 | 通用模型对专业术语理解弱 | 领域内可用专用/微调模型 |

## 自测

1. 为什么 embedding 能解决"用户没说关键词但意思相同"的检索？
2. 维度越高一定越好吗？`,
  },
  {
    id: 'lesson-retrieval',
    conceptIds: ['vector-db'],
    title: '第 4 课 · 向量检索 Vector Search',
    seq: 4,
    md: `# 向量检索（Vector Search）

**概念**：在向量库里找与问题向量最相似的若干片段（TopK 召回），是 RAG 检索环节的执行器。

## 在算什么

问题也被 embedding 成向量，然后与库中所有片段向量算相似度（余弦/内积），取最相似的 K 个。

## 关键参数

| 参数 | 含义 | 常见问题 |
|---|---|---|
| TopK | 召回多少条 | 太小漏相关、太大灌噪声 |
| 相似度阈值 | 低于阈值不返回 | 无关片段混入会误导生成 |
| 索引类型 | HNSW/IVF 等 | 影响速度与精度权衡 |

## 自测

1. TopK 设太大有什么副作用？`,
  },
]

const ragTurns: ChatTurn[] = [
  {
    role: 'user',
    text: '为什么按段落切分比按固定长度切分好？',
  },
  {
    role: 'assistant',
    text: '按段落切分能保住一个完整的语义单元——整段话都在讲同一件事，向量化后"指向性"更强，检索更容易整段命中。固定长度硬切会拦腰斩断句子，语义被劈成两半，两头都不像原意。\n\n> 依据：讲义《文本切分 Chunking》"切分策略对比"表 + 知识库《RAG 工程实践》第 2 章。',
    sourceLabel: '讲义 §2 + KB 文档',
  },
  {
    role: 'user',
    text: '那 embedding 是不是维度越高效果一定越好？',
  },
  {
    role: 'assistant',
    text: '不一定。更高维度表达力更强，但存储和检索成本上涨，且维度超过数据本身复杂度后边际收益递减，甚至可能引入噪声。实际取舍要看语料规模和任务。\n\n> 这项结论属于模型先验知识，尚未在你的知识库中找到外部资料佐证——需要我把它存成"ai-verified"知识卡片吗？（建议找 1~2 篇 embedding 选型的工程文章交叉验证）',
    sourceLabel: '模型先验 · 待验证',
  },
  {
    role: 'user',
    text: '混合检索具体怎么融合排序？',
  },
  {
    role: 'assistant',
    text: '这个问题我在当前知识库和讲义里还没找到足够资料——向量检索与关键词检索如何做分数归一化与融合，各家方案差异较大。\n\n建议开启一个新研究子方向：「混合检索融合策略」，我会去收集资料、更新讲义后再回来教你。',
    sourceLabel: '资料不足',
    suggestsResearch: true,
  },
]

// ===================================================================
// 主题二：扩散模型（图像生成）—— 轻量示例
// ===================================================================

const dmConcepts: ConceptNode[] = [
  { id: 'dm', name: '扩散模型', en: 'Diffusion Model', group: '核心思想', kind: '概念', desc: '通过"逐步去噪"从噪声中生成图像的生成模型', mastery: 'mastered', lessonId: 'lesson-dm' },
  { id: 'noise', name: '前向加噪', en: 'Forward Process', group: '核心思想', kind: '方法', desc: '把真实图像逐步加噪声直到变成纯噪声', mastery: 'learning', lessonId: 'lesson-noise' },
  { id: 'denoise', name: '反向去噪', en: 'Reverse Process', group: '核心思想', kind: '方法', desc: '学习从噪声一步步还原出图像', mastery: 'todo' },
  { id: 'unet', name: '去噪主干', en: 'UNet', group: '网络结构', kind: '技术', desc: '负责预测噪声的神经网络结构', mastery: 'todo' },
  { id: 'latent', name: '潜空间扩散', en: 'Latent Diffusion', group: '工程加速', kind: '技术', desc: '先在压缩的潜空间扩散，大幅降低算力', mastery: 'todo' },
  { id: 'cond', name: '条件控制', en: 'Conditioning', group: '工程加速', kind: '技术', desc: '通过文本/草图等条件引导生成内容', mastery: 'todo' },
]

const dmRelations: RelationEdge[] = [
  { source: 'dm', target: 'noise', type: '包含' },
  { source: 'dm', target: 'denoise', type: '包含' },
  { source: 'noise', target: 'denoise', type: '过程对偶' },
  { source: 'denoise', target: 'unet', type: '依赖' },
  { source: 'unet', target: 'latent', type: '演进' },
  { source: 'latent', target: 'cond', type: '配套' },
]

const dmLessons: LessonDoc[] = [
  {
    id: 'lesson-dm',
    conceptIds: ['dm'],
    title: '第 1 课 · 扩散模型在做什么',
    seq: 1,
    md: `# 扩散模型（Diffusion Model）

**一句话**：训练时学"把噪声图一步步还原成真实图"，生成时从纯噪声出发反向走一遍。

## 一张图看懂加噪/去噪

\`\`\`mermaid
flowchart LR
  A[真实图像] -->|逐步加噪声| N[纯噪声]
  N -->|模型学去噪| A2[还原图像]
  subgraph 训练
    A
    N
  end
  subgraph 生成
    Z[随机噪声] --> D[去噪网络] --> O[新图像]
  end
\`\`\`

## 类比

像**用橡皮擦一点点擦掉雕像**：训练时我们"看着雕像被擦成泥块"学习怎么倒放；生成时从一块泥开始反着捏回去。`,
  },
  {
    id: 'lesson-noise',
    conceptIds: ['noise'],
    title: '第 2 课 · 前向加噪',
    seq: 2,
    md: `# 前向加噪（Forward Process）

**概念**：给真实图像按时间步逐步叠加高斯噪声，最终变成纯噪声。这个过程的公式是确定的，不需要学习。

| 时间步 t | 图像状态 |
|---|---|
| t=0 | 真实图像 |
| 中间 | 图像 + 越来越强的噪声 |
| t=T | 近似纯噪声 |

加噪过程是"已知的、固定的"——模型真正要学的只有反向去噪。`,
  },
]

const dmTurns: ChatTurn[] = [
  {
    role: 'user',
    text: '为什么生成时要从纯噪声开始，不能从一张模糊图开始？',
  },
  {
    role: 'assistant',
    text: '因为训练时模型见过的是"任意噪声程度的图→还原"，从纯噪声开始走完整条链最能发挥它的能力；从模糊图开始等于只走了后半段，反而浪费训练覆盖。\n\n> 依据：讲义《前向加噪》时间步表 + 知识库《扩散模型综述》第 3 节。',
    sourceLabel: '讲义 §1 + KB 综述',
  },
]

// ===================================================================
// 主题三：金融合规实务（T5 专业实务画像演示）
// ===================================================================

const fcConcepts: ConceptNode[] = [
  { id: 'aml', name: '反洗钱', en: 'AML', group: '核心概念', kind: '概念', desc: '识别并阻断将非法所得合法化的行为', mastery: 'mastered', lessonId: 'lesson-aml' },
  { id: 'cdd', name: '客户尽职调查', en: 'CDD', group: '核心概念', kind: '方法', desc: '了解客户身份与交易目的，评估风险等级', mastery: 'learning', lessonId: 'lesson-cdd' },
  { id: 'kyc', name: '客户身份识别', en: 'KYC', group: '核心概念', kind: '概念', desc: '核实客户真实身份是 CDD 的第一步', mastery: 'learning' },
  { id: 'str', name: '可疑交易报告', en: 'STR', group: '操作要求', kind: '流程', desc: '发现可疑交易后向反洗钱监测中心报告', mastery: 'todo' },
  { id: 'ubo', name: '受益所有人识别', en: 'UBO', group: '操作要求', kind: '流程', desc: '穿透识别实际控制人/受益所有人', mastery: 'todo' },
  { id: 'sanction', name: '制裁合规', en: 'Sanctions', group: '监管要求', kind: '概念', desc: '不得与受制裁主体交易', mastery: 'todo' },
  { id: 'law', name: '《反洗钱法》', en: 'AML Law', group: '法规依据', kind: '规范', desc: '反洗钱义务的法律源头（2025 修订施行）', mastery: 'todo' },
  { id: 'suspense-threshold', name: '大额交易报告标准', en: 'Threshold', group: '监管要求', kind: '规范', desc: '单笔或累计超标准的交易须报告', mastery: 'todo' },
]

const fcRelations: RelationEdge[] = [
  { source: 'law', target: 'aml', type: '约束' },
  { source: 'law', target: 'cdd', type: '要求' },
  { source: 'cdd', target: 'kyc', type: '包含' },
  { source: 'cdd', target: 'ubo', type: '深化' },
  { source: 'aml', target: 'str', type: '手段' },
  { source: 'aml', target: 'sanction', type: '关联' },
  { source: 'cdd', target: 'suspense-threshold', type: '依据' },
]

const fcLessons: LessonDoc[] = [
  {
    id: 'lesson-aml',
    conceptIds: ['aml'],
    title: '第 1 课 · 反洗钱在防什么',
    seq: 1,
    md: `# 反洗钱（AML）

**一句话**：识别并把阻断"把非法所得洗白"的行为链。

## 三类典型洗钱阶段

| 阶段 | 做什么 | 示例 |
|---|---|---|
| 放置 Placement | 把现金投入金融体系 | 大额现金存入 |
| 分层 Layering | 多账户/多笔转移切断痕迹 | 快进快出、拆分交易 |
| 归并 Integration | 以合法形式回流 | 购买资产、转入投资 |

## 金融机构的义务起点

法律规定金融机构承担 **客户尽职调查（CDD）+ 可疑交易报告（STR）** 义务——所以"了解你的客户（KYC）"不是可选项，而是合规基线。

## 自测

1. CDD 和 KYC 是什么关系？
2. 为什么"拆分交易规避报告"本身就是可疑信号？`,
  },
  {
    id: 'lesson-cdd',
    conceptIds: ['cdd'],
    title: '第 2 课 · 客户尽职调查 CDD',
    seq: 2,
    md: `# 客户尽职调查（CDD）

**概念**：金融机构在与客户建立业务关系前/中，识别客户身份、了解其业务与交易目的，并据此评估风险等级、决定管控措施。

## CDD 三件事

1. 识别并核实客户身份（KYC）；
2. 了解业务关系的目的与性质；
3. 对高风险客户做**强化尽调（EDD）**，低风险可简化。

## 与法规的关系

《反洗钱法》把 CDD 定为法定义务；监管机构据此检查；不履行将面临处罚——所以它是"法规要求落到操作流程"的典型一环。

## 自测

1. 为什么 CDD 要先做风险等级评估再做尽调深浅？
2. 受益所有人识别（UBO）补足了 CDD 的什么缺口？`,
  },
]

const fcTurns: ChatTurn[] = [
  { role: 'user', text: 'KYC 和 CDD 到底有什么区别？' },
  {
    role: 'assistant',
    text: 'KYC（客户身份识别）是 CDD 的第一步——先核实"你是谁"；CDD 范围更广，还包括了解业务目的、评估风险、持续监测。KYC 是 CDD 的子集而非同义。\n\n> 依据：讲义《客户尽职调查 CDD》+ 知识库《反洗钱法规汇编》。',
    sourceLabel: '讲义 §1 + KB',
  },
  { role: 'user', text: '做跨境支付要遵守哪些具体监管要求？' },
  {
    role: 'assistant',
    text: '这个问题涉及具体展业合规，我在知识库里还缺支付结算类监管细则的资料——建议开一个新研究子方向：「跨境支付合规要点」，先收集人民银行相关办法与行业指引再答你。',
    sourceLabel: '资料不足',
    suggestsResearch: true,
  },
]

// ===================================================================
// 主题四：大模型前沿（T7 前沿交叉画像演示）
// ===================================================================

const llmConcepts: ConceptNode[] = [
  { id: 'scaling', name: '规模定律', en: 'Scaling Laws', group: '基础理论', kind: '概念', desc: '模型性能随参数/数据/算力按幂律提升', mastery: 'mastered', lessonId: 'lesson-scaling' },
  { id: 'arch', name: '模型架构演进', en: 'Architecture', group: '基础理论', kind: '概念', desc: 'Transformer → MoE/混合注意力等架构迭代', mastery: 'learning', lessonId: 'lesson-arch' },
  { id: 'moe', name: '混合专家', en: 'MoE', group: '基础理论', kind: '方法', desc: '稀疏激活子网络，同算力更多参数', mastery: 'learning' },
  { id: 'alignment', name: '对齐', en: 'Alignment', group: '训练方法', kind: '方法', desc: '让模型行为符合人类意图（RLHF/DPO 等）', mastery: 'todo' },
  { id: 'rft', name: '推理时扩展', en: 'Test-time Scaling', group: '训练方法', kind: '方法', desc: '推理时多步思考/搜索换取更强能力（o1 类）', mastery: 'todo' },
  { id: 'kv', name: 'KV Cache 优化', en: 'Inference Opt', group: '工程实践', kind: '技术', desc: '推理吞吐/延迟优化的关键工程课题', mastery: 'todo' },
  { id: 'benchmark', name: '评测基准', en: 'Benchmarks', group: '评估与争议', kind: '方法', desc: 'MMLU/GSM8K 等标准评测集', mastery: 'todo' },
  { id: 'hallucination', name: '幻觉与可验证性', en: 'Hallucination', group: '评估与争议', kind: '概念', desc: '模型生成无依据内容；当前核心开放问题', mastery: 'todo' },
]

const llmRelations: RelationEdge[] = [
  { source: 'scaling', target: 'arch', type: '驱动' },
  { source: 'arch', target: 'moe', type: '分支' },
  { source: 'scaling', target: 'alignment', type: '伴生问题' },
  { source: 'alignment', target: 'rft', type: '演进' },
  { source: 'rft', target: 'benchmark', type: '受评测' },
  { source: 'arch', target: 'kv', type: '工程制约' },
  { source: 'benchmark', target: 'hallucination', type: '暴露' },
  { source: 'hallucination', target: 'alignment', type: '待解' },
]

const llmLessons: LessonDoc[] = [
  {
    id: 'lesson-scaling',
    conceptIds: ['scaling'],
    title: '第 1 课 · 规模定律',
    seq: 1,
    md: `# 规模定律（Scaling Laws）

**一句话**：在算力预算内，模型性能随 **参数、数据、算力** 按可预测的幂律提升。

## 三个量的关系

| 放大什么 | 效果 | 约束 |
|---|---|---|
| 参数 | 能力上限提升 | 需足够数据与算力 |
| 数据 | 收敛更好、泛化更强 | 优质数据有限 |
| 算力 | 训练可完成 | 成本与时间 |

## 为什么重要

它让"要不要把模型做大"从玄学变成**可规划的资源决策**——也带来对齐/推理等"变大才凸显"的伴生问题。

## 自测

1. 为什么数据质量比数据量更重要？
2. 规模定律的局限（边际收益递减）在哪？`,
  },
  {
    id: 'lesson-arch',
    conceptIds: ['arch'],
    title: '第 2 课 · 架构演进与 MoE',
    seq: 2,
    md: `# 模型架构演进

**主线**：Dense Transformer → **MoE（混合专家）** → 混合注意力 / 推理时扩展协同。

## MoE 要点

- 把 FFN 拆成多个"专家"，每个 token 只激活少数几个；
- 效果：**同等算力下装更多参数**，容量变大、单次推理成本不涨。

## 工程制约

架构选择直接决定 **KV Cache / 显存 / 推理延迟** 的工程课题——所以"架构"与"工程优化"在图上是强连边。

## 自测

1. MoE 为什么能"更大但不更慢"？
2. 推理时扩展（test-time scaling）与训练扩展是什么关系？`,
  },
]

const llmTurns: ChatTurn[] = [
  { role: 'user', text: 'MoE 为什么能装更多参数但推理不更慢？' },
  {
    role: 'assistant',
    text: '因为 MoE 的 FFN 被拆成多个专家、每个 token 只路由激活少数几个——模型总参数量大，但单次前向只计算被激活的专家，所以计算量接近同尺寸稠密模型。\n\n> 依据：讲义《架构演进与 MoE》+ 论文《Switch Transformer》。',
    sourceLabel: '讲义 §2 + 论文',
  },
  { role: 'user', text: 'o1 类模型的多步推理，评测上怎么衡量？' },
  {
    role: 'assistant',
    text: '现有静态基准（MMLU 等）对这类模型的区分度在下降，社区正在用更难/可验证的评测与人工盲评……这个方向资料还不全，建议开子研究「推理模型评测方法论」。',
    sourceLabel: '资料不足',
    suggestsResearch: true,
  },
]

// ===================================================================
// 主题五：机器学习体系（大规模多分支演示：验证大纲树折叠/过滤/聚合）
// ===================================================================

/** 紧凑条目：模块名 → 概念 [id 后缀, 名, en, 类型, 描述] */
type MlLeaf = [string, string, string, string, string]

const ML_GROUPS: Array<{ branch: string; modules: Array<{ module: string; leaves: MlLeaf[] }> }> = [
  {
    branch: '数学基础',
    modules: [
      {
        module: '线性代数',
        leaves: [
          ['vec', '向量', 'Vector', '概念', '有方向与大小的量，机器学习的最小数据单元'],
          ['mat', '矩阵', 'Matrix', '概念', '二维数据排布，承载权重与批量样本'],
          ['eig', '特征值分解', 'Eigendecomposition', '方法', '分解矩阵揭示其内在结构，PCA 依赖'],
        ],
      },
      {
        module: '概率与统计',
        leaves: [
          ['prob', '概率分布', 'Distribution', '概念', '描述随机变量取值的规律'],
          ['bayes', '贝叶斯定理', 'Bayes Theorem', '定理', '由先验与似然更新信念'],
          ['mle', '极大似然估计', 'MLE', '方法', '找到最可能产生观测数据的参数'],
        ],
      },
      {
        module: '微积分与最优化',
        leaves: [
          ['grad', '梯度', 'Gradient', '概念', '函数增长最快的方向，反向下山'],
          ['gd', '梯度下降', 'Gradient Descent', '方法', '沿负梯度迭代更新参数的优化算法'],
          ['lr', '学习率', 'Learning Rate', '概念', '每次参数更新步长，过大震荡过小缓慢'],
        ],
      },
    ],
  },
  {
    branch: '监督学习',
    modules: [
      {
        module: '回归',
        leaves: [
          ['linreg', '线性回归', 'Linear Regression', '方法', '拟合特征与连续目标间的线性关系'],
          ['ridge', '岭回归', 'Ridge', '方法', '加 L2 惩罚缓解过拟合的线性回归'],
          ['lasso', 'Lasso 回归', 'Lasso', '方法', '加 L1 惩罚实现特征稀疏选择'],
        ],
      },
      {
        module: '分类',
        leaves: [
          ['logit', '逻辑回归', 'Logistic Regression', '方法', 'Sigmoid 输出概率的分类模型'],
          ['svm', '支持向量机', 'SVM', '方法', '找最大间隔超平面，核技巧处理非线性'],
          ['tree', '决策树', 'Decision Tree', '方法', '按特征递归划分的树形分类器'],
          ['nb', '朴素贝叶斯', 'Naive Bayes', '方法', '基于条件独立假设的概率分类器'],
        ],
      },
      {
        module: '集成学习',
        leaves: [
          ['bagging', 'Bagging', 'Bagging', '方法', '并行训练多模型投票降低方差'],
          ['rf', '随机森林', 'Random Forest', '方法', '决策树 + 随机特征子集的 Bagging'],
          ['boost', 'Boosting', 'Boosting', '方法', '串行训练聚焦前序错误的强模型'],
          ['gbdt', '梯度提升树', 'GBDT', '方法', '每轮拟合残差的加性决策树模型'],
        ],
      },
    ],
  },
  {
    branch: '无监督学习',
    modules: [
      {
        module: '聚类',
        leaves: [
          ['kmeans', 'K-Means', 'K-Means', '方法', '按距离把样本分到 K 个簇中心'],
          ['hclust', '层次聚类', 'Hierarchical Clustering', '方法', '自底向上合并或自顶向下分裂聚类'],
          ['dbscan', 'DBSCAN', 'DBSCAN', '方法', '按密度聚类，抗噪且不需预设簇数'],
        ],
      },
      {
        module: '降维',
        leaves: [
          ['pca', '主成分分析', 'PCA', '方法', '找方差最大的正交方向压缩维度'],
          ['tsne', 't-SNE', 't-SNE', '方法', '非线性降维用于高维数据可视化'],
          ['ae', '自编码器', 'Autoencoder', '方法', '压缩再重建学习低维表示的神经网络'],
        ],
      },
    ],
  },
  {
    branch: '深度学习',
    modules: [
      {
        module: '神经网络基础',
        leaves: [
          ['perceptron', '感知机', 'Perceptron', '概念', '单层神经元二分类器'],
          ['mlp', '多层感知机', 'MLP', '概念', '含隐藏层的全连接前馈网络'],
          ['bp', '反向传播', 'Backpropagation', '方法', '链式法则逐层回传梯度'],
          ['act', '激活函数', 'Activation', '概念', '引入非线性的逐元素变换（ReLU 等）'],
        ],
      },
      {
        module: '卷积网络',
        leaves: [
          ['cnn', '卷积神经网络', 'CNN', '概念', '卷积+池化提取局部特征的网络族'],
          ['conv', '卷积层', 'Convolution', '方法', '滑动窗口共享权重提取特征'],
          ['pool', '池化', 'Pooling', '方法', '下采样降维提升平移不变性'],
        ],
      },
      {
        module: '序列与注意力',
        leaves: [
          ['rnn', '循环神经网络', 'RNN', '概念', '按时间步共享参数处理序列'],
          ['lstm', 'LSTM', 'LSTM', '概念', '门控机制缓解长程依赖的 RNN 变体'],
          ['attn', '注意力机制', 'Attention', '方法', '按相关性加权聚合上下文'],
          ['transformer', 'Transformer', 'Transformer', '概念', '纯注意力架构，大模型基石'],
        ],
      },
    ],
  },
  {
    branch: '训练与评估',
    modules: [
      {
        module: '模型泛化',
        leaves: [
          ['overfit', '过拟合', 'Overfitting', '概念', '拟合训练集噪声导致泛化差'],
          ['reg', '正则化', 'Regularization', '方法', '约束复杂度提升泛化（L1/L2/Dropout）'],
          ['dropout', 'Dropout', 'Dropout', '方法', '训练中随机丢弃神经元防过拟合'],
        ],
      },
      {
        module: '评估指标',
        leaves: [
          ['acc', '准确率', 'Accuracy', '概念', '预测正确的占比（类别不平衡时失真）'],
          ['pr', '精确率与召回率', 'Precision/Recall', '概念', '查准与查全的权衡'],
          ['f1', 'F1 分数', 'F1 Score', '概念', '精确率与召回率的调和平均'],
          ['auc', 'AUC', 'AUC-ROC', '概念', 'ROC 曲线下面积，排序能力指标'],
        ],
      },
      {
        module: '实验方法',
        leaves: [
          ['cv', '交叉验证', 'Cross Validation', '方法', '数据分折轮流训练验证稳定评估'],
          ['split', '训练/验证/测试划分', 'Data Split', '方法', '三集分离防信息泄漏'],
          ['hyp', '超参数调优', 'Hyperparameter Tuning', '方法', '网格/随机/贝叶斯搜索最优超参'],
        ],
      },
    ],
  },
]

/** 由紧凑表生成概念数组（group=模块名，便于回退树/图谱） */
function buildMlConcepts(): ConceptNode[] {
  const out: ConceptNode[] = []
  ML_GROUPS.forEach((g, bi) => {
    g.modules.forEach((m, mi) => {
      m.leaves.forEach(([suf, name, en, kind, desc], li) => {
        // 演示进度：数学基础分支 mastered，监督学习部分 learning，其余 todo
        let mastery: Mastery = 'todo'
        if (bi === 0) mastery = 'mastered'
        else if (bi === 1 && mi < 1) mastery = 'mastered'
        else if (bi === 1) mastery = 'learning'
        out.push({
          id: `ml-${suf}`,
          name,
          en,
          group: m.module,
          kind,
          desc,
          mastery,
        })
      })
    })
  })
  return out
}

const mlConcepts = buildMlConcepts()

// 演示：给个别概念挂讲义（一概念一讲义）
const mlLogit = mlConcepts.find(c => c.id === 'ml-logit')
if (mlLogit) mlLogit.lessonId = 'lesson-ml-logit'

/** ml 演示依赖边（学习顺序门控：先学前置） */
const mlRelations: RelationEdge[] = [
  { source: 'ml-vec', target: 'ml-linreg', type: '前置依赖' },
  { source: 'ml-gd', target: 'ml-linreg', type: '前置依赖' },
  { source: 'ml-linreg', target: 'ml-logit', type: '前置依赖' },
  { source: 'ml-tree', target: 'ml-rf', type: '前置依赖' },
  { source: 'ml-kmeans', target: 'ml-hclust', type: '前置依赖' },
]

/** 生成大纲树（分支 → 模块 → 概念） */
function buildMlTree(): KnowledgeTreeNode[] {
  return ML_GROUPS.map(g => ({
    id: `b-${g.branch}`,
    name: g.branch,
    children: g.modules.map(m => ({
      id: `m-${m.module}`,
      name: m.module,
      children: m.leaves.map(([suf, name]) => {
        const c = mlConcepts.find(x => x.id === `ml-${suf}`)!
        return { id: `c-${c.id}`, name: c.name, conceptId: c.id }
      }),
    })),
  }))
}

const mlTree = buildMlTree()

const mlTurns: ChatTurn[] = [
  { role: 'user', text: '为什么欠拟合时加数据没用，过拟合时才有用？' },
  {
    role: 'assistant',
    text: '欠拟合是模型容量不足（没学进去），加数据不改变容量；过拟合是容量过剩在背训练集，加更多数据/正则才有效——先分清是哪种再对症。\n\n> 依据：讲义《模型泛化》+ 知识库《ML 基础》。',
    sourceLabel: '讲义 + KB',
  },
]

/** ml 演示讲义（少量：演示"一概念一讲义 + 依赖门控"） */
const mlLessons: LessonDoc[] = [
  {
    id: 'lesson-ml-logit',
    conceptIds: ['ml-logit'],
    title: '逻辑回归',
    seq: 1,
    md: `# 逻辑回归（Logistic Regression）

**一句话**：给线性模型的输出加一层 Sigmoid，把实数压到 (0,1)，当作"属于某一类的概率"——从回归走向分类的关键一步。

## 从线性回归到分类

线性回归输出任意实数（预测价格/温度）；但"分类"要的是概率。Sigmoid 函数把 \`z = w·x + b\` 映射到 0~1：

\`\`\`mermaid
flowchart LR
  X[特征 x] --> L[线性组合 z = w·x+b]
  L --> S[Sigmoid σ(z)]
  S --> P[概率 p ∈ 0~1]
  P --> D{>0.5?}
  D -->|是| C1[类别 1]
  D -->|否| C2[类别 0]
\`\`\`

## 为什么输出能当概率

Sigmoid 是平滑、单调、有界的；配合**交叉熵损失**训练后，输出可以解释为类别概率（这也是它和平方损失的区别之一）。

## 前置检查

学它之前应先掌握：**线性回归**（输出的"线性组合"部分同源）——左侧知识地图中标 ✓ 即可解锁本概念。

## 自测

1. 为什么分类不用线性回归的平方损失，而用交叉熵？
2. 多分类（如 3 类）怎么从二分类扩展？`,
  },
]

// ===================================================================
// 全部主题 + 工具函数
// ===================================================================

export const demoSpaces: SpaceProject[] = [
  {
    id: 'rag',
    name: '检索增强生成（RAG）入门',
    goal: '看懂 RAG 系统原理，能动手调自己的知识库检索',
    tagline: '从文档切分到带出处的答案生成——系统学懂 RAG 全链路',
    goalLevel: '工作应用',
    concepts: ragConcepts,
    relations: ragRelations,
    lessons: ragLessons,
    turns: ragTurns,
  },
  {
    id: 'diffusion',
    name: '扩散模型（图像生成）原理',
    goal: '理解扩散模型加噪/去噪机制与工程加速手段',
    tagline: 'AI 图像/视频生成背后的核心机制入门',
    goalLevel: '入门',
    concepts: dmConcepts,
    relations: dmRelations,
    lessons: dmLessons,
    turns: dmTurns,
  },
  {
    id: 'fincompliance',
    name: '金融合规实务 · 反洗钱',
    goal: '建立反洗钱/客户尽调/合规报告的体系化认知',
    tagline: '法规要求如何落到机构操作——专业实务型领域示例',
    goalLevel: '工作应用',
    concepts: fcConcepts,
    relations: fcRelations,
    lessons: fcLessons,
    turns: fcTurns,
  },
  {
    id: 'llmfrontier',
    name: '大模型前沿 · 规模/对齐/推理',
    goal: '跟进大模型研究前沿：从规模定律到推理扩展',
    tagline: '论文驱动的快速演进型领域示例',
    goalLevel: '前沿',
    concepts: llmConcepts,
    relations: llmRelations,
    lessons: llmLessons,
    turns: llmTurns,
  },
  {
    id: 'ml',
    name: '机器学习 · 从基础到深度',
    goal: '建立从数学基础到深度学习的完整知识体系',
    tagline: '大规模多分支演示：5 大分支 14 模块 60+ 知识点',
    goalLevel: '入门',
    concepts: mlConcepts,
    relations: mlRelations,
    lessons: mlLessons,
    turns: mlTurns,
    tree: mlTree,
  },
]

// ===================================================================
// 块化知识卡片示例（content-template-design v2：essence_type + blocks）
// 给三个概念挂不同模板：lite(K-concept) / full(K-concept) / full(K-stmt)
// ===================================================================

/** 给指定空间的概念挂块化卡片（原型演示数据） */
function attachCard(spaceId: string, conceptId: string, card: ConceptCard): void {
  const space = demoSpaces.find(s => s.id === spaceId)
  const c = space?.concepts.find(x => x.id === conceptId)
  if (c) c.card = card
}

// —— K-concept · lite：重排（RAG；无 edge 之外的冗余区）——
attachCard('rag', 'rerank', {
  essenceType: 'K-concept',
  sections: [
    {
      key: 'essence',
      md: '重排（Rerank）是在召回后做的**精细二次排序**：召回求全、重排求准——把最可能被用户接受的片段顶到最前，再拼进上下文。',
    },
    {
      key: 'detail',
      md: '向量检索靠"语义距离"取 TopK，粗但快；重排用更强的**交叉编码器**对「问题 × 候选片段」逐对打分，精度高但慢，所以只对 Top50 候选做。',
    },
    {
      key: 'edge',
      md: '**✅ 正例**：召回 Top50 → 重排取 Top5，既覆盖相关片段又保证顺序正确。\n\n**⛔ 反例**：只取向量检索 Top5 直接上屏——"语义相似但不解决当前问题"的片段会挤掉真正答案。',
    },
    {
      key: 'review',
      md: '**自测**\n1. 为什么召回阶段要"宁多勿缺"，重排阶段才收窄？\n2. 交叉编码器更准，代价是什么？',
    },
  ],
})

// —— K-concept · full：混合专家 MoE（大模型前沿）——
attachCard('llmfrontier', 'moe', {
  essenceType: 'K-concept',
  works: [
    { kind: '论文', title: 'Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer', authors: 'Shazeer et al.', year: '2017' },
    { kind: '论文', title: 'Mixtral of Experts', authors: 'Jiang et al.', year: '2024' },
  ],
  sections: [
    {
      key: 'essence',
      md: '把稠密前馈层拆成多个"专家"，每个 token 只激活少数几个——**参数更多、单步计算不涨**。它是"容量接近大模型、成本接近小模型"的关键结构。',
    },
    {
      key: 'detail',
      md: `Mixture-of-Experts：FFN 层替换为 N 个并行专家子网络 + 一个路由器。输入 token 经门控打分取 top-k（如 2）个专家参与计算，未激活专家不占算力。

\`\`\`mermaid
flowchart LR
  X[token] --> R[Router]
  X --> E1[专家1]
  X --> E2[专家2]
  R -- top-2 --> E1
  R -- top-2 --> E2
  E1 --> O((加权和))
  E2 --> O
  O --> Y[输出]
\`\`\`

第 $i$ 个专家的门控概率为 softmax：

$$
p_i = \\frac{\\exp(z_i)}{\\sum_{j=1}^{N}\\exp(z_j)}, \\quad z_i = W_g x_i
$$

其中 $W_g$ 是路由器权重，$x$ 为输入 token；实际输出取前 $k$ 个专家的加权和。路由用辅助损失均衡各专家负载，防"赢家通吃"。`,
    },
    {
      key: 'edge',
      md: '**✅ 正例**：Mixtral 8x7B——8 专家每 token 激活 2，参数量近 47B 但单步成本接近 13B 稠密模型。\n\n**⛔ 反例**：小 batch 下稀疏不划算；路由失衡、通信开销会吃掉收益。\n\n**⚖️ 辨析**：Dense 全量激活、参数量中；**MoE** 稀疏激活、参数量大但单步 ≈ Dense；蒸馏则压缩容量换小模型。\n\n**⚠️ 易错**：误以为 MoE"并行跑所有专家"——实际是选 few 激活；参数量大 ≠ 推理慢（单步只看激活专家）。',
    },
    {
      key: 'review',
      md: '**出处与关联**：Dense Transformer → MoE 的演进分支；先掌握 Dense 架构再看本概念。\n\n**自测**\n1. 为什么加辅助损失控制负载均衡？\n2. 为什么选 top-2 而非 top-1？',
    },
  ],
})

// —— K-stmt · full：反洗钱法（金融合规）——
attachCard('fincompliance', 'law', {
  essenceType: 'K-stmt',
  works: [
    { kind: '法规', title: '《中华人民共和国反洗钱法》（2025 修订）', note: '2026-01-01 施行' },
    { kind: '标准', title: 'FATF 四十条建议（国际标准）', note: '反洗钱国际基线' },
  ],
  sections: [
    {
      key: 'essence',
      md: '《反洗钱法》是我国反洗钱义务的**法律源头**：规定金融机构识别客户、报告可疑交易的法定义务与罚则。',
    },
    {
      key: 'detail',
      folded: true,
      md: `**核心条款（2025 修订，2026-01-01 施行）**

- 金融机构应建立反洗钱内部控制制度，履行**客户尽职调查**义务；
- 发现**可疑交易**应当及时报告反洗钱监测分析中心；
- 特定非金融机构（贵金属交易、房地产等）纳入义务主体；
- 配套人行规章规定具体报送格式与时限。`,
    },
    {
      key: 'edge',
      md: '**✅ 适用**：开户时做 CDD、交易监测触发 STR、名单筛查拦截制裁对象。\n\n**⛔ 不适用**：本法律只管"义务与罚则"，不规定具体格式/时限（在人民银行配套规章）。\n\n**🚩 风险红线**：未识别客户 / 未报告可疑 → 机构与责任人双罚，情节严重可吊销牌照、人员禁业。\n\n**🗂️ 案例**：某外资银行因高风险客户未强化尽调、可疑监测失效被重罚。',
    },
    {
      key: 'review',
      md: '**出处**：2025 修订版，效力=法律，施行=2026-01-01。\n\n**自测**\n1. 2025 修订最大的两处变化？\n2. CDD 义务对应本法哪部分？',
    },
  ],
})

// —— K-stmt · full：贝叶斯定理（机器学习·数学，公式/证明演示）——
attachCard('ml', 'ml-bayes', {
  essenceType: 'K-stmt',
  works: [
    { kind: '论文', title: 'An Essay towards solving a Problem in the Doctrine of Chances', authors: 'Thomas Bayes', year: '1763' },
  ],
  sections: [
    {
      key: 'essence',
      title: '本质',
      style: 'intro',
      md: '贝叶斯定理：用**新证据更新对假设的信念**——已知 $P(\\text{证据})$ 与先验 $P(\\text{假设})$，反推假设在证据下的后验概率。',
    },
    {
      key: 'statement',
      title: '表述',
      style: 'body',
      md: '对事件 $A$（假设）与 $B$（证据），条件概率满足：\n\n$$\nP(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}\n$$\n\n其中 $P(A)$ 为先验、$P(A \\mid B)$ 为后验、$P(B \\mid A)$ 为似然、$P(B)$ 为证据的边际概率（归一化常数）。',
    },
    {
      key: 'justification',
      title: '推导依据',
      style: 'body',
      folded: true,
      md: '**推导**（由条件概率定义出发）：\n\n$$\nP(A \\mid B) = \\frac{P(A \\cap B)}{P(B)},\\quad P(B \\mid A) = \\frac{P(A \\cap B)}{P(A)}\n$$\n\n由第二式得 $P(A \\cap B) = P(B \\mid A)P(A)$，代回第一式即得定理。',
    },
    {
      key: 'edge',
      title: '示例与注意',
      style: 'note',
      md: '**✅ 正例**：某疾病检出阳性时，用先验患病率 $P(病)$ 与检测灵敏度/假阳率算真正的患病后验——直觉"检出阳性≈患病"常高估。\n\n**⚖️ 辨析**：$P(A\\mid B)$ 与 $P(B\\mid A)$ 极易混淆（如"检阳率" vs "患病率"）。\n\n**⚠️ 易错**：忘记 $P(B)$ 是全概率展开；先验选择主观时结果随之变。',
    },
    {
      key: 'review',
      title: '检验',
      style: 'review',
      md: '**出处与关联**：机器学习的朴素贝叶斯分类器、贝叶斯推断都建立在此式上；先掌握条件概率再看本概念。\n\n**自测**\n1. 写全 $P(B)$ 的全概率展开式。\n2. 为什么说先验 $P(A)$ 是"主观输入"？',
    },
  ],
})

/** 按 id 取主题 */
export function findSpace(id: string): SpaceProject | undefined {
  return demoSpaces.find(s => s.id === id)
}

/** 主题学习进度统计（列表卡片用） */
export function spaceStats(space: SpaceProject): { mastered: number; learning: number; todo: number; percent: number } {
  const mastered = space.concepts.filter(c => c.mastery === 'mastered').length
  const learning = space.concepts.filter(c => c.mastery === 'learning').length
  const todo = space.concepts.filter(c => c.mastery === 'todo').length
  const percent = Math.round((mastered / space.concepts.length) * 100)
  return { mastered, learning, todo, percent }
}

/** mermaid 节点 id 安全化（概念 id 已是 kebab 形式，转驼峰防歧义） */
function safeNodeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_')
}

/** 概念 → mermaid 节点标签（显示名 + 英文，纯文本避免 mermaid 渲染 html 标签问题） */
function nodeLabel(c: ConceptNode): string {
  return `${c.name}·${c.en}`
}

/**
 * 生成"知识体系全景图"的 mermaid 源码：
 * - 按概念分组做 subgraph；
 * - 节点按掌握度着色（mastered 绿 / learning 橙 / todo 灰）；
 * - 关系边带类型标签。
 */
export function buildKnowledgeGraphMermaid(space: SpaceProject): string {
  const groupOrder: string[] = []
  const groups = new Map<string, ConceptNode[]>()
  for (const c of space.concepts) {
    if (!groups.has(c.group)) {
      groups.set(c.group, [])
      groupOrder.push(c.group)
    }
    groups.get(c.group)!.push(c)
  }

  const lines: string[] = ['flowchart LR']
  lines.push('  classDef mastered fill:#e1f3d8,stroke:#67c23a,color:#1f5130')
  lines.push('  classDef learning fill:#fdf3e0,stroke:#e6a23c,color:#7a4d00')
  lines.push('  classDef todo fill:#f4f4f5,stroke:#a8abb2,color:#606266')

  for (const g of groupOrder) {
    const cs = groups.get(g)!
    lines.push(`  subgraph sg_${safeNodeId(g)}["${g}"]`)
    for (const c of cs) {
      lines.push(`    ${safeNodeId(c.id)}["${nodeLabel(c)}"]:::${c.mastery}`)
    }
    lines.push('  end')
  }

  for (const r of space.relations) {
    lines.push(`  ${safeNodeId(r.source)} -->|${r.type}| ${safeNodeId(r.target)}`)
  }

  return lines.join('\n')
}
