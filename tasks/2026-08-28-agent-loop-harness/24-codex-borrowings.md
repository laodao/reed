# 24 · codex 借鉴采纳决策（Cross-Project Research Adoption）

> Agent Loop Harness ｜ 2026-09-06 ｜ 状态：**已定稿**
> 来源：soft-fac 项目的 codex 深度调研（`/home/ubuntu/workdir/soft-fac/docs/research/2026-09-06/`，
> 13 份文档 @ codex 008bbd58 实读）。本文经本项目场景过滤后映射到我们的规格集，
> 修订 12/15/23 号（见文末落点清单）。
> 过滤前提：我们是**业务 DB 工具**型 harness（无代码执行/无沙箱诉求）、双宿主
> （工作流 agent-loop 节点 + 独立宿主）、AI SDK v6 底座、ALS 多租户、DB 为真相源。

---

## 一、第一梯队：直接补强已定设计的短板（采纳，落点已修订）

| # | codex 机制 | 我们的现状缺口 | 落点 |
|---|---|---|---|
| 1 | **压缩守恒结构**：全部真实用户消息按独立预算（20K）从新到旧**原样保留**、摘要只置尾；两级水位（软限 90% 自动压缩 + 硬顶 95% 有效窗口，配置被夹到 ≤90%）；压缩后本地估算回填（字节/4）防"压完立即再触发"抖动 | 12 号 §9"回填前压缩"只有单阈值+占位符截断；vendor 的 DefaultCompactionStrategy 无用户消息保留语义 | 12 号 R6 |
| 2 | **注入内容带 content_kind 元数据**：每段注入（AGENTS.md/摘要/规则）与稳定分类同持久化，压缩保留策略**按 kind 而非位置**决定 | 我们的 snapshot/system 注入无分类，压缩时无法区分保护级 | 12 号 R6 |
| 3 | **WorldState section diff（稳态注入趋零）**：规则/环境/设定各为带稳定 ID 的 section，逐轮 diff，**变更才注入**（带 REPLACEMENT/REMOVAL 显式通知） | buildStateSnapshot 每轮全量注入——设定集变大后 token 浪费且干扰 | 15 号 R5b |
| 4 | **审批三态 + Amendment 沉淀**：判定 `Skip/NeedsApproval/Forbidden`；`ReviewDecision::Amendment` 把"本次批准"编码为"未来同类免批"（会话级缓存或规则）；**available_decisions 由服务端下发**（前端零硬编码审批按钮集）；审批缓存键做规范化（防同命令换包装重复问） | ApprovalDecision 只有单次 approve/reject；每张提案卡都要点（审批疲劳）；前端按钮集合硬编码 | 23 号 §4b |
| 5 | **无头审批三态**：never 强制（默认）/ **auto-review（评审 agent 当审批人则保留 on-request）** / 运行时对审批请求**确定性拒绝**（无人场景绝不挂死等人类） | 工作流 agent-chat 只有 fail/auto_approve 两态 | 设计稿 §8.2 对应位（02 号 M5 范围） |
| 6 | **工具计划化 + 读写锁并行门**：每步不可变工具计划（模型可见面=可执行面同一份真相）；`supports_parallel` 声明式——read 锁可并行、write 锁自动串行 | buildToolDefs 已有 run 级快照 ✓（同构确认）；但 ai@6 并行工具调用时**写库工具无串行化保护**（同轮两个写工具并发打同一实体） | 23 号 §3b（AgentToolDef 加 supportsParallel）|
| 7 | **终态事件完备契约**：每个执行单元终态三选一必达（Complete{error?}/Aborted{reason}/Error）+ duration；**事件外发与持久化同点同序（先落盘后外发，单点函数）**——审计/恢复/断线补齐三问题一解 | AgentEvent 有 done/error 但无"必达+自足"纪律；事件桥与轨迹落库顺序未约定 | 23 号 §7b |

## 一b、记忆专题深挖（2026-09-06 补，用户追问后专项研读）

codex 记忆体系全景（03 号 §五/§六 + 12 号 ext 表）与我们飞轮（15 号）是**不同取向**：
codex = 静态指令注入（AGENTS.md）+ 工具化长期记忆（pull）；我们 = 向量装配（push）+
结构化图谱。专项对照后追加采纳 5 项：

