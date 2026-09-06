# 23 · 接口契约层（Interface Contracts）

> Agent Loop Harness ｜ 2026-09-06 ｜ 状态：**已定稿（harness 的稳定契约层）**
> 定位：本文是全部 harness 模块**对外接口的唯一权威定义**。散落在 12/14/15/21/22 号
> 与 docs/design 设计稿中的接口，以本文为准（冲突处以本文为准）。
> 设计原则（用户定调）：**接口先行——接口设计合理优雅，模块内部实现有问题可重写替换。**

---

## 0. 契约纪律（所有接口共同遵守）

1. **依赖方向**：接口不 import 实现；`types` 层零依赖；L1/L2 模块互不引用
   （22 号 §3 分层）。跨模块只经本文定义的接口说话。
2. **最小面**：每个接口只暴露"必需语义"，能推导的不进接口；方法数宁少勿多
   （每个方法都是永久兼容承诺）。
3. **演化规则**：
   - 只加不改：新增可选字段/可选方法/新事件 type 不破坏旧消费者；
   - 破坏性变更必须升版本号（schemaVersion / definition.version）并留一个版本期双读；
   - 事件协议：消费方必须忽略未知 `type` 与未知字段（前端旧版兼容的既定约定）。
4. **可测试性**：所有接口可注入（AgentRuntimeDeps），单测零数据库（22 号 §5）。
5. **文件落点**：跨进程类型（前端要用）→ `src/shared/types/agent*.types.ts`；
   后端内部接口 → `src/core/platform/agent-runtime/` 各模块。ESM：类型一律
   `import type`，运行时经异步工厂。
6. **错误语义**：接口错误用类型化错误类（本文 §9），不裸 throw 字符串；
   IPC 边界转为 `{ success:false, error }` 契约。
7. **事件顺序契约**（2026-09-06 补）：同一 scope 的事件按发生序投递、不丢不重
   （进程内）；跨重连的恢复不靠事件重放，靠 `getHistory` + `listPendingApprovals`
   两个查询接口重建状态。

---

## 1. Harness 门面（业务/宿主消费的顶层 API）

```ts
/** platform/agent-runtime/index.ts —— 异步工厂（ESM 隔离），幂等 */
export interface AgentRuntime {
  // —— 定义注册（业务包 activate 时调用；pack disable 时注销）——
  registerDefinition(def: AgentDefinition): void            // 重复 id → AgentDefinitionConflictError
  unregisterDefinition(definitionId: string): void          // 挂起轮先取消
  listDefinitions(): Array<{ id: string; version: number; toolCount: number; loopMode: AgentLoopMode }>

  // —— 一轮对话（独立宿主入口；工作流宿主走 §2 AgentHost）——
  sendMessage(definitionId: string, scopeId: string, message: string,
              opts?: SendMessageOptions): Promise<AgentSendResult>
    // 契约：per-(definitionId,scopeId) 互斥。busy 时按 opts.mode（24 号借鉴 codex steer）：
    //   'reject'（缺省，抛 AgentBusyError，同旧语义）| 'queue'（排队至当前轮边界，
    //   作为 steer 输入合流注入下一轮——交互宿主推荐）| 'interrupt'（先 cancel 再发送）
  cancel(definitionId: string, scopeId: string): boolean    // 中断当前轮：模型/工具/挂起审批全链
  getHistory(definitionId: string, scopeId: string, limit?: number): Promise<AgentHistoryMessage[]>
  resetSession(definitionId: string, scopeId: string): Promise<void>

  // —— 提案卡（审批决定回流）——
  decideApproval(approvalId: string, decision: ApprovalDecision): boolean  // false=过期/不存在（幂等）
  listPendingApprovals(definitionId: string, scopeId: string): PendingApproval[]

  // —— 事件 ——
  subscribe(definitionId: string, scopeId: string, cb: (e: AgentEvent) => void): () => void

  // —— 运维 ——
  health(): { activeSessions: number; busyScopes: string[]; pendingApprovals: number }
}

export async function initAgentRuntime(deps?: AgentRuntimeDeps): Promise<AgentRuntime>  // 幂等
export function getAgentRuntime(): AgentRuntime            // 未 init 抛 AgentRuntimeNotInitializedError
export async function disposeAgentRuntime(): Promise<void> // 测试/停机：清 sweeper/会话/审批

export interface AgentRuntimeDeps {          // 全量可注入（22 号 §5）
  resolveModel?: (opts?: ResolveModelOptions) => Promise<LanguageModel>
  sessionStore?: AgentSessionStore
  memoryService?: MemoryService
  eventEmitter?: { emit(channel: string, payload: unknown): void }
  eventBus?: { publish(input: unknown): Promise<unknown> } | null   // null=仅直推（§7 双路径）
  clock?: () => number
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}
```

