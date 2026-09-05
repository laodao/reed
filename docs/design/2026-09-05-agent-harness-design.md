# Agent Harness 详细设计（platform 级基础能力）

- 日期：2026-09-05 · 分支：`feat/agent-harness`（基于 feat/plugin-arch @ f361915e）
- 前置调研：[2026-09-05-agent-harness-research.md](./2026-09-05-agent-harness-research.md)（v5，含运行级 spike）
- 状态：设计评审稿（待用户确认后进入 M0 实现）
- 骨架：`src/core/agent/`（be56607f 已提交 13 文件；本设计定稿后 M0 第一步迁移至 platform，见 §2.2）

---

## 1. 背景与目标

### 1.1 问题

系统内存在两套逐行同构的 agent 实现（旧 `decide→act→summarize` 协议）：

| 实现 | 位置（三期重构后） | 规模 |
|---|---|---|
| 长文 agent | `core/platform/services/longwriting/agent/` | 6 文件 ~1450 行 |
| EP agent | `core/platform/episode-production/agent/` | 8 文件 ~1818 行 |

各自复制了：动作白名单与归一化、历史拼接、状态摘要、事件推送、项目互斥、取消、建议 chips、
JSON 决策容错。故事研讨室（原型 v3.1 已定稿）是第三个消费者；工作流引擎的 LLM 节点另有一套
multiTurn 历史注入。**调用层（ai-call.ts）已抽象，循环层没有**。

### 1.2 目标

建设 platform 级 **agent harness** 基础能力，一次实现、多方复用：

1. **功能完备**：LLM loop、工具系统、人在回路审批、分层上下文管理、自动压缩、会话持久化、
   长期记忆、事件流、中断与恢复、可观测性（12 个功能模块，见 §3）
2. **契约稳定**：对外接口（§5）先行设计定稿，业务只依赖接口不依赖实现
3. **测试先行**：充分单测（§9）全绿后才接线替换业务（§7 迁移门禁）
4. **架构一致**：双端（Electron/Web）、ALS 多租户、IPC `{success,data?,error?}` 契约、
   BaseRepository、pack 守卫、事件通道、单例模式全部对齐既有规范
5. **可扩展**：与工作流引擎集成（§8），为 packs / skills / MCP 留互操作位

### 1.3 非目标（明确不做）

- 多 agent 协作编排 / 规划执行图（单 agent + 工具循环已覆盖三个消费者；工作流引擎负责编排）
- 代码执行沙箱（bash/fs 工具不启用——业务工具操作自有数据库，无代码执行需求）
- 向量语义记忆（接口预留 MemoryRetriever，M3 前不实现；设定集结构化查询已够用）
- provider 层 function-calling 协议改造（沿用 ai@6 标准工具协议；国产端点兼容问题由
  tool-call repair 中间件兜底，JSON 决策协议在迁移期保留为降级路径）

---

## 2. 总体架构

### 2.1 分层图

