<template>
  <div class="diary-page">
    <!-- 左侧边栏 - 目录树 -->
    <div class="page-sidebar">
      <div class="sidebar-header">
        <h3>日记目录</h3>
        <el-button type="primary" size="small" @click="showCreateFolderDialog = true">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>

      <div class="sidebar-content">
        <el-scrollbar>
          <div v-if="isLoadingFolders" class="loading-state">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>加载中...</span>
          </div>

          <div v-else-if="folders.length === 0" class="empty-state">
            <el-icon><FolderOpened /></el-icon>
            <span>暂无目录</span>
            <el-button type="primary" text @click="showCreateFolderDialog = true">
              创建第一个目录
            </el-button>
          </div>

          <div v-else class="folder-tree">
            <div
              v-for="folder in folders"
              :key="folder.id"
              class="folder-item"
              :class="{ active: currentFolder?.id === folder.id }"
              @click="selectFolder(folder)"
            >
              <div class="folder-icon">
                <el-icon><Folder /></el-icon>
              </div>
              <div class="folder-info">
                <div class="folder-name">{{ folder.name }}</div>
                <div class="folder-stats">{{ folder.entryCount || 0 }} 篇日记</div>
              </div>
              <div class="folder-actions" @click.stop>
                <el-dropdown trigger="click" @command="handleFolderAction($event, folder)">
                  <el-button text size="small">
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="rename">重命名</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 未选择目录 -->
      <div v-if="!currentFolder" class="empty-main">
        <el-icon :size="64" color="#c0c4cc"><FolderOpened /></el-icon>
        <h3>选择或创建目录</h3>
        <p>从左侧选择一个目录，或创建新的目录开始写日记</p>
        <el-button type="primary" @click="showCreateFolderDialog = true">
          <el-icon><Plus /></el-icon>
          新建目录
        </el-button>
      </div>

      <!-- 已选择目录，未选择日记 -->
      <template v-else-if="!currentEntry">
        <div class="main-header">
          <div class="header-left">
            <h2>{{ currentFolder.name }}</h2>
          </div>
          <div class="header-right">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索日记..."
              prefix-icon="Search"
              clearable
              style="width: 200px"
              @keyup.enter="handleSearch"
            />
            <el-button type="primary" @click="createNewEntry">
              <el-icon><Plus /></el-icon>
              新建日记
            </el-button>
          </div>
        </div>

        <div class="main-content">
          <el-scrollbar>
            <div v-if="isLoadingEntries" class="loading-state">
              <el-icon class="is-loading"><Loading /></el-icon>
            </div>

            <div v-else-if="entries.length === 0" class="empty-entries">
              <el-icon :size="48" color="#c0c4cc"><Document /></el-icon>
              <p>暂无日记</p>
              <el-button type="primary" @click="createNewEntry">写第一篇日记</el-button>
            </div>

            <div v-else class="entry-list">
              <div
                v-for="entry in entries"
                :key="entry.id"
                class="entry-item"
                @click="selectEntry(entry)"
              >
                <div class="entry-date">{{ formatDate(entry.createdAt) }}</div>
                <div class="entry-title">{{ entry.title }}</div>
                <div class="entry-preview">{{ entry.preview }}</div>
                <div class="entry-meta">
                  <span>{{ entry.wordCount }} 字</span>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>
      </template>

      <!-- 已选择日记 - 编辑器 -->
      <template v-else>
        <DiaryEditor
          :entry="currentEntry"
          @back="currentEntry = null"
          @updated="handleEntryUpdated"
        />
      </template>
    </div>

    <!-- 创建目录对话框 -->
    <el-dialog
      v-model="showCreateFolderDialog"
      title="新建目录"
      width="400px"
    >
      <el-form :model="newFolderForm" label-width="80px">
        <el-form-item label="目录名称">
          <el-input v-model="newFolderForm.name" placeholder="请输入目录名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateFolderDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFolder">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Folder, FolderOpened, Document, Loading, MoreFilled } from '@element-plus/icons-vue'
import DiaryEditor from '@/components/diary/DiaryEditor.vue'
import type { DiaryFolder, DiaryEntryListItem, DiaryEntry } from '@shared/types/diary'

// 目录相关
const folders = ref<DiaryFolder[]>([])
const currentFolder = ref<DiaryFolder | null>(null)
const isLoadingFolders = ref(false)
const showCreateFolderDialog = ref(false)
const newFolderForm = ref({ name: '' })

// 日记相关
const entries = ref<DiaryEntryListItem[]>([])
const currentEntry = ref<DiaryEntry | null>(null)
const isLoadingEntries = ref(false)
const searchKeyword = ref('')

