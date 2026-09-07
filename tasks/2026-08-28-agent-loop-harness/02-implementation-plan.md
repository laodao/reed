# 02 · 实施方案（Implementation Plan）

> Agent Loop Harness ｜ 2026-08-28 ｜ 配套文档：[01-design-spec.md](./01-design-spec.md)
>
> **2026-09-06 修订（21 号决策落地）**：M1 第 3 项"tool-calling 协议层第一批"改为
> "AI SDK v6 接入"（调研+运行级 spike 已完成，见 21 号；自研十家适配取消）；
> M1 新增前置：骨架迁移（`src/core/agent/` → `platform/agent-runtime/`）与依赖钉版本。
> M4 野生 agent 迁移执行 G1-G5 门禁（单测→冒烟→golden→影子→切换）。
> 已完成前置：① 10-event-system（平台事件总线已实现，引擎已接入）；
> ② 18-business-pack（插件架构三期落地：core/packs + core/platform）；
> ③ 开源调研与 spike（21 号 + docs/design/2026-09-05 两份过程文档）；
> ④ agent-runtime 骨架 13 文件（commit be56607f，M0 第一步迁移）。
>
> **进度（2026-09-06 深度 review 时点）**：M1-P1 已完成并提交（46a66c05）——契约类型
> （shared/agent.types + runtime/types）、ProviderAdapter（fallback 链/LRU/类型化错误）、
> LoopRunner 手动循环（步级 saveState/护栏/工具六层包装含审批短路），21 单测全绿，
> 实测澄清：ai@6 对 zod 入参的校验先于 execute（包装层 safeParse 为纵深防御）。
> 待办：P2 journal E1-E3 → P3 agent-loop 节点 → 门面/审批协调器/持久化/事件桥 → P4 冒烟。
> 另：Electron 已升 44（chore/upgrade-electron 分支 de7c47da，零测试回归），
> 21 号 §1.3 红线依据已相应更新。
>
> **进度（2026-09-06 实施推进，feat/agent-harness 分支）**：
> - 循环/审批/事件桥批（ApprovalCoordinator 含 Amendment 缓存与 ALS 捕获、
>   EventBridge 复用平台 event-producer 公共底座、限流器 fail-fast 清晰报错）已提交并经
>   独立 subagent 复审（双路径事件架构定稿，23 号 §7）。
> - **批 3 SessionStore 已完成**：agent_sessions 表（create-agent-tables 迁移双方言幂等，
>   agent_memories 一并建表）、AgentSessionRepository（scoped 读 + 事务全量替换、
>   userId 同步捕获注入）、AgentSessionStore 双实现（InMemory structuredClone 深隔离 /
>   DB）、fail-fast 错误纪律（512KB 按 UTF-8 字节拒存、损坏行/seq 断档拒读）；
>   18 单测全绿（含 5000 条分块插入回归、跨租户 ALS 隔离、精确边界值）。
>   独立 review 放行；P2（SQLite 绑定变量上限→事务内 500 行分块）已修复。
>   已知边界（23 号 §11 增补）：uq_agent_sessions_conv_seq 对 user_id NULL 行不生效
>   （NULL≠NULL 方言语义），桌面端由 sqlite 串行门 + 启动注入默认用户兜底。
> - 下一批：AgentRuntime 门面（互斥/LRU 会话/abort 池/decideApproval/subscribe/health）。
>
> **进度（2026-09-06 批 4 门面已完成，feat/agent-harness bc4805f7 + review 修复）**：
> AgentRuntimeImpl 全量落地（23 号 §1 对外 API + init/get/dispose 单例），独立宿主
> IndependentHost（历史重放/流事件翻译/actionSummaries 轨迹拉链）。独立 review
> 发现 P1（interrupt 恢复后不复查互斥→同 scope 双轮并发，已实证）+ P2×3（错误分发
> ALS 上下文、注销后终态改道默认通道、跨租户同 scope 共享提权面）——全部修复：
> 可重入互斥循环（每轮重取条目复查 busy/resetting）、error 分发 runWithUser 包裹、
> 桥缓存注销保留（仅新定义注册时重建）、条目属主认主 fail-fast
> （AgentScopeOwnerMismatchError，23 号 §11-7）；P3 一组（queue 上限 8/suggestions
> 单次计算防双终态/deltaBuf 空缓冲删除/孤儿审批只清构造前行/reset 排队者类型化
> 拒绝/queue 逐条整轮语义入契约 §1+§11-8/Amendment 寿命 §11-9）。
> 26 门面单测 + 210 全套全绿。已知接线注意：旧前端正文流走独立通道
> （longwriting:generate:*），桥 reply:content 走 agent 主通道——接线批需适配。
> - 下一批：ToolRegistry.buildToolDefs / ContextManager / P2 journal E1-E3。
>
> **进度（2026-09-06 批 1-4 深度 review 收口，feat/agent-harness）**：
> 用户追加七条裁决标准（架构统一/组件共用/设计合理/无写死参数/必要日志/不吞异常/
> 不复制粘贴）后，三方独立 subagent（正确性/架构契约/安全性能）+ 主线自查全量复审。
> **放行阻塞 2 项已修**：① 模型流 error part/finishReason=error 被静默映射为 final
> （部分文本成"最终答案"，错误分类契约失效）——消费循环捕获 error part 短路为
> stopReason=error，length 打标；② 跨租户越权链（cancel/resetSession/decideApproval/
> listPendingApprovals/getHistory 绕过属主校验，B 可批准 A 的写类工具卡——探针实证）
> ——requireOwnedEntry 统一收口六入口。
> **P2 九项全修**：审批并发双卡窗口（同步占位登记）；reset 先删库再删条目（复活窗口）；
> dispose 限时等待在途轮（僵尸轮覆盖新实例历史）；轨迹按 toolCallId 配对（并行乱序
> 张冠李戴）+ stagnant 分支补轨迹；nudge 一次后确定性 stagnant 终止（原恒 max_steps）；
> ProviderAdapter 前置缓存限双显式（默认提供商切换陈旧 10min）；resume 签名显式收
> AgentTask（摘要态驱动必炸）；sendMessage 入口体量门 512KB；availableDecisions 落地。
> **七条标准项**：迁移工具三处复制粘贴收口 migration-utils.ts（workflow/event/agent
> 共用）；吞异常 7 处全部补日志；轮级/审计日志（轮起止/取消/决定/重置/注销）；
> 轨迹截断魔法数命名常量化；session-factory 过时死桩删除；index 头部三处过期信息
> 更正（@openharness 表述/业务定义落点指向 packs/模块表加状态列）；InMemory 存储
> 键拼租户；测试公共件抽取 helpers.ts（loop/agent-service 两份复制收口）。
> 测试 220 全绿（+10：error 流/stagnant 终止/超时回填/并发双卡/跨租户矩阵六入口/
> 消息门/Amendment 随 reset 销毁/dispose 僵尸写/InMemory 隔离/provider ④ 名实相符）。
> 已知边界入 23 号 §11-10/11/12（scope 抢占/工具超时不中止底层/时间戳近似值）。
>
> **进度（2026-09-06 批 5 ToolRegistry 完成并过审，feat/agent-harness）**：
> 通用工具注册表落地（23 号 §3 五方法 + unregister/unregisterPack 加法）：
> builtin/pack 命名空间注册、zod→jsonSchema 派生（io:input，加载期 fail-fast）、
> execute 直调管线（校验→审批→静态 parse 后合并→超时→三级截断→审计；错误永不
> throw）、buildToolDefs 桥（快照行为独立/静态键优先/审批三态/maxCalls）。
> 独立 review 判"有条件放行"，必修 6 项全部修复：审计 approval 四值齐用
> （approved/auto 曾永不发出）；包装所有权分层（registryWrapped 标记——两层各做
> 一遍曾致失败被报 ok:true/双计时器取 min/双截断打架，loop 集成测试实证后修复）；
> 快照行为独立（runPipeline 闭包直通 tool 引用——注销后曾 NOT_WHITELISTED）；
> 审批缺省对齐（直调无回调=拒绝）；NOT_WHITELISTED 补 blocked 审计；
> deriveJsonSchema io:input+fail-fast。随批：withTimeout 抽 runtime/async 共用
> （两份复制已漂移）、静态合并改 parse 后合并（zod strip 曾丢宿主键）、16KB 改字节
> 计量、5 处魔法数命名。测试 31 例（含 3 例穿 loop 包装层集成）+ 全套 251 绿。
> 23 号补"批 5 实现注记"（execute 形态偏差/加法方法/所有权分层/合并语义/审批缺省/
> jsonSchema 版本）。
>
> **进度（2026-09-06 批 6 ContextManager 完成并过审，feat/agent-harness）**：
> 四层装配（悬空哨兵修复）+ 压缩守恒（两级水位 90/95、用户消息 20K 预算、摘要
> 置尾、估算回填防抖动、滚动携带）+ vendor 剪枝件（open-harness 移植，MIT 标注）。
> 独立 review 判"不能放行"：**P0 + 5×P1 全部修复**——核心教训是 ai@6 真实消息
> 形状（ToolResultPart 必带 toolName、载荷在 output）的三个接点全失手且被手造
> mock 挡在测试之外：哨兵消息形状（修复变修死）、vendor 剪枝 result 字段
> （生产恒 no-op）、多悬空 splice 漂移（配对倒挂）。修复后以真实形状构造器
> 重写测试（含真实 streamText 集成验证 schema 合法性）；其余修复：loop 传单步
> 实测 inputTokens（累计和曾致假触发+空转）、硬顶从观测位升级为降级行为、
> 滚动摘要保留前次内容、当轮输入无条件保底、前缀伪造双端防护、装配与压缩
> 解耦（窗口 0=仅装配）、摘要提示词收口 vendor 常量。测试 162 绿（context 21
> + 门面集成等）。vendor 偏离 upstream 三处文件内标注（boundary 修正为测试
> 实证的上游缺陷）。
>
> **进度（2026-09-06 P2 journal 竣工：E1 三提交 + E2/E3 ff69ac62）**：
> E1 事件日志（表/端口/十二类事件全写入点/先日志后内存/两级快照）+ 重放投影
> 与重建式恢复（replayJournal/rehydrate/reviewDecide 重路由/boot 新旧格式分治）
> ——独立 review P0+P1×5 全修（阈值快照 appliedThroughSeq 语义/挂起并行混合
> 在途统一处理/fail 边与 checkpoint 激活落日志/过期挂起走 timeoutPolicy/
> waitExpiresAt 绝对死线）。E2 节点状态 API（state_json 列/saveState 覆盖写/
> loadState 预载/executionKey 幂等键）+ E3 handler.resume（多轮人机交互，
> settle 三态分发，兼容矩阵全覆盖）+ E1 遗留 node_run 投影对齐（不变量 4）。
> 测试 25 例（journal-write 6 + journal-replay 9 + node-state-and-resume 10）
> 全绿，工作流全套基线零新增回归。已知近似：run 行不持久化 settings
> （rehydrate 以缺省重建）；无快照循环列表以伪变量近似（快照路径优先）。
> 下一步：agent-loop 节点四件套（catalog/types/handler/forms）→ P4 冒烟。
>
> **进度（2026-09-06 批 5-7 对抗性深度 review 收口，b036b226）**：
> 三路独立对抗审查（跨模块攻击/架构契约/安全性能，全部实证型）发现 P0×3 +
> P1×8 + P2 一组，全部修复：threshold 快照死参数（批7a 修复因文本漂移未生效
> ——教训：python replace 静默失败须 assert 锚点）、循环恢复双驱动、E3 多轮
> 确定性塌缩（测试早退分支曾掩盖）、撕裂批/双决策/审批窗口/跨租户决策/快照
> 二次方放大/resolver 优先级（既有缺陷）。文档回写：11号快照结构与保留缺口、
> 12号 R6 硬顶行为指向、23号审计表 M1 缺口。R2 判定三批"文档-代码一致性未
> 完全达标但距离不远"——修复后已达"文档即评审现场"标准。R1 判定 Run Journal
> 修复后方可承接 agent-loop 节点（现已修复）。遗留（P3 级，记录在案）：
> ContextManager 全量 stringify 每步开销（增量缓存待接线批）、engine↔journal-replay
> 循环 import（类型抽离）、测试基建三份 Fake 重复（helpers 抽取）、
> addColumnIfMissing 第三份（升 migration-utils）、恢复路径写失败语义模糊。
>
> **进度（2026-09-06 M1.4 竣工：agent-loop 节点四件套 + 首批内置工具）**：
> 四件套全落地——catalog（'agent-loop' 条目，ai 类，可取消）+ types（config：
> task/systemPrompt/toolWhitelist/maxIterations/maxToolCalls/maxDurationMs/
> editableFields/model）+ forms（7 字段声明，select-dynamic source='agentTools'
> 多选）+ handler（nodes/agent-loop-node.ts：WorkflowHost 适配器，LoopRunner 驱动，
> E2 saveState 步级持久化、E3 resume 挂起恢复、审批挂起桥）。首批内置工具四件
> （http_get/web_search/code_run/data_table_query，路线 A 直调现有执行器，
> SSRF 闸门经 executeHttpFetch 单一入口）。boot 7.2 装配 harness
> （AgentToolRegistry + ProviderAdapter），未装配时节点 fail-fast。
> 配套：loop.run() 首步前 saveState（首轮审批挂起可恢复的前提）；registry.register
> 泛型化（具体入参泛型 def 收口 unknown 形态）；引擎 applyReviewDecision 的
> resume 路径 config 补模板解析（对齐 launchNode——agent-loop 是首个恢复后
> 多轮消费模板字段的节点）；wf:list-agent-tools IPC（preload/web channel-map/
> NodeConfigPanel agentTools 分支，四端接线）。
> 对抗性 review（subagent，实证型）P1×3 全修：编辑批准被引擎 editableFields
> 白名单滤空（defaultConfig 声明 input + 引擎级 E2E）、agentTools 数据源无消费者
> （上述四端接线）、resume 段 systemPrompt 模板裸奔（引擎 resolveConfigDeep）。
> P2×3 修：护栏跨挂起-恢复累计（预算初值=state.usage.toolCalls；时长护栏
> 净时长剩余窗口）、reject 按 12 号 §7-8 干净终止 human_rejected（原实现注记
> 续跑可致审核 ping-pong）、512KB 持久化超限转译 retryable=false（防重试烧钱）。
> P3 修：上限常量收口 WORKFLOW_DEFAULTS.agentLoopMaxIterationsCeiling（500）/
> maxDurationMs 上界 WORKFLOW_LIMITS.maxDurationMs、审批卡附任务上下文（200 字截断）。
> 挂起拆解语义定稿（探针实证）：ai@6 会吊住工具 execute 永不 settle 的流——
> 弃置式拆解（commit 后本地 abort 止 IO，悬挂链待 GC，状态冻结挂起点），
> 落库失败路径转结构化拒绝（reject 会吊死流，P1 实证）。
> 测试 27 例全绿（handler 级 21 + 引擎级 E3 4 + 一致性/内置工具 2），全仓回归
> 零新增（15 失败=已知环境基线）。遗留（P3 级，记录在案）：审批先于参数校验
> （廉价 zod 前置到发卡前，涉 registry 所有权分层，M2 处理）、
> trajectoriesSummary 跨恢复段不累计（agent_trajectories 落表 M1.5 一并）、
> binding 富配置（静态 config/批准策略/maxCalls）与写类工具 M2、
> maxTokens 护栏位缺省（归 ContextManager 接线批，无 LoopRunner 钩子）。
> 下一步：P4 真模型冒烟（GLM/DashScope"查资料→写摘要"≥5 轮收敛/杀进程恢复/
> 挂起批准续跑/护栏生效）→ M1.5 agent_trajectories 落表。

