# Part 6 · 实施计划（06/07）
> 状态：计划中（2026-08-27）｜**本计划仅为规划，不执行实施**｜等待评审

## 一、分期总览（每期可独立交付 + 验收）

```
P1 身份与发现（01 全量）        → 两台设备互相发现/配对/在线状态
P2 团队（02 全量）              → 建团队/邀请/成员同步
P3 事件桥 + 系统通知（05 通道层+通知） → 事件跨实例转发 + 系统通知弹出
P4 共享资产（03 全量）          → 共享/影子/拉取/撤回 + 引用层接入
P5 工作流指派（04 全量 + 05 待办 UI） → 指派 → 对端通知 → 决策回传 → 续驱
P6 收尾                         → 设置页协作 tab 完善 / 缓存清理 / 联调回归 / 文档
```

**依赖**：P1 → P2 → P3 → (P4 ∥ P5)。P3 只依赖 P1（事件桥 = tapEvents + transport），
可在 P2 未完成时并行；P4/P5 在 P3 后并行（互不依赖）。**串行总时长参考**：P1~P5 各 2~4 天
（含 TDD），共约 2~3 周（单人）。

## 二、每期文件级改动清单与验收

### P1 身份与发现（01）
**新增文件**：
```
src/core/modules/collab/identity.ts        -- 密钥对生成/持久化/deviceId
src/core/modules/collab/discovery.ts       -- mDNS(bonjour-service) + UDP 广播 + 手动
src/core/modules/collab/transport.ts       -- WS server/client、心跳、重连、协议编解码
src/core/modules/collab/protocol.ts        -- 消息类型/路由/幂等
src/core/modules/collab/collab-boot.ts     -- initCollabSubsystem() 单例装配
src/core/database/migrations/create-collab-identity-tables.ts  -- collab_identity/collab_devices/collab_outbox
src/electron/ipc/handlers/collab.handler.ts
src/preload/index.ts（collab 段） / src/web/client/channel-map.ts（同步，Web 禁用）
src/renderer/src/views/settings/CollabTab.vue（身份/设备/配对 UI 骨架）
```
**新增依赖**：`bonjour-service`（npm）。
**验收**：
1. 两台电脑（或本机 + 虚拟机/第二实例）mDNS 互相发现（关闭发现层可测 UDP/手动兜底）；
2. 邀请码配对成功写入双方信任名单；未配对设备不建连；
3. 断线重连（拔网线/停实例 → 恢复后自动重连，UI 在线状态正确）；
4. RPC 双向调用 + 事件 outbox 补发（离线期间发送 → 上线后到达）；
5. 单测全绿（§8 01 测试表）。

### P2 团队（02）
**新增文件**：
```
src/core/modules/collab/team.service.ts
src/core/database/migrations/create-collab-team-tables.ts  -- teams/team_members/缓存表
```
**验收**：
1. 建团队 → 邀请码 → 对端加入 → 双方成员列表一致（revision 同步）；
2. 移除成员/解散 → 全员缓存更新 + 被移除者收到事件；
3. owner 离线时成员只读缓存可用、写操作报错；
4. 单测全绿（02 §七）。

### P3 事件桥 + 系统通知（05 通道层）
**新增文件**：
```
src/core/modules/collab/notify.bridge.ts   -- tapEvents 订阅 + 转发 + 接收 dispatch
src/electron/services/system-notification.service.ts
```
**验收**：
1. 本地引擎发 review-requested(assigneeId=远程) → 对端收到 collab:review-assigned；
2. 对端收到后本地 emit review-requested → 前端 ElNotification 弹出（现有订阅）；
3. 系统通知弹出 + 点击跳转路由；通知失败降级 ElNotification；
4. 本机事件不转发（assignee 空/自己）；单测全绿（05 §七）。

### P4 共享资产（03）
**新增文件/改动**：
```
src/core/modules/collab/sharing.service.ts   -- 授权 + 影子维护
src/core/modules/collab/remote-asset.service.ts -- 拉取 + 分片 + 缓存/断点
迁移：assets 加 origin_device_id/origin_asset_id + asset_shares + collab_shared_assets + collab_transfer
src/core/modules/assets/asset.service.ts（ensureContentAvailable 拦截）
src/renderer/.../AssetCenter.vue（共享入口 + 「共享给我」分组 + 远程标记）
src/renderer/.../对话 @ 面板 / 工作流资产选择器（展示影子资产）
```
**验收**：
1. 共享 text/json/file 给成员 → 成员资产中心出现「共享给我」→ 点开取内容；
2. 撤回 → 成员侧即时失效 + 缓存清理；拉取被拒；
3. 对话 @ 影子资产 / 工作流 read-asset 引用影子资产（源离线 → 节点 fail 可降级）；
4. 大文件分片 + 断点续传（中断恢复续传）；单测全绿（03 §九）。

