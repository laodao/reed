# 剧集制作功能 UI 重构设计稿

**日期：** 2026-05-08
**作者：** kingcq + Claude（结对设计）
**对照分支：** `feat/episode-production-redesign`
**状态：** Draft（待 user review）

---

## 1. 背景与目标

当前剧集制作模块的两个页面存在以下问题：

1. **`/episode-production`（项目列表）** 是单栏 grid 卡片，进入项目要二次跳转到 workbench；项目级操作（设置/重命名/删除）和集级操作（新建/编辑/选集）混在 workbench 里，职责模糊
2. **`/episode-production/:projectId`（剧集制作工作台 Workbench）** header 三栏拥挤：左项目名 + 中"集 select / 新建 / 编辑" + 右"项目设置"；下方 `StageProgressBar` 单独占一行；底部 `BottomTimeline` 与主 stage view 信息重复

本次重构将参考 `Portrait.vue`（人像设计）的两栏结构，把"项目—集—制作"三层语义分离到两个页面：
- **剧集项目界面**（替换原 `EpisodeProjectListV2.vue`）：左 sidebar 项目列表 + 右栏集列表
- **剧集制作界面**（重构 `EpisodeWorkbench.vue`）：极简 header（返回 + 集名 + 阶段栏）+ 主区 stage view

---

## 2. 路由与导航流

| 路由 | 旧 | 新 |
|---|---|---|
| `/episode-production` | V2 grid 卡片 | 两栏：项目列表 + 集列表 |
| `/episode-production/:projectId` | Workbench，store 自动选回上次集 | 兜底重定向到第 1 集 |
| `/episode-production/:projectId/episode/:episodeId` | （无） | **新增** — 重构后的剧集制作界面 |
| `/episode-production/:projectId/production/:sceneId` | 旧 V2 production，已 deprecated | 保持现状 |
| `/story-to-video/*` | 已有兼容跳转 | 保持现状 |

**导航流：**

```mermaid
flowchart LR
  Home[首页] --> List[/episode-production<br/>项目+集列表/]
  List -->|点击集卡| Workbench[/episode-production/:projectId/<br/>episode/:episodeId/]
  Workbench -->|顶部 [←] 返回| List
  List -->|新建集占位卡 / 新建剧集按钮| Workbench
```

**返回行为：** 制作界面 [←] → `/episode-production`，store 记 `lastSelectedProjectId`，sidebar 自动选中该项目并展开右栏集列表。

---

## 3. 剧集项目界面（重写 `EpisodeProjectListV2.vue`）

### 3.1 布局

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────┬───────────────────────────────────────────────────────┐│
│ │ 剧集项目  [+ 新建]│  我的项目 1                  [项目设置] [+ 新建剧集]││
│ ├────────────────┤  3 集                                                ││
│ │ ▓ 我的项目1 ⋯●│                                                      ││
│ │   旧项目     ⋯ ├───────────────────────────────────────────────────────┤│
│ │   测试 01    ⋯ │  ┌──────────┐ ┌──────────┐ ┌──────────┐              ││
│ │                │  │ 🎬 封面色 │ │ 📖 封面色 │ │ 🎥 封面色 │              ││
│ │                │  │ 第 1 集   │ │ 第 2 集   │ │ 第 3 集   │              ││
│ │                │  │ 第一回    │ │ 江湖恩怨  │ │ 决战紫禁  │              ││
│ │                │  │ ▓▓▓▓▓░░░  │ │ ▓▓░░░░░░  │ │ ░░░░░░░░  │              ││
│ │                │  │ 分镜中    │ │ 资产准备  │ │ 未开始    │              ││
│ │                │  └──────────┘ └──────────┘ └──────────┘              ││
│ │                │  ┌──────────┐                                        ││
│ │                │  │  + 新建  │   hover 在集卡上 → 右上角浮 [✏][🗑]   ││
│ │                │  │   剧集   │                                        ││
│ │                │  └──────────┘                                        ││
│ └────────────────┴───────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 左 sidebar（约 260 px）

- 顶部：标题「剧集项目」+ 主色 [+ 新建项目]
- 列表 item：封面色块（emoji + 渐变，按 id hash）+ 项目名 + 副信息 `X 集 · 来源标签`
- item 末尾：⋯ dropdown（[重命名] / [删除]）
- 选中态：左侧主色竖条 + 主色淡色背景
- 空态：「还没有剧集项目，点击右上角新建」

### 3.3 右栏

