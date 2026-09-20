<template>
  <div class="brain-panel">
    <!-- 顶部状态条：标题 + 启用开关 + 可点击统计 + 设置入口 -->
    <header class="bp-header">
      <div class="bp-title">
        <span class="bp-name">知识大脑</span>
        <el-switch v-model="enabled" size="small" :loading="enabling" @change="toggleEnabled" />
        <el-tag :type="enabled ? 'success' : 'info'" size="small" effect="light" round>
          {{ enabled ? '运行中' : '未启用' }}
        </el-tag>
      </div>
      <div class="bp-stats">
        <button type="button" class="bp-stat" :class="{ active: statActive === 'total' }" @click="showAtoms('all')">
          <b>{{ stats?.atoms?.total ?? '—' }}</b>
          <span>论断</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'human' }" @click="showAtoms('human')">
          <b>{{ stats?.atoms?.humanOrigin ?? '—' }}</b>
          <span>我的观感</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'cards' }" @click="showCards()">
          <b>{{ stats?.notes?.published ?? '—' }}</b>
          <span>经验卡</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'proposals' }" @click="showProposals()">
          <b>{{ proposalTotal }}</b>
          <span>待审提议</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'open' }" @click="showAtoms('open-question')">
          <b>{{ stats?.openQuestions ?? '—' }}</b>
          <span>悬而未决</span>
        </button>
      </div>
      <el-button size="small" @click="openConfig">
        <el-icon><Setting /></el-icon>
        设置
      </el-button>
    </header>

    <!-- 主体双栏：左=主内容区（视图切换），右=提炼目标/待审提议/待提取文档 -->
    <div class="bp-body">
      <div class="bp-main">
        <!-- 论断视图 -->
        <template v-if="activeView === 'atoms'">
          <div class="bp-main-toolbar">
            <el-radio-group v-model="atomFilter" size="small" @change="onAtomFilterChange">
              <el-radio-button value="all">全部论断</el-radio-button>
              <el-radio-button value="human">我的观感</el-radio-button>
              <el-radio-button value="opinions">AI观点</el-radio-button>
              <el-radio-button value="open-question">悬而未决</el-radio-button>
            </el-radio-group>
            <el-button size="small" type="primary" plain style="margin-left: auto" @click="openRemark">
              <el-icon><Edit /></el-icon>
              记观感
            </el-button>
          </div>
          <div class="atoms-table-region">
            <el-table
              :data="atoms"
              height="100%"
              :empty-text="atomsEmptyText"
              style="width: 100%"
            >
              <el-table-column type="index" label="序号" width="60" align="center" :index="atomIndex" />
              <el-table-column prop="statement" label="论断" min-width="280">
                <template #default="{ row }">
                  <el-tooltip v-if="row.sourceQuote" :content="row.sourceQuote" placement="top" :show-after="200">
                    <span class="stmt">{{ row.statement }}</span>
                  </el-tooltip>
                  <span v-else class="stmt">{{ row.statement }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="90">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain">{{ row.type }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="来源文档" width="130">
                <template #default="{ row }">
                  <el-tooltip v-if="row.documentName" :content="row.documentName" placement="top" :show-after="200">
                    <span class="doc-src">{{ shortDocName(row.documentName) }}</span>
                  </el-tooltip>
                  <span v-else class="muted">—</span>
                </template>
              </el-table-column>
              <el-table-column prop="useCount" label="被用" width="60" align="center" />
            </el-table>
          </div>
          <div v-if="atomTotal > 0" class="atoms-pagination-bar">
            <el-pagination
              :current-page="atomPage"
              :page-size="atomPageSize"
              :page-sizes="[20, 50, 100]"
              :total="atomTotal"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="handleAtomPageChange"
              @size-change="handleAtomPageSizeChange"
            />
          </div>
        </template>

        <!-- 经验卡视图 -->
        <template v-else-if="activeView === 'cards'">
          <div class="bp-main-toolbar">
            <span class="bp-main-title">经验卡</span>
            <span class="bp-main-hint">已入库的提炼经验，写作链路可检索引用</span>
          </div>
          <div class="cards-region">
            <div v-if="notes.length === 0" class="side-empty">
              暂无经验卡——在右侧「提炼目标」中运行提炼，生成的卡经审批后入库
            </div>
            <div v-for="n in notes" :key="n.id" class="note-card">
              <div class="n-head">
                <span class="n-title">{{ n.title }}</span>
                <el-tag size="small" effect="plain">{{ n.type }}</el-tag>
              </div>
              <div class="n-desc">{{ n.description }}</div>
              <el-collapse v-if="n.body" class="n-body-collapse">
                <el-collapse-item :title="`正文（${n.body.length} 字）`" :name="n.id">
                  <pre class="n-body">{{ n.body }}</pre>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
          <div v-if="notesTotal > notesPageSize" class="atoms-pagination-bar">
            <el-pagination
              :current-page="notesPage"
              :page-size="notesPageSize"
              :total="notesTotal"
              layout="total, prev, pager, next"
              background
              @current-change="handleNotesPageChange"
            />
          </div>
        </template>

        <!-- 待审提议视图 -->
        <template v-else>
          <div class="bp-main-toolbar">
            <span class="bp-main-title">待审提议</span>
            <span class="bp-main-hint">批准后经验卡正式入库，拒绝则归档留痕</span>
          </div>
          <div class="cards-region">
            <div v-if="proposals.length === 0" class="side-empty">暂无待审提议</div>
            <div v-for="p in proposals" :key="p.id" class="note-card">
              <div class="n-head">
                <span class="n-title">{{ p.title }}</span>
                <el-tag size="small" type="warning" effect="light">待审</el-tag>
              </div>
              <div class="n-desc">{{ p.description }}</div>
              <pre v-if="p.body" class="n-body preview">{{ p.body }}</pre>
              <div class="p-actions">
                <el-button size="small" @click="decide(p.id, 'reject')">拒绝</el-button>
                <el-button size="small" type="primary" @click="decide(p.id, 'publish')">批准入库</el-button>
              </div>
            </div>
          </div>
          <div v-if="proposalTotal > inboxPageSize" class="atoms-pagination-bar">
            <el-pagination
              :current-page="inboxPage"
              :page-size="inboxPageSize"
              :total="proposalTotal"
              layout="total, prev, pager, next"
              background
              @current-change="handleInboxPageChange"
            />
          </div>
        </template>
      </div>

      <aside class="bp-side">
        <!-- 提炼目标 -->
        <section class="side-card">
          <header class="side-head">
            <span class="side-title">提炼目标</span>
            <el-button link type="primary" size="small" @click="openConfig">管理</el-button>
          </header>
          <div v-if="enabledGoals.length === 0" class="side-empty">暂无目标，点击「管理」添加</div>
          <div v-for="g in enabledGoals" :key="g.id" class="goal-run" :title="g.hint">
            <div class="goal-run-info">
              <span class="goal-run-name">{{ g.name }}</span>
              <span class="goal-run-hint">{{ g.hint }}</span>
            </div>
            <el-button
              size="small"
              :loading="runningGoalIds.includes(g.id)"
              @click="runGoal(g)"
            >
              {{ runningGoalIds.includes(g.id) ? '提炼中' : '提炼' }}
            </el-button>
          </div>
          <div v-if="enabledGoals.length > 0" class="side-tip">
            基于全书章节摘要提炼，约需一至十几分钟；完成后经验卡出现在「待审提议」。
          </div>
        </section>

        <!-- 待审提议（快捷审批；完整分页在主区「待审提议」视图） -->
        <section class="side-card">
          <header class="side-head">
            <span class="side-title">
              待审提议
              <span v-if="proposalTotal > 0" class="side-count">{{ proposalTotal }}</span>
            </span>
            <el-button link type="primary" size="small" @click="showProposals()">查看全部</el-button>
          </header>
          <div v-if="proposals.length === 0" class="side-empty">暂无待审提议</div>
          <div v-for="p in proposals" :key="p.id" class="proposal">
            <div class="p-title">{{ p.title }}</div>
            <div class="p-desc">{{ p.description }}</div>
            <div class="p-actions">
              <el-button size="small" @click="decide(p.id, 'reject')">拒绝</el-button>
              <el-button size="small" type="primary" @click="decide(p.id, 'publish')">批准入库</el-button>
            </div>
          </div>
        </section>

        <!-- 论断整理 -->
        <section class="side-card">
          <header class="side-head">
            <span class="side-title">论断整理</span>
          </header>
          <div class="side-tip" style="margin: 0 0 8px">
            AI 分批审读论断池，把同主题的细碎碎片合并为综合论断（如「主要法宝」逐条罗列→一条）；
            被合并的原论断归档可查回。
          </div>
          <el-button
            v-if="!consolidateRunning"
            size="small"
            type="warning"
            plain
            style="width: 100%"
            @click="startConsolidate"
          >
            归纳整理
          </el-button>
          <template v-else>
            <el-progress :percentage="consolidatePct" :stroke-width="6" />
            <div class="side-tip">
              归纳中… 批次 {{ consolidateProgress?.processedBatches ?? 0 }}/{{ consolidateProgress?.totalBatches ?? 0 }}，已合并
              {{ consolidateProgress?.mergedGroups ?? 0 }} 组
            </div>
          </template>
          <div v-if="consolidateSummary && !consolidateRunning" class="side-tip">
            上次归纳：合并 {{ consolidateSummary.mergedGroups }} 组，归档 {{ consolidateSummary.supersededAtoms }} 条
          </div>
        </section>

        <!-- 待提取文档（开脑前上传的存量，有才显示） -->
        <section v-if="pendingDigestDocs.length > 0" class="side-card">
          <header class="side-head">
            <span class="side-title">待提取文档</span>
            <el-button size="small" type="primary" plain :loading="digestAllBusy" @click="digestAll">
              全部提取
            </el-button>
          </header>
          <div v-for="d in pendingDigestDocs" :key="d.id" class="doc-run">
            <span class="doc-run-name" :title="d.name">{{ d.name }}</span>
            <el-button size="small" :loading="!!d.busy" @click="digestOne(d)">
              {{ d.busy ? '提取中' : '提取' }}
            </el-button>
          </div>
        </section>
      </aside>
    </div>

    <!-- 设置抽屉 -->
    <el-drawer v-model="configOpen" title="大脑设置" size="600px" :close-on-click-modal="false">
      <div class="cfg-body">
        <section class="cfg-section">
          <h4>基础</h4>
          <div class="cfg-row">
            <label class="cfg-label">
              启用知识大脑
              <span class="cfg-desc">总开关；关闭后暂停消化与提炼</span>
            </label>
            <el-switch v-model="configDraft.enabled" />
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              自动消化新文档
              <span class="cfg-desc">上传文档后自动原子化 + 裁决</span>
            </label>
            <el-switch v-model="configDraft.digestion.enabled" />
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              情节模式卡归纳
              <span class="cfg-desc">实验性，成本较高</span>
            </label>
            <el-switch v-model="configDraft.patterns.plotEnabled" />
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              自动入库阈值
              <span class="cfg-desc">论断置信度不低于该值直接入库，否则进待审提议</span>
            </label>
            <el-input-number
              v-model="configDraft.autoApproveThreshold"
              :min="0"
              :max="1"
              :step="0.05"
              size="small"
            />
          </div>
        </section>

        <section class="cfg-section">
          <h4>模型</h4>
          <div class="cfg-row">
            <label class="cfg-label">
              原子化模型
              <span class="cfg-desc">从章节原文提取知识论断</span>
            </label>
            <el-select
              v-model="configDraft.models.atomize"
              placeholder="跟随宿主模型"
              clearable
              value-on-clear=""
              size="small"
              style="width: 240px"
            >
              <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              裁决 / 提炼模型
              <span class="cfg-desc">论断查重裁决与经验卡归纳</span>
            </label>
            <el-select
              v-model="configDraft.models.adjudicate"
              placeholder="跟随宿主模型"
              clearable
              value-on-clear=""
              size="small"
              style="width: 240px"
            >
              <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </div>
        </section>

        <section class="cfg-section">
          <h4>提取目标</h4>
          <div class="cfg-desc" style="margin-bottom: 8px">
            经验提炼的维度，按项目类型定义；保存后在右侧「提炼目标」中运行
          </div>
          <div class="cfg-goals-actions">
            <el-select
              v-model="presetPick"
              placeholder="从模板添加…"
              size="small"
              style="width: 220px"
              @change="addGoalFromPreset"
            >
              <el-option-group v-for="g in presetGroups" :key="g.group" :label="g.group">
                <el-option v-for="(p, i) in g.goals" :key="g.group + i" :label="p.name" :value="g.group + '|' + p.name" />
              </el-option-group>
            </el-select>
            <el-button size="small" @click="addCustomGoal">新建</el-button>
          </div>
          <div v-for="(g, gi) in configDraft.goals" :key="g.id" class="goal-edit">
            <div class="goal-edit-head">
              <el-checkbox v-model="g.enabled" size="small" />
              <el-input v-model="g.name" size="small" placeholder="目标名称" style="flex: 1" />
              <el-button size="small" text type="danger" @click="configDraft.goals.splice(gi, 1)">删除</el-button>
            </div>
            <el-input
              v-model="g.hint"
              type="textarea"
              :rows="4"
              size="small"
              placeholder="提炼指引：要提取什么经验、如何组织成卡"
            />
          </div>
          <div v-if="configDraft.goals.length === 0" class="side-empty">暂无目标——从模板添加或新建</div>
        </section>
      </div>
      <template #footer>
        <div class="cfg-actions">
          <el-button @click="discardConfig">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveConfig">保存</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 记观感（human origin 论断录入） -->
    <el-dialog v-model="remarkOpen" title="记观感" width="480px" :close-on-click-modal="false">
      <div class="rf-body">
        <div class="rf-label">
          我的观感
          <span class="rf-req">*</span>
        </div>
        <el-input
          v-model="remarkText"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="写下你对这本书的判断与喜好，例如：我喜欢反派智斗多于正面对轰；金手指后期不能失控膨胀"
        />
        <div class="rf-label" style="margin-top: 12px">关联文档（可选）</div>
        <el-select v-model="remarkDocId" clearable placeholder="不关联具体文档" style="width: 100%">
          <el-option v-for="d in allDocs" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <div class="rf-label" style="margin-top: 12px">原文引用（可选）</div>
        <el-input v-model="remarkQuote" maxlength="200" placeholder="触动你产生这条观感的原文片段" />
      </div>
      <template #footer>
        <div class="cfg-actions">
          <el-button @click="remarkOpen = false">取消</el-button>
          <el-button type="primary" :loading="remarkBusy" @click="saveRemark">保存观感</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { KB_BRAIN_GOAL_PRESETS } from '@shared/constants/kb-brain-goal-presets'

const props = defineProps<{ kbId: string }>()
const emit = defineEmits<{ (e: 'stats', count: number): void }>()
let requestGen = 0 // kbId 快速切换时丢弃过期响应

interface BrainAtom {
  id: string
  statement: string
  type: string
  status: string
  lensNoteId: string | null
  origin: string
  useCount: number
  sourceDocumentId: string | null
  documentName: string | null
  sourceChapterHash: string | null
  sourceQuote: string
}
interface BrainNote {
  id: string
  title: string
  description: string
  body: string
  type: string
  status: string
}
interface BrainGoal {
  id: string
  name: string
  hint: string
  enabled: boolean
}
interface BrainConfig {
  enabled: boolean
  digestion: { enabled: boolean }
  patterns: { plotEnabled: boolean }
  autoApproveThreshold: number
  models: { atomize: string; adjudicate: string }
  goals: BrainGoal[]
}
const modelOptions = ref<Array<{ label: string; value: string }>>([])

const stats = ref<Record<string, any> | null>(null)

// ===== 主区视图：论断 / 经验卡 / 待审提议 =====
type MainView = 'atoms' | 'cards' | 'proposals'
type AtomFilter = 'all' | 'human' | 'opinions' | 'open-question'
const activeView = ref<MainView>('atoms')
const atomFilter = ref<AtomFilter>('all')

const atoms = ref<BrainAtom[]>([])
const atomPage = ref(1)
const atomPageSize = ref(50)
const atomTotal = ref(0)
let atomsGen = 0 // 论断列表独立代际：翻页请求与刷新竞态时丢弃过期响应

const notes = ref<BrainNote[]>([])
const notesPage = ref(1)
const notesPageSize = 10
const notesTotal = ref(0)
let notesGen = 0 // 经验卡列表代际守卫：切库/快速翻页竞态时丢弃过期响应

const proposals = ref<BrainNote[]>([])
const proposalTotal = ref(0)
const inboxPage = ref(1)
const inboxPageSize = 20
let inboxGen = 0 // 待审提议列表代际守卫（同上）

const config = ref<BrainConfig | null>(null)
const configDraft = ref<BrainConfig>({
  enabled: false,
  digestion: { enabled: true },
  patterns: { plotEnabled: false },
  autoApproveThreshold: 0.8,
  models: { atomize: '', adjudicate: '' },
  goals: [],
})
const configOpen = ref(false)
const saving = ref(false)
const enabled = ref(false)
const enabling = ref(false)
interface DigestDoc {
  id: string
  name: string
  busy?: boolean
}
const pendingDigestDocs = ref<DigestDoc[]>([])
const digestAllBusy = ref(false)
// 全量文档清单（记观感的关联文档下拉用，与待提取列表分开）
const allDocs = ref<Array<{ id: string; name: string }>>([])

// ===== 记观感（human origin 论断录入） =====
const remarkOpen = ref(false)
const remarkText = ref('')
const remarkDocId = ref('')
const remarkQuote = ref('')
const remarkBusy = ref(false)

// ===== 论断归纳整理 =====
interface ConsolidateProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  mergedGroups: number
  supersededAtoms: number
  failedBatches: number
  lastError?: string
}
const consolidateRunning = ref(false)
const consolidateProgress = ref<ConsolidateProgress | null>(null)
const consolidateSummary = ref<{ mergedGroups: number; supersededAtoms: number } | null>(null)
let consolidatePollTimer: ReturnType<typeof setInterval> | null = null
const consolidatePct = computed(() => {
  const p = consolidateProgress.value
  if (!p || p.totalBatches === 0) return 0
  return Math.min(100, Math.round((p.processedBatches / p.totalBatches) * 100))
})

