# 剧集制作 ① 内容 + ③ 剧本合并 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把剧集制作工作台里 ① 内容识别 stage view 与 ③ 剧本 stage view 合并到一个页面（章节梗概+场景列表在原文片段下面，要素清单挪到右栏，场景与要素双向高亮联动），UI 上 stage 进度栏 6→5 段，后端 `EpisodeStatus` 枚举与 transition 顺序保持不变。

**Architecture:** 新建 `stage-content-script-v3/` 目录承接合并后的容器组件 `StageContentScriptView`（按 `episode.status` 切换 pending/scripting/readonly 三种 sub-state），右侧拆 `EntitySidebar / EntitySidebarSection / EntitySidebarItem` 三件套，场景卡顶部加 `SceneEntityChips`。`StageHeaderBar` 重写染色规则（用 `cur > min(段集合)` 而不是 max）支持合并段非单调染色。后端不动。

**Tech Stack:** Vue 3 Composition API + Pinia + Element Plus + vitest（单测）+ Playwright（E2E）+ TypeScript。

**对照 spec：** `docs/superpowers/specs/2026-05-08-content-script-merged-design.md`

---

## File Structure

### 新建（10 个）

| 路径 | 责任 |
|---|---|
| `src/renderer/src/components/episode-production/stage-content-script-v3/scene-entity-utils.ts` | `EntityRef` 类型 + `sceneContainsEntity` / `entityScenes` 工具 |
| `src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarItem.vue` | 单个 entity item（名称 + 场景号 + checkbox + source + 编辑/删除） |
| `src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarSection.vue` | 单个 kind 的 section（折叠 + 列表 + ⋯ dropdown） |
| `src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebar.vue` | 三个 section 聚合（含顶部"添加"菜单） |
| `src/renderer/src/components/episode-production/stage-content-script-v3/SceneEntityChips.vue` | 场景卡顶部 chip 行 |
| `src/renderer/src/components/episode-production/stage-content-script-v3/SynopsisPanel.vue` | 章节梗概 panel（从 stage-script-v2 拆出） |
| `src/renderer/src/components/episode-production/stage-content-script-v3/SceneListPanel.vue` | 场景列表 panel（从 stage-script-v2 拆出，含 SceneCard 子组件 + 添加/重写/修复绑定 actions） |
| `src/renderer/src/components/episode-production/stage-content-script-v3/StageContentScriptView.vue` | 合并主容器组件 |
| `src/renderer/src/components/episode-production/stage-content-script-v3/ManualAddEntityDialog.vue` | 从 stage-content-v2 迁入（路径变了，内容不变） |

### 测试（8 个）

| 路径 | 责任 |
|---|---|
| `tests/unit/renderer/components/scene-entity-utils.spec.ts` | sceneContainsEntity 三 kind + entityScenes 升序 + 负样本 |
| `tests/unit/renderer/components/StageHeaderBar-merged.spec.ts` | 合并段染色规则全态对照表（7 status × 5 段） |
| `tests/unit/renderer/components/EntitySidebarItem.spec.ts` | item 渲染 + 4 个 emit |
| `tests/unit/renderer/components/EntitySidebarSection.spec.ts` | section 折叠 + dropdown |
| `tests/unit/renderer/components/EntitySidebar.spec.ts` | 三 section 聚合 + 联动 highlight |
| `tests/unit/renderer/components/SceneEntityChips.spec.ts` | chip 渲染 + 点击 emit |
| `tests/unit/renderer/components/SynopsisPanel.spec.ts` | 梗概渲染 + 重新生成 emit |
| `tests/unit/renderer/components/SceneListPanel.spec.ts` | 场景列表 + 添加/重写/修复绑定 emit |

### 修改（2 个）

| 路径 | 改动 |
|---|---|
| `src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue` | 染色规则重写：6→5 段（合并 pending+scripting）；用 `cur > min(段集合)` 判断 complete |
| `src/renderer/src/views/EpisodeWorkbench.vue` | 删 `① 内容` + `③ 剧本` 两个 tab pane，新增合并 tab；改 `WorkbenchStage` 类型与 activeTab 默认值；当 status=scripting 时也映射到合并 tab |

### 删除（4 个）

| 路径 | 备注 |
|---|---|
| `src/renderer/src/components/episode-production/stage-content-v2/StageContentViewV2.vue` | 内容并入 v3 |
| `src/renderer/src/components/episode-production/stage-content-v2/EntityColumn.vue` | EntitySidebar 替代 |
| `src/renderer/src/components/episode-production/stage-content-v2/ManualAddEntityDialog.vue` | 已迁移到 v3 |
| `src/renderer/src/components/episode-production/stage-script-v2/StageScriptViewV2.vue` | 内容并入 v3 |

---

## Phase 1 · 工具 + StageHeaderBar 重渲染

### Task 1：`scene-entity-utils.ts` 工具函数 + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/scene-entity-utils.ts`
- Create: `tests/unit/renderer/components/scene-entity-utils.spec.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/renderer/components/scene-entity-utils.spec.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import {
  sceneContainsEntity,
  entityScenes,
} from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/scene-entity-utils'
import type { SceneScript } from '../../../../src/shared/types/episode-production/narrative.types'

function makeScene(overrides: Partial<SceneScript>): SceneScript {
  return {
    id: 's1',
    episodeScriptId: 'ep1',
    sceneNumber: 1,
    location: '客栈',
    locationType: 'interior' as any,
    timeOfDay: 'night' as any,
    sceneDescription: '',
    mood: '',
    characters: [],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('sceneContainsEntity', () => {
  it('character 通过 characterId 命中', () => {
    const s = makeScene({
      characters: [{ characterId: 'c1', characterName: '张三' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'character', name: '张三', id: 'c1' })).toBe(true)
  })

  it('character 通过 characterName 命中', () => {
    const s = makeScene({
      characters: [{ characterId: 'cx', characterName: '张三' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'character', name: '张三' })).toBe(true)
  })

  it('character 通过 characterBindingId 命中', () => {
    const s = makeScene({
      characters: [{ characterBindingId: 'cb1', characterId: 'cx', characterName: 'x' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'character', name: 'x', id: 'cb1' })).toBe(true)
  })

  it('location 通过 name 命中', () => {
    const s = makeScene({ location: '客栈' })
    expect(sceneContainsEntity(s, { kind: 'location', name: '客栈' })).toBe(true)
  })

  it('location 通过 locationBindingId 命中', () => {
    const s = makeScene({ location: '其他名', locationBindingId: 'lb1' })
    expect(sceneContainsEntity(s, { kind: 'location', name: 'x', id: 'lb1' })).toBe(true)
  })

  it('item 通过 SceneCharacter.props 字符串命中', () => {
    const s = makeScene({
      characters: [{ characterId: 'c1', characterName: '张三', props: ['长剑'] } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: '长剑' })).toBe(true)
  })

  it('item 通过 SceneCharacter.props ScenePropRef.itemBindingId 命中', () => {
    const s = makeScene({
      characters: [
        { characterId: 'c1', characterName: '张三', props: [{ itemBindingId: 'ib1', name: 'x' }] } as any,
      ],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: 'x', id: 'ib1' })).toBe(true)
  })

  it('item 通过文本 @name 引用兜底命中（actions[].description）', () => {
    const s = makeScene({
      actions: [{ id: 'a1', description: '掏出 @长剑 砍下', timing: 'during' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: '长剑' })).toBe(true)
  })

  it('item 通过文本 @name 引用兜底命中（dialogues[].text）', () => {
    const s = makeScene({
      dialogues: [{ id: 'd1', characterId: 'c1', characterName: '张三', text: '把 @长剑 给我' } as any],
    })
    expect(sceneContainsEntity(s, { kind: 'item', name: '长剑' })).toBe(true)
  })

  it('全部不命中返回 false', () => {
    const s = makeScene({})
    expect(sceneContainsEntity(s, { kind: 'character', name: '不存在' })).toBe(false)
    expect(sceneContainsEntity(s, { kind: 'location', name: '不存在' })).toBe(false)
    expect(sceneContainsEntity(s, { kind: 'item', name: '不存在' })).toBe(false)
  })
})

describe('entityScenes', () => {
  it('返回升序场景编号数组', () => {
    const s1 = makeScene({ sceneNumber: 1, location: '客栈' })
    const s2 = makeScene({ sceneNumber: 2, location: '湖边' })
    const s3 = makeScene({ sceneNumber: 3, location: '客栈' })
    const list = entityScenes({ kind: 'location', name: '客栈' }, [s1, s2, s3])
    expect(list).toEqual([1, 3])
  })

  it('无场景返回 []', () => {
    expect(entityScenes({ kind: 'location', name: 'x' }, [])).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/scene-entity-utils.spec.ts
```
Expected: FAIL（"Cannot find module .../scene-entity-utils"）

- [ ] **Step 3: 写实现**

`src/renderer/src/components/episode-production/stage-content-script-v3/scene-entity-utils.ts`：

