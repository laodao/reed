# Episode Production 全面优化 · 完整规范文档

> 版本：2026-05-09 v1（替代 [`2026-05-09-comprehensive-design.md`](./2026-05-09-comprehensive-design.md)，结构按"as-is → to-be → diff → 实施"重组）
> 来源 review：[asset-prompt-assembly](./2026-05-09-asset-prompt-assembly-review.md) · [libtv-xiaoyunque-comparison](./2026-05-09-libtv-xiaoyunque-comparison.md) · [asset-generation](./2026-05-09-asset-generation-review.md) · [integrated-optimization-plan](./2026-05-09-integrated-optimization-plan.md)
>
> 本文档目的：作为可被 review 的产品规范（先 as-is，再 to-be，再 diff），覆盖 Episode Production 模块从当前到优化后的完整画像；并以"修改清单（细到文件）+ 新增完整设计"作为开发交接的执行依据。

---

## 目录

```
§0 前言：用户三个核心目标 / 范围 / 术语 / 防崩 / 回滚
§1 当前实现完整梳理（as-is）
  1.1 6 stage 功能清单
  1.2 三个核心子流程数据流
  1.3 跨 stage 关键业务约束
  1.4 界面 inventory（顶层入口 + 6 stage view + dialog + store）
  1.5 当前用户主流程
  1.6 当前实现的问题清单（review 结论，要解决的就是这些）
§2 期望实现完整梳理（to-be）
  2.1 期望 6 stage 功能清单
  2.2 期望用户流程（标准通道 + AI 一键 + 跨项目库 + 视频起步）
  2.3 期望界面 inventory（新增 / 修改 / 不变）
§3 Diff: 修改清单 + 新增清单
  3.1 修改清单（按文件聚合）
  3.2 新增清单（按功能聚合 — 每项完整设计）
§4 实施排期（Phase 1-5 + commit 划分）
§5 TDD 与测试策略
§6 风险 / 回滚 / 元保证
§7 立即行动
```

---

# §0 前言

## 0.1 用户三个核心目标

1. **高质量输出**：生成内容指令遵循度高、跨集 / 跨分镜的角色 / 地点 / 物品一致性强。
2. **简单易用**：兼顾大众短剧用户（流程引导 / AI 自动化）和专业导演 / 编剧（镜头语言 / 故事板 / 子画布）。
3. **逻辑过程清晰**：用户能 self-debug —— 看到 prompt / 参考图链 / 派生关系 / 错误码，定位为什么效果不好。

## 0.2 范围

22 项能力分布在 4 个域：

| 域 | 能力数 | 例 |
|---|---|---|
| 资产域 | 11 | 字段双层 / AI 字段提取 / 透明度面板 / 三视图 / 角色形象组 / 跨项目库 / 数字人池 / 视频提取主体 |
| 分镜域 | 7 | 双模板画面描述 / 摄像机参数化 / 运镜 25 预设 / 打光 12 预设 / 全局编号 / 多基图派生 / 局部子画布 |
| 剧本→分镜 | 1 | 9 帧故事板草稿 |
| 工作流入口 | 3 | AI 一键通道 / Agent 接入 / 视频解析（参考视频拆分镜） |

## 0.3 术语

| 术语 | 含义 |
|---|---|
| **stage** | EpisodeWorkbench 的 6 个阶段 ① 内容 / ② 资产 / ③ 剧本 / ④ 分镜 / ⑤ 制作 / ⑥ 合成 |
| **binding** | 资产绑定（character_bindings / location_bindings / item_bindings），项目内的"角色实例" |
| **effective** | binding 经 source_type 投影 + override 合并后的扁平字段（送给 prompt 装配用） |
| **subject** | 部分 provider（KlingO/MJ V7 等）原生支持的"主体"概念，与通用 reference image 路径不同 |
| **三视图** | character bible，正面 / 3q左 / 3q右（或正/侧/背）三张视角图 |
| **角色形象组**（Character Reference Set） | 同一 character_binding 关联的多张图集合（主图 + view + expression + outfit + pose），生图时全部作为 multi-reference 喂给 provider — 取代了"LoRA 训练"路径（调研见 §3.2 D1 决策记录） |
| **multi-reference** | 各 cloud image API 公开的多图参考能力（Seedream 4.5 多图 / 万相 image-edit 1-4 张 / 可灵 element_list / 即梦智能参考） |
| **数字人池** | 内置 10-30 个精选预设角色（preset_digital） |
| **as-is / to-be** | 当前状态 / 期望状态（产品文档术语） |

## 0.4 防崩 / 回滚

- 单 commit ≤ 4 文件
- 每 commit 跑 `npx vue-tsc --noEmit` 不引入新错误
- Phase 1-3 严格零 schema 变更；Phase 4+ 改 schema 前重新 pg_dump 备份
- 数据库已备份：`.backups/the_bot_test-20260509-182719.sql`（PG16 兼容版），回滚命令见 §6

---

# §1 当前实现完整梳理（as-is）

## 1.1 6 stage 功能清单

### ① 内容（pending）

**数据表**：
- `video_episodes` (`src/core/database/entities/episode-production/video-episode.entity.ts:67-76`) — 剧集（含 `story_era` / `story_region` / `story_background_extra` 故事背景三字段）
- `episode_scripts` (`episode-script.entity.ts:1-64`) — 剧本总体（source_type='outline' | 'uploaded'）
- `scene_scripts` (`scene-script.entity.ts:28-36`) — 场景剧本（强约束 `location_binding_id`）

**业务能力**：
- 剧集 CRUD（含故事背景三字段）
- 内容来源选择（关联大纲 / 上传长文）
- AI 生成 episode 概要 + 场景拆分
- binding 修复（修正 AI 识别角色名与项目库不一致）— `script-binding-fixer.service.ts:57`

**关键 service**：`SceneScriptService` / `EpisodeScriptService` / `ScriptBindingFixerService`

**入口 IPC（top）**：`ep:get-character-bindings` / `ep:generate-storyboard` / `ep:update-storyboard`

### ② 资产（asset_prep）

**数据表**：
- `character_bindings` (`character-binding.entity.ts:62-80`) — 角色绑定
  - `source_type` 双源：`'linked_lw'`（关联长文 character）/ `'standalone'`（独立创建）
  - `override_*`（覆盖层）+ `standalone_*`（仅 standalone 用）
  - 扩展字段：`alias` / `role` / `gender` / `age` / `race` / `style_anchors` / `voice_id` / `voice_speed` / `voice_pitch` / `voice_emotion` / `portrait_id` / `outfits_extra`
  - `reference_image_path`（spec 2026-05-09）
- `location_bindings` (`location-binding.entity.ts:67-81`) — 地点绑定（精简版）
- `item_bindings` (`item-binding.entity.ts:61-75`) — 物品绑定（更精简）
- `asset_image` (`asset-image.entity.ts:34-104`) — 统一图谱
  - `assetType` × `assetId` × `category`（main / view / expression / outfit / pose / variant / time_variant(legacy) / weather_variant(legacy) / angle_variant(legacy) / context / panorama_360 / panorama_snapshot）
  - `label`（用户自由文本）/ `prompt` / `negative_prompt` / `metadata`(JSON) / `derived_from_image_id` / `is_main` / `width` / `height`

**业务能力**：
- Effective 投影合并（source_type 决定数据源 + override 覆盖）
- 主图生成：`asset-identity-prompt.ts` 装配身份 prompt → `character-constraints.ts` 加硬约束 → 调 ImageGenerator
- 派生图：reference image（主图）+ additional_prompt → 类目化派生（view / expression / outfit / pose）
- 多张主图（spec 2026-05-09）：仅 location 已实现 dialog；character / item 走老路径
- 360 全景图（location 专属）
- 资产参考图上传（character/location/item 通用）

**关键 service**：`AssetImageService` / `CharacterAssetService` / `LocationAssetService` / `ItemAssetService` / `GalleryDerivationService` / `MainImageGeneratorService`

**入口 IPC（top 8）**：`ep:asset:character:create-standalone` / `ep:asset:character:create-linked-lw` / `ep:asset:character:effective` / `ep:asset:derive:single` / `ep:asset:derive:batch` / `ep:asset:character:update-extra` / `ep:asset:image:list-by-asset` / `ep:asset:image:add-main`

### ③ 剧本（与 ① 合并展示，URL 状态 pending → scripting → readonly）

**数据表**：
- `scene_scripts` (`scene-script.entity.ts:56-74`) — 含 characters / dialogues / actions JSON
- `scene_dialogues` / `scene_actions` / `scene_characters`（各自实体）

**业务能力**：
- AI 拆 scene_scripts（每场景含出场角色 / 对白 / 动作 / 地点）
- binding 强约束补齐（scene.characters[*].characterBindingId / scene.location_binding_id 必填）
- 场景内角色细化：scene_characters 表存位置 / 表情 / 动作 / 朝向

**关键 service**：`SceneScriptService` / `StoryboardCharacterService`

### ④ 分镜（storyboarding）

**数据表**：
- `storyboards` (`storyboard.entity.ts:1-179`)
  - 镜头语言：`shot_type` / `camera_angle` / `camera_movement` / `movement_duration`
  - 描述：`frame_description`（自由 textarea）
  - 转场：`transition_type` / `transition_duration_ms` / `transition_direction` / `transition_easing` / `transition_color`
  - 关联：`narration_id` / `dialogue_ids[]` / `action_ids[]` / `characters[]` / `location_binding_ids` / `item_binding_ids`
  - 一致性：`reference_image_ids`（kind:bindingId → imageId override）
  - 关键帧：`use_keyframes` / `keyframe_count` / `video_mode`
  - 视频：`video_path` / `video_provider_id` / `video_model_id` / `include_in_final`
  - 3D 暂存：`use_3d_staging` / `staging_layout_id`
  - 背景参考：`background_ref_image_id`（指向 panorama_snapshot）
- `storyboard_keyframes` (`storyboard-keyframe.entity.ts:1-78`)
  - `frame_index` / `frame_role`('start'|'end'|'middle') / `time_percent`
  - `image_asset_id` / `prompt` / `user_prompt_override`
  - `reference_overrides`（帧级覆盖）
- `storyboard_characters`（位置 / 表情 / 动作 / 朝向）

**业务能力**：
- 镜头语言工具栏（景别 / 角度 / 运镜 / 时长 各 6 类 select）
- 转场配置（5 字段）
- 分镜内角色 / 地点 / 物品（spec 2026-05-09）
- AI 拆分镜（一次出 N 个）
- 关键帧链生成（planKeyframes 算 start/end/middle 顺序与参考依赖）
- 关键帧 prompt 装配：`buildKeyframePrompt` 拼镜头 + 资产 ref + 时刻语言（"初始"/"结束"/"中间"）
- 参考图选择：`pickReferenceImage` 按维度评分（character: view+4/expression+3/outfit+2/pose+1；location: angle+4/time+2/weather+1）

**关键 service**：`KeyframeGenerationService` / `KeyframePromptBuilder` / `ReferenceImageSelector` / `StoryboardService`

**入口 IPC（top 8）**：`ep:generate-keyframes` / `ep:regenerate-keyframe` / `ep:set-keyframe-reference-overrides` / `ep:list-keyframes` / `ep:plan-keyframe-regen` / `ep:list-asset-images` / `ep:storyboard:set-background-ref`

### ⑤ 制作（producing）

**数据表**：复用 `storyboard_keyframes` + `storyboards.video_*` 字段

**业务能力**：
- 关键帧图像生成（逐帧调 ImageGenerator）
- 视频模式选择：`pickVideoMode(keyframeCount, capabilities)` 自动选 text2video / image2video / keyframes2video
- 视频生成：按选定 mode 调 VideoProviderAdapter
- 模式降级：keyframes2video → image2video → text2video → null
- 单帧重生成（不触发传播）
- 重生成传播：`planRegenPropagation`（改 start → required+suggested all middle/end）

**关键 service**：`VideoSegmentService` / `VideoGenerationService`

**Provider 能力**（`VideoProviderCapabilities`，`video-provider-adapter.ts`）：
```ts
{ supportsText2Video, supportsImage2Video, supportsKeyframes2Video, maxKeyframes }
```
**缺**：`subjectSupport` / `maxSubjects`（Phase 3 加）

**入口 IPC**：`ep:generate-keyframes` / `ep:regenerate-keyframe` / `ep:set-keyframe-reference-overrides` / `ep:synthesize-storyboard-video` / `ep:get-video-presets`

### ⑥ 合成（composing）

**数据表**：复用 `storyboards.video_path` + `episode_scripts`

**业务能力**：
- 时间线装配：`TimelineBuilderService.buildEpisodeTimeline` 遍历 scenes → 按 use_keyframes 决定路径 → 合并所有 storyboard(include_in_final=1)
- 字幕生成：`SubtitleService` 从 scene_dialogues / narration → SRT
- MP4 导出：`EpisodeMp4ExporterService` ffmpeg 拼接片段 + 音频 + 字幕

**关键 service**：`TimelineBuilderService` / `SubtitleService` / `EpisodeMp4ExporterService`

**入口 IPC**：`ep:build-timeline` / `ep:preview-subtitle` / `ep:export-mp4`

---

## 1.2 三个核心子流程数据流

### 1.2.1 资产生成 / 派生子流程

```
用户在 ② 资产 stage 点 "生成主图" / "派生 view"
        │
        ▼
[A] CharacterAssetService.getEffective()
    根据 source_type 投影 + override 合并
        │
        ▼
[B] buildAssetIdentityPrompt(assetType, eff, storyBg)
    asset-identity-prompt.ts:112-152
    拼 name + description + (character: alias/role/gender/age/race/appearance/outfit/outfitsExtra)
       + styleAnchors（中英双写）+ 故事年代/地域/extra
        │
        ▼
[C] character-constraints.ts / location-constraints.ts / item-constraints.ts
    加硬约束（直立全身 / 纯背景 / 无帽子 / 光照均匀）+ negativePrompt
        │
        ▼
[D] ImageGenerator.generate({ referenceImagePaths, prompt, negativePrompt, label })
    GalleryDerivationService 注入 ImageGenerator 依赖（按用户启用 provider 路由）
        │
        ▼
[E] AssetImageService.addImage()
    写 asset_image: id (ai_xxxx) + assetType + assetId + category + label
                   + prompt + imagePath + isMain + derivedFromImageId
```

### 1.2.2 关键帧链式生成子流程

```
用户在 ④ 分镜 stage 触发 "使用关键帧"
        │
        ▼
[A] planKeyframes(keyframeCount)
    keyframe-chain-strategy.ts:46-82
    生成顺序：
      frame 0:    role='start',  timePercent=0,    refDependencies=[]
      frame n-1:  role='end',    timePercent=1,    refDependencies=[0]
      frame i:    role='middle', timePercent=i/(n-1), refDependencies=[0, n-1]
        │
        ▼
[B] for each frame in plan:
        │
        ▼
    [B.1] ReferenceResolver: 从 storyboard 取 binding ID → 拉 effective 数据
          (ResolvedCharacterRef / LocationRef / ItemRef)
        │
        ▼
    [B.2] 选参考图（优先级链）：
            1. keyframe.reference_overrides[kind:bindingId]    用户帧级
            2. storyboard.reference_image_ids[kind:bindingId]  用户分镜级
            3. pickReferenceImage(imageSvc, kind, bindingId, dims)  自动评分
            4. binding 默认主图                                  兜底
        │
        ▼
    [B.3] describeFrameMoment(frameRole, timePercent)
          → "初始设定" / "最终画面" / "中间动作"
        │
        ▼
    [B.4] buildKeyframePrompt(storyboard, sceneScript, refs, frameRole, timePercent, styleConfig)
          keyframe-prompt-builder.ts:1-80
          拼 shotType + composition + character refs + location refs + item refs + motion + 时刻语言 + style
        │
        ▼
    [B.5] ImageGenerator.generate() → imagePath
        │
        ▼
    [B.6] AssetImageService.addImage 写 image_assets
          StoryboardKeyframeRepository.save 写 storyboard_keyframes
              (storyboardId, frameIndex, frameRole, timePercent, imageAssetId, prompt, ...)
```

### 1.2.3 视频片段生成子流程

```
用户在 ⑤ 制作 stage 点 "生成视频"
        │
        ▼
[A] VideoSegmentService.generateForStoryboard(storyboardId)
    加载 storyboard_keyframes（frame_index 升序）
    每个 keyframe: imageAssetId → asset_image.imagePath
        │
        ▼
[B] pickVideoMode(keyframeCount, adapter.capabilities)
    provider-capability-matcher.ts:47-78
        keyframeCount === 0  → text2video
        keyframeCount === 1  → image2video
        keyframeCount >= 2   → keyframes2video
    降级链：keyframes2video → image2video → text2video → null
        │
        ▼
[C] 调 VideoProviderAdapter
    text2video:       textToVideo(prompt, durationSec, w, h)
    image2video:      imageToVideo(firstFramePath, prompt, durationSec, w, h)
    keyframes2video:  keyframesToVideo([{imagePath, timePercent}], prompt, durationSec, w, h)
        │
        ▼
[D] StoryboardEntity.update(videoPath, video_mode, video_provider_id, video_model_id, duration)
```

---

## 1.3 跨 stage 关键业务约束

| # | 约束 | 位置 | 业务含义 |
|---|---|---|---|
| 1 | 分镜继承场景资产 | `storyboard.entity.ts:57-65` | 分镜未显式覆盖时，回退使用 scene_script.location_binding_id 和 scene.characters[*].props |
| 2 | location_binding_id 强约束 | `scene-script.entity.ts:35-36` | 场景必须有 location_binding_id，剧本完整性 validator 要求非空 |
| 3 | source_type 投影规则 | `character-binding.entity.ts:25-31, 62-80` | linked_lw 时 long_writing_character_id 非空；standalone 时必为 null |
| 4 | asset_image.isMain 唯一性 | `asset-image.entity.ts:81-82` | 同 asset_id × assetType 下最多一张 isMain=1；切主图自动降旧 |
| 5 | 关键帧参考链顺序 | `keyframe-chain-strategy.ts:56-79` | start (无参考) → end (参考 start) → middle (参考 start + end) |
| 6 | reference image override 优先级 | `storyboard-keyframe.entity.ts:70` / `keyframe-generation.service.ts:69-99` | keyframe.reference_overrides > storyboard.reference_image_ids > auto pickReferenceImage |
| 7 | 关键帧参考评分维度 | `reference-image-selector.ts:23-51, 70-78` | character: view+4/expression+3/outfit+2/pose+1 / location: angle+4/time+2/weather+1 / item: view+3/context+1 |
| 8 | 视频模式降级链 | `provider-capability-matcher.ts:12-14` | keyframes2video → image2video → text2video → null |
| 9 | 分镜视频落库 | `storyboard.entity.ts:88-147` | video_path 必须与 video_mode 配对；include_in_final=1 进合成 |
| 10 | 故事背景参与 prompt | `asset-identity-prompt.ts:142-150` / `video-episode.entity.ts:67-76` | story_era / story_region / story_background_extra 进主图 + 关键帧 prompt |
| 11 | use_keyframes 决策 | `storyboard.entity.ts:126-127` | =1 时关键帧流程；=0 时直接用 frame_description + 资产引用生视频 |

---

## 1.4 当前界面 inventory

### 1.4.1 顶层入口

