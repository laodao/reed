# ④ 分镜 + ⑤ 制作 界面重整设计文档

> 日期：2026-05-10
> 状态：设计阶段（**未实施**，等用户确认后开干）
> 相关 review：
>   - [`2026-05-09-asset-prompt-assembly-review.md`](./2026-05-09-asset-prompt-assembly-review.md) · 资产装配现状
>   - [`2026-05-09-asset-generation-review.md`](./2026-05-09-asset-generation-review.md) · 一致性技术路线（latent conditioning vs prompt anchor）
>   - [`2026-05-09-libtv-xiaoyunque-comparison.md`](./2026-05-09-libtv-xiaoyunque-comparison.md) · 行业对照
>   - [`2026-05-09-comprehensive-design.md`](./2026-05-09-comprehensive-design.md) · Phase 1-5 蓝图（涉及子画布 / subject 探测）
>   - [`2026-05-09-ep-redesign-spec.md`](./2026-05-09-ep-redesign-spec.md) · 综合规范（22 项能力）
>   - [`/progress/2026-05-10-e2e-fullflow/report-shot-1.2.md`](../../progress/2026-05-10-e2e-fullflow/report-shot-1.2.md) · e2e Bug A/B/C 实测

---

## 0. 背景

经过 e2e 实测 + Bug A/B/C 修复后，用户提出 6 个深度问题，集中暴露 **④ 分镜 / ⑤ 制作 两个界面"元素堆叠 vs 实际作用"严重不匹配**：

> 元素太多，看起来功能丰富，但是实际上起到作用没有不知道，反而让人觉得混乱找不到重点。

本文档目的：

1. **梳理**两界面所有 UI 要素 + 每个要素**真正影响什么**（keyframe / video / 仅 ⑥ 合成 / 纯装饰）
2. **审视**昨天 review 的核心结论（latent conditioning / subject / IP-Adapter / 子画布）落地情况，找出未落地的部分
3. **回答** Q1（形象组 vs 挑图）/ Q3（文生图模式 + 镜头中文化）/ Q4（制作界面冗余审视）/ Q6（整体重设计）
4. **给出**简化方案 — 不立即实施，等用户确认

---

## 1. 数据流真相：什么字段真影响生成

### 1.1 关键帧（image generator）输入

```
buildKeyframePrompt(input)  →  prompt 文本
  + collectReferenceImages   →  referenceImagePaths[]
        │
        ▼
ImageGenerator.generate({ prompt, negativePrompt, referenceImagePaths, label })
        │
        ▼
asset_image 表落库（含 prompt / negativePrompt / metadata / referenceImageIds）
```

| 输入项 | 来源字段 | 进 prompt 文本 | 进 referenceImagePaths |
|---|---|---|---|
| 风格前缀 | styleConfig.stylePrefix（默认 cinematic） | ✓ | — |
| 场景描述 | scene.sceneDescription | ✓ | — |
| 时刻描述 | keyframe-chain-strategy（start/middle/end） | ✓ | — |
| 地点 | location.effective.name + description | ✓ | ✓ 一张评分挑出的变体 |
| 画面描述 | **storyboard.frameDescription** | ✓ | — |
| 主体 | storyboard.subject | ✓ | — |
| 角色身份 | character.effective.name + appearance + outfit | ✓ | ✓ 一张评分挑出 + **形象组其余图全部追加** |
| 角色配置 | storyboard.characters[].expression/action/position | ✓ | — |
| 物品 | item.effective.name + description | ✓ | ✓ 一张 |
| 氛围 / 时间 / 天气 | scene.mood / timeOfDay / weather | ✓ | — |
| 构图 | storyboard.composition | ✓ | — |
| 镜头语言 | storyboard.shotType / cameraAngle | ✓ | — |
| 镜头扩展 | storyboard.metadata.lensFocalMm / aperture / cameraStyle / lighting | ✓ | — |
| 用户调整方向 | UI userPrompt（KeyframeGenerationService.input.userPrompt） | ✓ 拼末尾 | — |
| 质量后缀 | styleConfig.qualitySuffix | ✓ | — |

