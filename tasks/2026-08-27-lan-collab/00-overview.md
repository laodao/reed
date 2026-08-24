# 局域网协作功能 · 总览与拆分规划（00/07）
> 状态：设计中（2026-08-27）｜目标版本：collab 模块（新建）｜**暂不实施**
> 前置：承接 `tasks/2026-08-25-lan-collaboration-design.md`（技术选型），本文档将其拆分为
> 可独立评审/实施的部分，并给出跨部分契约与关键决策。各部分详细设计见同目录 01~05，
> 实施计划见 06，价值复盘见 07。

## 一、为什么需要拆分

原 315 行设计文档把「发现 / 团队 / 共享资产 / 工作流指派」揉在一份文件里，导致：
- **粒度不够**：工作流指派一处就包含引擎改动、协议设计、跨实例状态机、前端待办、
  通知链路五个子问题，揉在一起无法逐条评审；
- **边界不清**：哪些表在哪个实例权威、哪些数据走同步/按需、谁触发重试，没有独立推演；
- **无法分期验收**：没有按"部分"给出文件级改动清单与验收标准，实施时难以切分。

本规划按「依赖顺序」把功能拆为 **5 个部分**，每部分一个独立设计文档，
边界规则：**每部分自包含数据模型、协议消息、服务、IPC、UI、测试**；部分间只通过
「跨部分契约」（§五）通信，禁止绕过契约互相调用。

## 二、功能拆分图

```
┌─────────────────────────────────────────────────────────────────┐
│  Part 1 设备身份与局域网发现（01）                                │
│  身份密钥对 · mDNS/UDP/手动IP 三层发现 · 邀请码配对 ·             │
│  WS 双角色连接 · 心跳重连 · JSON 协议 · 二进制分片传输             │
└───────────────▲─────────────────────────────────────────────────┘
                │ 提供：设备在线/离线状态、可靠消息通道（RPC+事件）
┌───────────────┴─────────────────────────────────────────────────┐
│  Part 2 团队与成员管理（02）                                     │
│  teams/team_members 表（owner 实例权威） · 邀请码加入 ·          │
│  角色 owner/member · 成员副本缓存 + revision 同步                 │
└───────────────▲─────────────────────────────────────────────────┘
                │ 提供：成员 id/显示名/在线状态、团队 id、角色
┌───────────────┴─────────────────────────────────────────────────┐
│  Part 3 共享资产（03）                                           │
│  asset_shares 授权（owner 实例权威） · 影子资产行 ·              │
│  内容按需拉取（text/json 直传 / file 分块+断点续传） · 撤回       │
│  · 引用层接入（对话 @ / 工作流 read-asset / 资产中心）            │
└───────────────▲─────────────────────────────────────────────────┘
                │ 提供：可被工作流/对话引用的远程资产句柄
┌───────────────┴─────────────────────────────────────────────────┐
│  Part 4 工作流人工环节指派（04）                                 │
│  处理人概念扩展（node_run.assignee_id + 引擎校验 + 事件字段）     │
│  · 跨实例待办（成员无本地工作流方案） · 决策 RPC 回发起者         │
│  · 表单文件回传 · 离线/重启/超时/并发边界                         │
└───────────────▲─────────────────────────────────────────────────┘
                │ 触发：review-assigned 事件（需 Part 5 送达）
┌───────────────┴─────────────────────────────────────────────────┐
│  Part 5 通知与事件路由（05）                                     │
│  tapEvents 订阅 IEventEmitter → 转发远程事件 · 接收远程事件       │
│  → 本地 emit + Electron Notification + 待办红点/列表             │
└─────────────────────────────────────────────────────────────────┘
```

**依赖关系（严格单向）**：01 ← 02 ← 03 ← 04 ← 05（05 依赖 01 的通道 + 04 的待办实体，
但 05 的实现可在 04 之前独立完成"通道转发"能力，见 06 计划的分期安排）。
Part 5 拆成两层：**通道层**（事件进出转发，只依赖 01）与 **消费层**（通知/待办 UI，
依赖 04），两层的实施时机不同。

## 三、关键决策（跨部分统一，各文档不再重复论证）

### D1 运行状态单写者（发起者实例权威）—— 回答"成员本地没有这个工作流怎么办"
- 工作流运行（workflow_runs + node_runs）永远只存在于**发起者实例**；引擎只跑在发起者。
- 成员端**不需要、也不加载**工作流定义/图——收到的是一条「待办」：`collab_inbox` 行，
  内含 `runId/nodeId/iterationIndex/发起者设备/工作流名/节点名/送审内容快照(payload)/表单 schema`。
- 成员提交决策 → **WS RPC 回发起者实例**执行 `reviewDecide(runId, nodeId, ...)` → 发起者引擎续驱。
- 理由：避免分布式运行状态一致性（谁能改 run？并发决策？崩溃恢复？）；与共享资产
  「数据主权在源实例、使用者按需交互」同一原则；成员侧实现量最小（只做待办卡片）。
