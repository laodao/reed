# 26 · M3 规格与实施计划（任务树 + 质量门 + 知识飞轮）

> 状态：执行中（2026-09-07）
> 上游：01 号 §4/§5/§6、02 号 §M3、12 号 §5（AgentHost）、23 号 §12（M2 契约增补）
> 节奏：同 M2——实现 → 单测 → subagent 对抗 review → 修复 → 文档同步（02/23/26 号）

## 0. 范围与批次

| 批 | 内容 |
|----|------|
| 批1 | 数据地基：agent_tasks 表 + workflow_runs 加 task_id/parent_run_id + agent_memory_entries 表 + 实体/仓储/双端迁移 |
| 批2 | 任务树：TaskService 状态机 + Planner（LLM 静态规划→整树人工批准→依赖调度）+ 重规划 + escalated |
| 批3 | 质量门：Verifier 四层（规则→工具→LLM 评判→人工）+ 带反馈重试 + 质量分沿树聚合 |
| 批4 | 飞轮：distiller 蒸馏 + 闸门（查重+置信度+默认人工批准）+ 读取装配进 agent-loop（轨迹可见引用） |
| 批5 | UI（任务树视图 + 记忆审批列表）+ 真模型端到端验收（3 层任务/必败链路/飞轮二轮命中） |

## 1. 数据模型（批1）

```
agent_tasks（01 号 §5.1 原样落地）
  id PK, owner_id, parent_id, root_id, depth, title,
  spec_json（目标/验收标准/输入输出契约/工具白名单/验证器配置）,
  status（pending/planning/ready/running/verifying/succeeded/failed/cancelled/escalated/replanned）,
  executor（agent_loop | sub_workflow:<definitionId> | human）,
  run_id, budget_json, quality_score, result_json, retry_count,
  error, created_at, updated_at
  索引：(root_id), (parent_id), (status)

workflow_runs 加列：task_id TEXT NULL, parent_run_id TEXT NULL（运行森林镜像任务树）

agent_memory_entries（01 号 §4.3 落地；kind: fact/sop/preference/skill/episode-ref）
  id PK, owner_id, kind, content_json（{title, content, tags?}）,
  embedding_id NULL（LanceDB 向量层复用位；M3 最小闭环=关键词检索，向量后置注记）,
  source_run_id, source_task_id, confidence, status（pending_review/active/archived/superseded）,
  use_count, success_count, supersedes_id, created_at, updated_at
  索引：(status), (kind), (owner_id)
```

## 2. 任务树（批2）

### 2.1 Planner
- `PlannerService.plan(rootGoal, opts)`：LLM（ProviderAdapter）生成任务树 JSON（每节点 title/spec{goal, acceptance, toolWhitelist?, verification?}/executor/children）→ **硬性约束：整树 status=pending_review，人工批准后才 ready（开放问题 3 采纳：整树一次批准）**。
- 校验：深度 ≤ MAX_TASK_DEPTH（缺省 4）、节点数上限、executor 白名单、acceptance 非空。

### 2.2 TaskService 状态机与调度
- 状态机：pending_review →(批准) ready →(依赖满足) running → verifying → succeeded/failed →（重试）ready /（重规划）replanned+新子树 / escalated。
- 调度：**不做新调度器**（01 号 §5.3）。TaskService 内部串联：任务终态后解锁后继（按 deps）→ 就绪任务逐个启动。sub_workflow 执行器经 runService.startRun（workflow_runs.task_id 回填）+ run 终态回调；agent_loop 执行器直接驱动 LoopRunner + 独立宿主（消息持久化经 AgentSessionStore，scopeKey=task:<id>；轨迹 sink scope='session' key=task:<id>）。
- 并发：同 root 内并发运行任务数受 budget_json.maxConcurrent 限制（缺省 1 串行，最小闭环）。
- 预算：retry 上限（缺省 2）、深度上限、（时长预算字段保留位，M3 不实现计时扣减）。

### 2.3 重规划
- 任务 failed 且 retry 尽 → Planner 对该子树局部重分解（生成替代子任务，原任务标 replanned）→ 新子任务走同一质量门。重规划次数上限（缺省 1）防震荡；超限 escalated。

## 3. 质量门（批3）

- `Verifier.verify(task, output)` 四层（便宜优先，01 号 §6.2）：
  1. 规则：JSON 可解析 / spec.verification.requiredFields 非空 / 长度上下限——毫秒级必跑；
  2. 工具：spec.verification.codeCheck 存在时走 code_run 沙箱（仅桌面端；Web 端跳过并注记）；
  3. LLM 评判：rubric（相关性/完整性/事实性）→ 0-1 分 + 缺陷列表；
  4. 人工：质量分在灰区 [0.6,0.8) 或 spec.verification.humanRequired 或重试尽 → 任务 verifying + 待办（任务树 UI 内人工通过/驳回）。
- 带反馈重试：缺陷列表拼回任务输入（Reflexion 式）重跑，retry_count++。
- 聚合：父任务 quality = 子任务均值（叶子计权 1）；根任务可见子树健康度。
- 失败链：重试尽 → 子树重规划 → escalated（人工）。

## 4. 知识飞轮（批4）

