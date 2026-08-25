<template>
  <div class="stage-storyboard">
    <!-- 工具条 -->
    <div class="sb-toolbar">
      <div class="tb-left">
        <span class="tb-title">分镜</span>
        <el-tag v-if="totalStoryboards" size="small" round effect="plain" type="info">共 {{ totalStoryboards }} 镜</el-tag>
      </div>
      <div class="tb-right">
        <el-button text size="small" :disabled="scenes.length === 0" :loading="generating" @click="onGenerateAll">
          <el-icon><MagicStick /></el-icon>
          批量生成分镜
        </el-button>
      </div>
    </div>

    <!-- 主体：左场次导航 + 中央分镜组 -->
    <div class="sb-body">
      <aside class="sb-left">
        <SceneNav :scenes="scenes" :selected-scene-id="null" @select="onSelectScene" />
      </aside>
      <main class="sb-center">
        <!-- 空态：无场景 -->
        <div v-if="scenes.length === 0" class="no-scenes">
          <el-empty description="请先在「剧本」页拆分场景" />
        </div>

        <!-- 按场次分组 -->
        <div v-else class="sb-scenes">
          <div v-for="sc in scenes" :key="sc.id" class="sb-scene-group" :data-scene="sc.id">
            <div class="group-head" @click="onEnterScene(sc)">
              <span class="group-title">场次 {{ sc.sceneNumber }}：{{ sc.location }}</span>
              <span class="group-actions">
                <span v-if="storyboards[sc.id]?.length" class="done-mark">制作中</span>
                <span class="enter-link">进入制作 →</span>
              </span>
            </div>
            <div class="group-shots">
              <div v-for="sb in (storyboards[sc.id] || [])" :key="sb.id" class="shot-tile" @click="onEnterScene(sc)">
                <div class="tile-preview">
                  <el-image v-if="frameUrl(sb)" :src="frameUrl(sb)" fit="cover" class="tile-img" />
                  <div v-else class="tile-empty"><el-icon :size="18"><Picture /></el-icon><span>待生成</span></div>
                </div>
                <div class="tile-meta">
                  <span class="tile-no">SHT-{{ String(sb.shotNumber).padStart(2, '0') }}</span>
                  <span class="tile-dur">{{ durationLabel(sb.duration) }}</span>
                </div>
              </div>
              <!-- 无分镜时占位 -->
              <div v-if="!(storyboards[sc.id] || []).length" class="shot-tile empty-tile" @click="onEnterScene(sc)">
                <div class="tile-empty"><el-icon :size="18"><Plus /></el-icon><span>进入制作</span></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M4 分镜列表页（tab 宿主内的完整左+中央工作区，参照项目分镜列表页.png）。
 * 左：场次导航；中央：按场次分组的分镜格（SHT 卡 + 时间码 + 待生成/已生成）。
 * 数据：getEpisode → scriptId → listScenes → listStoryboards(sceneId)。批量生成走 generateStoryboards。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Picture, Plus } from '@element-plus/icons-vue'
import SceneNav from '@/components/episode-production/script/SceneNav.vue'
import { toImageUrl } from '@/utils/asset-url'

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()
const emit = defineEmits<{ 'enter-scene': [sceneId: string] }>()

const script = ref<any>(null)
const scenes = ref<any[]>([])
const storyboards = ref<Record<string, any[]>>({})
const generating = ref(false)

const totalStoryboards = computed(() =>
  Object.values(storyboards.value).reduce((acc, arr) => acc + (arr?.length || 0), 0),
)

async function load(): Promise<void> {
  if (!props.episodeId) { script.value = null; scenes.value = []; storyboards.value = {}; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  if (!ep.success || !ep.data?.scriptId) { script.value = null; scenes.value = []; storyboards.value = {}; return }
  script.value = ep.data

  const scResp = await window.electronAPI.episodeProduction.listScenes(ep.data.scriptId)
  if (!scResp.success) { scenes.value = []; return }
  scenes.value = scResp.data || []
  await Promise.all(scenes.value.map(s => loadStoryboards(s.id)))
}

async function loadStoryboards(sceneId: string): Promise<void> {
  const r = await window.electronAPI.episodeProduction.listStoryboards(sceneId)
  storyboards.value[sceneId] = r.success ? (r.data || []) : []
}

/** 场景导航点击 → 突出显示该场（滚动到分组），不做跳转 */
function onSelectScene(sc: any): void {
  const el = document.querySelector(`[data-scene="${sc.id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** 点击场次 → 进入该场分镜制作 */
function onEnterScene(sc: any): void {
  emit('enter-scene', sc.id)
}

async function onGenerateAll(): Promise<void> {
  if (!script.value?.id || generating.value) return
  generating.value = true
  try {
    const r = await window.electronAPI.episodeProduction.generateStoryboards(script.value.id)
    if (r.success) {
      ElMessage.success('分镜已批量生成')
      await Promise.all(scenes.value.map(s => loadStoryboards(s.id)))
    } else {
      ElMessage.error(r.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

function frameUrl(sb: any): string | null {
  const img = sb.frameImage
  const p = img?.filePath || img?.url || (sb as any).frameImagePath
  return p ? toImageUrl(p) : null
}

function durationLabel(d?: number): string {
  const s = d || 0
  return `00:${String(Math.min(99, s)).padStart(2, '0')}`
}

watch(() => props.episodeId, () => void load())
onMounted(() => void load())
</script>

<style lang="scss" scoped>
.stage-storyboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.sb-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  .tb-left { display: flex; align-items: center; gap: 8px; }
  .tb-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
  .tb-right { display: flex; align-items: center; gap: 4px; }
}

.sb-body { flex: 1; min-height: 0; display: flex; }
.sb-left {
  width: 250px; flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color); min-height: 0;
}
.sb-center { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 20px 24px; }

.no-scenes { height: 100%; display: flex; align-items: center; justify-content: center; }

.sb-scenes { display: flex; flex-direction: column; gap: 22px; max-width: 900px; }
.sb-scene-group { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: var(--radius-lg); padding: 16px 18px; }
.group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.group-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
.done-mark { font-size: 12px; color: var(--color-danger); }

.group-shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
.shot-tile {
  background: var(--bg-color-page);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover { border-color: var(--color-primary); box-shadow: var(--shadow-card-hover); }
  .tile-preview {
    height: 90px; background: var(--fill-color-lighter);
    display: flex; align-items: center; justify-content: center;
    .tile-img { width: 100%; height: 100%; object-fit: cover; }
    .tile-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--text-color-placeholder); font-size: 11px; }
  }
  .tile-meta { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; }
  .tile-no { font-size: 12px; font-weight: 600; color: var(--text-color-primary); }
  .tile-dur { font-size: 11px; color: var(--text-color-placeholder); }
  &.empty-tile .tile-preview { height: 110px; }
}
</style>
