<template>
  <div class="story-room">
    <!-- 顶栏 -->
    <div class="topbar">
      <span class="back" @click="goBack">←</span>
      <span class="title">《{{ projectName }}》</span>
      <span v-if="storyType" class="tag">{{ storyType }}</span>
      <span v-if="store.state.value" class="tag target" @click="toggleTargetMenu">
        {{ store.state.value.contentTarget === 'script' ? '短剧剧本' : '长篇小说' }}
      </span>
      <span class="spacer"></span>
      <el-dropdown trigger="click" @command="onPickModel">
        <span class="tb-btn model-btn">主编模型：{{ modelLabel }} ▾</span>
        <template #dropdown>
          <el-dropdown-menu class="model-menu">
            <el-dropdown-item
              v-for="opt in modelOptions"
              :key="opt.value"
              :command="opt.value"
              :class="{ 'model-on': opt.value === modelSel }"
            >
              {{ opt.label }}
            </el-dropdown-item>
            <el-dropdown-item v-if="modelOptions.length === 0" disabled>暂无可用模型（设置里配置 AI 提供商）</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button v-if="canExportScript" size="small" type="warning" plain @click="exportToEp">转为短剧项目 ↗</el-button>
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
        <div v-if="store.gateSuggestion.value" class="gate-banner">
          <span class="gate-text">✦ 主编建议进入「{{ phaseLabel(store.gateSuggestion.value.toPhase) }}」：{{ store.gateSuggestion.value.reason }}</span>
          <div class="gate-ops">
            <el-button size="small" type="primary" @click="store.acceptGate()">提炼并推进</el-button>
            <el-button size="small" @click="dismissGate">继续讨论</el-button>
          </div>
        </div>
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
        <BiblePanel :project-id="projectId" :refresh-key="bibleRefresh" @ask="askAbout" @open-editor="goEditor" />
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
import { ElMessage, ElMessageBox } from 'element-plus'
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
const chips = computed(() => store.chips.value)

// ==================== 主编模型选择（原型顶栏「主编模型 ▾」） ====================

const providerConfigs = ref<Array<Record<string, any>>>([])
const modelSel = ref('')
/** 非对话模型（嵌入/重排）不能当主编——按 id/name/features 过滤 */
function isChatModel(m: { id?: string; name?: string; features?: string[] }): boolean {
  const blob = `${m.id || ''} ${m.name || ''}`.toLowerCase()
  if (/embed|embedding|rerank|whisper|tts|asr|video|image|audio|flux|ocr|dall/.test(blob)) return false
  if (Array.isArray(m.features) && m.features.length > 0 && !m.features.some((f) => /chat|text|completion|reason/i.test(f))) return false
  return true
}

const modelOptions = computed(() => {
  const out: Array<{ value: string; label: string }> = []
  for (const c of providerConfigs.value) {
    for (const m of Array.isArray(c.models) ? c.models : []) {
      if (!isChatModel(m)) continue
      out.push({ value: `${c.id}|${m.id}`, label: `${c.name} / ${m.name || m.id}` })
    }
  }
  return out
})
const modelLabel = computed(() => {
  const hit = modelOptions.value.find((o) => o.value === modelSel.value)
  if (hit) return hit.label.split(' / ')[1] || hit.label
  return modelSel.value ? '已选' : '未配置'
})

function onPickModel(v: string): void {
  modelSel.value = v
  applyModelOpts()
  const [providerConfigId, modelId] = v.split('|')
  window.electronAPI.longwriting
    .setStageModelConfig(projectId.value, 'story-room', providerConfigId, modelId)
    .catch(() => undefined)
}

function applyModelOpts(): void {
  const [providerConfigId, modelId] = modelSel.value.split('|')
  store.setModelOpts(modelSel.value ? { providerConfigId, modelId } : {})
}

async function loadModels(): Promise<void> {
  try {
    const [cfgRes, listRes] = await Promise.all([
      window.electronAPI.longwriting.getStageModelConfigs(projectId.value),
      window.electronAPI.providerConfig.list(),
    ])
    if (listRes.success && listRes.data) {
      providerConfigs.value = (listRes.data as Array<Record<string, any>>).filter((c) => c.isEnabled)
    }
    // 兜底链：story-room 专属配置 → 复用既有写作阶段配置（overview/chapter——用户配过的
    // 一定是可用对话模型）→ 第一个过滤后的模型
    if (cfgRes.success && Array.isArray(cfgRes.data)) {
      const cfgs = cfgRes.data as Array<Record<string, any>>
      const pick = (stage: string) => {
        const hit = cfgs.find((c) => c.stage === stage)
        const v = hit ? `${hit.providerConfigId}|${hit.modelId}` : ''
        return modelOptions.value.some((o) => o.value === v) ? v : ''
      }
      modelSel.value = pick('story-room') || pick('overview') || pick('chapter') || ''
    }
    if (!modelSel.value && modelOptions.value.length > 0) {
      modelSel.value = modelOptions.value[0].value
    }
    applyModelOpts()
  } catch {
    applyModelOpts()
  }
}

const reviseVisible = ref(false)
const reviseEntry = ref<ConsensusEntry | null>(null)
const reviseTitle = ref('')
const revisePoints = ref<string[]>([])

onMounted(async () => {
  await store.load()
  store.loadConflictsIfWriting()
  await loadModels()
  try {
    const res = await window.electronAPI.longwriting.getProject(projectId.value)
    if (res.success && res.data) {
      projectName.value = res.data.name
      storyType.value = (res.data as any).overview?.storyType || ''
    }
  } catch { /* 标题兜底 */ }
})

