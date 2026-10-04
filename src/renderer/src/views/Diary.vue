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
            <FolderTreeItem
              v-for="folder in rootFolders"
              :key="folder.id"
              :folder="folder"
              :all-folders="folders"
              :current-folder="currentFolder"
              :expanded-folders="expandedFolders"
              @select="selectFolder"
              @toggle="toggleFolderExpand"
              @action="handleFolderAction"
              @create-subfolder="openCreateSubfolderDialog"
            />
          </div>
        </el-scrollbar>
      </div>

      <!-- 回收站入口 -->
      <div class="sidebar-footer">
        <el-button text class="trash-button" @click="openTrash">
          <el-icon><Delete /></el-icon>
          回收站
        </el-button>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 那年今日 -->
      <div v-if="onThisDayEntries.length > 0 && !currentEntry && showOnThisDay" class="on-this-day">
        <div class="otd-header">
          <el-icon><Clock /></el-icon>
          <span>那年今日</span>
          <el-button text size="small" class="otd-close" @click="showOnThisDay = false">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
        <div class="otd-cards">
          <div
            v-for="entry in onThisDayEntries"
            :key="entry.id"
            class="otd-card"
            @click="selectEntry(entry)"
          >
            <span class="otd-year">{{ getEntryYear(entry) }}</span>
            <div class="otd-info">
              <div class="otd-title">{{ entry.title }}</div>
              <div class="otd-preview">{{ entry.preview }}</div>
            </div>
          </div>
        </div>
      </div>

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
              style="width: 180px"
              @keyup.enter="handleSearch"
              @clear="clearSearch"
            />
            <el-select
              v-model="tagFilter"
              placeholder="按标签筛选"
              clearable
              style="width: 130px"
            >
              <el-option v-for="tag in allTags" :key="tag" :label="tag" :value="tag" />
            </el-select>
            <el-radio-group v-model="viewMode" size="default">
              <el-radio-button value="list">
                <el-icon><Tickets /></el-icon>
              </el-radio-button>
              <el-radio-button value="calendar">
                <el-icon><Calendar /></el-icon>
              </el-radio-button>
            </el-radio-group>
            <el-button type="primary" @click="createNewEntry">
              <el-icon><Plus /></el-icon>
              新建日记
            </el-button>
          </div>
        </div>

        <div class="main-content">
          <el-scrollbar>
            <!-- 日历视图 -->
            <div v-if="viewMode === 'calendar'" class="calendar-view">
              <div class="calendar-toolbar">
                <el-button text @click="shiftMonth(-1)">
                  <el-icon><ArrowLeft /></el-icon>
                </el-button>
                <span class="calendar-month">{{ calendarMonthLabel }}</span>
                <el-button text @click="shiftMonth(1)">
                  <el-icon><ArrowRight /></el-icon>
                </el-button>
              </div>
              <div class="calendar-grid">
                <div v-for="w in WEEK_HEADERS" :key="w" class="calendar-week-header">{{ w }}</div>
                <div
                  v-for="(cell, i) in calendarCells"
                  :key="i"
                  class="calendar-cell"
                  :class="{
                    'other-month': !cell.inMonth,
                    'has-entries': cell.count > 0,
                    'is-today': cell.isToday
                  }"
                  @click="cell.count > 0 && openDayEntries(cell)"
                >
                  <span class="cell-day">{{ cell.day }}</span>
                  <span v-if="cell.count > 0" class="cell-count">{{ cell.count }}</span>
                </div>
              </div>
            </div>

            <!-- 列表视图 -->
            <template v-else>
              <div v-if="dateFilterLabel" class="filter-banner">
                <span>{{ dateFilterLabel }}</span>
                <el-button text size="small" @click="clearDateFilter">查看全部</el-button>
              </div>
              <div v-if="isLoadingEntries" class="loading-state">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>

              <div v-else-if="displayEntries.length === 0" class="empty-entries">
                <el-icon :size="48" color="#c0c4cc"><Document /></el-icon>
                <p>{{ searchResults ? '没有匹配的日记' : '暂无日记' }}</p>
                <el-button v-if="!searchResults" type="primary" @click="createNewEntry">写第一篇日记</el-button>
              </div>

              <div v-else class="entry-list">
                <div
                  v-for="entry in displayEntries"
                  :key="entry.id"
                  class="entry-item"
                  @click="selectEntry(entry)"
                >
                  <div class="entry-content">
                    <div class="entry-date">{{ formatDate(entry.createdAt) }}</div>
                    <div class="entry-title">{{ entry.title }}</div>
                    <div class="entry-preview">{{ entry.preview }}</div>
                    <div class="entry-meta">
                      <span>{{ entry.wordCount }} 字</span>
                      <el-tag
                        v-for="tag in entry.tags || []"
                        :key="tag"
                        size="small"
                        type="info"
                        class="entry-tag"
                      >{{ tag }}</el-tag>
                    </div>
                  </div>
                  <div class="entry-actions" @click.stop>
                    <el-button text size="small" @click="handleDeleteEntry(entry)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </div>
            </template>
          </el-scrollbar>
        </div>
      </template>

      <!-- 已选择日记 - 编辑器 -->
      <template v-else>
        <DiaryEditor
          :entry="currentEntry"
          @back="currentEntry = null"
          @updated="handleEntryUpdated"
          @open-entry="openEntryById"
        />
      </template>
    </div>

    <!-- 创建目录对话框 -->
    <el-dialog
      v-model="showCreateFolderDialog"
      :title="newFolderForm.parentId ? '新建子目录' : '新建目录'"
      width="400px"
      @closed="newFolderForm.parentId = ''"
    >
      <el-form :model="newFolderForm" label-width="80px">
        <el-form-item v-if="newFolderForm.parentId" label="父目录">
          <span>{{ getParentFolderName(newFolderForm.parentId) }}</span>
        </el-form-item>
        <el-form-item label="目录名称">
          <el-input v-model="newFolderForm.name" placeholder="请输入目录名称" @keyup.enter="handleCreateFolder" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateFolderDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFolder">确定</el-button>
      </template>
    </el-dialog>

    <!-- 回收站对话框 -->
    <el-dialog v-model="showTrashDialog" title="回收站" width="560px">
      <div v-if="isLoadingTrash" class="loading-state">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
      <template v-else>
        <div v-if="deletedEntries.length === 0" class="empty-state">
          <span>回收站是空的</span>
        </div>
        <template v-else>
          <div class="trash-toolbar">
            <span class="trash-hint">保留 30 天后自动清除</span>
            <el-button size="small" type="danger" text @click="handleEmptyTrash">清空回收站</el-button>
          </div>
          <div class="trash-list">
            <div v-for="entry in deletedEntries" :key="entry.id" class="trash-item">
              <div class="trash-item-info">
                <div class="trash-item-title">{{ entry.title }}</div>
                <div class="trash-item-meta">
                  {{ formatDate(entry.deletedAt) }} 删除 · {{ entry.wordCount }} 字
                </div>
              </div>
              <div class="trash-item-actions">
                <el-button size="small" @click="handleRestoreEntry(entry)">恢复</el-button>
                <el-button size="small" type="danger" text @click="handlePurgeEntry(entry)">彻底删除</el-button>
              </div>
            </div>
          </div>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'Diary' })
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, FolderOpened, Document, Loading, Delete, Tickets, Calendar, ArrowLeft, ArrowRight, Clock, Close
} from '@element-plus/icons-vue'
import DiaryEditor from '@/components/diary/DiaryEditor.vue'
import FolderTreeItem from '@/components/diary/FolderTreeItem.vue'
import type { DiaryFolder, DiaryEntryListItem, DiaryEntry } from '@shared/types/diary'

