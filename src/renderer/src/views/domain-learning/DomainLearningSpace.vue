<template>
  <div class="domain-learning-space">
    <!-- 原型角标：明确"界面原型 · 后端未接入 · 数据为演示样例" -->
    <div class="proto-banner">
      <el-tag size="small" type="warning" effect="plain">界面原型 · 后端未接入 · 演示数据</el-tag>
    </div>

    <!-- 顶部：空间元信息 -->
    <div class="space-header">
      <el-button text :icon="ArrowLeft" @click="goBack">主题列表</el-button>
      <div class="space-title">
        <h2>{{ space?.name }}</h2>
      </div>
      <div class="space-progress">
        <span class="progress-text">{{ progressText }}</span>
        <el-progress :percentage="masteryPercent" :stroke-width="8" :show-text="false" style="width: 160px" />
      </div>
      <el-button type="primary" plain :icon="Share" @click="openAtlas">知识全景</el-button>
      <el-button type="primary" @click="simulateNextLesson">继续学习 →</el-button>
    </div>

    <div class="space-body">
      <!-- 左栏：知识地图（大纲树，可折叠/搜索/掌握度过滤/父级聚合） -->
      <aside class="pane pane-map">
        <div class="pane-title">
          <span>知识地图</span>
          <el-tooltip content="分支行显示子节点掌握度聚合；点击分支展开/收起；绿色=已理解 · 橙色=学习中 · 灰色=待学" placement="top">
            <el-icon><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="map-legend">
          <span><i class="dot dot-mastered" />已理解</span>
          <span><i class="dot dot-learning" />学习中</span>
          <span><i class="dot dot-todo" />待学</span>
        </div>

        <!-- 过滤条 -->
        <div class="map-filters">
          <el-input
            v-model="mapKeyword"
            size="small"
            clearable
            placeholder="搜索概念…"
            :prefix-icon="Search"
          />
          <el-select v-model="mapFilter" size="small" class="filter-select">
            <el-option label="全部" value="all" />
            <el-option label="待学" value="todo" />
            <el-option label="学习中" value="learning" />
            <el-option label="已理解" value="mastered" />
          </el-select>
        </div>

        <!-- 树形行（扁平渲染：展开集 + 层级缩进） -->
        <div class="tree-scroll">
          <template v-for="row in mapRows" :key="row.key">
            <!-- 分支/模块行 -->
            <div
              v-if="!row.isLeaf"
              class="tree-branch"
              :class="{ expanded: expandedBranches.has(row.node.id) }"
              :style="{ paddingLeft: 6 + row.depth * 14 + 'px' }"
              @click="toggleBranch(row.node.id)"
            >
              <el-icon class="branch-caret" :class="{ open: expandedBranches.has(row.node.id) }">
                <CaretRight />
              </el-icon>
              <span class="branch-name">{{ row.node.name }}</span>
              <span v-if="row.stats" class="branch-stats" :class="row.stats.mastered === row.stats.total ? 'done' : ''">
                {{ row.stats.mastered }}/{{ row.stats.total }}
              </span>
            </div>
            <!-- 概念叶行 -->
            <div
              v-else
              class="tree-leaf"
              :class="{ active: currentConceptId === row.concept?.id }"
              :style="{ paddingLeft: 10 + row.depth * 14 + 'px' }"
              @click="selectTreeLeaf(row.concept)"
            >
              <i class="dot" :class="dotClass(row.concept.mastery)" />
              <span class="leaf-name">{{ row.concept.name }}</span>
              <el-icon v-if="row.concept.mastery === 'mastered'" class="leaf-check"><CircleCheckFilled /></el-icon>
            </div>
          </template>
          <div v-if="mapRows.length === 0" class="tree-empty">无匹配概念</div>
        </div>

        <div class="pane-title pane-title-sub">
          <span>研究进度</span>
        </div>
        <div class="research-status">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>后台研究中：{{ currentLearningName || '领域资料' }}的资料收集</span>
        </div>
      </aside>

      <!-- 中栏：当前讲义（知识点主序列：一概念一讲义） -->
      <section class="pane pane-lesson">
        <template v-if="currentConcept">
          <div class="lesson-head">
            <div class="lesson-top">
              <div class="lesson-title">
                <h3>{{ currentConcept.name }}</h3>
                <span class="lesson-en">{{ currentConcept.en }}</span>
                <el-tag v-if="masteryOf(currentConcept.id)" size="small" :type="masteryTag(masteryOf(currentConcept.id)!)" effect="plain">
                  {{ masteryLabel(masteryOf(currentConcept.id)!) }}
                </el-tag>
              </div>
              <!-- 看懂反馈（icon + tooltip，置标题栏右侧） -->
              <div class="lesson-actions">
                <el-tooltip content="懂了（已理解，解锁后续知识点）" placement="bottom" :show-after="300">
                  <el-button
                    circle
                    size="small"
                    type="success"
                    plain
                    :disabled="!prereqReady"
                    :icon="CircleCheckFilled"
                    @click="markMastered"
                  />
                </el-tooltip>
                <el-tooltip content="没懂，拆细一点（换讲法 / 拆成更小概念）" placement="bottom" :show-after="300">
                  <el-button
                    circle
                    size="small"
                    type="warning"
                    plain
                    :disabled="!prereqReady"
                    :icon="QuestionFilled"
                    @click="markConfused"
                  />
                </el-tooltip>
                <span v-if="lastFeedback" class="feedback-toast">{{ lastFeedback }}</span>
              </div>
            </div>
            <!-- 前置依赖就绪条（依赖拓扑门控：先学完前置再学本概念） -->
            <div v-if="prereqs.length" class="lesson-prereq">
              <span class="prereq-label">前置：</span>
              <template v-for="p in prereqs" :key="p.id">
                <span class="prereq-chip" :class="p.ready ? 'ready' : 'pending'">
                  {{ p.name }}
                  <el-icon v-if="p.ready"><CircleCheckFilled /></el-icon>
                  <el-icon v-else><Lock /></el-icon>
                </span>
              </template>
              <span v-if="!prereqReady" class="prereq-tip">先掌握带锁的前置概念再来学它</span>
            </div>
          </div>

          <div v-if="currentConcept?.card" class="lesson-body block-body-pad">
            <!-- 类型化模板讲义（content-template-design v4） -->
            <SectionLesson
              :card="currentConcept.card"
              :related="currentRelated"
              @not-understand="onSectionNotUnderstand"
              @goto-concept="gotoRelatedConcept"
            />
          </div>
          <div v-else-if="currentLesson" class="lesson-body">
            <!-- 旧式整篇讲义（对照/兼容） -->
            <MarkdownViewer :md="currentLesson.md" />
          </div>
          <div v-else class="lesson-body empty-body">
            <el-empty description="本概念的讲义生成中（演示：由系统研究后产出）" />
          </div>
        </template>
        <template v-else>
          <el-empty description="从左侧知识地图选择一个知识点开始学习" />
        </template>
      </section>

      <!-- 右栏：追问对话（头部样式与中栏一致） -->
      <aside class="pane pane-qa">
        <div class="qa-head">
          <div class="qa-title">
            <h3>追问 · 答疑</h3>
          </div>
          <div class="qa-head-right">
            <span class="qa-badge">未解问题 {{ openQuestionCount }}</span>
          </div>
        </div>
        <div ref="qaListRef" class="qa-list">
          <div v-for="(t, i) in turns" :key="i" class="qa-turn" :class="t.role">
            <div class="qa-bubble">
              <div class="qa-text">{{ t.text }}</div>
              <div v-if="t.sourceLabel" class="qa-source">
                <el-icon><Position /></el-icon>{{ t.sourceLabel }}
              </div>
              <div v-if="t.suggestsResearch" class="qa-research">
                <el-icon><Promotion /></el-icon>已登记为新研究方向
              </div>
            </div>
          </div>
        </div>
        <div class="qa-input">
          <el-input
            v-model="draft"
            type="textarea"
            :rows="4"
            resize="none"
            placeholder="追问：还有哪里不懂？例如“为什么……”（Enter 发送）"
            @keydown.enter.exact.prevent="ask"
          />
          <div class="qa-send-row">
            <span class="qa-hint">支持追问 · 换种讲法 · 拆细一点</span>
            <el-button type="primary" :icon="Promotion" class="qa-send" @click="ask">追问</el-button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 领域共学空间 —— 三栏学习空间（前端原型）
 * @module views/domain-learning/DomainLearningSpace
 * @description 按路由参数加载主题（mock-data 多主题）。三栏：左概念图 / 中讲义 / 右追问。
 *              「知识全景」按钮 → 新开 Tab 打开该主题的 Atlas 页（类型化知识图谱，见 DomainAtlas）。
 *              样例数据本地填充；后端业务（dl_* 服务/skill/AI）未接入。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Share,
  InfoFilled,
  CircleCheckFilled,
  CaretRight,
  Search,
  Loading,
  Lock,
  QuestionFilled,
  Position,
  Promotion,
} from '@element-plus/icons-vue'
import MarkdownViewer from './MarkdownViewer.vue'
import SectionLesson from './SectionLesson.vue'
import {
  fallbackTreeOf,
  findSpace,
  spaceStats,
  type CardSection,
  type ConceptNode,
  type KnowledgeTreeNode,
  type Mastery,
  type RelatedRef,
  type SpaceProject,
} from './mock-data'
import { useTabsStore } from '@/stores/tabs'

