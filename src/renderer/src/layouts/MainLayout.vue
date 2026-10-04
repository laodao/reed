<template>
  <div class="main-layout" :data-theme="currentTheme">
    <!-- 侧边栏：纯图标模式，悬停显示菜单名 tooltip -->
    <aside class="sidebar">
      <!-- Logo 区域 -->
      <div class="sidebar-header">
        <div class="logo-mini">
          <div class="logo-icon-mini">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="14" fill="url(#logoGradientMini)" />
              <path d="M10 16L14 20L22 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <defs>
                <linearGradient id="logoGradientMini" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:var(--color-primary-light)"/>
                  <stop offset="100%" style="stop-color:var(--color-primary-dark)"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      <!-- 导航菜单（平铺：父项 + 子项都是独立图标项；含 children 的项悬停弹二级浮层） -->
      <nav class="sidebar-nav">
        <div class="nav-section">
          <ul class="nav-list">
            <li
              v-for="item in flatMenuItems"
              :key="item.path"
              class="nav-item"
              :class="{ active: isActiveMenuItem(item) }"
              @click="navigateTo(item.path)"
              @mouseenter="openSubmenuFlyout(item, $event)"
              @mouseleave="scheduleCloseSubmenu()"
            >
              <el-tooltip
                :content="item.label"
                placement="right"
                :show-after="300"
                :disabled="!!item.children?.length"
              >
                <div class="nav-item-content">
                  <div class="nav-icon-wrapper">
                    <component :is="item.icon" class="nav-icon" />
                    <div v-if="isActiveMenuItem(item)" class="nav-glow"></div>
                  </div>
                  <transition name="indicator">
                    <div v-if="isActiveMenuItem(item)" class="nav-indicator"></div>
                  </transition>
                </div>
              </el-tooltip>
            </li>
          </ul>
        </div>
      </nav>

      <!-- 二级菜单悬停浮层（teleport 到 body 防侧边栏裁切；2026-09-24 设定资产库入口） -->
      <teleport to="body">
        <div
          v-if="submenuFlyout"
          class="nav-submenu-flyout"
          :style="{ top: `${submenuFlyout.top}px`, left: `${submenuFlyout.left}px` }"
          @mouseenter="keepSubmenuAlive()"
          @mouseleave="scheduleCloseSubmenu()"
        >
          <div class="nav-submenu-title">{{ submenuFlyout.item.label }}</div>
          <div
            v-for="child in submenuFlyout.item.children"
            :key="child.path"
            class="nav-submenu-item"
            :class="{ active: currentRoute === child.path }"
            @click="navigateTo(child.path); closeSubmenuNow()"
          >
            <component :is="child.icon" class="nav-submenu-icon" />
            <span>{{ child.label }}</span>
          </div>
        </div>
      </teleport>

      <!-- 底部菜单 -->
      <div class="sidebar-footer">
        <ul class="nav-list">
          <li
            v-for="item in footerMenuItems"
            :key="item.path"
            class="nav-item"
            :class="{ active: currentRoute === item.path }"
            @click="navigateTo(item.path)"
          >
            <el-tooltip
              :content="item.label"
              placement="right"
              :show-after="300"
            >
              <div class="nav-item-content">
                <div class="nav-icon-wrapper">
                  <component :is="item.icon" class="nav-icon" />
                  <div v-if="currentRoute === item.path" class="nav-glow"></div>
                </div>
              </div>
            </el-tooltip>
          </li>
        </ul>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 标签页栏 -->
      <TabBar />

      <!--
        FU6-T7 修复进入剧集页白屏：原 transition mode="out-in" + keep-alive
        包裹 dynamic import 路由时存在竞态，首次切换 EpisodeWorkbench 时
        leave 完成但 enter 未触发，page-container 渲染为空注释节点。改成
        直接 :key=route.path 重建组件，去掉 transition / keep-alive 包装。
      -->
      <div class="page-container" id="page-container">
        <router-view v-slot="{ Component, route }">
          <keep-alive :include="cachedViews">
            <component :is="Component" :key="route.path" />
          </keep-alive>
        </router-view>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useSkin } from '@/composables/useSkin'
import { useTabsStore } from '@/stores/tabs'
import { useWorkflowStore } from '@/stores/workflow'
import TabBar from '@/components/common/TabBar.vue'
import {
  mainMenuItems,
  footerMenuItems,
  flattenMenuItems,
  type MenuItem
} from '@/config/menu'

