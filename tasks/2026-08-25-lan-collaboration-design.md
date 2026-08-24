# 局域网团队协作功能设计（发现 / 团队 / 共享资产 / 工作流指派）
> 状态：**已归档为技术选型总览**（2026-08-25）→ 详细设计已拆分至
> `tasks/2026-08-27-lan-collab/00~07`（总览/身份发现/团队/共享资产/工作流指派/通知/计划/价值复盘）
> 目标版本：collab 模块（新建）
> 前置：本设计为技术选型 + 详细方案，**暂不实施**，待评审后分期落地

## 一、需求

同一公司局域网内多台电脑各运行一个 The Bot 实例（Electron 桌面应用），实现团队协作：

1. **发现与邀请**：局域网内自动发现其他用户（设备），可邀请其加入自己的团队
2. **共享资产**：团队成员之间互相共享资产（图片/音频/视频/文件/文本/JSON），
   共享时可选择「单个或多个成员」或「整个团队」
3. **像本地资产一样使用共享资产**：
   - AI 对话中可 @ 其他成员的共享资产（内容按需取用）
   - 工作流引擎中可引用其他成员的资产
   - 后续其他功能模块若支持引用资产，也应能引用共享资产（引用层统一）
4. **工作流人工环节指派**：human-review（或 form-collect）等需用户处理的环节可指派给
   团队其他成员；运行到该环节时，被指派成员的 App 弹出提示（系统通知 + 应用内待办）要求处理

约束：无中心服务器依赖（纯局域网）、无需公司 IT 介入（除防火墙放行）、数据主权在各自实例、
离线/断网可降级、安全上信任公司内网但需防误连/恶意接入。

## 二、现状架构（与本设计相关的既有事实）

### 2.1 多租户基础
- `users` 表：Electron 单机固定 `id='local-default-user'`；Web 部署多用户（email/密码）
- `assets` 表：`user_id` 列由 BaseRepository scoped 机制自动注入（PC 端 null / Web 端 ALS 用户）
- 资产 = 工作流/应用产出的可复用成果：`kind`（file|url|text|json），文件型存 `storage_path`（相对 dataPath），
  二进制在 `dataPath/assets/`，DB 只存元数据；`asset_group` 支持套图/组图

### 2.2 资产引用句柄
- 外部模块引用资产 = **资产 id**（如工作流 save-asset/load-asset 配置存 assetId、对话消息附件存 asset 引用）
- 渲染层有 `asset-source-meta` 组件展示来源（工作流/应用产出溯源）

### 2.3 工作流人工环节
- human-review 节点 `execute()` 返回 `{ status: 'waiting_review', payload, timeoutMs }` → 引擎挂起
- 恢复走 `reviewDecide(runId, nodeId, {decision, editedValues})`（approve / approve_with_changes / reject）
- 事件：`WORKFLOW_RUN_EVENT_TYPES` 已有 `reviewRequested: 'review-requested'`、`notify: 'notify'`

### 2.4 事件总线与双端
- `IEventEmitter`：Electron 实现 = `ElectronBroadcastEventEmitter`（广播到所有 BrowserWindow + taps），
  Web 实现 = WebSocketEventEmitter（同语义）——**emit(channel, data)** 是统一入口
- IPC：`src/electron/ipc/handlers/*` 通过 getter 取服务实例；`src/preload/index.ts` 暴露 `electronAPI.<ns>.*`；
  Web 端 `src/web/client/channel-map.ts` 自动映射同一套 API
- 子系统装配模式：`initWorkflowSubsystem()` 单例 + 双端各调一次（boot 幂等）

### 2.5 会话/应用
- `app-session`：应用会话（运行工作流的容器），review 卡片渲染送审内容，AppSession 的 review 走 reviewDecide

### 2.6 调研补充（2026-08-25 并行调研结论）

