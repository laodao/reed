# 剧集制作 UI 操作流程全量盘点与复盘（2026-09-19）

> 目的：逐屏记录每个界面的每个操作 → 梳理产物依赖关系 → 对照依赖链检查不合理/冲突/重复/不明确的操作 → 提出优化方案。
> 所有结论带 文件:行号 证据。盘点基于工作区当前代码（分支 feat/story-room）。

---

## 一、产物依赖关系（后端实证）

### 1.1 数据表链

```
video_projects
  └─ video_episodes（剧集，status 状态机：pending→asset_prep→scripting→storyboarding→producing→composing→completed）
      ├─ episode_scripts（剧本：synopsis 梗概 + scriptContent 正文）
      │    └─ scene_scripts（场景）+ scene_characters/scene_dialogues/scene_actions/scene_props 桥表
      │         └─ storyboards（分镜镜头）+ storyboard_characters
      │              ├─ storyboard_keyframe → image_assets（关键帧图）
      │              ├─ ep_video_segments（片段）→ segment.video_path
      │              └─ storyboards.video_path（单镜视频）
      └─ （项目级）character_bindings / location_bindings / item_bindings
               └─ asset_image（is_main 主图 / category=view 派生视角图，confirmed 定妆闸门）
      └─ ep_export_history（导出记录）/ video_episodes.composed_video_path
```

### 1.2 依赖方向

| 产物 | 依赖 | 产出 IPC | 落点 |
|---|---|---|---|
| 剧集 | 长文 outline 或粘贴文本 | ep:create-episode | video_episodes |
| 要素/资产 binding | uploadedContent（注意：**不是剧本正文**） | ep:batch-identify-entities | *_bindings |
| 剧本+场景 | 剧集内容 | ep:generate-script（**生成剧本同时覆盖重建场景**） | episode_scripts + scene_scripts |
| 场景（重拆） | **梗概 synopsis**（不是正文） | ep:generate-scenes | scene_scripts |
| 分镜 | 场景非空 + scriptModel | ep:cogen-storyboards / ep:cogen-scene-storyboards | storyboards + 顺带建 binding |
| 关键帧 | 分镜 + 场景角色已绑定 + confirmed=1 资产图 | ep:generate-keyframes | storyboard_keyframe + image_assets |
| 视频 | 文生：仅提示词；图生/首尾帧：关键帧链 | ep:generate-segment-video / ep:generate-video-segment | ep_video_segments / storyboards.video_path |
| 导出 | 入选单元全部有视频 | ep:export-mp4 | composed_video_path + status=completed |

### 1.3 两套就绪判定并存（口径不一致，见问题 B3）

- **EpisodeReadinessService**（新 Studio 四个 tab 用）：src/core/platform/episode-production/services/readiness.service.ts:72-205
  - script ready = 剧本存在且场景非空（:92-97）
  - assets ready = 出场角色/地点均有主图（**不查物品**）（:103-154）
  - storyboard ready = 分镜非空且角色名单已绑定（:166-186）
  - compose ready = 只看 ep_video_segments 全部 completed（:189-205）
- **StageGateService**（老 Workbench 六段门控）：workflow/stage-gate.service.ts
  - 剧本要求 status='approved'（:301-327）；资产查**全部** binding 含物品主图（:238-298）；producing 只查 storyboards.video_path（:394-401）

---

## 二、业务流程全景：工序 → UI 操作 → 依赖关系

### 2.0 标准工序链（业务视角）

```
①立项        ②内容导入      ③要素识别       ④剧本生成        ⑤资产制作              ⑥分镜制作            ⑦关键帧         ⑧视频生成       ⑨配音        ⑩合成导出
创建项目      剧集关联内容    识别角色/        生成剧本正文      主图→定妆确认→         场景→镜头列表       每片段首/尾帧   每片段出视频    逐场景配音   时间线→质检→
└→创建剧集    (长文章节/      地点/物品       └→拆分场景       派生视角图            +提示词+资产绑定   +VLM校验                      (可选)       导出MP4
              粘贴/AI梗概)    建资产binding                                     └→自动分段
```

### 2.1 工序 → UI 操作对照表

