<template>
  <div class="brain-panel">
    <!-- 顶部状态条：标题 + 启用开关 + 统计 + 设置入口 -->
    <header class="bp-header">
      <div class="bp-title">
        <span class="bp-name">知识大脑</span>
        <el-switch v-model="enabled" size="small" :loading="enabling" @change="toggleEnabled" />
        <el-tag :type="enabled ? 'success' : 'info'" size="small" effect="light" round>
          {{ enabled ? '运行中' : '未启用' }}
        </el-tag>
      </div>
      <div class="bp-stats">
        <div class="bp-stat">
          <b>{{ stats?.atoms?.total ?? '—' }}</b>
          <span>论断</span>
        </div>
        <div class="bp-stat">
          <b>{{ stats?.atoms?.humanOrigin ?? '—' }}</b>
          <span>我的观感</span>
        </div>
        <div class="bp-stat">
          <b>{{ stats?.notes?.published ?? '—' }}</b>
          <span>经验卡</span>
        </div>
        <div class="bp-stat">
          <b>{{ proposalTotal }}</b>
          <span>待审提议</span>
        </div>
        <div class="bp-stat">
          <b>{{ stats?.openQuestions ?? '—' }}</b>
          <span>悬而未决</span>
        </div>
      </div>
      <el-button size="small" @click="openConfig">
        <el-icon><Setting /></el-icon>
        设置
      </el-button>
    </header>

    <!-- 主体双栏：左=论断库主表，右=提炼目标/待审提议/待提取文档 -->
    <div class="bp-body">
      <div class="bp-main">
        <div class="atoms-table-region">
          <el-table
            :data="atoms"
            height="100%"
            :empty-text="enabled ? '尚未消化出论断（上传文档后自动进行）' : '大脑未启用，打开顶部开关后上传文档自动消化'"
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
            <el-table-column label="视角" width="70">
              <template #default="{ row }">
                {{ row.lensNoteId ? '视角' : row.origin === 'human' ? '我' : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="来源" width="110">
              <template #default="{ row }">
                <span class="muted">{{ (row.sourceChapterHash || '').slice(0, 8) || '—' }}</span>
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

        <!-- 待审提议 -->
        <section class="side-card">
          <header class="side-head">
            <span class="side-title">待审提议</span>
            <span v-if="proposalTotal > 0" class="side-count">{{ proposalTotal }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
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
  sourceChapterHash: string | null
  sourceQuote: string
}
interface BrainNote {
  id: string
  title: string
  description: string
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
const atoms = ref<BrainAtom[]>([])
const atomPage = ref(1)
const atomPageSize = ref(50)
const atomTotal = ref(0)
let atomsGen = 0 // 论断列表独立代际：翻页请求与刷新竞态时丢弃过期响应
const proposals = ref<BrainNote[]>([])
const proposalTotal = ref(0)
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

// ===== 提取目标 =====
const presetGroups = KB_BRAIN_GOAL_PRESETS
const presetPick = ref('')
const enabledGoals = computed(() => (config.value?.goals ?? []).filter((g) => g.enabled))
const runningGoalIds = ref<string[]>([])
const lastGoalResults = ref<Record<string, { ok: boolean; error?: string; proposed?: boolean; skippedDuplicate?: boolean; cardTitle?: string | null; fragments?: number }>>({})
let goalPollTimer: ReturnType<typeof setInterval> | null = null

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
  else if (rec.proposed) ElMessage.success(`「${name}」经验卡已生成（素材 ${rec.fragments ?? 0} 条），待审提议中`)
  void refresh()
}

onBeforeUnmount(() => {
  if (goalPollTimer) clearInterval(goalPollTimer)
  goalPollTimer = null
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
    const res = await client.listAtoms({ kbId: props.kbId, page: atomPage.value, pageSize: atomPageSize.value })
    if (gen !== atomsGen) return // 过期响应丢弃
    if (res.success && res.data) {
      atoms.value = res.data.rows as BrainAtom[]
      atomTotal.value = res.data.total
      emit('stats', res.data.total)
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

async function handleAtomPageChange(page: number): Promise<void> {
  atomPage.value = page
  await fetchAtoms()
}

async function handleAtomPageSizeChange(size: number): Promise<void> {
  atomPageSize.value = size
  atomPage.value = 1
  await fetchAtoms()
}

async function refresh(): Promise<void> {
  if (!props.kbId) return
  const gen = ++requestGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const [cfgRes, statsRes, , inboxRes, docRes] = await Promise.all([
      client.getConfig(props.kbId),
      client.stats(props.kbId),
      fetchAtoms(),
      client.proposalInbox({ kbId: props.kbId, pageSize: 50 }),
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
    if (inboxRes.success && inboxRes.data) {
      proposals.value = inboxRes.data.rows as BrainNote[]
      proposalTotal.value = inboxRes.data.total
    }
    // 待提取文档：已处理完成但大脑未消化的（开脑前上传的存量）
    if (docRes.success && docRes.data) {
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

watch(
  () => props.kbId,
  () => {
    atomPage.value = 1 // 换库回到第一页
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  padding: 0 12px;
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
.muted {
  opacity: 0.5;
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
</style>
