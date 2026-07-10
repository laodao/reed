<template>
  <div class="ep-project-list-v3">
    <ProjectSidebar
      :projects="summaries"
      :selected-id="selectedProjectId"
      @create="showCreateProjectDialog = true"
      @select="onSelectProject"
      @rename="onRenameProject"
      @delete="onDeleteProject"
    />

    <main class="main-area">
      <EpisodeListPanel
        v-if="selectedProject && episodes !== null"
        :project="selectedProject"
        :episodes="episodes"
        @settings="dialogs.settings = true"
        @create-episode="dialogs.createEpisode = true"
        @batch-create-episode="dialogs.batchCreateEpisode = true"
        @open-quick-mode="dialogs.quickMode = true"
        @open-episode="onOpenEpisode"
        @edit-episode="onEditEpisode"
        @delete-episode="onDeleteEpisode"
      />
      <div v-else-if="loadingProject" class="loading">加载剧集中…</div>
      <div v-else class="empty-state">
        <el-icon :size="64"><Folder /></el-icon>
        <p>请选择一个项目，或点击左上角"新建"创建</p>
      </div>
    </main>

    <!-- 创建项目 dialog（沿用旧 V2 inline 实现） -->
    <el-dialog v-model="showCreateProjectDialog" title="新建剧集项目" width="600px" :close-on-click-modal="false">
      <el-form :model="createProjectForm" label-width="100px">
        <el-form-item label="项目名称" required>
          <el-input v-model="createProjectForm.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="关联长文">
          <el-select
            v-model="createProjectForm.longWritingProjectId"
            placeholder="可选 — 关联后剧集可用长文实体作 linked_lw"
            clearable
            style="width: 100%"
          >
            <el-option v-for="lw in longWritingProjects" :key="lw.id" :label="lw.name" :value="lw.id" />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">视频配置</el-divider>
        <el-form-item label="画幅比例">
          <el-select v-model="createProjectForm.config.aspectRatio" style="width: 100%">
            <el-option label="16:9 横屏" value="16:9" />
            <el-option label="9:16 竖屏" value="9:16" />
            <el-option label="4:3 标准" value="4:3" />
            <el-option label="1:1 方形" value="1:1" />
          </el-select>
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="createProjectForm.config.resolution" style="width: 100%">
            <el-option label="4K (3840×2160)" :value="2160" />
            <el-option label="2K (2560×1440)" :value="1440" />
            <el-option label="Full HD (1920×1080)" :value="1080" />
            <el-option label="HD (1280×720)" :value="720" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率">
          <el-select v-model="createProjectForm.config.fps" style="width: 100%">
            <el-option label="24 fps（电影）" :value="24" />
            <el-option label="30 fps（标准）" :value="30" />
            <el-option label="60 fps（高帧率）" :value="60" />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">风格</el-divider>
        <el-form-item label="项目风格">
          <el-select
            v-model="createProjectForm.config.styleAnchors"
            multiple filterable allow-create default-first-option
            placeholder="选择或输入主流风格（多选）"
            style="width: 100%"
          >
            <el-option v-for="s in STYLE_PRESETS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateProjectDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!createProjectForm.name.trim()"
          :loading="creating"
          @click="onConfirmCreateProject"
        >创建</el-button>
      </template>
    </el-dialog>

    <!-- 项目设置 dialog（从 EpisodeWorkbench 迁入） -->
    <SettingsDialog
      v-if="selectedProject"
      v-model="dialogs.settings"
      :all-lw-projects="longWritingProjects"
      :provider-configs="providerConfigs"
      :provider-templates="providerTemplates"
      @saved="onSettingsSaved"
    />

    <!-- 新建剧集 dialog（迁入） -->
    <CreateEpisodeDialog
      v-if="selectedProjectId"
      v-model="dialogs.createEpisode"
      :project-id="selectedProjectId"
      :initial-episode-number="(episodes?.length ?? 0) + 1"
      :outline-tree-data="outlineTreeData"
      @created="onEpisodeCreated"
    />

    <!-- 编辑剧集 dialog（迁入） -->
    <EditEpisodeDialog
      v-model="dialogs.editEpisode"
      :episode-id="dialogs.editingEpisodeId"
      :initial-number="dialogs.editingEpisodeNumber"
      :initial-title="dialogs.editingEpisodeTitle"
      @updated="onEpisodeUpdated"
    />

    <!-- AI 一键模式 wizard（spec 2026-05-09 ep-redesign §3.2 C3 · P-19） -->
    <AIQuickModeWizard
      v-if="selectedProject"
      v-model="dialogs.quickMode"
      :project="selectedProject"
      :next-episode-number="(episodes?.length ?? 0) + 1"
      @done="onQuickModeDone"
    />

    <!-- 批量创建剧集 dialog（上传剧本 → 按章拆分 → 批量建集） -->
    <BatchCreateEpisodesDialog
      v-if="selectedProjectId"
      v-model="dialogs.batchCreateEpisode"
      :project-id="selectedProjectId"
      @created="onEpisodeCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import ProjectSidebar from '@/components/episode-production/project-list/ProjectSidebar.vue'
