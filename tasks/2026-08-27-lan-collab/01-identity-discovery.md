# Part 1 · 设备身份与局域网发现（01/07）
> 状态：设计中（2026-08-27）｜暂不实施｜依赖：无（地基）

## 一、职责边界

本部分提供协作功能的**地基**：
1. **设备身份**：每个实例生成/持久化长期 Ed25519 密钥对，形成全局唯一 `deviceId`；
2. **发现**：在局域网内发现其他 The Bot 实例（mDNS 主 + UDP 广播兜底 + 手动 IP 最终兜底）；
3. **配对**：首次信任建立（6 位邀请码交换公钥 → 写入信任名单）；
4. **连接**：每实例双角色（WS 服务端 + 客户端）的 P2P 网状连接，心跳/断线重连；
5. **传输**：JSON 协议（rpc / rpc-res / event / hello）+ 二进制分片（大文件内容用）。

本部分**不**关心业务语义（团队/资产/指派），只提供：
- `collab.transport.sendTo(deviceId, message)`（可靠投递，见 §5.4）；
- `collab.transport.onMessage(cb)`；
- 设备在线/离线状态与事件；
- `collab.identity` 访问器。

## 二、身份模型

### 2.1 密钥对与 deviceId
- 首次启用协作（设置页开关或首次发现）时生成 **Ed25519 密钥对**：
  - 私钥：主进程 SecureStorageService 加密存储（与 API key 同机制），**永不出主进程**；
  - 公钥：随 mDNS 广播与 hello 握手暴露；
  - `deviceId = uuid v4`（一次性生成，随身份持久化）。公钥指纹 `sha256(pubKey)[:8]` 用于
    UI 展示与防误配（与 Syncthing 设备 ID 风格一致）。
- 持久化位置：`collab_identity` 表（本地，无 user_id 语义——设备身份全局唯一）：
  ```
  collab_identity:
    id            TEXT PRIMARY KEY        -- 恒为 'self'（单行）
    device_id     TEXT NOT NULL
    display_name  TEXT NOT NULL           -- 用户在设置页可改（改后广播更新）
    pub_key       TEXT NOT NULL
    priv_key_cipher TEXT NOT NULL         -- SecureStorage 加密后的私钥密文
    ws_port       INTEGER                 -- 本机 WS 服务端口（动态分配后回写）
    created_at    DATETIME
  ```

### 2.2 信任名单（devices 表）
```
collab_devices:                          -- 本机身份 + 已配对设备
  id            TEXT PRIMARY KEY         -- 与对方 deviceId 一致（表内唯一）
  is_self       INTEGER NOT NULL DEFAULT 0
  display_name  TEXT NOT NULL
  pub_key       TEXT NOT NULL
  last_addr     TEXT                     -- 最近可达地址 host:port（断线重连用）
  online        INTEGER NOT NULL DEFAULT 0
  last_seen_at  DATETIME
  paired_at     DATETIME
```
- 只有 **信任名单内**（已配对）的设备才可建立连接、收到任何业务数据；
- 发现的陌生设备只展示"发现但未配对"占位（可点「配对」），不显示其业务信息。

## 三、发现（三层兜底）

### 3.1 层 1：mDNS / DNS-SD（主）
- 库：`bonjour-service`（纯 JS、维护活跃、无原生编译）。
- 广播：本实例发布服务 `_thebot._tcp`，TXT 记录含：
  `deviceId`, `displayName`, `port`（WS 端口）, `fp`（公钥指纹前 8 位）, `proto`（协议版本）。
- 监听：同网段其他 `_thebot._tcp` 服务。命中后：
  - 已在信任名单 → 若未连接则发起连接（§4.2）；
  - 未配对 → 记入"发现列表"（UI 显示 + 可发起配对）。
- 优势：自动发现/自动重连/随设备名变化实时更新；公司网普遍放行 mDNS。
- 局限：跨 VLAN/AP 客户端隔离时组播被阻断 → 层 2 兜底。

### 3.2 层 2：UDP 广播（兜底）
- 每 10s 向 `255.255.255.255:<udpPort>` 广播心跳 JSON：`{ deviceId, displayName, port, fp, proto }`。
- 收到广播 → 设备不在信任名单则忽略（不泄露自身信息给陌生设备）；在名单 → 确认在线 + 补连。
- 端口：固定 `udpPort = 49152`（IETF 动态/私有范围），可配。
- 局限：仅同子网；跨子网不行 → 层 3。

