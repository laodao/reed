# 任务 T08 · 导演工作台 L1 MVP

> Wave：W4（单 agent，质量主线最大项）｜估时：15–20 人日｜依赖：**T00**（registry 埋点）、**T05**（风格通道在位，实现"控制图与风格参考分槽"）、**T07**（复用"候选—写回"模式与影响确认交互）
> 必读：`00-共享约定与工程规范.md`；构图提示词遵循 00 §8
> 设计依据：评估文档附录 A（3GS 实现真相 / L1 地基盘点 / 分层难度）

## 执行须知（subagent）

- **范围白名单**：仅下文 §5 所列文件；白名单外的既有文件只允许"在指定挂点追加调用"，不允许重构。
- **价值兑现红线**（评估附录 A5，验收重点）：① 控制图与风格参考**必须分槽**——构图槽固定引导语"仅约束构图/站位/景别，忽略其渲染风格与质感"，与风格通道（`style-resolver`）物理分离；② 摆位数据必须程序化生成构图提示词（文字+控制图双通道）。
- **E2E 风险降级路径**：headless WebGL（swiftshader）可能不稳定；若 three.js 场景在 E2E 中反复失败，允许降级为 IPC 层集成测试 + 真机人工验收，在报告中记录。
- **前置核对（review 修正）**：深度评审残留高危 TOP1"V2 参考板成员缺图编号错位"影响本任务（构图槽经 `ReferenceBoardService.build` 消费）。开工前确认 V2 现状；未修复则与协调者确认把修复纳入范围。
- **DoD / 报告**：见 README §6；本任务额外要求 A/B 数据产出（§7）。

## 1. 背景与目标

空间不连续与站位/构图失控是 AI 视频废片两大根因，且是生成前唯一可用确定性手段解决的部分。导演工作台 = 可取景的 2.5D 代理片场：场景内拖拽摆放人物/道具/占位 → 调机位 → 导出导演控制图 → 写回分镜背景参考 → 关键帧继承构图 → 图生视频继承首帧。链路：**控制图 → 关键帧首帧 → I2V 强继承**。

## 2. 数据模型

**新表 `ep_scene_blockings`**（迁移 `add-ep-scene-blockings`，一地点一套摆位）：

```
id PK / user_id / location_binding_id
layout_json: [{ kind: 'character'|'item'|'placeholder',
                assetId?, refImageId?,          -- character/item 必填
                x: number, y: number,           -- 米，地面平面坐标，原点=场景中心
                rotationDeg: number, scale: number, label?: string }]
camera_defaults_json: { fovDeg, heightM, pitchDeg, focalPreset?, yawDeg }
updated_at
```

**`storyboards` 加列 `camera_meta_json`**（迁移 `add-storyboard-camera-meta`）：单分镜机位覆写 + 导出参数快照（摆位属地点、机位属分镜）。

**控制图落库**：导出图落文件后以 `image_asset`（`category='context'`，`label='director_control'`）登记，`storyboard.backgroundRefImageId` 指向它——写回槽位复用已验证的 `storyboard.service.setBackgroundRefImageId`（`storyboard.service.ts:105-119`）。

## 3. 功能设计

### 3.1 three.js 场景（技术栈已在依赖：three ^0.179.1 + three-spritetext）

- 场景构成：背景卡（场景主图作远处竖立平面）、地面网格（1m 网格 + floor_plan 叠加开关，对齐 `main-image-generator` 的平面布局图）、实体卡：
  - character：竖立平面卡（billboard），贴图用其**视角派生图**（`character-view-hints.ts` 7 类：正面/左右四分之三/左右侧身），按"实体朝向 − 相机方位角"自动选最近视角贴图
  - item：参考图卡；placeholder：半透明人形剪影
  - `three-spritetext` 名称标签
- 双视图（同一 Scene 双相机）：俯视 `OrthographicCamera`（摆位编辑主视图，可叠 floor_plan）+ 透视 `PerspectiveCamera`（取景预览，参数即导出机位）
- 交互：俯视图 pointer 拖拽移动（raycast 地面）、旋转/缩放滑杆、删除；透视视图拖拽调 yaw/pitch、滑杆调 FOV 与高度；焦段预设命名对齐 `assets/constants/lens-presets.ts`
- 导出：固定 1280×720 渲染目标，`preserveDrawingBuffer: true` + `captureCanvas()`（PanoramaViewer 同款方案）

### 3.2 写回与消费链路（价值兑现核心）

