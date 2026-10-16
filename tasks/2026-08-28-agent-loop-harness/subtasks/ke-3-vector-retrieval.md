# KE-3 · 向量化检索（M-Ke2 主体）

> 前置：KE-2。**存储路线已钉死（评审 P0）：knowledgeBaseId 分区键方案，零 IVectorStore 接口改动。**

## 分区键约定

```
'mem:{userId}'                          → L1 用户层
'mem:{userId}:biz:{module}'             → L2 业务层
'mem:{userId}:proj:{module}:{projectId}' → L3 项目层
```

租户隔离**按构造成立**（分区键含 userId，永不查他人分区）；分层配额天然对齐（每层查各的分区）。

## 改动

| 文件 | 内容 |
| --- | --- |
| `memory-flywheel.ts` | 嵌入管线：条目 approve 后异步嵌入（getEmbeddingVectors，模型=提供商 embedding 配置如 qwen3.7-text-embedding；文本=title+content 截断）→ 写 IVectorStore（kbId=分区键，metadata 用现有五字段承载 entity_ref）→ 回填 embedding_id/content_hash/embed_model；content_hash **或 embed_model** 变了才重嵌入（评审 P2-8 漂移纪律）；失败降级关键词（embedding_id 空） |
| `assemble` | 升级混合：按层 searchSimilar(kbId=分区键，3 倍召回) ∪ 关键词命中 → 融合排序 → 配额截断；embedding 失败自动全关键词 |
| 删除/失效 | 条目失效同步删向量记录（按向量记录 id） |

## 测试

- 单测（mock IVectorStore）：分区键拼接正确；按层召回与融合排序；降级路径（嵌入 throw→关键词兜底）
- 增量：content_hash 不变不重嵌入；embed_model 变化触发重嵌入
- 租户：分区键含 userId 强制断言

## 冒烟（一次性，成本红线）

真实嵌入 3 条 + 1 次检索断言召回（结构化产物校验，不做主观评判）；embedding 停用开关验证降级。
