# M06 - 翻译模块设计

## 1. 模块概述

| 属性 | 值 |
|-----|-----|
| 模块编号 | M06 |
| 模块名称 | 翻译 |
| 模块代码 | translate |
| 优先级 | P1 |
| 描述 | 提供多语言翻译功能，支持多种翻译引擎 |

## 2. 功能列表

| 功能编号 | 功能名称 | 功能描述 | 优先级 |
|---------|---------|---------|-------|
| F06-01 | 文本翻译 | 翻译输入的文本 | P0 |
| F06-02 | 语言检测 | 自动检测源语言 | P1 |
| F06-03 | 语言切换 | 切换源语言和目标语言 | P0 |
| F06-04 | 历史记录 | 查看翻译历史 | P1 |
| F06-05 | 批量翻译 | 批量翻译多段文本 | P2 |
| F06-06 | 文档翻译 | 翻译文档文件 | P2 |

## 3. 界面设计

### 3.1 翻译页面布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│  翻译                                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────┐  ┌────────────────────────────────────┐│
│  │ 源语言: [自动检测 ▼]       │  │ 目标语言: [英语 ▼]                 ││
│  ├────────────────────────────┤  ├────────────────────────────────────┤│
│  │                            │  │                                    ││
│  │  输入要翻译的文本...       │  │  Translated text will appear...    ││
│  │                            │  │                                    ││
│  │  你好，世界！              │  │  Hello, world!                     ││
│  │  这是一段测试文本。        │  │  This is a test text.              ││
│  │                            │  │                                    ││
│  │                            │  │                                    ││
│  │                            │  │                                    ││
│  ├────────────────────────────┤  ├────────────────────────────────────┤│
│  │ 字数: 18    [清空]         │  │ [复制] [朗读]                      ││
│  └────────────────────────────┘  └────────────────────────────────────┘│
│                                                                          │
│                           [⇄ 交换语言]                                   │
│                                                                          │
│  翻译引擎: [通义千问 ▼]                                                  │
│                                                                          │
│  翻译历史                                                                │
│  ────────────────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 你好，世界！ → Hello, world!                    中文→英语  10:30 │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 这是一个测试 → This is a test                   中文→英语  昨天  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 语言选择下拉

```
┌─────────────────────────────┐
│  🔍 搜索语言...              │
├─────────────────────────────┤
│  ● 自动检测                  │
│  ○ 中文（简体）              │
│  ○ 中文（繁体）              │
│  ○ 英语                      │
│  ○ 日语                      │
│  ○ 韩语                      │
│  ○ 法语                      │
│  ○ 德语                      │
│  ○ 西班牙语                  │
│  ○ 俄语                      │
│  ...                         │
└─────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据结构

```typescript
// 翻译请求
interface TranslateRequest {
  text: string                  // 要翻译的文本
  sourceLang?: string           // 源语言（空则自动检测）
  targetLang: string            // 目标语言
  provider?: string             // 提供商
}

// 翻译响应
interface TranslateResponse {
  success: boolean
  translatedText?: string       // 翻译结果
  detectedLang?: string         // 检测到的源语言
  confidence?: number           // 检测置信度
  error?: string                // 错误信息
}

// 翻译记录
interface TranslateRecord {
  id: string                    // 记录ID
  sourceText: string            // 原文
  translatedText: string        // 译文
  sourceLang: string            // 源语言
  targetLang: string            // 目标语言
  provider: string              // 提供商
  createdAt: Date               // 创建时间
}

// 语言信息
interface Language {
  code: string                  // 语言代码
  name: string                  // 显示名称
  nativeName?: string           // 本地名称
}

