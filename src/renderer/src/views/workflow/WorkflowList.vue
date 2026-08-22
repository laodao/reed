<template>
  <div class="workflow-list page-container">
    <div class="page-header">
      <h2>工作流</h2>
      <div class="actions">
        <el-button @click="showImport = true">导入</el-button>
        <el-button @click="showTemplates = true">从模板创建</el-button>
        <el-button type="primary" @click="handleCreate">新建工作流</el-button>
      </div>
    </div>

    <!-- 表格区：固定高度内部滚动，表头 sticky（分页固定在底部） -->
    <div class="table-wrap">
      <el-table :data="items" v-loading="loading" height="100%" empty-text="暂无工作流，点击右上角新建">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="发布状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.publishedVersion > 0 ? 'success' : 'info'" size="small">
              {{ row.publishedVersion > 0 ? `已发布 v${row.publishedVersion}` : '未发布' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="发布时间" width="160">
          <template #default="{ row }">{{ formatTime(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column label="最近运行" width="160">
          <template #default="{ row }">{{ formatTime(row.lastRunAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right" align="center">
          <template #default="{ row }">
            <el-tooltip content="运行" placement="top">
              <el-button circle size="small" type="primary" @click="handleRun(row)">
                <el-icon><VideoPlay /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="编辑" placement="top">
              <el-button circle size="small" @click="router.push(`/workflow/editor/${row.id}`)">
                <el-icon><Edit /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="历史" placement="top">
              <el-button circle size="small" @click="handleHistory(row)">
                <el-icon><Clock /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="发布" placement="top">
              <el-button circle size="small" type="success" plain @click="handlePublish(row)">
                <el-icon><Upload /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="导出" placement="top">
              <el-button circle size="small" @click="handleExport(row)">
                <el-icon><Download /></el-icon>
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
    </div>

    <!-- 分页固定底部 -->
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="handlePageChange"
        @size-change="handlePageChange"
      />
    </div>

    <!-- 运行输入对话框（宽度容纳复杂表单字段） -->
    <el-dialog v-model="showRunInputs" :title="`运行：${runningDef?.name ?? ''}`" width="min(640px, 92vw)">
      <RunInputForm ref="runInputRef" :inputs="runInputDefs" @valid="v => runInputsValid = v" />
      <template #footer>
        <el-button @click="showRunInputs = false">取消</el-button>
        <el-button type="primary" :loading="starting" @click="confirmRun">开始运行</el-button>
      </template>
    </el-dialog>

    <!-- 模板选择对话框 -->
    <el-dialog v-model="showTemplates" title="从模板创建" width="560px">
      <div v-for="tpl in builtinTemplates" :key="tpl.name" class="tpl-card" @click="createFromTemplate(tpl)">
        <div class="tpl-head">
          <span class="tpl-name">{{ tpl.title }}</span>
          <el-tag size="small" type="info">{{ tpl.nodeCount }} 个组件</el-tag>
        </div>
        <div class="tpl-desc">{{ tpl.desc }}</div>
      </div>
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
import { VideoPlay, Edit, Clock, Upload, Download, Delete } from '@element-plus/icons-vue'
import { saveBlobAs } from '@/utils/file-saver'
import RunInputForm from '@/components/workflow/RunInputForm.vue'

const router = useRouter()
const items = ref<any[]>([])
const loading = ref(false)
const showRunInputs = ref(false)
const showImport = ref(false)
const runningDef = ref<any>(null)
const starting = ref(false)

// ---- 分页（表头/分页固定，表格内部滚动） ----
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

// 内置模板（B6：编辑器搭好→导出→置于此处；模板即数据资产）
import ragTpl from '@/assets/workflow-templates/rag-qa.json'
import translateTpl from '@/assets/workflow-templates/batch-translate.json'
import reviewTpl from '@/assets/workflow-templates/content-review.json'
import digestTpl from '@/assets/workflow-templates/daily-digest.json'
import videoTpl from '@/assets/workflow-templates/video-transcript.json'
// 能力应用模板（阶段二：图像生成/翻译/TTS/STT/语音复刻 → 发布为应用）
import imageGenAppTpl from '@/assets/workflow-templates/image-gen-app.json'
import translateAppTpl from '@/assets/workflow-templates/translate-app.json'
import ttsAppTpl from '@/assets/workflow-templates/tts-app.json'
import sttAppTpl from '@/assets/workflow-templates/stt-app.json'
import voiceCloneAppTpl from '@/assets/workflow-templates/voice-clone-app.json'

const showTemplates = ref(false)
const builtinTemplates = [
  { name: ragTpl.name, title: ragTpl.name, desc: ragTpl.description, nodeCount: ragTpl.graph.nodes.length, raw: ragTpl },
  { name: translateTpl.name, title: translateTpl.name, desc: translateTpl.description, nodeCount: translateTpl.graph.nodes.length, raw: translateTpl },
  { name: reviewTpl.name, title: reviewTpl.name, desc: reviewTpl.description, nodeCount: reviewTpl.graph.nodes.length, raw: reviewTpl },
  { name: digestTpl.name, title: digestTpl.name, desc: digestTpl.description, nodeCount: digestTpl.graph.nodes.length, raw: digestTpl },
  { name: videoTpl.name, title: videoTpl.name, desc: videoTpl.description, nodeCount: videoTpl.graph.nodes.length, raw: videoTpl },
  { name: imageGenAppTpl.name, title: imageGenAppTpl.name, desc: imageGenAppTpl.description, nodeCount: imageGenAppTpl.graph.nodes.length, raw: imageGenAppTpl },
  { name: translateAppTpl.name, title: translateAppTpl.name, desc: translateAppTpl.description, nodeCount: translateAppTpl.graph.nodes.length, raw: translateAppTpl },
  { name: ttsAppTpl.name, title: ttsAppTpl.name, desc: ttsAppTpl.description, nodeCount: ttsAppTpl.graph.nodes.length, raw: ttsAppTpl },
  { name: sttAppTpl.name, title: sttAppTpl.name, desc: sttAppTpl.description, nodeCount: sttAppTpl.graph.nodes.length, raw: sttAppTpl },
  { name: voiceCloneAppTpl.name, title: voiceCloneAppTpl.name, desc: voiceCloneAppTpl.description, nodeCount: voiceCloneAppTpl.graph.nodes.length, raw: voiceCloneAppTpl },
]

async function createFromTemplate(tpl: any) {
  const resp = await api().importDefinition({ content: JSON.stringify(tpl.raw), duplicatePolicy: 'copy' })
  if (resp.success) {
    ElMessage.success('已从模板创建')
    showTemplates.value = false
    await load()
    if (resp.data?.id) router.push(`/workflow/editor/${resp.data.id}`)
  } else ElMessage.error(resp.error)
}

async function load() {
  loading.value = true
  try {
    const resp = await api().listDefinitions({ page: page.value, pageSize: pageSize.value })
    if (resp.success && resp.data) {
      items.value = resp.data.items
      total.value = resp.data.total ?? 0
    } else if (resp.error) ElMessage.error(resp.error)
  } finally {
    loading.value = false
  }
}

function handlePageChange() {
  void load()
}

async function handleCreate() {
  const { value } = await ElMessageBox.prompt('工作流名称', '新建工作流', { inputValue: '未命名工作流' })
  const resp = await api().createDefinition({ name: value })
  if (resp.success) {
    ElMessage.success('已创建')
    await load()
    if (resp.data?.id) router.push(`/workflow/editor/${resp.data.id}`)
  } else ElMessage.error(resp.error)
}

const runInputRef = ref<any>(null)
const runInputsValid = ref(true)
const runInputDefs = ref<any[]>([])

async function handleRun(row: any) {
  runningDef.value = row
  // 拉取定义以取 start inputs（列表行不含图）
  const resp = await api().getDefinition(row.id)
  const graph = resp.success ? resp.data?.draftGraph ?? resp.data?.publishedGraph : null
  const startNode = graph?.nodes?.find((nd: any) => nd.type === 'start')
  runInputDefs.value = startNode?.config?.inputs ?? []
  showRunInputs.value = true
}

async function confirmRun() {
  const inputs = runInputRef.value?.getValues() ?? {}
  if (!runInputsValid.value) {
    ElMessage.warning('请填写必填参数')
    return
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
/* 三区固定布局：header 固定 / 表格内部滚动（表头 sticky）/ 分页固定底部 */
.page-container { padding: 20px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0; }
.table-wrap { flex: 1; min-height: 0; overflow: hidden; }
.table-wrap :deep(.el-table) { width: 100%; }
.pager { flex-shrink: 0; display: flex; justify-content: flex-end; padding-top: 14px; }
.hint { color: var(--el-text-color-secondary); font-size: 12px; margin: 8px 0; }
.tpl-card { border: 1px solid var(--el-border-color); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; cursor: pointer; transition: border-color .15s; }
.tpl-card:hover { border-color: var(--el-color-primary); }
.tpl-head { display: flex; justify-content: space-between; align-items: center; }
.tpl-name { font-weight: 600; }
.tpl-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 6px; }
.el-table .el-button + .el-button { margin-left: 6px; }
</style>