> **进度（2026-09-07 总收口深度 review：四路对抗审查 + P0×2/P1×6/P2×8 全修）**：
> 四路独立 subagent（运行时核心/上下文与工具层/Journal 恢复/M1.4 焊接面+七条横切）
> 全部实证型审查，发现 **P0×2 + P1×6 + P2×8 + P3 三十余项**，本批全部修复或收口：
> - **P0（DbJournal 生产路径零测试覆盖的空洞）**：事件行从不生成 id（SQLite NULL
>   主键 find 去重塌缩→重放空投影整图重跑；PG 违 NOT NULL 每 run 必败）；
>   appendBatchAtomic 绕租户 scoped（批事件 user_id=NULL→属主读丢全部边激活）。
>   修复：确定性 id + ALS 注入 + **真实 DataSource 契约测试**（4 例钉死）。
> - **P1×6**：latestSnapshot 调不存在的 createQueryBuilder（死代码，tsc 基线噪音
>   掩盖——教训：新增文件不得进基线对照，按文件归属判新错）；快照 loopPseudoVars
>   二次方放大（b036b226 宣称修复实未落地——第三次"宣称已修未生效"，投影
>   {item,index,listSize} 去列表引用）；重放循环终态守卫（终态循环曾 fail-fast
>   毒杀整 run/覆写 succeeded 重跑）；rehydrate 在途重执行丢 persistedState
>   （M1 验收"杀进程恢复"对中途崩溃失效——per-node 缓存回填 loadState 注入）；
>   resetSession 失败永久毒化会话（resetting 永真+setImmediate 每秒百万次自旋
>   ——try 回滚+让步封顶）；审批回调 throw 绕过工具终态事件（并行双卡场景
>   tool-end/轨迹永不发——try 收口+拒绝原因透传 hint）。
> - **P2×8**：压缩空转无退避（A 型实测水位含固定成本每步重摘——无进展指纹+
>   同口径成功判定）；12 号 §6.5 模型错误重试未实现（**立项延期至接线批**，
>   本块为显式记载）；多轮挂起等待窗计入净时长（accumulatedWaitMs 累计）；
>   结构化拒绝 reason 字段错位（模型曾收虚假"用户拒绝"）；重定向绕 SSRF 闸门
>   （继承缺陷被 agent 放大——redirect:manual 逐跳校验，4 例回归）；v≠1 快照
>   违反宁慢勿错（视为不存在走全量）；C1 自由环崩溃恢复停摆+序号分叉（恢复
>   镜像 computeReady 出边清理，引擎级两进程测试）。
> - **P3 三十余项**：withTimeout 预中止、轨迹 iteration 一致、dispose 残留留痕、
>   tick reject 路径 try/catch、recoverOnBoot 首循环 ALS（getByIdRaw）、
>   InMemoryJournal latestSnapshot/appendBatch 原子性、completeLoop 清 drivers、
>   void 结果归一、_oversize 字节截、maxCalls 拦截审计、delta 30ms 合批、
>   DANGER_LABELS 消费服务端推导、isElectron 共用、config 双声明收口、
>   stopReason desc 补全、护栏失败附 usage 摘要、zod 截断常量统一、
>   vendor 第 4 处偏离标注等。
> - 七条标准四路结论：架构统一/组件共用/设计合理 通过（含注记）；无写死参数/
>   日志/不吞异常/无复制粘贴 基本通过（零散项已修）。
> - 历史修复复核 33 项：29 已落地、3 未落地/部分（本批补齐）、1 文档措辞分歧。
> 测试：全平台 1197 通过，15 失败=已知环境基线零新增；新增回归 20+
> （仓储契约 4/journal-replay 6/loop 1/agent-service 1/agent-loop 3/redirect 4/
> tool-registry 3）。文档回写：11 号实现注记、12 号 §6.2/§6.5/§9、14 号 §6、
> 23 号 §5。遗留（显式立项）：§6.5 模型错误重试（接线批/vendor retry 形状）、
> 审批先于校验的改序（M2，14 号 §6 已注记现状）、streamChannel 拆通道注记、
> 会话卡编辑批准入口（前端）、ProviderAdapter.invalidateCache 接线（设置批）。

