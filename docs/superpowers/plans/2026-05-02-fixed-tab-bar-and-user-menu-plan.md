# 固定 Tab 栏 + Web 端用户菜单 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab 栏始终显示 + 双端 sessionStorage 持久化 + Web 端 Tab 栏右侧用户菜单（含注销）。

**Architecture:** 扩展 `stores/tabs.ts` 加 sessionStorage hydrate/persist；新建 `stores/user.ts` 承载 Web 端当前用户；`TabBar.vue` 始终渲染并在 Web 端追加 `el-dropdown` 用户菜单；`MainLayout.vue` 移除原侧边栏注销入口；`main-web.ts` + `mount.ts` 启动时把 `/api/auth/me` 结果灌进 user store。

**Tech Stack:** Vue 3 + Pinia + Element Plus + Vitest（store 单测）+ Playwright（Web E2E）

---

## 文件结构

| 路径 | 操作 | 职责 |
|---|---|---|
| `src/renderer/src/stores/user.ts` | **新建** | 当前登录用户 store（仅 Web 设值） |
| `tests/unit/renderer/stores/user.spec.ts` | **新建** | user store 单测 |
| `src/renderer/src/stores/tabs.ts` | 修改 | 增加 sessionStorage hydrate / persist |
| `tests/unit/renderer/stores/tabs.spec.ts` | **新建** | tabs store 持久化单测 |
| `src/renderer/src/components/common/TabBar.vue` | 修改 | 始终显示 + 用户菜单（Web 独显） |
| `src/renderer/src/mount.ts` | 修改 | mountApp 接受 initialUser 参数 |
| `src/renderer/src/main-web.ts` | 修改 | 把 /api/auth/me 的 user 传给 mountApp |
| `src/renderer/src/layouts/MainLayout.vue` | 修改 | 删除侧边栏底部「注销」入口 |
| `tests/e2e/web/01-auth.spec.ts` | 修改 | 注销 e2e 改用 TabBar 用户菜单 trigger |
| `tests/e2e/web/15-tab-bar.spec.ts` | **新建** | Tab 栏始终显示 + 刷新持久化 e2e |

---

## Task 1: 新建 `stores/user.ts` + 单测

**Files:**
- Create: `src/renderer/src/stores/user.ts`
- Test: `tests/unit/renderer/stores/user.spec.ts`

- [ ] **Step 1.1: 写失败的单测**

`tests/unit/renderer/stores/user.spec.ts`

```ts
/**
 * user store 单测
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '../../../../src/renderer/src/stores/user'

describe('stores/user', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始 user 为 null', () => {
    const s = useUserStore()
    expect(s.user).toBeNull()
  })

  it('setUser 后能读到字段', () => {
    const s = useUserStore()
    s.setUser({ id: 'u1', email: 'a@b.com', displayName: 'Alice', role: 'user' })
    expect(s.user).not.toBeNull()
    expect(s.user!.id).toBe('u1')
    expect(s.user!.email).toBe('a@b.com')
    expect(s.user!.displayName).toBe('Alice')
  })

  it('setUser(null) 后回到 null', () => {
    const s = useUserStore()
    s.setUser({ id: 'u1', email: 'a@b.com' })
    s.setUser(null)
    expect(s.user).toBeNull()
  })

  it('clear 等价于 setUser(null)', () => {
    const s = useUserStore()
    s.setUser({ id: 'u1', email: 'a@b.com' })
    s.clear()
    expect(s.user).toBeNull()
  })
})
```

- [ ] **Step 1.2: 跑测试确认失败**

```bash
npx vitest run tests/unit/renderer/stores/user.spec.ts
```

期望：4 个用例全部失败，原因是 `Cannot find module .../user`。

- [ ] **Step 1.3: 写最小实现**

`src/renderer/src/stores/user.ts`

```ts
/**
 * 当前登录用户 store（Web 端使用，Electron 端永远为 null）
 * @module stores/user
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface CurrentUser {
  id: string
  email: string
  displayName?: string | null
  role?: string | null
}

export const useUserStore = defineStore('user', () => {
  const user = ref<CurrentUser | null>(null)

  function setUser(u: CurrentUser | null): void {
    user.value = u
  }

  function clear(): void {
    user.value = null
  }

  return { user, setUser, clear }
})
```

- [ ] **Step 1.4: 跑测试确认通过**

```bash
npx vitest run tests/unit/renderer/stores/user.spec.ts
```

期望：4 passed。

- [ ] **Step 1.5: 提交**