| # | 业务工序 | UI 界面 | 具体操作 | 后端 IPC | 产出 |
|---|---|---|---|---|---|
| ① | 创建项目 | 项目列表页 `/episode-production` | 「新建项目」 | ep:create-project | video_projects |
| ① | 创建剧集 | Studio 顶栏「＋」 | NewEpisodeDialog：选来源（长文章节/粘贴文本/AI梗概），可勾选自动链 | ep:create-episode | video_episodes |
| ② | 内容导入 | NewEpisodeDialog 内完成 | 长文章节取章节正文；粘贴文本存 uploadedContent | （随创建） | episode.uploadedContent / outlineId |
| ③ | 要素识别 | **剧本 tab 工具条「识别要素」**（位置错位，见缺口G4） | 点击识别 | ep:batch-identify-entities | character/location/item_bindings |
| ④ | 生成剧本 | 剧本 tab 空态「生成剧本」 | 一键生成（**连带拆场景**，两步合一） | ep:generate-script | episode_scripts + scene_scripts |
| ④ | 场景拆分（返工） | 剧本 tab「重新拆分」/ 单场「重新生成」 | 按**梗概**重拆 | ep:generate-scenes / ep:regenerate-scene | scene_scripts 重建 |
| ⑤ | 资产主图 | 资产 tab → 选中资产 → 主图槽位「生成」/「新增正面全身」 | AI 生成或上传 | ep:asset:image:generate-main 等 | asset_image(is_main=1) |
| ⑤ | 定妆确认 | 资产 tab 大图右下「确认定妆」 | 确认后才参与关键帧选图 | ep:asset-image-set-confirmed | asset_image.confirmed=1 |
| ⑤ | 派生视角图 | 资产 tab「一键生成」/ 槽位「+」 | 批量/单张派生 | ep:asset:derive:single/batch | asset_image(category=view) |
| ⑥ | **分镜拆分** | **分镜 tab 右上无文字 MagicStick icon**（发现性差，见缺口G1） | 整集 cogen 联合生成，生成后自动分段 | ep:cogen-storyboards → ep:recompute-segments | storyboards + ep_video_segments |
| ⑥ | 单场分镜返工 | 场组头 MagicStick icon | 替换式重生该场 | ep:cogen-scene-storyboards | storyboards（单场） |
| ⑥ | 提示词编辑 | 制作页中央富文本 | 逐镜编辑、@引用资产图、参数token | ep:update-storyboard | storyboards.frameDescription 等 |
| ⑦ | 关键帧 | 制作页关键帧画廊「生成关键帧」/逐帧重生/校验 | 参考 confirmed 资产图生成首/尾帧 | ep:generate-keyframes / ep:review-keyframe | storyboard_keyframe + image_assets |
| ⑧ | 视频生成 | 制作页「生成片段视频」（选文生/参考图模式）/ 列表页片段格 | 逐片段生成 | ep:generate-segment-video | ep_video_segments.video_path |
| ⑨ | 配音 | 合成 tab 配音区「全部生成」/单场「生成配音」 | 按场景对白生成音频 | ep:generate-scene-audio-v3 | 音频文件 |
| ⑩ | 质检 | 合成 tab「质量自检」 | 全片检查 | ep:episode-quality-check | 检查报告 |
| ⑩ | 导出 | 合成 tab「导出 MP4」→ ExportDialog | 选分辨率/字幕后导出 | ep:build-timeline + ep:export-mp4 | composed_video_path |

### 2.2 工序间依赖关系：硬前提 vs 软前提

**硬前提（后端强制，不做必失败/被拦）：**

| 后续工序 | 硬前提 | 强制点（证据） |
|---|---|---|
| ④剧本 | ①剧集有内容（uploadedContent 或 outline） | generate-script 需剧集存在 |
| ⑥分镜 | ④场景非空 + 项目配置 scriptModel | cogen 要求 scenes 非空；无 scriptModel 报错 |
| ⑤派生图 | ⑤主图存在 | gallery-derivation.service.ts:218-226 无主图抛错 |
| ⑦关键帧 | ⑥分镜存在 + 场景角色至少一个绑定成功 | D4-3 守卫 assertCharactersBound（keyframe-generation.service.ts:678-690）抛错 |
| ⑧视频(图生/参考图) | ⑦关键帧链 | video-segment.service.ts:101-109 / segment-video.service.ts:185-192（制作页会自动补生成首帧） |
| ⑩导出 | ⑧全部入选片段有视频 | episode-mp4-exporter.service.ts:158-167 硬拦 |

