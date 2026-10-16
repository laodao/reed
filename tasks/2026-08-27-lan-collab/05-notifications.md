# Part 5 · 通知与事件路由（05/07）
> 状态：设计中（2026-08-27）｜暂不实施｜依赖：Part 1（传输）+ Part 4（待办实体）

## 一、职责边界

1. **事件桥（通道层）**：订阅本地 `IEventEmitter`（tapEvents）→ 识别需要远程送达的事件 →
   经 Part 1 WS 转发给目标实例；接收远程事件 → 本地 `emit` 回总线（复用现有前端订阅）；
2. **系统通知（消费层）**：Electron 主进程新建 Notification（项目目前**没有**系统通知），
   收到远程指派/共享授权时弹系统通知 + 应用内 ElNotification 双通道；
3. **待办 UI（消费层）**：侧边栏「待我处理」红点 + 列表（消费 collab_inbox，04 定义）。

## 二、事件桥设计

### 2.1 挂接点：tapEvents（现成）
- `IEventEmitter` 双端实现均已实现 `tapEvents(cb)`：emit 时先回调 taps，携带 emit 时刻的
  ALS userId（Electron 广播实现 electron-event-emitter.ts:33；Web 端 web-event-emitter.ts:71）。
- 协作层 `notify.bridge` 启动时 `getEventEmitter().tapEvents(handler)` 订阅**全部通道**，
  在 handler 内按通道 + 载荷判别是否需要转发（性能可接受：事件量小）。

### 2.2 转发判定表（本地事件 → 远程）
| 本地事件（通道:type） | 转发条件 | 目标 | 转发载荷 |
|---|---|---|---|
| `wf:run-event` : `review-requested` | `payload.assigneeId` 非空且 ≠ 本机 deviceId | assigneeId 设备 | 组装 `collab:review-assigned`（见 04 §2.2 inbox 同构） |
| `collab:share-grant`（本地产生，03） | — | 目标成员设备 | 原样（03 直接调用 transport.sendEvent，无需桥转） |
| `wf:run-event` : `review-requested` | assigneeId 空（本机） | 无 | 不转发（本机既有路径） |

> 说明：03/04 的业务事件（share-grant/review-assigned）由各业务模块**直接调用**
> `transport.sendEvent` 发送（03/04 是事件的生产者）；桥的职责是**把引擎内部事件
> （review-requested）翻译为协作层事件**（04 的 E4 是引擎侧加字段，桥做翻译与寻址）。

### 2.3 接收路径（远程事件 → 本地）
```
transport.onMessage(from, { type:'event', channel, data })
  → notify.bridge.dispatch(channel, data)
    ├─ collab:review-assigned → inboxService.upsert(data)（04）
    │                            → emit('wf:run-event', {type:'review-requested', ...})
    │                            → notify.showSystem('新的待审核任务', wfName)
    │                            → ElNotification（前端 workflow store 已有订阅）
    ├─ collab:review-decided  → inboxService.markDone(data)（04）→ emit 待办刷新事件
    ├─ collab:inbox-expired   → inboxService.markExpired(data)（04）→ emit 待办刷新事件
    ├─ collab:share-grant     → sharingService.upsertShadow(data)（03）→ emit 资产刷新事件
    ├─ collab:share-revoke    → sharingService.revokeShadow(data)（03）→ emit 资产刷新事件
    └─ 其他                  → 忽略（协议版本内未知事件告警日志）
```
- **本地 emit 走既有通道**（如 `wf:run-event`）→ 前端 workflow store 现有订阅自动消费
  （红点 +1、ElNotification），**前端零改动**接入通知；
- 资产刷新事件：`assets:changed`（现有通道？若无则新增，资产中心订阅刷新「共享给我」分组）。

### 2.4 可靠性
- 转发失败（目标离线）→ 04 的 inbox 由发起者侧 collab_assignment 状态 + outbox 补发兜底
  （01 §5.2：事件进 outbox，重连补发）；
- 重复投递 → 接收方按幂等键（inboxId/grantId）去重（04/03 表唯一键）；
- 桥自身崩溃 → 重启后重新 tapEvents；inbox/shadow 以 DB 为准（事件是触发更新，非唯一真相）。

## 三、Web 端扩展点（预留，不实施）

- 现状：WebSocketEventEmitter 按 **ALS userId** 路由（emit 时取当前 userId 找连接）；
- 协作定位桌面端（00 D6），但 5.2 契约的 `collab:review-assigned` 若未来用于 Web，
  需 `emitToUser(userId, channel, data)` 定向推送（按目标 userId 而非当前用户）。
  本设计**只预留接口**，不在实施范围（06 计划不包含）。

## 四、Electron 系统通知（项目首次引入）