```typescript
/**
 * scene-entity-utils · 场景与要素的反查工具
 *
 * 给定一个 EntityRef（角色/地点/物品），判断它出现于哪个场景；
 * 用于合并页右侧要素 sidebar 显示出场场景号 + 联动高亮。
 */
import type {
  SceneScript,
  ScenePropRef,
} from '../../../../../shared/types/episode-production/narrative.types'

export type EntityKind = 'character' | 'location' | 'item'

export interface EntityRef {
  kind: EntityKind
  name: string
  /** 对 character/item 是 binding id（如已绑），对 location 是 location_binding id */
  id?: string
}

/**
 * 判断某场景是否包含某 entity。
 *
 * - character：扫 scene.characters[]，通过 characterId / characterName / characterBindingId 任一命中即 true
 * - location：scene.location 名匹配 或 scene.locationBindingId 匹配
 * - item：先扫 SceneCharacter.props[]（含字符串名 + ScenePropRef 两种格式），
 *        命中即 true；否则扫场景所有文本字段（originalText / narration / dialogues[].text /
 *        actions[].description）中的 `@${name}` 引用兜底
 */
export function sceneContainsEntity(scene: SceneScript, entity: EntityRef): boolean {
  if (entity.kind === 'character') {
    return (scene.characters ?? []).some(
      (c) =>
        c.characterId === entity.id ||
        c.characterName === entity.name ||
        c.characterBindingId === entity.id,
    )
  }
  if (entity.kind === 'location') {
    return scene.location === entity.name || scene.locationBindingId === entity.id
  }
  // item
  for (const c of scene.characters ?? []) {
    for (const p of c.props ?? []) {
      if (typeof p === 'string' && p === entity.name) return true
      if (
        typeof p === 'object' &&
        ((p as ScenePropRef).itemBindingId === entity.id ||
          (p as ScenePropRef).name === entity.name)
      ) {
        return true
      }
    }
  }
  const corpus = [
    scene.originalText ?? '',
    scene.narration ?? '',
    ...(scene.dialogues?.map((d) => d.text) ?? []),
    ...(scene.actions?.map((a) => a.description) ?? []),
  ].join(' ')
  return corpus.includes(`@${entity.name}`)
}

/**
 * 返回 entity 出场的场景编号（升序）。
 *
 * 用 scene.sceneNumber（不是数组 index），保持与场景显示一致。
 */
export function entityScenes(entity: EntityRef, scenes: SceneScript[]): number[] {
  return scenes
    .filter((s) => sceneContainsEntity(s, entity))
    .map((s) => s.sceneNumber)
    .sort((a, b) => a - b)
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/scene-entity-utils.spec.ts
```
Expected: PASS（12 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/scene-entity-utils.ts tests/unit/renderer/components/scene-entity-utils.spec.ts
git commit -m "feat(ep): 新增 scene-entity-utils 工具函数（场景↔要素反查）"
```

---

### Task 2：StageHeaderBar 6→5 段染色重写 + 单测

**Files:**
- Modify: `src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue`
- Create: `tests/unit/renderer/components/StageHeaderBar-merged.spec.ts`

> 当前 StageHeaderBar 用后端返回的 6 个 stage（不含 completed）+ `progress.stages[i].mark` 直接染色。改为：在前端把 pending+scripting 合并为一个 segment，用 § 2.1 规则前端自算 mark。

- [ ] **Step 1: 写失败测试**

`tests/unit/renderer/components/StageHeaderBar-merged.spec.ts`：

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StageHeaderBar from '../../../../src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue'
import type { EpisodeStatus } from '../../../../src/shared/types/episode-production'

const MERGED_LABELS = ['内容+剧本', '资产', '分镜', '制作', '合成']

function mockEp(currentStatus: EpisodeStatus) {
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(globalThis as any).window.electronAPI = {
    episodeProduction: {
      calculateEpisodeProgress: vi.fn(async () => ({
        success: true,
        data: {
          episodeId: 'ep-1',
          currentStatus,
          stages: [
            { stage: 'pending', label: '内容', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'asset_prep', label: '资产', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'scripting', label: '剧本', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'storyboarding', label: '分镜', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'producing', label: '制作', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'composing', label: '合成', mark: '○', complete: false, progress: 0, gapCount: 0 },
          ],
          overallProgress: 0,
        },
      })),
    },
  }
}

async function mountAndGetSegs(currentStatus: EpisodeStatus) {
  mockEp(currentStatus)
  const w = mount(StageHeaderBar, {
    props: { episodeId: 'ep-1' },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w.findAll('.stage-segment')
}

describe('StageHeaderBar 合并段（6→5）', () => {
  it('渲染 5 个 segment，标签依次是 内容+剧本/资产/分镜/制作/合成', async () => {
    const segs = await mountAndGetSegs('pending')
    expect(segs).toHaveLength(5)
    segs.forEach((seg, i) => {
      expect(seg.text()).toContain(MERGED_LABELS[i])
    })
  })

  // 染色对照表（来自 spec § 2.1）
  const cases: Array<[EpisodeStatus, string[]]> = [
    ['pending',       ['stage-current',  'stage-pending',  'stage-pending',  'stage-pending',  'stage-pending']],
    ['asset_prep',    ['stage-complete', 'stage-current',  'stage-pending',  'stage-pending',  'stage-pending']],
    ['scripting',     ['stage-current',  'stage-complete', 'stage-pending',  'stage-pending',  'stage-pending']],
    ['storyboarding', ['stage-complete', 'stage-complete', 'stage-current',  'stage-pending',  'stage-pending']],
    ['producing',     ['stage-complete', 'stage-complete', 'stage-complete', 'stage-current',  'stage-pending']],
    ['composing',     ['stage-complete', 'stage-complete', 'stage-complete', 'stage-complete', 'stage-current']],
    ['completed',     ['stage-complete', 'stage-complete', 'stage-complete', 'stage-complete', 'stage-current']],
  ]

  for (const [status, expected] of cases) {
    it(`status=${status} 染色对：${expected.join(',')}`, async () => {
      const segs = await mountAndGetSegs(status)
      const actual = segs.map((s) =>
        ['stage-complete', 'stage-current', 'stage-pending'].find((c) => s.classes().includes(c)),
      )
      expect(actual).toEqual(expected)
    })
  }

  it('点击合并段 emit navigate-stage 用 pending（合并段集合 min）', async () => {
    const segs = await mountAndGetSegs('scripting')
    const w = segs[0].element.parentElement
    // emitted by component instance — 重新拿 wrapper
    mockEp('scripting')
    const wrapper = mount(StageHeaderBar, {
      props: { episodeId: 'ep-1' },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    await wrapper.findAll('.stage-segment')[0].trigger('click')
    expect(wrapper.emitted('navigate-stage')).toBeTruthy()
    expect(wrapper.emitted('navigate-stage')![0]).toEqual(['pending'])
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/StageHeaderBar-merged.spec.ts
```
Expected: FAIL（当前组件返回 6 个 segment，不是 5 个）

- [ ] **Step 3: 重写组件**

`src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue` 替换 template 与 script 的染色 / 渲染逻辑（保留 props/emits/expose 接口与 style 结构）：

```vue
<template>
  <div class="stage-header-bar">
    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="errorMessage" class="error">{{ errorMessage }}</div>
    <template v-else-if="progress">
      <div
        v-for="(seg, idx) in mergedSegments"
        :key="seg.label"
        class="stage-segment"
        :class="seg.cssClass"
        :title="seg.label"
        @click="onClick(seg.clickStatus)"
      >
        <span class="stage-label">{{ seg.label }}</span>
        <span v-if="idx + 1 !== mergedSegments.length" class="stage-sep">│</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type {
  EpisodeProgress,
  EpisodeStatus,
} from '../../../../../shared/types/episode-production'

const props = defineProps<{ episodeId: string | null }>()

const emit = defineEmits<{
  (e: 'navigate-stage', status: EpisodeStatus): void
}>()

const progress = ref<EpisodeProgress | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * 合并段定义（spec 2026-05-08-content-script-merged §2.1）
 *
 * 6 个生产 status + 1 个 completed 终态映射到 5 个 UI 段：
 *   { pending, scripting } → 内容+剧本
 *   { asset_prep }         → 资产
 *   { storyboarding }      → 分镜
 *   { producing }          → 制作
 *   { composing, completed } → 合成
 *
 * clickStatus 是该段被点击时 emit 的 status（取段集合中的代表元，
 * 选 min order 让 stage-gate 走"回到该段第一个 sub-state"）
 */
interface MergedSegment {
  label: string
  statuses: EpisodeStatus[]
  clickStatus: EpisodeStatus
}

const STAGE_ORDER: Record<EpisodeStatus, number> = {
  pending: 0,
  asset_prep: 1,
  scripting: 2,
  storyboarding: 3,
  producing: 4,
  composing: 5,
  completed: 6,
}

const SEGMENTS: MergedSegment[] = [
  { label: '内容+剧本', statuses: ['pending', 'scripting'], clickStatus: 'pending' },
  { label: '资产', statuses: ['asset_prep'], clickStatus: 'asset_prep' },
  { label: '分镜', statuses: ['storyboarding'], clickStatus: 'storyboarding' },
  { label: '制作', statuses: ['producing'], clickStatus: 'producing' },
  { label: '合成', statuses: ['composing', 'completed'], clickStatus: 'composing' },
]

const mergedSegments = computed(() => {
  const cur = progress.value?.currentStatus
  if (!cur) return []
  const curOrd = STAGE_ORDER[cur]
  return SEGMENTS.map((seg) => {
    const ords = seg.statuses.map((s) => STAGE_ORDER[s])
    const minOrd = Math.min(...ords)
    const inSet = seg.statuses.includes(cur)
    let cssClass: 'stage-current' | 'stage-complete' | 'stage-pending'
    if (inSet) cssClass = 'stage-current'
    else if (curOrd > minOrd) cssClass = 'stage-complete'
    else cssClass = 'stage-pending'
    return { ...seg, cssClass }
  })
})

function onClick(status: EpisodeStatus): void {
  emit('navigate-stage', status)
}

async function loadProgress(): Promise<void> {
  if (!props.episodeId) {
    progress.value = null
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.calculateEpisodeProgress) {
      throw new Error('IPC calculateEpisodeProgress 未暴露')
    }
    const resp = await api.calculateEpisodeProgress(props.episodeId)
    if (!resp?.success) throw new Error(resp?.error || '获取阶段进度失败')
    progress.value = resp.data as EpisodeProgress
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
}

watch(() => props.episodeId, () => loadProgress())
onMounted(loadProgress)

defineExpose({ reload: loadProgress })
</script>
```

style 块保持不变（不动 .stage-segment / .stage-label / .stage-sep / 颜色）。

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/StageHeaderBar-merged.spec.ts tests/unit/renderer/components/StageHeaderBar.spec.ts
```
Expected: 新 spec 8 个 it 全绿；旧 StageHeaderBar.spec.ts（来自上一份 redesign）可能有 1-2 个用例红（因为它假设 6 段），如有调整旧 spec 让它接受新接口（详见下一 step）

- [ ] **Step 5: 修旧 StageHeaderBar.spec.ts**

打开 `tests/unit/renderer/components/StageHeaderBar.spec.ts`，把"渲染 6 段文字 label"的断言改为 5 段（label 用合并段标签）；把"3 态颜色"测试改为对照表中的某个状态（建议保持原 scripting 用例，但断言"内容+剧本是 current，资产是 complete"）。如果旧测试断言冲突过多，整文件以新 spec 替代。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue tests/unit/renderer/components/StageHeaderBar-merged.spec.ts tests/unit/renderer/components/StageHeaderBar.spec.ts
git commit -m "feat(ep): StageHeaderBar 合并段重渲染（6→5 段，染色用 cur > min(段集合)）"
```

---

## Phase 2 · EntitySidebar 三件套

