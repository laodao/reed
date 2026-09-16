# 领域学习：知识点内容与版本管理现状盘点 + 补齐方案

日期：2026-09-15
目录：tasks/2026-09-07-domain-learning-space/
触发：用户提问「领域学习模块，知识点内容，有没有版本管理？」
前置文档：design-v3.md（§9 数据模型）、content-template-design.md（「知识点内容模型」= dl_card 讲义）
结论一句话：**讲义（dl_card）有版本管理，但只完成"持久化"一半——看不见、比不了、回不去；知识点节点（dl_concept）自身的字段完全没有版本；只有掌握度有审计表。**

---

## 0. 术语边界（先说清"知识点内容"指什么）

项目内部术语里，「知识点内容模型」（content-template-design.md:1）指的就是**讲义**（dl_card）。但数据模型上，一个"知识点"的内容分布在三层，混用会误判版本管理的有无：

| 层 | 表 | 承载什么 |
|---|---|---|
| 知识点**节点** | `dl_concept` | 名字、英文名、一句话定义（`definition_short`）、节点类型、**前置声明**（`attrs.prerequisites`）、研究状态、掌握度、备注；`card_id` 只存"当前讲义"指针 |
| 知识点**讲义** | `dl_card` | 教学正文 = 区集 `sections`（按知识本质类型分模板）+ `works` 相关著作 + `evidence_sources` 证据 + `version`/`status`/`verification` |
| 不挂单概念的**文档** | `dl_doc` | 领域导读 / 分支总览 / 复习讲义（非排程单元，design-v3.md:238） |

设计决策 D8 定死学段划分：**学习单元是知识点，不是"课"；一概念一讲义，标题=概念名**（design-v3.md:23,64,234）。
界面三栏对应：左知识地图（`dl_concept`）| 中概念讲义（`dl_card`）| 右追问（`dl_question`）。

---

## 1. 逐对象盘点（现状事实）

| 对象 | 表 | 版本机制 | 写路径（是否原地覆盖） | 用户可见入口 |
|---|---|---|---|---|
| 学习空间 | `dl_project` | **无版本** | `patch()` 覆盖（`dl-project.repository.ts`）；`prerequisites` 更是**全量替换**语义 | 空间设置 |
| 知识点节点 | `dl_concept` | **无版本** | `patch()` 原地覆盖 name/en/definitionShort/attrs/note（`dl-concept.repository.ts:141`）；只留 `updated_at` | 左栏知识地图 |
| 知识点讲义 | `dl_card` | **有版本**（`version` 自增、旧行留档） | 只新建、不覆盖（`dl-agent-actions.ts:478-496`） | 中栏讲义头，仅显示 `v{n}` |
| 讲义核验 | `dl_card.verification` | 随版本留档，**新稿置空重跑** | 后端自动核验写入 | 讲义头核验标签 |
| 关系边 | `dl_relation` | **无版本** | `verified` 就地 0→1（`learning-graph.service.ts:309`），三元唯一 upsert | 地图 / Atlas 档案 |
| 掌握度 | `dl_concept.mastery` + **`dl_mastery_log`** | **有审计**（唯一！from/to/trigger/at） | 懂了/没懂/复习/复习完成四处写入（`learning-graph.service.ts:73,99,117,164`） | 左栏状态点 |
| 追问答疑 | `dl_question` | **无版本** | 重答即覆盖 `answerMd`（`dl-question.repository.ts:90`） | 右栏答疑 |
| 笔记 | `dl_note` | **无版本** | 只增删、内容不可改 | 右栏收藏 |
| 方案确认 | `dl_plan` | **有版本**（`revision` + draft/confirmed/superseded） | 新版本生效、旧版本 `superseded` 留档（`dl-plan.service.ts:155`）；已有 `listVersions()` | 方案确认弹窗 |
| 文档型内容 | `dl_doc` | **无版本** | **当前无任何写入者（整表休眠）**，仅仓储注册 | 无 |
| 空间前置要求 | `dl_project.prerequisites` | **无版本** | agent 每次给全量清单替换（`dl-agent-actions.ts:343`） | 空间顶部门槛条 |

### 1.1 讲义版本的实现细节（现有能力）

