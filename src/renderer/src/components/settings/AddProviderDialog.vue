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
          <div class="template-icon">
            <FaviconIcon :url="template.siteUrl" :size="24" :fallback="template.icon" />
          </div>
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

    <!-- 主内容区（选择模板后或编辑模式） -->
    <div v-if="selectedTemplate || isEdit" class="provider-content">
      <!-- 左侧 Tab 导航 -->
      <div class="provider-tabs">
        <div
          class="tab-item"
          :class="{ active: activeTab === 'info' }"
          @click="activeTab = 'info'"
        >
          <el-icon><Setting /></el-icon>
          <span>提供商信息</span>
        </div>
        <div
          class="tab-item"
          :class="{ active: activeTab === 'models' }"
          @click="activeTab = 'models'"
        >
          <el-icon><List /></el-icon>
          <span>模型管理</span>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="provider-main">
        <!-- 提供商信息 Tab -->
        <div v-show="activeTab === 'info'" class="tab-content info-tab">
          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-width="100px"
            class="config-form"
          >
            <!-- 模板信息 -->
            <div v-if="!isEdit && selectedTemplate" class="selected-template">
              <span class="template-icon-lg">
                <FaviconIcon :url="selectedTemplate.siteUrl" :size="32" :fallback="selectedTemplate.icon" />
              </span>
              <div class="template-details">
                <span class="template-name">{{ selectedTemplate.name }}</span>
                <span class="template-desc">{{ selectedTemplate.description }}</span>
              </div>
            </div>

            <!-- 模板使用须知（模板数据驱动，界面不写死厂商文案） -->
            <el-alert
              v-if="usageNotes.length > 0"
              type="warning"
              :closable="false"
              class="template-usage-notes"
            >
              <template #title>使用须知</template>
              <ul class="usage-notes-list">
                <li v-for="(note, index) in usageNotes" :key="index">{{ note }}</li>
              </ul>
            </el-alert>

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
                :placeholder="apiKeyPlaceholder"
                @blur="handleApiKeyBlur"
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
                    :placeholder="defaultBaseUrl || '自定义 API 端点（用于文本对话）'"
                  />
                  <div class="form-hint">用于文本对话的 API 端点</div>
                </el-form-item>

                <!-- 多模态 API 端点 -->
                <el-divider content-position="left">多模态 API 端点</el-divider>
                <div class="multimodal-urls-hint">
                  <el-icon><InfoFilled /></el-icon>
                  <span>部分提供商的图像/视频/语音模型使用不同的 API 端点，如需使用请单独配置</span>
                </div>

                <!-- 图像 API 端点 -->
                <el-form-item label="图像 API">
                  <el-input
                    v-model="form.imageBaseUrl"
                    :placeholder="defaultImageBaseUrl || '图像生成 API 端点（留空则使用默认）'"
                  />
                </el-form-item>

                <!-- 视频 API 端点 -->
                <el-form-item label="视频 API">
                  <el-input
                    v-model="form.videoBaseUrl"
                    :placeholder="defaultVideoBaseUrl || '视频生成 API 端点（留空则使用默认）'"
                  />
                </el-form-item>

                <!-- 语音 API 端点 -->
                <el-form-item label="语音 API">
                  <el-input
                    v-model="form.audioBaseUrl"
                    :placeholder="defaultAudioBaseUrl || '语音生成 API 端点（留空则使用默认）'"
                  />
                </el-form-item>

                <!-- 自定义请求头 -->
                <el-divider content-position="left">自定义设置</el-divider>
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
            </el-collapse>

            <!-- 设为默认 -->
            <el-form-item label="设为默认" class="default-switch">
              <el-switch v-model="form.isDefault" />
              <span class="switch-hint">设为聊天默认使用的提供商</span>
            </el-form-item>
          </el-form>
        </div>

        <!-- 模型管理 Tab -->
        <div v-show="activeTab === 'models'" class="tab-content models-tab">
          <!-- API 模型区域 -->
          <div class="model-section">
            <div class="section-header">
              <span class="section-title">API 模型</span>
              <div v-if="apiModels.length > 0" class="model-search">
                <el-input
                  v-model="apiModelSearch"
                  placeholder="搜索模型"
                  clearable
                  size="small"
                >
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
              </div>
              <el-button
                type="primary"
                size="small"
                :loading="loadingModels"
                @click="fetchModelsFromApi"
              >
                <el-icon><Refresh /></el-icon>
                从 API 刷新
              </el-button>
            </div>

            <div v-if="apiModels.length > 0" class="model-list api-models">
              <div
                v-for="model in filteredApiModels"
                :key="model.id"
                class="model-card"
                :class="{ enabled: isModelEnabled(model.id) }"
              >
                <div class="model-card-main">
                  <div class="model-card-info">
                    <span class="model-name">{{ model.name }}</span>
                  </div>
                  <div class="model-card-features">
                    <el-tooltip v-if="model.type === 'multimodal'" content="多模态" placement="top">
                      <el-icon class="feature-icon multimodal"><Grid /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'image'" content="图像生成" placement="top">
                      <el-icon class="feature-icon image"><PictureFilled /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'video'" content="视频生成" placement="top">
                      <el-icon class="feature-icon video"><Film /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'audio'" content="音频" placement="top">
                      <el-icon class="feature-icon audio"><Mic /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'embedding'" content="嵌入" placement="top">
                      <el-icon class="feature-icon embedding"><Coin /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'rerank'" content="重排序" placement="top">
                      <el-icon class="feature-icon rerank"><Sort /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsThinking" content="深度思考" placement="top">
                      <el-icon class="feature-icon thinking"><MagicStick /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsWebSearch" content="联网搜索" placement="top">
                      <el-icon class="feature-icon websearch"><Search /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsTools" content="工具调用" placement="top">
                      <el-icon class="feature-icon tools"><Tools /></el-icon>
                    </el-tooltip>
                  </div>
                </div>
                <div class="model-card-actions">
                  <el-tooltip v-if="!isModelEnabled(model.id)" content="添加到启用列表" placement="top">
                    <el-button
                      type="primary"
                      size="small"
                      circle
                      @click="addModelToEnabled(model)"
                    >
                      <el-icon><Plus /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip v-else content="已启用" placement="top">
                    <el-icon class="enabled-icon"><CircleCheckFilled /></el-icon>
                  </el-tooltip>
                </div>
              </div>
              <div v-if="filteredApiModels.length === 0" class="empty-hint search-empty">
                <span>没有匹配"{{ apiModelSearch }}"的模型</span>
              </div>
            </div>
            <div v-else class="empty-hint">
              <span>暂无 API 模型，请点击"从 API 刷新"获取模型列表</span>
            </div>
          </div>

          <!-- 已启用模型区域 -->
          <div class="model-section">
            <div class="section-header">
              <span class="section-title">已启用模型</span>
              <el-button
                v-if="selectedTemplate?.allowCustomModels"
                type="primary"
                size="small"
                plain
                @click="showAddCustomModelDialog"
              >
                <el-icon><Plus /></el-icon>
                添加自定义模型
              </el-button>
            </div>
            <div v-if="enabledModelList.length > 0" class="model-list enabled-models">
              <div
                v-for="model in enabledModelList"
                :key="model.id"
                class="model-card enabled"
              >
                <div class="model-card-main">
                  <div class="model-card-info">
                    <span class="model-name">
                      {{ model.name }}
                      <el-tag v-if="isCustomModel(model.id)" type="warning" size="small">自定义</el-tag>
                    </span>
                  </div>
                  <div class="model-card-features">
                    <el-tooltip v-if="model.type === 'multimodal'" content="多模态" placement="top">
                      <el-icon class="feature-icon multimodal"><Grid /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'image'" content="图像生成" placement="top">
                      <el-icon class="feature-icon image"><PictureFilled /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'video'" content="视频生成" placement="top">
                      <el-icon class="feature-icon video"><Film /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'audio'" content="音频" placement="top">
                      <el-icon class="feature-icon audio"><Mic /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'embedding'" content="嵌入" placement="top">
                      <el-icon class="feature-icon embedding"><Coin /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-else-if="model.type === 'rerank'" content="重排序" placement="top">
                      <el-icon class="feature-icon rerank"><Sort /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsThinking" content="深度思考" placement="top">
                      <el-icon class="feature-icon thinking"><MagicStick /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsWebSearch" content="联网搜索" placement="top">
                      <el-icon class="feature-icon websearch"><Search /></el-icon>
                    </el-tooltip>
                    <el-tooltip v-if="model.supportsTools" content="工具调用" placement="top">
                      <el-icon class="feature-icon tools"><Tools /></el-icon>
                    </el-tooltip>
                  </div>
                </div>
                <div class="model-card-actions">
                  <el-tooltip content="编辑模型" placement="top">
                    <el-button type="primary" text size="small" @click="editModelCapabilities(model)">
                      <el-icon><EditPen /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="从启用列表移除" placement="top">
                    <el-button type="danger" text size="small" @click="removeModelFromEnabled(model.id)">
                      <el-icon><Remove /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </div>
            </div>
            <div v-else class="empty-hint">
              <span>暂无启用的模型，请从 API 模型列表中添加或添加自定义模型</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="!isEdit && selectedTemplate" @click="selectedTemplate = null">
          返回
        </el-button>
        <el-button @click="handleClose">取消</el-button>
        <el-button
          v-if="selectedTemplate || isEdit"
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

  <!-- 添加/编辑模型对话框 -->
  <el-dialog
    v-model="showAddCustomModel"
    :title="isEditingApiModel ? '添加模型' : (isEditingCustomModel ? '编辑模型' : '添加模型')"
    width="500px"
    append-to-body
    class="custom-model-dialog"
  >
    <el-form :model="customModelForm" label-width="100px">
      <el-form-item label="模型 ID" required>
        <el-input
          v-model="customModelForm.id"
          placeholder="如：gpt-4-custom"
          :disabled="isEditingCustomModel && !isEditingApiModel"
        />
        <div v-if="isEditingCustomModel && !isEditingApiModel" class="form-hint">编辑时不可修改模型 ID</div>
      </el-form-item>
      <el-form-item label="模型名称">
        <el-input v-model="customModelForm.name" placeholder="显示名称" />
      </el-form-item>
      <el-form-item label="上下文长度">
        <el-input-number v-model="customModelForm.contextWindow" :min="1024" :step="1024" style="width: 100%" />
      </el-form-item>
      <el-form-item label="模型类型">
        <el-select v-model="customModelForm.type" placeholder="选择模型类型" style="width: 100%">
          <el-option label="文本模型" value="text" />
          <el-option label="多模态模型（支持图片）" value="multimodal" />
          <el-option label="图像生成模型" value="image" />
          <el-option label="视频生成模型" value="video" />
          <el-option label="音频模型" value="audio" />
          <el-option label="嵌入模型" value="embedding" />
          <el-option label="重排序模型" value="rerank" />
        </el-select>
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
          <el-checkbox v-model="customModelForm.supportsTools">
            支持工具调用
          </el-checkbox>
          <div class="capability-hint">支持函数调用/工具使用的模型</div>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddCustomModel = false">取消</el-button>
      <el-button type="primary" @click="saveCustomModel">{{ isEditingApiModel ? '添加' : (isEditingCustomModel ? '保存' : '添加') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Delete, Plus, Loading, Search, Refresh, InfoFilled, Setting, List, Grid, PictureFilled, Film, Mic, Coin, Sort, MagicStick, Tools, EditPen, Remove, CircleCheckFilled } from '@element-plus/icons-vue'
import FaviconIcon from '@/components/common/FaviconIcon.vue'
import type {
  ProviderTemplate,
  ModelDefinition,
  UserProviderConfig
} from '../../../../shared/types/provider-template.types'

// Props
const props = defineProps<{
  modelValue: boolean
  editConfig?: UserProviderConfig
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
  imageBaseUrl: '',
  videoBaseUrl: '',
  audioBaseUrl: '',
  customHeaders: {} as Record<string, string>,
  models: [] as ModelDefinition[],  // 统一使用 models 存储所有启用的模型
  isDefault: false
})

