# 领域学习：讲义模板 v6（重点分层 + 每区写作说明 + 区序「定义 → 详解 → 案例」）

日期：2026-09-15
关联设计：`tasks/2026-09-07-domain-learning-space/content-template-design.md` §8（v6 增补）

## 一、用户反馈（原话要点）

以知识点「金融资产的基本类型（股权/债权/商品/外汇/衍生品）」为例：

> 重点不突出。通常一个知识点，重点应该在**定义、详解（逻辑）、案例分析**，这几部分要详细说明，其它的内容可以稍微简略一点。
> 这个知识点既有本质又有定义，而定义讲解又不够详细，示例应该放到后面，示例讲解也不够细致，
> 最关键的是这几个类型的详解（详细的规则和逻辑），没有讲清楚。
> 因此这个模板我认为需要优化结构，每个结构内部写一段说明文字，对每个结构内部提出要求。
> 以此类推，其它领域的知识内容，也应该参考这个思路做相应的优化。

追加要求：**当前已有内容不能删除，保存历史版本。**

拆成四个根因（实测取证）：区职责重叠（本质/定义）、示例前置、示例太粗、详解区没有写作要求。

## 二、改了什么

### 1. 契约层 `src/shared/utils/lesson-template.ts`

- `LessonSectionSpec` 新增三个字段（每个区都有）：
  - `role`：`lead` 导学 / `core` 核心 / `case` 案例 / `support` 支撑 / `close` 收尾；
  - `brief`：**一段写作说明**——这一区要写什么、必须含哪些要素、写到什么程度（用户要的"每个结构内部写一段说明文字"）；
  - `minChars`：重点区（core/case）的最少字数（定义/机制/规则/构成 220~260 字，案例 220 字，反例 160 字…）。
- **区序改为「定义 → 详解 → 案例」**（六类本质类型统一）：`examples`（标题「案例与示例」）从定义之前移到定义与详解之后。
  原「先例后律」收窄为「直觉先于抽象」——定义/机制里首次出现公式前仍要先给一句人话 + 带数字的最小例子，但整篇案例区不前置。
- 标题澄清：`examples` 示例 → **案例与示例**；`structure` 组成/结构 → **构成与分类**；`detail` 详解 → **进阶详解**（支撑区，避免与"详解"重点混淆）；`edge` 示例与注意 → **补充与注意**。
- **历史版本留档（不删除）**：`LESSON_TEMPLATES_V5` 保留 2026-09-13 的旧区序，`LESSON_LEGACY_TEMPLATES` 登记为历史模板，
  `LESSON_TEMPLATE_VERSION_CURRENT = 'v6'`；`checkLessonSectionsShape` 对命中历史模板的老卡**兼容放行**（内容与区序都不自动重排），
  只在结果 `note` 里提示「下次修订该卡时可重排到 v6」。老卡已落库的区标题同样按原样渲染，新标题只作用于新落库/重新归一的讲义。
- 新增提示词/检查共用的渲染与检查：
  - `sectionBriefLine` / `lessonTemplateBriefHint(类型)` / `lessonSectionBriefMenuHint()`（区 → 职责 + 最少字数 + 写作要求）；
  - `checkLessonDepth()`（**非阻断**重点提醒）：① 重点区过简；② 「本质」比「定义」还长（重点放错区）；③ 重点区占比 < 60%（导学与自测挤占正文）；④ 全文 < 800 字不做占比检查（短卡不苛求）。
    阈值常量 `LESSON_DEPTH`；字数口径 `lessonBodyChars`（围栏外非空白字符，与 `lesson-layout` 的"文字墙"一致）。

### 2. 生成侧提示词

- `src/core/platform/workflow/skills/builtin-skills.ts`：
  - 区集契约块新增「重点分配」条 + **每区写作要求总表**（读 `lessonSectionBriefMenuHint()`，与门禁同源）；
  - `learning-concept-explainer` 教学纪律第 1 条重写为「重点与顺序」五小条：直觉先于抽象 / 区序「定义 → 详解 → 案例」/ 本质与定义分工（本质 ≤150 字）/ 详解逐类展开 / 案例写细；
  - 六类本质类型的主线速览同步为新序；
  - `learning-space-bootstrap` S4、`learning-lesson-updater` 纪律 3、`learning-lesson-writer` 要求 1 同步新序与重点纪律。
- `src/core/packs/domain-learning/services/dl-agent-deps.ts`（研究模式系统提示词）：新增重点分配与区序条 + 写作要求总表。
- `src/core/packs/domain-learning/services/dl-agent-tools.ts`：`dl_save_card` 的**工具描述**与 `sections` 字段描述补上重点与区序口径
  （模型在工具层也看得到：重点在定义/详解/案例、[核心]/[案例] 要写透、示例区不前置）。

### 3. 落库侧 `src/core/packs/domain-learning/services/dl-agent-actions.ts`

- `dl_save_card` 归一化/区序校验之后追加 `checkLessonDepth`：重点区过简 / 占比失衡时，把「哪一区、要补什么、补到多少字」
  连同 `shape.note`（老卡区序提示）一起写进工具返回（`message` + `data.depthIssues` / `data.shapeNote`）。