| 组件 | 路径 | 用途 |
|---|---|---|
| `EpisodeWorkbench.vue` | `src/renderer/src/views/EpisodeWorkbench.vue` | 6 stage 主框架（el-tabs 切换） + StageHeaderBar + AssetSidebar |
| `EpisodeProjectListV2.vue` | `src/renderer/src/views/EpisodeProjectListV2.vue` | 项目列表（左 sidebar + 右剧集列表 + dialog） |
| `EpisodeProductionPage.vue` | `src/renderer/src/views/EpisodeProductionPage.vue` | 单页入口（不在 workbench 路径） |

### 1.4.2 6 stage view 现状

每 stage 已演进到的版本（V1 / V2 / V3）：

| Stage | V1 | V2 | V3 | 当前生产用 |
|---|---|---|---|---|
| ① 内容 | StageContentView | — | StageContentScriptView（合 ①+③） | **V3** |
| ③ 剧本 | StageScriptView | — | （同 ① 合并） | **V3** |
| ② 资产 | AssetStageView | AssetStageViewV2 | — | **V2** |
| ④ 分镜 | StageStoryboardView | StageStoryboardViewV2 | — | **V2** |
| ⑤ 制作 | StageProductionTabContent | StageProductionViewV2 | — | **V2** |
| ⑥ 合成 | StageComposeView | StageComposeViewV2 | — | **V2** |

> ⚠ **关键事实**：V2 stage view 的资产域子组件仍依赖 V1 GalleryEditor（Character / Location / Item 三个图谱编辑器都还是 V1 在 `stage-asset/` 目录下）。本设计**不重写 GalleryEditor**，只在其上加新功能。

#### V1 → V2 升级策略（决策）

**决策：本期 Phase 1-5 不升级 V1 GalleryEditor 到 V2**。

**理由**：
1. 风险控制：V1 GalleryEditor 是当前生产稳定路径（角色派生 / 地点多主图 / 360 全景 / 物品精简），重写到 V2 工程量 1-2 周但用户感知不强；本期目标是 22 项新能力，不是重构存量
2. 兼容路径：本期所有新功能（透明度面板 / 多角度 / 多基图派生 / 角色形象组）都挂在 V1 GalleryEditor 上 — 加 ⓘ 入口、加按钮、加 dialog；不破坏既有 5 处 / 2 处 / 2 处 thumb-tools 结构
3. 下一阶段：Phase 6（待规划）可考虑 GalleryEditorV2 重构 — 届时把"分镜中心化卡片布局"思路（仿 ⑤ 制作 stage）应用到 ② 资产 stage 的图谱区

**例外**：
- V1 文件的 thumb-tools 结构有 9 处（character 5 / location 2 / item 2），本期 C3 全部加 ⓘ — 视为"加功能"而非"升级版本"
- 长期规划：V1 → V2 升级若推进，参照 character-asset-card 等已升级到 V2 的范式（保留 service / store / IPC 不变，只重写 vue 模板 + 局部 store 切片）

### 1.4.3 ② 资产 stage 详细 inventory

V2 主入口 `AssetStageViewV2.vue`：
```
布局：顶部进度条 + 4 个资产类别分区
分区 4 个：角色 / 地点 / 物品 / 语音
每分区：卡片网格 + 新建按钮 + 生成/跳过/完成 action
```

V2 子组件（路径 `src/renderer/src/components/episode-production/stage-asset-v2/`）：

| 组件 | 用途 |
|---|---|
| CharacterAssetCardV2 | 角色卡（缩略图 + AssetSourceTag + 状态 tag） |
| character/CharacterAssetEditorV2 | 角色编辑器主壳 |
| character/CharacterCardFormV2 | 角色表单（11 字段平铺：姓名/别名/定位/性别/年龄/人种/描述/服装/风格/声音/形象库/参考图） |
| LocationAssetCardV2 | 地点卡 |
| location/LocationAssetEditorV2 | 地点编辑器 |
| location/LocationCardFormV2 | 地点表单 |
| ItemAssetCardV2 | 物品卡 |
| VoiceAssetCardV2 | 语音卡 |
| shared/ReferenceImageField | 参考图上传字段（spec 2026-05-09） |

V1 图谱编辑器（**仍生产使用**，路径 `src/renderer/src/components/episode-production/stage-asset/`）：

| 组件 | 用途 |
|---|---|
| character/CharacterGalleryEditor | 角色图谱（主图 + view + expression + outfit + pose） |
| location/LocationGalleryEditor | 地点图谱（多张主图 + 变体 + 360 全景） |
| location/PanoramaSnapshotEditor | 360 全景快照 |
| location/AddMainImageDialog | 地点：添加主图（label / 描述 / metadata / 模式 = 生成 or 上传） |
| location/DeriveVariantDialog | 地点：派生变体（单基图选择） |
| item/ItemGalleryEditor | 物品图谱 |
| item/ItemAssetEditor + ItemCardForm | 物品编辑器 + 表单（V1） |

资产 dialog（`src/renderer/src/components/episode-production/dialogs/`）：

| Dialog | 用途 |
|---|---|
| CharacterDetailDialog / LocationDetailDialog / ItemDetailDialog | 详情查看 |
| BindCharacterDialog / BindLocationDialog / BindItemDialog | 场景出场绑定 |
| GenerateImagesDialog | 资产主图生成 |
| RegenerateDialog | 重生成（通用） |

### 1.4.4 ④ 分镜 stage 详细 inventory

V2 主入口 `StageStoryboardViewV2.vue`：
```
布局：左 220px 场景树（scene + storyboards 缩进） + 右主区（分镜网格 + inline 编辑面板）
分镜卡片：emoji 缩略图 + 状态徽章 + 时长标签
inline 编辑面板：镜头语言 toolbar + 关键帧数 visual 按钮 + 画面描述 + 镜头内角色 grid
```

镜头工具栏字段（line 281-340）：
- 景别 (`shotType`)：long / full / medium / medium_close / close / extreme_close
- 角度 (`cameraAngle`)：eye_level / high / low / birds_eye / worms_eye / dutch
- 运镜 (`cameraMovement`)：static / push / pull / pan / track / crane
- 时长 (`movementDuration`)：秒

转场工具栏字段（line 343+）：
- 类型 / 时长 / 方向 / 缓动 / 颜色

画面描述（line 422）：空白 textarea，**无引导**

dialog：
- StoryboardEditDialog（详细编辑）
- StoryboardCharacterEditDialog（分镜内角色配置）

### 1.4.5 ⑤ 制作 stage 详细 inventory

V2 主入口 `StageProductionViewV2.vue`：
```
布局：左 220px 场景树 + 右主区
右主区上半：分镜信息 panel + KeyframeGrid（关键帧九宫格）+ 视频预览（1/3 列）
右主区下半：资产卡（缩略图 + 提示词组装公式）+ AudioPanel（对话/旁白/BGM）
```

> 注：⑤ 制作 stage 已实现"分镜中心化"卡片布局 — **子画布雏形已存在**，缺的只是连线可视化。

子组件（`stage-production/`）：
- KeyframeGrid（关键帧 9 宫格）+ KeyframeRegenerateDialog
- KeyframeReferencePicker（参考链选择）
- ShotDetailPanel / ShotListPanel
- AudioPanel（对话/旁白/BGM）
- VideoSegmentPanel
- SynthesisDialog / ScriptViewDialog

### 1.4.6 全局 dialog 集合（`episode-production/dialogs/`）

| Dialog | 用途 |
|---|---|
| CreateEpisodeDialog | 新建剧集 |
| EditEpisodeDialog | 编辑剧集 |
| EntityEditDialog | 通用要素编辑 |
| CharacterDetailDialog / LocationDetailDialog / ItemDetailDialog | 详情查看 |
| BindCharacterDialog / BindLocationDialog / BindItemDialog | 场景绑定 |
| GenerateImagesDialog | 资产主图生成 |
| ImagePreviewDialog | 图片预览 |
| RegenerateDialog | 重生成 |
| SettingsDialog | 项目设置（分辨率 / 风格 / 字幕） |
| StoryboardEditDialog / StoryboardCharacterEditDialog | 分镜详细编辑 |
| SynthesisDialog | 视频合成 |

### 1.4.7 Pinia store

| Store | 路径 | 用途 |
|---|---|---|
| useEpisodeStore | `stores/episode-production/episode.store.ts` | 当前剧集 / 状态 |
| useProjectStore | `stores/episode-production/project.store.ts` | 项目列表 |
| useAssetStore | `stores/episode-production/asset.store.ts` | 角色 / 地点 / 物品 |
| useScriptStore | `stores/episode-production/script.store.ts` | 剧本 / 场景列表 |
| useStoryboardStore | `stores/episode-production/storyboard.store.ts` | 分镜列表 |
| useProductionStore | `stores/episode-production/production.store.ts` | 关键帧 / 视频 |
| useComposeStore | `stores/episode-production/compose.store.ts` | 合成 / 导出 |
| useActiveContextStore | `stores/episode-production/active-context.store.ts` | 当前激活 context |
| useWorkbenchStore | `stores/episode-production/workbench.store.ts` | activeTab |

---

## 1.5 当前用户主流程

### 1.5.1 标准通道（完整 6 stage）

```
1. 项目创建（EpisodeProjectListV2 → CreateEpisodeDialog）
        │ 选源类型（outline / 上传长文）
        │ 填故事背景（年代 / 地域 / 其他）
        ▼
2. ① 内容 + ③ 剧本（StageContentScriptView，sub-state pending → scripting → readonly）
        │ ExcerptPanel：原文片段
        │ StoryBackgroundPanel：故事背景配置
        │ AI 生成简介 + 拆场景
        │ 用户编辑 SceneInlineEditor（地点 / 时间 / 天气 / 对话）
        │ EntitySidebar：右侧角色/地点/物品要素列表
        ▼
3. ② 资产（AssetStageViewV2）— 4 分区**并列**显示，用户可任意顺序操作
        │ 角色分区：从长文引用 or 独立创建 → 填 11 字段 → 生成主图 → 在 GalleryEditor 派生 view (3q_left/3q_right/...)、expression、outfit、pose
        │ 地点分区：可加多张主图（不同视角，spec 2026-05-09）+ 派生变体 + 360 全景
        │ 物品分区：精简流程（主图 + view + context）
        │ 语音分区：选音色 + 试听
        │ （角色 / 地点 / 物品 / 语音 4 分区可并行操作；用户决定先后顺序）
        ▼
4. ④ 分镜（StageStoryboardViewV2）
        │ AI 自动拆分镜（按场景）
        │ 用户调镜头语言 toolbar（景别/角度/运镜/时长）
        │ 用户调转场（类型/时长/方向）
        │ 用户写画面描述（空白 textarea）
        │ 用户挑参考图（reference_image_ids）
        ▼
5. ⑤ 制作（StageProductionViewV2）
        │ 触发关键帧生成（链式 start → end → middle）
        │ 用户挑帧 / 重生成（reference_overrides）
        │ 触发视频生成（按 keyframeCount 自动选 mode）
        │ AudioPanel：配音 / BGM
        ▼
6. ⑥ 合成（StageComposeViewV2）
        │ 时间线（V1 视频 / 字幕 / A1 旁白 / A2 对话 / A3 BGM 多轨）
        │ 导出参数（分辨率 / 字幕 / 路径）
        │ MP4 导出
```

### 1.5.2 资产派生子流程

```
用户进 GalleryEditor → 选基图 → 选 category（view / expression / outfit / pose）
        │
        ▼
gallery-derivation.service.ts:
  - 加载 effective（character/location/item 各自 service）
  - 加载基图（baseImageId）
  - buildAssetIdentityPrompt + 派生 label 拼接
  - 加约束（character-constraints / location-constraints / item-constraints）
  - 调 ImageGenerator
  - 落 asset_image (category=要选的, isMain=0, derivedFromImageId=基图)
```

### 1.5.3 关键帧子流程

```
用户在分镜 stage 切 use_keyframes=1，设 keyframeCount
        │
        ▼
KeyframeGenerationService.generateKeyframesForStoryboard:
  - planKeyframes 算 start/end/middle 顺序
  - 逐帧:
    - ReferenceResolver 拉 binding 数据
    - 选参考图（override → reference_image_ids → auto → 主图）
    - buildKeyframePrompt 拼 prompt
    - ImageGenerator.generate
    - 落 image_assets + storyboard_keyframes
```

---

## 1.6 当前实现的问题清单

来自 4 份 review 的结论，按域整理：

### 资产域问题

| # | 问题 | 来源 review |
|---|---|---|
| P-1 | character / item 派生的 30+ 词中英双写身份保持文本约束在 2026 SOTA 模型上是过度工程，稀释 prompt 注意力 | asset-generation |
| P-2 | metadata 字段（alias / role）无差别拼进生成 prompt，是 noise | asset-generation |
| P-3 | 用户看不到 prompt / negativePrompt / 派生关系 / metadata（数据已落库但 UI 未暴露） | asset-generation |
| P-4 | 设定卡 11 字段平铺，新手不知哪些决定生成质量 | asset-generation |
| P-5 | 字段填写认知负担高（用户得逐字段填） | asset-generation / libtv-comparison |
| P-6 | character 三视图（character bible）需手动多次派生，多次独立调用一致性差 | libtv-comparison |
| P-7 | 跨集 / 跨项目重复创建同一角色（无库化） | asset-generation |
| P-8 | 新用户起步无内置数字人可选 | libtv-comparison |
| P-9 | reference image 路径已有但**没用满各 provider 的多图参数极限**（如 Seedream 4.5 / 可灵 element_list / 即梦智能参考；调研结论：4 家国内云 API 均不开放训练 LoRA 给外部 — 唯一可行路径是 multi-reference 增强）| asset-generation + 2026-05-09 LoRA 调研 |
| P-10 | 没法从已有视频提取角色多视角 | （新增需求） |

### 分镜域问题

| # | 问题 | 来源 review |
|---|---|---|
| P-11 | 画面描述是空白 textarea 无引导，新手不知写什么 / 写多写少 | libtv-comparison |
| P-12 | 缺摄像机参数化（焦距 / 光圈 / 相机风格） | libtv-comparison |
| P-13 | 运镜仅 6 类，缺 "希区柯克变焦 / OTS 过肩 / 360 环绕" 等命名预设 | libtv-comparison |
| P-14 | 完全没有打光控制 | libtv-comparison |
| P-15 | 分镜显示仅"场景X.分镜Y"，无全局唯一编号 | libtv-comparison |
| P-16 | 派生变体单基图选择，浪费 provider 多 ref 能力 | asset-prompt-assembly |
| P-17 | ⑤ 制作 stage 已分镜中心化但缺可视化连线（子画布雏形已在） | integrated-plan |

### 工作流问题

| # | 问题 | 来源 review |
|---|---|---|
| P-18 | 剧本→分镜 一次性出全部分镜数（10-30 个），用户只能逐个调 / 全删重生 | libtv-comparison |
| P-19 | 完整 6 stage 流程对大众短剧用户负担大，无快速通道 | integrated-plan |
| P-20 | 主流 provider（KlingO/MJ V7/Seedance 2.0）原生支持 subject 概念但没用上 | asset-generation |
| P-21 | 能力没暴露给 Agent / Skill（外部工具不能调） | （新增需求） |
| P-22 | 缺反向工程入口（参考视频 → 分镜骨架） | libtv-comparison |

---

# §2 期望实现完整梳理（to-be）

## 2.0 problem → solution 映射（traceability）

| Problem | 期望状态（解决方向） | §3.2 设计编号 |
|---|---|---|
| P-1 派生过度文本约束 | 缩到 1 锚点 / 5 token；让 reference image latent guidance 主导一致性 | §3.1.1（C1）|
| P-2 metadata 进 prompt 是 noise | alias / role 不进 image prompt（保留在 effective 类型仅供调度） | §3.1.1（C2）|
| P-3 用户看不到 prompt / 派生关系 | GalleryEditor ⓘ 入口 → GenerationDetailDialog 展示 asset_image 全字段 | A1 |
| P-4 设定卡 11 字段平铺 | ⭐ 生成核心 + ▼ 折叠 metadata 双层 UI | B1 |
| P-5 字段填写认知负担 | ✨ AI 自动从描述提取字段（不覆盖已填） | B2 |
| P-6 三视图需多次手动派生 | 一键多角度（一次推理 3 张），同 latent 内部一致性 | B3 |
| P-7 跨集 / 跨项目无库化 | user_assets 跨项目角色库（加入我的库 / 从我的库引用） | D2 |
| P-8 新用户起步无内置数字人 | 数字人池 10-30 个 preset_digital + 创建 dialog 加 tab | D3 |
| P-9 reference image 没用满各 provider 多图参数 | 角色形象组（Character Reference Set）— ImageGenerationRequest.referenceImages 改为数组；各 provider adapter 适配 multi-reference / element_list / 智能参考 | D1 |
| P-10 无视频提取角色 | E1 ffmpeg + 人脸检测 + 聚类 + 角度分类 → 多视角图自动落库 | E1 |
| P-11 画面描述空白无引导 | 双模板（短剧 5 段 / 影视 shot-level / 自由文本） | B4 |
| P-12 缺摄像机参数化 | 焦距 5 / 光圈 5 / 相机风格 4 预设 + visual effect tooltip | B5 |
| P-13 运镜仅 6 类 | 25 命名预设 4 大类（基础 11 / 叙事 8 / 动态 3 / 特殊 3） | B5 |
| P-14 完全无打光控制 | 12 命名预设（伦勃朗 / 三点 / 蝴蝶 / 黑色电影 / 赛博朋克 等） | B5 |
| P-15 无全局镜头编号 | EP01_S03_SH04 格式 + ④/⑤/⑥ 三处显示 | B5b |
| P-16 派生单基图选择 | 多基图 checkbox + max 受 capability 限制 | B6 |
| P-17 ⑤ 制作缺连线可视化 | LineageOverlay 只读 SVG 连线（默认关，开关触发） | C2 |
| P-18 剧本→分镜全或无 | 9 帧故事板 thumbnail 预览 + 挑骨架 | B7 |
| P-19 完整 6 stage 负担大 | AI 一键模式 wizard + QuickModeOrchestrator 编排 | C3 |
| P-20 主流 provider subject 没用上 | capability matcher 加 subjectSupport / maxSubjects 路径 | C1 |
| P-21 能力没暴露给 Agent | MCP Server + HTTP API + 10 skill | D4 |
| P-22 缺反向工程参考视频入口 | ReferenceVideoAnalysisService（ffmpeg + VLM + STT） | D5 |

22 项问题全覆盖；每项都关联到 §3.2 的具体设计编号。

## 2.0b 资产侧栏布局规则（来自 feedback）

> 修订原型的左侧栏 → 实际生产用右侧栏，且仅 ③/④/⑤/⑥ 显示，①/② 不显示。

| Stage | 侧栏位置 | 内容 | 备注 |
|---|---|---|---|
| ① 内容 | ❌ 不显示侧栏 | — | StageContentScriptView 用 EntitySidebar 已在主区右侧（不算外层侧栏） |
| ② 资产 | ❌ 不显示侧栏 | — | AssetStageViewV2 全宽 4 分区布局 |
| ③ 剧本 | ✅ 右侧 | EntitySidebar（角色 / 地点 / 物品要素） | 已实现 |
| ④ 分镜 | ✅ 右侧（修订原型）| 资产快捷面板（hover 缩略图 + 拖入分镜） | 替代左 220px 场景树？或并存？需讨论 |
| ⑤ 制作 | ✅ 右侧 | 资产引用 + LineageOverlay 数据 | C2 集成 |
| ⑥ 合成 | ✅ 右侧 | 时间线轨道概览 / 导出参数 panel | 已实现（StageComposeViewV2 上半右栏 = export-params） |

