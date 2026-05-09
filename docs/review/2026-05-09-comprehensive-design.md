# 资产域 + 分镜域 + 工作流域 · 全面优化设计文档（执行级 · Phase 1-5）

> 版本：2026-05-09 v2（实施级粒度，可直接指导编码）
> 上一版（v1 高层路线图）由本版替代
> 来源 review：[asset-prompt-assembly](./2026-05-09-asset-prompt-assembly-review.md) · [libtv-xiaoyunque-comparison](./2026-05-09-libtv-xiaoyunque-comparison.md) · [asset-generation](./2026-05-09-asset-generation-review.md) · [integrated-optimization-plan](./2026-05-09-integrated-optimization-plan.md)

---

## 0. 前言 / 范围 / 防崩 / 回滚

### 0.1 用户三个核心目标

1. **高质量输出**（指令遵循 + 前后一致性）
2. **简单易用**（兼顾大众短剧用户 + 专业导演 / 编剧）
3. **逻辑过程清晰**（透明度，用户能 self-debug）

### 0.2 范围（22 项 / 4 域 / 5 phase）

| Phase | 内容 | 工程量 | 风险 |
|---|---|---|---|
| 1 | 资产 prompt 重构 + 透明度 | 4 小时 | 极低 |
| 2 | 字段双层 + 镜头语言层 + 9 帧故事板 | 5-7 天 | 中 |
| 3 | provider subject + 局部子画布 + AI 一键通道 | 6-9 天 | 中 |
| 4 | LoRA + 跨项目库 + 数字人池 + Agent + 视频解析 | 2-3 周 | 高 |
| 5 | 视频提取主体 | 1 周 | 高 |

### 0.3 数据库备份

✅ 已备份：`.backups/the_bot_test-20260509-182719.sql`（schema+data，877KB，79 张表，已 strip pg18 `\restrict` 兼容 PG16）

**回滚命令**：

```bash
pkill -f 'tsx.*src/web/server' || true
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "DROP DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE the_bot_test"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d the_bot_test -f .backups/the_bot_test-20260509-182719.sql
PGDATABASE=the_bot_test PORT=4201 npx tsx watch -r tsconfig-paths/register src/web/server/index.ts
```

**Phase 4+ 改 schema 前必须重新备份**（脚本 `scripts/backup-db.sh` 待加）。

### 0.4 防崩约束

- **单 commit ≤ 4 文件**
- 每 commit 跑 `npx vue-tsc --noEmit`（无新错误）
- Phase 间留 1-2 天观察期
- prompt 装配类改动 commit 前先 dry-run 对比字面 diff
- DB 改动只在 Phase 4+ 出现，每改一次重备份

### 0.5 改动级回滚矩阵

| Phase | schema 变化 | 数据迁移 | 回滚方式 |
|---|---|---|---|
| 1 | ❌ | ❌ | `git revert <commit>` |
| 2 | ❌ | ❌ | `git revert <commit>` |
| 3 | ❌ | ❌ | `git revert <commit>` |
| 4 | ✓ 加 `lora_models` / `user_assets` 等表 | 可能 seed | `git revert + DROP TABLE + 还原备份`|
| 5 | ✓ 可能加视频元数据列 | 可能 | 同上 |

---

## 1. 当前实现全景（必读）

### 1.1 资产域

**核心表**：

```
asset_image (统一图谱)
├ id : varchar (ai_<16hex>)
├ user_id, asset_type ('character'|'location'|'item'), asset_id
├ category : 'main' | 'view' | 'expression' | 'outfit' | 'pose' | 'variant' |
│            'time_variant'(legacy) | 'weather_variant'(legacy) | 'angle_variant'(legacy) |
│            'context' | 'panorama_360' | 'panorama_snapshot'
├ label : text (用户自由)
├ prompt : text                ← Phase 1 透明面板用
├ negative_prompt : text       ← Phase 1 透明面板用
├ image_path, thumbnail_path
├ is_main : 0|1, sort_order
├ derived_from_image_id        ← Phase 1 透明面板用
├ metadata : JSON
├ width, height, created_at, updated_at
```

```
character_bindings:
  id, user_id, project_id, source_type
  standalone_name / override_name, alias, role
  gender, age, race
  standalone_description / override_description / override_appearance
  override_outfit, outfits_extra
  style_anchors (JSON)
  voice_id, voice_speed, voice_pitch, voice_emotion
  portrait_id
  reference_image_path           ← spec 2026-05-09
```

`location_bindings` / `item_bindings` 字段更少。

**Effective 投影服务**：

| 资产 | service | 方法 | 主要输出 |
|---|---|---|---|
| character | `CharacterAssetService` | `getEffectiveData(bindingId)` | name/description/appearance/outfit/voiceId/portraitId/source/alias/role/gender/age/race/styleAnchors/outfitsExtra/referenceImagePath |
| location | `LocationAssetService` | `getEffectiveData(bindingId)` | name/description/source/styleAnchors/referenceImagePath |
| item | `ItemAssetService` | `getEffectiveData(bindingId)` | name/description/source/styleAnchors/referenceImagePath |

**Prompt 装配关键模块**：

| 模块 | 职责 | 路径 |
|---|---|---|
| `asset-identity-prompt.ts` | effective → identity 文本 | `src/core/modules/episode-production/assets/prompts/asset-identity-prompt.ts` |
| `character-constraints.ts` | 角色硬约束 + 身份保持 | 同目录 |
| `location-constraints.ts` | 地点无人 + 变体维度锁 | 同目录 |
| `item-constraints.ts` | 物品居中 + 身份保持 | 同目录 |
| `style-presets.ts` | 风格中英双写 | `assets/constants/` |
| `MainImageGeneratorService` | 主图生成入口 | `assets/services/` |
| `GalleryDerivationService` | 派生入口 | `assets/services/` |
| `generateMainFor` (renderer) | 主图前端入口 | `renderer/src/api/main-image-generator.ts` |

**UI 路由**：

```
EpisodeWorkbench.vue
└─ stage-asset-v2/AssetStageViewV2.vue (主入口已切 V2)
   ├─ CharacterAssetCardV2 / LocationAssetCardV2 / ItemAssetCardV2 (列表)
   └─ → AssetEditDrawer
      ├─ stage-asset-v2/character/CharacterAssetEditorV2.vue (V2)
      │  ├─ stage-asset-v2/character/CharacterCardFormV2.vue (设定卡 V2)
      │  └─ stage-asset/character/CharacterGalleryEditor.vue (图谱 V1) ⚠
      ├─ stage-asset-v2/location/LocationAssetEditorV2.vue
      │  ├─ stage-asset-v2/location/LocationCardFormV2.vue
      │  └─ stage-asset/location/LocationGalleryEditor.vue (V1)
      └─ stage-asset/item/ItemAssetEditor.vue (V1)
         ├─ stage-asset/item/ItemCardForm.vue (V1)
         └─ stage-asset/item/ItemGalleryEditor.vue (V1)
```

> ⚠ **关键事实**：所有图谱编辑器都还是 V1；新加的 `AddMainImageDialog` / `DeriveVariantDialog` / `ReferenceImageField` 挂在 V1 GalleryEditor 上。本设计**不重写 GalleryEditor**，只在其上加新功能。

### 1.2 分镜域

**核心表**：`storyboards`

```
id, scene_script_id, shot_number
shot_type: 'long'|'full'|'medium'|'medium_close'|'close'|'extreme_close'
camera_angle: 'eye_level'|'high'|'low'|'birds_eye'|'worms_eye'|'dutch'
camera_movement: 'static'|'push'|'pull'|'pan'|'track'|'crane'
movement_duration (s)
frame_description (text)
subject, composition
characters (JSON [{characterId,position,expression,action,facing}])
narration_id, dialogue_ids (JSON), action_ids (JSON)
duration (real)
transition_type, transition_duration_ms, transition_direction, transition_easing, transition_color
status, keyframe_count, use_keyframes, include_in_final
video_provider_id, video_model_id, video_mode
use_3d_staging, staging_layout_id
background_ref_image_id, reference_image_ids
location_binding_ids, item_binding_ids
metadata (JSON, 部分场景已用)
```

**UI**：`StageStoryboardViewV2.vue` 镜头工具栏 lines 281-340，转场工具栏 lines 343+，画面描述 textarea line 422（**空白无引导**）。

### 1.3 制作 / 关键帧域

**核心表**：`storyboard_keyframe`（含 referenceOverrides；链式生成 planKeyframes start→end→middle）。

**UI**：`StageProductionViewV2.vue` 已分镜中心化（资产卡 / 关键帧序列 / 视频片段 / 视频预览 / 资产引用），**子画布雏形已在**，缺连线可视化。

**Provider 能力**：`VideoProviderCapabilities`（`video-provider-adapter.ts`）现有 `text/image/keyframes/maxKeyframes/maxDurationSec`；缺 `subjectSupport / maxSubjects`（Phase 3 加）。

---

## 2. 设计原则

### 2.1 双母语 UI

每能力对**专业用户**与**大众短剧用户**两类用户都问"母语价值"和"认知负担"。两边都通过的才做；只通过一边的做"分层 UI"（同一功能两种叫法 / tooltip）。

### 2.2 文本 prompt 与 latent conditioning 分工

- **文本 prompt 聚焦"画什么"**（视觉内容）
- **一致性靠 latent conditioning**（reference image / subject embedding / LoRA / IP-Adapter）
- **metadata 只用于叙事调度**，不进 image prompt

### 2.3 透明度优先

- 后端落库的数据全部对用户可见
- 失败时具体错误展示
- 用户能 self-debug

### 2.4 字段是工具不是终点

字段按"图像生成 / 叙事调度 / 数据库识别 / 配音"分维度，同一字段不跨维度复用。

---

# Phase 1 · 资产 prompt 重构 + 透明度面板（4 小时 · 3 commits）

## P1.1 撤回 character / item 派生过度文本约束

### 问题陈述

`commit c0a76fea` 引入的 character / item 派生身份保持文本约束：30+ 词中英双写。在 2026 SOTA 模型上是过度工程：
- 模型已原生支持多模态参考 + subject embedding
- 长文本约束反而稀释 prompt
- 与"reference image 物理主导一致性"路径冲突

### 当前代码位置

| 文件 | 行 | 内容 |
|---|---|---|
| `src/core/modules/episode-production/assets/prompts/character-constraints.ts` | 138-156 | `IDENTITY_PRESERVATION_SUFFIX` 6 锚点 + `IDENTITY_PRESERVATION_NEGATIVE` 20+ 词 |
| 同上 | 169-185 | `appendCharacterIdentityPreservation` / `mergeCharacterIdentityNegative` 函数（保留签名） |
| `src/core/modules/episode-production/assets/prompts/item-constraints.ts` | 60-95 | `ITEM_IDENTITY_PRESERVATION_SUFFIX` 5 锚点 + 12 词 NEGATIVE |

