# 固定 Tab 栏 + Web 端用户菜单 设计

- 日期：2026-05-02
- 范围：双端（Electron + Web）+ Web 端独有的右上角用户菜单
- 影响文件：`src/renderer/src/components/common/TabBar.vue`、`src/renderer/src/stores/tabs.ts`、`src/renderer/src/layouts/MainLayout.vue`、`src/renderer/src/main-web.ts`，新增 `src/renderer/src/stores/user.ts`

## 1. 背景

当前 Tab 栏只有在 `tabList.length > 1` 时才渲染，导致进入应用看不到 Tab 栏，只有点击左侧菜单加出第二个 Tab 后才出现。同时刷新页面后 Tab Store 没有持久化，恢复成只有「首页」，再被 `MainLayout.vue` 的路由 watch 补一个当前路由，结果用户感知到「除了首页和当前页，其他 Tab 都丢了」。

Web 端目前的「注销」入口在侧边栏底部，与左侧导航视觉上同一组，不够显眼，也不符合现代 Web 应用「右上角用户菜单」的惯例。

## 2. 目标

1. Tab 栏始终固定显示在主内容区顶部，默认就只有「首页」一个 Tab，双端一致。
2. 刷新页面后，Tab 列表和当前激活 Tab 完整保留；关闭浏览器/退出 Electron 应用后回到只有「首页」。
3. Web 端在 Tab 栏最右侧增加用户头像 icon，点击展开下拉菜单：顶部展示「displayName / email」，分隔线，下方一个「注销」动作。Electron 端不显示。
4. Web 端侧边栏底部原有的「注销」入口移除，避免双重入口。

## 3. 非目标

- 不引入 `pinia-plugin-persistedstate` 或类似插件，持久化逻辑就在 `tabs.ts` 内部 15 行内完成。
- 不做用户头像图片上传/展示，icon 用 `@element-plus/icons-vue` 的 `User` 即可。
- 不做用户菜单里的「个人设置」「主题切换」等扩展项；本期只「显示用户信息 + 注销」。
- 不修改 Tab 的关闭/右键菜单/标题更新等已有逻辑。
- 不调整 PC 端的注销路径（PC 端原本也没有注销概念，无需处理）。

## 4. 架构与数据流

### 4.1 模块边界

```
┌─────────────────────────────────────┐
│ main-web.ts                         │
│  checkAuthOrShowLogin               │
│  ├─ /api/auth/me ──> body.data ──┐  │
│  └─ mountApp                     │  │
└──────────────────────────────────┼──┘
                                   ▼
                         ┌──────────────────┐
                         │ stores/user.ts   │  (Web 独享，PC 不 setUser)
                         │  user, setUser,  │
                         │  clear           │
                         └────────┬─────────┘
                                  │
┌─────────────────────────────────┼────────────┐
│ MainLayout.vue                  │            │
│  ├─ <aside>                     │            │
│  │   └─ 侧边栏 (注销入口已移除) │            │
│  └─ <main>                      │            │
│      ├─ <TabBar/> ──────────────▼            │
│      │   ├─ tab-list  ◄── stores/tabs.ts     │
│      │   └─ tab-actions (Web 独显)           │
│      │       └─ el-dropdown(User icon)       │
│      └─ <router-view/>                       │
└──────────────────────────────────────────────┘
                                  │
                          ┌───────▼────────────┐
                          │ stores/tabs.ts     │
                          │  tabList,          │
                          │  activeTabPath,    │
                          │  + sessionStorage  │
                          │    hydrate/persist │
                          └────────────────────┘
```

### 4.2 启动数据流（Web）

1. `main-web.ts` 调 `/api/auth/me`，原本 `body.ok` 为 true 仅返回 `true`，`body.data` 被丢。
2. 改为：成功时取 `body.data`，先 `mountApp()`，挂载完成后再向 Pinia 提交 `useUserStore().setUser(data)` —— 也可以在 `mountApp` 内部完成。
3. `App.vue` / `MainLayout.vue` 渲染时，`TabBar` 通过 `useUserStore()` 拿到当前用户，决定下拉菜单标题区显示什么。

### 4.3 启动数据流（PC）

1. `main.ts` 走原有路径，从不调用 `setUser`，`useUserStore().user` 始终为 null。
2. `TabBar` 中 `tab-actions` 的渲染条件 `isWebPlatform && user` 不成立，根本不渲染下拉。
3. `tabs.ts` 的 hydrate / persist 逻辑双端共用 sessionStorage（Electron 渲染进程同样支持）。

## 5. 详细设计

### 5.1 `stores/tabs.ts` —— 增加持久化

**新增常量**
```ts
const STORAGE_KEY = 'tabs:state:v1'
```

