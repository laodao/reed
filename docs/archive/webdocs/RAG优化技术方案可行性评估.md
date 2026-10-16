# RAG优化技术方案可行性评估

## 一、总体评价

技术方案整体设计合理，**可行性较高**，分阶段实施的策略务实。但有几个关键点需要调整或深入考虑。

---

## 二、各阶段可行性详细评估

### 阶段一：语义切分优化

#### 可行性：⭐⭐⭐⭐⭐ (高)

| 子模块 | 可行性 | 说明 |
|-------|-------|------|
| StructuredSplitter | ✅ 完全可行 | Markdown 标题识别逻辑简单，已有成熟实现 |
| SemanticSplitter | ⚠️ 需调整 | 当前设计有成本问题，建议优化 |
| HybridSplitter | ✅ 完全可行 | 组合策略合理 |
| 数据库迁移 | ✅ 可行 | SQLite 支持动态添加列 |

#### 问题与建议

**问题1：语义切分成本过高**

当前设计需要为每个句子/段落调用 Embedding API：

```
文档 → 分句 → 每句调用 Embedding API → 计算相似度 → 切分
```

如果一个 10 页的文档有 500 个句子，需要调用 500 次 Embedding API（或者批量调用 1 次，但仍需要处理 500 个向量）。

**建议：采用级联策略**

参考讨论文档中的"方案C：级联架构"：

```typescript
// 改进后的语义切分策略
async splitBySemanticDrift(text: string): Promise<Chunk[]> {
  // 1. 先按自然段落切分（按双换行符）
  const paragraphs = text.split(/\n\n+/)

  // 2. 快速筛选：相邻段落如果明显相似则合并
  // 使用简单规则：首句相似度估算（不需要调用API）
  const mergedParagraphs = this.quickMerge(paragraphs)

  // 3. 只对"疑似边界"的段落调用 Embedding
  // 将API调用减少到原来的 20-30%
  const suspiciousBoundaries = this.detectSuspiciousBoundaries(mergedParagraphs)

  if (suspiciousBoundaries.length === 0) {
    return this.finalize(mergedParagraphs)
  }

  // 4. 对疑似边界进行 Embedding 验证
  const embeddings = await this.embeddingService.batchEmbed(
    suspiciousBoundaries.map(b => b.text)
  )

  // 5. 根据相似度确认切分点
  return this.confirmBoundaries(mergedParagraphs, suspiciousBoundaries, embeddings)
}
```

**问题2：PDF标题识别缺失**

方案中 StructuredSplitter 只处理 Markdown，但 PDF 的标题结构识别更重要。

**建议：利用已验证的 pdfjs-dist**

```typescript
// 在 PDFParserService 中增加结构提取
async parseStructure(filePath: string): Promise<PDFStructureResult> {
  // 使用 pdfjs-dist 的 getOutline() 获取目录
  // 使用字体大小判断标题层级（已在前面的方案中实现）
}
```

---

### 阶段二：层级索引构建

#### 可行性：⭐⭐⭐⭐ (较高)

| 子模块 | 可行性 | 说明 |
|-------|-------|------|
| 层级数据结构 | ✅ 可行 | 设计合理 |
| HierarchyIndexBuilder | ✅ 可行 | 实现逻辑清晰 |
| 层级检索 | ⚠️ 需调整 | 当前检索逻辑有问题 |

#### 问题与建议

**问题：层级检索的实现不完整**

当前方案中 `getHierarchyPath(chunkId)` 返回空对象，核心逻辑缺失。

**建议：完善层级检索**

```typescript
// 利用已有的 chunk metadata
async getHierarchyPath(chunkId: string): Promise<HierarchyPath> {
  const chunk = await this.chunkRepository.findById(chunkId)

  if (!chunk) return {}

  // chunk 已有 title, level, parentId 字段（阶段一新增）
  return {
    document: await this.getDocument(chunk.documentId),
    section: {
      title: chunk.title,
      level: chunk.level
    },
    parent: chunk.parentId ? await this.getSection(chunk.parentId) : null
  }
}
```

---

### 阶段三：混合检索增强

#### 可行性：⭐⭐⭐⭐ (较高)