// 自定义请求头列表
const customHeadersList = ref<Array<{ key: string; value: string }>>([])

// 折叠面板
const activeCollapse = ref<string[]>([])

// Tab 状态
const activeTab = ref<'info' | 'models'>('info')

// 加载状态
const saving = ref(false)
const testing = ref(false)
const loadingModels = ref(false)
const loadingTemplates = ref(false)

// 自定义模型对话框
const showAddCustomModel = ref(false)
const isEditingCustomModel = ref(false)
const editingModelId = ref<string | null>(null)
const isEditingApiModel = ref(false) // 是否正在编辑 API 模型
const customModelForm = reactive({
  id: '',
  name: '',
  contextWindow: 8192,
  type: 'text' as ModelDefinition['type'],
  supportsThinking: false,
  supportsWebSearch: false,
  supportsTools: false
})

// 从 API 获取的模型列表（用于与现有模型对比）
const apiModels = ref<ModelDefinition[]>([])

// API 模型搜索关键字
const apiModelSearch = ref('')

// 过滤后的 API 模型列表
const filteredApiModels = computed(() => {
  const keyword = apiModelSearch.value.trim().toLowerCase()
  if (!keyword) return apiModels.value
  return apiModels.value.filter(
    (m) => m.id.toLowerCase().includes(keyword) || (m.name || '').toLowerCase().includes(keyword)
  )
})

