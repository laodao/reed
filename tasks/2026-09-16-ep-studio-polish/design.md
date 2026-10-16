# 剧集制作·Studio 完善与重跑专项详细设计（2026-09-16）

范围：A 部分 = `docs/plan/2026-09-16-episode-production-studio-findings.md` 登记的 S-01~S-09 逐项修复（**只基于新版 Studio，不使用/不修补旧 Workbench 代码**）；B 部分 = 重跑全流程的四个专项（多视角定妆、在线 API 带字物品图、高清、音频）。

约束总则：不改旧 Workbench 组件（`stage-*-v2/v3`、`EpisodeWorkbench.vue` 等）；entity 改动只允许加列（走迁移）；文案/风格随邻代码。

---

## A 部分：S-01~S-09 修复设计

### S-01 阶段就绪状态机

**改动点**：
1. 新增 `src/core/platform/episode-production/services/readiness.service.ts`（主进程）：`evaluateEpisode(episodeId)` 返回四个阶段的就绪状态：
   - 剧本：episode_scripts 存在且 scene_scripts 非空 → ready；
   - 资产：项目 binding 数>0 且**每个出场角色/地点都有主图**（asset_image is_main 且有 imagePath）→ ready；缺哪些列出；
   - 分镜：storyboards 非空且 characters[].characterId 全非空（空 characters 数组的镜不算不合格）→ ready；
   - 合成：当前有效片段（非 superseded）全部 completed 且有 video_path → ready。
2. IPC `ep:episode-readiness`（episode.handler 或新 readiness.handler）+ preload 暴露。
3. `EpisodeStudio.vue`：四个 tab 按钮加状态点（绿=就绪 / 灰=未就绪），tab 切换不阻断，但**未就绪时该 tab 顶部显示一条提示条**（缺什么 + 去哪个 tab 补）；分镜 tab 的「批量生成分镜」在剧本未就绪时点击给明确提示（不再等 LLM 报错）；合成 tab「导出 MP4」在片段未就绪时按钮禁用（原本就有缺视频硬锁，接 readiness 统一）。

**验证**：新空项目逐 tab 看提示条内容正确；第一集（已完成）全绿。

### S-02 关键帧画廊

**改动点**：`StageStoryboardEditor.vue`（分镜编辑器）每镜卡片展开区（或镜头行下方）显示该镜 start/end 关键帧缩略图（数据来自 `ep:list-keyframes` 已有 IPC + `toImageUrl`），每张图标注：frame_role、参考了哪张资产图（storyboard_keyframe.referenceOverrides 或 image_assets 关联）、「重新生成」按钮（调已有 `regenerateKeyframe` IPC）、「换参考图」入口（复用既有 KeyframeReferencePicker 组件——先确认其路径与 props）。
- 无关键帧时显示"未生成（生成视频时自动创建）"。

**验证**：第一集编辑器展开镜头 → 看到首尾帧图；点重新生成 → 图更新。

### S-03 手动分段

**改动点**：
1. `ep-segmentation.service.ts` 新增 `mergeSegments(segIdA, segIdB)`（同场景相邻、合计时长 ≤15s、均非 generating）与 `splitSegment(segId, afterShotId)`（段内 ≥2 镜），均重排 seq 并重算 prompt（复用 recompute 的聚合逻辑）。
2. `segment.handler.ts` 新增 `ep:merge-segments` / `ep:split-segment`；preload 暴露。
3. 分镜 tab 片段行（`StageStoryboardView.vue` 片段操作条）：「拆分」（选断点镜）与相邻段「合并」按钮。

**验证**：第一集合并两个 6s 段 → 一段 12s；再拆开 → 段数恢复；合成页片段数同步。

### S-04 制作助手能力对齐

**改动点**（全部在 Studio agent 面板的工具面，`src/core/platform/episode-production/agent/`）：
1. `ep-agent-tools.ts` / `ep-agent-actions.ts`：给 agent 补齐后半程动作——`generate_keyframes`（调 generateKeyframesForStoryboard）、`generate_segment_video`（调 SegmentVideoService.generateForSegment，读项目 config.videoModel/videoQuality/videoSteps）、`export_mp4`（调导出 runner）。注意 8a70bf6e 提交在旧链路已有这四工具的实现——**参考其动作语义但不 import 旧 UI**；服务层调用是共享的。
2. maxCalls=1 限制放宽：同一动作按不同参数（不同资产/分镜）允许每类 3 次/轮（找 tool-registry 的上限配置处，按 action 名+参数 hash 去重判定）。
3. 上下文注入：agent 系统提示词里注入当前 episode 状态快照（当前 tab 由 renderer 随消息带上 contextHint；阶段就绪状态用 S-01 的 readiness 结果）。

**验证**：助手对话"为片段 22 生成视频" → 落库 generating→completed；"导出本集" → 出 MP4。

