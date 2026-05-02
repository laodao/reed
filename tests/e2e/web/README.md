# Web 端 E2E 测试

本目录为 The Bot Web 端（http://localhost:5174 + http://localhost:4201）的 Playwright 端到端测试。
与 `tests/e2e/*.spec.ts` 的 Electron 端测试相互独立，使用单独的配置 `playwright.web.config.ts`。

## 前置条件

1. **PostgreSQL 容器**
   ```bash
   docker ps | grep the-bot-test-pg     # 应已运行
   # 否则：npm run pg:up
   ```
2. **Web Server**（端口 4201，连接 the_bot_web 库）
   ```bash
   DATA_ROOT=./data-web-mt npm run web:server:dev
   ```
3. **Vite Dev Server**（端口 5174，代理 /api 到 4201）
   ```bash
   npm run web:client:dev
   ```
4. **测试账号**（the_bot_web 库需有以下用户，登录密码必须正确）
   - 默认：alice@example.com / password123（可通过环境变量覆盖）
5. **Provider 配置**
   - `provider_configs` 表至少含 `template_id='deepseek'` 与 `template_id='bailian'` 的启用记录
   - chat 真实调用测试需要 API key 有效，配额可用

## 运行

```bash
# 运行全部 web e2e
npx playwright test --config=playwright.web.config.ts

# 仅运行某个 spec
npx playwright test --config=playwright.web.config.ts tests/e2e/web/01-auth.spec.ts

# 按描述过滤
npx playwright test --config=playwright.web.config.ts -g "DeepSeek"

# 调试 (UI 模式)
npx playwright test --config=playwright.web.config.ts --ui

# 失败时查看 HTML 报告
npx playwright show-report playwright-report-web
```

## 自定义环境

```bash
WEB_BASE_URL=http://localhost:5174 \
WEB_API_BASE=http://localhost:4201 \
E2E_WEB_EMAIL=alice@example.com \
E2E_WEB_PASSWORD=password123 \
  npx playwright test --config=playwright.web.config.ts
```

## 文件清单

| 文件 | 覆盖范围 |
|------|----------|
| `helpers/auth.ts` | 登录/登出/IPC 桥/导航通用工具 |
| `01-auth.spec.ts` | 注册、登录、错误密码、登出 |
| `02-home.spec.ts` | 首页与侧边栏 11 个菜单项导航 |
| `03-settings.spec.ts` | 设置 6 个 tab、提供商列表、IPC settings:get |
| `04-chat-deepseek.spec.ts` | 真实调用 DeepSeek 完成一次对话 |
| `05-chat-bailian.spec.ts` | UI 切换到百炼 Qwen 完成一次对话 |
| `06-translate.spec.ts` | 翻译页加载 + IPC translation:* |
| `07-image.spec.ts` | 图像页加载 + IPC image:list |
| `08-portrait.spec.ts` | 人像页加载 + IPC portrait:list-projects |
| `09-longwriting.spec.ts` | 长文写作页加载 + IPC longwriting:getProjects |
| `10-story-to-video.spec.ts` | 剧集制作页加载 + IPC stv:list-projects |
| `11-voice.spec.ts` | 语音助手页加载 + IPC voice:providers/history |
| `12-knowledge-base.spec.ts` | 知识库页加载 + IPC knowledge-base:list |
| `13-diary.spec.ts` | 日记页加载 + IPC diary:get-all-folders/list-entries |
| `14-api-bridge.spec.ts` | 通用 API 桥/权限/未知 channel |

## 注意

- 测试使用同一个 `chromium` 浏览器、单 worker 串行执行，避免会话冲突。
- chat 真实调用受 API 提供商速率/网络影响，单条等待 90s。
- 部分模块 IPC 返回结构兼容 `T[]` / `{ items: T[] }`，spec 已做容错。
- 失败时浏览器截图、视频、trace 自动保存到 `playwright-report-web/`。
