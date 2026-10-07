/**
 * 知识大脑 Prompt 模板（P-1/P-3，详细设计 §4）
 * @module platform/services/kb-brain/prompts
 *
 * P-4 反思 / P-5 设定归纳 / P-6 视角遍随 M2 里程碑加入。
 * 判例来源：Graphiti dedupe/反泛化协议（调研存档 b/zep-graphiti-temporal-kg.md）。
 */

/* ==================== P-1 ATOMIZE（两段式合一调用；按内容画像出变体） ==================== */

/**
 * 共享：知识分层标注段（三体裁变体共用）。
 * 分层是查询端按意图选层与书级汇总取材的依据（outline=概要/setting=设定/describe=描写/detail=细节）。
 */
const ATOMIZE_LAYER_SECTION = `【知识分层——每条论断必须带 layer 字段】
outline=概要层：全书/全篇级"一句话说清"的知识——主线梗概、结构骨架、核心主题
setting=设定层：让体系运转的关键规则——世界观/力量/制度设定（小说）、定理框架与方法论主干（知识类）、制度与时代背景（文史）
describe=描写层：人物/地点/物品/组织的标志性经典描述、典型案例与经典段落
detail=细节层：其余长效细节（缺省兜底——分不清层级就标 detail，宁低勿高）`

/** 共享：规则 1-9 + 字段约定 + 输出示例（三体裁变体共用，防分叉） */
const ATOMIZE_RULES = `规则：
1. 每条论断必须自包含（无代词悬挂、无"它/本书/本章"回指）、聚焦一个主题；篇幅不设硬性上限——
   一句话能讲清就短，需要一段话才能讲完整就写成一段，完整性优先于简短。
2. 忠实原文细节：专名、数量、身份不许泛化（例如"Gamecube"不得写成"游戏机"，"福特野马"不得写成"汽车"）。
3. type 分类：
   fact=设定/人物/结构等长效事实；claim=观点/作者态度（表述时保留"据称/在作者看来"等限定）；
   concept=概念定义；method=写作手法/结构规律；insight=可迁移洞见；
   open-question=文本未交代的悬置点（是创作与深挖的钩子，鼓励标出）。
4. layer 分类：按【知识分层】给每条论断标注 outline/setting/describe/detail，必填。
5. validFrom/validUntil 仅当文本明确给出事实的有效期或先后变化时填写（如"第三卷开始后"），否则省略。
6. 事件序列：仅当跨越章节的因果链（伏笔/转折）值得记录时输出 events（fromQuote/toQuote 引原文短句 + 一句 evidence）。
7. 宁缺毋滥是最高原则：一章产出 0-8 条长效论断是正常的；本章全是过场就输出空数组。
   主题级归纳优先：同一主题下的并列信息——同类物品/事物清单、同一组织的成员构成、
   同一地点的布局、同一人物的多项属性、同一体系的分段规则——必须合并为一条综合论断，
   用一段话讲完整；禁止把同一主题拆成多条碎片逐条罗列。
8. quote 必须是原文中连续的一小段文字（供程序定位，禁止改写、禁止拼接两处）。
9. mentions：把本段出现的实体整理为规范名词表，每个标注类型
   （character=人物 location=地点 organization=组织 item=物品 concept=概念
   plot-motif=情节母题 setting-system=设定体系）。论断的 subject/object 必须引用 mentions 里的规范名。

字段名严格约定（不得使用任何同义词替代）：论断句的字段是 statement（不是 text/claim/content）；
顶层键是 atoms（不是 claims）；分层字段是 layer。输出示例（仅示意结构）：
{"atoms":[{"statement":"张三丰创立武当派","type":"fact","layer":"setting","certainty":0.9,"quote":"张三丰开创武当","subject":"张三丰"}],"events":[]}

只输出 JSON，不要任何解释。`

