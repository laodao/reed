# EP 制作单元重构设计：从"一分镜一视频"到"视频片段制"

> 2026-09-04 ｜ 状态：**已确认，V1 开发中** ｜ 起因：用户提出视频模型能力已到 15s、很快 30s，制作最小单元应是"视频片段"（含多个分镜），而非单个分镜
>
> 已确认决策（2026-09-04）：① 片段时长预算默认 **15s**（项目级可配 5–30s）；② 片段提示词**直接拼接**各镜 frameDescription（V2 再加 LLM 整合选项）；③ 存量"演示-全流程"项目作为迁移试点。

## 1. 现状与问题

**现状（代码证据）**：

- `storyboards` 表：`video_path` / `video_mode` / `duration` 直接挂在分镜行上，一个分镜一段视频
- 生成：`ep:generate-video-segment` 以单个 storyboardId 为单位（`video-segment.service.ts:79`）
- 合成：`episode-mp4-exporter` 把各分镜片段按序 ffmpeg xfade 拼接
- UI：分镜列表/编辑器（StageStoryboardView / StageStoryboardEditor）以分镜为最小卡片

**问题**：

- 5 秒一个镜头逐镜生成：N 个镜头 = N 次视频调用，成本高、等待长
- 镜头间连贯性靠 ffmpeg xfade 硬拼，运动/光影/人物一致性差——而这正是新一代视频模型（Seedance 2.x 15s、即将 30s+）原生擅长的
- 场景内多镜本应一次生成（同场景人物/光线连续），拆成单镜反而浪费了模型能力

## 2. 目标概念模型

```
剧集 Episode
 └─ 场景 Scene（scene_scripts）
     └─ 视频片段 VideoSegment  ← 新增：制作/生成的最小单元
         └─ 分镜 Shot（storyboards）← 仍是创作/脚本的最小单元
```

- **分镜（Shot）**：创作最小单元。每个镜头有自己的画面描述、台词、时长估算、@资产引用——编剧视角不变
- **视频片段（Segment）**：制作最小单元。同一场景内、连续若干镜头、总时长在预算内（默认 ≤15s，可配）的一段视频。生成、重生成、状态跟踪、成本核算都以片段为单位

## 3. 片段拆分规则（自动 + 可手调）

自动拆分（在"批量生成分镜"后自动执行，也可手动触发"重新分段"）：

1. **场景边界**：scene 切换必新开 segment（跨场景一段视频无意义）
2. **时长预算**：按镜头顺序累加预估时长，加入下一镜会超预算（默认 15s，项目级可配 5–30s）则切分；单镜头超预算则独成一段（按模型上限生成或提示用户缩镜）
3. **数量提示**：拆分结果在 UI 上预览（"3 个场景 → 7 个片段 / 共 21 镜"），用户确认后再进生成

手动调整（V1 先做最小）：片段内镜头列表只读展示 + "重新分段"按钮（改预算重算）；拖拽调段/拆段留 V2。

## 4. 数据模型

新表 `ep_video_segments`：

```sql
CREATE TABLE ep_video_segments (
  id            TEXT PRIMARY KEY,
  episode_id    TEXT NOT NULL,           -- 所属剧集（冗余便于查询）
  scene_id      TEXT NOT NULL,           -- 所属场景（片段不跨场景，规则 1）
  seq           INTEGER NOT NULL,        -- 剧集内片段序号
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending/generating/completed/error
  shot_count    INTEGER NOT NULL,        -- 含镜头数（冗余展示）
  est_duration  REAL,                    -- 预估总时长（镜头时长求和）
  prompt        TEXT,                    -- 生成用多镜头提示词快照
  video_path    TEXT,                    -- 产出视频
  video_mode    TEXT,                    -- text2video / image2video / keyframes2video
  duration      REAL,                    -- 实际视频时长
  provider_id   TEXT,
  model_id      TEXT,
  error         TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id       TEXT,
  deleted_at    DATETIME DEFAULT NULL
);
CREATE INDEX idx_evs_episode ON ep_video_segments (episode_id, seq);
CREATE INDEX idx_evs_scene   ON ep_video_segments (scene_id);
```

`storyboards` 加两列：`segment_id TEXT`（ nullable，未分段时为 NULL）、`segment_seq INTEGER`（片段内镜头序号）。**`storyboards.video_path` 废弃**（保留列不再写入；存量迁移见 §7）。

