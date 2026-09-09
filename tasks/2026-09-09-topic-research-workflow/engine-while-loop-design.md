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
- 模板示例（主题研究）：`stopExpression: "{{pack1.result.verdict}}"`、`stopValue: "pass"`、`maxIterations: "{{start.maxRounds}}"`（深解析支持来自 start；校验时以运行期数值回检 ≤ settings.maxLoopIterations）。

### 3.2 执行语义

0. **语义命名**：`mode:'until'` = "重复执行循环体，直到 stop 条件满足"（与 while(未达标){…} 对偶）。引擎不做任意表达式求值，**停止判定只是"本轮作用域内解析出的标量 === stopValue"的等值比较**；需要更复杂判定时由 body 内节点（如 pack/code）把结果归一成可比较标量（如 verdict='pass'）。
1. 启动（`executeLoopNode` 按 `cfg.mode==='until'` 分流）：无需列表；读 maxIterations——若为数字字面量已在图校验阶段查范围，若为模板串（来自 start 等）在引擎启动时解析并回检 ≤ `settings.maxLoopIterations`，非法 → 节点失败（**retryable=false**，重试必再撞）。
2. 每轮 `i`（从 `results.length` 续起，与 foreach 相同的断点续跑语义）：
   - 建 scope（key=loop:id:i），伪变量**只给 `{ index:i, prev }`**（无 item；`prev = i>0 ? results[i-1] : undefined`，供循环体模板引用上一轮结果，如研究轮 r 的 task 注入上一轮 notes/gaps；引擎必须保证 prev 为 undefined/null 时模板路径解析**不抛错、渲染为空串**——实现前先核对 variable-resolver 容错，必要时补）；
   - 激活 loop-body → pump → `waitScopeSettled`（挂起语义与 foreach 完全一致）；
   - 失败策略：errorPolicy=fail（默认）→ 任一 body 节点失败即循环失败；**errorPolicy=skip → 该轮记 `{ error, skipped:true }` 进 results 并继续下一轮**（研究模板建议用 skip + writer 容错：LLM/jsonMode 偶发失败不应让整个研究中断）；
   - `collectIterationResult`（loop-back 边源节点输出）push 进 results；
   - **停止判定**：把 `stopExpression` 当作模板在本轮 scope 内解析（与 body 节点模板同 resolver），`stringifyValue(结果) === stringifyValue(stopValue)`（stopValue 缺省 'true'）→ 满足则结束循环；解析不出（如该轮被 skip）按"不满足"继续；`results.length >= maxIterations` 时无条件收尾。
3. 收尾走**独立函数 `completeLoopUntil`**（不改 foreach 的 `completeLoop(results, list)` 签名，避免 count 语义混乱）：输出 **`{ results, count: results.length, iterations: results.length, last: results[results.length-1] }`**，route loop-done；journal 事件沿用 loopStarted/loopIterationSettled/loopCompleted（payload 带 mode 与轮数），回放/续驱兼容。
4. 无 body（防御）→ 直接收尾空 results（count=0、last=undefined）。

### 3.3 每轮变量作用域与停止条件求值

- body 内节点模板本来就按轮 scope 解析（现 foreach 的 `{{search1.results}}` 同轮可见即先例），until 停止表达式复用同一 scope → 可引用本轮任何 body 节点输出（如 `{{pack1.result.verdict}}`）。
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
5. `workflow-engine.service.ts`：executeLoopNode 按 mode 分流；新增 until 驱动器（`driveUntil`/`continueUntil`/`completeLoopUntil`；collectIterationResult/waitScopeSettled 复用）；**resume/挂起续驱按 `exec.loopDrivers` 里 driver.kind 分流**（实现时先定位 resumeSuspended → continueLoop 的调用点，foreach 走原路、until 走 continueUntil）；stop 求值复用本轮 scope resolver；护栏、journal payload、伪变量。foreach 路径零改动（回归红线）。

