<template>
  <div class="tab-bar" v-if="tabList.length > 1">
    <div class="tab-list" ref="tabListRef">
      <div
        v-for="tab in tabList"
        :key="tab.path"
        class="tab-item"
        :class="{ active: tab.path === activeTabPath }"
        @click="handleClick(tab)"
        @contextmenu.prevent="showContextMenu($event, tab)"
      >
        <span class="tab-title">{{ tab.title }}</span>
        <el-icon
          v-if="tab.closable"
          class="tab-close"
          @click.stop="handleClose(tab)"
        >
          <Close />
        </el-icon>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-show="contextMenuVisible"
        class="tab-context-menu"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      >
        <div class="menu-item" @click="handleCloseOther">
          <el-icon><Close /></el-icon>
          <span>关闭其他</span>
        </div>
        <div class="menu-item" @click="handleCloseRight">
          <el-icon><DArrowRight /></el-icon>
          <span>关闭右侧</span>
        </div>
        <div class="menu-item" @click="handleCloseAll">
          <el-icon><CircleClose /></el-icon>
          <span>关闭所有</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Close, DArrowRight, CircleClose } from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'
import type { TabItem } from '@/stores/tabs'

const router = useRouter()
const tabsStore = useTabsStore()

const tabListRef = ref<HTMLElement | null>(null)

// 计算属性
const tabList = computed(() => tabsStore.tabList)
const activeTabPath = computed(() => tabsStore.activeTabPath)

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const selectedTab = ref<TabItem | null>(null)

// 点击标签
function handleClick(tab: TabItem) {
  if (tab.path !== activeTabPath.value) {
    tabsStore.setActiveTab(tab.path)
    router.push(tab.path)
  }
}

// 关闭标签
function handleClose(tab: TabItem) {
  const nextPath = tabsStore.closeTab(tab.path)
  if (nextPath && nextPath !== router.currentRoute.value.path) {
    router.push(nextPath)
  }
}

// 显示右键菜单
function showContextMenu(e: MouseEvent, tab: TabItem) {
  if (!tab.closable) return

  selectedTab.value = tab
  contextMenuX.value = e.clientX
  contextMenuY.value = e.clientY
  contextMenuVisible.value = true
}

// 关闭其他标签
function handleCloseOther() {
  if (!selectedTab.value) return
  tabsStore.closeOtherTabs(selectedTab.value.path)
  if (router.currentRoute.value.path !== selectedTab.value.path) {
    router.push(selectedTab.value.path)
  }
  hideContextMenu()
}

// 关闭右侧标签
function handleCloseRight() {
  if (!selectedTab.value) return
  tabsStore.closeRightTabs(selectedTab.value.path)
  hideContextMenu()
}

// 关闭所有标签
function handleCloseAll() {
  const nextPath = tabsStore.closeAllTabs()
  if (router.currentRoute.value.path !== nextPath) {
    router.push(nextPath)
  }
  hideContextMenu()
}

// 隐藏右键菜单
function hideContextMenu() {
  contextMenuVisible.value = false
  selectedTab.value = null
}

// 点击其他地方关闭菜单
function handleDocumentClick() {
  hideContextMenu()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style lang="scss" scoped>
.tab-bar {
  height: 36px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.tab-list {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  flex: 1;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--fill-color-blank);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  user-select: none;

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
    color: var(--color-primary);

    .tab-title {
      font-weight: 500;
    }
  }

  .tab-title {
    font-size: 13px;
    color: var(--text-color-regular);
  }

  .tab-close {
    font-size: 12px;
    color: var(--text-color-placeholder);
    border-radius: 50%;
    padding: 2px;
    transition: all 0.2s ease;

    &:hover {
      background: var(--color-danger-light-7);
      color: var(--color-danger);
    }
  }
}

.tab-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  box-shadow: var(--box-shadow-light);
  padding: 4px 0;
  min-width: 120px;

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--text-color-regular);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--fill-color-light);
      color: var(--color-primary);
    }

    .el-icon {
      font-size: 14px;
    }
  }
}
</style>