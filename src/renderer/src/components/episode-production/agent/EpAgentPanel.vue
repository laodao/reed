<template>
  <div class="ep-agent-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-title">
        <el-icon><MagicStick /></el-icon>
        <span>{{ title }}</span>
      </div>
    </div>

      <!-- 消息列表 -->
      <div ref="scrollRef" class="panel-scroll">
        <div class="inner">
          <!-- 空态 -->
          <div v-if="chat.messages.value.length === 0" class="empty">
            <div class="empty-logo"><el-icon :size="26"><MagicStick /></el-icon></div>
            <h3>你好，我是你的制作助手</h3>
            <p class="empty-desc">
              我可以帮你拆分场景、生成剧本、批量生成分镜、生成角色定妆图。<br />
              告诉我你想做什么，比如：
            </p>
            <button v-for="s in WELCOME" :key="s" class="chip" @click="onSuggestion(s)">{{ s }}</button>
          </div>

          <!-- 消息 -->
          <div v-for="msg in chat.messages.value" :key="msg.id" class="msg-row" :class="msg.role === 'user' ? 'usr' : 'ai'">
            <template v-if="msg.role === 'user'">
              <div class="bubble user-bubble">{{ msg.content }}</div>
            </template>
            <template v-else>
              <div class="ai-avatar"><el-icon><MagicStick /></el-icon></div>
              <div class="ai-body">
                <div v-if="msg.status === 'pending'" class="thinking">
                  <span class="dots"><i /><i /><i /></span>
                  <span>{{ thinkingText }}</span>
                </div>
                <div v-if="msg.content" class="bubble ai-bubble" :class="{ streaming: msg.status === 'streaming' }">
                  <span class="content">{{ msg.content }}<span v-if="msg.status === 'streaming'" class="caret" /></span>
                </div>

                <!-- 动作执行进度 -->
                <div v-if="chat.stage.value === 'acting' && msg === lastAssistant" class="action-progress">
                  <el-progress :percentage="100" :indeterminate="true" :stroke-width="3" :show-text="false" />
                  <span class="action-label">{{ chat.currentActionLabel.value || 'AI 正在生成…' }}</span>
                </div>

                <!-- 动作摘要预览 -->
                <div v-if="msg.actions && msg.actions.length > 0" class="action-summaries">
                  <div v-for="(a, i) in msg.actions" :key="i" class="action-summary" :class="a.status">
                    <el-icon class="icon">
                      <CircleCheck v-if="a.status === 'ok'" />
                      <CircleClose v-else-if="a.status === 'error'" />
                      <Remove v-else />
                    </el-icon>
                    <span class="as-text">{{ a.message }}</span>
                    <button v-if="a.nav" class="as-jump" @click="onJump(a.nav)">去查看 <el-icon :size="11"><ArrowRight /></el-icon></button>
                  </div>
                </div>

                <div v-if="msg.status === 'error' && msg.error" class="err">
                  <el-icon><WarningFilled /></el-icon>
                  <span>{{ msg.error }}</span>
                </div>

                <div v-if="msg.status === 'done' && msg.suggestions && msg.suggestions.length > 0" class="sug-row">
                  <button v-for="s in msg.suggestions" :key="s" class="chip next" @click="onSuggestion(s)">
                    {{ s }}
                    <el-icon class="chip-arrow"><ArrowRight /></el-icon>
                  </button>
                </div>

                <!-- 多轮确认：AI 请求先选候选再执行 -->
                <div v-if="chat.pendingChoice.value && msg === lastAssistant" class="choice-box">
                  <div class="choice-title">{{ chat.pendingChoice.value.prompt || '请选择：' }}</div>
                  <div class="choice-list">
                    <button
                      v-for="c in chat.pendingChoice.value.choices"
                      :key="c"
                      class="chip choice"
                      @click="onChoice(c)"
                    >
                      {{ c }}
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <div class="bottom-space" />
        </div>
      </div>

      <!-- 输入区 -->
      <div class="input-area">
        <div v-if="chat.error.value" class="input-error">{{ chat.error.value }}</div>
        <div class="input-box">
          <el-input
            v-model="draft"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 5 }"
            :placeholder="chat.sending.value ? 'AI 正在处理…' : '让助手帮你生成 / 拆分 / 批量制作…'"
            :disabled="chat.sending.value"
            resize="none"
            @keydown.enter.exact.prevent="onSend"
            @keydown.enter.shift.prevent=""
          />
          <div class="input-actions">
            <span class="hint">Enter 发送 · Shift+Enter 换行</span>
            <div class="btns">
              <el-button v-if="chat.sending.value" text size="small" class="cancel" @click="chat.cancel()">
                <el-icon><CircleClose /></el-icon> 打断
              </el-button>
              <el-button type="primary" circle class="send" :disabled="!draft.trim() || chat.sending.value" :loading="chat.sending.value" @click="onSend">
                <el-icon v-if="!chat.sending.value"><Promotion /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 剧集制作 Agent 助手面板（右侧）。
 * 事件驱动刷新：agent 动作落库 → 通过 dataChanged 通知父级重拉数据。
 * 折叠由宿主 EpisodeStudioLayout 控制（本面板不含折叠逻辑）。
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { MagicStick, ArrowRight, Promotion, CircleClose, WarningFilled, CircleCheck, Remove } from '@element-plus/icons-vue'
import { useEpAgentChat } from '@/composables/useEpAgentChat'

