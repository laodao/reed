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

## 验证中发现并修复的问题

- **Task 3 漏改 web channel-map**（commit `6ee6735`）：新加 IPC 只在 preload 注册了
  渲染层 API，但 web 端有独立桥接 `src/web/client/channel-map.ts`，必须同步注册才能让
  Web 调用走对正确 channel。Plan 没列这个文件，review 也没覆盖到——后续新增 IPC 时
  必须把 channel-map 同步加到 plan 清单。

## 已知偏离 plan 的地方

- Task 1：import 路径 `./index` → `./workflow.types`（避免 barrel 循环引用）
- Task 2：sqlite test helper 路径修正（plan 给的不存在）+ 用 createTestDataSource 替换本地 buildDb
- Task 3：handler 卫语句 + 注释格式对齐同文件样板
- Task 9：preload API 名 `providers.listUserConfigs` → `providerConfig.list`（plan 给的 API 不存在）
- Task 11：顺手清理 EpisodeWorkbench.vue 中已无引用的 import（workbenchStore / icons / ElMessageBox 等）

## 待 user 手动验证（自动化覆盖不到）

- [ ] PC dev 端 E2E：项目列表 → 选项目 → 新建集 → 点集 → 工作台 → stage 切换 → 返回保选中
- [ ] Web 端验证（PGDATABASE=the_bot_test npm run dev:web）
- [ ] 截图归档（项目界面 / 制作界面）

## 后续优化建议（非阻塞）

- listEpisodesWithProgress 后端 N+1（注释已说明）：单项目 30+ 集时考虑下沉 SQL 聚合
- progress.store 与 episode.store 持久化常量命名不统一（LAST_SELECTED_PROJECT_KEY vs LAST_SELECTED_STORAGE_KEY）

---

## 追加（2026-05-08）：剧集创建剥离 AI 识别

**背景**：
`handleCreateEpisode` 在 uploaded 模式下同步调三次 AI（identifyCharacters/Locations/Items），
但 `CreateEpisodeDialog.vue` 完全没传 providerConfigId / modelId（项目级配置在
projectStore.scriptModel，对话框拿不到），导致 AI 调用永远是 undefined 入参 → 必然失败 →
被 try/catch 吞掉，用户白等 30s+ 还看不到错误，最后看到一个空要素清单。

**改动**：
1. `src/electron/ipc/handlers/episode-production/episode.handler.ts`
   - 删除 uploaded 模式的 AI 识别块（约 50 行死代码）
   - 删除 data 入参类型上的 `providerConfigId` / `modelId` 字段
   - outline 模式的 `EpisodeAutoBindingService.autoBindEntities`（无 AI、纯映射）保留
   - 顶部新增 JSDoc 说明设计原因
2. `src/preload/index.ts:1631`：删除 createEpisode 入参类型上的两个对应字段

**保持不变（已在 v3 内容页就位）**：
- `StageContentScriptView.vue:397 onIdentifyAll`：用户进 ① 内容 stage 后手动触发 AI 识别
- `StageContentScriptView.vue:625 onGenerateScript`：识别完成 → 用户手动触发剧本生成
- subState='pending' 时 header 显示"AI 识别要素"按钮 + "确认要素 → ② 资产"

**验证**：
- typecheck：无新增错误（preload:1313 是 longwriting onGenerateEvent 基线遗留）
- lint：handler 0 errors（仅 23 个 warning 全部为已存在的 any 类型基线）
- 无新增 / 受影响测试（episode.handler.ts 历史无 spec 架子）

**未做的事**（评估后认为非阻塞）：
- 没补 handler 单元测试 —— 现有架子里没有 IPC handler 测试基础设施，为"删除 dead path"
  专门搭 handler 测试架子代价远超改动本身。剩下的逻辑（落库 + outline 自动绑定）已被
  上层场景间接覆盖。

