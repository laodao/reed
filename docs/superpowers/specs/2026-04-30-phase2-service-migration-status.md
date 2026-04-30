# Phase 2 服务迁移进展（2026-04-30）

## 目标

> 将 src/electron/services 目录下的所有 service 迁移到 src/core/services 目录下，
> 通过抽象接口解除 Electron 平台耦合，为 Phase 3（Web 端支持）铺路。

## 状态：本次会话基本完成（剩余的均为强 Electron 平台特性）

### 已迁移到 core/services（25 个 + 3 个 platform abstraction 实现 + 4 个 dedup）

| 批次 | 服务 | 关键变更 |
|---|---|---|
| 1 | longwriting | DatabaseManager → ICoreDatabaseManager |
| 1 | lw-entity-detection | DatabaseManager → ICoreDatabaseManager |
| 1 | uploaded-entity | DatabaseManager → ICoreDatabaseManager |
| 1 | episode-auto-binding | DatabaseManager → ICoreDatabaseManager |
| 1 | temporary-entity-template | DatabaseManager → ICoreDatabaseManager |
| 2 | oss | log → console; db → ICoreDatabaseManager; SecureStorage 接口化 |
| 2 | search-engine | SecureStorage 接口化 |
| 2 | provider-template | SecureStorage 接口化 |
| 3 | cache | app.getPath → IPathProvider |
| 3 | diary | app.getPath → IPathProvider |
| 3 | material-processor | 删除无用 electron 导入 |
| 4 | task-queue | BrowserWindow → IEventEmitter |
| 4 | translation | window/dialog 拆出到 handler，事件用 IEventEmitter |
| 4 | voice | 同上 |
| 4 | image | 同上 + electron-log → console |
| 4 | portrait | 移除 6 个方法的 window 参数 + sendPortraitEvent → IEventEmitter |
| 4 | knowledge-base | 流式事件 + selectFiles 拆分到 handler |
| 4 | chat | sendStreamEvent → IEventEmitter |
| 4 | story-to-video-ai | 移除未使用的 BrowserWindow |
| 4 | story-to-video-resource | 8 个方法的 window 参数全部移除 |
| 4 | longwriting-ai | 25 个方法 + 8 个事件全部迁移；递归调用同步去 window |
| 4 | video / video-synthesis | 同上 + 整体 video-providers 文件夹也移到 core |
| dedup | file / history / lance-db / web-search | 删除 electron 副本（与 core 完全相同）|
| dedup | chunk-splitter (folder) | 同上 |

### 平台抽象层（4 个全局访问器 + 3 个 Electron 实现）

| 接口 | 全局访问器 | Electron 实现 |
|---|---|---|
| `ICoreDatabaseManager` | `getCoreDatabaseManager()` | DatabaseManager（自动注册） |
| `ISecureStorage` | `getSecureStorage()` | SecureStorageService（自动注册） |
| `IPathProvider` | `getPathProvider()` | ElectronPathProvider |
| `IEventEmitter` | `getEventEmitter()` | ElectronBroadcastEventEmitter |

注册时机：electron/index.ts 在 `dbManager.initialize()` 之前调用 `xxx.getInstance()`，
确保 core/services 中代码能立即拿到访问器。

### 仍留在 electron/services（9 个，均为强 Electron 平台特性）

| 文件 | 留下原因 |
|---|---|
| `electron-event-emitter.ts` | IEventEmitter 的平台实现 |
| `electron-path.provider.ts` | IPathProvider 的平台实现 |
| `data-path.service.ts` | `dialog.showOpenDialog` 选择数据根目录 |
| `secure-storage.service.ts` | Electron `safeStorage` 平台密钥 API |
| `auto-save.service.ts` | 监听 BrowserWindow `close`/`minimize` 等事件 |
| `error.service.ts` | `dialog.showErrorBox`、`app.relaunch` |
| `shortcut.service.ts` | `globalShortcut` 注册全局快捷键 |
| `diary-export.service.ts` | `dialog.showSaveDialog` 选择导出路径 |
| `lw-migration.service.ts` | 强依赖 better-sqlite3 backup API（SQLite-only） |

## IPC handler 改动模式

每个迁移服务对应的 IPC handler 都做了类似改动：
1. 把 `import { XService } from '../../services/xxx.service'`
   改为 `from '@core/services/xxx.service'`。
2. 移除调用前 `BrowserWindow.fromWebContents(event.sender)` 的死代码。
3. 把 `XService.method(window, ...)` 调用中的 `window` 参数去掉。
4. 涉及 `dialog.showXxxDialog` 的方法（selectFile、saveAs 等）拆回到 handler，
   service 仅保留纯业务（如 fs.copyFileSync、fs.statSync 等）。

## 测试

每个批次提交后 `tests/unit/repositories` 全部通过：30 套件 / 574 用例。
（流式 AI 服务没有专门的单测，靠类型检查 + 手动验证 + 现有 e2e 测试覆盖。）

## Tag

- `phase2/batch-1`：5 个 0-依赖服务
- `phase2/batch-2`：3 个低依赖服务（含 SecureStorage 访问器）
- `phase2/batch-3`：3 个服务（含 PathProvider 访问器）
- `phase2/dedup-duplicates`：去重 4 个文件
- `phase2/event-emitter-abstraction`：IEventEmitter 全局访问器
- `phase2/in-progress`：早期 status 文档
- `phase2/batch-4-streaming-services`：所有流式 AI 服务

## 下一步：Phase 3（Web 端支持）

Phase 2 收尾后可以正式开始 Phase 3：
1. 增加 `web-server` 的 `WebPathProvider`、`WebEventEmitter`（WebSocket 推送）实现
2. 增加用户认证、多租户数据隔离（lwProjects 等表加 userId 列，repo 层按 userId 过滤）
3. 共享 core/services + core/database/repositories
4. 渲染端事件订阅改为对应 channel 的 ipcRenderer.on / WebSocket subscribe，service 端
   不区分平台（已落地）

剩余的 9 个 electron/services 文件在 Phase 3 中保持原样即可：
- 平台特性（dialog/safeStorage/shortcut/auto-save/error）天然只对 Electron 客户端有意义
- lw-migration（SQLite backup）仅在 Electron 离线模式下使用
- ElectronPathProvider / ElectronBroadcastEventEmitter 是 IPathProvider / IEventEmitter
  的实现，Web 平台需要各自的实现替换
