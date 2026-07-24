<template>
  <el-dialog
    :model-value="modelValue"
    title="生成其他角度"
    width="480px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="dlg-body">
      <div class="form-row">
        <div class="form-label">选择角度（基于当前形象保持一致）</div>
        <el-checkbox-group v-model="angles">
          <el-checkbox value="left">左侧</el-checkbox>
          <el-checkbox value="right">右侧</el-checkbox>
          <el-checkbox value="back">背面</el-checkbox>
        </el-checkbox-group>
      </div>
      <div class="form-row">
        <div class="form-label">输出尺寸</div>
        <SizeSelect v-model="size" :model-sizes="modelSizes" :capabilities="capabilities" />
        <div class="size-hint">建议与正面图保持一致尺寸，避免比例不协调</div>
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="angles.length === 0"
        @click="handleSubmit"
      >
        📐 生成角度
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import SizeSelect from './SizeSelect.vue'
import type {
  PortraitCharacter,
  PortraitVariant,
  PortraitAngle
} from '../../../../../shared/types/portrait.types'
import type { ImageModelCapabilities } from '../../../../../shared/types/image-provider.types'

/**
 * 多角度对话框（spec 2026-07-24 D8）：
 * 角度勾选 + 尺寸（默认与当前形象一致）。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  character: PortraitCharacter
  variant?: PortraitVariant
  modelSizes?: string[]
  capabilities?: ImageModelCapabilities
}>(), {
  variant: undefined,
  modelSizes: () => [],
  capabilities: undefined
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const angles = ref<PortraitAngle[]>(['left', 'right', 'back'])
const size = ref('768x1024')
const loading = ref(false)

watch(() => props.modelValue, (open) => {
  if (!open) return
  const cfg = props.variant?.config
  size.value = cfg?.width && cfg?.height ? `${cfg.width}x${cfg.height}` : '768x1024'
})

async function handleSubmit() {
  if (angles.value.length === 0) return
  loading.value = true
  try {
    const [width, height] = size.value.split('x').map(Number)
    const result = await window.electronAPI.portrait.generateAngles({
      characterId: props.character.id,
      angles: [...angles.value],
      variantId: props.variant?.id,
      width,
      height
    })

    if (result.success) {
      if (result.warning) {
        ElMessage.warning(result.warning)
      } else {
        ElMessage.success('多角度生成成功')
      }
      emit('update:modelValue', false)
      emit('success')
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.form-row {
  margin-bottom: var(--spacing-md, 14px);
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 7px;
}

.size-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}
</style>
