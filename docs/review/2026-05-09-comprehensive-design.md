# 资产域 + 分镜域 + 工作流域 · 全面优化设计文档（Phase 1-5）

## Context

经过四份 review 的连续讨论（asset-prompt-assembly / libtv-xiaoyunque-comparison / asset-generation / integrated-optimization-plan）+ 多轮反思修正，把所有结论整合成一份可执行设计。

**用户三个核心目标**：
1. 高质量输出（指令遵循 + 前后一致性）
2. 简单易用（兼顾大众短剧用户 + 专业导演 / 编剧）
3. 逻辑过程清晰（透明度，用户能 self-debug）

**输出目标**：本文件作为执行蓝图，定稿后写到 `docs/review/2026-05-09-comprehensive-design.md`，覆盖 22 个能力点跨 5 个 phase。

---

## 0. 范围 / 防崩 / 回滚

### 范围（22 个能力跨 4 个域）

- 资产域：11 个能力（设定卡 + prompt 装配 + 透明度 + 多角度参考图 + provider subject + LoRA + 跨项目库 + 数字人池 + 视频提取主体）
- 分镜域：7 个能力（双模板画面描述 + 摄像机参数化 + 运镜预设 + 打光预设 + 全局镜头编号 + 派生多基图 + 局部子画布）
- 剧本→分镜：1 个能力（9 帧故事板草稿）
- 工作流入口：3 个能力（AI 一键通道 + Agent/Skill + 视频解析）

### 数据库备份

✅ 已备份到 `.backups/the_bot_test-20260509-182719.sql`（schema + data，877KB，79 张表，已 strip pg18 `\restrict`）。

回滚命令：
```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "DROP DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d the_bot_test -f .backups/the_bot_test-20260509-182719.sql
pkill -f 'tsx.*src/web/server'
PGDATABASE=the_bot_test PORT=4201 npx tsx watch -r tsconfig-paths/register src/web/server/index.ts
```

### 改动级回滚

| Phase | 是否动 schema | 回滚方式 |
|---|---|---|
| 1（资产 prompt 重构 + 透明度） | ❌ 不动 | git revert 单 commit |
| 2（字段双层 + 镜头语言层 + 9 帧故事板）| ❌ 不动 | git revert 单 commit |
| 3（provider subject + 局部子画布 + AI 一键通道）| ❌ 不动 | git revert 单 commit |
| 4（LoRA + 跨项目库 + 数字人池 + Agent + 视频解析）| ✓ 加表 | git revert + drop new tables |
| 5（视频提取主体）| ✓ 可能 | 同上 |

### 防崩约束

- 每 Phase 内每 commit ≤ 4 文件
- 每 commit 都过 vue-tsc 类型检查
- Phase 间留观察窗口（不堆积）
- 涉及 prompt 装配文本的改动：先 dry-run 对比 commit 前后字面 diff
- DB 改动只在 Phase 4+ 出现，每改一次重备份

---

## 1. 当前实现全景

### 1.1 资产域

**数据层**：
- `asset_image` 表：统一图谱（character/location/item 三类共用），含 `prompt / negativePrompt / metadata / referenceImagePath / category / label / isMain` 等
- `character_bindings` / `location_bindings` / `item_bindings`：含 metadata 字段（姓名 / 别名 / 定位 / 描述 / 风格 / 声音 / 形象库 / 参考图）

**Effective 投影**：三个 service 各自的 `getEffectiveData` 把 binding + linked_lw + override 投影成扁平 dict。

**Prompt 装配**（review 修复后）：
- `asset-identity-prompt.ts` 共享模块（renderer + service 共用）
- 主入口：`generateMainFor` (renderer) → `MainImageGeneratorService.generateMain` (core)
- 派生入口：`GalleryDerivationService.deriveSingle` (core，自动加载 effective)
- 硬约束模块：character / location / item 各自 constraints.ts

**UI**：
- AssetStageViewV2 → CharacterAssetCardV2 / LocationAssetCardV2 / ItemAssetCardV2 列表
- 点击进入 AssetEditDrawer → CharacterAssetEditorV2 / LocationAssetEditorV2 / ItemAssetEditor (V1)
- 设定卡（CharacterCardFormV2 等，11/9/4 字段平铺）+ 图谱编辑器（V1，三个）
- 多主图 + 派生 dialog（仅 location）

**透明度**：用户看不到 prompt / negativePrompt / 模型 / refImage / 耗时（数据有但 UI 不展示）

