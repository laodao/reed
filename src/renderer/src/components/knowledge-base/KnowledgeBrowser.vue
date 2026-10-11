<template>
  <div class="kb-browser">
    <el-tabs v-model="tab" type="border-card" class="kb-browser-tabs">
      <!-- 世界体系：层级树（attrs 属性槽） -->
      <el-tab-pane :label="`世界体系（${systems.length}）`" name="systems">
        <el-empty v-if="systems.length === 0 && !loading" description="还没有体系树——等体系汇聚产线跑完（设定层论断 ≥12 条后自动归纳）" />
        <el-collapse v-model="openSystems">
          <el-collapse-item v-for="sys in systems" :key="sys.name" :name="sys.name">
            <template #title>
              <span class="kb-sys-title">🌐 {{ sys.name }}<span class="kb-sys-sub">（{{ sys.nodeCount }} 节点 · {{ sys.edgeCount }} 层级关系）</span></span>
            </template>
            <el-tree :data="sys.tree" default-expand-all :props="{ label: 'name', children: 'children' }">
              <template #default="{ data }">
                <div class="kb-sys-node">
                  <span class="kb-sys-name">{{ data.name }}</span>
                  <span v-if="data.orderLabel" class="kb-sys-order">{{ data.orderLabel }}</span>
                  <div v-if="data.attrs.length" class="kb-sys-attrs">
                    <span v-for="a in data.attrs" :key="a.k" class="kb-sys-attr"><i>{{ a.k }}</i>：{{ a.v }}</span>
                  </div>
                  <div v-if="data.summary" class="kb-sys-summary">{{ data.summary }}</div>
                </div>
              </template>
            </el-tree>
          </el-collapse-item>
        </el-collapse>
        <template v-if="sysTreeCards.length > 0">
          <div class="kb-sys-docs-title">体系树文档（每棵树的完整层级文本）</div>
          <el-collapse v-model="openSysDocs">
            <el-collapse-item v-for="c in sysTreeCards" :key="c.id" :name="c.id">
              <template #title>
                <span class="kb-doc-title">{{ c.title }}</span>
              </template>
              <div class="kb-doc-body" v-html="c.bodyHtml" />
            </el-collapse-item>
          </el-collapse>
        </template>
      </el-tab-pane>

      <!-- 故事结构与弧线：阶段时间线 -->
      <el-tab-pane :label="`结构与弧线（${structureCards.length}）`" name="structure">
        <el-empty v-if="structureCards.length === 0 && !loading" description="还没有结构卡——「故事线设计/人物设计」提炼目标跑完后自动产出阶段表" />
        <el-collapse v-model="openStructure">
          <el-collapse-item v-for="c in structureCards" :key="c.id" :name="c.id">
            <template #title>
              <span class="kb-doc-title">{{ c.kindLabel }}｜{{ c.title }}</span>
            </template>
            <div v-if="c.stages.length" class="kb-stages">
              <div v-for="(st, i) in c.stages" :key="i" class="kb-stage">
                <div class="kb-stage-pos">约全书 {{ Math.round(st.position * 100) }}%</div>
                <div class="kb-stage-main">
                  <b>{{ st.name }}</b>
                  <span v-if="st.function" class="kb-stage-line">{{ st.function }}</span>
                  <span v-if="st.coreConflict" class="kb-stage-line">冲突：{{ st.coreConflict }}</span>
                  <span v-if="st.turnPoint" class="kb-stage-line">转折：{{ st.turnPoint }}</span>
                  <span v-if="st.cost" class="kb-stage-line kb-stage-cost">代价：{{ st.cost }}</span>
                </div>
              </div>
            </div>
            <div class="kb-doc-body" v-html="c.bodyHtml" />
          </el-collapse-item>
        </el-collapse>
      </el-tab-pane>

      <!-- 写作方法：文档阅读 -->
      <el-tab-pane :label="`写作方法（${methodCards.length}）`" name="methods">
        <div class="kb-method-filter">
          <el-radio-group v-model="methodType" size="small">
            <el-radio-button value="all">全部（{{ methodCards.length }}）</el-radio-button>
            <el-radio-button v-for="t in METHOD_TYPES" :key="t.type" :value="t.type">
              {{ t.label }}（{{ methodCards.filter(c => c.type === t.type).length }}）
            </el-radio-button>
          </el-radio-group>
        </div>
        <el-empty v-if="filteredMethods.length === 0 && !loading" description="该类型暂无方法卡" />
        <el-collapse v-model="openMethods">
          <el-collapse-item v-for="c in filteredMethods" :key="c.id" :name="c.id">
            <template #title>
              <span class="kb-doc-title">
                <el-tag size="small" :type="c.tagType" effect="plain">{{ c.kindLabel }}</el-tag>
                {{ c.title }}
              </span>
            </template>
            <div class="kb-doc-body" v-html="c.bodyHtml" />
          </el-collapse-item>
        </el-collapse>
      </el-tab-pane>

      <!-- 书级档案：单书文档 -->
      <el-tab-pane :label="`书级档案（${archiveCards.length}）`" name="archives">
        <el-collapse v-model="openArchives">
          <el-collapse-item v-for="c in archiveCards" :key="c.id" :name="c.id">
            <template #title>
              <span class="kb-doc-title">
                <el-tag size="small" effect="plain">{{ c.kindLabel }}</el-tag>
                {{ c.title }}
              </span>
            </template>
            <div class="kb-doc-body" v-html="c.bodyHtml" />
          </el-collapse-item>
        </el-collapse>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{ kbId: string }>()

