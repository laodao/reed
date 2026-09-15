# 领域学习：讲义模板 v7（章节合并 + 突出重点 + 示例放到详解之后 + 不要卡片样式）

日期：2026-09-15（第二轮）
关联设计：`tasks/2026-09-07-domain-learning-space/content-template-design.md` §9
前一版记录：`progress/2026-09-15-domain-learning-emphasis-v6.md`

## 一、用户口径（本轮定稿）

> 「我并不是要把之前的内容推倒重来，我要的是结构优化，把重点章节写详细，突出重点。然后调整一下顺序，比如示例我认为要在详解后面。」
> 「结构和规则难道不属于详解吗？那你详解准备写什么内容呢？」
> 「案例……呼应前面的定义、详解，结合实际案例让用户更好的理解就可以了。」（不要反事实推演、不要堆概念）
> 「章节太细碎，显得重点不突出，有些是不是可以考虑合并？」
> 「不要卡片样式。」「记得要保留历史版本，我好对比看。」

四条执行口径：**①合并细碎章节；②重点是定义/详解/案例这三节并写详细；③案例紧跟详解之后；④整篇不要卡片样式。**

## 二、改了什么

### 1. 契约层 `src/shared/utils/lesson-template.ts`（v7）

- `LessonSectionSpec.mergedInto`：声明"这一区已并入哪一区"，归一化时该 key 及其同义写法**直接折到目标 key**；
- 合并表：**本质→定义**；**机制/组成与结构/规则/公式/性质/步骤/依据/适用与局限→详解**；**反例与边界→案例**；**补充与注意→常见坑**；
- `LESSON_ACTIVE_SECTION_KEYS`：只含生效区（提示词的"区写作要求总表"只列这些，历史区不进提示词）；
- 新模板（六类）：`meta → why →（statement/definition）→ detail → examples → code → distinguish → pitfalls → selfcheck → answers → notes`
  （K-concept 从 15 区降到 10 区；K-agent/K-open 补上「定义」区，因为本质并入了它）；
- `normalizeCardSections` 升级：**同 key 合并**（内容按出现顺序拼接，折叠标记"都折叠才算折叠"）+ **原区标题作为 `### 小标题` 保留**（如 `### 适用与局限`，内容与章法都不丢）+ **按当前模板区序重排**，并在 `changes` 里说明"并入/重排"；
- 写作要求（brief）重写为**逻辑要求**而非字数：详解区要求"主线 + 同一组维度逐类展开 + 横向对比表 + 判定与计算规则"，案例区要求"背景 → 对应哪条 → 结论，呼应定义与详解"，并明确"不要反事实推演、不要抽象罗列"；
- 提示词渲染：只给重点区打 `[重点]` 标记（不再给非重点区贴"导学/从简"标签）；`checkLessonDepth` 去掉"本质 vs 定义"那条（本质已并入定义）；
- 历史留档：`LESSON_TEMPLATES_V6` 新增（v5 已有），`LESSON_LEGACY_TEMPLATES = [v6, v5]`，`LESSON_TEMPLATE_VERSION_CURRENT = 'v7'`。

### 2. 不要卡片样式

- `src/shared/utils/lesson-layout.ts`：`defaultLayoutForSection` **一律 `prose`**（设备目录与显式 `layout` 路径保留；质量检查里"版式单调/要点没精炼/模板兜底形状建议"对 prose 不再适用）；
- `src/renderer/src/views/domain-learning/SectionLesson.vue`：去掉引言区/注意区的底色与圆角、去掉一句话结论的色条与底色、答案折叠入口改普通文字链接 → 讲义按**文档式**排（区标题 + 段落 + 表格 + 图）；
- 生成侧提示词统一要求"**按文档写**（段落 + 小标题 + 表格），不要做成要点卡堆砌、不要用引用块装饰"。

### 3. 生成侧提示词

- `src/core/platform/workflow/skills/builtin-skills.ts`：区集契约块换成 v7 口径（合并 + 重点 + 案例后置 + 不要卡片）；六类主线速览更新；`learning-concept-explainer` 教学纪律第 1 条改写成 ①~⑤ 五小条；bootstrap S4、updater 纪律 3、writer 要求 1 同步；
- `src/core/packs/domain-learning/services/dl-agent-deps.ts`（研究模式系统提示词）：同一份 v7 口径 + 写作要求总表；
- `src/core/packs/domain-learning/services/dl-agent-tools.ts`：`dl_save_card` 工具描述、`sections` 字段描述、`layout` 字段描述（默认不填 = 文档式）同步 v7。

