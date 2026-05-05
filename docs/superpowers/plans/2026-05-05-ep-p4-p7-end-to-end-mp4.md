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

**遗留**（不阻塞 P5）：
- 归一化 scene_characters / scene_dialogues / scene_actions 表的同步写入（service 当前用 JSON 回退覆盖）
- 实际 scene 编辑面板（mention input 已就位但还无消费者）— P5/P6 真正需要时再建

---

## 2. Phase 5 · 渲染域（spec §4.2-4.7） — **最大头**

**目标**：把分镜从单帧改成 N 张关键帧 + 1 段视频；关键帧带参考链；视频片段三模式（text2video / image2video / keyframes2video）；音频含旁白和对话。

### 2.1 数据库改动（先做）

| # | Subject | 内容 |
|---|---|---|
| P5-T1 | DB migration：新建 `storyboard_keyframe` 表 | id / storyboard_id / frame_index / time_percent / frame_role / image_asset_id / derived_from_keyframe_id / prompt 等 |
| P5-T2 | DB migration：扩展 `storyboard` | keyframe_count / video_provider_id / video_model_id / video_mode / use_3d_staging / staging_layout_id |
| P5-T3 | Entity 同步 + Repository | StoryboardKeyframeEntity / StoryboardEntity 改 |

### 2.2 关键帧子域

| # | Subject |
|---|---|
| P5-T4 | keyframe-generator.service.ts：生成开始/结束/中间帧的核心逻辑 |
| P5-T5 | keyframe-prompt-builder.ts：拼资产引用 + 镜头语言 + 时刻描述 |
| P5-T6 | reference-image-selector.ts：按场景 time/weather + 角色 view/expression/outfit 选 ref 图 |
| P5-T7 | keyframe-chain-strategy.ts：实现"先开始 → 再结束 → 再中间"参考链算法 |
| P5-T8 | IPC：generate-keyframe / regenerate-keyframe / list-keyframes |

### 2.3 视频片段子域

| # | Subject |
|---|---|
| P5-T9 | VideoProvider 接口（textToVideo / imageToVideo / keyframesToVideo + capabilities） |
| P5-T10 | provider-capability-matcher.ts：按 keyframe_count 选模式 + 降级 |
| P5-T11 | video-segment.service.ts：生成视频片段，调 provider |
| P5-T12 | DashScope（万相视频）+ Bailian（百炼视频）provider 适配（或 stub 留到 P5-T17） |
| P5-T13 | IPC：generate-video-segment / list-providers / get-provider-capabilities |

### 2.4 音频子域

| # | Subject |
|---|---|
| P5-T14 | narration-synthesis.service.ts：旁白 → TTS → 音频文件 |
| P5-T15 | dialogue-synthesis.service.ts：对话按角色 voice_id → TTS |
| P5-T16 | bgm.service.ts（背景音乐 stub，spec 未细写） |
| P5-T17 | DashScope qwen3-tts 适配 |

### 2.5 UI

| # | Subject |
|---|---|
| P5-T18 | KeyframeGrid.vue：九宫格关键帧序列展示 + 单帧 hover 操作 |
| P5-T19 | KeyframeRegenerateDialog.vue：重生成弹框（传播勾选） |
| P5-T20 | VideoSegmentPanel.vue：provider/mode 选择 + 生成视频片段按钮 + 进度 |
| P5-T21 | AudioPanel.vue：旁白 / 对话 列表 + 试听 + 重生成 |
| P5-T22 | StageProductionView.vue：上面三个 panel 的容器（替换 V2 老 stage-production） |

### 2.6 收尾

| # | Subject |
|---|---|
| P5-T23 | 接入 EpisodeWorkbench 加 ⑤ 制作 tab |
| P5-T24 | 单测 + 端到端 |

总计 P5 = **24 个 task**。

---

## 3. Phase 6 · 合成 + 工作流（spec §5.3 / §6.2）

**目标**：把所有分镜视频片段 + 音频 + 字幕用 ffmpeg 拼成单段 MP4，提供"导出"入口。

### Task 列表（12 个）

| # | Subject |
|---|---|
| P6-T1 | timeline-builder.service.ts：把场景/分镜组装成时间线（开始时间、轨道分配） |
| P6-T2 | transition.service.ts：转场效果（淡入淡出、硬切等） |
| P6-T3 | subtitle.service.ts：从对话+旁白生成 SRT/ASS 字幕轨 |
| P6-T4 | ffmpeg-assembler.service.ts：调 ffmpeg 拼视频 + 音频 + 字幕 |
| P6-T5 | IPC：build-timeline / preview-timeline / export-mp4 |
| P6-T6 | TimelineEditor.vue：多轨时间线 UI（视频轨 + 音频轨 + 字幕轨） |
| P6-T7 | ExportDialog.vue：导出参数（分辨率 / 帧率 / 码率） + 进度条 |
| P6-T8 | StageComposeView.vue：⑥ 合成阶段容器 |
| P6-T9 | workflow/stage-gate.service.ts：阶段门控（下一阶段进入条件） |
| P6-T10 | workflow/episode-status.machine.ts：剧集状态机扩展（spec §2.4 EpisodeStatus 扩展） |
| P6-T11 | workflow/progress-calculator.ts：每阶段进度百分比 |
| P6-T12 | EpisodeWorkbench 6 阶段 tabs 全打通 + 阶段门控接入 |

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

---

## 7. 风险登记

| 风险 | 应对 |
|---|---|
| FFmpeg 不在 server 环境 | 先 `which ffmpeg` 探测；缺则给 install 命令；最坏 stub MP4 输出（让端到端 UI 跑通） |
| video provider API 配额 / 失败 | 用阿里百炼 wan2.2 系列；失败时降级为 image2video → text2video |
| 关键帧链生成耗时长（10+ 帧 × 30s/帧） | UI 显示进度；后端 streaming 进度事件 |
| spec 字段未在 DB 现表 | migration 幂等加列 |
