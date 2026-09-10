<template>
  <div class="domain-atlas">
    <!-- 顶栏：返回 + 空间信息 + 画像 -->
    <div class="atlas-header">
      <el-button text :icon="ArrowLeft" @click="goBackToSpace">返回学习空间</el-button>
      <div class="atlas-title">
        <h2>{{ spaceView?.name ?? '领域学习' }}</h2>
        <span class="atlas-sub">知识体系全景</span>
        <el-tag v-if="spaceView?.goal" size="small" type="info" effect="plain">{{ spaceView.goal }}</el-tag>
      </div>
      <div v-if="spaceProfile" class="profile-tag" :title="spaceProfile.nature">
        <el-tag type="warning" effect="plain">{{ spaceProfile.kindLabel || '自定义领域' }}</el-tag>
        <span class="profile-nature">{{ spaceProfile.nature }}</span>
      </div>
      <div class="atlas-actions">
        <el-button plain :icon="Share" @click="resetFocus">全图</el-button>
        <SpaceStatsPopover :space-id="spaceId" />
        <el-button plain :loading="exporting" @click="exportLessonDigest">导出讲义</el-button>
        <el-button plain @click="exportAtlasPng">导出 PNG</el-button>
        <span v-if="exportNote" class="export-note">{{ exportNote }}</span>
        <el-button type="primary" :icon="Back" @click="goBackToSpace">回到讲义空间</el-button>
      </div>
    </div>

    <!-- 画像侧重提示条（有画像才显示） -->
    <div v-if="spaceProfile" class="emphasis-bar">
      <span class="emphasis-label">本领域侧重</span>
      <el-tag
        v-for="t in emphasisTags"
        :key="t"
        size="small"
        effect="plain"
        class="emphasis-tag"
        :style="{ color: nodeTypeMeta(t).color, borderColor: nodeTypeMeta(t).color }"
      >
        {{ nodeTypeMeta(t).label }}
      </el-tag>
    </div>

    <div class="atlas-body">
      <!-- 左：结构索引（后端空间视图树；群组嵌套 + 概念叶） -->
      <aside class="pane pane-tree">
        <div class="pane-title">
          <span>结构索引</span>
          <el-tooltip content="点击定位到主图节点" placement="top">
            <el-icon><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div v-if="graph?.nodes.length" class="tree-legend">
          <span v-for="t in legendTypes" :key="t" class="legend-item">
            <i class="dot" :style="{ background: nodeTypeMeta(t).color }" />
            {{ nodeTypeMeta(t).label }}
          </span>
        </div>
        <div v-loading="loading" class="tree-scroll">
          <div
            v-for="row in treeRows"
            :key="row.node.id"
            class="tree-row"
            :class="{ group: row.isGroup, active: selectedId === row.node.conceptId }"
            :style="{ paddingLeft: 8 + row.depth * 14 + 'px' }"
            @click="selectFromTree(row.node)"
          >
            <template v-if="row.isGroup">
              <el-icon class="group-icon"><Folder /></el-icon>
              <span class="group-name">{{ row.node.name }}</span>
            </template>
            <template v-else-if="row.concept">
              <i class="dot" :style="{ background: nodeTypeMeta(row.concept.nodeType).color }" />
              <span class="tree-name">{{ row.concept.name }}</span>
              <i v-if="row.concept.mastery === 'mastered'" class="check el-icon"><CircleCheckFilled /></i>
              <i v-else-if="row.concept.mastery === 'learning'" class="check learning"><Loading /></i>
            </template>
          </div>
          <div v-if="!loading && treeRows.length === 0" class="tree-empty">暂无知识节点</div>
        </div>
      </aside>

      <!-- 中：主图（图谱 / 按画像启用的增强视图） -->
      <section class="pane pane-graph">
        <div class="view-switch">
          <span
            v-for="v in viewTabs"
            :key="v.kind"
            class="view-chip"
            :class="{ on: viewMode === v.kind }"
            @click="viewMode = v.kind"
          >{{ v.label }}</span>
        </div>
        <!-- 面包屑：全局 > 子图谱（聚焦节点；仅图谱模式显示） -->
        <div v-if="viewMode === 'graph' && focusNode" class="crumb-bar">
          <span class="crumb-root" @click="resetFocus">全领域</span>
          <el-icon><ArrowRight /></el-icon>
          <span class="crumb-now">{{ focusNode.name }}</span>
          <span class="crumb-tip">· 子图谱（{{ focusNode.name }} 与其直接关联）</span>
        </div>
        <AtlasGraph
          v-if="viewMode === 'graph' && (loading || (graph?.nodes.length ?? 0) > 0)"
          :nodes="graph?.nodes ?? []"
          :edges="graph?.edges ?? []"
          :focus-id="focusId"
          :selected-id="selectedId"
          @update:selected-id="selectedId = $event"
          @select="onSelect"
          @dblclick="onDrill"
        />
        <!-- 空主题起步态：图谱尚无任何节点 → 空间级起步研究（生成首批知识） -->
        <div v-else-if="viewMode === 'graph'" class="atlas-boot">
          <div class="ab-icon"><el-icon><Promotion /></el-icon></div>
          <h3>「{{ spaceView?.name ?? '本空间' }}」还没有知识图谱</h3>
          <p>让研究助手为整个领域做一次起步研究：建立首批核心知识点与学习顺序，并生成第一份讲义。</p>
          <p class="ab-tip">研究优先检索已绑定的知识库；可先在右上「空间设置 → 关联知识库」绑定资料库。</p>
          <el-button type="primary" :icon="Promotion" :loading="atlasBooting" @click="bootAtlas">
            {{ atlasBooting ? '正在起步研究…' : '生成首批知识' }}
          </el-button>
          <div v-if="atlasBootMsg" class="ab-msg" :class="{ warn: atlasBootWarn }">{{ atlasBootMsg }}</div>
        </div>
        <AtlasEnhancedViews
          v-else-if="atlasViews"
          :views="atlasViews"
          :kind="viewMode"
          @open-concept="onOpenConceptFromViews"
        />
        <div v-else class="graph-empty"><el-icon><Share /></el-icon><p>暂无图谱数据</p></div>
      </section>

      <!-- 右：节点档案（dl:get-node-profile） -->
      <aside class="pane pane-profile">
        <template v-if="nodeProfile">
          <div class="profile-header">
            <span class="profile-name">{{ nodeProfile.node.name }}</span>
            <el-tag size="small" :style="{ background: nodeTypeMeta(nodeProfile.node.nodeType).color, border: 'none', color: '#fff' }">
              {{ nodeTypeMeta(nodeProfile.node.nodeType).label }}
            </el-tag>
            <el-button size="small" text class="profile-close" @click="clearSelection"><el-icon><Close /></el-icon></el-button>
          </div>
          <div v-loading="profileLoading" class="profile-body">
            <!-- 定义 -->
            <div class="p-block">
              <div class="p-label">定义 / 要点</div>
              <div class="p-text">{{ nodeProfile.node.desc || '（暂无定义）' }}</div>
            </div>
            <!-- 类型专属属性 -->
            <div v-if="attrRows.length" class="p-block">
              <div class="p-label">关键属性</div>
              <div v-for="a in attrRows" :key="a.key" class="attr-row">
                <span class="attr-key">{{ a.key }}</span>
                <span class="attr-val">{{ a.value }}</span>
              </div>
            </div>
            <!-- 关联内容（论文/法规/案例…按 nodeType 聚合） -->
            <div v-if="nodeProfile.relatedContent.length" class="p-block">
              <div class="p-label">关联内容</div>
              <div v-for="(r, i) in nodeProfile.relatedContent" :key="i" class="related-item">
                <el-icon><Document /></el-icon>
                <span class="work-kind">{{ r.kind }}</span>
                <span class="work-title">{{ r.title }}</span>
                <span v-if="r.year" class="work-meta">· {{ r.year }}</span>
              </div>
            </div>
            <!-- 直接关系 -->
            <div class="p-block">
              <div class="p-label">直接关系（{{ nodeProfile.relations.length }}）</div>
              <div v-for="rel in nodeProfile.relations" :key="rel.conceptId + rel.rel + rel.direction" class="rel-item" @click="jumpTo(rel)">
                <span class="rel-direction">{{ rel.direction === 'out' ? '→' : '←' }}</span>
                <span class="rel-type">{{ relLabel(rel.rel) }}</span>
                <span class="rel-name">{{ rel.name }}</span>
              </div>
              <div v-if="nodeProfile.relations.length === 0" class="p-empty">暂无直接关系</div>
            </div>
            <!-- 操作 -->
            <div class="p-actions">
              <el-button size="small" type="primary" plain :icon="Share" @click="drillSelected">
                聚焦局部图谱
              </el-button>
              <el-button size="small" :icon="Reading" @click="goLearn(nodeProfile.node)">
                去学它
              </el-button>
            </div>
          </div>
        </template>
        <div v-else class="profile-placeholder">
          <el-icon><Mouse /></el-icon>
          <p>点击图中的知识点查看档案</p>
          <span>展示定义、关键属性、关联内容与直接关系；双击或「聚焦局部图谱」进入该知识点的局部图谱。</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 知识全景 Atlas —— 独立 Tab 页
 * @module views/domain-learning/DomainAtlas
 * @description 领域知识体系化展示：左结构索引（空间视图大纲树）/ 中自绘力导向主图 /
 *              右节点档案。数据源：
 *              - 空间元信息 + 结构索引 + 画像：dl:get-space-view（store.currentSpaceView）
 *              - 图谱节点/边：dl:get-atlas-graph
 *              - 右栏档案：dl:get-node-profile
 *              单击选中聚焦一阶邻居；双击/"聚焦局部图谱"进入局部图（面包屑可回退）；
 *              「去学它」回到讲义空间并定位该概念。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Back,
  CircleCheckFilled,
  Close,
  Document,
  Folder,
  InfoFilled,
  Loading,
  Mouse,
  Promotion,
  Reading,
  Share,
} from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'
import { useDomainLearningStore } from '@/stores/domain-learning'
import { nodeTypeMeta, relLabel } from './domain-learning-ui'
import AtlasGraph from './AtlasGraph.vue'
import AtlasEnhancedViews from './AtlasEnhancedViews.vue'
import SpaceStatsPopover from './SpaceStatsPopover.vue'
import { downloadBlob, graphSvgToPngBlob } from './atlas-export'
import type {
  DlAtlasGraph,
  DlAtlasNode,
  DlAtlasViewKind,
  DlConceptView,
  DlNodeProfile,
  DlProfileView,
  DlRelationType,
  DlTreeNode,
} from '@shared/types/domain-learning.types'
import {
  DL_VIEW_KIND_LABELS,
} from '@shared/types/domain-learning.types'

