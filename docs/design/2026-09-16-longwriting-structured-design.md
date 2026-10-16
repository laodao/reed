# 长文结构化设定与全链路一致性方案

> 日期：2026-09-16
> 状态：设计定稿；M0 已落地（谓词注册表 + 存量归一迁移 + JSON 契约 schema + ajv 接入，21 项单测通过）
> 红线约束：**不新引入工作流引擎**。所有流程编排复用 `src/core/platform/workflow/` 现有引擎（JSON 图定义 + 49 种节点 + journal 崩溃恢复 + 人审挂起 + 互斥作用域 + 节点级模型配置）。

---

## 0. 结论摘要

本方案将"结构化整体设计 → 时序事实库 → 闭环写作 → 分层校验"四件事焊成一条流水线。核心判断有三条：

1. **系统已有大量半成品，本方案是收敛补缝，不是重建。** 时序关系边、按章状态切片、事件生命周期、写后抽取管线、R1-R10 校验、章节写作工作流化——这些都已存在（见 §2 盘点）。真正缺的是：整体化设计文档层（JSON 契约）、谓词受控词表、章卡→定向校验问题的编译器、修复分流、卷级设计/结算/回溯三条工作流。
2. **JSON 是设计 pass 的工作契约与项目交换格式，不做运行时真相源。** 运行时真相仍是现有 46 张 lw_* 表。设计 pass 中 agent 以 RFC 6902 patch 编辑 JSON 草稿（实体粒度、路径白名单可控），确认后由程序分解落库（复用现有 persist 路径），避免出现第二个权威存储。选 JSON 弃 YAML（2026-09-16 拍板）的理由：体积与 token 两者无实质差异（压缩 JSON≈块状 YAML ±10%，中文内容主导 token），决定性的是稳健性与工具链——闭合类型系统+响亮失败（YAML 会静默错型、中文叙述值里的半角冒号会弄坏解析）、模型对 JSON 的生成可靠性最高（工具调用事实标准）、JSON Schema/JSON Pointer/RFC 6902 patch 成熟生态、与抽取器 JSON 输出全链统一。
3. **一致性的保证形态是闭环，不是生成质量。** 每章"装配→写作→抽取→校验→分流→回填→锁定"，世界状态只经校验关卡推进；设计与正文的差距每章对账，误差不向后累积。

## 1. 背景与问题

实测暴露的长程一致性问题（49 号两稿审查、0915 忘川渡实测）：

- 硬伤类别：同案双时间线、父名漂移、身份跳跃、已获证据被名录否定、配角立场摇摆、证据来历两说、已死角色复活（图谱污染残留）。
- 根因：设计要素缺少共享的规范表示，分步设计产出非结构化文本，后步看不到全量、不能回改前步；一致性只能靠 AI 逐要素复读，成本 O(全书) 且无 ground truth 可比对。
- 长程规模压力：几百章/数百万字时，任何模型都不可能"全部看过"，一致性必须活在数据结构里，不能活在上下文窗口里。

## 2. 现状盘点：机制映射表

讨论中设计的机制与现有实现的对号（这决定了方案形态）：

