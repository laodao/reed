<template>
  <!--
    CharacterCardFormV2 · 角色设定卡

    spec 2026-05-09 ep-redesign §3.2 B1 双层 UI 重构：
      ⭐ 生成核心（始终展开）：人物描述 / 风格 / 性别 / 年龄 / 人种 / 参考图 + ✨ AI 自动填按钮占位
      ▼ 叙事元数据（el-collapse 默认折叠）：姓名 / 别名 / 定位 / 声音 / 形象库
        提示："仅用于剧本调度 / 配音；不进图像生成"

    双母语：
      大众用户：默认看到的就是关键字段，无视折叠区也能完成创建
      专业用户：折叠区有姓名 / 别名 / 定位 / 声音 / 形象库 — 满足 character bible 完整性

    每个字段独立 onChange → emit('change', { key, value, dirty })，
    父组件 EditorV2 收集成 patch 一次性提交（按 IPC 类型分发）。
    字段绑定 / onChange 信号 / props 接口零改动；仅模板层重排。
  -->
  <div class="card-form-v2">
    <h3 class="form-title">📋 设定卡</h3>

    <!-- ⭐ 生成核心区（始终展开） — 决定 AI 生成质量的字段 -->
    <section class="form-section core-section">
      <div class="core-header">
        <span class="core-label">⭐ 生成核心</span>
        <span class="core-hint">— 决定 AI 生成质量</span>
        <span class="header-spacer" />
        <el-button
          size="small"
          type="primary"
          plain
          :loading="extracting"
          :disabled="!canExtract"
          title="从人物描述中 AI 提取性别 / 年龄 / 人种 / 风格（不覆盖已填字段）"
          @click="onExtractFields"
        >
          ✨ AI 自动填
        </el-button>
      </div>

      <!-- 人物描述（核心字段） -->
      <div class="field-block">
        <div class="field-label">
          人物描述（核心）
          <span v-if="isLw" class="lw-hint">基础值来自长文</span>
        </div>
        <el-input
          v-model="form.appearance"
          type="textarea"
          :rows="6"
          :placeholder="
            isLw
              ? '留空 = 用长文描述；填写 = override（仅本剧集生效）。可包含外貌（身高/五官/发型/眼色/标志特征）+ 服装（默认 / 备选）+ 任何其他描述。'
              : '可包含外貌（身高 · 身材 · 五官 · 发型 · 眼色 · 标志特征）+ 服装（默认 / 备选）+ 性格 / 标签 等任何描述。'
          "
          @input="onChange('appearance', form.appearance, form.appearance !== initial.appearance)"
        />
      </div>

      <!-- 风格 -->
      <el-form label-width="60px" size="small" label-position="left">
        <el-form-item label="风格">
          <el-select
            v-model="form.styleAnchors"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入主流风格（多选；按回车自定义）"
            class="full-width"
            @change="onChange('styleAnchors', form.styleAnchors, !arraysEqual(form.styleAnchors, initial.styleAnchors))"
          >
            <el-option v-for="s in STYLE_PRESETS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>

        <!-- 性别 / 年龄 / 人种 -->
        <el-form-item label="性别">
          <el-radio-group
            v-model="form.gender"
            @change="onChange('gender', form.gender, form.gender !== initial.gender)"
          >
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
            <el-radio value="其他">其他</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="年龄">
          <el-input-number
            v-model="form.age"
            :min="0"
            :max="200"
            :placeholder="undefined"
            @change="onChange('age', form.age, form.age !== initial.age)"
          />
        </el-form-item>
        <el-form-item label="人种">
          <el-input
            v-model="form.race"
            placeholder="如：东亚 / 欧洲 / 半人马 / 自定义种族"
            clearable
            class="full-width"
            @input="onChange('race', form.race, form.race !== initial.race)"
            @clear="onChange('race', null, initial.race !== null)"
          />
        </el-form-item>
      </el-form>

      <!-- 参考图（spec 2026-05-09）— 主图生成时作为 AI reference -->
      <div class="field-block">
        <ReferenceImageField
          asset-type="character"
          :binding-id="binding?.id"
          :model-value="form.referenceImagePath"
          @update:model-value="onReferenceImageChange"
        />
      </div>
    </section>

    <!-- ▼ 叙事元数据（默认折叠） — 仅用于剧本调度 / 配音；不进图像生成 -->
    <el-collapse class="metadata-collapse">
      <el-collapse-item name="metadata">
        <template #title>
          <span class="metadata-title">▼ 叙事元数据</span>
          <span class="metadata-hint">— 仅用于剧本调度 / 配音；不进图像生成</span>
        </template>

        <el-form label-width="60px" size="small" label-position="left">
          <!-- 姓名 / 别名 / 定位 -->
          <el-form-item label="姓名">
            <el-input
              v-model="form.name"
              :placeholder="isLw ? '空 = 用长文姓名' : '请输入姓名'"
              @input="onChange('name', form.name, form.name !== initial.name)"
            />
          </el-form-item>
          <el-form-item label="别名">
            <el-input
              v-model="form.alias"
              placeholder="如：三爷 / 浪剑客（多个用 / 分隔）"
              @input="onChange('alias', form.alias, form.alias !== initial.alias)"
            />
          </el-form-item>
          <el-form-item label="定位">
            <el-select
              v-model="form.role"
              placeholder="选择定位"
              clearable
              @change="onChange('role', form.role, form.role !== initial.role)"
            >
              <el-option label="主角" value="主角" />
              <el-option label="配角" value="配角" />
              <el-option label="反派" value="反派" />
              <el-option label="旁白" value="旁白" />
              <el-option label="群演" value="群演" />
            </el-select>
          </el-form-item>
          <!-- 声音 -->
          <el-form-item label="音色">
            <el-select
              v-model="form.voiceId"
              placeholder="选择音色"
              clearable
              class="full-width"
              @change="onChange('voiceId', form.voiceId, form.voiceId !== initial.voiceId)"
            >
              <el-option
                v-for="v in availableVoices"
                :key="v.id"
                :label="v.name"
                :value="v.id"
              />
            </el-select>
          </el-form-item>
        </el-form>

        <!-- 形象库 portrait_id -->
        <div class="portrait-row">
          <span class="metadata-sub-label">形象库：</span>
          <el-tag v-if="form.portraitId" type="info" size="small">
            已绑定 portrait: {{ form.portraitId }}
          </el-tag>
          <span v-else class="hint-tertiary">未绑定 — 主图由本剧集独立生成</span>
          <el-button
            size="small"
            @click="onSelectPortrait"
          >
            {{ form.portraitId ? '更换' : '选择' }} portrait
          </el-button>
          <el-button
            v-if="form.portraitId"
            size="small"
            type="danger"
            plain
            @click="onClearPortrait"
          >
            解绑
          </el-button>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { STYLE_PRESETS } from '@core/modules/episode-production/assets/constants/style-presets'
