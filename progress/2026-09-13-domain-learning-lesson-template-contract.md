# 领域共学：讲义区集契约落地（同主题不同知识点结构与答案形态统一）

日期：2026-09-13
触发：用户反馈「同一个主题下的知识模板没有统一，不同知识点生成的知识内容格式不同——大标题不同、自测答案结构不同（张量的答案分离默认不显示，自动微分与反向传播的答案与习题在一起直接显示）」
取证与根因：`progress/2026-09-13-domain-learning-lesson-template-inconsistency.md`
用户拍板（三选）：① 模板粒度=**按本质类型（K-concept/K-oper/…）固定区集**；② 不合规模卡=**能无损映射就自动归一化、映射不了才拒绝**；③ 历史卡=**先不动，只做渲染层兜底让它们看起来一致**。

---

## 一、落地内容（四层）

### 1. 契约层：`src/shared/utils/lesson-template.ts`（新增，唯一事实来源）

| 导出 | 作用 |
| --- | --- |
| `LESSON_SECTION_CATALOG` | 区目录：22 个规范 key → 中文标题 / 样式 / 同义写法别名（`checks`→`selfcheck`、`worked`→`examples`、`cost`→`application`…） |
| `LESSON_TEMPLATES` | 6 种本质类型的**固定区序**（有序子序列校验依据） |
| `canonicalSectionKey` / `sectionTitleOf` / `sectionStyleOf` / `isSectionAllowed` | 别名归一与标题/样式派生 |
| `normalizeLessonHeadingLevels` | 区正文小标题统一降到 `###`（**代码围栏内原样保留**，避免改坏代码里的 `#`） |
| `normalizeCardSections` | 可无损映射的修复：别名改名 + 标题/样式派生 + 标题层级归一 + 自测答案拆独立 `answers` 区 |
| `checkLessonSectionsShape` | 修复后校验：自造区名 / 区序乱 / 自测区残留行内答案 → 给出可执行的拒绝原因 |
| `lessonTemplateHint` | 生成侧提示词与门禁共用同一份区序文案（杜绝"提示词一份口径、门禁另一份"） |

K-concept 模板（示例）：`meta 学习前必读 → essence 本质 → why 为什么学它 → examples 示例 → definition 定义 → mechanism 机制 → structure 组成/结构 → rules 规则 → formula 公式 → property 性质 → procedure 步骤 → application 适用与局限 → counterexample 反例/边界 → distinguish 辨析 → code 落到代码 → detail 详解 → edge 示例与注意 → pitfalls 常见坑 → selfcheck 自测 → answers 参考答案 → notes 编写注记`。

设计取向：**只约束命名与顺序，不强制必备区**——某概念确实没有代码示例就不该硬凑 `code` 区（宁缺毋滥）；`meta` 首区仍由既有循序渐进门禁把守。

### 2. 门禁层：`dl_save_card`（`dl-agent-actions.ts`）

校验链新增一步（位置在难度/渐进/数值门禁**之前**，让后续门禁与落库看到同一份规范区集）：

1. `normalizeCardSections` 先把能无损映射的修好；
2. `checkLessonSectionsShape` 校验，不合格 → 抛错，错误信息里带上该类型的完整模板区序 + 修复指引；
3. 落库写的是**归一化后的区集**，动作摘要里附「结构已按 K-concept 模板归一：…」变更清单（可追溯，不静默改数据）。

### 3. 渲染层兜底（历史数据不改写）：`lesson-sections.ts` / `lesson-selfcheck.ts`

- `DEFAULT_SECTION_TITLES` / `defaultSectionStyle` 改为读契约（别名一并认）→ 历史卡里 `checks`/`quiz`/`selftest`/`self-check` 现在也能拿到**自测区的 review 样式**（此前按普通正文渲染）；
- `planLessonSections`：区 key 先归一，正文与答案的标题层级统一到 `###` → 历史卡里用 `##` 写的正文不再与区标题抢视觉；
- `isAuthoringNotesSection` 认 `authoring-notes` 别名；answers 别名清单与目录保持一致（有平权用例守护）。

### 4. 生成侧提示词（契约直达模型，不再只躺在技能正文里）

- `dl-agent-deps.ts` 研究模式系统提示词：在"讲义落库"条款下补**区集契约**（6 类型完整区序表 + 标题由模板派生 + 正文 `###` + 答案必须独立 `answers` 区）；
- `builtin-skills.ts`：新增 `LESSON_SECTION_CONTRACT_RULES`（由契约生成），注入 `learning-concept-explainer` 第 9 条、`learning-lesson-updater` 第 3 条、`learning-space-bootstrap` S4，并改写第 6 条自测规范（行内答案会被门禁**直接拒绝**）。

