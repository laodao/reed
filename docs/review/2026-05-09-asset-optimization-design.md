# 资产域优化 · 详细设计文档（2026-05-09）

> 基于 [asset-prompt-assembly-review](./2026-05-09-asset-prompt-assembly-review.md) +
> [libtv-xiaoyunque-comparison](./2026-05-09-libtv-xiaoyunque-comparison.md) +
> [asset-generation-review](./2026-05-09-asset-generation-review.md) +
> [integrated-optimization-plan](./2026-05-09-integrated-optimization-plan.md) 整合落地。

## 0. 范围与回滚策略

### 本次改动覆盖

- **Phase 1**（本次必须做完）：技术路线纠偏 + 透明度面板 + 数据库备份
- **Phase 2**（紧随 Phase 1 后）：字段双层 UI + AI 正向字段提取

Phase 3-5 不在本设计范围（留独立 review/plan 文档）。

### 回滚策略

| 风险点 | 回滚方案 |
|---|---|
| **数据库** | 已用 pg_dump 备份到 `.backups/the_bot_test-20260509-182719.sql`（schema + data，6843 行）。回滚命令：`PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d the_bot_test -f .backups/the_bot_test-20260509-182719.sql`（先 drop 后 restore）|
| **代码** | 每个 Phase 独立 commit；Phase 内每个文件改动独立可见。回滚命令：`git revert <commit>` 或 `git reset --hard <prev>`（仅本地分支用 reset）|
| **schema 改动** | Phase 1 / 2 **完全无 schema 变更**；零迁移风险。Phase 2 的 AI 字段提取是新 IPC + UI，不动表结构 |
| **迁移可逆性** | 上次（asset_image variant 迁移）已经"不可逆"；本次完全不动数据，只是 UI 层 + prompt 装配文本逻辑 |
| **prompt 装配回归** | Phase 1 改装配是字符串拼接逻辑；可通过对比 commit 前后 `assetImage.prompt` 列字面差异验证；老数据图不重生即不变 |

### Phase 1/2 不动数据库的重要保证

本次设计**严格保证**只改前端 + prompt 装配字符串逻辑，**不动 schema、不动迁移、不动数据**。
所有需要的字段（`prompt / negativePrompt / metadata / referenceImagePath`）现有 entity 已经存在。

---

## 1. 当前实现现状（必读）

### 1.1 数据层

#### `asset_image` 表（统一图谱表）

```ts
{
  id, userId, assetType, assetId, category, label,
  prompt: string | null,            // ← Phase 1 透明度面板要用
  negativePrompt: string | null,    // ← 同上
  imagePath, thumbnailPath,
  isMain: 0 | 1, sortOrder, derivedFromImageId,
  metadata: string | null,          // ← 评分维度 angle/time/weather + 自由扩展
  width, height,
  createdAt, updatedAt
}
```

**关键事实**：
- `prompt / negativePrompt` **已落库**，但 UI 不展示
- 没有 `modelId / providerConfigId` 字段（要做"显示用了什么模型"需要 schema 改 → Phase 1 暂不做，先解决 prompt 透明度）
- 没有 `generationDurationMs` 字段（同上）

#### `character_bindings` 表

字段（已读 entity）：
```
姓名 standaloneName / overrideName
别名 alias
定位 role
性别 gender
年龄 age
人种 race
描述 standaloneDescription / overrideDescription / overrideAppearance
服装 overrideOutfit / outfitsExtra
风格 styleAnchors
音色 voiceId
形象 portraitId
参考图 referenceImagePath
```

#### `location_bindings` 表 / `item_bindings` 表

类似但更简单（location 多了 timeOfDay/weather/locationType/scale/moodTags 等；item 只有 name/description/styleAnchors）。

### 1.2 Effective 投影（资产业务读取）

三个 service 各自的 `getEffectiveData` 方法把 binding + linked_lw + override 双源投影成统一字段，作为 prompt 拼装的输入。

**`character` effective 输出包含**：
```
name, description, appearance, outfit, voiceId, portraitId,
source, alias, role, gender, age, race,
styleAnchors, outfitsExtra,
referenceImagePath
```

**`location` effective 输出包含**：
```
name, description, source,
styleAnchors, referenceImagePath
```

**`item` effective 输出包含**：
```
name, description, source, styleAnchors, referenceImagePath
```

