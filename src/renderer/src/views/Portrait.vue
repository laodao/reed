<template>
  <div class="portrait-page">
    <!-- 左侧边栏 - 项目列表 -->
    <div class="page-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">人像项目</span>
        <el-button type="primary" size="small" @click="handleCreateProject">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>
      <div class="project-list">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-item"
          :class="{ active: selectedProjectId === project.id }"
          @click="selectProject(project.id)"
        >
          <div class="project-preview">
            <el-image
              v-if="getProjectPreview(project.id)"
              :src="getProjectPreview(project.id)"
              fit="cover"
            >
              <template #error>
                <div class="preview-placeholder">
                  <el-icon><Folder /></el-icon>
                </div>
              </template>
            </el-image>
            <div v-else class="preview-placeholder">
              <el-icon><Folder /></el-icon>
            </div>
          </div>
          <div class="project-info">
            <div class="project-name">{{ project.name }}</div>
            <div class="project-date">{{ formatDate(project.createdAt) }}</div>
          </div>
          <el-dropdown trigger="click" @command="handleProjectCommand($event, project)">
            <el-button link size="small">
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
        <el-empty v-if="projects.length === 0" description="还没有人像项目" />
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 未选择项目时显示引导 -->
      <template v-if="!selectedProjectId">
        <div class="empty-state">
          <el-icon :size="64" color="#c0c4cc"><Folder /></el-icon>
          <p>请选择一个项目，或点击"新建"创建新项目</p>
        </div>
      </template>

      <!-- 已选择项目但未选择角色：显示角色列表 -->
      <template v-else-if="!selectedCharacterId">
        <div class="character-list-page">
          <div class="page-header">
            <el-button @click="selectedProjectId = ''">
              <el-icon><ArrowLeft /></el-icon>
              返回
            </el-button>
            <h2>{{ selectedProject?.name }}</h2>
            <el-button type="primary" @click="showCreateCharacterDialog = true">
              <el-icon><Plus /></el-icon>
              创建人物形象
            </el-button>
          </div>

          <div class="character-grid" v-if="characters.length > 0">
            <div
              v-for="character in characters"
              :key="character.id"
              class="character-card"
              @click="selectCharacter(character.id)"
            >
              <div class="character-avatar">
                <el-image
                  v-if="getCharacterPreview(character.id)"
                  :src="getCharacterPreview(character.id)"
                  fit="cover"
                >
                  <template #error>
                    <div class="avatar-placeholder">
                      <el-icon><User /></el-icon>
                    </div>
                  </template>
                </el-image>
                <div v-else class="avatar-placeholder">
                  <el-icon><User /></el-icon>
                </div>
              </div>
              <div class="character-info">
                <h4>{{ character.name }}</h4>
                <p class="character-desc">
                  {{ GENDER_LABELS[character.gender] }} · {{ character.age }}岁 · {{ character.height }}cm
                </p>
                <p class="character-race">{{ RACE_LABELS[character.race] }}</p>
              </div>
              <div class="character-stats">
                <span>{{ getVariantCount(character.id) }} 张图片</span>
              </div>
              <div class="card-actions">
                <el-button
                  type="primary"
                  size="small"
                  circle
                  class="edit-btn"
                  @click.stop="openEditCharacterDialog(character)"
                >
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button
                  type="danger"
                  size="small"
                  circle
                  class="delete-btn"
                  @click.stop="handleDeleteCharacter(character)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </div>

          <el-empty v-else description="还没有人物形象，点击上方按钮创建">
            <el-button type="primary" @click="showCreateCharacterDialog = true">
              创建人物形象
            </el-button>
          </el-empty>
        </div>
      </template>

      <!-- 已选择角色：显示编辑界面（新版工作台，spec 2026-07-24） -->
      <template v-else>
        <PortraitWorkbench
          :character-id="selectedCharacterId"
          :project="selectedProject"
          @back="selectedCharacterId = ''"
          @deleted="handleCharacterDeleted"
        />
      </template>
    </div>

    <!-- 创建项目对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="创建人像项目"
      width="400px"
    >
      <el-form :model="newProjectForm" label-width="80px">
        <el-form-item label="项目名称">
          <el-input v-model="newProjectForm.name" placeholder="请输入项目名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCreateProject" :loading="creating">确定</el-button>
      </template>
    </el-dialog>

    <!-- 创建角色对话框 -->
    <CreateCharacterDialog
      v-model="showCreateCharacterDialog"
      :project-id="selectedProjectId"
      @success="handleCharacterCreated"
    />

    <!-- 编辑角色对话框 -->
    <EditCharacterDialog
      v-model="showEditCharacterDialog"
      :character="editingCharacter"
      @success="handleCharacterUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Folder, MoreFilled, User, Delete, ArrowLeft, Edit } from '@element-plus/icons-vue'
