<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑提供商配置' : '添加提供商'"
    width="960px"
    :close-on-click-modal="false"
    class="add-provider-dialog"
    @close="handleClose"
  >
    <!-- 选择模板（仅新建时显示） -->
    <div v-if="!isEdit && !selectedTemplate" class="template-select">
      <h4>选择提供商类型</h4>

      <!-- 加载中状态 -->
      <div v-if="loadingTemplates" class="loading-templates">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在加载提供商模板...</span>
      </div>

      <!-- 模板列表 -->
      <div v-else-if="templates.length > 0" class="template-grid">
        <div
          v-for="template in templates"
          :key="template.id"
          class="template-card"
          @click="selectTemplate(template)"
        >
          <div class="template-icon">{{ template.icon }}</div>
          <div class="template-info">
            <span class="template-name">{{ template.name }}</span>
            <span class="template-desc">{{ template.description }}</span>
          </div>
        </div>
      </div>

      <!-- 加载失败 -->
      <div v-else class="load-error">
        <span>加载模板失败</span>
        <el-button type="primary" text @click="loadTemplates">重试</el-button>
      </div>
    </div>

    <!-- 配置表单 -->
    <el-form
      v-if="selectedTemplate || isEdit"
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      class="config-form"
    >
      <!-- 模板信息 -->
      <div v-if="!isEdit && selectedTemplate" class="selected-template">
        <span class="template-icon-lg">{{ selectedTemplate.icon }}</span>
        <div class="template-details">
          <span class="template-name">{{ selectedTemplate.name }}</span>
          <span class="template-desc">{{ selectedTemplate.description }}</span>
        </div>
      </div>

      <!-- 配置名称 -->
      <el-form-item label="配置名称" prop="name">
        <el-input v-model="form.name" placeholder="如：我的 OpenAI" />
      </el-form-item>

      <!-- API 密钥 -->
      <el-form-item
        v-if="templateAuthType !== 'none'"
        label="API 密钥"
        :prop="isEdit ? undefined : 'apiKey'"
      >
        <el-input
          v-model="form.apiKey"
          type="password"
          show-password
          :placeholder="isEdit ? '留空保持不变' : '请输入 API 密钥'"
        />
      </el-form-item>

      <!-- Access Key（火山引擎等需要签名认证的平台） -->
      <template v-if="selectedTemplate?.apiConfig?.requiresAccessKeyForModels">
        <el-form-item label="Access Key ID">
          <el-input
            v-model="form.accessKeyId"
            :placeholder="isEdit ? '留空保持不变' : '请输入 Access Key ID'"
          />
        </el-form-item>
        <el-form-item label="Access Key Secret">
          <el-input
            v-model="form.accessKeySecret"
            type="password"
            show-password
            :placeholder="isEdit ? '留空保持不变' : '请输入 Access Key Secret'"
          />
        </el-form-item>
        <div class="access-key-hint">
          <el-icon><InfoFilled /></el-icon>
          <span>Access Key 用于获取模型列表，API 密钥用于对话。可在火山引擎控制台的"API 访问密钥"中创建。</span>
        </div>
      </template>

      <!-- 高级设置 -->
      <el-collapse v-model="activeCollapse" class="advanced-settings">
        <el-collapse-item title="高级设置" name="advanced">
          <!-- API 端点 -->
          <el-form-item label="API 端点">
            <el-input
              v-model="form.baseUrl"
              :placeholder="defaultBaseUrl || '自定义 API 端点'"
            />
          </el-form-item>

          <!-- 自定义请求头 -->
          <el-form-item label="自定义请求头">
            <div class="custom-headers">
              <div v-for="(header, index) in customHeadersList" :key="index" class="header-item">
                <el-input v-model="header.key" placeholder="Header Name" class="header-key" />
                <el-input v-model="header.value" placeholder="Header Value" class="header-value" />
                <el-button type="danger" text @click="removeCustomHeader(index)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
              <el-button type="primary" text @click="addCustomHeader">
                <el-icon><Plus /></el-icon>
                添加请求头
              </el-button>
            </div>
          </el-form-item>
        </el-collapse-item>

        <!-- 模型管理 -->
        <el-collapse-item title="模型管理" name="models">
          <div class="model-management">
            <!-- 模型列表标题 -->
            <div class="model-list-header">
              <span>可用模型</span>
            </div>

            <!-- 模型列表 -->
            <div v-if="allModels.length > 0" class="predefined-models">
              <el-checkbox-group v-model="form.enabledModels" class="model-checkbox-group">
                <el-checkbox
                  v-for="model in allModels"
                  :key="model.id"
                  :label="model.id"
                  class="model-checkbox"
                  :class="{ 'is-custom': isCustomModel(model.id) }"
                >
                  <div class="model-info">
                    <span class="model-name">
                      {{ model.name }}
                      <el-tag v-if="isCustomModel(model.id)" type="warning" size="small" effect="plain">自定义</el-tag>
                    </span>
                    <span class="model-id">{{ model.id }}</span>
                  </div>
                </el-checkbox>
              </el-checkbox-group>
            </div>
            <div v-else class="no-models-hint">
              <span>暂无模型，请在下方添加自定义模型</span>
            </div>

            <!-- 自定义模型添加区域 -->
            <div v-if="selectedTemplate?.allowCustomModels" class="custom-models">
              <div class="model-list-header">
                <span>添加自定义模型</span>
                <el-button type="primary" text size="small" @click="showAddCustomModel = true">
                  添加模型
                </el-button>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 设为默认 -->
      <el-form-item label="设为默认" class="default-switch">
        <el-switch v-model="form.isDefault" />
        <span class="switch-hint">设为聊天默认使用的提供商</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="!isEdit && selectedTemplate" @click="selectedTemplate = null">
          返回
        </el-button>
        <el-button @click="handleClose">取消</el-button>
        <el-button
          v-if="selectedTemplate || isEdit"
          type="primary"
          :loading="testing"
          @click="handleTest"
        >
          测试连接
        </el-button>
        <el-button
          v-if="selectedTemplate || isEdit"
          type="primary"
          :loading="saving"
          @click="handleSave"
        >
          保存
        </el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 添加自定义模型对话框 -->
  <el-dialog
    v-model="showAddCustomModel"
    title="添加自定义模型"
    width="960px"
    append-to-body
    class="custom-model-dialog"
  >
    <el-form :model="customModelForm" label-width="120px">
      <el-form-item label="模型 ID" required>
        <el-input v-model="customModelForm.id" placeholder="如：gpt-4-custom" />
      </el-form-item>
      <el-form-item label="模型名称">
        <el-input v-model="customModelForm.name" placeholder="显示名称" />
      </el-form-item>
      <el-form-item label="上下文长度">
        <el-input-number v-model="customModelForm.contextWindow" :min="1024" :step="1024" style="width: 100%" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddCustomModel = false">取消</el-button>
      <el-button type="primary" @click="addCustomModel">添加</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, toRaw } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Delete, Plus, Loading } from '@element-plus/icons-vue'
