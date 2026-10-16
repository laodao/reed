<template>
  <div class="rw-panel">
    <div class="rw-toolbar">
      <el-radio-group v-model="statusFilter" size="small">
        <el-radio-button value="all">全部（{{ store.rows.length }}）</el-radio-button>
        <el-radio-button value="draft">待审（{{ countOf('draft') }}）</el-radio-button>
        <el-radio-button value="confirmed">已确认（{{ countOf('confirmed') }}）</el-radio-button>
        <el-radio-button value="superseded">已取代（{{ countOf('superseded') }}）</el-radio-button>
        <el-radio-button value="stale">过期（{{ countOf('stale') }}）</el-radio-button>
      </el-radio-group>
      <el-input
        v-model="keyword"
        size="small"
        clearable
        placeholder="搜索指标 / 期间 / 维度 / 引句"
        class="rw-search"
        :prefix-icon="Search"
      />
    </div>

    <el-empty v-if="paged.length === 0" :description="emptyText" :image-size="72" />
    <template v-else>
      <el-table :data="paged" size="small" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="row-detail">
              <div class="rd-grid">
                <div class="rd-item">
                  <span class="rd-k">schema</span><span class="rd-v mono">{{ row.schemaId }}</span>
                </div>
                <div class="rd-item">
                  <span class="rd-k">需求</span><span class="rd-v mono">{{ row.requirementId ?? '—' }}</span>
                </div>
                <div class="rd-item">
                  <span class="rd-k">置信度</span>
                  <span class="rd-v">
                    <el-tag size="small" :type="row.confidence === 'high' ? 'success' : 'warning'" effect="plain">
                      {{ row.confidence === 'high' ? '高' : '低' }}
                    </el-tag>
                    <el-tag v-if="row.needsReview" size="small" type="warning" effect="light" class="rd-review">待复核</el-tag>
                  </span>
                </div>
                <div class="rd-item">
                  <span class="rd-k">来源</span>
                  <span class="rd-v">
                    <a v-if="sourceUrlOf(row.sourceId)" :href="sourceUrlOf(row.sourceId)" target="_blank" rel="noopener" class="rd-link">
                      {{ sourceUrlOf(row.sourceId) }}
                    </a>
                    <span v-else class="dim">—</span>
                  </span>
                </div>
              </div>
              <div v-if="row.quote" class="rd-quote">
                <span class="rd-k">原文引句</span>
                <blockquote>「{{ row.quote }}」</blockquote>
              </div>
              <div class="rd-raw">
                <span class="rd-k">完整 row_json</span>
                <pre>{{ JSON.stringify(row.row, null, 2) }}</pre>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="rowTagType(row.status)" effect="plain">{{ rowStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="指标" min-width="150">
          <template #default="{ row }">{{ row.measure.metric || '—' }}</template>
        </el-table-column>
        <el-table-column label="数值" width="110" align="right">
          <template #default="{ row }">
            <span class="num">{{ row.measure.value ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="measure.unit" label="单位" width="80" />
        <el-table-column prop="measure.period" label="期间" width="100" />
        <el-table-column label="维度" min-width="120">
          <template #default="{ row }">{{ dimsText(row.measure.dims) }}</template>
        </el-table-column>
        <el-table-column label="引句" min-width="200">
          <template #default="{ row }">
            <span class="quote" :title="row.quote ?? ''">{{ row.quote || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="filtered.length > pageSize" class="rw-pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filtered.length"
          layout="total, prev, pager, next"
          background
          size="small"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 信息搜集 · 资料库面板
 * @module components/info-collection/IcRowsPanel
 * @description 结构化条目浏览：状态筛选 + 关键词搜索 + 分页；展开行看完整 row_json、
 *              原文引句与来源链接（溯源闭环）。superseded/stale 与 draft/confirmed 明确区分。
 */
import { computed, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useInfoCollectionStore, type IcRowDto } from '@/stores/info-collection'
import { dimsText, rowStatusText, rowTagType } from '@/views/info-collection/ic-ui'

const store = useInfoCollectionStore()
const statusFilter = ref<'all' | IcRowDto['status']>('all')
const keyword = ref('')
const page = ref(1)
const pageSize = 20

watch([statusFilter, keyword], () => (page.value = 1))

function countOf(status: IcRowDto['status']): number {
  return store.rows.filter(r => r.status === status).length
}

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return store.rows.filter(r => {
    if (statusFilter.value !== 'all' && r.status !== statusFilter.value) return false
    if (!kw) return true
    const m = r.measure
    const hay = [m.metric, m.period, m.unit, dimsText(m.dims), r.quote, r.schemaId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(kw)
  })
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const emptyText = computed(() =>
  store.rows.length === 0 ? '还没有结构化条目——搜集并确认来源后，条目会出现在这里' : '没有符合筛选条件的条目',
)

/** 来源 URL 反查（三个审阅状态列表的合集） */
const sourceUrlById = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const s of [...store.stagedSources, ...store.confirmedSources, ...store.rejectedSources]) {
    map[s.id] = s.url
  }
  return map
})
function sourceUrlOf(sourceId: string | null): string {
  return (sourceId && sourceUrlById.value[sourceId]) || ''
}
</script>

<style scoped>
.rw-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.rw-search { width: 240px; }
.num { font-variant-numeric: tabular-nums; font-weight: 600; }
.quote {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dim { color: var(--el-text-color-placeholder); font-size: 12px; }
.rw-pager { margin-top: 12px; display: flex; justify-content: flex-end; }
.row-detail { padding: 6px 16px 12px; }
.rd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px 20px; }
.rd-item { display: flex; gap: 8px; font-size: 12px; align-items: baseline; }
.rd-k { color: var(--el-text-color-secondary); flex-shrink: 0; width: 68px; }
.rd-v { min-width: 0; word-break: break-all; }
.rd-review { margin-left: 6px; }
.mono { font-family: monospace; }
.rd-link { color: var(--el-color-primary); text-decoration: none; font-size: 12px; }
.rd-link:hover { text-decoration: underline; }
.rd-quote { margin-top: 10px; font-size: 12px; }
.rd-quote blockquote {
  margin: 4px 0 0;
  padding: 6px 10px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
}
.rd-raw { margin-top: 10px; font-size: 12px; }
.rd-raw pre {
  margin: 4px 0 0;
  padding: 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  overflow: auto;
  max-height: 280px;
}
</style>
