<template>
  <el-drawer
    :model-value="modelValue"
    :title="`${nodeName || nodeId} · Agent 轨迹`"
    size="560px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-if="loading" class="traj-loading">加载中…</div>
    <div v-else-if="loadError" class="traj-error">
      {{ loadError }}
      <el-button text size="small" type="primary" @click="load()">重试</el-button>
    </div>
    <div v-else-if="entries.length === 0" class="traj-empty">
      暂无轨迹（该节点可能早于轨迹落库功能运行，或为非 agent-loop 节点）
    </div>
    <template v-else>
      <div class="traj-summary">
        共 {{ entries.length }} 条 · {{ totalIterations }} 轮 ·
        输入 {{ totalPrompt }} / 输出 {{ totalCompletion }} tokens
      </div>
      <el-timeline>
        <el-timeline-item
          v-for="(group, gi) in groups"
          :key="gi"
          :timestamp="`第 ${group.iteration + 1} 轮`"
          placement="top"
          :type="groupType(group)"
        >
          <div v-for="e in group.entries" :key="e.id" class="traj-entry" :class="`traj-${e.kind}`">
            <div class="traj-head">
              <el-tag size="small" :type="kindTag(e)" disable-transitions>{{ kindLabel(e) }}</el-tag>
              <span v-if="e.name" class="traj-name">{{ e.name }}</span>
              <span v-if="e.durationMs != null" class="traj-dur">{{ (e.durationMs / 1000).toFixed(1) }}s</span>
            </div>
            <!-- decision：思考 + 计划调用的工具 -->
            <div v-if="e.kind === 'decision' && thought(e)" class="traj-thought">{{ thought(e) }}</div>
            <div v-if="e.kind === 'decision' && plannedTools(e).length" class="traj-plan">
              计划调用：{{ plannedTools(e).join('、') }}
              <span v-if="finishReason(e)" class="traj-muted">（finish={{ finishReason(e) }}）</span>
            </div>
            <!-- tool_call：入参 -->
            <pre v-if="e.kind === 'tool_call'" class="traj-json">{{ argsText(e) }}</pre>
            <!-- tool_result：结果状态 -->
            <div v-if="e.kind === 'tool_result'" :class="resultOk(e) === false || resultDenied(e) ? 'traj-err' : 'traj-ok'">
              {{ resultText(e) }}
            </div>
            <!-- final / guardrail_stop -->
            <div v-if="e.kind === 'final'" class="traj-answer">{{ answer(e) }}</div>
            <div v-if="e.kind === 'guardrail_stop'" class="traj-err">终止原因：{{ stopReason(e) }}</div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
defineOptions({ name: 'AgentTrajectoryDrawer' })
import { ref, computed, watch } from 'vue'

/** 轨迹行（wf:get-node-trajectories 返回；与后端 AgentTrajectoryRow 同构） */
interface TrajEntry {
  id: string
  seq: number
  iteration: number
  kind: string
  name: string | null
  payload: Record<string, unknown> | null
  promptTokens: number | null
  completionTokens: number | null
  durationMs: number | null
}

/** payload 字段访问（各 kind 形状见 loop.ts emitTrajectory 点） */
function p(e: TrajEntry): Record<string, unknown> {
  return (e.payload ?? {}) as Record<string, unknown>
}
function thought(e: TrajEntry): string {
  return String(p(e).thought ?? '')
}
function plannedTools(e: TrajEntry): string[] {
  return Array.isArray(p(e).toolCalls) ? (p(e).toolCalls as string[]) : []
}
function finishReason(e: TrajEntry): string {
  return String(p(e).finishReason ?? '')
}
function resultOk(e: TrajEntry): boolean | undefined {
  return p(e).ok as boolean | undefined
}
function resultDenied(e: TrajEntry): boolean {
  return p(e).denied === true
}
function resultReason(e: TrajEntry): string {
  return String(p(e).reason ?? p(e).error ?? '')
}
function answer(e: TrajEntry): string {
  return String(p(e).answer ?? '')
}
function stopReason(e: TrajEntry): string {
  return String(p(e).reason ?? '')
}
function argsText(e: TrajEntry): string {
  try {
    return JSON.stringify(p(e).args ?? {}, null, 2)
  } catch {
    return String(p(e).args)
  }
}

