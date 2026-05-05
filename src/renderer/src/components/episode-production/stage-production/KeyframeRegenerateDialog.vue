<template>
  <!--
    KeyframeRegenerateDialog · 单帧重生成 + 传播确认（spec §4.3 + P5-T19）

    - 接到 KeyframeGrid 的 'regenerate-request' 后弹出
    - 调 ep:plan-keyframe-regen 计算 required + suggested
    - 弹框列出受影响帧的勾选清单（required 默认 disabled+checked，suggested 默认 checked）
    - 用户确认 → 顺序调 ep:regenerate-keyframe 逐帧重生成
    - 全过程 loading + 完成后通知父组件 reload
  -->
  <el-dialog
    v-model="visible"
    title="重生成关键帧"
    width="480px"
    :close-on-click-modal="false"
    @close="onClose"
  >
    <div v-if="loading" class="loading-row">
      <el-icon class="is-loading"><Loading /></el-icon>
      计算传播范围...
    </div>

    <div v-else-if="propagation">
      <p class="hint">
        改动 <strong>第 {{ frameIndex }} 帧</strong>（{{ roleLabel(frameRole) }}）后，
        以下帧将受影响。请勾选要重生成的帧：
      </p>

      <el-checkbox-group v-model="selectedIndexes">
        <div class="frame-section" v-if="propagation.required.length > 0">
          <div class="section-label">必须重生成（包含本帧）</div>
          <el-checkbox
            v-for="i in propagation.required"
            :key="`r-${i}`"
            :label="i"
            disabled
          >
            #{{ i }}
          </el-checkbox>
        </div>

        <div class="frame-section" v-if="propagation.suggested.length > 0">
          <div class="section-label">建议级联重生成（默认勾选，可取消）</div>
          <el-checkbox
            v-for="i in propagation.suggested"
            :key="`s-${i}`"
            :label="i"
          >
            #{{ i }}
          </el-checkbox>
        </div>

        <div
          v-if="propagation.required.length === 0 && propagation.suggested.length === 0"
          class="empty-prop"
        >
          仅影响本帧，无传播。
        </div>
      </el-checkbox-group>
    </div>

    <div v-if="regenerating" class="regen-progress">
      <el-icon class="is-loading"><Loading /></el-icon>
      重生成中（{{ regenDoneCount }} / {{ regenTotalCount }}）...
    </div>

    <template #footer>
      <el-button @click="onCancel" :disabled="regenerating">取消</el-button>
      <el-button
        type="primary"
        :loading="regenerating"
        :disabled="loading || selectedIndexes.length === 0"
        @click="onConfirm"
      >
        重生成 {{ selectedIndexes.length }} 帧
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * KeyframeRegenerateDialog（P5-T19）
 *
 * Props：
 *   - storyboardId / keyframes：当前分镜全部关键帧（用于 frameIndex → keyframeId 映射）
 *   - keyframeCount：分镜的关键帧总数（plan-keyframe-regen 入参）
 *   - frameIndex / keyframeId / frameRole：用户改动的那一帧
 *
 * Emits：
 *   - close：用户取消或重生成完成时关闭对话框
 *   - regenerated(keyframeIds[])：成功重生成的帧 ID 列表，让父组件 reload grid
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

interface Keyframe {
  id: string
  frameIndex: number
  frameRole: 'start' | 'middle' | 'end' | 'extra'
}

interface RegenPropagation {
  required: number[]
  suggested: number[]
}

const props = defineProps<{
  modelValue: boolean
  storyboardId: string | null
  keyframes: Keyframe[]
  keyframeCount: number
  frameIndex: number
  keyframeId: string
  frameRole: 'start' | 'middle' | 'end' | 'extra'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'regenerated', keyframeIds: string[]): void
}>()

const visible = ref(false)
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) loadPropagation()
  },
)
watch(visible, (v) => emit('update:modelValue', v))

const loading = ref(false)
const propagation = ref<RegenPropagation | null>(null)
const selectedIndexes = ref<number[]>([])

const regenerating = ref(false)
const regenDoneCount = ref(0)
const regenTotalCount = ref(0)

function roleLabel(role: string): string {
  return role === 'start'
    ? '开始'
    : role === 'end'
      ? '结束'
      : role === 'middle'
        ? '中间'
        : '附加'
}

async function loadPropagation(): Promise<void> {
  loading.value = true
  propagation.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.planKeyframeRegen) {
      throw new Error('IPC planKeyframeRegen 未暴露')
    }
    const resp = await api.planKeyframeRegen(props.frameIndex, props.keyframeCount)
    if (!resp?.success) throw new Error(resp?.error || '计算传播失败')
    propagation.value = resp.data as RegenPropagation
    // 默认选中：required（强制）+ suggested（默认勾选）
    selectedIndexes.value = [
      ...propagation.value.required,
      ...propagation.value.suggested,
    ]
  } catch (e: any) {
    ElMessage.error(`加载传播范围失败：${e?.message ?? e}`)
    propagation.value = { required: [props.frameIndex], suggested: [] }
    selectedIndexes.value = [props.frameIndex]
  } finally {
    loading.value = false
  }
}

async function onConfirm(): Promise<void> {
  if (selectedIndexes.value.length === 0) return
  // 把 frameIndex 映射回 keyframeId
  const ids: string[] = []
  for (const idx of selectedIndexes.value) {
    const kf = props.keyframes.find((k) => k.frameIndex === idx)
    if (kf) ids.push(kf.id)
  }
  if (ids.length === 0) {
    ElMessage.warning('未找到对应的关键帧记录')
    return
  }

  regenerating.value = true
  regenTotalCount.value = ids.length
  regenDoneCount.value = 0
  const succeeded: string[] = []
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.regenerateKeyframe) {
      throw new Error('IPC regenerateKeyframe 未暴露')
    }
    // 顺序重生成（避免 provider 并发限制）
    for (const id of ids) {
      try {
        const resp = await api.regenerateKeyframe(id, undefined)
        if (resp?.success) succeeded.push(id)
        else ElMessage.warning(`第 ${id} 帧失败：${resp?.error}`)
      } catch (e: any) {
        ElMessage.warning(`第 ${id} 帧异常：${e?.message ?? e}`)
      }
      regenDoneCount.value += 1
    }
    ElMessage.success(`成功重生成 ${succeeded.length} / ${ids.length} 帧`)
    emit('regenerated', succeeded)
    visible.value = false
  } finally {
    regenerating.value = false
  }
}

function onCancel(): void {
  visible.value = false
}

function onClose(): void {
  selectedIndexes.value = []
  propagation.value = null
}
</script>

<style scoped>
.loading-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px;
  color: var(--el-text-color-secondary);
}

.hint {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.frame-section {
  margin-bottom: 12px;
}

.section-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.empty-prop {
  padding: 12px 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.regen-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0 0 0;
  color: var(--el-color-primary);
  font-size: 12px;
}
</style>
