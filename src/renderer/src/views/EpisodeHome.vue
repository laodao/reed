<template>
  <div class="episode-home">
    <!-- 头部 -->
    <div class="home-header">
      <h1 class="page-title">导入剧本，开始创作</h1>
      <p class="page-sub">粘贴完整剧本或上传 txt 文件，AI 自动拆集分。</p>
    </div>

    <!-- 导入剧本卡 -->
    <div class="import-wrap">
      <ScriptImportCard
        :key="importCardKey"
        @created="onImportCreated"
      />
    </div>

    <!-- 最近项目（横向滑动） -->
    <div class="recent-wrap">
      <RecentProjectsGrid
        :projects="projects"
        @open="onOpenProject"
        @create="showCreate = true"
        @more="onMore"
      />
    </div>

    <!-- 新建项目 -->
    <NewProjectDialog v-model="showCreate" @created="onProjectCreated" />
  </div>
</template>

<script setup lang="ts">
/**
 * M1 首页（剧集制作入口）：导入剧本卡 + 最近项目横向滑动 +「更多项目」→ 项目列表页 + 新建项目。
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ScriptImportCard from '@/components/episode-production/home/ScriptImportCard.vue'
import RecentProjectsGrid from '@/components/episode-production/home/RecentProjectsGrid.vue'
import NewProjectDialog from '@/components/episode-production/home/NewProjectDialog.vue'
import type { VideoProjectSummary } from '@shared/types/episode-production/workflow.types'

defineOptions({ name: 'EpisodeHome' })

const router = useRouter()
const projects = ref<VideoProjectSummary[]>([])
const showCreate = ref(false)
const importCardKey = ref(0)

async function load(): Promise<void> {
  try {
    const resp = await window.electronAPI.episodeProduction.listProjectsSummary()
    if (resp.success) projects.value = resp.data || []
  } catch (e: any) {
    console.error('[EpisodeHome] 加载项目失败', e)
  }
}

/** 导入成功 → 刷新列表 */
function onImportCreated(): void {
  importCardKey.value++
  void load()
}

function onProjectCreated(): void {
  void load()
}

/** 「更多项目」→ 跳转项目列表页 */
function onMore(): void {
  router.push('/episode-production/all')
}

/** 点击项目卡：进该项目最新剧集新版工作台 */
async function onOpenProject(p: VideoProjectSummary): Promise<void> {
  try {
    const resp = await window.electronAPI.episodeProduction.listEpisodes(p.id)
    if (resp.success && resp.data.length > 0) {
      const latest = resp.data[0]
      router.push(`/episode-production/${p.id}/studio/${latest.id}`)
    } else {
      // 无剧集 → 剧本创建页
      router.push(`/episode-production/${p.id}/creator`)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '打开项目失败')
  }
}

onMounted(() => void load())
</script>

<style lang="scss" scoped>
.episode-home {
  height: 100%;
  overflow-y: auto;
  padding: 28px 40px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 34px;
  background: var(--bg-color-page);
}

.home-header {
  text-align: center;
  .page-title { margin: 0 0 8px; font-size: 26px; font-weight: 700; color: var(--text-color-primary); }
  .page-sub { margin: 0; font-size: 14px; color: var(--text-color-secondary); }
}

.import-wrap { width: 100%; display: flex; justify-content: center; }
.recent-wrap { width: 100%; }
</style>