### Task 3：`EntitySidebarItem.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarItem.vue`
- Create: `tests/unit/renderer/components/EntitySidebarItem.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
/** EntitySidebarItem 单测：渲染 + 4 个 emit + readonly + highlight */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EntitySidebarItem from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarItem.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const sample = {
  id: 'c1',
  name: '张三',
  confirmed: true,
  sourceType: 'standalone' as const,
  description: '主角',
}

describe('EntitySidebarItem', () => {
  it('渲染名称 + 场景号 + sourceTag', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1, 2] },
      ...mountOpts,
    })
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('(1, 2)')
  })

  it('无场景显示 (-)', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [] },
      ...mountOpts,
    })
    expect(w.text()).toContain('(-)')
  })

  it('点击 item 触发 click emit', async () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1] },
      ...mountOpts,
    })
    await w.find('.entity-item').trigger('click')
    expect(w.emitted('click')).toBeTruthy()
  })

  it('checkbox 切换触发 toggle emit', async () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1] },
      ...mountOpts,
    })
    await w.find('input[type="checkbox"]').setValue(false)
    expect(w.emitted('toggle')).toBeTruthy()
  })

  it('hover 编辑/删除按钮触发对应 emit', async () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1] },
      ...mountOpts,
    })
    await w.find('.btn-edit').trigger('click')
    expect(w.emitted('edit')).toBeTruthy()
    await w.find('.btn-delete').trigger('click')
    expect(w.emitted('delete')).toBeTruthy()
  })

  it('readonly 时不显示操作按钮', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1], readonly: true },
      ...mountOpts,
    })
    expect(w.find('.btn-edit').exists()).toBe(false)
    expect(w.find('.btn-delete').exists()).toBe(false)
    expect(w.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
  })

  it('highlighted prop 加 highlighted class', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1], highlighted: true },
      ...mountOpts,
    })
    expect(w.find('.entity-item').classes()).toContain('highlighted')
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/EntitySidebarItem.spec.ts
```
Expected: FAIL（"Cannot find module .../EntitySidebarItem.vue"）

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarItem.vue`：

```vue
<template>
  <li
    class="entity-item"
    :class="{ confirmed: entity.confirmed, dimmed: !entity.confirmed, highlighted }"
    @click="onItemClick"
  >
    <el-checkbox
      :model-value="!!entity.confirmed"
      :disabled="readonly"
      class="entity-check"
      @click.stop
      @change="$emit('toggle')"
    />
    <div class="entity-body">
      <div class="entity-name-row">
        <span class="entity-name" :title="entity.name">{{ entity.name }}</span>
        <span class="entity-scenes">
          <template v-if="sceneNumbers.length > 0">({{ sceneNumbers.join(', ') }})</template>
          <template v-else>(-)</template>
        </span>
      </div>
      <div class="entity-meta">
        <AssetSourceTag
          :source="(entity.sourceType ?? 'standalone') as 'linked_lw' | 'standalone'"
          size="small"
          effect="light"
        />
        <a
          v-if="!readonly"
          class="action-link"
          @click.stop="$emit('toggle-source')"
        >改 source</a>
      </div>
    </div>
    <span v-if="!readonly" class="hover-actions">
      <button class="btn-edit" :title="`编辑 ${entity.name}`" @click.stop="$emit('edit')">
        <el-icon><EditPen /></el-icon>
      </button>
      <button class="btn-delete" :title="`删除 ${entity.name}`" @click.stop="$emit('delete')">
        <el-icon><Delete /></el-icon>
      </button>
    </span>
  </li>
</template>

<script setup lang="ts">
import { EditPen, Delete } from '@element-plus/icons-vue'
import AssetSourceTag from '../shared/AssetSourceTag.vue'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'

defineOptions({ name: 'EntitySidebarItem' })

type AnyEntity = UploadedCharacter | UploadedLocation | UploadedItem

defineProps<{
  entity: AnyEntity
  kind: 'character' | 'location' | 'item'
  sceneNumbers: number[]
  readonly?: boolean
  highlighted?: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'toggle'): void
  (e: 'toggle-source'): void
  (e: 'edit'): void
  (e: 'delete'): void
}>()

function onItemClick(): void {
  emit('click')
}
</script>

<style scoped lang="scss">
.entity-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  list-style: none;
}

.entity-item:hover {
  background: var(--el-fill-color-lighter);
}

.entity-item:hover .hover-actions {
  opacity: 1;
}

.entity-item.dimmed {
  opacity: 0.55;
}

.entity-item.highlighted {
  background: var(--el-color-warning-light-9);
  outline: 1px solid var(--el-color-warning-light-5);
}

.entity-check {
  flex-shrink: 0;
  margin-top: 2px;
}

.entity-body {
  flex: 1;
  min-width: 0;
}

.entity-name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.entity-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-scenes {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.entity-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 11px;
}

.action-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: none;
}

.action-link:hover {
  text-decoration: underline;
}

