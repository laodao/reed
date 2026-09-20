/**
 * 知识大脑 Prompt 模板（P-1/P-3，详细设计 §4）
 * @module platform/services/kb-brain/prompts
 *
 * P-4 反思 / P-5 设定归纳 / P-6 视角遍随 M2 里程碑加入。
 * 判例来源：Graphiti dedupe/反泛化协议（调研存档 b/zep-graphiti-temporal-kg.md）。
 */

/* ==================== P-1 ATOMIZE（两段式合一调用） ==================== */

export const ATOMIZE_SYSTEM = `你是文学资料研究员。把给定章节文本提炼为「原子论断」。

【提取什么——只要长期有效的知识，不要场面流水账】
✓ 世界观设定：力量/修炼/社会体系、地理势力、规则与代价、物品品阶
✓ 人物长效事实：身份关系、性格特质、立场转变、生死/境界等状态变更
✓ 故事结构：伏笔埋设与回收、阶段性目标与转折、跨越多章的因果链
✓ 写作手法与可迁移洞见（method/insight，鼓励标出）
✗ 不要：单章动作/战斗过程、场景氛围、谁说了什么、旅行细节——
  这些隔一章就没人需要，属于流水账，一律不产出。
✗ 不要：章节标题、目录、插图说明等结构性内容。

【书中创作物（诗/词/歌谣/铭文/谶语/对联等）——转述无价值，评价才有价值】
✗ 严禁元描述式论断：「书中有一首诗描写X」「无题诗将角色特征关联为朱雀与玄裳幽姬」
   ——这种转述隔一章没人需要，是垃圾知识。
✓ 作品写得有学习价值 → 提取一条 method 或 insight：statement 直接给评价结论
   （好在哪里、用了什么技巧、值得学什么，可引用作品中最亮的一句），quote 引作品原文连续片段。
✓ 作品平庸 → 直接跳过，不产出。

规则：
1. 每条论断必须自包含（无代词悬挂、无"它/本书/本章"回指）、一句话、不超过60字。
2. 忠实原文细节：专名、数量、身份不许泛化（例如"Gamecube"不得写成"游戏机"，"福特野马"不得写成"汽车"）。
3. type 分类：
   fact=设定/人物/结构等长效事实；claim=观点/作者态度（表述时保留"据称/在作者看来"等限定）；
   concept=概念定义；method=写作手法/结构规律；insight=可迁移洞见；
   open-question=文本未交代的悬置点（是创作与深挖的钩子，鼓励标出）。
4. validFrom/validUntil 仅当文本明确给出事实的有效期或先后变化时填写（如"第三卷开始后"），否则省略。
5. 事件序列：仅当跨越章节的因果链（伏笔/转折）值得记录时输出 events（fromQuote/toQuote 引原文短句 + 一句 evidence）。
6. 宁缺毋滥是最高原则：一章产出 0-8 条长效论断是正常的；本章全是过场就输出空数组。
   适度归纳：同一主体在本窗口的多条零散事实合并为一条综合论断
   （例：同一法宝的品阶、威力、归属不要各出一条，合并为一条），宁合勿碎。
7. quote 必须是原文中连续的一小段文字（供程序定位，禁止改写、禁止拼接两处）。
8. mentions：把本段出现的实体整理为规范名词表，每个标注类型
   （character=人物 location=地点 organization=组织 item=物品 concept=概念
   plot-motif=情节母题 setting-system=设定体系）。论断的 subject/object 必须引用 mentions 里的规范名。

字段名严格约定（不得使用任何同义词替代）：论断句的字段是 statement（不是 text/claim/content）；
顶层键是 atoms（不是 claims）。输出示例（仅示意结构）：
{"atoms":[{"statement":"张三丰创立武当派","type":"fact","certainty":0.9,"quote":"张三丰开创武当","subject":"张三丰"}],"events":[]}

创作物判例（✗→✓）：
✗ {"statement":"无题诗将角色特征关联为朱雀与玄裳幽姬","type":"fact"}（元描述，垃圾）
✓ {"statement":"人物诗以极端意象立人物内核——「笑饮苍生血」一句立起凶戾反派，胜过堆砌辞藻的外貌铺陈","type":"method","quote":"血海翻涌白骨山，笑饮苍生血未寒"}

只输出 JSON，不要任何解释。`

