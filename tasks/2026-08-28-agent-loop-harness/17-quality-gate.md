# 17 · 质量门与验证器体系（Quality Gate & Verifiers）

> Agent Loop Harness ｜ 2026-08-28 ｜ 状态：设计中
> 总纲契约：[01-design-spec.md](./01-design-spec.md) §6（支柱四）；分期：[02-implementation-plan.md](./02-implementation-plan.md) M3

## 1. 目标与范围

**目标**：实现 01 §6 定义的支柱四——"子任务没有'完成'，只有'通过验收'"。为 AgentRuntime 提供一套分层的验证器体系（规则 → 工具 → LLM 评判 → 人工验收），配套带反馈重试环、升级链、质量分沿树聚合、验证结果回写知识飞轮、成本护栏。

**范围内**：

- `Verifier` 接口与四层实现（规则 / 工具 / LLM 评判 / 人工验收）的详细设计；
- 任务 spec 中验收标准（acceptance criteria）的声明格式；
- 带反馈重试环（Reflexion 式）与升级链（重试耗尽 → 重规划 → escalated）；
- 质量分模型（单层得分 → 任务得分 → 沿树聚合）与灰区策略；
- 验证结果回写飞轮（`memory_entries.success_count` 更新协议）；
- 按任务类目的验证策略配置表、防"验证器被骗"对策、LLM 评判成本护栏。

**范围外**：审批人指派与操作者校验（属 M4 业务化，见 lan-collab 文档 E1-E4 与 01 §10 E6）；验证器对非 agent 工作流节点的直接复用（质量门一期只挂在任务树上，工作流节点级复用是开放问题 §12）。

## 2. 现状与差距（代码证据）

| 现有资产 | 证据 | 可用性 |
|---|---|---|
| code 节点 vm 沙箱：白名单安全全局、5s 超时、包装为函数调用取 return 值 | `src/core/modules/workflow/nodes/code-nodes.ts:20-56` | **直接复用**为工具验证的 JS 断言执行器；`runCodeInSandbox(code, inputs, timeoutMs)` 是纯函数，不依赖引擎上下文 |
| vm 沙箱自认非完整安全边界；Web 端（多租户服务端）被平台门禁禁用 | `code-nodes.ts:10-11, 76-83`（`process.versions.electron` 判定） | 工具验证在 Web 端受限，设计必须给出降级路径（§8） |
| human-review 节点：payload 送审、`waiting_review` 挂起、timeoutMs 可空 | `src/core/modules/workflow/nodes/task-nodes.ts:240-280` | 人工验收层复用其配置映射与挂起语义 |
| 引擎统一重试：`retryable` + `retryCount/retryDelayMs`，handler 禁自行重试 | `src/core/modules/workflow/engine/node-handler.ts:14`、`workflow-engine.service.ts:1127-1163` | 质量门的"带反馈重试"是**应用层**重试，必须与引擎这套瞬时故障重试正交（§6.2） |
| 全局上限：maxRetryCount=10、retryDelayMs 封顶 60s、codeTimeoutMs=5s | `src/shared/types/workflow.types.ts:1074-1092` | 质量门自建上限常量，不复用节点重试配置 |
| 引擎 maxNodeRuns 只数节点启动次数，对节点内循环无效 | `workflow-engine.service.ts:934-957`（01 §1.2 S6） | LLM 评判预算必须在 Verifier 层自建（§9.5 成本护栏） |

**差距**：全库无任何验证器、rubric 评分、验收标准结构——`agent_tasks.spec_json`（01 §5.1）只有"验收标准"一句话描述，无机器可执行格式；`agent_tasks.quality_score` 有列无计算逻辑。本文补齐全部。

## 3. 概念模型

