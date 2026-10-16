# 剧集制作 · Phase 1 · 模块更名 + 目录重组 + 大文件拆分

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `story-to-video` 模块更名为 `episode-production`，按目标目录结构重组所有相关文件，按目标拆分 10 个大文件——**零业务逻辑改动**，所有现有 PC 和 Web 测试通过。

**Architecture:** 纯结构性重构。包括：(1) 创建新目录骨架；(2) 拆 `shared/types`；(3) 移动 entities；(4) 移动 + 重命名 service；(5) 拆 5 个大 service；(6) 拆 + 改名 IPC handlers + 双端契约同步（preload / channel-map / register-channels / electron index）；(7) 拆 store；(8) 拆 view；(9) 路由更新；(10) 全量回归。每个 task 独立 commit。

**Tech Stack:** TypeScript / Vue 3 / Vite / Electron / Express + WebSocket（Web Bridge）/ Pinia / Vitest / Playwright / TypeORM / pnpm。

---

## ⭐ 双端约束（贯穿所有 task）

本 phase 必须遵守 spec 第 0.3 节"PC + Web 双端必须同时支持"约束：

- 每次改 IPC 通道，**5 个文件同步**：handler 实现、`electron/index.ts`、`web/server/api/register-channels.ts`、`preload/index.ts`、`web/client/channel-map.ts`
- 每次写完一个 task 的代码改动，**typecheck + 单测 + Web e2e 子集**都跑一遍才能 commit
- core 层不允许 `import { app } from 'electron'` / `fs.writeFileSync(systemPath)` / `if (window.process)` 这类平台分支（本 phase 是搬运，不引入新违规即可）
- 测试基线（task 0 记录）必须在每个 task 后保持不退化

每个涉及通道的 task 末尾有 **"双端契约同步检查清单"**，缺一不可。

---

## 现状盘点（task 实施时的"地图"）

```
要动的物理文件（按拆分类型分组）

A. 命名 / 路径迁移
  src/renderer/src/views/StoryToVideo.vue 432             → views/EpisodeProjectList.vue
  src/renderer/src/views/VideoProjectEditor.vue 5158     → views/EpisodeWorkbench.vue（壳）+ 拆分子组件
  src/renderer/src/views/VideoProductionPage.vue 1533    → 拆为 components/episode-production/* 子组件
  路由路径 /story-to-video/* → /episode-production/*

B. shared/types 拆分
  src/shared/types/story-to-video.types.ts 981           → shared/types/episode-production/{domain,narrative,render,compose,workflow,ipc}.types.ts
                                                            旧文件改为 deprecated re-export

C. entities 移到子目录
  src/core/database/entities/{video-*,scene-*,storyboard-*,*-binding,asset-image}.entity.ts
                                                          → entities/episode-production/

D. service 移动 / 拆分
  src/core/services/episode-auto-binding.service.ts      → modules/episode-production/auto-binding/
  src/core/services/uploaded-entity.service.ts           → modules/episode-production/auto-binding/
  src/core/services/lw-entity-detection.service.ts       → modules/episode-production/auto-binding/
  src/core/services/story-to-video-ai.service.ts 1557    → narrative/ai/{script-generator,storyboard-generator}.ts
  src/core/services/story-to-video-resource.service.ts 980→ render/keyframe/* + render/audio/* + assets/services/*
  src/core/services/video-synthesis.service.ts 795       → compose/{ffmpeg-assembler,transition,shot-video,scene-shots,audio-mix}.service.ts
  src/core/services/video.service.ts 532                 → render/video/* + compose/*

E. IPC handlers
  src/electron/ipc/handlers/story-to-video.handler.ts 2079→ ipc/handlers/episode-production/{project,episode,asset/*,narrative/*,render/*,compose,workflow}.handler.ts
  IPC channel 字符串：'stv:*' → 'ep:*'（46 个）
  IPC_CHANNELS 常量名：STV_* → EP_*（46 个）
  preload namespace：electronAPI.storyToVideo → electronAPI.episodeProduction

F. store
  src/renderer/src/stores/story-to-video.ts 1529         → stores/episode-production/{workbench,project,episode,asset,script,storyboard,production,compose}.store.ts

G. 双端契约同步
  src/electron/index.ts:122 / 345                        改 import + register call
  src/web/server/api/register-channels.ts:29 / 53        改 import + register call
  src/preload/index.ts                                   改 IPC_CHANNELS + namespace（共 46 个常量、~80 个方法）
  src/web/client/channel-map.ts                          改所有 'storyToVideo.*' 映射

H. 测试与文档
  tests/e2e/web/10-story-to-video.spec.ts                改为 10-episode-production.spec.ts，URL + channel 名同步
  CLAUDE.md / 模块 README                                 更新（最后阶段）
```

预计 task 数：14。每个 task 独立 commit，可独立 revert。

---

## Task 0: 准备 — 测试基线 + 目标目录骨架

**Files:**
- Create: `docs/superpowers/plans/baseline-2026-05-02-ep-p1.md`（基线快照，git ignored 不必须，可作为本 plan 附件）
- Create: 一组目标目录骨架（带 `.gitkeep` 或 `README.md`）

**Concept:** 先把"现状测试通过情况"记录下来作为基线；同时把后续 task 要用到的目标目录骨架先建出来，让后续 task 只做"内容填进去"，不再做"建目录"。

- [ ] **Step 1: 确认当前分支**

```bash
git -C /home/ubuntu/workdir/the-bot rev-parse --abbrev-ref HEAD
```

Expected output: `feat/episode-production-redesign`

如果不是，停下来——问用户。

- [ ] **Step 2: 跑 typecheck 记录基线**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck 2>&1 | tee /tmp/p1-baseline-typecheck.log
echo "exit=$?"
```

记录退出码与最后 30 行。如果当前 typecheck 已有失败项，**记录**，不修——后续 task 要保证"不新增 typecheck 失败"。

- [ ] **Step 3: 跑 lint 记录基线**

```bash
cd /home/ubuntu/workdir/the-bot && npm run lint 2>&1 | tee /tmp/p1-baseline-lint.log
echo "exit=$?"
```

同样：记录 + 后续不退化。

- [ ] **Step 4: 跑 unit 测试记录基线**

```bash
cd /home/ubuntu/workdir/the-bot && npm run test:unit:sqlite 2>&1 | tee /tmp/p1-baseline-unit.log
echo "exit=$?"
```

记录通过/失败数。

- [ ] **Step 5: 跑 Web e2e 中的 story-to-video 子集，记录基线**

```bash
cd /home/ubuntu/workdir/the-bot && npx playwright test --config=playwright.web.config.ts tests/e2e/web/10-story-to-video.spec.ts 2>&1 | tee /tmp/p1-baseline-web-e2e.log
echo "exit=$?"
```

如果 Web 服务没起来导致跳过，记录"Web e2e 不在本机跑"，下游 task 用 typecheck 替代。

- [ ] **Step 6: 创建目标目录骨架（core 层）**

```bash
cd /home/ubuntu/workdir/the-bot
mkdir -p src/core/modules/episode-production/{assets/services,assets/prompts,narrative/services,narrative/ai,narrative/validators,render/keyframe,render/video,render/audio,render/staging-3d,compose,workflow,auto-binding}
mkdir -p src/core/database/entities/episode-production
mkdir -p src/shared/types/episode-production
mkdir -p src/electron/ipc/handlers/episode-production/{asset,narrative,render}
mkdir -p src/renderer/src/components/episode-production/{workbench,stage-content,stage-asset/character,stage-asset/location,stage-asset/item,stage-asset/voice,stage-script,stage-storyboard,stage-production/3d-staging,stage-compose,dialogs,shared}
mkdir -p src/renderer/src/stores/episode-production
```

- [ ] **Step 7: 给每个新建的叶子目录放一个 README.md（标明职责，避免空目录被 git 忽略）**

每个目录创建一个最小 README，例如：

`src/core/modules/episode-production/README.md`：
```markdown
# episode-production

剧集制作模块。详见 `docs/superpowers/specs/2026-05-02-episode-production-pipeline-design.md`。

子域：
- assets/   资产域（角色/地点/物品/语音）
- narrative/ 叙事域（剧本/分镜）
- render/   渲染域（关键帧/视频/音频）
- compose/  合成域（时间线/转场/字幕/ffmpeg）
- workflow/ 流程域（阶段门控/状态机）
- auto-binding/ 内容识别 + 资产自动绑定
```

`src/core/modules/episode-production/render/staging-3d/README.md`：
```markdown
# 3D 摆位（接入点占位 · Phase 8 实现）

预留接入点：
- `location_binding.panorama_3d_id` / `scene_layout_id`
- `storyboard.use_3d_staging` / `staging_layout_id`
- `keyframe-generator(opts: { stagingPreviewImage? })` 可选参数

本目录目前不实现任何代码。
```

其它子域目录最小化的 README 写明职责一句话即可。

- [ ] **Step 8: typecheck 应仍然通过（只加了 README）**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck
```

- [ ] **Step 9: 提交骨架**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/modules/episode-production src/core/database/entities/episode-production src/shared/types/episode-production src/electron/ipc/handlers/episode-production src/renderer/src/components/episode-production src/renderer/src/stores/episode-production
git commit -m "$(cat <<'EOF'
chore(ep): P1 task 0 · 创建 episode-production 目标目录骨架

按 spec 第 5.3 节目标结构创建 core/entities/types/handlers/components/stores 子目录，
每个叶子目录附最小 README 说明职责。本提交不动业务代码，仅占位。
EOF
)"
```

---

## Task 1: 拆分 `shared/types/story-to-video.types.ts`

**Files:**
- Create: `src/shared/types/episode-production/domain.types.ts`
- Create: `src/shared/types/episode-production/narrative.types.ts`
- Create: `src/shared/types/episode-production/render.types.ts`
- Create: `src/shared/types/episode-production/compose.types.ts`
- Create: `src/shared/types/episode-production/workflow.types.ts`
- Create: `src/shared/types/episode-production/ipc.types.ts`
- Create: `src/shared/types/episode-production/index.ts`（barrel）
- Modify: `src/shared/types/story-to-video.types.ts` → 改为 deprecated re-export

**Concept:** 旧文件 981 行，按职责拆 6 个新文件。旧文件保留为 deprecated re-export，让现有 38 处 import 继续工作。后续 task 在改各自文件时顺手改 import 路径，本 task 不动消费方。

- [ ] **Step 1: 读 + 分组旧文件内容**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "^export (type|interface|class|enum|const)" src/shared/types/story-to-video.types.ts
```

按下面分组规则归类：

