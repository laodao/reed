<template>
  <div class="ref-picker">
    <div v-for="(img, index) in modelValue" :key="index" class="ref-item">
      <el-image :src="img.data" fit="cover" class="ref-thumb" />
      <el-select
        :model-value="img.role"
        size="small"
        class="ref-role"
        @update:model-value="updateRole(index, $event)"
      >
        <el-option
          v-for="opt in roleOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <button class="ref-remove" type="button" @click="remove(index)">×</button>
    </div>
    <div v-if="modelValue.length < max" class="ref-upload" @click="selectImage">
      <span class="plus">＋</span>
      <span class="text">{{ uploadText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { ReferenceImageRole } from '../../../../../shared/types/portrait.types'

/**
 * 参考图上传网格（spec 2026-07-24 D7）：
 * 每张参考图可标注语义角色（人物/面部/姿势/服装/背景）。
 */
const props = withDefaults(defineProps<{
  modelValue: { data: string; role: ReferenceImageRole }[]
  max?: number
  uploadText?: string
}>(), {
  max: 4,
  uploadText: '上传'
})

const emit = defineEmits<{
  'update:modelValue': [value: { data: string; role: ReferenceImageRole }[]]
}>()

const roleOptions: { value: ReferenceImageRole; label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'face', label: '面部' },
  { value: 'pose', label: '姿势' },
  { value: 'clothing', label: '服装' },
  { value: 'background', label: '背景' }
]

async function selectImage() {
  try {
    const result = await window.electronAPI.image.selectFile()
    if (result.success && result.data) {
      emit('update:modelValue', [
        ...props.modelValue,
        { data: result.data.base64, role: 'character' as ReferenceImageRole }
      ])
    }
  } catch (error: any) {
    ElMessage.error(error.message || '选择图片失败')
  }
}

function remove(index: number) {
  const next = [...props.modelValue]
  next.splice(index, 1)
  emit('update:modelValue', next)
}

function updateRole(index: number, role: ReferenceImageRole) {
  const next = props.modelValue.map((item, i) => (i === index ? { ...item, role } : item))
  emit('update:modelValue', next)
}
</script>

<style lang="scss" scoped>
.ref-picker {
  display: flex;
  gap: var(--spacing-sm, 10px);
  flex-wrap: wrap;
}

.ref-item {
  position: relative;
  width: 80px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ref-thumb {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color-light);
  overflow: hidden;
}

.ref-role {
  width: 80px;

  :deep(.el-select__wrapper) {
    min-height: 22px;
    font-size: 11px;
    padding: 1px 6px;
  }
}

.ref-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(15, 20, 25, 0.65);
  color: var(--fill-color-blank);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--color-danger);
  }
}

.ref-upload {
  width: 80px;
  height: 80px;
  border: 1.5px dashed var(--border-color);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-light-9);
  }

  .plus {
    font-size: 20px;
    font-weight: 200;
    line-height: 1;
  }

  .text {
    font-size: 11px;
  }
}
</style>
