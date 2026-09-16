<template>
  <div class="ep-agent-studio">
    <!-- ===== 顶部 header ===== -->
    <div class="studio-header">
      <div class="header-left">
        <el-button text @click="goBack"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
        <el-select
          v-model="episodeId"
          placeholder="选择剧集"
          size="default"
          class="episode-select"
          @change="onEpisodeChange"
        >
          <el-option
            v-for="ep in episodes"
            :key="ep.id"
            :label="`第 ${ep.episodeNumber} 集 · ${ep.title}`"
            :value="ep.id"
          />
        </el-select>
      </div>
      <div class="header-center">
        <el-tag v-if="currentEpisode" effect="plain" round :type="statusTagType(currentEpisode.status)">
          {{ statusLabel(currentEpisode.status) }}
        </el-tag>
      </div>
      <div class="header-right" />
    </div>

    <!-- ===== 主体三段式 ===== -->
    <div class="studio-body">
      <!-- 左侧：场景 / 资产 树 -->
      <aside class="left-panel">
        <div class="tabs">
          <button :class="{ active: activeLeftTab === 'scenes' }" @click="activeLeftTab = 'scenes'">场景</button>
          <button :class="{ active: activeLeftTab === 'assets' }" @click="activeLeftTab = 'assets'">资产</button>
        </div>

        <!-- 场景列表 -->
        <div v-if="activeLeftTab === 'scenes'" class="list">
          <div
            v-for="sc in scenes"
            :key="sc.id"
            class="list-item"
            :class="{ active: currentScene?.id === sc.id }"
            @click="selectScene(sc)"
          >
            <span class="idx">{{ sc.sceneNumber }}</span>
            <span class="name">{{ sc.location || '场景 ' + sc.sceneNumber }}</span>
            <el-tag v-if="(sbCount[sc.id] || 0) > 0" size="small" type="info" effect="plain">{{ sbCount[sc.id] }} 镜</el-tag>
          </div>
          <div v-if="scenes.length === 0" class="list-empty">暂无场景<br />可在右侧让助手拆分</div>
        </div>

        <!-- 资产列表 -->
        <div v-else class="list">
          <div class="group-title">角色 ({{ assets.characters.length }})</div>
          <div v-for="c in assets.characters" :key="c.id" class="list-item" @click="selectAsset('character', c)">
            <span class="name">{{ c.name || c.standaloneName }}</span>
          </div>
          <div class="group-title">地点 ({{ assets.locations.length }})</div>
          <div v-for="l in assets.locations" :key="l.id" class="list-item" @click="selectAsset('location', l)">
            <span class="name">{{ l.name || l.locationName }}</span>
          </div>
          <div class="group-title">物品 ({{ assets.items.length }})</div>
          <div v-for="i in assets.items" :key="i.id" class="list-item" @click="selectAsset('item', i)">
            <span class="name">{{ i.name || i.itemName }}</span>
          </div>
          <div v-if="assets.characters.length === 0 && assets.locations.length === 0 && assets.items.length === 0" class="list-empty">
            暂无资产<br />可在右侧让助手生成定妆图
          </div>
        </div>
      </aside>

      <!-- 中央主区：内容卡片 -->
      <main class="center-panel">
        <template v-if="activeTab === 'script'">
          <div class="center-header">
            <h2>剧本</h2>
            <div class="center-actions">
              <el-button size="small" :loading="working" @click="onGenerateScript">
                <el-icon><MagicStick /></el-icon> 生成剧本
              </el-button>
            </div>
          </div>

          <div v-if="!script" class="placeholder">
            <el-empty description="还没有剧本。点击「生成剧本」或让右侧助手帮你生成" />
          </div>
          <template v-else>
            <div class="script-card">
              <div class="card-title">剧情梗概</div>
              <p class="synopsis">{{ script.synopsis || '（无梗概）' }}</p>
            </div>
            <div v-if="script.scriptContent" class="script-card">
              <div class="card-title">剧本正文</div>
              <pre class="script-content">{{ script.scriptContent }}</pre>
            </div>
            <div class="section-title">场景 <el-tag size="small" type="info" round>{{ scenes.length }} 场</el-tag></div>
            <div class="scene-grid">
              <div v-for="sc in scenes" :key="sc.id" class="scene-card" @click="selectScene(sc)">
                <div class="scene-head"><span class="scene-no">S{{ sc.sceneNumber }}</span><span class="scene-loc">{{ sc.location }}</span></div>
                <p class="scene-desc">{{ sc.sceneDescription || '（无描述）' }}</p>
              </div>
            </div>
          </template>
        </template>

        <template v-else-if="activeTab === 'storyboard'">
          <div class="center-header">
            <h2>分镜</h2>
            <div class="center-actions">
              <el-button size="small" :loading="working" @click="onGenerateStoryboards">
                <el-icon><MagicStick /></el-icon> 批量生成分镜
              </el-button>
            </div>
          </div>
          <div v-if="scenes.length === 0" class="placeholder"><el-empty description="请先拆分场景" /></div>
          <template v-else>
            <div v-for="sc in scenes" :key="sc.id" class="sb-scene">
              <div class="sb-scene-title">场次 {{ sc.sceneNumber }} · {{ sc.location }}</div>
              <div class="sb-grid">
                <div v-for="sb in (storyboards[sc.id] || [])" :key="sb.id" class="sb-card">
                  <div class="sb-no">SHT-{{ String(sb.shotNumber).padStart(2, '0') }}</div>
                  <div class="sb-type">{{ sb.shotType }}</div>
                  <div class="sb-meta">{{ sb.cameraAngle }} · {{ sb.cameraMovement }}</div>
                </div>
                <div v-if="(storyboards[sc.id] || []).length === 0" class="sb-card empty-sb">待生成</div>
              </div>
            </div>
          </template>
        </template>

        <template v-else>
          <div class="center-header"><h2>资产</h2></div>
          <div class="asset-grid">
            <div v-for="a in currentAssets" :key="a.id" class="asset-card">
              <div class="asset-thumb">
                <el-image v-if="a.coverUrl" :src="a.coverUrl" fit="cover" class="thumb-img" />
                <el-icon v-else class="thumb-placeholder"><Picture /></el-icon>
              </div>
              <div class="asset-name">{{ a.name }}</div>
              <div class="asset-type">{{ a.kindLabel }}</div>
            </div>
            <div v-if="currentAssets.length === 0" class="placeholder"><el-empty description="左侧选择资产，或让右侧助手生成定妆图" /></div>
          </div>
        </template>
      </main>

      <!-- 右侧：agent 助手面板 -->
      <aside class="right-panel" :class="{ collapsed: panelCollapsed }">
        <EpAgentPanel
          v-if="!panelCollapsed"
          :project-id="projectId"
          :episode-id="episodeId"
          @data-changed="onDataChanged"
          @toggle="panelCollapsed = true"
        />
        <button v-if="panelCollapsed" class="panel-expand" title="展开助手" @click="panelCollapsed = false">
          <el-icon><DArrowLeft /></el-icon>
        </button>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 剧集制作 · 全新简化版（agent 助手驱动）主视图。
 * 三段式：左侧场景/资产树 + 中央工作区 + 右侧 agent 助手面板。
 * 复用现有 episodeProduction IPC 与底层服务；复杂表单收敛在高级入口（后续阶段）。
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, MagicStick, Picture, DArrowLeft } from '@element-plus/icons-vue'
import EpAgentPanel from '@/components/episode-production/agent/EpAgentPanel.vue'

