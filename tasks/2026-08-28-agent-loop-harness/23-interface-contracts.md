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

> ⚠️ **业务接入者勿从本节读起（2026-09-11 增注）**：本节门面 `AgentRuntime` 已实现+
> 契约测试，但生产零业务消费者（32 号登记 M8 待裁决去留）。业务模块接入的正确入口是
> **createHostKit**（36 号契约），开发指南见 `docs/development/agent-integration-guide.md`。

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
    //   逐条依次整轮执行——FIFO、各自独立终态与结果、排队上限 8 超限 fail-fast；
    //   批 4 实现注记：非"合并为单轮输入"，每个 sendMessage 保持独立 Promise 语义）|
    //   'interrupt'（取消当前轮一次，随后按 queue 同序公平等待执行——不插队）
    // 批 4 review 修订：interrupt 恢复后必须复查互斥（可重入循环），否则双轮并发
    // （同 scope 事件序破坏/历史互覆）；reset 进行中到达的消息在干净会话上执行。
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
// 批 4 实现偏差（已定稿，实现以此为准）：
//   - resolveModel/sessionStore 实现为必填（无 DB/模型时无合理缺省，fail-fast）
//   - memoryService 留待记忆批次接入；logger 用项目统一 createLogger（不注入）
//   - 追加可注入项：approvalStore / sweeperIntervalMs / sessionCacheCapacity / sessionTtlMs
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

**—— 2026-09-06 批 5 实现注记（ToolRegistry 落地，独立 review 定稿）——**
- `execute(call)` 形态：`{toolName, args, context?, signal?}`——binding 静态侧经
  `buildToolDefs` 消费（loop 形态），直调路径以 `context` 携带宿主信息（runId/nodeId/
  scopeId）；14 号 AgentToolCall 的 binding 字段由 M2 直调-带配置场景再评估（加法）。
- 加法方法：`unregister(name)` / `unregisterPack(packId)`（§1 "pack disable 时注销"所需）。
- **包装所有权分层**（深 review P1 定案）：registry 桥接产物带 `registryWrapped` 标记，
  loop 层对其跳过自身 zod/withTimeout/truncateJson——校验/超时/截断/审计归 registry
  管线（超时旋钮 = `AgentToolDeps.executeTimeoutMs`，与 loop 的 `toolTimeoutMs` 分属
  两类工具），loop 只保留审批短路 + 流事件/轨迹。防：失败被报 ok:true / 双计时器隐式
  取 min / 双重截断打架。
- 静态合并语义：**parse 后合并**（zod strip 不丢宿主静态键；静态值不经 zod——宿主侧
  可信，"静态键须在 schema 声明"的限制取消）。
- 审批缺省对齐：直调路径需批准工具无审批回调 = 拒绝（与 loop 层同一安全默认）；
  审计 approval 四值齐用（approved/rejected/not-required/auto=never 放宽）。
- jsonSchema：zod4 `toJSONSchema({io:'input'})`（.default() 不入 required）；
  派生失败/非 object 根 → 注册期 fail-fast（14 号 §3 加载期校验纪律）；版本为
  draft-2020-12（zod4 产出，14 号原文 draft-07 以此为准）。
- 结果上限按 UTF-8 字节计量（对齐 SessionStore 批 3 先例）；审计含 blocked
  （未注册调用，dangerLevel=unknown）。

## 4. 审批契约

