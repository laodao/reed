# F09-04 - 字体大小设置

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M09 - 系统设置 |
| 功能编号 | F09-04 |
| 功能名称 | 字体大小设置 |
| 优先级 | P1 |
| 功能描述 | 调整界面字体大小（小/中/大），实时生效 |

## 2. 操作流程

### 2.1 调整字体大小

```
用户选择字体大小
    │
    ├── 选择"小"
    │       │
    │       ▼
    │       调用 setFontSize('small')
    │           │
    │           ├── 设置 CSS 变量 --font-size-base 为 14px
    │           │
    │           ├── 保存到数据库
    │           │
    │           ▼
    │           界面字体立即变小
    │
    ├── 选择"中"（默认）
    │       │
    │       ▼
    │       调用 setFontSize('medium')
    │           │
    │           ├── 设置 CSS 变量 --font-size-base 为 16px
    │           │
    │           ├── 保存到数据库
    │           │
    │           ▼
    │           界面字体恢复默认
    │
    └── 选择"大"
            │
            ▼
            调用 setFontSize('large')
                │
                ├── 设置 CSS 变量 --font-size-base 为 18px
                │
                ├── 保存到数据库
                │
                ▼
                界面字体立即变大
```

### 2.2 应用启动加载字体大小

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
从数据库读取字体大小设置
    │
    ├── 有设置 → 应用对应字体大小
    │
    └── 无设置 → 使用默认值 'medium'
    │
    ▼
字体大小生效
```

## 3. 界面设计

### 3.1 字体大小选择组件

```
┌─────────────────────────────────────────────────────────────────┐
│ 字体大小                                                         │
│                                                                  │
│   ○ 小        14px，适合屏幕空间有限的场景                        │
│   ● 中        16px，默认大小，适合大多数场景                      │
│   ○ 大        18px，适合需要更大文字的场景                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 字体大小类型
type FontSize = 'small' | 'medium' | 'large'

// 字体大小映射
const fontSizeMap: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px'
}

// 字体大小设置
interface FontSizeSettings {
  fontSize: FontSize
}
```

### 4.2 CSS 变量

```scss
:root {
  --font-size-base: 16px;
  --font-size-small: 14px;
  --font-size-large: 18px;
  --font-size-xs: 12px;
  --font-size-xl: 20px;
}
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/stores/settings.ts` | 设置状态管理 |
| `src/renderer/src/views/SettingsView.vue` | 设置页面 |
| `src/renderer/src/styles/variables.scss` | CSS变量定义 |
| `src/renderer/src/styles/main.scss` | 全局样式 |

## 6. 函数设计

### 6.1 前端函数

#### stores/settings.ts

```typescript
/**
 * 字体大小
 */
const fontSize = ref<FontSize>('medium')

/**
 * 字体大小映射
 */
export const fontSizeMap: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px'
}

/**
 * 设置字体大小
 * @param size - 字体大小 ('small' | 'medium' | 'large')
 * @returns Promise<void>
 * 逻辑：
 * 1. 验证 size 有效性
 * 2. 更新 fontSize 响应式变量
 * 3. 调用 applyFontSize() 应用到界面
 * 4. 保存到数据库
 */
async function setFontSize(size: FontSize): Promise<void>

/**
 * 应用字体大小到界面
 * @param size - 字体大小
 * @returns void
 * 逻辑：
 * 1. 从 fontSizeMap 获取像素值
 * 2. 设置 document.documentElement.style.setProperty('--font-size-base', value)
 */
function applyFontSize(size: FontSize): void
```

#### views/SettingsView.vue

```typescript
/**
 * 字体大小计算属性
 * 用于双向绑定字体大小选择
 */
const fontSize = computed({
  get: () => settingsStore.fontSize,
  set: (value: FontSize) => settingsStore.setFontSize(value)
})
```

## 7. 边界检查

| 场景 | 验证规则 | 处理方式 |
|-----|---------|---------|
| 无效字体大小 | 不是 'small'/'medium'/'large' | 忽略，保持原值 |
| 数据库读取失败 | - | 使用默认值 'medium' |
| CSS变量设置失败 | - | 记录日志，不阻塞 |

## 8. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 设置小字体 | 选择"小" | 界面字体立即变为14px |
| TC002 | 设置中字体 | 选择"中" | 界面字体立即变为16px |
| TC003 | 设置大字体 | 选择"大" | 界面字体立即变为18px |
| TC004 | 重启保持设置 | 设置大字体→重启 | 字体保持为18px |
| TC005 | 首次启动 | 无数据库记录 | 使用默认值16px |

## 9. 注意事项

1. **CSS 继承**
   - 使用 CSS 变量，所有使用 var(--font-size-base) 的地方自动生效
   - 某些固定像素的元素可能需要单独调整

2. **响应式设计**
   - 字体变化后，确保布局不会破坏
   - 文本容器使用相对单位或自动换行

3. **性能**
   - 修改 CSS 变量会触发重绘，但影响范围可控
   - 无需防抖，用户切换频率低
