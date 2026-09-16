# 剧集制作 深度对抗 Review 登记（2026-09-16）

来源：4 路并行 subagent 对抗 review（Agent 面 / 提示词质量 / 渲染合成管线 / 完成度与接线），关键 P0 均经主会话亲自复核。评审基线 = feat/story-room 工作区（含未提交改动）。

用户标尺：**高质量、基于 agent 的视频制作功能；工具要完善；系统提示词质量要高。**

## 总体判断

- 无声核心链（文本→剧本→场景→分镜→关键帧→片段视频→时间线→MP4）：约 **75%**，可跑通。
- 对照"agent 全程驱动 + 有声成片"的产品标尺：约 **55–60%**。
- 一句话：**生成段可信、agent 化只覆盖前半程、合成导出是最脆弱环节、产品接线层大面积断裂。**

## 一、Agent 化程度（核心差距）

### 工具面完成度 ≈ 30–40%

已有 10 工具（ep-agent-tools.ts:103-134）：generate_script / split_scenes / generate_storyboards / 三类资产主图 / update_entity / delete_entity / query_database / ep_confirm_choice。

**已存在但 agent 不可达的生产能力**（均非死代码，有活入口）：

| 环节 | 服务入口 |
|---|---|
| 分镜缩略图 | KeyframeGeneratorService.generateStoryboardImage(s)（keyframe-generator.service.ts:42,128） |
| 关键帧 | KeyframeGenerationService.generateKeyframesForStoryboard/regenerate（keyframe-generation.service.ts:224,317,500） |
| 视频生成全套 | VideoGenerationService.generateVideo + segment/segmentation/planner（video-generation.service.ts:82） |
| 对白/旁白 TTS | DialogueSynthesisService / NarrationSynthesisService（render/audio/） |
| BGM/场景混音 | BgmService.pickBgmForScene + scene-audio-orchestrator |
| 时间线/字幕/转场 | TimelineBuilderService / SubtitleService / transition.service |
| 合成导出 | EpisodeMp4ExporterService.exportEpisodeToMp4（episode-mp4-exporter.service.ts:125） |
| 全景图/音色绑定 | PanoramaGeneratorService / VoiceAssetService.bindToCharacter |
| 场景润色/剧本追加/绑定修复 | scene-polisher / script-append / script-binding-fixer |
| 阶段门诊断 | StageGateService 六阶段 gap（stage-gate.service.ts:136-145） |

→ agent 当前实为「剧本分镜资产助理」。**阻断级缺口按序：①关键帧 ②视频 ③配音音频 ④合成导出**——缺这四样 agent 无法交付任何成片。

### P1（agent 面）

- **P1-AG1 审批卡 30min 超时 vs 流空闲看门狗 300s 竞态**（已复核）：EP 未传 streamIdleTimeoutMs（缺省 300s，loop.ts:472,879），ep_confirm_choice 挂起期间 fullStream 无事件→300s 被判 idle 可重试→重试撞「同 scope 单卡」断言（approval.ts:143-145）→denied 收场+coordinator 被 finally 删除→用户晚到的选择静默丢失（decideChoice 返回 false）。修复：EP 宿主设 streamIdleTimeoutMs:0 或审批等待豁免。
- **P1-AG2 query_database 基本不可用**：harness 提示词/快照均无数据源名单（旧三段式有，ep-agent-context.ts:66-69），模型无从枚举 dataSourceId。修复：快照注入名单。
- **P1-AG3 agent 动作路径删旧建新非原子**：executeGenerateScript/SplitScenes/GenerateStoryboards 先 delete 后另起事务（ep-agent-actions.ts:255-260,331-336,381-404），中途失败永久丢旧场景/分镜；0914 的事务原语 createScenesWithBindingsIn 未用到 agent 路径。
- **P1-AG4 未接 rawTranscript**（39 号 P0-2 在 EP 侧漏接，ep-agent-harness.service.ts:337 只传 3 项）→ EP 轮次原始流水 0 行，不可回放审计。
- **P1-AG5 跨轮上下文单薄**：600 字符一刀切截断（harness:46）、assistant actions/suggestions metadata 整体丢弃、无滚动摘要（对照 room-session.ts:472-520）。

