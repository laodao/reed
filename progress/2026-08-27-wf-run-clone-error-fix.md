# 工作流试运行 "An object could not be cloned" 修复 · 实施笔记

**日期：** 2026-08-27
**分支：** feat/workflow-engine
**模块：** `src/renderer/src/components/workflow/RunInputForm.vue`、`src/renderer/src/utils/plain-data.ts`

## 背景问题（用户反馈）

运行「每日热点早报」工作流（编辑器 → 试运行）报错：

```
Uncaught (in promise) Error: An object could not be cloned.
    at debugRun (WorkflowEditor.vue:406:24)
```

## 根因分析

报错点 `WorkflowEditor.vue:406` 是 `api().startRun({ definitionId, inputs })`，其中 `inputs` 来自
`RunInputForm.getValues()`。

1. **Electron IPC 用 V8 structured clone 序列化参数**（`ipcRenderer.invoke` 内部），遇到 Proxy 对象
   抛 `DataCloneError: An object could not be cloned`（Node/V8 验证：`structuredClone(new Proxy(...))` 必抛）。
2. **`getValues()` 从 Vue `reactive` 对象取值**：`values` / `modelSelections` / `listChecked` 均为
   `reactive()`，从中取出的数组与对象仍是 **reactive 深层 Proxy**：
   - 「每日热点早报」start 输入中的 `sourceIds`（多选 select-dynamic）→ Proxy 数组；
   - 文件字段值 `{ path, name, text }`、`list-check` 的 `items` 行、model 值等对象同理。
3. 这些 Proxy 值直接作为 `startRun` 参数进入 IPC → 克隆失败，且因 `debugRun` 是 async 函数，
   同步抛错被包装成 rejected promise，呈现为 "Uncaught (in promise)"。

`WorkflowList.confirmRun`、`WorkflowRunDetail.submitForm`、`SessionMessageCard`（app-session
start/review 表单）复用同一 `getValues()`，存在同样隐患。

## 实施方案

1. **新增纯工具 `src/renderer/src/utils/plain-data.ts`**：`toPlainData(value)` 把可能含 Vue reactive
   代理的值转回普通 JSON 数据（原始值原样返回），供跨进程传输前统一纯化。
2. **`RunInputForm.getValues()` 出口统一 `return toPlainData(out)`**：一处修复覆盖全部 4 个调用方
   （编辑器试运行、列表页运行、运行详情表单审核、会话 start/review 表单）；web 端经
   `JSON.stringify` 无此问题，统一处理后行为一致。

## 自动化验证（TDD）

- 新增 `tests/unit/renderer/utils/plain-data.spec.ts`（4 用例）：
  - 原始值（string/number/boolean/null/undefined）原样返回；
  - **reactive 数组/对象 `structuredClone` 必抛**（bug 前置条件回归）；
  - `toPlainData` 输出为普通数据且可被 `structuredClone` 克隆；
  - 空对象/空数组保持结构。
- 结果：`plain-data.spec.ts` 4 passed；`tests/unit/renderer` 套件 33 passed，
  3 个失败文件（app-list / StageHeaderBar / StageHeaderBar-merged，均报
  `Failed to resolve component: el-input`）经 `git stash` 验证为 **HEAD 既有失败**，与本次改动无关。
- 类型检查：改动文件无类型错误；`src/web/server` 下 `workflow-api-router.ts` / dotenv 报错为既有问题
  （`git diff HEAD -- src/web/server` 为空）；`electron.vite.config.ts` 的 TS6305 为 composite 产物缺失
  的既有配置问题。

## 追加：运行历史「重跑」同根因报错修复（同日）

### 用户反馈

运行历史页点「重跑」按钮，之前表现为「没什么反应」（IPC reject 被静默吞掉，未捕获）；
补上 `catch` 后暴露真实错误：`重跑失败：An object could not be cloned.`

### 根因

`handleRerun(row)` 直接取 `row.startInputs` 作为 `startRun` 参数。`row` 来自 `runs = ref([])`，
经 `load()` 赋值后整条行数据被 Vue 包成 **reactive Proxy**；`row.startInputs` 取出的对象/数组
仍是 Proxy，进 Electron IPC（V8 structured clone）必抛 `DataCloneError`。
与 RunInputForm 修复为同一根因，只是「纯化」发生在调用处而非表单出口。

### 修改

`src/renderer/src/views/workflow/WorkflowRunsHistory.vue`：

1. `import { toPlainData } from '../../utils/plain-data'`
2. `handleRerun` 中 `inputs: toPlainData(row.startInputs ?? {})`