import ReferenceImageField from '../shared/ReferenceImageField.vue'

export interface FormChangePayload {
  key: string
  value: any
  dirty: boolean
}

const props = defineProps<{
  binding: any
}>()

const emit = defineEmits<{
  (e: 'change', payload: FormChangePayload): void
}>()

const isLw = computed(() => props.binding?.sourceType === 'linked_lw')

// spec 2026-05-08 v3：UI 不再暴露 outfit / outfitsExtra；entity 上的旧字段保持向后兼容
// 但本表单不读、不写、不 emit 这两 key（旧数据 prompt builder 见空就跳过）。
const form = reactive<{
  name: string
  alias: string
  role: string | null
  gender: string | null
  age: number | null
  race: string | null
  appearance: string
  voiceId: string | null
  voiceSpeed: number
  voicePitch: number
  voiceEmotion: string | null
  styleAnchors: string[]
  portraitId: string | null
  /** spec 2026-05-09：用户上传的参考图相对路径（主图生成 reference） */
  referenceImagePath: string | null
}>({
  name: '',
  alias: '',
  role: null,
  gender: null,
  age: null,
  race: null,
  appearance: '',
  voiceId: null,
  voiceSpeed: 1.0,
  voicePitch: 0,
  voiceEmotion: null,
  styleAnchors: [],
  portraitId: null,
  referenceImagePath: null,
})

const initial = ref<any>({})

const availableVoices = ref<Array<{ id: string; name: string }>>([])

watch(
  () => props.binding,
  (b) => {
    if (!b) return
    const isLwBinding = b.sourceType === 'linked_lw'
    form.name = (isLwBinding ? b.overrideName : b.standaloneName) ?? ''
    form.alias = b.alias ?? ''
    form.role = b.role ?? null
    form.gender = b.gender ?? null
    form.age = b.age ?? null
    form.race = b.race ?? null
    form.appearance =
      (isLwBinding ? b.overrideAppearance : b.standaloneDescription) ?? ''
    form.voiceId = b.voiceId ?? null
    form.voiceSpeed = b.voiceSpeed ?? 1.0
    form.voicePitch = b.voicePitch ?? 0
    form.voiceEmotion = b.voiceEmotion ?? null
    form.styleAnchors = parseJsonArray(b.styleAnchors)
    form.portraitId = b.portraitId ?? null
    form.referenceImagePath = b.referenceImagePath ?? null
    initial.value = { ...form, styleAnchors: [...form.styleAnchors] }
  },
  { immediate: true, deep: true },
)

