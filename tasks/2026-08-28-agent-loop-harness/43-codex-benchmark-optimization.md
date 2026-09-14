# 43 号：codex 对标评审 + harness 逐条优化

> 用户指令：①深度阅读 codex 核心模块；②与本系统 harness 逐功能对标、深度评估不足；
> ③按方案逐条优化。本文档 = 对标证据 + 不足清单 + 实施记录 + 登记。

日期：2026-09-10　分支：feat/agent-harness（基于 1c45efe8 后的工作区，未提交）
对标对象：/home/ubuntu/workdir/codex（OpenAI Codex CLI，master 008bbd5884，2026-09）
调研方式：4 路并行深读代理（循环/上下文/工具/持久化），全部结论带 file:line 证据；
本系统侧逐文件重读（agent-runtime 7255 行全量）。

---

## 一、codex 核心机制速览（评审证据基础）

### 1. 循环与客户端（session/turn.rs、tasks/regular.rs、responses_retry.rs）
- 两层循环：外层 RegularTask::run（有 pending input 就再跑一轮 run_turn）；内层 run_turn 的
  step 循环。**无任何 max_steps 上限**（全仓 grep 无命中），终止 = 模型不再 follow-up 且无
  pending input。每步请求 = 全量 history 克隆（turn.rs:421-443）。
- **流重试（responses_retry.rs:102-126）**：采样流错误默认重试 5 次（上限 100），指数退避
  `200ms × 2^(n-1) × jitter(0.9-1.1)`（util.rs:86-91）；服务端 retry_delay 优先；只重试
  Stream/RateLimit/Timeout/5xx/连接类（error.rs:371-396 is_retryable），TurnAborted/
  InvalidRequest/ContextWindowExceeded 等不重试。重试 = 整请求重放（re-clone history）。
- **SSE 空闲超时（codex-api/src/sse/responses.rs:579-604）**：默认 300s 无事件即转可重试错误。
- **步间 steering（session/turn_input.rs:595-601）**：用户消息原子挂到活动 turn 的
  pending_input，每步采样开头 drain 进 history，不打断当前流。
- **abort（tasks/mod.rs:930-961）**：CancellationToken 级联 → 优雅等 100ms → task.abort()；
  被 abort 的工具以 "aborted by user after Xs" 输出收尾；rollout flush 后才发 TurnAborted。
- **usage（protocol.rs:2216-2236）**：TokenUsage 单列 cached_input_tokens / cache_write /
  reasoning_output；每 response 落 RolloutItem::TokenUsageRecord。
- 并行工具：FuturesOrdered + 读写锁闸门（supports_parallel 读锁并发/写锁独占），
  单工具失败转 FunctionCallOutput 不炸 turn。

### 2. 上下文与压缩（context_manager/、compact.rs）
- **阈值（openai_models.rs:512-523）**：auto-compact = 窗口×90%（配置值 clamp 到 90%）；
  usable window = 窗口×95%。检查时机：pre-turn + 每步采样后（mid-turn）。
- **本地压缩重写（compact.rs:63、683-715）**：近期 user 消息预算 20,000 token（超出截断）+
  CompactionSummary 片段；assistant/tool/reasoning 全部丢弃。mid-turn 把初始上下文重插到
  最后一条真实 user 消息前。
- **摘要 prompt（prompts/templates/compact/prompt.md）**："CONTEXT CHECKPOINT COMPACTION…
  handoff summary for another LLM"，4 维度：进度与关键决策/重要上下文与约束与偏好/待办与
  下一步/继续所需的关键数据与引用。
- **超窗处置（compact.rs:317-332、mod.rs:4521-4527）**：压缩请求自身遇超窗 → 逐条删最旧
  item 重试；最终失败 set_total_tokens_full 填满整窗。
- token 计数 = 服务端精确值 + 「最后模型输出之后的本地新增项」按 4 bytes/token 估算
  （history.rs:707-729）。

### 3. 工具系统（tools/、unified_exec/）
- 每步重建 tool router；spec 手写 JSON schema；参数解析失败 → `RespondToModel` 单行文本
  回填（handlers/mod.rs:85-92）。
- **截断两层**：采集层 1MiB head+tail（512K+512K，中间插 "... N bytes omitted ..."）；
  模型层默认 Bytes(10,000) 保头保尾 + `Warning: truncated output (original token count: N)`
  前缀 + 总行数（output-truncation lib.rs:14-25）。
- 超时：one-shot exec 默认 10s（可按调用传 timeout_ms）；交互式 yield_time_ms 250-30s；
  MCP 默认 300s；**没有全局单工具超时**。