```
┌─────────────────────────────────────────────────────────────────┐
│ packs 层（业务包，各自目录）                                        │
│  longwriting pack · episode-production pack · chat pack · …       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ AgentDefinition（声明式：systemPrompt + tools + snapshot） │    │
│  │ handlers 薄适配层（IPC channel 不变，内部调 harness 门面）  │    │
│  └──────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│ platform 层 ← harness 归属此层                                     │
│  core/platform/agent-runtime/          ← 本设计                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ AgentRuntimeService（门面/单例，§5 对外接口）                │    │
│  │   ├─ runtime/session-factory（组装 open-harness Session）   │    │
│  │   ├─ runtime/approval（审批协调 ↔ 前端提案卡）               │    │
│  │   ├─ runtime/event-bridge（事件映射 + 业务通道推送）          │    │
│  │   ├─ context/context-manager（四层装配，onBeforeSend）       │    │
│  │   ├─ memory/session-store（SessionStore 实现，ALS）          │    │
│  │   ├─ memory/memory-service（长期记忆状态机）                 │    │
│  │   ├─ tools/registry（zod 工具注册 + 审批标记）               │    │
│  │   └─ provider/provider-adapter（→ ai-call → AI SDK 模型）    │    │
│  └──────────────────────────────────────────────────────────┘    │
│  依赖的 platform 既有设施：                                          │
│    services/ai-call.ts（getProviderConfig/密钥解密/fallback 链）    │
│    interfaces/event.interface（事件总线）                            │
│    utils/logger（结构化日志）                                       │
│    database（BaseRepository/ALS/迁移注册）                           │
├─────────────────────────────────────────────────────────────────┤
│ 第三方（全部 ESM-only，经 agent-runtime 内部动态 import 隔离）        │
│   ai@^6.0.277（钉死，见 §2.3 红线）· @openharness/core@^0.7.0      │
│   @ai-sdk/openai-compatible@^2 · zod@^4                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 归属决策：`src/core/platform/agent-runtime/`

- packs 依赖 platform，platform 不得反向依赖 packs（插件架构铁律）→ harness 是多方共用的
  基础能力，必须在 platform 层，与 `services/ai-call.ts`、`workflow/` 同级
- **不注册为 pack**：harness 无自有 IPC 前缀、无启用开关语义（开关属于使用它的业务 pack）；
  它更像 task-queue / event-system 这样的平台设施
- 现骨架在 `src/core/agent/`（提交早于三期重构合入）——M0 第一步 `git mv` 迁移并修 import

### 2.3 工程红线（spike 实测，违反即埋坑）

| 红线 | 原因 | 执行方式 |
|---|---|---|
| **钉 `ai@^6.0.277`** | ai@7 engines 要求 Node≥22，Electron 28（内嵌 Node 18）跑不了 | package.json 精确声明 + `overrides` 字段锁传递依赖不得引入 ai@7 |
| **ai@6 与 ai@7 禁混装** | 双副本导致模型/工具对象跨包传递失效 | overrides + CI 加 `npm ls ai` 断言单版本 |
| **ESM-only 包禁顶层 import** | Electron 主进程产物为 CJS，顶层 `import 'ai'` 会在打包期炸 | agent-runtime 内部一律 `await import('ai')`（异步工厂模式，§5.4）；类型用 `import type`（编译期擦除，安全） |
| **core/platform/agent-runtime 禁 import packs** | 依赖方向 | ESLint `no-restricted-imports` 规则固化进 lint 配置（新增 boundary 检查） |
| **harness 禁直连数据库业务表** | 表归属业务（如 lw_*） | harness 只读写自有表（agent_sessions/agent_memories）；业务数据经工具回调进入 |

---

## 3. 功能模块清单与依赖关系

### 3.1 12 个功能模块 → 13 个代码模块映射

| # | 功能模块 | 代码模块（platform/agent-runtime/） | 来源 |
|---|---|---|---|
| F1 | LLM Loop | `runtime/session-factory.ts` + `runtime/agent-service.ts` | ai@6 Agent + @openharness Agent/Session |
| F2 | 模型接入 | `provider/provider-adapter.ts` | 包装 ai-call.ts + @ai-sdk/openai-compatible |
| F3 | 工具系统 | `tools/registry.ts` | ai@6 tool() + 自研注册/容错/截断 |
| F4 | 人在回路 | `runtime/approval.ts` | @openharness ApproveFn 契约 + 自研协调器 |
| F5 | 上下文管理 | `context/context-manager.ts` | 自研（挂 onBeforeSend） |
| F6 | 上下文压缩 | @openharness DefaultCompactionStrategy | 直接用（两阶段：剪枝→摘要），session-factory 编排 |
| F7 | 会话管理 | `memory/session-store.ts` | SessionStore 接口的自研实现 |
| F8 | 记忆 | `memory/memory-service.ts` | schema 借 happyclaw（MIT）、策略借 qm（MIT） |
| F9 | 状态快照 | `context/state-snapshot.ts` | 自研接口，业务注入 |
| F10 | 事件流 | `runtime/event-bridge.ts` | 自研（Session 事件词汇表→业务通道） |
| F11 | 中断与恢复 | 横切：agent-service（AbortController 池）+ context-manager（哨兵） | qm 哨兵模式 |
| F12 | 可观测性 | `provider/provider-adapter.ts` + `runtime/agent-service.ts` 内埋点 | createLogger + usage 事件 |

代码模块另含：`types.ts`（公共类型，F0）、`memory/migrations.ts`（建表）、`index.ts`（出口）。

### 3.2 依赖 DAG（编译期可校验）

```
L0  types.ts ──────────────────────────────────────────────（零依赖）
L1  provider/provider-adapter   依赖 types, ai-call, ai, @ai-sdk/openai-compatible
L1  tools/registry              依赖 types, ai, zod
L1  memory/session-store        依赖 types, database(BaseRepository), ai(仅类型)
L1  memory/memory-service       依赖 types, database(BaseRepository)
L1  memory/migrations           依赖 database 迁移注册器
L2  runtime/approval            依赖 types, interfaces/event.interface
L2  context/context-manager     依赖 types, context/state-snapshot, utils(纯函数)
L2  runtime/event-bridge        依赖 types, interfaces/event.interface, ai(仅类型)
L3  runtime/session-factory     依赖 L1×4 + L2×3 + @openharness/core
L4  runtime/agent-service       依赖 session-factory（唯一组装点）
L4  index.ts                    依赖 types + agent-service（仅类型与工厂重导出）
```

规则：
- **L1/L2 互相不依赖**（approval 不知道 context，session-store 不知道 approval）——所有交叉
  编排在 L3 session-factory 一处完成，替换任一 L1/L2 模块不动其他
- L2 以下模块可独立单测（mock 其 L1 依赖）；L3/L4 是集成测试对象
- DAG 由 ESLint `import/no-restricted-paths` 固化（每目录一条 allow 清单），越界即 lint error

---

## 4. 公共类型（types.ts，定稿）

```ts
// ==================== 工具 ====================

/** 业务工具定义。execute 内禁止直连 harness 内部状态（只能经 ctx）。 */
export interface AgentToolDef<TInput = unknown, TOutput = unknown> {
  name: string                       // 英文 snake_case，模型可见：save_story_entity
  description: string                // 中文，写清「何时该用」（模型选择工具的依据）
  inputSchema: z.ZodType<TInput>     // zod v4，经 standard-schema 供 ai@6
  execute(input: TInput, ctx: AgentToolContext): Promise<TOutput>  // 返回值须可 JSON 序列化
  requiresApproval?: boolean         // true = 提案卡（保存/换一版/忽略）
  approvalCard?: {
    title: string
    summary?: (input: TInput) => string   // 卡片摘要（前端渲染）
    editable?: (keyof TInput & string)[]  // 可编辑字段（对应原型「新值可直接编辑」）
  }
}

export interface AgentToolContext {
  scopeId: string          // 业务 scope（projectId / episodeId / workflowRunId）
  rawInput: string         // 用户当轮原话（工具落「来源」字段用）
  signal?: AbortSignal     // 中断贯穿到业务 IO
  /** 结构化日志上下文（trace 链路） */
  logContext: Record<string, unknown>
}

// ==================== Agent 定义（业务方唯一要写的东西） ====================