onMounted(async () => {
  try {
    const resp = await window.electronAPI.episodeProduction.asset.voice.listReady()
    if (resp?.success && Array.isArray(resp.data)) {
      availableVoices.value = resp.data.map((v: any) => ({ id: v.id, name: v.name }))
    }
  } catch (e) {
    console.warn('[CharacterCardFormV2] 加载音色列表失败', e)
  }
})

function onChange(key: string, value: any, dirty: boolean): void {
  emit('change', { key, value, dirty })
}

function onSelectPortrait(): void {
  ElMessage.info('选择 portrait 入口 — 留 follow-up 接 portrait picker')
}

function onClearPortrait(): void {
  form.portraitId = null
  onChange('portraitId', null, initial.value.portraitId !== null)
}

/**
 * 参考图上传 / 清除完成回调：
 * 子组件已通过 setReferenceImage IPC 直接落库，这里只把本地 form 同步上，
 * 并 emit 一个 change 给父组件做必要刷新（不需要再二次走 patch 流程）。
 */
function onReferenceImageChange(newPath: string | null): void {
  form.referenceImagePath = newPath
  // dirty=false：已立即落库，没有"待保存"语义
  emit('change', { key: 'referenceImagePath', value: newPath, dirty: false })
}

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// ===== AI 正向字段提取（spec 2026-05-09 ep-redesign §3.2 B2） =====
const extracting = ref(false)
const canExtract = computed(() =>
  !extracting.value && (form.appearance ?? '').trim().length >= 10,
)

async function onExtractFields(): Promise<void> {
  const desc = (form.appearance ?? '').trim()
  if (desc.length < 10) {
    ElMessage.warning('描述太短（建议至少 10 字）')
    return
  }
  const projectId: string | undefined = props.binding?.projectId
  if (!projectId) {
    ElMessage.warning('当前没有项目上下文，无法调用 AI 提取')
    return
  }
  extracting.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.extractFields) {
      ElMessage.error('extractFields IPC 未暴露（请重启）')
      return
    }
    const resp = await api.extractFields({
      assetType: 'character',
      description: desc,
      projectId,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || 'AI 提取失败')
      return
    }
    const data = resp.data ?? {}
    let count = 0
    // 不覆盖用户已填字段
    if (data.name && !form.name) {
      form.name = data.name
      onChange('name', data.name, true)
      count++
    }
    if (data.gender && !form.gender) {
      form.gender = data.gender
      onChange('gender', data.gender, true)
      count++
    }
    if (data.age != null && form.age == null) {
      form.age = data.age
      onChange('age', data.age, true)
      count++
    }
    if (data.race && !form.race) {
      form.race = data.race
      onChange('race', data.race, true)
      count++
    }
    if (Array.isArray(data.styleAnchors) && data.styleAnchors.length > 0 && form.styleAnchors.length === 0) {
      form.styleAnchors = data.styleAnchors
      onChange('styleAnchors', form.styleAnchors, true)
      count++
    }
    if (count === 0) {
      ElMessage.info('AI 未从描述中提取到新字段（可能字段已填或描述不够具体）')
    } else {
      ElMessage.success(`已自动填 ${count} 个字段，请确认或修改`)
    }
  } catch (e: any) {
    ElMessage.error('AI 提取异常：' + (e?.message ?? String(e)))
  } finally {
    extracting.value = false
  }
}
</script>

<style scoped lang="scss">
.card-form-v2 {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.form-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.form-section {
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);

  &:first-of-type {
    padding-top: 0;
    border-top: none;
  }

  &.last {
    padding-bottom: 4px;
  }
}

.core-section {
  background: var(--el-color-primary-light-9);
  border-radius: 4px;
  padding: 12px;
}

.core-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.core-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.core-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.header-spacer {
  flex: 1;
}

.field-block {
  margin-bottom: 12px;
}

.field-label {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  letter-spacing: 0.05em;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.lw-hint {
  font-size: 10px;
  color: var(--el-color-primary);
}

.metadata-collapse {
  border: none;
  background: transparent;

  :deep(.el-collapse-item__header) {
    background: transparent;
    padding-left: 4px;
  }

  :deep(.el-collapse-item__content) {
    padding-bottom: 0;
  }
}

.metadata-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.metadata-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-left: 6px;
}

.metadata-sub-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}

.full-width {
  width: 100%;
}

.portrait-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.hint-tertiary {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
</style>
