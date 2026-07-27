<template>
  <div class="main-layout" :data-theme="currentTheme">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <!-- Logo 区域 -->
      <div class="sidebar-header">
        <transition name="logo-fade" mode="out-in">
          <div v-if="!isCollapsed" class="logo" key="full">
            <div class="logo-icon">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="url(#logoGradient)" />
                <path d="M10 16L14 20L22 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                  <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:var(--color-primary-light)"/>
                    <stop offset="100%" style="stop-color:var(--color-primary-dark)"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span class="logo-text gradient-text">The Bot</span>
          </div>
          <div v-else class="logo-mini" key="mini">
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
        </transition>
        <el-button
          class="collapse-btn"
          :icon="isCollapsed ? Expand : Fold"
          circle
          @click="toggleCollapse"
        />
      </div>

      <!-- 导航菜单 -->
      <nav class="sidebar-nav">
        <div class="nav-section">
          <ul class="nav-list">
            <template v-for="item in mainMenuItems" :key="item.path">
              <!-- 普通项（无子菜单） -->
              <li
                v-if="!item.children || item.children.length === 0"
                class="nav-item"
                :class="{ active: isItemActive(item) }"
                @click="navigateTo(item.path)"
              >
                <el-tooltip
                  :content="item.label"
                  placement="right"
                  :show-after="300"
                  :disabled="!isCollapsed"
                >
                  <div class="nav-item-content">
                    <div class="nav-icon-wrapper">
                      <component :is="item.icon" class="nav-icon" />
                      <div v-if="isItemActive(item)" class="nav-glow"></div>
                    </div>
                    <transition name="slide-fade">
                      <span v-if="!isCollapsed" class="nav-label">{{ item.label }}</span>
                    </transition>
                    <transition name="indicator">
                      <div v-if="isItemActive(item)" class="nav-indicator"></div>
                    </transition>
                  </div>
                </el-tooltip>
              </li>

              <!-- 父项（带子菜单），点击展开 / 收起 -->
              <template v-else>
                <li
                  class="nav-item"
                  :class="{ active: isItemActive(item) || isAnyChildActive(item) }"
                  @click="onParentClick(item)"
                >
                  <el-tooltip
                    :content="item.label"
                    placement="right"
                    :show-after="300"
                    :disabled="!isCollapsed"
                  >
                    <div class="nav-item-content">
                      <div class="nav-icon-wrapper">
                        <component :is="item.icon" class="nav-icon" />
                        <div
                          v-if="isItemActive(item) || isAnyChildActive(item)"
                          class="nav-glow"
                        ></div>
                      </div>
                      <transition name="slide-fade">
                        <span v-if="!isCollapsed" class="nav-label">{{ item.label }}</span>
                      </transition>
                      <el-icon
                        v-if="!isCollapsed"
                        class="nav-caret"
                        :class="{ 'is-open': expandedMenus.has(item.path) }"
                      >
                        <ArrowRight />
                      </el-icon>
                    </div>
                  </el-tooltip>
                </li>
                <!-- 子菜单 -->
                <li
                  v-for="sub in item.children"
                  v-show="!isCollapsed && expandedMenus.has(item.path)"
                  :key="sub.path"
                  class="nav-item nav-sub-item"
                  :class="{ active: currentRoute === sub.path }"
                  @click.stop="navigateTo(sub.path)"
                >
                  <div class="nav-item-content">
                    <div class="nav-icon-wrapper">
                      <component :is="sub.icon" class="nav-icon" />
                      <div v-if="currentRoute === sub.path" class="nav-glow"></div>
                    </div>
                    <span class="nav-label">{{ sub.label }}</span>
                    <transition name="indicator">
                      <div v-if="currentRoute === sub.path" class="nav-indicator"></div>
                    </transition>
                  </div>
                </li>
              </template>
            </template>
          </ul>
        </div>
      </nav>

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
              :disabled="!isCollapsed"
            >
              <div class="nav-item-content">
                <div class="nav-icon-wrapper">
                  <component :is="item.icon" class="nav-icon" />
                  <div v-if="currentRoute === item.path" class="nav-glow"></div>
                </div>
                <transition name="slide-fade">
                  <span v-if="!isCollapsed" class="nav-label">{{ item.label }}</span>
                </transition>
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
          <component :is="Component" :key="route.path" />
        </router-view>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  HomeFilled,
  ChatDotRound,
  Picture,
  Document,
  Microphone,
  Headset,
  MagicStick,
  Setting,
  Expand,
  Fold,
  FolderOpened,
  User,
  EditPen,
  Notebook,
  VideoCamera,
  ArrowRight,
  Promotion,
} from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { useSkin } from '@/composables/useSkin'
import { useTabsStore } from '@/stores/tabs'
import TabBar from '@/components/common/TabBar.vue'

