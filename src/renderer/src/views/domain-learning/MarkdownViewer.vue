<template>
  <div class="markdown-viewer">
    <!-- bytemd 只读渲染：懒加载（模块求值较重，避免阻塞首开）；sanitize 传 schema 变更器 -->
    <component :is="viewerComp" v-if="viewerComp" :value="md" :plugins="plugins" :sanitize="extendSanitizeSchema" />
    <el-skeleton v-else :rows="6" animated />
  </div>
</template>

<script setup lang="ts">
/**
 * 只读 Markdown 渲染（bytemd Viewer 封装，惰性加载）
 * @module views/domain-learning/MarkdownViewer
 * @description 讲义渲染用（图文 / mermaid / 表格 / 公式）。bytemd 模块较重，
 *              故懒加载，避免阻塞页面首开。讲义内容来自研究 Agent（联网/KB/模型产出）。
 *
 * 安全与渲染（2026-09-12 修复）：
 * - bytemd 的 `sanitize` 是 **hast schema 变更器**（`(schema) => schema`），不是
 *   「HTML 字符串消毒器」。此前误传 `(html: string) => string`（DOMPurify），
 *   schema 被替换成字符串，hast-util-sanitize 的 `Object.assign` 丢掉 bytemd 追加的
 *   `className` 白名单 → 所有 class 被剥离 → plugin-math/plugin-mermaid 的
 *   viewerEffect 查不到 `.math.math-inline` / `code.language-mermaid` 锚点，
 *   公式与图表都不渲染。现在按契约传 schema 变更器。
 * - XSS 防线仍是 rehype-sanitize 的 GitHub 默认白名单（script / 事件属性 /
 *   javascript: 协议一律丢弃），由 `extendSanitizeSchema` 显式保住 className 后继续生效。
 */
import { shallowRef, onMounted, type Component } from 'vue'
import { extendSanitizeSchema } from '@/utils/markdown-sanitize-schema'
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

<style scoped lang="scss">
// 讲义正文排版（章节层级/首行缩进/列表缩进/表格边框…）集中在此文件，便于契约测试守护
@use './lesson-markdown.scss';

.markdown-viewer {
  :deep(.bytemd) {
    height: auto;
    border: none;
  }
  :deep(.bytemd-preview) {
    background: transparent;
    padding: 0;
  }
}
</style>