- **MCP 命名（mcp/mod.rs:544-560）**：非法字符→`_`，冲突加哈希后缀，≤128 字节——与本项目
  41 号 wire-name 两遍法同构（我们 ≤64+sha1，更强）。
- 审批：ToolOrchestrator 集中（approval→sandbox→attempt→沙箱拒绝升级重试）；审批等待 =
  turn 挂起（oneshot await）；拒绝文案规范化（"exec command rejected by user"）+900 token 截断。

### 4. 持久化 / 多代理 / 预算（rollout/、agent/、rollout_budget.rs）
- rollout = JSONL（`~/.codex/sessions/rollout-<ts>-<id>.jsonl`），12 类 RolloutItem；
  有界队列（256）+ 后台逐行写 + 关键点显式 flush barrier。
- resume = 反向扫描找最新存活 Compacted 检查点 + TurnContext，只正向重放存活后缀；
  ThreadRolledBack 标记在重放时应用（session/rollout_reconstruction.rs:133-319）。
- fork = 源 rollout 截断/中断快照后作为 InitialHistory::Forked 启动新线程；ForkPersistence
  支持 Copied/Referenced。
- 多代理两代（V1 namespaced/V2 平名）：spawn_agent/send_message/wait_agent…；**深度上限 1、
  V2 每 session 并发 4（子槽 3）**；子代理 = 完整独立线程（独立 rollout），fork_mode 决定
  继承父上下文多少；双向 InterAgentCommunication；V2 完成后 trigger_turn=false 回父邮箱。
- rollout_budget = 会话树共享加权 token 预算（不配置不启用），耗尽抛 SessionBudgetExceeded，
  阈值穿越注 developer 提醒；**不压缩历史**。

---

## 二、逐功能对标结论

我们领先/同构的部分（不动）：
| 能力 | 状态 |
|---|---|
| 压缩阈值 90%/95%、user 消息 20K 预算 | 与 codex 同构（12 号 R6 当年同源借用）|
| 孤儿 tool-call 修复 | 我们的哨兵带指引（"先核实实际状态再重做"），比 codex 的 "aborted" 信息量大 |
| 大结果同签名折叠 collapseSupersededToolResults | codex 无——我们独有 |
| 工具产物归档 + get_tool_result 分页回查（scope 钉扎）| codex 无——我们独有 |
| append-only 原始流水（39 号）+ fail-close | 等价于 rollout（形态不同：DB seq 行 vs JSONL）|
| 步级持久化 + 崩溃恢复续跑 | 等价 |
| wire-name 线上名映射（41 号）| 与 codex MCP sanitize 同构，防撞更强 |
| 审批 Amendment（24 号）、maxCalls、静态配置合并、审批超时 | codex 部分等价/我们更细 |
| maxSteps 护栏 | codex 无上限；我们保留（无人值守工作流场景更安全）|
| 无进展检测（stagnant nudge→终止）| codex 无 |
| zod 校验失败结构化回填（INVALID_ARGS + issues）| codex 是单行文本，我们结构化更好 |

缺口（本轮实施 O1-O8）：
| # | 缺口 | codex 证据 | 我们原状 |
|---|---|---|---|
| O1 | 模型流失败无重试 | responses_retry 5 次指数退避+Retry-After | ai@6 传输层 maxRetries=2 仅预流；中途断流整轮死 |
| O2 | 无流空闲超时 | SSE idle 300s | 挂流挂死整轮 |
| O3 | 超窗错误无处置 | ContextWindowExceeded→删最旧重试 | provider 400 直接整轮 error |
| O4 | usage 无缓存命中记账 | cached_input_tokens 单列 | 只有 prompt/completion |
| O5 | 摘要 prompt 笼统 | 交接式 4 维度+关键引用 | vendor 6 行"next agent turn" |
| O6 | 子代理无并发上限 | V2 每 session 并发 4 | 并行委派无界 |
| O7 | 超限结果无原始体量标注 | "original token count: N" | _oversize 无总量 |
| O8 | 无步间 steering | pending input drain | 整轮级 queue（轮边界才合流）|

登记不修（本轮明确不做，含理由）：
1. **并行工具读写锁闸门**（codex parallel.rs）：我们无独占型工具场景；ai@6 默认并行够用。
2. **会话 fork / rollout 引用**：无消费场景；业务权威历史形态（seededHistory）已覆盖。
3. **服务端压缩 compact_remote v1/v2**：依赖 OpenAI 后端私有端点，我们的 provider 无此能力。
4. **rollout_budget 会话树 token 预算**：工作流宿主已有净时长护栏 + maxSteps；按需再引入。
5. **模型能力表（/models 元数据、上下文窗口 introspection）**：宿主已显式配置窗口；
   provider-adapter 引入模型元数据时再接。
