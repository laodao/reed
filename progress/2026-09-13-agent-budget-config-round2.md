# Agent 预算配置化 · 第二轮：设置页区块 + ep/chat/护栏接入

日期：2026-09-13（承接 `2026-09-13-agent-budget-config-and-settings-naming.md`）
用户拍板：范围=平台级；UI=加设置页区块；护栏=也配置化；外加「**加一个开关可以关闭参数配置功能，最终参数调好之后可以选择不向用户开放**」。

## 一、本轮做了什么

### 1. 解析器下沉到 shared（主进程与设置页同一份口径）
- 新增 `src/shared/utils/agent-budget.ts`：`resolveAgentBudget(raw)`（默认 → 覆盖 → 硬上限夹取 + 说明）。
  **为什么下沉**：设置页要显示"生效值/被夹取说明"，若 UI 自己再算一遍 clamp，早晚出现"页面显示 40、实际跑 30"。
- `src/core/platform/agent-runtime/budget/agent-budget.ts` 只留 `loadAgentBudget()`（读 settings + 兜底），并 re-export 纯函数，既有 import 不变。

### 2. 契约补一层「仅用户显式覆盖」的表（防跨宿主串味）
不同宿主对**同名工具**的默认不同：`invoke_skill` 领域共学 6 / 系统助手 3。若让其它宿主直接读"默认+覆盖"的合并表，
聊天侧的成本闸门会被悄悄放宽。故 `maxCalls` 增加 `overrides`（只含用户显式配置过的键、已校验已夹取），
规定：**跨宿主接入读 `overrides[name] ?? 本宿主默认`**；`byTool/read` 合并表仅供领域共学与设置页展示。
（新增用例钉死：无配置时 `overrides === {}`。）

### 3. 设置页「AI 预算（高级）」区块
`src/renderer/src/components/settings/AgentBudgetSettings.vue` + `Settings.vue` 新增同名 Tab：

- 字段分四组：**单轮步数**（研究轮/任务轮/系统助手/剧集/工作流 Agent 节点/子代理缺省/子代理上限）、
  **每工具调用上限**（领域共学工具 + 采集读工具）、**检索与落库额度**（知识点/关系边/自动推进并发/上下文窗口）、
  **安全护栏**（结果截断/字段截断/产物上限/会话消息上限/轨迹上限/审计预览/遍历深度/事件扫描深度）；
- 每项显示**生效值**，提示里带内置默认与硬上限；
- **只写用户碰过的字段**（未碰过的保持"跟随默认"，将来默认值升级能吃到）；「恢复默认」写空载荷 = 全部回内置默认；
- 保存前本地解析一次，把"被夹取/回落"的说明直接显示（`⚠️ 有 N 处未按你填的值生效`）——**不静默**；
- **开关「向用户开放参数编辑」**：关掉后编辑区收起（已保存配置继续生效），开关本身留在页面上，随时可再打开；
- 提示文案如实写明生效时机：「步数/频控/额度改动下一轮生效；截断类护栏在重启客户端后生效」。

### 4. 接入其余宿主
| 宿主 | 原来 | 现在 |
| --- | --- | --- |
| 剧集制作（ep） | `EP_AGENT_MAX_STEPS`；工具上限只认 `EP_TOOL_MAX_CALLS` | `budget.maxSteps.episode`；`overrides[工具] ?? EP_TOOL_MAX_CALLS[工具]`（规划类工具也支持覆盖） |
| 系统助手（chat） | `SYSTEM_AGENT_MAX_STEPS`；`WRITE_CALL_CAPS` 硬编码 | `budget.maxSteps.systemAgent`；`overrides[工具] ?? WRITE_CALL_CAPS[工具]` |
| 工具注册表（agent-runtime） | `TOOL_RESULT_MAX_BYTES`/`_FIELD_MAX_CHARS`/`RESULT_WALK_DEPTH_LIMIT`/`AUDIT_PREVIEW_MAX_CHARS` 常量 | `deps.guards` 覆盖（`serializeToolResult(raw, guards)`）；由 `workflow-boot` 启动时从 `agent:budget.guards` 读一次（注册表是长生命周期单例，故护栏需重启生效） |

（领域共学上一轮已接：步数/上下文窗口/每工具频控/采集预算/落库额度与硬顶/自动推进并发。）

## 二、验证

| 项 | 结果 |
| --- | --- |
| `agent-budget.spec`（12 例，+1：`overrides` 语义） | ✅ |
| `tool-registry.spec`（37 例，+1：护栏可覆盖——字段截断/字节上限/遍历深度） | ✅ |
| `dl-agent-bindings.spec`（+1：**宿主路径** settings → 解析 → bindings 额度真的生效；未配置的工具仍用内置默认） | ✅ |
| `agent-budget-settings.spec`（新，5 例）：显示内置默认/配置值、只写碰过的字段、超限夹取、**开关收起编辑区**、恢复默认写空载荷 | ✅ |
| `settings-keys.spec`（5 例）+ dl/agent-runtime/chat 包 + platform 全量 | ✅ 41 文件 / 509 例（本轮相关范围） |
| `npm run typecheck` | 本轮改动文件无报错 |
| 上线核验 | 主进程 965 模块；产物含 `agent:budget`、解析说明文案与三个改名后的 settings 键；窗口已起（用户当时停在设置页） |