**资产系统**：
- 资产句柄全系统统一为 **assetId 字符串**（工作流 read-asset 配置 / AI 对话 @ 附件 assetId / start 输入 `source='assets:template'`）
- 可见性现状仅两档：`(user_id = 自己 OR is_builtin = 1)`（asset.repository.ts:86-97）——**无团队档**，这是共享的扩展点
- 文件型资产 = `dataPath/assets/<大类>/<yyyyMM>/` 相对路径；**Web 端 /assets 路由按"请求用户 dataPath"解析**（跨用户共享需改为按归属者解析 + 权限校验）；Electron 端本地直读
- 先例：`is_builtin`（user_id NULL 全局共享、禁删改、可复制为自有）、`share_token`（app 跨租户免登录分享令牌）——共享资产可复刻
- 缺口：KB 不引用资产（DocumentSource 仅 'diary'）；对话文件检索只认 filePath 附件不认 assetId

**工作流指派相关**：
- waiting_review 挂起/恢复机器现成（engine handleReviewSuspend → resumeReview）；`reviewDecide(runId, nodeId, ...)` 按 (runId, nodeId) 定位；form-collect 复用同一机器（一并获得指派能力）
- node_run 表已有 wait_expires_at / review 留痕列；`findWaitingReview` 是"当前用户"查询 → 扩展"按 assignee 查询"
- 事件：`getEventEmitter().emit(channel, data)` 任意通道；Electron 广播所有窗口（天然弹提示）；Web 端按 ALS userId 路由（需扩展按目标 userId）
- **项目目前无 Electron 系统 Notification 使用**（通知 = 引擎事件 → ElNotification）→ 需新建主进程 Notification
- 前端 `pendingReviewCount` 无 UI 消费方 → 待办入口的落点
- **V1 限制**：重启后 waiting_review 保持挂起但决策需续跑重驱；指派场景建议同步评估「从 DB 重建挂起态」（applyReviewDecision 已具备装配能力）

（详细调研结果见下文各节——由并行调研子任务产出）

## 三、技术选型总览（详见 §4）

| 维度 | 推荐 | 备选 | 关键理由 |
|---|---|---|---|
| 设备发现 | mDNS/DNS-SD（bonjour-service）+ UDP 广播兜底 + 手动 IP | 中央协调器 | 无需 IT 介入；公司网普遍允许 mDNS/UDP |
| 通信 | 每实例一个本地 WebSocket 服务端 + 对其他实例的 WS 客户端（P2P 对等） | HTTP REST / gRPC | WS 长连接天然支持双向 RPC + 事件推送；JSON 协议 |
| 身份 | 实例生成长期 Ed25519 密钥对；6 位邀请码首次配对换公钥；信任名单本机持久化 | 证书/TLS | 内网信任模型足够；免证书管理 |
| 传输加密 | 配对后会话密钥（X25519 + ChaCha20-Poly1305）可选开启 | 明文（仅内网信任） | 防公司网络上的嗅探 |
| 共享资产 | **元数据同步 + 内容按需拉取**（引用优先，文件分块传输） | 全量同步（Syncthing 风） | 省带宽；撤回即时生效；与「引用句柄=assetId」平滑兼容 |
| 通知 | 协作层把 review-requested/notify 事件经 WS 转发给目标实例 → 目标实例本地 emit → Electron Notification | 轮询 | 复用现有事件总线；实时 |
| 参考产品 | LocalSend（双角色+发现）/ Syncthing（公钥身份+多层发现）/ VS Code Live Share（邀请+协调者） | — | 各取其架构要点 |

传输补充：文件内容按需拉取时用 **WS 二进制分片（如 1MB/片）+ ack + 本地 SQLite 记录断点**（断线续传）；撤回 = 拒绝后续拉取 + 广播撤销事件。

## 四、详细设计

### 4.1 发现与连接（P2P 对等网络）

**发现（三层兜底）**：
1. **mDNS/DNS-SD**（主）：bonjour-service 广播 `_thebot._tcp` 服务（deviceId/显示名/端口/指纹），
   同时监听发现已配对设备——自动发现、自动重连
2. **UDP 广播**（兜底）：每 N 秒向 `255.255.255.255:port` 广播心跳，含设备元数据（跨子网/某些
   mDNS 被禁的网络）；收到后若在信任名单 → 建立连接