interface Stage {
  name: string
  position: number
  function?: string
  coreConflict?: string
  turnPoint?: string
  cost?: string
}
interface NoteRow {
  id: string
  type: string
  title: string
  description: string
  body: string
  structureStages: string | null
  tags?: string | null
}
interface GraphNode {
  id: string
  name: string
  entityType: string
  attrs: string | null
  summary: string | null
}
interface GraphEdge {
  source: string
  target: string
  relation: string
}

interface BrainClient {
  listNotes(p: { kbId: string; status: string; page: number; pageSize: number }): Promise<{ success: boolean; data?: { rows: NoteRow[] }; error?: string }>
  graphData(p: { kbId: string }): Promise<{ success: boolean; data?: { nodes: GraphNode[]; edges: GraphEdge[] }; error?: string }>
  healthCheck(p: { kbId: string }): Promise<{ success: boolean; data?: { coverage?: { docsList?: Array<{ id: string; name: string }> } }; error?: string }>
}

const tab = ref<'systems' | 'structure' | 'methods' | 'archives'>('systems')
const loading = ref(false)
const notes = ref<NoteRow[]>([])
const graphNodes = ref<GraphNode[]>([])
const graphEdges = ref<GraphEdge[]>([])

const METHOD_TYPES = [
  { type: 'plot-pattern', label: '场面套路' },
  { type: 'craft-case', label: '案例拆解' },
  { type: 'principle', label: '原理' },
  { type: 'genre-insight', label: '品类认知' },
  { type: 'anti-pattern', label: '反面模式' },
  { type: 'setting-pattern', label: '设定体系' },
] as const

const KIND_LABELS: Record<string, string> = {
  'structure-map': '故事结构',
  'character-arc': '角色弧线',
  'plot-pattern': '场面套路',
  'craft-case': '案例拆解',
  principle: '原理',
  'genre-insight': '品类认知',
  'anti-pattern': '反面模式',
  'setting-pattern': '设定体系',
  'book-outline': '全书大纲',
  'setting-index': '设定索引',
  'character-roster': '人物册',
  'foreshadow-ledger': '伏笔台账',
  'book-summary': '全书综述',
  'reading-review': '终审复核',
}

const TAG_TYPES: Record<string, string> = {
  'plot-pattern': 'primary',
  'craft-case': 'success',
  principle: 'warning',
  'genre-insight': 'danger',
  'anti-pattern': 'danger',
  'setting-pattern': 'info',
  'structure-map': 'primary',
  'character-arc': 'success',
}

/* ---------- 世界体系树 ---------- */

interface SysTreeNode {
  id: string
  name: string
  orderLabel: string
  attrs: Array<{ k: string; v: string }>
  summary: string
  children: SysTreeNode[]
}
interface SystemGroup {
  name: string
  nodeCount: number
  edgeCount: number
  tree: SysTreeNode[]
}

