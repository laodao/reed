# RAG 系统优化技术方案

> 文档创建时间：2026-04-10
>
> 本文档基于 `docs/webdocs/RAG优化方案讨论.md` 讨论，针对本项目知识库模块设计优化方案。

---

## 一、当前实现分析

### 1.1 现有架构

项目当前的知识库实现位于 `src/main/services/knowledge-base.service.ts`，主要特性：

| 功能模块 | 当前实现 |
|---------|---------|
| 文本切分 | 固定窗口切分（800字符，80字符重叠） |
| 向量存储 | SQLite 存储向量 + 倒排索引 |
| 检索方式 | 纯向量相似度检索 |
| 支持格式 | txt, md, pdf, epub, docx, xlsx |

### 1.2 存在的问题

1. **语义割裂问题**
   - 固定字符切分破坏了文档的语义完整性
   - 一个完整的概念可能被切分到两个不同的块中
   - 检索到的片段缺乏上下文

2. **结构信息丢失**
   - 文档的标题层级结构未保留
   - 无法回答"总结第三章内容"等层级类问题
   - 跨章节关联查询困难

3. **检索精度不足**
   - 缺少重排序机制
   - 无法处理多跳推理问题（如"A公司的CEO毕业于哪所大学"）
   - 混合检索（向量+关键词）未充分融合

---

## 二、优化方案概述

根据讨论，我们设计一个**分阶段实施**的优化方案：

```
阶段一：语义切分优化（基础优化，成本最低）
    ↓
阶段二：层级索引构建（中等成本，显著提升）
    ↓
阶段三：混合检索增强（重排序+关键词融合）
    ↓
阶段四：图谱增强（可选，高阶功能）
```

---

## 三、阶段一：分层级智能切分

### 3.1 设计理念

采用**分层级处理**策略，优先保留文档原有结构，仅在必要时进行语义切分：

```
文档输入
    │
    ▼
┌─────────────────────┐
│ 第一层：结构检测     │
│ 是否有章节格式？     │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
   有章节      无章节
     │           │
     ▼           ▼
┌───────────┐ ┌───────────┐
│ 按章节切分 │ │ 段落语义  │
│           │ │ 切分      │
└─────┬─────┘ └───────────┘
      │
      ▼
┌───────────────────┐
│ 第二层：长度检测   │
│ 章节是否过长？     │
│ (>1000字符)       │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
   过长       正常
     │           │
     ▼           ▼
┌───────────┐ ┌───────────┐
│ 章节内部   │ │ 直接使用  │
│ 语义切分   │ │ 该章节    │
└───────────┘ └───────────┘
```

### 3.2 核心优势

| 优势 | 说明 |
|-----|------|
| **保留结构完整性** | 优先按章节切分，不破坏文档原有结构 |
| **成本可控** | 只有过长章节才调用 Embedding API，大幅降低成本 |
| **效果更好** | 章节本身就是作者划分的语义边界，比算法切分更准确 |
| **灵活适应** | 自动适应不同类型文档（结构化/非结构化） |

### 3.3 技术实现

#### 3.3.1 分层级混合切分器

