# Part 2 · 团队与成员管理（02/07）
> 状态：设计中（2026-08-27）｜暂不实施｜依赖：Part 1（身份/传输）

## 一、职责边界

- 团队 = 一个成员（owner 设备）创建；其他成员经邀请码加入；
- 团队提供**两种用途**：共享范围（「共享给整个团队」）与工作流指派范围（处理人下拉选项）；
- 成员即设备（`memberId = deviceId`，见 00 §5.1）；一人多设备 = 多个成员，V1 不做合并。

本部分**不**负责：共享授权本体（03）、指派本体（04）、通知送达（05）——只提供权威的
**团队/成员数据**与**角色校验**。

## 二、权威模型（owner 实例为准，成员缓存副本）

### 2.1 为什么 owner 权威
- 局域网无中心服务器（约束），必须选一个实例持有权威数据；
- 选 **owner（创建团队的那台设备）** 作为权威：成员增删/角色变更/团队解散都由 owner 操作，
  成员实例只存**只读缓存副本**（最终一致，owner 变更后推送 + revision 版本号）；
- 与 00 D1「单写者」同一原则：避免分布式一致性（CRDT/合并冲突）复杂度。

### 2.2 数据模型（owner 实例本地权威表）
```
teams:                                  -- owner 实例
  id            TEXT PRIMARY KEY
  name          TEXT NOT NULL
  owner_device_id TEXT NOT NULL
  revision      INTEGER NOT NULL DEFAULT 0   -- 每次成员/元数据变更 +1，同步用
  created_at    DATETIME
  updated_at    DATETIME

team_members:                           -- owner 实例
  id            TEXT PRIMARY KEY
  team_id       TEXT NOT NULL
  device_id     TEXT NOT NULL           -- 成员（=设备）
  display_name  TEXT NOT NULL           -- 冗余快照（成员改名后 owner 侧推送更新）
  role          TEXT NOT NULL DEFAULT 'member'   -- 'owner' | 'member'
  status        TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'removed'
  joined_at     DATETIME
  UNIQUE(team_id, device_id)
```

### 2.3 成员实例缓存（只读副本）
```
collab_team_cache:                      -- 成员实例本地
  team_id       TEXT PRIMARY KEY
  name          TEXT
  owner_device_id TEXT
  revision      INTEGER
  synced_at     DATETIME

collab_team_member_cache:               -- 成员实例本地
  team_id       TEXT
  device_id     TEXT
  display_name  TEXT
  role          TEXT
  status        TEXT
  PRIMARY KEY (team_id, device_id)
```
- 缓存用途：离线时仍能展示成员列表/处理人选项（标"离线缓存"）；在线时随 revision 增量更新。

## 三、流程

### 3.1 创建团队（owner 侧）
- 设置页 → 协作 → 「创建团队」：输入名称 → owner 实例建 teams + team_members(owner 行)；
- 生成**团队邀请码**（6 位，一次性，10min 过期，含 teamId + 邀请方 deviceId + 有效期）。

### 3.2 加入团队（被邀请方）
- 输入邀请码 → 校验（未过期/未用）→ 通过 `team.join` RPC 发给 **owner 实例**（码内 teamId 定位）；
- owner 侧校验：码有效 → 插入 team_members(deviceId=请求方) → revision++ → 返回 TeamInfo；
- 请求方写入本地缓存；owner 广播 `collab:team-updated{teamId, revision}` 给全员（缓存刷新）。
- 边界：
  - 已在团队 → 返回"已是成员"（幂等）；
  - 团队已解散 / owner 离线 → 码校验失败或 RPC 失败 → 提示"团队不可达，稍后重试"；
  - 码过期/已用 → 明确报错，请 owner 重新生成。

### 3.3 成员管理（owner 侧操作）
- 成员列表：owner 查权威表；成员查缓存（在线时也可 RPC `team.info` 拉最新）。
- 移除成员：owner 删行 → revision++ → 推送更新 + 给被移除者 `collab:team-removed` →
  被移除者清缓存 + 标记其名下共享/待办失效（03/04 消费该事件）。
- 角色变更：V1 仅 owner 可改 role（member ↔ owner 转移需谨慎：转移后新 owner 成为权威。
  设计保留，V1 **不做 owner 转移**——若 owner 设备丢失，团队数据无法迁移，见 06 风险）。

### 3.4 解散团队
- owner 删除 teams + team_members → 广播 `collab:team-removed` → 全员清缓存；
- 关联清理：共享授权（03 的 asset_shares target_type='team'）随之失效；待办不受影响（已派发的
  按 member 粒度存，见 04——若指派目标恰为该团队，需在 04 消费 team-removed 时把未处理待办
  标记为"团队已解散"）。

## 四、同步与一致性

| 事件 | 触发 | 方向 | 接收方动作 |
|---|---|---|---|
| `collab:team-updated` | owner 增删成员/改角色/改名 | owner→全员 | 缓存 revision 比对，增量刷新 |
| `collab:team-removed` | 解散 / 被移除 | owner→目标成员 | 清缓存 + 通知 03/04 清理 |
| `team.info` RPC | 成员主动拉取 | 成员→owner | 返回权威快照（含 revision） |

- **revision 冲突**：缓存 revision < 推送 revision → 全量重拉（简单可靠，团队数据量小）；
  相等 → 忽略。
- 成员离线期间的变更：owner 侧把变更写入 `collab_outbox`（Part 1 补发机制），重连后送达。
- **owner 离线时**：成员无法增删成员/解散（写操作都发 owner），但**读缓存照常**（处理人下拉、
  共享目标选择可用，标"数据可能过期"）。

## 五、IPC / UI

```
IPC（preload electronAPI.collab.*）：
  collab.team.create(name)                       → TeamInfo
  collab.team.info()                             → 我所在的团队列表（缓存 + 在线拉取）
  collab.team.invite(teamId)                     → 生成邀请码（owner）
  collab.team.join(code)                         → 加入
  collab.team.members(teamId)                    → 成员列表
  collab.team.removeMember(teamId, deviceId)     → owner 操作
  collab.team.rename(teamId, name)               → owner 操作
  collab.team.disband(teamId)                    → owner 操作

UI（设置页「协作」tab 子区）：
  - 我的团队：创建/解散/改名
  - 团队成员：列表（在线状态点）/ 移除 / 邀请码展示（大字 + 过期倒计时）
  - 已配对设备：设备名/IP/在线状态/移除配对
```

## 六、与 Part 3/4 的接口（消费方视角）

- **03 共享目标选择器**：成员列表 = 缓存 team_members（标在线状态）+ 团队 id；
  共享时目标 `{ targetType: 'member'|'team', targetId }` 由 02 提供校验（是否本团队成员）。
- **04 指派处理人下拉**：选项 = 团队成员（除发起者自己）+ "本机处理"（默认）；
  指派存 `assigneeId = deviceId`；校验（graph-validator）「assignee 必须是团队成员」由 02 提供
  `isTeamMember(deviceId)` 查询（在线时 RPC、离线时缓存）。

## 七、测试计划（TDD）

| 用例 |
|---|
| 创建团队 → owner 权威行 + 邀请码生成（一次性/过期/码内字段） |
| 加入：码有效/无效/过期/已用/重复加入（幂等） |
| 移除成员：owner 操作 + 缓存刷新 + 被移除者收到 team-removed |
| 解散：全员缓存清理 + 关联共享失效通知 |
| revision 同步：增量 vs 全量重拉；离线补发（outbox） |
| 角色：member 无法增删成员（owner 校验拒绝） |
| owner 离线：成员读缓存 OK、写操作报"团队不可达" |