### 1.2 视频片段（video generator）输入

```
VideoSegmentService.generateForStoryboard(storyboardId)
  │
  └─ promptForVideo = sb.frameDescription || sb.subject || ''   ← 只有这一个字段！
  │
  └─ keyframes = 已生成的关键帧（按 mode 取 0/1/N 张）
  │
  ▼
VideoProviderAdapter.{textToVideo | imageToVideo | keyframesToVideo}
```

**video prompt 里仅 frameDescription**。**所有其他字段** —— 镜头语言、角色配置、对白、旁白、调整方向、style anchor、地点描述、物品、metadata —— **都不进 video prompt**。

视频"看起来有角色 / 有地点"是因为关键帧本身就是结合上述要素生成的，video provider 只是"在两张关键帧之间插值"或"图生视频"，不读那些字段。

### 1.3 ⑥ 合成（timeline-builder）输入

合成 stage 用：
- 各分镜 `videoPath`（拼接源）
- `transitionType` / `transitionDurationMs` / `transitionDirection` / `transitionEasing` / `transitionColor`（ffmpeg xfade 参数）
- AudioPanel 生成的对话/旁白音频（`narrationId` / `dialogueIds[]` 决定哪段进哪个分镜的音轨）

这些字段**不影响**关键帧 / 视频生成本身。

---

## 2. ④ 分镜 + ⑤ 制作 当前 UI 要素 inventory

### 2.1 ④ 分镜（StageStoryboardViewV2.vue）

| # | 要素 | 写到字段 | 影响 keyframe? | 影响 video? | 影响 ⑥ 合成? |
|---|---|---|---|---|---|
| A1 | 镜头工具栏 · 景别 | shotType | ✓ | ✗ | ✗ |
| A2 | 镜头工具栏 · 角度 | cameraAngle | ✓ | ✗ | ✗ |
| A3 | 镜头工具栏 · 运镜（25 预设） | cameraMovement | ✓ | ✗ | ✗ |
| A4 | 镜头工具栏 · 时长 | duration | — | ✓（durationSec） | ✓ timeline 长度 |
| A5 | 镜头工具栏 · 焦距 | metadata.lensFocalMm | ✓ promptHint | ✗ | ✗ |
| A6 | 镜头工具栏 · 光圈 | metadata.aperture | ✓ promptHint | ✗ | ✗ |
| A7 | 镜头工具栏 · 相机风格 | metadata.cameraStyle | ✓ promptHint | ✗ | ✗ |
| A8 | 镜头工具栏 · 打光预设 | metadata.lighting | ✓ promptHint | ✗ | ✗ |
| **B1** | 转场工具栏 · 类型 | transitionType | ✗ | ✗ | ✓ |
| **B2** | 转场工具栏 · 时长 | transitionDurationMs | ✗ | ✗ | ✓ |
| **B3** | 转场工具栏 · 方向 | transitionDirection | ✗ | ✗ | ✓ |
| **B4** | 转场工具栏 · 缓动 | transitionEasing | ✗ | ✗ | ✓ |
| **B5** | 转场工具栏 · 颜色 | transitionColor | ✗ | ✗ | ✓ |
| C1 | 画面描述（自由 textarea） | frameDescription | ✓ | ✓ **唯一来源** | ✗ |
| C2 | 主体描述 | subject | ✓ | △ fallback | ✗ |
| C3 | 构图 | composition | ✓ | ✗ | ✗ |
| D1 | 镜头内角色配置（位置/表情/动作/朝向） | storyboard.characters JSON | ✓ | ✗ | ✗ |
| E1 | 关键帧数 | keyframeCount | ✓ N 张 | △ 决定 mode | ✗ |
| E2 | 生成模式 · 文生图 / 首尾帧 | useKeyframes | △ 是否生成 | △ 决定 mode | ✗ |
| E3 | 资产引用挑图（kind:bindingId → imageId） | storyboard.referenceImageIds | ✓ refImage | ✗ | ✗ |
| F1 | 3D 摆位 | use3dStaging / stagingLayoutId | ✓ 若启用 | ✗ | ✗ |
| F2 | 背景参考图绑定 | backgroundRefImageId | ✓ ref | ✗ | ✗ |
| F3 | 旁白 ID / 对白 IDs / 动作 IDs | narrationId / dialogueIds / actionIds | ✗ | ✗ | ✓ Audio panel |