export interface AgentDefinition {
  id: string                          // 全局唯一：'longwriting' | 'ep' | 'story-room' | ...
  version: number                     // 定义版本（快照/提示词变更时 +1，排障用）
  systemPrompt: string | ((scopeId: string) => Promise<string>)  // 静态或按 scope 定制
  tools: Record<string, AgentToolDef>
  buildStateSnapshot(scopeId: string): Promise<string>   // F9：库里重建，不由 AI 复述
  /** 循环模式：react=多步工具循环（故事研讨室）；single-pass=决策+执行+回复（兼容旧两套行为） */
  loopMode: 'react' | 'single-pass'
  maxSteps?: number                   // react 缺省 6，single-pass 固定 1
  contextWindowTokens?: number        // 缺省 128k；触发自动压缩的窗口
  modelPreference?: { providerConfigId?: string; modelId?: string }
  /** 事件通道命名（保持业务前缀，pack IPC 守卫友好）：(scopeId) => `longwriting:agent:${scopeId}` */
  eventChannel: (scopeId: string) => string
  /** 流式正文子通道命名（前端订阅增量）：缺省 `${eventChannel(scopeId)}:stream` */
  streamChannel?: (scopeId: string) => string
  /** 每轮结束的建议 chips（缺省由业务 handler 自算） */
  buildSuggestions?(snapshot: string): string[]
  /** 审批卡超时 ms（缺省 5 分钟；超时=拒绝） */
  approvalTimeoutMs?: number
  /** 会话标题（会话列表用，可选） */
  summarizeTitle?(firstUserMessage: string): Promise<string>
  /** 记忆提取钩子（qm MemoryStrategy 模式；缺省不提取） */
  onTurnEnd?(ctx: { scopeId: string; userMessage: string; reply: string; toolCalls: Array<{ name: string; input: unknown; ok: boolean }> }): Promise<void>
}

// ==================== 会话与轮次 ====================

export type AgentEvent =
  // —— 对齐旧协议（前端零改动子集）——
  | { type: 'stage'; stage: 'deciding' | 'acting' | 'summarizing' | 'compacting' | 'restoring' }
  | { type: 'action:start'; actionType: string; label: string }
  | { type: 'action:done'; actionType: string; status: 'ok' | 'error' | 'denied'; message: string; changed?: string[] }
  | { type: 'reply:start'; summaryEventId: string }
  | { type: 'reply:content'; summaryEventId: string; delta: string }
  | { type: 'reply:done'; suggestions?: string[] }
  | { type: 'error'; error: string }
  // —— 新增（原型 v3.1 对应；旧前端忽略未知 type，安全）——
  | { type: 'approval:request'; approvalId: string; toolName: string; input: unknown;
      card: { title: string; summary: string; editable?: string[] }; expiresAt: number }
  | { type: 'approval:resolved'; approvalId: string; action: string }   // approve/reject/timeout
  | { type: 'compaction'; phase: 'start' | 'summary' | 'done'; tokensBefore?: number; tokensAfter?: number }

export interface AgentSendResult {
  conversationId: string              // `${definitionId}:${scopeId}`
  reply: string                       // assistant 全文
  actionSummaries: Array<{ type: string; params: unknown; ok: boolean; brief: string }>
  suggestions: string[]
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  metadata?: { actions?: unknown[]; suggestions?: string[]; interrupted?: boolean }
}
```

---

## 5. 对外接口（harness 整体）

### 5.1 门面（AgentRuntimeService，单例）

```ts
// core/platform/agent-runtime/index.ts 出口
export interface AgentRuntime {
  /** 注册定义（pack activate 时调用；重复 id 抛 AgentDefinitionConflictError） */
  registerDefinition(def: AgentDefinition): void
  /** 注销（pack disable 时；挂起轮次先取消） */
  unregisterDefinition(definitionId: string): void
  listDefinitions(): Array<{ id: string; version: number; toolCount: number; loopMode: string }>

  /** 一轮对话（per (definitionId,scopeId) 互斥；互斥冲突抛 AgentBusyError——对齐旧 busyProjects 语义） */
  sendMessage(definitionId: string, scopeId: string, message: string,
              opts?: { providerConfigId?: string; modelId?: string }): Promise<AgentSendResult>
  /** 中断当前轮（AbortController 池；挂起审批一并取消） */
  cancel(definitionId: string, scopeId: string): boolean
  /** 会话历史（人读格式；limit 缺省 50） */
  getHistory(definitionId: string, scopeId: string, limit?: number): Promise<AgentHistoryMessage[]>
  /** 清空会话（业务「重新开始」用） */
  resetSession(definitionId: string, scopeId: string): Promise<void>

  /** 提案卡决定（approvalId 来自 approval:request 事件） */
  decideApproval(approvalId: string, decision: ApprovalDecision): boolean  // false=已过期/不存在
  /** 挂起中审批列表（前端重连后恢复卡片用） */
  listPendingApprovals(definitionId: string, scopeId: string): PendingApproval[]

  /** 事件订阅（幂等；返回退订函数）——通道命名走 definition.eventChannel */
  subscribe(definitionId: string, scopeId: string, cb: (e: AgentEvent) => void): () => void

  /** 健康检查（工作流/运维用） */
  health(): { activeSessions: number; busyScopes: string[]; pendingApprovals: number }
}

