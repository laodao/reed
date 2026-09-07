# 25 · M2 规格与实施计划（工具生态与观测）

> 状态：执行中（2026-09-06）
> 上游：01 号 §4/§9、02 号 §M2、12 号 §5（AgentHost）、14 号（工具注册表）、23 号（契约）
> 节奏：实现 → 单测（mock LLM 走真实 streamText 路径）→ subagent 对抗 review → 修复 → 文档同步（02/23 号）

## 0. 范围总览与决策

M1.5（agent_trajectories 落表）并入本期批 1——轨迹视图（02 号 M2.3）以落库为前置，单独成期无意义。

| 批 | 内容 | 对应 02 号条目 |
|----|------|----------------|
| 批1 | agent_trajectories 表 + 宿主落库 + agent_tool_calls 审计表 + run 级 token 聚合 | M1.5 + M2.5 + 13 号审计表 |
| 批2 | 轨迹查询 IPC/REST + 轨迹视图 UI + token 汇总展示 | M2.3 + M2.5 |
| 批3 | 写类工具（http_post/data_table_write）+ 节点即工具 + ToolService 桥 + binding 富配置 + oas $ref V2 | M2.1 + M2.4 + 14 号遗留 |
| 批4 | provider 第二批（Anthropic/Google）+ 模型能力提示 | M2.2 |

**显式裁剪**（后续批次，不在 M2 验收内）：
- prompt-based JSON 降级协议（13 号 §降级）——ai@6 三家原生 SDK 已覆盖主流；降级协议独立立项。
- 工具结果落盘引用化（resultRef）——维持内存截断；轨迹表落库后超长结果可查原始日志，引用化待真实需求。
- 模型能力检测 IPC（model-detector 接 UI）——本期仅编辑器静态提示文案。
- §6.5 模型错误重试退避——挂立项遗留。

## 1. 批1 · 观测地基

### 1.1 agent_trajectories 表（双端迁移成对）

```
agent_trajectories
  id TEXT PK                     -- 确定性幂等：tr_<scopeKey>_<seq>
  owner_id varchar NOT NULL      -- 多租户（ALS 注入）
  scope varchar NOT NULL         -- 'workflow' | 'session'
  scope_key varchar NOT NULL     -- workflow: <runId>:<nodeId>:<iterationIndex>；session: <definitionId>:<scopeId>
  seq INTEGER NOT NULL           -- scope 内单调递增（同 loop 的 entry 序）
  iteration INTEGER NOT NULL     -- 循环轮次
  kind varchar NOT NULL          -- decision/tool_call/tool_result/human_request/human_decision/guardrail_stop/final
  name varchar                   -- 工具名/事件名
  payload_json TEXT              -- TrajectoryEntry.payload（截断序列化，上限 16KB）
  prompt_tokens INTEGER, completion_tokens INTEGER
  duration_ms INTEGER
  created_at
  UNIQUE(scope_key, seq)         -- 幂等重放/续跑不重不漏
```

- 迁移文件 `create-agent-trajectories.ts`，双端注册（electron/database/index.ts + web/server/index.ts）。
- TrajectoryEntry（types.ts:177）原样为行内容契约，payload JSON 截断复用 registry 的字节截断常量形态（自含实现，不引 registry——依赖方向：repository 不依赖 agent-runtime）。

### 1.2 TrajectorySink（落库写入器）

`agent-runtime/trajectory/sink.ts`：`TrajectorySink { append(entry): void; flush(): Promise<void> }`
- 内存缓冲 + `flush()` 批量 `insertOrIgnore`（fire-and-forget 语义保留：append 永不 throw；flush 错误结构化日志不外泄）。
- 宿主接线：
  - **workflow 宿主**（agent-loop-node 适配层）：emitTrajectory → sink.append；flush 点 = 每次 step-end saveState（搭车 await，崩溃至多丢最后一步）+ 挂起前 + 节点终态。scope_key 用 runId:nodeId:iterationIndex。
  - **session 宿主**（agent-service IndependentHost）：emitTrajectory → 同一 sink；flush 点 = turn 边界 + suspend 前。scope_key 用 definitionId:scopeId。