const route = useRoute()
const router = useRouter()
const tabsStore = useTabsStore()

const space = computed<SpaceProject | undefined>(() => findSpace(String(route.params.id ?? '')))

// ---------- 由主题数据派生的本地状态（原型：reactive 演示） ----------
const concepts = ref<ConceptNode[]>([])
const turns = ref<SpaceProject['turns']>([])
const currentConceptId = ref<string | null>(null)
const lastFeedback = ref('')
const draft = ref('')
const qaListRef = ref<HTMLElement | null>(null)

// ---------- 大纲树状态（左栏知识地图） ----------
/** 展开的分支/模块节点 id 集合 */
const expandedBranches = reactive(new Set<string>())
/** 概念名搜索关键词 */
const mapKeyword = ref('')
/** 掌握度过滤：all / todo / learning / mastered */
const mapFilter = ref<'all' | 'todo' | 'learning' | 'mastered'>('all')

/** 加载主题数据（路由切换时重建） */
function loadSpace(): void {
  if (!space.value) return
  concepts.value = space.value.concepts.map(c => ({ ...c }))
  turns.value = space.value.turns.map(t => ({ ...t }))
  currentConceptId.value = null
  lastFeedback.value = ''
  expandedBranches.clear()
  // 默认选中第一个有讲义的概念；无则选第一个待学/学习中（演示）
  const firstWithLesson = concepts.value.find(c => c.lessonId)
  const target =
    firstWithLesson ??
    concepts.value.find(c => c.mastery === 'learning') ??
    concepts.value.find(c => c.mastery === 'todo') ??
    concepts.value[0]
  if (target) {
    expandPathTo(target.id)
    selectConcept(target)
  }
}