**关键决策（待讨论）**：④ 分镜 stage 当前是左 220px 场景树 + 右主区。修订原型要"侧栏放右侧" — 是把场景树搬右还是保留左 + 加右侧栏？实施 Phase 4+ 时需明确。本期 Phase 1-3 不动 ④ 布局，只加镜头工具栏字段。

## 2.1 期望 6 stage 功能清单

### ① 内容（pending）— 期望

**新增**：
- AI 一键模式入口按钮（顶部）→ AIQuickModeWizard：用户输入一句话 → 自动跑完 6 stage
- 视频解析入口按钮（顶部）→ ReferenceVideoImportDialog：上传参考视频 → AI 拆分镜骨架 → 一键导入

**保留**：现有功能（剧集 CRUD / 故事背景 / 场景拆分 / binding 修复）

### ② 资产 — 期望

**新增**：
- ⭐ 设定卡核心字段 + ▼ 折叠叙事 metadata（双层 UI）
- ✨ AI 自动从描述提取字段（gender / age / race / styleAnchors）
- 角色一键多角度参考图（正/侧/背 三视图，一次推理）
- 透明度面板（GenerationDetailDialog）：每张图的 prompt / negativePrompt / 派生关系 / metadata 全可见
- 派生支持多基图（多 ref 输入）
- 角色形象组（Character Reference Set）— 把 binding 已有的多张图标记为生图固定参考集；推理时全部喂给 provider（multi-reference / element_list / 智能参考）；解决 P-9 reference image 没用满 provider 多图能力
- 跨项目角色库（user_assets 表，"加入我的库" / "从我的库引用"）
- 数字人池（10-30 个 preset_digital，新用户快速起步）
- 视频提取主体（上传短视频 → 人脸检测 + 聚类 + 角度分类 → 多视角图自动落库）

**修改**：
- character / item 派生身份保持文本约束缩到 1 锚点（让 reference image latent guidance 主导）
- alias / role 不再进 image prompt（叙事 metadata 解耦）

**保留**：现有 effective 投影 / 主图生成 / 派生主流程 / 360 全景

### ③ 剧本 — 期望

**新增**：
- 9 帧故事板预览入口（StoryboardThumbnailDialog）：剧本→分镜过渡时可走"先挑骨架再细化"路径
- AI 一键模式串通的子节点（剧本生成自动衔接资产生成）

**保留**：现有 scene_scripts 拆分 / binding 强约束 / scene_characters 布局

### ④ 分镜 — 期望

**新增**：
- 双模板单镜画面描述（短剧 5 段 + 影视 shot-level + 自由文本）— 替代空白 textarea
- 摄像机参数化（焦距 5 预设 / 光圈 5 预设 / 相机风格 4 预设）
- 运镜扩到 25 命名预设（4 大类：基础 / 叙事级 / 动态 / 特殊）
- 打光 12 命名预设（伦勃朗 / 三点 / 蝴蝶 / 黑色电影 / 赛博朋克霓虹 等）
- 全局镜头编号（EP01_S03_SH04）

**保留**：现有镜头语言 toolbar / 转场 / 关键帧链 / reference image 选图

### ⑤ 制作 — 期望

**新增**：
- Provider subject 能力探测路径（capability matcher 加 subjectSupport / maxSubjects；KlingO/MJ V7/Seedance 2.0 走原生 subject API）
- 局部子画布连线可视化（LineageOverlay overlay 在分镜中心化布局上）
- ImageGenerationRequest.referenceImage 改 referenceImages: string[]（向后兼容）；各 provider adapter 适配 multi-reference 入参

**保留**：现有 KeyframeGrid / VideoSegmentPanel / AudioPanel

### ⑥ 合成 — 期望

**保留**：现有时间线 / 导出（本期不动）

### 工作流入口 — 期望

**新增**：
- AI 一键模式（QuickModeOrchestrator + AIQuickModeWizard）
- Agent / Skill 接入（MCP server + HTTP API）
- 视频解析（ReferenceVideoAnalysisService）

---

## 2.2 期望用户流程（用户视角；实现细节见 §3.2）

> 本节聚焦"用户做什么 / 看到什么 / 工作流如何串"，**不展开 service / IPC / schema**（那些在 §3.2 新增清单）。

### 2.2.1 标准通道（增强版，覆盖期望功能）

```
1. 项目创建：同 as-is（保留）

2. ① 内容 + ③ 剧本（v3 增强）
   ★ 新：顶部"📋 故事板预览"按钮 → 9 帧 thumbnail 预览 → 挑骨架自动建分镜
   ★ 新：顶部"📹 从参考视频导入"按钮 → AI 拆分镜骨架

3. ② 资产（增强）
   ★ 新：从我的库引用（跨项目复用）
   ★ 新：从内置形象选（数字人池）
   ★ 新：从视频提取主体（上传短视频 → 自动多视角图）
   ★ 设定卡：⭐ 核心字段 + ▼ 折叠 metadata；点 ✨ AI 自动填
   ★ 主图生成后："生成多角度参考图"一键出三视图
   ★ 高级：标记"角色形象组"（勾选哪些图作为固定生图参考，无训练成本）
   ★ GalleryEditor 缩略图 hover 加 ⓘ 详情入口（透明度面板）
   ★ 派生支持多基图（checkbox 多选）

4. ④ 分镜（增强）
   ★ 画面描述：双模板（短剧 5 段 / 影视 shot-level / 自由文本）切换
   ★ 镜头工具栏扩展：焦距 / 光圈 / 相机风格 / 25 运镜 / 12 打光
   ★ 全局编号显示（EP01_S03_SH04）

5. ⑤ 制作（增强）
   ★ 顶部"显示生成链路"开关 → 可视化连线
   ★ 后台自动走 provider subject 路径（如 Kling O3）
   ★ 自动把 binding 的"角色形象组"喂给 provider 的 multi-reference 入参
   ★ KeyframeGrid 缩略图 hover 加 ⓘ 详情入口

6. ⑥ 合成：同 as-is（保留）
```

### 2.2.2 AI 一键通道（短剧自媒体用户）

```
首页 / ① 内容 stage → "🪄 AI 一键模式" 入口
   │
   ▼
AIQuickModeWizard (Step 1 输入)
   user 填：
   - 一句话剧本主题（textarea）
   - 时长：30s / 60s / 90s
   - 风格：现代都市 / 古风 / 奇幻 / 自定义
   - （已废 LoRA 选项；默认走 multi-reference）
   │
   ▼
进入 Step 2 进度（流式状态推送）
   ⏳ Step 1: 剧本生成 ✓ (10s)
   ⏳ Step 2: 资产生成 + 三视图 ✓ (45s)
   ⏳ Step 3: 9 帧故事板 ⚙ 进行中... (8/9)
   ⏳ Step 4: 关键帧（按 9 帧故事板挑选的骨架）
   ⏳ Step 5: 视频片段
   ⏳ Step 6: 视频合成
   │
   每步可：[✏️ 暂停修改] [↺ 重生当前步] [➤ 继续]
   │
   ▼
完成 → 跳到 ⑥ 合成 stage 预览成片
```

### 2.2.3 跨项目库通道（IP 矩阵 / 长内容）

```
项目内已有 character "李白"（含 6 张图：主图 + 三视图 + 2 套服装）
   │
   ▼
右键 / 溢出菜单 → "⭐ 加入我的库"
   │
   ▼ user_assets 行 + 拷图到 user-asset 目录
   ▼
新建项目 → ② 资产 → 创建角色 → tab "📚 从我的库"
   │
   ▼ 列表选 "李白" → "→ 引用到当前剧集"
   ▼
新项目内创建 character_binding（含 source_user_asset_id 反指 + 自动把 user_asset 的 image_paths 拷过来作为新 binding 的形象组）
```

### 2.2.4 视频起步通道（参考视频 → 完整剧集）

```
① 内容 stage → "📹 从参考视频导入"
   │
   ▼ 上传参考视频（5-180s）
   ▼
ReferenceVideoAnalysisService:
  ffmpeg 抽帧 + 镜头切换检测
  VLM 分析每 shot（景别/角度/运镜/时长/对白）
  STT 抽对白
   │
   ▼ 显示 ParsedShot[] 表格
   ▼
用户编辑 / 修正 → "→ 导入到当前剧集"
   │
   ▼ 创建 storyboards 行（含 metadata.referenceVideoShotIndex 反指）
```

---

## 2.3 期望界面 inventory

### 2.3.1 新增 view / dialog（共 9 个）

| 新增组件 | 路径 | 用途 | 关联 §3.2 |
|---|---|---|---|
| `GenerationDetailDialog.vue` | `stage-asset/shared/` | 资产图详情透明度面板 | A1 |
| `ShotDescriptionTemplate.vue` | `stage-storyboard-v2/` | 双模板单镜画面描述 | B4 |
| `StoryboardThumbnailDialog.vue` | `stage-content-script-v3/` | 9 帧故事板预览 + 挑骨架 | B7 |
| `LineageOverlay.vue` | `stage-production-v2/` | 局部子画布连线 overlay | C2 |
| `AIQuickModeWizard.vue` | `dialogs/` | AI 一键模式 wizard | C3 |
| `ReferenceSetPanel.vue` | `stage-asset-v2/character/` | 角色形象组（勾选 binding 已有图作为生图参考集；嵌 CharacterAssetEditorV2） | D1 |
| `UserAssetLibraryDialog.vue` | `dialogs/` | 跨项目角色库列表 + 引用 | D2 |
| `ReferenceVideoImportDialog.vue` | `dialogs/` | 视频解析 → 拆分镜骨架 | D5 |
| `VideoFaceExtractDialog.vue` | `stage-asset-v2/character/` | 视频提取主体多视角 | E1 |

### 2.3.2 修改的 view / dialog（共 13 个）

| 组件 | 改动概要 | 关联 §3.2 |
|---|---|---|
| `CharacterCardFormV2.vue` | 字段双层（核心 + 折叠 metadata）+ AI 自动填按钮 | B1, B2 |
| `LocationCardFormV2.vue` | 同上（适配地点字段） | B1, B2 |
| `ItemCardForm.vue` | 加 AI 自动填按钮（字段已少） | B2 |
| `CharacterAssetEditorV2.vue` | 顶部加"生成多角度参考图"按钮；嵌入 ReferenceSetPanel | B3, D1 |
| `CharacterGalleryEditor.vue` | 5 处 thumb-tools 加 ⓘ 详情入口 | A1 |
| `LocationGalleryEditor.vue` | 2 处 thumb-tools 加 ⓘ | A1 |
| `ItemGalleryEditor.vue` | 2 处 thumb-tools 加 ⓘ | A1 |
| `DeriveVariantDialog.vue` | radio → checkbox 多选基图 | B6 |
| `StageStoryboardViewV2.vue` | 替换 frameDescription textarea；加焦距/光圈/相机风格/运镜扩 select / 打光 select；卡片加全局编号 | B4, B5, B5b |
| `StageProductionViewV2.vue` | 顶部加"显示生成链路"开关 + LineageOverlay 集成 | C2 |
| `StageComposeViewV2.vue` | 时间轴 cell tooltip 加全局编号 | B5b |
| `StageContentScriptView.vue` | 顶部加"📋 故事板预览" + "📹 从参考视频导入"按钮 | B7, D5 |
| 资产创建 dialog（GenerateImagesDialog 或新建）| 加 tab "✨ 自定义" / "🎭 内置形象" / "📚 从我的库" / "🎬 从视频提取" | D2, D3, E1 |

### 2.3.3 不变的 view（保留 as-is）

- EpisodeWorkbench.vue / StageHeaderBar / AssetSidebar
- AssetStageViewV2.vue / 各 AssetCardV2 / VoiceAssetCardV2 / VoiceAssetEditor / VoiceCardForm
- ProjectListV2 相关
- ⑥ 合成 stage 全部组件（本期不动）
- 大部分 dialog（CreateEpisodeDialog / EditEpisodeDialog / Bind*Dialog / SettingsDialog / ImagePreviewDialog / SynthesisDialog 等）

---

# §3 Diff: 修改清单 + 新增清单

## 3.1 修改清单（按文件聚合）

> 一个文件被多次改动时，按 commit 顺序列。所有 backend 改动严格保持函数签名兼容（除非明确标注）。

### 3.1.1 资产 prompt 装配

| 文件 | 行 | 改动 | commit | 原因 |
|---|---|---|---|---|
| `src/core/modules/episode-production/assets/prompts/character-constraints.ts` | 138-156 | `IDENTITY_PRESERVATION_SUFFIX` 6 锚点 30+ 词 → 1 锚点 5-8 词；`IDENTITY_PRESERVATION_NEGATIVE` 20+ 词 → 3 词 | C1 | 解决 P-1 |
| `src/core/modules/episode-production/assets/prompts/item-constraints.ts` | 60-95 | 同上（5 锚点 → 1 锚点；13 词 → 3 词） | C1 | 解决 P-1 |
| `src/core/modules/episode-production/assets/prompts/asset-identity-prompt.ts` | 122-134 | character 分支删除 alias / role 拼接 + 加注释；docblock 同步更新 | C2 | 解决 P-2 |

### 3.1.2 资产 UI

| 文件 | 改动 | commit | 原因 |
|---|---|---|---|
| `src/renderer/src/components/episode-production/stage-asset/character/CharacterGalleryEditor.vue` | 5 处 `thumb-tools` 加 ⓘ；script 加 detailDialog state + openDetailDialog；模板末尾加 GenerationDetailDialog；AssetImageRow 接口扩 prompt/negativePrompt/metadata/derivedFromImageId/width/height/createdAt | C3 | 解决 P-3 |
| `src/renderer/src/components/episode-production/stage-asset/location/LocationGalleryEditor.vue` | 同上（2 处 thumb-tools） | C3 | 解决 P-3 |
| `src/renderer/src/components/episode-production/stage-asset/item/ItemGalleryEditor.vue` | 同上（2 处 thumb-tools） | C3 | 解决 P-3 |
| `src/renderer/src/components/episode-production/stage-asset-v2/character/CharacterCardFormV2.vue` | 模板重排为双层（⭐ 生成核心 + ▼ el-collapse 叙事 metadata）；加 ✨ AI 自动填按钮 + onExtractFields 实现；字段绑定 / onChange 不变 | C4, C5 | 解决 P-4, P-5 |
| `src/renderer/src/components/episode-production/stage-asset-v2/location/LocationCardFormV2.vue` | 同上（适配地点字段） | C4, C5 | 解决 P-4, P-5 |
| `src/renderer/src/components/episode-production/stage-asset/item/ItemCardForm.vue` | 加 ✨ AI 自动填按钮（字段少不需双层） | C5 | 解决 P-5 |
| `src/renderer/src/components/episode-production/stage-asset-v2/character/CharacterAssetEditorV2.vue` | 顶部加"生成多角度参考图"按钮 + onGenerateThreeViews；嵌入 ReferenceSetPanel | C6, D1 | 解决 P-6, P-9 |
| `src/renderer/src/components/episode-production/stage-asset/location/DeriveVariantDialog.vue` | el-radio-group 改 el-checkbox-group 多选基图 + maxBaseImages 限制 | C9 | 解决 P-16 |

### 3.1.3 资产 service

| 文件 | 改动 | commit | 原因 |
|---|---|---|---|
| `src/core/modules/episode-production/assets/services/asset-setting-enrichment.service.ts` | 加 `extractFieldsFromDescription(input)` 方法（character/location/item 三模板）+ `safeParseJson` / `validateAndCoerce` helper | C5 | 解决 P-5 |
| `src/core/modules/episode-production/assets/services/main-image-generator.service.ts` | 加 `generateThreeViews(input)` 方法 | C6 | 解决 P-6 |
| `src/core/modules/episode-production/assets/services/gallery-derivation.service.ts` | `DeriveSingleInput` 加 `baseImageIds[]` 字段；`deriveSingle` 处理多基图（向后兼容 baseImageId 单值） | C9 | 解决 P-16 |
| `src/shared/types/image-provider.types.ts:74-87` | `ImageGenerationRequest.referenceImage?: string` → `referenceImages?: string[]`（向后兼容：保留 referenceImage 单值，二选一）| D1 | 解决 P-9 |
| 各 image provider adapter（dashscope / bailian / volcengine / minimax / zhipu / openai / custom 共 7 个） | 适配各自 multi-reference 入参（万相 1-4 张 / Seedream multi-ref / 智能参考 / 可灵 element_list；不支持时仅用第一张降级）| D1 | 解决 P-9 |

### 3.1.4 IPC handler

| 文件 | 改动 | commit | 原因 |
|---|---|---|---|
| `src/electron/ipc/handlers/episode-production/asset/asset-setting-enrichment.handler.ts` | 加 `ep:asset:extract-fields` handler | C5 | 解决 P-5 |
| `src/electron/ipc/handlers/episode-production/asset/character-asset.handler.ts` | 加 `ep:asset:character:generate-three-views` handler | C6 | 解决 P-6 |
| `src/electron/ipc/handlers/episode-production/asset/derivation.handler.ts` | `ep:asset:derive:single` 处理 baseImageIds[]（向后兼容） | C9 | 解决 P-16 |
| 扩 `character-asset.handler.ts` | 加 `ep:asset:character:set-reference-set` IPC（用户勾选哪些 image_id 作为形象组）+ `ep:asset:character:get-reference-set` | D1 | 解决 P-9 |
| 新建 `user-asset.handler.ts` | 5 个 IPC（list / add-from-binding / create-binding / sync-back / delete） | D2 | 解决 P-7 |
| 新建 `preset-digital.handler.ts` | 1 个 IPC（list） | D3 | 解决 P-8 |
| 新建 `quick-mode.handler.ts` | 1 个 IPC（run）+ event（progress） | C3 | 解决 P-19 |
| 新建 `storyboard-thumbnail.handler.ts` | 2 个 IPC（generate-thumbnails / create-from-thumbnails） | B7 | 解决 P-18 |
| 新建 `reference-video.handler.ts` | 5 个 IPC（upload-and-analyze / status / list / import-to-episode / delete） | D5 | 解决 P-22 |
| 新建 `video-extract.handler.ts` | 3 个 IPC（upload-and-detect / apply-cluster / cancel） | E1 | 解决 P-10 |

### 3.1.5 preload + channel-map

| 文件 | 改动 | commit |
|---|---|---|
| `src/preload/index.ts` | 加 ~22 个新 IPC channel 常量 + namespace API（episodeProduction.asset.{extractFields,character.generateThreeViews,character.setReferenceSet,...}） | C5/C6/C9/D1/D2/D3/B7/C3/D5/E1 |
| `src/web/client/channel-map.ts` | 加同等数量的 channel 映射 | 同上 |

### 3.1.6 分镜 UI

