# Electron 28 → 44 + Node LTS 升级影响评估

> 评估日期：2026-09-08 · 分支：feat/agent-harness · 结论先行：**可升，工作量集中在 4 个代码点 + 4 个原生模块重编，预估 2–3 人日（含回归）**。

---

## 1. 目标版本（2026-09 联网核实）

| 项 | 当前 | 目标 | 说明 |
|---|---|---|---|
| Electron | 28.3.3（声明 ^28.2.3） | **44.2.0**（2026-09-03 发布） | 最新稳定；官方仅维护 42/43/44 三分支，28 早已 EOL；跨 16 个 major |
| Electron 内置 Node | 18.18 | **24.20.0** | 随 Electron 走，不可单独升级；Chromium 120 → 152 |
| 开发机 Node（nvm default） | v24.12.0 | **Node 24**（Active LTS，EOL 2028-04） | **已在 LTS 线上**，只差 patch 与固化（.nvmrc/engines 均缺失） |
| Docker staging 基础镜像 | node:20-bookworm-slim | **node:24-bookworm-slim** | ⚠️ Node 20 已于 2026-04-30 EOL，这是本次最急迫的一项 |
| 备注 | — | Node 26 于 2026-10 转 LTS | 下个月起"最新 LTS"变成 26，届时再评估一轮即可 |

结论："Node 升到最新 LTS" 对本项目 = ①开发机补 patch + 固化版本声明；②Docker 镜像 20→24；③Electron 内置 Node 由升级 Electron 带动（18→24）。

## 2. 直接命中必须改的代码点（全部有 file:line 证据）

### 2.1 protocol.registerFileProtocol ×3 —— Electron 35 移除【最高风险】
- `src/electron/index.ts:126` 特权注册 local-image / local-file / local-video（standard+secure+supportFetchAPI+CORS）
- `src/electron/index.ts:219`（local-image，本地图片）、`:237`（local-file，本地音频）、`:255`（local-video，本地视频）

**后果**：图片/音频/视频本地展示全断。
**迁移**：改 `protocol.handle(scheme, handler)` + `net.fetch(pathToFileURL(...))` 返回 Response。三处回调逻辑同构，可抽一个公共 handler 注册函数（符合架构统一原则）。特权 scheme 声明保持不变。

### 2.2 渲染层 File.path ×2 —— Electron 32 移除【静默失效型】
- `src/renderer/src/components/voice/VoiceCloneDialog.vue:385`：`(file as any).path`（语音克隆上传）
- `src/renderer/src/components/longwriting/comment/TopicStage.vue:300`：`pendingFile.value.path || pendingFile.value.name`（评论素材上传）

**后果**：拿不到本地路径，上传流程静默坏掉，页面不报错。
**迁移**：preload 加一个 `getPathForFile(file): string`（内部 `webUtils.getPathForFile`），两个调用点改走 `window.electronAPI`；同时保留 Web 端分支（这两处本来就有双端注释）。`webUtils` 当前未使用，需在 `src/preload/index.ts`（2974 行单文件，仅此一个 expose 点）新增。

### 2.3 scripts 里 node:sqlite ×5 —— 需要 Node 22+（Electron 35+ 才内置）
`scripts/e2e-binary-response.cjs`、`patch-app-models.cjs`、`e2e-workflow-ux.cjs`、`e2e-asset.cjs`、`e2e-capability-apps.cjs`
**现状已依赖 Node 22+**（跑在开发机 nvm Node 24 上所以没炸）。升级后 Electron 内置 Node 24.20，脚本就算在 Electron 下跑也满足。**无需改动，反而是改善**。

### 2.4 隐藏窗口 printToPDF 管线 —— 回归重点（API 未移除）
- `src/electron/platform/electron-document-renderer.ts:66-70`（隐藏窗口：nodeIntegration:false + contextIsolation:true）
- `src/electron/packs/diary/diary-export.service.ts:83-96`（`printToPDF` + data:URL loadFile 兜底）

printToPDF 各版本有行为微调（页边距/默认纸张），**必须回归**：日记 PDF 导出、长文导出。

## 3. 扫描过、确认无影响的部分（负面清单）

