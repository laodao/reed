# 剧集制作 ① 内容 + ③ 剧本合并设计稿

**日期：** 2026-05-08
**作者：** kingcq + Claude（结对设计）
**对照分支：** `feat/episode-production-redesign`
**状态：** Draft（待 user review）
**前置依赖：** `2026-05-08-episode-production-redesign-design.md` 已实施完成（剧集制作 UI 重构 + 5 段 stage 进度栏）

---

## 1. 背景与目标

当前剧集制作工作台 6 个 stage 的"① 内容识别"和"③ 剧本"是两个独立页面：
- **① 内容**：原文片段 + 故事背景 + 3 列识别要素网格（角色 / 地点 / 物品）
- **③ 剧本**：章节梗概 + 场景卡片列表

工作流上"识别要素 → 生成剧本"耦合度高，分页面切换增加心智负担：用户写剧本时需要回看角色/地点/物品但要切 tab；调整要素后回剧本看影响也要切 tab。

本次合并把两个 stage 整合到一个页面：
- 顶部保留**原文片段 + 故事背景**（不动）
- 中部**章节梗概 + 场景列表**（来自 ③ 剧本）
- 右侧**要素清单 sidebar**（替代原 3 列网格）
- **联动**：要素与场景双向高亮 + 场景卡 chip 显示要素

---

## 2. stage 与状态机

### 2.1 UI 层 stage 进度栏：6 → 5 段

```
内容+剧本 │ 资产 │ 分镜 │ 制作 │ 合成
```

每个 UI 段对应一组 `EpisodeStatus`：

| UI 段 | 对应 status 集合 |
|---|---|
| 内容+剧本 | `{ pending, scripting }` |
| 资产 | `{ asset_prep }` |
| 分镜 | `{ storyboarding }` |
| 制作 | `{ producing }` |
| 合成 | `{ composing, completed }` |

**段着色规则（StageHeaderBar 渲染逻辑）：**

```
段着色 = current     若 currentStatus ∈ 段对应集合
段着色 = complete    若 currentStatus 的 order > 段集合最大 order
段着色 = pending     否则
```

**注意非单调情况：** 状态机走 `pending → asset_prep → scripting → storyboarding`，所以从「资产」回到「内容+剧本」段（status=scripting）时，「资产」段会是 complete（绿）而「内容+剧本」是 current（主色）。这是合并段的预期行为——user 在两个 sub-state 都进入"内容+剧本"页面，第二次进时资产已完成。

### 2.2 状态机不变（后端）

后端 `EpisodeStatus` 枚举 + transition 顺序保持现状：

```
pending → asset_prep → scripting → storyboarding → producing → composing → completed
```

后端 `StageGateService` / `progress-calculator` / `episode-status.machine` **不需要改**。

### 2.3 合并页两个 sub-state

合并页随 `episode.status` 显示两种 sub-state，沿用现有按钮 + transition 不变：

| status | sub-state | 主操作按钮（StageMainHeader actions） | transition |
|---|---|---|---|
| `pending` | 识别要素阶段 | 「确认要素 → ② 资产」（启用条件：confirmedCount ≥ 1） | `pending → asset_prep` |
| `scripting` | 剧本生成阶段 | 「完成定稿 → ④ 分镜」（启用条件：剧本已生成 + 引用解析率达标） | `scripting → storyboarding` |
| `asset_prep` 或更后 | 只读回看 | 「已确认 / 已定稿」tag | （此页面不触发 transition） |

> **注意 transition 顺序**：`pending → asset_prep → scripting → ...`。即：识别要素后进资产，资产准备完成后回合并页进入剧本 sub-state，定稿后进分镜。

合并页两个 sub-state UI 区别：
- **pending**：原文 + 故事背景显示；要素 sidebar 出现要素列表（可 confirm / source 切换 / 重新识别）；章节梗概 + 场景列表可隐藏（"待 ② 资产完成后回来生成剧本"提示）
- **scripting**：原文 + 故事背景仍显示（只读）；要素 sidebar 显示已 confirmed 要素（仍可 reidentify）；章节梗概 + 场景列表显式工作区

---

## 3. 页面布局