import type {
  ProviderTemplate,
  ModelDefinition
} from '../../../../shared/types/provider-template.types'

// Props
const props = defineProps<{
  modelValue: boolean
  editConfig?: {
    id: string
    templateId: string
    name: string
    apiKey?: string
    baseUrl?: string
    customHeaders?: Record<string, string>
    customModels?: ModelDefinition[]
    enabledModels?: string[]
    isDefault: boolean
  }
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

// 状态
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isEdit = computed(() => !!props.editConfig)

// 模板列表
const templates = ref<ProviderTemplate[]>([])
const selectedTemplate = ref<ProviderTemplate | null>(null)

// 表单
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  apiKey: '',
  accessKeyId: '',
  accessKeySecret: '',
  baseUrl: '',
  customHeaders: {} as Record<string, string>,
  customModels: [] as ModelDefinition[],
  enabledModels: [] as string[],
  isDefault: false
})

// 自定义请求头列表
const customHeadersList = ref<Array<{ key: string; value: string }>>([])

// 折叠面板
const activeCollapse = ref<string[]>([])

// 加载状态
const saving = ref(false)
const testing = ref(false)
const loadingModels = ref(false)
const loadingTemplates = ref(false)

// 自定义模型对话框
const showAddCustomModel = ref(false)
const customModelForm = reactive({
  id: '',
  name: '',
  contextWindow: 8192
})

// 从 API 获取的模型列表
const apiModels = ref<ModelDefinition[]>([])

// 所有模型（模板预定义 + API 获取 + 自定义模型，自定义模型放最后）
const allModels = computed(() => {
  const templateModels = selectedTemplate.value?.models || []

  // 获取自定义模型的 ID 集合
  const customModelIds = new Set(form.customModels.map((m) => m.id))

  // 用于合并模板模型和 API 模型
  const modelsMap = new Map<string, ModelDefinition>()

  // 添加模板模型（排除自定义模型）
  templateModels.forEach((m) => {
    if (!customModelIds.has(m.id)) {
      modelsMap.set(m.id, m)
    }
  })

  // 添加 API 模型（排除自定义模型，会覆盖同 ID 的模板模型）
  apiModels.value.forEach((m) => {
    if (!customModelIds.has(m.id)) {
      modelsMap.set(m.id, m)
    }
  })

  // 预定义模型列表
  const predefinedModels = Array.from(modelsMap.values())

  // 自定义模型始终放到最后
  const customModelsList = [...form.customModels]

  return [...predefinedModels, ...customModelsList]
})

