# Agent Harness 总收口深度 Review（2026-09-07）

范围：feat/agent-harness 全部 harness 开发内容（批 1-7 + P2 Journal E1-E3 + M1.4 agent-loop 节点四件套），自研代码约 5500 行 + 测试约 3700 行。四路独立对抗审查（subagent，全部实证型——发现必须附可复现测试方立案），三十三条历史修复逐项复核落地情况。

## 结论

**P0×2 + P1×6 + P2×8 + P3 三十余项，全部修复或显式立项收口。** 修复后全平台 1197 测试通过、15 失败为已知环境基线零新增；新增回归测试 20+。最重的一组（P0×2 + P1×3）全部藏在同一个覆盖空洞里：**DbJournal 生产路径从未被任何测试执行过**（25 例引擎测试全用 InMemoryJournal）。

## P0（生产阻断级，均在 DbJournal）

| # | 发现 | 证据 | 修复 |
|---|------|------|------|
| 1 | 事件行从不生成 id：SQLite NULL 主键使 `find` 去重塌缩（listByRun 恒 ≤1 行 → 重放空投影 → 整 run 从头重执行、副作用翻倍）；PG 违 NOT NULL（每 run 启动即失败） | 真实 better-sqlite3 实测 RAW ROWS 全 id=null | 确定性 id `j_{runId}_{seq}` + 真实 DataSource 契约测试 4 例 |
| 2 | appendBatchAtomic 裸 em.insert 绕租户 scoped：全部 edge_activated 批事件 user_id=NULL → 属主重放读不到 → 恢复缺边激活投影，run 无声挂死/假完成 | 实测批/单条事件 user_id 双轨 | 事务前捕获 ALS userId 显式注入 + 跨租户矩阵测试 |

## P1（6 项）

1. **latestSnapshot 死代码**：调不存在的 `scoped.createQueryBuilder`（只有 `qb()`），TypeError 被 rehydrate `.catch(()=>null)` 吞成"无快照"——b036b226 宣称的"快照 O(1) 定位"修复从未生效。tsc 报错早已存在但被 534 条基线噪音掩盖（**教训：新增文件不得进基线对照，按文件归属判新错**）。
2. **快照 loopPseudoVars 二次方放大**：b036b226 提交信息与 11 号注记均声称已修，`git show` 证实该 commit 代码本身未改——第三次"宣称已修实则未生效"。实测 60 迭代单快照 708KB/列表副本 53 份。修复：投影 `{item,index,listSize}`。
3. **重放循环终态守卫缺失**：loop_completed 已到的循环仍参与驱动重建——无快照时 fail-fast 毒杀日志完好的整 run（标 interrupted）；有快照时用残缺进度覆写 succeeded 为 running 重跑已收敛迭代。
4. **rehydrate 在途重执行丢 persistedState**：M1 验收"杀进程重启从中断轮恢复"对中途崩溃场景整体失效（loadState 恒 undefined → agent-loop 从第 0 轮重跑）。修复：exec.reexecPersistedStates 缓存回填。
5. **resetSession 失败永久毒化会话**（agent-service）：store.delete 抛错后 resetting 永真——queue/interrupt 消息陷入 setImmediate 自旋，实测每秒 128 万次打满单核。修复：try 回滚 + 让步次数封顶。
6. **审批回调 throw 绕过工具终态事件**（loop）：ai@6 并行执行同步多工具（dist 源码核验 Promise.all），第二张需批准工具撞审批单卡断言且 throw 在包装层 try 之外——tool-end 流事件与 tool_result 轨迹永不发出（前端动作卡无终态、审计配对缺行）。修复：try 收口 + 拒绝原因经 reason 透传。

## P2（8 项）

