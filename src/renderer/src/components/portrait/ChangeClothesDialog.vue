<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="换衣"
    width="550px"
  >
    <div class="dialog-content">
      <p class="hint-text">为正面形象更换服装，保持人物特征不变</p>

      <el-form :model="form" label-width="100px">
        <el-form-item label="服装描述">
          <el-input
            v-model="form.clothesDescription"
            type="textarea"
            :rows="3"
            placeholder="描述新的服装，例如：红色西装套装，白色衬衫，黑色领带"
          />
        </el-form-item>

        <el-form-item label="参考图片">
          <div class="upload-section">
            <div v-if="form.referenceImage" class="image-preview">
              <el-image :src="form.referenceImage" fit="contain" />
              <el-button
                class="remove-btn"
                type="danger"
                size="small"
                circle
                @click="removeReferenceImage"
              >
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <div v-else class="upload-area" @click="selectImage">
              <el-icon size="32"><Plus /></el-icon>
              <span>上传服装参考图</span>
            </div>
          </div>
          <p class="upload-hint">可选：上传服装图片作为参考</p>
        </el-form-item>
      </el-form>
    </div>

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
import { Plus, Close } from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
  characterId: string
  variantId?: string  // 可选：基于哪个变体换衣，不指定则使用基础正面变体
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const form = ref({
  clothesDescription: '',
  referenceImage: ''
})

const loading = ref(false)

const canSubmit = computed(() => {
  return form.value.clothesDescription.trim()
})

async function selectImage() {
  try {
    const result = await window.electronAPI.image.selectFile()
    if (result.success && result.data) {
      form.value.referenceImage = result.data.base64
    }
  } catch (error: any) {
    ElMessage.error(error.message || '选择图片失败')
  }
}

function removeReferenceImage() {
  form.value.referenceImage = ''
}

async function handleSubmit() {
  if (!canSubmit.value || !props.characterId) return

  loading.value = true

  try {
    const result = await window.electronAPI.portrait.changeClothes({
      characterId: props.characterId,
      variantId: props.variantId,  // 传递变体 ID
      clothesDescription: form.value.clothesDescription,
      angles: ['front'] // 只针对正面照片
    })

    if (result.success) {
      ElMessage.success('换衣成功')
      emit('update:modelValue', false)
      emit('success')
      form.value.clothesDescription = ''
      form.value.referenceImage = ''
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
    form.value.referenceImage = ''
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

.upload-section {
  .image-preview {
    position: relative;
    width: 200px;
    height: 200px;
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
    height: 200px;
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