# 新版人像设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec `docs/superpowers/specs/2026-07-24-portrait-redesign-spec.md` 实现新版人像设计（framing 半身/全身、提示词模板系统、修改面部、生成全身、token 驱动的新工作台）。

**Architecture:** 数据层（TypeORM 迁移 + Entity + Repository，双端注册）→ 核心服务（`src/core/services/portrait.service.ts` 重构+新增，TDD）→ IPC/preload（只新增通道）→ 前端工作台（`src/renderer/src/components/portrait/workbench/`，样式全 token 驱动）。视觉以已批准原型 `docs/ui-prototypes/portrait-design/` 为准。

**Tech Stack:** TypeScript / TypeORM (SQLite+PG) / Vitest / Vue3 Composition API / Element Plus / SCSS

**关键既有事实（实施时不必再查）：**
- 迁移模式：幂等函数 `(ds: DataSource) => Promise<void>`，参考 `src/core/database/migrations/add-character-binding-race.ts`；注册点 `src/electron/database/index.ts`（`runMultiTenantMigrations` 等区域）与 `src/web/server/index.ts`
- Repository 模式：参考 `src/core/database/repositories/portrait-variant.repository.ts`（extends BaseRepository，toDto，user_id 隔离）；注册点 `src/electron/database/index.ts:4112` 与 `src/web/server/platform/web-database-manager.ts:200`
- dbManager 接口：`src/core/database/database-manager.interface.ts:126-128`
- 测试模式：vitest 模块级 mock，参考 `tests/unit/services/portrait.service.spec.ts`（mock `@core/services/image.service`、`fs`、`@core/interfaces/event.interface`）
- 测试命令：`npm test -- tests/unit/services/xxx.spec.ts`（单文件）/ `npm run test:unit`（全量）
- IPC 模式：`src/electron/ipc/handlers/portrait.handler.ts`（通道 `portrait:*`，service 已返回 `{success,data,error}`）；preload `src/preload/index.ts:979` 的 `portrait` 对象
- 尺寸三级优先级：request > variant.config > DEFAULT_PORTRAIT_W/H（现有测试锁定，不得破坏）
- 前端现有结构：`src/renderer/src/views/Portrait.vue`（列表+选择逻辑），`src/renderer/src/components/portrait/CharacterEditor.vue`（旧编辑器，本阶段保留）

---

## M1 数据层

### Task 1: framing 类型定义 + variant 加列迁移

**Files:**
- Modify: `src/shared/types/portrait.types.ts`
- Modify: `src/core/database/entities/portrait-variant.entity.ts`
- Create: `src/core/database/migrations/add-portrait-variant-framing.ts`
- Modify: `src/electron/database/index.ts`（迁移注册区）
- Modify: `src/web/server/index.ts`（迁移注册区）

- [ ] **Step 1: 类型扩展**

`src/shared/types/portrait.types.ts`：

```ts
// 加在 PortraitAngle 定义附近
export type PortraitFraming = 'half' | 'full'

// PortraitVariantType 改为
export type PortraitVariantType = 'base' | 'clothes' | 'background' | 'face'

// 参考图语义角色
export type ReferenceImageRole = 'character' | 'face' | 'pose' | 'clothing' | 'background'

// PortraitVariant 接口加字段
export interface PortraitVariant {
  // ...现有字段保持不变
  framing?: PortraitFraming   // 新增；undefined 视为 'full'（存量数据）
}

// PortraitVariantInfo 加字段
export interface PortraitVariantInfo {
  clothesDescription?: string
  backgroundDescription?: string
  backgroundType?: 'solid' | 'preset' | 'custom' | 'image'
  backgroundColor?: string
  presetScene?: string
  faceDescription?: string      // 新增
  faceTemplateId?: string       // 新增
}

// VARIANT_TYPE_LABELS 加
export const VARIANT_TYPE_LABELS: Record<PortraitVariantType, string> = {
  base: '基础形象',
  clothes: '换衣变体',
  background: '换背景变体',
  face: '面部变体'
}

// framing 显示名 + prompt 后缀（前后端共用的默认值，可被调用方覆盖）
export const FRAMING_LABELS: Record<PortraitFraming, string> = {
  half: '半身',
  full: '全身'
}
export const FRAMING_PROMPT_SUFFIX: Record<PortraitFraming, string> = {
  half: 'upper body shot, bust portrait, head and shoulders visible',
  full: 'full body shot, standing upright, complete figure from head to toe'
}
```

- [ ] **Step 2: Entity 加列**

`src/core/database/entities/portrait-variant.entity.ts`，在 `angle` 列后加：

```ts
  @Column({ name: 'framing', type: 'varchar', nullable: true })
  framing!: string | null
```

- [ ] **Step 3: 迁移（幂等，双方言）**

`src/core/database/migrations/add-portrait-variant-framing.ts`：

```ts
/**
 * portrait_variants 增加 framing（取景范围 half/full）字段。
 * 存量行回填 'full'（历史上所有生成均硬编码全身后缀）。
 * 幂等加列。兼容 SQLite + PG。
 */
import type { DataSource } from 'typeorm'

export async function addPortraitVariantFraming(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'portrait_variants', isPg))) {
    console.log('[add-portrait-variant-framing] portrait_variants 不存在，跳过')
    return
  }

  if (!(await checkColumnExists(ds, 'portrait_variants', 'framing', isPg))) {
    const type = isPg ? 'text' : 'TEXT'
    await ds.query(`ALTER TABLE portrait_variants ADD COLUMN framing ${type}`)
    console.log('[add-portrait-variant-framing] 加列 framing')
  }

  await ds.query(
    `UPDATE portrait_variants SET framing = 'full' WHERE framing IS NULL`,
  )
  console.log('[add-portrait-variant-framing] 存量行回填 framing=full')
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`PRAGMA table_info(${table})`)
  return rows.some((r: { name: string }) => r.name === column)
}
```

- [ ] **Step 4: 双端注册迁移**

`src/electron/database/index.ts` 在现有迁移调用区（参考 `addCharacterBindingRace` 的调用处）加：

```ts
const { addPortraitVariantFraming } = await import('@core/database/migrations/add-portrait-variant-framing')
await addPortraitVariantFraming(this.dataSource)
```

`src/web/server/index.ts` 同样位置加同等两行（`this.dataSource` 或该文件实际数据源变量名）。

- [ ] **Step 5: Repository DTO 透出 framing**

`src/core/database/repositories/portrait-variant.repository.ts` 的 `toDto` 加一行：

```ts
      framing: (e.framing as PortraitVariant['framing']) ?? 'full',
```

`CreateVariantInput` 加 `framing?: PortraitFraming`，create 方法落库时写入。

- [ ] **Step 6: 构建 + 启动验证迁移**