6. **无步数上限**：codex 依赖预算+压缩兜底；无人值守场景 maxSteps 更稳，保留。
7. **重试时已发 delta 无法撤回**（见 O1 已知限制）——流协议加 reply:reset 涉及全部宿主，
   留独立批次。
8. **无增量流 provider 的空闲超时误伤**：非流式回退的 provider 长生成 >300s 会被看门狗
   中止重放。此类 provider 需显式 `AGENT_STREAM_IDLE_TIMEOUT_MS=0`（装配层暂不自动识别）。

---

## 三、实施记录（O1-O8 全部落地）

### O1 模型流重试（loop.ts）
- 步级尝试循环：`runStepAttempt`（单次尝试）+ 失败分类 `classifyStepFailure`（纯函数导出）。
  可重试（无结构信息中断/408/409/429/5xx/空闲超时）→ `200ms×2^(n-1)×jitter` 封顶 8s 退避
  （`streamRetryBackoffMs`），整步重放；服务端 Retry-After 优先（P2-8）。
- 不可重试：宿主取消 / 其余 4xx（正文含超窗短语转 O3 路径）/ 超窗。
- 失败尝试的 stepMessages **不入历史不进流水**；仅重试耗尽时按旧语义留痕半截内容
  （⑪ 锚点保持）。副作用工具可能因重放重复执行——注释声明，由工具幂等纪律（12 号 §9）覆盖。
- 配置：deps.modelMaxRetries ?? `AGENT_STREAM_MAX_RETRIES`（夹 [0,10]，缺省 2）。
- 已知限制（review P1-3，登记 §二-7）：失败尝试已发 delta 无法撤回，UI 可见拼接。

### O2 步级流空闲超时（loop.ts）
- 每尝试一个 stepController + 看门狗（`armIdle` 任意流事件重置；缺省 300s；
  deps.streamIdleTimeoutMs ?? `AGENT_STREAM_IDLE_TIMEOUT_MS`，0=关）。
- abort 双保险：stepController.signal 传 streamText + **迭代器/提取 promise 全程
  raceAbort 竞速**——provider 流不感知 abort（假死 mock/管道）也有界结束。
- 空闲超时 = 可重试失败；宿主取消优先于一切（aborted 不重试）。

### O3 超窗紧急压缩（loop.ts + context-manager.ts）
- `LoopContextPort.forceCompact?`（可选方法，旧实现零破坏）：跳过水位/退避守卫直接跑
  压缩管线。ContextManager.maybeCompact 重构出共用 `compactPipeline`（Phase1 剪枝 +
  Phase2 守恒摘要 + degradeToMinimal 闭包），事件序列 start→(summary)→done 与旧版等价。
- loop 侧：错误命中 `CONTEXT_OVERFLOW_RE`（且实现支持）→ forceCompact → 成功则持久化
  摘要后重试本步一次（不占流重试预算）；零收益 → error 终止。
- 触发基准回归（review P1 修复）：maybeCompact 的摘要触发 = **剪枝后**工作集水位
  （predicate 注入管线），剪枝即可压回的场景不多付摘要调用。

### O4 usage.cachedInputTokens（types.ts + loop.ts）
- AgentLoopState.usage / AgentResult.usage 增可选 `cachedInputTokens`；initState 置 0；
  每步累计 `inputTokenDetails.cacheReadTokens ?? cachedInputTokens`。旧 state 无字段按 0。

### O5 摘要提示词升级（vendor/compaction.ts）
- DEFAULT_SUMMARY_PROMPT 改 codex「CONTEXT CHECKPOINT COMPACTION 交接」框架：
  5 维度（目标/进度与关键决策/重要上下文/下一步/关键引用 **verbatim**）+ 防编造纪律。
  单一事实源不变（host-kit/agent-service 同源引用）。

### O6 spawn_subagent 并发上限（subagent.ts）
- deps.maxConcurrent ?? `SUBAGENT_MAX_CONCURRENT=4`（codex V2 同款）。超限 fail-fast
  `SUBAGENT_LIMIT`（结构化 error/detail/hint）。
- **检查+自增同同步段**（对抗 review P0 修复）：自增在一切 await 之前，同 tick 竞发的
  并行委派无法全部穿过后自增；`runSpawn` 拆分主体，finally 归还计数。

### O7 超限结果标注原始体量（registry.ts）
- `_oversize` 增 `totalBytes`（按 **walk 前** raw 序列化计量——post-walk 值偏小会误导
  回查判断，review P2-2）；不可序列化形态省略该键。

