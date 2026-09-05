# 21 · 开源采纳决策与规格整合（AI SDK v6 路线）

> Agent Loop Harness ｜ 2026-09-06 ｜ 状态：**已定稿（本次整合的决策记录）**
> 性质：本文是 2026-09-05/06 开源调研 + 运行级 spike + 规格集对齐的**决策锚点**；
> 12/13/14/15 号规格已按本文结论修订（各文末"2026-09-06 修订"节）。
> 调研全文：`docs/design/2026-09-05-agent-harness-research.md`（v5）；
> 我方独立设计稿（已被本目录吸收）：`docs/design/2026-09-05-agent-harness-design.md`（v2）。

---

## 1. 决策一：LLM 循环与协议层采用 Vercel AI SDK v6（替代自研循环与逐家 provider 适配）

### 1.1 调研结论（详见调研文档）

- TS 原生 harness 全景 11 框架 + 5 个 harness 专项项目（open-harness / deepagentsjs / Archon /
  happyclaw / qm）全部 clone 读码；
- **选定**：`ai@^6` 作为模型调用+循环+工具协议底座；`@openharness/core@^0.7` 按需取模块
  （Session/压缩/持久化/审批回调）；`@ai-sdk/openai-compatible` 做动态 provider。
- **对 13 号规格的影响（重大）**：自研逐家 provider 适配（§5.3 十家适配表）中，
  OpenAI 兼容系 7 家由 `@ai-sdk/openai-compatible` 一个包覆盖；Anthropic/Google 由
  `@ai-sdk/anthropic`、`@ai-sdk/google` 官方包覆盖（tool_use 块 / functionCall 的
  序列化与流式增量解析均在 AI SDK 内实现）。**13 号的契约（类型/错误分类/能力检测/
  降级协议/审计表）保留，实现载体换为 AI SDK provider 层。**

### 1.2 运行级 spike 验证（/tmp/agent-spike，MockLanguageModelV3）

| 契约 | 结果 |
|---|---|
| 工具循环（decide→tool→result→final，maxSteps） | ✅ |
| 审批挂起（`approve: async (tc) => boolean`；false → 工具不执行、tool.error、对话继续） | ✅（12 号 human_request 通道的可选快路径） |
| 会话持久化（SessionStore{load,save,delete}；显式 load() 恢复） | ✅ |
| 自动压缩（两阶段：先剪枝旧工具结果，不足再 LLM 摘要；compaction.* 事件链） | ✅（12 号开放问题 1 的"摘要压缩"直接获得） |
| abortSignal 贯穿到 doStream 调用参数（85ms 干净终止） | ✅ |
| onBeforeSend 每次调用前改写消息（上下文分层装配挂载点） | ✅ |
| createOpenAICompatible 按请求动态构造 | ✅ |

### 1.3 版本与工程红线（违者即埋坑）

1. **钉 `ai@^6.0.277`**：ai@7 要求 Node≥22，Electron 28（内嵌 Node 18）不可用；
   package.json `overrides` 锁传递依赖，CI 加 `npm ls ai` 单版本断言。
2. **ESM-only 包禁顶层 import**：主进程 CJS 产物会打包失败——agent-runtime 内部一律
   `await import('ai')`（异步工厂），类型用 `import type`。
3. 归属：**`src/core/platform/agent-runtime/`**（三期重构后 packs→platform 依赖铁律；
   原 12 号规格的 `src/core/services/agent-runtime/` 路径已失效，全部按此迁移）。
   已有骨架 `src/core/agent/`（be56607f）M0 第一步 `git mv` 过去。

### 1.4 open-harness 风险与对冲

单人维护（contributors=1）、2026-02 创建、月下载 ~1.6k。对冲：core 仅 ~5k 行、
依赖面 3 个包，弃更可 fork 自维护；A 路线（裸 ai@6 + 自研薄层）是天然退路——
两路线共用同一 provider-adapter，切换成本≈0。

---

## 2. 决策二：工具系统确认为通用平台模块（14 号规格的定位强化）

**问题**：工作流引擎和其他业务模块是否也需要调用工具？工具要不要通用包？
**结论：要，且 14 号规格 AgentToolRegistry 就是这个通用模块**，本次整合把它的服务面
从"给 agent-loop 用"扩展为三类消费者 + 四种来源：

- **消费者**：① agent 循环（LLM 驱动选工具）；② 工作流节点（config 驱动直调——
  即路线 A 受限直调的推广：任何节点 handler 可作为库函数被业务复用）；
  ③ 业务包代码（definition 声明工具，直接 execute）。
- **来源**（14 号 §3 扩展）：`node:` / `tool:preset:` / `tool:custom:` / `oas:` 之外
  **新增 `pack:`（业务包工具，如 story-room 的 save_story_entity）**；后期 `mcp:`。
- 我方设计稿的 `AgentToolDef`（zod schema + execute + requiresApproval + approvalCard）
  与 14 号 `AgentToolSpec`（jsonSchema + dangerLevel + executor）**统一为同一模型**
  （zod↔JSON Schema 双向转换；requiresApproval 与 dangerLevel 批准策略二选一取严）。
  详见 14 号修订节。

## 3. 决策三：记忆模块确认为通用平台模块，融合既有图谱（15 号规格扩展）