// 目录相关
const folders = ref<DiaryFolder[]>([])
const currentFolder = ref<DiaryFolder | null>(null)
const isLoadingFolders = ref(false)
const showCreateFolderDialog = ref(false)
const newFolderForm = ref({ name: '', parentId: '' })
const expandedFolders = ref<Set<string>>(new Set())

// 日记相关
const entries = ref<DiaryEntryListItem[]>([])
const currentEntry = ref<DiaryEntry | null>(null)
const isLoadingEntries = ref(false)
const searchKeyword = ref('')
const searchResults = ref<DiaryEntryListItem[] | null>(null)
const tagFilter = ref('')

// 视图模式与日历
type ViewMode = 'list' | 'calendar'
const viewMode = ref<ViewMode>('list')
const calendarMonth = ref(startOfMonth(new Date()))
const monthEntryMap = ref<Map<number, DiaryEntryListItem[]>>(new Map())
const WEEK_HEADERS = ['一', '二', '三', '四', '五', '六', '日']

// 日内筛选（点击日历某天进入）
const dateFilterDay = ref<Date | null>(null)

// 那年今日
const onThisDayEntries = ref<DiaryEntryListItem[]>([])
const showOnThisDay = ref(true)

// 回收站
const showTrashDialog = ref(false)
const isLoadingTrash = ref(false)
const deletedEntries = ref<DiaryEntryListItem[]>([])

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

