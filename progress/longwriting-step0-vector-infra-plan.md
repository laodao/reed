# 步骤 0 Plan - 向量库基础设施扩展

> 步骤：0 / 8
> 名称：向量库基础设施
> 日期：2026-07-31
> 依赖：无
> 关联：[步骤0 Spec](./longwriting-step0-vector-infra-spec.md)
> 预估：3-4 工作日

---

## 1. 任务拆解（TDD 顺序：测试先行）

### 阶段 A：接口与类型定义（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| A1 | `src/core/services/vector/vector-store.interface.ts` | 新增 VectorMetadataFilter / VectorSearchOptions / VectorDeleteByFilter / VectorSearchResult 类型；VectorRecord 加可选元数据字段；IVectorStore 新增 searchByMetadata / deleteByMetadata / countByProject（旧签名不动） |
| A2 | 类型导出 | 确保 `src/shared/types` 或 core 导出供双端使用 |
| A3 | 编写接口契约测试 | 验证旧 searchSimilar 签名兼容（编译期保证） |

**产出**：接口扩展完成，knowledge-base 模块编译通过零改动。

### 阶段 B：LanceDB 实现扩展（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| B1 | `src/core/services/lance-db.service.ts` | vectors 表 schema 加 projectId/entityType/entityId/chapterNumber 列 |
| B2 | 同上 | 实现 `ensureSchema()`：检测旧 schema → drop+recreate+迁移旧数据（分批，备份表） |
| B3 | 同上 | 实现 `searchByMetadata`：构造 where 条件链 |
| B4 | 同上 | 实现 `deleteByMetadata` / `countByProject` |
| B5 | 测试 `lance-db.service.spec.ts` | ensureSchema 旧表迁移、searchByMetadata 多条件、deleteByMetadata |

**关键风险**：LanceDB schema 变更。先在隔离测试库验证 drop+recreate+迁移流程，再合入。

### 阶段 C：pgvector 实现同步（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| C1 | `src/core/services/vector/pg-vector-store.ts` | ALTER 表加列、searchByMetadata 加 WHERE、deleteByMetadata、countByProject |
| C2 | 测试 | pgvector 对应测试（Web 端） |

**注意**：Web 端测试可后置，但接口实现须同步（铁律：双端一致）。

### 阶段 D：lw_vector_indices Entity + Repository（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| D1 | `src/core/database/entities/lw-vector-index.entity.ts` | 新建 entity（按 spec §5.1） |
| D2 | `src/core/database/entities/index.ts` | 注册导出，加入 `*_ENTITIES` 数组 |
| D3 | `src/core/database/repositories/lw-vector-index.repository.ts` | 新建 repository（按 spec §5.2） |
| D4 | `src/core/database/database-manager.interface.ts` | 加 `lwVectorIndices` 字段 + 实现注入 |
| D5 | 迁移 `src/main/database/migrations/add-lw-vector-indices.ts` | CREATE TABLE |
| D6 | 测试 `lw-vector-index.repository.spec.ts` | CRUD + 各删除方法 + getContentHash |

### 阶段 E：LwVectorIndexService（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| E1 | `src/core/services/longwriting/lw-vector-index.service.ts` | 新建 service（按 spec §6） |
| E2 | 同上 | 序列化策略（各 entityType） |
| E3 | 同上 | indexEntity / indexChapter（复用 HybridSplitter）/ indexMemory |
| E4 | 同上 | search（embedding + searchByMetadata + preview） |
| E5 | 同上 | upsertEntity（hash 增量） |
| E6 | 同上 | deleteByProject / deleteByChapter / rebuildProjectIndex |
| E7 | 测试 `lw-vector-index.service.spec.ts` | mock IVectorStore + getEmbeddingVectors；验证序列化、增量、检索过滤、删除联动 |

### 阶段 F：IPC + 集成（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| F1 | `src/electron/ipc/handlers/longwriting.handler.ts` | 新增 vectorIndex:rebuildProject / search / stats |
| F2 | `src/preload/index.ts` | 注册 API |
| F3 | Web 端 controller | `packages/web-server/src/modules/longwriting/` 同步 |
| F4 | 集成测试 | 设定入库→检索→命中；章节切片；增量；与 knowledge-base 隔离 |
| F5 | 回归测试 | 现有 knowledge-base e2e 用例通过 |

