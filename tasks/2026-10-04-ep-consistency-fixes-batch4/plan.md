# 剧集制作一致性修复计划（第四批）

> 来源：`docs/review/2026-09-24-episode-production-consistency-audit.md` 横切 X1-X4、关键帧 K1-K6 + 前三批评审 deferred 收敛项
> 前三批已完成并提交（最新 61e98638）。

## Global Constraints

- 工作分支 feat/story-room。用户 diary/lw 在途改动与本批文件零交集，不回滚不触碰。
- 资产信息消费统一走 getEffectiveData / ReferenceResolver；名字匹配统一 normalizeBindingName；SQLite 串行门与事务惯例同前三批。
- 不新增依赖；默认不写注释；每个任务补针对性单测并跑通；vue-tsc 对改动文件不得新增错误。
- 正确跑测试：`node scripts/vitest-electron.cjs --sqlite-only run <spec>`（遇 ERR_DLOPEN_FAILED 先 `npm run rebuild:node`）。
- 全量基线：64 个失败均为既有/用户在途（episode-production 零失败），非本批验收标准。

## Task 1: 批量分镜失败/跳过结果接 renderer 提示（deferred 收敛）

文件：
- `src/renderer/src/stores/` 下分镜相关 store（storyboard.store.ts）与调用批量生成 `ep:generate-storyboards` 的组件（components/episode-production/storyboard/ 下）
- 第三批评审确认：批量响应的 `failedScenes`/`skippedScenes` 字段 renderer 零消费，部分失败时用户无感知。接线：生成完成后如有 failedScenes/skippedScenes 非空，toast/通知用户（ Element Plus 消息，文案含失败场景数与首个错误信息；skipped 提示 AI 空结果已保留原分镜）。全灭时后端已 success:false，走既有错误提示路径。
- 纯前端任务，注意遵循组件现有消息提示惯例。

## Task 2: 存在未入段分镜时自动 recompute（孤儿分镜补救）

文件：`src/core/platform/episode-production/agent/ep-agent-actions.ts`（executeGenerateSegmentVideo 的 recompute 触发条件，:1328-1331 附近）
- 现状：仅 `preview.segments.length === 0` 才 recompute；「部分场景有活段 + 部分场景分镜未入段（重生分镜后旧段 superseded）」时新分镜成孤儿，agent 报「无需启动」。
- 改为：触发条件放宽为「无 live 片段 OR 存在不属于任何 live 片段的分镜」。注意 B3-Task4 已修的 V6（recompute 跳过 generating 段）必须保持——有 generating 段时仍不能触发会删除它们的 recompute；实现上确认 recompute 对 generating 段保留后，放宽的触发是安全的。
- 对照前端：StageStoryboardView 已有「发现未入段分镜静默 recompute（每剧集每会话一次）」的类似逻辑，口径可对齐。

## Task 3: readiness 与 stage-gate 判定口径统一（X1）

文件：
- `src/core/platform/episode-production/services/readiness.service.ts`（四 tab 就绪评估）
- `src/core/platform/episode-production/workflow/stage-gate.service.ts`（阶段门禁）
- 三处口径相反（审计 X1）：① 主图判定：gate 不查 imagePath（占位行判绿）vs readiness 要求 imagePath 非空；② 资产范围：gate 查项目全部 binding 含物品 vs readiness 只查出场角色/地点；③ 分镜：gate 要求每场景 ≥1 vs readiness 只要求全剧非空。
- 统一方向：以 readiness 的较严口径为准（① 主图必须有 imagePath；③ 每场景 ≥1 分镜）；② 资产范围取「出场集合」口径（readiness 现口径），gate 的资产主图校验（checkAssetMainImagesReady）收窄到出场集合。抽共享判定函数避免再次漂移。
- 注意保持 gate 的 canForce/硬锁语义与 IPC 返回结构不变；readiness 的 missing 文案不变。

## Task 4: 手动编辑场景/分镜后的下游数据维护（X2+X3）

文件：
- `src/core/packs/episode-production/handlers/narrative/script.handler.ts` 的 `handleUpdateScene`（或 scene-script.repository 的 update，:169-208 附近）：当前只写 scene_scripts JSON 列——桥接表（scene_dialogues 等）不同步、改对白/旁白文本后旧 audioAsset/narrationAudioPath 不作废。修复：update 时同步重建桥接表（对白 id 对齐复用 B3-Task1 的 alignRefIds 思路，保留旧 id 优先），文本变化的对白清 audioAsset，narration 变化清 narrationAudioPath。
- `src/core/packs/episode-production/handlers/narrative/storyboard.handler.ts` 的 `handleUpdateStoryboard`（:197-217 附近，B1-Task5 已加 links 同步）：改 frameDescription/characters/locationBindingIds 等画面内容字段后，该分镜的关键帧（storyboard_keyframe + image_assets）与视频产物（自身 videoPath / 所属片段置 superseded）应作废或标记过期，否则 readiness/gate 仍按「有视频」放行旧画面。修复方向：检测内容字段变化时级联作废（关键帧删除走 keyframe-cleanup 收集器惯例；视频置失效），dialogueIds-only 变更不作废画面。注意别把「仅改时长/转场」也当作废触发。
- 注意与 B1-Task5 的 links 同步逻辑共存；B3-Task1 的 alignRefIds 可复用则复用。

## Task 5: 音频落库路径改 user-rel 相对路径（X4）

文件：
- `src/core/platform/episode-production/render/audio/scene-audio-orchestrator.service.ts`（:172-186 附近，audioAsset.audioPath / narrationAudioPath 存绝对路径）
- 改为落库 user-rel 相对路径（与业务层惯例一致，参照视频/关键帧的 user-rel 处理与 resolveImagePath 的拼回方式）；读取侧（episode-mp4-exporter.service.ts 收集配音处）确认对存量绝对路径数据兼容（既支持 user-rel 也容忍旧的绝对路径）。
- 检查 narration-synthesis/dialogue-synthesis 等底层服务的 outputDir 处理与导出器 `filterBrokenExtraAudio` 的路径解析，统一口径。

## Task 6: 关键帧一致性细节批次（K1-K3、K5、K6）

文件：`src/core/platform/episode-production/render/keyframe/keyframe-generation.service.ts`、`keyframe-prompt-builder.ts`
- K1：`generateOneKeyframe` 拼 prompt 前对 frameDescription 过 `replaceAssetRefMarkers`（parse-asset-refs.ts），@[名字@索引@实体id] 标记剥成纯名（与视频链路口径一致）。
- K2：hasCharacterReference 判定移到能力截断之后——生成前按目标模型 maxReferenceImages 预算有效参考图，截断后无角色参考图存活则不让位风格前缀（避免视觉锚+风格锚双失）。
- K3：生成闭环内 VLM 审核的参考图基准从「选中」改为「实际生效」（referenceImageIdsEffective 优先），与事后审核口径一致。
- K5：D4-3 空绑定守卫扩展——三级来源（storyboard_characters 表 / storyboard.characters JSON / scene.characters）任一声明了角色但解析结果为空时也拦截（当前只看 scene.characters）。
- K6：落库 metadata 增 actualPrompt（含项目 stylePrompt 尾缀/boardNote/融合指令/retryNote 的完整发送 prompt），adapter 层 `, variant: {label}` 拼尾改为不落库 prompt 或移入 metadata 记录，保证「审的就是当时发出去的东西」可还原。
- K4（三视图 label 与视角映射不命中）涉及 main-image-generator 与 reference-image-selector 两侧命名空间统一，改动面较大，不在本任务，留第五批。
