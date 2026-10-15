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
          <el-button text title="新建剧集" @click="newEpisodeVisible = true"><el-icon><Plus /></el-icon></el-button>
          <div class="tab-nav">
            <button
              v-for="t in tabs"
              :key="t.key"
              class="tab-btn"
              :class="{ active: activeTab === t.key }"
              @click="setTab(t.key)"
            >
              <span class="tab-dot" :class="{ ready: stageOf(t.key)?.ready }" />
              {{ t.label }}
            </button>
          </div>
          <el-tag v-if="currentEpisode" effect="plain" round :type="statusTagType(currentEpisode.status)">
            {{ statusLabel(currentEpisode.status) }}
          </el-tag>
          <div class="header-right">
            <el-button text title="AI 用量统计" @click="openUsage"><el-icon><DataAnalysis /></el-icon></el-button>
            <el-button text title="项目设置" @click="settingsVisible = true"><el-icon><Setting /></el-icon></el-button>
          </div>
        </div>
      </template>

      <!-- 主体：左+中由业务 tab 组件整体承载（其内部自管左导航+中央工作区），右侧 agent 按界面域独立会话 -->
      <div class="studio-body">
        <div class="studio-body-inner">
          <!-- S-01：当前 tab 未就绪时的提示条（缺什么 + 去哪一步补） -->
          <el-alert
            v-if="activeStage && !activeStage.ready"
            class="readiness-bar"
            type="warning"
            :closable="false"
            show-icon
          >
            <template #title>
              <span class="rb-title">{{ tabLabel(activeTab) }}未就绪</span>
              <span class="rb-missing">{{ activeStage.missing.join('；') }}</span>
              <span class="rb-suggestion">{{ stageSuggestion(activeTab) }}</span>
            </template>
          </el-alert>
          <div class="panel-wrap">
            <component
              :is="centerPanel"
              v-if="resolutionReady"
              :episode-id="episodeId"
              :project-id="projectId"
              :context-hint="ctx.contextHint.value"
              :external-asset="ctx.selectedAsset.value"
              :refresh-tick="agentTick"
              @data-changed="onTabDataChanged"
              @switch-tab="setTab"
              @asset-selected="onAssetSelected"
            />
          </div>
        </div>
      </div>

      <template #agent>
        <!-- scope=界面域：剧本/资产(各类别)/分镜/合成各自独立会话；:key 换域重挂载并重拉历史 -->
        <EpAgentPanel
          :key="agentScope"
          :project-id="projectId"
          :episode-id="episodeId"
          :scope="agentScope"
          :context-hint="ctx.contextHint.value"
          @data-changed="onAgentDataChanged"
          @navigate="onAgentNavigate"
        />
      </template>
    </EpisodeStudioLayout>

    <SettingsDialog
      v-model="settingsVisible"
      :all-lw-projects="allLwProjects"
      :provider-configs="providerConfigs"
      :provider-templates="providerTemplates"
      @saved="onSettingsSaved"
    />

    <!-- 新建剧集（方案A 2026-09-19）：长文章节 / 粘贴文本 / AI 生成三种来源 -->
    <NewEpisodeDialog
      v-model="newEpisodeVisible"
      :project-id="projectId"
      :existing-episode-count="episodes.length"
      :long-writing-project-id="projectLongWritingId"
      @created="onNewEpisodeCreated"
    />

    <!-- S-09 用量面板：ai_call_stats 按 call_type+model 聚合（项目级） -->
    <el-dialog v-model="usageVisible" title="AI 用量统计（本项目）" width="680px">
      <div v-if="usageLoading" class="usage-loading">加载中...</div>
      <template v-else>
        <el-table v-if="usageRows.length" :data="usageRows" size="small" max-height="380">
          <el-table-column prop="callType" label="调用类型" width="110" />
          <el-table-column label="模型" min-width="180">
            <template #default="{ row }">{{ row.modelId || '—' }}</template>
          </el-table-column>
          <el-table-column prop="count" label="次数" width="80" align="right" />
          <el-table-column label="总耗时" width="110" align="right">
            <template #default="{ row }">{{ formatMs(row.totalMs) }}</template>
          </el-table-column>
          <el-table-column label="平均耗时" width="110" align="right">
            <template #default="{ row }">{{ formatMs(row.avgMs) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无用量记录：跑一次生成后再看" :image-size="60" />
        <div class="usage-ref">参考：turbo≈4 分钟/段、高质量≈35 分钟/段</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * M0 · 新版工作台三段式容器 + 四 tab 宿主。
 * Route-level：持有 projectId/episodeId/activeTab 上下文，负责剧集切换 + tab 导航 + 右侧 agent。
 * 右侧 agent 按界面域（agentScope）独立会话：剧本/资产(角色/地点/物品各类别)/分镜/合成各一份历史，
 * 面板以 :key=agentScope 换域重挂载（2026-10-15）。
 * 左侧树 + 中央工作区按 activeTab 切换业务组件（M2 剧本 / M3 资产 / M4 分镜 / M6 合成）。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Setting, DataAnalysis, Plus } from '@element-plus/icons-vue'
