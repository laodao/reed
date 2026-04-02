<template>
  <div class="overview-stage">
    <div class="stage-header">
      <h2>故事概要设计</h2>
      <p class="stage-desc">输入核心故事构思，AI 将帮你生成完整的故事概要</p>
    </div>

    <div class="stage-content">
      <el-form :model="form" label-width="100px" class="overview-form">
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
            <el-option
              v-for="opt in styleOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <!-- 目标读者 -->
        <el-form-item label="目标读者">
          <el-select v-model="form.targetReader" placeholder="选择目标读者群体（可选）" clearable>
            <el-option
              v-for="opt in targetReaderOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <!-- 预估字数 -->
        <el-form-item label="预估字数">
          <el-select v-model="form.estimatedLength" placeholder="选择预估篇幅（可选）" clearable>
            <el-option
              v-for="opt in estimatedLengthOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
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
import { ref, computed, onMounted, inject, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Close } from '@element-plus/icons-vue'
import type { LongWritingGlobalSettings } from '../../../../shared/types/longwriting.types'

// Props
const props = defineProps<{
  projectId: string
}>()

// Emits
const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 从父组件获取选中的模型（是一个 ComputedRef 和一个 Ref）
const selectedModelKey = inject<ReturnType<typeof ref<string>>>('selectedModelKey', ref(''))
const selectedModel = inject<ReturnType<typeof computed<{ providerId: string; modelId: string } | null>>>('selectedModel', computed(() => null))

// 全局设置
const globalSettings = ref<LongWritingGlobalSettings | null>(null)

// 故事类型选项（从数据库加载）
const storyTypes = computed(() => {
  if (!globalSettings.value?.storyTypes?.length) {
    // 默认值
    return [
      { label: '武侠', value: '武侠' },
      { label: '仙侠', value: '仙侠' },
      { label: '玄幻', value: '玄幻' },
      { label: '科幻', value: '科幻' },
      { label: '悬疑', value: '悬疑' },
      { label: '都市', value: '都市' },
      { label: '言情', value: '言情' },
      { label: '历史', value: '历史' },
      { label: '其他', value: '其他' }
    ]
  }
  // 将数据库中的中文标签映射到 value
  return globalSettings.value.storyTypes.map(label => ({
    label,
    value: label
  }))
})

// 故事风格选项（从数据库加载）
const styleOptions = computed(() => {
  if (!globalSettings.value?.styles?.length) {
    return [
      { label: '轻松幽默', value: '轻松幽默' },
      { label: '沉重深刻', value: '沉重深刻' },
      { label: '热血激昂', value: '热血激昂' },
      { label: '冷峻沉稳', value: '冷峻沉稳' },
      { label: '通俗易懂', value: '通俗易懂' },
      { label: '文学性强', value: '文学性强' }
    ]
  }
  return globalSettings.value.styles.map(label => ({
    label,
    value: label
  }))
})

// 目标读者选项（从数据库加载）
const targetReaderOptions = computed(() => {
  if (!globalSettings.value?.targetReaders?.length) {
    return [
      { label: '青少年', value: '青少年' },
      { label: '青年', value: '青年' },
      { label: '中年', value: '中年' },
      { label: '全年龄', value: '全年龄' }
    ]
  }
  return globalSettings.value.targetReaders.map(label => ({
    label,
    value: label
  }))
})

// 预估字数选项（从数据库加载）
const estimatedLengthOptions = computed(() => {
  if (!globalSettings.value?.estimatedLengths?.length) {
    return [
      { label: '短篇小说（5万字以下）', value: '短篇小说（5万字以下）' },
      { label: '中篇小说（5-20万字）', value: '中篇小说（5-20万字）' },
      { label: '长篇小说（20万字以上）', value: '长篇小说（20万字以上）' }
    ]
  }
  return globalSettings.value.estimatedLengths.map(label => ({
    label,
    value: label
  }))
})

// 表单数据
const form = ref({
  storyType: '其他',
  title: '',
  coreIdea: '',
  style: '',
  targetReader: '',
  estimatedLength: '',
  otherRequirements: ''
})

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
  estimatedChapters: number
} | null>(null)

// 生成概要
async function generateOverview() {
  if (!form.value.coreIdea.trim()) {
    ElMessage.warning('请输入核心构思')
    return
  }

  // 检查是否选择了模型（需要确保 selectedModelKey 包含有效的 providerId:modelId 格式）
  if (!selectedModelKey.value || !selectedModelKey.value.includes(':')) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  // 解析选中的模型
  const [providerConfigId, modelId] = selectedModelKey.value.split(':')
  if (!providerConfigId || !modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  console.log('[OverviewStage] 生成概要, providerConfigId:', providerConfigId, 'modelId:', modelId)

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

  // 使用 toRaw 将响应式对象转换为普通对象
  const rawForm = toRaw(form.value)
  const rawOverview = toRaw(generatedOverview.value)

  const overviewData = {
    title: finalTitle,
    storyType: rawForm.storyType,
    coreIdea: rawForm.coreIdea,
    style: rawForm.style || undefined,
    targetReader: rawForm.targetReader || undefined,
    estimatedLength: rawForm.estimatedLength || undefined,
    otherRequirements: rawForm.otherRequirements || undefined,
    summary: rawOverview.summary,
    coreConflict: rawOverview.coreConflict,
    estimatedChapters: rawOverview.estimatedChapters
  }

  const result = await window.electronAPI.longwriting.updateStoryOverview(props.projectId, overviewData)

  if (result.success) {
    ElMessage.success('故事概要已保存')
    emit('update:progress', 20)
  } else {
    ElMessage.error(result.error || '保存失败')
  }
}

// 加载已保存的故事概要
async function loadSavedOverview() {
  try {
    const result = await window.electronAPI.longwriting.getStoryOverview(props.projectId)
    if (result.success && result.data) {
      const data = result.data
      // 填充表单
      form.value.title = data.title || ''
      form.value.storyType = data.storyType || '其他'
      form.value.coreIdea = data.coreIdea || ''
      form.value.style = data.style || ''
      form.value.targetReader = data.targetReader || ''
      form.value.estimatedLength = data.estimatedLength || ''
      form.value.otherRequirements = data.otherRequirements || ''

      // 填充生成结果
      generatedOverview.value = {
        titleSuggestions: data.title ? [data.title] : [],
        selectedTitle: data.title || '',
        summary: data.summary || '',
        coreConflict: data.coreConflict || '',
        estimatedChapters: data.estimatedChapters || 100
      }
    }
  } catch (error) {
    console.error('加载故事概要失败:', error)
  }
}

// 加载全局设置
async function loadGlobalSettings() {
  try {
    const result = await window.electronAPI.longwriting.getGlobalSettings()
    if (result.success && result.data) {
      globalSettings.value = result.data
    }
  } catch (error) {
    console.error('加载全局设置失败:', error)
  }
}

onMounted(() => {
  loadGlobalSettings()
  loadSavedOverview()
})
</script>

<style lang="scss" scoped>
.overview-stage {
  max-width: 800px;
  margin: 0 auto;
}

.stage-header {
  margin-bottom: 12px;

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 4px 0;
  }

  .stage-desc {
    font-size: 13px;
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