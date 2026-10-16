# Phase 3 Web 端支持 设计文档

## 背景

Phase 1 把 Repository 全部切到 TypeORM，Phase 2 把 Service 移到 `src/core/services` 并通过 4 个全局访问器（`ICoreDatabaseManager` / `ISecureStorage` / `IPathProvider` / `IEventEmitter`）解除 Electron 平台耦合。

Phase 3 目标：在不重写 PC 端 renderer、不重写 core 后端的前提下，把同一份代码部署成 Web 服务。Web 端需要支持多用户，数据需要按用户隔离。

## 一、整体架构

```
┌────────────────────────────────────────────────────────────────────┐
│  Vue3 Renderer (src/renderer/) —— 单一代码库，双端打包            │
│  调用 window.electronAPI.<namespace>.<method>(...)                 │
└──────────────────────┬──────────────────────────┬──────────────────┘
              ┌───────▼─────────┐         ┌──────▼──────────────┐
              │ src/preload/    │         │ src/web/client/     │
              │ Electron 桥接   │         │ Web 浏览器桥接      │
              │ (ipcRenderer)   │         │ (fetch + WebSocket) │
              └───────┬─────────┘         └──────┬──────────────┘
                      │                          │
                  IPC channel               HTTP /api/ipc/*
                                            WebSocket /events
                      │                          │
              ┌───────▼─────────┐         ┌──────▼──────────────┐
              │ src/electron/   │         │ src/web/server/     │
              │ Electron Main   │         │ Express HTTP server │
              │ ipcMain.handle  │         │ POST /api/ipc/*     │
              │                 │         │ ws://.../events     │
              │                 │         │ JWT cookie 鉴权     │
              └───────┬─────────┘         └──────┬──────────────┘
                      │                          │
                      └────────────┬─────────────┘
                                   ▼
              ┌─────────────────────────────────────────┐
              │ src/core/                               │
              │ - services/ (业务逻辑，与平台无关)       │
              │ - database/ (TypeORM Repository)        │
              │ - interfaces/ (4 个全局访问器接口)       │
              └────────────┬────────────────────────────┘
                           │
              ┌────────────▼─────────────┐
              │ SQLite (Electron)        │
              │ PostgreSQL (Web)         │
              └──────────────────────────┘
```

## 二、关键设计决策

### 2.1 API 契约保持一致：IPC channel ↔ HTTP route 1:1 映射

> **不变量**：`window.electronAPI.<ns>.<method>(...)` 这一调用约定在两端完全一致。

- IPC：`ipcRenderer.invoke('settings:get', key)`
- HTTP：`POST /api/ipc/settings:get`，body 是 `[key]`（参数数组），返回 `{ ok: true, data }` 或 `{ ok: false, error }`
- WebSocket：`chat:stream` 等流式事件按 channel 名直推，客户端按 channel 名订阅

→ 渲染层一行代码不改，只换桥接层；**整个 src/renderer/ 一个字都不动**。

### 2.2 共享 preload 契约：声明 `window.electronAPI` 的类型在 shared 中

新增 `src/shared/electron-api.d.ts`（或就用现有的 `ipc.types.ts` 扩展），renderer 用这个类型，preload 与 web/client 都按此类型实现。

### 2.3 用户系统与数据隔离

- 新增 `users` 表（id / email / passwordHash / createdAt / lastLoginAt）
- 关键业务表加 `user_id` 列：`lw_projects` / `dialogs` / `images` / `voice_records` / `kb_documents` / `diary_entries` / `portrait_projects` / `video_projects` / `provider_configs` / `oss_configs` / `search_engine_configs` / `settings`
- **多租户隔离方式**：使用 Node.js `AsyncLocalStorage` 存当前请求的 `userId`，BaseRepository 在执行查询前自动注入 `where userId = :uid`。
- **Electron 端**：单用户固定 `userId = 'local-default-user'`（在 DataPathService 初始化时注入），现有数据通过启动迁移补齐 user_id 列。
- **Web 端**：每个 HTTP / WS 请求经过 auth 中间件→设置 ALS 上下文→后续所有 repository 调用自动按 userId 过滤。

### 2.4 鉴权方案

- Web：JWT in HttpOnly cookie；登录接口 `POST /api/auth/login` 返回 set-cookie；其余接口 middleware 校验。
- 游客模式：登录页 + 注册页（仅 Web）。
- Electron：跳过鉴权，固定 userId。

### 2.5 文件资源

- Electron：保持现有 `local-image://` 等 protocol handler。
- Web：`GET /assets/<relative-path>` 路由，先检查文件路径是否在该用户文件目录下，校验通过返回文件流。
- Renderer URL 形式：仍是 `local-image://images/2026/03/x.png`。Electron 走 protocol handler；Web 浏览器对该 scheme 的请求由桥接层在 fetch 拦截或直接重写为 `/assets/...`（用 service worker 或 vite 构建期替换）。

