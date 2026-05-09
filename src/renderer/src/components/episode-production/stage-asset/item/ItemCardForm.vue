<template>
  <el-card class="item-card-form" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">📋 设定卡</span>
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
          placeholder="请输入物品名称"
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
          placeholder="请输入物品描述（外观 / 用途 / 关键特征等）"
          :disabled="isLinkedLw && !overrideEnabled.description"
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
        >
          <el-option v-for="s in STYLE_PRESETS" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>

      <!-- 参考图（spec 2026-05-09）— 主图生成时作为 AI reference -->
      <el-form-item>
        <ReferenceImageField
          asset-type="item"
          :binding-id="binding?.id"
          :model-value="form.referenceImagePath"
          @update:model-value="onReferenceImageChange"
        />
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
 * 物品设定卡表单（P3a Task 14）
 * @module renderer/components/episode-production/stage-asset/item/ItemCardForm
 * @description 物品 binding 的设定卡 UI：
 *   - linked_lw 模式：name / description 字段配 lw 基础值占位 + override 切换按钮；
 *   - standalone 模式：name / description 直接可编辑；
 *   - 物品没有 voice / portrait / appearance / outfit / time / weather 字段，
 *     只有 name 与 description 是核心可编辑项；
 *   - baseDescription / styleReference / additionalPrompts 等技术字段
 *     由 prompt 渲染域内部使用，本设定卡不暴露。
 *
 * IPC 注意：
 *   - api.item.get(id) 返回 IpcResponse，需 .data；
 *   - lw 上游字段 IPC 暂未暴露，本 task 先写占位 "(lw 基础值待 IPC 接入)"，
 *     与 character / location 表单一致。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { STYLE_PRESETS } from '@core/modules/episode-production/assets/constants/style-presets'
import ReferenceImageField from '../../stage-asset-v2/shared/ReferenceImageField.vue'

const props = defineProps<{ bindingId: string }>()
const emit = defineEmits<{ saved: [] }>()

const loading = ref(false)
const saving = ref(false)
const binding = ref<any>(null)

const form = reactive<{
  name: string
  description: string
  styleAnchors: string[]
  /** spec 2026-05-09 参考图相对路径 */
  referenceImagePath: string | null
}>({
  name: '',
  description: '',
  styleAnchors: [],
  referenceImagePath: null,
})

const overrideEnabled = reactive({
  name: false,
  description: false,
})

const isLinkedLw = computed(() => binding.value?.sourceType === 'linked_lw')

// lw 基础值占位：实际 lw 字段 IPC 暂未暴露（item-asset.service 内部用了 lw repo
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
    const resp = await api.item.get(props.bindingId)
    if (!resp || !resp.success) {
      ElMessage.error(resp?.error || '加载物品失败')
      binding.value = null
    } else {
      binding.value = resp.data
      hydrateFromBinding(resp.data)
    }
  } catch (e: any) {
    console.error('[ItemCardForm] load 失败', e)
    ElMessage.error(e?.message || '加载物品失败')
  } finally {
    loading.value = false
  }
}

function hydrateFromBinding(b: any) {
  if (!b) {
    form.name = ''
    form.description = ''
    form.styleAnchors = []
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
  form.styleAnchors = parseJsonArray(b.styleAnchors)
  form.referenceImagePath = b.referenceImagePath ?? null
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** 参考图改完直接更新本地 form；落库已由 ReferenceImageField IPC 即时完成 */
function onReferenceImageChange(newPath: string | null): void {
  form.referenceImagePath = newPath
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
      const resp = await api.item.updateOverride(props.bindingId, overridePayload)
      if (!resp || !resp.success) {
        ElMessage.error(resp?.error || '保存 override 失败')
        return
      }
    } else {
      const resp = await api.item.updateStandalone(props.bindingId, {
        name: form.name,
        description: form.description,
      })
      if (!resp || !resp.success) {
        ElMessage.error(resp?.error || '保存 standalone 失败')
        return
      }
    }

    // 风格锚点（character/location/item 通用 — 通过 updateExtra 落库）
    if (api.item.updateExtra) {
      const extraResp = await api.item.updateExtra(props.bindingId, {
        styleAnchors: form.styleAnchors,
      })
      if (!extraResp?.success) {
        ElMessage.warning(extraResp?.error || '风格保存失败（其他字段已保存）')
      }
    }

    ElMessage.success('已保存')
    emit('saved')
  } catch (e: any) {
    console.error('[ItemCardForm] save 失败', e)
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
.item-card-form {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.item-card-form :deep(.el-card__body) {
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

.full-width {
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