/** 异步工厂（ESM 动态 import 隔离，见 §2.3；幂等） */
export async function initAgentRuntime(deps?: AgentRuntimeDeps): Promise<AgentRuntime>
export function getAgentRuntime(): AgentRuntime   // 未 init 抛错（对齐 getCoreDatabaseManager 风格）
export async function disposeAgentRuntime(): Promise<void>  // 测试/停机用
```

### 5.2 依赖注入（AgentRuntimeDeps，测试/双端可换）

```ts
export interface AgentRuntimeDeps {
  resolveModel?: (opts?: ResolveModelOptions) => Promise<LanguageModel>  // 缺省 provider-adapter
  sessionStore?: AgentSessionStore                                     // 缺省 DB 实现；测试用内存版
  memoryService?: MemoryService                                        // 缺省 DB 实现
  eventEmitter?: { emit(channel: string, payload: unknown): void }     // 缺省 interfaces/event.interface
  clock?: () => number                                                 // 缺省 Date.now；测试注入假时钟
  logger?: Pick<Console, 'info' | 'warn' | 'error'>                    // 缺省 createLogger('agent-runtime')
}
```

> 设计原则：**L1/L2 模块全部可注入**，AgentRuntimeService 组装缺省实现——单测不需要起数据库，
> 集成测试才注入真实现。这与 AgentWorkflowService.getInstance(db, ai) 的注入惯例一致。

### 5.3 调用时序（一轮带审批的 react 轮次）

```
pack handler（IPC channel 不变）
  └─ runtime.sendMessage(defId, scopeId, msg)
       ├─ 互斥检查（busy set）────────────── 冲突→AgentBusyError
       ├─ getOrCreateSession(def, scopeId)  ← LRU 会话缓存（§6.9）
       │    ├─ session.load()               ← 首次 false；崩溃恢复 true + 注入中断哨兵
       ├─ buildSnapshot(scopeId)            ← F9，每轮一次缓存
       ├─ session.send(msg, {signal})
       │    ├─ onBeforeSend → context-manager.assemble()   ← 四层装配
       │    ├─ [step 1] 模型流式 … tool-call: save_story_entity
       │    │    ├─ approve 回调 → approval.request() ── emit approval:request → 前端提案卡
       │    │    │      （Promise 挂起；decideApproval/超时/cancel 到达）
       │    │    ├─ approve=true → tools/registry 执行（ctx 注入）→ emit action:done
       │    │    └─ approve=false → tool.error 观察结果 → 模型收到「用户拒绝了」继续对话
       │    ├─ [step 2..N] …（stopWhen: stepCountIs(maxSteps)）
       │    └─ text.delta → event-bridge → emit reply:content → streamChannel
       ├─ sessionStore.save（Session done 事件自动）
       ├─ def.onTurnEnd?()（记忆提取钩子）
       └─ return AgentSendResult
```

### 5.4 ESM 隔离模式（关键工程决策）

agent-runtime 对外是普通 CJS 模块（与 platform 其余代码一致），内部引用 ESM-only 包的位置
**只有三处**，全部走异步动态 import，在模块级缓存 Promise：

```ts
// provider/provider-adapter.ts（模式示例；session-factory / event-bridge 同理）
let aiModule: Promise<typeof import('ai')> | null = null
function loadAi() { return (aiModule ??= import('ai')) }
```

- TypeScript 类型引用一律 `import type`（编译期擦除，不产生运行时 require）
- 因此 `initAgentRuntime()` 是 async——首次调用才加载第三方（Electron 主进程冷启动零开销）
- vitest 单测同样动态 import（`ai/test` 的 MockLanguageModelV3）

---

## 6. 模块详细设计（类与函数）

### 6.1 provider/provider-adapter.ts（F2）

```ts
export class ProviderAdapter {
  constructor(private deps: { logger: Logger })

  /** 核心：解析模型对象（spike ⑦ 已验证按请求构造） */
  async resolveModel(opts?: ResolveModelOptions): Promise<LanguageModel>

  /** 列模型（definition 调试/前端模型选择器复用；透传 ai-call 的 fallback 链结果） */
  async listModels(providerConfigId?: string): Promise<Array<{ id: string; label?: string }>>
}
```

实现要点：
- 复用 `getProviderConfig(providerConfigId)`（指定 ID→默认→首个启用 + secureStorage 解密），
  **不复制逻辑**——apiKey 管理与 SSRF 校验单一事实源保持在 ai-call.ts
- 模型 fallback 链与 ai-call 完全一致（显式→config.defaultModel→用户启用首个文本→模板内置），
  提取为共享函数放 ai-call.ts 导出（避免两处漂移；对 ai-call 是纯重构无行为变更）
- 实例缓存：`LRU<`${providerConfigId}:${modelId}`, LanguageModel>`，容量 8，TTL 10 分钟，
  provider 配置更新事件（event-system 已有）时清空——apiKey 解密一次多次复用，避免每轮重建
- 每次调用记录结构化日志（provider/model/耗时/usage），对齐 ai-call 的日志规范
- 错误语义：未配置 provider 抛 `AgentProviderNotConfiguredError`（handler 转 IPC error）

### 6.2 tools/registry.ts（F3）

```ts
export class ToolRegistry {
  register(def: AgentToolDef): void                    // 重名抛错；name 必须 /^[a-z][a-z0-9_]{2,48}$/
  registerAll(defs: AgentToolDef[]): void
  get(name: string): AgentToolDef | undefined
  list(): AgentToolDef[]
  hasApprovalTools(): boolean                          // session-factory 决定是否装 approve 回调

  /** 转换为 ai@6 工具映射（execute 包装层在此实现） */
  async buildAiTools(ctx: AgentToolContext, signal?: AbortSignal): Promise<Record<string, AiTool>>
}
```

execute 包装层（所有业务工具统一获得的行为，防埋坑）：
1. **zod 校验**：失败返回结构化错误 `{ ok: false, error: 'input_invalid', detail }` 给模型
   （不是抛异常——模型可自我纠正重试；对齐旧 agent-actions 容错策略）
2. **异常捕获**：`try/catch` 全包，业务异常转 `{ ok: false, error: 'execution_failed', detail: e.message }`
   ——工具失败不终止对话
3. **结果截断**：JSON 序列化超 8192 字符时 head/tail 切片（保留 4096+2048，中间插
   `…[truncated N chars]…`——qm head/tail 法）
4. **超时**：单工具 120s（可被 definition 覆盖 `toolTimeoutMs`），超时返回结构化超时错误
5. **signal 检查**：执行前与 IO 后各查一次 `signal.aborted`，中断即返回 `{ ok: false, error: 'aborted' }`
6. **审批短路**：`requiresApproval` 的工具在此处调 approval 协调器（由 session-factory 注入回调，
   registry 本身不依赖 approval 模块——依赖注入保持 L1 纯净）

### 6.3 runtime/approval.ts（F4）

```ts
export type ApprovalDecision =
  | { action: 'approve' }
  | { action: 'approve_with_edit'; input: Record<string, unknown> }   // 提案卡上直接编辑新值
  | { action: 'reject'; reason?: string }                              // 忽略/换一版均走 reject+reason

