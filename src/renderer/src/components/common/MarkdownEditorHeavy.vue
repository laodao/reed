<template>
  <div class="markdown-editor-heavy" ref="wrapperRef">
    <Editor
      ref="editorRef"
      class="editor-component"
      :value="modelValue"
      :plugins="plugins"
      :locale="locale"
      :mode="mode"
      :placeholder="placeholder"
      @change="handleChange"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 重型 Markdown 编辑器（bytemd + CodeMirror + 各插件）
 * @module components/common/MarkdownEditorHeavy
 *
 * 本组件由 MarkdownEditor.vue 在浏览器空闲时动态加载：
 * bytemd 模块求值实测约 580ms，若随页面静态加载会阻塞日记/长文页首开。
 * 不要在其他地方静态 import 本组件。
 */
import { ref, onMounted, nextTick, watch } from 'vue'
import { Editor } from '@bytemd/vue-next'
import type { BytemdPlugin } from 'bytemd'
import { toImageUrl } from '@/utils/asset-url'
import gfm from '@bytemd/plugin-gfm'
import highlight from '@bytemd/plugin-highlight'
import frontmatter from '@bytemd/plugin-frontmatter'
import math from '@bytemd/plugin-math'
import mermaid from '@bytemd/plugin-mermaid'
import 'bytemd/dist/index.css'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.css'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  height?: string
  mode?: 'split' | 'tab'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const wrapperRef = ref<HTMLElement | null>(null)
const editorRef = ref<any>(null)

// 插件配置
/**
 * 预览图片 src 转换：markdown 里相对路径的本地图片（如日记附件 diary/...）
 * 按当前端协议重写（Electron local-image:// / Web /assets/）。
 * 已是 http(s)、data、blob、local-* 协议或 /assets/ 开头的 src 原样保留（toImageUrl 规则）。
 */
const imageSrcPlugin: BytemdPlugin = {
  viewerEffect({ markdownBody }: { markdownBody: HTMLElement }) {
    markdownBody.querySelectorAll('img').forEach((img) => {
      const raw = img.getAttribute('src') || ''
      const converted = toImageUrl(raw)
      if (converted && converted !== raw) img.setAttribute('src', converted)
    })
  },
}

const plugins: BytemdPlugin[] = [
  gfm(),
  imageSrcPlugin,
  highlight(),
  frontmatter(),
  math(),
  mermaid()
]

// 中文语言包
const locale = {
  write: '编写',
  preview: '预览'
}

function handleChange(value: string) {
  emit('update:modelValue', value)
}

/**
 * 底层 CodeMirror 5 实例（一致性疑点编辑器高亮挂点）。
 * CM5 会把实例挂到 .CodeMirror wrapper 元素的 CodeMirror 属性上——不依赖
 * bytemd 暴露 API。未挂载/加载中返回 null，调用方自行降级。
 */
function getCodemirror(): any | null {
  const cmEl = wrapperRef.value?.querySelector('.CodeMirror') as any
  return cmEl?.CodeMirror ?? null
}

defineExpose({ getCodemirror })

// 隐藏不需要的工具栏按钮
function hideUnwantedButtons() {
  nextTick(() => {
    if (!wrapperRef.value) return

    // 隐藏 source 图标（跳转 GitHub）
    const sourceLinks = wrapperRef.value.querySelectorAll('.bytemd-toolbar-right a[title="Source"], .bytemd-toolbar-right a[href*="github"]')
    sourceLinks.forEach((el: Element) => {
      (el as HTMLElement).style.display = 'none'
    })
  })
}

onMounted(() => {
  hideUnwantedButtons()
})

// 监听编辑器内容变化，重新隐藏按钮
watch(() => props.modelValue, () => {
  hideUnwantedButtons()
})
</script>

<style lang="scss">
.markdown-editor-heavy {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;

  .editor-component {
    flex: 1;
    min-height: 0;
    min-width: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .bytemd {
    flex: 1;
    min-height: 0;
    min-width: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color-light);
    border-radius: 8px;

    .bytemd-toolbar {
      border-bottom: 1px solid var(--border-color-lighter);
      background: var(--fill-color-lighter);
      border-radius: 8px 8px 0 0;
      flex-shrink: 0;
    }

    .bytemd-editor {
      background: var(--bg-color);
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .bytemd-status {
      border-top: 1px solid var(--border-color-lighter);
      background: var(--fill-color-lighter);
      flex-shrink: 0;
    }

    // 编辑器文本区域
    .CodeMirror {
      background: var(--bg-color);
      color: var(--text-color-primary);
      height: 100% !important;
      flex: 1;
      min-height: 0;
      overflow: hidden;

      .CodeMirror-scroll {
        overflow-y: auto !important;
        overflow-x: auto !important;
      }

      .CodeMirror-gutters {
        background: var(--fill-color-lighter);
        border-right: 1px solid var(--border-color-lighter);
      }

      .CodeMirror-linenumber {
        color: var(--text-color-placeholder);
      }
    }

    // 预览区域
    .bytemd-preview {
      background: var(--bg-color);
      padding: 16px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;

      // Markdown 样式
      h1, h2, h3, h4, h5, h6 {
        color: var(--text-color-primary);
        margin-top: 24px;
        margin-bottom: 16px;
        font-weight: 600;
        line-height: 1.25;
      }

      h1 { font-size: 2em; border-bottom: 1px solid var(--border-color-lighter); padding-bottom: .3em; }
      h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-color-lighter); padding-bottom: .3em; }
      h3 { font-size: 1.25em; }
      h4 { font-size: 1em; }

      p {
        margin-bottom: 16px;
        line-height: 1.8;
        color: var(--text-color-primary);
      }

      blockquote {
        border-left: 4px solid var(--color-primary);
        padding: 0 1em;
        color: var(--text-color-secondary);
        margin: 0 0 16px 0;
      }

      code {
        background: var(--fill-color-light);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-size: 85%;
      }

      pre {
        background: var(--fill-color-lighter);
        padding: 16px;
        border-radius: 6px;
        overflow-x: auto;
        margin-bottom: 16px;

        code {
          background: transparent;
          padding: 0;
        }
      }

      ul, ol {
        padding-left: 2em;
        margin-bottom: 16px;
      }

      li {
        margin-bottom: 4px;
        line-height: 1.6;
      }

      table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 16px;

        th, td {
          border: 1px solid var(--border-color-light);
          padding: 8px 12px;
        }

        th {
          background: var(--fill-color-lighter);
          font-weight: 600;
        }

        tr:nth-child(2n) {
          background: var(--fill-color-lighter);
        }
      }

      hr {
        border: none;
        border-top: 1px solid var(--border-color-lighter);
        margin: 24px 0;
      }

      img {
        max-width: 100%;
        border-radius: 4px;
      }

      a {
        color: var(--color-primary);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    // 确保编辑区域正确填充
    .bytemd-body {
      flex: 1;
      min-height: 0;
      display: flex;

      > * {
        flex: 1;
        min-height: 0;
      }
    }
  }
}
</style>
