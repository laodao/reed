<template>
  <div class="story-editor">
    <!-- 知识图谱视图（新 Tab，非对话框）：图谱与高级模式编辑共享同一份数据 -->
    <div v-if="currentView === 'graph'" class="graph-tab">
      <div class="graph-tab-header">
        <el-button text @click="currentView = 'stage'">
          <el-icon><ArrowLeft /></el-icon>
          返回编辑
        </el-button>
        <span class="graph-tab-title">知识图谱</span>
        <span class="graph-tab-project">{{ project?.name || '' }}</span>
      </div>
      <div class="graph-tab-body">
        <GraphView :project-id="projectId" />
      </div>
    </div>

    <!-- 高级模式（默认入口）：完整 7 阶段编辑界面 -->
    <template v-else>
    <!-- 顶部导航栏 -->
    <div class="editor-header">
      <div class="header-left">
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
      </div>
      <div class="header-center">
        <span class="project-title">{{ project?.name || '加载中...' }}</span>
      </div>
      <div class="header-right">
        <el-button @click="currentView = 'graph'">
          <el-icon><Share /></el-icon>
          图谱
        </el-button>
        <el-button @click="showPreview = true">
          <el-icon><View /></el-icon>
          设定集
        </el-button>
        <el-button @click="showSettingsDialog = true">
          <el-icon><Setting /></el-icon>
          设定
        </el-button>
      </div>
    </div>

    <!-- 阶段导航 -->
    <div class="stage-nav">
      <div class="stage-list">
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
    </div>

    <!-- 内容区域 -->
    <div class="editor-content" :class="{ 'no-scroll': currentStage === 'chapters' }">
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

    <!-- 项目设定对话框 -->
    <ProjectSettingsDialog
      v-model:visible="showSettingsDialog"
      :project-id="projectId"
      @model-configs-changed="loadStageModelConfigs"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, View, Setting, Share } from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'
import type { LongWritingProject, StoryStage } from '../../../../shared/types/longwriting.types'
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'

// 定义组件名称用于 keep-alive
defineOptions({
  name: 'StoryEditor'
})

// 知识图谱（懒加载：仅打开图谱 Tab 时才加载组件）
import { defineAsyncComponent } from 'vue'
const GraphView = defineAsyncComponent(() => import('@/components/longwriting/graph/GraphView.vue'))

// 子组件
import OverviewStage from '@/components/longwriting/story/OverviewStage.vue'
import PlotStage from '@/components/longwriting/story/PlotStage.vue'
import BackgroundStage from '@/components/longwriting/story/BackgroundStage.vue'
import CharacterStage from '@/components/longwriting/story/CharacterStage.vue'
import SkillItemStage from '@/components/longwriting/story/SkillItemStage.vue'
import OutlineStage from '@/components/longwriting/story/OutlineStage.vue'
import ChapterStage from '@/components/longwriting/story/ChapterStage.vue'
import ProjectSettingsDialog from '@/components/longwriting/ProjectSettingsDialog.vue'

const route = useRoute()
const router = useRouter()
const tabsStore = useTabsStore()

// 项目 ID
const projectId = computed(() => route.params.id as string)

// 项目数据
const project = ref<LongWritingProject | null>(null)

// 当前阶段
const currentStage = ref<StoryStage>('overview')

// 当前视图：'stage'（高级模式编辑）| 'graph'（知识图谱 Tab）
const currentView = ref<'stage' | 'graph'>('stage')

// 对话框状态
const showPreview = ref(false)
const showSettingsDialog = ref(false)

// ==================== 统一模型选择 ====================
const providerConfigs = ref<UserProviderConfig[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])
const loadingModels = ref(true)

// 步骤模型配置
const stageModelConfigs = ref<Record<string, string>>({})

// 判断模型是否为文本类型
function isTextModel(type: string | undefined): boolean {
  return type === undefined || type === 'text' || type === 'multimodal'
}

// 判断模型是否为图像类型
function isImageModel(type: string | undefined): boolean {
  return type === 'image'
}

// 提供商模型列表
const providerModels = computed(() => {
  const result: Array<{
    id: string
    name: string
    shortId: string
    models: Array<{
      id: string
      name: string
      contextWindow: number
      type?: string
    }>
  }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const models: Array<{
      id: string
      name: string
      contextWindow: number
      type?: string
    }> = []

    const template = providerTemplates.value.find(t => t.id === config.templateId)

    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          type: model.type
        })
      }
    } else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 8192,
          type: model.type
        })
      }
    }

    if (models.length > 0) {
      result.push({
        id: config.id,
        name: config.name,
        shortId: config.shortId || config.name,
        models
      })
    }
  }

  return result
})

// 图像模型列表
const imageProviderModels = computed(() => {
  const result: Array<{
    id: string
    name: string
    shortId: string
    models: Array<{
      id: string
      name: string
    }>
  }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const models: Array<{
      id: string
      name: string
    }> = []

    const template = providerTemplates.value.find(t => t.id === config.templateId)

    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (isImageModel(model.type)) {
          models.push({
            id: model.id,
            name: model.name
          })
        }
      }
    } else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (isImageModel(model.type)) {
          models.push({
            id: model.id,
            name: model.name || model.id
          })
        }
      }
    }

    if (models.length > 0) {
      result.push({
        id: config.id,
        name: config.name,
        shortId: config.shortId || config.name,
        models
      })
    }
  }

  return result
})