// ===== 提取目标 =====
const presetGroups = KB_BRAIN_GOAL_PRESETS
const presetPick = ref('')
const enabledGoals = computed(() => (config.value?.goals ?? []).filter((g) => g.enabled))
const runningGoalIds = ref<string[]>([])
const lastGoalResults = ref<Record<string, { ok: boolean; error?: string; proposed?: boolean; skippedDuplicate?: boolean; cardTitle?: string | null; fragments?: number; cards?: number }>>({})
let goalPollTimer: ReturnType<typeof setInterval> | null = null

// 顶部统计块的高亮态：与主区视图联动
const statActive = computed(() => {
  if (activeView.value === 'cards') return 'cards'
  if (activeView.value === 'proposals') return 'proposals'
  if (atomFilter.value === 'human') return 'human'
  if (atomFilter.value === 'open-question') return 'open'
  return 'total'
})

const atomsEmptyText = computed(() => {
  if (!enabled.value) return '大脑未启用，打开顶部开关后上传文档自动消化'
  if (atomFilter.value === 'human') return '暂无我的观感——点击右上角「记观感」写下你自己的判断'
  if (atomFilter.value === 'opinions') return '暂无 AI 观点类论断（claim/insight 随消化产出）'
  if (atomFilter.value === 'open-question') return '暂无悬而未决的问题'
  return '尚未消化出论断（上传文档后自动进行）'
})

