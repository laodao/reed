<template>
  <div class="ld-body" :class="`ld-${layout}`">
    <!-- 自测题：普通题目列表（2026-10-05 用户口径「自测题不要做成卡片」——
         题干是拿来做的，不是拿来看的素材块，卡片底色反而干扰阅读） -->
    <template v-if="layout === 'qa' && qaItems.length">
      <ol class="ld-qa-list">
        <li v-for="(p, i) in qaItems" :key="i" class="ld-qa-item">
          <span class="ld-qa-no">{{ i + 1 }}</span>
          <div class="ld-qa-text">
            <span class="ld-qa-title">{{ p.title }}</span>
            <span v-if="p.desc" class="ld-qa-desc">{{ p.desc }}</span>
          </div>
        </li>
      </ol>
    </template>

    <!-- 要点卡 / 误区卡：条目卡片 + 残余正文（不丢任何内容） -->
    <template v-else-if="cardItems.length">
      <div class="ld-cards">
        <div v-for="(p, i) in cardItems" :key="i" class="ld-card">
          <span class="ld-card-no">{{ i + 1 }}</span>
          <div class="ld-card-text">
            <span class="ld-card-title">{{ p.title }}</span>
            <span v-if="p.desc" class="ld-card-desc">{{ p.desc }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 步骤条 -->
    <template v-else-if="layout === 'steps' && stepItems.length">
      <ol class="ld-steps">
        <li v-for="st in stepItems" :key="st.no" class="ld-step">
          <span class="ld-step-no">{{ st.no }}</span>
          <div class="ld-step-text">
            <span class="ld-step-title">{{ st.title }}</span>
            <span v-if="st.desc" class="ld-step-desc">{{ st.desc }}</span>
          </div>
        </li>
      </ol>
    </template>

    <!-- 数据看点：大字 + 说明 -->
    <template v-else-if="layout === 'stats' && statItems.length">
      <div class="ld-stats">
        <div v-for="(s, i) in statItems" :key="i" class="ld-stat">
          <span class="ld-stat-value">{{ s.value }}</span>
          <span class="ld-stat-label">{{ s.label }}</span>
          <span v-if="s.note" class="ld-stat-note">{{ s.note }}</span>
        </div>
      </div>
    </template>

    <!-- 上手清单 -->
    <template v-else-if="layout === 'checklist' && checkItems.length">
      <ul class="ld-checklist">
        <li v-for="(c, i) in checkItems" :key="i" class="ld-check" :class="{ done: c.done }">
          <span class="ld-check-box">{{ c.done ? '✓' : '' }}</span>
          <span class="ld-check-text">{{ c.text }}</span>
        </li>
      </ul>
    </template>

    <!-- 时间线 -->
    <template v-else-if="layout === 'timeline' && timelineItems.length">
      <ol class="ld-timeline">
        <li v-for="(t, i) in timelineItems" :key="i" class="ld-tl-item">
          <span class="ld-tl-marker">{{ t.marker }}</span>
          <div class="ld-tl-text">
            <span class="ld-tl-title">{{ t.title }}</span>
            <span v-if="t.desc" class="ld-tl-desc">{{ t.desc }}</span>
          </div>
        </li>
      </ol>
    </template>

    <!-- 残余正文（列表之外的说明段落；结构化设备下也照样渲染） -->
    <MarkdownViewer v-if="residual" :md="residual" class="ld-residual" />
  </div>
</template>

<script setup lang="ts">
/**
 * 讲义「版式设备」正文渲染（LessonSectionBody）
 * @module views/domain-learning/LessonSectionBody
 *
 * 背景（2026-09-14 用户反馈：「纯粹的堆砌文字，没有对文字做精炼归纳，没有配图，布局单调简陋」）：
 * 此前每区正文都是一整段 markdown，读者看到的是"一堵字"。现在按区的**版式设备**
 * （`shared/utils/lesson-layout` 的设备目录）分发渲染：
 * - 要点卡 / 误区卡 → 卡片网格（标题 + 一句话）；
 * - 自测题 → 普通题目列表（2026-10-05 用户口径「自测题不要做成卡片」）；
 * - 步骤条 → 带序号的竖向步骤；
 * - 数据看点 → 大字数值 + 说明；
 * - 上手清单 → 勾选框列表；
 * - 时间线 → 带标记的脉络；
 * - 其余（正文/图解/算例/公式/引文/对比表/代码）→ markdown 渲染 + 版式装饰类。
 *
 * 纪律：**只做解析与呈现，不改内容**——条目之外残余的正文一律继续用 markdown 渲染
 * （`splitLessonDeviceMd`），宁可多渲染一段，也不静默丢模型写的东西。
 */
import { computed } from 'vue'
import MarkdownViewer from './MarkdownViewer.vue'
import {
  canonicalLessonLayout,
  parseLessonChecklist,
  parseLessonPoints,
  parseLessonStats,
  parseLessonSteps,
  parseLessonTimeline,
  splitLessonDeviceMd,
  type DlLessonLayout,
} from '@shared/utils/lesson-layout'

const props = defineProps<{
  /** 版式设备 key（未收录按 prose） */
  layout: string
  /** 区正文 md */
  body: string
}>()

const layout = computed<DlLessonLayout>(() => canonicalLessonLayout(props.layout) || 'prose')

/** 卡片类设备（要点卡 / 误区警示）共用条目解析；自测题单独走题目列表（不做卡片） */
const cardItems = computed(() =>
  ['keypoints', 'pitfall'].includes(layout.value) ? parseLessonPoints(props.body) : [],
)
/** 自测题条目（题目列表渲染） */
const qaItems = computed(() => (layout.value === 'qa' ? parseLessonPoints(props.body) : []))
const stepItems = computed(() => (layout.value === 'steps' ? parseLessonSteps(props.body) : []))
const statItems = computed(() => (layout.value === 'stats' ? parseLessonStats(props.body) : []))
const checkItems = computed(() => (layout.value === 'checklist' ? parseLessonChecklist(props.body) : []))
const timelineItems = computed(() => (layout.value === 'timeline' ? parseLessonTimeline(props.body) : []))
/** 未被做成条目的正文（列表外的说明段等） */
const residual = computed(() => splitLessonDeviceMd(props.body, layout.value).residual)
</script>

<style scoped lang="scss">
.ld-body {
  font-size: 14px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
}

// ---------- 卡片类（要点卡 / 误区卡 / 题卡） ----------
.ld-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.ld-card {
  display: flex;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  }

  .ld-card-no {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .ld-card-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .ld-card-title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .ld-card-desc {
    font-size: 13px;
    color: var(--el-text-color-regular);
  }
}

// 误区卡：警示色
.ld-pitfall .ld-card {
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
  .ld-card-no {
    background: var(--el-color-warning-light-8);
    color: var(--el-color-warning);
  }
}

// ---------- 自测题：普通题目列表（不做卡片） ----------
// 2026-10-05 用户口径「自测题不要做成卡片」：题干按文档式排版（序号 + 题目 + 补充），
// 无底色、无边框、无圆角；题与题之间只用一条淡虚线分隔，答案折叠入口在区尾（SectionLesson）。
.ld-qa-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
}

