# Web 端 E2E 测试体系搭建

**日期**: 2026-05-02
**作者**: Claude Code（无人值守模式）
**目标**: 为 Web 端 (vite 5174 + web-server 4201) 补齐 Playwright E2E 测试，覆盖所有功能模块。

## 背景

- 已有 `tests/e2e/` 仅覆盖 Electron 端（`app.spec.ts`、`image-generation.spec.ts`）
- 用户已配置 DeepSeek 与 阿里百炼 两个提供商，需端到端验证 Web 端功能
- 多用户多租户架构（Phase 3 已完成 scoped Repository 重构）：用户 alice@example.com 等已存在

## 落地清单

### 配置 / 基础设施
- `playwright.web.config.ts` —— 独立的 Web E2E 配置，连 5174，输出报告到 `playwright-report-web/`
- `tests/e2e/web/helpers/auth.ts` —— 公共 helper：
  - `loginViaApi(page)` / `loginViaUI(page)`
  - `logoutViaApi(page)`
  - `gotoApp(page, hash)`
  - `invokeIpc<T>` / `invokeIpcInner<R>` / `invokeIpcUnwrap<T>` —— 三层调用 web-server `/api/ipc/<channel>` 桥
  - `collectConsoleErrors(page)`

### 测试脚本（共 14 个 spec，53 个用例）
| 文件 | 用例数 | 覆盖 |
|------|--------|------|
| `01-auth.spec.ts` | 6 | 注册 / 登录 / 错误密码 / /me / 登出 |
| `02-home.spec.ts` | 13 | 首页欢迎卡片 + 11 项侧边栏导航 |
| `03-settings.spec.ts` | 7 | 6 个 tab + provider 列表 + IPC 桥 |
| `04-chat-deepseek.spec.ts` | 1 | 显式选 DeepSeek 模型，真实发消息验证回复 |
| `05-chat-bailian.spec.ts` | 1 | UI 切换到 bailian/qwen3.6-27b 真实发消息 |
| `06-translate.spec.ts` | 3 | 页面 + translation:providers + translation:history |
| `07-image.spec.ts` | 2 | 页面 + image:list |
| `08-portrait.spec.ts` | 2 | 页面 + portrait:list-projects |
| `09-longwriting.spec.ts` | 2 | 页面 + longwriting:getProjects |
| `10-story-to-video.spec.ts` | 2 | 页面 + stv:list-projects |
| `11-voice.spec.ts` | 3 | 页面 + voice:providers + voice:history |
| `12-knowledge-base.spec.ts` | 2 | 页面 + knowledge-base:list |
| `13-diary.spec.ts` | 3 | 页面 + diary:get-all-folders + diary:list-entries |
| `14-api-bridge.spec.ts` | 6 | 401/403、role / search-engine / api-key list、未知 channel |

### 运行入口
- `npm run test:e2e:web`
- `npm run test:e2e:web:ui`

### 文档
- `tests/e2e/web/README.md` —— 前置条件、运行命令、自定义环境、文件清单

## 已知发现 / 适配点

1. **IPC 桥外层 + 内层结构**
   - 外层：`{ ok, data, error }`
   - 内层：handler 自定义键，例：`provider-config:list` 用 `configs`、`provider-template:list` 用 `templates`、`role:list` 用 `roles`、其他多用 `data`
   - helper `invokeIpcUnwrap` 自动尝试 `data`/`items`/任意非空键，spec 多数情形可直接拿到目标数据

2. **chat 模型记忆**
   - 数据持久化到 PostgreSQL，跨测试 run 会保留上一次选中的模型
   - 04 (DeepSeek) 与 05 (bailian) 都显式打开 model picker 切换，避免依赖默认值

3. **chat 消息计数法**
   - 用 `.message-item` DOM count 增量判断，比 main innerText 长度增量更稳

## 测试结果

```
$ npm run test:e2e:web
Running 55 tests using 1 worker
... (略)
55 passed (60s)
```

全部通过。`.playwright-mcp/` 已加入 `.gitignore`，不污染仓库。

## 同批修复的问题

### 1. Web 端 CSP 阻止 eval（长文写作页 Firefox 报错）

**报错**：
```
Content-Security-Policy: The page's settings blocked a JavaScript eval (script-src)
... violates ... "script-src 'self'" (Missing 'unsafe-eval')
```

**根因**：
`src/renderer/index.html` 的 meta CSP 写死了 `script-src 'self'`，
长文写作页用到的 markdown / 模板渲染等依赖（bytemd / katex / mermaid 等）
会调用 `eval`/`Function`，Firefox 严格执行 meta CSP 时被拦。
Chromium 因实现细节不强制 meta CSP 的 eval 限制，所以之前没暴露。