| 文件 | 改动 | commit | 原因 |
|---|---|---|---|
| `src/renderer/src/components/episode-production/stage-storyboard-v2/StageStoryboardViewV2.vue` | line 281-340 镜头工具栏扩展（加焦距 / 光圈 / 相机风格 / 打光 select；运镜 select 改 grouped + filterable）；line 418-426 替换为 ShotDescriptionTemplate；卡片右上角加全局编号徽章；onMetaChange 写到 storyboard.metadata JSON | B4, B5, B5b | 解决 P-11~P-15 |
| `src/renderer/src/components/episode-production/stage-production-v2/StageProductionViewV2.vue` | 头部 lang-panel 加全局编号显示；顶部加"显示生成链路"switch；加 LineageOverlay 集成 + ref 暴露 | B5b, C2 | 解决 P-15, P-17 |
| `src/renderer/src/components/episode-production/stage-compose-v2/StageComposeViewV2.vue` | 时间线 cell tooltip 加全局编号 | B5b | 解决 P-15 |
| `src/renderer/src/components/episode-production/stage-content-script-v3/StageContentScriptView.vue` | 顶部加 "📋 故事板预览"按钮 + StoryboardThumbnailDialog 集成；"📹 从参考视频导入"按钮 + ReferenceVideoImportDialog 集成 | B7, D5 | 解决 P-18, P-22 |

### 3.1.7 分镜 / 视频 backend

| 文件 | 改动 | commit | 原因 |
|---|---|---|---|
| `src/core/modules/episode-production/render/video/video-provider-adapter.ts` | `VideoProviderCapabilities` 加 `subjectSupport?: boolean` / `maxSubjects?: number`；`generateSegment` input 加 `subjects?: SubjectInput[]` | P3-C1 | 解决 P-20 |
| `src/electron/ipc/handlers/episode-production/video.handler.ts` 或 `video-segment.handler.ts` 的 `deriveCapabilitiesFromModel` | 加 `inferSubjectSupport` / `inferMaxSubjects` 逻辑 | P3-C1 | 解决 P-20 |
| 各 video provider adapter（kling / midjourney / dashscope / volcengine 等） | 实现 subject API 路径（注册 subject + 调用） | P3-C1 | 解决 P-20 |
| `src/core/modules/episode-production/render/keyframe/keyframe-generation.service.ts` | 调用前判断 `adapter.capabilities.subjectSupport`，决定走 subject 或通用 ref 路径 | P3-C1 | 解决 P-20 |
| `src/core/modules/episode-production/render/provider-capability-matcher.ts` | 加 subject 维度匹配 | P3-C1 | 解决 P-20 |

### 3.1.8 keyframe prompt 装配（接收 P2 镜头扩展字段）

| 文件 | 改动 | commit | 原因 |
|---|---|---|---|
| `src/core/modules/episode-production/render/keyframe/keyframe-prompt-builder.ts` | 拼接 storyboard.metadata 里的 lensFocalMm/aperture/cameraStyle/lighting/cameraMovement(扩展)，按预设 promptHint 中英追加到 frame_description 末尾 | C7 | 解决 P-12~P-14 |

### 3.1.9 后端共享 helper 提取

| 文件 | 改动 | commit |
|---|---|---|
| 新建 `src/core/database/migrations/_helpers.ts` | 抽取 `checkTableExists` / `checkColumnExists`（多份 migration 已重复实现） | D1（顺手做） |
| 新建 `src/renderer/src/utils/storyboard-id.ts` | `formatGlobalShotId({ episodeNumber, sceneIndex, shotNumber })` | C8 |

### 3.1.10 按文件聚合视图（一个文件被几次改）

> 同一文件可能在多个 commit 被改 — 按文件聚合视图便于"一次性把这文件的所有改动看完"。

| 文件 | 总改动次数 | commits（顺序）|
|---|---|---|
| `character-constraints.ts` | 1 | C1 |
| `item-constraints.ts` | 1 | C1 |
| `asset-identity-prompt.ts` | 1 | C2 |
| `CharacterGalleryEditor.vue` | 1 | C3 |
| `LocationGalleryEditor.vue` | 1 | C3 |
| `ItemGalleryEditor.vue` | 1 | C3 |
| `CharacterCardFormV2.vue` | 2 | C4（双层 UI）→ C5（AI 自动填按钮） |
| `LocationCardFormV2.vue` | 2 | C4 → C5 |
| `ItemCardForm.vue` | 1 | C5（仅 AI 按钮）|
| `CharacterAssetEditorV2.vue` | 2 | C6（多角度按钮）→ D1（ReferenceSetPanel 嵌入） |
| `MainImageGeneratorService` | 1 | C6 |
| `asset-setting-enrichment.service.ts` | 1 | C5 |
| `gallery-derivation.service.ts` | 1 | C9 |
| `DeriveVariantDialog.vue` | 1 | C9 |
| `StageStoryboardViewV2.vue` | 4 | C7（双模板替换 line 418-426）→ C7（焦距/光圈/相机风格）→ C7（运镜扩 grouped）→ C7（打光）→ C8（卡片徽章）|
| `StageProductionViewV2.vue` | 2 | B5b（头部全局编号）→ C2（链路开关 + LineageOverlay 集成）|
| `StageComposeViewV2.vue` | 1 | C8（时间线 cell tooltip）|
| `StageContentScriptView.vue` | 2 | C10（📋 故事板预览按钮）→ D5（📹 视频导入按钮）|
| `keyframe-prompt-builder.ts` | 1 | C7（拼 promptHint）|
| `video-provider-adapter.ts` | 1 | P3-C1（capabilities 加字段）|
| `keyframe-generation.service.ts` | 1 | P3-C1（subject 路径分流）|
| `provider-capability-matcher.ts` | 1 | P3-C1（subject 维度匹配）|
| `image-provider.types.ts` + 7 个 image adapter | 1 | D1（referenceImages: string[] + multi-reference 适配）|
| `preload/index.ts` | 多次 | 每个新 IPC 都加；详见 §3.3 |
| `web/client/channel-map.ts` | 多次 | 同 preload 同步 |

> **多次改的文件**：`StageStoryboardViewV2.vue` 是改动最密集的（C7 内 4 次工具栏扩展 + C8 卡片徽章）— 实施时 C7 拆成 4 个独立 commit 还是合一个 commit 取决于工程节奏（推荐合一个 commit "feat(ep): 镜头语言层升级"，单文件 +400 行可控）。

---

## 3.2 新增清单（按功能聚合）

> 每项含：问题陈述 / 数据 schema / service 接口 / IPC / UI mockup / 测试场景。
> Phase 标号 + 编号便于排期引用。

### A. 透明度（Phase 1）

#### A1. GenerationDetailDialog 资产生成详情面板

**问题**：P-3。后端落库的 prompt / negativePrompt / metadata / derivedFromImageId 用户看不到。

**数据来源**：`asset_image` 表已有字段（无需新 IPC）；`api.image.listByAsset(assetType, assetId)` 已返回完整实体。

**新增组件**：`src/renderer/src/components/episode-production/stage-asset/shared/GenerationDetailDialog.vue`

**Props**：
```ts
{
  modelValue: boolean
  image: DetailImage | null         // 当前查看的图（含完整字段）
  allImages?: DetailImage[]         // 同 asset 全部图，用于 derivedFromImage 反查
}
```

**显示内容**：
- 大缩略图（max-height 360px object-fit contain）
- 基本信息：类别 / label / 创建时间 / 尺寸 / is_main 标记
- Prompt 完整内容（pre 滚动，复制按钮，字符数显示）
- Negative Prompt 同上
- 派生自（如有 derivedFromImageId）：基图缩略图 64×64 + label + id
- Metadata（JSON 解析后展示为 el-tag 列表）

**优雅降级**：旧数据 prompt=null 时显示"（无 / 旧数据未落库）"；缺 metadata / derivedFrom 时不显示对应 section。

**集成**：3 个 GalleryEditor（character 5 处 / location 2 处 / item 2 处）的 thumb-tools 加 ⓘ 图标。

**双母语**：
- 大众用户：缩略图 hover 看到 ⓘ 图标 + tooltip "详情"；点开后能看到"为什么 AI 这么画"
- 专业用户：复制 prompt 字符串到 ChatGPT / Claude 调试 / 直接拿去其他工具复用；看派生关系排查"主图改了为什么变体没跟着改"

**测试场景**：
- 已生成图（有 prompt） → 完整显示，复制按钮可用
- 旧数据（prompt=null） → 显示"（无 / 旧数据未落库）"
- 派生图 → "派生自" section 显示基图
- 主图（非派生） → "派生自" 不显示
- 含 metadata → tags 显示
- 无 metadata → section 不显示

---

### B. 字段双层 + 镜头语言层 + 9 帧故事板（Phase 2）

#### B1. 设定卡字段双层 UI

**问题**：P-4。

**改动**：3 个 CardForm 模板重排（字段绑定 / onChange 不变）。

**布局原则**：
```
**双母语**：
- 大众用户：默认看到的就是关键字段（描述 / 风格 / 参考图），无视折叠区也能完成创建
- 专业用户：折叠区有姓名 / 别名 / 定位 / 声音 / 形象库 — 满足 character bible 完整性

```
⭐ 生成核心区（始终展开）：
  - 决定生成质量的字段（人物描述 / 风格 / 性别 / 年龄 / 人种 / 参考图）
  - 右上角占位 [✨ AI 自动填] 按钮（B2 实现）

▼ 叙事元数据（el-collapse 默认 collapsed）：
  - 仅用于剧本调度 / 配音的字段（姓名 / 别名 / 定位 / 声音 / 形象库）
  - section 顶部明确提示："仅用于剧本调度 / 配音；不进图像生成"
```

#### B2. AI 正向字段提取

**问题**：P-5。

**新 service 方法**（`AssetSettingEnrichmentService`）：
```ts
async extractFieldsFromDescription(input: {
  assetType: 'character' | 'location' | 'item'
  description: string
  projectId: string
  providerConfigId?: string
  modelId?: string
}): Promise<ExtractedFields>
```

**LLM 调用**：复用 `callAI`（位置参数 `(prompt, systemPrompt, maxTokens, providerConfigId?, modelId?)`）。

**System prompt（character 示例）**：
```
你是一个角色设定提取助手。从用户描述中抽出结构化字段，以 JSON 输出。
字段：name / gender ('男'|'女'|'其他') / age (number) / race (string) / styleAnchors (string[])
只输出 JSON，不要解释，不要 markdown 围栏。不能确定的字段不输出。
```

**新 IPC**：`ep:asset:extract-fields`（新 handler `asset-setting-enrichment.handler.ts`）

**前端**：3 个 CardForm 实现 `onExtractFields()` —— 不覆盖用户已填字段。

**错误处理**：description 空 → warning；< 10 字 → warning；无 scriptModel 配置 → 明确错误；LLM 返回非 JSON → jsonrepair 兜底。

#### B3. 角色一键多角度参考图

**问题**：P-6。

**技术原理**：利用图像模型多图组合输出（Lib Image / Seedream 4.5 / Seedream 5.0 lite / LibNano Pro）一次推理出三视图（同 latent 内部一致性 > 3 次独立调用）。

**Prompt**：
```
{角色身份描述}
请输出三张同一角色的图像（横向并排）：
1. 正面（front view, full body）
2. 侧面（side profile, full body）
3. 背面（back view, full body）
保持人物一致性：相同的脸型、发型、身材、服装、肤色、风格。
图像间无文字、无序号、纯背景。
```

后端 sharp 切片（1 张大图按横切等分 → 3 张独立图）。

**新 service 方法**：
```ts
// MainImageGeneratorService
async generateThreeViews(input: {
  bindingId: string
  baseImageId?: string  // 不传用 isMain=1
}): Promise<AssetImageEntity[]>
```

**降级**：provider 不支持组合 → 串行 3 次（同 base ref）。

**新 IPC**：`ep:asset:character:generate-three-views`

**UI**：CharacterAssetEditorV2 顶部按钮"生成多角度参考图"+ 双母语 tooltip（大众："让 AI 不同分镜画同一角色不走样"；专业："character bible / three-view sheet"）。

**进程归属**：sharp 是 Node native，**只能主进程**调用。

#### B4. 双模板单镜画面描述

**问题**：P-11。

**新组件**：`src/renderer/src/components/episode-production/stage-storyboard-v2/ShotDescriptionTemplate.vue`

**模板**：
- ⚡ 短剧 5 段（默认）：角色 / 场景情境 / 戏剧冲突 / 节奏 / 镜头偏好
- 🎬 影视 shot-level：subject / action / camera / lighting / mood
- ✏️ 自由文本

**字段拼装**：
- 短剧：`{角色}；场景情境：{xx}；戏剧冲突：{xx}；节奏：{xx}；镜头偏好：{xx}`
- 影视：`Subject: {xx}. Action: {xx}. Camera: {xx}. Lighting: {xx}. Mood: {xx}`

**存储**：仍写到 `storyboards.frame_description`（不动 schema）。模板选择写到 `storyboards.metadata.frameDescriptionTemplate`（可选）。

**集成**：`StageStoryboardViewV2.vue` line 418-426 替换。

**双母语**：
- 大众用户：短剧 5 段模板有现成 placeholder（"如：少年阿白" / "如：黄昏的酒馆，煤油灯昏黄"），照样填即可
- 专业用户：直接切到"影视 shot-level"用电影行业母语（Subject / Action / Camera / Lighting / Mood），或切自由文本完全自定义

#### B5. 摄像机参数化 + 运镜 25 预设 + 打光 12 预设

**问题**：P-12, P-13, P-14。

**存储**：全部写到 `storyboards.metadata` JSON 列（不动 schema）：
```json
{
  "lensFocalMm": "50mm",
  "aperture": "f/4",
  "cameraStyle": "cinematic",
  "lighting": "rembrandt"
}
```

**双母语**：
- 大众用户：select 标签是中文 + 视觉效果一句话（如"超广角 24mm — 环境感强，畸变明显"）
- 专业用户：直接看 value（24mm / f/1.8 / cinematic）+ 英文 promptHint，跳过解释

**新 const 文件 1**：`src/core/modules/episode-production/assets/constants/lens-presets.ts`

```ts
export interface LensPreset {
  value: string
  label: string
  visualEffect: string  // tooltip 给大众用户
  promptHint: string    // 拼到 prompt 的英文
}

export const LENS_FOCAL_PRESETS: LensPreset[] = [
  { value: '24mm', label: '超广角 24mm', visualEffect: '环境感强，畸变明显', promptHint: 'shot at 24mm wide angle' },
  { value: '35mm', label: '广角 35mm', visualEffect: '环境与主体平衡', promptHint: 'shot at 35mm' },
  { value: '50mm', label: '标准 50mm', visualEffect: '接近肉眼视角', promptHint: 'shot at 50mm, natural perspective' },
  { value: '85mm', label: '人像 85mm', visualEffect: '中近景人物焦点', promptHint: 'shot at 85mm portrait lens, subject isolation' },
  { value: '125mm', label: '长焦 125mm', visualEffect: '特写压缩感', promptHint: 'shot at 125mm telephoto, compressed perspective' },
]

export const APERTURE_PRESETS: LensPreset[] = [
  { value: 'f/1.8', label: '极浅景深 f/1.8', visualEffect: '强烈背景虚化', promptHint: 'aperture f/1.8, strong bokeh' },
  { value: 'f/2.8', label: '浅景深 f/2.8', visualEffect: '柔和虚化', promptHint: 'aperture f/2.8, soft bokeh' },
  { value: 'f/4',   label: '中景深 f/4',   visualEffect: '主体清晰背景柔化', promptHint: 'aperture f/4' },
  { value: 'f/8',   label: '深景深 f/8',   visualEffect: '前后皆清', promptHint: 'aperture f/8, deep focus' },
  { value: 'f/11',  label: '全景清晰 f/11', visualEffect: '从近到远全清楚', promptHint: 'aperture f/11, deep depth of field' },
]

export const CAMERA_STYLE_PRESETS: LensPreset[] = [
  { value: 'cinematic', label: '电影感',     visualEffect: '电影级色彩 + 颗粒感', promptHint: 'cinematic, film grain, color graded' },
  { value: 'digital',   label: '数码',       visualEffect: '清晰 / 锐利 / 现代',   promptHint: 'digital camera, sharp, modern' },
  { value: 'film_35mm', label: '胶片 35mm',  visualEffect: '柔和颗粒 + 复古色调',  promptHint: '35mm film stock, vintage tone' },
  { value: 'vintage',   label: '复古',       visualEffect: '老照片质感',           promptHint: 'vintage style, faded colors' },
]
```

**新 const 文件 2**：`src/core/modules/episode-production/assets/constants/camera-movements.ts`

```ts
export interface CameraMovementPreset {
  value: string
  label: string
  alias?: string[]      // 搜索别名
  description: string   // tooltip 给大众用户
  promptHint: string
  category: 'basic' | 'narrative' | 'dynamic' | 'special'
}

