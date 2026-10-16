<template>
  <div class="msg" :class="role">
    <div v-if="role === 'assistant'" class="avatar">主</div>
    <div class="msg-main">
      <div class="bubble">
        <div class="md" v-html="html"></div>
        <div v-if="streaming" class="caret"></div>
      </div>
      <div v-if="timeText" class="msg-time">{{ timeText }}</div>
    </div>
    <div v-if="role === 'user'" class="avatar user-avatar">我</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'RoomMessageBubble' })

const props = defineProps<{
  role: 'user' | 'assistant'
  content: string
  /** 消息时间（epoch ms）；缺省不显示（开场白/流式中） */
  timestamp?: number
  /** 流式中的消息（光标） */
  streaming?: boolean
}>()

const html = computed(() => {
  const raw = renderMarkdown(props.content || '')
  return props.role === 'user' ? escapeText(props.content) : raw
})

/** 当天只显时分，跨天带日期，跨年再带年份 */
const timeText = computed(() => {
  if (!props.timestamp) return ''
  const d = new Date(props.timestamp)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d.toDateString() === now.toDateString()) return time
  const date = `${d.getMonth() + 1}/${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? `${date} ${time}` : `${d.getFullYear()}/${date} ${time}`
})

function escapeText(t: string): string {
  const d = document.createElement('div')
  d.textContent = t
  return d.innerHTML.replace(/\n/g, '<br>')
}
</script>

<style scoped>
.msg { display: flex; margin: 16px 0; animation: fadeUp 0.25s ease both; }
.msg.user { justify-content: flex-end; }
.avatar {
  width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-weight: 600;
}
.msg.assistant .avatar {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
  color: #fff; margin-right: 12px; box-shadow: 0 2px 6px var(--el-color-primary-light-8);
}
.msg.user .avatar {
  background: var(--el-color-success-light-9); color: var(--el-color-success); margin-left: 12px;
}
.bubble {
  max-width: 100%; min-width: 0; padding: 10px 15px; border-radius: 14px; line-height: 1.8; font-size: 14px;
  word-break: break-word; overflow-wrap: anywhere;
}
.msg.assistant .bubble {
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-top-left-radius: 4px; box-shadow: var(--sr-shadow, 0 1px 2px rgba(0, 0, 0, 0.04));
}
.msg.user .bubble {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
  color: #fff; border-top-right-radius: 4px;
}
.msg-main { display: flex; flex-direction: column; min-width: 0; max-width: 88%; }
.msg-time {
  font-size: 11px; color: var(--el-text-color-secondary); margin-top: 3px; user-select: none; opacity: 0.85;
}
.msg.assistant .msg-time { text-align: left; }
.msg.user .msg-time { text-align: right; }
.md :deep(p) { margin: 4px 0; }
.md :deep(h1), .md :deep(h2), .md :deep(h3), .md :deep(h4), .md :deep(h5), .md :deep(h6) { margin: 10px 0 4px; line-height: 1.5; }
.md :deep(ul), .md :deep(ol) { margin: 4px 0 4px 18px; }
.md :deep(li) { margin: 3px 0; }
.md :deep(blockquote) { margin: 6px 0; padding: 2px 12px; border-left: 3px solid var(--el-border-color); color: var(--el-text-color-secondary); }
.md :deep(hr) { border: none; border-top: 1px solid var(--el-border-color-lighter); margin: 10px 0; }
.md :deep(a) { color: var(--el-color-primary); overflow-wrap: anywhere; }
.md :deep(img) { max-width: 100%; height: auto; }
.md :deep(code) { font-size: 12.5px; background: var(--el-fill-color-light); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
/* 代码块（占位还原的带壳块 + 裸 pre 兜底）：强制折行——窄气泡里横向滚动会撑破气泡 */
.md :deep(.md-code-block) { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; margin: 8px 0; background: var(--el-fill-color-light); }
.md :deep(.md-code-lang) { font-size: 11px; color: var(--el-text-color-secondary); padding: 3px 10px; border-bottom: 1px solid var(--el-border-color-lighter); }
.md :deep(pre) { margin: 0; padding: 8px 12px; white-space: pre-wrap; word-break: break-word; }
.md :deep(pre code) { background: transparent; padding: 0; font-size: 12.5px; line-height: 1.55; }
/* 表格：块级收缩不撑宽，单元格内容折行，超宽表格横向滚动兜底 */
.md :deep(table) { display: block; width: max-content; max-width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; overflow-x: auto; }
.md :deep(th), .md :deep(td) { border: 1px solid var(--el-border-color-lighter); padding: 4px 10px; text-align: left; overflow-wrap: anywhere; }
.md :deep(th) { background: var(--el-fill-color-light); font-weight: 600; }
.caret {
  display: inline-block; width: 7px; height: 15px; background: var(--el-color-primary);
  margin-left: 2px; vertical-align: text-bottom; animation: blink 0.9s infinite;
}
@keyframes blink { 50% { opacity: 0; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
</style>
