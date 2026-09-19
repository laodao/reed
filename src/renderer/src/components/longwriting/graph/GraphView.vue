<template>
  <div class="graph-view">
    <!-- 工具栏 -->
    <div class="graph-toolbar">
      <span class="graph-title">知识图谱</span>
      <div class="graph-controls">
        <span class="filter-label">章节时间轴：</span>
        <el-slider
          v-model="chapterFilter"
          :min="0"
          :max="maxChapter"
          :step="1"
          style="width: 180px"
          :show-tooltip="true"
        />
        <span class="filter-value">{{ chapterFilter === 0 ? '全部' : `第 ${chapterFilter} 章` }}</span>
        <!-- 实体类型过滤：大作品下关掉事件类是最直接的减密手段（2D/3D 通用） -->
        <div class="type-filter">
          <span
            v-for="t in FILTER_TYPES"
            :key="t"
            class="type-chip"
            :class="{ off: !typeFilter.has(t) }"
            :title="typeFilter.has(t) ? '点击隐藏该类型' : '点击显示该类型'"
            @click="toggleType(t)"
          >
            <i class="chip-dot" :style="{ background: nodeColor(t) }" />
            {{ typeLabel(t) }}
            <span class="chip-count">{{ typeCounts[t] || 0 }}</span>
          </span>
        </div>
      </div>
      <div class="toolbar-actions">
        <!-- 渲染模式：默认 3D（WebGL 力导向，大图治密）；2D SVG 兜底 -->
        <el-radio-group v-model="renderMode" size="small">
          <el-radio-button value="3d">3D</el-radio-button>
          <el-radio-button value="2d">2D</el-radio-button>
        </el-radio-group>
        <!-- 视图缩放控制（图引擎 = 公共 ForceGraph） -->
        <div class="zoom-controls">
          <el-button size="small" :icon="ZoomOut" circle :disabled="zoomPercent <= 20" title="缩小" @click="graphRef?.zoomAt(1 / 1.2)" />
          <span class="zoom-percent">{{ zoomPercent }}%</span>
          <el-button size="small" :icon="ZoomIn" circle :disabled="zoomPercent >= 500" title="放大" @click="graphRef?.zoomAt(1.2)" />
          <el-button size="small" :icon="FullScreen" circle title="适应视图" @click="graphRef?.fitView()" />
        </div>
        <el-button
          size="small"
          type="primary"
          plain
          :loading="generating"
          :disabled="!hasEntities"
          @click="generateRelations"
        >
          <el-icon v-if="!generating"><MagicStick /></el-icon>
          {{ generating ? 'AI 分析实体关系…' : 'AI 分析实体关系' }}
        </el-button>
        <el-button size="small" :loading="loading" @click="loadGraph">刷新</el-button>
      </div>
    </div>

    <div class="graph-main">
      <!-- 左侧：图 -->
      <div class="graph-canvas">
        <div v-if="loading" class="graph-loading">加载图谱中...</div>
        <div v-else-if="nodes.length === 0" class="graph-empty">
          <el-icon><Share /></el-icon>
          <p>暂无图谱数据</p>
          <span>完成设定（人物/地点/物品等）后，点击「AI 分析实体关系」构建关系网络；<br />写完章节后事件会自动挂到图谱上</span>
        </div>
        <div v-else-if="fgNodes.length === 0" class="graph-empty">
          <el-icon><Share /></el-icon>
          <p>当前过滤条件下无节点</p>
          <el-button size="small" @click="resetFilters">重置过滤</el-button>
        </div>

        <ForceGraph
          ref="graphRef"
          v-else
          :nodes="fgNodes"
          :edges="fgEdges"
          :width="920"
          :height="600"
          :min-zoom-scale="0.2"
          :max-zoom-scale="5"
          :selected-id="selectedNode"
          :layout-key="graphVersion"
          :mode="renderMode"
          @update:selected-id="selectedNode = $event"
          @select="onGraphSelect"
          @click="onGraphClick"
          @background="deselectNode"
          @zoom="zoomPercent = $event"
        />
      </div>

      <!-- 右侧：实体详情栏 -->
      <aside class="graph-detail" :class="{ empty: !detail }">
        <template v-if="detail">
          <div class="detail-header">
            <span class="detail-name">{{ detail.name }}</span>
            <el-tag size="small" :color="nodeColor(detail.type)" class="detail-tag">{{ typeLabel(detail.type) }}</el-tag>
            <el-button size="small" text class="detail-close" @click="deselectNode"><el-icon><Close /></el-icon></el-button>
          </div>

          <!-- 基本信息 -->
          <div v-if="detail.description" class="detail-block">
            <div class="detail-label">简介</div>
            <div class="detail-text">{{ detail.description }}</div>
          </div>

          <!-- 当前状态（时间轴 N 章时显示该章状态） -->
          <div v-if="detailState" class="detail-block">
            <div class="detail-label">{{ chapterFilter > 0 ? `第 ${chapterFilter} 章状态` : '当前状态' }}（第 {{ detailState.chapterNumber }} 章）</div>
            <div class="detail-text">{{ detailState.stateSummary }}</div>
            <div v-if="detailState.keyChanges?.length" class="key-changes">
              <el-tag v-for="(k, i) in detailState.keyChanges" :key="i" size="small" type="warning" effect="light">{{ k }}</el-tag>
            </div>
          </div>

          <!-- 相关实体 -->
          <div v-if="relatedEntities.length" class="detail-block">
            <div class="detail-label">相关实体（{{ relatedEntities.length }}）</div>
            <div class="relation-list">
              <div
                v-for="rel in relatedEntities"
                :key="rel.key"
                class="relation-item"
                @click="jumpToEntity(rel)"
              >
                <span class="rel-avatar" :style="{ background: nodeColor(rel.type) }">{{ (rel.name || '?').slice(0, 1) }}</span>
                <div class="rel-body">
                  <div class="rel-top">
                    <span class="rel-name">{{ rel.name }}</span>
                    <span class="rel-type">{{ typeLabel(rel.type) }}</span>
                  </div>
                  <div class="rel-relation">
                    {{ rel.relationType }}
                    <span v-if="rel.validFromChapter || rel.validUntilChapter" class="rel-time">
                      （{{ rel.validFromChapter ? `第${rel.validFromChapter}章起` : '开篇起' }}<template v-if="rel.validUntilChapter">～第{{ rel.validUntilChapter }}章</template>）
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 状态时间线（历史快照） -->
          <div v-if="timeline.length" class="detail-block">
            <div class="detail-label">状态历史（{{ timeline.length }} 章快照）</div>
            <div class="timeline-list">
              <div v-for="t in timeline" :key="`${t.chapterNumber}-${t.stateSummary.slice(0, 8)}`" class="timeline-item">
                <span class="timeline-chapter">第{{ t.chapterNumber }}章</span>
                <span class="timeline-state">{{ t.stateSummary }}</span>
              </div>
            </div>
          </div>

          <!-- 相关事件 -->
          <div v-if="detail.events?.length" class="detail-block">
            <div class="detail-label">相关事件（{{ detail.events.length }}）</div>
            <div v-for="e in detail.events" :key="e.id" class="event-item">
              <span class="event-chapter">第{{ e.chapterNumber }}章</span>
              <span class="event-name">{{ e.name }}</span>
            </div>
          </div>
        </template>

        <!-- 空态：未选中 -->
        <div v-else class="detail-placeholder">
          <el-icon><Mouse /></el-icon>
          <p>点击图中的实体查看详情</p>
          <span>显示实体信息、相关实体、状态时间线与事件</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 知识图谱（新 Tab 视图）
 * 左图右详情：渲染走公共 ForceGraph（默认 3D WebGL 力导向，可切 2D SVG 兜底）；
 * 工具栏 = 章节时间轴过滤 + 实体类型过滤 chips + 3D/2D 切换 + 缩放；
 * 点击实体右侧详情栏显示：基本信息/当前状态/相关实体（点击跳转）/状态时间线/相关事件。
 * 「AI 分析实体关系」：调 AI 识别设定关系 → 幂等落库 lw_graph_edges → 刷新图谱。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Close, MagicStick, Share, Mouse, ZoomIn, ZoomOut, FullScreen } from '@element-plus/icons-vue'
