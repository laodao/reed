# 近期工作 Review 报告（2026-08-18 ~ 2026-08-21，含逐条复核）

> 覆盖范围：`a5663e09..HEAD`（含 8-21 新提交 31348f4b / 23106a6c / 24585e72 / 49b87206）
> 方法：git 提交逐条审查 + 关键代码精读 + **第二轮逐条复核（本文件第三节）**
> 分支：feat/workflow-engine ｜ 单作者：renmadao

---

## 一、上次 review 结论回顾（8-18 ~ 8-21 凌晨）

三条主线：workflow 引擎增强（A+B/C1/C3/C4/C5/D1-D3/对抗 review 修复/E1）、app-module 应用模块（四切片 TDD）、质量基础设施（review 检查项六维标准）。

---

## 二、新提交逐条 review（a5663e09..HEAD，4 个提交）

### 1. `31348f4b` fix(app): 事件桥根因修复 —— ✅ 关闭 P0，根因链定位精准

**根因链（逐层定位）：**
1. `electron-event-emitter.ts` 用 `require('@core/context/user-context')` 动态加载——Rollup 无法解析别名，保留为运行时外部依赖，emit 进入 tap 分支即抛 `MODULE_NOT_FOUND`（被 `makeEngineDeps` 的 catch 吞掉）→ **tap 回调从未执行**。修复：改静态 import（user-context 仅依赖 async_hooks，无循环依赖）；`diary-export.service` 同类 require 一并收敛。
2. **终态误判**：run-status `'running'`（引擎启动时也 emit）被当终态 → 写错卡 + 提前删 runToSession 映射（后续事件全丢）。修复：新增 shared 常量 `WORKFLOW_RUN_TERMINAL_STATUSES`（单一事实源），事件桥与 web-api-router 本地集合一并收敛。
3. **写卡并发**：多卡 void 并发启动 → better-sqlite3 单连接多事务交错（后发 COMMIT 报 "no transaction is active"）。修复：`cardQueue` 串行 FIFO（失败隔离不阻断后续）。
4. `finishSucceeded` 误用 `getRun`（无 nodeRuns）→ 恒写占位；改用 `getRunDetail`。

**验证**：191 单测全绿；`scripts/e2e-app-session.cjs` 5 步全过（卡片序列 `start-form › run-status › node-status×6 › message` 正确）。

### 2. `23106a6c` feat(app): 分享页托管 —— ✅ 关闭 P1 分享断链

`/app-share/:token` 路由（name=AppShare，guest 免登录）复用 `WorkflowGuestRun.vue`，数据面纯 REST，后端 `resolveShare` 应用优先。路由单测 2 例。hash 模式与 `AppDetail.vue` 复制链接格式匹配。⚠️ Web 端全链路待 PG 恢复后实测。

### 3. `24585e72` fix(app): 片4 对抗 review 修复 —— ✅ 质量流程延续

R4 终态字面量 BLOCKER 收敛 / L5 日志分级与上下文 / M6 死 import，附 review 报告文档，195 测试全绿。

### 4. `49b87206` feat(db): SQLite 串行门（方案 E）—— ✅ 数据库层根治，含金量最高

Proxy 包装 `createQueryRunner`：事务整体临界区 + savepoint 深度计数直通 + 普通语句排队，仅 sqlite 生效；三处 DataSource 创建点全部经 `createDataSource`。实验验证（repro 脚本 + 对照组单测）。

---

## 三、逐条复核（第二轮，2026-08-21）

> 对报告中提出的全部问题逐条重新验证代码现状，标注：✅成立 / ⚠️修正 / ⬆️升级 / ⬇️降级 / ✅已解决。

### A. 已解决项复核（确认是否真的解决）

| # | 问题 | 复核结论 | 依据 |
|---|------|---------|------|
| A1 | P0 事件桥 tap 未触发 | ✅ 确认已解决 | 静态 import 生效（electron-event-emitter.ts:15）；终态判断 `WORKFLOW_RUN_TERMINAL_STATUSES.has()`；cardQueue 实现正确；RunServiceLike.getRunDetail 契约与测试 mock 同步 |
| A2 | P1 分享链接断链 | ✅ 确认已解决 | `/app-share/:token` 路由已注册（guest meta + 复用 WorkflowGuestRun）；hash 模式与链接格式匹配 |
| A3 | 终态字面量散落 | ✅ 确认已解决 | grep 全 src 无 `['succeeded','failed'...]` 数组字面量残留 |
| A4 | 日志噪音/上下文 | ✅ 确认已解决 | 命中/未命中均降 debug；enqueueCard 写卡失败日志带 sessionId |
| A5 | SQLite 事务交错 | ✅ 确认已解决 | 三处 DataSource 创建点（electron:406 / web:251 / 工厂）全部经 createDataSource；门仅 sqlite 生效 |

### B. 遗留项复核（逐条验证现状）

