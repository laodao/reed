<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑助手' : '创建助手'"
    width="800px"
    :close-on-click-modal="false"
    class="assistant-editor-dialog"
    @close="handleClose"
  >
    <div class="editor-container">
      <!-- 左侧菜单 -->
      <div class="editor-menu">
        <div
          v-for="item in menuItems"
          :key="item.key"
          class="menu-item"
          :class="{ active: activeMenu === item.key }"
          @click="activeMenu = item.key"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="editor-content">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="editor-form">
          <!-- 基本信息 -->
          <div v-show="activeMenu === 'basic'" class="content-section">
            <div class="section-header">
              <h3>基本信息</h3>
              <p>设置助手的基本属性</p>
            </div>

            <el-form-item label="头像" prop="avatar">
              <div class="avatar-picker">
                <div
                  v-for="emoji in avatarOptions"
                  :key="emoji"
                  class="avatar-option"
                  :class="{ selected: form.avatar === emoji }"
                  @click="form.avatar = emoji"
                >
                  {{ emoji }}
                </div>
              </div>
            </el-form-item>

            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入助手名称" maxlength="20" show-word-limit />
            </el-form-item>

            <el-form-item label="描述" prop="description">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="2"
                placeholder="请输入助手描述"
                maxlength="100"
                show-word-limit
              />
            </el-form-item>

            <el-form-item label="系统提示" prop="systemPrompt">
              <el-input
                v-model="form.systemPrompt"
                type="textarea"
                :rows="6"
                placeholder="请输入系统提示词，定义助手的角色和行为"
              />
            </el-form-item>
          </div>

          <!-- 模型设置 -->
          <div v-show="activeMenu === 'model'" class="content-section">
            <div class="section-header">
              <h3>模型设置</h3>
              <p>配置助手使用的 AI 模型</p>
            </div>

            <el-form-item label="默认模型">
              <el-select
                v-model="selectedModelKey"
                placeholder="选择默认模型"
                clearable
                class="model-select"
              >
                <el-option-group
                  v-for="provider in providerModels"
                  :key="provider.id"
                  :label="provider.name"
                >
                  <el-option
                    v-for="model in provider.models"
                    :key="`${provider.id}:${model.id}`"
                    :label="model.name"
                    :value="`${provider.id}:${model.id}`"
                  >
                    <div class="model-option">
                      <span class="model-name">{{ model.name }}</span>
                      <span class="model-context">{{ formatContext(model.contextWindow) }}</span>
                    </div>
                  </el-option>
                </el-option-group>
              </el-select>
              <div class="field-hint">留空则使用全局默认模型</div>
            </el-form-item>

            <el-form-item label="自动重置">
              <el-switch v-model="form.autoResetModel" />
              <span class="switch-hint">新建话题时重置为助手的默认模型</span>
            </el-form-item>
          </div>

          <!-- 知识库设置 -->
          <div v-show="activeMenu === 'knowledge'" class="content-section">
            <div class="section-header">
              <h3>知识库设置</h3>
              <p>关联知识库以增强助手的回答能力</p>
            </div>

            <el-form-item label="关联知识库">
              <el-select
                v-model="form.knowledgeBaseIds"
                multiple
                placeholder="选择要关联的知识库"
                class="knowledge-select"
              >
                <el-option
                  v-for="kb in knowledgeBases"
                  :key="kb.id"
                  :label="kb.name"
                  :value="kb.id"
                >
                  <div class="kb-option">
                    <span class="kb-name">{{ kb.name }}</span>
                    <span class="kb-count">{{ kb.documentCount }} 篇文档</span>
                  </div>
                </el-option>
              </el-select>
              <div class="field-hint">助手将在回答时参考关联的知识库内容</div>
            </el-form-item>

            <el-form-item label="检索数量">
              <el-slider
                v-model="form.knowledgeRetrieveCount"
                :min="1"
                :max="10"
                :step="1"
                show-input
                :show-input-controls="false"
                class="param-slider"
              />
              <span class="slider-hint">每次检索返回的相关片段数量</span>
            </el-form-item>

            <el-form-item label="相似度阈值">
              <el-slider
                v-model="form.knowledgeThreshold"
                :min="0"
                :max="1"
                :step="0.05"
                show-input
                :show-input-controls="false"
                class="param-slider"
              />
              <span class="slider-hint">只返回相似度高于此阈值的内容</span>
            </el-form-item>

            <!-- 知识库空状态 -->
            <div v-if="knowledgeBases.length === 0" class="empty-knowledge">
              <el-icon :size="48"><FolderOpened /></el-icon>
              <p>暂无可用的知识库</p>
              <el-button type="primary" text @click="handleGoToKnowledge">
                前往创建知识库
              </el-button>
            </div>
          </div>

          <!-- 生成参数 -->
          <div v-show="activeMenu === 'params'" class="content-section">
            <div class="section-header">
              <h3>生成参数</h3>
              <p>调整 AI 生成回答的行为参数</p>
              <el-button type="primary" text size="small" @click="resetParams">重置为默认</el-button>
            </div>

            <el-form-item label="温度">
              <div class="slider-row">
                <el-slider
                  v-model="form.temperature"
                  :min="0"
                  :max="2"
                  :step="0.1"
                  show-input
                  :show-input-controls="false"
                  class="param-slider"
                />
                <span class="slider-hint">较低值更确定，较高值更随机</span>
              </div>
            </el-form-item>

            <el-form-item label="Top P">
              <div class="slider-row">
                <el-slider
                  v-model="form.topP"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  show-input
                  :show-input-controls="false"
                  class="param-slider"
                />
                <span class="slider-hint">核采样参数</span>
              </div>
            </el-form-item>

            <el-form-item label="上下文数量">
              <div class="slider-row">
                <el-slider
                  v-model="form.maxContextMessages"
                  :min="1"
                  :max="100"
                  :step="1"
                  show-input
                  :show-input-controls="false"
                  class="param-slider"
                />
                <span class="slider-hint">保留在上下文中的消息数量</span>
              </div>
            </el-form-item>

            <el-form-item label="最大 Token">
              <div class="slider-row">
                <el-slider
                  v-model="form.maxTokens"
                  :min="256"
                  :max="8192"
                  :step="256"
                  show-input
                  :show-input-controls="false"
                  class="param-slider"
                />
                <span class="slider-hint">单次回答最大 Token 数</span>
              </div>
            </el-form-item>

            <el-form-item label="流式输出">
              <el-switch v-model="form.enableStream" />
              <span class="switch-hint">打字机效果输出</span>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Cpu, FolderOpened, Setting } from '@element-plus/icons-vue'