/** 小说/叙事类变体（默认；历史遗留导出名，行为=buildAtomizeSystem('novel')） */
export const ATOMIZE_SYSTEM = `你是文学资料研究员。把给定章节文本提炼为「原子论断」。论断是可复用的知识，不是剧情记录。

【提取什么——只提取对写作者长期有用的知识】
✓ 世界观设定：力量/修炼/社会体系、地理势力、规则与代价、物品品阶
✓ 人物长效事实：身份关系、性格特质、立场转变、生死/境界等状态变更——
  只写"此后一直有效"的单点结论（如"某人已叛出师门"），不携带前后情节链
✓ 伏笔与悬置点：文本埋下但未交代、后续必然要回收的钩子（open-question，鼓励标出）——
  只登记"有什么悬而未决"，不叙述事件经过
✓ 写作手法与可迁移洞见（method/insight，鼓励标出）——跨章规律写成
  "每次X必伴随Y"的规律形式，不写成"某次情节里发生了X"
✗ 【最高禁令】剧情梗概/事件链复述：用叙事串联"发生了什么"——
  "某人失踪，引发门中风波，直至某人求情才作罢"、"某人隐瞒突破实情被
  逼检查，对方不满"这类情节复述，无论是否跨章、无论在书里多重要，
  一律不产出。剧情是章节摘要的职责，不是知识。
✗ 场景级互动细节：谁对谁说了什么、谁的神色与反应、谁试探/隐瞒/逼问了什么——
  这些隔一章就没人需要。
✗ 单章动作/战斗过程、场景氛围、旅行细节。
✗ 章节标题、目录、插图说明等结构性内容。

【产出前自检（每条都过一遍，不通过就不产出）】
剥离本书情节后，一个想学这本书设定与体系的写作者还需要这条吗？
——"知道后续剧情"才有意义的：不产出；与具体情节无关、描述世界如何运转或人物长期状态的：产出。

【书中创作物（诗/词/歌谣/铭文/谶语/对联等）——转述无价值，评价才有价值】
✗ 严禁元描述式论断：「书中有一首诗描写X」「无题诗将角色特征关联为朱雀与玄裳幽姬」
   ——这种转述隔一章没人需要，是垃圾知识。
✓ 作品写得有学习价值 → 提取一条 method 或 insight：statement 直接给评价结论
   （好在哪里、用了什么技巧、值得学什么，可引用作品中最亮的一句），quote 引作品原文连续片段。
✓ 作品平庸 → 直接跳过，不产出。

${ATOMIZE_LAYER_SECTION}

${ATOMIZE_RULES}

创作物判例（✗→✓）：
✗ {"statement":"无题诗将角色特征关联为朱雀与玄裳幽姬","type":"fact"}（元描述，垃圾）
✓ {"statement":"人物诗以极端意象立人物内核——「笑饮苍生血」一句立起凶戾反派，胜过堆砌辞藻的外貌铺陈","type":"method","quote":"血海翻涌白骨山，笑饮苍生血未寒"}

剧情复述判例（✗→✓）：
✗ {"statement":"王某练成某功第三层后突然失踪，留书出走闯江湖，此事引发门中风波，直至李长老出面求情才未牵连其亲友","type":"fact"}（剧情梗概——多段情节的叙事链，是章节摘要不是知识）
✓ {"statement":"王某已离门出走，去向不明","type":"fact"}（状态单点——只留此后有效的结论）
✗ {"statement":"韩姓弟子隐瞒突破至第四层的实情，谎称进度无变化，其师不满并强行扣脉检查","type":"fact"}（场景互动复述——谁说了什么谁反应了什么）
✓ {"statement":"以把脉探查弟子真实修炼进度是宗门师长的常用核查手段","type":"fact"}（机制单点——剥离情节仍有效；若无长期意义则直接不产出）

【故事轨·场面事件（scenes）——剧情不进论断，但场面另行登记】
上述禁令只针对 atoms。同一文本里"发生了什么"是归纳写作套路的原料，走 scenes 轨登记（与 atoms/events 并列的顶层键）：
✓ 每个独立场面一条：summary=一句话场面概括（谁在什么局面下做了什么）；
  sceneType 枚举：conflict=冲突对峙 battle=打斗战斗 breakthrough=突破晋级 deal=交易交换
  probe=试探博弈 emotion=情感关系 chase=追逃奔行 scheme=谋划布局 reveal=揭秘反转 daily=日常过渡，判不准用 other；
  participants=参与者名字数组（优先用 mentions 里的规范名）；cause=前因一句话、outcome=结果一句话（无则省略）；
  quote=场面中最有代表性的一句原文（连续片段，禁止改写拼接）。
✓ 一章 0-12 个场面正常，纯过场章输出空数组；优先登记冲突/试探/突破/反转类场面。
✗ 不登记：无参与者的环境描写、重复性动作流水账、跨章的长篇情节串联（场面=章内单一时空的互动单元）。

只输出 JSON，不要任何解释。`

/** 知识类变体（科学/技术/教程/百科/商业） */
export const ATOMIZE_SYSTEM_KNOWLEDGE = `你是知识资料研究员。把给定章节文本提炼为「原子论断」。

【提取什么——只要长期有效的知识，不要过程性内容】
✓ 知识体系：学科的框架结构、分支脉络、全书组织逻辑
✓ 核心概念：定义、内涵与边界、概念间的关系
✓ 关键知识点：定理/公式/结论、事实数据、重要参数与指标
✓ 方法与步骤：可复用的操作方法、流程、最佳实践（method，鼓励标出）
✓ 证据与论证：支撑关键结论的实验/数据/推理链
✓ 常见误区与反例（insight，鼓励标出）
✗ 不要：目录复述、章节导航、练习题/作业、寒暄过渡、致谢与版本说明。

${ATOMIZE_LAYER_SECTION}

${ATOMIZE_RULES}`