### 3.3 层 3：手动添加（最终兜底）
- 设置页「添加设备」：输入 `IP[:port]` + 对方 **6 位邀请码**（配对流程，§4.1 反向）。
- 用于：mDNS/UDP 全被禁、跨子网、AP 隔离等场景。

### 3.4 发现状态机
```
idle → (mDNS 或 UDP 或手动) → discovered(未配对) → 配对 → paired → (连接) → online
   └────────────── 心跳超时 ──────────────→ offline（保留 paired，自动重连）
```

## 四、配对与连接

### 4.1 配对（首次信任建立，双向对称）
```
邀请方 A                         被邀请方 B
   │ 生成一次性 6 位码(含A的deviceId+fp+有效期10min)   │
   │ 把码给 B（口头/IM/扫码）                          │
   │                               输入码 →
   │ ←────── hello{deviceIdB, pubKeyB, code} ──────┐
   │ 校验码有效 + 未过期 + B 不在名单 → 记录 B       │
   │ ────── hello-ack{deviceIdA, pubKeyA} ────────► │
   │                               校验 A 指纹=码内 fp → 记录 A
   │ 双方各自写入 collab_devices（paired_at=now）      │
```
- 邀请码：`crypto.randomInt(0, 10**6)` 补零为 6 位；一次性（配对成功即失效）；10 分钟过期；
  码内嵌 A 的 deviceId + fp，防中间人（B 校验 hello-ack 的 fp 与码内一致）。
- **连接时再校验**：TCP/WS 握手 hello 必须带已配对公钥，服务端校验对端 deviceId ∈ 信任名单
  且 pubKey 匹配，否则拒绝（防局域网伪造）。
- 码的传递不在本系统内（用户口头/截图/IM），与 LocalSend/VS Code Live Share 一致。

### 4.2 连接（每实例双角色）
- 每实例启动一个本地 WS 服务端（端口动态分配，写回 collab_identity.ws_port，尽量固定）；
- 同时作为客户端连接信任名单中的在线设备（双向连接；同一对设备只保留一条**主连接**，
  由 deviceId 排序的主动方建立，另一条复用）。
- 一条连接上复用三种流量（同一 WS 通道）：
  - `rpc` / `rpc-res`：请求-响应（msgId 关联）；
  - `event`：单向事件推送；
  - 二进制分片：文件内容（§6）。
- 心跳：每 10s ping/pong；连续 3 次未 pong → 判 offline → 指数退避重连（1s,2s,4s…上限 60s）。
- 连接事件对外暴露：`collab:device-online` / `collab:device-offline`（Part 2/3/4 订阅刷新 UI）。

### 4.3 消息协议（JSON over WS 文本帧 + 二进制帧）
```
text 帧:
  { type: 'hello',         deviceId, displayName, pubKey, proto }
  { type: 'hello-ack',     deviceId, pubKey }
  { type: 'rpc',           msgId, method, params }
  { type: 'rpc-res',       msgId, ok, data | error }
  { type: 'event',         channel, data }          // channel 如 'collab:review-assigned'
  { type: 'ping' } / { type: 'pong' }
binary 帧（文件内容）:
  [8 字节: msgId big-endian][4 字节: offset][4 字节: length][payload]
  （与 rpc 的 asset.fetchContent 成对出现，见 03）
```
- `proto`：协议版本号（首版 1）。不匹配 → 拒绝连接并提示升级（防止新旧版本语义漂移）。

## 五、传输层语义

### 5.1 RPC 调用
- `sendRpc(deviceId, method, params, timeoutMs=30s) → Promise<data>`；
- 超时 / 对端离线 → reject（调用方决定降级，如"发起者离线"提示）；
- 失败**不自动重试**（业务层决定是否重试——如 04 决策回传的重试策略）。

### 5.2 事件投递（尽力 + outbox 补发）
- `sendEvent(deviceId, channel, data)`：在线直接发；离线 → 写入 `collab_outbox`；
- `collab_outbox` 由后台任务每 30s 扫描：对端在线 → 补发 → 标记 sent_at（重连后立即补发一轮）；
- 补发**不保证恰好一次**：事件载荷需幂等（业务层处理重复，如 review-assigned 重复到达
  覆盖同 inboxId 行）。