Run: `npm run build:main && npm run dev`（观察控制台 `[add-portrait-variant-framing]` 日志，无报错）
Expected: 启动正常，日志出现加列/回填或（二次启动）无任何输出（幂等）

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/portrait.types.ts src/core/database/entities/portrait-variant.entity.ts src/core/database/migrations/add-portrait-variant-framing.ts src/core/database/repositories/portrait-variant.repository.ts src/electron/database/index.ts src/web/server/index.ts
git commit -m "feat(portrait): variant 增加 framing 取景范围字段（迁移+回填+DTO）"
```

---

### Task 2: portrait_prompt_templates 表 + Entity + Repository + 注册

**Files:**
- Create: `src/core/database/entities/portrait-prompt-template.entity.ts`
- Create: `src/core/database/repositories/portrait-prompt-template.repository.ts`
- Create: `src/core/database/migrations/create-portrait-prompt-templates.ts`
- Modify: `src/shared/types/portrait.types.ts`
- Modify: `src/core/database/database-manager.interface.ts`
- Modify: `src/electron/database/index.ts`（repo 注册 + 迁移注册）
- Modify: `src/web/server/platform/web-database-manager.ts`（repo 注册）
- Modify: `src/web/server/index.ts`（迁移注册）

- [ ] **Step 1: 类型定义**

`src/shared/types/portrait.types.ts` 追加：

```ts
export type PromptTemplateCategory = 'face' | 'body' | 'clothing' | 'background'
export type PortraitGenerationScene = 'generate' | 'regenerate' | 'face' | 'clothes'

export interface PortraitPromptTemplate {
  id: string
  name: string
  category: PromptTemplateCategory
  content: string                    // 支持 {name}/{gender}/{age} 占位符
  applyTo: PortraitGenerationScene[]
  builtin: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export const PROMPT_TEMPLATE_CATEGORY_LABELS: Record<PromptTemplateCategory, string> = {
  face: '面部',
  body: '全身比例',
  clothing: '发型+服装',
  background: '背景'
}
```

- [ ] **Step 2: Entity**

`src/core/database/entities/portrait-prompt-template.entity.ts`：

```ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'portrait_prompt_templates' })
export class PortraitPromptTemplateEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Index()
  @Column({ name: 'category', type: 'varchar' })
  category!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'apply_to', type: 'simple-json', nullable: true })
  applyTo!: string[] | null

  @Column({ name: 'builtin', type: 'boolean', default: false })
  builtin!: boolean

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
```

- [ ] **Step 3: 建表迁移**

`src/core/database/migrations/create-portrait-prompt-templates.ts`（结构与 Task 1 Step 3 相同的 checkTableExists 辅助）：

```ts
/**
 * 创建 portrait_prompt_templates（人像提示词模板）表。幂等。兼容 SQLite + PG。
 */
import type { DataSource } from 'typeorm'