### 2.6 用户文件目录隔离

- Web 端：`<dataPath>/users/<userId>/images/2026/...`
- 由 `WebPathProvider` 实现：`getDataPath()` 返回包含 userId 的路径，从 ALS 中读 userId。
- Electron 端：路径不变（`<dataPath>/images/...`）。
- 数据库存的相对路径仍是 `images/2026/...`（不含 userId 前缀），运行时由 `getDataPath()` 拼接。

### 2.7 实时事件（流式）

- Electron：`getEventEmitter()` 用 `ElectronBroadcastEventEmitter` 向所有 BrowserWindow 推送。
- Web：`getEventEmitter()` 用 `WebSocketEventEmitter`，按当前 ALS userId 仅推送给该用户的连接。
- 客户端：Web 桥接层维护一个 WebSocket 长连接，自动重连；订阅特定 channel 时把 callback 加入本地 listener map。

### 2.8 编译产物拆分

```
out/
├── electron/         npm run build:electron  → main + preload + renderer-electron
├── web-server/       npm run build:web       → Node 服务端 bundle
└── renderer-web/     同上 → 浏览器静态资源（被 web-server 托管）
```

renderer 源码同一份（`src/renderer/`）；用 vite 配置切换：
- electron 模式：注入空的 web-bridge，preload 提供 `window.electronAPI`
- web 模式：在 main.ts 入口加载 `src/web/client/bridge.ts`，挂载 `window.electronAPI`

## 三、目录结构

```
src/
├── core/                 # 复用，不动
├── shared/               # 复用，不动；可能新增 ipc-contract.ts
├── electron/             # 不动
├── preload/              # 不动
├── renderer/             # 不动（源码层面）
└── web/                  # ★ 新增
    ├── server/
    │   ├── index.ts            # 启动入口
    │   ├── app.ts              # Express 实例
    │   ├── auth/
    │   │   ├── jwt.ts
    │   │   ├── middleware.ts
    │   │   └── routes.ts
    │   ├── api/
    │   │   ├── ipc-bridge.ts   # 把所有 ipcMain channel 路由化
    │   │   └── assets.ts       # /assets/* 文件
    │   ├── ws/
    │   │   └── event-bus.ts    # WebSocket 服务
    │   ├── platform/
    │   │   ├── web-path-provider.ts
    │   │   ├── web-event-emitter.ts
    │   │   └── web-secure-storage.ts
    │   └── context/
    │       └── user-context.ts # AsyncLocalStorage
    └── client/
        ├── bridge.ts           # window.electronAPI 在浏览器的实现
        ├── http-rpc.ts         # invoke('channel', ...args)
        ├── ws-client.ts        # 长连接 + 重连
        └── asset-resolver.ts   # local-image:// → /assets/... 拦截
```

## 四、迁移与兼容策略

### 4.1 IPC 处理器复用

Electron 现有的 IPC handler 把请求转给 core/service。把这些"分发逻辑"抽到 `src/web/server/api/ipc-bridge.ts` 中以一个 `Map<channel, handler>` 形式注册。Electron 端继续用 `ipcMain.handle(channel, handler)`，Web 端继续用 `app.post('/api/ipc/' + channel, handler)`。

也就是说：每个 IPC channel 在共享层注册一次，两端各自胶水化。

### 4.2 多租户迁移

启动时执行 `migrateAddUserIdColumn`：把所有未带 user_id 的行赋予默认 userId（Electron）或拒绝启动（Web）。

### 4.3 维护性

- 增加新业务时：仅需在 `src/core/services/` 加方法 + 在 `src/electron/ipc/handlers/` 注册 IPC handler，Web 端**自动**通过 ipc-bridge 映射对外，不需要双写。
- 共享类型：`src/shared/` 中的类型供 renderer / electron / web 三端使用。

## 五、本次实施分批

按依赖顺序：

1. **批次 1**：用户系统 + 多租户基础（users 表、AsyncLocalStorage、固定 userId 注入 Electron）
2. **批次 2**：抽 IPC handler 注册到共享层
3. **批次 3**：web-server 骨架（Express、JWT auth、ipc-bridge HTTP 路由）
4. **批次 4**：WebSocket 事件总线 + 资源 HTTP 路由
5. **批次 5**：浏览器侧 bridge.ts + asset-resolver
6. **批次 6**：renderer 双端打包配置
7. **批次 7**：登录 / 注册 UI（仅 Web 模式可见）
8. **批次 8**：端到端验收（启动 web-server、浏览器登录、对话/生成图）

每批次完成后 commit + tag，全套 574 测试稳定通过为基线。

## 六、范围外

- 多用户并发的 LanceDB 隔离（暂时整库共享，加 userId filter 列）
- 高并发性能调优
- HTTPS / 反向代理 / 部署文档（应用层做无状态即可）
- 注册流程（邀请码、邮箱验证）—— 先做基础登录注册可用即可