export class ApprovalCoordinator {
  constructor(deps: { emit: (e: AgentEvent) => void; clock: () => number; timeoutMs: number })

  /** 供 approve 回调调用：发卡并挂起（同一会话同时最多一张；重入抛内部断言错误） */
  request(scopeKey: string, tool: AgentToolDef, input: unknown, signal?: AbortSignal): Promise<ApprovalDecision>

  /** 前端决定到达；false=已过期/不存在（幂等） */
  decide(approvalId: string, decision: ApprovalDecision): boolean

  /** 超时扫描（agent-service 的定时器驱动，默认 30s 周期） */
  sweep(): number

  /** 会话取消/轮次中断：全部挂起卡补发 reject('cancelled') */
  cancelScope(scopeKey: string): void

  listPending(scopeKey: string): PendingApproval[]
}
```

语义细节（埋坑防护）：
- **「换一版」**：前端对同一工具再点「换一版」= `reject('regenerate')` + 追发新消息
  `重新生成一版`（业务定义层把该短语路由回生成工具）——harness 不实现"重新生成"，
  避免和模型循环耦合；旧卡由模型侧 tool.error 观察驱动继续对话
- **`approve_with_edit`**：编辑后的 input 经工具 inputSchema 重校验，失败按 reject('invalid_edit') 处理并 emit 对应事件
- **进程重启**：挂起 Promise 必然丢失。恢复路径：`getOrCreateSession` 发现已落库的
  `metadata.pendingApproval`（request 时同步落库，resolve 时清除）→ 下一轮 `onBeforeSend`
  注入哨兵「上一张提案卡因重启未决，已按忽略处理」→ 用户重发即可。**不尝试跨进程恢复挂起状态**（简单可 reasoning 的行为优于看似智能的恢复）
- 超时=reject('timeout')，前端卡片置灰

### 6.4 context/context-manager.ts + state-snapshot.ts（F5/F9/F11 哨兵）

```ts
export interface ContextAssemblyOptions {
  systemPrompt: string
  recentTurnsLimit?: number        // L3 缺省 20 条
  snapshotBudgetTokens?: number    // L1 快照层预算缺省 3000（超限 head 截断）
  toolResultSlice?: number         // 历史工具结果切片缺省 2048
}

export class ContextManager {
  constructor(opts?: Partial<ContextAssemblyOptions>)

  /** onBeforeSend 实现（session-factory 装配） */
  assemble(input: { history: ModelMessage[]; snapshot: string; systemPrompt: string }): ModelMessage[]

  /** 供测试与排障：纯函数化的分层视图 */
  debugLayers(messages: ModelMessage[]): { system: number; summary: number; recent: number }

  /** 崩溃恢复哨兵（qm INTERRUPTED_TOOL_RESULT 模式）：恢复的历史中，最后一条工具结果
      若无对应 assistant 回复 → 替换为哨兵文本 */
  static injectInterruptedSentinel(history: ModelMessage[]): ModelMessage[]
}
```

四层装配（每次模型调用前执行，纯函数无副作用）：
```
L1 system        = systemPrompt + '\n\n[当前项目状态快照]\n' + snapshot(截断至预算)
L2 session 摘要   = Session 自动压缩产生的 [Previous conversation summary] 前缀消息（透传，不重做）
L3 近 N 轮       = history 去掉已被 L2 覆盖的部分；工具结果超长切片
L4 当轮输入      = 用户消息
```
- 快照缓存：`buildStateSnapshot` 每轮 sendMessage 时执行一次（工具改库后由 agent-service
  在下一步前刷新一次，react 模式下最多 maxSteps 次快照刷新——业务自查成本可控，接口上
  允许 definition 返回带版本号的自校验快照）
- token 估算：`JSON.stringify(msg).length / 4`（@openharness 同款默认），可注入精确估算器

### 6.5 memory/session-store.ts（F7）

```ts
export class DbSessionStore implements AgentSessionStore {
  constructor(deps: { repo: AgentSessionRepository })

  async load(sessionId): Promise<ModelMessage[] | undefined>   // 空历史返回 undefined（触发新会话）
  async save(sessionId, messages): Promise<void>               // 全量替换（事务：delete+bulk insert）
  async delete?(sessionId): Promise<void>                      // resetSession 用
  /** 人读历史（getHistory 用；含 metadata） */
  async listHumanReadable(sessionId, limit): Promise<AgentHistoryMessage[]>
}
export class InMemorySessionStore implements AgentSessionStore { ... }   // 单测用，同文件导出
```

- 表 `agent_sessions`（§6.8）按 `seq` 全序存储；`load` 时行→ModelMessage 反序列化
  （tool-call/tool-result 落 `kind` 列区分；content 存 JSON text）
- **ALS 红线**：Repository 继承 BaseRepository，全部走 `this.scoped`——跨用户 load 返回
  undefined，save 自动填 user_id（Web 多租户隔离；Electron 单用户 userId=null 透明）
- 全量替换的事务包裹：save 失败时旧历史保留（下轮 load 仍完整），**宁可重放不可丢史**
- 消息体积防护：单条 >512KB 拒绝并截断内容 + metadata 标记（防超长章节文本打爆行宽）

### 6.6 memory/memory-service.ts（F8）

```ts
export class DbMemoryService {
  /** 提案（对话中 AI 建议 / onTurnEnd 提取）→ status='proposed' */
  async propose(item: MemoryDraft, opts?: { idempotencyKey?: string }): Promise<MemoryItem>
  async activate(id: string): Promise<MemoryItem>                  // proposed → active（提案卡采纳）
  async supersede(id: string, newItem: MemoryDraft): Promise<{ old: MemoryItem; next: MemoryItem }>  // 换一版
  async markConflicted(id: string, reason: string): Promise<MemoryItem>
  async reject(id: string): Promise<MemoryItem>                    // proposed → deleted（忽略）
  async listActive(scopeId: string, kind?: MemoryKind): Promise<MemoryItem[]>
  async search(scopeId: string, keyword: string, limit?: number): Promise<MemoryItem[]>  // LIKE，M3 前无向量
  /** L1 注入格式化（active 条目 → 紧凑清单文本，含预算截断） */
  async formatForContext(scopeId: string, budgetTokens: number): Promise<string>
}
```

状态机（唯一合法迁移，非法迁移抛 `MemoryTransitionError`）：
```
proposed → active | deleted
active   → superseded | conflicted | deleted
conflicted → active（裁决采纳）| deleted（裁决废弃）
superseded/deleted → 终态（不可再迁移；版本链经 supersededBy 可回溯）
```
- `canonicalKey` 部分唯一索引保证同 scope 同 key 仅一条 active（数据库层兜底，对齐
  uq_wf_run_mutex 先例）；冲突写入捕获唯一约束错误→自动改走 supersede 路径
- 与设定集的关系：设定集（lw_*）是**正文事实**，agent_memories 是**跨会话轻量沉淀**
  （偏好/决定/待跟进），互补不替代——故事研讨室的实体仍落 lw_*，记忆层只存决策脉络

### 6.7 runtime/session-factory.ts（F1/F6 编排）+ agent-service.ts（门面）

```ts
export class SessionFactory {
  /** 组装一个 scope 的运行体（open-harness Agent + Session + 全部装配） */
  async create(def: AgentDefinition, scopeId: string, opts: SendMessageOptions): Promise<ScopeRuntime>
}

