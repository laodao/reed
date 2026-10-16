# 剧集制作 UI 重构 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把剧集制作模块重构为「项目界面（左 sidebar 项目 + 右栏集列表）」+「制作界面（极简 header + stage 文字栏）」两层结构，集 CRUD / 项目设置入口集中到项目界面，制作界面 URL 携带 episodeId。

**Architecture:** 路由两级：`/episode-production` 项目+集列表两栏，`/episode-production/:projectId/episode/:episodeId` 制作界面。后端新增聚合 IPC `ep:list-episodes-with-progress` 一次性返回项目下所有集 + 进度，避免前端 N+1。前端拆 4 个新组件（StageHeaderBar、ProjectSidebar、EpisodeCard、EpisodeListPanel），从 EpisodeWorkbench 迁出 3 个 dialog（CreateEpisode / EditEpisode / Settings），删除 StageProgressBar / BottomTimeline。

**Tech Stack:** Vue 3 Composition API + Pinia + Element Plus + vitest（单测）+ Playwright（E2E）+ TypeORM + electron-vite。

**对照 spec:** `docs/superpowers/specs/2026-05-08-episode-production-redesign-design.md`

---

## File Structure

### 新建（9 个）

| 路径 | 责任 |
|---|---|
| `src/shared/types/episode-production/episode-with-progress.types.ts` | `EpisodeWithProgress` 类型 + `STAGE_LABEL_FOR_STATUS` 常量映射 |
| `tests/unit/episode-production/workflow/list-episodes-with-progress.spec.ts` | `ProgressCalculator.listEpisodesWithProgress` 单测 |
| `tests/unit/renderer/stores/ep-project-last-selected.spec.ts` | `lastSelectedProjectId` 持久化单测 |
| `src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue` | 极简文字版 stage 栏 |
| `src/renderer/src/components/episode-production/project-list/EpisodeCard.vue` | 集卡 |
| `src/renderer/src/components/episode-production/project-list/ProjectSidebar.vue` | 左侧项目列表 |
| `src/renderer/src/components/episode-production/project-list/EpisodeListPanel.vue` | 右栏（page-header + 集 grid） |
| `tests/unit/renderer/components/StageHeaderBar.spec.ts` | StageHeaderBar 单测 |
| `tests/unit/renderer/components/EpisodeCard.spec.ts` | EpisodeCard 单测 |
| `tests/unit/renderer/components/ProjectSidebar.spec.ts` | ProjectSidebar 单测 |
| `tests/unit/renderer/components/EpisodeListPanel.spec.ts` | EpisodeListPanel 单测 |

### 修改（7 个）

| 路径 | 改动 |
|---|---|
| `src/core/modules/episode-production/workflow/progress-calculator.ts` | 新增 `listEpisodesWithProgress(projectId)` 方法 |
| `src/electron/ipc/handlers/episode-production/workflow.handler.ts` | 注册 `ep:list-episodes-with-progress` |
| `src/preload/index.ts` | IPC_CHANNELS 加常量 + `episodeProduction.listEpisodesWithProgress` 暴露 |
| `src/renderer/src/stores/episode-production/project.store.ts` | 新增 `lastSelectedProjectId` 持久化 |
| `src/renderer/src/router/index.ts` | 加 `/episode-production/:projectId/episode/:episodeId` + `:projectId` beforeEnter redirect |
| `src/renderer/src/views/EpisodeProjectListV2.vue` | 完全重写为两栏 |
| `src/renderer/src/views/EpisodeWorkbench.vue` | header 重构 + 删除 select/Plus/Edit/Setting + 删除 StageProgressBar/BottomTimeline + 按 episodeId 选集 |
| `src/renderer/src/composables/use-workbench-stage-navigation.ts` | `progressBarRef` → `headerBarRef` |

### 删除（2 个）

| 路径 | 备注 |
|---|---|
| `src/renderer/src/components/episode-production/workbench/StageProgressBar.vue` | 重构后无引用 |
| `src/renderer/src/components/episode-production/workbench/BottomTimeline.vue` | 同上 |

---

## Phase 1 · 后端 / 数据层

### Task 1：新增 `EpisodeWithProgress` 类型 + `STAGE_LABEL_FOR_STATUS` 常量

**Files:**
- Create: `src/shared/types/episode-production/episode-with-progress.types.ts`

- [ ] **Step 1: 写文件**

```typescript
/**
 * episode-with-progress.types.ts
 *
 * 聚合 IPC `ep:list-episodes-with-progress` 的响应类型 +
 * EpisodeStatus → 中文标签映射（用于集卡 currentStageLabel）。
 */
import type { EpisodeStatus } from './index'

export interface EpisodeWithProgress {
  id: string
  projectId: string
  episodeNumber: number
  title: string
  status: EpisodeStatus
  /** 0-100 整数；按 6 个生产阶段平均的简化进度 */
  progressPct: number
  /** 中文当前阶段标签，由 status 映射，便于前端直接渲染 */
  currentStageLabel: string
}

/**
 * EpisodeStatus → 集卡 currentStageLabel 中文标签
 *
 * 注：与 STAGE_LABELS（侧重 stage 名）独立。这里给"集状态"标签，
 * pending/completed 是终态（不属 6 个生产 stage），单独定义。
 */
export const STAGE_LABEL_FOR_STATUS: Record<EpisodeStatus, string> = {
  pending: '未开始',
  asset_prep: '资产准备',
  scripting: '剧本中',
  storyboarding: '分镜中',
  producing: '制作中',
  composing: '合成中',
  completed: '已完成',
}
```

- [ ] **Step 2: 加进 shared/types/episode-production/index.ts 的 re-export**

打开 `src/shared/types/episode-production/index.ts`，在 re-export 区域加：

```typescript
export * from './episode-with-progress.types'
```

- [ ] **Step 3: 跑 typecheck 确认无错**

```bash
npm run typecheck
```
Expected: PASS（types/index 现有 export 模式不变）

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/episode-production/episode-with-progress.types.ts src/shared/types/episode-production/index.ts
git commit -m "feat(ep): 新增 EpisodeWithProgress 类型 + STAGE_LABEL_FOR_STATUS 映射"
```

---

### Task 2：`ProgressCalculator.listEpisodesWithProgress` + 单测

**Files:**
- Modify: `src/core/modules/episode-production/workflow/progress-calculator.ts`
- Create: `tests/unit/episode-production/workflow/list-episodes-with-progress.spec.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/episode-production/workflow/list-episodes-with-progress.spec.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { ProgressCalculator } from '../../../../src/core/modules/episode-production/workflow/progress-calculator'
import { VideoEpisodeEntity } from '../../../../src/core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '../../../../src/core/database/entities/episode-production/video-project.entity'
import { setupSqliteTestDb } from '../../helpers/sqlite-test-db'

describe('ProgressCalculator.listEpisodesWithProgress', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await setupSqliteTestDb()
  })

  it('返回项目下所有集 + 进度 + 当前阶段标签', async () => {
    const projectRepo = ds.getRepository(VideoProjectEntity)
    const epRepo = ds.getRepository(VideoEpisodeEntity)
    const project = await projectRepo.save({ name: 'P1', config: {} as any } as any)

    await epRepo.save([
      { projectId: project.id, episodeNumber: 1, title: '第一回', status: 'pending' } as any,
      { projectId: project.id, episodeNumber: 2, title: '第二回', status: 'asset_prep' } as any,
      { projectId: project.id, episodeNumber: 3, title: '第三回', status: 'completed' } as any,
    ])

    const calc = new ProgressCalculator(ds)
    const list = await calc.listEpisodesWithProgress(project.id)

    expect(list).toHaveLength(3)
    expect(list[0].episodeNumber).toBe(1)
    expect(list[0].currentStageLabel).toBe('未开始')
    expect(list[1].currentStageLabel).toBe('资产准备')
    expect(list[2].currentStageLabel).toBe('已完成')
    list.forEach((e) => {
      expect(e.progressPct).toBeGreaterThanOrEqual(0)
      expect(e.progressPct).toBeLessThanOrEqual(100)
    })
  })

  it('空项目返回空数组', async () => {
    const projectRepo = ds.getRepository(VideoProjectEntity)
    const project = await projectRepo.save({ name: 'P-empty', config: {} as any } as any)
    const calc = new ProgressCalculator(ds)
    const list = await calc.listEpisodesWithProgress(project.id)
    expect(list).toEqual([])
  })

  it('集按 episodeNumber 升序', async () => {
    const projectRepo = ds.getRepository(VideoProjectEntity)
    const epRepo = ds.getRepository(VideoEpisodeEntity)
    const project = await projectRepo.save({ name: 'P-order', config: {} as any } as any)
    await epRepo.save([
      { projectId: project.id, episodeNumber: 3, title: 't3', status: 'pending' } as any,
      { projectId: project.id, episodeNumber: 1, title: 't1', status: 'pending' } as any,
      { projectId: project.id, episodeNumber: 2, title: 't2', status: 'pending' } as any,
    ])
    const calc = new ProgressCalculator(ds)
    const list = await calc.listEpisodesWithProgress(project.id)
    expect(list.map((e) => e.episodeNumber)).toEqual([1, 2, 3])
  })
})
```

> **注：** 如果 `tests/unit/episode-production/helpers/sqlite-test-db.ts` 不存在，先 grep 现有 sqlite test db helper 路径并替换 import。例：`grep -r "setupSqliteTestDb\|createSqliteTestDataSource" tests/unit/`。

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/episode-production/workflow/list-episodes-with-progress.spec.ts
```
Expected: FAIL，"calc.listEpisodesWithProgress is not a function"

