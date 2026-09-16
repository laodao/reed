# 知识大脑方案·技术可行性核查报告

- 日期：2026-09-16
- 对象：`docs/design/2026-09-16-knowledge-brain-design.md`（v2）
- 方法：三路并行代码级核查（存储/工作流引擎、agent 装配层/harness、渲染层/调度基础），全部结论带 file:line 证据；依赖侧实查（npm registry / 本地 node_modules）
- 结论：**总体可行**。方案的四条流水线、四张新表、检索与消费面扩展，在现有代码里都有直接承接点或可照抄先例；无需新引擎、无需图数据库；唯一建议新增依赖是 `ts-fsrs`（5.4.2，MIT，纯 TS，可选）。有 4 处设计表述需要微调（§5），5 项需要在 M0 做 POC（§6）。

---

## 1. 总判定表

| 方案要素 | 判定 | 关键证据 |
|---|---|---|
| 向量复用 kb_vectors（`atom:`/`note:` 前缀） | **直接可用** | 知识飞轮已用同一模式存记忆向量：`workflow-boot.ts:479-497`（chunkId=记录id 直接写入 kb_vectors）；`deleteByChunkId` 四层齐全（接口 `vector-store.interface.ts:119` / PG `pg-vector-store.ts:172` / Lance `lance-db.service.ts:355` / 仓储 `kb-vector.repository.ts:105`） |
| 4 张新表 + 双端迁移 | **直接可用** | 照 `create-kb-chapters.ts:15-88` 模板（方言分支 + checkTableExists + 补列 + 索引）；注册点 Electron `electron/database/index.ts:846-849` + Web `web/server/index.ts:476-479` 双入口手工调用 |
| P1 消化流水线挂域事件 | **直接可用** | `kb:document-completed` 事件已发布（`knowledge-base.service.ts:123-130`；事件名定义 `workflow.types.ts:1145-1165` 含 payloadKeys）；触发调度器按 userId 同租户匹配 + 滑动窗口限流 20 次/分钟防自环（`workflow-trigger-scheduler.service.ts:228-269`）。当前无内置消费者——我们新建消费方即可 |
| P4 周期代谢定时触发 | **直接可用（cron 路线）** | 引擎原生 cron：30s tick 扫 next_fire_at，错过的触发点不补跑（`workflow-trigger-scheduler.service.ts:111-181`）。「空闲检测」语义不存在，用 cron 近似（见 §5.3） |
| 长任务运行（多小时消化） | **直接可用** | Run Journal 先日志后内存 + 每 N 事件落 snapshot + 崩溃后 rehydrate 重放续驱（`engine/journal.ts:1-49`、`workflow-engine.service.ts:437-468, 669-760`）；boot 恢复在途 run（`workflow-run.service.ts:625+`）；时长上限 24h（`workflow.types.ts:1254`）。**节点契约要求**：execute 可重入 + 每批 `saveState`（`engine/node-handler.ts:26-87`，state_json ≤512KB） |
| 自定义节点注册 | **直接可用** | 照 `ai-nodes.ts:43-97` kb-retrieve 先例 + 目录条目 `workflow-node-catalog.ts:282`；启动自检保证目录↔handler 一致（`nodes/index.ts:38-44`） |
| LLM 结构化输出可靠性 | **直接可用（零新建解析器）** | 公共四件套：`ai-call.ts` 的 `extractJsonFromResponse`（:524）+ `parseJsonString` 三级渐进恢复（:311-338）+ `isJsonTruncated`（:416）+ 截断续写 `callAIWithContinue`（:469-518）；纠错闭环范式：storyboard-cogen 校验错误回喂重试 1 次（`storyboard-cogen.ts:483-522`） |
| **structured-provider 消费链（承重墙）** | **链路完整，飞轮停用不影响** | 唯一活跃消费者 = HostKit 装配层 `host-kit.ts:251`（assembleMemoryLines 遍历 providers → segments 进 dynamicContext `:328-382` → `loop.ts:212-220` 注入消息尾块 + `memory_assembly` 轨迹留痕 `:346-350`）。`workflow-boot.ts:456-461` 注释明文：「结构化知识提供方（图谱等）不受影响」；通道A（`:244-261`）与通道B飞轮（`:263-276`）互不依赖。**会 query kb-brain 的宿主**：story-room（`room-session.ts:341`）、domain-learning（`dl-agent-harness.service.ts:289`）、episode-production（`ep-agent-harness.service.ts:339`）——前提 supports(scope) 匹配。**缺口**：chat 的 system-agent `scope: null`（`system-agent.service.ts:222`）进不了通道A（§5.4） |
| 审批流（卡片提议人审） | **直接可用（复用协调器）+ 需小改（UI 三件套）** | ApprovalCoordinator 是平台级泛用件：发卡挂起/批准恢复/approve_with_edit/超时拒绝/Amendment 缓存（`runtime/approval.ts:96-293`）；EP 的「approval:request → choice 通道 → decide IPC」三件套可照抄（`ep-agent-harness.service.ts:277-294` → `preload/index.ts:3042-3047` → `agent.handler.ts:52-60`）。注意 `am:*` 记忆人审队列被 `flywheel()` 守卫拦（飞轮停用时抛错，`agent-tasks.handler.ts:23-27`）——**不可直接复用**，用 kb_notes.status=proposed 自有队列 |
| P3 深度研究流四要素 | 循环/过程可见/审批 **直接可用**；产物回写 **需小改** | 工具循环+流重试（`loop.ts:223+, 467-479`）；轨迹实时外推（`trajectory/sink.ts:45-73` onEntry → 工作台时间线）；审批见上；产物回写先例是「落草稿包待确认」（`room-agent-tools.ts:124-150` saveDesign → addDesignItem），大脑照此走 proposed 草稿态 |
| 多租户 user_id | **直接可用** | BaseRepository scoped 自动注入（`base-repository.ts:89-93, 123-126`）；Electron 固定 `local-default-user`（`user-context.ts:17, 46-48`，启动注入 `electron/database/index.ts:343-350`）。**纪律**：事务/QueryRunner 手写路径必须手动带 userId（`kb-document.repository.ts:98-110` 注释先例）；异步回调照 ALS 防护模式——同步捕获 + runWithUser 包裹（`approval.ts:105-111`、`workflow-trigger-scheduler.service.ts:143, 244`） |
| `kb:brain:*` IPC 通道 | **需小改（守卫已覆盖）** | knowledge-base 包已声明前缀 `['knowledge-base:', 'kb:', 'kb-qa:']`（`core/packs/knowledge-base/index.ts:34`）→ `kb:brain:*` 自动被 ipc-guard 覆盖，manifest 不用动；handler 照 `knowledge-base.handler.ts:54-143`、preload 照 `preload/index.ts:1200-1305` |
| 消化进度/论断列表/收件箱/仪表 UI | **需小改/照抄先例** | 进度：文档表格进度列 + store 事件回写（`KnowledgeBase.vue:212-219`、`stores/knowledge-base.ts:101-137`）；论断页签照 QA tab（`:128-148`）；卡片收件箱照 StoryRoom ArtifactCard 四动作 adopt/edit/regn/ignore（`ChatCanvas.vue:42-87`）；活动流三先例任选（StoryRoom task-log / EpAgentPanel / NotificationCenter+dl-notice） |
| 前端 KB 界面挂点 | 单体 `KnowledgeBase.vue`（2054 行）承载全部；`renderer/packs/knowledge-base` 只有路由骨架 | 新页面挂此 View 的页签体系内 |

