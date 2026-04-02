<template>
  <div class="longwriting-page">
    <div class="page-header">
      <h1>长文写作</h1>
      <div class="header-actions">
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
          @click="openProject(project)"
        >
          <div class="project-icon">
            <el-icon size="32">
              <Reading v-if="project.type === 'story'" />
              <Document v-else />
            </el-icon>
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
      title="全局设置"
      width="600px"
    >
      <el-tabs v-model="activeSettingsTab">
        <el-tab-pane label="故事类型" name="storyTypes">
          <div class="settings-section">
            <p class="settings-desc">配置可选的故事类型选项</p>
            <el-tag
              v-for="(type, index) in settingsForm.storyTypes"
              :key="index"
              closable
              @close="removeSettingItem('storyTypes', index)"
              class="settings-tag"
            >
              {{ type }}
            </el-tag>
            <el-input
              v-model="newStoryType"
              placeholder="输入新的故事类型"
              class="settings-input"
              @keyup.enter="addSettingItem('storyTypes', newStoryType); newStoryType = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('storyTypes', newStoryType); newStoryType = ''">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-tab-pane>

        <el-tab-pane label="故事风格" name="styles">
          <div class="settings-section">
            <p class="settings-desc">配置可选的故事风格选项</p>
            <el-tag
              v-for="(style, index) in settingsForm.styles"
              :key="index"
              closable
              @close="removeSettingItem('styles', index)"
              class="settings-tag"
            >
              {{ style }}
            </el-tag>
            <el-input
              v-model="newStyle"
              placeholder="输入新的故事风格"
              class="settings-input"
              @keyup.enter="addSettingItem('styles', newStyle); newStyle = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('styles', newStyle); newStyle = ''">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-tab-pane>

        <el-tab-pane label="目标读者" name="targetReaders">
          <div class="settings-section">
            <p class="settings-desc">配置可选的目标读者选项</p>
            <el-tag
              v-for="(reader, index) in settingsForm.targetReaders"
              :key="index"
              closable
              @close="removeSettingItem('targetReaders', index)"
              class="settings-tag"
            >
              {{ reader }}
            </el-tag>
            <el-input
              v-model="newTargetReader"
              placeholder="输入新的目标读者"
              class="settings-input"
              @keyup.enter="addSettingItem('targetReaders', newTargetReader); newTargetReader = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('targetReaders', newTargetReader); newTargetReader = ''">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-tab-pane>

        <el-tab-pane label="预估字数" name="estimatedLengths">
          <div class="settings-section">
            <p class="settings-desc">配置可选的预估字数选项</p>
            <el-tag
              v-for="(length, index) in settingsForm.estimatedLengths"
              :key="index"
              closable
              @close="removeSettingItem('estimatedLengths', index)"
              class="settings-tag"
            >
              {{ length }}
            </el-tag>
            <el-input
              v-model="newEstimatedLength"
              placeholder="输入新的预估字数"
              class="settings-input"
              @keyup.enter="addSettingItem('estimatedLengths', newEstimatedLength); newEstimatedLength = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('estimatedLengths', newEstimatedLength); newEstimatedLength = ''">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-tab-pane>

        <el-tab-pane label="技能设置" name="skills">
          <div class="settings-section">
            <h4>技能类型</h4>
            <el-tag
              v-for="(type, index) in settingsForm.skillTypes"
              :key="index"
              closable
              @close="removeSettingItem('skillTypes', index)"
              class="settings-tag"
            >
              {{ type }}
            </el-tag>
            <el-input
              v-model="newSkillType"
              placeholder="输入新的技能类型"
              class="settings-input"
              @keyup.enter="addSettingItem('skillTypes', newSkillType); newSkillType = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('skillTypes', newSkillType); newSkillType = ''">添加</el-button>
              </template>
            </el-input>

            <h4 style="margin-top: 16px">技能等级</h4>
            <el-tag
              v-for="(level, index) in settingsForm.skillLevels"
              :key="index"
              closable
              @close="removeSettingItem('skillLevels', index)"
              class="settings-tag"
            >
              {{ level }}
            </el-tag>
            <el-input
              v-model="newSkillLevel"
              placeholder="输入新的技能等级"
              class="settings-input"
              @keyup.enter="addSettingItem('skillLevels', newSkillLevel); newSkillLevel = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('skillLevels', newSkillLevel); newSkillLevel = ''">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-tab-pane>

        <el-tab-pane label="物品设置" name="items">
          <div class="settings-section">
            <h4>物品类型</h4>
            <el-tag
              v-for="(type, index) in settingsForm.itemTypes"
              :key="index"
              closable
              @close="removeSettingItem('itemTypes', index)"
              class="settings-tag"
            >
              {{ type }}
            </el-tag>
            <el-input
              v-model="newItemType"
              placeholder="输入新的物品类型"
              class="settings-input"
              @keyup.enter="addSettingItem('itemTypes', newItemType); newItemType = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('itemTypes', newItemType); newItemType = ''">添加</el-button>
              </template>
            </el-input>

            <h4 style="margin-top: 16px">物品等级</h4>
            <el-tag
              v-for="(level, index) in settingsForm.itemLevels"
              :key="index"
              closable
              @close="removeSettingItem('itemLevels', index)"
              class="settings-tag"
            >
              {{ level }}
            </el-tag>
            <el-input
              v-model="newItemLevel"
              placeholder="输入新的物品等级"
              class="settings-input"
              @keyup.enter="addSettingItem('itemLevels', newItemLevel); newItemLevel = ''"
            >
              <template #append>
                <el-button @click="addSettingItem('itemLevels', newItemLevel); newItemLevel = ''">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="showSettingsDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存设置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Reading, Document, Setting } from '@element-plus/icons-vue'