| # | codex 机制 | 我们的现状 | 决策 |
|---|---|---|---|
| M1 | **记忆双形态分界**：长期记忆做**工具**（add_ad_hoc_note/list/read/search，模型按需 pull），仅静态规则注入（push）；分界判据=体量与查询模式 | 15 号飞轮纯 push（装配）；但我们已有 query_setting 类工具（事实上的 pull）——分界存在但**未成文** | **采纳并成文**：结构化设定/大体量事实走 pull（查图谱/记忆工具），轻量偏好与经验走 push（预算内装配）——15 号 R6 |
| M2 | **写侧两阶段 + 分档推理**：Phase1 低推理档提炼 rollout 摘要 → Phase2 中档整合代理**依据 ≤4MiB workspace diff 增量编辑**记忆文件（非全量重写） | distiller 一阶段（轨迹→候选），代谢是规则化合并（相似度），**无 LLM 增量编辑现有条目** | **采纳**：代谢环加"LLM 增量整合"档（preference/fact 高频演化类）；蒸馏用小模型（开放问题 2 同向确认）——15 号 R6 |
| M3 | **成本护栏数字化**：提炼并发 8、扫描上限 5000、输入截 70% 窗口、中间资源保留 7 天 | 蒸馏只定了 4000 字符输入上限 | **采纳为缺省值**——15 号 R6 |
| M4 | **静态指令层合并语义**：AGENTS.md 全局级不拼接（第一个非空胜出）+ 项目级 root 向下逐层收集 + 分隔符固定 + **信任门**（untrusted 整层跳过）+ 32KiB 字节硬闸 | 业务包规则集（18 号 Pack Manifest）未定义合并语义 | **采纳**：包规则层合并语义（全局用户偏好→包规则，固定分隔，预算硬闸，untrusted 包跳过）——18 号留待实施时落 |
| M5 | **`[memory:...]` 引用回链 + history-notes 私有态**：模型输出引用记忆可解析；压缩后恢复先验对话的工具显式"静默使用永不披露" | 注入格式 [fact\|confidence] 无条目 ID；压缩后无"查完整历史"工具 | **采纳**：注入格式补条目 ID（回链审计）；加 read_full_history 工具（模型越压可溯，配合"轨迹不被压缩改写"既有纪律）——15 号 R6 |

同构确认 2 项（不需改）：写侧后台化（distiller 终态触发 ✓）；压缩不改写审阅依据（轨迹表终态留存 ✓，review_history 思想已覆盖）。

### 一b-2 五维完备对照（保存/更新/分层/存储/查询——机制驱动之外的维度扫描）

| 维度 | codex | 我们（15 号+图谱） | 判定 |
|---|---|---|---|
| **保存** | 三路径：模型代用户 `add_ad_hoc_note`（免闸门快速通道）/ 两阶段后台流水线 / AGENTS.md 人手写 | 两路径：onTurnEnd 蒸馏（经闸门）/ 用户显式（variable 偏好直通）。**缺"对话中模型即时记"的快速通道成文** | **M6 采纳**（补真空）：业务 definition 可声明 `remember` 工具（轻量笔记直达 propose，闸门按业务定）；架构已支持（AgentToolDef），补的是范式说明 |
| **更新** | Phase2 整合代理编辑**单一 raw_memories.md 文件**（无版本链/无状态机） | 条目化状态机（pending→active→superseded/conflicted）+ supersedes 版本链 + 部分唯一索引 | **我们更优，不学 codex**：单文件编辑在多租户/可审计/可回滚上不可行；增量整合档已采纳（M2）与之互补 |
| **分层** | 隐式三层：AGENTS.md 静态指令 / memories 单文件 / 会话历史+**history-notes 私有模型态**（"静默使用永不披露"，跨压缩存活的模型草稿） | 显式 L1-L4 + 图谱 + push/pull 分界。**缺 L1.5 模型私有草稿区**（L1 是 messages，压缩会折） | **M7 采纳**（补真空）：AgentLoopState 增 `scratch: string[]`（模型经 scratch 工具读写，不进装配、不推前端、随 saveState 步级持久化、压缩时原样保留）——故事研讨室"当前讨论焦点"的正位 |
| **存储** | 文件系统（~/.codex/memories 受信根 + rollout JSONL 真相源），单用户本地 | 表存储（memory_entries/episodes/usage_log + agent_graph_* + 轨迹）+ 向量（LanceDB/pgvector）+ ALS 多租户 | **我们必然不同**：多租户/双端决定表存储；"受信可读根"概念映射为工具 scope 隔离（已有） |
| **查询** | 工具（list/read/search）+ prompt 贡献 + `[memory:...]` 回链 | 装配（向量+置信度+新近度+预算分层 L2 25%/L3 45%/L4 30%）+ query 工具 + 图谱 stateAt + 回链（M5 已采纳） | 双向已覆盖；预算分层装配为我方优势 |

