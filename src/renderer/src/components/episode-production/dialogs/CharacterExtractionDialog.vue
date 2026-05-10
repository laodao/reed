<template>
  <!--
    CharacterExtractionDialog · 视频提取主体对话框
    （spec 2026-05-09 ep-redesign §3.2 E1 · Phase 5 · P-22）

    工作流：
      1. 用户输入参考视频路径 + 抽帧数（默认 4：正/侧前/侧后/背）
      2. 点「抽帧」→ ep:asset:character-extract:frames → 返回候选帧
      3. 候选帧网格展示，每帧支持 label 编辑（默认按时间分布建议）
      4. 用户多选要保留的帧 → 点「落到角色图谱」
      5. 对每张选中帧调 ep:asset:upload-image 落到 character_binding 的 view 类目
      6. 完成后 ep:asset:character-extract:cleanup 清 temp + emit reload
  -->
  <el-dialog
    v-model="visible"
    title="🎬 从视频提取主体"
    width="900px"
    :close-on-click-modal="false"
    @close="onDialogClose"
  >
    <div class="step-section">
      <header class="step-title">① 选择参考视频</header>
      <el-form label-width="80px" size="small">
        <el-form-item label="视频路径">
          <el-input
            v-model="videoPath"
            placeholder="/path/to/character-clip.mp4"
            :disabled="phase !== 'init'"
          />
        </el-form-item>
        <el-form-item label="抽帧数">
          <el-input-number
            v-model="frameCount"
            :min="1"
            :max="8"
            :disabled="phase !== 'init'"
          />
          <span class="hint-text">建议 4 帧（正/侧前/侧后/背）；最多 8 帧</span>
        </el-form-item>
      </el-form>
      <el-button
        type="primary"
        :disabled="!videoPath || phase !== 'init'"
        :loading="phase === 'extracting'"
        @click="onExtract"
      >
        {{ phase === 'extracting' ? '抽帧中...' : '抽帧' }}
      </el-button>
      <el-button v-if="phase === 'ready'" @click="onReset">重选视频</el-button>
    </div>

    <div v-if="phase === 'ready' && frames.length > 0" class="step-section">
      <header class="step-title">
        ② 挑选要保留的代表帧
        <span class="title-meta">已选 {{ selectedFrameIds.length }} / {{ frames.length }}</span>
        <el-button size="small" link @click="selectAll">全选</el-button>
        <el-button size="small" link @click="clearSelection">清空</el-button>
      </header>
      <div class="frame-grid">
        <article
          v-for="f in frames"
          :key="f.index"
          class="frame-card"
          :class="{ selected: selectedFrameIds.includes(f.index) }"
          @click="toggleSelect(f.index)"
        >
          <div class="frame-preview">
            <img :src="frameUrlOf(f.framePath)" :alt="`frame-${f.index}`" />
            <div class="frame-checkbox">
              <el-checkbox
                :model-value="selectedFrameIds.includes(f.index)"
                @click.stop
                @change="toggleSelect(f.index)"
              />
            </div>
            <div class="frame-time">{{ f.timeSec.toFixed(1) }}s</div>
          </div>
          <el-input
            v-model="frameLabels[f.index]"
            size="small"
            placeholder="视图角度"
            @click.stop
          />
        </article>
      </div>
    </div>

    <div v-if="phase === 'ready' && frames.length === 0" class="empty-result">
      <el-empty description="未抽到任何帧 — 视频可能太短或格式不支持" />
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="selectedFrameIds.length === 0 || phase === 'uploading'"
        :loading="phase === 'uploading'"
        @click="onImport"
      >
        落到角色图谱（{{ selectedFrameIds.length }}）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

interface ExtractedFrame {
  index: number
  timeSec: number
  framePath: string
  suggestedLabel: string
}

const props = defineProps<{
  modelValue: boolean
  /** 目标 character binding id —— 选中帧导入到此 binding 的 view 类目 */
  bindingId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'imported', payload: { count: number }): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

type Phase = 'init' | 'extracting' | 'ready' | 'uploading'
const phase = ref<Phase>('init')
const videoPath = ref('')
const frameCount = ref(4)
const sessionId = ref<string>('')
const frames = ref<ExtractedFrame[]>([])
const frameLabels = ref<Record<number, string>>({})
const selectedFrameIds = ref<number[]>([])

function frameUrlOf(p: string): string {
  return toImageUrl(p) ?? p
}