| 子模块 | 可行性 | 说明 |
|-------|-------|------|
| BM25 关键词检索 | ✅ 可行 | 项目已有倒排索引，可扩展实现 |
| RRF 融合 | ✅ 可行 | 算法简单，易于实现 |
| 云端 Reranker | ✅ 可行 | 复用现有 Provider 配置 |
| 本地 Reranker | ⚠️ 需额外部署 | 需要 Python/GPU 环境 |

#### 问题与建议

**问题1：BM25 实现缺失细节**

项目已有倒排索引，但 BM25 需要计算 IDF 和文档长度归一化。

**建议：扩展现有倒排索引**

```typescript
// 在 kb-inverted-index.repository.ts 中增加 BM25 计算
interface BM25Params {
  k1: number = 1.5  // 词频饱和参数
  b: number = 0.75  // 文档长度归一化参数
}

async searchBM25(query: string, kbId: string, topK: number): Promise<SearchResult[]> {
  // 1. 分词
  const terms = nodejieba.cutForSearch(query)

  // 2. 获取各 term 的倒排索引
  const postings = await this.getPostings(terms, kbId)

  // 3. 计算 IDF
  const totalDocs = await this.getDocumentCount(kbId)
  const idf = this.calculateIDF(postings, totalDocs)

  // 4. 计算各文档的 BM25 分数
  const scores = this.calculateBM25Scores(postings, idf, kbId)

  // 5. 返回 TopK
  return this.getTopKResults(scores, topK)
}
```

**问题2：Reranker API 兼容性**

云端 Reranker 的 API 格式各不相同：
- Cohere: `POST /rerank`
- 阿里云: 需要确认格式
- OpenAI: 不提供独立的 Rerank API

**建议：优先支持阿里云/通义千问 Rerank**

阿里云 DashScope 提供 `gte-rerank` 模型，与现有阿里云配置兼容：

```typescript
async rerankWithDashScope(query: string, documents: SearchResult[], config: RerankerConfig): Promise<SearchResult[]> {
  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gte-rerank',
      input: {
        query,
        documents: documents.map(d => d.content)
      },
      parameters: {
        top_n: documents.length,
        return_documents: false
      }
    })
  })

  // 根据返回的 scores 重新排序
  const data = await response.json()
  return this.applyRerankScores(documents, data.output.results)
}
```

---

### 阶段四：图谱增强（可选）

#### 可行性：⭐⭐⭐ (中等)

| 子模块 | 可行性 | 说明 |
|-------|-------|------|
| SQLite 图谱存储 | ✅ 可行 | 设计合理，与现有架构一致 |
| 实体抽取 | ⚠️ 成本问题 | 需大量 LLM 调用 |
| 图谱检索 | ⚠️ 效果不确定 | NER 准确率和多跳推理效果存疑 |

#### 问题与建议

**问题：实体抽取成本高、质量不稳定**

遍历每个 chunk 调用 LLM 提取实体，成本极高，且效果依赖 Prompt 和 LLM 质量。

**建议：采用简化策略**

1. **只对关键内容提取实体**
   - 仅提取文档标题、摘要
   - 或用户主动添加的文档才进行图谱构建

2. **使用本地小模型**
   - 集成之前讨论的 PyMuPDF 方案
   - 使用本地部署的 7B 模型进行抽取

3. **图谱作为可选功能**
   - 默认关闭，用户手动开启
   - 或只对特定知识库启用

---

## 三、与项目现状的兼容性分析

### 3.1 数据库兼容性

| 修改项 | 影响 | 兼容方案 |
|-------|------|---------|
| kb_chunks 新增字段 | 小 | SQLite 支持 ALTER TABLE，向后兼容 |
| 新增 kb_entities 表 | 小 | 新表不影响现有数据 |
| 新增 kb_relations 表 | 小 | 新表不影响现有数据 |

### 3.2 代码兼容性

| 修改项 | 影响范围 | 评估 |
|-------|---------|------|
| 切分逻辑重构 | knowledge-base.service.ts | 需重构，但接口不变 |
| 检索逻辑增强 | 同上 + 新增 reranker.service.ts | 需新增模块 |
| 前端展示 | 知识库详情页 | 需展示层级信息 |

---

## 四、成本与收益评估

