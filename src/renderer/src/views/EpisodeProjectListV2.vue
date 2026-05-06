<template>
  <!--
    EpisodeProjectListV2 · 剧集项目列表（FU5-B1）

    严格按对照表 §1 + 原型 00-project-list 重写。差异修订：
    - 卡片：封面 + 标题 + 集数 · 来源标签 + 进度条（垂直布局）
    - grid 280px 最小（紧凑视觉密度）
    - 数据走 listProjectsSummary（A1 IPC，含聚合字段）
    - 末尾"+ 新建剧集项目"占位卡（dashed border）
    - 顶部面包屑
    - 删除按钮挪到 hover 浮层（用户决策 §1.D-6）
    - 视频配置（aspectRatio/resolution/fps）不在卡片显示（用户决策 §1.D-5）

    旧 EpisodeProjectList.vue 标 deprecated 后续 phase 删除。
  -->
  <div class="ep-project-list-v2">
    <div class="page-header">
      <div class="title-block">
        <nav class="breadcrumb">
          <RouterLink to="/" class="crumb-link">首页</RouterLink>
          <el-icon class="crumb-sep"><ArrowRight /></el-icon>
          <span class="crumb-current">剧集制作</span>
        </nav>
        <h1 class="page-title">剧集制作 · 项目列表</h1>
        <p class="page-subtitle">选择已有项目或新建一个</p>
      </div>
      <el-button type="primary" size="large" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        <span>新建项目</span>
      </el-button>
    </div>

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <span>加载项目中...</span>
      </div>

      <div v-else-if="error" class="error-state">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ error }}</span>
        <el-button text @click="loadSummaries">重试</el-button>
      </div>

      <div v-else class="project-grid">
        <article
          v-for="p in summaries"
          :key="p.id"
          class="project-card"
          @click="openProject(p)"
        >
          <div class="cover" :class="getCoverClass(p)">
            <span class="cover-emoji">{{ getCoverEmoji(p) }}</span>
            <button
              class="hover-delete"
              :title="`删除项目「${p.name}」`"
              @click.stop="confirmDelete(p)"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
          <div class="body">
            <h3 class="title" :title="p.name">{{ p.name }}</h3>
            <div class="meta">
              <span class="meta-item">{{ p.episodeCount }} 集</span>
              <span class="meta-sep">·</span>
              <AssetSourceTag
                :source="p.sourceType"
                :custom-label="p.sourceType === 'linked_lw' ? '长文' : '独立'"
                size="small"
              />
            </div>
            <div class="progress-row">
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: p.progressPct + '%' }" />
              </div>
              <span class="progress-text">
                {{ p.currentStageLabel ?? '未开始' }}
              </span>
            </div>
          </div>
        </article>

        <!-- "+ 新建剧集项目"占位卡（spec §1.D-4） -->
        <button
          class="project-card project-card-new"
          @click="showCreateDialog = true"
        >
          <el-icon :size="36"><Plus /></el-icon>
          <span class="new-label">新建剧集项目</span>
        </button>
      </div>
    </div>

    <!-- 创建项目对话框（复用旧 dialog 结构；后续 phase 可单独重写） -->
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
            placeholder="可选 — 关联后剧集可用长文实体作 linked_lw"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="lw in longWritingProjects"
              :key="lw.id"
              :label="lw.name"
              :value="lw.id"
            />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">视频配置</el-divider>
        <el-form-item label="画幅比例">
          <el-select v-model="createForm.config.aspectRatio" style="width: 100%">
            <el-option label="16:9 横屏" value="16:9" />
            <el-option label="9:16 竖屏" value="9:16" />
            <el-option label="4:3 标准" value="4:3" />
            <el-option label="1:1 方形" value="1:1" />
          </el-select>
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="createForm.config.resolution" style="width: 100%">
            <el-option label="4K (3840×2160)" :value="2160" />
            <el-option label="2K (2560×1440)" :value="1440" />
            <el-option label="Full HD (1920×1080)" :value="1080" />
            <el-option label="HD (1280×720)" :value="720" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率">
          <el-select v-model="createForm.config.fps" style="width: 100%">
            <el-option label="24 fps（电影）" :value="24" />
            <el-option label="30 fps（标准）" :value="30" />
            <el-option label="60 fps（高帧率）" :value="60" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!createForm.name.trim()"
          :loading="creating"
          @click="onCreate"
        >
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * EpisodeProjectListV2 · 严格按原型 §1 实施。
 *
 * 数据：listProjectsSummary（FU5-A1）一次性拿聚合字段。
 * 来源标签：FU5-A5 AssetSourceTag。
 */
import { ref, reactive, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowRight,
  Delete,
  Loading,
  Plus,
  WarningFilled,
} from '@element-plus/icons-vue'
import type {
  VideoProjectSummary,
  VideoProjectConfig,
} from '../../../shared/types/story-to-video.types'
import AssetSourceTag from '@/components/episode-production/shared/AssetSourceTag.vue'