const route = useRoute()
const router = useRouter()
const tabsStore = useTabsStore()
const store = useDomainLearningStore()

// keep-alive 缓存按组件名匹配（与路由名一致）
defineOptions({ name: 'DomainLearningAtlas' })

const spaceId = computed(() => String(route.params.id ?? ''))

/** 空间元信息/画像/结构索引来源（三栏页共用视图缓存，本页进入时强制刷新） */
const spaceView = computed(() => store.currentSpaceView)
const spaceProfile = computed<DlProfileView | null>(() => spaceView.value?.profile ?? null)

/** Atlas 图（节点/边来自后端 dl:get-atlas-graph） */
const graph = ref<DlAtlasGraph | null>(null)
const loading = ref(false)
/** 右栏节点档案（dl:get-node-profile） */
const nodeProfile = ref<DlNodeProfile | null>(null)
const profileLoading = ref(false)

const selectedId = ref<string | null>(null)
/** 下钻：非空 = 子图谱模式（该节点 + 一阶邻居） */
const focusId = ref<string | null>(null)

const focusNode = computed<DlAtlasNode | null>(
  () => graph.value?.nodes.find(n => n.id === focusId.value) ?? null
)

/** 侧重类型（画像 emphasis；未匹配图例时回退显示 key 本身） */
const emphasisTags = computed<string[]>(() => spaceProfile.value?.emphasis ?? [])