| 分组 | 归到 | 包含的导出 |
|---|---|---|
| 资产卡 / 设定卡 / 通用枚举 | `domain.types.ts` | `LocationType`, `TimeOfDay`, `WeatherType`, `CharacterBinding`, `LocationBinding`, `ItemBinding`, `*BindingRecord`, `ImageAsset`, `AudioAsset`, `ImageAssetType`, `AudioType` |
| 剧本/场景/分镜结构 | `narrative.types.ts` | `EpisodeScript`, `SceneScript`, `Storyboard`, `SceneCharacter`, `Dialogue`, `ActionDescription`, `StoryboardCharacter`, `EpisodeScriptRecord`, `SceneScriptRecord`, `StoryboardRecord`, `SceneCharacterRecord`, `ScenePropRecord`, `SceneDialogueRecord`, `SceneActionRecord`, `StoryboardCharacterRecord`, `StoryboardDialogueLinkRecord`, `StoryboardActionLinkRecord`, `ShotType`, `CameraAngle`, `CameraMovement`, `ScriptStatus`, `StoryboardStatus`, `GeneratedScene`, `GeneratedSceneCharacter`, `GeneratedDialogue`, `GeneratedAction`, `FullScriptGenerationResult` |
| 渲染层（图像/音频/视频生成产物） | `render.types.ts` | `ImageAssetRecord`, `AudioAssetRecord`, `AudioTrackRecord`, `AudioTrackItemRecord`, `AudioTrack` |
| 合成（转场/项目配置） | `compose.types.ts` | `TransitionType`, `TransitionConfig` |
| 流程（项目/剧集状态） | `workflow.types.ts` | `VideoProject`, `VideoProjectConfig`, `VideoEpisode`, `VideoProjectRecord`, `VideoEpisodeRecord`, `ProjectStatus`, `EpisodeStatus`, `EpisodeSourceType`, `UploadedCharacter`, `UploadedLocation`, `UploadedItem` |
| IPC 任务 / 事件 | `ipc.types.ts` | （目前 story-to-video.types.ts 没有，留空文件作为占位，后续 phase 填） |

- [ ] **Step 2: 创建 6 个新 types 文件**

每个文件首部加 module 注释：

```typescript
/**
 * episode-production · <子域名> · 类型定义
 * @module shared/types/episode-production/<file>
 * @description <一句话职责>
 *
 * 注：原类型定义来自 src/shared/types/story-to-video.types.ts，
 *     P1 拆分后旧文件改为 deprecated re-export。修改时请改本文件。
 */
```

把分组后的 type/interface/enum 复制过来。**保持原签名 / 字段名不变**。

- [ ] **Step 3: 创建 barrel `index.ts`**

```typescript
/**
 * episode-production · 类型 barrel
 */
export * from './domain.types'
export * from './narrative.types'
export * from './render.types'
export * from './compose.types'
export * from './workflow.types'
export * from './ipc.types'
```

- [ ] **Step 4: 把旧 `story-to-video.types.ts` 改为 deprecated re-export**

替换文件内容为：

```typescript
/**
 * @deprecated 本文件已拆分到 shared/types/episode-production/*.types.ts
 *             保留为 re-export 以兼容现有 import；新代码请直接 import 自子模块。
 *             P1 后续 task 会逐步替换消费方的 import 路径。
 */
export * from './episode-production'
```

- [ ] **Step 5: typecheck 通过**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck
```

应仍然通过（与基线一致）。

- [ ] **Step 6: 跑 unit 测试**

```bash
cd /home/ubuntu/workdir/the-bot && npm run test:unit:sqlite
```

应不退化。

- [ ] **Step 7: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/shared/types/
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 1 · 拆分 shared/types/story-to-video → episode-production/*

按 spec 第 5.3 节，把 981 行的 story-to-video.types.ts 拆为 6 个子领域类型文件
（domain / narrative / render / compose / workflow / ipc）+ barrel index。
旧文件改为 deprecated re-export，所有现有消费方 import 路径暂不动，
后续 task 在改各自文件时顺手切换。

零业务改动，typecheck / unit 测试与基线一致。
EOF
)"
```

---

## Task 2: 移动 entities 到 `entities/episode-production/` 子目录

**Files:**
- Move (using `git mv`): 16 个 entity 文件
- Modify: 所有 import 这些 entity 的文件（grep 全工程）

**Concept:** 把 episode-production 相关的 entity 物理移动到子目录，更新所有 import 路径。一次移动一组，避免 typecheck 中断面太大。

- [ ] **Step 1: 列出要移动的 entity 文件**

```bash
cd /home/ubuntu/workdir/the-bot
ls src/core/database/entities/ | grep -E '^(video-|scene-|storyboard|character-binding|location-binding|item-binding)' | sort
```

预期 16 个文件：
```
video-project.entity.ts
video-episode.entity.ts
episode-script.entity.ts
scene-script.entity.ts
scene-character.entity.ts
scene-action.entity.ts
scene-dialogue.entity.ts
scene-prop.entity.ts
storyboard.entity.ts
storyboard-character.entity.ts
character-binding.entity.ts
location-binding.entity.ts
item-binding.entity.ts
```

实际数量以 ls 结果为准。

- [ ] **Step 2: `git mv` 全部到子目录**

```bash
cd /home/ubuntu/workdir/the-bot
for f in $(ls src/core/database/entities/ | grep -E '^(video-|scene-|storyboard|character-binding|location-binding|item-binding)'); do
  git mv src/core/database/entities/$f src/core/database/entities/episode-production/
done
git status --short | head -30
```

确认每个文件都标 `R `（重命名）。

- [ ] **Step 3: 找出所有引用这些 entity 的文件**

```bash
cd /home/ubuntu/workdir/the-bot
grep -rnE "from ['\"](.*)entities/(video-|scene-|storyboard|character-binding|location-binding|item-binding)" src/ --include='*.ts' --include='*.vue' | head -40
```

记录文件清单，下一步逐文件改。

- [ ] **Step 4: 批量替换 import 路径**

```bash
cd /home/ubuntu/workdir/the-bot
# 把 entities/<filename> 替换为 entities/episode-production/<filename>
for ent in video-project video-episode episode-script scene-script scene-character scene-action scene-dialogue scene-prop storyboard storyboard-character character-binding location-binding item-binding; do
  grep -rlE "entities/${ent}\\.entity" src/ --include='*.ts' --include='*.vue' | xargs -r sed -i "s|entities/${ent}\\.entity|entities/episode-production/${ent}.entity|g"
done
```

- [ ] **Step 5: 检查 schema 注册（database/index.ts 或 ormconfig 类等列出 entity 的位置）**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "VideoProjectEntity|VideoEpisodeEntity|EpisodeScriptEntity|SceneScriptEntity|StoryboardEntity|CharacterBindingEntity|LocationBindingEntity|ItemBindingEntity" src/electron/database/index.ts | head -20
```

如有 import 这些 entity 的地方，确认 path 已被 sed 改对（应已改）。

- [ ] **Step 6: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck
```

如有报错（通常是 sed 漏改的边角 import），逐个修——只能改 path 不能改逻辑。

- [ ] **Step 7: unit 测试 + DB-相关测试不退化**

```bash
cd /home/ubuntu/workdir/the-bot && npm run test:unit:sqlite 2>&1 | tail -30
```

对比基线退出码与失败数。

- [ ] **Step 8: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 2 · 把剧集制作 entity 移到 entities/episode-production/

git mv 16 个 entity 文件到子目录；批量替换全工程 import 路径。
零业务改动，typeorm 注册路径同步更新，typecheck / unit 测试与基线一致。
EOF
)"
```

---

## Task 3: 移动 auto-binding 三个 service

**Files:**
- Move: `src/core/services/episode-auto-binding.service.ts` → `src/core/modules/episode-production/auto-binding/episode-auto-binding.service.ts`
- Move: `src/core/services/uploaded-entity.service.ts` → `src/core/modules/episode-production/auto-binding/uploaded-entity.service.ts`
- Move: `src/core/services/lw-entity-detection.service.ts` → `src/core/modules/episode-production/auto-binding/lw-entity-detection.service.ts`
- Modify: 所有 import 三者的文件

**Concept:** 三个 service 逻辑上属于剧集制作的"内容识别"环节，搬到模块内的 `auto-binding/`。**本 task 不改业务**——"移除拷贝图字段"的逻辑动作留给 P3（资产域）做。

- [ ] **Step 1: git mv**

```bash
cd /home/ubuntu/workdir/the-bot
git mv src/core/services/episode-auto-binding.service.ts src/core/modules/episode-production/auto-binding/
git mv src/core/services/uploaded-entity.service.ts src/core/modules/episode-production/auto-binding/
git mv src/core/services/lw-entity-detection.service.ts src/core/modules/episode-production/auto-binding/
```

- [ ] **Step 2: 找消费方**

```bash
grep -rnE "from ['\"](.*)services/(episode-auto-binding|uploaded-entity|lw-entity-detection)" src/ --include='*.ts' --include='*.vue'
```

- [ ] **Step 3: 批量替换 import path**

```bash
cd /home/ubuntu/workdir/the-bot
for s in episode-auto-binding uploaded-entity lw-entity-detection; do
  grep -rlE "services/${s}\\.service" src/ --include='*.ts' --include='*.vue' | xargs -r sed -i "s|services/${s}\\.service|modules/episode-production/auto-binding/${s}.service|g"
done
```

- [ ] **Step 4: 检查 service 内部相对路径 import（如 import 自 ../database/...）**

新位置在 `src/core/modules/episode-production/auto-binding/`，到 `src/core/database/` 的相对路径变成 `../../../database/`（原是 `../database/`）。

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "from ['\"]\\.\\./database|from ['\"]\\.\\./services" src/core/modules/episode-production/auto-binding/*.ts
```

把每条 `'../database/...'` 改为 `'../../../database/...'`，每条 `'../services/...'` 改为 `'../../../services/...'`。其它跨域引用（如 `'../utils/...'`、`'../providers/...'`）同步上调一级。

- [ ] **Step 5: typecheck + unit**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck && npm run test:unit:sqlite
```

- [ ] **Step 6: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 3 · 把 auto-binding 三个 service 移到 modules/episode-production/auto-binding/

涉及：
- episode-auto-binding.service.ts
- uploaded-entity.service.ts
- lw-entity-detection.service.ts

仅做物理移动 + import 路径调整，业务逻辑保持不变。
"清理拷贝图字段"等业务调整留给 P3（资产域）做。
EOF
)"
```

---

## Task 4: 拆分 `story-to-video-ai.service.ts`（1557 行）

**Files:**
- Create: `src/core/modules/episode-production/narrative/ai/script-generator.ts`
- Create: `src/core/modules/episode-production/narrative/ai/storyboard-generator.ts`
- Create: `src/core/modules/episode-production/narrative/ai/types.ts`（如果原文件里有 task / event 类型，归到此处）
- Create: `src/core/modules/episode-production/narrative/ai/index.ts`（barrel）
- Delete (after move): `src/core/services/story-to-video-ai.service.ts`
- Modify: 所有消费方 import

**Concept:** 旧 service 1557 行，含一组 type 定义 + 一个 `StoryToVideoAIService` 类。按职责拆为两个 generator：

- `script-generator.ts`：`generateFullScript`（剧本生成入口）+ `generateScript`（按场景拆分）
- `storyboard-generator.ts`：`generateStoryboard` (deprecated)、`generateSingleStoryboard`、`generateStoryboardsIncremental`、`generateStoryboards`

辅助 type / event 类型放 `types.ts`。