### 1.3 Prompt 装配链路（修复后状态）

#### 主入口 `generateMainFor`（renderer · main-image-generator.ts）

```
buildPromptFromEffective(assetType, assetId)
  ↓
effective IPC → eff
  ↓
buildAssetIdentityPrompt(assetType, eff, storyBg)        ← 共享模块（Phase 1 改写目标）
  · name, description
  · character only: alias, role, gender, age, race, appearance, outfit, outfitsExtra
  · 三类共用: styleAnchors（中英双写）
  · storyBg: era, region, extra
  ↓
character → appendCharacterConstraints(prompt, 'fullBody')
            mergeCharacterNegative(undefined, 'fullBody')
  ↓
{ prompt, negativePrompt, referenceImagePath }
  ↓
ep:asset:image:generate-main IPC
  ↓
MainImageGeneratorService.generateMain(input)
  · location → appendLocationNoHumanConstraint
  · item → appendItemConstraints / mergeItemNegative
  ↓
imageGen.generate({ refPaths, prompt, negativePrompt })
```

#### 派生入口 `deriveSingle`（service · gallery-derivation.service.ts）

```
loadEffective(assetType, assetId) → eff
  ↓
prompt = additionalPrompt ?? `${category} · ${label}`
  ↓
prependIdentity(buildAssetIdentityPrompt(eff, storyBg), prompt)   ← Phase 1 改写
  ↓
character → appendCharacterConstraints + mergeCharacterNegative
            appendCharacterIdentityPreservation                  ← Phase 1 撤回
            mergeCharacterIdentityNegative                       ← Phase 1 撤回
  ↓
location 'variant' → appendVariantDimensionLock
                     mergeVariantDimensionLockNegative
location → appendLocationNoHumanConstraint
           mergeLocationNoHumanNegative
  ↓
item → appendItemConstraints / mergeItemNegative
       appendItemIdentityPreservation                            ← Phase 1 部分缩减
       mergeItemIdentityNegative                                 ← 同上
  ↓
imageGen.generate({ refPaths: [base.imagePath], prompt, negativePrompt })
```

### 1.4 UI 现状

#### 资产编辑器结构

```
EpisodeWorkbench.vue
└─ AssetStageView (= AssetStageViewV2.vue ✓ 已切到 V2)
   └─ CharacterAssetCardV2 / LocationAssetCardV2 / ItemAssetCardV2 （列表卡片）
      → 点击打开 → AssetEditDrawer
         ├─ CharacterAssetEditorV2 / LocationAssetEditorV2 / ItemAssetEditor (V1)
         │  ├─ 设定卡 (左侧)
         │  │  └─ CharacterCardFormV2 / LocationCardFormV2 / ItemCardForm (V1)
         │  └─ 图谱编辑器 (右侧)
         │     └─ CharacterGalleryEditor / LocationGalleryEditor / ItemGalleryEditor （V1，3 个都是）
```

> **V1/V2 现状**：Asset stage 主入口已切 V2（编辑器 V2 + 设定卡 V2）；但 **GalleryEditor 三个都是 V1**（旧文件位于 `stage-asset/character|location|item/`），新加的 AddMainImageDialog / DeriveVariantDialog / ReferenceImageField 也挂在 V1 GalleryEditor 上。本设计**不重写 GalleryEditor**，只在其上加透明度入口。

#### 设定卡字段平铺现状

CharacterCardFormV2 一字排开 6 节（① 身份 / ② 描述 / ③ 风格 / ④ 声音 / ⑤ 形象库 / ⑥ 参考图），无层级、无折叠、无重要度区分。

#### 生成详情可见度

| 信息 | 当前可见 |
|---|---|
| 完整 prompt | ❌ |
| negativePrompt | ❌ |
| 用了什么模型 | ❌（数据本身没存） |
| 用了哪张参考图 | ❌（数据本身存了 derivedFromImageId） |
| 生成耗时 | ❌（数据本身没存） |
| 生成时间 | ✓（asset_image.createdAt） |

---

## 2. 优化方案

### 2.1 设计原则

