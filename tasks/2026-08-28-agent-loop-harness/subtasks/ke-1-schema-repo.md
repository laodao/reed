# KE-1 · 知识飞轮数据模型与仓库（M-Ke1 前半）

> 前置：无（KE 轨起点）。纯后端+迁移，零模型成本。

## 改动

| 文件 | 内容 |
| --- | --- |
| `src/core/database/entities/agent-memory-entry.entity.ts` | +`biz_module`/`project_id`（NULL=用户级）+`content_hash`+`embed_model` 列；组合索引 (user_id,status,biz_module,project_id)；contentJson.source 字段约定 |
| `src/core/database/migrations/` | 新迁移（**双端注册**：electron/database/index.ts 与 web/server/index.ts 两序列；SQLite/PG 双方言 DDL——create-agent-memory-entries.ts 同文件两套先例） |
| `src/core/database/repositories/agent-memory-entry.repository.ts` | +`listActiveByScope(userId, {bizModule?, projectId?})`（或 listActive+内存过滤，量级注释已声明可接受）；Row/DTO/create 入参加新字段 |
| `src/core/platform/agent-runtime/memory/memory-flywheel.ts` | +`addManual`（手工录入，默认 pending）+`deactivate`（后端现仅有 approve/archive，无驳回——评审 P2-7）；distill 打标 scope（任务归属从 task.runtimeContext 取） |
| `src/core/packs/workflow/handlers/agent-tasks.handler.ts` | +`am:add-manual`/`am:deactivate` 通道 |

## 测试

- 迁移双端跑通（SQLite+PG 方言各断言一次表结构）
- scope 过滤查询单测（L1/L2/L3 互不可见；租户隔离强制用例）
- 手工录入默认 pending、deactivate 幂等

## 验收

迁移在双端启动时自动执行；新列读写全链路打通；既有数据（两列 NULL）语义不变零迁移。