```
AgentRuntime 收敛（converged）
      │
      ▼
QualityGate.evaluate(task, output)          ← 唯一入口，AgentRuntime 主循环末尾调用
      │  按策略（quality_policies）依序执行四层验证器
      ▼
L1 规则验证 RuleVerifier      毫秒级、确定性、必跑 ──fail──→ 直接判 fail（不进昂贵层）
L2 工具验证 ToolVerifier      能跑就跑（测试/编译/SQL dry-run/抽样核对）
L3 LLM 评判 LlmJudgeVerifier  按需（rubric 打分 + 缺陷列表 + 多次采样防偏置）
L4 人工验收 HumanVerifier      关键路径（高风险类目 / 灰区 / 重试耗尽）
      │
      ▼
Verdict = { decision: pass | retry | replan | escalate,
            score: 0-1, defects: Defect[] , evidence }
      │
      ├─ pass      → task.status=succeeded, quality_score 落库, 回写飞轮
      ├─ retry     → 缺陷列表结构化喂回 agent（Reflexion 式），再来一轮
      ├─ replan    → 交 TaskService 对该子树局部重规划（01 §5.2）
      └─ escalate  → task.status=escalated，挂起等人工（经宿主 suspend）
```

核心概念：

- **Check（检查项）**：验收标准的最小单元，机器可执行，有确定性判定或 LLM 判定。
- **Layer（层）**：便宜优先、昂贵兜底；任一层 fail 即短路，不向更贵层传播（配置可覆盖）。
- **Defect（缺陷）**：结构化失败反馈（checkId、层、描述、严重度、修复建议），是重试环的数据载体。
- **灰区（gray zone）**：质量分落在 `[grayLow, grayHigh)`（默认 `[0.6, 0.8)`，01 §6.2 锚定）时不自动 pass，升级人工。

## 4. 数据模型

01 §5.1 已定义 `agent_tasks`（含 `quality_score`、`retry_count`、`status` 的 `verifying`/`escalated` 取值）与 `memory_entries`（含 `use_count`、`success_count`），本文**复用不改**。新增两张表（**本文新增**）：

### 4.1 `task_verifications` —— 验证记录（每次评估一行，追加不改写）

**SQLite（PC 端）**：

```sql
CREATE TABLE task_verifications (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL,          -- agent_tasks.id
  run_id          TEXT,                   -- 产出被验证的那次运行
  attempt         INTEGER NOT NULL,       -- 本任务的第几次评估（从 1 起）
  layer_reached   TEXT NOT NULL,          -- rule / tool / llm_judge / human（短路在哪层终止）
  decision        TEXT NOT NULL,          -- pass / retry / replan / escalate
  score           REAL,                   -- 0-1；纯规则短路 fail 时可为该层得分
  defects_json    TEXT,                   -- Defect[]：[{checkId, layer, severity, message, suggestion}]
  layer_results_json TEXT,                -- 各层明细：每层的 checkId→{passed, score, detail}
  judge_meta_json TEXT,                   -- LLM 评判元数据：model、samples、各采样分数、token 用量
  verified_by     TEXT,                   -- 'system' 或人工验收操作者 id
  created_at      DATETIME NOT NULL,
  UNIQUE(task_id, attempt)
);
CREATE INDEX idx_task_verifications_task ON task_verifications(task_id, attempt);
```

**PostgreSQL（Web 端）差异点**：`TEXT`→`varchar`/`text`、`DATETIME`→`timestamp`、`REAL`→`double precision`；占位符 `$1,$2,...`（SQLite 为 `?`）；迁移函数按项目惯例写成单函数 `isPg` 分支（参照 `src/core/database/migrations/create-workflow-definition-versions.ts:14-50`），并在 PC/Web 两处初始化各注册一次。

### 4.2 `quality_policies` —— 类目级验证策略（本文新增；落实 01 §6.4"全局策略可配"）

```sql
CREATE TABLE quality_policies (
  id              TEXT PRIMARY KEY,
  category        TEXT NOT NULL,          -- 任务类目：code / writing / research / data / sql / default
  layers_json     TEXT NOT NULL,          -- 启用的层与顺序：[{layer:'rule'},{layer:'tool'},...]
  gray_low        REAL NOT NULL DEFAULT 0.6,   -- 灰区下界
  gray_high       REAL NOT NULL DEFAULT 0.8,   -- 灰区上界（≥ 此值自动 pass）
  max_retries     INTEGER NOT NULL DEFAULT 3,  -- 带反馈重试上限（应用层，与引擎重试无关）
  retry_backoff_ms INTEGER NOT NULL DEFAULT 2000, -- 重试基础退避（指数：×2^n，封顶 30s）
  judge_budget_tokens INTEGER NOT NULL DEFAULT 20000, -- 单次任务 LLM 评判 token 预算
  judge_samples   INTEGER NOT NULL DEFAULT 3,  -- LLM 评判采样次数（防偏置）
  adversarial_sample_rate REAL NOT NULL DEFAULT 0.1, -- 对抗性抽查比例（§9.4）
  updated_at      DATETIME NOT NULL,
  UNIQUE(category)
);
```

