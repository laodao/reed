# 近期功能提交全面对抗 Review 登记（2026-09-16 晚）

来源：9 路并行 subagent 对抗 review（每提交一路或按域分组 + 1 路跨提交集成），关键 P0/P1 与红灯测试均经主会话亲自复核实锤。评审基线 = feat/story-room @ 20b08134（含工作区 1 份未提交 spec 改动）。

> **修复进展（2026-09-16 晚 第二批已落地，4 提交，修复后经 subagent 二次对抗复核 + 855 用例全绿）**
> - **批1 消红**：①20b08134 滞留工作区的 D4-3 配套 spec 已补交；②ep-agent-tools.spec 计数 10→14 + 四新工具名断言；③WORKFLOW_NODE_TYPES/ConfigMap/outputSchema 补 chapter-writing（TS1360 消除，typecheck 回 887 存量基线）；④generateFullScript/续写/救援三处 callAI 补 temperature 0.3；⑤渐进恢复第 3 级换序（先转中文引号再剥注释——中文引号+URL 组合旧序必炸，node 实锤 + 回归锁用例）。
> - **批2 成片链路**：①TTS 假成功×2 修复（orchestrator 结果带 narrationFailed/dialogueFailCount；handler 全失败返 success:false、partial/persistFailed 标记；StageComposeTab 分级提示）；②滤镜图重写——单元内人声逐路归一(48k/stereo)后 concat 顺序播、再与视频轨 amix(inputs=2, normalize=0)（不再 t=0 叠音/旁白被首单元截断）；③extras 存在性+probe 双过滤（坏 TTS 文件剔一路丢一路不阻断整片）；④composing 推进后置到全部校验之后 + 失败回退 producing（WHERE status='composing' 守卫）；⑤exporter spec 补 4 用例（实体补注册后状态回写路径不再是测试死代码）。
> - **批3 长文数据完整性**：①specialRules 按归一化块去重合并（不再线性膨胀）；②upsertOutlineChapter 按章号归一化幂等（「第2章 初雪」vs「2 初雪」不再重复建章致章号错位）；③conflictKey 契约闭环（annotateConflicts 回填 key→渲染层修正消息带 key→工具 remainingList 带 key；patch 前与 scanContradictions 现存疑点比对，幻觉 key 拒绝入账，文案区分「疑点已消除」情形）；④lw_patch_chapter 幂等短路（excerpt 消失+replacement 已在正文且长度≥摘录一半→回成功不二次应用）；⑤入册去重与 R9 同口径（人物模糊匹配+墓志；地点/物品 exact 口径防跨类误吞；被拦名 warn 留痕）+ DELETE_CHARACTER 写墓志（防删除复活）；⑥lw_write_chapter 补共识账本注入+stage 模型+overwrite 透传（软收口修复，与 executor 逐字同文案）。
> - **批4 agent 硬化**：①streamIdleTimeoutMs 0→35min（保留流假死兜底，盖过审批/工具 30min 挂起）；②三个批量长工具分页（keyframes 8/video 4/audio 6）+ ctx.signal 步边界中止；③segmentId/storyboardId 本集归属校验（多租户新入口关闭）；④export_mp4 outputPath 拒绝绝对路径/..（强制导出目录内）+ schema 描述同步；⑤EP_TOOL_MAX_CALLS 配合分页放宽（6/8/4/2）；⑥D4-3 守卫补挂 insertExtraKeyframe/generateKeyframeAtIndex 两入口；⑦agent 配音假成功防线对齐 UI 口径（复核发现的修一半）。
> - **修复批自身经二次对抗复核**：14 项 13 过，发现的 1 P1（agent 端配音防线只判 narrationFailed）+ 5 P2（concat 前未归一/schema 描述/key 文案/幂等门槛/地点物品误吞）已全部当场修复。
> - **遗留登记**：①tests/unit/core/platform/workflow/ 与 agent-runtime/ 有 **9 个存量红灯**（修复验证期新发现，stash 基线确认与本批无关：tool-call spec 缺 registerPathProvider stub——tool-nodes.ts:65 自 db030bda 起依赖、gossip-event-report 断言漂移、tool-registry/trigger-scheduler 若干）待专项修；②其余 P2 未修项照旧登记（见下文 P2 摘要与「登记延续」）。

**范围：2026-09-15 之后全部 11 个功能提交**（docs/chore 提交并入保真抽查）：

