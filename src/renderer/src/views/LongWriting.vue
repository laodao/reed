<template>
  <div class="longwriting-page">
    <div class="page-header">
      <h1>长文写作</h1>
      <div class="header-actions">
        <!-- 设定资产库入口（2026-09-24 P0）：与侧边栏二级菜单同路由 -->
        <el-button @click="router.push('/longwriting/worlds')">
          <el-icon><Collection /></el-icon>
          世界观库
        </el-button>
        <el-button @click="router.push('/longwriting/ip')">
          <el-icon><UserFilled /></el-icon>
          角色 IP 库
        </el-button>
        <el-button @click="showSettingsDialog = true">
          <el-icon><Setting /></el-icon>
          设置
        </el-button>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建项目
        </el-button>
      </div>
    </div>

    <div class="page-content">
      <!-- 项目列表 -->
      <div v-if="projects.length > 0" class="project-list">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-card"
          @click="project.type === 'story' ? openRoom(project) : openProject(project)"
        >
          <div class="project-icon" :class="{ 'has-cover': project.coverPath }">
            <img
              v-if="project.coverPath"
              :src="toImageUrl(project.coverPath)"
              class="cover-thumb"
              alt=""
            />
            <el-icon v-else size="32">
              <Reading v-if="project.type === 'story'" />
              <Document v-else />
            </el-icon>
            <button class="cover-edit-btn" title="设置封面" @click.stop="openCoverDialog(project)">
              <el-icon><Picture /></el-icon>
            </button>
          </div>
          <div class="project-info">
            <h3 class="project-name">{{ project.name }}</h3>
            <div class="project-meta">
              <span class="project-type">{{ project.type === 'story' ? '故事类' : '评论类' }}</span>
              <span class="project-stage">{{ getStageLabel(project.stage) }}</span>
            </div>
            <div class="project-progress">
              <el-progress :percentage="project.progress" :show-text="false" />
              <span class="progress-text">{{ project.progress }}%</span>
            </div>
          </div>
          <div class="project-actions">
            <el-tooltip v-if="project.type === 'story'" content="章节写作工作台（原 7 阶段编辑器）" placement="top">
              <el-button size="small" @click.stop="openProject(project)">
                ✍ 写作台
              </el-button>
            </el-tooltip>
            <el-button text @click.stop="editProject(project)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text type="danger" @click.stop="confirmDeleteProject(project)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <el-empty description="暂无项目">
          <el-button type="primary" @click="showCreateDialog = true">创建第一个项目</el-button>
        </el-empty>
      </div>
    </div>

    <!-- 创建项目对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="新建项目"
      width="500px"
    >
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="项目名称" required>
          <el-input v-model="createForm.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="项目类型" required>
          <el-radio-group v-model="createForm.type">
            <el-radio value="story">
              <el-icon><Reading /></el-icon>
              故事类
            </el-radio>
            <el-radio value="comment">
              <el-icon><Document /></el-icon>
              评论类
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="createForm.type === 'story'" label="内容目标">
          <el-radio-group v-model="createForm.contentTarget">
            <el-radio value="novel">长篇小说</el-radio>
            <el-radio value="script">短剧剧本</el-radio>
          </el-radio-group>
          <div class="form-tip">短剧目标：研讨室大纲阶段改出「分集大纲」，定稿后一键转短剧项目</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!createForm.name" @click="createProject">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 设置对话框 -->
    <el-dialog
      v-model="showSettingsDialog"
      title="字典设置"
      width="800px"
    >
      <div class="dictionary-settings">
        <el-tabs v-model="activeSettingsTab" type="border-card" closable @tab-remove="handleRemoveCategory">
          <el-tab-pane
            v-for="category in filteredCategories"
            :key="category.code"
            :label="category.name"
            :name="category.code"
          >
            <div class="category-header">
              <span class="category-info">分类编码：{{ category.code }}</span>
              <el-button
                size="small"
                text
                type="primary"
                @click="showEditCategoryDialog(category)"
              >
                编辑分类名称
              </el-button>
            </div>
            <DictionaryEditor
              :items="dictionary[category.code] || []"
              :category-code="category.code"
              @add="addItem"
              @update="updateItem"
              @remove="removeItem"
            />
          </el-tab-pane>

          <!-- 添加分类按钮 -->
          <template #add>
            <el-button size="small" @click="showAddCategoryDialog">
              <el-icon><Plus /></el-icon>
              新增分类
            </el-button>
          </template>
        </el-tabs>
      </div>
    </el-dialog>

    <!-- 新增分类对话框 -->
    <el-dialog
      v-model="showCategoryDialog"
      :title="editingCategory ? '编辑分类' : '新增分类'"
      width="400px"
    >
      <el-form :model="categoryForm" label-width="80px">
        <el-form-item label="分类编码" required>
          <el-input
            v-model="categoryForm.code"
            placeholder="请输入编码（英文）"
            :disabled="!!editingCategory"
          />
        </el-form-item>
        <el-form-item label="分类名称" required>
          <el-input v-model="categoryForm.name" placeholder="请输入名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCategoryDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!categoryForm.code || !categoryForm.name" @click="saveCategory">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 封面设置对话框 -->
    <CoverSettingsDialog
      v-model:visible="showCoverDialog"
      :project-id="coverDialogProject?.id || ''"
      :cover-path="coverDialogProject?.coverPath ?? null"
      @updated="onCoverUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Reading, Document, Setting, Picture, Collection, UserFilled } from '@element-plus/icons-vue'
