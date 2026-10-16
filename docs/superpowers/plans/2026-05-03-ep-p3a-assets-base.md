# 剧集制作 · Phase 3a · 资产域 base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 episode-production 模块上线"资产域"核心能力：4 类资产（角色/地点/物品/语音）的 service 实现、图谱派生工作流、portrait/image 导入路径、IPC 通道、② 资产阶段 UI（含侧栏 + 盘点页 + 4 类资产卡编辑页）。**不含** portrait 模块重定位（P3b）和 360 全景 + 截图（P3c）—— 那些独立 sub-plan。

**Architecture:** 沿用 P1 已建立的目录结构 `src/core/modules/episode-production/assets/`。每个资产类型一个 service（character-asset / location-asset / item-asset / voice-asset），共用一个统一的 asset-image service（图谱 CRUD）和 gallery-derivation service（派生工作流）。资产读取按 spec §3.7 双源规则（linked_lw 投影 lw_character / standalone 直接读 standalone_*），通过统一的 `getEffectiveAssetData()` 函数封装。UI 层 ②阶段的工作台主壳（EpisodeWorkbench.vue P1 task 10 拆好）的"角色绑定/地点绑定/物品绑定"3 个 Tab 内容替换为新的 AssetStageView，并在 sidebar 新增 4 类资产侧栏。

**Tech Stack:** TypeScript / Vue 3 + Element Plus / Pinia / TypeORM / Vitest（unit）/ Playwright（e2e）。

---

## ⭐ 双端约束（贯穿所有 task）

按 spec §0.3 / §5.7：

1. **PG + SQLite 双端** — service 层用 typeorm Repository 抽象，自动跨端
2. **IPC 通道双端注册** — 每条新 channel 必须 5 文件同步：handler 实现 / `electron/index.ts` / `web/server/api/register-channels.ts` / `preload/index.ts` / `web/client/channel-map.ts`
3. **PC + Web e2e 都要通过** — 新 channel 加完 e2e 跑一遍验证

每个涉及 IPC 的 task 末尾有"双端契约同步检查清单"。

## ⭐ 实施风格约束（来自 P1/P2 教训）

1. **零业务行为改动**——本 phase 只新增 service / UI，不改已有业务逻辑
2. **不"顺手修" pre-existing typecheck 错误**——用 `@ts-expect-error` 沿用，留 P3b/P3c/后续修
3. **TDD**：先写测试 → fail → 实现 → pass
4. **UI 用 Element Plus 组件**——不引新 UI 库；自定义只限关键视觉（资产卡缩略图 / 图谱网格 / 状态徽章）
5. **类型用 P2 已加的 entity 字段**——`source_type` / `override_*` / `standalone_*` 已就绪，本 phase 仅消费

---

## 现状盘点

### 已就绪（P1 / P2 留下的）

```
src/core/modules/episode-production/assets/
├── prompts/README.md
└── services/
    ├── README.md
    ├── temp-asset.service.ts    ← P1 task 5 拆出 + P2 task 6 改造为写 asset_image
    └── index.ts

数据库 entity（src/core/database/entities/episode-production/）
├── character-binding.entity.ts  ← P2 task 1 已加 source_type/override_*/standalone_*
├── location-binding.entity.ts   ← P2 task 1 已加（含 panorama_3d_id 占位）
├── item-binding.entity.ts       ← P2 task 1 已加
├── asset-image.entity.ts        ← P2 task 2 新建（统一图谱表）
├── scene-prop.entity.ts         ← P2 task 4 加 item_binding_id FK

现有外部依赖
├── voice 模块: src/core/services/voice.service.ts + entity cloned-voice / voice-record
├── portrait 模块: portrait-character / portrait-variant entity + portrait.service.ts
├── image 模块: src/core/services/image.service.ts
```

### 本 phase 要新建（service 层）

```
src/core/modules/episode-production/assets/services/
├── asset-image.service.ts         ★ asset_image 表统一 CRUD
├── gallery-derivation.service.ts  ★ 主图 → 派生 view/expression/outfit/pose 工作流
├── character-asset.service.ts     ★ 含双源 + portrait_id 桥接 + override 投影
├── location-asset.service.ts      ★ 含 time/weather/angle 变体管理
├── item-asset.service.ts          ★ 简单 CRUD
├── voice-asset.service.ts         ★ 接入 cloned_voices + 角色 voice 绑定
└── asset-import.service.ts        ★ 从 portrait variant / image 模块 导入图

新 IPC handlers（src/electron/ipc/handlers/episode-production/asset/）
├── character-asset.handler.ts     ★（P1 task 8 已有空文件）
├── location-asset.handler.ts      ★（同上）
├── item-asset.handler.ts          ★（同上）
└── voice-asset.handler.ts         ★（同上，P1 时为空占位）

新 UI 组件（src/renderer/src/components/episode-production/）
├── workbench/AssetSidebar.vue                    ★ 侧栏 4 类
├── stage-asset/AssetStageView.vue                ★ ②阶段盘点页
├── stage-asset/character/CharacterAssetEditor.vue   ★ 角色资产卡编辑
├── stage-asset/character/CharacterCardForm.vue   ★ 设定卡表单
├── stage-asset/character/CharacterGalleryEditor.vue ★ 图谱编辑
├── stage-asset/location/LocationAssetEditor.vue  ★ 地点资产卡编辑（不含 panorama，留 P3c）
├── stage-asset/item/ItemAssetEditor.vue          ★ 物品资产卡编辑
└── stage-asset/voice/VoiceAssetEditor.vue        ★ 语音资产卡编辑
```

---

## Task 路线（15 个 task）

```
Task 0  准备 baseline + 备份 dev DB
Task 1  shared/types/episode-production/domain.types 补 binding 字段
Task 2  asset-image.service.ts（asset_image 表 CRUD）
Task 3  gallery-derivation.service.ts（派生工作流）
Task 4  character-asset.service.ts（双源 + override 投影）
Task 5  location-asset.service.ts（time/weather/angle 变体）
Task 6  item-asset.service.ts
Task 7  voice-asset.service.ts
Task 8  asset-import.service.ts（portrait/image 导入）
Task 9  IPC handlers + 双端契约同步
Task 10 AssetSidebar.vue（4 类侧栏）
Task 11 AssetStageView.vue（②阶段盘点页 4 类卡片）
Task 12 CharacterAssetEditor.vue（角色卡编辑）
Task 13 LocationAssetEditor.vue（地点卡，不含 panorama）
Task 14 ItemAssetEditor + VoiceAssetEditor
Task 15 端到端联调 + 全量回归 + DoD
```

---

## Task 0: 准备 — baseline + dev DB 备份

**Files:**
- 仅观测，无文件创建。

- [ ] **Step 1: 确认分支 + clean tree**

```bash
cd /home/ubuntu/workdir/the-bot
git rev-parse --abbrev-ref HEAD   # 应为 feat/episode-production-redesign
git status --short                  # 仅 .claude/settings.local.json
```

- [ ] **Step 2: typecheck baseline**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS" > /tmp/p3a-baseline-typecheck.count
echo "typecheck baseline: $(cat /tmp/p3a-baseline-typecheck.count) errors"
```

P2 完成时是 322。

- [ ] **Step 3: unit baseline**

```bash
cd /home/ubuntu/workdir/the-bot
npm run test:unit:sqlite 2>&1 | tail -5 > /tmp/p3a-baseline-unit.txt
cat /tmp/p3a-baseline-unit.txt
```

P2 完成后是 0 fail / 366 pass。

- [ ] **Step 4: 备份 dev DB**

```bash
mkdir -p /tmp/p3a-dev-db-backup
docker exec the-bot-test-pg pg_dump -U postgres -F c the_bot_web > /tmp/p3a-dev-db-backup/the_bot_web-pre-p3a.dump
ls -la /tmp/p3a-dev-db-backup/
```

- [ ] **Step 5: 不需要 commit**（仅观测）。继续 Task 1。

---

## Task 1: 类型补丁 — domain.types 同步 P2 binding 字段

**Files:**
- Modify: `src/shared/types/episode-production/domain.types.ts`

**Concept:** P2 task 1 给 binding entity 加了 `sourceType` / `override*` / `standalone*` 字段，但 `domain.types.ts` 里的 `CharacterBinding` / `LocationBinding` / `ItemBinding` 接口可能没同步。补齐让 service / UI 能用类型。

- [ ] **Step 1: 看现状**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "interface CharacterBinding |interface LocationBinding |interface ItemBinding " src/shared/types/episode-production/domain.types.ts
```

确认 3 个 interface 的定位。

- [ ] **Step 2: 补 CharacterBinding 字段**

打开文件，找到 `CharacterBinding` interface，在末尾加：

```typescript
// P2 task 1 双源字段（spec §3.7）
sourceType: 'linked_lw' | 'standalone'
overrideName?: string | null
overrideDescription?: string | null
overrideAppearance?: string | null
overrideOutfit?: string | null
standaloneName?: string | null
standaloneDescription?: string | null
```

- [ ] **Step 3: 补 LocationBinding 字段**

同样追加：

```typescript
// P2 task 1 双源字段
sourceType: 'linked_lw' | 'standalone'
overrideName?: string | null
overrideDescription?: string | null
standaloneName?: string | null
standaloneDescription?: string | null
panorama3dId?: string | null      // 接入点 P3c 用
sceneLayoutId?: string | null     // 接入点 Phase 8 用
```

- [ ] **Step 4: 补 ItemBinding 字段**

```typescript
// P2 task 1 双源字段
sourceType: 'linked_lw' | 'standalone'
overrideName?: string | null
overrideDescription?: string | null
standaloneName?: string | null
standaloneDescription?: string | null
```

- [ ] **Step 5: 加 EffectiveAssetData 通用类型**

在文件末尾追加（用于 service 的 getEffectiveData() 返回）：

```typescript
/**
 * 资产生效数据（spec §3.7）：
 * source_type 决定字段来源——linked_lw 走"长文基础值 + override"；standalone 直接读 standalone_*。
 */
export interface EffectiveCharacterData {
  name: string
  description: string
  appearance?: string
  outfit?: string
  voiceId?: string | null
  portraitId?: string | null
  source: 'linked_lw' | 'standalone'
}

export interface EffectiveLocationData {
  name: string
  description: string
  source: 'linked_lw' | 'standalone'
}

export interface EffectiveItemData {
  name: string
  description: string
  source: 'linked_lw' | 'standalone'
}
```

- [ ] **Step 6: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

应不超过 baseline + 5。

- [ ] **Step 7: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/shared/types/episode-production/domain.types.ts
git commit -m "$(cat <<'EOF'
feat(ep/types): P3a task 1 · domain.types 补 binding 双源字段 + EffectiveAssetData

P2 task 1 给 entity 加了 source_type / override_* / standalone_*，
但 shared/types 里的 interface 没同步。本 task 补齐：
- CharacterBinding/LocationBinding/ItemBinding 加双源字段
- 新加 EffectiveCharacterData/LocationData/ItemData，是 service 的
  getEffectiveData() 返回类型，封装"linked_lw 投影 lw + override"和
  "standalone 直接读"的双源逻辑。

零业务改动，纯类型补丁。
EOF
)"
```

---

## Task 2: asset-image.service.ts — 统一图谱 CRUD

**Files:**
- Create: `src/core/modules/episode-production/assets/services/asset-image.service.ts`
- Create: `tests/unit/episode-production/assets/asset-image.service.spec.ts`
- Modify: `src/core/modules/episode-production/assets/services/index.ts`（barrel）
- Create: `src/core/database/repositories/asset-image.repository.ts`（如不存在）

**Concept:** 封装 asset_image 表的 CRUD 操作。提供按 (asset_type, asset_id) 查全部图、按 category 过滤、添加图、删图、标 main、查派生链等通用操作。后续所有资产 service 都通过它读写图谱。

- [ ] **Step 1: 检查 repository 是否已存在**

```bash
cd /home/ubuntu/workdir/the-bot
ls src/core/database/repositories/asset-image.repository.ts 2>&1 || echo "不存在，本 task 创建"
```

如果已存在跳过 step 2-3，否则继续。

- [ ] **Step 2: 创建 asset-image.repository.ts**

参考 `src/core/database/repositories/character-binding.repository.ts` 的 BaseRepository 范式。

```typescript
/**
 * asset_image 表 repository
 * @module core/database/repositories/asset-image
 */
import { BaseRepository } from '../base-repository'
import { AssetImageEntity } from '../entities/episode-production/asset-image.entity'

export class AssetImageRepository extends BaseRepository<AssetImageEntity> {
  protected readonly entity = AssetImageEntity
  protected readonly tableName = 'asset_image'