### 1.2 分镜域

**数据层**：`storyboards` 表
- 镜头语言字段：`shotType / cameraAngle / cameraMovement / movementDuration`
- 画面描述：`frameDescription`（自由 textarea）
- 转场：`transitionType / transitionDurationMs / transitionDirection`
- 关联：`narrationId / dialogueIds[] / actionIds[] / characters[] / locationBindingIds / itemBindingIds`
- 一致性：`referenceImageIds`（kind:bindingId → imageId override）

**UI**（StageStoryboardViewV2.vue）：
- 镜头工具栏：景别 / 角度 / 运镜 / 时长（select 各 6 类）
- 转场工具栏：类型 / 时长 / 方向
- 画面描述：空白 textarea 无引导
- 分镜内角色 / 地点 / 物品（spec 2026-05-09 实现）

**派生**：仅 location 有 DeriveVariantDialog（单基图选择）；character / item 派生走 GalleryEditor 老路径

### 1.3 制作 / 关键帧域

**数据层**：`storyboard_keyframe` 表
- `referenceOverrides`：用户挑图覆盖
- 链式生成：planKeyframes（start → end → middle）

**UI**（StageProductionViewV2.vue + KeyframeGrid）：
- 镜头信息只读
- 关键帧序列卡（若 useKeyframes=true）
- 视频片段生成卡（VideoSegmentPanel）
- 视频预览卡
- 资产引用卡（缩略图 + 选图 dialog）

**provider 能力**：`VideoProviderCapabilities` 现有 `text/image/keyframes/maxKeyframes/maxDurationSec`，无 `subject` 维度

---

## 2. 设计原则

### 2.1 双母语 UI

每能力对**专业用户**与**大众短剧用户**两类用户都问"母语价值"和"认知负担"。两边都通过的才做；只通过一边的做"分层 UI"（同一功能两种叫法 / tooltip）。

### 2.2 文本 prompt 与 latent conditioning 分工

- **文本 prompt**聚焦"画什么"（视觉内容）
- **一致性**靠 latent conditioning（reference image / subject embedding / LoRA / IP-Adapter）
- **metadata**只用于叙事调度，不进 image prompt
- 不再往 prompt 里堆身份保持文本（2024 年方法论在 2026 SOTA 模型上是负优化）

### 2.3 透明度优先

- 后端落库的数据全部对用户可见（prompt / negativePrompt / 模型 / refImage / 耗时 / 错误码）
- 失败时具体错误展示
- 用户能 self-debug → 客服 / 教程负担骤降

### 2.4 字段是工具不是终点

- 字段按"图像生成 / 叙事调度 / 数据库识别 / 配音"四类分维度
- 同一字段不跨维度复用（避免 metadata 污染 prompt）

---

## 3. 资产域优化（11 项）

### 3.1 撤回过度文本约束（Phase 1 · P0）

**现状**：`commit c0a76fea` 给 character / item 派生加了 30+ 词中英双写身份保持文本约束。在 2026 SOTA 模型上是负优化（稀释 prompt + 跟 reference image 主导一致性的物理路径冲突）。

**目标**：保留极简版（"保持人物身份特征 same face"等 1-2 句即可），让 reference image 物理主导。

**涉及文件**（2）：
- `src/core/modules/episode-production/assets/prompts/character-constraints.ts` — `IDENTITY_PRESERVATION_SUFFIX` 从 6 锚点缩到 1；`IDENTITY_PRESERVATION_NEGATIVE` 从 20+ 词缩到 5-8 词
- `src/core/modules/episode-production/assets/prompts/item-constraints.ts` — `ITEM_IDENTITY_PRESERVATION_*` 同样缩减

**工程量**：30 分钟 ｜ 风险：极低（仅文本 const 改动，函数签名不变）

### 3.2 metadata 与 prompt 解耦（Phase 1 · P0）

**现状**：`asset-identity-prompt.ts` 把 character 的姓名 / 别名 / 定位 / 性别 / 年龄 / 人种 / 外貌 / 服装 / 风格 / 故事背景全拼进 prompt。其中**姓名 / 别名 / 定位**是叙事 metadata，对图像生成无影响只是 noise。

**目标**：`buildVisualPrompt(assetType, eff, storyBg)` 取代 `buildAssetIdentityPrompt`：
- visual-relevant 字段：description / appearance / outfit / outfitsExtra / gender / age / race / styleAnchors / storyBg
- 不进 prompt：alias / role / voiceId / portraitId
- name 保留（让 AI 看到名字辅助识别角色，但不强制）

