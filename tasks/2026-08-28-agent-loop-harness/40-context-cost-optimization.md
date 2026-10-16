# 40 · 上下文成本与产出治理：缓存分层 / 原始流水 / 产物归档 / 子代理 / 模型分级

> 起因：用户对 harness 提出六项能力盘点（会话原始记录保存、动态装配 vs 提示词缓存、
> 上下文压缩、工具返工只留末版+引用、subagent 动态委派、细分任务上下文隔离、模型灵活分配）。
> 盘点结论：压缩已支持（HostKit 缺摘要阶段）；任务树路径已实现子任务隔离；其余为缺口。
> 本批按 P0→P2 全部落地。分支 feat/agent-harness ｜ 前置：36 号 HostKit、26 号任务树。

## 1. 能力对照总表（实施后）

| # | 场景 | 结论 | 落点 |
|---|---|---|---|
| 1 | 会话原始记录保存 | ✅ 工作集（agent_sessions，全量替换）+ **append-only 原始流水**（agent_session_events，压缩后原文可回放） | P0-2 |
| 2 | 动态装配 vs 缓存 | ✅ system 只留稳定段，动态段（记忆/快照）注入消息尾（轮次上下文块）；Anthropic 显式 cache_control 断点；其余 provider 吃自动前缀缓存 | P0-1 |
| 3 | 上下文压缩 | ✅（既有：两级水位+剪枝+守恒摘要）；本批补 HostKit 摘要阶段（`models.summary`）与摘要独立模型 | P2 |
| 4 | 工具返工只留末版+引用 | ✅ 完整结果按 toolCallId 归档；剪枝/截断占位带回查指引；`get_tool_result` 分页回查；同签名重试折叠旧大结果 | P1-1 |
| 5 | subagent | ✅ `spawn_subagent`：独立 scopeKey/上下文/轨迹，只有报告回主上下文 | P1-2 |
| 6 | 细分任务隔离 | ✅（既有任务树：叶子独立 sessionKey 执行，聚合只看产出）；会话内动态委派由 #5 补齐 | — |
| 7 | 模型灵活分配 | ✅ 每轮 modelPreference（既有）+ 子代理 cheap/strong 档位 + 任务树叶子 `spec.model` 档位 | P1-2/P2 |

## 2. P0-1 系统提示词分层 + 缓存断点

### 2.1 分层形态（借 Claude Code/codex）

```
system（跨轮稳定，可缓存）        = task.systemPrompt（人设/规则）
轮次上下文块（每轮刷新，入历史）  = [Turn context] 快照 + 挂起注记 + 记忆/业务注入 [End]
消息历史                          = append-only（压缩重写除外）→ 前缀缓存跨轮跨步最大化
```

- `AgentTask.dynamicContext?: string`（types.ts）：宿主把记忆召回/业务注入段拼好传入；
- `buildSystem(task)` 只返回 systemPrompt；`buildTurnContext(task, state)` 组装动态段
  （快照 `[当前项目状态快照（来自数据库，确证事实）]` + 挂起注记 + dynamicContext）；
- 注入幂等：`hasCurrentTurnContextBlock` 从尾向前扫（跳过 assistant/tool），本轮已有块
  （挂起恢复重入 loop）不重复注入；块随历史持久化（历史即"当时的上下文"，语义无损）。

### 2.2 轮次上下文块（context/turn-context.ts）

- 稳定标记双端同检（`TURN_CONTEXT_PREFIX`/`SUFFIX`）——防用户粘贴伪造（summary 同纪律）；
- `classifyMessage` 新增 `turn.context`：不占用户消息 20K 守恒预算；折叠时**最新一块保底**
  （当轮记忆/快照不可丢——硬顶降级路径同样保底）；
- `getHistory` 过滤块（UI 历史不出现幽灵用户消息；模型侧存储不动）。

### 2.3 Anthropic 缓存断点

- `withPromptCacheBreakpoint(messages)`：最后一条消息末 part 打
  `providerOptions.anthropic.cacheControl.ephemeral`——缓存「system+工具+截至上一步全部历史」，
  多步 run 内每步读缓存写增量；纯函数，**只作用于出站拷贝，持久化历史保持原生形态**；