const route = useRoute()
const router = useRouter()

const projectId = (route.params.projectId as string) || ''
const episodeId = ref((route.params.episodeId as string) || '')
const currentEpisode = ref<any>(null)
const episodes = ref<any[]>([])
const loading = ref(false)
const working = ref(false)
const activeTab = ref<'script' | 'storyboard' | 'asset'>('script')
const activeLeftTab = ref<'scenes' | 'assets'>('scenes')
const panelCollapsed = ref(false)

const script = ref<any>(null)
const scenes = ref<any[]>([])
const currentScene = ref<any>(null)
const storyboards = reactive<Record<string, any[]>>({})
const assets = reactive<{ characters: any[]; locations: any[]; items: any[] }>({ characters: [], locations: [], items: [] })
const currentAssetKind = ref<'character' | 'location' | 'item'>('character')

const sbCount = computed(() => {
  const m: Record<string, number> = {}
  for (const [id, arr] of Object.entries(storyboards)) m[id] = (arr || []).length
  return m
})

const currentAssets = computed(() => {
  const list =
    currentAssetKind.value === 'character' ? assets.characters
      : currentAssetKind.value === 'location' ? assets.locations
        : assets.items
  return list.map(a => ({
    ...a,
    name: a.name || a.standaloneName || a.locationName || a.itemName || '(未命名)',
    coverUrl: a.mainImageUrl || null,
    kindLabel: currentAssetKind.value === 'character' ? '角色' : currentAssetKind.value === 'location' ? '地点' : '物品',
  }))
})