**新增 hydrate 逻辑**：在 `defineStore` 工厂内、定义 `tabList` / `activeTabPath` 之前读 sessionStorage。

```ts
function loadFromStorage(): { tabList: TabItem[]; activeTabPath: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.tabList) || typeof parsed.activeTabPath !== 'string') {
      return null
    }
    // 保证首页恒在
    if (!parsed.tabList.some((t: TabItem) => t.path === '/')) {
      parsed.tabList.unshift({ path: '/', title: '首页', closable: false, affixed: true })
    }
    // 保证 activeTabPath 在列表中
    if (!parsed.tabList.some((t: TabItem) => t.path === parsed.activeTabPath)) {
      parsed.activeTabPath = '/'
    }
    return parsed
  } catch {
    return null
  }
}
```

**初值变化**

```ts
const restored = loadFromStorage()
const tabList = ref<TabItem[]>(restored?.tabList ?? [
  { path: '/', title: '首页', closable: false, affixed: true }
])
const activeTabPath = ref<string>(restored?.activeTabPath ?? '/')
```

**新增 persist watch**

```ts
watch([tabList, activeTabPath], () => {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabList: tabList.value, activeTabPath: activeTabPath.value })
    )
  } catch {
    // 配额超限或隐私模式，静默
  }
}, { deep: true })
```

**为什么校验首页恒在 / activeTabPath 在列表里**：sessionStorage 数据可能因为代码升级 schema 改变而变脏；这个最小校验保证「即使 hydrate 失败，也不会让 UI 进入坏状态」。

### 5.2 `stores/user.ts` —— 新文件

```ts
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

  function setUser(u: CurrentUser | null) {
    user.value = u
  }

  function clear() {
    user.value = null
  }

  return { user, setUser, clear }
})
```

无持久化，每次启动从 `/api/auth/me` 重新拿（cookie 鉴权已经做了这件事）。

### 5.3 `main-web.ts` —— 把 me 结果灌进 store

`checkAuthOrShowLogin` 当前丢掉了 `body.data`。改为返回它：

```ts
async function checkAuthOrShowLogin(): Promise<CurrentUser | null> {
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' })
    if (resp.ok) {
      const body = await resp.json()
      if (body.ok && body.data) return body.data as CurrentUser
    }
  } catch { /* ... */ }
  mountLoginPage('#app', () => window.location.reload())
  return null
}
```

`bootstrapWeb` 改为：

```ts
const user = await checkAuthOrShowLogin()
if (!user) return
await mountApp()
useUserStore().setUser(user)
```

`useUserStore` 必须在 `mountApp()` 之后调用 —— 因为 Pinia 实例是在 `mountApp` 内部 `app.use(pinia)` 注册的。

> 备选实现：把 `setUser` 调用塞进 `mount.ts` 的 `mountApp(initialUser?: CurrentUser)` 参数。哪种实现成本更低留给 plan 阶段决定，对外行为一致。

### 5.4 `components/common/TabBar.vue`

**模板修改**

1. 删除 `v-if="tabList.length > 1"`，根 div 始终渲染。
2. 在 `.tab-list` 后追加 `.tab-actions`：

```vue
<div v-if="showUserMenu" class="tab-actions">
  <el-dropdown trigger="click" placement="bottom-end">
    <button class="user-menu-trigger" type="button" data-test="user-menu-trigger">
      <el-icon class="user-menu-icon"><User /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <div class="user-menu-header">
          <div class="user-menu-name">{{ user.displayName || user.email }}</div>
          <div v-if="user.displayName" class="user-menu-email">{{ user.email }}</div>
        </div>
        <el-dropdown-item divided @click="handleLogout" data-test="user-menu-logout">
          <el-icon><SwitchButton /></el-icon>
          <span>注销</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</div>
```

**Script 增量**

```ts
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, SwitchButton } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const user = computed(() => userStore.user)
const isWebPlatform = computed(() =>
  typeof window !== 'undefined' && window.__APP_PLATFORM__ === 'web'
)
const showUserMenu = computed(() => isWebPlatform.value && !!user.value)

async function handleLogout() {
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
    const resp = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    if (!resp.ok) {
      ElMessage.error(`注销失败 (${resp.status})`)
      return
    }
  } catch (e) {
    ElMessage.error(`注销失败：${(e as Error).message}`)
    return
  }
  ElMessage.success('已注销')
  window.location.reload()
}
```

**布局 SCSS（增量）**

```scss
.tab-bar {
  /* 已有 */
  display: flex;
}

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
  transition: all 0.2s ease;

  &:hover {
    background: var(--fill-color-light);
    border-color: var(--color-primary-light-5);
  }
}

.user-menu-icon {
  font-size: 18px;
  color: var(--text-color-regular);
}
```