.hover-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.hover-actions button {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.hover-actions .btn-edit:hover {
  background: var(--el-color-primary);
}

.hover-actions .btn-delete:hover {
  background: var(--el-color-danger);
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/EntitySidebarItem.spec.ts
```
Expected: PASS（7 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarItem.vue tests/unit/renderer/components/EntitySidebarItem.spec.ts
git commit -m "feat(ep): 新增 EntitySidebarItem 组件"
```

---

### Task 4：`EntitySidebarSection.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarSection.vue`
- Create: `tests/unit/renderer/components/EntitySidebarSection.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
/** EntitySidebarSection 单测：折叠 + dropdown 命令 + 透传 item emit */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EntitySidebarSection from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarSection.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const samples = [
  { id: 'c1', name: '张三', confirmed: true, sourceType: 'standalone' as const },
  { id: 'c2', name: '李四', confirmed: false, sourceType: 'linked_lw' as const },
]

describe('EntitySidebarSection', () => {
  it('显示标题 + 数量', () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    expect(w.text()).toContain('角色')
    expect(w.text()).toContain('(2)')
  })

  it('默认展开，渲染 item 列表', () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    expect(w.findAllComponents({ name: 'EntitySidebarItem' })).toHaveLength(2)
  })

  it('点击 header 折叠隐藏 item', async () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    await w.find('.section-header').trigger('click')
    expect(w.findAllComponents({ name: 'EntitySidebarItem' })).toHaveLength(0)
  })

  it('空数组显示空 hint', () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: [], scenes: [] },
      ...mountOpts,
    })
    expect(w.text()).toContain('未识别到角色')
  })

  it('item 透传 click → emit click-entity 携带 EntityRef', async () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    const items = w.findAllComponents({ name: 'EntitySidebarItem' })
    await items[0].vm.$emit('click')
    expect(w.emitted('click-entity')).toBeTruthy()
    expect(w.emitted('click-entity')![0][0]).toMatchObject({ kind: 'character', name: '张三' })
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/EntitySidebarSection.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarSection.vue`：

```vue
<template>
  <section class="entity-section">
    <header class="section-header" @click="expanded = !expanded">
      <el-icon class="toggle-icon" :class="{ expanded }">
        <ArrowRight />
      </el-icon>
      <span class="section-icon">{{ icon }}</span>
      <span class="section-title">{{ title }}</span>
      <span class="section-count">({{ entities.length }})</span>
      <span class="section-actions">
        <el-dropdown
          v-if="!readonly"
          trigger="click"
          @command="onCommand"
          @click.stop
        >
          <el-button link size="small" class="more-btn" @click.stop>
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="reidentify">重新识别{{ title }}</el-dropdown-item>
              <el-dropdown-item command="add" divided>+ 添加{{ title }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </span>
    </header>
    <ul v-if="expanded" class="section-list">
      <li v-if="entities.length === 0" class="empty-hint">
        未识别到{{ title }}
      </li>
      <EntitySidebarItem
        v-for="(entity, idx) in entities"
        :key="entity.id ?? idx"
        :entity="entity"
        :kind="kind"
        :scene-numbers="getSceneNumbers(entity)"
        :readonly="readonly"
        :highlighted="isHighlighted(entity)"
        @click="onItemClick(entity)"
        @toggle="$emit('toggle', kind, idx)"
        @toggle-source="$emit('toggle-source', kind, idx)"
        @edit="$emit('edit', kind, idx)"
        @delete="$emit('delete', kind, idx)"
      />
    </ul>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, MoreFilled } from '@element-plus/icons-vue'
import EntitySidebarItem from './EntitySidebarItem.vue'
import { entityScenes, sceneContainsEntity } from './scene-entity-utils'
import type { EntityRef } from './scene-entity-utils'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'
import type { SceneScript } from '../../../../../shared/types/episode-production/narrative.types'

defineOptions({ name: 'EntitySidebarSection' })

type AnyEntity = UploadedCharacter | UploadedLocation | UploadedItem
type Kind = 'character' | 'location' | 'item'

const props = defineProps<{
  kind: Kind
  icon: string
  title: string
  entities: AnyEntity[]
  scenes: SceneScript[]
  readonly?: boolean
  highlightedSceneId?: string | null
}>()

const emit = defineEmits<{
  (e: 'click-entity', entity: EntityRef): void
  (e: 'toggle', kind: Kind, idx: number): void
  (e: 'toggle-source', kind: Kind, idx: number): void
  (e: 'edit', kind: Kind, idx: number): void
  (e: 'delete', kind: Kind, idx: number): void
  (e: 'reidentify', kind: Kind): void
  (e: 'add', kind: Kind): void
}>()

const expanded = ref(true)

function entityRefOf(entity: AnyEntity): EntityRef {
  return { kind: props.kind, name: entity.name, id: entity.id }
}

function getSceneNumbers(entity: AnyEntity): number[] {
  return entityScenes(entityRefOf(entity), props.scenes)
}

function isHighlighted(entity: AnyEntity): boolean {
  if (!props.highlightedSceneId) return false
  const scene = props.scenes.find((s) => s.id === props.highlightedSceneId)
  if (!scene) return false
  return sceneContainsEntity(scene, entityRefOf(entity))
}

function onItemClick(entity: AnyEntity): void {
  emit('click-entity', entityRefOf(entity))
}

function onCommand(command: string): void {
  if (command === 'reidentify') emit('reidentify', props.kind)
  else if (command === 'add') emit('add', props.kind)
}
</script>

<style scoped lang="scss">
.entity-section {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  background: var(--el-fill-color-lighter);
}

.toggle-icon {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: transform 0.15s;
}

.toggle-icon.expanded {
  transform: rotate(90deg);
}

.section-icon {
  font-size: 14px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.section-actions {
  margin-left: auto;
}

.section-list {
  margin: 0;
  padding: 4px 4px;
  list-style: none;
}

.empty-hint {
  padding: 12px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  list-style: none;
}
</style>
```


- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/EntitySidebarSection.spec.ts
```
Expected: PASS（5 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarSection.vue tests/unit/renderer/components/EntitySidebarSection.spec.ts
git commit -m "feat(ep): 新增 EntitySidebarSection 组件"
```

---

### Task 5：`EntitySidebar.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebar.vue`
- Create: `tests/unit/renderer/components/EntitySidebar.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
/** EntitySidebar 单测：三个 section 聚合 + 联动 emit */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EntitySidebar from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebar.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

describe('EntitySidebar', () => {
  it('渲染三个 section', () => {
    const w = mount(EntitySidebar, {
      props: {
        characters: [{ id: 'c1', name: '张三' }],
        locations: [{ id: 'l1', name: '客栈' }],
        items: [{ id: 'i1', name: '长剑' }],
        scenes: [],
        highlightedEntity: null,
        highlightedSceneId: null,
      },
      ...mountOpts,
    })
    expect(w.findAllComponents({ name: 'EntitySidebarSection' })).toHaveLength(3)
    expect(w.text()).toContain('角色')
    expect(w.text()).toContain('地点')
    expect(w.text()).toContain('物品')
  })

  it('section emit click-entity 透传到外', async () => {
    const w = mount(EntitySidebar, {
      props: {
        characters: [{ id: 'c1', name: '张三' }],
        locations: [],
        items: [],
        scenes: [],
        highlightedEntity: null,
        highlightedSceneId: null,
      },
      ...mountOpts,
    })
    const sections = w.findAllComponents({ name: 'EntitySidebarSection' })
    await sections[0].vm.$emit('click-entity', { kind: 'character', name: '张三', id: 'c1' })
    expect(w.emitted('click-entity')).toBeTruthy()
    expect(w.emitted('click-entity')![0][0]).toEqual({ kind: 'character', name: '张三', id: 'c1' })
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/EntitySidebar.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebar.vue`：

```vue
<template>
  <aside class="entity-sidebar">
    <header class="sidebar-header">
      <span class="sidebar-title">要素清单</span>
    </header>
    <div class="sidebar-body">
      <EntitySidebarSection
        kind="character"
        icon="👤"
        title="角色"
        :entities="characters"
        :scenes="scenes"
        :readonly="readonly"
        :highlighted-scene-id="highlightedSceneId"
        @click-entity="$emit('click-entity', $event)"
        @toggle="(k, i) => $emit('toggle', k, i)"
        @toggle-source="(k, i) => $emit('toggle-source', k, i)"
        @edit="(k, i) => $emit('edit', k, i)"
        @delete="(k, i) => $emit('delete', k, i)"
        @reidentify="(k) => $emit('reidentify', k)"
        @add="(k) => $emit('add', k)"
      />
      <EntitySidebarSection
        kind="location"
        icon="🏛"
        title="地点"
        :entities="locations"
        :scenes="scenes"
        :readonly="readonly"
        :highlighted-scene-id="highlightedSceneId"
        @click-entity="$emit('click-entity', $event)"
        @toggle="(k, i) => $emit('toggle', k, i)"
        @toggle-source="(k, i) => $emit('toggle-source', k, i)"
        @edit="(k, i) => $emit('edit', k, i)"
        @delete="(k, i) => $emit('delete', k, i)"
        @reidentify="(k) => $emit('reidentify', k)"
        @add="(k) => $emit('add', k)"
      />
      <EntitySidebarSection
        kind="item"
        icon="⚔️"
        title="物品"
        :entities="items"
        :scenes="scenes"
        :readonly="readonly"
        :highlighted-scene-id="highlightedSceneId"
        @click-entity="$emit('click-entity', $event)"
        @toggle="(k, i) => $emit('toggle', k, i)"
        @toggle-source="(k, i) => $emit('toggle-source', k, i)"
        @edit="(k, i) => $emit('edit', k, i)"
        @delete="(k, i) => $emit('delete', k, i)"
        @reidentify="(k) => $emit('reidentify', k)"
        @add="(k) => $emit('add', k)"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import EntitySidebarSection from './EntitySidebarSection.vue'
import type { EntityRef } from './scene-entity-utils'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'
import type { SceneScript } from '../../../../../shared/types/episode-production/narrative.types'

defineOptions({ name: 'EntitySidebar' })

type Kind = 'character' | 'location' | 'item'

defineProps<{
  characters: UploadedCharacter[]
  locations: UploadedLocation[]
  items: UploadedItem[]
  scenes: SceneScript[]
  highlightedEntity: EntityRef | null
  highlightedSceneId: string | null
  readonly?: boolean
}>()

defineEmits<{
  (e: 'click-entity', entity: EntityRef): void
  (e: 'toggle', kind: Kind, idx: number): void
  (e: 'toggle-source', kind: Kind, idx: number): void
  (e: 'edit', kind: Kind, idx: number): void
  (e: 'delete', kind: Kind, idx: number): void
  (e: 'reidentify', kind: Kind): void
  (e: 'add', kind: Kind): void
}>()
</script>

<style scoped lang="scss">
.entity-sidebar {
  width: 320px;
  min-width: 280px;
  max-width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sidebar-body {
  flex: 1;
  overflow: auto;
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/EntitySidebar.spec.ts
```
Expected: PASS（2 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebar.vue tests/unit/renderer/components/EntitySidebar.spec.ts
git commit -m "feat(ep): 新增 EntitySidebar 主组件"
```

---

### Task 6：`SceneEntityChips.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/SceneEntityChips.vue`
- Create: `tests/unit/renderer/components/SceneEntityChips.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SceneEntityChips from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/SceneEntityChips.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

describe('SceneEntityChips', () => {
  it('渲染所有 chip', () => {
    const w = mount(SceneEntityChips, {
      props: {
        chips: [
          { kind: 'character', name: '张三', id: 'c1' },
          { kind: 'location', name: '客栈', id: 'l1' },
          { kind: 'item', name: '长剑' },
        ],
      },
      ...mountOpts,
    })
    expect(w.findAll('.entity-chip')).toHaveLength(3)
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('客栈')
    expect(w.text()).toContain('长剑')
  })

  it('点击 chip 触发 click-entity emit 携带 EntityRef', async () => {
    const w = mount(SceneEntityChips, {
      props: {
        chips: [{ kind: 'character', name: '张三', id: 'c1' }],
      },
      ...mountOpts,
    })
    await w.find('.entity-chip').trigger('click')
    expect(w.emitted('click-entity')).toBeTruthy()
    expect(w.emitted('click-entity')![0][0]).toEqual({ kind: 'character', name: '张三', id: 'c1' })
  })

  it('空列表不渲染', () => {
    const w = mount(SceneEntityChips, { props: { chips: [] }, ...mountOpts })
    expect(w.findAll('.entity-chip')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/SceneEntityChips.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/stage-content-script-v3/SceneEntityChips.vue`：

```vue
<template>
  <div class="scene-entity-chips" v-if="chips.length > 0">
    <button
      v-for="(chip, idx) in chips"
      :key="`${chip.kind}-${chip.id ?? chip.name}-${idx}`"
      class="entity-chip"
      :class="`chip-${chip.kind}`"
      :title="chipTitle(chip)"
      @click.stop="$emit('click-entity', chip)"
    >
      <span class="chip-icon">{{ chipIcon(chip.kind) }}</span>
      <span class="chip-name">{{ chip.name }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { EntityRef } from './scene-entity-utils'

defineOptions({ name: 'SceneEntityChips' })

defineProps<{ chips: EntityRef[] }>()

defineEmits<{
  (e: 'click-entity', entity: EntityRef): void
}>()

function chipIcon(kind: 'character' | 'location' | 'item'): string {
  return kind === 'character' ? '👤' : kind === 'location' ? '🏛' : '⚔️'
}

function chipTitle(chip: EntityRef): string {
  const label = chip.kind === 'character' ? '角色' : chip.kind === 'location' ? '地点' : '物品'
  return `${label}：${chip.name}（点击高亮该要素的所有出场场景）`
}
</script>

<style scoped lang="scss">
.scene-entity-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  overflow-x: auto;
}

.entity-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  font-size: 11px;
  color: var(--el-text-color-regular);
  font-family: inherit;
  transition: all 0.15s;
  white-space: nowrap;
}

.entity-chip:hover {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.chip-icon {
  font-size: 12px;
}

.chip-character { color: var(--el-color-primary); }
.chip-location { color: var(--el-color-warning); }
.chip-item { color: var(--el-color-success); }
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/SceneEntityChips.spec.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/SceneEntityChips.vue tests/unit/renderer/components/SceneEntityChips.spec.ts
git commit -m "feat(ep): 新增 SceneEntityChips 场景卡顶部要素 chip"
```

---

## Phase 3 · 子组件迁移（梗概 / 场景列表）

### Task 7：`SynopsisPanel.vue` 拆出 + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/SynopsisPanel.vue`
- Create: `tests/unit/renderer/components/SynopsisPanel.spec.ts`

> 从 `stage-script-v2/StageScriptViewV2.vue` 模板的"章节梗概 panel"段（约 line 67-85）拆出来作为独立组件。逻辑（onRegenSynopsis）保留在父容器，本组件只管渲染 + emit 重新生成。

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SynopsisPanel from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/SynopsisPanel.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

describe('SynopsisPanel', () => {
  it('渲染梗概文本（含 EntityRefRenderer）', () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: '@张三 在 @客栈 喝酒', entities: [], readonly: false },
      ...mountOpts,
    })
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('客栈')
  })

  it('梗概为空显示提示', () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: '', entities: [], readonly: false },
      ...mountOpts,
    })
    expect(w.text()).toContain('梗概为空')
  })

  it('点击 [✨ 重新生成] 触发 regenerate emit', async () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: 'x', entities: [], readonly: false },
      ...mountOpts,
    })
    await w.find('.btn-regen').trigger('click')
    expect(w.emitted('regenerate')).toBeTruthy()
  })

  it('readonly 时不显示 [重新生成]', () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: 'x', entities: [], readonly: true },
      ...mountOpts,
    })
    expect(w.find('.btn-regen').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/SynopsisPanel.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/stage-content-script-v3/SynopsisPanel.vue`：

```vue
<template>
  <section class="synopsis-panel">
    <header class="panel-header">
      <span class="panel-title">章节梗概</span>
      <el-button
        v-if="!readonly"
        size="small"
        class="btn-regen"
        :loading="regenerating"
        @click="$emit('regenerate')"
      >
        <el-icon><Refresh /></el-icon>
        ✨ AI 重新生成
      </el-button>
    </header>
    <div v-if="synopsis" class="synopsis-body">
      <EntityRefRenderer :text="synopsis" :entities="entities" @click-entity="$emit('click-entity', $event)" />
    </div>
    <div v-else class="synopsis-empty">
      梗概为空 — 点上方"重新生成"或在内容 sub-state 完成识别后自动生成
    </div>
  </section>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'

defineOptions({ name: 'SynopsisPanel' })

defineProps<{
  synopsis: string
  entities: any[]
  readonly?: boolean
  regenerating?: boolean
}>()

defineEmits<{
  (e: 'regenerate'): void
  (e: 'click-entity', meta: any): void
}>()
</script>

<style scoped lang="scss">
.synopsis-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.synopsis-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.synopsis-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 8px 0;
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/SynopsisPanel.spec.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/SynopsisPanel.vue tests/unit/renderer/components/SynopsisPanel.spec.ts
git commit -m "feat(ep): 新增 SynopsisPanel 章节梗概组件（从 stage-script-v2 拆出）"
```

---

### Task 8：`SceneListPanel.vue` 拆出 + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/SceneListPanel.vue`
- Create: `tests/unit/renderer/components/SceneListPanel.spec.ts`

> 从 `stage-script-v2/StageScriptViewV2.vue` 拆出"场景列表 panel"段。组件接收 scenes + entities + highlightedEntity，渲染场景卡列表（每张卡含 SceneEntityChips），暴露 expand / edit-scene / add-scene / rewrite-scenes / fix-bindings / click-entity 等 emit。

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SceneListPanel from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/SceneListPanel.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const scenes = [
  {
    id: 's1',
    sceneNumber: 1,
    location: '客栈',
    timeOfDay: 'night',
    weather: null,
    characters: [{ characterId: 'c1', characterName: '张三' }],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
  },
  {
    id: 's2',
    sceneNumber: 2,
    location: '湖边',
    timeOfDay: 'day',
    weather: null,
    characters: [],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
  },
]

describe('SceneListPanel', () => {
  it('渲染场景列表 + 数量', () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: false,
      },
      ...mountOpts,
    })
    expect(w.text()).toContain('场景列表 (2)')
    expect(w.findAll('.scene-card')).toHaveLength(2)
  })

  it('点击 [+ 添加场景] 触发 add-scene', async () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: false,
      },
      ...mountOpts,
    })
    await w.find('.btn-add-scene').trigger('click')
    expect(w.emitted('add-scene')).toBeTruthy()
  })

  it('点击 [✏ 重写] 触发 rewrite-scenes', async () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: false,
      },
      ...mountOpts,
    })
    await w.find('.btn-rewrite').trigger('click')
    expect(w.emitted('rewrite-scenes')).toBeTruthy()
  })

  it('展开场景 emit expand 携带 scene id', async () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: false,
      },
      ...mountOpts,
    })
    await w.findAll('.scene-header')[0].trigger('click')
    expect(w.emitted('expand')).toBeTruthy()
    expect(w.emitted('expand')![0]).toEqual(['s1'])
  })

  it('readonly 时所有 actions 按钮隐藏', () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: true,
      },
      ...mountOpts,
    })
    expect(w.find('.btn-add-scene').exists()).toBe(false)
    expect(w.find('.btn-rewrite').exists()).toBe(false)
    expect(w.find('.btn-fix-bindings').exists()).toBe(false)
  })

  it('highlightedEntity 命中场景加 highlighted class', () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [{ id: 'c1', name: '张三' }],
        locations: [],
        items: [],
        highlightedEntity: { kind: 'character', name: '张三', id: 'c1' },
        readonly: false,
      },
      ...mountOpts,
    })
    const cards = w.findAll('.scene-card')
    expect(cards[0].classes()).toContain('highlighted')
    expect(cards[1].classes()).not.toContain('highlighted')
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/SceneListPanel.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/stage-content-script-v3/SceneListPanel.vue`：

```vue
<template>
  <section class="scene-list-panel">
    <header class="panel-header">
      <span class="panel-title">场景列表 ({{ scenes.length }})</span>
      <span class="panel-actions" v-if="!readonly">
        <el-button size="small" class="btn-add-scene" @click="$emit('add-scene')">
          <el-icon><Plus /></el-icon>
          添加场景
        </el-button>
        <el-button size="small" class="btn-rewrite" @click="$emit('rewrite-scenes')">
          <el-icon><EditPen /></el-icon>
          ✏ 重写场景
        </el-button>
        <el-button size="small" class="btn-fix-bindings" @click="$emit('fix-bindings')">
          <el-icon><Connection /></el-icon>
          🔗 修复绑定
        </el-button>
      </span>
    </header>

    <div v-if="scenes.length === 0" class="empty-hint">
      还没场景 — 点 + 添加场景 或上方 AI 生成剧本
    </div>

    <div v-else class="scenes">
      <article
        v-for="scene in scenes"
        :key="scene.id"
        class="scene-card"
        :class="{
          highlighted: isHighlighted(scene),
          expanded: expandedSceneIds.has(scene.id),
        }"
      >
        <header class="scene-header" @click="toggleExpand(scene.id)">
          <div class="scene-info">
            <span class="scene-num">场景 {{ scene.sceneNumber }}</span>
            <span class="scene-meta">
              📍 {{ scene.location || '未指定地点' }}
              <span v-if="scene.timeOfDay">· {{ scene.timeOfDay }}</span>
            </span>
          </div>
          <SceneEntityChips
            :chips="getSceneChips(scene)"
            @click-entity="$emit('click-entity', $event)"
          />
        </header>
        <div v-if="expandedSceneIds.has(scene.id)" class="scene-body">
          <div v-if="scene.originalText" class="scene-section">
            <span class="section-label">原文</span>
            <EntityRefRenderer :text="scene.originalText" :entities="entities" @click-entity="$emit('click-entity', $event)" />
          </div>
          <div v-if="scene.narration" class="scene-section">
            <span class="section-label">旁白</span>
            <EntityRefRenderer :text="scene.narration" :entities="entities" @click-entity="$emit('click-entity', $event)" />
          </div>
          <div v-if="(scene.dialogues ?? []).length > 0" class="scene-section">
            <span class="section-label">对话</span>
            <div v-for="d in scene.dialogues" :key="d.id" class="dialogue-line">
              <span class="dialogue-speaker">{{ d.characterName }}：</span>
              <EntityRefRenderer :text="d.text" :entities="entities" />
            </div>
          </div>
          <div v-if="(scene.actions ?? []).length > 0" class="scene-section">
            <span class="section-label">动作</span>
            <div v-for="a in scene.actions" :key="a.id" class="action-line">
              <EntityRefRenderer :text="a.description" :entities="entities" />
            </div>
          </div>
          <div class="scene-footer" v-if="!readonly">
            <el-button size="small" @click.stop="$emit('edit-scene', scene.id)">
              <el-icon><EditPen /></el-icon>
              编辑场景
            </el-button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, EditPen, Connection } from '@element-plus/icons-vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'