// 模板预定义模型
const templateModels = computed(() => selectedTemplate.value?.models || [])

// 判断是否是自定义模型
const isCustomModel = (modelId: string): boolean => {
  return form.customModels.some((m) => m.id === modelId)
}

// 认证类型
const templateAuthType = computed(() => selectedTemplate.value?.apiConfig.authType || 'bearer')

// 默认基础 URL
const defaultBaseUrl = computed(() => selectedTemplate.value?.apiConfig.baseUrl)

// 表单验证规则
const rules: FormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  apiKey: [
    {
      required: computed(() => templateAuthType.value !== 'none' && !isEdit.value),
      message: '请输入 API 密钥',
      trigger: 'blur'
    }
  ]
}

// 加载模板列表
const loadTemplates = async () => {
  loadingTemplates.value = true
  try {
    const result = await window.electronAPI.providerTemplate.list()
    console.log('加载模板结果:', result)
    if (result.success && result.templates) {
      templates.value = result.templates
    } else {
      console.error('加载模板失败:', result.error)
      ElMessage.error(result.error || '加载模板列表失败')
    }
  } catch (error) {
    console.error('加载模板列表失败:', error)
    ElMessage.error('加载模板列表失败')
  } finally {
    loadingTemplates.value = false
  }
}

// 选择模板
const selectTemplate = (template: ProviderTemplate) => {
  selectedTemplate.value = template
  form.name = `我的 ${template.name}`
  form.baseUrl = ''
  form.apiKey = ''
  form.enabledModels = template.models.map((m) => m.id)
  customHeadersList.value = []
  apiModels.value = []
}

// 从 API 获取模型列表
const fetchModelsFromApi = async () => {
  if (!selectedTemplate.value && !isEdit.value) return

  // 编辑模式下，如果没有输入新的 API Key，使用 configId 让后端从数据库读取
  // 新建模式下，需要检查是否输入了 API Key
  if (!isEdit.value && templateAuthType.value !== 'none' && !form.apiKey) {
    return
  }

  loadingModels.value = true
  try {
    const result = await window.electronAPI.providerConfig.test({
      configId: isEdit.value ? props.editConfig?.id : undefined,
      templateId: selectedTemplate.value?.id,
      apiKey: form.apiKey || undefined,
      accessKeyId: form.accessKeyId || undefined,
      accessKeySecret: form.accessKeySecret || undefined,
      baseUrl: form.baseUrl || undefined
    })

    if (result.success && result.models) {
      apiModels.value = result.models
      // 自动选中所有模型
      const newModelIds = result.models.map((m) => m.id)
      newModelIds.forEach((id) => {
        if (!form.enabledModels.includes(id)) {
          form.enabledModels.push(id)
        }
      })
      ElMessage.success(`获取到 ${result.models.length} 个模型`)
    } else {
      ElMessage.warning(result.message || '获取模型列表失败')
    }
  } catch (error) {
    console.error('获取模型列表失败:', error)
    ElMessage.error('获取模型列表失败')
  } finally {
    loadingModels.value = false
  }
}

