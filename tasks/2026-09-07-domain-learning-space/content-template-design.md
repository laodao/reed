# 「知识点内容模型」设计：类型化模板（v4；v5/v6 增补见 §7/§8）

日期：2026-09-08
文档目录：tasks/2026-09-07-domain-learning-space/
前置：总体设计定稿 `design-v3.md`
演进：v2=17 种小块（过碎，否）；v3=统一四区壳（抹平类型差异，否）；**v4=按知识本质类型给模板，模板由粗粒度"区"组成**；v5=按用户实测反馈补「区结构分离 / 正文排版规范 / sanitize 契约 / 循序渐进门禁 / 前置要求体系」（见 §7）；**v6=按用户实测反馈「重点不突出」给每个区定职责与写作说明，区序改为"定义 → 详解 → 案例"**（见 §8）
状态：**设计定稿，指导后续开发**（v4 已编码；v5 增补于 2026-09-12 落地；v6 增补于 2026-09-15 落地）

---

## 0. 两轮评审的教训（本稿的平衡点）

1. **v2（17 小块）过碎**：逐内容一张卡 + 目录 chips，用户"看得复杂"。→ 区要粗、整段可顺读。
2. **v3（统一四区壳）过统**：所有知识点同一个 essence/detail/edge/review 外壳，把"数学公式、相关著作"这类**只属于某些类型**的内容硬塞进通用区；用户指出"不同模板应不一样，公式/著作不是每种领域知识都有"。

平衡点：**模板按知识本质类型分化（每类型一套模板），每套模板有自己的"区集"；区是粗粒度小节，不是碎片卡片；某些"内容能力"（公式、相关著作、相关知识点）只在对应模板出现**。

## 1. 知识本质类型 → 模板（区集不同）

模板由知识本质类型决定（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open，design-v3 §3.1）。每套模板 = 一组"区"（sections），区名/区序因类型而异；一个区=一整段可顺读内容（图文/表格/公式）。

| 本质类型 | 模板区集（按序） | 关键区 | 特有能力 |
|---|---|---|---|
| **K-concept** 概念 | 本质 → 定义 → 机制 → 示例与注意 → (相关知识点) → 检验 | 机制区（可含图/推导公式） | 相关知识点常有 |
| **K-oper** 做法 | 本质 → 定义 → 步骤/算法 → 适用与局限 → (相关知识点) → 检验 | 步骤区（步骤条/时序图） | 相关知识点常有 |
| **K-stmt** 陈述 | 本质 → 陈述/条文 → 依据/证明 → 推论/适用 → 示例与反例 → (相关知识点) → 检验 | 陈述区 + 依据区（公式/证明） | **公式/证明必配**；相关著作（提出该陈述的文献）常有 |
| **K-inst** 实例 | 本质 → 实例/数据 → 怎么读 → 同族对比 → 检验 | 数据/实例区 | 相关著作（数据来源）随数据出现 |
| **K-agent** 主体/载体 | 本质 → 主张/贡献 → 背景/立场 → 争议/评价 → (相关著作) → 检验 | 主张区 | **相关著作是主内容**（某人论文/作品清单） |
| **K-open** 开放问题 | 现状 → 各方观点 → 未决点/为何难 → 检验 | 争议区 | 相关著作（讨论文献）视情况 |

领域画像（T1~T7）在模板之上再微调：默认视图、语气、给"相关著作"挂什么（T2/T7 挂论文，T5 挂法规/标准），**但不改模板的区骨架**。

### 结论（回答"公式与著作是否每类都有"）
- **公式**：只强配给 K-stmt（定理/法规的表述与依据常需数学表达）、K-concept 机制含推导时可带；K-oper 步骤式、K-inst 数据表格类不强制。
- **相关著作（论文等）**：强配给 K-agent（主体就是文献/作品）、K-stmt（提出文献）；K-concept/K-oper 有则显示、无则整区消失；法规类（T5 的 K-stmt）的"著作"挂法规/标准而不是论文。
- **相关知识点**：由关系边派生，K-concept/K-oper/K-stmt 常见；K-inst 等孤例少时可无。
- 全部区"有则显示、无则消失"——简单知识点自动变短。

