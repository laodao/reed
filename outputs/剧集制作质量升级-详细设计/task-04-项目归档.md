# 任务 T04 · 项目归档

> Wave：W1（合并序第 1）｜估时：1–2 人日｜依赖：无
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §4 所列文件。
- **零迁移红线**：`video_projects.status` 列已存在（默认 `draft`），本任务只新增枚举值 `archived`；`deleted_at` 列保留给未来回收站，本任务不用。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

批量剧集生产中项目数迅速膨胀，需要归档能力保持进行中列表可用（DramaClaw 2.2：进行中/归档/回收站三态 + 排序）。

## 2. 功能设计

**后端**：
- `ep:list-projects-summary`（`project.handler.ts`）入参扩展：`archiveState?: 'active' | 'archived'`（缺省 active）、`sortBy?: 'updatedAt' | 'name'`（缺省 updatedAt）。active = `status != 'archived'`（兼容 draft 等现有值）。
- 新增 `ep:project:set-archived { projectId, archived: boolean }`：设置/取消 `status = 'archived'`。

**前端**（`views/EpisodeProjectListV3.vue`）：
- 顶部状态页签：进行中 / 已归档（默认进行中）。
- 排序下拉：按更新时间 / 按名称。
- 项目卡片"更多"菜单加"归档"（已归档页签中为"取消归档"），带确认。
- 首页 `EpisodeHome.vue` 的"最近项目"过滤掉 archived。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 修改 | `packs/episode-production/handlers/project.handler.ts` | 列表筛选/排序参数、`ep:project:set-archived` |
| 修改 | projects 汇总平台服务（经 project.handler 定位） | 查询条件与排序 |
| 修改 | `renderer/src/views/EpisodeProjectListV3.vue` | 页签/排序/卡片菜单 |
| 修改 | `renderer/src/views/EpisodeHome.vue` | 最近项目过滤 archived |
| 修改 | `renderer/src/stores/episode-production/project.ts` | archive action、列表查询参数 |
| 修改 | `src/shared/types/`（project 类型） | 查询参数类型 |

> 注意：W1 中 T02 不碰本任务文件；T01 亦无交集，合并顺序 T04 → T02 → T01 仅因文件量从小到大，便于 rebase。

## 4. 测试与验收

**单测**：列表查询——active 不含 archived；archived 只含 archived；两种排序正确；set-archived 双向。

**E2E**：`tests/e2e/web/10-episode-production.spec.ts` 增补用例：新建项目 → 归档 → 进行中列表消失 → 已归档页签可见 → 恢复。

**人工验收 AC**：
- AC1 归档后从进行中列表与首页最近项目消失
- AC2 已归档页签可见并可恢复
- AC3 排序切换生效
- AC4 回归基线全绿