**软前提（不做也能跑，但质量/正确性受损，系统只提示不拦）：**

| 后续工序 | 软前提 | 缺失后果 |
|---|---|---|
| ④剧本 | ③要素识别 | 不识别也能生成剧本；但资产 tab 空，后面全靠 cogen 顺带建 binding |
| ⑥分镜 | ⑤资产主图 | 不拦（storyboard.handler.ts:382-385 仅告警）；但关键帧参考图无米下锅 |
| ⑦关键帧 | ⑤定妆确认(confirmed=1) | 不拦；只选 confirmed 图，无 confirmed 回退主图（reference-image-selector.ts:99-109），视角图白做 |
| ⑧视频 | ⑦关键帧（参考图模式） | 制作页自动补首帧；但无人工确认环节，图不对直接进视频 |
| ⑩导出 | ⑨配音 | 不拦；导出无配音版 |
| 全部 | readiness 黄条 | 纯提示，任何 tab 都可点可操作 |

### 2.3 业务流程视角的关键缺口（G 类，与第三章 A-E 互补）

- **G1. 工序⑥在 UI 上"隐形"**：业务流程里"分镜拆分"是承上启下的主工序，但 UI 唯一入口是无文字 icon，空态反而把用户导向不能拆分镜的制作页（串场）。**业务流程的主路径在 UI 上断了。**
- **G2. 工序③位置错位**：业务流程里要素识别在剧本生成**之前**（从原文识别），但按钮放在**剧本 tab** 里，且实际输入是 uploadedContent 而非剧本正文——界面位置暗示的输入源与实际输入源不一致。
- **G3. 工序⑤与⑥⑦的顺序无约束**：业务上应先定妆再分镜再关键帧，但 UI/后端都不拦"跳过资产直接分镜"，readiness 黄条也不拦操作——顺序纯靠用户自觉，新手必踩。
- **G4. 剧本"定稿"工序在新 UI 消失**：业务流程隐含"剧本确认后再拆场景/分镜"，stage-gate 也查 approved，但新剧本 tab 没有定稿按钮，状态永远"草稿"。
- **G5. 工序④两步合一但未告知**：「生成剧本」同时覆盖重建场景（script.handler.ts:546-553），用户在已有场景+分镜时点"生成剧本"会静默销毁下游——确认弹窗没有说明连带范围。
- **G6. 工序⑨配音与⑧视频的绑定关系不明**：配音按场景生成，视频按片段生成，两者在合成 tab 才汇合；场景重拆后配音与片段的对应关系失效无提示。

---

## 三、逐屏操作记录

### 3.0 路由与死活

- 活路径：`/episode-production`（项目列表 EpisodeProjectListV3）→ `/episode-production/:projectId/studio/:episodeId`（views/EpisodeStudio.vue，四 tab：剧本/资产/分镜/合成，EpisodeStudio.vue:162-167,302-310）
- 死代码：stage-script/ 整目录、stage-storyboard/StageStoryboardView.vue（852 行）、stage-compose/StageComposeView.vue、asset/AssetImageCard.vue、views/EpisodeAgentStudio.vue；半死：老 EpisodeWorkbench 路由（stage-content-script-v3/、stage-storyboard-v2/、stage-compose-v2/ 只被它引用，UI 无入口，仅直输 URL 可达）
- Studio 顶栏：返回 / 剧集下拉 / 「＋」新建剧集 / 四 tab（带就绪状态点）/ 状态 tag / 用量 icon / 设置 icon / 未就绪黄色提示条（EpisodeStudio.vue:49-61）

### 3.1 剧本 tab（script/StageScriptView.vue）

布局：顶工具条（标题+已拆N场+定稿tag；右侧5按钮）｜左 SceneNav 场次导航｜中央场景卡。