- sink 所有权：每节点/每会话实例各自持有（无跨 run 共享状态）。

### 1.3 agent_tool_calls 审计表

```
agent_tool_calls
  id TEXT PK（随机）, owner_id, run_id TEXT, node_id TEXT,
  session_key TEXT,               -- 会话直调场景
  tool_name, danger_level, approval, status, error_code,
  args_preview TEXT（≤500 字符）, result_preview TEXT（≤500）, truncated INTEGER,
  duration_ms INTEGER, context_json TEXT, created_at
```
- workflow-boot 装配 registry 时注入 `audit` sink → 异步单条 insert（fire-and-forget，异常 warn）。args/result preview 已在 registry 审计面截断（500 字符），直接落库。

### 1.4 run 级 token 聚合（无表变更）

- `getRunDetail` 服务端汇总 nodeRuns 的 `output_json.usage`（agent-loop/llm-chat/skill-call 同构字段）：`tokenUsage: { promptTokens, completionTokens, toolCalls, byNode: {nodeId: …} }` 挂进 run detail DTO。

## 2. 批2 · 轨迹视图与 token 观测（UI）

- 查询链：`wf:get-node-trajectories {runId, nodeId, iterationIndex?}` → 按 seq 升序 entries；Web 端 `GET /api/workflow/run/:runId/trajectories?nodeId=&iterationIndex=`。preload/channel-map 成对接线。
- `AgentTrajectoryDrawer.vue`（components/workflow/）：按轮分组时间线（decision=thought+toolCalls 列表 / tool_call / tool_result(ok·err) / human_request·decision / guardrail_stop / final），头部 token 汇总（输入/输出/工具调用数）。
- `WorkflowRunDetail.vue`：agent-loop 行操作区加「轨迹」按钮开抽屉；页头 run 级 token 芯片。
- 契约落 23 号 §新增。

## 3. 批3 · 工具生态

### 3.1 写类内置工具
- `http_post`：dangerLevel `external-post`（默认需批准），executeHttpFetch(method=POST, body/contentType)，SSRF 闸门沿用。
- `data_table_write`：dangerLevel `write` + `requiresApproval: true`（write 不在默认危险级集合，显式声明；binding.approval='never' 可经编辑器二次确认放宽），VariableDataService.insertRow（单行）。

### 3.2 节点即工具（首批 ≥6 个）
- `workflow/tools/node-tool-adapter.ts`：`NODE_TOOL_EXPORTS: Array<{ nodeType, toolName, description, dangerLevel, requiresApproval?, inputSchema(zod), execute }>` ——执行器直调节点 handler 同款底层函数（路线 A 延续：不伪造 WorkflowNodeContext；行为一致性由"同一执行器函数"保证）。工具名 `wf_` 前缀 + 下划线化，避让 builtin 同名（web_search 等）。
- 首批：web-extract、translate、kb-retrieve、kb-qa、template-transform、parameter-extractor（读/文本类，autoApprovable）；image-gen（write + 需批准）作写类代表。
- workflow-boot 装配注册（source='node'），`wf:list-agent-tools` 自动可见。

### 3.3 ToolService 自定义工具桥
- `workflow/tools/custom-tool-adapter.ts`：custom_tools（HTTP 类）→ AgentToolDef：paramsSchema 字段卡数组 → zod（string/number/boolean/enum(options)），executor = `getToolService().executeTool`（凭据注入在执行层，LLM 永不见明文）；CLI 工具 isElectronRuntime 门禁（exec 级）；email 工具 external-post 级。
- 装配时机：workflow-boot 拉取 custom tool 列表注册（source='tool'）；工具 CRUD 变更后下次 run 装配生效（buildToolDefs 快照纪律，不热更）。