| 讨论机制 | 现有实现 | 缺口 |
|---|---|---|
| 关系随剧情演化（有效区间） | `lw_graph_edges.valid_from/until_chapter` + `applyRelationChanges` 关旧开新（graph.service.ts）+ R2 规则消费 | 谓词自由文本，无受控词表，轨迹查询会漏边 |
| 事件 + 生命周期 | `lw_events`：chapter_number / story_time / state(happened/planned/retconned) / state_before/after / involved_entities | planned→happened 无对账闭环 |
| 按章状态切片 | `lw_entity_state_snapshots`（每实体每章一片）+ `stateAt/getTimeline` + 写作注入 N-1 切片 | 无卷级快照存档，长程 fold 代价线性增长 |
| 写后抽取闭环 | `ChapterGraphProcessor`：hash 短路、按 origin chapter 幂等重跑、新实体自动入册（minor）、关系演变/伏笔/状态摘要提取 | 抽取非"章卡编译的定向问题"，召回靠开放抽取 |
| 校验规则 | R1-R10 + 写前三门（bible/card/conflict）+ 字数门（conflict-gate / consistency.service / bible-readiness-gate） | 无"章卡→定向二值问题"编译器；发现问题后无分流（定向重写/设计补丁/升级） |
| 章节生产工作流 | `chapter-writing` 节点（chapter-writing-node.ts）+ mutexScope `chapter-writing:{projectId}:{outlineId}` + `ensureChapterWritingWorkflowRun` | 单节点大函数（runChapterWritingMethod 内聚 7 步），无阶段级恢复/审计，无升级人审挂起 |
| 设计确认流 | 设计包 draft→confirmed/discarded + `lw_save_card/event/relation` + persistDesignItem 分解落库 | 无整体化设计文档：分步增量落卡，无 spine/卷/章网格的层级契约，无跨引用校验 |
| 伏笔账 | `lw_foreshadows`（planted/payoff + open/paid/dropped）+ R8 超期（5 章） | 无卷末强制清账（回收/滚动/废弃三选一） |
| 上下文装配 | `assembleChapterGeneration` 九段式（概要/世界观/角色+N-1 切片/上章尾/前情事实表/设计卡/图谱段） | 无 spine/卷梗概链的分层压缩，跨卷长程靠章节摘要硬扛 |
| 溯源 | `origin` JSON（discussion/extract/manual）在 custom_entities/graph_edges/foreshadows 三处一致 | 无"designed 优先于 extracted"的机械化裁决规则 |
| 工作流引擎 | `src/core/platform/workflow/`：journal 事件溯源恢复、waiting_review 人审 + resumeReview(approve/reject/editedValues)、retry/watchdog、mutexScope 唯一索引兜底、sub-workflow、节点级 providerConfigId/modelId、draft/published 双图 + versions | 引擎能力足够，业务侧只用了单节点图 |

**结论：缺的不是零件，是四条流水线和一个设计文档契约。**

## 3. 目标架构总览

```
┌─────────────────────────────────────────────────────────────┐
│ 设计文档层（JSON 契约，agent 经 RFC 6902 patch 编辑，草稿态）  │
│   spine.json ─ 卷设计文档(vN) ─ 章卡(prewrite v2)             │
│        │ 确认（设计包流/人审）                                  │
│        ▼ 程序分解落库（复用 persistDesignItem / applyRelation…）│
├─────────────────────────────────────────────────────────────┤
│ 落库层（运行时真相，现有 lw_* 表 + 少量新增）                   │
│   实体/关系(时序边)/事件(planned|happened)/状态切片/伏笔账      │
│   + 谓词注册表 + 锁级别 + 登记层晋级计数                        │
├─────────────────────────────────────────────────────────────┤
│ 查询投影层（派生服务，可重建，非权威）                          │
│   快照 fold / 轨迹 / 关系史 / 爆炸半径 / 共存查询 / 卷级存档     │
├─────────────────────────────────────────────────────────────┤
│ 工作流层（现有引擎，四条流）                                    │
│   W1 章节生产 · W2 卷设计扩展 · W3 回溯修改 · W4 卷末结算       │
└─────────────────────────────────────────────────────────────┘
```

## 4. 数据模型设计

### 4.1 设计文档层（JSON 契约）

> **契约实现位置（M0 已落地）**：`src/shared/contracts/longwriting-design/`——`schemas.ts`（三级 JSON Schema + TS 类型）、`validate.ts`（ajv 校验器 + 语义 walk 基础项：ID 唯一性/引用完整性/暗线 plant<develop<payoff/grid 章界）、`predicate-vocabulary.ts`（谓词词表单一事实源，迁移种子与 schema 共用）。单测：`tests/unit/shared/longwriting-design-contract.spec.ts`。

三级结构，全部带 JSON Schema 校验（ajv，新增标准依赖——现有栈只有 js-yaml 且不存在任何 schema 校验层，这一层无论选哪种格式都要新建）。统一约束：

- **美化输出 + 固定键序**：字节级 round-trip 稳定，git diff 干净，"模型有没有越权改动"可做结构化 diff 审计；
- **编辑单位 = RFC 6902 patch**：agent 修复或调整只提交 patch，程序校验白名单路径（如"只准改这张人物卡"）后原子应用并重验，不整文重写；
- **校验错误统一输出 `{path, code, message}`**（JSON Pointer 精确定位），回喂设计 agent 构成修复回路，零错误后才进人审。