| 提交 | 主题 | 评审结论 |
|---|---|---|
| fe3040db | 研讨室账本读写工具+章法收口+章节级互斥 | 机制扎实，但「收口」是软收口（4×P1） |
| fdfd8daf | llama.cpp 免密钥范式收敛 | 主体正确；提交信息失实 1 处；chat 外漏网点一批 |
| e9e507e4 | 疑点精确定位+高亮+lw_patch_chapter+新实体入册 | 链路完整，3×P1 断裂点 |
| 53cf8703 | chapter-writing 节点类型注册 | 漏 WORKFLOW_NODE_TYPES（编译错，已实证） |
| 2ffc724d | JSON 渐进恢复+temperature 透传 | 主体落地；主链路漏传 temperature（P1） |
| 63e7e112 | 状态闭环+双列迁移+P1-RD3 | 无 P0；竞态与 duration 可信度两处 P2 |
| f28b0c49 | 导出音轨 48k/xfade 对齐/TTS 混入 | RD1/RD5 修复成立；TTS 无时间锚点（P1） |
| 0c5a5fa4 | TTS 落库+配音入口 | 假成功路径 ×2（P1）——无声成片可静默复现 |
| 8a70bf6e | ep-agent 后半程四工具+快照提示词 | 10 项声称全属实；带红灯测试入库（P0）；5 处新风险面 |
| 40ae9d31 | 疑点链路冒烟修复三处 | 方向都对，不除根因 |
| 20b08134 | storyboard-asset-cogen D3-D6 | 功能真做；**带红灯测试入库（P0）**；守卫漏挂 2 入口 |

---

## P0（两个红灯测试 + 一个编译错，全部主会话实锤）

1. **20b08134 带红灯测试合入**：D4-3 空绑定守卫改变了「characterId 全空」行为（静默跳过→抛错），但配套 spec 修改滞留工作区未提交（`tests/unit/episode-production/render/keyframe-generation.service.spec.ts`，HEAD 版 :540 旧断言期望生成成功）。stash 实锤：HEAD 版跑该用例必红，工作区版 13/13 绿。**修复=把工作区这份 spec 改动补提交**；注意该文件是多会话并写区，有「被并行会话卷走」先例事故。
2. **8a70bf6e 带红灯测试合入**：工具面 10→14 未更新 `tests/unit/core/platform/episode-production/ep-agent-tools.spec.ts:73`（`toHaveLength(10)` 实际 14）。主会话亲跑：1 failed / 6 passed。**修复=断言改 14 并补四工具用例**（当前四工具零单测）。
3. **53cf8703 漏注册 `WORKFLOW_NODE_TYPES['chapter-writing']`**（workflow.types.ts:997-1004 常量表 satisfies 守卫）：联合类型有（:112）、crawl-news/crawl-links 都在表内，唯独 chapter-writing 缺席 → TS1360 编译错（仓库 typecheck 长期红灯致 CI 不可见，但违反该文件自己写下的「杜绝第二套写法」纪律）。**修复=补一行**。附带：`WorkflowNodeConfigMap` 也缺 chapter-writing 条目。

## P1（按提交）

### 2ffc724d — temperature 漏传剧本主链路
`script-generator.ts:896` `generateFullScript` 主调用无 opts 仍跑 0.7；同文件其余 4 处（992/1024/1067/1183）都补了 0.3。PR2 登记的症状（场景 JSON 静默丢失）恰发生在这条链路的输出上。**修复：:896 补 `{ temperature: 0.3 }`**。

### f28b0c49 — TTS 混入无时间锚点
`episode-mp4-exporter.service.ts:296-317,487-511`：单元内全部对白+旁白从 t=0 同时进 `amix`（全仓无 adelay），`atrim=0:len` 按首单元时长截断。后果：≥2 条 TTS 即人声叠音；整场景旁白只挂首单元且超出部分永久丢失。**修复：单元内多条 TTS 按 dialogueIds 顺序 concat 后再 amix；旁白分段或至少顺序排**。（P3 附带：amix 未设 normalize=0，4 路时音量压到 25%——注释理由「旧版 ffmpeg 不支持」不成立，能跑 xfade 的都 ≥4.4。）

### 0c5a5fa4 — 假成功路径 ×2，无声成片静默复现
- TTS 全部失败仍返回 `success:true`（narration-synthesis 内部 catch 返回 null → orchestrator 组装空结果不报错 → audio.handler:73-80 → UI 弹「配音已生成」）。
- 落库失败被完全忽略（audio.handler:60-65 注释自认「要在返回里提示」但返回体无 persistFailed 标记）。
两者都让 P0-CM1「成片无声」以静默方式复现。**修复：handler 校验 narrationPath 为空且 dialoguePaths 空 → 返回失败/partial**。