- **升版不是覆盖**：`dl_save_card` 一律 `version = 旧最大 + 1` 新建行，旧稿与旧核验保留（`dl-agent-actions.ts:478-496`，注释即「升版留档（2026-09-09 复盘）」）。
- **新稿核验清空**：新建时不传 `verification` → 落 null（`dl-card.repository.ts:117`），核验需针对新内容重跑，不继承旧判定。
- **当前版两个口径**：`dl_concept.card_id` 指向最新；读取时 `cardId` 优先、否则取最高 `version`（`learning-view.service.ts:74`）。progress/2026-09-09 复盘已记此「双口径」冗余。
- **可查询历史**：`DlCardRepository.listVersionsByConcept()`（`dl-card.repository.ts:140`）已实现——**但全仓无调用者，是死代码**。
- **发布只认最新版**：`dl:publish-card` 明确拒绝非当前版（`domain-learning.handler.ts:300-301`）。

### 1.2 已确认的缺口

**A. 讲义历史"看不见、比不了、回不去"（P0）**
- `dl:` 前缀 39 个 IPC 通道中**没有**任何版本历史通道；`listVersionsByConcept()` 无调用者。
- 前端只在讲义头显示 `v{{ version }}`（`DomainLearningSpace.vue:305-306`），无历史列表、无预览、无恢复。
- 且当前版禁止被旧版替换 → **没有回滚路径**（`domain-learning.handler.ts:301`）。
- 缺 `(project_id, concept_id, version)` 库级唯一约束（`create-domain-learning-tables.ts:302-305` 只有普通索引），版本号靠服务层"读最大 +1"，并发/重试理论上会撞同版本行。

**B. 修订说明出库即丢（P1）**
- 技能 `learning-lesson-updater` 契约要求模型输出 `changed`（key/kind/reason/evidence，`builtin-skills.ts:1011`），但 `dl_card` 无对应列，`DlAgentActionParams.card` 也不接收该字段（`dl-agent-actions.ts:75-83`）→ 变更说明只活在对话流里。

**C. 知识点节点字段无任何追溯（P1）**
- 名字、一句话定义、前置声明、备注被 `patch()` 覆盖（`dl-concept.repository.ts:141`）；用户与 agent 都经此路径改（`dl-agent-actions.ts:212`、`learning-graph.service.ts:247`）。
- 结果：AI 把"指数基金"改名/改定义、或悄悄改掉前置声明，**事后无法查证**。唯一例外是 `mastery`（有 `dl_mastery_log`）。

**D. 删除无常态化通道（P1）**
- 无删讲义 IPC → progress/2026-09-13 两次清理都是**手工 SQL**（`domain-learning-purge-*.md`）。
- 无删概念 IPC，且 DDL 零外键零级联 → 删概念会留孤儿讲义/关系边/笔记（progress/2026-09-13 已建议补 `deleteByConcept` + 软删）。

**E. 其他覆盖型内容（P2）**
- `dl_project.prerequisites` 全量替换，旧门槛清单无可回溯。
- `dl_question.answerMd` 重答覆盖；`dl_relation.verified` 就地翻转（谁/何时确认无记录）。
- `dl_doc` 整表休眠，若启用需先补版本与写入者。

---

## 2. 平台内既有范式（照抄，不另造轮子）

同一仓库里已有两套**完整**版本管理（含恢复），补齐方案直接对齐它们，避免自创：

| 范式 | 表/实现 | 能力 |
|---|---|---|
| 工作流定义版本 | `workflow_definition_versions`（`create-workflow-definition-versions.ts`）+ `createVersion/listVersions/getVersion`（`workflow-definition.repository.ts:317-363`） | 发布时快照；`wf:list-versions` / `wf:restore-version` 双通道（`workflow.handler.ts:83-89`）；恢复=**应用为当前草稿、不自动发布、历史不丢**；前端版本抽屉 + 「恢复到草稿」（`WorkflowEditor.vue:161,630`） |
| 长文写作章节版本 | `lw_chapter_versions` + `lwChapters.restoreVersion`（`lw-chapter.repository.ts:172`） | 章节版本列表 + 恢复（`ChapterStage.vue:293,1472`） |

共同模式：**快照独立存储（或等价的行留档）+ 恢复生成新版本 + 历史永不删改**。讲义当前恰好已符合第一条（行留档），缺的是暴露与恢复。

---

## 3. 补齐方案

分层落地，每层可独立交付、独立验收；全部按 TDD（先写复现测试）与"不写死数据"纪律。

### P0-1 讲义版本可见（只读）