**问题**：
- B 段（5 个转场字段）放在 ④ 分镜界面，但完全不影响生成 — 应放到 ⑥ 合成
- A5-A8（镜头扩展）+ A1-A3（镜头语言）共 7 个字段都进 keyframe prompt 但不进 video prompt — **文生图模式下完全无效**
- F3（旁白/对白 IDs）通常 AI 拆分镜时自动填，用户未必需要在 ④ 改

### 2.2 ⑤ 制作（StageProductionViewV2.vue）

```
顶部 · 分镜信息 panel（只读，含全局编号 / 镜头语言 / 时长 / 生成模式 / 关键帧数 / 3D 摆位）
分镜信息行尾："如需修改请回 ④ 分镜界面"提示

中部 · upper-split
  上左 · 关键帧序列（仅 useKeyframes=true 时显示）
    ├ 时间轴 bar
    ├ KeyframeGrid 九宫格
    │   每帧卡片：
    │     ├ 缩略图 + 重生成按钮 + 查看大图
    │     ├ #编号 + role 文字 + timePercent
    │     ├ 资产 chip（地点 + 角色 chip + 表情）
    │     └ 「基于 [挑图按钮] + 参考图列表」
    │         参考图列表 = collectReferenceImages 出来的 5+ 张
    │   插帧按钮（两帧之间）
    └ 参考链顺序提示
  上左 · 视频片段生成 panel
    ├ 已生成/未生成标签
    ├ 「最终提示词预览」(finalPromptPreview computed)
    │   （包含【画面描述】【镜头语言】【地点】【角色】【旁白】【对白】【调整方向】）
    ├ 「调整方向」textarea (userPrompt)
    └ 「重新生成」按钮
  上右 · 视频预览 panel（video 元素 + src 路径）

下部 · full-width
  「本分镜引用的资产」panel
    ├ 资产实体卡片（地点 / 角色 / 物品） — 可点进入 dialog 挑 storyboard-level 参考图
    └ 提示词组装公式 hint
  AudioPanel（旁白 / 对话 / BGM 生成）

子画布连线 overlay（默认关闭，showLineage 开关）
```

**问题点统计**：

| # | 要素 | 影响 keyframe? | 影响 video? | 问题 |
|---|---|---|---|---|
| P1 | 关键帧 chip 显示「角色 / 地点」 | — 仅 UI | — | 不影响生成，纯展示 |
| P2 | KeyframeGrid 「🎯 挑图」 → 写 keyframe.referenceOverrides | ✓ per-frame | ✗ | 与底部"本分镜引用资产"功能重复（一个 per-frame 一个 per-storyboard） |
| P3 | KeyframeGrid 参考图列表（5 张）| 展示 collectReferenceImages 实际用图 | ✗ | 数量超过资产数（因为含**形象组**追加）让用户困惑 |
| P4 | **「最终提示词预览」**（包含 7 段）| ✗ | ✗ **完全装饰** | **重大误导** — 用户以为这就是发给 AI 的 prompt |
| P5 | 「调整方向」textarea (userPrompt) | ✓ keyframe | ✗ video 不接 | 位置在"视频片段生成"panel 但只影响 keyframe |
| P6 | 视频预览 panel | — 仅展示 | — | OK |
| P7 | 「本分镜引用的资产」底部 panel · 点击挑图 → 写 storyboard.referenceImageIds | ✓ 所有 keyframe 共用 | ✗ | 与 P2 功能重复 |
| P8 | AudioPanel | ✗ | ✗ | ⑥ 合成时用，与 ⑤ 制作无直接关系 |
| P9 | 提示词组装公式 hint | — | — | 描述了一个根本不准确的公式（没说 video 只用 frameDescription）|
| P10 | 子画布连线 overlay | — | — | 默认关闭、无人知道，等于没做 |

