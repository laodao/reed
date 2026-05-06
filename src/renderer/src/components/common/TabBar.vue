<template>
  <div class="tab-bar">
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

    <!-- FU5-A6 主题切换按钮（auto / light / dark 三态轮换） -->
    <div class="tab-actions theme-switcher">
      <button
        class="theme-toggle-btn"
        type="button"
        :title="themeTitle"
        :aria-label="themeTitle"
        @click="onCycleTheme"
      >
        <el-icon class="theme-icon">
          <Sunny v-if="settings.theme === 'light'" />
          <Moon v-else-if="settings.theme === 'dark'" />
          <Monitor v-else />
        </el-icon>
      </button>
    </div>

    <!-- 用户菜单（仅 Web 端，且已登录） -->
    <div v-if="showUserMenu" class="tab-actions">
      <el-dropdown trigger="click" placement="bottom-end">
        <button
          class="user-menu-trigger"
          type="button"
          data-test="user-menu-trigger"
          aria-label="用户菜单"
        >
          <el-icon class="user-menu-icon"><User /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-menu-header">
              <div class="user-menu-name">
                {{ currentUser!.displayName || currentUser!.email }}
              </div>
              <div v-if="currentUser!.displayName" class="user-menu-email">
                {{ currentUser!.email }}
              </div>
            </div>
            <el-dropdown-item
              divided
              data-test="user-menu-logout"
              @click="handleLogout"
            >
              <el-icon><SwitchButton /></el-icon>
              <span>注销</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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
import {
  Close,
  DArrowRight,
  CircleClose,
  User,
  SwitchButton,
  Sunny,
  Moon,
  Monitor,
} from '@element-plus/icons-vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()

const themeTitle = computed(() => {
  if (settings.theme === 'light') return '主题：浅色（点击切到深色）'
  if (settings.theme === 'dark') return '主题：深色（点击切到自动）'
  return `主题：自动（当前${settings.isDark ? '深色' : '浅色'}，点击切到浅色）`
})

async function onCycleTheme(): Promise<void> {
  const order: ('light' | 'dark' | 'auto')[] = ['light', 'dark', 'auto']
  const idx = order.indexOf(settings.theme as any)
  const next = order[(idx + 1) % order.length]
  await settings.setTheme(next)
}
import { ElMessage, ElMessageBox } from 'element-plus'
import { useTabsStore } from '@/stores/tabs'
import { useUserStore } from '@/stores/user'
import type { TabItem } from '@/stores/tabs'

const router = useRouter()
const tabsStore = useTabsStore()
const userStore = useUserStore()

const tabListRef = ref<HTMLElement | null>(null)

// 计算属性
const tabList = computed(() => tabsStore.tabList)
const activeTabPath = computed(() => tabsStore.activeTabPath)

// 用户菜单：仅 Web 端 + 已登录
const isWebPlatform = computed(() => {
  if (typeof window === 'undefined') return false
  return window.__APP_PLATFORM__ === 'web'
})
const currentUser = computed(() => userStore.user)
const showUserMenu = computed(() => isWebPlatform.value && !!currentUser.value)

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

// 注销（Web 端用户菜单触发）
async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要注销当前账号吗？', '注销确认', {
      confirmButtonText: '注销',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    const resp = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    if (!resp.ok) {
      ElMessage.error(`注销失败 (${resp.status})`)
      return
    }
  } catch (e) {
    ElMessage.error(`注销失败：${(e as Error).message}`)
    return
  }
  ElMessage.success('已注销')
  // main-web.ts 的 checkAuthOrShowLogin 会回到登录门
  window.location.reload()
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
  height: 40px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
  display: flex;
  align-items: center;
  padding: 0 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.tab-list {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  flex: 1;
  height: 100%;
  padding: 6px 0;

  // 隐藏滚动条，但保留滚动功能
  scrollbar-width: none; // Firefox
  -ms-overflow-style: none; // IE/Edge

  &::-webkit-scrollbar {
    display: none; // Chrome/Safari
  }
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 28px;
  background: var(--fill-color-blank);
  border: 1px solid var(--border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  user-select: none;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 14px;
    background: transparent;
  }

  &:hover {
    background: var(--fill-color-light);
    border-color: var(--border-color);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }

  &.active {
    background: linear-gradient(135deg, var(--color-primary-light-9) 0%, var(--color-primary-light-8) 100%);
    border-color: var(--color-primary-light-5);
    color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(var(--color-primary-rgb), 0.15);

    &::after {
      content: '';
      position: absolute;
      top: -1px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 16px);
      height: 2px;
      background: var(--color-primary);
      border-radius: 0 0 2px 2px;
    }

    .tab-title {
      font-weight: 600;
      color: var(--color-primary);
    }
  }

  .tab-title {
    font-size: 13px;
    color: var(--text-color-regular);
    transition: color 0.2s ease;
  }

  .tab-close {
    font-size: 12px;
    color: var(--text-color-placeholder);
    border-radius: 50%;
    padding: 2px;
    margin-left: 2px;
    transition: all 0.2s ease;
    opacity: 0.6;

    &:hover {
      background: var(--color-danger-light-7);
      color: var(--color-danger);
      opacity: 1;
    }
  }

  &:hover .tab-close {
    opacity: 1;
  }
}

// ==================== 用户菜单（Web 端） ====================

.tab-actions {
  display: flex;
  align-items: center;
  margin-left: 12px;
  flex-shrink: 0;
}

.theme-switcher {
  margin-left: 8px;
}

.theme-toggle-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s ease;
  color: var(--el-text-color-regular);

  &:hover {
    background: var(--el-fill-color-light);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary-light-5);
    outline-offset: 2px;
  }
}

.theme-icon {
  font-size: 18px;
}

.user-menu-trigger {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border-color-lighter);
  background: var(--fill-color-blank);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s ease;

  &:hover {
    background: var(--fill-color-light);
    border-color: var(--color-primary-light-5);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary-light-5);
    outline-offset: 2px;
  }
}

.user-menu-icon {
  font-size: 18px;
  color: var(--text-color-regular);
}

.tab-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 6px 0;
  min-width: 140px;

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--text-color-regular);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--fill-color-light);
      color: var(--color-primary);
    }

    .el-icon {
      font-size: 15px;
    }
  }
}
</style>

<style lang="scss">
// el-dropdown 内容通过 Teleport 出去，scoped 选择器抓不到，
// 所以这一段放在非 scoped style 里。
.user-menu-header {
  padding: 10px 16px;
  min-width: 180px;

  .user-menu-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color-primary);
    line-height: 1.4;
  }
  .user-menu-email {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-top: 2px;
    line-height: 1.4;
  }
}
</style>