- 推论（设计约束）：
  - 成员端所有交互都是**只读上下文 + 提交动作**，不持有运行状态；
  - 发起者离线 = 成员无法决策（待办保留，标记"发起者离线"）；
  - 发起者重启 = 引擎内存态丢失 → 该待办进入"需发起者续跑重驱"状态（见 04 §6 边界表）。

### D2 处理人概念是**引擎的无感知扩展** —— 回答"引擎是否支持新增"
- 引擎的挂起/恢复机器（`waiting_review` → `reviewDecide`）**完全通用**，不绑定"当前用户"：
  - `reviewDecide(runId, nodeId, decision)` 没有"操作者"字段，任何调用方都能恢复——这恰是扩展点；
  - node_run 表**没有** assignee 列 → 新增 `assignee_id`（nullable，null=本机处理人）；
  - `findWaitingReview()` 是"当前用户"查询 → 扩展 `findWaitingReviewByAssignee(assigneeId)`；
  - `reviewRequested` 事件**没有** assignee 字段 → 新增可选 `assigneeId`。
- **引擎不感知"远程"**：它只负责在节点 config 里读到 `assignee`、写入 node_run、随事件带出。
  跨实例送达与回传完全由协作层（Part 4/5）负责。这样引擎改动最小、可单测、不破坏既有语义。
- 兼容性：assignee 为空 = 既有行为（本机处理人），旧工作流零迁移。

### D3 协作层通过 `tapEvents` 挂接事件总线，不侵入引擎事件流
- `IEventEmitter` 双端实现（ElectronBroadcastEventEmitter / WebSocketEventEmitter）**均已实现
  `tapEvents(cb)`**（emit 时先回调 taps，携带 emit 时刻的 ALS userId）——这是现成的旁路钩子。
- 协作层 `notify.bridge` 订阅 `wf:run-event` 通道：本地事件 → 判断是否含远程目标（assignee /
  grant 目标）→ 经 WS 转发；收到远程事件 → 本地 `emit` 回总线（复用现有前端订阅）+ 弹通知。
- 不修改 `workflow-engine.service.ts` 的 emit 调用链，前端订阅零改动。

### D4 共享资产 = 影子行 + 按需拉取（不是同步）
- 授权声明在**源实例**（asset_shares 表），成员本地只建**影子行**（assets 表加
  `origin_device_id/origin_asset_id` 两列，内容字段留空）。
- 现有引用点（对话 @ / 工作流 load-asset / 资产中心）只认 assetId → 影子行就是普通 asset 行，
  **零改动接入**；读取时 AssetService 统一拦截影子行 → 经协作层按需拉取。
- 撤回 = 删 grant + 推送失效 → 成员本地影子行失效 + 清理缓存，**即时生效**，无分布式授权难题。

### D5 传输加密首版明文 + 预留会话加密（信任模型 = 内网 + 配对公钥白名单）
- 见 01 §7 安全。明文仅限已配对设备之间；邀请码一次性 + 过期；私钥 SecureStorage 加密存储。

### D6 Web 端默认禁用协作（桌面定位）
- 协作面向 Electron 局域网场景；Web 部署版（users 多租户、中心化）是另一场景，本设计不覆盖，
  但跨部分契约预留"按目标 userId 推送"的扩展点（05 §3）。

## 四、现状盘点（各设计文档的代码依据，调研于 2026-08-27）

| 主题 | 现状事实 | 对本设计的影响 |
|---|---|---|
| 审核挂起/恢复 | `handleReviewSuspend` 置 waiting_review + patchNode + emit `reviewRequested`；`resumeReview(runId,nodeId,decision)` 无操作者校验 | D2：assignee 只是新列+新字段，机器不动 |
| node_run 表 | `workflow_node_runs` 有 wait_expires_at/review/iteration_index，**无 assignee**；`(run_id,node_id,iteration_index)` 唯一 | 迁移加一列即可 |
| 事件总线 | `IEventEmitter.emit(channel,data)`；Electron 广播所有窗口；Web 按 ALS userId 路由；**双端均有 tapEvents** | D3：旁路挂接现成 |
| 资产可见性 | `asset.repository.ts` findById/listAsset：`(user_id=自己 OR is_builtin=1)` 两档 | 影子行天然满足"自己"档，零改动；授权校验在源实例拉取时做 |
| 资产读取 | `AssetService.assetPreviewUrl/resolveAssetPath` 走 PathProvider；文件在 `dataPath/assets/` | 影子行拦截点在此 |
| 多租户 | ALS userId；Electron 固定 `local-default-user`；BaseRepository scoped 自动注入 | 影子行/团队表沿用 scoped（本地行 = 本机 user 名下） |
| 前端待办 | `pendingReviewCount` ref 存在但**无 UI 消费方**；`WorkflowRunDetail` 已有批准/修改后批准/驳回/表单填写 | 待办红点/列表落点现成 |
| 系统通知 | **项目目前无 Electron Notification 使用**（ElNotification 应用内） | 05 新建主进程 Notification |
| 迁移模式 | `createWorkflowTables(ds)` 风格：ensureTable/ensureIndex + PG/SQLite 双 DDL + 幂等 | collab 迁移照抄 |
| IPC/preload | `electronAPI.workflow.*` → `wf:*` 通道；channel-map.ts 自动映射 Web 端 | collab 通道照抄模式 |
| 运行详情 | WorkflowRunDetail.vue 渲染 node_runs（含 input/output/review） | 成员端"查看上下文"可 RPC 拉只读快照 |