seed 行：`default`（rule+llm_judge）、`code`（rule+tool+llm_judge）、`sql`（rule+tool）、`writing`（rule+llm_judge，gray 0.5-0.85）、`research`（rule+llm_judge，judge_samples=5）。

### 4.3 `agent_tasks` 语义补充（不改表结构）

- `retry_count`：本文明确其语义为**质量门带反馈重试计数**（01 未注明计数对象），与引擎节点级 `retryCount` 无关；达到 `quality_policies.max_retries` 触发升级链。
- `spec_json` 内新增 `acceptance` 块（§5.1），向后兼容：无 `acceptance` 的旧任务按 `default` 策略 + 自然语言全文走 LLM 评判。

## 5. 接口设计

### 5.1 验收标准声明格式（任务 spec 内，机器可执行 + 自然语言双层）

```ts
/** spec_json.acceptance —— Planner 生成任务树时一并生成（01 §6.1） */
interface AcceptanceSpec {
  /** 机器可执行检查项（顺序执行；layer 决定由哪层验证器消费） */
  checks: AcceptanceCheck[];
  /** 自然语言验收标准：供 LLM 评判与人工验收阅读；与 checks 并存，
   *  checks 为空时 LLM 评判仅据此打分 */
  narrative: string;
  /** 覆盖类目策略的字段（可选，缺省用 quality_policies 表） */
  overrides?: Partial<Pick<QualityPolicy, 'grayLow' | 'grayHigh' | 'maxRetries'>>;
}

type AcceptanceCheck =
  | { id: string; layer: 'rule'; rule: RuleExpr }                    // §5.2 DSL
  | { id: string; layer: 'tool'; tool: ToolCheckSpec }               // §5.3
  | { id: string; layer: 'llm_judge'; rubric: RubricCriterion };     // §5.4
```

### 5.2 L1 规则验证：RuleExpr DSL

刻意做成**无 eval 的纯数据 DSL**（规则验证必须确定性且不可被注入）：

```ts
type RuleExpr =
  | { op: 'json_parseable' }                                   // 输出可 JSON 解析
  | { op: 'schema'; schema: Record<string, unknown> }          // JSON Schema 校验输出
  | { op: 'required_fields'; fields: string[] }                // 路径存在（a.b[0].c）
  | { op: 'length'; path?: string; min?: number; max?: number }
  | { op: 'regex'; path?: string; pattern: string; flags?: string }
  | { op: 'equals'; path: string; value: unknown }
  | { op: 'contains'; path: string; value: string }
  | { op: 'and' | 'or'; exprs: RuleExpr[] }
  | { op: 'not'; expr: RuleExpr };
```

实现为纯解释器（~150 行），递归求值、无函数构造、regex 强制长度上限 500 字符防 ReDoS 投放。

### 5.3 L2 工具验证

```ts
type ToolCheckSpec =
  /** JS 断言：复用 code 节点沙箱 runCodeInSandbox（code-nodes.ts:47-59）。
   *  断言代码拿到 inputs.output / inputs.expected，return true/false/{passed,message} */
  | { kind: 'js_assert'; code: string; timeoutMs?: number }
  /** 测试执行：assertions 数组逐条 js_assert（模拟"跑测试"的轻量形态） */
  | { kind: 'test_suite'; assertions: Array<{ name: string; code: string }>; timeoutMs?: number }
  /** SQL dry-run：EXPLAIN/解析校验，不执行写操作；走 data-table 已有连接，强制只读语句白名单 */
  | { kind: 'sql_dry_run'; dataSourceId: string; sqlPath: string }
  /** 编译检查（M3 只做 js/ts 语法级：new vm.Script 编译不运行） */
  | { kind: 'compile'; language: 'js' };
```

