# 29 · M5.5 规格与实施计划（Agent 工作台 + 运行生命周期）

> 状态：执行中（2026-09-07）
> 上游：28 号 M5（聊天宿主）§7 裁剪项升级立项；10-event-system；16 号任务树。
> 用户决策（2026-09-07）：①应用内工作台页（非独立 OS 窗口）②工作台 + 生命周期全修。
> 节奏：同 M2-M5——实现 → 单测 → subagent 对抗 review → 修复 → 文档同步。

## 0. 问题定义（28 号验证后的四个缺口）

1. **过程不可见**：聊天 agent 的轨迹已落 agent_trajectories（scopeKey=`dialog:<id>`），
   但聊天页只渲染"一条消息+chips"，迭代步/工具入参结果全文/token 无展示面。
2. **运行无登记**：在途 agent run 只存在于调用栈，页面重开无法得知"有东西在跑"、
   无法 attach 实时流（只能等 done 触发 loadMessages）。
3. **进程生命周期**：单窗口应用，Linux/Windows 关窗 = app.quit()，主进程一切在途
   工作全死（聊天 agent/任务树/在途工作流通杀），无托盘缓冲。
4. **崩溃对账缺失**：agent_tasks 的 running 行在崩溃后永久 running（登记过的遗留），
   重启后既不重置也不重调度。

## 1. 范围与批次

| 批 | 内容 |
|----|------|
| 批1 | AgentRunRegistry（harness 运行登记，userId 归属 + 变更广播钩子）+ TrajectorySink `onEntry` 回调（轨迹边写边推）+ AgentTaskService.recoverInterrupted()（启动对账 running→ready + 重调度）+ 单测 |
| 批2 | `ac:*` IPC（list-sessions / get-trajectory）+ 广播通道 `ac:trajectory` / `ac:run-update` + preload/web 双端接线 + AgentSessionRepository.listSessions() |
| 批3 | 托盘最小化（关窗→隐藏，托盘菜单 显示/退出）+ 两端 boot 接线对账 |
| 批4 | 前端 `/agent-console` 工作台页（会话列表+过程时间线+运行徽标）+ 聊天消息「查看过程」深链 + 路由/菜单注册 |
| 批5 | 单测/E2E + 两路对抗 review → 修复 → 文档同步 → 提交 + 真机验证 |

## 2. 运行注册表（批1，`agent-runtime/runtime/run-registry.ts`）

- harness 级通用设施（宿主们登记，harness 不认识具体业务）。内存 Map + 变更回调：
  - `register({ id, definitionId, scopeKey, label, userId })`（userId 取注册时 ALS——
    工作台列表按调用者租户过滤）
  - `finish(id, { status: 'done'|'error'|'aborted', error? })`
  - `listRunning(userId?)` / `get(scopeKey)`
- 变更即广播：workflow-boot 装配时注入 `onChange` → `getEventEmitter().emit('ac:run-update', …)`
  （平台广播通道，工作台实时刷新徽标；harness 本体不知道广播通道存在——依赖倒置）。
- 登记点：聊天宿主 sendMessage（scopeKey=`dialog:<id>`）；任务执行器 runAgentLoop
  （workflow-boot 装配处，scopeKey=`task:<id>`——任务树执行也进工作台可见）。

## 3. 轨迹推流（批1）

`TrajectorySink` opts 增加可选 `onEntry(scopeKey, entry)`：append 时同步回调（fire-
and-forget，异常只 warn 不入缓冲）。宿主装配时注入 → `ac:trajectory` 广播
（payload 含 scopeKey + 完整 TrajectoryEntry）。聊天宿主与任务执行器宿主同款注入——
两类会话的过程实时性一次到位。落库语义不变（屏障/串行链不动）。

## 4. 崩溃对账（批1）

`AgentTaskService.recoverInterrupted()`：`running → ready`（raw 跨租户——启动时无
用户上下文；patchFromStatus CAS 防与在途写竞态），对每个受影响 rootId fire-and-forget
`schedule()`（串行泵重跑；任务执行有会话续写 + retry 语义，幂等可接受）。
verifying/escalated/failed 等不动。接线：workflow-boot M3 装配完成后调用（双端同构）。
聊天会话无需对账（sanitizeSessionHistory 读时清洗已兜）。