// 格式化上下文窗口大小（38 号配套，待章节工作台接线；先压 lint 以免阻塞同文件提交）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatContext(contextWindow: number): string {
  if (contextWindow >= 1000000) {
    return `${(contextWindow / 1000000).toFixed(1)}M`
  }
  if (contextWindow >= 1000) {
    return `${Math.round(contextWindow / 1000)}K`
  }
  return `${contextWindow}`
}

// 加载提供商配置
async function loadProviderConfigs(): Promise<void> {
  loadingModels.value = true
  try {
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }

    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.data) {
      providerConfigs.value = response.data.filter((c: UserProviderConfig) => c.isEnabled)
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  } finally {
    loadingModels.value = false
  }
}

// 加载步骤模型配置
async function loadStageModelConfigs(): Promise<void> {
  if (!projectId.value) return
  const result = await window.electronAPI.longwriting.getStageModelConfigs(projectId.value)
  if (result.success && result.data) {
    const configs: Record<string, string> = {}
    for (const config of result.data) {
      configs[config.stage] = `${config.providerConfigId}:${config.modelId}`
    }
    stageModelConfigs.value = configs
  }
}

// 获取当前步骤的模型配置
const currentStageModelKey = computed(() => {
  const stage = currentStage.value
  const configKey = stageModelConfigs.value[stage]
  if (configKey) return configKey

  // 如果当前步骤没有配置，返回第一个可用模型
  if (providerModels.value.length > 0) {
    const firstProvider = providerModels.value[0]
    if (firstProvider.models.length > 0) {
      return `${firstProvider.id}:${firstProvider.models[0].id}`
    }
  }
  return ''
})

// 解析当前步骤的模型
const selectedModel = computed(() => {
  if (!currentStageModelKey.value) return null
  const [providerId, modelId] = currentStageModelKey.value.split(':')
  return { providerId, modelId }
})

// 提供模型选择给子组件
provide('selectedModel', selectedModel)
provide('selectedModelKey', currentStageModelKey)

// 提供图像模型列表给子组件（供地图图片生成等功能使用）
provide('imageProviderModels', imageProviderModels)

// ==================== 阶段配置 ====================

// 故事阶段配置
const storyStages = [
  { key: 'overview', label: '故事概要' },
  { key: 'background', label: '背景设定' },
  { key: 'characters', label: '角色设定' },
  { key: 'skills', label: '技能物品' },
  { key: 'plot', label: '故事情节' },
  { key: 'outline', label: '大纲设计' },
  { key: 'chapters', label: '章节写作' }
]

// 提供项目 ID 给子组件
provide('projectId', projectId)

// 功能开关（从故事概要加载）
const enabledFeatures = ref<string[]>([])
provide('enabledFeatures', enabledFeatures)

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
  // 使用 storyStages 配置的顺序，确保与界面显示一致
  const stageOrder = storyStages.map(s => s.key)
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
    // 更新标签页标题为项目名称
    tabsStore.updateTabTitle(route.path, result.data.name)

    // 加载功能开关
    const overviewResult = await window.electronAPI.longwriting.getStoryOverview(projectId.value)
    if (overviewResult.success && overviewResult.data) {
      enabledFeatures.value = overviewResult.data.enabledFeatures || []
    }
  } else {
    ElMessage.error('加载项目失败：' + (result.error || '未知错误'))
  }
}

onMounted(() => {
  loadProject()
  loadProviderConfigs().then(() => {
    loadStageModelConfigs()
  })
  // 研讨室交接：?stage=chapters 直达章节工作台（v2.1 章节卡「在编辑器中打开」）
  const qStage = route.query.stage as string | undefined
  if (qStage) {
    setStage(qStage as StoryStage)
  }
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
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-center {
  display: flex;
  align-items: center;
  flex: 1;
  justify-content: center;

  .project-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color-primary);
  }
}

.header-right {
  display: flex;
  gap: 8px;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .model-name {
    font-size: 14px;
  }

  .model-context {
    font-size: 12px;
    color: var(--text-color-secondary);
  }
}

.stage-nav {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
}

.stage-list {
  display: flex;
  gap: 6px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 6px;
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
  width: 22px;
  height: 22px;
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
  min-height: 0;
  min-width: 0;
  width: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;

  > * {
    min-width: 0;
    width: 100%;
  }

  &.no-scroll {
    overflow: hidden;
  }
}

.preview-content {
  min-height: 400px;
}

// ==================== 图谱 Tab ====================

.graph-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;

  .graph-tab-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--bg-color);
    border-bottom: 1px solid var(--border-color-lighter);

    .graph-tab-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color-primary);
    }

    .graph-tab-project {
      font-size: 12px;
      color: var(--text-color-placeholder);
    }
  }

  .graph-tab-body {
    flex: 1;
    min-height: 0;
    padding: 12px;
    background: var(--bg-color-page);
  }
}
</style>