// 测试连接
const handleTest = async () => {
  if (!selectedTemplate.value && !isEdit.value) return

  testing.value = true
  try {
    const result = await window.electronAPI.providerConfig.test({
      configId: isEdit.value ? props.editConfig?.id : undefined,
      templateId: selectedTemplate.value?.id,
      apiKey: form.apiKey || undefined,
      accessKeyId: form.accessKeyId || undefined,
      accessKeySecret: form.accessKeySecret || undefined,
      baseUrl: form.baseUrl || undefined
    })

    if (result.success) {
      ElMessage.success('连接成功')
      // 如果获取到模型，更新列表
      if (result.models && result.models.length > 0) {
        apiModels.value = result.models
      }
    } else {
      ElMessage.error(result.message || '连接失败')
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    ElMessage.error('测试连接失败')
  } finally {
    testing.value = false
  }
}

// 保存配置
const handleSave = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // 构建自定义请求头
  const customHeaders: Record<string, string> = {}
  customHeadersList.value.forEach((h) => {
    if (h.key && h.value) {
      customHeaders[h.key] = h.value
    }
  })

  saving.value = true
  try {
    // 将响应式对象转换为普通对象，避免 IPC 序列化问题
    const plainEnabledModels = toRaw(form.enabledModels)
    const plainCustomModels = toRaw(form.customModels)

    if (isEdit.value && props.editConfig) {
      // 更新配置
      const result = await window.electronAPI.providerConfig.update(props.editConfig.id, {
        name: form.name,
        apiKey: form.apiKey || undefined,
        accessKeyId: form.accessKeyId || undefined,
        accessKeySecret: form.accessKeySecret || undefined,
        baseUrl: form.baseUrl || undefined,
        customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
        customModels: plainCustomModels.length > 0 ? plainCustomModels : undefined,
        enabledModels: plainEnabledModels.length > 0 ? plainEnabledModels : undefined,
        isDefault: form.isDefault
      })

      if (result.success) {
        ElMessage.success('配置已更新')
        emit('saved')
        handleClose()
      } else {
        ElMessage.error(result.error || '更新失败')
      }
    } else if (selectedTemplate.value) {
      // 创建配置
      const result = await window.electronAPI.providerConfig.create({
        templateId: selectedTemplate.value.id,
        name: form.name,
        apiKey: form.apiKey || undefined,
        accessKeyId: form.accessKeyId || undefined,
        accessKeySecret: form.accessKeySecret || undefined,
        baseUrl: form.baseUrl || undefined,
        customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
        customModels: plainCustomModels.length > 0 ? plainCustomModels : undefined,
        enabledModels: plainEnabledModels.length > 0 ? plainEnabledModels : undefined,
        isDefault: form.isDefault
      })

      if (result.success) {
        ElMessage.success('配置已保存')
        emit('saved')
        handleClose()
      } else {
        ElMessage.error(result.error || '保存失败')
      }
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

// 关闭对话框
const handleClose = () => {
  visible.value = false
  selectedTemplate.value = null
  formRef.value?.resetFields()
  form.name = ''
  form.apiKey = ''
  form.accessKeyId = ''
  form.accessKeySecret = ''
  form.baseUrl = ''
  form.customHeaders = {}
  form.customModels = []
  form.enabledModels = []
  form.isDefault = false
  customHeadersList.value = []
  apiModels.value = []
  activeCollapse.value = []
}

// 添加自定义请求头
const addCustomHeader = () => {
  customHeadersList.value.push({ key: '', value: '' })
}

// 移除自定义请求头
const removeCustomHeader = (index: number) => {
  customHeadersList.value.splice(index, 1)
}

// 添加自定义模型
const addCustomModel = () => {
  if (!customModelForm.id) {
    ElMessage.warning('请输入模型 ID')
    return
  }

  form.customModels.push({
    id: customModelForm.id,
    name: customModelForm.name || customModelForm.id,
    contextWindow: customModelForm.contextWindow,
    maxOutputTokens: 4096,
    features: ['chat', 'streaming']
  })

  // 自动选中
  if (!form.enabledModels.includes(customModelForm.id)) {
    form.enabledModels.push(customModelForm.id)
  }

  // 重置表单
  customModelForm.id = ''
  customModelForm.name = ''
  customModelForm.contextWindow = 8192
  showAddCustomModel.value = false
}

// 移除自定义模型
const removeCustomModel = (modelId: string) => {
  const index = form.customModels.findIndex((m) => m.id === modelId)
  if (index > -1) {
    form.customModels.splice(index, 1)
  }
  // 从启用列表中移除
  const enabledIndex = form.enabledModels.indexOf(modelId)
  if (enabledIndex > -1) {
    form.enabledModels.splice(enabledIndex, 1)
  }
}

// 监听编辑配置
watch(
  () => props.editConfig,
  (config) => {
    if (config) {
      form.name = config.name
      form.apiKey = ''
      form.accessKeyId = config.accessKeyId || ''
      form.accessKeySecret = ''
      form.baseUrl = config.baseUrl || ''
      form.customModels = config.customModels ? [...config.customModels] : []
      form.enabledModels = config.enabledModels ? [...config.enabledModels] : []
      form.isDefault = config.isDefault

      // 转换自定义请求头
      if (config.customHeaders) {
        customHeadersList.value = Object.entries(config.customHeaders).map(([key, value]) => ({
          key,
          value
        }))
      }

      // 查找模板
      const template = templates.value.find((t) => t.id === config.templateId)
      if (template) {
        selectedTemplate.value = template
        // 如果配置中没有启用的模型，使用模板的默认模型
        if (form.enabledModels.length === 0 && template.models) {
          form.enabledModels = template.models.map((m) => m.id)
        }
      }
    }
  },
  { immediate: true }
)

// 监听模板列表加载完成，用于编辑模式下查找模板
watch(
  templates,
  (newTemplates) => {
    // 如果是编辑模式且还没有找到模板
    if (props.editConfig && !selectedTemplate.value && newTemplates.length > 0) {
      const template = newTemplates.find((t) => t.id === props.editConfig.templateId)
      if (template) {
        selectedTemplate.value = template
        // 如果配置中没有启用的模型，使用模板的默认模型
        if (form.enabledModels.length === 0 && template.models) {
          form.enabledModels = template.models.map((m) => m.id)
        }
      }
    }
  },
  { deep: true }
)

// 对话框打开时加载模板
watch(visible, (val) => {
  if (val) {
    loadTemplates()
  }
})

// 防抖定时器
let fetchModelsTimer: ReturnType<typeof setTimeout> | null = null

// 监听 API Key 变化，自动获取模型列表
watch(
  () => form.apiKey,
  (newApiKey, oldApiKey) => {
    // 只在新建模式下自动获取
    if (isEdit.value) return

    // 清除之前的定时器
    if (fetchModelsTimer) {
      clearTimeout(fetchModelsTimer)
    }

    // API Key 发生变化且有值时，延迟获取模型列表
    if (newApiKey && newApiKey !== oldApiKey && selectedTemplate.value) {
      // 防抖：延迟 500ms 后执行
      fetchModelsTimer = setTimeout(() => {
        fetchModelsFromApi()
      }, 500)
    }
  }
)
</script>

<style lang="scss" scoped>
.add-provider-dialog {
  // body 的 padding 在全局样式中设置
}

.template-select {
  height: 100%;
  overflow-y: auto;

  h4 {
    margin: 0 0 16px 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }
}

.loading-templates {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--text-secondary);

  .is-loading {
    animation: rotate 1s linear infinite;
  }
}

.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-secondary);
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.template-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    border-color: var(--color-primary-light);
    background: var(--bg-color-hover);
  }
}