| 操作 | 位置 | 动作 | 前置条件 |
|---|---|---|---|
| 生成剧本 | 空态中央 | ep:generate-script（连带删旧场景重建） | 无（无模型守卫，见 B2） |
| 拆分场景 | 有剧本无场景空态 | ep:generate-scenes（按梗概拆） | 无 |
| 识别要素 | 工具条 | ep:batch-identify-entities | **无条件可点**，无剧本时假成功 toast 0/0/0 |
| AI 续写 / 追加正文 | 工具条 | AppendScriptDialog → ep:append-script | 需有剧本 |
| 剧本全文 | 工具条 | 只读弹窗 | 需有剧本 |
| 重新拆分 | 工具条 | 确认后 ep:generate-scenes（删全部场景+连带分镜） | 需有剧本 |
| 单场重新生成 | SceneNav hover | ep:regenerate-scene（删该场分镜） | 仅防重 |
| 场景描述编辑 | SceneCard blur | ep:update-scene | — |

无跳资产/分镜的交叉按钮。agent 右侧生成剧本后本页不刷新（无事件转发，StageScriptView.vue:96 注释声称有但无接线）。

### 3.2 资产 tab（asset/StageAssetView.vue + AssetGallery.vue）

布局：左 AssetTree｜中左图集槽位导航（角色6槽/地点物品4槽）｜中右大图+提示词+模型+生成。

| 操作 | 位置 | 动作 | 前置条件 |
|---|---|---|---|
| 新建资产 | 树顶 | createStandalone | 无（同名会选错行） |
| 新增正面全身 | 图集顶右 | AddOutfitMainDialog（AI生成/上传） | 需选中资产；**对地点/物品也显示角色专属文案** |
| 一键生成派生 | 图集顶右 | BatchDeriveDialog → 串行 derive.single | 需有主图；**无进度反馈** |
| 关联人像 | 图集顶右 | LinkPortraitDialog（槽位映射是角色6槽硬编码） | 需选中资产；**对地点/物品开放→图落库后无槽位可见** |
| 槽位生成/重生 | 图集槽位 | generateMainFor / derive.single | — |
| 确认定妆 | 大图右下 | setConfirmed（被关键帧引用时级联重生询问） | **仅主图槽位显示**→派生图无逐张确认入口 |
| 提示词保存 | 底部 blur | asset.image.update | 派生槽禁用 |

"已定妆"口径不一致：树侧 hasMain 即"已定妆"（AssetTree.vue:97-101），图集侧三态且 confirmed=0 显示"未确认"（AssetGallery.vue:48-56）。

### 3.3 分镜 tab（storyboard/StageStoryboardTab.vue → StageStoryboardView.vue / StageStoryboardEditor.vue）

**列表屏**：顶工具条（标题+计数；右侧仅一个无文字 MagicStick icon）｜左 SceneNav｜中央按场次分组的片段格。

| 操作 | 位置 | 动作 | 前置条件 |
|---|---|---|---|
| **批量生成分镜（=唯一的"拆分分镜"入口）** | 工具条右 MagicStick icon，**无文字** | readiness 门控 → ep:cogen-storyboards，生成后自动 recompute-segments | scenes 非空 |
| 场次剧本展开 | 场组头 Document icon | 前端展开 | 无 |
| 重新生成此场景分镜 | 场组头 MagicStick icon | ep:cogen-scene-storyboards（替换式） | 空场也可点（文案与实际不符） |
| 进入制作 | 场组头 →/格点击 | 切编辑器 | **无前置**：空场进入会串场到第一个有分镜的场 |
| 片段格：生成视频 | 片段格 | ep:generate-segment-video | generating 禁用；警告文案"请先在右上角选择视频模型"——**该下拉已被删，本页无处可选** |
| 片段格：拆分/合并 | 片段格 | ep:split-segment / ep:merge-segments | 合并硬编码 15s 上限，与 budgetSec 5-30s 配置不一致 |

空态：无场景→"请先在「剧本」页拆分场景"（无跳转按钮）；有场景无分镜→占位格"＋进入制作"（**点进去也不能拆分镜**）。唯一拆分镜指引在 Studio 就绪黄条文案里。

**编辑屏**（StageStoryboardEditor.vue）：顶（返回/场次/风格/视频服务+模型下拉）｜左资产图集选择器｜中左片段镜头列表｜中央预览+关键帧画廊+提示词富文本+操作行。

