<template>
  <div class="section-lesson">
    <!-- 讲义规格条 + 区导航（2026-09-14：有已确认规格才显示；老卡不显示，不猜内容） -->
    <LessonSpecBar :spec="props.card.spec ?? null" :nav="navItems" @jump="jumpTo" />

    <!-- 正文章节：带序号标题行（与区级动作同排，不再有右上悬浮元素）
         2026-09-14：正文按「版式设备」渲染（要点卡/对比表/步骤条/图解/数据看点…），
         不再一律输出一段 markdown —— 这正是"堆砌文字、布局单调"的正面解法。 -->
    <div
      v-for="item in plan.content"
      :key="item.key"
      :id="sectionAnchor(item.index)"
      class="sec"
      :class="[`sec-${item.style}`, `sec-device-${presentationOf(item.index).layout}`]"
    >
      <div class="sec-head" :class="{ 'sec-head-bare': !item.title }">
        <span v-if="item.title" class="sec-index">{{ item.no }}</span>
        <span v-if="item.title" class="sec-title">{{ item.title }}</span>
        <span v-if="presentationOf(item.index).badge" class="sec-badge">
          {{ presentationOf(item.index).badge }}
        </span>
        <span class="sec-actions">
          <span class="sec-confuse" @click="notUnderstand(item)">这块没懂</span>
          <span class="sec-rewrite" @click="rewriteSection(item)">重写此区</span>
          <span v-if="item.folded" class="fold-hint" @click="toggleFold(item.index)">
            {{ expanded.has(item.index) ? '收起' : '展开全文' }}
          </span>
        </span>
      </div>
      <div v-if="!item.folded || expanded.has(item.index)" class="sec-body">
        <!-- 一句话结论（takeaway）：读者先拿到结论，再决定要不要细读 -->
        <div v-if="presentationOf(item.index).takeaway" class="sec-takeaway">
          {{ presentationOf(item.index).takeaway }}
        </div>
        <LessonSectionBody :layout="presentationOf(item.index).layout" :body="item.body" />
        <!-- 自测答案：默认折叠（先自己做，再对答案；2026-09-12 用户需求） -->
        <div v-if="item.answers" class="selfcheck-answers">
          <span class="answers-toggle" @click="toggleAnswers(item.index)">
            {{ answersOpen.has(item.index) ? '收起答案' : '显示答案（建议先自己做）' }}
          </span>
          <div v-if="answersOpen.has(item.index)" class="answers-body">
            <MarkdownViewer :md="item.answers" />
          </div>
        </div>
      </div>
    </div>

    <!-- related 区：相关知识点（图关系派生，有则显示） -->
    <div v-if="related.length" class="sec sec-related">
      <div class="sec-head">
        <span class="sec-title">相关知识点</span>
        <span class="sec-actions"></span>
      </div>
      <div class="sec-body">
        <div class="related-list">
          <span
            v-for="r in related"
            :key="r.conceptId"
            class="related-chip"
            @click="gotoRelated(r)"
          >
            {{ r.name }}<span v-if="r.rel" class="rel-tag">{{ r.rel }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- works 区：相关著作（有则显示；有 url 则可点击） -->
    <div v-if="props.card.works?.length" class="sec sec-works">
      <div class="sec-head">
        <span class="sec-title">相关著作</span>
        <span class="sec-actions"></span>
      </div>
      <div class="sec-body">
        <div v-for="(w, i) in props.card.works" :key="i" class="work-item">
          <span class="work-kind">{{ w.kind }}</span>
          <span class="work-title">{{ w.title }}</span>
          <span v-if="w.authors" class="work-meta">{{ w.authors }}</span>
          <span v-if="w.year" class="work-meta">· {{ w.year }}</span>
          <span v-if="w.note" class="work-meta">· {{ w.note }}</span>
          <a v-if="isSafeExternalUrl(w.url)" class="work-link" :href="w.url" @click.prevent="openExternalUrl(w.url)">
            {{ externalHostLabel(w.url) || '原文' }}
          </a>
        </div>
      </div>
    </div>

    <!-- evidence 区：证据来源（可点击的原文链接 + KB 文档回链标识，M4-B） -->
    <div v-if="props.card.evidenceSources?.length" class="sec sec-evidence">
      <div class="sec-head">
        <span class="sec-title">证据来源（{{ props.card.evidenceSources.length }}）</span>
        <span class="sec-actions"></span>
      </div>
      <div class="sec-body">
        <div v-for="(e, i) in props.card.evidenceSources" :key="i" class="evidence-item">
          <span class="work-kind">{{ e.kind }}</span>
          <span class="work-title">{{ e.title }}</span>
          <el-tag v-if="e.kbDocId" size="small" type="info" effect="plain">知识库文档</el-tag>
          <a
            v-if="isSafeExternalUrl(e.url)"
            class="work-link"
            :href="e.url"
            :title="e.url"
            @click.prevent="openExternalUrl(e.url)"
          >
            <el-icon><Link /></el-icon>{{ externalHostLabel(e.url) || '原文链接' }}
          </a>
          <span v-if="e.quote" class="evidence-quote">「{{ e.quote }}」</span>
        </div>
      </div>
    </div>

    <!-- 编写注记（学习者可跳过）：唯一的注记入口，置底、默认收起、弱化样式 -->
    <div v-if="plan.authoringNotes.length" class="authoring-notes">
      <span class="notes-toggle" @click="notesPanelOpen = !notesPanelOpen">
        编写注记（学习者可跳过）· {{ plan.authoringNotes.length }} 条{{ notesPanelOpen ? '收起' : '展开' }}
      </span>
      <ul v-if="notesPanelOpen" class="notes-list">
        <li v-for="(n, ni) in plan.authoringNotes" :key="ni">{{ n }}</li>
      </ul>
    </div>

    <!-- 模板空态兜底：已挂卡但无区内容 -->
    <el-empty v-if="props.card.sections.length === 0" description="讲义内容整理中" />
  </div>
</template>

<script setup lang="ts">
/**
 * 类型化模板讲义渲染（SectionLesson）
 * @module views/domain-learning/SectionLesson
 * @description content-template-design v4：按知识本质类型的模板区集渲染。
 *              区=粗粒度整段（md 可含图/表/mermaid/KaTeX），非碎片卡片；
 *              works（相关著作）与 related（相关知识点）为可选区，有则显示；
 *              深水区（folded）整段折叠；区级「这块没懂」上抛。
 *
 * 2026-09-12 排版复盘：
 * - 区结构由 `planLessonSections`（shared 纯函数）算好：正文章节按序编号，
 *   编写注记区整体剥离并汇总到置底折叠面板；
 * - 区级动作（这块没懂 / 展开全文）统一收进标题行 `.sec-actions` 同排，不再绝对定位。
 *
 * 2026-09-14 版式化（用户反馈「纯粹的堆砌文字，没有对文字做精炼归纳，没有配图，布局单调简陋」）：
 * - 顶部出**讲义规格条 + 区导航**（有已确认规格时）：读者画像/目标/术语与记号 + 点击跳区；
 * - 每区按**版式设备**渲染（`presentLessonSections` → LessonSectionBody）：
 *   要点卡/对比表/步骤条/图解/算例/公式/数据看点/引文/时间线/误区/清单/代码/自测/结论条；
 * - 区标题行加**版式徽标**，正文上方加**一句话结论**（takeaway）；
 * - 区级新增「重写此区」（带该区正文与版式，交给助手定点重写，不整篇重来）。
 */
import { computed, nextTick, reactive, ref } from 'vue'
import { Link } from '@element-plus/icons-vue'
import MarkdownViewer from './MarkdownViewer.vue'
import LessonSectionBody from './LessonSectionBody.vue'
import LessonSpecBar from './LessonSpecBar.vue'
import { planLessonSections } from '@shared/utils/lesson-sections'
import { lessonLayoutName, presentLessonSections } from '@shared/utils/lesson-layout'
import { externalHostLabel, isSafeExternalUrl, openExternalUrl } from '@shared/utils/external-link'
import type { DlCardSection, DlCardView, DlRelatedRef } from '@shared/types/domain-learning.types'

const props = withDefaults(defineProps<{
  card: DlCardView
  /** 相关知识点（父级由关系边派生后传入） */
  related?: DlRelatedRef[]
}>(), {
  related: () => [],
})

const emit = defineEmits<{
  notUnderstand: [section: DlCardSection]
  gotoConcept: [conceptId: string]
  /** 重写此区（2026-09-14：带区 key/版式，父级据此驱动助手定点重写） */
  rewriteSection: [section: DlCardSection]
}>()

/** 区结构计划（正文编号 + 编写注记汇总；纯函数，随 card.sections 变化重算） */
const plan = computed(() => planLessonSections(props.card.sections))

/** 区展示计划（版式设备/徽标/结论条；与 sections 同序） */
const presentations = computed(() =>
  presentLessonSections({ essenceType: props.card.essenceType, sections: props.card.sections }),
)

function presentationOf(index: number) {
  return (
    presentations.value[index] ?? {
      layout: 'prose' as const,
      layoutName: '',
      badge: '',
      takeaway: '',
      stats: null,
    }
  )
}

/** 区导航（规格条用）：序号 + 标题 + 版式名 + 该区读者动作（规格 roster 里有则带上） */
const navItems = computed(() => {
  const jobByKey = new Map((props.card.spec?.roster ?? []).map((r) => [r.key, r.job]))
  return plan.value.content.map((c) => {
    const p = presentationOf(c.index)
    return {
      index: c.index,
      no: c.no,
      title: c.title || c.key,
      device: lessonLayoutName(p.layout) || p.layout,
      job: jobByKey.get(c.key) ?? '',
    }
  })
})

/** 区锚点 id（导航跳转用） */
function sectionAnchor(index: number): string {
  return `dl-sec-${index}`
}

/** 跳到某区（滚动到视口内；元素缺失时静默——渲染期/测试环境无布局） */
function jumpTo(index: number): void {
  void nextTick(() => {
    const el = document.getElementById(sectionAnchor(index))
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  })
}

/** 折叠区展开态（按原 sections 下标；默认收起） */
const expanded = reactive(new Set<number>())
function toggleFold(i: number): void {
  if (expanded.has(i)) expanded.delete(i)
  else expanded.add(i)
}

/** 自测答案展开态（按原 sections 下标；默认收起——先自己做再对答案） */
const answersOpen = reactive(new Set<number>())
function toggleAnswers(i: number): void {
  if (answersOpen.has(i)) answersOpen.delete(i)
  else answersOpen.add(i)
}

/** 编写注记面板展开态（默认收起：学习者可跳过） */
const notesPanelOpen = ref(false)

function notUnderstand(item: { index: number }): void {
  const section = props.card.sections[item.index]
  if (section) emit('notUnderstand', section)
}
function rewriteSection(item: { index: number }): void {
  const section = props.card.sections[item.index]
  if (section) emit('rewriteSection', section)
}
function gotoRelated(r: DlRelatedRef): void {
  emit('gotoConcept', r.conceptId)
}
</script>

<style scoped lang="scss">
.section-lesson {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 2px 2px 12px;
}

.sec {
  position: relative;
  font-size: 14px;
  line-height: 1.8;
  color: var(--el-text-color-regular);

  // 章节标题行：序号 + 标题 + 区级动作（同一行，杜绝重叠）
  .sec-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    // 无标题的引言区：只留动作行，不加分隔线
    &.sec-head-bare {
      margin-bottom: 2px;
      padding-bottom: 0;
      border-bottom: none;
      justify-content: flex-end;
    }

    .sec-index {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 19px;
      height: 19px;
      border-radius: 5px;
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      font-size: 11.5px;
      font-weight: 700;
      line-height: 1;
    }

    .sec-title {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.4;
      color: var(--el-text-color-primary);
    }

    // 版式徽标（2026-09-14）：读者一眼知道这一区是什么形态（要点卡/图解/对比表…）
    .sec-badge {
      flex-shrink: 0;
      padding: 0 6px;
      border-radius: 8px;
      background: var(--el-fill-color);
      color: var(--el-text-color-secondary);
      font-size: 11px;
      line-height: 16px;
    }

    .sec-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      white-space: nowrap;

      .fold-hint {
        color: var(--el-color-primary);
        cursor: pointer;
      }

      .sec-confuse {
        color: var(--el-text-color-placeholder);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;

        &:hover {
          color: var(--el-color-warning);
        }
      }

      // 区级定点重写（2026-09-14）：只重做这一区，不整篇重来
      .sec-rewrite {
        color: var(--el-text-color-placeholder);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;

        &:hover {
          color: var(--el-color-primary);
        }
      }
    }
  }

  &:hover .sec-actions .sec-confuse,
  &:hover .sec-actions .sec-rewrite {
    opacity: 1;
  }
}

