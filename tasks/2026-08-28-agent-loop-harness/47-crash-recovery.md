# 47号：Agent 崩溃恢复能力面（平台件）

日期：2026-09-11 ｜ 分支：feat/story-room ｜ 状态：已实施，待提交

## 0. 背景与裁决

- 用户裁决（09-11）：**不做自动续跑看门狗，人为推动即可**。本批不违反——全部能力都是人工触发（业务查中断轮 → UI「继续」→ resumeTurn）。
- 故障恢复现状分层（对码结论，答用户问）：L1 步内自动重试（43号）→ L2 停住后人推「继续」无损续跑 → L3 任务树崩溃级自动恢复 → L4 工作流 recoverOnBoot 收口。
- 外部评估（其他开发）主张：平台缺「通用恢复能力面」——resumeFromSuspend 是审批决策形，且 session store 无枚举接口；业务层只剩薄壳。对码核实后**部分成立**：续跑机制本身今天就通（sendMessage → loadState→sanitize→assemble 哨兵→重进 loop，聊天宿主实证），真缺口是 ①中断轮不可枚举 ②续跑指令未正规化。本批补的就是这两块 + 一处终态留痕缺口。

## 1. 事实核查记录（评估 vs 代码）

| 评估断言 | 核实结果 |
|---|---|
| session store port 只有 load/save/delete | ✅（session-store.ts AgentSessionStore），但 repository 层已有 listSessions（控制台在用） |
| 「每步落库（含 stopReason）」 | ⚠️ saveState 只持久化 messages；stopReason 只落轨迹（guardrail_stop/final）与宿主业务层。且 **loop 外层 catch 原本连轨迹终态都不发**——崩溃轮在时间线上「无尾」 |
| resumeFromSuspend 决策形、服务审批场景 | ✅ 且更硬：它要求宿主完整重建 task（tools/systemPrompt 不在持久化态）——恢复入口只能在 HostKit 层 |
| 「发起指令今天发不出去」 | ❌ 言过其实：sendMessage 续跑今天就通；缺的是可发现性与结构化入口 |

## 2. 实施（三件）

### 2.1 loop 异常终止归一 stop('error')

`runtime/loop.ts` 外层 catch：手写 stopReason+saveState+resultOf → `return this.stop(state, host, 'error', message, [...pendingAppended])`。

- 效果：异常终止也发 `guardrail_stop` 终态轨迹（枚举依据）、与流级失败（stop('error')）收束同路、挂起冻结语义单一出处。
- **顺带修复一个旧潜伏 bug**：旧 catch 会无视图 freeze 分支强写 stopReason='error' 并再次落盘——若在 suspended 态可达会破坏 E3「冻结而非 aborted 收场」恢复契约。现 catch 经 stop() 承载冻结分支（对抗评审确认该路径现实不可达，属防御性修正）。
- 终态轨迹 kinds（枚举锚点）：`final`（收敛）/ `guardrail_stop`（stop() 全部路径，含 aborted/max_steps/stagnant/human_rejected/error）。

### 2.2 AgentTrajectoryRepository.listRecoverable

```ts
listRecoverable(opts?: { scopePrefix?: string; limit?: number }): Promise<RecoverableTurnRow[]>
// RecoverableTurnRow = { scopeKey, seq, iteration, kind, name, createdAt }
```

- 语义：**各 scopeKey 末条轨迹即该轮终态投影**——末条 ∉ {final, guardrail_stop} 且 ≠ human_request = 中断轮。审批挂起轮排除（恢复走 resumeFromSuspend）；workflow scope 排除（节点恢复自成一体）；**子代理 `:sub_*` 排除**（一次性无会话存储，对抗 review P1：否则枚举出幽灵恢复项）。
- 实现：两步 QueryBuilder（GROUP BY scope_key 取 MAX(seq) → IN 取末条行 → JS 过滤），走 scoped 租户过滤（无 ALS 按 user_id IS NULL，与 listByScope 同口径）；LIKE ESCAPE 与 escapeLikePrefix 同既有惯例。
- 暴露路径：业务经 `getWorkflowSubsystem().agentTrajectories`（与控制台 handler 同源）。

### 2.3 HostKit.resumeTurn

```ts
kit.resumeTurn(baseTurn, { instruction?: string; signal?: AbortSignal }): Promise<HostKitTurnResult>
```

- 语义：与审批形 resumeFromSuspend 并列的**崩溃恢复变体**。续跑机制本就存在（runTurn 管线自动 loadState→sanitize→assemble→loop），本入口只把「续跑指令」正规化：缺省注入 `DEFAULT_RESUME_INSTRUCTION`（先核实再续做、不重复不臆造），业务传 instruction 覆盖为任务恢复块。baseTurn 其余字段原样参与 scopeKey/记忆/快照装配。
- 不变的边界：互斥归业务 busy 守卫（与 runTurn 同）；审批挂起的会话不走此入口；任务语义（计划/进度）平台不背，由业务指令块携带。

## 3. 验证

- 单测：loop.spec +1（异常终止→guardrail_stop 终态+补偿落盘）、host-kit.spec +2（缺省指令入史+baseTurn 展开、instruction 覆盖）、trajectory-recovery.spec 新 6 例（终态/审批/半途判定、前缀过滤、workflow 排除、租户隔离、limit 排序、`:sub_*` 排除）。
- 回归：agent-runtime + workflow/nodes + workflow/local 共 22 文件 356/356 通过；typecheck 触及文件零新增。
- ABI 已翻回 electron。

## 4. 对抗评审处置

- P1 子代理幽灵枚举 → **已修**（isSubagentScope 判定留在仓储层，database 不反向依赖 platform；GROUP BY 步即排除 + 补单测）。
- 确认项：catch 归一无回归且顺带修冻结语义潜伏 bug；`seq IN` 参数上限 32766（SQLite≥3.32）现实不可达；resumeTurn this 绑定与现网 4 调用点惯例全兼容；resume 轮新 runId+新 turn_start 的时间线可见性符合人工触发预期。
- 登记不修：同 scopeKey 并发双轮的 sink seq 竞争（runTurn 既有语义，busy 归业务）；首次 saveState 前硬崩的轮无痕（历史也未落库，不可续自洽）；limit=0 夹取为 1（防御性）。

## 5. 业务对接指引（研讨室薄壳，约 0.5 人日，归故事线）

1. `lw_task_progress` 落库任务语义记忆（先例：domain-learning 的 dl_task_progress 同形）；
2. 进房间/发消息时 `listRecoverable({ scopePrefix: 'story-room:' })` → 命中则 UI「继续任务」；
3. 点击 → `kit.resumeTurn({ input: <原目标>, projectId }, { instruction: <任务恢复块：计划/进度/草稿包现状> })`；
4. lw_check_consistency 一致性检查工具 + LW_ROOM_MAX_STEPS 12→24 + env 覆盖（原方案不变，room-agent-tools.ts:29）。
