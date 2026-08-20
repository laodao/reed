# 应用模块详细设计（后端）

> 日期：2026-08-19 ｜ 依据：`2026-08-19-app-module-interaction-design.md` 交互定稿 + 原型（`docs/prototype/app-module/index.html`）
> 前置：工作流引擎（A/B/C/D/E1 全量）、分享令牌（C3b）、REST+SSE（C3a）、文档工具层（Phase1）均已就绪

---

## 1. 背景与目标

工作流目前的使用入口分散：本机列表页手动运行、免登录分享页、REST API、定时。用户要求把工作流**发布为「应用」**——应用是统一的发布单元，提供**会话**（人机交互：表单填写/审核确认/结果卡片全部进对话流）这一全新渠道，并把分享/API/定时渠道归位到应用层统一管理。

### 目标
1. 建「应用」概念：应用 = 发布单元，来源 = 已发布工作流（未来可扩展到 harness）
2. 会话渠道：在应用下创建会话，start 表单 / form-collect 表单 / human-review 审核 / 结果卡片全部以消息形式出现在会话流
3. 分享渠道：令牌归位到应用（保留旧工作流令牌向后兼容）
4. API/定时渠道：复用已有 REST/触发器，应用详情页统一展示

### 明确不做（V1）
API 密钥管理与鉴权、版本回滚、二维码、应用市场、多人协作权限、harness 来源

---

## 2. 架构总览（对齐项目铁律）

```
Electron: IPC handler ─┐                    ┌─ Electron SQLite Repository
                       ├─→ core/modules/app │   （app-definition / app-session）
Web:      Controller  ─┘    服务层（唯一）   └─ 复用: workflow-run / definitions / messages / web-event-emitter

会话消息复用 messages 表（dialog_id=app_session.id）；
引擎事件经 AppSessionService 的事件订阅器 → 写会话消息（不依赖前端在线）；
前端会话页与运行详情页共用 RunInputForm / 审核卡片渲染逻辑。
```

铁律对照：
- **Service 唯一 / Repository 接口唯一 / 双端实例化** —— 新表走 BaseRepository + 双端 database-manager 接线（同 kb_qa_pairs 先例）
- **严禁字段映射** —— 表字段与 shared 类型同名直传
- **常量唯一源** —— 应用来源/渠道等状态收敛到 shared 常量（`APPLICATION_SOURCE_KINDS` 等）
- **跨租户例外** —— `getByShareToken` 沿用 C3b 纪律（调用方拿 userId 后 runWithUserAsync）

---

## 3. 数据模型

### 3.1 `apps`（应用定义，新表）

| 列 | 类型(SQLite/PG) | 说明 |
|----|----------------|------|
| id | varchar PK | app_ 前缀 + 随机 |
| user_id | varchar | 多租户（BaseRepository 注入） |
| name | varchar | 应用名 |
| icon | text 可空 | emoji 图标 |
| description | text 可空 | |
| source_kind | varchar | `workflow`（V1 唯一）；常量 `APP_SOURCE_WORKFLOW` |
| source_id | varchar | 工作流定义 id（`workflow_definitions.id`） |
| source_version | integer | 创建时的工作流 published_version 快照 |
| channel_session | integer(0/1) | 会话渠道开关，默认 1 |
| channel_share | integer(0/1) | 分享渠道开关，默认 0 |
| channel_api | integer(0/1) | API 渠道开关，默认 1 |
| share_token | varchar 可空，唯一索引 | 256bit hex，启用分享时生成（NULL=未分享；唯一索引 NULL 不冲突） |
| enabled | integer(0/1) | 应用启用/停用，默认 1（停用=全部渠道失效） |
| last_run_at | datetime 可空 | 最近一次会话运行时间（概览统计） |
| created_at / updated_at | datetime | |

索引：`idx_apps_user(user_id)`、`idx_apps_source(source_kind, source_id)`、`uniq_apps_share_token(share_token)`。

### 3.2 `app_sessions`（工作流会话头，新表）

| 列 | 类型 | 说明 |
|----|------|------|
| id | varchar PK |  会话 id；同时作为 `messages.dialog_id` |
| user_id | varchar | 多租户 |
| app_id | varchar | 所属应用 |
| title | varchar | 会话标题（取首条 start 输入摘要或手动改） |
| status | varchar | `idle`（未运行）/ `running`（运行中/挂起）/ `failed`；常量 `APP_SESSION_STATUSES` |
| last_run_id | varchar 可空 | 最近一次 workflow_run id（跳运行详情） |
| last_start_inputs | text(JSON) 可空 | 最近一次提交的 start 参数（多轮默认沿用） |
| created_at / updated_at | datetime | |

