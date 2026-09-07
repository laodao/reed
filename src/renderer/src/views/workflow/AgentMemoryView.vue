<template>
  <div class="agent-memory page-container">
    <div class="page-header">
      <div>
        <h2>知识飞轮</h2>
        <span class="meta">任务经验的沉淀与复用——蒸馏候选经人工批准才生效（宁可慢不可脏）</span>
      </div>
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
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button text type="success" size="small" @click="approve(row)">批准</el-button>
              <el-button text type="danger" size="small" @click="archive(row)">归档</el-button>
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
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button text type="danger" size="small" @click="archive(row)">归档</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
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
