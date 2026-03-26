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
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Setting } from '@element-plus/icons-vue'
import type { Role, UpdateRoleRequest } from '../../../shared/types'
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
  { key: 'params', label: '生成参数', icon: Setting }
]

// 状态
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isEdit = computed(() => !!props.role)
const activeMenu = ref<'basic' | 'params'>('basic')

// 表单
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  description: '',
  systemPrompt: '',
  avatar: '🤖',
  // 生成参数
  temperature: 0.7,
  topP: 1.0,
  maxContextMessages: 20,
  maxTokens: 4096,
  enableStream: true
})

// 头像选项
const avatarOptions = ['🤖', '💬', '🌐', '💻', '✍️', '📚', '🎨', '🎵', '🔬', '💼', '🎮', '🏥', '⚖️', '🔧', '📊', '🎯']

// 保存状态
const saving = ref(false)

// 表单验证规则
const rules: FormRules = {
  name: [{ required: true, message: '请输入助手名称', trigger: 'blur' }]
}

// 重置参数为默认值
function resetParams(): void {
  form.temperature = 0.7
  form.topP = 1.0
  form.maxContextMessages = 20
  form.maxTokens = 4096
  form.enableStream = true
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
  form.temperature = 0.7
  form.topP = 1.0
  form.maxContextMessages = 20
  form.maxTokens = 4096
  form.enableStream = true
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

  saving.value = true
  try {
    if (isEdit.value && props.role) {
      // 更新角色
      const updateData: UpdateRoleRequest = {
        name: form.name,
        description: form.description || undefined,
        systemPrompt: form.systemPrompt || undefined,
        avatar: form.avatar,
        temperature: form.temperature,
        topP: form.topP,
        maxContextMessages: form.maxContextMessages,
        maxTokens: form.maxTokens,
        enableStream: form.enableStream
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
        temperature: form.temperature,
        topP: form.topP,
        maxContextMessages: form.maxContextMessages,
        maxTokens: form.maxTokens,
        enableStream: form.enableStream
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
      form.temperature = role.temperature ?? 0.7
      form.topP = role.topP ?? 1.0
      form.maxContextMessages = role.maxContextMessages ?? 20
      form.maxTokens = role.maxTokens ?? 4096
      form.enableStream = role.enableStream ?? true
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