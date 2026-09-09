# 引擎「until 研究轮循环」设计（while/until loop for 主题深度研究）

日期：2026-09-09
分支：feat/domain-learning
文档目录：tasks/2026-09-09-topic-research-workflow/engine-while-loop-design.md
背景：用户否定了「主题深度研究」v2 把研究轮写死为 3 轮级联（"不能用循环吗？为什么要写死 3 轮？"）并立项：**让引擎支持"研究一轮→独立模型评估→不达标就再来一轮，直到验收通过或达预算上限"的真循环**。
本文档是引擎改动设计，**待用户评审后**按 TDD 实现。

---

## 1. 现状与限制（已核实，文件行证据）

- **loop 节点 = foreach**：`listExpression` 先解析成数组，逐项执行循环体；`executeLoopNode`（workflow-engine.service.ts:1782-1824）要求 list 为数组、长度 ≤ `exec.settings.maxLoopIterations`；空列表按 emptyPolicy skip/fail。
- **驱动是顺序 await**：`driveLoop`（:1827-1908）按 `results.length` 起每轮建独立 scope（`makeScopeKey(loopNodeId, i)` :141-142、`loopScopes` :224），设伪变量 `{item,index,list}`（:1842），激活 body → pump → `waitScopeSettled`（:1956-1965）→ 失败按 errorPolicy skip/fail → `collectIterationResult`（:1967-1985，取 loop-back 边源节点输出，无回边取 body 末个成功节点输出）→ push results → 全部跑完 `completeLoop`（:1987-2029，输出 `{results, count}`，route loop-done）。
- **为什么不能"while"**：① 现有驱动只认**预先算好的列表**，没有"按本轮结果决定是否再来一轮"；② 图不允许除 loop-back 外的环、loop 已完成不可再入、body 内禁嵌套 loop（graph-validator 规则 6/7/8）；③ 引擎作者把 while 明确列为 V2 扩展：`engine/control-semantics.ts:8` "V2 扩展路径：当子工作流 / while 循环等真实需求落地时…"。
- **利好**：引擎已是**逐轮顺序驱动 + 每轮独立变量作用域**——实现"重复执行同一段 body 直到条件满足"不需要图中成环、不需要节点重执行，只需给 loop 加一个 **until 驱动模式**，复用同一套 scope/挂起/失败语义。挂起（waiting_review/审批）在 body 内已支持（:1866 continueLoop :1934-1949、resumeSuspended）。

## 2. 设计目标

在**不破坏 foreach 语义**的前提下，为 loop 节点新增 until 模式：循环体每轮执行完后，引擎在**本轮作用域**内求值一个停止条件；满足则走 loop-done 收尾，不满足则进入下一轮；达 `maxIterations` 上限必收尾（结果里如实保留各轮产物，由模板自行决定"未收敛"的表达）。主题深度研究模板据此改为：body = 一轮研究(r) + 独立评估(e)（+ 打包），until = 评估通过，动态轮次、通过即提前结束。

## 3. 语义与配置

### 3.1 loop 节点 config（扩展后）

```ts
// foreach（现状，不变）
{ listExpression: string; emptyPolicy?: 'skip'|'fail'; errorPolicy?: 'fail'|'skip' }

// until（新增）
{ mode: 'until';
  stopExpression: string;   // 模板，引擎在每轮 body 收敛后、于该轮 scope 内解析
  stopValue?: string|number|boolean; // 停止值：解析结果 === stopValue 即收尾（缺省 'true'）
  maxIterations: number;    // 1..settings.maxLoopIterations；到达上限必收尾
  errorPolicy?: 'fail'|'skip' }
```

- 两种模式互斥校验：foreach 必须给 listExpression；until 不得给 listExpression（给了报错），必须给 stopExpression + maxIterations。
- 模板示例（主题研究）：`stopExpression: "{{pack1.verdict}}"`、`stopValue: "pass"`、`maxIterations: "{{start.maxRounds}}"`（深解析支持来自 start；校验时以运行期数值回检 ≤ settings.maxLoopIterations）。

