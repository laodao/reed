<template>
  <!--
    StoryboardThumbnailDialog · 9 帧故事板预览（spec 2026-05-09 ep-redesign §3.2 B7 · P-18）

    剧本→分镜过渡的"先挑骨架再细化"路径。
    用户输入 / 已有剧本概要 → 调 generateThumbnails IPC → 9 帧 3×3 → 用户挑选 →
    （follow-up）创建 storyboards 行。

    双母语：
      大众用户 → 让 AI 把剧本展开看看，挑骨架再细化（替代逐分镜从零写描述）
      专业用户 → thumbnail storyboard，电影前期标准做法
  -->
  <el-dialog
    v-model="visible"
    title="📋 故事板预览（9 帧）"
    width="800px"
    destroy-on-close
    append-to-body
  >
    <div class="thumb-dialog-body">
      <!-- 输入区 -->
      <section v-if="!frames.length" class="input-section">
        <div class="field-block">
          <div class="field-label">剧本概要（必填）</div>
          <el-input
            v-model="form.synopsis"
            type="textarea"
            :rows="4"
            placeholder="一段话概括全剧故事；AI 会按此生成 9 帧连贯故事板"
            :maxlength="500"
            show-word-limit
            :disabled="generating"
          />
        </div>
        <div class="field-block">
          <div class="field-label">风格（可选）</div>
          <el-select
            v-model="form.styleAnchors"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="如：国风工笔 / 写实电影 / 动漫"
            class="full-width"
            :disabled="generating"
          />
        </div>
        <div class="hint-row">
          <el-icon><InfoFilled /></el-icon>
          <span>会调用主进程 sharp 把一张大图切成 3×3 = 9 张独立帧。多帧同时推理一致性更好。</span>
        </div>
      </section>

      <!-- 进度条 -->
      <section v-if="generating" class="progress-section">
        <el-progress :percentage="progressPct" :format="(p) => `${p}%`" />
        <div class="progress-hint">{{ progressLabel }}</div>
      </section>

      <!-- 9 帧预览 grid -->
      <section v-if="frames.length > 0" class="grid-section">
        <div class="grid-3x3">
          <article
            v-for="frame in frames"
            :key="frame.frameIndex"
            class="frame-cell"
            :class="{ 'is-selected': selectedFrames.includes(frame.frameIndex) }"
            @click="toggleSelect(frame.frameIndex)"
          >
            <img :src="toFileUrl(frame.thumbnailPath || frame.imagePath)" :alt="`frame ${frame.frameIndex}`" />
            <span class="frame-no">{{ frame.frameIndex }}</span>
            <el-checkbox
              :model-value="selectedFrames.includes(frame.frameIndex)"
              class="frame-check"
              @click.stop
              @change="(v) => v ? select(frame.frameIndex) : deselect(frame.frameIndex)"
            />
          </article>
        </div>
        <div class="select-hint">
          已选 {{ selectedFrames.length }} 帧 · 将创建 {{ selectedFrames.length }} 个分镜
        </div>
        <div v-if="scenes && scenes.length > 0" class="scene-picker">
          <span class="scene-label">导入到场景：</span>
          <el-select
            v-model="targetSceneScriptId"
            size="small"
            placeholder="选择目标场景"
            style="width: 280px"
          >
            <el-option
              v-for="(s, i) in scenes"
              :key="s.id"
              :label="s.title ?? `场景 ${(s.index ?? i) + 1}`"
              :value="s.id"
            />
          </el-select>
        </div>
      </section>
    </div>

    <template #footer>
      <el-button :disabled="generating" @click="onCancel">取消</el-button>
      <el-button v-if="!frames.length" type="primary" :loading="generating" :disabled="!canGenerate" @click="onGenerate">
        ✨ 生成 9 帧预览
      </el-button>
      <template v-else>
        <el-button :loading="generating" @click="onRegenerate">↻ 重新生成</el-button>
        <el-button
          type="success"
          :disabled="selectedFrames.length === 0 || creating"
          :loading="creating"
          @click="onCreateStoryboards"
        >
          ✓ 用选中帧创建分镜
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'

interface ThumbnailFrame {
  frameIndex: number
  imagePath: string
  thumbnailPath: string | null
  description: string | null
}

