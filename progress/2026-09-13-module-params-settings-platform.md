# 参数设置平台化（多模块 Tab）· 第二轮

- 日期：2026-09-13
- 触发：用户「这个功能应该叫参数设置，界面内按照模块应该有多个 tab，每个模块有一个 tab，把每个模块的相关参数设置都要做成这类参数设置功能。」
- 前置：第一轮 `2026-09-13-agent-budget-config-and-settings-naming.md`（把 agent 侧写死参数做成 `agent:budget` 一处配置 + 命名规范）

## 一、这一轮要解决什么

第一轮只做了**一个**区块：「AI 预算（高级）」，里面 40 多个参数挤在一起，且只覆盖 `agent:budget` 一个键。
用户要的是**平台级通用能力**：按模块分 Tab，每个模块的相关参数都能在这里调。

盘点时发现的三个真问题（都影响用户能不能自救）：

1. `wf:defaults`（工作流全局执行设置）**配置链早就存在，但界面上没有任何写入入口** —— 只能手工改库，
   而且只在 boot 读一次，改完还得重启。等于一个死开关。
2. `agent:budget.guards.maxDeepScanDepth` 第一轮**登记了却没有任何读取点**
   （`payload-guard.ts` 用自己的常量 8）—— UI 上的"假旋钮"，违反"登记的参数必须真的有人读"。
3. 同名的护栏语义被写死在多处：事件 payload 体积上限 `MAX_PAYLOAD_BYTES`（64KB）、会话工作集上限等。

## 二、做了什么

### 1. 通用框架（新增，主进程与设置页共用一份口径）

| 文件 | 作用 |
| --- | --- |
| `src/shared/types/module-params.types.ts` | 声明式参数契约：`ModuleParamDefinition`（= 一个 Tab）、分组、参数（`number`/`boolean`/`numberMap`）、生效时机、跨字段护栏；以及设置页直接渲染的视图模型 `ModuleParamEntry` |
| `src/shared/utils/module-params.ts` | 通用解析：默认 → 覆盖 → 硬上限夹取 → 跨字段修正，非法值回落并记说明；路径读写、`pruneEmptyObjects` |
| `src/shared/constants/module-params/*.params.ts` | 各模块的参数登记表 + `index.ts` 总表（Tab 顺序 = 数组顺序） |
| `src/core/platform/settings/module-params.service.ts` | 宿主侧读取入口：`loadModuleParams` / `loadModuleParamTree` / `loadAllModuleParams`（读失败回落默认并记说明） |
| `src/renderer/src/components/settings/ModuleParamsSettings.vue` | 「参数设置」页：平台开关 + 模块 Tab（Tab 列表来自登记表，**前端不写死**） |
| `src/renderer/src/components/settings/ModuleParamPanel.vue` | 单模块面板：按 `kind` 选控件，逐项显示内置默认/硬上限/生效时机，支持「跟随默认」与「恢复本模块默认」 |

**关键设计**：Tab 按**模块归属**分，不按 settings 键分。一个模块的参数可以分布在多个键/路径下
（参数用 `settingsKey` / `pathPrefix` 声明存放位置，缺省继承模块级）；反过来一个键也可以被多个模块共用
（`agent:budget` 被 5 个模块用到）。这直接决定了下面这条保存纪律。

### 2. 保存纪律（多模块共用一个键时不互相覆盖）

设置页每个模块的记忆载荷是"读回来的整份键载荷"。若直接把整份写回，
后保存的 Tab 会**覆盖先保存的 Tab**（同一个 `agent:budget` 被 5 个 Tab 编辑）。
做法：**保存前现读该键最新载荷，只把本模块用户碰过的字段合并进去再写回**；没碰过的字段一律不写
（保持"跟随内置默认"，将来默认值升级能吃到）。`ModuleParamPanel.vue` 的 `save()` 与用例
`保存前现读最新载荷：别的 Tab 刚写进同一个键的字段不会被覆盖` 钉死这条。

### 3. 本轮落地的模块 Tab（6 个）

| Tab | 参数（本轮） | 存储键 |
| --- | --- | --- |
| AI 运行时 | Agent 节点/子代理步数、安全护栏（体积/截断/深度） | `agent:budget` |
| 领域共学 | 研究轮/任务轮步数、每工具调用上限（含自定义工具）、落库额度（知识点/关系边/硬顶）、自动推进并发、上下文窗口 | `agent:budget` |
| 系统助手 | 系统助手单轮步数 | `agent:budget` |
| 剧集制作 | 剧集制作单轮步数 | `agent:budget` |
| 工作流 | 单次运行最长时长、循环迭代、单节点执行次数、并行节点、重试次数、输出截断、运行级工具调用预算、**全局并发运行数**、LLM 节点共享上下文 | `wf:defaults` |
| 事件系统 | 事件载荷体积上限、嵌套扫描深度 | `agent:budget` |

按归属分 Tab 的一处体现：`maxCalls.byTool`（"每个工具一轮能调几次"）放在**领域共学**
Tab —— 因为那张默认表本来就是领域共学宿主的表；提示里写明"这里设的值对同名工具的其它宿主同样生效"。

### 4. 三处真接线（不是只加 UI）

1. **`wf:defaults` 改「每次运行前现读」**：`workflow-boot.ts` 不再 boot 读一次存快照，改为把
   **读取器**传给 `WorkflowRunService`；服务层 `effectiveSettings()` / `maxConcurrentRuns()` 现读。
   → 设置页保存后**下一次运行即生效**（不用重启）。同时补上一直没被读的 `maxConcurrentRuns`：
   它只认全局层（并发是平台级护栏，单个工作流不能在 `definition.settings` 里抬高它），并夹 `WORKFLOW_LIMITS`。
