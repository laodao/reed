# 实施计划：分镜与资产识别联合生成（2026-09-16）

依据 `tasks/2026-09-16-storyboard-asset-cogen/design.md`（D1~D8）。每步附验证方式。

## Phase 1：模型配置入口（D3、D6 配置面）

**Step 1.1** Studio 挂项目设置对话框
- `src/renderer/src/views/EpisodeStudio.vue`：顶栏（剧集选择器旁）加「设置」按钮，mount `components/episode-production/dialogs/SettingsDialog.vue`。
- 该对话框 props：`modelValue / allLwProjects / providerConfigs / providerTemplates`。参照 `views/LongWriting.vue` 拿 allLwProjects 的方式；providerConfigs/providerTemplates 走设置页同款 IPC（`window.electronAPI` 的 provider 配置列表 + 模板列表）。
- 验证：Studio 打开设置 → 能选剧本生成模型并保存，`video_projects.config.scriptModel` 落库（sqlite 查 `config` JSON）。

**Step 1.2** SettingsDialog 增加视频参数
- 同文件 form.config 增加 `videoQuality`（high/low，默认 high）、`videoSteps`（number，默认 20），保存进 `config`。
- 验证：UI 改值保存后 sqlite 可见。

## Phase 2：联合生成核心（D1、D2、D4-1、D4-2）

**Step 2.1** `src/core/platform/episode-production/narrative/ai/storyboard-cogen.ts`（新增）
- `buildCogenPrompt(scene, existingAssets, opts)`：场景全文（描述/旁白/对话/动作/角色名单）+ 已有资产（kind/name/description/bindingId）+ 输出 schema 与强约束（shots 2~8；name ⊆ 资产；已有资产不改名不重复创建；frameDescription 四段式；服饰描述必须抄资产卡）。
- `generateCogenForScene(scene, existingAssets, providerConfigId, modelId)`：callAI（maxTokens 16000 + callAIWithContinue）→ extractJsonFromResponse → `validateCogenOutput`（schema + name⊆ 校验）→ 不合法时把错误清单喂回模型纠错重试 1 次。
- 验证：单测式脚本对一个场景跑出合法 JSON（可用 tsx 直跑或临时脚本，不进仓库）。

**Step 2.2** `src/core/platform/episode-production/narrative/services/storyboard-cogen.service.ts`（新增）
- `cogenStoryboardsForEpisode(episodeId)`：
  1. 加载 episode → script → scenes（按 scene_number 串行）；读 `project.config.scriptModel`，未配置 → 报错（D3）。
  2. 每场景：`generateCogenForScene`（existingAssets = 项目当前全部 binding 快照）。
  3. D2 绑定构造：characters/location/items 按名（standaloneName/overrideName）匹配项目现有 binding；未命中调 `character-asset.service / location-asset.service / item-asset.service` 的 `createStandalone`（描述来自资产卡）。
  4. 写库：删该场景旧分镜 → 写新分镜（characters[].characterId = binding.id，locationBindingIds/itemBindingIds 填上）；回填 `scene.characters[].characterBindingId`、`scene_characters.character_binding_id`、`scene.location_binding_id`。
  5. D4-2 断言：落库后复读该场景分镜，任一 characterId 为空 → throw。
- 验证：对第一集跑一遍（模型 qwen3.8-max），sqlite 验 F1/F2 全部消除。

**Step 2.3** IPC + 渲染层接线
- `storyboard.handler.ts`：新增 `ep:cogen-storyboards`（调 2.2 service）。
- `src/preload/index.ts`：`episodeProduction.cogenStoryboards(episodeId)`。
- `StageStoryboardView.vue`：「批量生成分镜」改调 cogen IPC；返回未配置 scriptModel 错误时 ElMessage 引导去「设置」（D8）。
- 验证：UI 点一次按钮，3 场景分镜全部替换且绑定齐全。

## Phase 3：下游加固（D4-3、D5、D6 传输）

**Step 3.1** 关键帧画幅 + 空绑定守卫（`keyframe-generation.service.ts`）
- `DEFAULT_KEYFRAME_WIDTH/HEIGHT` → 按 `project.config.aspectRatio` 推导（16:9→1344×768，9:16→768×1344，1:1→1024×1024）；项目 config 经 scene→episode→project 链路上取一次缓存。
- D4-3：`generateKeyframesForStoryboard` 里 `scene.characters` 非空但 `sceneAssets.characters` 为空 → throw（文案指向"先跑联合分镜/绑定修复"），不进入图像调用。
- 验证：构造无绑定分镜调用 → 明确报错；有绑定分镜 → 关键帧调用日志 `referenceImages` 非空、尺寸 1344×768。

**Step 3.2** 视频 quality/steps 透传
- `segment-video.service.ts`（片段级）与单镜路径：从 episode→project 读 `config.videoQuality/videoSteps`，塞进 `VideoGenerationRequest`（字段 provider 已支持）。
- 验证：日志中 h3 提交 body steps=4（配置 low/4 时）。

## Phase 4：构建验证

**Step 4.1** `npm run typecheck`（或仓库等价命令）+ 主进程重启（`EP_VIDEO_POLL_TIMEOUT_MS=7200000 npm run dev:debug`）。
- 验证：编译零错误；Studio/分镜 tab 无控制台报错。

## Phase 5：第一集重跑验收（spec §5）

**Step 5.1** 项目设置（新 UI）：scriptModel = `pc_mtee10tz_ijz2yq1ro / qwen3.8-max`；videoQuality=low、videoSteps=4（turbo 验收）。
**Step 5.2** 分镜 tab「批量生成分镜」（cogen）→ sqlite 验：13±N 分镜 characterId/location/item 绑定全非空（现有 6 个资产应按名复用，不重复建）。
**Step 5.3** 资产 tab 复核定妆图齐备（阿蘅/陈舟/渡船/灯芯信物/引渡名册/青瓷碗已有，直接复用）。
**Step 5.4** 重新分段（「重新分段」按钮，旧片段引用旧分镜已失效）→ 逐场景「进入制作 → 参考图模式 → 生成片段视频」（关键帧因分镜是全新 id 会自动重建，含定妆图 refs）。
**Step 5.5** 6 片段全部 completed/image2video → 合成 tab 导出 MP4。
**Step 5.6** 逐片段抽帧 + 通读剧本对照评估（spec §5-3/4），输出评估结论。

## 风险与回退

- cogen 输出仍不合法（重试 1 次失败）→ 该场景 error 并保留旧分镜（替换在成功后才执行，旧数据不丢）。
- qwen3.8-max 429：按既往经验等 1~2 分钟重试；cogen 场景级串行天然限流。
- 新设置入口数据加载异常 → 回退方案：sqlite 直改 `video_projects.config`（仅配置，不涉内容造假）先行验收，入口修复跟上。