## 5. 生成流程

**片段级生成**（新默认）：

1. 组装多镜头提示词：按 segment_seq 拼接——`镜头1（约5s）：<frameDescription + @资产引用展开>；镜头2（约4s）：…`，含总时长/宽高比/风格一致性约束
2. 一次视频调用产出整段（15s 预算内）；参考图模式下首帧用首镜头的关键帧/主图
3. 状态机：segment pending → generating → completed/error（沿用 F5 修好的写回模式）；segment 完成后联动把内含 shots 的 status 置 completed

**单镜头生成**（保留）：单个分镜卡片上仍可单独生成（等价于"一镜一段"），用于补镜/重做某镜——但此时实际是给该镜新建一个单镜 segment。

**关键帧/参考图**：首版片段级只做"首帧参考图"；逐镜关键帧在片段模式下意义弱化（模型自己演算中间镜），保留单镜模式使用。

## 6. UI 形态

**分镜列表页**：按 segment 分组——

```
┌─ 片段 1 · 旧书修复工作室 · 3 镜 · 约13s · ✅ 已完成 ── [▶ 播放] [重新生成]
│   ├ 镜1 中景 苏晚伏案修书…（可展开脚本/提示词）
│   ├ 镜2 特写 古书无风自动…
│   └ 镜3 远景 窗外灰大衣身影…
├─ 片段 2 · 巷口 · 2 镜 · 约9s · ⏳ 待生成 ── [生成视频]
```

- 片段卡：封面帧（视频首帧或首镜关键帧）、场景名、镜数、预估/实际时长、状态、生成/重生成/播放
- 镜头行：只读脚本摘要 + 进编辑器微调（微调后标"已过期待重生成"）
- 顶部：时长预算设置 + "重新分段" + "全部生成"（按片段串行，配额友好）

**编辑器**：左侧列表从"镜头"改为"片段"，选中片段展开其镜头；@资产引用机制不变（提示词在镜头级维护，生成时由片段聚合）。

**合成导出**：segment 视频按 seq 直接 ffmpeg concat（segment 内镜头由视频模型保证连贯，不再 xfade 硬拼；段间可选淡入淡出）。

## 7. 存量迁移

- 每个有 `video_path` 的存量 storyboard → 迁成单镜 segment（segment.video_path = storyboard.video_path，shot.segment_id 回填）
- 无 video_path 的存量分镜 → 按拆分规则自动分段（segment_id 回填）
- 迁移写成幂等脚本（项目迁移惯例），双端 DDL

## 8. 分期

- **V1（本次）**：ep_video_segments 表 + 自动分段 + 片段级文生视频 + 列表/编辑器 UI 改造 + 合成切换 + 存量迁移；单镜生成保留
- **V2**：拖拽调段/手动拆并段、片段级参考图（多参考图）、段间转场配置、片段内单镜替换（裁剪重拼）

## 9. 开放问题（均已确认 2026-09-04）

1. ~~时长预算默认值~~ → **15s**，项目级可配 5–30s。
2. ~~提示词组装~~ → **V1 直接拼接**各镜 frameDescription（省成本、可控），V2 可选 LLM 整合。
3. ~~迁移试点~~ → **"演示-全流程"项目**（vp_1788518694155_yaq03g1sg）作为存量迁移试点。

---

## 10. 批次 A 实施记录（2026-09-04，后端，已本地 commit 未 push）

### 文件清单

**数据模型 / 迁移**
- `src/core/database/entities/episode-production/video-segment.entity.ts`（新）—— `ep_video_segments` Entity
- `src/core/database/entities/episode-production/storyboard.entity.ts`（改）—— 加 `segment_id` / `segment_seq` 两列
- `src/core/database/entities/index.ts`（改）—— barrel 导出 `EpVideoSegmentEntity`
- `src/core/database/repositories/video-segment.repository.ts`（新）—— `EpVideoSegmentRepository`（BaseRepository/scoped 惯例）
- `src/core/database/repositories/storyboard.repository.ts`（改）—— DTO 透出 segmentId/segmentSeq；新增 `getBySegmentId` / `assignSegment` / `clearSegment` / `setStatus`
- `src/core/database/migrations/create-ep-video-segments.ts`（新）—— 建表 + storyboards 加列 + 存量迁移（§7），幂等双语种
- `src/electron/database/index.ts` / `src/web/server/index.ts`（改）—— 两个迁移接入点同构登记
- `src/shared/types/episode-production/narrative.types.ts`（改）—— `Storyboard` 加可选 `segmentId` / `segmentSeq`
- `src/shared/types/episode-production/workflow.types.ts`（改）—— `VideoProjectConfig` 加可选 `segmentDurationBudgetSec`（项目级预算，复用 config JSON 列，无 DDL）