2. **`maxDeepScanDepth` 从"假旋钮"变成真参数**：`payload-guard.ts` 改读进程级限额持有者
   （`shared/utils/runtime-limits.ts`），并把事件 payload 体积上限也纳入同一链
   （新增 `guards.maxEventPayloadBytes`，默认 64KB = 改造前常量）。启动时由 `workflow-boot` 注入。
3. **`agent-budget` 解析改为"装配通用解析结果"**：`shared/utils/agent-budget.ts` 不再自己写 clamp，
   而是遍历用到 `agent:budget` 的登记表模块、深合并它们的生效值树，再补 `maxCalls.overrides`
   （只含用户显式设过的键，跨宿主接入读它）。**主进程与设置页从此不可能给出两个不同的数**。

### 5. 第一轮遗留项的处理

- `agent:budget.ui.enabled`（是否向用户开放参数编辑）→ 提升为平台级 `ui:params.enabled`
  （原位置在 `agent:budget` 里已不合语义）。读取时兼容旧位置，保存一律写新键。
- 「AI 预算（高级）」区块与 `AgentBudgetSettings.vue` 已被通用渲染取代并删除（不留两套表单）。
- 顺手清掉一个死常量：`SYSTEM_AGENT_MAX_STEPS`（第一轮改成读 `budget.maxSteps.systemAgent` 后已无人读）
  → 改名 `SYSTEM_AGENT_DEFAULT_MAX_STEPS` 并从 `AGENT_BUDGET_DEFAULTS` 派生，避免"两份默认值"。

## 三、验证

- 新增用例：
  - `tests/unit/shared/module-params.spec.ts`（20）：登记表合规（键名已注册、路径唯一、label/hint 必填、
    默认 ≤ 硬上限、**默认值必须等于各域 `*_DEFAULTS` 常量**防两处漂移）+ 解析纪律 + `numberMap` 合并口径 + 保存口径。
  - `tests/unit/renderer/components/module-params-settings.spec.ts`（12）：Tab 来自登记表、平台开关写 `ui:params`
    并兼容旧位置、显示内置默认、只写碰过的字段、**现读合并防覆盖**、「跟随默认」删除字段、
    「恢复本模块默认」不动别的模块、超上限提示、布尔/记录型渲染。
  - `tests/unit/core/platform/workflow/global-settings-provider.spec.ts`（7）：全局层现读（先 100 后 200 两次运行取值不同）、
    优先级 definition 覆盖全局、读取器抛错回落快照、并发上限现读 + 只认全局层 + 夹硬上限。
  - `payload-guard.spec.ts` +3：体积上限/扫描深度注入后立即生效，未注入时仍是 64KB。
  - `agent-budget.spec.ts`：删除已迁移的 `ui` 开关用例，补"登记表新增字段自动进入预算"用例。
- 回归：`settings-keys` / `agent-runtime` / `domain-learning` / `shared` / `event-system`
  **65 文件 754 例全通过**；`renderer/components` + `renderer/views` + `episode-production` + `chat`
  + 新工作流用例 **91/94 通过**（失败 3 例是既有无关失败 `app-list.spec.ts`，见下）。
- typecheck：本轮新增/改动的文件**无报错**（仓库存量报错与其它会话在途改动仍在，未触碰）。
- dev 实例已重启（主进程改动必须重启；renderer 走 HMR）。

## 四、四份调研报告（后续排期的输入）

本轮为了"每个模块都覆盖"，先派了 4 个只读调研把**各模块真正写死的可调参数**盘出来（含读取点 `文件:行`、
建议默认/硬上限、生效时机、接线难度），结论要点：

- **工作流**：真正写死约 45 处；A 组已在本轮落地 9 项（执行护栏 + 并发）。其余按域分组
  （`crawl` 抓取礼貌、`polling` 长任务轮询、`codeSandbox`、`trigger` 调度、`datasource` 连接池、
  `retrieval`、`journal`、`draft`、`tools`、`systemAgent`、`ui`）待接；节点/驱动侧读的是编译期常量，
  免重启需要一个"工作流运行参数访问器"（可照抄 `runtime-limits` 的持有者范式）。
- **剧集制作 / 长文写作**：约 60% 是"模块常量 → 读设置值"的低难度替换。**接线前必须先裁决**：
  `src/renderer/src/stores/episode-production/project.store.ts` 的
  `backgroundMusicEnabled/Volume`、`defaultShotDuration`、`defaultTransitionDuration`
  是**定义后零读取点的死配置**——写进设置页会造出"改了没效果"的旋钮，应先决定删掉还是补实现。
  另有一批**一致性缺陷**必须先裁决再配置化（关键帧数 3 vs 5、分镜时长 3/4/5、剧集原文下限 30 vs 500、
  视频默认时长 4 vs 5），否则会把错误默认值固化。
- **领域共学 / 知识库 / 素材图片**：`learning:defaults`（历史条数/图示上限/代码运行超时/推进调度）、
  `knowledge:retrieval`（检索条数/阈值/分块/摘要并发）、`asset:limits` / `image:polling` / `favicon:fetch`
  是下一批。命名硬约束：settings 键模块段只允许 `^[a-z]+$`，所以 `domainLearning:`/`knowledgeBase:` 非法，
  要用 `learning:` / `knowledge:`（载荷内字段仍用全称）。
- **Agent 上下文记忆 / 工具运行时 / 事件系统 / 系统助手 / 画像**：`context-manager` 的 5 个 token 预算
  （构造 deps 位已存在，接线最省事）、`agent:tools`（执行超时/产物回查窗口）、`event:rateLimits`
  （**载荷是裸数组，与通用解析器不兼容，必须先对象化**，否则"看着能配、实际没生效"）、
  `chat:systemAgent`、`portrait:prompt`。