**用户菜单头部样式**（放在全局或者 `:deep`，因为 `el-dropdown-menu` 内容通过 Teleport 出去）：

```scss
:deep(.user-menu-header) {
  padding: 10px 16px;
  min-width: 180px;

  .user-menu-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color-primary);
  }
  .user-menu-email {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-top: 2px;
  }
}
```

### 5.5 `layouts/MainLayout.vue` —— 删除侧边栏注销

1. 删除模板里 `<li v-if="isWebPlatform" class="nav-item nav-logout">` 整段（约 94-110 行）。
2. 删除 SCSS 里 `.nav-item.nav-logout` 块（约 554-566 行）。
3. 删除脚本里 `handleLogout` 函数 + `ElMessage` / `ElMessageBox` / `SwitchButton` 的 import（搬到 TabBar 里去）。
4. 保留 `isWebPlatform` 计算属性？— 不再被模板使用，连同 `window.__APP_PLATFORM__` 的注释一起删除。
5. `tabsStore` 仍被 watch 使用，保留。

## 6. 边界情况

| 情况 | 行为 |
|------|------|
| Tab 列表只有「首页」 | Tab 栏仍显示，只渲染一个不可关闭的「首页」 tab |
| sessionStorage hydrate 失败/格式不合法 | 回退到默认 `[首页]` |
| hydrate 出来的 activeTabPath 不在列表里 | 强制回到 `/` |
| hydrate 出来的列表缺「首页」 | 自动 unshift 一个首页 |
| Web 端 `/api/auth/me` 拿不到 user | `mountLoginPage` 接管，根本不进入主界面 |
| Electron 端 | `setUser` 永远不调用，`showUserMenu` 为 false，Tab 栏右侧无用户菜单 |
| 注销失败（网络错误 / 401） | ElMessage.error 提示，不 reload，留在原页面 |
| 用户多 Tab 浏览器同时打开 Web | 每个浏览器 tab 独立 sessionStorage，互不影响（符合 1A 选择） |

## 7. 测试策略

### 单元测试 — `stores/tabs.test.ts`
- hydrate：sessionStorage 为空 → 默认 `[首页]`，activeTabPath = `/`。
- hydrate：sessionStorage 有合法数据 → 完整恢复。
- hydrate：sessionStorage 数据缺「首页」 → 自动补回。
- hydrate：sessionStorage 数据 activeTabPath 不在列表 → 回退 `/`。
- hydrate：sessionStorage JSON 损坏 → 默认初值，无抛错。
- persist：addTab/closeTab/setActiveTab 后 sessionStorage 内容同步。
- 边界：sessionStorage.setItem 抛错（mock 配额） → store 行为正常，无抛错冒泡。

### 单元测试 — `stores/user.test.ts`
- 初始 user 为 null。
- setUser 后能读到；clear 后回到 null。

### 组件测试 — `TabBar.test.ts`
- 列表只有 1 个时仍渲染 Tab 栏。
- `__APP_PLATFORM__ !== 'web'` 时 `data-test="user-menu-trigger"` 不存在。
- `__APP_PLATFORM__ === 'web'` 且 user 为 null 时 trigger 不渲染。
- Web + 有 user 时 trigger 渲染；点击展开后能找到 displayName/email；`data-test="user-menu-logout"` 存在。
- 点击注销弹出确认框，确认后调用 `/api/auth/logout`（fetch mock）。

### E2E（Playwright Web）
- 登录后看到 Tab 栏，初始仅「首页」。
- 点击左侧菜单跳到「AI 对话」，Tab 栏出现两个 tab。
- 浏览器刷新，Tab 栏仍是两个 tab，激活项保留。
- 关闭浏览器 tab，重开同 URL，Tab 栏回到只有「首页」。
- 点击右上角用户图标，下拉菜单显示当前用户 email；点「注销」→ 确认 → 回到登录页。
- 侧边栏底部不再有「注销」按钮。

### 手测（Electron PC）
- 启动后看到 Tab 栏，初始仅「首页」。
- 多点几个菜单加 Tab；F5 刷新（开发模式）后 Tab 仍在。
- 退出应用重开，Tab 回到只有「首页」。
- Tab 栏右侧没有用户图标（PC 不显示用户菜单）。

## 8. 文档同步

- 本设计文档：`docs/superpowers/specs/2026-05-02-fixed-tab-bar-and-user-menu-design.md`
- 实现计划：`docs/superpowers/plans/2026-05-02-fixed-tab-bar-and-user-menu-plan.md`（writing-plans 阶段产出）
- 不涉及现有 arch / prd 文档变动；如需更新 progress 日志，在实现 PR 时另行追加。

## 9. 开放问题

无。