### 3.1 总览

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 标题：内容+剧本                                              [完成 → 资产]         │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┬───────────────────────────────┐                    │
│ │ 原文片段  [✏][✨ 重新识别] │ 故事背景            [保存]    │                    │
│ │  ……（保持现状）           │  年代/地域/其他描述           │                    │
│ └────────────────────────────┴───────────────────────────────┘                    │
├──────────────────────────────────────────────────────────┬─────────────────────────┤
│ 章节梗概  [✨ 重新生成]                                  │ 要素清单                │
│  ……（@引用 EntityRefRenderer）                          │ ─────                   │
│                                                          │ ▼ 👤 角色 (3)           │
│ 场景列表 (3)  [+ 添加][✏ 重写][🔗 修复绑定]              │   · 张三 (1, 2)         │
│ ┌────────────────────────────────────────────┐           │   · 李四 (3)            │
│ │ 场景 1 · 📍@客栈 · 夜晚    [张三][李四][剑] │           │   · 王五 (-)            │
│ │   原文 / 旁白 / 对话 / 动作（展开后）       │           │                         │
│ └────────────────────────────────────────────┘           │ ▼ 🏛 地点 (2)           │
│ ┌────────────────────────────────────────────┐           │   · 客栈 (1, 2)         │
│ │ 场景 2 · 📍@客栈 · 凌晨    [张三][剑]       │           │   · 湖边 (3)            │
│ └────────────────────────────────────────────┘           │                         │
│ ┌────────────────────────────────────────────┐           │ ▶ ⚔️ 物品 (4)           │
│ │ 场景 3 · 📍@湖边 · 黄昏    [李四][剑]       │           │                         │
│ └────────────────────────────────────────────┘           │                         │
│  [+ 添加场景]                                            │                         │
└──────────────────────────────────────────────────────────┴─────────────────────────┘
```

### 3.2 顶部 header

`StageMainHeader` 组件复用：
- 标题：「内容+剧本」
- 副标题：动态 `已识别 X 角色 / Y 地点 / Z 物品 · M 个场景 · 引用解析率 P%`
- actions：按 § 2.3 sub-state 自适应：
  - status === pending → 「确认要素 → ② 资产」（disabled 时 hover 提示"先勾选 ≥1 个要素"）
  - status === scripting → 「完成定稿 → ④ 分镜」（disabled 时 hover 提示具体缺什么）
  - status === asset_prep → 「已确认 (阶段 ②)」tag（user 是从 ② 资产 stage 跳进合并页回看，不能在此 transition）
  - status >= storyboarding → 「已定稿」tag

### 3.3 顶部内容行（保持现状）

- 左 `flex: 0.6` ：原文片段 panel（来自 stage-content-v2）— 包含编辑 / AI 重新识别按钮 + 实体高亮渲染
- 右 `flex: 0.4` ：故事背景 panel — 年代 / 地域 / 其他描述 + 保存按钮

> 仅 `episode.sourceType === 'uploaded'` 时显示原文片段；`outline` 模式下原文从长文项目带入，按现状不显示这一行。

### 3.4 主区两栏

- 左 `flex: 0.7` ：章节梗概 panel + 场景列表 panel
  - 章节梗概 panel header：`[✨ 重新生成]` 按钮
  - 场景列表 panel header：`[+ 添加场景][✏ 重写场景][🔗 修复绑定]` 按钮组
- 右 `flex: 0.3` (min 280px / max 360px)：要素清单 sidebar（详见 § 4）

### 3.5 场景卡顶部 chip

每个 scene-header 在原有"场景 N · 📍 地点 · 时间 · 天气"信息行右侧加一行 chip：

```
[👤 张三] [👤 李四] [⚔️ 长剑]  (横向溢出可滚)
```

每个 chip 点击 → 触发要素高亮联动（同 § 5 ② 项交互）。

---

## 4. 要素清单 sidebar（`EntitySidebar.vue`）

### 4.1 视觉

```
┌──────────────────────────┐
│ 要素清单    [+ 添加 ▾]   │  ← 顶部：标题 + 添加菜单（角色/地点/物品/手动）
├──────────────────────────┤
│ ▼ 👤 角色 (3)        ⋯  │  ← 三块可折叠
│   ┌──────────────────┐  │
│   │ 张三 (1, 2)   □ │  │  ← checkbox 取舍 + 出场场景号
│   │ [linked_lw] 改   │  │  ← AssetSourceTag + 改 source
│   └──────────────────┘  │
│   ┌──────────────────┐  │
│   │ 李四 (3)      ☑ │  │
│   └──────────────────┘  │
│                          │
│ ▼ 🏛 地点 (2)        ⋯  │
│ ▶ ⚔️ 物品 (4)        ⋯  │  ← 折叠态
└──────────────────────────┘
```

每 kind section header：`▼/▶` 折叠箭头 + 图标 + 名称 + 数量 + ⋯ dropdown（重新识别 + 添加）。

每个 entity item：
- 名称 + 出场场景号 `(1, 2)` 或 `(-)` 表示无出场
- checkbox 取舍（沿用 EntityColumn 现有交互）
- AssetSourceTag + 改 source 链接
- 编辑 / 删除（hover 浮按钮）

### 4.2 折叠状态

默认全部展开。本地 state 不做持久化（按 spec § 2.2 保留 EntityColumn 已有"逐项不持久"惯例）。

### 4.3 接口（Props/Emits）

```ts
defineProps<{
  characters: UploadedCharacter[]
  locations: UploadedLocation[]
  items: UploadedItem[]
  scenes: SceneData[]              // 算出场场景号用
  highlightedEntityId: string | null  // 当前被点的 entity（联动 ②）
  highlightedSceneId: string | null   // 当前展开的场景（联动 ③）
}>()