| 破坏性变更（版本） | 扫描结果 |
|---|---|
| BrowserView 移除（35） | 未使用 ✓ |
| remote 模块（历史移除） | 未使用 ✓ |
| crashed/render-process-crashed 事件（29） | 未使用 ✓ |
| WebSQL（31） | 未使用 ✓ |
| webContents 导航 API deprecated（32） | 渲染层 goBack 均为 Vue Router ✓ |
| systemPreferences 全家（29/33/36） | 未使用 ✓ |
| shell.moveItemToTrash（29） | 未使用；只用 showItemInFolder/openExternal/openPath ✓ |
| spellcheck API（30/33） | 未使用（渲染层 HTML 属性与 Electron 无关）✓ |
| 权限 handler 签名变化（33/36） | 未使用 ✓ |
| utilityProcess 行为（37） | 未使用；child_process.spawn 稳定 API ✓ |
| app.commandLine 小写化/不传子进程（36） | 项目无任何 appendSwitch ✓ |
| offscreen 渲染（39/42） | 未使用 ✓ |
| renderer clipboard 弃用（40）/主进程重构成 Promise（44） | 未使用 Electron clipboard ✓（若渲染层用 navigator.clipboard 是 Web 标准，不受影响） |
| frameless 圆角默认值（43） | 主窗口 `titleBarStyle: 'default'` 非 frameless ✓ |
| clearStorageData quotas（36/42）、session 代理/UA | 未使用；仅 1 处 `onHeadersReceived`（CSP 改写，稳定 API）✓ |
| Unity/ia32/linux-armv7l（44） | 打包目标 win/linux x64 不受影响 ✓ |

安全基线不变但需第一时间验证：主窗口 `sandbox:false` + `webSecurity:false`（`src/electron/index.ts:325-330`，注释"允许访问本地文件"）。这两个开关在 44 里仍合法，但 Chromium 120→152 对 file:// 和混合内容持续收紧，**升级后先验证静态资源 + local-* 协议加载**。全项目仅 3 个 BrowserWindow（主窗口 / PDF 隐藏窗 ×2），无 partition、无 offscreen。

## 4. 原生模块（双 ABI 问题的现状与对策）

项目本就运行"双 ABI"：Electron 包用 Electron ABI（postinstall `electron-builder install-app-deps`），Web/Docker 用 Node ABI（Dockerfile `--ignore-scripts` + 显式 rebuild，见 Dockerfile.staging:20-25 注释）。升级后依然如此，但**两条线都基于 Node 24，比现在（18 vs 24）更收敛**。

| 模块 | 当前 | 目标 | 风险与对策 |
|---|---|---|---|
| better-sqlite3 | 11.10.0 | **13.0.3**（要求 Node≥22） | 核心存储。v11 无 Electron 44 预编译，必重编；v13 官方支持 Node 24 + 新 ABI，API 兼容（v12 起要求 C++20）。**必升** |
| nodejieba | 3.5.8 | ⚠️ **3.5.8 就是最新版，已停更** | N-API（node-addon-api ^5）所以运行时 ABI 风险低于预期，但无新预编译产物、旧 cppjieba 头文件在 C++20/新 V8 头下能否编过**必须实测**。使用点仅 2 个文件（`core/platform/services/knowledge-base.service.ts`、`electron/index.ts`），**编不过则换 @node-rs/jieba 2.0.2**（napi-rs 预编译、活跃维护，改动面小） |
| canvas | 3.2.2 | 3.2.3 | 有 cairo/pango 源编兜底（Docker 已验证该路径），低风险 |
| sharp | 0.34.5 | 0.35.4（可选） | napi 预编译，低风险 |
| @lancedb/lancedb | 0.27.1 | 0.x 最新（验证） | Rust napi 预编译，Node 24/Electron 新 ABI 大概率兼容；升级后跑一次知识库向量检索即知 |

Node 18→24（Electron 内置）对主进程 Node 用法的影响：`node:crypto`×13、`node:fs`×4、`node:path`×4、`node:zlib`、`node:vm`×1（`workflow/nodes/code-nodes.ts`，用户代码沙箱——**vm 行为跨 6 个 Node 大版本有演进，工作流代码节点要专项回归**）。

## 5. 工具链