**方案**：
`vite.config.web.ts` 的 `replaceEntryToWebMain` 插件扩展，
在 transformIndexHtml 阶段为 Web 端把 CSP 中
`script-src 'self'` 改为 `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'`，
并补 `connect-src 'self' ws: wss: http: https:;`（vite HMR + WebSocket /events）。
Electron 端不走该 vite 配置，原 CSP 保持严格。

回归测试：`tests/e2e/web/09-longwriting.spec.ts::Web 端 CSP 应允许 unsafe-eval...`

### 2. Web 端缺少注销入口

**改动**：
- `src/renderer/src/layouts/MainLayout.vue` 侧边栏底部新增「注销」按钮（仅 `window.__APP_PLATFORM__==='web'` 显示）
- 点击 → ElMessageBox 二次确认 → POST `/api/auth/logout` → `window.location.reload()`，
  main-web.ts 的 `checkAuthOrShowLogin()` 自动接管回到登录门
- 危险动作样式：hover 红色高亮，与其他菜单视觉区分

回归测试：`tests/e2e/web/01-auth.spec.ts::侧边栏注销按钮点击后回到登录页`

### 3. 长文写作生成概要前端"卡在生成中"

**现象**：`/story-editor/.../#1` 故事概要 → 点「生成概要」→ AI 已返回完整 JSON
（后端日志正常 done，前端 console 也能看到 done 事件**走的是 Electron 桥**），
但 Web 端在 chromium / 实际生产中前端 `generating.value` 一直为 true。

**根因**：
Web bridge `src/web/client/bridge.ts` 的 `onXxx(cb)` 默认订阅静态 channel
`<ns>:on-<event>`（kebab 转换）。但长文写作流式事件用的是 **per-eventId 动态
channel** `longwriting:generate:${eventId}`，且 preload 签名是
`onGenerateEvent(eventId, cb)`（带前置参数）。bridge 把它误映射为静态
`longwriting:on-generate-event`，订阅了一个永远不会有事件的 channel。

**修复**：
- `ChannelEntry` 新增 `eventChannel?: (...args) => string`，用于动态计算 channel
- bridge `onXxx` 分支改成可变参数：最后一个是 cb，前面参数转发给 `eventChannel`
- `channel-map` 补全：
  - `longwriting.onGenerateEvent` → `eventChannel(eventId) => 'longwriting:generate:${eventId}'`
  - `longwriting.onNewEntitiesDetected` → `'longwriting:new-entities-detected:${eventId}'`
- 同步把其他静态事件的 channel 显式映射，避免 kebab 默认转换出错：
  - `chat.onStream` → `chat:stream`
  - `image.onGenerationEvent` → `image:generation-event`
  - `portrait.onGenerationEvent` → `portrait:generation-event`
  - `translation.onProgress / onCompleted / onFailed`
  - `voice.onTTSCompleted / onSTTCompleted`

回归测试：`tests/unit/web-bridge.spec.ts`（5 用例）。

### 4. 取消 web-server 启动前的 better-sqlite3 ABI 切换

**背景**：
`npm run web:server:dev` 之前会先 `npm run abi:node`，把 better-sqlite3 native
模块切到 host-Node ABI。这会让随后启动 PC 端（Electron）时报「数据库未初始化」
（Electron 内嵌 Node v20 与 host Node v25 ABI 不兼容）。

**现状验证**：Web Server 启动路径上 `data-source.ts` 仅在
`cfg.type === 'sqlite'` 分支配置 `type: 'better-sqlite3'`，TypeORM 按需加载
dialect，而 web-server 强制 `type: 'postgres'`，**运行时根本不会加载
better-sqlite3 native 模块**。实测在 Electron ABI 下启动 web-server，health
check 正常返回。

**修复**：
- `web:server:dev` 脚本去掉 `npm run abi:node` 前缀
- `pc:dev` 仍保留 `npm run abi:electron`（PC 端必须）
- 双端可共存：PC 启动一次切到 Electron ABI 后，Web 启动不再污染

**后续可选**：把 better-sqlite3 标记为 optionalDependencies，让 web-only 部署
不再带 native 二进制。当前双端单仓库，保持 dependencies 即可。

## 后续可扩展点

- chat：增加多轮对话、停止生成、删除消息
- image：触发一次真实 wan2.7-image-pro 生成（已有 Electron 版可参考）
- voice：真实 TTS 调用 + 下载验证
- KB：上传文档 → 向量化 → 检索一条
- 翻译：上传短文本 → 翻译验证
- 长文写作：创建项目 → 生成 outline / 章节
- 剧集制作：创建项目 → 生成场景

但当前覆盖已能保证「所有页面可访问 + 所有核心 IPC 通道可达」，后续可按需增量补深度交互。