**spine.json（全书总纲，3-5K token 内，设计 pass 每次必带）**

```json
{
  "core": { "premise": "……", "theme": "……", "ending": "……" },
  "main_lines": [
    { "id": "p_main_1", "title": "……", "stages": ["……"] }
  ],
  "core_cast": ["c_chengye", "c_suwantang"],
  "volumes": [
    { "id": "v01", "title": "……", "chapter_range": { "from": 1, "to": 40 }, "focus": "……" }
  ]
}
```

落库映射：core→lw_story_overviews；main_lines→lw_plots；core_cast 为人物 ID 引用（全卡已在库）；volumes→lw_story_outlines(volume 节点)。

**卷设计文档 vN（agent 经 patch 编辑的草稿，确认后分解落库）**

```json
{
  "volume": "v03",
  "cast": [
    { "id": "c_lin", "kind": "character", "name": "林晚舟", "aliases": ["林师傅"], "importance": "volume" }
  ],
  "threads": [
    { "id": "hl_01", "name": "苏晚棠的真实身份", "involves": ["c_suwantang"],
      "plant": 45, "develop": [48, 52], "payoff": 61 }
  ],
  "grid": [
    { "ch": 45, "beats": ["……"], "present": ["c_chengye"], "location": "l_dujiang",
      "line_actions": [ { "line": "hl_01", "act": "plant" } ] }
  ],
  "events": [
    { "id": "ev_reveal_61", "chapter": 61, "story_time": "永昌三十一年冬",
      "desc": "……", "participants": ["c_zhang", "c_lin"] }
  ]
}
```

落库映射：cast→bible 各表（persistByKind）；threads→lw_graph_edges(origin=discussion)+lw_foreshadows+lw_events(planned)；grid→lw_story_outlines(chapter 节点)+involved_* 绑定；events→lw_events(state=planned)。

**章卡 prewrite v2（升级现有 `lw_chapter_prewrites`，为校验编译服务）**

在现有 ChapterCardData（plotSummary/openingHook/involvedCharacters/foreshadowAction…）之上，`facts` JSON 列增加：

```json
{
  "musts": ["程野发现遗书，知晓身世"],
  "must_nots": ["苏晚棠不得明言身份（hl_01 payoff 前约束）"],
  "explicit_facts": ["程野之死必须由第三方明写确认"]
}
```

musts=本章必须发生（编译为校验问题）；must_nots=本章禁止（编译为校验问题）；explicit_facts=明确性纪律——关键事实必须明写、不许只暗示，否则抽取器抓不到。

### 4.2 落库映射与新增存储

新增（最小集）：

| 新增 | 形态 | 说明 |
|---|---|---|
| `lw_predicate_registry` | 新表：scope(relation/attribute) / key / label / synonyms / source。**已落地**（entity/repository/migration `create-lw-predicate-registry`，两端迁移已注册；内置 25 条词表 + 存量边归一：命中词表改写规范词、未命中入册 discovered，非破坏幂等） | 谓词受控词表。设计 pass 与抽取 prompt 的关系词表从此渲染；GraphService 写边接 `normalizeOrRegister`（M1） |
| `lw_story_outlines.design_status` | 新列：coarse / detailed / locked | 设计锁级别，与进度 status（pending/progressing/completed）正交。已写正文章节视为 locked（规则推导，不落列） |
| `lw_events.story_time_norm` | 新列（结构化历法 {era, year, month?}） | 双时间轴校验用；story_time 自由文本保留 |
| `lw_volume_state_checkpoints` | 新表（volume_outline_id, chapter_through, state_json） | 卷级快照存档，程序物化，fold 时只回放本卷增量 |
| `lw_design_documents` | 新表（project_id, kind(spine/volume), doc_json, status, version） | 草稿态与历史版本；同时提供整项目 JSON 导出/导入（可移植契约） |
| `lw_foreshadows` 关联列 | 加列：involves(JSON) / develop_chapters(JSON) / rolled_to(integer nullable) | 0916 逐表核对发现：伏笔现为孤立文本+两章号，暗线轨迹查询拼不出来；卷末清账"滚动到某卷"依赖 rolled_to |
| `lw_chapter_prewrites.facts` | 加 JSON 列（musts/must_nots/explicit_facts 结构化落列） | 章卡 v2 的校验编译源；比解析 markdown content 稳 |
| 属性谓词化 | **零 schema 变更**：复用 `lw_graph_edges` 泛化端点 | "持有/位于/知晓"= 普通边（target 为实体或事件节点），仅扩词表+抽取器；存活走死亡事件+R1 |