**重大冗余**：
- 两个挑图入口（P2 关键帧下挑图 + P7 底部资产挑图）用户分不清
- P4 「最终提示词预览」**实质是装饰**，video 根本不读它（这就是 e2e Bug A 的根本原因）
- P5 「调整方向」放在 video panel 但只影响 keyframe — 误导

---

## 3. 昨天 review 的核心结论 vs 已落地情况

### 3.1 昨天 review 提出的关键技术理念

| 来源 | 理念 | 含义 |
|---|---|---|
| asset-generation §2 | **latent conditioning > prompt anchor** | 一致性靠 reference image / subject embedding / IP-Adapter / LoRA，不是文本"严格保持人脸..." |
| asset-generation §6 P0 | **metadata 与 prompt 解耦** | 姓名/别名/定位是叙事数据，不进 image prompt |
| comprehensive-design §2.2 | **文本 prompt 聚焦"画什么"** | metadata 只用于叙事调度 |
| ep-redesign-spec §3.2 D1 | **角色形象组 = multi-reference** | 不训练 LoRA；把已有多张图全喂给 provider 多 ref 入参 |
| ep-redesign-spec §3.2 C1（Phase 3） | **provider subject 探测路径** | KlingO/MJ V7/Seedance 2.0 走原生 subject API；不支持时降级 |
| comprehensive-design P3.2 / libtv §11 | **局部子画布只读连线** | ⑤ 制作 stage 已分镜中心化，加 LineageOverlay 显示连线 |
| ep-redesign-spec §2.2.1 ★ | **AI 自动透明** | "已自动加强主体描述"等提示让用户理解 AI 在做什么 |

### 3.2 已落地情况

| 理念 | 落地状态 | 备注 |
|---|---|---|
| latent conditioning > prompt anchor | △ **部分** | character-constraints / item-constraints 已大幅缩减；但 keyframe prompt 仍堆 1000+ 字符（含 styleAnchor + 镜头语言 + 角色身份块 + 物品描述） |
| metadata 与 prompt 解耦 | ✓ | asset-identity-prompt.ts 已删 alias/role |
| **角色形象组 multi-reference** | ✓ **已实现** | ReferenceSetPanel.vue + reference_set_image_ids 字段 + getReferenceSetImageIds + collectReferenceImages 追加 |
| **provider subject 探测路径** | ✗ **未实现** | infer-subject-support.spec.ts 21 测试通过但 adapter 没接入 — capabilities 字段加了但实际 generateImage 路径没走 subject API |
| **局部子画布连线** | △ **半成品** | LineageOverlay.vue 组件已有，但默认关闭；连线绘制逻辑可能不完整；用户不知道这个开关 |
| AI 自动透明（"已自动加强..."等提示）| ✗ **未实现** | UI 没显式说明形象组 / multi-reference 行为 |

### 3.3 Bug 修复 vs 重设计的差距

e2e Bug A/B/C 修复让"显示 vs 数据"对齐了，但**没解决根本问题**：

- Bug A 修：UI dialogues 按 dialogueIds 过滤 → 但 finalPromptPreview 整体仍是装饰（video 根本不读）
- Bug B 修：keyframe prompt 按本分镜角色 → 但**关键帧 prompt 总体过长 + 镜头语言/打光/相机/角色身份/构图都堆在一起**（844 字符 → 672 字符仍然太长）
- Bug C 修：拆分镜 characterId 校验 → 但 UI 显示「?」改善后仍无法看到"哪些资产真正进了 prompt / refImage"

**根本问题**：当前 ④/⑤ 是**字段堆叠 UI**，没体现"哪些字段决定生成、哪些是装饰"的层次感。

---

## 4. Q1 / Q3 / Q4 详细回答

### Q1 · 形象组 vs 挑图：是否重复？是否所有分镜共用？

**不重复，但 UI 区分不清**：