**安全边界**：`js_assert`/`test_suite` 走与 code 节点完全相同的 `SAFE_GLOBALS` 白名单 + `WORKFLOW_LIMITS.codeTimeoutMs`（5s）超时；**Web 端禁用**（同 code 节点门禁，`code-nodes.ts:76-83`），Web 端策略中 tool 层自动降级为跳过并记 `layer_results_json.skipped='web_disabled'`。SQL dry-run 只放行 `SELECT/WITH/EXPLAIN` 开头语句，连接强制只读事务。

### 5.4 L3 LLM 评判

```ts
interface RubricCriterion {
  id: string;
  name: string;                 // 相关性 / 完整性 / 事实性 / 格式…（01 §6.2 锚定前三项）
  description: string;          // 评分细则（打分 prompt 的一部分）
  weight: number;               // 层内加权，总和归一
  scale: [number, number];      // 默认 [0,1]
}

interface JudgeResult {
  criterionScores: Array<{ criterionId: string; score: number; rationale: string }>;
  defects: Defect[];            // 结构化缺陷（喂回重试环）
  aggregatedScore: number;      // 层内加权后 0-1
  meta: { model: string; samples: number; sampleScores: number[]; tokensUsed: number };
}
```

**防偏置措施**（本文新增，落实 01 §6.2"rubric 打分"）：

1. **多次采样**：同 prompt 独立调用 `judge_samples` 次（默认 3），取**中位数**为该项得分；样本极差 > 0.3 视为评判不稳定 → 该 check 降级进灰区（交人工），不取均值掩盖分歧。
2. **位置交换**：成对比较场景（A/B 产出选优）两次调用交换呈现顺序，两次结论一致才采信；不一致判平局进灰区。单项打分场景不适用，靠采样兜底。
3. **独立验证上下文**（防骗核心，见 §9.4）：评判模型**只看 task.spec + 产出**，不看 agent 轨迹/自我陈述；评判 provider 默认与生成 provider 不同（可配 `judgeProviderConfigId`）。
4. 打分 prompt 模板（固定结构）：`[任务目标][验收标准 narrative + 本 criterion 细则][产出全文/截断至 maxOutputChars 摘要][输出 JSON：{score, rationale, defects[]}]`，jsonMode 复用 llm-chat 的 3 次解析重试模式（`task-nodes.ts:209-229`）。

### 5.5 L4 人工验收：复用 human-review 的配置映射

Verifier 不新建人机通道，把验收请求翻译成宿主挂起（01 §7.2 的 `host.suspend`），工作流宿主下落到引擎 `waiting_review`。配置映射：

| HumanVerifier 字段 | human-review 节点字段（`task-nodes.ts:244-279`） |
|---|---|
| `payload.task`（目标+验收标准） | `payload`（送审内容，批准/驳回/修改后批准三态） |
| `payload.output`、`payload.defects`、`payload.score`、历次 `task_verifications` 摘要 | 同上，打包进 payload |
| `payload.allowEdit=true` | 对应 `approved_with_changes`（修改版产出即验收通过的新 output） |
| `timeoutMs`（策略可配，null=无限等） | `timeoutMs`（null 无限等待） |

人工决策回映：`approved`→pass（score 取人工前各层得分或 1.0）；`approved_with_changes`→pass 且以修改版为最终 output（**重跑 L1 规则验证**防改坏）；`rejected`→按缺陷走 retry/replan/escalate。跨重启恢复依赖 01 §3/E3 的 `resume()` 回调——人工验收是 E3 的首个真实消费方。

### 5.6 核心服务接口（`src/core/services/agent-runtime/verifier.ts`）

