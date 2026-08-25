<template>
  <div class="ep-project-list">
    <!-- 头部 -->
    <div class="list-header">
      <div class="header-left">
        <el-button text @click="goBack"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
        <h1 class="page-title">项目</h1>
        <span class="page-sub">共 {{ projects.length }} 个项目</span>
      </div>
      <el-button type="primary" @click="showCreate = true">
        <el-icon><Plus /></el-icon>
        新建项目
      </el-button>
    </div>

    <!-- 项目卡片网格 -->
    <div v-if="projects.length > 0" class="card-grid">
      <div
        v-for="p in projects"
        :key="p.id"
        class="project-card"
        @click="openProject(p)"
      >
        <div class="card-cover">
          <el-image v-if="coverThumb(p)" :src="coverThumb(p)" fit="cover" class="cover-img" />
          <div v-else class="cover-placeholder">
            <el-icon :size="28"><VideoCamera /></el-icon>
          </div>
        </div>
        <div class="card-body">
          <div class="card-name">{{ p.name }}</div>
          <div class="card-meta">
            <span>{{ p.episodeCount }} 集</span>
          </div>
          <div v-if="p.currentStageLabel" class="card-stage">{{ p.currentStageLabel }}</div>
        </div>
      </div>
    </div>

    <!-- 空态 -->
    <div v-else class="empty-state">
      <el-icon :size="46" class="empty-icon"><FolderOpened /></el-icon>
      <p class="empty-text">还没有项目。<br />点击右上角「新建项目」开始你的创作。</p>
    </div>

    <!-- 新建项目 -->
    <NewProjectDialog v-model="showCreate" @created="onCreated" />
  </div>
</template>

<script setup lang="ts">
/**
 * 剧集制作 · 项目列表页（菜单入口 · V3 · 参照项目列表.png）。
 * 卡片网格显示所有项目；点项目 → 无剧集进「剧本创建页」，有剧集进工作台。
 * 「新建项目」→ 新建后直接进「剧本创建页」。
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, VideoCamera, FolderOpened, ArrowLeft } from '@element-plus/icons-vue'
import NewProjectDialog from '@/components/episode-production/home/NewProjectDialog.vue'
import type { VideoProjectSummary } from '@shared/types/episode-production/workflow.types'

defineOptions({ name: 'EpisodeProjectList' })

const router = useRouter()
const projects = ref<VideoProjectSummary[]>([])
const showCreate = ref(false)

function goBack(): void {
  router.push('/episode-production')
}

function coverThumb(p: VideoProjectSummary): string | null {
  const c = (p as any).coverUrl || (p as any).coverThumb || (p as any).thumbnailPath
  return c || null
}

async function load(): Promise<void> {
  try {
    const resp = await window.electronAPI.episodeProduction.listProjectsSummary()
    if (resp.success) projects.value = resp.data || []
  } catch (e: any) {
    console.error('[EpisodeProjectList] 加载项目失败', e)
  }
}

/** 点项目：查剧集 → 无剧集进「剧本创建页」，有剧集进工作台 */
async function openProject(p: VideoProjectSummary): Promise<void> {
  try {
    const resp = await window.electronAPI.episodeProduction.listEpisodes(p.id)
    if (resp.success && resp.data.length > 0) {
      const latest = resp.data[0]
      router.push(`/episode-production/${p.id}/studio/${latest.id}`)
    } else {
      router.push(`/episode-production/${p.id}/creator`)
    }
  } catch (e: any) {
    console.error('[EpisodeProjectList] 打开项目失败', e)
    router.push(`/episode-production/${p.id}/creator`)
  }
}

function onCreated(project: { id: string }): void {
  void load()
  router.push(`/episode-production/${project.id}/creator`)
}

onMounted(() => void load())
</script>

<style lang="scss" scoped>
.ep-project-list {
  height: 100%;
  overflow-y: auto;
  padding: 28px 40px;
  background: var(--bg-color-page);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  .header-left { display: flex; align-items: baseline; gap: 12px; }
  .page-title { margin: 0; font-size: 24px; font-weight: 700; color: var(--text-color-primary); }
  .page-sub { font-size: 13px; color: var(--text-color-secondary); }
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.project-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover {
    transform: translateY(-2px);
    border-color: var(--color-primary);
    box-shadow: var(--shadow-card-hover);
  }
}

.card-cover {
  height: 120px;
  background: var(--fill-color-lighter);
  display: flex;
  align-items: center;
  justify-content: center;
  .cover-img { width: 100%; height: 100%; object-fit: cover; }
  .cover-placeholder { color: var(--text-color-placeholder); }
}

.card-body { padding: 12px 14px 14px; }
.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-meta {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-color-secondary);
}
.card-stage {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-primary);
}

.empty-state {
  padding: 90px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  .empty-icon { color: var(--text-color-placeholder); }
  .empty-text { margin: 0; font-size: 14px; color: var(--text-color-secondary); line-height: 1.8; }
}
</style>
