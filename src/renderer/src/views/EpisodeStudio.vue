<template>
  <div class="ep-studio">
    <EpisodeStudioLayout>
      <!-- 工具条：返回 + 剧集切换 + tab 导航 + 状态 -->
      <template #toolbar>
        <div class="studio-toolbar">
          <el-button text @click="goBack"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
          <el-select
            v-model="episodeId"
            size="default"
            class="episode-select"
            placeholder="选择剧集"
            @change="onEpisodeChange"
          >
            <el-option
              v-for="ep in episodes"
              :key="ep.id"
              :label="`第 ${ep.episodeNumber} 集 · ${ep.title}`"
              :value="ep.id"
            />
          </el-select>
          <div class="tab-nav">
            <button
              v-for="t in tabs"
              :key="t.key"
              class="tab-btn"
              :class="{ active: activeTab === t.key }"
              @click="setTab(t.key)"
            >
              {{ t.label }}
            </button>
          </div>
          <el-tag v-if="currentEpisode" effect="plain" round :type="statusTagType(currentEpisode.status)">
            {{ statusLabel(currentEpisode.status) }}
          </el-tag>
        </div>
      </template>

      <!-- 主体：左+中由业务 tab 组件整体承载（其内部自管左导航+中央工作区），右侧 agent 全局 -->
      <div class="studio-body">
        <div class="studio-body-inner">
          <component
            :is="centerPanel"
            v-if="resolutionReady"
            :episode-id="episodeId"
            :project-id="projectId"
            :context-hint="ctx.contextHint.value"
            @data-changed="onTabDataChanged"
          />
        </div>
      </div>

      <template #agent>
        <EpAgentPanel
          :project-id="projectId"
          :episode-id="episodeId"
          :active-tab="activeTab"
          :context-hint="ctx.contextHint.value"
          @data-changed="onAgentDataChanged"
          @navigate="onAgentNavigate"
        />
      </template>
    </EpisodeStudioLayout>
  </div>
</template>

<script setup lang="ts">
/**
 * M0 · 新版工作台三段式容器 + 四 tab 宿主。
 * Route-level：持有 projectId/episodeId/activeTab 上下文，负责剧集切换 + tab 导航 + 右侧 agent。
 * 左侧树 + 中央工作区按 activeTab 切换业务组件（M2 剧本 / M3 资产 / M4 分镜 / M6 合成）。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import EpisodeStudioLayout from '@/components/episode-production/studio/EpisodeStudioLayout.vue'
import EpAgentPanel from '@/components/episode-production/agent/EpAgentPanel.vue'
import { useEpStudioContext, type EpStudioTab } from '@/composables/useEpStudioContext'
import StageScriptView from '@/components/episode-production/script/StageScriptView.vue'
import StageAssetView from '@/components/episode-production/asset/StageAssetView.vue'
import StageStoryboardTab from '@/components/episode-production/storyboard/StageStoryboardTab.vue'
import PlaceholderTab from '@/components/episode-production/studio/PlaceholderTab.vue'

const route = useRoute()
const router = useRouter()

const projectId = (route.params.projectId as string) || ''
const ctx = useEpStudioContext({
  projectId,
  episodeId: (route.params.episodeId as string) || '',
})
const episodeId = ctx.episodeId
const activeTab = ctx.activeTab

const tabs: Array<{ key: EpStudioTab; label: string }> = [
  { key: 'script', label: '剧本' },
  { key: 'asset', label: '资产' },
  { key: 'storyboard', label: '分镜' },
  { key: 'compose', label: '合成' },
]

const episodes = ref<any[]>([])
const currentEpisode = ref<any>(null)
const resolutionReady = computed(() => !!projectId && !!episodeId.value)

/** 工作区组件：按 tab 切换（剧本/资产 tab 的组件内部自管左导航+中央工作区） */
const centerPanel = computed(() => {
  switch (activeTab.value) {
    case 'script': return StageScriptView
    case 'asset': return StageAssetView
    case 'storyboard': return StageStoryboardTab
    default: return PlaceholderTab
  }
})

function statusLabel(s: string | null | undefined): string {
  const map: Record<string, string> = { pending: '内容', asset_prep: '资产', scripting: '剧本', storyboarding: '分镜', producing: '制作', composing: '合成', completed: '完成' }
  return map[s || ''] || (s || '未开始')
}
function statusTagType(s: string | null | undefined): 'warning' | 'success' | 'info' {
  return s === 'completed' ? 'success' : 'info'
}

async function loadEpisodes(): Promise<void> {
  const r = await window.electronAPI.episodeProduction.listEpisodes(projectId)
  if (r.success) episodes.value = r.data || []
}

async function loadEpisode(): Promise<void> {
  if (!episodeId.value) { currentEpisode.value = null; return }
  const r = await window.electronAPI.episodeProduction.getEpisode(episodeId.value)
  if (r.success) currentEpisode.value = r.data
}

function goBack(): void {
  router.push('/episode-production')
}

function setTab(tab: EpStudioTab): void {
  ctx.setTab(tab)
}

async function onEpisodeChange(): Promise<void> {
  ctx.setEpisode(episodeId.value)
  router.replace(`/episode-production/${projectId}/studio/${episodeId.value}`)
  await loadEpisode()
}

function onAgentDataChanged(_sections: string[]): void {
  void loadEpisode()
}

/** agent 发起跳转：切到对应 tab，并按需定位场景/资产 */
function onAgentNavigate(target: { tab: EpStudioTab; sceneId?: string | null; asset?: { kind: 'character' | 'location' | 'item'; id: string; name: string } | null } | null): void {
  if (!target?.tab) return
  ctx.setTab(target.tab)
  if (target.sceneId) ctx.setScene(target.sceneId)
  if (target.asset) ctx.setAsset(target.asset)
}

function onTabDataChanged(_sections: string[]): void {
  void loadEpisode()
}

watch(() => episodeId.value, () => void loadEpisode())

onMounted(async () => {
  await loadEpisodes()
  if (!episodeId.value && episodes.value.length > 0 && episodes.value[0]?.id) {
    episodeId.value = episodes.value[0].id
    ctx.setEpisode(episodeId.value)
  }
  await loadEpisode()
})
</script>

<style lang="scss" scoped>
.ep-studio {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-color-page);
}

.studio-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  .episode-select { width: 240px; }
  .tab-nav {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 0 6px;
    .tab-btn {
      border: none;
      background: transparent;
      padding: 6px 14px;
      font-size: 13px;
      color: var(--text-color-secondary);
      cursor: pointer;
      border-radius: 8px;
      transition: all var(--transition-fast);
      &.active { background: var(--color-primary-light-9); color: var(--color-primary); font-weight: 600; }
      &:hover { color: var(--color-primary); }
    }
  }
}

.studio-body {
  height: 100%;
  min-height: 0;
  display: flex;
  .studio-body-inner {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}
</style>
