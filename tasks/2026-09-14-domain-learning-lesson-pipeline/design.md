# 讲义生成流水线（Plan → Do·Check·Act）设计

日期：2026-09-14
目录：tasks/2026-09-14-domain-learning-lesson-pipeline/
前置：`tasks/2026-09-07-domain-learning-space/content-template-design.md`（区集契约 v5）、
`progress/2026-09-13-domain-learning-lesson-template-contract.md`
参考：开源项目 ppt-master（`C:\Users\daoge\code\opensource\ppt-master-main`，MIT）

## 0. 问题（用户原话）

> 「领域学习模块，生成讲义功能太简陋……**不美观，纯粹的堆砌文字，没有对文字做精炼归纳，没有配图，布局单调简陋**。」
> 复选认定：① 生成流程缺「大纲/规格」规划与确认；② 呈现排版（卡片与幻灯片）弱。

现状实测：用户点「研究此概念」→ 一次 LLM 调用直接产出整篇 `sections` → `dl_save_card`。
既有门禁只管「区名/区序（lesson-template）、证据非空、meta 首区 + 前置、难度记号、数值自洽」，
**没有**任何关于「这一区长什么样、读者扫一眼看到什么、要不要配图」的约束——于是模型写成
大段散文，标题之外没有任何视觉载体，每张卡结构雷同。

## 1. 从 ppt-master 迁移的骨架（不是抄内容，是抄纪律）

| ppt-master 机制 | 本设计对应物 |
|---|---|
| `routing.md` + Plan→Do·Check·Act 阶段化 | 讲义生成拆为 **规格与大纲（Plan，含用户确认门）→ 逐区精写（Do，锁规格）→ 质检（Check）→ 定点修订（Act）** |
| `design_spec.md`（§I~§X 完整规格） | **讲义规格 `DlLessonSpec`**：读者画像 / 学完能做到 / 深度 / 篇幅预算 / 语气 / 术语表 / 记号表 / 示例参数表 / 视觉计划 / 区级计划 |
| `spec_lock.md`（锁定色板、字号角色、每 5 页回读） | **规格锁**：`lessonSpecLock()` 把规格压成一段随轮注入的锁文本；技能规定每 3 区回读一次，防术语/记号/算例参数漂移 |
| §IX page roster（每页 page job / Composition / topology） | **区级计划 roster**：每区 `{ key, layout, job（这一区为读者做什么）, carrier（要什么载体）, takeaway（一句话结论）}` |
| Executor 的 device menu（card / band / KPI tile / quote block…） | **版式设备目录（15 个 `DlLessonLayout`）**：prose / keypoints / compare / steps / figure / worked / formula / stats / quote / timeline / pitfall / checklist / code / qa / callout |
| `svg_quality_checker.py --stage early/final`（blocking / warning 两级） | **`checkLessonVisualQuality`**：阻断（文字墙、无图无表、声明版式与正文形状不符、大纲要求载体缺失）+ 警告（长区未归纳、版式单调、纯文字连排、要点没精炼） |
| 「Act at the owning layer」定点修 | 区级**「重写此区」**入口 + `learning-lesson-polisher` 技能（按质检报告改区，不整篇重写） |
| Quick profile（可跳过确认） | 未提交大纲也能落卡（快速模式），但**视觉质检门禁照样生效**——质量不因省一步而放弃 |

## 2. 分层与唯一事实来源

```
shared/utils/lesson-template.ts   区集契约（已有）：区名 → 标题/样式/顺序
shared/utils/lesson-layout.ts     版式设备契约（新）：设备目录 / 正文形状分析 / 视觉质检 / 条目解析
shared/utils/lesson-spec.ts       讲义规格契约（新）：规格归一化 / 大纲一致性与载体覆盖 / 规格锁文本
shared/types/domain-learning.types.ts  DlLessonSpec / DlCardSection.layout,takeaway / DlPlanStep+lesson
```

生成侧（技能正文 + 系统提示词）、落库门禁（`dl_save_card`）、渲染兜底（`SectionLesson` 设备渲染）、
确认弹窗（`LessonPlanDialog`）**全部读同一份契约**，杜绝「提示词一套口径、门禁另一套」。

## 3. 流程（一次讲义生成的完整链路）

1. **Plan**：研究轮调用新技能 `learning-lesson-designer` → 采证 → 调 `dl_propose_lesson_plan`
   提交 `DlLessonSpec`（含 roster 与载体计划）。
2. **确认门**：前端拉 `dl:get-plan`（带 conceptId）→ 有待确认讲义方案 → 自动弹 `LessonPlanDialog`
   （可改每区版式 / 写调整意见 → 驱动模型重做）。确认 → `dl:confirm-plan step='lesson'`
   → 驱动下一轮（消息带【已确认讲义方案】）。
3. **Do**：宿主把**规格锁**注入研究轮；模型用 `dl_task_progress` 逐区报进度、逐区照 roster 精写，
   一次 `dl_save_card` 落库（sections 带 `layout` / `takeaway`）。
4. **Check**：`dl_save_card` 依序跑 区集契约 → 大纲一致性（含载体覆盖）→ 视觉质检 → 难度/渐进/数值。
   阻断即拒绝并给出**可执行修复**（哪一区、补什么载体、怎么写）；警告进动作摘要给用户看。
5. **Act**：区级「重写此区」→ 把该区正文 + 质检问题交给 `learning-lesson-polisher` → 只回该区新 md →
   仍走 `dl_save_card`（未改动区逐字保留）。

## 4. 渲染（用户最直观的痛点）

`SectionLesson` 从「序号标题 + 一坨 markdown」升级为**设备渲染**：

- 顶部 `LessonSpecBar`：读者画像 / 学完能做到 / 深度 / 篇幅 / 术语与记号 chips + 区导航（点击跳转）；
- 每区：序号 + 标题 + **版式徽标** + 一句话结论条（takeaway）+ 设备正文；
- 设备正文（`LessonSectionBody`）：要点卡网格、对比表卡、步骤条、数据看点（大字 + 说明）、
  时间线、误区警示卡、勾选清单、算例框、公式框、引文块、结论条、可运行代码、自测题卡；
- `LessonSlides` 讲义演示：封面带读者画像与目标，按设备分页，自测答案独立成页。

## 5. 验收

- `tests/unit/shared/lesson-layout.spec.ts` / `lesson-spec.spec.ts`：设备目录、形状分析、质检两级、
  条目解析、规格归一与大纲一致性（含载体缺失）。
- `tests/unit/core/packs/domain-learning/*`：`dl_propose_lesson_plan` / `confirm lesson` /
  `dl_save_card` 视觉门禁（文字墙被拒、无图被拒、大纲载体缺失被拒）与规格落库。
- `tests/unit/renderer/domain-learning/*`：设备渲染结构、规格条、大纲确认弹窗、幻灯片分页。
- `npx vue-tsc --noEmit` 无新增错误；`npm test` 全绿。