import SceneEntityChips from './SceneEntityChips.vue'
import { sceneContainsEntity } from './scene-entity-utils'
import type { EntityRef } from './scene-entity-utils'
import type { SceneScript } from '../../../../../shared/types/episode-production/narrative.types'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'

defineOptions({ name: 'SceneListPanel' })

const props = defineProps<{
  scenes: SceneScript[]
  entities: any[]                            // EntityRefMeta[]，给 EntityRefRenderer 用
  characters: UploadedCharacter[]
  locations: UploadedLocation[]
  items: UploadedItem[]
  highlightedEntity: EntityRef | null
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'expand', sceneId: string): void
  (e: 'collapse', sceneId: string): void
  (e: 'add-scene'): void
  (e: 'rewrite-scenes'): void
  (e: 'fix-bindings'): void
  (e: 'edit-scene', sceneId: string): void
  (e: 'click-entity', entity: EntityRef | any): void
}>()

const expandedSceneIds = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  if (expandedSceneIds.value.has(id)) {
    expandedSceneIds.value.delete(id)
    emit('collapse', id)
  } else {
    expandedSceneIds.value.add(id)
    emit('expand', id)
  }
}

function isHighlighted(scene: SceneScript): boolean {
  if (!props.highlightedEntity) return false
  return sceneContainsEntity(scene, props.highlightedEntity)
}

function getSceneChips(scene: SceneScript): EntityRef[] {
  const refs: EntityRef[] = []
  // characters
  for (const c of scene.characters ?? []) {
    if (props.characters.some((ch) => ch.id === c.characterId || ch.name === c.characterName)) {
      refs.push({ kind: 'character', name: c.characterName, id: c.characterId })
    }
  }
  // location
  if (scene.location) {
    const loc = props.locations.find((l) => l.name === scene.location || l.id === scene.locationBindingId)
    if (loc) refs.push({ kind: 'location', name: loc.name, id: loc.id })
  }
  // items: 用 sceneContainsEntity 反向过滤 props.items
  for (const item of props.items) {
    const ref: EntityRef = { kind: 'item', name: item.name, id: item.id }
    if (sceneContainsEntity(scene, ref)) refs.push(ref)
  }
  return refs
}
</script>

<style scoped lang="scss">
.scene-list-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-actions {
  display: inline-flex;
  gap: 6px;
}

.empty-hint {
  text-align: center;
  padding: 24px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.scenes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-bg-color);
  transition: all 0.2s;
}

.scene-card.highlighted {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning);
}

.scene-header {
  padding: 10px 12px;
  cursor: pointer;
  background: var(--el-color-primary-light-9);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.scene-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.scene-num {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-color-primary);
}

.scene-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.scene-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.dialogue-line,
.action-line {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  padding-left: 12px;
}

.dialogue-speaker {
  color: var(--el-color-primary);
  font-weight: 500;
}

