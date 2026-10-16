# AI工具箱

一个集成多种AI能力的跨平台桌面应用。

## 技术栈

- **框架**: Electron 28+
- **前端**: Vue 3 + TypeScript
- **状态管理**: Pinia
- **UI组件**: Element Plus
- **样式**: TailwindCSS + SCSS
- **构建工具**: Vite + electron-vite
- **数据库**: SQLite (better-sqlite3)

## 功能特性

- AI对话（支持多模型）
- 图像生成
- 视频生成
- OCR文字识别
- 语音转换（TTS/STT）
- 多语言翻译
- 知识库管理
- 网络搜索

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 端口与容器分配

本仓库同机并存「本地 dev」和「Docker 测试环境」两套，端口与数据库各自独立：

| 环境 | 用途 | 端口 | 进程 / 容器 |
|---|---|---|---|
| **本地 dev** | 前端 | 5174 | `vite`（本地进程） |
| **本地 dev** | 后端 | 4201 | `tsx watch src/web/server/index.ts`（本地进程） |
| **本地 dev** | 数据库 | 5432 | docker `the-bot-test-pg` 容器内 `the_bot_web` 库 |
| **测试环境** | Web 应用 | 4291 | docker `the-bot-staging-app` |
| **测试环境** | 数据库 | 5433 | docker `the-bot-staging-pg` 容器内 `the_bot_web` 库 |

**密钥说明**：dev 后端连 `localhost:5432/the_bot_web`，对称加密密钥文件在 `data-web/secure-key`。该文件与库内的 api_keys 密文一一对应，不要替换或挪动，否则解密失败。

**Session cookie 隔离**：浏览器按 domain（不含 port）共享 cookie，所以 `localhost:5174` 与 `localhost:4291` 默认会互踢登录态。本仓库已通过 `JWT_COOKIE_NAME` 环境变量隔离：dev 用 `tb_session_dev`，测试环境用默认的 `tb_session`，可同时登录互不影响。

### 默认账号（dev 与测试环境共用）

```
邮箱:  alice@example.com
密码:  password123
```

约定来源：`tests/e2e/web/helpers/auth.ts` 的 `DEFAULT_USER`。可通过 `E2E_WEB_EMAIL` / `E2E_WEB_PASSWORD` 环境变量覆盖。

### 启动 dev

```bash
bash scripts/web.sh start all
# 默认等价于 PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres
#         PGDATABASE=the_bot_web DATA_ROOT=./data-web
```

### 常用维护命令

```bash
bash scripts/web.sh status         # 状态
bash scripts/web.sh stop all       # 停止
bash scripts/web.sh logs server    # tail server 日志
bash scripts/web.sh logs client    # tail vite 日志
```

> ⚠️ 不要 `pkill -f vite` / `pkill -f tsx` —— 会跨 worktree 误杀。停服务用 `bash scripts/web.sh stop all`（走 PID 文件）。
>
> ⚠️ 测试环境容器（`the-bot-staging-*`）由部署脚本管理，日常开发不要 `docker stop/rm`；如需重启走 `scripts/staging.sh`。

### 构建

```bash
# 构建所有平台
npm run package

# 构建特定平台
npm run package:win
npm run package:mac
npm run package:linux
```

### 代码检查

```bash
npm run lint
npm run lint:fix
```

### 测试

```bash
npm run test
npm run test:coverage
```

## 项目结构

```
ai-tool-box/
├── src/
│   ├── main/           # Electron主进程
│   │   ├── index.ts    # 入口文件
│   │   ├── ipc/        # IPC处理器
│   │   ├── services/   # 业务服务
│   │   ├── providers/  # AI提供商
│   │   └── database/   # 数据库
│   ├── renderer/       # 渲染进程（Vue3）
│   │   ├── src/
│   │   │   ├── views/      # 页面组件
│   │   │   ├── components/ # 通用组件
│   │   │   ├── stores/     # Pinia状态
│   │   │   ├── router/     # 路由
│   │   │   └── styles/     # 样式
│   │   └── index.html
│   ├── shared/         # 共享类型
│   └── preload/        # Preload脚本
├── resources/          # 静态资源
└── build/              # 构建配置
```

## 许可证

MIT