function statusLabel(s: string | null | undefined): string {
  const map: Record<string, string> = { pending: '内容', asset_prep: '资产', scripting: '剧本', storyboarding: '分镜', producing: '制作', composing: '合成', completed: '完成' }
  return map[s || ''] || (s || '未开始')
}
function statusTagType(s: string | null | undefined): 'warning' | 'success' | 'info' {
  if (s === 'completed') return 'success'
  return 'info'
}

function goBack(): void {
  router.push('/episode-production')
}

async function init(): Promise<void> {
  loading.value = true
  try {
    await loadEpisodes()
    if (episodeId.value) {
      await loadEpisode()
      await Promise.all([loadScript(), loadScenes(), loadAssets()])
    }
    // 若当前只剩一集且未选中，自动选首集
    if (!episodeId.value && episodes.value.length > 0 && episodes.value[0]?.id) {
      episodeId.value = episodes.value[0].id
      await onEpisodeChange()
    }
  } catch (e) {
    console.error('[EpAgentStudio] init 失败', e)
  } finally {
    loading.value = false
  }
}

async function loadEpisodes(): Promise<void> {
  const r = await window.electronAPI.episodeProduction.listEpisodes(projectId)
  if (r.success) episodes.value = r.data || []
}

async function onEpisodeChange(): Promise<void> {
  router.replace(`/episode-production/${projectId}/episode/${episodeId.value}`)
  await loadEpisode()
  await Promise.all([loadScript(), loadScenes(), loadAssets()])
}

async function loadEpisode(): Promise<void> {
  const r = await window.electronAPI.episodeProduction.getEpisode(episodeId.value)
  if (r.success) currentEpisode.value = r.data
}

async function loadScript(): Promise<void> {
  const ep = currentEpisode.value
  if (!ep?.scriptId) { script.value = null; scenes.value = []; return }
  const r = await window.electronAPI.episodeProduction.getScript(ep.scriptId)
  if (r.success) script.value = r.data
}

async function loadScenes(): Promise<void> {
  const ep = currentEpisode.value
  if (!ep?.scriptId) { scenes.value = []; Object.keys(storyboards).forEach(k => delete storyboards[k]); return }
  const r = await window.electronAPI.episodeProduction.listScenes(ep.scriptId)
  if (r.success) {
    scenes.value = r.data || []
    if (scenes.value.length > 0) {
      currentScene.value = scenes.value[0]
      await Promise.all(scenes.value.map(s => loadStoryboards(s.id)))
    }
  }
}

async function loadStoryboards(sceneId: string): Promise<void> {
  const r = await window.electronAPI.episodeProduction.listStoryboards(sceneId)
  if (r.success) storyboards[sceneId] = r.data || []
}

async function loadAssets(): Promise<void> {
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api) return
  const [cs, ls, is] = await Promise.all([
    api.character.list(projectId).catch(() => null),
    api.location.list(projectId).catch(() => null),
    api.item.list(projectId).catch(() => null),
  ])
  assets.characters = cs?.success ? cs.data : []
  assets.locations = ls?.success ? ls.data : []
  assets.items = is?.success ? is.data : []
}

function selectScene(sc: any): void {
  currentScene.value = sc
  activeTab.value = 'script'
}

