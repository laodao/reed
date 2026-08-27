# 内置工作流可修改 + 工作流版本管理 · 实施笔记

**日期：** 2026-08-27
**分支：** feat/workflow-engine
**模块：** workflow 定义（repository/service）、数据库迁移、IPC、编辑器 UI

## 用户需求

1. 内置工作流允许修改（此前禁改 + 迁移每次启动重置）
2. 工作流版本管理：发布记录历史版本，可恢复到历史版本

## 根因

| 问题 | 根因 |
| --- | --- |
| 内置工作流不能修改 | `WorkflowDefinitionRepository.update()` 硬编码 `if (existing?.isBuiltin) return existing` |
| 改了也被重置 | `create-builtin-apps.ts` 迁移每次启动无条件 `UPDATE` 覆盖内置图 |
| 无版本历史 | 发布只递增 `published_version`，旧图被覆盖，无快照表 |

## 实施内容

### 内置工作流可修改 + 不被迁移覆盖
- `workflow_definitions` 加 `template_version INTEGER DEFAULT 0`（迁移 `add-workflow-template-version.ts`，幂等；仅首次加列时存量 `is_builtin=1` 置 1；幂等补 is_builtin 列避免启动顺序问题）
- `WorkflowDefinitionRepository.update()`：去掉内置禁改；更新走**裸 `repo.update`**（内置行 user_id=NULL，scoped 在 Web 端命中 0 行——与 updateTriggersOnly 同纪律，保留 getById 可见性检查）；patch 含 `draftGraph`/`publishedGraph` 时自动 `templateVersion=0`（接管标记）
- `create-builtin-apps.ts`：INSERT/UPDATE 带 `template_version=1`；UPDATE 条件 `template_version != 0`（已接管跳过）；删除仍禁（内置是系统模板资产）

### 版本管理
- 新表 `workflow_definition_versions`（迁移 `create-workflow-definition-versions.ts`）：id / definition_id / version / name / description / category / graph / triggers / settings / note / created_by / created_at；索引 (definition_id, version DESC)
- `publish()` 成功后固化不可变版本快照（version=新发布版本号，含图/触发器/设置/名称/创建者；失败仅告警不阻断发布）
- Service：`listVersions(definitionId)`（降序；定义不可见返回空）、`restoreVersion(definitionId, versionId)`（快照应用为**当前草稿**，不发布；重新发布产生新版本）
- IPC：`wf:list-versions` / `wf:restore-version`（handler + preload + channel-map，双端生效）
- UI：WorkflowEditor 工具栏「历史版本」→ 版本列表对话框，每条「恢复到草稿」（确认后应用并重载画布）

### 修复的环境问题
- `better-sqlite3` 原生模块加载失败（ERR_DLOPEN_FAILED，被运行中 electron 占用）→ 停应用后 `npm rebuild better-sqlite3` 恢复，sqlite 测试可用

## 验证

| 测试 | 结果 |
| --- | --- |
| workflow-definition.repository（内置可改/接管标记/版本 CRUD） | 4 ✓ |
| create-builtin-apps（template_version + 接管后不被覆盖） | ✓ |
| workflow-definition-versions（publish 快照/list/restore） | 5 ✓ |
| workflow-definition-triggers / builtin-app-templates / daily-news-brief-flow / node-registry | ✓ |
| typecheck | 我的改动零新增错误（TS2589 用 any 中转解决；createHash/@ import 为外部并发既有问题） |

既有失败（与本任务无关）：tool.service/tool-call/yt-dlp、app.repository（AppUserPrefsEntity 测试 setup 缺失，HEAD 复现）。
