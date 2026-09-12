# 领域共学空间：讲义内容质量与排版修复（2026-09-12）

> 日期：2026-09-12 | 范围：`src/core/packs/domain-learning`、`src/core/platform/workflow/skills`、
> `src/renderer/src/views/domain-learning`、`src/shared/utils` | 触发：用户实测「深度学习」空间
> 的 7 条反馈（内容不循序渐进、章节结构不清、公式不渲染、表格无边框、段落无首行缩进、
> 编号压左边框、编写注记区动作重叠）。

## 1. 用户反馈 → 根因 → 修复（逐条）

| # | 用户反馈 | 根因（定位到行/文件） | 修复 |
|---|---|---|---|
| 3 | 数学公式没有渲染 | **`MarkdownViewer.vue` 误用 bytemd 的 `sanitize` 属性**：该属性是 hast schema 变更器 `(schema)=>schema`，此前传的是 DOMPurify 的 `(html)=>string`。schema 被替换成字符串后，`hast-util-sanitize` 的 `Object.assign({}, defaultSchema, 字符串)` 只拷到数字下标属性，**bytemd 自己追加的 `className` 白名单丢失** → 所有 class 被剥离 → `remark-math` 产出的 `<span class="math math-inline">` 失去类名，而 `@bytemd/plugin-math` 的 `viewerEffect` 正是靠 `querySelectorAll('.math.math-inline')` 定位后再客户端 KaTeX 渲染 → 公式只显示 `$…$` 源码。mermaid（`pre>code.language-mermaid`）、代码高亮同理失效 | 新增 `src/renderer/src/utils/markdown-sanitize-schema.ts`（纯函数，幂等追加 `className`，不放开 style/id/事件属性），组件改为传它；XSS 防线仍是 rehype-sanitize 的 GitHub 默认白名单（脚本/事件属性/`javascript:` 一律丢弃，有测试钉死） |
| 4 | 表格没有边框 | bytemd **不提供 `.markdown-body` 内容样式**（`bytemd/dist/index.css` 只有编辑器外壳），而全局 `* { margin:0; padding:0 }`（`styles/index.scss`）把默认样式清零 → 讲义里的 table 无任何样式 | 新增 `lesson-markdown.scss`：`table` 边框折叠 + 横向滚动，`th/td` `1px solid` 描边、表头底色、斑马纹 |
| 5 | 段落第一行没有空格 | 同上（无内容样式；`p` 无 `text-indent`） | 同上：`p { text-indent: 2em }`，并对 `li>p / td>p / blockquote>p / .katex-display` 取消缩进（避免缩进套缩进） |
| 6 | 编号类紧挨左侧边框、比章节标题还靠左 | 全局 reset 把 `ol/ul` 的 `padding-inline-start`（40px）清零 → 列表标记渲染到内容盒**左侧之外**，视觉上跑到章节标题左边、贴住容器边 | 同上：`ul,ol { padding-left: 2.2em }` + `li { text-indent: 0 }` |
| 2 | 章节结构不明显、看不出某段属于哪一节 | 区标题仅 13px 次要色 + 虚线；无序号；byted 内容 h3 无字号/间距层级 | `SectionLesson.vue` 区标题升级为「序号徽标 + 15px 加粗主色 + 实线分隔」；`lesson-markdown.scss` 定义正文 h1/h2（左粗色条 15.5px）> h3（左色条 14.5px）> h4 的层级；区间距 14→20px |
| 7 | 「编写注记（学习者可跳过）」右侧「展开全文」与「这块没懂」重叠 | 编写注记区被当成**正文章节**渲染（高度折叠），标题行右侧的 `.fold-hint`（展开全文）与**绝对定位在右上角**的 `.sec-confuse`（这块没懂）落在同一位置 | ① 区级动作全部收进标题行 `.sec-actions` 同排（删除右上绝对定位元素）；② 新增 `planLessonSections` 纯函数把「编写注记区」整体剥离，汇总为**置底唯一折叠面板**（默认收起、弱化样式），不再作为章节出现 |
| 1 | 学习内容质量不高；知识点不循序渐进（张量之后直接自动微分与反向传播） | ① 领域图只有 7 个概念、中间没有「导数与链式法则」这类前置，而**既有难度门禁只对「入门」目标生效**（`learning-difficulty.rules` 首行注释即写"仅当空间目标为入门时才设门禁"），该空间目标是「工作应用」→ 跳步无人拦；② 地图/起步研究技能没说"不跳级"，也没有 `prerequisites`/`layer` 输出契约；③ bytemd 类名丢失（见 #3）导致 mermaid 图也不渲染，内容观感更差 | 见下节「循序渐进门禁」 |
| 2b | （追加发现）「为什么学它」明明说"支撑三类具体工作"，正文里却只剩 1 条 | `stripAuthoringNotes`（2026-09-09 加）口径过宽：**一行里出现"先验待查证"就整行删除**。张量讲义第 2/3 条 bullet 因带"（先验待查证）"标注被整条吃掉，跑到"编写注记"里去了（注记区里能看到被吞的教学内容） | 剥离口径收紧为「注记**主导**该行」：强标记（⚠️/编写注记/needs_verification/系统黑话）任意位置即剥；弱标记（待核验/待查证/先验待查）**仅行首**（去掉列表符号、引用符、粗体后）才剥。真机数据回归：张量卡 why 区三条 bullet 全在，注记仍汇总 6 条 |

