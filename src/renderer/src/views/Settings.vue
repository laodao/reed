<template>
  <div class="settings-page">
    <div class="page-header">
      <h2>系统设置</h2>
      <p>配置应用程序的各项参数</p>
    </div>

    <div class="settings-content">
      <el-tabs v-model="activeTab" tab-position="left">
        <el-tab-pane label="基本设置" name="general">
          <div class="settings-section">
            <h3>外观</h3>
            <el-form label-width="100px">
              <el-form-item label="主题">
                <el-radio-group v-model="settings.theme" @change="saveSettings">
                  <el-radio value="light">浅色</el-radio>
                  <el-radio value="dark">深色</el-radio>
                  <el-radio value="auto">跟随系统</el-radio>
                </el-radio-group>
              </el-form-item>

              <el-form-item label="语言">
                <el-select v-model="settings.language" @change="saveSettings">
                  <el-option label="简体中文" value="zh-CN" />
                  <el-option label="English" value="en-US" />
                </el-select>
              </el-form-item>

              <el-form-item label="字体大小">
                <el-radio-group v-model="settings.fontSize" @change="saveSettings">
                  <el-radio value="small">小</el-radio>
                  <el-radio value="medium">中</el-radio>
                  <el-radio value="large">大</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane label="API 密钥" name="apiKeys">
          <div class="settings-section">
            <h3>API 密钥管理</h3>
            <div class="api-key-list">
              <div
                v-for="provider in apiProviders"
                :key="provider.id"
                class="api-key-item"
              >
                <div class="provider-info">
                  <el-icon :size="20"><Key /></el-icon>
                  <span class="provider-name">{{ provider.name }}</span>
                  <el-tag v-if="provider.configured" type="success" size="small">已配置</el-tag>
                  <el-tag v-else type="info" size="small">未配置</el-tag>
                </div>
                <div class="provider-actions">
                  <el-button size="small" @click="openApiKeyDialog(provider)">
                    {{ provider.configured ? '编辑' : '配置' }}
                  </el-button>
                  <el-button
                    v-if="provider.configured"
                    size="small"
                    type="danger"
                    text
                    @click="deleteApiKey(provider)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="数据管理" name="data">
          <div class="settings-section">
            <h3>数据管理</h3>
            <el-form label-width="100px">
              <el-form-item label="数据路径">
                <el-input v-model="dataPath" disabled>
                  <template #append>
                    <el-button @click="openDataFolder">打开目录</el-button>
                  </template>
                </el-input>
              </el-form-item>
              <el-form-item label="数据备份">
                <el-button @click="exportData">导出数据</el-button>
                <el-button @click="importData">导入数据</el-button>
              </el-form-item>
              <el-form-item label="清除数据">
                <el-button type="danger" @click="clearAllData">清除所有数据</el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane label="关于" name="about">
          <div class="settings-section">
            <h3>关于 The Bot</h3>
            <div class="about-info">
              <p><strong>版本:</strong> 0.1.0</p>
              <p><strong>描述:</strong> AI 工具箱 - 集成多种 AI 能力的跨平台桌面应用</p>
              <p><strong>作者:</strong> Daoge</p>
              <p><strong>许可证:</strong> MIT</p>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- API 密钥配置对话框 -->
    <el-dialog
      v-model="apiKeyDialogVisible"
      :title="`配置 ${currentProvider?.name} API 密钥`"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="API 密钥">
          <el-input
            v-model="apiKeyForm.key"
            type="password"
            show-password
            placeholder="请输入 API 密钥"
          />
        </el-form-item>
        <el-form-item label="自定义端点">
          <el-input
            v-model="apiKeyForm.endpoint"
            placeholder="可选，留空使用默认端点"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="apiKeyDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveApiKey">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Key } from '@element-plus/icons-vue'

// 当前标签
const activeTab = ref('general')

// 基本设置
const settings = reactive({
  theme: 'auto' as 'light' | 'dark' | 'auto',
  language: 'zh-CN',
  fontSize: 'medium' as 'small' | 'medium' | 'large'
})

// 数据路径
const dataPath = ref('')

// API 提供商列表
const apiProviders = ref([
  { id: 'openai', name: 'OpenAI', configured: false },
  { id: 'anthropic', name: 'Anthropic (Claude)', configured: false },
  { id: 'google', name: 'Google (Gemini)', configured: false },
  { id: 'deepseek', name: 'DeepSeek', configured: false },
  { id: 'glm', name: '智谱 AI', configured: false },
  { id: 'volcengine', name: '火山引擎', configured: false }
])