import EpisodeStudioLayout from '@/components/episode-production/studio/EpisodeStudioLayout.vue'
import EpAgentPanel from '@/components/episode-production/agent/EpAgentPanel.vue'
import SettingsDialog from '@/components/episode-production/dialogs/SettingsDialog.vue'
import NewEpisodeDialog from '@/components/episode-production/dialogs/NewEpisodeDialog.vue'
import { useEpStudioContext, type EpStudioTab } from '@/composables/useEpStudioContext'
import { useEpProjectStore } from '@/stores/episode-production'
import { useTabsStore } from '@/stores/tabs'
import { epTabTitleOf } from './episode-production-ui'
import StageScriptView from '@/components/episode-production/script/StageScriptView.vue'
import StageAssetView from '@/components/episode-production/asset/StageAssetView.vue'
import StageStoryboardTab from '@/components/episode-production/storyboard/StageStoryboardTab.vue'
import StageComposeTab from '@/components/episode-production/compose/StageComposeTab.vue'
import PlaceholderTab from '@/components/episode-production/studio/PlaceholderTab.vue'
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'

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

// ===== S-01 阶段就绪状态机（ep:episode-readiness） =====
interface StageReadiness { ready: boolean; missing: string[] }
interface EpisodeReadiness {
  script: StageReadiness
  assets: StageReadiness
  storyboard: StageReadiness
  compose: StageReadiness
}
const readiness = ref<EpisodeReadiness | null>(null)

/** agent 改数据的版本号：作为 refresh-tick 传给当前 tab 组件触发其重载 */
const agentTick = ref(0)

/** tab key → readiness 阶段 key（资产 tab 对应 assets） */
const STAGE_KEY: Record<EpStudioTab, keyof EpisodeReadiness> = {
  script: 'script',
  asset: 'assets',
  storyboard: 'storyboard',
  compose: 'compose',
}

function stageOf(tab: EpStudioTab): StageReadiness | null {
  return readiness.value?.[STAGE_KEY[tab]] ?? null
}

const activeStage = computed(() => stageOf(activeTab.value))

function tabLabel(tab: EpStudioTab): string {
  return tabs.find(t => t.key === tab)?.label ?? ''
}

/** 未就绪时的"去哪一步补"建议 */
function stageSuggestion(tab: EpStudioTab): string {
  switch (tab) {
    case 'script': return '请在本页生成剧本并拆分场景'
    case 'asset': return '请到「资产」页创建资产并生成主图'
    case 'storyboard': return '请先在「剧本」页完成剧本，再点本页「生成分镜」'
    case 'compose': return '请到「分镜」页逐片段生成视频后再导出'
    default: return ''
  }
}

async function loadReadiness(): Promise<void> {
  if (!episodeId.value) { readiness.value = null; return }
  try {
    const r = await window.electronAPI.episodeProduction.episodeReadiness(episodeId.value)
    readiness.value = r?.success ? (r.data ?? null) : null
  } catch {
    readiness.value = null
  }
}

// ===== 项目设置对话框（D3） =====
const projectStore = useEpProjectStore()
const tabsStore = useTabsStore()
const settingsVisible = ref(false)
const allLwProjects = ref<Array<{ id: string; name: string }>>([])
const providerConfigs = ref<UserProviderConfig[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])

// ===== 新建剧集（方案A 2026-09-19） =====
const newEpisodeVisible = ref(false)
/** 项目关联的长文项目 ID（video_projects.longWritingProjectId 列） */
const projectLongWritingId = computed(
  () => (projectStore.currentProject as any)?.longWritingProjectId ?? null,
)

// tab 标题跟项目名走（超 6 字截断，口径见 epTabTitleOf）：覆盖深链/会话恢复等未经
// preloadTab 的入口，项目设置里改名后当前 tab 也即时同步。
watch(
  () => projectStore.currentProject?.name,
  (n) => {
    if (n) tabsStore.updateTabTitle(route.path, epTabTitleOf(n))
  },
  { immediate: true }
)

/** 创建成功：刷新列表并切到新集 */
async function onNewEpisodeCreated(newEpisodeId: string): Promise<void> {
  await loadEpisodes()
  episodeId.value = newEpisodeId
  await onEpisodeChange()
}