| 操作 | 动作 | 前置条件 |
|---|---|---|
| 提示词编辑 | ShotPromptEditor，@引用资产图、参数 token、拖拽插图（**拖拽丢图索引**，只引用资产本体） | — |
| 文生/参考图模式单选 | forceMode | ComfyUI 强制参考图 |
| 生成片段视频 | doSave → 参考图模式先 generate-keyframes → generate-segment-video | 未分段 toast 引导"重新分段"（但列表页无常驻重新分段按钮） |
| 关键帧：生成/重生/换参考图/校验 | ep:generate-keyframes / regenerate / KeyframeReferencePicker / ep:review-keyframe | 画廊可见（09-19 恢复） |
| 保存后关键帧过期提示 | frameDescription 变化 → 询问重生 | 自动 |

### 3.4 合成 tab（compose/StageComposeTab.vue）

单列：工具条（质量自检/导出MP4）→ 片段清单（上移/下移/移除）→ 配音区（全部生成/单场生成）→ 只读时间线 → 自检结果 → 导出记录 → 上次导出回放。

- 空态文案"请先在「分镜」页**重新**分段"——首次使用无"重新"可言，且分镜页无常驻重新分段入口。
- 导出 MP4 三重锁（tab readiness + 弹窗 missingVideo + 行警告 icon）来源不同，有不一致窗口。

---

## 四、问题清单（对照依赖链分类）

### A. 依赖关系与 UI 流程错位（本次复盘核心）

- **A1. "拆分分镜"入口不可发现**：依赖链上 分镜←场景 是关键一步，但 UI 唯一入口是分镜 tab 右上角一个无文字 MagicStick icon（StageStoryboardView.vue:11-21）。有场景无分镜时，中央空态是"＋进入制作"（:167-169），把用户导向一个不能拆分镜、还会**串场**（自动加载别的场，StageStoryboardEditor.vue:386-403）的编辑器。用户质疑"没有拆分分镜，为什么分镜界面可见"成立：tab 可见，但页内主路径是断的。
- **A2. tab 永远可点，靠黄条补救**：四 tab 无依赖禁用，只有就绪状态点+黄条（EpisodeStudio.vue:49-61,206-208）。黄条文案指向的操作有的不存在（合成 tab 建议"到分镜页生成全部片段视频"，分镜页没有"全部生成"按钮——已按用户要求砍了，文案没跟上）。
- **A3. 空态引导落空**：合成 tab 空态让人"重新分段"（StageComposeTab.vue:39），分镜 tab 无常驻分段入口（只剩存量 alert"立即分段"，StageStoryboardView.vue:38-49）；SceneNav 空态让人点「重新拆分」但该按钮无剧本时禁用。
- **A4. readiness 数据源与合成判定不一致**：片段制视频只写 ep_video_segments.video_path，单镜制只写 storyboards.video_path；readiness.compose 只认前者，timeline-builder 有双源回退（timeline-builder.service.ts:107-134）。单镜路径下合成 tab 会误报未就绪。

### B. 状态/语义不一致

- **B1. "已定妆"双口径**：资产树 hasMain=已定妆 vs 图集 confirmed=未确认，同一资产左右矛盾。
- **B2. 识别要素的输入源是 uploadedContent 不是剧本正文**（episode.handler.ts:371），无剧本时假成功 toast"角色0地点0物品0"；与剧本页按钮的直觉（对当前剧本识别）不符。
- **B3. 剧本"定稿"死状态**：后端生成后置 reviewing（script.handler.ts:522,536），前端只认 approved，永远显示"草稿"；定稿按钮只存在于死代码页面（stage-content-script-v3）；readiness 不要求 approved 而 stage-gate 要求。
- **B4. "重新拆分"拆的是梗概不是正文**（script.handler.ts:613-618）：追加正文永远不会进入重拆结果。
- **B5. 状态机只前进不回退**：重拆场景/重新生成剧本删除下游数据后，episode status 仍停在 storyboarding/producing，与实际数据不符。
- **B6. 单场景分镜生成不推进 episode 状态**（storyboard.handler.ts:228-298 无 advanceEpisodeStatus）。

### C. 数据完整性漏洞（级联缺失）

- **C1. 删场景不级联分镜**：handleDeleteScene / handleGenerateScenes 物理删场景，storyboards 悬空成孤儿（script.handler.ts:214-228,623-628），连带旧片段永不 supersede。
- **C2. 删/重建分镜不清关键帧与图**：deleteBySceneScriptId 不走 deleteKeyframeWithAsset 回收（storyboard.handler.ts:344；keyframe-generation.service.ts:412-431 的回收逻辑没被这些路径调用）。
- **C3. 删剧集/资产 binding 不级联**：剧集逻辑删，下游全留；删 binding 后场景/分镜/关键帧的引用悬空（character-asset.service.ts:383-385）。