- [ ] **Step 3: 写实现**

打开 `src/core/modules/episode-production/workflow/progress-calculator.ts`，在 class 末尾追加方法：

```typescript
import type { EpisodeWithProgress } from '@shared/types/episode-production/episode-with-progress.types'
import { STAGE_LABEL_FOR_STATUS } from '@shared/types/episode-production/episode-with-progress.types'

// ...class ProgressCalculator 内部追加：

/**
 * 一次性返回项目下所有集的简化进度（聚合 IPC 用）。
 *
 * 注：内部仍循环调用 calculateEpisodeProgress，只消除前端往返；
 * 后端 N+1 留作后续 SQL 聚合优化。
 */
async listEpisodesWithProgress(
  projectId: string,
): Promise<EpisodeWithProgress[]> {
  const eps = await this.ds
    .getRepository(VideoEpisodeEntity)
    .find({
      where: { projectId } as any,
      order: { episodeNumber: 'ASC' as any },
    })

  const result: EpisodeWithProgress[] = []
  for (const ep of eps) {
    const progress = await this.calculateEpisodeProgress(ep.id)
    const status = (ep as any).status as EpisodeStatus
    result.push({
      id: ep.id,
      projectId: (ep as any).projectId,
      episodeNumber: (ep as any).episodeNumber,
      title: (ep as any).title,
      status,
      progressPct: Math.round(progress.overallProgress * 100),
      currentStageLabel: STAGE_LABEL_FOR_STATUS[status],
    })
  }
  return result
}
```

> 同时在文件顶部加 import：`import type { EpisodeWithProgress } from '@shared/types/episode-production/episode-with-progress.types'` + `import { STAGE_LABEL_FOR_STATUS } from '@shared/types/episode-production/episode-with-progress.types'`。

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/episode-production/workflow/list-episodes-with-progress.spec.ts
```
Expected: PASS（3 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/core/modules/episode-production/workflow/progress-calculator.ts tests/unit/episode-production/workflow/list-episodes-with-progress.spec.ts
git commit -m "feat(ep): ProgressCalculator 新增 listEpisodesWithProgress 聚合方法"
```

---

### Task 3：IPC `ep:list-episodes-with-progress` + preload

**Files:**
- Modify: `src/electron/ipc/handlers/episode-production/workflow.handler.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: workflow.handler.ts 注册新 IPC**

打开 `src/electron/ipc/handlers/episode-production/workflow.handler.ts`，在 `registerWorkflowHandlers()` 内加一行：

```typescript
ipcBridge.handle('ep:list-episodes-with-progress', handleListEpisodesWithProgress)
```

文件末尾加 handler：

```typescript
async function handleListEpisodesWithProgress(
  _event: any,
  projectId: string,
): Promise<IpcResponse> {
  try {
    if (!projectId) return { success: false, error: 'projectId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const calc = new ProgressCalculator(db.dataSource)
    const list = await calc.listEpisodesWithProgress(projectId)
    return { success: true, data: list }
  } catch (e: any) {
    console.error('[handleListEpisodesWithProgress] 异常:', e)
    return { success: false, error: e?.message ?? '获取剧集进度列表失败' }
  }
}
```

> **注：** 顶部 import 已包含 `ProgressCalculator` / `getCoreDatabaseManager`（参考 `handleCalculateEpisodeProgress`），如缺失补齐。

- [ ] **Step 2: preload 加 channel 常量**

打开 `src/preload/index.ts`，找到 `EP_CALCULATE_EPISODE_PROGRESS: 'ep:calculate-episode-progress'` 那一行，下面加：

```typescript
EP_LIST_EPISODES_WITH_PROGRESS: 'ep:list-episodes-with-progress',
```

- [ ] **Step 3: preload 加 API 暴露**

继续在 `src/preload/index.ts`，找到 `calculateEpisodeProgress: (episodeId: string) => ...` 那一行附近，下面加：

```typescript
listEpisodesWithProgress: (projectId: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_EPISODES_WITH_PROGRESS, projectId),
```

- [ ] **Step 4: 跑 typecheck**

```bash
npm run typecheck
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/electron/ipc/handlers/episode-production/workflow.handler.ts src/preload/index.ts
git commit -m "feat(ep): 新增 ep:list-episodes-with-progress IPC + preload 暴露"
```

---

### Task 4：`project.store` 新增 `lastSelectedProjectId` 持久化 + 单测

**Files:**
- Modify: `src/renderer/src/stores/episode-production/project.store.ts`
- Create: `tests/unit/renderer/stores/ep-project-last-selected.spec.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/renderer/stores/ep-project-last-selected.spec.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const STORAGE_KEY = 'ep-production:last-selected-project'

function createMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size },
  } as Storage
}

async function freshStore() {
  vi.resetModules()
  return await import('../../../../src/renderer/src/stores/episode-production/project.store')
}

describe('ep-project store · lastSelectedProjectId 持久化', () => {
  beforeEach(() => {
    ;(globalThis as any).localStorage = createMemoryStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete (globalThis as any).localStorage
  })

  it('localStorage 为空时初始 lastSelectedProjectId = null', async () => {
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    expect(s.lastSelectedProjectId).toBeNull()
  })

  it('setLastSelectedProjectId 写入并持久化', async () => {
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    s.setLastSelectedProjectId('proj-1')
    expect(s.lastSelectedProjectId).toBe('proj-1')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('proj-1')
  })

  it('从 localStorage hydrate', async () => {
    localStorage.setItem(STORAGE_KEY, 'proj-x')
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    expect(s.lastSelectedProjectId).toBe('proj-x')
  })

  it('setLastSelectedProjectId(null) 清除持久化', async () => {
    localStorage.setItem(STORAGE_KEY, 'proj-x')
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    s.setLastSelectedProjectId(null)
    expect(s.lastSelectedProjectId).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/stores/ep-project-last-selected.spec.ts
```
Expected: FAIL，"setLastSelectedProjectId is not a function" 或 "Cannot read property 'lastSelectedProjectId'"

- [ ] **Step 3: 修改 project.store.ts**

打开 `src/renderer/src/stores/episode-production/project.store.ts`，在文件顶部 import 后、`defaultConfig` 之前插入：

```typescript
/** 持久化"上次进入工作台的项目 ID"（用于剧集项目界面 sidebar 默认选中） */
const LAST_SELECTED_PROJECT_KEY = 'ep-production:last-selected-project'

function loadLastSelectedProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_SELECTED_PROJECT_KEY)
  } catch (e) {
    console.warn('[ep-project] 读取 last-selected-project 失败:', e)
    return null
  }
}

function persistLastSelectedProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_SELECTED_PROJECT_KEY, id)
    else localStorage.removeItem(LAST_SELECTED_PROJECT_KEY)
  } catch (e) {
    console.warn('[ep-project] 写入 last-selected-project 失败:', e)
  }
}
```

在 `useEpProjectStore` 工厂函数内（与 `projects` / `currentProject` 同级）加：

```typescript
const lastSelectedProjectId = ref<string | null>(loadLastSelectedProjectId())