**与本轮无关的既有失败**（其他分支在途代码，未触碰）：`src/agents/skills/registry.ts`、`core/packs/registry.ts` 的类型错；
`workflow/tool-call.spec`（`[IPathProvider] 未注册访问器`）、`document-templates.spec`、`gossip-event-report.spec`、
`asset-service-category.spec`、`kb-chapter-summary.spec [postgres]`、renderer 的 `StageHeaderBar*`/`app-list`；
工作区里另有他人正在做的 news_* → info_source_* 改名迁移（已出现在启动日志中）。

## 三、第三轮（同目标续做）：补齐进程级限额

上一轮末尾列的"还没接线"三处，本轮全部接完——**机制**：新增进程级限额持有者
`src/shared/utils/runtime-limits.ts`（`RUNTIME_LIMITS_DEFAULTS` = 改造前各模块常量；
`setRuntimeLimits()` / `runtimeLimits()` / `resetRuntimeLimits()` / `runtimeLimitsFromBudget()`），
由 `workflow-boot` 在启动时从 `agent:budget` 注入一次。**为什么用持有者**：这些使用点在 agent-runtime
深处（artifacts / transcript / 轨迹仓储 / agent-loop 节点缺省 / 子代理工厂），逐个穿参要改 4 个宿主 + 多处签名，
而它们本就是**进程级**语义（不随会话/轮次变化）；放在 shared 是因为数据库层与平台层都要读它（避免分层倒置）。

| 限额 | 原常量位置 | 现在读取点 |
| --- | --- | --- |
| 工具产物字节 | `tools/artifacts.ts` `ARTIFACT_MAX_BYTES` | `createToolArtifactStore().save()` → `deps.maxBytes ?? runtimeLimits().maxArtifactBytes` |
| 会话流水单条消息 | `memory/transcript-store.ts` `TRANSCRIPT_MAX_MESSAGE_BYTES` | `truncateTranscriptContent(content, maxBytes?)`（新增可选参）|
| 轨迹 payload | `repositories/agent-trajectory.repository.ts` `TRAJECTORY_PAYLOAD_MAX_BYTES` | `truncatePayloadBytes()` → `runtimeLimits().maxTrajectoryPayloadBytes` |
| 工作流 agent-loop 缺省轮数 | `WORKFLOW_DEFAULTS.agentLoopMaxIterations` | `agent-loop-node` 缺省分支读 `runtimeLimits().maxWorkflowAgentLoopSteps`（节点显式 `maxIterations` 仍优先） |
| 子代理缺省步数 / 步数顶 | `tools/subagent.ts` `SUBAGENT_DEFAULT_MAX_STEPS` / `SUBAGENT_MAX_STEPS_CAP` | 新增纯函数 `resolveSubagentMaxSteps({requested, defaultSteps, cap})`：请求值 → 宿主缺省 → 进程限额，最后夹到顶 |

**生效时机**（设置页提示已按此改写）：研究/任务/系统助手/剧集的步数与频控**下一轮生效**；
护栏与「工作流 Agent 节点 / 子代理」步数需**重启客户端**（启动时装配）。

### 新增验证
| 项 | 结果 |
| --- | --- |
| `runtime-limits.spec`（新，6 例）：默认值=改造前常量、部分注入、非法值忽略、子代理顶≥缺省、`runtimeLimitsFromBudget` 映射、reset | ✅ |
| `runtime-limits-wiring.spec`（新，5 例）：transcript 截断按注入上限、显式传参优先、产物超限拒存（默认与注入两种） | ✅ |
| `subagent.spec` +1：步数决策纯函数（请求值/宿主缺省/进程限额/步数顶、注入后生效） | ✅ |
| `agent-trajectory.repository.spec` +1：payload 上限可按 `agent:budget` 覆盖（512B 注入后实测生效） | ✅ |
| 相关范围全量（shared + settings-keys + agent-runtime + dl 包 + chat 包 + 预算 UI + 轨迹仓储） | ✅ **55 文件 / 648 例通过** |
| `npm run typecheck` | 本轮改动文件无报错 |

至此目标 ①~④ 全部落地：契约与解析、dl/ep/system-agent 三宿主、agent-runtime 缺省与全部体积/截断护栏、
设置页区块（含开关与恢复默认）、TDD 与 typecheck 与进度记录。

## 四、仍未做（非本目标范围，供后续排期）

- 设置页可加「导出/导入配置」与「单项重置」（目前只有整体恢复默认）。
- `WORKFLOW_DEFAULTS.agentLoopMaxIterationsCeiling`（节点级配置上限，护栏的护栏）仍固定 500，未纳入预算。

