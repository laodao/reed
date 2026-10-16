# 剧集制作 · M3 资产页 · 设计与实施计划

> 阶段 C。参考截图「项目资产页.png」。目标：三段式（左资产树 + 中央定妆影集 + 右资产助手）。
> 角色/地点/物品可切换；中央展示该资产的定妆图集（主图 + 派生多角度），支持 AI 生成主图/派生图。

## 1. 页面布局（对齐截图业务功能部分）
```
┌───────────────────────────────────────────────────────────┐
│ 工具条：左「角色定妆：Y酱」 中「正面全身|半身|…」(视图切换)  右「按需提货」│
├──────────────┬──────────────────────────────┬─────────────┤
│ 资产树         │ 中央选择资产的图集               │ 右侧资产助手    │
│ 资产：         │ ┌主图卡┐ ┌半身卡┐ ┌全景卡┐      │ agent         │
│  角色 N        │ │待生成/│ │已定妆│ │已定妆│      │               │
│   卖花少女 已定妆│ │已定妆│ │     │ │     │      │               │
│   Y酱      已定妆│ │镜头提示词│ │提示词│ │提示词│  │               │
│   杜十娘     待生成│ │[生成图片]│ ...  │ ...  │   │               │
│ 地点 N        │                              │               │
│ 物品 N        │                              │               │
└──────────────┴──────────────────────────────┴─────────────┘
```

## 2. 数据链路（复用现有后端，不写死）
### 2.1 加载
- 资产树：`asset.character.list(projectId)` / `location.list` / `item.list`。
- 选中资产：`asset.{kind}.get(id)` + `effective(id)`（生效数据 name/description/styleAnchors/referenceImagePath...）。
- 图集：`asset.image.listByAsset(kind, id)` 返回该资产所有图（category/main/view/expression/...）。
  **"已定妆"判定**：存在 `category='main'` 的图；其余角度图为空则显示"待生成"。

### 2.2 动作（按实际有图渲染，不写死角度）
- **生成主图**：`asset.image.generateMain({ assetType, assetId, prompt, negativePrompt?, referenceImagePath? })`。
  prompt 复用现有拼装函数（buildAssetIdentityPrompt + 类约束 append/merge）。
- **派生多角度**：`asset.derive.single/batch`（基于已有主图做参考，生成正面/半身/左右等变体）。
  仅在已有主图时可用（否则无参考，形象会漂移）——**按此约束渲染按钮**。
- **一键多角度（角色）**：`asset.character.generateThreeViews(...)`。
- **图片显示**：用 `toImageUrl(path)`（`@/utils/asset-url`）把相对路径转可显示 URL。

### 2.3 进度/刷新
- 监听 `episodeProduction.onImageProgress` 事件，显示生成中。
- 生成完成 → 重拉 `asset.image.listByAsset` 刷新图集。

## 3. 组件拆分（新增于 `src/renderer/src/components/episode-production/asset/`）
- `StageAssetView.vue`（业务组件，挂到 M0 工作台「资产」tab）：左树 + 中央图集。
- `AssetTree.vue`：左侧资产树（角色/地点/物品分组 + 选中态 + "已定妆/待生成"标注）。
- `AssetGallery.vue`：中央图集（主图卡 + 变体卡，每张有状态、提示词、生成按钮）。
- `AssetImageCard.vue`：单张图卡（预览 + 状态 + 提示词编辑 + 生成按钮）。
- `AssetHeader.vue`：工具条（左"定妆：XX" + 视图切换 + 按需提货）。

## 4. 联动
- 右侧 agent 生成定妆图后 `dataChanged(['assets'])` → 重拉资产树 + 图集。
- 选中资产变化 → 中央图集刷新。
- 角色/地点/物品切换 → 图集按 kind 加载。

## 5. 后端改动（Minimal）
- 全部复用现有 `asset.*` IPC，无新增后端。

## 6. 实施清单
- [ ] `AssetTree.vue`（资产树，含已定妆标注）。
- [ ] `AssetGallery.vue` + `AssetImageCard.vue`（图集 + 状态 + 生成）。
- [ ] prompt 拼装复用现有函数（buildAssetIdentityPrompt 等）。
- [ ] 生成主图/派生/一键多角度接线 + onImageProgress 进度。
- [ ] `StageAssetView.vue` 挂到「资产」tab；agent dataChanged 联动。
- [ ] 资产图片用 `toImageUrl` 显示。

## 7. 验收清单
- [ ] 资产页三段式正确；左树分组 + 选中态 + 已定妆标注。
- [ ] 选中资产显示其图集；无图显示"待生成"。
- [ ] 有主图 → 可派生多角度；无主图 → 只给生成主图（不误导）。
- [ ] 生成主图/派生 → 进度显示 → 完成后图集刷新。
- [ ] 右侧 agent「为角色XX生成定妆图」→ 图集刷新。