| # | 问题 | 复核结论 | 依据与修正 |
|---|------|---------|-----------|
| B1 | 🟠 runToSession 重启丢失 | ✅ 成立（维持 🟠） | workflow-boot 仅 recoverOnBoot（run 状态恢复），app-session.service 无任何 boot/恢复逻辑；runToSession 纯内存 Map，重启即丢 → 运行中重启后事件桥收不到终态事件，会话缺终态卡片（lastRunId 前端兜底仅显示状态）。边界场景非主路径，严重度维持 |
| B2 | 🟠 单会话删除能力缺失 | ✅ 成立（维持 🟠） | 全库 grep 无 `deleteSession`/`app-session:delete`；repository 仅有级联 `deleteByApp`；前端会话记录 Tab 无删除/重命名入口 |
| B3 | 🟠 测试状态需本地复核 | ✅ 维持（无法验证） | 沙箱限制（vitest 需 esbuild 子进程 spawn，EPERM）无法运行；提交声称 191/195 全绿需本地 `npm run test:unit` 复核 |
| B4 | 🟡 app-session.service 鸭子判定残留 | ✅ 成立（维持 🟡） | app-session.service.ts:129（listSessions）与 :141（getSessionMessages）仍 `as unknown as {...}` 绕过接口；listByApp/getByDialogId 应补进 AppSessionDeps |
| B5 | 🟡 report 卡片半成品 | ✅ 成立（维持 🟡） | AppSession.vue:55 仍 `{{ markdown }}` + :209 `pre-wrap` 纯文本；SessionMessageCard 组件不存在（grep 无结果）；与 WorkflowRunDetail 渲染重复未消除 |
| B6 | 🟡 前端 any 泛滥 | ✅ 成立（维持 🟡） | 三个 app 页面 api() 均为 `window as never as {...}` any 断言（AppList:70 / AppDetail:76 / AppSession:94,174）；decide()/decideWithForm() 不检查 review IPC 返回 success |
| B7 | 🟡 listApps N+1 | ✅ 成立（维持 🟡） | app-definition.service.ts:37 `items.map(app => countByApp(app.id))` 逐条查询（pageSize=100 时最多 100 次） |
| B8 | 🟡 dialog 双表同主键边角 | ⬆️ **升级为 🟠** | **新确认实际影响**：createSession 创建的 dialog（roleId=null）会混入对话页——`useChat.ts:73` `filter(d => !d.roleId)` 在"默认助手"下包含 app 会话 dialog 行；对话页打开后是卡片消息但无卡片渲染逻辑（空白/异常显示）。孤儿行风险仍在（dialog 建成后 session 创建失败） |
| B9 | 🟢 11 个历史失败测试 | ✅ 维持（无法验证） | 按 review 报告自述记录（VideoProjectEntity 等，与片4 无关），待本地清理 |

### C. 串行门相关复核（上轮新增项）

| # | 问题 | 复核结论 | 依据与修正 |
|---|------|---------|-----------|
| C1 | 🟡 串行门锁泄漏风险 | ⬇️ **降级为信息项（无风险）** | 全库排查：无裸 `createQueryRunner()` 手动事务路径（排除 base-repository/data-source/门本体后为空）；所有事务均经 `ds.transaction()` 包装（TypeORM 保证 finally 提交/回滚/释放，如 dialog.repository.ts:128）。锁泄漏仅在"手动 runner 事务 + 无 finally"场景才可能，当前代码无此路径。结论：风险不成立，移除问题 |
| C2 | 🟢 串行门读并发损失 | ✅ 成立（维持 🟢） | query 全走 `runExclusive`（只读也串行）；WAL 下读并发未利用。桌面单用户可接受，如未来 Web 多租户 SQLite 需注意 |
| C3 | 🟢 Web 端分享全链路未实测 | ✅ 维持（环境限制） | PG/Docker 不可用；路由托管层已单测覆盖 |

### D. 补充复核（上轮报告中其他点）

| # | 问题 | 复核结论 | 依据与修正 |
|---|------|---------|-----------|
| D1 | ai-nodes.ts:539 动态 import event.interface（曾关联 P0 双实例猜测） | ⬇️ **降级为 🟢 代码异味** | 事件桥已修复且 E2E 全通，主链路（workflow-run.service 静态 import）正常；该动态 import 仅 appNotifyNode 通知路径使用（notify 类型不在事件桥 switch 处理范围），未造成实际故障。Rollup 下大概率模块合并无双实例；dev（esbuild）行为未验证。建议统一静态 import 消除隐患 |
| D2 | createSession 忽略 startInputs 参数 | ✅ 成立（维持 🟡） | `_startInputs` 未使用，IPC 透传但实现丢弃，与计划"创建+首轮参数"意图不符 |
| D3 | 迁移幂等只查表不查索引 | ✅ 成立（维持 🟢） | create-apps-tables.ts 表存在即跳过索引创建（半失败场景索引缺失不补建） |
| D4 | AppList pageSize:100 字面量 | ✅ 成立（维持 🟢） | R4 已收敛卡片常量，此处遗漏（同 AppDetail 无分页） |
| D5 | quickInput 键名与 schema 不一致 | ✅ 成立（维持 🟢） | `{quickInput: text}` 为临时交互，建议标注或对齐 start 表单字段 |

