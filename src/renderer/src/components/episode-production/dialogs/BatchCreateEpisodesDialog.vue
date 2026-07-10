<template>
  <!--
    BatchCreateEpisodesDialog · 批量创建剧集

    在剧集项目界面由「批量创建剧集」按钮唤起：
      选剧本文件 → 后端按章节拆分（StructureDetector）→ 预览可编辑表格
      → 确认 → 批量建集（uploaded 模式，episodeNumber 续号）→ emit('created') 让父刷新。

    链路：ep:analyze-script-file（选文件+提取+拆分）→ ep:batch-create-episodes（循环落库）。
  -->
  <el-dialog
    v-model="visible"
    title="批量创建剧集"
    width="980px"
    :close-on-click-modal="false"
    @close="onClose"
  >
    <div class="batch-body">
      <!-- 步骤 1：选择文件 -->
      <section v-if="phase === 'input'" class="step-input">
        <div class="hint-row">
          上传一个按章节组织的剧本文件（txt / md / docx / pdf / epub），系统按
          「第X章 / Chapter N / # 标题」自动拆分成多集，确认后一次性创建。
        </div>
        <el-button type="primary" size="large" :loading="analyzing" @click="onSelectFile">
          <el-icon><Upload /></el-icon>
          选择剧本文件并分析
        </el-button>
        <div v-if="analyzeError" class="error-msg">❌ {{ analyzeError }}</div>
      </section>

      <!-- 步骤 2：预览 -->
      <section v-if="phase === 'preview'" class="step-preview">
        <div class="preview-header">
          <span>已识别 <b>{{ episodes.length }}</b> 集（来源：{{ fileName }}）</span>
          <el-button text @click="onReset">重新选择</el-button>
        </div>
        <el-table :data="episodes" border size="small" max-height="500">
          <el-table-column label="序号" type="index" width="64" align="center" />
          <el-table-column label="剧集标题" min-width="420">
            <template #default="{ row }">
              <el-input v-model="row.title" size="small" placeholder="剧集标题" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="字数" width="90" align="center">
            <template #default="{ row }">{{ row.content.length }}</template>
          </el-table-column>
          <el-table-column label="操作" width="96" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button text type="danger" size="small" @click="removeEpisode($index)">删行</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="createError" class="error-msg">❌ {{ createError }}</div>
      </section>

      <!-- 步骤 3：创建中 -->
      <section v-if="phase === 'creating'" class="step-creating">
        <div class="creating-msg">
          <el-icon class="is-loading"><Loading /></el-icon>
          正在批量创建 {{ pendingCount }} 个剧集...
        </div>
      </section>

      <!-- 步骤 4：完成 -->
      <section v-if="phase === 'done'" class="step-done">
        <div class="done-msg">✅ 成功创建 {{ createdCount }} 个剧集。</div>
        <div class="identify-section">
          <div v-if="!hasScriptModel" class="warn-row">
            ⚠️ 未配置「剧本生成模型」，无法识别资产。请先在项目设置中配置 AI 提供商与模型。
          </div>
          <el-button
            v-else-if="!identifyResult"
            type="primary"
            plain
            :loading="identifying"
            :disabled="createdEpisodeIds.length === 0"
            @click="onIdentify"
          >
            <el-icon><MagicStick /></el-icon>
            ✨ 识别资产（人物/物品/环境）
          </el-button>
          <div v-if="identifying" class="creating-msg">
            <el-icon class="is-loading"><Loading /></el-icon>
            正在识别 {{ createdEpisodeIds.length }} 集的资产...
          </div>
          <div v-if="identifyResult" class="identify-result">
            ✅ {{ identifyResult }}
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <el-button v-if="phase === 'input' || phase === 'done'" @click="visible = false">关闭</el-button>
      <el-button v-if="phase === 'preview'" @click="onReset">重新选择</el-button>
      <el-button
        v-if="phase === 'preview'"
        type="primary"
        :disabled="episodes.length === 0"
        @click="onConfirm"
      >
        创建 {{ episodes.length }} 集
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Loading, MagicStick } from '@element-plus/icons-vue'
import { useEpProjectStore } from '@/stores/episode-production'

