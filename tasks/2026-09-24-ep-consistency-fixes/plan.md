# 剧集制作一致性修复计划（第一批）

> 来源：`docs/review/2026-09-24-episode-production-consistency-audit.md`（审计报告，问题编号 A1-A6/B/C/G1/G2/V1/S1/S2）
> 设计参照：`docs/design/2026-09-23-episode-production-generation-consistency.md`

## Global Constraints

- 工作分支 feat/story-room，工作区内有 5 个未提交的脏文件（cogen 对白覆盖校验 v3 A3 在途工作），不得回滚或丢弃；遇到它们自带的笔误（storyboard-cogen.ts 中重复的 dialogueIds 键）顺手修掉。
- 资产信息消费统一走投影层：`*AssetService.getEffectiveData()` / `ReferenceResolver`；名字匹配统一用 `binding-name-utils.ts` 的 `normalizeBindingName`。禁止新增裸读 standalone_* 列的消费点。
- 修改遵循既有代码风格；不新增依赖。
- 项目已有 vitest 单测体系（tests/unit/），每个任务为改动补充或更新针对性单测；完成后跑相关测试文件并确保通过。
- 不做大规模重构；每个任务只改本任务范围内的文件。

## Task 1: 叙事侧名字归一化与 cogen 投影统一（A2/A4/A6）

文件：
- `src/core/platform/episode-production/narrative/ai/script-generator.ts` — `lookupBindingByName`（约 :478-487）当前只做 trim+toLowerCase，改用 `normalizeBindingName`（`binding-name-utils.ts`）做双向归一化比较，使书名号/全角空格/大小写差异都能命中。
- `src/core/platform/episode-production/narrative/services/storyboard-cogen.service.ts` —
  (a) `buildBindingState`（约 :287-395）：linked_lw 资产 `standaloneName/overrideName` 均为 null 被跳过（:337-344 的 continue），导致已有角色被重复 createStandalone。改为通过各资产 service 的 `getEffectiveData()` 取生效名/描述建索引（含 alias 候选），保证 linked_lw 资产可复用。
  (b) cogen prompt 的「项目已有资产段」注入（:343,352,361 附近）当前读 `standaloneDescription ?? overrideDescription`，改为 getEffectiveData 投影后的 description，与 `asset-roster-builder.ts` 口径一致。
- 注意：buildBindingState 若改为 async 调用 service，注意调用链签名同步调整；单条资产解析失败跳过+warn，不阻断（对齐 asset-roster-builder 行为）。
- 顺带修复 `src/core/platform/episode-production/narrative/ai/storyboard-cogen.ts:546-551` 对象字面量重复的 `dialogueIds` 键（删其一），恢复 typecheck 绿。

## Task 2: 视频 assetRef 链路投影统一 + provider 守卫 + 选图闸门（A1/V1/V4）

文件：
- `src/core/platform/episode-production/render/video/asset-ref-resolver.ts` — `collectSegmentAssetRefs`（:66-155）当前裸读 binding 表（`standaloneName ?? bindingId`、`standaloneDescription` 截 80 字）。改为经 `getEffectiveData`（或 ReferenceResolver）取生效 name/description，linked_lw 资产不再落空。
- 同文件 `pickRefImage`（:44-54）当前「主图优先→confirmed→第一张有图」，与关键帧侧 confirmed 闸门口径不一。对齐 `reference-image-selector.ts` 语义：confirmed=1 池内主图优先，池空回退 is_main 主图并 warn。
- `src/core/platform/episode-production/render/video/segment-video.service.ts` — `generateViaAssetRef`（:233-368）目前只检查 adapter.imageToVideo 存在。增加 provider 守卫：assetRef 路径要求 provider 支持「参考图=主体外观」语义（当前仅 comfyui 网关；判定方式可参考 adapter capabilities/templateId），不支持的 provider 明确报错并提示换模型或回切关键帧路径，不得静默把参考板当首帧发出去。

## Task 3: 关键帧反查与地点平面图判定的投影统一（A3/A5）

文件：
- `src/core/platform/episode-production/render/keyframe/keyframe-generation.service.ts` — `findBindingByName`（:1560-1573）只查 `standaloneName` 列，linked_lw 角色永远反查不到。改为按项目 binding 列表 + getEffectiveData 生效名匹配（用 normalizeBindingName 归一）。
- `src/core/platform/episode-production/assets/services/main-image-generator.service.ts` — `prepareLocationReference` 的室内单间判定（:333-334）只测 `binding.standaloneName/standaloneDescription`，linked_lw 地点两列为 null 漏判。改用 getEffectiveData 的 name/description 做判定。

## Task 4: 「分镜视频齐备」判定口径统一（主题 B）

