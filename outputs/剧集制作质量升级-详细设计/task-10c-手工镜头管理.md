# 任务 T10c · 手工镜头管理补齐

> Wave：W3（合并序第 3）｜估时：3–5 人日｜依赖：无硬依赖（建议在 T06 后：T06 也会改 storyboard 卡片组件，W3 时其改动已合入）
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §3 所列文件。
- **实现前核对**：先确认 `ep:storyboard:delete` 与顺序调整 handler 是否已存在（grep `handlers/narrative/` 与 `storyboard` 相关 handler）；已存在的只补 UX，不存在的按本文新增。核对结论写入报告。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

叙事完整性缺口（缺反应镜头/过渡镜头）直接拉低成片观感。手工**插入**已实现（`narrative/storyboard-insert.ts` 串行门），本任务补齐**删除 + 同场景内顺序调整**，并对齐 DramaClaw 8.3 的"删除后编号重排"体验。

## 2. 功能设计

- **重排服务**：从 `storyboard-insert.ts` 的重排语义抽出共用函数 `renumberScene(sceneId)`（插入与删除/移动共用，保证单一编号语义）；新增 `narrative/storyboard-reorder.service.ts` 提供 `deleteStoryboard(id)`（级联清理该分镜关键帧/音频/视频关联，软删或硬删与现有生成物清理策略一致）与 `moveStoryboard(id, targetIndexInScene)`。
- **关联一致性**：删除/移动后该分镜已生成的关键帧、`reference_overrides`、音频、视频记录的归属保持正确（跟随分镜 id 移动；删除则一并清理）。
- **前端**：分镜卡"更多"菜单加"删除 / 上移 / 下移"（同场景内）；删除弹确认："删除后编号自动重排，该镜头已生成的关键帧/音频/视频将一并移除。"操作完成后网格与时间线即时刷新。

## 3. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 修改 | `platform/episode-production/narrative/storyboard-insert.ts` | 抽出共用 `renumberScene` |
| 新增 | `platform/episode-production/narrative/storyboard-reorder.service.ts` | delete / move + 级联清理 |
| 修改 | 分镜相关 handler（`handlers/narrative/`，定位见执行须知） | `ep:storyboard:delete` / `ep:storyboard:move`（若无） |
| 修改 | `renderer/src/components/episode-production/storyboard/`（分镜卡菜单所在组件，T06 徽标改动之后合入） | 菜单项 + 确认弹窗 + 刷新 |
| 修改 | `src/shared/types/` | 如需 |

## 4. 测试与验收

**单测**（`storyboard-reorder.service.spec.ts`）：
- 删除中间分镜后编号连续、同场景其余分镜关联记录不变
- move 后序号正确且关联记录跟随
- 插入（既有 `insertStoryboardIn`）+ 删除 + 移动混合操作后无脏序号

**集成**：含已生成关键帧/音频的分镜删除 → 关联记录被清理，时间线与合成预览正常。

**人工验收 AC**：
- AC1 删除中间分镜编号重排正确，确认文案准确
- AC2 上移/下移后网格与时间线同步
- AC3 混合操作无脏数据
- AC4 回归基线全绿