```bash
git add src/renderer/src/stores/user.ts tests/unit/renderer/stores/user.spec.ts
git commit -m "$(cat <<'EOF'
feat(renderer): 新增 user store 承载 Web 端当前用户

仅 Web 端在登录后 setUser；Electron 端从不写入，user 永远 null。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `stores/tabs.ts` 增加 sessionStorage 持久化 + 单测

**Files:**
- Modify: `src/renderer/src/stores/tabs.ts`
- Test: `tests/unit/renderer/stores/tabs.spec.ts`

- [ ] **Step 2.1: 写失败的单测**

`tests/unit/renderer/stores/tabs.spec.ts`

```ts
/**
 * tabs store 持久化单测
 *
 * 验证 sessionStorage hydrate / persist + 边界容错。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const STORAGE_KEY = 'tabs:state:v1'

function createMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size },
  } as Storage
}

async function freshStore(): Promise<typeof import('../../../../src/renderer/src/stores/tabs')> {
  // 清模块缓存，让 store 工厂重新读 sessionStorage
  vi.resetModules()
  return await import('../../../../src/renderer/src/stores/tabs')
}

describe('stores/tabs · 持久化', () => {
  beforeEach(() => {
    ;(globalThis as any).sessionStorage = createMemoryStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete (globalThis as any).sessionStorage
  })

  it('sessionStorage 为空时使用默认 [首页]', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    expect(s.tabList).toHaveLength(1)
    expect(s.tabList[0].path).toBe('/')
    expect(s.activeTabPath).toBe('/')
  })

  it('能从 sessionStorage hydrate 出完整列表与激活项', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/chat', title: 'AI 对话', closable: true },
      ],
      activeTabPath: '/chat',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    expect(s.tabList.map(t => t.path)).toEqual(['/', '/chat'])
    expect(s.activeTabPath).toBe('/chat')
  })

  it('hydrate 数据缺「首页」时自动补回到列表头部', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [{ path: '/chat', title: 'AI 对话', closable: true }],
      activeTabPath: '/chat',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    expect(s.tabList[0].path).toBe('/')
    expect(s.tabList).toHaveLength(2)
  })

  it('hydrate 出来的 activeTabPath 不在列表里时回退到 /', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/chat', title: 'AI 对话', closable: true },
      ],
      activeTabPath: '/nonexistent',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    expect(s.activeTabPath).toBe('/')
  })

  it('sessionStorage JSON 损坏时落回默认值，不抛异常', async () => {
    sessionStorage.setItem(STORAGE_KEY, '{not json')
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    expect(s.tabList).toHaveLength(1)
    expect(s.tabList[0].path).toBe('/')
    expect(s.activeTabPath).toBe('/')
  })

  it('addTab 之后 sessionStorage 同步写入', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    s.addTab({
      path: '/chat', name: 'AI 对话',
      meta: { title: 'AI 对话' }, matched: [],
      fullPath: '/chat', hash: '', params: {}, query: {}, redirectedFrom: null,
    } as any)
    await nextTick()
    const raw = sessionStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.tabList.map((t: any) => t.path)).toEqual(['/', '/chat'])
    expect(parsed.activeTabPath).toBe('/chat')
  })

  it('closeTab 后 sessionStorage 同步更新', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/chat', title: 'AI 对话', closable: true },
      ],
      activeTabPath: '/chat',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    s.closeTab('/chat')
    await nextTick()
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)
    expect(parsed.tabList.map((t: any) => t.path)).toEqual(['/'])
    expect(parsed.activeTabPath).toBe('/')
  })

  it('sessionStorage.setItem 抛错时 store 行为不受影响', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    // 让 setItem 抛错
    ;(globalThis as any).sessionStorage.setItem = () => { throw new Error('quota') }
    expect(() => s.addTab({
      path: '/chat', name: 'AI 对话',
      meta: { title: 'AI 对话' }, matched: [],
      fullPath: '/chat', hash: '', params: {}, query: {}, redirectedFrom: null,
    } as any)).not.toThrow()
    expect(s.tabList.map(t => t.path)).toEqual(['/', '/chat'])
  })
})
```

- [ ] **Step 2.2: 跑测试确认失败**

```bash
npx vitest run tests/unit/renderer/stores/tabs.spec.ts
```

期望：至少前 5 个 hydrate 用例失败（store 当前没有读 sessionStorage 的逻辑），8 个用例里至少 6 个失败。

- [ ] **Step 2.3: 修改 `stores/tabs.ts` 加入 hydrate 与 persist**

完整文件替换为：

```ts
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
```

变更要点：
- 新增 `STORAGE_KEY` / `defaultState` / `loadFromStorage` / `saveToStorage` 四个工具。
- `tabList` 与 `activeTabPath` 的初值改为 `restored.tabList` / `restored.activeTabPath`。
- 新增 `watch([tabList, activeTabPath], ..., { deep: true })`，调用 `saveToStorage`。
- 其余 action 实现 **保持原样**，不改任何方法签名。

- [ ] **Step 2.4: 跑测试确认通过**

```bash
npx vitest run tests/unit/renderer/stores/tabs.spec.ts
```

期望：8 passed。

- [ ] **Step 2.5: 跑全量单测确认无回归**

```bash
npm test -- --run
```

期望：所有原有测试仍 pass，新增的 12 个用例（user 4 + tabs 8）也 pass。

- [ ] **Step 2.6: 提交**

```bash
git add src/renderer/src/stores/tabs.ts tests/unit/renderer/stores/tabs.spec.ts
git commit -m "$(cat <<'EOF'
feat(renderer): tabs store 增加 sessionStorage 持久化

刷新页面保留 Tab 列表和激活项；关闭浏览器/退出应用后回到默认仅
「首页」。Hydrate 时校验：缺首页自动补、activeTabPath 不在列表
则回退 /、JSON 损坏 / 配额异常静默回默认。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `TabBar.vue` 始终显示 + Web 端用户菜单

**Files:**
- Modify: `src/renderer/src/components/common/TabBar.vue`

**说明：** 项目当前没有 Vue 组件单测基础设施（无 `@vue/test-utils` / `jsdom`），本任务的视觉与交互回归交给 Task 6 的 Playwright E2E。本任务仅完成代码修改 + 类型检查。

- [ ] **Step 3.1: 改写 `TabBar.vue` 整体**

完整文件替换为：

```vue
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
} from '@element-plus/icons-vue'
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
```

变更要点：
- 根 div 删除 `v-if="tabList.length > 1"` —— 永远渲染。
- `.tab-list` 后追加 `<div v-if="showUserMenu" class="tab-actions">` 区块。
- 新引入 `User` / `SwitchButton` 图标，`useUserStore`，`ElMessage` / `ElMessageBox`。
- 新增 `currentUser`、`isWebPlatform`、`showUserMenu` 计算属性 + `handleLogout` 方法。
- 新增 `.tab-actions` / `.user-menu-trigger` / `.user-menu-icon` 样式段，及非 scoped 的 `.user-menu-header` 样式。
- 模板中 `currentUser!` 强制非空在 `v-if="showUserMenu"` 守护下安全。

- [ ] **Step 3.2: 类型检查**

```bash
npm run typecheck
```

期望：通过。如果报错，按报错修；常见点：`window.__APP_PLATFORM__` 已在 `mount.ts` 声明 global，应该可识别。

- [ ] **Step 3.3: 提交**

```bash
git add src/renderer/src/components/common/TabBar.vue
git commit -m "$(cat <<'EOF'
feat(renderer): TabBar 始终显示 + Web 端右上角用户菜单

- 删除 tabList.length > 1 才渲染的限制，Tab 栏永远固定
- Web 端 + 已登录时在 Tab 栏最右侧追加用户图标 dropdown
- 下拉项：displayName/email 顶部展示 + 注销
- Electron 端不渲染用户菜单

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `mount.ts` + `main-web.ts` 启动时灌 user store

**Files:**
- Modify: `src/renderer/src/mount.ts`
- Modify: `src/renderer/src/main-web.ts`

- [ ] **Step 4.1: 改 `mount.ts` 接受 initialUser**

完整文件替换为：

```ts
/**
 * Vue 应用挂载（双端共享）
 * @module renderer/mount
 *
 * Electron 入口（main.ts）和 Web 入口（main-web.ts）都从此处取 mountApp，
 * 但本文件 **不含顶层副作用**，纯模块——避免被 import 时即触发挂载。
 */