**涉及文件**（1）：
- `src/core/modules/episode-production/assets/prompts/asset-identity-prompt.ts` — character 分支删除 alias / role 拼接，加注释说明叙事 metadata 不进 prompt 的原则

**工程量**：20 分钟 ｜ 风险：低（影响所有 character 主图 / 派生 prompt 字面，但视觉效果应改善）

### 3.3 透明度面板（Phase 1 · P0）

**现状**：用户点缩略图只能看图，看不到 prompt / negative / 派生关系 / metadata。后端数据已落库（asset_image.prompt / negativePrompt / metadata / derivedFromImageId 都有）。

**目标流程**：缩略图 hover 工具栏加 ⓘ 按钮 → 点击弹 `GenerationDetailDialog`：
- 大缩略图
- 类别 / label / 创建时间
- Prompt 完整内容（一键复制）
- Negative Prompt 完整内容（一键复制）
- 派生自（如有 derivedFromImageId）：基图 label + 缩略图
- 参考图（如有）：referenceImagePath
- Metadata：parsed json 展示

**UI 设计**：复用 el-dialog；prompt 用 `<pre>` 保留换行；提供 ElMessage.success 复制反馈

**涉及文件**（4）：
- 新建 `src/renderer/src/components/episode-production/stage-asset/shared/GenerationDetailDialog.vue`
- 修改 `CharacterGalleryEditor.vue` — 缩略图工具栏加 InfoFilled 图标 + 调用 dialog
- 修改 `LocationGalleryEditor.vue` — 同上
- 修改 `ItemGalleryEditor.vue` — 同上

**工程量**：3 小时 ｜ 风险：极低（纯 UI，无后端改动）

### 3.4 字段双层 UI（Phase 2 · P0）

**现状**：CharacterCardFormV2 11 字段平铺，新手不知重点。

**目标**：双层折叠，让"决定生成效果"的字段显眼，叙事 metadata 折叠：

```
┌─ ⭐ 生成核心 ──────────────────────┐
│  人物描述（textarea，rows=6）        │
│  风格（多选）                        │
│  性别 / 年龄 / 人种                  │
│  参考图（上传）                      │
│  [✨ AI 自动填字段] 按钮              │
└────────────────────────────────────┘
┌─ ▼ 叙事元数据（默认折叠）────────────┐
│  姓名 / 别名 / 定位 / 声音 / 形象库   │
│  提示："仅用于剧本调度，不进图像生成" │
└────────────────────────────────────┘
```

LocationCardFormV2 / ItemCardForm 类似但简化（字段更少）。

**涉及文件**（3）：
- `CharacterCardFormV2.vue` — 节重组 + el-collapse 折叠
- `LocationCardFormV2.vue` — 类似
- `ItemCardForm.vue` — 字段已少，仅加"AI 自动填"按钮

**工程量**：3 小时 ｜ 风险：低（纯 UI，字段绑定不变）

### 3.5 AI 正向字段提取（Phase 2 · P0）

**现状**：用户得逐字段填；现有 `enrichSettings` 只支持反推（从已生成图反推设定）。

**目标**：用户在自由文本"人物描述"里随便写 → 点 ✨ → LLM 抽出姓名 / 性别 / 年龄 / 人种 / 风格 → 自动填表。

**涉及文件**（4）：
- `AssetSettingEnrichmentService` 新增 `extractFieldsFromDescription(assetType, description, projectId)` 方法
- `asset-setting-enrichment.handler.ts` 加 `ep:asset:extract-fields` IPC
- `preload/index.ts` 暴露 `episodeProduction.asset.extractFields`
- `web/client/channel-map.ts` 加映射
- 三个 CardForm 加 ✨ 按钮（与 3.4 合并 commit）

**工程量**：3 小时 ｜ 风险：低（新 IPC，不破坏现有功能）

### 3.6 角色一键多角度参考图（Phase 2 · P0）

**现状**：character 创建后只有 1 张默认主图；用户得手动多次点"派生 view"产出 3q_left / 3q_right / back。

**目标**：character 创建时复选"同时生成多角度参考图"（默认勾选）→ 一次模型调用产出正/侧/背 3-4 张（同 latent 内部一致性远好于多次调用）。

