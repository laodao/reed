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
      <span class="tb-btn" @click="showGraph = true">图谱</span>
      <span class="tb-btn" @click="showBible = true">设定集</span>
      <span class="tb-btn" @click="showSettings = true">设定</span>
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
        <!-- 矛盾教练：写作期连续性检查疑点（44 号补 UI 渲染，数据位此前已存在） -->
        <!-- 52 号 UI 优化：疑点折叠为摘要条，全量进抽屉（原平铺横幅吞掉 2/3 画布） -->
        <div v-if="store.conflicts.value.length" class="conflict-bar" @click="conflictDrawer = true">
          <span class="conflict-bar-text">⚔ 连续性检查 {{ store.conflicts.value.length }} 处待处理疑点（写作前请先核对）</span>
          <span class="conflict-bar-more">查看 ▸</span>
        </div>
        <!-- 设计任务流水（46 号：design 轮的工具动作 chip，folded 摘要一条） -->
        <div v-if="store.taskLog.value.length" class="task-log" :class="{ open: taskLogOpen }">
          <div class="task-log-summary" @click="taskLogOpen = !taskLogOpen">
            <span>任务执行 共 {{ store.taskLog.value.length }} 项 · {{ store.taskLog.value[store.taskLog.value.length - 1]?.message }}</span>
            <span class="task-log-caret">{{ taskLogOpen ? '▾' : '▸' }}</span>
          </div>
          <div v-if="taskLogOpen" class="task-log-items">
            <div v-for="(t, i) in store.taskLog.value" :key="i" class="task-log-item">
              <span class="tl-tool">{{ t.tool || 'tool' }}</span>
              <span class="tl-msg">{{ t.message }}</span>
            </div>
          </div>
        </div>
        <div v-if="draftPackage && draftPackage.items.length" class="task-log-review-row">
          <el-button size="small" type="warning" plain @click.stop="reviewDraftPackage">审核设计包（{{ draftPackage.items.length }} 项待确认）</el-button>
        </div>
        <ChatCanvas
          :messages="store.messages.value"
          :stream-message="store.streamMessage.value"
          :status="store.status.value"
          :busy="store.busy.value"
          :cards="pendingCards"
          :project-name="projectName"
          :locate-turn="locateReq"
          @adopt="onAdopt"
          @edit="openEdit"
          @regen="openFeedback"
          @ignore="store.ignoreCard"
        />
        <div class="composer">
          <div class="composer-inner">
            <!-- 52 号 UI 优化：阶段机移到输入框工具栏（原顶栏纯文字难发现），快捷 chips 移除 -->
            <div class="composer-toolbar">
              <el-dropdown trigger="click" @command="(p: string) => store.setPhase(p as never)">
                <span class="ct-btn phase-ct" :class="{ 'phase-live': store.state.value?.phase === 'writing' }">
                  阶段 · {{ phaseLabel(store.state.value?.phase || 'story-core') }}
                  <span class="ct-sub">{{ phaseIndex(store.state.value?.phase) }}/5</span>
                  ▾
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="p in ROOM_PHASE_META"
                      :key="p.id"
                      :command="p.id"
                      :class="{ 'phase-on': p.id === store.state.value?.phase }"
                    >
                      {{ p.order }} · {{ p.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-dropdown trigger="click" @command="(sc: string) => onDistill(sc as never)">
                <span class="ct-btn" :class="{ 'ct-busy': distilling }">{{ distilling ? '⏳ 提炼中…' : '⚡ 提炼 ▾' }}</span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="overview">概要卡</el-dropdown-item>
                    <el-dropdown-item command="characters">人物卡</el-dropdown-item>
                    <el-dropdown-item command="plots">故事线卡</el-dropdown-item>
                    <el-dropdown-item command="world">世界设定卡</el-dropdown-item>
                    <el-dropdown-item command="outline">大纲卡（逐卷/逐集）</el-dropdown-item>
                    <el-dropdown-item command="chapter">章节卡（写作交接）</el-dropdown-item>
                    <el-dropdown-item command="foreshadow">伏笔卡</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span v-if="store.conflicts.value.length" class="ct-btn conflict-ct" @click="conflictDrawer = true">
                ⚔ 疑点 {{ store.conflicts.value.length }}
              </span>
              <span class="ct-hint">阶段决定主编的讨论焦点与产出物；提提炼把共识整理成卡</span>
            </div>
            <div class="input-row">
              <textarea
                v-model="input"
                class="input-box"
                placeholder="随便聊：讨论故事、加人物/门派/武功、查询设定、修改已有内容、生成大纲…"
                @keydown.enter.exact.prevent="doSend"
              ></textarea>
              <button v-if="store.busy.value" class="send-btn stop" @click="store.cancel()">⏹ 停止</button>
              <button v-else class="send-btn" :disabled="!input.trim()" @click="doSend">➤ 发送</button>
            </div>
          </div>
        </div>
      </div>

      <div class="side">
        <BiblePanel
          :project-id="projectId"
          :ledger="store.state.value?.ledger || []"
          :refresh-key="bibleRefresh"
          :cards="store.state.value?.pendingCards || []"
          @op="store.ledgerOp"
          @revise="openRevise"
          @ask="askAbout"
          @distill="onDistill"
          @open-editor="goEditor"
          @locate-turn="locateTurn"
          @foreshadow-status="onForeshadowStatus"
        />
      </div>
    </div>

    <!-- 设计包确认（46 号：长程任务产物整体确认制） -->
        <el-dialog v-model="showGraph" title="知识图谱" width="92%" top="3vh" destroy-on-close class="graph-dialog">
      <GraphView :project-id="projectId" />
    </el-dialog>

    <el-dialog v-model="showBible" title="故事设定集" width="72%" top="3vh" destroy-on-close>
      <BiblePanel
        :project-id="projectId"
        :ledger="store.state.value?.ledger || []"
        :refresh-key="bibleRefresh"
        :cards="store.state.value?.pendingCards || []"
        @op="store.ledgerOp"
        @revise="openRevise"
        @ask="askAbout"
        @distill="onDistill"
        @open-editor="goEditor"
        @locate-turn="locateTurn"
        @foreshadow-status="onForeshadowStatus"
      />
    </el-dialog>

    <el-drawer v-model="conflictDrawer" title="⚔ 连续性检查疑点" size="42%" :append-to-body="true">
      <div class="conflict-drawer-list">
        <div v-for="(c, i) in store.conflicts.value" :key="i" class="conflict-item-wrap">
          <div class="conflict-item">
            <span class="conflict-rule">{{ ruleLabel(c.rule) }}</span>
            <span class="conflict-msg">{{ c.description || c.message }}</span>
            <el-button size="small" @click="askAgentFix(i)">交主编修正</el-button>
            <el-button size="small" type="primary" plain class="conflict-solve" :loading="plans[i]?.loading" @click="solveConflict(i)">
              {{ plans[i]?.loading ? '解题中…' : 'AI 解题' }}
            </el-button>
          </div>
          <div v-if="conflictLocLine(c)" class="conflict-loc">{{ conflictLocLine(c) }}</div>
          <div v-if="plans[i]?.plan || plans[i]?.error" class="conflict-plan">
            <div v-if="plans[i]?.error" class="plan-error">解题失败：{{ plans[i].error }}</div>
            <template v-else>
              <div class="plan-diagnosis"><b>诊断：</b>{{ plans[i]!.plan!.diagnosis }}</div>
              <div
                v-for="(opt, oi) in plans[i]!.plan!.options"
                :key="oi"
                class="plan-option"
                :class="{ recommended: plans[i]!.plan!.recommended === oi }"
              >
                <div class="po-head">
                  <span class="po-label">{{ recommendedTag(plans[i]!.plan!.recommended === oi) }}{{ opt.label }}</span>
                  <el-button size="small" @click="keepConflict(i)">知情保留</el-button>
                  <el-button
                    v-if="opt.action !== 'edit_chapter' && opt.action !== 'none'"
                    size="small"
                    type="primary"
                    @click="execOption(i, oi, opt)"
                  >执行</el-button>
                  <el-button v-if="opt.action === 'edit_chapter'" size="small" @click="copyEdit(opt)">复制改文</el-button>
                  <el-button v-if="opt.action === 'edit_chapter'" size="small" @click="goEditor">去写作台</el-button>
                </div>
                <div class="po-detail">{{ opt.detail }}</div>
                <div v-if="opt.editText?.text" class="po-edit">建议文本：{{ opt.editText.text }}</div>
                <div v-if="execResults[i + '-' + oi]" class="po-result">→ {{ execResults[i + '-' + oi] }}</div>
              </div>
            </template>
          </div>
        </div>
        <div v-if="!store.conflicts.value.length" class="conflict-empty">当前没有待处理疑点。</div>

        <!-- 已保留分区：保留不再只进不出，误保留可撤销；折叠避免淹没待处理项 -->
        <details v-if="store.keptConflicts.value.length" class="conflict-kept">
          <summary class="conflict-kept-summary">已保留（{{ store.keptConflicts.value.length }}）· 不拦截生成</summary>
          <div v-for="(c, i) in store.keptConflicts.value" :key="'kept-' + i" class="conflict-item-wrap">
            <div class="conflict-item kept">
              <span class="conflict-rule">{{ ruleLabel(c.rule) }}</span>
              <span class="conflict-msg">{{ c.description || c.message }}</span>
              <el-button size="small" class="conflict-solve" @click="unkeepConflict(i)">撤销保留</el-button>
            </div>
            <div v-if="c.note" class="conflict-kept-note">保留备注：{{ c.note }}</div>
          </div>
        </details>
      </div>
    </el-drawer>

    <ProjectSettingsDialog v-model:visible="showSettings" :project-id="projectId" />

<el-dialog v-model="designVisible" :title="`设计成果确认 · ${store.designReady.value?.title ?? ''}`" width="640px">
      <div class="design-hint">以下 {{ designItems.length }} 项为本轮任务的设计草稿，勾选确认后才会落库生效。</div>
      <div class="design-items">
        <label v-for="item in designItems" :key="item.id" class="design-item" :class="{ on: checkedIds.has(item.id) }">
          <input type="checkbox" :checked="checkedIds.has(item.id)" @change="toggleItem(item.id)" />
          <span class="di-kind">{{ kindLabel(item.kind) }}</span>
          <span class="di-label">{{ item.label }}</span>
          <span v-if="item.note" class="di-note">{{ item.note }}</span>
        </label>
      </div>
      <template #footer>
        <el-button @click="onDiscardDesign">整包驳回</el-button>
        <el-button type="primary" :disabled="checkedIds.size === 0" @click="onConfirmDesign">确认所选（{{ checkedIds.size }}）</el-button>
      </template>
    </el-dialog>

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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ChatCanvas from '@/components/longwriting/room/ChatCanvas.vue'
import ProjectSettingsDialog from '@/components/longwriting/ProjectSettingsDialog.vue'
import { defineAsyncComponent } from 'vue'
import BiblePanel from '@/components/longwriting/room/BiblePanel.vue'
import { useStoryRoom } from '@/composables/useStoryRoom'
import type { ArtifactCard, ConsensusEntry } from '@shared/types/story-room.types'
import { conflictLocLine, buildConflictFixMessage } from '@/utils/conflict-fix'

defineOptions({ name: 'StoryRoom' })

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId || ''))
const store = useStoryRoom(projectId.value)