const route = useRoute()
const router = useRouter()
const { currentTheme } = useTheme()
// 皮肤（data-skin）启动加载与持久化由 useSkin 负责
useSkin()
const tabsStore = useTabsStore()
// 全局工作流事件订阅：任何页面都能收到运行状态 / 待审核通知（不再依赖进入详情页）。
// 通知展示统一走右上角通知中心（TabBar 铃铛），实时弹窗由 workflow store 负责。
const wfStore = useWorkflowStore()

onMounted(() => {
  wfStore.subscribe()
})
onUnmounted(() => {
  wfStore.unsubscribeAll()
})

/**
 * 需要缓存的页面组件名（对应各页面 defineOptions({ name })）。
 * 由路由表 meta.keepAlive 驱动 —— 在 router/index.ts 给页面加 keepAlive: true 即可缓存，
 * 不再手写组件名清单（历史上清单与组件 name 漂移，导致 keep-alive 静默失效、切换变慢）。
 */
const cachedViews = computed<string[]>(() =>
  router
    .getRoutes()
    .filter(r => r.meta?.keepAlive && r.name)
    .map(r => String(r.name))
)

const currentRoute = computed(() => route.path)

/**
 * 平铺菜单（来自共享数据源 @/config/menu）：
 * 父项 + 子项都作为独立图标项渲染，hidden/hideSelf 过滤规则见该模块。
 * 侧边栏为纯图标模式（无展开功能），子菜单若不平铺将不可达。
 */
const flatMenuItems = computed<MenuItem[]>(() => flattenMenuItems(mainMenuItems))

/**
 * 二级菜单悬停浮层（hover flyout）：菜单项含 children 时，悬停在其右侧弹出子菜单。
 * 关闭走 180ms 延迟——鼠标跨过图标与浮层之间的间隙不闪断；浮层自身 mouseenter 续命。
 */
const submenuFlyout = ref<{ item: MenuItem; top: number; left: number } | null>(null)
let submenuCloseTimer: ReturnType<typeof setTimeout> | null = null

const isActiveMenuItem = (item: MenuItem): boolean => {
  if (currentRoute.value === item.path) return true
  return !!item.children?.some(c => c.path === currentRoute.value)
}

const openSubmenuFlyout = (item: MenuItem, evt: MouseEvent) => {
  if (!item.children?.length) {
    closeSubmenuNow()
    return
  }
  if (submenuCloseTimer) {
    clearTimeout(submenuCloseTimer)
    submenuCloseTimer = null
  }
  const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect()
  submenuFlyout.value = { item, top: rect.top, left: rect.right + 8 }
}

const scheduleCloseSubmenu = () => {
  if (submenuCloseTimer) clearTimeout(submenuCloseTimer)
  submenuCloseTimer = setTimeout(() => {
    submenuFlyout.value = null
    submenuCloseTimer = null
  }, 180)
}

const keepSubmenuAlive = () => {
  if (submenuCloseTimer) {
    clearTimeout(submenuCloseTimer)
    submenuCloseTimer = null
  }
}

const closeSubmenuNow = () => {
  if (submenuCloseTimer) {
    clearTimeout(submenuCloseTimer)
    submenuCloseTimer = null
  }
  submenuFlyout.value = null
}

const navigateTo = (path: string) => {
  router.push(path)
}

// 监听路由变化，添加标签页
watch(
  () => route.path,
  (path) => {
    // 标题统一走 route.meta.title（第三处硬编码 pathTitleMap 已随包架构改造废弃——
    // 历史上它与 route.meta.title 双写漂移；所有现存路由均已带 meta.title，
    // 业务包动态注册的路由也自带 meta.title）
    const title = (route.meta?.title as string) || '未命名'
    tabsStore.addTab({
      path,
      name: title,
      meta: { title },
      matched: [],
      fullPath: path,
      hash: '',
      params: {},
      query: {},
      redirectedFrom: null
    } as any)
  },
  { immediate: true }
)
</script>

<style lang="scss" scoped>
.main-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-color-page);
}

// ==================== 侧边栏样式（纯图标模式，固定窄宽） ====================

.sidebar {
  width: var(--sidebar-collapsed-width);
  height: 100%;
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;

  // 玻璃效果背景
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--sidebar-glass);
    backdrop-filter: blur(10px);
    pointer-events: none;
  }
}

