# Part 3 · 共享资产（03/07）
> 状态：设计中（2026-08-27）｜暂不实施｜依赖：Part 1（传输/分片）+ Part 2（团队/成员）

## 一、职责边界

1. **授权模型**：资产所有者（源实例）把本地资产共享给指定成员或整个团队，可随时撤回；
2. **影子资产**：成员本地建立只读影子行（元数据复制、内容不落盘），全系统引用句柄不变
   （`assetId`）→ 对话 @ / 工作流 read-asset / 资产中心零改动接入；
3. **按需拉取**：读取内容时经协作层从源实例拉取（text/json 直传；file 分块+断点续传）；
4. **生命周期**：元数据变更同步、撤回即时失效、内容缓存清理。

本部分**不**负责：传输通道（01）、团队数据（02）、工作流引擎（04）、通知（05）。

## 二、核心决策回顾（00 D4）

- 授权声明在**源实例**（asset_shares）；成员只存影子行（assets 加两列）；
- 引用层无感：影子行就是普通 asset 行 → 所有现有消费点自动可用；
- 权限判断总在源实例（拉取内容时校验 grant 仍在）→ 撤回即时生效；
- 元数据轻量同步，内容按需拉取 → 带宽友好、撤回即时、无全量同步成本。

## 三、数据模型

### 3.1 迁移 1：assets 表加两列（现有迁移模式，双 DDL + 幂等）
```
ALTER TABLE assets ADD COLUMN origin_device_id   TEXT   -- 来源实例 deviceId（null=本地资产）
ALTER TABLE assets ADD COLUMN origin_asset_id    TEXT   -- 来源实例的资产 id（null=本地资产）
-- 索引：shadow 查询 (origin_device_id, origin_asset_id) 唯一（同一远程资产只一个影子行）
CREATE UNIQUE INDEX uq_assets_origin ON assets(origin_device_id, origin_asset_id)
  WHERE origin_device_id IS NOT NULL   -- SQLite partial index；PG 用部分索引同语法
```

### 3.2 迁移 2：共享授权（源实例本地表）
```
asset_shares:                           -- 源（owner）实例
  id            TEXT PRIMARY KEY
  asset_id      TEXT NOT NULL           -- 本地 assets.id
  target_type   TEXT NOT NULL           -- 'member' | 'team'
  target_id     TEXT NOT NULL           -- 成员 deviceId 或 teamId
  status        TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'revoked'
  created_at    DATETIME
  revoked_at    DATETIME
  -- 索引：按资产查授权、按目标查授权
```

### 3.3 迁移 3：收到共享的登记（成员实例本地）
```
collab_shared_assets:                   -- 成员实例（影子行的登记簿）
  id            TEXT PRIMARY KEY
  origin_device_id  TEXT NOT NULL
  origin_asset_id   TEXT NOT NULL
  local_asset_id    TEXT NOT NULL       -- → assets.id（影子行）
  granted_at    DATETIME
  status        TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'revoked'
  UNIQUE(origin_device_id, origin_asset_id)
```

### 3.4 迁移 4：文件传输断点记录（成员实例本地）
```
collab_transfer:
  id            TEXT PRIMARY KEY
  file_key      TEXT NOT NULL           -- originDeviceId:originAssetId
  received_bytes INTEGER NOT NULL DEFAULT 0
  total_bytes   INTEGER
  file_hash     TEXT
  status        TEXT NOT NULL DEFAULT 'in_progress'  -- 'in_progress'|'done'|'failed'
  updated_at    DATETIME
  UNIQUE(file_key)
```

## 四、共享流程（源实例操作）

### 4.1 发起共享
- 资产中心 → 选中资产 → 「共享」→ 目标选择（成员多选 / 整个团队）；
- 源实例为每个目标写 asset_shares 行（target_type='member'/'team'）；
- 若目标是团队：只写一条 team 授权，**不展开到每个成员**（成员拉取时按"是否在目标团队"判定）；
- 推送：对每个目标成员（团队则对团队成员，经 02 成员列表）发 `collab:share-grant`
  （内容见 §7 契约表）。**成员离线** → 进 outbox 补发（01）。