| | 形象组（D1 ReferenceSet） | 分镜挑图（storyboard.referenceImageIds） | 帧挑图（keyframe.referenceOverrides） |
|---|---|---|---|
| 粒度 | binding 级（**所有项目内分镜共用**） | storyboard 级（一个分镜的所有 keyframe 共用） | 单帧级 |
| 决定的事 | "用哪几张图作为该角色的稳定多 ref 集"（generation-time anchor） | "本分镜要用该角色的哪一张图"（场景级 override） | "本帧用该角色的哪一张图" |
| 用户操作位置 | ② 资产 → 角色编辑器 → ⭐ 形象组面板 | ⑤ 制作 → 底部"本分镜引用资产" | ⑤ 制作 → KeyframeGrid 关键帧下"🎯 挑图" |
| 写到字段 | character_bindings.reference_set_image_ids | storyboards.reference_image_ids | storyboard_keyframes.reference_overrides |
| 对生成影响 | **追加到 referenceImagePaths** | **覆盖**主图源（取代评分挑图） | 同上但单帧 |

**集合关系**（最终传给 image provider 的图）：
```
final refImages = [
  地点：override(分镜挑图) ?? auto-pick(time/weather)
  角色：[
    override(帧挑图) ?? override(分镜挑图) ?? auto-pick(expression/outfit),
    ...形象组中其他图（去重后追加）
  ]
  物品：override(分镜挑图) ?? auto-pick
]
```

**结论**：
- 形象组 = **角色级稳定参考集**（无论哪个分镜都喂这套）— 让"李墨"这个角色在所有镜头里**身份保持**
- 分镜/帧挑图 = **场景级覆盖**（这个分镜的李墨，特定地用某张表情图作为主参考）

二者**正交**，但当前 UI 没解释清楚 — 用户看到关键帧下挑图列了 5 张图，不知道为什么这么多（实际是「评分挑的 1 张 + 形象组其余 4 张」追加）。

**改进**：
1. 关键帧下"基于"区域**分组显示**：「本分镜参考」+ 「角色形象组」两段
2. 形象组卡片加 ⓘ tooltip：「这个角色在所有分镜里都会用这几张图作为身份参考」
3. 文档在 ② 资产 角色编辑器顶部一行说明形象组定义

### Q3 · 文生图模式应隐藏镜头语言 + 镜头描述中文化

**文生图模式下要隐藏的字段**（这些字段 video 不读）：
- A1-A8：景别 / 角度 / 运镜 / 焦距 / 光圈 / 相机风格 / 打光（**全部 8 个**）
- C3：构图
- D1：镜头内角色配置
- E1：关键帧数
- F1：3D 摆位
- F2：背景参考图绑定

文生图模式只需要：**画面描述（C1）+ 时长（A4）+ 转场（B1-B5）** — 6 个字段。

**镜头描述中文化**：当前 ⑤ 制作 stage 顶部信息行 `cameraMovementLabel(selectedStoryboard.cameraMovement)` 函数返回值已经是中文（看 StageStoryboardViewV2 的 select 选项已用中文 label），但**截图实测显示** `medium_close · eye_level · static`、`long · eye_level · dolly_in` — 显示出来的是英文 value 而不是 label。需要追到 ⑤ 制作 stage 看 shotTypeLabel/cameraAngleLabel/cameraMovementLabel 函数实现是否正确反查中文。

### Q4 · 制作界面冗余审视

**应该去掉的（按"是否影响生成"标准）**：

1. ❌ **「最终提示词预览」整段** — 装饰，video 根本不读。
   - **可保留**：仅显示 `frameDescription`（video 唯一 prompt），并明确标注"此为视频生成提示词"
   - **可保留**：keyframe 完整 prompt 移到关键帧详情 dialog（点 ⓘ 触发）

2. ❌ **两个挑图入口二选一**：
   - 推荐保留**底部"本分镜引用资产"挑图**（粗粒度，整分镜共用，简单直观）
   - 删除**关键帧下"🎯 挑图"**（per-frame 高级功能，使用率极低，等专业用户场景再加回）

3. ❌ **「调整方向」位置错误**：
   - 移到 KeyframeGrid 内（影响 keyframe）
   - 或同时给 video 路径接上（让它真的影响 video prompt）

