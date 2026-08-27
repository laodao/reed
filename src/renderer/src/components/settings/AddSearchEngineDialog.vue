<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑搜索引擎' : '添加搜索引擎'"
    width="650px"
    :close-on-click-modal="false"
    class="add-search-engine-dialog"
    @close="handleClose"
  >
    <!-- 选择模板（仅新建时显示） -->
    <div v-if="!isEdit && !selectedTemplate" class="template-select">
      <h4>选择搜索引擎类型</h4>

      <!-- 加载中状态 -->
      <div v-if="loadingTemplates" class="loading-templates">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在加载搜索引擎模板...</span>
      </div>

      <!-- 模板列表 -->
      <div v-else-if="apiTemplates.length > 0" class="template-grid">
        <div
          v-for="template in apiTemplates"
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

      <!-- 无可用模板 -->
      <div v-else class="no-templates">
        <span>所有搜索引擎都已配置</span>
      </div>
    </div>

    <!-- 配置表单（选择模板后或编辑模式） -->
    <div v-if="selectedTemplate || isEdit" class="config-form-wrapper">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="110px"
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

        <!-- 配置名称 -->
        <el-form-item label="配置名称" prop="name">
          <el-input v-model="form.name" placeholder="如：我的智谱搜索" />
        </el-form-item>

        <!-- API 密钥（仅需要 Key 的模板显示） -->
        <el-form-item v-if="needsApiKey" label="API Key" prop="apiKey">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="selectedTemplate?.authConfig.apiKeyPlaceholder || '请输入 API Key'"
          />
          <div v-if="isEdit" class="form-hint">留空则保持原有密钥不变</div>
        </el-form-item>
        <el-form-item v-else label="API Key">
          <div class="form-hint">该搜索引擎无需 API Key</div>
        </el-form-item>

        <!-- 额外配置字段（如 API 地址） -->
        <template v-if="extraConfigFields.length > 0">
          <el-form-item
            v-for="field in extraConfigFields"
            :key="field.key"
            :label="field.label"
          >
            <el-input
              v-model="form.extraConfig[field.key]"
              :placeholder="field.placeholder"
            />
            <div v-if="field.description" class="form-hint">{{ field.description }}</div>
          </el-form-item>
        </template>

        <!-- 最大结果数 -->
        <el-form-item label="结果数量">
          <el-input-number
            v-model="form.maxResults"
            :min="1"
            :max="10"
            controls-position="right"
          />
        </el-form-item>

        <!-- 启用状态 -->
        <el-form-item label="启用">
          <el-switch v-model="form.isEnabled" />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="selectedTemplate || isEdit" text @click="handleBack">
          返回
        </el-button>
        <el-button @click="handleClose">取消</el-button>
        <el-button
          v-if="selectedTemplate || isEdit"
          type="primary"
          :loading="saving"
          @click="handleSave"
        >
          {{ isEdit ? '保存' : '添加' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import FaviconIcon from '@/components/common/FaviconIcon.vue'
import type {
  SearchEngineTemplate,
  UserSearchEngineConfig
} from '../../../shared/types/search-engine.types'

const props = defineProps<{
  modelValue: boolean
  editConfig?: UserSearchEngineConfig
  templates: SearchEngineTemplate[]
  existingConfigs: UserSearchEngineConfig[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isEdit = computed(() => !!props.editConfig)

/** 当前所选模板是否需要 API Key（编辑模式视为需要，兼容存量配置） */
const needsApiKey = computed(() => {
  if (isEdit.value) return true
  return !!selectedTemplate.value?.authConfig.requiresApiKey
})

// 筛选可配置的 API 型模板（需要 Key 或需要额外配置项；SearXNG 等无需 Key 也要出现）
const apiTemplates = computed(() => {
  return props.templates.filter(t =>
    t.category === 'api' &&
    (t.authConfig.requiresApiKey || t.authConfig.requiresExtraConfig)
  )
})

const loadingTemplates = ref(false)
const selectedTemplate = ref<SearchEngineTemplate | null>(null)
const formRef = ref()
const saving = ref(false)

const form = ref({
  name: '',
  apiKey: '',
  extraConfig: {} as Record<string, string>,
  maxResults: 5,
  isEnabled: true
})

// 获取当前模板的额外配置字段
const extraConfigFields = computed(() => {
  if (!selectedTemplate.value?.authConfig.extraConfigFields) return []
  return selectedTemplate.value.authConfig.extraConfigFields
})

const rules = {
  name: [
    { required: true, message: '请输入配置名称', trigger: 'blur' }
  ],
  apiKey: [
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (needsApiKey.value && !isEdit.value && !value) {
          callback(new Error('请输入 API Key'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 选择模板
const selectTemplate = (template: SearchEngineTemplate) => {
  selectedTemplate.value = template
  form.value.name = template.name
  // 初始化额外配置字段的默认值
  if (template.authConfig.extraConfigFields) {
    template.authConfig.extraConfigFields.forEach(field => {
      if (field.default !== undefined) {
        form.value.extraConfig[field.key] = String(field.default)
      }
    })
  }
}

// 返回选择模板
const handleBack = () => {
  if (!isEdit.value) {
    selectedTemplate.value = null
    form.value = {
      name: '',
      apiKey: '',
      extraConfig: {},
      maxResults: 5,
      isEnabled: true
    }
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

  saving.value = true

  try {
    if (isEdit.value && props.editConfig) {
      // 更新配置
      const updateData: Record<string, any> = {
        name: form.value.name,
        maxResults: form.value.maxResults,
        isEnabled: form.value.isEnabled
      }

      // 只有输入了新的 API Key 才更新
      if (form.value.apiKey) {
        updateData.apiKey = form.value.apiKey
      }

      // 额外配置
      if (Object.keys(form.value.extraConfig).length > 0) {
        updateData.extraConfig = { ...form.value.extraConfig }
      }

      const result = await window.electronAPI.searchEngine.update(
        props.editConfig.id,
        updateData
      )

      if (result.success) {
        ElMessage.success('配置已更新')
        emit('saved')
        handleClose()
      } else {
        ElMessage.error(result.error || '保存失败')
      }
    } else if (selectedTemplate.value) {
      // 创建新配置
      const result = await window.electronAPI.searchEngine.create({
        templateId: selectedTemplate.value.id,
        name: form.value.name,
        apiKey: form.value.apiKey,
        extraConfig: Object.keys(form.value.extraConfig).length > 0 ? form.value.extraConfig : undefined,
        maxResults: form.value.maxResults,
        isEnabled: form.value.isEnabled
      })

      if (result.success) {
        ElMessage.success('配置已添加')
        emit('saved')
        handleClose()
      } else {
        ElMessage.error(result.error || '添加失败')
      }
    }
  } catch (error: any) {
    console.error('保存配置失败:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

// 关闭对话框
const handleClose = () => {
  visible.value = false
  selectedTemplate.value = null
  form.value = {
    name: '',
    apiKey: '',
    extraConfig: {},
    maxResults: 5,
    isEnabled: true
  }
}

// 监听编辑配置变化
watch(
  () => props.editConfig,
  (config) => {
    if (config) {
      form.value = {
        name: config.name,
        apiKey: '', // 编辑时不显示原有密钥
        extraConfig: config.extraConfig ? { ...config.extraConfig as Record<string, string> } : {},
        maxResults: config.maxResults || 5,
        isEnabled: config.isEnabled
      }
      // 找到对应的模板
      selectedTemplate.value = props.templates.find(t => t.id === config.templateId) || null
    }
  },
  { immediate: true }
)

// 监听对话框打开
watch(visible, (val) => {
  if (!val) {
    handleClose()
  }
})
</script>

<style lang="scss" scoped>
.add-search-engine-dialog {
  // 对话框内容与边框保持舒适间距
  :deep(.el-dialog__body) {
    padding: 20px 24px 24px;
  }

  .template-select {
    h4 {
      margin: 0 0 16px 0;
      font-size: 14px;
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
    padding: 16px;
    border: 1px solid var(--border-color-lighter);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-normal);
    // 关键：禁止卡片内容（nowrap 描述）把 grid 列撑出容器，
    // 否则卡片右缘会溢出到对话框边框（无右侧间距）
    min-width: 0;

    &:hover {
      border-color: var(--color-primary-light);
      background: var(--bg-color-page);
    }
  }

  .template-icon {
    font-size: 24px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-color-page);
    border-radius: var(--radius-md);
  }

  .template-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .template-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .template-desc {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-templates {
    text-align: center;
    padding: 40px;
    color: var(--text-secondary);
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

  .template-icon-lg {
    font-size: 32px;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-color);
    border-radius: var(--radius-md);
  }

  .template-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .config-form {
    .el-input {
      width: 100%;
    }

    .form-hint {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>