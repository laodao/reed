# F09-03 - 语言设置

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M09 - 系统设置 |
| 功能编号 | F09-03 |
| 功能名称 | 语言设置 |
| 优先级 | P1 |
| 功能描述 | 切换界面语言（简体中文/英语），需要重启应用生效 |

## 2. 操作流程

### 2.1 切换语言

```
用户选择语言
    │
    ▼
调用 setLanguage(langCode)
    │
    ▼
更新 language 响应式变量
    │
    ▼
保存到数据库
    │
    ▼
显示提示"语言设置将在重启应用后生效"
    │
    ▼
用户手动重启应用
    │
    ▼
应用启动时读取语言设置
    │
    ▼
加载对应的语言包
    │
    ▼
界面显示为新语言
```

### 2.2 应用启动加载语言

```
应用启动
    │
    ▼
读取数据库中的语言设置
    │
    ├── 有设置 → 使用设置的语言
    │
    └── 无设置 → 检测系统语言
            │
            ├── zh-* → 使用中文
            │
            └── 其他 → 使用英语
    │
    ▼
加载对应的 i18n 语言包
    │
    ▼
应用语言设置
```

## 3. 界面设计

### 3.1 语言选择组件

```
┌─────────────────────────────────────────────────────────────────┐
│ 语言                                                             │
│                                                                  │
│   [ 简体中文 ▼ ]                                                 │
│                                                                  │
│   语言切换后需要重启应用才能生效                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

下拉选项：
```
┌─────────────────┐
│ 简体中文        │
│ English         │
└─────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 语言类型
type Language = 'zh-CN' | 'en-US'

// 语言设置
interface LanguageSettings {
  language: Language
}

// 语言配置
interface LanguageConfig {
  code: Language
  name: string
  nativeName: string
}
```

### 4.2 支持的语言列表

| 代码 | 名称 | 本地名称 |
|-----|------|---------|
| zh-CN | Simplified Chinese | 简体中文 |
| en-US | English | English |

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/stores/settings.ts` | 设置状态管理 |
| `src/renderer/src/views/SettingsView.vue` | 设置页面 |
| `src/renderer/src/locales/zh-CN.ts` | 中文语言包 |
| `src/renderer/src/locales/en-US.ts` | 英文语言包 |
| `src/renderer/src/main.ts` | 应用入口，初始化i18n |

### 5.2 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/settings.types.ts` | 设置类型定义 |

## 6. 函数设计

### 6.1 前端函数

#### stores/settings.ts

```typescript
/**
 * 当前语言
 */
const language = ref<Language>('zh-CN')

/**
 * 支持的语言列表
 */
const supportedLanguages: LanguageConfig[] = [
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文' },
  { code: 'en-US', name: 'English', nativeName: 'English' }
]

/**
 * 设置语言
 * @param lang - 语言代码
 * @returns Promise<void>
 * 逻辑：
 * 1. 验证语言代码有效性
 * 2. 更新 language 响应式变量
 * 3. 保存到数据库
 * 4. 触发提示消息
 */
async function setLanguage(lang: Language): Promise<void>

/**
 * 获取语言配置
 * @param code - 语言代码
 * @returns LanguageConfig | undefined
 */
function getLanguageConfig(code: Language): LanguageConfig | undefined
```

#### main.ts

```typescript
/**
 * 初始化国际化
 * @param lang - 初始语言
 * @returns void
 * 逻辑：
 * 1. 创建 i18n 实例
 * 2. 加载语言包
 * 3. 设置默认语言
 * 4. 挂载到 Vue 应用
 */
function setupI18n(lang: Language): void
```

## 7. 边界检查

| 场景 | 验证规则 | 处理方式 |
|-----|---------|---------|
| 无效语言代码 | 不是 'zh-CN' 或 'en-US' | 忽略，保持原值 |
| 语言包缺失 | 语言包文件不存在 | 回退到中文 |
| 数据库读取失败 | - | 使用系统语言检测 |

## 8. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 切换到英语 | 选择English→重启 | 界面显示英文 |
| TC002 | 切换到中文 | 选择简体中文→重启 | 界面显示中文 |
| TC003 | 保持设置 | 设置语言→重启→重启 | 语言保持不变 |
| TC004 | 首次启动 | 无设置记录 | 自动检测系统语言 |