- [ ] **Step 1: 读旧文件结构清单**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "^(export|  (async|public|private)? *(generate|build|create))" src/core/services/story-to-video-ai.service.ts
```

记录所有 export type/interface 和所有 method 的行号。预期：
```
33   export type StoryToVideoTask
41   export interface ScriptGenerationResult
49   export interface SceneGenerationResult
68   export interface StoryboardGenerationResult
75   export interface StoryboardResult
95   export interface GenerationStreamEvent
694  export class StoryToVideoAIService
1023 generateFullScript
1064 generateScript
1120 generateStoryboard (deprecated)
1218 generateSingleStoryboard
1308 generateStoryboardsIncremental
1401 generateStoryboards
```

- [ ] **Step 2: 创建 `narrative/ai/types.ts`**

把 `StoryToVideoTask` / `ScriptGenerationResult` / `SceneGenerationResult` / `StoryboardGenerationResult` / `StoryboardResult` / `GenerationStreamEvent` 移过去。**重命名 `StoryToVideoTask` → `EpisodeProductionTask`** 因为这是旧前缀型命名（spec 第 5.1 节决策）。

文件首部：

```typescript
/**
 * narrative/ai · AI 任务与流事件类型
 * @module modules/episode-production/narrative/ai/types
 */

export type EpisodeProductionTask = ...
export interface ScriptGenerationResult { ... }
// ...
```

旧名 `StoryToVideoTask` 在本 phase **保留为 deprecated 别名**：

```typescript
/** @deprecated 使用 EpisodeProductionTask */
export type StoryToVideoTask = EpisodeProductionTask
```

- [ ] **Step 3: 创建 `narrative/ai/script-generator.ts`**

把 `generateFullScript` 和 `generateScript` 两个方法移过去。把它们包装成独立的 class `EpisodeScriptGenerator`（旧 `StoryToVideoAIService` 是大杂烩 class）：

```typescript
/**
 * narrative/ai/script-generator
 * @module modules/episode-production/narrative/ai/script-generator
 * @description 剧本（章节梗概 + 场景拆分）生成器。
 *              拆自原 StoryToVideoAIService.generateFullScript / generateScript。
 */

import { ... } from '...'  // 保持原 import，仅相对路径修正
import type { ScriptGenerationResult, SceneGenerationResult } from './types'

export class EpisodeScriptGenerator {
  // 私有依赖 / state（原 service 用到的依赖）

  async generateFullScript(...args): Promise<ScriptGenerationResult> {
    // 整段 copy 自旧 service generateFullScript
  }

  async generateScript(...args): Promise<SceneGenerationResult> {
    // 整段 copy 自旧 service generateScript
  }
}
```

具体的依赖注入方式参考旧 service 的 constructor / private 字段。**保持外部行为完全一致**。

- [ ] **Step 4: 创建 `narrative/ai/storyboard-generator.ts`**

同理把 4 个 storyboard 方法移过去，包装成 `EpisodeStoryboardGenerator` class。

```typescript
/**
 * narrative/ai/storyboard-generator
 * @module modules/episode-production/narrative/ai/storyboard-generator
 * @description 分镜生成器。
 */

export class EpisodeStoryboardGenerator {
  /** @deprecated 使用 generateStoryboardsIncremental */
  async generateStoryboard(sceneScript, providerConfigId, modelId): Promise<...> {
    // copy 自旧 service
  }

  async generateSingleStoryboard(...): Promise<...> { ... }
  async generateStoryboardsIncremental(...): Promise<...> { ... }
  async generateStoryboards(...): Promise<...> { ... }
}
```

- [ ] **Step 5: 创建 `narrative/ai/index.ts` barrel**

```typescript
export * from './types'
export { EpisodeScriptGenerator } from './script-generator'
export { EpisodeStoryboardGenerator } from './storyboard-generator'
```

- [ ] **Step 6: 给旧 service 留 deprecated re-export 兼容层**

把 `src/core/services/story-to-video-ai.service.ts` 的内容**整体替换**为：

```typescript
/**
 * @deprecated 本文件已拆分到 modules/episode-production/narrative/ai/*
 *             保留 deprecated re-export 兼容现有 import；
 *             消费方 import 路径会在后续 task / phase 切换。
 */

export * from '../modules/episode-production/narrative/ai/types'
export { EpisodeScriptGenerator } from '../modules/episode-production/narrative/ai/script-generator'
export { EpisodeStoryboardGenerator } from '../modules/episode-production/narrative/ai/storyboard-generator'

import { EpisodeScriptGenerator } from '../modules/episode-production/narrative/ai/script-generator'
import { EpisodeStoryboardGenerator } from '../modules/episode-production/narrative/ai/storyboard-generator'

/**
 * @deprecated 改用 EpisodeScriptGenerator / EpisodeStoryboardGenerator。
 *             保留为 facade 兼容现有调用方。
 */
export class StoryToVideoAIService {
  private readonly scriptGen = new EpisodeScriptGenerator(/* deps */)
  private readonly storyboardGen = new EpisodeStoryboardGenerator(/* deps */)

  generateFullScript = this.scriptGen.generateFullScript.bind(this.scriptGen)
  generateScript = this.scriptGen.generateScript.bind(this.scriptGen)
  generateStoryboard = this.storyboardGen.generateStoryboard.bind(this.storyboardGen)
  generateSingleStoryboard = this.storyboardGen.generateSingleStoryboard.bind(this.storyboardGen)
  generateStoryboardsIncremental = this.storyboardGen.generateStoryboardsIncremental.bind(this.storyboardGen)
  generateStoryboards = this.storyboardGen.generateStoryboards.bind(this.storyboardGen)
}
```

如果原 service 是 singleton（getInstance 模式），facade 也用对应的 singleton 形态。

> 注：facade 形态由旧 service 的初始化模式决定。如果原本是函数式（不是 class），改为相应函数式 facade。具体细节读旧文件 694 行附近的 class 定义，按相同模式包装。

- [ ] **Step 7: typecheck + unit**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck && npm run test:unit:sqlite 2>&1 | tail -20
```

如 typecheck 报错，最常见是：相对 import 路径（`'../...'`）从旧位置到新位置变了。逐条修。

- [ ] **Step 8: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 4 · 拆分 story-to-video-ai.service → narrative/ai/{script,storyboard}-generator

把 1557 行的 StoryToVideoAIService 拆为：
- EpisodeScriptGenerator（剧本生成）
- EpisodeStoryboardGenerator（分镜生成）
- 共享类型 → narrative/ai/types.ts

旧文件保留为 deprecated facade re-export（含 StoryToVideoAIService 兼容 class），
消费方 import 路径暂不动，后续 task 在改各自文件时顺手切换。
EOF
)"
```

---

## Task 5: 拆分 `story-to-video-resource.service.ts`（980 行）

**Files:**
- Create: `src/core/modules/episode-production/render/keyframe/keyframe-prompt-builder.ts`（含 `buildImagePrompt`）
- Create: `src/core/modules/episode-production/render/keyframe/keyframe-generator.service.ts`（含 `generateStoryboardImage` / `generateStoryboardImages`）
- Create: `src/core/modules/episode-production/render/audio/narration-synthesis.service.ts`（含 `generateNarrationAudio`）
- Create: `src/core/modules/episode-production/render/audio/dialogue-synthesis.service.ts`（含 `generateDialogueAudio`）
- Create: `src/core/modules/episode-production/render/audio/scene-audio.service.ts`（含 `generateSceneAudio`）
- Create: `src/core/modules/episode-production/assets/services/temp-asset.service.ts`（含 `generateTemporaryCharacterImage` / `generateTemporaryLocationImage`）
- Create: barrel `index.ts` 文件
- Modify: `src/core/services/story-to-video-resource.service.ts` → 改为 deprecated facade

**Concept:** 980 行的 resource service 实际是一个"杂烩"：图片生成、音频生成、临时素材生成。按职责拆。

> 重要：此 task 内部产物较多。每创建一个新文件就立即跑一次 typecheck，发现问题马上修，不要积压。

- [ ] **Step 1: 列出旧文件方法清单**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "^  (async|public|private)?\\s*(buildImagePrompt|generate)" src/core/services/story-to-video-resource.service.ts
```

预期：
```
85   buildImagePrompt
204  generateStoryboardImage
290  generateStoryboardImages
352  generateNarrationAudio
409  generateDialogueAudio
472  generateSceneAudio
655  generateTemporaryCharacterImage
739  generateTemporaryLocationImage
```

- [ ] **Step 2: 创建 `keyframe/keyframe-prompt-builder.ts`**

把 `buildImagePrompt` 函数移过去。这是一个纯函数（提示词组装），不需要 class。

```typescript
/**
 * keyframe-prompt-builder
 * @module modules/episode-production/render/keyframe/keyframe-prompt-builder
 * @description 把分镜 + 资产引用组合成图像生成提示词。
 *              P3 阶段会扩展为 reference-image-selector + chain strategy；本 phase 仅原样搬运。
 */

import type { ... } from '...'

export function buildImagePrompt(/* 原签名 */): string {
  // 整段 copy
}
```

typecheck。

- [ ] **Step 3: 创建 `keyframe/keyframe-generator.service.ts`**

把 `generateStoryboardImage` 和 `generateStoryboardImages` 移过去，包装成 `KeyframeGeneratorService` class（保持原 service 内的依赖注入风格）。

> 注：本 phase 不改造为多关键帧——仍是单帧生成。多关键帧改造在 P5。

typecheck。

- [ ] **Step 4: 创建 `audio/narration-synthesis.service.ts`**

把 `generateNarrationAudio` 移过去。class `NarrationSynthesisService`。

- [ ] **Step 5: 创建 `audio/dialogue-synthesis.service.ts`**

把 `generateDialogueAudio` 移过去。class `DialogueSynthesisService`。

- [ ] **Step 6: 创建 `audio/scene-audio.service.ts`**

把 `generateSceneAudio` 移过去。class `SceneAudioService`。

- [ ] **Step 7: 创建 `assets/services/temp-asset.service.ts`**

把 `generateTemporaryCharacterImage` 和 `generateTemporaryLocationImage` 移过去。class `TempAssetService`。

> 注：内部有 `generatedImageId` 字段引用——本 phase 不动这个字段（属于 P2 数据迁移 + P3 资产域改造的范围）。

- [ ] **Step 8: 创建各子目录的 `index.ts` barrel**

`render/keyframe/index.ts`：
```typescript
export { buildImagePrompt } from './keyframe-prompt-builder'
export { KeyframeGeneratorService } from './keyframe-generator.service'
```

`render/audio/index.ts`：
```typescript
export { NarrationSynthesisService } from './narration-synthesis.service'
export { DialogueSynthesisService } from './dialogue-synthesis.service'
export { SceneAudioService } from './scene-audio.service'
```

`assets/services/index.ts`：
```typescript
export { TempAssetService } from './temp-asset.service'
```

- [ ] **Step 9: 把旧 `story-to-video-resource.service.ts` 改为 deprecated facade**

```typescript
/**
 * @deprecated 拆分到 modules/episode-production/{render/keyframe, render/audio, assets/services}
 */
export { buildImagePrompt } from '../modules/episode-production/render/keyframe'
export { KeyframeGeneratorService } from '../modules/episode-production/render/keyframe'
export { NarrationSynthesisService, DialogueSynthesisService, SceneAudioService } from '../modules/episode-production/render/audio'
export { TempAssetService } from '../modules/episode-production/assets/services'

// 兼容 facade（如旧 service 是某个 singleton 名，保留旧名）
import { KeyframeGeneratorService } from '../modules/episode-production/render/keyframe'
import { NarrationSynthesisService, DialogueSynthesisService, SceneAudioService } from '../modules/episode-production/render/audio'
import { TempAssetService } from '../modules/episode-production/assets/services'

/**
 * @deprecated 改用各专职 service
 */
export class StoryToVideoResourceService {
  private kf = new KeyframeGeneratorService(/* deps */)
  private narr = new NarrationSynthesisService(/* deps */)
  private dia = new DialogueSynthesisService(/* deps */)
  private scn = new SceneAudioService(/* deps */)
  private tmp = new TempAssetService(/* deps */)

  generateStoryboardImage = this.kf.generateStoryboardImage.bind(this.kf)
  generateStoryboardImages = this.kf.generateStoryboardImages.bind(this.kf)
  generateNarrationAudio = this.narr.generateNarrationAudio.bind(this.narr)
  generateDialogueAudio = this.dia.generateDialogueAudio.bind(this.dia)
  generateSceneAudio = this.scn.generateSceneAudio.bind(this.scn)
  generateTemporaryCharacterImage = this.tmp.generateTemporaryCharacterImage.bind(this.tmp)
  generateTemporaryLocationImage = this.tmp.generateTemporaryLocationImage.bind(this.tmp)
  buildImagePrompt = buildImagePrompt
}
```

