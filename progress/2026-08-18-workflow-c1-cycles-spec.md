# C1 成环（自由环支持）细化设计 Spec

> 日期：2026-08-18 ｜ 依据：v2-scope-spec §1 ｜ 前置：maxNodeRuns 护栏（A1）已就绪
> 状态：实施前设计（对齐纪律：架构级改动先评审）

## 0. 现状与目标

**现状**：graph-validator 禁止普通环（仅 loop-back 豁免）；引擎 computeReady 的
`state.status !== 'pending'` 跳过条件使终态节点永不重执行。

**目标**：任意节点可回连形成环（如 人工审核(input)→LLM→回连审核→…多轮迭代），
静默即收敛、护栏兜底、Bisheng DFA 语义。

## 1. 核心机制：边激活序号（activation sequence）

环中节点"完成后入边再激活→重执行"需要**时间语义**区分"完成前的旧激活"与
"完成后的新激活"：

```typescript
// ScopeState：
activatedEdges: Set<string>            → activationSeqs: Map<edgeId, number>
activationCounter: number              // 单调递增，activateEdge 时 ++
// 节点状态：
completedSeq?: number                  // 节点进入终态时记录当前 counter

// computeReady 的重执行判定（替代"终态即跳过"）：
node 可执行 iff：
  - 从未执行（无 state）且入边激活（现行为）
  - 或 state 为终态 && 存在入边 e：activationSeqs.get(e.id) > state.completedSeq
    （完成之后才被激活的边 → 重执行：清除该节点 state/输出/已激活出边，重新入队）
```

**重执行时的状态清理**（关键不变量）：
- 删除旧 state（states.delete）；variables 中该节点输出**保留到新执行覆盖**
  （下游模板解析在重执行前引用旧值——与 Bisheng 多轮语义一致）
- 该节点旧出边的激活记录**保留**（下游可能已执行；新一轮激活会推进 counter 盖过）
- runCounts 继续累计（maxNodeRuns 护栏即环上限）

## 2. 校验器调整

- 环检测（detectCycle）从**错误降为警告**：`成环运行需确保环内含条件分支或
  人工交互节点可跳出（maxNodeRuns 兜底）`
- loop-back 豁免逻辑保持（loop 节点机制不变，与自由环并存）
- 不变：start 无入边、branch/fail/approve/reject 语义、循环体支配规则

## 3. 引擎改动清单（workflow-engine.service.ts）

| 位置 | 改动 |
|------|------|
| ScopeState | activatedEdges→activationSeqs（Map）+ activationCounter；节点 settle 终态记 completedSeq |
| activateEdge | 记序号而非仅 Set.add；merge 到达记录同样按新激活推进 |
| computeReady | 重执行判定（§1）；重执行时清 state + 从 readyQueue 语义上重新可入 |
| handleNodeSuccess/handleNodeFailure 终态 | state.completedSeq = ++counter |
| 其余 | 不动（loop/审核/取消/续跑机制与自由环正交） |

**computeReady 内的重执行实现**（伪码）：
```
for node:
  st = states.get(id)
  if !st: 边激活 → ready（现行为）
  else if st 为终态:
    if 任一入边 seq > st.completedSeq:
      states.delete(id)          // 允许重新 launch（旧输出留在 variables 直至覆盖）
      ready.push(node)
    else skip
  else skip（running/waiting）
```

⚠️ 注意：activationSeqs 是作用域级的（环在哪个作用域就推进哪个作用域的
counter）；根作用域环最常见，loop 作用域内的环同样成立（同机制）。

## 4. 测试计划（TDD，≥6 用例）

1. **两轮迭代环**：start→rev(input)→llm→回连 rev；第一轮 output_result=A，
   llm 输出后 rev 重执行收到新 payload → 第二轮 output_result=B → 条件跳出 → succeeded
2. **条件跳出环**：环内 condition 于第二轮命中跳出边 → succeeded（环仅执行 2 轮）
3. **无出口环触护栏**：A→B→A 无交互，maxNodeRuns=3 → A/B 执行 3 次后 failed
   （error 含"最大运行次数"）
4. **非环图零回归**：现有 129 用例全绿（activationSeqs 改造不破坏单次执行语义）
5. **校验器**：普通环 → valid=true 且 warnings 含成环提示；loop-back 机制不回归
6. **完成前旧激活不触发重执行**：并行分支 A→X、B→X，X 终态后仅 A 边新激活
   （seq 旧）→ X 不重执行（防误判）

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| activationSeqs 改造波及 merge 到达/forcedMerges | 到达记录按 activateEdge 时机推进（同 counter），merge 语义不变 |
| variables 保留旧值导致下游误读 | 与 Bisheng 语义一致（读到上一轮值是环的本意）；文档记录 |
| 与 loop 节点机制冲突 | loop-back 边不参与 computeReady（现行为），自由环走 normal/branch 边，互不干扰 |
| 续跑/挂起重入复杂化 | 重执行清 state 发生在 computeReady（同步），挂起/续跑路径不感知 |

## 6. 明确不做

自动机形式化验证、环可视化高亮（后续增强）、跨作用域环（loop body 内回连到
loop 外节点——校验器既有的逃逸规则已禁止）。
