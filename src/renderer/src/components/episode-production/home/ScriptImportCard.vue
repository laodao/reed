<template>
  <div class="script-import-card">
    <!-- 头部：标题 -->
    <div class="card-head">
      <el-icon class="head-icon"><Document /></el-icon>
      <span class="head-title">导入剧本</span>
      <span class="head-sub">AI 自动拆集</span>
    </div>

    <!-- 输入态：文本域 -->
    <template v-if="phase === 'input'">
      <el-input
        v-model="draft"
        type="textarea"
        :rows="10"
        resize="none"
        placeholder="粘贴完整剧本（含对白、场景描述）…
AI 会自动拆分拆集，为每集生成正式内容。
可以多写几句：人物关系、场景切换、核心冲突，写越完整拆得越准。"
        class="script-textarea"
      />
      <div class="card-actions">
        <el-button type="primary" :loading="analyzing" :disabled="!draft.trim()" @click="onAnalyzeText">
          <el-icon><MagicStick /></el-icon>
          导入拆集
        </el-button>
        <el-button :loading="analyzing" @click="onAnalyzeFile">
          <el-icon><Upload /></el-icon>
          上传 .txt
        </el-button>
      </div>
      <div v-if="error" class="error-msg">{{ error }}</div>
    </template>

    <!-- 预览确认态：拆出的剧集 -->
    <template v-else-if="phase === 'preview'">
      <div class="preview-head">
        <span>已识别 <b>{{ episodes.length }}</b> 集（来源：{{ sourceName }}）</span>
        <el-button text @click="reset"><el-icon><Refresh /></el-icon> 重新输入</el-button>
      </div>

      <!-- 项目名（多集导入需要 name 落 project） -->
      <div class="project-name-row">
        <span class="label">项目名</span>
        <el-input v-model="projectName" placeholder="未命名剧本" size="default" style="max-width: 320px" />
      </div>

      <el-table :data="episodes" border size="small" max-height="300" class="preview-table">
        <el-table-column label="序号" type="index" width="56" align="center" />
        <el-table-column label="剧集标题" min-width="360">
          <template #default="{ row }">
            <el-input v-model="row.title" size="small" placeholder="剧集标题" />
          </template>
        </el-table-column>
        <el-table-column label="字数" width="80" align="center">
          <template #default="{ row }">{{ row.content.length }}</template>
        </el-table-column>
        <el-table-column label="操作" width="72" align="center" fixed="right">
          <template #default="{ $index }">
            <el-button text type="danger" size="small" @click="removeEpisode($index)">删行</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="card-actions">
        <el-button type="primary" :loading="creating" :disabled="episodes.length === 0" @click="onCreate">
          <el-icon><Check /></el-icon>
          创建 {{ episodes.length }} 集
        </el-button>
        <el-button v-if="createdEpisodeIds.length > 0" :loading="identifying" @click="onIdentify">
          <el-icon><MagicStick /></el-icon>
          识别资产
        </el-button>
      </div>
      <div v-if="identifyResult" class="identify-result">✅ {{ identifyResult }}</div>
      <div v-if="createError" class="error-msg">{{ createError }}</div>
    </template>

    <!-- 创建完成态 -->
    <template v-else-if="phase === 'done'">
      <div class="done-box">
        <el-icon class="done-icon"><CircleCheckFilled /></el-icon>
        <p class="done-title">成功创建 <b>{{ createdCount }}</b> 个剧集</p>
        <p v-if="createdEpisodeIds.length" class="done-sub">
          <el-button type="primary" @click="openFirstEpisode">进入该剧集工作台</el-button>
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * M1 首页 · 导入剧本卡（粘贴 / 上传 txt → 预览拆集 → 建项目+剧集 → 可选识别资产）。
 * 复用后端：analyzeScriptText / analyzeScriptFile / createProject / batchCreateEpisodes /
 * batchIdentifyEntities。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, MagicStick, Upload, Refresh, Check, CircleCheckFilled } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

const emit = defineEmits<{
  /** 导入成功（刷新最近项目流） */
  (e: 'created', project: { id: string; episodeId?: string }): void
}>()

const router = useRouter()

type Phase = 'input' | 'preview' | 'creating' | 'done'
const phase = ref<Phase>('input')
const draft = ref('')
const analyzing = ref(false)
const error = ref('')
const sourceName = ref('')
const episodes = ref<Array<{ title: string; content: string }>>([])
const projectName = ref('')
const creating = ref(false)
const createError = ref('')
const createdCount = ref(0)
const createdEpisodeIds = ref<string[]>([])
const identifying = ref(false)
const lastProject = ref<{ id: string; config?: { scriptModel?: { providerConfigId?: string; modelId?: string } } } | null>(null)
const identifyResult = ref('')

function reset(): void {
  phase.value = 'input'
  analyzing.value = false
  error.value = ''
  sourceName.value = ''
  episodes.value = []
  projectName.value = ''
  creating.value = false
  createError.value = ''
  createdCount.value = 0
  createdEpisodeIds.value = []
  identifying.value = false
  identifyResult.value = ''
  lastProject.value = null
}

/** 粘贴拆集 */
async function onAnalyzeText(): Promise<void> {
  const text = draft.value.trim()
  if (!text) return
  analyzing.value = true
  error.value = ''
  try {
    const resp = await window.electronAPI.episodeProduction.analyzeScriptText(text)
    if (!resp.success) { error.value = resp.error || '分析失败'; return }
    const data = resp.data as { episodes: Array<{ title: string; content: string }> }
    applyPreview(data.episodes, '粘贴的剧本')
  } catch (e: any) {
    error.value = e?.message || '分析失败'
  } finally {
    analyzing.value = false
  }
}