## 2. 需要新建的部分（清单与量级）

| # | 新建项 | 量级 | 说明 |
|---|---|---|---|
| N1 | **PPR 图算法（平台层）** | 小（纯 TS 数百行） | 仓库无 pagerank/graphology 存量（grep 零命中）。算法本身成熟；要点是图载入缓存（每次查询从 SQL 建图不可接受，按 kbId 做 LRU 缓存 + 失效通知）。真实消费者 2 个（kb-brain + 长文图谱），够抽象门槛 |
| N2 | **FSRS 调度（平台层）** | 小（引库）或中（手写） | 仓库无任何 SM-2/FSRS（dl 的复习是固定间隔 `learning-review.rules.ts:80-97`）。建议引入 `ts-fsrs` 5.4.2（MIT，纯 TS 零原生依赖，ESM/CJS 双出）——开源优先且算法正确性不该手写。放 `platform/services/fsrs.service.ts`（若 dl 将来共用，边界合规：包内代码禁止互引，`CLAUDE.md:132-134`） |
| N3 | **LanceDB ANN 索引** | 小 | 现网零 createIndex 调用=暴力扫描；安装版 `@lancedb/lancedb@0.27.1` 原生支持 IvfPq/IvfFlat/HNSW（`dist/index.d.ts:10` 导出 Index/IvfPqOptions…）。消化完成后触发 `table.createIndex()` 即可。PG 端已有 HNSW 无需动 |
| N4 | **`kb_brain_query` agent 工具** | 小 | agent 工具面现无任何 kb 检索工具（grep 零命中；chat 的 RAG 是旧版预检路径 `chat.service.ts:182-235`）。照 room-agent-tools 注册模式（`room-agent-tools.ts:1549-1564`：packId + zod + dangerLevel:'read' + 幂等注册） |
| N5 | **观感捕捉·划线输入面** | 中（文本层）/ 大（原版式，不做） | KB 无阅读器（epub/pdf 只有主进程解析）。DL 有完整「选区笔记」先例：window.getSelection + mouseup 工具条 + anchor 快照（`DomainLearningSpace.vue:1613-1705`、`dl-note.entity.ts:19-45` anchor_text/start/end）。**走章节/切片 Markdown 只读渲染 + 选区笔记**（照 DL 小改级）；epub 原版式阅读器（CFI 定位/持久高亮）明确不做 |
| N6 | **卡片提议收件箱 UI + 事件转译** | 中 | ApprovalCoordinator 直接复用；EP 三件套照抄（事件转译 + IPC + Vue 卡片）；`am:*` 队列形态可参考但被飞轮守卫拦不可复用 |
| N7 | **跨书事件链对齐（情节卡归纳）** | **大（全案最高风险）** | 无存量先例，算法+LLM 混合。设计已对冲：settingEnabled 先行（规则归纳，低风险）、plotEnabled 分开关试点、实例带人工可核回链。必须 POC（§6.2） |
| N8 | 消化率仪表 | 小 | header-stats 扩展（`KnowledgeBase.vue:108-112`）+ 聚合查询 |