watch(
  () => route.params.id,
  () => loadSpace()
  // 首次加载由 onMounted 触发（此时 treeRoots 等 computed 已初始化）
)

// ==================== 大纲树渲染逻辑 ====================

/** 树根（有显式 tree 用之；否则由 group 生成两级树） */
const treeRoots = computed<KnowledgeTreeNode[]>(() => {
  if (!space.value) return []
  return space.value.tree ?? fallbackTreeOf(space.value)
})

/** 掌握度过滤命中（叶级） */
function masteryOk(m: Mastery | undefined): boolean {
  if (mapFilter.value === 'all') return true
  return (m ?? 'todo') === mapFilter.value
}

/** 关键字命中（分支名或概念名/英文） */
function keywordHit(node: KnowledgeTreeNode, concept?: ConceptNode): boolean {
  const kw = mapKeyword.value.trim().toLowerCase()
  if (!kw) return true
  if (node.name.toLowerCase().includes(kw)) return true
  if (concept) {
    if (concept.name.toLowerCase().includes(kw)) return true
    if ((concept.en ?? '').toLowerCase().includes(kw)) return true
  }
  return false
}

/** 分支聚合统计：其下全部叶子 mastered/total（依实时 concepts） */
function branchStats(node: KnowledgeTreeNode): { mastered: number; total: number } {
  let mastered = 0
  let total = 0
  const walk = (list: KnowledgeTreeNode[]) => {
    for (const n of list) {
      if (n.conceptId) {
        const c = concepts.value.find(x => x.id === n.conceptId)
        if (c) {
          total++
          if (c.mastery === 'mastered') mastered++
        }
      } else if (n.children?.length) {
        walk(n.children)
      }
    }
  }
  walk(node.children ?? [])
  return { mastered, total }
}

