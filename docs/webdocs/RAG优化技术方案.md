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

## 三、阶段一：语义切分优化

### 3.1 目标

将固定窗口切分改为**混合切分策略**：
- 结构化文档：按标题层级切分
- 非结构化文档：按语义漂移切分

### 3.2 技术实现

#### 3.2.1 结构化切分（Markdown/PDF标题识别）

**核心思路**：利用文档自身的标题结构进行切分，保留语义完整性。

```typescript
// 新增：结构化切分器
interface DocumentSection {
  level: number       // 标题级别 (1-6)
  title: string       // 标题内容
  content: string     // 该章节下的正文
  parentId?: string   // 父章节ID
  children: string[]  // 子章节ID列表
}

class StructuredSplitter {
  /**
   * 从 Markdown 中提取标题结构
   */
  parseMarkdownStructure(content: string): DocumentSection[] {
    const lines = content.split('\n')
    const sections: DocumentSection[] = []
    let currentSection: DocumentSection | null = null
    let contentBuffer: string[] = []

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headerMatch) {
        // 遇到新标题，保存之前的内容
        if (currentSection) {
          currentSection.content = contentBuffer.join('\n').trim()
          sections.push(currentSection)
        }

        currentSection = {
          level: headerMatch[1].length,
          title: headerMatch[2].trim(),
          content: '',
          children: []
        }
        contentBuffer = []
      } else if (currentSection) {
        contentBuffer.push(line)
      }
    }

    // 保存最后一个章节
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n').trim()
      sections.push(currentSection)
    }

    return this.buildHierarchy(sections)
  }

  /**
   * 构建层级关系
   */
  private buildHierarchy(sections: DocumentSection[]): DocumentSection[] {
    const stack: DocumentSection[] = []

    for (const section of sections) {
      // 找到父节点
      while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
        stack.pop()
      }

      if (stack.length > 0) {
        section.parentId = stack[stack.length - 1].title
        stack[stack.length - 1].children.push(section.title)
      }

      stack.push(section)
    }

    return sections
  }
}
```

#### 3.2.2 语义漂移切分（非结构化文本）

**核心思路**：计算相邻句子/段落的语义相似度，在相似度骤降处切分。

```typescript
interface SemanticSplitter {
  embeddingService: EmbeddingService
  similarityThreshold: number  // 相似度阈值，默认 0.5

  /**
   * 基于语义漂移的切分
   */
  async splitBySemanticDrift(text: string): Promise<Chunk[]> {
    // 1. 分句/分段
    const sentences = this.splitSentences(text)

    if (sentences.length <= 1) {
      return [{ content: text, index: 0 }]
    }

    // 2. 计算相邻句子的嵌入向量
    const embeddings = await this.embeddingService.batchEmbed(sentences)

    // 3. 计算相似度序列
    const similarities: number[] = []
    for (let i = 0; i < embeddings.length - 1; i++) {
      similarities.push(this.cosineSimilarity(embeddings[i], embeddings[i + 1]))
    }

    // 4. 寻找切分点（相似度低于阈值处）
    const chunks: Chunk[] = []
    let currentStart = 0
    let chunkIndex = 0

    for (let i = 0; i < similarities.length; i++) {
      if (similarities[i] < this.similarityThreshold) {
        // 触发切分
        const chunkContent = sentences.slice(currentStart, i + 1).join('')
        if (chunkContent.trim()) {
          chunks.push({
            content: chunkContent,
            index: chunkIndex++,
            metadata: {
              splitReason: 'semantic_drift',
              avgSimilarity: this.average(similarities.slice(currentStart, i))
            }
          })
        }
        currentStart = i + 1
      }
    }

    // 处理剩余部分
    if (currentStart < sentences.length) {
      const chunkContent = sentences.slice(currentStart).join('')
      if (chunkContent.trim()) {
        chunks.push({
          content: chunkContent,
          index: chunkIndex,
          metadata: { splitReason: 'tail' }
        })
      }
    }

    return chunks
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  }
}
```

#### 3.2.3 混合切分策略

```typescript
class HybridSplitter {
  structuredSplitter: StructuredSplitter
  semanticSplitter: SemanticSplitter
  maxChunkSize: number = 1000  // 最大块大小

  async split(content: string, fileType: FileType): Promise<Chunk[]> {
    // 1. 结构化文档优先使用结构切分
    if (this.isStructured(fileType)) {
      const sections = this.structuredSplitter.parseStructure(content, fileType)
      const chunks: Chunk[] = []

      for (const section of sections) {
        // 2. 检查章节是否过长
        if (section.content.length > this.maxChunkSize * 1.5) {
          // 过长章节进行二次语义切分
          const subChunks = await this.semanticSplitter.splitBySemanticDrift(section.content)
          for (const sub of subChunks) {
            sub.metadata = {
              ...sub.metadata,
              parentTitle: section.title,
              level: section.level
            }
            chunks.push(sub)
          }
        } else {
          chunks.push({
            content: section.content,
            metadata: {
              title: section.title,
              level: section.level,
              parentId: section.parentId
            }
          })
        }
      }

      return chunks
    }

    // 3. 非结构化文档直接语义切分
    return this.semanticSplitter.splitBySemanticDrift(content)
  }

  private isStructured(fileType: FileType): boolean {
    return ['md', 'docx', 'pdf'].includes(fileType)
  }
}
```

### 3.3 数据库修改

需要在 `kb_chunks` 表中增加字段以存储层级信息：

```sql
-- 新增字段
ALTER TABLE kb_chunks ADD COLUMN title TEXT;
ALTER TABLE kb_chunks ADD COLUMN level INTEGER DEFAULT 0;
ALTER TABLE kb_chunks ADD COLUMN parent_id TEXT;
ALTER TABLE kb_chunks ADD COLUMN split_method TEXT DEFAULT 'fixed'; -- 'fixed' | 'structure' | 'semantic'
```

### 3.4 实施成本评估

| 项目 | 成本 | 说明 |
|-----|-----|-----|
| 代码开发 | 中 | 需新增约 300 行代码 |
| API 调用成本 | 低 | 仅语义切分时需额外调用 Embedding API |
| 兼容性 | 高 | 已有文档可保留，新文档使用新策略 |
| 预期效果 | 高 | 显著改善检索准确率 |

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