// 判断是否是自定义模型（不在 API 列表中的模型）
const isCustomModel = (modelId: string): boolean => {
  return !apiModels.value.some((m) => m.id === modelId)
}

// 判断模型是否已启用
const isModelEnabled = (modelId: string): boolean => {
  return form.models.some((m) => m.id === modelId)
}

// 添加 API 模型到启用列表（弹出对话框让用户确认）
const addApiModelToEnabled = (model: ModelDefinition) => {
  // 检查是否已存在
  if (form.models.some((m) => m.id === model.id)) {
    ElMessage.warning('该模型已在启用列表中')
    return
  }
  // 打开对话框让用户确认模型信息
  isEditingCustomModel.value = false
  isEditingApiModel.value = true
  editingModelId.value = model.id
  // 预填充模型信息
  customModelForm.id = model.id
  customModelForm.name = model.name || model.id
  customModelForm.contextWindow = model.contextWindow || 8192
  customModelForm.type = model.type || 'text'
  customModelForm.supportsThinking = model.supportsThinking || false
  customModelForm.supportsWebSearch = model.supportsWebSearch || false
  customModelForm.supportsTools = model.supportsTools || false
  showAddCustomModel.value = true
}

// 别名，用于模板
const addModelToEnabled = addApiModelToEnabled