### P2（agent 面）

- **P2-AG1 快照闭包捕获一次、轮内不刷新**，且丢 synopsis（deps 读入 harness 不展示，旧路径 epStateToSummary 有 50 字梗概，迁移时丢失）；快照无资产"已有图/无图"标注→模型无法执行"别重复生成"纪律。
- **P2-AG2 频控冲突**：资产生成每轮限 1（ep-agent-tools.ts:32-34），"给所有角色生成定妆图"必被拦且 hint 误导（"请改用其他方式"但不存在其他方式）；失败也计数。
- **P2-AG3 名字幻觉静默建资产**：generate_*_asset 找不到名字即 createStandalone（ep-agent-actions.ts:505-537），与提示词纪律4、与 update/delete 严格拒绝语义不一致。
- **P2-AG4 记忆召回语料污染**：recallText 用整段快照（harness:304），story-room 已判定为污染源并改只用 message（room-session.ts:342-345），EP 未跟进。
- **P2-AG5 EP 无结构化知识提供方**（通道A 恒空，仅 longwriting 有图谱 provider）。
- **P2-AG6 query_database 残余面**：函数级副作用未拦（setval/lo_import/pg_read_file/dblink）；数据源全局共享不做用户过滤 + name→id 兜底 = Web 多租户越权读面。
- **P2-AG7 双轨并存**：旧三段式 EP_AGENT_HARMS='0' 仍活（agent.handler.ts:26-28 分叉），其 lwDesignMessages.add 不传 projectId 与 harness 租户写法不一致；getHistory/getState 常态经旧服务。ep-agent-context.ts 仅旧路径消费。
- **P2-AG8 harness 主链路零测试**（现有单测全打旧三段式与工具注册）。

### 系统提示词改进建议（快照+纪律）

1. 快照补：梗概 50-80 字、资产"已有主图/无图"标注、场景-地点绑定缺口、当前 stage + stage-gate gaps、数据源名单。
2. 补纪律：成本配额话术（每轮资产生成上限、分轮执行）、风格锚点沿用（style-presets 全链路不可见）、跨集一致性（优先复用资产勿新建）。
3. 长轮次在工具调用后步边界重算快照（短期：提示词声明"快照为轮初状态，以工具结果为准"）。
4. 历史分级截断 assistant 4000/user 600（对齐 room-session），保留 actions 摘要首行。

## 二、提示词质量

打分：narrative **6/10**（工程兜底全仓最扎实，被破坏性解析器拖累）、资产 **7.5/10**（约束收口最好）、关键帧 **5.5/10**（一致性机制未闭环）。

### P0

- **P0-PR1 破坏性 JSON 清洗器**（已复核）：ai-call.ts:292-303 parseJsonString 把值内中文引号替换为未转义 ASCII 引号（对白"你好"必炸）、`//.*` 剥离值内 URL（http://→http:）；script-generator 的 parseScenesJson **首选即走此清洗**（script-generator.ts:552-553→705），场景 JSON 解析失败静默返回 []（:703-713）仅 warn——结构化场景静默丢失。修复：清洗降级为 parse 失败后的补救路径，注释剥离仅限行首。
- **P0-PR2 callAI 无 temperature/JSON mode**（ai-call.ts:112-118）：结构化抽取与自由创作共用 0.7（openai-compatible-provider.ts:284），格式抖动是下游四层解析+两条救援路径硬扛的根因。修复：JSON 任务 0.2-0.3 + 可选 response_format。

### P1

