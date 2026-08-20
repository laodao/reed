# 应用模块开发计划（分片执行，TDD 每片验收后进下片）

> 日期：2026-08-19 ｜ 依据：`2026-08-19-app-module-backend-design.md`（含 review 修订）
> 顺序：片1 存储+服务 → 片2 会话+事件桥 → 片3 IPC+列表/详情页 → 片4 会话界面+卡片+E2E

---

## 片 1：存储（迁移/实体/仓库）+ 应用定义服务

### 1.1 新建：shared 常量与类型
`src/shared/types/app.types.ts`（新）
- `APPLICATION_SOURCE_KINDS = { workflow: 'workflow' } as const`
- `APP_SESSION_STATUSES = { idle, running, failed } as const`
- `WORKFLOW_SESSION_CARDS = { startForm:'start-form', runStatus:'run-status', review:'review', message:'message', report:'report' } as const`
- `SessionCardMeta` 判别联合（card + 各形态字段，与设计 §3.3 精确一致）
- `AppRecord` / `AppSessionRecord`（表字段同名直出，零映射——铁律）

改动：`src/shared/types/workflow.types.ts` 不动；app.types.ts 自包含。

### 1.2 新建：Entity
- `src/core/database/entities/app.entity.ts`：`apps` 表（id/user_id/name/icon/description/source_kind/source_id/source_version/四个 channel*/share_token/enabled/last_run_at/时间戳），`@Index('idx_apps_user',['userId'])`、`@Index('idx_apps_source',['sourceKind','sourceId'])`、`@Index('idx_apps_share_token',['shareToken'],{unique:true})`
- `src/core/database/entities/app-session.entity.ts`：`app_sessions` 表（id/user_id/app_id/title/status/last_run_id/last_start_inputs/时间戳），`@Index('idx_app_sessions_app',['appId'])`
- 注册：`src/core/database/entities/index.ts` 加两行 export

### 1.3 新建：Repository
- `src/core/database/repositories/app.repository.ts`：`AppRepository extends BaseRepository`——`findById`、`listApp({page,pageSize,keyword})`（keyword 模糊 name/description）、`findBySource(sourceKind, sourceId)`、`create`、`update`、`delete`、`findByShareToken(token)`（跨租户裸查，注释纪律同 findByShareToken 先例）
- `src/core/database/repositories/app-session.repository.ts`：`AppSessionRepository`——`findById`、`listByApp(appId)`（createdAt DESC）、`create`、`update`、`deleteByApp(appId)`（级联计数）、`countByApp(appId)`
- DTO/Input 接口与实体字段同名直传

### 1.4 新建：迁移 + 双端注册
- `src/core/database/migrations/create-apps-tables.ts`：仿 `create-workflow-tables.ts`——PG `varchar/integer/timestamp`、SQLite `TEXT/INTEGER/datetime`，幂等（checkTableExists）；两表 + 三个索引（uniq 索引用 `CREATE UNIQUE INDEX`）
- 改动：
  - `src/electron/database/index.ts`：`runMultiTenantMigrations` 尾部 `await createAppsTables(this.dataSource)`（动态 import）；`public appDefinitions/appSessions` 属性 + 构造实例化两行
  - `src/web/server/platform/web-database-manager.ts`：接口两列 + 实例化两行
  - `src/core/database/database-manager.interface.ts`：`appDefinitions: AppRepository | null`、`appSessions: AppSessionRepository | null`

### 1.5 新建：服务
- `src/core/modules/app/app-definition.service.ts`：
  - `listApps`（聚合：`countByApp` 查 sessionCount；runCount 按 sourceId `db.workflowRuns.countByDefinition?`——若无则先用会话 count 近似，标注 V2 完善）
  - `getApp` / `getAppByDefinitionId` / `createFromWorkflow`（校验 publishedVersion>0；同定义幂等返回既有）/ `updateChannels(patch)` / `enableShare`（crypto.randomBytes(32).hex，幂等）/ `disableShare` / `setEnabled` / `getByShareToken`（channel_share=1 && enabled=1）/ `deleteApp`（级联 `sessions.deleteByApp` + 各会话消息 `messages.deleteByDialogId`）
  - `sourceGraph(def)`：`definitions.getById(source_id).publishedGraph`

### 1.6 改动：仓库消息目录
`src/core/database/repositories/message.repository.ts` 确认已有 `deleteByDialogId`（若有则复用；无则补 8 行幂等方法）。

### ✅ 片1 验收
```bash
npx vitest run tests/unit/core/modules/ App名  # 见下
```
新建 `tests/unit/core/modules/app/app-definition.spec.ts`（8 用例）：
1. createFromWorkflow：已发布 → 创建成功、source_version=当前版本
2. createFromWorkflow：未发布（publishedVersion=0）→ 抛"只有已发布"
3. createFromWorkflow：同定义重复 → 幂等返回既有（不第二次建）
4. updateChannels：只改传入字面量，其余不变
5. enableShare：生成 64hex 令牌且幂等（二次同值）；disableShare 清空
6. getByShareToken：channel_share=0 或 enabled=0 → null；合法 → 返回
7. deleteApp：级联删 sessions + 消息（mock 仓库断言 deleteByApp/deleteByDialogId 调用）
8. listApps 聚合：sessionCount 正确
+ 迁移幂等（先例：create-workflow-tables 的 spec 若存在则加 apps 类似用例）
门禁：全绿 + `npx tsc --noEmit -p tsconfig.node.json` 无相关新增错误。