.template-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: var(--bg-color-page);
  border-radius: var(--radius-md);
}

.template-icon-lg {
  font-size: 32px;
}

.template-info,
.template-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.template-desc {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selected-template {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-color-page);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.config-form {
  margin-top: 20px;
  height: calc(100% - 20px);
  overflow-y: auto;
}

.advanced-settings {
  margin: 20px 0;
  border: none;

  :deep(.el-collapse-item__header) {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    background: transparent;
    border-bottom: 1px solid var(--border-color-lighter);
  }

  :deep(.el-collapse-item__content) {
    padding: 16px 0 0;
  }
}

.custom-headers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-item {
  display: flex;
  gap: 8px;
  align-items: center;

  .header-key {
    width: 140px;
  }

  .header-value {
    flex: 1;
  }
}

.model-management {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.no-models-hint {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  background: var(--bg-color-page);
  border-radius: var(--radius-sm);
}

.access-key-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  margin-bottom: 16px;
  background: var(--el-color-warning-light-9);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--el-color-warning-dark-2);

  .el-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.model-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  span {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }
}

.model-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-checkbox {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-color-page);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-color-hover);
  }

  &.is-custom {
    background: linear-gradient(135deg, rgba(230, 162, 60, 0.1) 0%, rgba(230, 162, 60, 0.05) 100%);
    border: 1px dashed rgba(230, 162, 60, 0.4);
  }

  :deep(.el-checkbox__label) {
    display: flex;
    align-items: center;
    flex: 1;
  }
}

.model-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 1;
}

.model-name {
  font-size: 13px;
  color: var(--text-primary);
}

.model-id {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.custom-model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.default-switch {
  margin-top: 16px;

  .switch-hint {
    margin-left: 12px;
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.custom-model-dialog {
  :deep(.el-dialog__body) {
    max-height: 50vh;
    overflow-y: auto;
  }
}
</style>

<!-- 全局样式：控制对话框高度（el-dialog teleport 到 body，scoped 无效） -->
<style lang="scss">
.add-provider-dialog {
  .el-dialog {
    height: 80vh;
    display: flex;
    flex-direction: column;
    margin-top: 10vh !important;
    overflow: hidden;
  }

  .el-dialog__header {
    flex-shrink: 0;
  }

  .el-dialog__body {
    flex: 1;
    min-height: 0;
    padding: 20px 24px;
    overflow: hidden;
  }

  .el-dialog__footer {
    flex-shrink: 0;
  }
}
</style>