- **不做硬门禁**：区是可选的（宁缺毋滥），硬拦"字数不够"会诱导模型**删区**而不是**补写**，反而丢内容；
  与数值回算同一模式——提醒模型补写后重发一版。

## 三、测试与验证

新增/更新用例：

- `tests/unit/shared/lesson-template.spec.ts`：区 role/brief/minChars 完整性；每类模板"定义/陈述在案例之前 + 至少一个核心区"；
  提示词渲染（区序 + 职责 + 最少字数 + brief 正文）；`checkLessonDepth` 四类提醒 + 短卡不查占比；
  v5 历史模板留档 + 老卡兼容放行（`note` 提及 v5）；自造区名/乱序仍拒绝。
- `tests/unit/core/packs/domain-learning/dl-agent-bindings.spec.ts`：`dl_save_card` 工具描述带重点分配与区序口径。
- `tests/unit/core/platform/workflow/builtin-skills-pedagogy.spec.ts`：重点分配、写作要求总表、区序「定义 → 详解 → 案例」、
  本质/定义分工、bootstrap 与 updater 同步。
- `tests/unit/core/packs/domain-learning/dl-agent-actions.spec.ts`：v5 旧序老卡兼容落库（区序原样保留）+ 结果带重排提示；
  重点区过简 → 落库成功但附「重点提醒」；乱序（详解在定义之前）仍拒绝；标题派生断言更新为「案例与示例」。
- `tests/unit/shared/lesson-sections.spec.ts`：兜底标题断言更新（示例与注意 → 补充与注意、示例 → 案例与示例）。

命令：

```
node scripts/vitest-electron.cjs run tests/unit
```

（本轮改动的相关 spec 已全绿；全量单测结果见下方"实跑记录"。）

## 四、真机验收建议

1. 打开「金融理财」空间 → 让 AI 生成/重生成知识点「金融资产的基本类型」讲义；
2. 检查区序：meta → 本质 → 定义 → 机制/构成与分类/规则 → 案例与示例 → …（案例**不在**定义之前）；
3. 检查定义区：是否给到正式定义 + 限定词拆解 + 边界（"不是什么"），而不是一句话；
4. 检查构成与分类：股权/债权/商品/外汇/衍生品是否**逐类**给出"是什么/收益来源/权利义务/规则约束/典型场景"；
5. 检查案例区：是否有背景 → 用到哪条规则 → 过程与中间量 → 结论；
6. 若某重点区仍很薄，`dl_save_card` 的返回消息里应出现「⚠️ 重点提醒」并点名该区；
7. 打开任一老讲义（2026-09-13～09-15 生成）：内容与区序必须原样保留（不自动重排）。

## 五、实跑记录

- `tests/unit/shared/lesson-template.spec.ts`：34 passed
- `tests/unit/shared/lesson-sections.spec.ts` + `tests/unit/core/packs/domain-learning/dl-agent-actions.spec.ts`：42 passed
- `tests/unit/core/platform/workflow/builtin-skills-pedagogy.spec.ts`：31 passed
- `tests/unit/shared` + `tests/unit/core/packs/domain-learning` + `tests/unit/renderer/domain-learning`：643 passed / 646（3 failed）
- `node scripts/vitest-electron.cjs run tests/unit`（全量）：与本次改动**无关的既有失败**仅以下几处，均未触及本次改动文件：
  - `tests/unit/renderer/domain-learning/lesson-typography.spec.ts`（3 failed）：断言要求 `th,\n  td {` / `ul,\n  ol {` / `h1,\n  h2 {`，而 `lesson-markdown.scss` 实际是无缩进写法——该 SCSS 与 `MarkdownViewer.vue` 在工作树里**未改动**（`git status` 为空），属既有不一致；
  - `tests/unit/repositories/workflow-repositories.spec.ts`（1 failed，SQLite 串行门提示事务内调用全局仓库会死锁）、`tests/unit/repositories/multi-tenant.spec.ts`（2 failed，租户隔离）、`ecommerce-confirm-chain`（偶发，单跑通过）——全量并行下的既有 flaky。
- `npm run typecheck`：改动文件（`lesson-template.ts` / `builtin-skills.ts` / `dl-agent-actions.ts` / `dl-agent-deps.ts`）**零报错**；输出中仅剩既有报错（如 `dl-concept-audit.service.ts` 的 `dlConceptLogs` 未在 `ICoreDatabaseManager` 上声明、`shared/types/index.ts` 重导出冲突等），均非本次改动引入。

## 六、后续可做（未在本轮范围）

- 其它业务模块的结构化内容模板（长文写作章节设计卡、剧集制作分镜等）若也要"重点分层 + 每区写作说明"，可照本轮的写法做：契约里给 role/brief/minChars → 提示词渲染 → 落库非阻断提醒。需要各自设计文档先定"重点区是哪几区"。
- `dl_plan` 的 `lesson`（区级计划/roster）目前类型已定义但服务未落地；落地时可直接复用 `lessonTemplateBriefHint` 生成区级写作要求，并让 roster 的 `layout/carrier` 与 brief 对齐。