import type { Role, UserProviderConfig, ProviderTemplate, UpdateRoleRequest } from '../../../shared/types'
import type { AssistantLibraryTemplate } from '../../../shared/types/assistant-library.types'

// Props
const props = defineProps<{
  modelValue: boolean
  role?: Role  // 编辑时传入
  template?: AssistantLibraryTemplate  // 从模板创建时传入
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', role: Role): void
}>()

// 菜单项
const menuItems = [
  { key: 'basic', label: '基本信息', icon: User },
  { key: 'model', label: '模型设置', icon: Cpu },
  { key: 'knowledge', label: '知识库设置', icon: FolderOpened },
  { key: 'params', label: '生成参数', icon: Setting }
]

// 状态
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isEdit = computed(() => !!props.role)
const activeMenu = ref<'basic' | 'model' | 'knowledge' | 'params'>('basic')

// 表单
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  description: '',
  systemPrompt: '',
  avatar: '🤖',
  // 模型配置
  defaultModelId: '',
  defaultProviderConfigId: '',
  autoResetModel: true,
  // 知识库配置
  knowledgeBaseIds: [] as string[],
  knowledgeRetrieveCount: 3,
  knowledgeThreshold: 0.5,
  // 生成参数
  temperature: 0.7,
  topP: 1.0,
  maxContextMessages: 20,
  maxTokens: 4096,
  enableStream: true
})

// 头像选项
const avatarOptions = ['🤖', '💬', '🌐', '💻', '✍️', '📚', '🎨', '🎵', '🔬', '💼', '🎮', '🏥', '⚖️', '🔧', '📊', '🎯']

// 提供商配置列表
const providerConfigs = ref<UserProviderConfig[]>([])
// 提供商模板列表
const providerTemplates = ref<ProviderTemplate[]>([])
// 选中的模型键
const selectedModelKey = ref<string>('')
// 保存状态
const saving = ref(false)

// 知识库列表（暂时使用空数组，后续实现知识库功能）
const knowledgeBases = ref<Array<{ id: string; name: string; documentCount: number }>>([])

// 表单验证规则
const rules: FormRules = {
  name: [{ required: true, message: '请输入助手名称', trigger: 'blur' }]
}