### 8a70bf6e — agent 面新风险
- `streamIdleTimeoutMs: 0`（harness:333）= **永久关闭步级空闲看门狗**（loop.ts:506 直接不布防）。纯流假死（网络黑洞）时 runTurn 永不返回、busy Map 锁死、无重试无超时，用户只能手动取消。审批豁免与长工具豁免同绑这一个开关。**修复：改为 ≥35min，或看门狗对「审批挂起中」豁免计时而非全局归零**。
- 批量长工具（keyframes:944-967 / video:1041-1062）无规模上限+超时不中止底层执行（async.ts:27 自认）：一集 40+ 镜默认全量跑，30min 超时后工具报 TIMEOUT 但底层继续烧费，用户新开轮次与后台循环并发写同一批分镜。**修复：分页（每轮 ≤N）+ abort signal**。
- `generate_segment_video` 的 storyboardId/segmentId 直通服务层全库查找（actions:1009-1031），姊妹工具 keyframes/audio 都做了本集过滤，唯独视频没有——对话注入他项目 id → 跨项目写+烧费。**修复：复刻 keyframes 的 targets 过滤**。
- export_mp4：前置校验失败也烧额度（registry:689 计数在执行前）+每轮限 1——「导出被拦→补片→再导出」合法流被 LIMIT_EXCEEDED 拦死。**修复：校验类失败不计数或放宽到 2**。
- export_mp4 `outputPath` 接受任意绝对路径（actions:1158-1165），ffmpeg 直接写入可覆盖既有文件，无审批。**修复：限制在导出目录内**。

### 20b08134 — 守卫漏挂 + 零测试
- D4-3 守卫只挂在 `generateKeyframesForStoryboard`(:264) 与 `regenerateKeyframe`(:358)，**`insertExtraKeyframe`(:508) 与 `generateKeyframeAtIndex`(:570) 未挂**——「添加/插入关键帧」入口仍纯文生图静默降级。**修复：守卫下沉到 generateOneKeyframe 统一拦截**。
- 本提交 19 文件 +1602 行**零测试**：storyboard-cogen.ts（525 行，validateCogenOutput 117 行纯函数）、cogen.service（499 行）、keyframeDimensionsForAspectRatio、project-video-params 全裸奔。

### fe3040db — 软收口与数据完整性
- **lw_write_chapter 双轨退化**（room-agent-tools.ts:995-1003）：extraPrompt（共识账本）与 options（overwrite）均未传——本提交声称修复的两个实测 bug（共识不注入、R10 重写死锁）在保留的姊妹路径原样存在。**修复：同样注入共识并透传 overwrite，或委托 runChapterWritingMethod**。
- **persistWorld specialRules 只增不减**（story-persist.ts:640）：无去重无上限，且本提交把自由键兜底放宽——每确认一张世界卡追加一次，线性膨胀且注入每章 prompt。**修复：归一化段落去重**。
- **upsertOutlineChapter 幂等匹配对「第N章 X」失效**（story-persist.ts:467）：匹配条件 `startsWith(\`${no} \`)` 撞不上向导大纲的「第2章 初雪」格式 → 同章重复节点挂卷尾 → 全文档序章号重排，resolveOutlineRef/R10/章法 chapterNo 全错位。**修复：匹配前剥「第N章」前缀归一化**。
- **互斥覆盖面不成立**：写作台 IPC（longwriting.handler.ts:1434 直调 aiService）无互斥不入 run 审计；「多实例双派发」根因（引擎无 run 属主）未触碰（设计文档 :259 自认 M1 前须修）。收口的只有「两个 lw_write_chapter_full 并发」一条路径。

### e9e507e4 — patch 链路三断裂
- **conflictKey 契约断裂**：14 个 lw_ 工具无一输出疑点 key（唯一生成函数 conflictKey() 未被工具层导入，含 msgHash 模型不可能自行算出）。省略 key → patch 成功但疑点不自动 resolved；幻觉 key → acknowledgeConflictByKey 无校验直存（conflict-gate.ts:217-238）垃圾登记且回执谎称已登记。**修复：工具收结构化 conflict 字段现算 key，或渲染层预算 key 进修正消息**。
- **patch 超时重试非幂等**：saveChapter（秒级）在前、图谱重提（分钟级）在后，withTimeout 超时只切断等待——已落库但报失败，重试命中 excerpt 下一处错位二次替换（40ae9d31 提交信息自证此路径真实发生）。**修复：开头幂等短路（replacement 已在位且 excerpt 已不存在→返回 ok）；或图谱重提挪出工具体 fire-and-forget**。
- **0b 自动入册复刻图谱污染**（chapter-graph.processor.ts:401-434）：删除复活（用户删角色→重启后旧章重提→自动加回）+ 别名重复（仅 exact 同名去重；告警端 R9 有 isKnown 模糊判定、入册端反而没有——标准倒挂）。**修复：入册前复用 R9 isKnown；删除留墓志名单**。