// 一句话结论（takeaway）：读者先拿结论，再决定细读
// 2026-09-15 用户口径「不要卡片样式」：去掉底色/圆角/左色条，按普通段落呈现（只保留加粗引导）
.sec-takeaway {
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
  font-size: 13px;
  line-height: 1.7;
  font-weight: 600;
}

.sec-body {
  :deep(p:first-child) {
    margin-top: 0;
  }
}

// 自测答案（默认折叠）：读者先自己做，再展开对答案（检索练习）
// 折叠入口保留（这是功能，不是装饰）；展开后的答案区 2026-09-15 起也按普通段落呈现
.selfcheck-answers {
  margin-top: 10px;

  .answers-toggle {
    display: inline-block;
    color: var(--el-color-primary);
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .answers-body {
    margin-top: 8px;
  }
}

// 2026-09-15 用户口径「不要卡片样式」：引言区/注意区不再做卡片（无底色、无圆角、无左色条），
// 讲义整篇按文档排（标题 + 正文 + 表格），避免"一堆卡片"的观感。
.sec-intro {
  padding: 0;
}

.sec-note {
  padding: 0;
}

.sec-review {
  border-top: 1px dashed var(--el-border-color);
  padding-top: 12px;
}

.sec-related {
  .related-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .related-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 12px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 12.5px;
    cursor: pointer;
    &:hover {
      background: var(--el-color-primary-light-7);
    }
    .rel-tag {
      font-size: 10.5px;
      color: var(--el-text-color-placeholder);
    }
  }
}

