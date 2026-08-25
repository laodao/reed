<template>
  <div class="stage-sb-editor">
    <!-- 顶部工具条 -->
    <div class="edit-toolbar">
      <div class="tb-left">
        <span v-if="currentScene" class="tb-title">场次 {{ currentScene.sceneNumber }}：{{ currentScene.location }}</span>
        <el-tag size="small" round effect="plain" type="info">{{ shots.length }} 镜</el-tag>
      </div>
      <div class="tb-right">
        <span class="tb-label">画面风格</span>
        <el-select v-model="styleName" size="small" placeholder="画面风格" class="style-select">
          <el-option v-for="s in stylePresets" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </div>
    </div>

    <!-- 主体：左资产图集选择器 + 中左 SHT 列表 + 中央编辑器 -->
    <div class="edit-body">
      <!-- 左：资产图集（点击看所有图，拖图到提示词框 @ 引用） -->
      <aside class="edit-assets">
        <AssetGalleryPicker :project-id="projectId" />
      </aside>

      <aside class="edit-left">
        <div class="shot-list">
          <div
            v-for="shot in shots"
            :key="shot.id"
            class="shot-item"
            :class="{ active: selectedShot?.id === shot.id }"
            @click="selectShot(shot)"
          >
            <div class="shot-thumb">
              <el-image v-if="frameUrl(shot)" :src="frameUrl(shot)" fit="cover" class="thumb-img" />
              <div v-else class="thumb-empty"><el-icon :size="16"><Picture /></el-icon><span>待生成</span></div>
            </div>
            <div class="shot-meta">
              <span class="shot-no">SHT-{{ pad(shot.shotNumber) }}</span>
              <span class="shot-dur">{{ durationLabel(shot.duration) }}</span>
            </div>
          </div>
        </div>
      </aside>

      <main class="edit-center">
        <template v-if="selectedShot">
          <!-- 预览区 -->
          <div class="preview-area">
            <el-image v-if="frameUrl(selectedShot)" :src="frameUrl(selectedShot)" fit="contain" class="preview-img" />
            <div v-else class="preview-empty">
              <el-icon :size="40"><Picture /></el-icon>
              <span class="pe-text">编辑提示词 + 生成</span>
            </div>
            <div v-if="generating" class="gen-overlay"><el-icon class="is-loading" :size="28"><Loading /></el-icon></div>
          </div>

          <!-- 提示词富文本（一个整体框：一行一个镜头，参数为行内可点徽章） -->
          <ShotPromptEditor
            v-model:rows="editorRows"
            :entities="mentionEntities"
            :style-options="styleOptions"
            @update:rows="dirty = true"
          />

          <!-- 操作 -->
          <div class="edit-actions">
            <el-button type="primary" :loading="generating" @click="onGenerate">
              <el-icon><MagicStick /></el-icon>
              生成图像
            </el-button>
            <el-button :disabled="!dirty" @click="onSave">保存</el-button>
          </div>
        </template>

        <div v-else class="no-shot">
          <el-empty description="左侧选择分镜" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M5 分镜制作页（tab 宿主内的完整左+中央工作区，参照项目分镜制作页.png）。
 * 左：SHT 分镜列表（选中态）；中：大预览 + 片段提示词富文本 + 生成图像。
 *
 * 数据模型：编辑单位 = 视频片段（一段待生成视频，含多个镜头）。底部提示词框为
 * 一个整体富文本，一行 = 一个镜头，每个镜头的 景别/运镜/时长/风格 取分镜字段
 * （shotType/cameraMovement/duration + 页面级 style），描述取 frameDescription。
 * 保存逐镜写回 storyboard。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Picture, Loading } from '@element-plus/icons-vue'
import AssetGalleryPicker from '@/components/episode-production/storyboard/AssetGalleryPicker.vue'
import ShotPromptEditor, {
  type ShotPromptRow,
  type MentionEntity,
  type ParamOption,
} from '@/components/episode-production/storyboard/ShotPromptEditor.vue'
import { toImageUrl } from '@/utils/asset-url'

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()

const scenes = ref<any[]>([])
const shots = ref<any[]>([])
const selectedShot = ref<any>(null)
const editorRows = ref<ShotPromptRow[]>([])
const generating = ref(false)
const dirty = ref(false)
const styleName = ref('cinematic')
const stylePresets = ref<Array<{ id: string; name: string }>>([])
const mentionEntities = ref<MentionEntity[]>([])

const styleOptions = computed<ParamOption[]>(() =>
  stylePresets.value.map((p) => ({ value: p.id, label: p.name })),
)

const currentScene = computed(() => scenes.value.find(s => s.id === selectedShot.value?.sceneScriptId) || null)

function pad(n?: number): string {
  return String(n || 0).padStart(2, '0')
}
function durationLabel(d?: number): string {
  return `00:${String(Math.min(99, d || 0)).padStart(2, '0')}`
}
function frameUrl(sb: any): string | null {
  const img = sb.frameImage
  const p = img?.filePath || img?.url || (sb as any).frameImagePath
  return p ? toImageUrl(p) : null
}