export const CAMERA_MOVEMENT_PRESETS: CameraMovementPreset[] = [
  // 基础 11 项（保留现有 6 类 + 扩展）
  { value: 'static',      label: '固定',  description: '镜头不动',           promptHint: 'static shot, locked off',     category: 'basic' },
  { value: 'push',        label: '推镜',  description: '相机向被摄物推近',   promptHint: 'dolly in, slow push',         category: 'basic' },
  { value: 'pull',        label: '拉镜',  description: '相机后退远离',       promptHint: 'dolly out, slow pull',        category: 'basic' },
  { value: 'pan_left',    label: '左摇',  description: '水平向左转动',       promptHint: 'pan left',                    category: 'basic' },
  { value: 'pan_right',   label: '右摇',  description: '水平向右转动',       promptHint: 'pan right',                   category: 'basic' },
  { value: 'tilt_up',     label: '上仰',  description: '镜头向上抬起',       promptHint: 'tilt up',                     category: 'basic' },
  { value: 'tilt_down',   label: '下俯',  description: '镜头向下俯视',       promptHint: 'tilt down',                   category: 'basic' },
  { value: 'track_left',  label: '左移',  description: '相机平移左行',       promptHint: 'truck left',                  category: 'basic' },
  { value: 'track_right', label: '右移',  description: '相机平移右行',       promptHint: 'truck right',                 category: 'basic' },
  { value: 'crane_up',    label: '升镜',  description: '升降臂向上',         promptHint: 'crane up',                    category: 'basic' },
  { value: 'crane_down',  label: '降镜',  description: '升降臂向下',         promptHint: 'crane down',                  category: 'basic' },

  // 叙事级 8 项
  { value: 'dolly_zoom',         label: '希区柯克变焦', alias: ['vertigo'], description: '推镜同时拉变焦 → 背景诡异收缩，主体不变', promptHint: 'dolly zoom, vertigo effect, hitchcock zoom', category: 'narrative' },
  { value: 'long_take_tracking', label: '长镜头跟拍',                       description: '一镜到底跟随主体行进',                  promptHint: 'long take tracking shot',                    category: 'narrative' },
  { value: 'master_shot_push',   label: '大师推近',                         description: '从全景缓慢推近到中近景',                promptHint: 'master shot dolly in',                       category: 'narrative' },
  { value: 'spiral_up',          label: '螺旋上升',                         description: '螺旋式升起 + 旋转',                     promptHint: 'spiral crane up with rotation',              category: 'narrative' },
  { value: 'pov',                label: '主观视角',                         description: '从角色视角看出去',                      promptHint: 'POV shot, first-person',                     category: 'narrative' },
  { value: 'ots_left',           label: 'OTS 左过肩',                       description: '从角色左肩后看',                        promptHint: 'over the shoulder shot from left',           category: 'narrative' },
  { value: 'ots_right',          label: 'OTS 右过肩',                       description: '从角色右肩后看',                        promptHint: 'over the shoulder shot from right',          category: 'narrative' },
  { value: 'circle_360',         label: '360 环绕',                         description: '相机围绕主体环绕一周',                  promptHint: '360 degree orbit around subject',            category: 'narrative' },

  // 动态 3 项
  { value: 'whip_pan',       label: '甩镜',       description: '快速横甩转场',                       promptHint: 'whip pan, quick lateral motion blur',            category: 'dynamic' },
  { value: 'shaky_handheld', label: '手持晃动',   description: '模拟手持的自然晃动',                 promptHint: 'handheld camera, natural shake, documentary feel', category: 'dynamic' },
  { value: 'snorricam',      label: '主体绑机位', description: '相机绑在主角身上 → 背景旋转，主体不动', promptHint: 'snorricam, body-mounted, subject locked',      category: 'dynamic' },

  // 特殊 3 项
  { value: 'aerial_descend', label: '航拍下降', description: '从高空降到地面',     promptHint: 'aerial descent',           category: 'special' },
  { value: 'rack_focus',     label: '跟焦切换', description: '焦点在前后景间切换', promptHint: 'rack focus, focus pull',   category: 'special' },
  { value: 'time_lapse',     label: '延时摄影', description: '时间加速',           promptHint: 'time-lapse, accelerated time', category: 'special' },
]
```

**新 const 文件 3**：`src/core/modules/episode-production/assets/constants/lighting-presets.ts`

```ts
export interface LightingPreset {
  value: string
  label: string
  description: string
  promptHint: string
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  { value: 'rembrandt',      label: '伦勃朗光',     description: '45° 主光 + 鼻影投到对侧脸颊',      promptHint: 'rembrandt lighting, 45 degree key light, triangle shadow on cheek' },
  { value: 'three_point',    label: '三点照明',     description: '主光 + 辅光 + 轮廓光',             promptHint: 'three-point lighting' },
  { value: 'butterfly',      label: '蝴蝶光',       description: '正前方高位主光 → 鼻下蝴蝶状阴影',  promptHint: 'butterfly lighting, paramount lighting' },
  { value: 'split',          label: '分割光',       description: '90° 侧光 → 半亮半暗',              promptHint: 'split lighting, half light half shadow' },
  { value: 'rim_backlight',  label: '逆光轮廓',     description: '主光在背后 → 主体边缘发光剪影',    promptHint: 'rim light, backlit, silhouette outline glow' },
  { value: 'flat_softbox',   label: '平铺柔光',     description: '正前方大柔光箱 → 无阴影',          promptHint: 'flat softbox lighting, even diffuse, shadowless' },
  { value: 'golden_hour',    label: '黄金时刻',     description: '日出 / 日落柔和暖光',              promptHint: 'golden hour lighting, warm soft sunlight' },
  { value: 'blue_hour',      label: '蓝调时刻',     description: '日落后 / 日出前的冷蓝调',          promptHint: 'blue hour, twilight, cool blue ambient' },
  { value: 'noir_hard',      label: '黑色电影硬光', description: '强烈对比 + 百叶窗投影',            promptHint: 'film noir lighting, hard chiaroscuro' },
  { value: 'cyberpunk_neon', label: '赛博朋克霓虹', description: '紫粉霓虹 + 反射 + 雨夜',          promptHint: 'cyberpunk neon, magenta and cyan reflections, wet street' },
  { value: 'cozy_candle',    label: '温暖烛光',     description: '低色温 + 跳动光斑',                promptHint: 'warm candlelight, low color temperature' },
  { value: 'cold_clinical',  label: '冷峻医院',     description: '高色温日光灯 + 无影',              promptHint: 'cold clinical lighting, fluorescent overhead' },
]
```

**类型导出**（统一从 `assets/constants/index.ts` 重新导出，避免 vue 文件深 import）。

**UI**：StageStoryboardViewV2 镜头工具栏加 4 个 select（焦距 / 光圈 / 相机风格 / 打光）+ 运镜 select 改 `el-option-group` filterable。每项 hover 显示 visualEffect tooltip。

**Prompt 装配**：keyframe-prompt-builder.ts 在 frame_description 末尾拼 `shot at 50mm, aperture f/4, cinematic, film grain, rembrandt lighting`。

#### B5b. 全局镜头编号

**问题**：P-15。

**格式**：`EP{ep:02}_S{scene:02}_SH{shot:02}` 例 `EP01_S03_SH04`

**新 helper**：`src/renderer/src/utils/storyboard-id.ts`
```ts
export function formatGlobalShotId(input: {
  episodeNumber?: number | null
  sceneIndex: number  // 0-based
  shotNumber: number  // 1-based
}): string
```

**集成**：④ 卡片徽章 / ⑤ 头部 / ⑥ 时间轴 cell tooltip。

#### B6. 派生支持多基图

**问题**：P-16。

**Service 改造** — `gallery-derivation.service.ts`：

```ts
export interface DeriveSingleInput {
  // ... 现有字段
  baseImageId?: string         // 向后兼容（单值；优先级低于 baseImageIds）
  baseImageIds?: string[]      // 新增（spec 2026-05-09）
  // ...
}

async deriveSingle(input: DeriveSingleInput): Promise<AssetImageEntity> {
  let baseList: AssetImageEntity[] = []
  if (input.baseImageIds && input.baseImageIds.length > 0) {
    for (const id of input.baseImageIds) {
      const img = await this.imageSvc.getById(id)
      if (img && img.assetType === input.assetType && img.assetId === input.assetId) {
        baseList.push(img)
      }
    }
  } else if (input.baseImageId) {
    const img = await this.imageSvc.getById(input.baseImageId)
    if (img) baseList = [img]
  } else {
    const main = await this.imageSvc.getMainImage(input.assetType, input.assetId)
    if (main) baseList = [main]
  }
  if (baseList.length === 0) throw new Error('无法派生：未找到可用基图')

  // ... prompt 拼接（保持现有逻辑）...

  const result = await this.imageGen.generate({
    referenceImagePaths: baseList.map((b) => b.imagePath),  // 多基图全喂
    prompt, negativePrompt, label: input.label,
  })
  return await this.imageSvc.addImage({
    // ...
    derivedFromImageId: baseList[0].id,  // 第一张作 derivedFrom（保留单值，未来可考虑加 derivedFromImageIds 数组列）
    // ...
  })
}
```

**UI** — `DeriveVariantDialog.vue` el-radio-group → el-checkbox-group：

```vue
<el-checkbox-group v-model="form.baseImageIds" :max="maxBaseImages">
  <el-checkbox v-for="img in mainImages" :value="img.id" border>
    <span class="base-radio-inner">
      <img :src="toImageUrl(img.thumbnailPath || img.imagePath)" class="base-thumb" />
      <span class="base-name">{{ img.label || '默认主图' }}</span>
    </span>
  </el-checkbox>
</el-checkbox-group>
<div class="hint">最多选 {{ maxBaseImages }} 张（受 provider 限制）。多张参考能提升一致性。</div>
```

```ts
const maxBaseImages = computed(() => {
  // P2 阶段写死 4；P3 加 capability 探测后改为动态读 image provider capabilities.maxRefImages
  return 4
})
```

**双母语**：
- 大众用户：勾选多张感觉直觉；hint 文字解释为什么多选更好
- 专业用户：可一次喂 9 张正侧背 + 表情 + 服装 ref，跨变体一致性显著提升

#### B7. 9 帧故事板草稿模式


#### B7. 9 帧故事板草稿模式

**问题**：P-18。

**技术**：图像模型多图组合（Lib Image / Seedream 4.5）一次推理 3×3 网格 1 张大图，sharp 切片得 9 张。

**进程归属**：**主进程 sharp + IPC 回传切片路径**（sharp 是 Node native，渲染端不能 import）。

**临时存储**：
```
Electron: {userData}/temp/thumbnails/{episodeScriptId}-{ts}/frame-1.jpg ... frame-9.jpg
Web:      {dataDir}/temp/thumbnails/{episodeScriptId}-{ts}/...
```

**清理**：用户挑选 → 拷正式 asset 目录后删 temp；用户取消 → 主进程定时任务（每 6h，删 24h+ temp）兜底。

**新 service**：`src/core/modules/episode-production/narrative/ai/storyboard-thumbnail-generator.ts`
```ts
import sharp from 'sharp'  // ✓ 主进程允许

export class StoryboardThumbnailGeneratorService {
  constructor(
    private readonly tempDir: string,
    private readonly imageGen: ImageGenerator,
  ) {}

  async generate(input: {
    episodeScriptId: string
    count: 9 | 16 | 25
    styleAnchors?: string[]
    providerConfigId: string
    modelId: string
  }): Promise<ThumbnailFrame[]>
}
```

**新 IPC**：
- `ep:storyboard:generate-thumbnails`：input GenerateThumbnailsInput → output ThumbnailFrame[]
- `ep:storyboard:create-from-thumbnails`：input { episodeScriptId, selectedFrames } → output { storyboardIds[] }

**新组件**：`StoryboardThumbnailDialog.vue`（3×3 grid + checkbox 勾选 + 重生）

**入口**：StageContentScriptView 顶部"📋 故事板预览"按钮。

**降级**：provider 不支持多图组合 → 串行 9 次（同 prompt + 同 ref）。

**双母语**：
- 大众用户：把"剧本→分镜"这道难关变成"看图挑骨架"，认知负担显著下降
- 专业用户：thumbnail storyboard 是电影前期标准做法，可在挑选界面手动调整顺序 / 删某帧 / 重生单帧

---

### C. Provider 能力 + 局部子画布 + AI 一键（Phase 3）

#### C1. Provider Subject 能力探测路径

**问题**：P-20。

**接口扩展**（不改 schema）：
```ts
// video-provider-adapter.ts
export interface VideoProviderCapabilities {
  // 现有
  text: boolean; image: boolean; keyframes: boolean
  maxKeyframes: number; maxDurationSec: number
  // 新增
  subjectSupport?: boolean
  maxSubjects?: number
}

export interface SubjectInput {
  /** character_bindings.id（缓存查找用） */
  bindingId: string
  /**
   * 主体多角度参考图绝对路径（不能是相对路径，因 adapter 跨进程；不能是非 https url）
   * 数量：1-N（受 maxSubjects 限制；多张更稳定）
   * 上传协议（按 provider 分流）：
   *   - Kling：multipart 上传 → 注册 subject API → 拿 subject_id
   *   - MJ V7：上传中转 CDN → 输出 https URL 给 --cref
   *   - Seedance：base64 内联到 generate API
   */
  imagePaths: string[]
  description?: string
  voiceId?: string  // 数字人 provider 用
}
```

**支持 provider 矩阵**：
| Provider | subjectSupport | maxSubjects |
|---|---|---|
| Kling O3 / O1 | ✓ | 4 |
| MJ V7（Omni Reference） | ✓ | 1 |
| Seedance 2.0 | ✓ | 9 |
| Seedance 1.0 / Lite / Vidu / Wan 等 | ✗ | 0 |

**调用方分流**：`keyframe-generation.service.ts` 调用前判断 capabilities.subjectSupport，决定走 subject 或通用 ref 路径。

**Subject 缓存**：按 `(bindingId, providerConfigId)` 缓存 provider 端 subject_id。Phase 3 内存缓存即可，Phase 4 落地为 `provider_subject_cache` 表（见 D1 一并建）。

#### C2. 局部子画布连线（分镜级只读）

**问题**：P-17。

**前提**：⑤ 制作 stage 已分镜中心化（资产卡 / 关键帧 / 视频片段 / 视频预览 / 资产引用），子画布雏形已在。本 phase 仅加连线可视化。

**新组件**：`src/renderer/src/components/episode-production/stage-production-v2/LineageOverlay.vue`
- 绝对定位 SVG 覆盖在 `<main>`
- `getBoundingClientRect` 反查每张卡片位置
- SVG `<path>` 贝塞尔曲线连线
- 连线 hover 显示数据传递标签（"ref" / "keyframes2video"）
- **只读不可编辑**

**数据流（已实现）**：
```
资产卡 → 关键帧序列卡 → 视频片段卡 → 视频预览
binding.referenceImagePath → storyboard.referenceImageIds → keyframe.referenceOverrides
```

**触发**：StageProductionViewV2 顶部 `<el-switch>`"显示生成链路"，默认 false。

**重算时机**：ResizeObserver / window.scroll / window.resize 监听卡片位置变化重新计算 SVG path。

**双母语**：
- 大众用户：默认关，不打扰；好奇时开看"AI 是怎么把这些资产组合出视频的"
- 专业用户：debug 工具 — 看 reference 链 / keyframe 来源；定位"为什么这帧生成跟我选的参考图不一致"

#### C3. AI 一键快速通道

**问题**：P-19。

**编排服务**：`src/core/modules/episode-production/quick-mode/orchestrator.service.ts`

```ts
export class QuickModeOrchestrator {
  async run(input: {
    userPrompt: string
    durationSec: 30 | 60 | 90
    styleAnchors: string[]
    projectId: string
    enableLora?: boolean  // 默认 false
  }, callbacks: {
    onStepStart: (step: string) => void
    onStepProgress: (step: string, current: number, total: number) => void
    onStepComplete: (step: string, data: any) => void
    onError: (step: string, error: Error) => void
  }): Promise<{ episodeId: string; finalVideoPath: string }> {
    // 1. createEpisode（含 storyBg）
    // 2. scriptGenerator.generate
    // 3. assetGenerator.generateAll（每 character 含三视图）
    //    （形象组自动初始化：main + view，无训练）
    // 4. thumbnailGen.generate（9 帧故事板）
    // 5. 用全部 9 帧创建 storyboards
    // 6. 每 sb 走 keyframe gen + video gen
    // 7. composeService.composeEpisode
    // 全程 callbacks 推进度
  }
}
```

**IPC**：
- `ep:project:quick-mode-run`（流式状态推送 → 主窗 webContents.send `ep:quick-mode-progress` event）

**新组件**：`AIQuickModeWizard.vue`（dialog）

UI：Step 1 输入 + Step 2 流式进度（每步可暂停 / 重生 / 继续）。

**错误恢复**：单步失败可重试或跳过；全局取消 → 已生成内容保留为草稿。

**双母语**：
- 大众用户：一句话进 → 成片出，跳过所有细节；可以中途介入修改
- 专业用户：可以在任意 step 点"暂停修改"切到标准通道精修；编排服务的每一步都能跳过 / 重生 / 替换

---

### D. 角色形象组 + 跨项目库 + 数字人池 + Agent + 视频解析（Phase 4）

#### D1. 角色形象组（Character Reference Set）

**问题**：P-9。

**决策记录**（2026-05-09 LoRA 调研结论）：

调研 4 家国内主流云图像 API（阿里百炼 / 字节火山 / 可灵 / 即梦）后确认 **0 家提供"开放 API 训练角色 → 公开生图 API 调用"的闭环**：

| 平台 | 训练能力 | 是否对外 API |
|---|---|---|
| 阿里百炼 | PAI ArtLab 训练 Qwen-Image LoRA | ❌ 仅 Console；产物挂不到 wanx 公开 API |
| 火山炉米 Lumi | Seedream / Seedance LoRA | ❌ 白名单内测 |
| 可灵 Custom Model | 视频脸部模型 | ❌ 仅 Web，订阅制 |
| 即梦 | — | ❌ 不提供 |

**结论：放弃 LoRA 训练路径**。各家公开 API 仅提供 **multi-reference image** 形态的角色一致性，本设计采用此路径。

**核心方案**：

> 不训练。把 character_binding **已有的多张图**（主图 + view 三视图 + expression + outfit + pose）作为"形象组"，生图时全部喂给 provider 的 multi-reference 入参。

**Schema 改动**（最小）：

`character_bindings` 表加一列 `reference_set_image_ids TEXT NULL`（JSON 数组，记用户标记为"形象组成员"的 asset_image.id 列表；NULL 时默认行为 = 自动用 main + 所有 view）。Migration `add-character-binding-reference-set.ts`（PG/SQLite 双库 + 幂等，参照 `add-binding-reference-image-path.ts`）。

`asset_image` 表**不动**（已有多张图）。`location_bindings` / `item_bindings` 同理加列（地点 / 物品也支持形象组）。

**ImageGenerationRequest 接口扩展**（`src/shared/types/image-provider.types.ts:74-87`）：

```ts
export interface ImageGenerationRequest {
  providerConfigId?: string
  model: string
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  // ...
  /** @deprecated 保留兼容老调用方；新代码用 referenceImages */
  referenceImage?: string
  /** 多张参考图绝对路径或 URL；adapter 适配各自 multi-reference 入参 */
  referenceImages?: string[]
  skipHistory?: boolean
}
```

**Provider adapter 适配**（按各家 multi-reference 真实 API 形态）：

| Provider | 多图入参形态 | 数量上限 | 不支持时降级 |
|---|---|---|---|
| dashscope（万相 wan2.5/2.6 image-edit） | `ref_images: string[]` | 1-4 张 | 截前 4 张 |
| volcengine（Seedream 4.5 / 5.0 lite） | `reference_images: string[]` | 多张 + 组图 | 全部 |
| bailian（含百炼托管的可灵 kling-v3） | `element_list: [{element_id, element_image}]` | 10 张 | 转 element_list |
| openai（DALL-E） | 不原生支持多图 | 1 张 | 仅用第一张 |
| minimax / zhipu | 单参考 | 1 张 | 仅用第一张 |
| custom | 用户配置决定 | 看 baseUrl | 透传 |

每个 adapter 在 `generateImage()` 内部读 `request.referenceImages`（fallback `request.referenceImage`），按上表适配。

**Service** — `src/core/modules/episode-production/assets/services/character-asset.service.ts` 加方法：

```ts
async setReferenceSet(input: {
  bindingId: string
  imageIds: string[]  // 用户勾选的 asset_image.id 列表；空数组 = 重置为默认（自动选 main + view）
}): Promise<CharacterBindingEntity> {
  // 1. 校验 imageIds 都属于该 binding
  // 2. 写 character_bindings.reference_set_image_ids（JSON）
  // 3. 返回更新后的 binding
}

