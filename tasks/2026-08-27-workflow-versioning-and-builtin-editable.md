# 内置工作流可修改 + 工作流版本管理 · 设计

**日期：** 2026-08-27
**分支：** feat/workflow-engine
**模块：** workflow 定义（repository/service）、迁移、IPC、编辑器 UI

## 用户需求

1. 内置工作流允许修改（当前禁改 + 迁移每次启动重置）
2. 工作流版本管理：发布记录历史版本，可恢复到历史版本

## 现状根因

| 问题 | 根因 |
| --- | --- |
| 内置工作流不能修改 | `WorkflowDefinitionRepository.update()` 硬编码 `if (existing?.isBuiltin) return existing`（禁改） |
| 改了也会被重置 | `create-builtin-apps.ts` 迁移每次启动 `UPDATE ... WHERE id=?` 无条件覆盖内置图 |
| 无版本历史 | 发布只递增 `published_version`，旧图被覆盖，无快照表 |

## 方案

### A. 内置工作流可修改 + 不被迁移覆盖
1. `workflow_definitions` 加 `template_version INTEGER DEFAULT 0`（新迁移，幂等）：
   - 存量 `is_builtin=1` 行置 1（仅迁移首次执行时）
   - 用户保存草稿 / 发布内置工作流 → `template_version = 0`（标记"已接管"）
2. `WorkflowDefinitionRepository.update()`：去掉内置禁改；**更新走裸 `repo.update`**（内置行 user_id=NULL，scoped 在 Web 端会命中 0 行——与 updateTriggersOnly 同纪律），保留 `getById` 可见性检查；patch 含 `draftGraph`/`publishedGraph` 时自动 `templateVersion=0`
3. `create-builtin-apps.ts`：INSERT/UPDATE 带 `template_version=1`；UPDATE 条件 `template_version != 0`（已接管跳过）；删除仍禁（内置是系统模板资产）
4. 内置工作流可发布、可改触发器（触发器本就可改）

### B. 版本管理（发布快照 + 恢复）
1. 新表 `workflow_definition_versions`（新迁移）：id, definition_id, version, name, description, category, graph(JSON), triggers, settings, note, created_by, created_at；索引 (definition_id, version DESC)
2. `publish()` 成功后写版本快照（version=新 publishedVersion）
3. 服务方法：
   - `listVersions(definitionId)` → 版本摘要列表（版本号/时间/备注/名称）
   - `restoreVersion(definitionId, versionId)` → 版本快照应用为**当前草稿**（draftGraph/triggers/settings，不发布；重新发布产生新版本，历史版本不可变）
4. IPC：`wf:list-versions` / `wf:restore-version`（preload + channel-map + web router 同步）

### C. UI（WorkflowEditor）
- 工具栏加「历史版本」按钮 → 对话框：版本列表（vN / 时间 / 备注），每条「恢复到草稿」；恢复后重新加载图（dirty 提示保存）
- WorkflowList 内置行保留「内置」标签（可编辑）

## 测试
- repository：内置 update 生效 / templateVersion 接管标记 / 版本 CRUD
- service：publish 写版本快照 / listVersions / restoreVersion 应用到草稿
- create-builtin-apps 迁移：接管后不再被模板覆盖
- 回归：现有 workflow 测试

## 生效
- 迁移幂等；重启应用自动建表/加列；内置工作流编辑保存后不再被模板重置