```ts
interface Verifier {
  readonly layer: VerificationLayer;            // 'rule' | 'tool' | 'llm_judge' | 'human'
  /** 执行本层全部 checks；返回层结果（含逐 check 明细与缺陷） */
  verify(ctx: VerificationContext, checks: AcceptanceCheck[]): Promise<LayerResult>;
}

interface VerificationContext {
  task: AgentTask;
  output: unknown;                              // 被验证产出（人工改后版会替换它）
  policy: QualityPolicy;
  host: AgentHost;                              // suspend 能力（人工层用）
  judgeBudget: TokenBudget;                     // 成本护栏句柄（§9.5）
  attempt: number;
}

interface QualityGateService {
  /** 主入口：按策略依层执行，短路 fail，聚合得分，落 task_verifications，返回 Verdict */
  evaluate(task: AgentTask, output: unknown, ctx: { host: AgentHost; runId?: string }): Promise<Verdict>;
  /** 反馈构造：把 Verdict.defects 渲染为 Reflexion 消息，喂回 agent 重试轮 */
  buildRetryFeedback(verdict: Verdict): AgentMessage;
  /** 质量分沿树聚合：子任务 pass 后重算祖先链 quality_score（§9.2） */
  propagateScore(taskId: string): Promise<void>;
  /** 飞轮回写：pass/fail 终态时更新 memory_entries.use_count/success_count（§9.3） */
  writebackMemory(verdict: Verdict): Promise<void>;
}
```

## 6. 状态机与关键时序

### 6.1 验证状态机（挂在 `agent_tasks.status` 上，`verifying` 为既有取值）

```
running ──(agent 收敛)──▶ verifying ──┬─ pass ──────────────▶ succeeded
                                      ├─ retry 且 retry_count<max ─▶ running（计数+1，缺陷喂回）
                                      ├─ retry 且 retry_count=max ─▶ planning（子树重规划，01 §5.2）
                                      ├─ replan（方向性偏差）──────▶ planning
                                      └─ escalate / 灰区人工 ─────▶ escalated（挂起等人工）
escalated ──(人工 approved)──▶ succeeded；──(rejected)──▶ running 或 planning（依人工附言）
```

非法迁移：任何状态不得直接 `verifying→succeeded` 之外的"完成"；`verifying` 必须产生一行 `task_verifications` 才允许迁出（DB 层由服务保证，先写验证记录再改状态，同事务）。

### 6.2 带反馈重试环时序（文字时序图）

```
AgentRuntime          QualityGate            TaskService / Planner         宿主(引擎)
    │ 收敛 output        │                        │                           │
    │──evaluate()───────▶│                        │                           │
    │                    │ L1 规则(毫秒)           │                           │
    │                    │ L2 工具(沙箱)           │                           │
    │                    │ L3 LLM评判(预算内采样)  │                           │
    │                    │ 聚合 Verdict            │                           │
    │                    │ INSERT task_verifications ──┐                      │
    │                    │ UPDATE agent_tasks (同事务) ◀┘                      │
    │◀──Verdict(retry)───│                        │                           │
    │ buildRetryFeedback:│                        │                           │
    │ 缺陷列表→user 消息  │                        │                           │
    │ "上轮产出未通过验收:│                        │                           │
    │  [checkId] 缺陷…   │                        │                           │
    │  修复建议…"        │                        │                           │
    │ 退避 backoff×2^n   │                        │                           │
    │──继续主循环────────▶（新一轮迭代，轨迹照常落 agent_trajectories）          │
    │ …（重试耗尽）       │                        │                           │
    │                    │──Verdict(replan)──────▶│ 局部重规划该子树           │
    │                    │                        │ 失败 → escalate ─────────▶│ waiting_review
    │                    │                        │                          │（人工仲裁，E3 resume 恢复）
```

### 6.3 与引擎重试语义的关系（关键边界）

两套重试**正交、互不感知**：

- **引擎重试**（`workflow-engine.service.ts:1137-1162`）：管节点瞬时故障（网络抖动、限流），handler 禁自行重试（`node-handler.ts:14`）。agent-loop 节点整体崩溃/超时走这套。
- **质量门重试**（`agent_tasks.retry_count` vs `quality_policies.max_retries`）：管"产出跑出来了但没通过验收"，发生在 AgentRuntime 内部循环，对引擎透明——节点一直处于 running，不触发引擎重试，也不消耗 `maxNodeRuns`（S6 的护栏由 guardrails 与评判预算共同兜底）。
- 冲突规避：质量门重试期间节点内迭代计入 `maxIterations`（01 §7.3），两护栏取先触发者。

## 7. 失败模式与边界情况

逐条（"崩溃在 X 与 Y 之间"）：