async getEffectiveReferenceImages(bindingId: string): Promise<string[]> {
  // 1. 取 binding.reference_set_image_ids；非空 → 按 id 查 asset_image.imagePath 列表
  // 2. 为空 → fallback 到默认策略：main + 所有 view
  // 3. 过滤掉不存在的 id（容错）
  // 4. 返回绝对路径数组
}
```

**集成到现有生成路径**：
- 主图生成（`MainImageGeneratorService.generateMain`）：保留现有 `reference_image_path` 单值
- 派生（`GalleryDerivationService.deriveSingle`）：支持 baseImageIds[]（B6 已设计）
- 关键帧生成（`KeyframeGenerationService`）：在 `pickReferenceImage` 之后，**额外**把 binding 的形象组加到 referenceImages 数组 — **核心增强点**

**IPC**：

| Channel | input | output |
|---|---|---|
| `ep:asset:character:set-reference-set` | { bindingId, imageIds: string[] } | CharacterBindingEntity |
| `ep:asset:character:get-reference-set` | { bindingId } | { imageIds: string[]; effective: string[] } |

> 不需要 train / status / list / delete / status-changed event — 没训练任务，无异步状态。

**新组件**：`ReferenceSetPanel.vue`（嵌入 CharacterAssetEditorV2 顶部）

```
┌─ 角色形象组（Character Reference Set）──────────────┐
│  生图时用这些图作为稳定参考（multi-reference）        │
│                                                       │
│  ✓ [缩略图] 主图           (默认勾选)                 │
│  ✓ [缩略图] view-front     (默认勾选)                 │
│  ✓ [缩略图] view-3q_left   (默认勾选)                 │
│  ✓ [缩略图] view-3q_right  (默认勾选)                 │
│  ☐ [缩略图] expression-smile                          │
│  ☐ [缩略图] outfit-formal                             │
│                                                       │
│  已选 4 张 ｜ provider 上限：4（万相）/ 多张（Seedream）│
│  ⓘ 当前 image provider：volcengine Seedream 4.5       │
│    支持多张参考；建议保留 4-6 张代表角度 + 表情        │
│                                                       │
│           [恢复默认]  [保存形象组]                    │
└───────────────────────────────────────────────────────┘
```

**双母语**：
- 大众用户：勾选直观；默认值合理（main + 三视图）；hint 文案解释
- 专业用户：明确告知当前 provider 多图上限；可手动调整组合

**与跨项目库（D2）配合**：
- character_binding 加入我的库（D2.addToLibrary）时，**reference_set_image_ids 也作为 snapshot 字段保留**；user_assets.image_paths 拷的就是这些图
- 从库引用到新项目（D2.createFromLibrary）时，新 binding 的 reference_set_image_ids 自动指向新拷过来的 asset_image.id

**与 P3 subject 探测的关系**：
- P3 的 `subjectSupport` / `maxSubjects` 仍有意义 — 部分 provider（如可灵）的 multi-reference 是 element_list 体系，需要先 register subject
- subject 注册结果可缓存到 `provider_subject_cache` 表（保留这张表，避免每次都 register）
- subject 缓存与"形象组"关系：形象组定义"哪些图"，subject cache 记"这组图在某 provider 的注册 ID"

**provider_subject_cache 表保留**：

```ts
@Entity({ name: 'provider_subject_cache' })
@Index('idx_psc_binding', ['bindingId'])
@Index('idx_psc_provider', ['providerConfigId'])
export class ProviderSubjectCacheEntity {
  @PrimaryColumn() id!: string
  @Column({ name: 'user_id', nullable: true }) userId!: string | null
  @Column({ name: 'binding_id' }) bindingId!: string
  @Column({ name: 'provider_config_id' }) providerConfigId!: string
  @Column({ name: 'provider_subject_id' }) providerSubjectId!: string
  @Column({ name: 'image_paths_hash' }) imagePathsHash!: string  // reference_set 解析后 imagePaths 的 SHA256
  @Column({ name: 'created_at', type: 'bigint' }) createdAt!: number
  @Column({ name: 'expires_at', type: 'bigint', nullable: true }) expiresAt!: number | null
}
```

Migration `add-provider-subject-cache.ts`（同 D1 范式）。

**风险**：

| 风险 | 应对 |
|---|---|
| 各 provider 多图入参形态差异大 | adapter 层吸收差异；统一 referenceImages 接口 + 各家内部转换 |
| provider 上限不一致（DALL-E 1 / 万相 4 / Seedream 多） | UI 显式提示当前上限；超过时按优先级（main > view > 其他）截断；不报错 |
| subject 缓存失效（用户改了形象组） | image_paths_hash 比对自动失效；下次调用重 register |
| 老 referenceImage 单值调用方未迁移 | 接口保留 referenceImage（@deprecated），fallback 到 referenceImages[0] |
| reference_set_image_ids 引用的 asset_image 被删 | service 层在每次 getEffective 时过滤掉不存在的 id |
| 长期：炉米 / 可灵 Custom Model 真开放 API | 可加新功能"训练形象组"扩展（保留现有字段 + 加 fine_tuned_model_id 列）|

<!-- DEPRECATED-LORA-START：以下 LoRA 训练设计已废（调研结论：4 家国内云 API 都不开放训练 API）；改走上方的 Character Reference Set 路径。保留作历史参考。-->

<details>
<summary>展开查看已废 LoRA 训练设计（不实施）</summary>

**多 provider 抽象（已废）**：
```
LoRATrainingProvider (interface)
  ├ FalFluxAdapter        (海外·fal.ai)
  ├ ReplicateFluxAdapter  (海外·Replicate)
  ├ KlingNativeAdapter    (国内·可灵 ★ 推荐主路径)
  ├ JimengNativeAdapter   (国内·即梦)
  ├ VolcArkAdapter        (国内·火山方舟)
  └ LocalKohyaAdapter     (本地·kohya_ss · 选装)
```

**默认顺序**：
- 国内用户：可灵 / 即梦优先 → 火山方舟兜底
- 海外用户：fal.ai 优先 → Replicate 兜底
- 隐私场景：本地 kohya_ss（用户先在设置→高级里启用并指定 endpoint）

**Schema** —— TypeORM entity + migration（PG/SQLite 双库 + 幂等）：

`src/core/database/entities/episode-production/lora-model.entity.ts`：
```ts
@Entity({ name: 'lora_models' })
@Index('idx_lora_models_binding', ['bindingId'])
@Index('idx_lora_models_status', ['status'])
export class LoRAModelEntity {
  @PrimaryColumn({ type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'binding_id', type: 'varchar' }) bindingId!: string
  @Column({ name: 'binding_type', type: 'varchar' }) bindingType!: 'character' | 'location' | 'item'
  @Column({ name: 'status', type: 'varchar' }) status!: 'pending' | 'training' | 'ready' | 'failed' | 'cancelled'
  @Column({ name: 'provider', type: 'varchar' }) provider!: LoRAProvider
  @Column({ name: 'external_id', type: 'text', nullable: true }) externalId!: string | null
  @Column({ name: 'trigger_word', type: 'text', nullable: true }) triggerWord!: string | null
  @Column({ name: 'base_model', type: 'varchar' }) baseModel!: 'flux-dev' | 'sdxl' | 'sd-1.5' | 'kling' | 'seedream'
  @Column({ name: 'training_image_count', type: 'integer', nullable: true }) trainingImageCount!: number | null
  @Column({ name: 'training_steps', type: 'integer', nullable: true }) trainingSteps!: number | null
  @Column({ name: 'training_started_at', type: 'bigint', nullable: true }) trainingStartedAt!: number | null
  @Column({ name: 'training_completed_at', type: 'bigint', nullable: true }) trainingCompletedAt!: number | null
  @Column({ name: 'weights_url', type: 'text', nullable: true }) weightsUrl!: string | null
  @Column({ name: 'weights_local_path', type: 'text', nullable: true }) weightsLocalPath!: string | null
  @Column({ name: 'weights_size_bytes', type: 'bigint', nullable: true }) weightsSizeBytes!: number | null
  @Column({ name: 'validation_image_url', type: 'text', nullable: true }) validationImageUrl!: string | null
  @Column({ name: 'metadata', type: 'simple-json', nullable: true }) metadata!: Record<string, unknown> | null
  @Column({ name: 'cost_usd', type: 'real', nullable: true }) costUsd!: number | null
  @Column({ name: 'created_at', type: 'bigint' }) createdAt!: number
  @Column({ name: 'updated_at', type: 'bigint' }) updatedAt!: number
}
```

`src/core/database/migrations/add-lora-models.ts`（PG/SQLite 双库 + 幂等，参照 `add-binding-reference-image-path.ts` 范式）。

**附带表 `provider_subject_cache`**（C1 提到的 cache 持久化）：
```ts
@Entity({ name: 'provider_subject_cache' })
@Index('idx_psc_binding', ['bindingId'])
@Index('idx_psc_provider', ['providerConfigId'])
export class ProviderSubjectCacheEntity {
  @PrimaryColumn() id!: string
  @Column({ name: 'user_id', nullable: true }) userId!: string | null
  @Column({ name: 'binding_id' }) bindingId!: string
  @Column({ name: 'provider_config_id' }) providerConfigId!: string
  @Column({ name: 'provider_subject_id' }) providerSubjectId!: string
  @Column({ name: 'image_paths_hash' }) imagePathsHash!: string  // 上次注册时的 imagePaths SHA256
  @Column({ name: 'created_at', type: 'bigint' }) createdAt!: number
  @Column({ name: 'expires_at', type: 'bigint', nullable: true }) expiresAt!: number | null
}
```

**Repository**：`LoRAModelRepository extends BaseRepository<LoRAModelEntity>`，方法 `findReadyByBindingId(bindingId)`。

**本地 LoRA 存储路径**：
```
Electron: app.getPath('userData') / loras / {bindingId} / v{n} / model.safetensors
                                                                 trigger.txt
                                                                 config.json
                                                                 validation.jpg
Web:      {dataDir} / loras / {bindingId} / v{n} / ...
```

**版本管理**：同 binding 多次训练 version 递增；`weightsLocalPath` 字段记 `loras/<bindingId>/v<n>/model.safetensors`。

**Adapter 接口**：
```ts
export interface LoRATrainingProvider {
  readonly providerName: LoRAProvider
  startTraining(input: { imagePaths: string[]; triggerWord: string; baseModel: BaseModel }): Promise<string>  // externalId
  pollStatus(externalId: string): Promise<{
    state: 'pending' | 'training' | 'ready' | 'failed'
    weightsUrl?: string
    weightsLocalPath?: string
    weightsSizeBytes?: number
    validationImageUrl?: string
    costUsd?: number
    error?: string
  }>
  delete(externalId: string): Promise<void>
}
```

每家 provider 一个 adapter 文件（`src/core/modules/episode-production/lora/providers/<name>-adapter.ts`）。

**Service** — `src/core/modules/episode-production/lora/lora-training.service.ts`：

```ts
export interface LoRATrainingInput {
  bindingId: string
  bindingType: 'character'
  imagePaths: string[]    // 5-20 张绝对路径
  triggerWord?: string    // 默认 generateTriggerWord(bindingId)
  provider?: LoRAProvider // 不传走配置中的默认
  baseModel?: BaseModel   // 默认 'flux-dev'
}

export class LoRATrainingService {
  constructor(
    private readonly repo: LoRAModelRepository,
    private readonly providers: Map<LoRAProvider, LoRATrainingProvider>,
  ) {}

  async startTraining(input: LoRATrainingInput): Promise<LoRAModelEntity> {
    // 1. 校验 5 ≤ count ≤ 20；每张 < 5MB；jpg/png/webp
    this.validateImages(input.imagePaths)

    // 2. 选 provider（input → 项目默认 → 全局默认）
    const adapter = this.pickProvider(input.provider)

    // 3. 写 lora_models 行（status='pending'）
    const id = generateLoRAId()
    const triggerWord = input.triggerWord ?? generateTriggerWord(input.bindingId)
    const now = Date.now()
    await this.repo.create({
      id, bindingId: input.bindingId, bindingType: input.bindingType,
      status: 'pending', provider: adapter.providerName, triggerWord,
      baseModel: input.baseModel ?? 'flux-dev',
      trainingImageCount: input.imagePaths.length,
      createdAt: now, updatedAt: now,
    })

    // 4. 调 adapter 启动训练（异步；adapter 内部上传图 + 调 API + 拿 externalId）
    try {
      const externalId = await adapter.startTraining({
        imagePaths: input.imagePaths, triggerWord, baseModel: input.baseModel ?? 'flux-dev',
      })
      await this.repo.update(id, {
        status: 'training', externalId, trainingStartedAt: Date.now(),
      })
    } catch (e) {
      await this.repo.update(id, {
        status: 'failed', metadata: { error: String(e) },
      })
      throw e
    }
    return (await this.repo.findById(id))!
  }

  async pollStatus(loraId: string): Promise<LoRAModelEntity> {
    const row = await this.repo.findById(loraId)
    if (!row) throw new Error('LoRA 不存在')
    if (row.status !== 'training') return row

    const adapter = this.providers.get(row.provider as LoRAProvider)!
    const status = await adapter.pollStatus(row.externalId!)

    if (status.state === 'ready') {
      await this.repo.update(loraId, {
        status: 'ready',
        weightsUrl: status.weightsUrl,
        weightsLocalPath: status.weightsLocalPath,
        weightsSizeBytes: status.weightsSizeBytes,
        validationImageUrl: status.validationImageUrl,
        costUsd: status.costUsd,
        trainingCompletedAt: Date.now(),
      })
    } else if (status.state === 'failed') {
      await this.repo.update(loraId, { status: 'failed', metadata: { error: status.error } })
    }
    return (await this.repo.findById(loraId))!
  }

  async loadForGeneration(bindingId: string): Promise<LoRAModelEntity | null> {
    return await this.repo.findReadyByBindingId(bindingId)
  }

  async deleteLoRA(loraId: string): Promise<void> {
    const row = await this.repo.findById(loraId)
    if (!row) return
    // 1. 删 provider 端模型
    const adapter = this.providers.get(row.provider as LoRAProvider)
    if (row.externalId && adapter) {
      await adapter.delete(row.externalId).catch(() => { /* 容错：本地 DB 仍要删 */ })
    }
    // 2. 删本地 weights（如有）
    if (row.weightsLocalPath) {
      await fs.rm(path.dirname(row.weightsLocalPath), { recursive: true, force: true })
    }
    // 3. 删 DB 行
    await this.repo.delete(loraId)
  }

  private validateImages(paths: string[]): void {
    if (paths.length < 5) throw new Error('LoRA 训练需至少 5 张图')
    if (paths.length > 20) throw new Error('LoRA 训练最多 20 张图')
    // size + format 校验在 adapter 内做（不同 provider 限制不同）
  }
  private pickProvider(name?: LoRAProvider): LoRATrainingProvider { /* ... */ }
}
```

**集成 imageGen**：`ImageGenerator.generate` 加可选 `loras?: Array<{id, weight?}>` 参数；adapter 自行查 weightsUrl / 下载 weightsLocalPath 注入推理。

**路由策略**：image provider 与 LoRA provider 同源（如可灵图 + 可灵 LoRA） → 直接传；不同源 → UI 提示"不兼容"。

**IPC**：
| Channel | input | output |
|---|---|---|
| `ep:asset:lora:train` | LoRATrainingInput | LoRAModelEntity |
| `ep:asset:lora:status` | { loraId } | LoRAModelEntity |
| `ep:asset:lora:list` | { bindingId } | LoRAModelEntity[] |
| `ep:asset:lora:delete` | { loraId } | { success } |
| `ep:asset:lora:status-changed` (event) | broadcast | 主进程 polling 推送状态变化 |

**新组件**：`LoRATrainingPanel.vue`（嵌入 CharacterAssetEditorV2 顶部）：
```
┌─ 高级 · 训练专属角色模型（LoRA）─────────────────┐
│  当前角色已有图：12 张 ✓（建议 5-20 张）          │
│  Provider：[可灵 AI ▼]  Base：[flux-dev ▼]        │
│  预估时间：10-15 min  ｜  预估费用：~ ¥6-10        │
│  [✨ 训练专属 LoRA]                                │
│  ─── 已有版本 ───                                  │
│  [●] LoRA v2（2026-05-08，可灵）默认加载            │
│      触发词：ohwx_jianxue_2  ｜  weights: 152MB    │
│      [查看 validation] [设为默认] [删除]           │
│  [○] LoRA v1（2026-05-05，fal.ai）已禁用            │
└────────────────────────────────────────────────────┘
```

**双母语**：
- 大众用户：UI 称"训练专属角色模型"，按钮含费用 + 时间预估（"~ ¥6-10，10-15 min"）
- 专业用户：可在设置中切到"开发者模式"，UI 直接显示 base_model / trigger_word / training_steps

**LoRA × 跨项目库（D2）交叉数据流**：
- character_binding 加入我的库（D2.addToLibrary）时，**同时把 binding 关联的 LoRA 模型记录拷到 user_assets.loraModelId**（snapshot 字段记 LoRA 元数据 + weightsUrl）
- 从我的库引用到新项目（D2.createFromLibrary）时，**新 binding 自动绑定原 LoRA**（不重新训练；用同一 weightsUrl）—— 跨项目共享同一 LoRA 权重，省钱省时
- 用户在新项目重新训练 LoRA 时，原 LoRA 不变，新 LoRA 关联新 binding（同一 user_asset 可关联多个 LoRA 版本）
- 删除 user_asset 时**不级联删 LoRA**（其他项目可能仍在用），只解关联

**风险**：

| 风险 | 应对 |
|---|---|
| 海外 fal.ai / Replicate 国内访问困难 | 默认走可灵 / 即梦原生；fal.ai 走代理或仅海外用户开放 |
| 隐私（图片上传第三方） | UI 显式同意 checkbox + 隐私协议链接；本地 kohya_ss 选项面向高敏用户 |
| 成本失控（IP 矩阵几十角色） | 每用户 monthly quota（默认 ¥150 或 $20）+ 训练前预估弹窗 + 超额二次确认 |
| 训练失败率 5-10% | 失败自动重试 1 次；失败展示具体错误（图过少 / 图重复 / 服务异常）；云 API 通常不扣失败费 |
| 跨 provider LoRA 不兼容 | 兼容性矩阵 + UI 禁用不兼容选项；提示"切换 image provider 或重训练" |
| 本地训练用户配置复杂 | local_kohya 需手动指定 ComfyUI / kohya_ss endpoint；附 setup 文档 + 检测脚本（一键 ping endpoint 验证） |
| LoRA 权重 + binding 解关联 | 删 binding 时若 LoRA 仅被此 binding 引用 → 询问是否同删；被多 binding 引用（跨库引用） → 仅解关联，LoRA 保留 |

</details>

<!-- DEPRECATED-LORA-END -->

#### D2. 跨项目角色库

**问题**：P-7。

**Schema** —— `user_assets` entity + migration `add-user-assets.ts`：
```ts
@Entity({ name: 'user_assets' })
@Index('idx_user_assets_user_type', ['userId', 'assetType'])
export class UserAssetEntity {
  @PrimaryColumn({ type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'asset_type', type: 'varchar' }) assetType!: 'character' | 'location' | 'item'
  @Column({ name: 'name', type: 'text' }) name!: string
  @Column({ name: 'description', type: 'text', nullable: true }) description!: string | null
  /** 完整 effective 字段快照 */
  @Column({ name: 'snapshot', type: 'simple-json' }) snapshot!: Record<string, unknown>
  /** 多张图绝对路径 */
  @Column({ name: 'image_paths', type: 'simple-json', nullable: true }) imagePaths!: string[] | null
  /** 形象组成员的 asset_image.id 列表（snapshot 时拷过来的；createBinding 时还原） */
  @Column({ name: 'reference_set_image_ids', type: 'simple-json', nullable: true }) referenceSetImageIds!: string[] | null
  @Column({ name: 'source_binding_id', type: 'varchar', nullable: true }) sourceBindingId!: string | null
  @Column({ name: 'created_at', type: 'bigint' }) createdAt!: number
  @Column({ name: 'updated_at', type: 'bigint' }) updatedAt!: number
}
```

**附带 migration**：`add-binding-source-user-asset.ts`（character / location / item bindings 三表加列 `source_user_asset_id varchar nullable`，追踪反指）。

**存储路径**：
```
Electron: app.getPath('userData') / user-assets / {userAssetId} / {originalFilename}
Web:      {dataDir} / user-assets / {userAssetId} / ...
```

**Service**：`UserAssetService` 方法
- `addToLibrary({ bindingId, bindingType })` —— 拷图 + 写 user_assets
- `createFromLibrary({ userAssetId, targetProjectId })` —— 用 snapshot 在 target project 创建 binding（拷图，避免软链断裂）
- `syncBackToLibrary(bindingId)` —— 用户主动；不自动同步
- `listLibrary({ assetType?, keyword? })`
- `deleteFromLibrary(userAssetId)` —— 警告但不阻止已被引用

**IPC**（5 个）：list / add-from-binding / create-binding / sync-back / delete

**新组件**：`UserAssetLibraryDialog.vue`（grid 缩略图 + 搜索 + 编辑/删除）

**UI 集成**：
- AssetCardV2 右上角溢出菜单加"⭐ 加入我的库"
- 资产创建 dialog 加 tab "📚 从我的库"

**双母语**：
- 大众用户：一次创建好的角色可在所有项目复用；不必每集 / 每剧重写
- 专业用户：长内容 / IP 矩阵的 character bible 落地（多视角图 + 形象组定义整套打包，跨项目自动还原）

#### D3. 数字人池

**问题**：P-8。

**Schema 改动最小**：character_bindings 加 `is_preset boolean default false`（migration `add-character-binding-preset.ts`）；不动现有列；`source_type='preset_digital'`（varchar 加值不破 schema）。

**Seed migration**：`seed-preset-digital-humans.ts` 插入 20 个预设 binding（user_id=NULL + project_id=NULL 全局共享）。覆盖：男/女 × 少年/青年/中年/老年 × 商务/学院/古风/职场/休闲。

**形象图来源**：
- 用 fal.ai Flux 一致性 prompt 生成（"clean studio background, professional headshot lighting"）
- 落到 `built-in-assets/preset-digital/` 目录（打包到 app）
- `seed-preset-images.ts` 把图作为 asset_image 行（`is_preset=true`）

**Service**：`PresetDigitalHumanService.list()`

**多租户绕过具体机制**（来自 `BaseRepository` 真实代码 `src/core/database/base-repository.ts`）：

```ts
export class PresetDigitalHumanService {
  constructor(private readonly ds: DataSource) {}