defineEmits<{
  (e: 'click-entity', entity: { kind: Kind, index: number, name: string }): void
  (e: 'toggle', kind: Kind, idx: number): void
  (e: 'toggle-source', kind: Kind, idx: number): void
  (e: 'edit', kind: Kind, idx: number): void
  (e: 'delete', kind: Kind, idx: number): void
  (e: 'reidentify', kind: Kind): void
  (e: 'add', kind: Kind): void
}>()
```

---

## 5. 联动交互

### 5.1 四项联动

| # | 交互 | 实现 |
|---|---|---|
| ① | 要素 chip 显示场景号 | EntitySidebar 内部用 `sceneContainsEntity` 反查每个 entity 出现于哪些场景（用 `entityScenes` 工具），渲染 `(1, 2)` |
| ② | 点要素 → 高亮场景 | EntitySidebar emit `click-entity`；父组件 set `highlightedEntityId`；左侧场景卡用 `:class="{ highlighted: containsEntity(scene, highlightedEntityId) }"` 加金色背景；highlightedEntityId 保持到下次点击或 click 空白 |
| ③ | 展开场景 → 高亮要素 | scene-card 展开 emit `expand`；父 set `highlightedSceneId`；EntitySidebar 内 entity item 用 `:class="{ highlighted: containsScene(entity, highlightedSceneId) }"` 加金色 |
| ④ | 场景卡 chip | scene-header 上渲染该场景出现的实体 chip 列表；点 chip 触发 ② 同款 emit |

> ②③ 互不冲突：ID 各占一个，可同时存在（点要素 + 展开场景 = 同时高亮场景与要素）。

### 5.2 工具函数 `sceneContainsEntity`

新建 `src/renderer/src/components/episode-production/stage-content-script-v3/scene-entity-utils.ts`：

```ts
import type { SceneScript, ScenePropRef } from '@shared/types/episode-production/narrative.types'

type EntityKind = 'character' | 'location' | 'item'
interface EntityRef {
  kind: EntityKind
  name: string
  /** 对 character/item 是 binding id（如已绑），对 location 是 location_binding id */
  id?: string
}

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
  // item: 优先扫 SceneCharacter.props（结构化），再扫文本 @name 引用兜底
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