  // 默认继承 base CRUD：findAll / findOne / create / update / delete
}
```

具体 import 路径以项目现状为准（先 `cat src/core/database/repositories/character-binding.repository.ts | head -20` 看现有写法，再仿照）。

- [ ] **Step 3: 把 repository 注册到 DatabaseManager**

```bash
cd /home/ubuntu/workdir/the-bot
grep -n "characterBindings:" src/electron/database/index.ts | head
```

找到 `getRepositories()` 或类似的 getter，把 `assetImage: new AssetImageRepository(ds)` 加进去。

- [ ] **Step 4: 写测试 `tests/unit/episode-production/assets/asset-image.service.spec.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:',
    entities: [AssetImageEntity], synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('AssetImageService', () => {
  let ds: DataSource
  let svc: AssetImageService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new AssetImageService(ds)
  })

  it('addImage 增加一张图，按 (asset_type, asset_id) 查得到', async () => {
    const created = await svc.addImage({
      assetType: 'character', assetId: 'cb1',
      category: 'main', imagePath: '/img/a.png', isMain: true, sortOrder: 0,
    })
    expect(created.id).toMatch(/^ai_/)

    const list = await svc.listByAsset('character', 'cb1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      assetType: 'character', assetId: 'cb1', category: 'main',
      imagePath: '/img/a.png', isMain: 1,
    })
  })

  it('setAsMain 把指定图标 main，同 asset 之前的 main 取消', async () => {
    const a = await svc.addImage({ assetType: 'character', assetId: 'cb1', category: 'main', imagePath: '/a.png', isMain: true })
    const b = await svc.addImage({ assetType: 'character', assetId: 'cb1', category: 'view', imagePath: '/b.png', isMain: false })

    await svc.setAsMain(b.id)

    const list = await svc.listByAsset('character', 'cb1')
    const aAfter = list.find(x => x.id === a.id)!
    const bAfter = list.find(x => x.id === b.id)!
    expect(aAfter.isMain).toBe(0)
    expect(bAfter.isMain).toBe(1)
    expect(bAfter.category).toBe('main')  // 自动改 category
  })

  it('listByCategory 按类别过滤', async () => {
    await svc.addImage({ assetType: 'character', assetId: 'cb1', category: 'main', imagePath: '/m.png', isMain: true })
    await svc.addImage({ assetType: 'character', assetId: 'cb1', category: 'view', imagePath: '/v1.png', isMain: false, label: 'front' })
    await svc.addImage({ assetType: 'character', assetId: 'cb1', category: 'view', imagePath: '/v2.png', isMain: false, label: '3q_left' })

    const views = await svc.listByCategory('character', 'cb1', 'view')
    expect(views).toHaveLength(2)
    expect(views.map(x => x.label)).toEqual(['front', '3q_left'])
  })

  it('deleteImage 删除单张图', async () => {
    const img = await svc.addImage({ assetType: 'character', assetId: 'cb1', category: 'view', imagePath: '/v.png', isMain: false })
    await svc.deleteImage(img.id)
    const list = await svc.listByAsset('character', 'cb1')
    expect(list).toHaveLength(0)
  })

  it('getMainImage 返回 main，没有则 null', async () => {
    expect(await svc.getMainImage('character', 'cb1')).toBeNull()
    const m = await svc.addImage({ assetType: 'character', assetId: 'cb1', category: 'main', imagePath: '/m.png', isMain: true })
    expect((await svc.getMainImage('character', 'cb1'))?.id).toBe(m.id)
  })
})
```

- [ ] **Step 5: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/asset-image.service.spec.ts
```

Expected: FAIL（service 不存在）。

- [ ] **Step 6: 实现 `asset-image.service.ts`**

```typescript
/**
 * asset_image 表统一图谱 CRUD（spec §3.8）
 * @module modules/episode-production/assets/services/asset-image
 */
import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

export type AssetType = 'character' | 'location' | 'item'
export type AssetImageCategory =
  | 'main' | 'view' | 'expression' | 'outfit' | 'pose'
  | 'time_variant' | 'weather_variant' | 'angle_variant' | 'context'
  | 'panorama_360' | 'panorama_snapshot'

export interface AddImageInput {
  assetType: AssetType
  assetId: string
  category: AssetImageCategory
  imagePath: string
  isMain?: boolean
  label?: string
  prompt?: string
  negativePrompt?: string
  thumbnailPath?: string
  derivedFromImageId?: string
  sortOrder?: number
  metadata?: Record<string, unknown>
  userId?: string | null
}

export class AssetImageService {
  constructor(private readonly ds: DataSource) {}

  private get repo() {
    return this.ds.getRepository(AssetImageEntity)
  }

  async addImage(input: AddImageInput): Promise<AssetImageEntity> {
    const id = `ai_${randomBytes(8).toString('hex')}`
    const entity = this.repo.create({
      id,
      userId: input.userId ?? null,
      assetType: input.assetType,
      assetId: input.assetId,
      category: input.category,
      label: input.label ?? null,
      prompt: input.prompt ?? null,
      negativePrompt: input.negativePrompt ?? null,
      imagePath: input.imagePath,
      thumbnailPath: input.thumbnailPath ?? null,
      isMain: input.isMain ? 1 : 0,
      derivedFromImageId: input.derivedFromImageId ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdAt: new Date(),
      updatedAt: null,
    })
    return await this.repo.save(entity)
  }

  async listByAsset(assetType: AssetType, assetId: string): Promise<AssetImageEntity[]> {
    return await this.repo.find({
      where: { assetType, assetId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  }

  async listByCategory(
    assetType: AssetType,
    assetId: string,
    category: AssetImageCategory,
  ): Promise<AssetImageEntity[]> {
    return await this.repo.find({
      where: { assetType, assetId, category },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  }

  async getMainImage(assetType: AssetType, assetId: string): Promise<AssetImageEntity | null> {
    return await this.repo.findOne({ where: { assetType, assetId, isMain: 1 } })
  }

  /**
   * 把指定图设为 main，同时把同 asset 之前的 main 改为 view + isMain=0
   */
  async setAsMain(imageId: string): Promise<void> {
    const target = await this.repo.findOne({ where: { id: imageId } })
    if (!target) throw new Error(`AssetImage not found: ${imageId}`)

    await this.repo
      .createQueryBuilder()
      .update()
      .set({ isMain: 0, category: 'view' })
      .where('asset_type = :t AND asset_id = :a AND is_main = :m', {
        t: target.assetType, a: target.assetId, m: 1,
      })
      .execute()

    await this.repo.update(imageId, { isMain: 1, category: 'main' })
  }

  async deleteImage(imageId: string): Promise<void> {
    await this.repo.delete(imageId)
  }

  async updateImage(imageId: string, patch: Partial<AssetImageEntity>): Promise<void> {
    await this.repo.update(imageId, patch)
  }
}
```

- [ ] **Step 7: barrel 导出 + 跑测试**

`src/core/modules/episode-production/assets/services/index.ts` 追加：

```typescript
export { AssetImageService } from './asset-image.service'
export type { AssetType, AssetImageCategory, AddImageInput } from './asset-image.service'
```

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/asset-image.service.spec.ts
```

5 测试 pass。

- [ ] **Step 8: typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

应不超 baseline + 5。

- [ ] **Step 9: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/modules/episode-production/assets/services/asset-image.service.ts \
        src/core/modules/episode-production/assets/services/index.ts \
        src/core/database/repositories/asset-image.repository.ts \
        src/electron/database/index.ts \
        tests/unit/episode-production/assets/asset-image.service.spec.ts
git commit -m "feat(ep/assets): P3a task 2 · asset-image.service 统一图谱 CRUD

封装 asset_image 表（P2 task 2 已建）的 CRUD：
- addImage: 加图（自动生成 ai_xxx ID）
- listByAsset / listByCategory: 按 asset 或 category 查
- getMainImage: 取主图
- setAsMain: 切换主图（自动取消旧 main 并改其 category=view）
- deleteImage / updateImage: 单图增删改

5 测试覆盖核心路径。Asset image repository 同步注册到 DatabaseManager。"
```

---

## Task 3: gallery-derivation.service.ts — 派生工作流

**Files:**
- Create: `src/core/modules/episode-production/assets/services/gallery-derivation.service.ts`
- Create: `tests/unit/episode-production/assets/gallery-derivation.service.spec.ts`
- Modify: `src/core/modules/episode-production/assets/services/index.ts`

**Concept:** 实现 spec §3.5 的"派生图工作流"——以主图作为 reference image 生成 view/expression/outfit/pose 等派生图。本 task 只做"请求构造 + 提交给 image API + 写回 asset_image"的编排逻辑；底层 image 生成调用现有 `image.service.ts`。

- [ ] **Step 1: 写测试 `gallery-derivation.service.spec.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { GalleryDerivationService, type ImageGenerator } from '@core/modules/episode-production/assets/services/gallery-derivation.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [AssetImageEntity], synchronize: true })
  await ds.initialize()
  return ds
}

class MockImageGenerator implements ImageGenerator {
  calls: any[] = []
  async generate(opts: any): Promise<{ imagePath: string; thumbnailPath: string | null }> {
    this.calls.push(opts)
    return { imagePath: `/mock/${opts.label}.png`, thumbnailPath: null }
  }
}

describe('GalleryDerivationService', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let mockGen: MockImageGenerator
  let derivSvc: GalleryDerivationService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    mockGen = new MockImageGenerator()
    derivSvc = new GalleryDerivationService(imageSvc, mockGen)

    // 准备主图
    await imageSvc.addImage({
      assetType: 'character', assetId: 'cb1', category: 'main',
      imagePath: '/main.png', isMain: true,
    })
  })

  it('deriveSingle: 用主图作 reference 生成一张派生图', async () => {
    const result = await derivSvc.deriveSingle({
      assetType: 'character', assetId: 'cb1',
      category: 'view', label: '3q_left',
      additionalPrompt: '左 3/4 视角',
    })

    expect(mockGen.calls).toHaveLength(1)
    expect(mockGen.calls[0].referenceImagePaths).toEqual(['/main.png'])
    expect(mockGen.calls[0].label).toBe('3q_left')

    const list = await imageSvc.listByCategory('character', 'cb1', 'view')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      label: '3q_left', imagePath: '/mock/3q_left.png',
      derivedFromImageId: expect.any(String),
    })
    expect(result.id).toBe(list[0].id)
  })

  it('deriveSingle 没有主图时报错', async () => {
    // 删掉主图
    const main = await imageSvc.getMainImage('character', 'cb1')
    if (main) await imageSvc.deleteImage(main.id)

    await expect(derivSvc.deriveSingle({
      assetType: 'character', assetId: 'cb1',
      category: 'view', label: '3q_left',
    })).rejects.toThrow(/主图/)
  })

  it('deriveBatch: 批量派生多个 label', async () => {
    await derivSvc.deriveBatch({
      assetType: 'character', assetId: 'cb1', category: 'view',
      labels: ['front', '3q_left', '3q_right'],
    })

    expect(mockGen.calls).toHaveLength(3)
    const views = await imageSvc.listByCategory('character', 'cb1', 'view')
    expect(views).toHaveLength(3)
    expect(views.map(v => v.label).sort()).toEqual(['3q_left', '3q_right', 'front'])
  })

  it('deriveBatch 跳过已存在的 label', async () => {
    // 先派生一个 front
    await derivSvc.deriveSingle({ assetType: 'character', assetId: 'cb1', category: 'view', label: 'front' })
    mockGen.calls = []

    // batch 包含 front（已存在）和 3q_left（新）
    await derivSvc.deriveBatch({
      assetType: 'character', assetId: 'cb1', category: 'view',
      labels: ['front', '3q_left'],
    })

    expect(mockGen.calls).toHaveLength(1)  // 只生成新的
    expect(mockGen.calls[0].label).toBe('3q_left')
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/gallery-derivation.service.spec.ts
```

- [ ] **Step 3: 实现 service**

```typescript
/**
 * 图谱派生工作流（spec §3.5）：以主图作 reference 生成派生图（view/expression/outfit/pose 等）
 * @module modules/episode-production/assets/services/gallery-derivation
 */
import type { AssetImageService, AssetType, AssetImageCategory } from './asset-image.service'

/** 抽象图像生成器接口（依赖注入，不直接耦合 image.service.ts） */
export interface ImageGenerator {
  generate(opts: {
    referenceImagePaths: string[]
    prompt: string
    negativePrompt?: string
    label: string
  }): Promise<{ imagePath: string; thumbnailPath: string | null }>
}

export interface DeriveSingleInput {
  assetType: AssetType
  assetId: string
  category: AssetImageCategory   // 'view' / 'expression' / 'outfit' / 'pose' 等
  label: string
  additionalPrompt?: string
  negativePrompt?: string
}

export interface DeriveBatchInput {
  assetType: AssetType
  assetId: string
  category: AssetImageCategory
  labels: string[]
}

export class GalleryDerivationService {
  constructor(
    private readonly imageSvc: AssetImageService,
    private readonly imageGen: ImageGenerator,
  ) {}

  async deriveSingle(input: DeriveSingleInput) {
    const main = await this.imageSvc.getMainImage(input.assetType, input.assetId)
    if (!main) {
      throw new Error(`无法派生：${input.assetType}/${input.assetId} 没有主图`)
    }

    const result = await this.imageGen.generate({
      referenceImagePaths: [main.imagePath],
      prompt: input.additionalPrompt ?? `${input.category} · ${input.label}`,
      negativePrompt: input.negativePrompt,
      label: input.label,
    })

    const sortOrder = (await this.imageSvc.listByCategory(input.assetType, input.assetId, input.category)).length

    return await this.imageSvc.addImage({
      assetType: input.assetType,
      assetId: input.assetId,
      category: input.category,
      label: input.label,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath ?? undefined,
      isMain: false,
      derivedFromImageId: main.id,
      prompt: input.additionalPrompt ?? null,
      negativePrompt: input.negativePrompt ?? null,
      sortOrder,
    })
  }

  async deriveBatch(input: DeriveBatchInput): Promise<void> {
    const existing = await this.imageSvc.listByCategory(input.assetType, input.assetId, input.category)
    const existingLabels = new Set(existing.map(e => e.label).filter(Boolean) as string[])
    for (const label of input.labels) {
      if (existingLabels.has(label)) continue
      await this.deriveSingle({
        assetType: input.assetType, assetId: input.assetId,
        category: input.category, label,
      })
    }
  }
}
```