import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { useUserStore, type CurrentUser } from './stores/user'

import './styles/index.scss'

import { appSettings } from './composables/useAppSettings'

declare global {
  interface Window {
    electronAPI: any
    __APP_PLATFORM__?: 'electron' | 'web'
  }
}

export interface MountOptions {
  /** Web 端启动时已经从 /api/auth/me 拿到的当前用户。Electron 端传 undefined。 */
  initialUser?: CurrentUser | null
}

/**
 * 创建并挂载 Vue 应用
 */
export async function mountApp(opts: MountOptions = {}): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)
  app.use(ElementPlus)
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  // 在挂载前把 initialUser 写入 user store。
  // setActivePinia 让 useStore 可在 setup 之外调用。
  if (opts.initialUser !== undefined) {
    setActivePinia(pinia)
    useUserStore().setUser(opts.initialUser)
  }

  await appSettings.loadSettings()
  app.mount('#app')
}
```

- [ ] **Step 4.2: 改 `main-web.ts` 把 user 传给 mountApp**

完整文件替换为：

```ts
/**
 * Vue 应用入口（Web 端）
 * @module renderer/main-web
 *
 * 仅在 Web 端被使用：vite.config.web.ts 通过 transformIndexHtml 把
 * index.html 中 `/src/main.ts` 的 entry 替换为 `/src/main-web.ts`，从而
 * 把 @web-client 相关的依赖和登录逻辑彻底从 Electron 构建里剔除。
 */

