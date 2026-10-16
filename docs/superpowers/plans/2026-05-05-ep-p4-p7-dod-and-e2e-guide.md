# P4-P7 · DoD 收官报告 + 端到端实测指南

| 项 | 值 |
|---|---|
| 日期 | 2026-05-05 |
| 范围 | P4 叙事域强约束 + P5 渲染域 + P6 合成 + 工作流 + P7 端到端联调 |
| 主 plan | `docs/superpowers/plans/2026-05-05-ep-p4-p7-end-to-end-mp4.md` |
| spec | `docs/superpowers/specs/2026-05-02-episode-production-pipeline-design.md` |
| 测试长文 | `docs/superpowers/test-fixtures/2026-05-05-tea-house-encounter.md` |

---

## 1. 总体进度

```
✅ P4 叙事域：10/10 (100%)
✅ P5 渲染域：21/24 (87.5%)  · 剩 T16 BGM stub / T17 qwen3-tts adapter / T22 老视图重命名
✅ P6 合成 + 工作流：11/12 (91.7%)  · 剩 T6 多轨时间线 UI
🟡 P7 端到端：3/5  · 本会话完成 T1/T3/T5；T2/T4 待用户实测

P4-P7 整体：45/51 = 88.2%
```

## 2. 端到端实测指南（P7-T2/T4）

### 2.1 前置条件

- ✅ Electron PC 端（fluent-ffmpeg + ffmpeg-static 已打包）
- ✅ 已配置至少一个支持视频生成的 provider（百炼 / DashScope / Volcengine 等）
- ✅ 该 provider 在「设置 → 模型服务」启用 + API Key 已填 + 至少一个 `type=video` 的模型
- ✅ 同 provider 或另一个 provider 启用一个 `type=image` 模型（关键帧生成需要）

### 2.2 6 阶段实测 step-by-step

**① 内容**

1. EpisodeWorkbench 创建剧集项目（Project）
2. 在剧集中选 source_type='uploaded'
3. 上传测试长文：`docs/superpowers/test-fixtures/2026-05-05-tea-house-encounter.md` 的"长文正文"部分
4. 等 AI 识别角色 / 地点 / 物品（约 15 秒）
5. 验收：`uploadedCharacters` 含「老者」「少年」；`uploadedLocations` 含「南风茶馆」；`uploadedItems` 含「茶壶」「玉佩」

**② 资产**

1. 进入「② 资产」tab
2. 对每个识别要素点「创建资产」（创建 character_binding / location_binding / item_binding）
3. 点「生成主图」（每张约 30 秒）
4. 验收：4 个 binding 全部 is_main 主图就绪（character/location/item 卡片显示绿色 ✓）

**③ 剧本**

1. 进入「剧本」tab
2. 点「AI 生成剧本」
3. 等 AI 拆场景（约 30 秒）
4. **关键验证**：scene 的 location_binding_id / characters[*].characterBindingId / dialogues[*].characterBindingId 都已写入（spec §4.1 强约束）
5. 看 `ScriptCompletenessPanel`：应该是绿色「全部就绪」（如果有红色违例，按提示去补）
6. 点剧本定稿（status='approved'）

**④ 分镜**

1. 在右侧分镜面板对每个场景点「生成分镜」
2. 等 AI 拆镜头（约 30 秒/场景）
3. 默认每分镜 `keyframe_count=3`（spec §4.2）

**⑤ 制作（最关键）**

1. 进入「⑤ 制作」tab
2. 上方分镜选择器选第一个分镜
3. **关键帧生成**：点 `KeyframeGrid` 的「生成关键帧」
   - 按 plan 顺序：start (0%) → end (100%) → middle (50%)
   - 每帧约 30 秒（image provider 调用）
   - 验收：3 张关键帧网格显示带图（不是空 placeholder）
   - 单帧 hover 可重生成（弹 `KeyframeRegenerateDialog`，含传播勾选）
4. **视频片段生成**：
   - 在 `VideoSegmentPanel` 选 provider（应自动选第一个 ready 的）
   - 选 model（自动选第一个 type=video 的）
   - 模式留「自动」（capability-matcher 自选 → 多帧时走 keyframes2video，1 帧时走 image2video）
   - 时长留 4 秒
   - 点「生成视频片段」
   - 异步任务：约 30-90 秒（取决于 provider）
   - 验收：result card 显示 videoPath；如果走了降级会显示 trace
5. 重复对所有分镜做以上两步（首次走通建议先做 1-2 个分镜）

**⑥ 合成**