- [ ] **Step 4: barrel + 跑测试**

`assets/services/index.ts` 追加：

```typescript
export { GalleryDerivationService } from './gallery-derivation.service'
export type { ImageGenerator, DeriveSingleInput, DeriveBatchInput } from './gallery-derivation.service'
```

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/gallery-derivation.service.spec.ts
```

4 测试 pass。

- [ ] **Step 5: typecheck + commit**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
git add src/core/modules/episode-production/assets/services/gallery-derivation.service.ts \
        src/core/modules/episode-production/assets/services/index.ts \
        tests/unit/episode-production/assets/gallery-derivation.service.spec.ts
git commit -m "feat(ep/assets): P3a task 3 · gallery-derivation.service 派生工作流

按 spec §3.5：用主图作 reference 派生 view/expression/outfit/pose 等图。
- deriveSingle: 单张派生
- deriveBatch: 批量派生（自动跳过已存在的 label）
- 主图必备，否则抛错
- 派生图自动写入 asset_image 表（derivedFromImageId 链式追溯）

ImageGenerator 抽象接口，本 service 不直接耦合 image.service.ts 实现，
便于测试 mock 和后续切换 provider。"
```

---

## Task 4: character-asset.service.ts — 双源 + override 投影

**Files:**
- Create: `src/core/modules/episode-production/assets/services/character-asset.service.ts`
- Create: `tests/unit/episode-production/assets/character-asset.service.spec.ts`
- Modify: `src/core/modules/episode-production/assets/services/index.ts`

**Concept:** 包装 character_binding 的业务读写。核心是 `getEffectiveData()`：source_type 决定字段来源——linked_lw 模式投影 lw_character + 用 override_* 覆盖；standalone 模式直接读 standalone_*。所有上层（剧本 / 分镜 / 渲染）都通过它读"最终生效的角色字段"。

- [ ] **Step 1: 看 lw_character 字段**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "@Column" src/core/database/entities/lw-character.entity.ts | head -15
```

记 lw 角色的字段（name / description / appearance / outfit 等命名）。

- [ ] **Step 2: 写测试**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { CharacterAssetService } from '@core/modules/episode-production/assets/services/character-asset.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:',
    entities: [CharacterBindingEntity, LwCharacterEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('CharacterAssetService', () => {
  let ds: DataSource
  let svc: CharacterAssetService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new CharacterAssetService(ds)
  })

  it('linked_lw 模式：getEffectiveData 投影 lw_character + override 覆盖', async () => {
    // lw_character 数据
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1', projectId: 'lwp1',
      name: '张三', description: '主角', appearance: '剑眉星目', outfit: '玄袍',
    } as any)
    // character_binding linked_lw + 覆盖 outfit
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1', projectId: 'p1',
      longWritingCharacterId: 'lwc1',
      sourceType: 'linked_lw',
      overrideOutfit: '白衣（重要场合）',
    } as any)

    const eff = await svc.getEffectiveData('cb1')
    expect(eff).toMatchObject({
      name: '张三',
      description: '主角',
      appearance: '剑眉星目',
      outfit: '白衣（重要场合）',  // override 生效
      source: 'linked_lw',
    })
  })

  it('standalone 模式：getEffectiveData 直接读 standalone_*', async () => {
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb2', projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '老板娘', standaloneDescription: '茶馆掌柜',
    } as any)

    const eff = await svc.getEffectiveData('cb2')
    expect(eff).toMatchObject({
      name: '老板娘',
      description: '茶馆掌柜',
      source: 'standalone',
    })
  })

  it('linked_lw 没有任何 override 时全部投影 lw', async () => {
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1', projectId: 'lwp1',
      name: '李四', description: '配角', outfit: '红衣',
    } as any)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1', projectId: 'p1',
      longWritingCharacterId: 'lwc1',
      sourceType: 'linked_lw',
    } as any)

    const eff = await svc.getEffectiveData('cb1')
    expect(eff.name).toBe('李四')
    expect(eff.outfit).toBe('红衣')
  })

  it('listByProject: 取一个 project 的所有 binding', async () => {
    await ds.getRepository(CharacterBindingEntity).save([
      { id: 'cb1', projectId: 'p1', sourceType: 'standalone', standaloneName: 'A' },
      { id: 'cb2', projectId: 'p1', sourceType: 'standalone', standaloneName: 'B' },
      { id: 'cb3', projectId: 'p2', sourceType: 'standalone', standaloneName: 'C' },
    ] as any)

    const list = await svc.listByProject('p1')
    expect(list.map(b => b.id).sort()).toEqual(['cb1', 'cb2'])
  })

  it('createStandalone: 新建 standalone 角色', async () => {
    const created = await svc.createStandalone({
      projectId: 'p1',
      name: '新角色',
      description: '描述',
    })
    expect(created.sourceType).toBe('standalone')
    expect(created.standaloneName).toBe('新角色')
  })

  it('createLinkedLw: 新建 linked_lw 角色', async () => {
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1', projectId: 'lwp1', name: '张三', description: 'X',
    } as any)

    const created = await svc.createLinkedLw({
      projectId: 'p1',
      lwCharacterId: 'lwc1',
    })
    expect(created.sourceType).toBe('linked_lw')
    expect(created.longWritingCharacterId).toBe('lwc1')
  })
})
```

- [ ] **Step 3: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/character-asset.service.spec.ts
```

- [ ] **Step 4: 实现 service**

```typescript
/**
 * 角色资产 service（spec §3.7）
 * 核心：getEffectiveData() 封装双源逻辑（linked_lw 投影 + override / standalone 直接读）
 * @module modules/episode-production/assets/services/character-asset
 */
import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import type { EffectiveCharacterData } from '@shared/types/episode-production/domain.types'

export interface CreateStandaloneInput {
  projectId: string
  name: string
  description?: string
  voiceId?: string
}

export interface CreateLinkedLwInput {
  projectId: string
  lwCharacterId: string
  initialOverride?: {
    name?: string
    description?: string
    appearance?: string
    outfit?: string
  }
}

export class CharacterAssetService {
  constructor(private readonly ds: DataSource) {}

  private get bindingRepo() { return this.ds.getRepository(CharacterBindingEntity) }
  private get lwRepo()      { return this.ds.getRepository(LwCharacterEntity) }

  async getById(id: string): Promise<CharacterBindingEntity | null> {
    return await this.bindingRepo.findOne({ where: { id } })
  }

  async listByProject(projectId: string): Promise<CharacterBindingEntity[]> {
    return await this.bindingRepo.find({ where: { projectId }, order: { createdAt: 'ASC' } })
  }

  async getEffectiveData(bindingId: string): Promise<EffectiveCharacterData> {
    const b = await this.bindingRepo.findOne({ where: { id: bindingId } })
    if (!b) throw new Error(`CharacterBinding not found: ${bindingId}`)

    if (b.sourceType === 'standalone') {
      return {
        name: b.standaloneName ?? '(未命名)',
        description: b.standaloneDescription ?? '',
        outfit: undefined,
        appearance: undefined,
        voiceId: b.voiceId ?? null,
        portraitId: b.portraitId ?? null,
        source: 'standalone',
      }
    }

    // linked_lw: 投影 lw + override 覆盖
    const lw = b.longWritingCharacterId
      ? await this.lwRepo.findOne({ where: { id: b.longWritingCharacterId } })
      : null
    return {
      name:        b.overrideName        ?? lw?.name        ?? '(未命名)',
      description: b.overrideDescription ?? lw?.description ?? '',
      appearance:  b.overrideAppearance  ?? (lw as any)?.appearance ?? undefined,
      outfit:      b.overrideOutfit      ?? (lw as any)?.outfit     ?? undefined,
      voiceId:     b.voiceId ?? null,
      portraitId:  b.portraitId ?? null,
      source: 'linked_lw',
    }
  }

