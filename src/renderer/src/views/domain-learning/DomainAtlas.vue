<template>
  <div class="domain-atlas">
    <!-- 顶栏：返回 + 领域信息 + 画像 -->
    <div class="atlas-header">
      <el-button text :icon="ArrowLeft" @click="goBackToSpace">返回学习空间</el-button>
      <div class="atlas-title">
        <h2>{{ space?.name }}</h2>
        <span class="atlas-sub">知识体系全景</span>
      </div>
      <div class="profile-tag" :title="profile.nature">
        <el-tag type="warning" effect="plain">{{ profile.kindLabel }}</el-tag>
        <span class="profile-nature">{{ profile.nature }}</span>
      </div>
      <div class="atlas-actions">
        <el-button plain :icon="Share" @click="resetFocus">全图</el-button>
        <el-button type="primary" :icon="Back" @click="goBackToSpace">回到讲义空间</el-button>
      </div>
    </div>

    <!-- 画像侧重提示条 -->
    <div class="emphasis-bar">
      <span class="emphasis-label">本领域侧重</span>
      <el-tag
        v-for="t in profile.emphasis"
        :key="t"
        size="small"
        effect="plain"
        class="emphasis-tag"
        :style="{ color: nodeTypeMeta(t).color, borderColor: nodeTypeMeta(t).color }"
      >
        {{ nodeTypeMeta(t).label }}
      </el-tag>
      <span class="emphasis-hint">（节点类型 → 档案侧重：{{ profileHint }}）</span>
    </div>

    <div class="atlas-body">
      <!-- 左：大纲树（提纲挈领文字版） -->
      <aside class="pane pane-tree">
        <div class="pane-title">
          <span>结构索引</span>
          <el-tooltip content="点击定位到主图节点" placement="top">
            <el-icon><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="tree-legend">
          <span v-for="t in emphasisTypes" :key="t" class="legend-item">
            <i class="dot" :style="{ background: nodeTypeMeta(t).color }" />
            {{ nodeTypeMeta(t).label }}
          </span>
        </div>
        <div class="tree-scroll">
          <div v-for="g in groupedNodes" :key="g.group" class="tree-group">
            <div class="tree-group-title">{{ g.group }}</div>
            <div
              v-for="n in g.nodes"
              :key="n.id"
              class="tree-node"
              :class="{ active: selectedId === n.id }"
              @click="selectFromTree(n)"
            >
              <i class="dot" :style="{ background: nodeTypeMeta(n.type).color }" />
              <span class="tree-name">{{ n.name }}</span>
              <i v-if="n.mastery === 'mastered'" class="check el-icon"><CircleCheckFilled /></i>
              <i v-else-if="n.mastery === 'learning'" class="check learning"><Loading /></i>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中：主图（AtlasGraph） -->
      <section class="pane pane-graph">
        <!-- 面包屑：全局 > 子图谱（聚焦节点） -->
        <div v-if="focusNode" class="crumb-bar">
          <span class="crumb-root" @click="resetFocus">全领域</span>
          <el-icon><ArrowRight /></el-icon>
          <span class="crumb-now">{{ focusNode.name }}</span>
          <span class="crumb-tip">· 子图谱（{{ focusNode.name }} 与其直接关联）</span>
        </div>
        <AtlasGraph
          :nodes="graph?.nodes ?? []"
          :edges="graph?.edges ?? []"
          :focus-id="focusId"
          @select="onSelect"
          @dblclick="onDrill"
        />
      </section>

      <!-- 右：节点档案 -->
      <aside class="pane pane-profile">
        <template v-if="selected">
          <div class="profile-header">
            <span class="profile-name">{{ selected.name }}</span>
            <el-tag size="small" :style="{ background: nodeTypeMeta(selected.type).color, border: 'none', color: '#fff' }">
              {{ nodeTypeMeta(selected.type).label }}
            </el-tag>
            <el-button size="small" text class="profile-close" @click="onSelect(null)"><el-icon><Close /></el-icon></el-button>
          </div>
          <div class="profile-body">
            <!-- 定义 -->
            <div class="p-block">
              <div class="p-label">定义 / 要点</div>
              <div class="p-text">{{ selected.desc }}</div>
            </div>
            <!-- 类型专属字段 -->
            <div v-if="selected.attrs && Object.keys(selected.attrs).length" class="p-block">
              <div class="p-label">关键属性</div>
              <div v-for="(v, k) in selected.attrs" :key="k" class="attr-row">
                <span class="attr-key">{{ k }}</span>
                <span class="attr-val">{{ v }}</span>
              </div>
            </div>
            <!-- 关联内容（随画像侧重） -->
            <div v-if="selected.related?.length" class="p-block">
              <div class="p-label">关联内容</div>
              <div v-for="(r, i) in selected.related" :key="i" class="related-item">
                <el-icon><Document /></el-icon>
                <span>{{ r }}</span>
              </div>
            </div>
            <!-- 直接关系 -->
            <div class="p-block">
              <div class="p-label">直接关系（{{ directRels.length }}）</div>
              <div v-for="rel in directRels" :key="rel.key" class="rel-item" @click="jumpTo(rel)">
                <span class="rel-direction">{{ rel.dir }}</span>
                <span class="rel-type">{{ rel.type }}</span>
                <span class="rel-name">{{ rel.name }}</span>
              </div>
              <div v-if="directRels.length === 0" class="p-empty">暂无直接关系</div>
            </div>
            <!-- 操作 -->
            <div class="p-actions">
              <el-button size="small" type="primary" plain :icon="Share" @click="drillSelected">
                打开子图谱
              </el-button>
              <el-button size="small" :icon="Reading" @click="goLearn(selected)">
                去学它
              </el-button>
            </div>
          </div>
        </template>
        <div v-else class="profile-placeholder">
          <el-icon><Mouse /></el-icon>
          <p>点击图中的知识点查看档案</p>
          <span>展示定义、关键属性、关联内容与直接关系；双击或「打开子图谱」进入该知识点的局部图谱。</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 知识全景 Atlas（前端原型）——独立 Tab 页
 * @module views/domain-learning/DomainAtlas
 * @description 领域知识体系化展示：左大纲树 / 中自绘力导向主图 / 右节点档案；
 *              单击选中聚焦一阶邻居；双击或"打开子图谱"进入局部图（面包屑可回退）；
 *              顶栏与侧重条按"领域画像"呈现（T5 法规驱动 / T7 论文驱动等差异）。
 *              样例数据 atlas-data.ts；后端未接入。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Back,
  CircleCheckFilled,
  Close,
  Document,
  InfoFilled,
  Loading,
  Mouse,
  Reading,
  Share,
} from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'
import { findSpace } from './mock-data'
import {
  atlasForSpace,
  profileForSpace,
  nodeTypeMeta,
  type AtlasEdge,
  type AtlasNode,
  type AtlasNodeType,
} from './atlas-data'
import AtlasGraph from './AtlasGraph.vue'

