<template>
  <div class="story-to-video-page">
    <div class="page-header">
      <h1>剧集制作</h1>
      <div class="header-actions">
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建项目
        </el-button>
      </div>
    </div>

    <div class="page-content">
      <!-- 项目列表 -->
      <div v-if="store.projects.length > 0" class="project-list">
        <div
          v-for="project in store.projects"
          :key="project.id"
          class="project-card"
          @click="openProject(project)"
        >
          <div class="project-icon">
            <el-icon size="32"><VideoCamera /></el-icon>
          </div>
          <div class="project-info">
            <h3 class="project-name">{{ project.name }}</h3>
            <div class="project-meta">
              <span class="project-status">{{ getStatusLabel(project.status) }}</span>
              <span class="project-date">{{ formatDate(project.createdAt) }}</span>
            </div>
            <div class="project-config">
              <el-tag size="small" type="info">
                {{ project.config.aspectRatio }}
              </el-tag>
              <el-tag size="small" type="info">
                {{ project.config.resolution }}p
              </el-tag>
              <el-tag size="small" type="info">
                {{ project.config.fps }}fps
              </el-tag>
            </div>
          </div>
          <div class="project-actions">
            <el-button text @click.stop="openProject(project)">
              <el-icon><FolderOpened /></el-icon>
            </el-button>
            <el-button text type="danger" @click.stop="confirmDeleteProject(project)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <el-empty description="暂无剧集项目">
          <template #image>
            <el-icon size="80" color="#c0c4cc"><VideoCamera /></el-icon>
          </template>
          <el-button type="primary" @click="showCreateDialog = true">创建第一个项目</el-button>
        </el-empty>
      </div>
    </div>

    <!-- 创建项目对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="新建剧集项目"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="项目名称" required>
          <el-input v-model="createForm.name" placeholder="请输入项目名称" />
        </el-form-item>

        <el-form-item label="关联长文">
          <el-select
            v-model="createForm.longWritingProjectId"
            placeholder="选择关联的长文项目（可选）"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="project in longWritingProjects"
              :key="project.id"
              :label="project.name"
              :value="project.id"
            />
          </el-select>
        </el-form-item>

        <el-divider content-position="left">视频配置</el-divider>

        <el-form-item label="画幅比例">
          <el-select v-model="createForm.config.aspectRatio" style="width: 100%">
            <el-option label="16:9 (横屏)" value="16:9" />
            <el-option label="9:16 (竖屏)" value="9:16" />
            <el-option label="4:3 (标准)" value="4:3" />
            <el-option label="1:1 (方形)" value="1:1" />
          </el-select>
        </el-form-item>

        <el-form-item label="分辨率">
          <el-select v-model="createForm.config.resolution" style="width: 100%">
            <el-option label="4K (3840×2160)" :value="2160" />
            <el-option label="2K (2560×1440)" :value="1440" />
            <el-option label="Full HD (1920×1080)" :value="1080" />
            <el-option label="HD (1280×720)" :value="720" />
            <el-option label="SD (854×480)" :value="480" />
          </el-select>
        </el-form-item>

        <el-form-item label="帧率">
          <el-select v-model="createForm.config.fps" style="width: 100%">
            <el-option label="24 fps (电影)" :value="24" />
            <el-option label="25 fps (PAL)" :value="25" />
            <el-option label="30 fps (标准)" :value="30" />
            <el-option label="60 fps (高帧率)" :value="60" />
          </el-select>
        </el-form-item>

        <el-form-item label="默认转场">
          <el-select v-model="createForm.config.defaultTransition" style="width: 100%">
            <el-option label="硬切" value="cut" />
            <el-option label="淡入淡出" value="fade" />
            <el-option label="溶解" value="dissolve" />
            <el-option label="滑动" value="slide" />
          </el-select>
        </el-form-item>

        <el-form-item label="风格提示词">
          <el-input
            v-model="createForm.config.stylePrompt"
            type="textarea"
            :rows="3"
            placeholder="输入视频风格描述，如：动漫风格、写实风格、水墨画风等"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!createForm.name" :loading="store.loading" @click="createProject">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, VideoCamera, FolderOpened, Delete } from '@element-plus/icons-vue'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import type { VideoProject, VideoProjectConfig } from '../../../shared/types/story-to-video.types'

const router = useRouter()
const store = useStoryToVideoStore()

// 长文项目列表（用于关联）
const longWritingProjects = ref<Array<{ id: string; name: string }>>([])

// 创建对话框
const showCreateDialog = ref(false)

// 创建表单
const createForm = reactive<{
  name: string
  longWritingProjectId: string
  config: VideoProjectConfig
}>({
  name: '',
  longWritingProjectId: '',
  config: {
    aspectRatio: '16:9',
    resolution: 1080,
    fps: 30,
    defaultTransition: 'fade',
    stylePrompt: ''
  }
})

/**
 * 加载数据
 */
async function loadData() {
  console.log('[StoryToVideo] 开始加载数据...')
  await store.loadProjects()
  console.log('[StoryToVideo] 加载项目完成, 项目数量:', store.projects.length)
  console.log('[StoryToVideo] 项目列表:', store.projects)
  // 加载长文项目列表
  await loadLongWritingProjects()
}

/**
 * 加载长文项目列表
 */
async function loadLongWritingProjects() {
  try {
    const response = await window.electronAPI.longwriting.getProjects()
    console.log('长文项目响应:', response)
    if (response.success && response.data) {
      longWritingProjects.value = response.data.map((p: any) => ({
        id: p.id,
        name: p.name
      }))
    }
  } catch (error) {
    console.error('加载长文项目失败:', error)
  }
}

/**
 * 创建项目
 */
async function createProject() {
  if (!createForm.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }

  const project = await store.createProject(
    createForm.name,
    createForm.longWritingProjectId || '',
    createForm.config
  )

  if (project) {
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    // 重置表单
    createForm.name = ''
    createForm.longWritingProjectId = ''
    createForm.config = {
      aspectRatio: '16:9',
      resolution: 1080,
      fps: 30,
      defaultTransition: 'fade',
      stylePrompt: ''
    }
    // 打开项目编辑页面
    router.push(`/story-to-video/${project.id}`)
  } else {
    ElMessage.error(store.error || '创建失败')
  }
}

/**
 * 打开项目
 */
function openProject(project: VideoProject) {
  router.push(`/story-to-video/${project.id}`)
}

/**
 * 确认删除项目
 */
async function confirmDeleteProject(project: VideoProject) {
  try {
    await ElMessageBox.confirm(
      `确定要删除项目「${project.name}」吗？此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const success = await store.deleteProject(project.id)
    if (success) {
      ElMessage.success('删除成功')
    } else {
      ElMessage.error(store.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

/**
 * 获取状态标签
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    draft: '草稿',
    in_progress: '制作中',
    completed: '已完成',
    archived: '已归档'
  }
  return statusMap[status] || status
}

/**
 * 格式化日期
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
.story-to-video-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }
}

.page-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.project-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.project-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }
}

.project-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-9);
  border-radius: 12px;
  color: var(--el-color-primary);
}

.project-info {
  flex: 1;
  min-width: 0;

  .project-name {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-meta {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .project-config {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
}

.project-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
}

:deep(.el-dialog__body) {
  padding: 20px;
}

:deep(.el-divider__text) {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>