import DictionaryEditor from '../components/longwriting/DictionaryEditor.vue'
import CoverSettingsDialog from '../components/longwriting/CoverSettingsDialog.vue'
import { toImageUrl } from '../utils/asset-url'
import { useTabsStore } from '@/stores/tabs'
import type { LongWritingProject } from '../../../../shared/types/longwriting.types'
import type { DictionaryCategory, DictionaryItem } from '../../../../shared/types/longwriting.types'

const router = useRouter()
const tabsStore = useTabsStore()

// 项目列表
const projects = ref<LongWritingProject[]>([])

// 创建对话框
const showCreateDialog = ref(false)
const createForm = ref({
  name: '',
  type: 'story' as 'story' | 'comment',
  contentTarget: 'novel' as 'novel' | 'script'
})

// 设置对话框
const showSettingsDialog = ref(false)
const activeSettingsTab = ref('')

// 封面设置对话框
const showCoverDialog = ref(false)
const coverDialogProject = ref<LongWritingProject | null>(null)

function openCoverDialog(project: LongWritingProject) {
  coverDialogProject.value = project
  showCoverDialog.value = true
}

function onCoverUpdated(updated: LongWritingProject) {
  const idx = projects.value.findIndex((p: LongWritingProject) => p.id === updated.id)
  if (idx >= 0) projects.value[idx] = updated
}

// 字典分类列表
const categories = ref<DictionaryCategory[]>([])

// 过滤后的分类列表（设置对话框中显示，排除技能物品相关分类）
const filteredCategories = computed(() => {
  const excludedCodes = ['skill_type', 'skill_level', 'item_type', 'item_level']
  return categories.value.filter(c => !excludedCodes.includes(c.code))
})

// 字典数据
const dictionary = ref<Record<string, DictionaryItem[]>>({})

// 分类对话框
const showCategoryDialog = ref(false)
const editingCategory = ref<DictionaryCategory | null>(null)
const categoryForm = ref({
  code: '',
  name: ''
})

// 阶段标签映射
const stageLabels: Record<string, string> = {
  overview: '故事概要',
  background: '背景设定',
  characters: '角色设定',
  skills: '技能物品',
  outline: '大纲设计',
  chapters: '章节写作',
  topic: '主题素材'
}

function getStageLabel(stage: string): string {
  return stageLabels[stage] || stage
}

// 加载项目列表
async function loadProjects() {
  const result = await window.electronAPI.longwriting.getProjects()
  if (result.success) {
    projects.value = result.data
  } else {
    console.error('加载项目失败:', result.error)
  }
}

// 创建项目
async function createProject() {
  if (!createForm.value.name) {
    ElMessage.warning('请输入项目名称')
    return
  }

  try {
    // 创建纯 JavaScript 对象，避免 Vue 响应式代理导致 IPC 序列化失败
    const requestData = {
      name: createForm.value.name,
      type: createForm.value.type
    }
    const contentTarget = createForm.value.contentTarget || 'novel'
    const result = await window.electronAPI.longwriting.createProject(requestData)
    console.log('createProject result:', result)

    if (result.success && result.data) {
      projects.value.unshift(result.data)
      // 短剧目标：写入房间状态（wizard_state.room.contentTarget，新项目 wizardState 为空，安全覆盖）
      if (contentTarget === 'script') {
        try {
          await window.electronAPI.longwriting.updateProject(result.data.id, {
            wizardState: {
              room: {
                ledger: [], summary: '', summarizedTurn: 0, turnNo: 0,
                phase: 'story-core', contentTarget: 'script', pendingCards: [], cardSeq: 0,
              },
            },
          } as never)
        } catch { /* 目标设置失败不阻断创建 */ }
      }
      showCreateDialog.value = false
      createForm.value = { name: '', type: 'story', contentTarget: 'novel' }
      ElMessage.success('项目创建成功')
    } else {
      ElMessage.error('创建失败：' + (result.error || '未知错误'))
    }
  } catch (error: any) {
    console.error('createProject error:', error)
    ElMessage.error('创建失败：' + error.message)
  }
}