/** 图谱中出现的节点类型（图例行，按出现序） */
const legendTypes = computed<string[]>(() => {
  const seen: string[] = []
  for (const n of graph.value?.nodes ?? []) {
    if (!seen.includes(n.nodeType)) seen.push(n.nodeType)
  }
  return seen
})

// ==================== Atlas 增强视图（M2-E：按画像侧重启用） ====================

type ViewMode = 'graph' | DlAtlasViewKind
const viewMode = ref<ViewMode>('graph')

/** 增强视图载荷（dl:get-atlas-views） */
const atlasViews = computed(() => store.currentAtlasViews)

/** 中部视图切换条：图谱 + enabled 的增强视图 */
const viewTabs = computed<Array<{ kind: ViewMode; label: string }>>(() => {
  const tabs: Array<{ kind: ViewMode; label: string }> = [{ kind: 'graph', label: '图谱' }]
  for (const k of atlasViews.value?.enabled ?? []) {
    tabs.push({ kind: k, label: DL_VIEW_KIND_LABELS[k] })
  }
  return tabs
})

/** 增强视图点概念：回全图 + 右栏档案（视图本身不切走） */
function onOpenConceptFromViews(id: string): void {
  focusId.value = null
  void selectNode(id)
}

// ==================== 统计与导出（M3-C；统计入口已抽 SpaceStatsPopover） ====================

