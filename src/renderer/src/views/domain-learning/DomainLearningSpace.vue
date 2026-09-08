<template>
  <div class="domain-learning-space">
    <!-- 顶部：空间元信息 -->
    <div class="space-header">
      <el-button text :icon="ArrowLeft" @click="goBack">主题列表</el-button>
      <div class="space-title">
        <h2>{{ spaceName }}</h2>
      </div>
      <div class="space-progress">
        <span class="progress-text">{{ progressText }}</span>
        <el-progress :percentage="masteryPercent" :stroke-width="8" :show-text="false" style="width: 160px" />
      </div>
      <el-button type="primary" plain :icon="Share" @click="openAtlas">知识全景</el-button>
      <el-button type="primary" :icon="Promotion" :loading="pickingNext" @click="continueLearning">
        继续学习 →
      </el-button>
    </div>

    <div class="space-body">
      <!-- 左栏：知识地图（大纲树，可折叠/搜索/掌握度过滤/父级聚合） -->
      <aside class="pane pane-map">
        <div class="pane-title">
          <span>知识地图</span>
          <el-tooltip content="分支行显示子节点掌握度聚合；点击分支展开/收起；绿色=已理解 · 橙色=学习中 · 灰色=待学/待复习" placement="top">
            <el-icon><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="map-legend">
          <span><i class="dot dot-mastered" />已理解</span>
          <span><i class="dot dot-learning" />学习中</span>
          <span><i class="dot dot-todo" />待学/复习</span>
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
            <el-option label="待学" value="untouched" />
            <el-option label="学习中" value="learning" />
            <el-option label="已理解" value="mastered" />
            <el-option label="待复习" value="review" />
          </el-select>
        </div>

        <!-- 树形行（扁平渲染：展开集 + 层级缩进） -->
        <div v-loading="store.loadingView" class="tree-scroll">
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
              <span v-if="row.stats" class="branch-stats" :class="row.stats.mastered === row.stats.total && row.stats.total > 0 ? 'done' : ''">
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
              <i class="dot" :class="masteryDotClass(leafMastery(row))" />
              <span class="leaf-name">{{ leafName(row) }}</span>
              <el-icon v-if="isMasteredRow(row)" class="leaf-check"><CircleCheckFilled /></el-icon>
            </div>
          </template>
          <div v-if="!store.loadingView && mapRows.length === 0" class="tree-empty">
            {{ view ? '无匹配概念' : '暂无知识地图（可先建空间并研究领域）' }}
          </div>
        </div>

        <!-- 当前概念研究状态 -->
        <template v-if="currentConcept">
          <div class="pane-title pane-title-sub">
            <span>讲义状态</span>
          </div>
          <div class="research-status">
            <el-icon v-if="researching || currentConcept.researchState === 'researching'" class="is-loading"><Loading /></el-icon>
            <el-icon v-else-if="currentConcept.hasCard"><CircleCheckFilled /></el-icon>
            <el-icon v-else><Document /></el-icon>
            <span>{{ conceptResearchText }}</span>
          </div>
        </template>
      </aside>

      <!-- 中栏：当前讲义（知识点主序列：一概念一讲义） -->
      <section class="pane pane-lesson">
        <template v-if="currentConcept">
          <div class="lesson-head">
            <div class="lesson-top">
              <div class="lesson-title">
                <h3>{{ currentConcept.name }}</h3>
                <span class="lesson-en">{{ currentConcept.en || '' }}</span>
                <el-tag size="small" :type="masteryTagType(currentConcept.mastery)" effect="plain">
                  {{ masteryLabel(currentConcept.mastery) }}
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
                    :disabled="!prereqReady || acking"
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
                    :disabled="!prereqReady || acking"
                    :icon="QuestionFilled"
                    @click="markConfused"
                  />
                </el-tooltip>
                <el-tooltip v-if="currentConcept.card" content="讲义生成演示（在线浏览）" placement="bottom" :show-after="300">
                  <el-button circle size="small" plain :icon="Promotion" @click="slidesVisible = true" />
                </el-tooltip>
                <span v-if="lastFeedback" class="feedback-toast" :class="{ warn: lastFeedbackIsWarn }">{{ lastFeedback }}</span>
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

          <!-- 已发布/草稿讲义（DlCardView） -->
          <div v-if="currentConcept.card" ref="lessonBodyRef" class="lesson-body block-body-pad" @mouseup="onLessonMouseUp">
            <SectionLesson
              :card="currentConcept.card"
              :related="currentRelated"
              @not-understand="onSectionNotUnderstand"
              @goto-concept="gotoRelatedConcept"
            />
          </div>
          <!-- 无讲义：提示 + 研究入口（dl:agent-send mode='research' 产出草稿卡片） -->
          <div v-else class="lesson-body empty-body">
            <el-empty description="本概念讲义生成中">
              <el-button
                type="primary"
                :icon="Promotion"
                :loading="researching"
                @click="researchConcept"
              >
                研究此概念
              </el-button>
              <p class="empty-hint">系统将检索资料并产出讲义草稿（可在本页查看更新）</p>
            </el-empty>
          </div>
        </template>
        <template v-else>
          <el-empty v-if="view" description="从左侧知识地图选择一个知识点开始学习" />
          <el-empty v-else description="正在加载学习空间…" />
        </template>
      </section>

      <!-- 右栏：追问对话（tutor Agent：历史 = view.turns，新问答实时流式） -->
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
          <div v-for="(t, i) in displayTurns" :key="i" class="qa-turn" :class="t.role">
            <div class="qa-bubble">
              <div class="qa-text">{{ t.text || '…' }}</div>
              <div v-if="i === displayTurns.length - 1 && t.role === 'assistant' && tutorStreaming" class="qa-streaming">
                <el-icon class="is-loading"><Loading /></el-icon>正在组织回答…
              </div>
              <div v-if="t.sourceLabel && !tutorStreaming" class="qa-source">
                <el-icon><Position /></el-icon>{{ t.sourceLabel }}
              </div>
              <div v-if="t.suggestsResearch" class="qa-research">
                <el-icon><Promotion /></el-icon>已登记为新研究方向
              </div>
              <!-- 好回答可收藏为笔记（qna → dl_note；再次点击取消收藏） -->
              <div
                v-if="t.role === 'assistant' && t.questionId && !tutorStreaming && t.text"
                class="qa-fav"
              >
                <el-button
                  link
                  size="small"
                  :type="favOfTurn(t.questionId) ? '' : 'success'"
                  :icon="favOfTurn(t.questionId) ? StarFilled : Star"
                  @click="toggleFavTurn(t)"
                >{{ favOfTurn(t.questionId) ? '已收藏' : '收藏为笔记' }}</el-button>
              </div>
            </div>
          </div>
          <div v-if="displayTurns.length === 0" class="qa-empty">
            还没有追问记录——读完讲义仍不懂时，在这里问，答不上会登记为未解问题并建议研究。
          </div>
        </div>
        <div class="qa-input">
          <el-input
            v-model="draft"
            type="textarea"
            :rows="4"
            resize="none"
            placeholder="追问：还有哪里不懂？例如“为什么……”（Enter 发送）"
            :disabled="tutorStreaming"
            @keydown.enter.exact.prevent="ask"
          />
          <div class="qa-send-row">
            <span class="qa-hint">{{ tutorStreaming ? 'AI 正在回答…' : '支持追问 · 换种讲法 · 拆细一点' }}</span>
            <el-button type="primary" :icon="Promotion" class="qa-send" :loading="tutorStreaming" @click="ask">
              {{ tutorStreaming ? '回答中' : '追问' }}
            </el-button>
          </div>
        </div>
      </aside>

      <!-- 讲义选区浮层：提问 / 做笔记（M4-UX1） -->
      <div
        v-if="sel.show"
        class="sel-bar"
        :style="{ left: sel.x + 'px', top: sel.y + 'px' }"
      >
        <el-button size="small" type="primary" :icon="QuestionFilled" @click="askSelection">提问</el-button>
        <el-button size="small" :icon="Notebook" @click="openNoteSelection">做笔记</el-button>
      </div>

      <!-- 选区笔记编辑 -->
      <el-dialog v-model="noteDlg.visible" title="记笔记" width="460px" append-to-body>
        <div v-if="noteDlg.anchor" class="note-anchor">「{{ noteDlg.anchor }}」</div>
        <el-input v-model="noteText" type="textarea" :rows="5" placeholder="写下你的想法、疑问或总结……" />
        <template #footer>
          <el-button @click="noteDlg.visible = false">取消</el-button>
          <el-button type="primary" :loading="noteSaving" @click="saveSelectionNote">保存笔记</el-button>
        </template>
      </el-dialog>

      <!-- 讲义演示（M4-UX3：HTML 幻灯片在线浏览） -->
      <el-dialog v-model="slidesVisible" title="讲义演示" width="70%" top="3vh" destroy-on-close append-to-body>
        <div class="slides-holder">
          <LessonSlides
            v-if="currentConcept?.card"
            :title="currentConcept.name"
            :sub-title="`${currentConcept.nodeType} · ${currentConcept.mastery}${currentConcept.en ? ' · ' + currentConcept.en : ''}`"
            :sections="currentConcept.card.sections"
            :works="currentConcept.card.works ?? null"
          />
        </div>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 领域共学空间 —— 三栏学习空间页
 * @module views/domain-learning/DomainLearningSpace
 * @description 数据源 = dl:get-space-view（store.fetchSpaceView → DlSpaceView），
 *              后端聚合概念/关系/大纲树/追问历史/统计一次拉取。三栏：
 *              左概念地图（树 + 掌握度过滤）、中讲义（DlCardView，无卡可触发
 *              research Agent 研究）、右追问（tutor Agent：历史 view.turns +
 *              新问答实时流式拼 dl:generate，事件走 dl:agent 通道）。
 *              掌握度推进（懂了/没懂）、继续学习（dl:pick-next）均调后端。
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
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
  Document,
  Notebook,
  Star,
  StarFilled,
} from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'
import {
  useDomainLearningStore,
  type DlAgentUiEvent,
  type DlGenerateUiEvent,
} from '@/stores/domain-learning'
import {
  masteryDotClass,
  masteryLabel,
  masteryTagType,
  relLabel,
} from './domain-learning-ui'
import SectionLesson from './SectionLesson.vue'
import LessonSlides from './LessonSlides.vue'
import type {
  DlCardSection,
  DlChatTurn,
  DlConceptView,
  DlMastery,
  DlRelationView,
  DlSpaceView,
  DlTreeNode,
} from '@shared/types/domain-learning.types'