import ForceGraph from '@/components/common/ForceGraph.vue'
import type { ForceGraphEdge, ForceGraphNode } from '@/components/common/force-graph.model'

const props = defineProps<{
  projectId: string
}>()

// 图引擎（力导向/缩放/平移/拖动/选中淡化）由公共 ForceGraph 提供；本组件只留
// 数据获取/过滤/详情/工具栏。graphRef 暴露 zoomAt/fitView，缩放读数走 zoom 事件。
const graphRef = ref<InstanceType<typeof ForceGraph> | null>(null)
const zoomPercent = ref(100)
/** 结构重排键：数据装载成功后自增，通知公共组件重布局（章节过滤等只动可见集不重排） */
const graphVersion = ref(0)

interface GraphNode { id: string; type: string; name: string; description?: string; chapterNumber?: number }
interface GraphEdge { id: string; sourceId: string; targetId: string; relationType: string; label?: string; validFromChapter?: number; validUntilChapter?: number }

interface RelatedEntity {
  key: string
  name: string
  type: string
  relationType: string
  neighborId: string
  validFromChapter?: number
  validUntilChapter?: number
}

const loading = ref(false)
const generating = ref(false)
const nodes = ref<GraphNode[]>([])
const edges = ref<GraphEdge[]>([])
const chapterFilter = ref(0)
const maxChapter = ref(1)
const selectedNode = ref<string | null>(null)
const detail = ref<any>(null)
const relatedEntities = ref<RelatedEntity[]>([])
const timeline = ref<Array<{ chapterNumber: number; stateSummary: string; keyChanges?: string[] }>>([])
const detailState = ref<any>(null)

