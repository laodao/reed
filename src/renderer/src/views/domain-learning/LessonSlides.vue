<template>
  <div class="lesson-slides">
    <!-- 顶部工具条：标题/页数/导航 -->
    <div class="slides-toolbar">
      <span class="slides-count">{{ index + 1 }} / {{ pages.length }}</span>
      <div class="slides-nav">
        <el-button size="small" :disabled="index === 0" @click="prev">上一页</el-button>
        <el-button size="small" type="primary" :disabled="index === pages.length - 1" @click="next">下一页</el-button>
        <el-button size="small" circle :icon="FullScreen" title="全屏" @click="toggleFullscreen" />
      </div>
    </div>

    <!-- 幻灯片页 -->
    <div class="slides-stage">
      <div class="slide" v-if="index === 0">
        <div class="cover-title">{{ title }}</div>
        <div v-if="subTitle" class="cover-sub">{{ subTitle }}</div>
        <div v-if="pages[index].meta" class="cover-meta">{{ pages[index].meta }}</div>
      </div>
      <div v-else class="slide">
        <div class="slide-head">
          <span class="slide-idx">{{ index }}</span>
          <h3>{{ pages[index].title }}</h3>
        </div>
        <div class="slide-body">
          <MarkdownViewer v-if="pages[index].md !== undefined" :md="pages[index].md!" />
          <div v-else-if="pages[index].works" class="works-wrap">
            <div v-for="w in pages[index].works" :key="w.title" class="work-card">
              <div class="work-title">{{ w.title }}</div>
              <div class="work-meta">{{ w.kind }}{{ w.year ? ` · ${w.year}` : '' }}{{ w.authors ? ` · ${w.authors}` : '' }}</div>
              <div v-if="w.note" class="work-note">{{ w.note }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 讲义 HTML 幻灯片（M4-UX3：图文并茂在线浏览；复用 MarkdownViewer 渲染图/表/KaTeX）
 * @module views/domain-learning/LessonSlides
 */
import { computed, ref } from 'vue'
import { FullScreen } from '@element-plus/icons-vue'
import MarkdownViewer from './MarkdownViewer.vue'
import type { DlCardSection, DlWorkRef } from '@shared/types/domain-learning.types'

const props = withDefaults(
  defineProps<{
    title: string
    subTitle?: string
    sections: DlCardSection[]
    works?: DlWorkRef[] | null
  }>(),
  { subTitle: '', works: null },
)

interface SlidePage {
  title: string
  md?: string
  works?: DlWorkRef[]
  meta?: string
}

const pages = computed<SlidePage[]>(() => {
  const out: SlidePage[] = [{ title: props.title, meta: props.subTitle || '概念讲义' }]
  for (const s of props.sections) {
    out.push({ title: s.title ?? s.key, md: s.md })
  }
  if (props.works?.length) out.push({ title: '相关著作', works: props.works })
  return out
})

const index = ref(0)
function prev(): void {
  if (index.value > 0) index.value--
}
function next(): void {
  if (index.value < pages.value.length - 1) index.value++
}
function toggleFullscreen(): void {
  const el = document.querySelector('.lesson-slides') as HTMLElement | null
  if (!el) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void el.requestFullscreen()
}
</script>

<style scoped lang="scss">
.lesson-slides {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.slides-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);

  .slides-count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .slides-nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.slides-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 28px;
  background:
    radial-gradient(circle at 20% 10%, rgba(64, 158, 255, 0.08), transparent 40%),
    radial-gradient(circle at 80% 90%, rgba(103, 194, 58, 0.06), transparent 40%),
    var(--el-fill-color-lighter);
  overflow: auto;
}

.slide {
  width: 100%;
  max-width: 880px;
  min-height: 62vh;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

// 封面
.cover-title {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  padding: 24px;
  text-align: center;
}
.cover-sub,
.cover-meta {
  padding: 0 24px 26px;
  text-align: center;
  font-size: 16px;
  color: var(--el-text-color-secondary);
}
.cover-meta {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

// 内容页
.slide-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 14px 22px 8px;
  border-bottom: 2px solid var(--el-color-primary);
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.08), transparent);
  h3 {
    margin: 0;
    font-size: 18px;
    color: var(--el-text-color-primary);
  }
  .slide-idx {
    font-size: 12px;
    color: var(--el-color-primary);
    font-weight: 600;
  }
}

.slide-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 22px 20px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
}

.works-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
}
.work-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  .work-title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .work-meta {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 3px;
  }
  .work-note {
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    margin-top: 4px;
  }
}
</style>