### S-05 定妆图确认闸门 + 影响面

**改动点**：
1. `asset_image` 加列 `confirmed INTEGER DEFAULT 0`（迁移）；资产 tab 主图卡加「确认定妆」/「撤销确认」按钮（`AssetGallery.vue`）。
2. 关键帧 `collectReferenceImages`：角色/地点/物品只选用 confirmed=1 的图；某资产无 confirmed 图 → 该资产不注入参考（并在关键帧日志 warn）。**为兼容既有数据：迁移时把现有 is_main=1 的图全部置 confirmed=1**（第一集现有定妆图不受影响）。
3. 影响面：资产行 hover/详情显示"被 N 个关键帧引用 / M 个片段使用"（storyboard_keyframe 经 referenceOverrides/链路和 storyboards.characters 统计）；删除主图时提示该数字。
4. 「重建定妆图后级联重生关键帧」：确认新主图时如该资产已被关键帧引用，弹窗问"是否重新生成引用它的关键帧"→ 是则批量 regenerateKeyframe。

**验证**：阿蘅主图撤销确认 → 新关键帧不再引用她；重建确认后触发级联重生。

### S-06 场景级局部重拆 + 局部重生

**改动点**：
1. `script.handler.ts` 新增 `ep:regenerate-scene`（sceneId）：只重生成该场景（LLM 重出该场景结构化数据，保留其它场景），复用 SceneBindingWriter 写回；该场景的 storyboards 删除 → 关联片段由 H4 逻辑标 superseded（视频文件保留）。
2. 剧本 tab 场景列表（`StageScriptView.vue`）每场加「重新生成此场景」按钮（二次确认）。
3. 分镜 tab 对应场景可单独 cogen：cogen service 加 `cogenStoryboardsForScene(sceneId)` 入口（现有逐场景逻辑抽出来即可），分镜 tab 场景行加「重新生成此场景分镜」。

**验证**：改场景 2 的一句对白 → 只该场景重拆，场景 1/3 分镜与视频不动。

### S-07 合成 tab 增强

**改动点**（`StageComposeTab.vue` + 对应服务）：
1. 「全部生成配音」按钮：逐场景调 generate_scene_audio 对应服务（TTS 不可用时给出配置引导，已有明确报错语义保持）。
2. 导出版本留档：导出成功后在 `video_episodes` 记录导出历史（新表 `ep_export_history`：episodeId/outputPath/durationSec/createdAt——迁移加表）或最小方案：输出路径默认自动带时间戳，合成页显示最近导出列表（读 history 表）。合成页加"导出记录"小块 + 「打开文件夹」（已有）。
3. 片段排序：片段行加「上移/下移」按钮（改 seq，调 segmentRepo update 交换；不同场景间不允许移动）。

**验证**：导出两次 → 历史两条记录、文件各自独立；上移片段 → 预览顺序变化。

### S-08 产出自检

**改动点**：
1. 新增 `quality-check.service.ts`（主进程）：`checkEpisode(episodeId)` 输出：
   - 关键帧→定妆图引用覆盖率（有关键帧且 refs 非空的比例）；
   - 字幕↔剧本对白覆盖率（SRT 条目文本与 scene_dialogues 文本的命中比例）；
   - 片段时长与分镜预算偏差（|actual-est|>2s 的片段列出）；
   - （可选，有 VLM 配置时）首帧与参考图相似度：callVLM 打分 1-5（`services/ai-call` 已有 callVLM）。
2. 合成 tab 加「质量自检」按钮 + 结果面板（条目列出，红/黄/绿）。

**验证**：第一集跑自检 → 四项指标有数值；故意删一张关键帧的 refs 后重跑 → 覆盖率下降被检出。

### S-09 成本与耗时面板

**改动点**：
1. ai-call 已有结构化日志但没落库——新增 `ai_call_stats` 表（迁移：callType/provider/model/durationMs/projectId/createdAt），`services/ai-call.ts` 的完成/失败打点处异步 insert（fail-soft）。
2. Studio 顶栏（或项目设置旁）加「用量」小弹窗：按 callType 聚合（次数、总耗时、按模型的耗时），视频段附"turbo≈4 分钟/段、高质量≈35 分钟/段"的静态参考文案；视频生成按钮 tooltip 显示当前 quality/steps 预估耗时。

**验证**：跑一次生成后用量面板有记录；换 quality 后 tooltip 文案变化。

---

## B 部分：重跑专项

### P-A 多视角定妆 + 按视角选参考图

**事实**：`reference-image-selector.ts` 已支持 view/expression/outfit 维度评分；`AssetGallery` 已有 正面全身/正面半身/左侧半身/右侧半身/全景左侧/全景右侧 槽位与「一键生成」派生（Kontext 单图派生，以主图为参考）。缺口：关键帧选图时**没传 view 维度**。