```typescript
/**
 * 分层级混合切分器
 * 核心逻辑：结构优先 → 长度检测 → 段落级语义切分
 */
class LayeredHybridSplitter {
  private maxSectionLength = 1000  // 章节最大长度阈值
  private similarityThreshold = 0.5  // 语义相似度阈值

  /**
   * 主切分入口
   */
  async split(content: string, fileType: FileType, options?: SplitOptions): Promise<Chunk[]> {
    // 1. 检测文档结构
    const structure = this.detectStructure(content, fileType)

    if (structure.hasSections) {
      // 有章节结构 → 按章节切分（可能需要二级切分）
      return this.splitBySections(content, structure.sections, options)
    } else {
      // 无章节结构 → 直接段落级语义切分
      return this.splitBySemantic(content)
    }
  }

  /**
   * 检测文档结构
   */
  private detectStructure(content: string, fileType: FileType): DocumentStructure {
    const sections: Section[] = []

    switch (fileType) {
      case 'md':
        // Markdown：检测 # 标题
        sections.push(...this.detectMarkdownHeaders(content))
        break

      case 'pdf':
        // PDF：使用 pdfjs-dist 的 getOutline() 或字体大小判断
        // 假设已有结构信息传入
        break

      case 'txt':
        // 纯文本：尝试检测章节模式
        sections.push(...this.detectTextSections(content))
        break

      default:
        // 其他格式默认无结构，走语义切分
        break
    }

    return {
      hasSections: sections.length > 1,  // 至少有2个章节才算有结构
      sections
    }
  }

  /**
   * 检测 Markdown 标题结构
   */
  private detectMarkdownHeaders(content: string): Section[] {
    const lines = content.split('\n')
    const sections: Section[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        sections.push({
          title: match[2].trim(),
          level: match[1].length,
          startLine: i,
          startOffset: this.getLineOffset(content, i)
        })
      }
    }

    return sections
  }

  /**
   * 检测纯文本的章节模式
   * 匹配常见的章节格式：第一章、Chapter 1、一、等
   */
  private detectTextSections(content: string): Section[] {
    const patterns = [
      /^第[一二三四五六七八九十百零]+[章节篇部]/gm,   // 中文章节
      /^Chapter\s+\d+/gim,                        // 英文章节
      /^[一二三四五六七八九十]+[、.．:：]/gm,      // 中文序号
      /^\d+[、.．:：]\s+.+/gm                     // 数字编号
    ]

    const sections: Section[] = []
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.source, pattern.flags)
        if (regex.test(line)) {
          sections.push({
            title: line.trim(),
            level: 1,
            startLine: i,
            startOffset: this.getLineOffset(content, i)
          })
          break
        }
      }
    }

    return sections
  }
}
```

#### 3.3.2 按章节切分（含二级处理）

```typescript
/**
 * 按章节切分，过长章节进行二级语义切分
 */
private async splitBySections(
  content: string,
  sections: Section[],
  options?: SplitOptions
): Promise<Chunk[]> {
  const chunks: Chunk[] = []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const nextSection = sections[i + 1]

    // 提取该章节的内容
    const sectionContent = this.extractSectionContent(
      content,
      section,
      nextSection
    )

    // 检查章节长度
    if (sectionContent.length > this.maxSectionLength) {
      // 过长 → 章节内部进行段落级语义切分
      const subChunks = await this.splitBySemantic(sectionContent)

      // 标注层级信息
      for (const sub of subChunks) {
        sub.metadata = {
          ...sub.metadata,
          sectionTitle: section.title,
          sectionLevel: section.level,
          splitMethod: 'section_semantic'
        }
        chunks.push(sub)
      }
    } else {
      // 正常长度 → 直接作为一个 chunk
      chunks.push({
        content: sectionContent,
        index: chunks.length,
        metadata: {
          sectionTitle: section.title,
          sectionLevel: section.level,
          splitMethod: 'section'
        }
      })
    }
  }

  return chunks
}

/**
 * 提取章节内容
 */
private extractSectionContent(
  content: string,
  section: Section,
  nextSection?: Section
): string {
  const startOffset = section.startOffset
  const endOffset = nextSection ? nextSection.startOffset : content.length

  return content.slice(startOffset, endOffset).trim()
}
```

#### 3.3.3 段落级语义切分

```typescript
/**
 * 段落级语义切分
 * 关键优化：按段落切分，而非按句子，大幅降低成本
 */
private async splitBySemantic(content: string): Promise<Chunk[]> {
  // 1. 按段落切分（双换行分隔）
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())

  if (paragraphs.length <= 1) {
    return [{
      content,
      index: 0,
      metadata: { splitMethod: 'single' }
    }]
  }

  // 2. 批量计算所有段落的 Embedding（一次API调用）
  const embeddings = await this.embeddingService.batchEmbed(paragraphs)

  // 3. 计算相邻段落相似度
  const similarities = this.calculateSimilarities(embeddings)

  // 4. 在相似度骤降处切分
  return this.splitAtBoundaries(paragraphs, similarities)
}

/**
 * 计算相邻段落的余弦相似度
 */
private calculateSimilarities(embeddings: number[][]): number[] {
  const similarities: number[] = []

  for (let i = 0; i < embeddings.length - 1; i++) {
    similarities.push(this.cosineSimilarity(embeddings[i], embeddings[i + 1]))
  }

  return similarities
}

/**
 * 余弦相似度计算
 */
private cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 在相似度边界处切分
 */
private splitAtBoundaries(
  paragraphs: string[],
  similarities: number[]
): Chunk[] {
  const chunks: Chunk[] = []
  let currentBuffer = [paragraphs[0]]
  let chunkIndex = 0

  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i] < this.similarityThreshold) {
      // 相似度低于阈值 → 触发切分
      const chunkContent = currentBuffer.join('\n\n')
      if (chunkContent.trim()) {
        chunks.push({
          content: chunkContent,
          index: chunkIndex++,
          metadata: {
            splitMethod: 'semantic',
            boundarySimilarity: similarities[i]
          }
        })
      }
      currentBuffer = [paragraphs[i + 1]]
    } else {
      // 相似度高于阈值 → 继续合并
      currentBuffer.push(paragraphs[i + 1])
    }
  }

  // 处理剩余内容
  if (currentBuffer.length > 0) {
    const chunkContent = currentBuffer.join('\n\n')
    if (chunkContent.trim()) {
      chunks.push({
        content: chunkContent,
        index: chunkIndex,
        metadata: { splitMethod: 'semantic_tail' }
      })
    }
  }

  return chunks
}
```