---

## 2. 依赖与顺序

```
A (接口) → B (LanceDB) ─┐
                         ├→ D (entity+repo) → E (service) → F (IPC+集成)
A → C (pgvector) ────────┘
```

A 必须先做（接口契约）。B/C/D 可并行。E 依赖 D + A/B。F 依赖 E。

---

## 3. 测试策略

### 3.1 单元测试（core 层）
- `lw-vector-index.repository.spec.ts`：纯数据库 CRUD（用内存 SQLite 或测试库）
- `lw-vector-index.service.spec.ts`：mock IVectorStore + getEmbeddingVectors
  - 序列化各 entityType 输出正确
  - upsertEntity：hash 相同跳过、不同重 embedding
  - search：entityType/chapterNumberLte 过滤
  - deleteByChapter 联动 IVectorStore.deleteByChunkIds
- `lance-db.service.spec.ts`：
  - ensureSchema：模拟旧表（无 projectId 列）→ 迁移后含新列 + 旧数据保留
  - searchByMetadata：单条件/多条件 AND
  - 迁移失败回滚（备份表保留）

### 3.2 集成测试
- `longwriting-vector-index.integration.spec.ts`：
  - 创建项目 + 角色 → indexEntity → search 命中
  - 章节内容 → indexChapter → search chapterNumberLte 过滤
  - 改角色名 → upsertEntity → search 命中新名
  - 删除项目 → 向量同步删
  - **隔离测试**：知识库文档入库 + 长文入库，长文 search 不返回知识库数据

### 3.3 回归测试
- 跑现有 `tests/e2e/web/` 下 knowledge-base 相关用例，确保旧 searchSimilar 不受影响

---

## 4. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| LanceDB drop+recreate 迁移丢数据 | 中 | 高 | 备份表 + 分批迁移 + 迁移后校验 count + 失败回滚 |
| ensureSchema 在每次启动跑影响启动速度 | 低 | 中 | 迁移完成后持久化标记（如 `vectors_schema_version` 表），后续启动跳过 |
| HybridSplitter 配置与知识库冲突 | 低 | 低 | 长文切片用独立配置实例，不修改知识库配置 |
| pgvector Web 端无法本地测试 | 中 | 中 | 接口实现同步，测试用 mock IVectorStore；Web 端集成测试在 CI 跑 |
| embedding 调用失败（网络/key） | 中 | 中 | upsertEntity/indexChapter 捕获错误记录到 lw_vector_indices.errorMessage（可选加字段），不阻塞主流程 |

---

## 5. 交付物清单

- [ ] `vector-store.interface.ts` 接口扩展（向后兼容）
- [ ] `lance-db.service.ts` schema 迁移 + searchByMetadata
- [ ] `pg-vector-store.ts` 同步实现
- [ ] `lw-vector-index.entity.ts` + 注册
- [ ] `lw-vector-index.repository.ts` + database-manager 注入
- [ ] 迁移 `add-lw-vector-indices.ts`
- [ ] `lw-vector-index.service.ts`
- [ ] IPC + preload + Web controller
- [ ] 单元测试（repository / service / lance-db）
- [ ] 集成测试（入库-检索-增量-隔离）
- [ ] 回归测试通过

---

## 6. 验收检查表

- [ ] IVectorStore 旧签名未变，knowledge-base 编译+测试零改动
- [ ] searchByMetadata 按 projectId/entityType/chapterNumber 过滤生效
- [ ] LanceDB 旧 schema 自动迁移，旧数据不丢
- [ ] LwVectorIndexService 设定/章节入库 + 检索 + 增量更新
- [ ] 长文向量与知识库向量隔离
- [ ] 双端实现一致
- [ ] 所有测试通过

---

## 7. 后续衔接

本步骤完成后：
- **步骤1 ContextBuilder** 可调用 `LwVectorIndexService.search` 做语义检索
- **步骤2 ExtractionPipeline** 可调用 `indexChapter` / `upsertEntity` 在章节完成后入库

本步骤产出的接口契约（IVectorStore 新方法、LwVectorIndexService）冻结，后续步骤依赖不再变动。
