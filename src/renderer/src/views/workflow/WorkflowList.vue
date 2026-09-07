<template>
  <div class="workflow-list page-container">
    <div class="page-header">
      <h2>工作流</h2>
      <div class="actions">
        <el-input v-model="search" placeholder="按名称搜索…" clearable size="small" style="width: 200px"
          @keyup.enter="onSearch" @clear="onSearch" />
        <el-button @click="showImport = true">导入</el-button>
        <el-button @click="showTemplates = true">从模板创建</el-button>
        <el-button type="success" plain @click="showDraftNl = true">从描述创建</el-button>
        <el-button type="primary" @click="handleCreate">新建工作流</el-button>
      </div>
    </div>

    <!-- 表格区：固定高度内部滚动，表头 sticky（分页固定在底部） -->
    <div class="table-wrap">
      <el-table :data="items" v-loading="loading" height="100%" empty-text="暂无工作流，点击右上角新建" @sort-change="handleSortChange">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="发布状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.publishedVersion > 0 ? 'success' : 'info'" size="small">
              {{ row.publishedVersion > 0 ? `已发布 v${row.publishedVersion}` : '未发布' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160" sortable="custom">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="publishedAt" label="发布时间" width="160" sortable="custom">
          <template #default="{ row }">{{ formatTime(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column prop="lastRunAt" label="最近运行" width="160" sortable="custom">
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

    <!-- 新建工作流对话框 -->
    <el-dialog v-model="showCreate" title="新建工作流" width="480px">
      <el-form label-width="110px" label-position="left">
        <el-form-item label="工作流名称" required>
          <el-input v-model="createForm.name" placeholder="如：长文写作 / 每日早报" />
        </el-form-item>
        <el-form-item label="多轮对话">
          <el-switch v-model="createForm.multiTurn" />
          <div class="hint">开启后工作流内 LLM 节点按执行顺序共享对话上下文（前面 LLM 调用结果会进入后续节点的历史）；关闭=节点间仅靠 {{变量}} 显式传递（默认）</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" :disabled="!createForm.name.trim()" @click="confirmCreate">创建</el-button>
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
  
    <!-- 从描述创建（31 号 M7）：NL → 工作流草稿 → 编辑器 -->
    <el-dialog v-model="showDraftNl" title="从描述创建工作流" width="520px" :close-on-click-modal="!draftNlLoading" :close-on-press-escape="!draftNlLoading" :show-close="!draftNlLoading">
      <div class="draft-nl-hint">描述你想自动化的流程（做什么、输入是什么、产出什么），AI 会生成工作流草稿，创建后进入编辑器检查并发布。</div>
      <el-input
        v-model="draftNlDescription"
        type="textarea"
        :rows="4"
        maxlength="1000"
        show-word-limit
        placeholder="例：抓取某个网页的正文，翻译成英文，再把结果存进数据表"
      />
      <template #footer>
        <el-button @click="showDraftNl = false">取消</el-button>
        <el-button type="primary" :loading="draftNlLoading" @click="handleDraftFromNl">生成草稿</el-button>
      </template>
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
const showCreate = ref(false)
const createForm = ref({ name: '', multiTurn: false })
const runningDef = ref<any>(null)
const starting = ref(false)

// ---- 搜索与排序（默认创建时间降序；表头点击切换字段/方向） ----
const search = ref('')
const sortBy = ref<'createdAt' | 'publishedAt' | 'lastRunAt'>('createdAt')
const sortOrder = ref<'asc' | 'desc'>('desc')

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
const showDraftNl = ref(false)
const draftNlDescription = ref('')
const draftNlLoading = ref(false)
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
    const resp = await api().listDefinitions({
      page: page.value,
      pageSize: pageSize.value,
      keyword: search.value.trim() || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    })
    if (resp.success && resp.data) {
      items.value = resp.data.items
      total.value = resp.data.total ?? 0
    } else if (resp.error) ElMessage.error(resp.error)
  } finally {
    loading.value = false
  }
}

/** 搜索：回到第一页并重载 */
function onSearch() {
  page.value = 1
  void load()
}

/** 表头排序（点击切换字段与方向） */
function handleSortChange({ prop, order }: { prop: string | null; order: string | null }) {
  if (prop === 'createdAt' || prop === 'publishedAt' || prop === 'lastRunAt') {
    sortBy.value = prop
    sortOrder.value = order === 'ascending' ? 'asc' : 'desc'
  } else {
    // 取消排序 → 恢复默认（创建时间降序）
    sortBy.value = 'createdAt'
    sortOrder.value = 'desc'
  }
  page.value = 1
  void load()
}

function handlePageChange() {
  void load()
}

// 从描述创建（31 号 M7）：NL → 工作流草稿 → 跳编辑器
async function handleDraftFromNl(): Promise<void> {
  const description = draftNlDescription.value.trim()
  if (!description) {
    ElMessage.warning('请先描述你想要的工作流')
    return
  }
  draftNlLoading.value = true
  try {
    const resp = await (window as never as { electronAPI: { workflow: { draftFromNl: (p: { description: string }) => Promise<{ success: boolean; data?: { definitionId: string; name: string }; error?: string }> } } }).electronAPI.workflow.draftFromNl({ description })
    if (resp.success && resp.data) {
      showDraftNl.value = false
      draftNlDescription.value = ''
      ElMessage.success('草稿已生成，请在编辑器中检查并发布')
      void router.push(`/workflow/editor/${resp.data.definitionId}`)
    } else {
      ElMessage.error(resp.error ?? '生成失败')
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '生成失败')
  } finally {
    draftNlLoading.value = false
  }
}

async function handleCreate() {
  createForm.value = { name: '', multiTurn: false }
  showCreate.value = true
}

async function confirmCreate() {
  const value = createForm.value.name.trim()
  if (!value) return
  const resp = await api().createDefinition({ name: value, settings: { multiTurn: createForm.value.multiTurn } })
  if (resp.success) {
    ElMessage.success(`已创建${createForm.value.multiTurn ? '（已开启多轮对话）' : ''}`)
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
.draft-nl-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 10px; line-height: 1.6; }
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