import { mountApp } from './mount'
import { installWebElectronApi } from '@web-client/bridge'
import { mountLoginPage } from '@web-client/login-page'
import type { CurrentUser } from './stores/user'

async function bootstrapWeb(): Promise<void> {
  installWebElectronApi()
  window.__APP_PLATFORM__ = 'web'

  const user = await checkAuthOrShowLogin()
  if (!user) return // 登录页接管，不再 mount Vue

  await mountApp({ initialUser: user })
}

async function checkAuthOrShowLogin(): Promise<CurrentUser | null> {
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' })
    if (resp.ok) {
      const body = await resp.json()
      if (body.ok && body.data) return body.data as CurrentUser
    }
  } catch {
    // 网络失败也走登录门
  }

  mountLoginPage('#app', () => {
    window.location.reload()
  })
  return null
}

bootstrapWeb().catch((err) => {
  console.error('[main-web] bootstrap failed:', err)
})
```

变更要点：
- `checkAuthOrShowLogin` 返回类型由 `Promise<boolean>` 改为 `Promise<CurrentUser | null>`，把 `body.data` 透传出去。
- `bootstrapWeb` 里把拿到的 `user` 透传到 `mountApp({ initialUser: user })`。
- import 加上 `CurrentUser` 类型。

- [ ] **Step 4.3: 类型检查**

```bash
npm run typecheck
```

期望：通过。`src/renderer/src/main.ts`（Electron 入口）调用的是 `mountApp()` 不传参，TS 兼容（`opts` 默认值 `{}`）。

- [ ] **Step 4.4: 跑全量单测确认无回归**

```bash
npm test -- --run
```

期望：全 pass（本任务无新单测，但需要确认前面任务的单测仍 pass）。

- [ ] **Step 4.5: 提交**

```bash
git add src/renderer/src/mount.ts src/renderer/src/main-web.ts
git commit -m "$(cat <<'EOF'
feat(web): 启动时把当前用户灌进 user store

- mountApp 接受 initialUser 可选参数
- main-web.ts 把 /api/auth/me 的 body.data 透传给 mountApp
- Electron 入口不传，user 永远 null

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `MainLayout.vue` 删除侧边栏注销入口

**Files:**
- Modify: `src/renderer/src/layouts/MainLayout.vue`

- [ ] **Step 5.1: 删除模板里 `<li class="nav-item nav-logout">` 整段**

定位 `MainLayout.vue` 中：

```vue
          <!-- 注销（仅 Web 端） -->
          <li
            v-if="isWebPlatform"
            class="nav-item nav-logout"
            data-test="logout-btn"
            @click="handleLogout"
          >
            <div class="nav-item-content">
              <div class="nav-icon-wrapper">
                <SwitchButton class="nav-icon" />
              </div>
              <transition name="slide-fade">
                <span v-if="!isCollapsed" class="nav-label">注销</span>
              </transition>
            </div>
          </li>
```

整段删除。

- [ ] **Step 5.2: 删除 script 里相关代码**

删除以下内容：
1. `import { ElMessage, ElMessageBox } from 'element-plus'` —— **如果其他地方仍在用，保留**；目前 MainLayout.vue 的 `handleLogout` 是唯一使用者，应整行删除。
2. `SwitchButton` 从 `@element-plus/icons-vue` 的 import 列表中移除。
3. `isWebPlatform` 计算属性（包括上方两行注释）整段删除：
   ```ts
   // 仅 Web 端启用注销：Electron 端没有会话概念
   // window.__APP_PLATFORM__ 由 main-web.ts 在 Web 启动时赋值为 'web'
   const isWebPlatform = computed(() => {
     if (typeof window === 'undefined') return false
     return window.__APP_PLATFORM__ === 'web'
   })
   ```