/** 文档名展示缩短：去扩展名与括注噪音，全名在 tooltip */
function shortDocName(name: string): string {
  const s = name.replace(/\.[a-z0-9]+$/i, '').replace(/[（(【[][^）)】\]]*[）)】\]]/g, '').trim()
  return s || name
}

function showAtoms(filter: AtomFilter): void {
  activeView.value = 'atoms'
  if (atomFilter.value !== filter) {
    atomFilter.value = filter
    atomPage.value = 1
    void fetchAtoms()
  }
}

function showCards(): void {
  activeView.value = 'cards'
  notesPage.value = 1
  void fetchNotes()
}

function showProposals(): void {
  activeView.value = 'proposals'
  inboxPage.value = 1
  void fetchProposals()
}

function onAtomFilterChange(): void {
  atomPage.value = 1
  void fetchAtoms()
}

function addGoalFromPreset(val: string): void {
  const [group, name] = val.split('|')
  const preset = presetGroups.find((g) => g.group === group)?.goals.find((p) => p.name === name)
  if (!preset) return
  configDraft.value.goals.push({ id: genGoalId(), name: preset.name, hint: preset.hint, enabled: true })
  presetPick.value = ''
}

function addCustomGoal(): void {
  configDraft.value.goals.push({ id: genGoalId(), name: '新目标', hint: '要提取什么经验、如何组织成卡', enabled: true })
}

