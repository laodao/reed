<template>
  <!--
    KeyframeGrid · 多关键帧网格展示（spec §4.2 + P5-T18）

    - 按 frame_index 升序展示 N 张关键帧
    - 每帧 hover 显示操作：重生成、查看大图
    - 右上角 frameRole 标签（start / middle / end / extra）
    - 点击重生成 → 触发 emit('regenerate-request', { keyframeId, frameIndex }) 让父组件
      拉 plan-keyframe-regen + 弹 RegenerateDialog 选传播范围
    - 整体生成按钮（首次）/ 全部重新生成（已有时）→ emit('generate-all', storyboardId)
  -->
  <div class="keyframe-grid">
    <div class="grid-header">
      <h4>
        关键帧
        <span class="count" v-if="keyframes.length > 0">
          ({{ keyframes.length }} 张)
        </span>
      </h4>
      <div class="header-actions">
        <el-button
          v-if="keyframes.length === 0"
          type="primary"
          size="small"
          :loading="generating"
          :disabled="!storyboardId"
          @click="onGenerateAll"
        >
          <el-icon><MagicStick /></el-icon>
          生成关键帧
        </el-button>
        <el-button
          v-else
          size="small"
          :loading="generating"
          @click="onGenerateAll"
        >
          <el-icon><Refresh /></el-icon>
          全部重新生成
        </el-button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      加载中...
    </div>

    <div v-else-if="keyframes.length === 0" class="empty-state">
      <el-empty description="尚未生成关键帧" :image-size="80" />
    </div>

    <div v-else class="grid-body">
      <template v-for="(kf, idx) in sortedKeyframes" :key="kf.id">
      <div
        class="keyframe-cell"
        :class="`role-${kf.frameRole}`"
      >
        <div class="cell-frame">
          <img
            v-if="kf.imagePath"
            :src="toImageUrl(kf.imagePath)"
            :alt="`关键帧 ${kf.frameIndex}`"
          />
          <el-empty v-else description="无图" :image-size="40" />

          <div class="cell-overlay">
            <el-button
              size="small"
              circle
              @click="onRegenerate(kf)"
              :title="'重生成此帧'"
            >
              <el-icon><Refresh /></el-icon>
            </el-button>
            <el-button
              v-if="kf.imagePath"
              size="small"
              circle
              @click="onPreview(kf)"
              :title="'查看大图'"
            >
              <el-icon><ZoomIn /></el-icon>
            </el-button>
          </div>
        </div>
        <div class="cell-info">
          <div class="info-row info-row-head" :class="`role-${kf.frameRole}`">
            <span class="info-idx">#{{ kf.frameIndex }}</span>
            <span class="info-role">{{ roleLabel(kf.frameRole) }}</span>
            <span class="info-percent">{{ Math.round(kf.timePercent * 100) }}%</span>
          </div>
          <div v-if="locationChip" class="info-row" :title="locationChip.tooltip">
            <el-icon class="info-icon"><Location /></el-icon>
            <span class="info-text">{{ locationChip.label }}</span>
          </div>
          <div
            v-for="c in characterChips"
            :key="c.id"
            class="info-row"
            :title="c.tooltip"
          >
            <el-icon class="info-icon"><User /></el-icon>
            <span class="info-text">
              {{ c.name }}
              <span v-if="c.expression" class="info-attr">· {{ c.expression }}</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 两帧之间插帧按钮（最后一帧后面不显示——末尾追加请改 keyframeCount） -->
      <button
        v-if="idx < sortedKeyframes.length - 1"
        class="insert-between-btn"
        :disabled="!!inserting"
        :title="'在第 ' + kf.frameIndex + ' 和 ' + sortedKeyframes[idx + 1].frameIndex + ' 帧之间插入一张'"
        @click="onInsertAfter(kf)"
      >
        <el-icon v-if="inserting === kf.id" class="is-loading"><Loading /></el-icon>
        <span v-else>＋</span>
      </button>
      </template>
    </div>

    <el-dialog
      v-model="previewVisible"
      :title="`关键帧 ${previewKeyframe?.frameIndex ?? ''}`"
      width="80%"
      destroy-on-close
    >
      <img
        v-if="previewKeyframe?.imagePath"
        :src="toImageUrl(previewKeyframe.imagePath)"
        style="width: 100%; height: auto"
      />
      <el-empty v-else description="该关键帧暂无图像" />
      <div v-if="previewKeyframe?.prompt" class="preview-prompt">
        <strong>Prompt：</strong>
        <pre>{{ previewKeyframe.prompt }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * KeyframeGrid（P5-T18）
 *
 * Props：
 *   - storyboardId：分镜 ID
 *   - keyframeCount：分镜配置的目标关键帧数（用于"全部重生成"提示用户）
 *
 * Emits：
 *   - regenerate-request({ keyframeId, frameIndex })：父组件应弹 RegenerateDialog
 *   - generate-all(storyboardId)：父组件触发整体生成（也可在本组件内直接调 IPC）
 *
 * 内部直接调 window.electronAPI.episodeProduction.{listKeyframes, generateKeyframes}
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Loading,
  Location,
  MagicStick,
  Refresh,
  User,
  ZoomIn,
} from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'
import { useEpAssetStore, useEpScriptStore } from '@/stores/episode-production'