// 打开项目
/** 进入故事研讨室（v2.1：story 类项目主入口） */
function openRoom(project: LongWritingProject) {
  const path = `/longwriting/room/${project.id}`
  tabsStore.preloadTab(path, `研讨室 · ${project.name}`)
  router.push(path)
}

function openProject(project: LongWritingProject) {
  // 预先设置 tab 标题为项目名称
  const path = project.type === 'story' ? `/story-editor/${project.id}` : `/comment-editor/${project.id}`
  tabsStore.preloadTab(path, project.name)

  if (project.type === 'story') {
    router.push(`/story-editor/${project.id}`)
  } else {
    router.push(`/comment-editor/${project.id}`)
  }
}

// 编辑项目
function editProject(project: LongWritingProject) {
  ElMessageBox.prompt('请输入新的项目名称', '编辑项目', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: project.name
  }).then(async ({ value }) => {
    const result = await window.electronAPI.longwriting.updateProject(project.id, { name: value })
    if (result.success) {
      project.name = value
      ElMessage.success('项目名称已更新')
    } else {
      ElMessage.error('更新失败：' + result.error)
    }
  }).catch(() => {
    // 用户取消
  })
}

// 确认删除项目
function confirmDeleteProject(project: LongWritingProject) {
  ElMessageBox.confirm(
    `确定要删除项目"${project.name}"吗？此操作不可恢复。`,
    '删除项目',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    const result = await window.electronAPI.longwriting.deleteProject(project.id)
    if (result.success) {
      const index = projects.value.findIndex(p => p.id === project.id)
      if (index !== -1) {
        projects.value.splice(index, 1)
      }
      ElMessage.success('项目已删除')
    } else {
      ElMessage.error('删除失败：' + result.error)
    }
  }).catch(() => {
    // 用户取消
  })
}

// 加载字典分类和数据
async function loadDictionary() {
  try {
    // 加载分类
    const categoriesResult = await window.electronAPI.longwriting.getDictionaryCategories()
    if (categoriesResult.success && categoriesResult.data) {
      categories.value = categoriesResult.data
      // 默认选中第一个过滤后的分类
      if (filteredCategories.value.length > 0 && !activeSettingsTab.value) {
        activeSettingsTab.value = filteredCategories.value[0].code
      }
    }

    // 加载字典项
    const dictResult = await window.electronAPI.longwriting.getDictionaryAll()
    if (dictResult.success && dictResult.data) {
      dictionary.value = dictResult.data
    }
  } catch (error) {
    console.error('加载字典失败:', error)
  }
}

// 显示新增分类对话框
function showAddCategoryDialog() {
  editingCategory.value = null
  categoryForm.value = { code: '', name: '' }
  showCategoryDialog.value = true
}

// 显示编辑分类对话框
function showEditCategoryDialog(category: DictionaryCategory) {
  editingCategory.value = category
  categoryForm.value = {
    code: category.code,
    name: category.name
  }
  showCategoryDialog.value = true
}

// 保存分类
async function saveCategory() {
  if (!categoryForm.value.code.trim() || !categoryForm.value.name.trim()) {
    ElMessage.warning('请输入编码和名称')
    return
  }

  try {
    if (editingCategory.value) {
      // 更新分类
      const result = await window.electronAPI.longwriting.updateDictionaryCategory(
        categoryForm.value.code,
        categoryForm.value.name
      )
      if (result.success) {
        const index = categories.value.findIndex(c => c.code === categoryForm.value.code)
        if (index !== -1) {
          categories.value[index].name = categoryForm.value.name
        }
        ElMessage.success('分类已更新')
        showCategoryDialog.value = false
      } else {
        ElMessage.error('更新失败：' + (result.error || '未知错误'))
      }
    } else {
      // 新增分类
      const result = await window.electronAPI.longwriting.createDictionaryCategory(
        categoryForm.value.code,
        categoryForm.value.name
      )
      if (result.success && result.data) {
        categories.value.push(result.data)
        dictionary.value[result.data.code] = []
        activeSettingsTab.value = result.data.code
        ElMessage.success('分类已创建')
        showCategoryDialog.value = false
      } else {
        ElMessage.error('创建失败：' + (result.error || '未知错误'))
      }
    }
  } catch (error: any) {
    ElMessage.error('操作失败：' + error.message)
  }
}

