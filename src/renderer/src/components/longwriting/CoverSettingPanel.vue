<template>
  <div class="cover-setting-panel">
    <div class="cover-preview" :class="{ empty: !coverPath }">
      <img v-if="coverPath" :src="toImageUrl(coverPath)" alt="封面" />
      <el-empty v-else description="暂未设置封面" :image-size="72" />
    </div>

    <div class="cover-actions">
      <el-button type="primary" :loading="uploading" @click="triggerPick">
        <el-icon><Upload /></el-icon>
        上传图片
      </el-button>
      <el-button :disabled="busy" @click="showAssetPicker = true">
        <el-icon><Picture /></el-icon>
        从系统资产选择
      </el-button>
      <el-button v-if="coverPath" type="danger" plain :disabled="busy" @click="clearCover">
        清除封面
      </el-button>
    </div>

    <p class="cover-tip">支持 jpg / png / webp / gif，不超过 10MB。封面将用于项目卡展示及导出 PDF / EPUB 的封面页。</p>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      class="hidden-input"
      @change="onFileChange"
    />

    <AssetImagePickerDialog v-model:visible="showAssetPicker" @select="onAssetPicked" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Picture } from '@element-plus/icons-vue'
import type { LongWritingProject, SetCoverSource } from '../../../../shared/types/longwriting.types'
import { toImageUrl } from '../../utils/asset-url'
import AssetImagePickerDialog from './AssetImagePickerDialog.vue'

const props = defineProps<{
  projectId: string
  coverPath?: string | null
}>()

const emit = defineEmits<{
  /** 封面已变更（携带更新后的项目，调用方就地刷新） */
  updated: [project: LongWritingProject]
}>()

const fileInputRef = ref<HTMLInputElement>()
const uploading = ref(false)
const busy = ref(false)
const showAssetPicker = ref(false)

async function setCover(source: SetCoverSource): Promise<boolean> {
  busy.value = true
  try {
    const result = await window.electronAPI.longwriting.setCover(props.projectId, source)
    if (result.success) {
      if (result.data) emit('updated', result.data)
      return true
    }
    ElMessage.error(result.error || '设置封面失败')
    return false
  } catch (error: any) {
    ElMessage.error('设置封面失败：' + error.message)
    return false
  } finally {
    busy.value = false
  }
}

function triggerPick() {
  fileInputRef.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许连续选同一文件
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning('图片大小不能超过 10MB')
    return
  }
  uploading.value = true
  try {
    const base64 = await readAsBase64(file)
    const ok = await setCover({ type: 'upload', base64, fileName: file.name })
    if (ok) ElMessage.success('封面已更新')
  } finally {
    uploading.value = false
  }
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const comma = dataUrl.indexOf(',')
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onAssetPicked(asset: { id: string }) {
  const ok = await setCover({ type: 'asset', assetId: asset.id })
  if (ok) ElMessage.success('封面已更新')
}

async function clearCover() {
  const ok = await setCover({ type: 'clear' })
  if (ok) ElMessage.success('封面已清除')
}
</script>

<style lang="scss" scoped>
.cover-setting-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px 0 16px;
}

.cover-preview {
  width: 300px;
  height: 200px;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fill-color-lighter);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &.empty :deep(.el-empty) {
    padding: 0;
  }
}

.cover-actions {
  display: flex;
  gap: 4px;
}

.cover-tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-secondary);
  text-align: center;
  max-width: 380px;
}

.hidden-input {
  display: none;
}
</style>