import CreateCharacterDialog from '@/components/portrait/CreateCharacterDialog.vue'
import EditCharacterDialog from '@/components/portrait/EditCharacterDialog.vue'
import PortraitWorkbench from '@/components/portrait/workbench/PortraitWorkbench.vue'
import { GENDER_LABELS, RACE_LABELS } from '../../../shared/types/portrait.types'
import type { PortraitProject, PortraitCharacter, PortraitVariant } from '../../../shared/types/portrait.types'

// ==================== 状态 ====================

const projects = ref<PortraitProject[]>([])
const characters = ref<PortraitCharacter[]>([])
const allVariants = ref<Map<string, PortraitVariant[]>>(new Map())
// 存储所有项目的角色（用于缩略图预览）
const allCharacters = ref<Map<string, PortraitCharacter[]>>(new Map())

const selectedProjectId = ref<string>('')
const selectedCharacterId = ref<string>('')

// 对话框状态
const showCreateDialog = ref(false)
const showCreateCharacterDialog = ref(false)
const showEditCharacterDialog = ref(false)
const editingCharacter = ref<PortraitCharacter | null>(null)
const newProjectForm = ref({ name: '' })
const creating = ref(false)

// ==================== 计算属性 ====================

const selectedProject = computed(() =>
  projects.value.find(p => p.id === selectedProjectId.value)
)

// ==================== 方法 ====================

async function loadProjects() {
  const result = await window.electronAPI.portrait.listProjects()
  if (result.success && result.data) {
    projects.value = result.data.projects
    // 预加载所有项目的角色和变体数据（用于显示缩略图）
    preloadAllProjectData()
  }
}

/**
 * 预加载所有项目的角色和变体数据（用于显示缩略图）
 * 异步执行，不阻塞界面
 */
async function preloadAllProjectData() {
  for (const project of projects.value) {
    try {
      const result = await window.electronAPI.portrait.listCharacters(project.id)
      if (result.success && result.data && result.data.length > 0) {
        // 存储该项目的所有角色
        allCharacters.value.set(project.id, result.data)
        // 只加载第一个角色的变体数据（用于缩略图）
        const firstChar = result.data[0]
        if (!allVariants.value.has(firstChar.id)) {
          const variantsResult = await window.electronAPI.portrait.listVariants(firstChar.id)
          if (variantsResult.success && variantsResult.data) {
            allVariants.value.set(firstChar.id, variantsResult.data)
          }
        }
      }
    } catch (e) {
      console.error('预加载项目数据失败:', e)
    }
  }
}

async function loadCharacters() {
  if (!selectedProjectId.value) {
    characters.value = []
    return
  }
  const result = await window.electronAPI.portrait.listCharacters(selectedProjectId.value)
  if (result.success && result.data) {
    characters.value = result.data
    // 更新 allCharacters
    allCharacters.value.set(selectedProjectId.value, result.data)
    // 预加载每个角色的变体
    for (const char of characters.value) {
      loadVariantsForCharacter(char.id)
    }
  }
}

async function loadVariantsForCharacter(characterId: string) {
  const result = await window.electronAPI.portrait.listVariants(characterId)
  if (result.success && result.data) {
    allVariants.value.set(characterId, result.data)
  }
}

function selectProject(id: string) {
  selectedProjectId.value = id
  selectedCharacterId.value = ''
  loadCharacters()
}

function selectCharacter(id: string) {
  selectedCharacterId.value = id
}

function getProjectPreview(projectId: string): string {
  // 从预加载的数据中查找项目中第一个有 base 类型正面形象的角色
  const projectCharacters = allCharacters.value.get(projectId) || []
  for (const char of projectCharacters) {
    const variants = allVariants.value.get(char.id) || []
    // 只使用 base 类型的正面形象，不使用换衣或换背景的图片
    const frontBaseVariant = variants.find(v => v.angle === 'front' && v.type === 'base')
    if (frontBaseVariant) return frontBaseVariant.imagePath
  }
  return ''
}