- **未选项目** → 空状态（`Folder` 大图标 + "请选择或新建项目"）
- **已选项目** → page-header + 集 grid
  - **page-header**：项目名（h1）+ 副标题 `X 集` + 右侧操作 `[项目设置] [+ 新建剧集]`
  - **集 grid**：`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`，gap 16 px
  - **集卡片**（`EpisodeCard.vue`）：封面色块（emoji + 渐变，按 episodeNumber hash）+ "第 X 集 · 标题" + 进度条 + 当前阶段标签；hover 出右上角浮按钮 [✏ 编辑] [🗑 删除]
  - **末尾占位卡**：dashed border `+ 新建剧集`，点击 = 顶部 [+ 新建剧集] 同效

### 3.4 dialog 复用与归属

EpisodeWorkbench 当前承载 14 个 dialog，本次重构将"项目级 / 集级"3 个 dialog 从 Workbench 迁出到本界面：

| 操作 | 触发点 | dialog | 归属变化 |
|---|---|---|---|
| 新建项目 | sidebar [+ 新建] | 现有创建项目 inline dialog | 留在本界面（已是） |
| 重命名项目 | sidebar item ⋯ → [重命名] | 复用项目编辑 dialog（无则用 `ElMessageBox.prompt` 简易实现） | 本界面 |
| 删除项目 | sidebar item ⋯ → [删除] | `ElMessageBox.confirm` | 本界面 |
| 项目设置 | 右栏 page-header [项目设置] | `SettingsDialog` | **从 Workbench 迁入** |
| 新建剧集 | 右栏 page-header [+ 新建剧集] / 占位卡 | `CreateEpisodeDialog` | **从 Workbench 迁入** |
| 编辑剧集 | 集卡 hover ✏ | `EditEpisodeDialog` | **从 Workbench 迁入** |
| 删除剧集 | 集卡 hover 🗑 | `ElMessageBox.confirm` | 本界面 |

**留在 Workbench 的 11 个 dialog**（与 stage view 强耦合）：`BindCharacterDialog` / `BindItemDialog` / `BindLocationDialog` / `StoryboardEditDialog` / `CharacterDetailDialog` / `ItemDetailDialog` / `LocationDetailDialog` / `EntityEditDialog` / `AssetEditDrawer`，以及保留的资产生成相关 dialog。

---

## 4. 剧集制作界面（重构 `EpisodeWorkbench.vue`）

### 4.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [←] 第 1 集 · 第一回 │  ① 内容  ② 资产 │ ③ 剧本 │ ④ 分镜 │ ⑤ 制作 │ ⑥ 合成     │
│                       │  (绿)    (绿)   │(主加粗)│ (灰)  │ (灰)  │ (灰)        │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                                                                  │
│              主区（按 stage 切换 6 个 view，原样保留全部交互逻辑）              │
│                                                                                  │
│                                                                                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

> **注：** 当前底部 `BottomTimeline`（迷你时间线）一并删除——其内容与主区 stage view 重复。

### 4.2 header（高度 40 px，单行）

| 区域 | 内容 |
|---|---|
| 左 | `[←]` 返回按钮 + 「第 X 集 · 标题」（标题超长用 ellipsis） |
| 中 | 极简 stage 栏（`StageHeaderBar.vue`） |
| 右 | （空，预留少许 padding） |

### 4.3 stage 栏（`StageHeaderBar.vue`）

- 6 段：`① 内容` / `② 资产` / `③ 剧本` / `④ 分镜` / `⑤ 制作` / `⑥ 合成`
- 每段仅文字 label，**不画 ✓ ● ○ icon、不写 meta**（"已完成 / 缺 X 项 / 进行中"）
- 颜色区分（保留以辅助识别"我在哪"）：
  - 已完成 = `var(--el-color-success)` 文字
  - 当前 = `var(--el-color-primary)` 文字 + `font-weight: 600`
  - 未到 = `var(--el-text-color-secondary)` 文字
- 段间小竖分隔线 `│`（`var(--el-border-color-light)`）
- 点击切换 → emit `navigate-stage`，由 `useWorkbenchStageNavigation` 现有 stage-gate 决定能否跳
- Props：`{ episodeId: string | null }`，内部调 `calculateEpisodeProgress` IPC 拿状态
- defineExpose `reload()` 供父组件主动刷新

### 4.4 删除项

| 删除内容 | 当前位置 |
|---|---|
| episode select / Plus / Edit 按钮 | header-center |
| Setting 按钮（项目设置） | header-right |
| `<StageProgressBar>` 整行 | header 下方 |
| `<BottomTimeline>` 整行 | 主区下方 |
| `StageProgressBar.vue` 文件 | （Grep 后 EpisodeWorkbench 唯一引用，可删） |
| `BottomTimeline.vue` 文件 | （同上，可删） |

### 4.5 进入工作台

