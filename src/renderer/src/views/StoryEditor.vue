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
      <div class="header-center">
<<<<<<< HEAD
        <!-- 统一模型选择器 -->
        <el-select
          v-model="selectedModelKey"
          size="small"
          placeholder="选择模型"
          class="model-select"
          filterable
          :filter-method="filterModels"
        >
          <el-option-group
            v-for="provider in filteredProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="`${provider.shortId}/${model.name}`"
              :value="`${provider.id}:${model.id}`"
            >
              <div class="model-option">
                <span class="model-name">{{ provider.shortId }}/{{ model.name }}</span>
                <span class="model-context">{{ formatContext(model.contextWindow) }}</span>
              </div>
            </el-option>
          </el-option-group>
        </el-select>
=======
        <!-- 统一模型选择 -->
        <div class="model-selector">
          <span class="model-label">AI 模型：</span>
          <el-select
            v-model="selectedModelKey"
            placeholder="选择模型"
            class="model-select"
            filterable
            :filter-method="filterModels"
            :loading="loadingModels"
          >
            <el-option-group
              v-for="provider in filteredProviderModels"
              :key="provider.id"
              :label="provider.name"
            >
              <el-option
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                :label="`${provider.shortId}/${model.name}`"
                :value="`${provider.id}:${model.id}`"
              >
                <div class="model-option">
                  <span class="model-name">{{ provider.shortId }}/{{ model.name }}</span>
                  <span class="model-context">{{ formatContext(model.contextWindow) }}</span>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
        </div>
>>>>>>> 06a3853 (提交)
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
import { ref, computed, onMounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, View, Download } from '@element-plus/icons-vue'
import type { LongWritingProject, StoryStage } from '../../../../shared/types/longwriting.types'
<<<<<<< HEAD
import type { UserProviderConfig, ProviderTemplate } from '../../../../shared/types'
=======
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'
>>>>>>> 06a3853 (提交)

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

<<<<<<< HEAD
// ========== 模型选择相关 ==========
=======
// ==================== 统一模型选择 ====================
>>>>>>> 06a3853 (提交)
const providerConfigs = ref<UserProviderConfig[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])
const selectedModelKey = ref<string>('')
const modelSearchKeyword = ref('')
<<<<<<< HEAD
=======
const loadingModels = ref(true)
>>>>>>> 06a3853 (提交)

// 判断模型是否为文本类型
function isTextModel(type: string | undefined): boolean {
  return type === undefined || type === 'text' || type === 'multimodal'
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

// 过滤后的模型列表
const filteredProviderModels = computed(() => {
  if (!modelSearchKeyword.value) {
    return providerModels.value
  }

  const keyword = modelSearchKeyword.value.toLowerCase()
  const result: typeof providerModels.value = []

  for (const provider of providerModels.value) {
    const filteredModels = provider.models.filter(model =>
      model.name.toLowerCase().includes(keyword) ||
      model.id.toLowerCase().includes(keyword) ||
      provider.name.toLowerCase().includes(keyword) ||
      provider.shortId.toLowerCase().includes(keyword)
    )

    if (filteredModels.length > 0) {
      result.push({ ...provider, models: filteredModels })
    }
  }

  return result
})

// 模型搜索过滤方法
function filterModels(keyword: string): void {
  modelSearchKeyword.value = keyword
}

// 格式化上下文窗口大小
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
<<<<<<< HEAD
=======
  loadingModels.value = true
>>>>>>> 06a3853 (提交)
  try {
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }

    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.configs) {
      providerConfigs.value = response.configs.filter((c: UserProviderConfig) => c.isEnabled)

      // 设置默认模型
      if (!selectedModelKey.value && providerModels.value.length > 0) {
        const firstProvider = providerModels.value[0]
        if (firstProvider.models.length > 0) {
          selectedModelKey.value = `${firstProvider.id}:${firstProvider.models[0].id}`
        }
      }
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
<<<<<<< HEAD
=======
  } finally {
    loadingModels.value = false
>>>>>>> 06a3853 (提交)
  }
}

// 解析选中的模型
const selectedModel = computed(() => {
  if (!selectedModelKey.value) return null
<<<<<<< HEAD
  const [providerConfigId, modelId] = selectedModelKey.value.split(':')
  return { providerConfigId, modelId }
})

// 提供模型信息给子组件
provide('selectedModel', selectedModel)
=======
  const [providerId, modelId] = selectedModelKey.value.split(':')
  return { providerId, modelId }
})

// 提供模型选择给子组件
provide('selectedModel', selectedModel)
provide('selectedModelKey', selectedModelKey)

// ==================== 阶段配置 ====================
>>>>>>> 06a3853 (提交)

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
  loadProviderConfigs()
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

.header-center {
  display: flex;
  align-items: center;
  flex: 1;
  justify-content: center;

  .model-selector {
    display: flex;
    align-items: center;
    gap: 8px;

    .model-label {
      font-size: 14px;
      color: var(--text-color-secondary);
    }

    .model-select {
      width: 280px;
    }
  }
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

.header-right {
  display: flex;
  gap: 8px;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 8px;

  .model-select {
    width: 220px;
  }

  .model-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .model-name {
      font-size: 13px;
      color: var(--text-color-primary);
    }

    .model-context {
      font-size: 11px;
      color: var(--text-color-secondary);
      background: var(--fill-color-light);
      padding: 2px 6px;
      border-radius: 4px;
    }
  }
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