const exporting = ref(false)
const exportNote = ref('')

async function exportLessonDigest(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  exportNote.value = ''
  try {
    const r = await store.exportLessonDigestOf(spaceId.value)
    if (!r) {
      exportNote.value = '导出失败'
      return
    }
    downloadBlob(r.markdown, r.filename, 'text/markdown;charset=utf-8')
    exportNote.value = `已导出 ${r.count} 个概念 · ${r.filename}`
  } finally {
    exporting.value = false
  }
}

/** 图谱 PNG 导出（DOM/文件工具已抽至 ./atlas-export，M4-A P1-6） */
async function exportAtlasPng(): Promise<void> {
  const svg = document.querySelector('svg.force-graph-svg')
  if (!svg) {
    exportNote.value = '当前无图谱可导出——请切回「图谱」视图'
    return
  }
  try {
    const blob = await graphSvgToPngBlob(svg as SVGSVGElement)
    downloadBlob(blob, `图谱-${spaceView.value?.name ?? 'space'}.png`, 'image/png')
    exportNote.value = '图谱 PNG 已导出'
  } catch (e: any) {
    exportNote.value = `PNG 导出失败：${e?.message ?? String(e)}`
  }
}

/** 左栏结构索引（空间视图大纲树扁平化：群组行 + 概念叶行） */
interface TreeRow {
  node: DlTreeNode
  depth: number
  isGroup: boolean
  concept?: DlConceptView
}
const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []
  const walk = (list: DlTreeNode[], depth: number) => {
    for (const n of list) {
      if (n.conceptId) {
        const c = spaceView.value?.concepts.find(x => x.id === n.conceptId)
        if (c) rows.push({ node: n, depth, isGroup: false, concept: c })
      } else {
        rows.push({ node: n, depth, isGroup: true })
        if (n.children?.length) walk(n.children, depth + 1)
      }
    }
  }
  walk(spaceView.value?.tree ?? [], 0)
  return rows
})

// ==================== 档案/选中 ====================

/** 选中图中/树中节点 → 拉节点档案 */
async function selectNode(id: string | null): Promise<void> {
  selectedId.value = id
  if (!id) {
    nodeProfile.value = null
    return
  }
  profileLoading.value = true
  try {
    const p = await store.fetchNodeProfile(spaceId.value, id)
    nodeProfile.value = p
  } finally {
    profileLoading.value = false
  }
}

function onSelect(node: DlAtlasNode | null): void {
  void selectNode(node?.id ?? null)
}

function clearSelection(): void {
  void selectNode(null)
}

/** 从结构索引选中（不自动下钻；若处于子图谱且节点不在其中则退回全图） */
function selectFromTree(node: DlTreeNode): void {
  if (!node.conceptId) return
  if (focusId.value && !neighborOfFocus(node.conceptId) && node.conceptId !== focusId.value) {
    focusId.value = null
  }
  void selectNode(node.conceptId)
}

function neighborOfFocus(id: string): boolean {
  const f = focusId.value
  if (!f || !graph.value) return false
  return graph.value.edges.some(e => (e.source === f && e.target === id) || (e.target === f && e.source === id))
}

// ==================== 下钻 / 局部图谱 ====================

function onDrill(node: DlAtlasNode): void {
  focusId.value = node.id
  void selectNode(node.id)
}

function drillSelected(): void {
  if (nodeProfile.value) focusId.value = nodeProfile.value.node.id
}

function resetFocus(): void {
  focusId.value = null
}

