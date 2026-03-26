<template>
  <el-dialog
    v-model="visible"
    title="导出到 Obsidian"
    width="550px"
    :close-on-click-modal="false"
    class="export-obsidian-dialog"
    @open="handleDialogOpen"
  >
    <el-form :model="form" label-width="100px" class="export-form">
      <!-- 标题 -->
      <el-form-item label="标题" required>
        <el-input v-model="form.title" placeholder="请输入笔记标题" />
      </el-form-item>

      <!-- 保管库选择 -->
      <el-form-item label="保管库" required>
        <el-select
          v-model="form.vaultPath"
          placeholder="选择 Obsidian 保管库"
          class="vault-select"
          @change="handleVaultChange"
        >
          <el-option
            v-for="vault in vaults"
            :key="vault.path"
            :label="vault.name"
            :value="vault.path"
          >
            <div class="vault-option">
              <span class="vault-name">{{ vault.name }}</span>
              <span class="vault-path">{{ vault.path }}</span>
            </div>
          </el-option>
        </el-select>
        <div v-if="vaults.length === 0" class="empty-vaults">
          <el-button text type="primary" @click="selectVaultManually">
            未检测到保管库，点击手动选择
          </el-button>
        </div>
      </el-form-item>

      <!-- 目录路径 -->
      <el-form-item label="保存目录">
        <el-cascader
          v-model="form.subPathArr"
          :options="directoryOptions"
          :props="{
            checkStrictly: true,
            emitPath: false,
            value: 'value',
            label: 'label',
            children: 'children'
          }"
          placeholder="选择保存目录（可选）"
          clearable
          filterable
          :disabled="!form.vaultPath"
          class="directory-cascader"
        />
        <div class="form-hint">不选择则保存到保管库根目录</div>
      </el-form-item>

      <!-- 标签 -->
      <el-form-item label="标签">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入标签后按回车添加"
          class="tags-select"
        >
          <el-option
            v-for="tag in recentTags"
            :key="tag"
            :label="tag"
            :value="tag"
          />
        </el-select>
      </el-form-item>

      <!-- 创建时间 -->
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="form.createdAt"
          type="datetime"
          placeholder="选择日期时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
        />
      </el-form-item>

      <!-- 来源 -->
      <el-form-item label="来源">
        <el-input v-model="form.source" placeholder="如：AI对话、ChatGPT等" />
      </el-form-item>

      <!-- 处理方式 -->
      <el-form-item label="处理方式">
        <el-radio-group v-model="form.mode" @change="handleModeChange">
          <el-radio value="new">新建文件</el-radio>
          <el-radio value="append">追加到已有文件</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 追加文件选择 -->
      <el-form-item v-if="form.mode === 'append'" label="目标文件">
        <el-select
          v-model="form.appendFile"
          placeholder="选择要追加的文件"
          filterable
          :disabled="!form.vaultPath"
          class="file-select"
        >
          <el-option
            v-for="file in markdownFiles"
            :key="file.path"
            :label="file.name"
            :value="file.path"
          />
        </el-select>
      </el-form-item>

      <!-- 导出思维链 -->
      <el-form-item label="导出思维链">
        <el-switch
          v-model="form.includeThinkingChain"
          :disabled="!hasThinkingChain"
        />
        <span class="switch-hint" v-if="!hasThinkingChain">（当前消息无思维链）</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" :loading="exporting" @click="handleExport">
          导出
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

interface Vault {
  path: string
  name: string
  ts?: number
}

interface DirectoryOption {
  value: string
  label: string
  children?: DirectoryOption[]
}

interface MarkdownFile {
  path: string
  name: string
}

const props = defineProps<{
  modelValue: boolean
  content: string
  thinkingChain?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'exported', filePath: string): void
}>()

// 对话框可见性
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// 是否有思维链
const hasThinkingChain = computed(() => !!props.thinkingChain)

// 导出中状态
const exporting = ref(false)

// 保管库列表
const vaults = ref<Vault[]>([])

// 目录选项
const directoryOptions = ref<DirectoryOption[]>([])

// Markdown 文件列表
const markdownFiles = ref<MarkdownFile[]>([])

// 最近使用的标签
const recentTags = ref<string[]>([])

// 表单数据
const form = ref({
  title: '',
  vaultPath: '',
  subPathArr: [] as string[],
  subPath: '',
  tags: [] as string[],
  createdAt: '',
  source: 'AI对话',
  mode: 'new' as 'new' | 'append',
  appendFile: '',
  includeThinkingChain: false
})

// 对话框打开时
async function handleDialogOpen() {
  // 加载保管库列表
  await loadVaults()
  // 加载最近标签
  loadRecentTags()
  // 设置默认时间
  form.value.createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
  // 默认导出思维链
  form.value.includeThinkingChain = hasThinkingChain.value
}

// 加载保管库列表
async function loadVaults() {
  try {
    const response = await window.electronAPI.export.getObsidianVaults()
    if (response.success && response.data) {
      vaults.value = response.data
    }
  } catch (error) {
    console.error('加载保管库列表失败:', error)
  }
}

