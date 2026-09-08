<template>
  <div ref="wrapperRef" class="markdown-viewer">
    <!-- bytemd 只读渲染：懒加载（模块求值较重，避免阻塞首开） -->
    <component :is="viewerComp" v-if="viewerComp" :value="md" :plugins="plugins" />
    <el-skeleton v-else :rows="6" animated />
  </div>
</template>

<script setup lang="ts">
/**
 * 只读 Markdown 渲染（bytemd Viewer 封装，惰性加载）
 * @module views/domain-learning/MarkdownViewer
 * @description 讲义渲染用（图文 / mermaid / 表格 / 公式）。bytemd 模块较重，
 *              故懒加载，避免阻塞页面首开。
 */
import { ref, shallowRef, onMounted } from 'vue'

const props = defineProps<{
  md: string
}>()

const wrapperRef = ref<HTMLElement | null>(null)
const viewerComp = shallowRef<any>(null)
const plugins = shallowRef<any[]>([])

function loadViewer(): void {
  Promise.all([
    import('@bytemd/vue-next'),
    import('@bytemd/plugin-gfm'),
    import('@bytemd/plugin-highlight'),
    import('@bytemd/plugin-frontmatter'),
    import('@bytemd/plugin-math'),
    import('@bytemd/plugin-mermaid'),
    import('bytemd/dist/index.css'),
    import('highlight.js/styles/github.css'),
    import('katex/dist/katex.css'),
  ]).then(([bytemd, gfm, highlight, frontmatter, math, mermaid]) => {
    plugins.value = [
      gfm.default(),
      highlight.default(),
      frontmatter.default(),
      math.default(),
      mermaid.default(),
    ]
    viewerComp.value = bytemd.Viewer
  })
}

onMounted(loadViewer)
</script>

<style scoped>
.markdown-viewer {
  :deep(img) {
    max-width: 100%;
  }
  :deep(.bytemd) {
    height: auto;
    border: none;
  }
  :deep(.bytemd-preview) {
    background: transparent;
  }
}
</style>
