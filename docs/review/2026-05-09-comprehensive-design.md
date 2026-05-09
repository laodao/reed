# ⚠️ 已过时（DEPRECATED · 2026-05-09）

> **本文档已过时，请使用新版**：[`2026-05-09-ep-redesign-spec.md`](./2026-05-09-ep-redesign-spec.md)
>
> **过时原因**：本文档按 Phase 实施顺序组织（实施视角），缺少：
> - 当前实现的完整功能清单 / 用户流程 / 界面 inventory（as-is）
> - 期望实现的完整功能清单 / 用户流程 / 界面 inventory（to-be）
> - 跨 Phase 的统一修改清单（按文件聚合，看一个文件被几次改）
>
> 新版按"as-is → to-be → diff → 实施"重组，更便于产品 review。
> 本文档的 schema / service / IPC / UI mockup / 测试策略等设计内容**已全部迁移到新版**，无信息丢失。
>
> ---
>
> 以下为历史版本内容（仅作参考；动手实施请看新版）：
>
> ---

# 资产域 + 分镜域 + 工作流域 · 全面优化设计文档（执行级 · Phase 1-5）

> 版本：2026-05-09 v3（v2 自查修订版）
> 来源 review：[asset-prompt-assembly](./2026-05-09-asset-prompt-assembly-review.md) · [libtv-xiaoyunque-comparison](./2026-05-09-libtv-xiaoyunque-comparison.md) · [asset-generation](./2026-05-09-asset-generation-review.md) · [integrated-optimization-plan](./2026-05-09-integrated-optimization-plan.md)
>
> **v3 修订点**（v2 → v3 自查后修复的 10 个问题）：
> 1. 粒度一致 — Phase 4.2-4.5 / Phase 5 从"几行描述"补全到 schema + service + IPC + UI + 测试
> 2. Schema 风格统一 — 全部改 TypeORM entity + migration function（双库 PG/SQLite + 幂等），删 raw `CREATE TABLE` SQL
> 3. callAI 签名修正为位置参数 `callAI(prompt, systemPrompt, maxTokens, providerConfigId?, modelId?)`（v2 误写为对象参数）
> 4. P2.10 9 帧故事板：明确"主进程 sharp + IPC 回传切片"（sharp 是 Node native，渲染端不能用）
> 5. 加 §TDD 与测试策略 章节 — 每 commit 配套 unit test 用例 + 红绿重构循环
> 6. P3.1 SubjectInput 字段语义明确 — 路径形式 / 上传协议 / Provider 各家差异
> 7. P4.1 LoRA 加国内备选（可灵原生 / 即梦原生 / 火山）+ 本地训练存储路径
> 8. provider_subject_cache 表纳入 Phase 4 修改清单（v2 前后矛盾）
> 9. P4.1 本地 LoRA 存储路径明确：`{userData}/loras/<binding_id>/<version>/<weights>.safetensors`
> 10. Phase 1 验证：加 prompt 字符数 dry-run unit test 脚本（具体到测试文件路径 + 命令）

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

| 项 | 期望 | 验证手段（v3 具体化） |
|---|---|---|
| character 派生 prompt 字符数 | < 修改前 70% | dry-run unit test（见下） |
| character 派生视觉一致性 | 不劣化 | 同一 binding 跑改前 / 改后各一次派生（用同种子），肉眼 + face-api.js cosine similarity > 0.85 |
| 透明度 dialog 全字段 | ✓ | 6 个 component 测试场景（vue-test-utils） |
| `vue-tsc --noEmit` | 0 新错误 | 与 baseline diff（`git stash` 后比 baseline 错误数） |
| 已有 asset_image 行 | 不动 | `SELECT count(*) FROM asset_image` 改前后一致；不重生即不变 |

#### prompt 字符数 dry-run unit test

新建测试文件 `src/core/modules/episode-production/assets/prompts/__tests__/asset-identity-prompt-v3-shrink.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  buildAssetIdentityPrompt,
  type EffectiveAssetForPrompt,
} from '../asset-identity-prompt'
import {
  appendCharacterIdentityPreservation,
  mergeCharacterIdentityNegative,
} from '../character-constraints'

describe('Phase 1 prompt shrink (v3 verification)', () => {
  /** 固定 effective fixture — 跨 commit 用同一份输入对比字面差异 */
  const fixture: EffectiveAssetForPrompt = {
    name: '李白',
    alias: '青莲居士',
    role: '主角',
    gender: '男',
    age: 25,
    race: 'east_asian',
    appearance: '剑眉星目，束发，腰间佩剑',
    outfit: '青衣长袍',
    outfitsExtra: ['素衣', '甲胄'],
    styleAnchors: ['国风工笔'],
  }

  it('character 主图 prompt 不再含 alias / role 字段', () => {
    const out = buildAssetIdentityPrompt('character', fixture, {
      era: '唐朝', region: '长安', extra: '盛世',
    })
    expect(out).not.toContain('别名：青莲居士')
    expect(out).not.toContain('定位：主角')
    expect(out).toContain('外貌：剑眉星目')  // 视觉字段保留
    expect(out).toContain('风格：')          // 风格保留
  })

  it('character 派生 IDENTITY_PRESERVATION_SUFFIX < 修改前 30 字', () => {
    const empty = ''
    const withSuffix = appendCharacterIdentityPreservation(empty)
    expect(withSuffix.length).toBeLessThan(30)  // 改前是 100+ 字
  })

  it('character 派生 IDENTITY_PRESERVATION_NEGATIVE < 5 个 token', () => {
    const merged = mergeCharacterIdentityNegative(null)
    const tokens = merged.split(',').map(s => s.trim()).filter(Boolean)
    expect(tokens.length).toBeLessThan(5)  // 改前是 20+
  })

  it('整体派生 prompt 装配后 < 改前 70%', () => {
    const identity = buildAssetIdentityPrompt('character', fixture, null)
    const withSuffix = appendCharacterIdentityPreservation(identity)
    // 改前固定基线 1100 字符（手动测量并写到注释）；改后期望 < 770
    const BEFORE_BASELINE = 1100
    expect(withSuffix.length).toBeLessThan(BEFORE_BASELINE * 0.7)
  })
})
```

执行：`npm test -- asset-identity-prompt-v3-shrink.spec.ts`

> **基线值如何拿**：第一次跑测试时 console.log 改前的字符数 → 写到 `BEFORE_BASELINE` 常量。git history 里这个数值是 fixture 跑改前 commit 拿到的。

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

**LLM 调用**：复用 `callAI`（`src/core/modules/episode-production/narrative/ai/_helpers.ts:99`）。

**callAI 真实签名**（位置参数，v3 修正）：
```ts
export async function callAI(
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 8192,
  providerConfigId?: string,
  modelId?: string,
): Promise<string>
```

**Prompt 模板**（character）：

System prompt：
```
你是一个角色设定提取助手。从用户描述中抽出结构化字段，以 JSON 输出。
字段说明：
- name: 姓名（如有）
- gender: '男' | '女' | '其他'（推断）
- age: 数字（推断）
- race: 自由文本（如"东亚" / "欧洲"；保留中文）
- styleAnchors: 风格数组（从描述中提取，如"国风工笔"）

只输出 JSON，不要解释，不要 markdown 围栏。不能确定的字段不输出。
```

User prompt：
```
用户描述：{{description}}
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
  const systemPrompt = pickSystemPrompt(input.assetType)  // character/location/item 三模板
  const userPrompt = `用户描述：${input.description}`

  // callAI 真实签名是位置参数（v3 修正）
  const raw = await callAI(
    userPrompt,
    systemPrompt,
    1024,                      // maxTokens
    input.providerConfigId,
    input.modelId,
  )

  // jsonrepair 兜底畸形 JSON（剥 markdown 围栏 / 修复缺逗号 / 修双引号）
  const parsed = safeParseJson<ExtractedFields>(raw)
  if (!parsed) throw new Error('AI 返回非合法 JSON，无法提取字段')

  // 校验枚举（gender 必须是 '男' / '女' / '其他'，否则丢弃该字段）
  return validateAndCoerce(input.assetType, parsed)
}
```

`safeParseJson` / `validateAndCoerce` 是新建私有 helper（在 service 文件同级 `extract-helpers.ts` 或 inline）。

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