.scene-footer {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/SceneListPanel.spec.ts
```
Expected: PASS（6 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/SceneListPanel.vue tests/unit/renderer/components/SceneListPanel.spec.ts
git commit -m "feat(ep): 新增 SceneListPanel 场景列表组件（从 stage-script-v2 拆出 + 联动）"
```

---

## Phase 4 · 容器组件

### Task 9：`StageContentScriptView.vue` 容器 + 迁移 ManualAddEntityDialog

**Files:**
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/StageContentScriptView.vue`
- Create: `src/renderer/src/components/episode-production/stage-content-script-v3/ManualAddEntityDialog.vue`（从 stage-content-v2 拷贝过来；后续删掉 v2 那个）

> 这是最大块的整合工作：把 stage-content-v2/StageContentViewV2.vue 的全部状态（识别要素 / 故事背景 / 原文编辑 / 确认要素 → asset_prep 等）+ stage-script-v2/StageScriptViewV2.vue 的全部状态（生成剧本 / 重写 / 修复绑定 / 完成 → storyboarding 等）合到一个组件，按 sub-state 切换 UI。
>
> 子组件已在 Phase 1-3 准备好，本任务主要做"组合 + 联动状态 + sub-state 切换"。

- [ ] **Step 1: 拷贝 ManualAddEntityDialog**

```bash
cp src/renderer/src/components/episode-production/stage-content-v2/ManualAddEntityDialog.vue \
   src/renderer/src/components/episode-production/stage-content-script-v3/ManualAddEntityDialog.vue
```

不改内容（dialog 本身职责单一，只是路径变了）。

- [ ] **Step 2: 写容器组件**

`src/renderer/src/components/episode-production/stage-content-script-v3/StageContentScriptView.vue`：

> 这个组件较大（约 600-700 行）。直接照搬 stage-content-v2/StageContentViewV2.vue 顶部 + script setup（识别要素相关），合并 stage-script-v2/StageScriptViewV2.vue 顶部 + script setup（剧本相关）；template 整合按 spec § 3 mockup；联动状态用 ref。

```vue
<template>
  <div class="stage-content-script-v3">
    <!-- 顶部 header（按 sub-state 切换主按钮） -->
    <StageMainHeader title="内容+剧本" :subtitle="headerSubtitle">
      <template #actions>
        <!-- pending sub-state：确认要素 → 资产 -->
        <el-button
          v-if="subState === 'pending'"
          type="success"
          :loading="confirming"
          :disabled="!canConfirmEntities"
          @click="onConfirmEntities"
        >
          <el-icon><Check /></el-icon>
          确认要素 → ② 资产
        </el-button>
        <!-- scripting sub-state：完成定稿 → 分镜 -->
        <el-button
          v-else-if="subState === 'scripting'"
          type="success"
          :loading="approving"
          :disabled="!canApproveScript"
          @click="onApproveScript"
        >
          <el-icon><Check /></el-icon>
          完成定稿 → ④ 分镜
        </el-button>
        <!-- asset_prep / 之后只读：tag -->
        <el-tag v-else type="success" round>{{ readonlyTagLabel }}</el-tag>
      </template>
    </StageMainHeader>

    <div v-if="!episode" class="empty-state">
      <el-empty description="请先选择剧集" />
    </div>

    <div v-else class="content-body">
      <!-- 顶部内容行：原文片段 + 故事背景（仅 uploaded 模式显示原文） -->
      <div v-if="episode.sourceType === 'uploaded' && episode.uploadedContent" class="excerpt-row">
        <!-- 原文片段 panel —— 拷贝自 stage-content-v2，省略详细模板 -->
        <ExcerptPanel
          :episode="episode"
          :readonly="!!readonly"
          :characters="characters"
          :locations="locations"
          :items="items"
          @reidentify="onIdentifyAll"
        />
        <!-- 故事背景 panel —— 拷贝自 stage-content-v2 -->
        <StoryBackgroundPanel
          :episode-id="episode.id"
          :readonly="!!readonly"
        />
      </div>

      <!-- 主区两栏 -->
      <div class="main-row">
        <div class="left-col">
          <!-- pending sub-state：场景列表为空，显示 hint -->
          <div v-if="subState === 'pending'" class="pending-hint">
            <el-icon :size="48" color="var(--el-text-color-placeholder)"><InfoFilled /></el-icon>
            <p>识别并确认要素后，进入资产准备阶段；资产准备完成后回到此页面 ✨ AI 生成剧本</p>
          </div>

          <!-- scripting / readonly sub-state：显示梗概 + 场景列表 -->
          <template v-else>
            <SynopsisPanel
              :synopsis="synopsisDraft"
              :entities="entityList"
              :readonly="!!readonly"
              :regenerating="regenSynopsis"
              @regenerate="onRegenSynopsis"
              @click-entity="onClickEntityFromText"
            />

            <!-- 没生成剧本时显示生成按钮 -->
            <div v-if="!script" class="generate-script-cta">
              <el-button
                type="primary"
                size="large"
                :loading="generating"
                @click="onGenerateScript"
              >
                <el-icon><MagicStick /></el-icon>
                ✨ AI 生成剧本
              </el-button>
            </div>

            <SceneListPanel
              v-else
              :scenes="scenes"
              :entities="entityList"
              :characters="characters"
              :locations="locations"
              :items="items"
              :highlighted-entity="highlightedEntity"
              :readonly="!!readonly"
              @add-scene="onAddScene"
              @rewrite-scenes="onGenerateScript"
              @fix-bindings="onFixBindings"
              @edit-scene="onEditScene"
              @expand="onExpandScene"
              @collapse="onCollapseScene"
              @click-entity="onClickEntity"
            />
          </template>
        </div>

        <EntitySidebar
          :characters="characters"
          :locations="locations"
          :items="items"
          :scenes="scenes"
          :highlighted-entity="highlightedEntity"
          :highlighted-scene-id="highlightedSceneId"
          :readonly="readonly && subState !== 'asset_prep'"
          @click-entity="onClickEntity"
          @toggle="onToggleEntity"
          @toggle-source="onToggleSource"
          @edit="onEditEntity"
          @delete="onDeleteEntity"
          @reidentify="onReidentifyKind"
          @add="onManualAdd"
        />
      </div>
    </div>

    <!-- 手动添加要素对话框 -->
    <ManualAddEntityDialog
      v-model="addDialog.open"
      :kind="addDialog.kind"
      :initial="addDialog.initial"
      @confirm="onManualAddConfirm"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * StageContentScriptView · 合并 ① 内容 + ③ 剧本
 *
 * sub-state（按 episode.status 派生）：
 *   - pending     → 识别要素阶段；显示要素 sidebar，章节梗概+场景列表 hidden
 *   - scripting   → 剧本生成阶段；全部显示
 *   - asset_prep  → 只读回看（要素 sidebar 仍可编辑，剧本部分隐藏）
 *   - storyboarding+ → 只读回看（全只读）
 *
 * 联动：
 *   - highlightedEntity (EntityRef | null)：点要素 sidebar item / 场景 chip 触发
 *   - highlightedSceneId (string | null)：展开场景触发
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, MagicStick, InfoFilled } from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import EntitySidebar from './EntitySidebar.vue'
import SynopsisPanel from './SynopsisPanel.vue'
import SceneListPanel from './SceneListPanel.vue'
import ManualAddEntityDialog from './ManualAddEntityDialog.vue'
// ExcerptPanel / StoryBackgroundPanel 是从 stage-content-v2/StageContentViewV2.vue 拆出的
// 子组件——拆分细节在本 task 的"扩展步骤"里说明
import ExcerptPanel from './ExcerptPanel.vue'
import StoryBackgroundPanel from './StoryBackgroundPanel.vue'
import {
  useEpEpisodeStore,
  useEpScriptStore,
} from '@/stores/episode-production'
import type {
  VideoEpisode,
  EpisodeStatus,
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'
import type { EntityRef } from './scene-entity-utils'

defineOptions({ name: 'StageContentScriptView' })

type Kind = 'character' | 'location' | 'item'

const props = defineProps<{
  episode: VideoEpisode | null
}>()

const emit = defineEmits<{
  (e: 'confirmed-entities'): void   // 触发 pending → asset_prep
  (e: 'approved-script'): void      // 触发 scripting → storyboarding
  (e: 'go-asset-stage', payload: { kind: Kind; bindingId?: string }): void
}>()

const episodeStore = useEpEpisodeStore()
const scriptStore = useEpScriptStore()

// ===== sub-state =====
const subState = computed<EpisodeStatus | 'readonly'>(() => {
  const s = props.episode?.status as EpisodeStatus | undefined
  if (!s) return 'pending'
  if (s === 'pending' || s === 'scripting') return s
  return 'readonly'
})

const readonly = computed(() => {
  // 在 asset_prep / storyboarding+ 时整体只读（asset_prep 时要素 sidebar 仍允许编辑，
  // 由 EntitySidebar 内部接收 readonly + asset_prep 例外控制）
  return subState.value === 'readonly'
})

const readonlyTagLabel = computed(() => {
  const s = props.episode?.status as EpisodeStatus | undefined
  if (s === 'asset_prep') return '已确认（在阶段 ②）'
  return '已定稿'
})

// ===== 要素列表（uploaded* 三数组）=====
const characters = ref<UploadedCharacter[]>([])
const locations = ref<UploadedLocation[]>([])
const items = ref<UploadedItem[]>([])

watch(
  () => props.episode,
  (ep) => {
    characters.value = (ep?.uploadedCharacters ?? []) as UploadedCharacter[]
    locations.value = (ep?.uploadedLocations ?? []) as UploadedLocation[]
    items.value = (ep?.uploadedItems ?? []) as UploadedItem[]
  },
  { immediate: true, deep: true },
)

// ===== 剧本 =====
const script = computed(() => scriptStore.currentScript)
const scenes = computed(() => scriptStore.scenes ?? [])
const synopsisDraft = computed(() => (script.value as any)?.synopsis ?? '')

const entityList = computed(() => {
  // 给 EntityRefRenderer 用的 EntityRefMeta[]
  const list: any[] = []
  characters.value.forEach((c) => list.push({ kind: 'character', name: c.name, id: c.id }))
  locations.value.forEach((l) => list.push({ kind: 'location', name: l.name, id: l.id }))
  items.value.forEach((i) => list.push({ kind: 'item', name: i.name, id: i.id }))
  return list
})

// ===== 联动 =====
const highlightedEntity = ref<EntityRef | null>(null)
const highlightedSceneId = ref<string | null>(null)

function onClickEntity(entity: EntityRef): void {
  // 切换：再次点同一 entity 取消高亮
  if (
    highlightedEntity.value &&
    highlightedEntity.value.kind === entity.kind &&
    highlightedEntity.value.name === entity.name
  ) {
    highlightedEntity.value = null
  } else {
    highlightedEntity.value = entity
  }
}

function onClickEntityFromText(meta: any): void {
  // EntityRefRenderer 的 click-entity emit 类型与 EntityRef 略有差异；适配
  if (meta?.kind && meta?.name) onClickEntity({ kind: meta.kind, name: meta.name, id: meta.id })
}

function onExpandScene(sceneId: string): void {
  highlightedSceneId.value = sceneId
}

function onCollapseScene(sceneId: string): void {
  if (highlightedSceneId.value === sceneId) highlightedSceneId.value = null
}

// ===== 状态计算（按钮启用） =====
const confirming = ref(false)
const approving = ref(false)
const generating = ref(false)
const regenSynopsis = ref(false)

const canConfirmEntities = computed(() => {
  // 至少一个 confirmed
  return [...characters.value, ...locations.value, ...items.value].some((e) => e.confirmed)
})

const canApproveScript = computed(() => {
  // 剧本已生成 + 至少 1 个场景
  return !!script.value && scenes.value.length > 0
})

const headerSubtitle = computed(() => {
  const c = characters.value.length
  const l = locations.value.length
  const i = items.value.length
  const m = scenes.value.length
  return `已识别 ${c} 角色 / ${l} 地点 / ${i} 物品 · ${m} 个场景`
})

// ===== 操作 handler =====
//
// 本组件的"操作"分为两类：
//   1. 识别要素相关：onIdentifyAll / onConfirmEntities / onToggleEntity /
//      onToggleSource / onEditEntity / onDeleteEntity / onReidentifyKind /
//      onManualAdd / onManualAddConfirm — 完整逻辑直接拷贝
//      stage-content-v2/StageContentViewV2.vue 中的同名 / 等价函数实现
//      （以及相关 ref：identifying / saving / hasDirty / dirtyKinds /
//      saveEntities / addDialog 等）
//   2. 剧本相关：onGenerateScript / onRegenSynopsis / onApproveScript /
//      onAddScene / onEditScene / onFixBindings — 完整逻辑直接拷贝
//      stage-script-v2/StageScriptViewV2.vue 中的同名函数实现
//      （以及相关 ref：generating / approving / regenSynopsis / fixingBindings /
//      sceneFor / sceneEdit dialog 状态等）
//
// 拷贝时注意：
//   a) `props.episode` 引用保留不变（两个旧组件都接 episode prop）
//   b) `episodeStore` / `scriptStore` 调用照搬
//   c) 原 onConfirm 末尾的 `emit('confirmed')` 改为 `emit('confirmed-entities')`
//   d) 原 onApprove 末尾加 `emit('approved-script')`（旧版无此 emit，新增）
//   e) 涉及 ManualAddEntityDialog / EntityRefRenderer 的 import 路径调整（v3 目录）
//
// 因为这部分函数总量约 600 行（onIdentify 单独就 80 行），plan 文档不再
// 内联完整代码——执行 agent 必须打开两个旧文件、按上述分类拷贝粘贴函数 +
// 相关 ref + 必要 import，然后跑 typecheck 确认接口对齐。

// 占位声明（让 plan 中 template 引用编译通过；实际实现按上面注释拷贝）：

const addDialog = ref({ open: false, kind: 'character' as Kind, initial: null as any })

async function onIdentifyAll(): Promise<void> { /* 拷贝自 stage-content-v2 onIdentify */ }
async function onConfirmEntities(): Promise<void> { /* 拷贝 + emit confirmed-entities */ emit('confirmed-entities') }
async function onGenerateScript(): Promise<void> { /* 拷贝自 stage-script-v2 onGenerateScript */ }
async function onRegenSynopsis(): Promise<void> { /* 拷贝自 stage-script-v2 onRegenSynopsis */ }
async function onApproveScript(): Promise<void> { /* 拷贝 + emit approved-script */ emit('approved-script') }
async function onAddScene(): Promise<void> { /* 拷贝自 stage-script-v2 onAddScene */ }
async function onEditScene(_sceneId: string): Promise<void> { /* 拷贝自 stage-script-v2 onEditScene */ }
async function onFixBindings(): Promise<void> { /* 拷贝自 stage-script-v2 onFixBindings */ }
function onToggleEntity(_kind: Kind, _idx: number): void { /* 拷贝自 stage-content-v2 toggleConfirmed */ }
function onToggleSource(_kind: Kind, _idx: number): void { /* 拷贝自 stage-content-v2 toggleSource */ }
function onEditEntity(_kind: Kind, _idx: number): void { /* 拷贝自 stage-content-v2 onEdit */ }
function onDeleteEntity(_kind: Kind, _idx: number): void { /* 拷贝自 stage-content-v2 onDelete */ }
function onReidentifyKind(kind: Kind): void { /* 拷贝自 stage-content-v2 onIdentify([kind]) */ void kind }
function onManualAdd(kind: Kind): void { addDialog.value = { open: true, kind, initial: null } }
function onManualAddConfirm(_payload: any): void { /* 拷贝自 stage-content-v2 onManualAddConfirm */ }
</script>

<style scoped lang="scss">
.stage-content-script-v3 {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.excerpt-row {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  flex-shrink: 0;
}

.excerpt-row > * {
  min-width: 0;
}

.excerpt-row > :first-child {
  flex: 0.6;
}

.excerpt-row > :last-child {
  flex: 0.4;
}

.main-row {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  overflow: auto;
  min-width: 0;
  gap: 12px;
}

.pending-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 24px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  text-align: center;
}

.generate-script-cta {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}
</style>
```

> **本 task 的"扩展步骤"——`ExcerptPanel.vue` / `StoryBackgroundPanel.vue` 拆分**
>
> StageContentScriptView 用了 `<ExcerptPanel>` 和 `<StoryBackgroundPanel>` 两个未在 plan 别处建过的子组件。这两个是从 stage-content-v2/StageContentViewV2.vue 顶部"原文片段 panel"和"故事背景 panel"两段模板拆出来。**实施 Step 2 时一并完成拆分**：
>
> - 创建 `src/renderer/src/components/episode-production/stage-content-script-v3/ExcerptPanel.vue`：把 stage-content-v2/StageContentViewV2.vue 模板里的 `<section class="excerpt-panel">` 拷过来 + 把相关 ref（editingContent / editContentDraft / savingContent / contentWordCount / highlightedExcerpt / saveEditContent / cancelEditContent / enterEditContent / onIdentify）也搬过来。Props: `{ episode, readonly, characters, locations, items }`，Emits: `{ reidentify }`。
> - 创建 `src/renderer/src/components/episode-production/stage-content-script-v3/StoryBackgroundPanel.vue`：把 `<section class="story-background-panel">` 模板 + 相关 ref（storyBg / storyBgDirty / savingStoryBg / saveStoryBackground / loadStoryBackground）搬过来。Props: `{ episodeId, readonly }`。
>
> 这两个组件的逻辑直接用 stage-content-v2 现有代码，**只改 import 路径**（shared/AssetSourceTag 等保持），无需重新设计。**单测可省**——是从已稳定组件直接迁出，且容器组件 E2E 会覆盖。

- [ ] **Step 3: 跑 typecheck**

```bash
npm run typecheck
```
Expected: PASS（旧 vite.config.d.ts 错可忽略）。如有新错（很可能是 ExcerptPanel / StoryBackgroundPanel 拆分后丢失某个 prop / store 引用），修复直至通过。

- [ ] **Step 4: 启 web dev 手验**

```bash
PGDATABASE=the_bot_test npm run web:dev
npm run web:client:dev
```
注意：此刻 EpisodeWorkbench 还没接入 v3（Task 10 才接入），所以页面**看不到合并后的内容**。本 step 仅确认 typecheck + lint 通过，无运行时错误，组件可被独立引用。

如要单独验证容器组件渲染，可在 `src/renderer/src/views/EpisodeWorkbench.vue` 临时加一个 `<StageContentScriptView v-if="false" />` 引用确认 import 链正确。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/stage-content-script-v3/
git commit -m "feat(ep): 新增 StageContentScriptView 容器组件 + 迁入 ManualAddEntityDialog / ExcerptPanel / StoryBackgroundPanel"
```

---

## Phase 5 · 接入 + 删除

### Task 10：接入 `EpisodeWorkbench.vue` + 删除 v2 文件

**Files:**
- Modify: `src/renderer/src/views/EpisodeWorkbench.vue`
- Delete: `src/renderer/src/components/episode-production/stage-content-v2/StageContentViewV2.vue`
- Delete: `src/renderer/src/components/episode-production/stage-content-v2/EntityColumn.vue`
- Delete: `src/renderer/src/components/episode-production/stage-content-v2/ManualAddEntityDialog.vue`
- Delete: `src/renderer/src/components/episode-production/stage-script-v2/StageScriptViewV2.vue`

- [ ] **Step 1: 改 EpisodeWorkbench template**

打开 `src/renderer/src/views/EpisodeWorkbench.vue`，找到现有的 `<el-tab-pane label="① 内容" name="pending">` 段，整段（含 `<StageContentView />`）替换：

```vue
<el-tab-pane label="内容+剧本" name="pending">
  <StageContentScriptView
    :episode="episodeStore.currentEpisode"
    @confirmed-entities="onContentConfirmed"
    @approved-script="onScriptApproved"
    @go-asset-stage="onScriptGoAssetStage"
  />
</el-tab-pane>
```

删除现有的 `<el-tab-pane label="③ 剧本" name="scripting">` 段（含 `<StageScriptView />`）整段。

- [ ] **Step 2: 改 EpisodeWorkbench script setup**

定位 import 区域：

```typescript
import StageContentView from '@/components/episode-production/stage-content-v2/StageContentViewV2.vue'
```

改为：

```typescript
import StageContentScriptView from '@/components/episode-production/stage-content-script-v3/StageContentScriptView.vue'
```

定位：

```typescript
import StageScriptView from '@/components/episode-production/stage-script-v2/StageScriptViewV2.vue'
```

**删除该行**（不再使用）。

定位 `WorkbenchStage` 类型：

```typescript
type WorkbenchStage = Exclude<EpisodeStatus, 'completed'>
```

保持不变（需要 6 个生产 status 都能赋给 activeTab）。

定位 `watch(activeTab, (s) => { ... })` 块（清空 sidebar context 的逻辑），加上 `'scripting'` 也算清空：

> 实际上原代码已经 `if (s === 'pending' || s === 'asset_prep' || s === 'composing')` ——不变。

定位 `route.params` 进入工作台后的 status 同步逻辑（即 status=scripting 时 activeTab 应该映射到 'pending' 这个合并 tab）：

在 `selectEpisode` 函数体末尾、或 `loadProject` 完成后 `watch(() => episodeStore.currentEpisode?.status, ...)` 里加一段映射：

```typescript
watch(
  () => episodeStore.currentEpisode?.status,
  (s) => {
    if (!s) return
    // pending / scripting 都映射到合并 tab（其 name 是 'pending'）
    if (s === 'pending' || s === 'scripting') {
      activeTab.value = 'pending'
    } else if (
      s === 'asset_prep' ||
      s === 'storyboarding' ||
      s === 'producing' ||
      s === 'composing'
    ) {
      activeTab.value = s
    }
  },
  { immediate: true },
)
```

> 同时在 `useWorkbenchStageNavigation` 的 `onNavigateStage`（即 stage 栏点击）函数里——它接收 `EpisodeStatus`，对 pending / scripting 都让 activeTab='pending'：

打开 `src/renderer/src/composables/use-workbench-stage-navigation.ts`，在 `onNavigateStage` 函数中、`input.activeTab.value = status as WorkbenchStage` 这行**前**加映射：

```typescript
const tabName: WorkbenchStage = status === 'scripting' ? 'pending' : (status as WorkbenchStage)
input.activeTab.value = tabName
```

把后续所有 `input.activeTab.value = status as WorkbenchStage` 替换为 `input.activeTab.value = tabName`。

定位 `onContentConfirmed` 函数（`use-workbench-stage-navigation` 里有）—— 之前是 ① 内容 → 切到 ② 资产，现在 v3 的 emit `confirmed-entities` 等价。函数实现保持，调用点变在 EpisodeWorkbench 上 `<StageContentScriptView @confirmed-entities="onContentConfirmed" />` 已建立连接。

新增一个回调 `onScriptApproved`（在 EpisodeWorkbench script setup 里）：

```typescript
async function onScriptApproved(): Promise<void> {
  activeTab.value = 'storyboarding'
  await headerBarRef.value?.reload()
  ElMessage.success('剧本已定稿 → 进入 ④ 分镜')
}
```

- [ ] **Step 3: 跑 typecheck + 启 dev 手验**

```bash
npm run typecheck
PGDATABASE=the_bot_test npm run web:dev
npm run web:client:dev
```

浏览器打开后，登录 → 选剧集进工作台。验证：
1. status=pending 的剧集 → 顶部 stage 栏「内容+剧本」段是 current；进入 tab 看到要素 sidebar；prend hint 显示
2. 点"识别 / 确认 → 资产" → status 变 asset_prep；stage 栏「资产」段 current，「内容+剧本」段绿
3. 在 ② 资产 stage 完成绑定 → status 变 scripting；stage 栏「内容+剧本」段又变 current；进 tab 看到梗概 + 场景列表
4. 点"完成定稿 → ④ 分镜" → 切到分镜 stage

如有 bug，修复直至全部通过。

- [ ] **Step 4: 删除旧 v2 文件**

先 grep 确认无引用：

```bash
grep -rn "stage-content-v2\|stage-script-v2\|StageContentViewV2\|StageScriptViewV2\|EntityColumn\b" src/ --include="*.vue" --include="*.ts" | grep -v "^src/renderer/src/components/episode-production/stage-content-v2" | grep -v "^src/renderer/src/components/episode-production/stage-script-v2"
```

期望无输出（除注释或 plan 文档）。如有新引用，先修复。

删除文件：

```bash
rm src/renderer/src/components/episode-production/stage-content-v2/StageContentViewV2.vue
rm src/renderer/src/components/episode-production/stage-content-v2/EntityColumn.vue
rm src/renderer/src/components/episode-production/stage-content-v2/ManualAddEntityDialog.vue
rm src/renderer/src/components/episode-production/stage-script-v2/StageScriptViewV2.vue
# 如果 stage-content-v2 / stage-script-v2 目录已空，删空目录
rmdir src/renderer/src/components/episode-production/stage-content-v2 2>/dev/null || true
rmdir src/renderer/src/components/episode-production/stage-script-v2 2>/dev/null || true
```

- [ ] **Step 5: 跑 typecheck + lint + 单测**

```bash
npm run typecheck
npm run lint
npm test -- tests/unit/renderer/components/scene-entity-utils.spec.ts \
              tests/unit/renderer/components/StageHeaderBar-merged.spec.ts \
              tests/unit/renderer/components/EntitySidebar.spec.ts \
              tests/unit/renderer/components/SceneListPanel.spec.ts
```

Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ep): EpisodeWorkbench 接入合并 v3 + 删除 stage-content-v2 / stage-script-v2"
```

---

### Task 11：全量验证 + E2E + 归档

**Files:**（无文件修改）

- [ ] **Step 1: 全量 unit test**

```bash
npm run test:unit:sqlite 2>&1 | tail -30
```

Expected: 与 Task 10 之前通过率不退步（之前已知 8 个历史 EntityMetadataNotFoundError fail 不变；其他全过）。

- [ ] **Step 2: lint + typecheck**

```bash
npm run lint 2>&1 | tail -10
npm run typecheck 2>&1 | tail -10
```

Expected: 无新增 error / warning。

- [ ] **Step 3: Web E2E 手验**

按 spec § 8.2 流程完整跑一遍：

```
[阶段 1：识别要素 sub-state]
  - 进剧集（status=pending）
  - 看到原文 + 故事背景 + 要素 sidebar 为空 + pending-hint
  - 点 ExcerptPanel 上的 "✨ 重新识别" → sidebar 出现 entity 列表
  - 勾选要素 confirm
  - 点 header "确认要素 → ② 资产" → stage 栏 → 资产段 current

