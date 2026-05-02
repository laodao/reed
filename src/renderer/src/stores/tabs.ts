/**
 * 标签页状态管理
 * @module stores/tabs
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

export interface TabItem {
  /** 路由路径 */
  path: string
  /** 标签名称 */
  title: string
  /** 图标名称 */
  icon?: string
  /** 是否可关闭 */
  closable: boolean
  /** 是否固定 */
  affixed?: boolean
}

const STORAGE_KEY = 'tabs:state:v1'

interface PersistedState {
  tabList: TabItem[]
  activeTabPath: string
}

function defaultState(): PersistedState {
  return {
    tabList: [{ path: '/', title: '首页', closable: false, affixed: true }],
    activeTabPath: '/',
  }
}

function loadFromStorage(): PersistedState {
  try {
    if (typeof sessionStorage === 'undefined') return defaultState()
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<PersistedState> | null
    if (!parsed || !Array.isArray(parsed.tabList) || typeof parsed.activeTabPath !== 'string') {
      return defaultState()
    }
    const tabList = parsed.tabList.filter(
      (t): t is TabItem => !!t && typeof t.path === 'string' && typeof t.title === 'string',
    )
    if (!tabList.some(t => t.path === '/')) {
      tabList.unshift({ path: '/', title: '首页', closable: false, affixed: true })
    }
    const activeTabPath = tabList.some(t => t.path === parsed.activeTabPath)
      ? parsed.activeTabPath
      : '/'
    return { tabList, activeTabPath }
  } catch {
    return defaultState()
  }
}

function saveToStorage(state: PersistedState): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 配额超限或隐私模式，静默
  }
}

export const useTabsStore = defineStore('tabs', () => {
  const restored = loadFromStorage()

  // 标签页列表
  const tabList = ref<TabItem[]>(restored.tabList)

  // 当前激活的标签路径
  const activeTabPath = ref<string>(restored.activeTabPath)

  // 计算属性：当前激活的标签
  const activeTab = computed(() => {
    return tabList.value.find(tab => tab.path === activeTabPath.value)
  })

  // 持久化：watch 任意一边变化都写回
  watch(
    [tabList, activeTabPath],
    () => {
      saveToStorage({ tabList: tabList.value, activeTabPath: activeTabPath.value })
    },
    { deep: true },
  )

  /**
   * 添加标签页
   */
  function addTab(route: RouteLocationNormalized) {
    const path = route.path
    const title = (route.meta?.title as string) || route.name?.toString() || '未命名'

    // 检查是否已存在
    const exists = tabList.value.some(tab => tab.path === path)
    if (!exists) {
      tabList.value.push({
        path,
        title,
        closable: path !== '/' // 首页不可关闭
      })
    }

    // 设置为激活状态
    activeTabPath.value = path
  }

  /**
   * 关闭标签页
   */
  function closeTab(path: string): string | null {
    const index = tabList.value.findIndex(tab => tab.path === path)
    if (index === -1) return null

    const tab = tabList.value[index]
    if (!tab.closable) return null // 不可关闭

    tabList.value.splice(index, 1)

    // 如果关闭的是当前激活的标签，切换到前一个或后一个
    if (activeTabPath.value === path) {
      const newIndex = Math.min(index, tabList.value.length - 1)
      activeTabPath.value = tabList.value[newIndex]?.path || '/'
      return activeTabPath.value
    }

    return null
  }

  /**
   * 关闭其他标签页
   */
  function closeOtherTabs(path: string) {
    tabList.value = tabList.value.filter(tab => tab.path === path || !tab.closable)
    activeTabPath.value = path
  }

  /**
   * 关闭右侧标签页
   */
  function closeRightTabs(path: string) {
    const index = tabList.value.findIndex(tab => tab.path === path)
    if (index === -1) return

    tabList.value = tabList.value.filter((tab, i) => i <= index || !tab.closable)
  }

  /**
   * 关闭所有可关闭的标签页
   */
  function closeAllTabs(): string {
    tabList.value = tabList.value.filter(tab => !tab.closable)
    activeTabPath.value = '/'
    return '/'
  }

  /**
   * 设置当前激活的标签
   */
  function setActiveTab(path: string) {
    activeTabPath.value = path
  }

  /**
   * 根据路由更新标签标题
   */
  function updateTabTitle(path: string, title: string) {
    const tab = tabList.value.find(t => t.path === path)
    if (tab) {
      tab.title = title
    }
  }

  /**
   * 预先添加标签页（带指定标题）
   * 用于在路由跳转前设置正确的标题
   */
  function preloadTab(path: string, title: string) {
    // 检查是否已存在
    const exists = tabList.value.some(tab => tab.path === path)
    if (!exists) {
      tabList.value.push({
        path,
        title,
        closable: path !== '/'
      })
    } else {
      // 如果已存在，更新标题
      const tab = tabList.value.find(t => t.path === path)
      if (tab) {
        tab.title = title
      }
    }

    // 设置为激活状态
    activeTabPath.value = path
  }

  return {
    tabList,
    activeTabPath,
    activeTab,
    addTab,
    closeTab,
    closeOtherTabs,
    closeRightTabs,
    closeAllTabs,
    setActiveTab,
    updateTabTitle,
    preloadTab
  }
})