### 进程归属（v3 修订 — 关键澄清）

`sharp` 是 **Node native 模块**（依赖 libvips C 二进制），**只能在 Electron 主进程或 Node Web 服务进程**里 require；**渲染端（Vue 应用）不能直接 import**。

因此本 phase 的进程拆分：

```
Renderer (Vue)
  ├ 用户点"📋 故事板预览"
  ├ 调 ep:storyboard:generate-thumbnails IPC
  └ 拿到 ThumbnailFrame[]（含已落地的 9 个独立 imagePath）

Main (Electron) / Web Server (Node)
  ├ StoryboardThumbnailGeneratorService
  ├ 调 imageGen 出 1 张大图（3×3 grid）
  ├ sharp 切片：大图 → 9 个 ROI 区域 → 9 张独立图
  ├ 落地到 {userData}/temp/thumbnails/<scriptId>-<ts>/<frame>.jpg
  └ 返回 9 个 frame 元数据 + 路径
```

### 临时存储路径

```
Electron: {userData}/temp/thumbnails/{episodeScriptId}-{ts}/frame-1.jpg ... frame-9.jpg
Web:      {dataDir}/temp/thumbnails/{episodeScriptId}-{ts}/...
```

清理时机：
- 用户点"用选中帧创建分镜"成功后 → 把选中帧拷贝到正式 asset 目录，删整个 temp 子目录
- 用户取消 dialog → 主进程定时任务（每 6 小时一次，删 24h+ 的 temp 子目录）兜底

### Service

新建 `src/core/modules/episode-production/narrative/ai/storyboard-thumbnail-generator.ts`：

```ts
import sharp from 'sharp'  // ✓ 主进程允许；渲染端会 build 失败

export interface GenerateThumbnailsInput {
  episodeScriptId: string
  count: 9 | 16 | 25       // 默认 9（3x3 网格）
  styleAnchors?: string[]
  providerConfigId: string
  modelId: string
}

export interface ThumbnailFrame {
  frameIndex: number       // 1-N
  imagePath: string        // 主进程绝对路径
  thumbnailPath: string | null
  description: string | null  // 可选：VLM 反推每帧描述
}

export class StoryboardThumbnailGeneratorService {
  constructor(
    private readonly tempDir: string,           // 来自 app.getPath('userData') / dataDir
    private readonly imageGen: ImageGenerator,
  ) {}

  async generate(input: GenerateThumbnailsInput): Promise<ThumbnailFrame[]> {
    // 1. 加载 episodeScript（含 scenes / 角色 / 地点 effective）
    const script = await this.loadScript(input.episodeScriptId)

    // 2. 拼 prompt（全剧概要 + 风格 + 9 段叙事节奏）
    const prompt = this.buildThumbnailPrompt(script, input.styleAnchors)

    // 3. 调 imageGen 出 1 张大图（3x3 grid 布局）
    //    分辨率：1536×1536（每帧 512×512）
    const big = await this.imageGen.generate({
      prompt,
      width: 1536,
      height: 1536,
      // 不传 referenceImagePaths，纯 text2image
    })

    // 4. sharp 切片：把大图按 3x3 等分成 9 个 ROI
    const sessionDir = path.join(this.tempDir, 'thumbnails',
      `${input.episodeScriptId}-${Date.now()}`)
    await fs.mkdir(sessionDir, { recursive: true })
    const frames: ThumbnailFrame[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const idx = row * 3 + col + 1
        const out = path.join(sessionDir, `frame-${idx}.jpg`)
        await sharp(big.imagePath)
          .extract({ left: col * 512, top: row * 512, width: 512, height: 512 })
          .jpeg({ quality: 88 })
          .toFile(out)
        frames.push({
          frameIndex: idx,
          imagePath: out,
          thumbnailPath: null,
          description: null,
        })
      }
    }

    // 5. （可选）VLM 反推每帧描述 — 第二次 IPC 触发，不在 generate 里跑
    return frames
  }
}
```

> **VLM 反推单独 phase**：避免 generate 链路过长。设计 `ep:storyboard:thumbnail:describe-frame` 单独 IPC，用户点单帧时按需调用。

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
  /** character_bindings.id（用于缓存查找：同一 binding 多次调用时复用 provider 端的 subject_id） */
  bindingId: string

  /**
   * 主体多角度参考图路径列表（v3 修订 — 字段语义明确）：
   * - 形式：**绝对路径**（来自 asset_image.imagePath 经 path 解析后）。
   *   不能是相对路径，因为 provider adapter 跨进程；不能是 web url（除非已是 https）。
   * - 数量：1-N（受 provider maxSubjects 限制；多张更稳定，建议 3-5 张含正/侧/背）。
   * - 上传协议（按 provider 分流）：
   *   - Kling：在 adapter 内 multipart/form-data 上传，拿 image_url，再 POST /subjects 注册
   *   - Midjourney：上传到中转 CDN（adapter 自维护），输出 https URL 给 --cref 参数
   *   - Seedance：直接 base64 内联到 generate API 的 reference_images 字段
   *   - 其他 provider：adapter 自行决定（见 P4 各 adapter 实现）
   */
  imagePaths: string[]

  /** 主体身份描述（character.description + appearance）；某些 provider 用作 subject prompt anchor */
  description?: string

  /** 数字人 provider（如 Kling 数字人）用；其他 provider 忽略 */
  voiceId?: string
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

#### 选项 B：海外云 API

| 服务 | API | 价格 | 训练时间 | 兼容模型 | 国内可访问 |
|---|---|---|---|---|---|
| **fal.ai** | flux-lora-fast / sdxl-lora | $0.50-2 / LoRA | 5-15 min | Flux / SDXL | △ 需代理 |
| **Replicate** | ostris/flux-dev-lora-trainer | $1-3 / LoRA | 10-30 min | Flux | △ 需代理 |
| **RunPod** | Serverless GPU | $0.34/hr GPU | 灵活 | 自定义 | △ 需代理 |
| **Civitai** | Trainer | 免费有限制 | 30+ min | SDXL | △ 需代理 |

#### 选项 C：国内云 API（v3 新增）

| 服务 | API | 价格 | 训练时间 | 兼容模型 | 备注 |
|---|---|---|---|---|---|
| **可灵 AI** | 角色形象训练 | 包月 / 按次 | 10-20 min | 可灵图像模型 | 与可灵图 / 视频生成深度集成 |
| **即梦 AI**（字节） | 角色定制 | 包月 / 按次 | 10-30 min | Seedream / Seedance | 与即梦图 / 视频生成深度集成 |
| **火山方舟**（字节） | 模型微调 | 按 token / 按训练时长 | 30 min - 2 h | 多模型 | 企业级 SLA |
| **百炼平台**（阿里） | 模型微调 | 按训练时长 | 30 min - 2 h | 通义千问视觉 | 企业级 |

#### 选项 D：Provider 原生 LoRA

Kling / Midjourney / Seedance 部分自带"角色 LoRA"或 personalization。集成成本最低，但绑定特定 provider。

#### 推荐方案：**多 provider 抽象层 + 默认国内优先**

设计 `LoRATrainingProvider` 接口，每家服务一个 adapter：

```
LoRATrainingProvider (interface)
  ├ FalFluxAdapter       (海外·fal.ai)
  ├ ReplicateFluxAdapter (海外·Replicate)
  ├ KlingNativeAdapter   (国内·可灵)
  ├ JimengNativeAdapter  (国内·即梦)
  ├ VolcArkAdapter       (国内·火山方舟)
  └ LocalKohyaAdapter    (本地·kohya_ss · 选装，需用户自部署 + 配置)
```

默认顺序由项目配置决定：
- 国内用户：可灵 / 即梦优先 → 火山方舟兜底
- 海外用户：fal.ai 优先 → Replicate 兜底
- 隐私场景：本地 kohya_ss（需用户先在设置 → 高级里启用并指定本地 ComfyUI / kohya_ss endpoint）

### Schema（v3 修订 — TypeORM 范式，不用 raw SQL）

**Entity** — `src/core/database/entities/episode-production/lora-model.entity.ts`：

```ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LoRA 微调模型实体
 * @description 角色 / 物品 / 地点的专属 LoRA 模型，用于跨剧集 / 跨项目的一致性。
 * 时间字段为 epoch ms（与 character_bindings 等表保持一致）。
 */
@Entity({ name: 'lora_models' })
@Index('idx_lora_models_binding', ['bindingId'])
@Index('idx_lora_models_status', ['status'])
export class LoRAModelEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 多租户隔离（BaseRepository 自动注入） */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** FK character_bindings.id（v1 仅支持 character；location/item 后续扩展） */
  @Column({ name: 'binding_id', type: 'varchar' })
  bindingId!: string

  @Column({ name: 'binding_type', type: 'varchar' })
  bindingType!: 'character' | 'location' | 'item'

  @Column({ name: 'status', type: 'varchar' })
  status!: 'pending' | 'training' | 'ready' | 'failed' | 'cancelled'

  /** 训练 provider 标识，对应 LoRATrainingProvider adapter */
  @Column({ name: 'provider', type: 'varchar' })
  provider!:
    | 'fal_flux'
    | 'replicate_flux'
    | 'kling_native'
    | 'jimeng_native'
    | 'volc_ark'
    | 'baidu_qianfan'
    | 'local_kohya'

  /** Provider 端 task / model id（轮询状态用） */
  @Column({ name: 'external_id', type: 'text', nullable: true })
  externalId!: string | null

  /** 触发词（在 prompt 中用于激活该 LoRA），默认 'ohwx_<bindingId 短码>_<version>' */
  @Column({ name: 'trigger_word', type: 'text', nullable: true })
  triggerWord!: string | null

  /** 基础模型 — 决定 LoRA 兼容哪个 image gen */
  @Column({ name: 'base_model', type: 'varchar' })
  baseModel!: 'flux-dev' | 'sdxl' | 'sd-1.5' | 'kling' | 'seedream'

  @Column({ name: 'training_image_count', type: 'integer', nullable: true })
  trainingImageCount!: number | null

  @Column({ name: 'training_steps', type: 'integer', nullable: true })
  trainingSteps!: number | null

  /** 时间字段：epoch ms（与项目其他表保持一致） */
  @Column({ name: 'training_started_at', type: 'bigint', nullable: true })
  trainingStartedAt!: number | null

  @Column({ name: 'training_completed_at', type: 'bigint', nullable: true })
  trainingCompletedAt!: number | null

  /** 云端 weights URL（fal/replicate/可灵/即梦） */
  @Column({ name: 'weights_url', type: 'text', nullable: true })
  weightsUrl!: string | null

  /** 本地落盘路径（v3 新增 — 选项 A 本地训练用，weightsUrl 与本字段二选一） */
  @Column({ name: 'weights_local_path', type: 'text', nullable: true })
  weightsLocalPath!: string | null

  @Column({ name: 'weights_size_bytes', type: 'bigint', nullable: true })
  weightsSizeBytes!: number | null

  @Column({ name: 'validation_image_url', type: 'text', nullable: true })
  validationImageUrl!: string | null

  /** 训练超参 / 错误信息 / 成本明细 等 */
  @Column({ name: 'metadata', type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null

  @Column({ name: 'cost_usd', type: 'real', nullable: true })
  costUsd!: number | null

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt!: number

  @Column({ name: 'updated_at', type: 'bigint' })
  updatedAt!: number
}
```

**Migration** — `src/core/database/migrations/add-lora-models.ts`（PG + SQLite 双库 + 幂等）：

```ts
import type { DataSource } from 'typeorm'

export async function addLoRAModels(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (await checkTableExists(ds, 'lora_models', isPg)) {
    console.log('[add-lora-models] lora_models 已存在，跳过')
    return
  }

  if (isPg) {
    await ds.query(`
      CREATE TABLE lora_models (
        id              VARCHAR PRIMARY KEY,
        user_id         VARCHAR,
        binding_id      VARCHAR NOT NULL,
        binding_type    VARCHAR NOT NULL,
        status          VARCHAR NOT NULL,
        provider        VARCHAR NOT NULL,
        external_id     TEXT,
        trigger_word    TEXT,
        base_model      VARCHAR NOT NULL,
        training_image_count   INTEGER,
        training_steps         INTEGER,
        training_started_at    BIGINT,
        training_completed_at  BIGINT,
        weights_url            TEXT,
        weights_local_path     TEXT,
        weights_size_bytes     BIGINT,
        validation_image_url   TEXT,
        metadata               TEXT,
        cost_usd               REAL,
        created_at             BIGINT NOT NULL,
        updated_at             BIGINT NOT NULL
      )
    `)
  } else {
    // SQLite — INTEGER 替 BIGINT；其他相同
    await ds.query(`
      CREATE TABLE lora_models (
        id              TEXT PRIMARY KEY,
        user_id         TEXT,
        binding_id      TEXT NOT NULL,
        binding_type    TEXT NOT NULL,
        status          TEXT NOT NULL,
        provider        TEXT NOT NULL,
        external_id     TEXT,
        trigger_word    TEXT,
        base_model      TEXT NOT NULL,
        training_image_count   INTEGER,
        training_steps         INTEGER,
        training_started_at    INTEGER,
        training_completed_at  INTEGER,
        weights_url            TEXT,
        weights_local_path     TEXT,
        weights_size_bytes     INTEGER,
        validation_image_url   TEXT,
        metadata               TEXT,
        cost_usd               REAL,
        created_at             INTEGER NOT NULL,
        updated_at             INTEGER NOT NULL
      )
    `)
  }

  await ds.query(`CREATE INDEX idx_lora_models_user_id ON lora_models(user_id)`)
  await ds.query(`CREATE INDEX idx_lora_models_binding ON lora_models(binding_id)`)
  await ds.query(`CREATE INDEX idx_lora_models_status  ON lora_models(status)`)

  console.log('[add-lora-models] lora_models 表 + 3 索引创建完成')
}

// checkTableExists 已在 add-binding-reference-image-path.ts 等多份 migration 复用，
// 抽到 src/core/database/migrations/_helpers.ts 共享（v3 顺手做）
```

> **同时新建表 `provider_subject_cache`**（v3 一致性补丁 — Phase 3 提到但 v2 漏列）：
>
> ```ts
> @Entity({ name: 'provider_subject_cache' })
> @Index('idx_psc_binding', ['bindingId'])
> @Index('idx_psc_provider', ['providerConfigId'])
> export class ProviderSubjectCacheEntity {
>   @PrimaryColumn() id!: string
>   @Column({ name: 'user_id', nullable: true }) userId!: string | null
>   @Column({ name: 'binding_id' }) bindingId!: string
>   @Column({ name: 'provider_config_id' }) providerConfigId!: string
>   @Column({ name: 'provider_subject_id' }) providerSubjectId!: string  // 各家 API 返回的 ID
>   @Column({ name: 'image_paths_hash' }) imagePathsHash!: string  // 上次注册时的 imagePaths SHA256 — 不一致则重注册
>   @Column({ name: 'created_at', type: 'bigint' }) createdAt!: number
>   @Column({ name: 'expires_at', type: 'bigint', nullable: true }) expiresAt!: number | null
> }
> ```
>
> 迁移：`add-provider-subject-cache.ts`（同范式）。

### Repository

新建 `src/core/database/repositories/lora-model.repository.ts`，继承 `BaseRepository`：

```ts
import type { DataSource } from 'typeorm'
import { BaseRepository } from '../base-repository'
import { LoRAModelEntity } from '../entities/episode-production/lora-model.entity'

export class LoRAModelRepository extends BaseRepository<LoRAModelEntity> {
  constructor(ds: DataSource) {
    super(ds, LoRAModelEntity)
  }

  /** 取某 binding 的最新 ready LoRA（生成时按 binding_id 自动加载用） */
  async findReadyByBindingId(bindingId: string): Promise<LoRAModelEntity | null> {
    return await this.findOne({
      where: { bindingId, status: 'ready' },
      order: { trainingCompletedAt: 'DESC' },
    })
  }

  async listByBindingId(bindingId: string): Promise<LoRAModelEntity[]> {
    return await this.find({ where: { bindingId }, order: { createdAt: 'DESC' } })
  }
}
```

`BaseRepository` 的 `findOne` / `find` 自动注入 `WHERE user_id = currentUser`，多租户隔离免操心。

### 本地 LoRA 存储路径（v3 新增）

本地训练（kohya_ss）输出的 weights 落盘到：