### 3.4 binding 富配置
- `toolWhitelist` 类型放宽：`(string | AgentToolBinding)[]`；agent-loop-node 配置解析归一化 string→{tool}（向后兼容存量图）。
- NodeConfigPanel：agentTools 从多选标签升级为绑定列表（工具/批准策略 select/maxCalls 数字/静态 config JSON 文本域），服务端 requiresApproval 展示保留。
- forms 定义同步（agentTools 字段结构变更注记 23 号）。

### 3.5 oas-parser V2（$ref）
- openapi-parser 支持 `#/components/schemas/...` 内部 $ref 解析（循环引用检测，深度上限），替换 161 行的整体拒绝；嵌套 schema 递归 lowering 沿既有简化器。

## 4. 批4 · provider 第二批

- 依赖：`@ai-sdk/anthropic`、`@ai-sdk/google`（ESM-only，动态 import 同纪律）。
- provider-adapter.createModel 按 `template.category` 分派：`anthropic` → createAnthropic({apiKey, baseURL})；`google` → createGoogleGenerativeAI({apiKey, baseURL?})；其余（openai-compatible/custom）→ createOpenAICompatible。缓存键不变（configId:modelId 已含提供商维度）。
- NodeConfigPanel agent-loop 表单加静态提示：建议选用原生 tool-calling 模型（不改检测链路）。
- **验证边界（诚实注记）**：本环境仅 DashScope（openai-compatible）真机 key；Anthropic/Google 以 mock 契约单测（工厂分派/参数透传/usage 归一）验收，真机成功率对比遗留后续。

## 5. 测试计划

- 迁移/仓储：真实 better-sqlite3 跑 agent_trajectories（幂等主键/索引/租户 scope）、agent_tool_calls。
- sink：flush 搭车 saveState 的时序（含 saveState 抛错不丢已 append）、幂等重放、截断。
- agent-loop-node：轨迹落库接线（fake host 断言 append/flush 次数与 scope_key 形态）。
- 写类工具：zod 派生 schema、审批默认、执行链（mock fetch/VariableDataService）。
- node-tool-adapter / custom-tool-adapter：schema 派生、CLI 门禁、凭据不可见。
- binding 归一化：string 旧配置 / binding 新配置 / 混合数组。
- oas-parser：$ref 展开用例（含循环引用拒判）。
- provider-adapter：category 分派（mock 动态 import）。
- UI：PC 端启动 + 截图验证（轨迹抽屉/token 芯片/binding 编辑）。

## 6. 验收标准（对照 02 号 M2）

1. 真实 run 的轨迹落库；重启后运行详情页可完整复盘逐轮时间线与 token 汇总（轨迹视图可完整复盘一轮真实运行）。
2. http_post / data_table_write / image-gen 默认需人工批准，批准链路同 scope 单卡不回归。
3. ≥6 个节点能力 + 自定义 HTTP 工具可入白名单被 LLM 调用（schema 由 zod 派生，非 UI 表单硬凑）。
4. binding 富配置（approval/maxCalls/config）编辑器可配、引擎生效。
5. oas-tool $ref spec 解析通过。
6. provider 三家分派 mock 验收 + DashScope 真机回归不回退。
7. 双端迁移成对交付，SQLite 真机通过（PG 真机验证遗留注记，同 M1）。

---

## 7. 实施结果（2026-09-07）

四批全部落地并验证：真实 better-sqlite3 单测 31 例新增、DashScope 真模型冒烟 4 场景全过（33 轨迹 + 9 审计落库）、真机 UI 端到端（agent-loop 首次在生产应用跑通：token 芯片/轨迹抽屉/绑定编辑器截图验证）。

### 7.1 验证中抓修的生产缺陷（真机验证价值实证）

| 缺陷 | 根因 | 修复 |
|------|------|------|
| entities/index 漏导出新实体 | boot 报 No metadata（启动验证抓到） | index.ts 补导出 |
| provider-adapter defaultLookup 用运行时 require('@core/...') | vite 只重写 import 语句——产物中别名无法解析，**agent-loop 在真实应用从未跑通**（P4 注入 fake 绕过） | 改 await import（provider-adapter.ts） |