4. ❌ **「提示词组装公式」hint** — 这段公式不准确（没说 video 只用 frameDescription），删掉或改成准确版本

5. ❌ **AudioPanel 在 ⑤ 制作 显示但不影响视频本身** — 是否移到 ⑥ 合成？或保留但加视觉分隔（"以下用于⑥合成"）

6. △ **关键帧 chip 显示的角色/地点信息** — 与底部资产卡重复；KeyframeGrid 内的 chip 可极简化

---

## 5. Q6 · ④/⑤ 整体重设计方案

### 5.1 设计原则（基于昨天 review）

1. **所见即所得**（透明度优先）：UI 显示的每个元素都对应**真实参与生成**的字段；纯装饰元素去掉或明确标"仅显示用"
2. **影响生成的字段最显眼，叙事元数据折叠**（同昨天资产域 P0 改动思路）
3. **latent conditioning 占主导**：UI 重点不再是"用户填多少 prompt 字段"，而是"用户管理多少参考图（形象组）+ 选用哪个 provider"
4. **关键帧 ≠ 视频**：明确分离 — 关键帧是**视觉锚定**，视频是**关键帧之间的运动**
5. **模式分流**：文生图 / 首尾帧两种模式 UI 完全不同（不要塞一个统一布局让两种用户都觉得乱）

### 5.2 ④ 分镜重设计

**分两区**：

```
┌─ ⭐ 决定生成 ─────────────────────────────────┐
│                                                │
│ [画面描述]   双模板切换：短剧/影视/自由      │
│             [textarea]                        │
│                                                │
│ [生成模式]   ○ 首尾帧 (默认)  ○ 文生图        │
│                                                │
│ ── 仅"首尾帧"模式显示 ──                      │
│ [镜头]       景别/角度 (中文 select)          │
│ [运镜]       25 预设                          │
│ [摄像机]     焦距 / 光圈 / 相机风格 / 打光    │
│ [关键帧数]   2/3/5/8 visual button            │
│ [角色]       本分镜出场角色 chip + 表情/动作 │
│                                                │
│ [3D 摆位]    高级开关（默认折叠）              │
└────────────────────────────────────────────────┘

┌─ ▼ 时长 / 转场（影响 ⑥ 合成）─────────────────┐
│ [时长]       3.0s                              │
│ [转场]       类型 / 时长 / 方向 / 缓动 / 颜色 │
└────────────────────────────────────────────────┘

┌─ ▼ 旁白 / 对白 ID（自动从 AI 生成，可改）────┐
│ [旁白 ID]    narration_1                       │
│ [对白 IDs]   ☑ dlg_1  ☐ dlg_2  ...            │
└────────────────────────────────────────────────┘
```

**关键变化**：
- 上区只放**真正影响生成**的字段，按"画面描述 → 生成模式 → 镜头 → 角色"顺序，新手看一眼就明白
- 中区折叠"时长/转场"（影响合成不影响生成）
- 下区折叠 ID 字段（AI 自动填，用户极少手动改）
- 文生图模式下中段 5 个 panel **全隐藏**

### 5.3 ⑤ 制作重设计

**最简化 — 三 panel**：

```
┌─ 顶部信息（只读）─────────────────────────────┐
│ EP01_S01_SH02 · 近景·平视·静态 · 4s · 首尾帧 │
│ [显示生成链路] 开关（连线 overlay）           │
└────────────────────────────────────────────────┘

┌─ 关键帧（仅首尾帧模式）────────────────────────┐
│ [生成全部] [挑图] [展示链路]                  │
│                                                │
│ 时间轴 + 关键帧卡 ×N                          │
│   每张卡：缩略图 + 帧序号 + 时刻               │
│           [ⓘ 详情] (含完整 prompt + 参考图)   │
│           [↻ 重生成] (含调整方向)             │
└────────────────────────────────────────────────┘

┌─ 视频生成 ─────────────────────────────────────┐
│ Prompt: {frameDescription 全文}                │
│   ⓘ 视频提示词只来自此字段；要改请回 ④ 分镜  │
│                                                │
│ 调整方向: [textarea] (可选)                    │
│   ⓘ 仅影响关键帧重生成 / 视频不读             │
│   ⓘ 或改：让其也进 video prompt（未来增强）   │
│                                                │
│ [生成视频] [视频预览 ▶ ]                      │
└────────────────────────────────────────────────┘

┌─ 本分镜资产（折叠）──────────────────────────┐
│ 地点：京城茶馆 [挑图] (已挑/未挑标签)         │
│ 角色：李墨 [挑图]                              │
│   ⓘ 角色还会自动用「形象组」其他 4 张图       │
│       [→ 去 ② 资产管理形象组]                │
│ 物品：玉佩 [挑图]                              │
└────────────────────────────────────────────────┘
```

