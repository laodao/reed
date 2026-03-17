# F09-02 - 主题设置

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M09 - 系统设置 |
| 功能编号 | F09-02 |
| 功能名称 | 主题设置 |
| 优先级 | P0 |
| 功能描述 | 切换应用程序主题（浅色/深色/跟随系统），实时生效 |

## 2. 操作流程

### 2.1 切换主题

```
用户在设置页面选择主题
    │
    ├── 选择"浅色"
    │       │
    │       ▼
    │       调用 setTheme('light')
    │           │
    │           ├── 设置 CSS 变量为浅色值
    │           │
    │           ├── 移除系统主题监听器
    │           │
    │           ├── 保存到数据库
    │           │
    │           ▼
    │           界面立即切换为浅色
    │
    ├── 选择"深色"
    │       │
    │       ▼
    │       调用 setTheme('dark')
    │           │
    │           ├── 设置 CSS 变量为深色值
    │           │
    │           ├── 移除系统主题监听器
    │           │
    │           ├── 保存到数据库
    │           │
    │           ▼
    │           界面立即切换为深色
    │
    └── 选择"跟随系统"
            │
            ▼
            调用 setTheme('auto')
                │
                ├── 获取当前系统主题
                │
                ├── 设置对应的 CSS 变量
                │
                ├── 注册系统主题变化监听器
                │
                ├── 保存到数据库
                │
                ▼
                界面跟随系统主题
```

### 2.2 应用启动时加载主题

```
应用启动
    │
    ▼
初始化 settings store
    │
    ▼
调用 loadSettings()
    │
    ▼
从数据库读取主题设置
    │
    ├── 如果是 'auto'
    │       │
    │       ├── 获取系统当前主题
    │       │
    │       ├── 应用对应主题
    │       │
    │       └── 注册系统主题监听器
    │
    ├── 如果是 'light' 或 'dark'
    │       │
    │       └── 直接应用对应主题
    │
    ▼
主题生效
```

### 2.3 系统主题变化响应（仅auto模式）

```
系统主题变化事件触发
    │
    ▼
回调函数执行
    │
    ▼
获取新的系统主题
    │
    ▼
更新 CSS 变量
    │
    ▼
界面自动切换
```

## 3. 界面设计

### 3.1 主题选择组件

```
┌─────────────────────────────────────────────────────────────────┐
│ 外观                                                             │
├─────────────────────────────────────────────────────────────────┤
│ 主题                                                             │
│                                                                  │
│   ○ 浅色        ☀️ 明亮的界面，适合白天使用                       │
│   ○ 深色        🌙 深色的界面，保护眼睛                          │
│   ● 跟随系统    💻 自动跟随操作系统的主题设置                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 主题模式类型
type ThemeMode = 'light' | 'dark' | 'auto'

// 主题设置
interface ThemeSettings {
  theme: ThemeMode
}
```

### 4.2 CSS 变量映射

```scss
// 浅色主题变量
:root {
  --bg-color: #ffffff;
  --bg-color-page: #f5f7fa;
  --bg-color-overlay: #ffffff;
  --text-color: #303133;
  --text-color-secondary: #606266;
  --text-color-placeholder: #a8abb2;
  --border-color: #dcdfe6;
  --border-color-light: #e4e7ed;
  --fill-color: #f0f2f5;
  --primary-color: #409eff;
  --success-color: #67c23a;
  --warning-color: #e6a23c;
  --danger-color: #f56c6c;
  --shadow-color: rgba(0, 0, 0, 0.1);
}

// 深色主题变量
:root.dark {
  --bg-color: #141414;
  --bg-color-page: #0a0a0a;
  --bg-color-overlay: #1d1d1d;
  --text-color: #e5eaf3;
  --text-color-secondary: #a3a6ad;
  --text-color-placeholder: #6c6e72;
  --border-color: #4c4d4f;
  --border-color-light: #414243;
  --fill-color: #303030;
  --primary-color: #409eff;
  --success-color: #67c23a;
  --warning-color: #e6a23c;
  --danger-color: #f56c6c;
  --shadow-color: rgba(0, 0, 0, 0.3);
}
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/stores/settings.ts` | 设置状态管理，包含主题逻辑 |
| `src/renderer/src/views/SettingsView.vue` | 设置页面，主题选择UI |
| `src/renderer/src/styles/variables.scss` | CSS变量定义 |
| `src/renderer/src/styles/main.scss` | 全局样式，应用CSS变量 |
| `src/renderer/src/App.vue` | 根组件，初始化主题 |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/settings.handler.ts` | 设置IPC处理器 |
| `src/main/database/repositories/settings.repository.ts` | 设置数据访问 |

### 5.3 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/settings.types.ts` | 设置类型定义 |

## 6. 函数设计

### 6.1 前端函数

#### stores/settings.ts

