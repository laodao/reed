# V3 通用视觉策略 M1 进度存档（2026-09-06，供后续恢复）

目标：`tasks/2026-09-06-script-to-video-v3/design.md`（通用视觉策略：imagery 意象空镜 / asset 素材驱动；
两阶段：先图文素材确认再视频）。

## 已完成
1. 备份：git tag `backup-script-to-video-v2-20260906` @ 4ff8d5ad（已 push）；DB 定义快照
   `scripts/backup-builtin-defs-v2-baseline-20260906.json`。
2. 数据层：`src/shared/types/video-presets.ts` 扩展完成——
   - 类型：VisualStrategyMode/Choice、ImageryRule、AssetUseRules、VisualPolicy；VideoPresetSpec 增加必填 visualPolicy
   - 六类预设 policy：financial-deep/news-talk/knowledge/travel = imagery（none，意象表 8-12 条）；
     ecommerce/brand = asset（required，assetUse 规则 + 兜底意象表）
   - `VIDEO_IMAGERY_FALLBACK`（6 条通用）+ `CUSTOM_FALLBACK_POLICY`（imagery/optional/兜底表）
   - `IMAGERY_NO_TEXT_MARKERS`（纪律断言：意象不得要求画面文字，允许"无文字"负向短语）
   - `VISUAL_STRATEGY_OPTIONS`（auto/imagery/asset）
3. 节点：`video-nodes.ts` videoPresetNode 增加输出 `policy`（preset?.visualPolicy ?? CUSTOM_FALLBACK_POLICY ?? null）
   + outputSchema；`workflow-node-catalog.ts` video-preset outputSchema 同步加 policy。
4. 测试（绿 15/15）：`tests/unit/core/platform/workflow/video-preset-policy.spec.ts`（6 例：policy 完整性/模式/意象纪律/assetUse/兜底/选项）；
   `video-preset.spec.ts` 扩 2 处断言 policy（预设 policy 与自定义兜底）。

## 下一步（M1 剩余）
1. `progress/_gen_v3_json.js`：以 script-to-video-v2.json 为基线（require + 深拷贝）做增量改造后写
   `src/core/database/migrations/builtin-apps/script-to-video-v3.json`：
   - start 增加 `visualStrategy` select（VISUAL_STRATEGY_OPTIONS，default auto）
   - 新增 `strategy`(code) 节点（放 preset 之后）：输入 choice={{start.visualStrategy}}、policy={{preset.policy}}、
     baseAssets={{readBase.assets}}；输出 result{mode,gate,note,policyText,baseCount}：
     * mode=choice auto?policy.mode:choice；assetDependency required 且 base 空 → throw（缺素材门控）；
       optional 且空 → 回落 imagery+note
     * policyText：imagery → 意象表逐条 + 纪律（语义不逐字、可拍无文字）；asset → 首帧=素材/禁改主体/negative
   - shotsGen systemPrompt 注入 {{strategy.result.policyText}}；拆镜输出每镜加 concept、imagery 或 assetIdx（按 mode）
   - splitShots(code) 按 strategy.result.mode 分流：imagery→gen[]（含 concept/imagery/visual）；asset→base[]
     （assetIdx 引用 readBase.assets，越界抛错），全部保 _origIndex
   - 素材 loop：imagery 沿用 loopMat(shotPack+imgShot+matItem)；asset 用 loopBase/matBase（素材图直用）；
     matItem/matBase/boardMerge cards 增加 mode/source 标注（generated / asset:<assetId>）
   - M2 视频段先按 v2 保留（vidShot image={{shotReview.imageLocalUrl}} 天然=素材首帧/意象图）
2. `create-builtin-apps.ts` 注册 builtin_def_script-to-video-v3 + app（icon 🎬，name 短视频脚本生成视频V3）
3. 重启 dev → DB 同步 → CDP validateGraph；node-registry-consistency 4/4、builtin-app-templates 观察
4. 真机 M1 验收三例：
   a. imagery：复用 60s 星宇脚本资产(tjb4e1jsi)或短脚本 → 跑到 materialReview（卡片 mode=generated）确认后停
   b. asset：ecommerce videoType + baseImageAssetIds=[] → strategy 抛"素材驱动需素材"被 gate
   c. asset：brand/ecommerce + 提供 2 张素材图资产 → 跑到 materialReview，卡片 mode=asset:<id> 且 image=素材缩略图

## 备注
- V3 沿用 V2 语义：素材板审核 approve 前不进视频段；两级审核 reject→end；画质档位沿用 videoQuality/h3Steps。
- 60s 星宇 V2 全链成功样本：wfrun_1788708132226_3r7rt9zxu（9 镜 60s，14min，turbo/low；成片 asset_1788708998768_xdyq761lj）。
- UI 运行详情改造（只读图+历史输出物）由后台子代理并行实施，进度在其汇报。

## 追加：M1+M2 落地与真机验证（2026-09-06 晚）
- 生成器 `progress/_gen_v3_json.js`（以 v2 json 为基线定点改造）；产物
  `src/core/database/migrations/builtin-apps/script-to-video-v3.json`（35 节点 / 39 边）。
  create-builtin-apps 注册 builtin_def_script-to-video-v3 / builtin_app_script_to_video_v3。
- 校验 spec `tests/unit/core/platform/workflow/script-to-video-v3-graph.spec.ts`（6 例绿：validateGraph 0 错误、
  visualStrategy、strategy 插点与 code 语义、splitShots 分流、卡片 mode/source、两级审核保留）。
- **坑与修复**：code 节点返回值被引擎再包一层 {result} → strategy code 首版返回 {result:{…}} 造成双重包裹，
  {{strategy.result.mode}} 解析为 undefined → asset 场景误落 imagery 分支；改为直接返回字段后修复。
  read-assets 项字段为 assetId（非 id）→ baseAssetId 改取 assetId；matBase source 标注为 asset:<assetId>。
- M1 真机三验证（builtin_def_script-to-video-v3，turbo/low）：
  a. gate：ecommerce+asset、无素材 → strategy 抛「素材驱动（asset）：需在底图资产提供产品/素材图片（当前 0 张）」，
     大纲生成前即 failed（wfrun_1788709595941_54ml04mxk）✓
  b. asset：brand + 2 素材 → 素材板 visualStrategy=asset，卡片 source=asset:asset_1788689018556_qwl87d96j 直用素材图 ✓
     （wfrun_1788709918285_ew5cw3iq4）
  c. imagery：financial-deep → 素材板 visualStrategy=imagery，卡片 source=generated（意象文生图）✓
     （wfrun_1788709966954_wbejcp4yv）
- M2 端到端：imagery 单镜 5s → succeeded（wfrun_1788710069523_88iwjkx7y，约 2min）：
  成片 asset_1788710201859_u2pqvg6ai（脚本成片-2026-09-06，5s）；大纲 asset_1788710201865_p6cmjxglp；
  素材板 asset_1788710201869_ax3gvl21d。
- tsc 基线 518 持平；无新增注册类型（v3 未引入新节点类型）。
- 后续：M3（检索型真实 B-roll：意象关键词→资产/KB 检索→生成兜底）按设计留待意象表数据稳定后；
  运行详情 UI 改造（只读图+状态色+环节详情+历史输出物）排在 V3 之后实施。