- **P1-PR1 运镜枚举三套打架**：storyboard-generator.ts:806-809 喂 AI 的 25 预设 vs camera-movements.ts:29-62 实际预设大面积对不上，:104-118 批量提示词第三套；输出只查 typeof 不校验枚举（:917）→非法值入库丢 promptHint。修复：以 camera-movements.ts 为单一事实源+白名单校验。
- **P1-PR2 用户正文无隔离围栏**：script-generator.ts:886-889/940-942 裸 .replace 拼 chapterContent（自家 fillPromptTemplate 注释明令禁止 $& 特殊模式）；正文出现"【场景数据开始】"可伪造契约段。统一走 fillPromptTemplate+定界符。
- **P1-PR3 分镜失败静默丢弃**：单镜失败仅 console 后继续（storyboard-generator.ts:648-651）无重试无补漏；批量路径对话 ID 靠 AI 编造不过白名单（:471 vs :582-596）。
- **P1-PR4 关键帧链式策略未物理闭环**（两个 subagent 独立发现，交叉证实）：keyframe-chain-strategy.ts:8-18 宣称末帧参考首帧，但 generateOneKeyframe 参考图只来自资产变体（keyframe-generation.service.ts:754-781），referenceFrameIndexes 全链路无人消费；帧间漂移仅靠一句中文口号（keyframe-prompt-builder.ts:335-338）。
- **P1-PR5 风格体系割裂**：关键帧 5 个英文 PRESET_STYLES（keyframe-prompt-builder.ts:52-78）≠ 项目 20 个中文 styleAnchors（style-presets.ts:18-39），pickStyle 默认 cinematic 无任何映射点→资产→关键帧画风漂移是制度性的。

### P2

- P2-PR1 "威胁式强调"三份重复、"10 年经验"人设 5 处（script-generator.ts:204-208,282-288,365,408）。
- P2-PR2 middle 帧时刻语言通用化不随镜头内容变（keyframe-chain-strategy.ts:142-146）。
- P2-PR3 VLM 单帧推断运镜方向靠猜（vlm-shot-inferrer.ts:40-47,72-73 注释自认），无"无法判断输 static"出口。
- P2-PR4 实体抽取标准自相矛盾（角色"不要遗漏任何"vs 地点物品按复现筛选，lw-entity-detection.service.ts:329-347）+贪婪正则裸 parse 失败静默返回空（:361-367）；正文截断 4000 字（:303）。
- P2-PR5 续写 {existingScriptContent} 全文注入无预算（script-generator.ts:345-351）。

### 与长文 skill 基准差距

无设计-自检闭环（长文：设计卡→自检→门禁→动笔）；场景 schema 无 beat/cliffhanger 字段承载节拍方法论（writing-methodology.ts:44-53 的钩子/爽点/卡点）；续写无跨单元约束（上一场状态/下一场去向）；分镜方法论硬编码在 951 行文件两份提示词字符串里（违背本仓 skill 数据化纪律）。已有追平点：buildScriptGenerationDiscipline 的黄金三秒/台词≤20字/切在问题上属合格短剧方法论；景别运镜术语核对无误。

## 三、渲染合成管线

### 0914 已修项核实

| 项 | 判定 |
|---|---|
| 音轨探测/anullsrc 占位 | **部分修**：链路齐全但占位写死 44.1kHz → 见 P0-RD1 |
| fps 归一/SRT 泄漏/ffmpeg 超时 | 真修（exporter:315-318,203-212；startup-recovery:87-96；runner:86,163） |
| 关键帧先删后生成/旧图回收/原子计数 | 真修（keyframe-generation.service.ts:271-313,378-397,459-463） |
| 视频假超时/后台回写/崩溃恢复 | 真修，两处口子：①storyboard generating 复位空转（单镜路径全程不写该状态）②回填只写 videoPath 不写 duration → P1-RD3 |
| scopedTx 收编 | 部分修（知情遗留）：render/compose 关键路径仍裸 ds.getRepository 按 id 读写（keyframe-generation:168-176,455-463；timeline-builder:89-91；subtitle:55-57；exporter:240-243） |

### P0