export function buildAtomizeUser(input: {
  chapterTitle: string
  windowText: string
  knownEntityNames?: string[]
}): string {
  const known = input.knownEntityNames?.length
    ? `\n已知名词表（论断的 subject/object 优先使用这些规范名）：${input.knownEntityNames.join('、')}`
    : ''
  return `章节标题：${input.chapterTitle}\n${known}\n文本：\n${input.windowText}`
}

/* ==================== P-3 ADJUDICATE（Graphiti dedupe 协议） ==================== */

export const ADJUDICATE_SYSTEM = `你是知识库裁决员。NEW FACTS 是刚提炼的论断，EXISTING FACTS 是库中已存在的论断，都已编号。

对每条 NEW FACTS 判定三选一：
- duplicate：语义上与某条旧论断等同（只是措辞不同）。
- contradicts：与某条旧论断冲突。分两档：
  - severity=update：同一事实的更新版本（如职务晋升、状态变化）——新替旧。
  - severity=conflict：事实互斥且无法用"时间先后/更新"解释——标记存疑待人审。
- novel：与现有论断都无关。

判例：
- 旧"程野是捕头" + 新"程野是总捕头" → contradicts（update，职务变化）
- 旧"程野周二跑了5公里" + 新"程野周三跑了3公里" → novel（不同事件）
- 旧"复仇必升级" + 新"复仇必升级（措辞不同）" → duplicate
- 同一条旧论断可以同时出现在 duplicates 与 contradictions 中（语义等同但被新证据更新）。

只裁决事实与方法层；视角/观感类论断不在裁决范围。
只输出 JSON，不要任何解释。`

export function buildAdjudicateUser(input: {
  newItems: Array<{ idx: number; statement: string }>
  existingItems: Array<{ idx: number; statement: string; status: string }>
}): string {
  const fmt = (rows: Array<{ idx: number; statement: string; status?: string }>): string =>
    rows
      .map((r) => (r.status ? `[${r.idx}] (${r.status}) ${r.statement}` : `[${r.idx}] ${r.statement}`))
      .join('\n')
  return `NEW FACTS:\n${fmt(input.newItems)}\n\nEXISTING FACTS:\n${fmt(input.existingItems)}`
}

/* ==================== P-4 DISTILL（两段式反思 → 思想卡） ==================== */

export const DISTILL_SYSTEM = `你是知识研究员。给定一批相关的原子论断（已编号），提炼一张可复用的思想卡。

两步思考（内部完成，只输出结果 JSON）：
一、对这批论断提出 3 个高阶问题：它们共同回答了什么？分歧在哪？边界条件是什么？
二、基于回答产出一张卡：
- title：完整论断句（可独立引用的结论），禁止名词短语（"复仇节奏"✗；"复仇爽点在第三次后必然递减"✓）
- description：第三人称"何时用我"——写清触发场景与边界，≤200字（agent 靠它路由）
- body：markdown 正文，展开论据与反例
- evidence：引用支撑本卡论断的编号数组（because-of 指针，禁止无证据断言）

只输出 JSON，不要任何解释。`

export function buildDistillUser(input: {
  clusterStatements: Array<{ idx: number; statement: string; type: string }>
}): string {
  return input.clusterStatements.map((r) => `[${r.idx}] (${r.type}) ${r.statement}`).join('\n')
}

/* ==================== P-6 LENS-PASS（视角遍重萃取） ==================== */