// 加载最近标签
function loadRecentTags() {
  try {
    const saved = localStorage.getItem('obsidian-recent-tags')
    if (saved) {
      recentTags.value = JSON.parse(saved)
    }
  } catch {
    // ignore
  }
}

// 保存标签到最近使用
function saveRecentTags() {
  const allTags = [...new Set([...recentTags.value, ...form.value.tags])]
  recentTags.value = allTags.slice(0, 20)
  localStorage.setItem('obsidian-recent-tags', JSON.stringify(recentTags.value))
}

// 手动选择保管库
async function selectVaultManually() {
  try {
    const response = await window.electronAPI.file.openFolderDialog()
    if (response.success && response.filePath) {
      const newVault: Vault = {
        path: response.filePath,
        name: response.filePath.split(/[/\\]/).pop() || response.filePath
      }
      vaults.value.push(newVault)
      form.value.vaultPath = newVault.path
      handleVaultChange(newVault.path)
    }
  } catch (error) {
    console.error('选择保管库失败:', error)
  }
}

// 保管库变更
async function handleVaultChange(vaultPath: string) {
  // 重置相关字段
  form.value.subPathArr = []
  form.value.subPath = ''
  form.value.appendFile = ''
  directoryOptions.value = []
  markdownFiles.value = []

  if (!vaultPath) return

  // 加载目录结构
  try {
    const response = await window.electronAPI.export.getVaultDirectories(vaultPath)
    if (response.success && response.data) {
      directoryOptions.value = buildDirectoryTree(response.data)
    }
  } catch (error) {
    console.error('加载目录失败:', error)
  }

  // 加载根目录的 Markdown 文件
  await loadMarkdownFiles(vaultPath, '')
}

// 构建目录树
function buildDirectoryTree(dirs: string[]): DirectoryOption[] {
  const root: DirectoryOption[] = []

  for (const dir of dirs) {
    const parts = dir.split(/[/\\]/)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const existing = current.find(item => item.label === part)

      if (existing) {
        if (!existing.children) {
          existing.children = []
        }
        current = existing.children
      } else {
        const newPath = parts.slice(0, i + 1).join('/')
        const newItem: DirectoryOption = {
          value: newPath,
          label: part,
          children: i < parts.length - 1 ? [] : undefined
        }
        current.push(newItem)
        if (newItem.children) {
          current = newItem.children
        }
      }
    }
  }

  return root
}

// 加载 Markdown 文件列表
async function loadMarkdownFiles(vaultPath: string, subPath: string) {
  try {
    const response = await window.electronAPI.export.getVaultFiles(vaultPath, subPath)
    if (response.success && response.data) {
      markdownFiles.value = response.data.files.map(name => ({
        path: subPath ? `${vaultPath}/${subPath}/${name}` : `${vaultPath}/${name}`,
        name
      }))
    }
  } catch (error) {
    console.error('加载文件列表失败:', error)
  }
}

// 处理方式变更
function handleModeChange() {
  form.value.appendFile = ''
}

// 取消
function handleCancel() {
  visible.value = false
}

// 导出
async function handleExport() {
  // 验证
  if (!form.value.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  if (!form.value.vaultPath) {
    ElMessage.warning('请选择保管库')
    return
  }
  if (form.value.mode === 'append' && !form.value.appendFile) {
    ElMessage.warning('请选择要追加的文件')
    return
  }

  exporting.value = true

  try {
    // 处理目录路径
    const subPath = form.value.subPathArr && form.value.subPathArr.length > 0
      ? form.value.subPathArr[form.value.subPathArr.length - 1]
      : ''

    // 确保所有数据都是可序列化的简单类型
    const requestData = {
      content: String(props.content || ''),
      thinkingChain: form.value.includeThinkingChain && props.thinkingChain
        ? String(props.thinkingChain)
        : undefined,
      title: String(form.value.title),
      vaultPath: String(form.value.vaultPath),
      subPath: String(subPath),
      tags: Array.isArray(form.value.tags) ? [...form.value.tags] : [],
      createdAt: form.value.createdAt ? String(form.value.createdAt) : undefined,
      source: form.value.source ? String(form.value.source) : undefined,
      mode: form.value.mode as 'new' | 'append',
      appendFile: form.value.appendFile ? String(form.value.appendFile) : undefined
    }

    const response = await window.electronAPI.export.toObsidian(requestData)

    if (response.success) {
      ElMessage.success('已导出到 Obsidian')
      saveRecentTags()
      emit('exported', response.filePath || '')
      visible.value = false
    } else if (response.error) {
      ElMessage.error(response.error)
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}
</script>

<style lang="scss" scoped>
.export-obsidian-dialog {
  :deep(.el-dialog__body) {
    padding: 20px 24px;
  }
}

.export-form {
  .vault-select {
    width: 100%;
  }

  .vault-option {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .vault-name {
      font-weight: 500;
      color: #1e293b;
    }

    .vault-path {
      font-size: 11px;
      color: #909399;
    }
  }

  .empty-vaults {
    margin-top: 8px;
  }

  .directory-cascader {
    width: 100%;
  }

  .form-hint {
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
  }

  .tags-select {
    width: 100%;
  }

  .file-select {
    width: 100%;
  }

  .switch-hint {
    margin-left: 8px;
    font-size: 12px;
    color: #909399;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>