const router = useRouter()

const summaries = ref<VideoProjectSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const longWritingProjects = ref<Array<{ id: string; name: string }>>([])
const showCreateDialog = ref(false)
const creating = ref(false)

const createForm = reactive<{
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
  } as VideoProjectConfig,
})

/** 4 种封面色（按项目 id hash 决定） */
const COVER_CLASSES = ['cover-c1', 'cover-c2', 'cover-c3', 'cover-c4'] as const

function getCoverClass(p: VideoProjectSummary): string {
  // 简单 hash：取 id 字符 charCode 累加 mod 4
  let sum = 0
  for (let i = 0; i < p.id.length; i++) sum += p.id.charCodeAt(i)
  return COVER_CLASSES[sum % COVER_CLASSES.length]
}

const COVER_EMOJI = ['🎬', '📖', '🎥', '📺']

function getCoverEmoji(p: VideoProjectSummary): string {
  let sum = 0
  for (let i = 0; i < p.id.length; i++) sum += p.id.charCodeAt(i)
  return COVER_EMOJI[sum % COVER_EMOJI.length]
}

async function loadSummaries(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listProjectsSummary) {
      error.value = '当前环境不支持 listProjectsSummary（升级中）'
      return
    }
    const resp = await api.listProjectsSummary()
    if (!resp.success) {
      error.value = resp.error || '加载项目失败'
      return
    }
    summaries.value = resp.data as VideoProjectSummary[]
  } catch (e: any) {
    error.value = e?.message ?? '加载项目失败'
  } finally {
    loading.value = false
  }
}

async function loadLongWritingProjects(): Promise<void> {
  try {
    const resp = await window.electronAPI.longwriting.getProjects()
    if (resp.success && resp.data) {
      longWritingProjects.value = resp.data.map((p: any) => ({ id: p.id, name: p.name }))
    }
  } catch (e) {
    console.error('[EpisodeProjectListV2] 加载长文项目失败', e)
  }
}

async function onCreate(): Promise<void> {
  const name = createForm.name.trim()
  if (!name) {
    ElMessage.warning('请输入项目名称')
    return
  }
  creating.value = true
  try {
    const resp = await window.electronAPI.episodeProduction.createProject(
      name,
      createForm.longWritingProjectId || undefined,
      createForm.config,
    )
    if (!resp.success || !resp.data) {
      ElMessage.error(resp.error || '创建失败')
      return
    }
    ElMessage.success('已创建')
    showCreateDialog.value = false
    createForm.name = ''
    createForm.longWritingProjectId = ''
    router.push(`/episode-production/${resp.data.id}`)
  } finally {
    creating.value = false
  }
}

function openProject(p: VideoProjectSummary): void {
  router.push(`/episode-production/${p.id}`)
}

async function confirmDelete(p: VideoProjectSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除项目「${p.name}」？此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  const resp = await window.electronAPI.episodeProduction.deleteProject(p.id)
  if (resp.success) {
    ElMessage.success('已删除')
    await loadSummaries()
  } else {
    ElMessage.error(resp.error || '删除失败')
  }
}

onMounted(() => {
  void loadSummaries()
  void loadLongWritingProjects()
})
</script>

<style scoped lang="scss">
.ep-project-list-v2 {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.title-block {
  flex: 1;
  min-width: 0;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.crumb-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.crumb-link:hover {
  text-decoration: underline;
}

.crumb-sep {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.crumb-current {
  color: var(--el-text-color-regular);
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-content {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 64px 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.project-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  padding: 0;
  font-family: inherit;
  color: inherit;
}

.project-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.project-card:hover .hover-delete {
  opacity: 1;
}

.cover {
  height: 130px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 60px;
}

/* 4 种封面渐变（视觉占位；后续可换真实封面） */
.cover-c1 {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
}
.cover-c2 {
  background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-dark-2));
}
.cover-c3 {
  background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-dark-2));
}
.cover-c4 {
  background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-dark-2));
}

.cover-emoji {
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
}

.hover-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: var(--el-color-white, #fff);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}

.hover-delete:hover {
  background: var(--el-color-danger);
}

.body {
  padding: 14px;
}

.title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

.meta-sep {
  color: var(--el-text-color-placeholder);
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-track {
  flex: 1;
  height: 4px;
  background: var(--el-fill-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--el-color-success);
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  flex-shrink: 0;
}

.project-card-new {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 220px;
  border-style: dashed;
  border-color: var(--el-border-color);
  background: transparent;
  color: var(--el-text-color-placeholder);
  transition: all 0.15s;
}

.project-card-new:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.new-label {
  font-size: 13px;
}
</style>