### 模板（topic-research v3：从 3 轮级联改 until 循环）
6. 图收敛为约 10 节点：`start(+maxRounds 输入) → clarify(form-collect) → plan1(llm-chat jsonMode) → round1(loop mode=until, errorPolicy=skip, body: r(agent-loop 带预算) → e(llm-chat jsonMode, evaluatorModel) → pack(code: 打包 notes/verdict/gaps) → loop-back) → writer(llm-chat jsonMode, 输入 {{round1.last.result.*}} 与 {{round1.iterations}}) → report1 → final1(human-review) → save1/end`。
7. r 的 task 改为"本轮带此前结论增量更新，输出完整浓缩进展（notes 含最新证据与遗留缺口，≤~1500 字/轮）"；stopExpression=`{{pack.result.verdict}}`、stopValue=`pass`；start 增 `maxRounds`（默认 5，范围 1-8，供 {{round1.maxIterations}}）。writer 容错：任一轮被 skip 或到上限仍未 pass 时，按已有轮次照常成稿并把"未收敛/失败轮"如实写入方法与局限。
8. 测试：topic-research-graph.spec 改为 v3 断言（round1 为 until 循环（mode/stopExpression/stopValue/maxIterations/errorPolicy=skip）、body 含 r/e/pack 且 pack→loop-back、writer 引用 round1.last、start 含 maxRounds）。

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

## 5. pack 节点实现（已钉死）
- **pack = code 节点**（机制已核实 code-nodes.ts：config `{ code, inputs:[{key,value}] }`，inputs[].value 支持 {{}} 深解析注入沙箱；用户代码 `(function(inputs){...})` return 对象 → 节点输出 `{ result }`）。pack 的 inputs 引用本轮 `{{r.answer}}` 与 `{{e.parsed.…}}`，code 直接 `return { notes: inputs.notes, verdict: inputs.verdict, gaps: inputs.gaps }`；**loop-back 边源 = pack** → until 的迭代结果与 `last` 即 pack 输出，下游用 `{{round1.last.result.notes}}` / `{{round1.last.result.verdict}}`。
- ⚠️ **code 节点仅桌面端可用**（Web 多租户禁任意 JS 执行，code-nodes.ts:88-94）——模板含 code 即桌面语义（与 script-to-video-v3 用 code 的先例一致）；until 引擎能力本身不限平台，若未来要 Web 复用 pack，可另加"只读合并"原语（本期不做）。
- 迭代结果体积护栏：r.notes 纪律化浓缩（≤ ~1200-1500 字/轮、带证据锚），writer 只吃 last；results 全量仅用于审计/可选的差距历史。注意节点输出会被运行级 `maxOutputChars` 截断，deep 档确需更大时在运行设置上调（见 §6）。

## 6. 风险与边界
- 兼容红线：**foreach 行为与输出（{results,count}）完全不变**；until 只新增 mode 分支与独立收尾函数；旧图零影响。回归 = 引擎 loop 相关既有 spec 全绿。
- until 循环无"无进展停滞"检测（引擎无停滞概念）：由每轮 agent 预算 + maxRounds 上限兜底；需要"连续 N 轮 verdict 无变化即停"可后续加（本轮不做，避免范围膨胀）。
- 单轮失败：errorPolicy=skip 下失败轮记 {error,skipped} 继续，stop 对 skip 轮按不满足处理；模板 writer 必须容错（§4-7）。
- 输出体积与截断：节点输出受运行级 maxOutputChars 截断，`last`/`results` 大时会截断——控制 notes 每轮 ≤~1500 字；deep 档确需更大篇幅时上调该运行设置（不属本次引擎改动）。
- 上下文字面累积：notes 每轮全量重述会涨——靠 r 的浓缩纪律 + writer 只吃 last 控制；超长导致单轮触顶由 agent 预算护栏兜底并如实汇报。
- code 节点桌面限定（pack 依赖）已在 §5 说明；until 引擎能力本身不限平台。
- 编辑器旧 foreach 图不受影响；loop 表单按 mode 切换字段，向后兼容。
- 挂起（human-review/form-collect）在 body 内已有机制，until 复用；无人审批 timeoutMs=null 会挂起等待（沿用现状语义，非本次范围）。

## 7. 状态
- **已评审定稿（含自查修订：等值判定语义/单轮失败策略/双层校验/挂起按 kind 分流/独立 completeLoopUntil/输出截断/pack=code(桌面限定)/prev 伪变量）并实现（2026-09-09）**。
- 落地：types/catalog/forms/图校验/引擎驱动器(executeLoopNode 分流 + driveUntil/completeLoopUntil + prev 伪变量 + 快照序列化)/journal-replay(until 元数据与 driver 重建)；模板 v3 由 3 轮级联重构为 until 循环；loop-until.spec 4 例 + 回归 9 files 94 passed、eslint 0、本批 vue-tsc 零新增。
- 后续待补：until+waiting_review 挂起恢复的专项 spec 属后续补强（机制复用 foreach 路径，本轮引擎循环已含 waitScopeSettled/continueLoop 分流）；停滞检测未纳入（预算+maxRounds 兜底）。