export async function createPortraitPromptTemplates(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (await checkTableExists(ds, 'portrait_prompt_templates', isPg)) return

  if (isPg) {
    await ds.query(`
      CREATE TABLE portrait_prompt_templates (
        id text PRIMARY KEY,
        user_id text,
        name text NOT NULL,
        category text NOT NULL,
        content text NOT NULL,
        apply_to text,
        builtin boolean NOT NULL DEFAULT false,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `)
    await ds.query(`CREATE INDEX idx_ppt_user ON portrait_prompt_templates (user_id)`)
    await ds.query(`CREATE INDEX idx_ppt_category ON portrait_prompt_templates (category)`)
  } else {
    await ds.query(`
      CREATE TABLE portrait_prompt_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        apply_to TEXT,
        builtin INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await ds.query(`CREATE INDEX idx_ppt_user ON portrait_prompt_templates (user_id)`)
    await ds.query(`CREATE INDEX idx_ppt_category ON portrait_prompt_templates (category)`)
  }
  console.log('[create-portrait-prompt-templates] 建表完成')
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}
```

注：`apply_to` 用 simple-json（SQLite 存 JSON 字符串 / PG 存 text），与 `portrait_variants.config` 现有做法一致。

- [ ] **Step 4: Repository**

`src/core/database/repositories/portrait-prompt-template.repository.ts`：

```ts
import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { BaseRepository } from '../base-repository'
import { PortraitPromptTemplateEntity } from '../entities/portrait-prompt-template.entity'
import type {
  PortraitPromptTemplate,
  PromptTemplateCategory,
  PortraitGenerationScene,
} from '@shared/types/portrait.types'

interface CreateTemplateInput {
  name: string
  category: PromptTemplateCategory
  content: string
  applyTo: PortraitGenerationScene[]
  builtin?: boolean
  sortOrder?: number
}

export class PortraitPromptTemplateRepository extends BaseRepository<
  PortraitPromptTemplateEntity,
  PortraitPromptTemplate
> {
  constructor(dataSource: DataSource) {
    super(dataSource, PortraitPromptTemplateEntity)
  }

  protected toDto(e: PortraitPromptTemplateEntity): PortraitPromptTemplate {
    return {
      id: e.id,
      name: e.name,
      category: e.category as PromptTemplateCategory,
      content: e.content,
      applyTo: (e.applyTo ?? []) as PortraitGenerationScene[],
      builtin: !!e.builtin,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt instanceof Date ? e.createdAt.getTime() : Number(e.createdAt) || 0,
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.getTime() : Number(e.updatedAt) || 0,
    }
  }

  async list(category?: PromptTemplateCategory): Promise<PortraitPromptTemplate[]> {
    const rows = category
      ? await this.scoped.find({ where: { category } as object, order: { sortOrder: 'ASC', createdAt: 'ASC' } as object })
      : await this.scoped.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } as object })
    return rows.map((r) => this.toDto(r))
  }

  async getById(id: string): Promise<PortraitPromptTemplate | null> {
    const e = await this.scoped.findOne({ where: { id } as object })
    return e ? this.toDto(e) : null
  }

  async findByName(name: string): Promise<PortraitPromptTemplate | null> {
    const e = await this.scoped.findOne({ where: { name } as object })
    return e ? this.toDto(e) : null
  }

  async create(input: CreateTemplateInput): Promise<PortraitPromptTemplate> {
    const now = new Date()
    const entity = this.scoped.create({
      id: randomUUID(),
      name: input.name,
      category: input.category,
      content: input.content,
      applyTo: input.applyTo,
      builtin: input.builtin ?? false,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<PortraitPromptTemplateEntity>)
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, patch: Partial<CreateTemplateInput>): Promise<PortraitPromptTemplate | null> {
    await this.scoped.update({ id } as object, { ...patch, updatedAt: new Date() } as object)
    return this.getById(id)
  }

  async remove(id: string): Promise<void> {
    await this.scoped.delete({ id } as object)
  }
}
```

（`scoped` 的具体方法签名以 `src/core/database/base-repository.ts` 实际 API 为准微调——Task 实施时先读该文件对齐 `portrait-variant.repository.ts` 的调用方式。）

- [ ] **Step 5: dbManager 接口 + 双端注册**

`src/core/database/database-manager.interface.ts` 在 `portraitVariants` 行后加：

```ts
  portraitPromptTemplates: PortraitPromptTemplateRepository | null
```

（同时 import 该 Repository 类型。）

`src/electron/database/index.ts` 在 `this.portraitVariants = new PortraitVariantRepository(this.dataSource)`（:4112 附近）后加：

```ts
    this.portraitPromptTemplates = new PortraitPromptTemplateRepository(this.dataSource)
```

`src/web/server/platform/web-database-manager.ts:200` 附近同样注册。

迁移注册：同 Task 1 Step 4 的位置，双端各加：

```ts
const { createPortraitPromptTemplates } = await import('@core/database/migrations/create-portrait-prompt-templates')
await createPortraitPromptTemplates(this.dataSource)
```

- [ ] **Step 6: 构建验证**

Run: `npm run build:main`
Expected: 编译无错

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/portrait.types.ts src/core/database/entities/portrait-prompt-template.entity.ts src/core/database/repositories/portrait-prompt-template.repository.ts src/core/database/migrations/create-portrait-prompt-templates.ts src/core/database/database-manager.interface.ts src/electron/database/index.ts src/web/server/platform/web-database-manager.ts src/web/server/index.ts
git commit -m "feat(portrait): 新增提示词模板表 portrait_prompt_templates（实体/仓库/迁移/双端注册）"
```

---

### Task 3: 内置模板 seeder

**Files:**
- Create: `src/core/services/portrait-template-seeder.service.ts`
- Modify: `src/electron/database/index.ts`（初始化完成后调用）
- Modify: `src/web/server/index.ts`（同样调用）

- [ ] **Step 1: Seeder 实现**

`src/core/services/portrait-template-seeder.service.ts`：

```ts
/**
 * 人像提示词内置模板 seeder。
 * 内容抽取自 docs/prompt.txt（专业面部/全身比例/发型服装描述）。
 * 幂等：按 builtin + name 查重，已存在则跳过。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { PromptTemplateCategory, PortraitGenerationScene } from '@shared/types/portrait.types'

interface BuiltinTemplate {
  name: string
  category: PromptTemplateCategory
  applyTo: PortraitGenerationScene[]
  content: string
  sortOrder: number
}

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    name: '少年清爽风 · 面部',
    category: 'face',
    applyTo: ['generate', 'regenerate', 'face'],
    sortOrder: 1,
    content:
      'young male face, balanced three-section face proportion, slightly shorter mid-section, clean forehead, small tight chin; soft facial bone structure, gentle jawline without sharp angles; light flat eyebrows; standard round almond eyes, clear and lively gaze; slim straight nose with rounded tip; refreshing youthful temperament',
  },
  {
    name: '成熟硬朗风 · 面部',
    category: 'face',
    applyTo: ['generate', 'regenerate', 'face'],
    sortOrder: 2,
    content:
      'mature masculine face, well-proportioned three sections, full mid-section, square firm chin; prominent bone structure, defined jaw angle, three-dimensional cheekbones; thick sword eyebrows, prominent brow bone; deep determined gaze; high nose bridge; mature硬朗 male presence',
  },
  {
    name: '温婉柔美风 · 面部',
    category: 'face',
    applyTo: ['generate', 'regenerate', 'face'],
    sortOrder: 3,
    content:
      'gentle feminine face, soft rounded facial lines, balanced three sections; willow-leaf eyebrows, peach-blossom eyes with tender affectionate gaze; delicate nose; full soft lips; small rounded chin; gentle graceful female temperament',
  },
  {
    name: '少年清爽风 · 8头身全身',
    category: 'body',
    applyTo: ['generate', 'regenerate'],
    sortOrder: 4,
    content:
      '8-head body proportion, balanced and light head-to-body ratio; clean stretched torso, long slender limbs; flat thin chest, slim straight neck and shoulders; smooth waist-hip transition; light muscle volume, refreshing youthful posture',
  },
  {
    name: '韩式清爽碎盖 + 日系少年服装',
    category: 'clothing',
    applyTo: ['generate', 'regenerate', 'clothes'],
    sortOrder: 5,
    content:
      'black hair, Korean style fluffy textured crop, light airy strands; Japanese casual youthful outfit, light blue denim shirt over plain white loose tee, relaxed straight pants, light-colored sneakers, clean fresh palette',
  },
]

export class PortraitTemplateSeederService {
  static async seed(): Promise<void> {
    const db = getCoreDatabaseManager()
    const repo = db.portraitPromptTemplates
    if (!repo) {
      console.warn('[PortraitTemplateSeeder] portraitPromptTemplates 未初始化，跳过')
      return
    }
    let created = 0
    for (const tpl of BUILTIN_TEMPLATES) {
      const exists = await repo.findByName(tpl.name)
      if (exists) continue
      await repo.create({ ...tpl, builtin: true })
      created++
    }
    if (created > 0) console.log(`[PortraitTemplateSeeder] 注入内置模板 ${created} 条`)
  }
}
```

- [ ] **Step 2: 双端调用**

`src/electron/database/index.ts` 在数据库初始化完成、迁移执行之后加：

```ts
const { PortraitTemplateSeederService } = await import('@core/services/portrait-template-seeder.service')
await PortraitTemplateSeederService.seed()
```

`src/web/server/index.ts` 同样位置加同等调用。

- [ ] **Step 3: 启动验证**

Run: `npm run dev`
Expected: 首次启动日志 `[PortraitTemplateSeeder] 注入内置模板 5 条`；重启无该日志（幂等）

- [ ] **Step 4: Commit**

```bash
git add src/core/services/portrait-template-seeder.service.ts src/electron/database/index.ts src/web/server/index.ts
git commit -m "feat(portrait): 内置提示词模板 seeder（抽取 docs/prompt.txt，幂等注入）"
```

---

## M2 核心服务（TDD）

### Task 4: buildPortraitPrompt 新增 + generatePortrait 可选 framing 参数（不动现有行为）

> 原则（评审确认）：后端只新增行为。`generatePortrait` 现有拼装逻辑**不重构**；仅新增可选 `framing` 参数，缺省 = 现状（full）。`buildPortraitPrompt` 是新方法，供新方法与"传了 framing 的 generatePortrait"使用。

**Files:**
- Modify: `src/shared/types/portrait.types.ts`
- Modify: `src/core/services/portrait.service.ts`
- Test: `tests/unit/services/portrait-framing.spec.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/services/portrait-framing.spec.ts`（mock 模式照抄 `portrait.service.spec.ts` 头部）：

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@core/services/image.service', () => ({ ImageService: { generateImage: vi.fn() } }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, existsSync: vi.fn(() => true), readFileSync: vi.fn(() => Buffer.from('fake')) }
})
vi.mock('@core/interfaces/event.interface', () => ({ getEventEmitter: () => ({ emit: () => {} }) }))

import { PortraitService } from '@core/services/portrait.service'

describe('buildPortraitPrompt', () => {
  it('framing=half 使用半身后缀', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
      anglePrompt: 'front view',
      framing: 'half',
    })
    expect(p).toContain('upper body shot, bust portrait')
    expect(p).not.toContain('full body shot')
  })

  it('framing=full 使用全身后缀', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
      anglePrompt: 'front view',
      framing: 'full',
    })
    expect(p).toContain('full body shot')
  })

  it('调用方可覆盖默认后缀（不写死）', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
      anglePrompt: 'front view',
      framing: 'half',
      overrides: { framingSuffix: 'custom framing words' },
    })
    expect(p).toContain('custom framing words')
    expect(p).not.toContain('bust portrait')
  })

  it('generatePortrait 不传 framing 时行为与现状一致（full 后缀）', async () => {
    // mock db + ImageService 走通 generatePortrait（复用现有 spec 的 mock 结构）
    // 断言 ImageService.generateImage 收到的 prompt 含 'full body shot'
    // —— 该用例锁定"存量行为不变"
  })

  it('generatePortrait 传 framing=half 时用半身后缀', async () => {
    // 同上 mock；断言 prompt 含 'upper body shot, bust portrait' 且不含 'full body shot'
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/unit/services/portrait-framing.spec.ts`
Expected: FAIL（`buildPortraitPrompt is not a function`）

- [ ] **Step 3: 实现**

`src/shared/types/portrait.types.ts`：`GeneratePortraitRequest` 加 `framing?: PortraitFraming`。

`src/core/services/portrait.service.ts`：

1. 新增默认配置对象（旧常量 `FULL_BODY_SUFFIX`/`DEFAULT_NEGATIVE_PROMPT`/`CONSISTENCY_PREFIX` 等**保留不动**，现有方法继续用它们）：

```ts
import { FRAMING_PROMPT_SUFFIX, type PortraitFraming } from '@shared/types/portrait.types'

/** 新方法专用的 prompt 默认配置：可通过 buildPortraitPrompt 的 overrides 覆盖，新代码不写死 */
export const PORTRAIT_PROMPT_DEFAULTS = {
  consistencyPrefix: 'generate the exact same person as shown in the reference image',
  backgroundConsistencySuffix:
    'Keep the exact same background as in the reference image, same background color, same background style, no background change',
  negativePrompt:
    'cropped, multiple people, different person, different face, different clothes, different hairstyle, different background, low quality, blurry, distorted',
}
```

2. 新增公开静态方法：

```ts
  /**
   * 统一人像 prompt 拼装（新方法专用）。framing 决定取景后缀；overrides 可覆盖任一默认片段。
   */
  static buildPortraitPrompt(params: {
    basePrompt: string
    anglePrompt?: string
    framing?: PortraitFraming
    consistencyPrefix?: boolean
    overrides?: { framingSuffix?: string; prefix?: string; suffix?: string }
  }): string {
    const framing = params.framing ?? 'full'
    const framingSuffix = params.overrides?.framingSuffix ?? FRAMING_PROMPT_SUFFIX[framing]
    const parts: string[] = []
    if (params.consistencyPrefix) parts.push(PORTRAIT_PROMPT_DEFAULTS.consistencyPrefix)
    parts.push(params.basePrompt)
    if (params.anglePrompt) parts.push(params.anglePrompt)
    parts.push(framingSuffix)
    if (params.overrides?.suffix) parts.push(params.overrides.suffix)
    return parts.join(', ')
  }
```

3. `generatePortrait` 内部**仅加条件分支**（其余逻辑一行不动）：

```ts
// 原：const fullPrompt = `${request.prompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, consistent character, same person, solid background`
// 改为：
const fullPrompt = request.framing
  ? this.buildPortraitPrompt({
      basePrompt: request.prompt,
      anglePrompt,
      framing: request.framing,
      overrides: { suffix: 'consistent character, same person, solid background' },
    })
  : `${request.prompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, consistent character, same person, solid background`
```

- [ ] **Step 4: 运行确认通过 + 回归**

Run: `npm test -- tests/unit/services/portrait-framing.spec.ts && npm test -- tests/unit/services/portrait.service.spec.ts`
Expected: 全部 PASS（现有 spec 零改动通过 = 存量行为未变）

- [ ] **Step 5: Commit**

```bash
git add src/core/services/portrait.service.ts src/shared/types/portrait.types.ts tests/unit/services/portrait-framing.spec.ts
git commit -m "feat(portrait): buildPortraitPrompt 新方法 + generatePortrait 可选 framing 参数（存量行为不变）"
```

---

### Task 4b: 换衣/换背景可选参数（补充提示词 + 多参考图）

**Files:**
- Modify: `src/shared/types/portrait.types.ts`
- Modify: `src/core/services/portrait.service.ts`
- Test: `tests/unit/services/portrait-clothes-background-params.spec.ts`

- [ ] **Step 1: 类型（只新增可选字段）**

`src/shared/types/portrait.types.ts`：

```ts
// ChangeClothesRequest 加
  prompt?: string                 // 补充提示词，拼接到现有拼装结果后
  referenceImages?: string[]      // 多参考图；与现有 referenceImage 单值合并

// ChangeBackgroundRequest 加同样两个字段
```

- [ ] **Step 2: 写失败测试**

```ts
describe('changeClothes / changeBackground 可选参数', () => {
  it('不传新参数时 prompt 与现状一致', async () => {
    // 走通 changeClothes（mock 同现有 spec），断言 prompt 不含追加内容
  })
  it('传 prompt 时追加到拼装结果末尾', async () => {
    // 断言 ImageService.generateImage 收到的 prompt 以 ', <补充提示词>' 结尾
  })
  it('referenceImages 与 referenceImage 合并传入', async () => {
    // 断言 referenceImages 参数 = [referenceImage, ...referenceImages]
  })
})
```

- [ ] **Step 3: 运行确认失败 → Step 4: 实现**

`portrait.service.ts` 的 `changeClothes` / `changeBackground` 内部：

```ts
// fullPrompt 拼装行后追加（两个方法各自处理）：
if (request.prompt?.trim()) fullPrompt += `, ${request.prompt.trim()}`
// 参考图合并（沿用现有 referenceImage 处理处）：
const referenceImages = [
  ...(request.referenceImage ? [request.referenceImage] : []),
  ...(request.referenceImages ?? []),
]
```

- [ ] **Step 5: 运行确认通过 + 回归**

Run: `npm test -- tests/unit/services/portrait-clothes-background-params.spec.ts && npm test -- tests/unit/services/portrait.service.spec.ts`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/portrait.types.ts src/core/services/portrait.service.ts tests/unit/services/portrait-clothes-background-params.spec.ts
git commit -m "feat(portrait): 换衣/换背景支持补充提示词与多参考图（可选参数，存量不变）"
```

---

### Task 5: 模板服务 listPromptTemplates / applyTemplate / save / delete（TDD）

**Files:**
- Modify: `src/core/services/portrait.service.ts`
- Test: `tests/unit/services/portrait-prompt-template.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
// mock 头同 Task 4

import { PortraitService } from '@core/services/portrait.service'
import * as dbModule from '@core/database/database-manager.interface'

const repo = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({ portraitPromptTemplates: repo } as any)
})

describe('prompt template service', () => {
  it('listPromptTemplates 透传分类过滤', async () => {
    repo.list.mockResolvedValue([{ id: 't1', name: 'A', category: 'face', content: 'x', applyTo: ['face'], builtin: true, sortOrder: 1, createdAt: 0, updatedAt: 0 }])
    const r = await PortraitService.listPromptTemplates('face')
    expect(repo.list).toHaveBeenCalledWith('face')
    expect(r.success).toBe(true)
    expect(r.data?.length).toBe(1)
  })

  it('applyTemplate 替换占位符', async () => {
    repo.getById.mockResolvedValue({ id: 't1', name: 'A', category: 'face', content: '{name}, {gender}, age {age}', applyTo: [], builtin: true, sortOrder: 0, createdAt: 0, updatedAt: 0 })
    const r = await PortraitService.applyTemplate('t1', { name: '张三', gender: 'male', age: 32 })
    expect(r.success).toBe(true)
    expect(r.data).toBe('张三, male, age 32')
  })

  it('applyTemplate 模板不存在返回错误', async () => {
    repo.getById.mockResolvedValue(null)
    const r = await PortraitService.applyTemplate('nope', {})
    expect(r.success).toBe(false)
  })

  it('内置模板禁止删除', async () => {
    repo.getById.mockResolvedValue({ id: 't1', builtin: true })
    const r = await PortraitService.deletePromptTemplate('t1')
    expect(r.success).toBe(false)
    expect(repo.remove).not.toHaveBeenCalled()
  })

  it('自定义模板可删除', async () => {
    repo.getById.mockResolvedValue({ id: 't2', builtin: false })
    const r = await PortraitService.deletePromptTemplate('t2')
    expect(r.success).toBe(true)
    expect(repo.remove).toHaveBeenCalledWith('t2')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/unit/services/portrait-prompt-template.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/core/services/portrait.service.ts` 新增：

```ts
  static async listPromptTemplates(category?: PromptTemplateCategory) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    const data = await db.portraitPromptTemplates.list(category)
    return { success: true as const, data }
  }

  static async applyTemplate(templateId: string, vars: Record<string, string | number>) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    const tpl = await db.portraitPromptTemplates.getById(templateId)
    if (!tpl) return { success: false as const, error: '模板不存在' }
    const data = tpl.content.replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m))
    return { success: true as const, data }
  }

  static async savePromptTemplate(input: { id?: string; name: string; category: PromptTemplateCategory; content: string; applyTo: PortraitGenerationScene[]; sortOrder?: number }) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    if (input.id) {
      const existing = await db.portraitPromptTemplates.getById(input.id)
      if (!existing) return { success: false as const, error: '模板不存在' }
      if (existing.builtin) return { success: false as const, error: '内置模板不可修改' }
      const data = await db.portraitPromptTemplates.update(input.id, input)
      return { success: true as const, data }
    }
    const data = await db.portraitPromptTemplates.create({ ...input, builtin: false })
    return { success: true as const, data }
  }

  static async deletePromptTemplate(id: string) {
    const db = getCoreDatabaseManager()
    if (!db.portraitPromptTemplates) return { success: false as const, error: '数据库未初始化' }
    const existing = await db.portraitPromptTemplates.getById(id)
    if (!existing) return { success: false as const, error: '模板不存在' }
    if (existing.builtin) return { success: false as const, error: '内置模板不可删除' }
    await db.portraitPromptTemplates.remove(id)
    return { success: true as const }
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/unit/services/portrait-prompt-template.spec.ts`
Expected: PASS ×5

- [ ] **Step 5: Commit**

```bash
git add src/core/services/portrait.service.ts tests/unit/services/portrait-prompt-template.spec.ts
git commit -m "feat(portrait): 提示词模板服务（list/apply/save/delete，builtin 保护）"
```

---

### Task 6: generateFullBody（基于半身扩展全身，TDD）

**Files:**
- Modify: `src/shared/types/portrait.types.ts`（GenerateFullBodyRequest/Response）
- Modify: `src/core/services/portrait.service.ts`
- Test: `tests/unit/services/portrait-full-body.spec.ts`

- [ ] **Step 1: 类型**

`src/shared/types/portrait.types.ts` 追加：

```ts
export interface GenerateFullBodyRequest {
  characterId: string
  sourceVariantId: string         // 源半身 variant
  prompt?: string                 // 全身构图提示词（缺省用默认）
  negativePrompt?: string
  referenceImages?: string[]      // 追加参考（源半身图自动置首）
  providerId?: string
  modelId?: string
  strength?: number               // 默认 0.55
  width?: number
  height?: number
}

export interface GenerateFullBodyResponse {
  success: boolean
  variant?: PortraitVariant
  error?: string
}

export interface EditFaceRequest {
  characterId: string
  variantId: string
  facePrompt?: string
  faceTemplateId?: string
  referenceImages?: string[]      // 面部参考图（可选）
  strength?: number               // 默认 0.5
  focusRegion?: 'face' | 'face_and_hair' | 'upper'
  width?: number
  height?: number
}

export interface EditFaceResponse {
  success: boolean
  variant?: PortraitVariant
  error?: string
}
```

- [ ] **Step 2: 写失败测试**

`tests/unit/services/portrait-full-body.spec.ts`（mock 头同 Task 4；db mock 提供 portraitVariants/portraitCharacters/images）：

```ts
it('generateFullBody 以源半身为参考产出 framing=full variant', async () => {
  const source = { id: 'v1', characterId: 'c1', type: 'base', angle: 'front', framing: 'half',
    imagePath: 'images/a.png', prompt: 'portrait of a man', config: { width: 768, height: 1024, seed: 42 } }
  variantRepo.getById.mockResolvedValue(source)
  charRepo.getById.mockResolvedValue({ id: 'c1', providerId: 'p', modelId: 'm', name: 'A', gender: 'male', age: 30 })
  ;(ImageService.generateImage as any).mockResolvedValue({ success: true, images: [{ filePath: 'images/b.png' }] })
  variantRepo.create.mockImplementation(async (x: any) => ({ id: 'v2', createdAt: 1, ...x }))

  const r = await PortraitService.generateFullBody({ characterId: 'c1', sourceVariantId: 'v1' })

  expect(r.success).toBe(true)
  // 参考图含源半身图
  const call = (ImageService.generateImage as any).mock.calls[0][0]
  expect(call.referenceImages?.length).toBeGreaterThan(0)
  expect(call.prompt).toContain('full body shot')
  expect(call.prompt).toContain('consistent face')
  // 产出 variant：framing=full、parentId=v1、继承 seed
  const created = variantRepo.create.mock.calls[0][0]
  expect(created.framing).toBe('full')
  expect(created.parentId).toBe('v1')
  expect(created.config.seed).toBe(42)
})

it('源 variant 不存在返回错误', async () => {
  variantRepo.getById.mockResolvedValue(null)
  const r = await PortraitService.generateFullBody({ characterId: 'c1', sourceVariantId: 'nope' })
  expect(r.success).toBe(false)
})
```

- [ ] **Step 3: 运行确认失败 → Step 4: 实现**

`src/core/services/portrait.service.ts` 新增（骨架，细节对齐 generateAngles 的参考图读取/保存方式）：

```ts
  static async generateFullBody(request: GenerateFullBodyRequest): Promise<GenerateFullBodyResponse> {
    const db = getCoreDatabaseManager()
    if (!db.portraitVariants || !db.portraitCharacters) return { success: false, error: '数据库未初始化' }

    const source = await db.portraitVariants.getById(request.sourceVariantId)
    if (!source) return { success: false, error: '源形象不存在' }
    const character = await db.portraitCharacters.getById(request.characterId)
    if (!character) return { success: false, error: '角色不存在' }

    // 源半身图作为首参考（读取逻辑与 generateAngles 一致：相对路径 → 绝对路径 → base64）
    const sourceImage = this.readImageAsBase64(source.imagePath)   // 抽取现有 generateAngles 内相同逻辑为该私有方法
    if (!sourceImage) return { success: false, error: '源形象图片读取失败' }

    const userPrompt = request.prompt?.trim() ||
      'same person as reference, natural relaxed posture, consistent face and hairstyle'
    const prompt = this.buildPortraitPrompt({
      basePrompt: userPrompt,
      framing: 'full',
      overrides: { suffix: 'solid background' },
    })

    const width = request.width ?? (source.config?.width as number) ?? DEFAULT_PORTRAIT_WIDTH
    const height = request.height ?? (source.config?.height as number) ?? DEFAULT_PORTRAIT_HEIGHT

    const result = await ImageService.generateImage({
      providerConfigId: request.providerId ?? character.providerId,
      model: request.modelId ?? character.modelId,
      prompt,
      negativePrompt: request.negativePrompt ?? PORTRAIT_PROMPT_DEFAULTS.negativePrompt,
      width, height,
      referenceImages: [sourceImage, ...(request.referenceImages ?? [])],
      strength: request.strength ?? 0.55,
      skipHistory: true,
    } as any)
    if (!result.success || !result.images?.[0]) return { success: false, error: result.error || '生成失败' }

    const variant = await db.portraitVariants.create({
      characterId: request.characterId,
      type: 'base',
      framing: 'full',
      parentId: source.id,
      angle: 'front',
      imagePath: result.images[0].filePath,
      prompt,
      config: { width, height, seed: source.config?.seed, strength: request.strength ?? 0.55 },
    })
    this.sendPortraitEvent({ type: 'generation-completed', characterId: request.characterId })
    return { success: true, variant }
  }
```

- [ ] **Step 5: 运行确认通过 + 回归**

Run: `npm test -- tests/unit/services/portrait-full-body.spec.ts && npm run test:unit`
Expected: PASS，现有测试全绿

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/portrait.types.ts src/core/services/portrait.service.ts tests/unit/services/portrait-full-body.spec.ts
git commit -m "feat(portrait): generateFullBody 基于半身扩展全身（参考图保面部一致）"
```

---

### Task 7: editFace（只改面部，TDD）

**Files:**
- Modify: `src/shared/types/image-provider.types.ts`（strength/focusRegion 可选字段）
- Modify: `src/core/services/portrait.service.ts`
- Test: `tests/unit/services/portrait-edit-face.spec.ts`

- [ ] **Step 1: ImageGenerationRequest 扩展（只新增）**

`src/shared/types/image-provider.types.ts` 的 `ImageGenerationRequest` 加：

```ts
  /** 重绘强度 0-1（局部重绘/图生图；provider 不支持时忽略） */
  strength?: number
  /** 聚焦区域（不支持蒙版的 provider 用 prompt 引导） */
  focusRegion?: 'face' | 'face_and_hair' | 'upper' | 'full'
```

- [ ] **Step 2: 写失败测试**

```ts
it('editFace 模板+指令叠加，产出 type=face variant，原图不变', async () => {
  const source = { id: 'v1', characterId: 'c1', type: 'base', angle: 'front', framing: 'half',
    imagePath: 'images/a.png', prompt: 'p', config: { width: 768, height: 1024, seed: 7 } }
  variantRepo.getById.mockResolvedValue(source)
  charRepo.getById.mockResolvedValue({ id: 'c1', providerId: 'p', modelId: 'm', name: 'A', gender: 'male', age: 30 })
  templateRepo.getById.mockResolvedValue({ id: 't1', content: 'sharp jawline, thick eyebrows, {gender}', builtin: true })
  ;(ImageService.generateImage as any).mockResolvedValue({ success: true, images: [{ filePath: 'images/f.png' }] })
  variantRepo.create.mockImplementation(async (x: any) => ({ id: 'v9', createdAt: 1, ...x }))

  const r = await PortraitService.editFace({
    characterId: 'c1', variantId: 'v1', faceTemplateId: 't1', facePrompt: '眼神更坚毅',
  })

  expect(r.success).toBe(true)
  const call = (ImageService.generateImage as any).mock.calls[0][0]
  expect(call.prompt).toContain('sharp jawline')        // 模板（占位符已解析）
  expect(call.prompt).toContain('male')
  expect(call.prompt).toContain('眼神更坚毅')            // 指令叠加
  expect(call.focusRegion).toBe('face')
  expect(call.strength).toBe(0.5)
  const created = variantRepo.create.mock.calls[0][0]
  expect(created.type).toBe('face')
  expect(created.framing).toBe('half')                   // 继承源 framing
  expect(created.variantInfo.faceTemplateId).toBe('t1')
  // 不删不改原 variant
  expect(variantRepo.delete ?? variantRepo.remove ?? (() => {})).not.toHaveBeenCalled?.()
})
```

- [ ] **Step 3: 运行确认失败 → Step 4: 实现**

```ts
  static async editFace(request: EditFaceRequest): Promise<EditFaceResponse> {
    const db = getCoreDatabaseManager()
    if (!db.portraitVariants || !db.portraitCharacters) return { success: false, error: '数据库未初始化' }

    const source = await db.portraitVariants.getById(request.variantId)
    if (!source) return { success: false, error: '源形象不存在' }
    const character = await db.portraitCharacters.getById(request.characterId)
    if (!character) return { success: false, error: '角色不存在' }

    // 模板解析（可选）
    let templateText = ''
    if (request.faceTemplateId) {
      const applied = await this.applyTemplate(request.faceTemplateId, {
        name: character.name, gender: character.gender, age: character.age,
      })
      if (applied.success && applied.data) templateText = applied.data
    }

    const focusRegion = request.focusRegion ?? 'face'
    const regionWords: Record<string, string> = {
      face: 'modify only the face, keep hair, clothing, body, pose and background exactly the same',
      face_and_hair: 'modify only the face and hair, keep clothing, body, pose and background exactly the same',
      upper: 'modify the upper body, keep pose and background exactly the same',
    }
    const parts = [
      PORTRAIT_PROMPT_DEFAULTS.consistencyPrefix,
      templateText,
      request.facePrompt?.trim() ?? '',
      regionWords[focusRegion],
    ].filter(Boolean)
    const prompt = parts.join(', ')

    const sourceImage = this.readImageAsBase64(source.imagePath)
    if (!sourceImage) return { success: false, error: '源形象图片读取失败' }

    const width = request.width ?? (source.config?.width as number) ?? DEFAULT_PORTRAIT_WIDTH
    const height = request.height ?? (source.config?.height as number) ?? DEFAULT_PORTRAIT_HEIGHT
    const strength = request.strength ?? 0.5

    const result = await ImageService.generateImage({
      providerConfigId: character.providerId,
      model: character.modelId,
      prompt,
      negativePrompt: PORTRAIT_PROMPT_DEFAULTS.negativePrompt,
      width, height,
      referenceImages: [sourceImage, ...(request.referenceImages ?? [])],
      strength,
      focusRegion,
      skipHistory: true,
    } as any)
    if (!result.success || !result.images?.[0]) return { success: false, error: result.error || '生成失败' }

    const variant = await db.portraitVariants.create({
      characterId: request.characterId,
      type: 'face',
      framing: source.framing ?? 'full',
      parentId: source.parentId ?? source.id,
      angle: source.angle,
      imagePath: result.images[0].filePath,
      prompt,
      config: { width, height, seed: source.config?.seed, strength, focusRegion },
      variantInfo: { faceDescription: request.facePrompt, faceTemplateId: request.faceTemplateId },
    })
    this.sendPortraitEvent({ type: 'generation-completed', characterId: request.characterId })
    return { success: true, variant }
  }
```

- [ ] **Step 5: 运行确认通过 + 全量回归**

Run: `npm run test:unit`
Expected: 全绿

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/image-provider.types.ts src/core/services/portrait.service.ts tests/unit/services/portrait-edit-face.spec.ts
git commit -m "feat(portrait): editFace 只改面部（模板+指令叠加，type=face 独立变体）"
```

---

## M3 IPC + preload

### Task 8: 新增 5 个 IPC 通道 + preload 暴露

**Files:**
- Modify: `src/electron/ipc/handlers/portrait.handler.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: handler 新增**

`src/electron/ipc/handlers/portrait.handler.ts` 注册区（:51 附近）加：

```ts
  ipcBridge.handle('portrait:generate-full-body', handleGenerateFullBody)
  ipcBridge.handle('portrait:edit-face', handleEditFace)
  ipcBridge.handle('portrait:prompt-template:list', handlePromptTemplateList)
  ipcBridge.handle('portrait:prompt-template:apply', handlePromptTemplateApply)
  ipcBridge.handle('portrait:prompt-template:save', handlePromptTemplateSave)
  ipcBridge.handle('portrait:prompt-template:delete', handlePromptTemplateDelete)
```

对应 handler 函数（仿照现有 handleEditImage 写法，直接转调 service 并返回其结果；service 已是 `{success,data?,error?}` 形状）：

```ts
async function handleGenerateFullBody(_e: unknown, request: GenerateFullBodyRequest) {
  return PortraitService.generateFullBody(request)
}
async function handleEditFace(_e: unknown, request: EditFaceRequest) {
  return PortraitService.editFace(request)
}
async function handlePromptTemplateList(_e: unknown, category?: PromptTemplateCategory) {
  return PortraitService.listPromptTemplates(category)
}
async function handlePromptTemplateApply(_e: unknown, templateId: string, vars: Record<string, string | number>) {
  return PortraitService.applyTemplate(templateId, vars)
}
async function handlePromptTemplateSave(_e: unknown, input: { id?: string; name: string; category: PromptTemplateCategory; content: string; applyTo: PortraitGenerationScene[]; sortOrder?: number }) {
  return PortraitService.savePromptTemplate(input)
}
async function handlePromptTemplateDelete(_e: unknown, id: string) {
  return PortraitService.deletePromptTemplate(id)
}
```

并在 unregister 区同步 removeHandler。

- [ ] **Step 2: preload 暴露**

`src/preload/index.ts` 的 `portrait` 对象（:1096 后）加：

```ts
    generateFullBody: (request: {
      characterId: string; sourceVariantId: string; prompt?: string; negativePrompt?: string;
      referenceImages?: string[]; providerId?: string; modelId?: string;
      strength?: number; width?: number; height?: number
    }) => ipcRenderer.invoke('portrait:generate-full-body', request),
    editFace: (request: {
      characterId: string; variantId: string; facePrompt?: string; faceTemplateId?: string;
      referenceImages?: string[]; strength?: number;
      focusRegion?: 'face' | 'face_and_hair' | 'upper'; width?: number; height?: number
    }) => ipcRenderer.invoke('portrait:edit-face', request),
    promptTemplate: {
      list: (category?: string) => ipcRenderer.invoke('portrait:prompt-template:list', category),
      apply: (templateId: string, vars: Record<string, string | number>) =>
        ipcRenderer.invoke('portrait:prompt-template:apply', templateId, vars),
      save: (input: { id?: string; name: string; category: string; content: string; applyTo: string[]; sortOrder?: number }) =>
        ipcRenderer.invoke('portrait:prompt-template:save', input),
      delete: (id: string) => ipcRenderer.invoke('portrait:prompt-template:delete', id),
    },
```

- [ ] **Step 3: 构建 + 手动冒烟**

Run: `npm run build && npm run dev`，在 DevTools 控制台执行：
```js
await window.electronAPI.portrait.promptTemplate.list()
```
Expected: `{ success: true, data: [...5 条内置模板] }`

- [ ] **Step 4: Commit**

```bash
git add src/electron/ipc/handlers/portrait.handler.ts src/preload/index.ts
git commit -m "feat(portrait): IPC 新增 generate-full-body / edit-face / prompt-template 通道"
```

---

## M4 前端工作台（token 驱动）

> 视觉以 `docs/ui-prototypes/portrait-design/` 对应页面为唯一标准；所有样式写 `var(--*)`，缺 token 先在 `src/renderer/src/styles/index.scss :root` 补（classic=接近现状，modern=原型值）。

### Task 9: token 补充 + 两个基础组件（ReferenceImagePicker / TemplatePicker）

**Files:**
- Modify: `src/renderer/src/styles/index.scss`（补 `--c-accent*`、`--c-bg-2`、`--sidebar-*` 等皮肤方案 D3 列出的 token）
- Create: `src/renderer/src/components/portrait/workbench/ReferenceImagePicker.vue`
- Create: `src/renderer/src/components/portrait/workbench/TemplatePicker.vue`

- [ ] **Step 1:** `index.scss :root` 补充 token（accent 紫系、bg-2、surface-2、sidebar 系列、shadow 细化档），值取皮肤方案 D3 表。
- [ ] **Step 2:** `ReferenceImagePicker.vue`：props `{ modelValue: { data: string; role: ReferenceImageRole }[], max?: number }`，网格展示（缩略图+角色角标+删除），`+` 上传（走 `window.electronAPI.image.selectFile`），role 下拉切换；emits `update:modelValue`。样式全部 token。
- [ ] **Step 3:** `TemplatePicker.vue`：props `{ category?: PromptTemplateCategory; scene: PortraitGenerationScene; character?: PortraitCharacter }`；加载 `promptTemplate.list`，下拉 + 「套用(emit replace) / 追加(emit append)」；选中时 emit `preview(content)` 供父级联动预览。
- [ ] **Step 4:** `npm run lint` 通过；Commit `feat(portrait-ui): token 补充 + ReferenceImagePicker/TemplatePicker 基础组件`

### Task 10: GeneratePanel（生成态，默认半身）

**Files:** Create `src/renderer/src/components/portrait/workbench/GeneratePanel.vue`

- [ ] 取景范围 radio 卡（半身默认选中，视觉同原型 `workbench-new.html`）、模型选择、尺寸 SizeSelector、TemplatePicker、prompt/negativePrompt、ReferenceImagePicker、高级参数折叠（quality/style/seed/guidanceScale/steps/strength）
- [ ] 提交调 `portrait.generate({ ..., framing })`；生成中 loading、事件 `portrait.onGenerationEvent` 刷新
- [ ] Commit

### Task 11: EditPanel（framing 联动主编辑面板）+ MoreEditPanel

**Files:**
- Create `src/renderer/src/components/portrait/workbench/EditPanel.vue`
- Create `src/renderer/src/components/portrait/workbench/MoreEditPanel.vue`

- [ ] EditPanel：props `{ framing: PortraitFraming, characterId: string, variant: PortraitVariant }`
  - `framing='half'` → 修改面部：指令输入、TemplatePicker(category=face，选中联动预览框显示模板内容)、面部 ReferenceImagePicker、强度滑块、focusRegion 下拉、调 `portrait.editFace`
  - `framing='full'` → 修改全身：指令输入、TemplatePicker(category=body/clothing)、ReferenceImagePicker、强度滑块、**调现有 `portrait.editImage`**（复用，不新增后端）
  - 视觉与交互以原型 `workbench.html` 的 `#editPanelHalf` / `#editPanelFull` 为准（同一卡槽，tab 切换联动）
- [ ] MoreEditPanel：折叠收纳
  - 重新生成（沿用现有 `handleRegenerateFront` 逻辑迁移）
  - 换衣：服装描述 + **补充提示词 textarea + 服装 ReferenceImagePicker**（调 `changeClothes` 传 `prompt` + `referenceImages`，Task 4b）
  - 换背景：类型/场景 + **背景描述提示词 textarea + 背景 ReferenceImagePicker**（同上）
  - 多角度（复用现有 generateAngles）
- [ ] Commit

### Task 12: VariantGallery + GenerateFullBodyDialog

**Files:**
- Create `src/renderer/src/components/portrait/workbench/VariantGallery.vue`
- Create `src/renderer/src/components/portrait/workbench/GenerateFullBodyDialog.vue`

- [ ] VariantGallery：按 framing 分两组（半身组/全身组），组内按现有 variantGroups 逻辑；全身组空状态显示「生成全身像」按钮，有图时显示「重新生成」；卡片操作（下载/删除/预览）迁移现有逻辑
- [ ] GenerateFullBodyDialog：提示词（默认 `same person as reference, full body shot, ...`）、尺寸、TemplatePicker(body)、参考图（首项=当前半身，只读标识）、强度；调 `portrait.generateFullBody`
- [ ] Commit

### Task 13: PortraitWorkbench 容器 + Portrait.vue 接入

**Files:**
- Create `src/renderer/src/components/portrait/workbench/PortraitWorkbench.vue`
- Modify: `src/renderer/src/views/Portrait.vue`

- [ ] 无正面形象 → GeneratePanel；有 → 左预览（framing tab 可切换：half=当前形象，full=全身 variant 或空状态+生成按钮）+ 右操作（FaceEditPanel + MoreEditPanel）+ VariantGallery
- [ ] `Portrait.vue` 把 `<CharacterEditor>` 换成 `<PortraitWorkbench>`（保留旧组件文件不删）
- [ ] Commit

### Task 14: 联调验收

- [ ] `npm run test:unit` 全绿；`npm run lint` 通过
- [ ] 手动走查 spec §9 验收标准 1-7 逐项
- [ ] 新增文件 grep 校验零硬编码：`grep -rn "border-radius:\s*[0-9]" src/renderer/src/components/portrait/workbench/` 应无输出
- [ ] Commit `feat(portrait): 新版人像设计工作台上线` 并按需发 PR

---

## Self-Review 记录

- **Spec 覆盖**：§4 数据模型→T1/T2/T3；§5.1→T7 Step1；§5.2 buildPrompt→T4、模板服务→T5、generateFullBody→T6、editFace→T7、换衣/换背景可选参数→T4b；§5.3→T8；§6 前端→T9-T13；§7 测试→各 TDD 步骤+T14；§9 验收→T14。无遗漏。
- **类型一致性**：`PortraitFraming`/`ReferenceImageRole`/`PromptTemplateCategory`/`PortraitGenerationScene`/`GenerateFullBodyRequest`/`EditFaceRequest` 在 T1/T6 定义，后续任务引用一致；`readImageAsBase64` 在 T6 定义为私有抽取方法，T7 复用同一方法。
- **只增不改（评审要求）**：T4/T4b 均为新增方法或可选参数（缺省=现状行为），现有 `generatePortrait`/`changeClothes`/`changeBackground`/`generateAngles`/`editImage` 内部逻辑不重构；"修改全身"复用 `editImage`（T11），不新增后端方法；存量回归由 T4 Step4/T4b Step5 的现有 spec 零改动通过来锁定。
- **风险点**：BaseRepository `scoped` API 签名以实际文件为准（T2 Step4 已注明）；存量行 framing 回填 'full' 与新工作台显式传 'half' 的交互已在校验清单。