落库复用：卡片走 `persistByKind`，关系走 `syncEntityRelations / applyRelationChanges`（origin=discussion），计划事件走 `lwEvents.create(state=planned)`，伏笔走 foreshadows——即设计包确认的既有路径，仅把入口从"逐项 DesignItem"扩展为"整文档分解"。

### 4.3 时序事实模型补齐

- **来源优先级机械化**：以 `origin.type` 为依据，GraphService 内新增裁决规则——extracted 只能填空与延伸（新增边/新增切片），与 designed（discussion/manual）冲突时不覆盖、打旗进 conflict gate 疑点队列（复用现有登记机制）。"程野已死"式污染从纪律变成代码。
- **双时间轴分轴校验**：chapter 序（叙事序）与 story_time_norm（情节序）各自排序查矛盾；闪回用事件 `flashback: true` 标记豁免交叉校验。
- **planned→happened 对账**：章 N 写完抽取后，匹配本章 planned events（按 participants+desc 相似度），命中则置 happened 并回填 state；未命中保留 planned 并在卷末结算流打旗（设计承诺未兑现）。

## 5. 工作流设计（全部复用现有引擎）

### 5.1 引擎能力对号

| 需求 | 引擎现有能力 |
|---|---|
| 长时运行崩溃恢复 | journal 事件溯源 + `rehydrate()` + boot `recoverOnBoot()` |
| 人审等待态 | `waiting_review` + `resumeReview(approve/approve_with_changes/reject + editedValues + choice)` |
| 章节互斥（防多实例/并发写） | mutexScope `chapter-writing:{projectId}:{outlineId}` + 唯一索引兜底 |
| 阶段重试/看门狗 | 节点 retryCount/retryDelayMs + maxDurationMs + 挂起不计时长 |
| 分批生成（防输出超预算） | loop 节点 + loop-back/loop-done 边 + 迭代独立 ScopeState |
| 每阶段模型路由 | 节点 config providerConfigId/modelId + 运行时 configOverrides；业务侧 lw_project_model_configs 按 stage 配置优先 |
| 阶段产物落盘 | save-asset / state_json 节点检查点 / agent 工具产物归档 |
| 流程版本演进 | draft/published 双图 + definition_versions 不可变快照可回滚 |

### 5.2 W1 章节生产流

| # | 步骤 | 执行者 | 输入 | 输出 | 现有代码对应 |
|---|---|---|---|---|---|
| C1 | 触发与互斥 | 引擎 | agent 工具 / 用户 | 启动 run，`chapter-writing:{projectId}:{outlineId}` 互斥 | `ensureChapterWritingWorkflowRun`（现成） |
| C2 | 上下文装配 | 程序 | DB 设定 + 卷 grid 本章条目 + 账本 | 本章上下文 JSON（动态投影切片，非全量转换） | `assembleChapterGeneration`（增强：grid 条目、卷级快照） |
| C3 | 章卡生成 | LLM | C2 | 章卡 v2（含 musts/must_nots/explicit_facts） | 生成设计卡（现成，格式升级） |
| C4 | 章卡校验 + 写前三门 | 程序 | C3 | 通过 / 错误清单（JSON Pointer 定位） | 自检 + bible 门 + 卡门 + 冲突门（现成，补 L0 结构校验） |
| C5 | 章卡确认 | 人 / 自动 | C4 | `is_confirmed`：零错且无疑点自动确认；有疑点挂起人审 | `confirmPrewrite`（现成，加自动确认策略） |
| C6 | 正文生成 | LLM | C2 + C3 | 章节正文 | `generateChapter`（现成） |
| C7 | 定向抽取 | LLM | 正文 + 章卡编译的问题清单 | 结构化事实 JSON（出场/事件/状态增量/关系变更/明写核验） | `ChapterGraphProcessor`（增强：问题驱动） |
| C8 | 一致性复审 | 程序 + LLM | C7 vs 章卡 vs designed 事实 | 比对报告：通过 / 违规清单 / 偏离 | R1-R10 + 写后审读（升级：编译问题集、designed 优先裁决） |
| C9 | 修复分流 | 引擎 gate | C8 | 小违背→定向重写回 C6（≤2 次）；好偏离→设计补丁→人审→回 C8；解不了→挂起升级 | 新增（分流路由） |
| C10 | 回填入库 | 程序 | C7 事实 | 新实体入册 + 晋级计数 / 状态切片 / 章节摘要 / planned→happened 对账 / 伏笔落账 / 版本快照 | 部分（现成：入册/切片/摘要/版本；新增：对账、晋级） |
| C11 | 锁定推进 | 程序 | — | 本章 locked、进度推进、串行进入下一章 | `saveChapter`（增强：locked） |

