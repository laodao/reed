# 领域共学空间：前置要求（主题级 + 知识点级）与"生成时就循序渐进"（2026-09-12 第二轮）

> 日期：2026-09-12 | 前置：`progress/2026-09-12-domain-learning-content-quality-and-typography.md`（同日第一轮：内容质量/排版 7 条）
>
> 用户追加需求：
> 1. 「关于循序渐进，在生成知识点的时候，就应该在提示词中提示模型。知识点的顺序要循序渐进。」
> 2. 「增加一个整个主题学习的前置要求，每个知识点学习的前置要求。」

## 1. 口径（本轮定稿）

| 层 | 含义 | 载体 | 谁写 |
|---|---|---|---|
| **主题前置要求** | 学**整个领域**之前需要具备什么（含领域外需自备能力，如「Python 基础」「线性代数基础」） | `dl_project.prerequisites`（JSON `DlSpacePrereq[]`） | 研究会话 `dl_save_space_prereqs`；用户可在空间设置里改 |
| **知识点前置** | 学**这个知识点**之前必须先掌握什么 | ① 声明：`dl_concept.attrs.prerequisites`（生成知识点时即声明）② 权威：`dl_relation` 的 `prerequisite` 边（门控/图用它） | 研究会话 `dl_save_concept(prerequisites)` + `dl_save_relation` |
| **顺序保障** | 前置不齐不许硬排、相邻层级跨度不超过一步 | 生成契约（技能/提示词）+ 快照欠账提醒 + 落卡门禁 | 系统 |

`inSpace`（该前置是否会在本空间内教）**由系统按空间实际概念反推**，不信模型自报——避免"标了会在空间内教、实际没这条知识点"。

## 2. 生成侧：提示词与技能（用户要求的"生成知识点时就提示模型"）

- `learning-domain-map`（领域骨架技能）：
  - body 第一段立「**第一原则：顺序必须循序渐进**」，方法第 0 步就是「先定主题前置要求」；
  - 输出契约新增 `spacePrerequisites: [{name, why, level}]`，与 `concepts[].prerequisites` + `layer` 并列；
  - 「不跳级」判定改为：前置要么在 concepts 清单里、要么在 spacePrerequisites 里；
  - 新增「顺序即路径」自检：按 layer 排一遍，每一步只需要前面已出现的知识；**相邻层级跨度不要超过一步**（明确举例：张量 → 自动微分之间必须补「导数与链式法则」）。
- `learning-space-bootstrap`（空领域起步研究）：S2 第一步改为「先 dl_save_space_prereqs 落主题门槛」，再落概念（**每个概念都要填 prerequisites**），S3 自检顺序闭环并明确"相邻层级跨度不得超过一步"。
- `learning-concept-explainer`（讲义技能）：meta 的「前置」小节必须与 `attrs.prerequisites`、图上前置边、空间主题前置三者一致（做法：直接从快照复制）。
- `dlResearchSystemPrompt` 新增第 13 条「前置要求（生成知识点阶段就要做）」：主题级 / 知识点级 / 顺序即路径三小节；快照里带 ⚠️ 的条目就是"只有声明没建边/没落点"的欠账，优先补齐。
- `dlEmptySpaceMission`（空空间兜底指令）：同步为 6 步（先定门槛 → 再落知识点 → 逐条建边 → 首卡 → 其余待研究 → 总结）。

## 3. 快照：让模型每一轮都看得见门槛与欠账

`computeDlSpaceSnapshot` 现在注入：

```
【主题前置要求】（学习者进空间即见；inSpace=空间内已建知识点会教）
- 线性代数基础（空间内已建知识点；矩阵乘法与转置）
- Python 基础（需自备/另行补课；能用 NumPy 索引）
【各知识点前置】（学习顺序依据；用 dl_save_relation 补未建的关系边，source=前置、target=本概念）
- 自动微分与反向传播 ← 已建关系：张量 ；仅声明未建关系：导数与链式法则
⚠️ 「自动微分与反向传播」的前置（导数与链式法则）只有声明没有关系边——请 dl_save_relation 补。
⚠️ 「X」的前置（Y）在空间里没有落点——请 dl_save_concept 建成知识点并排在本概念之前（或若属领域外必备，用 dl_save_space_prereqs 列入主题前置要求）。
```

主题前置为空时也会显式催办（"请用 dl_save_space_prereqs 落库…确无需前置也要显式说明"），保证模型不会跳过这一步。

## 4. 写侧：动作与校验

