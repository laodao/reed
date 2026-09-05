<template>
  <!--
    LocationCardFormV2 · 地点设定卡

    spec 2026-05-09 ep-redesign §3.2 B1 双层 UI 重构：
      ⭐ 生成核心（始终展开）：视觉特征 / 氛围 / 默认时间 / 默认天气 / 描述 / 风格 / 参考图 + ✨ AI 自动填按钮占位
      ▼ 叙事元数据（el-collapse 默认折叠）：名称 / 类型 / 规模

    保留 360 全景独立 section（spec §5.C 6 节）。
    字段绑定 / onChange 信号 / props 接口零改动；仅模板层重排。
  -->
  <div class="card-form-v2">
    <h3 class="form-title">📋 设定卡</h3>

    <!-- ⭐ 生成核心区 -->
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
          title="从视觉特征中 AI 提取类型 / 规模 / 氛围 / 时间天气 / 风格（不覆盖已填字段）"
          @click="onExtractFields"
        >
          ✨ AI 自动填
        </el-button>
      </div>

      <!-- 视觉特征 -->
      <div class="field-block">
        <div class="field-label">
          视觉特征（核心）
          <span v-if="isLw" class="lw-hint">基础值来自长文</span>
        </div>
        <el-input
          v-model="form.baseDescription"
          type="textarea"
          :rows="3"
          placeholder="木质横梁 · 暖色灯笼 · 青花瓷茶具 · 水墨屏风 · 临窗八仙桌"
          @input="onChange('baseDescription', form.baseDescription, form.baseDescription !== initial.baseDescription)"
        />
      </div>

      <!-- 描述 -->
      <el-form label-width="80px" size="small" label-position="left">
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            :placeholder="isLw ? '空 = 用长文描述' : '一句话描述这个地点'"
            @input="onChange('description', form.description, form.description !== initial.description)"
          />
        </el-form-item>

        <!-- 氛围 -->
        <el-form-item label="氛围">
          <el-select
            v-model="form.moodTags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="如：温馨 / 古朴 / 市井烟火（按回车添加）"
            class="full-width"
            @change="onChange('moodTags', form.moodTags, !arraysEqual(form.moodTags, initial.moodTags))"
          />
        </el-form-item>

        <!-- 风格 -->
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

        <!-- 默认时间 / 默认天气 -->
        <el-form-item label="默认时间">
          <el-select
            v-model="form.timeOfDay"
            placeholder="如：黄昏"
            clearable
            class="full-width"
            @change="onChange('timeOfDay', form.timeOfDay, form.timeOfDay !== initial.timeOfDay)"
          >
            <el-option label="morning 清晨" value="morning" />
            <el-option label="noon 正午" value="noon" />
            <el-option label="afternoon 下午" value="afternoon" />
            <el-option label="evening 黄昏" value="evening" />
            <el-option label="night 夜晚" value="night" />
            <el-option label="dawn 拂晓" value="dawn" />
            <el-option label="dusk 暮色" value="dusk" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认天气">
          <el-select
            v-model="form.weather"
            placeholder="如：阴天"
            clearable
            class="full-width"
            @change="onChange('weather', form.weather, form.weather !== initial.weather)"
          >
            <el-option label="sunny 晴" value="sunny" />
            <el-option label="cloudy 阴" value="cloudy" />
            <el-option label="rainy 雨" value="rainy" />
            <el-option label="snowy 雪" value="snowy" />
            <el-option label="foggy 雾" value="foggy" />
            <el-option label="stormy 暴风雨" value="stormy" />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 参考图 -->
      <div class="field-block">
        <ReferenceImageField
          asset-type="location"
          :binding-id="binding?.id"
          :model-value="form.referenceImagePath"
          @update:model-value="onReferenceImageChange"
        />
      </div>
    </section>

    <!-- ▼ 叙事元数据 -->
    <el-collapse class="metadata-collapse">
      <el-collapse-item name="metadata">
        <template #title>
          <span class="metadata-title">▼ 叙事元数据</span>
          <span class="metadata-hint">— 名称 / 类型 / 规模</span>
        </template>

        <el-form label-width="60px" size="small" label-position="left">
          <el-form-item label="名称">
            <el-input
              v-model="form.name"
              :placeholder="isLw ? '空 = 用长文名称' : '请输入地点名'"
              @input="onChange('name', form.name, form.name !== initial.name)"
            />
          </el-form-item>
          <el-form-item label="类型">
            <el-select
              v-model="form.locationType"
              placeholder="选择场景类型"
              clearable
              class="full-width"
              @change="onChange('locationType', form.locationType, form.locationType !== initial.locationType)"
            >
              <el-option label="interior 内景" value="interior" />
              <el-option label="exterior 外景" value="exterior" />
              <el-option label="mixed 混合" value="mixed" />
              <el-option label="fantasy 奇幻" value="fantasy" />
              <el-option label="urban 都市" value="urban" />
              <el-option label="rural 乡村" value="rural" />
            </el-select>
          </el-form-item>
          <el-form-item label="规模">
            <el-select
              v-model="form.scale"
              placeholder="如：小 / 中 / 大 / 巨大"
              clearable
              class="full-width"
              @change="onChange('scale', form.scale, form.scale !== initial.scale)"
            >
              <el-option label="小（容纳 ~5 人）" value="小" />
              <el-option label="中（容纳 ~30 人）" value="中" />
              <el-option label="大（容纳 ~100 人）" value="大" />
              <el-option label="巨大（开放 / 无限）" value="巨大" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>

    <!-- 360 全景区（独立保留） -->
    <section class="form-section last panorama-section">
      <div class="section-label">🌐 360 全景图（panorama_360）</div>
      <p class="section-body">
        本 phase 主流程：AI 生成或上传 360 全景 → 视角截图给分镜当背景 ref →
        同场景多分镜背景 3D 一致。详见右栏。
      </p>
      <p class="section-body phase8-hint">
        🎲 3D 摆位场景（更精准）— Phase 8 实现，本 phase 不启用
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { STYLE_PRESETS } from '@core/platform/episode-production/assets/constants/style-presets'
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