- 框架已知缺口（登记时注意）：不支持小数（统一按整数百分比登记，读取点 /100）、不支持数组/文本
  （事件退避数组、限流规则表、画像提示词文本需另设计，画像提示词建议走已有的
  `portrait_prompt_templates` 表）。
  → **布尔开关已支持**（第六轮）：`param-holder` 新增 `createFlagHolder` /
  `pickBooleanFields`，与数字持有者分开——数字持有者会对字段做 `Number()`，布尔进去会被静默当 0/1
  （`'false'` 也会变成真），那比"不支持"更危险。首个使用者：`knowledge:summary.retryFailed`。

## 四、第二轮（同一目标续做）：免重启的参数生效通道 + 工作流参数第二批

### 1. 平台能力：settings 保存后**重新注入**（`shared/utils/settings-reload.ts`）

第一轮把"进程级、启动时装配"的参数如实标成"改完需重启"。既然这些使用点本来就是在用时现读持有者，
那就没必要让用户重启——**保存之后重新注入一次**即可：

- `registerSettingsReloadHook(name, fn)`：装配方（`workflow-boot`）登记；
- `settings:set` 处理器落库成功后 `runSettingsReloadHooks(key)`；
- 纪律：**单个钩子抛错绝不让保存失败**（配置写进去了才是关键），只记日志。

于是这些参数从 `restart` 变成 `immediate`（设置页的生效时机提示已同步改准）：

| 参数 | 重新注入的东西 |
| --- | --- |
| `agent:budget` 的护栏与步数 | 进程级限额持有者（体积/事件载荷/agent-loop 与子代理步数）+ 工具注册表护栏（新增 `AgentToolRegistry.applyRuntimeOverrides`） |
| `wf:defaults` | 工作流运行参数持有者（抓取礼貌/长任务轮询/代码沙箱超时） |

### 2. 工作流第二组：抓取礼貌 / 长任务轮询 / 代码沙箱（11 项，全部真接线）

新增 `shared/types/workflow-params.types.ts`（分组默认值与硬上限，**数值仍引用
`WORKFLOW_DEFAULTS`/`WORKFLOW_LIMITS`**，不另抄一份）+ `shared/utils/workflow-runtime-params.ts`
（进程级持有者；解析直接调 `resolveModuleParams(WORKFLOW_PARAMS, …)`，**与设置页同一口径**）。

接线点（把模块常量换成"运行参数现读"）：

| 参数 | 原读取点 | 现在 |
| --- | --- | --- |
| `crawl.delayMsMin/Max`、`hostConcurrency` | `nodes/http-politeness.ts` | 读持有者（同站并发对**新建**节流器生效，故标 restart） |
| `crawl.httpRequestTimeoutMs` | `nodes/http-fetch.ts`、`extra-nodes.ts`、`news-nodes.ts`(×2)、`tools/node-tool-adapter.ts` | 读持有者 |
| `polling.kbIngest*` | `nodes/ai-nodes.ts`（知识库入库等待） | 读持有者 |
| `polling.image*` | `nodes/ai-nodes.ts`（图像生成等待） | 读持有者 |
| `polling.voiceClone*` | `nodes/voice-clone-nodes.ts` | 读持有者 |
| `codeSandbox.timeoutMs` | `nodes/code-nodes.ts`、`tools/agent-builtin-tools.ts` | 读持有者 |

顺手修掉两个调研发现的缺陷：
- **代码沙箱超时"上限即默认"**：以前 `WORKFLOW_LIMITS.codeTimeoutMs`（5s）同时当默认值和上限，
  节点想配更长也会被夹回 5s。现在默认 `WORKFLOW_DEFAULTS.codeTimeoutMs = 5s`、上限 60s。
- **抓取间隔下限没有上限**：新增 `WORKFLOW_LIMITS.crawlDelayMsMin`，并加了
  `delayMsMin ≤ delayMsMax` 的跨字段护栏（配错自动把下限收到上限并在页面说明）。

### 3. 本轮验证

- 新增用例 20 个：`tests/unit/shared/settings-reload.spec.ts`（5，含"钩子抛错不影响保存"）、
  `tests/unit/shared/workflow-runtime-params.spec.ts`（11，含"解析走登记表、页面显示=节点实际用"）、
  `tests/unit/electron/ipc/settings-handler-reload.spec.ts`（4，走真实 `registerSettingsHandlers` +
  `invokeIpc`，钉死"保存 → 钩子被调用、且钩子读到的是已落库的新值"）、
  `http-politeness.spec.ts` +3（不传 opts 也按注入值等待；注入并发对新建节流器生效；节点 config 仍优先）。
- 回归：`core/platform/workflow` + `agent-runtime` + `settings-keys` + `shared` + `renderer/components`
  **122 文件 1229 例**，失败 9 例均为既有无关项（`gossip-event-report`、`tool-call`/`yt-dlp-manager` 的
  `[IPathProvider] 未注册访问器`、`tool.service` 凭据加密断言）——单独跑同样失败，与本轮改动无关。
- typecheck：本轮新增/改动文件无报错。

## 五、第三轮：新模块 Tab「上下文与记忆」+ 持有者抽取

### 1. 抽公共持有者（复用，不复制）

第二轮给工作流写的"进程级参数持有者"与这一轮要写的"上下文/记忆参数持有者"形态完全一样，
于是抽成 `shared/utils/param-holder.ts`：`createParamHolder({ defaults, limits, normalize })`
（默认 → settings 覆盖 → 硬上限夹取 → 分组一致性修正 → 使用点现读），外加两个从登记表 tree 取值的
`pickNumericFields` / `pickNumericGroups`。工作流持有者改为使用它（原有 20 个用例全部通过，证明重构无行为变化）。

### 2. 新 Tab「上下文与记忆」（12 项，跨两个 settings 键）

`agent:context` + `agent:memory`。**这是框架"一个 Tab 可覆盖多个 settings 键"的首次实用**：
为了少写重复，给分组也加了 `settingsKey` / `pathPrefix`（参数级 → 分组级 → 模块级），
解析/读取/设置页渲染三处都按这条链取值。

