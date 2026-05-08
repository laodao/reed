# 剧集制作 UI 重构 · 实施笔记

**日期：** 2026-05-08
**分支：** feat/episode-production-redesign
**spec：** docs/superpowers/specs/2026-05-08-episode-production-redesign-design.md
**plan：** docs/superpowers/plans/2026-05-08-episode-production-redesign.md

## 实施概览

14 个 task 全部实施完成。commits 列表（1a6a95e..HEAD）：

```
da4aaa9 chore(ep): 删除已弃用的 StageProgressBar 和 BottomTimeline 组件
d61ccbd feat(ep): 路由+Workbench重构-极简header+按episodeId选集
bb8b72a feat(ep): 重写 EpisodeProjectListV2 为两栏布局 + 迁入 3 个 dialog
85b3f6f feat(ep): 新增 EpisodeCard / ProjectSidebar / EpisodeListPanel 三个 project-list 组件
66b0089 feat(ep): 新增 StageHeaderBar 极简文字版 stage 栏
fd855c5 feat(ep): project store 新增 lastSelectedProjectId 持久化
93d6b6a style(ep): 对齐 listEpisodesWithProgress handler/preload 注释 + 卫语句风格
8985e29 feat(ep): 新增 ep:list-episodes-with-progress IPC + preload 暴露
683dd7d fix(ep): listEpisodesWithProgress 补项目存在性检查 + 测试硬化
6a17639 feat(ep): ProgressCalculator 新增 listEpisodesWithProgress 聚合方法
e8a02cd docs(ep): 补全 STAGE_LABEL_FOR_STATUS 注释中 STAGE_LABELS 的模块路径
8cbed39 feat(ep): 新增 EpisodeWithProgress 类型 + STAGE_LABEL_FOR_STATUS 映射
```

## 自动化验证

### typecheck
- 结果：仅 `electron.vite.config.d.ts` 一个已知白名单错误，无新增类型错误。

### lint
- 错误数：428 errors（全部为历史存量，本次 3 个新 spec 文件零 lint 问题）
- 警告数：4620 warnings（历史存量）
- 新增 spec 文件：`EpisodeCard.spec.ts` / `ProjectSidebar.spec.ts` / `EpisodeListPanel.spec.ts` 均无 lint 问题

### unit test
- 3 个新 spec 结果：**15/15 PASS**（EpisodeCard 4 个 + EpisodeListPanel 6 个 + ProjectSidebar 5 个）
- 全量 unit test（SKIP_PG_TESTS=1）：**785 passed，8 failed，1 skipped**（共 794 个测试）
- 8 个失败全部为历史存量，原因为 `EntityMetadataNotFoundError: No metadata for "VideoProjectEntity"`，与本次改动无关（在本次 commit 之前即已存在）
- 失败文件列表：
  - `tests/unit/repositories/multi-tenant.spec.ts`（1 fail）
  - `tests/unit/repositories/video-subsystem.repository.spec.ts`（1 fail）
  - `tests/unit/episode-production/assets/character-asset.service.spec.ts`（2 fail）
  - `tests/unit/episode-production/assets/item-asset.service.spec.ts`（3 fail）
  - `tests/unit/episode-production/assets/location-asset.service.spec.ts`（1 fail）

## 已知偏离 plan 的地方

- Task 1：import 路径 `./index` → `./workflow.types`（避免 barrel 循环引用）
- Task 2：sqlite test helper 路径修正（plan 给的不存在）+ 用 createTestDataSource 替换本地 buildDb
- Task 3：handler 卫语句 + 注释格式对齐同文件样板
- Task 9：preload API 名 `providers.listUserConfigs` → `providerConfig.list`（plan 给的 API 不存在）
- Task 11：顺手清理 EpisodeWorkbench.vue 中已无引用的 import（workbenchStore / icons / ElMessageBox 等）

## 待 user 手动验证（自动化覆盖不到）

- [ ] PC dev 端 E2E：项目列表 → 选项目 → 新建集 → 点集 → 工作台 → stage 切换 → 返回保选中
- [ ] 暗色主题切换无写死颜色
- [ ] Web 端验证（PGDATABASE=the_bot_test npm run dev:web）
- [ ] 截图归档（项目界面 / 制作界面，亮 + 暗 4 张）

## 后续优化建议（非阻塞）

- listEpisodesWithProgress 后端 N+1（注释已说明）：单项目 30+ 集时考虑下沉 SQL 聚合
- progress.store 与 episode.store 持久化常量命名不统一（LAST_SELECTED_PROJECT_KEY vs LAST_SELECTED_STORAGE_KEY）