- [ ] **Step 10: typecheck + unit**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck && npm run test:unit:sqlite 2>&1 | tail -20
```

- [ ] **Step 11: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 5 · 拆分 story-to-video-resource.service → render/keyframe + render/audio + assets/services

把 980 行 resource service 按职责拆为：
- render/keyframe/{keyframe-prompt-builder, keyframe-generator.service}
- render/audio/{narration-synthesis, dialogue-synthesis, scene-audio}.service
- assets/services/temp-asset.service

旧文件保留 deprecated facade，业务行为零变化（多关键帧/统一图谱等
改造留给 P3-P5）。
EOF
)"
```

---

## Task 6: 拆分 `video-synthesis.service.ts`（795 行）

**Files:**
- Create: `src/core/modules/episode-production/compose/ffmpeg-assembler.service.ts`（含 `runFFmpegCommand` / `getVideoInfo`）
- Create: `src/core/modules/episode-production/compose/transition.service.ts`（含 `mergeVideosWithTransitions` / `buildXfadeFilterComplex`）
- Create: `src/core/modules/episode-production/compose/shot-video.service.ts`（含 `createShotVideo` / `synthesizeStoryboardVideo`）
- Create: `src/core/modules/episode-production/compose/scene-shots.service.ts`（含 `createSceneShotVideos`）
- Create: `src/core/modules/episode-production/compose/audio-mix.service.ts`（含 `mixSceneAudio`）
- Create: `src/core/modules/episode-production/compose/scene-video.service.ts`（含 `synthesizeSceneVideo`）
- Create: `src/core/modules/episode-production/compose/index.ts` barrel
- Modify: `src/core/services/video-synthesis.service.ts` → deprecated facade

**Concept:** 795 行 video-synthesis 是 ffmpeg 合成相关的杂烩，分 6 个文件清晰化。

- [ ] **Step 1: 列旧文件方法清单**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "^  (async|public|private)?\\s*[a-zA-Z]+\\(" src/core/services/video-synthesis.service.ts
```

按行号确认 6 个方法的位置。

- [ ] **Step 2: 创建 `compose/ffmpeg-assembler.service.ts`**

含 `runFFmpegCommand` / `getVideoInfo` / `getVideoOutputDir` / `getTempDir`。基础工具层。

- [ ] **Step 3: 创建 `compose/transition.service.ts`**

含 `mergeVideosWithTransitions` / `buildXfadeFilterComplex`。依赖 ffmpeg-assembler。

- [ ] **Step 4: 创建 `compose/shot-video.service.ts`**

含 `createShotVideo` / `synthesizeStoryboardVideo`。

- [ ] **Step 5: 创建 `compose/scene-shots.service.ts`**

含 `createSceneShotVideos`（注意里面 emit 'stv:synthesis-progress' 事件——本 phase 保留事件名不变，事件名改名留给 task 8 做整体 channel rename）。

- [ ] **Step 6: 创建 `compose/audio-mix.service.ts`**

含 `mixSceneAudio`。

- [ ] **Step 7: 创建 `compose/scene-video.service.ts`**

含 `synthesizeSceneVideo`。

- [ ] **Step 8: barrel `compose/index.ts`**

```typescript
export { FfmpegAssemblerService } from './ffmpeg-assembler.service'
export { TransitionService } from './transition.service'
export { ShotVideoService } from './shot-video.service'
export { SceneShotsService } from './scene-shots.service'
export { AudioMixService } from './audio-mix.service'
export { SceneVideoService } from './scene-video.service'
```

- [ ] **Step 9: 旧 `video-synthesis.service.ts` 改为 deprecated facade**

按 task 4 / task 5 的 facade 模式包装，保留 `VideoSynthesisService` 旧 class 名兼容。

- [ ] **Step 10: typecheck + unit**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck && npm run test:unit:sqlite 2>&1 | tail -20
```

- [ ] **Step 11: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 6 · 拆分 video-synthesis.service → compose/{ffmpeg-assembler,transition,shot-video,scene-shots,audio-mix,scene-video}.service

按 spec 5.3 节，把 795 行 video-synthesis 拆为 6 个 compose 子域 service。
旧文件保留 deprecated facade，事件名 'stv:synthesis-progress' 保持不动
（待 task 8 整体 channel rename）。
EOF
)"
```

---

## Task 7: 拆分 + 移动 `video.service.ts`（532 行）

**Files:**
- Read: `src/core/services/video.service.ts` 实际内容
- Create: 按内容性质归到 `render/video/` 或 `compose/`
- Modify: 旧文件 → deprecated facade

**Concept:** 看完代码再决定切分。从前面 grep 结果看，里面有 polling task 管理、事件 emit、与 video-providers 的交互。多半是 render/video/ 的内容。

- [ ] **Step 1: 读全文 + 列出 export**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "^export|^class|^  (async|public|private)?\\s*[a-zA-Z_]+\\(" src/core/services/video.service.ts | head -30
```

记录每个 export 的职责。

- [ ] **Step 2: 按职责切分**

通常切分准则：
- "调用视频 provider 生成视频" → `render/video/video-segment.service.ts`
- "ffmpeg 合成 / 后处理" → `compose/`
- "事件订阅 / 任务轮询" → `render/video/video-task.service.ts`

如果文件主要是 polling / task 管理（看到 `clearInterval` / `pollTask` 模式），归到 `render/video/video-task.service.ts`。

- [ ] **Step 3: 创建对应新文件**

按本 task step 2 的归类创建文件，把代码搬过去。每搬一段跑一次 typecheck。

- [ ] **Step 4: 旧 `video.service.ts` 改为 deprecated facade**

同前。

- [ ] **Step 5: typecheck + unit**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck && npm run test:unit:sqlite 2>&1 | tail -20
```

- [ ] **Step 6: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "refactor(ep): P1 task 7 · 拆分 video.service.ts → render/video + compose

按内容职责把 532 行的 video.service 拆到 render/video/ 与 compose/。
旧文件保留 deprecated facade。"
```

---

## Task 8: 拆分 IPC handlers + 改名 channel + 双端契约同步

**Files:**
- Create: `src/electron/ipc/handlers/episode-production/{project,episode,workflow,compose}.handler.ts`（顶层）
- Create: `src/electron/ipc/handlers/episode-production/asset/{character-asset,location-asset,item-asset,voice-asset}.handler.ts`
- Create: `src/electron/ipc/handlers/episode-production/narrative/{script,storyboard}.handler.ts`
- Create: `src/electron/ipc/handlers/episode-production/render/{keyframe,video,audio}.handler.ts`
- Create: `src/electron/ipc/handlers/episode-production/index.ts`（包含 `registerEpisodeProductionHandlers()`）
- Delete (after move): `src/electron/ipc/handlers/story-to-video.handler.ts`
- Modify: `src/electron/index.ts:122,345`（import + register call）
- Modify: `src/web/server/api/register-channels.ts:29,53`（import + register call）
- Modify: `src/preload/index.ts`（IPC_CHANNELS 常量名 STV_* → EP_*；namespace `storyToVideo` → `episodeProduction`）
- Modify: `src/web/client/channel-map.ts`（key `storyToVideo.*` → `episodeProduction.*`；channel `stv:*` → `ep:*`）
- Modify: 所有 renderer 调用 `electronAPI.storyToVideo.xxx` → `electronAPI.episodeProduction.xxx`
- Modify: `tests/e2e/web/10-story-to-video.spec.ts`（'stv:list-projects' → 'ep:list-projects'）

**Concept:** 这是 P1 中最重的 task——一次性把 IPC 通道全部从 `stv:` 改为 `ep:`，并按子域拆分 handler 文件。**双端契约 5 文件必须同步**。

> ⚠️ 这个 task 不能拆成更小颗粒——通道改名必须原子完成，否则中间状态会让 PC 或 Web 端运行时报错。

- [ ] **Step 1: 列出旧 handler 内所有 ipc.handle 调用**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "ipcMain\\.handle\\(['\"]stv:" src/electron/ipc/handlers/story-to-video.handler.ts | head -50
```

按调用名称分组，对应到目标文件：

| Channel | 目标文件 |
|---|---|
| `ep:list-projects` / `get-project` / `create-project` / `update-project` / `delete-project` | `project.handler.ts` |
| `ep:list-episodes` / `get-episode` / `create-episode` / `update-episode` / `delete-episode` / `episode-status:*` | `episode.handler.ts` |
| `ep:get-character-bindings` / `bind-character` / `update-character-binding` / `delete-character-binding` | `asset/character-asset.handler.ts` |
| `ep:get-location-bindings` / `bind-location` / ... | `asset/location-asset.handler.ts` |
| `ep:get-item-bindings` / `bind-item` / ... | `asset/item-asset.handler.ts` |
| `ep:get-voice-bindings` / `bind-voice` / ... | `asset/voice-asset.handler.ts`（本 phase 可能为空，预留文件 + register 函数即可） |
| `ep:script:*` / `ep:scene:*` | `narrative/script.handler.ts` |
| `ep:storyboard:*` | `narrative/storyboard.handler.ts` |
| `ep:keyframe:*` / `ep:image:*`（分镜画面相关） | `render/keyframe.handler.ts` |
| `ep:video:*` / `ep:synthesis-progress`（事件） | `render/video.handler.ts` |
| `ep:audio:*` | `render/audio.handler.ts` |
| `ep:compose:*` | `compose.handler.ts` |
| `ep:workflow:*` / `ep:status:*` | `workflow.handler.ts` |

> 注：原 channel 数 46。本 task 完成后通道名前缀全部改为 `ep:`。

- [ ] **Step 2: 创建各子 handler 文件骨架**

每个文件结构：

```typescript
/**
 * episode-production · <子域> · IPC handler
 * @module electron/ipc/handlers/episode-production/<path>
 * @description 双端共用 handler——同时被 electron/index.ts 和 web/server/api/register-channels.ts 注册。
 */

import { ipcMain } from 'electron'
import { /* services */ } from '../../../core/modules/episode-production/...'

export function registerProjectHandlers(): void {
  ipcMain.handle('ep:list-projects', async (_event, longWritingProjectId?: string) => {
    // 整段 copy 自旧 handler，body 不变
  })
  ipcMain.handle('ep:get-project', async (_event, projectId: string) => { ... })
  // ...
}
```

> 注意：`ipcMain` 在 Electron 中可用，在 Web 端 register-channels 通过 mock / shim 或 IPC bridge 把 `ipcMain.handle` 转为 HTTP handler。这是项目现有模式，本 task **不动**这一层；只要 handler 函数的 channel 名和签名保持一致，双端注册都能工作。

- [ ] **Step 3: 创建 `episode-production/index.ts` 注册入口**

```typescript
/**
 * episode-production · IPC handler 注册入口
 */
