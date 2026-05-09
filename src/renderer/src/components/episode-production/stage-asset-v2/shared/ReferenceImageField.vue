<template>
  <!--
    资产参考图字段（spec 2026-05-09）— character / location / item 设定卡复用。

    用户上传一张图作为该资产的"视觉参考"，AI 生成主图时会作为 reference 输入。
    上传：file picker → base64 → IPC `episodeProduction.asset.setReferenceImage`
    清除：IPC clear=true 把 binding.reference_image_path 置 NULL。
  -->
  <div class="ref-image-field">
    <div class="rif-header">
      <span class="rif-label">参考图</span>
      <span class="rif-hint">— 主图生成时作为 AI 视觉参考；不上传则按 prompt 生成</span>
    </div>
    <div class="rif-body" :class="{ empty: !modelValue }">
      <div v-if="modelValue" class="rif-thumb-wrap">
        <img :src="toImageUrl(modelValue)" :alt="`${assetType} reference`" class="rif-thumb" />
      </div>
      <div v-else class="rif-empty">
        <el-icon><Picture /></el-icon>
        <span>未上传参考图</span>
      </div>
      <div class="rif-actions">
        <el-button
          size="small"
          :loading="uploading"
          :disabled="!bindingId"
          @click="triggerPick"
        >
          <el-icon><Upload /></el-icon>
          {{ modelValue ? '更换' : '上传' }}
        </el-button>
        <el-button
          v-if="modelValue"
          size="small"
          type="danger"
          plain
          :disabled="uploading"
          @click="onClear"
        >
          清除
        </el-button>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
        class="hidden-file-input"
        @change="onFileChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, Upload } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'

type AssetType = 'character' | 'location' | 'item'

const props = defineProps<{
  assetType: AssetType
  bindingId: string | null | undefined
  /** 当前已存的相对路径（来自 binding.referenceImagePath） */
  modelValue: string | null
}>()

const emit = defineEmits<{
  /** 路径变化时通知父组件刷新 binding 数据（父组件可重新拉 effective） */
  (e: 'update:modelValue', v: string | null): void
  (e: 'changed', v: string | null): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function triggerPick(): void {
  fileInput.value?.click()
}

async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 重置 input 让用户能连续选同一文件
  input.value = ''
  if (!file) return
  if (!props.bindingId) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选图片文件')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning('图片过大（>20MB）')
    return
  }

  uploading.value = true
  try {
    const base64 = await readAsBase64(file)
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.setReferenceImage) {
      ElMessage.error('setReferenceImage IPC 未暴露')
      return
    }
    const resp = await api.setReferenceImage({
      assetType: props.assetType,
      bindingId: props.bindingId,
      base64,
      fileName: file.name,
      mimeType: file.type,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '上传参考图失败')
      return
    }
    const newPath = (resp.data?.referenceImagePath as string | null) ?? null
    emit('update:modelValue', newPath)
    emit('changed', newPath)
    ElMessage.success('参考图已上传')
  } catch (e: any) {
    ElMessage.error('上传失败：' + (e?.message ?? '未知错误'))
  } finally {
    uploading.value = false
  }
}

async function onClear(): Promise<void> {
  if (!props.bindingId) return
  uploading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.setReferenceImage) {
      ElMessage.error('setReferenceImage IPC 未暴露')
      return
    }
    const resp = await api.setReferenceImage({
      assetType: props.assetType,
      bindingId: props.bindingId,
      clear: true,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '清除参考图失败')
      return
    }
    emit('update:modelValue', null)
    emit('changed', null)
    ElMessage.success('已清除')
  } finally {
    uploading.value = false
  }
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // data:image/...;base64,<...> → 仅取 base64 段
      const idx = result.indexOf('base64,')
      resolve(idx >= 0 ? result.slice(idx + 7) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失败'))
    reader.readAsDataURL(file)
  })
}
</script>

<style scoped>
.ref-image-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rif-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.rif-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.rif-hint {
  color: var(--el-text-color-placeholder);
}

.rif-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}

.rif-body.empty {
  align-items: center;
}

.rif-thumb-wrap {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.rif-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rif-empty {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.rif-empty .el-icon {
  font-size: 18px;
}

.rif-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: auto;
}

.hidden-file-input {
  display: none;
}
</style>