// 从启用列表移除模型
const removeModelFromEnabled = (modelId: string) => {
  const index = form.models.findIndex((m) => m.id === modelId)
  if (index > -1) {
    form.models.splice(index, 1)
    ElMessage.success('已从启用列表移除')
  }
}

// 获取已启用的模型列表
const enabledModelsWithInfo = computed(() => {
  return form.models
})

// 别名，用于模板
const enabledModelList = enabledModelsWithInfo

// 认证类型
const templateAuthType = computed(() => selectedTemplate.value?.apiConfig.authType || 'bearer')

// 免密钥模板（如 llama.cpp 本地推理）：密钥可留空
const apiKeyOptional = computed(() => selectedTemplate.value?.apiKeyOptional === true)

// 使用须知（模板声明，如阿里百炼 Token Plan 的地域/限额/密钥隔离/使用范围限制）
const usageNotes = computed(() => selectedTemplate.value?.usageNotes ?? [])

// API Key 输入占位（模板声明的前缀提示，如 sk-sp-）
const apiKeyPlaceholder = computed(() => {
  if (isEdit.value) return '留空保持不变'
  if (apiKeyOptional.value) return '可留空（服务器启用 --api-key 时才需填写）'
  const prefix = selectedTemplate.value?.apiKeyPrefix
  return prefix ? `请输入 ${prefix} 开头的专属密钥` : '请输入 API 密钥'
})