### fdfd8daf — 提交信息失实
声称改写「长文 ai 服务」，实际 longwriting-ai.service.ts 的 isApiKeyOptional 改写落在 fe3040db，且 fe3040db..fdfd8daf 区间该 import 悬空（编译破坏）——fdfd8daf 实为修复提交但只字未提。bisect 落 fe3040db 得假阳性。此处补勘误登记即可。

## P2 摘要（详见各 subagent 报告，择要）

- **2ffc724d**：渐进恢复第 3 级顺序缺陷（中文引号结构+值内 URL 三级全败，node 复现；先转引号再剥注释可修）；stripTrailingCommas/`\'` 替换非字符串感知（注释声称「值内不动」未兑现）；anthropic-sdk-provider 全链无 temperature；callAIWithContinue 签名无 opts（4 个调用点想传传不了）；temperature 透传零测试。
- **63e7e112**：advanceEpisodeStatus check-then-act 并发可回退（改 WHERE 守卫单条 UPDATE）；P1-RD3 duration 是 provider 自报非 ffprobe 实测（comfyui 干脆没有）；(ep as any) 读法未清；CreateSceneScriptRequest.narrationAudioPath 死字段。
- **f28b0c49**：TTS 产物缺文件/无音轨→整个导出失败（回归：以前无 TTS 能导，现在坏一路全盘崩——extras 不探测不过滤）；composing 写入先于校验+失败无人回写→卡死 ⑥ 态（7 态无 failed）；DB 侧（resolveEpisodeId/composing 写路径）spec 未注册实体=死代码覆盖；filter_complex 单 argv 有 Windows 32K 上限风险（改 -filter_complex_script）。
- **0c5a5fa4**：persistToScene 两次 repo.update 非原子+dialogues JSON 读改写竞态（scopedTx 可包）；零新增测试。
- **8a70bf6e**：P3 一批（头注释过时、空场景计入配音 done、快照 N+1 查询、单镜旧视频不回收、persistToScene 无事务）。
- **20b08134**：comfyui 图像路径像素不透传（折成 square/portrait/landscape 三档，落库却写请求值 1344×768，且 7:4≠16:9 有 1.6% 拉伸）；守卫缝隙（scene.characters=[] + 分镜级有名无 ID 时放行）；videoSteps 清空存 null、只查 >0 无上限；linked_lw 资产按名复用失效→重复建 standalone；agent 的 generate_storyboards 仍走旧生成器产无绑定分镜，撞 D4-3 守卫后两条出路（cogen/ScriptBindingFixer）都只有 UI 入口——agent 闭环断一环。
- **fe3040db**：互斥命中只报「工作流 skipped」丢 skipReason；workflow-run.service 注释与实现矛盾（holder 无 scope 放行）；mutexScope 零测试+ensure 定义「查名→无则建」竞态；prompt 预算防线整体移除无替代（账本最坏 ~1 万字×3 处注入）；beatSimilarity 短文本误顺延（「主角死亡」vs「配角死亡」0.67≥0.6）；lw_update_ledger 非法 status 静默落 confirmed；extractCharacterList 人名键摊平过宽；applyLedgerOp 仍在串行队列外 RMW；lw_write_chapter_full 不感知取消；夹带 StoryEditor/ChapterStage 纯布局重构（与提交信息六条声称无关）。
- **e9e507e4**：写作台 autosave 静默回滚补丁+saveTimers 无卸载清理；attachConflictLocations「有章号但未写」回退全章搜索（定位跳无关旧章）+对应测试假通过（手工塞空章进数组）；problem「进版本备注」承诺未兑现（saveChapter 硬编码 'manual'）；normalizeRescue 替换残留孤立引号；0b 检测 4000 字截断 vs 步骤 1 全文扫描——长章「入册了还在报」循环。
- **fdfd8daf**：收敛只覆盖 chat 链路——image.service getModels/testProvider 仍硬检查 apiKey（comfyui 免密钥却无法刷新模型列表/测连接，直接矛盾）、video-generation.service:552、voice 系列；spec 只盖 7 挡板之 1。
- **横切（A9）**：web 端 synchronize() 不建 uq_wf_run_mutex 部分唯一索引（DB 级兜底仅 electron 有）；electron 库恢复 CREATE TABLE 不含后加迁移列（存量）；scripting 两处直写绕过单调原语（制作中途重生成剧本拉回状态，存量自认）；d93c250d 前缀 docs 但夹带 video-segment.handler 代码修复（revert docs 会丢代码）；未跟踪 docs/design/2026-09-16-longwriting-structured-design.md 滞留（git clean 即丢）。