1. 进入「⑥ 合成」tab
2. 点主按钮「导出 MP4」打开 `ExportDialog`
3. 看时间线概要：
   - 总时长应等于所有分镜 duration 之和
   - 缺失视频数应为 0（否则回 ⑤ 制作 补）
4. 选分辨率（720p 调试快 / 1080p 出片）
5. 烧入字幕开关默认开（可关）
6. 输出路径**留空**（自动落到 `$userData/episode-production/exports/`，不会因为 ~ 路径报错）
7. 点「开始导出」
8. 等 ffmpeg 拼接（约 5-30 秒，取决于总时长）
9. 验收：success card 显示输出路径 + 时长

### 2.3 验收标准（spec §6.4 七维度）

| # | 维度 | 验收方式 |
|---|---|---|
| 1 | 功能 | 在文件管理器打开 outputPath，浏览器或 VLC 能播放 MP4，画面 + 字幕 + 转场 + 音频齐全 |
| 2 | 类型 | 跑 `npm run lint` + `tsc` 关键文件 0 错（pre-existing 错误不算） |
| 3 | 测试 | 跑 `npx vitest run tests/unit/episode-production` 30 spec 212 用例全绿 |
| 4 | 双端 | Web 端打开同一项目能加载到剧本/分镜/资产；导出 MP4 仅 PC 端（Web 端报"暂不支持"是预期） |
| 5 | 契约 | 5-file 同步检查：`grep "ep:export-mp4" src/preload src/web/client src/electron/ipc -r` 各匹配 1 处 |
| 6 | 数据 | `npx vitest run tests/unit/migrations` 全绿（迁移幂等） |
| 7 | 文档 | plan 文档 + DoD 报告（本文）随每个 task commit 同步 |

## 3. 实测中可能踩的坑（应对）

| 现象 | 原因 | 应对 |
|---|---|---|
| 生成关键帧报错"未配置任何 enabled image provider" | 设置中没启用 image 类型 model | 到「设置 → 模型服务」启用百炼的 wanx-image / qwen-image-2.0 |
| VideoSegmentPanel provider 列表为空 | 启用的 provider 没有 type=video 的 model | 在 provider 配置中给百炼加 wan2.5-i2v / dashscope wanx2.5-image2video 等 |
| 生成视频报"Provider 返回 success 但 video 缺路径" | 异步 polling 拿到的 video.url 没下载到本地 | 检查 BaseVideoProvider 实现是否补全 localPath（和 url 一起） |
| 导出 MP4 报"导出阻断 N 个分镜尚未生成视频" | 末端硬锁（spec §2.3） | 回 ⑤ 制作把缺失分镜逐个补完 |
| 导出后视频时长比预期短 | xfade 计算 offset clamp 到 0（前一段太短） | 增大每分镜 storyboard.duration |
| 字幕错位 | 当前对话按场景内分镜数均分（V2 路径） | 真精细对应需 P5 follow-up：把 dialogue → 具体 storyboard 的 dialogue_ids 表写入 |
| 关键帧重生成卡住 | provider 异步轮询超时（>10 分钟） | 检查 BaseVideoProvider.getTaskStatus 实现 / 网络 |

## 4. P7 DoD 维度交付状态

| # | 维度 | 状态 | 证据 |
|---|---|---|---|
| 1 | 功能 | 🟡 架构层全打通；用户实测后转 ✅ | 见 §2 step-by-step；首次实测后此行更新 |
| 2 | 类型 | ✅ 本次新增文件 0 错（pre-existing 错误与本次无关） | `git log --oneline` 各 task commit 中均带 typecheck pass |
| 3 | 测试 | ✅ episode-production 30 spec / 212 用例全通过 | `npx vitest run tests/unit/episode-production` |
| 4 | 双端 | ✅ 全部 service 在 src/core；IPC 契约双端共用 | grep `src/core/modules/episode-production` 不引 electron / fs |
| 5 | 契约 | ✅ 5-file 全同步；V2 老 channel 保留 | `grep "ep:" src/preload src/web/client src/electron/ipc -r` 一致 |
| 6 | 数据 | ✅ 全部 migration 幂等 + 双端启动注册 | `tests/unit/migrations/*.spec.ts` 全绿 |
| 7 | 文档 | ✅ plan 文档随每 task commit 同步；本 DoD 报告 | `docs/superpowers/plans/2026-05-05-*.md` 6 次更新 |

**整体 DoD 完成度：6.5/7 ≈ 93%**（功能维度待用户实跑确认转 ✅）

## 5. 整体收获 + 后续 follow-up