const calendarMonthLabel = computed(() => {
  const d = calendarMonth.value
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
})

interface CalendarCell {
  day: number
  date: Date
  inMonth: boolean
  isToday: boolean
  count: number
}

const calendarCells = computed<CalendarCell[]>(() => {
  const first = calendarMonth.value
  const offset = (first.getDay() + 6) % 7 // 周一为一周开始
  const cells: CalendarCell[] = []
  const today = new Date()
  for (let i = 0; i < 42; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)
    const key = date.getDate()
    const count = date.getMonth() === first.getMonth() ? (monthEntryMap.value.get(key)?.length ?? 0) : 0
    cells.push({
      day: date.getDate(),
      date,
      inMonth: date.getMonth() === first.getMonth(),
      isToday: date.toDateString() === today.toDateString(),
      count
    })
  }
  return cells
})

async function shiftMonth(delta: number) {
  const d = calendarMonth.value
  calendarMonth.value = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  await loadCalendarMonth()
}

async function loadCalendarMonth() {
  if (!currentFolder.value) return
  const first = calendarMonth.value
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 1)
  try {
    const result = await window.electronAPI.diary.listByDateRange(
      first.toISOString(), last.toISOString(), currentFolder.value.id
    )
    if (result.success && result.data) {
      const map = new Map<number, DiaryEntryListItem[]>()
      for (const entry of result.data) {
        const day = new Date(entry.createdAt).getDate()
        const list = map.get(day) ?? []
        list.push(entry)
        map.set(day, list)
      }
      monthEntryMap.value = map
    }
  } catch (error) {
    console.error('加载日历数据失败:', error)
  }
}

function openDayEntries(cell: CalendarCell) {
  const list = monthEntryMap.value.get(cell.day) ?? []
  if (list.length === 1) {
    void selectEntry(list[0])
    return
  }
  // 多篇：切回列表视图并按当天过滤
  dateFilterDay.value = cell.date
  viewMode.value = 'list'
  searchResults.value = null
}

const dateFilterLabel = computed(() => {
  if (!dateFilterDay.value) return ''
  return `${formatDate(dateFilterDay.value)} 的日记`
})

function clearDateFilter() {
  dateFilterDay.value = null
}

// 展示列表 = 目录列表或搜索结果 → 应用日期过滤 → 应用标签过滤
const displayEntries = computed(() => {
  let list = searchResults.value ?? entries.value
  if (dateFilterDay.value) {
    const day = dateFilterDay.value
    list = list.filter(e => {
      const d = new Date(e.createdAt)
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
    })
  }
  if (tagFilter.value) {
    list = list.filter(e => (e.tags || []).includes(tagFilter.value))
  }
  return list
})