function getCharacterPreview(characterId: string): string {
  const variants = allVariants.value.get(characterId) || []
  // 只使用 base 类型的正面形象，不使用换衣或换背景的图片
  const frontBaseVariant = variants.find(v => v.angle === 'front' && v.type === 'base')
  return frontBaseVariant?.imagePath || ''
}

function getVariantCount(characterId: string): number {
  return allVariants.value.get(characterId)?.length || 0
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

function handleCreateProject() {
  newProjectForm.value.name = ''
  showCreateDialog.value = true
}

async function confirmCreateProject() {
  if (!newProjectForm.value.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }

  creating.value = true
  try {
    const result = await window.electronAPI.portrait.createProject({
      name: newProjectForm.value.name.trim()
    })

    if (result.success && result.data) {
      ElMessage.success('项目创建成功')
      showCreateDialog.value = false
      await loadProjects()
      selectProject(result.data.id)
    } else {
      ElMessage.error(result.error || '创建失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleProjectCommand(command: string, project: PortraitProject) {
  if (command === 'delete') {
    try {
      await ElMessageBox.confirm('确定要删除此项目吗？所有相关的图片都将被删除。', '删除确认', {
        type: 'warning'
      })
      const result = await window.electronAPI.portrait.deleteProject(project.id)
      if (result.success) {
        ElMessage.success('删除成功')
        if (selectedProjectId.value === project.id) {
          selectedProjectId.value = ''
          selectedCharacterId.value = ''
        }
        loadProjects()
      } else {
        ElMessage.error(result.error || '删除失败')
      }
    } catch {
      // 用户取消
    }
  } else if (command === 'rename') {
    const { value } = await ElMessageBox.prompt('请输入新名称', '重命名', {
      inputValue: project.name
    })
    if (value) {
      const result = await window.electronAPI.portrait.updateProject({
        id: project.id,
        name: value
      })
      if (result.success) {
        ElMessage.success('重命名成功')
        loadProjects()
      } else {
        ElMessage.error(result.error || '重命名失败')
      }
    }
  }
}

async function handleDeleteCharacter(character: PortraitCharacter) {
  try {
    await ElMessageBox.confirm(`确定要删除人物「${character.name}」吗？所有相关的图片都将被删除。`, '删除确认', {
      type: 'warning'
    })
    const result = await window.electronAPI.portrait.deleteCharacter(character.id)
    if (result.success) {
      ElMessage.success('删除成功')
      loadCharacters()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

function handleCharacterCreated(characterId: string) {
  loadCharacters()
  selectedCharacterId.value = characterId
}

function handleCharacterUpdated() {
  loadCharacters()
}

function openEditCharacterDialog(character: PortraitCharacter) {
  editingCharacter.value = character
  showEditCharacterDialog.value = true
}

function handleCharacterDeleted() {
  selectedCharacterId.value = ''
  loadCharacters()
}

// ==================== 生命周期 ====================

onMounted(async () => {
  await loadProjects()
  window.electronAPI.portrait.onGenerationEvent((data) => {
    if (data.type === 'generation-completed') {
      // 刷新相关角色的变体
      if (data.characterId) {
        loadVariantsForCharacter(data.characterId)
      }
    }
  })
})
</script>

<style lang="scss" scoped>
.portrait-page {
  display: flex;
  height: 100%;
  background: #f5f7fa;
  overflow: hidden;
}

.page-sidebar {
  width: 280px;
  height: 100%;
  background: #fff;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.project-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: var(--el-color-primary-light-9);
  }
}

.project-preview {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color);
  margin-right: 12px;

  .el-image {
    width: 100%;
    height: 100%;
  }

  .preview-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-placeholder);
  }
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);

  p {
    margin-top: 16px;
    font-size: 14px;
  }
}

// 角色列表页面样式
.character-list-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    flex: 1;
    text-align: center;
  }
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  grid-template-rows: auto;  /* 行高度自适应内容 */
  align-content: start;  /* 防止行被拉伸填满容器 */
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.character-card {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  /* 不设置 height，让卡片根据内容自然确定高度 */

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--el-color-primary-light-5);

    .card-actions {
      opacity: 1;
    }
  }

  .card-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }
}

.character-avatar {
  width: 100%;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color);
  margin-bottom: 12px;

  .el-image {
    width: 100%;
    height: 100%;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-placeholder);
    font-size: 48px;
  }
}

.character-info {
  h4 {
    margin: 0 0 4px;
    font-size: 16px;
    color: var(--el-text-color-primary);
  }

  .character-desc {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .character-race {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}

.character-stats {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>