# 任务 T01 · 资产历史分组 + 写回影响范围提示

> Wave：W1（合并序第 3）｜估时：3–5 人日｜依赖：无
> 被依赖：T07 精修工作台复用本文的 `AssetWriteImpactDialog` 组件
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §4 所列文件。
- **零迁移红线**：本任务不允许新增任何迁移——历史数据已在 `asset_image` 多行累积中。
- **DoD / 报告 / 禁止事项**：见 README §6。

## 1. 背景与目标

资产是每一帧画面的输入：角色/地点主图被一次失败的重新生成覆盖且无法回滚时，劣化是全片性的。`asset_image` 已多行累积 + "设为主图"（manual §8.2）构成隐式历史，本任务补齐两件事：① 画廊显式"历史"视图与恢复操作；② 高危覆盖操作前的影响范围提示（DramaClaw 9.9 写回设计的核心：让用户在覆盖前知道爆炸半径）。

## 2. 功能设计

### 2.1 后端：引用统计服务

新增 `src/core/platform/episode-production/assets/services/asset-reference.service.ts`：

```
getWriteImpact(assetType: 'character'|'location'|'item', assetId) -> {
  storyboardCount: number
  episodeCount: number
}
```

统计口径（**2026-10-13 review 修正：按真实 schema**）：
- character：`storyboard_characters` 表按 **`character_id`** 列计数（`storyboard-character.entity.ts:22`，实现时确认其引用语义是否等价于 character_bindings.id）+ `scene_characters` 按 **`character_binding_id`** 计数——该列**可 null**（实体注释："null 表示老剧本未迁移"，`scene-character.entity.ts:26-29`），null 行不计入并在 detail 标注"含未迁移老数据"；两路去重到 storyboard 粒度
- location / item：`storyboards` 表 **`locationBindingIds` / `itemBindingIds`（simple-json 数组，可多值）**（`storyboard.entity.ts:57-65`）——**不做 SQL JSON 包含查询**（SQLite json1 / PG jsonb 方言差异），改为"按 assetId 取候选分镜行后应用层过滤数组包含"，双方言安全
- **估算口径声明**：本统计不含 `reference_overrides`（图片级引用）与 scene_scripts 场景级引用，结果为估算值；UI 文案一律用"**约** N 个分镜（M 集）引用"，不使用绝对化表述

### 2.2 前端

1. 三处画廊编辑器（`stage-asset/character/CharacterGalleryEditor.vue`、`stage-asset/location/LocationGalleryEditor.vue`、`stage-asset/item/ItemGalleryEditor.vue`）：
   - 每个分类分组头部加"历史 (N)"折叠区：按 `createdAt desc` 列出该分类全部行（现 `getImagesByCategory` 已返回全部行，`CharacterGalleryEditor.vue:686`），当前主图行加徽标；行操作沿用既有"设为主图/预览"。
2. 新增共享组件 `shared/AssetWriteImpactDialog.vue`：props `{ assetType, assetId, action }`；打开时调 `ep:asset:get-write-impact`，文案："该{角色|地点|物品}主图当前被**约** N 个分镜（M 集）引用，替换后新生成画面将使用新图；历史图保留，可在'历史'中恢复。"确认后 emit 执行原操作。
3. 触发点：三处画廊的**设为主图**与主图**重新生成**。挑图写回单分镜（`reference_overrides`）不弹（影响面=单镜头，低风险）。

## 3. 交互流

```
用户点击"设为主图" → 前端调 ep:asset:get-write-impact
  → storyboardCount === 0 → 直接执行
  → storyboardCount > 0  → 弹 AssetWriteImpactDialog → 确认 → 执行原设主图 IPC
```

## 4. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `platform/episode-production/assets/services/asset-reference.service.ts` | 引用统计 |
| 新增 | `packs/episode-production/handlers/asset/asset-reference.handler.ts` | `ep:asset:get-write-impact` |
| 修改 | `packs/episode-production/handlers/asset/index.ts` | 注册 |
| 新增 | `renderer/src/components/episode-production/shared/AssetWriteImpactDialog.vue` | 确认弹窗 |
| 修改 | 三处 GalleryEditor（路径见 §2.2） | 历史分组 + 弹窗接入 |
| 修改 | `renderer/src/stores/episode-production/asset.ts` | impact 查询 action |
| 修改 | `src/shared/types/`（EP 资产类型文件） | impact 返回类型 |

## 5. 测试与验收

**单测**：`asset-reference.service.spec.ts`——N 个分镜引用的角色计数正确；无引用返回 0；location/item 的 JSON 数组包含判断（应用层过滤）正确；`character_binding_id` 为 null 的老数据不计入且 detail 标注；user 隔离。

**集成**：同一角色同分类生成 3 图 → 历史区 3 行 → 切主图 → 新派生图使用新主图（派生图约束链路见 `docs/manual/episode-production.md` §3.2.4）。

**人工验收 AC**：
- AC1 同分类多次生成后，历史区可见全部历史行并标注当前主图
- AC2 替换被 ≥1 分镜引用的主图弹确认，N/M 数值正确；无引用直接执行
- AC3 历史图设为主图可恢复旧版本，恢复后新生成使用旧图
- AC4 PC/Web 双端行为一致
- AC5 回归基线（00 §6）全绿