.ld-qa-item {
  display: flex;
  gap: 8px;
  padding: 6px 0;

  & + & {
    border-top: 1px dashed var(--el-border-color-lighter);
  }

  .ld-qa-no {
    flex-shrink: 0;
    color: var(--el-color-primary);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.8;
    font-variant-numeric: tabular-nums;

    &::after {
      content: '.';
    }
  }

  .ld-qa-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .ld-qa-title {
    color: var(--el-text-color-primary);
    line-height: 1.8;
  }

  .ld-qa-desc {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

// ---------- 步骤条 ----------
.ld-steps {
  list-style: none;
  margin: 0 0 10px;
  padding: 0 0 0 4px;
}
.ld-step {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 0 0 12px 0;

  // 竖向连接线
  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 24px;
    bottom: 2px;
    width: 1px;
    background: var(--el-border-color);
  }

  .ld-step-no {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    z-index: 1;
  }
  .ld-step-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 1px;
  }
  .ld-step-title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .ld-step-desc {
    font-size: 13px;
  }
}

// ---------- 数据看点 ----------
.ld-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.ld-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  border-left: 3px solid var(--el-color-primary);

  .ld-stat-value {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--el-color-primary);
    font-variant-numeric: tabular-nums;
  }
  .ld-stat-label {
    font-size: 13px;
    color: var(--el-text-color-primary);
  }
  .ld-stat-note {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}