function setLastSelectedProjectId(id: string | null): void {
  lastSelectedProjectId.value = id
  persistLastSelectedProjectId(id)
}
```

在 store return 对象里加：

```typescript
lastSelectedProjectId,
setLastSelectedProjectId,
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/stores/ep-project-last-selected.spec.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/episode-production/project.store.ts tests/unit/renderer/stores/ep-project-last-selected.spec.ts
git commit -m "feat(ep): project store 新增 lastSelectedProjectId 持久化"
```

---

## Phase 2 · 项目界面组件

### Task 5：`StageHeaderBar.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue`
- Create: `tests/unit/renderer/components/StageHeaderBar.spec.ts`

> **注：** StageHeaderBar 是给 EpisodeWorkbench 用的，本来属于 Phase 4。但它独立于路由 / Workbench 重构，可先做并跑测试。先做能减少 Phase 4 体量。

- [ ] **Step 1: 写失败测试**

`tests/unit/renderer/components/StageHeaderBar.spec.ts`：

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StageHeaderBar from '../../../../src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue'

const STAGE_LABELS = ['① 内容', '② 资产', '③ 剧本', '④ 分镜', '⑤ 制作', '⑥ 合成']

function mockEpApi(currentStatus: string) {
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(globalThis as any).window.electronAPI = {
    episodeProduction: {
      calculateEpisodeProgress: vi.fn(async () => ({
        success: true,
        data: {
          episodeId: 'ep-1',
          currentStatus,
          stages: [
            { stage: 'pending', label: '内容', mark: '✓', complete: true, progress: 1, gapCount: 0 },
            { stage: 'asset_prep', label: '资产', mark: '✓', complete: true, progress: 1, gapCount: 0 },
            { stage: 'scripting', label: '剧本', mark: '●', complete: false, progress: 0, gapCount: 2 },
            { stage: 'storyboarding', label: '分镜', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'producing', label: '制作', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'composing', label: '合成', mark: '○', complete: false, progress: 0, gapCount: 0 },
          ],
          overallProgress: 0.33,
        },
      })),
    },
  }
}

describe('StageHeaderBar', () => {
  it('episodeId 为 null 不调 IPC，渲染空态', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: null }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.findAll('.stage-segment')).toHaveLength(0)
  })

  it('渲染 6 段文字 label', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const segs = w.findAll('.stage-segment')
    expect(segs).toHaveLength(6)
    segs.forEach((seg, i) => {
      expect(seg.text()).toContain(STAGE_LABELS[i])
    })
  })

  it('当前/完成/未到 3 态有正确 css class', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const segs = w.findAll('.stage-segment')
    expect(segs[0].classes()).toContain('stage-complete')
    expect(segs[1].classes()).toContain('stage-complete')
    expect(segs[2].classes()).toContain('stage-current')
    expect(segs[3].classes()).toContain('stage-pending')
    expect(segs[5].classes()).toContain('stage-pending')
  })

  it('点击段触发 navigate-stage 事件', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    await w.findAll('.stage-segment')[3].trigger('click')
    expect(w.emitted('navigate-stage')).toBeTruthy()
    expect(w.emitted('navigate-stage')![0]).toEqual(['storyboarding'])
  })

  it('expose reload() 重新拉进度', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const apiSpy = (window as any).electronAPI.episodeProduction.calculateEpisodeProgress
    apiSpy.mockClear()
    ;(w.vm as any).reload()
    await flushPromises()
    expect(apiSpy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/StageHeaderBar.spec.ts
```
Expected: FAIL，"Cannot find module .../StageHeaderBar.vue"

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue`：

```vue
<template>
  <div class="stage-header-bar">
    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="errorMessage" class="error">{{ errorMessage }}</div>
    <template v-else-if="progress">
      <div
        v-for="(s, idx) in progress.stages"
        :key="s.stage"
        class="stage-segment"
        :class="segmentClass(s)"
        :title="s.label"
        @click="onClick(s.stage)"
      >
        <span class="stage-label">{{ stageLabel(idx, s.label) }}</span>
        <span v-if="idx < progress.stages.length - 1" class="stage-sep">│</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type {
  EpisodeProgress,
  StageProgress,
  EpisodeStatus,
} from '../../../../../shared/types/episode-production'

const props = defineProps<{ episodeId: string | null }>()

const emit = defineEmits<{
  (e: 'navigate-stage', status: EpisodeStatus): void
}>()

const progress = ref<EpisodeProgress | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const NUMBERED_LABELS = ['① 内容', '② 资产', '③ 剧本', '④ 分镜', '⑤ 制作', '⑥ 合成']

function stageLabel(idx: number, fallback: string): string {
  return NUMBERED_LABELS[idx] ?? fallback
}

function segmentClass(s: StageProgress): Record<string, boolean> {
  return {
    'stage-complete': s.mark === '✓',
    'stage-current': s.mark === '●',
    'stage-pending': s.mark === '○',
  }
}

function onClick(stage: EpisodeStatus): void {
  emit('navigate-stage', stage)
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

<style scoped lang="scss">
.stage-header-bar {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 13px;
}

.loading,
.error {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  padding: 0 8px;
}

.error {
  color: var(--el-color-danger);
}

.stage-segment {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.stage-segment:hover {
  opacity: 0.85;
}

.stage-label {
  color: var(--el-text-color-secondary);
}

.stage-segment.stage-complete .stage-label {
  color: var(--el-color-success);
}

.stage-segment.stage-current .stage-label {
  color: var(--el-color-primary);
  font-weight: 600;
}

.stage-segment.stage-pending .stage-label {
  color: var(--el-text-color-secondary);
}

.stage-sep {
  color: var(--el-border-color-light);
  margin-left: 8px;
  cursor: default;
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/StageHeaderBar.spec.ts
```
Expected: PASS（5 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue tests/unit/renderer/components/StageHeaderBar.spec.ts
git commit -m "feat(ep): 新增 StageHeaderBar 极简文字版 stage 栏"
```

---

### Task 6：`EpisodeCard.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/project-list/EpisodeCard.vue`
- Create: `tests/unit/renderer/components/EpisodeCard.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EpisodeCard from '../../../../src/renderer/src/components/episode-production/project-list/EpisodeCard.vue'
import type { EpisodeWithProgress } from '../../../../src/shared/types/episode-production/episode-with-progress.types'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const sample: EpisodeWithProgress = {
  id: 'ep-1',
  projectId: 'p-1',
  episodeNumber: 3,
  title: '决战紫禁',
  status: 'storyboarding',
  progressPct: 50,
  currentStageLabel: '分镜中',
}

describe('EpisodeCard', () => {
  it('渲染封面 + 第 X 集 · 标题 + 进度 + 阶段', () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    expect(w.text()).toContain('第 3 集 · 决战紫禁')
    expect(w.text()).toContain('分镜中')
    const fill = w.find('.progress-fill')
    expect((fill.element as HTMLElement).style.width).toBe('50%')
  })

  it('点击卡片触发 click 事件', async () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    await w.trigger('click')
    expect(w.emitted('click')).toBeTruthy()
    expect(w.emitted('click')![0]).toEqual([sample])
  })

  it('点击 hover 编辑按钮触发 edit，且不冒泡 click', async () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    await w.find('.edit-btn').trigger('click')
    expect(w.emitted('edit')).toBeTruthy()
    expect(w.emitted('edit')![0]).toEqual([sample])
    expect(w.emitted('click')).toBeFalsy()
  })

  it('点击 hover 删除按钮触发 delete，且不冒泡 click', async () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    await w.find('.delete-btn').trigger('click')
    expect(w.emitted('delete')).toBeTruthy()
    expect(w.emitted('delete')![0]).toEqual([sample])
    expect(w.emitted('click')).toBeFalsy()
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/EpisodeCard.spec.ts
```
Expected: FAIL，"Cannot find module .../EpisodeCard.vue"

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/project-list/EpisodeCard.vue`：

```vue
<template>
  <article class="episode-card" @click="$emit('click', episode)">
    <div class="cover" :class="coverClass">
      <span class="cover-emoji">{{ coverEmoji }}</span>
      <div class="hover-actions">
        <button class="edit-btn" :title="`编辑「第${episode.episodeNumber}集」`" @click.stop="$emit('edit', episode)">
          <el-icon><Edit /></el-icon>
        </button>
        <button class="delete-btn" :title="`删除「第${episode.episodeNumber}集」`" @click.stop="$emit('delete', episode)">
          <el-icon><Delete /></el-icon>
        </button>
      </div>
    </div>
    <div class="body">
      <h3 class="title" :title="`第 ${episode.episodeNumber} 集 · ${episode.title}`">
        第 {{ episode.episodeNumber }} 集 · {{ episode.title }}
      </h3>
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: episode.progressPct + '%' }" />
        </div>
        <span class="progress-text">{{ episode.currentStageLabel }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Edit, Delete } from '@element-plus/icons-vue'
import type { EpisodeWithProgress } from '../../../../../shared/types/episode-production/episode-with-progress.types'

defineOptions({ name: 'EpisodeCard' })

const props = defineProps<{ episode: EpisodeWithProgress }>()

defineEmits<{
  (e: 'click', ep: EpisodeWithProgress): void
  (e: 'edit', ep: EpisodeWithProgress): void
  (e: 'delete', ep: EpisodeWithProgress): void
}>()

const COVER_CLASSES = ['cover-c1', 'cover-c2', 'cover-c3', 'cover-c4'] as const
const COVER_EMOJI = ['🎬', '📖', '🎥', '📺']

const coverClass = computed(() => COVER_CLASSES[props.episode.episodeNumber % COVER_CLASSES.length])
const coverEmoji = computed(() => COVER_EMOJI[props.episode.episodeNumber % COVER_EMOJI.length])
</script>

<style scoped lang="scss">
.episode-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}

.episode-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.episode-card:hover .hover-actions {
  opacity: 1;
}

.cover {
  height: 130px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 60px;
}

.cover-c1 { background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2)); }
.cover-c2 { background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-dark-2)); }
.cover-c3 { background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-dark-2)); }
.cover-c4 { background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-dark-2)); }