- 路由 `/episode-production/:projectId/episode/:episodeId`
- `loadProject()` 改为：加载 project + episodes，按 `route.params.episodeId` 选中对应集
- 选中失败兜底（按下列顺序判断）：
  1. project 不存在 → `ElMessage.error` + `router.replace('/episode-production')`
  2. episodeId 不存在 / 已删除 → `ElMessage.warning` + `router.replace('/episode-production/:projectId')`（让 beforeEnter 接管 → 跳到首集）
  3. episodeId 存在但 `episode.projectId !== route.params.projectId` → `ElMessage.error` + `router.replace('/episode-production')`
- 旧 `pickInitialEpisode` 行为下沉到路由 beforeEnter：`/episode-production/:projectId` → 取首个集 → redirect 到 `/episode-production/:projectId/episode/:firstEpId`；空集 → `router.replace('/episode-production')` 并提示"项目暂无剧集，请先创建"
- 进入 Workbench 后，在 `loadProject` 成功末尾把 `route.params.projectId` 写入 `project.store.lastSelectedProjectId`（持久化）

---

## 5. 组件改动清单

### 5.1 改写

| 文件 | 改动 |
|---|---|
| `views/EpisodeProjectListV2.vue` | grid → 两栏布局；新增项目列表 sidebar、右栏 page-header、集列表 grid；集 CRUD + 项目设置入口集中 |
| `views/EpisodeWorkbench.vue` | header 重构；删除 episode select / Plus / Edit / Setting 按钮、`<StageProgressBar>`、`<BottomTimeline>`；改为按 `route.params.episodeId` 选中集 |

### 5.2 新增

| 文件 | 职责 |
|---|---|
| `components/episode-production/workbench/StageHeaderBar.vue` | 简约文字 stage 栏，替代 `StageProgressBar` 在 header 中的展示 |
| `components/episode-production/project-list/ProjectSidebar.vue` | 左侧项目列表（封面 / 名 / 副信息 / dropdown） |
| `components/episode-production/project-list/EpisodeCard.vue` | 集卡（封面 / 集号 + 标题 / 进度 / 阶段 label / hover 浮按钮） |
| `components/episode-production/project-list/EpisodeListPanel.vue` | 右栏（page-header + 集 grid + 占位卡） |

### 5.3 修改

| 文件 | 改动 |
|---|---|
| `router/index.ts` | 新增 `/episode-production/:projectId/episode/:episodeId`；旧 `:projectId` beforeEnter redirect 到首个集 |
| `stores/episode-production/project.store.ts` | 新增 `lastSelectedProjectId` 持久化（localStorage，复用 `episode.store.ts` 现有 `LAST_SELECTED_STORAGE_KEY` 同款模式，新键如 `episode-production:last-selected-project`） |
| `composables/use-workbench-stage-navigation.ts` | `progressBarRef` 入参改名为 `headerBarRef`，类型对齐 `StageHeaderBar` 的 expose（保留 `reload()` 方法）；调用点不变 |
| `electron/ipc/handlers/episode-production/*.ts` | 新增 IPC `listEpisodesWithProgress(projectId)` |
| `core/modules/episode-production/episode/episode-service.ts`（或对应聚合服务） | 实现 `listEpisodesWithProgress`：JOIN episodes + 计算每集进度 |
| `shared/types/episode-production/*.ts` | 新增 `EpisodeWithProgress` 类型 |

### 5.4 删除

| 文件 | 备注 |
|---|---|
| `components/episode-production/workbench/StageProgressBar.vue` | EpisodeWorkbench 唯一引用，重构后删 |
| `components/episode-production/workbench/BottomTimeline.vue` | 同上 |

---

## 6. 数据 / IPC

### 6.1 新增 IPC

```ts
// shared/types/episode-production
export interface EpisodeWithProgress {
  id: string
  projectId: string
  episodeNumber: number
  title: string
  status: EpisodeStatus
  progressPct: number          // 0-100
  currentStageLabel: string    // "分镜中" / "资产准备" / "未开始"...
}

// IPC: ep:list-episodes-with-progress
listEpisodesWithProgress(projectId: string): Promise<IpcResult<EpisodeWithProgress[]>>
```

实现要点：
- 内部循环调用现有 `calculateEpisodeProgress` 服务，打包返回；这只**消除前端往返**，未真正消除 N+1（后端仍是逐集计算）
- 单项目剧集量通常 < 30，第一版可接受；若实测慢，后续优化方向：把"集进度概览"下沉为聚合 SQL（直接读 episode + 关联表 count），不走完整 stage gap 计算
- 走 Repository（不直接 query DB），core 实现，PC + Web 双端共用

`currentStageLabel` 取值规则（基于 `status` 字段映射，避免在前端重复定义）：

