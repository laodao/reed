<template>
  <div class="panorama-snapshot-editor">
    <div class="header">
      <span class="title">📷 视角截图器</span>
      <el-tag size="small">panorama: {{ panorama.label ?? panorama.id }}</el-tag>
    </div>

    <PanoramaViewer
      ref="viewerRef"
      :image-path="panorama.imagePath"
      :height="400"
      @viewpoint-change="onViewpointChange"
    />

    <div class="viewpoint-bar">
      <span class="vp-display">
        yaw: <strong>{{ vp.yaw }}°</strong>
        · pitch: <strong>{{ vp.pitch }}°</strong>
        · fov: <strong>{{ vp.fov }}°</strong>
      </span>
      <el-button type="primary" :loading="capturing" @click="onCapture">
        📷 保存视角截图
      </el-button>
    </div>

    <div v-if="snapshots.length" class="snapshot-list">
      <div class="list-title">
        已截图（{{ snapshots.length }}）
        <span class="list-hint">— 在 ④ 分镜 stage 配镜头时绑定为背景 ref（spec §4.5.10）</span>
      </div>
      <div class="snapshot-grid">
        <div
          v-for="s in snapshots"
          :key="s.id"
          class="snapshot-cell"
          @click="onClickSnapshot(s)"
        >
          <img :src="toImageUrl(s.imagePath)" alt="snapshot" />
          <div class="vp-label">
            yaw{{ getMeta(s).yaw ?? '?' }}° · pitch{{ getMeta(s).pitch ?? '?' }}° · fov{{ getMeta(s).fov ?? '?' }}°
          </div>
          <el-button text size="small" class="del-btn" @click.stop="onDelete(s.id)">删</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 全景视角截图编辑器（P3c Task 7）
 * @module renderer/components/episode-production/stage-asset/location/PanoramaSnapshotEditor
 * @description 围绕单张 360 全景图（panorama）提供视角截图能力：
 *   - 嵌入 PanoramaViewer 渲染该全景；
 *   - 用户拖拽 / 缩放调整视角后，点击「截图作分镜背景」把当前视口保存为 snapshot；
 *   - 已截图列表展示，支持删除；
 *   - snapshot 的视角元数据通过 metadata 字段（json）回写。
 */
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PanoramaViewer from '@/components/episode-production/shared/PanoramaViewer.vue'
import { toImageUrl } from '@/utils/asset-url'

interface PanoramaSnapshotMeta {
  yaw?: number
  pitch?: number
  fov?: number
  sourcePanoramaImageId?: string
  [key: string]: unknown
}

interface PanoramaSnapshotRow {
  id: string
  imagePath: string
  metadata?: string | PanoramaSnapshotMeta | null
  [key: string]: unknown
}

const props = defineProps<{
  panorama: { id: string; imagePath: string; label?: string | null }
  locationBindingId: string
}>()

const emit = defineEmits<{
  'snapshot-created': [snapshot: PanoramaSnapshotRow]
}>()

const viewerRef = ref<InstanceType<typeof PanoramaViewer> | null>(null)
const vp = ref<{ yaw: number; pitch: number; fov: number }>({ yaw: 0, pitch: 0, fov: 70 })
const snapshots = ref<PanoramaSnapshotRow[]>([])
const capturing = ref(false)

function getApi() {
  return (window as unknown as {
    electronAPI?: {
      episodeProduction?: { asset?: { panorama?: any } }
    }
  }).electronAPI?.episodeProduction?.asset?.panorama
}

function getMeta(s: PanoramaSnapshotRow): PanoramaSnapshotMeta {
  try {
    if (!s.metadata) return {}
    if (typeof s.metadata === 'string') {
      return JSON.parse(s.metadata) as PanoramaSnapshotMeta
    }
    return s.metadata as PanoramaSnapshotMeta
  } catch {
    return {}
  }
}

async function loadSnapshots() {
  const api = getApi()
  if (!api) return
  if (!props.locationBindingId) return
  try {
    const resp = await api.listSnapshots(props.locationBindingId)
    if (resp?.success && Array.isArray(resp.data)) {
      // 仅保留来自当前 panorama 的 snapshot
      snapshots.value = (resp.data as PanoramaSnapshotRow[]).filter((s) => {
        const meta = getMeta(s)
        return meta.sourcePanoramaImageId === props.panorama.id
      })
    } else {
      snapshots.value = []
    }
  } catch (err: any) {
    console.error('[PanoramaSnapshotEditor] loadSnapshots 失败', err)
    snapshots.value = []
  }
}

function onViewpointChange(viewpoint: { yaw: number; pitch: number; fov: number }) {
  vp.value = viewpoint
}

async function onCapture() {
  if (!viewerRef.value) return
  capturing.value = true
  try {
    const base64 = await viewerRef.value.captureCanvas()
    const api = getApi()
    if (!api) throw new Error('panorama API 未暴露')
    const resp = await api.createSnapshot({
      locationBindingId: props.locationBindingId,
      sourcePanoramaImageId: props.panorama.id,
      viewpoint: vp.value,
      base64Image: base64,
    })
    if (resp?.success && resp.data) {
      snapshots.value.push(resp.data as PanoramaSnapshotRow)
      ElMessage.success('截图已保存')
      emit('snapshot-created', resp.data as PanoramaSnapshotRow)
    } else {
      ElMessage.error(resp?.error || '截图保存失败')
    }
  } catch (err: any) {
    ElMessage.error('截图失败: ' + (err?.message ?? '未知错误'))
  } finally {
    capturing.value = false
  }
}

async function onDelete(id: string) {
  const api = getApi()
  if (!api) return
  try {
    const resp = await api.deleteSnapshot(id)
    if (resp?.success) {
      snapshots.value = snapshots.value.filter((s) => s.id !== id)
      ElMessage.success('已删除')
    } else {
      ElMessage.error(resp?.error || '删除失败')
    }
  } catch (err: any) {
    ElMessage.error('删除失败: ' + (err?.message ?? '未知错误'))
  }
}

function onClickSnapshot(_s: PanoramaSnapshotRow) {
  // 后续可扩展：点击截图把 viewer 跳回该视角（setPosition + zoom），本 task 暂不实现
}

onMounted(loadSnapshots)
watch(() => props.panorama.id, loadSnapshots)
watch(() => props.locationBindingId, loadSnapshots)
</script>

<style scoped>
.panorama-snapshot-editor {
  background-color: var(--el-bg-color);
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.viewpoint-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  color: var(--el-text-color-regular);
  font-family: monospace;
  font-size: 13px;
}

.vp-display strong {
  color: var(--el-color-primary);
}

.snapshot-list {
  margin-top: 8px;
}

.list-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 4px 0 8px;
}

.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.snapshot-cell {
  position: relative;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--el-fill-color-light);
}

.snapshot-cell:hover {
  border-color: var(--el-color-primary);
}

.snapshot-cell img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
}

/*
 * vp-label：mask-color 上的视角标签需要高对比度白色文字（视频字幕场景，强约束）。
 * 优先用 var(--el-color-white)，fallback 到 #fff。
 */
.vp-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--el-mask-color);
  color: var(--el-color-white, #fff);
  padding: 2px 4px;
  font-size: 10px;
  font-family: monospace;
}

.del-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background-color: var(--el-bg-color);
}
</style>