interface Keyframe {
  id: string
  storyboardId: string
  frameIndex: number
  timePercent: number
  frameRole: 'start' | 'middle' | 'end' | 'extra'
  imageAssetId: string | null
  prompt?: string | null
  /** P7 修复：handler 已经返回 imagePath（直接 join image_assets） */
  imagePath?: string | null
}

const props = withDefaults(
  defineProps<{
    storyboardId: string | null
    keyframeCount?: number
  }>(),
  { keyframeCount: 3 },
)

const emit = defineEmits<{
  (e: 'regenerate-request', payload: { keyframeId: string; frameIndex: number }): void
  (e: 'generate-all', storyboardId: string): void
}>()

const keyframes = ref<Keyframe[]>([])
const loading = ref(false)
const generating = ref(false)
const previewVisible = ref(false)
const previewKeyframe = ref<Keyframe | null>(null)

// P5-T28 spec §4.5.7 资产组合可视化
const assetStore = useEpAssetStore()
const scriptStore = useEpScriptStore()
interface CharOverride {
  characterId: string
  expression?: string
  action?: string
  facing?: string
}
const sbCharOverrides = ref<CharOverride[]>([])

// 注：scriptStore.scenes 仅含场景级数据，无 storyboards 字段。
// storyboard → scene 映射要走 storyboardStore，但 KeyframeGrid 当前
// 不直接 inject storyboardStore；P6-T22 简化：currentScene 暂用 scenes[0]
// 兜底（用户从 ⑤ 制作 选分镜时通常只在一个场景内）。完整映射留 follow-up。
const currentScene = computed(() => {
  const scenes = scriptStore.scenes
  if (!Array.isArray(scenes) || scenes.length === 0) return null
  return scenes[0] as any
})

const characterChips = computed(() => {
  // 优先用分镜级 storyboard_characters；回退场景级 scene.characters
  const list: Array<{ id: string; name: string; expression: string; tooltip: string }> = []
  if (sbCharOverrides.value.length > 0) {
    for (const sc of sbCharOverrides.value) {
      const name = lookupCharName(sc.characterId)
      list.push({
        id: sc.characterId,
        name,
        expression: sc.expression ?? '',
        tooltip: `${name} · 分镜级配置${sc.expression ? ` · ${sc.expression}` : ''}${sc.action ? ` · ${sc.action}` : ''}`,
      })
    }
  } else {
    // scene 级
    const sceneChars = (currentScene.value?.characters ?? []) as any[]
    if (!Array.isArray(sceneChars)) return list
    for (const sc of sceneChars) {
      const id = sc.characterBindingId ?? sc.characterId ?? ''
      if (!id) continue
      const name = lookupCharName(id) || sc.characterName || sc.name || '?'
      list.push({
        id,
        name,
        expression: sc.expression ?? '',
        tooltip: `${name} · 场景级（spec §4.5.3 兜底）${sc.expression ? ` · ${sc.expression}` : ''}`,
      })
    }
  }
  return list
})

const locationChip = computed(() => {
  const scene = currentScene.value
  if (!scene?.location) return null
  return {
    label: scene.location,
    tooltip: `场景地点 ${scene.location}${scene.timeOfDay ? ' · ' + scene.timeOfDay : ''}${scene.weather ? ' · ' + scene.weather : ''}`,
  }
})

function lookupCharName(id: string): string {
  const cand = (assetStore.epAssetCharacters as any[]).find(
    (c) => (c.id ?? c.bindingId) === id,
  )
  return cand?.name ?? cand?.standaloneName ?? id.slice(0, 8)
}

async function loadStoryboardOverrides(): Promise<void> {
  if (!props.storyboardId) {
    sbCharOverrides.value = []
    return
  }
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listStoryboardCharacters) return
    const resp = await api.listStoryboardCharacters(props.storyboardId)
    if (resp?.success && Array.isArray(resp.data)) {
      sbCharOverrides.value = resp.data as CharOverride[]
    } else {
      sbCharOverrides.value = []
    }
  } catch {
    sbCharOverrides.value = []
  }
}

watch(() => props.storyboardId, () => loadStoryboardOverrides(), { immediate: true })