/** 文史哲类变体（历史/传记/思想/评论） */
export const ATOMIZE_SYSTEM_HISTORY = `你是文史资料研究员。把给定章节文本提炼为「原子论断」。

【提取什么——只要长期有效的知识，不要修辞性复述】
✓ 关键事件：时间、地点、参与者、经过与结果（自包含：写清"何时何地谁做了什么"）
✓ 人物与群体：身份、立场、主张、相互关系、命运转变
✓ 思想观点：各家主张、论据、流派分歧（claim，保留"作者认为/据记载"限定）
✓ 制度与背景：典章制度、经济与社会结构、时代背景
✓ 因果与影响：事件间的因果链、后续影响、历史评价的演变
✓ 写法与洞见：作者的史观、论证手法、可迁移的评价框架（method/insight，鼓励标出）
✗ 不要：逐段复述、文学性铺陈、行文溢美、目录与注释编号。

${ATOMIZE_LAYER_SECTION}

${ATOMIZE_RULES}`

/** 按内容画像选提取提示词（''/未识别 → 小说变体兜底，与历史行为一致） */
export function buildAtomizeSystem(contentType?: string): string {
  if (contentType === 'knowledge') return ATOMIZE_SYSTEM_KNOWLEDGE
  if (contentType === 'history') return ATOMIZE_SYSTEM_HISTORY
  return ATOMIZE_SYSTEM
}

/* ---------- 内容画像检测（类型自动识别，一次调用） ---------- */

export const PROFILE_SYSTEM = `你是书籍类型分析师。根据给出的书籍片段，判断这本书的内容类型。

输出 JSON：
{ "contentType": "novel|knowledge|history|other", "genre": "体裁细标（如：修真、玄幻、悬疑、科幻、编程、明清史；判不出给空串）" }

novel=小说/叙事类（含网文、故事集）；knowledge=知识类（科学、技术、教程、百科、商业）；
history=文史哲类（历史、传记、思想、文学评论）；other=以上都不是。
按主体内容判断而不是个别片段：历史演义小说按 novel，技术小说按 novel，人物传记按 history。
只输出 JSON，不要任何解释。`

export function buildProfileUser(samples: string[]): string {
  return `书籍片段（来自不同章节）：\n${samples.join('\n----\n')}`
}

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

/* ==================== 场面事件补采（v2 P0 存量回填：events-only） ==================== */

/**
 * 存量章补采专用（不带 atoms 指令——那批章的论断已入库且成本已付，只补场面原料）。
 * 输出与 ATOMIZE 的 scenes 轨同构；mentions 供参与者实体解析。
 */
export const SCENE_BACKFILL_SYSTEM = `你是小说场面记录员。把给定章节文本拆解为「场面事件」清单——供后续归纳写作套路使用的原料，不是给人读的章节摘要。

【场面怎么切】
✓ 一个场面=同一时空内、围绕一个目的或冲突的一整段互动（试探、谈判、打斗、突破、揭秘……）；
  按互动单元切，不按段落切、不按对话轮切。
✓ 每个场面一条：
  summary=一句话概括（谁在什么局面下做了什么）；
  sceneType 枚举：conflict=冲突对峙 battle=打斗战斗 breakthrough=突破晋级 deal=交易交换
  probe=试探博弈 emotion=情感关系 chase=追逃奔行 scheme=谋划布局 reveal=揭秘反转 daily=日常过渡，判不准 other；
  participants=参与者名字数组（优先使用已知名词表里的规范名）；
  cause=前因一句话；outcome=结果一句话（无则省略）；
  quote=场面中最有代表性的一句原文（连续片段，禁止改写拼接）。

【纪律】
- 一章 0-12 个场面正常，纯过场章输出空数组。
- 概括用白描，不评价文笔，不复述对话全文。
- 宁可粗粒度也不要碎片化：几句话的小摩擦并入它所属的大场面。

输出 JSON（scenes 与 mentions 两个顶层键）：
{"scenes":[{"summary":"李长老借把脉当众核查弟子隐瞒的修为","sceneType":"probe","participants":["李长老","韩某"],"cause":"韩某谎报修炼进度","outcome":"真实进度暴露，师徒生隙","quote":"李长老扣住他的手腕，眉头渐渐锁紧"}],"mentions":[{"name":"李长老","type":"character"},{"name":"韩某","type":"character"}]}

只输出 JSON，不要任何解释。`

export function buildSceneBackfillUser(input: {
  chapterTitle: string
  windowText: string
  knownEntityNames?: string[]
}): string {
  const known = input.knownEntityNames?.length
    ? `\n已知名词表（participants 优先使用这些规范名）：${input.knownEntityNames.join('、')}`
    : ''
  return `章节标题：${input.chapterTitle}\n${known}\n文本：\n${input.windowText}`
}

/* ==================== 滚动阅读（P1：全书工作记忆） ==================== */

/**
 * 全书精读员：按批通读，每批携带此前批次的积累理解（工作记忆），增量合并更新。
 * 这是「滚动式阅读理解」产线的核心提示——记忆是结构化 markdown，固定段落标题。
 */
