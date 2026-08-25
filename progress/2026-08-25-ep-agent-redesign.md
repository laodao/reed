# 剧集制作 Agent 助手重构（新版本）· 进度

> 日期：2026-08-25
> 设计：`tasks/2026-08-25-ep-production-overall-design.md`（整体）+ 各模块计划。
> Review：`tasks/2026-08-25-ep-production-design-review.md`。

## 目标
参考 DramaForge 截图，为「剧集制作」重构**全新界面**（嵌入现有系统壳、风格统一），
业务功能部分全新重做。旧版保留隐藏。

## 导航结构（已确认并实现）
```
菜单「剧集制作」→ 项目列表页（项目清单.png：卡片网格 + 新建项目）
  → 点项目：
     ├─ 无剧集 → 剧本创建页（无剧本空项目首页.png：上传剧本 / AI 生成剧本）→ 建首集 → 工作台
     └─ 有剧集 → 四 tab 工作台（项目清单.png/项目首页.png：剧本/资产/分镜/合成 + 右侧 agent）
```

## 已完成界面（对照截图）
### 项目列表页（`EpisodeProjectListV3.vue` · 参照项目列表.png）
- 标题「项目」+ 共 N 个项目 + 「+ 新建项目」。
- 卡片网格：封面缩略 + 项目名 + N 集 + 当前集状态。点项目 → 查剧集 → 无则剧本创建页，有则工作台。
- 空态提示。

### 无剧本空项目首页 / 剧本创建页（`EpisodeCreator.vue` · 参照无剧本空项目首页.png）
- 头「剧本」+ 副标题「剧情剧本 → 定稿 → 一键分镜」。
- 左：上传剧本卡（选择文件 → analyseScriptFile → 建首集）。右：AI 生成剧本卡
  （创意/梗概 + 节奏回调 + 主要角色设定 + 剧集标题 → 生成剧本）。
- 建首集链路（真实后端）：createEpisode → batchIdentifyEntities(若有模型) → generateScript → generateScenes → 进工作台。

### 资产页（`AssetGallery.vue` 重做 · 参照项目资产页.png）
- 顶：角色定妆：名字 + 视图 pills(正面全身/正面半身/...) + 按需提货。
- 左：图集导航（竖排缩略 + 已定妆/待生成 + "+"）。
- 右：大图预览 + 底部镜头提示词 + 生成图片。
- 生成主图 generateMainFor；派生 derive.single（有主图可用）。

### 分镜列表页（`StageStoryboardView.vue` · M4 · 参照项目分镜列表页.png）
- 顶工具条：分镜标题 + 共N镜 + 批量生成分镜。
- 左：场次导航；中央：按场次分组的分镜格（SHT-xx 卡 + 时间码 + 待生成/已生成）。
- 数据：getEpisode→scriptId→listScenes→listStoryboards(sceneId)；批量 generateStoryboards(scriptId)。
- 已接入「分镜」tab。

### 分镜制作页（`StageStoryboardEditor.vue` · M5 · 参照项目分镜制作页.png）
- 左：SHT 分镜列表（选中态）；中：大预览 + 镜头字段（景别/角度/运动/时长）+ 提示词 + 生成图像。
- 单镜生成 generateStoryboardImage(storyboardId, styleName)；字段 updateStoryboard。
- `StageStoryboardTab.vue` 作为「分镜」tab 宿主（列表/制作 子模式切换）。

### 其它（前述已完成）
- 首页 / 剧本页 / 工作台三段式 + 右侧 agent（M0/M8/M1/M2/M3）。

## 后端复用
- `ep:analyze-script-text`（新增，粘贴拆集）、`analyzeScriptFile`、`batchCreateEpisodes`、
  `createEpisode`、`generateScript`、`generateScenes`、`generateMainFor`、`derive.single/batch`、
  `asset.projectSummary`。全部现有真实服务。
- 路由：`/episode-production` → 项目列表页；`/episode-production/:projectId/creator` → 剧本创建页；
  `/:projectId/studio/:episodeId` → 工作台。菜单 `config/menu.ts` 剧集制作 `hidden:false`。

## 前端文件清单
- `views/{EpisodeProjectListV3,EpisodeCreator,EpisodeStudio,EpisodeHome}.vue`。
- `components/episode-production/{studio/EpisodeStudioLayout + PlaceholderTab,
  script/{StageScriptView,SceneNav,SceneCard,ScriptEmptyState},
  storyboard/{StageStoryboardTab,StageStoryboardView,StageStoryboardEditor},
  home/{ScriptImportCard,NewProjectDialog},
  asset/{AssetTree,AssetGallery,AssetImageCard,StageAssetView},
  agent/EpAgentPanel}`。
- `composables/{useEpStudioContext,useEpAgentChat}.ts`。
- Agent 后端 `src/core/modules/episode-production/agent/*` + IPC `ep:agent:{send,history,state,cancel}`。

## 单测
- `tests/unit/core/modules/episode-production/ep-agent-workflow.service.spec.ts`：18 例通过。

## 验证（实测）
- `vue-tsc` + `npm run build` 通过。
- EXDM：项目列表（hasProjectList）、剧本创建页（hasCreator）、资产页新布局（hasGallery+navItems 6）
  均正确渲染；agentState 返回完整生产状态。

## 待办（阶段 D/E）
- M6 合成页。M7 全局任务中心（workflow 定时任务 + 剧集生成任务统一）。
- E 收敛：旧表单收进高级入口、样式统一、空态/loading/错误处理。

