# 剧集制作模块一致性审计报告

> 日期：2026-09-24
> 方式：对照 `docs/design/2026-09-23-episode-production-generation-consistency.md`，六路并行逐环节实读代码
> 结论：文档描述的主干设计大多属实，但存在 **4 个系统性断裂主题** 和若干单点缺陷。用户感知的「一致性仍有问题」主要由主题 A/B/C 造成。

---

## 一、系统性断裂主题（优先修）

### 主题 A：双轨制投影（getEffectiveData）在多处断裂——linked_lw 项目必然漂移

设计：资产双轨制（standalone / linked_lw）要求所有消费方经 `getEffectiveData` 投影取生效的 name/description。以下环节裸读 binding 表，linked_lw 资产（`standaloneName/standaloneDescription` 恒为 null）直接落空：

| # | 位置 | 断裂点 | 后果 |
|---|---|---|---|
| A1 | `render/video/asset-ref-resolver.ts:104,119,134` | assetRef 声明段取 `standaloneName ?? bindingId`、摘要取 `standaloneDescription` | 三段式清单出现裸 ID「1号=cb_xxx」；编号标注永不命中；外观摘要为空——assetRef 核心机制对 linked_lw 项目名存实亡 |
| A2 | `narrative/services/storyboard-cogen.service.ts:337-344` + `binding-name-utils.ts:52-56` | cogen binding 索引 `primary = standaloneName ?? overrideName`，linked_lw 两列皆 null 被跳过 | 已有角色被当新角色 createStandalone——定妆图挂在 linked binding，分镜绑到无图新 binding，「一个实体一份 binding」地基破裂 |
| A3 | `render/keyframe/keyframe-generation.service.ts:1560-1573` | `findBindingByName` 只查 `standaloneName` 列 | linked_lw 角色反查不到被静默跳过，关键帧 prompt 缺人 |
| A4 | `storyboard-cogen.service.ts:343,352,361` | cogen 已有资产注入读 `standaloneDescription ?? overrideDescription`，不走 getEffectiveData（roster 走，口径不一） | linked_lw 资产在 cogen 上下文无描述，模型自行重撰与定妆图分叉 |
| A5 | `main-image-generator.service.ts:333-334` | 室内单间跳过平面图判定只测 standalone_* 字段 | linked_lw 室内地点仍走平面图先行，「俯视娃屋」事故回归 |
| A6 | `narrative/ai/script-generator.ts:483-485` vs `binding-name-utils.ts:33-40` | 按名反查归一化口径不一（trim+lowercase vs 去书名号/全角/全部空白） | 同一名字「《雪麓山庄》」在 cogen 能绑、剧本生成侧绑不上落 null |

**修复方向**：全链路统一走 `ReferenceResolver` / `getEffectiveData`；名字归一化统一用 `normalizeBindingName`。

### 主题 B：「分镜 videoPath」与「片段 videoPath」双轨判定各自为政

片段制（assetRef 默认路径）出片只写 `segment.videoPath`，**不回写 `storyboard.videoPath`**（`segment-video.service.ts:199-201,330-332`）。消费方口径分裂：

| 消费方 | 口径 | 后果 |
|---|---|---|
| `stage-gate.service.ts:373-409` ⑤ 判定 + completed 硬锁 | 只认 sb.videoPath | **片段制剧集永远无法合法进 completed**（canForce=false）；gate 红 / readiness 绿的反向矛盾 |
| `ep-agent-actions.ts:1336`、`ep-agent-deps.ts:109` | 只数 sb.videoPath | agent 把已完成分镜当缺视频重复生成 |
| `timeline-builder.service.ts:106-134`、`readiness.service.ts` | 双口径（正确） | — |
| `timeline-builder.service.ts:107-115` segHasVideo | 不过滤 superseded | 删除已完成片段内单个分镜后：导出硬锁放行但成片静默缺镜（exporter 跳过 superseded） |

**修复方向**：片段成功时同步写 shots.videoPath，或 gate/agent/timeline 统一双口径；segHasVideo 排除 superseded。

### 主题 C：字幕/配音分配数据源（storyboard_dialogue_links vs dialogueIds JSON）缺乏维护方

字幕读 links 表优先，配音读 dialogueIds JSON——两个数据源在多条路径上脱钩：

