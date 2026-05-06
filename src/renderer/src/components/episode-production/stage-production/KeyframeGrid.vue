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
      <div
        v-for="kf in sortedKeyframes"
        :key="kf.id"
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
        <div class="cell-meta">
          <el-tag
            size="small"
            :type="roleTagType(kf.frameRole)"
            class="role-tag"
          >
            #{{ kf.frameIndex }} · {{ roleLabel(kf.frameRole) }}
          </el-tag>
          <span class="time-percent">{{ Math.round(kf.timePercent * 100) }}%</span>
        </div>

        <!-- P5-T28 spec §4.5.7：资产组合 chip（角色 + 地点） -->
        <div v-if="characterChips.length > 0 || locationChip" class="cell-assets">
          <el-tag
            v-if="locationChip"
            size="small"
            type="warning"
            effect="plain"
            class="loc-chip"
            :title="locationChip.tooltip"
          >
            <el-icon><Location /></el-icon>
            {{ locationChip.label }}
          </el-tag>
          <el-tag
            v-for="c in characterChips"
            :key="c.id"
            size="small"
            type="info"
            effect="plain"
            class="char-chip"
            :title="c.tooltip"
          >
            <el-icon><User /></el-icon>
            {{ c.name }}
            <span v-if="c.expression" class="chip-expr">· {{ c.expression }}</span>
          </el-tag>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="previewVisible"
      :title="`关键帧 ${previewKeyframe?.frameIndex ?? ''}`"
      width="80%"
      destroy-on-close
    >
      <img
        v-if="previewKeyframe?._imagePath"
        :src="toImageUrl(previewKeyframe._imagePath)"
        style="width: 100%; height: auto"
      />
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
const currentSb = computed(() => {
  return scriptStore.scenes
    .flatMap((s: any) => s.storyboards ?? [])
    .find((sb: any) => sb.id === props.storyboardId)
})
const currentScene = computed(() => {
  if (!currentSb.value) return null
  return scriptStore.scenes.find((s: any) =>
    (s.storyboards ?? []).some((sb: any) => sb.id === currentSb.value.id),
  )
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

.grid-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
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

.cell-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  padding: 0 2px;
}

.cell-assets {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 2px 0;

  .el-tag {
    font-size: 10px;
    padding: 0 6px;
    height: 20px;
    line-height: 18px;

    .el-icon {
      font-size: 11px;
      margin-right: 2px;
    }

    .chip-expr {
      margin-left: 2px;
      color: var(--el-color-warning);
      font-weight: 500;
    }
  }

  .loc-chip {
    width: 100%;
    justify-content: flex-start;
  }
}

.time-percent {
  color: var(--el-text-color-secondary);
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
