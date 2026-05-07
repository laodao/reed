# 剧集制作 · 资产缩略图 / AI 设定反推 / 地点无人 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 ② 资产盘点 stage 的三件事：缩略图被裁切；"一键生成主图"时 AI 先反推设定卡再批量生图；地点全域强制无人。

**Architecture:** location 无人约束以纯函数形式存在 `location-constraints.ts`，由 service 层（MainImageGeneratorService / GalleryDerivationService / PanoramaGeneratorService）在检测到 `assetType === 'location'` 时**自动注入**，renderer 业务 prompt 不再分散管。AI 设定反推作为新的 `AssetSettingEnrichmentService`（core 层），通过 `callAI`（沿用 narrative/ai/_helpers）按 kind 分 3 次调用，仅写 binding 的空字段；renderer 在 `AssetStageViewV2.onGenerateAllMissing` 把"先 enrich → 再 generateMainFor 批量"串成两阶段流水线。

**Tech Stack:** TypeScript / Vitest / TypeORM (better-sqlite3 in-memory for unit tests) / Vue 3 / Element Plus / Electron IPC + Web channel-map 双端

**Spec：** `docs/superpowers/specs/2026-05-07-ep-asset-thumbnail-and-prompt-enrichment-design.md`

---

## 任务执行顺序

1. T1 缩略图样式修复（独立、最快见效）
2. T2 location 无人约束纯函数 + 单测
3. T3 MainImageGeneratorService 自动注入无人约束
4. T4 GalleryDerivationService 自动注入无人约束
5. T5 PanoramaGeneratorService 自动注入无人约束
6. T6 setting-enrichment-prompt 纯函数 + 单测
7. T7 AssetSettingEnrichmentService 服务 + 单测
8. T8 IPC channel 常量 + Electron handler + preload + web channel-map + register-channels
9. T9 renderer api wrapper
10. T10 AssetStageViewV2 流程改造
11. T11 全量回归 + 手测 + 文档同步 + 最终 commit

---

## Task 1: 缩略图样式修复（V2 + V1）

**Files:**
- Modify: `src/renderer/src/components/episode-production/stage-asset-v2/asset-card-v2.scss:44-51`
- Modify: `src/renderer/src/components/episode-production/stage-asset/CharacterAssetCard.vue:130-134`
- Modify: `src/renderer/src/components/episode-production/stage-asset/LocationAssetCard.vue:128-132`
- Modify: `src/renderer/src/components/episode-production/stage-asset/ItemAssetCard.vue:128-132`

- [ ] **Step 1.1: 修 V2 SCSS**

把 `.thumb-image` 的 `object-fit: cover` 改为 `contain`。

```scss
.thumb-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
```

- [ ] **Step 1.2: 修 V1 CharacterAssetCard.vue**

定位到 `.asset-card .thumb img` 块（约 130-134 行），把 `object-fit: cover` 改为 `contain`。

```css
.asset-card .thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

- [ ] **Step 1.3: 同样修 V1 LocationAssetCard.vue 与 ItemAssetCard.vue**

两个文件里相同的 `.asset-card .thumb img` 块，把 `cover` 改 `contain`，与 1.2 一致。

- [ ] **Step 1.4: 启动 dev 端肉眼验证**

```bash
npm run dev
```

进入 ② 资产盘点 stage，观察任意资产卡的缩略图：图整体可见，留白用渐变背景填底。

- [ ] **Step 1.5: 提交**

```bash
git add src/renderer/src/components/episode-production/stage-asset-v2/asset-card-v2.scss src/renderer/src/components/episode-production/stage-asset/CharacterAssetCard.vue src/renderer/src/components/episode-production/stage-asset/LocationAssetCard.vue src/renderer/src/components/episode-production/stage-asset/ItemAssetCard.vue
git commit -m "fix(ep): ② 资产卡缩略图改用 object-fit: contain，避免角色头/脚被裁

V2 与 V1 系列卡片统一改成 contain，留白用现有渐变背景填底，character/location/item 色调保留。"
```

---

## Task 2: location 无人约束纯函数 + 单测

**Files:**
- Create: `tests/unit/episode-production/assets/location-constraints.spec.ts`
- Modify: `src/core/modules/episode-production/assets/prompts/location-constraints.ts`

- [ ] **Step 2.1: 写失败测试**

新文件 `tests/unit/episode-production/assets/location-constraints.spec.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
  LOCATION_NO_HUMAN_SUFFIX,
  LOCATION_NO_HUMAN_NEGATIVE,
} from '@core/modules/episode-production/assets/prompts/location-constraints'

describe('location-constraints · 无人约束', () => {
  it('appendLocationNoHumanConstraint: 空 prompt 返回完整后缀', () => {
    expect(appendLocationNoHumanConstraint('')).toBe(LOCATION_NO_HUMAN_SUFFIX)
  })

  it('appendLocationNoHumanConstraint: 已含约束则幂等不重复', () => {
    const once = appendLocationNoHumanConstraint('古风茶馆')
    const twice = appendLocationNoHumanConstraint(once)
    expect(twice).toBe(once)
  })

  it('appendLocationNoHumanConstraint: 普通 prompt 用逗号拼接', () => {
    const out = appendLocationNoHumanConstraint('古风茶馆')
    expect(out.startsWith('古风茶馆，')).toBe(true)
    expect(out.endsWith(LOCATION_NO_HUMAN_SUFFIX)).toBe(true)
  })

  it('mergeLocationNoHumanNegative: 用户 negative 为空时返回无人 negative', () => {
    expect(mergeLocationNoHumanNegative()).toBe(LOCATION_NO_HUMAN_NEGATIVE)
    expect(mergeLocationNoHumanNegative('')).toBe(LOCATION_NO_HUMAN_NEGATIVE)
    expect(mergeLocationNoHumanNegative(null)).toBe(LOCATION_NO_HUMAN_NEGATIVE)
  })

  it('mergeLocationNoHumanNegative: 用户 negative 与无人 negative 拼接', () => {
    const out = mergeLocationNoHumanNegative('low quality')
    expect(out.startsWith('low quality, ')).toBe(true)
    expect(out.endsWith(LOCATION_NO_HUMAN_NEGATIVE)).toBe(true)
  })

  it('LOCATION_NO_HUMAN_NEGATIVE 关键人物词齐备', () => {
    for (const w of ['person', 'people', 'human', 'character', 'figure', 'crowd']) {
      expect(LOCATION_NO_HUMAN_NEGATIVE.includes(w)).toBe(true)
    }
  })
})
```

- [ ] **Step 2.2: 跑测试确认失败**

```bash
npm test -- tests/unit/episode-production/assets/location-constraints.spec.ts
```

预期：FAIL，编译错误（导出符号不存在）。

- [ ] **Step 2.3: 实现纯函数**

在 `src/core/modules/episode-production/assets/prompts/location-constraints.ts` 文件末尾追加（保留已有的 `ANGLE_VARIANT_LOCK_*` 不动）：

```typescript
/**
 * 地点无人硬约束（spec 2026-05-07）：
 * 业务规则要求所有 location 域图（主图 / angle / time / weather / panorama）
 * 强制不出现人物。约束注入收口在 service 层，renderer 不重复加。
 */
export const LOCATION_NO_HUMAN_SUFFIX =
  '场景中不能有任何人物，仅环境本身（no people, empty scene, environment only, uninhabited landscape, no characters present）'

