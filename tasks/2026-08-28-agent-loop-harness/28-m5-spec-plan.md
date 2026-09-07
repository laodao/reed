# 28 · M5 规格与实施计划（系统级 Agent · 聊天宿主）

> 状态：执行中（2026-09-06）
> 上游：01 号 §9（宿主体系）、12 号 §5（AgentHost）、18 号（业务包）、23 号（契约）；
> 用户期望（2026-09-06 拍板）：①系统 agent 入口先行 ②入口融入现有聊天。
> 节奏：同 M2-M4——实现 → 单测 → subagent 对抗 review → 修复 → 文档同步。

## 0. 一句话定位

给 harness 装上"对话皮层"：聊天对话框可开 **Agent 模式**，消息不再走单趟 chatStream，
而是驱动 LoopRunner（系统级工具集：能力目录 / 运行工作流 / 调用技能 / 创建任务树 /
直连只读工具），让"用户说需求 → agent 识别能力 → 直接执行或追问澄清"成立。

**架构红线**：系统 agent 不是第四个野生 agent——它 = LoopRunner + 系统工具集 +
ChatAgentHost（宿主）。与工作流 agent-loop 节点、任务树执行器同一运行时、同一
AgentToolRegistry、同一轨迹/审计面。harness 不 import chat；宿主胶水住在 chat 包。

## 1. 范围与批次

| 批 | 内容 |
|----|------|
| 批1 | 系统工具集：discover_capabilities / run_workflow / get_workflow_run / invoke_skill / create_task_plan，registry 注册（workflow-boot 装配点） |
| 批2 | dialogs.agent_enabled 迁移（双端）+ ChatService 分流 + ChatAgentHost（会话持久化/流映射/轨迹） |
| 批3 | 前端：对话框 Agent 模式开关 + 消息流工具 chips + 引用卡片（工作流运行/任务树） |
| 批4 | 单测（fake LLM 走真实 streamText）+ 真模型 E2E（直连工具/工作流/技能/任务树/多轮澄清 5 场景） |
| 批5 | 对抗 review（逻辑正确性 / 接线租户安全两路）→ 修复 → 文档同步 |

## 2. 工具集（批1）

注册点：`workflow-boot` M5 块（新增 `registerSystemAgentTools(deps)`，实现住在
`platform/workflow/tools/system-agent-tools.ts`——与 builtin/node/custom 工具同层）。
boot 顺序事实：包激活早于 workflow 子系统初始化（electron/index.ts），故注册必须在
workflow-boot（组合根已持有 runService/definitionService/agentTasks/skillService/
providerAdapter），不能放 chat 包 activate。

| 工具 | danger | 语义 |
|------|--------|------|
| `discover_capabilities` | read | 能力目录：工作流（id/名称/描述/start 节点 inputs schema）、技能（id/名称/inputs）、registry 工具名片（仅白名单交集，不兜售调不动的工具）、任务树能力说明。条数封顶 20/20/20（与 registry 管线 TOOL_RESULT_ARRAY_KEEP 对齐，超出由管线注记 `_truncated`）+ 总数注记，防上下文爆炸 |
| `run_workflow` | write | startRun（手动触发、publishedGraph 优先、无发布版落草稿图执行——与手动触发语义一致）→ 轮询 getRunDetail 至终态（2s 间隔；`RUN_WORKFLOW_WAIT_TIMEOUT_MS=180s` 超时返回 runId+running 让 agent 告知用户稍后查询；连续 3 次运行不可见 → 结构化失败）。终态非 succeeded → throw 携带节点摘要（2KB 截断）。`waiting_review` 原样返回（工作流内部审批闸门照常生效） |
| `get_workflow_run` | read | runId → 状态/节点摘要/错误 |
| `invoke_skill` | read | resolveSkill → 渲染 {{param}} → generateText（走 harness resolveModel）→ 返回内容。模板渲染抽到 skills/render.ts 供 skill-call 节点与本工具共用（组件共用原则） |
| `create_task_plan` | write | agentTasks.createPlan(goal) → 返回 rootId + **status=pending_review + 明确 hint：需用户在 Agent 任务树页批准**。人工批准闸门不豁免（宁可慢不可脏） |