## 5. IPC 与广播（批2）

| 通道 | 语义 |
|------|------|
| `ac:list-sessions` | 会话列表：agent_sessions distinct conversation_id + 最近 updated_at + 运行中徽标（registry）。conversationId 两族：`system-chat-agent:dialog:<id>`（聊天，refId=dialogId）/ `task:<taskId>`（任务树，refId=taskId）|
| `ac:get-trajectory` | scopeKey → 轨迹行（listByScope，seq 升序，scoped） |
| `ac:trajectory`（广播） | {scopeKey, entry}——宿主 onEntry 注入 |
| `ac:run-update`（广播） | {scopeKey, status}——registry onChange 注入 |

preload 暴露 `agentConsole.{listSessions,getTrajectory,onTrajectory,onRunUpdate}`；
web channel-map 补两条请求映射 + 两条事件映射（legacyEventArg 同 chat.onStream）。

## 6. 托盘最小化（批3，electron main）

- `close` 事件拦截：非 quitting 时 preventDefault + win.hide()（关闭=隐藏到托盘）。
- Tray + Menu：显示主窗口 / 退出（置 isQuitting → 真退出，before-quit 清理照旧）。
- 图标：`resources/tray.png`（由 icon.svg 经 ImageMagick 一次性生成入库）。
- macOS 保持现状（darwin 本就不 quit）。

## 7. 工作台页（批4，`/agent-console`，workflow 包注册）

- **左栏会话列表**：类型徽标（聊天/任务）、最近活动时间、运行中绿点（ac:run-update
  实时刷新）、支持 `?session=<scopeKey>` 深链直选。
- **右侧过程时间线**（get-trajectory 回放 + ac:trajectory 实时追加，按 scopeKey 过滤）：
  - iteration 分组卡片；decision（thought/finishReason/toolCalls 名单）、
    tool_call+tool_result（toolCallId 配对，入参/结果 JSON 折叠展开）、
    guardrail_stop（红）、final（答案全文）、memory_assembly（记忆引用）。
  - 顶栏：会话标题 + 运行中 badge + 跳转（聊天对话 / 任务树 ?focus=）。
- **聊天深链**：MessageItem agent 区加「查看过程」→ `/agent-console?session=dialog:<dialogId>`。

## 8. 测试与验收

- 单测：RunRegistry（登记/完成/租户过滤/onChange）、Sink onEntry（不破坏屏障语义）、
  recoverInterrupted（running→ready + verifying 不动 + 重调度触发）、listSessions。
- E2E/真机：发起聊天 agent 轮次 → 工作台实时看到轨迹追加；关窗→托盘→重开→
  attach 回放；杀进程→重启→任务 running 行被对账重跑。
- 两路对抗 review（逻辑正确性 / 接线租户安全）照旧。

## 9. 显式裁剪

- 工作台不做"从工作台发消息"（发起仍在聊天/任务树；工作台只读+观测）。
- 独立 OS 窗口：后置可选（用户已裁）。
- Web 端托盘：N/A（托盘仅 Electron）；Web 端对账/工作台页同构生效。
- 轨迹回放的分页：单会话全量拉取（轨迹量级可控，分页后置）。

---

## 10. 实施结果（2026-09-07）

五批全部落地，提交一个 commit。

### 10.1 对抗 review（两路：逻辑正确性 / 接线租户安全）

P0×3 / P1×7 / P2×8 / P3×14，P0/P1 全修、P2 全修或登记，P3 修低成本项：

**P0**：
- 工作台「停止」任务树语义反转（叶子级 abort 被当普通失败 → 重试→重规划，用户每按
  一次停止树长一层且白烧规划 LLM）→ 三处修：`runAgentLoop` 端口贯通 rootId、
  `runOne` catch 先判中止（cancelControllers aborted → 任务 cancelled，不 retry 不
  重规划）、`ac:stop` 对 task 会话路由 `cancelTree(rootId)`（registry.metadata.rootId）