1. 新 handler `ep:director:export-control-image { storyboardId, imageBase64 }`：base64 → 落文件（主进程）→ `image_asset` 登记（category=context）→ `setBackgroundRefImageId` → 返回 `{ imageId, path }`。**registry 埋点**：taskType `ep.keyframe`（或独立 `ep.director`，注册到 T00 的类型并集即可）。
2. **分槽注入**：关键帧参考板组装处，`backgroundRefImageId` 对应图进入独立"背景/构图"槽；`keyframe-prompt-builder.ts` 对该槽固定插入引导语："以下为构图与站位参考图（layout control image）：仅约束构图、人物站位与景别；忽略其渲染风格、材质与质感。"风格仍由 `style-resolver` 通道（T05）负责。
3. **构图提示词生成器** `prompts/director-composition-prompt.ts`（纯函数，表驱动可单测）：
   - 景别：主体在画面中的高度比 → 远景/全景/中景/近景/特写五档
   - 左右：x 坐标符号 → 画面左侧/右侧/居中
   - 朝向：`rotationDeg − yawDeg` 差 → 面向镜头 / 背对镜头 / 侧对镜头
   - 俯角：pitchDeg → "平视/微俯/俯视"
   - 输出："中景：女主位于画面左侧背对镜头，男主右侧面向镜头；镜头微俯，焦段约 35mm"
   - 注入：关键帧画面描述为空或用户勾选"辅助构图描述"时追加到画面描述尾部（不覆盖用户文案）

### 3.3 入口

- 分镜卡 / 关键帧面板："🎬 导演取景"按钮（带机位编辑）
- 地点资产卡："编辑摆位"入口（两段式：摆位属地点、机位属分镜）

## 4. MVP 裁剪

全景球背景（复用 PanoramaViewer 思路，+5d）、多机位保存/切换（+3d）、道具占位细化（+2–3d）与 glTF 导入（L4）均**不在 MVP**，接口设计预留（layout_json 与 camera 结构已含扩展位）。

## 5. 代码改动清单

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `database/migrations/add-ep-scene-blockings.ts`、`add-storyboard-camera-meta.ts` | 两笔迁移（双方言） |
| 新增 | `database/entities/episode-production/scene-blocking.entity.ts` + repository | 实体/仓储 |
| 修改 | `database/entities/episode-production/storyboard.entity.ts` | `camera_meta_json` 列 |
| 新增 | `platform/episode-production/assets/services/scene-blocking.service.ts` | 摆位/机位 CRUD |
| 新增 | `platform/episode-production/render/director/stage-compositor.service.ts` | 导出落盘/登记/写回 |
| 新增 | `platform/episode-production/prompts/director-composition-prompt.ts` | 构图描述纯函数 |
| 修改 | `platform/episode-production/render/keyframe/`（参考板组装处） | backgroundRef 独立构图槽 |
| 修改 | `platform/episode-production/render/keyframe/keyframe-prompt-builder.ts` | 构图槽引导语 + 构图描述注入 |
| 新增 | `packs/episode-production/handlers/director.handler.ts` | `ep:director:get/save-blocking`、`get/save-camera`、`export-control-image` |
| 修改 | `packs/episode-production/handlers/index.ts` | 注册 |
| 新增 | `renderer/src/components/episode-production/shared/director/`：`DirectorStageDialog.vue`、`StageScene.vue`（three 封装）、`useStageScene.ts`、`BlockingEditor.vue`、`CameraPanel.vue` | 前端全套 |
| 修改 | 分镜卡 / 关键帧面板 / 地点资产卡 | 三处入口 |
| 修改 | `src/shared/types/` | blocking/camera 类型 |

> `package.json` 无需新增依赖（three/three-spritetext/@types/three 已在）。

## 6. 测试与验收

**单测**：
- 摆位/机位 CRUD + user 隔离；两笔迁移双方言（参照 `tests/unit/migrations/`）
- `director-composition-prompt` 表驱动：x 符号/rotation−yaw 差/高度比/pitch → 左右/朝向/景别五档/俯角的断言（全组合抽样表）
- prompt 组装快照：构图槽引导语存在、与风格槽分离（不互相污染）、构图描述注入位置正确
- 参考板组装：backgroundRef 进入构图槽且不计入风格参考

**集成**：export-control-image 全链路——base64 落盘 → image_asset 登记 → backgroundRefImageId 指向 → 关键帧生成请求参考列表含该图（构图槽）→ registry 埋点记录。

**E2E**：`10-episode-production.spec.ts` 增补"打开导演台 → 拖一个实体 → 导出写回"冒烟（断言 DOM 流程与 IPC 调用，不断言画面内容；headless WebGL 不稳时按执行须知降级为集成测试）。

**人工验收 AC**：
- AC1 俯视拖拽摆人/道具/占位，透视预览实时反映；billboard 贴图随相机方位自动切换视角图
- AC2 控制图 1280×720 PNG，含背景与摆位卡
- AC3 写回后挑图列表可见控制图；重新生成关键帧的站位/左右/景别与控制图一致
- AC4 构图描述自动出现在画面描述尾部且可被用户改写覆盖
- AC5 有角色参考图时人物一致性不受构图槽影响（无占位图质感泄漏——分槽生效）
- AC6 摆位属地点（换分镜复用）、机位属分镜（互不干扰）
- AC7 PC/Web 双端 WebGL 可用
- AC8 回归基线全绿

## 7. A/B 验证（本任务的专项验收，W5 汇总）

同一组分镜，开/关控制图各生成一组关键帧（其余参数冻结）：`quality-check` VLM 相似度组间对比 + 人工站位/左右/景别一致率统计，报告写入 `docs/` 并回填 README 状态表。数据支撑 L2（深度代理）投入决策。