> **进度（2026-09-07 P4 真模型冒烟竣工：四场景全过 + 抓修两个生产断点）**：
> 真实链路 = DashScope compatible-mode（qwen-flash）× ai@6 streamText 手动循环 ×
> 工作流引擎 + agent-loop 节点 + DbJournal（better-sqlite3）× scripts/p4-agent-smoke.ts。
> M1 验收四条逐项实证：
> - **收敛**：查资料→写摘要 5 轮 http_get 工具调用后 final 收敛（7-9s，摘要质量合格）✓
> - **杀进程恢复**：SIGKILL 于 iteration=2（7 条消息已落库）→ 第二进程 ensureActive
>   重放续跑 iteration 2→4 → succeeded，journal 11 事件 seq 无空洞 ✓
> - **挂起批准续跑**：submit_report（需批准）首步挂起（挂起点落盘）→ 批准 →
>   模型重发（参数漂移经一次性授权放行+warn 留痕）→ 工具恰好执行 1 次 → succeeded ✓
> - **护栏**：maxIterations=3 不收敛场景干净终止，失败原因含护栏语义+用量摘要 ✓
> 视频生成链路按用户指示未触碰。
> **冒烟抓到并修复两个生产级断点**（均曾被 tsc 基线噪音掩盖，单测 Fake 全绿）：
> ① WorkflowNodeRunRepository.update 缺 stateJson 映射——引擎 ctx.saveState 补丁被
> 静默丢弃，E2 落库全链路生产失效（新增真实 DataSource 契约测试钉死）；
> ② makeEngineDeps 适配层调用不存在的 nodeRuns.listByRun（实为 getByRun）——
> rehydrate 预载读必 TypeError。
> **grant 语义修订**（真模型实证）：严格同参匹配不可行（模型重发自由文本入参必
> 逐字漂移 → 批准后再挂起死循环）→ 改同工具一次性授权：用后即焚、参数漂移
> warn+轨迹 autoApprovedArgsDrift 留痕、不同工具仍发卡（E3 多轮不变）。
> 测试：全平台+database 回归零新增（15+12 失败均为已知环境基线）；新增
> node-run 仓储契约 1 例。**M1 全部验收项达成。**