## 五、跨部分契约（Part 间唯一通信面）

### 5.1 设备与成员标识
- `deviceId`：本机身份（Ed25519 公钥指纹派生，UUID 格式），全局唯一（01 定义）。
- `memberId` = `deviceId`（Part 2 中团队成员即设备；一人多设备 = 多个成员，V1 不做设备合并）。
- `teamId`：团队 UUID（02 定义）。
- 外部统一用 **deviceId** 做目标寻址（共享目标、指派目标），团队 id 仅用于范围聚合。

### 5.2 事件通道（Part 5 转发的最小集）
| 事件 | 载荷（协作层关心的字段） | 方向 | 消费方 |
|---|---|---|---|
| `wf:run-event` 的 `review-requested` | runId, definitionId, nodeId, nodeName, payload, waitExpiresAt, **assigneeId(新)** | 本地→远程 | 04/05 |
| `collab:share-grant`（新） | grantId, assetMeta{...}, targetMemberIds, status | 远程→本地 | 03 |
| `collab:share-revoke`（新） | grantId, originDeviceId, originAssetId | 远程→本地 | 03 |
| `collab:review-assigned`（新） | inboxId, runId, nodeId, iterationIndex, assignerDeviceId, wfName, nodeName, payload, formSchema?, waitExpiresAt | 远程→本地 | 04/05 |
| `collab:review-decided`（新） | inboxId, runId, nodeId, iterationIndex, decision, decidedAt | 远程→本地（回执） | 04 |
| `collab:inbox-expired`（新） | inboxId | 远程→本地 | 04/05 |

### 5.3 RPC 方法（Part 1 传输层承载；msgId 关联）
| 方法 | 参数 | 返回 | 归属 |
|---|---|---|---|
| `asset.fetchContent` | originDeviceId, originAssetId, kind | { content } / { chunk, offset, total, hash } | 03 |
| `asset.fetchMeta` | originAssetId | AssetMeta | 03 |
| `review.decide` | runId, nodeId, iterationIndex, decision, comment?, editedValues? | { ok, error? } | 04 |
| `review.uploadFile` | runId, nodeId, iterationIndex, fieldKey, fileName, base64 或分片 | { path, name, text } | 04 |
| `review.fetchContext` | runId, nodeId, iterationIndex | 运行/节点只读快照 | 04 |
| `team.info` | teamId | TeamInfo | 02 |
| `hello`（协议层） | deviceId, displayName, pubKey, protocolVersion | — | 01 |

### 5.4 数据模型总表（各表归属实例见 06 计划）
见 01~04 各自文档 §数据模型；跨文档唯一约束：`collab_inbox`（04）的 payload 字段与
`collab:review-assigned`（5.2）载荷同构；`assets.origin_*`（03）与 `asset.fetchContent`
参数同构。

## 六、用户两个核心问题的结论（详细推演见 04）

1. **引擎是否支持"处理人"概念？**
   ✅ 支持，且是**低侵入扩展**：引擎机制（挂起/恢复/事件）不绑定当前用户，只需
   ①节点 config 加 `assignee` ②node_run 加 `assignee_id` ③`reviewDecide` 增加
   「操作者 = assignee 或 run owner」校验 ④事件带 `assigneeId`。引擎不感知远程。
2. **成员本地没有这个工作流怎么办？**
   ✅ 不需要有。运行状态单写者（D1）：成员只收到待办（含送审内容快照与表单 schema），
   决策经 RPC 回发起者实例执行。成员端不渲染图、不加载定义；"查看上下文"是可选的
   只读 RPC。**唯一依赖**：发起者实例在线（离线时待办保留 + 提示；重启后需续跑重驱）。

## 七、交付物清单（本批次）

| 文件 | 内容 |
|---|---|
| 00-overview.md（本文件） | 拆分规划 / 关键决策 / 现状盘点 / 跨部分契约 |
| 01-identity-discovery.md | 身份、发现、配对、连接、传输协议、安全 |
| 02-team.md | 团队与成员管理 |
| 03-shared-assets.md | 共享资产（授权/影子/拉取/撤回/引用接入） |
| 04-workflow-assignment.md | 工作流指派（处理人扩展 + 跨实例待办 + 边界推演） |
| 05-notifications.md | 事件路由桥 + Electron Notification + 待办 UI |
| 06-implementation-plan.md | 分期计划 / 依赖 / 验收 / 风险 |
| 07-value-review.md | 功能价值复盘 |