### D. 重复/死代码

- D1. 三套并行实现（script/ vs stage-script/ vs stage-content-script-v3/ 等），死代码清单见 §2.0。
- D2. readiness（四段）与 stage-gate（六段）双轨判定，口径三处不同（approved、物品主图、视频数据源）。
- D3. 活代码反向依赖旧目录：StageStoryboardEditor.vue:225 import stage-production/KeyframeReferencePicker——清理旧目录会误伤活功能。

### E. 小缺陷

- E1. 分镜列表"请先在右上角选择视频模型"文案残留（下拉已删，StageStoryboardView.vue:480）；死样式 .provider-select 等。
- E2. 合并 15s 硬编码 vs budgetSec 5-30s（StageStoryboardView.vue:632-633 vs :421-423）。
- E3. AssetGalleryPicker 拖拽丢图索引（:110-114）。
- E4. 关联人像/新增正面全身对地点物品开放但语义角色专属，图会"丢"。
- E5. 视频模型回退竞态不生效（loadVideoProviders 未 await，StageStoryboardEditor.vue:705-706 vs :425-429）。
- E6. 一键派生无进度；agent 操作后当前 tab 不刷新；新建同名资产选错行。
- E7. 派生图无逐张确认入口（确认按钮仅主图槽位，AssetGallery.vue:131），tooltip 指引死循环。

---

## 五、优化方案（按优先级）

### P0 依赖链对齐（解决 A 类，用户点名）

1. **分镜 tab 空态按依赖分级**：
   - 无场景 → 空态主按钮"去剧本页拆分场景"（点击切 tab），而非纯文字。
   - 有场景无分镜 → 中央主按钮「生成全部分镜（自动识别并绑定资产）」（带文字！调用现有 cogenStoryboards 路径），场次占位格不再写"进入制作"而写"尚未生成分镜"且不可点。
2. **编辑器防串场**：空场进入时显示该场空态+"生成此场景分镜"按钮（复用 cogen-scene-storyboards），不再静默加载别的场。
3. **批量生成分镜 icon 加文字标签**（"生成分镜"），与进入制作/场次重生 icon 区分。
4. **就绪黄条文案对齐实际存在的操作**：合成未就绪改为"到「分镜」页逐片段生成视频"；分镜未就绪改为"点击本页「生成分镜」"。
5. **合成 tab 空态文案修正**："请先在「分镜」页生成片段视频"。
6. **readiness.compose 与 timeline-builder 统一数据源**（segments 优先、storyboards.video_path 回退），消除单镜路径误报。

### P1 状态一致性（B 类）

7. 统一"已定妆"口径：资产树改看 hasMain+confirmed 双条件，或图集主图自动确认后同步。
8. 派生图逐张确认入口：非主图槽位选中未确认图时也显示「确认定妆」按钮。
9. 剧本定稿闭环：新剧本 tab 补「定稿/取消定稿」按钮（后端字段已有），或干脆移除定稿 tag；二选一，不留死状态。
10. 识别要素输入源：有剧本时基于剧本正文识别（与按钮所在页面语义一致），无剧本才回退 uploadedContent；无可识别内容时禁用按钮。
11. 「重新拆分」改基于正文拆分（或在确认弹窗明示"按梗概重拆，追加的正文不参与"）。
12. 状态机回退：重拆场景/重新生成剧本时 status 回退到 scripting，并级联清理下游（同 P2-13）。
13. 单场景分镜生成后推进 episode→storyboarding。

### P2 数据完整性（C 类）

14. 级联清理：删场景→删其分镜+关键帧+image_assets+片段；删分镜→清关键帧与图；删剧集→提示并清理下游（或至少级联逻辑删）；删 binding→引用检查警告。统一走 keyframe-generation.service.ts 的 deleteKeyframeWithAsset 回收。

### P3 死代码清理（D 类）

