<template>
  <div class="qa-answer" :class="`is-${mode}`">
    <!-- 渲染态：与讲义同一套渲染管线（KaTeX 公式 / mermaid / 代码高亮 / 表格） -->
    <MarkdownViewer v-if="mode === 'render' && shownMd.trim()" :md="shownMd" compact />
    <!-- 源码态：原始 markdown 逐字展示（格式字符保留，便于核对模型到底写了什么） -->
    <pre v-else-if="mode === 'source'" class="qa-src">{{ md }}</pre>
    <!-- 流式首包未到 / 空回答：占位符（不渲染空文档，也不给无意义的切换入口） -->
    <div v-else class="qa-answer-pending">…</div>

    <!-- 逐答案切换：默认渲染态，按需看源文件（窄栏里用文字标签而非纯图标） -->
    <button
      v-if="!isEmpty"
      class="qa-mode-toggle"
      type="button"
      :title="mode === 'render' ? '查看源文件（原始 markdown）' : '切回渲染视图'"
      @click="toggleMode"
    >
      {{ mode === 'render' ? '源码' : '渲染' }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 追问回答视图（渲染 markdown ↔ 查看源文件）
 * @module views/domain-learning/QaAnswerView
 * @description 右栏「追问 · 答疑」的模型回答呈现：
 *              - 默认渲染态 = `MarkdownViewer`（与讲义同一套 bytemd 管线：公式/图/表/代码高亮），
 *                传 `compact` 用紧凑排版，避免讲义级首行缩进与大间距挤在窄气泡里；
 *              - 源码态 = 原始 markdown（`answerMd` 原文），供用户核对模型输出；
 *              - 切换粒度是「逐答案」：每轮回答各自决定，互不影响。
 *
 * 流式节流（2026-09-15）：bytemd 每次 value 变化都会全量重跑解析 + 各插件客户端渲染
 * （KaTeX 逐元素 renderToString、mermaid 逐图 render），而 tutor 回答是逐 chunk 追加的。
 * 逐 chunk 重渲染会明显拖慢右栏，故流式期间把增量**合并**到固定窗口（`STREAM_REFRESH_MS`）
 * 刷新一次；流式结束（`streaming` 转 false）时立即补齐全文，不留滞后尾巴。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MarkdownViewer from './MarkdownViewer.vue'

defineOptions({ name: 'QaAnswerView' })

const props = withDefaults(
  defineProps<{
    /** 回答原文（markdown：`dl_question.answerMd` 或流式增量拼接结果） */
    md: string
    /** 是否正在流式输出（决定是否节流刷新） */
    streaming?: boolean
  }>(),
  { streaming: false },
)

/** 当前呈现模式：render=渲染后的内容（默认），source=原始 markdown */
const mode = ref<'render' | 'source'>('render')

/** 流式刷新窗口（毫秒）：够小到读起来像实时，够大到把一段增量合并成一次重渲染 */
const STREAM_REFRESH_MS = 180

/** 交给渲染器的文本（流式期间落后于 props.md，见文件头注释） */
const shownMd = ref(props.md)
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function clearPending(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
}

function syncOrSchedule(): void {
  // 非流式（历史回看 / 已落库回答）：直接跟随，无需节流
  if (!props.streaming) {
    clearPending()
    shownMd.value = props.md
    return
  }
  // 流式中：本窗口已有待刷新则合并掉本次增量
  if (pendingTimer !== null) return
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    shownMd.value = props.md
  }, STREAM_REFRESH_MS)
}

watch(() => props.md, syncOrSchedule)
watch(() => props.streaming, syncOrSchedule)

onBeforeUnmount(clearPending)

/** 是否有内容（空文本 = 流式首包未到，给占位符） */
const isEmpty = computed(() => props.md.trim().length === 0)

function toggleMode(): void {
  mode.value = mode.value === 'render' ? 'source' : 'render'
}
</script>

<style scoped lang="scss">
.qa-answer {
  position: relative;
  min-width: 0; // 气泡内允许收缩（宽表格/长代码走自身横向滚动）

  // 源码态：等宽字体 + 保留换行，横向可滚（长行不撑破气泡）
  .qa-src {
    margin: 0;
    padding: 0;
    max-width: 100%;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--el-text-color-regular);
    text-indent: 0;
  }

  .qa-answer-pending {
    color: var(--el-text-color-placeholder);
  }

  // 切换按钮：贴答案右下角，弱化到不抢正文，悬停/聚焦才明显
  .qa-mode-toggle {
    appearance: none;
    margin-top: 4px;
    padding: 0 6px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 9px;
    background: var(--el-bg-color);
    color: var(--el-text-color-secondary);
    font-size: 11px;
    line-height: 17px;
    cursor: pointer;
    opacity: 0.65;
    transition: opacity 0.15s, color 0.15s, border-color 0.15s;

    &:hover {
      opacity: 1;
      color: var(--el-color-primary);
      border-color: var(--el-color-primary-light-5);
    }
  }

  &:hover .qa-mode-toggle {
    opacity: 1;
  }
}
</style>