| 组 | 参数 |
| --- | --- |
| 上下文装配与压缩 | 上下文窗口(32768)、用户消息保留预算(20000)、近端保护预算(8000)、纯剪枝最小节省(4000)、重复大结果折叠门槛(1500)、系统提示词快照截断(8000) |
| 记忆飞轮 | 每次召回条数(3)、单次蒸馏条数(3)、置信度闸门(70%)、查重重叠率阈值(60%)、蒸馏输入截断(16000)、零命中归档天数(30) |

接线点：`context-manager.ts`（新增 `protectedTailTokens`/`minPruneSavingsTokens` 注入位 + 构造函数读持有者）、
`host-kit.ts`（缺省窗口、快照截断、召回条数）、`memory-flywheel.ts`（蒸馏条数/闸门/查重阈值/输入截断/归档天数/召回 topK）、
`runtime/loop.ts`（同签名结果折叠门槛——此前调用点根本没传 opts，是个"配了没入口"的死参数）。
百分比类参数按整数百分比登记、读取点 `/100` 换算（框架只收整数）。

### 3. 顺手修掉一个真 bug（用例抓出来的）

设置页面板原本自己算"这个模块用到哪些 settings 键"，**没考虑分组级 `settingsKey`** →
跨两个键的 Tab 只会读到第一个键（记忆参数永远显示默认值）。改为调用框架的
`moduleParamSettingsKeys(def)`（同一份口径），并补了用例「跨两个 settings 键的 Tab：分别读、分别写」。

### 4. 本轮验证

- 新增用例 14 个：`tests/unit/shared/agent-context-params.spec.ts`（10：登记表/两键归属/默认=改造前常量/
  夹取/非法保留/百分比换算/两键解析）、`tests/unit/core/platform/agent-runtime/agent-context-wiring.spec.ts`
  （4：**用真实 MemoryFlywheelService 证明行为改变**——蒸馏条数上限、置信度闸门、召回条数、查重阈值）、
  渲染层 +1（跨键读写）。
- 回归：`shared` + `agent-runtime` + `packs` + `renderer/components` + `settings-keys` + `electron/ipc`
  **89 文件 917 例**，失败 10 例均为既有无关项（`StageHeaderBar*` 8 例、`info-source-handler [postgres]` 2 例）。
- typecheck：本轮新增/改动文件无报错；dev 已重启。

## 六、第四轮：新模块 Tab「工具与审批」

`agent:tools` + `agent:approval`（同样是一个 Tab 两个键，复用第三轮的分组级 `settingsKey`）。

| 组 | 参数 |
| --- | --- |
| 工具执行 | 工具执行超时(120s) |
| 工具结果处理 | 数组保留项数(20)、二进制字段判定长度(256)、可用工具提示条数(10) |
| 人工审批 | 审批等待超时(5min)、审批卡摘要截断(2000)、免批缓存容量(64；**0 = 关闭免批**) |

接线点：`tools/registry.ts`（构造缺省超时、`serializeToolResult` 的数组/二进制字段处理、
`notWhitelistedHint` 列举上限）、`runtime/loop.ts`（工具包装层超时——**此前与注册表各有一份 120s
默认值且宿主都没传**，现在统一走持有者）、`runtime/approval.ts`（超时/免批缓存/摘要截断）、
`workflow-boot`（启动注入 + 重注入钩子；工具注册表是长生命周期单例，装配后立刻同步一次 +
保存后由钩子 `applyRuntimeOverrides` 刷新）。

顺手把注册表里那批"其实已经是配置默认值"的导出常量注释改准（标注它们只是**内置默认值**，
生效值在使用点从持有者现读），避免后来人误以为改了常量就能改行为。

验证：新增 8 个用例（登记表/两键归属/默认=改造前常量/0 是免批缓存的合法语义/持有者夹取/
**真实行为证明**：`serializeToolResult` 数组保留与二进制字段、注册表构造读持有者 +
`applyRuntimeOverrides` 刷新）；回归 `shared` + `agent-runtime` + `renderer` + `settings-keys`
41 文件 491 例全通过，`packs`/`workflow`/`ipc` 1081 例通过（9 例既有无关失败）。dev 已重启。

## 七、第五轮：新模块 Tab「知识库」

`knowledge:retrieval` + `knowledge:ingest` + `knowledge:summary`（第三个跨三键的 Tab）。

| 组 | 参数 |
| --- | --- |
| 检索 | 默认返回条数(5)、QA 直出检索条数(3)、QA 直出最低相似度(75%)、文档召回补偿条数(10)、多库检索每库条数(20)、合并上限(60) |
| 入库与导入 | 单文件上传上限(50MB)、单次上传文件数(20)、向量入库批量(10)、QA 导入文件上限(10MB)、QA 导入行数上限(10000) |
| 章节摘要 | 摘要并发数(3)、单章输入上限(6000)、单次处理章数(60) |

接线点：`knowledge-base.service.ts`（检索 topK 缺省、QA 直出条数、文档召回补偿、
向量入库批量、`getFileLimits()` 的上传上限、QA 导入双上限）、`a2-nodes.ts`（QA 直出相似度阈值 0.75）、
`ai-nodes.ts`（多库检索每库/合并上限）、`kb-chapter-summary.service.ts`（`summarizeDocument` 的三个
缺省值——它们本来就支持 opts 覆盖，缺省此前是硬编码）。

一处**框架边界的如实说明**：`param-holder` 只承载**数字**参数（夹取/一致性都按数字做），
所以「章节摘要是否自动重试失败章」这个布尔开关本轮没有纳入登记表（不是漏了，是不想让持有者
静默把 `true` 当 1 处理）。要开放布尔类参数需要先给持有者补布尔支持——已记在遗留里。