**变化**：
- **删除 KeyframeGrid 关键帧下的"🎯 挑图"**（per-frame 太细，移到 ⓘ 详情 dialog 给专业用户）
- **删除「最终提示词预览」**，改为只显示 frameDescription（video 真正用的字段）+ 明确标签
- **「调整方向」明确标注影响范围**
- **「本分镜资产」**改为**折叠区**，默认展开但可收；明示"角色还会用形象组追加"
- **「显示生成链路」开关**移到顶部信息行（更显眼），点开后显示连线（subject / multi-reference / 关键帧 → 视频）

### 5.4 配套改动 — 落实昨天 review 但还没做的

| # | 改动 | 来源 review |
|---|---|---|
| L1 | provider subject 路径接入（KlingO/MJ V7/Seedance）| Phase 3 / spec §C1 |
| L2 | 子画布连线 LineageOverlay 完善 + 默认开关挪显眼 | Phase 3 / libtv §11 |
| L3 | "AI 自动用了形象组"在 UI 显式提示 | spec ★ AI 自动透明 |
| L4 | keyframe prompt 总长度审视 — 现在 672 字符仍偏长，可继续缩 | asset-generation §2.2 |
| L5 | finalPromptPreview 改为"两个 prompt 预览"：keyframe / video 各一段 | 当前 Bug A 同源 |

### 5.5 ④ ↔ ⑤ 边界澄清

| 阶段 | 用户主要做什么 |
|---|---|
| ④ 分镜 | **填字段** — 决定每个分镜要生成什么；可调整 AI 拆出的字段 |
| ⑤ 制作 | **执行 + 微调** — 生成关键帧 / 视频；挑参考图覆盖；不再改字段（要改回 ④） |

⑤ 制作 顶部 readonly 信息行已经体现了这个设计意图（"如需修改请回 ④ 分镜界面"），但**字段太多**让"决定 vs 执行"边界模糊。重设计后：
- ④ 是"决定生成的输入"
- ⑤ 是"参考图覆盖 + 重生成微调"
- ⑥ 是"音频 + 转场 + 拼接"（AudioPanel 移过去）

---

## 6. 实施 Phase 划分

> 不立即执行，等用户对**整体方向**确认后开干。每 phase 工程量预估含测试。

### Phase A — Q3 镜头中文化 + 文生图隐藏（半天）

**风险极低，立即可做**：
- A1：⑤ 制作 顶部信息行 shotTypeLabel/cameraAngleLabel/cameraMovementLabel 函数确认走中文映射
- A2：④ 分镜 useKeyframes=false 时隐藏 8 个镜头语言字段 + 关键帧数 + 3D 摆位
- A3：(对应 ⑤) useKeyframes=false 时整段关键帧序列 panel 隐藏（已有 v-if）

**改动文件**：StageStoryboardViewV2.vue / StageProductionViewV2.vue

### Phase B — finalPromptPreview 改两段 + 调整方向位置（1 天）

- B1：⑤ 制作 finalPromptPreview 改为「视频 prompt」（仅 frameDescription）+ 「关键帧 prompt」（含完整字段）两段
- B2：UI 显式标注每段对应哪种生成 / 改动后用户能立即理解
- B3：「调整方向」上方加 ⓘ tooltip 说明"仅影响关键帧 / 不影响视频"
- B4：[可选] 让 userPrompt 也进 video prompt（增强 — 但需评估 video provider 接受度）