function genGoalId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

async function runGoal(g: BrainGoal): Promise<void> {
  if (runningGoalIds.value.includes(g.id)) return
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.goalRun({ kbId: props.kbId, goalId: g.id })
    if (!res.success) {
      ElMessage.error(res.error || '提炼启动失败')
      return
    }
    runningGoalIds.value = [...runningGoalIds.value, g.id]
    ElMessage.info(`「${g.name}」提炼已开始，完成后出现在待审提议`)
    startGoalPoll()
  } catch (e) {
    ElMessage.error(`提炼启动失败: ${(e as Error).message}`)
  }
}

function startGoalPoll(): void {
  if (goalPollTimer) return
  goalPollTimer = setInterval(pollGoalStatus, 8000)
  void pollGoalStatus()
}

async function pollGoalStatus(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.goalStatus(props.kbId)
    if (res.success && res.data) {
      const prev = [...runningGoalIds.value]
      runningGoalIds.value = res.data.running as string[]
      lastGoalResults.value = res.data.last ?? {}
      // 刚完成的：报结果
      for (const id of prev) {
        if (!runningGoalIds.value.includes(id)) reportGoalDone(id)
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (runningGoalIds.value.length === 0 && goalPollTimer) {
    clearInterval(goalPollTimer)
    goalPollTimer = null
  }
}

function reportGoalDone(goalId: string): void {
  const rec = lastGoalResults.value[goalId]
  const name = config.value?.goals.find((g) => g.id === goalId)?.name ?? goalId
  if (!rec) return
  if (!rec.ok) ElMessage.error(`「${name}」提炼失败: ${rec.error || '未知错误'}`)
  else if (rec.skippedDuplicate) ElMessage.info(`「${name}」已有同题经验卡，未重复生成`)
  else if (rec.proposed) ElMessage.success(`「${name}」生成 ${rec.cards ?? 1} 张经验卡（素材 ${rec.fragments ?? 0} 条），待审提议中`)
  void refresh()
}

onBeforeUnmount(() => {
  if (goalPollTimer) clearInterval(goalPollTimer)
  goalPollTimer = null
  if (consolidatePollTimer) clearInterval(consolidatePollTimer)
  consolidatePollTimer = null
})

function statusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  switch (status) {
    case 'supported':
      return 'success'
    case 'proposed':
    case 'suspected':
      return 'warning'
    case 'stale':
    case 'superseded':
    case 'archived':
      return 'info'
    default:
      return 'info'
  }
}

/** 跨页连续序号：第 N 页从 (N-1)*pageSize+1 起编 */
function atomIndex(index: number): number {
  return (atomPage.value - 1) * atomPageSize.value + index + 1
}

async function fetchAtoms(): Promise<void> {
  if (!props.kbId) return
  const gen = ++atomsGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.listAtoms({
      kbId: props.kbId,
      page: atomPage.value,
      pageSize: atomPageSize.value,
      origin: atomFilter.value === 'human' ? 'human' : undefined,
      type: atomFilter.value === 'open-question' ? 'open-question' : undefined,
      types: atomFilter.value === 'opinions' ? ['claim', 'insight'] : undefined,
    })
    if (gen !== atomsGen) return // 过期响应丢弃
    if (res.success && res.data) {
      atoms.value = res.data.rows as BrainAtom[]
      atomTotal.value = res.data.total
      // 父组件页签徽标语义是库内论断总数——过滤视图（我的观感/悬而未决）不上报子集数
      if (atomFilter.value === 'all') emit('stats', res.data.total)
      // 数据收缩后当前页可能越界（重消化/清理后论断变少）：回退到有效末页重取
      const maxPage = Math.max(1, Math.ceil(atomTotal.value / atomPageSize.value))
      if (atomPage.value > maxPage) {
        atomPage.value = maxPage
        void fetchAtoms()
      }
    }
  } catch (e) {
    console.warn('[BrainPanel] 论断列表加载失败', e)
  }
}

