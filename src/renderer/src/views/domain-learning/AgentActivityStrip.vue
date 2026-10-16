<template>
  <!-- 活动行（1-3 行滚动；2026-09-13 用户需求：长任务要能看见系统正在做什么） -->
  <div v-if="lines.length" class="agent-activity" :class="{ 'is-warn': warnActive }">
    <span class="aa-dot" />
    <div class="aa-lines">
      <div
        v-for="(line, i) in lines"
        :key="`${i}-${line}`"
        class="aa-line"
        :class="{ 'is-warn': isWarn(line), 'is-latest': i === lines.length - 1 }"
      >
        {{ line }}
      </div>
    </div>
    <!-- 完整输出入口（2026-10-05 用户需求：滚动行只留 3 条，点图标弹窗看全过程） -->
    <el-tooltip content="查看完整输出" placement="top" :show-after="200">
      <button class="aa-detail-btn" type="button" aria-label="查看完整输出" @click="detailVisible = true">
        <el-icon><Document /></el-icon>
      </button>
    </el-tooltip>
  </div>

  <!-- 完整输出弹窗：全过程活动行（带时间）+ 本轮回复正文 -->
  <el-dialog v-model="detailVisible" :title="detailTitle ?? 'Agent 输出详情'" width="640px" append-to-body>
    <div class="aa-detail-body">
      <div v-if="!history.length && !(resultText ?? '').trim()" class="aa-detail-empty">本轮还没有输出</div>
      <template v-else>
        <div v-for="(h, i) in history" :key="i" class="aa-detail-line" :class="h.kind">
          <span class="aa-detail-time">{{ h.time }}</span>
          <span class="aa-detail-text">{{ h.text }}</span>
        </div>
        <div v-if="(resultText ?? '').trim()" class="aa-detail-result">
          <div class="aa-detail-result-head">本轮回复</div>
          <pre class="aa-detail-result-text">{{ resultText }}</pre>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button size="small" @click="clearHistory">清空记录</el-button>
      <el-button size="small" type="primary" @click="detailVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * Agent 活动行（1-3 行滚动）
 * @module views/domain-learning/AgentActivityStrip
 *
 * 背景（2026-09-13 用户需求）：起步研究与「研究此概念」动辄跑两三分钟，此前界面只有一个
 * 静态的「正在起步研究…」，用户感知不到系统在工作；被额度拒掉的知识点更是无声消失。
 *
 * 做法：订阅**空间级** agent 事件通道（`dl:agent:<spaceId>`，宿主把 progress 事件统一发在这里，
 * 不带 conceptId），把最新 3 行渲染成滚动小字；失败行（⚠️）高亮并把整条置为警示态。
 * 一轮结束后（reply:done / error）保留 4 秒再清空，让用户看清最后一步做了什么。
 *
 * 文案翻译在 `shared/utils/domain-learning-activity`（纯函数，已单测），本组件只负责订阅与渲染。
 *
 * 2026-10-05 追加（用户需求）：滚动区只留 3 行看不全——全过程活动行带时间记进 history，
 * 行尾加「查看完整输出」图标，弹窗展示完整输出；可选 resultText（父层 sendAgent 的回复正文）
 * 一并展示。persistOnDone：轮次结束后不再 4 秒清空（起步研究卡内用，留图标可回看）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Document } from '@element-plus/icons-vue'
import { pushActivityLine } from '@shared/utils/domain-learning-activity'
import { useDomainLearningStore } from '@/stores/domain-learning'

const props = defineProps<{
  spaceId: string
  /**
   * 显示哪些模式的活动（缺省 research + task：起步研究、研究此概念、补全知识地图
   * 都在这两类里；答疑 tutor 的进度走对话面板，不在本条显示）。
   */
  modes?: Array<'research' | 'task' | 'tutor'>
  /** 完整输出弹窗标题 */
  detailTitle?: string
  /** 本轮回复正文（父层 sendAgent 返回的 content；空=不展示该节） */
  resultText?: string
  /** 轮次结束后不自动清空滚动行（保留「查看完整输出」入口） */
  persistOnDone?: boolean
}>()

/** 完整输出的一行（progress 活动行 / 轮次收尾标记；kind 供配色） */
interface ActivityHistoryLine {
  time: string
  text: string
  kind: 'info' | 'warn' | 'done' | 'error'
}

const store = useDomainLearningStore()
const lines = ref<string[]>([])
const warnTexts = ref(new Set<string>())
/** 全过程输出（不截断；上限 400 行防长会话爆内存） */
const history = ref<ActivityHistoryLine[]>([])
const detailVisible = ref(false)
let unsubscribe: (() => void) | null = null
let clearTimer: number | null = null