```ts
export type ApprovalDecision =
  | { action: 'approve'; scope?: 'once' | 'session' }   // scope=session（24 号借鉴 codex Amendment）：本次批准沉淀为会话级同类免批（规范化键缓存），业务包可升级为持久规则
  | { action: 'approve_with_edit'; input: Record<string, unknown> }  // 编辑后经 inputSchema 重校验
  | { action: 'reject'; reason?: string }                             // 忽略/换一版/超时/取消均归此
// 24 号增补：PendingApproval 增加 availableDecisions: string[]（引擎声明本卡可选决定集，
// 前端零硬编码按钮）——已落地（深度 review 后）：卡与 approval:request 事件均携带；
// 审批缓存键 = 工具名 + 规范化入参（防同参数换包装重复问）

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
  // 2026-09-06 深度 review 修订：task 由宿主完整重建显式传入——state.task 是持久化
  // 摘要态（无 tools/systemPrompt），旧签名驱动循环必然 TypeError（实证）
  resume(state: AgentLoopState, decision: HumanDecision, task: AgentTask, host: AgentHost): Promise<AgentResult>
}
// 错误分类补充定稿（同日深度 review P1）：模型流以 error part / finishReason=error
// 收尾时**以 stopReason='error' 终止**（部分文本留痕历史但绝不作为 finalAnswer）；
// finishReason=length 按 final 收敛 + warn 打标。saveState 失败契约 = resolve 出
// error 结果而非 reject（门面/宿主按 stopReason 分发，不靠 catch 区分）。
// AgentLoopState / AgentDecision（final|tool_calls|human_request）/ 错误分类法：12 号 §4.2/§5.4/§6.5 原样

export interface ContextAssembler {                       // 每次模型调用前装配（D1）
  assemble(input: { history: ModelMessage[]; snapshot: string; systemPrompt: string }): ModelMessage[]
}
export interface CompactionStrategy {                     // vendor 自 open-harness，接口自持（B4）
  compact(context: CompactionContext): Promise<CompactionResult>
}
```

**—— 2026-09-06 批 6 实现注记（ContextManager 落地，独立 review 定稿）——**
- `ContextAssembler.assemble` 实现收窄为 `assemble(messages)`（L1 system 层在 loop 的
  buildSystem，不经 ContextManager）；实际 loop 消费端口为 `LoopContextPort
  = { assemble, maybeCompact }`（LoopRunnerDeps.context 可选注入）。
- `CompactionStrategy`（vendor DefaultCompactionStrategy）是上游忠实件+审计件；
  生产压缩路径为 ContextManager 守恒编排（pruneToolResults 复用 vendor + 自持
  summarize 回调），不经 CompactionStrategy 接口。
- 硬顶行为定稿（review P1-4）：摘要后仍超硬顶 → 用户保留集收缩到仅当轮输入 +
  摘要（一次性降级 + warn），不再是无行为的观测位。
- 悬空哨兵/装配修复与压缩解耦：窗口 0 = 仅装配模式（definition 未声明
  contextWindowTokens 时 ContextManager 仍装配，仅不压缩）。
- 守恒补充语义：当轮最后一条用户消息无条件保留（不占 20K 预算）；滚动压缩的
  摘要输入包含前次摘要（防跨压缩内容蒸发）；摘要门槛与触发同源（本地估算或
  模型实测任一超线）；零变更压缩返回 null（不落盘不重复发事件）。
- vendor 偏离 upstream 三处已文件内标注：载荷字段 result→output（ai@6 真实形状，
  上游同患此缺陷致剪枝恒 no-op）、保护边界初值 length→0（全史小于保护预算时语义
  反转）、无摘要模型时 warn 降级（上游 TypeError）。upstream commit 026e8d9。

**—— 2026-09-06 M1.4 实现注记（工作流宿主适配器 agent-loop 节点，22 号 §8 焊点①）——**
- 宿主能力注入位：`registerAgentLoopHarness({ registry, resolveModel }) / getAgentLoopHarness()`
  （workflow-boot 7.2 装配，getter 未装配抛错——getToolService 同纪律）。
  适配器即 `nodes/agent-loop-node.ts`，是 workflow → agent-runtime 的唯一焊接点。
- `resume` 决策语义定稿（12 号 §7-8 落地）：reject/timeout_reject → LoopRunner
  `resumeFromSuspend` 直接 `stop(human_rejected)`，节点 failed（retryable=false）；
  approve 系 → 注记注入 + 一次性授权。**P4 真模型修订**：授权匹配从"同名+同参"
  放宽为**同名一次性**（模型重发自由文本入参必逐字漂移，严格同参匹配致批准后
  再挂起死循环）；编辑批准 `approve_with_changes` 以引擎 `editedValues.input`
  覆盖入参；参数漂移 warn + 轨迹 autoApprovedArgsDrift 留痕；授权用后即焚，
  不同工具或授权耗尽后再发卡（E3 多轮不变）。
- 挂起桥定稿（探针实证 ai@6 吊流行为）：`host.suspend` = 落挂起点 state →
  commit `waiting_review` → 本地 abort 止 IO → 返回**永不 settle** 的 promise
  （悬挂链待 GC，状态冻结挂起点）；落库失败 → 回滚 suspended 标记 + 结构化
  拒绝 decision（reject 会吊死流，不可用）。
