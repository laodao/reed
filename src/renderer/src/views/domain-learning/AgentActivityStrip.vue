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
  </div>
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
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { pushActivityLine } from '@shared/utils/domain-learning-activity'
import { useDomainLearningStore } from '@/stores/domain-learning'

const props = defineProps<{
  spaceId: string
  /**
   * 显示哪些模式的活动（缺省 research + task：起步研究、研究此概念、补全知识地图
   * 都在这两类里；答疑 tutor 的进度走对话面板，不在本条显示）。
   */
  modes?: Array<'research' | 'task' | 'tutor'>
}>()

const store = useDomainLearningStore()
const lines = ref<string[]>([])
const warnTexts = ref(new Set<string>())
let unsubscribe: (() => void) | null = null
let clearTimer: number | null = null

const warnActive = computed(() => lines.value.some((l) => warnTexts.value.has(l)))
const isWarn = (line: string): boolean => warnTexts.value.has(line)

function clearLater(delayMs = 4000): void {
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
      return
    }
    // 一轮结束：留 4 秒让用户看到最后一步，再收起
    if (ev.type === 'reply:done' || ev.type === 'error') clearLater()
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
</style>