**问题**：记忆很多业务都要（长文一致性尤甚）；已有图谱功能能否融合成通用记忆模块？
**结论：能，且必须**。15 号规格的飞轮是通用记忆模块的完整设计；本次整合新增
**结构化记忆存储（图谱）** 作为与 memory_entries（文本+向量）并列的第一等存储：

- 抽象 `StructuralMemoryStore` 接口（节点/边/时间点状态/时间线）——直接以长文图谱
  `GraphService` 的 API（`stateAt` / `edgesAt` / `getTimeline` / `resolveEntities`）为蓝本；
- `lw_events` + `lw_graph_edges` 表模式泛化为 `agent_graph_nodes/edges`（scope_id + user_id +
  实体类型 + 生效章节/时间点版本化）；长文图谱为第一个实现与迁移对象（故事研讨室的
  设定集一致性直接受益）；新业务（EP 资产关系、diary 人物事件）复用同一 schema 模式；
- `ConsistencyService` 的 R1-R6 规则扫描泛化为**可插拔一致性验证器**，双重身份：
  ① 质量门（17 号）的工具验证器一种；② agent 工具（`check_consistency`，模型可自查）。
- 详见 15 号修订节（含对 12 号上下文装配的输入：故事研讨室快照 = graph.stateAt(当前章)）。

## 4. 决策四：宿主模型与状态持久化的融合

12 号的 `AgentHost` 契约（loadState/saveState/suspend/emitTrajectory/emitStream/signal）
**保持不变**，是 harness 与宿主解耦的核心。融合点：

| 宿主 | state 落点 | 循环载体 |
|---|---|---|
| 工作流 agent-loop 节点 | `workflow_node_runs.state_json`（E2） | AI SDK + open-harness Session（经适配器把 host.saveState 桥到 SessionStore） |
| **独立宿主（聊天/故事研讨室，本次新增）** | `agent_sessions` 表（SessionStore 的 DB 实现，ALS 隔离） | 同一 Session，approve 回调 = 12 号 human_request 的快路径 |

即：**open-harness Session 是 AgentHost 的"独立宿主"缺省实现**；工作流宿主经
E2/E3（state_json + resume 回调）包装成 SessionStore + approve。
我方设计稿的 AgentRuntime 门面（registerDefinition/sendMessage/cancel/decideApproval/
subscribe/health）成为**独立宿主的对外 API**；两宿主共用 tool-registry/context 组装/
事件桥（事件经 agent-producer 双路径：直推 + 平台事件总线，聚合 `agent_session`）。

## 5. 规格集修订清单（本次整合落点）

| 文档 | 修订 |
|---|---|
| README.md | 状态更新（10 已实现/18 部分落地/本文新增）；"单一事实源"声明 |
| 01-design-spec.md | §7.1 路径迁移 platform/；§8 协议载体改 AI SDK；索引补 21 |
| 02-implementation-plan.md | M1 范围换 AI SDK 接入（spike 已验）；前置完成项标注 |
| 12-agent-runtime.md | 修订节：循环载体=ai@6+open-harness；宿主融合（§4 上表）；spike 证据映射；单测基线补充 |
| 13-ai-tool-calling.md | 修订节：实现载体=AI SDK provider 层；十家适配表坍缩为包依赖；PromptToolCodec 保留为 harness 级降级；版本红线 |
| 14-tool-registry.md | 修订节：新增 `pack:` 来源；AgentToolDef↔AgentToolSpec 统一模型；三类消费者 |
| 15-memory-flywheel.md | 修订节：StructuralMemoryStore 图存储融合；一致性验证器通用化；status 增 `conflicted`；快照装配读图 |

## 6. 里程碑映射（我方 M0-M5 → 本目录 M1-M4）

| 本目录分期 | 内容（含 AI SDK 路线后） | 对应我方里程碑 |
|---|---|---|
| M1 地基 | journal（11 号，不变）+ **AI SDK 接入**（provider-adapter/骨架迁移/钉版本）+ agent-loop 节点最小闭环（open-harness Session 载体）+ 轨迹表 | M0 + M1 前半 |
| M2 工具生态 | AgentToolRegistry（含 pack: 来源）+ 降级协议 + 轨迹视图 + token 观测 | M1 后半 + M2 |
| M3 长程 | 任务树 + 质量门 + 飞轮最小闭环（含图谱融合的 StructuralMemoryStore） | M3 |
| M4 业务化 | 审批缺口 + 野生 agent 迁移（长文/EP → 独立宿主 definition）+ 故事研讨室 | M2 迁移 + M4 |

每期验收沿用 02 号既有标准；新增门槛：**接线替换业务前模块单测全绿（语句 ≥85%）+
golden 对照 + 影子模式**（我方设计稿 G1-G5 门禁，作为 M4 迁移的执行纪律并入）。

## 7. 后续纪律

- **单一事实源**：harness 相关设计与实现一律以本目录文档为准；docs/design/ 下两份
  09-05 文档降级为"调研过程记录"，与本文冲突处以本文为准。
- 修订节格式：各规格文末追加 `## 2026-09-06 修订（21 号决策落地）`，不重写原文
  （保留设计演化史）；再次修订时以最新修订节为准。