function pushHistory(text: string, kind: ActivityHistoryLine['kind'] = 'info'): void {
  history.value.push({ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text, kind })
  if (history.value.length > 400) history.value.splice(0, history.value.length - 400)
}

function clearHistory(): void {
  history.value = []
}

const warnActive = computed(() => lines.value.some((l) => warnTexts.value.has(l)))
const isWarn = (line: string): boolean => warnTexts.value.has(line)

function clearLater(delayMs = 4000): void {
  if (props.persistOnDone) return // 轮次结束不清：留最后一屏 + 完整输出入口
  if (clearTimer !== null) window.clearTimeout(clearTimer)
  clearTimer = window.setTimeout(() => {
    lines.value = []
    warnTexts.value = new Set()
    clearTimer = null
  }, delayMs)
}

function teardown(): void {
  unsubscribe?.()
  unsubscribe = null
  if (clearTimer !== null) {
    window.clearTimeout(clearTimer)
    clearTimer = null
  }
  lines.value = []
  warnTexts.value = new Set()
  history.value = []
}

function subscribe(id: string): void {
  teardown()
  if (!id) return
  // verify 是内部核验会话（不上通道），这里用 string 集合判定，避免与 DlAgentMode 收窄打架
  const wantModes = new Set<string>(props.modes ?? ['research', 'task'])
  unsubscribe = store.subscribeAgentEvent(id, null, (ev) => {
    if (ev.mode && !wantModes.has(ev.mode)) return
    if (ev.type === 'progress' && ev.activity?.line) {
      if (clearTimer !== null) {
        window.clearTimeout(clearTimer)
        clearTimer = null
      }
      lines.value = pushActivityLine(lines.value, ev.activity.line)
      if (ev.activity.kind === 'warn') warnTexts.value = new Set([...warnTexts.value, ev.activity.line])
      pushHistory(ev.activity.line, ev.activity.kind === 'warn' ? 'warn' : 'info')
      return
    }
    // 一轮结束：留 4 秒让用户看到最后一步，再收起（完整输出 history 保留可回看）
    if (ev.type === 'reply:done') {
      pushHistory('✓ 本轮完成', 'done')
      clearLater()
    }
    if (ev.type === 'error') {
      pushHistory(`⚠ ${ev.error ?? '本轮出错'}`, 'error')
      clearLater()
    }
  })
}

watch(() => props.spaceId, (id) => subscribe(id), { immediate: true })
onBeforeUnmount(teardown)
</script>

<style scoped lang="scss">
.agent-activity {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0 2px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  border-left: 3px solid var(--el-color-primary-light-5);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);

  &.is-warn {
    border-left-color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
  }
}

.aa-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: aa-pulse 1.2s ease-in-out infinite;

  .is-warn & {
    background: var(--el-color-warning);
    animation: none;
  }
}

@keyframes aa-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.aa-lines {
  min-width: 0;
  flex: 1 1 auto;
}

.aa-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.65;

  &.is-latest {
    opacity: 1;
    color: var(--el-text-color-primary);
  }

  &.is-warn {
    color: var(--el-color-warning);
    opacity: 1;
  }
}

// 「查看完整输出」图标（行尾；悬浮浮现主色）
.aa-detail-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;

  .el-icon {
    font-size: 14px;
  }

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color);
  }
}
</style>

<style lang="scss">
// 完整输出弹窗内容（append-to-body，须用全局样式）
.aa-detail-body {
  max-height: 56vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
  line-height: 1.7;
}

.aa-detail-empty {
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 24px 0;
}

.aa-detail-line {
  display: flex;
  gap: 8px;
  align-items: baseline;

  .aa-detail-time {
    flex: 0 0 auto;
    color: var(--el-text-color-placeholder);
    font-family: var(--el-font-family, monospace);
    font-size: 11.5px;
  }

  .aa-detail-text {
    min-width: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--el-text-color-regular);
  }

  &.warn .aa-detail-text,
  &.error .aa-detail-text {
    color: var(--el-color-warning);
  }

  &.done .aa-detail-text {
    color: var(--el-color-success);
  }
}

.aa-detail-result {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);

  .aa-detail-result-head {
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 6px;
  }

  .aa-detail-result-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 12.5px;
    line-height: 1.7;
    color: var(--el-text-color-regular);
    background: var(--el-fill-color-lighter);
    border-radius: 6px;
    padding: 10px 12px;
  }
}
</style>