**后端**（复用现有 `listVersionsByConcept`，零新增查询逻辑）：
```
dl:list-card-versions  { id: spaceId, conceptId }  → DlCardVersionItem[]
  item = { cardId, version, status, essenceType, sectionsCount, worksCount,
           evidenceCount, verifyStatus, createdAt, updatedAt, isCurrent }
dl:get-card-version    { id: spaceId, cardId }     → DlCardView（只读预览，含 sections/works/evidence）
```
- 归属校验走既有 `projects.ensureOwned(spaceId)` + `card.projectId === spaceId`（同 `dl:publish-card` 口径）。
- DTO 定义进 `src/shared/types/domain-learning.types.ts`（共享类型集中地），不散落。

**前端**：讲义头 `v{n}` 改为可点击 → 抽屉列出历史（版本号/时间/状态/核验/区数），点击预览。零破坏性，当前阅读流不变。

### P0-2 讲义恢复（与 workflow 同语义）

```
dl:restore-card  { id: spaceId, conceptId, cardId } → { cardId, version, restoredFrom }
```
- 语义**照抄 `wf:restore-version`**：把目标历史版本的 `sections/works/evidenceSources/essenceType` **作为新的一版落库**（`version = 当前最大 + 1`，`status='draft'`，`verification=null`），旧版全部保留。
- 不真删、不改写历史行；恢复后仍需用户「确认发布」——与现有 draft→published 闭环一致。
- 只允许恢复到"当前版的对立面"没有意义，因此恢复一律**新建最新版**，天然避免分叉。
- 前端二次确认文案仿 `WorkflowEditor.vue:634`（"恢复到 v{n}？当前草稿将被覆盖"）。

### P0-3 库级加固

- 迁移加唯一索引 `uniq_dl_card_concept_version(project_id, concept_id, version)`（`create-domain-learning-tables.ts`，走 `ensureIndex(..., true)` 幂等）。

### P1-1 修订说明与来源落库

`dl_card` 增列（`ensureColumn` 老库可平滑升级，同 `verification` 的既有做法）：
```
revision_note  text     -- 人类可读说明（"依据《XX》补充机制区；修正 0.167 计算"）
change_source  varchar  -- agent | restore | template | manual
changed_json   text     -- [{key, kind, reason, evidence}]（直接对接技能已输出的 changed）
```
- `dl_save_card` 工具 schema 增 `revisionNote` / `changed`（可选）；`saveCard` 落库；summary 回显。
- 版本抽屉直接展示"改了什么/为什么/依据"——这是讲义迭代对用户最有价值的信息。

### P1-2 知识点节点变更审计

**推荐**：与 `dl_mastery_log` 同构，新增 `dl_concept_log`
```
id, user_id, project_id, concept_id, field, from_value, to_value, trigger, at
```
- 写入点唯一：服务层封装 `patchConcept()`（`DlConceptRepository.patch` 之上），凡改 `name/en/definitionShort/attrs/prerequisites/parentId/note` 落一行；`mastery` 继续走 `dl_mastery_log`（不重复记）。
- `trigger` 取值：`agent` | `manual` | `map_completion` | `restore`。
- 复用点：左栏/Atlas 档案可加"变更记录"折叠区；后续"AI 改了我的定义"可查、可回退。
- **不建议**给 `dl_concept` 做整行多版本表（节点是图的一部分，版本化会牵动关系边与门控语义，收益不匹配成本）。

### P1-3 删除常态化

- 加 `dl:delete-card`（删草稿/删某版本/删全部，二次确认）与 `dl:delete-concept`（软删 `deleted_at` + 级联清理讲义/关系边/笔记/掌握度日志），替代手工 SQL。
- `DlCardRepository.deleteByConcept`（progress/2026-09-13 已列为建议）。
- 软删后所有读取路径统一过滤 `deleted_at IS NULL`（含 view/graph/agent 快照）。

### P2 其他覆盖型内容

- `dl_project.prerequisites`：全量替换时把旧清单写进审计（同 `dl_concept_log` 模式，或空间级 `dl_project_log`）。
- `dl_relation.verified`：加 `verified_by` / `verified_at`，让"谁确认了这条前置边"可查。
- `dl_doc` 启用前先补 `version` + 写入者，别重走"先休眠后补疤"。

---

## 4. 测试点（TDD，先红后绿）

