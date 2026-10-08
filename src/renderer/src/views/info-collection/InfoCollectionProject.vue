<template>
  <div class="ic-project" v-loading="store.loadingDetail">
    <template v-if="project">
      <div class="proj-header">
        <el-button :icon="ArrowLeft" text @click="back">返回</el-button>
        <div class="proj-title">
          <h2>{{ project.name }}</h2>
          <el-tag size="small" effect="plain">蓝图 v{{ project.blueprintVersion }}</el-tag>
          <el-tag :type="project.blueprint?.autoConfirm ? 'success' : 'warning'" size="small" effect="plain">
            {{ project.blueprint?.autoConfirm ? '蓝图已确认' : '蓝图待确认' }}
          </el-tag>
        </div>
        <div class="proj-actions">
          <el-tooltip :disabled="!!project.kbId" content="未绑定知识库——确认入库需要先绑定">
            <el-button type="primary" :loading="store.running" :disabled="!project.blueprint?.autoConfirm" @click="doRun">
              {{ store.running ? '搜集中…' : '开始搜集' }}
            </el-button>
          </el-tooltip>
          <el-button :icon="Refresh" @click="reload" />
        </div>
      </div>
      <p class="proj-goal">{{ project.goal }}</p>

      <!-- 知识库绑定（内容唯一存储在 kb；确认入库的前提） -->
      <div class="kb-row">
        <span class="kb-label">知识库：</span>
        <el-input v-model="kbInput" size="small" style="width: 320px" placeholder="粘贴知识库 ID（设置→知识库 中复制）" />
        <el-button size="small" @click="doBindKb">绑定</el-button>
        <span v-if="project.kbId" class="kb-ok">当前：{{ project.kbId }}</span>
      </div>

      <!-- 蓝图概览：需求清单 + 覆盖标记 -->
      <el-card shadow="never" class="block">
        <template #header>采集蓝图（信息需求清单）</template>
        <div v-for="req in project.blueprint?.requirements ?? []" :key="req.id" class="req-line">
          <el-tag size="small" :type="reqTagType(req.priority)" effect="plain">{{ req.priority }}</el-tag>
          <span class="req-id">{{ req.id }}</span>
          <span class="req-q">{{ req.question }}</span>
          <el-tag v-if="coverage[req.id] === true" size="small" type="success" effect="light">已满足</el-tag>
          <el-tag v-else-if="coverage[req.id] === false && req.priority !== 'nice'" size="small" type="info" effect="light">未满足</el-tag>
        </div>
        <div v-if="project.blueprint?.assumptions?.length" class="assumptions">
          <span class="assume-label">口径假设：</span>{{ project.blueprint.assumptions.join('；') }}
        </div>
        <div v-if="!project.blueprint?.autoConfirm" class="confirm-row">
          <el-button size="small" type="success" @click="doConfirmBlueprint">确认蓝图（解锁搜集）</el-button>
        </div>
      </el-card>

      <!-- 任务流水 -->
      <el-card shadow="never" class="block">
        <template #header>搜集任务</template>
        <el-empty v-if="store.tasks.length === 0" description="还没有任务——点「开始搜集」" :image-size="60" />
        <div v-for="t in store.tasks" :key="t.id" class="task-line">
          <el-tag size="small" :type="taskTagType(t.status)">{{ t.status }}</el-tag>
          <span class="task-time">{{ shortTime(t.createdAt) }}</span>
          <template v-if="t.stats">
            <span>源 {{ t.stats.sourcesNew }}（失败 {{ t.stats.sourcesFailed }}）</span>
            <span>条目 {{ t.stats.rowsDraft }}（拒收 {{ t.stats.rowsRejectedQuote }} · 重复 {{ t.stats.rowsMerged }}）</span>
            <span>工具调用 {{ t.stats.toolCalls }}/{{ t.stats.budgetMax }}</span>
            <span>覆盖率 {{ Math.round((t.stats.coverage ?? 0) * 100) }}%</span>
          </template>
        </div>
        <!-- 质量报告：负结果明示 -->
        <div v-if="lastNegative.length" class="negative-block">
          <div class="neg-title">未满足的需求（如实明示）：</div>
          <div v-for="n in lastNegative" :key="n.irId" class="neg-line">· {{ n.irId }} {{ n.question }}——{{ n.note }}</div>
        </div>
      </el-card>

      <!-- 待审工作台 -->
      <el-card shadow="never" class="block">
        <template #header>
          <div class="card-header-row">
            <span>待审来源（{{ store.stagedSources.length }}）</span>
            <div>
              <el-button size="small" type="success" :disabled="!selectedStaged.length" @click="doConfirm">确认入选（{{ selectedStaged.length }}）</el-button>
              <el-button size="small" type="danger" plain :disabled="!selectedStaged.length" @click="doReject">驳回</el-button>
            </div>
          </div>
        </template>
        <el-table
          :data="store.stagedSources"
          @selection-change="(rows: IcSourceDto[]) => (selectedStaged = rows)"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column label="来源" min-width="260">
            <template #default="{ row }">
              <div class="src-url">{{ row.url }}</div>
              <div v-if="row.tierRationale" class="src-rationale">{{ row.tierRationale }}</div>
            </template>
          </el-table-column>
          <el-table-column label="分级" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.tier" size="small" :type="tierTagType(row.tier)">T{{ row.tier }}</el-tag>
              <el-tag v-else size="small" type="info">未定级</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="抓取" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="fetchTagType(row.fetchStatus)" effect="plain">{{ row.fetchStatus }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="满足需求" width="110">
            <template #default="{ row }">{{ row.irHits.join('、') || '—' }}</template>
          </el-table-column>
          <el-table-column label="采集时间" width="150">
            <template #default="{ row }">{{ shortTime(row.collectedAt) }}</template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 资料浏览：结构化行 -->
      <el-card shadow="never" class="block">
        <template #header>结构化条目（{{ store.rows.length }}）</template>
        <el-table :data="store.rows" size="small">
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="rowTagType(row.status)" effect="plain">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="measure.metric" label="指标" min-width="120" />
          <el-table-column prop="measure.value" label="数值" width="110" />
          <el-table-column prop="measure.unit" label="单位" width="80" />
          <el-table-column prop="measure.period" label="期间" width="90" />
          <el-table-column label="维度" min-width="120">
            <template #default="{ row }">{{ dimsText(row) }}</template>
          </el-table-column>
          <el-table-column label="引句" min-width="220">
            <template #default="{ row }">
              <span class="quote">{{ row.quote || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useInfoCollectionStore, type IcSourceDto } from '@/stores/info-collection'

const route = useRoute()
const router = useRouter()
const store = useInfoCollectionStore()

const kbInput = ref('')
const selectedStaged = ref<IcSourceDto[]>([])
let pollTimer: ReturnType<typeof setInterval> | null = null

const projectId = computed(() => String(route.params.id ?? ''))
const project = computed(() => store.current)
const coverage = computed<Record<string, boolean>>(() => {
  const t = store.tasks.find(x => x.stats)
  return t?.stats?.irCoverage ?? {}
})
const lastNegative = computed(() => {
  const t = store.tasks.find(x => x.stats?.negativeResults?.length)
  return t?.stats?.negativeResults ?? []
})

onMounted(async () => {
  await store.loadProject(projectId.value)
  maybePoll()
})
onBeforeUnmount(() => stopPoll())

function maybePoll(): void {
  stopPoll()
  const busy = store.tasks.some(t => t.status === 'running' || t.status === 'pending')
  if (busy) {
    store.running = true
    pollTimer = setInterval(async () => {
      await store.loadProject(projectId.value)
      if (!store.tasks.some(t => t.status === 'running' || t.status === 'pending')) {
        stopPoll()
        store.running = false
        ElMessage.success('搜集完成，待审条目已就绪')
      }
    }, 3000)
  }
}
function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function reload(): Promise<void> {
  await store.loadProject(projectId.value)
  maybePoll()
}

async function doRun(): Promise<void> {
  const ok = await store.runTask(projectId.value)
  if (!ok) {
    ElMessage.error('发起搜集失败')
    return
  }
  maybePoll()
}

async function doConfirmBlueprint(): Promise<void> {
  const ok = await store.confirmBlueprint(projectId.value)
  ElMessage[ok ? 'success' : 'error'](ok ? '蓝图已确认' : '确认失败')
}

async function doBindKb(): Promise<void> {
  const kbId = kbInput.value.trim() || null
  const ok = await store.setProjectKb(projectId.value, kbId)
  ElMessage[ok ? 'success' : 'error'](ok ? '已绑定' : '绑定失败')
}

async function doConfirm(): Promise<void> {
  const ids = selectedStaged.value.map(s => s.id)
  const { confirmed, skipped } = await store.confirmBatch(projectId.value, ids)
  const blockedNote = skipped.map(s => s.reason).join('；')
  ElMessage.success(`已确认 ${confirmed.length} 条${skipped.length ? `；拦下 ${skipped.length} 条（${blockedNote}）` : ''}`)
  selectedStaged.value = []
}

async function doReject(): Promise<void> {
  const ids = selectedStaged.value.map(s => s.id)
  const result = await ElMessageBox.prompt('驳回原因（进质量统计）', '驳回所选来源', {
    inputValue: '来源不可信',
    inputPattern: /.+/,
    inputErrorMessage: '原因不能为空',
  })
  const reason = typeof result === 'string' ? result : result.value
  await store.rejectBatch(projectId.value, ids, reason)
  ElMessage.success('已驳回')
  selectedStaged.value = []
}

function back(): void {
  void router.push('/info-collection')
}

function reqTagType(priority: string): 'danger' | 'primary' | 'info' {
  return priority === 'must' ? 'danger' : priority === 'should' ? 'primary' : 'info'
}
function taskTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  return status === 'done' || status === 'reviewing'
    ? 'success'
    : status === 'running' || status === 'pending'
      ? 'warning'
      : status === 'failed'
        ? 'danger'
        : 'info'
}
function tierTagType(tier: number): 'success' | 'primary' | 'warning' | 'info' {
  return tier === 1 ? 'success' : tier === 2 ? 'primary' : tier === 3 ? 'warning' : 'info'
}
function fetchTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  return status === 'ok' ? 'success' : status === 'partial' ? 'warning' : status === 'blocked' ? 'danger' : 'info'
}
function rowTagType(status: string): 'success' | 'warning' | 'info' {
  return status === 'confirmed' ? 'success' : status === 'draft' ? 'warning' : 'info'
}
function dimsText(row: { measure: { dims: Record<string, unknown> | null } }): string {
  const dims = row.measure.dims
  return dims && Object.keys(dims).length ? Object.entries(dims).map(([k, v]) => `${k}=${String(v)}`).join('，') : '—'
}
function shortTime(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 16).replace('T', ' ')
}
</script>

