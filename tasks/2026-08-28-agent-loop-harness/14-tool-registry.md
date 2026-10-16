# 14 · AgentToolRegistry 详设：节点即工具

> Agent Loop Harness ｜ 2026-08-28 ｜ 配套文档：[01-design-spec.md](./01-design-spec.md) §9、[02-implementation-plan.md](./02-implementation-plan.md) M1/M2
> 状态：设计中 ｜ 范围：AgentToolRegistry 统一工具模型、jsonSchema 补齐、执行分发、凭据安全、危险标记、结果序列化、oas-tool V2

## 1. 目标与范围

把三类现有"可执行物"统一包装成 LLM 可调用的工具（总纲 §9）：

- **工作流节点**：39 种内置节点（`createFullNodeRegistry()` 装配，`src/core/modules/workflow/nodes/index.ts:29`）；
- **ToolService 工具**：预设工具（`preset-tools.ts:12`）+ 自定义工具（custom_tools 表，api/cli/email 三种 kind）；
- **oas-tool 操作**：OpenAPI 声明的单个 operation。

交付物：`AgentToolRegistry` 服务（`src/core/services/agent-runtime/tool-registry.ts`，与总纲 §7.1 的 `tool-gateway.ts` 同目录；registry 负责"工具是什么"，gateway 负责"这次运行能用哪些、怎么调"）。**非目标**：MCP 接入（总纲 §12）、子工作流作为工具（M3 任务树阶段再评估）、控制类节点的工具化（无意义）。

## 2. 现状与差距（代码证据）

| 现状 | 证据 | 差距 |
|------|------|------|
| 节点元数据只有 UI 导向的目录：`outputSchema` 仅 `string/number/boolean/json` 四型，无输入 JSON Schema | `workflow-node-catalog.ts:25-29`（`WorkflowOutputField`）、`:43-65`（`WorkflowCatalogEntry` 无输入 schema 字段） | S5：LLM 工具描述质量差，幻觉调用率高 |
| 表单 schema 存在但为编辑器呈现服务（text/select/kv-list/oas-params 等 19 种字段类型） | `workflow-node-forms.ts:16-78`、`NODE_CONFIG_FORMS`（`:98`） | 可推导但语义不全（缺必填/约束/描述精度） |
| ToolService 执行链完整：取定义 → 解密凭据 → URL/headers 占位替换 → `executeHttpFetch` | `tool.service.ts:196-280`；`{{credential}}` 替换 `:237-248` | 无 LLM 面向的 description/jsonSchema；无调用审计表 |
| CLI 工具有平台门禁（Web 端禁存禁执行） | `tool.service.ts:25-31`（`requireDesktopCli`） | 可直接继承为危险级别判据 |
| oas-tool V1 拒绝 `$ref` | `openapi-parser.ts:161-163`（`buildRequest` 内硬拒绝）；`oas-nodes.ts:7` | 真实世界 OAS 大量用 `$ref`，接入质量受限 |
| SSRF 统一闸门强制生效 | `outbound-url.ts:64-82`（`validateOutboundUrl`），`http-fetch.ts:90-95`（所有经 `executeHttpFetch` 的调用必过闸门） | 已达标，新链路必须复用同一入口 |
| handler 契约要求可重入、禁存跨调用状态 | `node-handler.ts:10-16` | 直调 handler 作为工具执行器在契约上合法 |
| 引擎执行链：resolveConfigDeep 模板解析 → buildContext → handler.execute | `workflow-engine.service.ts:890-894`、`:996-1004`、buildContext `:1609-1652` | 工具调用无图上下文（变量、startInputs），需合成最小 context |

## 3. 概念模型