/** 分支下是否存在"通过过滤的可见叶子" */
function hasVisibleLeaf(node: KnowledgeTreeNode): boolean {
  if (!node.children?.length) return false
  return node.children.some(n => {
    if (n.conceptId) {
      const c = concepts.value.find(x => x.id === n.conceptId)
      if (!c) return false
      return masteryOk(c.mastery) && keywordHit(n, c)
    }
    return hasVisibleLeaf(n)
  })
}

interface MapRow {
  key: string
  depth: number
  isLeaf: boolean
  node: KnowledgeTreeNode
  concept?: ConceptNode
  stats?: { mastered: number; total: number }
}

/** 扁平行集合：无搜索时按展开集裁剪；有搜索时强制展开命中路径 */
const mapRows = computed<MapRow[]>(() => {
  const rows: MapRow[] = []
  const searching = mapKeyword.value.trim().length > 0
  const walk = (list: KnowledgeTreeNode[], depth: number) => {
    for (const node of list) {
      if (node.conceptId) {
        const c = concepts.value.find(x => x.id === node.conceptId)
        if (!c) continue
        if (!masteryOk(c.mastery)) continue
        if (!keywordHit(node, c)) continue
        rows.push({ key: `n-${node.id}`, depth, isLeaf: true, node, concept: c })
        continue
      }
      // 分支：过滤后无可见叶子则整支隐藏（除非自身命中关键词）
      const selfHit = keywordHit(node)
      if (!selfHit && !hasVisibleLeaf(node)) continue
      rows.push({
        key: `b-${node.id}`,
        depth,
        isLeaf: false,
        node,
        stats: branchStats(node),
      })
      // 掌握度过滤 = 全局视图：命中分支强制展开（否则看不到满足过滤的叶子）
      const open = searching || mapFilter.value !== 'all' || expandedBranches.has(node.id)
      if (open && node.children?.length) walk(node.children, depth + 1)
    }
  }
  walk(treeRoots.value, 0)
  return rows
})

function toggleBranch(id: string): void {
  if (expandedBranches.has(id)) expandedBranches.delete(id)
  else expandedBranches.add(id)
}

/** 展开通向某概念的分支链（选中/继续学习时保证可见） */
function expandPathTo(conceptId: string): void {
  const find = (list: KnowledgeTreeNode[]): boolean => {
    for (const node of list) {
      if (node.conceptId === conceptId) return true
      if (node.children?.length && find(node.children)) {
        expandedBranches.add(node.id)
        return true
      }
    }
    return false
  }
  find(treeRoots.value)
}

/** 叶行选中（同步展开链 + 高亮 + 讲义） */
function selectTreeLeaf(c?: ConceptNode): void {
  if (!c) return
  expandPathTo(c.id)
  selectConcept(c)
}