.cover-emoji {
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
}

.hover-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.hover-actions button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.hover-actions .edit-btn:hover { background: var(--el-color-primary); }
.hover-actions .delete-btn:hover { background: var(--el-color-danger); }

.body { padding: 14px; }

.title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-track {
  flex: 1;
  height: 4px;
  background: var(--el-fill-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--el-color-success);
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/EpisodeCard.spec.ts
```
Expected: PASS（4 个 it 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/project-list/EpisodeCard.vue tests/unit/renderer/components/EpisodeCard.spec.ts
git commit -m "feat(ep): 新增 EpisodeCard 集卡组件"
```

---

### Task 7：`ProjectSidebar.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/project-list/ProjectSidebar.vue`
- Create: `tests/unit/renderer/components/ProjectSidebar.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ProjectSidebar from '../../../../src/renderer/src/components/episode-production/project-list/ProjectSidebar.vue'
import type { VideoProjectSummary } from '../../../../src/shared/types/story-to-video.types'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const samples: VideoProjectSummary[] = [
  { id: 'p1', name: '项目1', episodeCount: 3, sourceType: 'standalone', progressPct: 0, currentStageLabel: null } as any,
  { id: 'p2', name: '项目2', episodeCount: 0, sourceType: 'linked_lw', progressPct: 0, currentStageLabel: null } as any,
]

describe('ProjectSidebar', () => {
  it('渲染项目列表', () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: null }, ...mountOpts })
    expect(w.findAll('.project-item')).toHaveLength(2)
    expect(w.text()).toContain('项目1')
    expect(w.text()).toContain('项目2')
  })

  it('selectedId 命中时高亮 active', () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: 'p1' }, ...mountOpts })
    const items = w.findAll('.project-item')
    expect(items[0].classes()).toContain('active')
    expect(items[1].classes()).not.toContain('active')
  })

  it('点击项目触发 select', async () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: null }, ...mountOpts })
    await w.findAll('.project-item')[1].trigger('click')
    expect(w.emitted('select')).toBeTruthy()
    expect(w.emitted('select')![0]).toEqual([samples[1]])
  })

  it('新建按钮触发 create', async () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: null }, ...mountOpts })
    await w.find('.create-btn').trigger('click')
    expect(w.emitted('create')).toBeTruthy()
  })

  it('空列表显示空态', () => {
    const w = mount(ProjectSidebar, { props: { projects: [], selectedId: null }, ...mountOpts })
    expect(w.find('.empty-state').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/ProjectSidebar.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/project-list/ProjectSidebar.vue`：

```vue
<template>
  <aside class="project-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">剧集项目</span>
      <el-button type="primary" size="small" class="create-btn" @click="$emit('create')">
        <el-icon><Plus /></el-icon>
        新建
      </el-button>
    </div>
    <div class="project-list">
      <div
        v-for="p in projects"
        :key="p.id"
        class="project-item"
        :class="{ active: p.id === selectedId }"
        @click="$emit('select', p)"
      >
        <div class="item-cover" :class="getCoverClass(p)">
          <span class="cover-emoji">{{ getCoverEmoji(p) }}</span>
        </div>
        <div class="item-body">
          <div class="item-name" :title="p.name">{{ p.name }}</div>
          <div class="item-meta">{{ p.episodeCount }} 集</div>
        </div>
        <el-dropdown trigger="click" @command="onCommand($event, p)" @click.stop>
          <el-button link size="small" class="more-btn" @click.stop>
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rename">重命名</el-dropdown-item>
              <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <el-empty v-if="projects.length === 0" class="empty-state" description="还没有剧集项目" :image-size="80" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Plus, MoreFilled } from '@element-plus/icons-vue'
import type { VideoProjectSummary } from '../../../../../shared/types/story-to-video.types'

const props = defineProps<{
  projects: VideoProjectSummary[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'select', project: VideoProjectSummary): void
  (e: 'rename', project: VideoProjectSummary): void
  (e: 'delete', project: VideoProjectSummary): void
}>()

const COVER_CLASSES = ['cover-c1', 'cover-c2', 'cover-c3', 'cover-c4'] as const
const COVER_EMOJI = ['🎬', '📖', '🎥', '📺']

function hashIndex(id: string, mod: number): number {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return sum % mod
}

function getCoverClass(p: VideoProjectSummary): string {
  return COVER_CLASSES[hashIndex(p.id, COVER_CLASSES.length)]
}

function getCoverEmoji(p: VideoProjectSummary): string {
  return COVER_EMOJI[hashIndex(p.id, COVER_EMOJI.length)]
}

function onCommand(command: string, p: VideoProjectSummary): void {
  if (command === 'rename') emit('rename', p)
  else if (command === 'delete') emit('delete', p)
}
</script>

<style scoped lang="scss">
.project-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  height: 100%;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.project-list {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}

.project-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.project-item:hover {
  background: var(--el-fill-color-light);
}

.project-item.active {
  background: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}

.item-cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
}

.item-cover.cover-c1 { background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2)); }
.item-cover.cover-c2 { background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-dark-2)); }
.item-cover.cover-c3 { background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-dark-2)); }
.item-cover.cover-c4 { background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-dark-2)); }

.item-body {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.more-btn {
  flex-shrink: 0;
}

.empty-state {
  margin-top: 32px;
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/ProjectSidebar.spec.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/project-list/ProjectSidebar.vue tests/unit/renderer/components/ProjectSidebar.spec.ts
git commit -m "feat(ep): 新增 ProjectSidebar 项目列表组件"
```

---

### Task 8：`EpisodeListPanel.vue` + 单测

**Files:**
- Create: `src/renderer/src/components/episode-production/project-list/EpisodeListPanel.vue`
- Create: `tests/unit/renderer/components/EpisodeListPanel.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EpisodeListPanel from '../../../../src/renderer/src/components/episode-production/project-list/EpisodeListPanel.vue'
import type { VideoProject } from '../../../../src/shared/types/story-to-video.types'
import type { EpisodeWithProgress } from '../../../../src/shared/types/episode-production/episode-with-progress.types'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const project: VideoProject = { id: 'p1', name: '我的项目', config: {} as any } as any
const episodes: EpisodeWithProgress[] = [
  { id: 'e1', projectId: 'p1', episodeNumber: 1, title: '回1', status: 'pending', progressPct: 0, currentStageLabel: '未开始' },
  { id: 'e2', projectId: 'p1', episodeNumber: 2, title: '回2', status: 'scripting', progressPct: 30, currentStageLabel: '剧本中' },
]

describe('EpisodeListPanel', () => {
  it('渲染 page-header（项目名 + X 集）', () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    expect(w.text()).toContain('我的项目')
    expect(w.text()).toContain('2 集')
  })

  it('集 grid + 末尾占位卡', () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    expect(w.findAllComponents({ name: 'EpisodeCard' })).toHaveLength(2)
    expect(w.find('.episode-card-new').exists()).toBe(true)
  })

  it('点击 [项目设置] 触发 settings', async () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    await w.find('.btn-settings').trigger('click')
    expect(w.emitted('settings')).toBeTruthy()
  })

  it('点击 [+ 新建剧集] 或占位卡触发 create-episode', async () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    await w.find('.btn-create-episode').trigger('click')
    expect(w.emitted('create-episode')).toBeTruthy()

    await w.find('.episode-card-new').trigger('click')
    expect(w.emitted('create-episode')).toHaveLength(2)
  })

  it('集卡 emit 透传 click / edit / delete', async () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    const cards = w.findAllComponents({ name: 'EpisodeCard' })
    await cards[0].vm.$emit('click', episodes[0])
    expect(w.emitted('open-episode')![0]).toEqual([episodes[0]])
    await cards[1].vm.$emit('edit', episodes[1])
    expect(w.emitted('edit-episode')![0]).toEqual([episodes[1]])
    await cards[0].vm.$emit('delete', episodes[0])
    expect(w.emitted('delete-episode')![0]).toEqual([episodes[0]])
  })

  it('空集列表只显示占位卡', () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes: [] }, ...mountOpts })
    expect(w.findAllComponents({ name: 'EpisodeCard' })).toHaveLength(0)
    expect(w.find('.episode-card-new').exists()).toBe(true)
    expect(w.text()).toContain('0 集')
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- tests/unit/renderer/components/EpisodeListPanel.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 写组件**

`src/renderer/src/components/episode-production/project-list/EpisodeListPanel.vue`：

```vue
<template>
  <section class="episode-list-panel">
    <div class="page-header">
      <div class="title-block">
        <h1 class="page-title" :title="project.name">{{ project.name }}</h1>
        <p class="page-subtitle">{{ episodes.length }} 集</p>
      </div>
      <div class="actions">
        <el-button class="btn-settings" @click="$emit('settings')">
          <el-icon><Setting /></el-icon>
          项目设置
        </el-button>
        <el-button type="primary" class="btn-create-episode" @click="$emit('create-episode')">
          <el-icon><Plus /></el-icon>
          新建剧集
        </el-button>
      </div>
    </div>
    <div class="episode-grid">
      <EpisodeCard
        v-for="ep in episodes"
        :key="ep.id"
        :episode="ep"
        @click="$emit('open-episode', $event)"
        @edit="$emit('edit-episode', $event)"
        @delete="$emit('delete-episode', $event)"
      />
      <button class="episode-card-new" @click="$emit('create-episode')">
        <el-icon :size="32"><Plus /></el-icon>
        <span>新建剧集</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Setting, Plus } from '@element-plus/icons-vue'
