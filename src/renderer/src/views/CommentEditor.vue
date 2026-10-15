<template>
  <div class="comment-editor">
    <!-- 顶部导航栏 -->
    <div class="editor-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="project-title">{{ project?.name || '加载中...' }}</span>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="showExport = true">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </div>

    <!-- 阶段导航 -->
    <div class="stage-nav">
      <div
        v-for="(stage, index) in commentStages"
        :key="stage.key"
        class="stage-item"
        :class="{ active: currentStage === stage.key, completed: isStageCompleted(stage.key) }"
        @click="setStage(stage.key)"
      >
        <div class="stage-number">{{ index + 1 }}</div>
        <div class="stage-info">
          <span class="stage-label">{{ stage.label }}</span>
        </div>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="editor-content">
      <!-- 阶段一：主题素材 -->
      <TopicStage
        v-if="currentStage === 'topic'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />

      <!-- 阶段二：大纲设计 -->
      <CommentOutlineStage
        v-if="currentStage === 'outline'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />

      <!-- 阶段三：章节写作 -->
      <CommentChapterStage
        v-if="currentStage === 'chapters'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />
    </div>

    <!-- 导出对话框 -->
    <ExportDialog
      v-model:visible="showExport"
      :project-id="projectId"
      :project-name="project?.name || ''"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Download } from '@element-plus/icons-vue'
import type { LongWritingProject, CommentStage } from '../../../../shared/types/longwriting.types'
import { useTabsStore } from '@/stores/tabs'

// 定义组件名称用于 keep-alive
defineOptions({
  name: 'CommentEditor'
})

// 子组件
import TopicStage from '@/components/longwriting/comment/TopicStage.vue'
import CommentOutlineStage from '@/components/longwriting/comment/OutlineStage.vue'
import CommentChapterStage from '@/components/longwriting/comment/ChapterStage.vue'
import ExportDialog from '@/components/longwriting/ExportDialog.vue'

const route = useRoute()
const router = useRouter()
const tabsStore = useTabsStore()

// 项目 ID
const projectId = computed(() => route.params.id as string)

// 项目数据
const project = ref<LongWritingProject | null>(null)

// 当前阶段
const currentStage = ref<CommentStage>('topic')

// 对话框状态
const showExport = ref(false)

// 评论阶段配置
const commentStages = [
  { key: 'topic', label: '主题素材' },
  { key: 'outline', label: '大纲设计' },
  { key: 'chapters', label: '章节写作' }
]

// 提供项目 ID 给子组件
provide('projectId', projectId)

// 返回项目列表
function goBack() {
  router.push('/longwriting')
}

// 设置当前阶段
function setStage(stage: CommentStage) {
  currentStage.value = stage
}

// 判断阶段是否完成
function isStageCompleted(stage: string): boolean {
  const stageOrder = ['topic', 'outline', 'chapters']
  const currentIndex = stageOrder.indexOf(currentStage.value)
  const stageIndex = stageOrder.indexOf(stage)
  return stageIndex < currentIndex
}

// 更新进度
function updateProgress(progress: number) {
  console.log('更新进度:', progress)
}

// 加载项目数据
async function loadProject() {
  const result = await window.electronAPI.longwriting.getProject(projectId.value)
  if (result.success && result.data) {
    project.value = result.data
    currentStage.value = result.data.stage as CommentStage
    // 更新标签页标题为项目名称
    tabsStore.updateTabTitle(route.path, result.data.name)
  } else {
    ElMessage.error('加载项目失败：' + (result.error || '未知错误'))
  }
}

onMounted(() => {
  loadProject()
})
</script>

<style lang="scss" scoped>
.comment-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color-page);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;

  .project-title {
    font-size: 18px;
    font-weight: 500;
    color: var(--text-color-primary);
  }
}

.header-right {
  display: flex;
  gap: 8px;
}

.stage-nav {
  display: flex;
  padding: 16px 24px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
  gap: 8px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);

    .stage-number {
      background: var(--color-primary);
      color: white;
    }

    .stage-label {
      color: var(--color-primary);
      font-weight: 500;
    }
  }

  &.completed {
    .stage-number {
      background: var(--color-success);
      color: white;
    }
  }
}

.stage-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--fill-color);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.stage-label {
  font-size: 14px;
  color: var(--text-color-regular);
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
</style>