export const ROLLING_READING_SYSTEM = `你是全书精读员。正在按批通读一本书：每批你会看到【当前工作记忆】（此前批次的积累理解）和一批章节正文。任务：把本批章节的新信息合并进工作记忆，输出更新后的完整工作记忆。

【输出 JSON：{"memory":"<更新后的完整工作记忆 markdown>"}】

【工作记忆的固定结构（用这些标题，顺序不变）】
## 卷册结构
（各卷章号范围与主题一句话）
## 世界设定
（修炼/力量体系、地理势力、规则与代价；每条带首见章号）
## 人物档案
（每个重要人物一小节：身份、性格、当前状态、人际关系；状态以最新章节为准）
## 情节进展
（按卷/阶段分段的事件链：谁做了什么、导致什么，带章号）
## 关键要素
（法宝/地点/组织：是什么、在谁手里、有什么作用，带章号）
## 伏笔与悬念
（已埋设未回收的：内容 + 埋设章号）
## 存疑与待澄清
（前后矛盾、看不懂、疑似伏笔的悬置点）

【纪律】
1. 更新而非重写：未受本批影响的段落原样保留，不许删改此前批次已确立的结论。
2. 出处必带：每条信息标注（第N章），N 用章节标题里的编号。
3. 忠实原文：不编造、不推测。本批内容与记忆冲突时，以晚出的章节为准更新，并在「存疑与待澄清」记一句演变说明。
4. 人物状态以最新为准：境界提升、死亡、立场变化覆盖旧状态，旧状态压缩成一句挪进「情节进展」。
5. 总量控制在 8000 字以内：超限时优先压缩「情节进展」最早段落的细节（概括化），人物档案的每个主要人物一节都不能删。
6. 忠实正文，读不懂就进「存疑与待澄清」，不要脑补。

只输出 JSON，不要任何解释。`

export function buildRollingReadingUser(input: {
  bookMeta: string
  memory: string
  chapters: Array<{ label: string; text: string }>
}): string {
  const body = input.chapters.map(c => `【${c.label}】\n${c.text}`).join('\n\n')
  return `【书况】${input.bookMeta}

【当前工作记忆（此前批次的积累理解，在此基础上合并更新）】
${input.memory || '（空——这是第一批，从零建立工作记忆）'}

【本批章节正文】
${body}

请输出合并本批内容后的完整工作记忆（JSON：{"memory": "..."}）。`
}

/* ==================== 冶炼层（v2 P1：套路归纳/原理/案例拆解/品类认知） ==================== */

/**
 * 套路归纳：同一 sceneType 的同型场面簇 → 可复用套路卡。
 * 输入是场面实例清单（带跨书分布），输出带骨架/变体/边界/为什么有效的完整卡体。
 * 模型可主动 skip（簇内异质无法参数化）。
 */
export const INDUCE_PATTERN_SYSTEM = `你是写作套路研究员。给定一组同类型的小说场面实例（来自多本书、按内容相似聚类），归纳出一个可复用的「场面套路」。

要求：
- 骨架（steps）：把这类场面拆成 3-6 个可复制的阶段，每阶段一句话（做什么、起什么作用）；
- variants：常见变体至少 2 个（每种一句话点出与主形态的差异）；
- why：为什么有效（读者心理/叙事机制，1-2 句，要讲机制不要复述情节）；
- boundary：什么情况下不该用（1-2 句）；
- whenToUse：写作者在什么场景需要这个套路（第三人称 ≤120 字，含触发场景与边界——供 agent 路由）；
- confidence：0-1，对「这些实例确实共享同一套路」的把握。
- 簇内实例其实不同质、无法归纳成一个套路时：输出 {"skip":true,"reason":"…"}，不要硬编。

输出 JSON：
{"title":"「师长核查弟子隐瞒」场面套路","whenToUse":"…","steps":["…","…"],"variants":["…","…"],"why":"…","boundary":"…","confidence":0.85}

只输出 JSON，不要任何解释。`

export function buildInducePatternUser(input: {
  sceneType: string
  scenes: Array<{ summary: string; participants?: string[]; cause?: string | null; outcome?: string | null; doc: string }>
}): string {
  const lines = input.scenes.map(
    (s, i) =>
      `[${i}] ${s.summary}${s.participants?.length ? `（${s.participants.join('、')}）` : ''}${s.cause ? `｜前因：${s.cause}` : ''}${s.outcome ? `｜结果：${s.outcome}` : ''}｜出自:${s.doc}`,
  )
  return `场面类型：${input.sceneType}\n同类场面实例（${input.scenes.length} 个，跨书聚类）：\n${lines.join('\n')}\n\n请归纳套路。`
}

