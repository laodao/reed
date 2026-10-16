# Part 4 · 工作流人工环节指派（04/07）
> 状态：设计中（2026-08-27）｜暂不实施｜依赖：Part 1（传输）+ Part 2（团队）+ Part 5（通知送达）

## 〇、本部分回答的两个核心问题

### Q1：当前工作流环节没有"处理人"概念（默认当前用户），引擎支持新增吗？

**结论：支持，且是低侵入扩展。** 依据（调研自 2026-08-27）：

1. 引擎的挂起/恢复机器是**通用的、与"人"解耦的**：
   - `human-review` / `form-collect` 节点 `execute()` 返回 `{ status: 'waiting_review', payload, timeoutMs }`
     → 引擎 `handleReviewSuspend` 置 node_run 状态 + 发 `reviewRequested` 事件；
   - 恢复走 `resumeReview(runId, nodeId, decision)`——**签名里没有"操作者"**，
     任何调用方只要拿到 runId/nodeId 就能恢复（当前实现无权限校验，Web 端仅靠 ALS
     路由到自己的数据）。这既是现状缺口（安全），也是扩展点（加操作者校验）。
2. node_run 表**没有** assignee 列；`findWaitingReview()` 是"当前用户"查询（BaseRepository
   scoped 按 ALS userId 过滤）——需要新增"按 assignee 查询"。
3. `reviewRequested` 事件**没有** assignee 字段——需要新增可选 `assigneeId`。

**扩展方案（引擎改动 4 点，均向后兼容，assignee 为空 = 既有行为）**：

| # | 改动点 | 文件 | 说明 |
|---|---|---|---|
| E1 | 节点 config 加可选 `assignee` | human-review / form-collect 的 config 类型 + 校验 | `assignee?: string`（团队成员 deviceId）；空 = 本机处理人。graph-validator 校验：若填写则必须是团队成员（经 02 校验，离线时用缓存） |
| E2 | node_run 加 `assignee_id` 列 | 迁移 + workflow-node-run.repository | nullable；挂起时从 config 读 assignee 写入 |
| E3 | `reviewDecide` 增加操作者校验 | workflow-run.service + 引擎 | 新增入参 `operatorDeviceId`（或走协作层 RPC 时带）；校验「操作者 = assignee 或 run owner（=发起者本机）」否则拒绝。**本机既有流程**（无 assignee）行为不变（操作者=本机 owner） |
| E4 | `reviewRequested` 事件带 `assigneeId` | workflow-engine.service 的 emit | 协作层（Part 5）据此判断是否转发远程 |

**引擎不感知"远程"**：它只负责读 config、写 node_run、带事件字段。跨实例送达/回传完全在
协作层。理由：引擎可单测、不引入网络依赖、既有 692 提交的工作流语义零破坏。

### Q2：成员本地没有这个工作流（自定义工作流指派给成员），怎么办？

**结论：成员不需要有工作流定义/图。** 依据 00 D1「运行状态单写者」：

- 运行（workflow_runs + node_runs）只存在于**发起者实例**；引擎只在发起者跑；
- 成员端收到的是一条**待办**（`collab_inbox` 行）：含
  `runId / nodeId / iterationIndex / 发起者设备 / 工作流名 / 节点名 / 送审内容快照(payload) / 表单 schema(form-collect)`；
- 成员在**待办卡片**里看送审内容 → 提交决策 → **WS RPC 回发起者实例**执行
  `reviewDecide(runId, nodeId, iterationIndex, decision, ...)` → 发起者引擎续驱；
- 成员端**不渲染图、不加载工作流定义**，只复用 payload 渲染（现有 WorkflowRunDetail 的
  展示逻辑可抽成通用组件）；
- "查看上下文"（可选）：成员可 RPC `review.fetchContext` 拉发起者的运行/节点只读快照。

**为什么这样设计（权衡）**：
- 备选 A：把工作流定义同步给成员 → 成员本地要有"图 + 引擎 + 运行状态"，等于分布式引擎，
  复杂度爆炸（冲突/一致/崩溃恢复）；且成员**并不需要**图——他只是审一个节点。
