# 领域学习：讲义生成流水线（Plan → Do·Check·Act）+ 版式设备化呈现

日期：2026-09-15
关联设计：`tasks/2026-09-14-domain-learning-lesson-pipeline/design.md`
参考开源项目：ppt-master（`C:\Users\daoge\code\opensource\ppt-master-main`，MIT）——迁移的是**流程纪律**，不是代码

## 一、用户反馈（原话要点）

> 「领域学习模块，生成讲义功能太简陋，你参考开源项目 ppt-master 优化讲义生成功能。」
> 复选认定：① 生成流程缺「大纲/规格」规划与确认；② 呈现排版（讲义卡片与幻灯片）弱。
> 补充原话：「**不美观，纯粹的堆砌文字，没有对文字做精炼归纳，没有配图，布局单调简陋**。」范围：完整流水线一轮落地。

## 二、从 ppt-master 迁移的骨架

| ppt-master 机制 | 本轮落地物 |
|---|---|
| Plan→Do·Check·Act 阶段化 | 讲义生成拆为 **方案与规格（Plan）→ 逐区精写（Do）→ 视觉质检（Check）→ 区级定点重写（Act）** |
| `design_spec.md` | **讲义规格 `DlLessonSpec`**：读者画像/学完能做到/深度/篇幅预算/语气/术语表/记号表/示例参数表/视觉计划/区级计划 |
| `spec_lock.md`（每 5 页回读） | **规格锁 `lessonSpecLock()`**：确认后随轮注入，要求每 3 区回读一次（防术语·记号·算例漂移） |
| §IX 页级 roster（page job / carrier / topology） | **区级计划 roster**：每区 `{key, layout 版式, job 读者动作, carrier 载体, takeaway 一句话结论}` |
| Executor 的 device menu | **版式设备目录（15 个）**：prose/keypoints/compare/steps/figure/worked/formula/stats/quote/timeline/pitfall/checklist/code/qa/callout |
| `svg_quality_checker.py`（blocking/warning 两级） | **`checkLessonVisualQuality`**：文字墙/通篇无图/声明版式与正文不符/大纲载体缺失 → 阻断；版式单调/要点没精炼/长区没归纳/缺结论 → 警告 |
| 「Act at the owning layer」 | 区级**「重写此区」**：只重做一区，其余逐字保留（走 task 轮 + dl_save_card 门禁） |
| Quick profile（可跳过确认） | **快速模式**（自动推进/起步轮）：跳过方案确认，但质检照样生效（全文级问题降级为警告，避免卡死产出） |

## 三、改了什么（分层）

### 1. 契约层（唯一事实来源，纯函数 + 单测）
- **新增 `src/shared/utils/lesson-layout.ts`**：设备目录（含中文名/用途/正文形状要求/别名）、
  `defaultLayoutForSection`（模板语义区 → 默认设备）、`analyzeLessonMd`（围栏状态机：图/表/公式/代码/引用/列表/勾选/数据看点 + 字数，
  字数口径复用 v6 的 `lessonBodyChars`）、`checkLessonVisualQuality`（两级质检，每条给出**可执行修复**）、
  设备条目解析（要点卡/步骤条/数据看点/勾选清单/时间线）、`splitLessonDeviceMd`（卡片之外的正文原样保留，不吞内容）、`presentLessonSections`（渲染计划）。
- **新增 `src/shared/utils/lesson-spec.ts`**：`normalizeLessonSpec`（读者/目标必填、区名必须在模板内、roster 顺序校验、
  别名版式归一、篇幅夹到合法区间、空条目丢弃去重）、`normalizeLessonPlanPayload`（essenceType + spec）、
  `checkLessonSpecAgreement`（区集/区序一致、版式漂移、大纲 takeaway 缺失、示例参数没用上）、`summarizeLessonSpec`、`lessonSpecLock`。
- **`lesson-template.ts`（v6 契约，增量）**：`LessonSectionShape` 增加 `layout`/`takeaway` 透传（区集契约只管区名与顺序，版式原样透传）。
- **阻塞口径（重要取舍）**：**声明即义务**——区显式给了 layout（或大纲定了版式）才硬拦形状不符；
  没声明时按区 key 推导的版式只是渲染兜底，不符只警告。**走完规划（strict）才硬拦文字墙/通篇无图**，快速模式降级为警告。
  这样既治住"堆砌文字"，又不会把起步轮/自动推进的讲义卡死产不出来，也不误伤历史卡。