**结论**：五维中"更新/存储"两维我们设计更强（多租户与可审计约束下的必然），"分层/查询"双向互补已采纳，"保存"与"分层"各补一个真空（M6 工具化快速通道、M7 私有草稿区）。

## 二、第二梯队：架构增强（采纳为扩展位/里程碑内实现）

| # | codex 机制 | 映射 | 落点 |
|---|---|---|---|
| 8 | **steer 用户插话**：busy 时用户输入三模式准入（拒绝/排队下一轮边界合流注入/立即打断），pending 队列带全局接受序号 | 互斥现为"抛 AgentBusyError（等或取消）"——故事研讨室体验短板：用户想说"方向不对"只能打断重来 | 23 号 §1b（sendMessage opts.mode）|
| 9 | **三级 ID 链 + UUIDv7**：thread→turn→item 全部内嵌事件字段（时间有序免排序）；条目化事件（断线重连拉条目快照而非重放增量流） | AgentEvent 无因果 ID 链；断线恢复靠 getHistory 重建 ✓ 但事件无 item 粒度 | 23 号 §7c（v2 事件增强，M3 前落地）|
| 10 | **turn 级模型/参数快照正典化**：每 turn 记录模型与参数快照，跨模型 resume 显式告警 | AgentLoopState.task 有 toolNames/maxSteps，**无 modelPreference 快照**——切模型续跑会静默用不同模型 | 12 号 §4.2 增字段（P2 顺手）|
| 11 | **投影"可滞后、绝不超前"单向依赖 + 单调 ordinal 幂等游标** | agent_trajectories 已有 (run_id,node_id,seq) 唯一 ✓（同构确认）；补"对账只修派生视图、永不回写真相"纪律 | 12 号 R6 附注 |
| 12 | **记忆两阶段后台流水线**（rollout→摘要→整合代理后台编辑，模型用工具读而非 prompt 注入） | 飞轮 distiller 已设计为任务终态事件触发的后台作业 ✓（同构确认，无需改） | — |

## 三、不采纳项（本项目场景过滤，与 soft-fac 结论同向但理由独立）

| 项 | 不采纳理由 |
|---|---|
| 沙箱三平台/network-proxy/credential-broker | 我们无代码执行——工具操作自有 DB；出网仅 provider 侧且已有 SSRF 闸门；密钥经 getProviderConfig 单一事实源不入上下文 |
| JSONL 真相源 + SQLite 投影双层 | 我们 PG/SQLite 即真相源（与 soft-fac 同判）；codex 双层是 CLI 单机"数据库坏了会话还在"的取舍 |
| MCP server 侧 | codex 自己删了它（agent 互联不该走 MCP）；我们 client-only（@ai-sdk/mcp，M5）立场一致 |
| wire 协议单协议收敛（仅 Responses） | codex 前提是"客户端事件模型只有一套"；我们多 provider 是立身之本（AI SDK 多协议并存） |
| app-server/IDE/TUI 形态与宏表协议 | 我们是 Electron+Web 双宿主；"引擎无 UI 假设"我们已用 AgentHost+事件通道达成（同构确认），无需引入其传输层 |
| code mode / tool_search 延迟加载 | 依赖 OpenAI Responses 特性，无对应物 |
| 148 crate 拆分 / Bazel+Nix | 规模不同 |

## 四、落点清单（本次修订）

| 文档 | 修订内容 |
|---|---|
| 23 号 | §1b steer 模式；§3b supportsParallel；§4b 审批沉淀三件（scope/availableDecisions/缓存键规范化）；§7b 终态必达+同点同序；§7c ID 链条目化（v2 位） |
| 12 号 | R6：压缩守恒（用户消息保留预算/两级水位/估算回填）+ content_kind 注入分类 + 同点同序纪律 + AgentLoopState 增 modelPreference 快照 |
| 15 号 | R5b：WorldState section diff（设定快照稳态注入趋零） |
| README | 索引 + 借鉴来源声明 |
| 15 号（二次修订） | R6 记忆专题：push/pull 分界、两阶段蒸馏+增量整合、成本护栏缺省、注入 ID 回链、read_full_history |