import EpisodeListPanel from '@/components/episode-production/project-list/EpisodeListPanel.vue'
import CreateEpisodeDialog from '@/components/episode-production/dialogs/CreateEpisodeDialog.vue'
import EditEpisodeDialog from '@/components/episode-production/dialogs/EditEpisodeDialog.vue'
import SettingsDialog from '@/components/episode-production/dialogs/SettingsDialog.vue'
// spec 2026-05-09 ep-redesign §3.2 C3 · AI 一键模式
import AIQuickModeWizard from '@/components/episode-production/dialogs/AIQuickModeWizard.vue'
// 批量创建剧集（上传剧本文件 → 按章节拆分 → 批量建集）
import BatchCreateEpisodesDialog from '@/components/episode-production/dialogs/BatchCreateEpisodesDialog.vue'
import { STYLE_PRESETS } from '@core/modules/episode-production/assets/constants/style-presets'
import { useEpProjectStore } from '@/stores/episode-production/project.store'
import type {
  VideoProject,
  VideoProjectSummary,
  VideoProjectConfig,
} from '../../../shared/types/story-to-video.types'
import type { EpisodeWithProgress } from '../../../shared/types/episode-production/episode-with-progress.types'
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'
import type { OutlineTreeNode } from '@/components/episode-production/shared/outline-utils'

const router = useRouter()
const projectStore = useEpProjectStore()

// ===== 项目列表 =====
const summaries = ref<VideoProjectSummary[]>([])
const selectedProjectId = ref<string | null>(null)
const selectedProject = ref<VideoProject | null>(null)
const longWritingProjects = ref<Array<{ id: string; name: string }>>([])

// ===== 集列表 =====
const episodes = ref<EpisodeWithProgress[] | null>(null)
const loadingProject = ref(false)

// ===== 项目设置 dialog 所需上下文 =====
const providerConfigs = ref<UserProviderConfig[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])
const outlineTreeData = ref<OutlineTreeNode[]>([])

// ===== Dialog 状态 =====
const showCreateProjectDialog = ref(false)
const creating = ref(false)
const createProjectForm = reactive<{
  name: string
  longWritingProjectId: string
  config: VideoProjectConfig
}>({
  name: '',
  longWritingProjectId: '',
  config: {
    aspectRatio: '16:9',
    resolution: 1080 as any,
    fps: 30,
    defaultTransition: 'fade' as any,
    stylePrompt: '',
    styleAnchors: [],
  } as VideoProjectConfig,
})
const dialogs = reactive({
  settings: false,
  createEpisode: false,
  editEpisode: false,
  editingEpisodeId: '',
  editingEpisodeNumber: 1,
  editingEpisodeTitle: '',
  // AI 一键模式 wizard（spec 2026-05-09 ep-redesign §3.2 C3）
  quickMode: false,
  // 批量创建剧集（上传剧本 → 按章拆分 → 批量建集）
  batchCreateEpisode: false,
})

// ===== 数据加载 =====

async function loadSummaries(): Promise<void> {
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.listProjectsSummary) {
    ElMessage.error('当前环境不支持 listProjectsSummary')
    return
  }
  const resp = await api.listProjectsSummary()
  if (!resp.success) {
    ElMessage.error(resp.error || '加载项目失败')
    return
  }
  summaries.value = resp.data as VideoProjectSummary[]

  // 默认选中：上次进入工作台的项目，找不到则取首个
  if (!selectedProjectId.value && summaries.value.length > 0) {
    const last = projectStore.lastSelectedProjectId
    const initial =
      (last && summaries.value.find((p) => p.id === last)?.id) ||
      summaries.value[0].id
    await selectProject(initial)
  }
}

async function loadLongWritingProjects(): Promise<void> {
  const resp = await window.electronAPI.longwriting.getProjects()
  if (resp.success && resp.data) {
    longWritingProjects.value = resp.data.map((p: any) => ({ id: p.id, name: p.name }))
  }
}

async function loadProviderConfigs(): Promise<void> {
  // 与 EpisodeWorkbench 保持一致：走 providerTemplate.list + providerConfig.list
  const templatesResponse = await window.electronAPI.providerTemplate.list()
  if (templatesResponse.success && templatesResponse.templates) {
    providerTemplates.value = templatesResponse.templates
  }
  const response = await window.electronAPI.providerConfig.list()
  if (response.success && response.configs) {
    providerConfigs.value = response.configs.filter((c: UserProviderConfig) => c.isEnabled)
  }
}

async function selectProject(projectId: string): Promise<void> {
  if (selectedProjectId.value === projectId) return
  loadingProject.value = true
  selectedProjectId.value = projectId
  selectedProject.value = null
  episodes.value = null
  try {
    const api = window.electronAPI.episodeProduction
    const projResp = await api.getProject(projectId)
    if (!projResp.success || !projResp.data) {
      ElMessage.error(projResp.error || '项目加载失败')
      selectedProjectId.value = null
      return
    }
    selectedProject.value = projResp.data as VideoProject
    // Bug #1 修复（2026-05-10 e2e）：同步 projectStore.currentProject，否则 SettingsDialog
    // 内部读 projectStore.currentProject 加载的是上一项目数据。
    await projectStore.selectProject(selectedProject.value)
    await reloadEpisodes()
  } finally {
    loadingProject.value = false
  }
}

