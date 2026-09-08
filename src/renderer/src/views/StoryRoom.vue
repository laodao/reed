<template>
  <div class="story-room">
    <!-- 顶栏 -->
    <div class="topbar">
      <span class="back" @click="goBack">←</span>
      <span class="title">《{{ projectName }}》</span>
      <span v-if="storyType" class="tag">{{ storyType }}</span>
      <span class="spacer"></span>
      <PhaseBar
        v-if="store.state.value"
        :model-value="store.state.value.phase"
        @select="(p) => store.setPhase(p)"
      />
      <span class="tb-btn accent" @click="goEditor">✍ 写作台 ↗</span>
    </div>

    <!-- 主体：对话 + 右栏 -->
    <div class="main" v-loading="store.status.value === 'loading'">
      <div class="chat-wrap">
        <ChatCanvas
          :messages="store.messages.value"
          :stream-message="store.streamMessage.value"
          :status="store.status.value"
          :busy="store.busy.value"
          :cards="pendingCards"
          @adopt="onAdopt"
          @edit="openEdit"
          @regen="openFeedback"
          @ignore="store.ignoreCard"
        />
        <div class="composer">
          <div class="composer-inner">
            <div class="chips">
              <span v-for="c in chips" :key="c" class="chip" @click="applyChip(c)">{{ c }}</span>
            </div>
            <div class="input-row">
              <textarea
                v-model="input"
                class="input-box"
                placeholder="和主编聊：讨论故事方向、加人物、定冲突、生成大纲…（Enter 发送，Shift+Enter 换行）"
                @keydown.enter.exact.prevent="doSend"
              ></textarea>
              <button v-if="store.busy.value" class="send-btn stop" @click="store.cancel()">⏹ 停止</button>
              <button v-else class="send-btn" :disabled="!input.trim()" @click="doSend">➤ 发送</button>
            </div>
          </div>
        </div>
      </div>

      <div class="side">
        <LedgerPanel
          :ledger="store.state.value?.ledger || []"
          @op="store.ledgerOp"
          @revise="openRevise"
          @ask="askAbout"
          @distill="onDistill"
        />
        <div class="side-split"></div>
        <BiblePanel :project-id="projectId" @ask="askAbout" @open-editor="goEditor" />
      </div>
    </div>

    <!-- 账本条目轻编辑 -->
    <el-dialog v-model="reviseVisible" title="修改共识" width="460px">
      <el-input v-model="reviseTitle" placeholder="共识一句话" />
      <div class="revise-points">
        <el-input
          v-for="(_, i) in revisePoints"
          :key="i"
          v-model="revisePoints[i]"
          size="small"
          :placeholder="`支撑细节 ${i + 1}`"
        />
      </div>
      <template #footer>
        <el-button @click="reviseVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRevise">保存</el-button>
      </template>
    </el-dialog>

    <!-- 卡片轻编辑（阅读态+改一句话级别） -->
    <el-dialog v-model="editVisible" :title="`编辑卡片 · ${editCard?.title || ''}`" width="540px">
      <div class="edit-rows">
        <div v-for="(f, i) in editFields" :key="i" class="edit-row">
          <span class="edit-label">{{ f.label }}</span>
          <el-input v-model="editFields[i].value" :rows="f.value.length > 40 ? 3 : 1" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" />
        </div>
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEditAndAdopt">保存并采纳</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import ChatCanvas from '@/components/longwriting/room/ChatCanvas.vue'
import PhaseBar from '@/components/longwriting/room/PhaseBar.vue'
import LedgerPanel from '@/components/longwriting/room/LedgerPanel.vue'
import BiblePanel from '@/components/longwriting/room/BiblePanel.vue'
import { useStoryRoom } from '@/composables/useStoryRoom'
import type { ArtifactCard, ConsensusEntry } from '@shared/types/story-room.types'

defineOptions({ name: 'StoryRoom' })

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId || ''))
const store = useStoryRoom(projectId.value)

const projectName = ref('…')
const storyType = ref('')
const input = ref('')
const chips = ref<string[]>(['先定主角的动机与代价', '让主编提问', '把我们定下的整理一下'])

const reviseVisible = ref(false)
const reviseEntry = ref<ConsensusEntry | null>(null)
const reviseTitle = ref('')
const revisePoints = ref<string[]>([])

onMounted(async () => {
  await store.load()
  try {
    const res = await window.electronAPI.longwriting.getProject(projectId.value)
    if (res.success && res.data) {
      projectName.value = res.data.name
      storyType.value = (res.data as any).overview?.storyType || ''
    }
  } catch { /* 标题兜底 */ }
})

function doSend(): void {
  const text = input.value
  input.value = ''
  store.send(text)
}

function applyChip(c: string): void {
  if (c === '让主编提问') {
    store.send('（让主编提问：请根据当前进度，抛出下一个该定的尖锐问题）')
    return
  }
  if (c === '把我们定下的整理一下') {
    onDistill()
    return
  }
  input.value = c
  doSend()
}

function askAbout(text: string): void {
  input.value = `${text} `
  ;(document.querySelector('.input-box') as HTMLTextAreaElement | null)?.focus()
}

function openRevise(entry: ConsensusEntry): void {
  reviseEntry.value = entry
  reviseTitle.value = entry.title
  revisePoints.value = entry.points.length > 0 ? [...entry.points] : ['']
  reviseVisible.value = true
}

function saveRevise(): void {
  if (!reviseEntry.value) return
  store.ledgerOp({
    action: 'revise',
    entryId: reviseEntry.value.id,
    title: reviseTitle.value,
    points: revisePoints.value.filter((p) => p.trim()),
  })
  reviseVisible.value = false
}

// ==================== 提炼与卡片闭环 ====================