## 2. AgentHost（宿主契约——12 号 §5.2 原样，一字不改）

```ts
export interface AgentHost {
  loadState(): Promise<AgentLoopState | null>
  saveState(state: AgentLoopState): Promise<void>   // 落库成功才返回；失败抛错→按崩溃处理
  suspend(req: SuspendRequest): Promise<HumanDecision>
  emitTrajectory(entry: TrajectoryEntry): void      // fire-and-forget
  emitStream(event: AgentStreamEvent): void
  readonly signal: AbortSignal
}
```
两个宿主实现均为可替换件：工作流宿主（state_json/E2 + resume/E3）、独立宿主
（agent_sessions + 提案卡）。**循环本体只认识本接口**。

## 3. 工具契约（14 号修订 R2 的统一模型）

```ts
export interface AgentToolDef<TInput = unknown, TOutput = unknown> {   // 业务侧编写（zod 为源）
  // …类型全量见 platform/agent-runtime/types.ts；24 号增补：supportsParallel?: boolean（false=写类同轮自动串行）
  name: string                       // /^[a-z][a-z0-9_]{2,48}$/；pack: 前缀经注册时命名空间化
  description: string                // 模型可见，写清"何时该用"
  inputSchema: z.ZodType<TInput>
  execute(input: TInput, ctx: AgentToolContext): Promise<TOutput>      // 返回须可 JSON 序列化
  requiresApproval?: boolean         // 与 dangerLevel 取严（14 号 R2）
  dangerLevel?: ToolDangerLevel      // read | write | external-post | exec
  approvalCard?: { title: string; summary?: (i: TInput) => string; editable?: string[] }
  autoApprovableInWorkflow?: boolean // 工作流无人值守白名单（缺省 false，写库类一律 false）
}

export interface AgentToolContext { scopeId: string; rawInput: string; signal?: AbortSignal;
  logContext: Record<string, unknown> }

export interface ToolRegistry {                                          // 平台注册表（14 号）
  register(def: AgentToolDef, ns?: { packId: string }): void             // ns → name 变 pack:<packId>:<name>
  listSpecs(filter?: { source?: ToolSourceKind; packId?: string }): AgentToolSpec[]
  toLLMTools(specs: AgentToolSpec[]): LLMToolDescriptor[]                // 协议层序列化
  execute(call: AgentToolCall): Promise<AgentToolResult>                 // 校验→审批短路→执行→截断→审计（包代码直调路径）
  /** registry→loop 桥接（2026-09-06 补，P3 接线必需）：按白名单 bindings 装配
   *  LoopRunner 需要的 AgentToolDef 映射——binding 静态 config 深合并（静态键优先）、
   *  descriptionOverride 生效、审计/审批/截断经 registry 包装层。run 启动时快照，
   *  运行中改白名单不影响在途 run（14 号 §7-11）。 */
  buildToolDefs(bindings: AgentToolBinding[]): Record<string, AgentToolDef>
}
// AgentToolCall/AgentToolResult/错误码：14 号 §5.3-5.4 原样（含 binding 静态侧、resultRef 引用化）
```

## 4. 审批契约

