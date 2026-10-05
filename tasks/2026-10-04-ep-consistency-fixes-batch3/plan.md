# 剧集制作一致性修复计划（第三批）

> 来源：`docs/review/2026-09-24-episode-production-consistency-audit.md` 第三批 + 前两批评审 deferred minor 收敛
> 第一、二批已完成并提交（fc54dab2/e25618e8/6955c3ee/109c42d6）。

## Global Constraints

- 工作分支 feat/story-room。用户有大量 diary/longwriting 在途未提交改动，与本批文件零交集，不回滚不触碰。
- 资产信息消费统一走 getEffectiveData / ReferenceResolver；名字匹配统一 normalizeBindingName。
- SQLite 串行门：事务回调内禁止全局 manager/仓库调用；事务化写法沿用前两批惯例（cleanupStoryboards 双模式、userId 手工注入、keyframe-cleanup ALS 收集器）。
- 不新增依赖；默认不写注释；每个任务补针对性单测并跑通；vue-tsc 对改动文件不得新增错误。
- 正确跑测试：`node scripts/vitest-electron.cjs --sqlite-only run <spec>`（遇 ERR_DLOPEN_FAILED 先 `npm run rebuild:node`）。
- 全量基线：58 个失败均为既有（57 环境 + 1 个用户在途 lw-library 路由致 packs-registry 过期），非本批验收标准。

## Task 1: S-06 场景重写路径的 id 撞号残留（S3 同型收尾）

文件：`src/core/platform/episode-production/narrative/scene-binding-writer.ts`（`rewriteSceneWithBindings`，:239 附近经 `writeSceneChildrenIn` 直用 AI 给的 id 不重发）
- 问题：AI 重拆场景时若重排 id（返回 dlg_1 而非保留旧 id）：(a) 与**其他场景**桥接行撞主键触发 upsert 覆盖；(b) 分镜 dialogueIds 引用旧 id，C3 重建 links 指向不存在的 id 悬空。
- 约束（务必保持）：分镜 dialogueIds 引用旧对白 id，重写后这些引用必须仍指向重写后的对应对白（若该对白仍存在）；不能简单整批重发（会打断分镜引用）。
- 修复方向（实现者先分析再动手，在报告中说明取舍）：
  1. 对白 id 对齐：重写结果与旧对白按文本/位置对齐，能保留的旧 id 尽量保留（scene-polisher.ts 已有类似 id 对齐合并逻辑可参考）；
  2. 新增对白（旧集合里没有的）分配与既有生成器同 namespace 的新 id；
  3. 防线：写库前检查本批 id 是否与其他场景的桥接行撞号，撞号的必须重发并同步改写 JSON 列 + 受影响分镜的 dialogueIds + links（或拒绝并保留旧场景，二选一，说明理由）；
  4. scene_dialogues/scene_actions 桥接表与 JSON 列同源一致。
- 既有测试：tests/unit/episode-production/narrative/scene-binding-writer.spec.ts（含 C3 links 重建用例，不能破）。

## Task 2: 批量分镜路径事务化 + insertStoryboardIn 公共 helper + 失败语义统一

文件：
- `src/core/packs/episode-production/handlers/narrative/storyboard.handler.ts`
  (a) 批量路径 `handleGenerateStoryboards`：cleanup 自提交、插入裸奔（B2-Task4 deferred minor#1）。改为 per-scene 单事务（删旧+插新+links），与单场景路径同构。
  (b) 两处「串行门手工 insert storyboard」（storyboard.handler.ts 单场景路径 + storyboard-cogen.service.ts replaceSceneStoryboards，字段清单逐字重复）抽公共 `insertStoryboardIn(manager, …)` helper（位置建议 narrative/ 下），字段口径对齐 `StoryboardRepository.create`，消除漂移风险。cogen 侧一并替换。
  (c) 批量路径 links 的 `.catch(() => {})` 静默吞错（storyboard.handler.ts:455 附近）改为与单场景一致（失败即该场景回滚、计入失败，不静默）。
- `src/core/platform/episode-production/narrative/services/storyboard-cogen.service.ts` — 换用 insertStoryboardIn helper（行为不变）。
- 注意 B2-Task4 的空数组守卫与 skippedScenes 语义必须保留。

## Task 3: 字幕时间轴与成片对齐（D1-D3）

文件：
- `src/core/platform/episode-production/compose/subtitle.service.ts`
  (a) D2：首镜对白 endSec 漏加 startOffsetSec（:218-223 附近），旁白占首镜前 2s 且首镜短、对白 ≥2 条时产生结束早于开始的非法 cue。修正 endSec 基准。
  (b) D3（字幕侧）：旁白字幕在最前，保持不变——配合导出器把旁白音频移到对白之前（见下）。
- `src/core/platform/episode-production/compose/episode-mp4-exporter.service.ts`
  (a) D1：烧录字幕当前基于全量 timeline（:234 附近 buildSrt(timeline)）——不扣转场重叠、不剔未入选镜头、不用 segment 实际时长。改为基于「入选合成单元 + 单元实际时长（segment.duration 优先）+ 转场重叠扣减」重建字幕时间轴（与 buildFilterComplex 的 xfade offset 计算同源，offset = cumulativeDur - transition.duration）。
  (b) D3（音频侧）：单元内人声 concat 顺序当前是对白在前、旁白最后（:412-417 附近，注释自述这是「数据无时间戳的下界」）。改为旁白在前、对白在后，与字幕侧（旁白占首镜前 2s）一致。
- 既有测试：tests/unit/episode-production/compose/subtitle.service.spec.ts、episode-mp4-exporter*.spec.ts，同步更新。

## Task 4: Agent 批量视频改走片段级 assetRef 主路径（V3）

文件：`src/core/platform/episode-production/agent/ep-agent-actions.ts`
- `executeGenerateSegmentVideo`（:1329-1381 附近）批量分支当前逐分镜走旧 `VideoSegmentService.generateForStoryboard`（单镜路径，不建/不用片段，不走 assetRef 三段式；无关键帧时 text2video 打 H3 必败）。
- 改为：批量默认走片段级 `SegmentVideoService.generateForSegment`（尊重项目 renderPath=assetRef 缺省），按 ep_video_segments 逐段生成；无片段时先 recompute 分段（ep-segmentation.service.ts）。
- 保持：批量分页纪律（VIDEO_BATCH_LIMIT=4）、inFlightVideoTargets 防重、started 语义、B2 前的归属校验、Task4（第一批）已修的双口径筛选。
- 单镜显式指定 storyboardId 的路径保留现状（用户/agent 明确点名单镜时）。
