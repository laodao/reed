# 领域共学：讲义模板未统一（同主题不同知识点结构各异）— 取证与根因

日期：2026-09-13
触发：用户反馈「领域共学模块，同一个主题下的知识模板没有统一？不同知识点生成的知识内容格式不同。以深度学习主题为例，知识点张量、自动微分与反向传播的内容结构不同，首先是大标题都不同，所以内容结构就不同。其次，我发现自测习题答案结构不同，张量中答案和系统是分开的，答案默认不显示，自动微分与反向传播的答案和习题在一起，直接显示出来了」

结论先说：**确实是没统一，而且范围比单个主题大得多**。这不是"两个知识点写法风格不同"，
而是**"讲义区集（sections）在代码里根本没有契约"**——落库时接受任何 key 序列，渲染层只能靠
文本约定兜底，于是每张卡都长成模型当轮想出来的样子。

---

## 1. 真机取证

只读脚本（不改库）：

- `progress/_dl_lesson_shape.cjs`：逐区打印 key/标题/md 长度/正文内嵌标题 + 自测答案类区原文
- `progress/_dl_lesson_shape_summary.cjs`：全空间横向表（区序 + 是否可折叠答案 + 不同区序计数）
- `progress/_dl_essence_check.cjs`：深度学习各卡 essence_type 与区序

运行方式：`$env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd progress\_dl_lesson_shape_summary.cjs`

### 1.1 用户点名的两张卡（深度学习空间 `a13eb877-bf6d-4546-bc43-d08fc010367a`）

| 概念 | 版本 | essence_type | 区数 | 区 key 序列 |
| --- | --- | --- | --- | --- |
| 张量 | v1/v2 | **K-concept** | 9 | `meta>why>examples>definition>rules>code>pitfalls>selfcheck>notes` |
| 自动微分与反向传播 | v1/v2/v3 | **K-concept** | 8 | `meta>why>mechanism>worked>cost>practice>pitfalls>checks` |

**两张卡的 essence_type 完全相同**，而技能里写着 essenceType "决定模板区集"（`dl-agent-tools.ts:128`）——
实际没有任何代码消费这个类型去落地一套模板。同类型两张卡的区集只有 `meta>why>…>pitfalls>` 三段相同。

### 1.2 三处可见的不一致

**① 区标题（用户说的"大标题"）不同，且数量不同**

- 张量：`本讲说明：读者画像 · 数学前置 · 记号热身 · 可测目标` / `先看例子：五个真实形状` / `三类核心运算与它们的形状规则` / `落到代码：NumPy 与 PyTorch 的对应写法` / `自测（先自己做，再对答案）` / `编写注记（学习者可跳过）`…（9 区）
- 自动微分：`导读：前置、记号与目标` / `机制：链式法则 + 计算图 = 反向模式累加` / `手算两例（含回算校验）` / `成本、边界与三种「微分」的分工` / `落到代码：autograd 的用法与梯度确认` / `自测与检验清单`（8 区，无 notes）

**② 区正文里的标题层级不同**（这是"一眼看出结构不同"的直接原因）

- 张量正文用小标题 `###`（三级）：`### 读者画像`、`### 规则一：逐元素运算——形状必须一致`…
- 自动微分正文用 `##`（二级）：`## 前置（先确认你已有这些能力）`、`## 1. 把前向计算记成一张图`…

渲染侧的层级契约写在 `src/renderer/src/views/domain-learning/lesson-markdown.scss:22-44`：
区标题（SectionLesson，15px 主色带序号）> 正文 `h3`（14.5px 浅色条）> `h4` > 正文；
而 `h1/h2` 被单独提成 **15.5px 加粗 + 3px 主色左条**——比正文 `h3` 更重，
所以自动微分卡里的 `##` 小标题视觉上几乎与区标题同级，张量卡的 `###` 才落在"正文小标题"层。

**③ 自测答案：一张折叠、一张直接摊开**（用户点名的第二点）

`src/shared/utils/lesson-selfcheck.ts` 的折叠判据是**文本约定**，不是结构化字段：

- `splitSelfCheckAnswers(md)`：只认**独占一行**的答案标记行（正则 `ANSWER_MARKER_LINE`，接受
  `答案` / `参考答案` / `答案与解析` / `标准答案`…，可带 `#` 标题或 `**` 加粗）；
- `isAnswerSection(sec)`：整区就是答案时（key=`answers`/`solutions`… 或标题以"答案/解答/解析"开头）整区折叠。