// ==================== 渲染模式（3D 默认）与实体类型过滤 ====================

const RENDER_MODE_KEY = 'lw.graph.renderMode'
const renderMode = ref<'2d' | '3d'>(localStorage.getItem(RENDER_MODE_KEY) === '2d' ? '2d' : '3d')
watch(renderMode, (mode) => localStorage.setItem(RENDER_MODE_KEY, mode))

const FILTER_TYPES = ['character', 'location', 'item', 'faction', 'skill', 'event']
const typeFilter = ref<Set<string>>(new Set(FILTER_TYPES))

function toggleType(type: string): void {
  const next = new Set(typeFilter.value)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  typeFilter.value = next
}

function resetFilters(): void {
  typeFilter.value = new Set(FILTER_TYPES)
  chapterFilter.value = 0
}

const typeCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const n of nodes.value) counts[n.type] = (counts[n.type] || 0) + 1
  return counts
})

const hasEntities = computed(() => nodes.value.length > 0)

/** 可见性过滤：类型 chips + 章节时间轴（事件节点只在"发生章节 ≤ 当前章节"时显示；
 *  实体节点无章节概念常显）。过滤只动可见集不重排（layoutKey 语义） */
const visibleNodes = computed(() => {
  const cn = chapterFilter.value
  return nodes.value.filter(n =>
    typeFilter.value.has(n.type) &&
    (cn === 0 || n.type !== 'event' || (n.chapterNumber !== undefined && n.chapterNumber <= cn)),
  )
})

/** 公共模型：节点 = 类型色/半径；边 = 双向端点 + 关系标题 */
const fgNodes = computed<ForceGraphNode[]>(() =>
  visibleNodes.value.map(n => ({
    id: n.id,
    name: n.name,
    color: nodeColor(n.type),
    radius: nodeRadius(n),
  })),
)

const fgEdges = computed<ForceGraphEdge[]>(() => {
  const visibleIds = new Set(visibleNodes.value.map(n => n.id))
  return visibleEdges.value
    .filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
    .map(e => ({ id: e.id, source: e.sourceId, target: e.targetId, title: e.relationType }))
})

function onGraphSelect(node: ForceGraphNode | null): void {
  // 按下即选中：高亮/淡化由公共组件接管；此处仅保证 host 选中态一致
  selectedNode.value = node ? node.id : null
}

function onGraphClick(node: ForceGraphNode): void {
  const orig = nodes.value.find(n => n.id === node.id)
  if (orig) void selectNode(orig)
}

const nodeColor = (type: string): string => {
  const colors: Record<string, string> = {
    character: '#409EFF', location: '#67C23A', item: '#E6A23C',
    faction: '#909399', skill: '#B37FEB', event: '#F56C6C',
  }
  return colors[type] || '#909399'
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    character: '人物', location: '地点', item: '物品',
    faction: '势力', skill: '技能', event: '事件',
  }
  return labels[type] || type
}

function nodeRadius(node: GraphNode): number {
  return node.type === 'event' ? 7 : node.type === 'character' ? 9 : 7
}

const visibleEdges = computed(() => {
  if (chapterFilter.value === 0) return edges.value
  const cn = chapterFilter.value
  return edges.value.filter(e =>
    (e.validFromChapter === undefined || e.validFromChapter <= cn) &&
    (e.validUntilChapter === undefined || e.validUntilChapter >= cn),
  )
})

