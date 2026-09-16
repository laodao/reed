# 系统参数配置化 + 键名命名规范（2026-09-13 用户需求）

用户原话：
1. 「maxCalls=12，这类参数，现在系统中是怎么做的，这类参数按道理应该以系统配置参数方式管理，而不是写死在代码中」
2. 「系统参数设置，这些参数名，要统一命名规范哦」
3. 三选答复：范围=**平台级一次做**；UI=**加设置页区块**；护栏=**也配置化**（"默认值很多不合理，不能改很麻烦"）+ 新增要求「**加一个开关可以关闭参数配置功能，最终参数调好之后可以选择不向用户开放**」

## 一、调查结论：同一代码库里三套做法

**A. 写死在模块里的常量（agent 参数基本都在这一类）**
`DL_TOOL_MAX_CALLS`、`DL_READ_TOOL_MAX_CALLS`、`DL_AGENT_MAX_STEPS`/`DL_TASK_MAX_STEPS`、`DL_PACE_MAX_CONCURRENT`、`DL_PLANNING_SAVE_BUDGET`/`DL_SAVE_BUDGET_MAX`、`SYSTEM_AGENT_MAX_STEPS`、`EP_AGENT_MAX_STEPS`/`EP_TOOL_MAX_CALLS`、`SUBAGENT_DEFAULT_MAX_STEPS`/`_CAP`、agent-service 的 react 6/single-pass 2、`TOOL_RESULT_MAX_BYTES`、`ARTIFACT_MAX_BYTES`、`TRANSCRIPT_MAX_MESSAGE_BYTES`、`TRAJECTORY_PAYLOAD_MAX_BYTES`、上下文窗口（读 `process.env.AGENT_CONTEXT_WINDOW ?? 24000`）。

**B. 平台级配置（早就有的正确做法）**
`wf:defaults` → `WorkflowExecutionSettings`：配置链写在注释里「节点级 → 工作流级 → settings 表 wf:defaults → WORKFLOW_DEFAULTS」，解析集中在 `engine/execution-settings.ts`（统一 clamp 到 `WORKFLOW_LIMITS`），`workflow-boot` 启动时读；另有 `eventBus:rateLimits`；通道是通用的 `settings:get/set`（加配置项不需要新 IPC）。

**C. 业务级配置** dl 空间 `pace_settings`/`review_settings`、ep 项目设置。

结论：`maxCalls` 属于 A，而它决定"这一轮活能不能干完"，系统里早有 B 这条路——**它没走，是不一致**；而且两天内被按症状改过三次（12 → 规划轮 30 → 按方案条目数派生），正是写死的代价。

## 二、命名规范（本次新增，见 `shared/constants/settings-keys.ts` 与 `shared/types/agent-budget.types.ts` 头部）

1. **存储键**：`<模块>:<对象>`；模块=单个小写单词（无驼峰、无缩写），对象=lowerCamelCase。
   例：`agent:budget`、`wf:defaults`、`ui:theme`、`event:rateLimits`。反例：`theme`（裸键）、`eventBus:rateLimits`（模块带驼峰）。
2. **顶层字段一律分组**，不平铺（`maxSteps` / `maxCalls` / `domainLearning` / `guards` / `ui`）。
3. **上限类统一 `max<对象>` 前缀**（`maxSteps`、`maxCalls`、`maxSaveBudget`、`maxConcurrentRuns`、`maxToolResultBytes`）；
   "不可超越的顶"用 `...Ceiling`（`maxSteps.subagentCeiling`）。反例：`saveBudgetMax`、`subagentMax`。
4. **单位后缀** `Bytes`/`Chars`/`Tokens`/`Ms`/`Depth`；"次数"不加后缀。
5. **子模块用全称**：`domainLearning`（不写 `dl`）、`systemAgent`；工具名保持注册名（`dl_save_concept`）。
6. **布尔**用形容词/过去分词（`enabled`、`multiTurn`）。
7. **常量命名** `<域>_<对象>_DEFAULTS` / `_LIMITS`。
8. **环境变量**仅开发期应急，`UPPER_SNAKE` 且注释写明优先级。

**唯一键名注册表** `src/shared/constants/settings-keys.ts`：`SETTINGS_KEYS`（全部键）、`SETTINGS_KEY_PATTERN`、
`SETTINGS_KEY_LEGACY`（改名映射）、`getSettingWithLegacyFallback()`（读现行键→兜底旧键）、`isRegisteredSettingsKey()`。

**护栏测试** `tests/unit/settings-keys.spec.ts`：① 注册表键名全部合规；② 无重复、旧键不撞现行键；
③ 扫源码——`settings.get('x')`/`settings.set('x')` 字面量与"会调用 settings 的文件里的 `XXX_KEY = 'x'` 常量"
必须在注册表登记（否则红）。**逼新配置走注册表，规范才不是文档里的一句话。**

## 三、`agent:budget` 契约（按规范落地）

