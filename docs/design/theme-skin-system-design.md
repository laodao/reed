# 主题皮肤系统设计（经典 / 现代双皮肤）

> 状态：方案已评审 · 待实施
> 日期：2026-07-23
> 关联：新版人像设计原型 `docs/ui-prototypes/portrait-design/`

## 1. 背景与目标

新版人像设计原型采用了一套新的视觉语言（墨青蓝主色、莫兰迪雾色系、深色侧栏、克制的阴影与圆角），评审认为优于现有界面风格。

**目标**：让整套应用可以在「经典皮肤」（现状）与「现代皮肤」（新视觉语言）之间一键切换，且可随时回退；切换机制复用现有主题系统，不引入新框架。

**非目标**：
- 不改变任何页面的 DOM 结构与组件实现（皮肤只管外观，不管信息架构）
- 不做暗色模式（dark mode 是另一个独立课题）

## 2. 现状分析（实测数据）

### 2.1 已有基建（大部分地基已存在）

| 基建 | 位置 | 状态 |
|------|------|------|
| 主题切换机制（含持久化） | `src/renderer/src/composables/useTheme.ts` | ✅ 10 套颜色主题在用 |
| CSS 变量层（色/圆角/阴影/过渡/布局） | `src/renderer/src/styles/index.scss` `:root` | ✅ 完整 |
| `[data-theme="x"]` 覆盖模式 | `index.scss` | ✅ 与目标模式同构 |
| Element Plus 覆盖层 | `src/renderer/src/styles/element-plus.scss` | ✅ 已存在（315 行） |
| 内联样式硬编码（皮肤死角） | 全部组件 | ✅ 仅 4 处，可忽略 |

### 2.2 缺口

1. **主题只切颜色**：`[data-theme]` 目前只覆盖颜色变量；圆角 / 阴影 / 侧栏 token 在 `:root` 是单一值，全部主题共享。
2. **组件层变量化率极低**（实测 184 个 Vue 组件）：
   - `var(--radius` 使用：5 个组件
   - 硬编码 `border-radius: Npx`：496 处 / 131 个文件
   - 硬编码 `box-shadow`：75 处 / `var(--shadow` 仅 4 个组件
3. **`element-plus.scss` 的 hover 动效属"经典"审美**（卡片上浮、按钮弹跳），与现代皮肤的克制动效冲突。

### 2.3 关键结论

视觉差异的约 80% 来自三个**全局层**，它们都可以不碰组件文件就完成切换：

1. **Element Plus 组件**（按钮 / 输入框 / 对话框 / 卡片 / 下拉…）——EP 基于 `--el-border-radius-*`、`--el-box-shadow*` 等 CSS 变量，一个 `[data-skin="modern"]` 全局覆盖块即可全应用换肤
2. **应用外壳**（MainLayout 侧栏）——1 个文件
3. **全局 token**（页面背景、阴影尺度、圆角尺度、密度）——`index.scss` 一个文件

剩余 131 个文件中的自定义卡片圆角在新皮肤下视觉可接受，**不做全量扫荡**，采用渐进 token 化（碰到哪个视图改哪个）。

## 3. 设计决策

### D1：皮肤是正交维度，不与颜色主题耦合

```
颜色主题（palette）：故宫红墙 / 青花瓷韵 / 墨青蓝 / …（N 套）
   ×
皮肤（skin）：classic（经典）/ modern（现代）（2 套）
```

- 颜色主题继续走现有 `useTheme.ts` + `themeColorMap`（只管 `--el-color-primary*` 与 `--color-primary*`）
- 皮肤是新的独立维度，通过 `document.documentElement` 的 `data-skin` 属性切换
- 任意颜色 × 任意皮肤自由组合，配置不爆炸（N+2，而非 N×2）
- 默认值：`skin = classic`（零风险，现有用户无感知）

### D2：皮肤载体为 `data-skin` 属性，与 `data-theme` 并存

```html
<html data-theme="palace-red" data-skin="modern">
```

- `data-theme` → 颜色（现有机制，不变）
- `data-skin` → 结构（圆角 / 阴影 / 侧栏 / 密度 / EP 组件形态）
- 持久化复用 `window.electronAPI.settings`：`skin` 键

### D3：结构 token 全部 CSS 变量化，双皮肤各自赋值

在 `:root`（= classic 默认值）与 `[data-skin="modern"]` 下分别定义同一组结构 token：