async function loadGraph(): Promise<void> {
  loading.value = true
  try {
    const r = await window.electronAPI.longwriting.graphGet(props.projectId)
    if (r.success && r.data) {
      nodes.value = r.data.nodes || []
      edges.value = r.data.edges || []
      const maxEdge = Math.max(0, ...edges.value.map(e => e.validUntilChapter || e.validFromChapter || 0))
      maxChapter.value = Math.max(1, maxEdge)
      graphVersion.value++
      // 若当前选中实体还在，刷新其详情
      if (selectedNode.value) {
        const node = nodes.value.find(n => n.id === selectedNode.value)
        if (node) await selectNode(node)
        else deselectNode()
      }
    }
  } finally {
    loading.value = false
  }
}

/** 选中实体：拉详情 + 相关实体 + 时间线 + 章节状态 */
async function selectNode(node: GraphNode): Promise<void> {
  selectedNode.value = node.id
  try {
    const r = await window.electronAPI.longwriting.graphGetNode(props.projectId, node.type, node.id)
    detail.value = r.success && r.data ? { ...r.data, type: node.type } : { ...node, type: node.type }
  } catch {
    detail.value = { ...node, type: node.type }
  }

  // 相关实体（邻居，含边的时间线信息）
  relatedEntities.value = []
  try {
    const rr = await window.electronAPI.longwriting.graphGetRelations(props.projectId, node.type, node.id)
    if (rr.success && Array.isArray(rr.data)) {
      relatedEntities.value = rr.data
        .map((e: any, idx: number) => {
          const isSource = e.sourceId === node.id
          const neighborId = isSource ? e.targetId : e.sourceId
          const neighborType = isSource ? e.targetType : e.sourceType
          const neighbor = nodes.value.find(x => x.id === neighborId)
          if (!neighbor) return null
          return {
            key: `${e.id || idx}-${e.relationType}`,
            name: neighbor.name,
            type: neighborType,
            relationType: e.relationType,
            neighborId,
            validFromChapter: e.validFromChapter,
            validUntilChapter: e.validUntilChapter,
          }
        })
        .filter(Boolean)
    }
  } catch { /* 忽略 */ }

  // 状态时间线（历史快照：每章结束该实体的状态，升序）
  timeline.value = []
  try {
    const tr = await window.electronAPI.longwriting.graphGetTimeline(props.projectId, node.type, node.id)
    if (tr.success && Array.isArray(tr.data)) {
      timeline.value = tr.data
    }
  } catch { /* 忽略 */ }

  await refreshDetailState()
}

/** 刷新选中实体的章节状态（时间轴联动：切章节时调用） */
async function refreshDetailState(): Promise<void> {
  if (!selectedNode.value || !detail.value) return
  detailState.value = null
  try {
    if (chapterFilter.value > 0) {
      const sr = await window.electronAPI.longwriting.graphGetStateAtChapter(props.projectId, detail.value.type, selectedNode.value, chapterFilter.value)
      if (sr.success && sr.data) detailState.value = sr.data
    } else if (detail.value?.latestState) {
      detailState.value = detail.value.latestState
    }
  } catch { /* 忽略 */ }
}

/** 时间轴变化：边/节点过滤由 computed 自动处理，刷新选中实体的章节状态 */
watch(chapterFilter, () => {
  if (selectedNode.value) {
    void refreshDetailState()
  }
})

function jumpToEntity(rel: { neighborId: string }): void {
  const node = nodes.value.find(x => x.id === rel.neighborId)
  if (node) void selectNode(node)
}

function deselectNode(): void {
  selectedNode.value = null
  detail.value = null
  relatedEntities.value = []
  timeline.value = []
  detailState.value = null
}