const props = defineProps<{
  modelValue: boolean
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** 批量创建成功 → 父组件刷新剧集列表 */
  (e: 'created'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const projectStore = useEpProjectStore()

type Phase = 'input' | 'preview' | 'creating' | 'done'
const phase = ref<Phase>('input')
const analyzing = ref(false)
const analyzeError = ref('')
const createError = ref('')
const fileName = ref('')
const episodes = ref<Array<{ title: string; content: string }>>([])
const pendingCount = ref(0)
const createdCount = ref(0)
const createdEpisodeIds = ref<string[]>([])
const identifying = ref(false)
const identifyResult = ref('')

/** 项目剧本生成模型（识别资产用，未配置则禁用识别） */
const sm = computed(() => projectStore.currentProject?.config?.scriptModel)
const hasScriptModel = computed(() => !!sm.value?.providerConfigId && !!sm.value?.modelId)

// 每次打开重置
watch(
  () => props.modelValue,
  (v) => {
    if (v) onReset()
  },
)

function onReset(): void {
  phase.value = 'input'
  analyzing.value = false
  analyzeError.value = ''
  createError.value = ''
  fileName.value = ''
  episodes.value = []
  pendingCount.value = 0
  createdCount.value = 0
  createdEpisodeIds.value = []
  identifying.value = false
  identifyResult.value = ''
}

function onClose(): void {
  // 关闭时若已创建成功，确保父组件已收到 created（onConfirm 里已 emit）
  onReset()
}

async function onSelectFile(): Promise<void> {
  analyzing.value = true
  analyzeError.value = ''
  try {
    const resp = await window.electronAPI.episodeProduction.analyzeScriptFile()
    if (!resp.success) {
      analyzeError.value = resp.error || '分析失败'
      return
    }
    const data = resp.data as {
      fileName: string
      episodes: Array<{ title: string; content: string }>
    }
    fileName.value = data.fileName
    episodes.value = (data.episodes || []).map((e) => ({ title: e.title, content: e.content }))
    phase.value = 'preview'
  } catch (e: any) {
    analyzeError.value = e?.message || '分析失败'
  } finally {
    analyzing.value = false
  }
}

function removeEpisode(index: number): void {
  episodes.value.splice(index, 1)
}

async function onConfirm(): Promise<void> {
  if (episodes.value.length === 0) return
  pendingCount.value = episodes.value.length
  phase.value = 'creating'
  createError.value = ''
  try {
    const resp = await window.electronAPI.episodeProduction.batchCreateEpisodes({
      projectId: props.projectId,
      episodes: episodes.value.map((e) => ({ title: e.title.trim(), content: e.content })),
    })
    if (!resp.success) {
      createError.value = resp.error || '创建失败'
      phase.value = 'preview'
      return
    }
    const data = resp.data as { created: number; episodeIds: string[] }
    createdCount.value = data.created
    createdEpisodeIds.value = data.episodeIds || []
    phase.value = 'done'
    ElMessage.success(`成功创建 ${createdCount.value} 个剧集`)
    emit('created')
  } catch (e: any) {
    createError.value = e?.message || '创建失败'
    phase.value = 'preview'
  }
}

/** 识别资产：对刚创建的剧集批量跑 AI 识别角色/地点/物品（跨集去重） */
async function onIdentify(): Promise<void> {
  if (!hasScriptModel.value || createdEpisodeIds.value.length === 0) return
  identifying.value = true
  identifyResult.value = ''
  try {
    const resp = await window.electronAPI.episodeProduction.batchIdentifyEntities({
      projectId: props.projectId,
      episodeIds: createdEpisodeIds.value,
      providerConfigId: sm.value!.providerConfigId,
      modelId: sm.value!.modelId,
    })
    if (!resp.success) {
      ElMessage.error(resp.error || '识别失败')
      return
    }
    const d = resp.data as { episodes: number; characters: number; locations: number; items: number }
    identifyResult.value = `识别完成：${d.characters} 角色 / ${d.locations} 地点 / ${d.items} 物品（处理 ${d.episodes} 集，跨集已去重）`
    ElMessage.success('资产识别完成')
  } catch (e: any) {
    ElMessage.error(e?.message || '识别失败')
  } finally {
    identifying.value = false
  }
}
</script>

<style scoped lang="scss">
.batch-body {
  min-height: 120px;
}

.hint-row {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 10px 12px;
  border-radius: 6px;
  border-left: 3px solid var(--el-color-primary);
  margin-bottom: 16px;
  line-height: 1.6;
}

.step-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 0;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.error-msg {
  color: var(--el-color-danger);
  font-size: 13px;
  background: var(--el-color-danger-light-9);
  padding: 10px 12px;
  border-radius: 4px;
  margin-top: 12px;
}

.creating-msg {
  text-align: center;
  padding: 40px 0;
  color: var(--el-color-primary);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.done-msg {
  color: var(--el-color-success);
  font-size: 14px;
  background: var(--el-color-success-light-9);
  padding: 20px;
  border-radius: 4px;
  text-align: center;
  margin: 20px 0;
}

.identify-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.identify-result {
  color: var(--el-color-success);
  font-size: 13px;
  background: var(--el-fill-color-light);
  padding: 10px 14px;
  border-radius: 4px;
  width: 100%;
  text-align: center;
}

.warn-row {
  font-size: 13px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 8px 12px;
  border-radius: 4px;
}
</style>