const systems = computed<SystemGroup[]>(() => {
  const attrsOf = new Map<string, { order: number; system: string; kind: string; kv: Array<{ k: string; v: string }> }>()
  for (const n of graphNodes.value) {
    let order = Number.MAX_SAFE_INTEGER
    let system = ''
    let systemKind = ''
    const kv: Array<{ k: string; v: string }> = []
    if (n.attrs) {
      try {
        const parsed = JSON.parse(n.attrs) as Record<string, unknown>
        if (typeof parsed.order === 'number') order = parsed.order
        if (typeof parsed.system === 'string') system = parsed.system
        if (typeof parsed.kind === 'string') systemKind = parsed.kind
        for (const [k, v] of Object.entries(parsed)) {
          if (k === 'order' || k === 'system') continue
          if (typeof v === 'string' && v.trim()) kv.push({ k, v })
        }
      } catch {
        /* attrs 损坏按无属性处理 */
      }
    }
    attrsOf.set(n.id, { order, system, kind: systemKind, kv })
  }
  const nameOf = new Map(graphNodes.value.map((n) => [n.id, n]))
  // 只收体系层级边——人物/物品关系（师徒/敌对/隶属等）不属于世界体系页签
  const treeEdges = graphEdges.value.filter((e) => e.relation === 'sublevel-of')
  const childrenOf = new Map<string, string[]>()
  const parentOf = new Map<string, string>()
  for (const e of treeEdges) {
    const arr = childrenOf.get(e.target) ?? []
    arr.push(e.source)
    childrenOf.set(e.target, arr)
    if (!parentOf.has(e.source)) parentOf.set(e.source, e.target)
  }
  // ladder 形态：按 order 顺序链补父子（边缺失时渲染仍完整）
  const kindOf = new Map<string, string>()
  for (const n of graphNodes.value) {
    const meta = attrsOf.get(n.id)
    if (meta?.kind) kindOf.set(n.id, meta.kind)
  }
  const bySystem = new Map<string, GraphNode[]>()
  for (const n of graphNodes.value) {
    const meta = attrsOf.get(n.id)
    if (!meta?.system) continue
    const arr = bySystem.get(meta.system) ?? []
    arr.push(n)
    bySystem.set(meta.system, arr)
  }
  for (const members of bySystem.values()) {
    const kind = kindOf.get(members[0]!.id)
    if (kind !== 'ladder' || members.length < 2) continue
    const sorted = [...members].sort((a, b) => {
      const oa = attrsOf.get(a.id)?.order ?? Number.MAX_SAFE_INTEGER
      const ob = attrsOf.get(b.id)?.order ?? Number.MAX_SAFE_INTEGER
      return oa - ob
    })
    for (let i = 0; i < sorted.length - 1; i++) {
      const child = sorted[i]!.id
      const parent = sorted[i + 1]!.id
      if (!parentOf.has(child)) {
        const arr = childrenOf.get(parent) ?? []
        arr.push(child)
        childrenOf.set(parent, arr)
        parentOf.set(child, parent)
      }
    }
  }
  // system 继承：自身没有就沿父链找（子节点常不带 system 属性）
  const systemOf = (id: string): string => {
    let cur: string | undefined = id
    for (let i = 0; i < 8 && cur; i++) {
      const m = attrsOf.get(cur)
      if (m?.system) return m.system
      cur = parentOf.get(cur)
    }
    return ''
  }
  // 参与体系边的节点 + 有 system 属性的孤立节点（单层体系）
  const inTree = new Set<string>([...treeEdges.flatMap((e) => [e.source, e.target]), ...graphNodes.value.filter((n) => attrsOf.get(n.id)?.system).map((n) => n.id)])
  const build = (id: string): SysTreeNode => {
    const n = nameOf.get(id)
    const meta = attrsOf.get(id)
    const kids = (childrenOf.get(id) ?? [])
      .map(build)
      .sort((a, b) => a.orderLabel.localeCompare(b.orderLabel, 'zh', { numeric: true }))
    return {
      id,
      name: n?.name ?? id.slice(0, 8),
      orderLabel: meta && meta.order !== Number.MAX_SAFE_INTEGER ? `第 ${meta.order} 层` : '',
      attrs: meta?.kv ?? [],
      summary: n?.summary ?? '',
      children: kids,
    }
  }
  const count = (n: SysTreeNode): number => 1 + n.children.reduce((acc, c) => acc + count(c), 0)
  // 分组：按继承后的 system；无父节点（体系内顶层）作为树根
  const groups = new Map<string, { nodeCount: number; roots: SysTreeNode[]; edges: number }>()
  for (const id of inTree) {
    if (parentOf.has(id)) continue
    const key = systemOf(id) || '（待归体系）'
    const g = groups.get(key) ?? { nodeCount: 0, roots: [], edges: 0 }
    const root = build(id)
    g.roots.push(root)
    g.nodeCount += count(root)
    g.edges += root.children.length + countTreeEdges(root.children)
    groups.set(key, g)
  }
  return [...groups]
    .map(([name, g]) => ({ name, nodeCount: g.nodeCount, edgeCount: g.edges, tree: g.roots.sort((a, b) => a.name.localeCompare(b.name, 'zh')) }))
    .filter((g) => g.nodeCount >= 2)
    .sort((a, b) => b.nodeCount - a.nodeCount)
})

