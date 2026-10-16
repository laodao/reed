<template>
  <div class="markdown-editor-wrapper" ref="rootRef">
    <!-- 重型编辑器加载完成前：轻量占位（只读文本域），保证页面立即可交互 -->
    <div v-if="!heavyComponent" class="editor-loading">
      <textarea
        class="editor-loading-textarea"
        :value="modelValue"
        readonly
        :placeholder="placeholder"
        spellcheck="false"
      />
      <!-- 评审 #102：加载失败可见 + 可重试，不再静默永久只读 -->
      <div v-if="loadFailed" class="editor-load-failed">
        <span>编辑器加载失败，当前为只读模式</span>
        <el-button size="small" type="primary" @click="retryLoad">重试加载</el-button>
      </div>
    </div>

    <!-- 空闲后动态挂载重型编辑器（bytemd 模块按需加载） -->
    <component
      :is="heavyComponent"
      v-else
      ref="heavyRef"
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
import { ElButton } from 'element-plus'
import { scheduleIdleLoad } from '@/utils/lazy-libs'

defineProps<{
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
const heavyRef = ref<any>(null)
const rootRef = ref<HTMLElement | null>(null)
/** 评审 #102：动态 import 失败置 true（占位区显示错误与重试按钮） */
const loadFailed = ref(false)

function loadHeavy(): void {
  import('./MarkdownEditorHeavy.vue')
    .then(m => {
      heavyComponent.value = m.default
      loadFailed.value = false
    })
    .catch(err => {
      console.error('Markdown 编辑器加载失败:', err)
      loadFailed.value = true
    })
}

function retryLoad(): void {
  loadFailed.value = false
  // 重试立即加载（不再等空闲）
  loadHeavy()
}

/**
 * 底层 CodeMirror 实例（转发重型编辑器；写作台疑点高亮挂点）。
 * 轻量占位/加载中返回 null——调用方可用 getFallbackTextarea() 降级。
 */
function getCodemirror(): any | null {
  return heavyRef.value?.getCodemirror?.() ?? null
}

/** 轻量占位 textarea（重型编辑器未加载时的降级定位目标） */
function getFallbackTextarea(): HTMLTextAreaElement | null {
  return rootRef.value?.querySelector('.editor-loading-textarea') ?? null
}

defineExpose({ getCodemirror, getFallbackTextarea })

onMounted(() => {
  scheduleIdleLoad(loadHeavy)
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

  // 评审 #102：加载失败提示条
  .editor-load-failed {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
  }

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