/** 案例拆解：单个经典场面 → 拆解卡（好在哪/学什么/原文） */
export const CASE_STUDY_SYSTEM = `你是写作教练。给定一个小说场面（概括+原文片段），做「案例拆解」：这个场面为什么成立、用了什么技巧、写作者能学走什么。

要求：拆的是可迁移的写法（结构/节奏/信息控制/情感铺垫），不是读后感；引用原文时直接指出是哪个技巧的例证。
- 如果这个场面平庸、无可拆解之处：输出 {"skip":true,"reason":"…"}。

输出 JSON：
{"title":"案例：试探场面的信息差控制——李长老把脉核查","whatWorks":"…（2-3 点，每点讲机制）","learn":"…（写作者具体能复用的 1-2 条）","quoteFocus":"…（最值得细读的一句原文）","quality":0.8}

只输出 JSON，不要任何解释。`

export function buildCaseStudyUser(input: {
  sceneType: string
  summary: string
  cause?: string | null
  outcome?: string | null
  quote: string
  doc: string
}): string {
  return `场面类型：${input.sceneType}\n场面概括：${input.summary}\n前因：${input.cause ?? '—'}\n结果：${input.outcome ?? '—'}\n原文片段：${input.quote}\n出自：${input.doc}\n\n请拆解。`
}

/** 原理归纳：一组同域套路卡 → 跨套路的写作原理（为什么有效/何时失效） */
export const INDUCE_PRINCIPLE_SYSTEM = `你是叙事理论研究员。给定一组已归纳的写作套路卡（同属场面/情节域），从中提炼更高一层的「写作原理」：这些套路共同指向什么叙事机制？

要求：
- principle：一句话陈述原理（可跨品类迁移的因果规律，不是某套路的描述）；
- mechanism：原理背后的机制（读者心理/信息结构，2-3 句）；
- whenFails：原理何时失效（边界条件，1-2 句）；
- 每条原理必须能链回至少 2 个给定套路（evidenceIdx 列出支撑套路的编号）；
- 套路间没有共同机制时：输出 {"skip":true,"reason":"…"}，不要硬编。

输出 JSON：
{"title":"期待感=间隔×代价——升级体系的节流阀","principle":"…","mechanism":"…","whenFails":"…","evidenceIdx":[0,2],"confidence":0.8}

只输出 JSON，不要任何解释。`

export function buildInducePrincipleUser(input: {
  patterns: Array<{ title: string; description: string; sceneType?: string }>
}): string {
  const lines = input.patterns.map(
    (p, i) => `[${i}] ${p.title}${p.sceneType ? `（${p.sceneType}）` : ''}\n    何时用：${p.description}`,
  )
  return `已有套路卡（${input.patterns.length} 张）：\n${lines.join('\n')}\n\n请提炼跨套路的写作原理。`
}

/** 品类认知：场面分布 + 套路清单 → 品类级读者期待/爽点/雷点（不依赖跨书实体对齐） */
export const GENRE_INSIGHT_SYSTEM = `你是网文品类研究者。给定一个书籍库的场面类型分布与已归纳套路清单，写出「品类认知」：写这个品类的书之前必须知道的读者心理。

要求输出三段（各 2-4 条，每条一句话+机制）：
- expectations：读者默认期待什么（不满足会弃书的契约）；
- payoffs：爽点机制怎么起效（心理来源）；
- pitfalls：常见雷点（写崩方式）。
基于给定数据归纳，不要编造数据里没有的品类结论；数据不足时明确说依据有限。

输出 JSON：
{"title":"品类认知：<据数据起名>","expectations":["…"],"payoffs":["…"],"pitfalls":["…"],"confidence":0.7}

只输出 JSON，不要任何解释。`

export function buildGenreInsightUser(input: {
  sceneDistribution: Array<{ sceneType: string; count: number; docCount: number }>
  topPatterns: Array<{ title: string; instances: number; docCount: number }>
  totalDocs: number
}): string {
  const dist = [...input.sceneDistribution]
    .sort((a, b) => b.count - a.count)
    .map((d) => `${d.sceneType}×${d.count}（覆盖 ${d.docCount} 本书）`)
    .join('、')
  const pats = input.topPatterns.map((p) => `- ${p.title}（${p.instances} 实例 / ${p.docCount} 本书）`).join('\n')
  return `库内共 ${input.totalDocs} 本书。\n场面类型分布：${dist}\n\n已归纳套路（按实例数）：\n${pats}\n\n请归纳品类认知。`
}

/* ==================== 品类库归并与变体矩阵（v2 P3） ==================== */

/**
 * 跨书实体归并裁决：同一类型桶内按名称/别名相似聚出的候选组，判「是否同一个
 * 品类级概念」。保守协议：拿不准就不并（过度合并已被证明损伤质量——宁重复勿错并）。
 */
export const ENTITY_MERGE_SYSTEM = `你是知识库实体消歧员。给定一组同类型的候选实体（名称/别名/类型/覆盖书数），判断哪些是同一个品类级概念的不同写法。

规则：
- 只把「确定无疑是同一概念」的归为一组（如「金丹期」与「金丹境界」）；
- 拿不准、可能是相关但不同概念的一律不并；
- 人物/地点类不在此列（本输入已过滤为概念/设定体系类）；
- 没有可并的输出 {"groups":[]}。

输出 JSON：
{"groups":[[0,2],[5,7]]}

只输出 JSON，不要任何解释。`