// 提供商模型列表
const providerModels = computed(() => {
  const result: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow: number }> }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const models: Array<{ id: string; name: string; contextWindow: number }> = []
    const template = providerTemplates.value.find(t => t.id === config.templateId)
    const validModelIds = template ? new Set(template.models.map(m => m.id)) : null

    // 自定义模型
    if (config.customModels) {
      for (const model of config.customModels) {
        if (template && !template.allowCustomModels) continue
        if (!config.enabledModels || config.enabledModels.includes(model.id)) {
          models.push({
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow
          })
        }
      }
    }

    // 添加启用的模型
    if (config.enabledModels && models.length === 0) {
      for (const modelId of config.enabledModels) {
        if (validModelIds && !validModelIds.has(modelId)) continue
        models.push({
          id: modelId,
          name: modelId,
          contextWindow: 8192
        })
      }
    }

    // 使用模板默认模型
    if (models.length === 0 && template && template.models.length > 0) {
      for (const model of template.models) {
        models.push({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 8192
        })
      }
    }

    if (models.length > 0) {
      result.push({
        id: config.id,
        name: config.name,
        models
      })
    }
  }

  return result
})

// 加载提供商配置
async function loadProviderConfigs(): Promise<void> {
  try {
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.configs) {
      providerConfigs.value = response.configs.filter((c: UserProviderConfig) => c.isEnabled)
    }

    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

// 加载知识库列表
async function loadKnowledgeBases(): Promise<void> {
  // TODO: 实现知识库加载
  // 暂时为空
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

// 重置参数为默认值
function resetParams(): void {
  form.temperature = 0.7
  form.topP = 1.0
  form.maxContextMessages = 20
  form.maxTokens = 4096
  form.enableStream = true
}

// 前往知识库页面
function handleGoToKnowledge(): void {
  // TODO: 跳转到知识库页面
  ElMessage.info('请前往设置页面创建知识库')
}

// 关闭对话框
function handleClose(): void {
  visible.value = false
  formRef.value?.resetFields()
  // 重置表单
  form.name = ''
  form.description = ''
  form.systemPrompt = ''
  form.avatar = '🤖'
  form.defaultModelId = ''
  form.defaultProviderConfigId = ''
  form.autoResetModel = true
  form.knowledgeBaseIds = []
  form.knowledgeRetrieveCount = 3
  form.knowledgeThreshold = 0.5
  form.temperature = 0.7
  form.topP = 1.0
  form.maxContextMessages = 20
  form.maxTokens = 4096
  form.enableStream = true
  selectedModelKey.value = ''
  activeMenu.value = 'basic'
}

// 保存
async function handleSave(): Promise<void> {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // 解析模型选择
  if (selectedModelKey.value) {
    const parts = selectedModelKey.value.split(':')
    if (parts.length >= 2) {
      form.defaultProviderConfigId = parts[0]
      form.defaultModelId = parts.slice(1).join(':')
    }
  } else {
    form.defaultProviderConfigId = ''
    form.defaultModelId = ''
  }

  saving.value = true
  try {
    if (isEdit.value && props.role) {
      // 更新角色
      const updateData: UpdateRoleRequest = {
        name: form.name,
        description: form.description || undefined,
        systemPrompt: form.systemPrompt || undefined,
        avatar: form.avatar,
        defaultModelId: form.defaultModelId || undefined,
        defaultProviderConfigId: form.defaultProviderConfigId || undefined,
        autoResetModel: form.autoResetModel,
        temperature: form.temperature,
        topP: form.topP,
        maxContextMessages: form.maxContextMessages,
        maxTokens: form.maxTokens,
        enableStream: form.enableStream,
        // 知识库配置
        knowledgeBaseIds: form.knowledgeBaseIds.length > 0 ? form.knowledgeBaseIds : undefined,
        knowledgeRetrieveCount: form.knowledgeRetrieveCount,
        knowledgeThreshold: form.knowledgeThreshold
      }

      const response = await window.electronAPI.role.update(props.role.id, updateData)
      if (response.success) {
        ElMessage.success('助手已更新')
        // 返回更新后的角色数据
        const updatedRole: Role = {
          ...props.role,
          ...updateData,
          updatedAt: new Date()
        }
        emit('saved', updatedRole)
        handleClose()
      } else {
        ElMessage.error('更新失败')
      }
    } else {
      // 创建角色
      const response = await window.electronAPI.role.create({
        name: form.name,
        description: form.description || undefined,
        systemPrompt: form.systemPrompt || undefined,
        avatar: form.avatar,
        defaultModelId: form.defaultModelId || undefined,
        defaultProviderConfigId: form.defaultProviderConfigId || undefined,
        autoResetModel: form.autoResetModel,
        temperature: form.temperature,
        topP: form.topP,
        maxContextMessages: form.maxContextMessages,
        maxTokens: form.maxTokens,
        enableStream: form.enableStream,
        // 知识库配置
        knowledgeBaseIds: form.knowledgeBaseIds.length > 0 ? form.knowledgeBaseIds : undefined,
        knowledgeRetrieveCount: form.knowledgeRetrieveCount,
        knowledgeThreshold: form.knowledgeThreshold
      })

      if (response.success && response.role) {
        ElMessage.success('助手已创建')
        emit('saved', response.role)
        handleClose()
      } else {
        ElMessage.error(response.error || '创建失败')
      }
    }
  } catch (error) {
    console.error('保存助手失败:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

// 监听编辑角色
watch(
  () => props.role,
  (role) => {
    if (role) {
      form.name = role.name
      form.description = role.description || ''
      form.systemPrompt = role.systemPrompt || ''
      form.avatar = role.avatar || '🤖'
      form.defaultModelId = role.defaultModelId || ''
      form.defaultProviderConfigId = role.defaultProviderConfigId || ''
      form.autoResetModel = role.autoResetModel ?? true
      form.temperature = role.temperature ?? 0.7
      form.topP = role.topP ?? 1.0
      form.maxContextMessages = role.maxContextMessages ?? 20
      form.maxTokens = role.maxTokens ?? 4096
      form.enableStream = role.enableStream ?? true
      // 知识库配置
      form.knowledgeBaseIds = role.knowledgeBaseIds || []
      form.knowledgeRetrieveCount = role.knowledgeRetrieveCount ?? 5
      form.knowledgeThreshold = role.knowledgeThreshold ?? 0.5

      // 设置模型选择
      if (role.defaultProviderConfigId && role.defaultModelId) {
        selectedModelKey.value = `${role.defaultProviderConfigId}:${role.defaultModelId}`
      }
    }
  },
  { immediate: true }
)

// 监听模板创建
watch(
  () => props.template,
  (template) => {
    if (template) {
      form.name = template.name
      form.description = template.description
      form.systemPrompt = template.systemPrompt
      form.avatar = template.avatar
    }
  },
  { immediate: true }
)

// 对话框打开时加载配置
watch(visible, (val) => {
  if (val) {
    loadProviderConfigs()
    loadKnowledgeBases()
  }
})

onMounted(() => {
  loadProviderConfigs()
  loadKnowledgeBases()
})
</script>

<style lang="scss" scoped>
.assistant-editor-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }
}

.editor-container {
  display: flex;
  height: 500px;
  border-top: 1px solid #e2e8f0;
}

.editor-menu {
  width: 160px;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  padding: 12px 0;
  flex-shrink: 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #f1f5f9;
    color: #475569;
  }

  &.active {
    background: #fff;
    color: #3b82f6;
    font-weight: 500;
    border-left: 3px solid #3b82f6;
  }
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.content-section {
  // 动画过渡
}

.section-header {
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
  }

  p {
    margin: 4px 0 0;
    font-size: 12px;
    color: #94a3b8;
    width: 100%;
  }
}

.avatar-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.avatar-option {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #3b82f6;
    transform: scale(1.1);
  }

  &.selected {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
}

.model-select,
.knowledge-select {
  width: 100%;
}

.model-option,
.kb-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  .model-name,
  .kb-name {
    font-size: 13px;
    color: #334155;
  }

  .model-context,
  .kb-count {
    font-size: 11px;
    color: #94a3b8;
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
  }
}

.field-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.switch-hint {
  margin-left: 12px;
  font-size: 12px;
  color: #64748b;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.param-slider {
  flex: 1;

  :deep(.el-slider__runway) {
    height: 6px;
  }

  :deep(.el-slider__button) {
    width: 16px;
    height: 16px;
  }

  :deep(.el-input-number) {
    width: 80px;
  }
}

.slider-hint {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
  min-width: 140px;
}

.empty-knowledge {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;

  p {
    margin: 12px 0;
    font-size: 14px;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>