1. **压缩空转无退避**（context-manager，两型实证）：实测水位含 system/工具 schema 固定成本时每步重跑摘要 LLM 调用且跨口径比较恒判"成功"；零变更回填拦不住下一触发。修复：无进展指纹（估算增长 ≥1.5 倍或水位回落才重试）+ 同口径成功判定。
2. **12 号 §6.5 模型错误重试（≤3 次退避）未实现**：契约-实现实质缺口，显式立项延期至接线批（02 号/12 号注记）。
3. **多轮挂起等待窗计入净时长**（agent-loop-node）：12 号 §6.2 waitMs 累计未实现，第二次恢复即误判"净时长已耗尽"。修复：accumulatedWaitMs 字段累计。
4. **结构化拒绝 reason 字段错位**：bridge 写 comment、ApprovalDecision.reject 读 reason——模型收到虚假"用户拒绝"而非真实持久化故障。
5. **重定向绕 SSRF 闸门**（http-fetch 继承缺陷，被 agent 的 http_get 放大——URL 来源从工作流作者放宽到模型输出）：fetch 默认 follow 且 Location 不过闸门，公网域名 302 跳内网可绕。修复：redirect:manual 逐跳校验（≤5 跳），4 例回归。
6. **v≠1 快照违反宁慢勿错**（journal-replay）：仅忽略 payload 但 startSeq 仍推进 → 空投影静默整图重跑。修复：快照视为不存在。
7. **C1 自由环崩溃恢复停摆 + 序号分叉**：重放只 set 不删陈旧激活序号，activateEdge 守卫跳过新激活 → 下游永不重执行、journal/内存永久分叉。修复：恢复镜像 computeReady 出边清理 + 两进程引擎级测试。
8. 并行审批断言消息裸穿（并入 P1-6 修复）。

## P3（三十余项，均已修或注记）

withTimeout 预中止、轨迹 iteration 硬编码 0、dispose 残留轮留痕、tickReviewTimeouts reject 路径 try/catch、recoverOnBoot 首循环 ALS（getByIdRaw）、InMemoryJournal latestSnapshot/appendBatch 原子性、completeLoop 清 drivers、journal created_at、void 工具结果误报 _unserializable、_oversize preview 字节截（CJK 3 倍差）、maxCalls 拦截审计留痕、delta 30ms 合批、DANGER_LABELS 消费服务端 requiresApproval、isElectron 门禁共用、AgentLoopNodeConfig 双声明收口（单一事实源）、stopReason desc 补 human_rejected、护栏失败附 usage 摘要、zod 截断常量统一、vendor 第 4 处偏离标注（defaultEstimateTokens 吞异常）、120s/60s 工具超时文档对齐、ProviderAdapter invalidateCache 接线点注记、审批-校验顺序文档对齐（14 号 §6，改序立项 M2）。

## 七条质量标准结论（横切路）

1. 架构统一：通过（agent-loop-node 为唯一焊点；无反向 import；harness 未装配 fail-fast 同 getToolService 纪律）。注记：delta 合批曾只在 event-bridge 一侧——已对齐。
2. 组件共用：通过（四内置工具全部直调现有执行器；SSRF 闸门单一入口未破）。注记：DANGER_LABELS/工具名清单双写已收口。
3. 模块/函数设计：通过（纯函数分区、所有权分层有注释依据、挂起桥弃置式拆解有探针实证）。
4. 无写死参数：基本通过（护栏常量收口 WORKFLOW_DEFAULTS/LIMITS；零散魔法值已修）。
5. 必要日志：基本通过（挂起/恢复/护栏/降级路径均有留痕；轨迹 debug 级留待 M1.5 落表）。
6. 不吞异常：通过（全扫描零空 catch；`latestSnapshot TypeError 被 .catch 吞`类问题已修）。
7. 无复制粘贴：基本通过（isElectron 门禁/zod 常量双写已收口）。

## 历史修复复核（33 项）

29 已落地（含 loop 首步 saveState、reject→human_rejected、跨租户守卫、registryWrapped 分层等）；**3 项未落地/部分（本批补齐：快照 O(1) 定位死代码、快照去列表引用未生效、护栏 waitMs 未累计）**；1 项文档措辞分歧（当轮输入预算扣减 vs 注记字面，留档）。三次"宣称已修实则未生效"的共同根因：修复未经测试或 tsc 验证即回写文档——本批所有修复均先有复现测试再改代码，文档回写以测试输出为准。

## 遗留（显式立项）

- §6.5 模型错误重试 ≤3 次退避（接线批 / vendor retry 形状）
- 审批先于校验的改序（M2；14 号 §6 已注记现状：审批人见原始 args）
- streamChannel 拆通道（23 号 §7 注记：start/done 恒走主通道）
- 会话卡"修改后批准"入口（前端；运行详情页链路已可用）
- ProviderAdapter.invalidateCache 接 provider 配置变更事件（设置批）
- 轨迹 iteration 消费面（agent_trajectories 落表 M1.5）
- 完整双标记伪造压缩摘要（结构校验，23 号批 6 注记边界）
