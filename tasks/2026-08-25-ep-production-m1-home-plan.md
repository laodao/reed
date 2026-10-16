# 剧集制作 · M1 首页（导入剧本 + 最近项目）· 设计与实施计划

> 阶段 B（首屏可见价值）。参考截图「首页.png」。目标：菜单点「剧集制作」进入本页，
> 支持粘贴完整剧本或上传 txt 文件 → AI 自动拆集 → 建项目/剧集，下方「最近项目」卡片流。

## 1. 页面布局（对齐截图业务功能部分）
```
┌──────────────────────────────────────────────────────────────┐
│ 标题「导入剧本，开始创作」                                     │
│ 副标题「粘贴完整剧本或上传 txt 文件，AI 自动拆集分。」            │
├──────────────────────────────────────────────────────────────┤
│ 中央卡片：                                                      │
│   「导入剧本」(AI 自动拆集)  文本域                             │
│     「粘贴完整剧本（含对白、场景描述）…                          │
│       AI 会自动拆分拆集，为每集生成正式内容。                     │
│       可以多写几句：人物关系、场景切换、核心冲突，写越完整拆得越准。」│
│   [导入拆集]（主）  [上传 .txt]（次）                            │
├──────────────────────────────────────────────────────────────┤
│ 「最近项目」  …　更多 >                    ┌ 悬浮 + 新建         │
│ ┌────────┐ ┌────────┐ ...                                    │
│ │封面 标题│ │封面 标题│   （卡片：封面缩略 + 标题 + 集数 + 状态）│
│ │第X集 状态│ │   ...  │                                       │
│ └────────┘ └────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

## 2. 数据链路（全部复用现有后端，不改业务逻辑）
### 2.1 导入拆集（粘贴 / 上传 .txt）
- **粘贴文本**：新增 IPC `ep:analyze-script-text(text)` → 调 `analyzeScriptToEpisodes(text)`（纯函数，规则切分零 AI）返回 `episodes[]{title,content}`。
- **上传文件**：复用现有 `ep:analyze-script-file`（选文件 → extractTextFromFile → analyzeScriptToEpisodes）。
- **预览确认（Key）**：导入后先进**预览确认**步（非直接建库），展示拆分出的 N 集表格（可编辑标题/删行）。
  预览步需**项目名**输入框 —— 因为 `analyzeScriptToEpisodes` 只产出每集标题、**无整剧标题**，而
  `createProject(name)` 强制 name。默认值取首集标题截断（≤20 字），用户可改。
- 确认 → 若无项目先 `createProject(项目名, longWritingProjectId?, config?)`；再
  `ep:batch-create-episodes(projectId, episodes)` 批量建集（uploaded 模式）。可选
  `ep:batch-identify-entities` 识别资产（需配置模型）。
- 全程**不写死**：项目名来自预览输入；剧集名来自章节标题；AI 识别走配置的模型。

### 2.2 最近项目卡片流
- 复用 `ep:list-projects-summary`（现有聚合，含 project 全字段 + episodeCount/progressPct/currentStageLabel）。
- 卡片点击 → **进该项目最新剧集的新版工作台**（`/episode-production/:projectId/studio/:episodeId`）。
  若项目尚无剧集 → 卡片仍可点，进工作台后展示「请先导入/新建剧集」空态引导。
- 「更多 >」→ **项目全列表视图**（M1 内的列表/搜索，或跳工作台顶部剧集选择器。本期做 M1 内列表视图：
  再点一次展开为表格/列表 + 关键词过滤），未确定前先做 M1 内「更多」展开。
- 卡片渲染 title + episodeCount + progressPct（进度条/百分比），无封面色时用 placeholder。

### 2.3 新建项目
- 「+」悬浮按钮 → 弹窗（项目名 + 可选关联长文 + 视频配置/风格）→ `createProject`。可复用现有 `ProjectSidebar` 的创建 dialog 逻辑。

## 3. 组件拆分（新增于 `src/renderer/src/components/episode-production/home/`）
- `EpisodeHome.vue`（视图容器）：标题 + 导入卡片 + 最近项目。
- `ScriptImportCard.vue`：文本域 + 两个按钮 + 预览/拆集结果（复用 `BatchCreateEpisodesDialog` 的预览表格逻辑，但改为页内卡片式，非弹窗）。
- `RecentProjectsGrid.vue`：卡片流 + 空态。
- `NewProjectDialog.vue`：新建项目弹窗。

## 4. 后端改动（最小）
- `episode-production/narrative/script.handler.ts` 或新 `episode.handler.ts`：新增 `ep:analyze-script-text`（纯函数包装，无 IO；Web+PC 双端自动注册）。
- preload `episodeProduction.analyzeScriptText` + `channel-map.ts` 映射。

## 5. 实施清单
- [ ] `script-splitter.service.ts` 已有 `analyzeScriptToEpisodes` —— 复用，不重写。
- [ ] IPC `ep:analyze-script-text(text)` + preload + channel-map。
- [ ] `EpisodeHome.vue` + `ScriptImportCard.vue` + `RecentProjectsGrid.vue` + `NewProjectDialog.vue`。
- [ ] 菜单 `config/menu.ts`：剧集制作 `hidden:false`；路由 `/episode-production` → `EpisodeHome`。
- [ ] 建项目/批量建集/识别资产 接线（复用现有 IPC）。

## 6. 验收清单
- [ ] 剧集制作菜单可见，进入导入首页。
- [ ] 粘贴带「第X章」结构的剧本 → 点「导入拆集」→ 预览 N 集 → 确认 → 建项目+剧集成功。
- [ ] 上传 .txt 同流程可用。
- [ ] 最近项目卡片流展示已有项目；「+」能新建项目。
- [ ] 导入完成后可跳转该剧集新版工作台（M0 壳 + M2 剧本页）。