import { registerProjectHandlers } from './project.handler'
import { registerEpisodeHandlers } from './episode.handler'
import { registerCharacterAssetHandlers } from './asset/character-asset.handler'
import { registerLocationAssetHandlers } from './asset/location-asset.handler'
import { registerItemAssetHandlers } from './asset/item-asset.handler'
import { registerVoiceAssetHandlers } from './asset/voice-asset.handler'
import { registerScriptHandlers } from './narrative/script.handler'
import { registerStoryboardHandlers } from './narrative/storyboard.handler'
import { registerKeyframeHandlers } from './render/keyframe.handler'
import { registerVideoHandlers } from './render/video.handler'
import { registerAudioHandlers } from './render/audio.handler'
import { registerComposeHandlers } from './compose.handler'
import { registerWorkflowHandlers } from './workflow.handler'

export function registerEpisodeProductionHandlers(): void {
  registerProjectHandlers()
  registerEpisodeHandlers()
  registerCharacterAssetHandlers()
  registerLocationAssetHandlers()
  registerItemAssetHandlers()
  registerVoiceAssetHandlers()
  registerScriptHandlers()
  registerStoryboardHandlers()
  registerKeyframeHandlers()
  registerVideoHandlers()
  registerAudioHandlers()
  registerComposeHandlers()
  registerWorkflowHandlers()
}
```

- [ ] **Step 4: 把旧 handler 的 body 逐个 copy 到新文件**

逐个 channel 处理，每完成一个文件跑一次 `npm run typecheck`。处理时注意：

- channel 字符串 `'stv:xxx'` → `'ep:xxx'`
- 内部 emit 的事件名（如 `'stv:synthesis-progress'`）→ `'ep:synthesis-progress'`
- import 路径（service 已被前面 task 移走，要从新位置 import）

- [ ] **Step 5: 改 `src/preload/index.ts`**

操作分两部分：

**5a. 改 IPC_CHANNELS 常量名（46 个 STV_* → EP_*）**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "^  STV_" src/preload/index.ts > /tmp/p1-stv-channels.txt
wc -l /tmp/p1-stv-channels.txt   # 期望 46
```

把每个 `STV_XXX: 'stv:xxx'` 改成 `EP_XXX: 'ep:xxx'`。可以用 sed：

```bash
cd /home/ubuntu/workdir/the-bot
sed -i 's/STV_\([A-Z_]*\): /EP_\1: /g' src/preload/index.ts
sed -i "s/'stv:/'ep:/g" src/preload/index.ts
```

**5b. 改 namespace `storyToVideo` → `episodeProduction`**

```bash
cd /home/ubuntu/workdir/the-bot
sed -i 's/storyToVideo:/episodeProduction:/g' src/preload/index.ts
```

5c. 改其它 `IPC_CHANNELS.STV_` 引用：

```bash
cd /home/ubuntu/workdir/the-bot
sed -i 's/IPC_CHANNELS\\.STV_/IPC_CHANNELS.EP_/g' src/preload/index.ts
```

5d. 改 export interface 中的 namespace 字段：

```bash
grep -nE "storyToVideo" src/preload/index.ts   # 应已为 0 行
grep -nE "STV_" src/preload/index.ts            # 应已为 0 行
grep -cE "EP_" src/preload/index.ts             # 应 ≈ 92（46 channel 常量 + 46 引用）
grep -cE "episodeProduction:" src/preload/index.ts  # 应 = 1
```

- [ ] **Step 6: 改 `src/web/client/channel-map.ts`**

```bash
cd /home/ubuntu/workdir/the-bot
sed -i "s/'storyToVideo\\./'episodeProduction./g" src/web/client/channel-map.ts
sed -i "s/'stv:/'ep:/g" src/web/client/channel-map.ts
```

验证：

```bash
grep -cE "episodeProduction\\." src/web/client/channel-map.ts   # 期望 ≈ 46
grep -cE "stv:" src/web/client/channel-map.ts                    # 期望 0
grep -cE "storyToVideo" src/web/client/channel-map.ts            # 期望 0
```

- [ ] **Step 7: 改 `src/electron/index.ts`**

```bash
cd /home/ubuntu/workdir/the-bot
sed -i 's|./ipc/handlers/story-to-video.handler|./ipc/handlers/episode-production|g' src/electron/index.ts
sed -i 's/registerStoryToVideoHandlers/registerEpisodeProductionHandlers/g' src/electron/index.ts
```

验证：

```bash
grep -nE "registerStoryToVideoHandlers|story-to-video.handler" src/electron/index.ts   # 应为 0
grep -nE "registerEpisodeProductionHandlers" src/electron/index.ts                      # 应有 2 行（import + 调用）
```

- [ ] **Step 8: 改 `src/web/server/api/register-channels.ts`**

```bash
cd /home/ubuntu/workdir/the-bot
sed -i 's|@electron/ipc/handlers/story-to-video.handler|@electron/ipc/handlers/episode-production|g' src/web/server/api/register-channels.ts
sed -i 's/registerStoryToVideoHandlers/registerEpisodeProductionHandlers/g' src/web/server/api/register-channels.ts
```

验证同 Step 7。

- [ ] **Step 9: 改 renderer 调用 `electronAPI.storyToVideo.xxx`**

```bash
cd /home/ubuntu/workdir/the-bot
grep -rlE "electronAPI\\.storyToVideo|window\\.electronAPI\\.storyToVideo" src/renderer src/web --include='*.ts' --include='*.vue' | xargs -r sed -i 's/electronAPI\\.storyToVideo/electronAPI.episodeProduction/g'
```

验证：

```bash
grep -rnE "electronAPI\\.storyToVideo" src/renderer src/web --include='*.ts' --include='*.vue'  # 应为 0
grep -rcE "electronAPI\\.episodeProduction" src/renderer src/web --include='*.ts' --include='*.vue'  # 应 > 0
```

- [ ] **Step 10: 改 e2e 测试**

```bash
cd /home/ubuntu/workdir/the-bot
sed -i "s/'stv:/'ep:/g" tests/e2e/web/10-story-to-video.spec.ts
```

文件本身重命名留给 task 13。

- [ ] **Step 11: 删除旧 handler 文件**

```bash
cd /home/ubuntu/workdir/the-bot
git rm src/electron/ipc/handlers/story-to-video.handler.ts
```

- [ ] **Step 12: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck 2>&1 | tail -30
```

如有报错，最常见是：
- 漏改的 STV_ 常量引用（grep -rn "STV_"）
- service import 路径错（已在前面 task 改了，但 handler 重新 import 时可能引用旧 facade 路径）
- 类型 import 用了旧 path（types facade 已 re-export，应不破）

- [ ] **Step 13: 单测 + Web e2e 子集**

```bash
cd /home/ubuntu/workdir/the-bot
npm run test:unit:sqlite
npx playwright test --config=playwright.web.config.ts tests/e2e/web/10-story-to-video.spec.ts 2>&1 | tail -20
```

> 如果 Web e2e 因为通道名变化而失败（基线时通过 / 现在不通过），定位到具体 channel——在 5 个文件里找名字不一致的那条。

- [ ] **Step 14: 双端契约同步检查清单**

执行下列断言，全部为 0 才算同步完成：

```bash
cd /home/ubuntu/workdir/the-bot

echo "1. preload 中无残留 STV_ / storyToVideo / stv:"
grep -cE "STV_|storyToVideo|stv:" src/preload/index.ts

echo "2. channel-map 中无残留 storyToVideo. / stv:"
grep -cE "storyToVideo\\.|stv:" src/web/client/channel-map.ts

echo "3. electron/index.ts 无残留 registerStoryToVideo / story-to-video.handler"
grep -cE "registerStoryToVideoHandlers|story-to-video\\.handler" src/electron/index.ts

echo "4. web/server/api/register-channels.ts 无残留"
grep -cE "registerStoryToVideoHandlers|story-to-video\\.handler" src/web/server/api/register-channels.ts

echo "5. renderer 无 electronAPI.storyToVideo"
grep -rcE "electronAPI\\.storyToVideo" src/renderer src/web --include='*.ts' --include='*.vue' | grep -v ":0$" || echo "OK"

echo "6. 注册函数名同名 PC/Web"
grep -nE "registerEpisodeProductionHandlers" src/electron/index.ts src/web/server/api/register-channels.ts
```

预期前 5 行都输出 0；最后一行输出 2 个文件各有 2 行（import + 调用）。

- [ ] **Step 15: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep)!: P1 task 8 · 拆分 IPC handlers + 改名 stv→ep + 双端契约同步

handler 拆分：把 2079 行 story-to-video.handler 按子域拆为
  episode-production/{project,episode,workflow,compose,
                      asset/{character,location,item,voice}-asset,
                      narrative/{script,storyboard},
                      render/{keyframe,video,audio}}.handler.ts
并新建 registerEpisodeProductionHandlers 注册入口。

通道改名：46 个 IPC channel 全部 'stv:*' → 'ep:*'；
IPC_CHANNELS 常量 STV_* → EP_*；
preload 命名空间 storyToVideo → episodeProduction。

双端契约同步（5 文件原子改）：
- electron/index.ts                                改 import + 调用
- web/server/api/register-channels.ts              改 import + 调用
- preload/index.ts                                 改 IPC_CHANNELS + namespace
- web/client/channel-map.ts                        改 key 与 channel 字符串
- e2e 测试 stv:list-projects → ep:list-projects

零业务改动；事件名 'stv:synthesis-progress' → 'ep:synthesis-progress' 同步。

BREAKING CHANGE: 所有 IPC channel 前缀从 stv: 改为 ep:；
electronAPI.storyToVideo 改为 electronAPI.episodeProduction。
EOF
)"
```

---

## Task 9: 拆分 store `stores/story-to-video.ts`（1529 行）

**Files:**
- Create: `src/renderer/src/stores/episode-production/{workbench,project,episode,asset,script,storyboard,production,compose}.store.ts`
- Create: `src/renderer/src/stores/episode-production/index.ts`（barrel）
- Modify: 旧 `src/renderer/src/stores/story-to-video.ts` → deprecated facade
- Modify: 所有 renderer 内 `useStoryToVideoStore` 的引用

**Concept:** 1529 行 store 按 8 个职责拆。