const route = useRoute()
const router = useRouter()
const tabsStore = useTabsStore()
const store = useDomainLearningStore()

const spaceId = computed(() => String(route.params.id ?? ''))

/** 当前空间聚合视图（store 缓存；路由变化时重拉） */
const view = computed<DlSpaceView | null>(() => store.currentSpaceView)
const concepts = computed<DlConceptView[]>(() => view.value?.concepts ?? [])
const relations = computed<DlRelationView[]>(() => view.value?.relations ?? [])
const treeRoots = computed<DlTreeNode[]>(() => view.value?.tree ?? [])

const spaceName = computed(() => view.value?.name ?? '学习空间')

// ---------- 选中与本地展示状态 ----------
const currentConceptId = ref<string | null>(null)
const lastFeedback = ref('')
const lastFeedbackIsWarn = ref(false)
const acking = ref(false)
const pickingNext = ref(false)

// ---------- 大纲树状态（左栏知识地图） ----------
/** 展开的分支/模块节点 id 集合 */
const expandedBranches = reactive(new Set<string>())
/** 概念名搜索关键词 */
const mapKeyword = ref('')
/** 掌握度过滤：all / untouched(待学) / learning / mastered / review */
const mapFilter = ref<'all' | 'untouched' | 'learning' | 'mastered' | 'review'>('all')