export const LOCATION_NO_HUMAN_NEGATIVE = [
  'person',
  'people',
  'human',
  'character',
  'figure',
  'portrait',
  'crowd',
  'silhouette',
  'body',
  'man',
  'woman',
  'child',
  'pedestrian',
].join(', ')

/** 把无人约束追加到主 prompt 末尾。已包含则不重复。 */
export function appendLocationNoHumanConstraint(prompt: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return LOCATION_NO_HUMAN_SUFFIX
  if (trimmed.includes(LOCATION_NO_HUMAN_SUFFIX)) return trimmed
  return `${trimmed}，${LOCATION_NO_HUMAN_SUFFIX}`
}

/** 合并 negative：用户已传 + 无人约束。 */
export function mergeLocationNoHumanNegative(userNegative?: string | null): string {
  const u = (userNegative ?? '').trim()
  if (!u) return LOCATION_NO_HUMAN_NEGATIVE
  return `${u}, ${LOCATION_NO_HUMAN_NEGATIVE}`
}
```

- [ ] **Step 2.4: 跑测试确认通过**

```bash
npm test -- tests/unit/episode-production/assets/location-constraints.spec.ts
```

预期：PASS（6 个用例）。

- [ ] **Step 2.5: 提交**

```bash
git add src/core/modules/episode-production/assets/prompts/location-constraints.ts tests/unit/episode-production/assets/location-constraints.spec.ts
git commit -m "feat(ep): location 无人硬约束纯函数 + 单测

新增 appendLocationNoHumanConstraint / mergeLocationNoHumanNegative，作为
地点全域无人规则的最小单元。下一步由 service 层在 location 分支自动注入。"
```

---

## Task 3: MainImageGeneratorService 自动注入无人约束

**Files:**
- Create: `tests/unit/episode-production/assets/main-image-generator.location-no-human.spec.ts`
- Modify: `src/core/modules/episode-production/assets/services/main-image-generator.service.ts`

- [ ] **Step 3.1: 写失败测试**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/modules/episode-production/assets/services/main-image-generator.service'
import type { ImageGenerator } from '@core/modules/episode-production/assets/services/gallery-derivation.service'

interface Call {
  prompt: string
  negativePrompt?: string
  label: string
  referenceImagePaths: string[]
}

class MockGen implements ImageGenerator {
  calls: Call[] = []
  async generate(opts: Call): Promise<{ imagePath: string; thumbnailPath: string | null }> {
    this.calls.push(opts)
    return { imagePath: `/mock/${opts.label}.png`, thumbnailPath: null }
  }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('MainImageGeneratorService · location 无人自动注入', () => {
  let ds: DataSource
  let mockGen: MockGen
  let svc: MainImageGeneratorService

  beforeEach(async () => {
    ds = await buildDb()
    mockGen = new MockGen()
    svc = new MainImageGeneratorService(new AssetImageService(ds), mockGen, ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('location 主图：prompt 自动追加无人约束、negative 自动合并', async () => {
    await svc.generateMain({
      assetType: 'location',
      assetId: 'loc1',
      prompt: '古风茶馆',
    })
    expect(mockGen.calls).toHaveLength(1)
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(true)
    expect(c.prompt.includes('古风茶馆')).toBe(true)
    expect(c.negativePrompt).toBeDefined()
    expect(c.negativePrompt!.includes('person')).toBe(true)
  })

  it('character 主图：不注入无人约束', async () => {
    await svc.generateMain({
      assetType: 'character',
      assetId: 'ch1',
      prompt: '少年，蓝衫',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(false)
  })

  it('item 主图：不注入无人约束', async () => {
    await svc.generateMain({
      assetType: 'item',
      assetId: 'it1',
      prompt: '青铜剑',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(false)
  })

  it('location 已含无人约束的 prompt：不重复追加', async () => {
    const { LOCATION_NO_HUMAN_SUFFIX } = await import(
      '@core/modules/episode-production/assets/prompts/location-constraints'
    )
    await svc.generateMain({
      assetType: 'location',
      assetId: 'loc2',
      prompt: `古风茶馆，${LOCATION_NO_HUMAN_SUFFIX}`,
    })
    const c = mockGen.calls[0]
    const occurrences = c.prompt.split(LOCATION_NO_HUMAN_SUFFIX).length - 1
    expect(occurrences).toBe(1)
  })
})
```

- [ ] **Step 3.2: 跑测试确认失败**

```bash
npm test -- tests/unit/episode-production/assets/main-image-generator.location-no-human.spec.ts
```

预期：FAIL（location 测试 assert 不通过）。

- [ ] **Step 3.3: 改 service 注入约束**

在 `main-image-generator.service.ts` 顶部 import：

```typescript
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
} from '../prompts/location-constraints'
```

然后在 `generateMain` 方法中，把 `imageGen.generate(...)` 调用前插入约束注入：

```typescript
async generateMain(input: GenerateMainInput): Promise<AssetImageEntity> {
  if (!input.prompt.trim()) {
    throw new Error('生成主图需要 prompt（请检查资产 effective 数据）')
  }

  // location 全域无人硬约束：在 service 层收口注入
  let effectivePrompt = input.prompt
  let effectiveNegative = input.negativePrompt
  if (input.assetType === 'location') {
    effectivePrompt = appendLocationNoHumanConstraint(input.prompt)
    effectiveNegative = mergeLocationNoHumanNegative(input.negativePrompt)
  }

  const result = await this.imageGen.generate({
    referenceImagePaths: [],
    prompt: effectivePrompt,
    negativePrompt: effectiveNegative,
    label: 'main',
  })

  // ... 后面逻辑保持不变
```

注意：写库时 `prompt` 字段也存改造后的（保持与生成一致），所以下面 `entity.prompt` 应是 `effectivePrompt`，`entity.negativePrompt` 是 `effectiveNegative ?? null`。

- [ ] **Step 3.4: 跑测试确认通过**

```bash
npm test -- tests/unit/episode-production/assets/main-image-generator.location-no-human.spec.ts
```

预期：PASS。

- [ ] **Step 3.5: 跑同模块原有测试确保未回归**

```bash
npm test -- tests/unit/episode-production/assets/
```

预期：PASS。

- [ ] **Step 3.6: 提交**

```bash
git add src/core/modules/episode-production/assets/services/main-image-generator.service.ts tests/unit/episode-production/assets/main-image-generator.location-no-human.spec.ts
git commit -m "feat(ep): MainImageGeneratorService location 分支自动注入无人约束

主图 service 检测 assetType==='location' 时自动 append + merge，
renderer 不需要再单独拼。"
```

---

## Task 4: GalleryDerivationService 自动注入无人约束

**Files:**
- Create: `tests/unit/episode-production/assets/gallery-derivation.location-no-human.spec.ts`
- Modify: `src/core/modules/episode-production/assets/services/gallery-derivation.service.ts`

- [ ] **Step 4.1: 写失败测试**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import {
  GalleryDerivationService,
  type ImageGenerator,
} from '@core/modules/episode-production/assets/services/gallery-derivation.service'