**直连白名单**（复用 registry 既有工具，聊天宿主直接装配）：`web_search`、
`wf_web_extract`、`http_get`、`data_table_query`。
**排除**：http_post / code_run / data_table_write（requiresApproval 或写库——聊天宿主
M5 不实现审批卡，见 §7 裁剪）。

**每轮引用收集（refs）**：系统工具执行时经 turn-ALS（`runWithSystemAgentTurn`）把
`{kind:'workflow_run'|'task_tree'|'skill', id, label}` 推入本轮 refs；工具返回体不解析
（loop 只回传 {ok}），前端卡片数据源 = refs + 流事件。

## 3. 数据模型（批2）

```
dialogs 加列 agent_enabled INTEGER/BOOLEAN DEFAULT false（双端迁移 add-dialog-agent-enabled）
Dialog / CreateDialogRequest / UpdateDialogRequest 同步 +agentEnabled
```

消息面不加表：用户消息 + 助手最终回复照旧落 messages 表（UI 数据源不变）；
agent 的工作记忆（含工具调用中间态 ModelMessage[]）落 agent_sessions
（DbAgentSessionStore，scopeKey=`dialog:<id>`，与任务执行器同一存储）；
轨迹落 agent_trajectories（TrajectorySink scope='session' scopeKey=`dialog:<id>`）；
工具审计走既有 audit sink（logContext 带 dialogId）。

## 4. 宿主（批2）

`src/core/packs/chat/services/system-agent/system-agent.service.ts`：

- **分流**：ChatService.sendMessage 读 dialog.agentEnabled → 委派 SystemAgentService
  （原单趟链路零改动）。
- **AgentTask**：definitionId=`system-chat-agent`，scopeId=`dialog:<id>`，
  maxSteps=12，modelPreference 用请求的 effectiveModelId/providerConfigId
  （用户在聊天页选的模型即 agent 模型——与普通对话同一控制面）。
- **多轮**：loadState 返回持久化 state 并追加本轮用户消息（首轮返回 null 由
  initState 播种）；saveState = session store 落库 + sink.flush。
- **流映射**：emitStream → chat:stream 新事件型 `tool-start`/`tool-end`
  （带 toolName/toolCallId/ok/args 摘要）；文本 delta 原样透传（中间步思考文本
  与最终回答同流累积，步间以空行分隔——所见即所得）。
- **终止语义**：result.output = 本轮最终回复（含 stopReason！max_steps/stagnant/error
  时如实附注，不伪装成正常回答）；abort 复用 chat:stop 既有 AbortController
  （activeStreams 按 dialogId）。
- **suspend**：reject（白名单无审批工具，任务执行器同款先例）。

系统提示词（路由纪律）：简单问题直答；外部信息→直连工具；匹配既有工作流/技能→
先 discover 再执行；复杂多步目标→create_task_plan 并告知批准入口；需求不清→
自然语言一次问全关键缺失项（无步骤表单）；执行后引用产出汇报。

## 5. 前端（批3）

- 对话头部开关「Agent 模式」（dialog 级，updateDialog 持久化）。
- StreamEvent 扩型：`tool-start`/`tool-end`；MessageItem 流式渲染工具 chips
  （名字+ok 终态）。
- `MessageMetadata.agent = { toolCalls:[{name,argsDigest,ok,toolCallId}], refs:[{kind,id,label}] }`
  落库（历史消息重渲染；tool-start 落 `ok:undefined`=执行中渲染 loading，tool-end 翻正）；
  引用卡片：workflow_run → `/workflow/run/:runId`、task_tree → `/agent-tasks?focus=<rootId>`
  （页内 watch query 支持停留时跳转）、skill → 文本徽标。

## 6. 测试与验收（批4）

- 单测：工具集（fake runService/tasks/skills——目录封顶/轮询超时/waiting_review/
  refs 收集）、宿主（多轮 loadState 追加/流映射/终止语义/abort）、迁移、分流。
- 真模型 E2E（scripts/p6-system-agent-e2e.ts，DashScope）：
  1. 直连工具：要求联网查证 → web_search 被调用且回答含来源；
  2. 工作流：预置单节点工作流 → 「运行 X 工作流」→ run_workflow 终态 succeeded；
  3. 技能：内置短视频脚本技能 → invoke_skill 产出脚本；
  4. 任务树：复杂调研目标 → create_task_plan → root=pending_review；
  5. 澄清：信息不足的需求 → 不调写工具、反问澄清。