### 2. 数据与流程
- `dl_card.spec`（讲义设计规格 JSON，随卡留档）+ `dl_plan.concept_id`（lesson 步按概念存）——两处 `ensureColumn` + DDL + repository。
- `DlPlanStep` 增 `'lesson'`；`dl-plan.repository` 全部读取/退位方法带可选 conceptId（空间级用 `IS NULL` 精确匹配，不串台）。
- `dl-plan.service`：`proposeDlLessonPlan`（概念归属校验 + 规格归一，按概念版次递增与退位）、`confirmDlPlan(..., conceptId)` 支持 lesson、
  `getDlPlanView(spaceId, conceptId)` 返回 `lesson/lessonConceptId/lessonConfirmed`、`getConfirmedLessonSpec`。
- 新工具 **`dl_propose_lesson_plan`**（Plan 阶段提交讲义方案）+ `DlAgentActionType/Params` + 预算默认值 + 动作层分发。

### 3. 落库门禁（`dl_save_card`）
顺序：区集契约 → 深度提醒 → **讲义方案一致性**（有已确认大纲时：essenceType 一致、区集/区序一致、声明的载体必须真给）→
**视觉质检**（strict 时阻断文字墙/通篇无图；声明版式不符与大纲载体缺失一律阻断）→ 难度 → 循序渐进 → 数值自检。
每区落库前解析出确定版式（显式 layout > 大纲 > 模板默认），并把规格随卡写入 `dl_card.spec`。
警告（呈现提醒/重点提醒/数值自检）随动作摘要回给模型与用户。

### 4. 生成侧提示词
- 新技能 **`learning-lesson-designer`**（讲义方案设计：本质类型 + 读者/目标 + 篇幅 + 术语/记号/示例参数 + 区级计划 + 视觉计划）。
- 重写 `learning-concept-explainer` 流程段：**Plan（先提交讲义方案）→ Do（逐区精写、每 3 区回读规格锁）→ Check（质检）**，
  并新增「呈现纪律」第 11 条（设备菜单 + 精炼归纳 + 至少一个"看得见"的载体 + 布局节奏）；输出 JSON 增补 `layout`/`takeaway`。
- `learning-space-bootstrap` S4、`learning-lesson-updater` 纪律 3、研究模式系统提示词第 17 条、任务模式技能清单同步。
- 宿主（`dl-agent-harness`）：研究轮按状态注入三类指令——**已有已确认方案** → 规格锁 + 逐区精写指令；
  **快速模式标记** → 快速模式提示；**否则** → 先提交讲义方案指令（附六类本质类型的区序）。确认标记但读不到方案时给恢复路径。

### 5. 呈现（用户最直观的痛点）
- 新组件 **`LessonSectionBody.vue`**：按设备渲染正文——要点卡网格、步骤条（含竖向连接）、数据看点（大字+说明）、
  勾选清单、时间线、算例框、公式框、引文块、对比表框、结论条、可运行代码；条目外的残余正文仍用 markdown 渲染（不丢内容）。
- 新组件 **`LessonSpecBar.vue`**：讲义规格条（读者画像/深度篇幅/目标/术语/记号/示例参数/视觉计划，可展开）+ **区导航**（点跳区）。
- **`SectionLesson.vue`**：区标题行加**版式徽标**、正文上方加**一句话结论条**、非正文版式带设备装饰类；
  区级新增**「重写此区」**（把该区现状 + 版式交给助手定点重写）。
- **`LessonSlides.vue`**：一区一页按设备渲染 + 页内版式徽标 + 一句话结论；封面补**读者画像与"学完能做到"**；自测答案仍单独成页。
- 新组件 **`LessonPlanDialog.vue`**：讲义方案确认弹窗——读者/目标/篇幅/术语/记号/算例参数 + 区级计划表（**每区版式可改**）+ 调整意见（让模型重做一版）。
- 空间页：讲义方案提示条（待确认高亮/已确认回看）+ 研究轮结束后自动弹确认框 + `dl_propose_lesson_plan` 的动作文案与进度 chip。

## 四、测试与验证

新增/更新用例（全部实跑）：