  /**
   * 列出所有内置数字人：user_id IS NULL + source_type='preset_digital'。
   * 走裸 typeorm Repository（不经 BaseRepository 的 scope 注入），
   * 因为 BaseRepository 子类的 scoped API 会强制 WHERE user_id = currentUser，
   * 而内置数字人需要"全局共享"语义（user_id=NULL）。
   * 安全：本方法只读，不写；前端 list 用，无越权风险。
   */
  async list(filter?: { gender?: string }): Promise<CharacterBindingEntity[]> {
    const repo = this.ds.getRepository(CharacterBindingEntity)
    return await repo.find({
      where: {
        userId: IsNull(),
        sourceType: 'preset_digital',
        ...(filter?.gender ? { gender: filter.gender } : {}),
      } as FindOptionsWhere<CharacterBindingEntity>,
      order: { createdAt: 'ASC' },
    })
  }
}
```

> 不在 `CharacterBindingRepository` 上加此方法 — 该 repo 必须保多租户安全；preset 读路径单独 service 隔离避免误用。

**用户引用**：`createBindingFromPreset({ presetId, targetProjectId })` 拷 snapshot + 拷预设图到用户 user-data 目录，新 binding 的 `source_type='standalone'` + `source_user_asset_id` 反指（追踪用）。**不直接复用预设的 user_id=NULL 行**（避免用户改动污染全局预设）。

**UI**：资产创建 dialog 加 tab "🎭 内置形象"（grid + 筛选：年龄 / 性别 / 风格）。

**双母语**：
- 大众用户：新建项目零配置 — 选个内置形象就能开始
- 专业用户：基于内置形象 fork 一份做修改（不污染原 preset），适合做经典角色化身的 IP 衍生

#### D4. Agent / Skill 接入

**问题**：P-21。

**接入方式**：
- **MCP Server**（推荐，Claude Code 原生兼容）：`src/agents/episode-production-mcp/server.ts`
- **HTTP REST API**（外部 Agent）：`src/agents/episode-production-api/`，Express 路由 + Bearer token + rate limit

**Skill 元数据**（YAML）：
```yaml
# src/agents/skills/character-three-views.yaml
name: character-three-views
displayName: 角色三视图
category: asset
description: 为指定角色生成正 / 侧 / 背三视图
inputSchema: { type: object, properties: { bindingId: { type: string } }, required: [bindingId] }
outputSchema: { type: array, items: { $ref: '#/definitions/AssetImageEntity' } }
errors: [ { code: BINDING_NOT_FOUND }, { code: NO_MAIN_IMAGE }, { code: PROVIDER_UNAVAILABLE } ]
rateLimitPerHour: 60
```

**Skill 完整列表（首发 10 个）**：

| # | name | input 关键字段 | output | rate limit / hr | 关键 error code |
|---|---|---|---|---|---|
| 1 | character-three-views | { bindingId, baseImageId? } | AssetImageEntity[] (3) | 60 | BINDING_NOT_FOUND / NO_MAIN_IMAGE / PROVIDER_UNAVAILABLE |
| 2 | derive-variant | { assetType, assetId, baseImageIds[], category, label, description? } | AssetImageEntity (1) | 120 | BASE_IMAGE_INVALID / GENERATION_FAILED |
| 3 | storyboard-thumbnails | { episodeScriptId, count: 9\|16\|25, styleAnchors? } | ThumbnailFrame[] | 30 | SCRIPT_NOT_FOUND / IMAGE_GEN_UNAVAILABLE |
| 4 | generate-keyframes | { storyboardId } | StoryboardKeyframeEntity[] | 60 | STORYBOARD_NOT_FOUND / KEYFRAME_GEN_FAILED |
| 5 | generate-storyboard-video | { storyboardId, mode? } | { videoPath, durationSec } | 30 | NO_KEYFRAMES / VIDEO_PROVIDER_UNAVAILABLE |
| 6 | compose-episode | { episodeId } | { mp4Path, durationSec } | 10 | INCOMPLETE_TIMELINE / FFMPEG_ERROR |
| 7 | analyze-reference-video | { videoPath } | { analysisId } (异步, 配 status) | 10 | VIDEO_TOO_LONG / VLM_UNAVAILABLE |
| 8 | extract-character-from-video | { videoPath } | { sessionId, clusters: ExtractedCluster[] } (异步) | 10 | VIDEO_TOO_LONG / NO_FACE_DETECTED |
| 9 | set-character-reference-set | { bindingId, imageIds: string[] } | CharacterBindingEntity | 60 | BINDING_NOT_FOUND / IMAGE_NOT_OWNED |
| 10 | export-mp4 | { episodeId, outputPath, resolution? } | { mp4Path } | 10 | INCOMPLETE_TIMELINE |

每个 skill 用 yaml 描述（统一从 `src/agents/skills/<skill>.yaml` 加载），结构同上方 character-three-views 示例。

**Skill registry**：`src/agents/skills/registry.ts` 启动时扫描 yaml 注册到 MCP server + HTTP API 路由表；handler 调用对应内部 service（不暴露内部接口）。

**鉴权**：API key 存 `api_keys` 表（用户设置→开发者→生成 key）；Bearer token 验证 + rate limit（基于 IPC 现有 IpcResponse 错误格式）。

**双母语**：
- 大众用户：用不到 — 但能通过 LobeChat / Claude Desktop 这种第三方客户端用自然语言操作（"帮我用李白这个角色生成 5 个分镜"）
- 专业用户：批量自动化（脚本化生成几十集 / 批量调整形象组）；接 CI/CD 工作流

**风险**：暴露内部 service 调用 → 严格鉴权 + 限速 + 审计日志；外部调用产生的生图费用按 user_id 计入 monthly quota；MCP 多客户端并发限制（每 user_id 同时最多 5 个 skill 调用）。

#### D5. 视频解析（参考视频 → 分镜骨架）

**问题**：P-22。

**Pipeline**：
```
用户上传视频 (5-180s mp4/mov)
  ↓
[ffmpeg-static] scene detection（select='gt(scene,0.3)' filter）
  → 拿 shot 边界数组 [(start, end), ...]
  ↓
每 shot 抽 3-5 关键帧到 temp
  ↓
[VLM 批处理] 每 shot 关键帧组分析（GVLM 3.1 Pro / 通义千问 VL / 智谱 GLM-4V）
  → { shotType, cameraAngle, cameraMovement, durationSec, frameDescription, characters, emotion }
  ↓
[ffmpeg] 抽音频 → STT（Whisper / 通义千问 ASR）
  → 对白文本 + 时间码
  ↓
聚合 ParsedShot[] → 落 reference_video_analyses 表
  ↓
用户预览 + 编辑 → 一键导入到当前 episode_script 的 storyboards
```

**Schema**：`reference_video_analyses` entity + migration（同 D1 范式）。

**Service**：`ReferenceVideoAnalysisService`（主进程 ffmpeg + VLM 调度）。

**技术依赖**：
- ffmpeg-static（npm 包，主进程）
- VLM provider（复用 image gen provider 配置）
- STT provider（Whisper / 通义千问 ASR，新接入）

**IPC**（5 个）：upload-and-analyze / status / list / import-to-episode / delete

**新组件**：`ReferenceVideoImportDialog.vue`（上传 + 分析进度 + ParsedShot 表格预览 + 导入）

**入口**：StageContentScriptView 顶部"📹 从参考视频导入"按钮。

**风险**：VLM 准确率 60-80% → UI 必须支持用户编辑修正；STT 成本（Whisper $0.006/min）→ monthly quota；视频上传 ≤ 200MB 前端校验。

**双母语**：
- 大众用户：拿一个抖音同行的爆款视频反推 → 改改剧本就能做自己的版本（合规上需注明参考来源）
- 专业用户：分析自己以前作品的镜头语言习惯，沉淀到模板；做风格学习

---

### E. 视频提取主体（Phase 5）

#### E1. 从短视频提取角色多视角图

**问题**：P-10。

**Pipeline**：
```
用户上传 5-30s 单一连续镜头视频
  ↓
[ffmpeg] 抽帧（每秒 4 帧 → 20-120 帧）
  ↓
[人脸检测] @vladmandic/face-api → 每帧 face bbox + landmarks
  ↓
[人脸 embedding] 抽 face descriptor
  ↓
[一致性聚类] cosine similarity > 0.7 聚到一起（多人物 → 多个聚类）
  → 用户在 UI 选要的那个聚类
  ↓
[角度分类] landmarks → yaw/pitch → front / 3q_left / 3q_right / side / back
  ↓
[代表帧选择] 每角度选最清晰（face bbox area + Laplacian variance 模糊度）
  ↓
[一键写入 character binding]
  - 主图 = front 代表帧
  - view 类目 = 其他角度代表帧
```

**技术依赖**：
- ffmpeg-static
- @vladmandic/face-api（轻 + 易集成；模型 ~10MB 打包入 app 而非 lazy 下载）
- OpenCV.js 或自实现 Laplacian variance

**Schema**：不新建表 —— 提取结果直接写入现有 asset_image 表；临时帧用 filesystem temp。

**Service**：`FaceExtractService.extract()` / `writeClusterToBinding()`

**IPC**（3 个）：upload-and-detect / apply-cluster / cancel

**新组件**：`VideoFaceExtractDialog.vue`
```
┌─ 从视频提取角色 ──────────────────── ✕ ─┐
│  上传视频：[选择文件]                       │
│  支持 mp4/mov，5-30s 单一连续镜头             │
│  [开始检测] → 进度条                        │
│                                            │
│  检测到 N 个不同人物，请选择要导入的：       │
│  ┌─ 聚类 1 (98 帧) ─┐  ┌─ 聚类 2 (24 帧) ─┐│
│  │  [代表帧大图]     │  │  [代表帧大图]     ││
│  │  正面 ☑ 3q左 ☑    │  │  正面 ☑ ...      ││
│  │  3q右 ☑ 侧面 ☐    │  │                   ││
│  │  背面 ☐           │  │                   ││
│  │  [✓ 用此聚类]     │  │  [使用]           ││
│  └───────────────────┘  └───────────────────┘│
└──────────────────────────────────────────────┘
```

**入口**：CharacterAssetEditorV2 顶部"从视频提取"按钮（仅新建 character 时可见）。

**优势 vs D5**：
- 本地处理（不上传），隐私好
- 单视频含动作 / 多角度 / 表情，信息密度高

**风险**：相似人物（同种族 / 同妆容）容易混进同一聚类 → UI 给用户校准；3q_left / side 边界判定主观 → 用户可重选。

**双母语**：
- 大众用户：用手机拍 10 秒自己 / 喜欢的演员片段 → 一键变成短剧角色
- 专业用户：从演员试镜带提取多视角 / 多表情 → 高效建立 character bible

---

## 3.3 双端 IPC checklist（PC + Web 双写验证）

> 来自 feedback：**新增 IPC 必须同步 web channel-map**（preload + channel-map.ts 双写，否则 web 端 fallback 拼错 channel 静默失败）。
> 本表用于 commit 前 / PR review 时逐条勾选。

### 全部新增 IPC（按 phase 排序）

| Phase | Channel | preload 暴露 namespace | web channel-map key | handler 文件 |
|---|---|---|---|---|
| P1 (C3) | — 透明度面板纯前端，无新 IPC（消费现有 `ep:asset:image:list-by-asset`） |
| P2 (C5) | `ep:asset:extract-fields` | `episodeProduction.asset.extractFields` | `episodeProduction.asset.extractFields` | `asset-setting-enrichment.handler.ts` |
| P2 (C6) | `ep:asset:character:generate-three-views` | `episodeProduction.asset.character.generateThreeViews` | `episodeProduction.asset.character.generateThreeViews` | `character-asset.handler.ts`（扩） |
| P2 (C9) | — 改 `ep:asset:derive:single` 入参向后兼容（baseImageIds[]）；不增 channel | — | — | `derivation.handler.ts`（扩） |
| P2 (C10) | `ep:storyboard:generate-thumbnails` | `episodeProduction.storyboard.generateThumbnails` | `episodeProduction.storyboard.generateThumbnails` | `storyboard-thumbnail.handler.ts`（新建） |
| P2 (C10) | `ep:storyboard:create-from-thumbnails` | `episodeProduction.storyboard.createFromThumbnails` | 同上 | 同上 |
| P3 | — Provider subject 在 video adapter 内部，不暴露新 IPC（既有 `ep:synthesize-storyboard-video` 内部分流） | — | — | — |
| P3 | `ep:project:quick-mode-run` | `episodeProduction.project.quickModeRun` | `episodeProduction.project.quickModeRun` | `quick-mode.handler.ts`（新建） |
| P3 | `ep:quick-mode-progress`（event broadcast） | `episodeProduction.project.onQuickModeProgress(callback)` | 通过 channel-map event 转发机制 | `quick-mode.handler.ts` |
| P4 (D1) | `ep:asset:character:set-reference-set` | `episodeProduction.asset.character.setReferenceSet` | 同 preload key | `character-asset.handler.ts`（扩） |
| P4 (D1) | `ep:asset:character:get-reference-set` | `episodeProduction.asset.character.getReferenceSet` | 同 | 同 |
| P4 (D2) | `ep:user-asset:list` | `episodeProduction.userAsset.list` | 同 | `user-asset.handler.ts`（新建） |
| P4 (D2) | `ep:user-asset:add-from-binding` | `episodeProduction.userAsset.addFromBinding` | 同 | 同 |
| P4 (D2) | `ep:user-asset:create-binding` | `episodeProduction.userAsset.createBinding` | 同 | 同 |
| P4 (D2) | `ep:user-asset:sync-back` | `episodeProduction.userAsset.syncBack` | 同 | 同 |
| P4 (D2) | `ep:user-asset:delete` | `episodeProduction.userAsset.delete` | 同 | 同 |
| P4 (D3) | `ep:preset-digital:list` | `episodeProduction.presetDigital.list` | 同 | `preset-digital.handler.ts`（新建） |
| P4 (D5) | `ep:reference-video:upload-and-analyze` | `episodeProduction.referenceVideo.uploadAndAnalyze` | 同 | `reference-video.handler.ts`（新建） |
| P4 (D5) | `ep:reference-video:status` | `episodeProduction.referenceVideo.status` | 同 | 同 |
| P4 (D5) | `ep:reference-video:list` | `episodeProduction.referenceVideo.list` | 同 | 同 |
| P4 (D5) | `ep:reference-video:import-to-episode` | `episodeProduction.referenceVideo.importToEpisode` | 同 | 同 |
| P4 (D5) | `ep:reference-video:delete` | `episodeProduction.referenceVideo.delete` | 同 | 同 |
| P5 (E1) | `ep:video-extract:upload-and-detect` | `episodeProduction.videoExtract.uploadAndDetect` | 同 | `video-extract.handler.ts`（新建） |
| P5 (E1) | `ep:video-extract:apply-cluster` | `episodeProduction.videoExtract.applyCluster` | 同 | 同 |
| P5 (E1) | `ep:video-extract:cancel` | `episodeProduction.videoExtract.cancel` | 同 | 同 |

总计：**23 个新 IPC channel + 1 个 event broadcast**（D1 LoRA 删后净减 4 channel + 1 event；新增 2 个 reference-set channel）。

### 双端验证 checklist（每 commit 跑一次）

```
[ ] preload/index.ts 加常量：IPC_CHANNELS.<NAME>
[ ] preload/index.ts 暴露 API：episodeProduction.<namespace>.<method>
[ ] web/client/channel-map.ts 加映射：'<namespace>.<method>': { channel: '<NAME>' }
[ ] handler 文件 ipcBridge.handle('<NAME>', handler)
[ ] handler 在 src/electron/ipc/handlers/episode-production/<area>/index.ts 中注册
[ ] 跑：PC 端 npm run dev 验证 ✓
[ ] 跑：Web 端 PORT=4201 npx tsx watch 验证 ✓（必须改完 handler 后重启 4201，tsx watch 对 alias/barrel import 不可靠）
```

### 双端兼容性约束（来自 CLAUDE.md + memory）

1. **不用平台专属接口**（不用 Electron 主进程 BrowserWindow API；不用浏览器 fetch 直连 — 必须经 ipcBridge）
2. **DB 必经 Repository**（不直接 typeorm getRepository；必须经 BaseRepository 子类拿 scope 注入）
3. **entity 必须 typeorm 类型**（不用 plain object；时间用 epoch ms `bigint` 或 `real`）
4. **改 core 共用代码必须同时验证 PC + Web**（改 entity / repo / service 后，PC 端 npm run dev + Web 端 PGDATABASE=the_bot_test PORT=4201 都要跑过一次）

---

# §4 实施排期

> 以下排期保留 v3 的 Phase 划分。详细 commit 内容已在 §3.1（修改清单）+ §3.2（新增清单）展开。

## Phase 1 · 资产 prompt 重构 + 透明度面板（4 小时 · 3 commits）

| commit | 内容 | 文件数 |
|---|---|---|
| C1 | 缩减 character / item 派生身份保持文本约束 | 2 |
| C2 | metadata 字段（alias / role）不进 image prompt | 1 |
| C3 | 资产生成详情透明度面板 GenerationDetailDialog + 3 个 GalleryEditor 集成 | 4 |

解决：P-1, P-2, P-3。

## Phase 2 · 字段双层 + 镜头语言层 + 9 帧故事板（5-7 天 · 7 commits）

| commit | 内容 | 文件数 |
|---|---|---|
| C4 | 设定卡字段双层 UI（3 个 CardForm） | 3 |
| C5 | AI 字段提取（service + IPC + preload + channel-map + 3 个 CardForm 集成） | 7 |
| C6 | 角色多角度参考图（service + IPC + preload + channel-map + CharacterAssetEditorV2） | 5 |
| C7 | 双模板画面描述 + 摄像机参数化 + 运镜 25 + 打光 12（合并） | 8 |
| C8 | 全局镜头编号（utils + 3 个 view 集成） | 4 |
| C9 | 派生多基图（service + DeriveVariantDialog） | 2 |
| C10 | 9 帧故事板（service + IPC + preload + channel-map + dialog + view 集成 + sharp 切片 helper） | 7 |

解决：P-4, P-5, P-6, P-11~P-15, P-16, P-18。

## Phase 3 · provider subject + 局部子画布 + AI 一键（6-9 天）

| 内容 | 文件数 |
|---|---|
| Provider subject 能力探测（capability 接口扩展 + 各 provider adapter + matcher + keyframe-generation 分流） | 5-7 |
| 局部子画布连线（LineageOverlay + StageProductionViewV2 集成） | 2-3 |
| AI 一键通道（QuickModeOrchestrator + IPC + preload + channel-map + AIQuickModeWizard + 入口） | 5 |

解决：P-17, P-19, P-20。

## Phase 4 · 角色形象组 + 跨项目库 + 数字人池 + Agent + 视频解析（1-1.5 周；删 LoRA 后大幅缩减）

| 内容 | 文件数 |
|---|---|
| 角色形象组（migration ×2 加列 + provider_subject_cache 表 + entity + repo + service 加 setReferenceSet/getEffective 方法 + 7 image adapter 加 referenceImages 适配 + 2 IPC + ReferenceSetPanel UI） | ~12 |
| 跨项目库（migration ×2 + entity + repo + service + 5 IPC + dialog + 卡溢出菜单 + 资产创建 dialog 加 tab） | ~9 |
| 数字人池（migration ×3 + 80 张图 + service + IPC + dialog tab） | ~7 |
| Agent / Skill 接入（MCP server + HTTP API + 6-10 skill yaml + registry + API key 表 + 鉴权） | ~9 |
| 视频解析（migration + entity + repo + service + ffmpeg helpers + STT adapter + 5 IPC + dialog + 入口按钮） | ~9 |

解决：P-7, P-8, P-9, P-21, P-22。

## Phase 5 · 视频提取主体（1 周）

| 内容 | 文件数 |
|---|---|
| FaceExtractService + clustering + angle classifier + sharpness scorer + 3 IPC + dialog + 入口 + face-api.js 模型 | ~8 |

解决：P-10。

---

# §5 TDD 与测试策略

## 测试金字塔

```
  ┌─ E2E（少）─ 完整链路 ────┐
  │  - Phase 2 9 帧故事板     │
  │  - Phase 3 quick-mode     │
  │  - Phase 5 视频提取       │
  └────────────────────────────┘
  ┌─ Component（中）─────────────┐
  │  - GenerationDetailDialog    │
  │  - StoryboardThumbnailDialog │
  │  - 各 CardForm 重排          │
  └──────────────────────────────┘
  ┌─ Unit（多）────────────────────────┐
  │  - prompt 装配                       │
  │  - service                            │
  │  - constants 预设有效性              │
  │  - migration 幂等性                   │
  └──────────────────────────────────────┘
