# 36 · HostKit：宿主装配套件契约（2026-09-08）

## 0. 动机：五份复制的组装配方 + 纪律漏项

业务宿主要跑一轮 Agent，需要把七个零件手工拼起来（LoopRunner / TrajectorySink /
SessionStore / ContextManager / 审批桥 / RunRegistry / 记忆装配）。这套配方在五个
宿主里各写了一遍，且四大能力纪律（上下文/记忆/规划）没有代码强制——各宿主现状：

| 约定 | 聊天 | 任务树 | LW | EP | agent-loop 节点 |
|---|---|---|---|---|---|
| `turn_start` 留痕 | ✅ | ❌ | ❌ | ❌ | ❌ |
| RunRegistry 登记（工作台徽标/停止） | ✅ | ✅ | ❌ | ❌ | ❌ |
| ContextManager 窗口化 | ❌ | ✅ | ✅ | ✅ | ❌ |
| 记忆装配 | L0+L1 | 服务层注入 | 双通道 | **stub（漏项）** | ❌ |
| `memory_assembly` 留痕 | ❌ | ✅ | ❌ | ❌ | ❌ |

EP 的 stub 与聊天的漏接 ContextManager 是「复制粘贴漏零件」的实例——编译不报错、
运行不报错、只有对照纪律清单才能发现。

## 1. 方案：配方沉淀为工厂，四大能力默认内置

`createHostKit<TTurn>(config, deps)` 位于
`src/core/platform/agent-runtime/host/host-kit.ts`（platform 层，禁 import packs）。
 kit 承接**装配脊柱**（宿主间真正同构的部分），业务只声明差异：

kit 内置（宿主不再手写）：
1. `TrajectorySink` 创建 + `turn_start` 统一轮次标记（含 systemPrompt 快照——
   工作台「查看上下文」对所有宿主生效）；
2. **记忆装配**（四大能力②）：L0 systemLine → 结构化知识提供方（平台注册表，
   scope 匹配）→ 飞轮召回（scope 有=L1/L2/L3 分层，无=用户级 L1）；结果统一
   `memory_assembly` 留痕 + 拼入系统提示词 `[相关经验（来自知识飞轮，供参考）]`；
3. **上下文管理**（四大能力①）：ContextManager 默认创建（窗口缺省 32K，
   env 可调），接入 LoopRunner；
4. `AgentHost` 骨架：loadState（业务权威历史优先 / 会话存储续聊+sanitize 双形态）、
   saveState（存储+flush）、emitTrajectory/emitStream 业务挂钩；
5. RunRegistry 登记/结算 + 内外层 abort 桥（外层已中止同步短路——review P1-1 形态）；
6. 任务规划/工作流规划（四大能力③④）：由工具白名单携带，kit 不做特殊逻辑——
   规划是工具、调用由 agent 自主决定（28 号定案语义）。

业务注入（差异面）：
`definitionId / scopeKey / tools / resolveModel / systemPrompt / snapshot /
seededHistory / maxSteps / memory 配置 / requestApproval / runLabel / onStream /
onTrajectoryEntry / runtimeContext / modelPreference`。

## 2. 契约（TS 形态，代码为准）

```ts
interface HostKitConfig<TTurn> {
  definitionId: string
  scopeKey: (turn: TTurn) => string
  tools: (turn: TTurn) => Record<string, AgentToolDef>
  resolveModel: (o?: { providerConfigId?: string; modelId?: string }) => Promise<LanguageModel>
  systemPrompt: (turn: TTurn) => string              // 基础提示词；[相关经验] 段由 kit 追加
  snapshot?: (turn: TTurn) => string                 // buildSystem 拼接的当轮状态快照
  seededHistory?: (turn: TTurn) => ModelMessage[]    // 业务权威历史；缺省走会话存储续聊
  maxSteps: number
  contextWindowTokens?: number                       // 缺省 32_768
  memory?: {                                         // 缺省 = 用户级 L1 top3
    scope?: { bizModule?: string; projectId?: string } | null
    recallText?: (turn: TTurn) => string             // 缺省 turn.input
    topK?: number
    structured?: { maxSegments: number; maxChars: number } | false  // 缺省 {2,600}
    systemLine?: string                              // L0 行（聊天宿主形态）
  } | null                                           // 显式 null = 关闭（须在本文件登记理由）
  requestApproval?: (tool, input, call) => Promise<ApprovalDecision>
  runLabel?: (turn: TTurn) => string
  onStream?: (turn: TTurn, event: AgentStreamEvent) => void
  onTrajectoryEntry?: (turn: TTurn, entry: TrajectoryEntry) => void
  runtimeContext?: (turn: TTurn) => Record<string, unknown>
  modelPreference?: (turn: TTurn) => { providerConfigId?: string; modelId?: string }
  /** 会话存储语义：observation=失败仅告警（业务表权威，缺省）；authority=失败上抛 */
  sessionStoreCritical?: boolean
}

interface HostKitDeps {
  trajectoryPort: TrajectoryAppendPort | null
  sessionStore?: AgentSessionStore | null
  flywheel?: Pick<MemoryFlywheel, 'assemble' | 'assembleUserLevel'> | null  // 业务侧注入（getMemoryFlywheel）
  contextOverride?: LoopContextPort   // 单测注入口
}

createHostKit(config, deps).runTurn(turn: TTurn, opts?: { signal?: AbortSignal }):
  Promise<AgentResult & { memoryLines: string[]; systemPrompt: string }>
```