1. **崩溃在 LLM 评判调用中途**：`task_verifications` 未写入，`agent_tasks.status` 仍是 `verifying`（进入评估前已置位）。重启后恢复流程（01 §3 journal 重放）发现 `verifying` 无对应验证记录 → **整次评估重来**（验证器必须幂等：规则/工具天然幂等；LLM 评判重跑只是多花 token，预算按 attempt 记不重复扣）。代价：至多浪费一次评判调用。
2. **崩溃在 INSERT task_verifications 与 UPDATE agent_tasks 之间**：两写在同一事务（§6.1 约束），不存在此窗口。实现纪律：禁止拆成两次调用。
3. **崩溃在人工验收挂起后、决策前**：即 01 §1.2 S1 场景——靠 E1 journal + E3 resume 解决；`reviewDecide` 对非活跃挂起 run 先 rehydrate 再应用（02 M1 验收项）。本文不另建机制。
4. **人工 approved_with_changes 把产出改坏**：映射规则（§5.5）要求修改版**重跑 L1 规则验证**；若规则 fail → 不当 pass，回到 retry（attempt+1），人工改动不白丢——缺陷列表注明"人工修改版未过规则校验"。
5. **LLM 评判输出不可解析**：复用 jsonMode 3 次重试（§5.4-4）；仍失败 → 该 check 记 `judge_error`，不猜分，直接进灰区走人工。宁可贵不可错。
6. **工具验证沙箱超时/死循环**：`runInContext` timeout（5s）抛错 → 该 check 判 fail（缺陷：执行超时），不做二次重试（确定性代码重跑无意义，区别于 LLM 评判）。
7. **Web 端策略配了 tool 层**：降级跳过（§5.3），若类目只剩 tool 层（如纯 sql_dry_run 策略在 Web 端）→ 策略加载时校验并报配置错误，禁止"静默零验证通过"。
8. **重试反馈把上下文撑爆**：缺陷消息注入前经 `guardrails` token 检查；`buildRetryFeedback` 只带**最近一轮**缺陷 + 累计已修复 checkId 清单，不带全历史；超预算时截断 defects 保留 severity 高者。
9. **聚合得分时兄弟任务还在跑**：`propagateScore` 只聚合**已终态**子任务，父任务得分标记 `partial=true`（本文新增字段存于 `result_json` 内，不改表）；全部终态后才算正式分并决定是否触发根级健康检查（01 §5.2）。
10. **对抗抽查自身失败**（抽查模型不可用）：抽查是旁路审计，失败只记日志不阻塞主链路。

## 8. 安全与权限

- **沙箱边界**：vm 非完整安全边界（`code-nodes.ts:10-11` 自认），工具验证继承同一信任假设——断言代码来自 Planner/人工配置的 acceptance，不来自被验证的 agent 产出本身；**agent 产出永远只作为 `inputs` 数据进入沙箱，不作为代码执行**。Web 端禁用同 code 节点（§5.3）。
- **凭据隔离**：验证全链路 LLM 不可见明文凭据（01 §9 原则）；SQL dry-run 连接由 data-table 服务持有，Verifier 只传 `dataSourceId`。
- **出网**：LLM 评判走 provider 层既有通道；验证器不新增出网点。若未来加"URL 可达性核对"类 tool check，必须过 `validateOutboundUrl`（01 §1.1 SSRF 闸门）。
- **权限**：人工验收一期沿用 runId+nodeId 可见即可审（与现状一致）；审批人指派与操作者校验在 M4（01 §10 E6）。`quality_policies` 表的写权限限 admin。
- **注入防护**：打分 prompt 中 agent 产出以明确边界包裹（`<<<OUTPUT ... >>>`），且评判上下文不含工具（纯打分，无 tool-calling），产出里的"忽略你的指令"无工具可用。

## 9. 与其他模块的契约

### 9.1 契约清单