3. **手动添加**（最终兜底）：输入对方 IP + 端口 + 邀请码配对

**连接（每实例双角色）**：
- 每实例启动一个本地 WS 服务端（端口动态分配，尽量固定/可配），监听信任名单内设备的连接
- 同时作为客户端连接已发现的信任设备（相互连接，双向复用：一条连接上既走 RPC 请求/响应
  也走事件推送，`msgId` 关联请求）
- 心跳（ping/pong，约 10s）→ 断线重连（指数退避）；设备状态（online/offline）实时反映到 UI

**协议（JSON over WS）**：
```
{ type: 'rpc', msgId, method: 'asset.fetchContent'|'review.decide'|..., params }
{ type: 'rpc-res', msgId, ok, data | error }
{ type: 'event', channel: 'collab:share-grant'|'collab:review-assigned'|..., data }
{ type: 'hello', deviceId, displayName, pubKey, protocolVersion }  // 连接建立时身份握手
```

### 4.2 身份与团队

**设备身份（长期密钥对）**：
- 首次启用协作时生成 Ed25519 密钥对，私钥存本机（主进程安全存储），公钥 + 设备 id + 显示名
  + 随机端口（WS 服务端口，动态分配）经 mDNS 广播
- `devices` 本地表：本机身份 + 已配对设备（peerId / 显示名 / 公钥 / 最近地址 / 状态）

**配对（首次信任建立）**：
- 邀请方生成一次性 6 位邀请码（含邀请方 deviceId + 公钥指纹 + 有效期）
- 被邀请方输入邀请码（或扫码）→ 双方交换公钥 → 写入对方 `devices` 表（信任名单）
- 之后发现/连接只接受信任名单内的设备（防局域网伪造）

**团队**：
- 团队 = 一个成员（owner）创建；其他成员经邀请码加入
- **owner 实例持有团队权威数据**（team 元数据 + membership 列表 + 成员角色）；成员实例缓存副本
  （最终一致，owner 变更后推送）
- 角色：owner（管理成员/解散）/ member；未来可扩展 view/operator
- 团队用途：共享范围（「共享给整个团队」= target_type='team'）+ 工作流指派范围（处理人下拉选项）
- 一个设备可属于多个团队（可扩展；首版建议 1 个主团队，避免共享范围歧义——设计保留多团队能力）

### 4.3 共享资产（授权模型 + 元数据同步 + 按需传输）

**授权（grant）模型——单写者（owner 实例为准）**：

```
asset_shares 表（owner 实例本地）：
  id            PK
  asset_id      → 本地 assets.id
  target_type   'member' | 'team'
  target_id     成员 id 或团队 id
  status        'active' | 'revoked'
  created_at / revoked_at
```

- 共享入口：资产中心 → 选中资产 → 「共享」→ 选择「成员A、成员B」或「整个团队」（需求 2）
- 授权是**声明在 owner 实例**的：成员侧不存授权（只存收到的影子行），权限判断总在源实例
  （拉取内容时校验）——撤回即时生效，无分布式授权同步难题
- 元数据同步：授权建立/变更 → 向目标实例推送 `collab:share-grant`（含资产元数据 + origin 标记）
  → 成员本地建/更新影子行；元数据变更（改名/标签）→ 推送更新；撤销 → 推送失效
- 离线目标：推送失败 → owner 侧 `collab_outbox` 队列，重连后补发
- 传输：内容一律**按需拉取**（§4.4），元数据全量轻量同步；大文件不预同步
- 图片类资产预览：成员列表展示时只显示元数据占位（缩略图按需拉取第一帧/小图，属内容拉取范畴）

### 4.4 远程资产使用（对话 @、工作流引用）——「影子资产」方案

**核心决策：共享资产在成员本地建立「影子记录」**——`assets` 表加两列：

```
origin_device_id  varchar null   -- 来源实例 id（null = 本地资产）
origin_asset_id   varchar null   -- 来源实例的资产 id（null = 本地资产）
```