```
Electron: app.getPath('userData') / loras / {bindingId} / v{version} / model.safetensors
                                                                       trigger.txt    (触发词)
                                                                       config.json    (训练超参)
                                                                       validation.jpg (验证图)
Web:      {dataDir} / loras / {bindingId} / v{version} / ...（同结构）
```

**版本管理**：同一 binding 多次训练 → version 递增（v1, v2, v3）。`weightsLocalPath` 字段记 `loras/<bindingId>/v<n>/model.safetensors`。

**清理策略**：
- 删除 LoRA → 删 DB 行 + 删整个 `v<n>/` 目录
- 删除 character binding → 级联删整个 `loras/<bindingId>/` 目录（外键级联，需在 binding 删除 service 加 hook）

### Service

`src/core/modules/episode-production/lora/lora-training.service.ts`：

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
    private readonly userId: string | null,
  ) {}

  async startTraining(input: LoRATrainingInput): Promise<LoRAModelEntity> {
    // 1. 校验：5 ≤ count ≤ 20；每张 < 5MB；jpg/png/webp
    this.validateImages(input.imagePaths)

    // 2. 选 provider（按 input.provider；未指定 → 项目默认 → 全局默认）
    const adapter = this.pickProvider(input.provider)

    // 3. 写 lora_models 行（status='pending'）
    const id = generateLoRAId()
    const triggerWord = input.triggerWord ?? generateTriggerWord(input.bindingId)
    const now = Date.now()
    const row = await this.repo.create({
      id,
      bindingId: input.bindingId,
      bindingType: input.bindingType,
      status: 'pending',
      provider: adapter.providerName,
      triggerWord,
      baseModel: input.baseModel ?? 'flux-dev',
      trainingImageCount: input.imagePaths.length,
      createdAt: now,
      updatedAt: now,
    })

    // 4. 调 adapter 启动训练（异步；adapter 内部上传图 + 调 API + 拿 externalId）
    try {
      const externalId = await adapter.startTraining({
        imagePaths: input.imagePaths,
        triggerWord,
        baseModel: row.baseModel,
      })
      await this.repo.update(id, {
        status: 'training',
        externalId,
        trainingStartedAt: Date.now(),
      })
    } catch (e) {
      await this.repo.update(id, {
        status: 'failed',
        metadata: { error: String(e) },
      })
      throw e
    }

    return await this.repo.findById(id)!
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
      await this.repo.update(loraId, {
        status: 'failed',
        metadata: { error: status.error },
      })
    }

    return await this.repo.findById(loraId)!
  }

  async loadForGeneration(bindingId: string): Promise<LoRAModelEntity | null> {
    return await this.repo.findReadyByBindingId(bindingId)
  }

  async deleteLoRA(loraId: string): Promise<void> {
    const row = await this.repo.findById(loraId)
    if (!row) return
    // 1. 调 provider 删云端模型
    const adapter = this.providers.get(row.provider as LoRAProvider)
    if (row.externalId && adapter) {
      await adapter.delete(row.externalId).catch(() => { /* 容错 */ })
    }
    // 2. 删本地 weights（如有）
    if (row.weightsLocalPath) {
      await fs.rm(path.dirname(row.weightsLocalPath), { recursive: true, force: true })
    }
    // 3. 删 DB 行
    await this.repo.delete(loraId)
  }
}
```

**Adapter 接口**（`LoRATrainingProvider`）：

```ts
export interface LoRATrainingProvider {
  readonly providerName: LoRAProvider

  startTraining(input: {
    imagePaths: string[]
    triggerWord: string
    baseModel: BaseModel
  }): Promise<string>  // 返回 externalId

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

每家 provider 一个 adapter 文件：
- `src/core/modules/episode-production/lora/providers/fal-flux-adapter.ts`
- `.../kling-native-adapter.ts`
- `.../jimeng-native-adapter.ts`
- `.../volc-ark-adapter.ts`
- `.../local-kohya-adapter.ts`（HTTP 调本地 kohya_ss API endpoint，用户自部署）

### 集成到 imageGen

```ts
interface ImageGenerator {
  generate(input: {
    referenceImagePaths?: string[]
    prompt: string
    negativePrompt?: string
    label: string
    /** v3 新增 — 推理时加载已训练的 LoRA */
    loras?: Array<{
      /** lora_models.id；adapter 自行查 weightsUrl 或下载 weightsLocalPath */
      id: string
      /** 注入强度，0.0-1.5；默认 0.8 */
      weight?: number
    }>
  }): Promise<{ imagePath: string; thumbnailPath: string | null }>
}
```

**路由策略**：
- 若用户配置的 image provider 与 LoRA provider 同源（如可灵图 + 可灵 LoRA）→ 直接传
- 不同源（如即梦 LoRA + 可灵图）→ 该 LoRA 不可用，UI 提示"当前图像 provider 与该 LoRA 不兼容"
- 跨平台兼容性表（待 Phase 4 启动时补全）

### IPC

| Channel | input | output |
|---|---|---|
| `ep:asset:lora:train` | `LoRATrainingInput` | `LoRAModelEntity`（status='training'） |
| `ep:asset:lora:status` | `{ loraId }` | `LoRAModelEntity` |
| `ep:asset:lora:list` | `{ bindingId }` | `LoRAModelEntity[]` |
| `ep:asset:lora:delete` | `{ loraId }` | `{ success: boolean }` |

**事件流**（流式状态推送）：
- `ep:asset:lora:status-changed` → 主进程后台 polling cron 检测到状态变化，broadcast 到所有渲染端
- 用户 UI 订阅事件 → 自动刷新 LoRA 状态

### UI

CharacterAssetEditorV2 顶部新增"训练专属模型"区：

```
┌─ 高级 · 训练专属角色模型（LoRA）─────────────────┐
│  当前角色已有图：12 张 ✓（建议 5-20 张）          │
│                                                    │
│  Provider：[可灵 AI ▼]  Base：[flux-dev ▼]        │
│  预估时间：10-15 min  ｜  预估费用：~ ¥6-10        │
│                                                    │
│  [✨ 训练专属 LoRA]                                │
│   训练后跨集 / 多剧本一致性大幅提升                 │
│                                                    │
│  ─── 已有版本 ───                                  │
│  [●] LoRA v2（2026-05-08，可灵）默认加载            │
│      触发词：ohwx_jianxue_2  ｜  weights: 152MB    │
│      [查看 validation] [设为默认] [删除]           │
│  [○] LoRA v1（2026-05-05，fal.ai）已禁用            │
└────────────────────────────────────────────────────┘
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 59 | `migrations/add-lora-models.ts` | 新表（PG/SQLite 双库 + 幂等） | 1 h |
| 60 | `migrations/add-provider-subject-cache.ts` | 新表（v3 补回 P3.1 的 cache） | 30 min |
| 61 | `migrations/_helpers.ts` | 提取 checkTableExists / checkColumnExists 共享 | 30 min |
| 62 | `entities/episode-production/lora-model.entity.ts` | TypeORM entity | 1 h |
| 63 | `entities/episode-production/provider-subject-cache.entity.ts` | TypeORM entity | 30 min |
| 64 | `repositories/lora-model.repository.ts` | repo（继承 BaseRepository） | 1 h |
| 65 | `repositories/provider-subject-cache.repository.ts` | repo | 30 min |
| 66 | `lora/lora-training.service.ts` | service（含 polling / adapter 路由） | 1 d |
| 67 | `lora/providers/fal-flux-adapter.ts` | 海外 adapter 1 | 6 h |
| 68 | `lora/providers/kling-native-adapter.ts` | 国内 adapter 1（推荐主路径） | 6 h |
| 69 | `lora/providers/jimeng-native-adapter.ts` | 国内 adapter 2 | 6 h |
| 70 | `lora/providers/volc-ark-adapter.ts` | 国内企业级 adapter | 4 h |
| 71 | `lora/providers/local-kohya-adapter.ts` | 本地训练（HTTP 调用户 kohya_ss endpoint） | 4 h |
| 72 | `ImageGenerator` 接口 + 5 个 image adapter | 加 loras 参数 + 注入逻辑 | 6 h |
| 73 | IPC handlers（train / status / list / delete + status-changed event） | 4 个 handler + 1 event | 3 h |
| 74 | preload + channel-map | API + 事件订阅 | 1 h |
| 75 | `CharacterAssetEditorV2.vue` | LoRA 训练 UI（含 provider 选择 + 版本管理） | 1 d |
| 76 | 后台 polling job（worker_thread） | 每 30s 检查 training 状态 | 4 h |

### 风险

| 风险 | 应对 |
|---|---|
| **海外 fal.ai / Replicate 国内访问困难** | 默认走可灵 / 即梦原生；fal.ai 走代理或仅海外用户开放 |
| **隐私（图片上传第三方）** | UI 加显式同意 checkbox + 隐私协议链接；本地 kohya_ss 选项面向高敏用户 |
| **成本失控**（IP 矩阵几十角色） | 每用户 monthly quota（默认 $20）+ 训练前预估费用弹窗 + 超额必须二次确认 |
| **训练失败率 5-10%** | 失败自动重试 1 次；失败后退款（云 API 通常不扣费）；UI 展示具体错误（图过少 / 图重复 / 服务异常） |
| **跨 provider LoRA 不兼容** | 兼容性矩阵 + UI 明确禁用不兼容选项；提示"切换 image provider 或重训练" |
| **本地训练用户配置复杂** | `local_kohya` 需用户手动指定 ComfyUI / kohya_ss endpoint；附 setup 文档 + 检测脚本 |

---

## P4.2 跨项目角色库（v3 详细化）

### 问题

binding 是 projectId 隔离 — 不能跨剧集 / 跨项目复用同一角色。"李白"在 EP01 项目设定后，做 EP02 项目还要重新建一遍。

### Schema

**Entity** — `src/core/database/entities/episode-production/user-asset.entity.ts`：

```ts
@Entity({ name: 'user_assets' })
@Index('idx_user_assets_user_type', ['userId', 'assetType'])
export class UserAssetEntity {
  @PrimaryColumn({ type: 'varchar' }) id!: string

  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @Column({ name: 'asset_type', type: 'varchar' })
  assetType!: 'character' | 'location' | 'item'

