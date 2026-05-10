<template>
  <!--
    ReferenceVideoImportDialog · 参考视频导入对话框
    （spec 2026-05-09 ep-redesign §3.2 D5 · P-22）

    工作流：
      1. 用户输入视频路径（暂用文本框；future: 文件选择器）
      2. 点「开始分析」→ IPC ep:reference-video:analyze → 返回 ParsedShot[]
      3. 列表展示每个 shot（序号 / 时间区间 / 镜头语言字段 / 描述 / 代表帧）
      4. 用户勾选要导入的 shot → emit('imported', { shots, analysisId })
      5. 父组件接 imported 事件，把选中的 ParsedShot 转成 storyboard 行
  -->
  <el-dialog
    v-model="visible"
    title="📹 从参考视频导入分镜"
    width="900px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <div class="step-section">
      <header class="step-title">① 选择参考视频</header>
      <el-form label-width="100px" size="small">
        <el-form-item label="视频路径">
          <el-input
            v-model="videoPath"
            placeholder="/path/to/reference.mp4"
            :disabled="phase === 'analyzing' || phase === 'ready'"
          />
        </el-form-item>
        <el-form-item label="切换阈值">
          <el-input-number
            v-model="sceneThreshold"
            :min="0.1"
            :max="0.9"
            :step="0.05"
            :precision="2"
            :disabled="phase === 'analyzing' || phase === 'ready'"
          />
          <span class="hint-text">越小切片越多（默认 0.3）</span>
        </el-form-item>
      </el-form>
      <el-button
        type="primary"
        :disabled="!videoPath || phase === 'analyzing'"
        :loading="phase === 'analyzing'"
        @click="onAnalyze"
      >
        {{ phase === 'analyzing' ? '分析中...' : phase === 'ready' ? '重新分析' : '开始分析' }}
      </el-button>
      <el-button v-if="phase === 'ready'" @click="onReset">重选视频</el-button>
    </div>

    <div v-if="phase === 'ready' && shots.length > 0" class="step-section">
      <header class="step-title">
        ② 选择要导入的镜头
        <span class="title-meta">
          共 {{ shots.length }} 个 ｜ 已选 {{ selectedShots.length }} 个
        </span>
        <el-button size="small" link @click="selectAll">全选</el-button>
        <el-button size="small" link @click="clearSelection">清空</el-button>
      </header>
      <el-table
        :data="shots"
        border
        size="small"
        max-height="380"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="42" />
        <el-table-column label="#" width="40" prop="shotIndex" />
        <el-table-column label="时间" width="100">
          <template #default="{ row }">
            <span class="mono">{{ formatSec(row.startSec) }}~{{ formatSec(row.endSec) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时长" width="60" prop="durationSec">
          <template #default="{ row }">{{ row.durationSec.toFixed(1) }}s</template>
        </el-table-column>
        <el-table-column label="景别" width="80" prop="shotType" />
        <el-table-column label="角度" width="80" prop="cameraAngle" />
        <el-table-column label="运镜" width="90" prop="cameraMovement" />
        <el-table-column label="描述">
          <template #default="{ row }">
            <span class="cell-desc">{{ row.frameDescription || '—' }}</span>
            <div v-if="row.detectedDialogue" class="cell-dialogue">
              💬 {{ row.detectedDialogue }}
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="phase === 'ready' && shots.length === 0" class="empty-result">
      <el-empty description="未检测到镜头切换 — 视频可能太短或单镜头" />
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="selectedShots.length === 0"
        @click="onImport"
      >
        导入选中 {{ selectedShots.length }} 个镜头
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

interface ParsedShot {
  shotIndex: number
  startSec: number
  endSec: number
  durationSec: number
  shotType: string
  cameraAngle: string
  cameraMovement: string
  frameDescription: string
  emotion: string
  representativeFramePath: string
  detectedDialogue: string | null
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'imported', payload: { shots: ParsedShot[]; analysisId: string }): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

type Phase = 'init' | 'analyzing' | 'ready' | 'failed'
const phase = ref<Phase>('init')
const videoPath = ref('')
const sceneThreshold = ref(0.3)
const shots = ref<ParsedShot[]>([])
const selectedShots = ref<ParsedShot[]>([])
const analysisId = ref<string>('')

function formatSec(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

function onOpen(): void {
  // 仅 reset 选中状态，保留上次输入的路径方便重试
  selectedShots.value = []
  if (phase.value !== 'ready') {
    shots.value = []
  }
}

function onReset(): void {
  phase.value = 'init'
  shots.value = []
  selectedShots.value = []
  analysisId.value = ''
}

async function onAnalyze(): Promise<void> {
  if (!videoPath.value) {
    ElMessage.warning('请先输入视频路径')
    return
  }
  const api = (window as any).electronAPI?.episodeProduction?.asset?.referenceVideo
  if (!api?.analyze) {
    ElMessage.error('视频解析 IPC 未暴露')
    return
  }
  phase.value = 'analyzing'
  try {
    const resp = await api.analyze({
      videoPath: videoPath.value,
      sceneThreshold: sceneThreshold.value,
    })
    if (!resp?.success) {
      phase.value = 'failed'
      ElMessage.error(resp?.error || '分析失败')
      return
    }
    const data = resp.data
    analysisId.value = data?.id ?? ''
    shots.value = (data?.shots ?? []) as ParsedShot[]
    phase.value = 'ready'
    if (shots.value.length === 0) {
      ElMessage.warning('未检测到镜头切换')
    } else {
      ElMessage.success(`分析完成：${shots.value.length} 个镜头`)
    }
  } catch (e: any) {
    phase.value = 'failed'
    ElMessage.error(e?.message || '分析失败')
  }
}

function onSelectionChange(selection: ParsedShot[]): void {
  selectedShots.value = selection
}

function selectAll(): void {
  // 触发 el-table 全选 — 通过 ref 控制比较繁琐，简单办法：emit selection
  selectedShots.value = [...shots.value]
}

function clearSelection(): void {
  selectedShots.value = []
}

function onImport(): void {
  if (selectedShots.value.length === 0) return
  emit('imported', {
    shots: selectedShots.value,
    analysisId: analysisId.value,
  })
  visible.value = false
  ElMessage.success(`已发出 ${selectedShots.value.length} 个镜头导入请求`)
}
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
.cell-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;
  font-size: 12px;
}
.cell-dialogue {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-color-primary);
  font-style: italic;
}
.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}
.empty-result {
  padding: 20px;
}
</style>