补充事实核验（用真机库 `C:\Users\daoge\the-bot\the_bot.db` 佐证）：深度学习空间
`dl_concept` 7 条、`dl_relation` 5 条（张量→自动微分与反向传播→多层感知机→…），
`sections` 里 9 个区（meta/why/examples/definition/rules/code/pitfalls/selfcheck/notes），
其中 notes 区标题就是「编写注记（学习者可跳过）」且 `folded=true` —— 与用户描述完全一致。

## 2. 循序渐进门禁（新增，回答问题 1）

新增 `src/core/packs/domain-learning/rules/learning-progression.rules.ts`（纯函数）并在
`dl_save_card` 接线。**对所有目标生效**（不再只拦「入门」），三条口径：

1. **结构**：`sections[0].key` 必须是 `meta`——没有 meta 就没有"读者站在哪"的说明；
2. **前置声明**：meta 必须交代前置（`前置/已掌握/无需/零基础` 等标识之一）；
3. **前置能力**：正文命中前置能力（线性代数、导数与链式法则、极限、积分、概率基础、
   随机变量与分布、期望与方差、测度）时，必须二选一——
   a) 领域图里有名称命中的前置概念，且它**已有讲义**或**是本概念的 prerequisite 祖先**；
   b) 本卡 meta 已把它当记号讲清楚（记号热身/读法/符号表 **且** 命中该能力关键词）。
   两者都不满足 → 拒绝落卡，错误信息给出「建哪些概念 → 建什么 prerequisite 边 → 先给谁出讲义」。

设计取舍（避免两个坑）：
- **自指豁免**：概念名本身包含某能力关键词（如「梯度下降与优化器」之于「梯度」）时跳过该条，
  防止"讲 X 却要求先有 X"的死循环；但「自动微分与反向传播」不豁免「导数与链式法则」
  （`微分` 只在命中信号里、不在概念名关键词里）——这正是用户实测的跳步场景，有专门用例钉死；
- **不阻断的提醒**：前置概念在图上但尚无讲义 → 落库成功但提示先补讲义（避免首链死锁）。

配套生成侧改进：
- `learning-domain-map`：输出契约新增 `layer`（学习层次）与 `prerequisites`，明确「不跳级」
  （前置必须在清单里，领域外前置也要建成概念）、「补基础层」（出现进阶记号必须补
  「线性代数基础/导数与链式法则/…」并排前面）、「粒度要求」（细到"学完能做一件具体小事"）；
- `learning-space-bootstrap`：S2/S3 要求**逐条** `dl_save_relation` 落前置（不能只在总结里说顺序）、
  自检顺序闭环；S4 要求 meta 写前置声明并说明被门禁拒绝时的补法；