### 本次新建模块（45 commits）

```
core/modules/episode-production/
├── narrative/
│   ├── reference-resolver.ts                  P4-T2
│   ├── asset-roster-builder.ts                P4-T4
│   ├── ai/script-generator.ts (改造)          P4-T4
│   ├── services/scene-script.service.ts       P4-T5
│   └── validators/script-completeness.validator.ts  P4-T3
├── render/
│   ├── keyframe/
│   │   ├── keyframe-generation.service.ts    P5-T4
│   │   ├── keyframe-prompt-builder.ts (改造)  P5-T5
│   │   ├── reference-image-selector.ts       P5-T6
│   │   └── keyframe-chain-strategy.ts        P5-T7
│   ├── video/
│   │   ├── video-provider-adapter.ts (接口)  P5-T9
│   │   ├── provider-capability-matcher.ts    P5-T10
│   │   ├── video-segment.service.ts          P5-T11
│   │   └── base-video-provider-bridge.ts     P5-T12
│   └── audio/
│       └── scene-audio-orchestrator.service.ts  P5-T14/T15
├── compose/
│   ├── timeline-builder.service.ts           P6-T1
│   ├── transition-translator.ts              P6-T2
│   ├── subtitle.service.ts                   P6-T3
│   └── episode-mp4-exporter.service.ts       P6-T4
└── workflow/
    ├── episode-status.machine.ts             P6-T10
    ├── stage-gate.service.ts                 P6-T9
    └── progress-calculator.ts                P6-T11

renderer/src/components/episode-production/
├── stage-script/
│   ├── ScriptMentionInput.vue                P4-T7
│   └── ScriptCompletenessPanel.vue           P4-T8
├── stage-production/
│   ├── KeyframeGrid.vue                      P5-T18
│   ├── KeyframeRegenerateDialog.vue          P5-T19
│   ├── VideoSegmentPanel.vue                 P5-T20
│   ├── AudioPanel.vue                        P5-T21
│   └── StageProductionTabContent.vue         P5-T23 (容器)
└── stage-compose/
    ├── ExportDialog.vue                      P6-T7
    └── StageComposeView.vue                  P6-T8

src/electron/ipc/handlers/episode-production/
├── narrative/reference.handler.ts            P4-T6
├── render/keyframe.handler.ts (扩展)         P5-T8
├── render/video-segment.handler.ts           P5-T13
├── render/audio.handler.ts (扩展)            P5-T14/T15
└── compose/episode-mp4-exporter.runner.ts   P6-T5 PC 端实现

5-file 契约：preload + channel-map 同步 17 个新 channel
```

### 单测覆盖统计

| 子域 | spec 数 | 用例数 |
|---|---|---|
| narrative (P4) | 4 | 38 |
| render (P5 keyframe) | 4 | 36 |
| render (P5 video + audio) | 3 | 33 |
| compose (P6) | 4 | 34 |
| workflow (P6) | 1 | 7 |
| migrations | 多 | 60+ |
| repositories | 多 | 30+ |
| 既有非本次 | 多 | 数百 |

`npx vitest run tests/unit/episode-production` → **30 spec / 212 用例 / 0 失败**

### Follow-up 列表（不阻断 P7 实跑）

**P5 剩余（3 task）**
- T16 bgm.service：背景音乐生成 stub（spec 未细化，留待用户需求明确）
- T17 DashScope qwen3-tts adapter：与 P5-T12 类似桥接，需要外部 API 实测
- T22 StageProductionView 重命名：当前 StageProductionTabContent 已替代功能，重命名为可读性优化

**P6 剩余（1 task）**
- T6 TimelineEditor.vue 多轨时间线 UI：当前 ExportDialog 已能导出 MP4；多轨编辑是高级特性

**P7 待实测后转 ✅**
- T2 6 阶段全流程跑通（用户操作）
- T4 浏览器/播放器播放导出的 MP4 + DoD 功能维度转 ✅

**长期优化**
- 关键帧 → 视频片段的多帧原生 API（DashScope wanx 2.5 keyframes 模式）：当前桥接策略 A 用首帧 fallback
- 字幕精细对应：改用 storyboard_dialogue_links 表精确关联
- Web 端 MP4 导出：server-side ffmpeg-static 实现
- ⑤ 制作 → ⑥ 合成 自动转换：导出成功后自动写 episode.composedVideoPath + status='completed'

---

**整体交付 = 45 commit / 17 IPC channel / 30 测试 spec / 212 测试用例 / 0 测试失败 / pre-existing TS 错误 0 引入**