**改动**：
1. `keyframe-generation.service.ts` 的 `collectReferenceImages`：角色 dims 增加 `view`——由分镜 shotType 映射：close/extreme_close/detail/medium_close → 'front_half'（正面半身）；long/extreme_long/full → 'front_full'（正面全身）；facing=left/right 的分镜 → 'left_half'/'right_half'。映射表写成常量放 selector 同目录。（具体 label 以 AssetGallery 的 label 为准，先读代码对齐。）
2. 资产 tab：阿蘅/陈舟 用「一键生成」补齐全部槽位派生图（操作流程，无代码改动）。

**验证**：近景镜关键帧日志 refs 指向半身图、远景镜指向全身图。

### P-B 在线 API 制作带字物品图

**问题**：Krea2/Kontext 出的名册/生死簿上汉字全是乱码；H3 视频里的文字也跟着乱。在线模型（百炼 wan2.7-image / qwen-image-3.0）中文渲染好。

**改动**：
1. 资产图生成支持指定 provider/model：检查 `main-image-generator.service.ts` 的 provider 选择（pickImageModel 自动挑第一个）——加可选参数 providerConfigId/modelId 透传；`AssetGallery.vue` 生成按钮旁加模型下拉（默认=自动），选项来自启用 provider 的 image 模型（复用设置页的数据加载）。
2. 操作流程（重跑时）：引渡名册/生死簿/灯芯信物的主图改用在线模型（阿里百炼 wan2.7-image 或 qwen-image-3.0，实测选一个出字最稳的）重新生成并确认。

**验证**：物品图上的"引渡名册"等字清晰可读；引用该图的关键帧/视频里文字不再是乱码（抽帧核）。

### P-C 高清生成

**改动**：无代码改动。项目设置 videoQuality=high、videoSteps=20；导出选 1080p。H3 输出分辨率由网关决定（横屏实测 1248×704），导出 1080p 为上采样——在导出对话框 1080p 选项旁加注"源分辨率 1248×704，1080p 为放大"（ExportDialog 文案小改）。

**验证**：片段生成日志 steps=20；成片 1080p。

### P-D 音频炸音处理

**诊断**：turbo 片段 mean -19.5dB/max -6.3dB；终片 max -0.7dB（amix normalize=0 叠加近满幅）。H3 turbo 音轨本身噪声大（steps=4 的 AI 配音质量差），高质量 steps=20 预期改善；导出侧需要响度归一防爆音。

**改动**：
1. `episode-mp4-exporter.service.ts` 混音链：每路音源 `aresample=48000` 后追加 `loudnorm=I=-16:TP=-1.5:LRA=11`（单遍动态模式即可，避免两遍扫描的复杂度；已有 normChain 处扩展）。
2. 重跑时全部片段用 steps=20 高质量（音轨质量随画质提升）。

**验证**：终片 volumedetect max_volume ≤ -1.5dB、mean 在 -18±2dB；人耳试听无爆音（抽几段用 astats 看 clipping 为 0）。

---

## 执行计划

**Wave 1（4 并行 coder，core/服务层）**
- W1：S-01 readiness service + IPC + Studio tab 状态点/提示条/按钮 gating
- W2：S-02 关键帧画廊（编辑器）+ P-A 视角选图（keyframe service dims.view）
- W3：S-03 手动分段（service+IPC+UI）+ S-06 场景级局部重拆/重生（service+IPC+UI）
- W4：S-04 agent 后半程工具 + maxCalls 放宽 + 上下文注入

**Wave 2（3 并行 coder，依赖 Wave 1 的 readiness/服务）**
- W5：S-05 定妆图确认闸门（迁移 confirmed 列 + 回填 is_main）+ 影响面 + 级联重生
- W6：S-07 合成 tab（配音全量、导出留档、排序）+ S-09 用量面板（迁移 ai_call_stats + 打点 + UI）
- W7：S-08 自检服务 + 面板 + P-B 资产图 provider/model 选择 + P-D loudnorm + ExportDialog 文案

**Wave 3（真机重跑全流程）**：
1. 重启应用（含全部改动 + 迁移）；
2. 资产 tab：阿蘅/陈舟全槽位派生图补齐；物品图（名册/生死簿/灯芯信物）切在线模型重做；全部主图「确认定妆」；
3. cogen force 重跑（新分镜视角标注生效）；重新分段；旧片段 superseded；
4. 逐段参考图模式生成（high/steps=20，每段 30~45 分钟，8 段约 4~5 小时）；
5. 合成：自检面板跑一遍 → 导出 1080p；
6. 终评：抽帧核一致性/文字可读性 + volumedetect 核音频 + 剧本匹配度评估。

**风险**：Wave 3 第 4 步耗时最长（不可压缩，高质量是用户明确要求）；若 H3 高质量音轨仍炸，退而求其次：导出时剥离原音轨只留 TTS/静音（需 TTS provider，当前无 → 记录为阻塞）。
