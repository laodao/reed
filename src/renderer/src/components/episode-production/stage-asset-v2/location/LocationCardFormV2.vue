<template>
  <!--
    LocationCardFormV2 · 地点设定卡（FU5-C3 / 原型 §5.C 6 节）

    严格按对照表 §5 6 节实施：
      ① 基础（名称 / 类型 / 规模 / 描述）
      ② 视觉特征（自由文字 + 来自长文 + override）
      ③ 氛围 tags
      ④ 变体维度（默认时间 / 默认天气 / 季节占位）
      ⑤ 风格锚点 tags
      ⑥ 360 全景 + 3D 升级提示
  -->
  <div class="card-form-v2">
    <h3 class="form-title">📋 设定卡</h3>

    <!-- ① 基础 -->
    <section class="form-section">
      <div class="section-label">基础</div>
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
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            :placeholder="isLw ? '空 = 用长文描述' : '一句话描述这个地点'"
            @input="onChange('description', form.description, form.description !== initial.description)"
          />
        </el-form-item>
      </el-form>
    </section>

    <!-- ② 视觉特征 -->
    <section class="form-section">
      <div class="section-label">
        视觉特征
        <span v-if="isLw" class="lw-hint">基础值来自长文</span>
      </div>
      <el-input
        v-model="form.baseDescription"
        type="textarea"
        :rows="3"
        placeholder="木质横梁 · 暖色灯笼 · 青花瓷茶具 · 水墨屏风 · 临窗八仙桌"
        @input="onChange('baseDescription', form.baseDescription, form.baseDescription !== initial.baseDescription)"
      />
    </section>

    <!-- ③ 氛围 -->
    <section class="form-section">
      <div class="section-label">氛围</div>
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
    </section>

    <!-- ④ 变体维度 -->
    <section class="form-section">
      <div class="section-label">变体维度</div>
      <el-form label-width="80px" size="small" label-position="left">
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
        <el-form-item label="支持季节">
          <span class="hint-tertiary">（暂不启用，本 phase 不实现）</span>
        </el-form-item>
      </el-form>
    </section>

    <!-- ⑤ 风格锚点 -->
    <section class="form-section">
      <div class="section-label">风格锚点</div>
      <el-select
        v-model="form.styleAnchors"
        multiple
        filterable
        allow-create
        default-first-option
        placeholder="如：工笔国风 / 水墨 / 微写实"
        class="full-width"
        @change="onChange('styleAnchors', form.styleAnchors, !arraysEqual(form.styleAnchors, initial.styleAnchors))"
      />
    </section>

    <!-- ⑥ 360 全景 + 3D 升级提示 -->
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