两个关键次序说明：**C7 抽取必须先于 C8 复审**——复审是"抽取事实 vs 章卡承诺"的比对，抽取是比对的基础；**C2 是每章动态投影**，从库渲染本章相关切片，不存在"设定库整体转大 JSON"的步骤。

**保守档（先做，M2）**：保持 `runChapterWritingMethod` 单入口结构不动，上表 C2-C11 在节点内按序执行，仅把 C5/C9 的"需人拍板"从同步返回改为 chapter-writing 节点返回 `waiting_review`（节点契约三态原生支持），UI 走现有 WorkflowReviewPage，`resumeReview` 决策后回到节点内继续执行。收益：升级路径打通，迁移成本近零。

**图化档（M4 后评估）**：把上表各步骤提升为图节点——

```
assemble(code) → write(chapter-writing) → extract(ChapterGraphProcessor 封装)
  → verify(llm，问题由章卡 musts/must_nots/explicit_facts 编译)
  → gate(condition)
      ├─ 通过 → backfill(code：登记/晋级/fold) → lock → end
      ├─ 小违背 → repair(定向重写，loop-back ≤2 次)
      ├─ 好偏离 → design-patch 提案 → human-review(挂起) → 重验
      └─ 解不了 → human-review(升级) → end
```

收益：阶段级恢复与审计、每阶段独立模型路由与重试预算。代价：迁移与回归成本，故后置。

### 5.3 W2 卷设计扩展流（渐进式写作的核心循环，M1）

| # | 步骤 | 执行者 | 输入 | 输出 |
|---|---|---|---|---|
| D1 | 触发 | 引擎 | 建卷 / 上卷结算完成 / 用户在研讨室发起 | 启动 run（`volume-design:{projectId}:{volumeId}` 互斥） |
| D2 | 输入包装配 | 程序 | spine.json + 已写卷梗概链 + 卷首状态快照 + 开放伏笔账 + 账本 confirmed + 研讨室拍板 | 设计输入包 JSON |
| D3 | 骨架生成 | LLM | D2 | 卷骨架草稿（焦点/暗线清单/章节范围） |
| D4 | 校验 + 修复回路 | 程序 ↔ LLM | 草稿 | 零错误版本：错误 `{path,code,message}` 回喂，agent 提交 RFC 6902 patch 修复，循环至零错 |
| D5 | 人物/势力层生成 | LLM | D2 + 已确认骨架 | cast 草稿（同样过 D4 回路） |
| D6 | 章节网格分批生成 | LLM × loop | 全量已确认部分 | grid 草稿（每章 beats/present/line_actions，10-20 章一批防输出超预算） |
| D7 | 整卷整合修订 | LLM | 全量草稿 | 整合后的卷设计文档 vN.json |
| D8 | L0 全量校验 | 程序 | D7 | 零错误（schema/引用/plant<develop<payoff/词表/章界） |
| D9 | 人审确认 | 人（挂起） | D8 通过的草稿 | 确认（复用现有设计包整体确认面板） |
| D10 | 分解落库 | 程序 | 确认文档 | cast→bible 各表；threads→edges+foreshadows+events(planned)；grid→outline+involved_*；文档存 `lw_design_documents` |
| D11 | 发布 | 程序 | — | 卷 design_status=detailed，具备开写条件 |

