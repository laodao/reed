# 领域学习：讲义契约 v8（章节再合并 + 核心骨架显式化 + 有编号的大标题加底色）

日期：2026-09-15（第三轮）
关联设计：`tasks/2026-09-07-domain-learning-space/content-template-design.md` §10
前一版记录：`progress/2026-09-15-domain-learning-merge-v7.md`

## 一、用户口径（本轮）

> 「1. 知识内容正文，有编号的大标题，增加底色突出一下。
> 2. 章节太细碎，能否再整理一下，该合并的合并，突出重点，我认为知识点的**定义、详解（含规则和逻辑）、
> 示例、自测**这几部分是核心骨架，有些领域的知识可能还会有**具体的操作**，不同领域可能会有所不同，
> 但是核心结构是类似的，你仔细检查已有的各个类型的知识内容模板。」

拆成两条可执行口径：

1. **视觉**：讲义正文里有编号的大标题（区标题行）要加底色突出；
2. **结构**：章节再合并一档，把「核心骨架」在六类模板里显式化——定义 / 详解（含规则和逻辑）/ 案例 / 自测，
   另加「实操」这一**按领域出现**的区。

## 二、改了什么

### 1. 契约层 `src/shared/utils/lesson-template.ts`（v8）

- **再合并三组**（`mergedInto` 声明，老卡内容一字不删、原区标题留作 `### 小标题`）：
  - `why`（为什么学它）→ **meta**（学习前必读，动机写成 `### 为什么学它`）；
  - `procedure`（步骤）、`code`（落到代码）→ **operation**（新生效区「实操」）；
  - `distinguish`（辨析）、`pitfalls`（常见坑）、`edge`（补充与注意）→ **confusions**（新生效区「辨析与易错」）；
- **生效区 13 → 11**：meta / statement / definition / detail / controversy / examples / operation /
  confusions / selfcheck / answers / notes；
- **六类模板长在同一条主干上**（用户说的"不同领域会有所不同，但核心结构类似"）：
  ```
  学习前必读 →（陈述/条文）→ 定义 → 详解 →（争议与评价）→ 案例 →（实操）→ 辨析与易错 → 自测 → 参考答案 → 编写注记
  ```
  K-concept/K-oper/K-inst 无陈述区、无争议区；K-stmt 多「陈述/条文」；K-agent 多「陈述 + 争议与评价」；
  K-open 多「陈述 + 争议与评价（排在详解之前）」。章节数：K-concept 15(v5) → 10(v7) → **8(v8)**；
- **重点永远只有三节**：definition / detail / examples（core/case，带参考字数下限与 `[重点]` 标记）；
  operation / confusions / controversy 都是支撑区，不打 `[重点]`；
- **「实操」的写作口径随领域变**：编程=代码与命令、法规=申报与办理流程、金融=计算与下单步骤；
  一句纪律写死"没有可照做的操作就整区不出现，不要硬凑"；
- 历史留档：新增 `LESSON_TEMPLATES_V7`，`LESSON_LEGACY_TEMPLATES = [v7, v6, v5]`，
  `LESSON_TEMPLATE_VERSION_CURRENT = 'v8'`；归一化变更文案改为读版本常量（不再写死 v7）。

### 2. 渲染层：有编号的大标题加底色 + 字号加大一号

- `SectionLesson.vue`：有编号的标题行加 `.sec-head-numbered`（主色浅底 + 圆角 + 内边距，序号徽标改实色块）；
  **标题字号 15px → 17px**（用户追加口径「有编号的大标题，字体加大一号」：此前只比正文大 1px，
  压不过正文 h3 的 14.5px，层级立不住）；
  无编号行（相关知识点 / 相关著作 / 证据来源 / 跟随区）不上底色、不上主字号；**只给标题行上底色**，
  正文仍是文档式（承接上一轮「不要卡片样式」）；
- 样式契约测试（`section-lesson.spec.ts`）：读 SFC 源码断言 `.sec-title` ≥17px 且大于跟随区标题与正文 h3；
- `LessonSpecBar.vue`：区导航里的跟随区显示 `·` 而不是 `0`；
- 导出：`DOCUMENT_TEMPLATES.learningLesson` 的 `h2` 同步加底色（PDF / 长图与站内同一视觉）。

### 3. 自测：参考答案不再占章节编号（跟随区）

- `lesson-sections.ts`：`planLessonSections` 把"整区就是答案"的区标为**跟随区**（`follower=true`、`no=0`）——
  仍默认折叠、仍在自测之后，但不再算一章；`SectionLesson` 对它不显示序号徽标。
  用户口径里「自测」是核心骨架的一节，参考答案是它的收尾折叠块，不该在目录里再算一章。

