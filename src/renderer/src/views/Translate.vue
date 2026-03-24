<template>
  <div class="translation-page">
    <!-- 左侧边栏 -->
    <TranslationSidebar
      v-model="selectedHistoryId"
      class="page-sidebar"
      @select="handleSelectHistory"
    />

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 标签切换 -->
      <el-tabs v-model="activeTab" class="translation-tabs">
        <el-tab-pane label="文本翻译" name="text">
          <TextTranslation />
        </el-tab-pane>
        <el-tab-pane label="文件翻译" name="file">
          <FileTranslation />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TranslationSidebar from '@/components/translation/TranslationSidebar.vue'
import TextTranslation from '@/components/translation/TextTranslation.vue'
import FileTranslation from '@/components/translation/FileTranslation.vue'
import type { TranslationRecord } from '../../../shared/types/translation.types'

// 当前激活的标签
const activeTab = ref('text')

// 选中的历史 ID
const selectedHistoryId = ref('')

/**
 * 处理历史选择
 */
function handleSelectHistory(history: TranslationRecord): void {
  // 可以在这里实现从历史记录加载数据到翻译框
  console.log('选中历史:', history)
}
</script>

<style lang="scss" scoped>
.translation-page {
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
  height: 100%;
  overflow: hidden;
  padding: 20px;
}

.translation-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    margin-bottom: 16px;
    background: #fff;
    padding: 8px 16px;
    border-radius: 12px;
  }

  :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;

    .el-tab-pane {
      height: 100%;
    }
  }
}
</style>