- [ ] **Step 1: 列旧 store 的 state / getter / action 大纲**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "^  (const|function|async function|return \\{|state:|actions:|getters:)" src/renderer/src/stores/story-to-video.ts | head -80
```

按职责分组：

| 子 store | 含哪些 state / action |
|---|---|
| `workbench.store.ts` | 当前阶段、进度、stepper 切换、当前剧集 ID |
| `project.store.ts` | 项目列表、当前项目、CRUD |
| `episode.store.ts` | 剧集列表、当前剧集、CRUD、状态扭转 |
| `asset.store.ts` | 角色/地点/物品/语音绑定的 list/get/bind/update/delete |
| `script.store.ts` | 章节剧本、场景剧本的 state、AI 生成、定稿 |
| `storyboard.store.ts` | 分镜列表、当前分镜、AI 生成 |
| `production.store.ts` | 关键帧、视频片段生成、音频生成 |
| `compose.store.ts` | 时间线、转场、合成、导出 |

具体归属用读 + 判断决定，没有歧义。

- [ ] **Step 2: 创建 8 个子 store 文件**

每个文件用 Pinia setup store 风格（与 spec / 项目现有风格保持一致；如果项目用 options API store，按项目风格写）。

- [ ] **Step 3: 创建 barrel `index.ts`**

```typescript
export { useEpWorkbenchStore } from './workbench.store'
export { useEpProjectStore } from './project.store'
export { useEpEpisodeStore } from './episode.store'
export { useEpAssetStore } from './asset.store'
export { useEpScriptStore } from './script.store'
export { useEpStoryboardStore } from './storyboard.store'
export { useEpProductionStore } from './production.store'
export { useEpComposeStore } from './compose.store'
```

> 命名约定：`useEp{Subdomain}Store`，避免与 `useStoryToVideoStore` 旧名冲突。

- [ ] **Step 4: 旧 `stores/story-to-video.ts` 改 deprecated facade**

```typescript
/**
 * @deprecated 拆分到 stores/episode-production/*；新代码请直接 import 子 store。
 *             保留为 facade 以兼容现有调用方，后续 task 在改各 view/component 时
 *             顺手切换。
 */
export {
  useEpWorkbenchStore,
  useEpProjectStore,
  useEpEpisodeStore,
  useEpAssetStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpProductionStore,
  useEpComposeStore,
} from './episode-production'

import {
  useEpWorkbenchStore, useEpProjectStore, useEpEpisodeStore,
  useEpAssetStore, useEpScriptStore, useEpStoryboardStore,
  useEpProductionStore, useEpComposeStore,
} from './episode-production'

/**
 * @deprecated 改用 useEp*Store
 *             返回的对象暴露所有子 store 的 state/action 作为兼容 facade。
 */
export function useStoryToVideoStore() {
  return {
    workbench: useEpWorkbenchStore(),
    project: useEpProjectStore(),
    episode: useEpEpisodeStore(),
    asset: useEpAssetStore(),
    script: useEpScriptStore(),
    storyboard: useEpStoryboardStore(),
    production: useEpProductionStore(),
    compose: useEpComposeStore(),
  }
}
```

> 但是！原来代码里大概率是 `store.currentEpisode` 这种平铺访问，不是嵌套的 `store.episode.currentEpisode`。这个 facade 形态会破坏现有调用。**正确做法**：让 `useStoryToVideoStore()` 返回一个 computed 聚合对象，把所有子 store 的字段在顶层"打平"暴露。

具体 facade 实现：

```typescript
export function useStoryToVideoStore() {
  const wb = useEpWorkbenchStore()
  const proj = useEpProjectStore()
  const ep = useEpEpisodeStore()
  const asset = useEpAssetStore()
  const script = useEpScriptStore()
  const sb = useEpStoryboardStore()
  const prod = useEpProductionStore()
  const cmp = useEpComposeStore()

  return new Proxy({}, {
    get(_t, prop: string) {
      // 优先级查找：先 workbench → project → episode → asset → script → storyboard → production → compose
      for (const s of [wb, proj, ep, asset, script, sb, prod, cmp]) {
        if (prop in s) return (s as any)[prop]
      }
      return undefined
    },
  }) as any
}
```

> 警告：此 Proxy facade 只为兼容老代码"运行时"读路径，**会丢失类型信息**。后续每改到一个引用点都应直接换成具体 `useEp*Store()`。

- [ ] **Step 5: typecheck（会有大量类型推断变 any 警告，可接受）**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck 2>&1 | tail -20
```

新增的 `any` 警告本 task 容忍——下一个 task 拆 view 时会替换调用方为具体 store。

- [ ] **Step 6: unit + 浏览器手动验证（如有快速途径）**

```bash
cd /home/ubuntu/workdir/the-bot && npm run test:unit:sqlite 2>&1 | tail -20
```

- [ ] **Step 7: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 9 · 拆分 stores/story-to-video → stores/episode-production/*

把 1529 行 store 按职责拆为 8 个子 store
（workbench / project / episode / asset / script / storyboard / production / compose）。
旧 useStoryToVideoStore 改为 Proxy facade，运行时透明转发到子 store
以兼容现有调用方。后续 task 在改各 view/component 时
逐个替换为具体的 useEp*Store。
EOF
)"
```

---

## Task 10: 拆分 `VideoProjectEditor.vue`（5158 行）

**Files:**
- Create: `src/renderer/src/views/EpisodeWorkbench.vue`（壳，< 300 行）
- Create: `src/renderer/src/components/episode-production/dialogs/{CreateEpisodeDialog,EditEpisodeDialog,SettingsDialog,BindCharacterDialog,BindItemDialog,BindLocationDialog,GenerateImagesDialog,SynthesisDialog,StoryboardEditDialog,CharacterDetailDialog,ItemDetailDialog,LocationDetailDialog,EntityEditDialog,RegenerateDialog}.vue`
- Create: `src/renderer/src/components/episode-production/stage-script/ScriptTabContent.vue`（4 个 Tab 中"剧本"内容）
- Create: `src/renderer/src/components/episode-production/stage-asset/character/CharacterBindingTabContent.vue`
- Create: `src/renderer/src/components/episode-production/stage-asset/location/LocationBindingTabContent.vue`
- Create: `src/renderer/src/components/episode-production/stage-asset/item/ItemBindingTabContent.vue`
- Create: 工具函数 `src/renderer/src/components/episode-production/shared/{shot-labels.ts,outline-utils.ts}`
- Delete: `src/renderer/src/views/VideoProjectEditor.vue`
- Modify: `src/renderer/src/router/index.ts` 路由 component 引用

**Concept:** 这是 P1 最重的 view 拆分。**保持当前 4-Tab UI 形态不变**（不做 6 阶段 Stepper 化——那是 P6 的事）。本 task 只做"按职责拆物理文件"。

> ⚠️ 拆分前必须先做完整的"功能清单审计"——避免漏掉任何 dialog 或方法。

- [ ] **Step 1: 功能清单审计**

```bash
cd /home/ubuntu/workdir/the-bot
echo "=== Dialog 状态变量 ==="
grep -nE "showCreateEpisodeDialog|showEditEpisodeDialog|showSettingsDialog|showBindCharacterDialog|showBindItemDialog|showBindLocationDialog|showGenerateImagesDialog|showSynthesisDialog|showStoryboardEditDialog|showCharacterDetailDialog|showItemDetailDialog|showLocationDetailDialog|showEntityEditDialog|showRegenerateDialog|showImagePreview" src/renderer/src/views/VideoProjectEditor.vue | head -20

echo "=== Tab 切换 ==="
grep -nE "activeTab|el-tab-pane" src/renderer/src/views/VideoProjectEditor.vue | head -20

echo "=== 主要 method ==="
grep -nE "^(async )?function " src/renderer/src/views/VideoProjectEditor.vue | head -50
```

写下"清单"，确认 14 个 dialog + 4 个 Tab + 主壳的 init 逻辑 + 工具函数（modelToString / stringToModel / truncateTitle / getShotTypeLabel 等）。

- [ ] **Step 2: 创建工具函数文件**

`src/renderer/src/components/episode-production/shared/shot-labels.ts`：

```typescript
/**
 * 镜头语言标签映射（中文）
 * 拆自 VideoProjectEditor.vue
 */

export const shotTypeLabels: Record<string, string> = { /* copy */ }
export const cameraAngleLabels: Record<string, string> = { /* copy */ }
export const cameraMovementLabels: Record<string, string> = { /* copy */ }
export const statusLabels: Record<string, string> = { /* copy */ }

export function getShotTypeLabel(type: string): string { /* copy */ }
export function getCameraAngleLabel(angle: string): string { /* copy */ }
export function getCameraMovementLabel(movement: string): string { /* copy */ }
export function getStatusLabel(status: string): string { /* copy */ }
```

`src/renderer/src/components/episode-production/shared/model-config.ts`：

```typescript
export function modelToString(model: ...): string { /* copy */ }
export function stringToModel(str: string): ... { /* copy */ }
```

`src/renderer/src/components/episode-production/shared/outline-utils.ts`：

```typescript
// outlineCascaderProps / outlineTreeProps / outlineCascaderData computed 的工具
```

`src/renderer/src/components/episode-production/shared/index.ts` barrel。

- [ ] **Step 3: 拆 14 个 Dialog**

逐个 dialog 拆——每个 dialog 一个文件：

操作步骤（以 `BindCharacterDialog.vue` 为例）：

1. 找到 `<el-dialog v-model="showBindCharacterDialog"...>...</el-dialog>` 整个块
2. 找到 `bindCharacterForm` 和相关方法（提交 / 取消 / 校验）
3. 创建 `src/renderer/src/components/episode-production/dialogs/BindCharacterDialog.vue`：

```vue
<template>
  <el-dialog
    v-model="visible"
    title="绑定角色"
    width="600px"
    @close="handleClose"
  >
    <!-- 把原 dialog 的 template 内容粘过来 -->
    <template #footer>
      <!-- footer -->
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useEpProjectStore, useEpAssetStore } from '@/stores/episode-production'

const props = defineProps<{
  modelValue: boolean
  projectId: string
  // 其它依赖项
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'bound': []  // 绑定成功后通知父组件
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = reactive({ /* copy bindCharacterForm */ })
const projectStore = useEpProjectStore()
const assetStore = useEpAssetStore()

async function submit() { /* copy */ }
function handleClose() { /* copy */ }
</script>
```

> 关键：每个 dialog 用 `v-model` 控制可见性、用 emit 通知父组件，**不再共享父组件的内部状态**。

对 14 个 dialog 重复此操作。每完成 2-3 个 dialog 跑一次 typecheck。

- [ ] **Step 4: 拆 4 个 Tab 内容**

`src/renderer/src/components/episode-production/stage-script/ScriptTabContent.vue`：剧本 Tab 的内容（不含外层 el-tab-pane wrapper，那留在 EpisodeWorkbench.vue）。

`src/renderer/src/components/episode-production/stage-asset/character/CharacterBindingTabContent.vue`：角色绑定 Tab 的内容。

`location/LocationBindingTabContent.vue` / `item/ItemBindingTabContent.vue`：同样。

每个 Tab 组件：
- 接 `projectId` / `episodeId` / 其它必要 prop
- 用 `useEp*Store()` 拿数据
- emit 子事件（如打开某个 dialog） 

> 当前 5158 行 view 把 dialog 状态全放在主壳，子组件 emit 后由主壳决定打开哪个 dialog——拆分后这个层级应保留：dialog 仍由 EpisodeWorkbench.vue 管理可见性。

- [ ] **Step 5: 创建主壳 `EpisodeWorkbench.vue`（< 300 行）**

```vue
<template>
  <div class="episode-workbench">
    <!-- 顶部 episode 选择器（保留原结构） -->
    <EpisodeSelector v-model:episodeId="..." />

    <!-- 4 Tab（保留 P1 当前形态，P6 改 Stepper） -->
    <el-tabs v-if="store.currentEpisode" v-model="activeTab">
      <el-tab-pane label="剧本" name="script">
        <ScriptTabContent
          :project-id="projectId"
          :episode-id="currentEpisodeId"
          @open-dialog="openDialog"
        />
      </el-tab-pane>
      <el-tab-pane label="角色绑定" name="characters">
        <CharacterBindingTabContent ... />
      </el-tab-pane>
      <el-tab-pane label="物品绑定" name="items">
        <ItemBindingTabContent ... />
      </el-tab-pane>
      <el-tab-pane label="地点绑定" name="locations">
        <LocationBindingTabContent ... />
      </el-tab-pane>
    </el-tabs>

    <!-- Dialog 集合 -->
    <CreateEpisodeDialog v-model="dialogs.createEpisode" :project-id="projectId" @created="onEpisodeCreated" />
    <EditEpisodeDialog v-model="dialogs.editEpisode" :episode-id="dialogs.editingEpisodeId" />
    <SettingsDialog v-model="dialogs.settings" :project-id="projectId" />
    <BindCharacterDialog v-model="dialogs.bindCharacter" :project-id="projectId" @bound="onAssetBound" />
    <BindItemDialog v-model="dialogs.bindItem" :project-id="projectId" @bound="onAssetBound" />
    <BindLocationDialog v-model="dialogs.bindLocation" :project-id="projectId" @bound="onAssetBound" />
    <GenerateImagesDialog v-model="dialogs.generateImages" />
    <SynthesisDialog v-model="dialogs.synthesis" />
    <StoryboardEditDialog v-model="dialogs.storyboardEdit" :storyboard="dialogs.editingStoryboard" />
    <CharacterDetailDialog v-model="dialogs.characterDetail" :character-id="dialogs.detailId" />
    <ItemDetailDialog v-model="dialogs.itemDetail" :item-id="dialogs.detailId" />
    <LocationDetailDialog v-model="dialogs.locationDetail" :location-id="dialogs.detailId" />
    <EntityEditDialog v-model="dialogs.entityEdit" :entity-type="dialogs.editingEntityType" :entity-id="dialogs.editingEntityId" />
    <RegenerateDialog v-model="dialogs.regenerate" :storyboard="dialogs.regeneratingStoryboard" />
    <ImagePreview v-model="dialogs.imagePreview" :url="dialogs.previewImageUrl" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useEpProjectStore, useEpEpisodeStore } from '@/stores/episode-production'