export function entityScenes(entity: EntityRef, scenes: SceneScript[]): number[] {
  return scenes
    .map((s, idx) => (sceneContainsEntity(s, entity) ? idx + 1 : -1))
    .filter((n) => n > 0)
}
```

> 字段对照（避免后续误用）：`SceneScript` 真实字段是 `originalText` / `narration` / `dialogues[].text` / `actions[].description` / `characters[]`（不是 `original` / `actions[].text` / `characterAppearances`）。`characterAppearances` 是 `EpisodeScript`（剧本级别）的字段，不是场景级别。

### 5.3 物品反查的两层策略

**优先级：**
1. **结构化匹配**：扫 `SceneCharacter.props[]`（含字符串名 + `ScenePropRef` 两种格式），命中即 true
2. **文本兜底**：扫场景所有文本字段（originalText / narration / dialogues[].text / actions[].description）中的 `@${entity.name}` 引用

**已知局限：**
- 物品名含特殊字符（如空格）时 `@${name}` 解析可能不准
- 用户在场景文本里没用 `@` 引用直接写名字时漏匹配（结构化层兜不住的情况）

**后续优化方向**（不在本次 spec 范围）：
- 在剧本生成时让 AI 同步在 `SceneCharacter.props[]` 填 `ScenePropRef`，避免依赖文本扫描
- 或在 scene 编辑 dialog 加 props picker

---

## 6. 组件改动

### 6.1 新增

| 文件 | 责任 |
|---|---|
| `components/episode-production/stage-content-script-v3/StageContentScriptView.vue` | 合并主组件（顶部 header + 内容行 + 主区两栏 + 联动状态） |
| `components/episode-production/stage-content-script-v3/EntitySidebar.vue` | 右侧三块可折叠要素清单 |
| `components/episode-production/stage-content-script-v3/EntitySidebarSection.vue` | 单个 kind 的 section（折叠 + 列表 + ⋯ dropdown） |
| `components/episode-production/stage-content-script-v3/EntitySidebarItem.vue` | 单个 entity item（名称 + 场景号 + checkbox + source + 编辑/删除） |
| `components/episode-production/stage-content-script-v3/SceneEntityChips.vue` | 场景卡顶部 chip 行（横向 chip 列表，点击 emit） |
| `components/episode-production/stage-content-script-v3/scene-entity-utils.ts` | `sceneContainsEntity` / `entityScenes` 工具函数 |

### 6.2 改写

| 文件 | 改动 |
|---|---|
| `components/episode-production/workbench/StageHeaderBar.vue` | 渲染逻辑：把 stages 数组里 `pending` + `scripting` 两段合并显示成一段「内容+剧本」 |
| `views/EpisodeWorkbench.vue` | 删除 `① 内容` + `③ 剧本` 两个 `<el-tab-pane>`，新增一个合并的 `<el-tab-pane label="内容+剧本" name="pending">`；activeTab 类型保留 EpisodeStatus 不变；当 status 是 `scripting` 时也映射到这个 tab；其他 tab 保持 |

### 6.3 删除

| 文件 | 备注 |
|---|---|
| `components/episode-production/stage-content-v2/StageContentViewV2.vue` | 全部内容并入 v3 |
| `components/episode-production/stage-content-v2/EntityColumn.vue` | EntitySidebar 替代 |
| `components/episode-production/stage-script-v2/StageScriptViewV2.vue` | 全部内容并入 v3 |

> `ManualAddEntityDialog.vue` 保留并迁移到 v3 目录（添加要素仍用此 dialog）。
> 章节梗概 / 场景卡片 / 场景编辑 dialog 等是 stage-script-v2 内的 setup 部分，迁移时拆出来作为 v3 子组件复用。

### 6.4 复用

| 文件 | 说明 |
|---|---|
| `shared/StageMainHeader.vue` | 顶部标题栏 |
| `shared/EntityRefRenderer.vue` | @ 引用渲染 |
| `shared/AssetSourceTag.vue` | source 标签 |
| `dialogs/ManualAddEntityDialog.vue` | 手动添加要素 |
| ProgressCalculator + 相关 IPC | 不动 |

---

## 7. 数据 / IPC

**全部复用现有 IPC**，本次合并不新增任何 IPC：

- `ep:identify-uploaded-entities` (识别要素)
- `ep:update-uploaded-entities` (保存要素 confirmed / source)
- `ep:generate-script` (生成剧本)
- `ep:update-scene` (编辑场景)
- `ep:can-enter-stage` / `ep:calculate-episode-progress` (门控 / 进度)

合并组件的"完成 → 资产"按钮调 `ep:can-enter-stage(episodeId, currentStatus, 'asset_prep')`，按现有 stage-gate 软引导逻辑处理。

---

## 8. 测试 / DoD

### 8.1 单测

| 组件 / 模块 | 用例 |
|---|---|
| `scene-entity-utils.sceneContainsEntity` | 角色（appearances 字段命中）、地点（name/id 命中）、物品（@name 引用扫到）、负样本（不命中返回 false） |
| `scene-entity-utils.entityScenes` | 多场景下返回正确编号数组、无场景返回 `[]` |
| `EntitySidebar` | 三 section 渲染、折叠、entity item 渲染含场景号、点击 emit、props highlightedEntityId 联动样式 |
| `EntitySidebarItem` | checkbox / source / 编辑 / 删除 emit |
| `SceneEntityChips` | chip 列表、点击 emit |
| `StageHeaderBar` 重渲染 | pending 和 scripting 状态都映射到「内容+剧本」段，颜色一致；其他状态映射不受影响 |
| `StageContentScriptView` 容器组件 | 联动 ②③ 的 highlightedEntityId / highlightedSceneId 状态变化 |

### 8.2 E2E

```
[阶段 1：识别要素 sub-state] 进合并页（status=pending）
  → 看到原文片段 + 故事背景行；右栏要素清单为空；主区显示"还没场景"提示
  → 点 "AI 识别要素" → 要素 sidebar 三块出现 entity 列表
  → 勾选 confirm 至少 1 个要素
  → 点 header "确认要素 → ② 资产" → status 转 asset_prep，stage 栏切到「资产」段（合并段变 complete）