> 这一步同时缓解了根因②：契约现在直接写在**研究模式系统提示词**里，不再依赖 `invoke_skill` 那条无工具单次生成路径去传递规范。

---

## 二、验证

| 验证项 | 结果 |
| --- | --- |
| `tests/unit/shared/lesson-template.spec.ts`（新增 21 例） | ✅ 通过（目录自洽、模板自洽、标题层级归一含代码围栏、真机两张卡形状、三类拒绝信息、别名平权） |
| `tests/unit/shared/lesson-sections.spec.ts`（新增 4 例历史卡回归） | ✅ 18 例通过 |
| `tests/unit/shared/lesson-selfcheck.spec.ts` | ✅ 12 例通过 |
| `tests/unit/core/packs/domain-learning/dl-agent-actions.spec.ts`（新增 3 例门禁集成） | ✅ 20 例通过（含：归一化落库、`practice` 拒绝、乱序拒绝） |
| `tests/unit/core/packs/domain-learning`（整目录） | ✅ 13 个文件 137 例通过（另 2 个文件为修改前的语法错误，已修复后复跑通过） |
| `builtin-skills-pedagogy` / `-bootstrap` / `-research-method` | ✅ 28 / 6 / 11 例通过（新增"区集契约"契约用例） |
| `tests/unit/renderer/domain-learning`（SectionLesson / LessonSlides / 排版） | ✅ 通过 |
| `npm run typecheck` | 改动文件无报错（`src/web/**` 等他人分支的既有报错与本改动无关，未触碰） |

真机取证脚本（只读）：`progress/_dl_lesson_shape.cjs`、`progress/_dl_lesson_shape_summary.cjs`、`progress/_dl_essence_check.cjs`、`progress/_dl_recent_cards.cjs`（查指定时间之后新落的卡，用于上线后回归）。

### 上线动作（dev 实例）

`electron-vite dev` 这次**没有**因为主进程源码变更自动重建/重启（`out/main/index.js` 时间戳停在我启动 dev 的时刻 22:21），
所以改动只通过 HMR 生效在渲染层。已显式重启 dev（旧实例 kill → `npm run dev`）：

- 新构建：952 模块（原 950，含新增契约模块），`builtin-packs` chunk 1,264.08 kB → 1,265.23 kB，构建时间 22:54:58；
- 产物核验（node 按 utf8 读 `out/main/**/*.js`）：「的模板区集内」「区序不符合」「自测区里还留着行内答案」「按同义写法归一为」「结构已按…模板归一」「不能自造区名」全部命中 → 门禁与提示词确实在运行的主进程包里；
- 应用已起（窗口「首页 - The Bot」）。

**上线后第一张新讲义怎么验**：

```powershell
$env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd progress\_dl_recent_cards.cjs "2026-09-13 22:50"
```

它会打印新卡的区序与区标题——应与该本质类型的模板一致（标题由模板派生），且自测答案落在独立 `answers` 区。
（截至本次交付，重启后尚未有新卡落地：在跑的研究轮卡在采集阶段——`wf_web_extract` 多次超时/403、`wf_kb_retrieve` 报"知识库不存在"、`dl_save_relation` 被 `maxCalls=14` 上限拦截，这些都属既有的采集与预算问题，与本次改动无关。）

---

## 三、历史数据现状（未动，符合用户口径）

- 深度学习空间：`张量 v2` 本来就能折叠答案（题面后跟独占一行的 `**答案**`），保持原样；
- `自动微分与反向传播 v1~v3`：`checks` 区现在**有了自测样式**、正文 `##` 也降到 `###`，但它的答案是与题目混排的（`**答案 1**：…`），渲染期无法无损切分 → **答案仍直接显示**。要彻底一致需要**重新生成这张讲义**（下一次研究会自动按契约产出 `selfcheck` + `answers` 两区）；
- 贝叶斯空间 431 张历史卡同上：样式与层级已统一，区集仍是各自的形状（不重写、不新建版本）。

---

## 四、后续可做（未做，等指令）

1. 给空间加「按模板重整讲义」入口（用户逐概念触发，预览 diff，新建 version 留档）——本次用户选择"先不动"；
2. `learning-practice-builder` / `learning-question-generator` 的产出若也要回写讲义，同步接入同一契约；
3. 平台批（`invoke_skill` 注入式改造）落地后，把契约从"提示词里写死"进一步收敛为"注入式技能正文"，减少提示词重复。