## 分期总览

| 期 | 主题 | 目标 | 依赖 |
|----|------|------|------|
| M1 | 地基 | 事件日志 + 可恢复挂起 + tool-calling 协议层 + agent-loop 最小闭环 | 无 |
| M2 | 工具生态与观测 | AgentToolRegistry、provider 全量适配、轨迹视图 | M1 |
| M3 | 长程能力 | 任务树 + 质量门 + 知识飞轮最小闭环 | M1，部分依赖 M2 |
| M4 | 业务化收口 | 审批缺口补齐、野生 agent 迁移、待办中心 | M1/M3 |

原则：**M1 把三处一次性投资做对（journal、resume 回调、tool-calling），后续各期只加功能不返工地基。**

---

## M1 · 地基（最优先）

### 范围

1. **运行事件日志（spec §3）**
   - 迁移：`workflow_run_events` 表（PC/Web 双端迁移各一份）。
   - 引擎状态变迁点追加事件（edge_activated / node_launched / node_suspended / node_completed / node_failed / review_decided / run_finished）。
   - boot 恢复：重放日志重建 RunExecution；`recoverOnBoot` 重写——running/waiting_review 不再一律标 interrupted，能重建的继续跑。
   - `reviewDecide` 对非活跃挂起 run 改为"rehydrate → 应用决策"。
   - 快照机制可后置到 M1 尾（先全量重放，性能不够再加快照）。