spine 流与此同构但更小（项目初始一次 + 大改时重跑）：D2→D3→D4→D9→D10（落 overview/plots/卷目录），规模小无需分批。

### 5.4 W3 回溯修改流（M4）

```
propose(用户/agent 提出改动) 
→ blast-radius(code：RetroImpactService 查询)
→ human-review(choice 三选一：重写受影响章 / 向前圆场(后续章补种) / 放弃)
→ execute(重写=loop 子流；圆场=生成补丁事件并入 upcoming 章卡 musts)
→ re-verify(受影响区间重跑校验) → refold(状态重折叠) → end
```

### 5.5 W4 卷末结算流（M3）

```
checklist(code：planned 未兑现事件 / 开放伏笔 / 晋级候选清单)
→ settle(human-review：伏笔三选一 回收/滚动至某卷/带理由废弃；planned 事件处置)
→ checkpoint(code：卷级快照物化)
→ synopsis(llm：卷梗概生成，接入梗概压缩链)
→ end
```

### 5.6 新增节点 handler（按 chapter-writing-node 先例注册）

`design-gather` / `design-validate`（code 类）与 `volume-design`（task 类，串起 W2 的 llm 子步骤或直接用 llm-chat+loop 组合，优先用现有节点组合，只把无法组合的封装为业务节点）。预计新增 2-3 个 handler，不触碰引擎核心。

## 6. 一致性校验体系（L0-L5）

| 层 | 内容 | 实现状态 |
|---|---|---|
| L0 程序结构校验 | JSON.parse 响亮失败 → JSON Schema(ajv)：结构/谓词词表 enum/ID pattern/章界 → 语义 walk：ID 引用完整性、暗线 plant<develop<payoff、伏笔 payoff 不空 | 新增（设计 pass 校验器，错误带 JSON Pointer 路径，回喂修复回路） |
| L1 定向抽取 | 章卡编译问题驱动的抽取（出场/状态增量/关系变更/明写事实） | 增强现有 ChapterGraphProcessor（问题注入 prompt） |
| L2 抽取 vs 设计程序比对 | facts diff：designed 优先、extracted 填空、冲突打旗进 conflict gate | 新增裁决规则（§4.3） |
| L3 章级语义问答 | 写后 LLM 审读从固定 4 项改为章卡编译的定向二值问题集（musts/must_nots/explicit_facts/伏笔动作兑现） | 增强现有 executor 写后三段检查 |
| L4 卷级整卷复审 | 卷末抽样式 AI 复审（软一致性：动机/文气） | 新增，挂 W4 |
| L5 人审 | 冲突疑点登记 + 设计包确认 + 工作流 human-review 升级位 | 现有能力复用 |

R1-R10 全部保留原位，作为 L2/L3 的规则件；新增校验问题编译器输出与 R 规则共用疑点登记通道。

## 7. 临场发挥回填与登记层晋级

三层记忆（对应现状）：

1. **设计层** = bible 各表 + graph designed 边/事件（确认制写入）。
2. **登记层** = 新实体自动入册（已存在，temporary→minor）+ **晋级触发器（新增）**：同一登记实体出现 ≥2 次、或卷入 state_change 事件 → 晋级候选，卷末结算流审阅；卷入状态变更的实体强制至少有登记卡（否则抽取打旗）。
3. **原文层** = 章节正文 + 按实体/情节检索（lw_vector_indices / memories 现有设施）。

回填时机为每章提交流程内（下一章装配依赖它），小事实自动回填、大偏离走 W1 分流。

## 8. 查询引擎补齐

现有 `stateAt / edgesAt / getTimeline / progression` 之上新增：

