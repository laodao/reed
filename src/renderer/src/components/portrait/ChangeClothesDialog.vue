<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="换衣"
    width="500px"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="服装描述">
        <el-input
          v-model="form.clothesDescription"
          type="textarea"
          :rows="3"
          placeholder="描述新的服装，例如：红色西装套装，白色衬衫，黑色领带"
        />
      </el-form-item>

      <el-form-item label="应用角度">
        <el-checkbox-group v-model="form.angles">
          <el-checkbox value="front">正面</el-checkbox>
          <el-checkbox value="left">左侧</el-checkbox>
          <el-checkbox value="right">右侧</el-checkbox>
          <el-checkbox value="back">背面</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" :disabled="!canSubmit" @click="handleSubmit">
        应用换衣
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { PortraitAngle } from '../../../../shared/types/portrait.types'

const props = defineProps<{
  modelValue: boolean
  projectId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const form = ref({
  clothesDescription: '',
  angles: ['front', 'left', 'right', 'back'] as PortraitAngle[]
})

const loading = ref(false)

const canSubmit = computed(() => {
  return form.value.clothesDescription.trim() && form.value.angles.length > 0
})

async function handleSubmit() {
  if (!canSubmit.value || !props.projectId) return

  loading.value = true

  try {
    const result = await window.electronAPI.portrait.changeClothes({
      projectId: props.projectId,
      clothesDescription: form.value.clothesDescription,
      angles: [...form.value.angles] as ('front' | 'left' | 'right' | 'back')[]
    })

    if (result.success) {
      ElMessage.success('换衣成功')
      emit('update:modelValue', false)
      emit('success')
      form.value.clothesDescription = ''
    } else {
      ElMessage.error(result.error || '换衣失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '换衣失败')
  } finally {
    loading.value = false
  }
}

// 重置表单
watch(() => props.modelValue, (val) => {
  if (val) {
    form.value.clothesDescription = ''
    form.value.angles = ['front', 'left', 'right', 'back']
  }
})
</script>