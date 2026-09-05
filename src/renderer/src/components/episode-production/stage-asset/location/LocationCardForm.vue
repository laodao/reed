<template>
  <el-card class="location-card-form" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">📋 设定卡</span>
        <el-tag v-if="binding" :type="isLinkedLw ? 'primary' : 'warning'" size="small" effect="plain">
          {{ isLinkedLw ? 'linked_lw' : 'standalone' }}
        </el-tag>
      </div>
    </template>

    <el-form
      v-loading="loading"
      label-position="top"
      size="small"
      class="form-body"
      @submit.prevent
    >
      <!-- 名称 -->
      <el-form-item label="名称">
        <div v-if="isLinkedLw" class="lw-hint-row">
          <span class="lw-hint">基础值 (lw): {{ lwHintPlaceholder }}</span>
          <el-button text type="primary" @click="onToggleOverride('name')">
            {{ overrideEnabled.name ? '取消 override' : '+ override' }}
          </el-button>
        </div>
        <el-input
          v-model="form.name"
          placeholder="请输入地点名称"
          :disabled="isLinkedLw && !overrideEnabled.name"
        />
      </el-form-item>

      <!-- 描述 -->
      <el-form-item label="描述">
        <div v-if="isLinkedLw" class="lw-hint-row">
          <span class="lw-hint">基础值 (lw): {{ lwHintPlaceholder }}</span>
          <el-button text type="primary" @click="onToggleOverride('description')">
            {{ overrideEnabled.description ? '取消 override' : '+ override' }}
          </el-button>
        </div>
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          placeholder="请输入地点描述（环境 / 氛围 / 关键元素等）"
          :disabled="isLinkedLw && !overrideEnabled.description"
        />
      </el-form-item>

      <!-- 默认时间 -->
      <el-form-item label="默认时间">
        <el-select
          v-model="form.defaultTimeOfDay"
          placeholder="请选择默认时间"
          clearable
          class="select-full"
        >
          <el-option
            v-for="opt in TIME_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>

      <!-- 默认天气 -->
      <el-form-item label="默认天气">
        <el-select
          v-model="form.defaultWeather"
          placeholder="请选择默认天气"
          clearable
          class="select-full"
        >
          <el-option
            v-for="opt in WEATHER_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>

      <!-- 保存按钮 -->
      <div class="form-footer">
        <el-button type="success" :loading="saving" @click="onSave">
          保存
        </el-button>
      </div>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 地点设定卡表单（P3a Task 13）
 * @module renderer/components/episode-production/stage-asset/location/LocationCardForm
 * @description 地点 binding 的设定卡 UI：
 *   - linked_lw 模式：name / description 字段配 lw 基础值占位 + override 切换按钮；
 *   - standalone 模式：name / description 直接可编辑；
 *   - 默认时间 / 天气：select 下拉，本地保存到 form 但目前 IPC 无对应 setter。
 *
 * IPC 注意：
 *   - api.location.get(id) 返回 IpcResponse，需 .data；
 *   - lw 上游字段 IPC 暂未暴露，本 task 先写占位 "(lw 基础值待 IPC 接入)"；
 *   - defaultTimeOfDay / defaultWeather 当前没有对应 IPC update 方法
 *     （entity 字段 timeOfDay / weather，但 service 没写 setter），
 *     TODO 后续 task 加 service setter 后再持久化。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  LOCATION_TIME_VARIANTS,
  LOCATION_WEATHER_VARIANTS,
} from '@core/platform/episode-production/assets/constants/location-variants'

const props = defineProps<{ bindingId: string }>()
const emit = defineEmits<{ saved: [] }>()

interface OptionDef {
  value: string
  label: string
}

// 时间 / 天气选项 — 从 core 共享常量派生（避免与 LocationGalleryEditor / 派生器分叉）
const TIME_OPTIONS: OptionDef[] = LOCATION_TIME_VARIANTS.map((v) => ({
  value: v.value,
  label: `${v.cn} ${v.value}`,
}))
const WEATHER_OPTIONS: OptionDef[] = LOCATION_WEATHER_VARIANTS.map((v) => ({
  value: v.value,
  label: `${v.cn} ${v.value}`,
}))