```
AgentToolSpec（统一模型，给 LLM 看的名片 + 执行器引用）
  ├─ 来源 source: node | tool | oas
  ├─ 身份 name: 'node:http-request' | 'tool:preset:web-search' | 'tool:custom:<id>' | 'oas:<operationId>'
  ├─ 描述 description（人看）/ llmDescription（模型看，缺省回退 description）
  ├─ 参数 jsonSchema: JSON Schema draft-07 子集（object 根）
  ├─ 危险 dangerLevel: read | write | external-post | exec
  └─ 执行 executor: ToolExecutorRef（分发引用，见 §5）

AgentToolBinding（agent-loop 节点 config 里的白名单条目）
  = tool 引用 + 宿主静态配置（config/credentialId）+ 批准策略 + 次数上限

AgentToolResult（统一返回，给模型读的）
  = { ok, data? | error? , truncated?, resultRef? }
```

命名规范（本文新增，全局唯一、LLM 工具名合法字符集内）：`node:<nodeType>`、`tool:preset:<presetId去掉preset:前缀>`、`tool:custom:<customToolId>`、`oas:<operationId>`（oas spec 由 binding 静态提供，见 §5）。

**覆盖优先级**（jsonSchema 三来源，本文新增）：① catalog/custom_tools 手工编写的 `inputSchema`（最高）→ ② 从 `NODE_CONFIG_FORMS` 表单 schema 自动推导 → ③ 推导不出关键字段则该工具**不可导出**（不进白名单候选，宁缺毋滥）。

**加载期校验纪律**（本文新增，cordis 评估吸收原则，见 20-cordis-evaluation.md §4-3）：schema 声明处即校验处——catalog 注册 `inputSchema` 时立即做 JSON Schema 合法性校验（fail-fast，非法 schema 在启动期报错而非等 LLM 调用时暴雷）；与 §10 的一致性测试扩展（`checkRegistryConsistency` 模式）同批落地。

## 4. 数据模型

### 4.1 新增表：`agent_tool_calls`（工具调用审计，本文新增）

轨迹本体在 `agent_trajectories`（见 12-agent-runtime）；本表是**安全审计视角**的结构化索引——凭据使用、危险调用、批准记录的可查询留痕。双端同构，迁移按现有 `create-tool-tables.ts:10-13` 的方言分叉惯例（PG 用 `varchar/timestamp`，SQLite 用 `TEXT/datetime`；占位符 PG `$1,$2` / SQLite `?`，差异收在 repository 层）：

```sql
CREATE TABLE agent_tool_calls (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL,
  node_id        TEXT,               -- agent-loop 节点 id（未来其他宿主可为空）
  iteration      INTEGER,            -- agent 循环轮次（对齐 agent_trajectories.iteration）
  tool_name      TEXT NOT NULL,
  args_json      TEXT NOT NULL,      -- 脱敏后的入参（{{credential}} 已展开前形态）
  credential_id  TEXT,               -- 仅 id，绝无 key 本体
  danger_level   TEXT NOT NULL,      -- read / write / external-post / exec
  approval       TEXT,               -- not-required / approved / rejected / auto
  status         TEXT NOT NULL,      -- succeeded / failed / blocked / rejected
  error_code     TEXT,               -- §5.4 错误码
  duration_ms    INTEGER,
  result_preview TEXT,               -- 截断后前 500 字符
  result_ref     TEXT,               -- 完整结果引用（filePath / assetId / trajectory id）
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_agent_tool_calls_run ON agent_tool_calls (run_id, iteration);
CREATE INDEX idx_agent_tool_calls_cred ON agent_tool_calls (credential_id);
```

PG 端差异：`TEXT→varchar`、`created_at timestamp`、`INTEGER` 不变；无二进制/布尔列。

### 4.2 既有表增列：`custom_tools`（本文新增，幂等补列，仿 `create-tool-tables.ts:56-62`）

```sql
ALTER TABLE custom_tools ADD COLUMN input_schema_json TEXT;    -- 手工 JSON Schema（覆盖 paramsSchema 推导）
ALTER TABLE custom_tools ADD COLUMN llm_description TEXT;      -- 给模型看的描述（缺省回退 description）
```

catalog（`NODE_TYPE_CATALOG`）与 preset_tools 是代码内常量，新增字段走类型扩展而非迁移（见 §5.1）。

## 5. 接口设计

### 5.1 类型与目录扩展

