<template>
  <div class="ic-project">
    <!-- 三态：失败 / 不存在 / 正常（旧版失败被吞成整页白屏） -->
    <div v-if="store.errorDetail && !store.loadingDetail" class="state-wrap">
      <el-empty :description="`项目加载失败：${store.errorDetail}`">
        <el-button type="primary" :icon="Refresh" @click="reload">重试</el-button>
      </el-empty>
    </div>
    <div v-else-if="!store.loadingDetail && !project" class="state-wrap">
      <el-empty description="项目不存在或已被删除">
        <el-button @click="back">返回列表</el-button>
      </el-empty>
    </div>
    <div v-else-if="!project" v-loading="true" class="state-wrap" />

    <template v-else>
      <!-- 固定 Header：标题行 + 统计行 -->
      <header class="proj-header">
        <div class="proj-title-row">
          <el-button :icon="ArrowLeft" text @click="back">返回</el-button>
          <h2 class="proj-name">{{ project.name }}</h2>
          <el-tag size="small" :type="project.blueprint?.autoConfirm ? 'success' : 'warning'" effect="plain">
            {{ project.blueprint?.autoConfirm ? '蓝图已确认' : '蓝图待确认' }}
          </el-tag>
          <el-tag size="small" effect="plain">蓝图 v{{ project.blueprintVersion }}</el-tag>

          <div class="proj-actions">
            <el-tooltip :disabled="canRun" content="先到「采集蓝图」页签确认蓝图，才能开始搜集">
              <el-button type="primary" :loading="isRunning" :disabled="!canRun" @click="doRun">
                {{ isRunning ? '搜集中…' : '开始搜集' }}
              </el-button>
            </el-tooltip>
            <el-button @click="activeTab = 'report'">整理报告</el-button>
            <el-tooltip content="跨来源聚类去重、冲突归因、孤证标记——数据变化后可重跑" placement="top">
              <el-button :loading="adjudicating" @click="doAdjudicate">重新裁决</el-button>
            </el-tooltip>
            <el-button :icon="Refresh" :loading="store.loadingDetail" @click="reload" />
          </div>
        </div>

        <div class="proj-stats">
          <span class="stat">来源 <b>{{ sourceTotal }}</b><i v-if="store.stagedSources.length" class="hl">（待审 {{ store.stagedSources.length }}）</i></span>
          <el-divider direction="vertical" />
          <span class="stat">条目 <b>{{ store.rows.length }}</b><i v-if="store.pendingRows" class="hl">（待审 {{ store.pendingRows }}）</i></span>
          <el-divider direction="vertical" />
          <span class="stat">覆盖率 <b>{{ percentText(store.coverageRatio) }}</b></span>
          <el-divider direction="vertical" />
          <span class="stat kb-stat">
            知识库
            <el-select
              v-model="kbValue"
              size="small"
              filterable
              clearable
              allow-create
              placeholder="选择知识库（可粘贴 ID）"
              class="kb-select"
              :loading="kbLoading"
              @change="doBindKb"
            >
              <el-option v-for="kb in kbOptions" :key="kb.id" :label="kb.name" :value="kb.id" />
            </el-select>
          </span>
        </div>
      </header>

      <!-- 五页签：蓝图 / 任务 / 审阅 / 资料库 / 报告 -->
      <el-tabs v-model="activeTab" class="proj-tabs">
        <el-tab-pane label="采集蓝图" name="blueprint">
          <IcBlueprintPanel />
        </el-tab-pane>
        <el-tab-pane name="tasks">
          <template #label>搜集任务{{ isRunning ? '（进行中）' : '' }}</template>
          <IcTasksPanel />
        </el-tab-pane>
        <el-tab-pane name="review">
          <template #label>
            <span class="tab-label">
              审阅工作台
              <el-tag v-if="store.stagedSources.length" size="small" type="danger" effect="light" round>
                {{ store.stagedSources.length }}
              </el-tag>
            </span>
          </template>
          <IcReviewPanel />
        </el-tab-pane>
        <el-tab-pane label="资料库" name="rows">
          <IcRowsPanel />
        </el-tab-pane>
        <el-tab-pane name="report">
          <template #label>
            <span class="tab-label">
              整理报告
              <el-tag v-if="store.lastReport" size="small" type="success" effect="light">新</el-tag>
            </span>
          </template>
          <IcReportPanel />
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 信息搜集 · 项目详情页（shell）
 * @module views/info-collection/InfoCollectionProject
 * @description 固定 Header（标题 + 统计条 + KB 选择器 + 全局操作）+ 五页签内容区。
 *              轮询唯一入口是 store.startPolling（轻量 listTasks），本视图只负责生命周期挂载。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useInfoCollectionStore } from '@/stores/info-collection'