## 三、测试

新增/更新用例（全部实跑通过）：

- `tests/unit/shared/lesson-template.spec.ts`：重写为 v7 契约（合并去向、生效区、新序、brief 的 `[重点]` 标记、`checkLessonDepth`、归一化"合并 + 重排 + 原区标题保留 + 幂等"、自造区名仍拒绝、历史模板留档）；
- `tests/unit/shared/lesson-layout.spec.ts`：默认版式一律 prose（删掉基于旧默认版式的"形状建议"用例）；
- `tests/unit/shared/lesson-sections.spec.ts`、`tests/unit/renderer/domain-learning/section-lesson.spec.ts`：essence/edge/worked 的兜底标题与样式随合并更新；
- `tests/unit/core/platform/workflow/builtin-skills-pedagogy.spec.ts`：重写为用户本轮口径的六条断言（重点分配 / 合并 / 详解内容 / 案例后置 / 不要卡片样式 / bootstrap 与 updater 同步）；
- `tests/unit/core/packs/domain-learning/dl-agent-actions.spec.ts`：老卡重存 → 合并进详解并重排且内容不丢；乱序 → 自动重排并说明；重点区过简提醒；自造区名拒绝；
- `tests/unit/core/packs/domain-learning/dl-lesson-pipeline.spec.ts`、`dl-plan.service.spec.ts`：区级计划/视觉质检的 fixtures 里 `structure/essence` 换成 v7 的 `detail/definition`（**注意：这两个文件是另一路并行开发新加进来的讲义流水线，本轮只改了它们的取样数据**）；
- `tests/unit/core/packs/domain-learning/dl-agent-bindings.spec.ts`：工具描述口径。

实跑：
- `tests/unit/shared` + `tests/unit/core/packs/domain-learning`：**50 文件 / 574 用例全通过**；
- 相关单文件：`lesson-template`(35)、`pedagogy`(34)、`dl-agent-actions`(24) 全通过；
- 全量 `tests/unit` 的既有无关失败（`lesson-typography` 的 CSS 断言、`workflow-repositories` 的 SQLite 串行门、`multi-tenant`）仍在，与本次改动无关。

## 四、对照材料（都保留着，便于对比）

| 文件 | 内容 |
|---|---|
| `progress/2026-09-15-archive-jinrong-zichan-jiben-leixing-current.md` | **线上现有版本 v1**（2026-09-13 落库，15 区）只读导出，未改库 |
| `progress/2026-09-15-sample-jinrong-zichan-jiben-leixing-v6.md` | v6 试写稿（示例后置但区未合并） |
| `progress/2026-09-15-sample2-jinrong-zichan-jiben-leixing-v7.md` | **v7 对照稿**：10 章；定义（含直觉）2001 字、详解 8162 字（主线 + 逐类 + 对比表 + 十条规则）、案例 2204 字（三个真实场景，呼应定义与详解） |

## 五、真机验收

1. 重启应用（主进程内联技能/提示词改动需要重启才生效）；
2. 打开「金融理财」→ 该知识点 → 右栏发「请重新研究「金融资产的基本类型（股权/债权/商品/外汇/衍生品）」，按新契约产出新版讲义」；
3. 核对：章节数≈10；**定义 → 详解 → 案例** 的顺序；详解是最大篇幅且含主线/逐类/对比表/判定规则；案例紧跟详解并回指定义与详解；**界面不再出现卡片式色块**；
4. 新版以 **v2 草稿**落库，v1 仍在「讲义版本历史」里可查看/恢复（对比用）。

## 六、后续可做

- 旧讲义若要变成 v7 形状：重新生成，或在右栏让 AI 做一次增量修订（updater 已要求"把机制/结构/规则/适用并进详解、案例移到详解之后"）；
- 讲义流水线（区级计划 roster）已由另一路并行开发落地：其区集取样请按 v7 的 `definition/detail/examples` 提交；
- 若后续想恢复"某些区用要点卡呈现"，只需在 roster/区里**显式声明** `layout`（设备目录与渲染路径都还在）。