- 备选 B：成员只提交决策（本方案）→ 成员侧实现量最小，权威与一致性天然由发起者保证。
- 代价：**发起者离线/重启时成员无法决策**（需降级提示）——接受，见 §6 边界表。

---

## 一、职责边界

1. **处理人概念扩展**（Q1 的 E1~E4，引擎 + 存储 + 事件字段）；
2. **跨实例待办**：`collab_inbox` 表 + 待办卡片 UI（成员无本地工作流方案，Q2）；
3. **决策回传**：成员 → 发起者 RPC `review.decide` + 回执；
4. **表单文件回传**：form-collect 文件字段（成员上传文件 → 回传发起者落盘）；
5. **边界推演**：离线/重启/超时/并发/重复/循环内指派/团队解散（§6 边界表）。

本部分**不**负责：通知弹出（05 消费 collab_inbox 变化）、共享资产（03）、团队数据（02）。

## 二、数据模型（新增迁移）

### 2.1 node_run 加列（Q1-E2）
```
ALTER TABLE workflow_node_runs ADD COLUMN assignee_id TEXT   -- null=本机处理人
```

### 2.2 远程待办（成员实例本地，核心表）
```
collab_inbox:                           -- 成员实例本地（收到"指派给我的审核任务"）
  id            TEXT PRIMARY KEY        -- inboxId（发起者生成，全局唯一，幂等键）
  run_id        TEXT NOT NULL           -- 发起者实例的运行 id（远程）
  node_id       TEXT NOT NULL
  iteration_index INTEGER NOT NULL DEFAULT 0
  assigner_device_id TEXT NOT NULL      -- 发起者（决策 RPC 发往对象）
  wf_name       TEXT NOT NULL           -- 工作流名（展示用，发起者事件携带）
  node_name     TEXT NOT NULL           -- 节点名
  node_type     TEXT NOT NULL           -- 'human-review' | 'form-collect'（渲染方式）
  payload       TEXT NOT NULL           -- 送审内容快照（JSON 字符串；human-review 的 payload /
                                        --   form-collect 的 {formTitle, fields, form:true}）
  wait_expires_at DATETIME              -- 发起者侧超时死线（展示倒计时）
  status        TEXT NOT NULL DEFAULT 'open'   -- 'open' | 'done' | 'expired' | 'unreachable'
  created_at    DATETIME
  decided_at    DATETIME
  UNIQUE(run_id, node_id, iteration_index)     -- 同一待办去重（重复推送覆盖）
```

### 2.3 我发出的指派登记（发起者实例本地，可选但推荐）
```
collab_assignment:
  id            TEXT PRIMARY KEY
  run_id        TEXT
  node_id       TEXT
  iteration_index INTEGER
  assignee_device_id TEXT
  inbox_id      TEXT NOT NULL           -- 与 collab_inbox.id 对应（回执定位）
  status        TEXT NOT NULL DEFAULT 'pending'  -- 'pending'|'delivered'|'decided'|'expired'|'failed'
  created_at    DATETIME
  decided_at    DATETIME
  -- 用途：发起者侧看"我派发的待办"状态 + 超时回收 + 审计
```

## 三、端到端时序（正常路径）

