<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="换背景"
    width="600px"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="背景类型">
        <el-radio-group v-model="form.backgroundType">
          <el-radio value="solid">纯色背景</el-radio>
          <el-radio value="preset">预设场景</el-radio>
          <el-radio value="custom">自定义描述</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 纯色背景 -->
      <el-form-item v-if="form.backgroundType === 'solid'" label="背景颜色">
        <el-color-picker v-model="form.backgroundColor" show-alpha />
      </el-form-item>

      <!-- 预设场景 -->
      <el-form-item v-if="form.backgroundType === 'preset'" label="选择场景">
        <div class="preset-grid">
          <div
            v-for="preset in PRESET_BACKGROUNDS"
            :key="preset.id"
            class="preset-item"
            :class="{ active: form.presetScene === preset.id }"
            @click="form.presetScene = preset.id"
          >
            <span class="preset-icon">{{ preset.icon }}</span>
            <span class="preset-name">{{ preset.name }}</span>
          </div>
        </div>
      </el-form-item>

      <!-- 自定义描述 -->
      <el-form-item v-if="form.backgroundType === 'custom'" label="背景描述">
        <el-input
          v-model="form.customDescription"
          type="textarea"
          :rows="2"
          placeholder="描述想要的背景，例如：城市街道夜景，霓虹灯闪烁"
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
        替换背景
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { PRESET_BACKGROUNDS, type PortraitAngle } from '../../../../shared/types/portrait.types'

const props = defineProps<{
  modelValue: boolean
  projectId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const form = ref({
  backgroundType: 'solid' as 'solid' | 'preset' | 'custom',
  backgroundColor: '#FFFFFF',
  presetScene: '',
  customDescription: '',
  angles: ['front', 'left', 'right', 'back'] as PortraitAngle[]
})

const loading = ref(false)

const canSubmit = computed(() => {
  if (form.value.angles.length === 0) return false
  if (form.value.backgroundType === 'solid') return true
  if (form.value.backgroundType === 'preset') return !!form.value.presetScene
  if (form.value.backgroundType === 'custom') return !!form.value.customDescription.trim()
  return false
})

async function handleSubmit() {
  if (!canSubmit.value || !props.projectId) return

  loading.value = true

  try {
    const result = await window.electronAPI.portrait.changeBackground({
      projectId: props.projectId,
      backgroundType: form.value.backgroundType,
      backgroundColor: form.value.backgroundColor,
      presetScene: form.value.presetScene,
      customDescription: form.value.customDescription,
      angles: [...form.value.angles] as ('front' | 'left' | 'right' | 'back')[]
    })

    if (result.success) {
      ElMessage.success('换背景成功')
      emit('update:modelValue', false)
      emit('success')
      resetForm()
    } else {
      ElMessage.error(result.error || '换背景失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '换背景失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = {
    backgroundType: 'solid',
    backgroundColor: '#FFFFFF',
    presetScene: '',
    customDescription: '',
    angles: ['front', 'left', 'right', 'back']
  }
}

// 重置表单
watch(() => props.modelValue, (val) => {
  if (val) {
    resetForm()
  }
})
</script>

<style lang="scss" scoped>
.preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.preset-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 2px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-3);
  }

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .preset-icon {
    font-size: 24px;
    margin-bottom: 4px;
  }

  .preset-name {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>