4. `handleLogout` 函数整段删除（约 28 行）。

- [ ] **Step 5.3: 删除 SCSS 里 `.nav-item.nav-logout` 块**

定位并删除：

```scss
// 注销按钮（仅 Web 端显示，强调"危险"动作）
.nav-item.nav-logout {
  &:hover {
    background: rgba(220, 38, 38, 0.12);

    .nav-icon {
      color: #dc2626;
    }
    .nav-label {
      color: #dc2626;
    }
  }
}
```

- [ ] **Step 5.4: 类型检查 + 跑单测**

```bash
npm run typecheck && npm test -- --run
```

期望：均通过。typecheck 报「`isWebPlatform` 已声明但未使用」时说明上一步漏删，按提示补删。

- [ ] **Step 5.5: 提交**

```bash
git add src/renderer/src/layouts/MainLayout.vue
git commit -m "$(cat <<'EOF'
feat(web): 移除侧边栏底部注销入口

注销已搬到 TabBar 右上角的用户菜单，避免双重入口；
同步删除 MainLayout 里的 handleLogout / isWebPlatform / SwitchButton import / nav-logout SCSS。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 更新 / 新增 E2E 测试

**Files:**
- Modify: `tests/e2e/web/01-auth.spec.ts:93-120`（侧边栏注销 → 用户菜单注销）
- Create: `tests/e2e/web/15-tab-bar.spec.ts`（Tab 栏始终显示 + 刷新持久化）

- [ ] **Step 6.1: 改写 `01-auth.spec.ts` 的「侧边栏注销」用例为「用户菜单注销」**

定位现有 93-120 行整段 `test('侧边栏注销按钮点击后回到登录页', ...)`，**整段替换**为：

```ts
  test('TabBar 用户菜单点击注销后回到登录页', async ({ page }) => {
    await loginViaUI(page)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // 侧边栏底部不应再有 logout-btn（已搬到 TabBar 用户菜单）
    await expect(page.locator('[data-test="logout-btn"]')).toHaveCount(0)

    // 点击 TabBar 右上角用户菜单触发器
    const userTrigger = page.locator('[data-test="user-menu-trigger"]')
    await expect(userTrigger).toBeVisible({ timeout: 5_000 })
    await userTrigger.click()

    // 下拉里点「注销」
    const logoutItem = page.locator('[data-test="user-menu-logout"]')
    await expect(logoutItem).toBeVisible({ timeout: 5_000 })
    await logoutItem.click()

    // 确认弹窗
    await expect(page.getByText('确定要注销当前账号吗')).toBeVisible({
      timeout: 5_000,
    })
    await page.getByRole('button', { name: '注销', exact: true }).click()

    // 页面回到登录门
    await expect(page.getByRole('textbox', { name: '邮箱' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('textbox', { name: /密码/ })).toBeVisible()

    // /api/auth/me 应为 401
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/auth/me', { credentials: 'include' })
      return r.status
    })
    expect(status).toBe(401)
  })