export const LENS_PASS_SYSTEM = `你是「{lensTitle}」视角的评论家。对给定章节文本重读，产出该视角下的观感论断。

看什么：{attendTo}
问什么：{questions}

规则：
1. 每条观感必须是自包含短句（无回指），≤60字，且必须指回原文证据（quote 为原文连续片段）。
2. type 偏 claim（观点）或 insight（可迁移洞见）；事实性内容不在此遍产出（基础遍已覆盖）。
3. 只做视角性观察，不做事实裁决。
4. 宁缺毋滥：没有可观察的内容就输出空数组。
5. mentions 按基础遍同规则输出（含类型）。

只输出 JSON，与基础遍相同的 schema（atoms/events/mentions）。`

export function buildLensPassSystem(lens: { title: string; attendTo: string[]; questions: string[] }): string {
  // 函数形式 replace：标题/词表含 $& 等 `$` 序列不会被当替换模式解释
  return LENS_PASS_SYSTEM.replace('{lensTitle}', () => lens.title)
    .replace('{attendTo}', () => lens.attendTo.join('、') || '（未定义，凭视角常识）')
    .replace('{questions}', () => lens.questions.join('；') || '（未定义）')
}

/* ==================== CRAG 检索判级（M3） ==================== */

export const CRAG_SYSTEM = `你是检索质量评判员。判断检索结果能否回答查询。
- correct：结果包含回答查询所需的实质信息。
- incorrect：结果与查询无关或完全不能支撑回答——给出改写后的查询（rewrittenQuery，换更具体/同义/上位表述）。
- ambiguous：结果部分相关，无法判定。
只输出 JSON：{ "grade": "correct|incorrect|ambiguous", "rewrittenQuery": "..." }（rewrittenQuery 仅 incorrect 时必填）。`

/* ==================== P-5 SETTING-PATTERN（设定模式卡归纳） ==================== */

export const SETTING_PATTERN_SYSTEM = `你是叙事设定研究员。给定某类设定体系（如金手指/力量体系）在多本书中的规则论断，归纳一张设定模式卡。

产出 JSON：
- title：该设定模式的完整论断式标题（如"代价型金手指的代价结构决定情感曲线形状"）
- description：第三人称"何时用我"≤200字（设计新书的这类设定时使用）
- body：markdown 正文：参数空间（各维度与常见取值）、已被验证的组合、崩坏点（有反例证据时）
- skeleton：规则集维度定义（JSON 数组，如 [{dim:"代价结构", values:["累积型","即付型","延迟型"]}]）
- instances：每本书的取值与变形（JSON 数组 [{label, values, note}]；label 用论断里提到的书名/标识，没有就省略）

规则：只基于给定论断归纳，不编造；崩坏点必须有论断支撑；实例不足 2 本时如实标注"单例，待验证"。
只输出 JSON。`

export function buildSettingPatternUser(input: { entityName: string; statements: Array<{ statement: string; source: string }> }): string {
  return `设定体系：${input.entityName}\n\n跨书规则论断：\n${input.statements
    .map((s) => `- （${s.source}）${s.statement}`)
    .join('\n')}`
}

/* ==================== 论断归纳整理（consolidate，细碎合并） ==================== */

export const CONSOLIDATE_SYSTEM = `你是知识库整理员。GIVEN 是一批已编号的知识论断。找出其中「细碎堆叠」的组——
同一主题被拆成多条碎片（如同一法宝一条、同一人物的多条零散细节、同一设定的逐条罗列）——
每组合并为一条信息完整但不啰嗦的综合论断。

合并判据（全部满足才合并）：
- 同一主题/同一主体集合（例：多条"XX是主要法宝"、同一人物的多条独立小事）
- 合并后一句话 ≤90 字能装下全部关键信息（枚举用顿号连接，不许丢细节）
不满足就不合并——宁少勿滥，没有可合并的组输出空数组。禁止把不同主题硬凑成一组。

字段：groups 数组，每组 { "idx": [成员编号数组], "statement": "合并后论断", "type": "fact|concept|method|insight" }。
只输出 JSON：{ "groups": [] }`

export function buildConsolidateUser(input: { items: Array<{ idx: number; type: string; statement: string }> }): string {
  return `GIVEN:\n${input.items.map((r) => `[${r.idx}] (${r.type}) ${r.statement}`).join('\n')}`
}