### 目标实现

**character-constraints.ts**：

```ts
// 改前
const IDENTITY_PRESERVATION_SUFFIX = [
  '严格保持人物身份特征（preserve character identity, same face, same facial features）',
  '同一脸型与五官（same face shape, same eyes, same nose, same mouth, same jawline）',
  '同一肤色（same skin tone, identical complexion）',
  '同一发色与发型轮廓（same hair color, same hairline, same hair structure）',
  '同一体型与身高（same body type, same build, same height）',
  '保持整体气质与年龄感（preserve overall demeanor and apparent age）',
].join('，')

// 改后（让 reference image 物理主导）
const IDENTITY_PRESERVATION_SUFFIX =
  '保持人物身份特征（preserve character identity, same face）'

const IDENTITY_PRESERVATION_NEGATIVE = [
  'different face',
  'face change',
  'different person',
].join(', ')
```

**item-constraints.ts** 类比缩减。

### 影响 / 风险

- 行为：派生 prompt 短约 200-400 字符；主图不受影响（主图本来不加）
- 风险：极低；函数签名不变
- 验证：跑同一派生（view/3q_left）对比 prompt 字符数 + 视觉质量

### 文件修改清单

| # | 文件 | 行 | 类型 | 工程量 |
|---|---|---|---|---|
| 1 | `character-constraints.ts` | 138-156 | 修改 const | 10 min |
| 2 | `item-constraints.ts` | 60-83 | 同上 | 10 min |

### Commit C1

```
refactor(ep): 缩减 character/item 派生身份保持文本约束（spec 2026-05-09 review）

2024 SD1.5 时代的 prompt-anchoring 在 2026 SOTA 模型上是过度工程。
缩减后让 reference image 物理主导一致性，prompt 不再被冗长 anchor 稀释。

- IDENTITY_PRESERVATION_SUFFIX: 6 锚点 30+ 词 → 1 锚点 5-8 词
- IDENTITY_PRESERVATION_NEGATIVE: 20+ 词 → 3-5 词
- 函数签名不变，调用点零改动
```

---

## P1.2 metadata 与生成 prompt 解耦

### 问题陈述

`asset-identity-prompt.ts` 把姓名 / 别名 / 定位 / 性别 / 年龄 / 人种 / 外貌 / 服装 / 风格 / 故事背景全拼进 prompt：

- **别名**："三爷 / 浪剑客"等文字对图像生成 0 影响 — **noise**
- **定位**："主角 / 配角 / 反派"是叙事概念非视觉概念 — **noise**

两者稀释 AI 注意力。

### 当前代码位置

`src/core/modules/episode-production/assets/prompts/asset-identity-prompt.ts` 122-134（character 分支拼接 alias/role/gender/age/race/appearance/outfit/outfitsExtra）。

### 目标实现

```ts
// asset-identity-prompt.ts L122-134 改后
if (assetType === 'character') {
  // [删除] alias / role 不进 prompt：
  //   - 别名（"三爷"）对图像生成无影响，是 noise
  //   - 定位（"主角"）是叙事概念非视觉概念
  // 两者保留在 EffectiveAssetForPrompt 类型（兼容）但不进 prompt。

  if (eff.gender) parts.push(`性别：${String(eff.gender).trim()}`)
  if (eff.age != null) parts.push(`年龄：${eff.age}`)
  if (eff.race) {
    const raceText = describeCharacterRace(String(eff.race))
    if (raceText) parts.push(`人种：${raceText}`)
  }
  if (eff.appearance) parts.push(`外貌：${String(eff.appearance).trim()}`)
  if (eff.outfit) parts.push(`服装：${String(eff.outfit).trim()}`)
  if (Array.isArray(eff.outfitsExtra) && eff.outfitsExtra.length > 0) {
    parts.push(`备选服装：${eff.outfitsExtra.join(' / ')}`)
  }
}
```

`name` 保留（中英语料中常作人物特征引子）。

### 验证

```ts
// 临时 dry-run
const eff = {
  name: '李白', alias: '青莲居士', role: '主角',
  gender: '男', age: 25, race: 'east_asian',
  appearance: '剑眉星目', outfit: '青衣长袍',
  styleAnchors: ['国风工笔'],
}
// 期望：after.length < before.length（少了"别名"和"定位"两段）
```

### 文件修改清单

| # | 文件 | 行 | 类型 | 工程量 |
|---|---|---|---|---|
| 3 | `asset-identity-prompt.ts` | 122-134 | 删 alias/role 拼接 | 15 min |

### Commit C2

```
refactor(ep): metadata 字段（alias/role）不进 image prompt（spec 2026-05-09 review）

姓名 / 别名 / 定位是叙事 metadata，不是视觉 anchor。
- 别名"三爷"对图像生成无影响（noise）
- 定位"主角"是叙事概念非视觉概念
保留在 EffectiveAssetForPrompt 类型中（调用方仍可读），但不再拼进 prompt。
character 主图 / 派生 prompt 字符数减少约 30-80，AI 注意力聚焦视觉描述。
```

---

## P1.3 透明度面板（GenerationDetailDialog）

### 问题陈述

用户点缩略图只能看图，看不到 prompt / negativePrompt / 派生关系 / metadata（**数据已落 asset_image 表**）。

### 数据来源

`asset_image` 表的字段全部已有；`api.image.listByAsset(assetType, assetId)` 已返回完整实体。**无需新 IPC**。

### 目标流程

```
GalleryEditor 缩略图 hover：
  现有：⬇ 下载 / ✕ 删除
  新增：ⓘ 详情
       ↓ 点击
GenerationDetailDialog
  ┌ 大缩略图（fit）
  ├ 基本信息（类别 / label / 时间 / 尺寸 / is_main）
  ├ Prompt + 复制按钮
  ├ Negative Prompt + 复制按钮
  ├ 派生自（如有 derivedFromImageId）
  └ Metadata（解析 JSON 显示 tags）
```

### 组件代码

**新建** `src/renderer/src/components/episode-production/stage-asset/shared/GenerationDetailDialog.vue`：

```vue
<template>
  <el-dialog v-model="visible" title="生成详情" width="720px" destroy-on-close append-to-body>
    <div v-if="image" class="detail-body">
      <div class="big-thumb">
        <img :src="toImageUrl(image.thumbnailPath || image.imagePath)" />
      </div>

      <section class="info-block">
        <h4>基本信息</h4>
        <div class="info-row"><span>类别</span><code>{{ image.category }}</code></div>
        <div class="info-row"><span>label</span><span>{{ image.label || '—' }}</span></div>
        <div class="info-row"><span>生成时间</span><span>{{ formatTime(image.createdAt) }}</span></div>
        <div v-if="image.width" class="info-row"><span>尺寸</span><span>{{ image.width }}×{{ image.height }}</span></div>
        <div class="info-row">
          <span>is_main</span>
          <el-tag v-if="image.isMain === 1" type="warning" size="small">默认主图</el-tag>
          <span v-else>否</span>
        </div>
      </section>

      <section class="prompt-block">
        <header>
          <h4>Prompt（{{ image.prompt?.length || 0 }} 字符）</h4>
          <el-button size="small" text @click="copy(image.prompt, 'Prompt')">📋 复制</el-button>
        </header>
        <pre class="prompt-text">{{ image.prompt || '（无 / 旧数据未落库）' }}</pre>
      </section>

      <section class="prompt-block">
        <header>
          <h4>Negative Prompt（{{ image.negativePrompt?.length || 0 }} 字符）</h4>
          <el-button size="small" text @click="copy(image.negativePrompt, 'Negative')">📋 复制</el-button>
        </header>
        <pre class="prompt-text negative">{{ image.negativePrompt || '（无）' }}</pre>
      </section>

      <section v-if="derivedFromImage" class="derived-block">
        <h4>派生自</h4>
        <div class="derived-row">
          <img :src="toImageUrl(derivedFromImage.thumbnailPath || derivedFromImage.imagePath)" class="thumb-64" />
          <div>
            <div>{{ derivedFromImage.label || '默认主图' }}</div>
            <code>{{ derivedFromImage.id }}</code>
          </div>
        </div>
      </section>

      <section v-if="parsedMetadata && Object.keys(parsedMetadata).length > 0" class="metadata-block">
        <h4>Metadata</h4>
        <div class="metadata-tags">
          <el-tag v-for="(v, k) in parsedMetadata" :key="k" type="info" effect="light">
            {{ k }}: {{ v }}
          </el-tag>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

interface AssetImageRow {
  id: string
  category: string
  label: string | null
  imagePath: string
  thumbnailPath: string | null
  isMain: number
  prompt: string | null
  negativePrompt: string | null
  metadata: string | Record<string, unknown> | null
  derivedFromImageId: string | null
  width: number | null
  height: number | null
  createdAt: string | number | Date
}

const props = defineProps<{
  modelValue: boolean
  image: AssetImageRow | null
  /** 同 asset 全部图，查 derivedFromImage（节省 IPC）*/
  allImages?: AssetImageRow[]
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const derivedFromImage = computed(() => {
  if (!props.image?.derivedFromImageId) return null
  return props.allImages?.find((i) => i.id === props.image!.derivedFromImageId) ?? null
})

const parsedMetadata = computed<Record<string, unknown> | null>(() => {
  const raw = props.image?.metadata
  if (!raw) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const obj = JSON.parse(raw)
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null
    } catch {
      return null
    }
  }
  return null
})

function formatTime(t: string | number | Date): string {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

async function copy(text: string | null, label: string) {
  if (!text) {
    ElMessage.warning(`${label} 为空，无可复制`)
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${label} 已复制`)
  } catch {
    ElMessage.error('复制失败（浏览器权限）')
  }
}
</script>