| 阶段 | 开发成本 | API成本增量 | 预期收益 | 推荐度 |
|-----|---------|------------|---------|-------|
| 阶段一 | 中（2周） | 低（可选语义切分） | 高 | ⭐⭐⭐⭐⭐ |
| 阶段二 | 中（2周） | 无 | 高 | ⭐⭐⭐⭐⭐ |
| 阶段三 | 中（2周） | 低（Rerank API） | 中高 | ⭐⭐⭐⭐ |
| 阶段四 | 高（3周） | 高（大量LLM调用） | 不确定 | ⭐⭐⭐ |

---

## 五、关键风险与应对

| 风险 | 严重度 | 应对措施 |
|-----|-------|---------|
| Embedding API 成本失控 | 高 | 采用级联策略减少调用；语义切分可选 |
| 语义切分效果不佳 | 中 | 提供 fallback 到固定切分；用户可选择切分策略 |
| BM25 效果不如预期 | 中 | 可调整权重参数；提供调试接口 |
| 图谱抽取质量不稳定 | 高 | 默认关闭；仅对关键文档启用 |

---

## 六、实施建议调整

### 6.1 调整后的优先级

```
优先实施：
├── 阶段一-A：结构化切分（Markdown 标题识别）
│   → 成本最低，效果立竿见影
│
├── 阶段二：层级索引构建
│   → 依赖阶段一-A，解决结构问题
│
└── 阶段三-A：关键词检索增强（BM25）
    → 利用已有倒排索引，成本很低

后续实施：
├── 阶段一-B：语义切分（可选功能）
│   → 用户手动开启，成本可控
│
├── 阶段三-B：重排序（云端 API）
│   → 用户配置后启用
│
└── 阶段四：图谱增强（可选）
    → 仅对关键知识库启用
```

### 6.2 用户配置设计

```typescript
// 知识库配置扩展
interface KnowledgeBaseConfig {
  // 切分策略
  splitStrategy: 'fixed' | 'structure' | 'semantic' | 'hybrid'

  // 检索配置
  retrieval: {
    useBM25: boolean           // 是否启用关键词检索
    vectorWeight: number       // 向量检索权重 (0-1)
    keywordWeight: number      // 关键词检索权重 (0-1)
    useReranker: boolean       // 是否启用重排序
    rerankerModel?: string     // 重排序模型
  }

  // 图谱配置
  graph: {
    enabled: boolean           // 是否启用图谱
    extractEntities: boolean   // 是否提取实体
  }
}
```

---

## 七、结论

### 可行性总评：✅ 整体可行，建议调整实施顺序

### 核心建议

1. **优先实施阶段一-A（结构化切分）和阶段二（层级索引）**
   - 成本最低，收益最高
   - 解决核心痛点（语义割裂、结构丢失）

2. **语义切分改为可选功能**
   - 默认使用结构化切分
   - 用户可手动开启语义切分（高级选项）

3. **阶段三分步实施**
   - 先实现 BM25（成本低）
   - 后实现 Reranker（需用户配置）

4. **阶段四作为未来规划**
   - 不纳入当前迭代
   - 作为后续高阶功能

### 立即可执行的任务

| 任务 | 优先级 | 预估工时 |
|-----|-------|---------|
| 实现 StructuredSplitter（Markdown） | P0 | 2天 |
| 数据库迁移（新增 chunk 字段） | P0 | 0.5天 |
| 实现 BM25 检索 | P1 | 2天 |
| 实现 RRF 融合 | P1 | 1天 |
| 实现层级索引构建 | P1 | 2天 |
| 前端展示层级信息 | P2 | 1天 |

---

## 附录：建议的技术方案修订

建议将原方案修订为以下结构：

### 阶段一修订：智能切分策略

**默认切分策略：结构化切分**
- Markdown：按标题层级
- PDF：按目录/字体大小判断的标题
- Word/其他：按段落分隔

**可选切分策略：语义切分**
- 用户手动开启
- 采用级联策略降低成本

### 阶段三修订：混合检索（分两步）

**阶段三-A：关键词检索增强**
- 扩展倒排索引实现 BM25
- 实现 RRF 融合
- 预估：2周

**阶段三-B：重排序增强**
- 集成云端 Reranker API
- 预估：1周