```ts
// src/shared/types/agent-tool.types.ts（本文新增，双端同源）
export type ToolDangerLevel = 'read' | 'write' | 'external-post' | 'exec'
export type ToolSourceKind = 'node' | 'tool' | 'oas'

export interface AgentToolSpec {
  name: string                       // 见 §3 命名规范
  source: ToolSourceKind
  description: string                // 人看（轨迹视图/审批弹窗）
  llmDescription: string             // 模型看（构造时完成回退合并）
  jsonSchema: Record<string, unknown>          // object 根，draft-07 子集
  dangerLevel: ToolDangerLevel
  executor: ToolExecutorRef                    // 见 §5.3
}

// WorkflowCatalogEntry 扩展（workflow-node-catalog.ts:43-65，本文新增三个可选字段）
interface WorkflowCatalogEntry {
  // ……既有字段不动
  inputSchema?: Record<string, unknown>   // 手工 JSON Schema（给 LLM 的参数描述）
  llmDescription?: string                 // 给模型看的用法说明（何时用/限制/示例）
  dangerLevel?: ToolDangerLevel           // 缺省按 §8 规则推导
}
```

### 5.2 forms schema → JSON Schema 推导映射表（兜底路径）

`deriveJsonSchemaFromForms(type: WorkflowNodeType): Record<string, unknown> | null`，读取 `NODE_CONFIG_FORMS[type]`（`workflow-node-forms.ts:98`）：

| CatalogFormField.type | JSON Schema 映射 |
|---|---|
| text / textarea | `{ type: 'string' }`，`noTemplate` 字段标注"静态值"提示进 description |
| number / slider | `{ type: 'number', minimum: min, maximum: max }` |
| switch | `{ type: 'boolean' }` |
| select | `{ enum: options.map(o => o.value) }`（multi 时包一层 `array`） |
| select-dynamic | `{ type: 'string', description: '<label> 的 ID' }`（source 名写入 description） |
| model-pair | `{ type: 'object', properties: { providerConfigId, modelId } }` |
| kv-list | `{ type: 'array', items: { type: 'object', properties: { key, value } } }` |
| branches / inputs-list / fields-list | 返回 `null`（整体不可导出——控制/交互节点本就不在白名单） |
| oas-operations / oas-params / tool-* / skill-* | 跳过（此类节点经各自 source 通道导出，不走 node 推导） |

公共字段加工：`label` + `help` 拼成 property 的 `description`；`requiredConfigKeys`（catalog `:60`）→ schema 的 `required` 数组。推导结果在 registry 启动时缓存。

### 5.3 执行分发

```ts
export type ToolExecutorRef =
  | { kind: 'node'; nodeType: WorkflowNodeType }
  | { kind: 'tool'; toolType: 'custom' | 'preset'; toolId: string }
  | { kind: 'oas'; operationId: string }        // oasSpec 由 binding.config 提供

export interface AgentToolCall {
  toolName: string
  args: Record<string, unknown>                 // LLM 产出，过 jsonSchema 校验后
  binding: AgentToolBinding                     // 宿主静态配置（LLM 不可见不可改）
  signal: AbortSignal
}

export interface AgentToolBinding {
  tool: string                                  // spec.name
  config?: Record<string, unknown>              // 静态 config 片段（与 LLM args 深合并，静态键优先）
  credentialId?: string                         // 凭据引用（只传 id）
  approval?: 'inherit' | 'always' | 'never'     // inherit = 按 dangerLevel 默认策略
  maxCalls?: number                             // 单 run 内此工具调用上限
  descriptionOverride?: string                  // 宿主定制的 llmDescription
}

export interface AgentToolResult {
  ok: boolean
  data?: unknown                                // 已截断/引用化（§5.5）
  error?: { code: AgentToolErrorCode; message: string; hint?: string; retryable: boolean }
  truncated?: boolean
  resultRef?: string                            // 完整结果引用（文件路径/资产 id）
  durationMs: number
}

export class AgentToolRegistry {
  /** 装配：扫 catalog + PRESET_TOOLS + custom_tools + binding 内 oasSpec，产出 spec 集合 */
  listSpecs(bindings: AgentToolBinding[]): AgentToolSpec[]
  /** 给协议层（01 spec §8 ChatContext.tools）的序列化格式 */
  toLLMTools(specs: AgentToolSpec[]): Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  /** 校验 + 分发执行（不处理批准——批准由 gateway 在进入 execute 前完成） */
  execute(call: AgentToolCall): Promise<AgentToolResult>
}
```