async function load(): Promise<void> {
  if (!props.episodeId) { scenes.value = []; shots.value = []; editorRows.value = []; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  if (!ep.success || !ep.data?.scriptId) { scenes.value = []; shots.value = []; editorRows.value = []; return }

  const scResp = await window.electronAPI.episodeProduction.listScenes(ep.data.scriptId)
  scenes.value = scResp.success ? (scResp.data || []) : []
  // 找第一个有分镜的场景
  for (const sc of scenes.value) {
    const sbResp = await window.electronAPI.episodeProduction.listStoryboards(sc.id)
    if (sbResp.success && sbResp.data?.length) {
      shots.value = sbResp.data
      selectShot(shots.value[0])
      syncRows()
      return
    }
  }
  shots.value = []
  selectedShot.value = null
  editorRows.value = []
}

function selectShot(shot: any): void {
  selectedShot.value = shot
}

/** 由 shots 构建编辑器 rows（一行一个镜头） */
function syncRows(): void {
  editorRows.value = shots.value.map((sb) => ({
    id: sb.id,
    shotNumber: sb.shotNumber || 0,
    shotType: sb.shotType || 'medium',
    cameraMovement: sb.cameraMovement || 'static',
    duration: Number(sb.duration) || 4,
    style: styleName.value,
    description: sb.frameDescription || '',
  }))
}

async function onGenerate(): Promise<void> {
  if (!selectedShot.value || generating.value) return
  generating.value = true
  try {
    // 先保存字段，再生成图像
    await doSave()
    const r = await window.electronAPI.episodeProduction.generateStoryboardImage(
      selectedShot.value.id,
      styleName.value,
    )
    if (r.success) {
      ElMessage.success('图像已生成')
      await reloadShot(selectedShot.value.id)
    } else {
      ElMessage.error(r.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

async function onSave(): Promise<void> {
  await doSave()
}

/** 逐镜写回：把编辑器 rows 里已变更的字段写回各自 storyboard */
async function doSave(): Promise<void> {
  if (!editorRows.value.length) return
  let saved = 0
  let failed = 0
  for (const row of editorRows.value) {
    const sb = shots.value.find((s) => s.id === row.id)
    if (!sb) continue
    const patch: Record<string, unknown> = {
      shotType: row.shotType,
      cameraMovement: row.cameraMovement,
      duration: row.duration,
      frameDescription: row.description,
    }
    const r = await window.electronAPI.episodeProduction.updateStoryboard(row.id, patch)
    if (r.success) {
      saved++
      const idx = shots.value.findIndex((s) => s.id === row.id)
      if (idx !== -1) shots.value[idx] = { ...shots.value[idx], ...patch }
    } else {
      failed++
    }
  }
  if (failed > 0) {
    ElMessage.error(`保存失败 ${failed} 处`)
  } else if (saved > 0) {
    ElMessage.success(`已保存 ${saved} 个镜头`)
    dirty.value = false
  }
}

async function reloadShot(shotId: string): Promise<void> {
  const r = await window.electronAPI.episodeProduction.getStoryboard(shotId)
  if (r.success) {
    const idx = shots.value.findIndex(s => s.id === shotId)
    if (idx !== -1) shots.value[idx] = r.data
    selectedShot.value = r.data
  }
}

watch(() => props.episodeId, () => void load())
watch(styleName, () => {
  // 页面级风格变化 → 同步每行风格 token
  if (!editorRows.value.length) return
  editorRows.value = editorRows.value.map((r) => ({ ...r, style: styleName.value }))
  dirty.value = true
})
onMounted(async () => {
  const sp = await window.electronAPI.episodeProduction.getStylePresets()
  if (sp.success && sp.data?.length) stylePresets.value = sp.data
  await loadMentionEntities()
  void load()
})

async function loadMentionEntities(): Promise<void> {
  if (!props.projectId) { mentionEntities.value = []; return }
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const r = await root.projectSummary(props.projectId)
    if (r?.success && r.data) {
      const build = (list: any[], kind: 'character' | 'location' | 'item'): MentionEntity[] =>
        (list || []).map((a: any) => ({ id: a.bindingId || a.id, name: a.name, kind }))
      mentionEntities.value = [
        ...build(r.data.characters || [], 'character'),
        ...build(r.data.locations || [], 'location'),
        ...build(r.data.items || [], 'item'),
      ]
    }
  } catch (e: any) {
    console.error('[StageStoryboardEditor] 加载资产失败', e)
  }
}
</script>

<style lang="scss" scoped>
.stage-sb-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.edit-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  .tb-left { display: flex; align-items: center; gap: 8px; }
  .tb-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
  .tb-right { display: flex; align-items: center; gap: 8px; }
  .tb-label { font-size: 12px; color: var(--text-color-secondary); }
  .style-select { width: 140px; }
}

.edit-body { flex: 1; min-height: 0; display: flex; }
.edit-assets {
  width: 300px; flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color); min-height: 0;
  overflow: hidden;
}
.edit-left {
  width: 200px; flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color); min-height: 0;
  overflow-y: auto; padding: 8px;
}
.shot-list { display: flex; flex-direction: column; gap: 8px; }
.shot-item {
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover { border-color: var(--color-primary); }
  &.active { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light-9); }
  .shot-thumb {
    height: 80px; background: var(--fill-color-lighter);
    display: flex; align-items: center; justify-content: center;
    .thumb-img { width: 100%; height: 100%; object-fit: cover; }
    .thumb-empty { display: flex; flex-direction: column; align-items: center; gap: 3px; color: var(--text-color-placeholder); font-size: 10px; }
  }
  .shot-meta { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; }
  .shot-no { font-size: 12px; font-weight: 600; color: var(--text-color-primary); }
  .shot-dur { font-size: 11px; color: var(--text-color-placeholder); }
}

.edit-center { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 16px 20px; }
.preview-area {
  position: relative;
  flex: 1; min-height: 0;
  background: #111;
  border-radius: var(--radius-lg);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  .preview-img { max-width: 100%; max-height: 100%; }
  .preview-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-color-placeholder); .pe-text { font-size: 13px; } }
  .gen-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 26px; }
}

.edit-actions { display: flex; gap: 8px; margin-top: 12px; }
.no-shot { flex: 1; display: flex; align-items: center; justify-content: center; }
</style>