const route = useRoute()
const router = useRouter()
const tabsStore = useTabsStore()

const spaceId = computed(() => String(route.params.id ?? ''))
const space = computed(() => findSpace(spaceId.value))
const profile = computed(() => profileForSpace(spaceId.value))
const graph = computed(() => atlasForSpace(spaceId.value))

const selectedId = ref<string | null>(null)
/** 下钻：非空 = 子图谱模式（该节点 + 一阶邻居） */
const focusId = ref<string | null>(null)

const selected = computed<AtlasNode | null>(
  () => graph.value?.nodes.find(n => n.id === selectedId.value) ?? null
)
const focusNode = computed<AtlasNode | null>(
  () => graph.value?.nodes.find(n => n.id === focusId.value) ?? null
)

/** 侧重类型（在图中出现的顺序） */
const emphasisTypes = computed<AtlasNodeType[]>(() => {
  const order = profile.value.emphasis
  const set = new Set(order)
  const present = graph.value?.nodes.map(n => n.type).filter(t => set.has(t as AtlasNodeType)) ?? []
  return [...new Set(present as AtlasNodeType[])]
})

const profileHint = computed(() => {
  const labels = profile.value.emphasis.map(t => nodeTypeMeta(t).label)
  return labels.slice(0, 4).join(' / ') + (labels.length > 4 ? '…' : '')
})

/** 左栏分组 */
const groupedNodes = computed(() => {
  const order: string[] = []
  const map = new Map<string, AtlasNode[]>()
  for (const n of graph.value?.nodes ?? []) {
    if (!map.has(n.group)) {
      map.set(n.group, [])
      order.push(n.group)
    }
    map.get(n.group)!.push(n)
  }
  return order.map(g => ({ group: g, nodes: map.get(g)! }))
})

/** 直接关系（含方向信息） */
const directRels = computed(() => {
  const id = selectedId.value
  if (!id || !graph.value) return []
  const out: Array<{ key: string; dir: string; type: string; name: string; targetId: string }> = []
  for (const e of graph.value.edges) {
    if (e.source === id) {
      const t = graph.value.nodes.find(n => n.id === e.target)
      if (t) out.push({ key: `o${e.target}-${e.type}`, dir: '→', type: e.type, name: t.name, targetId: t.id })
    } else if (e.target === id) {
      const s = graph.value.nodes.find(n => n.id === e.source)
      if (s) out.push({ key: `i${e.source}-${e.type}`, dir: '←', type: e.type, name: s.name, targetId: s.id })
    }
  }
  return out
})

function onSelect(node: AtlasNode | null): void {
  selectedId.value = node?.id ?? null
}

function onDrill(node: AtlasNode): void {
  selectedId.value = node.id
  focusId.value = node.id
}

function drillSelected(): void {
  if (selected.value) focusId.value = selected.value.id
}

function resetFocus(): void {
  focusId.value = null
}

/** 从大纲树选中（不自动下钻，只聚焦显示档案） */
function selectFromTree(n: AtlasNode): void {
  selectedId.value = n.id
  // 若当前处于子图谱且该节点不在其中，则退到全图
  if (focusId.value && !neighborOfFocus(n.id) && n.id !== focusId.value) {
    focusId.value = null
  }
}

function neighborOfFocus(id: string): boolean {
  const f = focusId.value
  if (!f || !graph.value) return false
  return graph.value.edges.some(e => (e.source === f && e.target === id) || (e.target === f && e.source === id))
}

function jumpTo(rel: { targetId: string }): void {
  selectedId.value = rel.targetId
}

function goBackToSpace(): void {
  tabsStore.preloadTab(`/domain-learning/${spaceId.value}`, space.value?.name ?? '领域学习')
  router.push(`/domain-learning/${spaceId.value}`)
}

function goLearn(node: AtlasNode): void {
  tabsStore.preloadTab(`/domain-learning/${spaceId.value}`, space.value?.name ?? '领域学习')
  router.push({ path: `/domain-learning/${spaceId.value}`, query: { concept: node.id } })
}
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

.tree-group-title {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  padding: 8px 2px 3px;
}

.tree-node {
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
  }
}

.related-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  padding: 3px 0;
  .el-icon {
    color: var(--el-color-primary);
    font-size: 13px;
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
</style>