**两条分发路线的分析与选型**：

- **路线 A：绕过图调度直调 `handler.execute`**。合成一个最小 `WorkflowNodeContext`（`workflow-engine.service.ts:1609-1652` 的字段子集）：`runId/nodeId` 取宿主 run 与 agent-loop 节点 id、`config` 为 binding.config 与 LLM args 深合并后**不再做模板解析**（LLM 输出不得触发 `{{}}` 二次展开，防注入——契约纪律同源 `node-handler.ts:52-54`）、`startInputs={}`、`triggerInfo={ source:'agent-loop' }`、`signal` 透传、logger 落审计表、`resolveTemplate/getVariable` 实现为**只认 binding.config 内显式声明的静态映射**、不提供 `getLLMHistory/recordLLMTurn`。handler 返回 `waiting_review` 是非法结果（工具不得挂起），映射为 `INTERNAL` 错误；`failed` 原样转 error。
- **路线 B：每类工具封装独立执行器**，复制 handler 核心逻辑成纯函数。

**选型：A（受限直调）**。理由：handler 契约本就要求可重入、无跨调用状态（`node-handler.ts:10-16`），直调不违反契约；路线 B 会让 39 种节点产生双份实现漂移，违背"节点即工具"的初衷。限制：仅 `controlKind==='task'` 且在白名单枚举内的节点类型可直调；控制类（condition/assign/parallel 等）、交互类（human-review/form-collect）、`sub-workflow`、`agent-loop` 自身（防递归）一律拒绝导出。`tool` 类分发到 `ToolService.executeTool`（`tool.service.ts:196`），`oas` 类分发到 §5.7 的 V2 执行函数——两者不进图引擎、天然独立，无需合成 context。

### 5.4 统一错误格式（模型可自我纠错）

```ts
export type AgentToolErrorCode =
  | 'INVALID_ARGS'        // jsonSchema 校验失败；hint 附 ajv 风格逐字段问题
  | 'NOT_WHITELISTED'     // hint 列出本次可用工具名
  | 'GUARD_BLOCKED'       // SSRF 闸门等安全拦截；hint 说明"内网地址不可用"
  | 'CREDENTIAL_ERROR'    // 凭据缺失/解密失败；hint 引导"告知用户检查凭据配置"
  | 'UPSTREAM_HTTP'       // message 含状态码与响应前 200 字符
  | 'TIMEOUT' | 'CANCELLED'
  | 'INTERNAL'
```

纪律：**错误永远不 throw 出 registry**，一律以 `AgentToolResult{ ok:false }` 回填给模型；`hint` 是给模型的下一步建议，不是给人看的堆栈。

### 5.5 结果截断与 LLM 友好序列化

`serializeToolResult(raw: unknown): { data, truncated, resultRef }`：

- 序列化后 > 16KB（本文新增常量 `TOOL_RESULT_MAX_BYTES = 16384`）：JSON 数组截取前 20 项 + `{ _truncated: { totalItems, note } }`；对象逐字段截断字符串至 2000 字符；完整原文落盘 `dataPath/workflow-media/<runId>/tool-results/<callId>.json`，`resultRef` 指向路径。
- 二进制类输出（`base64`/`dataUrl` 字段，`http-fetch.ts:44-47`）：**永不进 LLM 上下文**，替换为 `{ filePath, mimeType, sizeBytes }` 引用；模型需要内容时引导其调用 `read-asset`/后续节点。
- `status/ok/durationMs` 等元字段保留，帮助模型判断成败。

### 5.6 凭据安全

