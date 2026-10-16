# P4-P7 端到端到 MP4 · 实施计划

| 项 | 值 |
|---|---|
| 日期 | 2026-05-05 |
| 范围 | spec phase 4 / 5 / 6 / 7（叙事强约束 + 渲染域 + 合成域 + 端到端联调） |
| 目标 | **从「上传长文 → 6 阶段 → 成片 MP4」端到端跑通**，看到真实视频 |
| 方法 | Subagent-Driven Development（与 P3a/P3c 同模式） |
| spec | `docs/superpowers/specs/2026-05-02-episode-production-pipeline-design.md` §4 / §5 / §6.2 |

---

## 0. 背景

P3a + P3c follow-up 已完成资产域全部能力（角色 / 地点 / 物品 / 语音 4 类资产 + 360 全景 + 派生 + AI 真实出图）。现在缺 P4 / P5 / P6 / P7：

```
✅ P3 资产域 ──┐
              │
✅ P3c 360 全景 ──┘
                  ↓
              [P4 叙事域]      ← 本次开始
                  ↓
              [P5 渲染域]      
                  ↓
              [P6 合成 + 工作流]
                  ↓
              [P7 端到端联调]   ← 出真实 MP4
                  ↓
              ✓ DoD 完成
```

---

## 1. Phase 4 · 叙事域强约束（spec §4.1）

**目标**：剧本所有引用强约束（character_binding_id / location_binding_id / item_binding_id），不允许裸字符串；剧本定稿前完整性校验。

### Task 列表（10 个） · **全部完成 ✅ 2026-05-05**

| # | Subject | 文件 | 状态 |
|---|---|---|---|
| P4-T1 | DB schema：scene_character / scene_dialogue / scene_action 加 binding_id FK | migration + 4 entity | ✅ |
| P4-T2 | reference-resolver.ts：把"@提及"或下拉选中的 binding ID 解析为 effective data | core | ✅ |
| P4-T3 | script-completeness.validator.ts：所有引用必须解析到资产库存在且主图就绪 | core | ✅ |
| P4-T4 | 改造 script-generator.ts：AI 生成剧本时输出 binding_id（不再是裸字符串） | core | ✅ |
| P4-T5 | scene-script.service.ts 加 `validateCompleteness(sceneId)` API | core | ✅ |
| P4-T6 | IPC handlers 暴露 reference-resolver / validator | electron | ✅ |
| P4-T7 | UI ScriptMentionInput @ 提及组件（textarea + 下拉，可复用 primitive） | Vue | ✅ |
| P4-T8 | UI ScriptCompletenessPanel 完整性面板（红/黄/绿 + 失败项跳转） | Vue | ✅ |
| P4-T9 | ScriptTabContent 接入 ScriptCompletenessPanel | Vue | ✅ |
| P4-T10 | 单测 + 端到端回归（116 P4 spec 用例 + 全 785 测试通过 0 失败） | tests | ✅ |

**P4 实施收获**：
- 38 个新单元测试覆盖 binding 解析 + validator 13 种违例 + service 装配回退 + AI 解析三层兜底
- 5-file IPC 契约同步（4 个新 channel：resolve-reference / resolve-references-batch / validate-scene / validate-episode-script）
- ScenePropRef 新类型 + GeneratedSceneCharacter / Dialogue / ActionDescription 加 characterBindingId 字段
- 不破坏 V2 老路径：JSON 列回退路径让旧剧本仍可正常工作

**遗留**（实际已阻塞 P5，2026-05-05 audit 暴露）：
- ⚠️ 归一化 scene_characters / scene_dialogues / scene_actions 表的同步写入仍未做；service 当前用 JSON 回退覆盖。**这导致 P5-T4 关键帧生成只能读 scene.characters JSON，无法消费 storyboard_characters 表，spec §4.5.3 分镜内角色独立配置全链路打不通**。
- ⚠️ 实际 scene 编辑面板未建——P5 已经"真正需要"它了。
- ⚠️ 这两个遗留**应当从 P4 重新审计**，可能 P4 的 ✅ 也需要降到 🟡。本次 audit 只覆盖 P5/P6，P4 待下次审计。