import { percentText } from '@/views/info-collection/ic-ui'
import IcBlueprintPanel from '@/components/info-collection/IcBlueprintPanel.vue'
import IcTasksPanel from '@/components/info-collection/IcTasksPanel.vue'
import IcReviewPanel from '@/components/info-collection/IcReviewPanel.vue'
import IcRowsPanel from '@/components/info-collection/IcRowsPanel.vue'
import IcReportPanel from '@/components/info-collection/IcReportPanel.vue'

interface KbOption {
  id: string
  name: string
}

const route = useRoute()
const router = useRouter()
const store = useInfoCollectionStore()

const projectId = computed(() => String(route.params.id ?? ''))
const project = computed(() => store.current)

const activeTab = ref('blueprint')
const adjudicating = ref(false)

const isRunning = computed(() => store.running || store.hasRunning)
const canRun = computed(() => !!project.value?.blueprint?.autoConfirm && !isRunning.value)
const sourceTotal = computed(
  () => store.stagedSources.length + store.confirmedSources.length + store.rejectedSources.length,
)

// ---- 知识库选择器（旧版为手贴 UUID 输入框） ----
const kbOptions = ref<KbOption[]>([])
const kbLoading = ref(false)
const kbValue = ref<string>('')
watch(
  () => project.value?.kbId,
  v => (kbValue.value = v ?? ''),
)

async function loadKbOptions(): Promise<void> {
  kbLoading.value = true
  try {
    const api = (window as never as { electronAPI?: { knowledgeBase?: { list?: () => Promise<{ success: boolean; data?: KbOption[] }> } } })
      .electronAPI?.knowledgeBase
    const resp = await api?.list?.()
    if (resp?.success && resp.data) kbOptions.value = resp.data
  } finally {
    kbLoading.value = false
  }
}

async function doBindKb(kbId: string | null): Promise<void> {
  if (!project.value) return
  const normalized = kbId?.trim() || null
  const { ok, backfilled } = await store.setProjectKb(project.value.id, normalized)
  if (ok) {
    ElMessage.success(
      normalized
        ? backfilled > 0
          ? `已绑定知识库，历史确认来源补录入库 ${backfilled} 条`
          : '已绑定知识库'
        : '已解绑知识库',
    )
  } else {
    ElMessage.error('绑定失败')
  }
}

onMounted(async () => {
  await store.loadProject(projectId.value)
  // 智能落点：跑着 → 任务页；有待审 → 审阅页；否则蓝图页
  if (store.hasRunning) {
    activeTab.value = 'tasks'
    store.startPolling(projectId.value)
  } else if (store.stagedSources.length > 0) {
    activeTab.value = 'review'
  }
  void loadKbOptions()
})
onBeforeUnmount(() => store.stopPolling())

async function reload(): Promise<void> {
  await store.loadProject(projectId.value)
  if (store.hasRunning) store.startPolling(projectId.value)
}

async function doRun(): Promise<void> {
  if (!project.value) return
  const ok = await store.runTask(project.value.id)
  if (!ok) {
    ElMessage.error('发起搜集失败')
    return
  }
  activeTab.value = 'tasks'
}

async function doAdjudicate(): Promise<void> {
  if (!project.value) return
  adjudicating.value = true
  try {
    const r = await store.adjudicate(project.value.id)
    if (!r) {
      ElMessage.error('裁决失败')
      return
    }
    ElMessage.success(
      `裁决完成：${r.clusters} 个转载簇，发现 ${r.conflictsFound} 处数值冲突（归因 ${r.conflictsAttributed} 处），${r.singleSourceRows} 条孤证已标记`,
    )
  } finally {
    adjudicating.value = false
  }
}

function back(): void {
  void router.push('/info-collection')
}
</script>

<style scoped>
.ic-project {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 28px 0;
}
.state-wrap { flex: 1; display: flex; align-items: center; justify-content: center; }

.proj-header { border-bottom: 1px solid var(--el-border-color-lighter); padding-bottom: 12px; }
.proj-title-row { display: flex; align-items: center; gap: 10px; }
.proj-name { margin: 0; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proj-actions { margin-left: auto; display: flex; gap: 10px; flex-shrink: 0; }

.proj-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
}
.stat b { color: var(--el-text-color-primary); font-weight: 600; }
.stat .hl { color: var(--el-color-danger); font-style: normal; }
.kb-stat { display: flex; align-items: center; gap: 8px; }
.kb-select { width: 220px; }

.proj-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.proj-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow: auto; padding-bottom: 20px; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; }
</style>
