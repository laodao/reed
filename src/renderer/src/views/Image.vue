<template>
  <div class="image-page">
    <!-- 左侧边栏 - 生成历史 -->
    <ImageSidebar
      v-model="selectedImageId"
      class="page-sidebar"
      @select="handleSelectImage"
    />

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 顶部生成器区域 -->
      <div class="generator-area">
        <ImageGenerator
          ref="generatorRef"
          @generated="handleGenerated"
          @error="handleError"
        />
      </div>

      <!-- 底部结果展示区域 -->
      <div class="result-area">
        <ImageResult
          :image="selectedImage"
          @regenerate="handleRegenerate"
          @update="handleImageUpdate"
          @delete="handleImageDelete"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import ImageSidebar from '@/components/image/ImageSidebar.vue'
import ImageGenerator from '@/components/image/ImageGenerator.vue'
import ImageResult from '@/components/image/ImageResult.vue'
import { useImage } from '@/composables'
import type { ImageRecord } from '../../../shared/types/image.types'

// 使用 useImage composable
const {
  images,
  loading,
  loadImages,
  loadProviders,
  generateImage
} = useImage()

// ==================== 状态 ====================

/** 选中的图像 ID */
const selectedImageId = ref<string>('')

/** 生成器组件引用 */
const generatorRef = ref<InstanceType<typeof ImageGenerator> | null>(null)

// ==================== 计算属性 ====================

/** 当前选中的图像 */
const selectedImage = computed<ImageRecord | null>(() => {
  if (!selectedImageId.value) return null
  return images.value.find(img => img.id === selectedImageId.value) || null
})

// ==================== 方法 ====================

/**
 * 处理图像选择
 */
function handleSelectImage(image: ImageRecord): void {
  selectedImageId.value = image.id
}

/**
 * 处理生成完成
 */
function handleGenerated(taskId: string): void {
  console.log('图像生成任务已创建:', taskId)
  // 刷新图像列表
  loadImages()
}

/**
 * 处理错误
 */
function handleError(error: string): void {
  ElMessage.error(error)
}

/**
 * 处理重新生成
 * 将历史图像的参数填充到生成器中
 */
async function handleRegenerate(image: ImageRecord): Promise<void> {
  // 填充参数到生成器
  if (generatorRef.value) {
    generatorRef.value.setParams({
      prompt: image.prompt,
      negativePrompt: image.negativePrompt,
      width: image.width || 1024,
      height: image.height || 1024,
      style: image.style,
      quality: image.quality,
      seed: image.seed,
      providerId: image.providerId,
      modelId: image.modelId
    })
  }

  // 刷新列表
  await loadImages()
}

/**
 * 处理图像更新
 */
function handleImageUpdate(image: ImageRecord): void {
  // 图像已更新，刷新列表
  loadImages()
}

/**
 * 处理图像删除
 */
function handleImageDelete(image: ImageRecord): void {
  // 清除选中状态
  selectedImageId.value = ''
  // 刷新图像列表
  loadImages()
}

// ==================== 生命周期 ====================

onMounted(async () => {
  // 初始化加载
  await Promise.all([
    loadProviders(),
    loadImages()
  ])
})
</script>

<style lang="scss" scoped>
.image-page {
  display: flex;
  height: 100%;
  background: #f5f7fa;
  overflow: hidden;
}

.page-sidebar {
  flex-shrink: 0;
  height: 100%;
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.generator-area {
  flex-shrink: 0;
  padding: 20px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.result-area {
  flex: 1;
  padding: 20px;
  overflow: hidden;

  > :deep(*) {
    height: 100%;
  }
}
</style>