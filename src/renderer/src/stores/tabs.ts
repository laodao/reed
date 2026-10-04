/**
 * 标签页状态管理
 * @module stores/tabs
 *
 * ⚠️ 启动性能红线（2026-09-16 实测）：**不要在 store 初始化时同步读 sessionStorage**。
 * 渲染进程启动后首次同步访问 sessionStorage 会阻塞等待 Chromium 存储后端拉起——本机
 * 实测阻塞 **约 6.0 秒**（同一次启动里普通 IPC 往返 <50ms，说明不是主进程忙）。这段
 * 阻塞发生在 app.mount() 之前（store 在布局组件 setup 中被实例化），用户看到的现象
 * 就是"窗口出来了但界面 6 秒不动"。
 * 因此：先用默认状态渲染，持久化状态在首次绘制之后异步补齐（默认状态=首页单标签，
 * 与「本会话还没打开过任何页面」的语义一致，补齐后标签栏再列出历史标签）。
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

/** 存储后端是否已可用（首次写入/读取完成后置 true，之后按需同步写入） */
let storageReady = false
/** 本次启动是否已安排首次存储访问（防重复排队） */
let firstAccessScheduled = false
/** 首次访问前发生的变更先暂存，待存储可用后落盘一次 */
let pendingState: PersistedState | null = null

/**
 * 首次存储访问的延后时长（ms）。
 *
 * 两个硬约束决定了这里必须用"固定延迟"而不是 rAF/微任务：
 * 1) 唤醒窗口（`show:false` + ready-to-show）在首帧之前处于隐藏状态，Chromium 在隐藏
 *    窗口里**不触发 rAF**——用 rAF 会把首次存储访问挂到首帧之后，与目标正好相反；
 * 2) 首次同步存储访问会长时间阻塞主线程（Chromium 存储后端首次拉起 + 本机 profile
 *    实测约 6s，新 user-data-dir 仅 ~0.1ms，属环境相关），如果在首帧产生前执行，
 *    **首帧会被一起推迟**——实测 setTimeout(0) 仍会把首帧推迟到 6s 之后。
 * 因此给首帧留出足够窗口（挂载完成 → 首次合成）后再做这次访问。
 */
const DEFERRED_STORAGE_DELAY_MS = 1500

function afterFirstPaint(fn: () => void): void {
  if (typeof setTimeout === 'function') setTimeout(fn, DEFERRED_STORAGE_DELAY_MS)
  else fn()
}

/**
 * 安排"本会话第一次存储访问"：读出上次的标签状态并启动后续落盘。
 * 首次访问会阻塞（Chromium 存储后端首次同步拉起，本机实测约 6s），
 * 因此它必须发生在首屏之后；在它完成之前的所有变更只暂存内存。
 *
 * @param apply 把恢复出的状态写回 store
 * @param snapshot 取当前 store 状态（用于恢复后兜底落盘）
 */
function scheduleFirstStorageAccess(
  apply: (state: PersistedState) => void,
  snapshot: () => PersistedState,
): void {
  if (firstAccessScheduled) return
  firstAccessScheduled = true
  afterFirstPaint(() => {
    const restored = ((): PersistedState => {
      try {
        return loadFromStorage()
      } catch {
        // 恢复失败保持默认状态（loadFromStorage 内部已兜底）
        return snapshot()
      }
    })()

    // 启动期（等待首次访问期间）用户可能已经开过标签：这些内存变更必须保留，
    // 否则会被恢复结果覆盖掉。
    const duringBoot = pendingState
    pendingState = null
    storageReady = true

    if (duringBoot) {
      // 只补回恢复结果里没有、而启动期新开过的标签，避免重复
      const known = new Set(restored.tabList.map((t) => t.path))
      for (const tab of duringBoot.tabList) {
        if (!known.has(tab.path)) restored.tabList.push(tab)
      }
      // 启动期用户切过标签则以它为准，否则沿用恢复出的激活项
      if (duringBoot.activeTabPath) restored.activeTabPath = duringBoot.activeTabPath
    }

    apply(restored)
    // 落盘一次完整状态（赋值不产生新引用时 watch 不会触发，这里兜底保证一定持久化）
    saveToStorage(snapshot())
  })
}

export const useTabsStore = defineStore('tabs', () => {
  // 默认状态先渲染；持久化状态在首帧之后异步补齐（见文件头部的性能红线说明）
  const initial = defaultState()

  // 标签页列表
  const tabList = ref<TabItem[]>(initial.tabList)

  // 当前激活的标签路径
  const activeTabPath = ref<string>(initial.activeTabPath)

  // 计算属性：当前激活的标签
  const activeTab = computed(() => {
    return tabList.value.find(tab => tab.path === activeTabPath.value)
  })

  // 持久化：watch 任意一边变化都写回。存储未就绪时只暂存，避免启动期被同步存储阻塞
  watch(
    [tabList, activeTabPath],
    () => {
      const state: PersistedState = { tabList: tabList.value, activeTabPath: activeTabPath.value }
      if (!storageReady) {
        pendingState = state
        return
      }
      saveToStorage(state)
    },
    { deep: true },
  )

  // 首帧后补齐持久化状态：用户已经打开的标签页在此刻回到标签栏。
  // 恢复动作（写 tabList/activeTabPath）会触发上面的 watch 把完整状态落盘一次，
  // 因此不需要手动补写 pendingState（手动补写反而会用旧快照覆盖恢复结果）。
  scheduleFirstStorageAccess(
    (restored) => {
      tabList.value = restored.tabList
      activeTabPath.value = restored.activeTabPath
    },
    () => ({ tabList: tabList.value, activeTabPath: activeTabPath.value }),
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