---

## 2. Phase 5 · 渲染域（spec §4.2-4.7） — **最大头**

**目标**：把分镜从单帧改成 N 张关键帧 + 1 段视频；关键帧带参考链；视频片段三模式（text2video / image2video / keyframes2video）；音频含旁白和对话。

### 2.1 数据库改动（先做） · **已完成 ✅**

| # | Subject | 状态 |
|---|---|---|
| P5-T1 | DB migration：新建 `storyboard_keyframe` 表 | ✅ P2 历史 commit 已完成（`migrations/create-storyboard-keyframe.ts`） |
| P5-T2 | DB migration：扩展 `storyboard` 多模式字段 | ✅ 同 T1 migration |
| P5-T3 | StoryboardKeyframeRepository | ✅ 2026-05-05（CRUD + listByStoryboard + 6 单测） |

### 2.2 关键帧子域 · **审计后 2/5 真完成（2026-05-05 audit 降级）**

⚠️ 详见 `docs/superpowers/dod/2026-05-05-p5-p6-audit.md`。骨架打勾的全部降为 🟡。

| # | Subject | 状态 | 缺口 |
|---|---|---|---|
| P5-T4 | KeyframeGenerationService 多帧链式生成 | 🟡 | 用 `scene.characters` JSON，**未消费 storyboard_characters 表**；spec §4.5.3/§4.5.9"分镜内角色独立配置"未接通 |
| P5-T5 | keyframe-prompt-builder buildKeyframePrompt | 🟡 | `BuildKeyframePromptInput` 12 字段中**无 userPrompt 字段**；用户输入通道全链路缺起点 |
| P5-T6 | reference-image-selector 三类资产打分 | ✅ 端到端可用 | — |
| P5-T7 | keyframe-chain-strategy | ✅ 端到端可用 | — |
| P5-T8 | 4 个 IPC channel | 🟡 | handler 入参 `(storyboardId, styleName?, keyframeCountOverride?)` / `(keyframeId, styleName?)` 都**无 user prompt** |

### 2.3 视频片段子域 · **架构层完成 4/5 ✅**

| # | Subject | 状态 |
|---|---|---|
| P5-T9 | VideoProviderAdapter 接口（textToVideo / imageToVideo / keyframesToVideo + capabilities） | ✅ |
| P5-T10 | provider-capability-matcher（按 keyframe_count 选模式 + 三档降级 + clamp 截断） | ✅ 17 单测 |
| P5-T11 | VideoSegmentService（串联 keyframes → matcher → adapter → 落 video_path） | ✅ 9 单测 |
| P5-T12 | BaseVideoProvider → VideoProviderAdapter 桥接（含 polling + capabilities 推断） | ✅ 8 单测 |
| P5-T13 | 3 个 IPC channel + 5-file 契约 + 真实 createAdapterForProvider | ✅ |

### 2.4 音频子域 · **2/4 完成**

| # | Subject | 状态 |
|---|---|---|
| P5-T14/T15 | SceneAudioOrchestrator binding-aware 编排 + IPC ep:generate-scene-audio-v3 | ✅ 7 单测 |
| P5-T16 | bgm.service.ts（背景音乐 stub，spec 未细写） | ⏳ TODO（spec 未细化） |
| P5-T17 | DashScope qwen3-tts 适配 | ⏳ TODO（需外部 API 测试） |

### 2.5 UI · **审计后 1/5 真完成（2026-05-05 audit 降级）**

⚠️ 详见 `docs/superpowers/dod/2026-05-05-p5-p6-audit.md`。

