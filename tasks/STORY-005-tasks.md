# STORY-005: 主界面布局

**Epic:** EPIC-005 系统基础设施
**优先级:** Must Have
**点数:** 5
**依赖:** STORY-001 (已完成 ✓), STORY-003 (已完成 ✓)

## 用户故事

> 作为用户，我想要看到清晰的主界面布局，以便我可以方便地使用各个功能

## 验收标准

- [x] 侧边栏导航（功能模块列表）✓
- [x] 主内容区域 ✓
- [x] 顶部导航栏（模型切换、设置）✓
- [x] 深色/浅色主题切换 ✓
- [x] 响应式布局基础 ✓

## 状态: ✅ 完成

---

## 任务清单

### 任务 5.1: 创建布局组件结构
**描述:** 创建主布局组件的基础结构
**文件:** `src/renderer/src/components/layout/`
**预计时间:** 30分钟

**创建文件:**
- `AppLayout.vue` - 主布局容器
- `AppSidebar.vue` - 侧边栏（已存在，需完善）
- `AppHeader.vue` - 顶部栏（已存在，需完善）
- `AppMain.vue` - 主内容区域

**完成标准:**
- [ ] 目录结构创建完成
- [ ] 组件文件创建
- [ ] 基础模板结构定义

---

### 任务 5.2: 实现侧边栏导航
**描述:** 完善侧边栏组件，实现功能模块导航
**文件:** `src/renderer/src/components/layout/AppSidebar.vue`
**预计时间:** 1小时

**功能模块:**
- AI 对话
- 图像生成
- 视频生成
- OCR 识别
- 语音转换
- 翻译
- 知识库
- 设置

**实现要点:**
- 使用 Element Plus `el-menu` 组件
- 支持 collapse 折叠
- 当前路由高亮
- 图标支持

**完成标准:**
- [ ] 8个功能模块菜单项
- [ ] 点击导航到对应路由
- [ ] 当前路由高亮显示
- [ ] 支持折叠/展开
- [ ] 图标正确显示

---

### 任务 5.3: 实现顶部导航栏
**描述:** 完善顶部栏组件，包含模型选择和设置入口
**文件:** `src/renderer/src/components/layout/AppHeader.vue`
**预计时间:** 1小时

**组件内容:**
- 应用 Logo/标题
- 模型选择下拉框
- 主题切换按钮
- 设置按钮

**实现要点:**
- 使用 Element Plus 组件
- 模型选择器需调用 IPC 获取可用模型
- 主题切换需保存到设置

**完成标准:**
- [ ] Logo/标题显示
- [ ] 模型选择器功能完整
- [ ] 主题切换按钮工作
- [ ] 设置按钮可点击

---

### 任务 5.4: 实现主内容区域
**描述:** 创建主内容区域组件，包含路由视图
**文件:** `src/renderer/src/components/layout/AppMain.vue`
**预计时间:** 30分钟

**实现要点:**
- 使用 `<router-view>` 组件
- 添加过渡动画
- 处理加载状态

**完成标准:**
- [ ] 路由视图正确渲染
- [ ] 页面切换有过渡动画
- [ ] 内容区域滚动正常

---

### 任务 5.5: 创建主题系统
**描述:** 实现 CSS 变量驱动的主题系统
**文件:** `src/renderer/src/styles/themes/`
**预计时间:** 1小时

**创建文件:**
- `_variables-light.scss` - 浅色主题变量
- `_variables-dark.scss` - 深色主题变量
- `_theme-mixins.scss` - 主题切换 mixins

**CSS 变量:**
```scss
:root {
  --bg-color: #ffffff;
  --text-color: #303133;
  --border-color: #dcdfe6;
  --primary-color: #409eff;
  --sidebar-bg: #f5f7fa;
  --header-bg: #ffffff;
}

[data-theme="dark"] {
  --bg-color: #1a1a1a;
  --text-color: #e5eaf3;
  --border-color: #4c4d4f;
  --primary-color: #409eff;
  --sidebar-bg: #252526;
  --header-bg: #2d2d2d;
}
```

**完成标准:**
- [ ] 浅色主题变量定义
- [ ] 深色主题变量定义
- [ ] 主题切换 mixin
- [ ] Element Plus 主题适配

---

### 任务 5.6: 创建设置 Store
**描述:** 使用 Pinia 创建设置状态管理
**文件:** `src/renderer/src/stores/settings.ts`
**预计时间:** 45分钟

**State:**
```typescript
interface SettingsState {
  theme: 'light' | 'dark' | 'auto'
  sidebarCollapsed: boolean
  currentModel: string
  currentProvider: string
}
```

**Actions:**
- `loadSettings()` - 从主进程加载设置
- `setTheme(theme)` - 切换主题
- `toggleSidebar()` - 切换侧边栏
- `setCurrentModel(model)` - 设置当前模型

**完成标准:**
- [ ] Store 创建完成
- [ ] Actions 实现完整
- [ ] 与 IPC 通信集成
- [ ] 持久化到主进程

---

### 任务 5.7: 更新 App.vue 布局
**描述:** 整合所有布局组件到 App.vue
**文件:** `src/renderer/src/App.vue`
**预计时间:** 30分钟

**布局结构:**
```vue
<template>
  <div class="app-container" :data-theme="theme">
    <AppSidebar />
    <div class="main-container">
      <AppHeader />
      <AppMain />
    </div>
  </div>
</template>
```

**完成标准:**
- [ ] 布局组件整合
- [ ] 响应式布局实现
- [ ] 主题属性绑定

---

### 任务 5.8: 响应式布局适配
**描述:** 实现响应式布局，适配不同屏幕尺寸
**文件:** 各布局组件
**预计时间:** 45分钟

**断点:**
- 桌面: > 1200px
- 小桌面: 900px - 1200px
- 平板: < 900px（侧边栏自动折叠）

**完成标准:**
- [ ] 桌面端布局正常
- [ ] 小桌面端侧边栏可折叠
- [ ] 平板端侧边栏默认折叠
- [ ] 窗口大小变化时自动适配

---

### 任务 5.9: 集成测试与验证
**描述:** 运行应用验证主界面布局
**预计时间:** 30分钟

**验证步骤:**
- [ ] 应用启动显示主界面
- [ ] 侧边栏导航正常
- [ ] 顶部栏功能正常
- [ ] 主题切换工作
- [ ] 响应式布局正常
- [ ] 各页面路由正常

---

## 技术说明

### 布局结构图

```
┌─────────────────────────────────────────────┐
│                  AppHeader                   │
│  [Logo]  [模型选择器 ▼]    [🌙] [⚙️]        │
├──────────┬──────────────────────────────────┤
│          │                                   │
│  App     │                                   │
│  Sidebar │            AppMain               │
│          │        <router-view>              │
│  [对话]  │                                   │
│  [图像]  │                                   │
│  [视频]  │                                   │
│  [OCR]   │                                   │
│  [语音]  │                                   │
│  [翻译]  │                                   │
│  [知识库]│                                   │
│  [设置]  │                                   │
│          │                                   │
└──────────┴──────────────────────────────────┘
```

### 使用的组件库

- Element Plus: Menu, Dropdown, Button, Switch
- @element-plus/icons-vue: 图标

---

## 依赖

- Vue Router (STORY-001 已实现)
- Pinia (STORY-001 已实现)
- Element Plus (STORY-001 已安装)
- IPC 通信 (STORY-003 已实现)
