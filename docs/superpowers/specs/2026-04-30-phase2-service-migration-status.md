# Phase 2 服务迁移进展（2026-04-30）

## 目标

> 将 src/electron/services 目录下的所有 service 迁移到 src/core/services 目录下，
> 通过抽象接口解除 Electron 平台耦合，为 Phase 3（Web 端支持）铺路。

## 当前状态：约 60% 完成

### 已迁移（13 个服务）

| 批次 | 服务 | electron 依赖 | 处理方式 |
|---|---|---|---|
| 1 | longwriting | 0 | 直接迁移 |
| 1 | lw-entity-detection | 0 | 直接迁移 |
| 1 | uploaded-entity | 0 | 直接迁移 |
| 1 | episode-auto-binding | 0 | 直接迁移 |
| 1 | temporary-entity-template | 0 | 直接迁移 |
| 2 | oss | electron-log + DatabaseManager | log → console；db → ICoreDatabaseManager |
| 2 | search-engine | SecureStorage | 用 ISecureStorage 访问器 |
| 2 | provider-template | SecureStorage | 用 ISecureStorage 访问器 |
| 3 | cache | app.getPath | 用 IPathProvider |
| 3 | diary | app.getPath | 用 IPathProvider |
| 3 | material-processor | (未实际用) | 删除无用 import |
| 4 | task-queue | BrowserWindow.webContents.send | 用 IEventEmitter 广播 |

### 同时完成的去重（4 个）

将 electron/services 与 core/services 完全相同的 file/history/lance-db/web-search 服务合并，
删除 electron 副本，所有引用方改为 `@core/services/`。

### 新增的平台抽象层

| 接口 | 文件 | Electron 实现 |
|---|---|---|
| `ICoreDatabaseManager` | core/database/database-manager.interface.ts | DatabaseManager 实现 |
| `ISecureStorage` 全局访问器 | core/interfaces/storage.interface.ts | SecureStorageService 注册 |
| `IPathProvider` 全局访问器 | core/interfaces/path.interface.ts | ElectronPathProvider 注册 |
| `IEventEmitter` 全局访问器 | core/interfaces/event.interface.ts | ElectronBroadcastEventEmitter 注册 |

注册时机：electron/index.ts 在 `dbManager.initialize()` 之前调用 `xxx.getInstance()`，
确保 core/services 中代码能立即拿到访问器。

### 仍留在 electron/services（17 个）

#### 必须留下的（4 个，强 Electron 平台特性）
- `electron-event-emitter.ts` —— 平台实现
- `electron-path.provider.ts` —— 平台实现
- `data-path.service.ts` —— `dialog.showOpenDialog` 平台对话框
- `secure-storage.service.ts` —— `safeStorage` 平台密钥 API

#### 短期内需要留下的（4 个，强 Electron 集成）
- `auto-save.service.ts` —— 监听 BrowserWindow `close`/`minimize` 等事件
- `error.service.ts` —— `dialog.showErrorBox`、`app.relaunch`
- `shortcut.service.ts` —— `globalShortcut` 注册全局快捷键
- `lw-migration.service.ts` —— 强依赖 better-sqlite3 backup API（SQLite-only）

#### 待迁移（流式 AI 服务，9 个）
这些服务都在方法中接收 `window: BrowserWindow` 参数，用于 webContents.send 推送
流式响应（聊天 token、合成进度、生成图片等）。迁移方案：
1. 改为接收 `emitter: IEventEmitter`（侵入式：影响所有 IPC handler）；或
2. 改为调用 `getEventEmitter().emit(...)` 广播（简单，已落地于 task-queue.service）。

待迁移列表：
- `chat.service.ts` — AI 聊天流式
- `voice.service.ts` — TTS / STT 流式
- `image.service.ts` — 文生图/图生图回调
- `translation.service.ts` — 流式翻译
- `portrait.service.ts` — 肖像生成
- `video.service.ts` — 视频任务
- `video-synthesis.service.ts` — 视频合成
- `longwriting-ai.service.ts` — 长文 AI 章节生成
- `story-to-video-ai.service.ts` — 故事转视频 AI
- `story-to-video-resource.service.ts` — 故事转视频素材
- `knowledge-base.service.ts` — 知识库摄入流式

#### 还有一个特殊文件
- `diary-export.service.ts` —— 用 `dialog.showSaveDialog`，但导出逻辑本身可拆分

## 测试

每个批次提交后 `tests/unit/repositories` 全部通过：30 套件 / 574 用例。

## Tag

- `phase2/batch-1`：5 个 0-依赖服务
- `phase2/batch-2`：3 个低依赖服务（含 SecureStorage 访问器）
- `phase2/batch-3`：3 个服务（含 PathProvider 访问器）
- `phase2/dedup-duplicates`：去重 4 个文件（commit `fea89be`）
- `phase2/event-emitter-abstraction`：IEventEmitter 全局访问器（commit `9fd0550`）

## 下一步

Phase 2 剩余的流式 AI 服务迁移属于"批次 4"，工作量集中在：
1. 修改各服务方法签名，将 `BrowserWindow` 参数 → `IEventEmitter` 或移除（用全局访问器）
2. 更新所有 IPC handler 调用方传参
3. 渲染端事件 channel 不变，行为应一致

Phase 3（Web 端支持）需要在 Phase 2 完成后再开始：
- 增加 `web-server` 的 `WebPathProvider`、`WebEventEmitter`（WebSocket）实现
- 增加用户认证、多租户数据隔离
- 共享 core/services + core/database/repositories