import ScriptTabContent from '@/components/episode-production/stage-script/ScriptTabContent.vue'
import CharacterBindingTabContent from '@/components/episode-production/stage-asset/character/CharacterBindingTabContent.vue'
import LocationBindingTabContent from '@/components/episode-production/stage-asset/location/LocationBindingTabContent.vue'
import ItemBindingTabContent from '@/components/episode-production/stage-asset/item/ItemBindingTabContent.vue'
import CreateEpisodeDialog from '@/components/episode-production/dialogs/CreateEpisodeDialog.vue'
// ... 其它 13 个 dialog import

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)
const activeTab = ref<'script' | 'characters' | 'items' | 'locations'>('script')

const dialogs = reactive({
  createEpisode: false,
  editEpisode: false,
  editingEpisodeId: '',
  settings: false,
  bindCharacter: false,
  bindItem: false,
  bindLocation: false,
  generateImages: false,
  synthesis: false,
  storyboardEdit: false,
  editingStoryboard: null,
  characterDetail: false,
  itemDetail: false,
  locationDetail: false,
  detailId: '',
  entityEdit: false,
  editingEntityType: 'character' as 'character' | 'location' | 'item',
  editingEntityId: '',
  regenerate: false,
  regeneratingStoryboard: null,
  imagePreview: false,
  previewImageUrl: '',
})

function openDialog(type: keyof typeof dialogs, payload?: any) {
  // 子组件 emit 'open-dialog' 时统一调用此函数
  dialogs[type] = true
  // payload 处理（如 detailId / editingEntityType）
}

const projectStore = useEpProjectStore()
const episodeStore = useEpEpisodeStore()
const store = computed(() => ({ currentEpisode: episodeStore.current }))
const currentEpisodeId = computed(() => episodeStore.current?.id ?? '')

function onEpisodeCreated() { /* refresh episode list */ }
function onAssetBound() { /* refresh asset list */ }

// 原 onMounted / 路由 watch 等初始化逻辑搬过来
</script>
```

主壳 < 300 行（实际可能 200-280 行）。

- [ ] **Step 6: 删除旧 `VideoProjectEditor.vue`**

```bash
cd /home/ubuntu/workdir/the-bot
git rm src/renderer/src/views/VideoProjectEditor.vue
```

- [ ] **Step 7: 改路由**

`src/renderer/src/router/index.ts` 中：

```typescript
// 旧
{
  path: '/story-to-video/:projectId',
  name: 'VideoProjectEditor',
  component: () => import('@/views/VideoProjectEditor.vue'),
  ...
}

// 新（路径调整放 task 12 做；本 task 只改 component 引用）
{
  path: '/story-to-video/:projectId',
  name: 'VideoProjectEditor',
  component: () => import('@/views/EpisodeWorkbench.vue'),
  ...
}
```

> 这样在 task 12 改 path 之前，URL 仍是旧的，但视图已经是新的。两次 commit 关注点更清晰。

- [ ] **Step 8: typecheck + 简单冒烟**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck 2>&1 | tail -30
```

如有报错，逐条修。

```bash
npm run dev
# 浏览器打开 http://localhost:5173/story-to-video/<某 projectId>
# 切换 4 个 Tab
# 打开几个 Dialog，确认正常
```

- [ ] **Step 9: 跑 unit 测试 + Web e2e（如有 component test）**

```bash
cd /home/ubuntu/workdir/the-bot && npm run test:unit:sqlite
npx playwright test --config=playwright.web.config.ts tests/e2e/web/10-story-to-video.spec.ts
```

- [ ] **Step 10: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 10 · 拆分 VideoProjectEditor.vue（5158 行）→ EpisodeWorkbench + 14 dialog + 4 Tab content

views/EpisodeWorkbench.vue 作为主壳（< 300 行），保持当前 4-Tab UI 形态不变。
14 个 dialog 拆到 components/episode-production/dialogs/。
4 个 Tab 内容拆到 components/episode-production/stage-{script,asset/character,asset/item,asset/location}/<Tab>TabContent.vue。
工具函数（shot 标签 / model 配置 / outline 工具）拆到 components/episode-production/shared/。

主壳通过 v-model 控制 dialog 可见性，通过 props 传 projectId/episodeId，
通过 emit 接收子组件请求；store 调用切换为 useEp*Store。