- `learning-concept-explainer`：新增纪律 8「循序渐进」（meta 前置声明 / 不跳步 / 每区承上启下 /
  顺序感）与纪律 9「区结构规范」（每区必须有 title、区序、编写注记只放独立 notes 区）；
- `dlResearchSystemPrompt` 第 11 条：由"入门目标必读"升级为「循序渐进与前置门禁（所有目标生效）」。

## 3. 改动清单

新增：
- `src/shared/utils/lesson-sections.ts` — 区结构规划纯函数（正文编号 / 编写注记汇总）
- `src/core/packs/domain-learning/rules/learning-progression.rules.ts` — 循序渐进门禁
- `src/renderer/src/utils/markdown-sanitize-schema.ts` — bytemd sanitize schema 变更器
- `src/renderer/src/views/domain-learning/lesson-markdown.scss` — 讲义正文排版规范

改动：
- `MarkdownViewer.vue`（sanitize 契约 + 引入排版样式）
- `SectionLesson.vue`（章节层级 / 动作同排 / 注记面板置底）
- `src/shared/utils/lesson-authoring-notes.ts`（剥离口径收紧，见 2b）
- `dl-agent-actions.ts`（saveCard 接线门禁 + 提醒进摘要）
- `dl-agent-deps.ts`（研究提示词第 11 条、空空间起步指令）
- `builtin-skills.ts`（domain-map / bootstrap / concept-explainer 三个技能）

测试（TDD，先红后绿）：
- 新增 `tests/unit/renderer/domain-learning/markdown-viewer.spec.ts`（公式真渲染 / `language-*` 类名 /
  表格 / XSS 拦截）——修复前该文件 2 条失败，正是公式与类名两条；
- 新增 `tests/unit/renderer/utils/markdown-sanitize-schema.spec.ts`（幂等/无副作用/不放开 style）
- 新增 `tests/unit/renderer/domain-learning/section-lesson.spec.ts`（编号 / 动作同容器 / 注记面板）
- 新增 `tests/unit/renderer/domain-learning/lesson-typography.spec.ts`（排版契约：表格描边、首行缩进、列表缩进、层级）
- 新增 `tests/unit/shared/lesson-sections.spec.ts`（12 例）
- 新增 `tests/unit/core/packs/domain-learning/learning-progression.rules.spec.ts`（16 例，含用户实测场景）
- 扩展 `lesson-authoring-notes.spec.ts`（3 例，钉死"不误伤提到待查证的教学内容"）
- 扩展 `dl-agent-actions.spec.ts`（门禁接线 3 例 + 既有夹具补 meta）、`dl-agent-deps.spec.ts`、
  `dl-agent-empty-start.spec.ts`、`builtin-skills-pedagogy.spec.ts`

## 4. 验证

- 相关测试 **219 passed / 0 failed**：dl 域全部（21 文件 173 例，含 3 个渲染层新 spec）
  + 通道一致性/包契约/dl 仓储/意图路由/数值自检等（8 文件 46 例）。
- `eslint` 改动文件 0 error/warning。
- `vue-tsc --noEmit`：改动文件 **0 新增错误**（全量 894，低于既有基线 934）。
- 全量 `tests/unit` 另有若干失败（`app.repository` / `asset-service-category` /
  `multi-tenant` / `workflow-repositories` / `extract-text` / `gossip-event-report` 等），
  经核对**均为工作区中其它并行会话在途改动**（`git status` 可见
  `src/core/utils/extract-text.ts`、provider-*、`knowledge-base.service.ts` 等被他人修改，
  分支 `feat/kb-parse-chunking`），与本次改动文件无交集，未动。