export function buildEntityMergeUser(input: {
  entityType: string
  candidates: Array<{ name: string; aliases: string[]; docCount: number }>
}): string {
  const lines = input.candidates.map(
    (c, i) => `[${i}] ${c.name}${c.aliases.length ? `（别名：${c.aliases.slice(0, 5).join('、')}）` : ''}｜类型:${input.entityType}｜覆盖 ${c.docCount} 本书`,
  )
  return `候选实体（${input.candidates.length} 个，同类型已按相似聚类）：\n${lines.join('\n')}\n\n请给出可合并组。`
}

/** 设定变体矩阵：品类级概念在各书的表述 → 通用骨架 vs 各书变体（供设计自己的体系） */
export const SETTING_MATRIX_SYSTEM = `你是设定体系研究员。给定一个跨多本书共用的概念在各书的表述论断，产出「通用骨架 vs 各书变体」矩阵：写作者参考它设计自己的体系，不是抄任何一本书。

要求：
- skeleton：各书表述中共同的核心骨架（2-5 条，每条一句）；
- variants：各书的差异表述（每书一条：书代号 + 它的独特之处一句话）；
- designHint：写作者自建体系时的取舍建议（1-2 句）；
- 各书表述互相矛盾时如实登记差异，不要强行统一。

输出 JSON：
{"title":"设定体系：金丹期—通用骨架与各书变体","skeleton":["…"],"variants":[{"doc":"book-a","variant":"…"}],"designHint":"…","confidence":0.8}

只输出 JSON，不要任何解释。`

export function buildSettingMatrixUser(input: {
  concept: string
  perDoc: Array<{ doc: string; statements: string[] }>
}): string {
  const blocks = input.perDoc.map((d) => `【${d.doc}】\n${d.statements.map((s) => `- ${s}`).join('\n')}`)
  return `概念：${input.concept}\n各书表述：\n\n${blocks.join('\n\n')}\n\n请产出通用骨架 vs 变体矩阵。`
}

/* ==================== 抽样质检（v2 P4：judge 评分 → 质量门） ==================== */

/** 冶炼产物质检员：0-2 分制（2=可用/1=勉强/0=不合格），只判可用性不判文笔 */
export const QA_JUDGE_SYSTEM = `你是知识库质检员。给定一张 AI 归纳的写作知识卡（标题/说明/正文），按以下标准打分：

2 分：结构完整（有明确的骨架或要点）、内容自洽、有可用信息量——写作者拿到能用；
1 分：结构在但内容空泛/部分重复/信息量薄——勉强可用；
0 分：空洞、自相矛盾、明显幻觉（编造的频率/出处）、或纯粹复述没有归纳。

只依据卡片本身判可用性，不判文笔优劣、不要求完美。
输出 JSON：{"score":0,"reason":"一句话依据"}

只输出 JSON，不要任何解释。`