- **P0-RD1 混合音轨导出必败**（已复核）：buildSilentInputSpecs 写死 `anullsrc=r=44100:cl=stereo`（episode-mp4-exporter.service.ts:367）与真实音轨（典型 48k）进同一 concat（:354）→ 采样率不一致滤镜图初始化即败——恰是 0914 修复目标场景（volcengine 无音轨 + bailian 有音轨混排）。修复：aresample 统一后 concat。

### P1

- **P1-RD1 Windows 导出必败**：runner 用 `which` 探测（runner.ts:37，Windows 无此命令）→兜底 2018 nightly binary 自认不支持 xfade（:29-31 注释）；assembler 与 runner 两处 setFfmpegPath 互相覆盖（assembler:18，当前 import 序巧合后胜）。
- **P1-RD2 字幕时间轴必漂移**：SRT 基于全量 timeline（exporter:174-182，含 includeInFinal=false + 不扣 xfade 重叠），画面按入选分镜扣重叠（:136-147,332-345）→从首个差异点持续漂移。
- **P1-RD3 单镜 AI 视频不回写实际 duration**（video.handler.ts:311,325,354 只写 videoPath）→timeline 用声明时长算 xfade offset（:331-345）→转场处冻结/黑屏（video-segment.service.ts:140-151 已注释此坑但单镜路径没同步修）。
- **P1-RD4 片段制导出硬阻断**：任一 shot 带 segmentId 即进片段合并模式（exporter:235），seg.videoPath 空即整体抛错（:151-160）——先单镜出全部分镜、后点 recompute-segments 即永久阻断，已出片不被利用。
- **P1-RD5 音频 concat 与视频 xfade 时长口径不一致**（exporter:351-354 vs :332-345，无 -shortest/acrossfade）→每转场累积 0.5s 音画错位、片尾音频超长。

### P2

- 同一 taskId 双轨并发轮询双重下载竞写 videoPath（video-generation.service.ts:217 + video.handler.ts:342）；getTaskStatus 恒 pending stub（:424-430）。
- 旧视频产物零回收（video-segment/segment-video 更新 videoPath 均不删旧文件；重生成即磁盘泄漏）。
- 关键帧并发 TOCTOU：frameIndex 无唯一索引，regenerate 先建后删崩溃留重复帧（keyframe-generation.service.ts:354-369,518-524）。
- 导出无进程内互斥（compose.handler.ts:85-125）；recompute 可删 generating 段而 30min 轮询回写对已删行静默 0 行（ep-segmentation.service.ts:118-125）。
- 字幕小缺陷：shotNumber-1 切片在删镜头后错位（subtitle.service.ts:146-152）；毫秒进位可产出 `59,1000` 非法 SRT（:189-196）。
- 三轨视频 service 均有活调用方非死代码，但修复覆盖不均：旧轨 ep:synthesize-scene-video（EpisodeProductionPage.vue:403）仍是无音轨探测的前 0914 实现。

### 结论

**分镜→关键帧段经 0914 修复后可信；合成导出段存在 1 个 P0 + 5 个 P1 确定性缺陷；"生成能力可信、一键出片不可信"。**

## 四、完成度与产品接线

### 关键前提：活路径只有一条

产品入口 EpisodeHome → EpisodeProjectListV3 → EpisodeCreator → **EpisodeStudio**（/studio/:episodeId，4 tab：剧本/资产/分镜/合成 + 右侧 Agent）。旧 6-stage 工作台 **EpisodeWorkbench.vue（932 行）+ stage-content-script-v3/stage-storyboard-v2/stage-production-v2/stage-compose-v2/stage-script 视图族 + EpisodeAgentStudio.vue（469 行）全部不可达**（无任何 router.push 指向，已复核）。

### P0