验证：新增 8 个用例（登记表三键归属/默认=改造前常量/夹取/三键解析/百分比换算 +
**真实行为证明**：`getFileLimits()` 跟着设置走、`summarizeDocument` 不传 opts 时缺省来自设置）；
回归 `shared` + `settings-keys` + `renderer` + 知识库相关 **201 例通过**（`kb-chapter-summary [postgres]`
5 例是该 spec 既有的 postgres 兼容问题，sqlite 全通），`workflow` + `packs` 1059 例通过（9 例既有无关失败）。
typecheck 改动文件无报错；dev 已重启。

## 八、第六轮：布尔开关支持 + Tab「长文写作」

### 1. 框架：布尔开关（补上上一轮记下的缺口）

`param-holder` 新增 `createFlagHolder` / `pickBooleanFields`，与数字持有者**分开**：
数字持有者对每个字段做 `Number()` 与夹取，布尔进去会被静默当 0/1（`'false'` 也会变成真）——
那比"不支持"更危险。首个使用者：`knowledge:summary.retryFailed`（章节摘要是否自动重试失败章）。

同时修掉两处持有者自身的隐患（新写的 `param-holder.spec.ts` 抓出来的）：

1. **生效值冻结**：持有者是进程级单例，`get()` 原本返回可写引用——任何调用点一次误改就污染全进程且极难排查。现在 `set/reset` 时 `Object.freeze`（含每个分组），误改直接抛错。
2. **`set` 语义写进用例**：`set` 是"只改我提的字段"（没提的沿用上一次生效值），不是"整体替换"——这与各宿主"注入一份完整生效值"的调用方式一致，之前只是实现如此、没有测试钉住。

### 2. 跨模块结构守卫（防住已经踩过的坑）

`tests/unit/shared/module-params.spec.ts` 新增：**每个模块的每一项参数，都必须能在它自己声明的
settings 键 + 绝对路径上按声明的默认值取到**。这条守卫直接对应第三轮踩到的真 bug
（"一个 Tab 覆盖多个键"时参数静默落到错误的键上，用户改了没效果）。现在 10 个模块全过。

### 3. 新 Tab「长文写作」（10 个 Tab 中第 10 个，跨两键）

`longwriting:writing`（章节生成主链）+ `longwriting:storyRoom`（故事研讨室）。

| 组 | 参数 |
| --- | --- |
| 章节生成 | 上下文窗口(32768)、单次生成输出上限(8192)、章节目标字数(3000)、段落目标字数(500)、上章结尾注入字数(550)、重要记忆注入条数(10)、次要记忆注入条数(5) |
| 故事研讨室 | 每轮注入历史条数(40)、历史单条截断(1200)、摘要触发轮数(20)、单次压缩轮数(10)、前情提要长度上限(6000)、主编单轮步数(2)、共识账本容量(60)、单次提炼卡片上限(6)、大纲叶子节点上限(30) |

读取点：`longwriting-ai.service.ts`（生成主链）、`story-room/room-session.ts`、`room-ledger.ts`、
`room-distiller.ts`；`workflow-boot` 增加启动注入与重注入钩子。`storyRoom` 组带一致性护栏
（`summaryBatchTurns ≤ summaryThresholdTurns`）。

这一轮的长文写作接线由子代理按既定模式完成，我独立复核（读代码 + 自己跑测试 + typecheck）。

### 4. 本轮验证

- 新增用例：`param-holder.spec.ts`（10，含冻结与布尔纪律）、`longwriting-params.spec.ts`（13，含跨字段护栏）、
  `knowledge-params.spec.ts` +2（布尔开关：非法值不变真、从 settings 解析）、`module-params.spec.ts` +1（结构守卫）。
- 回归：`core/platform/agent-runtime` + `shared` + `workflow` + `settings-keys` **126 文件 1260 例**，
  失败 9 例全是既有无关项（gossip-event-report ×2、tool-call ×3、tool.service ×1、yt-dlp ×3）；
  `core/packs/longwriting` + renderer 设置页 + settings-keys **58 例全通过**。
- typecheck：本轮新增/改动文件无报错（`longwriting.handler.ts` / `longwriting.service.ts` 的报错是既有的，
  本轮未触碰这两个文件）。
- dev 已重启。

## 九、第七轮：最后一个模块 Tab「素材与图片」（11 个 Tab 齐了）

`asset:limits` + `favicon:fetch` + `image:polling`。

| 组 | 参数 |
| --- | --- |
| 素材下载与网页收藏 | 素材下载超时(30s)、素材下载体积上限(50MB)、文件名长度上限(120)、网页收藏超时(30s)、收藏体积上限(50MB)、整页归档单资源上限(10MB)、单资源超时(30s)、资源数上限(40) |
| 站点图标 | 抓取超时(6s)、HTML 扫描字节(128KB)、未命中缓存时长(24h)、抓取并发(16；**唯一标 restart 的项**——进程级信号量在模块加载时建立) |
| 图片生成任务 | 轮询间隔(5s)、最大轮询次数(60) |

接线点：`assets/asset-storage.service.ts`（下载超时/体积、文件名净化长度）、
`assets/web-collect.service.ts`（收藏超时/体积）、`assets/single-file-html.ts`（归档单资源上限/超时/资源数）、
`services/favicon.service.ts`（超时×2、扫描字节、未命中缓存、并发）、`services/image.service.ts`（轮询间隔/次数）；
`workflow-boot` 启动注入 + 重注入钩子。这批改造前**全是内联常量**（`AbortSignal.timeout(30_000)` 之类），
所以"改不了"的程度最高：慢站点下载失败、大文件被"超过 50MB 上限"拒绝、出图慢被判"任务超时，请重试"。

## 十、整体收口：11 个模块 Tab 已齐