// 删除分类
async function handleRemoveCategory(categoryCode: string) {
  const category = categories.value.find(c => c.code === categoryCode)
  if (!category) return

  try {
    await ElMessageBox.confirm(
      `确定要删除分类「${category.name}」吗？该分类下的所有字典项都会被删除，此操作不可恢复。`,
      '删除分类',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await window.electronAPI.longwriting.deleteDictionaryCategory(categoryCode)
    if (result.success) {
      const index = categories.value.findIndex(c => c.code === categoryCode)
      if (index !== -1) {
        categories.value.splice(index, 1)
      }
      delete dictionary.value[categoryCode]

      // 重新选中第一个过滤后的分类
      if (activeSettingsTab.value === categoryCode && filteredCategories.value.length > 0) {
        activeSettingsTab.value = filteredCategories.value[0].code
      }

      ElMessage.success('分类已删除')
    } else {
      ElMessage.error('删除失败：' + (result.error || '未知错误'))
    }
  } catch {
    // 用户取消
  }
}

// 添加字典项
async function addItem(categoryCode: string, code: string, name: string) {
  if (!code.trim() || !name.trim()) return
  try {
    const result = await window.electronAPI.longwriting.createDictionaryItem(categoryCode, code.trim(), name.trim())
    if (result.success && result.data) {
      if (!dictionary.value[categoryCode]) {
        dictionary.value[categoryCode] = []
      }
      dictionary.value[categoryCode].push(result.data)
      ElMessage.success('添加成功')
    } else {
      ElMessage.error('添加失败：' + (result.error || '未知错误'))
    }
  } catch (error: any) {
    ElMessage.error('添加失败：' + error.message)
  }
}

// 更新字典项
async function updateItem(id: string, data: { code?: string; name?: string }) {
  try {
    const result = await window.electronAPI.longwriting.updateDictionaryItem(id, data)
    if (result.success && result.data) {
      // 找到并更新对应的项
      for (const categoryCode of Object.keys(dictionary.value)) {
        const index = dictionary.value[categoryCode].findIndex(item => item.id === id)
        if (index !== -1) {
          dictionary.value[categoryCode][index] = result.data
          break
        }
      }
      ElMessage.success('更新成功')
    } else {
      ElMessage.error('更新失败：' + (result.error || '未知错误'))
    }
  } catch (error: any) {
    ElMessage.error('更新失败：' + error.message)
  }
}

// 删除字典项
async function removeItem(categoryCode: string, id: string) {
  try {
    const result = await window.electronAPI.longwriting.deleteDictionaryItem(id)
    if (result.success) {
      const index = dictionary.value[categoryCode]?.findIndex(item => item.id === id)
      if (index !== undefined && index !== -1) {
        dictionary.value[categoryCode].splice(index, 1)
      }
      ElMessage.success('删除成功')
    } else {
      ElMessage.error('删除失败：' + (result.error || '未知错误'))
    }
  } catch (error: any) {
    ElMessage.error('删除失败：' + error.message)
  }
}

onMounted(() => {
  loadProjects()
  loadDictionary()
})
</script>

<style lang="scss" scoped>
.longwriting-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color-page);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
  flex-shrink: 0;

  h1 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0;
  }
}

.page-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}

.project-list {
  display: grid;
  // 430px 下限：M8 起卡片带「✍写作台」动作区（约 200px），320px 时信息区会被压到
  // 只剩 ~60px、名称顶进按钮区——下限须容得下 图标56+动作198+信息区≥130
  grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: 16px;
}

.project-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary-light-3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
}

.project-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light-9);
  border-radius: 12px;
  color: var(--color-primary);
  margin-right: 16px;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;

  .cover-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .cover-edit-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 18px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  &:hover .cover-edit-btn {
    opacity: 1;
  }
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-color-primary);
  margin: 0 0 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;

  span {
    font-size: 12px;
    color: var(--text-color-secondary);
  }
}

.project-progress {
  display: flex;
  align-items: center;
  gap: 8px;

  .el-progress {
    flex: 1;
  }

  .progress-text {
    font-size: 12px;
    color: var(--text-color-secondary);
    min-width: 36px;
  }
}

.project-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 8px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.settings-section {
  padding: 16px 0;

  h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-color-primary);
  }
}

.settings-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0 0 12px 0;
}

.settings-tag {
  margin-right: 8px;
  margin-bottom: 8px;
}

.settings-input {
  margin-top: 12px;
  max-width: 300px;
}

.dictionary-settings {
  :deep(.el-tabs__header) {
    margin-bottom: 0;
  }

  :deep(.el-tabs__content) {
    padding: 16px;
  }
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color-lighter);

  .category-info {
    font-size: 13px;
    color: var(--text-color-secondary);
    font-family: monospace;
  }
}
</style>