- 收到共享授权 → 成员实例插入**影子行**：复制元数据（kind/name/category/subCategory/tags/mimeType/sizeBytes），
  内容字段（textContent/jsonContent/storagePath）留空（不落盘，按需拉取）
- 现有所有引用点（AI 对话 @资产、工作流 load-asset、知识库、资产中心）**只认 assetId**
  → 影子行就是普通 asset 行，**零改动接入**（满足「后续其他模块也能引用共享资产」）
- **读取时**：AssetService 统一拦截——影子行 → 经协作层向来源实例发起
  `fetch-asset-content(originAssetId)` RPC：
  - text/json：直接返回内容
  - file：分块传输到本地临时目录，返回可读路径（可缓存，带版本/过期）
- **权限即时生效**：来源实例每次响应前校验「请求方仍被授权」（grant 未撤回）
- **撤回**：来源实例删 grant → 推送撤销事件 → 成员本地影子行置为失效 + 清理内容缓存
- **UI**：资产中心新增「共享给我」分组（来源成员名 + 远程标记）；@ 选择器同样可见（标注共享来源）；
  影子资产只读（不可编辑/删除，只能从来源撤销）

**工作流引用共享资产**：load-asset / save-asset 等节点配置里选资产时，选择器同时列出本地 + 共享资产；
运行时经同一 AssetService 读取路径（影子行 → 按需拉取），无需引擎感知远程概念。

**AI 对话 @ 共享资产**：@ 面板数据源 = 本地资产 + 影子资产；选择共享资产时内容按需拉取注入上下文；
来源溯源组件（asset-source-meta）显示「来自 成员X 的设备」。

### 4.5 工作流人工环节指派（先行设计，基于已确认的引擎机制）

**现状机制**：human-review 节点 `execute()` 返回 `{ status: 'waiting_review', payload, timeoutMs }`
→ 引擎把运行挂起；前端通过 `review-requested` 事件 + `getPendingReviews()` 获取待办；
处理走 `reviewDecide(runId, nodeId, {decision, editedValues})`（approve/approve_with_changes/reject）续驱。
form-collect（interaction-nodes）复用同一挂起/恢复机器。

**指派设计**：

1. **节点配置**：human-review / form-collect 的 config 增加可选 `assignee`（团队成员 id，空 = 本机处理人）。
   表单 Schema（`workflow-node-forms.ts`）加「处理人」下拉，选项来自协作模块的团队成员列表；
   校验器（graph-validator）不要求必填（兼容既有工作流），但若填写须是团队成员。
2. **挂起与通知**：引擎执行到该节点照常 `waiting_review`（运行状态始终留在**发起者实例**）。
   协作层订阅 `reviewRequested` 事件 → 若节点 assignee 是远程团队成员：
   通过 WS 向该成员实例推送 `collab:review-assigned`（含 runId/nodeId/payload 摘要/发起者地址）。
   对方实例收到 → 本地 `emit('review-requested', ...)`（复用现有前端订阅）+ Electron Notification 弹提示
   + 应用内「待我处理」待办列表（本地 `collab_inbox` 表缓存）。
3. **远程处理**：被指派成员在待办列表/通知里打开 → 展示送审内容 → 提交决策。
   决策经 WS **RPC 回发起者实例**执行 `reviewDecide`（运行状态在发起者），
   发起者续驱并把结果事件广播（含回执给处理者实例刷新待办状态）。
   离线降级：RPC 失败 → 待办保留 + 提示「发起者离线」，发起者上线后重试/由发起者侧超时提醒。
4. **待办聚合**：`getPendingReviews()` 返回「本地运行产生的待办 + 缓存中的远程指派待办」
   （远程待办在本地 `collab_inbox` 有行，状态随 RPC 回执更新）。

**关键决策**：运行状态单写者（发起者实例），成员只提交决策——避免分布式运行状态一致性难题；
与「共享资产内容按需拉取」同一原则（数据主权在源实例，使用者按需交互）。

**与现状机制的落点（调研确认）**：
- `node_run` 表新增 `assignee_id` 列（nullable，null=本机处理）——引擎挂起/恢复逻辑不动；
  `reviewDecide` 增加「操作者 = assignee 或 run owner」校验（否则拒绝）