- **01 §5 任务树**：消费 `agent_tasks`（status/quality_score/retry_count/spec_json.acceptance）；replan/escalate 通过 TaskService 状态迁移触发，Verifier 不直接改树结构。
- **01 §7 AgentRuntime**：主循环收敛后调 `QualityGate.evaluate`（01 §7.2 伪代码 `verifier.verify` 一行即本文全部）；`host.suspend` 是人工验收与 escalate 的唯一挂起通道。
- **01 §4 知识飞轮**：回写协议见 §9.3；上下文装配侧需在 `agent_trajectories` 或 `result_json` 记录本轮注入的 `memory_entry_ids`（**本文新增字段约定**，回写依赖它）。
- **11-run-journal（运行事件日志）**：质量门追加两类 journal 事件 `verify_completed`（payload：task_id、attempt、decision、score）与 `task_escalated`（payload：原因、缺陷摘要）（**本文新增事件类型**，已并入 11 号文档 §4.3 的 type 枚举）；验证本身不做独立 journal，恢复依赖引擎 run 级重放。
- **12-agent-runtime**：护栏常量（maxIterations 等）与本文 `judge_budget_tokens` 统一由 guardrails 模块记账。
- **lan-collab E1-E4 / 01 §10 E6**：M4 人工验收的 assignee 与操作者校验直接继承其结论，本文不重复设计。

### 9.2 质量分模型与沿树聚合（计算公式）

- **单层得分**：rule/tool 层 = 通过 check 数 / 总 check 数；llm_judge 层 = Σ(weight_i × criterion_i)；human 层 pass=沿用前序层得分（无则 1.0）。
- **任务得分**：`taskScore = Π(layerScore_i)`（连乘——任一层短板都会拉低总分，避免"高分层掩盖致命层"）；任一层短路 fail 时 `taskScore=0`。
- **沿树聚合**：`parentScore = Σ(budgetWeight_j × childScore_j)`，`budgetWeight_j = 子任务 j 预算 / 兄弟预算总和`（预算缺省则等权）；含 `escalated` 未决子树时父分封顶 0.5 并标 `partial`。
- **灰区策略**：`score ≥ grayHigh` 自动 pass；`< grayLow` 自动 retry/replan；区间内 → 人工验收。人工连续批准同类目灰区案例 ≥ 20 例且 LLM 分与人判定一致率 ≥ 90% 后，可在策略表收窄该类目灰区（运营动作，非自动）。

### 9.3 验证结果回写飞轮（`memory_entries` 更新协议）

任务**终态**（succeeded/failed/escalated 终结）时一次性回写，避免重试轮重复计数：

```
for entryId in task.result_json.used_memory_ids:   -- 本轮上下文装配实际注入的条目
  memory_entries.use_count += 1
  if verdict.decision == 'pass'（最终，不含中途轮）:
    memory_entries.success_count += 1
    confidence = confidence + α × (taskScore − confidence)   -- α=0.2 指数滑动
  else:
    confidence = confidence − α × confidence × 0.5           -- 失败温和衰减，不一次打死
updated_at = now()
```

约束：同一 `(task_id, entry_id)` 只计一次（去重键写入 `task_verifications.judge_meta_json.memory_writeback`）；回写与任务终态更新同事务。该协议是 01 §6.4"验收结果回写知识飞轮"的落地细节（**本文新增**），代谢作业（01 §4.2）据此按成功率衰减/归档。

### 9.4 防"验证器被骗"对策

agent 迎合检查而非真正完成（reward hacking）的四道防线：

1. **独立验证上下文**（§5.4-3）：评判者不见 agent 自述，只看 spec + 产出。
2. **检查项与生成解耦**：acceptance checks 由 Planner 在任务树批准时冻结，执行 agent 只能在 spec 中读到 narrative，**机器可执行 checks 不注入执行上下文**（agent 不知道精确的断言内容，无法针对性构造）。
3. **对抗性抽查**：按 `adversarial_sample_rate`（默认 10%）对已 pass 任务用**不同 provider 的更强模型**复判；复判 fail → 任务回退 escalated，原评判模型记入 `judge_meta` 供策略调参，且该条目不写飞轮 success_count（已写的回滚补偿：success_count−1）。
4. **人工兜底**：灰区与高风险类目强制人工（01 §6.2-4），这是最终防线的刻意保留。

### 9.5 成本护栏（LLM 评判预算）

