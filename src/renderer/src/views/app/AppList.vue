<template>
  <div class="app-list">
    <div class="toolbar">
      <div>
        <div class="page-title">应用</div>
        <div class="page-desc">已发布的工作流应用——分发到会话、分享链接、API 或定时运行</div>
      </div>
      <el-button type="primary" @click="openCreateDialog">＋ 从工作流创建应用</el-button>
    </div>

    <el-table :data="apps" v-loading="loading" style="width: 100%">
      <el-table-column label="应用" min-width="240">
        <template #default="{ row }">
          <div class="app-cell">
            <span class="app-emoji">{{ row.icon || '📦' }}</span>
            <div>
              <div class="app-name">{{ row.name }}</div>
              <div class="app-ver">来自工作流 · v{{ row.sourceVersion ?? 0 }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="渠道" width="220">
        <template #default="{ row }">
          <div class="channels">
            <span class="cdot" :class="{ on: row.channelSession === 1 }">💬 会话</span>
            <span class="cdot" :class="{ on: row.channelShare === 1 }">🔗 分享</span>
            <span class="cdot" :class="{ on: row.channelApi === 1 }">🔌 API</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="会话数" width="90">
        <template #default="{ row }">{{ row.sessionCount ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.enabled === 1 ? 'success' : 'info'" size="small">{{ row.enabled === 1 ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="router.push(`/apps/${row.id}`)">详情</el-button>
          <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 从工作流创建 -->
    <el-dialog v-model="createVisible" title="从已发布工作流创建应用" width="520px">
      <el-select v-model="createDefId" placeholder="选择已发布的工作流" style="width: 100%" filterable>
        <el-option v-for="d in publishedDefs" :key="d.id" :label="`${d.name}（v${d.publishedVersion}）`" :value="d.id" />
      </el-select>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!createDefId" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 应用列表页（片3b，对齐原型①）：应用卡片列表 + 从工作流创建 + 删除
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const api = () => (window as never as { electronAPI: { app: any; workflow: any } }).electronAPI

const apps = ref<any[]>([])
const loading = ref(false)
const createVisible = ref(false)
const publishedDefs = ref<any[]>([])
const createDefId = ref('')
const creating = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const resp = await api().app.list({ page: 1, pageSize: 100 })
    if (resp.success) apps.value = resp.data.items ?? []
    else ElMessage.error(resp.error ?? '加载失败')
  } finally {
    loading.value = false
  }
}

async function openCreateDialog(): Promise<void> {
  const resp = await api().workflow.listDefinitions({ page: 1, pageSize: 100 })
  if (resp.success) {
    publishedDefs.value = (resp.data.items ?? []).filter((d: any) => (d.publishedVersion ?? 0) > 0)
    if (publishedDefs.value.length === 0) { ElMessage.info('没有已发布的工作流，请先在工作流编辑器发布'); return }
    createVisible.value = true
  } else ElMessage.error(resp.error ?? '获取工作流失败')
}

async function handleCreate(): Promise<void> {
  if (!createDefId.value) return
  creating.value = true
  try {
    const resp = await api().app.createFromWorkflow({ definitionId: createDefId.value })
    if (resp.success) {
      ElMessage.success('应用创建成功')
      createVisible.value = false
      router.push(`/apps/${resp.data.id}`)
    } else ElMessage.error(resp.error ?? '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleDelete(row: any): Promise<void> {
  await ElMessageBox.confirm(`删除应用「${row.name}」？其会话与记录将一并删除，不可恢复。`, '删除应用', { type: 'warning' })
  const resp = await api().app.delete(row.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

onMounted(load)
</script>

<style scoped>
.app-list { padding: 20px 26px; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; }
.app-cell { display: flex; align-items: center; gap: 10px; }
.app-emoji { font-size: 24px; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--el-fill-color-light); }
.app-name { font-weight: 600; }
.app-ver { font-size: 12px; color: var(--el-text-color-secondary); }
.channels { display: flex; gap: 6px; }
.cdot { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.cdot.on { background: var(--el-color-success-light-9); color: var(--el-color-success); }
</style>