| # | Tab | settings 键 |
| --- | --- | --- |
| 1 | AI 运行时 | `agent:budget` |
| 2 | 上下文与记忆 | `agent:context` `agent:memory` |
| 3 | 工具与审批 | `agent:tools` `agent:approval` |
| 4 | 领域共学 | `agent:budget` |
| 5 | 系统助手 | `agent:budget` |
| 6 | 剧集制作 | `agent:budget` |
| 7 | 工作流 | `wf:defaults` |
| 8 | 知识库 | `knowledge:retrieval` `knowledge:ingest` `knowledge:summary` |
| 9 | 长文写作 | `longwriting:writing` `longwriting:storyRoom` |
| 10 | 素材与图片 | `asset:limits` `favicon:fetch` `image:polling` |
| 11 | 事件系统 | `agent:budget` |
| 12 | 画像 | `portrait:image` |

平台链路（全部落地）：登记表（`shared/constants/module-params/`）→ 通用解析（`shared/utils/module-params`）
→ 进程级持有者（`shared/utils/param-holder` + 各模块 `*-params.ts`）→ 宿主读取（`core/platform/settings/module-params.service`）
→ 通用渲染（`components/settings/ModuleParamPanel.vue`，一模块一 Tab）→ 保存后重注入（`shared/utils/settings-reload`）。

验证（第七轮）：新增 9 个用例（登记表三键归属/默认=改造前常量/唯一 restart 项/夹取/解析 +
**真实行为证明**：`defaultPageFetcher` 体积上限调小后同一页面被拒且报错写明上限、
`defaultWebResourceFetcher` 单资源上限、挂住的请求在注入 20ms 超时后快速返回）；
回归 `shared` + `settings-keys` + `renderer` + `assets` + `electron/ipc` **315 例通过**
（3 例既有无关失败：`asset-service-category.spec`、`info-source-handler [postgres]`）。typecheck 本轮文件 0 报错。

## 十一、第八轮：Tab「画像」→ 12 个 Tab，模块覆盖收口

`portrait:image`：默认宽度(768)、默认高度(1024)、全身合成强度(55%)、面部/变体强度(50%)。

接线点：`packs/portrait/services/portrait.service.ts`——**尺寸 12 处 fallback**（全身/面部/变体/参考图
各条生成路径上的 `DEFAULT_PORTRAIT_WIDTH/HEIGHT`）与**两处强度缺省**
（`generateFullBody` 的 0.55、`editFace` 的 0.5）。强度按命名规范存整数百分比、读取点 `/100`。

画像的**提示词**（负面提示词、一致性前缀等）**没有**纳入这里：它们是文本不是数值，归已有的
画像提示词模板表管理，避免两套口子——这条写在登记表注释里，免得后来人以为是漏了。

模块覆盖到这里收口：内置包里凡是有"数值型可调参数"的模块都有了自己的 Tab。

### 本轮验证

- 新增 4 个用例（`portrait-params.spec.ts`：登记表/持有者/百分比换算/解析）+ **两个真实服务链路证明**：
  `editFace` 不传 strength 时用 0.5、注入 35% 后传 0.35（尺寸同理由 768 → 1024）；
  `changeClothes` 路径注入尺寸后传 1024×1536、复位后回到 768×1024（证明读的是持有者而非换了个常量）。
- 回归：`shared` + `portrait` 三个 spec + `settings-keys` + renderer 设置页 **26 文件 260 例全通过**。
- typecheck：本轮新增文件 0 报错；`portrait.service.ts` 的报错与改造前**逐条一致**（上轮基线里就有 18 条，
  均为 `GeneratedImage.filePath` 之类既有类型债）。
- dev 已重启。

## 十二、第九轮：工作流第二批（系统工具面 / 草稿 / 触发 / 界面截断，13 项）

工作流 Tab 从 4 组扩到 7 组（`wf:defaults`，仍是一个 settings 键，持有者自动跟随新增分组）：

| 组 | 参数 |
| --- | --- |
| 系统工具面（Agent 操作工作流） | 能力目录条数(20)、运行结果轮询间隔(2s)、运行结果等待上限(3min)、摘要节点数(20)、节点输出摘要长度(400)、失败摘要长度(2000)、查不到就放弃的次数(3) |
| 自然语言生成草稿 | 草稿修复轮数(2)、草稿节点数上限(20) |
| 触发与调度 | 事件触发每分钟上限(20) |
| 界面展示截断 | 上下文文本预览长度(1600)、上下文工具摘要长度(400)、审批卡任务描述长度(200) |

接线点：`tools/system-agent-tools.ts`（7 处，含 `run_workflow` 的工具自身超时 = 等待上限 + 30s 余量、
草稿 prompt 里"节点数量不超过 N"的模板插值）、`draft/workflow-draft.service.ts`（修复轮数 + 校验上限 +
**prompt 模板里的上限**——三处必须同源，否则会出现"提示词说 20、校验允许 50"的不一致）、
`trigger/workflow-trigger-scheduler.service.ts`（限流打开判定与日志文案）、
`packs/workflow/handlers/agent-console-context.ts`（两处截断）、`nodes/agent-loop-node.ts`（审批卡任务描述）。

保留原有导出的常量名：它们现在是**内置默认值**（既有单测拿它们当"默认口径"），生效值在使用点现读。

### 本轮验证

- 新增 8 个用例：`workflow-runtime-params.spec.ts` +3（第二批分组默认=改造前常量 / 夹取 / 从 settings 解析）、
  **两个真实行为证明**：`discover_capabilities` 注入 `catalogMaxItems: 3` 后目录只返回 3 条；
  `describeContextMessage` 注入 `contextTextChars: 20 / contextPartChars: 8` 后截断长度跟着变。
- 回归：`platform/workflow` + `packs/workflow` + `shared` + `settings-keys` + renderer 设置页
  **104 文件 1011 例**，失败 9 例全是既有无关项（gossip ×2、tool-call ×3、tool.service ×1、yt-dlp ×3）。
