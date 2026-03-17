# 网络搜索模块 - 用户故事

**模块名称：** 网络搜索
**所属Epic：** EPIC-004 知识管理与智能搜索
**优先级：** Should Have
**Sprint：** 第3周
**日期：** 2026-03-01

---

## 故事列表

| 故事ID | 故事名称 | 故事点数 | 优先级 | 状态 |
|--------|----------|----------|--------|------|
| SEA-001 | 搜索引擎配置与手动搜索 | 3 | Must Have | 待开发 |
| SEA-002 | AI对话集成搜索 | 3 | Must Have | 待开发 |

---

## SEA-001: 搜索引擎配置与手动搜索

### 用户故事

```
作为一个 用户
我想要 配置搜索引擎并手动搜索网络
以便 获取实时网络信息
```

### 描述

**背景：**
用户需要在应用内进行网络搜索，获取最新的网络信息。

**范围：**
- 搜索引擎配置
- 手动触发搜索
- 搜索结果显示

**用户流程：**
1. 用户在设置中配置搜索引擎API
2. 在对话界面点击"网络搜索"按钮
3. 输入搜索词
4. 系统执行搜索
5. 显示搜索结果列表

### 验收标准

- [ ] 支持配置搜索引擎：
  - [ ] Bing Search API
  - [ ] Google Custom Search
- [ ] 支持API密钥配置
- [ ] 支持测试连接
- [ ] 在对话界面显示搜索按钮
- [ ] 点击后可输入搜索词
- [ ] 执行搜索并显示结果
- [ ] 结果包含标题、摘要、链接
- [ ] 点击结果可打开链接
- [ ] 显示搜索结果数量
- [ ] 支持复制搜索结果

### 技术说明

**涉及的组件：**
- 前端：SearchConfig.vue, SearchDialog.vue, SearchResults.vue
- 后端：search.service.ts
- API：Bing Search API / Google Custom Search

**API接口：**
```typescript
// 执行搜索
IPC.search(params: {
  query: string,
  engine: string,
  count: number
}): Promise<Result<{
  results: SearchResult[],
  total: number
}>>

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}
```

### 故事点数：3

**估算依据：**
- 搜索配置：1点
- 搜索界面：1点
- API集成：1点

### 依赖

- SET-001（API密钥管理）

---

## SEA-002: AI对话集成搜索

### 用户故事

```
作为一个 用户
我想要 AI自动搜索网络来回答问题
以便 获取实时信息
```

### 描述

**背景：**
用户希望AI能够自动判断是否需要搜索网络，并基于搜索结果回答问题。

**范围：**
- 自动/手动搜索模式
- 搜索结果摘要
- 来源引用显示

**用户流程：**
1. 用户在对话中提问
2. 点击"网络搜索"或开启自动搜索
3. AI自动搜索相关内容
4. AI基于搜索结果生成回答
5. 显示来源引用

### 验收标准

- [ ] 支持手动触发搜索模式
- [ ] 支持自动搜索模式（可选开启）
- [ ] AI回答基于搜索结果
- [ ] 回答下方显示来源引用
- [ ] 引用显示网站名称和链接
- [ ] 点击引用可在浏览器中打开
- [ ] 显示搜索摘要
- [ ] 自动搜索前可设置确认提示
- [ ] 未开启搜索时正常对话
- [ ] 搜索失败时显示提示

### 技术说明

**涉及的组件：**
- 前端：SearchToggle.vue, SourceReference.vue
- 后端：search-chat.service.ts

**集成流程：**
1. 用户提问
2. 判断是否需要搜索（自动或手动）
3. 执行搜索
4. 将搜索结果作为上下文
5. AI生成回答
6. 返回回答和来源

**API接口：**
```typescript
// 搜索并生成回答
IPC.searchAndChat(params: {
  conversationId?: string,
  message: string,
  model: string,
  autoSearch: boolean
}): Promise<Result<{
  response: string,
  sources: Source[],
  searchQuery?: string
}>>
```

### 故事点数：3

**估算依据：**
- 搜索集成：1.5点
- 来源显示：1点
- 自动判断：0.5点

### 依赖

- SEA-001（搜索引擎配置与手动搜索）
- DIA-002（对话界面）

---

## 模块验收标准

- [ ] 所有2个故事完成
- [ ] 搜索引擎配置功能正常
- [ ] 手动搜索功能正常
- [ ] AI对话集成搜索正常
- [ ] 来源引用显示正常

---

**返回：** [故事总体大纲](./stories-overview.md)