interface ScopeRuntime {
  session: OpenHarnessSession          // 已 load（恢复语义在工厂内完成）
  agent: OpenHarnessAgent
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  refreshSnapshot(): Promise<void>     // 工具落库后由 agent-service 调
  dispose(): void
}
```

`AgentRuntimeService`（门面，实现 §5.1 接口）内部结构：
```ts
class AgentRuntimeServiceImpl implements AgentRuntime {
  private definitions = new Map<string, AgentDefinition>()
  private scopes = new LRUCache<string, ScopeRuntime>()     // key `${defId}:${scopeId}`，容量 32，TTL 30 分钟空闲
  private busyScopes = new Set<string>()                    // 互斥（对齐旧 busyProjects）
  private aborts = new Map<string, AbortController>()       // cancel 池（对齐旧 cancelAllForProject）
  private readonly approval: ApprovalCoordinator
  private sweeper: NodeJS.Timeout | null                    // 审批超时扫描（30s，unref）
  // registerDefinition / unregisterDefinition / sendMessage / cancel / getHistory /
  // resetSession / decideApproval / listPendingApprovals / subscribe / health
}
```

关键行为：
- **互斥**：sendMessage 进入即 `busyScopes.add(key)`，finally 删除；重入抛 `AgentBusyError`
  （message 与旧实现一致：「上一轮对话仍在处理中…」）
- **会话 LRU**：容量 32（防内存无界）；驱逐时若有挂起审批先 cancelScope；TTL 命中刷新
- **cancel**：abort 当前轮（signal 已贯穿 provider fetch 与工具 ctx）+ cancelScope 审批 +
  busy 位保留至本轮 finally
- **health**：给运维与工作流节点探活
- **disposeAgentRuntime**：清 sweeper/驱逐全部会话（测试隔离用）

### 6.8 memory/migrations.ts（建表）

```
agent_sessions:
  id varchar PK · conversation_id varchar(190) idx · seq integer
  role varchar · kind varchar('text'|'tool-call'|'tool-result'|'summary') · content text
  metadata text null · user_id varchar null idx · created_at bigint
  UNIQUE(conversation_id, seq)

agent_memories:
  id varchar PK · scope_id varchar(190) idx · kind varchar · status varchar
  canonical_key varchar(300) · title varchar(500) · content text
  source varchar · superseded_by varchar null · idempotency_key varchar(128) null uq
  user_id varchar null idx · created_at bigint · updated_at bigint
  部分唯一索引: (scope_id, canonical_key) WHERE status='active' AND user_id IS ?  -- 见注
```
注：SQLite 与 PG 的部分唯一索引写法差异沿用 create-workflow-tables.ts 的既有双端适配模式；
user_id 的多租户唯一性由 BaseRepository scoped 写入保证（同租户内 canonicalKey 唯一）。
迁移注册进 core/database/migrations 既有清单（幂等 CREATE IF NOT EXISTS + 索引存在性检查）。

### 6.9 runtime/event-bridge.ts（F10）

```ts
export class EventBridge {
  constructor(deps: { emit: (channel: string, e: AgentEvent) => void; streamEmit: (channel: string, delta: string) => void })