15. 删除：stage-script/、stage-storyboard/StageStoryboardView.vue + StoryboardCharacterEditDialog.vue、stage-compose/StageComposeView.vue、asset/AssetImageCard.vue、views/EpisodeAgentStudio.vue；KeyframeReferencePicker 先移到 storyboard/ 再清 stage-production/。
16. 老 Workbench 路由与 stage-*-v2/、stage-content-script-v3/ 整体下线（确认无入口后），stage-gate 双轨随之收敛为 readiness 单轨。

### P4 小修（E 类）

17. 删残留文案与死样式；合并上限改读 budgetSec；拖拽带图索引；关联人像/新增正面全身限定角色资产；loadVideoProviders await 修竞态；一键派生加 x/N 进度；agent data-changed 转发到当前 tab 组件。


---

## 六、逐条复核结论（2026-09-19，读代码逐条确认）

P0 由主代理亲自读码核实；P1–P4 由独立子代理逐条读码核实。结论分【成立】/【部分成立】/【需修正表述】。

### P0（全部亲自核实，成立）

| 条 | 结论 | 关键证据 |
|---|---|---|
| P0-1 分镜 tab 空态分级引导 | 成立 | icon 无文字 StageStoryboardView.vue:11-21；无场景空态无跳转按钮 :32-34；占位格"进入制作" :167-169 |
| P0-2 编辑器防串场 | 成立 | load() :385-403 目标场无分镜时循环落到第一个有分镜的场；全空时 shots=[] 无生成入口；:427 引导"重新分段"按钮在列表页不存在 |
| P0-3 拆分镜 icon 加文字 | 成立（设计项） | :11-21 |
| P0-4 黄条文案对齐 | 成立 | EpisodeStudio.vue:206-208，compose 建议"生成全部片段视频"指向已删除的批量按钮 |
| P0-5 合成空态文案 | 成立 | StageComposeTab.vue:39"重新分段"措辞 |
| P0-6 readiness.compose 统一数据源 | 成立 | readiness.service.ts:189-205 只认 segments；timeline-builder.service.ts:134 `sb.videoPath \|\| segHasVideo(segId)` 双源 |

### P1（子代理核实）

| 条 | 结论 | 要点 |
|---|---|---|
| P1-7 已定妆双口径 | 成立 | AssetTree.vue:97-101 只看 hasMain/referenceImagePath；hasMain 源头 asset-project-summary.service.ts:336,354 不看 confirmed；AssetGallery.vue:50-56 看 confirmed；新主图 confirmed 默认 0（asset-image.entity.ts:89）→ 同资产左右矛盾实锤 |
| P1-8 派生图确认入口 | 成立，需补充 | 确认按钮仅主槽（AssetGallery.vue:130-141,333）；一次性批量确认弹窗 :722-742 选"稍后手动确认"后永久无入口，且弹窗文案 :726 承诺"可稍后逐张确认"实际做不到；tooltip :53 误导 |
| P1-9 剧本定稿死状态 | 成立，比方案更严重 | 无专用 ep:approve-script IPC；定稿走通用 ep:update-script，唯一活入口在 stage-content-script-v3:897-913，其宿主 EpisodeWorkbench 路由已无可达入口；stage-gate.service.ts:314 卡 approved → 双轨下永远无法过闸 |
| P1-10 识别要素输入源 | 成立 | episode.handler.ts:371 静默 skip；前端 StageScriptView.vue:250-255 假成功 toast 0/0/0 |
| P1-11 重拆按梗概 | 成立 | script.handler.ts:613-618 用 synopsis；append 只改 scriptContent（script-append.service.ts:356-365）→ synopsis 与正文漂移 |
| P1-12 状态机不回退 | 成立 | episode-status-advance.ts:37 `targetOrder <= current return false`，头注释 :13 自述设计 |
| P1-13 单场分镜不推进状态 | 成立 | storyboard.handler.ts:228-298 无 advance；批量 :369-380 与 cogen :424-427 有 |

### P2（子代理核实）

| 条 | 结论 | 要点 |
|---|---|---|
| P2-14a 删场景不级联 | 成立 | script.handler.ts:214-228 一句 delete；repo :210-213 物理删无 cascade |
| P2-14b 删分镜清理范围 | 部分成立（表述修正） | 单删会清 storyboard_keyframe **行**（storyboard.handler.ts:157-159）但不清 image_assets/磁盘；批量重生路径 :344 连 keyframe 行都不清 |
| P2-14c 回收逻辑未复用 | 成立 | deleteKeyframeWithAsset keyframe-generation.service.ts:412-431（含 fs.unlinkSync :427），handler 删除路径都没走它 |
| P2-14d 删 binding 不级联 | 成立 | character-asset.service.ts:383-385 只删 binding 行 |
| P2-14e 删剧集逻辑删 | 成立 | video-episode.repository.ts:257-264 deleted_at，有 restore() :274-279 |