/** 档案直接关系点击 → 跳到邻居节点（不在当前子图谱则退回全图） */
function jumpTo(rel: { conceptId: string; rel: DlRelationType; direction: 'out' | 'in' }): void {
  if (focusId.value && !neighborOfFocus(rel.conceptId) && rel.conceptId !== focusId.value) {
    focusId.value = null
  }
  void selectNode(rel.conceptId)
}

/** 档案属性记录 → 可展示键值对 */
const attrRows = computed(() => {
  const attrs = nodeProfile.value?.attrs ?? nodeProfile.value?.node.attrs
  if (!attrs) return []
  return Object.entries(attrs).map(([k, v]) => ({
    key: k,
    value: typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''),
  }))
})

// ==================== 跳转 ====================

function goBackToSpace(): void {
  tabsStore.preloadTab(`/domain-learning/${spaceId.value}`, spaceView.value?.name ?? '领域学习')
  router.push(`/domain-learning/${spaceId.value}`)
}

function goLearn(node: DlAtlasNode): void {
  tabsStore.preloadTab(`/domain-learning/${spaceId.value}`, spaceView.value?.name ?? '领域学习')
  router.push({ path: `/domain-learning/${spaceId.value}`, query: { concept: node.id } })
}

// ==================== 加载 ====================

/** 空主题起步研究（图谱空 → 空间级 research；完成后刷新图谱/视图） */
const atlasBooting = ref(false)
const atlasBootMsg = ref('')
const atlasBootWarn = ref(false)

async function bootAtlas(): Promise<void> {
  if (atlasBooting.value) return
  const id = spaceId.value
  atlasBooting.value = true
  atlasBootMsg.value = ''
  atlasBootWarn.value = false
  // 空间级事件通道 dl:agent:<spaceId>（conceptId 为空）
  const unsub = store.subscribeAgentEvent(id, null, (ev) => {
    // 只收本空间级 research 轮事件（并发 tutor/task 的错误不误报到起步面板）
    if (ev.mode && ev.mode !== 'research') return
    if (ev.type === 'error') {
      atlasBootWarn.value = true
      atlasBootMsg.value = `起步研究出错：${ev.error ?? '未知错误'}`
    }
  })
  try {
    const result = await store.sendAgent({
      mode: 'research',
      spaceId: id,
      conceptId: null,
      message: `这是新主题「${spaceView.value?.name ?? '本空间'}」的首次研究——请为整个领域建立首批核心知识点并生成第一份讲义。`,
    })
    await loadAtlas()
    if ((graph.value?.nodes.length ?? 0) === 0 && !atlasBootMsg.value) {
      // 未产出：展示会话总结中的原因，避免“干等无反馈”
      const reason = (result?.content ?? '').trim()
      atlasBootWarn.value = true
      atlasBootMsg.value = reason
        ? `本轮未生成知识点：${reason.slice(0, 260)}`
        : '本轮未生成知识点。可先绑定含资料的知识库（空间设置 → 关联知识库），或在可联网环境重试。'
    }
  } finally {
    unsub()
    atlasBooting.value = false
  }
}

async function loadAtlas(): Promise<void> {
  const id = spaceId.value
  if (!id) return
  loading.value = true
  try {
    // 空间元信息/画像/结构索引
    await store.fetchSpaceView(id)
    // 图谱节点/边
    graph.value = await store.fetchAtlasGraph(id)
    // Atlas 增强视图（时间线/流程/矩阵/三层）
    await store.fetchAtlasViews(id)
  } finally {
    loading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    selectedId.value = null
    focusId.value = null
    viewMode.value = 'graph'
    nodeProfile.value = null
    void loadAtlas()
  }
)

onMounted(() => {
  void loadAtlas()
})

onUnmounted(() => {
  // 页面卸载：清理起步研究等 agent 事件订阅（keep-alive 下仅在标签真正关闭时触发）
  store.unsubscribeAll()
})
</script>

<style scoped lang="scss">
.domain-atlas {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color);
}

.atlas-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .atlas-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    h2 {
      margin: 0;
      font-size: 17px;
      color: var(--el-text-color-primary);
    }
    .atlas-sub {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
  .profile-tag {
    margin-left: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    .profile-nature {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      max-width: 340px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .atlas-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
}

.emphasis-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);

  .emphasis-label {
    font-weight: 600;
    color: var(--el-text-color-regular);
  }
  .emphasis-hint {
    color: var(--el-text-color-placeholder);
  }
}

.atlas-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pane-tree {
  width: 230px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 10px 10px;
}