```
agent:budget
{
  ui: { enabled }                                  // 是否向用户开放参数编辑（false=收起编辑区，配置继续生效）
  maxSteps: { research, task, systemAgent, episode, workflowAgentLoop, subagent, subagentCeiling }
  maxCalls: { byTool: {工具名→次数}, read: {读工具→次数} }
  domainLearning: { saveBudget:{concepts,relations}, maxSaveBudget, maxConcurrentRuns, contextWindowTokens }
  guards: { maxToolResultBytes, maxToolResultFieldChars, maxArtifactBytes, maxTranscriptMessageBytes,
            maxTrajectoryPayloadBytes, maxAuditPreviewChars, maxResultWalkDepth, maxDeepScanDepth }
}
```
- `AGENT_BUDGET_DEFAULTS` = **改造前写死的那些值**（不配置时行为完全不变：`dl_save_concept` 12、research 12、task 16、agent-loop 20、落库 30/40、并发 3、上下文 24000、截断 16384…）。
- `AGENT_BUDGET_LIMITS` = 代码级硬上限（配置一律夹到这里；**不随用户配置变化**，是最终防线）。护栏值可调，但只在硬上限内。
- 解析 `core/platform/agent-runtime/budget/agent-budget.ts`：`resolveAgentBudget(raw)` → `{budget, notes}`，
  非法值回落默认并记 note、超限夹取并记 note、一致性护栏（relations≥concepts、subagentCeiling≥subagent）；
  `loadAgentBudget(settings)` 带读取失败兜底（配置坏了也不会跑不起来）。

## 四、已接入（本次）

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| dl 宿主步数 | `DL_AGENT_MAX_STEPS`/`DL_TASK_MAX_STEPS` | `budget.maxSteps.research` / `.task`（每轮读一次） |
| dl 上下文窗口 | `process.env.AGENT_CONTEXT_WINDOW ?? 24000` | `budget.domainLearning.contextWindowTokens`（env 仍作开发期最高优先） |
| dl 工具频控 | `DL_TOOL_MAX_CALLS` 字面量 | `budget.maxCalls.byTool`（`dlToolMaxCalls(name, overrides)`） |
| dl 采集预算 | `DL_READ_TOOL_MAX_CALLS` 字面量 | `budget.maxCalls.read` |
| dl 落库额度/硬顶 | `DL_PLANNING_SAVE_BUDGET` / `DL_SAVE_BUDGET_MAX` | `budget.domainLearning.saveBudget` / `.maxSaveBudget`（`planSaveBudget(syllabus, defaults, max)`） |
| pace 并发 | `DL_PACE_MAX_CONCURRENT` | `budget.domainLearning.maxConcurrentRuns`（每 tick 刷新，改完下一轮生效） |

上述常量仍保留为"默认值的本地别名"（从 `AGENT_BUDGET_DEFAULTS` 派生），不再有第二处魔法数字。

**存量键迁移**（读取兜底旧键、写入只写新键）：

| 旧键 | 现行键 |
| --- | --- |
| `theme` | `ui:theme` |
| `themeMode` | `ui:themeMode` |
| `skin` | `ui:skin` |
| `language` | `ui:language` |
| `fontSize` | `ui:fontSize` |
| `disabledQuickSearchEngines` | `search:disabledQuickEngines` |
| `eventBus:rateLimits` | `event:rateLimits` |
| （已是规范形） | `wf:defaults`、`agent:budget` |

## 五、验证

| 项 | 结果 |
| --- | --- |
| `agent-budget.spec`（11 例） | ✅ 不配置=改造前一致、部分覆盖、超限夹取+说明、非法值回落+说明、一致性护栏、`ui.enabled` 语义、非法工具名忽略、读取失败兜底 |
| `settings-keys.spec`（5 例） | ✅ 注册表合规/无重复/旧键不撞；**扫源码拒绝未登记键**；兼容读取 |
| dl 包 + agent-runtime 全量 | ✅ 481 例通过 |
| settings-keys + dl + agent-runtime + platform/services | ✅ 73 文件 / 759 例通过 |
| `npm run typecheck` | 本轮改动文件无报错 |

**与本轮无关的既有失败**（其他分支在途代码）：`kb-chapter-summary.service.spec [postgres]`、`document-templates.spec`（模板注册表）、renderer 的 `StageHeaderBar*`（ep 6→5 段合并）与 `app-list`（`api.app.categories` 未实现）。

## 六、还没做（目标仍 active）

- **接入其余宿主**：ep（`episode`）、system-agent（`systemAgent`）、agent-runtime 缺省（`workflowAgentLoop` / `subagent` / `subagentCeiling`）与工具注册的 guards（截断/预览/深度）、artifacts、transcript、轨迹 payload。
- **设置页「AI 预算（高级）」区块**：字段带内置默认与硬上限、留空=默认、夹取提示；顶部「向用户开放参数编辑」开关（关=收起编辑区）；「恢复默认」按钮。