背景：片段制出片只写 `ep_video_segments.video_path`，不回写 `storyboards.video_path`，以下消费方口径分裂。修复方案：**判定侧统一双口径**（分镜自身 videoPath 非空，或所属非 superseded 片段 status=completed 且 videoPath 非空），与 `timeline-builder.service.ts:106-134` 同款逻辑；不做数据回写（避免双写漂移）。
文件：
- `src/core/platform/episode-production/workflow/stage-gate.service.ts` — `checkProducingComplete`（:373-409）改为双口径。
- `src/core/platform/episode-production/agent/ep-agent-deps.ts` — `storyboardsWithVideo` 统计（:109 附近）改双口径。
- `src/core/platform/episode-production/agent/ep-agent-actions.ts` — 批量视频目标筛选 `!sb.videoPath`（:1336 附近）改双口径，避免重复生成已出片分镜。
- `src/core/platform/episode-production/compose/timeline-builder.service.ts` — `segHasVideo`（:106-115）补 superseded 过滤，与导出器口径对齐（导出跳过 superseded 片段）。
- 判定逻辑如有多处重复，抽一个共享 helper（位置可放 workflow/ 或 compose/ 附近，遵循现有结构）。

## Task 5: 对白-镜头关联表（storyboard_dialogue_links）维护闭环（C1-C4）

文件：
- 新增/抽公共函数（建议放 `src/core/platform/episode-production/narrative/` 合适位置）：`rebuildStoryboardDialogueLinks(manager, storyboard)`——按分镜 `dialogueIds` JSON 列先删后插重建该分镜的 links 行。
- `src/core/packs/episode-production/handlers/narrative/storyboard.handler.ts` —
  (a) 旧批量路径 `handleGenerateStoryboards`（:360-385）补写 links（与单场景路径 :286-296 同口径）；
  (b) `handleUpdateStoryboard`（:197-217）：dialogueIds 变更时调用重建函数同步 links。
- `src/core/platform/episode-production/narrative/scene-binding-writer.ts` — `rewriteSceneWithBindings` 删建 scene_dialogues 后（:222-225 附近），按该场景所有分镜的 dialogueIds 重建 links（FK CASCADE 已把旧 links 删掉）。
- `src/core/platform/episode-production/compose/subtitle.service.ts` — 均分回退（:152-180）：只分配「未被任何 links 承接」的对白，避免混合状态下台词重复。
- 注意：cogen 路径已双写（storyboard-cogen.service.ts:782-790），不要动；旁白承接（C6）不在本任务范围。

## Task 6: 资产图换装回退 + 派生链故事背景（G1/G2）

文件：
- `src/core/platform/episode-production/assets/services/main-image-generator.service.ts` — `addAdditionalMain`（:539-632）在解析模型后未走 `fallbackToReferenceCapableModel`；有参考图时补上（对齐 generateMain :426-428）。
- `src/core/platform/episode-production/assets/services/gallery-derivation.service.ts` — 派生链（deriveSingle/deriveBatch）调用方大多不传 storyBackground，导致古风/年代约束丢失。在 service 层按 binding→project→项目最新一集自行解析 storyEra/storyRegion/storyBackgroundExtra（可复用 `main-image-generator.service.ts:118-164` `buildStoryAnchorPrefix` 的查询逻辑，抽公共 helper 更佳），调用方显式传入时优先。输入类型 `DeriveBatchInput` 如需加字段则同步改。
- renderer 调用点（`src/renderer/src/components/episode-production/` 下 AssetGallery 等）若 service 侧已自行解析则不必改；若接口需要则最小改动。

## Task 7: 剧本生成失败保护（S1/S2）

文件：
- `src/core/platform/episode-production/narrative/ai/script-generator.ts` —
  (a) `generateFullScript`（:999-1002 附近）：解析结果 scenes 为空时 throw（与缺正文同等待遇），不再只 warn 放行——防止 handler 把旧场景删光后新场景为 0。
  (b) 场景 JSON 截断补偿：三个入口（generateFullScript/continueScript/splitScriptTextToScenes）当前用裸 callAI，场景 JSON 超 16000 token 截断无补偿。接入 `callAIWithContinue`（`src/core/platform/services/ai-call.ts:554-594`）做 JSON 截断续写（≤2 次）。注意 callAIWithContinue 的去重拼接已有已知缺陷（ai-call.ts:583-594 注释与实际行为相反，模型从头重复时会拼出两份 JSON）——若影响到本任务接入，一并修正该函数使「续写内容包含已输出开头」时只保留续写全量（它本就是完整重新输出）或按重叠截断，并补单测。
- 确认 `handleGenerateScript`（`src/core/packs/episode-production/handlers/narrative/script.handler.ts`）在 generateFullScript 抛错时不会进入删旧建新事务（应该天然成立，验证即可）。