```

## 工具链

| 类型 | 工具 | 命令 |
|---|---|---|
| Unit | vitest | `npm test -- <pattern>` |
| Component | @vue/test-utils + happy-dom | `npm test -- <component>` |
| E2E | Playwright | 单独 e2e 命令 |
| 类型 | vue-tsc | `npx vue-tsc --noEmit` |

## 每 commit 配套测试用例

| Commit | 测试文件 | 关键用例 |
|---|---|---|
| C1 缩减约束 | `character-constraints.spec.ts` / `item-constraints.spec.ts` | suffix 长度 < 30；negative tokens < 5；调用点不变 |
| C2 metadata 解耦 | `asset-identity-prompt-v3-shrink.spec.ts` | character prompt 不含 alias/role；< 改前 70% |
| C3 透明度面板 | `GenerationDetailDialog.spec.ts` | 6 场景；复制按钮可用 |
| C4 字段双层 | `CharacterCardFormV2.spec.ts` | 核心区可见；折叠区默认 collapsed |
| C5 AI 字段提取 | `asset-setting-enrichment.spec.ts` + handler.spec | LLM mock；jsonrepair 兜底；不覆盖已填字段 |
| C6 多角度参考图 | `main-image-generator.spec.ts` 加 generateThreeViews 用例 | 3 张落库；同 baseImageId derivedFrom；降级 3 次串行 |
| C7 镜头语言层 | 4 个 const + 1 component spec | 预设值不重复；prompt hint 含中英；模板拼装格式 |
| C8 全局编号 | `storyboard-id.spec.ts` | 格式 EP01_S03_SH04；padStart |
| C9 多基图派生 | `gallery-derivation.spec.ts` 加用例 | baseImageIds[] 优先级；多基图全进 referenceImagePaths |
| C10 9 帧故事板 | `storyboard-thumbnail-generator.spec.ts` | sharp 切片尺寸正确；落地路径；降级 |
| **P3-C1** Provider subject | `video-provider-adapter.spec.ts` + 各 adapter spec | inferSubjectSupport 矩阵正确；keyframe-generation 调用前分流；通用 ref 路径不变 |
| **P3-C2** 局部子画布 | `LineageOverlay.spec.ts` | DOMRect 反查 + 位置变化重算；只读不可编辑；ResizeObserver 卸载时清理 |
| **P3-C3** AI 一键 | `quick-mode-orchestrator.spec.ts` + wizard spec | 7 step 顺序；单步失败重试 1 次；取消保留草稿；进度推送格式 |
| **D1** 角色形象组 | `character-asset.service.spec.ts`（setReferenceSet / getEffective）+ 7 个 image adapter spec（referenceImages 适配）+ `add-character-binding-reference-set.spec.ts` | imageIds 校验属于该 binding；空数组 fallback 到默认（main + view）；过滤不存在的 id；各 provider 多图入参格式正确（万相 1-4 截断 / Seedream 全部 / 可灵 element_list 转换 / DALL-E 仅第一张）；migration 双跑幂等 |
| **D2** 跨项目库 | `user-asset.service.spec.ts` + `add-user-assets.spec.ts` | addToLibrary 拷图独立目录；createFromLibrary 跨项目隔离；syncBack 不自动；删库不阻止已被引用 |
| **D3** 数字人池 | `preset-digital.service.spec.ts` + seed migration spec | list 只返 user_id IS NULL + is_preset；createBindingFromPreset 拷图到用户目录；seed 幂等 |
| **D4** Agent / Skill | `skill-registry.spec.ts` + 每个 skill yaml schema 验证 | yaml 加载 / schema 校验；rate limit 触发；鉴权失败返回 401 |
| **D5** 视频解析 | `reference-video.service.spec.ts` + ffmpeg helper spec | scene detection 输出；VLM mock；STT mock；导入到 storyboards 字段映射正确 |
| **E1** 视频提取主体 | `face-extract.service.spec.ts` + clustering / angle spec | embedding cosine > 0.7 聚同一聚类；yaw/pitch → 角度分类边界；模糊度评分排序 |

> **每个 commit 必须先红再绿**：测试代码先写好（fail），再改业务代码 pass，再重构（保持 pass）。CLAUDE.md 明确"采用 TDD 方式以测试驱动开发"。

## TDD 红绿循环（C1 示例）

```
1. 红：写 character-constraints.spec.ts，期望 IDENTITY_PRESERVATION_SUFFIX.length < 30
   → npm test → fail（当前 100+ 字）

2. 绿：改 SUFFIX 为 1 锚点版本
   → npm test → pass

3. 重构：提取 const 顶部 + 加注释；保持测试 pass
```

## Migration 幂等性测试

每个新 migration 配 `__tests__/<migration>.spec.ts`，临时 SQLite + 双跑断言（不抛错 + 表/索引不重复）。

## Phase 1 prompt 字符数 dry-run 完整测试

新建 `src/core/modules/episode-production/assets/prompts/__tests__/asset-identity-prompt-v3-shrink.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildAssetIdentityPrompt, type EffectiveAssetForPrompt } from '../asset-identity-prompt'
import {
  appendCharacterIdentityPreservation,
  mergeCharacterIdentityNegative,
} from '../character-constraints'

describe('Phase 1 prompt shrink', () => {
  /** 固定 fixture — 跨 commit 用同一份输入对比字面差异 */
  const fixture: EffectiveAssetForPrompt = {
    name: '李白', alias: '青莲居士', role: '主角',
    gender: '男', age: 25, race: 'east_asian',
    appearance: '剑眉星目，束发，腰间佩剑',
    outfit: '青衣长袍', outfitsExtra: ['素衣', '甲胄'],
    styleAnchors: ['国风工笔'],
  }

  it('character 主图 prompt 不再含 alias / role 字段', () => {
    const out = buildAssetIdentityPrompt('character', fixture, {
      era: '唐朝', region: '长安', extra: '盛世',
    })
    expect(out).not.toContain('别名：青莲居士')
    expect(out).not.toContain('定位：主角')
    expect(out).toContain('外貌：剑眉星目')
    expect(out).toContain('风格：')
  })

  it('IDENTITY_PRESERVATION_SUFFIX < 30 字', () => {
    expect(appendCharacterIdentityPreservation('').length).toBeLessThan(30)
  })

  it('IDENTITY_PRESERVATION_NEGATIVE < 5 token', () => {
    const merged = mergeCharacterIdentityNegative(null)
    const tokens = merged.split(',').map((s) => s.trim()).filter(Boolean)
    expect(tokens.length).toBeLessThan(5)
  })

  it('整体派生 prompt 装配后 < 改前 70%', () => {
    const identity = buildAssetIdentityPrompt('character', fixture, null)
    const withSuffix = appendCharacterIdentityPreservation(identity)
    const BEFORE_BASELINE = 1100  // 第一次跑测试时 console.log 改前的字符数 → 写到此常量
    expect(withSuffix.length).toBeLessThan(BEFORE_BASELINE * 0.7)
  })
})
```

执行：`npm test -- asset-identity-prompt-v3-shrink.spec.ts`

> **基线值如何拿**：第一次跑测试时 console.log 改前字符数（在 deprecated 改动还原状态下） → 写到 `BEFORE_BASELINE` 常量。git history 里这个数值是在 fixture 跑改前 commit 拿到的。

## 视觉一致性回归（Phase 1 / 2 半自动）

`scripts/visual-regression/character-derivation.ts` —— 用 face-api.js 抽 face descriptor，cosine similarity > 0.85 算未劣化。CI 跑不动（需 GPU 调 image gen），手动跑一次 3 个 character × 改前/改后，结果记到 `progress/2026-05-09-ep-redesign/phase-1-visual-regression.md`。

---

# §6 风险 / 回滚 / 元保证 / 数据迁移

## 6.0 数据迁移策略

各 Phase 引入新表 / 加列时，**老数据如何处理**：

### Phase 1（零 schema 变更）

| 影响 | 老数据处理 |
|---|---|
| `asset_image.prompt / negative_prompt` 字段已存在但旧行可能为 NULL | GenerationDetailDialog 优雅降级显示"（无 / 旧数据未落库）" — 不强制迁移；用户重生新图时自然落 prompt |
| `character_bindings.alias / role` 仍存在但不再进 prompt | 不动数据；prompt 装配端跳过即可 |

### Phase 2（零 schema 变更，全用 metadata JSON 列）

| 影响 | 老数据处理 |
|---|---|
| `storyboards.metadata.lensFocalMm / aperture / cameraStyle / lighting` | 旧分镜 metadata 无这些键 → keyframe-prompt-builder 解析时跳过；用户编辑时新加 |
| `storyboards.metadata.frameDescriptionTemplate` | 旧分镜默认 template = 'free'（自由文本，保留原 textarea 内容）|

### Phase 3（零 schema 变更，纯 capability 探测）

| 影响 | 老数据处理 |
|---|---|
| Provider subject 路径 | 老分镜重生时自动走新路径（按 capability）；不重生不影响 |
| 内存 subject 缓存 | 进程重启即清空；下次注册 |

### Phase 4（含 schema 变更）

| 表 | migration | 老数据处理 |
|---|---|---|
| `character_bindings.reference_set_image_ids` 列 | ALTER ADD（nullable）| 现有 binding 全部 NULL；service 端 fallback 到默认（main + view），用户体验无感；用户主动勾选才填值 |
| `location_bindings.reference_set_image_ids` 列 | ALTER ADD（nullable）| 同上 |
| `item_bindings.reference_set_image_ids` 列 | ALTER ADD（nullable）| 同上 |
| `provider_subject_cache` | 新建 | 同上 |
| `user_assets` | 新建 | 用户库为空；用户主动加入我的库才填充 |
| `character_bindings.is_preset` 列 | ALTER ADD（默认 false）| 现有 binding 全部 is_preset=0；preset 在 seed migration 单独插入 user_id=NULL 的行 |
| `character_bindings.source_user_asset_id` 列 | ALTER ADD（nullable）| 现有 binding 全部 NULL；从我的库引用时填值 |
| `reference_video_analyses` | 新建 | 空表；用户用 D5 时填 |

迁移脚本 / seed 脚本启动顺序由 `src/core/database/migrations/index.ts` 主流程编排（按依赖：先列变更，再 seed）。

### Phase 5（视频提取无新 schema）

无表新增；提取结果直接落 `asset_image`（与现有派生路径同）。

### 回滚方向兼容

新增字段 / 表回滚：先 git revert 业务代码，再 DROP TABLE / DROP COLUMN（migration 加 rollback 半套，但本期主要靠完整 DB 备份还原）。

完整 DB 回滚命令：

```bash
pkill -f 'tsx.*src/web/server' || true
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "DROP DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d the_bot_test -f .backups/the_bot_test-20260509-182719.sql
PGDATABASE=the_bot_test PORT=4201 npx tsx watch -r tsconfig-paths/register src/web/server/index.ts
```



## 关键风险

| 风险 | 应对 |
|---|---|
| Phase 1 prompt 字面变化 | 不重生即不变，老图 prompt/imagePath 不动 |
| Phase 3 provider subject 各家 API 形态各异 | 逐个 adapter 适配 + 完整测试；先 Kling O3 / MJ V7 / Seedance 2.0 三家 |
| Phase 4 各 provider 多图入参形态差异大 | 在 adapter 层吸收差异；统一 referenceImages 接口 + 各家 adapter 转换；7 个 adapter 都需 unit test 覆盖各自适配 |
| Phase 4 老 referenceImage 单值调用方未迁移 | 接口保留 referenceImage（@deprecated），fallback 到 referenceImages[0]；vue-tsc 不报错 |
| Phase 4 海外 fal.ai / Replicate 国内访问 | 默认走可灵 / 即梦原生；fal.ai 仅海外用户开放 |
| Phase 5 视频提取算法准确率 | 用户 UI 可校准；模型可升级（face-api.js → InsightFace ONNX） |

## 回滚

每个 phase 内每 commit 可独立 `git revert`：
- Phase 1-3：零 schema 变更，纯 git revert 即可
- Phase 4-5：含 schema 变更，需 `git revert + DROP TABLE + 还原备份`

完整 DB 回滚命令：
```bash
pkill -f 'tsx.*src/web/server' || true
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "DROP DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d the_bot_test -f .backups/the_bot_test-20260509-182719.sql
PGDATABASE=the_bot_test PORT=4201 npx tsx watch -r tsconfig-paths/register src/web/server/index.ts
```

## 元保证

- 单 commit ≤ 4 文件（C5 / C7 / C10 等多功能合并 commit 例外，但都 ≤ 8 文件）
- 每 commit 跑 `npx vue-tsc --noEmit` 不引入新错误
- Phase 1-3 严格保证零 schema 变更
- Phase 4+ 改 schema 前重新 pg_dump 备份（脚本 `scripts/backup-db.sh` 待 Phase 4 启动时加）

---

# §7 立即行动

**前置确认**（请你先 review 通过）：
- [ ] §1 当前梳理是否完整？有没有遗漏的 stage / service / UI 组件？
- [ ] §2 期望梳理覆盖你的诉求吗？2.0 problem→solution 映射对吗？
- [ ] §2.0b 资产侧栏布局规则的 ④ 分镜决策（左场景树 vs 右侧栏）— 你倾向哪个？
- [ ] §3.1 修改清单（按域 9 类 + 按文件聚合）是否清晰？
- [ ] §3.2 新增清单 14 项（A1 / B1-B7 / C1-C3 / D1-D5 / E1）完整设计是否到执行级？
- [ ] §3.3 双端 IPC checklist（26 channel + 2 event）覆盖完整吗？
- [ ] §4 排期合理吗？Phase 划分 / commit 划分有没有问题？
- [ ] §5 TDD 测试用例表覆盖所有 commit（C1-C10 + P3-C1~P3-C3 + D1-D5 + E1）吗？
- [ ] §6.0 数据迁移策略 + §6 回滚命令是否充分？

**你 review 通过后**，按 TDD 红绿循环执行 Phase 1（4 小时）：

```bash
# C1（2 文件 + TDD）
# 1. 红：先写测试，期望 SUFFIX < 30 字 / NEGATIVE < 5 token
vim src/core/modules/episode-production/assets/prompts/__tests__/character-constraints.spec.ts
vim src/core/modules/episode-production/assets/prompts/__tests__/item-constraints.spec.ts
npm test -- character-constraints item-constraints  # 应 fail
# 2. 绿：改 SUFFIX / NEGATIVE 为 1 锚点 / 3 token
vim src/core/modules/episode-production/assets/prompts/character-constraints.ts  # L138-156
vim src/core/modules/episode-production/assets/prompts/item-constraints.ts       # L60-95
npm test -- character-constraints item-constraints  # 应 pass
# 3. 重构 + commit
git add . && git commit -m "refactor(ep): 缩减 character/item 派生身份保持文本约束（spec 2026-05-09 review）..."

# C2（1 文件 + TDD）
# 1. 红：先写 dry-run shrink 测试
vim src/core/modules/episode-production/assets/prompts/__tests__/asset-identity-prompt-v3-shrink.spec.ts
npm test -- asset-identity-prompt-v3-shrink  # 应 fail
# 2. 绿：改 character 分支删 alias / role 拼接
vim src/core/modules/episode-production/assets/prompts/asset-identity-prompt.ts  # L122-134
npm test -- asset-identity-prompt-v3-shrink  # 应 pass
git add . && git commit -m "refactor(ep): metadata 字段（alias/role）不进 image prompt..."

# C3（4 文件 + 测试）
# 1. 红：先写 GenerationDetailDialog 6 场景测试
vim src/renderer/src/components/episode-production/stage-asset/shared/__tests__/GenerationDetailDialog.spec.ts
npm test -- GenerationDetailDialog  # 应 fail（组件不存在）
# 2. 绿：建组件 + 三 GalleryEditor 集成 ⓘ 入口
vim src/renderer/src/components/episode-production/stage-asset/shared/GenerationDetailDialog.vue
vim src/renderer/src/components/episode-production/stage-asset/character/CharacterGalleryEditor.vue
vim src/renderer/src/components/episode-production/stage-asset/location/LocationGalleryEditor.vue
vim src/renderer/src/components/episode-production/stage-asset/item/ItemGalleryEditor.vue
npm test -- GenerationDetailDialog  # 应 pass
npx vue-tsc --noEmit  # 确认无新错误（baseline diff）
git add . && git commit -m "feat(ep): 资产生成详情透明度面板..."
```

**双端验证**（C1/C2 不涉及；C3 也不涉及 — Phase 1 零新 IPC）：
- C5 / C6 / C9 / C10 等含新 IPC 的 commit 必须按 §3.3 双端 checklist 逐项确认 PC + Web 两端都能跑

完成后回填 Phase 1 验证 checklist 实际数据，作为 Phase 2 估算依据。