```scss
:root, [data-skin="classic"] {
  --radius-sm: 6px;  --radius-md: 10px; --radius-lg: 16px; --radius-xl: 24px;
  --shadow-sm: 0 2px 8px rgba(0,0,0,.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,.12);
  --sidebar-bg: var(--color-sidebar-gradient);   // 经典：主题色渐变
  --sidebar-text: rgba(255,255,255,.85);
  --sidebar-item-active-bg: rgba(255,255,255,.16);
  --card-hover-transform: translateY(-2px);       // 经典：上浮动效
}

[data-skin="modern"] {
  --radius-sm: 6px;  --radius-md: 10px; --radius-lg: 14px; --radius-xl: 18px;
  --shadow-sm: 0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04);
  --shadow-md: 0 4px 12px rgba(16,24,40,.08), 0 2px 4px rgba(16,24,40,.04);
  --shadow-lg: 0 12px 32px rgba(16,24,40,.12), 0 4px 8px rgba(16,24,40,.06);
  --sidebar-bg: #0f1419;                          // 现代：深色纯色
  --sidebar-text: #8a94a6;
  --sidebar-item-active-bg: linear-gradient(90deg, rgba(44,95,246,.22), rgba(44,95,246,.08));
  --card-hover-transform: none;                   // 现代：克制动效
}
```

token 值取自原型设计系统 `docs/ui-prototypes/portrait-design/portrait.css`。

### D4：Element Plus 全局换肤，不碰组件文件

在 `element-plus.scss` 增加 `[data-skin="modern"]` 覆盖块：

- 变量级：`--el-border-radius-base/small/round`、`--el-box-shadow/light/lighter`、输入框 / 按钮 / 对话框的边框与阴影
- 动效级：现代皮肤下关闭 `el-card:hover` 上浮、按钮弹跳（用选择器 gate，经典皮肤保持现状）

### D5：新增代码强制 token 驱动（本次新版人像设计即执行）

- 新版人像设计的全部样式只许使用 `var(--*)`，**零硬编码**色值 / 圆角 / 阴影 / 间距
- Code Review 检查项：新增 `.vue/.scss` 中出现 `border-radius: <数字>px`、`box-shadow: 0 …`、`#<hex>` 直接量（token 定义文件除外）一律打回
- 存量组件不强制改造，渐进进行

### D6：颜色主题补齐"墨青蓝"

`useTheme.ts` 的 `availableThemes` 与 `themeColorMap` 增加：

```ts
{ id: 'modern-blue', name: '墨青蓝', primary: '#2c5ff6', ... }
// themeColorMap: { primary: '#2c5ff6', light: '#5a85f8', dark: '#1f4ed8' }
```

现代皮肤的默认推荐配色，但用户可自由换色。

## 4. 实施阶段

| 阶段 | 内容 | 涉及文件 | 工作量 | 风险 |
|------|------|----------|--------|------|
| P1 | 结构 token 抽取 + `[data-skin]` 双皮肤定义 + EP 换肤块 + useSkin composable + 设置项 | `index.scss` `element-plus.scss` `useTheme.ts`（扩展）新增 `useSkin.ts` 设置页 | ≈ 1 天 | 低 |
| P2 | MainLayout 外壳 token 化（侧栏 bg/文字/菜单项，全部走 `--sidebar-*`） | `MainLayout.vue` | ≈ 0.5 天 | 低 |
| P3 | 视觉回归 QA：Playwright 截图关键视图（对话/图像/人像/长文/剧集）双皮肤各一遍，修复特例 | — | ≈ 0.5 天 | 中（主要成本） |
| P4 | 存量组件渐进 token 化（碰到的视图顺手改，不专项扫荡） | 各视图 | 渐进 | 低 |

**P1+P2+P3 ≈ 2 天达到约 80% 视觉效果，且随时可切回经典皮肤。**

### 试点策略

新版人像设计是首个"原生 token 驱动"的模块。建议 P1 完成后先在人像模块验证双皮肤效果，再全面 QA。

## 5. 验收标准

1. 设置页可选择皮肤（经典 / 现代），切换即时生效、重启后保持
2. 现代皮肤下：EP 按钮 / 输入框 / 对话框 / 卡片的圆角与阴影与原型一致；侧栏为深色；无卡片上浮动效
3. 经典皮肤下：界面与改造前逐像素一致（回归零差异）
4. 颜色主题 × 皮肤 任意组合不破坏布局
5. 新增代码（新版人像设计）零硬编码样式直接量

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| `element-plus.scss` 现有 hover 动效与现代风格冲突 | 动效选择器按 `[data-skin]` gate，经典保持原样 |
| 184 个组件的视觉回归 | P3 用 Playwright 截图对比；默认 skin=classic 保证无回归 |
| EP 深层组件（下拉面板、消息框等 teleport 到 body）漏覆盖 | 覆盖块写在全局作用域（非 scoped），QA 专项点检 |
| 未来新增组件写死样式 | D5 的 CR 检查项 + 后续可加 stylelint 规则 |