2. **节点状态与可恢复挂起（spec §3.2）**
   - `workflow_node_runs.state_json` 列 + `WorkflowNodeContext.saveState/loadState`。
   - handler 契约加可选 `resume(decision, state)`；`applyReviewDecision` 优先回调，未声明维持旧语义。
   - 修订 handler 契约注释（禁存"仅内存"跨调用状态）。
3. **AI SDK v6 接入（2026-09-06 修订：替代原"tool-calling 协议层第一批"自研方案）**
   - 依赖钉版本：`ai@^6.0.277` + `@ai-sdk/openai-compatible@^2` + `zod@^4`（overrides 锁 ai@6，CI 单版本断言）；压缩/重试形状/todos 走 vendor（22 号 §4），**不依赖** @openharness/core。
   - provider-adapter：getProviderConfig → createOpenAICompatible → LanguageModel（LRU 缓存、SSRF 沿用、结构化日志）。
   - 契约保留项照 13 号修订：能力标记（model-detector）、prompt 降级（ai@6 middleware）、`agent_llm_calls` 审计表。
   - 骨架迁移：`git mv src/core/agent platform/agent-runtime`（13 文件已在 be56607f）。
4. **agent-loop 节点最小版（spec §7，2026-09-06 v2 修订：循环载体=ai@6 单步手动循环，见 22 号审计）**
   - 主循环自研（不传 stopWhen=恰好一步；response.messages 步末拼接；步级 host.saveState），AgentHost 契约照 12 号 R2/R4b。
   - 工具白名单：首批只接入 llm 无关的安全工具子集（http-request、web-search、code、data-table 内置模式）。
   - 护栏：maxIterations（默认 20）/ maxToolCalls / maxDurationMs。
   - catalog/types/handler/forms 四件套 + 一致性单测。