async function fetchNotes(): Promise<void> {
  if (!props.kbId) return
  const gen = ++notesGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.listNotes({ kbId: props.kbId, status: 'published', page: notesPage.value, pageSize: notesPageSize })
    if (gen !== notesGen) return // 过期响应丢弃
    if (res.success && res.data) {
      notes.value = res.data.rows as BrainNote[]
      notesTotal.value = res.data.total
    }
  } catch (e) {
    console.warn('[BrainPanel] 经验卡加载失败', e)
  }
}

async function fetchProposals(): Promise<void> {
  if (!props.kbId) return
  const gen = ++inboxGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.proposalInbox({ kbId: props.kbId, page: inboxPage.value, pageSize: inboxPageSize })
    if (gen !== inboxGen) return // 过期响应丢弃
    if (res.success && res.data) {
      proposals.value = res.data.rows as BrainNote[]
      proposalTotal.value = res.data.total
      // 审批掉末页最后一条后页码越界：回退重取
      const maxPage = Math.max(1, Math.ceil(proposalTotal.value / inboxPageSize))
      if (inboxPage.value > maxPage) {
        inboxPage.value = maxPage
        void fetchProposals()
      }
    }
  } catch (e) {
    console.warn('[BrainPanel] 待审提议加载失败', e)
  }
}

