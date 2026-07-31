<template>
  <!--
    PrototypeImageEditor · 图片编辑界面（原型中间输出 · image 模式）

    上：图片预览卡片（右上角关闭图标回列表）
    下：提示词编辑框 + 尺寸 + 重新生成按钮（走 useImage）
    无 header 标题栏（遵循原型简化方向）。
  -->
  <div class="proto-image-editor">
    <!-- 图片预览卡片 -->
    <div class="preview-card">
      <el-icon class="card-close" @click="$emit('back')"><Close /></el-icon>
      <div class="preview-area">
        <img v-if="previewUrl" :src="previewUrl" :alt="image.prompt ?? '图片'" class="preview-img" @error="onImgError" />
        <el-empty v-else description="图片加载失败" :image-size="80" />
      </div>
    </div>

    <!-- 提示词编辑框 -->
    <div class="prompt-area">
      <el-input
        v-model="promptText"
        type="textarea"
        :rows="4"
        placeholder="描述这张图片..."
        resize="none"
      />

      <div class="prompt-toolbar">
        <div class="size-group">
          <el-input-number v-model="width" :min="256" :max="2048" :step="64" size="small" controls-position="right" />
          <span class="size-x">×</span>
          <el-input-number v-model="height" :min="256" :max="2048" :step="64" size="small" controls-position="right" />
        </div>
        <el-button
          type="primary"
          :loading="regenerating"
          :disabled="!promptText.trim()"
          @click="onRegenerate"
        >
          <el-icon><MagicStick /></el-icon>
          提交
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Close, MagicStick } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'
import { useImage } from '@/composables/useImage'
import type { ImageRecord } from '../../../../../shared/types/image.types'

const props = defineProps<{
  image: ImageRecord
}>()

const emit = defineEmits<{
  back: []
  regenerated: [image: ImageRecord]
}>()

const imageStore = useImage()

const promptText = ref(props.image.prompt ?? '')
const width = ref(props.image.width ?? 1024)
const height = ref(props.image.height ?? 1024)
const regenerating = ref(false)

const previewUrl = ref(toImageUrl(props.image.filePath))

watch(
  () => props.image,
  (img) => {
    promptText.value = img.prompt ?? ''
    width.value = img.width ?? 1024
    height.value = img.height ?? 1024
    previewUrl.value = toImageUrl(img.filePath)
  },
)

function onImgError(): void {
  previewUrl.value = ''
}

async function onRegenerate(): Promise<void> {
  if (!promptText.value.trim()) return
  regenerating.value = true
  try {
    const beforeCount = imageStore.images.value.length
    const taskId = await imageStore.generateImage({
      prompt: promptText.value,
      width: width.value,
      height: height.value,
      count: 1,
    })
    if (!taskId) {
      ElMessage.error(imageStore.error.value || '生成失败，请检查图床配置')
      return
    }
    const newImage = await waitNewImage(beforeCount)
    if (newImage) {
      ElMessage.success('已生成新图片')
      emit('regenerated', newImage)
    } else {
      ElMessage.warning('生成超时，请稍后在输出区查看')
    }
  } finally {
    regenerating.value = false
  }
}

/** 轮询 useImage.currentTask，最多等 5 分钟，完成后返回新 ImageRecord */
function waitNewImage(beforeCount: number): Promise<ImageRecord | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const MAX_WAIT = 5 * 60 * 1000
    const timer = setInterval(() => {
      const task = imageStore.currentTask.value
      const elapsed = Date.now() - startedAt
      if (task && (task.status === 'completed' || task.status === 'failed')) {
        clearInterval(timer)
        if (task.status === 'failed') {
          resolve(null)
          return
        }
        const fresh = imageStore.images.value.slice(0, imageStore.images.value.length - beforeCount)
        resolve(fresh[0] ?? imageStore.images.value[0] ?? null)
        return
      }
      if (elapsed > MAX_WAIT) {
        clearInterval(timer)
        resolve(null)
      }
    }, 1500)
  })
}
</script>

<style scoped lang="scss">
.proto-image-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

.preview-card {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;

  .card-close {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    cursor: pointer;
    font-size: 18px;
    color: var(--el-text-color-secondary);
    background: var(--el-mask-color);
    border-radius: 50%;
    padding: 2px;
    transition: color 0.15s;

    &:hover {
      color: var(--el-color-danger);
    }
  }
}

.preview-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);

  .preview-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.prompt-area {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40%;
  overflow-y: auto;
}

.prompt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.size-group {
  display: flex;
  align-items: center;
  gap: 6px;

  .size-x {
    color: var(--el-text-color-secondary);
  }
}
</style>