class MockGen implements ImageGenerator {
  calls: any[] = []
  async generate(opts: any) {
    this.calls.push(opts)
    return { imagePath: `/mock/${opts.label}.png`, thumbnailPath: null }
  }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('GalleryDerivationService · location 派生无人约束', () => {
  let ds: DataSource
  let mockGen: MockGen
  let svc: GalleryDerivationService

  beforeEach(async () => {
    ds = await buildDb()
    const imageSvc = new AssetImageService(ds)
    mockGen = new MockGen()
    svc = new GalleryDerivationService(imageSvc, mockGen)
    await imageSvc.addImage({
      assetType: 'location',
      assetId: 'loc1',
      category: 'main',
      imagePath: '/main.png',
      isMain: true,
    })
    await imageSvc.addImage({
      assetType: 'character',
      assetId: 'ch1',
      category: 'main',
      imagePath: '/main_ch.png',
      isMain: true,
    })
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('location 派生：自动注入无人约束', async () => {
    await svc.deriveSingle({
      assetType: 'location',
      assetId: 'loc1',
      label: 'angle_front',
      prompt: '茶馆正面',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(true)
    expect(c.negativePrompt).toBeDefined()
    expect(c.negativePrompt.includes('person')).toBe(true)
  })

  it('character 派生：不注入无人约束', async () => {
    await svc.deriveSingle({
      assetType: 'character',
      assetId: 'ch1',
      label: 'pose_walk',
      prompt: '少年，行走',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(false)
  })
})
```

- [ ] **Step 4.2: 跑测试确认失败**

```bash
npm test -- tests/unit/episode-production/assets/gallery-derivation.location-no-human.spec.ts
```

预期：FAIL。

- [ ] **Step 4.3: 改 service 注入约束**

阅读 `src/core/modules/episode-production/assets/services/gallery-derivation.service.ts`，找到 `deriveSingle` 方法中调 `imageGen.generate(...)` 的那行。在调用前对 location 分支做注入（与 Task 3 同模式）：

```typescript
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
} from '../prompts/location-constraints'

// 在 deriveSingle / deriveBatch 调 imageGen.generate 前：
let effectivePrompt = input.prompt
let effectiveNegative = input.negativePrompt
if (input.assetType === 'location') {
  effectivePrompt = appendLocationNoHumanConstraint(input.prompt)
  effectiveNegative = mergeLocationNoHumanNegative(input.negativePrompt)
}
const result = await this.imageGen.generate({
  referenceImagePaths,
  prompt: effectivePrompt,
  negativePrompt: effectiveNegative,
  label: input.label,
})
```

注意如果 `deriveSingle` 内部已经调用过 `appendAngleLightingLock` 处理 angle 变体，先角度锁再无人约束（次序无所谓，函数本身幂等）。如果 batch 内部循环各 label 调下层 `deriveSingle`，只在 `deriveSingle` 注入即可。

- [ ] **Step 4.4: 跑测试确认通过**

```bash
npm test -- tests/unit/episode-production/assets/gallery-derivation
```

预期：PASS（包括原有 4 个用例 + 新加 2 个 location-no-human 用例）。

- [ ] **Step 4.5: 提交**

```bash
git add src/core/modules/episode-production/assets/services/gallery-derivation.service.ts tests/unit/episode-production/assets/gallery-derivation.location-no-human.spec.ts
git commit -m "feat(ep): GalleryDerivationService location 派生自动注入无人约束

派生路径覆盖 angle / time / weather / pose 等所有 label，
location 域统一应用，character / item 不动。"
```

---

## Task 5: PanoramaGeneratorService 自动注入无人约束

**Files:**
- Create: `tests/unit/episode-production/assets/panorama-generator.location-no-human.spec.ts`
- Modify: `src/core/modules/episode-production/assets/services/panorama-generator.service.ts`

- [ ] **Step 5.1: 阅读 panorama service 现状**

`Read src/core/modules/episode-production/assets/services/panorama-generator.service.ts`，找到调 `panoramaGen.generate(...)` 处。该 service 的输入是 `stylePrompt` + 可选 `additionalPrompt`，最终拼成完整 prompt。约束应注入到拼好的最终 prompt 上。

- [ ] **Step 5.2: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest'
import { PanoramaGeneratorService, type PanoramaImageGenerator } from '@core/modules/episode-production/assets/services/panorama-generator.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

class MockPan implements PanoramaImageGenerator {
  calls: any[] = []
  async generate(opts: any) {
    this.calls.push(opts)
    return { imagePath: `/mock/pano.png`, thumbnailPath: null }
  }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('PanoramaGeneratorService · 无人约束', () => {
  it('360 全景：自动注入无人约束（panorama 永远走 location 域）', async () => {
    const ds = await buildDb()
    const imageSvc = new AssetImageService(ds)
    const mockPan = new MockPan()
    const svc = new PanoramaGeneratorService(imageSvc, mockPan)

    await svc.generateFor({
      locationBindingId: 'loc1',
      stylePrompt: '茶馆 古风 工笔国风',
    })

    expect(mockPan.calls).toHaveLength(1)
    const c = mockPan.calls[0]
    expect(c.prompt.includes('no people')).toBe(true)
    expect(c.negativePrompt).toBeDefined()
    expect(c.negativePrompt.includes('person')).toBe(true)

    await ds.destroy()
  })
})
```

- [ ] **Step 5.3: 跑测试确认失败**

```bash
npm test -- tests/unit/episode-production/assets/panorama-generator.location-no-human.spec.ts
```

预期：FAIL。

- [ ] **Step 5.4: 改 service 注入约束**

```typescript
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
} from '../prompts/location-constraints'

// 在 generateFor 内拼好 fullPrompt 后注入：
const fullPrompt = appendLocationNoHumanConstraint(
  [stylePrompt, additionalPrompt].filter(Boolean).join(' ')
)
const fullNegative = mergeLocationNoHumanNegative(input.negativePrompt)
const result = await this.panoramaGen.generate({
  prompt: fullPrompt,
  negativePrompt: fullNegative,
  aspectRatio: '2:1',
  referenceImagePaths,
})
```

- [ ] **Step 5.5: 跑测试确认通过**

```bash
npm test -- tests/unit/episode-production/assets/panorama-generator
```

预期：PASS（含 panorama-snapshot / panorama-upload 等原有测试）。

- [ ] **Step 5.6: 提交**

```bash
git add src/core/modules/episode-production/assets/services/panorama-generator.service.ts tests/unit/episode-production/assets/panorama-generator.location-no-human.spec.ts
git commit -m "feat(ep): PanoramaGeneratorService 自动注入无人约束

panorama 永远在 location 域内，无条件应用无人约束。"
```

---

## Task 6: setting-enrichment-prompt 纯函数 + 单测

**Files:**
- Create: `src/core/modules/episode-production/assets/prompts/setting-enrichment-prompt.ts`
- Create: `tests/unit/episode-production/assets/setting-enrichment-prompt.spec.ts`

- [ ] **Step 6.1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest'
import {
  buildSettingEnrichmentSystemPrompt,
  buildSettingEnrichmentUserPrompt,
  type EnrichmentTodo,
  type EnrichmentContext,
} from '@core/modules/episode-production/assets/prompts/setting-enrichment-prompt'

describe('setting-enrichment-prompt', () => {
  it('system prompt 含设计师定位与忠实/合理设计/允许空缺三条规则', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character')
    expect(sys.includes('设计师')).toBe(true)
    expect(sys.includes('忠实')).toBe(true)
    expect(sys.includes('合理')).toBe(true)
    expect(sys.includes('空缺') || sys.includes('null')).toBe(true)
  })

  it('system prompt 不同 kind 文案不一样', () => {
    expect(buildSettingEnrichmentSystemPrompt('character')).not.toBe(
      buildSettingEnrichmentSystemPrompt('location'),
    )
    expect(buildSettingEnrichmentSystemPrompt('character').includes('角色')).toBe(true)
    expect(buildSettingEnrichmentSystemPrompt('location').includes('地点')).toBe(true)
    expect(buildSettingEnrichmentSystemPrompt('item').includes('物品')).toBe(true)
  })

  it('user prompt 含原文 / 已有上下文 / 待补清单 / schema 提示', () => {
    const todo: EnrichmentTodo[] = [{ id: 'b1', name: '老者', alias: null }]
    const ctx: EnrichmentContext[] = [
      { name: '少年', fields: { age: 16, race: 'east_asian' } },
    ]
    const user = buildSettingEnrichmentUserPrompt({
      kind: 'character',
      originalText: '茶馆里有个老者',
      existingContext: ctx,
      todo,
    })
    expect(user.includes('茶馆里有个老者')).toBe(true)
    expect(user.includes('少年')).toBe(true)
    expect(user.includes('老者')).toBe(true)
    expect(user.includes('age')).toBe(true)
  })

  it('user prompt: existingContext 为空仍可用', () => {
    const user = buildSettingEnrichmentUserPrompt({
      kind: 'location',
      originalText: '街角',
      existingContext: [],
      todo: [{ id: 'l1', name: '街角', alias: null }],
    })
    expect(user.includes('街角')).toBe(true)
  })
})
```

- [ ] **Step 6.2: 跑测试确认失败**

```bash
npm test -- tests/unit/episode-production/assets/setting-enrichment-prompt.spec.ts
```

预期：FAIL（导出符号不存在）。

- [ ] **Step 6.3: 实现 prompt 模板**

新文件 `src/core/modules/episode-production/assets/prompts/setting-enrichment-prompt.ts`：

```typescript
/**
 * AI 设定反推 prompt 模板（spec 2026-05-07 §3.4）
 * @module modules/episode-production/assets/prompts/setting-enrichment-prompt
 *
 * 把"AI 角色 / 场景 / 道具设计师"的指令拆成纯字符串拼装函数：
 * - buildSettingEnrichmentSystemPrompt(kind) → system 指令
 * - buildSettingEnrichmentUserPrompt(input)   → user 指令（原文 + 上下文 + 待补清单）
 *
 * 双端共用：core 包，不依赖 fs / browser API。
 */

export type EnrichmentKind = 'character' | 'location' | 'item'

export interface EnrichmentTodo {
  /** binding id */
  id: string
  name: string
  alias: string | null
}

export interface EnrichmentContext {
  name: string
  /** 已填字段（同 kind 已有 binding 的可见字段，作为世界观） */
  fields: Record<string, unknown>
}

export interface BuildUserPromptInput {
  kind: EnrichmentKind
  originalText: string
  existingContext: EnrichmentContext[]
  todo: EnrichmentTodo[]
}

const KIND_LABEL: Record<EnrichmentKind, string> = {
  character: '角色',
  location: '地点',
  item: '物品',
}

/**
 * character 字段说明：description / appearance / outfit / role / gender / age / race
 *                    + styleAnchors（数组）/ outfitsExtra（数组）
 * location  字段说明：description（短语描述地点的氛围、时段、风格）
 * item      字段说明：description
 */
const SCHEMA_HINT: Record<EnrichmentKind, string> = {
  character: `每个角色返回如下字段（任意字段判断没有充分线索时可设为 null 或空字符串，不要编造）：
- description: 一句概括（中文）
- appearance: 外貌（发型 / 体型 / 面部特征，中文）
- outfit: 主要服装（中文）
- role: 定位（"主角" / "配角" / "反派" / "旁白" 之一）
- gender: 性别（"男" / "女" / "其他" / "未指定" 之一）
- age: 整数年龄（不确定时给一个合理整数估值）
- race: 人种（"east_asian" / "south_asian" / "southeast_asian" / "central_asian" / "european" / "african" / "south_american" 之一）
- styleAnchors: 风格锚点字符串数组（如 ["工笔国风", "水墨"]）
- outfitsExtra: 备选服装字符串数组`,
  location: `每个地点返回如下字段（不能确定时设 null 或空串）：
- description: 一段描述（氛围 / 时段 / 风格 / 环境元素，中文）`,
  item: `每个物品返回如下字段：
- description: 一段描述（材质 / 风格 / 形态，中文）`,
}

export function buildSettingEnrichmentSystemPrompt(kind: EnrichmentKind): string {
  const label = KIND_LABEL[kind]
  return `你是这部剧的${label}设计师。你将拿到一份原文片段和一些待设计的${label}名字清单。

请为每个${label}推断出生成图所需的字段。

强制规则：
1. 原文里明确提到的细节必须忠实遵循，不能改写或反对。
2. 原文未明说但生成图必需的字段（外貌、服装、年龄、人种、风格等），请基于原文整体氛围与已有同类资产合理设计一个和谐、自洽、不与原文矛盾的方案。
3. 你判断某字段没有充分线索且无合理设计依据时，可以输出 null 或空字符串，切勿编造完全脱离原文的细节。
4. 输出严格 JSON，结构与下方 schema 一致。
5. 同项目已有的同类资产代表了"已经定下来的世界观"，新设计必须与之相容。

${SCHEMA_HINT[kind]}

输出 JSON 结构示例：
{
  "results": [
    {
      "id": "<待补清单里的 id>",
      "fields": { /* 上述 schema 字段 */ },
      "_evidence": { "<字段名>": "<来源说明：原文片段 或 '设计：理由'>" }
    }
  ]
}`
}

export function buildSettingEnrichmentUserPrompt(input: BuildUserPromptInput): string {
  const { originalText, existingContext, todo } = input
  const ctxText =
    existingContext.length === 0
      ? '（暂无）'
      : existingContext
          .map((c) => `- ${c.name}：${JSON.stringify(c.fields)}`)
          .join('\n')
  const todoText = todo
    .map((t) => `- id=${t.id} 名字="${t.name}"${t.alias ? ` 别名="${t.alias}"` : ''}`)
    .join('\n')
  return `【原文片段】
${originalText || '（原文为空）'}

【同项目已有同类资产（世界观参考）】
${ctxText}

【待设计清单】
${todoText}

请按 system prompt 中给出的 schema 输出严格 JSON。`
}
```

- [ ] **Step 6.4: 跑测试确认通过**

```bash
npm test -- tests/unit/episode-production/assets/setting-enrichment-prompt.spec.ts
```

预期：PASS（4 个用例）。

- [ ] **Step 6.5: 提交**

```bash
git add src/core/modules/episode-production/assets/prompts/setting-enrichment-prompt.ts tests/unit/episode-production/assets/setting-enrichment-prompt.spec.ts
git commit -m "feat(ep): AI 设定反推 prompt 模板 + 单测

system prompt 三条强制规则（忠实 / 合理设计 / 允许空缺）；
user prompt 含原文 / 已有上下文 / 待补清单 + schema 字段说明。"
```

---

## Task 7: AssetSettingEnrichmentService 服务 + 单测

**Files:**
- Create: `src/core/modules/episode-production/assets/services/asset-setting-enrichment.service.ts`
- Create: `tests/unit/episode-production/assets/asset-setting-enrichment.service.spec.ts`

- [ ] **Step 7.1: 阅读所需 Repository 与字段**

```bash
grep -n "character_bindings\|CharacterBindingEntity" /home/ubuntu/workdir/the-bot/src/core/modules/episode-production/assets/services/character-asset.service.ts | head -10
```

确认 character/location/item binding 实体的可写字段路径与 typeorm Repository 调用方式（与 character-asset.service.ts 现有 update 模式一致）。

- [ ] **Step 7.2: 写失败测试（核心 4 个用例）**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import {
  AssetSettingEnrichmentService,
  type CallAIFn,
} from '@core/modules/episode-production/assets/services/asset-setting-enrichment.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      EpisodeScriptEntity,
      VideoEpisodeEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

function nowMs(): number {
  return Date.now()
}

describe('AssetSettingEnrichmentService', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
    // 准备：1 个 episode 带原文 + 2 个 character binding（一个全空、一个已部分填）
    const epRepo = ds.getRepository(VideoEpisodeEntity)
    const scriptRepo = ds.getRepository(EpisodeScriptEntity)
    const chRepo = ds.getRepository(CharacterBindingEntity)
    await epRepo.save({
      id: 'ep1',
      projectId: 'p1',
      title: '第 1 集',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await scriptRepo.save({
      id: 's1',
      episodeId: 'ep1',
      originalText: '茶馆里有个老者，少年从西边走来',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await chRepo.save({
      id: 'cb1',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '老者',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await chRepo.save({
      id: 'cb2',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '少年',
      standaloneDescription: '已经填好的少年描述',
      age: 16,
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('反推填充：仅写空字段，不覆盖已填', async () => {
    const calls: Array<{ kind: string; user: string }> = []
    const callAI: CallAIFn = async (user, _system) => {
      const m = user.match(/(character|location|item)/) // 简化
      const kind = m ? m[1] : 'character'
      calls.push({ kind, user })
      return JSON.stringify({
        results: [
          {
            id: 'cb1',
            fields: {
              description: 'AI: 老者描述',
              age: 70,
              gender: '男',
              race: 'east_asian',
            },
          },
          {
            id: 'cb2',
            fields: {
              description: 'AI: 少年描述（应该被丢弃，因为已填）',
              age: 99,
              gender: '男',
            },
          },
        ],
      })
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    await svc.enrich({ projectId: 'p1' })

    const cb1 = await ds.getRepository(CharacterBindingEntity).findOneByOrFail({ id: 'cb1' })
    const cb2 = await ds.getRepository(CharacterBindingEntity).findOneByOrFail({ id: 'cb2' })
    // cb1 全空 → 全部写入
    expect(cb1.standaloneDescription).toBe('AI: 老者描述')
    expect(cb1.age).toBe(70)
    expect(cb1.gender).toBe('男')
    expect(cb1.race).toBe('east_asian')
    // cb2 已填 → 保持原值
    expect(cb2.standaloneDescription).toBe('已经填好的少年描述')
    expect(cb2.age).toBe(16)
    // 但 cb2 原本空的 gender 被 AI 提供 → 写入
    expect(cb2.gender).toBe('男')
  })

  it('AI 返回非 JSON：该 kind 失败但不抛错；其他 kind 不受影响', async () => {
    let callIdx = 0
    const callAI: CallAIFn = async () => {
      callIdx++
      if (callIdx === 1) return '这不是 JSON'
      return JSON.stringify({ results: [] })
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    const summary = await svc.enrich({ projectId: 'p1' })
    expect(summary.failures.length).toBeGreaterThan(0)
    expect(summary.failures[0].kind).toBe('character')
  })

  it('未配置 AI provider（callAI 抛 "未配置"）：抛错让上层中止', async () => {
    const callAI: CallAIFn = async () => {
      throw new Error('未配置 AI 提供商')
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    await expect(svc.enrich({ projectId: 'p1' })).rejects.toThrow(/未配置/)
  })

  it('待补清单为空：跳过该 kind 不调 AI', async () => {
    const calls: number[] = []
    const callAI: CallAIFn = async () => {
      calls.push(1)
      return JSON.stringify({ results: [] })
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    await svc.enrich({ projectId: 'p1' })
    // p1 没有 location/item binding → 那两次调用应跳过
    expect(calls.length).toBe(1)
  })
})
```

- [ ] **Step 7.3: 跑测试确认失败**

```bash
npm test -- tests/unit/episode-production/assets/asset-setting-enrichment.service.spec.ts
```

预期：FAIL（service 不存在）。

- [ ] **Step 7.4: 实现 service**

新文件 `src/core/modules/episode-production/assets/services/asset-setting-enrichment.service.ts`：

```typescript
/**
 * AI 设定反推 service（spec 2026-05-07 §3）
 * @module modules/episode-production/assets/services/asset-setting-enrichment
 *
 * 流程：
 * 1. 加载 projectId 下所有 episode 的 original_text 拼成原文段
 * 2. 加载同项目 character / location / item bindings → 拆为"已填上下文"+"待补清单"
 * 3. 三个 kind 各发一次 AI 调用（失败该 kind 跳过，不影响其他）
 * 4. 解析 AI JSON，仅当 binding 当前字段为空时写入
 *
 * callAI 通过依赖注入，便于测试 mock；handler 注入真实 callAI（narrative/ai/_helpers）。
 *
 * 多用户：通过 typeorm Repository + BaseRepository userId 注入，与现有 service 一致。
 */

import type { DataSource, Repository } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import {
  buildSettingEnrichmentSystemPrompt,
  buildSettingEnrichmentUserPrompt,
  type EnrichmentKind,
  type EnrichmentTodo,
  type EnrichmentContext,
} from '../prompts/setting-enrichment-prompt'

export type CallAIFn = (
  userPrompt: string,
  systemPrompt: string,
  maxTokens?: number,
) => Promise<string>

export interface EnrichInput {
  projectId: string
  /** Web 端通过 ALS 注入，PC 端 null */
  userId?: string | null
}

export interface EnrichSummary {
  enrichedCount: { character: number; location: number; item: number }
  failures: Array<{ kind: EnrichmentKind; reason: string }>
}

interface AIResult {
  id: string
  fields: Record<string, unknown>
  _evidence?: Record<string, string>
}

export class AssetSettingEnrichmentService {
  constructor(
    private readonly ds: DataSource,
    private readonly callAI: CallAIFn,
  ) {}

  async enrich(input: EnrichInput): Promise<EnrichSummary> {
    const summary: EnrichSummary = {
      enrichedCount: { character: 0, location: 0, item: 0 },
      failures: [],
    }

    const originalText = await this.loadOriginalText(input.projectId)
    const kinds: EnrichmentKind[] = ['character', 'location', 'item']
    for (const kind of kinds) {
      try {
        const { todo, context } = await this.collectKind(kind, input.projectId)
        if (todo.length === 0) {
          continue
        }
        const sys = buildSettingEnrichmentSystemPrompt(kind)
        const user = buildSettingEnrichmentUserPrompt({
          kind,
          originalText,
          existingContext: context,
          todo,
        })
        const raw = await this.callAI(user, sys, 8192)
        const results = this.parseResults(raw)
        const written = await this.applyResults(kind, input.projectId, results)
        summary.enrichedCount[kind] = written
      } catch (e: any) {
        // 未配置 provider → 整批中止（让上层不进 stage 2）
        if (typeof e?.message === 'string' && e.message.includes('未配置')) {
          throw e
        }
        summary.failures.push({ kind, reason: e?.message ?? String(e) })
        console.warn(`[AssetSettingEnrichmentService] ${kind} 反推失败：`, e)
      }
    }
    return summary
  }

  private async loadOriginalText(projectId: string): Promise<string> {
    const epRepo: Repository<VideoEpisodeEntity> = this.ds.getRepository(VideoEpisodeEntity)
    const scriptRepo: Repository<EpisodeScriptEntity> = this.ds.getRepository(EpisodeScriptEntity)
    const episodes = await epRepo.find({ where: { projectId } as any })
    if (episodes.length === 0) return ''
    const ids = episodes.map((e) => e.id)
    const scripts: EpisodeScriptEntity[] = []
    for (const id of ids) {
      const list = await scriptRepo.find({ where: { episodeId: id } as any })
      scripts.push(...list)
    }
    return scripts.map((s) => (s as any).originalText ?? '').filter(Boolean).join('\n\n')
  }

  private async collectKind(
    kind: EnrichmentKind,
    projectId: string,
  ): Promise<{ todo: EnrichmentTodo[]; context: EnrichmentContext[] }> {
    if (kind === 'character') {
      const repo = this.ds.getRepository(CharacterBindingEntity)
      const all = await repo.find({ where: { projectId } as any })
      return splitForCharacter(all)
    }
    if (kind === 'location') {
      const repo = this.ds.getRepository(LocationBindingEntity)
      const all = await repo.find({ where: { projectId } as any })
      return splitForLocation(all)
    }
    const repo = this.ds.getRepository(ItemBindingEntity)
    const all = await repo.find({ where: { projectId } as any })
    return splitForItem(all)
  }

  private parseResults(raw: string): AIResult[] {
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('AI 响应非 JSON')
      parsed = JSON.parse(m[0])
    }
    if (!parsed || !Array.isArray(parsed.results)) {
      throw new Error('AI 响应缺 results 数组')
    }
    return parsed.results
  }

  private async applyResults(
    kind: EnrichmentKind,
    projectId: string,
    results: AIResult[],
  ): Promise<number> {
    if (kind === 'character') {
      return applyCharacter(this.ds.getRepository(CharacterBindingEntity), projectId, results)
    }
    if (kind === 'location') {
      return applyLocation(this.ds.getRepository(LocationBindingEntity), projectId, results)
    }
    return applyItem(this.ds.getRepository(ItemBindingEntity), projectId, results)
  }
}

// ─── 拆分：todo / context ─────────────────────────────────────

function effectiveName(b: any): string {
  return b.standaloneName || b.overrideName || ''
}

function splitForCharacter(all: CharacterBindingEntity[]) {
  const todo: EnrichmentTodo[] = []
  const context: EnrichmentContext[] = []
  for (const b of all) {
    const name = effectiveName(b)
    if (!name) continue
    const filledFields = collectCharacterFilled(b)
    if (Object.keys(filledFields).length === 0) {
      todo.push({ id: b.id, name, alias: b.alias ?? null })
    } else {
      context.push({ name, fields: filledFields })
      // 即使有部分字段填好，仍可能有空字段需要补 → 也加进 todo
      if (hasCharacterEmpty(b)) {
        todo.push({ id: b.id, name, alias: b.alias ?? null })
      }
    }
  }
  return { todo, context }
}

function collectCharacterFilled(b: CharacterBindingEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (b.standaloneDescription || b.overrideDescription) {
    out.description = b.standaloneDescription || b.overrideDescription
  }
  if (b.overrideAppearance) out.appearance = b.overrideAppearance
  if (b.overrideOutfit) out.outfit = b.overrideOutfit
  if (b.role) out.role = b.role
  if (b.gender) out.gender = b.gender
  if (b.age != null) out.age = b.age
  if (b.race) out.race = b.race
  return out
}

function hasCharacterEmpty(b: CharacterBindingEntity): boolean {
  return !(
    (b.standaloneDescription || b.overrideDescription) &&
    b.overrideAppearance &&
    b.overrideOutfit &&
    b.role &&
    b.gender &&
    b.age != null &&
    b.race
  )
}

function splitForLocation(all: LocationBindingEntity[]) {
  const todo: EnrichmentTodo[] = []
  const context: EnrichmentContext[] = []
  for (const b of all as any[]) {
    const name = effectiveName(b)
    if (!name) continue
    const desc = b.standaloneDescription || b.overrideDescription
    if (desc) {
      context.push({ name, fields: { description: desc } })
    } else {
      todo.push({ id: b.id, name, alias: null })
    }
  }
  return { todo, context }
}

function splitForItem(all: ItemBindingEntity[]) {
  const todo: EnrichmentTodo[] = []
  const context: EnrichmentContext[] = []
  for (const b of all as any[]) {
    const name = effectiveName(b)
    if (!name) continue
    const desc = b.standaloneDescription || b.overrideDescription
    if (desc) {
      context.push({ name, fields: { description: desc } })
    } else {
      todo.push({ id: b.id, name, alias: null })
    }
  }
  return { todo, context }
}

// ─── 落库：仅写空字段 ─────────────────────────────────────

async function applyCharacter(
  repo: Repository<CharacterBindingEntity>,
  projectId: string,
  results: AIResult[],
): Promise<number> {
  let written = 0
  for (const r of results) {
    const b = await repo.findOne({ where: { id: r.id, projectId } as any })
    if (!b) continue
    const patch: Partial<CharacterBindingEntity> = {}
    const f = r.fields ?? {}
    if (b.sourceType === 'linked_lw') {
      if (!b.overrideDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.overrideDescription = f.description.trim()
      }
    } else {
      if (!b.standaloneDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.standaloneDescription = f.description.trim()
      }
    }
    if (!b.overrideAppearance && typeof f.appearance === 'string' && f.appearance.trim()) {
      patch.overrideAppearance = f.appearance.trim()
    }
    if (!b.overrideOutfit && typeof f.outfit === 'string' && f.outfit.trim()) {
      patch.overrideOutfit = f.outfit.trim()
    }
    if (!b.role && typeof f.role === 'string' && f.role.trim()) patch.role = f.role.trim()
    if (!b.gender && typeof f.gender === 'string' && f.gender.trim()) patch.gender = f.gender.trim()
    if (b.age == null && typeof f.age === 'number' && Number.isFinite(f.age)) {
      patch.age = Math.floor(f.age)
    }
    if (!b.race && typeof f.race === 'string' && f.race.trim()) patch.race = f.race.trim()
    if (!b.styleAnchors && Array.isArray(f.styleAnchors) && f.styleAnchors.length > 0) {
      patch.styleAnchors = JSON.stringify(f.styleAnchors)
    }
    if (!b.outfitsExtra && Array.isArray(f.outfitsExtra) && f.outfitsExtra.length > 0) {
      patch.outfitsExtra = JSON.stringify(f.outfitsExtra)
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date()
      await repo.update({ id: b.id }, patch)
      written++
    }
  }
  return written
}

async function applyLocation(
  repo: Repository<LocationBindingEntity>,
  projectId: string,
  results: AIResult[],
): Promise<number> {
  let written = 0
  for (const r of results) {
    const b: any = await repo.findOne({ where: { id: r.id, projectId } as any })
    if (!b) continue
    const f: any = r.fields ?? {}
    const patch: any = {}
    if (b.sourceType === 'linked_lw') {
      if (!b.overrideDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.overrideDescription = f.description.trim()
      }
    } else {
      if (!b.standaloneDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.standaloneDescription = f.description.trim()
      }
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date()
      await repo.update({ id: b.id }, patch)
      written++
    }
  }
  return written
}

async function applyItem(
  repo: Repository<ItemBindingEntity>,
  projectId: string,
  results: AIResult[],
): Promise<number> {
  let written = 0
  for (const r of results) {
    const b: any = await repo.findOne({ where: { id: r.id, projectId } as any })
    if (!b) continue
    const f: any = r.fields ?? {}
    const patch: any = {}
    if (b.sourceType === 'linked_lw') {
      if (!b.overrideDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.overrideDescription = f.description.trim()
      }
    } else {
      if (!b.standaloneDescription && typeof f.description === 'string' && f.description.trim()) {
        patch.standaloneDescription = f.description.trim()
      }
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date()
      await repo.update({ id: b.id }, patch)
      written++
    }
  }
  return written
}
```

- [ ] **Step 7.5: 验证 location / item entity 字段**

`grep -n "standaloneDescription\|overrideDescription" src/core/database/entities/episode-production/location-binding.entity.ts src/core/database/entities/episode-production/item-binding.entity.ts` —— 确认字段名一致；如果 entity 字段名不同，回头修 `applyLocation` / `applyItem`。

- [ ] **Step 7.6: 跑测试确认通过**

```bash
npm test -- tests/unit/episode-production/assets/asset-setting-enrichment.service.spec.ts
```

预期：PASS（4 个用例）。如果有 entity 字段不匹配编译错误，先修 entity 字段名再跑。

- [ ] **Step 7.7: 提交**

```bash
git add src/core/modules/episode-production/assets/services/asset-setting-enrichment.service.ts tests/unit/episode-production/assets/asset-setting-enrichment.service.spec.ts
git commit -m "feat(ep): AssetSettingEnrichmentService — AI 反推设定卡仅填空字段

按 character/location/item 分三次 callAI；任意 kind 失败仅记录不影响其他；
未配置 provider 时整批抛错让上层中止 stage 2。"
```

---

## Task 8: IPC channel + Electron handler + preload + Web 双端注册

**Files:**
- Modify: `src/preload/index.ts:280` 区块（IPC_CHANNELS 常量）
- Modify: `src/preload/index.ts:1944` 区块（episodeProduction.asset 暴露）
- Create: `src/electron/ipc/handlers/episode-production/asset/asset-setting-enrichment.handler.ts`
- Modify: `src/electron/ipc/handlers/episode-production/index.ts`（或 router 注册位）
- Modify: `src/web/client/channel-map.ts:517` 区块
- Modify: `src/web/server/api/register-channels.ts`

- [ ] **Step 8.1: 加 channel 常量**

打开 `src/preload/index.ts`，在 EP_ASSET_IMAGE_GENERATE_MAIN 紧邻处加：

```typescript
EP_ASSET_ENRICH_SETTINGS: 'ep:asset:enrich-settings',
```

- [ ] **Step 8.2: 暴露 preload API**

在 `episodeProduction.asset` 命名空间内（`image: { ... }` 区块附近）加：

```typescript
enrichSettings: (input: { projectId: string }) =>
  ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ENRICH_SETTINGS, input),
```

- [ ] **Step 8.3: 实现 Electron handler**

新文件 `src/electron/ipc/handlers/episode-production/asset/asset-setting-enrichment.handler.ts`：

```typescript
/**
 * episode-production · 资产设定反推 IPC handler
 * @module electron/ipc/handlers/episode-production/asset/asset-setting-enrichment.handler
 */
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { AssetSettingEnrichmentService } from '@core/modules/episode-production/assets/services/asset-setting-enrichment.service'
import { callAI } from '@core/modules/episode-production/narrative/ai/_helpers'

export function registerAssetSettingEnrichmentHandlers(): void {
  ipcBridge.handle('ep:asset:enrich-settings', handleEnrich)
}

async function handleEnrich(
  _event: any,
  input: { projectId: string },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new AssetSettingEnrichmentService(db.dataSource, callAI)
    const data = await svc.enrich({ projectId: input.projectId })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
```

- [ ] **Step 8.4: 注册 handler**

```bash
grep -n "registerAssetImageHandlers\|registerAssetSummaryHandlers" /home/ubuntu/workdir/the-bot/src/electron/ipc/handlers/episode-production/
```

找到注册点（通常 `episode-production/index.ts` 或顶级 ipc/index.ts），在同位置加：

```typescript
import { registerAssetSettingEnrichmentHandlers } from './asset/asset-setting-enrichment.handler'
// ...
registerAssetSettingEnrichmentHandlers()
```

- [ ] **Step 8.5: Web channel-map**

`src/web/client/channel-map.ts`，在 `'episodeProduction.asset.image.generateMain'` 附近加：

```typescript
'episodeProduction.asset.enrichSettings': { channel: 'ep:asset:enrich-settings' },
```

- [ ] **Step 8.6: Web register-channels**

```bash
grep -n "ep:asset:image:generate-main\|ep:asset:image" /home/ubuntu/workdir/the-bot/src/web/server/api/register-channels.ts | head -5
```

参照 `ep:asset:image:generate-main` 的 web 注册方式，在 register-channels.ts 中加入 `ep:asset:enrich-settings` 的路由（指向同一 handler 函数）。

- [ ] **Step 8.7: 验证编译通过**

```bash
npm run build:main
```

预期：无 TS 报错。

- [ ] **Step 8.8: 提交**

```bash
git add src/preload/index.ts src/electron/ipc/handlers/episode-production/ src/web/client/channel-map.ts src/web/server/api/register-channels.ts
git commit -m "feat(ep): ep:asset:enrich-settings IPC channel + 双端 handler 注册"
```

---

## Task 9: renderer api wrapper

**Files:**
- Create: `src/renderer/src/api/asset-setting-enrichment.ts`
- Create: `tests/unit/renderer/asset-setting-enrichment.spec.ts`

- [ ] **Step 9.1: 写失败测试**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enrichAssetSettings } from '@/api/asset-setting-enrichment'

describe('asset-setting-enrichment renderer api', () => {
  beforeEach(() => {
    ;(window as any).electronAPI = {
      episodeProduction: {
        asset: {
          enrichSettings: vi.fn().mockResolvedValue({
            success: true,
            data: {
              enrichedCount: { character: 2, location: 0, item: 0 },
              failures: [],
            },
          }),
        },
      },
    }
  })

  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('成功返回 enrichedCount', async () => {
    const out = await enrichAssetSettings('p1')
    expect(out.enrichedCount.character).toBe(2)
  })

  it('IPC API 不可用：抛错', async () => {
    delete (window as any).electronAPI
    await expect(enrichAssetSettings('p1')).rejects.toThrow(/不可用|未暴露/)
  })

  it('IPC 返回 success=false：抛错', async () => {
    ;(window as any).electronAPI.episodeProduction.asset.enrichSettings = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'AI 配置缺失' })
    await expect(enrichAssetSettings('p1')).rejects.toThrow(/AI 配置缺失/)
  })
})
```

- [ ] **Step 9.2: 跑测试确认失败**

```bash
npm test -- tests/unit/renderer/asset-setting-enrichment.spec.ts
```

预期：FAIL。

- [ ] **Step 9.3: 实现 wrapper**

新文件 `src/renderer/src/api/asset-setting-enrichment.ts`：

```typescript
/**
 * AI 设定反推 client（spec 2026-05-07）
 * @module renderer/api/asset-setting-enrichment
 */

interface IpcResp<T> {
  success: boolean
  data?: T
  error?: string
}

export interface EnrichSummary {
  enrichedCount: { character: number; location: number; item: number }
  failures: Array<{ kind: 'character' | 'location' | 'item'; reason: string }>
}

export async function enrichAssetSettings(projectId: string): Promise<EnrichSummary> {
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.enrichSettings) {
    throw new Error('asset.enrichSettings IPC 未暴露')
  }
  const resp: IpcResp<EnrichSummary> = await api.enrichSettings({ projectId })
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || 'AI 设定反推失败')
  }
  return resp.data
}
```

- [ ] **Step 9.4: 跑测试确认通过**

```bash
npm test -- tests/unit/renderer/asset-setting-enrichment.spec.ts
```

预期：PASS（3 用例）。

- [ ] **Step 9.5: 提交**

```bash
git add src/renderer/src/api/asset-setting-enrichment.ts tests/unit/renderer/asset-setting-enrichment.spec.ts
git commit -m "feat(ep): renderer api enrichAssetSettings wrapper"
```

---

## Task 10: AssetStageViewV2 流程改造（先 enrich → 再批量生主图）

**Files:**
- Modify: `src/renderer/src/components/episode-production/stage-asset-v2/AssetStageViewV2.vue:302-353`

- [ ] **Step 10.1: 改 onGenerateAllMissing**

把现在 `onGenerateAllMissing` 函数体里"直接遍历 generateMainFor"的部分，前面塞一段"先 enrich"：

```typescript
async function onGenerateAllMissing(): Promise<void> {
  if (generatingAll.value) return
  const tasks: Array<{ kind: 'character' | 'location' | 'item'; id: string }> = []
  for (const c of summary.value.characters) {
    if (!c.hasMain) tasks.push({ kind: 'character', id: c.bindingId })
  }
  for (const l of summary.value.locations) {
    if (!l.hasMain) tasks.push({ kind: 'location', id: l.bindingId })
  }
  for (const i of summary.value.items) {
    if (!i.hasMain) tasks.push({ kind: 'item', id: i.bindingId })
  }
  if (tasks.length === 0) {
    ElMessage.info('没有缺失主图的资产')
    return
  }

  generatingAll.value = true

  // ── Stage 1: AI 设定反推（仅填空字段；任意 kind 失败不阻塞 stage 2） ──
  try {
    ElMessage.info('① AI 正在为缺失主图的资产反推设定卡…')
    const { enrichAssetSettings } = await import('@/api/asset-setting-enrichment')
    const enrichSummary = await enrichAssetSettings(props.projectId)
    const total =
      enrichSummary.enrichedCount.character +
      enrichSummary.enrichedCount.location +
      enrichSummary.enrichedCount.item
    if (enrichSummary.failures.length > 0) {
      ElMessage.warning(
        `部分 kind 反推失败：${enrichSummary.failures.map((f) => f.kind).join(', ')}（继续生成）`,
      )
    } else {
      ElMessage.success(`AI 反推完成，写入 ${total} 项设定`)
    }
  } catch (e: any) {
    generatingAll.value = false
    ElMessage.error(`AI 反推中止：${e?.message ?? e}`)
    return
  }

  // 重新拉 summary（反推可能改了 hasMain 周边的可见字段；hasMain 本身不变，但生成依据已更新）
  await reload()

  // ── Stage 2: 主图批量生成 ──
  ElMessage.info(`② 开始为 ${tasks.length} 个资产生成主图（并发 2）`)
  let okCount = 0
  let failCount = 0
  const failures: string[] = []
  const { generateMainFor } = await import('@/api/main-image-generator')
  const concurrency = 2
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const idx = cursor++
      const t = tasks[idx]
      try {
        await generateMainFor(t.kind, t.id)
        okCount++
      } catch (e: any) {
        failCount++
        failures.push(`${t.kind}/${t.id.slice(0, 8)}: ${e?.message ?? e}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))

  await reload()
  generatingAll.value = false

  if (failCount === 0) {
    ElMessage.success(`已为 ${okCount} 个资产生成主图`)
  } else {
    ElMessage.warning(
      `主图生成完成：成功 ${okCount}，失败 ${failCount}\n${failures.slice(0, 3).join('\n')}`,
    )
  }
}
```

- [ ] **Step 10.2: 启动 dev 端跑流程**

```bash
PGDATABASE=the_bot_test npm run dev
```

进 ② 资产盘点，点"✨ 一键生成所有缺失主图"，观察：
1. 先弹 "① AI 正在为缺失主图的资产反推设定卡…"
2. AI 调用完成（console 应有 `[EpisodeProductionAI] AI 调用完成`）
3. 跳到 "② 开始为 N 个资产生成主图"
4. 卡片缩略图陆续出现，地点图无人

- [ ] **Step 10.3: 提交**

```bash
git add src/renderer/src/components/episode-production/stage-asset-v2/AssetStageViewV2.vue
git commit -m "feat(ep): ② 一键生成 = AI 反推设定 → 主图批量生成 两阶段流水线

stage 1 失败（除未配置 AI 外）不阻塞 stage 2；
stage 2 单条失败不阻塞其余，最终汇总提示。"
```

---

## Task 11: 全量回归 + 手测 + 文档同步 + 最终 commit

**Files:**
- Modify (optional): `docs/superpowers/specs/2026-05-07-ep-asset-thumbnail-and-prompt-enrichment-design.md` 末尾 DoD 勾选
- Update: 各相关 service README（如有）

- [ ] **Step 11.1: 跑全量回归**

```bash
npm test
```

预期：所有用例 PASS。如有失败先修，不带破回归提交。

- [ ] **Step 11.2: 主题切换手测**

dev 端切换暗主题，进 ② 资产盘点：
- 缩略图留白底色仍是 `var(--el-color-*-light-*)` 体系，无写死颜色
- 卡片文字 / tag / 进度条全部正常

- [ ] **Step 11.3: 双端验证**

```bash
# Web staging
curl -fsS http://localhost:4201/health   # 应该回 ok（user 启的 staging）
```

或在浏览器进 staging 跑同一路径（test@local.dev / test123456）。如 staging 不可用则跳过此步并在 commit message 注明"PC 已验，Web 留 follow-up"。

- [ ] **Step 11.4: 更新 DoD**

把 spec §9 的 DoD checkbox 全部勾选。

- [ ] **Step 11.5: 最终 commit + 收口**

```bash
git add docs/superpowers/specs/2026-05-07-ep-asset-thumbnail-and-prompt-enrichment-design.md
git commit -m "chore(ep): spec DoD 勾选 — 缩略图 / AI 反推 / 地点无人 完成

PC 全量回归 PASS；手测路径全验过；Web staging（如有）同步通过。"
```

---

## 自审记录

- [x] **Spec 覆盖**：缩略图（T1）/ location 无人（T2-T5）/ AI 反推（T6-T10）/ 收口（T11） — 全部映射到任务
- [x] **No placeholders**：每个 step 都有完整代码 / 命令；无 TBD
- [x] **类型一致性**：`CallAIFn` / `EnrichmentTodo` / `EnrichmentContext` 在 prompt 模块定义、service 引用；`EnrichSummary` 在 service 定义、renderer wrapper 复用
- [x] **TDD 节奏**：每个 service / 函数都有"写失败测试 → 跑失败 → 实现 → 跑通过 → commit"
- [x] **DRY**：约束注入只在 service 三处，不在 renderer 重复；prompt 模板独立纯函数
- [x] **YAGNI**：未做反推预览对话框、单条重新反推、allowPeople override 等（spec §8 已声明排除）