```ts
export type ApprovalDecision =
  | { action: 'approve'; scope?: 'once' | 'session' }   // scope=session（24 号借鉴 codex Amendment）：本次批准沉淀为会话级同类免批（规范化键缓存），业务包可升级为持久规则
  | { action: 'approve_with_edit'; input: Record<string, unknown> }  // 编辑后经 inputSchema 重校验
  | { action: 'reject'; reason?: string }                             // 忽略/换一版/超时/取消均归此
// 24 号增补：PendingApproval 增加 availableDecisions: string[]（引擎声明本卡可选决定集，
// 前端零硬编码按钮）；审批缓存键 = 工具名 + 规范化入参（防同参数换包装重复问）

export interface ApprovalCoordinator {   // registry 层消费；实现可整体替换
  request(scopeKey: string, tool: AgentToolDef, input: unknown, signal?: AbortSignal): Promise<ApprovalDecision>
  decide(approvalId: string, decision: ApprovalDecision): boolean
  sweep(): number                        // 超时=reject('timeout')；agent-service 定时器驱动
  cancelScope(scopeKey: string): void
  listPending(scopeKey: string): PendingApproval[]
}
```

## 5. 循环与上下文契约

```ts
export interface LoopRunner {   // 自研手动循环（22 号 B1）；签名稳定，实现可换（含未来换回开源封装）
  run(task: AgentTask, host: AgentHost): Promise<AgentResult>
  resume(state: AgentLoopState, decision: HumanDecision, host: AgentHost): Promise<AgentResult>
}
// AgentLoopState / AgentDecision（final|tool_calls|human_request）/ 错误分类法：12 号 §4.2/§5.4/§6.5 原样

export interface ContextAssembler {                       // 每次模型调用前装配（D1）
  assemble(input: { history: ModelMessage[]; snapshot: string; systemPrompt: string }): ModelMessage[]
}
export interface CompactionStrategy {                     // vendor 自 open-harness，接口自持（B4）
  compact(context: CompactionContext): Promise<CompactionResult>
}
```

## 6. 持久化与记忆契约

```ts
export interface AgentSessionStore {                      // 独立宿主 state 落点（D2）
  load(sessionId: string): Promise<ModelMessage[] | undefined>   // 空历史=undefined；恢复显式 load()
  save(sessionId: string, messages: ModelMessage[]): Promise<void> // 全量替换、事务、宁可重放不丢史
  delete?(sessionId: string): Promise<void>
}

export interface MemoryService {                          // 15 号 §5.2 原样（+conflicted 状态）
  onTaskTerminal(evt: TaskTerminalEvent): Promise<void>
  submitCandidates(cands: MemoryCandidate[]): Promise<GateDisposition[]>
  reviewEntry(entryId: string, decision: 'approve' | 'reject', reviewerId: string, edited?: string): Promise<void>
  listPending(filter: MemoryQuery, page: PageArg): Promise<Page<MemoryEntry>>
  assemble(query: AssembleQuery, budget?: Partial<MemoryBudget>): Promise<AssembleResult>
  onVerificationCompleted(evt: VerificationEvent): Promise<void>
  runMetabolism(ops: MetabolismOps[], opts?: { dryRun?: boolean }): Promise<MetabolismReport>
}

export interface StructuralMemoryStore {                  // 15 号修订 R2（图谱融合）
  upsertNode(scopeId: string, node: GraphNodeInput): Promise<void>
  addEvent(scopeId: string, ev: GraphEventInput): Promise<void>
  addEdge(scopeId: string, edge: GraphEdgeInput): Promise<void>
  stateAt(scopeId: string, entityId: string, chapter?: number): Promise<Record<string, unknown> | null>
  edgesAt(scopeId: string, entityId: string, chapter?: number): Promise<GraphEdge[]>
  timeline(scopeId: string, entityId: string): Promise<TimelineEntry[]>
}
```

## 7. Provider 与事件契约

```ts
export interface ModelResolver {                          // A1：ai-call 之上薄适配
  resolveModel(opts?: ResolveModelOptions): Promise<LanguageModel>
  listModels(providerConfigId?: string): Promise<Array<{ id: string; label?: string }>>
}
// ToolCallingClient / prompt 降级 / 能力标记：13 号修订节契约原样

// 2026-09-06 注：EventBridge 的总线保序链/失败降级复用平台公共底座
// event-system/event-producer.ts（与 workflow-run-producer 同一骨架共用件，10 号修订节）
export interface AgentEventPort {                         // 双路径（21 号 §事件决策）
  emit(scopeKey: string, event: AgentEvent): void         // 直推 IEventEmitter；总线失败回退直推
}

// —— 24 号借鉴 codex 事件纪律 ——
// §7b 终态必达：每个执行单元（轮/工具调用/审批往返）终态事件三选一必达且字段自足
//   （reply:done / action:done(status) / error，自带失败原因；AgentResult.stopReason 同构），
//   流式 delta 可丢可合并（30ms 节流既有），终态不可丢。
// §7b 同点同序：事件外发与轨迹/领域事件落库在同一个单点函数内、先落库后外发
//   （平台事件总线自身"先 INSERT 后分发"的语义在 bus 侧，此处约定 event-bridge 侧同序）。
// §7c（v2 位，M3 前落地）：AgentEvent 增加三级 ID 链 turnId/itemId（UUIDv7 时间有序），
//   断线重连按条目快照重建而非重放增量流。
// AgentEvent 联合（旧协议兼容子集 + approval:*/compaction:* 新增）：设计稿 §4 定稿
// 平台事件映射 agentEventMap（aggregate=agent_session）：22 号 §3-E1
```

