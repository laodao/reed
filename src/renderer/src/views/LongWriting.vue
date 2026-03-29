<template>
  <div class="longwriting-page">
    <div class="page-header">
      <h1>长文写作</h1>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新建项目
      </el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Reading, Document } from '@element-plus/icons-vue'
import type { LongWritingProject } from '../../../../shared/types/longwriting.types'

const router = useRouter()

// 项目列表（Mock 数据）
const projects = ref<LongWritingProject[]>([])

// 创建对话框
const showCreateDialog = ref(false)
const createForm = ref({
  name: '',
  type: 'story' as 'story' | 'comment'
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
})
</script>

<style lang="scss" scoped>
.longwriting-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: var(--bg-color-page);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;

  h1 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0;
  }
}

.page-content {
  flex: 1;
  overflow-y: auto;
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
</style>