async function onGenerateScript(): Promise<void> {
  if (working.value) return
  working.value = true
  try {
    const r = await window.electronAPI.episodeProduction.generateScript(episodeId.value)
    if (r.success) {
      await loadEpisode(); await loadScript(); await loadScenes()
      ElMessage.success('剧本已生成')
    } else {
      ElMessage.error(r.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    working.value = false
  }
}

async function onGenerateStoryboards(): Promise<void> {
  const ep = currentEpisode.value
  if (!ep?.scriptId || working.value) return
  working.value = true
  try {
    const r = await window.electronAPI.episodeProduction.generateStoryboards(ep.scriptId)
    if (r.success) {
      await loadScenes()
      ElMessage.success('分镜已生成')
      // H10：旧批量路径绑定缺失告警（Studio 分镜 tab 已改走 cogen，此处为仍用旧 IPC 的入口）
      const unbound: string[] = Array.isArray((r.data as any)?.unboundCharacters)
        ? (r.data as any).unboundCharacters
        : []
      const unboundCount = typeof (r.data as any)?.unboundCount === 'number' ? (r.data as any).unboundCount : 0
      if (unbound.length > 0) {
        ElMessage.warning(`⚠️ ${unbound.length} 个角色未绑定资产：${unbound.join('、')}，将影响画面一致性`)
      } else if (unboundCount > 0) {
        ElMessage.warning(`⚠️ ${unboundCount} 处分镜角色未绑定资产（无法反查角色名），将影响画面一致性`)
      }
    } else {
      ElMessage.error(r.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    working.value = false
  }
}

function onDataChanged(_sections: string[]): void {
  void loadEpisode().then(() => Promise.all([loadScript(), loadScenes(), loadAssets()]))
}

watch(() => [projectId, episodeId.value], () => {
  if (episodeId.value) void init()
})

onMounted(() => { void init() })
</script>

<style lang="scss" scoped>
.ep-agent-studio {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-color-page);
}

.studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  .header-left { display: flex; align-items: center; gap: 10px; }
  .episode-select { width: 260px; }
  .header-center { display: flex; align-items: center; gap: 8px; }
}

.studio-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

// 左侧
.left-panel {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color-lighter);
    button {
      flex: 1;
      padding: 9px 0;
      border: none;
      background: transparent;
      font-size: 13px;
      color: var(--text-color-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      &.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
    }
  }
  .list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }
  .list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-color-regular);
    &:hover { background: var(--fill-color-light); }
    &.active { background: var(--color-primary-light-9); color: var(--color-primary); }
    .idx { width: 20px; height: 20px; border-radius: 6px; background: var(--fill-color); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--text-color-secondary); flex-shrink: 0; }
    .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  .group-title { padding: 8px 10px 4px; font-size: 11px; color: var(--text-color-placeholder); }
  .list-empty { padding: 24px 12px; text-align: center; font-size: 12px; color: var(--text-color-placeholder); line-height: 1.7; }
}

// 中央
.center-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  .center-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--text-color-primary); }
  }
  .placeholder { padding: 60px 0; }
  .script-card { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; box-shadow: var(--shadow-sm); .card-title { font-size: 13px; font-weight: 600; color: var(--text-color-primary); margin-bottom: 8px; } .synopsis { margin: 0; font-size: 14px; line-height: 1.8; color: var(--text-color-regular); } }
  .script-content { margin: 0; font-size: 13px; line-height: 1.8; color: var(--text-color-regular); white-space: pre-wrap; font-family: inherit; }
  .section-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); margin: 20px 0 12px; display: flex; align-items: center; gap: 8px; }
  .scene-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .scene-card { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: 12px; padding: 14px; cursor: pointer; transition: all var(--transition-fast); &:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); } .scene-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; } .scene-no { font-size: 11px; font-weight: 700; color: var(--color-primary); background: var(--color-primary-light-9); padding: 2px 6px; border-radius: 6px; } .scene-loc { font-size: 13px; font-weight: 600; color: var(--text-color-primary); } .scene-desc { margin: 0; font-size: 12px; line-height: 1.7; color: var(--text-color-secondary); } }

  // 分镜
  .sb-scene { margin-bottom: 22px; .sb-scene-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); margin-bottom: 10px; } .sb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; } }
  .sb-card { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: 10px; padding: 10px; .sb-no { font-size: 12px; font-weight: 700; color: var(--color-primary); } .sb-type { font-size: 12px; color: var(--text-color-regular); margin-top: 4px; } .sb-meta { font-size: 11px; color: var(--text-color-placeholder); margin-top: 2px; } &.empty-sb { color: var(--text-color-placeholder); font-size: 12px; display: flex; align-items: center; justify-content: center; min-height: 60px; } }

  // 资产
  .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
  .asset-card { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: 12px; overflow: hidden; .asset-thumb { height: 160px; background: var(--fill-color-lighter); display: flex; align-items: center; justify-content: center; .thumb-img { width: 100%; height: 100%; object-fit: cover; } .thumb-placeholder { font-size: 32px; color: var(--text-color-placeholder); } } .asset-name { padding: 8px 10px 4px; font-size: 13px; font-weight: 600; color: var(--text-color-primary); } .asset-type { padding: 0 10px 10px; font-size: 11px; color: var(--text-color-placeholder); } }
}

// 右侧
.right-panel {
  position: relative;
  width: 360px;
  flex-shrink: 0;
  min-height: 0;
  transition: width var(--transition-normal);
  &.collapsed { width: 40px; background: var(--bg-color); border-left: 1px solid var(--border-color-lighter); }
  .panel-expand { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: var(--bg-color); border: 1px solid var(--border-color-light); border-radius: 8px; color: var(--text-color-secondary); cursor: pointer; padding: 6px 8px; &:hover { color: var(--color-primary); } }
  > :deep(.ep-agent-panel) { height: 100%; }
}
</style>