const currentLesson = computed(() => {
  const c = concepts.value.find(x => x.id === currentConceptId.value)
  if (!c?.lessonId) return null
  return space.value?.lessons.find(l => l.id === c.lessonId) ?? null
})

/** 当前概念（知识点主序列：中栏 = 概念讲义） */
const currentConcept = computed<ConceptNode | null>(
  () => concepts.value.find(x => x.id === currentConceptId.value) ?? null
)

/** 前置依赖边类型（学习顺序门控：先学 source 再学 target）——仅显式声明的前置关系 */
const PREREQ_TYPES = ['前置依赖', '依赖']

/** 当前概念的前置依赖（含就绪状态） */
const prereqs = computed<Array<{ id: string; name: string; ready: boolean }>>(() => {
  const id = currentConceptId.value
  if (!id || !space.value) return []
  const deps: string[] = []
  for (const e of space.value.relations) {
    if (e.target === id && PREREQ_TYPES.includes(e.type)) deps.push(e.source)
  }
  return deps.map(did => {
    const c = concepts.value.find(x => x.id === did)
    return { id: did, name: c?.name ?? did, ready: !!c && c.mastery === 'mastered' }
  })
})

/** 前置是否全部就绪（未就绪禁止"懂了/继续"） */
const prereqReady = computed(() => prereqs.value.every(p => p.ready))

function masteryOf(id: string): Mastery | undefined {
  return concepts.value.find(x => x.id === id)?.mastery
}

function masteryLabel(m: Mastery): string {
  return m === 'mastered' ? '已理解' : m === 'learning' ? '学习中' : '待学'
}

function masteryTag(m: Mastery): 'success' | 'warning' | 'info' {
  return m === 'mastered' ? 'success' : m === 'learning' ? 'warning' : 'info'
}

const masteryPercent = computed(() => {
  if (concepts.value.length === 0) return 0
  const mastered = concepts.value.filter(c => c.mastery === 'mastered').length
  return Math.round((mastered / concepts.value.length) * 100)
})

const stats = computed(() => space.value ? spaceStats(space.value) : null)

const progressText = computed(() => {
  if (!stats.value) return ''
  const learningNames = concepts.value.filter(c => c.mastery === 'learning').map(c => c.name)
  return `已理解 ${stats.value.mastered} / ${concepts.value.length} 个概念${learningNames.length ? ` · 学习中：${learningNames.join('、')}` : ''}`
})

const currentLearningName = computed(() =>
  concepts.value.find(c => c.mastery === 'learning')?.name ?? ''
)

const openQuestionCount = computed(() => turns.value.filter(t => t.suggestsResearch).length)

/** 区级没懂：记录反馈，原型演示提示（正式版 → dl 拆解信号） */
function onSectionNotUnderstand(sec: CardSection): void {
  const c = concepts.value.find(x => x.id === currentConceptId.value)
  lastFeedback.value = c
    ? `已记下：你在「${c.name}」的「${sec.title ?? sec.key}」区没懂——之后会拆细这块单独讲`
    : '已记录'
}

/** 当前概念的直接关系邻居（related 区数据：图关系边派生，与门控/图谱一致） */
const currentRelated = computed<RelatedRef[]>(() => {
  const id = currentConceptId.value
  if (!id || !space.value) return []
  const out: RelatedRef[] = []
  const seen = new Set<string>()
  for (const e of space.value.relations) {
    if (e.source === id && !seen.has(e.target)) {
      const t = concepts.value.find(x => x.id === e.target)
      if (t) { out.push({ conceptId: t.id, name: t.name, rel: e.type }); seen.add(e.target) }
    } else if (e.target === id && !seen.has(e.source)) {
      const s = concepts.value.find(x => x.id === e.source)
      if (s) { out.push({ conceptId: s.id, name: s.name, rel: `←${e.type}` }); seen.add(e.source) }
    }
  }
  return out
})