// 前缀不符时提醒一次（非阻断：中转/代理场景前缀可能不同，硬拦会误伤）
const apiKeyPrefixWarned = ref(false)
const handleApiKeyBlur = () => {
  const prefix = selectedTemplate.value?.apiKeyPrefix
  const key = form.apiKey.trim()
  if (!prefix || !key || apiKeyPrefixWarned.value) return
  if (key.startsWith(prefix)) return
  apiKeyPrefixWarned.value = true
  ElMessage.warning(
    `${selectedTemplate.value?.name || '当前模板'} 的密钥应以 ${prefix} 开头，请确认没有与按量计费密钥混用`
  )
}

// 默认基础 URL
const defaultBaseUrl = computed(() => selectedTemplate.value?.apiConfig.baseUrl)
const defaultImageBaseUrl = computed(() => selectedTemplate.value?.apiConfig.imageBaseUrl)
const defaultVideoBaseUrl = computed(() => selectedTemplate.value?.apiConfig.videoBaseUrl)
const defaultAudioBaseUrl = computed(() => selectedTemplate.value?.apiConfig.audioBaseUrl)

// 表单验证规则
const rules: FormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  apiKey: [
    {
      required: computed(() => templateAuthType.value !== 'none' && !apiKeyOptional.value && !isEdit.value),
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
  form.models = []  // 新建时默认不选中任何模型，用户需要手动勾选或从API刷新后勾选
  customHeadersList.value = []
  apiModels.value = []
  apiKeyPrefixWarned.value = false
}

// 从 API 获取模型列表
const fetchModelsFromApi = async () => {
  if (!selectedTemplate.value && !isEdit.value) return

  // 编辑模式下，如果没有输入新的 API Key，使用 configId 让后端从数据库读取
  // 新建模式下，需要检查是否输入了 API Key（免密钥模板如 llama.cpp 可留空）
  if (!isEdit.value && templateAuthType.value !== 'none' && !apiKeyOptional.value && !form.apiKey) {
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
      // 调试日志：打印获取到的模型信息
      console.log('[fetchModelsFromApi] 获取到的模型:', result.models.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        supportsThinking: m.supportsThinking,
        supportsWebSearch: m.supportsWebSearch,
        supportsTools: m.supportsTools
      })))
      console.log('[fetchModelsFromApi] 当前 models:', [...form.models])
      console.log('[fetchModelsFromApi] 当前 isEdit:', isEdit.value)
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
    const safeStringify = (obj: any): any => {
      try {
        return JSON.parse(JSON.stringify(obj))
      } catch {
        return undefined
      }
    }

    // 直接使用 form.models
    const modelsToSave = safeStringify(form.models) || []

    console.log('[handleSave] 准备保存配置, models:', modelsToSave)

    if (isEdit.value && props.editConfig) {
      // 更新配置
      const result = await window.electronAPI.providerConfig.update(props.editConfig.id, {
        name: form.name,
        shortId: form.shortId || undefined,
        apiKey: form.apiKey || undefined,
        accessKeyId: form.accessKeyId || undefined,
        accessKeySecret: form.accessKeySecret || undefined,
        baseUrl: form.baseUrl || undefined,
        imageBaseUrl: form.imageBaseUrl || undefined,
        videoBaseUrl: form.videoBaseUrl || undefined,
        audioBaseUrl: form.audioBaseUrl || undefined,
        customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
        models: modelsToSave.length > 0 ? modelsToSave : undefined,
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
        imageBaseUrl: form.imageBaseUrl || undefined,
        videoBaseUrl: form.videoBaseUrl || undefined,
        audioBaseUrl: form.audioBaseUrl || undefined,
        customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
        models: modelsToSave.length > 0 ? modelsToSave : undefined,
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
  form.models = []
  form.isDefault = false
  customHeadersList.value = []
  apiModels.value = []
  apiModelSearch.value = ''
  activeCollapse.value = []
  apiKeyPrefixWarned.value = false
  // 重置加载状态，防止关闭对话框后状态残留
  loadingModels.value = false
  saving.value = false
  testing.value = false
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
  isEditingApiModel.value = false
  editingModelId.value = null
  customModelForm.id = ''
  customModelForm.name = ''
  customModelForm.contextWindow = 8192
  customModelForm.type = 'text'
  customModelForm.supportsThinking = false
  customModelForm.supportsWebSearch = false
  customModelForm.supportsTools = false
  showAddCustomModel.value = true
}

// 编辑模型能力属性（支持所有模型）
const editModelCapabilities = (model: ModelDefinition) => {
  isEditingCustomModel.value = true
  isEditingApiModel.value = !isCustomModel(model.id) // 如果不是自定义模型，就是 API 模型
  editingModelId.value = model.id
  customModelForm.id = model.id
  customModelForm.name = model.name
  customModelForm.contextWindow = model.contextWindow || 8192
  customModelForm.type = model.type || 'text'
  customModelForm.supportsThinking = model.supportsThinking || false
  customModelForm.supportsWebSearch = model.supportsWebSearch || false
  customModelForm.supportsTools = model.supportsTools || false
  showAddCustomModel.value = true
}

// 添加或更新模型
const saveCustomModel = () => {
  if (!customModelForm.id) {
    ElMessage.warning('请输入模型 ID')
    return
  }

  const modelData: ModelDefinition = {
    id: customModelForm.id,
    name: customModelForm.name || customModelForm.id,
    type: customModelForm.type,
    contextWindow: customModelForm.contextWindow,
    maxOutputTokens: 4096,
    features: ['chat', 'streaming'],
    supportsThinking: customModelForm.supportsThinking,
    supportsWebSearch: customModelForm.supportsWebSearch,
    supportsTools: customModelForm.supportsTools
  }

  if (isEditingApiModel.value) {
    // 从 API 模型添加到启用列表
    // 更新 apiModels 中的模型属性
    const index = apiModels.value.findIndex((m) => m.id === editingModelId.value)
    if (index > -1) {
      // 更新 API 模型列表中的模型属性
      apiModels.value[index] = {
        ...apiModels.value[index],
        ...modelData
      }
    }
    // 添加到 models 列表
    const existingIndex = form.models.findIndex((m) => m.id === customModelForm.id)
    if (existingIndex > -1) {
      form.models[existingIndex] = modelData
    } else {
      form.models.push(modelData)
    }
  } else if (isEditingCustomModel.value && editingModelId.value) {
    // 编辑模型：更新现有模型
    const index = form.models.findIndex((m) => m.id === editingModelId.value)
    if (index > -1) {
      form.models[index] = modelData
    }
  } else {
    // 添加模式：检查 ID 是否已存在
    if (form.models.some((m) => m.id === customModelForm.id)) {
      ElMessage.warning('该模型 ID 已存在')
      return
    }

    form.models.push(modelData)
  }

  // 重置表单并关闭对话框
  customModelForm.id = ''
  customModelForm.name = ''
  customModelForm.contextWindow = 8192
  customModelForm.type = 'text'
  customModelForm.supportsThinking = false
  customModelForm.supportsWebSearch = false
  customModelForm.supportsTools = false
  isEditingCustomModel.value = false
  isEditingApiModel.value = false
  editingModelId.value = null
  showAddCustomModel.value = false

  ElMessage.success('模型已保存')
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
      form.imageBaseUrl = config.imageBaseUrl || ''
      form.videoBaseUrl = config.videoBaseUrl || ''
      form.audioBaseUrl = config.audioBaseUrl || ''
      form.isDefault = config.isDefault

      // 从 models 字段初始化
      if (config.models && config.models.length > 0) {
        form.models = [...config.models]
      } else {
        form.models = []
      }

      // 不自动加载 apiModels，用户需要点击"从 API 刷新"
      apiModels.value = []

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

.template-usage-notes {
  margin-bottom: 20px;

  .usage-notes-list {
    margin: 4px 0 0;
    padding-left: 18px;

    li {
      font-size: 12px;
      line-height: 1.7;
    }
  }
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

.multimodal-urls-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-color-page);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-secondary);

  .el-icon {
    color: var(--color-primary);
    font-size: 16px;
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

// 主内容区布局
.provider-content {
  display: flex;
  height: 100%;
  min-height: 0;
  gap: 0;
}

// 左侧 Tab 导航
.provider-tabs {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  background: var(--bg-color-page);
  border-radius: var(--radius-md);
  margin-right: 16px;

  .tab-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 14px;
    transition: all var(--transition-fast);

    .el-icon {
      font-size: 16px;
    }

    &:hover {
      background: var(--bg-color-hover);
      color: var(--text-primary);
    }

    &.active {
      background: var(--color-primary-light-9);
      color: var(--color-primary);
      font-weight: 500;
    }
  }
}

// 右侧主内容区
.provider-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// Tab 内容
.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;

  &.info-tab {
    // 提供商信息 Tab 样式
  }

  &.models-tab {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}

// 模型区域
.model-section {
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .section-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }
  }

  .section-desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }
}