// API 密钥对话框
const apiKeyDialogVisible = ref(false)
const currentProvider = ref<{ id: string; name: string } | null>(null)
const apiKeyForm = reactive({
  key: '',
  endpoint: ''
})

// 加载设置
const loadSettings = async () => {
  try {
    const result = await window.electronAPI.settings.get()
    if (result.success && result.data) {
      Object.assign(settings, result.data)
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 保存设置
const saveSettings = async () => {
  try {
    await window.electronAPI.settings.set('theme', settings.theme)
    await window.electronAPI.settings.set('language', settings.language)
    await window.electronAPI.settings.set('fontSize', settings.fontSize)
    ElMessage.success('设置已保存')
  } catch (error) {
    ElMessage.error('保存设置失败')
  }
}

// 加载 API 密钥状态
const loadApiKeys = async () => {
  try {
    const result = await window.electronAPI.apiKey.list()
    if (result.success && result.keys) {
      result.keys.forEach((key) => {
        const provider = apiProviders.value.find((p) => p.id === key.provider)
        if (provider) {
          provider.configured = true
        }
      })
    }
  } catch (error) {
    console.error('加载 API 密钥状态失败:', error)
  }
}

// 打开 API 密钥配置对话框
const openApiKeyDialog = (provider: { id: string; name: string }) => {
  currentProvider.value = provider
  apiKeyForm.key = ''
  apiKeyForm.endpoint = ''
  apiKeyDialogVisible.value = true
}

// 保存 API 密钥
const saveApiKey = async () => {
  if (!currentProvider.value || !apiKeyForm.key.trim()) {
    ElMessage.warning('请输入 API 密钥')
    return
  }

  try {
    const result = await window.electronAPI.apiKey.set(
      currentProvider.value.id,
      apiKeyForm.key,
      apiKeyForm.endpoint || undefined
    )
    if (result.success) {
      const provider = apiProviders.value.find((p) => p.id === currentProvider.value!.id)
      if (provider) {
        provider.configured = true
      }
      apiKeyDialogVisible.value = false
      ElMessage.success('API 密钥已保存')
    }
  } catch (error) {
    ElMessage.error('保存 API 密钥失败')
  }
}

// 删除 API 密钥
const deleteApiKey = async (provider: { id: string; name: string }) => {
  try {
    await ElMessageBox.confirm('确定要删除此 API 密钥吗？', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const result = await window.electronAPI.apiKey.delete(provider.id)
    if (result.success) {
      const p = apiProviders.value.find((p) => p.id === provider.id)
      if (p) {
        p.configured = false
      }
      ElMessage.success('API 密钥已删除')
    }
  } catch {
    // 用户取消
  }
}

// 打开数据目录
const openDataFolder = () => {
  ElMessage.info('打开目录功能开发中...')
}

// 导出数据
const exportData = () => {
  ElMessage.info('导出数据功能开发中...')
}

// 导入数据
const importData = () => {
  ElMessage.info('导入数据功能开发中...')
}

// 清除所有数据
const clearAllData = async () => {
  try {
    await ElMessageBox.confirm('确定要清除所有数据吗？此操作不可恢复！', '警告', {
      confirmButtonText: '确定清除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    ElMessage.info('清除数据功能开发中...')
  } catch {
    // 用户取消
  }
}

onMounted(() => {
  loadSettings()
  loadApiKeys()
})
</script>

<style lang="scss" scoped>
.settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.page-header {
  padding: 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;

  h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 600;
    color: #303133;
  }

  p {
    margin: 0;
    color: #909399;
    font-size: 14px;
  }
}

.settings-content {
  flex: 1;
  overflow: hidden;
  padding: 24px;

  :deep(.el-tabs) {
    height: 100%;
  }

  :deep(.el-tabs__content) {
    height: calc(100% - 40px);
    overflow-y: auto;
  }

  :deep(.el-tabs__item) {
    height: 48px;
    line-height: 48px;
  }
}

.settings-section {
  background: #fff;
  padding: 24px;
  border-radius: 8px;

  h3 {
    margin: 0 0 20px 0;
    font-size: 16px;
    font-weight: 500;
    color: #303133;
  }
}

.api-key-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.api-key-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  transition: all 0.3s ease;

  &:hover {
    border-color: #409eff;
  }
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-name {
  font-weight: 500;
}

.provider-actions {
  display: flex;
  gap: 8px;
}

.about-info {
  p {
    margin: 8px 0;
    color: #606266;
  }
}
</style>
