<template>
  <div class="markdown-viewer">
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
 *              注意：接入 AI 生成内容前需给 Viewer 配 sanitize（原型数据可信暂缺）。
 */
import { shallowRef, onMounted, type Component } from 'vue'
// CSS 静态副作用引入：随本组件 chunk 懒加载（组件本身已动态 import），且对 typecheck 友好
import 'bytemd/dist/index.css'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.css'

defineProps<{
  md: string
}>()

const viewerComp = shallowRef<Component | null>(null)
const plugins = shallowRef<unknown[]>([])

function loadViewer(): void {
  Promise.all([
    import('@bytemd/vue-next'),
    import('@bytemd/plugin-gfm'),
    import('@bytemd/plugin-highlight'),
    import('@bytemd/plugin-frontmatter'),
    import('@bytemd/plugin-math'),
    import('@bytemd/plugin-mermaid'),
  ]).then(([bytemd, gfm, highlight, frontmatter, math, mermaid]) => {
    plugins.value = [
      gfm.default(),
      highlight.default(),
      frontmatter.default(),
      math.default(),
      mermaid.default(),
    ]
    // 模块形态因构建互操作而异：ESM 命名导出或 CJS default 挂载，二者兜底
    const mod = bytemd as unknown as { Viewer?: Component; default?: { Viewer: Component } }
    viewerComp.value = mod.Viewer ?? mod.default?.Viewer ?? null
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