## 3. 容量与性能预估（200 本同类型小说场景）

| 项 | 估算 | 承接 |
|---|---|---|
| 向量总量 | chunks ~40 万 + atoms ~4-5 万 + notes/实体摘要 ~千级 ≈ **45 万条** | LanceDB 加 IvfPq 索引后可控（N3）；PG 端 HNSW 现成，但注意 8192 维 zero-pad 的存储放大（`pg-vector-store.ts:51, 331-337`，1M 行≈16GB——45 万行可接受，百万级需重估） |
| 检索延迟 | 现有混合检索路径不变；atoms 短句 BM25 天然利词法命中 | `findByChunkIds` 是 N+1（`kb-vector.repository.ts:95-102`）——需小改批量接口 |
| 消化成本/本（30 万字） | 基础遍 ≈ 38 章 ×（1-3 次低档原子化 + 每批 1 次裁决高档）≈ **100-200 次调用/本**；视角遍按启用数线性叠加 | 成本台账进仪表；并发照章节摘要 worker-pool（concurrency=3，`kb-chapter-summary.service.ts:90-102`）；无 p-limit 依赖，手写模式即先例 |
| 长任务时长 | 单本消化分钟级；200 本批量按队列串并（并发≤2）跑数小时 | 24h 上限内；节点每批 saveState 可重入，崩溃重放安全 |

## 4. 承重墙结论：装配链路（最重要的一项核查）

**问题**：知识飞轮默认停用（`AGENT_MEMORY_FLYWHEEL` 缺省 off，`workflow-boot.ts:873`），若 structured-provider 的消费者在飞轮内，则「大脑注册 provider 供 agent 装配」是空转。

**结论：不是。** 消费链实证：

```
registerStructuredProvider('kb-brain')          ← 照 room-session.ts:309-311 幂等安装先例
  → host-kit.ts:251 assembleMemoryLines 遍历 listStructuredProviders()
  → scope 匹配则 provider.query({topics, budget})     ← host-kit.ts:244-260（缺省预算 2 段/600 字符）
  → segments 进 dynamicContext（消息尾块，保前缀缓存）  ← host-kit.ts:328-382 → loop.ts:212-220
  → memory_assembly 轨迹留痕（memoryRefs 可见引用）     ← host-kit.ts:346-350
```

飞轮停用只影响通道B（`if (flywheel)`，`host-kit.ts:263-276`）；通道A 与之互不依赖，`workflow-boot.ts:456-461` 注释明文确认。**三个宿主立即可消费**：story-room / domain-learning / episode-production（各自传了 memory.scope）。缺口仅 chat（§5.4）。

## 5. 方案微调（核查后需改回设计文档的 4 处）

