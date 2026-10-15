<template>
  <div class="templates-page">
    <div class="page-header">
      <el-button @click="goBack">← 返回</el-button>
      <h2 class="page-title">📚 提示词模板库</h2>
      <div class="header-actions">
        <el-input
          v-model="keyword"
          placeholder="搜索模板..."
          clearable
          style="width: 200px"
        />
        <el-button type="primary" @click="createNew">＋ 新建模板</el-button>
      </div>
    </div>
    <div class="page-body">
      <TemplateLibrary ref="libraryRef" :keyword="keyword" />
    </div>
  </div>
</template>

<script setup lang="ts">

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'PortraitTemplates' })
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import TemplateLibrary from '@/components/portrait/templates/TemplateLibrary.vue'

/**
 * 提示词模板库页面（plan B1）：
 * 页头（返回/标题/搜索/新建）+ TemplateLibrary。
 */
const router = useRouter()
const keyword = ref('')
const libraryRef = ref<InstanceType<typeof TemplateLibrary> | null>(null)

function goBack() {
  router.back()
}

function createNew() {
  libraryRef.value?.startEdit(null)
}
</script>

<style lang="scss" scoped>
.templates-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 24px;
  background: var(--bg-color-card);
  border-bottom: 1px solid var(--border-color-lighter);
  flex-shrink: 0;

  .page-title {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    gap: 10px;
    align-items: center;
  }
}

.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
</style>
