<template>
  <div class="overview-stage">
    <div class="stage-header">
      <h2>故事概要设计</h2>
      <p class="stage-desc">输入核心故事构思，AI 将帮你生成完整的故事概要</p>
    </div>

    <div class="stage-content">
      <el-form :model="form" label-width="100px" class="overview-form">
        <!-- 模型选择 -->
        <el-form-item label="AI 模型">
          <el-select
            v-model="selectedModelKey"
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
                  <div class="model-info-row">
                    <span class="model-name">{{ provider.shortId }}/{{ model.name }}</span>
                    <span class="model-context">{{ formatContext(model.contextWindow) }}</span>
                  </div>
                  <div class="model-features" v-if="model.supportsThinking || model.supportsWebSearch || model.supportsTools">
                    <el-tooltip v-if="model.supportsThinking" content="支持深度思考" placement="top">
                      <el-icon class="feature-icon thinking"><Cpu /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsWebSearch" content="支持联网搜索" placement="top">
                      <el-icon class="feature-icon websearch"><Search /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsTools" content="支持工具调用" placement="top">
                      <el-icon class="feature-icon tools"><SetUp /></el-icon>
                    </el-tooltip>
                  </div>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
        </el-form-item>

        <!-- 故事类型 -->
        <el-form-item label="故事类型">
          <el-select v-model="form.storyType" placeholder="选择故事类型">
            <el-option
              v-for="type in storyTypes"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
        </el-form-item>

        <!-- 故事标题 -->
        <el-form-item label="故事标题">
          <el-input
            v-model="form.title"
            placeholder="AI 将根据内容生成标题建议，你也可以自行输入"
          />
        </el-form-item>

        <!-- 核心构思 -->
        <el-form-item label="核心构思" required>
          <el-input
            v-model="form.coreIdea"
            type="textarea"
            :rows="4"
            placeholder="描述你的故事核心构想，例如：一个普通少年意外获得神秘力量，在修仙世界中逆天改命的故事..."
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>

        <!-- 故事风格 -->
        <el-form-item label="故事风格">
          <el-select v-model="form.style" placeholder="选择故事风格（可选）" clearable>
            <el-option label="轻松幽默" value="light" />
            <el-option label="沉重深刻" value="heavy" />
            <el-option label="热血激昂" value="passionate" />
            <el-option label="冷峻沉稳" value="calm" />
            <el-option label="通俗易懂" value="popular" />
            <el-option label="文学性强" value="literary" />
          </el-select>
        </el-form-item>

        <!-- 目标读者 -->
        <el-form-item label="目标读者">
          <el-select v-model="form.targetReader" placeholder="选择目标读者群体（可选）" clearable>
            <el-option label="青少年" value="teenager" />
            <el-option label="青年" value="youth" />
            <el-option label="中年" value="middle" />
            <el-option label="全年龄" value="all" />
          </el-select>
        </el-form-item>

        <!-- 预估字数 -->
        <el-form-item label="预估字数">
          <el-select v-model="form.estimatedLength" placeholder="选择预估篇幅（可选）" clearable>
            <el-option label="短篇小说（5万字以下）" value="short" />
            <el-option label="中篇小说（5-20万字）" value="medium" />
            <el-option label="长篇小说（20万字以上）" value="long" />
          </el-select>
        </el-form-item>

        <!-- 其他要求 -->
        <el-form-item label="其他要求">
          <el-input
            v-model="form.otherRequirements"
            type="textarea"
            :rows="2"
            placeholder="其他特殊要求或限制（可选）"
          />
        </el-form-item>
      </el-form>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <el-button v-if="!generating" type="primary" size="large" @click="generateOverview">
          <el-icon><MagicStick /></el-icon>
          生成概要
        </el-button>
        <el-button v-else type="danger" size="large" @click="cancelGeneration">
          <el-icon><Close /></el-icon>
          取消生成
        </el-button>
      </div>

      <!-- 生成进度 -->
      <div v-if="generating" class="generating-progress">
        <el-progress :percentage="100" :indeterminate="true" />
        <p class="progress-text">AI 正在生成故事概要...</p>
      </div>

      <!-- 生成结果 -->
      <div v-if="generatedOverview" class="generated-result">
        <el-divider>生成结果（可编辑）</el-divider>
        <div class="result-content">
          <el-form :model="generatedOverview" label-width="100px">
            <el-form-item label="故事标题">
              <div class="title-suggestions">
                <el-tag
                  v-for="(title, index) in generatedOverview.titleSuggestions"
                  :key="index"
                  :type="generatedOverview.selectedTitle === title ? 'primary' : 'default'"
                  class="title-tag"
                  @click="selectTitle(title)"
                >
                  {{ title }}
                </el-tag>
              </div>
              <el-input
                v-model="generatedOverview.selectedTitle"
                placeholder="或直接输入标题"
                style="margin-top: 8px"
              />
            </el-form-item>
            <el-form-item label="故事概要">
              <el-input
                v-model="generatedOverview.summary"
                type="textarea"
                :rows="4"
              />
            </el-form-item>
            <el-form-item label="核心冲突">
              <el-input
                v-model="generatedOverview.coreConflict"
                type="textarea"
                :rows="2"
              />
            </el-form-item>
            <el-form-item label="故事主题">
              <el-input v-model="generatedOverview.theme" />
            </el-form-item>
            <el-form-item label="预估章节">
              <el-input-number v-model="generatedOverview.estimatedChapters" :min="1" :max="1000" />
            </el-form-item>
          </el-form>

          <div class="result-actions">
            <el-button @click="regenerate">重新生成</el-button>
            <el-button type="primary" @click="confirmOverview">确认概要</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Close, Cpu, Search, SetUp } from '@element-plus/icons-vue'