const route = useRoute()
const router = useRouter()
const { currentTheme } = useTheme()
// 皮肤（data-skin）启动加载与持久化由 useSkin 负责
useSkin()
const tabsStore = useTabsStore()

// 默认折叠：只显示 icon，悬停显示菜单名 tooltip
const isCollapsed = ref(true)
const pageTransition = ref('slide-fade')
// 需要缓存的页面组件名称（对应 defineOptions 中的 name）
const cachedViews = ['Home', 'Chat', 'StoryEditor', 'CommentEditor', 'Settings']

// 主菜单项
const mainMenuItems = [
  {
    path: '/',
    label: '首页',
    icon: markRaw(HomeFilled)
  },
  {
    path: '/chat',
    label: 'AI 对话',
    icon: markRaw(ChatDotRound)
  },
  {
    path: '/image',
    label: '图像生成',
    icon: markRaw(Picture)
  },
  {
    path: '/portrait',
    label: '人像设计',
    icon: markRaw(User)
  },
  {
    path: '/longwriting',
    label: '长文写作',
    icon: markRaw(EditPen)
  },
  {
    path: '/episode-production',
    label: '剧集制作',
    icon: markRaw(VideoCamera)
  },
  {
    path: '/translate',
    label: '文档翻译',
    icon: markRaw(Document)
  },
  {
    path: '/voice',
    label: '语音助手',
    icon: markRaw(Microphone),
    children: [
      {
        path: '/voice/tts',
        label: '文本转语音',
        icon: markRaw(Promotion),
      },
      {
        path: '/voice/stt',
        label: '语音转文本',
        icon: markRaw(Headset),
      },
      {
        path: '/voice/clone',
        label: '声音复刻',
        icon: markRaw(MagicStick),
      },
    ],
  },
  {
    path: '/knowledge-base',
    label: '知识库',
    icon: markRaw(FolderOpened)
  },
  {
    path: '/diary',
    label: '日记',
    icon: markRaw(Notebook)
  }
]

// 底部菜单项
const footerMenuItems = [
  {
    path: '/settings',
    label: '设置',
    icon: markRaw(Setting)
  }
]

const currentRoute = computed(() => route.path)

/**
 * 子菜单展开状态。
 * 默认：当前路由命中某父项的子菜单时，对应父项展开（mount 后 watch 路由维护）。
 */
const expandedMenus = ref<Set<string>>(new Set())

interface MenuItem {
  path: string
  label: string
  icon: any
  children?: MenuItem[]
}

function isItemActive(item: MenuItem): boolean {
  return currentRoute.value === item.path
}

function isAnyChildActive(item: MenuItem): boolean {
  if (!item.children) return false
  return item.children.some((c) => currentRoute.value === c.path)
}

/**
 * 父项点击：
 * - 无 children：直接导航
 * - 有 children 且当前折叠：先展开侧边栏，再展开该父项子菜单（折叠态下点击父项无可见效果，需展开）
 * - 有 children 且已展开：切换子菜单展开 / 收起（不导航，避免触发 redirect）
 */