```
发起者 A（有引擎/运行）          协作层 A           协作层 B           成员 B（无该工作流）
  │ 运行到 human-review 节点                        │                    │
  │ execute → waiting_review                       │                    │
  │ handleReviewSuspend:                          │                    │
  │   node_run.assignee_id = B                    │                    │
  │   emit reviewRequested{...,assigneeId:B}      │                    │
  │─────────────────────────► tapEvents 捕获      │                    │
  │    assigneeId=B 且 B≠本机 → 组 collab:review-assigned │              │
  │                       ──── WS ───────────────►│                    │
  │                                               │ 校验 inboxId 幂等    │
  │                                               │ 写 collab_inbox     │
  │                                               │ emit review-requested（本地）│
  │                                               │ 弹 Electron Notification│
  │                                               │ 待办红点 +1         │
  │                                               │                    │ B 打开待办卡片
  │                                               │                    │ 看 payload/表单
  │                                               │  ── review.decide ──►│
  │  ◄──── WS RPC ────────────────────────────────┤                    │
  │  resumeReview(runId,nodeId,decision)          │                    │
  │  （校验操作者=B 或 owner）                      │                    │
  │  续驱 → 终态/继续                              │                    │
  │  emit run-status 等                            │                    │
  │──────────────────► tapEvents                  │                    │
  │  run 已终态 → 发 collab:review-decided 回执    │                    │
  │                       ──── WS ───────────────►│                    │
  │                                               │ inbox.status='done' │
  │                                               │ 红点 -1            │
```

## 四、各环节详细设计

### 4.1 节点配置（E1）
- human-review / form-collect 的 config 增加：
  ```
  assignee?: string        // 团队成员 deviceId；空 = 本机处理人
  ```
- 编辑器配置表单：处理人下拉（选项 = 团队成员显示名 + "本机处理（默认）"），数据源 02 缓存；
- graph-validator：assignee 非空 → 必须是本团队成员（在线 RPC 校验 / 离线缓存校验），
  否则报错"处理人必须是团队成员"；
- 兼容：旧工作流 config 无 assignee 字段 → 恒为空 → 行为与现状完全一致。

### 4.2 引擎挂起（E2 + E4）
- `handleReviewSuspend` 增加：
  ```ts
  const assignee = (node.config as { assignee?: string }).assignee ?? null
  await this.deps.nodeRuns.patchNode(runId, node.id, iterationIndex, {
    status: 'waiting_review', output: result.payload, waitExpiresAt,
    assigneeId: assignee,                    // 新增字段透传
  })
  this.deps.events.emit({ type: 'reviewRequested', runId, definitionId, nodeId, nodeName,
    payload: result.payload, waitExpiresAt: ..., assigneeId: assignee })   // 新增字段
  ```

### 4.3 决策权限校验（E3）
- `WorkflowRunService.reviewDecide` 增加可选入参 `operatorDeviceId`（协作层 RPC 传入）：
  ```
  if (operatorDeviceId) {
    const run = await runs.getById(runId)
    const nodeRun = await nodeRuns.getByNode(runId, nodeId, iterationIndex)
    const assignee = nodeRun?.assigneeId
    const isOwner = run?.userId 是发起者本机用户（Electron 单用户恒真）
    if (!(assignee && operatorDeviceId === assignee) && !isOwner) → 拒绝 '无权处理该待办'
  }
  ```
- 本机调用（既有路径）不带 operatorDeviceId → 行为不变；
- 说明：Electron 单用户下 run.userId 恒为 local-default-user，owner 校验对远程操作者不生效，
  因此核心校验是「operatorDeviceId === assignee」。Web 端多用户（未启用协作）不受影响。

### 4.4 待办卡片 UI（成员端）
- 入口：侧边栏「待我处理」红点（消费 collab_inbox 中 status='open' 计数）+ 列表；
- 卡片内容：
  - 头：来自「成员A」的工作流「周报生成器」→ 节点「人工审核」；
  - 主体：payload 渲染（human-review：内容展示 + editableFields 编辑（若有）；
    form-collect：复用 RunInputForm 渲染表单 schema，**文件字段经 review.uploadFile 回传**）；
  - 底部：批准 / 修改后批准 / 驳回（+ 可选评论）；
  - 超时倒计时（waitExpiresAt）；"查看上下文"（可选 RPC fetchContext）；
- 提交后：调 RPC `review.decide` → 成功 → 卡片置"已处理"；失败 → 提示 + 保留（重试）。