### 3.4 成本分析

#### 成本对比

| 切分策略 | 示例文档 | API调用次数 | 成本 |
|---------|---------|------------|------|
| **按句子切分** | 10页 ~500句 | 500次 | ❌ 过高 |
| **按段落切分** | 10页 ~50段 | 1次批量 | ✅ 合理 |
| **分层级策略** | 10页 + 10章节 | 0-2次批量 | ✅ 最优 |

#### 实际场景估算

**一篇 20 页的技术文档：**

| 场景 | 章节情况 | Embedding调用 |
|-----|---------|--------------|
| 有10个章节，每个章节正常长度 | 10章节，无过长 | 0次（无需语义切分） |
| 有10个章节，2个过长 | 10章节 + 2个需处理 | ~20段落×2 = 1次批量调用 |
| 无章节结构 | ~100段落 | 1次批量调用 |

**结论**：分层级策略将 API 成本控制在 0-2 次批量调用，相比原方案降低 **95%以上**。

### 3.5 数据库修改

需要在 `kb_chunks` 表中增加字段以存储层级信息：

```sql
-- 新增字段
ALTER TABLE kb_chunks ADD COLUMN title TEXT;
ALTER TABLE kb_chunks ADD COLUMN level INTEGER DEFAULT 0;
ALTER TABLE kb_chunks ADD COLUMN parent_id TEXT;
ALTER TABLE kb_chunks ADD COLUMN split_method TEXT DEFAULT 'fixed';
-- split_method 取值: 'fixed' | 'section' | 'section_semantic' | 'semantic'
```

### 3.6 实施成本评估

| 项目 | 成本 | 说明 |
|-----|-----|-----|
| 代码开发 | 中 | 需新增约 400 行代码 |
| API 调用成本 | 极低 | 分层级策略，最多 1-2 次批量调用 |
| 兼容性 | 高 | 已有文档可保留，新文档使用新策略 |
| 预期效果 | 高 | 显著改善检索准确率，保留结构完整性 |

---

## 四、阶段二：层级索引构建

### 4.1 目标

构建文档的层级索引，支持：
- 按章节检索
- 返回章节上下文
- 支持"总结第X章"类问题

### 4.2 数据结构设计

```typescript
// 层级索引节点
interface HierarchyNode {
  id: string
  type: 'document' | 'section' | 'chunk'
  title: string
  content?: string  // 摘要或原文
  level: number
  parentId: string | null
  childrenIds: string[]
  chunkIds: string[]  // 该节点下的所有 chunk
  metadata: {
    documentId: string
    startOffset: number
    endOffset: number
  }
}
```

### 4.3 实现方案

```typescript
class HierarchyIndexBuilder {
  /**
   * 构建层级索引
   */
  async buildIndex(documentId: string, chunks: Chunk[]): Promise<HierarchyNode[]> {
    const nodes: HierarchyNode[] = []

    // 1. 创建文档根节点
    const docNode: HierarchyNode = {
      id: `doc_${documentId}`,
      type: 'document',
      title: chunks[0]?.metadata?.documentName || '未命名文档',
      level: 0,
      parentId: null,
      childrenIds: [],
      chunkIds: chunks.map(c => c.id)
    }
    nodes.push(docNode)

    // 2. 按 title 分组 chunks
    const sectionMap = new Map<string, Chunk[]>()

    for (const chunk of chunks) {
      const title = chunk.metadata?.title || 'default'
      if (!sectionMap.has(title)) {
        sectionMap.set(title, [])
      }
      sectionMap.get(title)!.push(chunk)
    }

    // 3. 创建章节节点
    for (const [title, sectionChunks] of sectionMap) {
      const sectionNode: HierarchyNode = {
        id: `section_${randomUUID()}`,
        type: 'section',
        title,
        level: sectionChunks[0]?.metadata?.level || 1,
        parentId: docNode.id,
        childrenIds: [],
        chunkIds: sectionChunks.map(c => c.id)
      }
      nodes.push(sectionNode)
      docNode.childrenIds.push(sectionNode.id)
    }

    return nodes
  }
}
```

