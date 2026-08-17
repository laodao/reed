<template>
  <div class="workflow-list page-container">
    <div class="page-header">
      <h2>工作流</h2>
      <div class="actions">
        <el-button @click="showImport = true">导入</el-button>
        <el-button type="primary" @click="handleCreate">新建工作流</el-button>
      </div>
    </div>

    <el-table :data="items" v-loading="loading" empty-text="暂无工作流，点击右上角新建">
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column label="发布版本" width="100">
        <template #default="{ row }">
          <el-tag :type="row.publishedVersion > 0 ? 'success' : 'info'" size="small">
            {{ row.publishedVersion > 0 ? `v${row.publishedVersion}` : '未发布' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近运行" width="170">
        <template #default="{ row }">{{ formatTime(row.lastRunAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="handleRun(row)">运行</el-button>
          <el-button text size="small" @click="handleHistory(row)">历史</el-button>
          <el-button text size="small" @click="handlePublish(row)">发布</el-button>
          <el-button text size="small" @click="handleExport(row)">导出</el-button>
          <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 运行输入对话框 -->
    <el-dialog v-model="showRunInputs" :title="`运行：${runningDef?.name ?? ''}`" width="480px">
      <p class="hint">输入参数（JSON 对象，对应开始节点定义；无参数可直接运行）</p>
      <el-input v-model="runInputsJson" type="textarea" :rows="5" placeholder='{ "topic": "AI" }' />
      <template #footer>
        <el-button @click="showRunInputs = false">取消</el-button>
        <el-button type="primary" :loading="starting" @click="confirmRun">开始运行</el-button>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog v-model="showImport" title="导入工作流" width="520px">
      <input type="file" accept=".json" @change="onImportFile" />
      <p class="hint">选择此前导出的工作流 JSON 文件；同名时将创建"（导入）"副本</p>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WorkflowList' })
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { saveBlobAs } from '@/utils/file-saver'

const router = useRouter()
const items = ref<any[]>([])
const loading = ref(false)
const showRunInputs = ref(false)
const showImport = ref(false)
const runningDef = ref<any>(null)
const runInputsJson = ref('')
const starting = ref(false)

const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

async function load() {
  loading.value = true
  try {
    const resp = await api().listDefinitions({ page: 1, pageSize: 50 })
    if (resp.success && resp.data) items.value = resp.data.items
    else if (resp.error) ElMessage.error(resp.error)
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  const { value } = await ElMessageBox.prompt('工作流名称', '新建工作流', { inputValue: '未命名工作流' })
  const resp = await api().createDefinition({ name: value })
  if (resp.success) {
    ElMessage.success('已创建（画布编辑器在下一阶段提供）')
    await load()
  } else ElMessage.error(resp.error)
}

function handleRun(row: any) {
  runningDef.value = row
  runInputsJson.value = ''
  showRunInputs.value = true
}

async function confirmRun() {
  let inputs: Record<string, unknown> | undefined
  if (runInputsJson.value.trim()) {
    try {
      inputs = JSON.parse(runInputsJson.value)
    } catch {
      ElMessage.error('输入参数不是有效 JSON')
      return
    }
  }
  starting.value = true
  try {
    const resp = await api().startRun({ definitionId: runningDef.value.id, inputs })
    if (resp.success) {
      ElMessage.success(resp.data?.status === 'skipped' ? '已有运行中实例，本次触发已跳过' : '已启动')
      showRunInputs.value = false
      router.push(`/workflow/run/${resp.data.id}`)
    } else ElMessage.error(resp.error)
  } finally {
    starting.value = false
  }
}

function handleHistory(row: any) {
  router.push(`/workflow/runs/${row.id}`)
}

async function handlePublish(row: any) {
  const resp = await api().publishDefinition({ id: row.id })
  if (resp.success) {
    ElMessage.success(`已发布 v${row.publishedVersion + 1}`)
    await load()
  } else ElMessage.error(resp.error)
}

async function handleExport(row: any) {
  const resp = await api().exportDefinition(row.id)
  if (resp.success && resp.data) {
    const result = await saveBlobAs(new Blob([resp.data.content], { type: 'application/json' }), {
      defaultName: `${resp.data.name}.workflow.json`,
    })
    if (result.success) ElMessage.success('已导出')
  } else ElMessage.error(resp.error)
}

async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const content = await file.text()
  const resp = await api().importDefinition({ content })
  if (resp.success) {
    ElMessage.success('导入成功')
    showImport.value = false
    await load()
  } else ElMessage.error(resp.error)
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm(`删除工作流「${row.name}」？运行历史将保留。`, '确认', { type: 'warning' })
  const resp = await api().deleteDefinition(row.id)
  if (resp.success) await load()
  else ElMessage.error(resp.error)
}

function formatTime(t: string | null) {
  if (!t) return '—'
  return new Date(t).toLocaleString('zh-CN')
}

onMounted(load)
</script>

<style scoped>
.page-container { padding: 20px; height: 100%; overflow: auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.hint { color: var(--el-text-color-secondary); font-size: 12px; margin: 8px 0; }
</style>