import type { UserProviderConfig, ProviderTemplate } from '../../../../shared/types'

// Props
const props = defineProps<{
  projectId: string
}>()

// Emits
const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 故事类型选项
const storyTypes = [
  { label: '武侠', value: 'wuxia' },
  { label: '仙侠', value: 'xianxia' },
  { label: '玄幻', value: 'xuanhuan' },
  { label: '科幻', value: 'kehuan' },
  { label: '悬疑', value: 'xuanyi' },
  { label: '都市', value: 'dushi' },
  { label: '言情', value: 'yanqing' },
  { label: '历史', value: 'lishi' },
  { label: '其他', value: 'other' }
]

// 表单数据
const form = ref({
  storyType: 'other',
  title: '',
  coreIdea: '',
  style: '',
  targetReader: '',
  estimatedLength: '',
  otherRequirements: ''
})

// 提供商配置
const providerConfigs = ref<UserProviderConfig[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])
const selectedModelKey = ref<string>('')
const modelSearchKeyword = ref('')

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
      supportsThinking?: boolean
      supportsWebSearch?: boolean
      supportsTools?: boolean
    }>
  }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const models: Array<{
      id: string
      name: string
      contextWindow: number
      type?: string
      supportsThinking?: boolean
      supportsWebSearch?: boolean
      supportsTools?: boolean
    }> = []

    const template = providerTemplates.value.find(t => t.id === config.templateId)

    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          type: model.type,
          supportsThinking: model.supportsThinking,
          supportsWebSearch: model.supportsWebSearch,
          supportsTools: model.supportsTools
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
  }
}

// 生成状态
const generating = ref(false)
const currentEventId = ref<string | null>(null)
const generatingContent = ref('')

// 生成结果
const generatedOverview = ref<{
  titleSuggestions: string[]
  selectedTitle: string
  summary: string
  coreConflict: string
  theme: string
  estimatedChapters: number
} | null>(null)

