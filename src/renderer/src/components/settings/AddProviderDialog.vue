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

      <!-- 提供商 ID -->
      <el-form-item label="提供商 ID" prop="shortId">
        <el-input
          v-model="form.shortId"
          placeholder="如：openai、deepseek（英文，用于模型显示）"
          :disabled="!!isEdit && !!editConfig?.shortId"
        />
        <div class="form-hint">提供商 ID 用于模型显示，格式为：提供商ID/模型ID</div>
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
              <el-button
                type="primary"
                text
                size="small"
                :loading="loadingModels"
                @click="fetchModelsFromApi"
              >
                从 API 刷新
              </el-button>
            </div>

            <!-- 模型列表 -->
            <div v-if="allModels.length > 0" class="predefined-models">
              <div v-for="model in allModels" :key="model.id" class="model-item">
                <!-- checkbox 只控制勾选状态，使用 value 而不是 label -->
                <el-checkbox
                  v-model="form.enabledModels"
                  :value="model.id"
                  class="model-checkbox"
                  :class="{ 'is-custom': isCustomModel(model.id) }"
                />
                <!-- 模型信息单独放 -->
                <div class="model-info">
                  <span class="model-name">
                    {{ model.name }}
                    <el-tag v-if="isCustomModel(model.id)" type="warning" size="small" effect="plain">自定义</el-tag>
                  </span>
                  <span class="model-id">{{ model.id }}</span>
                </div>
                <!-- 模型特性图标 -->
                <div class="model-features">
                  <!-- 模型类型图标 -->
                  <el-tooltip v-if="model.type === 'image'" content="图像模型" placement="top">
                    <el-icon class="feature-icon image"><Picture /></el-icon>
                  </el-tooltip>
                  <el-tooltip v-else-if="model.type === 'video'" content="视频模型" placement="top">
                    <el-icon class="feature-icon video"><VideoCamera /></el-icon>
                  </el-tooltip>
                  <el-tooltip v-else-if="model.type === 'multimodal'" content="多模态模型" placement="top">
                    <el-icon class="feature-icon multimodal"><Camera /></el-icon>
                  </el-tooltip>
                  <el-tooltip v-else content="文本模型" placement="top">
                    <el-icon class="feature-icon text"><Document /></el-icon>
                  </el-tooltip>
                  <!-- 深度思考 -->
                  <el-tooltip v-if="model.supportsThinking" content="支持深度思考" placement="top">
                    <el-icon class="feature-icon thinking"><Cpu /></el-icon>
                  </el-tooltip>
                  <!-- 联网搜索 -->
                  <el-tooltip v-if="model.supportsWebSearch" content="支持联网搜索" placement="top">
                    <el-icon class="feature-icon websearch"><Search /></el-icon>
                  </el-tooltip>
                  <!-- 工具支持 -->
                  <el-tooltip v-if="model.supportsTools" content="支持工具调用" placement="top">
                    <el-icon class="feature-icon tools"><SetUp /></el-icon>
                  </el-tooltip>
                </div>
                <!-- 模型操作按钮 -->
                <div class="model-actions">
                  <!-- 自定义模型可以编辑 -->
                  <el-button v-if="isCustomModel(model.id)" type="primary" text size="small" @click.stop="editCustomModel(model)">
                    编辑
                  </el-button>
                  <!-- 所有模型都可以移除（从列表中隐藏） -->
                  <el-button type="danger" text size="small" @click.stop="removeModel(model.id, isCustomModel(model.id))">
                    {{ isCustomModel(model.id) ? '删除' : '移除' }}
                  </el-button>
                </div>
              </div>
            </div>
            <div v-else class="no-models-hint">
              <span>{{ isEdit ? '暂无已启用模型，请点击"从 API 刷新"添加模型' : '暂无模型，请点击"从 API 刷新"获取模型列表' }}</span>
            </div>

            <!-- 自定义模型添加区域 -->
            <div v-if="selectedTemplate?.allowCustomModels" class="custom-models">
              <div class="model-list-header">
                <span>自定义模型</span>
                <el-button type="primary" text size="small" @click="showAddCustomModelDialog">
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

  <!-- 添加/编辑自定义模型对话框 -->
  <el-dialog
    v-model="showAddCustomModel"
    :title="isEditingCustomModel ? '编辑自定义模型' : '添加自定义模型'"
    width="480px"
    append-to-body
    class="custom-model-dialog"
  >
    <el-form :model="customModelForm" label-width="120px">
      <el-form-item label="模型 ID" required>
        <el-input
          v-model="customModelForm.id"
          placeholder="如：gpt-4-custom"
          :disabled="isEditingCustomModel"
        />
        <div v-if="isEditingCustomModel" class="form-hint">编辑时不可修改模型 ID</div>
      </el-form-item>
      <el-form-item label="模型名称">
        <el-input v-model="customModelForm.name" placeholder="显示名称" />
      </el-form-item>
      <el-form-item label="上下文长度">
        <el-input-number v-model="customModelForm.contextWindow" :min="1024" :step="1024" style="width: 100%" />
      </el-form-item>
      <el-form-item label="模型能力">
        <div class="model-capabilities">
          <el-checkbox v-model="customModelForm.supportsThinking">
            支持深度思考
          </el-checkbox>
          <div class="capability-hint">如 DeepSeek R1、OpenAI o1 等支持思维链的模型</div>
          <el-checkbox v-model="customModelForm.supportsWebSearch">
            支持联网搜索
          </el-checkbox>
          <div class="capability-hint">如 Perplexity sonar 等内置搜索功能的模型</div>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddCustomModel = false">取消</el-button>
      <el-button type="primary" @click="saveCustomModel">{{ isEditingCustomModel ? '保存' : '添加' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Delete, Plus, Loading, Picture, VideoCamera, Camera, Document, Cpu, Search, SetUp } from '@element-plus/icons-vue'
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
    shortId?: string
    apiKey?: string
    accessKeyId?: string
    accessKeySecret?: string
    baseUrl?: string
    customHeaders?: Record<string, string>
    customModels?: ModelDefinition[]
    enabledModels?: string[]
    apiModels?: ModelDefinition[]
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
  shortId: '',
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
const isEditingCustomModel = ref(false)
const editingModelId = ref<string | null>(null)
const customModelForm = reactive({
  id: '',
  name: '',
  contextWindow: 8192,
  supportsThinking: false,
  supportsWebSearch: false
})

// 从 API 获取的模型列表（只有点击"从 API 刷新"后才有值）
const apiModels = ref<ModelDefinition[]>([])

// 已保存的模型信息（从编辑配置加载，包含完整信息如名称、类型等）
const savedModelsInfo = ref<Map<string, ModelDefinition>>(new Map())

// 所有模型（默认只显示已启用模型 + 自定义模型，点击刷新后显示 API 模型）
const allModels = computed(() => {
  // 获取自定义模型的 ID 集合
  const customModelIds = new Set(form.customModels.map((m) => m.id))

  // 用于合并模型的 Map
  const modelsMap = new Map<string, ModelDefinition>()

  // 如果已从 API 获取模型，显示 API 模型（排除自定义模型）
  if (apiModels.value.length > 0) {
    apiModels.value.forEach((m) => {
      if (!customModelIds.has(m.id)) {
        modelsMap.set(m.id, m)
      }
    })
  } else {
    // 未从 API 获取时，只显示已启用的模型
    // 优先使用保存的完整模型信息，否则显示简化信息
    form.enabledModels.forEach((modelId) => {
      if (!customModelIds.has(modelId)) {
        const savedInfo = savedModelsInfo.value.get(modelId)
        modelsMap.set(modelId, savedInfo || {
          id: modelId,
          name: modelId,
          contextWindow: 8192,
          maxOutputTokens: 4096,
          features: ['chat', 'streaming']
        })
      }
    })
  }

  // 预定义模型列表
  const predefinedModels = Array.from(modelsMap.values())

  // 自定义模型始终放到最后
  const customModelsList = [...form.customModels]

  const result = [...predefinedModels, ...customModelsList]

  return result
})


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
  form.enabledModels = []  // 新建时默认不选中任何模型，用户需要手动勾选或从API刷新后勾选
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
      // 不再自动选中所有模型，用户需要手动勾选
      // 编辑模式下，已有的模型保持选中状态
      ElMessage.success(`获取到 ${result.models.length} 个模型，请勾选需要启用的模型`)
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
    // 使用 JSON 序列化/反序列化确保数据可被 IPC 传输
    // 这可以移除所有不可序列化的属性
    const safeStringify = (obj: any): any => {
      try {
        return JSON.parse(JSON.stringify(obj))
      } catch {
        return undefined
      }
    }

    // 将响应式对象转换为普通对象，避免 IPC 序列化问题
    const plainEnabledModels = safeStringify(form.enabledModels) || []
    const plainCustomModels = safeStringify(form.customModels) || []
    const plainApiModels = safeStringify(apiModels.value) || []

    console.log('[handleSave] 准备保存配置')
    console.log('[handleSave] plainEnabledModels:', plainEnabledModels)
    console.log('[handleSave] plainCustomModels:', plainCustomModels)
    console.log('[handleSave] plainApiModels:', plainApiModels)

    if (isEdit.value && props.editConfig) {
      // 更新配置
      const result = await window.electronAPI.providerConfig.update(props.editConfig.id, {
        name: form.name,
        shortId: form.shortId || undefined,
        apiKey: form.apiKey || undefined,
        accessKeyId: form.accessKeyId || undefined,
        accessKeySecret: form.accessKeySecret || undefined,
        baseUrl: form.baseUrl || undefined,
        customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
        customModels: plainCustomModels.length > 0 ? plainCustomModels : undefined,
        enabledModels: plainEnabledModels.length > 0 ? plainEnabledModels : undefined,
        apiModels: plainApiModels.length > 0 ? plainApiModels : undefined,
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
        shortId: form.shortId || undefined,
        apiKey: form.apiKey || undefined,
        accessKeyId: form.accessKeyId || undefined,
        accessKeySecret: form.accessKeySecret || undefined,
        baseUrl: form.baseUrl || undefined,
        customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
        customModels: plainCustomModels.length > 0 ? plainCustomModels : undefined,
        enabledModels: plainEnabledModels.length > 0 ? plainEnabledModels : undefined,
        apiModels: plainApiModels.length > 0 ? plainApiModels : undefined,
        isDefault: form.isDefault
      })

      if (result.success && result.config) {
        // 创建成功后，调用测试接口保存测试结果
        // 这样第一次添加时也能显示"已验证"状态
        try {
          await window.electronAPI.providerConfig.test({
            configId: result.config.id
          })
        } catch (testError) {
          // 测试失败不影响创建成功的提示
          console.warn('创建后测试连接失败:', testError)
        }

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
  form.shortId = ''
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
  savedModelsInfo.value = new Map()
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

// 显示添加自定义模型对话框
const showAddCustomModelDialog = () => {
  isEditingCustomModel.value = false
  editingModelId.value = null
  customModelForm.id = ''
  customModelForm.name = ''
  customModelForm.contextWindow = 8192
  customModelForm.supportsThinking = false
  customModelForm.supportsWebSearch = false
  showAddCustomModel.value = true
}

// 编辑自定义模型
const editCustomModel = (model: ModelDefinition) => {
  isEditingCustomModel.value = true
  editingModelId.value = model.id
  customModelForm.id = model.id
  customModelForm.name = model.name
  customModelForm.contextWindow = model.contextWindow || 8192
  customModelForm.supportsThinking = model.supportsThinking || false
  customModelForm.supportsWebSearch = model.supportsWebSearch || false
  showAddCustomModel.value = true
}

// 删除自定义模型
const deleteCustomModel = (modelId: string) => {
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

// 移除模型（支持所有类型的模型）
const removeModel = (modelId: string, isCustom: boolean) => {
  if (isCustom) {
    // 自定义模型：从 customModels 中删除
    deleteCustomModel(modelId)
  } else {
    // API 获取的模型：仅从启用列表中移除（取消勾选）
    const enabledIndex = form.enabledModels.indexOf(modelId)
    if (enabledIndex > -1) {
      form.enabledModels.splice(enabledIndex, 1)
    }
  }
}

// 添加或更新自定义模型
const saveCustomModel = () => {
  if (!customModelForm.id) {
    ElMessage.warning('请输入模型 ID')
    return
  }

  if (isEditingCustomModel.value && editingModelId.value) {
    // 编辑模式：更新现有模型
    const index = form.customModels.findIndex((m) => m.id === editingModelId.value)
    if (index > -1) {
      // 如果 ID 改变了，需要更新启用列表
      if (editingModelId.value !== customModelForm.id) {
        const enabledIndex = form.enabledModels.indexOf(editingModelId.value)
        if (enabledIndex > -1) {
          form.enabledModels.splice(enabledIndex, 1, customModelForm.id)
        }
      }
      form.customModels[index] = {
        id: customModelForm.id,
        name: customModelForm.name || customModelForm.id,
        contextWindow: customModelForm.contextWindow,
        maxOutputTokens: 4096,
        features: ['chat', 'streaming'],
        supportsThinking: customModelForm.supportsThinking,
        supportsWebSearch: customModelForm.supportsWebSearch
      }
    }
  } else {
    // 添加模式：检查 ID 是否已存在
    if (form.customModels.some((m) => m.id === customModelForm.id)) {
      ElMessage.warning('该模型 ID 已存在')
      return
    }

    form.customModels.push({
      id: customModelForm.id,
      name: customModelForm.name || customModelForm.id,
      contextWindow: customModelForm.contextWindow,
      maxOutputTokens: 4096,
      features: ['chat', 'streaming'],
      supportsThinking: customModelForm.supportsThinking,
      supportsWebSearch: customModelForm.supportsWebSearch
    })

    // 自动选中
    if (!form.enabledModels.includes(customModelForm.id)) {
      form.enabledModels.push(customModelForm.id)
    }
  }

  // 重置表单并关闭对话框
  customModelForm.id = ''
  customModelForm.name = ''
  customModelForm.contextWindow = 8192
  customModelForm.supportsThinking = false
  customModelForm.supportsWebSearch = false
  isEditingCustomModel.value = false
  editingModelId.value = null
  showAddCustomModel.value = false
}


// 监听编辑配置
watch(
  () => props.editConfig,
  (config) => {
    console.log('[watch editConfig] 触发, config:', config)
    if (config) {
      form.name = config.name
      form.shortId = config.shortId || ''
      form.apiKey = ''
      form.accessKeyId = config.accessKeyId || ''
      form.accessKeySecret = ''
      form.baseUrl = config.baseUrl || ''
      form.customModels = config.customModels ? [...config.customModels] : []
      form.enabledModels = config.enabledModels ? [...config.enabledModels] : []
      form.isDefault = config.isDefault

      // 不自动加载 apiModels，只加载已保存模型的完整信息
      // 用户需要点击"从 API 刷新"才会显示所有模型
      apiModels.value = []
      savedModelsInfo.value = new Map()
      if (config.apiModels) {
        // 将已保存的 API 模型信息存入 savedModelsInfo，用于显示已启用模型的详细信息
        config.apiModels.forEach(m => {
          if (form.enabledModels.includes(m.id)) {
            savedModelsInfo.value.set(m.id, m)
          }
        })
      }

      // 转换自定义请求头
      if (config.customHeaders) {
        customHeadersList.value = Object.entries(config.customHeaders).map(([key, value]) => ({
          key,
          value
        }))
      } else {
        customHeadersList.value = []
      }

      // 查找模板
      const template = templates.value.find((t) => t.id === config.templateId)
      console.log('[watch editConfig] 找到模板:', template ? template.name : null, 'templates数量:', templates.value.length)
      if (template) {
        selectedTemplate.value = template
        // 编辑模式下，保持已有的 enabledModels，不自动填充模板默认模型
        // 如果需要添加模型，用户需要手动勾选或从API刷新后勾选
      } else {
        // 模板还没加载，等待模板加载完成后再设置
        console.log('[watch editConfig] 模板未找到，等待加载...')
      }
    } else {
      // editConfig 被清除时，重置状态
      selectedTemplate.value = null
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
        // 编辑模式下，保持已有的 enabledModels，不自动填充模板默认模型
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

.model-name {
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.model-id {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-color-page);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-color-hover);
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.model-checkbox {
  flex-shrink: 0;

  &.is-custom {
    :deep(.el-checkbox__inner) {
      border-color: rgba(230, 162, 60, 0.6);
    }
  }
}

.model-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.model-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.model-features {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;

  .feature-icon {
    font-size: 14px;
    padding: 2px;
    border-radius: 4px;

    &.text {
      color: #909399;
    }

    &.image {
      color: #E6A23C;
    }

    &.video {
      color: #F56C6C;
    }

    &.multimodal {
      color: #409EFF;
    }

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

.predefined-models {
  max-height: 300px;
  overflow-y: auto;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.model-capabilities {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.capability-hint {
  margin-top: 2px;
  margin-left: 24px;
  font-size: 11px;
  color: var(--text-secondary);
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