function countTreeEdges(roots: SysTreeNode[]): number {
  return roots.reduce((acc, r) => acc + r.children.length + countTreeEdges(r.children), 0)
}

/* ---------- 卡片分组 ---------- */

interface DocCard {
  id: string
  type: string
  kindLabel: string
  tagType: string
  title: string
  bodyHtml: string
  stages: Stage[]
}

/** 展示标题清洗：去下载站后缀噪音与扩展名（卡片标题可读性） */
function cleanTitle(title: string): string {
  return title.replace(/\s*\((z-library|1lib|z-lib)[^)]*\)/gi, '').replace(/\.(epub|txt|pdf|mobi|azw3)\b/gi, '')
}
const docNames = new Map<string, string>()
/** 正文里的 8 位文档 id 前缀 → 书名（变体登记等场景） */
function humanizeDocRefs(html: string): string {
  return html.replace(/([0-9a-f]{8})(?=[:：])/g, (hex) => docNames.get(hex) ?? hex)
}
const toCard = (n: NoteRow): DocCard => {
  const isSysTree = n.type === 'structure-map' && (n.title.startsWith('设定体系：') || JSON.parse(n.tags || '[]').includes('system-aggregate') === true)
  return {
    id: n.id,
    type: n.type,
    kindLabel: isSysTree ? '设定体系树' : KIND_LABELS[n.type] ?? n.type,
    tagType: TAG_TYPES[n.type] ?? 'info',
    title: cleanTitle(n.title),
    bodyHtml: humanizeDocRefs(renderMarkdown(n.body ?? '')),
    stages: parseStages(n.structureStages),
  }
}

function parseStages(raw: string | null): Stage[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as Stage[]
    return Array.isArray(arr) ? arr.filter((s) => s && typeof s.name === 'string').sort((a, b) => a.position - b.position) : []
  } catch {
    return []
  }
}

const isSysTreeCard = (n: NoteRow): boolean =>
  n.type === 'structure-map' && (n.title.startsWith('设定体系：') || (() => {
    try {
      return (JSON.parse(n.tags ?? '[]') as string[]).includes('system-aggregate')
    } catch {
      return false
    }
  })())
const structureCards = computed<DocCard[]>(() =>
  notes.value
    .filter((n) => (n.type === 'structure-map' || n.type === 'character-arc') && !isSysTreeCard(n))
    .map(toCard)
)
const sysTreeCards = computed<DocCard[]>(() => notes.value.filter(isSysTreeCard).map(toCard))
const methodCards = computed<DocCard[]>(() =>
  notes.value.filter((n) => METHOD_TYPES.some((t) => t.type === n.type)).map(toCard)
)
const methodType = ref<string>('all')
const filteredMethods = computed<DocCard[]>(() =>
  methodType.value === 'all' ? methodCards.value : methodCards.value.filter((c) => c.type === methodType.value)
)
const ARCHIVE_TYPES = ['book-outline', 'setting-index', 'character-roster', 'foreshadow-ledger', 'book-summary', 'reading-review', 'reading-memory']
const archiveCards = computed<DocCard[]>(() =>
  notes.value.filter((n) => ARCHIVE_TYPES.includes(n.type)).map(toCard)
)

const openSysDocs = ref<string[]>([])
const openSystems = ref<string[]>([])
const openStructure = ref<string[]>([])
const openMethods = ref<string[]>([])
const openArchives = ref<string[]>([])

/* ---------- 加载 ---------- */