- typecheck 本轮文件 0 报错（中途 `APPROVAL_TASK_CONTEXT_MAX_CHARS` 变成未使用常量、被 typecheck 抓到，
  已改成 `|| 常量` 的兜底写法，既保留默认值语义又不留死代码）。
- dev 已重启。

## 十三、第十轮：工作流第三批（抓取类 / 长任务类，9 项）

| 组 | 新增参数 |
| --- | --- |
| 抓取礼貌与网页抓取 | 响应体体积上限(50MB)、正文提取长度上限(100000 字符)、每个来源链接数(30)、每个页面链接数(50)、并行抓取来源数(10)、并行抓取页面数(5) |
| 长任务轮询与等待 | kb 问答上下文长度(8000 字符)、子工作流等待上限(10min)、子工作流轮询间隔(500ms) |

接线点：`nodes/response-body.ts`（`readBodyWithLimit` 的缺省上限——此前是默认参数里的常量）、
`nodes/extra-nodes.ts` 与 `tools/node-tool-adapter.ts`（正文提取长度、链接条数）、
`nodes/news-nodes.ts`（两个采集节点的来源数/链接数/页面并发，**默认值与上限同源**）、
`nodes/a2-nodes.ts`（kb-qa 上下文长度）、`nodes/sub-workflow-nodes.ts`（等待上限 + 轮询间隔，
拆开了此前"上限即默认"的 `WORKFLOW_LIMITS.subflowTimeoutMs`）。

统一口径（写在设置页 hint 里）：这类"节点配置上限"参数**既是默认值也是上限**——
节点自己配了也只能配得更短。这样用户抬高参数即同时抬高默认值与允许范围，语义可预期。

### 本轮验证

- 新增 4 个用例：第三批默认=改造前字面量、夹取；**真实行为证明**：
  `readBodyWithLimit` 不传 limit 时用设置值（默认 50MB 放行 200 字节 → 注入 100 字节上限后同一响应被拒 →
  显式传 limit 仍优先）。
- 回归：`platform/workflow`（含 `crawl-news` 21 例、`response-body` 7 例）+ `packs/workflow` + `shared`
  + `settings-keys` + renderer 设置页 **104 文件 1014 例**，失败 9 例仍是既有无关项。
- typecheck 本轮文件 0 报错。

### 一个流程教训（记下来避免重复）

这一轮我在改 `response-body.ts` 时又用 PowerShell 做文本替换，把文件的中文编码打坏了
（第二次犯同一个错）。已整文件重写修复并核验无乱码。**结论：改源码一律用编辑工具，不用 shell 文本替换**——
shell 的默认编码会把 UTF-8 中文变成乱码，而且 `replace` 还可能误伤函数参数名（这次就把
`readTextWithLimit` 内部的实参也换掉了，靠 typecheck 才发现）。

## 十四、第十一轮：工作流第四批（外部工具 / 视频等待 / cron 宽限 / 对话附件检索，10 项）

| 组 | 参数 |
| --- | --- |
| 外部工具超时（新组） | 自定义 CLI 工具超时(30s)、视频来源解析超时(10s)、yt-dlp 下载超时(120s)、yt-dlp socket 超时(30s) |
| 长任务轮询与等待 | 视频生成等待上限(70min) |
| 触发与调度 | cron 错过宽限倍数(2) |
| 对话附件检索（新组） | 附件分块大小(800)、分块重叠(100)、扫描消息条数(200)、附件检索条数(5) |

接线点：`tools/tool.service.ts`、`tools/video-url-resolver.ts`（5 处）、`tools/yt-dlp-manager.ts`（下载超时 +
`--socket-timeout`）、`nodes/video-nodes.ts`（等待上限 + 超时文案按实际分钟数生成）、
`nodes/dialog-file-retriever.ts`（分块/重叠/扫描条数/`effectiveTopK` 缺省值）、
`trigger/workflow-trigger-scheduler.service.ts`（cron 宽限）。

新增两条一致性护栏（与"配错自动修正 + 页面说明"同口径）：分块重叠不得超过分块大小的一半
（否则检索块几乎全重叠，等于重复喂同一段）。

### 本轮验证

- 新增 3 个用例：第四批默认=改造前字面量、分块重叠护栏（400/350 → 200 且带说明）、
  **真实读取点证明**：`effectiveTopK()` 的缺省值跟着设置走（5 → 注入 9 → 9），显式传参仍优先。
- 回归：`platform/workflow`（含 `c4-dialog-files` 9 例、`video-url-resolver` 15 例）+ `packs/workflow`
  + `shared` + `settings-keys` + renderer 设置页 + `agent-runtime` **131 文件 1319 例**，
  失败 9 例仍是既有无关项（gossip ×2、tool-call ×3、tool.service ×1、yt-dlp ×3）。
- typecheck：本轮改动文件 0 报错（唯一的 `tool.service.ts(148)` 是既有类型债，基线里就有）。
- dev 已重启。

## 十五、第十二轮：事件系统（总线 + 归档，8 项）

「事件系统」Tab 从 1 组扩到 3 组（一个 Tab 覆盖三个 settings 键）：

| 组 | 参数 | 生效 |
| --- | --- | --- |
| 事件载荷护栏 | 单条载荷体积上限、嵌套扫描深度 | 立即 |
| **事件总线**（新） | 最大投递尝试次数(5)、兜底扫表间隔(2s)、扫表批量(200)、在途上限·命名消费者(1000)、在途上限·匿名订阅(1000) | **重启** |
| **事件归档**（新） | 事件保留天数(90)、归档作业间隔(24h)、归档批量(1000) | **重启** |

### 两个实现决定（都写进了代码注释与设置页）

1. **这一批不做持有者**：总线与归档是进程级单例，只在启动装配时读一次，**没有"运行时现读点"**——
   加一个没人现读的持有者等于引入无用机制。装配处（`getEventBus` / `startEventArchiveJob`）
   直接调 `eventParamsFromSettings()` 解析（仍走登记表，与设置页同一口径）。
   归档单例的启动函数是同步的，因此由 boot 先 `primeEventArchiveParams()` 把生效值交给它。