/** 上传 .txt */
async function onAnalyzeFile(): Promise<void> {
  analyzing.value = true
  error.value = ''
  try {
    const resp = await window.electronAPI.episodeProduction.analyzeScriptFile()
    if (!resp.success) { error.value = resp.error || '分析失败'; return }
    const data = resp.data as { episodes: Array<{ title: string; content: string }>; fileName: string }
    applyPreview(data.episodes, data.fileName)
  } catch (e: any) {
    error.value = e?.message || '分析失败'
  } finally {
    analyzing.value = false
  }
}

function applyPreview(list: Array<{ title: string; content: string }>, source: string): void {
  episodes.value = list.map(e => ({ title: e.title, content: e.content }))
  sourceName.value = source
  // 默认项目名：取首集标题截断（≤20 字）；剧本拆分只产出每集标题，无整剧标题，需用户补
  projectName.value = (list[0]?.title || '').slice(0, 20)
  if (!list.length) { error.value = '未识别到可导入的剧集'; return }
  phase.value = 'preview'
}

function removeEpisode(index: number): void {
  episodes.value.splice(index, 1)
}

/** 确认创建：建项目（若无）+ 批量建集 */
async function onCreate(): Promise<void> {
  if (episodes.value.length === 0) return
  creating.value = true
  createError.value = ''
  try {
    const name = projectName.value.trim() || `未命名剧本 ${new Date().toLocaleDateString()}`
    // 建项目
    const proj = await window.electronAPI.episodeProduction.createProject(name)
    if (!proj.success) { createError.value = proj.error || '创建项目失败'; return }
    const project = proj.data as { id: string; config?: { scriptModel?: { providerConfigId?: string; modelId?: string } } }
    lastProject.value = project as any

    // 批量建集
    const resp = await window.electronAPI.episodeProduction.batchCreateEpisodes({
      projectId: project.id,
      episodes: episodes.value.map(e => ({ title: e.title.trim(), content: e.content })),
    })
    if (!resp.success) { createError.value = resp.error || '创建剧集失败'; return }
    const data = resp.data as { created: number; episodeIds: string[] }
    createdCount.value = data.created
    createdEpisodeIds.value = data.episodeIds || []
    phase.value = 'done'
    ElMessage.success(`成功创建 ${createdCount.value} 个剧集`)
    emit('created', { id: project.id, episodeId: createdEpisodeIds.value[0] })
  } catch (e: any) {
    createError.value = e?.message || '创建失败'
    phase.value = 'preview'
  } finally {
    creating.value = false
  }
}

/** 识别资产：对刚创建的剧集批量跑 AI 识别（走项目 config.scriptModel） */
async function onIdentify(): Promise<void> {
  const sm = lastProject.value?.config?.scriptModel
  if (!lastProject.value || createdEpisodeIds.value.length === 0) return
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('未配置剧本生成模型，请在项目设置中配置 AI 提供商与模型')
    return
  }
  identifying.value = true
  identifyResult.value = ''
  try {
    const resp = await window.electronAPI.episodeProduction.batchIdentifyEntities({
      projectId: lastProject.value.id,
      episodeIds: createdEpisodeIds.value,
      providerConfigId: sm.providerConfigId,
      modelId: sm.modelId,
    })
    if (!resp.success) { ElMessage.error(resp.error || '识别失败'); return }
    const d = resp.data as { episodes: number; characters: number; locations: number; items: number }
    identifyResult.value = `识别完成：${d.characters} 角色 / ${d.locations} 地点 / ${d.items} 物品（处理 ${d.episodes} 集，跨集已去重）`
    ElMessage.success('资产识别完成')
  } catch (e: any) {
    ElMessage.error(e?.message || '识别失败')
  } finally {
    identifying.value = false
  }
}

/** 进入新建剧集工作台 */
function openFirstEpisode(): void {
  const pid = lastProject.value?.id
  const eid = createdEpisodeIds.value[0]
  if (pid && eid) {
    router.push(`/episode-production/${pid}/studio/${eid}`)
  } else if (pid) {
    router.push(`/episode-production/${pid}`)
  }
}
</script>

<style lang="scss" scoped>
.script-import-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: 22px 28px;
  box-shadow: var(--shadow-sm);
  width: 100%;
  max-width: 760px;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  .head-icon { color: var(--color-primary); font-size: 18px; }
  .head-title { font-size: 16px; font-weight: 600; color: var(--text-color-primary); }
  .head-sub { font-size: 12px; color: var(--text-color-secondary); background: var(--fill-color-light); padding: 2px 8px; border-radius: var(--radius-full); }
}

.script-textarea {
  :deep(.el-textarea__inner) {
    font-size: 13px;
    line-height: 1.8;
    color: var(--text-color-regular);
    font-family: inherit;
  }
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.error-msg {
  color: var(--color-danger);
  font-size: 13px;
  background: var(--color-danger-light-9);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  margin-top: 12px;
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-color-primary);
  margin-bottom: 10px;
}

.project-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  .label { font-size: 13px; color: var(--text-color-secondary); }
}

.preview-table { width: 100%; }

.identify-result {
  color: var(--color-success);
  font-size: 13px;
  background: var(--fill-color-light);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  margin-top: 12px;
  text-align: center;
}

.done-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 30px 0;
  .done-icon { font-size: 48px; color: var(--color-success); }
  .done-title { margin: 0; font-size: 16px; color: var(--text-color-primary); }
  .done-sub { margin: 0; }
}
</style>