// 模型搜索框（位于"API 模型"标题与刷新按钮之间）
.model-search {
  flex: 1;
  min-width: 0;
  margin: 0 12px;
}

// 模型列表
.model-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  background: var(--bg-color-page);
  border-radius: var(--radius-sm);
}

// 模型卡片
.model-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  padding: 10px 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary-light);
  }

  &.enabled {
    background: var(--color-primary-light-9);
    border-color: var(--color-primary-light-7);
  }

  .model-card-main {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .model-card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    overflow: hidden;

    .model-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .model-card-features {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    margin-left: auto;
    padding-left: 8px;
    flex-shrink: 0;

    .feature-icon {
      font-size: 15px;

      &.multimodal {
        color: #409eff;
      }

      &.image {
        color: #e6a23c;
      }

      &.video {
        color: #f56c6c;
      }

      &.audio {
        color: #13c2c2;
      }

      &.embedding {
        color: #9254de;
      }

      &.rerank {
        color: #eb2f96;
      }

      &.thinking {
        color: #67c23a;
      }

      &.websearch {
        color: #1890ff;
      }

      &.tools {
        color: #fa541c;
      }
    }
  }

  .model-card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    margin-left: 8px;

    .el-button {
      margin-left: 0;
    }

    .enabled-icon {
      font-size: 18px;
      color: #67c23a;
    }
  }
}

.empty-hint {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  background: var(--bg-color-page);
  border-radius: var(--radius-sm);

  &.search-empty {
    grid-column: 1 / -1;
    background: transparent;
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
    height: 92vh;
    max-width: 96vw;
    display: flex;
    flex-direction: column;
    margin-top: 4vh !important;
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