5. **轨迹落库**：`agent_trajectories` 表 + 每轮迭代写入。

### 验收标准

- 用 OpenAI 兼容模型跑"查资料→写摘要"agent：自主完成 ≥5 轮工具调用并收敛输出。
- 运行中杀掉进程重启：run 从中断轮恢复继续，轨迹完整无空洞。
- 循环中挂起等人工确认：批准后**从挂起轮继续**（不是整节点重跑，也不是直接终结）。
- 护栏生效：构造不收敛场景，maxIterations 到达后干净终止并输出失败原因。
- 双端迁移在 SQLite 与 PostgreSQL 均通过；新增引擎行为有单测覆盖。

### 风险

- 引擎恢复路径改动是本批唯一侵入性改动——必须有"旧格式 run（无事件日志）重启"的兼容测试（降级为现有 interrupted 语义）。
- （v2 更新）协议差异由 @ai-sdk/openai-compatible 承担，残余风险为个别国产端点兼容性：M1 用 GLM/DashScope 各跑一轮冒烟。

---

## M2 · 工具生态与观测

### 范围

1. **AgentToolRegistry（spec §9）**：节点即工具统一导出；`NODE_TYPE_CATALOG`/custom_tools 补 `jsonSchema`（高频 15 种节点优先）。
2. **provider 第二批**：Anthropic（tool_use 块）、Google（functionCall）原生适配。
3. **轨迹视图 UI**：运行详情页 agent-loop 节点逐轮 thought/tool_call/result 时间线 + token 汇总。
4. oas-tool V2：支持 `$ref` 与嵌套 schema（提升外部接口接入质量）。
5. token 成本观测：run/节点级 token 与估算成本汇总展示。