**涉及文件**（3-4）：
- `CharacterAssetEditorV2.vue` — 新建/编辑流程加多角度复选
- `MainImageGeneratorService` 加 `generateMainWithMultiView` 方法（内部调用 provider 的多图生成能力）
- 新 IPC `ep:asset:image:generate-main-multi-view`
- preload + channel-map

**工程量**：4-6 小时 ｜ 风险：中（依赖 provider 多图能力；不支持时降级到串行多次调用）

### 3.7 Provider subject 能力探测路径（Phase 3 · P1）

**现状**：所有 provider 走通用 `prompt + ref images` 路径；KlingO1/O3、Midjourney V7（Omni Reference）等支持原生 subject 概念但没用上。

**目标**：扩 `VideoProviderCapabilities` 加 `subjectSupport: boolean + maxSubjects: number`；adapter 实现按 provider 类型推断；调用方按能力选 API（subject API vs 通用路径）。

**涉及文件**（5-7）：
- `video-provider-adapter.ts` — capabilities 接口加 subjectSupport
- `video-segment.handler.ts` — `deriveCapabilitiesFromModel` 按 provider type 推断
- 各 provider adapter（base-video-provider-bridge / dashscope / kling / volcengine 等）— 实现 subject API 路径
- `keyframe-generation.service.ts` — 调用前判断走哪条
- `provider-capability-matcher.ts` — 加 subject 维度匹配

**工程量**：8-12 小时 ｜ 风险：中（涉及多个 provider 适配器，不同 provider subject API 形态各异）

### 3.8 LoRA fine-tuning（Phase 4 · P2）

**现状**：无。

**目标**：用户给某角色 5-20 张图 → 一键训练角色 LoRA → 后续生成自动加载该 LoRA（适合长内容 / IP 矩阵 / 高质量场景）。

**涉及**：
- 新增 `lora_models` 表（id / character_binding_id / status / trained_at / model_path）
- 训练 IPC（异步）
- LoRA 加载在 `imageGen.generate` 时按 binding 注入
- UI：character 设定卡加"训练专属模型"按钮 + 训练状态展示

**工程量**：3-5 天 ｜ 风险：高（依赖 provider 是否支持自定义 LoRA）

### 3.9 跨项目角色库（Phase 4 · P2）

**现状**：binding 是 projectId 隔离，不能跨剧集复用同一角色。

**目标**：加 `user_assets` 全局表（角色 / 地点 / 物品）作模板源；项目内"从我的库引用 → override 字段"两级。

**涉及**：
- 新表 `user_assets`（含 sourceType / metadata / 多张图 / LoRA 关联）
- 新 IPC：列我的库 / 从库引用到项目 / 同步项目改动回库
- UI：资产创建 dialog 加"从我的库引用"入口；列表卡加"加入我的库"

**工程量**：2-3 天 ｜ 风险：中（涉及新表 + 跨项目数据流）

### 3.10 数字人池（Phase 4 · P2）

**现状**：无。

**目标**：少量精选 10-30 个预制数字人作为 character 资产的特殊子集（与自定义角色共存），覆盖青年男 / 女主播 / 老人 / 中年商务 / 小学生等。

**涉及**：
- character_bindings 加 `sourceType='preset_digital'` 枚举值
- 内置数字人种子数据（schema 注入或 IPC seed）
- 资产创建 dialog 加"从内置形象选"入口
- 不冲淡用户自定义路径（preset 是附加，不取代）

**工程量**：2 天 ｜ 风险：低（数据填充 + UI 入口，逻辑链路与自定义共用）

### 3.11 视频提取主体（Phase 5 · P3）

**现状**：无。

**目标**：character 创建支持上传短视频（5-30s）→ AI 自动逐帧提取 + 一致性聚类 + 选代表帧 → 落到主图 + 多角度变体。

**涉及**：ffmpeg 帧提取 + 人脸聚类 + 代表帧选择算法 + UI

**工程量**：5-7 天 ｜ 风险：高

---

## 4. 分镜域优化（7 项）

### 4.1 双模板单镜画面描述（Phase 2 · P0）

**现状**：StageStoryboardViewV2 的画面描述是空白 textarea，用户填多了浪费、填少了 AI 生成质量差。

**目标**：上方加模板切换器：
- **短剧模板**（默认）：5 段 — 角色 / 场景情境 / 戏剧冲突 / 节奏 / 镜头偏好（短剧自媒体用户母语，LibTV 形态）
- **影视模板**（专业）：5 字段 — subject / action / camera / lighting / mood（电影分镜表标准）