```typescript
/**
 * 主题模式
 */
const theme = ref<ThemeMode>('auto')

/**
 * 系统主题变化监听器引用
 */
let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null

/**
 * 设置主题
 * @param mode - 主题模式 ('light' | 'dark' | 'auto')
 * @returns Promise<void>
 * 逻辑：
 * 1. 更新 theme 响应式变量
 * 2. 如果是 'auto'：
 *    a. 获取系统当前主题
 *    b. 应用对应主题
 *    c. 注册系统主题监听器
 * 3. 如果是 'light' 或 'dark'：
 *    a. 移除系统主题监听器
 *    b. 应用对应主题
 * 4. 保存设置到数据库
 */
async function setTheme(mode: ThemeMode): Promise<void>

/**
 * 应用主题到界面
 * @param isDark - 是否为深色主题
 * @returns void
 * 逻辑：
 * 1. 如果 isDark 为 true：
 *    a. 添加 'dark' class 到 html 元素
 * 2. 如果 isDark 为 false：
 *    a. 移除 'dark' class 从 html 元素
 */
function applyTheme(isDark: boolean): void

/**
 * 获取系统当前主题
 * @returns boolean - true 表示深色，false 表示浅色
 * 逻辑：
 * 1. 使用 window.matchMedia('(prefers-color-scheme: dark)') 检测
 * 2. 返回 matches 属性值
 */
function getSystemTheme(): boolean

/**
 * 设置系统主题监听器
 * @returns void
 * 逻辑：
 * 1. 如果已有监听器，先移除
 * 2. 创建新的监听器函数
 * 3. 监听 prefers-color-scheme 变化
 * 4. 变化时调用 applyTheme
 */
function setupSystemThemeListener(): void

/**
 * 移除系统主题监听器
 * @returns void
 * 逻辑：
 * 1. 如果存在监听器，移除它
 * 2. 设置监听器引用为 null
 */
function removeSystemThemeListener(): void

/**
 * 加载设置
 * @returns Promise<void>
 * 逻辑：
 * 1. 从数据库读取主题设置
 * 2. 如果没有设置，使用默认值 'auto'
 * 3. 调用 setTheme 应用主题
 */
async function loadSettings(): Promise<void>
```

#### views/SettingsView.vue

```typescript
/**
 * 主题计算属性
 * 用于双向绑定主题选择
 */
const theme = computed({
  get: () => settingsStore.theme,
  set: (value: ThemeMode) => settingsStore.setTheme(value)
})
```

### 6.2 后端函数

#### settings.handler.ts

```typescript
/**
 * 处理获取设置请求
 * @param event - IPC事件对象
 * @param key - 设置键名
 * @returns Promise<{ success: boolean, data?: any }>
 * 逻辑：
 * 1. 根据 key 查询数据库
 * 2. 返回设置值
 */
async function handleGetSettings(
  event: IpcMainInvokeEvent,
  key: string
): Promise<{ success: boolean, data?: any }>

/**
 * 处理保存设置请求
 * @param event - IPC事件对象
 * @param payload - { key: string, value: any }
 * @returns Promise<{ success: boolean }>
 * 逻辑：
 * 1. 验证 key 有效性
 * 2. 将 value 序列化为 JSON
 * 3. UPSERT 到数据库
 * 4. 返回成功
 */
async function handleSetSettings(
  event: IpcMainInvokeEvent,
  payload: { key: string, value: any }
): Promise<{ success: boolean }>
```

#### settings.repository.ts

```typescript
/**
 * 获取设置值
 * @param key - 设置键名
 * @returns Promise<any | null>
 * 逻辑：
 * 1. 查询 settings 表
 * 2. 如果存在，解析 JSON 返回
 * 3. 如果不存在，返回 null
 */
async function get(key: string): Promise<any | null>

/**
 * 设置值
 * @param key - 设置键名
 * @param value - 设置值
 * @returns Promise<void>
 * 逻辑：
 * 1. 将 value 序列化为 JSON
 * 2. 使用 UPSERT 操作
 * 3. 更新 updated_at 时间戳
 */
async function set(key: string, value: any): Promise<void>
```

## 7. 边界检查

### 7.1 输入验证

| 场景 | 验证规则 | 错误处理 |
|-----|---------|---------|
| 主题值无效 | 不是 'light'/'dark'/'auto' | 忽略，保持原值 |
| 数据库读取失败 | - | 使用默认值 'auto' |
| 数据库写入失败 | - | 记录日志，不阻塞UI |

### 7.2 异常情况

| 情况 | 处理方式 |
|-----|---------|
| 首次启动（无设置） | 使用默认值 'auto' |
| 系统不支持主题检测 | 'auto' 模式默认使用浅色 |
| 监听器注册失败 | 降级为静态主题 |
| CSS变量不生效 | 确保html元素正确设置class |

## 8. 测试用例

### 8.1 正常流程

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 切换到浅色主题 | 选择"浅色" | 界面立即变为浅色 |
| TC002 | 切换到深色主题 | 选择"深色" | 界面立即变为深色 |
| TC003 | 切换到跟随系统 | 选择"跟随系统" | 界面跟随系统主题 |
| TC004 | 重启应用保持设置 | 设置主题→重启 | 主题设置保持 |
| TC005 | 系统主题变化 | 选择跟随系统→改变系统主题 | 界面自动切换 |

### 8.2 边界情况

| 用例ID | 描述 | 条件 | 预期结果 |
|-------|------|-----|---------|
| TC101 | 首次启动 | 无数据库记录 | 使用默认值 'auto' |
| TC102 | 快速切换 | 连续切换多次 | 最终状态正确 |
| TC103 | 数据库损坏 | 设置表不存在 | 使用默认值 |

### 8.3 兼容性测试

| 用例ID | 描述 | 平台 | 预期结果 |
|-------|------|-----|---------|
| TC201 | Windows 主题变化 | Windows 11 | 跟随系统正常工作 |
| TC202 | macOS 主题变化 | macOS 14 | 跟随系统正常工作 |
| TC203 | Linux 主题变化 | Ubuntu | 跟随系统正常工作 |

## 9. 性能考虑

1. **CSS变量切换**
   - 使用 CSS class 切换，浏览器自动重绘
   - 避免手动修改每个元素样式

2. **监听器管理**
   - 切换到非auto模式时移除监听器
   - 避免内存泄漏

3. **数据库操作**
   - 使用防抖，避免频繁写入
   - 设置变更后延迟500ms再保存