<style scoped>
.ic-project { padding: 20px 32px; }
.proj-header { display: flex; align-items: center; gap: 12px; }
.proj-title { display: flex; align-items: center; gap: 8px; flex: 1; }
.proj-title h2 { margin: 0; font-size: 18px; }
.proj-goal { color: var(--el-text-color-secondary); font-size: 13px; margin: 8px 0 14px; }
.kb-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 13px; }
.kb-ok { color: var(--el-color-success); font-size: 12px; }
.block { margin-bottom: 16px; }
.card-header-row { display: flex; align-items: center; justify-content: space-between; }
.req-line { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.req-id { color: var(--el-text-color-secondary); font-family: monospace; }
.assumptions { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.assume-label { color: var(--el-color-warning); }
.confirm-row { margin-top: 10px; }
.task-line { display: flex; align-items: center; gap: 12px; padding: 5px 0; font-size: 13px; }
.task-time { color: var(--el-text-color-secondary); }
.negative-block { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--el-border-color-lighter); }
.neg-title { font-size: 12px; color: var(--el-color-warning); margin-bottom: 4px; }
.neg-line { font-size: 12px; color: var(--el-text-color-secondary); padding: 2px 0; }
.src-url { font-size: 13px; word-break: break-all; }
.src-rationale { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.quote { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