模板把字段折叠展开成结构化文本写入 `frameDescription`。后端 prompt 装配通吃两套。

**涉及文件**（1-2）：
- `StageStoryboardViewV2.vue` — 编辑面板加模板切换 + 模板组件
- 可选新建 `ShotDescriptionTemplate.vue` 子组件

**工程量**：4 小时 ｜ 风险：低（字段还是写到同一 textarea）

### 4.2 摄像机参数化 + 视觉效果 tooltip（Phase 2 · P0）

**现状**：分镜镜头工具栏只有 shotType / cameraAngle / cameraMovement / 时长。

**目标**：加：
- 焦距：35mm（广角）/ 50mm（标准）/ 85mm（人像）/ 125mm（特写压缩）
- 光圈：f/1.8（极浅景深）/ f/4（浅景深）/ f/11（全景清晰）
- 相机风格：电影感 / 数码 / 胶片 / 复古

每个选项 tooltip 含视觉效果描述 + 缩略示意图。专业用户跳过示意直接选数值，大众用户看图选。

**涉及文件**（3-4）：
- `storyboards` 表加 `lensFocalMm / aperture / cameraStyle` 字段（schema 改 → Phase 2 例外，需新迁移）
- 或：放到 metadata JSON 里避免 schema 改动 ← **推荐方案**
- `StageStoryboardViewV2.vue` — 镜头工具栏加新 select
- prompt 装配时翻译成英文标准词

**工程量**：6 小时 ｜ 风险：低（用 metadata JSON 不动 schema）

### 4.3 运镜 20+ 命名预设（Phase 2 · P0）

**现状**：cameraMovement 只有 6 类（push/pull/pan/track/crane/static）。

**目标**：扩到 20+ 命名化预设，加"希区柯克变焦 / 长镜头跟拍 / 大师推近 / 螺旋上升 / 主观视角 / OTS（过肩）/ 360 环绕"等。每预设 tooltip 含视觉描述 + 适用场景 + 翻译表。

**涉及文件**（2）：
- 新建 `core/.../constants/camera-movements.ts`（命名预设 → 提示词翻译表）
- `StageStoryboardViewV2.vue` — el-select 用预设列表替代当前 6 项

**工程量**：3 小时 ｜ 风险：低

### 4.4 打光命名预设（Phase 2 · P0）

**现状**：无打光控制。

**目标**：6-12 个命名预设（伦勃朗光 / 三点照明 / 蓝色逆光 / 黄金时刻 / 蝴蝶光 / 平铺光 / 戏剧侧光 等）。每预设 tooltip 含氛围描述 + 示意。不做 LibTV 的 3D 坐标球（过度）。

**涉及文件**（3）：
- 新建 `core/.../constants/lighting-presets.ts`
- `StageStoryboardViewV2.vue` — 镜头工具栏加打光 select
- prompt 装配时拼到 frameDescription 末尾

**工程量**：3 小时 ｜ 风险：低

### 4.5 全局镜头编号（Phase 2 · P1）

**现状**：分镜显示"场景X.分镜Y"，无全局唯一编号。

**目标**：④/⑤/⑥ stage 显示 `EP01_S03_SH04` 全局编号；剧集多分镜后便于跨分镜引用。

**涉及文件**（3-4）：
- 计算函数（episode + scene + storyboard 组合）放共享 utils
- ④ 分镜 stage 卡片显示
- ⑤ 制作 stage 头部显示
- ⑥ 合成 stage 时间轴显示

**工程量**：2 小时 ｜ 风险：极低（纯展示）

### 4.6 派生支持多基图（Phase 2 · P1）

**现状**：DeriveVariantDialog 用 `el-radio-group` 单选基图。

**目标**：改为 `el-checkbox-group` 多选；provider 支持多 ref（如 Seedance 2.0 最多 9 张、HappyHorse 1.0 最多 9 张）时全部喂；不支持时只用第一张。

**涉及文件**（2）：
- `DeriveVariantDialog.vue` — radio → checkbox
- `gallery-derivation.service.ts` — `deriveSingle` 支持 baseImageIds[]（向后兼容 baseImageId 单值）

**工程量**：3 小时 ｜ 风险：低

### 4.7 局部可视化连线（分镜子画布）（Phase 3 · P2）

**现状**：⑤ 制作 stage 已经是分镜中心化的卡片布局（资产卡 / 关键帧卡 / 视频生成卡 / 视频预览卡）。**子画布雏形已存在**，只缺连线可视化。