  /** open-harness Session 事件 → AgentEvent（映射表见下） */
  handle(scopeKey: string, ev: OpenHarnessEvent): void
}
```

映射表（左侧 spike 实测词汇；右侧保持旧前端协议）：

| open-harness 事件 | AgentEvent |
|---|---|
| turn.start | stage:deciding |
| tool.start | action:start（actionType=工具名，label=approvalCard.title ?? 工具名） |
| tool.done | action:done（status:'ok'，message=brief） |
| tool.error | action:done（status:'denied' 若为审批拒绝，否则 'error'） |
| text.delta | reply:content（走 streamChannel，summaryEventId 同轮固定） |
| step.done / done / turn.done | 聚合 usage；done → reply:done（suggestions） |
| compaction.start/.summary/.done | compaction（phase 对应）+ stage:compacting |
| error | error |

- 节流：text.delta 合并 30ms 窗口批量 emit（前端流畅性与事件量平衡）
- 兼容层：长文迁移期 definition.eventChannel 仍返回 `longwriting:agent:${projectId}`，
  旧前端零改动；EP 同理 `ep-agent:${episodeId}`

---

## 7. 替换现有业务 agent（迁移设计）

### 7.1 行为等价映射

| 旧（decide→act→summarize） | 新（harness） |
|---|---|
| AgentDecision JSON（reply+actions） | 模型原生 tool-call（协议升级）；`loopMode:'single-pass'` + `maxSteps:2`（决策步+总结步）行为等价 |
| VALID_ACTION_TYPES 白名单 + normalizeDecision 容错 | tools/registry 注册同名工具；schema 校验即白名单 |
| executeActions（生成→落库→ActionSummary） | 工具 execute 直接调原 service 函数（generate_overview 等 8 个动作一一对应 8 个工具） |
| stateToSummary → 决策上下文 | definition.buildStateSnapshot（函数体平移） |
| buildSuggestions → chips | definition.buildSuggestions（平移） |
| busyProjects 互斥 | agent-service busyScopes（同语义同文案） |
| cancelAllForProject | agent-service.cancel + AbortController 池 |
| lw_design_messages 存储 | agent_sessions 新表；**读兼容**：getHistory 检测旧 conversationId（`agent:${projectId}`）存在则先搬运迁移（一次性 lazy migrate，搬运后写回新 id） |
| 事件 `longwriting:agent:*` | eventChannel 参数化保持原名 |

### 7.2 迁移门禁（必须按序通过）

```
G1 模块单测全绿（§9 矩阵，语句覆盖 ≥85%）
G2 集成冒烟：真实 provider（GLM/DashScope）跑通 react 一轮 + 审批 + 恢复（本地脚本）
G3 Golden 对照：固定输入集（12 条代表性消息）下，新 harness 与旧 agent 的
   事件序列（stage/action/reply 骨架）、落库副作用、reply 非空 等价性断言
G4 影子模式：handler 同时跑旧路径（生效）+ 新路径（事件写 *:shadow 通道，落库到
   临时 scope），前端无感；观察一个版本期（真实使用一周）
G5 切换：handler 内部改调 harness（IPC channel 与事件通道名不变），旧代码保留一个
   版本期作回退开关（env LW_AGENT_BACKEND=legacy|harness）