- 元数据载荷（AssetMeta）：
  `{ originDeviceId, originAssetId, category, subCategory, name, description, tags, kind, mimeType, sizeBytes, metadata, groupId?, groupRole?, groupName? }`
  —— 复制自源资产记录；**不包含** storagePath/textContent/jsonContent（内容留空，按需拉取）。

### 4.2 成员接收
- 收 `collab:share-grant` → 幂等（同 origin 键已存在则覆盖元数据）→ 插/更 collab_shared_assets +
  影子 assets 行：
  - 影子行字段：category/subCategory/name/description/tags/kind/mimeType/sizeBytes/metadata/
    groupId/groupRole 照抄；`storagePath/textContent/jsonContent/url` 留空；
    `origin_device_id/origin_asset_id` 填来源；user_id = 本机当前用户（scoped 自动）。
  - **组资产**：组信息（groupId）也需影子化——V1 简化：组卡片由源端聚合展示，成员端
    单资产引用可用，组画廊 V1 不完整支持（06 风险）。
- 收重复 grant → 更新元数据（改名/标签同步，见 4.3）。

### 4.3 元数据变更同步
- 源资产改名/改标签/改描述 → 源实例推送 `collab:share-grant`（同载荷，status 仍 active）
  → 成员更新影子行元数据；
- 成员**不可编辑**影子资产（只读；前端隐藏编辑入口，删除也禁——只能等源端撤回）。

### 4.4 撤回
- 源实例删/改 asset_shares.status='revoked' → 对相关成员推 `collab:share-revoke`；
- 成员收 → 删影子行 + collab_shared_assets 标 revoked + 清本地内容缓存
  （临时目录文件 + collab_transfer 行）；
- **即时生效**：即使成员未收到 revoke（离线），其下次拉取内容时源实例校验 grant 已撤 → 拒绝
  → 前端展示"共享已撤回"。

## 五、按需拉取（成员读取影子资产）

### 5.1 统一拦截点：AssetService
- 现有读取路径：
  - 预览：`assetPreviewUrl(record)` → PathProvider URL；
  - 本地路径：`resolveAssetPath(record)`；
  - 文本/JSON：前端直接读 record.textContent/jsonContent。
- **改动**：AssetService 增加 `ensureContentAvailable(record)` —— 若
  `record.originDeviceId` 非空且影子行 status='active'：
  - kind=text/json：RPC `asset.fetchContent` 返回内容 → **缓存到临时目录文件** +
    影子行 textContent/jsonContent 字段回填（二次读取直接命中，免重复 RPC）；
  - kind=file：RPC 分块拉到临时目录（01 §6 分片协议）→ 返回本地路径；
  - kind=url：url 字段在元数据里已同步（远程链接本身可访问），直接返回 url；
- 影子行字段回填策略：缓存**不写回 assets 表的 textContent**（保持"影子行不落内容"的
  语义）——缓存放 `dataPath/collab-cache/<originDeviceId>/<originAssetId>` 文件 + 内存 Map。
  text/json 的"回填"指内存态；重启后重新拉取（缓存文件可复用，见 5.3）。
- **失效**：收到 revoke / 源实例拒绝 → 清缓存 → 前端该资产置"已撤回"不可读。

### 5.2 拉取协议（rpc）
```
asset.fetchContent { originAssetId, kind }
  → text/json:  { ok, data: { content } }        // 大文本（>1MB）走 file 分片路径
  → file:       { ok, data: { total, hash, chunk0 } } + 后续二进制帧（01 §6）
  → 权限校验失败: { ok: false, error: '共享已撤回' }
```
- 源实例每次响应前校验：`originAssetId` 存在 && 存在 active 的 asset_shares 命中
  `(target_type='member' AND target_id=请求方deviceId) OR (target_type='team' AND 请求方∈团队)`
  —— **权限判断总在源实例**，成员端无授权数据。