### P3（子代理核实，全部成立，有修正与新增）

- 15a/b/c/d 成立。
- **15e 表述修正**：路由名 `EpisodeAgentStudio` 指向的是 views/EpisodeStudio.vue（packs index.ts:87-89）；views/EpisodeAgentStudio.vue（479 行旧工作台）是无 importer 的死文件。
- 16f 成立：EpisodeWorkbench 路由仍注册但孤儿；stage-*-v2、stage-content-script-v3 只被它引用。
- **16g 新发现**：另有两个死文件——stage-production/StageProductionTabContent.vue（EpisodeWorkbench 模板里的同名标签实为 V2 别名）与 KeyframeRegenerateDialog.vue；stage-production/3d-staging/ 无引用；ShotListPanel/ShotDetailPanel/ScriptViewDialog/RegenerateImageDialog/SynthesisDialog 挂在半死的 EpisodeProductionPage。活代码依赖：KeyframeReferencePicker.vue（←StageStoryboardEditor:225、KeyframeGrid:301）、KeyframeGrid/VideoSegmentPanel（←V2）、AudioPanel（←storyboard-v2）。

### P4（子代理核实）

| 条 | 结论 | 要点 |
|---|---|---|
| 17a 残留文案/死样式 | 成立 | StageStoryboardView.vue:479-482 文案在；全文件无 el-select；:758-760 死样式 |
| 17b 合并上限 | 成立，比方案更糟 | 合并 15s 硬编码 :632-633；budgetSec 5-30s 通道存在但 **renderer 无任何写入入口**（顶部预算输入框不存在，:232 注释与 .budget-input 样式均遗留）→ 实际恒 15s |
| 17c 拖拽丢图索引 | 成立 | AssetGalleryPicker.vue:110-114 入参 img 未用 |
| 17d 关联人像槽位映射 | 成立 | LinkPortraitDialog.vue:94-101 角色六槽硬编码，对三类资产开放；地点/物品 navItems 只有 main/variant_1-3（AssetGallery.vue:283-288）→ 非 main 导入图 UI 不可见 |
| 17e 视频模型回退 | 部分成立（文件张冠李戴，问题真实） | 竞态在 **StageStoryboardView.vue**（:705-706 并发不 await + :425-429 依赖 providers）；StageStoryboardEditor.vue 更糟：**根本没有 loadProjectConfig**，恒选第一个 ready provider（:746-759），从不应用项目视频模型配置 |
| 17f 派生无进度 | 成立 | AssetGallery.vue:677-714 无 x/N；分镜页有 cogenProgress 可参照 |
| 17g agent 不刷新 | 成立，影响范围明确 | onAgentDataChanged 只刷 readiness；tab 无 keep-alive，切 tab 必重新 load → 实际影响=**停留在当前 tab 看不到 agent 改动**，切走切回即可见 |

### 复核后对方案的修正（执行时以本节为准）

1. P1-8 补充：需同时修弹窗文案承诺（"稍后逐张确认"必须有对应入口）。
2. P1-9 执行方式：新剧本 tab 加定稿按钮走通用 `ep:update-script`（无专用 IPC，不需要新建）。
3. P2-14b 修正：单删分镜已清 keyframe 行，补清 image_assets+磁盘即可；重点修批量重生路径（:344）。
4. P3 清理清单更新：追加 StageProductionTabContent.vue、KeyframeRegenerateDialog.vue、stage-production/3d-staging/、EpisodeProductionPage 及其独占 5 文件；KeyframeReferencePicker 先迁移到 storyboard/ 再清 stage-production/。
5. P4-17b 修正：合并上限直接读 budgetSec（已有读取逻辑 :421-422），无需新增配置 UI。
6. P4-17e 修正：Editor 需要**新增** loadProjectConfig 应用项目视频模型（不是修竞态）；View 侧修 await 顺序。