### 3.2 执行语义

1. 启动（`executeLoopNode` 按 `cfg.mode==='until'` 分流）：无需列表；读 maxIterations（非法/超限按运行设置报错 fail）。
2. 每轮 `i`（从 `results.length` 续起，与 foreach 相同的断点续跑语义）：
   - 建 scope（key=loop:id:i），伪变量只给 `{index:i}`（无 item）；
   - 激活 loop-body → pump → `waitScopeSettled`（挂起/失败/错误策略 与 foreach 完全一致）；
   - `collectIterationResult`（loop-back 边源节点输出）push 进 results；
   - **停止判定**：把 `stopExpression` 当作模板在本轮 scope 内解析（与 body 节点模板同源同 resolver），`stringifyValue(结果) === stringifyValue(stopValue)`（缺省 stopValue='true'）→ 满足则结束循环；否则 `results.length >= maxIterations` 时结束。
3. 收尾 `completeLoopUntil`：输出 **`{ results, count: results.length, iterations: results.length, last: results[results.length-1] }`**，route loop-done；journal 事件沿用 loopStarted/loopIterationSettled/loopCompleted（payload 带 mode 与轮数），回放/续驱兼容。
4. body 全失败且 errorPolicy=fail → 循环失败（与 foreach 同）；skip → 记 `{error,skipped}` 进 results 并继续。
5. 无 body（防御）→ 直接收尾空 results。

### 3.3 每轮变量作用域与停止条件求值

- body 内节点模板本来就按轮 scope 解析（现 foreach 的 `{{search1.results}}` 同轮可见即先例），until 停止表达式复用同一 scope → 可引用本轮任何 body 节点输出（如 `{{e.parsed.verdict}}` / `{{pack1.verdict}}`）。
- **下游怎么拿"最后一轮"产物**：until 输出带 `last`（= 最后一轮迭代结果对象）。要求模板把需要外传的东西放进 **loop-back 边源节点输出**（如 pack 节点输出 `{notes, verdict, gaps, evalDigest}`），下游用 `{{round1.last.notes}}`、`{{round1.last.verdict}}`、`{{round1.iterations}}` 引用；同时 `results` 保留全部轮次（审计/复盘）。

### 3.4 护栏

- 图/运行时双层上限：validator 要求 until.mode 时 maxIterations ∈ [1, 全局 maxLoopIterations]；引擎启动再校验一次（对抗手工改库）。
- 复用既有 `settings.maxNodeRuns` 节点级死循环护栏（:1422-1431）与运行级 maxDurationMs。
- until 不引入新环：body 内部禁止嵌套 loop（沿用规则）；无 loop-back 出边的 until 循环在收尾期**不**自动反复（引擎显式按 maxIterations/stop 推进，不会静默自激）。

## 4. 改动面清单

### 类型与目录
1. `src/shared/types/workflow.types.ts`：loop config 联合类型（foreach | until）、`WorkflowNodeConfigMap['loop']` 分支化。
2. `src/shared/types/workflow-node-catalog.ts`：loop 默认/描述（可选 until 说明）；`workflow-node-forms.ts`：loop 表单加「迭代模式」切换与 until 字段（stopExpression/stopValue/maxIterations），foreach 字段在 until 时隐藏。

### 校验器
3. `src/core/platform/workflow/engine/graph-validator.ts`：loop 规则按 mode 分支——until 需 stopExpression+maxIterations、禁 listExpression；边规则不变（仍须 1 loop-body + 1 loop-done + loop-back 指向 loop；body 禁嵌套 loop）。
4. `src/core/platform/workflow/nodes/control-nodes.ts` loop handler `validateConfig` 同步按 mode 分支。

### 引擎
5. `workflow-engine.service.ts`：executeLoopNode 分流；新增 until 驱动器（`driveUntil`/`continueUntil`/`collectIterationResult` 复用/`completeLoopUntil`）；伪变量、stop 求值、护栏、journal payload、resume 续驱。foreach 路径零改动（回归红线）。