// 当前目录下出现过的全部标签（筛选下拉用）
const allTags = computed(() => {
  const set = new Set<string>()
  for (const e of entries.value) {
    for (const t of e.tags || []) set.add(t)
  }
  return [...set]
})

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

// 根目录列表
const rootFolders = computed(() => {
  return folders.value.filter(f => !f.parentId)
})

// 切换目录展开状态
function toggleFolderExpand(folderId: string) {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId)
  } else {
    expandedFolders.value.add(folderId)
  }
}

// 打开创建子目录对话框
function openCreateSubfolderDialog(parentFolder: DiaryFolder) {
  newFolderForm.value.parentId = parentFolder.id
  showCreateFolderDialog.value = true
}

// 获取父目录名称
function getParentFolderName(parentId: string): string {
  const parent = folders.value.find(f => f.id === parentId)
  return parent?.name || ''
}

// 选择目录
async function selectFolder(folder: DiaryFolder) {
  currentFolder.value = folder
  currentEntry.value = null
  searchKeyword.value = ''
  searchResults.value = null
  tagFilter.value = ''
  dateFilterDay.value = null
  await loadEntries()
  if (viewMode.value === 'calendar') {
    await loadCalendarMonth()
  }
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

// 创建新日记（每日一篇：当天已有日记则直接打开）
async function createNewEntry() {
  if (!currentFolder.value) return
  try {
    const today = new Date()
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const existing = await window.electronAPI.diary.listByDateRange(
      dayStart.toISOString(), dayEnd.toISOString(), currentFolder.value.id
    )
    if (existing.success && existing.data && existing.data.length > 0) {
      currentEntry.value = await fetchEntry(existing.data[0].id)
      ElMessage.info('今天已有日记，已为你打开')
      return
    }

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

async function fetchEntry(id: string): Promise<DiaryEntry | null> {
  const result = await window.electronAPI.diary.getEntry(id)
  return result.success ? result.data ?? null : null
}

// 选择日记
async function selectEntry(entry: DiaryEntryListItem) {
  const full = await fetchEntry(entry.id)
  if (full) {
    currentEntry.value = full
  } else {
    ElMessage.error('获取日记详情失败')
  }
}

// 从编辑器（反链面板）跳转到指定日记
async function openEntryById(id: string) {
  const full = await fetchEntry(id)
  if (full) {
    currentEntry.value = full
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
      name: newFolderForm.value.name.trim(),
      parentId: newFolderForm.value.parentId || undefined
    })
    if (result.success) {
      showCreateFolderDialog.value = false
      // 如果是在子目录下创建，展开父目录
      if (newFolderForm.value.parentId) {
        expandedFolders.value.add(newFolderForm.value.parentId)
      }
      newFolderForm.value.name = ''
      newFolderForm.value.parentId = ''
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
    case 'rename': {
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
    }
    case 'delete': {
      await ElMessageBox.confirm(
        '确定删除该目录及其所有日记吗？（日记将从磁盘永久删除，回收站不保留）',
        '删除确认',
        { type: 'warning' }
      )
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
    case 'toggle-brain': {
      const enabling = !folder.brainOptIn
      if (enabling) {
        await ElMessageBox.confirm(
          `开启后「${folder.name}」中的日记（300 字以上）将自动同步到「日记」知识库并进入知识大脑消化：AI 提炼你的观感与决定，全部进入提议箱，经你确认后才成为可检索的论断。现在回填存量日记吗？`,
          '纳入知识大脑',
          { type: 'info', confirmButtonText: '开启并回填', cancelButtonText: '取消' }
        )
      } else {
        await ElMessageBox.confirm(
          `关闭后停止同步新日记，并从「日记」知识库移除该目录已同步的内容。确定继续吗？`,
          '退出知识大脑',
          { type: 'warning', confirmButtonText: '关闭并清理', cancelButtonText: '取消' }
        )
      }
      const brainResult = await window.electronAPI.diary.setFolderBrainOptIn(folder.id, enabling)
      if (brainResult.success) {
        await loadFolders()
        ElMessage.success(enabling ? '已纳入知识大脑，存量日记回填中' : '已退出知识大脑并清理已同步内容')
      } else {
        ElMessage.error(brainResult.error || '操作失败')
      }
      break
    }
  }
}

// 搜索
async function handleSearch() {
  if (!currentFolder.value) return
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    clearSearch()
    return
  }
  try {
    const result = await window.electronAPI.diary.search(keyword, currentFolder.value.id)
    if (result.success) {
      searchResults.value = result.data || []
      dateFilterDay.value = null
    } else {
      ElMessage.error(result.error || '搜索失败')
    }
  } catch (error) {
    console.error('搜索失败:', error)
    ElMessage.error('搜索失败')
  }
}

function clearSearch() {
  searchKeyword.value = ''
  searchResults.value = null
}

// 日记更新后刷新列表
async function handleEntryUpdated() {
  await loadEntries()
  if (viewMode.value === 'calendar') {
    await loadCalendarMonth()
  }
}

// 删除日记（软删除 → 回收站）
async function handleDeleteEntry(entry: DiaryEntryListItem) {
  try {
    await ElMessageBox.confirm(`确定将日记「${entry.title}」移入回收站吗？`, '删除确认', { type: 'warning' })
    const result = await window.electronAPI.diary.deleteEntry(entry.id)
    if (result.success) {
      // 如果当前正在编辑这篇日记，关闭编辑器
      if (currentEntry.value?.id === entry.id) {
        currentEntry.value = null
      }
      await loadEntries()
      ElMessage.success('已移入回收站')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch (error) {
    // 用户取消不显示错误
    if (error !== 'cancel') {
      console.error('删除日记失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// ==================== 回收站 ====================

async function openTrash() {
  showTrashDialog.value = true
  isLoadingTrash.value = true
  try {
    const result = await window.electronAPI.diary.listDeleted()
    if (result.success) {
      deletedEntries.value = result.data || []
    } else {
      ElMessage.error(result.error || '加载回收站失败')
    }
  } catch (error) {
    console.error('加载回收站失败:', error)
  } finally {
    isLoadingTrash.value = false
  }
}

async function handleRestoreEntry(entry: DiaryEntryListItem) {
  const result = await window.electronAPI.diary.restoreEntry(entry.id)
  if (result.success) {
    deletedEntries.value = deletedEntries.value.filter(e => e.id !== entry.id)
    if (currentFolder.value?.id === entry.folderId) {
      await loadEntries()
    }
    ElMessage.success('已恢复')
  } else {
    ElMessage.error(result.error || '恢复失败')
  }
}

async function handlePurgeEntry(entry: DiaryEntryListItem) {
  try {
    await ElMessageBox.confirm(`彻底删除「${entry.title}」？此操作不可恢复。`, '彻底删除', { type: 'warning' })
    const result = await window.electronAPI.diary.purgeEntry(entry.id)
    if (result.success) {
      deletedEntries.value = deletedEntries.value.filter(e => e.id !== entry.id)
      ElMessage.success('已彻底删除')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('彻底删除失败:', error)
    }
  }
}

async function handleEmptyTrash() {
  try {
    await ElMessageBox.confirm(
      `清空回收站将彻底删除 ${deletedEntries.value.length} 篇日记，不可恢复。确定继续吗？`,
      '清空回收站',
      { type: 'warning' }
    )
    const result = await window.electronAPI.diary.emptyTrash()
    if (result.success) {
      deletedEntries.value = []
      ElMessage.success('回收站已清空')
    } else {
      ElMessage.error(result.error || '清空失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('清空回收站失败:', error)
    }
  }
}

// 那年今日：历史同月同日日记（最多 3 篇）
async function loadOnThisDay() {
  try {
    const result = await window.electronAPI.diary.getOnThisDay(3)
    if (result.success) {
      onThisDayEntries.value = result.data || []
    }
  } catch (error) {
    console.error('加载那年今日失败:', error)
  }
}

function getEntryYear(entry: DiaryEntryListItem): string {
  return String(new Date(entry.createdAt).getFullYear())
}

// 格式化日期
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(() => {
  loadFolders()
  loadOnThisDay()
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

  .sidebar-footer {
    padding: 8px 16px;
    border-top: 1px solid var(--border-color-lighter);

    .trash-button {
      width: 100%;
      justify-content: flex-start;
    }
  }
}

.folder-tree {
  padding: 8px 0;
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
    align-items: center;
  }
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.empty-entries {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);

  p {
    margin: 16px 0;
  }
}

.filter-banner {
  margin: 12px 16px 0;
  padding: 6px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-primary-light-9, var(--bg-color));
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color-regular);
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
  display: flex;
  align-items: flex-start;
  gap: 12px;

  &:hover {
    border-color: var(--color-primary-light-5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    .entry-actions {
      opacity: 1;
    }
  }

  .entry-content {
    flex: 1;
    min-width: 0;
  }

  .entry-actions {
    opacity: 0;
    transition: opacity 0.2s;
    flex-shrink: 0;
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
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;

    .entry-tag {
      height: 18px;
      line-height: 16px;
    }
  }
}

// 日历视图
.calendar-view {
  padding: 16px;

  .calendar-toolbar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;

    .calendar-month {
      font-size: 15px;
      font-weight: 500;
      min-width: 110px;
      text-align: center;
    }
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;

    .calendar-week-header {
      text-align: center;
      font-size: 12px;
      color: var(--text-color-secondary);
      padding: 4px 0;
    }

    .calendar-cell {
      aspect-ratio: 4 / 3;
      border: 1px solid var(--border-color-lighter);
      border-radius: 6px;
      padding: 6px;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: var(--text-color-regular);

      &.other-month {
        opacity: 0.35;
      }

      &.has-entries {
        cursor: pointer;
        border-color: var(--color-primary-light-5);
        background: var(--color-primary-light-9, rgba(64, 158, 255, 0.06));

        &:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }
      }

      &.is-today {
        .cell-day {
          font-weight: 600;
          color: var(--color-primary, #409eff);
        }
      }

      .cell-count {
        align-self: flex-end;
        font-size: 11px;
        background: var(--color-primary, #409eff);
        color: #fff;
        border-radius: 8px;
        padding: 0 6px;
        line-height: 16px;
      }
    }
  }
}

// 那年今日
.on-this-day {
  margin: 12px 16px 0;
  padding: 10px 14px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;

  .otd-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color-regular);
    margin-bottom: 8px;

    .otd-close {
      margin-left: auto;
    }
  }

  .otd-cards {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .otd-card {
    flex: 1;
    min-width: 240px;
    max-width: 360px;
    display: flex;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border-color-lighter);
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.2s;

    &:hover {
      border-color: var(--color-primary-light-5);
    }

    .otd-year {
      font-size: 18px;
      font-weight: 600;
      color: var(--color-primary, #409eff);
      line-height: 1.2;
      flex-shrink: 0;
    }

    .otd-info {
      min-width: 0;

      .otd-title {
        font-size: 13px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .otd-preview {
        font-size: 12px;
        color: var(--text-color-secondary);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin-top: 2px;
      }
    }
  }
}

// 回收站
.trash-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  .trash-hint {
    font-size: 12px;
    color: var(--text-color-secondary);
  }
}

.trash-list {
  max-height: 380px;
  overflow-y: auto;

  .trash-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 4px;
    border-bottom: 1px solid var(--border-color-lighter);

    &:last-child {
      border-bottom: none;
    }

    .trash-item-title {
      font-size: 14px;
      font-weight: 500;
    }

    .trash-item-meta {
      font-size: 12px;
      color: var(--text-color-secondary);
      margin-top: 2px;
    }

    .trash-item-actions {
      flex-shrink: 0;
    }
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