- 缺省开启，`AGENT_PROMPT_CACHE=0` 关闭；`LoopRunnerDeps.promptCache` 可显式覆盖；
- 已实证 ai@6 将 part 级 providerOptions 透传至 doStream prompt（loop.spec 断言 ephemeral 到达）。

### 2.4 HostKit 对应调整

- `finalPrompt` 拆为 `systemPrompt=basePrompt` + `dynamicContext`；`turn_start` 轨迹快照与
  `HostKitTurnResult.systemPrompt` 仍返回**完整有效提示词**（工作台「查看上下文」不回归）。

## 3. P0-2 append-only 原始流水

### 3.1 存储

- 新表 `agent_session_events`（迁移 `create-agent-session-events`，双端注册 electron/web）；
  确定性幂等 id `se_<conversationId>_<seq>`，insert-or-ignore（轨迹表同款纪律）；
- 仓储 `AgentSessionEventRepository`：appendBatch（orIgnore）/ maxSeq（裸查——ALS 缺失窗口
  防重号，review A4 同源）/ listByConversation + deleteByConversation（scoped 租户过滤）；
- 端口 `RawTranscriptPort`（memory/transcript-store.ts）；超限消息（512KB 同会话存储）
  存 `_truncated` 占位——流水是安全网，单条缺失可接受、整批失败不可接受。

### 3.2 双层诚实上报（增量 = loop 产生 + 宿主产生）

- loop：`AgentHost.saveState(state, meta?: { appended?: ModelMessage[] })`（types.ts 契约扩展，
  旧宿主实现兼容）。loop 产生的每条新消息（stepMessages/哨兵/挂起注记/nudge/轮次上下文块/
  压缩摘要消息）在唯一持久化点随 meta 上报后清空 pending；
  - 压缩重写只上报新生的 summary 消息（保留消息身份不变、剪枝克隆是改写——原文已在流水）；
- 宿主：自产消息自行补报——HostKit（本轮 user 输入；种子形态首轮流水为空时整段业务史入流水=
  迁移语义）、agent-service IndependentHost（本轮 user 输入）、workflow-boot 任务宿主（goal user）；
- 合并序：宿主 pending 在前、loop meta 在后 = 时间序；seq 由宿主 maxSeq 懒续接 + 闭包计数。

### 3.3 级联清理

`resetSession → deleteTrajectories` 同步级联：流水 deleteByConversation、产物 deleteByScope。

### 3.4 覆盖面决策

聊天（agent-service）与任务树（workflow-boot）两条会话存储路径接入；LW/EP 为业务表权威形态
（历史本就安全），transcript/artifacts 缺省 null 不破坏其装配——后续按需注入。

## 4. P1-1 工具产物归档 + 回查 + 返工折叠

### 4.1 归档（resultRef 落地，registry 头注释预留位）

- 新表 `agent_tool_artifacts`（确定性 id `ta_<toolCallId>`）；端口 `ToolArtifactPort`
  （tools/artifacts.ts）；只归**成功**结果，256KB 上限拒存留痕；fire-and-forget 不影响调用；
- 归档点两处：registry 管线 ⑤ 截断序列化**之前**（registry 包装工具 + 直调共用）；
  loop 原生工具路径 `truncateJson` 之前。

### 4.2 回查

- `get_tool_result`（tools/artifact-lookup.ts）：toolCallId → 完整结果，分页窗口
  （缺省 8000 字符，`offset`/`maxChars` 翻页，hasMore/nextOffset）；
- 注入：归档端口装配时自动注入（HostKit deps.artifacts / agent-service）；未装配的宿主
  不注入——占位指引无死链；
- 占位文本升级：`[pruned …]`/`[superseded …]` 均带「按 toolCallId 回查」指引。

### 4.3 同签名大结果折叠（用户场景④）

`collapseSupersededToolResults(messages)`（context-manager 纯函数，loop 步边界调用）：
- 同工具+同入参（stableStringify 签名）重复执行 → 只保留最新成功结果全文，先前**大**结果
  （≥1500 tok，`SUPERSEDE_COLLAPSE_MIN_TOKENS`）占位化为 `[superseded …]`；