- **P0-CM1 成片无声音**：TTS 后端真实现（scene-audio-orchestrator+DashScope，ep:generate-scene-audio-v3 已接线），但 exporter 只 concat 分镜自带音轨（exporter:165-190,353-354）不接 TTS 产物；AudioPanel 唯一嵌入点在不可达视图（StageStoryboardViewV2.vue:797）→活路径无配音入口、成片无对白旁白。
- **P0-CM2 状态机空转**（已复核）：7 态定义完整（episode-status.machine.ts:23-52）但全仓只写 pending（video-episode.repository.ts:138,175）与 scripting（script.handler.ts:489、ep-agent-actions.ts:264）；**composedVideoPath 列不存在于任何实体/建表**，stage-gate 读 `(ep as any).composedVideoPath`（:425）恒 undefined→合成进度恒 0、项目卡恒 35%、completed 终态死路径。
- **P0-CM3 quick-mode 0% 空壳**：orchestrator.service.ts:65-105 泛化 step runner 无实例化方、无 steps 注入；EpisodeListPanel emit 'open-quick-mode' 无监听且宿主本身是死代码。

### P1

- **P1-CM1 定稿硬关卡被绕过**：StageContentScriptView.vue:898-912 直调 updateScript 置 approved 无校验（script.handler.ts:82-102）；校验器唯一 UI 调用方 ScriptCompletenessPanel 在死目录。
- **P1-CM2 EntityEditDialog 全实体保存恒失败**：updateUploadedEntity 硬检查 sourceType==='uploaded'（uploaded-entity.service.ts:174-177，已复核）但 2026-05-08 起全部创建为 standalone→资产快捷编辑按钮恒报"保存失败"。
- **P1-CM3 stage-gate 整体被旁路**：use-workbench-stage-navigation.ts:62-74"任意 stage 可直接进入"；457 行门禁服务只剩 progress-calculator 消费且因 P0-CM2 输出失真。

### P2

- asset.store 失败伪装空列表仍未修（asset.store.ts:437-447，0914 登记项核实未动）。
- BGM 是 stub（bgm.service.ts:5）。
- agent 审批挂起卡刷新即丢：ep:agent:state / ep:agent:list-pending 通道已注册但前端不消费（agent.handler.ts:44,62）。

### 死通道清单（preload 暴露 + handler 注册，前端 0 调用）

ep:get-uploaded-entity、ep:delete-uploaded-entity（0914 登记仍在）、ep:agent:state、ep:agent:list-pending、ep:list-episodes-with-progress、ep:resolve-reference(-batch)、ep:validate-scene、ep:preview-subtitle、ep:set/get-storyboard-background-ref（StoryboardService 仅有的两个方法）、onStoryboardsProgress 监听器。

死代码：EpisodeWorkbench.vue + stage-* 视图族、EpisodeAgentStudio.vue、EpisodeListPanel.vue、AIQuickModeWizard.vue、stage-script/ 目录、quick-mode/orchestrator.service.ts。

## 五、修复优先级建议（待拍板）

**第一批（决定产品成立）：**
1. agent 补后半程工具：generate_keyframes / generate_segment_video / generate_scene_audio / export_mp4（+全景/音色绑定可选），同步升级快照与系统提示词（§一改进建议）。
2. 修 parseJsonString（P0-PR1）+ callAI temperature/JSON mode（P0-PR2）——决定一切结构化产出可用性。
3. 音频入轨：TTS 产物接 exporter + 活路径恢复音频入口（P0-CM1）；状态闭环：composedVideoPath 列 + 后段状态写者（P0-CM2）。
4. anullsrc 采样率统一（P0-RD1，一行级修复收益极大）。

**第二批（P1）：** 审批/idle 竞态、agent 删旧建新原子化、rawTranscript、运镜枚举单一事实源、关键帧链式参考接线、风格锚点打通、xfade 三兄弟（RD2/RD3/RD5）、Windows ffmpeg、定稿关卡、EntityEditDialog、死代码山清理（删或接线二选一）。

**第三批（P2/治理）：** quick-mode 决策（补实现或砍承诺）、双轨退役时间表、旧产物回收、唯一索引+互斥、死通道清理、harness 测试补齐、EP scoped 收编（0914 遗留）。