### 4.5 决策回传协议（rpc）
```
review.decide { runId, nodeId, iterationIndex, decision, comment?, editedValues? }
  → { ok: true } / { ok: false, error: '运行不在挂起状态' | '发起者重启，请通知其续跑' | '无权处理' | '待办已过期' }
```
- 幂等：重复提交 → 发起者 resumeReview 返回 false（节点已非 waiting_review）→ 回执
  `{ ok: false, error: '已处理' }` → 成员端标记 done（不报错给用户）；
- 回执广播：发起者续驱后经 tapEvents 发 `collab:review-decided` → 成员 inbox 置 done。

### 4.6 表单文件回传（form-collect 远程填写）
- 现状：文件字段上传 = `wf:form-upload`（base64 落发起者盘）；
- 远程场景：成员上传文件 → **经 WS 分片传到发起者**（01 §6 二进制分片，复用传输层）
  → 发起者落盘到既有 form-upload 路径 → 返回 `{ path, name, text }` 给成员端
  （与现状返回同构，editedValues 里放 { path, name, text }）→ 随 review.decide 回传；
- 说明：文件**不落成员本地盘**（直接转发流式到发起者），避免双份存储与路径歧义；
- 边界：大文件（>100MB）→ 发起者侧限额 + 进度条；断线 → 分片断点续传（01 复用）。

## 五、通知链路（依赖 05）

- 协作层 B 收 `collab:review-assigned` → **本地 emit `review-requested`**（复用现有前端
  workflow store 订阅 → 红点 +1）+ **Electron Notification**（05 新建主进程 Notification）+ 应用内 ElNotification；
- 待办过期：发起者 tickReviewTimeouts 处理超时（现有机制）→ 经 tapEvents 发
  `collab:inbox-expired` → 成员 inbox 置 expired + 红点更新。

## 六、边界推演表（深度考虑各种情况）

| # | 场景 | 行为 | 设计依据 |
|---|---|---|---|
| 1 | 发起者离线时成员提交决策 | RPC 失败 → 待办保留 + 卡片提示「发起者离线，已保存，可稍后重试」；成员侧不落决策本地（**单写者**：决策只在发起者生效，避免两端状态分叉） | 00 D1 |
| 2 | 发起者重启（应用退出重开） | 引擎内存态丢失 → run 保持 waiting_review（现有 recoverOnBoot 语义）；成员决策 RPC → `{ ok:false, error:'发起者重启，请通知其续跑' }`；待办标 unreachable；**发起者续跑（resumeRun）后**该节点重驱（iteration 重新挂起）→ 重新发 review-assigned → 待办恢复可处理 | 现有 V1 限制的显式化 |
| 3 | 发起者重启且不续跑 | 待办永久 unreachable → 超时（waitExpiresAt 已过）→ 成员端标 expired；发起者侧 run 最终 timed_out（timeout_at 死线）| 现有机制 |
| 4 | 超时策略 | 发起者 tickReviewTimeouts 按 timeoutPolicy 自动 approve/reject/fail（现有）→ 广播 inbox-expired/decided | 现有机制 |
| 5 | 多成员同时处理同一待办（V1 单指派，理论上不可达；未来多指派） | 首个决策生效（resumeReview 原子：节点非 waiting_review 即 false），后续者收到「已处理」回执 | 引擎天然串行 |
| 6 | 同一成员被同一节点多次指派（循环内 review） | iterationIndex 区分：inbox 唯一键 (run_id,node_id,iteration_index)；每迭代一条待办 | 表设计 |
| 7 | 工作流在发起者被删除/修改 | 运行用 graphSnapshot（现有）→ 不受定义修改影响；指派照常 | 现有机制 |
| 8 | 成员离线时发起者推送 | 进 outbox 补发（01）；成员上线后收到 → 正常处理 | 01 |
| 9 | 成员被移出团队（02） | 待办**已派发的不撤回**（指派按 member 粒度，与团队无关）；未来成员变更不再收到新指派 | 02 |
| 10 | 团队解散（02） | 已派发待办保留（同 #9）；处理人下拉清空 | 02 |
| 11 | 发起者自己取消运行 | cancelRun → 节点 cancelled → 广播 review-decided{cancelled} → 成员 inbox 置 done（显示"运行已取消"）| 引擎现有 |
| 12 | 发起者删除运行历史 | deleteRun → 广播 inbox-expired → 成员待办置失效 | 现有 |
| 13 | 决策后成员未收到回执（网络抖动） | 成员侧重复提交 → 幂等返回「已处理」→ 成员标 done；inbox 以最终状态为准 | 幂等键 |
| 14 | payload 含敏感大字段 | 事件转发带**完整 payload**（V1；待办卡片要展示）；>1MB 截断 + "内容过大请查看上下文"（fetchContext 拉全量） | 数据最小化妥协，见 06 风险 |
| 15 | 待办卡片渲染失败（payload 形状未知） | 降级为 JSON 树展示（复用 WorkflowRunDetail 的 io-json 样式） | 健壮性 |
| 16 | 发起者同时是成员（双向指派） | 两个实例各自有 collab_inbox 与 collab_assignment，互不干扰；决策 RPC 双向 | 对称设计 |
| 17 | 指派给"整个团队"（未来扩展） | 每个成员各收一条 collab:review-assigned（inboxId 各自生成）；任一成员决策生效，其余收到「已处理」| 预留 |
| 18 | 成员拒绝/无法处理 | 无"转派"概念 V1：成员只能处理或让其超时；发起者可取消运行/续跑改配置 | 明确不做 |