### 4.4 层级检索增强

```typescript
class HierarchyRetriever {
  /**
   * 检索时返回层级上下文
   */
  async retrieveWithHierarchy(query: string, kbId: string, topK: number = 5): Promise<EnhancedSearchResult[]> {
    // 1. 向量检索获取相关 chunks
    const chunks = await this.vectorSearch(query, kbId, topK)

    // 2. 为每个 chunk 获取层级上下文
    const results: EnhancedSearchResult[] = []

    for (const chunk of chunks) {
      const hierarchy = await this.getHierarchyPath(chunk.id)
      results.push({
        ...chunk,
        hierarchyContext: {
          documentTitle: hierarchy.document?.title,
          sectionTitle: hierarchy.section?.title,
          parentSectionTitle: hierarchy.parent?.title
        },
        fullContext: this.buildFullContext(chunk, hierarchy)
      })
    }

    return results
  }

  /**
   * 获取 chunk 的层级路径
   */
  private async getHierarchyPath(chunkId: string): Promise<HierarchyPath> {
    // 从数据库查询层级关系
    // 返回: { document, section, parent }
    return {} as HierarchyPath
  }

  /**
   * 构建带层级信息的完整上下文
   */
  private buildFullContext(chunk: Chunk, hierarchy: HierarchyPath): string {
    const parts: string[] = []

    if (hierarchy.document?.title) {
      parts.push(`【文档】${hierarchy.document.title}`)
    }
    if (hierarchy.section?.title) {
      parts.push(`【章节】${hierarchy.section.title}`)
    }
    parts.push(`【内容】${chunk.content}`)

    return parts.join('\n')
  }
}
```

---

## 五、阶段三：混合检索增强

### 5.1 目标

实现向量检索 + 关键词检索的融合，并加入重排序机制。

### 5.2 重排序模型选型

| 方案 | 优点 | 缺点 | 推荐度 |
|-----|-----|-----|-------|
| 云端 API (Cohere) | 效果好、速度快 | 成本高 | ★★★ |
| 本地模型 (BGE-Reranker) | 免费、隐私保护 | 需要 GPU | ★★★★★ |
| 多种选择并存 | 灵活 | 实现复杂 | ★★★★ |

**推荐方案**：支持多种 Reranker，默认使用云端 API（复用已有 Embedding 配置），可选本地模型。

### 5.3 实现方案

```typescript
interface RerankerConfig {
  enabled: boolean
  provider: 'cloud' | 'local'
  modelId?: string
  providerConfigId?: string
}

class RerankerService {
  /**
   * 对检索结果进行重排序
   */
  async rerank(query: string, documents: SearchResult[], config: RerankerConfig): Promise<SearchResult[]> {
    if (!config.enabled || documents.length === 0) {
      return documents
    }

    if (config.provider === 'cloud') {
      return this.rerankWithCloud(query, documents, config)
    } else {
      return this.rerankWithLocal(query, documents, config)
    }
  }

  /**
   * 云端重排序（调用 API）
   */
  private async rerankWithCloud(query: string, documents: SearchResult[], config: RerankerConfig): Promise<SearchResult[]> {
    // 使用配置的提供商进行重排序
    // 例如：Cohere Rerank API 或阿里云重排序 API
    const response = await fetch(this.getRerankUrl(config), {
      method: 'POST',
      headers: this.getHeaders(config),
      body: JSON.stringify({
        model: config.modelId || 'rerank-v1',
        query,
        documents: documents.map(d => d.content)
      })
    })

    const data = await response.json()
    // 根据返回的分数重新排序
    return this.applyRerankScores(documents, data.results)
  }

  /**
   * 本地重排序（需下载模型）
   * 注意：Electron 主进程需要通过子进程调用 Python 模型
   */
  private async rerankWithLocal(query: string, documents: SearchResult[], config: RerankerConfig): Promise<SearchResult[]> {
    // 通过 child_process 调用本地 Python 服务
    // 或使用 transformers.js (性能可能受限)
    throw new Error('本地重排序暂未实现')
  }
}
```