## 2. 区（Section）与内容能力

### 2.1 区是通用容器
区 = `{ key, title, md, folded? }`；md 为整段 markdown（图/表/mermaid/**KaTeX 公式**）。区级样式只需一小套：引言段、正文段、注意卡、步骤、表格——**不再有 17 种原子块**。

### 2.2 内容能力（按类型出现，不是每区都有）
| 能力 | 载体 | 出现规则 |
|---|---|---|
| 数学公式 | 任意区 md（`$…$` 行内 / `$$…$$` **独立成行**为块级，KaTeX） | 需要处出现（定理/机制/数据关系）；块级公式 `$$` 须单独一行否则退化为行内 |
| 相关知识点 | 独立区 `related`（数据=图关系边派生，可点击跳转） | 有直接邻居则显示 |
| 相关著作 | 独立区 `works`（数据=dl_card.works 列表：标题/类型/作者/年份/链接） | works 非空则显示；类型决定挂论文还是法规 |

## 3. 数据模型

```
dl_card: id, project_id, concept_id,
  essence_type(K-concept/…/K-open),          // → 决定默认模板（区骨架）
  sections(json: [{ key, title, md, folded? }]), // 区集：内容由 explainer 按模板产出；related 不在此
  works(json 可空: [{ kind(论文/专著/标准/法规/报告), title, authors?, year?, url?, note }]),
  content_md(由 sections 派生, 兼容/导出),
  evidence_sources(json 摘要), version, status, created_at, updated_at
```

- `related` 区不落库：服务端查 dl_relation 直接邻居（方向/类型标注），保证与图/门控一致；
- 模板骨架存系统侧注册表 `NODE_TEMPLATES`（本质类型→区标题集）；explainer 依模板产出区内容，新增模板=加注册表项（低频）。

## 4. 展示要点

- 整篇可顺读：区用留白+小节标题分隔；注意类区可浅色衬底；深水（证明/长条文）区内折叠；
- 「这块没懂」定位到区（`{key,title}`）→ 同区累计 2 次拆子概念；
- works 区条目可点（论文详情/法规原文跳转）；related 区点击跳对应知识点讲义/图聚焦。

## 5. 界面（前端，M1）

- 讲义组件渲染通用 sections（md 整段）+ 附加 related / works 两个可选区；
- KaTeX：MarkdownViewer 已含 bytemd plugin-math + katex css，公式直接可用（原型用定理样例验证）；
- mock：按 4 类模板造样例——K-concept（MoE，机制含公式/图 + related）、K-stmt 定理（勾股/贝叶斯类，公式+证明折叠 + works 论文）、K-stmt 法规（反洗钱法，条文折叠 + works 法规/FATF）、K-concept lite（重排，无 works）；
- 兼容无 sections 老讲义整篇渲染。

## 6. 阶段与风险

- M1：通用 sections 渲染 + related/works 区 + 类型化模板注册表（先 4~5 类）+ explainer 按模板产区 + 区级没懂落库 + KaTeX 真机验证。
- M2：模板可视化编辑（区内微调/折叠偏好）、content_md 导出完善。
- 风险：模板若再细分会回到"碎"——**模板数=知识本质类型数（6 类封顶），区由类型模板定而非用户自由拼**；宁可类型合并也不无限扩模板。

---

## 7. v5 增补（2026-09-12 用户实测 7 条反馈后的定稿）

用户实测「深度学习」空间后反馈：内容不循序渐进、章节结构不清、公式不渲染、表格无边框、
段落无首行缩进、编号压左边框、编写注记区动作重叠。根因与修复见
`progress/2026-09-12-domain-learning-content-quality-and-typography.md`，此处固化设计口径。

### 7.1 区结构：正文章节 与 编写注记 彻底分离（回答反馈 2/7）

- **正文章节**：`planLessonSections`（`shared/utils/lesson-sections.ts`）按原序编号（1..n），
  剔除编写注记区；每区标题行 = 「序号徽标 + 标题 + 区级动作」同一行 flex 布局；
  `title` 缺省时用 `DEFAULT_SECTION_TITLES` 模板语义兜底（不允许出现"无名章节"）。
- **编写注记**（`key=notes` 或标题含"编写注记"）：不参与编号、不作为章节渲染；
  其全文 + 正文里剥离出的注记（带 `【区名】` 前缀）汇总为**置底唯一折叠面板**，默认收起。
- **区级动作不得绝对定位**：不要再在 `.sec` 上挂右上角悬浮元素（这正是"展开全文/这块没懂"重叠的成因）；
  动作一律进 `.sec-actions`。
- 深水区 `folded: true` 仍按原下标（`sections` 真实下标）记录展开态，避免剔除注记区后错位。
- **注记剥离口径**（`shared/utils/lesson-authoring-notes.ts`）：注记**主导**该行才剥离——
  强标记（⚠️ / 编写注记 / needs_verification / 概念 id / 状态 draft / version）任意位置即剥；
  弱标记（待核验 / 待查证 / 先验待查）仅在**行首**（去掉列表符号、引用符、粗体后）才剥。
  反例（必须保留在正文）：`2. **估算资源**（先验待查证）：参数数量…` —— 句中标注不是注记，
  整行删掉会"吃掉"教学内容（2026-09-12 实测事故）。

### 7.2 讲义正文排版规范（回答反馈 2/4/5/6）

bytemd **不提供** `.markdown-body` 内容样式，而全局 `* { margin:0; padding:0 }` 会清零浏览器默认值——
故讲义正文排版必须在 `views/domain-learning/lesson-markdown.scss` 里补齐（规则经 `:deep()` 落到 bytemd 生成的 DOM）：

| 元素 | 规范 |
|---|---|
| 章节层级 | 区标题（15px 主色 + 序号）> 正文 h1/h2（15.5px + 3px 左色条）> h3（14.5px + 3px 浅色条）> h4（14px 加粗） |
| 段落 | `margin: 0 0 10px`；**中文排版首行缩进 `text-indent: 2em`**；`li>p / td>p / blockquote>p / .katex-display` 不缩进 |
| 列表 | `ul, ol { padding-left: 2.2em }`（编号必须落在正文左边界**之内**）、`li { text-indent: 0 }`、`list-style: decimal/disc` |
| 表格 | `border-collapse: collapse` + `display:block / max-width:100% / overflow-x:auto`；`th,td { border: 1px solid }`、表头底色、偶数行斑马纹 |
| 公式 | 行内 `.katex` 1.05em；块级 `.katex-display` 居中留白 + 横向滚动 |
| 引用 / 代码 / 图 | 左侧 3px 色条 + 浅底；行内 code 描边浅底、`pre` 圆角块；`.bytemd-mermaid` 居中框 |

约定：新增讲义渲染需求时**先改 `lesson-markdown.scss`**，不要在组件里零散写样式——
排版契约由 `tests/unit/renderer/domain-learning/lesson-typography.spec.ts` 守护。

### 7.2.1 自测答案默认折叠（2026-09-12 用户需求）

- **切分**：`shared/utils/lesson-selfcheck.ts` 的 `splitSelfCheckAnswers` 按**独占一行**的答案标记
  （`答案` / `参考答案` / `标准答案` / `答案与解析` / `解答`，允许 markdown 标题与加粗）把区内容切成
  题目 / 答案；行内答案（`- **答案**：…`）不算标记，不折叠（那是讲解用语）。
- **渲染**：`planLessonSections` 输出 `answers`（题目留在 `body`），`SectionLesson` 在题目后渲染
  「显示答案（建议先自己做）」折叠入口，**答案默认不在 DOM 里**；各区展开态按原下标独立。
- **整区答案**：key=answers 或标题以 答案/解答/解析 开头 → `folded=true` 默认整区折叠。
- **幻灯片**：`LessonSlides` 把答案单独成页（`{区名} · 参考答案`），讲者先出题再翻页对答案。
- **生成契约**（`learning-concept-explainer` 纪律 6 / `bootstrap` S4 / `learning-practice-builder`）：
  答案必须单独成段并以独占一行的「答案」小标题引出，或拆成独立区 key=answers（folded=true）；
  练习题把 answer/explanation 与题面分开存放。

### 7.3 bytemd `sanitize` 契约（回答反馈 3，安全红线）

`bytemd` 的 `sanitize` 是 **hast schema 变更器** `(schema) => schema`，**不是** HTML 字符串消毒器：

```ts
let schema = JSON.parse(defaultSchemaStr)
schema.attributes['*'].push('className')   // bytemd 自己追加：插件类名锚点依赖它
if (typeof sanitize === 'function') schema = sanitize(schema)
processor = processor.use(rehypeSanitize, schema)
```

传错类型（如 DOMPurify 的 `(html)=>string`）会让 schema 退化为字符串，
`Object.assign({}, defaultSchema, schema)` 丢掉 `className` 白名单 → 所有 class 被剥离；
而 math/mermaid 两个插件是在 `viewerEffect` 里**靠类名选择器**（`.math.math-inline`、
`.math.math-display`、`pre>code.language-mermaid`）定位再客户端渲染的 → 公式与图表全部不渲染。

- 一律使用 `renderer/utils/markdown-sanitize-schema.ts` 的 `extendSanitizeSchema`（幂等追加 `className`）；
- **不要**为了渲染放宽 `style`/`id`/事件属性：XSS 防线是 rehype-sanitize 的 GitHub 默认白名单，
  `MarkdownViewer` 的测试里已钉死 `script` / `onerror` / `javascript:` 不落地。

### 7.4 循序渐进：内容顺序门禁与生成契约（回答反馈 1）

原「难度门禁」（`learning-difficulty.rules`）**只对入门目标生效**，导致工作应用/前沿目标下
"张量 → 自动微分与反向传播"这类跳步无人拦。新增 `learning-progression.rules`（**所有目标生效**）：

1. 结构：`sections[0].key` 必须是 `meta`；
2. 前置声明：meta 必须交代前置（`前置/已掌握/无需/零基础`）；
3. 前置能力：正文命中前置能力（线性代数 / 导数与链式法则 / 极限 / 积分 / 概率基础 /
   随机变量与分布 / 期望与方差 / 测度）时，必须 **图里有对应前置概念（已有讲义或已是 prerequisite 祖先）**
   或 **meta 记号热身里讲清楚**；都不满足 → `dl_save_card` 拒绝并给出「建概念 → 建 prerequisite → 先给最基础者出讲义」的路径。

生成侧契约（`learning-domain-map` / `learning-space-bootstrap` / `learning-concept-explainer` 技能与
`dlResearchSystemPrompt` 同步）：输出 `layer` + `prerequisites`、不跳级（前置必须在清单里）、
补基础层（出现进阶记号必须补基础概念并排前面）、粒度细到"学完能做一件具体小事"、
区序固定为 说明 → 为什么学 → 例子 → 定义 → 机制/规则 → 落地 → 注意 → 自测。

> 已知取舍：门禁保留"meta 记号热身"这条出路（与既有难度门禁同源口径），
> 因此图质量的最终保障仍靠技能纪律；若要更硬可把"前置概念必须存在"设为唯一出路（需拍板）。

### 7.5 前置要求：主题级 + 知识点级（2026-09-12 第二轮，用户需求）

**生成知识点时就要给顺序**，而不是等到出讲义才想。三层载体：

| 层 | 数据 | 谁写 | 门控关系 |
|---|---|---|---|
| 主题前置要求（整个领域的学习门槛，含领域外需自备能力） | `dl_project.prerequisites`（JSON `DlSpacePrereq[]`：name/why/level/inSpace） | `dl_save_space_prereqs`（tool）或空间设置面板 | 讲义门禁的**满足路径之一**：主题前置已声明该能力 → 不强制图上有对应知识点 |
| 知识点前置（声明） | `dl_concept.attrs.prerequisites: string[]` | `dl_save_concept(prerequisites)` | 立即可见（讲义头虚线 chip）；不参与门控 |
| 知识点前置（权威） | `dl_relation`（relation_type=prerequisite，source→target=本概念） | `dl_save_relation` | 学习顺序门控 + 图上路径都以它为准 |

约定：
- **`inSpace` 由系统反推**（空间内是否存在同名/包含关系的知识点），不信模型自报；
- 规范化统一在写侧（去空、去重、去自己、主题限 12 条 / 单概念限 12 条），读侧信任仓储；`inSpace` 读侧物化为确定布尔；
- **不跳级**：`prerequisites` 的每一项都要有落点（图上的概念，或主题前置清单）；没有落点的声明会被快照逐条列出 ⚠️ 并要求补齐；
- **相邻层级跨度不超过一步**（例：张量 → 自动微分之间必须补「导数与链式法则」）——这条同时写进 `learning-domain-map` / `learning-space-bootstrap` / `dlResearchSystemPrompt` / 空空间起步指令；
- 读侧展示：空间页顶部「学习前置」条（`空间内会教` / `需自备`）、讲义头「前置：」行的虚线 chip（已声明未建边）、空间设置面板可编辑；
- 快照每轮注入【主题前置要求】与【各知识点前置】（含欠账提醒），确保模型"生成时就按顺序"而不是事后补救。

> 明确的非目标：`inSpace=false` 的主题前置只是一道门槛声明，系统不会为它自动生成讲义；要让它变成可学内容，须由研究者把它建成知识点。

### 7.7 图文并茂与可运行演示（2026-09-12 第五轮）

AI/编程/数学类内容必须能"看见"与"试一下"，但**不走 AI 生图**——由代码按数据画图：

| 载体 | 讲义写法 | 渲染方式 | 边界 |
|---|---|---|---|
| 数值图形 | `figure` 代码块 + JSON 规格（必须合法 JSON） | 自写 SVG 渲染器（`figure-spec.ts`，零依赖/离线/确定性） | 五类：matrix / plot / bar / shape / network；限幅 24×24 格、400 点、6 序列、16 条、8 轴、6 层×16 单元；超限截断告警；文本全部转义 |
| 可运行演示 | `js` 代码块 | Web Worker 沙箱 + 「▶ 运行」按钮，输出内联 | 无 DOM/无网络（fetch/XHR/WS/importScripts 被遮蔽）、3 秒超时、输出 ≤200 行×400 字；**不需要 `'unsafe-eval'`**（片段内联为 Worker 顶层代码），CSP 只放宽 `worker-src 'self' blob:` |
| Python 片段 | `python` 代码块 | 仅语法高亮 | **不运行**；要"能跑"的演示须改写成等价 JS |
| 关系/流程、公式 | `mermaid`、KaTeX | 既有 | 四类载体各司其职 |

生成侧契约写在 `learning-concept-explainer` 第 10 条（含五类规格的完整 JSON 样例与"图形要服务理解、不要为配图而配图"），
bootstrap S4 同步要求；契约由 `builtin-skills-pedagogy.spec` 守护。渲染增强在 `MarkdownViewer` 渲染后用
`MutationObserver` 跑（与 mermaid 同一时机，幂等标记防重复）。

> 非目标：不做交互式图（缩放/悬停数值）、不做 3D、不做 Python 运行时（Pyodide 需 10-20MB 打包，另行排期）。

### 7.6 知识地图的可编辑性：用户建点 + AI 补全 + 关系人审（2026-09-12 第三轮）

学习者多半不清楚一个领域完整的知识体系，所以地图不能只由 AI 单向产出，也不能只读：

| 能力 | 入口 | 落库语义 |
|---|---|---|
| **用户手工建点** | 左栏「+ 知识点」（`dl:save-concept` → `LearningGraphService.createConcept`） | `source='manual'`、`researchState='unresearched'`；勾选的前置**直接落成已确认的前置边**（`verified=true`，用户即确认者，门控立刻生效）；前置无落点 → 写入 `attrs.prerequisites` 并回 `missingPrereqs`（留给 AI 补） |
| **AI 补全地图** | 左栏「AI 补全」→ `dlMapCompletionMission`（`shared/utils/domain-learning-mission`）注入并**强制 task 会话**；作业规范 = 技能 **`learning-map-completion`**（宿主按消息标记/意图注入正文，与 bootstrap 同构） | **四阶段固定顺序：S1 采集（知识库优先 `wf_kb_retrieve` → 联网 `web_search`/`wf_web_extract`/`http_get`/arXiv，读工具 3-6 次预算，记要点与出处）→ S2 规划（资料事实 + 模型先验，二者必须分开标注：`attrs.evidenceLevel="有原文：…"` / `attrs.prior=true`+`prior_needs_verification`；不跳级、相邻层级跨度 ≤1）→ S3 落库（`dl_save_concept`(+prerequisites) → `dl_save_relation` 逐条前置边；领域外能力走 `dl_save_space_prereqs`；已有概念只补边）→ S4 自检（可达性/顺序/证据构成）**；**只补结构**，不产讲义、不重复建同名、不编造出处；优先把 `source=manual` 的点接进主干 |
| **关系人审确认** | 知识全景右栏「直接关系」的「确认」按钮（`dl:confirm-relation`） | 未确认边 → `verified=true`（此前后端齐备但前端零调用，所有边永远停在建议态） |

契约要点：
- **取材顺序（2026-09-12 用户口径）**：先采集、再规划、再落库、最后自检——知识库优先、再联网，资料事实与模型先验**必须分开标注**（有原文给 `evidenceLevel`，纯先验标 `prior`），无资料时也要产出但须说明"骨架来自模型先验"；`learning-domain-map` 技能、task 系统提示词、按钮指令三处同口径；task 会话步数预算放宽到 `DL_TASK_MAX_STEPS=16`（四阶段要留落库步数）；
- `DlNodeProfile.relations` 带 `verified/sourceId/targetId/evidence`（否则界面无法定位要确认哪条边）；
- `DlCreateConceptInput/DlCreateConceptResult` 放 shared（前端与主进程同源）；
- 意图路由必须能认出"追加/添加/新增/补充/补全 + 知识点/概念/节点/地图/体系/骨架"以及
  "前置/关系 + 边/补上/连上"→ task 会话（否则用户说"追加几个知识点"会被当成答疑，只得到建议文字）；
- **非目标**：本轮不做编辑/删除知识点与目录维护——删除要级联清理讲义卡/关系边/笔记/掌握度日志（DDL 零外键），风险更高，另行排期。

## 8. v6 增补：重点分层与「每区一段写作说明」（2026-09-15 用户实测反馈）

### 8.1 反馈原话（知识点「金融资产的基本类型：股权/债权/商品/外汇/衍生品」）

> 「重点不突出。通常一个知识点，重点应该在**定义、详解（逻辑）、案例分析**，这几部分要详细说明，其它的内容可以稍微简略一点。
> 这个知识点既有本质又有定义，而定义讲解又不够详细，示例应该放到后面，示例讲解也不够细致，
> 最关键的是这几个类型的详解（详细的规则和逻辑），没有讲清楚。」

拆成四条可执行的问题：
1. 「本质」与「定义」两区**职责重叠**（都在讲"是什么"），而真正要讲透的「定义」反而只有一句话；
2. 「示例」区**位置太靠前**（排在定义/详解之前，来自 v4 的"先例后律"），把正文重心带偏；
3. 「示例」**讲得不细**（只有结论，没有背景/过程/中间量/回看指向）；
4. 最关键的「详解」（机制、构成分类、规则等**详细规则与逻辑**）**没有讲清楚**——模板此前只约束区名与区序，区里写成什么样全靠模型自由发挥。

### 8.2 v6 的三条规则

**规则一：每个区有职责（role）与写作说明（brief）；重点区写透，导学区从简。**

| role | 区 | 定位与篇幅 |
|---|---|---|
| `lead` 导学 | meta、why | 入口与动机，**从简**（只列不展开；meta 不超过一屏） |
| `core` 核心 | definition、statement、mechanism、structure、rules、formula、property、procedure、justification | **本期重点，必须写透**：逐条展开规则与逻辑，给判据、给依据、给最小算例；只写一两句 = 不合格 |
| `case` 案例 | examples、counterexample | **本期重点，必须写细**：背景 → 用到哪条定义/规则 → 过程（分步、含中间量）→ 结论 → 回看指向 |
| `support` 支撑 | application、distinguish、code、detail、controversy、edge、pitfalls | 按需，服务理解即可；pitfalls 每条一句话 |
| `close` 收尾 | selfcheck、answers、notes | 检验与编写注记，**从简**；注记 folded 且不进学习者正文 |

- 每个区在 `LESSON_SECTION_CATALOG` 里带一段 **brief**（这一区要写什么、必须含哪些要素、写到什么程度）与 **minChars**（重点区的最少字数，低于此判"没讲透"）；
- brief 是**唯一事实来源**：生成侧提示词（`lessonTemplateBriefHint`）、落库后的质量提醒（`checkLessonDepth`）都读它，杜绝"提示词一份口径、检查另一份口径"。

**规则二：区序改为「定义 → 详解 → 案例」——示例移到后面（用户口径）。**

- 六类本质类型统一把 `examples`（示例）从"定义之前"移到**定义与详解之后**（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open 各自模板见 `LESSON_TEMPLATES`）；
- 与 v5「先例后律」的关系：**"先例后律"收窄为"直觉先于抽象"**——定义/机制里首次出现公式或抽象规则前，仍须先给一句人话 + 一个带数字的**最小**例子垫直觉（禁止以定义句开头）；但**整篇的案例区不再前置**，禁止拿示例当正文主体；
- 「本质」与「定义」分工写死：本质区只给直觉与一句话概括（≤150 字，不展开规则、不写公式），严格且详细的定义归定义区；两区不许互相重复——这正是"既有本质又有定义、而定义不详细"的根因。

**规则三：落库后做非阻断的"重点深度"质量提醒。**

- `checkLessonDepth` 按同一份 brief 检查：① 重点区（core/case）字数低于 minChars → 提示这一区该补什么；② 核心+案例字数占全文比例过低（<60%）→ 提示"重点被导学与自测挤占"；
- **不做硬门禁**：区是可选的（宁缺毋滥），硬拦"字数不够"会诱导模型**删区**而不是**补写**，反而丢内容；因此提醒随 `dl_save_card` 结果一起回给模型（与数值回算同一模式），由模型自行重发修订版。

### 8.3 消费点（改一处即全链路生效）

| 消费点 | 读什么 |
|---|---|
| `learning-concept-explainer` 技能正文（区集契约块） | `LESSON_SECTION_CATALOG` 的 role/brief/minChars + `LESSON_TEMPLATES` 区序 |
| `learning-space-bootstrap` S4、`learning-lesson-updater` 纪律 3 | 同上（同一段契约块常量） |
| `dlResearchSystemPrompt`（研究模式系统提示词） | 同上 |
| `dl_save_card` 落库门禁 | `normalizeCardSections` + `checkLessonSectionsShape`（区名/区序/答案分离）+ `checkLessonDepth`（重点深度提醒） |
| 渲染层 | `DEFAULT_SECTION_TITLES`（区标题由模板派生） |

> **老卡与旧模板都保留（用户 2026-09-15 明确要求「已有内容不能删除，保存历史版本」）**：
> ① v5 区序作为历史版本留档在 `LESSON_TEMPLATES_V5` / `LESSON_LEGACY_TEMPLATES`（不删除任何旧定义）；
> ② 老讲义内容原样保留、**不自动重排**——落库门禁按历史模板兼容放行，只在结果里附一句「区序沿用历史模板 v5」，
> 提示下次修订该卡时再对齐 v6；③ 老卡已落库的区标题也是历史数据，按原样渲染（**不改写**）；
> v6 新标题（示例 → 案例与示例、组成/结构 → 构成与分类、详解 → 进阶详解、示例与注意 → 补充与注意）
> 只作用于新落库/重新归一的讲义。
> （v7 起 ②③ 的口径升级为「合并 + 重排」，见 §9。）

## 9. v7 增补：章节合并、突出重点、示例放到详解之后、不要卡片样式（2026-09-15 第二轮用户口径）

### 9.1 用户原话与据此确定的口径

> 「我并不是要把之前的内容推倒重来，我要的是结构优化，把重点章节写详细，突出重点。然后调整一下顺序，比如示例我认为要在详解后面。」
> 「结构和规则难道不属于详解吗？」「章节太细碎，显得重点不突出，有些是不是可以考虑合并？」
> 「1.不要卡片样式。」「案例……呼应前面的定义、详解，结合实际案例让用户更好的理解就可以了。」

由此定稿四条：**①合并细碎章节；②重点＝定义/详解/案例，这三节写详细；③案例紧跟详解之后；④整篇不要卡片样式。**

### 9.2 合并：内容不删，只是不再单列成章

| 合并去向 | 被并入的旧区 |
|---|---|
| **定义** | 本质（只保留"两三句人话直觉"放在定义开头） |
| **详解** | 机制、组成/结构、规则、公式、性质、步骤、依据/证明、适用与局限 |
| **案例** | 示例、反例/边界 |
| **常见坑** | 补充与注意 |

- 实现：`LessonSectionSpec.mergedInto` 声明合并去向；这些 key（及其同义写法）在 `canonicalSectionKey` 里**直接折到目标 key**；
- 归一化时同 key 的多个区**按原出现顺序合并成一段**，并把原区标题作为 `### 小标题` 保留（`### 适用与局限` 等）——**内容一字不删**；
- 章节数：K-concept 从 15 区降到 10 区（自测/答案/注记仍单列），重点自然突出。

### 9.3 区序（v7）

```
学习前必读 → 为什么学它 →（陈述/条文）→ 定义 → 详解 → 案例 → 落到代码 → 辨析 → 常见坑 → 自测 → 参考答案 → 编写注记
```

- **详解是篇幅最大的重点区**：① 一条贯穿主线（各部分怎么排、为什么这样分）② 逐项/逐类用**同一组维度**展开（是什么 → 收益/结果从哪来·由什么决定 → 权利义务 → 规则约束 → 什么条件下失效）③ 一张横向对比表收口 ④ 判定与计算规则（适用条件 → 怎么判定/计算 → 为什么这样规定 → 判断错了会怎样）；
- **案例紧跟详解之后**，用来呼应定义与详解：真实具体、2~3 个，每个写"背景 → 对应定义/详解里的哪一条 → 得到什么结论"；**不做**反事实推演；
- 归一化会**按当前模板区序重排**（老卡重存即变成 v7 形状），并在结果里说明"区序已按当前契约重排"。

### 9.4 不要卡片样式

- 契约层：`defaultLayoutForSection` 一律返回 `prose`（设备目录与"显式声明 layout"的路径保留，只在明确声明时使用）；
- 渲染层（`SectionLesson.vue`）：去掉引言区/注意区的底色与圆角、去掉结论条的色条与底色、答案折叠入口改为普通文字链接——讲义按**文档式**排（区标题 + 段落 + 表格 + 图）；
- 生成侧：提示词要求"**按文档写**（段落 + 小标题 + 表格），不要把内容做成要点卡堆砌、不要用引用块做装饰"。

### 9.5 历史留档与老卡

| 版本 | 状态 | 说明 |
|---|---|---|
| v5（2026-09-13） | 留档 `LESSON_TEMPLATES_V5` | 示例在定义之前、区不合并 |
| v6（2026-09-15 上午） | 留档 `LESSON_TEMPLATES_V6` | 示例移到定义之后，但区仍不合并 |
| **v7（当前）** | 生效 `LESSON_TEMPLATES` | 合并 + 「定义 → 详解 → 案例」+ 文档式呈现 |

老卡：`dl_card` 一律**升版留档**（新内容 v+1，旧稿与旧核验不丢）；库里已有的讲义卡不被改写；重存时按 §9.2 合并重排（内容保留），未重存的老卡仍按原样渲染。