async function handleAtomPageChange(page: number): Promise<void> {
  atomPage.value = page
  await fetchAtoms()
}

async function handleAtomPageSizeChange(size: number): Promise<void> {
  atomPageSize.value = size
  atomPage.value = 1
  await fetchAtoms()
}

async function handleNotesPageChange(page: number): Promise<void> {
  notesPage.value = page
  await fetchNotes()
}

async function handleInboxPageChange(page: number): Promise<void> {
  inboxPage.value = page
  await fetchProposals()
}

async function refresh(): Promise<void> {
  if (!props.kbId) return
  const gen = ++requestGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const [cfgRes, statsRes, , , docRes] = await Promise.all([
      client.getConfig(props.kbId),
      client.stats(props.kbId),
      fetchAtoms(),
      fetchProposals(),
      client.docStatus(props.kbId),
    ])
    if (gen !== requestGen) return // 过期响应丢弃
    if (cfgRes.success && cfgRes.data) {
      config.value = cfgRes.data.config
      enabled.value = !!cfgRes.data.config?.enabled
      // 抽屉打开期间不覆写草稿：用户可能正在编辑未保存的设置
      if (cfgRes.data.config && !configOpen.value) {
        configDraft.value = JSON.parse(JSON.stringify(cfgRes.data.config))
      }
    }
    if (statsRes.success) stats.value = statsRes.data
    // 待提取文档：已处理完成但大脑未消化的（开脑前上传的存量）
    if (docRes.success && docRes.data) {
      allDocs.value = (docRes.data as Array<{ id: string; name: string }>).map((d) => ({ id: d.id, name: d.name }))
      pendingDigestDocs.value = (docRes.data as Array<{ id: string; name: string; brainStatus: string | null }>)
        .filter((d) => d.brainStatus !== 'digested' && d.brainStatus !== 'digesting')
        .map((d) => ({ id: d.id, name: d.name }))
    }
  } catch (e) {
    console.warn('[BrainPanel] 刷新失败', e)
  }
  // 模型列表单独拉（通道缺失/失败不拖垮面板主数据）
  try {
    const modelsRes = await client.listModels()
    if (modelsRes.success && modelsRes.data) modelOptions.value = modelsRes.data
  } catch {
    /* 旧宿主无此通道：下拉为空但不影响其他功能 */
  }
  // 提炼中的目标状态同步（面板重开后恢复 busy）
  try {
    const gsRes = await client.goalStatus(props.kbId)
    if (gsRes.success && gsRes.data) {
      runningGoalIds.value = gsRes.data.running as string[]
      lastGoalResults.value = gsRes.data.last ?? {}
      if (runningGoalIds.value.length > 0) startGoalPoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
  // 归纳进行中状态同步（面板重开后恢复进度条）
  try {
    const csRes = await client.consolidateStatus(props.kbId)
    if (csRes.success && csRes.data) {
      consolidateProgress.value = csRes.data
      consolidateSummary.value = csRes.data.mergedGroups > 0 ? { mergedGroups: csRes.data.mergedGroups, supersededAtoms: csRes.data.supersededAtoms } : null
      consolidateRunning.value = !!csRes.data.running
      if (consolidateRunning.value) startConsolidatePoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
}

function openConfig(): void {
  if (config.value) configDraft.value = JSON.parse(JSON.stringify(config.value))
  configOpen.value = true
}

/** 头部总开关：立即落库（部分 patch 只动 enabled），失败回滚 */
async function toggleEnabled(): Promise<void> {
  const next = enabled.value
  if (!props.kbId) {
    enabled.value = !next
    return
  }
  enabling.value = true
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.updateConfig({ kbId: props.kbId, patch: { enabled: next } })
    if (res.success) {
      config.value = res.data
      enabled.value = !!res.data?.enabled
      configDraft.value = JSON.parse(JSON.stringify(res.data))
    } else {
      enabled.value = !next
      ElMessage.error(`操作失败: ${res.error || '未知错误'}`)
    }
  } catch (e) {
    enabled.value = !next
    ElMessage.error(`操作失败: ${(e as Error).message}`)
  } finally {
    enabling.value = false
  }
}

function discardConfig(): void {
  if (config.value) configDraft.value = JSON.parse(JSON.stringify(config.value))
  configOpen.value = false
}

async function saveConfig(): Promise<void> {
  saving.value = true
  try {
    const draft = JSON.parse(JSON.stringify(configDraft.value)) as BrainConfig
    // 数字输入被清空时 el-input-number 会置 null——回退到已有值，避免校验失败打断保存
    if (draft.autoApproveThreshold == null) {
      draft.autoApproveThreshold = config.value?.autoApproveThreshold ?? 0.8
    }
    const res = await (window as any).electronAPI.knowledgeBase.brain.updateConfig({
      kbId: props.kbId,
      patch: draft,
    })
    if (res.success) {
      config.value = res.data
      enabled.value = !!res.data?.enabled
      configDraft.value = JSON.parse(JSON.stringify(res.data))
      ElMessage.success('大脑设置已保存')
      configOpen.value = false
    } else {
      ElMessage.error(`保存失败: ${res.error || '未知错误'}`)
    }
  } catch (e) {
    // ajv 校验失败（如手输越界阈值）响亮可见
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    saving.value = false
  }
}

async function decide(noteId: string, action: 'publish' | 'reject'): Promise<void> {
  await (window as any).electronAPI.knowledgeBase.brain.decideProposal({ noteId, action })
  await refresh()
  // 审批的是当前浏览的经验卡列表之外的数据时，卡片视图也跟着刷新
  if (activeView.value === 'cards') void fetchNotes()
}

async function digestOne(d: DigestDoc): Promise<void> {
  d.busy = true
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.digestDocument(d.id)
    if (res?.success) ElMessage.success(`「${d.name}」已加入提取队列`)
    else ElMessage.error(`提取失败: ${res?.error || '未知错误'}`)
  } catch (e) {
    ElMessage.error(`提取失败: ${(e as Error).message}`)
  } finally {
    d.busy = false
  }
  await refresh()
}

async function digestAll(): Promise<void> {
  digestAllBusy.value = true
  const failed: string[] = []
  try {
    for (const d of pendingDigestDocs.value) {
      d.busy = true
      try {
        const res = await (window as any).electronAPI.knowledgeBase.brain.digestDocument(d.id)
        if (!res?.success) failed.push(d.name)
      } catch {
        failed.push(d.name)
      } finally {
        d.busy = false
      }
    }
    // 单个失败不放弃剩余文档；结束时如实汇报
    if (failed.length === 0) ElMessage.success('全部文档已加入提取队列')
    else ElMessage.warning(`已入队 ${pendingDigestDocs.value.length - failed.length} 个，失败 ${failed.length} 个：${failed.join('、')}`)
  } finally {
    digestAllBusy.value = false
  }
  await refresh()
}

// ===== 记观感 =====
function openRemark(): void {
  remarkText.value = ''
  remarkDocId.value = ''
  remarkQuote.value = ''
  remarkOpen.value = true
}

async function saveRemark(): Promise<void> {
  const text = remarkText.value.trim()
  if (!text) {
    ElMessage.warning('观感内容不能为空')
    return
  }
  remarkBusy.value = true
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.captureReading({
      kbId: props.kbId,
      documentId: remarkDocId.value || '',
      quote: remarkQuote.value.trim(),
      remark: text,
    })
    if (res?.success) {
      ElMessage.success('观感已记录，在「我的观感」中查看')
      remarkOpen.value = false
      atomFilter.value = 'human'
      atomPage.value = 1
      activeView.value = 'atoms'
      await refresh()
    } else {
      ElMessage.error(`保存失败: ${res?.error || '未知错误'}`)
    }
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    remarkBusy.value = false
  }
}

