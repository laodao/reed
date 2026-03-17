# M08 - 网络搜索模块功能设计

## F08-01 网络搜索

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F08-01 |
| 功能名称 | 网络搜索 |
| 优先级 | P0 |
| 描述 | 执行网络搜索 |

### 界面
```
┌─────────────────────────────────────────────────────────────────────────┐
│  网络搜索                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ 🔍 [今天北京的天气怎么样？                              ] [搜索]  ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  搜索引擎: ○ 必应  ● 百度  ○ Google                                    │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  🤖 AI总结                                                               │
│  ────────────────────────────────────────────────────────────────────  │
│  根据搜索结果，今天北京的天气情况如下：                                  │
│  • 天气：晴转多云                                                       │
│  • 温度：-2°C 到 8°C                                                   │
│  • 风力：北风3-4级                                                      │
│  • 建议：外出注意保暖                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  搜索结果                                                                │
│  ────────────────────────────────────────────────────────────────────  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 北京天气预报_天气预报15天                                         │  │
│  │ www.weather.com.cn                                               │  │
│  │ 今天北京天气：晴转多云，-2°C到8°C，北风3-4级...                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 北京天气 - 中国天气网                                             │  │
│  │ www.weather.com.cn                                               │  │
│  │ 提供北京天气预报，包括今天、明天、未来一周天气...                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 执行搜索
 * @param request - 搜索请求
 * @returns Promise<SearchResponse>
 */
async function search(request: SearchRequest): Promise<SearchResponse>

interface SearchRequest {
  query: string                    // 搜索关键词
  engine?: 'bing' | 'baidu' | 'google'  // 搜索引擎
  count?: number                   // 结果数量，默认10
  withSummary?: boolean            // 是否生成AI总结
}

interface SearchResponse {
  success: boolean
  results: SearchResultItem[]
  summary?: string                 // AI总结
}

interface SearchResultItem {
  title: string
  url: string
  snippet: string                  // 摘要
  favicon?: string                 // 网站图标
}
```

---

## F08-02 搜索引擎选择

### 支持的搜索引擎

| 引擎 | 标识 | 特点 |
|-----|------|------|
| 必应 | bing | 结果质量高，支持中文 |
| 百度 | baidu | 中文搜索效果好 |
| Google | google | 结果全面，需代理 |

### 函数
```typescript
/**
 * 获取可用搜索引擎
 * @returns SearchEngine[]
 */
function getAvailableEngines(): SearchEngine[]

interface SearchEngine {
  id: string
  name: string
  icon?: string
  enabled: boolean
  requiresKey: boolean
  configured: boolean
}
```

---

## F08-03 结果展示

### 界面元素

```
单个搜索结果项：
┌──────────────────────────────────────────────────────────────────┐
│ 🌐 北京天气预报_天气预报15天                                     │
│    www.weather.com.cn                                            │
│    今天北京天气：晴转多云，-2°C到8°C，北风3-4级，空气质量...     │
└──────────────────────────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 打开搜索结果链接
 * @param url - 链接地址
 */
function openResult(url: string): void

/**
 * 复制搜索结果
 * @param result - 搜索结果
 */
function copyResult(result: SearchResultItem): void
```

---

## F08-04 AI总结

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F08-04 |
| 功能名称 | AI总结 |
| 优先级 | P1 |
| 描述 | AI总结搜索结果 |

### 流程
```
获取搜索结果
    │
    ▼
构建总结提示词
    │
    ├── 用户问题
    │
    ├── 搜索结果摘要
    │
    ▼
调用AI对话接口
    │
    ▼
获取AI总结
    │
    ▼
显示在界面上
```

### 函数
```typescript
/**
 * 生成搜索结果总结
 * @param query - 搜索词
 * @param results - 搜索结果
 * @returns Promise<string>
 */
async function generateSummary(
  query: string,
  results: SearchResultItem[]
): Promise<string>
```

---

## 搜索历史

### 界面
```
┌─────────────────────────────────────────────┐
│  搜索历史                        [清空历史] │
├─────────────────────────────────────────────┤
│  🔍 今天北京的天气怎么样？         今天 10:30│
│  🔍 Python爬虫教程                 昨天      │
│  🔍 机器学习入门                   01-15    │
│  🔍 如何写好技术文档               01-12    │
└─────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 获取搜索历史
 * @param limit - 数量限制
 * @returns Promise<SearchHistory[]>
 */
async function getSearchHistory(limit?: number): Promise<SearchHistory[]>

/**
 * 清空搜索历史
 */
async function clearSearchHistory(): Promise<void>

interface SearchHistory {
  id: string
  query: string
  engine: string
  resultCount: number
  createdAt: Date
}
```