- **distiller**：任务 succeeded 后从轨迹蒸馏 ≤3 条候选（LLM：可复用的做法/事实/SOP），confidence 自评，status=pending_review。
- **闸门**（宁可慢不可脏）：① 查重——canonicalKey 精确 + 与既有 active 条目关键词重叠率 > 阈值判重；② confidence < 0.7 丢弃；③ **默认人工批准**（记忆审批列表）。
- **读取装配**：agent-loop 节点执行前按任务文本关键词取 active 条目 top-k（≤3）注入 system prompt（「相关经验」段），并在轨迹 emit `kind:'decision'` 的 payload.memoryRefs（验收：轨迹中可见引用）。
- **代谢**：`archiveStaleEntries`（use_count=0 且超过 N 天归档）挂 TaskService 批处理入口（M3 最小；cron 后置）。
- LanceDB 复用：embedding_id 列 + 服务接口留位；M3 最小闭环用关键词匹配（embedding 依赖用户配置 Embedding 提供商，向量检索随真实需求后置——01 号 §4.4 的"直接复用"在批4 以接口位兑现）。

## 5. UI（批5）

- 任务树视图页（`/agent-tasks`）：树形展示状态/质量分/重试次数/重规划按钮/escalated 与 verifying 的人工处理（通过/驳回）。
- 记忆审批列表页（`/agent-memory`）：pending_review 列表（内容/来源 run/置信度）+ 批准/归档；顶栏入口。
- IPC（双端成对）：task:create-plan/approve-plan/list/get/retry/replan/escalate-decide/verify-decide；memory:list-pending/list-active/approve/archive。

## 6. 测试与验收

- 单测：迁移/仓储（真实 sqlite）、TaskService 状态机（fake LLM 走真实 streamText 路径——复用 loop.spec 的 fake ProviderAdapter 模式）、Verifier 四层与聚合、飞轮闸门（查重/置信度/人工批准）、装配命中。
- 端到端（真模型，DashScope）：
  1. 三层任务（如"调研 X 并产出带来源的报告"）计划人工批准 → 子任务过质量门 → 根验收通过；
  2. 必败子任务：带反馈重试 → 重规划 → escalated 全链路；
  3. 飞轮：首轮成功任务蒸馏条目经批准入库 → 二轮相似任务装配命中（轨迹可见 memoryRefs）。

## 7. 显式裁剪

- 时长预算扣减、跨副本互斥、向量检索真实接线、cron 代谢——后置注记。
- Planner/Verifier/ distiller 的 LLM 调用统一走 ProviderAdapter（qwen 等），失败结构化报错不吞。

---

## 8. 实施结果（2026-09-07）

五批全部落地：批1 数据地基（三迁移双端成对）、批2 TaskService+Planner、批3 Verifier 四层、批4 飞轮、批5 UI（Agent 任务树 /agent-tasks + 知识飞轮 /agent-memory 双页 + 菜单入口）。

### 8.1 对抗 review（两路：逻辑正确性 / 接线租户）

P0×2 / P1×5 / P2×14 / P3×10，全部 P0/P1 与绝大多数 P2 已修：

**P0**：T1 createPlan 根 id≠rootId（整树不可见不可批——主链路断）；T2 replanned 死状态（重规划成功路径整体死路）。
**P1**：T3/W4 盲 patch 竞态（CAS patchFromStatus 全终态迁移收口）；T4 schedule 丢唤醒（脏标记重泵）；W2 审批 IPC 内联跑树（fire-and-forget 启泵 + ALS 经 promise 链保持）；W1 runSubWorkflow 盲等（skipped 即败/waiting_review 放宽死线/超时取消僵尸运行）；W3 Web 端 5 通道缺 wrap（参数形态断裂）；W5 页面无菜单入口；W7 M3 装配不校验 M2 harness。
**P2 重点**：T5 执行异常先重试；T7 聚合硬规则（子非 succeeded 即败）+ 聚合分=子均值（T14 实装）；T11 humanRequired 先于 pass；T12 低分首试一律 retry；T8/T9 飞轮真实回写+装配轨迹留痕；T16 深度口径/prompt 占位；B6 同源原型链防御；W6 任务会话持久化（DbAgentSessionStore）；W14 PG schema 限定；W13 UI 容错。

### 8.2 验收（真模型 DashScope，scripts/p5-agent-task-e2e.ts）

- A 三层任务：LLM 规划 3 节点树 → 人工批准 → 子任务过质量门（1.00/0.95/0.97）→ 根 succeeded ✅
- B 必败链路：规则层必败 → 带反馈重试 ×2 → 重规划（深度预算收紧）→ 深度到顶 escalated ✅
- C 飞轮：蒸馏 2 条入 pending → 人工批准 → 二轮相似任务装配命中 3 条 ✅
- 单测：m3-core 16 例 + 仓储 4 例全绿；全量失败集与 M2 基线零差异；tsc 934 < 基线 938（顺手收净 portraitPromptTemplates 既有债务）

### 8.3 遗留（登记）

- T10/T12-裁剪注记：spec.deps 依赖调度未实现（调度纯按树序）、agent_tool_calls 无 at: 读取面——已并入裁剪清单；at:retry/at:replan 通道未开（人工重试走 escalateDecide('retry')）
- T18 canonicalKey 精确查重字段；T19 崩溃后 running 行对账（重启重置 ready）；W12 代谢 cron 接线
- 重规划风暴：LLM 重规划在深层树上耗时较长（深度预算已兜底终止性）；maxConcurrent 串行（budget 字段保留）
- 向量检索真实接线（embedding_id 留位）；human 执行器（M4 待办中心）