| # | Subject | 状态 | 缺口 |
|---|---|---|---|
| P5-T18 | KeyframeGrid 九宫格关键帧序列 | 🟡 严重 | 仅渲染 frameIndex/frameRole/timePercent/imagePath；**完全无 spec §4.5.7 资产组合公式**（角色 chip / 地点 chip / 道具 / 参考图缩略图）；预览框无参考图、无用户提示词输入 |
| P5-T19 | KeyframeRegenerateDialog 重生成弹框 | 🟡 | 仅传播范围勾选；**无 textarea 让用户输入"如何修改"**；用户参与度为零 |
| P5-T20 | VideoSegmentPanel | 🟡 严重 | 仅 provider/mode/duration 选择；**完全无 spec §4.7 分镜元信息**（旁白文本 / 对话清单 / 角色清单 / 关键帧序列预览 / 用户额外提示词） |
| P5-T21 | AudioPanel | ✅ 端到端可用 | — |
| P5-T22 | StageProductionView 重命名 | 🟡 红线 R1 命中 | StageProductionTabContent 新建了，但 EpisodeWorkbench.vue:67-95 V2 老 4 tab（剧本/角色绑定/物品绑定/地点绑定）仍存在 — V2 兼容后门未清 |

### 2.6 收尾 · **审计后 0/2 真完成（2026-05-05 audit 降级）**

| # | Subject | 状态 | 缺口 |
|---|---|---|---|
| P5-T23 | 接入 EpisodeWorkbench 加 ⑤ 制作 tab | 🟡 严重 | tab 接入了，但 spec §2.1 工作台布局 0%（无顶部 6 段进度条 / 无左侧资产侧栏 / 无底部迷你时间线 / 缺 ① 内容 / ③ 剧本 / ④ 分镜 三个 tab / V2 老 tab 并存） |
| P5-T24 | 单测 + 端到端 e2e | 🟡 | 90 个单测过了，但 Playwright 真走 UI 的 e2e 仅 1 个 .skip spec；spec §4.5/§4.7 用户视角覆盖为零 |

**P5 真实完成度（2026-05-05 audit）：12/24（50%）真 ✅；9/24（37.5%）🟡；3/24（12.5%）⏳**

（之前 plan 写"21/24 完成（87.5%）"是骨架打勾。）

---

## 3. Phase 6 · 合成 + 工作流（spec §5.3 / §6.2）

**目标**：把所有分镜视频片段 + 音频 + 字幕用 ffmpeg 拼成单段 MP4，提供"导出"入口。

### Task 列表（12 个） · **审计后 8/12 真完成（2026-05-05 audit 降级）**

⚠️ 详见 `docs/superpowers/dod/2026-05-05-p5-p6-audit.md`。

| # | Subject | 状态 | 缺口 |
|---|---|---|---|
| P6-T1 | TimelineBuilderService | ✅ 端到端可用 | — |
| P6-T2 | transition-translator | ✅ 端到端可用 | — |
| P6-T3 | SubtitleService | ✅ 端到端可用 | — |
| P6-T4 | EpisodeMp4ExporterService | ✅ 端到端可用 | — |
| P6-T5 | IPC + FluentFfmpegRunner | ✅ 端到端可用 | — |
| P6-T6 | TimelineEditor.vue 多轨时间线 UI | ⏳ 未开始 | （明确未做） |
| P6-T7 | ExportDialog.vue | ✅ 端到端可用 | — |
| P6-T8 | StageComposeView.vue ⑥ 合成阶段容器 | 🟡 V1 简化版 | spec §6.2 要求"时间线视图"未实现，目前仅一个"导出 MP4"按钮 |
| P6-T9 | StageGateService | ✅ 端到端可用 | — |
| P6-T10 | episode-status.machine | ✅ 端到端可用 | — |
| P6-T11 | ProgressCalculator | 🟡 | service 写好了 + 7 单测，但 grep 显示 EpisodeWorkbench.vue 没引用 — UI 未消费 |
| P6-T12 | EpisodeWorkbench 接入 ⑤ 制作 + ⑥ 合成 tabs | 🟡 严重 | tab 接入了，但 spec §2.1 工作台布局**完全没实现**：无顶部 6 段进度条 / 无左侧资产侧栏 / 无底部迷你时间线 / 状态机和门控有 service 但 UI 没消费 |

**P6 真实完成度（2026-05-05 audit）：8/12（66%）真 ✅；3/12（25%）🟡；1/12（9%）⏳**

（之前 plan 写"完成 11/12 ✅"是骨架打勾。）

---

## 4. Phase 7 · 端到端联调（spec §6.2）

**目标**：从「上传长文 → 6 阶段 → MP4」全链路真实跑通，看到 MP4。