- LLM 可见面：spec 的 jsonSchema 与 description 中**只出现"需要配置凭据"字样**，不出现 credentialId；binding.credentialId 由宿主配置，位于 LLM 不可改的静态侧。
- 执行面：沿用 `tool.service.ts:237-248` 既有机制——`{{credential}}` 在 `executeTool` 内部替换，明文只存在于局部变量 `apiKey`，不进返回值、不进日志（既有纪律 `:7`）。
- 审计面：`agent_tool_calls` 记 `credential_id`（不含 key）、脱敏后 args、dangerLevel、approval、status、durationMs、result_preview/ref；**禁记**：解密后 key、含 `{{credential}}` 展开值的 headers、完整响应体。

### 5.7 oas-tool V2：`$ref` 支持方案

在 `openapi-parser.ts` 增加解析层（纯函数、零依赖原则不变，`:2-8`）：

```ts
/** 解析本地 $ref（#/components/schemas/X、#/definitions/X），环检测 + 深度上限 10；外部 http(s) $ref 拒绝 */
export function resolveRefs(spec: OasSpecShape, node: unknown, depth?: number): { ok: true; value: unknown } | { ok: false; error: string }
/** V2：取操作的完整入参 JSON Schema（path/query/header 参数 + requestBody 合并为单个 object schema） */
export function buildOperationSchema(text: string, operationId: string): { ok: true; schema: Record<string, unknown>; summary?: string } | { ok: false; error: string }
```

- `buildRequest` 升级：`openapi-parser.ts:161-163` 的硬拒绝改为先 `resolveRefs` 解引用再组装；requestBody 按解引用后的 schema 校验并构造 body（取代 V1 的"声明外参数自由透传"`:210-218`，透传降级为 schema 未声明 requestBody 时的兜底）。
- registry 侧：`buildOperationSchema` 的输出直接就是 `AgentToolSpec.jsonSchema`——oas 类工具的机器可读描述零手工成本，这是 V2 的主要动机。

## 6. 状态机与关键时序
## 6. 状态机与关键时序

> **2026-09-07 总收口 review 注记**：实现中管线顺序为 **审批 → 校验 → 静态合并 →
> 执行**（§6 状态机的 validated→awaiting_approval 与此相反）。安全姿态不受影响
> （两关都过才执行、approve_with_edit 后必重校验），但审批人见到的入参是模型
> 原始 args（未校验形态）。改序（廉价 zod 前置到发卡前）立项 M2——涉及 loop
> 层与 registry 管线两层所有权分层，与本批 registryWrapped 定案耦合。

**单次工具调用状态机**（穷举迁移）：

```
proposed(LLM 产出 tool_call)
  → validated          [jsonSchema 校验通过]           校验失败 → rejected(INVALID_ARGS，回填模型)
  → blocked            [NOT_WHITELISTED / GUARD_BLOCKED]
  → awaiting_approval  [dangerLevel 需批准 && binding.approval!=='never']
        → approved  → executing      批准超时/驳回 → rejected（决策回填模型）
  → executing          [无需批准]
        → succeeded / failed(TIMEOUT/UPSTREAM_HTTP/CREDENTIAL_ERROR/INTERNAL)
  任意执行中状态 + 宿主 abort → failed(CANCELLED)
```

**危险批准时序**（复用总纲 §7.2 的 human_request 通道）：

```
LLM ──tool_call(cli 工具)──→ toolGateway
gateway: dangerLevel=exec, approval!=='never'
  → agent_tool_calls 记 approval=pending 语义行（status=blocked 前先不落终态）
  → AgentRuntime decision.type='human_request' → host.suspend(payload)
  → agent-loop 节点翻译为引擎 waiting_review（01 spec §3.2 E3）
  → 人工批准/驳回 → handler.resume(decision, state) 回调
  → approved: registry.execute(call) → 结果回填模型，循环继续
  → rejected: 以 ok:false{ code:'INTERNAL', hint:'用户拒绝了该操作'} 回填，模型自行改路
```

## 7. 失败模式与边界情况