### 5.3 缓存与断点
- 缓存位置：`dataPath/collab-cache/<originDeviceId>/<originAssetId>`；
- 命中策略：文件存在 + 大小/哈希匹配 metadata → 直接用（不发 RPC）；
- 断点：collab_transfer 记录已收字节，中断后 `fetchContent{offset: receivedBytes}` 续传；
- 清理：LRU（按 lastAccess 淘汰，上限如 2GB）+ revoke 即时清 + 设置页「清理协作缓存」。

## 六、引用层接入（零改动验证）

| 消费点 | 现状 | 共享资产行为 |
|---|---|---|
| AI 对话 @ 资产 | 选择器列本地资产（assetId） | 影子行 = 本地行 → 自动出现；选中后
  ensureContentAvailable 拉内容注入上下文；来源溯源组件显示"来自 成员X"（复用 sourceType 扩展） |
| 工作流 read-asset | 配置存 assetId，运行读 AssetService | 同上，运行时按需拉取（**发起者必须是源
  实例在线的成员**；若源离线 → 节点失败"远程资产不可达"，可用 fail 边降级） |
| start 输入 source='assets:template' | 资产选择器 | 同上 |
| 资产中心「共享给我」 | 无此分组 | 新增分组：查 origin_device_id 非空 → 卡片标
  「来自 成员X」+ 远程图标；只读（禁编辑/删除） |

### 6.1 离线降级矩阵（read-asset 节点）
| 场景 | 行为 |
|---|---|
| 源实例在线 + grant 有效 | 正常拉取 |
| 源实例在线 + grant 已撤 | 拉取被拒 → 节点 failed（可走 fail 边） |
| 源实例离线 | RPC 超时 → 节点 failed「远程资产不可达」 |
| 本地已有缓存文件 | 即使源离线也可读（缓存命中）——设计有意保留（内容已授权过） |

## 七、跨部分契约（与 00 §5 对齐）

| 消息 | 载荷 | 方向 |
|---|---|---|
| `collab:share-grant` | grantId, originDeviceId, originAssetId, AssetMeta, status | 源→成员 |
| `collab:share-revoke` | grantId, originDeviceId, originAssetId | 源→成员 |
| `asset.fetchContent` RPC | originAssetId, kind, offset? | 成员→源 |
| `asset.fetchMeta` RPC | originAssetId | 成员→源（列表页按需拉取元数据增量，可选） |

## 八、安全与边界

- 授权校验在源实例（防成员端篡改/越权）；
- 影子行只读（成员无法改/删，防污染源数据）；
- 撤回即时生效 + 缓存清理；内容缓存限容 LRU；
- 团队共享的判定用**当前成员资格**（成员被移出团队 → 立即不可拉取，即使收过 grant）；
- 敏感资产共享需用户明确操作（共享弹窗确认列表 + 可撤回）；
- 不共享系统/内置资产（is_builtin 已全局可见，无需共享；隐藏共享入口）。

## 九、测试计划（TDD）

| 用例 |
|---|
| 迁移：assets 加列幂等；origin 唯一索引（重复 grant 覆盖不炸） |
| 共享授权：member/team 目标；撤回状态流转；重复共享幂等 |
| 影子行：grant 到达建行（内容字段为空）；重复 grant 覆盖元数据；revoke 删行+清缓存 |
| 拉取：text/json 直传；file 分块+断点续传（模拟中断）；缓存命中免 RPC；hash 校验失败重传 |
| 权限：非授权成员拉取被拒；团队成员被移出后拉取被拒；撤回后拉取被拒 |
| 引用层：read-asset 读影子资产（含源离线 fail 路径）；对话 @ 影子资产 |
| 清理：revoke 清缓存；LRU 淘汰；设置页清缓存 |