// ---------- 上手清单 ----------
.ld-checklist {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
}
.ld-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;

  .ld-check-box {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-top: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    font-size: 11px;
    line-height: 1;
    color: #fff;
  }
  &.done {
    .ld-check-box {
      background: var(--el-color-success);
      border-color: var(--el-color-success);
    }
    .ld-check-text {
      color: var(--el-text-color-secondary);
      text-decoration: line-through;
    }
  }
}

// ---------- 时间线 ----------
.ld-timeline {
  list-style: none;
  margin: 0 0 10px;
  padding: 0 0 0 4px;
}
.ld-tl-item {
  position: relative;
  display: flex;
  gap: 10px;
  padding-bottom: 12px;

  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 16px;
    bottom: 0;
    width: 1px;
    background: var(--el-border-color);
  }

  .ld-tl-marker {
    flex-shrink: 0;
    min-width: 46px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 12px;
    text-align: center;
  }
  .ld-tl-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ld-tl-title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .ld-tl-desc {
    font-size: 13px;
  }
}

// ---------- 正文类设备的版式装饰 ----------
// 图解：整段视觉重心（图由 markdown 里的 ```figure 渲染成 SVG）
.ld-figure {
  padding: 12px 10px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);

  :deep(.dl-figure svg) {
    max-width: 100%;
    height: auto;
  }
}

// 算例推演：算例框（带角标），强调"这是可复算的例子"
.ld-worked {
  position: relative;
  padding: 14px 14px 10px;
  border: 1px solid var(--el-color-success-light-7);
  border-radius: 10px;
  background: var(--el-color-success-light-9);

  &::before {
    content: '算例';
    position: absolute;
    top: -9px;
    left: 12px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--el-color-success);
    color: #fff;
    font-size: 11px;
    line-height: 18px;
  }
}

// 公式推导：居中留白，公式区更宽
.ld-formula {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);

  :deep(.katex-display) {
    margin: 10px 0;
    overflow-x: auto;
  }
}

// 引文/条文：引号装饰 + 出处右对齐由 markdown 决定
.ld-quote {
  :deep(blockquote) {
    margin: 0 0 10px;
    padding: 8px 14px;
    border-left: 3px solid var(--el-color-primary-light-5);
    background: var(--el-color-primary-light-9);
    border-radius: 0 8px 8px 0;
    color: var(--el-text-color-regular);
    font-size: 13.5px;
  }
}

// 对比表：表格加框，横向可滚
.ld-compare {
  :deep(table) {
    width: 100%;
    margin: 0 0 10px;
    border-radius: 8px;
    overflow: hidden;
  }
}

// 结论条：左侧色条 + 图标感
.ld-callout {
  padding: 10px 14px;
  border-left: 3px solid var(--el-color-primary);
  border-radius: 0 8px 8px 0;
  background: var(--el-color-primary-light-9);
  font-size: 13.5px;
}

// 可运行代码：外层留白，运行条由 MarkdownViewer 注入
.ld-code {
  :deep(.dl-run) {
    margin: 0 0 10px;
  }
}

// 残余正文与条目之间留一点气口
.ld-residual {
  margin-top: 2px;
}
</style>