其余 `startRun` 调用点（WorkflowList.confirmRun、WorkflowEditor.debugRun、WorkflowRunDetail
submitForm）的 `inputs` 均来自 `RunInputForm.getValues()`，其出口已 `toPlainData`，无需改动。

### 验证

- HMR 编译通过（dev 日志 `hmr update /src/views/workflow/WorkflowRunsHistory.vue`）；
- 复用既有 `plain-data.spec.ts`（4 用例）覆盖纯化逻辑，未新增重复用例。

## 追加：发现独立既有 bug —— settings 表 schema 漂移（未修复，待用户确认）

排查过程中在 dev 日志发现 `保存设置失败: NOT NULL constraint failed: settings.id`（切换皮肤时触发）。

**根因：** 自定义数据路径库 `C:\Users\daoge\the-bot\the_bot.db` 中 `settings` 表是旧版 schema：

```
id TEXT PRIMARY KEY NOT NULL, key TEXT, value TEXT, created_at, updated_at, deleted_at,
user_id, category, description
```

而当前 `SettingsEntity`（src/core/database/entities/settings.entity.ts）以 `key` 为主键；
TypeORM 生成的 `INSERT INTO settings(key, value, updated_at)` 不含 `id` → NOT NULL 约束失败。
`CREATE TABLE IF NOT EXISTS` 不会重建已存在的旧表，导致 schema 永久漂移。

**候选修复方案（待确认）：** 启动迁移时检测旧表（`PRAGMA table_info(settings)` 含 `id` 列）
→ 建新表 `settings_new(key TEXT PRIMARY KEY, value TEXT, updated_at ...)` → 拷贝旧数据
（key/value/updated_at 对应列）→ 删旧表重命名，保持幂等。数据不丢失、覆盖 web/electron 双平台。

## 追加 2：settings schema 迁移（方案 A）已实施并生效

### 澄清（用户指出「设置功能不是一直在用吗」）

用户说得对：**设置功能一直正常**。旧表已存在的键（theme/language/fontSize 等）走 TypeORM
`repo.save` 的 **UPDATE** 分支，一直成功（theme 的 updated_at 更新到 2026-08-27 16:20 即证据）；
只有**第一次保存的新键**（如皮肤 skin）走 INSERT 分支，因缺 id 而失败。所以症状是
「新增设置项保存失败」，而非「设置整体不可用」。

### 实施（方案 A：启动时表重建迁移）

1. 新增 `src/core/database/migrations/migrate-legacy-settings-table.ts`：
   - 纯函数 `migrateLegacySettingsTable(db)`，接受最小 sqlite 接口 `{exec, prepare}`；
   - 检测 settings 表含 `id` 列（旧 schema 特征）→ 单事务内建 `settings_new(key 主键,
     value, updated_at)` → 拷贝 key/value/COALESCE(updated_at) → DROP 旧表 → RENAME；
   - 幂等：迁移后无 id 列直接跳过；无表/新表同样跳过；失败回滚并抛出。
2. `src/electron/database/index.ts`：import 该函数，initTables 中 settings CREATE 之后
   立即调用（try/catch 包裹，失败仅记日志不阻断启动）。
3. 测试 `tests/unit/core/database/migrate-legacy-settings-table.spec.ts`（5 用例）：
   旧表迁移、数据保留（含 NULL updated_at 补默认值）、幂等、新表跳过、无表跳过。
   **用 node:sqlite（DatabaseSync）** 构造内存库，避免 better-sqlite3 ABI 切换；
   `vitest.config.ts` 增加 `server.deps.external: ['node:sqlite']` 使其不被 vite-node 转换，
   并经 `process.getBuiltinModule('node:sqlite')` 获取（vite-node 内置模块表不含它）。
   结果：5/5 通过。

### 真实库验证（WAL 模式注意）

- 迁移在 electron 主进程 watch 重启（0:28:36）时自动执行：settings 表变 `key(PK), value,
  updated_at`，9 行数据完整保留。
- **坑**：DB 是 WAL 模式，`Copy-Item` 复制主文件不包含未 checkpoint 的 wal，
  会看到旧 schema 假象；必须直接打开原库（readOnly 并发读）或连 wal 一起复制。
- 模拟 TypeORM 新键 INSERT（`INSERT INTO settings(key,value,updated_at) VALUES('_probe_key',...)`
  不含 id 列）在迁移后成功 → 皮肤等新键保存路径已修复。

### 待用户验证

重启应用（pc:dev 已自动重启）后切换皮肤/修改任意设置，应不再出现「保存设置失败」。
另：workflow-definition.repository.spec.ts 的 5 个失败为 better-sqlite3 ABI 冲突
（应用 Electron 119 vs vitest Node 127）所致，属既有约束，非本次改动引入。
