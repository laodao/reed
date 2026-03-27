<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="生成其他角度"
    width="450px"
  >
    <div class="dialog-content">
      <div class="preview-section">
        <el-image :src="variant?.imagePath" fit="contain" class="preview-image" />
        <p class="preview-desc">{{ description }}</p>
      </div>

      <el-divider />

      <div class="angle-section">
        <p class="hint-text">选择要生成的角度（基于此正面照片）：</p>
        <el-checkbox-group v-model="selectedAngles">
          <el-checkbox value="left">左侧</el-checkbox>
          <el-checkbox value="right">右侧</el-checkbox>
          <el-checkbox value="back">背面</el-checkbox>
        </el-checkbox-group>
        <p class="angle-hint">将生成与正面照片服装、背景一致的其他角度照片</p>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :disabled="selectedAngles.length === 0"
        :loading="generating"
        @click="handleGenerate"
      >
        生成选中的角度
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { PortraitVariant, PortraitAngle } from '../../../shared/types/portrait.types'

const props = defineProps<{
  modelValue: boolean
  variant: PortraitVariant | null
  projectId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const selectedAngles = ref<PortraitAngle[]>(['left', 'right', 'back'])
const generating = ref(false)

const description = computed(() => {
  if (!props.variant) return ''
  if (props.variant.type === 'clothes') {
    return `换衣: ${props.variant.variantInfo?.clothesDescription || ''}`
  }
  if (props.variant.type === 'background') {
    return `换背景: ${props.variant.variantInfo?.backgroundDescription || ''}`
  }
  return '基础正面形象'
})

// 重置选择
watch(() => props.modelValue, (val) => {
  if (val) {
    selectedAngles.value = ['left', 'right', 'back']
  }
})

async function handleGenerate() {
  if (selectedAngles.value.length === 0 || !props.variant) return

  generating.value = true

  try {
    const result = await window.electronAPI.portrait.generateAngles({
      projectId: props.projectId,
      angles: [...selectedAngles.value] as PortraitAngle[],
      variantId: props.variant.id
    })

    if (result.success) {
      // 如果有警告信息（部分失败），显示警告
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
    generating.value = false
  }
}
</script>

<style lang="scss" scoped>
.dialog-content {
  .preview-section {
    display: flex;
    align-items: center;
    gap: 16px;

    .preview-image {
      width: 120px;
      height: 150px;
      border-radius: 8px;
      overflow: hidden;
      background: var(--el-fill-color);
    }

    .preview-desc {
      flex: 1;
      font-size: 14px;
      color: var(--el-text-color-regular);
      margin: 0;
    }
  }

  .hint-text {
    font-size: 14px;
    color: var(--el-text-color-regular);
    margin: 0 0 12px;
  }

  .angle-section {
    .el-checkbox-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .angle-hint {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-top: 12px;
    }
  }
}
</style>