```

- [ ] **Step 6.2: 在 `01-auth.spec.ts` 加一条「用户菜单展示当前用户」用例**

在 `test.describe('Web 端 - 认证', () => {` 块**末尾**追加：

```ts
  test('TabBar 用户菜单展示当前用户邮箱', async ({ page }) => {
    await loginViaUI(page)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('[data-test="user-menu-trigger"]').click()
    // 下拉头部应包含当前账号邮箱
    await expect(page.getByText(DEFAULT_USER.email).first()).toBeVisible({
      timeout: 5_000,
    })
  })
```

- [ ] **Step 6.3: 新建 `15-tab-bar.spec.ts`**

`tests/e2e/web/15-tab-bar.spec.ts`

```ts
/**
 * Web 端 E2E - TabBar 始终显示 + 持久化
 */

import { test, expect } from '@playwright/test'
import { loginViaApi, gotoApp, WEB_FRONT_BASE } from './helpers/auth'

test.describe('Web 端 - TabBar', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('登录后 TabBar 始终显示，初始仅「首页」一个 tab', async ({ page }) => {
    await page.goto(WEB_FRONT_BASE)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // .tab-bar 容器存在
    const tabBar = page.locator('.tab-bar')
    await expect(tabBar).toBeVisible()

    // 初始仅一个 tab，title 为「首页」
    const tabs = tabBar.locator('.tab-item')
    await expect(tabs).toHaveCount(1)
    await expect(tabs.first().locator('.tab-title')).toHaveText('首页')
  })

  test('点击侧边栏菜单后 tab 增加，刷新页面后 tab 仍在', async ({ page }) => {
    await page.goto(WEB_FRONT_BASE)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // 进 AI 对话
    await page.getByText('AI 对话', { exact: true }).first().click()
    const tabBar = page.locator('.tab-bar')
    const tabs = tabBar.locator('.tab-item')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(1).locator('.tab-title')).toHaveText('AI 对话')

    // 再进图像生成
    await page.getByText('图像生成', { exact: true }).first().click()
    await expect(tabs).toHaveCount(3)

    // 刷新页面
    await page.reload()
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // tab 应仍是 3 个，且激活的是「图像生成」
    await expect(tabBar.locator('.tab-item')).toHaveCount(3)
    await expect(tabBar.locator('.tab-item.active .tab-title')).toHaveText('图像生成')
  })

  test('关闭 tab 后 sessionStorage 同步更新', async ({ page }) => {
    await gotoApp(page, '/chat')
    const tabBar = page.locator('.tab-bar')
    await expect(tabBar.locator('.tab-item')).toHaveCount(2)

    // 关闭 AI 对话 tab
    const chatTab = tabBar.locator('.tab-item', { hasText: 'AI 对话' })
    await chatTab.locator('.tab-close').click()

    // 刷新后只剩首页
    await page.reload()
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })
    await expect(tabBar.locator('.tab-item')).toHaveCount(1)
    await expect(tabBar.locator('.tab-item').first().locator('.tab-title')).toHaveText('首页')
  })
})
```

- [ ] **Step 6.4: 跑 e2e 测试**

前置：本地 web-server (`:4201`) + vite dev (`:5174`) 已在跑（项目惯例，不由 playwright 启动）。

```bash
npx playwright test --config=playwright.web.config.ts tests/e2e/web/01-auth.spec.ts tests/e2e/web/15-tab-bar.spec.ts
```

期望：全部 pass。如果只有某些用例失败，按报错修；常见问题：
- 用户菜单 dropdown 因为 Teleport，CSS 选择器抓不到 → 用 `data-test="user-menu-logout"` 即可。
- `loginViaApi` 注入 cookie 后页面 reload 才生效，在测试里务必先 loginViaApi 再 page.goto。

- [ ] **Step 6.5: 跑全量回归（最小集）**

```bash
npm test -- --run
npm run typecheck
```

期望：均通过。

- [ ] **Step 6.6: 提交**

```bash
git add tests/e2e/web/01-auth.spec.ts tests/e2e/web/15-tab-bar.spec.ts
git commit -m "$(cat <<'EOF'
test(web/e2e): 用户菜单注销 + TabBar 持久化覆盖

- 01-auth：侧边栏 logout-btn 不应再存在；改用 TabBar
  user-menu-trigger → user-menu-logout 路径注销
- 01-auth：新增「用户菜单展示当前用户邮箱」
- 15-tab-bar（新）：TabBar 始终显示、刷新后 tab 列表与激活项保留、
  关闭 tab 后 sessionStorage 同步更新

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 验收清单

实现完成后逐条手测确认（Web + Electron 双端）：

**Web 端（在浏览器里）**
- [ ] 登录后看到固定 Tab 栏，初始仅「首页」一个不可关闭 tab。
- [ ] 点击左侧若干菜单后 tab 累加；F5 刷新，tab 列表与激活项保留。
- [ ] 关闭浏览器 tab 重新打开 URL（同 origin），tab 回到只有「首页」。
- [ ] Tab 栏右侧出现圆形用户图标。
- [ ] 点击图标弹出下拉：上半部分显示 displayName 或 email；分隔线；下半部分「注销」。
- [ ] 点「注销」→ 确认 → 回到登录门；侧边栏不再出现「注销」按钮。

**Electron 端（启动 PC 应用）**
- [ ] 启动后看到 Tab 栏，初始仅「首页」。
- [ ] 累加 tab 后 F5 刷新（开发模式）保留。
- [ ] 退出应用重开，tab 回到「首页」。
- [ ] Tab 栏右侧**没有**用户图标。
- [ ] 侧边栏底部**没有**「注销」按钮。

