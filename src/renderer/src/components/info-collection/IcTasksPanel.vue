<template>
  <div class="tk-panel">
    <el-empty v-if="store.tasks.length === 0" description="还没有任务——点右上角「开始搜集」" :image-size="72" />
    <el-timeline v-else>
      <el-timeline-item
        v-for="t in orderedTasks"
        :key="t.id"
        :type="timelineDotType(t.status)"
        :hollow="t.status !== 'done'"
        :timestamp="timeLine(t)"
        placement="top"
      >
        <div class="tk-card">
          <div class="tk-head">
            <el-tag size="small" :type="taskTagType(t.status)">{{ taskStatusText(t.status) }}</el-tag>
            <span class="tk-bp">蓝图 v{{ t.blueprintVersion }}</span>
            <span v-if="duration(t)" class="tk-duration">耗时 {{ duration(t) }}</span>
            <span v-else-if="isBusy(t.status)" class="tk-elapsed">已进行 {{ elapsed(t.createdAt) }}</span>
          </div>
          <div v-if="t.stats" class="tk-stats">
            <span class="chip">来源 <b>{{ t.stats.sourcesNew }}</b><i v-if="t.stats.sourcesFailed" class="bad">（失败 {{ t.stats.sourcesFailed }}）</i></span>
            <span class="chip">条目 <b>{{ t.stats.rowsDraft }}</b><i v-if="t.stats.rowsRejectedQuote" class="bad">（拒收 {{ t.stats.rowsRejectedQuote }}）</i><i v-if="t.stats.rowsMerged" class="dim">（合并 {{ t.stats.rowsMerged }}）</i></span>
            <span class="chip">工具调用 <b>{{ t.stats.toolCalls }}</b>/{{ t.stats.budgetMax }}</span>
            <span class="chip">覆盖率 <b>{{ percentText(t.stats.coverage) }}</b></span>
          </div>
          <div v-if="t.status === 'failed'" class="tk-failed">任务失败——可再次点「开始搜集」重跑（已入库的数据不会丢）</div>
          <div v-if="t.stats?.negativeResults?.length" class="tk-negative">
            <div class="neg-title">未满足的需求（如实明示）</div>
            <div v-for="n in t.stats.negativeResults" :key="n.irId" class="neg-line">
              · {{ n.question }}——{{ n.note }}
            </div>
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup lang="ts">
/**
 * 信息搜集 · 搜集任务面板
 * @module components/info-collection/IcTasksPanel
 * @description 时间线任务流水：状态 + 耗时 + 统计 chips + 负结果明示（质量报告的一部分）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useInfoCollectionStore, type IcTaskDto } from '@/stores/info-collection'
import { durationText, percentText, shortTime, taskStatusText, taskTagType } from '@/views/info-collection/ic-ui'

const store = useInfoCollectionStore()
/** 运行中任务的已耗时秒表（每秒走针；仅用于展示） */
const nowTick = ref(Date.now())
let elapsedTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (store.hasRunning) elapsedTimer = setInterval(() => (nowTick.value = Date.now()), 1000)
})
onBeforeUnmount(() => {
  if (elapsedTimer) clearInterval(elapsedTimer)
})

const orderedTasks = computed(() => [...store.tasks].reverse())

function timeLine(t: IcTaskDto): string {
  return `开始于 ${shortTime(t.createdAt)}`
}
function duration(t: IcTaskDto): string | null {
  return durationText(t.createdAt, t.finishedAt)
}
function isBusy(status: string): boolean {
  return status === 'running' || status === 'pending'
}
/** 运行中任务的已耗时（nowTick 触发重算） */
function elapsed(startIso: string | null): string {
  void nowTick.value
  const secs = startIso ? Math.max(0, Math.round((nowTick.value - new Date(startIso).getTime()) / 1000)) : 0
  if (secs < 60) return `${secs} 秒`
  if (secs < 3600) return `${Math.floor(secs / 60)} 分 ${secs % 60} 秒`
  return `${Math.floor(secs / 3600)} 时 ${Math.floor((secs % 3600) / 60)} 分`
}
function timelineDotType(status: string): 'primary' | 'success' | 'warning' | 'danger' | undefined {
  if (status === 'done') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (isBusy(status)) return 'primary'
  return undefined
}
</script>

<style scoped>
.tk-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 14px; background: var(--el-bg-color); }
.tk-head { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.tk-bp, .tk-duration, .tk-elapsed { color: var(--el-text-color-secondary); font-size: 12px; }
.tk-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.chip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 2px 8px;
}
.chip b { color: var(--el-text-color-primary); font-weight: 600; }
.chip .bad { color: var(--el-color-danger); font-style: normal; }
.chip .dim { color: var(--el-text-color-placeholder); font-style: normal; }
.tk-failed { margin-top: 8px; font-size: 12px; color: var(--el-color-danger); }
.tk-negative { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--el-border-color-lighter); }
.neg-title { font-size: 12px; color: var(--el-color-warning); margin-bottom: 4px; }
.neg-line { font-size: 12px; color: var(--el-text-color-secondary); padding: 2px 0; line-height: 1.6; }
</style>