### Task 列表（5 个）

| # | Subject |
|---|---|
| P7-T1 | 准备测试长文（"江湖传 · 茶馆相遇" 1500 字 mock 故事） |
| P7-T2 | 走 ① 内容 → ② 资产 → ③ 剧本 → ④ 分镜 → ⑤ 制作 → ⑥ 合成 全流程，每阶段验收 |
| P7-T3 | 修联调中暴露的 bug |
| P7-T4 | 浏览器实测 export-mp4 → 拿到 MP4 文件 + 浏览器内播放确认 |
| P7-T5 | 写 DoD 报告（spec §6.4 七维度） |

---

## 5. Subagent-Driven 执行节奏

按 P3a 模式：
- 一次 dispatch 1-3 个 task subagent（独立可并行）
- 每个 subagent 自带：实施 + 单测 + typecheck + commit
- 主对话只做 plan / dispatch / 验收 / commit milestone

依赖顺序硬约束：**P4 → P5 → P6 → P7**，phase 内 task 内部并行。

### Phase 内并行度

- P4：T1 单跑 → T2/T3 串行 → T4-T9 部分并行 → T10 收尾
- P5：T1-T3 数据库先行 → T4-T8 关键帧子域 / T9-T13 视频子域 / T14-T17 音频子域 三组并行 → T18-T22 UI 串行 → T23/T24 收尾
- P6：T1-T4 后端 → T5 IPC → T6-T8 UI → T9-T11 workflow → T12 收尾
- P7：T1-T5 全串行

---

## 6. DoD（spec §6.4 七维度）

完成判定：

1. **功能**：从上传长文到 MP4 端到端跑通，浏览器能播放 MP4
2. **类型**：tsc 0 错（本次相关文件）
3. **测试**：所有新 service 单测覆盖；总单测 pass 率 >= 之前
4. **双端**：业务逻辑全在 core，PC + Web 同 IPC 契约
5. **契约**：5-file IPC 同步；V2 老 channel 不破坏
6. **数据**：所有 schema 变更幂等迁移
7. **文档**：本 plan 文档随 commit 同步进度状态

### DoD 当前状态（2026-05-05 audit 后修订）

⚠️ 之前的 DoD 维度评判过于乐观，按 `docs/superpowers/dod/2026-05-05-task-completion-checklist.md` 严格 DoD 重估：

| 维度 | 真实状态 | 备注 |
|---|---|---|
| 1 功能 | 🟡 严重缺失 | 端到端能跑出 mp4（P7 实测 25s 视频已验证），但 UI 装配层缺 spec §4.5.7（资产组合公式）/ §4.7（分镜元信息）/ §2.1（工作台布局）；用户输入通道全链路缺失 |
| 2 类型 | ✅ tsc 0 错 | 维持 |
| 3 测试 | 🟡 单测够，e2e 不够 | 212 单测过，但 Playwright 真走 UI 仅 1 个 .skip spec |
| 4 双端 | ✅ | 维持 |
| 5 契约 | 🟡 红线 R1 命中 | 5-file IPC 同步是真，但 V2 老 channel 保留 = V2 兼容后门 = spec §2.1 stage 流程不闭环；不是"不破坏"而是"应该清理" |
| 6 数据 | 🟡 | migration 幂等 + 双端注册是真，但 storyboard_characters 表是孤儿（spec §4.5.3 未接通） |
| 7 文档 | 🟡 plan 自我表扬 | 21/24 P5 ✅ + 11/12 P6 ✅ 是骨架打勾；本次 audit 已降级 |

---

## 7. 风险登记

| 风险 | 应对 |
|---|---|
| FFmpeg 不在 server 环境 | 先 `which ffmpeg` 探测；缺则给 install 命令；最坏 stub MP4 输出（让端到端 UI 跑通） |
| video provider API 配额 / 失败 | 用阿里百炼 wan2.2 系列；失败时降级为 image2video → text2video |
| 关键帧链生成耗时长（10+ 帧 × 30s/帧） | UI 显示进度；后端 streaming 进度事件 |
| spec 字段未在 DB 现表 | migration 幂等加列 |