| 工具 | 当前 | 目标 | 结论 |
|---|---|---|---|
| electron-vite | 2.3.0 | **5.0.0** | peer 支持 vite ^5/**^6**/^7——**vite 5.4.21 可原地不动**，配置 API 基本稳定，低风险但需过一次构建门禁 |
| electron-builder | 24.13.3 | 26.15.3（可选） | 与 Electron 版本解耦，可缓一拍；26 的打包配置校验更严，升的时候单独验证 win/linux 打包 |
| playwright | 1.59.1 | 1.63.0（可选） | e2e 走 CDP（`tests/electron.setup.ts` spawn `electron-vite dev -- --remote-debugging-port=9222` + `connectOverCDP`），该方式跨版本稳健；`_electron` 仅 2 个早已失效的辅助脚本（写死过期 Windows cwd） |
| vite / vitest / vue-tsc | 5.4.21 等 | 不动 | electron-vite@5 接受 vite ^5，无涟漪 |

## 6. 环境行为变化提醒（不改代码但要知晓）

- **E42 起 `npm install` 不再下载 Electron 二进制**（首次 `npx electron`/dev 启动时下载）。影响新机器/CI 冷启动需联网；Docker staging 不受影响（`--ignore-scripts` 且从不 spawn electron）。
- **E38 起 Linux Wayland 原生检测默认开启**：开发机是 Deepin/X11 不触发；若在 Wayland 会话跑出现渲染异常，设 `--ozone-platform=x11`（但注意项目当前没用 appendSwitch，可临时用环境变量）。
- **E36 起 GNOME 走 GTK4**：DDE 不受影响。
- **E43 起 Linux dialog 无 defaultPath 时默认 Downloads**：项目对话框均显式传路径，影响小。
- **E44 起 macOS 最低 12、Linux 不再随包分发 libEGL/libGLESv2**：只影响 macOS 打包与特殊 Linux 部署。
- E42 macOS 通知走 UNNotification 需要签名：项目未用 Electron Notification ✓。

## 7. 建议迁移路径（分四步，每步可独立回滚）

**Step 0 固化 Node（无风险，可先行）**
仓库根加 `.nvmrc`（`24`）+ `package.json` 加 `engines.node: ">=24 <25"`；开发机 `nvm install 24` 拉最新 patch。基线门禁先跑一遍留档：`npm run typecheck`、`npm run test:unit:sqlite`、CDP e2e 冒烟。

**Step 1 Electron 28→44 + 代码修复（主体工作）**
1. `electron ^44.2.0`、`electron-vite ^5.0.0`，`npm install`（首次跑 dev 会现下载二进制）+ `npm run rebuild:electron`
2. protocol.handle 迁移 ×3（index.ts:219/237/255）
3. preload 加 `getPathForFile` 通道，改 VoiceCloneDialog.vue:385、TopicStage.vue:300
4. 验证门禁：typecheck → 单测 → esbuild parse 门禁 → CDP e2e → 手工冒烟：**本地图片/音频/视频渲染、语音克隆上传、评论素材上传、日记 PDF 导出、长文导出、托盘/全局快捷键、自动保存**
5. `node:vm` 代码节点专项：跑一个含代码节点的工作流

**Step 2 原生模块**
better-sqlite3 ^13 → rebuild:electron + rebuild:node 双向验证；nodejieba 先试编，失败即换 @node-rs/jieba（改 knowledge-base.service.ts + electron/index.ts 两个文件）；canvas/sharp/lancedb 顺手验证。

**Step 3 Docker / Web 侧**
`node:20-bookworm-slim` → `node:24-bookworm-slim`（保持 `--build-from-source` + bookworm 的 glibc 2.36 策略），重建镜像跑 web e2e。

**回滚**：独立分支操作，每步一个 commit；出问题按步回退 lockfile。

## 8. 遗留风险（本次评估无法静态判定，需实测）

1. nodejieba 在 C++20/新 V8 头下能否编译（第 4 节对策已备）
2. `webSecurity:false` 在 Chromium 152 下加载本地资源的实际表现
3. better-sqlite3 v13 与现有 DB 文件的兼容（建议先在 data/ 副本上开库验证）
4. Playwright CDP 对 Electron 44 的兼容（1.59→1.63 预留 bump 空间）