**目标**：加"显示生成链路"开关（默认关闭），开后在卡片之间叠加只读连线 + 数据传递标签：
- 资产 → 关键帧（resolveSceneAssets 已建立这条数据流）
- 关键帧 → 视频（keyframes2video 已有）
- 用户挑选的资产参考图 → 关键帧（storyboard.referenceImageIds 已有数据）
- keyframe.referenceOverrides 已落地

**关键约束**：**只读、不可编辑** — 数据流仍由后端逻辑决定。这避免变成真画布化。

**涉及文件**（2-3）：
- 新建 `LineageOverlay.vue` 组件（绝对定位连线 SVG）
- `StageProductionViewV2.vue` — 加开关 + 集成 overlay
- 共享 hook 计算节点位置（getBoundingClientRect 反查）

**工程量**：8-12 小时 ｜ 风险：中（连线随 DOM 变化要重算；窗口缩放 / 滚动也要重算）

---

## 5. 剧本→分镜衔接（1 项）

### 5.1 9 帧故事板草稿模式（Phase 2 · P0）

**现状**：剧本 → 分镜走 AI 拆分镜（一次性出全部分镜数），用户只能逐分镜调整或全删重生。

**目标**：剧本 → "9 帧故事板预览"（默认）→ 用户挑骨架 → 走现有关键帧链式精出。

- **AI 友好**：一次模型推理出 9 帧的内部一致性远好于 9 次独立调用（同 latent + 同推理上下文）
- **专业用户**：thumbnail storyboard，电影前期标准做法
- **大众用户**：可视化的剧本展开，挑骨架再细化（替代"每帧从零写描述"的高认知负担路径）

**UI**：
```
剧本 stage 完成后 → "故事板预览"按钮 → 弹 dialog
┌─ 故事板预览（9 帧）─────────────────┐
│  [缩略图 1] [缩略图 2] [缩略图 3]    │
│  [缩略图 4] [缩略图 5] [缩略图 6]    │
│  [缩略图 7] [缩略图 8] [缩略图 9]    │
│  每帧勾选框：[✓ 用作分镜骨架]        │
└─────────────────────────────────────┘
点确认 → 勾选的帧成为分镜 storyboard 行，frameDescription 来自 AI 生成
```

**涉及文件**（4-5）：
- 新建 `StoryboardThumbnailDialog.vue`
- 新 IPC `ep:storyboard:generate-thumbnails`（一次推理出多帧）
- 新 service 方法 `generateStoryboardThumbnails`
- script stage 加入口按钮
- preload + channel-map

**工程量**：1 天 ｜ 风险：中（一次出 9 帧需 provider 支持多输出，不支持时降级到 9 次串行）

---

## 6. 工作流入口（3 项）

### 6.1 AI 一键快速通道（短剧入口）（Phase 3 · P1）

**现状**：用户得走完整 6 stage（① 内容 → ② 资产 → ③ 剧本 → ④ 分镜 → ⑤ 制作 → ⑥ 合成），每 stage 都需手动操作。

**目标**：首页或 ① 内容 stage 加"AI 一键模式"wizard：
- 用户输入一句话
- 自动跑剧本生成 → 资产生成（含三视图）→ 9 帧故事板 → 分镜确认 → 关键帧 → 出片
- 每步可介入修改但不强制

**涉及文件**（4-5）：
- 新建 `AIQuickModeWizard.vue`
- 新 service `QuickModeOrchestrator` 编排各 stage 的 service
- 新 IPC `ep:project:quick-mode-run`（流式进度推送）
- 首页 + ① 内容 stage 加入口按钮
- 进度条 / 中间结果展示

**工程量**：3-4 天 ｜ 风险：中（编排链路长，错误恢复要细致）

### 6.2 Agent / Skill 接入（Phase 4 · P2）

**目标**：把"生成关键帧 / 角色三视图 / 派生变体 / 拆分镜 / 9 帧故事板"原子能力封装成 Skill，外部 Agent（Claude Code 等）可调用。

**涉及**：
- Skill 描述文件（YAML / JSON schema）
- 入口 IPC 暴露给外部 Agent（HTTP / MCP server）
- 鉴权 / 配额

**工程量**：3-5 天 ｜ 风险：中

### 6.3 视频解析（反向工程参考视频）（Phase 4 · P2）

**目标**：用户上传参考视频 → AI 拆出"画面 / 景别 / 镜头 / 运镜 / 时长 / 音乐节奏" → 一键导入到当前剧集作为分镜骨架。