const form = reactive<{
  name: string
  description: string
  locationType: string | null
  scale: string | null
  baseDescription: string
  moodTags: string[]
  timeOfDay: string | null
  weather: string | null
  styleAnchors: string[]
  /** spec 2026-05-09 参考图相对路径 */
  referenceImagePath: string | null
}>({
  name: '',
  description: '',
  locationType: null,
  scale: null,
  baseDescription: '',
  moodTags: [],
  timeOfDay: null,
  weather: null,
  styleAnchors: [],
  referenceImagePath: null,
})

const initial = ref<any>({})

watch(
  () => props.binding,
  (b) => {
    if (!b) return
    const isLwBinding = b.sourceType === 'linked_lw'
    form.name = (isLwBinding ? b.overrideName : b.standaloneName) ?? b.locationName ?? ''
    form.description =
      (isLwBinding ? b.overrideDescription : b.standaloneDescription) ?? ''
    form.locationType = b.locationType ?? null
    form.scale = b.scale ?? null
    form.baseDescription = b.baseDescription ?? ''
    form.moodTags = parseJsonArray(b.moodTags)
    form.timeOfDay = b.timeOfDay ?? null
    form.weather = b.weather ?? null
    form.styleAnchors = parseJsonArray(b.styleAnchors)
    form.referenceImagePath = b.referenceImagePath ?? null
    initial.value = {
      ...form,
      moodTags: [...form.moodTags],
      styleAnchors: [...form.styleAnchors],
    }
  },
  { immediate: true, deep: true },
)

function onChange(key: string, value: any, dirty: boolean): void {
  emit('change', { key, value, dirty })
}

function onReferenceImageChange(newPath: string | null): void {
  form.referenceImagePath = newPath
  // dirty=false：子组件已通过 setReferenceImage IPC 立即落库
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
  !extracting.value && (form.baseDescription ?? '').trim().length >= 10,
)

async function onExtractFields(): Promise<void> {
  const desc = (form.baseDescription ?? '').trim()
  if (desc.length < 10) {
    ElMessage.warning('视觉特征太短（建议至少 10 字）')
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
      assetType: 'location',
      description: desc,
      projectId,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || 'AI 提取失败')
      return
    }
    const data = resp.data ?? {}
    let count = 0
    if (data.name && !form.name) {
      form.name = data.name
      onChange('name', data.name, true)
      count++
    }
    if (data.description && !form.description) {
      form.description = data.description
      onChange('description', data.description, true)
      count++
    }
    if (data.locationType && !form.locationType) {
      form.locationType = data.locationType
      onChange('locationType', data.locationType, true)
      count++
    }
    if (data.scale && !form.scale) {
      form.scale = data.scale
      onChange('scale', data.scale, true)
      count++
    }
    if (Array.isArray(data.moodTags) && data.moodTags.length > 0 && form.moodTags.length === 0) {
      form.moodTags = data.moodTags
      onChange('moodTags', form.moodTags, true)
      count++
    }
    if (data.timeOfDay && !form.timeOfDay) {
      form.timeOfDay = data.timeOfDay
      onChange('timeOfDay', data.timeOfDay, true)
      count++
    }
    if (data.weather && !form.weather) {
      form.weather = data.weather
      onChange('weather', data.weather, true)
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
}

.form-section.last {
  padding-bottom: 4px;
}

.form-section.panorama-section {
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  padding: 12px;
  margin: 0 -4px -4px;
  border-top: none;
}

.core-section {
  background: var(--el-color-primary-light-9);
  border-radius: 4px;
  padding: 12px;
  border-top: none;
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

.section-label {
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

.section-body {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.phase8-hint {
  border-top: 1px dashed var(--el-border-color);
  padding-top: 6px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.full-width {
  width: 100%;
}

.hint-tertiary {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
</style>