- **C1** 旧批量路径 `storyboard.handler.ts:360-385` 不写 links（单场景旧路径反而写）→ 字幕退回均分，台词与镜头错位。
- **C2** `handleUpdateStoryboard`（`storyboard.handler.ts:197-217`）改 dialogueIds 只更新 JSON 列，links 脱钩 → 同一镜头字幕与配音台词不同。
- **C3** 场景对白重写删 `scene_dialogues` 行，FK CASCADE 把 links 静默级联删除且不重建（`scene-binding-writer.ts:222-225`）。
- **C4** links 部分缺失时，均分回退不剔除已被其他镜头 links 承接的对白 → 台词字幕重复出现（`subtitle.service.ts:152-180`）。
- **C5** cogen O2 增量跳过只查 characterId 非空（`storyboard-cogen.service.ts:476-482`），老数据场景 links 缺失永远补不上。
- **C6** 旁白无承接校验、无落库字段（cogen schema 无 narrationId），但 prompt 约束 13 声称旁白也要有镜头承接——虚假承诺。
- **C7** `cleanupStoryboards` 不显式清 links（靠 FK 兜底，删除路径 OK，但孤儿场景见 C3）。

**修复方向**：落库后统一从 dialogueIds JSON 重建 links 的公共函数，所有写入路径调用；字幕均分只分配未被 links 承接的对白；旁白纳入承接体系或从 prompt 删除该约束。

### 主题 D：字幕时间轴 ≠ 成片时间轴

- **D1** 烧录字幕基于**全量** timeline（不扣转场重叠、不剔除未入选镜头、不用 segment 实际时长），视频链逐转场扣 dur——任一非 cut 转场即开始累计漂移，每转场 ~0.5s（`episode-mp4-exporter.service.ts:234` vs `:143-145,567-573`）。
- **D2** 首镜对白 endSec 漏加 startOffsetSec → 旁白占首镜前 2s 且首镜短、对白 ≥2 条时产生**结束早于开始的非法 SRT 条目**（`subtitle.service.ts:218-223`）。
- **D3** 配音把旁白排在单元内对白**之后**，字幕把旁白显示在**最前**——音画顺序相反（`episode-mp4-exporter.service.ts:412-417` vs `subtitle.service.ts:64-76`）。

**修复方向**：字幕基于「入选单元 + 单元实际时长 + 转场扣减」重建时间轴。

---

## 二、高严重级单点问题

### 剧本环节

- **S1【高】场景 JSON 解析为空不抛错**：`script-generator.ts:999-1002` 只 warn；handler 照样进「删旧建新」事务 → 一次生成失败 = 全部旧场景及分镜/关键帧被级联清空不可恢复（`script.handler.ts:564-580`）。应与缺正文同等待遇直接 throw。
- **S2【高】环节一 JSON 无截断续写**：文档所述 `callAIWithContinue` 只用于资产识别；generateFullScript/continueScript/splitScriptTextToScenes 全用裸 callAI，16000 token 截断即触发 S1。
- **S3【高】dlg_/act_ id 跨场景撞主键**：`dlg_${Date.now()}_${dlgIndex}` 每场景独立计数，同毫秒同号必然撞；`save()` 变 upsert 静默覆盖前一场的行 → bridge 表只剩最后一场的对白，JSON 列完好——validator/质检/字幕读 bridge 全部残缺（`script-generator.ts:818,838`、`scene-binding-writer.ts:291`）。初次生成路径没有 append 路径的 reassignRefIds 保护。
- **S4【高】剧本行更新在场景事务外**：失败留下「新正文+旧场景」脱节（`script.handler.ts:533-557` vs `:564-580`）。
- **S5【高】Agent 剧本/拆场景路径丢失 handler 的三条防线**：非事务删建、无级联清理（旧分镜/关键帧/links 成孤儿）、状态不回退（`ep-agent-actions.ts:272-277,348-353`）。

### 分镜环节

- **M1【高】cogen 替换式写库删旧与插新不同事务**：cleanup 自己提交删除，插入循环裸奔——中途抛错留下「旧已删+新半截」，「失败保留旧分镜」承诺不成立（`storyboard-cogen.service.ts:734-791`）。
- **M2【高】旧单场景路径不删旧分镜**：`handleGenerateStoryboard` 直接追加，同场景双份分镜进时间线、links 双份、导出翻倍（`storyboard.handler.ts:221-316`）。前端 store 整体覆盖恰好掩盖，刷新页面现形。
- **M3【高】expectedDialogueIds 把 undefined 变成字符串 "undefined"**：`String(d.id)` 对无 id 老对白产生 `"undefined"`，全覆盖校验恒失败 → 含无 id 对白的场景 cogen 必抛错（`storyboard-cogen.ts:602,620`）。
- **M4【高】`normalizeCogenOutput` 重复 dialogueIds 键**：`storyboard-cogen.ts:546-551` 逐字节重复，typecheck 恒红（TS1117），噪音淹没真正类型错误。