1. **崩溃在 LLM 决策落轨迹与工具执行之间**：恢复后 trajectory 有 tool_call 无 result → 幂等重放决策：read 类直接重执行；write/external-post/exec 类查 `agent_tool_calls` 无记录 → 重新执行并在审计表标注 `retry_after_crash`（本文新增 status 备注位，记入 args_json 的 meta）。
2. **崩溃在工具副作用已发生、结果未回填之间**：重放导致重复副作用。缓解：天然非幂等工具（email-send、POST 类 oas）在 binding.config 支持 `idempotencyKey` 模板（本文新增，宿主按 runId+iteration 生成），执行器侧先查后做（对齐总纲 §3.4 的幂等键约定）。
3. **崩溃在 awaiting_approval**：批准请求挂在引擎 waiting_review（journal 持久化，11-run-journal 保证跨重启可决策），决策到达后 resume 重新进入分发，不丢。
4. **handler 抛异常**：引擎路径有 try/catch 兜底（`workflow-engine.service.ts:999-1003`），registry 直调路径自行包同级 try/catch → `INTERNAL`。
5. **handler 返回 waiting_review**：工具语义非法 → `INTERNAL` + hint"该节点不能作为工具"；registry 启动校验把此类节点挡在导出清单外（双保险）。
6. **凭据解密失败**：`tool.service.ts:112-119` 抛错 → 映射 `CREDENTIAL_ERROR`，模型收到引导性 hint，不会看到任何密文/明文。
7. **SSRF 拦截**：`http-fetch.ts:90-95` 返回 `ok:false` → `GUARD_BLOCKED`；注意闸门不解析 DNS（`outbound-url.ts:12-14` 已知边界），prompt 注入诱导的"公网域名指内网"不在本层防御范围，靠部署侧出向代理兜底。
8. **LLM 构造的 args 触发模板注入**：直调路径不做 `resolveConfigDeep`（§5.3），args 中的字面 `{{...}}` 原样传递不展开。
9. **超大/二进制结果**：§5.5 截断与引用化；`readBodyWithLimit` 的 50MB 上限（`http-fetch.ts:13-14`）在网络层先兜底。
10. **并发调用同一 CLI 工具**：spawn 无共享状态（`tool.service.ts:381-426`），安全；但 dangerLevel=exec 默认 `maxCalls` 与批准策略收紧。
11. **白名单运行期被编辑**：spec 在 run 启动时快照装配（registry 缓存键含 binding 版本），运行中途改配置不影响在途 run。
12. **oas `$ref` 环/超深/外部引用**：`resolveRefs` 返回 error → 工具导出失败，白名单装配时剔除并记 warn 日志（不进运行时错误）。

## 8. 安全与权限

- **危险级别默认推导**（本文新增规则，可被 catalog/custom_tools 显式字段覆盖）：`cli` 工具 → `exec`；HTTP method ∈ {POST,PUT,PATCH,DELETE} 的 tool/oas → `external-post`；kb-ingest/save-asset/data-table(op≠query)/variable(op=set) 等写节点 → `write`；其余 → `read`。
- **批准前置默认策略**：`exec`、`external-post` 默认需人工批准（binding.approval 可显式放宽为 never，编辑器 UI 给二次确认）；`write` 可配；`read` 默认放行。
- **出网**：所有 source 的执行路径最终都汇聚到 `executeHttpFetch`（http-request 节点、ToolService、oas 无一例外），SSRF 闸门单一入口不破。
- **平台门禁**：`requireDesktopCli`（`tool.service.ts:27-31`）在 registry 导出阶段就生效——Web 端 `exec` 类工具不出现在 spec 列表，而非执行时才炸。
- **凭据**：§5.6；审计表字段白名单制，新增字段需过"是否含敏感值"评审。
- **Web 端**：registry/gateway 的新增 IPC/REST 全部注册并鉴权（02-plan 横切安全纪律）。

## 9. 与其他模块的契约

