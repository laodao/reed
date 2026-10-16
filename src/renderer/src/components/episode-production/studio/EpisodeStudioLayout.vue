<template>
  <div class="ep-studio-layout">
    <!-- 页面内工具条（可选 slot：左标题 + 右操作按钮） -->
    <div v-if="$slots.toolbar" class="layout-toolbar">
      <slot name="toolbar" />
    </div>

    <!-- 三段式主体：左 + 中 + 右 -->
    <div class="layout-body">
      <aside v-if="$slots.left" class="layout-left">
        <slot name="left" />
      </aside>

      <main class="layout-center">
        <slot />
      </main>

      <aside class="layout-right" :class="{ collapsed: !agentVisible }">
        <!-- Agent 面板（默认展开，可折叠到图钉） -->
        <div v-if="agentVisible" class="agent-wrap">
          <slot name="agent" />
        </div>
        <button v-else class="agent-expand" title="展开助手" @click="agentVisible = true">
          <el-icon><DArrowLeft /></el-icon>
        </button>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 剧集制作 · 三段式业务布局容器。
 * 只负责栅格（左固定宽 / 中 flex / 右 agent 面板），不写业务。
 * - 默认有 agent 面板（右侧），可折叠到图钉。
 * - 左侧树/列表（slot left）与中央工作区（default slot）由业务页提供。
 */
import { ref, watch } from 'vue'
import { DArrowLeft } from '@element-plus/icons-vue'

// 折叠状态记忆（localStorage）
const STORAGE_KEY = 'ep-studio:agent-collapsed'
const agentVisible = ref(localStorage.getItem(STORAGE_KEY) !== '1')

function persist(): void {
  localStorage.setItem(STORAGE_KEY, agentVisible.value ? '0' : '1')
}

// 监听折叠变化持久化
watch(agentVisible, persist)
</script>

<style lang="scss" scoped>
.ep-studio-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-color-page);
}

.layout-toolbar {
  flex-shrink: 0;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  padding: 8px 16px;
}

.layout-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.layout-left {
  width: 250px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  min-height: 0;
  overflow-y: auto;
}

.layout-center {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.layout-right {
  position: relative;
  width: 360px;
  flex-shrink: 0;
  min-height: 0;
  transition: width var(--transition-normal);
  border-left: 1px solid var(--border-color-lighter);
  display: flex;
  flex-direction: column;

  &.collapsed {
    width: 40px;
    background: var(--bg-color);
    overflow: hidden;
  }

  .agent-expand {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-color);
    border: 1px solid var(--border-color-light);
    border-radius: 8px;
    color: var(--text-color-secondary);
    cursor: pointer;
    padding: 6px 8px;
    &:hover { color: var(--color-primary); }
  }

  .agent-wrap {
    /* 绝对定位占满右侧槽位，彻底解除 height 链不确定性 */
    position: absolute;
    inset: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}
</style>