索引：`idx_app_sessions_app(app_id)`。

### 3.3 消息：复用 `messages` 表

工作流会话消息直接写 `messages`（`dialog_id` = app_session.id）——零新表，消息渲染/持久化/多租户/附件全部复用。卡片类型存 `metadata`：

```ts
// messages.metadata（工作流会话卡片）判别联合，常量 WORKFLOW_SESSION_CARDS
type SessionCardMeta =
  | { card: 'start-form'; appId: string; form: WorkflowStartInput[]; runId?: string }   // 启动表单（返回值后折叠）
  | { card: 'run-status'; runId: string; status: string; nodes: {id,status}[]; error?: string }
  | { card: 'review'; runId: string; nodeId: string; kind: 'form'|'approve'|'choose'|'input'; schema: unknown }  // 挂起交互
  | { card: 'message'; runId: string; content: string }                                  // message 节点输出
  | { card: 'report'; runId: string; title: string; markdown: string; format?: string; filePath?: string; imageBase64?: string }
role 与内容：用户侧（表单提交摘要 / 普通消息）role='user'；卡片均 role='assistant'（表单/审核卡片虽待用户操作，但属系统发出）。
```

### 3.4 迁移 `create-apps-tables.ts`
参照 `create-workflow-tables.ts`（双语种幂等：SQLite `TEXT/INTEGER/datetime` ↔ PG `varchar/integer/timestamp`）；Electron `runMultiTenantMigrations` 尾部 + Web `initDatabase` 各注册一次。

---

## 4. 服务层（`src/core/modules/app/`）

### 4.1 `app-definition.service.ts`

```ts
export class AppDefinitionService {
  // 列表/详情
  listApps(params: { page; pageSize; keyword? }): Promise<{ items: AppRecord[]; total }>
  getApp(id): Promise<AppRecord | null>
  getAppByDefinitionId(definitionId): Promise<AppRecord | null>   // 编辑器"已发布为应用？"检测

  // 创建（仅在已有分享时保留旧 token；无强制平台语义）
  createFromWorkflow(definitionId, opts?: { name?; icon? }): Promise<AppRecord>
      // 校验：定义存在、publishedVersion>0、未重复创建（同定义只允许一个应用 → 幂等返回既有）
      // 快照 source_version = publishedVersion

  // 渠道
  updateChannels(id, patch: { channelSession?; channelShare?; channelApi? }): Promise<AppRecord | null>
  enableShare(id): Promise<AppRecord | null>     // 生成 share_token（幂等；复用 C3b crypto 逻辑）
  disableShare(id): Promise<AppRecord | null>     // 清 token（历史链接即刻失效）
  setEnabled(id, enabled: boolean): Promise<AppRecord | null>

  // 分享解析（跨租户，供免登录页）
  getByShareToken(token): Promise<AppRecord | null>   // 仅 channel_share=1 且 enabled=1

  deleteApp(id): Promise<void>   // 级联删会话（消息联动见 4.3）
}
```

AppRecord DTO = apps 表字段直出（无映射）；`sourceGraph()` 取发布图：`definitions.getById(source_id).publishedGraph`（供分享页/API 现场取）。

### 4.2 `app-session.service.ts`

```ts
export class AppSessionService {
  // 会话 CRUD
  createSession(appId, startInputs?): Promise<AppSessionRecord>
      // 校验应用 enabled=1 且 channel_session=1 → 否则抛错；status=idle
      // 同时写首条 assistant 消息：{ card:'start-form', form: 发布图 start.inputs }
  listSessions(appId): Promise<AppSessionRecord[]>
  getSession(sessionId): Promise<AppSessionRecord | null>
  getSessionMessages(sessionId): Promise<Message[]>    // dialog_id=sessionId ASC

  // 启动/多轮
  async startRun(sessionId, inputs?: Record<string, unknown>): Promise<{ runId; status }>
      // 应用/会话校验；互斥（同源定义在途 → 抛"运行进行中"，由前端给排队/取消选项）
      // triggerInfo: { source:'app-session', appId, sessionId }（C4 dialogId 关联也复用此门）
      // startRun 透传 inputs（缺省取 last_start_inputs 合并 defaultValue→首条折叠摘要）
      // 更新 session.status=running + last_run_id + last_start_inputs；写 run-status 卡片消息

  // 挂起交互（前端统一走 reviewDecide 通道，此处仅转发语义说明）
  reviewDecide(sessionId, nodeId, decision, editedValues?, choice?): Promise<boolean>
      // 透传 engine.resumeReview（runId 从该会话 last_run_id 取）；成功后由事件桥更新消息

  // 事件桥：引擎事件 → 会话消息（4.3）
  attachRunEvents(tap: (cb) => unsubscribe): void   // 注入 web-event-emitter.tapEvents
}
```

