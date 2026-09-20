# Web 端兼容性调查 findings（2026-09-16）

> 调查方式：4 个并行只读探索 agent，覆盖 web server、web client、renderer 平台耦合、core/agents 可移植性。
> 结论：**Web 端双端架构已建成且曾可用（2026-05-02 有 55 个 e2e 通过记录），当前不可用是回归 + 边缘缺口，不是从零开发。**
> 后续：逐模块兼容性/用户隔离审计见 `2026-09-16-web-module-isolation-audit.md`；基础设施多用户并发审计见 `2026-09-16-web-infra-concurrency-audit.md`。

## 1. 现状架构（已建成部分）

### 1.1 前端：零重写，同一套源码
- `vite.config.web.ts` 的 root 就是 `src/renderer`，入口由插件替换 `main.ts` → `src/renderer/src/main-web.ts`，页面覆盖率天然 100%。
- `src/web/client/` 仅 5 个桥接文件：
  - `bridge.ts` — Proxy 伪造 `window.electronAPI`，方法调用 → HTTP `/api/ipc/:channel`，`onXxx` → WS 订阅
  - `channel-map.ts`（907 行，778 条 channel 映射，人工与 preload 同步）
  - `http-rpc.ts`、`ws-client.ts`（自动重连）、`login-page.ts`（纯 DOM 登录门）
- `src/web/admin-vben` 是废弃的 vben 试验残骸（2GB node_modules，代码零引用，git 仅误入库 `.eslintcache`），建议删除。

### 1.2 IPC 即 HTTP：channel 覆盖率 ≈100%
- 服务端 `src/web/server/api/register-channels.ts:32-65` 与 Electron `initIpcHandlers()`（`src/electron/index.ts:387-411`）调用完全相同的 18 组注册函数（129 条壳层 channel）+ 12 个业务包（674 条 channel），合计约 803 条两端同构注册。
- handler 代码两端同一份：`src/core/ipc/bridge-adapter.ts` 注册时同时写跨平台注册表 + `ipcMain`。
- 平台抽象四件套双实现：`src/electron/platform/` ↔ `src/web/server/platform/`（Path/EventEmitter/Logger/SecureStorage），是项目里设计最干净的双端抽象。

### 1.3 服务端（Express，`src/web/server/`，14 个文件）
- 入口 `index.ts`（643 行）：平台抽象注册 → 单 PG DataSource + `synchronize()` + ~70 个幂等迁移 → 向量库（`VECTOR_STORE=pgvector` 否则 LanceDB 兜底）→ 注册全部 channel → 挂载路由 → WS → 声音复刻调度器/业务包/工作流子系统。
- 路由：`/api/auth/*`（JWT cookie + bcryptjs）、`/api/ipc/:channel`（泛化 IPC 桥）、`/api/assets/*`（按 userId 隔离 + 防越权）、`/api/upload/*`（multer 50MB）、`/api/agents/*`、`/api/workflow/*`（含免登录 share/webhook）、`/events`（WS，cookie JWT 鉴权）。
- 多租户：`runWithUserAsync` ALS 注入 userId → `BaseRepository` 行级隔离；文件资产 `DATA_ROOT/users/<userId>/` 隔离。
- 数据库：Web 端**强制 PostgreSQL**（`pg`）；`DATA_ROOT` 默认 `./data`（`data-web/` 是 2026-05-08 staging 残留）；密钥为服务端单主密钥（`SECURE_STORAGE_KEY` env 或 `<DATA_ROOT>/secure-key` 文件）。

## 2. 唯一确认的硬阻断（P0）

**PostgreSQL 方言不兼容，web server 实测无法启动：**
- `src/core/database/data-source.ts:39-41` 把全部 entity 无差别注册进 DataSource，**42 个 entity 文件、92 处 `type: 'datetime'`** 在 PG 下不支持，metadata 校验即抛 `DataTypeNotSupportedError`（首例：`src/core/database/entities/platform-event.entities.ts:68`）。
- 涉及：platform-event、workflow 三表、agent-* 全系、app-*、dl-* 全系、asset、kb-folder、info-source、email-account、variable 等。
- 历史上有过 PG 兼容修复（commit 7da34d8d），但后续新 entity 又引入 `datetime` —— 需同时加防回归检查（lint 或 CI PG 启动冒烟）。
- 次要前提：无 PG（`.env.local` 指向 127.0.0.1:5434）时直接 ECONNREFUSED 退出；`out/renderer-web` 未构建时静态目录回退到 `out/renderer`（Electron 产物，前端是坏的），dev 必须走 `web:client:dev`（vite 5174 代理到 4201）。
- import 链无断裂（启动走到了 `DataSource.initialize()` 才挂）；DB 初始化之后的 packs/workflow 动态加载段从未被运行验证过。

