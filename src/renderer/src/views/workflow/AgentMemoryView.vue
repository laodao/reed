<template>
  <div class="agent-memory page-container">
    <div class="page-header">
      <div>
        <h2>知识飞轮</h2>
        <span class="meta">分层知识（系统/用户/业务/项目）——候选经人工批准才生效（宁可慢不可脏）</span>
      </div>
    </div>

    <div class="toolbar">
      <el-button type="primary" size="small" @click="manualVisible = true">手工录入</el-button>
      <el-radio-group v-model="scopeFilter" size="small" style="margin-left: 12px">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="user">用户级</el-radio-button>
        <el-radio-button value="biz">业务级</el-radio-button>
        <el-radio-button value="project">项目级</el-radio-button>
      </el-radio-group>
      <el-input
        v-model="keyword"
        size="small"
        clearable
        placeholder="检索标题 / 内容 / 类型"
        style="width: 240px; margin-left: 12px"
        :prefix-icon="Search"
      />
    </div>

    <!-- 中间表格区：表格内部滚动（M8 用户反馈①） -->
    <div class="table-area">
      <el-table :data="pagedRows" size="small" height="100%" :empty-text="emptyText">
        <el-table-column type="index" label="序号" width="64" :index="indexMethod" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }"><el-tag size="small" disable-transitions>{{ row.kind }}</el-tag></template>
        </el-table-column>
        <el-table-column label="标题" min-width="150">
          <template #default="{ row }">{{ row.content.title }}</template>
        </el-table-column>
        <el-table-column label="内容" min-width="240">
          <template #default="{ row }"><span class="content">{{ row.content.content }}</span></template>
        </el-table-column>
        <el-table-column label="置信度" width="80">
          <template #default="{ row }">{{ row.confidence != null ? row.confidence.toFixed(2) : '—' }}</template>
        </el-table-column>
        <el-table-column v-if="tab === 'active'" label="命中/成功" width="95">
          <template #default="{ row }">{{ row.useCount }} / {{ row.successCount }}</template>
        </el-table-column>
        <el-table-column v-if="tab === 'active'" label="向量" width="105">
          <template #default="{ row }">
            <el-tag v-if="row.embeddingId" size="small" type="success" effect="plain" disable-transitions>
              {{ row.embedModel ? `✓ ${row.embedModel}` : '✓ 已向量' }}
            </el-tag>
            <span v-else class="source-line">未向量</span>
          </template>
        </el-table-column>
        <el-table-column label="层级 / 来源" width="165">
          <template #default="{ row }">
            <el-tag size="small" :type="layerTag(row)" disable-transitions>{{ layerLabel(row) }}</el-tag>
            <div class="source-line">{{ sourceLabel(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="tab === 'pending'">
              <el-button text type="success" size="small" @click="approve(row)">批准</el-button>
              <el-button text type="danger" size="small" @click="reject(row)">驳回</el-button>
              <el-button text size="small" @click="archive(row)">归档</el-button>
            </template>
            <el-button v-else-if="tab === 'active'" text type="danger" size="small" @click="archive(row)">归档</el-button>
            <span v-else class="source-line">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 底部分类栏（固定）：分类 + 分页（M8 用户反馈①） -->
    <div class="bottom-bar">
      <el-radio-group v-model="tab" size="small">
        <el-radio-button value="pending">待审 {{ pendingFiltered.length }}</el-radio-button>
        <el-radio-button value="active">已生效 {{ activeFiltered.length }}</el-radio-button>
        <el-radio-button value="archived">已归档 {{ archivedFiltered.length }}</el-radio-button>
      </el-radio-group>
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        layout="prev, pager, next, jumper, total"
        small
      />
    </div>

    <el-dialog v-model="manualVisible" title="手工录入知识" width="480">
      <el-form label-width="80" size="small">
        <el-form-item label="类型">
          <el-select v-model="manual.kind" style="width: 100%">
            <el-option label="事实 fact" value="fact" />
            <el-option label="做法 sop" value="sop" />
            <el-option label="偏好 preference" value="preference" />
            <el-option label="技能 skill" value="skill" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题"><el-input v-model="manual.title" maxlength="60" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="manual.content" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="业务"><el-input v-model="manual.bizModule" placeholder="留空=用户级（如 longwriting）" /></el-form-item>
        <el-form-item label="项目"><el-input v-model="manual.projectId" placeholder="留空=不限（业务级须同时填业务）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="manualVisible = false">取消</el-button>
        <el-button type="primary" size="small" :disabled="!manual.title.trim() || !manual.content.trim()" @click="submitManual">提交（待审）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AgentMemoryView' })
import { computed, ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'

interface MemoryRow {
  id: string
  kind: string
  content: { title?: string; content?: string }
  confidence: number | null
  status: string
  useCount: number
  successCount: number
  bizModule?: string | null
  projectId?: string | null
  embedModel?: string | null
  embeddingId?: string | null
  sourceTaskId?: string | null
  sourceRunId?: string | null
}

const manualVisible = ref(false)
const manual = ref({ kind: 'fact', title: '', content: '', bizModule: '', projectId: '' })

/** 层级筛选（37 号）+ 关键词检索 + 分类（M8 用户反馈③①） */
const scopeFilter = ref<'all' | 'user' | 'biz' | 'project'>('all')
const keyword = ref('')
const tab = ref<'pending' | 'active' | 'archived'>('pending')
const page = ref(1)
const pageSize = 20

function matchScope(row: MemoryRow): boolean {
  if (scopeFilter.value === 'user') return !row.projectId && !row.bizModule
  if (scopeFilter.value === 'biz') return !!row.bizModule && !row.projectId
  if (scopeFilter.value === 'project') return !!row.projectId
  return true
}

function matchKeyword(row: MemoryRow): boolean {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return true
  const haystack = [row.content.title ?? '', row.content.content ?? '', row.kind].join('\n').toLowerCase()
  return haystack.includes(kw)
}

const pending = ref<MemoryRow[]>([])
const active = ref<MemoryRow[]>([])
const archived = ref<MemoryRow[]>([])

const filteredRows = computed(() => {
  const list = tab.value === 'pending' ? pending.value : tab.value === 'active' ? active.value : archived.value
  return list.filter((r) => matchScope(r) && matchKeyword(r))
})
const pendingFiltered = computed(() => pending.value.filter((r) => matchScope(r) && matchKeyword(r)))
const activeFiltered = computed(() => active.value.filter((r) => matchScope(r) && matchKeyword(r)))
const archivedFiltered = computed(() => archived.value.filter((r) => matchScope(r) && matchKeyword(r)))
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredRows.value.slice(start, start + pageSize)
})
const emptyText = computed(() => {
  if (keyword.value.trim()) return '无匹配条目——调整检索词或筛选条件'
  return tab.value === 'pending' ? '暂无待审条目' : tab.value === 'active' ? '暂无生效条目' : '暂无归档条目'
})

/** 序号跨页连续（M8 用户反馈②） */
function indexMethod(index: number): number {
  return (page.value - 1) * pageSize + index + 1
}

watch([scopeFilter, keyword], () => { page.value = 1 })
watch(tab, () => { page.value = 1 })

function layerTag(row: MemoryRow): 'info' | 'warning' | 'success' {
  if (row.projectId) return 'success'
  if (row.bizModule) return 'warning'
  return 'info'
}

function sourceLabel(row: MemoryRow): string {
  if (row.sourceTaskId) return `任务 ${row.sourceTaskId.slice(0, 8)}`
  if (row.sourceRunId) return `运行 ${row.sourceRunId.slice(0, 8)}`
  return '手工录入'
}

function layerLabel(row: MemoryRow): string {
  if (row.projectId) return `项目 ${row.projectId.slice(0, 10)}`
  if (row.bizModule) return `业务 ${row.bizModule}`
  return '用户级'
}

async function submitManual(): Promise<void> {
  const m = manual.value
  const apiObj = api()
  const resp = await (apiObj as unknown as { addManualMemory?: WfMethod }).addManualMemory?.({
    kind: m.kind,
    title: m.title.trim(),
    content: m.content.trim(),
    bizModule: m.bizModule.trim() || undefined,
    projectId: m.projectId.trim() || undefined,
  })
  if (resp?.success) {
    ElMessage.success('已提交待审')
    manualVisible.value = false
    manual.value = { kind: 'fact', title: '', content: '', bizModule: '', projectId: '' }
    await load()
  } else {
    ElMessage.error(resp?.error ?? '提交失败')
  }
}

async function reject(row: MemoryRow): Promise<void> {
  const resp = await api().rejectMemory(row.id)
  if (resp?.success) {
    ElMessage.success('已驳回')
    await load()
  } else {
    ElMessage.error(resp?.error ?? '驳回失败')
  }
}

type WfResp = { success: boolean; data?: unknown; error?: string }
type WfMethod = (payload?: unknown) => Promise<WfResp>
type WfApi = Record<string, WfMethod>
const api = () => (window as never as { electronAPI: { workflow: WfApi } }).electronAPI.workflow

async function load(): Promise<void> {
  const p = await api().listMemoryPending()
  if (p.success) pending.value = (p.data ?? []) as never
  const a = await api().listMemoryActive()
  if (a.success) active.value = (a.data ?? []) as never
  // 已归档分类（M8 用户反馈①）：生命周期全量可见
  const h = await (api().listMemoryArchived as WfMethod | undefined)?.()
  if (h?.success) archived.value = (h.data ?? []) as never
}

async function approve(row: MemoryRow): Promise<void> {
  const resp = await api().approveMemory(row.id)
  if (resp.success) { ElMessage.success('已批准入库'); await load() }
  else ElMessage.error(resp.error ?? '操作失败')
}

async function archive(row: MemoryRow): Promise<void> {
  const resp = await api().archiveMemory(row.id)
  if (resp.success) { await load() }
  else ElMessage.error(resp.error ?? '操作失败')
}

onMounted(() => { void load() })
</script>

<style scoped>
.agent-memory { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-shrink: 0; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }
.toolbar { display: flex; align-items: center; margin-bottom: 10px; flex-shrink: 0; }
.table-area { flex: 1; min-height: 0; }
.content { font-size: 12px; color: var(--el-text-color-regular); }
.source-line { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 2px; }
.bottom-bar { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--el-border-color-lighter); padding-top: 8px; margin-top: 8px; flex-shrink: 0; }
</style>