import EpisodeCard from './EpisodeCard.vue'
import type { VideoProject } from '../../../../../shared/types/story-to-video.types'
import type { EpisodeWithProgress } from '../../../../../shared/types/episode-production/episode-with-progress.types'

defineProps<{
  project: VideoProject
  episodes: EpisodeWithProgress[]
}>()

defineEmits<{
  (e: 'settings'): void
  (e: 'create-episode'): void
  (e: 'open-episode', ep: EpisodeWithProgress): void
  (e: 'edit-episode', ep: EpisodeWithProgress): void
  (e: 'delete-episode', ep: EpisodeWithProgress): void
}>()
</script>

<style scoped lang="scss">
.episode-list-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.title-block {
  flex: 1;
  min-width: 0;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.episode-grid {
  flex: 1;
  overflow: auto;
  padding: 20px 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-content: start;
}

.episode-card-new {
  min-height: 220px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--el-text-color-placeholder);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
}

.episode-card-new:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
</style>
```

- [ ] **Step 4: 跑测试看通过**

```bash
npm test -- tests/unit/renderer/components/EpisodeListPanel.spec.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/episode-production/project-list/EpisodeListPanel.vue tests/unit/renderer/components/EpisodeListPanel.spec.ts
git commit -m "feat(ep): 新增 EpisodeListPanel 右栏组件"
```

---

## Phase 3 · 项目界面集成

### Task 9：重写 `EpisodeProjectListV2.vue`（两栏 + 迁入 3 个 dialog）

**Files:**
- Modify: `src/renderer/src/views/EpisodeProjectListV2.vue`（完全重写）

> 这是大块改动，按 step 逐部分实现。把这个 view 改写成"两栏组合 + 持有 dialog 状态"的容器。

- [ ] **Step 1: 写 template + script setup 骨架（替换全文件）**

`src/renderer/src/views/EpisodeProjectListV2.vue`：

```vue
<template>
  <div class="ep-project-list-v3">
    <ProjectSidebar
      :projects="summaries"
      :selected-id="selectedProjectId"
      @create="showCreateProjectDialog = true"
      @select="onSelectProject"
      @rename="onRenameProject"
      @delete="onDeleteProject"
    />

    <main class="main-area">
      <EpisodeListPanel
        v-if="selectedProject && episodes !== null"
        :project="selectedProject"
        :episodes="episodes"
        @settings="dialogs.settings = true"
        @create-episode="dialogs.createEpisode = true"
        @open-episode="onOpenEpisode"
        @edit-episode="onEditEpisode"
        @delete-episode="onDeleteEpisode"
      />
      <div v-else-if="loadingProject" class="loading">加载剧集中…</div>
      <div v-else class="empty-state">
        <el-icon :size="64"><Folder /></el-icon>
        <p>请选择一个项目，或点击左上角"新建"创建</p>
      </div>
    </main>

    <!-- 创建项目 dialog（沿用旧 V2 inline 实现） -->
    <el-dialog v-model="showCreateProjectDialog" title="新建剧集项目" width="600px" :close-on-click-modal="false">
      <el-form :model="createProjectForm" label-width="100px">
        <el-form-item label="项目名称" required>
          <el-input v-model="createProjectForm.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="关联长文">
          <el-select
            v-model="createProjectForm.longWritingProjectId"
            placeholder="可选 — 关联后剧集可用长文实体作 linked_lw"
            clearable
            style="width: 100%"
          >
            <el-option v-for="lw in longWritingProjects" :key="lw.id" :label="lw.name" :value="lw.id" />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">视频配置</el-divider>
        <el-form-item label="画幅比例">
          <el-select v-model="createProjectForm.config.aspectRatio" style="width: 100%">
            <el-option label="16:9 横屏" value="16:9" />
            <el-option label="9:16 竖屏" value="9:16" />
            <el-option label="4:3 标准" value="4:3" />
            <el-option label="1:1 方形" value="1:1" />
          </el-select>
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="createProjectForm.config.resolution" style="width: 100%">
            <el-option label="4K (3840×2160)" :value="2160" />
            <el-option label="2K (2560×1440)" :value="1440" />
            <el-option label="Full HD (1920×1080)" :value="1080" />
            <el-option label="HD (1280×720)" :value="720" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率">
          <el-select v-model="createProjectForm.config.fps" style="width: 100%">
            <el-option label="24 fps（电影）" :value="24" />
            <el-option label="30 fps（标准）" :value="30" />
            <el-option label="60 fps（高帧率）" :value="60" />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">风格</el-divider>
        <el-form-item label="项目风格">
          <el-select
            v-model="createProjectForm.config.styleAnchors"
            multiple filterable allow-create default-first-option
            placeholder="选择或输入主流风格（多选）"
            style="width: 100%"
          >
            <el-option v-for="s in STYLE_PRESETS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateProjectDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!createProjectForm.name.trim()"
          :loading="creating"
          @click="onConfirmCreateProject"
        >创建</el-button>
      </template>
    </el-dialog>

    <!-- 项目设置 dialog（从 EpisodeWorkbench 迁入） -->
    <SettingsDialog
      v-if="selectedProject"
      v-model="dialogs.settings"
      :all-lw-projects="longWritingProjects"
      :provider-configs="providerConfigs"
      :provider-templates="providerTemplates"
      @saved="onSettingsSaved"
    />

    <!-- 新建剧集 dialog（迁入） -->
    <CreateEpisodeDialog
      v-if="selectedProjectId"
      v-model="dialogs.createEpisode"
      :project-id="selectedProjectId"
      :initial-episode-number="(episodes?.length ?? 0) + 1"
      :outline-tree-data="outlineTreeData"
      @created="onEpisodeCreated"
    />

    <!-- 编辑剧集 dialog（迁入） -->
    <EditEpisodeDialog
      v-model="dialogs.editEpisode"
      :episode-id="dialogs.editingEpisodeId"
      :initial-number="dialogs.editingEpisodeNumber"
      :initial-title="dialogs.editingEpisodeTitle"
      @updated="onEpisodeUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import ProjectSidebar from '@/components/episode-production/project-list/ProjectSidebar.vue'