**分段 / 生成 / 合成**
- `src/core/modules/episode-production/render/video/segment-planner.ts`（新）—— 纯函数：`splitShotsIntoSegments`（§3 规则）/ `buildSegmentPrompt`（§5 拼接）/ `clampBudgetSec`（默认 15s，clamp 5–30s）
- `src/core/modules/episode-production/render/video/ep-segmentation.service.ts`（新）—— `EpSegmentationService.recompute/preview`
- `src/core/modules/episode-production/render/video/segment-video.service.ts`（新）—— `SegmentVideoService.generateForSegment`（状态机 + 联动 shots）
- `src/core/packs/episode-production/handlers/render/segment.handler.ts`（新）—— IPC：`ep:recompute-segments` / `ep:list-segments` / `ep:generate-segment-video`
- `src/core/packs/episode-production/handlers/render/video-segment.handler.ts`（改）—— 导出 `createAdapterForProviderWithReason` 复用适配链；单镜 `ep:generate-video-segment` 行为不动
- `src/core/packs/episode-production/handlers/index.ts`（改）—— 注册 `registerSegmentHandlers`
- `src/core/modules/episode-production/compose/timeline-builder.service.ts`（改）—— `TimelineShot` 加 `segmentId`
- `src/core/modules/episode-production/compose/episode-mp4-exporter.service.ts`（改）—— `buildExportUnits`：按 segment 合并合成单元（段内不 xfade），全量无 segment 回退逐镜路径

**测试 / 验证脚本**
- `tests/unit/episode-production/render/segment-planner.spec.ts`（新，15 例）
- `tests/unit/episode-production/render/ep-segmentation.service.spec.ts`（新，7 例）
- `tests/unit/episode-production/render/segment-video.service.spec.ts`（新，5 例）
- `tests/unit/episode-production/compose/episode-mp4-exporter-segment.spec.ts`（新，5 例）
- `tests/unit/migrations/create-ep-video-segments.spec.ts`（新，3 例）
- `scripts/verify-pg-ep-video-segments.ts`（新，PG 直验）

### 与设计的偏差

1. **"@资产引用沿用现有展开逻辑"的落实**：现有单镜路径（`video-segment.service.ts`）是把 `frameDescription` 原文（含 `@[名字]` 标记）直接传给 provider，并无文本级展开；`@[..]` 的解析（`parse-asset-refs.ts`）只用于关键帧参考图 override。片段级保持同一行为——标记原文拼接传入，不新增展开逻辑。
2. **重分段后 seq 编号**：已 completed 段保留原 seq，重建段从现有 `max(seq)` 续排（不全局重排，避免动 completed 段）。合成不依赖 seq（按时间线顺序分组拼接），该简化对导出无影响；UI 预览按返回数组顺序展示。
3. **段间转场**：取"改动小"方案——合成单元转场沿用组内首镜的 transition（场景首镜本为 null → 硬切），段内不 xfade；未分段分镜在混合态下保持单镜单元。
4. **片段级 keyframes2video**：V1 不支持（§5 关键帧在片段模式意义弱化），片段模式只做 text2video / image2video（首帧=首镜头首帧关键帧）；forceMode=keyframes2video 会明确报错引导走单镜。
5. **项目级预算落点**：复用 `video_projects.config` JSON 列加 `segmentDurationBudgetSec`（5–30s clamp，默认 15s），不加 DDL；UI 设置项留批次 B。
6. **存量迁移时机**：迁移随启动幂等执行；单镜生成（保留路径）写 `storyboard.video_path` 后，下次启动会被迁移自动包成单镜 segment（过渡期符合 §7 语义）。"演示-全流程"项目的试点验证留批次 B 真机进行（本批按要求未跑真实生成、未重启应用）。

### 验证结果

