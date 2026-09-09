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
      <el-button plain :icon="Setting" @click="settingsVisible = true">空间设置</el-button>
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
            </el-empty>
          </div>
        </template>
        <template v-else>
          <!-- 空主题起步态：无任何知识点 → 空间级起步研究（生成首批概念/关系 + 首个讲义） -->
          <div v-if="view && isEmptySpace" class="lesson-body boot-body">
            <div class="boot-card">
              <div class="boot-icon"><el-icon><Promotion /></el-icon></div>
              <h3>开始学习「{{ spaceName }}」</h3>
              <p>这个主题还是空的。研究助手会先为整个领域建立首批核心知识点与学习顺序，并为最基础的概念生成第一份讲义。</p>
              <p class="boot-tip">
                资料源说明：研究优先检索已绑定的知识库，再考虑联网资料与模型先验；建议先在「知识全景 → 空间设置 → 关联知识库」绑定你的资料库。
              </p>
              <el-button type="primary" size="large" :icon="Promotion" :loading="researching" @click="bootResearch">
                {{ researching ? '正在研究领域…' : '生成首批知识' }}
              </el-button>
              <div v-if="bootMessage" class="boot-message" :class="{ warn: bootWarn }">{{ bootMessage }}</div>
            </div>
          </div>
          <el-empty v-else-if="view" description="从左侧知识地图选择一个知识点开始学习" />
          <el-empty v-else description="正在加载学习空间…" />
        </template>
      </section>

      <!-- 右栏：追问答疑（tutor）/ 概念笔记（dl_note 浏览，M4-UX1 补全） -->
      <aside class="pane pane-qa">
        <div class="qa-head">
          <div class="head-tabs" role="tablist">
            <button
              class="head-tab"
              :class="{ active: rightPane === 'qa' }"
              @click="rightPane = 'qa'"
            >追问 · 答疑</button>
            <button
              class="head-tab"
              :class="{ active: rightPane === 'notes' }"
              @click="rightPane = 'notes'"
            >
              笔记<span v-if="noteCountOfCurrent > 0" class="head-tab-count">{{ noteCountOfCurrent }}</span>
            </button>
          </div>
          <div class="qa-head-right">
            <span v-if="rightPane === 'qa'" class="qa-badge">未解问题 {{ openQuestionCount }}</span>
            <span v-else class="qa-badge">当前概念 {{ noteCountOfCurrent }} 条</span>
          </div>
        </div>

        <!-- 答疑面板：历史 + 实时流式问答 -->
        <template v-if="rightPane === 'qa'">
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
              还没有追问记录——读完讲义后在这里提问。
            </div>
          </div>
          <!-- task 会话执行进度（动作流水；M6-3 阶段二） -->
          <div v-if="taskLog.length" class="task-log">
            <span class="task-log-title">任务执行</span>
            <span
              v-for="(a, i) in taskLog"
              :key="i"
              class="task-action"
              :class="a.status"
              :title="a.message"
            >{{ a.status === 'ok' ? '✓' : a.status === 'error' ? '✕' : '·' }} {{ taskActionText(a.tool) }}</span>
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
        </template>

        <!-- 笔记面板：当前概念 / 空间全部（引文 + 正文；M7-B 空间级总览） -->
        <div v-else class="note-pane">
          <div class="note-scope-bar">
            <button class="scope-tab" :class="{ active: noteScope === 'concept' }" @click="noteScope = 'concept'">
              当前概念<span v-if="noteCountOfCurrent > 0" class="head-tab-count">{{ noteCountOfCurrent }}</span>
            </button>
            <button class="scope-tab" :class="{ active: noteScope === 'all' }" @click="noteScope = 'all'">
              全部笔记<span v-if="notesAllTotal > 0" class="head-tab-count">{{ notesAllTotal }}</span>
            </button>
          </div>

          <!-- 当前概念笔记 -->
          <template v-if="noteScope === 'concept'">
            <div class="note-list">
              <template v-if="currentConcept">
                <template v-if="sortedNotes.length > 0">
                  <div v-for="n in sortedNotes" :key="n.id" class="note-item">
                    <div class="note-item-head">
                      <el-tag size="small" effect="plain" :type="n.source === 'selection' ? 'primary' : 'success'">
                        {{ n.source === 'selection' ? '选区笔记' : '问答收藏' }}
                      </el-tag>
                      <span class="note-time">{{ fmtNoteTime(n.createdAt) }}</span>
                      <el-button
                        class="note-del"
                        link
                        type="danger"
                        size="small"
                        :loading="deletingNoteId === n.id"
                        @click="removeNoteItem(n)"
                      >删除</el-button>
                    </div>
                    <div v-if="n.anchorText" class="note-anchor-text">「{{ n.anchorText }}」</div>
                    <div v-if="n.contentMd" class="note-text">{{ n.contentMd }}</div>
                  </div>
                </template>
                <div v-else class="qa-empty">
                  当前知识点还没有笔记——在讲义上选中一段文字「做笔记」，或收藏答疑中的好回答。
                </div>
              </template>
              <div v-else class="qa-empty">先从左侧选择一个知识点，或切到「全部笔记」查看本空间笔记。</div>
            </div>
          </template>

          <!-- 空间全部笔记（跨概念总览：点击条目跳到所属概念） -->
          <template v-else>
            <div class="note-list">
              <template v-if="sortedNotesAll.length > 0">
                <div
                  v-for="n in sortedNotesAll"
                  :key="n.id"
                  class="note-item"
                  :class="{ clickable: !!noteConceptIdOf(n) }"
                  @click="gotoNoteConcept(n)"
                >
                  <div class="note-item-head">
                    <el-tag size="small" effect="plain" :type="n.source === 'selection' ? 'primary' : 'success'">
                      {{ n.source === 'selection' ? '选区笔记' : '问答收藏' }}
                    </el-tag>
                    <span class="note-concept">{{ noteConceptNameOf(n) }}</span>
                    <span class="note-time">{{ fmtNoteTime(n.createdAt) }}</span>
                    <el-button
                      class="note-del"
                      link
                      type="danger"
                      size="small"
                      :loading="deletingNoteId === n.id"
                      @click.stop="removeNoteItemAll(n)"
                    >删除</el-button>
                  </div>
                  <div v-if="n.anchorText" class="note-anchor-text">「{{ n.anchorText }}」</div>
                  <div v-if="n.contentMd" class="note-text">{{ n.contentMd }}</div>
                </div>
              </template>
              <div v-else class="qa-empty">
                还没有笔记——在讲义上选中文字「做笔记」、收藏答疑回答，都会汇总到这里跨概念回顾。
              </div>
            </div>
          </template>
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

      <!-- 空间设置（M6：设置入口移到主题主界面；共享面板组件，打开时按空间加载） -->
      <el-dialog v-model="settingsVisible" title="空间设置" width="520px" append-to-body :close-on-click-modal="false">
        <SpaceSettingsPanel v-if="settingsVisible" :space-id="spaceId" @applied="settingsVisible = false" />
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
  Setting,
  Star,
  StarFilled,
} from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'
import { routeDlIntent } from '@shared/utils/domain-learning-intent'
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
import SpaceSettingsPanel from './SpaceSettingsPanel.vue'
import type {
  DlCardSection,
  DlChatTurn,
  DlConceptView,
  DlMastery,
  DlNote,
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
  // 概念切换：清掉未落库的 task 临时气泡与动作流水（答疑历史由 view.turns 按概念刷新）
  liveTurns.value = []
  taskLog.value = []
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

// ---------- 交互：空主题起步研究（无任何知识点 → 空间级 research 生成首批知识） ----------
/** 空空间判定：视图已加载且尚无知识概念叶（concepts 含 group 目录行，须按叶判定） */
const isEmptySpace = computed(() => {
  const v = view.value
  return !!v && !(v.concepts ?? []).some((c) => c.nodeType !== 'group')
})
/** 起步研究的过程反馈（空态卡内展示；warn=异常/未产出） */
const bootMessage = ref('')
const bootWarn = ref(false)

async function bootResearch(): Promise<void> {
  if (researching.value) return
  researching.value = true
  bootMessage.value = ''
  bootWarn.value = false
  // 空间级事件通道 dl:agent:<spaceId>（conceptId 为空）
  const unsub = store.subscribeAgentEvent(spaceId.value, null, (ev) => {
    if (ev.type === 'error') {
      bootWarn.value = true
      bootMessage.value = `起步研究出错：${ev.error ?? '未知错误'}`
    }
  })
  try {
    const result = await store.sendAgent({
      mode: 'research',
      spaceId: spaceId.value,
      conceptId: null,
      message: `这是新主题「${spaceName.value}」的首次研究——请为整个领域建立首批核心知识点并生成第一份讲义。`,
    })
    await refreshView()
    const first = concepts.value.find((c) => c.nodeType !== 'group')
    if (first) {
      // 自动定位首批第一个概念，让用户直接看到讲义或研究入口
      expandPathTo(first.id)
      selectConcept(first)
    } else if (!bootMessage.value) {
      // 未产出：展示会话总结中的原因（资料不足时助手不编造），避免“干等无反馈”
      const reason = (result?.content ?? '').trim()
      bootWarn.value = true
      bootMessage.value = reason
        ? `本轮未生成知识点：${reason.slice(0, 260)}`
        : '本轮未生成知识点。可先绑定含资料的知识库（知识全景 → 空间设置 → 关联知识库），或在可联网环境重试。'
    }
  } finally {
    unsub()
    researching.value = false
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

// ---------- 交互：追问（tutor Agent 实时流式 / task 任务会话，M6-3 同框自动判断） ----------
const draft = ref('')
const qaListRef = ref<HTMLElement | null>(null)
const tutorStreaming = ref(false)

/** 本轮 task 会话已执行动作流水（action:done → 展示任务真实进度，M6-3 阶段二） */
interface DlTaskActionLog {
  tool: string
  status: string
  message: string
}
const taskLog = ref<DlTaskActionLog[]>([])

/** dl 动作 → 简短中文进度（未知原样回显） */
function taskActionText(tool: string): string {
  switch (tool) {
    case 'dl_save_concept':
      return '已建概念'
    case 'dl_save_relation':
      return '已建关系'
    case 'dl_save_card':
      return '已存讲义'
    case 'dl_answer_question':
      return '已回答存档'
    default:
      return tool
  }
}

/** 本轮追问临时消息（后端持久化前先展示；tutor view 刷新后清空；task 保留到切概念） */
const liveTurns = ref<DlChatTurn[]>([])
/** 展示顺序：历史(view.turns)在前，本轮进行中的追问在后 */
const displayTurns = computed<DlChatTurn[]>(() => [
  ...(view.value?.turns ?? []),
  ...liveTurns.value,
])

async function ask(): Promise<void> {
  const q = draft.value.trim()
  if (!q || tutorStreaming.value) return
  // 同框自动判断（M6-3 阶段一）：明确任务指令走 task 会话，答疑学习类走 tutor
  const targetMode: 'tutor' | 'task' = routeDlIntent(q) === 'task' ? 'task' : 'tutor'
  const scopeConceptId = currentConceptId.value
  tutorStreaming.value = true
  lastFeedback.value = ''
  taskLog.value = []

  // 本地先落 user + assistant 占位（assistant 文本随流式增量拼接）
  const userTurn: DlChatTurn = { role: 'user', text: q }
  const assistantTurn: DlChatTurn = { role: 'assistant', text: '' }
  liveTurns.value.push(userTurn, assistantTurn)
  scrollQaToBottom()

  // 订阅 agent 事件（动作级）与流式正文（reply:start 后按 summaryEventId 订阅）
  let unsubAgent = () => {}
  let unsubStream = () => {}
  unsubAgent = store.subscribeAgentEvent(spaceId.value, scopeConceptId, (ev: DlAgentUiEvent) => {
    // task 会话：动作事件收集为执行流水（展示真实进度）
    if (targetMode === 'task' && ev.type === 'action:done' && ev.summary) {
      taskLog.value.push({ tool: ev.summary.tool, status: ev.summary.status, message: ev.summary.message })
    }
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
      mode: targetMode,
      spaceId: spaceId.value,
      conceptId: scopeConceptId,
      message: q,
    })
    // 无答复不静默：流式正文为空时，用会话总结或明确错误兜底，避免“发了没反应也没报错”
    if (!assistantTurn.text) {
      const summary = (result?.content ?? '').trim()
      if (summary) {
        assistantTurn.text = summary
      } else {
        assistantTurn.text = store.error
          ? `（未收到回答：${store.error}）`
          : targetMode === 'task'
            ? '（任务未产出结果：请换更具体的指令重试）'
            : '（未收到回答：问题已记录，可稍后在“未解问题”中发起研究）'
      }
    }
  } catch (e: any) {
    assistantTurn.text = `（处理失败：${e?.message ?? '未知错误'}）`
  } finally {
    unsubAgent()
    unsubStream()
    tutorStreaming.value = false
    // 视图刷新（动作可能更新树/卡；tutor 已把问答落 dl_question）
    await refreshView()
    if (targetMode === 'tutor') {
      // 答疑已落库：清空临时消息（历史由 view.turns 承载）
      liveTurns.value = []
    }
    // task 不落答疑库：保留本轮气泡供查看（切换概念时统一清空）
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
/** 空间设置弹层（M6：设置入口在主界面） */
const settingsVisible = ref(false)

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
    // 结构化快照：anchorText=问题、contentMd=回答原文（与选区笔记同构，笔记面板统一渲染）
    await store.saveNote({
      id: spaceId.value,
      conceptId: c?.id ?? null,
      source: 'qna',
      questionId: t.questionId,
      anchorText: questionTextOf(t.questionId) || '答疑收藏',
      contentMd: t.text,
    })
  }
  await store.fetchNotesOf(spaceId.value, c?.id ?? null)
}

// ==================== M4-UX1 补全：右栏「笔记」面板（当前概念浏览/删除；M7-B 加空间级总览） ====================
/** 右栏当前面板：qa=追问答疑、notes=笔记 */
const rightPane = ref<'qa' | 'notes'>('qa')
/** 笔记面板范围：concept=当前概念（默认）/ all=本空间全部（M7-B 总览） */
const noteScope = ref<'concept' | 'all'>('concept')
/** 空间全部笔记条数 */
const notesAllTotal = computed(() => store.notesAll.length)
/** 全部笔记按创建时间降序 */
const sortedNotesAll = computed<DlNote[]>(() =>
  [...store.notesAll].sort((a, b) => noteTimeOf(b) - noteTimeOf(a)),
)
/** 笔记所属概念名（概念已不存在/空间级笔记给兜底文案） */
function noteConceptNameOf(n: DlNote): string {
  if (!n.conceptId) return '空间级'
  return concepts.value.find((c) => c.id === n.conceptId)?.name ?? '（已移除的概念）'
}
/** 笔记所属概念是否仍可跳转（返回概念 id 或 null） */
function noteConceptIdOf(n: DlNote): string | null {
  return n.conceptId && concepts.value.some((c) => c.id === n.conceptId) ? n.conceptId : null
}
/** 全部笔记条目点击：跳到所属概念讲义并切回概念笔记视图 */
function gotoNoteConcept(n: DlNote): void {
  const cid = noteConceptIdOf(n)
  if (!cid) return
  const c = concepts.value.find((x) => x.id === cid)
  if (!c) return
  expandPathTo(cid)
  selectConcept(c)
  noteScope.value = 'concept'
}
/** 全部视图删除：scoped 删除后同步空间级列表 */
async function removeNoteItemAll(n: DlNote): Promise<void> {
  if (deletingNoteId.value) return
  deletingNoteId.value = n.id
  try {
    await store.removeNoteOf(spaceId.value, n.id)
    await store.fetchNotesAll(spaceId.value)
  } finally {
    deletingNoteId.value = null
  }
}
// 切到「全部」时拉取空间级最新笔记（收藏/新增发生在概念视图，切回再拉保证同步）
watch(noteScope, (scope) => {
  if (scope === 'all') void store.fetchNotesAll(spaceId.value)
})
/** 正在删除的笔记 id（防连点） */
const deletingNoteId = ref<string | null>(null)
/** 当前概念笔记条数（未选概念按 0 展示） */
const noteCountOfCurrent = computed(() => (currentConceptId.value ? store.notes.length : 0))
/** 笔记按创建时间降序（新笔记在上） */
const sortedNotes = computed<DlNote[]>(() =>
  [...store.notes].sort((a, b) => noteTimeOf(b) - noteTimeOf(a)),
)

function noteTimeOf(n: DlNote): number {
  return n.createdAt ? new Date(n.createdAt).getTime() || 0 : 0
}

/** 时间展示：YYYY-MM-DD HH:mm（本地时区） */
function fmtNoteTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function removeNoteItem(n: DlNote): Promise<void> {
  if (deletingNoteId.value) return
  deletingNoteId.value = n.id
  try {
    await store.removeNoteOf(spaceId.value, n.id)
    // 重拉保持与服务端一致（删空后面板自然进入空态）
    await store.fetchNotesOf(spaceId.value, currentConcept.value?.id ?? null)
  } finally {
    deletingNoteId.value = null
  }
}

// 答疑面板在切换间卸载/重建（v-if），切回时滚动到底部
watch(rightPane, (pane) => {
  if (pane === 'qa') void nextTick(scrollQaToBottom)
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
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .head-tabs {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .head-tab {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    padding: 3px 0;
    color: var(--el-text-color-secondary);
    border-bottom: 2px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: color 0.15s;

    &:hover {
      color: var(--el-text-color-primary);
    }
    &.active {
      color: var(--el-color-primary);
      border-bottom-color: var(--el-color-primary);
    }
  }
  .head-tab-count {
    min-width: 16px;
    height: 16px;
    padding: 0 5px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    text-align: center;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
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

// M6-3 阶段二：task 会话执行进度条（动作流水）
.task-log {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);

  .task-log-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    margin-right: 2px;
  }
  .task-action {
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    padding: 0 8px;
    &.ok {
      color: var(--el-color-success);
    }
    &.skipped {
      color: var(--el-text-color-placeholder);
    }
    &.error {
      color: var(--el-color-danger);
    }
  }
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

/* M4-UX1/M7-B：右栏「笔记」面板（当前概念 + 空间全部总览） */
.note-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.note-scope-bar {
  display: flex;
  gap: 14px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .scope-tab {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    padding: 3px 0;
    color: var(--el-text-color-secondary);
    border-bottom: 2px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    &:hover {
      color: var(--el-text-color-primary);
    }
    &.active {
      color: var(--el-color-primary);
      border-bottom-color: var(--el-color-primary);
    }
  }
}

.note-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  gap: 6px;

  // 全部笔记总览：可跳转条目给 hover 提示
  &.clickable {
    cursor: pointer;
    &:hover {
      border-color: var(--el-color-primary-light-5);
    }
  }

  .note-item-head {
    display: flex;
    align-items: center;
    gap: 8px;

    .note-concept {
      flex-shrink: 0;
      font-size: 11.5px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      padding: 0 8px;
      border-radius: 8px;
      line-height: 1.8;
    }
    .note-time {
      flex: 1;
      min-width: 0;
      font-size: 11px;
      color: var(--el-text-color-placeholder);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .note-del {
      flex-shrink: 0;
    }
  }

  // 引文（选区原文 / 收藏问题）：限高滚动，避免撑爆面板
  .note-anchor-text {
    max-height: 96px;
    overflow-y: auto;
    padding: 6px 8px;
    border-left: 3px solid var(--el-color-primary-light-5);
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.6;
    border-radius: 0 6px 6px 0;
  }

  // 正文（想法 / 回答原文）：防溢出 + 限高滚动
  .note-text {
    font-size: 13px;
    line-height: 1.7;
    color: var(--el-text-color-primary);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-height: 240px;
    overflow-y: auto;
  }
}

/* M5：空主题起步态（无任何知识点 → 生成首批知识） */
.boot-body {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  overflow-y: auto;
}

.boot-card {
  max-width: 460px;
  padding: 28px 30px;
  text-align: center;
  border: 1px dashed var(--el-border-color);
  border-radius: 14px;
  background: var(--el-fill-color-blank);

  .boot-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 10px;
    color: var(--el-color-primary);

    .el-icon {
      font-size: 34px;
    }
  }
  h3 {
    margin: 0 0 10px;
    font-size: 18px;
    color: var(--el-text-color-primary);
  }
  p {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.8;
    color: var(--el-text-color-regular);
  }
  .boot-tip {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
  .boot-message {
    margin-top: 12px;
    font-size: 13px;
    color: var(--el-color-primary);
    line-height: 1.7;
    &.warn {
      color: var(--el-color-warning);
    }
  }
}
</style>
