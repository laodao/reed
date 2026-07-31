# 步骤 0 实施报告 - 向量索引基础设施

> 日期：2026-07-31
> 分支：feat/longwriting-context-builder
> 状态：✅ 完成（75 个测试全过 + KB 回归通过）
> 关联：[Spec](./longwriting-step0-vector-infra-spec.md)、[Plan](./longwriting-step0-vector-infra-plan.md)

---

## 交付内容

### 新建文件
| 文件 | 说明 |
|------|------|
| `src/core/database/entities/lw-vector-index.entity.ts` | LwVectorIndexEntity（lw_vector_indices 表） |
| `src/core/database/repositories/lw-vector-index.repository.ts` | LwVectorIndexRepository（CRUD + getContentHashes） |
| `src/core/database/migrations/create-lw-vector-indices.ts` | 幂等建表迁移（PG + sqlite） |
| `src/core/database/migrations/extend-kb-vectors-metadata.ts` | kb_vectors 加 4 元数据列（PG） |
| `src/core/services/longwriting/lw-vector-serializer.ts` | 实体→文本序列化器（纯函数） |
| `src/core/services/longwriting/lw-vector-index.service.ts` | 核心服务（indexEntity/indexChapter/search/upsert/重建） |
| 测试 10 个文件 | 见下 |

### 修改文件
- `src/shared/types/longwriting.types.ts` — StoryStage 加 'embedding' + LwVectorEntityType 等
- `src/core/services/vector/vector-store.interface.ts` — VectorRecord 加 4 可选元数据字段 + IVectorStore 纯新增 3 方法（**0 删除/0 修改旧方法**）
- `src/core/services/vector/pg-vector-store.ts` — insertBatch 扩 11 列 + searchByMetadata/deleteByMetadata/countByProject（全参数化防注入）
- `src/core/services/vector/lance-db-vector-store.ts` — 适配层转发 + toLanceRecord 透传
- `src/core/services/lance-db.service.ts` — ensureVectorSchema 懒迁移（备份表+回滚+版本标记）+ escape/buildLanceWhere（防注入）+ 3 新方法
- `src/core/database/database-manager.interface.ts` + PC `electron/database/index.ts` + Web `web-database-manager.ts` — lwVectorIndices 三端注册
- `src/electron/database/index.ts` runMultiTenantMigrations + `src/web/server/index.ts` — 迁移接入启动流程
- `src/electron/ipc/handlers/longwriting.handler.ts` + `src/preload/index.ts` — vectorIndex IPC + preload

---

## 验收标准达成

| # | 验收点 | 结果 |
|---|--------|------|
| 0.1 向后兼容 | ✅ IVectorStore 接口 diff 纯新增（0 删除/0 修改）；KB 单测 4/4 通过 |
| 0.2 元数据过滤 | ✅ service 测试 + pg/lance where 构造测试覆盖 |
| 0.3 LanceDB 迁移 | ✅ 集成测试 3/3：旧 5 列→9 列 + 数据保留 + 幂等 + 隔离 |
| 0.4 入库检索 | ✅ service 测试覆盖 indexEntity/indexChapter/search |
| 0.5 增量更新 | ✅ service 测试：同内容跳过（embedding 调 1 次）+ 改名重建（调 2 次 + 删旧 chunk） |
| 0.6 隔离 | ✅ 迁移测试：旧 KB projectId=null + countByProject=0 |
| 0.7 双端一致 | ✅ LanceDB + pgvector 等价实现（pgvector 测试 mock SQL 参数化） |
| 0.8 测试覆盖 | ✅ 10 文件 75 测试全过 |

---

## 关键设计决策（落地版）

- **D1 向后兼容**：VectorRecord 4 新字段全可选；旧 KB 不传 → null；旧检索走 searchSimilar 不受影响
- **D2 LanceDB 迁移**：schema_meta 版本表 + 备份表 + 分批迁 + count 校验 + 失败回滚（已端到端验证）
- **D3 防注入**：LanceDB escapeLanceValue 转义单引号（测试覆盖恶意输入）；pgvector 全参数化
- **D4 embedding 配置**：stage='embedding' 配置驱动，兜底回退 stage='chapters'，都无则抛明确错误
- **D5 序列化**：真实字段（character.rolePosition 非 role）；id[] 解析成名字；空字段省略
- **D6 增量更新**：sha256 contentHash 比对，未变跳过 embedding
- **D7 章节切片**：strategy='fixed' 避免 embedding 依赖（no-op EmbeddingService）
- **D8 占位 record**：chapterNumber 用 0（非 null）让 LanceDB 推断 integer 类型（实际数据可为 null）

## 测试清单（10 文件 75 用例）
- `tests/unit/services/vector/vector-store-interface.spec.ts`（10）
- `tests/unit/services/vector/pg-vector-store-metadata.spec.ts`（7）
- `tests/unit/services/vector/lance-db-vector-store-metadata.spec.ts`（6）
- `tests/unit/services/vector/lance-where-builder.spec.ts`（12）
- `tests/unit/services/longwriting/lw-vector-serializer.spec.ts`（10）
- `tests/unit/services/longwriting/lw-vector-index.service.spec.ts`（8）
- `tests/unit/repositories/lw-vector-index.repository.spec.ts`（13）
- `tests/unit/migrations/create-lw-vector-indices.spec.ts`（4）
- `tests/unit/migrations/extend-kb-vectors-metadata.spec.ts`（2）
- `tests/unit/integration/lance-db-vector-schema-migration.spec.ts`（3）

---

## 后续步骤衔接
- **步骤1 ContextBuilder**：消费 `LwVectorIndexService.search()` 做语义检索（替代 getMemoryContext 按章节号截断）
- **步骤2 ExtractionPipeline**：VectorIndexStep 调 `indexChapter`/`upsertEntity` 在章节完成时入库
- **步骤6 前端面板**：消费 IPC `vectorIndex.search/stats/rebuildProject`

## 未做（本步骤外）
- Web 端 HTTP/controller 暴露（pgvector 实现已就绪，仅缺 HTTP 入口）
- 手动 PC 端验证（需启动 dev + 配置 embedding 模型，留给集成阶段）