import EpisodeListPanel from '@/components/episode-production/project-list/EpisodeListPanel.vue'
import CreateEpisodeDialog from '@/components/episode-production/dialogs/CreateEpisodeDialog.vue'
import EditEpisodeDialog from '@/components/episode-production/dialogs/EditEpisodeDialog.vue'
import SettingsDialog from '@/components/episode-production/dialogs/SettingsDialog.vue'
import { STYLE_PRESETS } from '@core/modules/episode-production/assets/constants/style-presets'
import { useEpProjectStore } from '@/stores/episode-production/project.store'
import type {
  VideoProject,
  VideoProjectSummary,
  VideoProjectConfig,
} from '../../../shared/types/story-to-video.types'
import type { EpisodeWithProgress } from '../../../shared/types/episode-production/episode-with-progress.types'
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'
import { buildOutlineTree, type OutlineTreeNode } from '@/components/episode-production/shared/outline-utils'

const router = useRouter()
const projectStore = useEpProjectStore()

// ===== 项目列表 =====
const summaries = ref<VideoProjectSummary[]>([])
const selectedProjectId = ref<string | null>(null)
const selectedProject = ref<VideoProject | null>(null)
const longWritingProjects = ref<Array<{ id: string; name: string }>>([])

// ===== 集列表 =====
const episodes = ref<EpisodeWithProgress[] | null>(null)
const loadingProject = ref(false)

// ===== 项目设置 dialog 所需上下文 =====
const providerConfigs = ref<UserProviderConfig[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])
const outlineTreeData = ref<OutlineTreeNode[]>([])

// ===== Dialog 状态 =====
const showCreateProjectDialog = ref(false)
const creating = ref(false)
const createProjectForm = reactive<{
  name: string
  longWritingProjectId: string
  config: VideoProjectConfig
}>({
  name: '',
  longWritingProjectId: '',
  config: {
    aspectRatio: '16:9',
    resolution: 1080 as any,
    fps: 30,
    defaultTransition: 'fade' as any,
    stylePrompt: '',
    styleAnchors: [],
  } as VideoProjectConfig,
})
const dialogs = reactive({
  settings: false,
  createEpisode: false,
  editEpisode: false,
  editingEpisodeId: '',
  editingEpisodeNumber: 1,
  editingEpisodeTitle: '',
})

// ===== 数据加载 =====

async function loadSummaries(): Promise<void> {
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.listProjectsSummary) {
    ElMessage.error('当前环境不支持 listProjectsSummary')
    return
  }
  const resp = await api.listProjectsSummary()
  if (!resp.success) {
    ElMessage.error(resp.error || '加载项目失败')
    return
  }
  summaries.value = resp.data as VideoProjectSummary[]

  // 默认选中：上次进入工作台的项目，找不到则取首个
  if (!selectedProjectId.value && summaries.value.length > 0) {
    const last = projectStore.lastSelectedProjectId
    const initial =
      (last && summaries.value.find((p) => p.id === last)?.id) ||
      summaries.value[0].id
    await selectProject(initial)
  }
}

async function loadLongWritingProjects(): Promise<void> {
  const resp = await window.electronAPI.longwriting.getProjects()
  if (resp.success && resp.data) {
    longWritingProjects.value = resp.data.map((p: any) => ({ id: p.id, name: p.name }))
  }
}

async function loadProviderConfigs(): Promise<void> {
  const respConfigs = await window.electronAPI.providers.listUserConfigs()
  if (respConfigs.success && respConfigs.data) providerConfigs.value = respConfigs.data
  const respTpl = await window.electronAPI.providers.listTemplates()
  if (respTpl.success && respTpl.data) providerTemplates.value = respTpl.data
}

async function selectProject(projectId: string): Promise<void> {
  if (selectedProjectId.value === projectId) return
  loadingProject.value = true
  selectedProjectId.value = projectId
  selectedProject.value = null
  episodes.value = null
  try {
    const api = window.electronAPI.episodeProduction
    const projResp = await api.getProject(projectId)
    if (!projResp.success || !projResp.data) {
      ElMessage.error(projResp.error || '项目加载失败')
      selectedProjectId.value = null
      return
    }
    selectedProject.value = projResp.data as VideoProject
    await reloadEpisodes()
  } finally {
    loadingProject.value = false
  }
}

async function reloadEpisodes(): Promise<void> {
  if (!selectedProjectId.value) return
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.listEpisodesWithProgress) {
    ElMessage.error('当前环境不支持 listEpisodesWithProgress')
    episodes.value = []
    return
  }
  const resp = await api.listEpisodesWithProgress(selectedProjectId.value)
  if (!resp.success) {
    ElMessage.error(resp.error || '加载剧集失败')
    episodes.value = []
    return
  }
  episodes.value = resp.data as EpisodeWithProgress[]
}

// ===== 项目操作 =====

function onSelectProject(p: VideoProjectSummary): void {
  void selectProject(p.id)
}

async function onRenameProject(p: VideoProjectSummary): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('输入新名称', '重命名项目', {
      inputValue: p.name,
      inputValidator: (v) => (!!v && v.trim().length > 0) || '名称不能为空',
    })
    const resp = await window.electronAPI.episodeProduction.updateProject(p.id, { name: value.trim() })
    if (!resp.success) {
      ElMessage.error(resp.error || '重命名失败')
      return
    }
    ElMessage.success('已重命名')
    await loadSummaries()
    if (selectedProjectId.value === p.id) {
      const projResp = await window.electronAPI.episodeProduction.getProject(p.id)
      if (projResp.success && projResp.data) selectedProject.value = projResp.data as VideoProject
    }
  } catch {
    /* 取消 */
  }
}

async function onDeleteProject(p: VideoProjectSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除项目「${p.name}」？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  const resp = await window.electronAPI.episodeProduction.deleteProject(p.id)
  if (!resp.success) {
    ElMessage.error(resp.error || '删除失败')
    return
  }
  ElMessage.success('已删除')
  if (selectedProjectId.value === p.id) {
    selectedProjectId.value = null
    selectedProject.value = null
    episodes.value = null
    if (projectStore.lastSelectedProjectId === p.id) projectStore.setLastSelectedProjectId(null)
  }
  await loadSummaries()
}

async function onConfirmCreateProject(): Promise<void> {
  const name = createProjectForm.name.trim()
  if (!name) {
    ElMessage.warning('请输入项目名称')
    return
  }
  creating.value = true
  try {
    const resp = await window.electronAPI.episodeProduction.createProject(
      name,
      createProjectForm.longWritingProjectId || undefined,
      createProjectForm.config,
    )
    if (!resp.success || !resp.data) {
      ElMessage.error(resp.error || '创建失败')
      return
    }
    ElMessage.success('已创建')
    showCreateProjectDialog.value = false
    createProjectForm.name = ''
    createProjectForm.longWritingProjectId = ''
    await loadSummaries()
    await selectProject(resp.data.id)
  } finally {
    creating.value = false
  }
}

// ===== 集操作 =====

function onOpenEpisode(ep: EpisodeWithProgress): void {
  router.push(`/episode-production/${ep.projectId}/episode/${ep.id}`)
}

function onEditEpisode(ep: EpisodeWithProgress): void {
  dialogs.editingEpisodeId = ep.id
  dialogs.editingEpisodeNumber = ep.episodeNumber
  dialogs.editingEpisodeTitle = ep.title
  dialogs.editEpisode = true
}

async function onDeleteEpisode(ep: EpisodeWithProgress): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「第 ${ep.episodeNumber} 集 · ${ep.title}」？`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  const resp = await window.electronAPI.episodeProduction.deleteEpisode(ep.id)
  if (!resp.success) {
    ElMessage.error(resp.error || '删除失败')
    return
  }
  ElMessage.success('已删除')
  await reloadEpisodes()
  await loadSummaries() // 总集数变了
}

async function onEpisodeCreated(): Promise<void> {
  await reloadEpisodes()
  await loadSummaries()
}

async function onEpisodeUpdated(): Promise<void> {
  await reloadEpisodes()
}

async function onSettingsSaved(): Promise<void> {
  if (selectedProjectId.value) {
    const projResp = await window.electronAPI.episodeProduction.getProject(selectedProjectId.value)
    if (projResp.success && projResp.data) selectedProject.value = projResp.data as VideoProject
  }
  await loadSummaries()
}

onMounted(async () => {
  await loadLongWritingProjects()
  await loadProviderConfigs()
  await loadSummaries()
})
</script>

<style scoped lang="scss">
.ep-project-list-v3 {
  display: flex;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.empty-state,
.loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
```