**涉及**：
- 视频帧采样（ffmpeg）
- 多模态 LLM 分析（VLM 模型）
- 解析结果落到 storyboard 表
- UI：资产 / 剧本 stage 加"从参考视频导入"入口

**工程量**：3-5 天 ｜ 风险：中

---

## 7. 总修改清单（按 Phase 汇总）

### Phase 1（资产 prompt 重构 + 透明度）· 工程量 4 小时

| # | 文件 | 改动类型 | 主题 |
|---|---|---|---|
| 1 | `core/.../prompts/character-constraints.ts` | 修改 | 缩减身份保持 |
| 2 | `core/.../prompts/item-constraints.ts` | 修改 | 同上 |
| 3 | `core/.../prompts/asset-identity-prompt.ts` | 修改 | 删 alias/role |
| 4 | `stage-asset/shared/GenerationDetailDialog.vue` | 新建 | 透明度面板 |
| 5 | `CharacterGalleryEditor.vue` | 修改 | 加 ⓘ 入口 |
| 6 | `LocationGalleryEditor.vue` | 修改 | 同上 |
| 7 | `ItemGalleryEditor.vue` | 修改 | 同上 |

**Commit 划分**：C1（缩减约束 1+2）/ C2（解耦 metadata 3）/ C3（透明面板 4+5+6+7）

### Phase 2（字段双层 + 镜头语言层 + 9 帧故事板）· 工程量 5-7 天

| # | 文件 | 类型 | 主题 |
|---|---|---|---|
| 8 | `CharacterCardFormV2.vue` | 修改 | 字段双层 |
| 9 | `LocationCardFormV2.vue` | 修改 | 同上 |
| 10 | `ItemCardForm.vue` | 修改 | 字段简化 + AI 按钮 |
| 11 | `AssetSettingEnrichmentService` | 改 | extractFieldsFromDescription |
| 12 | `asset-setting-enrichment.handler.ts` | 改 | 新 IPC |
| 13 | `preload/index.ts` | 改 | 暴露 API |
| 14 | `web/client/channel-map.ts` | 改 | 通道映射 |
| 15 | `CharacterAssetEditorV2.vue` | 改 | 多角度参考图复选 |
| 16 | `MainImageGeneratorService` | 改 | generateMainWithMultiView |
| 17 | `asset-image.handler.ts` | 改 | 新 IPC |
| 18 | `StageStoryboardViewV2.vue` | 改 | 双模板画面描述 + 摄像机 + 运镜 + 打光 + 全局编号 |
| 19 | `core/.../constants/camera-movements.ts` | 新建 | 20+ 运镜预设 |
| 20 | `core/.../constants/lighting-presets.ts` | 新建 | 6-12 打光预设 |
| 21 | `core/.../constants/lens-presets.ts` | 新建 | 焦距/光圈/相机风格 |
| 22 | `DeriveVariantDialog.vue` | 改 | 多基图选择 |
| 23 | `gallery-derivation.service.ts` | 改 | baseImageIds[] 兼容 |
| 24 | `StoryboardThumbnailDialog.vue` | 新建 | 9 帧故事板 |
| 25 | `narrative/ai/storyboard-thumbnail-generator.ts` | 新建 | 一次出多帧 service |
| 26 | `narrative/storyboard-thumbnail.handler.ts` | 新建 | IPC handler |
| 27 | StageContentScriptView 或同级 | 改 | 入口按钮 |

**Commit 划分**：C4（字段双层 8+9+10）/ C5（AI 字段提取 11+12+13+14）/ C6（多角度 15+16+17）/ C7（双模板 + 摄像机 + 运镜 + 打光 18+19+20+21）/ C8（全局编号——单独 commit）/ C9（多基图派生 22+23）/ C10（9 帧故事板 24+25+26+27）

### Phase 3（provider subject + 局部子画布 + AI 一键通道）· 工程量 6-9 天

| # | 文件 | 类型 | 主题 |
|---|---|---|---|
| 28 | `video-provider-adapter.ts` | 改 | capabilities 加 subjectSupport |
| 29 | 各 provider adapter | 改 | subject API 实现 |
| 30 | `provider-capability-matcher.ts` | 改 | subject 维度匹配 |
| 31 | `keyframe-generation.service.ts` | 改 | 调用前判断走哪条 |
| 32 | `LineageOverlay.vue` | 新建 | 局部子画布连线 |
| 33 | `StageProductionViewV2.vue` | 改 | 加开关 + 集成 |
| 34 | `AIQuickModeWizard.vue` | 新建 | 一键通道 wizard |
| 35 | `QuickModeOrchestrator` service | 新建 | 编排各 stage |
| 36 | `project.handler.ts` | 改 | quick-mode-run IPC |
| 37 | 首页 / ① 内容 stage | 改 | 加入口 |