### Phase C — Q4 制作界面冗余清理（1.5 天）

- C1：删除 KeyframeGrid 关键帧下"🎯 挑图"按钮 + KeyframeReferencePicker 组件（保留 keyframe.referenceOverrides 字段，UI 入口移到 ⓘ 详情 dialog 内）
- C2：「本分镜引用资产」+ 提示词公式 hint 整合 — 公式删掉或改准确
- C3：AudioPanel 评估是否移到 ⑥ 合成 stage（影响范围大，单独评估）
- C4：关键帧卡内的角色 chip 极简化（只显示 emoji + 名字，避免重复）

### Phase D — Q1 形象组体验改善（1 天）

- D1：⑤ 制作 关键帧下「基于」区域改"分组显示"：「本分镜参考」+ 「角色形象组」
- D2：⑤ 制作 资产卡内角色项加 ⓘ「形象组：N 张追加」+ 跳到 ② 资产形象组管理的链接
- D3：② 资产 ReferenceSetPanel 顶部加一句"这些图作为该角色的稳定参考集，所有分镜共用"

### Phase E — Q6 ④ 分镜重设计（2-3 天）

- E1：StageStoryboardViewV2 重构成「决定生成 / 时长转场 / 旁白对白」三区
- E2：useKeyframes=false 模式下 5 个 panel 隐藏（已部分实现）
- E3：「转场」全组移到折叠区
- E4：「3D 摆位」移到高级折叠

### Phase F — 配套：subject 路径 / 子画布完善 / latent conditioning（4-6 天）

- F1：Phase 3 P3.1 provider subject 探测 — 让代码跑起来（不只是 capabilities 字段）
- F2：LineageOverlay 完善 + 默认开关挪显眼位置（顶部信息行）
- F3：keyframe prompt 总长度审视 — 进一步缩减到 400-500 字符（当前 672）
- F4：UI 显式提示 AI 自动行为（"已自动追加 4 张形象组图作为参考"）

---

## 7. 决策点 — 等用户确认

请用户决定以下分歧点：

| # | 决策点 | 选项 |
|---|---|---|
| Q-1 | 「最终提示词预览」处理 | (a) 删掉（仅显示 frameDescription）/ (b) 改两段（keyframe + video）/ (c) 保留现状 |
| Q-2 | 两个挑图入口处理 | (a) 删 per-frame 保 storyboard-level / (b) 都保留但 UI 区分清楚 / (c) 都删（让自动评分挑） |
| Q-3 | 「调整方向」 | (a) 移到 keyframe panel + 增强让其也进 video prompt / (b) 仅移位置不增强 / (c) 保持现状 |
| Q-4 | AudioPanel 位置 | (a) 移到 ⑥ 合成 / (b) 留 ⑤ 制作但加分隔 / (c) 不动 |
| Q-5 | Phase 实施顺序 | (a) A→B→C→D→E→F 顺序 / (b) 先做 E（重设计）再补回来 / (c) 只先做 A+B+C（最快见效）/ (d) 自定义 |

---

## 附录：与昨天 review 的对应关系

| 本文档章节 | 对应昨天 review |
|---|---|
| §1 数据流真相 | 之前没单独讨论，本文档补充 |
| §2 UI 要素 inventory | spec §1.4.4 / §1.4.5 扩展 |
| §3 已落地情况 | comprehensive-design Phase 1-4 / spec §3.2 落地审视 |
| §4 Q1 形象组 vs 挑图 | spec §3.2 D1 + 当前 collectReferenceImages 实现 |
| §5 ④/⑤ 重设计 | comprehensive-design P3.2（子画布）+ spec §2.2.1 ★ AI 透明 + asset-generation §6 P0 |
| §5.4 L1-L5 | 把 P3.1 subject 探测、P3.2 子画布、§AI 透明、prompt 长度问题汇总 |

---

**文档完。等用户对 §5（重设计方案）+ §7（决策点）确认后开干。**