const props = defineProps<{
  modelValue: boolean
  runId: string
  nodeId: string
  iterationIndex?: number
  nodeName?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const entries = ref<TrajEntry[]>([])
const loading = ref(false)
/** 三态：'' = 正常 | 错误文案（review C4：把接线故障伪装成"没数据"会误导排障） */
const loadError = ref('')
/** 竞态防护（review C3）：快速切换 nodeId/iterationIndex 时旧响应不得覆盖新数据 */
let loadSeq = 0

/** 轮内展示序（review C9 修订版）：seq 是 emit 序——ai@6 在流内执行工具，
 *  tool_result 先于 tool_call/decision 落库。重排规则：decision 提前（模型思考
 *  先于调用）；tool_call 与其 tool_result 按 toolCallId 配对相邻；其余按 seq。 */
function orderGroup(entries: TrajEntry[]): TrajEntry[] {
  const decisions = entries.filter((e) => e.kind === 'decision')
  const calls = entries.filter((e) => e.kind === 'tool_call')
  const resultsByCall = new Map<string, TrajEntry[]>()
  const others: TrajEntry[] = []
  for (const e of entries) {
    if (e.kind === 'tool_result') {
      const key = String((e.payload as { toolCallId?: string } | null)?.toolCallId ?? '')
      if (!resultsByCall.has(key)) resultsByCall.set(key, [])
      resultsByCall.get(key)!.push(e)
    } else if (e.kind !== 'tool_call' && e.kind !== 'decision') {
      others.push(e)
    }
  }
  const out: TrajEntry[] = [...decisions]
  for (const call of calls) {
    out.push(call)
    const callId = String((call.payload as { toolCallId?: string } | null)?.toolCallId ?? '')
    out.push(...(resultsByCall.get(callId) ?? []))
    resultsByCall.delete(callId)
  }
  // 无配对 call 的 result（防御：call 被 emit 丢失时仍展示，不吞数据）
  for (const rest of resultsByCall.values()) out.push(...rest)
  out.push(...others)
  return out
}

const groups = computed(() => {
  const out: Array<{ iteration: number; entries: TrajEntry[] }> = []
  for (const e of entries.value) {
    const last = out[out.length - 1]
    if (last && last.iteration === e.iteration) last.entries.push(e)
    else out.push({ iteration: e.iteration, entries: [e] })
  }
  for (const g of out) g.entries = orderGroup(g.entries)
  return out
})
const totalIterations = computed(() => new Set(entries.value.map((e) => e.iteration)).size)
const totalPrompt = computed(() => entries.value.reduce((s, e) => s + (e.promptTokens ?? 0), 0))
const totalCompletion = computed(() => entries.value.reduce((s, e) => s + (e.completionTokens ?? 0), 0))

function groupType(group: { entries: TrajEntry[] }): 'primary' | 'success' | 'warning' {
  return group.entries.some((e) => e.kind === 'guardrail_stop' || (e.kind === 'tool_result' && resultOk(e) === false))
    ? 'warning'
    : group.entries.some((e) => e.kind === 'final')
      ? 'success'
      : 'primary'
}

function kindLabel(e: TrajEntry): string {
  switch (e.kind) {
    case 'decision': return '思考'
    case 'tool_call': return '调用工具'
    case 'tool_result': return '工具结果'
    case 'human_request': return '请求人工'
    case 'human_decision': return '人工决策'
    case 'guardrail_stop': return '护栏终止'
    case 'final': return '最终答案'
    default: return e.kind
  }
}
function kindTag(e: TrajEntry): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (e.kind) {
    case 'decision': return 'primary'
    case 'tool_call': return 'info'
    case 'tool_result': return resultOk(e) === false || resultDenied(e) ? 'danger' : 'success'
    case 'final': return 'success'
    case 'guardrail_stop': return 'danger'
    default: return 'info'
  }
}
function resultText(e: TrajEntry): string {
  if (resultDenied(e)) return `未获批准${resultReason(e) ? `：${resultReason(e)}` : ''}`
  if (resultOk(e) === false) return `失败${resultReason(e) ? `：${resultReason(e)}` : ''}`
  return '成功'
}

async function load(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ''
  try {
    const api = (window as never as { electronAPI: { workflow: { getNodeTrajectories: (p: { runId: string; nodeId: string; iterationIndex?: number }) => Promise<{ success: boolean; data?: TrajEntry[]; error?: string }> } } }).electronAPI.workflow
    const resp = await api.getNodeTrajectories({
      runId: props.runId,
      nodeId: props.nodeId,
      iterationIndex: props.iterationIndex ?? 0,
    })
    if (seq !== loadSeq) return // 已有更新的请求（旧响应丢弃）
    if (resp.success && resp.data) {
      entries.value = resp.data
      loadError.value = ''
    } else {
      entries.value = []
      loadError.value = resp.error ?? '轨迹加载失败'
    }
  } catch (e) {
    if (seq !== loadSeq) return
    entries.value = []
    loadError.value = e instanceof Error ? e.message : '轨迹加载失败'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.modelValue, props.runId, props.nodeId, props.iterationIndex] as const,
  ([visible]) => {
    if (visible) void load()
  },
  { immediate: true },
)
</script>

<style scoped>
.traj-loading, .traj-empty { color: var(--el-text-color-secondary); font-size: 13px; padding: 16px 0; }
.traj-error { color: var(--el-color-danger); font-size: 13px; padding: 16px 0; }
.traj-summary { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 12px; }
.traj-entry { padding: 6px 8px; border-radius: 6px; background: var(--el-fill-color-lighter); margin-bottom: 6px; }
.traj-head { display: flex; align-items: center; gap: 8px; }
.traj-name { font-size: 12px; font-weight: 600; }
.traj-dur { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }
.traj-thought { font-size: 12px; line-height: 1.6; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
.traj-plan { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.traj-muted { opacity: 0.7; }
.traj-json {
  margin: 4px 0 0; padding: 6px 8px; background: var(--el-fill-color);
  border-radius: 4px; font-size: 11px; line-height: 1.5;
  max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-all;
}
.traj-ok { font-size: 12px; color: var(--el-color-success); margin-top: 4px; }
.traj-err { font-size: 12px; color: var(--el-color-danger); margin-top: 4px; word-break: break-word; }
.traj-answer { font-size: 12px; line-height: 1.6; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
</style>