<style scoped>
.detail-body { display: flex; flex-direction: column; gap: 16px; }
.big-thumb img { width: 100%; max-height: 360px; object-fit: contain; background: var(--el-fill-color-lighter); border-radius: 4px; }
.info-block, .prompt-block, .derived-block, .metadata-block { display: flex; flex-direction: column; gap: 6px; }
.info-block h4, .prompt-block h4, .derived-block h4, .metadata-block h4 {
  font-size: 13px; font-weight: 600; margin: 0; color: var(--el-text-color-secondary);
}
.info-row { display: flex; gap: 12px; font-size: 13px; }
.info-row > span:first-child { width: 80px; color: var(--el-text-color-placeholder); }
.prompt-block header { display: flex; align-items: center; justify-content: space-between; }
.prompt-text {
  background: var(--el-fill-color-lighter); padding: 8px 10px; border-radius: 4px;
  font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word;
  max-height: 200px; overflow-y: auto; margin: 0;
}
.prompt-text.negative { background: var(--el-color-danger-light-9); }
.derived-row { display: flex; gap: 8px; align-items: center; }
.thumb-64 { width: 64px; height: 64px; object-fit: cover; border-radius: 4px; }
.metadata-tags { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
```

### 三个 GalleryEditor 集成

每个 GalleryEditor 缩略图 `thumb-tools` 加 `ⓘ` 图标：

```vue
<el-tooltip content="详情" placement="top">
  <el-icon class="thumb-tool-icon" :size="14" @click="openDetail(img)">
    <InfoFilled />
  </el-icon>
</el-tooltip>
```

```ts
import GenerationDetailDialog from '../shared/GenerationDetailDialog.vue'
import { InfoFilled } from '@element-plus/icons-vue'

const detailDialog = ref<{ open: boolean; image: AssetImageRow | null }>({
  open: false, image: null,
})
function openDetail(img: AssetImageRow) {
  detailDialog.value = { open: true, image: img }
}
```

模板末尾加：
```vue
<GenerationDetailDialog v-model="detailDialog.open" :image="detailDialog.image" :all-images="allImages" />
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 4 | `stage-asset/shared/GenerationDetailDialog.vue` | 新建 | 1.5 h |
| 5 | `CharacterGalleryEditor.vue` | 加 ⓘ + dialog | 15 min |
| 6 | `LocationGalleryEditor.vue` | 同上 | 15 min |
| 7 | `ItemGalleryEditor.vue` | 同上 | 15 min |

### 测试场景

| 场景 | 期望 |
|---|---|
| 已生成图（有 prompt） | 完整显示，复制可用 |
| 旧数据（prompt=null） | "（无 / 旧数据未落库）" |
| 派生图 | "派生自" section 显示基图缩略图 |
| 主图（非派生） | "派生自" 不显示 |
| 含 metadata 的变体 | "Metadata" tags 显示 |
| 无 metadata | "Metadata" 不显示 |

### Commit C3

```
feat(ep): 资产生成详情透明度面板（GenerationDetailDialog）

让用户能看到 asset_image 表已落库但 UI 未暴露的数据：
- 完整 prompt + negativePrompt（一键复制）
- 派生关系（derivedFromImageId 反查同 asset 列表）
- Metadata（angle/time/weather/...）
- 创建时间 / 尺寸 / is_main

三个 GalleryEditor 都加 ⓘ 工具栏入口。后端无改动；纯 UI 消费现有数据。
```

### Phase 1 验证

| 项 | 期望 | 验证 |
|---|---|---|
| character 派生 prompt 字符数 | < 修改前 70% | 跑同一 effective dry-run |
| character 派生视觉一致性 | 不劣化 | 同一角色 view 派生肉眼对比 |
| 透明度 dialog 全字段 | ✓ | 6 个测试场景 |
| `vue-tsc --noEmit` | 0 新错误 | CI |
| 已有 asset_image 行 | 不动 | 不重生即不变 |

---

# Phase 2 · 字段双层 + 镜头语言层 + 9 帧故事板（5-7 天 · 7 commits）

## P2.1 设定卡字段双层 UI

### 问题

CharacterCardFormV2 11 字段一字排开，新手不知重点。

### 当前代码位置

| 文件 | 行 | section |
|---|---|---|
| `CharacterCardFormV2.vue` | 23-85 | ① 身份（姓名/别名/定位/性别/年龄/人种）|
| 同上 | 87-104 | ② 人物描述 |
| 同上 | 106-126 | ③ 风格 |
| 同上 | 128-152 | ④ 声音 |
| 同上 | 154-178 | ⑤ 形象库 |
| 同上 | 180-188 | ⑥ 参考图 |

### 目标 UI

```
┌─ 📋 设定卡 ────────────────────────────────────┐
│ ⭐ 生成核心 ─────────────────────────────────── │
│  人物描述 (textarea, rows=6)                    │
│  风格 (multi-select)                            │
│  性别 / 年龄 / 人种                              │
│  参考图 (upload)                                 │
│  [✨ AI 自动填字段]                              │
│                                                  │
│ ▼ 叙事元数据（折叠）─────────────────────────── │
│  姓名 · 别名 · 定位 · 声音 · 形象库              │
│  提示："仅用于剧本调度 / 配音；不进图像生成"     │
└──────────────────────────────────────────────────┘
```

### 实现

模板重排（**字段绑定 / onChange 不变**）：核心区放生成相关字段，`<el-collapse>` 包裹叙事 metadata 默认 collapsed。core 区右上角占位 `[✨ AI 自动填]`（P2.2 实现）。

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 8 | `CharacterCardFormV2.vue` | 模板重排 + collapse | 1.5 h |
| 9 | `LocationCardFormV2.vue` | 类似（核心=描述/视觉特征/风格/默认时间天气/参考图）| 1 h |
| 10 | `ItemCardForm.vue` | 字段已少；仅加 AI 按钮 | 30 min |

### Commit C4

```
feat(ep): 设定卡字段双层 UI（⭐ 生成核心 + ▼ 叙事元数据）

让"决定生成质量"的字段（人物描述/风格/性别/年龄/人种/参考图）置顶；
叙事 metadata（姓名/别名/定位/声音/形象库）放 el-collapse 默认折叠。
显式标注："折叠区字段仅用于剧本调度/配音，不进图像生成"。
```

---

## P2.2 AI 正向字段提取

### 问题

填字段得逐个填；现 `enrichSettings` 只支持反推（从已生成图反推设定）。

### 目标流程

```
用户在"人物描述"自由文本写：
"二十多岁年轻男子，剑眉星目，束发，腰间佩剑，国风工笔风格"
  → 点 [✨ AI 自动填]
  → LLM 抽取（5-10 秒）
  → 自动填: gender=男, age=25, race=东亚, styleAnchors=['国风工笔']
  → ElMessage "已自动填 4 个字段"
```

### 技术选型

**LLM 调用**：复用 `callAI`（`core/.../narrative/ai/_helpers.ts`），用项目级 scriptModel 配置。

**Prompt 模板**（character）：

```
你是一个角色设定提取助手。从用户描述中抽出结构化字段，以 JSON 输出。
字段：name / gender ('男'|'女'|'其他') / age (number) / race (string) / styleAnchors (string[])
用户描述：{{description}}
输出 JSON（只输出 JSON，不要解释）：
```

**输出 schema**：
```ts
{ name?: string; gender?: '男'|'女'|'其他'; age?: number; race?: string; styleAnchors?: string[]; }
```

### Service / IPC

**Service 方法**（`AssetSettingEnrichmentService`）：

```ts
async extractFieldsFromDescription(input: {
  assetType: 'character' | 'location' | 'item'
  description: string
  projectId: string
  providerConfigId?: string
  modelId?: string
}): Promise<ExtractedFields> {
  // 1. 选 prompt 模板（按 assetType）
  // 2. 调 callAI（max_tokens 1024，json_object 模式）
  // 3. parseResults（jsonrepair 兜底）
  // 4. 校验枚举值
  // 5. 返回
}
```

**IPC channel**：`ep:asset:extract-fields`

```ts
// asset-setting-enrichment.handler.ts
ipcBridge.handle('ep:asset:extract-fields', async (_e, input) => {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) return { success: false, error: '数据库未初始化' }

  const project = await db.projects?.getById(input.projectId)
  const sm = project?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    return { success: false, error: '请先在项目设置中配置剧本生成模型' }
  }
  const svc = new AssetSettingEnrichmentService(db.dataSource, callAI)
  try {
    const data = await svc.extractFieldsFromDescription({
      ...input,
      providerConfigId: sm.providerConfigId,
      modelId: sm.modelId,
    })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || 'AI 字段提取失败' }
  }
})
```

**Preload + channel-map**：

```ts
// preload/index.ts
EP_ASSET_EXTRACT_FIELDS: 'ep:asset:extract-fields',
extractFields: (input) => ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_EXTRACT_FIELDS, input),

// web/client/channel-map.ts
'episodeProduction.asset.extractFields': { channel: 'ep:asset:extract-fields' },
```

### UI 集成

`onExtractFields()` 实现：

```ts
async function onExtractFields() {
  const desc = (form.appearance ?? '').trim()
  if (!desc) return ElMessage.warning('请先在"人物描述"里写一些内容')
  if (desc.length < 10) return ElMessage.warning('描述太短（建议至少 10 字）')
  extracting.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    const resp = await api.extractFields({
      assetType: 'character', description: desc, projectId: props.binding?.projectId,
    })
    if (!resp?.success) return ElMessage.error(resp?.error || 'AI 提取失败')
    const data = resp.data as Record<string, any>
    let count = 0
    if (data.name && !form.name) { form.name = data.name; onChange('name', data.name, true); count++ }
    if (data.gender && !form.gender) { form.gender = data.gender; onChange('gender', data.gender, true); count++ }
    if (data.age != null && !form.age) { form.age = data.age; onChange('age', data.age, true); count++ }
    if (data.race && !form.race) { form.race = data.race; onChange('race', data.race, true); count++ }
    if (Array.isArray(data.styleAnchors) && data.styleAnchors.length > 0 && form.styleAnchors.length === 0) {
      form.styleAnchors = data.styleAnchors
      onChange('styleAnchors', form.styleAnchors, true)
      count++
    }
    ElMessage.success(`已自动填 ${count} 个字段，请确认或修改`)
  } finally {
    extracting.value = false
  }
}
```

> **关键**：`&& !form.xxx` 守卫 — **不覆盖**用户已填字段。

### 错误处理

| 情况 | 处理 |
|---|---|
| description 为空 | ElMessage.warning |
| description < 10 字 | ElMessage.warning |
| 项目无 scriptModel 配置 | 明确错误"请先配置..." |
| LLM 返回非 JSON | jsonrepair 兜底 |
| LLM 无字段 | "AI 没有从描述中提取到字段" |
| 网络超时 | ElMessage.error |

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 11 | `asset-setting-enrichment.service.ts` | 新方法 + 3 个 prompt 模板 | 2.5 h |
| 12 | `asset-setting-enrichment.handler.ts` | 新 IPC | 30 min |
| 13 | `preload/index.ts` | 常量 + API | 15 min |
| 14 | `web/client/channel-map.ts` | 通道映射 | 5 min |
| 15-17 | 三个 CardForm | onExtractFields 集成 | 1.5 h |

### Commit C5

```
feat(ep): AI 自动从描述提取字段（complement enrichSettings 反推）

用户在"人物描述"自由文本里写完，点 ✨ → LLM 抽出姓名/性别/年龄/人种/风格 → 自动填表。

- AssetSettingEnrichmentService 加 extractFieldsFromDescription 方法
- 新 IPC ep:asset:extract-fields（同剧本生成走 callAI）
- preload + channel-map 双端打通
- 三个 CardForm 集成 onExtractFields；不覆盖用户已填字段
- jsonrepair 兜底畸形 JSON
```

---

## P2.3 角色一键多角度参考图

### 问题

character 创建后只有 1 张默认主图；用户得手动多次派生 3q_left / 3q_right / back。多次独立调用一致性差。

### 技术原理

**优先方案**：利用支持"单指令多张组图"的图像模型（Lib Image / Seedream 4.5 / Seedream 5.0 lite / LibNano Pro）一次推理出三视图（同 latent 上下文 → 内部一致性远好于 3 次独立调用）。

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

后端按等分横切拆 3 张落库（category='view', label='front'/'side'/'back'）。

**降级方案**：provider 不支持组合 → 串行 3 次（同 base ref 保证一致性）。

### Service 方法

```ts
// MainImageGeneratorService
async generateThreeViews(input: {
  bindingId: string
  baseImageId?: string  // 不传用 isMain=1
}): Promise<AssetImageEntity[]> {
  // 1. 取 base 图
  // 2. 加载 effective
  // 3. 调用 strategy：
  //    a) provider 支持多图组合 → 一次出 → 后端切分
  //    b) 否则 → 串行 3 次（同 base ref）
  // 4. 落库 3 个 asset_image 行（category='view', label='front'/'side'/'back'）
  //    derivedFromImageId 都指向 baseImageId
  // 5. 返回数组
}
```

### IPC

`ep:asset:character:generate-three-views`，input `{ bindingId, baseImageId? }`，output `AssetImageEntity[]`。

### UI

CharacterAssetEditorV2 头部按钮：

```vue
<el-button type="primary" plain :disabled="!hasMainImage" :loading="generatingThreeViews" @click="onGenerateThreeViews">
  <el-icon><Picture /></el-icon>
  生成多角度参考图
  <el-tooltip placement="bottom">
    <el-icon class="hint-icon"><QuestionFilled /></el-icon>
    <template #content>
      <div>一次生成正面 / 侧面 / 背面 3 张视角图</div>
      <div>跨分镜画同一角色时不走样的视觉锚点</div>
      <div class="hint-tip">专业用户："角色三视图（character bible）"</div>
    </template>
  </el-tooltip>
</el-button>
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 18 | `MainImageGeneratorService` | `generateThreeViews` | 2 h |
| 19 | `character-asset.handler.ts` | 新 IPC | 30 min |
| 20 | `preload/index.ts` | API | 15 min |
| 21 | `web/client/channel-map.ts` | 通道映射 | 5 min |
| 22 | `CharacterAssetEditorV2.vue` | 按钮 + handler | 1 h |

### Commit C6

```
feat(ep): 角色多角度参考图（一键生成正/侧/背三视图）

利用图像模型多图组合输出能力，一次推理出三视图（同 latent 内部一致性 > 3 次独立调用）；
provider 不支持组合时降级到 3 次串行（同 base ref 保证一致性）。

- MainImageGeneratorService.generateThreeViews
- 新 IPC ep:asset:character:generate-three-views
- CharacterAssetEditorV2 加按钮，hover tooltip 双母语
- 已有 view 类目时确认对话框（不覆盖，作为新派生）
```

---

## P2.4 双模板单镜画面描述

### 问题

`StageStoryboardViewV2.vue` 的"画面描述"是空白 textarea（line 422），无引导。

### 设计原理

| 短剧 5 段（默认） | 影视 shot-level（专业） |
|---|---|
| 角色（who）| Subject |
| 场景情境 | Action |
| 戏剧冲突 | Camera |
| 节奏 | Lighting |
| 镜头偏好 | Mood |

两套模板都把字段折叠成同一段文本写到 `frameDescription`，**不动 schema**。

### 组件设计

新建 `src/renderer/src/components/episode-production/stage-storyboard-v2/ShotDescriptionTemplate.vue`：

```vue
<template>
  <div class="shot-desc-template">
    <header class="template-header">
      <el-radio-group v-model="mode" size="small">
        <el-radio-button value="short_drama">⚡ 短剧 5 段</el-radio-button>
        <el-radio-button value="film">🎬 影视 shot-level</el-radio-button>
        <el-radio-button value="free">✏️ 自由文本</el-radio-button>
      </el-radio-group>
    </header>

    <el-form v-if="mode === 'short_drama'" label-position="top" size="small">
      <el-form-item label="角色"><el-input v-model="shortDrama.character" /></el-form-item>
      <el-form-item label="场景情境"><el-input v-model="shortDrama.scene" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="戏剧冲突"><el-input v-model="shortDrama.conflict" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="节奏">
        <el-radio-group v-model="shortDrama.pace">
          <el-radio-button value="slow">慢</el-radio-button>
          <el-radio-button value="medium">中</el-radio-button>
          <el-radio-button value="fast">快</el-radio-button>
          <el-radio-button value="twist">反转</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="镜头偏好">
        <el-input v-model="shortDrama.cameraHint" placeholder="如：低角度推镜 / 特写 / 全景" />
      </el-form-item>
    </el-form>

    <el-form v-if="mode === 'film'" label-position="top" size="small">
      <el-form-item label="Subject"><el-input v-model="film.subject" /></el-form-item>
      <el-form-item label="Action"><el-input v-model="film.action" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="Camera"><el-input v-model="film.camera" placeholder="如：MS, low angle, dolly in" /></el-form-item>
      <el-form-item label="Lighting"><el-input v-model="film.lighting" placeholder="如：rembrandt, warm key" /></el-form-item>
      <el-form-item label="Mood"><el-input v-model="film.mood" placeholder="如：tense, melancholic" /></el-form-item>
    </el-form>

    <el-input v-if="mode === 'free'" v-model="freeText" type="textarea" :rows="4" placeholder="如：少年推门而入..." />

    <div v-if="mode !== 'free'" class="preview">
      <span class="preview-label">📄 拼装结果：</span>
      <code class="preview-text">{{ assembled }}</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const mode = ref<'short_drama' | 'film' | 'free'>('short_drama')
const shortDrama = reactive({ character: '', scene: '', conflict: '', pace: 'medium' as const, cameraHint: '' })
const film = reactive({ subject: '', action: '', camera: '', lighting: '', mood: '' })
const freeText = ref('')

watch(() => props.modelValue, (v) => { if (mode.value === 'free') freeText.value = v ?? '' }, { immediate: true })

const assembled = computed(() => {
  if (mode.value === 'short_drama') {
    const s = shortDrama, parts: string[] = []
    if (s.character) parts.push(s.character)
    if (s.scene) parts.push(`场景情境：${s.scene}`)
    if (s.conflict) parts.push(`戏剧冲突：${s.conflict}`)
    if (s.pace) parts.push(`节奏：${({ slow: '慢', medium: '中', fast: '快', twist: '反转' } as any)[s.pace]}`)
    if (s.cameraHint) parts.push(`镜头偏好：${s.cameraHint}`)
    return parts.join('；')
  }
  if (mode.value === 'film') {
    const f = film, parts: string[] = []
    if (f.subject) parts.push(`Subject: ${f.subject}`)
    if (f.action) parts.push(`Action: ${f.action}`)
    if (f.camera) parts.push(`Camera: ${f.camera}`)
    if (f.lighting) parts.push(`Lighting: ${f.lighting}`)
    if (f.mood) parts.push(`Mood: ${f.mood}`)
    return parts.join('. ')
  }
  return freeText.value
})

watch(assembled, (v) => emit('update:modelValue', v))
</script>
```

### 集成

`StageStoryboardViewV2.vue` line 418-426 替换：

```vue
<div class="desc-section">
  <div class="desc-label">画面描述（AI 生成关键帧时用）</div>
  <ShotDescriptionTemplate v-model="editDraft.frameDescription" @update:model-value="onEditChange('frameDescription', $event)" />
</div>
```

---

## P2.5 摄像机参数化 + 视觉效果 tooltip

### 问题

镜头工具栏只有 shotType / cameraAngle / cameraMovement / 时长，缺**摄像机参数**（焦距 / 光圈 / 相机风格）。

### 数据存储

**不动 schema**，用现有 `storyboards.metadata` JSON 列：

```json
{ "lensFocalMm": 50, "aperture": "f/4", "cameraStyle": "cinematic" }
```

### 预设值

新建 `src/core/modules/episode-production/assets/constants/lens-presets.ts`：

```ts
export interface LensPreset {
  value: string
  label: string
  visualEffect: string
  promptHint: string
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
  { value: 'f/4', label: '中景深 f/4', visualEffect: '主体清晰背景柔化', promptHint: 'aperture f/4' },
  { value: 'f/8', label: '深景深 f/8', visualEffect: '前后皆清', promptHint: 'aperture f/8, deep focus' },
  { value: 'f/11', label: '全景清晰 f/11', visualEffect: '从近到远全清楚', promptHint: 'aperture f/11, deep depth of field' },
]

export const CAMERA_STYLE_PRESETS: LensPreset[] = [
  { value: 'cinematic', label: '电影感', visualEffect: '电影级色彩 + 颗粒感', promptHint: 'cinematic, film grain, color graded' },
  { value: 'digital', label: '数码', visualEffect: '清晰 / 锐利 / 现代', promptHint: 'digital camera, sharp, modern' },
  { value: 'film_35mm', label: '胶片 35mm', visualEffect: '柔和颗粒 + 复古色调', promptHint: '35mm film stock, vintage tone' },
  { value: 'vintage', label: '复古', visualEffect: '老照片质感', promptHint: 'vintage style, faded colors' },
]
```

### UI

镜头工具栏加 3 个 select。`onMetaChange` 把值写到 `editDraft.metadata`（解析 JSON + 修改 + 序列化回去）。

### Prompt 装配

keyframe gen 时按 metadata 拼 promptHint 到 frame_description 末尾：

```
... [现有 frameDescription] ... shot at 50mm, aperture f/4, cinematic, film grain
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 23 | `lens-presets.ts` | 新建 | 1 h |
| 24 | `StageStoryboardViewV2.vue` | 工具栏加 3 select | 1.5 h |
| 25 | keyframe gen prompt 装配 | 拼 promptHint | 1 h |

---

## P2.6 运镜 25 命名预设

### 问题

`cameraMovement` 仅 6 类（static/push/pull/pan/track/crane）。

### 预设清单

新建 `src/core/modules/episode-production/assets/constants/camera-movements.ts`：

```ts
export interface CameraMovementPreset {
  value: string
  label: string
  alias?: string[]
  description: string
  promptHint: string
  category: 'basic' | 'narrative' | 'dynamic' | 'special'
}

export const CAMERA_MOVEMENT_PRESETS: CameraMovementPreset[] = [
  // 基础（保留兼容老值）
  { value: 'static', label: '固定', description: '镜头不动', promptHint: 'static shot, locked off', category: 'basic' },
  { value: 'push', label: '推镜', description: '相机向被摄物推近', promptHint: 'dolly in, slow push', category: 'basic' },
  { value: 'pull', label: '拉镜', description: '相机后退远离', promptHint: 'dolly out, slow pull', category: 'basic' },
  { value: 'pan_left', label: '左摇', description: '水平向左转动', promptHint: 'pan left', category: 'basic' },
  { value: 'pan_right', label: '右摇', description: '水平向右转动', promptHint: 'pan right', category: 'basic' },
  { value: 'tilt_up', label: '上仰', description: '镜头向上抬起', promptHint: 'tilt up', category: 'basic' },
  { value: 'tilt_down', label: '下俯', description: '镜头向下俯视', promptHint: 'tilt down', category: 'basic' },
  { value: 'track_left', label: '左移', description: '相机平移左行', promptHint: 'truck left', category: 'basic' },
  { value: 'track_right', label: '右移', description: '相机平移右行', promptHint: 'truck right', category: 'basic' },
  { value: 'crane_up', label: '升镜', description: '升降臂向上', promptHint: 'crane up', category: 'basic' },
  { value: 'crane_down', label: '降镜', description: '升降臂向下', promptHint: 'crane down', category: 'basic' },

  // 叙事级
  { value: 'dolly_zoom', label: '希区柯克变焦（推拉摇移）', alias: ['vertigo'], description: '推镜同时拉变焦 → 背景诡异收缩，主体不变', promptHint: 'dolly zoom, vertigo effect, hitchcock zoom', category: 'narrative' },
  { value: 'long_take_tracking', label: '长镜头跟拍', description: '一镜到底跟随主体行进', promptHint: 'long take tracking shot', category: 'narrative' },
  { value: 'master_shot_push', label: '大师推近', description: '从全景缓慢推近到中近景', promptHint: 'master shot dolly in', category: 'narrative' },
  { value: 'spiral_up', label: '螺旋上升', description: '螺旋式升起 + 旋转', promptHint: 'spiral crane up with rotation', category: 'narrative' },
  { value: 'pov', label: '主观视角', description: '从角色视角看出去', promptHint: 'POV shot, first-person', category: 'narrative' },
  { value: 'ots_left', label: 'OTS 左过肩', description: '从角色左肩后看', promptHint: 'over the shoulder shot from left', category: 'narrative' },
  { value: 'ots_right', label: 'OTS 右过肩', description: '从角色右肩后看', promptHint: 'over the shoulder shot from right', category: 'narrative' },
  { value: 'circle_360', label: '360 环绕', description: '相机围绕主体环绕一周', promptHint: '360 degree orbit around subject', category: 'narrative' },

  // 动态
  { value: 'whip_pan', label: '甩镜', description: '快速横甩转场', promptHint: 'whip pan, quick lateral motion blur', category: 'dynamic' },
  { value: 'shaky_handheld', label: '手持晃动', description: '模拟手持的自然晃动', promptHint: 'handheld camera, natural shake, documentary feel', category: 'dynamic' },
  { value: 'snorricam', label: '主体绑机位', description: '相机绑在主角身上 → 背景旋转，主体不动', promptHint: 'snorricam, body-mounted, subject locked', category: 'dynamic' },

  // 特殊
  { value: 'aerial_descend', label: '航拍下降', description: '从高空降到地面', promptHint: 'aerial descent', category: 'special' },
  { value: 'rack_focus', label: '跟焦切换', description: '焦点在前后景间切换', promptHint: 'rack focus, focus pull', category: 'special' },
  { value: 'time_lapse', label: '延时摄影', description: '时间加速', promptHint: 'time-lapse, accelerated time', category: 'special' },
]
```

### UI

`StageStoryboardViewV2.vue` `cameraMovement` el-select 改 grouped + filterable + tooltip。旧值兼容（push/pull/pan/track/crane/static 已在新预设里）。

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 26 | `camera-movements.ts` | 新建 25 预设 | 2 h |
| 27 | `StageStoryboardViewV2.vue` | grouped select + tooltip | 1 h |
| 28 | `cameraMovementLabel` helper | 加新 value 翻译 | 30 min |
| 29 | keyframe gen | 拼 promptHint | 30 min |

---

## P2.7 打光 12 命名预设

### 预设清单

新建 `src/core/modules/episode-production/assets/constants/lighting-presets.ts`：

```ts
export interface LightingPreset { value: string; label: string; description: string; promptHint: string }

export const LIGHTING_PRESETS: LightingPreset[] = [
  { value: 'rembrandt', label: '伦勃朗光', description: '45° 主光 + 鼻影投到对侧脸颊', promptHint: 'rembrandt lighting, 45 degree key light, triangle shadow on cheek' },
  { value: 'three_point', label: '三点照明', description: '主光 + 辅光 + 轮廓光', promptHint: 'three-point lighting' },
  { value: 'butterfly', label: '蝴蝶光', description: '正前方高位主光 → 鼻下蝴蝶状阴影', promptHint: 'butterfly lighting, paramount lighting' },
  { value: 'split', label: '分割光', description: '90° 侧光 → 半亮半暗', promptHint: 'split lighting, half light half shadow' },
  { value: 'rim_backlight', label: '逆光轮廓', description: '主光在背后 → 主体边缘发光剪影', promptHint: 'rim light, backlit, silhouette outline glow' },
  { value: 'flat_softbox', label: '平铺柔光', description: '正前方大柔光箱 → 无阴影', promptHint: 'flat softbox lighting, even diffuse, shadowless' },
  { value: 'golden_hour', label: '黄金时刻', description: '日出 / 日落柔和暖光', promptHint: 'golden hour lighting, warm soft sunlight' },
  { value: 'blue_hour', label: '蓝调时刻', description: '日落后 / 日出前的冷蓝调', promptHint: 'blue hour, twilight, cool blue ambient' },
  { value: 'noir_hard', label: '黑色电影硬光', description: '强烈对比 + 百叶窗投影', promptHint: 'film noir lighting, hard chiaroscuro' },
  { value: 'cyberpunk_neon', label: '赛博朋克霓虹', description: '紫粉霓虹 + 反射 + 雨夜', promptHint: 'cyberpunk neon, magenta and cyan reflections, wet street' },
  { value: 'cozy_candle', label: '温暖烛光', description: '低色温 + 跳动光斑', promptHint: 'warm candlelight, low color temperature' },
  { value: 'cold_clinical', label: '冷峻医院', description: '高色温日光灯 + 无影', promptHint: 'cold clinical lighting, fluorescent overhead' },
]
```

### UI

镜头工具栏加新 select；存到 `metadata.lighting`；prompt 装配拼 promptHint。

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 30 | `lighting-presets.ts` | 新建 12 预设 | 1.5 h |
| 31 | `StageStoryboardViewV2.vue` | 加打光 select | 30 min |
| 32 | keyframe gen | 拼 promptHint | 30 min |

### Commit C7（合并 P2.4-2.7）

```
feat(ep): 分镜镜头语言层升级（双模板画面描述 + 摄像机参数化 + 运镜 25 预设 + 打光 12 预设）

P2.4 双模板单镜画面描述：
- 短剧 5 段（默认）：角色/场景情境/戏剧冲突/节奏/镜头偏好
- 影视 shot-level：subject/action/camera/lighting/mood
- 用户可切换；自由文本模式保留原 textarea
- 模板字段折叠拼装到 frame_description（不动 schema）

P2.5 摄像机参数化：焦距 / 光圈 / 相机风格（含 visual effect tooltip）
P2.6 运镜 4 大类 25 预设（基础保留 / 叙事级 / 动态 / 特殊）
P2.7 打光 12 命名预设（伦勃朗 / 三点 / 蝴蝶 / 黑色电影 / 赛博朋克霓虹 等）

存储：所有新参数走 storyboards.metadata JSON 列，不动 schema。
Prompt 装配：keyframe gen 时按 metadata 拼 promptHint 到 frame_description 末尾。
```

---

## P2.8 全局镜头编号

### 设计

格式：`EP{episode:02}_S{scene:02}_SH{shot:02}` 例 `EP01_S03_SH04`

新建 `src/renderer/src/utils/storyboard-id.ts`：

```ts
export function formatGlobalShotId(input: {
  episodeNumber?: number | null
  sceneIndex: number  // 0-based
  shotNumber: number  // 1-based
}): string {
  const ep = (input.episodeNumber ?? 1).toString().padStart(2, '0')
  const sc = (input.sceneIndex + 1).toString().padStart(2, '0')
  const sh = input.shotNumber.toString().padStart(2, '0')
  return `EP${ep}_S${sc}_SH${sh}`
}
```

### 集成点

| 位置 | 形式 |
|---|---|
| ④ 分镜卡片 | 缩略图右上角徽章 |
| ⑤ 制作 stage 头部 | 显示 + 时长 |
| ⑥ 合成时间轴 | cell hover tooltip |

`episodeNumber` 来源：`videoEpisodes.episodeNumber`。

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 33 | `utils/storyboard-id.ts` | 新建 | 15 min |
| 34 | `StageStoryboardViewV2.vue` | 卡片徽章 | 30 min |
| 35 | `StageProductionViewV2.vue` | 头部 | 15 min |
| 36 | `StageComposeViewV2.vue` | 时间轴 tooltip | 30 min |

### Commit C8

```
feat(ep): 全局镜头编号 EP{ep}_S{scene}_SH{shot}（spec 2026-05-09）

便于跨分镜引用 / 团队沟通。④/⑤/⑥ stage 都显示。纯展示，零数据流改动。
```

---

## P2.9 派生支持多基图输入

### 问题

`DeriveVariantDialog.vue` 用 `el-radio-group` 单选基图。Seedance 2.0 / HappyHorse 1.0 等支持最多 9 张 ref。

### Service 改造

**`gallery-derivation.service.ts`**：

```ts
export interface DeriveSingleInput {
  // ...
  baseImageId?: string         // 老接口（向后兼容；优先级低于 baseImageIds）
  baseImageIds?: string[]      // 新增
  // ...
}

async deriveSingle(input: DeriveSingleInput) {
  let baseList: AssetImageEntity[] = []
  if (input.baseImageIds && input.baseImageIds.length > 0) {
    for (const id of input.baseImageIds) {
      const img = await this.imageSvc.getById(id)
      if (img && img.assetType === input.assetType && img.assetId === input.assetId) baseList.push(img)
    }
  } else if (input.baseImageId) {
    const img = await this.imageSvc.getById(input.baseImageId)
    if (img) baseList = [img]
  } else {
    const main = await this.imageSvc.getMainImage(input.assetType, input.assetId)
    if (main) baseList = [main]
  }

  if (baseList.length === 0) throw new Error('无法派生：未找到可用基图')

  // ... prompt 拼接 ...

  const result = await this.imageGen.generate({
    referenceImagePaths: baseList.map(b => b.imagePath),  // 多基图
    prompt, negativePrompt, label: input.label,
  })

  return await this.imageSvc.addImage({
    // ...
    derivedFromImageId: baseList[0].id,  // 第一张为 derivedFrom
    // ...
  })
}
```

### UI

```vue
<el-checkbox-group v-model="form.baseImageIds" :max="maxBaseImages">
  <el-checkbox v-for="img in mainImages" :value="img.id" border>
    <span class="base-radio-inner">
      <img :src="..." class="base-thumb" />
      <span class="base-name">{{ img.label || '默认主图' }}</span>
    </span>
  </el-checkbox>
</el-checkbox-group>
<div class="hint">最多选 {{ maxBaseImages }} 张（受 provider 限制）。多张参考能提升一致性。</div>
```

```ts
const maxBaseImages = computed(() => 4)  // Phase 3 加 capabilities 后动态
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 37 | `gallery-derivation.service.ts` | 加 baseImageIds + 处理 | 1.5 h |
| 38 | `DeriveVariantDialog.vue` | radio → checkbox + max | 1 h |

### Commit C9

```
feat(ep): 派生变体支持多基图输入（spec 2026-05-09）

provider 支持多 ref 时全部喂；多张参考能提升一致性。
- DeriveSingleInput 加 baseImageIds[]（向后兼容 baseImageId）
- 第一张作为 derivedFromImageId 落库
- DeriveVariantDialog: radio → checkbox 多选，max=4 默认
```

---

## P2.10 9 帧故事板草稿模式

### 问题

剧本→分镜走 AI 一次性出全部分镜数（10-30 个），用户只能逐分镜调整或全删重生。

### 价值

- 导演视角：thumbnail storyboard 是必修课
- 大众视角：让 AI 把剧本展开看看，挑骨架再细化

### 技术原理

利用图像模型的"一次推理出多张图"能力（Lib Image / Seedream 4.5）— 一次推理输出 9 帧的内部一致性远好于 9 次独立调用。

**Prompt**：

```
基于以下剧本生成 9 帧连贯故事板（thumbnail storyboard），3×3 网格布局：

剧本：{scene_text or episode_synopsis}

要求：
1. 第 1 帧：开场（建立场景 + 主角）
2. 第 2-3 帧：情节展开
3. 第 4-5 帧：冲突 / 转折点
4. 第 6-7 帧：高潮 / 关键动作
5. 第 8 帧：结果
6. 第 9 帧：尾声 / 情绪定格

风格：{styleAnchors}
输出 9 帧并排，无序号水印。
```

后端按等分切片（每帧 1/9 区域）拆 9 张图。

### Schema 影响

**临时方案**：草稿帧落到临时存储（filesystem），不进 asset_image 表。

**最终方案**：用户挑选骨架后才创建正式 storyboards 行（每个挑选的草稿帧 → 一个 storyboard，frameDescription 来自 AI 自动描述每帧）。

### Service

新建 `src/core/modules/episode-production/narrative/ai/storyboard-thumbnail-generator.ts`：

```ts
export interface GenerateThumbnailsInput {
  episodeScriptId: string
  count: 9 | 16 | 25       // 默认 9
  styleAnchors?: string[]
  providerConfigId: string
  modelId: string
}

export interface ThumbnailFrame {
  frameIndex: number
  imagePath: string
  thumbnailPath: string | null
  description: string  // AI 反推（可选）
}

export class StoryboardThumbnailGeneratorService {
  async generate(input: GenerateThumbnailsInput): Promise<ThumbnailFrame[]> {
    // 1. 加载 episodeScript（含 scenes / 角色 / 地点 effective）
    // 2. 拼 prompt（含全剧故事概要 + 风格 + 9 段叙事节奏）
    // 3. 调 imageGen.generate（一次出 1 张大图，3×3 grid）
    // 4. 后端按等分切片
    // 5. 用 VLM 反推每帧描述（可选）
    // 6. 落地到临时目录
    // 7. 返回 frames 数组
  }
}
```

### IPC

- `ep:storyboard:generate-thumbnails` input `GenerateThumbnailsInput` → output `ThumbnailFrame[]`
- `ep:storyboard:create-from-thumbnails` input `{ episodeScriptId, selectedFrames }` → output `{ storyboardIds }`

### UI

新建 `StoryboardThumbnailDialog.vue`（3×3 grid + 勾选 + 重生）。

入口：`StageContentScriptView.vue` 顶部加按钮"📋 故事板预览"。

### 失败 / 降级

| 场景 | 处理 |
|---|---|
| Provider 不支持多图组合 | 降级到串行 9 次（同 prompt + 同 ref） |
| AI 生成 < 9 帧 | 提示用现有帧或重新生成 |
| 切片失败 | 落整张大图给用户手动切（可选） |
| 用户取消 | 临时文件清理 |

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 39 | `storyboard-thumbnail-generator.ts` | 新建 service | 6 h |
| 40 | `narrative/storyboard-thumbnail.handler.ts` | IPC handler | 1 h |
| 41 | `preload/index.ts` | 加 channel + API | 30 min |
| 42 | `web/client/channel-map.ts` | 通道映射 | 5 min |
| 43 | `StoryboardThumbnailDialog.vue` | 新建 dialog | 4 h |
| 44 | `StageContentScriptView.vue` | 加入口按钮 | 30 min |
| 45 | 图像切片 utility（sharp / jimp）| 新建 helper | 2 h |

### Commit C10

```
feat(ep): 9 帧故事板草稿模式（剧本 → 分镜过渡入口）

电影母语 + AI 一次推理一致性优势的结合：
- 一次推理出 9 帧 3×3 网格图，按等分切片得 9 张
- 用户挑选骨架帧 → 创建对应数量的正式 storyboards 行
- 替代当前"AI 一次出全部分镜数"的全或无路径

- 新 service: StoryboardThumbnailGeneratorService
- 新 IPC: ep:storyboard:generate-thumbnails / create-from-thumbnails
- 新 dialog: StoryboardThumbnailDialog
- 入口：剧本 stage 顶部"📋 故事板预览"按钮
- 降级：provider 不支持多图组合时串行 9 次
```

### Phase 2 验证

| 项 | 期望 |
|---|---|
| 设定卡核心区可见、折叠区默认收起 | ✓ |
| AI 字段提取按钮可用，extracted 字段不覆盖用户已填 | ✓ |
| 角色三视图一次生成 3 张，落库 view 类目 | ✓ |
| 双模板切换正常，frame_description 实时更新 | ✓ |
| 摄像机 / 运镜 / 打光 select 正常存到 metadata | ✓ |
| 全局镜头编号格式正确 | ✓ |
| 派生多基图正常工作 | ✓ |
| 9 帧故事板生成 + 挑选 + 创建 storyboard 全链路 | ✓ |

---

# Phase 3 · provider subject + 局部子画布 + AI 一键通道（6-9 天）

## P3.1 Provider Subject 能力探测路径

### 问题

所有 provider 走通用 `prompt + ref images`；KlingO1/O3、Midjourney V7（Omni Reference）等支持原生 subject 概念但没用上。

### 哪些 provider 支持原生 subject

| Provider | 原生 subject 能力 | 接口形态 |
|---|---|---|
| Kling O3 | ✓ 强 | `subject_id` 参数；事先注册 subject |
| Kling O1 | ✓ | 同上 |
| Midjourney V7 | ✓（Omni Reference）| `--cref <url>` + `--cw 0-100` |
| Seedance 2.0 | ✓（多模态参考）| 全能参考，支持 figure 类型 |
| Seedance 1.0 / Lite | ✗ | 通用 ref images |
| Vidu Q3 / Q2 | △ | 通用 ref images |
| Wan 2.6 / 2.5 | △ | 通用 |
| 其他 | ✗ | 通用 |

### 接口扩展（不改 schema）

```ts
// video-provider-adapter.ts
export interface VideoProviderCapabilities {
  text: boolean
  image: boolean
  keyframes: boolean
  maxKeyframes: number
  maxDurationSec: number
  // 新增
  subjectSupport?: boolean
  maxSubjects?: number
}

export interface SubjectInput {
  bindingId: string
  imagePaths: string[]  // 多角度参考图
  description?: string  // 主体身份描述
  voiceId?: string      // 数字人 provider 用
}

export interface VideoProviderAdapter {
  generateSegment(input: {
    mode: 'text2video' | 'image2video' | 'keyframes2video'
    prompt: string
    referenceImagePaths?: string[]
    keyframes?: KeyframeInput[]
    /** 新增：注入 subject 列表（仅 capabilities.subjectSupport=true 时使用）*/
    subjects?: SubjectInput[]
    durationSec?: number
    width?: number
    height?: number
  }): Promise<VideoSegmentOutput>
}
```

### 探测逻辑

`video-segment.handler.ts`：

```ts
function deriveCapabilitiesFromModel(model, providerType): VideoProviderCapabilities {
  const cap = { /* 现有 */ }
  cap.subjectSupport = inferSubjectSupport(providerType, model.id)
  cap.maxSubjects = inferMaxSubjects(providerType)
  return cap
}

function inferSubjectSupport(type: string, modelId: string): boolean {
  if (type === 'kling' && /^(o[13]|3\.0|2\.6)/.test(modelId)) return true
  if (type === 'midjourney' && modelId.includes('v7')) return true
  if (type === 'dashscope' && /seedance.*2\.0/i.test(modelId)) return true
  return false
}

function inferMaxSubjects(type: string): number {
  if (type === 'kling') return 4
  if (type === 'midjourney') return 1
  if (type === 'dashscope') return 9
  return 0
}
```

### 调用方分流

`keyframe-generation.service.ts` 决策点：

```ts
async function generateForStoryboard(sb, scene, refs) {
  const adapter = await pickAdapter(...)

  if (adapter.capabilities.subjectSupport) {
    // 走 subject API
    const subjects = await buildSubjectsForStoryboard(sb, scene)
    return adapter.generateSegment({ mode, prompt, subjects })
  }
  // 老路径：通用 prompt + ref
  return adapter.generateSegment({ mode, prompt, referenceImagePaths: pickRefImages(...) })
}
```

### Provider 适配器实现（Kling 示例）

```ts
async generateSegment(input) {
  if (input.subjects && this.capabilities.subjectSupport) {
    // 注册 subject 到 Kling subject library
    const subjectIds = await Promise.all(
      input.subjects.map(s => this.registerSubject(s))
    )
    return await this.callKlingGenerate({
      prompt: input.prompt,
      subject_ids: subjectIds,
    })
  }
  return await this.callKlingGenerate({
    prompt: input.prompt,
    reference_images: input.referenceImagePaths,
  })
}
```

### Subject 缓存

避免每次都重新注册 subject，按 (bindingId, providerConfigId) 缓存。Phase 3 内存缓存即可，Phase 4 加 `provider_subject_cache` 表持久化。

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 46 | `video-provider-adapter.ts` | 接口扩 subject 字段 | 30 min |
| 47 | `video-segment.handler.ts` | 推断逻辑 | 30 min |
| 48 | 各 provider adapter（kling / midjourney / dashscope）| subject 路径 | 6-12 h |
| 49 | `keyframe-generation.service.ts` | 调用前判断 | 1 h |
| 50 | `provider-capability-matcher.ts` | subject 维度 | 30 min |

### 风险

- 不同 provider subject API 形态各异 — 工程量主要在适配
- subject 注册有时延（5-30s）— 第一次调用慢
- Midjourney 只支持 1 个 subject — 多角色场景需选最重要

---

## P3.2 局部可视化连线（分镜级只读子画布）

### 问题

⑤ 制作 stage 已经分镜中心化（**子画布雏形已存在**），缺连线可视化。

### 数据流（已存在）

```
资产 → 关键帧 → 视频
binding.referenceImagePath → storyboard.referenceImageIds → keyframe.referenceOverrides
```

### 设计：只读连线 overlay

新建 `LineageOverlay.vue`：
- 绝对定位 SVG 覆盖在 `<main>` 上
- 用 `getBoundingClientRect` 反查每张卡片位置
- SVG 画 `<path>` 连线（贝塞尔）
- 连线 hover 显示数据传递标签
- **只读不可编辑**

### 触发开关

```vue
<el-switch v-model="showLineage" active-text="显示生成链路" inactive-text="" size="small" />
```

默认 false。

### 实现要点

```vue
<aside v-if="showLineage" class="lineage-overlay-host">
  <LineageOverlay
    :asset-card-ref="assetCardRef"
    :keyframe-card-ref="keyframeCardRef"
    :video-segment-card-ref="videoSegmentCardRef"
    :video-preview-card-ref="videoPreviewCardRef"
    :storyboard="selectedStoryboard"
  />
</aside>
```

```ts
// LineageOverlay.vue
const positions = ref<Record<string, DOMRect>>({})
function recalc() { /* 计算每个卡片 ref 的 boundingClientRect */ }
const ro = new ResizeObserver(recalc)
ro.observe(props.assetCardRef.value)
window.addEventListener('scroll', recalc, { passive: true })
window.addEventListener('resize', recalc)
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 51 | `LineageOverlay.vue` | 新建（SVG + 位置计算）| 6 h |
| 52 | `StageProductionViewV2.vue` | 加 switch + ref 暴露 | 2 h |
| 53 | `useElementPosition` composable | 提取 ref→rect | 1 h |

---

## P3.3 AI 一键快速通道

### 问题

完整 6 stage 串行流程对短剧自媒体用户负担大。

### 设计

不替代 stage 流程，**作为快捷入口**：

```
┌─ Step 1 输入 ─────────────────┐    ┌─ Step 2 生成中 ─────────────┐
│ [textarea] 一句话剧本主题       │    │ ⏳ Step 1: 剧本 ✓ (10s)        │
│ 时长：[●] 30s [○] 60s [○] 90s  │ →  │ ⏳ Step 2: 资产+三视图 ✓ (45s)  │
│ 风格：[●] 现代 [○] 古风 ...     │    │ ⏳ Step 3: 9 帧故事板 ⚙ (8/9)  │
│       [→ 开始生成]              │    │ ⏳ Step 4-6: keyframes/视频/合成│
└────────────────────────────────┘    │   [✏️暂停] [↺重生当前] [➤继续]│
                                       └────────────────────────────────┘
```

### 编排服务

新建 `QuickModeOrchestrator`：

```ts
async run(input: { userPrompt; durationSec; styleAnchors; projectId }, callbacks) {
  // 1. 创建 episode
  // 2. 生成剧本（scriptGenerator）
  // 3. 生成资产（含 character 三视图）
  // 4. 9 帧故事板
  // 5. 用全部 9 帧创建 storyboards
  // 6. 每个 sb 走关键帧 + 视频
  // 7. 合成最终视频
  // 全程 callbacks.onStepStart / onStepComplete / onError 推进度
}
```

### IPC（流式进度推送）

```ts
ipcBridge.handle('ep:project:quick-mode-run', async (event, input) => {
  const window = getBrowserWindowFromEvent(event)
  const orchestrator = new QuickModeOrchestrator(...)
  await orchestrator.run(input, {
    onStepStart: (step) => window.webContents.send('ep:quick-mode-progress', { type: 'start', step }),
    onStepComplete: (step, data) => window.webContents.send('ep:quick-mode-progress', { type: 'complete', step, data }),
  })
})
```

### 错误恢复

- 单步失败可重试或跳过
- 用户介入修改后从当前 step 继续
- 全局取消 → 已生成的内容保留为草稿

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 54 | `QuickModeOrchestrator` | 新建 | 1 d |
| 55 | IPC handler + 事件 | 新建 | 4 h |
| 56 | preload + channel-map | API + 订阅 | 1 h |
| 57 | `AIQuickModeWizard.vue` | 新建 | 1 d |
| 58 | 首页 / ① 内容 stage | 加入口 | 30 min |

---

# Phase 4 · LoRA + 跨项目库 + 数字人池 + Agent + 视频解析（2-3 周）

## P4.1 LoRA fine-tuning（重点详细设计）

### 问题

当前一致性靠 reference image + 文本约束。对长内容 / IP 矩阵 / 高质量短剧而言不够：跨集中角色脸型仍可能漂移。LoRA 是工业级方案。

### 技术选型

#### 选项 A：本地训练（kohya_ss / SD-Trainer）

**硬件要求**：
- GPU：≥ 24GB VRAM（SDXL；推荐 RTX 3090/4090 / A100/H100）
- 12GB VRAM 可训 SD 1.5 LoRA（质量较低）
- CPU：≥ 8 核
- 内存：≥ 32GB
- 存储：模型 + 数据 ≥ 50GB / 项目

**训练时间**：
- SDXL LoRA 5-20 张图：30 min - 2 h
- SD 1.5 LoRA 同样：10-30 min

**软件栈**：
- Python 3.10+
- PyTorch 2.0+ + CUDA 11.8/12.1
- diffusers / transformers / accelerate
- kohya_ss（推荐）

**Pros**：零边际成本 / 数据隐私 / 完全控制
**Cons**：用户需 GPU / 部署复杂 / Web 端不工作

#### 选项 B：云 API（推荐）

| 服务 | API | 价格 | 训练时间 | 兼容模型 |
|---|---|---|---|---|
| **fal.ai** | flux-lora-fast / sdxl-lora | $0.50-2 / LoRA | 5-15 min | Flux / SDXL |
| **Replicate** | ostris/flux-dev-lora-trainer | $1-3 / LoRA | 10-30 min | Flux |
| **RunPod** | Serverless GPU | $0.34/hr GPU | 灵活 | 自定义 |
| **Civitai** | Trainer | 免费有限制 | 30+ min | SDXL |
| **国内可灵 / 即梦原生** | 平台原生 | 包月 / 按次 | 10-30 min | 各平台模型 |

**推荐**：**fal.ai**（生态广 + Flux 适合写实人脸）

**Pros**：用户无需 GPU / 训练快 / 易集成
**Cons**：数据上传 / 边际成本 $0.50-2 / 服务依赖

#### 选项 C：Provider 原生 LoRA

Kling / Midjourney / Seedance 部分自带"角色 LoRA"或 personalization。集成成本最低，但绑定特定 provider。

#### 推荐方案：**B（云 API · fal.ai）+ C（provider 原生）双轨**

- 默认 **fal.ai Flux LoRA Fast**（$0.5-1，10 min）
- Provider 自带 LoRA → 直接用，跳过外部训练
- 本地训练（A）作为高级用户隐私场景的可选项

### Schema

新建表 `lora_models`：

```sql
CREATE TABLE lora_models (
  id VARCHAR PRIMARY KEY,                   -- lora_<16hex>
  user_id VARCHAR,
  binding_id VARCHAR NOT NULL,              -- FK character_bindings.id
  binding_type VARCHAR NOT NULL,            -- 'character'

  status VARCHAR NOT NULL,                  -- 'pending'|'training'|'ready'|'failed'
  provider VARCHAR NOT NULL,                -- 'fal_flux'|'replicate_flux'|'kling_native'|'local_kohya'
  external_id VARCHAR,                      -- provider 的 task / model ID

  trigger_word VARCHAR,                     -- 'ohwx_jianxue_1'
  base_model VARCHAR NOT NULL,              -- 'flux-dev'|'sdxl'|'sd-1.5'
  training_image_count INTEGER,
  training_steps INTEGER,
  training_started_at TIMESTAMP,
  training_completed_at TIMESTAMP,

  weights_url TEXT,
  weights_size_bytes BIGINT,
  validation_image_url TEXT,

  metadata TEXT,                            -- JSON: { hyperparams, cost_usd, ... }
  cost_usd REAL,

  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_lora_models_binding ON lora_models(binding_id);
CREATE INDEX idx_lora_models_status ON lora_models(status);
```

迁移文件：`src/core/database/migrations/add-lora-models.ts`

### Service

```ts
export class LoRATrainingService {
  async startTraining(input: {
    bindingId: string
    bindingType: 'character'
    imagePaths: string[]    // 5-20 张
    triggerWord?: string
    provider?: 'fal_flux' | 'replicate_flux'
    userId: string
  }): Promise<LoRAModel> {
    // 1. 校验 imagePaths 数量（5-20）+ 大小（<5MB）+ 格式（jpg/png/webp）
    // 2. 上传图到 provider storage
    // 3. 调 provider 训练 API（async）
    // 4. 写 lora_models 行（status='training'）
    // 5. 启动后台 polling（webhook 或 cron）
    // 6. 完成后 status='ready' + weights_url
  }

  async pollTrainingStatus(loraId: string): Promise<LoRAModel> { /* ... */ }
  async loadLoRAForGeneration(bindingId: string): Promise<LoRAModel | null> { /* ... */ }
  async deleteLoRA(loraId: string): Promise<void> { /* ... */ }
}
```

### 集成到 imageGen

```ts
interface ImageGenerator {
  generate(input: {
    referenceImagePaths: string[]
    prompt: string
    negativePrompt?: string
    label: string
    loraModels?: Array<{ id: string; weight?: number }>  // 新增
  }): Promise<{ imagePath: string; thumbnailPath: string | null }>
}
```

各 provider adapter 实现：fal.ai / replicate 直接传 LoRA URL；其他 provider 不支持时跳过。

### UI

CharacterAssetEditorV2 顶部加：

```
┌─ 高级 · 训练专属角色模型（LoRA）─────────────────┐
│  当前角色已有图：12 张（足够训练）                  │
│                                                    │
│  [✨ 训练专属 LoRA]                                │
│   预估时间：10-15 min ｜ 预估费用：$0.80-1.20     │
│   训练后：跨集 / 多剧本一致性大幅提升                │
│                                                    │
│  状态：[●] 已训练 LoRA v1（2026-05-08）            │
│       下次生成自动加载                              │
│       [查看 validation] [重新训练] [删除]          │
└────────────────────────────────────────────────────┘
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 59 | `migrations/add-lora-models.ts` | 新表 | 30 min |
| 60 | `entities/lora-model.entity.ts` | 实体 | 30 min |
| 61 | `repositories/lora-model.repository.ts` | repo | 1 h |
| 62 | `LoRATrainingService` | service | 6 h |
| 63 | provider adapters（fal / replicate）| 训练 + 加载 | 1 d |
| 64 | `ImageGenerator` 接口 | 加 loraModels | 30 min |
| 65 | image provider adapters | 加载 LoRA 注入 | 4 h |
| 66 | IPC: ep:asset:lora:train / status / delete | handler | 2 h |
| 67 | preload + channel-map | API | 30 min |
| 68 | CharacterAssetEditorV2 | LoRA UI | 1 d |
| 69 | 后台 polling job（worker thread）| 检查训练状态 | 4 h |

### 风险

- **fal.ai / replicate 服务可用性** — 需降级方案
- **隐私** — 图片上传第三方需用户协议 + 提示
- **成本失控** — 单角色 $1，IP 矩阵几十角色就是几十刀。需配额管理 + 用户预估
- **训练失败** — 5-10% 失败率（图不合格 / 服务异常）— 重试 + 退款机制

---

## P4.2 跨项目角色库

新建表 `user_assets`（user-level 资产模板）：

```sql
CREATE TABLE user_assets (
  id, user_id, asset_type, name, description, metadata, image_paths(JSON),
  lora_model_id (FK lora_models),
  source_binding_id,  -- 加入库时记录原项目 binding
  created_at, updated_at
);
```

**流程**：
- 项目内资产 → 右键"加入我的库"→ 复制到 user_assets
- 新项目创建资产 → 选项"从我的库引用"→ 列表 → 选定 → 在新 project 创建 binding（含 source_user_asset_id 反指）
- 项目内修改 → 不自动同步回库；用户主动"同步回库"

**工程量**：2-3 天

---

## P4.3 数字人池（10-30 精选）

**Schema**：character_bindings 加 `source_type='preset_digital'`（varchar 字段加新值，无需 schema 改）。

**Seed**：迁移脚本插入 10-30 个内置 binding（user_id=NULL 全局共享）：

```ts
const PRESETS = [
  { name: '青年男主播', gender: '男', age: 25, race: '东亚', appearance: '...', portraitId: '...' },
  { name: '青年女主播', gender: '女', age: 24, race: '东亚', appearance: '...', portraitId: '...' },
  { name: '老年男长者', gender: '男', age: 65, race: '东亚', appearance: '白发苍苍...' },
  // ... 共 20 个
]

for (const p of PRESETS) {
  await ds.query(`
    INSERT INTO character_bindings (id, user_id, project_id, source_type, ...)
    VALUES ('preset_${slug(p.name)}', NULL, NULL, 'preset_digital', ...)
    ON CONFLICT DO NOTHING
  `, [...])
}
```

**形象图来源**：自行用 AI 生成统一风格 + 上传到 user-data。

**UI**：character 资产创建 dialog 加 tab："✨ 自定义" / "🎭 内置形象"

**工程量**：2 天

---

## P4.4 Agent / Skill 接入

**Skill 描述（YAML）**：

```yaml
# skills/episode-production/character-three-views.yaml
name: episode-production:character-three-views
description: 为指定角色生成正/侧/背三视图
parameters:
  bindingId: { type: string, description: character_bindings.id }
returns:
  type: array
  items: { $ref: AssetImageEntity }
```

**接入**：
- 内部：MCP server 暴露给 Claude Code
- 外部：HTTP API + 鉴权（API key）

**工程量**：3-5 天

---

## P4.5 视频解析（反向工程参考视频）

**Pipeline**：
1. ffmpeg 抽帧（每秒 1 帧）
2. VLM（GVLM 3.1 Pro）分析每帧 → 输出 { 画面 / 景别 / 镜头 / 运镜 / 时长 / 音乐节奏 / 人声 }
3. 聚合到分镜表格
4. 用户预览 + 一键导入到当前剧集

**新 IPC**：`ep:reference-video:analyze`

**工程量**：3-5 天

---

# Phase 5 · 视频提取主体（1 周）

## P5.1 从短视频提取角色多视角图

**Pipeline**：
1. 用户上传 5-30s 单一连续镜头视频
2. ffmpeg 抽帧（每秒 2-4 帧）
3. 人脸检测（MediaPipe / face-api.js）+ 一致性聚类（按 embedding 距离）
4. 选代表帧（每个角度选最清晰）→ 落到 character_bindings 主图 + view 类目派生

**Pros**：单视频含动作 / 多角度 / 表情
**Cons**：实现复杂，需视觉算法库

**工程量**：5-7 天

---

# 总修改清单（汇总）

## Phase 1 · 7 文件 / 4 小时 / 3 commits

| C# | 文件 | 类型 |
|---|---|---|
| C1 | character-constraints.ts | 修改 |
| C1 | item-constraints.ts | 修改 |
| C2 | asset-identity-prompt.ts | 修改 |
| C3 | GenerationDetailDialog.vue | 新建 |
| C3 | CharacterGalleryEditor.vue | 修改 |
| C3 | LocationGalleryEditor.vue | 修改 |
| C3 | ItemGalleryEditor.vue | 修改 |

## Phase 2 · 25 文件 / 5-7 天 / 7 commits（C4-C10）

字段双层 + AI 字段提取 + 多角度参考图 + 双模板画面描述 + 摄像机 / 运镜 / 打光预设 + 全局编号 + 多基图派生 + 9 帧故事板。

## Phase 3 · 13 文件 / 6-9 天 / 4-5 commits

Provider subject + 局部子画布 + AI 一键通道。

## Phase 4 · 30+ 文件 / 2-3 周

LoRA + 跨项目库 + 数字人池 + Agent + 视频解析。涉及 schema 改动（lora_models / user_assets 等）。

## Phase 5 · 10+ 文件 / 1 周

视频提取主体（ffmpeg pipeline + 人脸聚类）。

---

# Phase 排期

| Phase | 启动 | 完成 | 工程量 | 验证 |
|---|---|---|---|---|
| 1 | Day 0 | Day 1 | 4 h | prompt 字符数减少 / 透明面板可用 |
| 2 | Day 2 | Day 9 | 5-7 d | 双模板 / 三视图 / 9 帧故事板 |
| 3 | Day 10 | Day 19 | 6-9 d | provider subject 在 Kling/MJ 上跑通 |
| 4 | Day 20 | Day 41 | 2-3 周 | LoRA 训练成功 / 跨项目库 |
| 5 | Day 42 | Day 49 | 1 周 | 视频提取代表帧落库 |

每 Phase 完成后留 1-2 天观察期，不堆积。

---

# 验证 / 风险 / 回滚

## 通用验证

| 项 | 期望 |
|---|---|
| `npx vue-tsc --noEmit` | 0 新错误 |
| 类型契约（preload + channel-map） | 双端打通 |
| Phase 1 prompt 字符数 | < 修改前 70% |
| Phase 1 透明面板 | 全字段展示 |
| Phase 2 双模板 / 三视图 / 9 帧故事板 | 全跑通 |
| Phase 3 subject 路径 | KlingO/MJ 走 subject |
| Phase 4 LoRA 训练 | fal.ai 服务正常时 80%+ 成功率 |

## 关键风险

1. **Phase 1 prompt 字面变化** — 不重生即不变，老图 prompt/imagePath 不动
2. **Phase 3 provider subject** — 不同 provider API 各异，逐个适配 + 完整测试
3. **Phase 4 LoRA 训练失败** — 5-10% 失败率 + 重试 + 用户友好错误
4. **Phase 4 LoRA 成本失控** — 单角色 $1，IP 矩阵需配额管理
5. **Phase 5 视频提取** — 算法复杂，质量难保证

## 元保证

- 单 commit ≤ 4 文件
- 每 commit 过 vue-tsc
- Phase 4+ 改 schema 时再次 pg_dump 备份
- 前 3 Phase 严格保证零 schema 变更

---

# 与已有 review 的关系

| review 文档 | 内容 | 本设计的关系 |
|---|---|---|
| `asset-prompt-assembly-review` | 现状梳理 + 装配点收口 | Phase 1 撤回部分过度工程 |
| `libtv-xiaoyunque-comparison` | 行业对比 + 双母语原则 | Phase 2/3 镜头语言层 + 工作流入口 |
| `asset-generation-review` | 字段太多 + 技术路线纠偏 | Phase 1/2 metadata 解耦源头 |
| `integrated-optimization-plan` | 5 phase 路线图 | 本设计是其执行级细化版 |

---

# 立即行动

下一步执行 **Phase 1**（4 小时）：

```bash
# C1
[改 character-constraints.ts L138-156]
[改 item-constraints.ts L60-95]
git add .. && git commit -m "refactor(ep): 缩减 character/item 派生身份保持文本约束..."

# C2
[改 asset-identity-prompt.ts L122-134]
git add .. && git commit -m "refactor(ep): metadata 字段不进 image prompt..."

# C3
[新建 GenerationDetailDialog.vue]
[改 3 个 GalleryEditor]
git add .. && git commit -m "feat(ep): 资产生成详情透明度面板..."

# 验证
npx vue-tsc --noEmit
```

完成后回填本文 §Phase 1 验证 checklist 实际数据，作为 Phase 2 估算依据。