### 资产图环节

- **G1【高】addAdditionalMain 不走 F1b 回退**：换装/多主图带参考图但钉住纯 T2I 模型时，参考图被能力截断静默丢弃——「换装后判若两人」直通路径（`main-image-generator.service.ts:583-595`）。
- **G2【高】图集派生主链路不传 storyBackground**：AssetGallery 三处 derive.single + deriveBatch 都不传 → 古风项目的派生图丢失「严禁现代服饰」约束——主图古装、派生图卫衣牛仔裤（`AssetGallery.vue:533,571,758`、`gallery-derivation.service.ts:129-135`）。

### 视频环节

- **V1【高】assetRef 路径对非 comfyui provider 无 guard**：火山/百炼的 imageToVideo 语义=首帧，编号参考板直接当首帧进成片（白底分栏+编号徽章）；三段式协议对不认它的模型全部失效（`segment-video.service.ts:233-294`、`volcengine-video.provider.ts:223-228`、`bailian-video.provider.ts:418-425`）。
- **V2【高】参考板成员缺图时编号错位**：拼板 worker 对幸存成员重排 slot，但声明段/正文标注用原始下标编号——「N号=名字」与板上色块错一位，人物张冠李戴（`reference-board.service.ts:75-91` vs `segment-video.service.ts:293-294`）。
- **V3【高】Agent 批量视频绕开 renderPath=assetRef**：逐分镜走旧单镜路径，无关键帧时 text2video 打 H3 必败（H3 textToVideo:false）（`ep-agent-actions.ts:1329-1356`）。

### 事务/工程

- **E1【高】事务内删磁盘文件**：cleanupStoryboards 并入事务后，关键帧磁盘文件在 commit 前物理删除；回滚后 DB 行恢复、文件没了，imagePath 悬空（`storyboard-cleanup.service.ts:76` → `keyframe-cleanup.ts:52`）。应 commit 后删文件。

---

## 三、中严重级问题（按环节）

### 剧本
- **S6** 生成主路径仍用 `String.replace` 填占位符：正文含 `$&`/`$'` 时 prompt 被污染（`script-generator.ts:923-926,1035-1038,977-980`；续写/拆分已用 fillPromptTemplate，主路径漏改）。
- **S7** 覆盖度校验 haystack 混入剧本正文：「对白写进正文但漏进 dialogues」判覆盖——双保险在最关键场景失效；首尾 8 字容错对「中段删除/两句合并」漏判（`script-generator.ts:1012-1019`、`script-coverage.ts:53-57`）。
- **S8** bridge 表无级联删除 + `update-scene` 只写 JSON 列：双写系统性写岔，孤儿行累积且可被同 id upsert「复活」（`scene-script.repository.ts:169-208`）。
- **S9** `callAIWithContinue` 去重拼接逻辑与注释相反：模型从头重复时追加完整重复 JSON → 解析失败 → 资产识别静默返回空数组（`ai-call.ts:583-594`）。
- **S10** volume 分支漏读 chapter 直挂正文、不处理 volume 直挂 section（`script.handler.ts:490-504`）。

### 分镜
- **M5** O3「描述过薄」判定用角色服饰词 `/[衣袍裙衫装服]/` 套地点/物品 → 地点物品描述每个场景被反复覆盖（描述 churn 制造漂移）；宏观地点守卫只拦室内词一种污染（`storyboard-cogen.service.ts:520-530,552-563`）。
- **M6** 纠错重试响应不做截断检查，被截断时白耗一次重试（`storyboard-cogen.ts:606-621`）。
- **M7** D4-2 断言只查 characterId；location/item 绑定列 update 返回 null 未检查；断言报错引用不存在的 `c.characterName` 恒显示 `?`（`storyboard-cogen.service.ts:860-872`）。
- **M8** pacing 警告无人可见：cogen 只 console.warn，旧路径 handler 不回传 pacingWarnings，renderer 无消费方——「只警告不阻断」实际等于「无人可见」。
- **M9** cogen 新分镜 segmentId 为 null 且无自动 recompute 触发点，中间态合成页片段与新分镜脱节。
- **M10** 旧路径：对白部分分配时剩余对白无承接；批量 prompt 对话列表不给 id 却要求输出 dialogueIds 且不过滤合法性。
- **M11** `normalizeAiCharacters` 名字反查不归一（精确匹配，带空格/全角即失败）。