- 节点级护栏跨挂起-恢复累计：maxToolCalls 预算初值 = `state.usage.toolCalls`；
  maxDurationMs 净时长剩余窗口（12 号 §6.2：扣挂起等待，恢复段从 suspendedAt 回算）。
- 白名单 M1 形态：`toolWhitelist: string[]`（注册名直引）；`AgentToolBinding`
  富配置（静态 config/approval/maxCalls）+ 写类工具随 M2。工具目录消费 IPC：
  `wf:list-agent-tools`（preload/web channel-map/编辑器 agentTools 源四端接线）。
- 轨迹观测面：`trajectoriesSummary`（entries/byKind/toolCalls 计数）入节点输出；
  `agent_trajectories` 落表为 M1.5（当前 emitTrajectory = 摘要 + 结构化日志留痕）。
- 2026-09-07 总收口补注：审批回调 throw 在 loop 包装层收口（终态事件必达——
  并行双卡单卡断言不再裸穿，拒绝原因经 ApprovalDecision.reject.reason 透传
  hint/detail）；`AgentLoopState.accumulatedWaitMs` 为净时长护栏累计字段；
  ContextManager 压缩加无进展退避（零收益后本地估算增长 ≥1.5 倍或实测水位
  回落才重试）；门面 resetSession 失败回滚 resetting 标记（防会话永久毒化）。

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

// —— 2026-09-06 独立评审定稿（双 subagent 复核后成文，堵住反复争议）——
// 事件架构采用「双路径」为终局设计而非过渡形态：
//   UI 实时流（delta/stage/start）= 直推 IEventEmitter（至多一次、单点同序、永不落库）；
//   领域事实（action:done/approval:*/reply:done/error）= 总线（持久、审计、命名消费者）。
// 依据：delta 走总线将被限流器（agent:* 默认 20/分）静默丢弃 99% + 写放大超总线设计
// 量级 3-4 个数量级 + 重连恢复已定为快照重建（§7c）不重放 delta；而领域事件经总线
// 的审计/联动收益已全额获得，无需为前端做通道翻译（ipc/ws 通道同为至多一次，中继
// 不提升投递语义，反引入跨路径排序破坏）。
// 配套纪律：所有 emit/publish 点在 timer/Promise 链回调内必须显式携带捕获的 userId
// （ALS 已丢；Web 端无 uid 即静默丢）——PublishInput.userId 显式注入 + 冲刷包裹。
// 领域事件总线发布失败=显式接受 best-effort（审批恢复有 ApprovalStore 落库兜底）。
// 前瞻开关：若多个业务出现各自手写直推通道+timer/ALS 处理的苗头，重评通用投递通道。

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

