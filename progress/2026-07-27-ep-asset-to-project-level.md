# 剧集制作 - 资产入口迁移到项目级（2026-07-27）

## 背景

资产（角色/地点/物品/语音 binding）本就是项目级全局数据（按 projectId 聚合），
但入口藏在 episode 工作台的「② 资产」stage 里，每集都要切 tab 才能管理。

## 目标

- 资产入口从 episode 工作台「② 资产」stage → 项目列表页右侧顶部按钮
- 剧集工作台 stage 去掉「资产」，保留 4 个：内容剧本、分镜、制作、合成
- 后端 EpisodeStatus 机保留 asset_prep（不影响 status 流转/进度计算/数据迁移）

## 改动文件

### 新建
- `src/renderer/src/components/episode-production/project-list/ProjectAssetView.vue`
  - 封装 AssetStageViewV2 + 4 类资产 sub-editor + selectedAsset 状态切换 + 返回按钮
  - props: `projectId`、可选 `initialSelected`（支持剧本违例跳入定位）
  - 逻辑搬迁自 EpisodeWorkbench 资产 tab

### 修改
- `src/renderer/src/components/episode-production/stage-asset-v2/AssetStageViewV2.vue`
  - 加可选 prop `hideStageComplete`，项目级入口隐藏「完成本阶段」按钮
- `src/renderer/src/components/episode-production/project-list/EpisodeListPanel.vue`
  - 顶部 actions 加「资产」按钮，emit `open-assets`
- `src/renderer/src/views/EpisodeProjectListV2.vue`
  - 加 `viewMode`（episodes/assets）+ `assetInitialSelected` 状态
  - `watch route.query`：`?view=assets&kind=&binding=` 驱动视图模式（支持深链）
  - main-area `v-if` 切换 EpisodeListPanel / ProjectAssetView
  - `onOpenAssets` / `onBackToEpisodes` / `onSelectProject`（切项目清空定位）
- `src/renderer/src/views/EpisodeWorkbench.vue`
  - 删除「② 资产」el-tab-pane（AssetStageView + 4 sub-editor）
  - 删除 AssetSidebar 块、3 个 BindXxxDialog、AssetEditDrawer
  - 删除 selectedAsset / assetEditDrawer / openAssetEditDrawer / onAssetEditDrawerSaved
  - 删除 onCompleteAssetStage / onAssetSaved / onAssetBound / availableCharacters 系列
  - `onScriptGoAssetStage` 改造：`router.push('/episode-production', { query: { view: 'assets', kind, binding } })`
  - `WorkbenchStage` 去 `asset_prep`，`activeTab` 默认 `pending`
  - `watch status`：`asset_prep` 映射 `pending`
- `src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue`
  - SEGMENTS 删除「资产」段，`asset_prep` 并入「内容+剧本」段
  - 进度条 4 段：内容+剧本 / 分镜 / 制作 / 合成
- `src/renderer/src/composables/use-workbench-stage-navigation.ts`
  - `WorkbenchStage` 去 `asset_prep`，`toTabName` 加 `asset_prep` 映射
  - 删除 `onOpenAsset` / `onAddAsset`，input 去 `selectedAsset`

## 验证

- `eslint`：改动文件无新增 error（availableCharacters 已清理，顺手清理 onPreviewEpisode/onSelectStoryboard 解构）。EpisodeWorkbench 剩 7 个既存死代码 error（getShotTypeLabel / productionStoryboards / handleOpenDialog / getEpisodeStatusLabel/Type，V2 panel 删除后遗留，非本次引入）
- `typecheck`（vue-tsc）：TS6305 是 electron.vite.config.ts 既存配置问题；src 文件无本次引入的类型错误
- 时序：`watch route.query` immediate 设 `assetInitialSelected`，`selectProject` 不重置（由 `onSelectProject` 用户主动切项目时清空），保证 query 深链跳入定位 sub-editor 正确

## 未改动

- 后端 EpisodeStatus 机、资产 IPC/Service/Repository 全不动
- EpisodeWorkbench 既存死代码（getShotTypeLabel 等）未清理（非本次任务范围）
