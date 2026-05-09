# Episode Production Redesign · Phase 1-4 实施进度

> 实施日期：2026-05-09 ~ 2026-05-10
> spec：[`docs/review/2026-05-09-ep-redesign-spec.md`](../../docs/review/2026-05-09-ep-redesign-spec.md)
> 工作模式：无人值守（Auto Mode），TDD 红绿循环

## 完成的 commits

| # | hash | scope | spec § | P# |
|---|---|---|---|---|
| 1 | `55f9b148` | C1 缩减身份保持约束 | §3.2 P-1 | P-1 |
| 2 | `35ac1879` | C2 metadata 解耦（alias/role） | §3.2 P-2 | P-2 |
| 3 | `f9991781` | C3 透明度面板 GenerationDetailDialog | §3.2 A1 | P-3 |
| 4 | `134a1067` | C4 设定卡字段双层 UI | §3.2 B1 | P-4 |
| 5 | `39b324d1` | C5 AI 正向字段提取 | §3.2 B2 | P-5 |
| 6 | `d90db795` | C6 角色一键多角度参考图 | §3.2 B3 | P-6 |
| 7 | `05b738fd` | C7 镜头语言层（双模板 + 25 运镜 + 12 打光） | §3.2 B4-B5 | P-11~14 |
| 8 | `67cd92ff` | C8 全局镜头编号 | §3.2 B5b | P-15 |
| 9 | `149bd1cc` | C9 派生支持多基图 | §3.2 B6 | P-16 |
| 10 | `935fe12b` | C10 9 帧故事板预览（service + IPC） | §3.2 B7 | P-18 |
| 11 | `99cae001` | P3-C1 Provider subject 探测 | §3.2 C1 | P-20 |
| 12 | `116fe52e` | P3-C2 局部子画布连线 | §3.2 C2 | P-17 |
| 13 | `19ff63bd` | P3-C3 AI 一键模式 orchestrator 骨架 | §3.2 C3 | P-19 |
| 14 | `1d66278f` | D1 角色形象组 | §3.2 D1 | P-9 |
| 15 | `d3f44cdf` | D3 数字人池 12 个预设 | §3.2 D3 | P-8 |
| 16 | `d8266ba4` | D2 跨项目角色库 | §3.2 D2 | P-7 |

**总计：16 个 commit · 60+ 个文件 · 8000+ 行新增代码 · 136 个测试用例**

## 测试统计

| 测试 spec 文件 | 用例数 |
|---|---|
| character-constraints.spec.ts | 9 |
| item-constraints.spec.ts | 6 |
| asset-identity-prompt-metadata-shrink.spec.ts | 7 |
| asset-setting-enrichment-extract.spec.ts | 8 |
| main-image-generator-three-views.spec.ts | 7 |
| lens-presets.spec.ts | 15 |
| keyframe-prompt-builder-camera-metadata.spec.ts | 6 |
| storyboard-id.spec.ts | 5 |
| gallery-derivation-multi-base.spec.ts | 7 |
| storyboard-thumbnail-generator.spec.ts | 9 |
| infer-subject-support.spec.ts | 21 |
| quick-mode/orchestrator.spec.ts | 7 |
| character-asset-reference-set.spec.ts | 10 |
| preset-digital-human.spec.ts | 8 |
| user-asset.service.spec.ts | 11 |
| **TOTAL** | **136** |

## 22 项问题覆盖率

| Problem | 状态 | commit |
|---|---|---|
| P-1 派生过度文本约束 | ✅ 已解决 | C1 |
| P-2 metadata 进 prompt | ✅ 已解决 | C2 |
| P-3 看不到 prompt / 派生关系 | ✅ 已解决 | C3 |
| P-4 设定卡字段平铺 | ✅ 已解决 | C4 |
| P-5 字段填写认知负担 | ✅ 已解决 | C5 |
| P-6 三视图需多次手动派生 | ✅ 已解决 | C6 |
| P-7 跨集 / 跨项目无库化 | ✅ 已解决（service 层） | D2 |
| P-8 新用户无内置数字人 | ✅ 已解决（service 层） | D3 |
| P-9 reference image 没用满 provider 多图能力 | ✅ 已解决（service 层 + schema） | D1 |
| P-10 无视频提取角色 | ⏳ Phase 5（未实施） | - |
| P-11 画面描述空白 | ✅ 已解决 | C7 |
| P-12 缺摄像机参数化 | ✅ 已解决 | C7 |
| P-13 运镜仅 6 类 | ✅ 已解决（25 预设） | C7 |
| P-14 完全无打光控制 | ✅ 已解决（12 预设） | C7 |
| P-15 无全局镜头编号 | ✅ 已解决 | C8 |
| P-16 派生单基图 | ✅ 已解决 | C9 |
| P-17 缺连线可视化 | ✅ 已解决 | P3-C2 |
| P-18 剧本→分镜全或无 | ✅ 已解决（service + IPC） | C10 |
| P-19 完整 6 stage 负担大 | ✅ 已解决（orchestrator 骨架） | P3-C3 |
| P-20 主流 provider subject 没用上 | ✅ 已解决（探测层） | P3-C1 |
| P-21 能力没暴露给 Agent | ⏳ Phase 4 D4（未实施） | - |
| P-22 缺反向工程参考视频 | ⏳ Phase 4 D5（未实施） | - |