- **视觉验证**（临时诊断，非产品代码）：`progress/_dl_lesson_preview.cjs` 把真实
  `dl_card.sections`（张量卡）或夹具（`_dl_lesson_preview_fixture.json`）渲染成独立 HTML——
  Markdown 用 marked、公式按 plugin-math 的做法客户端 KaTeX 渲染、样式取自**真实文件**
  （`lesson-markdown.scss` + `SectionLesson.vue` 的 style 块，仅把 `:deep(X)` 还原为 `X`），
  并复现全局 reset。`progress/_dl_lesson_preview_shot.cjs` 用 Playwright 量测
  （产物：`progress/_dl_lesson_preview2.png`）：
  - 张量卡：`katex 22 个`（公式渲染）、`table 4 个`、`text-indent: 28px`（=2em）、
    `ol padding-left: 30.8px`、`td border: 1px solid`、`sec-actions 8 个`；
  - K-stmt 夹具（含 folded 区）：折叠区同时有「这块没懂」与「展开全文」，
    **矩形不相交（intersect=false）**、都在标题行内（`insideHead=true`）、
    「这块没懂」距右边界 56px —— 用户反馈的重叠已消除。

- **真机数据回归**：用真机库导出的张量讲义 sections 跑 `planLessonSections`，
  正文章节编号 1~8（notes 区已剔除）、注记汇总 6 条、`why` 区三条 bullet 全部保留
  （修复前第 2/3 条被剥离，见 2b）。

## 5. 补充（用户追加）：自测的答案默认折叠

用户追加："学习内容中自测的答案默认要折叠"。原来是题目与答案同段渲染，读者一眼看到答案，
检索练习（M7）失效。

- 新增纯函数 `shared/utils/lesson-selfcheck.ts`：`splitSelfCheckAnswers(md)` 按**独占一行**的
  答案标记（`答案` / `参考答案` / `标准答案` / `答案与解析` / `解答`，允许 markdown 标题与加粗、
  结尾冒号）把区内容切成「题目 / 答案」两段，并裁掉题目尾部多余的水平分隔线；
  `isAnswerSection` 识别"整区就是答案"（key=answers / 标题以答案·解答·解析开头）→ 默认整区折叠。
  只认独占一行的标记，**行内答案不算**（`- **答案**：…` 是讲解用语，不折叠）。
- `planLessonSections` 输出新增 `answers` 字段（题目留在 `body`）；`SectionLesson.vue` 在题目后渲染
  「显示答案（建议先自己做）」折叠入口，答案默认不在 DOM 里，各区的展开态互相独立。
- `LessonSlides.vue`：幻灯片场景等价做法是**答案单独成页**（`{区名} · 参考答案`），讲者先出题、
  讲到再翻页对答案。
- 生成侧契约：`learning-concept-explainer` 纪律 6 要求"答案必须单独成段、以独占一行的「答案」小标题
  引出（或独立区 key=answers）"；`learning-space-bootstrap` S4 与 `learning-practice-builder`
  （answer/explanation 与题面分开存放）同步。
- 验证：`lesson-selfcheck.spec.ts`（12 例，含真实讲义形状与"行内答案不误切"反例）、
  `lesson-sections.spec.ts` +3 例、`section-lesson.spec.ts` +4 例（默认不渲染答案 → 点击展开）、
  `lesson-slides.spec.ts` 4 例（题目页/答案页分离）；**真机数据回归**：张量卡 selfcheck 区
  5 道题留在 body、584 字答案切到 answers、其余 7 个区均无误切；
  视觉预览（`progress/_dl_lesson_preview*.cjs`）量测 `answersState.open=false`（默认折叠）。

## 6. 遗留 / 后续建议：门禁只在落卡时生效，贝叶斯空间已有的 134 张卡照常展示；
  若要治理存量，建议做一个"重跑门禁 → 列出缺前置的卡"的只读体检（未做）。
- **真正的顺序兜底仍在图上**：门禁允许"meta 记号热身"这一条出路，因此模型理论上可以
  用记号热身规避补前置概念；已在技能正文里同时要求"逐条落 prerequisite 边"与
  "不跳级"，但**图质量最终仍取决于生成侧**。若要更硬，可把"前置概念必须存在"设为唯一出路
  （会牺牲部分灵活度，需用户拍板）。
- 渲染层其它使用 bytemd 的地方（`MarkdownEditorHeavy.vue` 等）未受影响：它们不传 `sanitize`。
- 平台批（invoke_skill 无工具内层 / run_workflow dl 域半闭环）仍按 2026-09-09 复盘结论单独排期。