| 文件 | 覆盖 | 结果 |
|---|---|---|
| `tests/unit/shared/lesson-layout.spec.ts` | 设备目录/别名/default/形状分析（围栏状态机）/两级质检（含快速模式降级、兜底不算义务）/条目解析/设备拆分/展示计划 | 38 passed |
| `tests/unit/shared/lesson-spec.spec.ts` | 规格归一（必填/区名/顺序/夹取/去重）/载体归一/大纲一致性（区集差异·版式漂移·参数未用·结论缺失）/摘要与写作锁 | 18 passed |
| `tests/unit/core/packs/domain-learning/dl-plan.service.spec.ts` | lesson 步：按概念落 draft、版次与退位隔离、确认后门禁拿到规格、用户改版式、非法拒绝、方案总览 | 11 passed |
| `tests/unit/core/packs/domain-learning/dl-lesson-pipeline.spec.ts`（新） | `dl_propose_lesson_plan` 动作；**视觉门禁**（文字墙/无图 → 拒绝并给修复）；快速模式降级但摘要必须提醒；按大纲落库写 spec；区集不一致/载体缺失/类型不符 → 拒绝 | 11 passed |
| `tests/unit/renderer/domain-learning/lesson-devices.spec.ts`（新） | 设备渲染（要点卡/步骤/数据看点/清单/时间线/图解）、残余正文不丢、takeaway、徽标、规格条与区导航、重写此区上抛 | 14 passed |
| `tests/unit/renderer/domain-learning/lesson-plan-dialog.spec.ts`（新） | 规格展示、区级计划逐区可改版式、确认时提交 conceptId+改过的 roster 并驱动【已确认讲义方案】、调整意见、防串台、已确认态 | 6 passed |
| `tests/unit/renderer/domain-learning/section-lesson.spec.ts` / `lesson-slides.spec.ts` | 重构后原有契约（编号/注记/折叠/答案/证据外链；页切分）不回归 | 18 + 4 passed |
| `tests/unit/core/platform/workflow/builtin-skills-lesson-layout.spec.ts`（新） | 新技能 `learning-lesson-designer` 存在且带完整设备菜单；explainer 的 Plan→Do→Check 流程、呈现纪律与输出 JSON 的 layout/takeaway；updater/bootstrap 同步 | 8 passed |
| `tests/unit/core/packs/domain-learning/dl-agent-actions.spec.ts` | 原有门禁（证据/难度/渐进/归一/深度提醒/规划轮）不回归 | 24 passed |

命令与结果：

```
node scripts/vitest-electron.cjs run tests/unit/shared/lesson-layout.spec.ts tests/unit/shared/lesson-spec.spec.ts \
  tests/unit/core/packs/domain-learning tests/unit/renderer/domain-learning
# → Test Files 1 failed | 41 passed (42)；Tests 3 failed | 451 passed (454)
node scripts/vitest-electron.cjs run tests/unit/core/platform/workflow/builtin-skills-lesson-layout.spec.ts
# → 8 passed
node scripts/vitest-electron.cjs run tests/unit/core/platform/workflow/builtin-skills-pedagogy.spec.ts
# → 34 passed（v6 重点契约未被本轮改动破坏）
```

- `npx vue-tsc --noEmit`：本轮改动文件**零报错**（输出中仅剩既有报错，如 `src/agents/*`、`lw-*` 仓库的类型问题，均非本次引入；
  期间自查修掉两处自己写出的模板字符串反引号与一处未使用导入）。
- 既有失败（与本轮无关，工作树未改动这些文件）：
  - `tests/unit/renderer/domain-learning/lesson-typography.spec.ts` 3 例——断言要求 `th,\n  td {` 这类带缩进的选择器，
    而 `lesson-markdown.scss` 实际是无缩进写法（2026-09-15 v6 那轮也已登记为既有不一致）；
  - `tests/unit/packs/workflow-pack.spec.ts` 1 例——workflow 包 handler 出现 `ac:` 前缀而 manifest 未声明（资产中心那轮留下的既有不一致）；
  - `tests/unit/packs/pack.service.spec.ts`（postgres 组）等既有 flaky。

## 五、真机验收建议

1. 打开任一空间 → 选一个**没有讲义**的知识点 → 点「研究此概念」：
   预期先出**讲义方案弹窗**（读者画像/目标/篇幅/术语记号/区级计划，每区版式可改），确认后才写正文；
2. 确认后观察活动行是否逐区滚动（`dl_task_progress`），落库后中栏讲义是否：**顶部有规格条 + 区导航**、
   每区有**版式徽标**与**一句话结论**、正文是**要点卡/对比表/步骤条/图解/数据看点…**而不是一堵字；
3. 抽查一张讲义是否**至少有一个 figure 图或对比表**（没有的话落库会被拒并给出补图建议）；
4. 点某区标题行的「**重写此区**」：应只重写该区，其余区内容逐字不变；
5. 打开「讲义演示」：封面应有读者画像与"学完能做到"，正文按设备分页，自测答案单独成页；
6. 老讲义（无 spec、无 layout）打开应**照常渲染**：规格条不显示，版式按区 key 兜底（不报错、不丢内容）。

## 六、后续可做（未在本轮范围）

- 视觉自检复核（对照 ppt-master 的 visual-review：生成后按设备做一次"读者扫读"复检）。
- 讲义**导出**时带版式（当前导出 md/PDF 只带 markdown；设备化呈现只在应用内渲染层生效）。
- `dl_save_card` 的"逐区落库"（现在是整卡一次提交；若要更细的断点续写，需要分区块工具）。
- 质检报告在 UI 侧的显性呈现（现在只随动作摘要回给模型与用户；可做成讲义头的"呈现体检"角标）。