- 新增单测 35 例全过（拆分规则矩阵 / 提示词拼接 / 分段幂等重算 / completed 段不动 / 生成写回与联动 / 合成合并与回退 / 存量迁移含连跑两次幂等）
- 相关存量套件 `tests/unit/episode-production/{compose,render}` + `tests/unit/migrations`：292 过 2 败——2 败为 `create-builtin-apps.spec.ts` 存量失败（净树 stash 验证同样失败，与本批无关）
- PG 直验（localhost:5439/the_bot_test）：表/索引/加列/存量迁移/幂等 ×2 全过
- eslint 触及文件 0 error（仅存量风格 any warning）
- typecheck 净增 0（基线 969，本批修复过程中产生的 3 条已清零）
- 真实视频生成未跑（按要求留批次 B 统一真机验证）；生成链路以 mock adapter 单测覆盖

### 批次 B 对接（UI 调用面）

- `ep:recompute-segments` `(episodeId, opts?: { budgetSec?: number })` → `SegmentPreview`
- `ep:list-segments` `(episodeId)` → `SegmentPreview`（不重算）
- `ep:generate-segment-video` `(segmentId, opts?: { providerConfigId, modelId, forceMode?, durationSec?, width?, height? })` → `SegmentVideoResult`
- `SegmentPreview = { episodeId, budgetSec, sceneCount, totalShotCount, segments: [{ segmentId, seq, sceneId, sceneNumber, sceneLocation, status, shotCount, estDuration, videoPath, storyboardIds }] }`
- 项目级预算读写：`video_projects.config.segmentDurationBudgetSec`（项目设置 UI 加表单项即可）

---

## 11. 批次 B 实施记录（2026-09-04，UI + 迁移试点 + 真机 e2e，已本地 commit 未 push）

### 文件清单

**IPC 暴露**
- `src/preload/index.ts`（改）—— 新增 channel `EP_RECOMPUTE_SEGMENTS` / `EP_LIST_SEGMENTS` / `EP_GENERATE_SEGMENT_VIDEO`；`episodeProduction` API 加 `recomputeSegments` / `listSegments` / `generateSegmentVideo`
- `src/web/client/channel-map.ts`（改）—— Web 端同 3 条映射（双端对齐）
- `src/core/modules/episode-production/render/video/ep-segmentation.service.ts`（改）—— `SegmentPreviewItem` 加 `duration`（实际时长，片段卡"预估/实际时长"展示需要）

**UI 改造（现行工作室 storyboard/ 目录，EpisodeStudio 路由实际使用）**
- `src/renderer/src/components/episode-production/storyboard/StageStoryboardView.vue`（重写中央区）——
  - 分镜列表按 segment 分组卡片：场景名/镜数/预估+实际时长/状态四态（待生成/生成中/已完成/失败，卡片左边条同色）；操作：生成视频/重试生成/重新生成/播放（el-dialog 内置 video）；展开显示各镜头脚本摘要（SHT 编号 + 时长 + frameDescription 摘要，点击进现有制作页）
  - 顶部：时长预算 `el-input-number`（5-30s，变更即合并写 `video_projects.config.segmentDurationBudgetSec`）+ 视频模型选择（默认取 `config.videoModel`，否则第一个可用 provider）+「重新分段」（ElMessageBox 确认"清未生成段、completed 保留"后调 `ep:recompute-segments`，成功提示"N 场景 → M 片段 / 共 K 镜"）+「全部生成」（pending/error 片段串行，单段失败不阻断，结束 ElMessageBox 汇总成败清单）
  - 兼容：`segmentsLoaded && 无片段 && 有分镜` → 黄色 alert"未分段"+「立即分段」按钮；下方回退原按场次分组视图（存量能力不删）
- `src/renderer/src/components/episode-production/storyboard/StageStoryboardEditor.vue`（改）——
  - 左侧镜头列表按片段分组（组头：片段 seq · N 镜 · 约 Xs + 状态；未分段镜头单列"未分段"组并提示回列表页分段）
  - 主按钮改「生成片段视频」走片段级（`ep:generate-segment-video`，t2v 默认 forceMode=text2video；ref 模式先确保片段首镜头关键帧）；未分段镜头点击给引导提示
  - 单镜生成保留在镜头行 🎬 按钮（原 `ep:generate-video-segment` 逻辑整体搬入 `onGenerateSingle`，行为不动）
  - 预览：镜头自身 videoPath 优先，无则回退所属片段视频并显示"片段视频 · N 镜一段"角标

