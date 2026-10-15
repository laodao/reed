# 任务 T07 · 关键镜头精修工作台 MVP

> Wave：W3（合并序第 1）｜估时：8–12 人日｜依赖：**T00**（生成埋点走 registry 契约）、**T01**（写回确认弹窗复用 `AssetWriteImpactDialog`）
> 被依赖：T08 复用本任务产出的"候选—写回"组件与会话隔离模式
> 必读：`00-共享约定与工程规范.md`

## 执行须知（subagent）

- **范围白名单**：仅下文 §4 所列文件。
- **安全边界红线**：精修会话内的生成图**绝不**写 `asset_image`、不写分镜关键帧、不进挑图列表——只有显式"写回"才落库。此不变量必须有单测覆盖。
- **MVP 裁剪**：不含局部重绘/遮罩（图像 provider 无 mask 能力，二期经 ComfyUI inpaint）；不含视频候选。
- **前置核对（review 修正）**：深度评审残留高危 TOP1"V2 参考板成员缺图编号错位"直接影响本任务（候选生成走 `ReferenceBoardService.build`）。开工前先复现/确认 V2 现状；未修复则把该修复纳入本任务范围或上报协调者。
- **基建挂接红线（review 修正）**：会话清理必须**扩展 `startup-recovery.ts` 的 `sweepTempDirs` 目录清单**（该函数已按 mtime 清扫 24h session 目录，`:78`），**禁止**另起定时器或独立扫描。
- **DoD / 报告**：见 README §6。

## 1. 背景与目标

一集总有若干关键镜头决定成片观感上限，"一次生成定生死"的抽卡模式方差极大。精修工作台提供：载入分镜完整上下文 → 同参考并行多候选 → 并排比较 → 明确写回（DramaClaw 虾画 80% 高频用途的轻量替代）。

## 2. 功能设计

### 2.1 入口与布局

- 入口：制作 stage 关键帧面板与分镜卡新增"🎨 精修"按钮 → 全屏弹窗。
- 三栏布局（`RefineWorkbenchDialog.vue`）：
  - **左栏·上下文**（`RefineContextPanel.vue`）：分镜文案（台词/画面描述，只读可复制）；出场角色/场景/道具卡，点击经 `AssetGalleryPicker.vue`（`storyboard/AssetGalleryPicker.vue` 已有）增删参考；当前正式关键帧与挑图 override 展示。
  - **中栏·候选网格**（`RefineCandidateGrid.vue`）：并行生成 N 候选（默认 4，可 2–6）；卡片操作：双击大图对比（走统一大图预览交互，manual §8.1）、**写回**、删除。候选来源支持 AI 生成 / 本地上传（拖入即成候选）。
  - **右栏·参数与写回**（`RefineParamPanel.vue`）：正向提示词（预填画面描述，可改）、风格（读项目风格快照，T05 产物）、参考编排摘要、生成按钮。

### 2.2 候选隔离机制（安全边界核心）

- 会话 `sessionId`（uuid）；生成的图落 `{userData}/episode-production/refine/{sessionId}/`，**不写 `asset_image` / 不写关键帧 / 不进挑图列表**。
- **写回** = 显式动作，**路径唯一（review 修正，不得二选一）**：选定候选 → 弹 `AssetWriteImpactDialog`（T01 产物，此处显示"仅当前分镜"）→ 候选图**落库为该分镜正式关键帧，并写 `reference_overrides` 指定该图**（与挑图 UI 天然兼容、状态可追溯）→ 其余候选标记弃用。禁止出现"只落库不写 override"或"只写 override 不落库"的第二种行为，单测断言两者同时发生。
- 会话文件清理：关闭会话时保留供继续比较；过期（>7 天）会话由启动清理回收（复用 `startup-recovery.ts` 的临时目录清理模式，加一个 refine 目录扫描）。
- 崩溃恢复：reopen 会话按目录内文件重建候选列表（文件仍在即可恢复）。

### 2.3 生成

- 并行调用关键帧生成服务（N 路并行，受既有 provider 限流约束）；**与正式链路同一 prompt 组装通道**（`keyframe-prompt-builder`）——保证"精修所见即正式所得"。
- **registry 埋点（T00 契约）**：批量生成起任务处 `registry.create({ taskType: 'ep.keyframe', entityType: 'storyboard', entityId, payloadJson })`，进度/终态 update/succeed/fail。

## 3. 交互流

```
打开精修 → 载入上下文 → 调参 → [生成 4 候选]（registry 登记）
  → 并排比较/上传补充候选 → 选择 1 张 → [写回]（影响确认）→ 落库为关键帧
  → 关闭会话（未写回候选保留，7 天后清理）
```

## 4. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `renderer/src/components/episode-production/storyboard/refine/RefineWorkbenchDialog.vue`（含 RefineContextPanel / RefineCandidateGrid / RefineParamPanel 三子组件） | 工作台 UI |
| 新增 | `renderer/src/stores/episode-production/refine.ts` | 会话/候选状态 |
| 新增 | `platform/episode-production/render/keyframe/refine-session.service.ts` | 会话生命周期：目录、批量编排、写回落库、清理、崩溃恢复 |
| 新增 | `packs/episode-production/handlers/render/refine.handler.ts` | `ep:refine:open/generate/write-back/discard/cleanup` |
| 修改 | `packs/episode-production/handlers/index.ts` | 注册 |
| 修改 | 制作 stage 关键帧面板、分镜卡组件 | 入口按钮 |
| 修改 | `src/shared/types/` | 会话/候选类型 |

## 5. 测试与验收

**单测**（`refine-session.service.spec.ts`）：
- 候选路径隔离：生成落 `refine/{sessionId}/`，`asset_image` 与关键帧表无新行（**安全边界不变量**）
- 写回后：挑图列表出现该图、正式关键帧更新、其余候选未入库
- cleanup 只清过期会话目录
- registry 埋点：create/succeed/fail 调用与 payloadJson 完整

**集成**：同一分镜 4 候选并行（mock provider 计数=4）；写回 1 张后正式链路更新。

**人工验收 AC**：
- AC1 打开精修即见完整上下文（文案/资产/当前关键帧/override）
- AC2 一键 4 候选并排，双击大图对比
- AC3 本地上传图可作为候选参与比较
- AC4 写回仅影响当前分镜；写回前弹影响确认（"仅当前分镜"）
- AC5 会话内生成图在关闭前不出现在资产库/挑图列表
- AC6 关窗/崩溃后 reopen 会话候选可恢复
- AC7 生成任务在 registry 中可见（内存实现即可，为 T11 验证埋点）
- AC8 回归基线全绿