## 七、与现状代码的具体改动清单（04 部分）

| 文件 | 改动 |
|---|---|
| `src/shared/types/workflow.types.ts` | WorkflowRunEvent 类型加可选 assigneeId；新事件常量 reviewAssigned/reviewDecided/inboxExpired（collab 通道用） |
| `src/core/database/migrations/create-collab-tables.ts`（新） | collab_inbox / collab_assignment / collab_shared_assets / collab_transfer / collab_devices / collab_identity / collab_team_cache / collab_team_member_cache / asset_shares 建表 |
| 迁移（add-node-run-assignee） | workflow_node_runs.assignee_id 列 |
| `src/core/modules/workflow/engine/workflow-engine.service.ts` | handleReviewSuspend 写 assigneeId + 事件带 assigneeId（E2/E4） |
| `src/core/modules/workflow/workflow-run.service.ts` | reviewDecide 加 operatorDeviceId 校验（E3） |
| `src/core/modules/workflow/nodes/{task-nodes,interaction-nodes}.ts` | config 类型 + validateConfig 加 assignee 校验（E1） |
| `src/core/modules/workflow/engine/graph-validator.ts` | 规则：assignee 必须是团队成员（经 02 查询接口） |
| `src/core/database/repositories/workflow-node-run.repository.ts` | assigneeId 字段透传 + findWaitingReviewByAssignee |
| `src/renderer/.../WorkflowRunDetail.vue` | 抽 payload 渲染为通用组件（待办卡片复用） |
| 新建 `src/renderer/.../collab/` | 待办列表/卡片组件 + 侧边栏红点 |

## 八、测试计划（TDD）

| 层 | 用例 |
|---|---|
| 引擎 | 挂起时 assignee 落库 + 事件带 assigneeId；无 assignee 行为不变（回归） |
| 校验 | reviewDecide 操作者校验：assignee 可决策 / 非 assignee 拒绝 / 本机 owner 可决策 / 无 operator 参数兼容 |
| 存储 | assignee_id 迁移幂等；findWaitingReviewByAssignee |
| 待办 | 收 review-assigned 写 inbox（幂等去重）；决策回执置 done；超时置 expired；取消运行置失效 |
| 协议 | review.decide RPC 成功/幂等/失败分支；review.uploadFile 分片回传发起者落盘 |
| UI | 待办卡片渲染（human-review payload / form-collect 表单）；红点计数增删；离线提示 |
| 边界 | 发起者离线决策失败保留；重启后决策报错提示；循环内多迭代多待办；团队解散不影响已派发待办 |
