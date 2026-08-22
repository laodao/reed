# 邮件收发能力（工作流工具）

> 日期：2026-08-22 · 分支：feat/workflow-engine
> 背景：用户希望工作流引擎具备邮件收发能力（"丰富的邮件操作工具"），做成可由
> tool-call 节点主动调用的工具；IM 消息各平台 API 差异大，本次仅做邮件。

## 需求定位（与用户确认）

- **发/收都做成工具**（非工作流组件、非实时监听器）：工作流用 `tool-call` 节点主动读取/发送邮件。
  - "收"（监听邮件）用 cron 定时器 + 读取工具轮询实现（"处理完回到监听"即下一次 cron 触发）。
  - 实时监听器（IMAP IDLE / Webhook 推送）为后续增量项。
- **全套邮件操作**：发送(含附件)、拉列表、读正文、下载附件、搜索、标记已读/未读、删除、邮箱状态。
- **主流邮箱都支持**：网易163/QQ/腾讯企业邮/Gmail/Outlook/阿里云企业邮（统一 IMAP+SMPT，授权码认证，
  服务器地址分开配置）。
- **独立账号配置**：设置页"邮箱账号"tab，内置通用服务器预设一键填充。

## 架构决策

- **工具 kind 扩展到 `email`**：`ToolKind` 加 `'email'`；`CustomTool/PresetTool` 加 `operation`（工具操作名）
  + `emailAccountId`（绑定的邮箱账号）。
- **EmailService（static 类，`getEmailService()`）**：SMTP 发送（nodemailer）+ IMAP 收件
  （imapflow）+ 正文/附件解析（mailparser）。授权码经 SecureStorage 加密落库，仅执行连接前解密到内存。
- **tool-call 分派**：`ToolService.executeTool` 对 `kind==='email'` 分派到 `runEmail` →
  EmailService 对应操作，返回结构化结果（json + text）。
- 邮箱账号：`email_accounts` 表（entity + 幂等 migration）+ `EmailAccountRepository`（多租户 CRUD），
  接入 `ICoreDatabaseManager`（Electron + Web 双端）。

## 工具清单（预设，kind=email，category=邮件）

| id | 操作名 | 说明 |
|---|---|---|
| preset:email-send | send | SMTP 发送（to/cc/bcc/subject/text/html/附件） |
| preset:email-list | list | IMAP 拉取邮件摘要列表（默认 INBOX，倒序，limit） |
| preset:email-read | read | 拉取指定 uid 邮件正文（text/html/附件清单） |
| preset:email-search | search | 按发件人/主题/时间/未读搜索 |
| preset:email-mark | mark_seen | 标记已读/未读（\Seen） |
| preset:email-delete | delete | 删除邮件 |
| preset:email-status | status | 邮箱状态（文件夹 total/unseen） |
| preset:email-attachment | download_attachment | 下载指定附件 |

## 文件清单

- 类型：`src/shared/types/email.types.ts`（EmailAccount/各操作入出参）、`tool.types.ts`（email kind）
- 后端：`EmailService`（src/core/services/email.service.ts）、`email_accounts` entity/migration/repository、
  `ICoreDatabaseManager.emailAccounts`（Electron + Web）
- 工具：`preset-tools.ts`（8 个邮件预设）、`tool.service.ts`（runEmail 分派）
- IPC/接线：`email.handler.ts`（email:list/save/delete/test-account）、preload `electronAPI.email`、
  `src/electron/index.ts` 与 Web `register-channels.ts`
- 前端：`EmailSettings.vue`（账号 CRUD + 测试连接 + 6 家服务器预设）、`Settings.vue`（邮箱账号 tab）

## 验证

- 编译：`tsc -p tsconfig.node.json` 通过；`vue-tsc --noEmit` 仅剩既有 TS6305（electron.vite.config）。
- 运行时（dev 主进程加载）：14 个预设工具（含 8 个邮件工具）；设置页"邮箱账号"tab 正常渲染。
- 校验：缺 name → "显示名不能为空"；端口越界 → "IMAP 端口必须是 1-65535 的整数"；
  testAccount 不存在账号 → "邮箱账号不存在"；runEmail 缺 accountId → "缺少邮箱账号参数 accountId"。
- 分派链路：工作流 tool-call 节点执行 preset:email-list → `ToolService.runEmail` → `EmailService.list`
  返回结构化 `{success,messages,error}`（假账号连真实服务器失败为预期，证明链路打通）。
- 真实收发需用户邮箱授权码（本轮未提供）；全部代码路径与校验已验证。

## 依赖与兼容性

- 新增依赖：imapflow / nodemailer / mailparser（+ @types/*）。
- **pino 兼容修复**：imapflow 传递依赖 pino，npmmirror 拉到 10.x，其顶层
  `require('pino')()` 需要 `diagnostics_channel.tracingChannel`（Electron 28 内置 Node 18 无此 API）
  → 主进程启动崩溃 `TypeError: diagChan.tracingChannel is not a function`。
  修复：`package.json` 加 `overrides.pino: "^9.0.0"` 强制 pino 9（其 tools.js 有
  `typeof diagChan.tracingChannel === 'function'` 防御检查），并删除 imapflow 嵌套的 pino 10
  node_modules（当前环境文件调整，避免 postinstall 重建原生模块失败）。