- **11-run-journal / 12-agent-runtime（journal 与轨迹）**：工具调用的 thought/tool_call/result 写 `agent_trajectories`（总纲 §3.3）；本模块的 `agent_tool_calls` 是其安全审计伴生表，`run_id+iteration` 对齐，不重复存轨迹本体。
- **01 spec §8（tool-calling 协议层）**：`toLLMTools()` 的输出形状即 `ChatContext.tools: AgentToolSpec[]` 的序列化形态；协议层不感知 executor/dangerLevel。
- **AgentRuntime tool-gateway（总纲 §7.1）**：gateway 持有白名单 bindings，负责 spec 快照、批准前置（§6）、maxCalls 计数、调用计数进护栏；registry 是无状态装配与分发器。
- **E4 agent-loop 节点**：节点 config 的 `tools: AgentToolBinding[]` 数组即白名单结构（§5.3）；节点的 `suspend/resume` 通道承载危险批准（§6 时序）。
- **工作流引擎**：直调复用 `WorkflowNodeHandler` 契约（`node-handler.ts:88-111`）与 `WorkflowNodeRegistry.getOrThrow`（`node-registry.ts:30-37`）；不新增引擎扩展点（E1-E6 之外零侵入）。
- **MCP**：后期子系统接入时新增 `source:'mcp'` 即可，spec/审计/批准三层无需改形。

**MCP 工具来源画像（未来 MCP 子系统接入的类目设计参考，借鉴业界分类实践）**：MCP 作为外部工具的标准协议，接入时按来源分四类画像，各自的设计关注点不同——

| 类目 | 典型用途 | 接入关注点 |
|------|----------|-----------|
| DB MCP | 读实时 schema、查数 | 只读优先；schema 感知进 llmDescription；写操作走 `external-post` 级批准 |
| API MCP | 查接口定义、调业务接口 | 与 oas-tool V2 同构（operation 即工具）；凭据走既有注入机制 |
| 运维 MCP | 接 CI/CD、监控、日志 | 高危险级别密集（exec/external-post），默认全部人工批准 |
| 知识库 MCP | 挂外部文档库检索 | 与内部 kb 检索并存，结果按不可信参考包裹（同记忆注入纪律） |

四类画像在 `source:'mcp'` 下以子类目字段区分，复用本模型的 dangerLevel/批准/审计三层。业务包可声明其依赖的 MCP 服务（如 ai-coding 包依赖运维 MCP 接 CI），声明格式与依赖解析契约见 [18-business-pack.md](./18-business-pack.md)。

## 10. 测试策略

- **单测**：① forms→JSON Schema 推导映射表全字段类型覆盖；② 三来源覆盖优先级（手工 > 推导 > 不可导出）；③ `resolveRefs` 环/深度/外部引用；④ `serializeToolResult` 截断与二进制引用化；⑤ 错误码映射（含 handler 抛异常、waiting_review 非法返回）；⑥ 凭据占位在审计行中的脱敏断言（回归：args_json 不含明文 key）。
- **集成**：⑦ 直调白名单节点（http-request/web-search/code/data-table-query）端到端过 registry.execute；⑧ 危险工具批准链路：挂起 → 批准 → 续跑、挂起 → 驳回 → 模型收错改路；⑨ Web 端 cli 工具不出现在 spec 列表。
- **一致性测试扩展**：`checkRegistryConsistency`（`node-registry.ts:67-100`）模式照搬——catalog 有 `inputSchema` 的节点，其 schema 的 `required` 键必须 ⊆ `requiredConfigKeys` 推导全集（防手写字段与表单漂移）。
- **双端**：`agent_tool_calls` 迁移与增列迁移在 SQLite/PG 各跑一遍；审计查询占位符双端冒烟。

## 11. 里程碑拆解

- **M1**：`AgentToolSpec`/`AgentToolResult`/错误码类型；registry 骨架 + 路线 A 直调执行器；首批 4 种安全工具（http-request、web-search、code、data-table 的 query 模式——对齐 02-plan M1.4）手工 `inputSchema`；结果截断与统一错误；`agent_tool_calls` 表与审计写入；批准通道走通（dangerLevel + host.suspend）。
- **M2**：高频 15 种节点 `inputSchema` 补齐 + forms 推导兜底上线；`custom_tools` 增列与推导；oas-tool V2（`resolveRefs` + `buildOperationSchema`）；轨迹视图消费 `agent_tool_calls` 展示工具调用行。
- **M3**：知识飞轮读取类工具（kb-retrieve 已在白名单；memory 检索工具以 `node:` 或独立 source 接入）；L4 技能命中时注入对应工具调用范式（与技能库契约另文）。
- **M4**：批准策略按用户/角色细化（依赖 E6 操作者校验落地）；审计报表与凭据使用盘点页；MCP 立项评估时复用本模型评审。