UI 行为完全不变（6 阶段 Stepper 改造留给 P6）。
路由 path 仍为 /story-to-video/...，仅 component 引用换到 EpisodeWorkbench.vue（path 改名留给 task 12）。
EOF
)"
```

---

## Task 11: 拆分 `VideoProductionPage.vue`（1533 行）

**Files:**
- Create: `src/renderer/src/views/EpisodeProductionPage.vue`（壳）
- Create: 子组件若干，按页内 section 分（`components/episode-production/legacy-production/*` 或 `stage-production/*`）
- Delete: `src/renderer/src/views/VideoProductionPage.vue`
- Modify: 路由 component 引用

**Concept:** 1533 行的"视频制作详情页"。读完结构再决定如何拆。

- [ ] **Step 1: 读 + 大纲**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "<el-card|<el-tab|<el-dialog|^const show" src/renderer/src/views/VideoProductionPage.vue | head -40
echo "---"
grep -nE "^(async )?function " src/renderer/src/views/VideoProductionPage.vue | head -30
```

按 section 分组（每个 el-card / 每个明显职责的代码块作为一个子组件候选）。

- [ ] **Step 2: 创建子组件**

按 step 1 分组的 section 拆为子组件，放在 `src/renderer/src/components/episode-production/stage-production/` 下，命名沿用其展示职责（`StoryboardListSection.vue` / `CurrentStoryboardEditor.vue` / `KeyframePreview.vue` / `VideoPanel.vue` / `AudioPanel.vue` 等——具体名字根据实际 section 内容）。

每个子组件：< 400 行；用 props 接数据 + emit 改动。

- [ ] **Step 3: 创建主壳 `EpisodeProductionPage.vue`**

主壳 < 300 行；负责：
- 接路由参数（projectId / sceneId）
- 拉数据（用 useEpStoryboardStore / useEpProductionStore）
- 编排子组件

- [ ] **Step 4: 删除旧文件**

```bash
git rm src/renderer/src/views/VideoProductionPage.vue
```

- [ ] **Step 5: 改路由 component 引用**

`router/index.ts` 中：
```typescript
component: () => import('@/views/VideoProductionPage.vue')
// 改为
component: () => import('@/views/EpisodeProductionPage.vue')
```

- [ ] **Step 6: typecheck + 浏览器冒烟**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck 2>&1 | tail -20
```

- [ ] **Step 7: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "refactor(ep): P1 task 11 · 拆分 VideoProductionPage.vue（1533 行）→ EpisodeProductionPage + N 个 section 子组件

按页内 section 拆到 components/episode-production/stage-production/。
主壳 < 300 行，负责路由参数 + 数据拉取 + 子组件编排。
UI 行为不变。"
```

---

## Task 12: 重命名 `StoryToVideo.vue` + 路由路径调整

**Files:**
- Move: `src/renderer/src/views/StoryToVideo.vue` → `src/renderer/src/views/EpisodeProjectList.vue`
- Modify: `src/renderer/src/router/index.ts`（path / name / component 一并改）
- Modify: `src/renderer/src/layouts/MainLayout.vue`（侧边栏菜单 path 引用）
- Modify: `tests/e2e/web/10-story-to-video.spec.ts` 中 `gotoApp(page, '/story-to-video')` → `'/episode-production'`

**Concept:** 432 行的项目列表页，重命名 + 路径改名。这是 task 13 全量回归之前的最后一步代码改动。

- [ ] **Step 1: 文件重命名**

```bash
cd /home/ubuntu/workdir/the-bot
git mv src/renderer/src/views/StoryToVideo.vue src/renderer/src/views/EpisodeProjectList.vue
```

- [ ] **Step 2: 改路由（路径 + name + component）**

`router/index.ts` 中三个路由全部改：

```typescript
// 旧
{ path: '/story-to-video', name: 'StoryToVideo', component: () => import('@/views/StoryToVideo.vue'), ... }
{ path: '/story-to-video/:projectId', name: 'VideoProjectEditor', component: () => import('@/views/EpisodeWorkbench.vue'), ... }
{ path: '/story-to-video/:projectId/production/:sceneId', name: 'VideoProduction', component: () => import('@/views/EpisodeProductionPage.vue'), ... }

// 新
{ path: '/episode-production', name: 'EpisodeProjectList', component: () => import('@/views/EpisodeProjectList.vue'), meta: { title: '剧集制作' } }
{ path: '/episode-production/:projectId', name: 'EpisodeWorkbench', component: () => import('@/views/EpisodeWorkbench.vue'), meta: { title: '剧集编辑' } }
{ path: '/episode-production/:projectId/production/:sceneId', name: 'EpisodeProduction', component: () => import('@/views/EpisodeProductionPage.vue'), meta: { title: '画面制作' } }
```

> 注：spec 第 5.3 节定义的最终子路由（`/episode/:episodeId/{content,assets,...}`）是 P6 工作台 6 阶段化时的事，本 task 仅做"主路径改名 + 视图重命名"。

- [ ] **Step 3: 加旧路径 redirect 兼容（可选）**

如果用户书签 / 分享链接可能保留旧路径，加 redirect：

```typescript
{ path: '/story-to-video', redirect: '/episode-production' },
{ path: '/story-to-video/:projectId', redirect: (to) => `/episode-production/${to.params.projectId}` },
{ path: '/story-to-video/:projectId/production/:sceneId',
  redirect: (to) => `/episode-production/${to.params.projectId}/production/${to.params.sceneId}` },
```

放在新路由之后；本 phase 保留 1 个版本周期，后续 phase 移除。

- [ ] **Step 4: 改 MainLayout 侧栏菜单**

```bash
cd /home/ubuntu/workdir/the-bot
grep -nE "/story-to-video|StoryToVideo" src/renderer/src/layouts/MainLayout.vue
```

每条命中改成 `/episode-production` / `EpisodeProjectList`。

- [ ] **Step 5: 改 e2e 访问 path**

```bash
cd /home/ubuntu/workdir/the-bot
sed -i "s|gotoApp(page, '/story-to-video'|gotoApp(page, '/episode-production'|g" tests/e2e/web/10-story-to-video.spec.ts
```

- [ ] **Step 6: 全文搜残留**

```bash
cd /home/ubuntu/workdir/the-bot
grep -rnE "/story-to-video|StoryToVideo\\.vue|StoryToVideo\\b" src/ tests/ --include='*.ts' --include='*.vue'
```

预期只剩"deprecated re-export 文件"中的注释引用 + redirect 路由。其它都应已替换。

- [ ] **Step 7: typecheck + 浏览器冒烟**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck
npm run dev
# 浏览器访问 http://localhost:5173/episode-production
# 旧 URL http://localhost:5173/story-to-video 应自动 redirect
```

- [ ] **Step 8: 提交**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep)!: P1 task 12 · 重命名 StoryToVideo.vue → EpisodeProjectList + 路由 /story-to-video → /episode-production

- view 文件 git mv：StoryToVideo.vue → EpisodeProjectList.vue
- 三条主路由 path 改名（含 name）：
  /episode-production
  /episode-production/:projectId
  /episode-production/:projectId/production/:sceneId
- 旧路径加 redirect 兼容（1 版本周期后移除）
- MainLayout 侧栏菜单同步改名
- e2e 访问 path 同步改名

BREAKING CHANGE: 路由 path 从 /story-to-video 改为 /episode-production；
旧路径用 redirect 兼容，后续版本移除。
EOF
)"
```

---

## Task 13: 全量回归 + lint + DoD 校验 + 测试文件更名

**Files:**
- Move: `tests/e2e/web/10-story-to-video.spec.ts` → `tests/e2e/web/10-episode-production.spec.ts`
- Verify: typecheck / lint / unit / Web e2e / PC e2e（如本机能跑）

**Concept:** 收尾。改名测试文件、跑全量验证、修任何残留问题。

- [ ] **Step 1: e2e 文件改名**

```bash
cd /home/ubuntu/workdir/the-bot
git mv tests/e2e/web/10-story-to-video.spec.ts tests/e2e/web/10-episode-production.spec.ts
# 改文件内顶部注释（如有 "Web 端 E2E - 剧集制作 / Story to Video"）
sed -i "s/Story to Video/Episode Production/g" tests/e2e/web/10-episode-production.spec.ts
sed -i "s/story-to-video/episode-production/g" tests/e2e/web/10-episode-production.spec.ts
```

- [ ] **Step 2: 跑全量 typecheck**

```bash
cd /home/ubuntu/workdir/the-bot && npm run typecheck 2>&1 | tee /tmp/p1-final-typecheck.log
echo "exit=$?"
```

对比基线（task 0 step 2 记录），确保**不退化**——失败数 ≤ 基线。

- [ ] **Step 3: 跑全量 lint**

```bash
cd /home/ubuntu/workdir/the-bot && npm run lint 2>&1 | tee /tmp/p1-final-lint.log
echo "exit=$?"
```

对比基线。新增的 ESLint warning（如 `any` 类型告警，来自 task 9 store facade）可接受；error 不可新增。

- [ ] **Step 4: 跑全量 unit 测试**

```bash
cd /home/ubuntu/workdir/the-bot && npm run test:unit:sqlite 2>&1 | tee /tmp/p1-final-unit.log
echo "exit=$?"
```

对比基线。

- [ ] **Step 5: 跑 Web e2e**

```bash
cd /home/ubuntu/workdir/the-bot && npx playwright test --config=playwright.web.config.ts tests/e2e/web/10-episode-production.spec.ts 2>&1 | tee /tmp/p1-final-web-e2e.log
echo "exit=$?"
```

如失败，定位具体 channel。

- [ ] **Step 6: 跑 PC e2e（如本机能跑）**

```bash
cd /home/ubuntu/workdir/the-bot && npx playwright test tests/e2e/app.spec.ts 2>&1 | tee /tmp/p1-final-pc-e2e.log
echo "exit=$?"
```

- [ ] **Step 7: 双端契约同步终验**

```bash
cd /home/ubuntu/workdir/the-bot
echo "=== 通道前缀残留检查（应全为 0） ==="
grep -rcE "STV_|storyToVideo|stv:" src/preload/index.ts src/web/client/channel-map.ts src/electron/index.ts src/web/server/api/register-channels.ts || echo "OK"

echo "=== 旧 handler 文件残留 ==="
ls src/electron/ipc/handlers/story-to-video.handler.ts 2>&1 || echo "已删除（OK）"

echo "=== 路由旧 path 残留（除 redirect） ==="
grep -nE "'/story-to-video'" src/renderer/src/router/index.ts | grep -v redirect || echo "无残留（OK）"
```

预期前 3 行全为 0 / OK / OK。

- [ ] **Step 8: 大文件大小检查**

```bash
cd /home/ubuntu/workdir/the-bot
find src -type f \( -name "*.vue" -o -name "*.ts" \) ! -path "*/node_modules/*" -exec wc -l {} + 2>/dev/null | awk '$1 > 800 && $2 != "total"' | sort -rn | head -20
```

预期：本 phase 涉及的 8 个原大文件全部不再出现（或仅以 deprecated facade 形式存在 < 200 行）。

- [ ] **Step 9: P1 DoD 自检**

逐条核对（与 spec 第 6.4 节"架构维度"对应）：

- [ ] `story-to-video` → `episode-production` 改名完成（含路径/路由/IPC/类名）
- [ ] 5 大子域目录结构建立（assets/narrative/render/compose/workflow）
- [ ] 10 个大文件按目标拆分（无单文件超 800 行——除可接受的 deprecated facade）
- [ ] 模块依赖单向（episode-production 单向引用其它）
- [ ] PC e2e 不退化
- [ ] Web e2e 不退化
- [ ] 双端 5 文件契约一致

- [ ] **Step 10: 提交（仅当上述步骤全部通过时）**

```bash
cd /home/ubuntu/workdir/the-bot
git add -A
git commit -m "$(cat <<'EOF'
refactor(ep): P1 task 13 · 收尾：测试文件改名 + 全量回归通过 + DoD 校验

- tests/e2e/web/10-story-to-video.spec.ts → 10-episode-production.spec.ts（含内容同步）
- typecheck / lint / unit / Web e2e 全部不退化（与 task 0 基线对齐）
- 双端契约同步终验（preload / channel-map / electron index / register-channels 全部对齐）
- 大文件大小检查：原 8 个 > 800 行的文件已全部拆分（仅保留必要的 deprecated facade）

P1 完成。下一步进入 P2（数据迁移）。
EOF
)"
```

- [ ] **Step 11: 整理 plan checkpoint 给用户**

```bash
cd /home/ubuntu/workdir/the-bot && git log --oneline feat/episode-production-redesign ^master | head -20
```

提交清单：14 个 commit（task 0 创建骨架 → task 13 收尾）。

附一段总结给用户：

> P1 已完成。
> - 14 个 commit 全部独立可 revert
> - 大文件拆分：5158 / 2079 / 1557 / 1533 / 1529 / 981 / 980 / 795 / 532 行的 8 个文件全部按目标拆分
> - 双端契约同步：preload / channel-map / electron index / register-channels 5 文件已对齐
> - 测试基线保持：typecheck / lint / unit / Web e2e 无退化
> - 旧路径 `/story-to-video` 加 redirect 兼容
>
> 准备好可合 master / 接 P2（数据迁移）。

---

## Self-Review

### Spec 覆盖检查

对照 spec 第 6.2 节 P1 章节内容（"模块改名 + 目录重组 + 10 个大文件拆分。**不改业务逻辑**——纯结构性重构。每步保证现有测试通过"）：

- [x] 模块改名：task 8 / 12 完成（IPC + 路由 + view）
- [x] 目录重组：task 0 创建骨架；后续 task 填内容
- [x] 10 个大文件拆分：
  - VideoProjectEditor.vue 5158 行 → task 10
  - story-to-video.handler.ts 2079 行 → task 8
  - story-to-video-ai.service.ts 1557 行 → task 4
  - VideoProductionPage.vue 1533 行 → task 11
  - story-to-video.ts (store) 1529 行 → task 9
  - story-to-video.types.ts 981 行 → task 1
  - story-to-video-resource.service.ts 980 行 → task 5
  - video-synthesis.service.ts 795 行 → task 6
  - video.service.ts 532 行 → task 7（新增）
  - StoryToVideo.vue 432 行 → task 12（重命名）
  - 共 10 个 ✓
- [x] 不改业务逻辑：每个 task 末尾 commit message 强调"零业务改动"
- [x] 现有测试通过：task 0 记录基线，task 13 终验
- [x] 双端约束（spec 0.3）：每个涉及通道的 task（task 8）有"双端 5 文件契约同步"清单

### Placeholder 扫描

搜本 plan 全文，确认无 "TBD" / "TODO" / "implement later" / "fill in details" / "add appropriate validation" / "similar to task N"（每个 task 都自含命令）。

特例：task 7 的内容因为 video.service.ts 实际细节未完全读完，写法是"读 + 列 export → 按职责切分"。这种"探索性"步骤在 phase 1 这种重构 plan 里不可避免，不算 placeholder——它有明确的"读 → 切分准则 → 创建文件"流程。

### 类型 / 命名一致性

- 新 service 命名：`EpisodeScriptGenerator` / `EpisodeStoryboardGenerator` / `KeyframeGeneratorService` / `NarrationSynthesisService` / `DialogueSynthesisService` / `SceneAudioService` / `TempAssetService` / `FfmpegAssemblerService` / `TransitionService` / `ShotVideoService` / `SceneShotsService` / `AudioMixService` / `SceneVideoService` —— 全部以 Service / Generator 后缀，前缀避免使用 EpisodeProduction（太长）
- 新 store 命名：`useEp{Subdomain}Store` 一致
- 新 handler 注册函数命名：`register{Subdomain}Handlers` + 顶层 `registerEpisodeProductionHandlers`
- 旧名 `StoryToVideoTask` → `EpisodeProductionTask`（task 4），保留 deprecated 别名
- IPC channel 前缀 `ep:`、IPC_CHANNELS 前缀 `EP_`、preload namespace `episodeProduction` 三处一致

### 双端契约清单

每个涉及通道的 task（task 8）已包含"双端 5 文件契约同步检查清单"。其它 task 不动通道，但 task 13 的最终 DoD 校验包括"双端契约同步终验"，对全 phase 兜底。