### 4.3 事件桥（关键机制）

```
wf:run-event（runId 维度）→ AppSessionService.handleRunEvent：
  由 service 记录「runId → 会话」映射（startRun 时登记 runId→sessionId，放 Map 或查 last_run_id）
  按载荷类型写会话消息：
  - runStatus running  → 更新 run-status 卡片（初始）
  - reviewRequested   → 写 review 卡片：kind 由 payload.schema.form/options/interaction 判别
                        （form→RunInputForm 复用；choose→选项按钮；approve/input→三按钮/编辑框）
  - nodeStatus        → 更新 run-status 卡片的 nodes 进度
  - runStatus 终态    → 若成功：从 run 详情取报告/消息节点输出 → 写 report/message 卡片（+长图 base64）
                        失败：run-status 卡片标 error + session.status=failed
  导出：本会话仅写消息 + 会话状态；不依赖任何前端连接在线（与 C3 SSE 同源 tapEvents）
```

事件桥测试要点：mock tap 源注入事件序列 → 断言 messages 表按序写入对应卡片 metadata。

### 4.4 删除联动
- `deleteApp`：删 app → 删该应用全部 app_sessions → 并删对应 messages（`deleteByDialogId` 复用现有 message.repository 方法）
- 工作流被删除：应用保留但 `source_id` 悬空 → 会话启动时报"源工作流已删除"，前端显示只读提示

---

## 5. IPC / REST 通道（三处契约严格同步）

### 5.1 IPC（Electron handler + preload + web channel-map）

```
app:list                    listApps({page,pageSize,keyword})
app:get                     getApp(id)
app:get-by-definition       getAppByDefinitionId(definitionId)
app:create-from-workflow    createFromWorkflow(definitionId, opts?)
app:update-channels         updateChannels(id, patch)
app:enable-share            enableShare(id)
app:disable-share           disableShare(id)
app:set-enabled             setEnabled(id, enabled)
app:delete                  deleteApp(id)
app-session:list            listSessions(appId)
app-session:create          createSession(appId, startInputs?)
app-session:get             getSession(sessionId)
app-session:messages        getSessionMessages(sessionId)
app-session:start           startRun(sessionId, inputs?)
app-session:review          reviewDecide(sessionId, nodeId, decision, editedValues?, choice?)
```

通道处理器放 `src/electron/ipc/handlers/app.handler.ts`（薄适配层，业务在 core service）；`registerAppHandlers()` 在 electron/index 与 web server 双端注册。

### 5.2 分享/API/SSE（复用 C3 机制，改造解析目标）

- 免登录分享页路由：`GET /#/app-share/:token`（**新版**）；旧 `/share/:token`（工作流级）保留兼容
- REST（已有 workflow-api-router）：`/api/workflow/share/:token/*` 的 `resolveShare` 增加**应用优先**：先 `appDefinitions.getByShareToken(token)`（验证 channel_share=1+enabled），命中则用其 `source_id` 定义 + 相同 share 触发语义；未命中回退旧定义查询
- 新增 `GET /api/app/:id`（本人应用详情，未登录 401）——B 端列表页数据走 IPC 即可，REST 详情供将来外部集成（V1 可选）

---

## 6. 事件-消息写库的时序（会话一轮完整生命周期）

```
用户会话页 → createSession → 首条 start-form 卡片
   → 用户填表提交 → app-session:start(inputs)
        → workflow-run.startRun(triggerInfo={source:'app-session',appId,sessionId})
        → 登记 runId↔session；写 run-status 卡片（nodes 初始）
   → 引擎执 → 事件桥（tapEvents）
        → reviewRequested(form-collect) → 写 review 卡片(schema) → 前端渲染 RunInputForm
        → 用户提交 → app-session:review(decision) → engine.resumeReview 恢复 → 事件桥继续
        → runStatus succeeded → 聚合报告/消息输出 → 写 report/message 卡片 → session.status=idle
底部发消息 → app-session:start(新 inputs，缺省沿用 last) → 新一轮（多轮）
```

---

## 7. 前端（`src/renderer`）

| 路由 | 视图 | 要点 |
|------|------|------|
| `/apps` | AppList.vue | 应用卡片网格（对齐原型①；图标/来源/版本/渠道点/统计）|
| `/apps/:id` | AppDetail.vue | 概览 + 渠道 Tab（对齐原型②；4 渠道开关、分享令牌复制/重置、会话列表、「开始会话」）|
| `/apps/:id/session` | AppSession.vue | 会话界面（对齐原型③）；复用 RunInputForm、审核卡片渲染逻辑（自 WorkflowRunDetail 抽出共享卡片组件）|
| `/app-share/:token` | 复用 WorkflowGuestRun 改造 | 应用级托管分享 |