const props = defineProps<{
  projectId: string
  episodeId: string
  /** 界面域（script/asset-character/storyboard/compose…）：各界面独立会话与历史；宿主用 :key 随域重挂载 */
  scope?: string | null
  /** 当前上下文提示（如"当前选中场景""当前选中角色"），用于欢迎语/引导 chips */
  contextHint?: string | null
}>()

const emit = defineEmits<{
  (e: 'dataChanged', sections: string[]): void
  (e: 'navigate', target: { tab: 'script' | 'asset' | 'storyboard' | 'compose'; sceneId?: string | null; asset?: { kind: 'character' | 'location' | 'item'; id: string; name: string } | null } | null): void
}>()

/** 动作结果跳转入口：切到对应 tab / 定位 */
function onJump(nav: any): void {
  if (!nav) return
  emit('navigate', nav)
}

const chat = useEpAgentChat({
  projectId: props.projectId,
  episodeId: props.episodeId,
  // 界面域：本面板实例绑定一个 scope（宿主 EpisodeStudio 用 :key 保证换域即重挂载+重拉历史）
  scope: props.scope || undefined,
  // 随消息注入主进程 agent 快照（当前 tab/选中场景/资产——2026-09-16 S-04 上下文注入）
  contextHint: computed(() => props.contextHint ?? null),
})

const draft = ref('')
const scrollRef = ref<HTMLElement | null>(null)

const title = computed(() => {
  const hint = props.contextHint
  if (hint) return `制作助手 · ${hint}`
  return '制作助手'
})

/** 引导 chips 随 context 变化 */
const WELCOME = computed(() => {
  const hint = props.contextHint || ''
  const chips = [
    '帮我把剧本拆成场景',
    '从当前故事生成本集剧本',
  ]
  if (hint.includes('场景')) chips.push('为所有场景生成分镜')
  if (hint.includes('角色') || hint.includes('资产')) chips.push('为当前角色生成定妆图')
  if (!chips.includes('为所有场景生成分镜')) chips.push('为所有场景生成分镜')
  return chips
})

const lastAssistant = computed(() => {
  const msgs = chat.messages.value
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i]
  }
  return null
})

const thinkingText = computed(() => {
  switch (chat.stage.value) {
    case 'deciding': return 'AI 正在思考…'
    case 'acting': return chat.currentActionLabel.value || 'AI 正在生成…'
    case 'summarizing': return 'AI 正在组织回复…'
    default: return 'AI 正在处理…'
  }
})

function handleAgentEvent(ev: any): void {
  if (ev.type !== 'action:done') return
  const summary = ev.summary
  if (summary?.changed?.length) emit('dataChanged', summary.changed)
  // 动作带跳转意图 → 自动切到对应tab/定位
  if (summary?.nav) emit('navigate', summary.nav)
}

async function onSend(): Promise<void> {
  const text = draft.value.trim()
  if (!text || chat.sending.value) return
  draft.value = ''
  const unsub = subscribeAgentEvents()
  await chat.send(text)
  unsub()
  scrollToBottom()
}

function onSuggestion(text: string): void {
  if (chat.sending.value) return
  const unsub = subscribeAgentEvents()
  void chat.sendSuggestion(text).then(() => {
    unsub()
    scrollToBottom()
  })
}

/** 多轮确认：用户选定候选 → 发送带参指令执行 */
function onChoice(selected: string): void {
  const choice = chat.pendingChoice.value
  if (!choice || chat.sending.value) return
  const unsub = subscribeAgentEvents()
  void chat.sendChoice(choice, selected).then(() => {
    unsub()
    scrollToBottom()
  })
}

/** 本界面域的事件订阅（onAgentEvent 第 3 参为 scope；与后端 emit 通道同构） */
function subscribeAgentEvents(): () => void {
  return window.electronAPI.episodeProduction.onAgentEvent(
    props.projectId,
    props.episodeId,
    props.scope ?? null,
    handleAgentEvent,
  )
}

