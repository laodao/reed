<template>
  <div class="msg" :class="role">
    <div v-if="role === 'assistant'" class="avatar">主</div>
    <div class="bubble">
      <div class="md" v-html="html"></div>
      <div v-if="streaming" class="caret"></div>
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
  /** 流式中的消息（光标） */
  streaming?: boolean
}>()

const html = computed(() => {
  const raw = renderMarkdown(props.content || '')
  return props.role === 'user' ? escapeText(props.content) : raw
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
  max-width: 76%; padding: 10px 15px; border-radius: 14px; line-height: 1.8; font-size: 14px;
  word-break: break-word;
}
.msg.assistant .bubble {
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-top-left-radius: 4px; box-shadow: var(--sr-shadow, 0 1px 2px rgba(0, 0, 0, 0.04));
}
.msg.user .bubble {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
  color: #fff; border-top-right-radius: 4px;
}
.md :deep(p) { margin: 4px 0; }
.md :deep(ul), .md :deep(ol) { margin: 4px 0 4px 18px; }
.md :deep(li) { margin: 3px 0; }
.md :deep(code) {
  font-size: 12.5px; background: var(--el-fill-color-light); padding: 1px 5px; border-radius: 4px;
}
.caret {
  display: inline-block; width: 7px; height: 15px; background: var(--el-color-primary);
  margin-left: 2px; vertical-align: text-bottom; animation: blink 0.9s infinite;
}
@keyframes blink { 50% { opacity: 0; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
</style>
