<template>
  <div class="node-detail">
    <!-- 头部：节点名 + 类型 + 关闭 -->
    <div class="nd-head">
      <span class="nd-title">环节详情</span>
      <span class="nd-name">{{ node?.name || '未知节点' }}</span>
      <el-tag size="small" type="info">{{ node?.type || (runs[0]?.nodeType ?? '') }}</el-tag>
      <span class="nd-id">{{ selectedNodeId }}</span>
      <el-button text size="small" class="nd-close" @click="$emit('close')">关闭</el-button>
    </div>

    <!-- 无执行记录：该环节未走到 -->
    <div v-if="!runs.length" class="nd-empty">
      <el-empty description="该环节本次运行未执行" :image-size="60" />
    </div>

    <template v-else>
      <!-- 执行记录（全部迭代） -->
      <div class="nd-section-title">执行记录（{{ runs.length }} 次迭代）</div>
      <div v-for="(r, i) in runs" :key="iterKey(r, i)" class="nd-iter" :class="{ latest: i === 0 }">
        <div class="nd-iter-head">
          <span class="nd-iter-no">
            #{{ i + 1 }}
            <span v-if="r.iterationIndex > 0" class="nd-iter-iter">(迭代 {{ r.iterationIndex }})</span>
            <el-tag v-if="i === 0 && runs.length > 1" size="small" type="info" effect="plain">最新</el-tag>
          </span>
          <el-tag :type="nodeStatusTag(r.status)" size="small">{{ r.status }}</el-tag>
          <span class="nd-iter-time">{{ fmtRange(r) }}</span>
        </div>

        <!-- routeTaken 路由 -->
        <div v-if="r.routeTaken" class="nd-route">
          <span class="nd-label">路由</span>
          <el-tag size="small" type="warning" effect="plain">{{ r.routeTaken }}</el-tag>
        </div>

        <!-- error 错误 -->
        <div v-if="r.error" class="nd-error">
          <span class="nd-label">错误</span>
          <el-alert :title="String(r.error)" type="error" :closable="false" show-icon />
        </div>

        <!-- review 审核结论 -->
        <div v-if="r.review && Object.keys(r.review).length" class="nd-review">
          <span class="nd-label">审核</span>
          <JsonFold :value="r.review" :max-summary-chars="120" />
        </div>

        <!-- 输入 / 输出（折叠：首行摘要 + 展开完整） -->
        <div v-if="hasValue(r.input) || hasValue(r.output)" class="nd-io">
          <div v-if="hasValue(r.input)" class="nd-io-block">
            <div class="nd-io-title">输入</div>
            <JsonFold :value="r.input" :max-summary-chars="120" />
          </div>
          <div v-if="hasValue(r.output)" class="nd-io-block">
            <div class="nd-io-title">输出</div>
            <JsonFold :value="r.output" :max-summary-chars="160" />
          </div>
        </div>
      </div>
    </template>

    <!-- 该节点执行日志行 -->
    <template v-if="logs.length">
      <div class="nd-section-title">执行日志（{{ logs.length }} 行）</div>
      <div class="nd-logs">
        <div v-for="(l, i) in logs" :key="i" class="nd-log">
          <span class="nd-log-time">{{ formatLogTs(l.ts) }}</span>
          <el-tag :type="logLineTag(l.level)" size="small" class="nd-log-lv">{{ l.level }}</el-tag>
          <span class="nd-log-type">{{ l.type }}</span>
          <span class="nd-log-msg">{{ l.message }}</span>
        </div>
      </div>
    </template>
    <div v-else-if="runs.length" class="nd-no-log">该节点暂无独立日志行（可在页面上方「执行日志」查看）</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 环节详情面板：展示某节点全部迭代的执行记录（状态/起止/耗时/error/routeTaken/review）、
 * 输入输出（折叠摘要 + 展开完整）、以及该 run 日志中该节点的日志行。
 */
import JsonFold from './JsonFold.vue'
import {
  formatRunDuration,
  formatRunTime,
  formatLogTs,
  logLineTag,
  nodeStatusTag,
} from '../../utils/workflow-run-detail-utils'

const props = defineProps<{
  selectedNodeId: string
  /** 图中的节点（含 name/type/config） */
  node: any
  /** 该节点全部迭代的 nodeRuns */
  runs: any[]
  /** 该节点的日志行（listRunLogs 中 nodeId 匹配） */
  logs: any[]
}>()
defineEmits<{ (e: 'close'): void }>()

function iterKey(r: any, i: number): string {
  return `${r.nodeId}:${r.iterationIndex ?? 0}:${i}`
}
function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && (typeof v !== 'object' || Object.keys(v as object).length > 0)
}
/** 起止 + 耗时 */
function fmtRange(r: any): string {
  const s = formatRunTime(r.startedAt)
  const e = formatRunTime(r.finishedAt)
  const d = formatRunDuration(r.durationMs)
  return `${s} → ${e}（${d}）`
}
</script>

<style scoped>
.node-detail { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 12px 14px; background: var(--el-bg-color); }
.nd-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--el-border-color-lighter); }
.nd-title { font-weight: 600; font-size: 14px; }
.nd-name { font-weight: 600; font-size: 14px; }
.nd-id { font-size: 11px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nd-close { margin-left: auto; }
.nd-section-title { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); margin: 12px 0 8px; }
.nd-empty { padding: 8px 0; }

.nd-iter { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; margin-bottom: 10px; padding: 10px 12px; }
.nd-iter.latest { border-color: var(--el-color-primary-light-5); }
.nd-iter-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nd-iter-no { font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
.nd-iter-iter { color: var(--el-text-color-secondary); font-weight: 400; }
.nd-iter-time { font-size: 11px; color: var(--el-text-color-secondary); }

.nd-route, .nd-error, .nd-review { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; font-size: 12px; }
.nd-label { font-size: 11px; font-weight: 600; color: var(--el-text-color-secondary); }

.nd-io { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.nd-io-block { display: flex; flex-direction: column; gap: 4px; }
.nd-io-title { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); }

.nd-logs { max-height: 260px; overflow: auto; font-size: 12px; line-height: 1.8; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 6px 8px; }
.nd-log { display: flex; align-items: baseline; gap: 8px; padding: 2px 4px; border-bottom: 1px dashed var(--el-border-color-lighter); }
.nd-log-time { color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.nd-log-lv { flex: none; }
.nd-log-type { color: var(--el-color-primary); flex: none; min-width: 80px; }
.nd-log-msg { flex: 1; word-break: break-all; }
.nd-no-log { font-size: 11px; color: var(--el-text-color-placeholder); padding: 6px 4px; }
</style>