## 40ae9d31（冒烟修复三处）核验
600s 超时：数值对但根因（部分副作用+非幂等）未除（见 e9e507e4 P1-2）；canLocate 放宽：判断正确（R9 v2 漏网场景实锤），但「禁用吞点击」老病根未除；fire-and-forget：修掉阻塞，引入「先成功后失败」双提示毛刺+该入口无 busy 防重（sendMessage busy 拒绝兜底，可控）。未发现回归。

## 已核验 OK（对抗后未击穿的面）

- **横切**：11 提交在 17 个共享文件上全部加式叠层、零语义冲突；63e7e112 迁移双端注册、幂等、可重放；914 用例 0 红灯（除上述 2 个登记红灯）；b411fdef 登记与 5 个提交 diff 逐条对得上；区间内零新增死代码/死通道；episode 状态 9 处写者（agent+UI）统一走只前进原语，无回退竞态。
- **fe3040db**：mutexScope 双层（DB 部分唯一索引跨进程+应用层）语义一致、无死锁无自锁、stale lock 有 boot 恢复出口；repository 全 scoped（userId 租户注入）；账本工具输入钳制完备（title≤40/points/refs/kind 枚举）；R10 顺延/skipCurrentChapterOnlyDoubts 正则语义正确。
- **e9e507e4**：text-locate 纯函数边界全对（null vs [] 区分、cap/nth 收敛）；staleness 按 excerpt 现场重锚定设计成立；CM5 UTF-16 口径无 emoji 错位、活标记滚动自动补渲染；互斥 scope 字符串与写作端同构、findByMutexScope 走 ALS scoped——多租户成立。
- **2ffc724d**：渐进恢复阶梯顺序/降级/最终抛错正确；合法 JSON 快路径零损耗；customParams 不被 temperature 挤掉；全部消费方 fail-soft。
- **f28b0c49**：P0-RD1 修复成立（全部音源统一 aformat+aresample=48000 后进图）；P1-RD5 数学成立（Σ音=Σ视、apad/atrim 收口、asetpts 重置）；流编号三段约定与 runner 物理顺序一致且被 spec 锁定。
- **8a70bf6e**：10 项声称全部属实（含行为级收紧资产定位：ensureBinding/createStandalone 整段删除，失败列 ≤8 个现有名）；关键帧重生成是「先建新帧→全成换入+回收旧图→失败回滚保旧帧」原子式（未复刻 P1-AG3）；adapter-factory 全库唯一无双轨。
- **20b08134**：D3 设置入口/D4-1 校验重试/D4-2 落库断言/D6 全链透传均真做；纯空镜场景正确放行不误伤；cogen 替换式写库失败保旧分镜；历史项目无 aspectRatio 回退 1024²（等于旧行为）。
- **fdfd8daf**：isApiKeyOptional `=== true` 严格判定安全缺省；optional 填 key 正常透传；必填校验无绕过路径；顺手修 defaultModel→defaultModelId 真 bug。
- **53cf8703**：catalog/handler/forms 三处必填项、defaultConfig、outputSchema 逐项一致（一致性 spec 4/4 过）；执行路径真实存在非死代码；与 lw_write_chapter_full 同一执行器无双轨。

## 修复优先级建议（待拍板）

**第一批（分钟级，先消红）**：①工作区 spec 改动补提交（P0-1）②ep-agent-tools 断言 10→14（P0-2）③WORKFLOW_NODE_TYPES+ConfigMap 补 chapter-writing（P0-3）④generateFullScript:896 补 temperature 0.3。

**第二批（无声成片链路闭环）**：TTS 假成功 ×2 → TTS 时间锚点/顺序 concat → extras 文件探测过滤 → composing 卡死（校验后置+失败回写）→ amix normalize=0。

**第三批（longwriting 数据完整性）**：specialRules 去重 → outline「第N章」幂等 → conflictKey 契约 → patch 幂等短路 → 入册模糊去重+删除墓志 → lw_write_chapter 补共识注入/overwrite 透传。

**第四批（agent 面硬化）**：idle 看门狗 35min → 批量分页+abort → segment_video id 归属校验 → export_mp4 计数策略+outputPath 限制 → 守卫下沉 generateOneKeyframe。

**登记延续**：渐进恢复第 3 级顺序、prompt 预算、beatSimilarity 短文本、autosave 回滚补丁、comfyui 像素透传、web 端 mutex 索引缺失、fe3040db..fdfd8daf 区间编译破坏勘误。
