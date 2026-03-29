<template>
  <div class="story-editor">
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
        <el-button @click="showPreview = true">
          <el-icon><View /></el-icon>
          设定集
        </el-button>
        <el-button type="primary" @click="showExport = true">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </div>

    <!-- 阶段导航 -->
    <div class="stage-nav">
      <div
        v-for="(stage, index) in storyStages"
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
      <!-- 阶段一：故事概要 -->
      <OverviewStage
        v-if="currentStage === 'overview'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />

      <!-- 阶段二：故事情节 -->
      <PlotStage
        v-if="currentStage === 'plot'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />

      <!-- 阶段三：背景设定 -->
      <BackgroundStage
        v-if="currentStage === 'background'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />

      <!-- 阶段四：角色设定 -->
      <CharacterStage
        v-if="currentStage === 'characters'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />

      <!-- 阶段五：技能物品 -->
      <SkillItemStage
        v-if="currentStage === 'skills'"
        :project-id="projectId"
        @update:progress="updateProgress"
        @skip="skipToOutline"
      />

      <!-- 阶段六：大纲设计 -->
      <OutlineStage
        v-if="currentStage === 'outline'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />

      <!-- 阶段七：章节写作 -->
      <ChapterStage
        v-if="currentStage === 'chapters'"
        :project-id="projectId"
        @update:progress="updateProgress"
      />
    </div>

    <!-- 设定集预览对话框 -->
    <el-dialog
      v-model="showPreview"
      title="设定集预览"
      width="90%"
      top="5vh"
    >
      <div class="preview-content">
        <el-empty description="设定集预览功能开发中..." />
      </div>
    </el-dialog>

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
import { ArrowLeft, View, Download } from '@element-plus/icons-vue'
import type { LongWritingProject, StoryStage } from '../../../../shared/types/longwriting.types'

// 子组件
import OverviewStage from '@/components/longwriting/story/OverviewStage.vue'
import PlotStage from '@/components/longwriting/story/PlotStage.vue'
import BackgroundStage from '@/components/longwriting/story/BackgroundStage.vue'
import CharacterStage from '@/components/longwriting/story/CharacterStage.vue'
import SkillItemStage from '@/components/longwriting/story/SkillItemStage.vue'
import OutlineStage from '@/components/longwriting/story/OutlineStage.vue'
import ChapterStage from '@/components/longwriting/story/ChapterStage.vue'
import ExportDialog from '@/components/longwriting/ExportDialog.vue'

const route = useRoute()
const router = useRouter()

// 项目 ID
const projectId = computed(() => route.params.id as string)

// 项目数据
const project = ref<LongWritingProject | null>(null)

// 当前阶段
const currentStage = ref<StoryStage>('overview')

// 对话框状态
const showPreview = ref(false)
const showExport = ref(false)

// 故事阶段配置
const storyStages = [
  { key: 'overview', label: '故事概要' },
  { key: 'plot', label: '故事情节' },
  { key: 'background', label: '背景设定' },
  { key: 'characters', label: '角色设定' },
  { key: 'skills', label: '技能物品' },
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
function setStage(stage: StoryStage) {
  currentStage.value = stage
}

// 判断阶段是否完成
function isStageCompleted(stage: string): boolean {
  const stageOrder = ['overview', 'plot', 'background', 'characters', 'skills', 'outline', 'chapters']
  const currentIndex = stageOrder.indexOf(currentStage.value)
  const stageIndex = stageOrder.indexOf(stage)
  return stageIndex < currentIndex
}

// 更新进度
function updateProgress(progress: number) {
  // TODO: 更新项目进度
  console.log('更新进度:', progress)
}

// 跳过大纲
function skipToOutline() {
  setStage('outline')
}

// 加载项目数据
async function loadProject() {
  const result = await window.electronAPI.longwriting.getProject(projectId.value)
  if (result.success && result.data) {
    project.value = result.data
    currentStage.value = result.data.stage as StoryStage
  } else {
    ElMessage.error('加载项目失败：' + (result.error || '未知错误'))
  }
}

onMounted(() => {
  loadProject()
})
</script>

<style lang="scss" scoped>
.story-editor {
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

.preview-content {
  min-height: 400px;
}
</style>