- [ ] **Step 2: 跑 typecheck + lint**

```bash
npm run typecheck
npm run lint -- src/renderer/src/views/EpisodeProjectListV2.vue
```
Expected: PASS

- [ ] **Step 3: 启 dev 看效果（手验）**

```bash
npm run dev
```
打开浏览器进 `/episode-production`：
- 看到左 sidebar + 右栏 empty
- 选项目 → 集列表
- 新建项目 / 重命名 / 删除可用
- 项目设置 / 新建剧集 / 编辑剧集 / 删除剧集 dialog 全部正常

> **注：** 点集卡进工作台此刻**会失败**（路由 `/episode-production/:projectId/episode/:episodeId` 还没加），属于预期 — 在 Phase 4 一起补。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/views/EpisodeProjectListV2.vue
git commit -m "feat(ep): 重写 EpisodeProjectListV2 为两栏布局 + 迁入 3 个 dialog"
```

---

## Phase 4 · 制作界面 + 路由

### Task 10：路由新增 `/episode-production/:projectId/episode/:episodeId` + `:projectId` beforeEnter

**Files:**
- Modify: `src/renderer/src/router/index.ts`

- [ ] **Step 1: 改路由**

打开 `src/renderer/src/router/index.ts`，找到现有 `/episode-production/:projectId` 项。改成：

```typescript
{
  path: '/episode-production/:projectId',
  name: 'EpisodeProjectShortcut',
  // 旧路径：直接访问项目无 episodeId 时，beforeEnter 选首集 redirect
  beforeEnter: async (to) => {
    const projectId = to.params.projectId as string
    try {
      const api = (window as any).electronAPI?.episodeProduction
      const resp = await api.listEpisodes(projectId)
      if (resp?.success && Array.isArray(resp.data) && resp.data.length > 0) {
        const first = resp.data[0]
        return `/episode-production/${projectId}/episode/${first.id}`
      }
      return '/episode-production'
    } catch {
      return '/episode-production'
    }
  },
  // 给 vue-router 一个空的 component 占位，避免报 missing component 警告
  component: { template: '<div />' },
},
{
  path: '/episode-production/:projectId/episode/:episodeId',
  name: 'EpisodeWorkbench',
  component: () => import('@/views/EpisodeWorkbench.vue'),
  meta: { title: '剧集编辑' },
},
```

> **注：** 兼容旧 `/story-to-video/:projectId` redirect 保持不变（重定向后由本 beforeEnter 接管再跳到首集）。

- [ ] **Step 2: 跑 typecheck**

```bash
npm run typecheck
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/router/index.ts
git commit -m "feat(ep): 新增 episode/:episodeId 路由 + projectId 路径 beforeEnter 转首集"
```

---

### Task 11：重构 `EpisodeWorkbench.vue`（header + 删除 dialog 引用 + 按 episodeId 选集）

**Files:**
- Modify: `src/renderer/src/views/EpisodeWorkbench.vue`

> 这一步是计划里最大的改动。**注意：** 不动主区 6 个 stage view 的内部逻辑，只动 header + dialog 引用 + loadProject 的"选哪个集"。

- [ ] **Step 1: 改 template — header + 删 BottomTimeline + 删 3 个 dialog**

打开 `src/renderer/src/views/EpisodeWorkbench.vue`，替换顶部 `<div class="editor-header">` 至 `<StageProgressBar />` 整段（约 49 行）为：

```vue
    <!-- 顶部 header（FU7 重构：单行 40px = 返回 + 第X集标题 + StageHeaderBar） -->
    <div class="editor-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="episode-title" v-if="episodeStore.currentEpisode">
          第 {{ episodeStore.currentEpisode.episodeNumber }} 集 · {{ episodeStore.currentEpisode.title }}
        </span>
      </div>
      <div class="header-center">
        <StageHeaderBar
          v-if="episodeStore.currentEpisode"
          ref="headerBarRef"
          :episode-id="episodeStore.currentEpisode.id"
          @navigate-stage="onNavigateStage"
        />
      </div>
      <div class="header-right" />
    </div>
```

同时删除：
- 原 `<StageProgressBar ref="progressBarRef" ... />` 整段（紧跟在 header 下方）
- 模板末尾 `<BottomTimeline ... />` 整段
- 模板末尾 `<CreateEpisodeDialog ... />`
- 模板末尾 `<EditEpisodeDialog ... />`
- 模板末尾 `<SettingsDialog ... />`

> 其余 11 个 dialog（BindCharacterDialog / BindItemDialog / BindLocationDialog / StoryboardEditDialog / CharacterDetailDialog / ItemDetailDialog / LocationDetailDialog / EntityEditDialog / AssetEditDrawer 等）保留。

- [ ] **Step 2: 改 script setup —— import / store / dialogs**

定位 `import StageProgressBar from ...` 一行，整行改为：

```typescript
import StageHeaderBar from '@/components/episode-production/workbench/StageHeaderBar.vue'
```

定位 `import BottomTimeline from ...` 一行，删除（连同模板里使用一起删了）。

定位 `import CreateEpisodeDialog from ...` / `EditEpisodeDialog` / `SettingsDialog` 三行，全部删除（dialog 已迁出）。

定位 `const progressBarRef = ref<...>(null)`，改为：

```typescript
const headerBarRef = ref<{ reload: () => Promise<void> } | null>(null)
```

定位 `dialogs` reactive 对象内容，删除以下 key：
- `createEpisode: false,`
- `editEpisode: false,`
- `editingEpisodeId: ''`，
- `editingEpisodeNumber: 1`，
- `editingEpisodeTitle: ''`，
- `settings: false,`

- [ ] **Step 3: 改 selectEpisode + loadProject 入口逻辑**

定位 `const projectId = computed(() => route.params.projectId as string)`，下方加：

```typescript
const episodeIdParam = computed(() => route.params.episodeId as string | undefined)
```

定位 `async function loadProject() { ... await selectEpisode(initial) ... }`，把"选回上次集"那段（`const initial = episodeStore.pickInitialEpisode(...)` 块）替换为：

```typescript
    if (!episodeIdParam.value) {
      ElMessage.warning('未指定剧集 ID，回到项目列表')
      router.replace('/episode-production')
      return
    }
    const target = episodeStore.episodes.find((ep) => ep.id === episodeIdParam.value)
    if (!target) {
      ElMessage.warning('剧集不存在或已删除')
      router.replace(`/episode-production/${projectId.value}`)
      return
    }
    if ((target as any).projectId !== projectId.value) {
      ElMessage.error('剧集与项目不匹配')
      router.replace('/episode-production')
      return
    }
    await selectEpisode(target)

    // 写入 lastSelectedProjectId（供项目界面 sidebar 默认选中用）
    projectStore.setLastSelectedProjectId(projectId.value)
```

> `projectStore` 已经在文件顶部 import（`useEpProjectStore`）；如未 import 则补 `import { useEpProjectStore } from '@/stores/episode-production/project.store'` 并 `const projectStore = useEpProjectStore()`。

定位 `watch(projectId, () => { loadProject() }, { immediate: true })`，改为同时监听 episodeId：

```typescript
watch(
  [projectId, episodeIdParam],
  () => loadProject(),
  { immediate: true },
)
```

定位 `const { onNavigateStage, onEpisodeSelectChange, ... } = useWorkbenchStageNavigation({ ..., progressBarRef, ... })`，把 `progressBarRef` 改成 `headerBarRef`：

```typescript
const {
  onNavigateStage,
  onOpenAsset,
  onAddAsset,
  onPreviewEpisode,
  onSelectStoryboard,
  onEditStoryboardFromStage,
  onJumpToProductionWithSb,
  onContentConfirmed,
} = useWorkbenchStageNavigation({
  activeTab,
  selectedAsset,
  dialogs,
  headerBarRef,
  selectEpisode,
})
```

> 同步删除已不存在的 `onEpisodeSelectChange` 解构（episode select 已删）。

定位 `function openCreateEpisodeDialog() { ... }` / `openEditEpisodeDialog(...)` / `confirmDeleteEpisode(...)` / `onEpisodeCreated()` / `onEpisodeUpdated()` / `onSettingsSaved(...)`：删除（这些函数都跟已迁出 dialog 相关）。

- [ ] **Step 4: 改 style — header 单行布局**

定位 `.editor-header` 整段，替换为：

```scss
.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  height: 40px;
  min-height: 40px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    min-width: 200px;
  }

  .header-center {
    flex: 1;
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
  }

  .header-right {
    flex-shrink: 0;
    width: 16px;
  }

  .episode-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 280px;
  }
}
```

- [ ] **Step 5: 跑 typecheck + lint**

```bash
npm run typecheck
npm run lint -- src/renderer/src/views/EpisodeWorkbench.vue
```
Expected: PASS

- [ ] **Step 6: 启 dev 手验**

```bash
npm run dev
```
- 进项目列表 → 选项目 → 点集卡 → 看到 URL 变 `.../episode/:episodeId`
- header 显示 "← 返回 / 第 X 集 · 标题 / stage 栏"
- 点 stage 段切换主区
- 点返回 → 回项目列表 → 该项目仍选中

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/EpisodeWorkbench.vue
git commit -m "feat(ep): 重构 EpisodeWorkbench header 极简版 + 删除 3 个 dialog 引用 + 按 episodeId 选集"
```