[阶段 2：资产准备] 在 ② 资产 stage 完成绑定后……（不在本 spec 范围）

[阶段 3：剧本生成 sub-state] 从 stage 栏点"内容+剧本"或在 ② 完成后自动回（status=scripting）
  → 合并段从 complete 切回 current；「资产」段保持 complete
  → 章节梗概 + 场景列表 panel 出现；右栏要素仍显示
  → 点 "AI 生成剧本" → 场景列表出现
  → 看每个 entity item 后面出现场景号 (1, 2 等)
  → 看每个 scene-header 顶部 chip 出现实体
  → 点 sidebar 上「张三」 → 左侧出现张三的场景金色高亮
  → 展开「场景 2」 → 右栏 sidebar 上「张三 / 客栈」金色高亮
  → 点 scene-header 上的「@长剑」 chip → 含「长剑」的场景金色高亮
  → 点 "完成定稿 → ④ 分镜" → status 转 storyboarding，stage 栏切到「分镜」段
```

### 8.3 验证清单

- [ ] PC 端 + Web 端 dev 手验通过
- [ ] `npm run lint` / `npm run typecheck` / `npm run test:unit:sqlite` 全过
- [ ] 走 `docs/superpowers/dod/2026-05-05` 5 阶段自查 + 7 红线
- [ ] 截图归档到 `progress/2026-05-08-content-script-merged/`

---

## 9. 风险

| 风险 | 缓解 |
|---|---|
| 物品反查靠扫 `@name`，名含特殊字符可能漏 | 文档化为已知局限；后续可加 `scene.itemAppearances` 字段 |
| stage 6→5 后用户回看旧版 episode 工作台困惑 | UI 层完全屏蔽 scripting 字眼；StageHeaderBar 单元测覆盖映射 |
| EntityColumn 现有功能（checkbox / source / reidentify）很重，并入 sidebar 可能视觉拥挤 | 拆 EntitySidebarItem 子组件，复杂操作藏到 hover / dropdown |
| 删除 stage-content-v2 / stage-script-v2 风险（未发现的隐式引用） | 实施前 grep `StageContentViewV2\|StageScriptViewV2\|EntityColumn\b` 全仓 |
| pending 与 scripting 两个状态都映射到同一 tab，stage-gate 跳转可能混乱 | 全局 search `EpisodeStatus.pending\|.scripting` 引用，确认 transition 仍按 7 段走 |

---

## 10. 实施分阶段（建议）

> 本节供 writing-plans 阶段参考；不是契约。

1. **Phase 1 · 工具函数 + StageHeaderBar 重渲染**：scene-entity-utils + StageHeaderBar 6→5 段映射 + 单测
2. **Phase 2 · EntitySidebar 三件套组件**：EntitySidebar / EntitySidebarSection / EntitySidebarItem + 单测
3. **Phase 3 · SceneEntityChips + 章节梗概 / 场景卡子组件迁移**：从 stage-script-v2 拆出可复用子组件
4. **Phase 4 · StageContentScriptView 容器组件 + 联动状态**：组合所有子组件，实现高亮联动
5. **Phase 5 · 接入 EpisodeWorkbench**：替换 ① 内容 / ③ 剧本 两个 tab 为合并 tab；删除 v2 文件；E2E 验证

---

## 11. 设计确认

- [x] § 2 stage 状态机映射
- [x] § 3 页面布局
- [x] § 4 要素清单 sidebar
- [x] § 5 联动交互（含物品扫描临时方案）
- [x] § 6 组件改动
- [x] § 7 数据 / IPC（无新增）
- [x] § 8 测试 / DoD

— 待 user 对 spec 终稿再 review 一次。