import type { LongWritingProject, LongWritingGlobalSettings } from '../../../../shared/types/longwriting.types'

const router = useRouter()

// 项目列表（Mock 数据）
const projects = ref<LongWritingProject[]>([])

// 创建对话框
const showCreateDialog = ref(false)
const createForm = ref({
  name: '',
  type: 'story' as 'story' | 'comment'
})

// 设置对话框
const showSettingsDialog = ref(false)
const activeSettingsTab = ref('storyTypes')
const settingsForm = ref<LongWritingGlobalSettings>({
  id: '',
  storyTypes: [],
  styles: [],
  targetReaders: [],
  estimatedLengths: [],
  skillTypes: [],
  skillLevels: [],
  itemTypes: [],
  itemLevels: [],
  createdAt: 0,
  updatedAt: 0
})

// 新增项输入
const newStoryType = ref('')
const newStyle = ref('')
const newTargetReader = ref('')
const newEstimatedLength = ref('')
const newSkillType = ref('')
const newSkillLevel = ref('')
const newItemType = ref('')
const newItemLevel = ref('')

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
    const result = await window.electronAPI.longwriting.createProject(requestData)
    console.log('createProject result:', result)

    if (result.success && result.data) {
      projects.value.unshift(result.data)
      showCreateDialog.value = false
      createForm.value = { name: '', type: 'story' }
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
function openProject(project: LongWritingProject) {
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

onMounted(() => {
  loadProjects()
  loadSettings()
})

// 加载全局设置
async function loadSettings() {
  try {
    const result = await window.electronAPI.longwriting.getGlobalSettings()
    if (result.success && result.data) {
      settingsForm.value = result.data
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 添加设置项
function addSettingItem(field: keyof LongWritingGlobalSettings, value: string) {
  if (!value.trim()) return
  const arr = settingsForm.value[field] as string[]
  if (!arr.includes(value.trim())) {
    arr.push(value.trim())
  }
}

// 移除设置项
function removeSettingItem(field: keyof LongWritingGlobalSettings, index: number) {
  const arr = settingsForm.value[field] as string[]
  arr.splice(index, 1)
}

// 保存设置
async function saveSettings() {
  try {
    const rawSettings = toRaw(settingsForm.value)
    const result = await window.electronAPI.longwriting.updateGlobalSettings({
      storyTypes: rawSettings.storyTypes,
      styles: rawSettings.styles,
      targetReaders: rawSettings.targetReaders,
      estimatedLengths: rawSettings.estimatedLengths,
      skillTypes: rawSettings.skillTypes,
      skillLevels: rawSettings.skillLevels,
      itemTypes: rawSettings.itemTypes,
      itemLevels: rawSettings.itemLevels
    })
    if (result.success) {
      ElMessage.success('设置已保存')
      showSettingsDialog.value = false
    } else {
      ElMessage.error('保存失败：' + result.error)
    }
  } catch (error: any) {
    ElMessage.error('保存失败：' + error.message)
  }
}
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
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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
</style>