## 8. M3 预留接口（先定形，M3 才实现——12 号 §5.5 原样）

```ts
export interface Planner { decompose(task: AgentTask): Promise<AgentTask[]> }
export interface Verifier { verify(task: AgentTask, output: unknown): Promise<VerificationResult> }
export interface MemoryAssembler { assemble(spec: string, tokenBudget: number): Promise<string> }
```

## 9. 类型化错误（跨接口统一）

`AgentBusyError` / `AgentProviderNotConfiguredError` / `AgentDefinitionConflictError` /
`AgentRuntimeNotInitializedError` / `ToolDeniedError` / `MemoryTransitionError` /
`ToolProtocolError`（13 号 §5.2 kind 分类）。全部携带 `code` 字符串（IPC 边界扁平化）
与原始 `cause`。

---

## 10. 替换纪律（接口已稳定时如何换实现）

1. 新实现实现同一接口 + 通过既有契约单测（§0-4 可注入使单测即契约测试）；
2. 经 AgentRuntimeDeps 注入灰度（影子模式，G4）→ 切换（G5）；
3. 旧实现保留一个版本期作回退开关，之后删除；
4. 契约本身要改：先在本文立项（动机+迁移方案+兼容期），再动代码——**本文即接口变更的评审现场**。


---

## 11. 已知边界与扩展位（2026-09-06 深度 review 补——不满足即需先扩契约再实现）

| # | 边界 | 现状 | 演化方向（破坏性变更须走 §10-4 立项） |
|---|---|---|---|
| 1 | **会话模型**：per-(definitionId, scopeId) 单会话 | 满足长文/EP/故事研讨室（均单会话/项目） | 多会话（如多方案对比）：AgentTask 与门面加可选 `sessionId` 维度，缺省回退单会话；agent_sessions 表已带 conversation_id 天然支持 |
| 2 | **输入形态**：`sendMessage(message: string)` 纯文本（steer 排队已按 §1b mode 支持） | 三个消费者均纯文本（素材引用经工具查询） | 多模态输入：加 `attachments?: Array<{kind;ref}>` 可选参数，工具查询语义不变 |
| 3 | **用量聚合查询**：仅单轮 `AgentSendResult.usage` + 轨迹表 | 历史聚合（成本面板）从 agent_trajectories/agent_tool_calls 查（实现层，非契约） | 需要时加 `getUsage(defId, scopeId, range)` 只读查询接口 |
| 4 | **部署形态**：审批挂起态在进程内存 + pendingApproval 落库 | 单实例 Web/Electron 成立；进程重启经落库行+哨兵恢复（12 号） | 水平多实例需审批决定走事件/DB 回流（挂起 Promise 无法跨进程）——届时 ApprovalCoordinator 的 decide 改为落库驱动，接口签名不变 |
| 5 | **provider 并发/配额**：门面不做全局限流 | 单 scope 互斥已有；多 scope 并发打满 provider 属 13 号 provider 层职责 | provider-adapter 内加并发闸（对契约透明） |

**结论**：当前三大消费者（工作流 agent-loop 节点 / 长文·EP 迁移 / 故事研讨室）的完整生命周期
——注册定义、发消息、流式回复、提案卡（含编辑/换一版/重连恢复）、查询/修改设定、取消、
历史、快照注入、事件兼容、步级恢复——全部有契约覆盖；上述 5 项是明确标注的边界而非缺口。