/** 加载当前空间（路由参数变化或页面进入时） */
async function loadSpace(): Promise<void> {
  const id = spaceId.value
  if (!id) return
  currentConceptId.value = null
  lastFeedback.value = ''
  lastFeedbackIsWarn.value = false
  liveTurns.value = []
  expandedBranches.clear()
  await store.fetchSpaceView(id)
  // 默认选中：Atlas「去学它」带 query.concept → 否则第一个未掌握的概念（学习中优先）
  const qConcept = typeof route.query.concept === 'string' ? route.query.concept : null
  const target =
    concepts.value.find(c => c.id === qConcept && c.nodeType !== 'group') ??
    firstUnmasteredLeaf() ??
    firstLeaf()
  if (target) {
    expandPathTo(target.id)
    selectConcept(target)
  }
}

watch(
  () => route.params.id,
  () => void loadSpace()
)

onMounted(() => {
  void loadSpace()
})

onUnmounted(() => {
  // 页面卸载：清理全部事件订阅；若仍在追问轮次则通知后端取消
  store.unsubscribeAll()
  if (tutorStreaming.value) {
    void store.cancelAgent('tutor', spaceId.value, currentConceptId.value)
  }
})

// ==================== 大纲树渲染逻辑 ====================

/** 树内叶子概念的有序扁平（用于默认选中/推荐） */
function leafConcepts(nodes: DlTreeNode[]): DlTreeNode[] {
  const out: DlTreeNode[] = []
  const walk = (list: DlTreeNode[]) => {
    for (const n of list) {
      if (n.conceptId) out.push(n)
      else if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** 第一个未掌握的概念叶（学习中优先，再待学/复习） */
function firstUnmasteredLeaf(): DlConceptView | null {
  const leaves = leafConcepts(treeRoots.value)
    .map(n => concepts.value.find(c => c.id === n.conceptId))
    .filter((c): c is DlConceptView => !!c)
  return (
    leaves.find(c => c.mastery === 'learning') ??
    leaves.find(c => c.mastery === 'untouched') ??
    leaves.find(c => c.mastery === 'review') ??
    null
  )
}

/** 第一个概念叶（树序兜底） */
function firstLeaf(): DlConceptView | null {
  const leaf = leafConcepts(treeRoots.value)[0]
  return leaf ? concepts.value.find(c => c.id === leaf.conceptId) ?? null : null
}

/** 掌握度过滤命中（叶级；filter=all 全放行） */
function masteryOk(m: DlConceptView['mastery']): boolean {
  if (mapFilter.value === 'all') return true
  return m === mapFilter.value
}

/** 关键字命中（分支名或概念名/英文） */
function keywordHit(node: DlTreeNode, concept?: DlConceptView): boolean {
  const kw = mapKeyword.value.trim().toLowerCase()
  if (!kw) return true
  if (node.name.toLowerCase().includes(kw)) return true
  if (concept) {
    if (concept.name.toLowerCase().includes(kw)) return true
    if ((concept.en ?? '').toLowerCase().includes(kw)) return true
  }
  return false
}

/** 分支聚合统计：其下全部叶子 mastered/total */
function branchStats(node: DlTreeNode): { mastered: number; total: number } {
  let mastered = 0
  let total = 0
  const walk = (list: DlTreeNode[]) => {
    for (const n of list) {
      if (n.conceptId) {
        const c = concepts.value.find(x => x.id === n.conceptId)
        if (c && c.nodeType !== 'group') {
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
function hasVisibleLeaf(node: DlTreeNode): boolean {
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
  node: DlTreeNode
  concept?: DlConceptView
  stats?: { mastered: number; total: number }
}

/** 扁平行集合：无搜索时按展开集裁剪；有搜索时强制展开命中路径 */
const mapRows = computed<MapRow[]>(() => {
  const rows: MapRow[] = []
  const searching = mapKeyword.value.trim().length > 0
  const walk = (list: DlTreeNode[], depth: number) => {
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

// ---------- 叶行展示辅助（模板防未定义解引用） ----------
function leafMastery(row: MapRow): DlMastery {
  return row.concept?.mastery ?? 'untouched'
}
function leafName(row: MapRow): string {
  return row.concept?.name ?? row.node.name
}
function isMasteredRow(row: MapRow): boolean {
  return row.concept?.mastery === 'mastered'
}

/** 展开通向某概念的分支链（选中/继续学习时保证可见） */
function expandPathTo(conceptId: string): void {
  const find = (list: DlTreeNode[]): boolean => {
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
function selectTreeLeaf(c?: DlConceptView): void {
  if (!c) return
  expandPathTo(c.id)
  selectConcept(c)
}

/** 当前概念（中栏讲义依据） */
const currentConcept = computed<DlConceptView | null>(
  () => concepts.value.find(x => x.id === currentConceptId.value) ?? null
)

/** 前置依赖边类型（后端关系枚举：prerequisite） */
const PREREQ_TYPE = 'prerequisite'

/** 当前概念的前置依赖（含就绪状态） */
const prereqs = computed<Array<{ id: string; name: string; ready: boolean }>>(() => {
  const id = currentConceptId.value
  if (!id) return []
  const deps: string[] = []
  for (const e of relations.value) {
    if (e.target === id && e.type === PREREQ_TYPE && !deps.includes(e.source)) deps.push(e.source)
  }
  return deps.map(did => {
    const c = concepts.value.find(x => x.id === did)
    return { id: did, name: c?.name ?? did, ready: !!c && c.mastery === 'mastered' }
  })
})

/** 前置是否全部就绪（未就绪禁止"懂了/没懂"） */
const prereqReady = computed(() => prereqs.value.every(p => p.ready))

// ---------- 空间整体进度（后端 stats 为准） ----------
const masteryPercent = computed(() => {
  const s = view.value?.stats
  if (!s || s.total === 0) return 0
  return Math.round((s.mastered / s.total) * 100)
})

const progressText = computed(() => {
  const s = view.value?.stats
  if (!s) return ''
  const learningNames = concepts.value
    .filter(c => c.mastery === 'learning' && c.nodeType !== 'group')
    .map(c => c.name)
  return `已理解 ${s.mastered} / ${s.total} 个知识点${learningNames.length ? ` · 学习中：${learningNames.join('、')}` : ''}`
})

/** 当前概念讲义/研究状态文案（左栏底部） */
const researching = ref(false)
const conceptResearchText = computed(() => {
  const c = currentConcept.value
  if (!c) return ''
  if (researching.value) return `正在研究「${c.name}」…`
  if (c.researchState === 'researching') return '后台研究中…'
  if (c.hasCard) return '讲义已就绪'
  return `「${c.name}」讲义待研究`
})

/** 未解问题数量（后端队列统计） */
const openQuestionCount = computed(() => view.value?.openQuestionCount ?? 0)

/** 当前概念的直接关系邻居（related 区：图关系边派生） */
const currentRelated = computed<Array<{ conceptId: string; name: string; rel?: string }>>(() => {
  const id = currentConceptId.value
  if (!id) return []
  const out: Array<{ conceptId: string; name: string; rel?: string }> = []
  const seen = new Set<string>()
  for (const e of relations.value) {
    if (e.source === id && !seen.has(e.target)) {
      const t = concepts.value.find(x => x.id === e.target)
      if (t) { out.push({ conceptId: t.id, name: t.name, rel: relLabel(e.type) }); seen.add(e.target) }
    } else if (e.target === id && !seen.has(e.source)) {
      const s = concepts.value.find(x => x.id === e.source)
      if (s) { out.push({ conceptId: s.id, name: s.name, rel: `←${relLabel(e.type)}` }); seen.add(e.source) }
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

// ---------- 视图跳转 ----------
function openAtlas(): void {
  tabsStore.preloadTab(`/domain-learning/${spaceId.value}/atlas`, '知识全景')
  router.push(`/domain-learning/${spaceId.value}/atlas`)
}

function goBack(): void {
  router.push('/domain-learning')
}

function conceptById(id: string): DlConceptView | undefined {
  return concepts.value.find(c => c.id === id)
}

// ---------- 交互：地图选课 ----------
function selectConcept(c: DlConceptView): void {
  currentConceptId.value = c.id
  lastFeedback.value = ''
  lastFeedbackIsWarn.value = false
  void store.fetchNotesOf(spaceId.value, c.id)
}

// ---------- 交互：掌握度反馈（后端推进 + 重拉视图） ----------
async function refreshView(): Promise<void> {
  await store.fetchSpaceView(spaceId.value)
  // 笔记/收藏态随视图刷新（追问落库后 qna 笔记可见）
  if (currentConceptId.value) await store.fetchNotesOf(spaceId.value, currentConceptId.value)
}

async function markMastered(): Promise<void> {
  const c = currentConcept.value
  if (!c || acking.value) return
  acking.value = true
  try {
    const ok = await store.ackMastered(spaceId.value, c.id)
    if (ok) {
      lastFeedbackIsWarn.value = false
      lastFeedback.value = `「${c.name}」已标记为理解 ✓`
      await refreshView()
    } else {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = store.error ?? '标记失败，请重试'
    }
  } finally {
    acking.value = false
  }
}

/** 没懂（无定位区；sectionKey 由 onSectionNotUnderstand 携带） */
async function markConfused(): Promise<void> {
  await doAckConfused(undefined)
}

/** 区级「这块没懂」：带 sectionKey 上报后端定位 */
async function onSectionNotUnderstand(sec: DlCardSection): Promise<void> {
  await doAckConfused(sec.key)
}

async function doAckConfused(sectionKey?: string): Promise<void> {
  const c = currentConcept.value
  if (!c || acking.value) return
  acking.value = true
  try {
    const result = await store.ackConfused(spaceId.value, c.id, sectionKey)
    if (result) {
      lastFeedbackIsWarn.value = false
      if (result.splitSuggested) {
        lastFeedback.value = `「${c.name}」多次没懂——已将其拆成更小概念（拆分建议已入队），稍后会重新讲`
      } else {
        const where = sectionKey ? `的「${sectionKey}」区` : ''
        lastFeedback.value = `收到，稍后会用更基础的讲法重讲「${c.name}」${where}`
      }
      // 没懂计数已累计；视图整体不变化，无需重拉（openQuestionCount 只统计追问队列）
    } else {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = store.error ?? '标记失败，请重试'
    }
  } finally {
    acking.value = false
  }
}

// ---------- 交互：继续学习（dl:pick-next 推荐） ----------
async function continueLearning(): Promise<void> {
  if (pickingNext.value) return
  pickingNext.value = true
  lastFeedback.value = ''
  try {
    const nextId = await store.pickNext(spaceId.value)
    if (nextId) {
      expandPathTo(nextId)
      selectConcept(conceptById(nextId)!)
      lastFeedbackIsWarn.value = false
      lastFeedback.value = '已为你推荐下一个知识点'
    } else {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = '当前没有可继续的知识点（先研究领域填充地图）'
    }
  } finally {
    pickingNext.value = false
  }
}

// ---------- 交互：研究无讲义概念（dl:agent-send mode='research'） ----------
async function researchConcept(): Promise<void> {
  const c = currentConcept.value
  if (!c || researching.value) return
  researching.value = true
  // 订阅动作事件：error 直接提示；完成/阶段用于状态行（重拉在 finally）
  const unsub = store.subscribeAgentEvent(spaceId.value, c.id, ev => {
    if (ev.type === 'error') {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = `研究「${c.name}」出错：${ev.error ?? '未知错误'}`
    }
  })
  try {
    await store.sendAgent({
      mode: 'research',
      spaceId: spaceId.value,
      conceptId: c.id,
      message: `请系统研究「${c.name}」这一知识点，并产出可展示的讲义草稿（含区级内容）。`,
    })
    // 研究完成后重拉视图：卡片草稿/新关系/掌握度一并刷新
    await refreshView()
  } finally {
    unsub()
    researching.value = false
  }
}

// ---------- 交互：追问（tutor Agent 实时流式） ----------
const draft = ref('')
const qaListRef = ref<HTMLElement | null>(null)
const tutorStreaming = ref(false)

/** 本轮追问临时消息（后端持久化前先展示；view 刷新后清空） */
const liveTurns = ref<DlChatTurn[]>([])
/** 展示顺序：历史(view.turns)在前，本轮进行中的追问在后 */
const displayTurns = computed<DlChatTurn[]>(() => [
  ...(view.value?.turns ?? []),
  ...liveTurns.value,
])

async function ask(): Promise<void> {
  const q = draft.value.trim()
  if (!q || tutorStreaming.value) return
  const scopeConceptId = currentConceptId.value
  tutorStreaming.value = true
  lastFeedback.value = ''

  // 本地先落 user + assistant 占位（assistant 文本随流式增量拼接）
  const userTurn: DlChatTurn = { role: 'user', text: q }
  const assistantTurn: DlChatTurn = { role: 'assistant', text: '' }
  liveTurns.value.push(userTurn, assistantTurn)
  scrollQaToBottom()

  // 订阅 agent 事件（动作级）与流式正文（reply:start 后按 summaryEventId 订阅）
  let unsubAgent = () => {}
  let unsubStream = () => {}
  unsubAgent = store.subscribeAgentEvent(spaceId.value, scopeConceptId, (ev: DlAgentUiEvent) => {
    handleAgentEvent(ev, userTurn, assistantTurn, (eventId) => {
      unsubStream()
      unsubStream = store.subscribeStream(eventId, (se: DlGenerateUiEvent) => {
        if (se.type === 'content' && se.content) {
          assistantTurn.text += se.content
          scrollQaToBottom()
        }
      })
    })
  })

  try {
    const result = await store.sendAgent({
      mode: 'tutor',
      spaceId: spaceId.value,
      conceptId: scopeConceptId,
      message: q,
    })
    if (!result && !assistantTurn.text) {
      assistantTurn.text = store.error ? `（未收到回答：${store.error}）` : '（未收到回答，请稍后重试）'
    }
  } catch (e: any) {
    assistantTurn.text = `（追问失败：${e?.message ?? '未知错误'}）`
  } finally {
    unsubAgent()
    unsubStream()
    tutorStreaming.value = false
    // 追问落库后重拉视图（turns/questionId/openQuestionCount 刷新），随后清空临时消息
    await refreshView()
    liveTurns.value = []
    draft.value = ''
    scrollQaToBottom()
  }
}

/** 处理 dl:agent 通道事件（stage/reply:start/reply:done/error/question:open） */
function handleAgentEvent(
  ev: DlAgentUiEvent,
  userTurn: DlChatTurn,
  assistantTurn: DlChatTurn,
  onReplyStart: (eventId: string) => void,
): void {
  switch (ev.type) {
    case 'question:open':
      // 后端已把问题写入队列：记录 questionId，供刷新去重/关联
      if (ev.questionId) userTurn.questionId = ev.questionId
      break
    case 'reply:start':
      if (ev.summaryEventId) onReplyStart(ev.summaryEventId)
      break
    case 'reply:done':
      // 回答结束：内容已由流式拼完（可能为空 = 答不上，保持 open 队列）
      break
    case 'error':
      if (!assistantTurn.text) assistantTurn.text = `（回答中断：${ev.error ?? '未知错误'}）`
      break
    default:
      break
  }
}

function scrollQaToBottom(): void {
  setTimeout(() => {
    if (qaListRef.value) qaListRef.value.scrollTop = qaListRef.value.scrollHeight
  }, 50)
}

// ==================== M4-UX1：讲义选区交互 / 答疑收藏 ====================

const lessonBodyRef = ref<HTMLElement | null>(null)
const sel = reactive({ show: false, x: 0, y: 0, text: '' })
const noteDlg = reactive({ visible: false, anchor: '' })
const noteText = ref('')
const noteSaving = ref(false)
const slidesVisible = ref(false)

function hideSel(): void {
  sel.show = false
  sel.text = ''
}

/** 讲义区 mouseup：选区非空且落在讲义内 → 浮出 提问/做笔记 工具条 */
function onLessonMouseUp(): void {
  const s = window.getSelection()
  const el = lessonBodyRef.value
  if (!s || s.isCollapsed || s.rangeCount === 0 || !el) {
    hideSel()
    return
  }
  const text = s.toString().trim()
  if (text.length < 2 || text.length > 400) {
    hideSel()
    return
  }
  const an = s.anchorNode
  const fn = s.focusNode
  if (an && fn && !(el.contains(an) && el.contains(fn))) {
    hideSel()
    return
  }
  const rect = s.getRangeAt(0).getBoundingClientRect()
  sel.text = text
  sel.x = Math.min(rect.left, window.innerWidth - 280)
  sel.y = Math.min(rect.bottom + 6, window.innerHeight - 46)
  sel.show = true
}

function focusQaInput(): void {
  void nextTick(() => {
    const inner = document.querySelector('.pane-qa .el-textarea__inner') as HTMLTextAreaElement | null
    inner?.focus()
    ;(document.querySelector('.pane-qa') as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

/** #1 提问：把选中文字填入右侧答疑输入框（不自动发送，由用户编辑后发送） */
function askSelection(): void {
  if (!sel.text) return
  draft.value = sel.text
  hideSel()
  focusQaInput()
}

/** #3 做笔记：打开笔记编辑，预置选区原文 */
function openNoteSelection(): void {
  if (!sel.text) return
  noteDlg.anchor = sel.text
  noteText.value = ''
  noteDlg.visible = true
  hideSel()
}

async function saveSelectionNote(): Promise<void> {
  const c = currentConcept.value
  if (noteSaving.value || !noteDlg.anchor) return
  noteSaving.value = true
  try {
    await store.saveNote({
      id: spaceId.value,
      conceptId: c?.id ?? null,
      source: 'selection',
      anchorText: noteDlg.anchor,
      contentMd: noteText.value.trim() || '',
    })
    noteDlg.visible = false
    await store.fetchNotesOf(spaceId.value, c?.id ?? null)
  } finally {
    noteSaving.value = false
  }
}

/** #6 收藏态：当前概念下是否已收藏该问答 */
function favOfTurn(qid: string | null | undefined): boolean {
  if (!qid) return false
  const cid = currentConcept.value?.id
  return store.notes.some((n) => n.source === 'qna' && n.questionId === qid && n.conceptId === (cid ?? null))
}

function questionTextOf(qid: string): string {
  const t = view.value?.turns.find((x) => x.role === 'user' && x.questionId === qid)
  return t?.text ?? ''
}

/** #6 收藏 / 取消收藏回答（qna 笔记；再次点击取消） */
async function toggleFavTurn(t: DlChatTurn): Promise<void> {
  const c = currentConcept.value
  if (!t.questionId) return
  const existing = store.notes.find((n) => n.source === 'qna' && n.questionId === t.questionId && n.conceptId === (c?.id ?? null))
  if (existing) {
    await store.removeNoteOf(spaceId.value, existing.id)
  } else {
    await store.saveNote({
      id: spaceId.value,
      conceptId: c?.id ?? null,
      source: 'qna',
      questionId: t.questionId,
      contentMd: `> 问答收藏（答疑于「${c?.name ?? '空间'}」）\n\n**问题**：${questionTextOf(t.questionId)}\n\n**回答**：\n${t.text}`,
    })
  }
  await store.fetchNotesOf(spaceId.value, c?.id ?? null)
}
</script>

<style scoped lang="scss">
.domain-learning-space {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color);
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
  width: 400px;
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
    flex-shrink: 0;
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

        &.warn {
          color: var(--el-color-warning);
        }
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

  .empty-hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
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
  max-width: 88%;
  padding: 8px 11px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  background: var(--el-fill-color-light);

  .qa-text {
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    color: var(--el-text-color-primary);
  }

  .qa-streaming {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--el-color-primary);
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

.qa-empty {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  line-height: 1.8;
  padding: 18px 6px;
  text-align: center;
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

// M4-UX1：回答收藏入口
.qa-fav {
  display: flex;
  justify-content: flex-end;
  margin-top: 3px;
  border-top: 1px dashed var(--el-border-color-lighter);
  padding-top: 2px;
}

// M4-UX1：讲义选区浮层（fixed 定位在选区下方）
.sel-bar {
  position: fixed;
  z-index: 3000;
  display: flex;
  gap: 6px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 4px 6px;
  box-shadow: var(--el-box-shadow-light);
}

.note-anchor {
  max-height: 120px;
  overflow: auto;
  padding: 8px 10px;
  margin-bottom: 10px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
  border-radius: 0 6px 6px 0;
}

.slides-holder {
  height: 74vh;
  min-height: 420px;
}
</style>