const pendingCards = computed(() => store.state.value?.pendingCards || [])
const distilling = ref(false)

async function onDistill(): Promise<void> {
  if (distilling.value) return
  distilling.value = true
  try {
    await store.distill()
  } finally {
    distilling.value = false
  }
}

async function onAdopt(card: ArtifactCard): Promise<void> {
  await store.adoptCard(card)
}

const editVisible = ref(false)
const editCard = ref<ArtifactCard | null>(null)
const editFields = ref<Array<{ field: string; label: string; value: string }>>([])

function openEdit(card: ArtifactCard): void {
  editCard.value = card
  const data = (card.data || {}) as Record<string, unknown>
  editFields.value = Object.entries(data)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([field, v]) => ({ field, label: field, value: String(v ?? '') }))
  editVisible.value = true
}

async function saveEditAndAdopt(): Promise<void> {
  if (!editCard.value) return
  const patch: Record<string, unknown> = {}
  for (const f of editFields.value) {
    const origin = (editCard.value.data as Record<string, unknown>)[f.field]
    if (typeof origin === 'number') {
      const n = Number(f.value)
      if (!Number.isNaN(n)) patch[f.field] = n
    } else {
      patch[f.field] = f.value
    }
  }
  const ok = await store.adoptCard(editCard.value, patch)
  if (ok) editVisible.value = false
}

async function openFeedback(card: ArtifactCard): Promise<void> {
  try {
    const res = await ElMessageBox.prompt('按什么方向重新提炼这张卡片？', '换一版', {
      confirmButtonText: '重新提炼',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：动机改成"赎罪"而不是"复仇"',
    })
    const value = (res as unknown as { value?: string }).value
    if (value?.trim()) await store.regenerateCard(card, value.trim())
  } catch {
    /* 取消 */
  }
}

function goBack(): void {
  router.push('/longwriting')
}

function goEditor(): void {
  router.push(`/story-editor/${projectId.value}`)
}
</script>

<style scoped>
.story-room {
  display: flex; flex-direction: column; height: calc(100vh - var(--header-height, 56px));
  --ka-overview: #7a8ba3; --ka-character: #cf8f3f; --ka-plot: #c66a95; --ka-faction: #7b6cc9;
  --ka-skill: #c96a6a; --ka-item: #3fa9a9; --ka-location: #5f9f62; --ka-nation: #a08050;
  --ka-camp: #b06060; --ka-outline: #5580b8;
  --sr-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.03);
  background:
    radial-gradient(820px 400px at 16% -12%, color-mix(in srgb, var(--el-color-primary) 5.5%, transparent), transparent 58%),
    var(--el-bg-color-page);
}
html.dark .story-room { --sr-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.25); }

/* 顶栏 */
.topbar {
  height: 54px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 18px;
  background: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
  backdrop-filter: blur(16px) saturate(170%); border-bottom: 1px solid var(--el-border-color-lighter);
}
.back { color: var(--el-text-color-secondary); cursor: pointer; font-size: 17px; }
.back:hover { color: var(--el-color-primary); }
.title { font-weight: 600; font-size: 15px; letter-spacing: 0.3px; }
.tag {
  font-size: 11px; padding: 2.5px 9px; border-radius: 999px; color: var(--el-color-primary);
  background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-8);
}
.spacer { flex: 1; }
.tb-btn {
  font-size: 12.5px; color: var(--el-text-color-regular); border: 1px solid var(--el-border-color);
  padding: 5px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
}
.tb-btn.accent {
  color: #fff; border-color: transparent;
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
}

/* 主体 */
.main { flex: 1; display: flex; min-height: 0; }
.chat-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }

/* 输入区 */
.composer {
  border-top: 1px solid var(--el-border-color-lighter); padding: 12px 28px 14px; flex-shrink: 0;
  background: color-mix(in srgb, var(--el-bg-color) 82%, transparent);
  backdrop-filter: blur(16px) saturate(170%);
}
.composer-inner { max-width: 820px; margin: 0 auto; }
.chips { display: flex; gap: 8px; margin-bottom: 7px; flex-wrap: wrap; }
.chip {
  font-size: 12px; color: var(--el-color-primary); background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8); border-radius: 999px; padding: 3.5px 13px;
  cursor: pointer; user-select: none; transition: all 0.15s;
}
.chip:hover { background: var(--el-color-primary-light-8); transform: translateY(-1px); }
.input-row {
  display: flex; gap: 10px; align-items: flex-end; border: 1.5px solid var(--el-border-color);
  border-radius: 14px; padding: 8px 8px 8px 16px; background: var(--el-bg-color);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-row:focus-within { border-color: var(--el-color-primary); box-shadow: 0 0 0 3px var(--el-color-primary-light-8); }
.input-box {
  flex: 1; border: none; outline: none; resize: none; height: 64px; line-height: 24px;
  font-size: 14px; font-family: inherit; background: transparent; color: var(--el-text-color-primary);
}
.input-box::placeholder { color: var(--el-text-color-placeholder); }
.send-btn {
  height: 48px; padding: 0 26px; border: none; border-radius: 12px; color: #fff; font-size: 14px;
  cursor: pointer; background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
  transition: all 0.18s;
}
.send-btn:hover { filter: brightness(1.06); }
.send-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.send-btn.stop { background: var(--el-color-danger); }

/* 右栏 */
.side {
  width: 360px; flex-shrink: 0; border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color); display: flex; flex-direction: column; min-height: 0;
}
.side-split { border-top: 1px solid var(--el-border-color-lighter); }

.revise-points { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.edit-rows { display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto; }
.edit-row { display: flex; gap: 10px; align-items: flex-start; }
.edit-label { width: 90px; flex-shrink: 0; font-size: 12.5px; color: var(--el-text-color-secondary); padding-top: 7px; text-align: right; }
</style>