---

### Task 12：清理 `use-workbench-stage-navigation.ts`（`progressBarRef` → `headerBarRef`）

**Files:**
- Modify: `src/renderer/src/composables/use-workbench-stage-navigation.ts`

- [ ] **Step 1: 改入参名**

打开 `src/renderer/src/composables/use-workbench-stage-navigation.ts`：

- 把所有 `progressBarRef` 改名为 `headerBarRef`（包括类型注释）
- 把所有 `progressBarRef.value?.reload?.()` 调用改为 `headerBarRef.value?.reload?.()`
- 把入参类型对齐 StageHeaderBar expose：

```typescript
headerBarRef: import('vue').Ref<{ reload: () => Promise<void> } | null>
```

> 内部还有一个 `onEpisodeSelectChange` 函数——它依赖现已删除的"集 select"。如调用它的位置都已删除，则把该函数删除并从 return 移除。

- [ ] **Step 2: 跑 typecheck**

```bash
npm run typecheck
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/composables/use-workbench-stage-navigation.ts
git commit -m "refactor(ep): use-workbench-stage-navigation 入参 progressBarRef → headerBarRef"
```

---

## Phase 5 · 收尾

### Task 13：删除 `StageProgressBar.vue` / `BottomTimeline.vue`

**Files:**
- Delete: `src/renderer/src/components/episode-production/workbench/StageProgressBar.vue`
- Delete: `src/renderer/src/components/episode-production/workbench/BottomTimeline.vue`

- [ ] **Step 1: 再 grep 一次确认无引用**

```bash
grep -rn "StageProgressBar\b\|BottomTimeline\b" src/ --include="*.vue" --include="*.ts" | grep -v "^src/renderer/src/components/episode-production/workbench/StageProgressBar.vue" | grep -v "^src/renderer/src/components/episode-production/workbench/BottomTimeline.vue"
```
Expected: 输出为空（除开文件自身的注释 / 路径），证明无外部引用。

- [ ] **Step 2: 删除文件**

```bash
rm src/renderer/src/components/episode-production/workbench/StageProgressBar.vue
rm src/renderer/src/components/episode-production/workbench/BottomTimeline.vue
```

- [ ] **Step 3: 跑 typecheck + lint + 单测**

```bash
npm run typecheck
npm run lint
npm test -- tests/unit
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ep): 删除已弃用的 StageProgressBar 和 BottomTimeline 组件"
```

---

### Task 14：全量验证 + E2E + 暗主题 + 双端

**Files:**（无文件修改）

- [ ] **Step 1: 全量单测**

```bash
npm test -- tests/unit
```
Expected: 全 PASS

- [ ] **Step 2: 全量 typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: 全 PASS

- [ ] **Step 3: PC dev 端 E2E 手验**

```bash
npm run dev
```
按以下脚本走一遍（参考 spec § 7.2）：

1. 进 `/episode-production` → 看到左 sidebar + 右栏（默认选中上次项目或首个）
2. 点别的项目 → 右栏切换集列表
3. 点 [+ 新建项目] → dialog → 创建 → sidebar 出现新项目
4. 项目 sidebar item ⋯ → [重命名] → prompt → 改名生效
5. 项目 sidebar item ⋯ → [删除] → confirm → 项目消失，主区回 empty
6. 选一个有集的项目 → 点 [项目设置] → SettingsDialog 弹出 → 改 → 保存
7. 点 [+ 新建剧集] → CreateEpisodeDialog → 创建 → 集卡出现
8. hover 集卡 → 右上角 [✏][🗑] → 编辑 / 删除均可
9. 点集卡 → URL 变 `.../episode/:episodeId` → header 显示"第 X 集 · 标题"
10. 点 header stage 段 → 主区切换
11. 点 [←] 返回 → 回项目列表 → 该项目仍选中 → 集列表仍显示

- [ ] **Step 4: 暗主题验证**

在 PC dev 端切换到暗主题（Element Plus 暗色），重做步骤 3 的 1-11，确认无写死颜色 / 高对比异常。

- [ ] **Step 5: Web 端验证**

```bash
PGDATABASE=the_bot_test npm run dev:web
```
浏览器登录 test@local.dev / test123456，重做步骤 3 的 1-11。

- [ ] **Step 6: 走 dod checklist**

参考 `docs/superpowers/dod/2026-05-05`，过 5 阶段自查 + 7 红线。

- [ ] **Step 7: 截图归档**

把项目界面、剧集制作界面（亮 + 暗）共 4 张截图存到 `progress/2026-05-08-ep-redesign/`。

- [ ] **Step 8: 整理本次任务记录**

新建 `progress/2026-05-08-ep-redesign/notes.md`，记录：
- 实施过程中遇到的非显然问题及解决
- 与 spec 偏离的地方（如有）
- 后续 follow-up（如 SQL 聚合优化）

```bash
git add progress/2026-05-08-ep-redesign/
git commit -m "docs(progress): 归档剧集制作 UI 重构截图与笔记"
```

---

## Self-Review

### 1. Spec 覆盖检查

| spec 章节 | 对应 task |
|---|---|
| § 2 路由 | Task 10 |
| § 3.1-3.3 项目界面布局 | Task 6/7/8/9 |
| § 3.4 dialog 归属 | Task 9（迁入）+ Task 11（迁出） |
| § 4 制作界面 header | Task 5 + Task 11 |
| § 5.1 改写文件 | Task 9 + Task 11 |
| § 5.2 新增文件 | Task 5/6/7/8 |
| § 5.3 修改文件 | Task 1/2/3/4/10/11/12 |
| § 5.4 删除文件 | Task 13 |
| § 6.1 IPC + 类型 | Task 1/2/3 |
| § 6.1 currentStageLabel 映射 | Task 1（STAGE_LABEL_FOR_STATUS） |
| § 7.1 单测 | Task 2/4/5/6/7/8 |
| § 7.2 E2E + § 7.3 验证清单 | Task 14 |

### 2. 类型一致性

- `EpisodeWithProgress`：Task 1 定义，Task 2/3 使用，Task 6/8 props 类型，Task 9 数据状态——一致。
- `STAGE_LABEL_FOR_STATUS`：Task 1 定义，Task 2 实现使用——一致。
- StageHeaderBar expose `{ reload: () => Promise<void> }`：Task 5 定义，Task 11/12 引用——一致。
- `lastSelectedProjectId` / `setLastSelectedProjectId`：Task 4 定义，Task 9/11 使用——一致。

### 3. 占位符扫描

无 TBD / TODO / "implement later" / "similar to Task N"。所有代码块完整可执行。

---

## 风险点

| 风险 | 缓解 |
|---|---|
| Task 9 / 11 改动量大，typecheck 一次性失败难定位 | 按 step 顺序逐段改，跑 typecheck 后立即修；任一 step 失败时回退到 step 起点重做 |
| 路由 beforeEnter 调 IPC 导致首屏卡顿 | 仅 `:projectId` 旧路径会触发 beforeEnter；正常用户走 `episode/:episodeId` 不经过此分支 |
| `setupSqliteTestDb` helper 路径未确认 | Task 2 step 1 给了 grep 命令找正确路径再替换 |
| AssetSidebar 在 Workbench 现状是禁用（`showAssetSidebar = computed(() => false)`） | 本计划不动 AssetSidebar；如需启用是后续工作 |

---