1. **文本 prompt 聚焦"画什么"** — 视觉内容；身份一致性靠 reference image / latent conditioning
2. **metadata 与 prompt 解耦** — 叙事 metadata（姓名/别名/定位/声音）不进 image prompt
3. **透明度优先** — 已落库的数据全部对用户可见
4. **字段双层** — 生成核心字段（visual-relevant）置顶；叙事 metadata 折叠
5. **零 schema 变更** — Phase 1/2 不动数据库
6. **每改可回滚** — 单 commit 粒度可独立 revert

### 2.2 新逻辑流程

#### 主图 `generateMain` 流程（修改后）

```
buildPromptFromEffective(assetType, assetId)
  ↓
effective IPC → eff
  ↓
buildVisualPrompt(assetType, eff, storyBg)               ← 改名 + 改写
  · 仅送 visual-relevant 字段：
    description, appearance, outfit, gender, age, race
    styleAnchors, storyBg
  · 不送：name, alias, role, voiceId, portraitId
  ↓
character → appendCharacterConstraints
            mergeCharacterNegative
  ↓
{ prompt, negativePrompt, referenceImagePath }
```

> **关键差异**：`name` 不再进 prompt（用户能识别就行，AI 不需要"叫什么名字"才能画出脸）；`alias` / `role` 完全删除。

#### 派生 `deriveSingle` 流程（修改后）

```
load effective → eff
  ↓
prompt = prependIdentity(buildVisualPrompt(eff, storyBg), additionalPrompt ?? "${cat} · ${label}")
  ↓
character → appendCharacterConstraints
            mergeCharacterNegative
            appendCharacterIdentityPreservationLite        ← 精简版，2 行内
            mergeCharacterIdentityNegativeLite             ← 同上
  ↓
location 'variant' → appendVariantDimensionLock（保留，跟一致性正交）
location → appendLocationNoHumanConstraint
  ↓
item → appendItemConstraints
       mergeItemNegative
       appendItemIdentityPreservationLite                  ← 精简版
       mergeItemIdentityNegativeLite                       ← 同上
```

> **关键差异**：身份保持文本约束从 7 个锚点（30+ 词）缩到 1-2 句话（5-10 词），信任 reference image 主导一致性。

#### 透明度面板触发流程（新增）

```
GalleryEditor 缩略图
  ↓ 用户右键 / hover 工具栏 + "ⓘ 详情"
  ↓
GenerationDetailDialog 弹出
  · 缩略图大图
  · 生成参数：
    - 完整 prompt（可一键复制）
    - 完整 negativePrompt（可一键复制）
    - 派生自：基图 label + 缩略图（如有 derivedFromImageId）
    - 参考图：referenceImagePath（如有）
    - 类别 / label / metadata（angle/time/weather/...）
    - 生成时间 createdAt
  · 一键复制 prompt（让用户复制到外部 provider 测）
```

### 2.3 设定卡字段双层 UI

#### CharacterCardFormV2 新结构

```
┌─ 📋 设定卡 ────────────────────────────────────────┐
│                                                     │
│  ⭐ 生成核心 ─────────────────────────────────       │
│   人物描述（textarea，rows=6） ← 最显眼              │
│   风格（多选）                                        │
│   性别 / 年龄 / 人种                                  │
│   参考图（上传）                                      │
│                                                     │
│  ▼ 叙事元数据（默认折叠）                             │
│   姓名 · 别名 · 定位 · 声音 · 形象库                   │
│   提示："这些字段用于剧本调度 / 配音，不进图像生成"    │
│                                                     │
│  ✨ AI 自动填字段（按钮，挂在生成核心区右上角）         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

LocationCardFormV2 / ItemCardForm 类似改造。

#### AI 自动填字段交互

```
用户在"人物描述"自由文本里写：
"二十多岁年轻男子，剑眉星目，束发，腰间佩剑，国风工笔风格"
  ↓ 点 ✨ AI 自动填
LLM 抽取：
  · gender: 男
  · age: 25
  · race: 东亚（推测）
  · styleAnchors: ['国风工笔']
  ↓