```

### 7.3 各业务迁移点

| 业务 | 里程碑 | 变更面 |
|---|---|---|
| 长文 agent | M1 | `packs/longwriting` handler 的 agent 段内部换门面调用；定义文件 `platform/services/longwriting/agent/definition.ts`（8 工具 + snapshot + suggestions 平移）；净删 ~1200 行 |
| EP agent | M2 | 同构操作；跨包耦合注记（EP 复用 lw_design_messages）随之消除——EP 会话迁到 agent_sessions；净删 ~1400 行 |
| 故事研讨室 | M4 | 新 definition（story-room：工具=查询/保存/修改/生成大纲，全部 requiresApproval）+ 前端接原型 v3.1 交互 |
| 故事核旧向导等 | 不动 | 表单式入口保留（用户偏好不同入口），底层与 agent 共享同一批 service |

---

## 8. 与工作流引擎集成（发挥更大作用）

### 8.1 三级集成（渐进，每级独立可用）

**L1 · provider 统一（低风险）**：workflow `llm-chat` / `skill-call` 节点的模型解析改走
`ProviderAdapter.resolveModel`（替换节点内散落的 fallback 复制）——统一密钥解密、fallback 链、
SSRF 校验、结构化日志。行为不变，纯收拢。

**L2 · 新节点 `agent-chat`（核心增量）**：工作流里直接调 harness 会话。
```ts
// workflow.types.ts NodeConfigs 新增
'agent-chat': {
  definitionId: string                 // 已注册的 AgentDefinition
  /** scope 模板：可用 {{runId}}/{{node.xxx}}，多轮跨节点共享同一会话 */
  scopeTemplate: string                // 缺省 'wf-{{runId}}'
  messageTemplate: string              // 提示词（模板变量可用）
  providerConfigId?: string; modelId?: string
  /** 无人值守审批策略：auto_approve=自动通过（仅白名单工具）/ fail=遇审批即节点失败 */
  approvalPolicy: 'auto_approve' | 'fail'     // 缺省 fail（安全默认）
  maxStepsOverride?: number
}
// 节点输出：{ reply, actions: [{type,params,ok,brief}], usage } → 供 {{assign}} / 下游模板
```
- **多轮**：同 runId 的多个 agent-chat 节点天然共享会话（session-store 持久化）——
  现有 `multiTurn`（engine 内 llmHistory 数组，内存态 resume 即丢）升级为持久会话
- **resume 语义**：workflow-run 恢复时 session 已落库，`load()` 即续聊；中断哨兵保证
  不重放副作用工具
- **审批策略**：工作流无人值守，`auto_approve` 仅对 definition 中显式声明
  `autoApprovableInWorkflow: true` 的工具生效（如查询类），写库类一律 fail-fast——
  安全默认，不埋"工作流绕过人工审批"的坑
- **取消**：workflow-run 取消 → 节点 abort → harness.cancel（信号链已通）

**L3 · skills 互操作（展望，M5+）**：`src/agents/skills` 的 SkillDefinition（name/inputSchema/
execute）与 AgentToolDef 形态几乎同构——提供 `skillToTool(skill): AgentToolDef` 适配器后，
长文 agent 可直接调用 EP 能力（生成角色资产等），工作流 `agent-chat` 节点获得全部 skill 作
工具池。MCP 接入（@openharness 已带 connectMCPServers）同期评估。

### 8.2 守卫与归属

- `agent-chat` 节点属 workflow pack 的 channel 前缀（`workflow:*`）；harness 本身无 IPC 注册
- definition 注册发生在各业务 pack 的 activate()（如 longwriting activate 里
  `runtime.registerDefinition(longwritingAgentDef)`）——**包禁用=其 agent 定义不注册**，
  依赖它的 agent-chat 节点在执行时报「definition 未注册」，与 pack 语义一致

---

## 9. 测试计划（先行门禁）

### 9.1 单元测试矩阵（目标 ~130 用例；vitest + MockLanguageModelV3，SKIP_PG_TESTS=1 走 SQLite）

| 模块 | 用例组（代表性） | 数量 |
|---|---|---|
| provider-adapter | fallback 链四分支；LRU 命中/失效/provider 更新清空；未配置抛错；SSRF 拒绝内网 URL | 10 |
| tool-registry | 注册校验（重名/命名规约）；zod 校验失败结构化返回；异常捕获；截断边界（8191/8192/8193）；超时；signal 中断 | 14 |
| approval | 挂起→决定通过/拒绝/编辑；编辑后 schema 失败按 reject；超时 sweep；cancelScope 清理；重启后 pendingApproval 落库→哨兵注入；并发第二张卡断言 | 16 |
| context-manager | 四层顺序与内容；快照预算截断；近 N 轮裁剪；工具结果切片；哨兵注入（末位工具结果无回复）；debugLayers 计数 | 12 |
| session-store | save/load/delete 往返（含 tool-call 消息）；跨 user_id load=undefined（ALS）；全量替换原子性（save 中途失败旧史保留）；512KB 拒绝；旧 conversationId lazy 迁移 | 12 |
| memory-service | 状态机全 7 条合法迁移 + 4 条非法迁移抛错；canonicalKey 唯一冲突→自动 supersede；幂等键；formatForContext 预算截断 | 16 |
| event-bridge | 映射表逐条（12 种 Session 事件）；text.delta 30ms 节流合并；denied vs error 判别 | 14 |
| session-factory | 组装完整性（tools/approve/onBeforeSend/store 全挂）；single-pass 与 react 的 stopWhen；快照刷新时点 | 8 |
| agent-service | 互斥（并发第二 send 抛 AgentBusyError）；cancel 全链（模型/工具/审批）；LRU 驱逐触发审批取消；registerDefinition 冲突；getHistory limit；resetSession；health 统计；dispose 清理 | 18 |
| migrations | 双端（PG/SQLite）幂等执行两遍；部分唯一索引存在性 | 4 |
| **golden**（G3） | 12 条固定输入 × 新旧事件骨架等价、落库副作用等价 | 12 |

### 9.2 覆盖率与验收标准

- 语句 ≥85%，分支 ≥75%（agent-runtime 目录单独阈值，进 CI）
- 全部用例在 SQLite（本地/CI）与 PG（本地有库时）双跑
- **验收门禁**：G1→G5 按序通过才允许删旧代码；每步留 checklist 进 progress 文档

---

## 10. 质量属性设计（逐项）

### 10.1 稳定性
- 所有对外 async 边界 try/catch → AgentEvent.error + IPC error（不让异常裸穿 handler）
- 事件推送失败不影响主流程（emit 内部 try/catch，仅 logger.warn）
- 单例 + sweeper `unref()`（不阻止进程退出）
- 崩溃恢复三件套：session.load() + 中断哨兵 + 审批 pendingApproval 落库回放
- 会话/审批/abort 三张登记表在 dispose/异常路径全部清理（测试断言无泄漏）

### 10.2 性能
- 模型实例 LRU（§6.1）；快照每轮一次缓存；会话 LRU32 限内存
- text.delta 节流合批；工具结果截断控制上下文膨胀
- 全量替换式 save 只在轮末一次（中途不动库）
- 大会话（>200 条）load 耗时预期 <50ms（单表 seq 扫描 + 索引；M1 后压测确认）

### 10.3 安全
- ALS 多租户：session-store/memory 强制 scoped（测试有跨租户用例）
- apiKey：不落日志（logger 字段白名单）、不缓存明文（只在 LRU 的模型实例内闭合）
- SSRF：provider baseURL 沿用 validateOutboundUrl（Web 端拒绝内网）
- 审批不可绕过：approve 回调在工具 execute 之前（open-harness 契约，spike ② 验证）；
  工作流 auto_approve 需工具显式声明白名单
- 工具名白名单 + zod 入参校验（模型幻觉参数被拒）
- 输入长度上限：单条用户消息 64KB（超出截断+事件提示）

### 10.4 灵活性 / 扩展性
- L1/L2 全接口化可注入（AgentRuntimeDeps）；InMemory 实现随包导出
- CompactionStrategy / 记忆提取策略 / token 估算器 / 快照构建全部可换
- 工具协议扩展位：ai@6 middleware（tool-call repair）已预留接入点（国产端点容错）
- MCP：@openharness connectMCPServers 已在依赖内，M5 评估开关
- 定义版本号 + 事件新增字段只增不改（前端忽略未知 type/字段的约定已在旧协议验证）

### 10.5 可观测性
- createLogger('agent-runtime')：每轮一条 summary 日志（def/scope/模型/步数/工具清单/usage/耗时）
- health() 供工作流与运维；G4 影子模式的对照指标（事件数/落库数/耗时差）进 progress 记录

---

## 11. 实施里程碑（本设计批准后执行）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M0 | 骨架 git mv 至 platform/agent-runtime；装依赖（钉版本+overrides）；实现 provider-adapter / session-store / session-factory / agent-service 最小闭环；真实 provider 冒烟脚本 | G1（上述模块单测）+ G2 |
| M1 | 长文 agent 迁移（definition 平移 + handler 切换） | G3 + G4 + G5（长文） |
| M2 | EP agent 迁移（顺带解除 lw_design_messages 跨包耦合） | G3-G5（EP） |
| M3 | context 完整四层 + memory-service + onTurnEnd 提取 + 压缩调优 | 模块单测 + 压测 |
| M4 | 故事研讨室 definition + 前端接线（原型 v3.1 交互） | E2E（browser-use 脚本） |
| M5 | 工作流 L1/L2 集成（provider 统一 + agent-chat 节点） | workflow 引擎测试 + 节点单测 |

每步提交粒度 = 模块×（实现+测试），lefthook/lint/CI 全绿，progress 文档同步。