### 5.4 混合检索融合

```typescript
class HybridRetriever {
  vectorWeight: number = 0.7  // 向量检索权重
  keywordWeight: number = 0.3 // 关键词检索权重

  /**
   * 混合检索
   */
  async retrieve(query: string, kbId: string, topK: number = 10): Promise<SearchResult[]> {
    // 1. 向量检索
    const vectorResults = await this.vectorSearch(query, kbId, topK * 2)

    // 2. 关键词检索（BM25）
    const keywordResults = await this.keywordSearch(query, kbId, topK * 2)

    // 3. 融合排序 (RRF - Reciprocal Rank Fusion)
    const fused = this.reciprocalRankFusion(vectorResults, keywordResults)

    // 4. 重排序
    const reranked = await this.reranker.rerank(query, fused, this.rerankerConfig)

    return reranked.slice(0, topK)
  }

  /**
   * RRF 融合算法
   */
  private reciprocalRankFusion(
    vectorResults: SearchResult[],
    keywordResults: SearchResult[],
    k: number = 60
  ): SearchResult[] {
    const scores = new Map<string, number>()

    // 计算向量检索分数
    for (let i = 0; i < vectorResults.length; i++) {
      const id = vectorResults[i].chunkId
      scores.set(id, (scores.get(id) || 0) + this.vectorWeight / (k + i + 1))
    }

    // 计算关键词检索分数
    for (let i = 0; i < keywordResults.length; i++) {
      const id = keywordResults[i].chunkId
      scores.set(id, (scores.get(id) || 0) + this.keywordWeight / (k + i + 1))
    }

    // 按分数排序
    const allResults = [...vectorResults, ...keywordResults]
    const uniqueResults = this.deduplicateById(allResults)

    return uniqueResults.sort((a, b) => (scores.get(b.chunkId) || 0) - (scores.get(a.chunkId) || 0))
  }
}
```

---

## 六、阶段四：图谱增强（可选）

### 6.1 目标

构建轻量级知识图谱，支持多跳推理问题。

### 6.2 技术选型

考虑到 Electron 应用的特点，推荐使用**嵌入式图数据库**：

| 方案 | 特点 | 推荐度 |
|-----|-----|-------|
| Neo4j (Docker) | 功能强大 | ★★★ (需额外部署) |
| NetworkX (内存) | 轻量级 | ★★★★ |
| SQLite + 邻接表 | 最简单 | ★★★★★ |

**推荐方案**：使用 SQLite 存储图谱关系，与现有数据库架构保持一致。

### 6.3 数据库设计

```sql
-- 实体表
CREATE TABLE IF NOT EXISTS kb_entities (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,  -- 'person', 'organization', 'location', 'concept'
  description TEXT,
  chunk_ids TEXT,  -- JSON array of chunk IDs where this entity appears
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
);

-- 关系表
CREATE TABLE IF NOT EXISTS kb_relations (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,  -- 'works_for', 'located_in', 'related_to'
  description TEXT,
  chunk_id TEXT,  -- 提取此关系的 chunk
  confidence REAL DEFAULT 1.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id),
  FOREIGN KEY (source_entity_id) REFERENCES kb_entities(id),
  FOREIGN KEY (target_entity_id) REFERENCES kb_entities(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_kb_entities_kb_id ON kb_entities(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_kb_entities_name ON kb_entities(name);
CREATE INDEX IF NOT EXISTS idx_kb_relations_kb_id ON kb_relations(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_kb_relations_source ON kb_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kb_relations_target ON kb_relations(target_entity_id);
```

### 6.4 实体抽取实现

```typescript
class EntityExtractor {
  private llmService: LLMService

  /**
   * 从文本中提取实体和关系
   */
  async extract(text: string, providerConfigId: string): Promise<ExtractionResult> {
    const prompt = `你是一个知识图谱构建专家。请从以下文本中提取核心实体和它们的关系。

文本内容：
${text}

请以 JSON 格式输出，格式如下：
{
  "entities": [
    {"name": "实体名称", "type": "person|organization|location|concept", "description": "简要描述"}
  ],
  "relations": [
    {"source": "实体A", "target": "实体B", "type": "关系类型", "description": "关系描述"}
  ]
}

注意：
1. 只提取文本中明确提到的实体和关系
2. 关系类型使用动词短语，如"工作于"、"位于"、"属于"等
3. 如果没有发现实体或关系，返回空数组