| status | currentStageLabel |
|---|---|
| `pending` | "未开始" |
| `asset_prep` | "资产准备" |
| `scripting` | "剧本中" |
| `storyboarding` | "分镜中" |
| `producing` | "制作中" |
| `composing` | "合成中" |
| `completed` | "已完成" |

### 6.2 复用 IPC

- 项目列表：`listProjectsSummary`
- 项目 CRUD：`createProject` / `updateProject` / `deleteProject`
- 集 CRUD：`createEpisode` / `updateEpisode` / `deleteEpisode`
- 单集进度：`calculateEpisodeProgress`（StageHeaderBar 内部用）

---

## 7. 测试 / DoD

### 7.1 单测

| 组件 / 模块 | 用例 |
|---|---|
| `StageHeaderBar` | 6 段渲染、当前/完成/未到 3 态颜色、点击 emit `navigate-stage`、`reload()` expose |
| `EpisodeCard` | 进度条比例、阶段 label、hover 按钮显隐、emit edit/delete/click |
| `ProjectSidebar` | 列表渲染、选中态、dropdown 命令（rename/delete）、新建按钮 emit |
| `EpisodeListPanel` | 空态、page-header 按钮 emit、占位卡点击等同新建 |
| `listEpisodesWithProgress` 服务 | 进度聚合正确、空集返回 `[]`、找不到项目报错 |

### 7.2 E2E

```
进项目列表
  → 看到左 sidebar 项目 + 右栏 empty
  → 选项目 → 右栏 page-header + 集列表显示
  → 点 [+ 新建剧集] → dialog 弹出 → 创建 → 集卡出现
  → 点集卡 → URL 变 .../episode/:episodeId → 工作台 header 显示"第 X 集 · 标题"
  → 点 stage 栏 ② 资产 → 主区切到资产 view
  → 点 [←] → 回到项目列表 → sidebar 仍选中该项目 → 右栏仍显示集列表
```

### 7.3 验证清单

- [ ] 暗色主题手验（CLAUDE.md UI 规则；`var(--el-*)`）
- [ ] PC + Web 双端编译 / 测试通过（CLAUDE.md 双端规则）
- [ ] 无写死颜色 / 假数据
- [ ] `npm run lint` / `npm run typecheck` / `npm test` 全过
- [ ] 走 `docs/superpowers/dod/2026-05-05` 5 阶段自查 + 7 红线
- [ ] 截图归档到 `progress/`

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 集卡 N+1（前端往返） | 聚合 IPC `listEpisodesWithProgress` 一次性返回；后端 N+1 留作后续 SQL 聚合优化 |
| 旧 `:projectId` 路由跳转链 | beforeEnter redirect 到首集；空集 → 回项目列表 + 提示 |
| 删除当前选中项目 | 删除后清空 `lastSelectedProjectId`，sidebar 失焦，主区回 empty |
| `StageProgressBar` / `BottomTimeline` 删除前未发现的隐式引用 | 实施时再 grep 一次，确认无其他引用 |
| 当前 store/ipc 行为变化对其他模块的副作用 | 主要影响在 episode-production 模块内闭环，跨模块只有 SettingsDialog 入口位置变 |

---

## 9. 实施分阶段（建议）

> 本节供 writing-plans 阶段拆分参考；不是契约。Phase 之间存在串行依赖，不能完全独立合入。

1. **Phase 1 · 后端 / 数据层**（可独立合入）：`listEpisodesWithProgress` IPC + 服务实现 + `EpisodeWithProgress` 类型 + `project.store.lastSelectedProjectId` 持久化
2. **Phase 2 · 剧集项目界面**（依赖 Phase 1）：新增 `ProjectSidebar` / `EpisodeCard` / `EpisodeListPanel`；重写 `EpisodeProjectListV2.vue`；从 Workbench 迁入 `CreateEpisodeDialog` / `EditEpisodeDialog` / `SettingsDialog`
3. **Phase 3 · 剧集制作界面 + 路由**（与 Phase 2 同期或之后；路由变更必须与 Workbench 改动**同 PR**，否则中间态会导航失败）：新增 `StageHeaderBar`；改 router；重构 `EpisodeWorkbench.vue` header；删除 `<StageProgressBar>` / `<BottomTimeline>` 引用 + 文件
4. **Phase 4 · 收尾**：清理 `use-workbench-stage-navigation` 入参重命名、E2E、双端验证、暗主题验证、归档截图

---

## 10. 设计确认

- [x] § 2 路由与导航流
- [x] § 3 剧集项目界面布局
- [x] § 4 剧集制作界面 header（颜色区分保留 / `BottomTimeline` 删除）
- [x] § 5 组件改动清单
- [x] § 6 数据 / IPC
- [x] § 7 测试 / DoD

— 待 user 对 spec 终稿再 review 一次。