---

## 片 2：会话服务 + 事件桥（核心）

### 2.1 改动：事件 tap 源提升 core
- `src/core/interfaces/event.interface.ts`：`IEventEmitter` 加可选 `tapEvents?(cb: (channel, data, userId) => void): () => void`
- `src/electron/services/electron-event-emitter.ts`：加 `taps: Set` + `tapEvents()` + `emit` 开头先回调 taps（携带 `getCurrentUserId()`；try/catch 隔离；与 web 端已实现完全同构）
- `src/web/server/platform/web-event-emitter.ts`：已实现，不动（仅核对签名一致）

### 2.2 新建：会话服务
`src/core/modules/app/app-session.service.ts`：
- `createSession(appId, startInputs?)`：校验 app enabled+channel_session；status=idle；写首条 assistant 消息 `{card: WORKFLOW_SESSION_CARDS.startForm, form: 发布图 start.inputs}`（`messages.create`）
- `listSessions` / `getSession` / `renameSession` / `getSessionMessages`（`messages.getByDialogId(sessionId)` ASC）
- `startRun(sessionId, inputs?)`：
  - app 校验 → `definitions.getById(app.source_id)` → `workflowRunService.startRun({ definitionId, triggerType: manual, inputs: 合并 last_start_inputs+defaultValue, triggerInfo: { source:'app-session', appId, sessionId } })`
  - 互斥：捕获"同工作流已有运行中实例"→ 抛类型化错误（前端给排队/取消选择）
  - 成功：登记 `runToSession.set(runId, sessionId)`；更新 session（status=running/lastRunId/lastStartInputs）；写 run-status 卡片
- `reviewDecide(sessionId, nodeId, decision, editedValues?, choice?)`：取 session.lastRunId → `engine/resumeReview` 透传；成功由事件桥更新消息
- `handleRunEvent(ev)`：按 `WORKFLOW_RUN_EVENT_TYPES` 分派——reviewRequested 写 review 卡片（kind 判别 form/choose/approve/input）；nodeStatus 更新 run-status 卡片 nodes；runStatus 终态（succeeded→聚合 report/message 节点输出写结果卡片；failed→标 error+session.status=failed）
- `attach(tap: (cb)=>unsubscribe)`：boot 时注入 `getEventEmitter().tapEvents`，命中 runToSession 内 runId 才处理

### 2.3 新建：测试
`tests/unit/core/modules/app/app-session.spec.ts`（mock 仓库 + 可编程 tap 源）：
1. createSession 写首条 start-form 卡片（mock messages.create 断言 metadata.card）
2. startRun 触发 startRun 透传 triggerInfo/inputs 合并；登记 runToSession；写 run-status
3. startRun 互斥 → 抛"运行进行中"
4. reviewDecide 透传 resumeReview（runId=lastRunId）
5. handleRunEvent reviewRequested(form) → review 卡片含 schema
6. handleRunEvent nodeStatus → run-status nodes 更新
7. handleRunEvent runStatus succeeded → report 卡片（mock getRun 捏 report 输出）
8. handleRunEvent runStatus failed → session.status=failed + 卡片 error
9. renameSession 更新 title
门禁：全绿 + tsc 通过；`electron-event-emitter` tap 补充后现工作流事件单测不回归。

---

## 片 3：IPC 接线 + 列表/详情页

### 3.1 新建：IPC handler
`src/electron/ipc/handlers/app.handler.ts`（薄适配，仿 workflow.handler）：
- `app:list` `app:get` `app:get-by-definition` `app:create-from-workflow` `app:update-channels` `app:enable-share` `app:disable-share` `app:set-enabled` `app:delete`
- `app-session:list` `rename` `create` `get` `messages` `start` `review`
- 每个 `wrap(() => service.xxx(...))`；未初始化子系统守卫同 workflow.handler
- 注册：`src/electron/index.ts` `registerAppHandlers()`；web 端复用 ipcBridge（与 workflow.handler 相同机制，在 bridge-adapter 注册处加）

### 3.2 改动：三处契约
- `src/preload/index.ts`：`app` 命名空间（9 方法）+ `appSession`（7 方法）
- `src/web/client/channel-map.ts`：`app.*` `appSession.*` 各通道严格对应 preload
- 一致性：`tests/unit/web` 或既有 channel-map 遍历测试（先例）扩展到 app 命名空间