[阶段 2：资产准备]
  - 完成绑定 → status 变 scripting

[阶段 3：剧本生成 sub-state]
  - 自动回到合并 tab（或从 stage 栏点"内容+剧本"段）
  - 看到 SynopsisPanel + "AI 生成剧本" CTA
  - 点 → 场景列表出现
  - sidebar entity 后面出现场景号 (1, 2)
  - 场景卡顶部 chip 出现要素
  - 点 sidebar 张三 → 含张三的场景金色高亮
  - 展开场景 2 → sidebar 上张三 / 客栈金色高亮
  - 点 scene chip @长剑 → 含长剑的场景高亮
  - 点 "完成定稿 → ④ 分镜" → stage 栏切到分镜段
```

- [ ] **Step 4: 归档截图**

新建 `progress/2026-05-08-content-script-merged/`：

- `01-pending-substate.png`（识别要素阶段）
- `02-scripting-substate.png`（剧本生成阶段）
- `03-readonly-substate.png`（asset_prep 时回看）
- `04-entity-scene-highlight.png`（点要素高亮场景）
- `05-scene-entity-highlight.png`（展开场景高亮要素）

新建 `progress/2026-05-08-content-script-merged/notes.md`：

```markdown
# 合并 ① 内容 + ③ 剧本 · 实施笔记