async function load(): Promise<void> {
  loading.value = true
  try {
    const api = (window as unknown as { electronAPI: { knowledgeBase: { brain: BrainClient } } }).electronAPI.knowledgeBase.brain
    const [notesRes, graphRes, healthRes] = await Promise.all([
      api.listNotes({ kbId: props.kbId, status: 'published', page: 1, pageSize: 100 }),
      api.graphData({ kbId: props.kbId }),
      api.healthCheck({ kbId: props.kbId }).catch(() => null),
    ])
    const healthData = (healthRes && 'data' in healthRes ? healthRes.data : null) ?? null
    if (healthData?.coverage?.docsList) {
      for (const d of healthData.coverage.docsList) {
        docNames.set(d.id.slice(0, 8), cleanTitle(d.name).slice(0, 24))
      }
    }
    if (notesRes.success && notesRes.data) {
      notes.value = notesRes.data.rows
    }
    if (graphRes.success && graphRes.data) {
      const d = graphRes.data as { nodes: GraphNode[]; edges: GraphEdge[] }
      graphNodes.value = d.nodes ?? []
      graphEdges.value = d.edges ?? []
    }
    openSystems.value = systems.value.slice(0, 3).map((s) => s.name)
    openSysDocs.value = sysTreeCards.value.slice(0, 2).map((c) => c.id)
    openStructure.value = structureCards.value.slice(0, 2).map((c) => c.id)
    openMethods.value = methodCards.value.slice(0, 2).map((c) => c.id)
    openArchives.value = archiveCards.value.slice(0, 2).map((c) => c.id)
  } catch (e) {
    ElMessage.error(`知识加载失败: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    loading.value = false
  }
}

onMounted(load)

defineExpose({ reload: load })
</script>

<style scoped>
.kb-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.kb-browser-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.kb-browser-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
}
.kb-browser-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
  background: var(--el-fill-color-light);
}
.kb-sys-title {
  font-weight: 600;
  font-size: 14px;
}
.kb-sys-sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 6px;
  font-weight: 400;
}
.kb-browser :deep(.el-tree) {
  background: transparent;
  --el-tree-node-content-height: unset;
}
.kb-browser :deep(.el-tree-node__content) {
  height: unset;
  min-height: 32px;
  padding: 4px 0;
  align-items: flex-start;
}
.kb-sys-node {
  line-height: 1.6;
  padding: 2px 8px 6px;
  flex: 1;
}
.kb-sys-name {
  font-weight: 600;
  font-size: 14px;
}
.kb-sys-order {
  margin-left: 8px;
  color: var(--el-color-primary);
  font-size: 12px;
}
.kb-sys-attrs {
  margin: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kb-sys-attr {
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 2px 8px;
  width: fit-content;
}
.kb-sys-attr i {
  color: var(--el-text-color-secondary);
  font-style: normal;
}
.kb-sys-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  max-width: 720px;
  margin-top: 2px;
}
.kb-doc-title {
  font-weight: 600;
  font-size: 14px;
}
.kb-doc-title .el-tag {
  margin-right: 8px;
}
.kb-doc-body {
  max-width: 860px;
  line-height: 1.75;
  font-size: 13.5px;
}
.kb-doc-body :deep(h1),
.kb-doc-body :deep(h2),
.kb-doc-body :deep(h3) {
  font-size: 14px;
  margin: 10px 0 6px;
}
.kb-doc-body :deep(blockquote) {
  margin: 6px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
  border-radius: 0 6px 6px 0;
  color: var(--el-text-color-secondary);
}
.kb-doc-body :deep(code) {
  background: var(--el-fill-color);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
.kb-doc-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 12.5px;
  margin: 8px 0;
  display: block;
  overflow-x: auto;
}
.kb-doc-body :deep(th),
.kb-doc-body :deep(td) {
  border: 1px solid var(--el-border-color-lighter);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  min-width: 120px;
  white-space: normal;
}
.kb-doc-body :deep(th) {
  background: var(--el-fill-color-light);
  font-weight: 600;
  white-space: nowrap;
}
.kb-sys-docs-title {
  margin: 18px 0 8px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.kb-method-filter {
  margin-bottom: 10px;
}
.kb-stages {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kb-stage {
  display: flex;
  gap: 14px;
  padding: 10px 14px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-lighter);
  border-radius: 0 8px 8px 0;
}
.kb-stage-pos {
  min-width: 92px;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
  padding-top: 2px;
}
.kb-stage-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
}
.kb-stage-line {
  color: var(--el-text-color-regular);
}
.kb-stage-cost {
  color: var(--el-color-danger);
}
.kb-browser :deep(.el-collapse-item__header) {
  padding: 4px 0;
}
</style>