### P5 工作流指派（04 + 05 待办 UI）
**改动/新增**（04 §七 清单）：
```
workflow.types.ts（assigneeId 字段 + collab 事件常量）
workflow-engine.service.ts（挂起写 assigneeId + 事件带出）
workflow-run.service.ts（reviewDecide 操作者校验）
task-nodes/interaction-nodes（assignee config + 校验）
graph-validator.ts（assignee ∈ 团队成员）
workflow-node-run.repository.ts（assigneeId + findByAssignee）
迁移：workflow_node_runs.assignee_id
src/core/modules/collab/inbox.service.ts   -- collab_inbox CRUD + 决策 RPC 回传
src/renderer/.../collab/InboxList.vue + ReviewPayloadView（抽自 WorkflowRunDetail）
侧边栏「待我处理」红点
```
**验收**：
1. A 配 human-review assignee=B → A 运行 → B 弹系统通知 + 红点 → B 打开待办看 payload →
   批准/驳回 → A 引擎续驱 → 终态 → B 待办置已处理；
2. form-collect 远程填写（含文件上传回传 A 落盘）；
3. 边界回归（04 §6 表 1~18 至少覆盖：B 离线提示、A 重启报错、超时、幂等重复提交、
   循环多迭代多待办、取消运行置失效）；
4. 单测全绿（04 §八）。

### P6 收尾
- 设置页协作 tab 完整（身份/设备/团队/共享管理/缓存清理/加密开关占位）；
- 文档（docs/manual/collab.md 用户手册）；
- 全量回归（既有 13 项环境性基线失败除外）+ typecheck + lint。

## 三、风险与应对（实施前已知）

| 风险 | 影响 | 应对 |
|---|---|---|
| mDNS/UDP 被公司网络禁用 / AP 客户端隔离 | P1 发现失效（真实高频） | 手动 IP 兜底（P1 含）；UI 提示同一网段；远期「局域网协调器/云端信令」另立设计 |
| Windows 防火墙拦截 WS 端口 | 连接失败 | 首次启动弹防火墙授权；打包说明；端口可配 |
| Electron 无系统通知先例 | P3 通知不可用 | 主进程 Notification + 降级 ElNotification；先做 PoC |
| 重启后 waiting_review 需续跑（现有 V1 限制） | 指派场景 B 无法在 A 重启后直接决策 | 显式报错 + 提示续跑（04 §6 #2）；未来从 DB 重建挂起态（引擎 resumeReview 已具备装配能力，另立任务） |
| 大 payload / 敏感内容转发 | 带宽/隐私 | >1MB 截断 + fetchContext 拉全量（04 §6 #14）；共享/指派均需用户显式操作 |
| owner 设备丢失 | 团队数据无法迁移（owner 权威） | V1 文档声明 + 建议导出团队信息；远期考虑 owner 转移 |
| 组资产影子化不完整 | 套图组画廊在成员端降级 | V1 单资产引用可用；组画廊标记"来源端查看" |
| Web 端多用户与协作冲突 | 数据串扰 | 00 D6：Web 默认禁用；WebSocketEventEmitter 定向推送仅预留 |

## 四、实施顺序建议（评审后）

1. **先做 P1 独立 PoC**（身份+发现+配对+连接）：验证 mDNS 在公司网可用性、WS 穿透防火墙，
   若 PoC 失败（网络隔离严重）→ **建议砍掉整个局域网协作**（见 07 复盘——网络层不可行则
   上层全部无意义，这是最大单项风险）；
2. P1 通过 → P2/P3 并行（团队 + 事件桥，量小风险低）；
3. P4/P5 并行（两个主体功能，独立验收）；
4. P6 收尾。

## 五、工作量估算（单人，含 TDD）

| 期 | 估时 | 主要风险点 |
|---|---|---|
| P1 | 3~4 天 | mDNS 库集成、双角色 WS、分片协议 |
| P2 | 1.5 天 | 邀请码安全、revision 同步 |
| P3 | 1 天 | Notification 平台差异、事件路由正确性 |
| P4 | 3~4 天 | 影子行拦截、分片/断点、引用层接线 |
| P5 | 3~4 天 | 引擎改动回归、决策 RPC、form 文件回传 |
| P6 | 1 天 | 联调、文档 |
| **合计** | **约 13~15 天** | — |