`AgentBusyError`(AGENT_BUSY) / `AgentProviderNotConfiguredError`(AGENT_PROVIDER_NOT_CONFIGURED) /
`AgentDefinitionConflictError`(AGENT_DEFINITION_CONFLICT) / `AgentDefinitionNotFoundError`(AGENT_DEFINITION_NOT_FOUND) /
`AgentRuntimeNotInitializedError`(AGENT_RUNTIME_NOT_INITIALIZED) / `AgentRuntimeDisposedError`(AGENT_RUNTIME_DISPOSED) /
`AgentSessionResetError`(AGENT_SESSION_RESET) / `AgentScopeOwnerMismatchError`(AGENT_SCOPE_OWNER_MISMATCH) /
`AgentSessionCorruptionError`(AGENT_SESSION_CORRUPTION) / `AgentMessageTooLargeError`(AGENT_MESSAGE_TOO_LARGE) /
`ToolDeniedError` / `MemoryTransitionError` / `ToolProtocolError`（13 号 §5.2 kind 分类）。
全部携带 `code` 字符串（IPC 边界扁平化）；`cause` 透传为留待接线批的扩展位（当前
错误均在消息内携带定位信息，无丢失原始 cause 的场景）。

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
| 4 | **部署形态**：审批挂起态在进程内存 + pendingApproval 落库 | 单实例 Web/Electron 成立；重启哨兵清理已实现（忽略残留行），**ApprovalStore 的 DB 落库实现随接线批接入**（当前默认 InMemory，重启恢复链在 DB 实现落地后才真正生效） | 水平多实例需审批决定走事件/DB 回流（挂起 Promise 无法跨进程）——届时 ApprovalCoordinator 的 decide 改为落库驱动，接口签名不变 |
| 5 | **provider 并发/配额**：门面不做全局限流 | 单 scope 互斥已有；多 scope 并发打满 provider 属 13 号 provider 层职责 | provider-adapter 内加并发闸（对契约透明） |
| 6 | **SessionStore 唯一索引 NULL 语义**：`uq_agent_sessions_conv_seq` 对 user_id NULL 行不生效（两方言 NULL≠NULL，2026-09-06 批 3 实证） | 桌面端 Electron 启动即注入默认用户（非 NULL），且 sqlite 串行门整体互斥事务；Web 端各入口强制 ALS userId | 若未来出现"匿名 + 跨进程并发"形态：改表达式唯一索引 `(COALESCE(user_id,''), conversation_id, seq)`（两方言均支持；需同步处理 web synchronize 与迁移两条建表路径的索引形态一致性） |
| 7 | **scope 会话属主**：驻留会话条目（互斥锁/审批卡/Amendment 缓存/事件订阅）按首个触达者 userId 认主，跨租户同 (definitionId,scopeId) 抛 `AgentScopeOwnerMismatchError`（批 4 review 定稿） | 平台层不依赖 scopeId 全局唯一；业务定义需保证 scopeId 租户内唯一（如 story-room 的 p-xxx 项目 ID 本身按用户隔离） | 若出现合法的跨用户共享会话需求：门面加 `sharedScope` 声明位，属主校验按定义开关 |
| 8 | **queue 语义粒度**：排队消息逐条依次整轮执行（各自终态/结果），非合并为单轮输入 | API 形态 sendMessage→独立 AgentSendResult 所需；交互宿主逐条展示 | 真"合流注入下一轮"（codex steer 原语义）需循环内 steer 缓冲区：LoopRunner 加可注入 steer 钩子，门面在轮边界合流未决消息——接线批按需立项 |
| 9 | **Amendment 缓存寿命**：会话级免批缓存随驻留条目存活（空闲 30min/容量驱逐即失，不持久化） | "会话级"定位（进程内会话生命周期）；持久化升级位已在 §4 预留（业务包升级为持久规则） | 高频关键工具的免批规则走业务包持久化（M4 审批缺口批次） |
| 10 | **scope 抢占（squatting）**：驻留条目按首个触达者认主——恶意用户先触达他人 scopeId 可倒挂属主（正主被拒） | 危害为可用性（DoS）非数据；资源 ID 枚举需接线层配合（scopeId 含用户维度即可根绝） | 接线批保证 scopeId 租户内唯一（如项目 ID 本身按用户隔离）；如需平台根治：mismatch 时回收非 busy 争用条目重建 |
| 11 | **工具超时不中止底层执行**：withTimeout 仅墙钟切断，慢工具副作用可能照常落盘；aborted 轮的工具副作用不入史（步末才存），重放有重复执行风险 | 12 号"宁可重放"对幂等读工具成立；写类工具应声明 requiresApproval 走人工把关 | 循环层加 toolCallId 幂等键（24 号 availableDecisions 同批），或写类工具结果落"副作用日志"供重放去重 |
| 12 | **getHistory.timestamp 为近似值**：全量替换存储模型下为查询时刻（顺序以 seq 为准） | 前端按数组序渲染即可 | 需真实时刻：facade 维护轮边界时间线或在 metadata 列存轮次时间戳 |

**—— 2026-09-06 批 3 SessionStore 实现注记（§6 落地补充）——**
- save() 事务内分块 INSERT（500 行/批）：单语句多值 INSERT 撞 SQLite 绑定变量上限
  （32766 变量 ÷ 8 列 ≈ 4095 行），长会话（项目级 conversationId + 每步全量重写）必然
  越界；分块在**同一事务内**，原子性不变（独立 review P2，已修复并加 5000 条回归）。
- 512KB 上限按 **UTF-8 字节**计量（Buffer.byteLength）：中文场景 length 与字节差 3 倍，
  按 length 计量实际放行 ≈1.5MB，与错误文案"字节"不符（review P3，已修复）。
- InMemory 实现用 structuredClone 深隔离，对齐 DB 实现的 JSON 往返语义——两种实现
  对"调用方原地改消息对象"的观察行为一致。
- 损坏行（JSON 解析失败）/ seq 断档 → 拒绝加载（fail-fast 带定位），绝不静默跳过：
  跳过中段消息会破坏 tool-call 配对导致后续模型调用 400。
