<template>
  <div class="wf-runs-history">
    <div class="toolbar">
      <el-button text @click="router.push('/workflow')">
        <el-icon><ArrowLeft /></el-icon>
      </el-button>
      <span class="title">{{ isGlobal ? '运行实例（全部工作流）' : `运行历史${defName ? `：${defName}` : ''}` }}</span>
      <el-select v-model="statusFilter" size="small" style="width: 130px" @change="onFilterChange">
        <el-option label="全部状态" value="" />
        <el-option v-for="(label, s) in STATUS_LABEL" :key="s" :label="label" :value="s" />
      </el-select>
      <el-button v-if="!isGlobal" size="small" text type="primary" @click="router.push('/workflow/runs')">
        全部运行 →
      </el-button>
      <div class="spacer" />
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-table :data="runs" v-loading="loading" style="width: 100%">
      <el-table-column label="#" width="56">
        <template #default="{ $index }">{{ (page - 1) * pageSize + $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="id" label="运行 ID" min-width="220" show-overflow-tooltip />
      <el-table-column v-if="isGlobal" label="工作流" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link v-if="row.definitionId" type="primary" :underline="false" @click="router.push(`/workflow/runs/${row.definitionId}`)">
            {{ defNameMap[row.definitionId] ?? row.definitionId }}
          </el-link>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-tag :type="STATUS_TONE[row.status] ?? 'info'" size="small">{{ STATUS_LABEL[row.status] ?? row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="触发" width="110">
        <template #default="{ row }">
          <span>{{ TRIGGER_LABEL[row.triggerType] ?? row.triggerType }}</span>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" min-width="170">
        <template #default="{ row }">{{ formatTime(row.startedAt ?? row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="耗时" width="110">
        <template #default="{ row }">{{ formatDuration(row.stats, row) }}</template>
      </el-table-column>
      <el-table-column label="错误" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="err" :title="row.error">{{ row.error || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230">
        <template #default="{ row }">
          <el-tooltip content="查看产物" placement="top">
            <el-button circle size="small" type="info" plain @click="openArtifacts(row.id)">
              <el-icon><FolderOpened /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="重跑（使用该次运行的输入）" placement="top">
            <el-button circle size="small" type="success" plain :loading="rerunningId === row.id" @click="handleRerun(row)">
              <el-icon><RefreshRight /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="详情" placement="top">
            <el-button circle size="small" type="primary" plain @click="router.push(`/workflow/run/${row.id}`)">
              <el-icon><View /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="删除" placement="top">
            <el-button circle size="small" type="danger" plain @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination layout="prev, pager, next, total" :total="total" :page-size="pageSize"
        :current-page="page" @current-change="p => { page = p; load() }" />
    </div>

    <!-- 查看产物抽屉（点击某条运行 → 展示该 run 的产出物） -->
    <el-drawer v-model="artifactsOpen" size="min(720px, 92vw)" :title="`运行产物 · ${abbrevRunId(artifactsRunId)}`">
      <RunArtifactsPanel :key="artifactsRunId" :run-id="artifactsRunId" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 工作流运行历史列表（修复：handleHistory 跳转 /workflow/runs/:definitionId 原本无路由——空白页）
 * 全局模式（/workflow/runs，无定义参数）：全部工作流的运行实例列表，附工作流列与状态筛选。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, View, Delete, RefreshRight, FolderOpened } from '@element-plus/icons-vue'
import { toPlainData } from '../../utils/plain-data'
import RunArtifactsPanel from '@/components/workflow/RunArtifactsPanel.vue'

const STATUS_LABEL: Record<string, string> = {
  pending: '排队中', running: '运行中', waiting_review: '待审核', succeeded: '成功',
  failed: '失败', cancelled: '已取消', interrupted: '已中断', skipped: '跳过', timed_out: '超时',
}
const STATUS_TONE: Record<string, string> = {
  running: 'primary', waiting_review: 'warning', succeeded: 'success',
  failed: 'danger', cancelled: 'info', interrupted: 'info', skipped: 'info', timed_out: 'danger',
}
const TRIGGER_LABEL: Record<string, string> = { manual: '手动', cron: '定时', event: '事件', resume: '续跑', api: 'API' }

const route = useRoute()
const router = useRouter()
const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

const runs = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const defName = ref('')
const statusFilter = ref('')
const defNameMap = ref<Record<string, string>>({})

// 无定义参数 = 全局实例列表（全部工作流）
const isGlobal = computed(() => !route.params.definitionId)
const defId = computed(() => (route.params.definitionId as string) || '')

/** 状态筛选变化 → 回第一页重查 */
function onFilterChange(): void {
  page.value = 1
  void load()
}

// 查看产物抽屉
const artifactsOpen = ref(false)
const artifactsRunId = ref('')

async function load(): Promise<void> {
  loading.value = true
  try {
    const resp = await api().listRuns({
      definitionId: defId.value || undefined,
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize,
    })
    if (resp.success) {
      runs.value = resp.data.items ?? []
      total.value = resp.data.total ?? 0
    } else ElMessage.error(resp.error ?? '加载失败')
  } finally {
    loading.value = false
  }
}

async function handleDelete(row: any): Promise<void> {
  await ElMessageBox.confirm(`删除运行 ${row.id} 的记录？`, '删除')
  const resp = await api().deleteRun(row.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

/** 打开「查看产物」抽屉（每条历史运行） */
function openArtifacts(id: string): void {
  artifactsRunId.value = id
  artifactsOpen.value = true
}

/** 运行 id 缩写（抽屉标题用） */
function abbrevRunId(id: string): string {
  return id && id.length > 10 ? `${id.slice(0, 10)}…` : id
}

/** 重跑：使用该次运行的输入（startInputs）直接重新运行该工作流，并跳转详情 */
const rerunningId = ref('')
async function handleRerun(row: any): Promise<void> {
  rerunningId.value = row.id
  try {
    const resp = await api().startRun({
      definitionId: row.definitionId,
      // startInputs 来自列表数据（Vue reactive Proxy），IPC 结构化克隆无法克隆 Proxy，
      // 必须先 toPlainData 纯化，否则抛 "An object could not be cloned"
      inputs: toPlainData(row.startInputs ?? {}),
    })
    if (resp.success) {
      ElMessage.success(resp.data?.status === 'skipped' ? '已有运行中实例，本次触发已跳过' : '已重新运行')
      if (resp.data?.id) router.push(`/workflow/run/${resp.data.id}`)
      else await load() // 无运行 id（异常返回）→ 刷新列表
    } else ElMessage.error(resp.error ?? '重跑失败')
  } catch (e: any) {
    // IPC/网络异常（非 {success:false} 形态）——显式提示，避免静默无反应
    ElMessage.error(`重跑失败：${e?.message ?? String(e)}`)
  } finally {
    rerunningId.value = ''
  }
}

function formatTime(t?: string | null): string {
  if (!t) return '—'
  try { return new Date(t).toLocaleString('zh-CN') } catch { return String(t) }
}
function formatDuration(stats: any, row: any): string {
  // 优先引擎统计里的时长；否则由 started/finished 推算
  const start = row.startedAt ?? row.createdAt
  const end = row.finishedAt
  if (start && end) {
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (Number.isFinite(ms) && ms >= 0) return ms < 60_000 ? `${Math.round(ms / 100) / 10}s` : `${Math.round(ms / 60000)}m`
  }
  void stats
  return '—'
}

onMounted(async () => {
  await load()
  // 全局模式：一次拉全量定义做 id→名称映射（工作流列展示 + 点击进单工作流历史）
  if (isGlobal.value) {
    const d = await api().listDefinitions({ page: 1, pageSize: 500 })
    if (d.success) {
      const map: Record<string, string> = {}
      for (const item of (d.data?.items ?? []) as Array<{ id: string; name: string }>) map[item.id] = item.name
      defNameMap.value = map
    }
  } else {
    const d = await api().getDefinition(defId.value)
    if (d.success && d.data) defName.value = d.data.name
  }
})
</script>

<style scoped>
.wf-runs-history { padding: 12px 16px; height: 100%; overflow: auto; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.title { font-weight: 600; }
.spacer { flex: 1; }
.err { color: var(--el-color-danger); }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