const props = defineProps<{
  modelValue: boolean
  episodeScriptId: string
  /** 可选：父组件传入剧本概要默认值（来自 SynopsisPanel） */
  defaultSynopsis?: string
  /** 可选：剧本中可选场景列表（C10 follow-up · #56：用户在 dialog 内选目标 scene） */
  scenes?: Array<{ id: string; title?: string; index?: number }>
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'created-storyboards': [{ storyboardIds: string[] }]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = reactive<{ synopsis: string; styleAnchors: string[] }>({
  synopsis: '',
  styleAnchors: [],
})

const frames = ref<ThumbnailFrame[]>([])
const sessionDir = ref<string>('')
const selectedFrames = ref<number[]>([])
const generating = ref(false)
const creating = ref(false)
const progressPct = ref(0)
const progressLabel = ref('')
const targetSceneScriptId = ref<string>('')

const canGenerate = computed(() => form.synopsis.trim().length >= 10)

watch(visible, (v) => {
  if (v) {
    // 打开时若父组件传了 defaultSynopsis 就预填
    if (props.defaultSynopsis && !form.synopsis) {
      form.synopsis = props.defaultSynopsis
    }
  } else {
    // 关闭时重置（若有 sessionDir 触发清理）
    if (sessionDir.value) {
      cleanup()
    }
  }
})

function toFileUrl(absPath: string): string {
  // sharp 主进程切到的绝对路径 → 渲染端通过 toImageUrl 走 asset 协议
  return toImageUrl(absPath)
}

function toggleSelect(idx: number): void {
  if (selectedFrames.value.includes(idx)) {
    deselect(idx)
  } else {
    select(idx)
  }
}

function select(idx: number): void {
  if (!selectedFrames.value.includes(idx)) {
    selectedFrames.value.push(idx)
    selectedFrames.value.sort((a, b) => a - b)
  }
}

function deselect(idx: number): void {
  selectedFrames.value = selectedFrames.value.filter((i) => i !== idx)
}

async function onGenerate(): Promise<void> {
  if (!canGenerate.value) {
    ElMessage.warning('概要太短（建议至少 10 字）')
    return
  }
  generating.value = true
  progressPct.value = 5
  progressLabel.value = '调 AI 生成 3×3 大图...'
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateStoryboardThumbnails) {
      ElMessage.error('generateStoryboardThumbnails IPC 未暴露（请重启）')
      return
    }
    progressPct.value = 30
    const resp = await api.generateStoryboardThumbnails({
      episodeScriptId: props.episodeScriptId,
      count: 9,
      storySynopsis: form.synopsis.trim(),
      styleAnchors: form.styleAnchors.length > 0 ? form.styleAnchors : undefined,
    })
    progressPct.value = 90
    progressLabel.value = 'sharp 切片 9 帧...'
    if (!resp?.success) {
      ElMessage.error(resp?.error || '生成失败')
      return
    }
    frames.value = resp.data?.frames ?? []
    sessionDir.value = resp.data?.sessionDir ?? ''
    progressPct.value = 100
    progressLabel.value = `已切出 ${frames.value.length} 帧`
    ElMessage.success(`已生成 ${frames.value.length} 帧故事板预览`)
  } catch (e: any) {
    ElMessage.error('生成异常：' + (e?.message ?? String(e)))
  } finally {
    generating.value = false
  }
}

async function onRegenerate(): Promise<void> {
  await cleanup()
  frames.value = []
  selectedFrames.value = []
  await onGenerate()
}

async function cleanup(): Promise<void> {
  if (!sessionDir.value) return
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.cleanupStoryboardThumbnails) return
  try {
    await api.cleanupStoryboardThumbnails({ sessionDir: sessionDir.value })
  } catch {
    // 容错
  }
  sessionDir.value = ''
}

async function onCancel(): Promise<void> {
  await cleanup()
  visible.value = false
}

async function onCreateStoryboards(): Promise<void> {
  if (selectedFrames.value.length === 0) {
    ElMessage.warning('请先勾选要保留的帧')
    return
  }
  if (!props.scenes || props.scenes.length === 0) {
    ElMessage.error('父组件未提供 scenes — dialog 无法决定目标场景')
    return
  }
  if (!targetSceneScriptId.value) {
    targetSceneScriptId.value = props.scenes[0].id
  }

  const api = (window as any).electronAPI?.episodeProduction?.createStoryboardsFromThumbnails
  if (!api) {
    ElMessage.error('createStoryboardsFromThumbnails IPC 未暴露（请重启）')
    return
  }
  creating.value = true
  try {
    const thumbnails = selectedFrames.value.map((idx) => {
      const f = frames.value.find((x) => x.frameIndex === idx)
      return {
        gridIndex: idx,
        description: f?.description ?? undefined,
      }
    })
    const resp = await api({
      sceneScriptId: targetSceneScriptId.value,
      thumbnails,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '创建分镜失败')
      return
    }
    const ids = (resp.data?.storyboardIds ?? []) as string[]
    ElMessage.success(`已创建 ${ids.length} 个分镜（去 ④ 分镜 stage 查看）`)
    emit('created-storyboards', { storyboardIds: ids })
    await cleanup()
    visible.value = false
  } catch (e: any) {
    ElMessage.error('创建分镜异常：' + (e?.message ?? String(e)))
  } finally {
    creating.value = false
  }
}
</script>

<style scoped lang="scss">
.thumb-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-section,
.grid-section,
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.full-width {
  width: 100%;
}

.hint-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-lighter);
  padding: 6px 10px;
  border-radius: 4px;
}

.progress-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.grid-3x3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.frame-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.is-selected {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
  }
}

.frame-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.frame-no {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
}

.frame-check {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 3px;
  padding: 0 4px;
}

.select-hint {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.scene-picker {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.scene-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