- 失败结果不折叠也不取代成功位（重试需要错误上下文；ok 判定识别 `output.ok` 与
  loop 回填形 `output.value.ok` 双形态）；toolCallId 不动（配对/流水完整性不破坏）；
- 折叠改写不进流水（原文已在）。

## 5. P1-2 spawn_subagent（tools/subagent.ts）

- 入参：`{ goal（自包含）, model: inherit|cheap|strong, tool_names?, max_steps? }`；
- 隔离：子 scopeKey `<父>:sub_<rand>`（轨迹工作台可独立查看）、独立 ContextManager、
  会话状态不持久化（一次性）；**深度恒 1**——子工具集构造期剔除 spawn_subagent；
- tool_names 白名单过滤：未知名 fail-fast `UNKNOWN_TOOLS`（宁失败不静默缩权）；
- 审批路由父通道（同一 requestApproval）；父中止级联子中止；
- 模型档位（场景⑦）：`deps.models.cheap/strong` → resolveModel(preference)；未配置回退主模型；
- 失败隔离：子代理护栏终止/异常 → `ok:true` 报告带 stopReason/note/trajectoryKey，
  主代理可改道重试——子代理失败是信息不是故障；
- 报告 >8K：经 loop 截断入上下文 + 完整报告随产物归档（get_tool_result 可回查）。

## 6. P2 内部调用模型分级

- HostKit：`config.models.summary` → `makeSummarize`（generateText + DEFAULT_SUMMARY_PROMPT
  + 独立模型）注入 ContextManager 守恒摘要；**未配置 = 纯剪枝（36 号以来既有行为不变）**；
  `HostKitDeps.summarize` 整体覆盖（单测/宿主自持模型）；
- 任务树：`AgentTaskSpec.model?: 'cheap'|'strong'|'inherit'` → `runAgentLoop` 端口 `modelTier`
  → workflow-boot `parseModelTierEnv`（`AGENT_MODEL_CHEAP`/`AGENT_MODEL_STRONG`，
  格式 `providerConfigId/modelId` 或裸 `modelId`）→ AgentTask.modelPreference；未配置档位
  回退默认模型。

## 7. 测试地图

| spec | 覆盖 |
|---|---|
| turn-context.spec（新） | 标记双端识别/防伪造/本轮块判定/断点纯函数形态 |
| loop.spec（+7） | buildSystem 稳定段/buildTurnContext/块注入一次且入 meta/断点 ephemeral 到达 doStream/promptCache=false/持久化历史原生形态 |
| context-manager.spec（+5） | turn.context 分类/折叠保底最新块/同签名折叠（大结果/门槛/失败不取代） |
| host-kit.spec（+4） | system 拆分+块注入模型所见/get_tool_result+spawn_subagent 注入/rawTranscript append-only seq 连续/summary 注入触发守恒摘要 |
| subagent.spec（新 6） | 报告回填/递归防护/白名单 fail-fast/档位解析/失败隔离/max_steps 夹取 |
| artifact-lookup.spec（新 3） | 命中窗口/翻页/NOT_FOUND |
| tool-registry.spec（+2） | 截断前归档完整体/无 toolCallId 不归档 |
| session-event.repository.spec（新 7） | 幂等批写/maxSeq 续接/ALS 隔离/级联删除/迁移幂等 |
| agent-service.spec（既有 34 回归） | getHistory 过滤轮次上下文块（UI 无幽灵用户消息） |

全套 17 文件 256 用例通过。进程退出时段错误（better-sqlite3 析构）为存量环境问题
（stash 基线复现一致，与本批无关）。typecheck 515 错全部为存量基线（本批 0 新增）。

## 8. 后续（本批不做）

- 工作台 UI：原始流水回放视图（会话审计页）；产物查看入口（轨迹 tool_result 行挂「查看全文」）；
- LW/EP 宿主接入 transcript/artifacts（业务表权威形态的收益评估）；
- verifier/planner 蒸馏等内部调用的独立模型档位（当前仅 summary/叶子任务/子代理）；
- 步级自动模型路由（观察 spawn_subagent 显式声明的使用效果后再定）。