### 模板（topic-research v3：从 3 轮级联改 until 循环）
6. 图收敛为约 10 节点：`start(+maxRounds 输入) → clarify(form-collect) → plan1(llm-chat jsonMode) → round1(loop mode=until body: r(agent-loop 带预算) → e(llm-chat jsonMode, evaluatorModel) → pack(打包本轮 notes/verdict/gaps 为迭代结果; 实现选型见 §5) → loop-back) → writer(llm-chat jsonMode, 输入含 {{round1.last.*}} 与全部 {results}) → report1 → final1(human-review) → save1/end`。
7. r 的 task 改为"本轮带此前结论增量更新，输出完整浓缩进展（notes 含最新证据与遗留缺口）"；stopExpression=`{{pack1.verdict}}`, stopValue=`pass`；start 增 `maxRounds`（默认 5，范围 1-8，作 {{round1.maxIterations}} 来源）。
8. 测试：topic-research-graph.spec 改为 v3 断言（round1 为 until 循环、body 含 r/e/pack、stop 配置、writer 引用 round1.last、start 含 maxRounds）。

### 平台测试（TDD，先写红）
9. 引擎 until spec（新增 `tests/unit/core/platform/workflow/loop-until.spec.ts`）：
   - 正常路径：stop 条件第 k 轮满足 → 只执行 k 轮并 loop-done，输出 iterations=k、last=第 k 轮结果；
   - 上限路径：永不满足 → 执行 maxIterations 轮后收尾（不失败），results.length=maxIterations；
   - 每轮作用域隔离：第 2 轮 stop 表达式能看到第 2 轮的输出、看不到第 1 轮（伪变量 index 正确）；
   - 与挂起/恢复：body 内有 waiting_review → 恢复后续跑并正确判 stop（对齐 foreach 挂起回归）；
   - errorPolicy=fail/skip 在 until 下行为一致；
   - 护栏：maxIterations 超 run 上限/非法 → 校验报错；
   - journal 事件含 mode/轮数；回放等价。
10. 回归：foreach 相关既有 spec（engine loop、daily-news-brief-flow、industry-research 类 graph/flow）全绿；validator/forms/catalog 一致性测试同步。
11. 全量：node-registry-consistency、workflow-node-catalog spec 同步（loop config 联合变化）。

## 5. pack 节点实现选型（实现时定，设计不锁死）
- 优先用既有 `assign`/`variable` 之外的最小做法：一个 **code 节点**（纯 JS 沙箱，输入引用本轮 `r`/`e` 输出，返回 `{notes, verdict, gaps}`）作为 loop-back 源——已有先例（v3 模板 writerMd 剥围栏）。若 code 节点对"引用整块模板产物"不便，则评估给 loop 迭代结果输出加 `lastScope`（不推荐，污染通用语义）。
- 迭代结果体积护栏：r.notes 要求"浓缩但保留证据锚"，writer 只用 last；results 全量仅用于审计/可选的差距历史提示。

## 6. 风险与边界
- until 循环无"无进展停滞"检测（引擎无停滞概念）：由每轮 agent 预算 + maxRounds 上限兜底；若需要"连续 N 轮 verdict 无变化即停"，可后续加（本轮不做，避免范围膨胀）。
- 上下文字面累积：notes 每轮全量重述会涨——靠 r 的浓缩纪律 + writer 只吃 last 控制；深档若 notes 超长导致单轮超时，由 agent 内 maxToolCalls/maxDurationMs 已兜底并如实汇报。
- foreach 全量回归是硬红线（模式分支零影响目标）；编辑器旧图（foreach）不受影响。
- 挂起（human-review/form-collect）在 body 内已有机制，until 复用；无人审批 timeoutMs=null 会挂起等待（沿用现状语义，非本次范围）。

## 7. 状态
- **设计待用户评审**。通过后按 TDD 落地：先红（loop-until spec + v3 图 spec + 目录/forms 一致性），再引擎/校验/表单实现 → 全绿 → 模板改 v3 → 回归 → eslint → 本地提交 → 用户真机对比。