### 资产图
- **G3** `stripSystemConstraints` 正则表停留在 2026-09-21 之前：漏剥「时代背景：…」「人物/地点设定锚点：」、古风后缀、无人约束、构图锚、平面图变换、物品约束等全部新系统段 → 编辑框回填后这些段被固化为「用户内容」，prompt 越滚越长、约束串 slot（`asset-identity-prompt.ts:199-219`）。
- **G4** standalone 角色 appearance/outfit 不投影为 undefined，关键帧角色段只剩名字（无文字锚）；linked_lw 未填 overrideOutfit 同缺（`character-asset.service.ts:143-155`、`keyframe-prompt-builder.ts:362-366`）。
- **G5** 故事锚点双源矛盾：service 取「项目最新一集」、renderer 取「当前集」——多集项目 prompt 可同时带两个互相矛盾的年代；三视图只取 era 丢弃地域/背景（`main-image-generator.service.ts:134-144` vs `renderer/src/api/main-image-generator.ts:57`）。
- **G6** resolvedModel / 参考图截断在资产域全链路不落库不上抛（接口注释要求暴露给用户，只有 keyframe 域兑现）。
- **G7** 360 全景不钉项目模型、无古风/故事锚点 → 与主图色调分叉。
- **G8** config.stylePrompt 与 binding styleAnchors 可产出两个冲突「风格」段，模型自由取舍。

### 关键帧
- **K1** 关键帧 prompt 不剥 `@[名字@索引@实体id]` 标记，原始标记+实体 id 直接喂图像模型（视频路径剥了，两条链路口径不一）（`keyframe-generation.service.ts:1173`）。
- **K2** hasCharacterReference 判定在能力截断之前：参考图被全丢后 prompt 首段仍是「与参考图保持一致」，视觉锚+风格锚双失（`keyframe-generation.service.ts:1159,1187`）。
- **K3** 生成闭环内 VLM 审核基准用「选中参考图」而非「实际生效」（截断后），误报触发无谓重拍（`keyframe-generation.service.ts:1328` vs `keyframe-review.service.ts:146-150`）。
- **K4** 视角映射常态失效叠加：B4 主图优先短路使 view 评分死代码；三视图 label（3q_left）与映射槽位（left_3q）永不命中；选不到时静默无参考图无 warn（`keyframe-view-mapping.ts:41-44`、`reference-image-selector.ts:175`）。
- **K5** D4-3 空绑定守卫只以 scene.characters 为触发：分镜级声明了角色但全解析失败时静默降级纯文生（`keyframe-generation.service.ts:737-749`）。
- **K6** 落库 prompt ≠ 实际发出 prompt（缺 stylePrompt 尾缀/boardNote/融合指令/retryNote；adapter 还拼 `, variant: xxx` 标签进模型输入），审核证据链不完整。

### 视频
- **V4** pickRefImage 无 confirmed 闸门（主图优先不问 confirmed）——与关键帧侧「confirmed 池强制」口径不一，同一资产两条链路可选到不同的图（`asset-ref-resolver.ts:44-54`）。
- **V5** 时长口径断裂：分段预算上限 30s vs H3 静默钳 15s，prompt 声称 30s、产物 15s、DB 记 30s → 合成 xfade offset 错位；capabilities.maxDurationSec 全链路无消费方。
- **V6** recompute 删除 generating 段无守卫（merge/split/move 都有）：在途任务 providerTaskId 丢失、完成后误标新分镜 completed 漏镜（`ep-segmentation.service.ts:133-136`）。
- **V7** 75min 轮询超时写 error 后，启动恢复只扫 generating——远端成品永久丢失；恢复只接 comfyui 协议，火山/百炼 taskId 一律复位 error。
- **V8** moveSegment 只换 segment seq，导出按分镜 shotNumber 排序——「片段排序」对成片顺序无效。

### 横切
- **X1** readiness 与 stage-gate 三处口径相反（主图占位行/出场范围/分镜覆盖），同一剧集两个面板互相矛盾。
- **X2** update-scene 改对白/旁白不同步桥表、不作废 audioAsset/narrationAudioPath → 字幕≠配音，旧旁白音频仍混入导出。
- **X3** update-storyboard 改画面内容不作废下游关键帧/视频产物，readiness/gate 仍按「有视频」放行。
- **X4** 音频落库用绝对路径，数据目录迁移后被静默剔除 → 成片无声不报错（`scene-audio-orchestrator.service.ts:172-186`）。