.sec-works {
  .work-item {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0;
    font-size: 13px;

    .work-kind {
      font-size: 10.5px;
      color: #fff;
      background: var(--el-color-primary);
      border-radius: 4px;
      padding: 0 5px;
      flex-shrink: 0;
    }
    .work-title {
      color: var(--el-text-color-primary);
    }
    .work-meta {
      color: var(--el-text-color-placeholder);
      font-size: 12px;
    }
  }
}

// M4-B：证据来源条目（复用著作配色语义；2026-09-12：url 可点击）
.sec-evidence {
  .evidence-item {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0;
    font-size: 13px;

    .evidence-quote {
      width: 100%;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      border-left: 2px solid var(--el-color-info-light-5);
      padding-left: 8px;
    }
  }
}

// 外链（证据来源/著作）：站点名 + 图标，点击走系统浏览器（2026-09-12）
.work-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--el-color-primary);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  .el-icon {
    font-size: 12px;
  }
}

// 2026-09-12：编写注记（正文本区剥离 + 编写注记区汇总；唯一入口，置底弱化）
.authoring-notes {
  margin-top: -4px;
  font-size: 12px;

  .notes-toggle {
    display: inline-block;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
    user-select: none;
    border-bottom: 1px dashed var(--el-border-color);
    padding-bottom: 1px;

    &:hover {
      color: var(--el-color-primary);
    }
  }

  .notes-list {
    margin: 8px 0 0;
    padding: 10px 14px 10px 28px;
    background: var(--el-fill-color-lighter);
    border-radius: 6px;
    color: var(--el-text-color-secondary);
    line-height: 1.7;
    list-style: disc;

    li + li {
      margin-top: 5px;
    }
  }
}
</style>