表单字段自动填好；用户可任意改写
```

### 2.4 透明度面板 UI

```
┌─ 生成详情 ───────────────────────────────── ✕ ─┐
│                                                  │
│  [大缩略图]                                      │
│                                                  │
│  ─── 生成参数 ───                                │
│  类别：variant · label：雨夜外观                  │
│  生成时间：2026-05-09 14:32:18                   │
│                                                  │
│  ─── Prompt ───  [📋 复制]                       │
│  ┌────────────────────────────────────────┐    │
│  │ 太白楼，临江三层木构酒楼，雕梁画栋，    │    │
│  │ 风格：国风工笔（Chinese gongbi ...），  │    │
│  │ 故事年代：唐代，故事地域：江南，       │    │
│  │ 雨水打在屋檐 / 暖光 lantern，          │    │
│  │ 机位与构图保持一致（same camera ...） │    │
│  │ 场景中不能有任何人物（no people, ...）│    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  ─── Negative Prompt ───  [📋 复制]              │
│  ┌────────────────────────────────────────┐    │
│  │ different camera angle, angle change,   │    │
│  │ different composition, ...              │    │
│  │ person, people, human, character, ...   │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  ─── 参考图 ───                                  │
│  派生自：[缩略图] 正面外景                        │
│  参考图（user upload）：[缩略图]（如有）           │
│                                                  │
│  ─── Metadata ───                                │
│  angle: entrance  time: night  weather: rainy   │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 3. 文件级修改清单

### Phase 1 修改（必须做完）

| # | 文件 | 类型 | 改动 | 工程量 |
|---|---|---|---|---|
| 1 | `src/core/modules/episode-production/assets/prompts/character-constraints.ts` | 修改 | `IDENTITY_PRESERVATION_SUFFIX` 从 6 锚点缩到 2 行；`IDENTITY_PRESERVATION_NEGATIVE` 从 20+ 词缩到 8 词以内；保留函数名不变（避免调用点全改）| 15 分钟 |
| 2 | `src/core/modules/episode-production/assets/prompts/item-constraints.ts` | 修改 | `ITEM_IDENTITY_PRESERVATION_SUFFIX` / `ITEM_IDENTITY_PRESERVATION_NEGATIVE` 同样缩减 | 10 分钟 |
| 3 | `src/core/modules/episode-production/assets/prompts/asset-identity-prompt.ts` | 修改 | character 分支：删除 `alias` / `role` 拼接（注释保留说明）；保留 description / appearance / outfit / gender / age / race / outfitsExtra / styleAnchors / storyBg；name 是否保留待评估（先保留，因为 AI 看到名字辅助识别角色） | 20 分钟 |
| 4 | `src/renderer/src/components/episode-production/stage-asset/shared/GenerationDetailDialog.vue` | **新建** | 透明度面板 dialog；接受 AssetImageEntity；展示 prompt / negativePrompt / 派生关系 / metadata / 时间；支持复制 | 2 小时 |
| 5 | `src/renderer/src/components/episode-production/stage-asset/character/CharacterGalleryEditor.vue` | 修改 | 主图 / 派生图缩略图工具栏加 ⓘ 按钮；点击打开 GenerationDetailDialog | 30 分钟 |
| 6 | `src/renderer/src/components/episode-production/stage-asset/location/LocationGalleryEditor.vue` | 修改 | 同上 | 30 分钟 |
| 7 | `src/renderer/src/components/episode-production/stage-asset/item/ItemGalleryEditor.vue` | 修改 | 同上 | 30 分钟 |

**Phase 1 commit 划分**：建议 3 个 commit
- C1: 缩减 character / item 身份保持约束（① + ②）
- C2: metadata 解耦（③）
- C3: 透明度面板（④ + ⑤ + ⑥ + ⑦）

每个 commit 独立可 revert。

### Phase 2 修改（紧随 Phase 1）