- 单任务评判预算 `judge_budget_tokens`（默认 20k）：每次评判调用前预扣估计值，超限 → 跳过剩余采样（已得样本不足 2 个则直接进灰区人工，不强行打分）。
- 单任务评判调用上限 = `judge_samples × checks数 × (1+jsonMode重试)`，策略加载时静态预算检查，超 `maxTokens` 子树预算 10% 告警。
- 评判结果缓存：同 `(output_hash, rubric_hash, model)` 命中直接复用（输出未变的重试轮不重复评判 LLM 层，只重跑失败的低层）。
- 对抗抽查与重试轮评判**共用**任务预算，防重试环路烧穿。

## 10. 测试策略

- **单测**（TDD，每类一 spec）：
  - RuleExpr 解释器：全部 op + 嵌套 and/or/not + 非法 DSL 拒绝 + ReDoS 长 pattern 拒绝。
  - js_assert：沙箱逃逸尝试（`this.constructor.constructor` 等已知 vm 逃逸 PoC）必须失败；超时必死；Web 端（无 `process.versions.electron`）禁用生效。
  - LLM 评判：mock provider，验证采样中位数、极差>0.3 进灰区、位置交换逻辑、预算预扣与超限跳过。
  - 聚合：`Π` 连乘、预算加权、escalated 封顶 0.5、partial 标记。
  - 回写协议：幂等去重、同事务、对抗复判 fail 的 success_count 回滚。
  - `buildRetryFeedback`：截断、只带最近一轮缺陷。
- **集成**：必败任务全链路（02 M3 验收项）：retry×3 → replan → escalate → 人工 approved_with_changes → 修改版重跑 L1。
- **恢复测试**：评估中途杀进程（§7-1）、人工挂起隔天审批（E1/E3 联合）。
- **双端迁移**：SQLite/PG 各跑一遍（占位符 `?`/`$1` 差异，历史教训见 02 横切工作）。

## 11. 里程碑拆解

- **M1**：无（质量门依赖地基）。仅落本文接口评审，冻结 `acceptance` 声明格式，供 agent-loop 节点 spec 预留。
- **M2**：RuleExpr 解释器 + js_assert 工具验证（复用 code 沙箱）作为独立纯函数库先行，可被 M2 的 AgentToolRegistry 自测复用；`task_verifications`/`quality_policies` 双端迁移随 M2 尾或 M3 头落。
- **M3**（主战场，02 M3 范围第 2 条）：四层 Verifier 全量 + QualityGateService + 带反馈重试环 + 升级链（接 TaskService）+ 质量分聚合 + 飞轮回写协议 + 灰区人工验收（经 E3 resume）。验收对齐 02 M3：必败子任务走完"带反馈重试 → 重规划 → 升级人工"完整链路。
- **M4**：人工验收接 assignee/操作者校验（E6）；对抗抽查按类目灰度放量；灰区收窄的运营流程上线；ep/longwriting 迁移后其内部验收改走本质量门。

## 12. 开放问题

1. **质量门能否直接挂普通工作流节点**（不经任务树）？倾向：M4 后评估——机制已具备（human-review 本就引擎原生），缺的是"任意节点声明 acceptance"的 UX。
2. `js_assert` 断言代码的编写者：Planner 生成（快但可能写错）vs 人工批准任务树时审（慢但可信）？建议：Planner 生成 + 整树批准时随 spec 一并人工过目（02 开放问题 3 的粒度决策连带覆盖）。
3. SQL dry-run 对"产出是一段要执行的 DDL/DML"的任务：只读白名单不够用，是否引入一次性 scratch schema？M3 先不做，记失败缺陷交人工。
4. 评判模型与生成模型必须不同 provider 是否过强？同 provider 不同 model 是否可接受（成本考量）——待 M3 实测数据决策。
5. `taskScore=Π` 连乘对多 check 任务偏严（0.9³≈0.73），是否改几何均值？先按连乘上线，灰区带宽吸收误判，有数据再调。

---

*契约锚点：任务树/升级链（01 §5）、飞轮回写（01 §4、§6.4）、AgentRuntime 主循环与 AgentHost（01 §7）、引擎扩展点 E1/E3（01 §10）、分期（02 M3）。新增表与字段均已标注"本文新增"。*
