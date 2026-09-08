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
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="待审" name="pending">
        <el-table :data="pending" size="small" empty-text="暂无待审条目">
          <el-table-column label="类型" width="90">
            <template #default="{ row }"><el-tag size="small" disable-transitions>{{ row.kind }}</el-tag></template>
          </el-table-column>
          <el-table-column label="标题" min-width="160">
            <template #default="{ row }">{{ row.content.title }}</template>
          </el-table-column>
          <el-table-column label="内容" min-width="260">
            <template #default="{ row }"><span class="content">{{ row.content.content }}</span></template>
          </el-table-column>
          <el-table-column label="置信度" width="90">
            <template #default="{ row }">{{ row.confidence != null ? row.confidence.toFixed(2) : '—' }}</template>
          </el-table-column>
          <el-table-column label="层级" width="140">
            <template #default="{ row }">{{ layerLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button text type="success" size="small" @click="approve(row)">批准</el-button>
              <el-button text type="danger" size="small" @click="reject(row)">驳回</el-button>
              <el-button text size="small" @click="archive(row)">归档</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="已生效" name="active">
        <el-table :data="active" size="small" empty-text="暂无生效条目">
          <el-table-column label="类型" width="90">
            <template #default="{ row }"><el-tag size="small" type="info" disable-transitions>{{ row.kind }}</el-tag></template>
          </el-table-column>
          <el-table-column label="标题" min-width="160">
            <template #default="{ row }">{{ row.content.title }}</template>
          </el-table-column>
          <el-table-column label="内容" min-width="260">
            <template #default="{ row }"><span class="content">{{ row.content.content }}</span></template>
          </el-table-column>
          <el-table-column label="命中/成功" width="100">
            <template #default="{ row }">{{ row.useCount }} / {{ row.successCount }}</template>
          </el-table-column>
          <el-table-column label="层级" width="140">
            <template #default="{ row }">{{ layerLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button text type="danger" size="small" @click="archive(row)">归档</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
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
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'

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
}

const manualVisible = ref(false)
const manual = ref({ kind: 'fact', title: '', content: '', bizModule: '', projectId: '' })

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
  const apiObj = api()
  const resp = await (apiObj as unknown as { rejectMemory?: WfMethod }).rejectMemory?.(row.id)
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

const tab = ref<'pending' | 'active'>('pending')
const pending = ref<MemoryRow[]>([])
const active = ref<MemoryRow[]>([])

async function load(): Promise<void> {
  const p = await api().listMemoryPending()
  if (p.success) pending.value = (p.data ?? []) as never
  const a = await api().listMemoryActive()
  if (a.success) active.value = (a.data ?? []) as never
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
watch(tab, () => { void load() })
</script>

<style scoped>
.page-container { padding: 20px; height: 100%; overflow: auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.meta { color: var(--el-text-color-secondary); font-size: 13px; }
.content { font-size: 12px; color: var(--el-text-color-regular); }
</style>
