<template>
  <div class="section-lesson">
    <!-- 正文章节：带序号标题行（与区级动作同排，不再有右上悬浮元素） -->
    <div
      v-for="item in plan.content"
      :key="item.key"
      class="sec"
      :class="`sec-${item.style}`"
    >
      <div class="sec-head" :class="{ 'sec-head-bare': !item.title }">
        <span v-if="item.title" class="sec-index">{{ item.no }}</span>
        <span v-if="item.title" class="sec-title">{{ item.title }}</span>
        <span class="sec-actions">
          <span class="sec-confuse" @click="notUnderstand(item)">这块没懂</span>
          <span v-if="item.folded" class="fold-hint" @click="toggleFold(item.index)">
            {{ expanded.has(item.index) ? '收起' : '展开全文' }}
          </span>
        </span>
      </div>
      <div v-if="!item.folded || expanded.has(item.index)" class="sec-body">
        <MarkdownViewer :md="item.body" />
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
 *   编写注记区整体剥离并汇总到置底折叠面板（此前它作为章节渲染，标题行右侧的
 *   「展开全文」与右上悬浮的「这块没懂」重叠）；
 * - 区级动作（这块没懂 / 展开全文）统一收进标题行 `.sec-actions` 同排，不再绝对定位。
 */
import { computed, reactive, ref } from 'vue'
import { Link } from '@element-plus/icons-vue'
import MarkdownViewer from './MarkdownViewer.vue'
import { planLessonSections } from '@shared/utils/lesson-sections'
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
}>()

/** 区结构计划（正文编号 + 编写注记汇总；纯函数，随 card.sections 变化重算） */
const plan = computed(() => planLessonSections(props.card.sections))

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
    }
  }

  &:hover .sec-actions .sec-confuse {
    opacity: 1;
  }
}

.sec-body {
  :deep(p:first-child) {
    margin-top: 0;
  }
}

// 自测答案（默认折叠）：读者先自己做，再展开对答案（检索练习）
.selfcheck-answers {
  margin-top: 10px;

  .answers-toggle {
    display: inline-block;
    padding: 3px 12px;
    border: 1px dashed var(--el-color-primary-light-5);
    border-radius: 14px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    font-size: 12px;
    cursor: pointer;
    user-select: none;

    &:hover {
      border-style: solid;
      background: var(--el-color-primary-light-7);
    }
  }

  .answers-body {
    margin-top: 8px;
    padding: 10px 14px;
    border-left: 3px solid var(--el-color-primary-light-5);
    border-radius: 0 6px 6px 0;
    background: var(--el-fill-color-lighter);
  }
}

.sec-intro {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 12px 18px 14px 14px;
}

.sec-note {
  background: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
  border-radius: 6px;
  padding: 10px 14px;
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