/** 相关知识点点击 → 跳该概念讲义 */
function gotoRelatedConcept(conceptId: string): void {
  const c = concepts.value.find(x => x.id === conceptId)
  if (c) {
    expandPathTo(c.id)
    selectConcept(c)
  }
}

/** 打开知识全景（独立 Tab 页） */
function openAtlas(): void {
  tabsStore.preloadTab(`/domain-learning/${spaceId()}/atlas`, '知识全景')
  router.push(`/domain-learning/${spaceId()}/atlas`)
}

function spaceId(): string {
  return String(route.params.id ?? '')
}

function conceptById(id: string): ConceptNode | undefined {
  return concepts.value.find(c => c.id === id)
}

function dotClass(m: Mastery): string {
  return m === 'mastered' ? 'dot-mastered' : m === 'learning' ? 'dot-learning' : 'dot-todo'
}

function goBack(): void {
  router.push('/domain-learning')
}

// ---------- 交互：地图选课 ----------
function selectConcept(c: ConceptNode): void {
  currentConceptId.value = c.id
  lastFeedback.value = ''
}

// ---------- 交互：掌握度反馈 ----------
function markMastered(): void {
  const c = concepts.value.find(x => x.id === currentConceptId.value)
  if (!c) return
  c.mastery = 'mastered'
  lastFeedback.value = `「${c.name}」已标记为理解 ✓ 掌握度已更新`
}

function markConfused(): void {
  const c = concepts.value.find(x => x.id === currentConceptId.value)
  if (!c) return
  c.mastery = 'learning'
  lastFeedback.value = `收到，稍后会用更基础的讲法重讲「${c.name}」（若还不行会拆成更小概念）`
}

// ---------- 交互：追问（原型：追加演示回复；无 AI 后端） ----------
function ask(): void {
  const q = draft.value.trim()
  if (!q) return
  turns.value.push({ role: 'user', text: q })
  turns.value.push({
    role: 'assistant',
    text: '（界面原型）答疑后端尚未接入——正式版会先检索知识库/讲义回答，答不上则登记为未解问题并建议开新研究。',
    sourceLabel: '原型占位',
  })
  draft.value = ''
  scrollQaToBottom()
}

/** 找下一个可学知识点：前置已就绪（或无前置）且未掌握；按树顺序优先 */
function simulateNextLesson(): void {
  if (!space.value) return
  const masteredIds = new Set(concepts.value.filter(c => c.mastery === 'mastered').map(c => c.id))
  const prereqIdsOf = (cid: string): string[] =>
    space.value!.relations.filter(e => e.target === cid && PREREQ_TYPES.includes(e.type)).map(e => e.source)
  const ready = (c: ConceptNode): boolean =>
    c.mastery !== 'mastered' && prereqIdsOf(c.id).every(p => masteredIds.has(p))
  const next = concepts.value.find(ready) ?? concepts.value.find(c => c.mastery !== 'mastered')
  if (next) {
    expandPathTo(next.id)
    selectConcept(next)
  }
}

function scrollQaToBottom(): void {
  setTimeout(() => {
    if (qaListRef.value) qaListRef.value.scrollTop = qaListRef.value.scrollHeight
  }, 50)
}

onMounted(() => {
  loadSpace()
  scrollQaToBottom()
})
</script>

<style scoped lang="scss">
.domain-learning-space {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color);
}

.proto-banner {
  position: absolute;
  top: 8px;
  right: 16px;
  z-index: 10;
}

.space-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .space-title h2 {
    margin: 0;
    font-size: 17px;
    color: var(--el-text-color-primary);
  }
  .space-progress {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .progress-text {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }
}

.space-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pane-map {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-qa {
  width: 330px;
  flex-shrink: 0;
  border-left: 1px solid var(--el-border-color-lighter);
}

.pane-lesson {
  flex: 1;
  min-width: 0;
}

.pane-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding: 6px 4px;

  &.pane-title-sub {
    margin-top: 16px;
    border-top: 1px dashed var(--el-border-color-lighter);
    padding-top: 12px;
  }
}