### O8 步间 steering（shared/types + agent-service.ts + loop.ts）
- `SendMessageOptions.mode` 增 `'steer'`：忙碌时消息进 `entry.pendingInput`（上限
  `MAX_PENDING_INPUT=8`，超限 fail-fast），随当前轮返回同一结果对象。
- LoopRunnerDeps 增 `pendingInput.drain()` 端口：每步采样前（护栏后、压缩前）取走注入
  历史+流水（saveState meta.appended，诚实上报）。
- 防丢消息：轮收尾时注入未被消费 → **自动降级 queue** 重跑（includes 身份判定）；
  当前轮异常同样降级。resetSession 清空注入（复位语义优先，不降级）；dispose 清空。
- 空闲时 steer 等同普通发送；busy 但 currentTurn=null 的窗口落入 queue 分支（无害）。

---

## 四、验证

- **单测**：agent-runtime 18 个 spec 全绿（0 FAIL；含新增 11 个用例：重试成功/429 重试/
  400 不重试/重试耗尽/空闲超时收敛/空闲超时耗尽/超窗紧急压缩×2/cached 记账/pendingInput
  端口/分类与退避纯函数/退避中 abort/subagent 并发上限+同 tick 竞发/forceCompact×4/
  steer 主路径+空闲等同发送+上限+迟到降级）。测试进程退出段错误为存量环境问题（stash 基线同现）。
- **typecheck**：agent-runtime 与 shared/types/agent.types 零新增错误（全仓 525 条存量错
  误均在非本次改动文件，含并行会话未提交改动的漂移）。
- **ABI**：收尾已翻回 electron ABI（vitest 期间临时翻 node）。

## 三b、真模型质量实测（2026-09-11 补，qwen-flash 便宜档）

资产：scripts/p43-quality-probe.ts（场景 A 真 LoopRunner 端到端 / B 压缩摘要 A/B / C 压缩后追问）。

- **A 端到端 PASS**：真循环+真工具两步收敛，答案 3/3 事实正确（模型做格式归一化
  456200→45.62万、2026-11-05→2026年11月5日，语义无损）。
- **B 压缩 A/B 平局**：22,012 tok 长史各压一次，新 prompt 22012→6024 tok、旧 22012→6049 tok，
  事实保留同为 4/5（都把预算归一化成万元、把代号转写成中文名）。单样本 A/B 无统计力——
  O5 的价值是结构性的（交接框架/verbatim 纪律/防编造），本样本不劣化也不占优。
- **C 压缩后追问 PASS 5/5**：压缩后全部关键事实可答。两重保障起效：摘要保留 4 项 +
  **用户消息守恒预算原样保住了植入事实的首条 user 消息**（12 号 R6 设计价值实证）。
- 观察项（存量，非本次回归）：DashScope 流式未回传 usage（场景 A usage=0）——
  provider-adapter 未带 `stream_options.include_usage`，候选后续小修。

## 五、对抗 review（subagent）结论与处置

P0×1：O6 检查-自增间有 await，一步内并行委派全部穿闸——**已修**（同同步段 + 同 tick 竞发回归用例）。
P1×4：
1. maybeCompact 摘要触发基准从剪枝后漂移到剪枝前——**已修**（predicate 注入，剪枝后判定）。
2. 超窗正则先于状态码判定，429 限流文案含 "too many tokens" 会被误判超窗——**已修**
   （状态码判定提前；非可重试 4xx 正文再查超窗短语，400 型超窗语义不回退）。
3. 重试时已发 delta 无法撤回，UI 拼接脏文本——**登记不修**（流协议 reply:reset，独立批次）。
4. 无增量流 provider 会被 300s 空闲看门狗误伤——**登记不修**（env=0 显式关闭；装配层自动
   识别留待 provider 元数据接入）。
P2×8：死代码摘除行（已删）/ totalBytes 按 raw 计量（已改）/ dispose 清 pendingInput（已改）/
Retry-After（已实现）/ steer 满员错误复用 AgentBusyError、重试浪费 token 计账、steer 三条
降级路径测试（迟到降级已补）、429 头解析（已实现）——其余随批次登记。

## 六、遗留与衔接

- 工作区另有并行会话未提交改动（lw-event/lw-graph/longwriting/bible 等文件）——与本次
  改动零交集，提交时须分开。
- 质量探针资产 scripts/p43-quality-probe.ts（可复跑；`P4_API_KEY=<key> npx tsx scripts/p43-quality-probe.ts`）。
- 本轮未提交（用户未要求 commit）；建议提交信息：
  `feat(agent-runtime): 43号 codex 对标优化——流重试/空闲超时/超窗紧急压缩/steer/子代理并发上限`