### 7.2 对抗 review（四路 subagent：数据租户/工具安全/契约UI/回归盲区）

P1×6 / P2×17 / P3×15，修复策略：

**已修（P1 全部 + P2 绝大多数 + 低成本 P3）**
- 跨租户删除三连：deleteRun 补属主校验（C1/D2）；resetSession 轨迹级联改 scoped（A1）；agent_tool_calls 补 deleteBySessionRaw 口径的 deleteByScope（A11 部分）
- base-repository qb 代理补 orWhere 拦截（重挂租户条件）与 clone 代理化；修正失实注释（A5）
- maxSeq 改跨租户裸查（scopeKey 全局唯一，租户过滤在 ALS 缺失窗口会读小值致 seq 重号——A4）；deleteByRunRaw LIKE 前缀过 escapeLikePrefix（A7）
- wf_web_extract/politeFetch：redirect:'manual' ≤5 跳 + 每跳 validateOutboundUrl（B1，web-extract 节点同链一并修复）
- 凭据透传链：AgentToolContext.credentialId + registry binding.credentialId 下传 + custom-tool-adapter 执行注入（B2）；toolCallId 透传（B12）；AgentTask.runtimeContext → 审计 logContext（D3：audit 行 run_id 恒 NULL 主链路修复）
- approval='never' 须伴随 approvalNeverConfirmed 确认位，否则引擎降级 inherit（B3）；normalizeToolWhitelist 脏配置收口（maxCalls/config/approval 枚举——B11）+ validateConfig 按 binding 形态（C11）
- custom 工具命名 ≤49 全长 + 冲突追加序号重试（B8）；节点工具注册单工具 try/catch（B13）；image_gen modelId 必填 + 异步 provider 提示（B14）
- openapi-parser：__proto__ 指针段拒绝 + defineProperty 防原型污染（B6）+ 展开节点预算 10 万防菱形指数展开 + spec 1MB 上限（B7）；registry serializeToolResult 同款 defineProperty（B6）
- boot 装配顺序：核心 harness 先注册，可选桥各自 try 隔离（C8）
- WorkflowApiDeps.runService 补 getNodeTrajectories 契约（C2/D1——全仓唯一新增 tsc 错误）
- 抽屉：load 竞态防护（C3）+ 错误三态（C4）+ waiting_review 行轨迹入口（C5）+ 轮内按 toolCallId 配对重排（C9）
- bindings 编辑器：非法 JSON 草稿经 configTextDraft 存续不清空（C6）+ rest 字段透传（credentialId/descriptionOverride 不再被全量重建抹掉——C7）+ never 时写入确认位（B3 UI 侧）
- 轨迹补 human_request/human_decision 两类（A3：审批挂起/决策此前在时间线无痕）；参数漂移轨迹用真实 iteration（A10）
- 测试补齐：非属主 404 真断言（D4）、sink maxSeq 失败路径（D5）、静态 config 优先 fetch stub（D6）、__proto__ pin（D10）、转义膨胀截断（A2）、never 降级/凭据透传/命名冲突等新语义
- D9 注释换行 ×2

**遗留（登记，非阻塞）**
- B4 一次性授权按工具名的漂移容差收紧（审批卡展示 merged 入参）——M3 审批批统一处理
- B5 mergeStaticConfig 静态对象非封闭（LLM 可向宿主静态对象注入新增键）——同上
- B9 审计 args 含宿主静态 config 的敏感值遮蔽；B10 provider invalidateCache 事件接线（挂设置批次）；B15 pack 命名空间全名含冒号不符 provider 字符集（pack 接线批处理）
- A6 会话宿主轨迹接线生产无装配点（initAgentRuntime 零生产调用方——装配时回归 A1）；A8 会话重置轨迹删除与新会话竞态（世代号）；A9 多副本部署 seq 互吞（引擎层跨副本互斥议题）
- C12 agent_tool_calls 读取面（IPC）后置；D7 bindings 编辑器组件测试；D11 aggregateRunTokenUsage.byNode 多轮 last-wins 口径注记