const projectName = ref('…')
const storyType = ref('')
const input = ref('')

// ==================== 主编模型选择（原型顶栏「主编模型 ▾」） ====================

const providerConfigs = ref<Array<Record<string, any>>>([])
const modelSel = ref('')
/** 非对话模型（嵌入/重排/多模态生成）不能当主编——按 id/name 过滤 */
function isChatModel(m: { id?: string; name?: string; features?: string[] }): boolean {
  const blob = `${m.id || ''} ${m.name || ''}`.toLowerCase()
  if (/embed|rerank|whisper|tts|asr|video|image|audio|flux|ocr|dall|seedream|seedance|kling|wan\d|-wan/.test(blob)) return false
  if (Array.isArray(m.features) && m.features.length > 0 && !m.features.some((f) => /chat|text|completion|reason/i.test(f))) return false
  return true
}

/** 正向偏好：知名对话模型家族优先（provider 列表鱼龙混杂，负向过滤堵不完——seedream 教训） */
const KNOWN_CHAT_RE = /deepseek|qwen\d|qwen-text|glm|gpt|claude|kimi|minimax|moonshot|doubao-pro|ernie|hunyuan|step-|llama/i

function chatScore(m: { id?: string; name?: string }): number {
  return KNOWN_CHAT_RE.test(`${m.id || ''} ${m.name || ''}`) ? 1 : 0
}