// 翻译提供商
interface TranslateProvider {
  id: string                    // 提供商ID
  name: string                  // 显示名称
  languages: Language[]         // 支持的语言
  configured: boolean           // 是否已配置
}
```

### 4.2 数据库表

```sql
-- 翻译记录表
CREATE TABLE translate_records (
  id TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_translate_created_at ON translate_records(created_at DESC);
CREATE INDEX idx_translate_source_lang ON translate_records(source_lang);
```

## 5. IPC接口设计

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| translate:get-languages | GET | provider?: string | { success, languages: Language[] } | 获取支持的语言 |
| translate:text | TRANSLATE | request: TranslateRequest | { success, ...TranslateResponse } | 翻译文本 |
| translate:detect | DETECT | text: string | { success, language, confidence } | 检测语言 |
| translate:list | GET | page?, pageSize? | { success, records, total } | 获取历史记录 |
| translate:delete | DELETE | id: string | { success } | 删除记录 |

## 6. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       └── translate.repository.ts     # 翻译数据访问
│   ├── ipc/
│   │   └── handlers/
│   │       └── translate.handler.ts        # 翻译IPC处理
│   ├── services/
│   │   └── translate.service.ts            # 翻译服务
│   └── providers/
│       └── translate/
│           ├── base-translate-provider.ts  # 翻译提供商基类
│           ├── qwen-translate-provider.ts  # 通义千问翻译
│           └── volcengine-translate.ts     # 火山引擎翻译
├── renderer/
│   └── src/
│       ├── views/
│       │   └── TranslateView.vue           # 翻译页面
│       ├── stores/
│       │   └── translate.ts                # 翻译状态管理
│       └── components/
│           └── translate/
│               ├── LanguageSelector.vue    # 语言选择器
│               ├── TextInput.vue           # 文本输入组件
│               ├── TranslationResult.vue   # 翻译结果组件
│               └── TranslateHistory.vue    # 翻译历史组件
└── shared/
    └── types/
        └── translate.types.ts              # 翻译类型定义
```

## 7. 核心流程

### 7.1 文本翻译流程

```
用户输入文本
    │
    ▼
选择源语言（可选自动检测）
    │
    ▼
选择目标语言
    │
    ▼
实时翻译（输入时自动触发）
    │
    ▼
调用 translate:text IPC
    │
    ▼
主进程接收请求
    │
    ├── 检查API密钥
    │
    ▼
如果是自动检测，先调用检测语言
    │
    ▼
调用翻译Provider API
    │
    ▼
获取翻译结果
    │
    ▼
保存记录到数据库
    │
    ▼
返回翻译结果
    │
    ▼
前端显示结果
```

### 7.2 语言检测流程

```
用户选择"自动检测"
    │
    ▼
输入文本后
    │
    ▼
调用 translate:detect IPC
    │
    ▼
调用检测API
    │
    ▼
返回语言代码和置信度
    │
    ▼
显示检测到的语言
```

## 8. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| 文本为空 | E601 | 请输入要翻译的文本 | 前端提示 |
| 文本过长 | E602 | 文本长度超过限制（最多10000字） | 前端提示 |
| 语言不支持 | E603 | 该语言组合不支持 | 前端提示 |
| API密钥未配置 | E604 | 请先配置翻译服务的API密钥 | 弹窗提示 |
| 翻译失败 | E605 | 翻译失败：{原因} | 弹窗提示 |

## 9. 支持的语言

| 语言代码 | 语言名称 |
|---------|---------|
| zh-CN | 中文（简体） |
| zh-TW | 中文（繁体） |
| en | 英语 |
| ja | 日语 |
| ko | 韩语 |
| fr | 法语 |
| de | 德语 |
| es | 西班牙语 |
| ru | 俄语 |
| pt | 葡萄牙语 |
| it | 意大利语 |
| ar | 阿拉伯语 |

## 10. 测试要点

### 10.1 功能测试
- [ ] 文本翻译
- [ ] 语言自动检测
- [ ] 语言切换
- [ ] 交换源语言和目标语言
- [ ] 复制翻译结果
- [ ] 查看历史记录

### 10.2 边界测试
- [ ] 空文本处理
- [ ] 超长文本处理
- [ ] 特殊字符处理
- [ ] 混合语言文本