- 打包版托盘必失败 → 无窗无托盘僵尸进程（extraResources 缺 tray.png +
  window-all-closed 兜底被删）→ extraResources 补 tray.png、打包/开发双路径解析、
  window-all-closed 恢复 `tray===null && 非 darwin → app.quit()` 兜底
- Web 端 ac:* 五条接线全失效（channel 键缺 `workflow.` 前缀、wrap 双包、
  legacyEventArg 标反）→ 键名全路径、wrap 透传、事件映射去标

**P1**：外层 signal 已 aborted 时内层桥接静默失效（补立即同步检查）；广播轨迹无
seq（共享类型 seq 可空 + 视图 key/排序容错）；Web 多租户对账无 ALS（recoverInterrupted
按行属主 runWithUserAsync 重放——AgentTaskRow 补 userId 映射）；ac:stop 零租户校验
（abortByScope 加 userId 比对，task 路径 cancelTree 天然 scoped）；任务会话 refId 用
叶子 id（label/rootId 经 agentTasks.getById 反查）；select 慢回放竞态（reqId 守卫）；
will-quit db close 无超时（3s race）。

**P2/P3 已修**：human_rejected 归 done；macOS 不拦截 close + activate 补 show；
started 事件刷新会话列表；深链 watch（页内二次跳转）+ 未命中提示；stop 失败误报；
runId 随机尾；memory_assembly 广播先于 register 的乱序；dbClosed 声明位置；过时注释。
**登记未修**：execute 异常 retry 语义的既有缺陷由 retryOrFail CAS 补 running 顺手
治愈；listSessions label N+1（会话量级小）；纯文本回答无过程入口（无工具轮无必要）；
abort 中途落点 error/aborted 存疑（依赖 ai@6 行为）；对账不跳过 root 已终态的树
（构造窗口存疑）；工作台不做发起（§9）。

### 10.2 验收

- 单测：run-visibility 6 例（registry/abort 租户/onEntry/对账）+ session-sessions 2 例
  + 既有 harness 全量 231 例全绿；全量失败集=环境性基线零差异。
- 真机验收（CDP）：聊天发起 agent 轮次 → 工作台会话列表出现会话、时间线实时追加
  decision/tool_call/tool_result/final；任务树执行同样可见；「停止」对话轮即时中断；
  关窗 → 托盘存活 → 重开 → 回放完整轨迹；杀进程重启 → 任务 running 行被对账重置重跑。

### 10.3 对话页重构（用户澄清后，2026-09-08，049ce685 + 后续）

用户对照 deepseek-harness 截图提出三点：①对话框要显示完整执行过程（非只显最终结果）；
②不得照搬 AI 对话的 MessageItem 渲染；③右侧不放执行过程，改为会话上下文/记忆/子任务/
工作流。落地：

- **中栏活动流**：轨迹按 `turn_start` 标记切段（iteration 每轮从 0 重来不可作边界；
  聊天宿主每轮起点写入标记），与用户消息按 createdAt 交织。段内：decision 的 thought
  = 步内叙述 → 全显（超 340px 折叠展开）；tool_call/tool_result 按 toolCallId 配对 →
  ZCode 式一行卡片（⏺/✗/⟳ 状态 + 参数摘要 + 耗时，点击展开入参/返回 JSON）；
  guardrail_stop → 系统提示条；memory_assembly → 淡标注。TRALLENGE：thought 轨迹上限
  500→4000 字符（叙述即输出，前端折叠承担展示）。
- **右栏上下文检查器**：会话上下文（模型/轮次/执行步骤/Tokens 求和）、记忆（装配引用
  + 知识飞轮入口）、子任务规划（refs→任务树迷你状态树）、工作流（refs→运行状态标签）、
  技能（refs 清单）。
- **弃用 MessageItem**：本页自建活动流渲染；工具展示名抽 `utils/agent-tool-labels.ts`
  共用。旧格式会话（无 turn_start）回退纯消息渲染。
- 修复：`api()` 返回 workflow 命名空间后调用点未加 `agentConsole.` 前缀（页面全空）、
  TimelineItem `kind`/模板 `type` 字段错位（用户气泡不渲染）、新建会话零消息选不中
  （合成会话项）。
- 真机验收：用户气泡 + 叙述/工具交织 + 右栏五区块全部渲染正常（截图核验）。