## 12. 开放问题

1. `idempotencyKey` 是逐工具模板还是由 gateway 按 `runId:iteration:toolName` 统一生成？倾向后者（零配置），但对外部 API 语义不合时需逐工具覆盖——M2 实施前定。
2. `external-post` 默认需批准是否过严（大量正常业务是 POST）？可考虑按域名白名单豁免，待真实使用数据决定。
3. forms 推导产物的 description 质量是否够用，还是 M2 直接把 15 种高频节点全量手工化、推导仅作长尾兜底？倾向后者。
4. `agent_tool_calls` 与 `agent_trajectories` 长期是否合并为一表双视图？当前分两表是"审计不可丢、轨迹可归档"的保留策略差异，待 11-run-journal 的保留策略（02-plan 开放问题 1）落定后复评。

---

## 2026-09-06 修订（21 号决策落地：通用工具平台 + pack 来源 + 模型统一）

> 依据 [21-oss-adoption.md](./21-oss-adoption.md) 决策二。**工具系统确认为通用平台模块**
> （`src/core/platform/agent-runtime/tool-registry.ts`），本文的 AgentToolSpec /
> AgentToolBinding / AgentToolResult / 错误码 / 状态机 / 审计表全部保留为本模块契约。

### R1 服务面扩展：三类消费者 × 四种来源

消费者（原设计只有 agent-loop 一类）：

1. **agent 循环**：LLM 驱动选工具（本文原设计）；
2. **工作流节点**：config 驱动——路线 A"受限直调"推广为节点 handler 的库化复用
   （同一执行器、同一审计/SSRF/凭据纪律，任何业务代码可按 spec 直调）；
3. **业务包代码**：AgentDefinition 声明工具后包内直接 execute（不经 LLM）。

来源（§3 命名规范扩展）：`node:` / `tool:preset:` / `tool:custom:` / `oas:` /
**新增 `pack:<packId>:<toolName>`（业务包工具）** / 后期 `mcp:`。

### R2 AgentToolDef ↔ AgentToolSpec 统一模型

我方设计稿的业务侧工具定义与本文的通用 spec 统一为一个模型（zod 与 JSON Schema
双向转换：zod→jsonSchema 供 toLLMTools/推导缓存；jsonSchema→zod 供运行时校验）：

| AgentToolDef（业务侧） | AgentToolSpec（本文） | 融合规则 |
|---|---|---|
| `inputSchema: z.ZodType` | `jsonSchema`（draft-07） | 单一事实源用 zod 编写，jsonSchema 派生缓存 |
| `requiresApproval: boolean` | `dangerLevel` + 批准默认策略 | **取严**：requiresApproval=true 或 dangerLevel∈{exec, external-post} 均需批准 |
| `approvalCard`（title/summary/editable） | 无 | 新增可选字段（审批 UI 渲染；引擎路径映射进 human-review payload） |
| `execute(input, ctx)` | `executor: ToolExecutorRef` | 新增 `executor.kind='pack'`：包内函数引用 + AgentToolContext（scopeId/rawInput/signal） |

统一后注册入口：业务包 activate → `registry.registerPackTools(packId, defs)`；
agent-loop 白名单的 AgentToolBinding 可引用任何来源（含 pack:）。

### R3 与 skills（src/agents/api）互操作预留

`src/agents/skills/registry.ts` 的 SkillDefinition（name/inputSchema/execute）与统一模型
近同构——提供 `skillToTool(skill): AgentToolDef` 适配器后，REST skills 反向成为工具来源
（`skill:<name>`，dangerLevel 按 category 推导：asset=narrative→write、render/compose→write），
长文/EP agent 可直接调用 EP 能力（21 号决策二的落点之一）。M2 实施。