**用户视角变化**：
- 创建对话框 → 提交 → 立刻返回（之前阻塞 30s+）
- 进 ① 内容 stage → 看到 subState='pending'，"AI 识别要素"按钮 + 原文 panel
- 用户点"AI 识别要素"（走项目设置里的 scriptModel）→ 三栏要素出现 → 取舍 / 增删 →
  "确认要素" → ② 资产
- ② 资产建好 binding → 回到 ① 内容 stage（subState='scripting'）→ 点"AI 生成剧本"

---

## 追加（2026-05-08）：5 项需求改造

用户清单（5 项）：
1. 创建剧集时长文改可选（进入剧集后再填）
2. 创建对话框新增"年代 / 地域 / 其他说明"三字段
3. 删除内容页"故事背景"卡片
4. 剧本可编辑 + AI 润色（之前简陋且不能改）
5. AI 生成剧本按钮灰色（subState 'readonly' 误判）
6. 确认要素后允许编辑原文/剧本

实施清单：

| Task | 改动 | 关键文件 |
|---|---|---|
| 1 | 后端 createEpisode 入参链路扩展 era/region/extra；uploadedContent 校验改为"空 OR 500-15000" | `episode.handler.ts` / `video-episode.repository.ts` (CreateRequest+create+createMany) / `preload/index.ts` / `episode.store.ts` |
| 2 | CreateEpisodeDialog：长文 textarea 可空；加三字段表单项；isFormValid 不再卡空长文；提交带三字段 | `CreateEpisodeDialog.vue` |
| 3 | v3 内容页删 `<StoryBackgroundPanel>` 渲染 + import；excerpt-row 单栏布局，去掉 height:420px | `StageContentScriptView.vue` |
| 4 | subState 阈值上调：`pending` / `asset_prep+scripting+storyboarding`(scripting) / `producing+composing+completed`(readonly) | `StageContentScriptView.vue:201-220` |
| 5 | 新建 SceneEditDialog.vue（基础/剧情/对话/动作 4 tab，含完整字段编辑）；onEditScene 改为打开 dialog 而非 ElMessageBox.prompt | 新增 `SceneEditDialog.vue`；改 `StageContentScriptView.vue` |
| 6 | 新建 EpisodeScenePolisher（AI 场景级润色器）；新增 `ep:polish-scene` IPC + handler；preload + channel-map 同步暴露；SceneEditDialog 内"✨ AI 润色本场"按钮 + applyPolishResult 回填 | 新增 `scene-polisher.ts`；改 `script.handler.ts` / `preload/index.ts` / `web/client/channel-map.ts` / `narrative/ai/index.ts` |

设计决策（创建任务前与用户对齐）：
- D（润色粒度）：场景级整体润色 — 一个按钮一次重写 originalText/narration/dialogues/actions，
  保留 binding ID + dialogue/action ID 不变（merge 时按 id 对齐回填）
- E（解锁阈值）：解锁到 producing 之前 — scripting/asset_prep/storyboarding 都允许改原文+剧本

验证：
- typecheck：跟改动相关的文件 0 新增错误（基线遗留 `script.handler.ts:79/479` 不是我引入）
- lint：新建 SceneEditDialog 1 个 any warning（form/initial 工程权衡，跟仓库基线同类）；polisher 0 问题
- 测试：repo 历史无 IPC handler 测试架子；polisher 是纯函数生成器，相当于 storyboard-generator 套子
  （后续如有时间补 polisher 单测：固定 mock callAI → 验证 mergeDialogues/mergeActions 不丢 binding）

未做（明示）：
- characters 出场角色编辑（含 SceneCharacter 的 expression / outfit / props 与 binding picker）— SceneEditDialog 仅显示数量，编辑留 follow-up
- "故事背景"二次编辑入口（创建后改 era/region/extra）— 当前需要走 updateEpisode 但 UI 上没专门入口；如果用户后续要改可考虑放在剧集设置 / EpisodeWorkbench header


