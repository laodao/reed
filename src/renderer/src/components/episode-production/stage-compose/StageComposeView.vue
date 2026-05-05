<template>
  <!--
    StageComposeView · ⑥ 合成 stage 容器（spec §6.2 + P6-T8）

    简化版（V1）：
    - 显示当前剧集导出状态摘要
    - "导出 MP4" 主按钮 → 打开 ExportDialog
    - 已成功导出时显示输出文件信息

    后续扩展：TimelineEditor 多轨时间线 UI（P6-T6）+ 复杂导出（音轨调整 / 转场预览）。
  -->
  <div class="stage-compose-view">
    <div class="hero">
      <div class="hero-icon">
        <el-icon><VideoCameraFilled /></el-icon>
      </div>
      <h3>整剧合成与导出</h3>
      <p class="hero-desc">
        把所有分镜的视频片段按场景顺序拼接，叠加转场 + 字幕，导出成单段 MP4。
      </p>
      <el-button
        type="primary"
        size="large"
        :disabled="!episodeScriptId"
        @click="onExportClick"
      >
        <el-icon><Download /></el-icon>
        导出 MP4
      </el-button>
      <div v-if="!episodeScriptId" class="hint">
        请先选择一个剧集
      </div>
    </div>

    <div v-if="lastExport" class="last-export">
      <div class="last-export-head">
        <el-icon><CircleCheck /></el-icon>
        <span>上次导出</span>
      </div>
      <div class="last-export-row">
        <span class="label">输出路径：</span>
        <span class="value">{{ lastExport.outputPath }}</span>
      </div>
      <div class="last-export-row">
        <span class="label">时长：</span>
        <span>{{ formatDuration(lastExport.durationSec) }}</span>
      </div>
    </div>

    <ExportDialog
      v-model="dialogVisible"
      :episode-script-id="episodeScriptId"
      :project-id="projectId"
      @exported="onExported"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  CircleCheck,
  Download,
  VideoCameraFilled,
} from '@element-plus/icons-vue'
import ExportDialog from './ExportDialog.vue'

interface ExportResult {
  outputPath: string
  durationSec: number
  srtPath?: string
}

defineProps<{
  episodeScriptId: string | null
  projectId?: string
}>()

const dialogVisible = ref(false)
const lastExport = ref<ExportResult | null>(null)

function onExportClick(): void {
  dialogVisible.value = true
}

function onExported(result: ExportResult): void {
  lastExport.value = result
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<style scoped>
.stage-compose-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  background: var(--el-fill-color-lighter);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
}

.hero-icon {
  font-size: 48px;
  color: var(--el-color-primary);
}

.hero h3 {
  margin: 0;
  font-size: 16px;
  color: var(--el-text-color-primary);
}

.hero-desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
  max-width: 480px;
}

.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.last-export {
  padding: 12px;
  background: var(--el-color-success-light-9);
  border-radius: 6px;
}

.last-export-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-color-success);
  margin-bottom: 8px;
}

.last-export-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 4px;
}

.last-export-row .label {
  color: var(--el-text-color-secondary);
  width: 70px;
}

.last-export-row .value {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}
</style>