对照两张卡：

| 卡 | 末区 | 答案写法 | 结果 |
| --- | --- | --- | --- |
| 张量 | `selfcheck`「自测（先自己做，再对答案）」 | 题目 → `---` → **独占一行的 `**答案**`** → A1~A5 | ✅ 命中标记 → 切成题目/答案两段 → 默认折叠（"显示答案（建议先自己做）"） |
| 自动微分 | `checks`「自测与检验清单」 | `## A. 费曼复述`（答案写成行内 `（答：…）`）、`## B. 手算题（答案附后）` 后跟行内 `**答案 1**：…` | ❌ 无独占一行的标记（`## B. 手算题（答案附后）` 整行不是标记、`**答案 1**` 后面还有内容）→ 不切分 → 答案全部直接显示 |

顺带两个连带影响（同源于"key 未受约束"）：

- `checks` 不在 `DEFAULT_SECTION_TITLES` 里，也不在 `defaultSectionStyle` 的 review 白名单
  （`lesson-sections.ts:35-69` 只认 `selfcheck`/`review`）→ **自动微分的自测区拿不到 review 样式**，
  按 body 样式渲染，与张量的自测区外观也不同。
- 张量有 `notes` 区（编写注记，`isAuthoringNotesSection` 识别 → 置底折叠），自动微分没有——
  这一条本身符合规范（notes 可选），但让两张卡的"末段结构"继续分叉。

### 1.3 横向量化：不是两张卡的问题

| 空间 | 讲义卡数 | 出现的不同区序数 |
| --- | --- | --- |
| 验收·贝叶斯入门 | 431 | **314**（73% 的卡区序独一无二） |
| 深度学习 | 5 | 2 |
| 走查起步主题 | 5 | 5（每张都不同） |
| 量子物理 / M7技能验证 | 1 / 1 | 1 / 1 |

贝叶斯空间 431 张卡里，**只有约 49 张**的自测答案能被折叠，其余（含 key 叫 `check`/`quiz`/`selftest`/
`self-check`/`self_check` 的）答案都是一眼可见。也就是说"答案默认隐藏"这个 2026-09-12 做的功能，
在真机数据上**大部分卡片没生效**。

---

## 2. 根因（四层，逐层可验证）

**① 数据层：区集没有 schema。**
`dl-agent-tools.ts:129-138` 的 `saveCardSchema.sections[].key` 是 `z.string().min(1)` 自由字符串；
`essenceType` 的 describe 写着"决定模板区集"，但**没有任何代码**把 K-concept/K-oper… 映射成一套区集。
`dl_card.sections` 是 JSON 列，落库不做归一化（`dl-agent-actions.ts:398-408` 原样写 `card.sections`）。

**② 生成层：结构规范写在技能正文里，而研究模式的 system prompt 里没有。**
描述区序与答案写法的规范只有一处——`builtin-skills.ts` 的 `learning-concept-explainer`
（rule 6 "答案必须单独成段"、rule 9 "区序固定为 说明→为什么学→例子→定义→机制→落地→注意→自测"）。
但研究模式的系统提示词（`dl-agent-deps.ts:207-236`）只要求：首区必须 meta + 写前置小节、必须有证据、
数值要回算——**没有一个字讲区集与答案结构**。它让 agent 去 `invoke_skill` 拿这份规范
（`dl-agent-deps.ts:211`），而 `invoke_skill` 是 §平台批里那条"渲染技能正文 → 一次无工具 generateText"
的路径：既不出结构化结果，也已出现过返回空（09-12 "技能返回空"两次）。
所以：**真正写了规范的那份文本，在最需要它的那条链路上不可靠地到达模型；模型最终按自己的理解排版，全部落库。**

**③ 门禁层：只拦三类问题，不拦结构。**
`saveCard` 的校验链（`dl-agent-actions.ts:341-388`）依次是：证据非空 → 概念归属 → 难度门禁
（入门 + 未教学记号）→ 循序渐进门禁（`sections[0].key === 'meta'` + 前置可教学）
→ 数值自检（仅提示，不阻断）。**没有一条校验区 key 合法性、顺序、标题、答案结构。**
`learning-progression.rules.ts:220` 是唯一碰区集的门禁，也只查 `sections[0].key !== 'meta'`。