- 事件：`WORKFLOW_RUN_EVENT_TYPES` 新增 `reviewAssigned: 'review-assigned'`（双端契约 workflow.types.ts）；
  引擎在 handleReviewSuspend 时若 assignee 存在则一并发出
- 待办：`findWaitingReview` 扩展「按 assignee_id 查询」（协作待办聚合）；前端 `pendingReviewCount`
  现有无 UI 消费方 → 落为「待我处理」入口（红点 + 列表，点击跳 `/workflow/run/:runId`）
- 弹提示：**Electron 主进程新增 `new Notification`**（目前项目未使用系统通知）——在协作层收到
  `collab:review-assigned` 时弹系统通知 + 应用内 ElNotification 双通道
- Web 端（若启用协作）：WebSocketEventEmitter 需支持「按目标 userId 推送」事件（当前只按 ALS 当前用户路由）

### 4.6 数据模型（新增表，本地 SQLite，多租户 userId 语义沿用）

```
devices                 -- 本机身份 + 已配对设备（信任名单）
  id PK / is_self / display_name / pub_key / last_addr / online / last_seen_at

teams                   -- 团队（owner 实例权威；成员实例缓存副本）
  id PK / name / owner_device_id / created_at / updated_at / revision

team_members            -- 团队成员（owner 实例权威）
  team_id / device_id / display_name / role('owner'|'member') / joined_at / status

asset_shares            -- 发出的共享授权（owner 实例权威）
  id PK / asset_id / target_type('member'|'team') / target_id / status / created_at / revoked_at

shared_assets            -- 收到的共享（影子资产，成员实例本地）
  id PK / origin_device_id / origin_asset_id / local_asset_id(→assets.id) / granted_at / status('active'|'revoked')

collab_inbox            -- 收到的远程指派待办（成员实例本地缓存）
  id PK / run_id / node_id / assigner_device_id / payload_summary / status('open'|'done'|'expired') / created_at

collab_outbox           -- 离线事件队列（发送失败补发）
  id PK / peer_device_id / payload_json / created_at / sent_at
```

迁移：新建 `collab-*` 迁移文件（幂等，双 DDL SQLite/PG）；`assets` 加 `origin_device_id/origin_asset_id` 两列用既有迁移模式；`node_runs` 加 `assignee_id`。

### 4.7 模块划分、API 与 UI

**模块**：`src/core/modules/collab/`
```
collab-boot.ts           -- initCollabSubsystem() 单例装配（Electron 端启动；Web 端默认禁用）
identity.ts              -- 密钥对生成/持久化（复用 SecureStorageService）、设备身份
discovery.ts             -- mDNS（bonjour-service）+ UDP 广播 + 手动 IP 三层发现
transport.ts             -- WS 服务端 + 客户端、心跳/指数退避重连、JSON 协议编解码、二进制分片
protocol.ts              -- 消息类型（rpc/rpc-res/event/hello）、RPC 路由、事件路由
team.service.ts          -- 团队/成员（owner 权威 + 成员缓存副本）
sharing.service.ts       -- 共享授权 + 影子资产维护 + outbox 补发
remote-asset.service.ts  -- 远程内容按需拉取 + 分块传输/断点续传 + 缓存/失效
notify.bridge.ts         -- 订阅 IEventEmitter → 转发远程事件；接收远程事件 → 本地 emit + Notification
```

**IPC**（preload `electronAPI.collab.*` + `collab:*` 通道 + channel-map 同步）：
```
collab.status / collab.devices.list / collab.devices.remove
collab.team.create / collab.team.info / collab.team.invite(code|scan) / collab.team.join(code) / collab.team.members
collab.asset.share(assetId, targets) / collab.asset.revoke(shareId) / collab.asset.sharedList / collab.asset.remoteList
collab.review.listInbox / collab.review.decideRemote(...) / collab.review.markDone
```

