<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="换背景"
    width="650px"
  >
    <div class="dialog-content">
      <p class="hint-text">为正面形象更换背景，保持人物特征不变</p>

      <el-form :model="form" label-width="100px">
        <el-form-item label="背景类型">
          <el-radio-group v-model="form.backgroundType">
            <el-radio value="solid">纯色背景</el-radio>
            <el-radio value="preset">预设场景</el-radio>
            <el-radio value="custom">自定义描述</el-radio>
            <el-radio value="image">上传图片</el-radio>
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

        <!-- 上传背景图片 -->
        <el-form-item v-if="form.backgroundType === 'image'" label="背景图片">
          <div class="upload-section">
            <div v-if="form.backgroundImage" class="image-preview">
              <el-image :src="form.backgroundImage" fit="cover" />
              <el-button
                class="remove-btn"
                type="danger"
                size="small"
                circle
                @click="removeBackgroundImage"
              >
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <div v-else class="upload-area" @click="selectBackgroundImage">
              <el-icon size="32"><Plus /></el-icon>
              <span>上传背景图片</span>
            </div>
          </div>
          <p class="upload-hint">上传背景图片，人物将被合成到新背景中</p>
        </el-form-item>
      </el-form>
    </div>

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
import { Plus, Close } from '@element-plus/icons-vue'
import { PRESET_BACKGROUNDS } from '../../../../shared/types/portrait.types'

const props = defineProps<{
  modelValue: boolean
  characterId: string
  variantId?: string  // 可选：基于哪个变体换背景，不指定则使用基础正面变体
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

type BackgroundType = 'solid' | 'preset' | 'custom' | 'image'

const form = ref({
  backgroundType: 'solid' as BackgroundType,
  backgroundColor: '#FFFFFF',
  presetScene: '',
  customDescription: '',
  backgroundImage: ''
})

const loading = ref(false)

const canSubmit = computed(() => {
  if (form.value.backgroundType === 'solid') return true
  if (form.value.backgroundType === 'preset') return !!form.value.presetScene
  if (form.value.backgroundType === 'custom') return !!form.value.customDescription.trim()
  if (form.value.backgroundType === 'image') return !!form.value.backgroundImage
  return false
})

async function selectBackgroundImage() {
  try {
    const result = await window.electronAPI.image.selectFile()
    if (result.success && result.data) {
      form.value.backgroundImage = result.data.base64
    }
  } catch (error: any) {
    ElMessage.error(error.message || '选择图片失败')
  }
}

function removeBackgroundImage() {
  form.value.backgroundImage = ''
}

async function handleSubmit() {
  if (!canSubmit.value || !props.characterId) return

  loading.value = true

  try {
    const result = await window.electronAPI.portrait.changeBackground({
      characterId: props.characterId,
      variantId: props.variantId,  // 传递变体 ID
      backgroundType: form.value.backgroundType,
      backgroundColor: form.value.backgroundColor,
      presetScene: form.value.presetScene,
      customDescription: form.value.customDescription,
      angles: ['front'] // 只针对正面照片
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
    backgroundImage: ''
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
.dialog-content {
  .hint-text {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-bottom: 16px;
  }
}

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

.upload-section {
  .image-preview {
    position: relative;
    width: 200px;
    height: 150px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--el-border-color);

    .el-image {
      width: 100%;
      height: 100%;
    }

    .remove-btn {
      position: absolute;
      top: 8px;
      right: 8px;
    }
  }

  .upload-area {
    width: 200px;
    height: 150px;
    border: 2px dashed var(--el-border-color);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--el-text-color-secondary);
    transition: all 0.2s;

    &:hover {
      border-color: var(--el-color-primary);
      color: var(--el-color-primary);
    }

    span {
      font-size: 13px;
      margin-top: 8px;
    }
  }
}

.upload-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
}
</style>