// 加载目录列表
async function loadFolders() {
  isLoadingFolders.value = true
  try {
    const result = await window.electronAPI.diary.getAllFolders()
    if (result.success) {
      folders.value = result.data || []
    } else {
      ElMessage.error(result.error || '加载目录失败')
    }
  } catch (error) {
    console.error('加载目录失败:', error)
    ElMessage.error('加载目录失败')
  } finally {
    isLoadingFolders.value = false
  }
}

// 选择目录
async function selectFolder(folder: DiaryFolder) {
  currentFolder.value = folder
  currentEntry.value = null
  await loadEntries()
}

// 加载日记列表
async function loadEntries() {
  if (!currentFolder.value) return
  isLoadingEntries.value = true
  try {
    const result = await window.electronAPI.diary.listEntries(currentFolder.value.id)
    if (result.success) {
      entries.value = result.data || []
    }
  } catch (error) {
    console.error('加载日记列表失败:', error)
  } finally {
    isLoadingEntries.value = false
  }
}

// 创建新日记
async function createNewEntry() {
  if (!currentFolder.value) return
  try {
    const result = await window.electronAPI.diary.createEntry({
      folderId: currentFolder.value.id
    })
    if (result.success && result.data) {
      currentEntry.value = result.data
      await loadEntries()
    } else {
      ElMessage.error(result.error || '创建日记失败')
    }
  } catch (error) {
    console.error('创建日记失败:', error)
    ElMessage.error('创建日记失败')
  }
}

// 选择日记
async function selectEntry(entry: DiaryEntryListItem) {
  try {
    const result = await window.electronAPI.diary.getEntry(entry.id)
    if (result.success && result.data) {
      currentEntry.value = result.data
    }
  } catch (error) {
    console.error('获取日记详情失败:', error)
  }
}

// 创建目录
async function handleCreateFolder() {
  if (!newFolderForm.value.name.trim()) {
    ElMessage.warning('请输入目录名称')
    return
  }
  try {
    const result = await window.electronAPI.diary.createFolder({
      name: newFolderForm.value.name.trim()
    })
    if (result.success) {
      showCreateFolderDialog.value = false
      newFolderForm.value.name = ''
      await loadFolders()
      ElMessage.success('目录创建成功')
    } else {
      ElMessage.error(result.error || '创建失败')
    }
  } catch (error) {
    console.error('创建目录失败:', error)
    ElMessage.error('创建目录失败')
  }
}

// 目录操作
async function handleFolderAction(command: string, folder: DiaryFolder) {
  switch (command) {
    case 'rename':
      const { value } = await ElMessageBox.prompt('请输入新名称', '重命名', {
        inputValue: folder.name
      })
      if (value) {
        const result = await window.electronAPI.diary.updateFolder(folder.id, { name: value })
        if (result.success) {
          await loadFolders()
          ElMessage.success('重命名成功')
        }
      }
      break
    case 'delete':
      await ElMessageBox.confirm('确定删除该目录及其所有日记吗？', '删除确认', { type: 'warning' })
      const result = await window.electronAPI.diary.deleteFolder(folder.id)
      if (result.success) {
        if (currentFolder.value?.id === folder.id) {
          currentFolder.value = null
        }
        await loadFolders()
        ElMessage.success('删除成功')
      }
      break
  }
}

// 搜索
async function handleSearch() {
  if (!searchKeyword.value.trim()) {
    await loadEntries()
    return
  }
  // TODO: 实现搜索
}

// 日记更新后刷新列表
async function handleEntryUpdated() {
  await loadEntries()
}

// 格式化日期
function formatDate(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(() => {
  loadFolders()
})
</script>

<style lang="scss" scoped>
.diary-page {
  display: flex;
  height: 100%;
  background: var(--bg-color-page);
}

.page-sidebar {
  width: 280px;
  background: var(--bg-color);
  border-right: 1px solid var(--border-color-lighter);
  display: flex;
  flex-direction: column;

  .sidebar-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color-lighter);

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  .sidebar-content {
    flex: 1;
    overflow: hidden;
  }
}

.folder-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
  }

  .folder-icon {
    margin-right: 12px;
    color: var(--color-primary);
  }

  .folder-info {
    flex: 1;

    .folder-name {
      font-size: 14px;
    }

    .folder-stats {
      font-size: 12px;
      color: var(--text-color-secondary);
    }
  }
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);

  h3 {
    margin: 16px 0 8px;
    color: var(--text-color-primary);
  }

  p {
    margin-bottom: 24px;
  }
}

.main-header {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color-lighter);
  background: var(--bg-color);

  .header-right {
    display: flex;
    gap: 12px;
  }
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.entry-list {
  padding: 16px;
}

.entry-item {
  background: var(--bg-color);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  border: 1px solid var(--border-color-lighter);
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary-light-5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .entry-date {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-bottom: 4px;
  }

  .entry-title {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .entry-preview {
    font-size: 14px;
    color: var(--text-color-regular);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .entry-meta {
    font-size: 12px;
    color: var(--text-color-secondary);
  }
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--text-color-secondary);
}
</style>