// ===== 论断归纳整理 =====
function startConsolidatePoll(): void {
  if (consolidatePollTimer) return
  consolidatePollTimer = setInterval(pollConsolidate, 5000)
  void pollConsolidate()
}

async function pollConsolidate(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  const kbAtCall = props.kbId // 代际守卫：切库后丢弃旧库的过期轮询响应
  try {
    const res = await client.consolidateStatus(props.kbId)
    if (kbAtCall !== props.kbId) return
    if (res.success && res.data) {
      const wasRunning = consolidateRunning.value
      consolidateProgress.value = res.data
      consolidateRunning.value = !!res.data.running
      // 刚跑完：报结果 + 刷新列表（合并出的新论断 / 归档的碎片）
      if (wasRunning && !consolidateRunning.value) {
        if (res.data.lastError && res.data.mergedGroups === 0) {
          // 顶层失败（如全批失败/库异常）：零产出不得报成功
          ElMessage.error(`归纳失败: ${res.data.lastError}`)
        } else if (res.data.failedBatches > 0) {
          ElMessage.warning(`归纳完成，但 ${res.data.failedBatches} 批失败：${res.data.lastError || '未知错误'}`)
          consolidateSummary.value = { mergedGroups: res.data.mergedGroups, supersededAtoms: res.data.supersededAtoms }
        } else {
          ElMessage.success(`归纳完成：合并 ${res.data.mergedGroups} 组，归档 ${res.data.supersededAtoms} 条碎片`)
          consolidateSummary.value = { mergedGroups: res.data.mergedGroups, supersededAtoms: res.data.supersededAtoms }
        }
        await refresh()
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (!consolidateRunning.value && consolidatePollTimer) {
    clearInterval(consolidatePollTimer)
    consolidatePollTimer = null
  }
}

async function startConsolidate(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将用 AI 分批审读库内论断，把同主题碎片合并为综合论断，被合并的原论断归档（列表默认不再显示）。会产生 LLM 调用费用。',
      '论断归纳整理',
      { type: 'warning', confirmButtonText: '开始归纳', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.consolidateRun(props.kbId)
    if (!res.success) {
      ElMessage.error(res.error || '归纳启动失败')
      return
    }
    consolidateRunning.value = true
    startConsolidatePoll()
  } catch (e) {
    ElMessage.error(`归纳启动失败: ${(e as Error).message}`)
  }
}

watch(
  () => props.kbId,
  () => {
    atomPage.value = 1 // 换库回到第一页
    atomFilter.value = 'all'
    activeView.value = 'atoms'
    inboxPage.value = 1
    notesPage.value = 1
    // 清掉上一库的行，避免切库瞬间闪现旧数据
    atoms.value = []
    atomTotal.value = 0
    notes.value = []
    notesTotal.value = 0
    proposals.value = []
    proposalTotal.value = 0
    void refresh()
  },
  { immediate: true },
)
defineExpose({ refresh })
</script>

<style scoped>
.brain-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 顶部状态条 ===== */
.bp-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}
.bp-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.bp-name {
  font-size: 15px;
  font-weight: 600;
}
.bp-stats {
  display: flex;
  align-items: stretch;
  margin-left: auto;
}
.bp-stat {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  padding: 2px 12px;
  border-left: 1px solid var(--el-border-color-lighter);
  line-height: 1.3;
}
.bp-stat:first-child {
  border-left: none;
}
.bp-stat b {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.bp-stat span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.bp-stat:hover b,
.bp-stat:hover span {
  color: var(--el-color-primary);
}
.bp-stat.active b,
.bp-stat.active span {
  color: var(--el-color-primary);
}

/* ===== 主体双栏 ===== */
.bp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}
.bp-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.bp-side {
  width: 320px;
  flex: none;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 4px;
}

.bp-main-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.bp-main-title {
  font-size: 14px;
  font-weight: 600;
}
.bp-main-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 论断三段式：表格区弹性伸展内部滚动，分页栏固定底部 */
.atoms-table-region {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background-color: var(--el-bg-color);
}
.atoms-pagination-bar {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
}
.stmt {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.doc-src {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.muted {
  opacity: 0.5;
}

/* ===== 卡片视图（经验卡 / 待审提议） ===== */
.cards-region {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}
.note-card {
  flex: none;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  padding: 12px;
}
.n-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.n-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}
.n-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.55;
  margin-top: 4px;
}
.n-body {
  font-family: inherit;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--el-text-color-primary);
}
.n-body.preview {
  max-height: 130px;
  overflow: hidden;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.n-body-collapse {
  border-top: 1px dashed var(--el-border-color-lighter);
  margin-top: 8px;
}
.n-body-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  height: 32px;
  line-height: 32px;
  border-bottom: none;
}
.n-body-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
.n-body-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 4px;
}

