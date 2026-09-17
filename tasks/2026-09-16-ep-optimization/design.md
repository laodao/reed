# 剧集制作·优化项详细设计（2026-09-16）

范围：此前评估中提出、且未被 H1~H13 加固覆盖的优化建议。每项给出：改动点、怎么改、怎么验证。

## O1 片段视频升级为首尾帧模式（keyframes2video）

**现状**：编辑器参考图模式下，片段级生成只取首镜头的**首帧**关键帧作 H3 参考（`StageStoryboardEditor.vue` 约 367-388 行：只确保 `storyboardIds[0]` 有图）；`SegmentVideoService` 取 ref 也只有 1 张 → `pickVideoMode(1)` → image2video。片段 12~15s 内只有首帧锚定，中后段动作/构图漂移。

**事实**：H3 网关 `/api/video` refs 支持 1~2 张（`gen_gateway.py` 模块注释）；`pickVideoMode` ≥2 帧 → keyframes2video（`provider-capability-matcher.ts:11, 111`）。

**改动**：
1. `StageStoryboardEditor.vue` 参考图模式分支：确保首镜头 start+end 两帧都有图（当前 `generateKeyframes` 一次调用本就产出 start/end 两帧，只需把 `hasKeyframeImage` 检查从"任一帧有图"改为"首帧有图"——维持）；
2. 片段级取 refs 处（`segment-video.service.ts` 选关键帧逻辑）：首镜头 keyframes 取 start+end 两张（end 缺则退 1 张）传入；
3. 单镜路径（`video-segment.service.ts`）同样取该镜 start+end 两帧。
4. H3 provider 的 prompt 拼接（`comfyui-video.provider.ts` 的 Subject 1 文案）对 2 refs 场景措辞为"首帧/尾帧"语义（检查现有文案，必要则按 refs 数量调整）。

**验证**：重新生成 1 个片段 → sqlite 查 `video_mode='keyframes2video'`；抽帧对比首帧/尾帧与关键帧图一致；观看动作连贯性。

## O2 cogen 增量模式 + 超时自动重试

**现状**：`cogenStoryboardsForEpisode` 每场景恰好纠错重试 1 次（schema 类），但 "Request timed out"（百炼端慢响应）直接判失败；且每次全量重写所有场景（已有合格分镜也被覆盖重生成，浪费 10+ 分钟）。实测场景 3 两次超时、第三次即过。

**改动**（`storyboard-cogen.service.ts`）：
1. 增量默认：场景已有分镜且所有 `characters[].characterId` 非空 → 跳过（计入 `skippedScenes`）；`force=true` 时全量重写（renderer「批量生成分镜」维持全量语义=force，增量留给后续 UI/agent 调用）。
2. 超时重试：`generateCogenForScene` 抛出的错误消息含 "timed out" / 超时 时，service 层等待 60s 后原样重试 1 次（百炼限流类瞬时故障实测 1~2 分钟自愈）。

**验证**：cogen 重跑第一集 → 3 场景全部 `skippedScenes`，DB 分镜行数/内容不变（updated_at 不变）；制造一次超时（或复盘日志）确认重试路径触发。

## O3 复用资产时描述富化回填

**现状**：cogen 按名复用已有 binding 时原样保留旧描述。阿蘅的 binding 描述仍是事故期的"第一集主角，不喝孟婆汤的活人，年轻女性形象"（无时代/服饰），cogen prompt 注入和【人物】段引用都被这句薄描述拖累（新分镜里出现"外罩青灰披风"这类自由发挥）。

**改动**（`storyboard-cogen.service.ts` 复用分支）：已有 binding 命中但 `standaloneDescription` 过薄（长度 < 30 字，或不含任何服饰关键词"衣/袍/裙/衫/装/服"）且 cogen 响应里该角色有新资产卡描述 → 用新描述更新 binding（`updateBinding` 或等价服务方法；描述 = description + "\n服饰：" + outfit，与新建分支同规则）。记 `enrichedBindings` 返回。不动定妆图（图已合格，描述只影响文本链路）。

**验证**：重跑 cogen（force）→ 阿蘅 binding 描述含"素白"等服饰信息；后续分镜【人物】段引用之。

## O4 agent「generate_storyboards」改走 cogen

**现状**：ep-agent 的 `generate_storyboards` 动作仍走旧逐镜生成器（`ep-agent-actions.ts` 约 954 行区域 → `generateKeyframesForStoryboard` 附近的分镜生成），无资产绑定能力——用户让助手"为所有场景生成分镜"会得到无绑定分镜（H10 只是加了告警）。

**改动**：`ep-agent-actions.ts` 的 `generate_storyboards` 分支改调 `StoryboardCogenService.cogenStoryboardsForEpisode`（带 onProgress 透传 agent 事件通道更佳，无则省略），结果沿用现有返回结构（storyboard 列表 + unboundCharacters——cogen 构造绑定后该字段恒空，保留字段兼容）。旧 `EpisodeStoryboardGenerator` 路径保留给 handler 旧 IPC，agent 不再走。

**验证**：研讨室/制作助手发"为所有场景生成分镜" → 落库分镜 characterId 全非空。

## O5 TTS 配音链路实测

**现状**：合成页有「生成配音」（对白/旁白 TTS），本次全流程从未点过；语音 provider 未配置（设置里 ComfyUI 语音 API 端点为空）。

**改动**：无代码改动预定——先实测：点「生成配音」走一遍，失败则按报错定位修复（预期坑：未配置语音模型的引导文案是否存在、TTS 生成失败是否静默）。

**验证**：配音生成成功则导出含配音成片抽听；失败则修复后重验，修不了则记录缺陷与阻塞原因。

## 非目标

- 双工作台合并（H15 另立项）；Kontext 多图网关升级；存量类型错误清查（H16）。
- 单 ref 锚定强化（双人镜头只锚一人）——属网关能力限制，待 Kontext 多图或换模型。

## 执行计划

- **Wave 1（2 个并行 coder）**：
  - W1：O1（视频首尾帧）——`segment-video.service.ts`、`video-segment.service.ts`、`comfyui-video.provider.ts`、`StageStoryboardEditor.vue`（检查逻辑）
  - W2：O2 + O3 + O4（cogen service + agent 动作）——`storyboard-cogen.service.ts`、`ep-agent-actions.ts`、`storyboard.handler.ts`（如 force 参数需要 IPC 透传）
- **Wave 2（真机验证）**：应用重启 → O2 增量验证（cogen 重跑应全跳过）→ O3 验证（force 重跑后查阿蘅描述）→ O1 验证（删 1 个片段重新生成，查 video_mode）→ O4 验证（助手拆镜）→ O5 TTS 冒烟 → 视情况导出终版。