- 旧业务会话（lw_design_messages 等）的迁移读取属业务装配层职责，平台存储不耦合
  业务表；迁移期由业务方接线时预灌（与 §8 焊接点 4 的接线方向一致）。

**结论**：当前三大消费者（工作流 agent-loop 节点 / 长文·EP 迁移 / 故事研讨室）的完整生命周期
——注册定义、发消息、流式回复、提案卡（含编辑/换一版/重连恢复）、查询/修改设定、取消、
历史、快照注入、事件兼容、步级恢复——全部有契约覆盖；上述 5 项是明确标注的边界而非缺口。

---

## 12. M2 观测面与工具生态契约增补（2026-09-07，25 号）

### 12.1 轨迹落库（M1.5 兑现）
- `AgentTrajectoryRepository`（agent-trajectory.repository）：`appendBatch`（确定性 id `tr_<scopeKey>_<seq>` + orIgnore 幂等）/ `maxSeq`（**跨租户裸查**——scopeKey 全局唯一，seq 语义与租户无关）/ `listByScope`（scoped）/ `deleteByRunRaw`（deleteRun 级联，属主校验在 run 服务）/ `deleteByScope`（scoped，会话重置级联）。
- `TrajectorySink`（agent-runtime/trajectory/sink）：append 入缓冲（永不 throw）→ flush 同步快照屏障批写（chained 串行；失败批丢弃只 warn）。flush 点 = step-end saveState 搭车 / 挂起提交前 / 节点终态；seq 首批从 maxSeq 续接。
- scopeKey 约定：workflow = `<runId>:<nodeId>:<iterationIndex>`；session = `session:<definitionId>:<scopeId>`。

### 12.2 工具审计
- `agent_tool_calls` 表 + registry audit sink（workflow-boot 装配）：runId/nodeId 来自 `AgentTask.runtimeContext`（宿主填 runId/nodeId/iterationIndex 或 sessionKey）→ `AgentToolContext.logContext`；toolCallId 经 `AgentToolContext.toolCallId` 透传（与轨迹 tool_call 配对）。
- `AgentToolContext.credentialId`：宿主绑定凭据引用位（binding.credentialId 经 wrapForLoop 下传；custom-tool-adapter 执行时 `ctx.credentialId ?? tool.credentialId` 注入 ToolService；LLM args 不参与凭据决策）。

### 12.3 工具白名单 binding（配置形态变更）
- `toolWhitelist: Array<string | AgentToolBinding>`（向后兼容：string 归一为 {tool}）。归一入口 `normalizeToolWhitelist`（agent-loop-node）：maxCalls 正整数收口 / config 须 plain object / approval 枚举 / **'never' 必须伴随 approvalNeverConfirmed=true 否则降级 inherit**（持久化通道不能只凭 approval 字段关闭人工审批）。
- AgentToolRegistry.register 第二参扩展：`{ packId }` | `{ source }`（'node' 节点即工具 / 'tool' 自定义工具桥）。

### 12.4 查询面（双端成对）
- IPC `wf:get-node-trajectories {runId, nodeId, iterationIndex?=0}` → `AgentTrajectoryRow[]`（seq 升序）；preload `workflow.getNodeTrajectories`；Web `GET /api/workflow/run/:runId/trajectories?nodeId=&iterationIndex=`（requireAuth + 租户 404）。
- `getRunDetail` 返回增补 `tokenUsage: { promptTokens, completionTokens, toolCalls, billedNodes, byNode }`（output_json.usage 聚合；byNode 同 nodeId 多轮 last-wins——观测口径注记）。
- `deleteRun` 增属主校验（scoped getById 非属主抛错）——级联含 journal/轨迹/审计三路 raw 删除。

### 12.5 provider 契约
- `createModel` 按 `template.category` 分派：anthropic/google → 原生 SDK（@ai-sdk/anthropic、@ai-sdk/google 动态 import）；官方根地址省略 baseURL（SDK 规范路径），自定义地址剥尾斜杠透传；其余类别 → openai-compatible。
- ⚠️ 红线复述：**模块内禁用运行时 `require('@core/...')`**——vite 只重写 import 语句，产物中别名不可解析（defaultLookup 曾因此使 agent-loop 在真实应用不可用）；延迟绑定一律 `await import`。
