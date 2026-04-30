# Plan 2 实施计划 · Batch 2（中等复杂度 + 试点扩展）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** 把核心对话相关 Repo（dialog/message/role/provider-config）+ 多媒体 Repo（translation/voice/cloned-voice/image）+ 立绘相关（portrait-project/character/variant）+ 日记（diary-folder/entry/link/attachment）一次迁完。共 14 个 Repo。

**Architecture:** 沿用 Plan 1 已建立的 Entity + BaseRepository + DataSource 模式。无新基础设施。

**Tech Stack:** 同 Plan 1。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-typeorm-repositories-design.md`

**Plan 2 验收（DoD）：**
```bash
SKIP_PG_TESTS=1 npm run test:unit          # sqlite 矩阵全绿
PGHOST=localhost ... npm run test:unit     # PG 矩阵全绿（需先 npm run pg:up）
npm run build                              # 主进程构建通过
grep -c "this.db.prepare" src/core/database/repositories/{dialog,message,role,provider-config,translation,voice,cloned-voice,image,portrait-project,portrait-character,portrait-variant,diary-folder,diary-entry,diary-link,diary-attachment}.repository.ts  # = 0（每个文件单独 grep）
```

---

## 已建立的迁移模板（每个 Repo 都按此走）

1. **写 Entity**（`src/core/database/entities/<table>.entity.ts`）
   - 严格对齐现有 raw DDL（列名 / 类型 / nullable / 默认值 / 索引）
   - datetime 列用 `type: Date`（跨方言）
   - JSON 列用 `type: 'simple-json'`
   - boolean 在 sqlite 存为 INTEGER 0/1，Entity 声明 `type: 'integer'`，DTO 转 boolean
   - 加入 `entities/index.ts` barrel export

2. **写测试**（`tests/unit/repositories/<repo>.spec.ts`）
   - 用 `describe.each(getTestDialects())` 双方言矩阵
   - 必覆盖：所有公共方法 happy path、JSON 列往返、时间字段自动维护、级联删除、兼容处理

3. **改 Repository**（`src/core/database/repositories/<repo>.repository.ts`）
   - 构造函数收 `DataSource`，继承 `BaseRepository<TEntity, TDto>`
   - 同步签名 → `Promise<T>`（如适用）
   - DTO 字段保留：`null` vs `undefined`、字段名、类型
   - 应用层级联放进 `dataSource.transaction()`
   - 测试转绿

4. **更新 DatabaseManager**（`src/electron/database/index.ts`）
   - `this.<repoName> = new XxxRepository(this.dataSource)`

5. **更新调用站点**（仅同步→异步迁移需要）
   - `grep -rn "dbManager\.<repoName>\." src/`
   - 加 `await` + 函数标 `async`

6. **commit**

---

## Repo 迁移清单（按依赖序）

### Phase A · async 试点扩展（无调用站点更新）

| # | Repo | 行数 | 关键 quirk |
|---|---|---|---|
| 1 | **portrait-project** | 143 | **DDL `created_at DATETIME`，但代码写 `Date.now()`（数字）。DTO 字段是 `number`（epoch ms）。** Entity 仍用 `type: Date`，toDto 用 `Date.getTime()`，create() 用 `new Date(now)`。已有数据可能是 ISO 字符串或数字字符串混合，toDto 兼容处理。 |
| 2 | **portrait-character** | 241 | `createdAt/updatedAt: number` 同上 quirk；`features: string[]` 列存为 JSON，用 simple-json |
| 3 | **portrait-variant** | 319 | 同 quirk；`tags: string[]` 用 simple-json |
| 4 | **role** | 353 | `customParams/knowledgeBaseIds` 是 JSON；`isBuiltin/autoResetModel/enableStream` 是 boolean(int)；多个数值字段（temperature/topP/maxTokens 等） |
| 5 | **provider-config** | 339 | `apiKeyEncrypted`/`accessKeySecretEncrypted` 加密字段；`extraConfig` JSON；`enabledModels` JSON 数组 |
| 6 | **dialog** | 278 | **复杂**：`contextConfig/knowledgeBaseIds/webSearchConfig` 三个 JSON 列；`role_id == 'default-assistant'` 视为 null 兼容；`delete()` 级联删 messages（用 transaction） |
| 7 | **message** | 231 | `attachments/metadata` JSON 列；批量按 `dialog_id` 删除 |
| 8 | **image** | 476 | 最大 / 最复杂；`generationParams` JSON；`favorite` boolean(int)；按 dialog_id 级联（已由 FK CASCADE 处理）；分页查询 |

### Phase B · 同步→异步迁移（需更新调用站点）

| # | Repo | 行数 | 同步方法数 |
|---|---|---|---|
| 9 | **diary-attachment** | 119 | 5 |
| 10 | **diary-link** | 160 | 5 |
| 11 | **diary-folder** | 207 | 10 |
| 12 | **diary-entry** | 260 | 10 |
| 13 | **translation** | 236 | 6 |
| 14 | **voice** | 239 | 5 |
| 15 | **cloned-voice** | 181 | 8 |

> 注：**总计 15 个 Repo**（计数原表 + portrait-character/variant 比 14 多 1）。每个 Repo 一个 git commit。

### Phase C · 收尾

| # | 任务 |
|---|---|
| 16 | 跑 sqlite 矩阵（`SKIP_PG_TESTS=1 npm run test:unit`）全绿 |
| 17 | 跑 PG 矩阵（`npm run pg:up && PG... npm run test:unit`）全绿 |
| 18 | `npm run build` 通过 |
| 19 | 打 tag `phase1/plan-2-batch-2` |

---

## quirk 处理规范

### Q1：epoch ms 时间字段（portrait-* 子系统）

**症状**：DDL 是 `DATETIME DEFAULT CURRENT_TIMESTAMP`，但 Repo 代码写入 `Date.now()`（number），DTO 字段也是 `number`。

**处理**：
- Entity：`@Column({ name: 'created_at', type: Date }) createdAt!: Date`
- toDto：`createdAt: e.createdAt instanceof Date ? e.createdAt.getTime() : (typeof e.createdAt === 'number' ? e.createdAt : new Date(e.createdAt as any).getTime())`
- create：`createdAt: new Date(Date.now())`，TypeORM 自动序列化
- 兼容历史数据：toDto 同时接受 Date / number / ISO 字符串

### Q2：boolean 存为 INTEGER 0/1

**处理**：
- Entity：`@Column({ name: 'is_xxx', type: 'integer', default: 0 }) isXxx!: number`
- DTO：`isXxx: e.isXxx === 1`
- create/update 输入：`isXxx: dto.isXxx ? 1 : 0`

### Q3：JSON 列

**处理**：
- 现有 raw DDL 是 `TEXT`
- Entity：`@Column({ name: 'xxx', type: 'simple-json', nullable: true }) xxx!: T | null`
- 在 sqlite 仍存 TEXT；在 pg 也存 TEXT（simple-json 在 TypeORM 中跨方言都用 TEXT，自动 JSON 序列化/反序列化）
- 已支持的 schema-drift normalize：`SIMPLE-JSON ↔ TEXT` 已映射

### Q4：FK CASCADE 已存在的表（image / message）

**处理**：
- DDL 里有 `FOREIGN KEY ... ON DELETE CASCADE`
- Entity **不**写 `@ManyToOne` 关系装饰器（避免 TypeORM 重新生成 FK）
- 应用层 transaction 删除时显式按外键过滤删除（已存在的级联 SQL 仍生效；多一层应用层兜底无害）

### Q5：role_id 'default-assistant' 兼容（dialog）

**处理**：
- 在 toDto 显式转换：`roleId: e.roleId && e.roleId !== 'default-assistant' ? e.roleId : null`
- getByRoleId(null) 用 QueryBuilder 加 `WHERE role_id IS NULL OR role_id = 'default-assistant'`

---

## 最小迁移示例（portrait-project，第一个要做的）

### Entity

```ts
// src/core/database/entities/portrait-project.entity.ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 现有 portrait_projects DDL：
 *   id TEXT PRIMARY KEY,
 *   name TEXT NOT NULL,
 *   description TEXT,
 *   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
 *
 * Quirk：现有 Repo 代码用 Date.now() 写入数字，DTO 字段是 number；
 *        Entity 仍用 type: Date，DTO 转换在 toDto/create 处理。
 */
@Entity({ name: 'portrait_projects' })
@Index('idx_portrait_projects_created_at', ['createdAt'])
export class PortraitProjectEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
```

### Repository（关键片段）

```ts
private toDto(e: PortraitProjectEntity): PortraitProject {
  return {
    id: e.id,
    name: e.name,
    description: e.description || undefined,
    createdAt: this.toEpochMs(e.createdAt),
    updatedAt: this.toEpochMs(e.updatedAt),
  }
}

private toEpochMs(v: Date | number | string): number {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  return new Date(v).getTime()
}

async create(request: CreatePortraitProjectRequest): Promise<PortraitProject> {
  const id = randomUUID()
  const nowMs = Date.now()
  const entity = this.repo.create({
    id,
    name: request.name,
    description: request.description ?? null,
    createdAt: new Date(nowMs),
    updatedAt: new Date(nowMs),
  })
  const saved = await this.repo.save(entity)
  return this.toDto(saved)
}
```

---

## Plan 2 完成后状态

- 4/65 Repo 已迁（Plan 1 试点）→ 19/65 Repo 已迁（Plan 2 完成后）
- 剩余 ~46 个 Repo 留给 Plan 3-5（主要是长文写作 LW 子系统 + 视频/剧集 + KB + 收尾）