### 4.1 主进程 Notification 服务
```
src/electron/services/system-notification.service.ts（新）
  showSystemNotification(opts: { title: string; body: string; clickAction?: { route: string } })
```
- 基于 Electron `new Notification({ title, body })`（主进程）；
- `clickAction`：点击通知 → 聚焦窗口 + 通过 `webContents.send('app:navigate', route)` 路由跳转
  （待办列表 / 资产中心）；需在 preload 暴露 `onNavigate` 订阅 + 前端 router.push；
- Windows 需要 `app.setAppUserModelId`（electron-builder 已配 appId）；macOS 需通知权限授权
  （首次弹系统权限提示）；Linux 桌面通知走 libnotify（多数发行版默认支持）；
- **失败降级**：Notification 构造/显示异常 → 仅 ElNotification（不阻塞业务）。

### 4.2 通知触发点
| 触发 | 系统通知 | 应用内 ElNotification |
|---|---|---|
| 收到远程指派（collab:review-assigned） | ✅「新的待审核任务：<工作流名>」 | ✅（workflow store 现有） |
| 收到共享授权（collab:share-grant） | ✅「<成员> 共享了资产：<名称>」 | ✅ |
| 收到共享撤回（collab:share-revoke） | ❌（静默清理） | ✅「共享已撤回」 |
| 待办即将过期（<5min） | ✅「待办即将超时」 | ✅ |
| 设备上线/离线 | ❌（仅 UI 状态点） | ❌（避免打扰） |

## 五、待办 UI（消费层，依赖 04 的 collab_inbox）

### 5.1 侧边栏红点
- 现有 `pendingReviewCount`（workflow store）**无 UI 消费方**（调研确认）→ 落为：
  - 本地待办：`getPendingReviews()`（现有 IPC，查本机 waiting_review）；
  - 远程待办：`collab.review.listInbox()`（查 collab_inbox status='open'）；
  - 合计 → 侧边栏「待我处理」入口红点；
- 刷新时机：事件驱动（收到 review-assigned/decided/expired → 重新计数）+ 页面进入时拉取。

### 5.2 待办列表页（/collab/inbox）
- 表格：来源成员 / 工作流 / 节点 / 状态（open 倒计时 / done / expired / unreachable）/ 时间；
- 点击 → 打开待办卡片（04 §4.4）：payload 渲染 / form-collect 表单 / 决策按钮 / 查看上下文；
- 空态：无待办时显示"暂无待处理的审核任务"。

### 5.3 组件复用
- payload 渲染：从 WorkflowRunDetail.vue 抽 `ReviewPayloadView`（展示 + editableFields 编辑 +
  form-collect 表单）供两处复用（本机运行详情 + 远程待办卡片），避免双实现漂移。

## 六、IPC / preload（collab 命名空间）

```
collab.status()                     → { enabled, deviceId, displayName, onlineDevices: [...] }
collab.identity.get() / .setDisplayName(name) / .generatePairCode() / .pair(code)
collab.devices.list() / .remove(deviceId)
collab.team.*                        （02 §五）
collab.asset.share(assetId, targets) / .revoke(shareId) / .sharedList() / .remoteList()
collab.review.listInbox() / .getInbox(id) / .decide(inboxId, decision, editedValues?) /
       .uploadFile(inboxId, fieldKey, fileName, base64) / .markDone(inboxId)
collab.onInboxChanged(cb)           → 事件订阅（红点刷新）
collab.onAssetSharedChanged(cb)     → 资产中心「共享给我」刷新
app.onNavigate(cb)                  → 系统通知点击跳转
```

## 七、测试计划（TDD）

| 层 | 用例 |
|---|---|
| 桥 | tapEvents 捕获 review-requested(assigneeId 远程) → 组 collab:review-assigned 发对端；
  本机 assignee（空/自己）不转发；未知通道忽略 |
| 接收 | 远程 review-assigned → inbox upsert（幂等）+ emit 本地 review-requested；
  share-grant → shadow upsert + emit 资产刷新 |
| Notification | showSystemNotification 成功/异常降级；clickAction 路由跳转（mock BrowserWindow） |
| 待办 UI | 红点计数（本地+远程合并）；列表状态映射；卡片渲染 human-review/form-collect |
| 可靠性 | outbox 补发后 inbox 更新；重复事件幂等；桥重启后状态以 DB 为准 |

## 八、跨部分契约落点（00 §5 对齐）

- 通道：`collab:review-assigned / collab:review-decided / collab:inbox-expired /
  collab:share-grant / collab:share-revoke`（00 §5.2 定义，本部分实现收发）；
- 本部分**不定义新协议消息**，只实现 00 §5.2 的收发与 04 §3 时序图中的桥环节。