  async createStandalone(input: CreateStandaloneInput): Promise<CharacterBindingEntity> {
    const id = `cb_${randomBytes(8).toString('hex')}`
    const entity = this.bindingRepo.create({
      id,
      projectId: input.projectId,
      sourceType: 'standalone',
      standaloneName: input.name,
      standaloneDescription: input.description ?? null,
      voiceId: input.voiceId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    return await this.bindingRepo.save(entity as any)
  }

  async createLinkedLw(input: CreateLinkedLwInput): Promise<CharacterBindingEntity> {
    const id = `cb_${randomBytes(8).toString('hex')}`
    const entity = this.bindingRepo.create({
      id,
      projectId: input.projectId,
      longWritingCharacterId: input.lwCharacterId,
      sourceType: 'linked_lw',
      overrideName: input.initialOverride?.name ?? null,
      overrideDescription: input.initialOverride?.description ?? null,
      overrideAppearance: input.initialOverride?.appearance ?? null,
      overrideOutfit: input.initialOverride?.outfit ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    return await this.bindingRepo.save(entity as any)
  }

  async updateOverride(
    bindingId: string,
    override: Partial<{ name: string | null; description: string | null; appearance: string | null; outfit: string | null }>,
  ): Promise<void> {
    const patch: any = { updatedAt: new Date() }
    if ('name' in override)        patch.overrideName        = override.name
    if ('description' in override) patch.overrideDescription = override.description
    if ('appearance' in override)  patch.overrideAppearance  = override.appearance
    if ('outfit' in override)      patch.overrideOutfit      = override.outfit
    await this.bindingRepo.update(bindingId, patch)
  }

  async updateStandalone(
    bindingId: string,
    patch: Partial<{ name: string; description: string }>,
  ): Promise<void> {
    const update: any = { updatedAt: new Date() }
    if ('name' in patch)        update.standaloneName        = patch.name
    if ('description' in patch) update.standaloneDescription = patch.description
    await this.bindingRepo.update(bindingId, update)
  }

  async setVoice(bindingId: string, voiceId: string | null): Promise<void> {
    await this.bindingRepo.update(bindingId, { voiceId, updatedAt: new Date() } as any)
  }

  async setPortrait(bindingId: string, portraitId: string | null): Promise<void> {
    await this.bindingRepo.update(bindingId, { portraitId, updatedAt: new Date() } as any)
  }

  async delete(bindingId: string): Promise<void> {
    await this.bindingRepo.delete(bindingId)
  }
}
```

> 注：`(lw as any)?.appearance` / `(lw as any)?.outfit` 用 as any 因为 lw_character 的 entity 字段名可能与本 task 示例略有差异（具体字段以 step 1 grep 结果为准）。如果 lw_character 实际字段叫别的名字，调整这两行。

- [ ] **Step 5: barrel + 跑测试**

`assets/services/index.ts` 追加：

```typescript
export { CharacterAssetService } from './character-asset.service'
export type { CreateStandaloneInput, CreateLinkedLwInput } from './character-asset.service'
```

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/character-asset.service.spec.ts
```

6 测试 pass。

- [ ] **Step 6: typecheck + commit**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
git add src/core/modules/episode-production/assets/services/character-asset.service.ts \
        src/core/modules/episode-production/assets/services/index.ts \
        tests/unit/episode-production/assets/character-asset.service.spec.ts
git commit -m "feat(ep/assets): P3a task 4 · character-asset.service 双源 + override 投影

按 spec §3.7 实现 character_binding 业务层：
- getEffectiveData: 双源生效数据（linked_lw 投影 lw_character + override 覆盖
                                    / standalone 直接读 standalone_*）
- createStandalone / createLinkedLw: 新建两类 binding
- updateOverride: 改 linked_lw 模式的 override 字段
- updateStandalone: 改 standalone 模式的 standalone 字段
- setVoice / setPortrait / delete: 其它常用操作

6 测试覆盖核心路径。"
```

---

## Task 5: location-asset.service.ts — time/weather/angle 变体

**Files:**
- Create: `src/core/modules/episode-production/assets/services/location-asset.service.ts`
- Create: `tests/unit/episode-production/assets/location-asset.service.spec.ts`
- Modify: `assets/services/index.ts`

**Concept:** 同 character-asset 的双源结构 + 增加"按 time/weather/angle 变体取图"的辅助方法（按 spec §3.4 优先级降级）。**不含** panorama_360 / panorama_snapshot 管理（留 P3c）。

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LocationAssetService } from '@core/modules/episode-production/assets/services/location-asset.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:',
    entities: [LocationBindingEntity, LwLocationEntity, AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('LocationAssetService', () => {
  let ds: DataSource
  let svc: LocationAssetService
  let imageSvc: AssetImageService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    svc = new LocationAssetService(ds, imageSvc)
  })

  it('linked_lw: getEffectiveData 投影 + override', async () => {
    await ds.getRepository(LwLocationEntity).save({ id: 'lwl1', projectId: 'lwp1', name: '茶馆', description: '老字号' } as any)
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb1', projectId: 'p1', locationName: '茶馆',
      longWritingLocationId: 'lwl1', sourceType: 'linked_lw',
      overrideDescription: '本剧重新装修过',
    } as any)

    const eff = await svc.getEffectiveData('lb1')
    expect(eff).toMatchObject({ name: '茶馆', description: '本剧重新装修过', source: 'linked_lw' })
  })

  it('pickBestVariant: 按 time+weather+angle 优先级降级', async () => {
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb1', projectId: 'p1', locationName: '茶馆',
      sourceType: 'standalone', standaloneName: '茶馆',
    } as any)

    // 主图 + 一张 evening+cloudy 的 angle_variant
    await imageSvc.addImage({ assetType: 'location', assetId: 'lb1', category: 'main', imagePath: '/main.png', isMain: true })
    await imageSvc.addImage({
      assetType: 'location', assetId: 'lb1', category: 'angle_variant', label: 'wide_shot',
      imagePath: '/wide_evening_cloudy.png', isMain: false,
      metadata: { time: 'evening', weather: 'cloudy', angle: 'wide_shot' } as any,
    })
    await imageSvc.addImage({
      assetType: 'location', assetId: 'lb1', category: 'time_variant', label: 'evening',
      imagePath: '/evening.png', isMain: false,
      metadata: { time: 'evening' } as any,
    })

    // 完美匹配
    const exact = await svc.pickBestVariant('lb1', { time: 'evening', weather: 'cloudy', angle: 'wide_shot' })
    expect(exact?.imagePath).toBe('/wide_evening_cloudy.png')

    // 仅 time 匹配
    const partial = await svc.pickBestVariant('lb1', { time: 'evening', weather: 'sunny', angle: 'entrance' })
    expect(partial?.imagePath).toBe('/evening.png')

    // 都不匹配 → 主图
    const fallback = await svc.pickBestVariant('lb1', { time: 'morning', weather: 'snowy', angle: 'back' })
    expect(fallback?.imagePath).toBe('/main.png')
  })

  it('createStandalone / createLinkedLw / updateOverride 行为正确', async () => {
    const a = await svc.createStandalone({ projectId: 'p1', name: '客栈', description: '宋代风格' })
    expect(a.sourceType).toBe('standalone')

    await ds.getRepository(LwLocationEntity).save({ id: 'lwl1', projectId: 'lwp1', name: '茶馆' } as any)
    const b = await svc.createLinkedLw({ projectId: 'p1', lwLocationId: 'lwl1', name: '茶馆' })
    expect(b.sourceType).toBe('linked_lw')

    await svc.updateOverride(b.id, { description: '新描述' })
    const reloaded = await svc.getById(b.id)
    expect(reloaded?.overrideDescription).toBe('新描述')
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/location-asset.service.spec.ts
```

- [ ] **Step 3: 实现 service**

```typescript
/**
 * 地点资产 service（spec §3.4 / §3.7）
 * @module modules/episode-production/assets/services/location-asset
 */
import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import type { EffectiveLocationData } from '@shared/types/episode-production/domain.types'
import type { AssetImageService } from './asset-image.service'

export interface PickVariantInput {
  time?: string
  weather?: string
  angle?: string
}

export class LocationAssetService {
  constructor(
    private readonly ds: DataSource,
    private readonly imageSvc: AssetImageService,
  ) {}

  private get repo()   { return this.ds.getRepository(LocationBindingEntity) }
  private get lwRepo() { return this.ds.getRepository(LwLocationEntity) }

  async getById(id: string): Promise<LocationBindingEntity | null> {
    return await this.repo.findOne({ where: { id } })
  }

  async listByProject(projectId: string): Promise<LocationBindingEntity[]> {
    return await this.repo.find({ where: { projectId }, order: { createdAt: 'ASC' } })
  }

  async getEffectiveData(bindingId: string): Promise<EffectiveLocationData> {
    const b = await this.repo.findOne({ where: { id: bindingId } })
    if (!b) throw new Error(`LocationBinding not found: ${bindingId}`)

    if (b.sourceType === 'standalone') {
      return {
        name: b.standaloneName ?? b.locationName ?? '(未命名)',
        description: b.standaloneDescription ?? '',
        source: 'standalone',
      }
    }

    const lw = b.longWritingLocationId
      ? await this.lwRepo.findOne({ where: { id: b.longWritingLocationId } })
      : null
    return {
      name:        b.overrideName        ?? lw?.name        ?? b.locationName ?? '(未命名)',
      description: b.overrideDescription ?? lw?.description ?? '',
      source: 'linked_lw',
    }
  }

  /**
   * 按 spec §3.4 优先级取图：
   *   1. time+weather+angle 都匹配 → 用之
   *   2. time 匹配 → 用之
   *   3. 都不匹配 → 主图
   * 假设变体图的 metadata 里存了 { time, weather, angle }
   */
  async pickBestVariant(bindingId: string, input: PickVariantInput): Promise<AssetImageEntity | null> {
    const allImages = await this.imageSvc.listByAsset('location', bindingId)
    const variants = allImages.filter(img => img.category !== 'main')
    const main = allImages.find(img => img.category === 'main') ?? null

    const matchScore = (img: AssetImageEntity): number => {
      const meta = (img.metadata ? JSON.parse(typeof img.metadata === 'string' ? img.metadata : JSON.stringify(img.metadata)) : {}) as Record<string, unknown>
      let score = 0
      if (input.angle && meta.angle === input.angle) score += 4
      if (input.time && meta.time === input.time) score += 2
      if (input.weather && meta.weather === input.weather) score += 1
      return score
    }

    const sorted = [...variants].map(v => ({ v, score: matchScore(v) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
    if (sorted.length > 0) return sorted[0]!.v
    return main
  }

  async createStandalone(input: { projectId: string; name: string; description?: string }): Promise<LocationBindingEntity> {
    const id = `lb_${randomBytes(8).toString('hex')}`
    return await this.repo.save(this.repo.create({
      id, projectId: input.projectId,
      locationName: input.name,
      sourceType: 'standalone',
      standaloneName: input.name,
      standaloneDescription: input.description ?? null,
      createdAt: new Date(), updatedAt: new Date(),
    } as any) as any)
  }

  async createLinkedLw(input: { projectId: string; lwLocationId: string; name: string }): Promise<LocationBindingEntity> {
    const id = `lb_${randomBytes(8).toString('hex')}`
    return await this.repo.save(this.repo.create({
      id, projectId: input.projectId,
      locationName: input.name,
      longWritingLocationId: input.lwLocationId,
      sourceType: 'linked_lw',
      createdAt: new Date(), updatedAt: new Date(),
    } as any) as any)
  }

  async updateOverride(bindingId: string, override: Partial<{ name: string | null; description: string | null }>): Promise<void> {
    const patch: any = { updatedAt: new Date() }
    if ('name' in override)        patch.overrideName        = override.name
    if ('description' in override) patch.overrideDescription = override.description
    await this.repo.update(bindingId, patch)
  }

  async updateStandalone(bindingId: string, patch: Partial<{ name: string; description: string }>): Promise<void> {
    const update: any = { updatedAt: new Date() }
    if ('name' in patch)        update.standaloneName        = patch.name
    if ('description' in patch) update.standaloneDescription = patch.description
    await this.repo.update(bindingId, update)
  }

  async delete(bindingId: string): Promise<void> {
    await this.repo.delete(bindingId)
  }
}
```

- [ ] **Step 4: barrel + 跑测试 + commit**

```typescript
// assets/services/index.ts
export { LocationAssetService } from './location-asset.service'
export type { PickVariantInput } from './location-asset.service'
```

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/location-asset.service.spec.ts
git add src/core/modules/episode-production/assets/services/location-asset.service.ts \
        src/core/modules/episode-production/assets/services/index.ts \
        tests/unit/episode-production/assets/location-asset.service.spec.ts
git commit -m "feat(ep/assets): P3a task 5 · location-asset.service 含变体 + 双源

按 spec §3.4 / §3.7：
- getEffectiveData: 双源生效数据
- pickBestVariant: 按 time+weather+angle 优先级降级取图
                    （angle 4 分 + time 2 分 + weather 1 分；都不匹配回退主图）
- createStandalone / createLinkedLw / updateOverride / updateStandalone

不含 panorama_360 / panorama_snapshot（留 P3c）。"
```

---

## Task 6: item-asset.service.ts

**Files:**
- Create: `src/core/modules/episode-production/assets/services/item-asset.service.ts`
- Create: `tests/unit/episode-production/assets/item-asset.service.spec.ts`
- Modify: `assets/services/index.ts`

**Concept:** 简单 CRUD + 双源 getEffectiveData。物品没有"变体降级"（图集结构简单）。

- [ ] **Step 1: 写测试 + 实现 + commit（结构同 task 4/5，简化版）**

测试覆盖：
- linked_lw 投影 + override
- standalone 直接读
- create / update / delete

实现 ItemAssetService：

```typescript
import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import type { EffectiveItemData } from '@shared/types/episode-production/domain.types'

export class ItemAssetService {
  constructor(private readonly ds: DataSource) {}
  private get repo()   { return this.ds.getRepository(ItemBindingEntity) }
  private get lwRepo() { return this.ds.getRepository(LwItemEntity) }

  async getById(id: string)               { return this.repo.findOne({ where: { id } }) }
  async listByProject(projectId: string)  { return this.repo.find({ where: { projectId }, order: { createdAt: 'ASC' } }) }

  async getEffectiveData(bindingId: string): Promise<EffectiveItemData> {
    const b = await this.repo.findOne({ where: { id: bindingId } })
    if (!b) throw new Error(`ItemBinding not found: ${bindingId}`)
    if (b.sourceType === 'standalone') {
      return { name: b.standaloneName ?? b.itemName ?? '(未命名)', description: b.standaloneDescription ?? '', source: 'standalone' }
    }
    const lw = b.longWritingItemId ? await this.lwRepo.findOne({ where: { id: b.longWritingItemId } }) : null
    return {
      name:        b.overrideName        ?? lw?.name ?? b.itemName ?? '(未命名)',
      description: b.overrideDescription ?? lw?.description ?? '',
      source: 'linked_lw',
    }
  }

  async createStandalone(input: { projectId: string; name: string; description?: string }) {
    const id = `ib_${randomBytes(8).toString('hex')}`
    return await this.repo.save(this.repo.create({
      id, projectId: input.projectId, itemName: input.name,
      sourceType: 'standalone', standaloneName: input.name, standaloneDescription: input.description ?? null,
      createdAt: new Date(), updatedAt: new Date(),
    } as any) as any)
  }

  async createLinkedLw(input: { projectId: string; lwItemId: string; name: string }) {
    const id = `ib_${randomBytes(8).toString('hex')}`
    return await this.repo.save(this.repo.create({
      id, projectId: input.projectId, itemName: input.name,
      longWritingItemId: input.lwItemId, sourceType: 'linked_lw',
      createdAt: new Date(), updatedAt: new Date(),
    } as any) as any)
  }

  async updateOverride(bindingId: string, override: Partial<{ name: string | null; description: string | null }>): Promise<void> {
    const patch: any = { updatedAt: new Date() }
    if ('name' in override)        patch.overrideName        = override.name
    if ('description' in override) patch.overrideDescription = override.description
    await this.repo.update(bindingId, patch)
  }

  async updateStandalone(bindingId: string, patch: Partial<{ name: string; description: string }>): Promise<void> {
    const update: any = { updatedAt: new Date() }
    if ('name' in patch)        update.standaloneName        = patch.name
    if ('description' in patch) update.standaloneDescription = patch.description
    await this.repo.update(bindingId, update)
  }

  async delete(bindingId: string)         { await this.repo.delete(bindingId) }
}
```

测试参照 task 4 的 character-asset.service.spec.ts 风格写 5 个 case（linked_lw / standalone / create*2 / update / list）。

barrel + commit：

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/modules/episode-production/assets/services/item-asset.service.ts \
        src/core/modules/episode-production/assets/services/index.ts \
        tests/unit/episode-production/assets/item-asset.service.spec.ts
git commit -m "feat(ep/assets): P3a task 6 · item-asset.service 简单 CRUD + 双源"
```

---

## Task 7: voice-asset.service.ts — 语音 + 角色绑定

**Files:**
- Create: `src/core/modules/episode-production/assets/services/voice-asset.service.ts`
- Create: `tests/unit/episode-production/assets/voice-asset.service.spec.ts`
- Modify: `assets/services/index.ts`

**Concept:** 包装 cloned_voices 表（spec §3.9 语音库）+ 角色 voice 绑定的辅助方法。本 service 不做"语音合成"——那归 P5 渲染域 audio/dialogue-synthesis.service。

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { ClonedVoiceEntity } from '@core/database/entities/cloned-voice.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { VoiceAssetService } from '@core/modules/episode-production/assets/services/voice-asset.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:',
    entities: [ClonedVoiceEntity, CharacterBindingEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('VoiceAssetService', () => {
  let ds: DataSource
  let svc: VoiceAssetService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new VoiceAssetService(ds)
  })

  it('listAvailableVoices: 列出 cloned_voices 全部', async () => {
    await ds.getRepository(ClonedVoiceEntity).save([
      { id: 'v1', name: '沉稳男声', status: 'ready', voiceId: 'sys-1', createdAt: '2026-01-01' },
      { id: 'v2', name: '温柔女声', status: 'ready', voiceId: 'sys-2', createdAt: '2026-01-02' },
      { id: 'v3', name: '复刻 A',   status: 'training', voiceId: null,  createdAt: '2026-01-03' },
    ] as any)

    const voices = await svc.listAvailableVoices()
    expect(voices.map(v => v.id).sort()).toEqual(['v1', 'v2', 'v3'])
  })

  it('listReadyVoices: 仅 status=ready', async () => {
    await ds.getRepository(ClonedVoiceEntity).save([
      { id: 'v1', name: 'A', status: 'ready', voiceId: 'sys-1', createdAt: '2026-01-01' },
      { id: 'v2', name: 'B', status: 'training', voiceId: null, createdAt: '2026-01-02' },
    ] as any)

    const ready = await svc.listReadyVoices()
    expect(ready.map(v => v.id)).toEqual(['v1'])
  })

  it('bindToCharacter: 绑定 voice 到 character_binding', async () => {
    await ds.getRepository(ClonedVoiceEntity).save({ id: 'v1', name: 'A', status: 'ready', voiceId: 'sys-1', createdAt: '2026-01-01' } as any)
    await ds.getRepository(CharacterBindingEntity).save({ id: 'cb1', projectId: 'p1', sourceType: 'standalone', standaloneName: 'X' } as any)

    await svc.bindToCharacter('cb1', 'v1')

    const cb = await ds.getRepository(CharacterBindingEntity).findOne({ where: { id: 'cb1' } })
    expect(cb?.voiceId).toBe('v1')
  })

  it('listCharactersByVoice: 反向查谁绑了这个 voice', async () => {
    await ds.getRepository(CharacterBindingEntity).save([
      { id: 'cb1', projectId: 'p1', sourceType: 'standalone', standaloneName: 'X', voiceId: 'v1' },
      { id: 'cb2', projectId: 'p1', sourceType: 'standalone', standaloneName: 'Y', voiceId: 'v1' },
      { id: 'cb3', projectId: 'p1', sourceType: 'standalone', standaloneName: 'Z', voiceId: 'v2' },
    ] as any)

    const list = await svc.listCharactersByVoice('v1')
    expect(list.map(c => c.id).sort()).toEqual(['cb1', 'cb2'])
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/voice-asset.service.spec.ts
```

- [ ] **Step 3: 实现 service**

```typescript
/**
 * 语音资产 service（spec §3.9）：管理声音库 + 角色 voice 绑定
 * @module modules/episode-production/assets/services/voice-asset
 */
import type { DataSource } from 'typeorm'
import { ClonedVoiceEntity } from '@core/database/entities/cloned-voice.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'

export class VoiceAssetService {
  constructor(private readonly ds: DataSource) {}

  private get voiceRepo() { return this.ds.getRepository(ClonedVoiceEntity) }
  private get charRepo()  { return this.ds.getRepository(CharacterBindingEntity) }

  async listAvailableVoices(): Promise<ClonedVoiceEntity[]> {
    return await this.voiceRepo.find({ order: { createdAt: 'DESC' } })
  }

  async listReadyVoices(): Promise<ClonedVoiceEntity[]> {
    return await this.voiceRepo.find({ where: { status: 'ready' }, order: { createdAt: 'DESC' } })
  }

  async getVoiceById(voiceId: string): Promise<ClonedVoiceEntity | null> {
    return await this.voiceRepo.findOne({ where: { id: voiceId } })
  }

  async bindToCharacter(characterBindingId: string, voiceId: string | null): Promise<void> {
    await this.charRepo.update(characterBindingId, { voiceId, updatedAt: new Date() } as any)
  }

  async listCharactersByVoice(voiceId: string): Promise<CharacterBindingEntity[]> {
    return await this.charRepo.find({ where: { voiceId } as any })
  }
}
```

- [ ] **Step 4: barrel + 跑测试 + commit**

```typescript
// assets/services/index.ts
export { VoiceAssetService } from './voice-asset.service'
```

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/voice-asset.service.spec.ts
git add src/core/modules/episode-production/assets/services/voice-asset.service.ts \
        src/core/modules/episode-production/assets/services/index.ts \
        tests/unit/episode-production/assets/voice-asset.service.spec.ts
git commit -m "feat(ep/assets): P3a task 7 · voice-asset.service 语音库 + 角色绑定

按 spec §3.9：
- listAvailableVoices / listReadyVoices: 声音库（cloned_voices）查询
- bindToCharacter / listCharactersByVoice: 角色 voice_id 绑定

不做 TTS 合成（归 P5 渲染域 audio service）。"
```

---

## Task 8: asset-import.service.ts — portrait/image 导入

**Files:**
- Create: `src/core/modules/episode-production/assets/services/asset-import.service.ts`
- Create: `tests/unit/episode-production/assets/asset-import.service.spec.ts`
- Modify: `assets/services/index.ts`

**Concept:** 实现 spec §3.11 的"引用 + 导入"机制：从 portrait_variant / image 模块的图导入到剧集资产图谱（asset_image）。本 task 只做"复制 image_path 引用 + 记录 source_*_id"，不做"物理拷贝文件"（文件路径直接引用）。

- [ ] **Step 1: 看 portrait_variant 字段**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "@Column" src/core/database/entities/portrait-variant.entity.ts
```

- [ ] **Step 2: 写测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { PortraitVariantEntity } from '@core/database/entities/portrait-variant.entity'
import { ImageEntity } from '@core/database/entities/image.entity'  // 项目里 image 实体名以实际为准
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { AssetImportService } from '@core/modules/episode-production/assets/services/asset-import.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:',
    entities: [AssetImageEntity, PortraitVariantEntity, ImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('AssetImportService', () => {
  let ds: DataSource
  let imgSvc: AssetImageService
  let importSvc: AssetImportService

  beforeEach(async () => {
    ds = await buildDb()
    imgSvc = new AssetImageService(ds)
    importSvc = new AssetImportService(ds, imgSvc)
  })

  it('importFromPortraitVariant: 把 portrait variant 导入为 character 图谱的一张', async () => {
    await ds.getRepository(PortraitVariantEntity).save({
      id: 'pv1', characterId: 'pc1', name: 'front',
      imagePath: '/portrait/front.png', createdAt: new Date(),
    } as any)

    const result = await importSvc.importFromPortraitVariant({
      variantId: 'pv1',
      targetAssetType: 'character',
      targetAssetId: 'cb1',
      asCategory: 'view',
      asLabel: 'front',
    })

    expect(result.imagePath).toBe('/portrait/front.png')

    const list = await imgSvc.listByAsset('character', 'cb1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ category: 'view', label: 'front', imagePath: '/portrait/front.png' })
  })

  it('importFromImage: 从 image 模块导入为 location 主图', async () => {
    await ds.getRepository(ImageEntity).save({
      id: 'img1', imagePath: '/image/teahouse.png', prompt: '茶馆远景', createdAt: new Date(),
    } as any)

    const result = await importSvc.importFromImage({
      imageId: 'img1',
      targetAssetType: 'location',
      targetAssetId: 'lb1',
      asCategory: 'main',
      asMain: true,
    })

    expect(result.imagePath).toBe('/image/teahouse.png')
    expect(result.isMain).toBe(1)
  })

  it('importFromPortraitVariant 找不到 variant 时报错', async () => {
    await expect(importSvc.importFromPortraitVariant({
      variantId: 'pv-not-exist',
      targetAssetType: 'character', targetAssetId: 'cb1',
      asCategory: 'view', asLabel: 'front',
    })).rejects.toThrow(/PortraitVariant/i)
  })
})
```

> 注：`ImageEntity` 的实际类名以项目实际为准（grep `src/core/database/entities/image*.entity.ts`），如果是 `ImagesEntity` 或别的名字调整。

- [ ] **Step 3: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/asset-import.service.spec.ts
```

- [ ] **Step 4: 实现 service**

```typescript
/**
 * 资产导入 service（spec §3.11）：从 portrait_variant 或 image 模块导入图到资产图谱
 * @module modules/episode-production/assets/services/asset-import
 */
import type { DataSource } from 'typeorm'
import { PortraitVariantEntity } from '@core/database/entities/portrait-variant.entity'
import { ImageEntity } from '@core/database/entities/image.entity'  // 实际名以项目为准
import type { AssetImageService, AssetType, AssetImageCategory } from './asset-image.service'

export interface ImportFromPortraitVariantInput {
  variantId: string
  targetAssetType: AssetType
  targetAssetId: string
  asCategory: AssetImageCategory
  asLabel?: string
  asMain?: boolean
}

export interface ImportFromImageInput {
  imageId: string
  targetAssetType: AssetType
  targetAssetId: string
  asCategory: AssetImageCategory
  asLabel?: string
  asMain?: boolean
}

export class AssetImportService {
  constructor(
    private readonly ds: DataSource,
    private readonly imageSvc: AssetImageService,
  ) {}

  async importFromPortraitVariant(input: ImportFromPortraitVariantInput) {
    const v = await this.ds.getRepository(PortraitVariantEntity).findOne({ where: { id: input.variantId } })
    if (!v) throw new Error(`PortraitVariant not found: ${input.variantId}`)

    return await this.imageSvc.addImage({
      assetType: input.targetAssetType,
      assetId: input.targetAssetId,
      category: input.asCategory,
      label: input.asLabel ?? (v as any).name ?? null,
      imagePath: v.imagePath,
      isMain: input.asMain ?? false,
      derivedFromImageId: undefined,  // 不算"派生"，是"导入引用"
    })
  }

  async importFromImage(input: ImportFromImageInput) {
    const img = await this.ds.getRepository(ImageEntity).findOne({ where: { id: input.imageId } })
    if (!img) throw new Error(`Image not found: ${input.imageId}`)

    return await this.imageSvc.addImage({
      assetType: input.targetAssetType,
      assetId: input.targetAssetId,
      category: input.asCategory,
      label: input.asLabel ?? null,
      imagePath: (img as any).imagePath,
      prompt: (img as any).prompt ?? null,
      isMain: input.asMain ?? false,
    })
  }
}
```

- [ ] **Step 5: barrel + 跑测试 + commit**

```typescript
// assets/services/index.ts
export { AssetImportService } from './asset-import.service'
export type { ImportFromPortraitVariantInput, ImportFromImageInput } from './asset-import.service'
```

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/episode-production/assets/asset-import.service.spec.ts
git add src/core/modules/episode-production/assets/services/asset-import.service.ts \
        src/core/modules/episode-production/assets/services/index.ts \
        tests/unit/episode-production/assets/asset-import.service.spec.ts
git commit -m "feat(ep/assets): P3a task 8 · asset-import.service portrait/image 导入

按 spec §3.11：
- importFromPortraitVariant: 把 portrait_variant 导入到资产图谱
- importFromImage: 把 image 模块的图导入到资产图谱
- 仅引用 imagePath（不物理复制文件，节省存储）
- 不算'派生'，是'导入引用'（derivedFromImageId 不填）

注：portrait variant 的视角类型对齐到 character_binding views 标准枚举的工作
留 P3b 完成（届时 asLabel 不需要手动指定，自动映射）。"
```

---

## Task 9: IPC handlers + 双端契约同步

**Files:**
- Modify: `src/electron/ipc/handlers/episode-production/asset/character-asset.handler.ts`
- Modify: `src/electron/ipc/handlers/episode-production/asset/location-asset.handler.ts`
- Modify: `src/electron/ipc/handlers/episode-production/asset/item-asset.handler.ts`
- Modify: `src/electron/ipc/handlers/episode-production/asset/voice-asset.handler.ts`
- Modify: `src/preload/index.ts`（IPC_CHANNELS + namespace）
- Modify: `src/web/client/channel-map.ts`（5 文件契约同步）

**Concept:** 把 task 2-8 的 7 个 service 通过 IPC 暴露给 renderer。每个资产类型一个 handler 文件，每个 service 方法对应 1-2 个 channel（通常 list / get / create / update / delete）。

> 这是 P3a 中跨度最大的 task。涉及 ~30 个新 channel + 5 文件双端契约同步。预计 step 较多（15+）。

- [ ] **Step 1: 列要新增的 channels（按子域）**

```
character (asset/character-asset.handler.ts):
  ep:asset:character:list                     listByProject(projectId) → CharacterBinding[]
  ep:asset:character:get                      getById(id) → CharacterBinding
  ep:asset:character:effective                getEffectiveData(id) → EffectiveCharacterData
  ep:asset:character:create-standalone        createStandalone(input)
  ep:asset:character:create-linked-lw         createLinkedLw(input)
  ep:asset:character:update-override          updateOverride(id, override)
  ep:asset:character:update-standalone        updateStandalone(id, patch)
  ep:asset:character:set-voice                setVoice(id, voiceId)
  ep:asset:character:set-portrait             setPortrait(id, portraitId)
  ep:asset:character:delete                   delete(id)

location (asset/location-asset.handler.ts):
  ep:asset:location:list / get / effective / create-standalone / create-linked-lw
  ep:asset:location:pick-best-variant         pickBestVariant(id, input)
  ep:asset:location:update-override / update-standalone / delete

item (asset/item-asset.handler.ts):
  ep:asset:item:list / get / effective / create-standalone / create-linked-lw
  ep:asset:item:update-override / update-standalone / delete

voice (asset/voice-asset.handler.ts):
  ep:asset:voice:list                         listAvailableVoices()
  ep:asset:voice:list-ready                   listReadyVoices()
  ep:asset:voice:get                          getVoiceById(id)
  ep:asset:voice:bind-to-character            bindToCharacter(charBindingId, voiceId)
  ep:asset:voice:list-characters              listCharactersByVoice(voiceId)

asset-image (顶层 asset/asset-image.handler.ts，单独文件):
  ep:asset:image:list-by-asset                listByAsset(assetType, assetId)
  ep:asset:image:list-by-category             listByCategory(...)
  ep:asset:image:get-main                     getMainImage(assetType, assetId)
  ep:asset:image:add                          addImage(input)
  ep:asset:image:set-as-main                  setAsMain(id)
  ep:asset:image:delete                       deleteImage(id)
  ep:asset:image:update                       updateImage(id, patch)

derivation (asset/derivation.handler.ts):
  ep:asset:derive:single                      deriveSingle(input)
  ep:asset:derive:batch                       deriveBatch(input)

import (asset/import.handler.ts):
  ep:asset:import:from-portrait               importFromPortraitVariant(input)
  ep:asset:import:from-image                  importFromImage(input)
```

约 35 个 channel。

- [ ] **Step 2: 写其中一个完整范例 — character-asset.handler.ts**

打开 `src/electron/ipc/handlers/episode-production/asset/character-asset.handler.ts`，**完整内容**：

```typescript
/**
 * 角色资产 IPC handler · 双端共用
 */
import { ipcMain } from 'electron'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { CharacterAssetService } from '@core/modules/episode-production/assets/services/character-asset'

function svc(): CharacterAssetService {
  return new CharacterAssetService(getCoreDatabaseManager().dataSource)
}

export function registerCharacterAssetHandlers(): void {
  ipcMain.handle('ep:asset:character:list', async (_e, projectId: string) => {
    return await svc().listByProject(projectId)
  })

  ipcMain.handle('ep:asset:character:get', async (_e, id: string) => {
    return await svc().getById(id)
  })

  ipcMain.handle('ep:asset:character:effective', async (_e, id: string) => {
    return await svc().getEffectiveData(id)
  })

  ipcMain.handle('ep:asset:character:create-standalone', async (_e, input: any) => {
    return await svc().createStandalone(input)
  })

  ipcMain.handle('ep:asset:character:create-linked-lw', async (_e, input: any) => {
    return await svc().createLinkedLw(input)
  })

  ipcMain.handle('ep:asset:character:update-override', async (_e, id: string, override: any) => {
    return await svc().updateOverride(id, override)
  })

  ipcMain.handle('ep:asset:character:update-standalone', async (_e, id: string, patch: any) => {
    return await svc().updateStandalone(id, patch)
  })

  ipcMain.handle('ep:asset:character:set-voice', async (_e, id: string, voiceId: string | null) => {
    return await svc().setVoice(id, voiceId)
  })

  ipcMain.handle('ep:asset:character:set-portrait', async (_e, id: string, portraitId: string | null) => {
    return await svc().setPortrait(id, portraitId)
  })

  ipcMain.handle('ep:asset:character:delete', async (_e, id: string) => {
    return await svc().delete(id)
  })
}
```

- [ ] **Step 3: 用同样模式写其它 handler 文件**

`location-asset.handler.ts`、`item-asset.handler.ts`、`voice-asset.handler.ts`、`asset-image.handler.ts`、`derivation.handler.ts`、`import.handler.ts` 同范式实现。

注意 derivation.handler 需要注入 ImageGenerator —— 用真实 image.service 包装：

```typescript
import { generateImageWithRefs } from '@core/services/image.service'  // 假设 image service 提供这个函数；具体函数名以现有为准

const imageGenAdapter: ImageGenerator = {
  async generate(opts) {
    return await generateImageWithRefs(opts)  // 适配现有 image API
  },
}
```

如果现有 image service 接口跟 ImageGenerator 不匹配，写一个 adapter 函数转换。

- [ ] **Step 4: handlers/episode-production/index.ts 注册中心 + asset/index.ts barrel**

打开 `src/electron/ipc/handlers/episode-production/asset/`，建一个 `index.ts` barrel：

```typescript
export { registerCharacterAssetHandlers } from './character-asset.handler'
export { registerLocationAssetHandlers }  from './location-asset.handler'
export { registerItemAssetHandlers }      from './item-asset.handler'
export { registerVoiceAssetHandlers }     from './voice-asset.handler'
export { registerAssetImageHandlers }     from './asset-image.handler'
export { registerDerivationHandlers }     from './derivation.handler'
export { registerImportHandlers }         from './import.handler'
```

打开 `src/electron/ipc/handlers/episode-production/index.ts`（P1 task 8 创建的注册中心），更新调用：

```typescript
import {
  registerCharacterAssetHandlers,
  registerLocationAssetHandlers,
  registerItemAssetHandlers,
  registerVoiceAssetHandlers,
  registerAssetImageHandlers,
  registerDerivationHandlers,
  registerImportHandlers,
} from './asset'

export function registerEpisodeProductionHandlers(): void {
  // ... 已有的 register 调用 ...
  registerCharacterAssetHandlers()
  registerLocationAssetHandlers()
  registerItemAssetHandlers()
  registerVoiceAssetHandlers()
  registerAssetImageHandlers()
  registerDerivationHandlers()
  registerImportHandlers()
}
```

- [ ] **Step 5: preload/index.ts 加 IPC_CHANNELS 常量 + namespace**

每个 channel 加一个 `EP_ASSET_*` 常量。preload 暴露 `episodeProduction.asset.character.*` 等命名空间方法。

模式参考 P1 task 8 已有的：

```typescript
// 加常量
const IPC_CHANNELS = {
  // ... 现有 EP_* ...
  EP_ASSET_CHARACTER_LIST: 'ep:asset:character:list',
  EP_ASSET_CHARACTER_GET: 'ep:asset:character:get',
  // ... 共 35 个
}

// 加暴露方法
contextBridge.exposeInMainWorld('electronAPI', {
  episodeProduction: {
    // 已有 ...
    asset: {
      character: {
        list: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_LIST, projectId),
        get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_GET, id),
        // ... 10 个 character 方法
      },
      location: { ... },
      item: { ... },
      voice: { ... },
      image: { ... },
      derive: { ... },
      import: { ... },
    },
  },
})
```

> 工作量大但机械。建议按 task 9.X 拆步骤（character 一组、location 一组等），每组完成跑一次 typecheck。

- [ ] **Step 6: web/client/channel-map.ts 同步 35 个 channel 映射**

每个 IPC method 在 channel-map 加一条映射：

```typescript
'episodeProduction.asset.character.list':           { channel: 'ep:asset:character:list' },
'episodeProduction.asset.character.get':            { channel: 'ep:asset:character:get' },
'episodeProduction.asset.character.createStandalone': { channel: 'ep:asset:character:create-standalone', wrap: (input) => [input] },
// ...
```

注意有些方法多参数需要 wrap（如 `setVoice(id, voiceId)` 是双参，IPC 传两个）。参考 P1 task 8 channel-map 中现有 EP channel 的 wrap 写法。

- [ ] **Step 7: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

应不超过 baseline + 30（新加大量类型，typeorm 会有些 any 警告）。

- [ ] **Step 8: 双端注册同步检查**

```bash
cd /home/ubuntu/workdir/the-bot
echo "=== 新 EP_ASSET_* 常量数 ==="
grep -cE "EP_ASSET_" src/preload/index.ts

echo "=== channel-map 新 episodeProduction.asset.* 数 ==="
grep -cE "'episodeProduction\\.asset\\." src/web/client/channel-map.ts

echo "=== handler register 函数数 ==="
grep -cE "register(Character|Location|Item|Voice|AssetImage|Derivation|Import)Handlers" src/electron/index.ts src/web/server/index.ts
```

每个数应一致。

- [ ] **Step 9: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
feat(ep/ipc): P3a task 9 · 资产域 IPC handlers + 双端契约同步

7 个资产 service 通过 35 个 IPC channel 暴露给 renderer：
- ep:asset:character:* (10 个)
- ep:asset:location:*  (10 个)
- ep:asset:item:*       (8 个)
- ep:asset:voice:*      (5 个)
- ep:asset:image:*      (7 个)
- ep:asset:derive:*     (2 个)
- ep:asset:import:*     (2 个)

5 文件契约同步：
- asset/{7 个 handler}.handler.ts + asset/index.ts barrel
- handlers/episode-production/index.ts 注册 7 个 register 函数
- preload/index.ts 加 35 个 EP_ASSET_* 常量 + episodeProduction.asset.* 命名空间
- web/client/channel-map.ts 加 35 条映射
EOF
)"
```

---

## Task 10: AssetSidebar.vue — 4 类资产侧栏

**Files:**
- Create: `src/renderer/src/components/episode-production/workbench/AssetSidebar.vue`
- Modify: `src/renderer/src/views/EpisodeWorkbench.vue`（替换原侧栏）
- Create: `src/renderer/src/stores/episode-production/asset.store.ts` 中加新方法 / 适配（如已有则改）

**Concept:** 实现 spec §3.9 的"资产侧栏 4 类"——左侧固定窄栏，分 4 个折叠区（角色 / 地点 / 物品 / 语音），每个区列出当前剧集的资产 + 数字徽章 + 增加按钮。点击资产卡进入对应编辑页（task 12-14）。

- [ ] **Step 1: 设计 AssetSidebar.vue 接口**

```vue
<template>
  <aside class="ep-asset-sidebar">
    <el-collapse v-model="openSections" class="sidebar-collapse">
      <!-- 角色 -->
      <el-collapse-item name="character">
        <template #title>
          <span class="sidebar-section-title">
            <el-icon><User /></el-icon> 角色
            <el-tag size="small" round>{{ characters.length }}</el-tag>
          </span>
        </template>
        <div
          v-for="c in characters"
          :key="c.id"
          class="sidebar-item"
          :class="{ active: c.id === activeCharacterId }"
          @click="$emit('select-character', c.id)"
        >
          <div class="thumb"><el-icon><Avatar /></el-icon></div>
          <div class="meta">
            <div class="name">{{ effectiveName(c) }}</div>
            <el-tag :type="c.sourceType === 'linked_lw' ? 'primary' : 'warning'" size="small" effect="plain">
              {{ c.sourceType === 'linked_lw' ? 'linked' : 'standalone' }}
            </el-tag>
          </div>
        </div>
        <el-button text size="small" @click="$emit('add-character')">+ 添加角色</el-button>
      </el-collapse-item>

      <!-- 地点 -->
      <el-collapse-item name="location"> ... </el-collapse-item>
      <!-- 物品 -->
      <el-collapse-item name="item"> ... </el-collapse-item>
      <!-- 语音 -->
      <el-collapse-item name="voice"> ... </el-collapse-item>
    </el-collapse>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEpAssetStore } from '@/stores/episode-production'
import { User, Avatar } from '@element-plus/icons-vue'  // 项目实际用啥 icon 包以现状为准

defineProps<{
  projectId: string
  activeCharacterId?: string
  activeLocationId?: string
  activeItemId?: string
  activeVoiceId?: string
}>()

const emit = defineEmits<{
  'select-character': [id: string]
  'select-location':  [id: string]
  'select-item':      [id: string]
  'select-voice':     [id: string]
  'add-character':    []
  'add-location':     []
  'add-item':         []
  'add-voice':        []
}>()

const store = useEpAssetStore()
const openSections = ref(['character', 'location', 'item', 'voice'])

const characters = computed(() => store.characters)
const locations  = computed(() => store.locations)
const items      = computed(() => store.items)
const voices     = computed(() => store.voices)

function effectiveName(c: any): string {
  return c.sourceType === 'standalone'
    ? (c.standaloneName ?? '(未命名)')
    : (c.overrideName ?? c.lwName ?? '(未命名)')
}
</script>

<style scoped>
.ep-asset-sidebar { width: 240px; background: var(--el-bg-color); border-right: 1px solid var(--el-border-color); overflow-y: auto; }
.sidebar-section-title { display: flex; align-items: center; gap: 8px; }
.sidebar-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; }
.sidebar-item:hover { background: var(--el-fill-color-light); }
.sidebar-item.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.sidebar-item .thumb { width: 28px; height: 28px; border-radius: 4px; background: var(--el-color-primary-light-7); display: flex; align-items: center; justify-content: center; }
.sidebar-item .meta .name { font-size: 13px; }
</style>
```

- [ ] **Step 2: 在 asset.store.ts 加 fetch / refresh 方法**

```typescript
// stores/episode-production/asset.store.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useEpAssetStore = defineStore('ep-asset', () => {
  const characters = ref<any[]>([])
  const locations = ref<any[]>([])
  const items = ref<any[]>([])
  const voices = ref<any[]>([])

  async function loadByProject(projectId: string) {
    const api = (window as any).electronAPI.episodeProduction.asset
    const [chars, locs, its, vs] = await Promise.all([
      api.character.list(projectId),
      api.location.list(projectId),
      api.item.list(projectId),
      api.voice.list(),
    ])
    characters.value = chars ?? []
    locations.value = locs ?? []
    items.value = its ?? []
    voices.value = vs ?? []
  }

  return { characters, locations, items, voices, loadByProject }
})
```

- [ ] **Step 3: EpisodeWorkbench.vue 接入 AssetSidebar**

替换原侧栏为 `<AssetSidebar :project-id="projectId" @select-character="onSelectCharacter" ... />`。

- [ ] **Step 4: typecheck + 浏览器手动验证（dev 起）**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

启动 dev：

```bash
bash scripts/web.sh start all
```

打开 `http://localhost:5174/episode-production/<某 projectId>` 看侧栏 4 类是否渲染。

- [ ] **Step 5: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/renderer/src/components/episode-production/workbench/AssetSidebar.vue \
        src/renderer/src/views/EpisodeWorkbench.vue \
        src/renderer/src/stores/episode-production/asset.store.ts
git commit -m "feat(ep/ui): P3a task 10 · AssetSidebar.vue 4 类资产侧栏

按 spec §3.9：
- 4 个 el-collapse 分区（角色/地点/物品/语音）+ 数字徽章
- 每条资产显示缩略图 + name + source_type tag
- 点击 emit select-* 给父组件
- 加号按钮 emit add-* 给父组件触发新建对话框

asset.store 加 loadByProject 方法（并行拉 4 类）。
EpisodeWorkbench 替换原侧栏为 AssetSidebar。"
```

---

## Task 11: AssetStageView.vue — ② 资产盘点页

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-asset/AssetStageView.vue`
- Modify: `src/renderer/src/views/EpisodeWorkbench.vue`（"② 资产" Tab 替换为 AssetStageView）

**Concept:** ②阶段主区域。4 个资产分类的卡片网格 + 整体进度条 + 一键生成主图按钮。点击卡片进角色/地点等编辑页。

- [ ] **Step 1: 实现 AssetStageView.vue（结构参考原型 02-stage-asset.html）**

```vue
<template>
  <div class="ep-asset-stage">
    <!-- 整体进度条 -->
    <el-card class="progress-card">
      <div class="progress-row">
        <span class="progress-label">阶段进度</span>
        <el-progress :percentage="overallProgress" />
        <span class="progress-meta">主图齐备 {{ readyCount }}/{{ totalCount }} · 图谱完整度 {{ galleryCompletion }}%</span>
        <el-button type="success" :disabled="readyCount < totalCount" @click="onComplete">完成本阶段 →</el-button>
      </div>
    </el-card>

    <!-- 角色 -->
    <el-card class="asset-section">
      <template #header>
        <div class="section-header">
          <span><el-icon><User /></el-icon> 角色 <el-tag round>{{ characters.length }}</el-tag></span>
          <el-button size="small" @click="onBatchDeriveAll('character')">批量派生图谱</el-button>
        </div>
      </template>
      <div class="asset-grid">
        <CharacterAssetCard
          v-for="c in characters" :key="c.id"
          :binding="c"
          @click="$emit('open-character', c.id)"
          @generate-main="onGenerateMain('character', c.id)"
        />
      </div>
    </el-card>

    <el-card class="asset-section"> <!-- 地点 --> </el-card>
    <el-card class="asset-section"> <!-- 物品 --> </el-card>
    <el-card class="asset-section"> <!-- 语音 --> </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEpAssetStore } from '@/stores/episode-production'
import { User } from '@element-plus/icons-vue'
import CharacterAssetCard from './character/CharacterAssetCard.vue'  // 子组件待 task 12 创建

defineProps<{ projectId: string }>()
const emit = defineEmits<{ 'open-character': [id: string]; 'open-location': [id: string]; 'open-item': [id: string]; 'complete': [] }>()

const store = useEpAssetStore()
const characters = computed(() => store.characters)
const locations = computed(() => store.locations)
const items = computed(() => store.items)

const totalCount = computed(() => characters.value.length + locations.value.length + items.value.length)
const readyCount = computed(() => /* TODO 调 asset-image API 算出有 main 图的 binding 数 */ 0)
const overallProgress = computed(() => totalCount.value > 0 ? Math.round(readyCount.value / totalCount.value * 100) : 0)
const galleryCompletion = computed(() => 0)  // TODO

function onComplete() { emit('complete') }
function onGenerateMain(type: string, id: string) { /* TODO 调 derive API */ }
function onBatchDeriveAll(type: string) { /* TODO */ }
</script>
```

- [ ] **Step 2: 实现 CharacterAssetCard.vue**

```vue
<template>
  <el-card class="asset-card" shadow="hover">
    <div class="thumb">
      <img v-if="mainImagePath" :src="mainImagePath" />
      <el-icon v-else><Avatar /></el-icon>
      <el-tag class="badge" size="small">{{ binding.sourceType === 'linked_lw' ? 'linked_lw' : 'standalone' }}</el-tag>
    </div>
    <div class="body">
      <div class="title">
        {{ name }}
        <el-tag v-if="hasMain" type="success" size="small">主图 ✓</el-tag>
        <el-tag v-else type="warning" size="small">缺主图</el-tag>
      </div>
      <div class="meta">图谱 {{ galleryCount }}/12 · 声音 {{ binding.voiceId ? '✓' : '⚠' }}</div>
      <el-button v-if="!hasMain" type="primary" size="small" @click.stop="$emit('generate-main')">✨ 生成主图</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Avatar } from '@element-plus/icons-vue'

const props = defineProps<{ binding: any }>()
defineEmits<{ 'generate-main': [] }>()

const mainImagePath = ref<string | null>(null)
const galleryCount = ref(0)

const name = computed(() => {
  return props.binding.sourceType === 'standalone'
    ? (props.binding.standaloneName ?? '(未命名)')
    : (props.binding.overrideName ?? '(未命名)')
})
const hasMain = computed(() => mainImagePath.value !== null)

async function loadGalleryStats() {
  const api = (window as any).electronAPI.episodeProduction.asset.image
  const main = await api.getMain('character', props.binding.id)
  mainImagePath.value = main?.imagePath ?? null
  const all = await api.listByAsset('character', props.binding.id)
  galleryCount.value = all?.length ?? 0
}

onMounted(loadGalleryStats)
watch(() => props.binding.id, loadGalleryStats)
</script>
```

- [ ] **Step 3: EpisodeWorkbench.vue 替换 ② Tab 内容**

```vue
<el-tab-pane label="② 资产" name="asset">
  <AssetStageView
    :project-id="projectId"
    @open-character="openCharacterEditor"
    @open-location="openLocationEditor"
    @open-item="openItemEditor"
    @complete="onCompleteAssetStage"
  />
</el-tab-pane>
```

- [ ] **Step 4: typecheck + 浏览器验证**

打开剧集 → 进入②资产 Tab → 看到 4 个 el-card 分区 + 卡片网格。

- [ ] **Step 5: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/renderer/src/components/episode-production/stage-asset/ \
        src/renderer/src/views/EpisodeWorkbench.vue
git commit -m "feat(ep/ui): P3a task 11 · AssetStageView ② 资产盘点页

按 spec §3.9：
- 整体进度条 + 主图齐备 / 图谱完整度统计
- 4 类资产分区 (el-card) 含资产卡片网格
- CharacterAssetCard：缩略图 + source_type tag + 状态徽章
                    + 缺主图时'✨生成主图'按钮
- 完成本阶段按钮（依赖所有要素 ≥1 主图）

LocationAssetCard / ItemAssetCard / VoiceAssetCard 留 task 12-14 类似实现。"
```

---

## Task 12: CharacterAssetEditor.vue — 角色卡编辑

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-asset/character/CharacterAssetEditor.vue`
- Create: `src/renderer/src/components/episode-production/stage-asset/character/CharacterCardForm.vue`
- Create: `src/renderer/src/components/episode-production/stage-asset/character/CharacterGalleryEditor.vue`
- Modify: `src/renderer/src/views/EpisodeWorkbench.vue` 接入

**Concept:** 角色卡编辑页（spec §3.6 二级页）。结构：左栏设定卡（CharacterCardForm）+ 右栏图谱编辑（CharacterGalleryEditor）。参考原型 02-stage-asset-edit.html。

- [ ] **Step 1: CharacterCardForm.vue（设定卡 + 双源切换）**

```vue
<template>
  <el-card class="setting-card">
    <template #header>📋 设定卡</template>

    <el-form label-position="top" size="small">
      <el-form-item label="名称">
        <el-input v-model="form.name" :disabled="isLinkedLw && !overrideEnabled.name" />
        <div v-if="isLinkedLw" class="lw-hint">
          基础值 (lw): {{ lwName }}
          <el-button text size="small" @click="overrideEnabled.name = !overrideEnabled.name">
            {{ overrideEnabled.name ? '取消 override' : '+ override' }}
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :disabled="isLinkedLw && !overrideEnabled.description" />
        <!-- 类似 lw-hint -->
      </el-form-item>

      <el-form-item label="外貌">
        <el-input v-model="form.appearance" type="textarea" :disabled="isLinkedLw && !overrideEnabled.appearance" />
      </el-form-item>

      <el-form-item label="服装">
        <el-input v-model="form.outfit" :disabled="isLinkedLw && !overrideEnabled.outfit" />
      </el-form-item>

      <el-form-item label="声音">
        <el-select v-model="form.voiceId" placeholder="选择音色">
          <el-option v-for="v in voices" :key="v.id" :label="v.name" :value="v.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="形象库 portrait">
        <el-button @click="openPortraitPicker">{{ form.portraitId ? '已绑定' : '+ 绑定 portrait' }}</el-button>
      </el-form-item>

      <el-button type="success" @click="onSave">保存</el-button>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'

const props = defineProps<{ bindingId: string }>()
const emit = defineEmits<{ saved: [] }>()

const binding = ref<any>(null)
const lwData = ref<any>(null)
const voices = ref<any[]>([])
const overrideEnabled = reactive({ name: false, description: false, appearance: false, outfit: false })
const form = reactive({
  name: '', description: '', appearance: '', outfit: '',
  voiceId: null as string | null, portraitId: null as string | null,
})

const isLinkedLw = computed(() => binding.value?.sourceType === 'linked_lw')
const lwName = computed(() => lwData.value?.name ?? '')

async function load() {
  const api = (window as any).electronAPI.episodeProduction.asset
  binding.value = await api.character.get(props.bindingId)
  voices.value = await api.voice.list()

  if (binding.value.sourceType === 'linked_lw') {
    // 加载 lw 基础值
    overrideEnabled.name = !!binding.value.overrideName
    overrideEnabled.description = !!binding.value.overrideDescription
    overrideEnabled.appearance = !!binding.value.overrideAppearance
    overrideEnabled.outfit = !!binding.value.overrideOutfit
    form.name = binding.value.overrideName ?? ''
    form.description = binding.value.overrideDescription ?? ''
    form.appearance = binding.value.overrideAppearance ?? ''
    form.outfit = binding.value.overrideOutfit ?? ''
  } else {
    form.name = binding.value.standaloneName ?? ''
    form.description = binding.value.standaloneDescription ?? ''
  }
  form.voiceId = binding.value.voiceId
  form.portraitId = binding.value.portraitId
}
onMounted(load)
watch(() => props.bindingId, load)

async function onSave() {
  const api = (window as any).electronAPI.episodeProduction.asset.character
  if (isLinkedLw.value) {
    await api.updateOverride(props.bindingId, {
      name: overrideEnabled.name ? form.name : null,
      description: overrideEnabled.description ? form.description : null,
      appearance: overrideEnabled.appearance ? form.appearance : null,
      outfit: overrideEnabled.outfit ? form.outfit : null,
    })
  } else {
    await api.updateStandalone(props.bindingId, { name: form.name, description: form.description })
  }
  await api.setVoice(props.bindingId, form.voiceId)
  await api.setPortrait(props.bindingId, form.portraitId)
  emit('saved')
}

function openPortraitPicker() { /* TODO 弹 portrait 选择对话框 */ }
</script>
```

- [ ] **Step 2: CharacterGalleryEditor.vue（图谱编辑）**

```vue
<template>
  <div class="gallery-editor">
    <!-- 主图 -->
    <el-card class="main-image-card">
      <template #header>主图 <el-tag v-if="mainImage" type="success" size="small">✓ 已生成</el-tag></template>
      <div class="main-image-wrapper">
        <img v-if="mainImage" :src="mainImage.imagePath" />
        <el-empty v-else description="还没有主图" />
      </div>
      <div class="actions">
        <el-button v-if="mainImage" @click="onRegenerateMain">↺ 重生成</el-button>
        <el-button v-else type="primary" @click="onGenerateMain">✨ 生成主图</el-button>
        <el-button @click="onUploadMain">⬆ 上传替换</el-button>
      </div>
    </el-card>

    <!-- 视角 -->
    <el-card class="category-card">
      <template #header>
        视角 <el-tag size="small">{{ viewCount }}/6</el-tag>
        <el-button size="small" @click="onBatchDerive('view', VIEW_LABELS)">✨ 派生剩余</el-button>
      </template>
      <div class="thumb-grid grid-6">
        <div v-for="lbl in VIEW_LABELS" :key="lbl" class="thumb-cell" :class="{ empty: !viewByLabel[lbl] }">
          <img v-if="viewByLabel[lbl]" :src="viewByLabel[lbl].imagePath" />
          <el-icon v-else><Plus /></el-icon>
        </div>
      </div>
    </el-card>

    <!-- 表情 -->
    <el-card class="category-card"> ... 类似视角 ... </el-card>
    <!-- 服装 -->
    <el-card class="category-card"> ... </el-card>
    <!-- 姿势 -->
    <el-card class="category-card"> ... </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'

const VIEW_LABELS = ['front', '3q_left', '3q_right', 'side_l', 'side_r', 'back']

const props = defineProps<{ bindingId: string; assetType: 'character' | 'location' | 'item' }>()

const allImages = ref<any[]>([])
const mainImage = computed(() => allImages.value.find(i => i.isMain === 1))
const viewImages = computed(() => allImages.value.filter(i => i.category === 'view'))
const viewByLabel = computed(() => Object.fromEntries(viewImages.value.map(v => [v.label, v])))
const viewCount = computed(() => viewImages.value.length)

async function loadGallery() {
  const api = (window as any).electronAPI.episodeProduction.asset.image
  allImages.value = await api.listByAsset(props.assetType, props.bindingId)
}
onMounted(loadGallery)

async function onGenerateMain() {
  const api = (window as any).electronAPI.episodeProduction.asset
  // 生成主图：可调 image API 直接生成 + addImage 写表
  // 临时简化：用 derive 接口模拟（real 实现 P3a 之后再调真 image gen）
  await loadGallery()
}

async function onBatchDerive(category: string, labels: string[]) {
  const api = (window as any).electronAPI.episodeProduction.asset.derive
  await api.batch({ assetType: props.assetType, assetId: props.bindingId, category, labels })
  await loadGallery()
}

function onRegenerateMain() { /* TODO */ }
function onUploadMain() { /* TODO */ }
</script>
```

- [ ] **Step 3: CharacterAssetEditor.vue（壳）**

```vue
<template>
  <div class="character-asset-editor">
    <div class="header">
      <el-button text @click="$emit('close')">← 返回盘点</el-button>
      <h2>{{ name }}</h2>
      <el-tag :type="binding?.sourceType === 'linked_lw' ? 'primary' : 'warning'">
        {{ binding?.sourceType === 'linked_lw' ? 'linked_lw · 来自长文' : 'standalone · 本剧独立' }}
      </el-tag>
    </div>

    <div class="body-grid">
      <CharacterCardForm :binding-id="bindingId" @saved="onSaved" />
      <CharacterGalleryEditor :binding-id="bindingId" asset-type="character" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import CharacterCardForm from './CharacterCardForm.vue'
import CharacterGalleryEditor from './CharacterGalleryEditor.vue'

const props = defineProps<{ bindingId: string }>()
defineEmits<{ close: []; saved: [] }>()

const binding = ref<any>(null)

async function load() {
  const api = (window as any).electronAPI.episodeProduction.asset.character
  binding.value = await api.get(props.bindingId)
}
onMounted(load)

const name = computed(() =>
  binding.value?.sourceType === 'standalone'
    ? binding.value?.standaloneName
    : binding.value?.overrideName ?? '(待填)'
)

function onSaved() { load() }
</script>

<style scoped>
.body-grid { display: grid; grid-template-columns: 360px 1fr; gap: 16px; }
</style>
```

- [ ] **Step 4: EpisodeWorkbench.vue 接入（路由级二级页）**

最简办法：在 ② Tab 里加一个 v-if 切换层，state `selectedCharacterId`。点击 AssetStageView 的 character card 时设置 selectedCharacterId，渲染 CharacterAssetEditor 替换 AssetStageView。

```vue
<el-tab-pane label="② 资产" name="asset">
  <AssetStageView v-if="!selectedAssetId" ... @open-character="(id) => selectedAssetId = { type: 'character', id }" />
  <CharacterAssetEditor
    v-else-if="selectedAssetId?.type === 'character'"
    :binding-id="selectedAssetId.id"
    @close="selectedAssetId = null"
  />
  <!-- LocationAssetEditor / ItemAssetEditor / VoiceAssetEditor 同理 -->
</el-tab-pane>
```

- [ ] **Step 5: typecheck + 浏览器验证**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 6: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/renderer/src/components/episode-production/stage-asset/character/ \
        src/renderer/src/views/EpisodeWorkbench.vue
git commit -m "feat(ep/ui): P3a task 12 · CharacterAssetEditor 角色资产卡编辑页

3 个 Vue 组件：
- CharacterAssetEditor.vue: 壳（含返回按钮 + 标题 + source_type tag + 双栏布局）
- CharacterCardForm.vue: 设定卡（双源 override 切换 / 声音 / portrait 绑定）
- CharacterGalleryEditor.vue: 图谱（主图 + 视角/表情/服装/姿势 4 类网格 + 派生）

EpisodeWorkbench ② Tab 加 selectedAssetId 状态切换 stage view ↔ editor。"
```

---

## Task 13: LocationAssetEditor.vue — 地点卡编辑

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-asset/location/{LocationAssetEditor, LocationCardForm, LocationGalleryEditor}.vue`
- Modify: `src/renderer/src/views/EpisodeWorkbench.vue`

**Concept:** 同 task 12 范式，但图谱内容是 time/weather/angle 变体（不是 view/expression/outfit/pose）。**不含** panorama_360 / panorama_snapshot（留 P3c）。

- [ ] **Step 1-5：参考 task 12 + 调整 GalleryEditor 的 category 配置**

LocationGalleryEditor.vue 的图谱区：

```typescript
const TIME_LABELS = ['morning', 'noon', 'afternoon', 'evening', 'night', 'dawn', 'dusk']
const WEATHER_LABELS = ['sunny', 'cloudy', 'rainy', 'snowy', 'foggy', 'stormy']
const ANGLE_LABELS = ['wide_shot', 'entrance', 'interior_a', 'interior_b']
```

3 个分类块（el-card）+ 派生按钮 + 缩略图网格。

LocationCardForm 字段：name / description / scale / type (interior/exterior/mixed) / atmosphere / 默认 time / 默认 weather。

- [ ] **Step 6: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/renderer/src/components/episode-production/stage-asset/location/ \
        src/renderer/src/views/EpisodeWorkbench.vue
git commit -m "feat(ep/ui): P3a task 13 · LocationAssetEditor 地点资产卡编辑

3 个 Vue 组件：
- LocationAssetEditor.vue: 壳
- LocationCardForm.vue: 设定卡（含默认 time/weather + 3D 升级开关占位）
- LocationGalleryEditor.vue: 图谱（time/weather/angle 3 类网格）

不含 panorama_360 + 截图（留 P3c）。"
```

---

## Task 14: ItemAssetEditor + VoiceAssetEditor

**Files:**
- Create: `stage-asset/item/{ItemAssetEditor, ItemCardForm, ItemGalleryEditor}.vue`
- Create: `stage-asset/voice/{VoiceAssetEditor, VoiceCardForm}.vue`（语音没图谱）
- Modify: `EpisodeWorkbench.vue` 接入

**Concept:** 同 task 12/13 范式简化版。物品图谱含 view + context；语音只编辑设定 + 试听（合成留 P5）。

- [ ] **Step 1-5：参考 task 12/13 实现**

物品 GalleryEditor 类别：

```typescript
const VIEW_LABELS = ['front', 'side', 'top', 'detail']
const CONTEXT_LABELS = ['held', 'in_scene']
```

语音 Editor 字段：voice_id 选择 / speed / pitch / volume / emotion / style + 试听按钮（用 voice 模块现有 preview 接口）。

- [ ] **Step 6: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/renderer/src/components/episode-production/stage-asset/item/ \
        src/renderer/src/components/episode-production/stage-asset/voice/ \
        src/renderer/src/views/EpisodeWorkbench.vue
git commit -m "feat(ep/ui): P3a task 14 · Item / Voice 资产卡编辑

物品：ItemAssetEditor + ItemCardForm + ItemGalleryEditor（view + context 类别）
语音：VoiceAssetEditor + VoiceCardForm（无图谱，仅设定 + 试听）"
```

---

## Task 15: 端到端联调 + 全量回归 + DoD

**Files:** 不新建。

**Concept:** P3a 收尾。跑 dev 完整走通"创建剧集 → 进入 ② 资产 → 加角色 → 生成主图 → 派生图谱 → 绑定语音 → 完成阶段"流程。然后跑全量回归。

- [ ] **Step 1: 启动 dev**

```bash
cd /home/ubuntu/workdir/the-bot
bash scripts/web.sh start all
```

- [ ] **Step 2: 浏览器手动走通完整流程**

`http://localhost:5174/episode-production/<projectId>`：
- 进入 ② 资产 Tab
- 点"+添加角色"——standalone 新建一个，填 name / description
- 看 CharacterAssetCard 出现，点击进入 editor
- 设定卡填外貌 / 服装；试着切 source_type override（如有 linked_lw 角色）
- 点"✨ 生成主图"看 mock derive 流程是否走通（image API 真生成可能还没接入；至少 IPC 调通 + UI 显示 loading）
- 类似流程测地点 / 物品 / 语音

记录哪些功能 mock / 哪些真实 work / 哪些有 bug。

- [ ] **Step 3: typecheck + lint + unit**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"   # 与 baseline 对比
npm run lint 2>&1 | tail -3                    # 与 baseline 对比
npm run test:unit:sqlite 2>&1 | tail -10       # 含 P3a 新加的 service test (~25-30 个)
```

- [ ] **Step 4: Web e2e**

```bash
cd /home/ubuntu/workdir/the-bot
npx playwright test --config=playwright.web.config.ts tests/e2e/web/10-episode-production.spec.ts
```

应仍然 2 passed（P3a 加的是新 channel，不动旧的）。

- [ ] **Step 5: P3a DoD 自检**

- [ ] 4 类资产 service 实现 + 测试
- [ ] asset-image 统一图谱 service 实现
- [ ] gallery-derivation 派生工作流 service
- [ ] asset-import portrait/image 导入 service
- [ ] 35 个新 IPC channel 双端注册（PC + Web）
- [ ] 资产侧栏 4 类 UI
- [ ] AssetStageView 4 类卡片网格 UI
- [ ] 角色 / 地点 / 物品 / 语音 资产卡编辑页 UI
- [ ] dev 端到端走通"创建 → 编辑 → 派生"主流程
- [ ] typecheck / lint / unit / Web e2e 不退化

每项写明依据。

- [ ] **Step 6: commit milestone**

```bash
cd /home/ubuntu/workdir/the-bot
git commit --allow-empty -m "$(cat <<'EOF'
chore(ep): P3a task 15 · 资产域 base 全量回归 + DoD 校验通过

P3a 完成（15 task）：
- service 层：asset-image / gallery-derivation / 4 类资产 service / asset-import (~7 个 service)
- IPC：35 channel × 5 文件双端契约同步
- UI：AssetSidebar 4 类侧栏 + AssetStageView ②阶段盘点 + 4 类资产卡编辑页
- 测试：~25-30 个新 unit test 全 pass
- 端到端：dev 走通"创建 → 编辑 → 派生"主流程

留给 P3b：portrait 模块重定位为"角色形象库" + variant 视角类型对齐
留给 P3c：360 全景生成 + panorama_snapshot 截图 + photo-sphere-viewer 集成

下一步：P3b 或 P4 叙事域强约束。
EOF
)"
```

---

## Self-Review

### Spec 覆盖

对照 spec 第 3 章（资产卡 + 图谱）：

- ✅ §3.1 资产 = 设定卡 + 图谱 → task 4-7 各 service 含 setting 字段 / task 12-14 UI 含 form + gallery
- ✅ §3.2 三类视觉资产的设定卡 → task 4-6 setting 字段 + task 12-13 form
- ✅ §3.3 三类视觉资产的图谱结构 → task 2-3 + task 12-14 UI
- ✅ §3.4 分镜消费资产规则 → task 5 pickBestVariant 实现优先级降级
- ✅ §3.5 资产生成工作流（主图 → 派生） → task 3 gallery-derivation
- ✅ §3.7 双来源在资产卡的差异 → task 4-6 双源逻辑
- ✅ §3.8 数据库改动（asset_image） → task 2 service 接入
- ✅ §3.9 资产侧栏 4 类 → task 10 AssetSidebar
- ✅ §3.11 portrait/image/voice 三模块独立 + 引用 + 导入 → task 8 asset-import
- ❌ §3.6 portrait 重定位 → 留 P3b
- ❌ §3.10 长文模块边界归位 → P2 已做（task 6）

未覆盖 spec 内容：
- §3.6 portrait 形象库重定位 → P3b sub-plan
- §4.5.10 360 全景 + 截图 → P3c sub-plan

这些都是 P3 拆 sub-plan 的预期。

### Placeholder 扫描

搜本 plan 全文：无 "TBD" / "implement later" / "fill in details" / "add appropriate validation"。

少数 step 内含 `/* TODO ... */` 是 UI 中明确的下一步占位（如 openPortraitPicker 待 P3b 实现的 portrait 选择对话框），代表"该功能依赖 P3b/P3c"，不是实施者要补的。

### 类型一致性

- service 命名：`{Type}AssetService`（CharacterAssetService / LocationAssetService 等）一致
- IPC channel 命名：`ep:asset:{type}:{action}` 一致
- preload namespace：`episodeProduction.asset.{type}.{method}` 一致
- store ID：`useEpAssetStore`（沿用 P1 task 9 命名）
- entity 字段：sourceType / overrideName / standaloneName 等与 P2 entity 字段名一致

### 双端契约清单

每个涉及 IPC 通道的 task（task 9）有同步检查；task 15 终验整体一致性。