async function reloadEpisodes(): Promise<void> {
  if (!selectedProjectId.value) return
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.listEpisodesWithProgress) {
    ElMessage.error('当前环境不支持 listEpisodesWithProgress')
    episodes.value = []
    return
  }
  const resp = await api.listEpisodesWithProgress(selectedProjectId.value)
  if (!resp.success) {
    ElMessage.error(resp.error || '加载剧集失败')
    episodes.value = []
    return
  }
  episodes.value = resp.data as EpisodeWithProgress[]
}

// ===== 项目操作 =====

function onSelectProject(p: VideoProjectSummary): void {
  void selectProject(p.id)
}

async function onRenameProject(p: VideoProjectSummary): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('输入新名称', '重命名项目', {
      inputValue: p.name,
      inputValidator: (v) => (!!v && v.trim().length > 0) || '名称不能为空',
    })
    const resp = await window.electronAPI.episodeProduction.updateProject(p.id, { name: value.trim() })
    if (!resp.success) {
      ElMessage.error(resp.error || '重命名失败')
      return
    }
    ElMessage.success('已重命名')
    await loadSummaries()
    if (selectedProjectId.value === p.id) {
      const projResp = await window.electronAPI.episodeProduction.getProject(p.id)
      if (projResp.success && projResp.data) selectedProject.value = projResp.data as VideoProject
    }
  } catch {
    /* 取消 */
  }
}

async function onDeleteProject(p: VideoProjectSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除项目「${p.name}」？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  const resp = await window.electronAPI.episodeProduction.deleteProject(p.id)
  if (!resp.success) {
    ElMessage.error(resp.error || '删除失败')
    return
  }
  ElMessage.success('已删除')
  if (selectedProjectId.value === p.id) {
    selectedProjectId.value = null
    selectedProject.value = null
    episodes.value = null
    if (projectStore.lastSelectedProjectId === p.id) projectStore.setLastSelectedProjectId(null)
  }
  await loadSummaries()
}

async function onConfirmCreateProject(): Promise<void> {
  const name = createProjectForm.name.trim()
  if (!name) {
    ElMessage.warning('请输入项目名称')
    return
  }
  creating.value = true
  try {
    // 使用深拷贝提取原始数据，避免传递 Vue 响应式对象导致 IPC 克隆失败
    const config = JSON.parse(JSON.stringify(createProjectForm.config))
    const resp = await window.electronAPI.episodeProduction.createProject(
      name,
      createProjectForm.longWritingProjectId || undefined,
      config,
    )
    if (!resp.success || !resp.data) {
      ElMessage.error(resp.error || '创建失败')
      return
    }
    ElMessage.success('已创建')
    showCreateProjectDialog.value = false
    createProjectForm.name = ''
    createProjectForm.longWritingProjectId = ''
    await loadSummaries()
    await selectProject(resp.data.id)
  } finally {
    creating.value = false
  }
}

// ===== 集操作 =====

function onOpenEpisode(ep: EpisodeWithProgress): void {
  router.push(`/episode-production/${ep.projectId}/episode/${ep.id}`)
}

function onEditEpisode(ep: EpisodeWithProgress): void {
  dialogs.editingEpisodeId = ep.id
  dialogs.editingEpisodeNumber = ep.episodeNumber
  dialogs.editingEpisodeTitle = ep.title
  dialogs.editEpisode = true
}

async function onDeleteEpisode(ep: EpisodeWithProgress): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「第 ${ep.episodeNumber} 集 · ${ep.title}」？`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  const resp = await window.electronAPI.episodeProduction.deleteEpisode(ep.id)
  if (!resp.success) {
    ElMessage.error(resp.error || '删除失败')
    return
  }
  ElMessage.success('已删除')
  await reloadEpisodes()
  await loadSummaries()
}

async function onEpisodeCreated(): Promise<void> {
  await reloadEpisodes()
  await loadSummaries()
}

/** AI 一键 wizard 完成 → reload + 直接跳到该剧集 workbench */
async function onQuickModeDone(payload: { episodeId: string }): Promise<void> {
  await reloadEpisodes()
  await loadSummaries()
  if (selectedProjectId.value) {
    router.push(`/episode-production/${selectedProjectId.value}/episode/${payload.episodeId}`)
  }
}

async function onEpisodeUpdated(): Promise<void> {
  await reloadEpisodes()
}

async function onSettingsSaved(): Promise<void> {
  if (selectedProjectId.value) {
    const projResp = await window.electronAPI.episodeProduction.getProject(selectedProjectId.value)
    if (projResp.success && projResp.data) selectedProject.value = projResp.data as VideoProject
  }
  await loadSummaries()
}

onMounted(async () => {
  await loadLongWritingProjects()
  await loadProviderConfigs()
  await loadSummaries()
})
</script>

<style scoped lang="scss">
.ep-project-list-v3 {
  display: flex;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.empty-state,
.loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