JSON输出：`

    const response = await this.llmService.chat(prompt, providerConfigId)
    return this.parseExtractionResult(response)
  }

  private parseExtractionResult(response: string): ExtractionResult {
    try {
      // 提取 JSON 部分
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('解析实体抽取结果失败:', e)
    }
    return { entities: [], relations: [] }
  }
}
```

### 6.5 图谱检索

```typescript
class GraphRetriever {
  /**
   * 基于图谱的检索
   */
  async retrieveByGraph(query: string, kbId: string): Promise<SearchResult[]> {
    // 1. 从查询中提取实体
    const queryEntities = await this.extractQueryEntities(query)

    if (queryEntities.length === 0) {
      return []
    }

    // 2. 在图谱中查找相关实体
    const relatedChunks: Set<string> = new Set()

    for (const entity of queryEntities) {
      // 查找实体节点
      const entityNode = await this.findEntityByName(entity, kbId)
      if (entityNode) {
        // 获取该实体关联的所有 chunk
        entityNode.chunkIds.forEach(id => relatedChunks.add(id))

        // 获取关联实体（1跳关系）
        const neighbors = await this.getNeighborEntities(entityNode.id, kbId)
        neighbors.forEach(n => n.chunkIds.forEach(id => relatedChunks.add(id)))
      }
    }

    // 3. 获取 chunk 内容
    return this.getChunksByIds(Array.from(relatedChunks), kbId)
  }

  /**
   * 从查询中提取实体（简化版：提取专有名词）
   */
  private async extractQueryEntities(query: string): Promise<string[]> {
    // 使用 NER 或简单的规则提取
    // 例如：提取引号中的词、大写开头的词等
    const entities: string[] = []

    // 引号中的内容
    const quoted = query.match(/["""](.+?)["""]/g)
    if (quoted) {
      entities.push(...quoted.map(s => s.slice(1, -1)))
    }

    return entities
  }
}
```

---

## 七、实施路线图

### 7.1 分阶段实施计划

```
第 1-2 周：阶段一 - 语义切分优化
├── 实现 StructuredSplitter（Markdown 标题识别）
├── 实现 SemanticSplitter（语义漂移检测）
├── 实现 HybridSplitter（混合策略）
├── 数据库迁移（新增字段）
└── 单元测试 + 集成测试

第 3-4 周：阶段二 - 层级索引构建
├── 设计层级索引数据结构
├── 实现 HierarchyIndexBuilder
├── 修改检索逻辑支持层级上下文
└── 前端 UI 展示层级信息

第 5-6 周：阶段三 - 混合检索增强
├── 实现关键词检索（BM25）
├── 实现 RRF 融合算法
├── 集成重排序 API
└── 性能测试与调优

第 7-8 周：阶段四 - 图谱增强（可选）
├── 数据库设计
├── 实现实体抽取服务
├── 实现图谱检索
└── 端到端测试
```

### 7.2 风险评估

| 风险 | 影响 | 缓解措施 |
|-----|-----|---------|
| Embedding API 成本增加 | 中 | 语义切分可选；使用缓存减少重复调用 |
| 数据库迁移失败 | 高 | 完善备份机制；灰度发布 |
| 图谱抽取质量不稳定 | 中 | 使用 Few-shot Prompt；人工校验样本 |
| 性能下降 | 中 | 引入批处理；异步处理 |

---

## 八、总结

本方案提出了一套**渐进式、低成本、高可行**的 RAG 优化策略：

1. **阶段一（语义切分）**：成本最低，效果显著，建议优先实施
2. **阶段二（层级索引）**：解决结构化问题，与阶段一协同效果好
3. **阶段三（混合检索）**：进一步提升检索精度，性价比高
4. **阶段四（图谱增强）**：高阶功能，按需实施

**推荐实施顺序**：阶段一 → 阶段二 → 阶段三，阶段四可作为后续迭代目标。

---

## 附录：参考资源

1. **语义切分**
   - LlamaIndex SemanticSplitter: https://docs.llamaindex.ai/en/stable/api_reference/node_parsers/semantic_splitter/
   - BGE-M3 Embedding Model: https://huggingface.co/BAAI/bge-m3

2. **重排序模型**
   - BGE-Reranker: https://huggingface.co/BAAI/bge-reranker-v2-m3
   - Cohere Rerank API: https://docs.cohere.com/docs/reranking-guide

3. **知识图谱**
   - LightRAG: https://github.com/HKUDS/LightRAG
   - Microsoft GraphRAG: https://github.com/microsoft/graphrag