1. **升版**：同概念连续两次落库 → 得 v1/v2 两行，v1 内容与核验**逐字段不变**，概念 `card_id` 指向 v2。
2. **恢复**：从 v1 恢复到 v3 → v3 内容 === v1 内容，`status='draft'`、`verification=null`、`change_source='restore'`；v1/v2 仍在且未被修改。
3. **列表**：`dl:list-card-versions` 按 version 降序、`isCurrent` 唯一、跨空间访问被拒、多租户隔离（userId 注入）。
4. **唯一约束**：同 `(project, concept, version)` 二次插入被库拒绝；服务层有冲突回退/重试路径。
5. **节点审计**：改名/改定义/改前置 → `dl_concept_log` 各一行且 from/to 正确；`mastery` 变更**只**进 `dl_mastery_log`（不重复）。
6. **删除**：删概念后其讲义/关系边/笔记不可见但未物理丢失（软删），恢复能力可验证。
7. **回归**：`dl:publish-card` 仍只允许发布当前版；三栏聚合视图、门控、地图完整度评分不受影响。

---

## 5. 验收标准

- 用户可打开任一知识点的**历史讲义列表**、预览任意历史版本、一键**恢复到草稿**，且历史版本永不丢失。
- 每次讲义迭代能看到**改了什么/为什么/依据**。
- 知识点的名字/定义/前置被改动（无论 AI 还是人工）事后**可查、可定位改动者与时间**。
- 清理内容有正规入口，不再需要手工 SQL。

## 6. 非目标（明确不做）

- 不做逐字符 diff 视图（先给"版本列表 + 预览 + 变更说明"，diff 待用户提出真实需求）。
- 不做版本分支/多线并行（讲义"一概念一篇当前版"是 D8 决策）。
- 不引入通用版本内核去改造其他模块（先在工作流/长文既有模式上复用，避免过度抽象）。
- 本次不改 `dl_doc`（休眠面，启用时再补）。

---

## 附：关键代码位置索引

| 事项 | 位置 |
|---|---|
| dl_card 表结构（含 version） | `src/core/database/migrations/create-domain-learning-tables.ts:261-305` |
| dl_card 实体 | `src/core/database/entities/domain-learning/dl-card.entity.ts:47` |
| 升版留档实现 | `src/core/packs/domain-learning/services/dl-agent-actions.ts:478-496` |
| 历史版本查询（死代码） | `src/core/database/repositories/dl-card.repository.ts:140` |
| 当前版解析（双口径） | `src/core/packs/domain-learning/services/learning-view.service.ts:74` |
| 发布只认最新版 | `src/core/packs/domain-learning/handlers/domain-learning.handler.ts:300-301` |
| 概念字段覆盖写 | `src/core/database/repositories/dl-concept.repository.ts:141` |
| 掌握度审计写入 | `src/core/packs/domain-learning/services/learning-graph.service.ts:73,99,117,164` |
| 方案版本（revision/superseded） | `src/core/database/repositories/dl-plan.repository.ts:83-131` |
| 工作流版本范式 | `src/core/database/repositories/workflow-definition.repository.ts:317-363`、`src/core/packs/workflow/handlers/workflow.handler.ts:83-89` |
| 前端讲义头版本显示 | `src/renderer/src/views/domain-learning/DomainLearningSpace.vue:305-306` |

---

## 实施记录（2026-09-15）

本文档所列 P0/P1 方案已于 2026-09-15 完整落地，详见 `progress/2026-09-15-domain-learning-export-and-versioning.md`。

### 已交付

- **P0-1 讲义历史可见**：`dl:list-card-versions` / `dl:get-card-version` + 前端历史抽屉（预览/恢复/导出指定版本）
- **P0-2 讲义恢复**：`dl:restore-card`，新建最新版、旧版留档、verification 不继承、changeSource='restore'
- **P0-3 库级加固**：`uniq_dl_card_concept_version(project_id, concept_id, version)` 唯一索引
- **P1-1 修订说明落库**：dl_card 增 revision_note / change_source / changed_json 三列；saveCard 与 restore 写入
- **P1-2 节点审计基础设施**：dl_concept_log 表 + DlConceptAuditService.diffAndLog（调用点接入留待下一轮）

### 额外交付（用户同期需求）

- **知识点讲义正文导出**（md / PDF / 长图）：复用平台 document-tools，新增 learningLesson 模板；KaTeX + mermaid 增强；Web 端降级 HTML
- **共享文案单一来源**：`shared/utils/domain-learning-labels.ts`，前端 domain-learning-ui.ts 已改为引用

### 验证

- 26 个测试文件、258 个测试全绿（含真库迁移、真 KaTeX 渲染、通道一致性）
- typecheck 无新增错误

### 待跟进

- dl_concept_log 在 saveConcept/createConcept 等调用点接入 diffAndLog
- dl:delete-card / dl:delete-concept IPC（删除常态化）
- dl_project.prerequisites 全量替换审计
- 真实 Electron 隐藏窗口 PDF/长图渲染手工验收