function onParentClick(item: MenuItem): void {
  if (!item.children || item.children.length === 0) {
    router.push(item.path)
    return
  }
  if (isCollapsed.value) {
    isCollapsed.value = false
    expandedMenus.value.add(item.path)
    return
  }
  if (expandedMenus.value.has(item.path)) {
    expandedMenus.value.delete(item.path)
  } else {
    expandedMenus.value.add(item.path)
  }
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const navigateTo = (path: string) => {
  router.push(path)
}

// 路由路径到标题的映射
const pathTitleMap: Record<string, string> = {
  '/': '首页',
  '/chat': 'AI 对话',
  '/image': '图像生成',
  '/portrait': '人像设计',
  '/longwriting': '长文写作',
  '/diary': '日记',
  '/episode-production': '剧集制作',
  '/translate': '文档翻译',
  '/voice': '语音助手',
  '/voice/tts': '文本转语音',
  '/voice/stt': '语音转文本',
  '/voice/clone': '声音复刻',
  '/knowledge-base': '知识库',
  '/portrait/geometry': '面容分析',
  '/assistant': '智能助手',
  '/settings': '设置'
}

// 监听路由变化，添加标签页 + 自动展开父菜单
watch(
  () => route.path,
  (path) => {
    const title = pathTitleMap[path] || '未命名'
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

    // 子路由 → 父菜单自动展开（避免用户进 /voice/tts 时父项是收起的）
    for (const item of mainMenuItems) {
      if (item.children && item.children.some((c) => c.path === path)) {
        expandedMenus.value.add(item.path)
      }
    }
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

// ==================== 侧边栏样式 ====================

.sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  transition: width var(--transition-smooth);
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

  &.collapsed {
    width: var(--sidebar-collapsed-width);

    .sidebar-header {
      justify-content: center;
      padding: 12px 8px;
    }
  }
}

.sidebar-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  position: relative;
  z-index: 1;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon,
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

.logo-text {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.8) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.logo-mini {
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-btn {
  background: rgba(255, 255, 255, 0.1) !important;
  border: none !important;
  color: rgba(255, 255, 255, 0.9) !important;
  transition: all var(--transition-normal);

  &:hover {
    background: rgba(255, 255, 255, 0.2) !important;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
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

  // el-tooltip 触发器包裹层：撑满 li，保证 hover 区与背景一致
  :deep(.el-tooltip__trigger) {
    display: block;
    width: 100%;
  }

  &.active {
    .nav-item-content {
      background: var(--sidebar-item-active-bg);
      box-shadow: var(--sidebar-item-active-shadow);
    }

    .nav-icon {
      color: #fff;
      transform: scale(1.1);
    }

    .nav-label {
      color: #fff;
      font-weight: 600;
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

.nav-item-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  position: relative;
  transition: all var(--transition-normal);
}

/* 子菜单缩进 + 字号略小 */
.nav-sub-item {
  margin-left: 8px;

  .nav-item-content {
    padding: 9px 14px;
    padding-left: 20px;
  }

  .nav-icon {
    width: 16px;
    height: 16px;
  }

  .nav-label {
    font-size: 13px;
  }
}

/* 父项展开箭头：默认朝右；展开时旋转 90° 朝下 */
.nav-caret {
  margin-left: auto;
  width: 12px;
  height: 12px;
  color: rgba(255, 255, 255, 0.55);
  transition: transform var(--transition-fast);

  &.is-open {
    transform: rotate(90deg);
  }
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

.nav-label {
  color: var(--sidebar-text);
  font-size: 14px;
  white-space: nowrap;
  transition: all var(--transition-normal);
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

    // 对话框、抽屉等需要可交互
    .el-dialog,
    .el-drawer,
    .el-message-box {
      pointer-events: auto;
      position: absolute !important;
      margin: 0 !important;
      // 水平和垂直居中
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%);
    }
  }
}

// ==================== 过渡动画 ====================

// Logo 过渡
.logo-fade-enter-active,
.logo-fade-leave-active {
  transition: all 0.3s ease;
}

.logo-fade-enter-from,
.logo-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

// 文字滑入滑出
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

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

// 页面过渡
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