## 3. 工作清单

### P0 — 恢复可启动
1. 92 处 `datetime` → 双方言兼容类型（如 `timestamp`），加防回归检查。
2. 实测 DB 初始化之后的启动链路（packs/workflow 动态加载段）。
3. 跑 `tests/e2e/web/` 21 个 spec（62 用例）摸底——近 4 个月无留档结果。

### P1 — 明确的 bug 与耦合点（小工程量）
4. `src/core/packs/asset-center/handlers/asset.handler.ts:142,178,191` — dialog/shell **无 isElectron 守卫**，Web 端调用即炸。
5. `src/core/packs/longwriting/services/lw-migration.service.ts:7` — core 层唯一直接 `import '@electron/database/index'`，改走 `getCoreDatabaseManager()`。
6. `src/renderer/src/components/common/ErrorToast.vue:80` — 通用 `invoke('error:retry')` 不在 channel-map，Web 端错误重试失效。
7. 删除 `src/web/admin-vben`（2GB 废弃残留）。

### P2 — Web 端功能降级补交互（中工程量）
8. 文件选择类（有守卫不炸但功能缺失）：`voice.selectFile`（`voice.handler.ts:30`）、`image.selectFile`（`useImage.ts:695`）、`knowledgeBase.selectFiles`（`stores/knowledge-base.ts:520`）—— 需补浏览器 `<input type=file>` + 走已有 `/api/upload` 的替代交互。
9. 另存为/导出：日记 PDF 导出依赖 `BrowserWindow.printToPDF`（`diary-export.service.ts:6,82`），Web 端需服务端渲染替代；`file.saveFile` 类已有 `file-saver.ts` 的 `a[download]` 兜底但未全覆盖。
10. 桌面语义功能在 Web 端隐藏/降级：Settings 的 dataPath 整组（`Settings.vue:1695-1787`）、Obsidian 导出（`ExportToObsidianDialog.vue` 5 个调用点）、打开本地文件夹、全局快捷键直推（`shortcut:triggered`/`autosave:status`/`error:show` 无 Web 通道）。
11. `local-image://` 协议转换：`WebPathProvider.toAssetUrl()`（`web-path.provider.ts:91-115`）对绝对路径形式无法转换，会加载失败。

### P3 — 治理与规模化（长期）
12. channel-map 人工同步漂移风险：接入生成器脚本 + CI 校验。
13. 契约治理：113 个 renderer 文件直调 `window.electronAPI`（665 处），返回类型大量隐式 any，`IPC_CHANNELS` 常量仅覆盖 ~40%。
14. 迁移双写负担：Electron/Web 两处迁移函数手工保持同构（多处"必须同步"注释警告）；better-sqlite3 raw DDL 与 TypeORM entity 双 schema 源。
15. 安全加固：无角色鉴权（users.role 存在但 `requireAuth` 只查登录）、无注册审批/邀请制、无 API 限流、`/api/agents` 无 Bearer token（`src/agents/api/router.ts:8`）。
16. 规模化缺口：长任务/agent 调度为单实例 in-process 内存队列，横向扩展需外部队列；多租户密钥为服务端单主密钥集中托管，非按用户加密。

## 4. 其他事实记录
- Preload 规模：`src/preload/index.ts` 3217 行，`window.electronAPI` 单对象，约 780+ invoke + 33 个事件订阅，episodeProduction(~180+) 和 longwriting(~150) 最大头。
- renderer 无任何 Node/electron import，耦合全部收敛到 `window.electronAPI`，非常干净。
- 路由：壳路由 + 12 个业务包 58 条路由条目（~46 页面）；pinia store 约 21 个。
- 重资源模块（lancedb/ffmpeg/sharp/nodejieba）全部参数化初始化、无 electron 依赖，Web server 可直接用。
- LLM 调用链（ai SDK，~20 个文件）全在 `src/core`，平台无关。
- `tesseract.js`、`canvas`、`electron-log`、`electron-store` 在 package.json 但 src 下零引用（残留）。
- 环境判断约定：`window.__APP_PLATFORM__` + `isElectronRenderer()`，但该函数在 3~4 处重复定义（`asset-url.ts:24`、`file-saver.ts:24`、`main-image-upload.ts:23`、`panorama-upload.ts:23`）。