### 验收标准

- 白名单内任意节点可被 LLM 正确调用（参数 schema 由 jsonSchema 生成，不再从 UI schema 硬凑）。
- Anthropic/Google 模型跑同一 agent 任务成功率与 OpenAI 系相当。
- 轨迹视图可完整复盘一轮真实运行。

---

## M3 · 长程能力（任务树 + 质量门 + 知识飞轮）

### 范围

1. **任务树（spec §5）**：`agent_tasks` 表、Planner（静态规划 + 局部重规划）、`workflow_runs` 加 task_id/parent_run_id、事件总线驱动调度、深度/预算上限。
2. **质量门（spec §6）**：Verifier 四层（规则→工具→LLM 评判→人工）、带反馈重试、escalated 升级链、质量分沿树聚合。
3. **知识飞轮最小闭环（spec §4）**：`memory_entries` 表、distiller 蒸馏、闸门（查重 + 置信度 + **默认人工批准**）、读取装配进 agent-loop 上下文、LanceDB 复用。代谢作业（cron）可先只做"归档零命中条目"。
4. **任务树视图 UI** + 记忆审批列表 UI。

### 验收标准

- 一个需要 3 层分解的长程任务（如"调研某主题并产出带数据来源的报告"）端到端完成：计划人工批准后执行，子任务逐一过质量门，最终产出通过根任务验收。
- 构造一个必败子任务：观察 带反馈重试 → 重规划 → 升级人工 的完整链路。
- 飞轮：第一次运行产生的经验条目经人工批准后入库；第二次运行相似任务时上下文装配命中该条目（轨迹中可见引用）。