function doSend(): void {
  if (!modelSel.value) {
    ElMessage.warning('请先在顶栏选择主编模型（设置里可配置 AI 提供商）')
    return
  }
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

// ==================== 阶段门 / 内容目标 / 转短剧桥 ====================

import { ROOM_PHASE_META } from '@/components/longwriting/room/roomKinds'

function phaseLabel(id: string): string {
  return ROOM_PHASE_META.find((p) => p.id === id)?.label || id
}

function dismissGate(): void {
  store.gateSuggestion.value = null
}

const targetMenuVisible = ref(false)
function toggleTargetMenu(): void {
  targetMenuVisible.value = !targetMenuVisible.value
  if (!targetMenuVisible.value) return
  const next = store.state.value?.contentTarget === 'script' ? 'novel' : 'script'
  ElMessageBox.confirm(`内容目标将切换为「${next === 'script' ? '短剧剧本' : '长篇小说'}」，大纲阶段策略随之改变。确认？`, '切换内容目标', {
    confirmButtonText: '切换', cancelButtonText: '取消', type: 'info',
  })
    .then(() => store.setTarget(next as 'novel' | 'script'))
    .catch(() => undefined)
    .finally(() => { targetMenuVisible.value = false })
}

/** 转短剧桥（设计文档 §6.2 v2.1 定案：渲染层编排，零后端改动） */
const canExportScript = computed(
  () => store.state.value?.contentTarget === 'script'
    && (store.state.value?.pendingCards || []).some((c) => c.kind === 'outline' && c.status === 'adopted'),
)

async function exportToEp(): Promise<void> {
  try {
    const epApi = window.electronAPI.episodeProduction
    // 0) 先校验分集卡（评审 P2-16：空时不要先建出孤儿剧集项目）
    const adoptedEpisodes = (store.state.value?.pendingCards || [])
      .filter((c) => c.kind === 'outline' && c.status === 'adopted' && c.data?.index)
      .sort((a, b) => Number(a.data.index) - Number(b.data.index))
    if (adoptedEpisodes.length === 0) {
      ElMessage.warning('没有已定稿的分集大纲卡——先逐集提炼并采纳')
      return
    }
    const overviewRes = await window.electronAPI.longwriting.getStoryOverview(projectId.value)
    const overview = overviewRes.success ? overviewRes.data : null

    // 1) 建剧集项目（回链长文项目）
    const created = await epApi.createProject(projectName.value, projectId.value, {
      styleAnchors: storyType.value ? [storyType.value] : [],
    })
    if (!created.success) throw new Error(created.error || '创建剧集项目失败')
    const epProjectId = created.data?.id ?? (created.data as any)

    // 2) 每集种子：概要+人物小传+故事线+该集大纲（uploaded 模式，单集 ≤15000 字）
    const episodes = adoptedEpisodes.map((c) => {
      const d = c.data as Record<string, any>
      const parts = [
        `【作品概要】${overview?.summary || ''}`,
        `【人物】${(d.characters || []).join('、')}`,
        `【本集钩子】${d.hook || ''}`,
        `【本集反转/卡点】${d.reversal || ''}`,
        `【场景】${(d.scenes || []).map((sc: any) => `${sc.name}（${sc.timeOfDay || ''}）：${sc.summary || ''}`).join('；')}`,
      ]
      return { title: `第${d.index}集 ${d.title || ''}`.trim(), content: parts.filter(Boolean).join('\n').slice(0, 15000) }
    })
    const batch = await epApi.batchCreateEpisodes({ projectId: epProjectId, episodes })
    if (!batch.success) throw new Error(batch.error || '创建分集失败')

    ElMessageBox.confirm(`已创建剧集项目《${projectName.value}》与 ${episodes.length} 个分集（种子文本就绪）。现在去 EpisodeStudio 逐集生成剧本？`, '转短剧成功', {
      confirmButtonText: '前往 EpisodeStudio', cancelButtonText: '留在研讨室', type: 'success',
    })
      .then(() => router.push(`/episode-production/${epProjectId}`))
      .catch(() => undefined)
  } catch (e: any) {
    ElMessage.error(e?.message || '转短剧失败')
  }
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

const bibleRefresh = ref(0)

async function onAdopt(card: ArtifactCard): Promise<void> {
  const ok = await store.adoptCard(card)
  if (ok) {
    bibleRefresh.value++ // 圣经面板重拉（评审 P2-18：采纳后面板刷新）
    if (card.kind === 'chapter') goEditorChapters()
  }
}

function goEditorChapters(): void {
  router.push({ path: `/story-editor/${projectId.value}`, query: { stage: 'chapters' } })
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
.model-btn { cursor: pointer; user-select: none; }
.model-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.model-on { color: var(--el-color-primary); font-weight: 600; }
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

.gate-banner {
  display: flex; align-items: center; gap: 12px; padding: 9px 16px; flex-shrink: 0;
  background: var(--el-color-warning-light-9, #faf4ec); border-bottom: 1px solid var(--el-border-color-lighter);
}
.gate-text { font-size: 13px; color: var(--el-text-color-primary); flex: 1; min-width: 0; }
.gate-ops { display: flex; gap: 6px; flex-shrink: 0; }
.tag.target { cursor: pointer; }
.revise-points { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.edit-rows { display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto; }
.edit-row { display: flex; gap: 10px; align-items: flex-start; }
.edit-label { width: 90px; flex-shrink: 0; font-size: 12.5px; color: var(--el-text-color-secondary); padding-top: 7px; text-align: right; }
</style>