**e2e**
- `scripts/e2e-ui-ep-video-segment.cjs`（新）—— UI 驱动全流程（见下）

### 迁移试点结果（真实库 ~/.config/the_bot/the_bot.db）

- 重启后迁移幂等执行，日志：`ep_video_segments 表及索引已建立` / `storyboards 加列 segment_id、segment_seq` / `存量迁移：2 个有视频的 storyboard → 单镜 segment`
- **与任务书预期的偏差**：任务书预期"演示-全流程"项目（vp_1788518694155_yaq03g1sg）存在"有 video_path 的 SHT-02 + 3 个分镜 SHT-02/03/05"；真实库中该项目只有 2 个分镜（SHT-01 5s / SHT-02 7s）且**均无 video_path**，故该项目无迁移产物（符合 §7"无视频不动"）。实际迁移命中的是存量"E2E真实-剧集-视频验证"项目（vp_1788168366147）：shot 1（t2v）与 shot 7（i2v）→ 2 个单镜 completed segment（`evs_mig_*`，video_path/video_mode/duration 搬移 + segment_id 回填），SQL 直验通过
- "completed 不动"语义改在"演示-全流程"上验证（e2e Step 6，见下）：生成完成的片段在再次「重新分段」后 segmentId/状态原样保留

### 真机 e2e 结果（scripts/e2e-ui-ep-video-segment.cjs，"演示-全流程"，一次通过）

| 步骤 | 结果 |
| --- | --- |
| 未分段提示 + UI 点「重新分段」（确认框） | ✅ 1 场景 2 镜（5s+7s=12s ≤ 15s 预算）→ 合并为 1 个片段卡 |
| 工具条选火山引擎 + Doubao-Seedance-2.0（ep-20260511121109-hchqf） | ✅ |
| 片段级生成（text2video） | ✅ 190s 完成 |
| 视频文件校验 | ✅ `~/.config/the_bot/episode-production/video-segments/seg_1788532543844_q2zcra.mp4`，3,910,189 B，ftyp ✓，ffprobe 时长 **12.096s > 单镜 5s**（2 镜一段实证），库内 duration=12s |
| UI 片段卡状态「已完成」+ 播放对话框 video 可见 | ✅（截图 /tmp/ep-seg-flow-*.png） |
| 再次「重新分段」→ completed 段保留 | ✅ segmentId `evs_1788532356988_9yixoncnb` 状态不变 |

- 成本：视频生成 **1 段**（上限 ≤2）；AI 文本未调用（分镜已存在，无需重试机制）
- 产物全部保留未清理

### 常规验证

- `npx electron-vite build` ✅（18.75s）
- 重启应用（仅 `pkill -x electron`）→ 迁移在真实库执行（见上）
- `node scripts/e2e-pack-smoke.cjs` ✅ 6/6
- vitest（先 `npm rebuild better-sqlite3`，测后 `npm run rebuild:electron` 恢复，双 ABI 加载均验证）：`tests/unit/episode-production/{render,compose}` + `tests/unit/migrations/create-ep-video-segments.spec.ts` —— 20 文件 192 例全过
- eslint 触及文件 0 error（仅存量风格 any warning）
- typecheck 净增 0：全量计数 970 vs 批次 A 基线 969，逐一核对全部 970 条无一本批触及文件（preload 的 3 条 TS2554、stage-storyboard-v2 的存量错均在 HEAD 即存在；+1 为基线计数口径差，与本批无关）

### 与设计的偏差

1. **目标 UI 目录**：任务书写"StageStoryboardView / StageStoryboardEditor 等"，现行工作室（EpisodeStudio 路由）实际用的是 `storyboard/` 目录这一版（stage-storyboard-v2 是另一条 EpisodeWorkbench 路线的组件，未接入现行工作室 tab），本批只改现行路线；stage-storyboard-v2 未动。
2. **片段卡封面帧**：设计 §6"封面帧（视频首帧或首镜关键帧）"未做——片段卡为信息行 + 展开镜头行（文字摘要），封面帧留 V2。
3. **"微调后标已过期待重生成"**（§6 镜头行）：未做脏标记，留 V2。
4. **迁移试点对象**：真实库"演示-全流程"无 video_path 分镜，迁移实证落在存量 E2E 项目（2 镜 → 2 个单镜 completed segment）；"completed 不动"交互在演示项目生成后验证（见上）。