- **新增工具 `dl_save_space_prereqs`**（`dl-agent-tools` + `dl-agent-actions`，频控 2 次/轮）：`items` 必填且必须是数组（确无需前置传空数组=显式清空）；规范化去空/去重/限 12 条；`inSpace` 按空间概念反推；落库后摘要报出"空间内会教 N 条 / 需自备 M 条"。
- **`dl_save_concept` 新增 `prerequisites`**：规范化（去空、去重、去自己、限 12 条）后写入 `attrs.prerequisites`（幂等更新路径同样保留）；落库后顺手给出跟进建议：
  - 已在图上的前置 → `data.linkablePrereqs` + 提示 `dl_save_relation`（source=前置 id → target=本概念 id）；
  - 没有落点的前置 → `data.missingPrerequisites` + 提示补概念或列入主题前置要求。
- **讲义循序渐进门禁**新增一条出路：某前置能力若已在**主题前置要求**里声明（名称命中），则不再强制图上存在对应知识点（门槛已明示给学习者）；否则维持原有"图里有前置概念 or 本卡 meta 已教学"两条出路。

## 5. 读侧：谁看得到、在哪看

- `DlSpaceView.prerequisites: DlSpacePrereq[]`；`DlConceptView.declaredPrereqs: string[]`（由 `attrs.prerequisites` 派生）。
- **空间页**顶部新增「学习前置」条：chip 显示 `空间内会教` / `需自备`，悬停给出 why + level；缺门槛时提示"学这个主题之前需要具备；缺的先补再开始"。
- **讲义头「前置：」行**除既有关系边 chip（绿=已掌握 / 橙=未掌握）外，新增**虚线 chip = 已声明但尚未建关系边**的前置：有同名概念时可点击跳转，没有同名概念时提示"空间里还没有对应知识点，先补它再学本概念"——顺序声明立刻可见，不必等关系人审。
- **空间设置面板**新增「主题学习前置要求」块：可增删名字（保留已有 why/level 明细），保存走新通道 `dl:set-space-prereqs`；读写通道三端（handler/preload/channel-map）齐备，由 `dl-channel-consistency` 护栏自动校验。

## 6. 数据与迁移

- `dl_project.prerequisites TEXT`（JSON 数组）：DDL 双语种补列 + `ensureColumn` 老库升级路径（与 `pace_settings`/`review_settings`/`verification` 同口径，幂等）。
- 仓储：`DlProjectRow.prerequisites`（解析：脏数据/非数组回落 `[]`；`inSpace` 物化为确定布尔）、`create`/`patch` 均支持。
- 服务：`LearningProjectService.getPrerequisites/setPrerequisites`（读写都过规范化）、`createSpace` 可带初始前置。

## 7. 测试与验证

新增/扩展（TDD，先红后绿）：

- `tests/unit/core/packs/domain-learning/learning-prerequisites.rules.spec.ts`（16 例）：规范化三种入参形态、去重限长去自己、关系边/声明互补、落点判定、缺口清单、快照简报、门禁覆盖判定。
- `dl-agent-actions.spec.ts`（+4 例）：`save_concept` 前置写入 + 跟进建议（linkable/missing）；前置规范化；`save_space_prereqs` 落库/inSpace 反推/全量替换/清空；主题前置覆盖 → 门禁放行。
- `dl-agent-deps.spec.ts`（+2 例）：快照注入主题前置与各知识点前置（含欠账提醒）；主题前置为空时的催办 + 前置纪律入提示词。
- `dl-agent-bindings.spec.ts`（+1 例）：新工具在动作清单且带频控。
- `learning-view.service.spec.ts`（+1 例）：视图透出 `prerequisites` 与 `declaredPrereqs`。
- `builtin-skills-pedagogy.spec.ts` / `dl-agent-empty-start.spec.ts`：技能与起步指令的前置契约。

结果：相关 **25 文件 199 passed / 0 failed**；`eslint` 改动文件 0 error（仅存量 `no-explicit-any` warning）；`vue-tsc` 改动文件 **0 新增错误**（全量 894 ≤ 既有基线 934，差额来自并行会话在途改动）。
迁移组另有 2 例失败（`create-asset-categories`）属并行会话在途改动，与本轮无关。

## 8. 遗留 / 后续

- **既有空间不回改**：老空间 `prerequisites` 为空、概念没有 `attrs.prerequisites`。要让它们补上，在该空间的「任务」对话框里让助手"补主题前置要求 + 每个知识点的前置声明与关系边"即可（快照里已带 ⚠️ 欠账清单，模型会照单补）。
- **主题前置不是课**：`inSpace=false` 的条目只作为门槛展示与提醒（讲义 meta 里也会提醒需自备），系统不会为它生成讲义；若用户希望系统教它，应让助手把它建成知识点。
- 未做：空间新建对话框里直接填主题前置（当前由研究会话产出 + 设置面板可改）；前置的"掌握度自检"（例如用户自报已具备某项前置）。