## 7. 显式裁剪（登记）

- 聊天内审批卡（suspend→前端卡片）：后置。当前安全边界=白名单只含免批准工具，
  写副作用只有 run_workflow/create_task_plan（后者强制人工批准）。
- 飞轮装配/蒸馏对聊天宿主：后置（任务树链路已通）。
- 轨迹抽屉 UI 挂到聊天：后置（数据已落 agent_trajectories）。
- Agent 模式多模态附件：后置（当前显式报错拒绝——静默丢弃=盲聊，宁可不收）。
- Web 端长事务：`POST /api/ipc/chat:send` 同步等整轮（最长 210s），中间层超时
  风险自担；页面刷新丢流但服务端跑完落库。任务化改造后置。
- 会话存储全量重写（O(n²) 行写）：随 DbAgentSessionStore 既有形态，挂账。
- NL→工作流 DSL 生成（M7+）、业务模块 agent 迁移（M6，G1-G5 独立立项）。

---

## 8. 实施结果（2026-09-07）

五批全部落地。提交：M5 主体一个 commit（工具集/迁移/宿主/前端/E2E/文档同交）。

### 8.1 对抗 review（两路：逻辑正确性 / 接线租户安全）

P0×0 / P1×3（其一存疑）/ P2×11 / P3×16，P0/P1/P2 全修，P3 修低成本项：

**P1**：同对话交叠双轮（session last-writer-wins 丢整轮记忆 + controller 互踩 stop 失效）
→ 入口互斥拒绝 + finally 身份校验删除；模型流失败残留悬空 tool-call（聊天多轮长命
会话被永久打死，任务宿主有 ContextManager 哨兵修复而聊天宿主没有）→ `sanitizeSessionHistory`
读时清洗（丢无配对 tool-call 段 + 合并连续 user 兼顾 Anthropic 交替约束）+ 单测钉回归；
附件静默丢弃（=盲聊）→ 显式报错拒绝。

**P2 重点**：sleep abort 监听器泄漏（180s 轮询堆 ~90 个）；流式 chips ok 语义
（tool-start 曾写 false 显示红叉，改 undefined=loading）；metadata 落库缺
argsDigest/toolCallId（违反 §5）；catch/error 分支丢 metadata 与空气泡；多步文本
步间无分隔（宿主按事件边界补 `\n\n`）；run_workflow 失败 throw 无截断（2KB digest）；
invoke_skill 模型不一致（turnModel 经 runtimeContext 下传）+ 不可中止 + 无产出上限
（abortSignal + maxOutputTokens=4096）；迁移/分流零单测（补 dialog-agent-enabled.spec）；
`.env` 未 gitignore（补 .env/.history/C:/ 三条——git add -A 前科）。

**P3 已修**：discover 目录只列白名单交集；workflow-boot 注册块显式 providerAdapter
guard + 技能服务失败仅降级 invoke_skill；waitForRunTerminal 连续 3 次不可见即败；
AgentTasksView watch query.focus（页内跳转）；分流 return 未 await + Agent 开关双
toast；spec 漂移同步（封顶 20/20/20、?focus=、落草稿图语义注记）。
**P3 登记未修**：错误轮 [user,user] 对 Anthropic 严格交替（sanitize 已合并连续 user
兜住大半）；waitForRunTerminal 取消/超时无结构化标志（note 文案足够）；webSearch 等
请求参数在 Agent 模式被忽略无提示；长事务 Web 语义（见 §7）。

### 8.2 验收

- 单测：system-agent-tools 17 例 + system-agent-service 14 例 + dialog-agent-enabled
  4 例（PG 用例因环境 auth 失败，与全量基线同构）；harness 相关 222 例全绿；
  全量失败集与基线零差异。
- 真模型 E2E（scripts/p6-system-agent-e2e.ts，DashScope qwen-flash）六场景全过：
  A http_get 查证回答案；B 目录→run_workflow→终态汇报+引用；C invoke_skill 参数渲染
  真生成；D create_task_plan 待批准+告知入口；E 信息不足反问（零写工具调用）；
  F 跨轮会话记忆（暗号问答）。
- tsc：新增文件错误清零（存量债务基线不变）。