/* ===== 右侧行动栏 ===== */
.side-card {
  flex: none;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  padding: 12px;
}
.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.side-title {
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.side-count {
  font-size: 11px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 8px;
  padding: 0 7px;
  line-height: 16px;
}
.side-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 12px 0;
}
.side-tip {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.goal-run {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
}
.goal-run:hover {
  background: var(--el-fill-color-light);
}
.goal-run-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.goal-run-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.goal-run-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proposal {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px;
}
.proposal + .proposal {
  margin-top: 8px;
}
.p-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}
.p-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  margin: 4px 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.p-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.doc-run {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
}
.doc-run + .doc-run {
  border-top: 1px solid var(--el-border-color-extra-light);
}
.doc-run-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 设置抽屉 ===== */
.cfg-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.cfg-section h4 {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 600;
}
.cfg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
}
.cfg-row + .cfg-row {
  border-top: 1px solid var(--el-border-color-extra-light);
}
.cfg-label {
  font-size: 13px;
  display: block;
}
.cfg-desc {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cfg-goals-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.goal-edit {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.goal-edit + .goal-edit {
  margin-top: 8px;
}
.goal-edit-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cfg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ===== 记观感对话框 ===== */
.rf-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}
.rf-req {
  color: var(--el-color-danger);
}
</style>