### Phase 4（LoRA + 跨项目库 + 数字人池 + Agent + 视频解析）· 工程量 2-3 周

涉及多个新表（lora_models / user_assets）、多个新 service、Agent / Skill 接入框架、视频解析 pipeline。详细文件清单待 Phase 4 启动时再细化。

### Phase 5（视频提取主体）· 工程量 1 周

ffmpeg pipeline + 人脸聚类。具体待启动时细化。

---

## 8. Phase 排期

| Phase | 内容 | 估时 | 何时启动 |
|---|---|---|---|
| 1 | 资产 prompt 重构 + 透明度 | 4 小时 | 立即（已设计完） |
| 2 | 字段双层 + 镜头语言层 + 9 帧故事板 | 5-7 天 | Phase 1 完成后即跑 |
| 3 | provider subject + 局部子画布 + AI 一键通道 | 6-9 天 | Phase 2 完成 + 用户验证 |
| 4 | LoRA / 跨项目库 / 数字人池 / Agent / 视频解析 | 2-3 周 | 视产品方向 |
| 5 | 视频提取主体 | 1 周 | 长期 |

**关键节点**：
- Phase 1 完成 → 验证生成质量提升 + 透明度面板能 self-debug
- Phase 2 完成 → 验证镜头语言层对生成质量的影响 + 9 帧故事板对短剧用户工作流的改善
- Phase 3 完成 → 验证 provider subject 路径在主流模型上的一致性提升 + 局部子画布对调试的帮助

每个 Phase 后留观察期，不堆积。

---

## 9. 验证 / 风险

### 验证 checklist（每 Phase 末）

| 项 | 验证方式 |
|---|---|
| vue-tsc 类型检查 | 无新错误 |
| 类型契约 | preload + channel-map 双端打通 |
| Phase 1 prompt 字符数 | < 修改前 60% |
| Phase 1 透明面板 | 全部字段正确展示 |
| Phase 2 字段双层 | 设定卡核心区可见、折叠区默认收起 |
| Phase 2 双模板切换 | 短剧 5 段 / 影视 shot-level 切换正常 |
| Phase 2 9 帧故事板 | 一次推理产出 9 帧，连贯性符合预期 |
| Phase 3 provider subject 探测 | KlingO/Midjourney 走 subject 路径，其他降级 |

### 风险点

1. **prompt 字面变化导致已生成图无法重现** — 不重生即不变，已存的 prompt/imagePath 不动
2. **provider subject 路径** — 不同 provider API 形态各异，需逐个适配
3. **9 帧故事板一次推理** — 不是所有 provider 都支持多输出，需降级到串行
4. **LoRA 训练** — 训练时间长（数十分钟），UI 异步状态管理要细致
5. **数字人池预制数据** — 版权 / 肖像权风险，需采购或自行生成

### 元保证

- 单 commit ≤ 4 文件
- 每 commit 过 vue-tsc
- Phase 4+ 改 schema 时再次 pg_dump 备份
- 前期严格保证零 schema 变更（Phase 1-3）

---

## 10. 与已有 review 的关系

| review 文档 | 内容 | 本设计的关系 |
|---|---|---|
| `asset-prompt-assembly-review` | 现状梳理 + 5 处装配点收口 | Phase 1 撤回部分过度工程；其他保留 |
| `libtv-xiaoyunque-comparison` | 行业对比 + 双母语原则 + P0-P3 优先级 | Phase 2/3 镜头语言层 + 工作流入口源头 |
| `asset-generation-review` | 字段太多分析 + 技术路线纠偏 | Phase 1/2 数据 metadata 解耦源头 |
| `integrated-optimization-plan` | 5 phase 路线图 | 本设计是其细化版 |

---

## 验证（在 docs/review/ 落地后）

完成 plan mode 后将本文件复制到 `docs/review/2026-05-09-comprehensive-design.md`，作为后续实施的执行蓝图。每个 Phase 完成后回填实际工程量 + 遇到的偏差，作为下次估算依据。