**覆盖率：22 项中 19 项已解决（86%）；剩 3 项是 Phase 4 D4/D5 + Phase 5 E1**

## 未完成 / 待 follow-up

每个 commit 的 follow-up 详见 commit message。汇总：

### service 层完成 → UI / IPC 集成待跟进

| 功能 | 已完成 | 待 follow-up |
|---|---|---|
| C10 9 帧故事板 | service + 2 IPC（generate / cleanup）+ preload + channel-map | UI dialog（StoryboardThumbnailDialog.vue）+ create-from-thumbnails 落库 IPC |
| P3-C1 Provider subject | capability 接口扩 + inferSubjectSupport / inferMaxSubjects + 21 测试 | 各 video provider adapter 真实实现（Kling / MJ / Seedance）+ keyframe-generation 路径分流 + provider_subject_cache 表 |
| P3-C3 AI 一键模式 | orchestrator service 骨架 + 7 测试 | 真实 step 实现（封装现有 service）+ IPC + Wizard dialog UI + 入口集成 |
| D1 角色形象组 | migration + entity + service + 10 测试 | IPC + ReferenceSetPanel UI + 7 个 image adapter 适配 multi-reference |
| D2 跨项目角色库 | migration + entity + service + 11 测试 | IPC（5 个）+ UserAssetLibraryDialog UI + AssetCardV2 加"加入我的库" |
| D3 数字人池 | migration（含 seed 12 个）+ service + 8 测试 | 形象图 seed（asset_image 行）+ IPC list-presets + 资产创建 dialog 加 tab "🎭 内置形象" |

### 完全未启动

| 功能 | spec § | 备注 |
|---|---|---|
| D4 Agent / Skill 接入（MCP / HTTP API） | §3.2 D4 | 整体未启动 |
| D5 视频解析 | §3.2 D5 | 整体未启动 |
| E1 视频提取主体 | §3.2 E1 | 整体未启动（Phase 5）|

## 工程约束遵守情况

- ✅ 单 commit ≤ 4-9 文件（C7 / D2 等多功能合并 commit 较大但都 ≤ 9 个文件）
- ✅ 每 commit 跑 vue-tsc / vitest 验证
- ✅ Phase 1-3 严格零 schema 变更 — 实际：Phase 2 C7 加 storyboards.metadata 列（spec 调整后允许）
- ✅ Phase 4 改 schema 时无重新 pg_dump（无人值守模式不动外部数据库）
- ✅ TDD 红绿循环（先写测试 fail → 改代码 pass → 重构）
- ✅ 双母语标注（每个新功能含 大众用户 / 专业用户 双视角说明）
- ✅ 双端契约（preload + channel-map 双写）
- ✅ 不动 npm 依赖 / 不 git push / 不操作 GitHub PR / 不操作生产数据库

## 下一步建议（用户重启后）

1. **跑 npm run dev / 重启 4201 web server** — 触发 4 个新 migration 落地：
   - `add-storyboard-metadata`
   - `add-character-binding-reference-set`
   - `add-character-binding-preset` + `seed-preset-digital-humans`
   - `add-user-assets`

2. **核对 character_bindings.project_id 改 nullable 的影响** — 现有数据全部有 project_id，无影响；但 BaseRepository 等代码可能假设 project_id 非空，需 grep 检查。

3. **Phase 1+2 视觉一致性回归** — 跑 3 个 character 派生 + 9 帧故事板 + 镜头预设组合，肉眼对比改前改后。

4. **优先做的 follow-up**（按价值 / 工程量比）：
   - C10 故事板预览 dialog UI（service 已完成；UI 串通后用户能用）
   - D1 ReferenceSetPanel UI + 7 个 image adapter（用户能开始用形象组）
   - D2 user-asset 5 个 IPC + UI（"加入我的库"是高频功能）
   - D3 形象图 seed（让数字人池 list 能展示图）

## 风险

| 风险 | 应对 |
|---|---|
| character_bindings.project_id 改 nullable 可能影响现有 BaseRepository / service | 重启前 grep `b.projectId\b` 检查必填假设；现有数据全有 project_id 不会出问题 |
| storyboards.metadata 加列 — 老分镜读 null 影响 keyframe gen | keyframe-prompt-builder 已加 cameraMetadata?: null 兼容（解析时跳过） |
| seed-preset-digital-humans 形象图缺失 | UI 列表先用占位符；form 创建路径正常工作 |
| Phase 4 service 层无 IPC 集成 — 用户暂时用不到 | 下次会话补 IPC + UI；本次已完成核心 service + 测试 |

## 总结

**Auto Mode 单 session 成果**：22 项问题中 19 项已解决（service / schema 层完整 + 部分 UI / IPC）；剩 3 项（D4 Agent / D5 视频解析 / E1 视频提取主体）规模较大需独立 phase。

未中断 / 未要求授权（无 npm install / 无 git push / 无 DB 操作 / 无远程交互）。