- `trajectory(entityId)`：全量 facts 按章排序的轨迹视图（progression 已有雏形，扩展边/事件覆盖）。
- `relationshipHistory(a, b)`：边+cause 事件按序展开。
- `blastRadius(change)`：W3 用，反查有效区间重叠的边/事件/切片/章节/伏笔。
- `coPresence(ch)`：位置切片 × 章卡出场表（R 系规则与注入共用）。
- 卷级快照 checkpoint 之上的 fold：只回放本卷增量（性能项）。

## 9. 实施里程碑

| 期 | 内容 | 验收 |
|---|---|---|
| M0（1-2 天） | ~~谓词注册表 + 存量归一迁移 + JSON 契约 schema 定稿（spine/卷设计/章卡 v2，ajv 接入）~~ **已完成（2026-09-16）**：lw_predicate_registry 三件套 + 25 条内置词表 + 存量归一 + 契约 schema/校验器 + 21 项单测 | 契约评审：`src/shared/contracts/longwriting-design/`（接口先行） |
| M1 | W2 卷设计扩展流 + 设计文档落库分解 + L0 校验器；spine/卷两级在忘川渡规模项目试跑 | **代码层完成（2026-09-16）**：数据层（lw_design_documents 表 + foreshadows 关联列 involves/develop_chapters/rolled_to + outlines.design_status）、分解落库器（cast 同名幂等 upsert / threads→伏笔+关联列 / events→planned / grid→章节点+involved 绑定 + 卷 design_status=detailed + id_map 回填）、L0 校验闭环（草稿保存与确认前双重校验，spine 上下文取自已确认 spine 文档）、研讨室接线（`lw_save_design_doc` 工具 + 设计包 design_doc 条目类型 + 确认面板复用）、**W2 工作流定义已落地**（volume-design 节点 handler 复用现有引擎，编排骨架→人物层→网格分批(loop)→整合，每 pass 校验+修复回路 ≤2 轮；`lw_run_volume_design` 工具异步启动，mutexScope `volume-design:{projectId}:{volumeId}`；提示词 v1 单一事实源 volume-design-prompts.ts）。33 项单测通过。**余下=真机试跑**：真模型契约纪律、提示词调优（基线=试跑产出）、大卷输出预算行为观察 |
| M2 | 章卡 v2 + 校验问题编译器 + L2 裁决规则 + W1 保守档（waiting_review 升级） | 复测一卷：designed/extracted 冲突打旗生效；升级审批闭环可用 |
| M3 | W4 卷末结算 + 卷级快照 + 晋级触发器 + planned→happened 对账 + L4 复审 | 卷末清账三选一全走通；跨卷续写注入含卷级快照 |
| M4 | W3 回溯修改流 + blastRadius + 整项目 JSON 导入导出 + W1 图化档评估 | 回溯改动一次全链路演练（重写/圆场两路） |

回归清单（每期复测必查）：同案双时间线 / 父名漂移 / 身份跳跃 / 已获证据被名录否定 / 配角立场摇摆 / 已死角色复活 / 伏笔烂尾。

## 10. 风险与开放问题

1. **planned→happened 匹配精度**：按 participants+相似度匹配可能误配，保守策略是宁缺毋滥、未命中留旗给卷末结算。
2. **谓词治理成本**：扩词表需过 review，否则词表会退化成自由文本；抽取器只能从词表选（含 synonyms 归一）。
3. **双轴校验的闪回合法性**：flashback 标记由谁打（设计 pass 标 + 抽取识别双向）待 M3 定。
4. **图化档迁移风险**：runChapterWritingMethod 是稳定单入口，图化放在最后评估，避免破坏现有章法链路。
5. **卷设计 JSON 输出超预算**：分批生成（骨架→cast→grid 分批）+ 解析渐进恢复 + 救援路径，直接复用剧集 JSON 超预算的既有经验。
6. **多实例并发**：mutexScope 已覆盖章节级；多实例共库双派发的存量 bug 需在 M1 前修复，否则设计 pass 也会撞。

## 11. 明确不做的事

- 不新引入工作流引擎（红线）。
- 不把 JSON 设计文档做运行时真相源，不迁移存量 bible 到设计文档（JSON 只管设计 pass 草稿与导入导出）。
- 不上图数据库/外部 triple store（现有 SQLite + 内存索引足够）。
- 不追求全量实体全卡维护（分级 schema 严格度 + 晋级制）。