async function loadAllLwProjects(): Promise<void> {
  try {
    const response = await window.electronAPI.longwriting.getProjects()
    if (response.success && response.data) {
      allLwProjects.value = response.data.map((p: any) => ({ id: p.id, name: p.name }))
    }
  } catch (error) {
    console.error('加载长文项目列表失败:', error)
  }
}

async function loadProviderConfigs(): Promise<void> {
  try {
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.data) {
      providerConfigs.value = response.data.filter((c: UserProviderConfig) => c.runtimeUsable ?? c.isEnabled)
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

async function onSettingsSaved(): Promise<void> {
  await projectStore.loadProject(projectId)
}

// ===== S-09 用量面板（ep:ai-usage-stats，项目级聚合） =====
interface UsageRow { callType: string; modelId: string | null; count: number; totalMs: number; avgMs: number }
const usageVisible = ref(false)
const usageLoading = ref(false)
const usageRows = ref<UsageRow[]>([])

async function openUsage(): Promise<void> {
  usageVisible.value = true
  usageLoading.value = true
  try {
    const r = await (window.electronAPI.episodeProduction as any).aiUsageStats(projectId)
    usageRows.value = r?.success ? (r.data ?? []) : []
  } catch {
    usageRows.value = []
  } finally {
    usageLoading.value = false
  }
}

function formatMs(ms: number): string {
  if (!ms) return '0s'
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s}s`
}

/** 工作区组件：按 tab 切换（剧本/资产 tab 的组件内部自管左导航+中央工作区） */
const centerPanel = computed(() => {
  switch (activeTab.value) {
    case 'script': return StageScriptView
    case 'asset': return StageAssetView
    case 'storyboard': return StageStoryboardTab
    case 'compose': return StageComposeTab
    default: return PlaceholderTab
  }
})

/**
 * agent 会话域（2026-10-15）：每个界面独立会话与历史。
 * 资产页按选中类别（角色/地点/物品）再分域——用户视角里它们是不同界面；
 * 未选中任何资产时退化为整页域 asset。
 */
const agentScope = computed<string>(() => {
  switch (activeTab.value) {
    case 'asset': {
      const kind = ctx.selectedAsset.value?.kind
      return kind ? `asset-${kind}` : 'asset'
    }
    case 'script':
    case 'storyboard':
    case 'compose':
      return activeTab.value
    default:
      return activeTab.value
  }
})

/** 资产页选中回传：同步进 studio 上下文（contextHint 显示真实选中 + agent 域跟随类别）。
 *  同 kind+id 去重——防止 StageAssetView 回传 → external-asset prop 变化 → 再回传的回环。 */
function onAssetSelected(asset: { kind: 'character' | 'location' | 'item'; id: string; name: string } | null): void {
  if (!asset?.id) return
  const cur = ctx.selectedAsset.value
  if (cur?.kind === asset.kind && cur.id === asset.id) return
  ctx.setAsset({ kind: asset.kind, id: asset.id, name: asset.name })
}

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
  // S-01：每次 tab 切换刷新就绪状态（状态点 + 提示条）
  void loadReadiness()
}

async function onEpisodeChange(): Promise<void> {
  ctx.setEpisode(episodeId.value)
  router.replace(`/episode-production/${projectId}/studio/${episodeId.value}`)
  await Promise.all([loadEpisode(), loadReadiness()])
}

function onAgentDataChanged(_sections: string[]): void {
  agentTick.value++
  void loadEpisode()
  void loadReadiness()
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
  void loadReadiness()
}

watch(() => episodeId.value, () => { void loadEpisode(); void loadReadiness() })

onMounted(async () => {
  await Promise.all([
    projectStore.loadProject(projectId),
    loadAllLwProjects(),
    loadProviderConfigs(),
  ])
  await loadEpisodes()
  if (!episodeId.value && episodes.value.length > 0 && episodes.value[0]?.id) {
    episodeId.value = episodes.value[0].id
    ctx.setEpisode(episodeId.value)
  }
  await Promise.all([loadEpisode(), loadReadiness()])
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
  .header-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .tab-nav {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 0 6px;
    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
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
      .tab-dot {
        width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
        background: var(--text-color-placeholder); // 未就绪/未加载 = 灰
        &.ready { background: var(--color-success); } // 就绪 = 绿
      }
    }
  }
}

.readiness-bar {
  flex-shrink: 0;
  margin: 10px 16px 0;
  .rb-title { font-weight: 600; margin-right: 8px; }
  .rb-missing { margin-right: 8px; }
  .rb-suggestion { color: var(--text-color-secondary); }
}

.panel-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.usage-loading {
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary);
}

.usage-ref {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color-lighter);
  font-size: 12px;
  color: var(--text-color-placeholder);
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