| # | 文件 | 类型 | 改动 | 工程量 |
|---|---|---|---|---|
| 8 | `src/renderer/src/components/episode-production/stage-asset-v2/character/CharacterCardFormV2.vue` | 修改 | 节重组：① 生成核心（人物描述 / 风格 / 性别 / 年龄 / 人种 / 参考图）置顶；② 叙事 metadata（姓名 / 别名 / 定位 / 声音 / 形象库）放 el-collapse 折叠区；加"AI 自动填"按钮 | 1.5 小时 |
| 9 | `src/renderer/src/components/episode-production/stage-asset-v2/location/LocationCardFormV2.vue` | 修改 | 类似但简单（location 字段较少）：核心区 = 描述 / 视觉特征 / 风格 / 参考图 / 默认时间 / 默认天气；折叠区 = 名称 / 类型 / 规模 / 氛围 tags / 360 全景说明 | 1 小时 |
| 10 | `src/renderer/src/components/episode-production/stage-asset/item/ItemCardForm.vue` | 修改 | 字段已经少，仅加"AI 自动填"按钮即可，不强求双层折叠 | 30 分钟 |
| 11 | `src/core/modules/episode-production/assets/services/asset-setting-enrichment.service.ts`（新建或修改）| **新增方法** | `extractFieldsFromDescription(assetType, description) → { name?, gender?, age?, race?, styleAnchors? }`；用 `callAI` LLM 调用，prompt 让 LLM 输出 JSON；character / location / item 各自字段集 | 2 小时 |
| 12 | `src/electron/ipc/handlers/episode-production/asset/asset-setting-enrichment.handler.ts` | **新增 channel** | `ep:asset:extract-fields`：handler 包装 service 调用 | 30 分钟 |
| 13 | `src/preload/index.ts` | 修改 | 暴露 `episodeProduction.asset.extractFields(assetType, description)` API + IPC_CHANNELS 常量 | 15 分钟 |
| 14 | `src/web/client/channel-map.ts` | 修改 | 加 channel 映射 `episodeProduction.asset.extractFields` | 5 分钟 |

**Phase 2 commit 划分**：建议 2 个 commit
- C4: 设定卡字段双层 UI（⑧ + ⑨ + ⑩）
- C5: AI 字段提取（⑪ + ⑫ + ⑬ + ⑭）

### 不动的文件（重要！）

- 任何 `.entity.ts`（无 schema 改动）
- 任何 `migrations/*.ts`（无新迁移）
- `gallery-derivation.service.ts` 的 `deriveSingle` 主流程（仅依赖的 character-constraints / item-constraints 函数缩减，函数签名不变）
- `main-image-generator.service.ts` 的 `generateMain` / `addAdditionalMain` 主流程（同上）
- `reference-image-selector.ts`（一致性评分逻辑不动）
- `storyboard.entity.ts` / `storyboard.repository.ts`（不动）

---

## 4. 具体代码改动样例

### 4.1 `character-constraints.ts` 缩减身份保持约束

**改前**（commit `c0a76fea` 加的版本）：

```ts
const IDENTITY_PRESERVATION_SUFFIX = [
  '严格保持人物身份特征（preserve character identity, same face, same facial features）',
  '同一脸型与五官（same face shape, same eyes, same nose, same mouth, same jawline）',
  '同一肤色（same skin tone, identical complexion）',
  '同一发色与发型轮廓（same hair color, same hairline, same hair structure）',
  '同一体型与身高（same body type, same build, same height）',
  '保持整体气质与年龄感（preserve overall demeanor and apparent age）',
].join('，')
```

**改后**：

```ts
/**
 * spec 2026-05-09 review 修正：信任 reference image 主导一致性，文本 anchor 极简
 * 旧版 6 锚点 30+ 词在 2026 SOTA 模型上是过度工程，反而稀释 prompt
 */
const IDENTITY_PRESERVATION_SUFFIX =
  '保持人物身份特征（preserve character identity, same face）'
```

**negative 同样缩减**：

```ts
const IDENTITY_PRESERVATION_NEGATIVE = [
  'different face',
  'face change',
  'different person',
].join(', ')
```

### 4.2 `asset-identity-prompt.ts` 删除 alias / role

```ts
if (assetType === 'character') {
  // [删除] alias / role 不进生成 prompt（叙事 metadata，不影响视觉）
  // if (eff.alias) parts.push(`别名：${...}`)
  // if (eff.role) parts.push(`定位：${...}`)
  if (eff.gender) parts.push(`性别：${...}`)
  if (eff.age != null) parts.push(`年龄：${eff.age}`)
  // ... 其余保留
}
```

### 4.3 `GenerationDetailDialog.vue` 骨架