const sortedKeyframes = computed(() =>
  [...keyframes.value].sort((a, b) => a.frameIndex - b.frameIndex),
)

function roleLabel(role: string): string {
  return role === 'start'
    ? '开始'
    : role === 'end'
      ? '结束'
      : role === 'middle'
        ? '中间'
        : '附加'
}

function roleTagType(role: string): 'success' | 'warning' | 'info' | 'danger' | undefined {
  if (role === 'start') return 'success'
  if (role === 'end') return 'danger'
  if (role === 'middle') return 'warning'
  return 'info'
}

async function loadKeyframes(): Promise<void> {
  if (!props.storyboardId) return
  loading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listKeyframes) {
      throw new Error('IPC listKeyframes 未暴露')
    }
    const resp = await api.listKeyframes(props.storyboardId)
    if (!resp?.success) throw new Error(resp?.error || '加载关键帧失败')
    // P7 修复：handler 已经 join 了 image_assets 返回 imagePath 字段，无需再加工
    keyframes.value = (resp.data ?? []) as Keyframe[]
  } catch (e: any) {
    ElMessage.error(`加载关键帧失败：${e?.message ?? e}`)
    keyframes.value = []
  } finally {
    loading.value = false
  }
}

async function onGenerateAll(): Promise<void> {
  if (!props.storyboardId) return
  generating.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateKeyframes) {
      throw new Error('IPC generateKeyframes 未暴露')
    }
    const resp = await api.generateKeyframes(props.storyboardId, undefined, props.keyframeCount)
    if (!resp?.success) throw new Error(resp?.error || '生成失败')
    ElMessage.success(`已生成 ${resp.data?.length ?? 0} 张关键帧`)
    await loadKeyframes()
    emit('generate-all', props.storyboardId)
  } catch (e: any) {
    ElMessage.error(`生成关键帧失败：${e?.message ?? e}`)
  } finally {
    generating.value = false
  }
}

function onRegenerate(kf: Keyframe): void {
  emit('regenerate-request', { keyframeId: kf.id, frameIndex: kf.frameIndex })
}

function onPreview(kf: Keyframe): void {
  previewKeyframe.value = kf
  previewVisible.value = true
}

/** "+" 在两帧之间插入新帧（frameRole='extra'，timePercent 取中点） */
const inserting = ref<string | null>(null)
async function onInsertAfter(kf: Keyframe): Promise<void> {
  if (inserting.value) return
  inserting.value = kf.id
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.insertKeyframeBetween) {
      ElMessage.error('insertKeyframeBetween IPC 未暴露')
      return
    }
    const resp = await api.insertKeyframeBetween(kf.storyboardId, kf.id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '插入关键帧失败')
      return
    }
    ElMessage.success('已在该帧后插入新帧')
    await loadKeyframes()
  } catch (e: any) {
    ElMessage.error('插入失败：' + (e?.message ?? '未知错误'))
  } finally {
    inserting.value = null
  }
}

watch(
  () => props.storyboardId,
  () => loadKeyframes(),
)

onMounted(loadKeyframes)

defineExpose({ reload: loadKeyframes })
</script>

<style scoped>
.keyframe-grid {
  padding: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.grid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.grid-header h4 {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
  gap: 6px;
}

.empty-state {
  padding: 20px 0;
}

/* 用 flex+wrap 替代 grid，给每两帧之间插入按钮腾位 */
.grid-body {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
}

.keyframe-cell {
  flex: 1 1 160px;
  min-width: 160px;
  max-width: 240px;
}

.insert-between-btn {
  flex: 0 0 24px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  background: transparent;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.insert-between-btn:hover:not(:disabled) {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.insert-between-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.keyframe-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-frame {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

.cell-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cell-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.15s;
}

.cell-frame:hover .cell-overlay {
  opacity: 1;
}

/* 一律用 div+pill 样式，避免 el-tag 自带 padding/line-height 不齐导致视觉乱 */
.cell-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0 0;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  line-height: 18px;
  font-size: 11px;
  color: var(--el-text-color-regular);
  padding: 0 6px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.info-row-head {
  background: transparent;
  padding: 0 2px;
  height: 16px;
  line-height: 16px;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.info-idx {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.info-row-head.role-start .info-role {
  color: var(--el-color-success);
}

.info-row-head.role-end .info-role {
  color: var(--el-color-danger);
}

.info-row-head.role-middle .info-role {
  color: var(--el-color-warning);
}

.info-row-head.role-extra .info-role {
  color: var(--el-color-info);
}

.info-percent {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
  font-size: 10px;
}

.info-icon {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.info-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-attr {
  color: var(--el-color-warning);
}

.preview-prompt {
  margin-top: 8px;
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 12px;
}

.preview-prompt pre {
  margin: 4px 0 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
}
</style>