const modelOptions = computed(() => {
  const out: Array<{ value: string; label: string }> = []
  for (const c of providerConfigs.value) {
    for (const m of Array.isArray(c.models) ? c.models : []) {
      if (!isChatModel(m)) continue
      out.push({ value: `${c.id}|${m.id}`, label: `${c.name} / ${m.name || m.id}`, _s: chatScore(m) } as never)
    }
  }
  // 对话模型家族排前，兜底永不落到文生图/文生视频
  return (out as Array<{ value: string; label: string; _s?: number }>)
    .sort((a, b) => (b._s ?? 0) - (a._s ?? 0))
    .map(({ value, label }) => ({ value, label }))
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

// ==================== 设计包确认（46 号：长程任务整体确认制） ====================
const taskLogOpen = ref(false)
const designVisible = ref(false)
const checkedIds = ref(new Set<string>())

// 实跑修复：设计确认弹窗只在 design:ready 事件瞬间弹出，错过（切标签/刷新）后无入口——
// 有草稿包时常驻「审核设计包」按钮，点开即复用同一确认面板
const draftPackage = computed(() => store.state.value?.designPackages?.find((p) => p.status === 'draft') ?? null)

function reviewDraftPackage(): void {
  if (!draftPackage.value) return
  store.designReady.value = draftPackage.value
}

const designItems = computed(() => store.designReady.value?.items ?? [])

// design:ready → 弹确认面板（默认全选；用户可逐项取消）
watch(
  () => store.designReady.value,
  (pkg) => {
    if (!pkg) return
    checkedIds.value = new Set(pkg.items.map((i) => i.id))
    designVisible.value = true
  },
)

function toggleItem(id: string): void {
  const next = new Set(checkedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  checkedIds.value = next
}

interface PlanOption { action: string; label: string; detail: string; editText?: { chapterName?: string; chapterNumber?: number; text: string }; applyPayload?: Record<string, unknown> }
interface ConflictPlanView { plan?: { diagnosis: string; options: PlanOption[]; recommended?: number }; error?: string; loading?: boolean }
const plans = ref<Record<number, ConflictPlanView>>({})
const execResults = ref<Record<string, string>>({})

/** 交主编修正（分级）：有 exact loc 走精确锚点；否则让主编读章自定位 */
async function askAgentFix(i: number): Promise<void> {
  const c: any = store.conflicts.value[i]
  if (!c) return
  if (store.busy.value) {
    ElMessage.warning('主编正在发言，等本轮结束后再交')
    return
  }
  await store.send(buildConflictFixMessage(c))
  conflictDrawer.value = false
}

async function solveConflict(i: number): Promise<void> {  const c: any = store.conflicts.value[i]
  if (!c) return
  plans.value[i] = { loading: true }
  try {
    const mo: any = store.modelOpts.value || {}
    const res = await window.electronAPI.longwriting.conflictPlan(
      projectId.value,
      { rule: c.rule, message: c.description || c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber },
      // IPC 结构化克隆不接受 Vue 响应式 Proxy——拆成纯值
      { providerConfigId: mo.providerConfigId, modelId: mo.modelId },
    )
    if (res.success) plans.value[i] = { plan: res.data }
    else plans.value[i] = { error: res.error || '解题失败' }
  } catch (e: any) {
    plans.value[i] = { error: e.message }
  }
}

async function keepConflict(i: number): Promise<void> {
  const c: any = store.conflicts.value[i]
  if (!c) return
  const res = await window.electronAPI.longwriting.conflictExecute(projectId.value, 'acknowledge_conflict', {
    conflict: { rule: c.rule, message: c.description || c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber, beatText: c.beatText },
    note: '作者知情保留',
  })
  if (res.success) {
    ElMessage.success('已知情保留')
    await store.loadConflictsIfWriting()
  } else {
    ElMessage.warning(res.error || '保留失败')
  }
}

/** 撤销保留：误保留的疑点恢复拦截（保留记录此前只进不出） */
async function unkeepConflict(i: number): Promise<void> {
  const c: any = store.keptConflicts.value[i]
  if (!c) return
  const res = await window.electronAPI.longwriting.conflictExecute(projectId.value, 'unacknowledge_conflict', {
    conflict: { rule: c.rule, message: c.description || c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber, beatText: c.beatText },
  })
  const msg = (res.data && res.data.message) || res.error || (res.success ? '已撤销保留' : '撤销失败')
  ElMessage[res.success ? 'success' : 'warning'](msg)
  if (res.success) await store.loadConflictsIfWriting()
}

async function execOption(i: number, oi: number, opt: PlanOption): Promise<void> {
  const c: any = store.conflicts.value[i]
  const payload = { ...(opt.applyPayload || {}), name: c.entityName || opt.editText?.chapterName, chapterNumber: c.chapterNumber }
  const res = await window.electronAPI.longwriting.conflictExecute(projectId.value, opt.action, payload)
  const msg = (res.data && res.data.message) || res.error || (res.success ? '已执行' : '执行失败')
  execResults.value[i + '-' + oi] = msg
  ElMessage[res.success ? 'success' : 'warning'](msg)
  if (res.success) {
    plans.value[i] = { ...plans.value[i] }
    await store.loadConflictsIfWriting()
  }
}

function copyEdit(opt: PlanOption): void {
  const t = opt.editText?.text || opt.detail
  navigator.clipboard?.writeText(t).then(
    () => ElMessage.success('建议文本已复制'),
    () => ElMessage.warning('复制失败，请手动选择文本'),
  )
}

function recommendedTag(rec: boolean): string {
  return rec ? '★ ' : ''
}

function ruleLabel(rule?: string): string {
  const map: Record<string, string> = {
    R1: '死亡后出场', R2: '关系失效', R3: '物品易主', R4: '技能时间线', R5: '回忆冲突',
    R6: '状态回退', R7: '钩子节拍', R8: '伏笔超期', R9: '名册外人名', R10: '大纲承诺落点',
  }
  return rule && map[rule] ? `${rule} ${map[rule]}` : (rule || '疑点')
}
function phaseIndex(phase?: string): number {
  const i = ROOM_PHASE_META.findIndex(p => p.id === phase)
  return i < 0 ? 1 : i + 1
}
function kindLabel(kind: string): string {
  switch (kind) {
    case 'card': return '卡片'
    case 'event': return '事件'
    case 'relation': return '关系'
    default: return kind
  }
}

async function onConfirmDesign(): Promise<void> {
  const ready = store.designReady.value
  if (!ready || checkedIds.value.size === 0) return
  // 防过期快照（实跑修复）：面板持有的包可能已被确认/驳回——按 id 从最新 state 重新解析，
  // 校验通过才提交，避免"确认所选"静默无效且面板卡在旧批次上
  const latest = store.state.value?.designPackages?.find((p) => p.id === ready.id)
  if (!latest || latest.status !== 'draft') {
    ElMessage.warning('该设计包已处理过，请从「审核设计包」重新打开')
    store.designReady.value = null
    return
  }
  const validIds = latest.items.filter((i) => checkedIds.value.has(i.id)).map((i) => i.id)
  if (!validIds.length) {
    store.designReady.value = latest
    checkedIds.value = new Set(latest.items.map((i) => i.id))
    ElMessage.info('草稿内容已更新，已重新勾选，请确认')
    return
  }
  checkedIds.value = new Set(validIds)
  await store.confirmDesign(ready.id, validIds)
}

async function onDiscardDesign(): Promise<void> {
  const ready = store.designReady.value
  if (!ready) return
  const yes = await ElMessageBox.confirm('整包驳回后草稿不落库（保留回看记录），确定？', '驳回设计包', { type: 'warning' }).catch(() => false)
  if (!yes) return
  // 同上：按最新 state 校验包仍是 draft，避免驳回过期快照
  const latest = store.state.value?.designPackages?.find((p) => p.id === ready.id)
  if (!latest || latest.status !== 'draft') {
    ElMessage.warning('该设计包已处理过，面板已刷新')
    store.designReady.value = null
    return
  }
  await store.discardDesign(ready.id)
}

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
  if (store.busy.value) return
  if (!modelSel.value) {
    ElMessage.warning('请先在顶栏选择主编模型（设置里可配置 AI 提供商）')
    return
  }
  const text = input.value
  input.value = ''
  store.send(text)
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
    // 查重：该项目已转过短剧则不再重复建（评审 A4）
    const existingList = await epApi.listProjectsSummary?.()
    const dup = existingList?.success && Array.isArray(existingList.data)
      ? (existingList.data as Array<Record<string, any>>).find((x) => x.longWritingProjectId === projectId.value)
      : null
    if (dup) {
      ElMessageBox.confirm(`该项目已转过短剧《${dup.name}》，是否前往？`, '已存在', { confirmButtonText: '前往', cancelButtonText: '取消', type: 'info' })
        .then(() => router.push(`/episode-production/${dup.id}`))
        .catch(() => undefined)
      return
    }

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
    if (!batch.success) {
      // 失败回删刚建的空 EP 项目（评审 A4：不留孤儿）
      await epApi.deleteProject?.(epProjectId)?.catch?.(() => undefined)
      throw new Error(batch.error || '创建分集失败')
    }

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

async function onDistill(scope?: string): Promise<void> {
  if (distilling.value) return
  distilling.value = true
  try {
    await store.distill((scope || undefined) as never)
  } finally {
    distilling.value = false
  }
}

const bibleRefresh = ref(0)
const conflictDrawer = ref(false)
const showGraph = ref(false)
const showBible = ref(false)
const showSettings = ref(false)
const GraphView = defineAsyncComponent(() => import('@/components/longwriting/graph/GraphView.vue'))

async function onForeshadowStatus(id: string, status: 'paid' | 'dropped', payoff?: number | null): Promise<void> {
  const res = await window.electronAPI.longwriting.bibleForeshadowStatus(projectId.value, id, status, payoff ?? null)
  if (res.success) {
    ElMessage.success(status === 'paid' ? '伏笔已回收' : '伏笔已弃置')
    bibleRefresh.value++
  } else {
    ElMessage.error(res.error || '操作失败')
  }
}
/** 溯源跳转：{turn, n} 变化触发 ChatCanvas 滚动定位 */
const locateReq = ref<{ turn: number; n: number } | null>(null)
let locateSeq = 0
function locateTurn(turn: number): void {
  locateReq.value = { turn, n: ++locateSeq }
}

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
  if (ok) {
    editVisible.value = false
    bibleRefresh.value++
  }
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
.phase-btn { cursor: pointer; user-select: none; }
.phase-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.phase-on { color: var(--el-color-primary); font-weight: 600; }
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
.conflict-banner { flex-shrink: 0; border-radius: 0; }
.conflict-list { margin: 4px 0 0; padding-left: 18px; font-size: 12.5px; line-height: 1.7; }

/* 设计任务流水（46 号） */
.task-log {
  flex-shrink: 0; border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter); font-size: 12px;
}
.task-log-summary {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 16px; cursor: pointer; color: var(--el-text-color-secondary);
}
.task-log-review-row {
  margin: 4px 0 6px;
  display: flex;
  justify-content: flex-end;
}

.task-log-summary:hover { color: var(--el-text-color-primary); }
.task-log-caret { flex-shrink: 0; }
.task-log-items { max-height: 150px; overflow-y: auto; padding: 0 16px 8px; }
.task-log-item { display: flex; gap: 8px; padding: 2px 0; line-height: 1.6; }
.tl-tool { flex-shrink: 0; color: var(--el-color-primary); font-size: 11px; }
.tl-msg { color: var(--el-text-color-regular); min-width: 0; }

/* 设计包确认面板（46 号） */
.design-hint { font-size: 12.5px; color: var(--el-text-color-secondary); margin-bottom: 10px; }
.design-items { max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.design-item {
  display: flex; align-items: baseline; gap: 8px; padding: 7px 10px;
  border: 1px solid var(--el-border-color-lighter); border-radius: 8px; cursor: pointer;
}
.design-item.on { border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
.di-kind { flex-shrink: 0; font-size: 11px; color: var(--el-color-primary); }
.di-label { font-size: 13px; color: var(--el-text-color-primary); min-width: 0; }
.di-note { font-size: 11.5px; color: var(--el-text-color-secondary); margin-left: auto; text-align: right; }
.gate-text { font-size: 13px; color: var(--el-text-color-primary); flex: 1; min-width: 0; }
.gate-ops { display: flex; gap: 6px; flex-shrink: 0; }
.tag.target { cursor: pointer; }
.revise-points { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.edit-rows { display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto; }
.edit-row { display: flex; gap: 10px; align-items: flex-start; }
.edit-label { width: 90px; flex-shrink: 0; font-size: 12.5px; color: var(--el-text-color-secondary); padding-top: 7px; text-align: right; }
</style>
<style scoped>
.graph-dialog :deep(.el-dialog__body) {
  height: 82vh;
  overflow: hidden;
}
.graph-dialog :deep(.el-dialog__body) > * {
  height: 100%;
}

.conflict-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  margin-bottom: 6px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-color-warning-dark-2);
}
.conflict-bar:hover { border-color: var(--el-color-warning); }
.conflict-bar-more { font-size: 12px; opacity: 0.8; }

.composer-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 8px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.ct-btn {
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
}
.ct-btn:hover { color: var(--el-color-primary); border-color: var(--el-color-primary-light-5); }
.phase-ct { font-weight: 600; }
.phase-live { color: var(--el-color-success); border-color: var(--el-color-success-light-5); }
.ct-sub { font-size: 11px; opacity: 0.65; margin-left: 2px; }
.conflict-ct { color: var(--el-color-warning-dark-2); border-color: var(--el-color-warning-light-5); }
.ct-hint { font-size: 11px; color: var(--el-text-color-placeholder); }

.conflict-drawer-list { display: flex; flex-direction: column; gap: 10px; }
.conflict-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}
.conflict-rule {
  flex: none;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-color-warning-light-8);
  color: var(--el-color-warning-dark-2);
}
.conflict-empty { color: var(--el-text-color-secondary); font-size: 13px; }
.conflict-loc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding-left: 2px;
}
.conflict-kept { margin-top: 6px; }
.conflict-kept-summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 2px;
}
.conflict-kept .conflict-item { opacity: 0.72; }
.conflict-kept .conflict-rule { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.conflict-kept-note { margin-top: 6px; font-size: 12px; color: var(--el-text-color-secondary); }


.composer-toolbar .ct-btn {
  height: 26px;
  line-height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.conflict-item-wrap { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 10px; }
.conflict-item-wrap .conflict-item { display: flex; gap: 8px; align-items: flex-start; border: none; padding: 0; }
.conflict-solve { margin-left: auto; flex: none; }
.conflict-plan { margin-top: 8px; padding: 8px 10px; background: var(--el-fill-color-light); border-radius: 6px; font-size: 13px; line-height: 1.6; }
.plan-diagnosis { margin-bottom: 6px; }
.plan-error { color: var(--el-color-danger); }
.plan-option { padding: 6px 0; border-top: 1px dashed var(--el-border-color-lighter); }
.plan-option.recommended .po-label { color: var(--el-color-warning-dark-2); font-weight: 600; }
.po-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.po-label { font-weight: 600; }
.po-detail { color: var(--el-text-color-regular); }
.po-edit { margin-top: 4px; padding: 6px 8px; background: var(--el-fill-color); border-radius: 4px; color: var(--el-text-color-secondary); }
.po-result { margin-top: 4px; color: var(--el-color-success); }

</style>