  @Column({ name: 'name', type: 'text' }) name!: string
  @Column({ name: 'description', type: 'text', nullable: true }) description!: string | null

  /** 完整 effective 字段快照（含 character 的 alias/role/gender/age/race/...） */
  @Column({ name: 'snapshot', type: 'simple-json' })
  snapshot!: Record<string, unknown>

  /** 多张图绝对路径（主图 + 派生）— 每张图都拷到 user-asset 库目录 */
  @Column({ name: 'image_paths', type: 'simple-json', nullable: true })
  imagePaths!: string[] | null

  /** 关联 LoRA（如有） */
  @Column({ name: 'lora_model_id', type: 'varchar', nullable: true })
  loraModelId!: string | null

  /** 库化时的源 binding（追踪用，不强引用） */
  @Column({ name: 'source_binding_id', type: 'varchar', nullable: true })
  sourceBindingId!: string | null

  @Column({ name: 'created_at', type: 'bigint' }) createdAt!: number
  @Column({ name: 'updated_at', type: 'bigint' }) updatedAt!: number
}
```

**Migration** — `add-user-assets.ts`（同 P4.1 范式，PG/SQLite 双库 + 幂等）。

`character_bindings` / `location_bindings` / `item_bindings` 三表加列 `source_user_asset_id varchar nullable`（migration `add-binding-source-user-asset.ts`），追踪"该 binding 是从哪个 user_asset 引用而来"。

### 存储路径

库化资产的图片落到：
```
Electron: app.getPath('userData') / user-assets / {userAssetId} / {originalFilename}
Web:      {dataDir} / user-assets / {userAssetId} / ...
```

### Service

`src/core/modules/episode-production/user-asset/user-asset.service.ts`：

```ts
export class UserAssetService {
  async addToLibrary(input: {
    bindingId: string
    bindingType: 'character' | 'location' | 'item'
  }): Promise<UserAssetEntity> {
    // 1. 加载该 binding 的 effective + 全部 asset_image
    // 2. 拷图到 user-assets/{newId}/ 目录
    // 3. 写 user_assets 行（snapshot = effective + imagePaths = 拷贝后路径）
    // 4. 如有关联 LoRA，记录 loraModelId
  }

  async createFromLibrary(input: {
    userAssetId: string
    targetProjectId: string
  }): Promise<{ bindingId: string }> {
    // 1. 从 user_assets 取 snapshot
    // 2. 在 target project 创建 binding（standalone source_type）
    //    把 snapshot 字段填到 binding 各 override 列
    //    binding.source_user_asset_id = userAssetId
    // 3. 把 user-assets 库内的图拷到 project 内的 asset_image 表 / 文件目录
    //    （拷贝而非软链 — 避免删库后引用断裂）
    // 4. 返回新 bindingId
  }

  async syncBackToLibrary(bindingId: string): Promise<UserAssetEntity> {
    // 用户在项目内改了 binding → 主动"同步回库"，覆盖 user_assets snapshot
    // 不自动同步（多用户 / 多项目共用时容易冲突）
  }

  async listLibrary(input: {
    assetType?: 'character' | 'location' | 'item'
    keyword?: string
  }): Promise<UserAssetEntity[]> { /* ... */ }

