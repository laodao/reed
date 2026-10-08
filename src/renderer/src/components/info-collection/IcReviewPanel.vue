<template>
  <div class="rv-panel">
    <div class="rv-toolbar">
      <el-radio-group v-model="view" size="small">
        <el-radio-button value="staged">待审（{{ store.stagedSources.length }}）</el-radio-button>
        <el-radio-button value="confirmed">已入选（{{ store.confirmedSources.length }}）</el-radio-button>
        <el-radio-button value="rejected">已驳回（{{ store.rejectedSources.length }}）</el-radio-button>
      </el-radio-group>
      <div v-if="view === 'staged'" class="rv-batch">
        <el-button size="small" type="success" :disabled="!selected.length" :loading="acting" @click="doConfirm(selected)">
          确认入选（{{ selected.length }}）
        </el-button>
        <el-button size="small" type="danger" plain :disabled="!selected.length" :loading="acting" @click="doReject(selected)">
          驳回
        </el-button>
      </div>
    </div>

    <el-empty
      v-if="currentList.length === 0"
      :description="emptyText"
      :image-size="72"
    />
    <el-table
      v-else
      ref="tableRef"
      :data="currentList"
      size="small"
      @selection-change="(rows: IcSourceDto[]) => (selected = rows)"
    >
      <el-table-column v-if="view === 'staged'" type="selection" width="42" />
      <el-table-column label="来源" min-width="300">
        <template #default="{ row }">
          <a class="src-url" :href="row.url" target="_blank" rel="noopener">{{ row.url }}</a>
          <div class="src-sub">
            <el-tag v-if="row.asset" size="small" effect="plain" class="src-file">{{ assetBadge(row.asset) }}</el-tag>
            <span v-if="row.tierRationale" class="src-rationale">{{ row.tierRationale }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="分级" width="72" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.tier" size="small" :type="tierTagType(row.tier)" effect="dark">T{{ row.tier }}</el-tag>
          <el-tag v-else size="small" type="info" effect="plain">未定级</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="抓取" width="76" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="fetchTagType(row.fetchStatus)" effect="plain">{{ fetchText(row.fetchStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="满足需求" min-width="120">
        <template #default="{ row }">
          <el-tooltip v-if="row.irHits.length" :content="irHitQuestions(row.irHits)" placement="top">
            <span class="ir-hits">{{ irHitText(row.irHits) }}</span>
          </el-tooltip>
          <span v-else class="dim">—</span>
        </template>
      </el-table-column>
      <el-table-column label="关联条目" width="84" align="center">
        <template #default="{ row }">
          <span :class="{ dim: !draftRowsOf(row.id) }">{{ draftRowsOf(row.id) || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="view === 'confirmed'" label="入库" width="76" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.kbDocumentId" size="small" type="success" effect="plain">已入库</el-tag>
          <el-tooltip v-else content="未绑定知识库或导入失败——绑定后再次确认入库" placement="top">
            <el-tag size="small" type="info" effect="plain">未入库</el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="采集时间" width="150">
        <template #default="{ row }">
          <el-tooltip :content="shortTime(row.collectedAt)" placement="top">
            <span class="dim">{{ relativeTime(row.collectedAt) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column v-if="view === 'staged'" label="操作" width="120" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="success" size="small" :loading="acting" @click="doConfirm([row])">入选</el-button>
          <el-button link type="danger" size="small" :loading="acting" @click="doReject([row])">驳回</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
/**
 * 信息搜集 · 审阅工作台面板
 * @module components/info-collection/IcReviewPanel
 * @description 待审/已入选/已驳回三视图来源审阅：批量 + 单行操作、分级/抓取/需求命中/
 *              关联条目数判断依据。确认走分级门槛（后端拦，前端如实展示 skipped 原因）。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox, ElTable } from 'element-plus'
import { useInfoCollectionStore, type IcSourceDto } from '@/stores/info-collection'
import { fetchTagType, relativeTime, shortTime, tierTagType, assetBadge } from '@/views/info-collection/ic-ui'

const store = useInfoCollectionStore()
/** 智能落点：待审为空而已入选有数据时直接看已入选，不展示一张空表 */
const view = ref<'staged' | 'confirmed' | 'rejected'>(
  store.stagedSources.length === 0 && store.confirmedSources.length > 0 ? 'confirmed' : 'staged',
)
const selected = ref<IcSourceDto[]>([])
const acting = ref(false)
const tableRef = ref<InstanceType<typeof ElTable> | null>(null)

const currentList = computed(() =>
  view.value === 'staged' ? store.stagedSources : view.value === 'confirmed' ? store.confirmedSources : store.rejectedSources,
)
const emptyText = computed(
  () =>
    ({
      staged: '没有待审来源——搜集完成后新来源会出现在这里',
      confirmed: '还没有入选来源——在「待审」里确认后进入这里，并同步入知识库',
      rejected: '没有驳回记录',
    })[view.value],
)

/** 每个来源贡献的条目数（审判断据；排除已取代，待审/已入选两个视图都有意义） */
const rowCountBySource = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const r of store.rows) {
    if (r.status === 'superseded') continue
    if (r.sourceId) map[r.sourceId] = (map[r.sourceId] ?? 0) + 1
  }
  return map
})
function draftRowsOf(sourceId: string): number {
  return rowCountBySource.value[sourceId] ?? 0
}

/** 需求命中：展示需求 id，tooltip 补全问题文案 */
function irHitText(irIds: string[]): string {
  return irIds.join('、')
}
function irHitQuestions(irIds: string[]): string {
  const questions = new Map(
    (store.current?.blueprint?.requirements ?? []).map(r => [r.id, r.question]),
  )
  return irIds.map(id => questions.get(id) ?? id).join('\n')
}

function fetchText(status: string): string {
  return status === 'ok' ? '成功' : status === 'partial' ? '部分' : status === 'blocked' ? '被拦' : '失败'
}

async function doConfirm(sources: IcSourceDto[]): Promise<void> {
  if (!store.current || sources.length === 0) return
  acting.value = true
  try {
    const { confirmed, skipped } = await store.confirmBatch(store.current.id, sources.map(s => s.id))
    if (skipped.length) {
      ElMessage.warning(`已确认 ${confirmed.length} 条；拦下 ${skipped.length} 条——${skipped.map(s => s.reason).join('；')}`)
    } else {
      ElMessage.success(`已确认 ${confirmed.length} 条来源，条目随源入库`)
    }
    selected.value = []
    tableRef.value?.clearSelection()
  } finally {
    acting.value = false
  }
}

async function doReject(sources: IcSourceDto[]): Promise<void> {
  if (!store.current || sources.length === 0) return
  let reason: string
  try {
    const result = await ElMessageBox.prompt('驳回原因（进质量统计）', `驳回 ${sources.length} 条来源`, {
      inputValue: '来源不可信',
      inputPattern: /.+/,
      inputErrorMessage: '原因不能为空',
    })
    reason = typeof result === 'string' ? result : result.value
  } catch {
    return // 用户点取消——静默返回（旧版未捕获会抛 unhandled rejection）
  }
  acting.value = true
  try {
    await store.rejectBatch(store.current.id, sources.map(s => s.id), reason)
    ElMessage.success(`已驳回 ${sources.length} 条`)
    selected.value = []
    tableRef.value?.clearSelection()
  } finally {
    acting.value = false
  }
}
</script>

<style scoped>
.rv-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rv-batch { display: flex; gap: 8px; }
.src-url { font-size: 13px; color: var(--el-color-primary); word-break: break-all; text-decoration: none; }
.src-url:hover { text-decoration: underline; }
.src-sub { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.src-file { flex-shrink: 0; }
.src-rationale { font-size: 12px; color: var(--el-text-color-secondary); }
.ir-hits { font-size: 12px; font-family: monospace; cursor: default; }
.dim { color: var(--el-text-color-placeholder); font-size: 12px; }
</style>
