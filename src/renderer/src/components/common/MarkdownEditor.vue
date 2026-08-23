<template>
  <div class="markdown-editor-wrapper">
    <!-- 重型编辑器加载完成前：轻量占位（只读文本域），保证页面立即可交互 -->
    <div v-if="!heavyComponent" class="editor-loading">
      <textarea
        class="editor-loading-textarea"
        :value="modelValue"
        readonly
        :placeholder="placeholder"
        spellcheck="false"
      />
    </div>

    <!-- 空闲后动态挂载重型编辑器（bytemd 模块按需加载） -->
    <component
      :is="heavyComponent"
      v-else
      :model-value="modelValue"
      :placeholder="placeholder"
      :height="height"
      :mode="mode"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Markdown 编辑器（轻壳版）
 * @module components/common/MarkdownEditor
 *
 * 性能：bytemd + CodeMirror 模块求值实测约 580ms，若静态 import 会阻塞日记/长文页首开。
 * 本组件只渲染轻量占位，浏览器空闲时（requestIdleCallback）才动态加载 MarkdownEditorHeavy，
 * 让页面先渲染可交互，编辑器随后无缝替换。
 */
import { ref, shallowRef, onMounted, type Component } from 'vue'
import { scheduleIdleLoad } from '@/utils/lazy-libs'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  height?: string
  mode?: 'split' | 'tab'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

/**
 * 重型编辑器组件（动态加载，null = 尚未加载完成）
 */
const heavyComponent = shallowRef<Component | null>(null)

onMounted(() => {
  scheduleIdleLoad(() => {
    // 动态加载重型编辑器，加载完成后替换占位
    import('./MarkdownEditorHeavy.vue')
      .then(m => {
        heavyComponent.value = m.default
      })
      .catch(err => {
        console.error('Markdown 编辑器加载失败:', err)
        // 加载失败时保持占位（只读文本域），不阻塞页面
      })
  })
})
</script>

<style lang="scss">
.markdown-editor-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;

  // 占位：样式与真实编辑器接近，避免页面"空一块"
  .editor-loading {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color-light);
    border-radius: 8px;
    background: var(--bg-color);
    overflow: hidden;

    .editor-loading-textarea {
      flex: 1;
      min-height: 0;
      width: 100%;
      border: none;
      outline: none;
      resize: none;
      padding: 12px 16px;
      font-family: var(--el-font-family, inherit);
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-color-primary);
      background: transparent;
      box-sizing: border-box;
      white-space: pre-wrap;
      overflow-y: auto;
    }
  }
}
</style>