// 生成概要
async function generateOverview() {
  if (!form.value.coreIdea.trim()) {
    ElMessage.warning('请输入核心构思')
    return
  }

  if (!selectedModelKey.value) {
    ElMessage.warning('请选择 AI 模型')
    return
  }

  generating.value = true
  generatingContent.value = ''

  // 生成唯一事件 ID
  currentEventId.value = `overview-${props.projectId}-${Date.now()}`
  console.log(`[OverviewStage] 开始生成, eventId: ${currentEventId.value}`)

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      console.log(`[OverviewStage] 收到事件:`, event.type, event.content?.length || 0)
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        console.log(`[OverviewStage] 生成完成, 内容长度: ${generatingContent.value.length}`)
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        parseOverviewResult(generatingContent.value)
      } else if (event.type === 'error') {
        console.error(`[OverviewStage] 生成错误:`, event.error)
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 构建输入内容
  const input = `故事类型：${getStoryTypeLabel(form.value.storyType)}
核心构思：${form.value.coreIdea}
${form.value.style ? `风格：${form.value.style}` : ''}
${form.value.targetReader ? `目标读者：${form.value.targetReader}` : ''}
${form.value.estimatedLength ? `预估篇幅：${form.value.estimatedLength}` : ''}
${form.value.otherRequirements ? `其他要求：${form.value.otherRequirements}` : ''}`

  // 解析选中的模型
  const [providerConfigId, modelId] = selectedModelKey.value.split(':')
  console.log(`[OverviewStage] 调用 API, providerConfigId: ${providerConfigId}, modelId: ${modelId}`)

  // 调用 AI API，传递 eventId
  const result = await window.electronAPI.longwriting.generateStoryOverview(
    currentEventId.value,
    props.projectId,
    input,
    providerConfigId,
    modelId
  )

  console.log(`[OverviewStage] API 返回:`, result)
  if (!result.success) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 解析 AI 响应
function parseOverviewResult(content: string) {
  console.log(`[OverviewStage] 解析内容:`, content.substring(0, 500))
  try {
    // 尝试提取 JSON
    let jsonStr = content

    // 尝试移除可能的 markdown 代码块标记
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '')
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```\s*/g, '')
    }

    // 尝试找到 JSON 对象
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }

    // 清理 JSON 字符串中的控制字符
    let cleanJson = jsonMatch[0]
      .replace(/[\x00-\x1F\x7F]/g, '') // 移除控制字符
      .replace(/\n/g, ' ') // 将换行替换为空格

    const data = JSON.parse(cleanJson)

    const titles = data.title ? [data.title, `${data.title}传`, `${data.title}录`] : ['《未命名故事》']
    generatedOverview.value = {
      titleSuggestions: titles,
      selectedTitle: data.title || '',
      summary: data.summary || '',
      coreConflict: data.coreConflict || '',
      theme: data.theme || '',
      estimatedChapters: data.estimatedChapters || 100
    }

    if (data.title) {
      form.value.title = data.title
    }
    if (data.storyType) {
      form.value.storyType = data.storyType
    }

    emit('update:progress', 15)
  } catch (error) {
    console.error('解析 AI 响应失败:', error)
    // 如果 JSON 解析失败，尝试直接显示内容
    if (content.length > 50) {
      generatedOverview.value = {
        titleSuggestions: ['《未命名故事》'],
        selectedTitle: '',
        summary: content.substring(0, 500),
        coreConflict: '',
        theme: '',
        estimatedChapters: 100
      }
      ElMessage.warning('AI 返回格式不标准，已显示原始内容')
    } else {
      ElMessage.error('解析 AI 响应失败')
    }
  }
}

// 获取故事类型标签
function getStoryTypeLabel(value: string): string {
  const type = storyTypes.find(t => t.value === value)
  return type?.label || value
}

// 取消生成
function cancelGeneration() {
  if (!currentEventId.value) return
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
}

// 选择标题
function selectTitle(title: string) {
  if (generatedOverview.value) {
    generatedOverview.value.selectedTitle = title
  }
  form.value.title = title
}

// 重新生成
function regenerate() {
  generatedOverview.value = null
}

// 确认概要
async function confirmOverview() {
  if (!generatedOverview.value) return

  const finalTitle = generatedOverview.value.selectedTitle || generatedOverview.value.titleSuggestions[0]?.replace(/[《》]/g, '') || '未命名故事'

  const overviewData = {
    title: finalTitle,
    storyType: form.value.storyType,
    summary: generatedOverview.value.summary,
    coreConflict: generatedOverview.value.coreConflict,
    theme: generatedOverview.value.theme,
    estimatedChapters: generatedOverview.value.estimatedChapters
  }

  const result = await window.electronAPI.longwriting.updateStoryOverview(props.projectId, overviewData)

  if (result.success) {
    ElMessage.success('故事概要已保存')
    emit('update:progress', 20)
  } else {
    ElMessage.error(result.error || '保存失败')
  }
}

let unsubscribeConfig: (() => void) | null = null

// 加载已保存的故事概要
async function loadSavedOverview() {
  try {
    const result = await window.electronAPI.longwriting.getStoryOverview(props.projectId)
    if (result.success && result.data) {
      const data = result.data
      // 填充表单
      form.value.title = data.title || ''
      form.value.storyType = data.storyType || 'other'

      // 填充生成结果
      generatedOverview.value = {
        titleSuggestions: data.title ? [data.title] : [],
        selectedTitle: data.title || '',
        summary: data.summary || '',
        coreConflict: data.coreConflict || '',
        theme: data.theme || '',
        estimatedChapters: data.estimatedChapters || 100
      }
    }
  } catch (error) {
    console.error('加载故事概要失败:', error)
  }
}

onMounted(() => {
  loadProviderConfigs()
  loadSavedOverview()
  unsubscribeConfig = window.electronAPI.providerConfig.onChanged(() => {
    loadProviderConfigs()
  })
})

onUnmounted(() => {
  if (unsubscribeConfig) {
    unsubscribeConfig()
  }
})
</script>

<style lang="scss" scoped>
.overview-stage {
  max-width: 800px;
  margin: 0 auto;
}

.stage-header {
  margin-bottom: 24px;

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 8px 0;
  }

  .stage-desc {
    font-size: 14px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.overview-form {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.model-select {
  width: 100%;
}

.model-option {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 2px;

  .model-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .model-name {
      font-size: 13px;
      color: #334155;
    }

    .model-context {
      font-size: 11px;
      color: #94a3b8;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
    }
  }

  .model-features {
    display: flex;
    align-items: center;
    gap: 4px;

    .feature-icon {
      font-size: 12px;

      &.thinking {
        color: #67C23A;
      }

      &.websearch {
        color: #409EFF;
      }

      &.tools {
        color: #909399;
      }
    }
  }
}

.action-buttons {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.generating-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;

  .progress-text {
    margin-top: 8px;
    font-size: 14px;
    color: var(--text-color-secondary);
    text-align: center;
  }
}

.generated-result {
  margin-top: 32px;

  .result-content {
    background: var(--bg-color);
    padding: 24px;
    border-radius: 12px;
    border: 1px solid var(--border-color-light);
  }
}

.title-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.title-tag {
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}
</style>