### 3.3 新建：前端列表/详情
- `src/renderer/src/views/app/AppList.vue`：对齐原型①——卡片网格（icon/名称/来源 v/sessionCount/runCount/渠道点）+ 搜索 + 「从工作流创建」对话框（下拉已发布工作流 → createFromWorkflow → 跳详情）
- `src/renderer/src/views/app/AppDetail.vue`：对齐原型②——头部（图标/名称/启用 badge/开始会话/查看工作流）+ Tabs（概览/渠道/会话记录/版本）：渠道 Tab 四开关行（switch → updateChannels/enableShare/disableShare；分享令牌复制/重置；API 文档按钮 V1 占位；定时跳编辑器）；会话记录 Tab 列表 → 进入会话页
- 路由：`src/renderer/src/router/index.ts` 加 `/apps` `/apps/:id` `/apps/:id/session`（meta.title）
- 菜单：`src/renderer/src/config/menu.ts` 加「应用」（icon 📦，紧邻工作流）
- tab 命名：MainLayout pathTitleMap 静态兜底已由 meta.title 覆盖（无需改）

### 3.4 改动：REST resolveShare 应用优先
`src/web/server/api/workflow-api-router.ts`：
- `resolveShare` 先 `appDefinitions.getByShareToken(token)`（deps 增补 `appDefinitions?`），命中 → 包装成定义最小面（用 source_id 取 publishedGraph）+ 标注 `appMode:true`；未命中回退旧工作流令牌
- deps.getDeps() 生产端注入 `sub.appDefinitions`
门禁：`npx vitest run tests/unit/web/workflow-api-router.spec.ts`（补 2 用例：应用令牌命中/回退旧令牌）+ 组件挂载测试（AppList/AppDetail mock electronAPI）：渲染卡片数、渠道开关切换调对应 IPC、分享复制调 clipboard。

### ✅ 片3 验收
- 单测全绿 + tsc
- 手工：electron 环境建工作流→发布→列表点“发布为应用”→应用列表出现→详情开分享得到链接→开关会话→会话记录空

---

## 片 4：会话界面 + 共享卡片组件 + E2E

### 4.1 新建：共享卡片组件与组合式
- `src/renderer/src/components/workflow/SessionMessageCard.vue`：按 `metadata.card` 分派——StartFormCard（RunInputForm + 提交→appSession.start）/ ReviewCard（form→RunInputForm+submit；choose→选项按钮；approve/input→三按钮/编辑框；取消→review reject）/ ResultCard（message→markdown；report→渲染+长图内联+下载/导出PDF按钮）
- `src/renderer/src/composables/useWorkflowRunActions.ts`：doReview/doCancel/previewPdf（复用 reportToPdf+saveBlobAs）/openRunDetail
- 改造 `src/renderer/src/views/workflow/WorkflowRunDetail.vue`：审核按钮区与报告操作改用共享组件（消除重复；行为不变）

### 4.2 新建：会话页
`src/renderer/src/views/app/AppSession.vue`：对齐原型③——左侧会话列表（+ 新会话/重命名/删除）+ 主区消息流：
- onMounted：`messages(appSessionId)` 全量拉取渲染；订阅 `wf:run-event`（ipcRenderer.on / ws）按 runId 刷卡片
- 首条 start-form 卡片可展开重运行；底部输入框「发送」→ fill 参数（沿用 last）→ `app-session:start`
- 挂起 form 卡片的文件字段：`RunInputForm.setFileUploadContext({ runId: lastRunId, nodeId })`
路由 `/apps/:appId/session/:sessionId`（会话记录点进）+ `/apps/:id/session`（新建会话入口）

### 4.3 分享页托管
- `src/renderer/src/views/workflow/WorkflowGuestRun.vue`：路由改 `/app-share/:token`，数据面改调 `GET /api/app-share/:token`（新路由，或复用现有 share 路由但解析到 app）；触发 REST 分享 invoke 的 usePublishedGraph 语义保留
- `src/web/server/api/workflow-api-router.ts`：share 路由解析到 app 时走 `usePublishedGraph:true`（应用强制发布图）

### 4.4 E2E
新建 `scripts/e2e-app.cjs`（仿 e2e-form-pc，CDP 接管）：
1. 建工作流（start inputs 含必填 topic + form-collect 字段）→ 发布
2. `app:create-from-workflow` → 详情页开「会话」开关
3. 进入 AppSession → 首条 start-form 卡片渲染 → 填 topic 提交
4. run-status 卡片出现 → form-collect 挂起 → review 卡片渲染 → 上传文件（wf:form-upload）+ 下拉 → 提交
5. succeeded → 结果卡片渲染（长图/report 输出）
6. 会话记录页可见 runId → 点开运行详情

### ✅ 片4 验收
```bash
npx vitest run tests/unit/core tests/unit/web  &&   # 260+ 全绿（含既有回归）
npx electron-vite build                            # 构建零错
node scripts/e2e-app.cjs                           # 6 步全过
```
手工清单：会话卡片在应用刷新后仍完整（服务端消息持久化）；审核/表单交互在会话内完成；导出 PDF/下载长图落盘。

---

## 全局门禁（每片提交前）
1. `npx vitest run tests/unit/core tests/unit/web` 全绿（新片新增用例必须先红后绿）
2. `npx tsc --noEmit -p tsconfig.node.json` 无新增错误
3. 铁律自检：无字面量散落（全部走 shared 常量）、无字段映射（fromDto 直传）、双端 repository 实例化齐全、无重复实现（卡片/动作抽共享）
4. 每片一个提交，同步更新交付报告