.sidebar-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  position: relative;
  z-index: 1;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo-mini {
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-icon-mini {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-glow);
  animation: glow-pulse 3s ease-in-out infinite;

  svg {
    width: 100%;
    height: 100%;
  }
}

// ==================== 导航菜单样式 ====================

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
  position: relative;
  z-index: 1;

  // 自定义滚动条
  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-full);
  }
}

.nav-section {
  padding: 0 8px;
}

.nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  margin: 4px 0;
  cursor: pointer;
  transition: all var(--transition-fast);

  // 注意：不要在这里用 :deep(.el-tooltip__trigger) 设 display ——
  // tooltip trigger 就是 .nav-item-content 本身，display:block 会以更高优先级
  // 覆盖 .nav-item-content 的 flex 居中，导致图标偏左。
  // 撑满 li 的需求由 .nav-item-content 自身的 width:100% 实现。

  &.active {
    .nav-item-content {
      background: var(--sidebar-item-active-bg);
      box-shadow: var(--sidebar-item-active-shadow);
    }

    .nav-icon {
      color: #fff;
      transform: scale(1.1);
    }
  }

  &:not(.active):hover {
    .nav-item-content {
      background: var(--sidebar-item-hover-bg);
    }

    .nav-icon {
      color: rgba(255, 255, 255, 0.9);
    }
  }
}

.nav-submenu-flyout {
  position: fixed;
  z-index: 3000;
  min-width: 168px;
  padding: 6px;
  background: var(--sidebar-item-active-bg, #2a2a35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

.nav-submenu-title {
  padding: 6px 10px 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.nav-submenu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 6px);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition-fast, 0.15s);

  &:hover {
    background: var(--sidebar-item-hover-bg, rgba(255, 255, 255, 0.08));
  }

  &.active {
    background: var(--sidebar-item-active-bg, rgba(255, 255, 255, 0.14));
    color: #fff;
  }
}

.nav-submenu-icon {
  width: 15px;
  height: 15px;
}

.nav-item-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px 0;
  border-radius: var(--radius-md);
  position: relative;
  transition: all var(--transition-normal);
}

.nav-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.nav-icon {
  width: 20px;
  height: 20px;
  color: var(--sidebar-text);
  transition: all var(--transition-normal);
}

.nav-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  background: radial-gradient(circle, var(--color-glow) 0%, transparent 70%);
  border-radius: 50%;
  animation: glow-pulse 2s ease-in-out infinite;
  pointer-events: none;
}

.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 24px;
  background: #fff;
  border-radius: 0 var(--radius-full) var(--radius-full) 0;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

// ==================== 底部菜单 ====================

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--sidebar-footer-border);
  position: relative;
  z-index: 1;
}

// ==================== 主内容区 ====================

.main-content {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--bg-color-page) 0%, var(--color-accent-light) 100%);
}

.page-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;

  // 让 Element Plus 对话框遮罩层点击穿透，使侧边栏和tab栏可操作
  :deep(.el-overlay) {
    position: absolute !important;
    inset: 0;
    pointer-events: none;

    // 对话框、消息框需要可交互 + 居中
    .el-dialog,
    .el-message-box {
      pointer-events: auto;
      position: absolute !important;
      margin: 0 !important;
      // 水平和垂直居中
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%);
    }
    // 抽屉（Drawer）保持自身方向定位（direction="rtl" 贴右 / ttb 贴顶），
    // 不做居中——否则 el-drawer 会被上面的 translate(-50%,-50%) 顶成居中弹窗。
    // 只重置居中用的 top/left/transform，保留 right/bottom 让 .el-drawer.rtl 等方向类生效。
    .el-drawer {
      pointer-events: auto;
      position: absolute !important;
      margin: 0 !important;
      top: auto !important;
      left: auto !important;
      transform: none !important;
    }
  }
}

// ==================== 过渡动画 ====================

// 指示器动画
.indicator-enter-active {
  animation: indicator-in 0.3s ease-out;
}

.indicator-leave-active {
  animation: indicator-in 0.2s ease-in reverse;
}

@keyframes indicator-in {
  from {
    opacity: 0;
    height: 0;
  }
  to {
    opacity: 1;
    height: 24px;
  }
}

</style>