**UI（新增/扩展）**：
- 设置页新增「协作」tab：设备身份/邀请码/已配对设备/团队成员管理/共享管理
- 资产中心：「共享给我」分组（影子资产，只读）；「我的资产」行操作「共享…」（选成员/团队）
- 对话 @ 面板与资产选择器：列出共享资产（标注来源成员）
- 工作流 human-review/form-collect 配置表单：新增「处理人」下拉（团队成员）
- 全局「待我处理」入口（侧边栏红点 + 列表）：远程指派待办，点击展开送审内容并提交决策
- 系统通知：Electron Notification（收到远程指派/共享授权时）

### 4.8 安全

- 信任模型：**内网 + 配对公钥白名单**；未配对设备即使被发现也不建连、不显示敏感信息
- 传输：首版明文（公司内网 + 信任名单），预留会话加密（Ed25519 签名握手 + X25519 + ChaCha20-Poly1305）开关
- 授权校验：内容拉取/RPC 每次校验请求方 deviceId 在目标授权内（防越权）
- 数据最小化：元数据按需同步、内容按需拉取；撤回即时失效
- 私钥本机加密存储（复用 SecureStorageService）；邀请码一次性 + 过期（参考 app.share_token 先例）
- 风险披露：AP 客户端隔离会阻断 P2P——UI 提示 + 手动 IP + 远期「局域网协调器/云端信令」选项（超出本设计范围）

### 4.9 实施路线（分期，每期可独立交付）

| 期 | 内容 | 交付验证 |
|---|---|---|
| P1 | 身份 + 三层发现 + 连接/心跳/重连 + 配对 | 两台设备互相发现、在线状态、手动配对 |
| P2 | 团队 + 邀请码加入 + 成员管理 | 建团队、邀请、成员列表双向同步 |
| P3 | 共享资产：授权 + 影子资产 + 按需拉取（text/json/file 分块）+ 撤回 | 资产中心「共享给我」、点开取内容、撤回失效 |
| P4 | 引用层接入：对话 @ + 工作流 read-asset + start 输入 | 对话引用共享资产、工作流引用共享资产（含离线降级） |
| P5 | 工作流指派 + 跨实例通知 + 待办 + Electron Notification | 指派成员 → 对方弹通知 → 处理 → 发起者续驱 |

### 4.10 风险与边界

- **网络隔离**：公司 WiFi AP 隔离/组播屏蔽 → mDNS/UDP 失效（真实高频问题）→ 手动 IP + 同一网段说明；
  远期可选「局域网协调器（常开实例代理）」或云端信令（超出局域网范围，另立设计）
- **Windows 防火墙**：首次启动放行本地 WS 端口（需用户确认；打包时提供安装/运行提示）
- **多设备身份**：一人多设备 = 多个 deviceId；团队成员以 deviceId 为粒度
- **一致性**：团队/共享元数据最终一致（owner 实例为准，成员缓存 + 版本号）；运行状态单写者
- **数据量**：文件按需拉取 + 本地缓存 LRU/过期清理；WS 二进制分片（如 1MB/片）+ ack + SQLite 断点续传
- **并发**：多成员同时处理同一待办 → 首个决策生效（引擎 reviewDecide 天然串行/幂等）
- **密钥丢失**：设备重装后需重新配对；提示导出/备份说明（首版不自动迁移）
- **Web 部署版**：协作定位桌面场景，Web 端默认禁用（users 多租户多人是另一场景）

## 五、技术选型依据与参考

（结论同 §三 总览表。参考与依据由并行调研产出，含对比分析，详见评审时附带的调研记录。）

- 参考产品：**LocalSend**（每端双角色：既是 WS 服务端也是客户端 + 设备发现）、**Syncthing**（设备身份 = 公钥/指纹、多层发现）、**VS Code Live Share**（邀请链接 + 协调者）
- 关键决策来源：mDNS（bonjour-service，纯 JS 维护活跃）为主 + 手动 IP 兜底；WS mesh 复用一条连接
  承载 RPC/事件/文件分片；邀请码一次性配对 + Ed25519 设备密钥（Syncthing 模型）；按需拉取而非全量同步
  （撤回即时、带宽友好）；leader（owner 实例）权威副本避免 CRDT 复杂度