---

## 四、问题清单终版（截至复核完成）

### 已解决（全部确认）
- ✅ P0 事件桥 tap 未触发（31348f4b）
- ✅ P1 分享链接前端断链（23106a6c）
- ✅ 终态字面量散落 / 日志噪音 / SQLite 事务交错（24585e72 / 49b87206）

### 遗留项修复记录（2026-08-21 第二轮，本次全部落地）

> 验证：后端 `npx tsc --noEmit -p tsconfig.node.json` 通过；前端 vue-tsc 本次改动文件零错误
> （唯一报错 TS6305 为预存 electron.vite.config 引用问题，与改动无关）；
> vitest 因沙箱限制（esbuild spawn EPERM）无法本会话运行，需本地复核。

| # | 问题 | 修复 | 涉及文件 |
|---|------|------|---------|
| 1 | 🟠 dialog 混入对话页 | createSession 的 dialog 带专属 roleId 标记 `APP_SESSION_DIALOG_ROLE_ID`（对话页按 roleId 过滤即隔离）；app_session 创建失败清理孤儿 dialog；startInputs 落 lastStartInputs | app.types.ts / app-session.service.ts |
| 2 | 🟠 runToSession 重启丢失 | AppSessionService.recoverOnBoot()：running 会话终态补写（succeeded 聚合结果卡/failed 错误卡）、非终态重建映射、无 run 归 idle；workflow-boot 在引擎 recover 后接线 | app-session.repository.ts（listByStatus）/ app-session.service.ts / workflow-boot.ts |
| 3 | 🟠 单会话删除缺失 | deleteSession（running 拒绝 + 级联删 dialog/messages）+ IPC `app-session:delete` + preload/channel-map 三处接线 + 前端会话记录 Tab 重命名/删除入口 | app-session.service.ts / app.handler.ts / preload / channel-map / AppDetail.vue |
| 4 | 🟡 鸭子判定残留 | listByApp/getByDialogId 补进 AppSessionDeps 接口，`as unknown as` 移除 | app-session.service.ts |
| 5 | 🟡 report 卡片半成品 | 新建 SessionMessageCard.vue 共享组件（六类卡片分派 + marked markdown 内联渲染），AppSession.vue 收敛为消息流容器 | SessionMessageCard.vue / AppSession.vue |
| 6 | 🟡 前端 any / review 失败静默 | 新建 electron-api.ts 类型化 API（AppRecord/AppSessionRecord/Message 契约）；三页收敛 api()；review/decide 检查 resp.success 失败提示 | electron-api.ts / AppList/AppDetail/AppSession.vue |
| 7 | 🟡 listApps N+1 | AppSessionRepository.countByAppIds（一条 GROUP BY）；listApps 整体聚合 + 失败降级 | app-session.repository.ts / app-definition.service.ts |
| 8 | 🟢 createSession 忽略 startInputs | 落库 lastStartInputs（见 #1） | app-session.service.ts |
| 9 | 🟢 迁移索引幂等 | `CREATE ... IF NOT EXISTS` 补建（表存在索引缺失也能补齐） | create-apps-tables.ts |
| 10 | 🟢 pageSize 字面量 / quickInput 键名 | LIST_PAGE_SIZE 常量；quickInput 注释说明自由文本兜底语义 | AppList.vue / AppSession.vue |
| 11 | 🟢 ai-nodes 动态 import | 改静态 import（统一事件发射器实例，防双实例分离） | ai-nodes.ts |
| 12 | 测试补齐 | app-session.spec 新增 11 例（roleId 标记/startInputs/孤儿清理/deleteSession×3/recoverOnBoot×4）；app-definition.spec 适配 countByAppIds | app-session.spec.ts / app-definition.spec.ts |

### 修复后仍需人工确认
1. 🟠 **本地跑测试**：`npm run test:unit`（沙箱无法运行，预期 app/workflow 约 200 例全绿）
2. 🟠 本地跑 `scripts/e2e-app-session.cjs` 回归（Electron dev 实例需带新代码重启）
3. 🟢 Web 端分享页全链路（PG/Docker 恢复后）
4. 🟢 11 个历史失败测试（VideoProjectEntity 等）清理

---

## 五、结论与建议

**总体评价**：上轮 P0/P1 硬阻塞全部当天闭环且质量高（事件桥根因链定位精准、SQLite 串行门数据库层根治 + 实验验证）。本轮逐条复核确认：5 项"已解决"全部属实；遗留项中 **dialog 混入对话页升级为 P1（新确认的实际影响）**，**串行门锁泄漏风险经全库排查不成立（移除）**，ai-nodes 动态 import 降级为代码异味。

**修复完成**：遗留 11 项问题全部落地（后端 6 项 + 前端 4 项 + 小项 2 项 + 测试 2 项），后端 tsc 通过、前端 vue-tsc 本次改动零错误；测试与 E2E 需本地运行复核（沙箱限制）。