菜单：`config/menu.ts` 新增「应用」入口（`hidden:false`，icon 对齐侧边栏）；`pathTitleMap/router meta.title` 覆盖（运营 tab 命名修复已有）。

前端内部事件：会话页订阅 `wf:run-event`（Electron ipcRenderer.on / Web ws）刷新卡片；与运行详情页共用 `stores/workflow`。

---

## 8. 边界与约束

| 场景 | 行为 |
|------|------|
| 应用停用（enabled=0） | 会话开始请求拒绝；分享链接 404；会话页只读 |
| 会话渠道关闭 | 新会话拒绝；既有会话只读 |
| 分享渠道关闭 | share_token 清除，链接即刻失效 |
| 同工作流在途运行 | startRun 返回 skipped → 会话页提示"运行进行中"（排队/取消按钮） |
| 工作流删除 / 未发布 | 应用禁用创建与会话启动；已有会话只读 |
| 应用删除 | 级联删会话与消息 |
| 超长报告 | markdown 全量（消息存储上限内），长图 base64 走文件落盘+路径（复用 report-image 机制） |

常量（shared，收敛字面量）：`APPLICATION_SOURCE_KINDS = { workflow: 'workflow' }`、`APP_SESSION_STATUSES`、`WORKFLOW_SESSION_CARDS`（card 判别联合）。

---

## 9. 测试计划（TDD）

| 层 | 用例 |
|----|------|
| 迁移 | 双语种幂等（Postgres/sqlite 各跑一次不报错、重复跑跳过）|
| AppDefinitionService | createFromWorkflow（成功/未发布/重复幂等）、updateChannels、enableShare 幂等+令牌格式、disableShare 清除、getByShareToken 渠道关闭/停用返回 null、deleteApp 级联 |
| AppSessionService | createSession 写首条卡片、startRun（triggerInfo 透传/互斥 skipped/缺省沿用 last inputs）、reviewDecide 透传、事件桥（runStatus/reviewRequested/终态聚合 report 卡片/失败标 error）、多轮 |
| 消息映射 | 各卡片 metadata 判别联合与 role 正确 |
| IPC | app.handler 注册遍历一致性（复用 workflow handler 测试先例）|
| 前端 | AppList/AppDetail/AppSession 组件挂载（mock electronAPI）、渠道开关联动、卡片分支渲染快照 |
| E2E | 建工作流 → 发布为应用 → 开会话 → start 表单提交 → form-collect 挂起表单填写 → 提交 → succeeded → 结果卡片（复用 e2e-form-pc 模式）|

---

## 10. 实施切片

| 片 | 内容 | 依赖 |
|----|------|------|
| **片1 存储+服务** | apps/app_sessions 迁移+Entity+Repository 双端接线；AppDefinitionService（CRUD/渠道/分享/级联）；shared 常量；单测 | — |
| **片2 会话服务+事件桥** | AppSessionService（create/start/review/多轮）+ 事件桥写消息；单测 | 片1 + 已就绪引擎 |
| **片3 IPC 接线+列表/详情页** | app.handler+preload+channel-map；AppList/AppDetail（渠道开关/分享复制/会话列表）；菜单；REST resolveShare 应用优先兼容 | 片1 |
| **片4 会话界面** | AppSession.vue（start 表单/挂起卡片/结果卡片）+ 共享卡片组件抽取（WorkflowRunDetail 复用）；分享页托管 `/app-share/:token`；E2E | 片2（卡片渲染依赖引擎事件载荷，已就绪）|

依赖链：片1 → 片2 → 片4；片3 与片2 可并行（页面骨架先行）。

## 11. 风险与对策

| 风险 | 对策 |
|------|------|
| 事件桥消息与前端实时更新竞态 | 前端以「事件优先、加载时全量拉取 messages 兜底」双通道刷新；事件写库幂等（runStatus 终态只写一次）|
| apps 与工作流共享图序列变化 | 会话启动时**现场取最新发布图**（非创建快照），source_version 仅展示；删除源定义则禁用 |
| 消息表混用（AI 对话 vs 应用会话）污染查询 | dialog_id 前缀约定（`apps_` 前缀）+ 应用消息查询严格按 dialog_id 过滤；互不影响 |
| 分享令牌迁移断层 | 应用级 token 新生成；旧工作流 token 继续可用（双解析拓退） |