---

## 四、低严重级问题（摘要）

- 并发 append 可产重复 sceneNumber（无唯一索引）；`handleGenerateScript` 直写状态绕过 `regressEpisodeStatus`；fillPromptTemplate 替换顺序可被正文注入。
- cogen 同名取最早创建但不查图像可用性（可能绑到无图废弃副本）；`backfillSceneBindings` 只填空不纠错。
- 同名资产编号共享与清单不一致；mergeSegments 预算硬编码 15s 忽略项目配置；`allowOnScreenText` 豁免无入口；subjectSupport 推断是死代码；启动恢复写回 videoMode 口径错；降级 trace 不到达用户。
- 派生占位行复用不限 category 可能回填错行；三视图不加白底定妆约束与派生基线不一；preset 数字人主图无定妆 framing；deriveBatch 地点变体无 metadata 维度锁失效。
- 关键帧四个生成入口 override 口径不齐（insertBetween 不解析 @[..]）；机检阈值对纯室内空镜/雪景有误伤面；合成锚定草稿 prompt 含人物描述有重复人物风险；`storyboard.referenceImageIds` 全库无写入方功能悬空；agent 配音不传 defaultNarratorVoiceId。
- 过期注释：cogen 纠错重试次数（注释 1 实际 2）；文档环节七所称参考板硬提示实际只在关键帧路径，assetRef 三段式只有较弱措辞。

---

## 五、修复优先级建议

**第一批（直接导致用户可见不一致）**：A1-A6（双轨投影统一）、B（videoPath 口径统一）、C1-C4（links 维护）、G1/G2（换装回退+派生传 storyBackground）、V1（provider guard）、S1/S2（生成失败保护）。

**第二批（数据完整性）**：S3（id 重发）、M1（cogen 事务）、M2（旧路径删旧）、E1（commit 后删文件）、S4/S5（事务边界）、M3（"undefined" id）。

**第三批（体验与可观测）**：D1-D3（字幕时间轴）、M4（typecheck）、X1（口径统一）、V5（时长钳制）、M8/G6（警告到达用户）。

**同时修订设计文档**：环节一所述 JSON 截断续写对剧本生成不属实；环节七参考板硬提示措辞与实际不符。

---

## 六、修复状态跟踪（2026-09-25 更新）

第一批问题已按 `tasks/2026-09-24-ep-consistency-fixes/plan.md` 全部修复（7 个任务，每个均经独立评审）：

| 问题 | 修复内容 | 状态 |
|---|---|---|
| A1-A6 双轨投影断裂 | assetRef 声明段/cogen 索引/关键帧反查/平面图判定全部改走 getEffectiveData 投影；名字匹配统一 normalizeBindingName | ✅ |
| B videoPath 双轨判定 | 新增共享判定模块 services/shot-video-readiness.ts，stage-gate / ep-agent ×2 / timeline-builder 四处统一双口径，superseded 过滤与导出器对齐 | ✅ |
| C1-C4 links 维护 | 新增公共重建函数 narrative/storyboard-dialogue-links.ts；批量路径补写、手动编辑同步、场景重写重建、字幕均分剔除已承接 | ✅ |
| G1 换装回退 | addAdditionalMain 补 fallbackToReferenceCapableModel | ✅ |
| G2 派生丢背景 | gallery-derivation service 侧自解析 storyBackground（显式传入优先） | ✅ |
| V1 provider 守卫 | 新增 subjectReference 能力声明，assetRef 路径对不支持的 provider 明确报错 | ✅ |
| S1/S2 生成失败保护 | scenes 空抛错；三入口接入 callAIWithContinue；mergeContinuationResponse 修正双份 JSON 缺陷（顺带闭环第三批 S9） | ✅ |

顺带修复：M4（重复 dialogueIds 键，typecheck 红）；adapter-factory capabilities 改 merge 语义；修复在途 A3 工作遗留的 5 个测试 fixture。

未修（第二/三批，按优先级排期）：S3（dlg_ id 撞主键）、M1（cogen 删插同事务）、M2（旧单场景路径删旧）、M3（String(undefined) 致 cogen 必败——建议第二批最优先）、E1、V3、D1-D3、X1-X4。终审 deferred minor 分诊见 .superpowers/sdd/plan/progress.md 与终审报告。