### 风险

- 记忆污染：闸门初期一律人工，宁可慢不可脏。
- Planner 生成任务树的质量不稳定——静态规划必须人工批准后才执行，这是硬性约束。

---

## M4 · 业务化收口

### 范围

1. **审批缺口**（spec §1.2 S7/S8，参照 `tasks/2026-08-27-lan-collab/04-workflow-assignment.md` E1-E4）：human-review/form-collect 加 assignee 配置、node_run 加 assignee_id、reviewDecide 操作者校验、放开单实例互斥（按业务键/发起人维度）、待办中心。
2. **野生 agent 迁移**：episode-production 与长文写作的 agent 编排迁到 AgentRuntime，删除重复实现。
3. 组织模型最小版（团队成员目录，支撑"指派给人"），部门/上下级按需。
4. 按需：驳回重提语义、超时升级、MCP 立项评估。
5. **业务包机制落地**（[18-business-pack.md](./18-business-pack.md)）：Pack Manifest、ai-coding 与 content-production 两个首批包（content-production 即野生 agent 迁移的承载形式）。

### 验收标准

- 多用户场景：A 发起审批流实例、B（被指派审批人）隔天在待办中心批准，全程跨重启、权限校验通过；同流程多实例并发互不阻塞。
- ep/longwriting 全链路回归通过，且运行轨迹可在轨迹视图复盘。

---

## 横切工作（贯穿各期）

- **测试**：引擎恢复路径、resume 回调、协议层各家 provider、护栏触发——每步配单测；M1/M3 各配一个端到端场景测试。遵循项目 TDD 约定。
- **双端**：所有迁移 PC（SQLite）/Web（PostgreSQL）成对编写；PG 端注意占位符（`$1,$2`）与 SQLite（`?`）差异（历史教训）。
- **安全**：新增出网能力一律过 `validateOutboundUrl`；LLM 不可见明文凭据；Web 端新增 IPC/REST 全部注册并鉴权（历史教训：Web 端 IPC 漏注册）。
- **文档**：各期完成时更新本目录文档状态与 `AGENTS.md` 相关约定。

## 开放问题（实施前需决策）

1. `workflow_run_events` 的保留策略：全量保留（审计友好）vs 终态后归档压缩（存储友好）？建议：waiting/人工类全量，普通自动化 run 终态 30 天后归档。
2. prompt-based 降级路径是否允许用于生产关键任务？建议：仅标记为"实验"，关键任务限定原生 tool-calling 模型。
3. 任务树的人工批准粒度：整树一次批准 vs 每层展开时批准？建议：M3 先整树一次，后续按体验加"展开式批准"。
4. 记忆闸门自动化的放开节奏：按类目灰度（先 SOP 类、再事实类），需要运营指标（污染率）支撑，M3 只建人工闸门。