function onReset(): void {
  phase.value = 'init'
  frames.value = []
  selectedFrameIds.value = []
  frameLabels.value = {}
  // 异步清 temp（fire-and-forget）
  if (sessionId.value) {
    void (window as any).electronAPI?.episodeProduction?.asset?.characterExtract?.cleanup?.({
      sessionId: sessionId.value,
    })
    sessionId.value = ''
  }
}

async function onExtract(): Promise<void> {
  if (!videoPath.value) {
    ElMessage.warning('请输入视频路径')
    return
  }
  const api = (window as any).electronAPI?.episodeProduction?.asset?.characterExtract
  if (!api?.frames) {
    ElMessage.error('视频提取 IPC 未暴露')
    return
  }
  phase.value = 'extracting'
  try {
    const resp = await api.frames({
      videoPath: videoPath.value,
      frameCount: frameCount.value,
    })
    if (!resp?.success) {
      phase.value = 'init'
      ElMessage.error(resp?.error || '抽帧失败')
      return
    }
    sessionId.value = resp.data?.sessionId ?? ''
    frames.value = (resp.data?.frames ?? []) as ExtractedFrame[]
    // 初始化每帧 label 为建议值
    for (const f of frames.value) {
      frameLabels.value[f.index] = f.suggestedLabel
    }
    phase.value = 'ready'
    ElMessage.success(`已抽 ${frames.value.length} 帧 — 请挑选并编辑视图标签`)
  } catch (e: any) {
    phase.value = 'init'
    ElMessage.error(e?.message || '抽帧失败')
  }
}

function toggleSelect(index: number): void {
  const i = selectedFrameIds.value.indexOf(index)
  if (i < 0) selectedFrameIds.value.push(index)
  else selectedFrameIds.value.splice(i, 1)
}

function selectAll(): void {
  selectedFrameIds.value = frames.value.map((f) => f.index)
}

function clearSelection(): void {
  selectedFrameIds.value = []
}

async function onImport(): Promise<void> {
  if (selectedFrameIds.value.length === 0) return
  const api = (window as any).electronAPI?.episodeProduction?.asset?.characterExtract
  if (!api?.importFrames) {
    ElMessage.error('importFrames IPC 未暴露 — 无法落帧到图谱')
    return
  }

  phase.value = 'uploading'
  try {
    const payload = selectedFrameIds.value
      .map((idx) => {
        const f = frames.value.find((x) => x.index === idx)
        if (!f) return null
        const label = (frameLabels.value[idx] ?? f.suggestedLabel ?? `view-${idx}`).trim()
        return { framePath: f.framePath, label }
      })
      .filter((x): x is { framePath: string; label: string } => x !== null)

    const resp = await api.importFrames({
      bindingId: props.bindingId,
      frames: payload,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '落帧失败')
      phase.value = 'ready'
      return
    }
    const count = (resp.data?.imageIds ?? []).length
    if (count > 0) {
      ElMessage.success(`已落 ${count} / ${payload.length} 帧到角色图谱`)
      emit('imported', { count })
    } else {
      ElMessage.warning('未成功落任何帧 — 检查日志看具体错误')
    }
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '落帧失败')
  } finally {
    phase.value = 'ready'
  }
}

function onDialogClose(): void {
  // 关闭时清 temp（fire-and-forget）
  if (sessionId.value) {
    void (window as any).electronAPI?.episodeProduction?.asset?.characterExtract?.cleanup?.({
      sessionId: sessionId.value,
    })
    sessionId.value = ''
  }
}

watch(() => props.modelValue, (v) => {
  if (v) {
    // 打开时重置
    phase.value = 'init'
    frames.value = []
    selectedFrameIds.value = []
    frameLabels.value = {}
    sessionId.value = ''
  }
})
</script>

<style scoped lang="scss">
.step-section {
  margin-bottom: 18px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
}
.step-title {
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.title-meta {
  font-size: 13px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
}
.hint-text {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.frame-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.frame-card {
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
  background: var(--el-bg-color);
}
.frame-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.frame-card.selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}
.frame-preview {
  position: relative;
  height: 130px;
  background: var(--el-fill-color-light);
}
.frame-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.frame-checkbox {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 3px;
  padding: 2px 4px;
}
.frame-time {
  position: absolute;
  bottom: 4px;
  right: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-family: 'JetBrains Mono', Consolas, monospace;
}
.frame-card .el-input {
  margin: 0;
  padding: 4px 6px;
}

.empty-result {
  padding: 20px;
}
</style>