.pane-graph {
  flex: 1;
  min-width: 0;
}

.pane-profile {
  width: 330px;
  flex-shrink: 0;
  border-left: 1px solid var(--el-border-color-lighter);
  overflow-y: auto;
}

.pane-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding: 4px 2px 8px;
}

.tree-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 0 2px 8px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  margin-bottom: 6px;

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.tree-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--el-text-color-regular);

  &:hover {
    background: var(--el-fill-color-light);
  }
  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  &.group {
    cursor: default;
    color: var(--el-text-color-primary);
    font-weight: 600;

    .group-icon {
      color: var(--el-text-color-placeholder);
      font-size: 13px;
      flex-shrink: 0;
    }
    .group-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .tree-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .check {
    font-size: 12px;
    color: var(--el-color-success);
    &.learning {
      color: var(--el-color-warning);
    }
  }
}

.tree-empty {
  padding: 16px 4px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.crumb-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);

  .crumb-root {
    cursor: pointer;
    color: var(--el-color-primary);
    &:hover {
      text-decoration: underline;
    }
  }
  .crumb-now {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .crumb-tip {
    color: var(--el-text-color-placeholder);
  }
}

.profile-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 20px;
  text-align: center;
  color: var(--el-text-color-placeholder);

  .el-icon {
    font-size: 30px;
    opacity: 0.4;
  }
  p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
  span {
    font-size: 12px;
    line-height: 1.7;
  }
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .profile-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    flex: 1;
    min-width: 0;
  }
}

.profile-body {
  padding: 12px 14px;
  min-height: 120px;
}

.p-block {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--el-border-color-lighter);

  &:last-of-type {
    border-bottom: none;
  }
}

.p-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.p-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
}

.attr-row {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  padding: 2px 0;
  .attr-key {
    color: var(--el-text-color-placeholder);
    flex-shrink: 0;
  }
  .attr-val {
    color: var(--el-text-color-regular);
    word-break: break-all;
  }
}

.related-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  padding: 3px 0;
  flex-wrap: wrap;

  .el-icon {
    color: var(--el-color-primary);
    font-size: 13px;
    flex-shrink: 0;
  }
  .work-kind {
    font-size: 10.5px;
    color: #fff;
    background: var(--el-color-primary);
    border-radius: 4px;
    padding: 0 5px;
    flex-shrink: 0;
  }
  .work-title {
    flex: 1;
    min-width: 0;
  }
  .work-meta {
    color: var(--el-text-color-placeholder);
    font-size: 12px;
  }
}

.rel-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  &:hover {
    background: var(--el-fill-color-light);
  }
  .rel-direction {
    color: var(--el-color-primary);
    font-weight: 600;
  }
  .rel-type {
    color: var(--el-text-color-placeholder);
    flex-shrink: 0;
  }
  .rel-name {
    color: var(--el-text-color-regular);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.p-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.p-actions {
  display: flex;
  gap: 8px;
}

// ==================== 增强视图切换与空间设置（M2-E） ====================

.view-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 4px;
  flex-wrap: wrap;

  .view-chip {
    padding: 3px 12px;
    font-size: 12px;
    border-radius: 12px;
    border: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-regular);
    cursor: pointer;
    transition: all 0.15s;
    &:hover {
      border-color: var(--el-color-primary-light-5);
      color: var(--el-color-primary);
    }
    &.on {
      background: var(--el-color-primary);
      border-color: var(--el-color-primary);
      color: #fff;
    }
  }
}

.graph-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-placeholder);
  .el-icon {
    font-size: 32px;
    opacity: 0.5;
  }
  p {
    margin: 0;
    font-size: 14px;
  }
}

/* M5：空主题起步态（图谱空 → 生成首批知识） */
.atlas-boot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;

  .ab-icon {
    color: var(--el-color-primary);
    .el-icon {
      font-size: 38px;
    }
  }
  h3 {
    margin: 10px 0 8px;
    font-size: 17px;
    color: var(--el-text-color-primary);
  }
  p {
    max-width: 520px;
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.8;
    color: var(--el-text-color-regular);
  }
  .ab-tip {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
  .ab-msg {
    margin-top: 12px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--el-color-primary);
    &.warn {
      color: var(--el-color-warning);
    }
  }
}

.export-note {
  font-size: 11px;
  color: var(--el-color-success);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