  async deleteFromLibrary(userAssetId: string): Promise<void> {
    // 1. 检查是否还有 binding source_user_asset_id 指向此 → 警告但不阻止
    // 2. 删 user_assets 行 + 整个 user-assets/{id}/ 目录
  }
}
```

### IPC

| Channel | input | output |
|---|---|---|
| `ep:user-asset:list` | `{ assetType?, keyword? }` | `UserAssetEntity[]` |
| `ep:user-asset:add-from-binding` | `{ bindingId, bindingType }` | `UserAssetEntity` |
| `ep:user-asset:create-binding` | `{ userAssetId, targetProjectId }` | `{ bindingId }` |
| `ep:user-asset:sync-back` | `{ bindingId }` | `UserAssetEntity` |
| `ep:user-asset:delete` | `{ userAssetId }` | `{ success }` |

### UI

1. AssetCard（character/location/item）右上角溢出菜单加"⭐ 加入我的库"
2. 资产创建 dialog 加 tab："✨ 全新创建" / "📚 从我的库引用"
3. 库列表 dialog（独立入口"我的资产库"）：grid 缩略图 + 搜索 + 编辑 / 删除

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 77 | `migrations/add-user-assets.ts` + `add-binding-source-user-asset.ts` | 新表 + 三表加列 | 1.5 h |
| 78 | `entities/.../user-asset.entity.ts` | TypeORM entity | 30 min |
| 79 | `repositories/user-asset.repository.ts` | repo | 1 h |
| 80 | `user-asset/user-asset.service.ts` | service | 6 h |
| 81 | IPC handlers（5 个） | handler | 2 h |
| 82 | preload + channel-map | API | 30 min |
| 83 | `UserAssetLibraryDialog.vue` | 库列表 dialog | 6 h |
| 84 | `CharacterAssetCardV2.vue` 等 3 个 | 加"加入我的库"溢出菜单项 | 1.5 h |
| 85 | 资产创建 dialog | 加"从我的库引用"tab | 3 h |

**工程量**：2-3 天

---

## P4.3 数字人池（v3 详细化）

### 问题

新用户面对"创建 character"无所适从。需要少量精选预制数字人快速起步。

### Schema

**不新建表** — character_bindings 加新枚举值 `source_type='preset_digital'`（varchar 列，加值不破坏 schema）。

加列 `is_preset boolean default false`（用于过滤展示），通过 `add-character-binding-preset.ts` migration 加上。

预设 binding 用 `user_id IS NULL` + `project_id IS NULL` 表示全局共享 — BaseRepository 的多租户过滤需特殊处理（或建专门 repo 方法 `findPresets()` 绕过 user_id 过滤）。

### Seed Migration

`src/core/database/migrations/seed-preset-digital-humans.ts`：

```ts
import type { DataSource } from 'typeorm'

const PRESETS: PresetDef[] = [
  // 商务 / 主播
  { id: 'preset_male_anchor_25', nameZh: '青年男主播', gender: '男', age: 25, race: 'east_asian',
    appearance: '清爽短发，正装衬衫，干净商务气质', styleAnchors: ['现代写实'], portraitId: null },
  { id: 'preset_female_anchor_24', nameZh: '青年女主播', gender: '女', age: 24, race: 'east_asian',
    appearance: '齐肩长发，温柔知性，淡妆', styleAnchors: ['现代写实'], portraitId: null },
  // 老人
  { id: 'preset_male_elder_65', nameZh: '老年男长者', gender: '男', age: 65, race: 'east_asian',
    appearance: '银白短发，慈祥有书卷气，戴老花镜', styleAnchors: ['现代写实'], portraitId: null },
  // ... 共 20 个：覆盖 男/女 × 少年/青年/中年/老年 × 商务/学院/古风/职场/休闲
]

export async function seedPresetDigitalHumans(ds: DataSource): Promise<void> {
  for (const p of PRESETS) {
    const exists = await ds.query(
      `SELECT 1 FROM character_bindings WHERE id = $1 LIMIT 1`,
      [p.id],
    )
    if (exists.length > 0) continue
    await ds.query(`
      INSERT INTO character_bindings
        (id, user_id, project_id, source_type, is_preset,
         standalone_name, override_appearance,
         standalone_description, gender, age, race, style_anchors,
         created_at, updated_at)
      VALUES ($1, NULL, NULL, 'preset_digital', true,
              $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
    `, [
      p.id,
      p.nameZh,
      p.appearance,
      p.appearance,                          // description = appearance（内置精简）
      p.gender,
      p.age,
      p.race,
      JSON.stringify(p.styleAnchors),
      Date.now(),
      Date.now(),
    ])
  }
  console.log(`[seed-preset-digital-humans] 插入 ${PRESETS.length} 个预设角色`)
}
```

### 形象图来源

每个预设角色配 1 张主图 + 3 张视角图（front / 3q_left / 3q_right），统一风格：
- 用 fal.ai Flux 一致性 prompt 生成（"clean studio background, professional headshot lighting, neutral expression"）
- 落到 `built-in-assets/preset-digital/` 目录（打包到 app；不进 user-data）
- 在 `seedPresetDigitalHumans` 之后调用 `seedPresetImages()` 把这些图作为 `asset_image` 行（`is_preset=true`）

### Service

`PresetDigitalHumanService.list()` — 返回所有 `source_type='preset_digital'` 的 binding；UI 展示时不显示编辑按钮（只读）。

用户从预设引用 → 走 P4.2 `createFromLibrary` 类似流程：在用户 project 内创建普通 binding（拷贝 snapshot）。

### UI

```
┌─ 创建新角色 ────────────────────────── ✕ ─┐
│  Tab：[✨ 自定义] [🎭 从内置形象] [📚 我的库] │
│                                              │
│  当前：🎭 从内置形象（20 个精选）             │
│                                              │
│  筛选：[年龄: 全部▼] [性别: 全部▼] [风格: ▼] │
│                                              │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                 │
│  │👤│ │👵│ │👨│ │👩│ │🧑│ ...              │
│  └──┘ └──┘ └──┘ └──┘ └──┘                  │
│  青年男 老年女 中年男 学院女 少年              │
│                                              │
│  选中后 [→ 引用到当前剧集]                    │
└──────────────────────────────────────────────┘
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 86 | `migrations/add-character-binding-preset.ts` | 加 is_preset 列 | 30 min |
| 87 | `migrations/seed-preset-digital-humans.ts` | 20 个预设 binding | 4 h |
| 88 | `migrations/seed-preset-images.ts` | 预设图 asset_image 行 | 2 h |
| 89 | `built-in-assets/preset-digital/*.jpg` | 80 张图（20×4） | 用脚本生成 + 人工审核 1 d |
| 90 | `lora/preset-digital.service.ts` | service.list / engagement 计数 | 2 h |
| 91 | IPC handler | 1 个 | 30 min |
| 92 | 资产创建 dialog 加 tab | UI | 4 h |

**工程量**：2 天

---

## P4.4 Agent / Skill 接入（v3 详细化）

### 问题

Episode Production 的能力（剧本生成 / 资产生成 / 三视图 / 派生 / 故事板预览）应该能被外部 Agent（Claude Code / Claude Desktop / 自建 Agent）调用。

### 接入方式

**1. MCP Server**（推荐，与 Claude Code 原生兼容）

新建 `src/agents/episode-production-mcp/server.ts`：

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({ name: 'episode-production', version: '1.0.0' })

// Skill 1: 生成角色三视图
server.tool('character-three-views', {
  description: '为指定角色生成正 / 侧 / 背三视图（一次推理）',
  inputSchema: {
    bindingId: { type: 'string', description: 'character_bindings.id' },
    baseImageId: { type: 'string', optional: true },
  },
}, async (input) => {
  const result = await callMainImageGenerator('generateThreeViews', input)
  return { content: [{ type: 'json', json: result }] }
})

// Skill 2: 派生变体
server.tool('derive-variant', { /* ... */ })

// Skill 3: 故事板预览
server.tool('storyboard-thumbnails', { /* ... */ })

// Skill 4-N: ...

const transport = new StdioServerTransport()
await server.connect(transport)
```

**2. HTTP REST API**（外部 Agent 用）

新建 `src/agents/episode-production-api/`，Express 路由：
```
POST /api/agents/character-three-views    → 调 service
POST /api/agents/derive-variant           → ...
GET  /api/agents/skills                   → 列出所有 skill 元数据
```

**鉴权**：API key（在用户设置→开发者→生成 key 中创建），Bearer token 验证。

### Skill 元数据 schema

每个 skill 用统一 yaml 描述（用于 MCP 自动注册 + REST 文档）：

```yaml
# src/agents/skills/character-three-views.yaml
name: character-three-views
displayName: 角色三视图
category: asset
description: 为指定角色生成正 / 侧 / 背三视图
inputSchema:
  type: object
  properties:
    bindingId:
      type: string
      description: character_bindings.id（角色 binding ID）
    baseImageId:
      type: string
      optional: true
      description: 基图 ID；不传时用默认主图
  required: [bindingId]
outputSchema:
  type: array
  items:
    $ref: '#/definitions/AssetImageEntity'
errors:
  - code: BINDING_NOT_FOUND
  - code: NO_MAIN_IMAGE
  - code: PROVIDER_UNAVAILABLE
rateLimitPerHour: 60
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 93 | `src/agents/episode-production-mcp/server.ts` | MCP server 实现 | 1 d |
| 94 | `src/agents/episode-production-api/index.ts` | HTTP API 路由 | 1 d |
| 95 | `src/agents/skills/*.yaml` | 6-10 个 skill 元数据 | 4 h |
| 96 | `src/agents/skills/registry.ts` | yaml 加载 + 调度 | 4 h |
| 97 | API key 实体 + repo + IPC + UI | 用户设置→开发者→生成 key | 1 d |
| 98 | 鉴权 middleware | bearer + rate limit | 4 h |
| 99 | 文档 `docs/agents/README.md` | API 使用文档 | 4 h |

**工程量**：3-5 天

### 风险

- MCP / HTTP 接入暴露内部 service 调用 — 需严格鉴权 + 限速 + 审计日志
- 外部调用产生的 LoRA 训练 / 视频生成成本要明确归属（按 user_id 计入 monthly quota）

---

## P4.5 视频解析（v3 详细化）

### 问题

用户给一段参考视频（短剧片段 / 演示带），希望反推出分镜表（景别 / 角度 / 运镜 / 时长 / 对白）作为骨架。

### Pipeline

```
用户上传视频 (5-180s, mp4/mov)
         │
         ▼
[ffmpeg-static] 抽帧
  - 镜头切换检测（scene detection；ffmpeg select='gt(scene,0.3)' filter）
  - 每个 shot 抽 3-5 关键帧
         │
         ▼
[VLM 批处理] 每 shot 关键帧组分析
  → 输出：{ shotType, cameraAngle, cameraMovement, durationSec, frameDescription, characters[], emotion }
         │
         ▼
[ffmpeg] 抽音频 → STT（语音识别）
  → 对白文本 + 时间码 → 关联到 shot
         │
         ▼
聚合到 ParsedShot[] → DB 落 reference_video_analyses 表
         │
         ▼
用户预览 + 编辑 → 一键导入到当前 episode_script 的 storyboards
```

### Schema

```ts
@Entity({ name: 'reference_video_analyses' })
@Index('idx_rva_user', ['userId'])
export class ReferenceVideoAnalysisEntity {
  @PrimaryColumn() id!: string
  @Index()
  @Column({ name: 'user_id', nullable: true }) userId!: string | null
  @Column({ name: 'video_path', type: 'text' }) videoPath!: string
  @Column({ name: 'video_duration_sec', type: 'real' }) videoDurationSec!: number
  @Column({ name: 'status', type: 'varchar' }) status!: 'pending'|'analyzing'|'ready'|'failed'
  @Column({ name: 'shots', type: 'simple-json', nullable: true })
  shots!: ParsedShot[] | null  // [{ shotType, cameraAngle, cameraMovement, ... }, ...]
  @Column({ name: 'created_at', type: 'bigint' }) createdAt!: number
  @Column({ name: 'updated_at', type: 'bigint' }) updatedAt!: number
}

interface ParsedShot {
  shotIndex: number
  startSec: number
  endSec: number
  durationSec: number
  shotType: string
  cameraAngle: string
  cameraMovement: string
  frameDescription: string
  emotion: string
  representativeFramePath: string  // 用于 UI 预览
  detectedDialogue: string | null
}
```

### Service

`ReferenceVideoAnalysisService`（主进程，依赖 ffmpeg-static + VLM）：

```ts
async analyze(input: { videoPath: string }): Promise<string /* analysisId */> {
  // 1. ffmpeg 检测镜头切换 → 拿到 shot 边界数组 [(start, end), ...]
  // 2. 每个 shot 抽 3 关键帧到 temp 目录
  // 3. 批量调 VLM（GVLM 3.1 Pro 等）— prompt 含 "分析以下镜头的景别 / 角度 / 运镜 / 时长 / ..."
  // 4. ffmpeg 抽音频 → 调 STT（Whisper / 通义千问 ASR）
  // 5. 聚合 → 落 reference_video_analyses 行
  // 6. 返回 analysisId（用户后续轮询状态 / 拉详情）
}

async importToEpisode(input: {
  analysisId: string
  episodeScriptId: string
}): Promise<{ storyboardIds: string[] }> {
  // 把 ParsedShot[] 转成 storyboards 行
  // 每个 ParsedShot → 一个 storyboard（含 metadata.referenceVideoShotIndex 反指原 shot）
}
```

### 技术依赖

- **ffmpeg-static**（主进程；npm 包）— 抽帧 + 镜头切换检测 + 抽音频
- **VLM provider**（GVLM 3.1 Pro / 通义千问 VL / 智谱 GLM-4V）— 复用现有 image gen provider 配置
- **STT provider**（Whisper / 通义千问 ASR）— 新接入

### IPC + UI

| Channel | 功能 |
|---|---|
| `ep:reference-video:upload-and-analyze` | 上传视频 + 启动分析 |
| `ep:reference-video:status` | 轮询状态 |
| `ep:reference-video:list` | 列出本用户分析过的视频 |
| `ep:reference-video:import-to-episode` | 一键导入到当前剧集 |
| `ep:reference-video:delete` | 删除分析记录 + 视频文件 |

UI 入口：① 内容 stage 顶部"📹 从参考视频导入"按钮 → 弹分析 dialog（上传 + 进度 + ParsedShot 表格预览 + 导入）。

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 100 | `migrations/add-reference-video-analyses.ts` | 新表 | 30 min |
| 101 | `entities/.../reference-video-analysis.entity.ts` | entity | 30 min |
| 102 | `repositories/reference-video-analysis.repository.ts` | repo | 30 min |
| 103 | `reference-video/analysis.service.ts` | service（含 ffmpeg + VLM 调度） | 1.5 d |
| 104 | `reference-video/ffmpeg-helpers.ts` | shot detection / frame extract / audio extract | 4 h |
| 105 | `reference-video/stt-providers/` | 2-3 个 STT adapter | 1 d |
| 106 | IPC handlers（5 个） + preload + channel-map | | 3 h |
| 107 | `ReferenceVideoImportDialog.vue` | 上传 + 分析 + 预览 + 导入 UI | 1 d |
| 108 | ① 内容 stage 加入口按钮 | | 30 min |

**工程量**：3-5 天

### 风险

- **VLM 准确率**：识别景别 / 运镜的准确率 60-80%（视模型而定）— UI 必须支持用户编辑修正
- **STT 成本**：长视频 STT 费用可观（Whisper $0.006/min）— 加 monthly quota
- **视频上传大小**：单文件 ≤ 200MB（前端校验）；超大需分块上传或转 url

---

# Phase 5 · 视频提取主体（1 周 · v3 详细化）

## P5.1 从短视频提取角色多视角图

### 问题

用户上传一段角色出场的短视频（5-30s，单一连续镜头），想从中自动提取多视角参考图（front / 3q_left / 3q_right / side / back / expressions），免去手动派生。

### Pipeline

```
用户上传视频 (5-30s)
         │
         ▼
[ffmpeg] 抽帧（每秒 4 帧 → 20-120 张帧）
         │
         ▼
[人脸检测] face-api.js 或 mediapipe → 拿到每帧的 face bbox + landmarks
         │
         ▼
[人脸 embedding] 用 face-api.js / insightface 抽 face descriptor
         │
         ▼
[一致性聚类] 相同人物的帧聚到一起（按 cosine similarity > 0.7）
  - 多人物视频 → 多个聚类
  - 用户在 UI 选要的那个聚类（"哪个是主角"）
         │
         ▼
[角度分类] landmarks → yaw/pitch 角度 → 分类到 front / 3q_left / 3q_right / side / back
         │
         ▼
[代表帧选择] 每个角度选最清晰的（按 face bbox area + 模糊度评分）
         │
         ▼
[一键写入 character binding]
  - 主图 = front 代表帧
  - view 类目 = 其他角度代表帧
```

### 技术依赖

- **ffmpeg-static**（同 P4.5）
- **人脸检测 + embedding + landmarks**：候选方案：
  - `face-api.js`（纯 JS，可主进程跑；模型 ~10MB）— 速度中等，准确率中等
  - `@vladmandic/face-api`（face-api.js fork，TypeScript 化 + 维护中）
  - InsightFace ONNX runtime（精度更高但需 onnxruntime-node 依赖；模型 ~50MB）
- **模糊度评分**：opencv 的 Laplacian variance 方法（OpenCV.js 或自实现）

**推荐**：先用 `@vladmandic/face-api`（轻 + 易集成），不够准的话升 InsightFace ONNX。

### Service

`src/core/modules/episode-production/video-extract/face-extract.service.ts`：

```ts
import * as faceapi from '@vladmandic/face-api'
import path from 'path'

export interface ExtractFacesInput {
  videoPath: string
  bindingId: string  // 提取后写入哪个 character binding
}

export interface ExtractedCluster {
  clusterId: string
  faceCount: number
  representativeFramePath: string  // 用户选哪个聚类时展示
  framesByAngle: {
    front: string | null
    threeQuarterLeft: string | null
    threeQuarterRight: string | null
    side: string | null
    back: string | null
  }
}

export class FaceExtractService {
  async extract(input: ExtractFacesInput): Promise<{
    clusters: ExtractedCluster[]   // 一般 1-3 个聚类
    tempSessionDir: string
  }> {
    // 1. ffmpeg 抽帧到 temp/face-extract/{ts}/frame-NNNN.jpg
    // 2. 加载 face-api.js 模型（懒加载）
    // 3. 每帧检测 face → embedding + landmarks
    // 4. embedding cosine similarity 聚类
    // 5. 每个聚类按 yaw/pitch 分类角度
    // 6. 每角度选模糊度最低（最清晰）的帧作代表
    // 7. 返回聚类列表（用户选）
  }

  async writeClusterToBinding(input: {
    cluster: ExtractedCluster
    bindingId: string
  }): Promise<{ mainImageId: string; viewImageIds: string[] }> {
    // 1. 拷代表帧到 user-data 资产目录
    // 2. front → asset_image (category='main', label='主图', isMain=1)
    // 3. 其他角度 → asset_image (category='view', label='3q_left' 等)
    // 4. 删 temp session 目录
  }
}
```

### Schema

不新建表 — 提取结果直接写入现有 `asset_image` 表。临时帧用 filesystem temp。

### IPC

| Channel | 功能 |
|---|---|
| `ep:video-extract:upload-and-detect` | 上传视频 + 检测聚类 → 返回 ExtractedCluster[] |
| `ep:video-extract:apply-cluster` | 用户选某个聚类 → 写入 binding |
| `ep:video-extract:cancel` | 取消（清理 temp） |

### UI

```
┌─ 从视频提取角色 ──────────────────── ✕ ─┐
│  上传视频：[选择文件]                       │
│  支持 mp4/mov，5-30s 单一连续镜头             │
│                                            │
│  [开始检测] → 进度条                        │
│                                            │
│  检测到 2 个不同人物，请选择要导入的：       │
│                                            │
│  ┌─ 聚类 1 (98 帧) ─┐  ┌─ 聚类 2 (24 帧) ─┐│
│  │  [代表帧大图]     │  │  [代表帧大图]     ││
│  │                   │  │                   ││
│  │  正面 ☑ 3q左 ☑    │  │  正面 ☑ 3q左 ☐   ││
│  │  3q右 ☑ 侧面 ☐    │  │  3q右 ☐ 侧面 ☐   ││
│  │  背面 ☐           │  │  背面 ☐           ││
│  │                   │  │                   ││
│  │  [✓ 用此聚类]     │  │  [使用]           ││
│  └───────────────────┘  └───────────────────┘│
└──────────────────────────────────────────────┘
```

### 文件修改清单

| # | 文件 | 改动 | 工程量 |
|---|---|---|---|
| 109 | `video-extract/face-extract.service.ts` | 主 service | 1.5 d |
| 110 | `video-extract/clustering.ts` | embedding + 聚类算法 | 1 d |
| 111 | `video-extract/angle-classifier.ts` | landmark → yaw/pitch → 角度 | 4 h |
| 112 | `video-extract/sharpness-scorer.ts` | Laplacian variance 模糊度 | 2 h |
| 113 | IPC handlers + preload + channel-map | | 2 h |
| 114 | `VideoFaceExtractDialog.vue` | UI（上传 + 进度 + 聚类选择） | 1 d |
| 115 | CharacterAssetEditorV2 加入口按钮 | | 30 min |
| 116 | face-api.js 模型文件（lazy 下载到 user-data 或打包） | | 2 h |

**工程量**：5-7 天

### 风险

- **face-api.js 准确率**：单视频中相似人物（同一种族 / 同妆容）容易混进同一聚类 — 需 UI 给用户校准
- **模型下载**：face-api.js 模型 ~10MB，建议打包入 app 而非 lazy 下载（避免国内网络问题）
- **角度分类的边界**：3q_left / side 之间过渡角度判定主观 — 用户可重选
- **隐私**：本地处理（不上传），不需上传到云端 — 这是相对 P4.5 的优势

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

# TDD 与测试策略（v3 新增）

CLAUDE.md 明确"采用 TDD 方式以测试驱动开发"。本设计的每个 commit 配套测试用例，按红 → 绿 → 重构循环：

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
  │  - prompt 装配（buildAssetIdentity） │
  │  - service（extractFields / lora）   │
  │  - constants 预设有效性              │
  │  - migration 幂等性                   │
  └──────────────────────────────────────┘
```

## 工具链

| 类型 | 工具 | 命令 |
|---|---|---|
| Unit | vitest（项目已有） | `npm test -- <pattern>` |
| Component | @vue/test-utils + happy-dom | `npm test -- <component>` |
| E2E | Playwright（已用于 web 端） | 单独 e2e 命令 |
| 类型 | vue-tsc | `npx vue-tsc --noEmit` |
| Migration 幂等 | vitest + 临时 SQLite | `npm test -- migrations/` |

## 每 commit 配套测试用例（按 commit 分配）

| Commit | 测试文件 | 关键测试用例 |
|---|---|---|
| **C1** 缩减约束 | `character-constraints.spec.ts` / `item-constraints.spec.ts` | suffix 长度 < 30 字；negative tokens < 5 个；调用点不变（snapshot） |
| **C2** metadata 解耦 | `asset-identity-prompt-v3-shrink.spec.ts`（见 Phase 1 验证） | character prompt 不含 alias/role；视觉字段保留；< 改前 70% |
| **C3** 透明度面板 | `GenerationDetailDialog.spec.ts` | 6 场景（已生成 / 旧数据 / 派生 / 主图 / 含 metadata / 无 metadata）；复制 button 可用 |
| **C4** 字段双层 | `CharacterCardFormV2.spec.ts` | 核心区可见；折叠区默认 collapsed；点折叠后展开；字段 binding 不变 |
| **C5** AI 字段提取 | `asset-setting-enrichment.spec.ts` + handler.spec | LLM 返回模拟 mock；jsonrepair 兜底；不覆盖已填字段；空描述 / 短描述 / 无配置错误 |
| **C6** 多角度参考图 | `main-image-generator.spec.ts` 加 generateThreeViews 用例 | 3 张落库；同 baseImageId derivedFrom；provider 不支持时降级 3 次串行 |
| **C7** 镜头语言层 | `lens-presets.spec.ts` / `camera-movements.spec.ts` / `lighting-presets.spec.ts` + `ShotDescriptionTemplate.spec.ts` | 预设值不重复；prompt hint 含中英；模板拼装结果格式正确 |
| **C8** 全局编号 | `storyboard-id.spec.ts` | 格式 EP01_S03_SH04；padStart；缺 episodeNumber 默认 EP01 |
| **C9** 多基图派生 | `gallery-derivation.spec.ts` 加用例 | baseImageIds[] 优先级 > baseImageId；多基图全部进 referenceImagePaths；derivedFromImageId = 第一张 |
| **C10** 9 帧故事板 | `storyboard-thumbnail-generator.spec.ts` | sharp 切片 9 个 ROI 尺寸正确；落地路径符合 temp/thumbnails/{scriptId}-{ts}/；降级路径（provider 不支持组合） |

## TDD 红绿循环（C1 示例）

```
1. 红：写 character-constraints.spec.ts，期望 IDENTITY_PRESERVATION_SUFFIX.length < 30
   → 跑 npm test → fail（当前 SUFFIX 是 100+ 字）

2. 绿：改 character-constraints.ts SUFFIX 为新 1 锚点版本
   → 跑 npm test → pass

3. 重构：把 SUFFIX / NEGATIVE 提取到 constants 顶部 + 加注释；保持测试 pass
```

## Migration 幂等性测试

每个新 migration 都配 `__tests__/<migration>.spec.ts`：

```ts
import { DataSource } from 'typeorm'
import { addLoRAModels } from '../add-lora-models'

describe('addLoRAModels', () => {
  it('首次运行创建表 + 索引', async () => {
    const ds = await createTestDataSource()  // helper：临时 SQLite
    await addLoRAModels(ds)
    const tables = await ds.query(`SELECT name FROM sqlite_master WHERE type='table'`)
    expect(tables.map(t => t.name)).toContain('lora_models')
  })

  it('表已存在时跳过（幂等）', async () => {
    const ds = await createTestDataSource()
    await addLoRAModels(ds)
    await addLoRAModels(ds)  // 不应抛错
    // 不应有重复索引
  })
})
```

## 视觉一致性回归测试（Phase 1 / 2）

不能完全自动化，但有半自动 framework：

```ts
// scripts/visual-regression/character-derivation.ts
import * as faceapi from '@vladmandic/face-api'

async function compareDerivation(beforeImage: string, afterImage: string): Promise<number> {
  const beforeDesc = await extractFaceDescriptor(beforeImage)
  const afterDesc = await extractFaceDescriptor(afterImage)
  return cosineSimilarity(beforeDesc, afterDesc)  // > 0.85 算未劣化
}
```

CI 跑不动（需要真实 GPU 调 image gen）— 改在 Phase 1 验证 checklist 里手动跑一次：
1. 选 3 个 character binding（含 1 个高难度：少数族裔 / 老人 / 戴眼镜）
2. 各跑 1 次 view 派生（改前 / 改后）
3. 计算 face descriptor cosine similarity
4. 期望均值 ≥ 0.85，无单个 < 0.7

记录到 `progress/2026-05-09-ep-redesign/phase-1-visual-regression.md`。

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