function scrollToBottom(): void {
  void nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

watch(() => chat.messages.value.length, () => scrollToBottom(), { deep: true })

onMounted(async () => {
  await chat.loadHistory()
  scrollToBottom()
})
</script>

<style lang="scss" scoped>
.ep-agent-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  min-height: 0;
  background: var(--bg-color-page);
  border-left: 1px solid var(--border-color-lighter);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  .header-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color-primary);
    .el-icon { color: var(--color-primary); }
  }
}

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 14px 6px;
}

.inner { display: flex; flex-direction: column; gap: 14px; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 12px;
  gap: 12px;
  .empty-logo {
    width: 52px; height: 52px; border-radius: 16px;
    background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary));
    color: #fff; display: flex; align-items: center; justify-content: center;
  }
  h3 { font-size: 15px; font-weight: 600; color: var(--text-color-primary); margin: 0; }
  .empty-desc { font-size: 12px; color: var(--text-color-secondary); line-height: 1.7; margin: 0; }
}

.chip, .sug-row .chip {
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color-light);
  background: var(--bg-color);
  color: var(--text-color-regular);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  &:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light-9); }
}
.chip { margin: 3px; }

.msg-row {
  display: flex;
  gap: 8px;
  animation: msg-in 0.25s ease;
  &.usr { justify-content: flex-end; }
}
@keyframes msg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.bubble { border-radius: 12px; padding: 9px 12px; font-size: 13px; line-height: 1.6; max-width: 84%; word-break: break-word; white-space: pre-wrap; }
.user-bubble { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); color: #fff; border-bottom-right-radius: 4px; }
.ai-avatar { width: 28px; height: 28px; border-radius: 8px; background: var(--fill-color); border: 1px solid var(--border-color-light); color: var(--color-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 15px; }
.ai-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ai-bubble { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-top-left-radius: 4px; &.streaming { border-color: var(--color-primary-light-5); } }
.content { white-space: pre-wrap; }
.caret { display: inline-block; width: 2px; height: 1em; background: var(--color-primary); margin-left: 2px; vertical-align: text-bottom; animation: blink 0.9s steps(2) infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

.thinking { display: flex; align-items: center; gap: 8px; color: var(--text-color-secondary); font-size: 12px; padding: 2px; }
.dots { display: inline-flex; gap: 3px; i { width: 5px; height: 5px; border-radius: 50%; background: var(--color-primary-light); animation: bounce 1.2s infinite; &:nth-child(2) { animation-delay: 0.15s; } &:nth-child(3) { animation-delay: 0.3s; } } }
@keyframes bounce { 0%,60%,100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-3px); opacity: 1; } }

.action-progress { display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; border-radius: 8px; background: var(--fill-color-lighter); border: 1px solid var(--border-color-lighter); .action-label { font-size: 11px; color: var(--text-color-secondary); } }

.action-summaries { display: flex; flex-direction: column; gap: 5px; }
.action-summary { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; color: var(--text-color-regular); padding: 6px 9px; border-radius: 8px; background: var(--fill-color-lighter); border: 1px solid var(--border-color-lighter); .icon { margin-top: 2px; color: var(--color-success); flex-shrink: 0; } &.error .icon { color: var(--color-danger); } &.skipped .icon { color: var(--text-color-placeholder); } .as-text { flex: 1; } .as-jump { border: none; background: transparent; color: var(--color-primary); font-size: 12px; cursor: pointer; flex-shrink: 0; display: inline-flex; align-items: center; gap: 2px; padding: 0; &:hover { text-decoration: underline; } } }

.err { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-danger); padding: 6px 10px; border-radius: 8px; background: var(--color-danger-light-9); }
.sug-row { display: flex; flex-wrap: wrap; gap: 6px; }
.choice-box { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 8px; background: var(--color-primary-light-9); border: 1px solid var(--color-primary-light-5); }
.choice-title { font-size: 12px; color: var(--text-color-regular); }
.choice-list { display: flex; flex-wrap: wrap; gap: 6px; }
.chip.choice { border-color: var(--color-primary-light-5); color: var(--color-primary); }
.chip-arrow { font-size: 11px; opacity: .7; }
.bottom-space { height: 6px; }

.input-area { padding: 8px 12px 12px; background: linear-gradient(180deg, transparent, var(--bg-color-page) 30%); }
.input-error { font-size: 11px; color: var(--color-danger); padding: 4px 8px; border-radius: 8px; background: var(--color-danger-light-9); margin-bottom: 6px; }
.input-box { border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-color); box-shadow: var(--shadow-md); padding: 8px 10px 6px; &:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light-9), var(--shadow-md); } :deep(.el-textarea__inner) { border: none; box-shadow: none; padding: 2px 4px; background: transparent; font-size: 13px; } }
.input-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; .hint { font-size: 10px; color: var(--text-color-placeholder); padding-left: 4px; } .btns { display: flex; align-items: center; gap: 6px; } }
.cancel { color: var(--text-color-secondary); font-size: 12px; }
.send { width: 30px; height: 30px; }
</style>