const loading = ref(false)
const saving = ref(false)
const binding = ref<any>(null)

const form = reactive({
  name: '',
  description: '',
  defaultTimeOfDay: null as string | null,
  defaultWeather: null as string | null,
})

const overrideEnabled = reactive({
  name: false,
  description: false,
})

const isLinkedLw = computed(() => binding.value?.sourceType === 'linked_lw')

// lw 基础值占位：实际 lw 字段 IPC 暂未暴露（location_asset.service 内部用了 lw repo
// 但 IPC 只透传 binding 与 effective），effective 已合并 override 不能用作"基础值显示"。
// 留 P3a-final / P3b 接入真实 lw 字段查询 IPC。
const lwHintPlaceholder = '(lw 基础值待 IPC 接入)'

function getApi() {
  return (window as any).electronAPI?.episodeProduction?.asset
}

async function load() {
  const api = getApi()
  if (!api) return
  if (!props.bindingId) return
  loading.value = true
  try {
    const resp = await api.location.get(props.bindingId)
    if (!resp || !resp.success) {
      ElMessage.error(resp?.error || '加载地点失败')
      binding.value = null
    } else {
      binding.value = resp.data
      hydrateFromBinding(resp.data)
    }
  } catch (e: any) {
    console.error('[LocationCardForm] load 失败', e)
    ElMessage.error(e?.message || '加载地点失败')
  } finally {
    loading.value = false
  }
}

function hydrateFromBinding(b: any) {
  if (!b) {
    form.name = ''
    form.description = ''
    form.defaultTimeOfDay = null
    form.defaultWeather = null
    overrideEnabled.name = false
    overrideEnabled.description = false
    return
  }

  if (b.sourceType === 'linked_lw') {
    overrideEnabled.name = b.overrideName !== null && b.overrideName !== undefined
    overrideEnabled.description = b.overrideDescription !== null && b.overrideDescription !== undefined
    form.name = b.overrideName ?? ''
    form.description = b.overrideDescription ?? ''
  } else {
    // standalone 模式：name/description 用 standalone* 字段
    form.name = b.standaloneName ?? ''
    form.description = b.standaloneDescription ?? ''
    overrideEnabled.name = true
    overrideEnabled.description = true
  }

  form.defaultTimeOfDay = b.timeOfDay ?? null
  form.defaultWeather = b.weather ?? null
}

function onToggleOverride(field: 'name' | 'description') {
  overrideEnabled[field] = !overrideEnabled[field]
  if (!overrideEnabled[field]) {
    // 取消 override 时清空对应字段（保存时会下发 null）
    form[field] = ''
  }
}

async function onSave() {
  const api = getApi()
  if (!api) {
    ElMessage.error('IPC 桥未就绪')
    return
  }
  if (!binding.value) return

  saving.value = true
  try {
    if (isLinkedLw.value) {
      const overridePayload = {
        name: overrideEnabled.name ? form.name : null,
        description: overrideEnabled.description ? form.description : null,
      }
      const resp = await api.location.updateOverride(props.bindingId, overridePayload)
      if (!resp || !resp.success) {
        ElMessage.error(resp?.error || '保存 override 失败')
        return
      }
    } else {
      const resp = await api.location.updateStandalone(props.bindingId, {
        name: form.name,
        description: form.description,
      })
      if (!resp || !resp.success) {
        ElMessage.error(resp?.error || '保存 standalone 失败')
        return
      }
    }

    // TODO: 默认 time/weather 持久化待 service 加 setter
    // 当前 LocationBindingEntity 已有 timeOfDay / weather 字段，
    // 但 location-asset.service 没有暴露对应 IPC 更新方法。
    // 留 P3a-final 或 P3b 接入 service setter + IPC handler 后再持久化。

    ElMessage.success('已保存')
    emit('saved')
  } catch (e: any) {
    console.error('[LocationCardForm] save 失败', e)
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => props.bindingId, load)

defineExpose({ reload: load })
</script>

<style scoped>
.location-card-form {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.location-card-form :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--el-text-color-primary);
}

.header-title {
  font-weight: 600;
  font-size: 14px;
}

.form-body {
  padding-top: 4px;
}

.lw-hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
}

.lw-hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-full {
  width: 100%;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
</style>