**④ 渲染层：靠语义别名兜底，兜不住自由命名的 key。**
`DEFAULT_SECTION_TITLES` / `defaultSectionStyle` / `isAnswerSection` 都是**已知 key 的白名单**。
模型一旦把自测区命名成 `checks`/`quiz`/`selftest`，这层就完全不生效——不报错、不提示，静默降级成普通正文区。
（2026-09-12 那次答案折叠的验收记录里，真机回归只覆盖了张量卡这一种形状，所以漏了。）

一句话：**"模板"这件事，目前只存在于一份提示词文本和一张渲染兜底表里，不存在于契约、门禁与数据里。**

---

## 3. 修复方案（待确认后动手；均不依赖"平台批"）

### A. 把区集契约变成代码（`src/shared/utils/lesson-template.ts`，纯函数 + 常量）

按 `essenceType` 定义固定区序（key / 默认中文标题 / style / 是否 folded），例如 K-concept：

```
meta → why → examples → definition → mechanism(rules) → code(practice) → pitfalls → selfcheck → answers? → notes?
```

- 单一事实来源：生成侧提示词、落库门禁、渲染兜底标题都读它，不再各写一份；
- 保留折叠语义：`selfcheck` 只放题面，答案进独立区 `answers`（渲染层 `isAnswerSection` 已支持整区折叠），
  现有"独占一行标记"的切分降级为**兼容兜底**（历史卡仍能折叠）。

### B. 落库门禁 `checkLessonTemplate`（挂在现有校验链上）

- key 不在白名单 / 顺序不符 → 拒绝，并在拒绝信息里给出可执行的修正指令
  （"`checks` 不属于 K-concept 模板，自测请用 `selfcheck`；`worked`/`cost` 请并入 `mechanism`/`examples`"）；
- 能从语义上无损映射的别名（`checks`/`quiz`/`selftest`/`self-check` → `selfcheck`）**自动归一化**，
  连标题与 style 一起补齐（`title` 由 key 派生，不再让模型自由填）；
- 区正文标题层级归一化：区标题已占二级语义，正文小标题一律降到 `###`（纯函数 + 单测）；
- 与现有门禁同口径：一次拒绝 + 明确指引，模型按指引重发。

### C. 渲染层兜底（历史数据不动也能看起来一致）

- `defaultSectionStyle` / `DEFAULT_SECTION_TITLES` / `isAnswerSection` 全部改为读 A 的契约，
  并补上别名表，让 `checks`/`quiz`/`selftest` 这类历史 key 也拿到 review 样式与答案折叠；
- 正文标题层级在 `planLessonSections` 里统一（渲染侧归一化），历史卡与新卡视觉一致。

### D. 历史数据

不做破坏性回填。可选：给空间加一个「按模板重整讲义」入口（用户触发、逐概念可预览 diff），
或在下一次增量修订（`learning-lesson-updater`）时顺带归一化。

---

## 4. 待用户确认

1. 模板粒度：**按 essenceType 固定**（推荐，与现有 K-* 设计一致，同类型结构完全相同）／
   按空间自定义／只做渲染层别名兜底（最小改动，但不阻止新卡继续各写各的）。
2. 不合规模卡怎么处理：**能无损映射就自动归一化、映射不了才拒绝**（推荐）／一律拒绝重发／
   一律自动归一化。
3. 历史卡是否要提供「重整讲义」入口（会改写已有卡片 = 新建 version，旧稿留档）。

## 5. 复现命令

```powershell
# 全空间区序横向表 + 可折叠答案统计
$env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd progress\_dl_lesson_shape_summary.cjs
# 单空间逐区结构（含自测/答案区原文）
$env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd progress\_dl_lesson_shape.cjs "C:\Users\daoge\the-bot\the_bot.db" 深度学习
# 深度学习各卡 essence_type 与区序
$env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd progress\_dl_essence_check.cjs
```

相关代码位置：

- 契约缺口：`src/core/packs/domain-learning/services/dl-agent-tools.ts:125-149`
- 落库校验链：`src/core/packs/domain-learning/services/dl-agent-actions.ts:334-408`
- 唯一结构门禁：`src/core/packs/domain-learning/rules/learning-progression.rules.ts:220`
- 生成侧提示词：`src/core/packs/domain-learning/services/dl-agent-deps.ts:207-236`
- 结构规范文本：`src/core/platform/workflow/skills/builtin-skills.ts:598-643`（learning-concept-explainer）
- 渲染兜底：`src/shared/utils/lesson-sections.ts`、`src/shared/utils/lesson-selfcheck.ts`
- 排版层契约：`src/renderer/src/views/domain-learning/lesson-markdown.scss:22-44`
