<template>
  <div class="section-lesson">
    <!-- 类型化模板区集：每区自带标题/样式；整段顺读 -->
    <div
      v-for="(sec, i) in props.card.sections"
      :key="sec.key"
      class="sec"
      :class="`sec-${sec.style ?? styleByKey(sec.key)}`"
    >
      <!-- intro（本质引言）不显示标题行，避免多余空行；其余区显示标题 -->
      <div v-if="(sec.style ?? styleByKey(sec.key)) !== 'intro' && (sec.title ?? titleByKey(sec.key))" class="sec-head">
        <span class="sec-title">{{ sec.title ?? titleByKey(sec.key) }}</span>
        <span class="sec-actions">
          <span v-if="sec.folded" class="fold-hint" @click="toggleFold(i)">{{ expanded.has(i) ? '收起' : '展开全文' }}</span>
        </span>
      </div>
      <!-- 这块没懂：整区右上悬浮（含 intro 区） -->
      <span class="sec-confuse" @click="notUnderstand(sec)">这块没懂</span>
      <!-- 折叠区：默认收起，点"展开全文"再显示 -->
      <div v-if="!sec.folded || expanded.has(i)" class="sec-body">
        <MarkdownViewer :md="sec.md" />
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

    <!-- works 区：相关著作（有则显示） -->
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
        </div>
      </div>
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
 */
import { reactive } from 'vue'
import MarkdownViewer from './MarkdownViewer.vue'
import type { CardSection, ConceptCard, RelatedRef } from './mock-data'

const props = defineProps<{
  card: ConceptCard
  /** 相关知识点（父级由关系边派生后传入） */
  related?: RelatedRef[]
}>()

const emit = defineEmits<{
  notUnderstand: [section: CardSection]
  gotoConcept: [conceptId: string]
}>()

/** 折叠区展开态（按下标；默认收起） */
const expanded = reactive(new Set<number>())
function toggleFold(i: number): void {
  if (expanded.has(i)) expanded.delete(i)
  else expanded.add(i)
}

/** key → 默认标题（模板语义区，缺省展示用） */
const KEY_TITLES: Record<string, string> = {
  essence: '本质', statement: '陈述/条文', justification: '依据/证明',
  application: '应用/适用', definition: '定义', mechanism: '机制',
  structure: '组成/结构', procedure: '步骤', formula: '公式',
  example: '示例', edge: '示例与注意', counterexample: '反例/边界',
  distinguish: '辨析', property: '性质', evidence: '证据',
  review: '检验', selfcheck: '自测', controversy: '争议', detail: '详解',
}
function titleByKey(key: string): string {
  return KEY_TITLES[key] ?? ''
}
function styleByKey(key: string): string {
  return key === 'edge' ? 'note' : key === 'essence' ? 'intro' : key === 'review' ? 'review' : 'body'
}

function notUnderstand(sec: CardSection): void {
  emit('notUnderstand', sec)
}
function gotoRelated(r: RelatedRef): void {
  emit('gotoConcept', r.conceptId)
}
</script>

<style scoped lang="scss">
.section-lesson {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 2px 2px 12px;
}

.sec {
  position: relative;
  font-size: 14px;
  line-height: 1.8;
  color: var(--el-text-color-regular);

  .sec-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 2px;
    padding-bottom: 4px;
    border-bottom: 1px dashed var(--el-border-color-lighter);

    .sec-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
    }
    .sec-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;

      .fold-hint {
        color: var(--el-color-primary);
        cursor: pointer;
      }
    }
  }

  // 整区右上「这块没懂」（hover 出现；含 intro 区）
  .sec-confuse {
    position: absolute;
    top: 2px;
    right: 4px;
    z-index: 2;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    &:hover {
      color: var(--el-color-warning);
    }
  }
  &:hover .sec-confuse {
    opacity: 1;
  }
}

.sec-intro {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 12px 18px 12px 14px;
}

.sec-note {
  background: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
  border-radius: 6px;
  padding: 10px 14px;
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
</style>