2. **如实标注"改动需重启客户端"**：为此给 `ModuleParamGroup` 加了**分组级 `effect`**
   （与既有分组级 `settingsKey`/`pathPrefix` 同构：参数级 → 分组级 → 模块级），
   避免给 8 个参数逐个重复写 `effect: 'restart'`。

未纳入：`event:rateLimits` 仍是**裸数组**载荷，与通用解析器不兼容（会被整体当非法回落默认）；
`DEFAULT_KEEP_FOREVER_PATTERNS`（人工决策留痕永不归档）是合规语义，故意不开放。

验证：新增 5 个用例（三键归属与生效时机、默认=改造前常量、上限一致性、装配处解析与夹取、
垃圾载荷回落）；回归 `shared` + `event-system`（含 payload-guard 22 例、event-bus/archive 既有用例）
+ `settings-keys` + renderer 设置页 **36 文件 364 例全通过**；typecheck 本轮文件 0 报错；dev 已重启。

## 十六、第十三轮（收口）：数据源连接池 + 界面契约（7 项）

| 组 | 参数 | 生效 |
| --- | --- | --- |
| 数据源连接池（新组） | 池最大连接数(5)、建连超时(8s) | 重启（建池时按当时参数，已建连接沿用旧值） |
| 同上 | 查询超时(30s；目前仅 ClickHouse 有读取点)、池空闲回收时长(5min)、缓存池数上限(20) | 立即（acquire/查询时现读） |
| 界面展示截断（已有组） | 列表默认每页条数(20)、表单上传上限(10MB) | 立即 |

接线点：`datasource/drivers/pool-cache.ts`（空闲回收 + 池数上限，改为导出 `poolIdleTtlMs()`/`maxPools()` 现读）、
`packs/workflow/handlers/workflow.handler.ts`（列表分页缺省 + 上传体积上限）。

一处如实说明：`queryTimeoutMs` 目前**只有 ClickHouse 驱动有读取点**（pg/mysql/mssql 未接），
设置页 hint 与本文档都写明，不假装三个驱动都生效。

### 验证

- 新增 2 个用例（第五批默认=改造前字面量、覆盖与夹取 + 生效时机标注：池大小/建连超时=重启、
  其余=立即）；回归 `shared` + `packs/workflow` + `renderer` 设置页 **23 文件 246 例全通过**；
  `platform/workflow` + `event-system` + `settings-keys` 884 例通过（9 例既有无关失败）。
- typecheck 本轮文件 0 报错（`workflow.handler.ts` 的 3 条 `wrap()` 类型错在基线里就有）。
- dev 已重启。

## 十七、目标收口说明（本轮结束时的边界）

「参数设置」平台能力与 13 批参数接入到此收口：**12 个模块 Tab、约 162 项参数**，
每一项都在真实读取点接线，并有"行为证明"用例（不是只测登记表）。

**故意未纳入登记表的**（写了理由，不是漏了）：
1. **安全/正确性不变量**：SSRF 白名单与重定向上限、代码沙箱全局白名单、事件载荷密钥模式、
   会话 `INTERRUPTED_SENTINEL`、`DEFAULT_KEEP_FOREVER_PATTERNS`（人工决策留痕永不归档）、
   审批取严规则——这些"可调"等于拆掉防线。
2. **协议/线格式常量**：事件名目录、边编码 handle id、模板语法 `{{}}`、review 超时策略枚举、
   工具名式样——改了会让存量数据静默失配。
3. **算法内部系数**：BM25 k1/b、RRF k、令牌估算系数、记忆分层配额、全文抽取启发式阈值、
   上下文水位硬夹取——属算法语义。
4. **需要你先拍板才能动的**：
   - `event:rateLimits` 载荷是**裸数组**，与通用解析器不兼容（会被整体当非法回落默认），
     要进登记表必须先对象化 → **会改变存量配置格式**，我登记旧格式兜底，但想先经你同意；
   - 两个**进程级定时器**（cron tick / 审核超时 tick）：只能重启生效，价值最低，暂不纳入。
5. **剧集制作的死配置**（`backgroundMusicEnabled` 等定义后零读取点）与**几处自相矛盾的默认值**
   （关键帧数 3/5、分镜时长 3/4/5、剧集原文下限 30/500、视频默认时长 4/5）：
   登记它们会造出"改了没效果"的旋钮或固化错误默认值，**等你裁决后再动**。

## 十八、遗留

- 工作流模块剩下约 36 项参数（需先建"工作流运行参数访问器"）；剧集/长文/知识库/上下文记忆/工具运行时/
  事件限流 等模块 Tab 尚未建立（登记表已在调研报告里逐条列出，含读取点）。
- `WORKFLOW_DEFAULTS` 与 `WORKFLOW_LIMITS` 的字段名/字段集不对齐（`httpRequestTimeoutMs` vs `httpTimeoutMs`、
  `crawlDelayMsMin` 无上限、`agentLoopMaxIterationsCeiling` 是上限却放在 `_DEFAULTS`）——
  登记新参数前建议先统一。
- 「restart 类参数集中在三处单例装配」（`workflow-boot` 的 guards/runtimeLimits、工具注册表、
  事件总线/归档），目前如实标注"需重启"；后续可加"保存后重新注入"的平台钩子，免重启。
  → **第二轮已落地**（见 §四.1）；剩事件总线/归档两个单例尚未接入（它们在建 interval/连接池时装配）。
- 既有无关失败（未触碰）：`tests/unit/core/platform/workflow/tool.service.spec.ts`（凭据加密用例，
  期望密文不含明文，实际拿到 `enc:sk-...`）、`gossip-event-report.spec.ts`、
  `tests/unit/renderer/views/app-list.spec.ts` 等。