### 4. 生成侧提示词（同一份契约，四处消费）

- `builtin-skills.ts`：区集契约块改写为 v8（核心骨架 + 归并去向 + 实操的适用条件 + 大标题底色说明）；
  `learning-concept-explainer` 教学纪律 ①~⑦ 重排（新增「实操」「辨析与易错」两条）；
  六类主线速览、JSON 示例（`essence` → `definition`）、`learning-lesson-writer` 第 1 条、
  `learning-lesson-updater` 纪律 3、`learning-space-bootstrap` S4 同步；
- `dl-agent-deps.ts`（研究模式系统提示词）、`dl-agent-tools.ts`（`dl_save_card` 与 sections 字段描述）同步；
- `lesson-spec.ts`（写作锁的纪律 ④）同步。

## 三、测试

新增/更新用例（实跑通过）：

- `tests/unit/shared/lesson-template.spec.ts`：重写为 v8 契约（再合并去向、11 个生效区、
  「六类模板同主干」断言、实操/辨析的 brief 断言、归一化"为什么学它并进导学 + 代码并进实操 +
  辨析常见坑并成辨析与易错"、幂等、历史模板 v5/v6/v7 章节数逐版下降）；
- `tests/unit/shared/lesson-sections.spec.ts`：跟随区编号断言（答案不占号、不打断后续编号）；
- `tests/unit/renderer/domain-learning/section-lesson.spec.ts`：有编号标题带 `.sec-head-numbered`（相关区不带）、
  参考答案跟随区无序号徽标、**标题字号契约**（17px > 跟随区标题 / 正文 h3 14.5px）；
- `tests/unit/core/platform/workflow/builtin-skills-pedagogy.spec.ts`：v8 口径断言（核心骨架 / 合并去向 /
  实操只在该写时写 / bootstrap 与 updater 同步）；
- `tests/unit/core/packs/domain-learning/dl-agent-bindings.spec.ts`、`dl-agent-actions.spec.ts`：工具描述与门禁文案。

实跑：

- `tests/unit/shared` + `tests/unit/core/packs/domain-learning` + `tests/unit/renderer/domain-learning`：
  **65 文件 / 713 用例，710 通过**；
- 3 条失败全部是**既有无关失败**：`lesson-typography.spec` 的 CSS 选择器断言（读的是 CRLF 文件里
  的 `th,\n  td {` 这类多行选择器，与本次改动无关；`lesson-markdown.scss` 本轮未改动）；
- `npx vue-tsc --noEmit`：报出的错都在既有无关文件（web/router/workflow-node-*），本轮改动的文件无新增错误。

## 四、真机形状对照（真实样例走一遍契约）

`scripts/dl-lesson-v8-preview.ts`（一次性验证脚本）把 **v7 期真实样例**
`progress/2026-09-15-sample2-jinrong-zichan-jiben-leixing-v7.md` 按 v8 归一：

```
契约版本：v8
归一前 10 区 → 归一后 8 区
meta / 学习前必读      1204    ← 原「为什么学它」437 字并进来
definition / 定义     2001
detail / 详解         8162
examples / 案例       2204
confusions / 辨析与易错 1105   ← 原「辨析」440 + 「常见坑」654 并成一区
selfcheck / 自测        472
answers / 参考答案     1530    ← 跟随区，不占章节编号
notes / 编写注记        783
合并记录：why → meta；distinguish → confusions；pitfalls → confusions（内容保留，未删除）
门禁：ok=true（无附注）；重点占比 71%（12367/17461 字）
```

## 五、真机验收

1. 重启应用（主进程内联技能/提示词改动需要重启才生效）；
2. 打开任一共学空间 → 任一有讲义的知识点：
   - **章节标题行有底色**（序号实色块 + 浅底标题行），相关知识点/相关著作/证据来源不上底色；
   - **参考答案没有序号**（在自测之后、默认折叠）；
3. 让 AI「按新契约产出一版讲义」（或重新研究该知识点）：应得到 8 章左右，顺序为
   学习前必读 → 定义 → 详解 → 案例 →（有操作才有的）实操 → 辨析与易错 → 自测（+ 折叠答案）；
4. 老讲义重存/增量修订时会自动合并重排（内容不丢、原区标题变成 `### 小标题`），
   新版以 **v+1 草稿**落库，旧版仍在「讲义版本历史」里可对比/恢复。

## 六、后续可做

- 若某种本质类型的「实操」长期不出现（如纯理论领域），可考虑把它收窄成"仅 K-oper/K-inst 模板可用"；
- 讲义方案弹窗（roster）里可以给「实操」区一个默认版式（steps/checklist），减少模型自由发挥的偏差。