```vue
<template>
  <el-dialog v-model="visible" title="生成详情" width="720px">
    <div class="img-section">
      <img :src="toImageUrl(image.thumbnailPath || image.imagePath)" />
    </div>
    <div class="meta-section">
      类别：{{ image.category }} · label：{{ image.label || '—' }}
      <br/>生成时间：{{ formatTime(image.createdAt) }}
    </div>
    <div class="prompt-section">
      <div class="header">Prompt <button @click="copy(image.prompt)">📋 复制</button></div>
      <pre class="prompt-text">{{ image.prompt || '（无）' }}</pre>
    </div>
    <div class="negative-section">
      <div class="header">Negative Prompt <button @click="copy(image.negativePrompt)">📋 复制</button></div>
      <pre class="prompt-text">{{ image.negativePrompt || '（无）' }}</pre>
    </div>
    <div v-if="derivedFrom" class="derived-section">
      派生自：{{ derivedFrom.label || '默认主图' }}
      <img :src="toImageUrl(derivedFrom.thumbnailPath || derivedFrom.imagePath)" class="thumb" />
    </div>
    <div v-if="parsedMetadata" class="metadata-section">
      Metadata：
      <span v-for="(v, k) in parsedMetadata" :key="k">{{ k }}: {{ v }}</span>
    </div>
  </el-dialog>
</template>
```

### 4.4 GalleryEditor 集成 ⓘ 按钮

在每个缩略图的 hover 工具栏加：

```vue
<el-tooltip content="生成详情" placement="top">
  <el-icon class="thumb-tool-icon" :size="14" @click="onShowDetails(img)">
    <InfoFilled />
  </el-icon>
</el-tooltip>
```

```ts
const detailDialog = ref({ open: false, image: null })
function onShowDetails(img: AssetImageRow) {
  detailDialog.value.image = img
  detailDialog.value.open = true
}
```

---

## 5. 执行顺序与验证

### 步骤

1. ✅ DB backup 已完成（`.backups/the_bot_test-20260509-182719.sql`）
2. 写本设计文档（即此文件） → commit
3. **C1**：缩减 character / item 身份保持约束 → commit
4. **C2**：metadata 解耦 → commit
5. **C3**：透明度面板（新建 dialog + 三处 GalleryEditor 集成）→ commit
6. 验证：在浏览器测一个 character 主图重生 + 一次派生，看 prompt 字符数变化和透明度面板显示
7. **C4**：设定卡双层 UI → commit
8. **C5**：AI 字段提取 → commit
9. 全量类型检查 + 重启 4201 + 端到端测试

### 验证 checklist

| 验证项 | 期望 |
|---|---|
| Phase 1 后 character 派生 prompt 字符数 | < 修改前的 60% |
| Phase 1 后透明度面板能展示 prompt / negative | ✓ |
| Phase 1 后 character 派生质量 | 不应劣化（prompt 短了但 ref image 主导）|
| Phase 2 后 character 设定卡核心字段优先显示 | ✓ |
| Phase 2 后 AI 字段提取按钮可用 | ✓ |
| 类型检查 vue-tsc 无新错误 | ✓ |
| 已存在的 asset_image 行 `prompt` 字段未被破坏 | ✓（不动 schema、不重生）|

### 回滚演练

万一改崩，回滚步骤：

```bash
# 代码回滚
git -C /home/ubuntu/workdir/the-bot reset --hard <last-good-commit>

# 数据库回滚（如真有数据破坏）
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "DROP DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d the_bot_test -f .backups/the_bot_test-20260509-182719.sql

# 重启 web server
pkill -f 'tsx.*src/web/server'
PGDATABASE=the_bot_test PORT=4201 npx tsx watch -r tsconfig-paths/register src/web/server/index.ts
```

---

## 6. 不在本次范围（Phase 3+）

- provider 能力探测 + 走原生 subject 路径（KlingO/Midjourney Omni）
- 9 帧故事板草稿模式
- 双模板单镜画面描述（短剧 5 段 / 影视 shot-level）
- 摄像机参数化 / 运镜 20+ 命名预设 / 打光命名预设
- LoRA fine-tuning
- 跨项目角色库
- 局部可视化连线
- 数字人池
- Agent / Skill 接入
- 视频解析

这些项的设计由 [integrated-optimization-plan](./2026-05-09-integrated-optimization-plan.md) 的 Phase 3-5 各自独立 review 文档承载，与本次 Phase 1/2 不耦合。

---

## 7. 元保证

- **可读性**：每个 phase 内每个 commit 独立可 revert，单次改动 ≤ 4 文件
- **可验证**：每步骤有明确 expected behavior + 数据库 / 文件级回滚路径
- **零数据风险**：本次 Phase 1/2 不动 schema、不动迁移、不动数据
- **零兼容风险**：现有图谱图全部保留，仅装配逻辑改变；老图重生才会变 prompt