### 5.3 可靠投递保证（对业务层的承诺）
| 场景 | 承诺 |
|---|---|
| 对端在线 | 消息到达（TCP 语义） |
| 对端离线 | 进入 outbox，恢复在线后补发（事件类）；RPC 类直接失败（业务层重试或提示） |
| 对端重启 | 重连成功 = 重新握手；此前 RPC 全部超时失败；事件从 outbox 补发 |
| 重复投递 | 业务载荷携带幂等键（inboxId/grantId），接收方去重 |

### 5.4 对外 API（Part 2~5 唯一使用面）
```
collab.transport.status()                       → { online: boolean, devices: DeviceInfo[] }
collab.transport.sendRpc(deviceId, method, params, timeoutMs?)
collab.transport.sendEvent(deviceId, channel, data)
collab.transport.onMessage(cb: (from, msg) => void)
collab.transport.onDeviceChange(cb)             // online/offline/name 变化
collab.identity.get()                            → { deviceId, displayName, pubKey, wsPort }
collab.identity.setDisplayName(name)
collab.identity.pair(code) / collab.identity.generatePairCode()
```

## 六、二进制分片传输（文件内容，03 用）

- 场景：成员拉取共享**文件**资产（图片/音频/视频/PDF 等），内容在源实例磁盘。
- 协议：发起方发 `rpc asset.fetchContent{originAssetId, kind:'file', offset}`；
  源实例按 **1MB/片** 读取文件，先回 `rpc-res{ok, chunk:{offset,length,hash,total}}` 携带首片
  元信息，随后发二进制帧续传；每片 ack（`rpc asset.ackChunk{msgId}`）后发下一片——**ack 式
  滑动窗口**（窗口 8 片），防接收端积压。
- 断点续传：接收方本地 SQLite 记录 `collab_transfer`（fileKey, receivedBytes, 校验和）；
  中断后重发 `fetchContent{offset: receivedBytes}` 续传。
- 完整性：每片 sha256，末尾比对 total 字节数 + 整体文件 hash（源端 metadata.sizeBytes/hash）。
- 流控：1MB/片 + 窗口 8 = 8MB 在途；局域网 1Gbps 足够（实测优先，必要时降窗口）。

## 七、安全

| 威胁 | 对策 |
|---|---|
| 陌生设备嗅探/连接 | 连接前校验对端 deviceId ∈ 信任名单 + pubKey 匹配；未配对设备不建连 |
| 中间人（首次配对） | 邀请码含 fp + 10min 过期 + 一次性；B 校验 hello-ack 指纹 |
| 传输窃听 | 首版明文（内网+信任名单）；预留 Ed25519 签名握手 + X25519 + ChaCha20-Poly1305
  会话加密开关（设置页「加密传输」），开启后 hello 后协商会话密钥，所有帧加密 |
| 私钥泄露 | SecureStorage 加密存储，私钥不出主进程 |
| 拒绝服务（恶意刷连接） | 每 IP 连接上限 + 握手超时（5s）+ 名单外连接直接关闭 |
| AP 客户端隔离 | 无法在本层解决 → 层 3 手动 IP + UI 提示（见 06 风险） |

## 八、测试计划（TDD）

| 层 | 用例 |
|---|---|
| identity | 生成/加载密钥对幂等；deviceId 唯一；displayName 更新持久化 |
| pairing | 码生成/校验/过期/一次性；hello-ack 指纹校验；重复配对幂等 |
| discovery | mDNS 广播/发现回调；UDP 心跳解析；手动添加（mock 网络层） |
| transport | hello 握手拒绝名单外设备；rpc 超时/成功/离线失败；event outbox 补发（离线→在线）；
  重连指数退避；重复消息去重键 |
| 分片 | 1MB 片收发 + ack 窗口；断点续传（模拟中断）；hash 校验失败重传 |

测试策略：网络层抽象为接口（`INetworkAdapter`），单测用内存 mock；分片/续传用真实 ws 本地
对连（vitest 起两个 ws server/client）验证。