/** AI 分析实体关系 → 幂等落库 → 刷新 */
async function generateRelations(): Promise<void> {
  if (generating.value) return
  generating.value = true
  const eventId = `graph-rel-${props.projectId}-${Date.now()}`
  // 流式进度提示（AI 生成中）
  const unsub = window.electronAPI.longwriting.onGenerateEvent(eventId, (ev: any) => {
    if (ev.type === 'error') {
      ElMessage.error(ev.error || '关系分析失败')
    }
  })
  try {
    const r = await window.electronAPI.longwriting.graphGenerateRelations(eventId, props.projectId)
    if (r.success && r.data) {
      const { created, skipped } = r.data
      ElMessage.success(`已建立 ${created} 条实体关系${skipped > 0 ? `（跳过 ${skipped} 条无效/重复）` : ''}`)
      await loadGraph()
    } else {
      ElMessage.error(r.error || '关系分析失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '关系分析失败')
  } finally {
    unsub()
    generating.value = false
  }
}

onMounted(() => {
  loadGraph()
})
</script>

<style lang="scss" scoped>
.graph-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 480px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color-lighter);
  flex-wrap: wrap;

  .graph-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color-primary);
  }

  .graph-controls {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 260px;

    .filter-label {
      font-size: 12px;
      color: var(--text-color-secondary);
      white-space: nowrap;
    }

      .filter-value {
        font-size: 12px;
        color: var(--text-color-secondary);
        min-width: 56px;
        white-space: nowrap;
      }
    }

    .type-filter {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;

      .type-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 10px;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-color-lighter);
        background: var(--fill-color-lighter);
        font-size: 12px;
        color: var(--text-color-primary);
        cursor: pointer;
        user-select: none;
        transition: all var(--transition-fast);
        white-space: nowrap;

        &:hover {
          border-color: var(--color-primary-light-5);
        }

        .chip-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .chip-count {
          font-size: 11px;
          color: var(--text-color-secondary);
          font-variant-numeric: tabular-nums;
        }

        &.off {
          opacity: 0.45;

          .chip-dot {
            background: var(--text-color-placeholder) !important;
          }

          .chip-count {
            color: var(--text-color-placeholder);
          }
        }
      }
    }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    background: var(--fill-color-lighter);
    border: 1px solid var(--border-color-lighter);

    .zoom-percent {
      min-width: 44px;
      text-align: center;
      font-size: 12px;
      color: var(--text-color-secondary);
      font-variant-numeric: tabular-nums;
    }

    :deep(.el-button) {
      margin-left: 0;
    }
  }
}

.graph-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

// ==================== 图区 ====================
// 图引擎（svg/边/节点/淡化/高亮）样式已随抽取收口到 components/common/ForceGraph.vue，
// 此处仅保留画布容器（背景渐变尽量还原原 graph-svg 观感）

.graph-canvas {
  flex: 1;
  min-width: 0;
  position: relative;
  background: linear-gradient(180deg, var(--bg-color) 0%, var(--fill-color-lighter) 100%);
}

.graph-loading,
.graph-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-color-placeholder);
  font-size: 13px;
  text-align: center;

  .el-icon {
    font-size: 32px;
    opacity: 0.5;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-color-secondary);
    font-size: 14px;
  }

  span {
    font-size: 12px;
    line-height: 1.8;
  }
}

// ==================== 详情栏 ====================

.graph-detail {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  overflow-y: auto;
  padding: 14px;
}

.detail-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-color-placeholder);
  text-align: center;

  .el-icon {
    font-size: 30px;
    opacity: 0.4;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-color-secondary);
    font-size: 13px;
  }

  span {
    font-size: 12px;
  }
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;

  .detail-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-tag {
    border: none;
    color: #fff;
    font-size: 11px;
  }

  .detail-close {
    color: var(--text-color-placeholder);
  }
}

.detail-block {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color-lighter);

  .detail-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-color-secondary);
    margin-bottom: 6px;
  }

  .detail-text {
    font-size: 13px;
    color: var(--text-color-regular);
    line-height: 1.7;
    white-space: pre-wrap;
  }
}

.key-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

// 相关实体

.relation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary-light-5);
    transform: translateX(2px);
  }
}

.rel-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rel-body {
  flex: 1;
  min-width: 0;
}

.rel-top {
  display: flex;
  align-items: center;
  gap: 6px;

  .rel-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rel-type {
    font-size: 11px;
    color: var(--text-color-placeholder);
    flex-shrink: 0;
  }
}

.rel-relation {
  font-size: 11px;
  color: var(--color-primary);
  margin-top: 2px;

  .rel-time {
    color: var(--text-color-placeholder);
    font-size: 10.5px;
  }
}

// 时间线

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}

.timeline-item {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  padding: 4px 0;

  .timeline-chapter {
    color: var(--color-primary);
    flex-shrink: 0;
    font-weight: 500;
  }

  .timeline-state {
    color: var(--text-color-regular);
    line-height: 1.5;
  }
}

// 事件

.event-item {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  padding: 4px 0;

  .event-chapter {
    color: var(--color-danger);
    flex-shrink: 0;
    font-weight: 500;
  }

  .event-name {
    color: var(--text-color-regular);
  }
}
</style>