**日期：** 2026-05-08
**分支：** feat/episode-production-redesign
**spec：** docs/superpowers/specs/2026-05-08-content-script-merged-design.md
**plan：** docs/superpowers/plans/2026-05-08-content-script-merged.md

## 实施概览

11 个 task 全部完成。commits 列表：

[运行 `git log --oneline <base-sha>..HEAD` 拷贝]

## 自动化验证

- typecheck：[结果]
- lint：[结果]
- unit test：[结果]
- web E2E 三 sub-state 全跑通

## 已知偏离 plan 的地方

[实施过程中如有偏离，记录原因]

## 后续优化建议

- 物品反查依赖 SceneCharacter.props 或文本 @ 引用，AI 生成剧本时如能稳定填 props
  可消除文本扫描依赖
- StageContentScriptView 容器组件较大（~700 行），后续如增功能可考虑再拆 useXxx
  composable
```

提交：

```bash
git add progress/2026-05-08-content-script-merged/
git commit -m "docs(progress): 归档合并 ①+③ 实施笔记 + 截图"
```

---

## Self-Review

### 1. Spec 覆盖

| Spec 章节 | 对应 Task |
|---|---|
| § 2 stage 6→5 段染色规则 | Task 2 |
| § 2.3 sub-state 与按钮自适应 | Task 9 (StageContentScriptView header) |
| § 3.1 总览布局 | Task 9 (StageContentScriptView template) |
| § 3.2 顶部 header | Task 9 |
| § 3.3 顶部内容行（原文 + 故事背景） | Task 9 (ExcerptPanel + StoryBackgroundPanel 拆分) |
| § 3.4 主区两栏 | Task 9 |
| § 3.5 场景卡 chip | Task 6 + Task 8 |
| § 4 EntitySidebar 三件套 | Task 3 + Task 4 + Task 5 |
| § 5.1 联动 ① 场景号 | Task 4 (EntitySidebarSection 用 entityScenes) |
| § 5.1 联动 ② 点要素高亮场景 | Task 8 + Task 9 |
| § 5.1 联动 ③ 展开场景高亮要素 | Task 4 + Task 9 |
| § 5.1 联动 ④ 场景卡 chip | Task 6 + Task 8 |
| § 5.2 工具函数 | Task 1 |
| § 5.3 物品反查二层策略 | Task 1（实现） |
| § 6.1 新增组件 | Task 1-9 |
| § 6.2 改写 StageHeaderBar | Task 2 |
| § 6.2 改写 EpisodeWorkbench | Task 10 |
| § 6.3 删除 v2 | Task 10 |
| § 7 数据 / IPC（不变） | 无 task（确认即可） |
| § 8 测试 | 各 task 内单测 + Task 11 E2E |

### 2. 占位符扫描

- Task 9 的 16 个 fn 用 `/* 拷贝自 stage-content-v2 ... */` 注释指引执行 agent 从两个旧 .vue 文件拷贝完整实现。这是 **plan 唯一的"拷贝"例外**——因为这些函数加起来 600+ 行无法内联到 plan。执行 agent 不能写假实现，必须真把旧函数搬过去 + 改 emit 字段名 + 改 import 路径
- 所有代码块完整可执行
- 没有"similar to Task N"

### 3. 类型一致性

- `EntityRef`：Task 1 定义，Task 3-9 使用 — 一致
- `EntityKind` / `Kind`：Task 1 定义为 `'character' | 'location' | 'item'`，组件中作为 type alias 重复使用 — 一致
- `MergedSegment.statuses`：Task 2 内部类型，不外露 — 自洽
- `SceneScript`：Task 1 / 8 / 9 都从 narrative.types import — 一致

### 4. 风险点

- **Task 9 风险最大**：要把两个大 .vue 文件（合计约 1900 行）合并成一个新 .vue + 拆 ExcerptPanel / StoryBackgroundPanel。建议执行 agent 用"先全文拷贝再删冗余"的策略，每拆完一个子组件 typecheck 一次。
- **Task 10 EpisodeWorkbench 改 watch / activeTab 映射**：scripting → activeTab='pending' 这个反向映射是新逻辑，容易漏；E2E 必须验证 status=scripting 时 tab 确实切到合并 tab。
- **EntityRefRenderer 的 click-entity emit 字段名可能与 EntityRef 略有差异**：Task 9 加了 `onClickEntityFromText` 适配——若 EntityRefRenderer 的 emit 字段是 `{ type, value, ... }` 而不是 `{ kind, name, id }`，要在适配函数里改字段名。

---

