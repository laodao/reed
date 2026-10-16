# 剧集制作一致性修复计划（第二批）

> 来源：`docs/review/2026-09-24-episode-production-consistency-audit.md` 第二批评级：S3、M1、M2、M3、E1、S4/S5
> 第一批已完成并提交（fc54dab2 / e25618e8 / 6955c3ee），本批在其基础上改。

## Global Constraints

- 工作分支 feat/story-room。第一批改动已提交，本批基于最新 HEAD。
- 资产信息消费统一走 getEffectiveData / ReferenceResolver；名字匹配统一 normalizeBindingName。
- 修改遵循既有代码风格；不新增依赖；默认不写注释。
- vitest 单测体系；每个任务补充或更新针对性单测并跑通；vue-tsc 对改动文件不得新增错误。
- 正确跑测试的方式：`node scripts/vitest-electron.cjs --sqlite-only run <spec>`（直接 npx vitest 会因 better-sqlite3 ABI 不匹配失败；若遇到先 `npm run rebuild:node`）。
- 不做大规模重构；每个任务只改本任务范围内的文件。
- 全量单测基线：57 个失败位于 episode-production 之外的模块（repositories/workflow/lw 等），为既有环境失败，非本批验收标准；验收看 episode-production 相关 spec 全绿 + 无新增失败。

## Task 1: 无 id 老对白导致 cogen 必失败（M3，本批最优先）

文件：`src/core/platform/episode-production/narrative/ai/storyboard-cogen.ts`
- `expectedDialogueIds` 构造（:602、:620 附近）：`(scene.dialogues ?? []).map(d => String(d.id)).filter(Boolean)` —— `String(undefined) === "undefined"` 是 truthy，filter 拦不住。无 id 老对白会让 expected 含 "undefined"，全覆盖校验恒失败，cogen 必抛错。改为 `.map(d => d.id).filter(id => typeof id === 'string' && id.length > 0)`。
- prompt 渲染对话列表处（:127 附近）：无 id 对白打印成 `- undefined · 角色: ...`。给无 id 对白合成稳定 id（如 `dlg_idx_${i}`）用于 prompt 展示，并保证 expectedDialogueIds 与 prompt 展示口径一致（同一个合成 id）。
- 注意 storyboard-cogen.ts 第一批已改过（删重复键、在途 A3 校验逻辑），基于最新代码改，不动校验语义本身。

## Task 2: dlg_/act_ id 跨场景撞主键（S3）

文件：
- `src/core/platform/episode-production/narrative/scene-binding-writer.ts` — `createScenesWithBindingsIn`（写 scene_dialogues/scene_actions 桥接表处，:291 附近）当前信任 AI 给的 id 或 `dlg_${Date.now()}_${dlgIndex}` 兜底：AI 每场从 dlg_1 编号 + Date.now 同毫秒 + 每场独立计数 → 跨场景撞主键，save 变 upsert 静默覆盖前一场。
- 修复：写库前对本批次全部场景的 dlg_/act_ id 统一重发（参照第一批已存在的 `script-append.service.ts` 的 reassignRefIds/nextRefId 逻辑，可抽公共），并同步改写 scene_scripts JSON 列里的对应 id，保证 JSON 列与桥接表一致。
- `src/core/platform/episode-production/narrative/ai/script-generator.ts` 的兜底 id 生成（:818、:838 附近）如仍被复用，保持不动即可（写库侧统一重发是兜底防线）；重点是写库侧。

## Task 3: cogen 替换式写库事务化（M1）

文件：
- `src/core/platform/episode-production/narrative/services/storyboard-cogen.service.ts` — `replaceSceneStoryboards`（:734-791 附近）：当前 `cleanupStoryboards(this.ds, ...)` 内部自开事务先提交删除，随后 create/update/links 插入在事务外逐条裸奔。中途抛错留下「旧已删+新半截」。
- 修复：把 cleanup（传 EntityManager）+ 插分镜 + 插 links + backfill 包进同一个 `ds.transaction`。`cleanupStoryboards`（storyboard-cleanup.service.ts）已支持 DataSource|EntityManager 双模式，直接复用。注意事务内不能调全局 manager/仓库方法（SQLite 串行门），统一走事务 manager。
- 保持「单场景失败不阻断后续场景」的既有语义（事务失败只影响本场景）。

## Task 4: 旧单场景分镜路径不删旧分镜（M2）

文件：`src/core/packs/episode-production/handlers/narrative/storyboard.handler.ts`
- `handleGenerateStoryboard`（:221-316 附近）：对已有分镜的场景再次调用时直接 create 追加，产生双份分镜。创建前对该场景调 `cleanupStoryboards` 删旧（与批量路径 :363 对齐），同事务或先清后建均可，注意别破坏第一批加上的 links 落库（新建后仍要写 links）。

## Task 5: 剧本删建事务边界统一 + Agent 路径对齐（S4+S5）

文件：
- `src/core/packs/episode-production/handlers/narrative/script.handler.ts` —
  (a) `handleGenerateScript`（:533-580 附近）：episode_scripts 行 upsert 目前在删建场景事务之外，失败留下「新正文+旧场景」。把剧本行 upsert 并入同一事务。
  (b) 同文件的 `handleGenerateScenes`（:652-666 附近）如同样问题一并处理。
  (c) :584 直写 `videoEpisodes.update({status:'scripting'})` 改走 `regressEpisodeStatus` 原语（与 :407/:671 对齐）。
- `src/core/platform/episode-production/agent/ep-agent-actions.ts` —
  `generate_script`（:272-277）与 `split_scenes`（:348-353）动作：当前 `deleteByEpisodeScriptId` 裸删（无级联）+ `createScenesWithBindings` 两步非事务 + 状态只在 pending/asset_prep 才回退。修复方向：把 handler 侧的「级联删旧分镜（cleanupStoryboards）+ 事务化删旧建新 + regressEpisodeStatus」抽成公共 service（位置建议 narrative/services/ 下），handler 与 agent 两侧共用。注意 agent 路径的 episode_scripts upsert 语义与 handler 是否一致，以 handler 为准对齐。

## Task 6: 磁盘文件在事务提交后删除（E1）

文件：
- `src/core/platform/episode-production/narrative/storyboard-cleanup.service.ts` — `cleanupStoryboards`（:41-98）当前在事务内删关键帧磁盘文件（经 keyframe-cleanup.ts 的 deleteKeyframeWithAsset，:52 fs.unlinkSync）。事务回滚后 DB 行恢复、文件已没，imagePath 悬空。
- 修复：事务内只收集待删文件路径，事务提交成功后再删文件。注意双模式（DataSource 自包事务 / EntityManager 并入调用方事务）：EntityManager 模式下调用方的事务边界不在本函数控制内，需要把「待删路径」返回给调用方或经回调/收集器上抛，由各调用方在自己的提交点后删。检查全部调用方（script.handler、cogen service、storyboard.handler、regenerate-scene 等）的提交点并接线。删除失败只 warn 不阻断。