.qa-badge {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 1px 8px;
  border-radius: 10px;
}

/* 右栏头部：样式与中栏 lesson-head 对齐（同样标题栏观感） */
.qa-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .qa-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;

    h3 {
      margin: 0;
      font-size: 16px;
      color: var(--el-text-color-primary);
    }
    .qa-sub {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
    }
  }
  .qa-head-right {
    flex-shrink: 0;
  }
}

.map-legend {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 4px 8px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.map-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;

  .el-input {
    flex: 1;
  }
  .filter-select {
    width: 92px;
    flex-shrink: 0;
  }
}

.tree-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.tree-branch {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 4px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  white-space: nowrap;

  &:hover {
    background: var(--el-fill-color-light);
  }

  .branch-caret {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    transition: transform 0.15s;
    flex-shrink: 0;

    &.open {
      transform: rotate(90deg);
    }
  }
  .branch-name {
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .branch-stats {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
    padding: 0 7px;
    line-height: 16px;
    flex-shrink: 0;

    &.done {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }
  }
}

.tree-leaf {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  white-space: nowrap;

  &:hover {
    background: var(--el-fill-color-light);
  }
  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  .leaf-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .leaf-check {
    color: var(--el-color-success);
    font-size: 13px;
    flex-shrink: 0;
  }
}

.tree-empty {
  padding: 16px 4px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;

  &.dot-mastered {
    background: var(--el-color-success);
  }
  &.dot-learning {
    background: var(--el-color-warning);
  }
  &.dot-todo {
    background: var(--el-border-color-darker);
  }
}

.research-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 4px;

  .el-icon {
    color: var(--el-color-primary);
  }
}

.lesson-head {
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .lesson-top {
    display: flex;
    align-items: center;
    gap: 12px;

    .lesson-title {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      flex: 1;
      min-width: 0;

      h3 {
        margin: 0;
        font-size: 16px;
        color: var(--el-text-color-primary);
      }
      .lesson-en {
        font-size: 12px;
        color: var(--el-text-color-placeholder);
      }
    }

    .lesson-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;

      .feedback-toast {
        margin-left: 6px;
        font-size: 12px;
        color: var(--el-color-success);
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  .lesson-prereq {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    font-size: 12px;

    .prereq-label {
      color: var(--el-text-color-secondary);
    }
    .prereq-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 8px;
      border-radius: 9px;

      &.ready {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }
      &.pending {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }
      .el-icon {
        font-size: 11px;
      }
    }
    .prereq-tip {
      color: var(--el-text-color-placeholder);
      font-size: 11.5px;
    }
  }
}

.lesson-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  min-height: 0;

  &.empty-body {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  // 块化知识点：卡片流间距由 SectionLesson 自管，压缩外层 padding 以留白更匀
  &.block-body-pad {
    padding: 14px 18px;
  }
}

.qa-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qa-turn {
  display: flex;
  &.user {
    justify-content: flex-end;
  }
}

.qa-bubble {
  max-width: 85%;
  padding: 8px 11px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  background: var(--el-fill-color-light);

  .qa-text {
    white-space: pre-wrap;
    color: var(--el-text-color-primary);
  }

  .qa-source {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--el-color-primary);
  }
  .qa-research {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 11px;
    color: var(--el-color-warning);
  }
}

.qa-turn.user .qa-bubble {
  background: var(--el-color-primary-light-8);
}

.qa-input {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 8px;

  // 输入框加高：底部固定 + 更大字号
  :deep(.el-textarea__inner) {
    min-height: 96px !important;
    font-size: 14px;
    line-height: 1.7;
    padding: 10px 12px;
  }

  .qa-send-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .qa-hint {
      font-size: 11px;
      color: var(--el-text-color-placeholder);
    }
    .qa-send {
      flex-shrink: 0;
    }
  }
}
</style>