## 3. 明确不收敛（本批）

- **agent-loop 工作流节点**：挂起/恢复 + 时长护栏 + node state_json 语义自成一体，
  硬套 kit 会造出 20 参数上帝对象（抽象边界按真实消费者数划定的反面）；
- **任务树执行器**：四大能力已齐（无纪律缺口），且记忆行来自 AgentTaskService
  层计算——迁移属纯重构，排下批；
- 消息生命周期（AI 占位消息/终稿落库/业务表写入）、流事件通道映射、审批协调器
  构造——本就是业务差异面，不入 kit。

## 4. 迁移矩阵

| 宿主 | 本批 | 附带修复 |
|---|---|---|
| EP | ✅ | **记忆 stub 补齐**（scope=episode-production:projectId）+ turn_start/registry/留痕 |
| LW | ✅ | memory_assembly 留痕 + turn_start + registry（图谱双通道保真） |
| 聊天 | ✅ | **补 ContextManager** + memory_assembly 留痕 |
| 任务树执行器 | 下批 | 无纪律缺口，纯重构 |
| agent-loop 节点 | 不迁移 | §3 理由 |

## 5. 演化纪律

- kit 是**纯增量**：不改动 23 号任何既有契约（LoopRunner/AgentHost/Registry 语义不变）；
- 新宿主接入默认走 kit；绕过 kit 手工组装须在本文档登记（下一个「评审现场」）；
- `memory: null` 的关闭项同样须登记——四大能力纪律由「默认开启 + 关闭留痕」保证。

## 6. 对抗评审修复与行为备案（2026-09-08）

修复（评审 P1×2/P2×5，全部落地并有回归锚点）：
- P1-1 通道A topics 语料与飞轮召回语料分离：`memory.topicsText`（LW 传用户消息，
  防 `stateToSummary` 前缀污染 60 字主题窗口）；
- P1-2 `memory_assembly` 留痕 kind 由 `decision` 改为语义化 `memory_assembly`
  （kit 与任务执行器统一）——`decision` 形态曾被工作台「执行步骤」统计误计每轮 +1，
  且视图渲染分支不可达；视图按 name 双兼容旧轨迹行；
- P2-1 循环外异常的 RunRegistry 结算携带 error 原因；结算先于广播、flush 先于结算；
- P2-2 记忆装配整段容错（scope/topicsText 解析失败降级为空，不炸轮）；
- P2-3 EP 保留 `EP_AGENT_CONTEXT_WINDOW` 旋钮（缺省回落 `AGENT_CONTEXT_WINDOW`）；
- P2-5 runMetadata 单次求值。

行为备案（接受的变化）：
- **统一记忆段头**：LW 系统提示词记忆段头 `[相关经验]` → `[相关经验（来自知识飞轮，供参考）]`
  （与聊天宿主统一；对模型语义等价）；
- **工作台停止覆盖 LW/EP**：kit 统一 RunRegistry 登记——工作台停止按钮现在可中止
  LW/EP 会话的内层循环 signal；LW 业务侧 `cancelAllForProject` 副通道不触发，
  不响应 signal 的长工具（write_chapter 900s）会跑到自身超时（与任务执行器同语义）；
- **turn_start 广播体积**：系统提示词快照最大 8KB/轮，经 `ac:trajectory` 实时广播
  （`slimTrajectoryForBroadcast` 只裁 args；频率=每轮 1 条，与轨迹落库同量级，接受）；
- **轨迹条目增量**：LW/EP 轨迹新增 turn_start/memory_assembly 各 1 条/轮
  （此前无轮次标记——工作台时间线与「查看上下文」对全宿主生效的代价，接受）。

测试：host-kit.spec 14 条（turn_start/记忆双通道/topics 分离/registry 结算映射/
异常结算/sessionStoreCritical/onEntry 广播/abort 桥）；三宿主迁移回归
chat 16 + LW 10 + EP 54 全绿。

## 关闭登记：知识飞轮整体停用（2026-09-12，用户拍板）

- **范围**：飞轮全链暂停——蒸馏（distillFromTask）、落库前模型复核（review）、代谢
  （archiveStale）、宿主召回装配（assemble/assembleUserLevel）全不启动；
  `getMemoryFlywheel()` 返回 null，HostKit 走既有 null 降级形态（无飞轮召回，
  `memory_assembly` 留痕随之消失）。结构化知识提供方（图谱双通道）**不受影响**。
- **停用理由**：产出渠道单一（仅任务树成功蒸馏+手工），项目级知识与长文既有
  结构化存储（共识账本/圣经/图谱）冗余；召回质量控制（相关度、分层语义）未达
  可用线——六扇门复盘实证跨域串扰。待深度调研业内主流 memory 方案后重做再开。
- **重开方式**：`AGENT_MEMORY_FLYWHEEL=on`（白名单式开关，其余值一律停用）。
  表数据保留（清空为一次性操作，与开关解耦）。
- **实现**：workflow-boot 构造闸 `isMemoryFlywheelEnabled()`；记忆相关 IPC
  （agent-tasks.handler）返回「已停用」明示错误。