1. **「模型分档」表述失准**：`generateCompletionText` 的 purpose 只是日志标签，无集中档位表、无超时重试（`simple-llm.ts:35-68`）。廉价模型路由照 env-config 先例（`AGENT_MEMORY_EMBEDDING` 模式，`workflow-boot.ts:466-473`）：新增 `KB_ATOMIZE_MODEL` / `KB_ADJUDICATE_MODEL` 可选覆盖，缺省回落宿主模型。失败 fail-soft 照章节摘要 failed 标记先例。
2. **「空闲期触发」降级为 cron 近似**：引擎 cron 原生支持且稳定（dl-pace 的进程级 setInterval 在 Web 端 web-disabled 是警示，`dl-pace-scheduler.service.ts:1-60`）；代谢任务走引擎 cron 触发器（如每日凌晨），应用层空闲检测（输入静默）后置为增强项。
3. **人审队列不用 `am:*`**：被 `flywheel()` 守卫拦截（`agent-tasks.handler.ts:23-27`）。kb_notes.status=proposed 即自有队列，收件箱 UI 照 StoryRoom ArtifactCard。
4. **chat 链路的消费缺口**：system-agent `scope: null` 进不了通道A。两选一：(a) 给 system-agent 传 scope（改动小但语义上 chat 无 projectId，需要虚拟 scope 约定）；(b) M3 先限三大宿主（创作/学习/剧集），chat 场景靠 `kb_brain_query` 工具（N4）+ 旧版 RAG 预检路径兜底。**建议 (b)**——与「AI 原生统一对话」偏好的兼容靠工具化而非装配通道，避免为 chat 特设 scope 语义。

## 6. 必须先做的 POC（并入 M0，通过才进 M1 批量）

| # | POC | 验收线 | 失败fallback |
|---|---|---|---|
| 6.1 | **中文小说原子化质量 spike**：取 3 本书各 2 章，跑两段式萃取 + Graphiti 反泛化/负面清单 prompt，人工评 100 条抽样 | 论断三要件合格率 ≥85%，实体误抽率 ≤10% | 调 prompt/换档位模型重测；仍不达标则收缩 type 集（先 fact/method） |
| 6.2 | **跨书事件链对齐 POC**（2-3 本同类型） | 结构对齐的人工可用率：粗粒度模式（3-6 段骨架）≥60% | 情节卡降级为「单书事件链+人工归纳」半自动；setting-pattern 不受影响 |
| 6.3 | **裁决协议正确率**：构造 duplicate/contradicted/unrelated 三类样例各 20 条 | 分类正确率 ≥80%；**跨视角相反评价零误裁**（分域回归） | suspected 中间态阈值上调，扩大人审比例 |
| 6.4 | **LanceDB 50 万向量 + IvfPq 索引延迟测试** | top-20 检索 P95 < 500ms | 降 topK 预召回 / 分库 / PG 模式 |
| 6.5 | **成本台账实测**：一本 30 万字书全消化（含裁决） | 实测 token/费用入仪表；给出「每本成本」参数 | 视角遍/情节归纳默认关，按需开 |

## 7. 工作量总估（不含 UI 打磨往返）

| 阶段 | 内容 | 估算 |
|---|---|---|
| M0 | 评测集+基线+仪表最小版+全部 POC | 5-8 人日 |
| M1 | 4 表迁移+基础遍流水线（含裁决/事件链/幂等）+统一池 include | 10-15 人日 |
| M2 | 语义边+PPR+实体摘要+思想卡/视角遍+观感对话捕捉+收件箱 | 12-18 人日 |
| M3 | structured-provider 注册+创作装配+kb_brain_query 工具+设定卡+CRAG+FSRS 学习模式 | 12-18 人日 |
| M4 | 代谢整固+品味侧写+划线面+深度研究流+情节卡+技能导出 | 12-18 人日 |
| 合计 | | **51-77 人日**（单人 2.5-3.5 个月，含测试与对抗 review 节奏） |

## 8. 结论

- **架构面全绿**：无一条流水线需要新引擎/新框架；四张表、向量命名空间、事件触发、长任务恢复、审批、多租户、IPC、UI 全部有 file:line 级先例。
- **两个真实的技术不确定性**集中在算法+LLM 质量（原子化质量、事件链对齐），都已用「POC 先行 + 分开关 + 半自动降级」对冲，且不阻塞 M1/M2 的主体价值（论断层+思想卡+统一池检索）。
- **承重墙（装配链路）实测稳固**，且发现 chat 缺口与 `am:*` 陷阱两处需要绕行的坑，已给出决策建议。
- 建议按 §5 的 4 处微调回写设计文档后，方案进入可评审定稿状态。