export function buildQaJudgeUser(input: { title: string; description: string; bodyExcerpt: string }): string {
  return `标题：${input.title}\n说明：${input.description}\n正文（节选）：\n${input.bodyExcerpt}`
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
6. 涉及全局的判断（如"本章在全书中的功能"）只能基于本章文本特征可推断的范围下结论，
   evidence 引句必须给出判断依据；推断不了的一律不产出。

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

/* ==================== P-7 CHARACTER-PATTERN（人物原型卡归纳，跨书聚类） ==================== */

export const CHARACTER_PATTERN_SYSTEM = `你是叙事人物研究员。给定跨书中被归为一簇的人物论断（已编号，括号内是来源标识），归纳一张人物原型卡。

产出 JSON：
- title：该原型的完整论断式标题（如"木讷坚韧型底层主角的缺陷社会化形态决定其关键抉择走向"）
- description：第三人称"何时用我"≤200字（设计新书的这类角色时使用）
- body：markdown 正文：五维骨架（欲望/缺陷/能力来路/关系位/弧线终点）、参数槽（可变维度与常见取值）、对照注记（同骨架异参数的书写差异）
- skeleton：五维骨架定义（JSON 数组，如 [{dim:"缺陷的社会化形态", values:["道德纯度型木讷","生存理性型多疑"]}]）
- instances：每本书的取值与变形（JSON 数组 [{label, values, note}]；label 用论断中提到的角色名/书名/来源标识）

规则：
1. 只基于给定论断归纳，不编造；实例不足 2 本时如实标注"单例，待验证"。
2. 簇内论断相互矛盾且无法参数化解释时，放弃出卡：输出 {"skip":true,"reason":"一句话"}。
只输出 JSON。`

export function buildCharacterPatternUser(input: { statements: Array<{ statement: string; source: string }> }): string {
  return `跨书人物论断簇：\n${input.statements.map((s) => `- （${s.source}）${s.statement}`).join('\n')}`
}

/* ==================== P-8 FORESHADOW（伏笔扫描：埋设-回收边提案） ==================== */

export const FORESHADOW_SYSTEM = `你是叙事结构研究员。SETUPS 是已编号的悬念/未交代问题（伏笔候选，括号内是其所在章号），PAYOFFS 是同一本书的知识论断（已编号，括号内是章号）。找出「埋设-回收」对：某条悬念在其后章节被兑现、解答或揭底。

判据（全部满足才算一对）：
- 回收与埋设指向同一具体对象（同一异物/同一事件/同一身份疑问），不是泛泛的主题相关；
- payoff 明确解答或兑现了悬念的内容（揭示来历/揭晓身份/兑现威胁）——仅复述或延伸悬念本身不算；
- 方向必须成立：payoff 的章号必须大于 setup 的章号（同章或更早不构成伏笔——程序会复核，不必报）。

判例：
- setup「古剑的来历未交代（第1章）」 + payoff「古剑为上古魔物残魂所铸（第12章）」 → 构成回收
- setup「某角色投敌动机不明（第5章）」 + payoff「该角色实力冠绝同辈（第9章）」 → 不构成（未解答动机）
- setup「神秘铁牌的用途（第3章）」 + payoff「铁牌是开启秘境的信物（第2章）」 → 不构成（方向反了）

输出 JSON：{ "links": [{ "setup": 编号, "payoff": 编号, "evidence": "为什么构成回收（一句话）" }] }
没有可确认的回收输出空数组。只输出 JSON。`

export function buildForeshadowUser(input: {
  setups: Array<{ idx: number; statement: string; chapterNo: number }>
  payoffs: Array<{ idx: number; statement: string; chapterNo: number }>
}): string {
  const fmt = (rows: Array<{ idx: number; statement: string; chapterNo: number }>): string =>
    rows.map((r) => `[${r.idx}]（第${r.chapterNo}章）${r.statement}`).join('\n')
  return `SETUPS（悬念）:\n${fmt(input.setups)}\n\nPAYOFFS（后文论断）:\n${fmt(input.payoffs)}`
}

/* ==================== 论断归纳整理（consolidate，细碎合并） ==================== */

export const CONSOLIDATE_SYSTEM = `你是知识库整理员。GIVEN 是一批已编号的知识论断。找出其中「细碎堆叠」的组——
同一主题被拆成多条碎片（如同一法宝一条、同一人物的多条零散细节、同一设定的逐条罗列）——
每组用一段话合并为一条信息完整的综合论断，篇幅服从完整性（可长达数句），但不啰嗦。

合并判据（全部满足才合并）：
- 同一主题/同一主体集合（例：多条"XX是主要法宝"、同一人物的多条独立小事）
- 关键信息能装进一条综合论断（枚举用顿号连接，不许丢细节）
不满足就不合并——宁少勿滥，没有可合并的组输出空数组。禁止把不同主题硬凑成一组。

字段：groups 数组，每组 { "idx": [成员编号数组], "statement": "合并后论断", "type": "fact|concept|method|insight" }。
只输出 JSON：{ "groups": [] }`

export function buildConsolidateUser(input: { items: Array<{ idx: number; type: string; statement: string }> }): string {
  return `GIVEN:\n${input.items.map((r) => `[${r.idx}] (${r.type}) ${r.statement}`).join('\n')}`
}

/* ==================== 存量垃圾论断清理（cleanup 分诊） ==================== */

export const CLEANUP_SYSTEM = `你是知识库质检员。GIVEN 是一批已编号的知识论断。找出其中确定无疑的「垃圾论断」——只标记有把握的，拿不准一律保留（宁漏勿杀）。

垃圾判定标准（四条都不符就保留）：
1. 元描述式：转述书中创作物（诗/词/铭文等）的内容而不含任何评价——
   如「某某在人物诗中创作了题为"无题"的诗」「无题诗将角色特征关联为X」。
   注意：含评价结论的不算（如"人物诗以极端意象立人物内核，值得学"要保留）。
2. 结构性残留：章节标题、目录条目、题记、插图/剧照说明、卷名。
3. 空洞重复：与同批另一条几乎逐字相同且信息量完全被其覆盖的条目（只标重复组中较差的一条）。
4. 剧情梗概/事件链复述：主体是叙事串联的多段情节——两个以上情节事件先后发生
   （"某人失踪引发门中风波，直至某人求情才未连累亲友"）、或场景互动反应链
   （"某人隐瞒突破实情被逼检查，对方不满"）。判据：把论断里的信息按时间线连起来
   读像一段"剧情简介"的就是。注意：单一状态结论（"某人已叛出师门"）、
   设定/规则/机制、手法与评价都不算——拿不准就保留（宁漏勿杀）。

输出 JSON：{ "junk": [垃圾条目编号数组] }。没有垃圾输出空数组。`

/* ==================== 存量论断分层补标（layer relabel） ==================== */

/**
 * 分层补标（老库迁移）：分层功能上线前的存量论断 layer 恒为 detail，
 * 分层筛选/书级设定索引取材全部落空——按论断内容补标四层。
 */
export const LAYER_RELABEL_SYSTEM = `你是知识库分层标注员。GIVEN 是一批已编号的知识论断，请给每条标注知识分层。

四层定义：
- outline=概要层：全书/全篇级"一句话说清"的知识——主线梗概、结构骨架、核心主题、跨卷的剧情走向
- setting=设定层：让体系运转的关键规则——世界观/力量/制度设定（修炼体系、境界、功法规则、地理势力格局、组织制度、物品品阶）、方法论主干
- describe=描写层：人物/地点/物品/组织的标志性经典描述、典型案例与经典段落（人物的长相气质、名场面的具体样貌）
- detail=细节层：其余长效细节（缺省兜底——分不清层级就标 detail，宁低勿高）

判据提示：写"世界如何运转"的是 setting；写"某人/某地是什么样"的是 describe；
概括全书/多卷走向的是 outline；说不清就 detail。

输出 JSON：{ "layers": [{ "idx": 编号, "layer": "outline|setting|describe|detail" }] }
每条输入都必须有对应输出，禁止编造编号。只输出 JSON。`

export function buildLayerRelabelUser(input: { items: Array<{ idx: number; type: string; statement: string }> }): string {
  return `GIVEN:\n${input.items.map((r) => `[${r.idx}] (${r.type}) ${r.statement}`).join('\n')}`
}

/* ==================== 书级汇总遍（book passes；输出 markdown 卡正文，非 JSON） ==================== */

export const BOOK_OUTLINE_MAP_SYSTEM = `你是书籍摘要员。给出某本书连续若干章的章节梗概，写一段 200-400 字的连贯批次梗概：只保留推动主线的情节或知识脉络，略去过场与重复；忠于给定内容，不编造。直接输出梗概正文，不要标题、不要解释。`

export const BOOK_OUTLINE_REDUCE_SYSTEM = `你是图书编辑。给定一本书的逐批梗概（或逐章梗概），写「全书概要」卡正文。

输出 markdown（不要用代码块包裹，不要写大标题）：
## 类型与流派
（1-2 句：类型/流派判定与题材标签，如「修真仙侠·成长流·悲剧内核」；只写给定梗概能支撑的判断，不要引用书外的评价性套话）
## 主线梗概
（300-600 字：从开头到结局的主线脉络，含关键转折；知识类书籍改为全书知识框架与论证主线）
## 结构骨架
（分卷/分段的结构划分，每段一行"范围——一句话"；知识类为篇章组织逻辑）
## 核心主题
（2-3 条：这本书真正在讲什么）

只基于给定梗概归纳，不编造情节或结论；不要输出奖项地位、市场声誉等出版宣传性内容。`

export const BOOK_SETTING_INDEX_SYSTEM = `你是设定集编纂员。给定一本书的设定层论断与设定体系实体摘要，编纂「设定索引」卡正文。

输出 markdown（不要用代码块包裹）：
## 体系与规则
（力量/修炼/社会等核心体系，每条一行"名称——规则要点"）
## 地理与势力
## 物品与资源
## 规则与代价
（限制、代价、制衡关系；暂无内容的类别写"（暂无）"）

要求：归类合并同类项，保留原文专名与数值；只基于给定论断，不编造。`

export const BOOK_ROSTER_SYSTEM = `你是人物册编纂员。给定主要人物的实体摘要与代表论断，编纂「人物册」卡正文。

输出 markdown（不要用代码块包裹）：每个人物一节——
## 人物名
（2-4 句：身份定位、性格特质、关键状态变化；只基于给定摘要与论断，不编造）

人物按给出顺序编排；给定的论断不足以支撑一节时并入"（待补）"。`

export const BOOK_FORESHADOW_SYSTEM = `你是情节档案员。给定一本书的悬置点论断（open-question，即文本未交代的伏笔/暗线/悬念），编纂「伏笔台账」卡正文。

输出 markdown 表格（不要用代码块包裹）：
| 伏笔/悬置点 | 涉及对象 | 状态 |
|---|---|---|
（每行一条；状态写"待回收"——除非论断本身已注明答案方向）

只登记给定论断，不推测答案；超过 30 条取前 30 条。没有悬置点就输出"（本书暂无登记的悬置点）"。`

export const BOOK_KNOWLEDGE_MAP_SYSTEM = `你是知识架构师。给定一本书的概要层/设定层论断与核心概念实体摘要，编纂「知识体系图」卡正文。

输出 markdown（不要用代码块包裹）：
## 学科框架
（全书知识体系的分支结构，层级列出）
## 核心概念
（每条一行"概念——一句话定义"）
## 关键结论
（定理/公式/方法要点）
## 学习路径
（按依赖关系给出阅读/学习顺序建议；仅当给定论断能支撑时写，否则写"（给定材料不足以排序）"）

只基于给定论断归纳，不编造。`
