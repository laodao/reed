# 剧集制作一致性修复 · 跨批次深度总评审

> 日期：2026-10-05
> 范围：fc54dab2 → 5f67ce2f（四批、约 25 任务，跨 feat/story-room 与 chore/upgrade-electron-44）
> 基线：506830ac；全量 diff 81 文件 +9733/−670（含约 158 个新增测试用例）
> 方法：对照审计报告四大主题 + 四批台账 ruling/deferred，俯瞰核对闭环与组合语义，不复读逐任务结论

---

## 一、总体评价

四批修复在工程质量上是连贯且克制的：四大系统性断裂主题中 A/B/D 已实现真正的「收口式」闭环（各自落了一个共享判定模块并统一了所有消费方），C 主题主链路闭环但留了两条已知尾巴；跨批次最大的组合风险（links 失败语义 × 事务化 × 悬空过滤）在第四批终审时被主动捕获并修复（C-1 串行门冲突），说明评审机制本身是有效的。当前遗留的系统性问题主要不在「修过的」地方，而在：① links 失败策略在四条写入路径上出现了新的三分裂；② 一批 deferred minor（M5/G3/V2 等）恰好都落在用户日常使用的高频路径上，「一致性」体感还会被它们持续侵蚀；③ 需要真实 AI/ComfyUI 的生成链路仍零端到端验证，且当前工作树因 Electron 44 的 better-sqlite3 ABI 不匹配，DB 依赖单测整体跑不起来——测试防线此刻在本机是失守状态。

## 二、四大主题闭环核对

### 主题 A：双轨投影 —— 基本闭环（1 条已知漏缝）

A1-A6 全部落实：assetRef 解析（asset-ref-resolver.ts）、cogen 索引（storyboard-cogen.service.ts:339-390）、关键帧反查（keyframe-generation.service.ts 的 buildCharacterNameIndex）、平面图判定（main-image-generator.service.ts:333）、名字归一化（script-generator.ts:477）全部改走 getEffectiveData / normalizeBindingName。

漏网环节（第一批 deferred minor，仍未修）：
- `storyboard-cogen.service.ts:648,696,738` —— resolveXxxBindings 的 findByName 兜底仍裸读 `standaloneDescription ?? overrideDescription`。linked_lw 资产经 alias/候选名命中索引后，注入 cogen 上下文的描述为 null → 与 A4 同型，只是入口更窄（仅按名兜底路径）。
- `enrichBindingIfThin` 对 linked_lw 资产写 `standaloneDescription` —— 写的是投影不会读的列，富化结果对 linked_lw 无声丢失（第一批台账已留痕）。
- `readiness.service.ts:128-131` 名字展示仍用 `overrideName ?? standaloneName`（仅展示用途，影响轻微）。

判定：**主消费链闭环，兜底链有窄缝**。linked_lw 项目仍会偶发「描述注入为空」，但不再是主路径。

### 主题 B：videoPath 双口径 —— 完整闭环

`services/shot-video-readiness.ts` 单点定义「分镜自身 videoPath 或所属非 superseded 片段 completed+videoPath」，stage-gate（⑤ 判定+completed 硬锁）、ep-agent-deps、ep-agent-actions 批量筛选、timeline-builder 四处全部接入；superseded 过滤与导出器对齐。抽查 `stage-gate.service.ts:413-424` 与 `timeline-builder.service.ts:106-114` 口径一致，测试（shot-video-readiness.spec 9 例、stage-gate.service.spec）覆盖正常。**无漏网消费方。**

附注：M9（cogen 新分镜 segmentId=null 无自动 recompute）被第三批 agent 批量路径的「孤儿分镜检测→自动 recompute」（ep-agent-actions.ts:1340-1351）与前端 autoEnsureSegments 双侧对冲，实际不可达原缺陷。

### 主题 C：links 维护 —— 主链闭环，两条尾巴 + 一个新分裂

C1-C4 全部落实：公共重建函数 storyboard-dialogue-links.ts 落位，批量/单场景/手动编辑/场景重写四条路径接线，字幕均分剔除已承接对白（subtitle.service.ts:171-209），B3 补了悬空 id 过滤（FK 崩溃路径消除）。

未闭环：
- **C5**（cogen O2 增量跳过只查 characterId，`storyboard-cogen.service.ts:518-524`）——老数据场景 links 缺失时，重跑 cogen 因「分镜已合格」被跳过，links 永远补不上，这些场景字幕永久停留在均分。修复成本极低（跳过判定加一条 links 存在性检查），建议随手收掉。
- **C6**（旁白无 narrationId、无承接校验）——prompt 约束 13 仍声称旁白也要有镜头承接，但 schema/校验/落库均无对应字段，仍是「虚假承诺」。

新分裂（跨批次交互产物，详见第三节 P1）：links 失败策略四条路径三分叉。

### 主题 D：字幕时间轴 —— 闭环（1 处预览口径备注）

D1（buildExportSubtitleTimeline 与 xfade offset 同源，episode-mp4-exporter.service.ts:497-590）、D2（endSec 补 startOffsetSec，subtitle.service.ts:256）、D3（旁白音频移到对白之前，与字幕显示一致）全部落实，纯函数有单测。

备注：`ep:preview-subtitle`（compose.handler.ts:137）仍基于展示时间线出 SRT，与烧录口径（导出时间线）不同——UI 预览与最终成片字幕可能有亚秒级差异。可接受（预览的是内容不是时码），但值得在 UI 上标注或后续统一。

## 三、发现的系统性问题

### P1【中】links 失败策略四条路径三分叉（跨批次交互产物）

B2 事务化把 links 重建并入了删建事务；B3 加了悬空 id 过滤；用户 191a6f38 引入了「links 失败降级（吞错+warn）」；第四批终审 C-1 保留了用户的降级语义并修了串行门。组合结果是四条写入路径三种失败语义：

| 路径 | 位置 | links 失败语义 |
|---|---|---|
| cogen replaceSceneStoryboards | storyboard-cogen.service.ts:912 | 吞错+warn，分镜照常落库（无 links） |
| 单场景旧路径 | storyboard.handler.ts:366 | 抛错 → 整场事务回滚 |
| 批量旧路径 | storyboard.handler.ts:484 | 抛错 → 该场景回滚 + failedScenes |
| update-storyboard / 场景重写 | storyboard.handler.ts:266 / scene-binding-writer.ts:519 | 吞错+warn |

后果：同一个真实 DB 错误，走 cogen 生成 → 分镜落库但字幕退均分（用户只看到字幕错位）；走旧路径生成 → 整场景生成失败（用户看到报错）。**同一故障两种用户体感**。考虑到 B3 悬空过滤已消除最可能的失败源（FK），剩余失败源只有真实 DB 错误，发生率低，但策略分裂本身是新的不一致——links 是可由 `storyboards.dialogue_ids` 重建的投影，正确语义应该是四路径统一「降级+warn+可重试」，而非旧路径赔上整个生成事务。建议：统一为降级语义（旧路径去掉事务内 links 失败回滚），并把 links 缺失面纳入 readiness 或字幕预览的可见提示。

### P2【中】X3 作废与在途视频任务回写存在顶回窗口（deferred 但生产可达）

`invalidateStoryboardVisuals`（storyboard-cleanup.service.ts:50-104）清 videoPath、置 pending、supersede 片段；但若该分镜/片段恰有在途生成任务（status=generating 由 V6 守卫保留），任务完成后轮询回写会把 videoPath 重新写回已被人工编辑过的分镜——**新画面内容 + 旧内容视频**，正是 X3 要消灭的状态。B4-Task4 台账已 deferred（归 V7 管辖）。触发条件：编辑分镜画面时该分镜正在生成视频——窗口窄但非零，且发生后 readiness/gate 全部按「有视频」放行，无任何信号。建议回写侧加版本校验（taskId 启动时记录 frameDescription 摘要或写回前比对 status）。

### P3【低】X3 → B3-Task4 闭环可达性核验通过，但单镜路径仍是旧口径

核对结论：X3 supersede 片段后，agent 批量视频的 preview 排除 superseded → 该分镜判为孤儿 → 自动 recompute → generateForSegment 重生成，闭环**可达成**（ep-segmentation.service.ts:164-166 的 `!keptIds.has(s.segmentId)` 正确把 superseded 段分镜纳入重切）。但显式指定 storyboardId 的单镜路径仍走 VideoSegmentService 旧单镜逻辑（无关键帧时对 H3 必败的 V3 原缺陷在单镜显式调用时仍在）——属规格内取舍（显式调用=用户自担），不阻断。

### P4【低】手工 insert 与 repository 的字段镜像无 parity 防线

insertStoryboardIn（storyboard-insert.ts）逐字段镜像 StoryboardRepository.create 的默认值口径（frameImage:null、transitionType:null、status:'pending'…），三处调用点已收敛到这一个 helper——抽取本身是对的。但它是**手工镜像**：repository 未来新增列/改默认值时，没有任何测试会红。建议补一个「insertStoryboardIn 与 repository.create 产出列集 parity」的断言测试，低成本防漂移。

### P5【提示】测试基础设施在本工作树已失守（非代码回归）

Electron 44 升级后 node_modules 的 better-sqlite3 被重建为 NODE_MODULE_VERSION=149，而 vitest 的 Node 需要 137——当前 `npx vitest run` 下所有 DB 依赖单测（约占 ep 模块的一半）全部 ERR_DLOPEN_FAILED。实测：ep 两目录 125 个 spec 中 71 个失败、502/1053 用例红，全部是 better-sqlite3 ABI 错；纯逻辑 spec（shot-video-readiness 9/9、cogen 校验/script-generator 30/30）正常。台账里各批的「全绿」记录是在 ABI 匹配的环境下取得的，当前不可复验。需要 `npm rebuild better-sqlite3`（或 electron-rebuild 与 vitest 双轨二进制管理）恢复防线，否则后续批次失去本地验证能力。

## 四、残留高危项 TOP5（用户可感知影响 × 触发频率）

### 1. V2 参考板成员缺图编号错位（影响高 × 频率中高）
触发场景：多资产片段走 assetRef 拼板，某一资产主图生成失败/缺图时，拼板 worker 对幸存成员重排 slot，但声明段「N号=名字」与正文标注仍用原始下标（reference-board.service.ts:75-91 vs segment-video.service.ts:293-294）→ 编号与色块错一位，模型把 A 的脸贴给 B，且无任何报错。这是「人物张冠李戴」类一致性事故的现存直通路径。建议：声明段/标注改从拼板结果的实际 members 数组生成编号，单一事实源。

### 2. M5 地点/物品描述被服饰关键词反复覆盖（影响中高 × 频率高）
触发场景：每次 cogen 生成，`isDescriptionThin`（storyboard-cogen.service.ts:566-571）用角色服饰词 `/[衣袍裙衫装服]/` 判定所有类型资产——地点/物品描述天然不含服饰词，被判「过薄」后每个场景生成都可能被 AI 新描述覆盖（描述 churn），后续场景的 cogen 上下文、派生图 prompt 全部跟着漂。这正是「一致性漂移」的持续制造机。建议：过薄判定按资产类型分词表（地点用空间/陈设词，物品用材质/形态词），或地点/物品不做服饰词判定。

### 3. G3 stripSystemConstraints 正则表过时（影响中 × 频率高）
触发场景：用户在资产编辑框手动改 prompt 后保存——2026-09-21 之后新增的系统段（时代背景、设定锚点、古风后缀、无人约束、构图锚、平面图变换、物品约束）不被剥离，被固化进「用户内容」列；下次生成时系统段再拼一遍，prompt 滚雪球变长、约束串 slot（asset-identity-prompt.ts:199-219）。每次手动编辑资产 prompt 都会累积。建议：系统段统一打标记（如 `⟦sys:…⟧`）或 stripSystemConstraints 与拼装器共用段清单常量，单一事实源。

### 4. S7 覆盖度校验 haystack 混入剧本正文（影响高 × 频率中）
触发场景：AI 把对白写进正文但漏进 dialogues JSON——覆盖度校验的 haystack 含正文，照样判「覆盖」（script-generator.ts、script-coverage.ts:53-57）。这条双保险正是为「丢对白事故」建的，却在它最该拦截的场景失效；每次剧本生成都在裸奔。建议：haystack 只用 dialogues 合成，正文不参与；首尾 8 字容错收紧为「必须命中 dialogues 条目」。

### 5. V5 时长口径断裂（影响中高 × 频率中）
触发场景：项目把分段预算调到 >15s，或单镜 duration>15s——分段预算上限 30s（segment-planner.ts:25）而 ComfyUI H3 maxDuration=15（comfyui-video.provider.ts:85），prompt 声称「总时长约 30s」、产物只有 15s；`capabilities.maxDurationSec` 全链路无消费方，预算切分时不知道 provider 上限。模型把 30s 的内容规划压进 15s，节奏失控、尾镜丢失。建议：recompute/切分预算取 `min(项目预算, provider maxDurationSec)`，prompt 时长声明与发送参数同源。

候选未入前五：C5（cogen 跳过致 links 永不回填，字幕均分残留）、V7（75min 超时后远端成品永久丢失、非 comfyui 恢复复位 error）、K4（视角映射死代码——但关键帧路径默认停用，频率低）、G5（故事锚点双源——G2 修复后 service 侧自解析与 renderer「当前集」仍可矛盾）。

## 五、测试防线评估

**新增覆盖（约 158 个用例 / 38 个 spec 触及）：**
- 事务防线是最大亮点：M1/M2/S4/S5/批量 per-scene 事务化全部用 SQLite trigger 模拟真实失败源验证回滚（而非 mock 断言调用次数），E1 延后删除有专门 spec（keyframe-cleanup-deferred）。
- 数据链路：links 全生命周期（C1-C4+悬空过滤）、X2/X3 级联作废、M3 对白 id 回填、S3 id 重发。
- 口径统一：stage-gate/readiness/shot-video-readiness/agent 筛选均有针对双口径的用例。
- 纯函数：D1 时间轴重建、mergeContinuationResponse、cogen 校验含对白全覆盖。

**没覆盖到的：**
1. **真实生成链路零端到端**：所有 AI/图像/视频调用均 mock，本次四批无任何 tests/e2e 改动。assetRef 三段式对真实 ComfyUI H3 的行为、参考板拼板、xfade 合成、SRT 烧录与成片的对齐，全部没有自动化验证——D1-D3 的修复只有纯函数级证明，「成片音画字三者对齐」这个最终承诺没有端到端守门员。
2. **防御性代码零覆盖**：reassignCollidingRefIds/remapRefIds 在当前 PK 约束下结构性不可达（B3-Task1 台账自述）；E1 批量路径延后删除无直接测试。
3. **新公共模块的部分间接覆盖**：appearing-assets、insertStoryboardIn 靠 stage-gate/handler spec 间接覆盖，无针对自身边界（空集合、异常输入）的专测。
4. **renderer 侧薄弱**：failedScenes/skippedScenes 的 ElMessage 提示（storyboard.store.ts）无测试；「批量部分失败」的完整用户路径（后端回滚 → store 提示 → 用户重试）无人验证。
5. **本机防线失守**：P5 的 ABI 问题使约半数 DB 单测当前不可运行——防线的「存在性」和「可运行性」此刻分离。

## 六、结论

**这次开发达到了「系统性断裂主题闭环」的目标，但距离「高一致性」还差三层。**

已达成：四大主题中 A/B/D 以共享模块收口、消费方全量统一，是教科书式的「消除口径分裂」修法；C 主题主链闭环；事务/E1 工程防线成体系；跨批次组合风险（C-1 串行门）被终审机制捕获。diff 中几乎每个非平凡决策都留了注释与台账 ruling，可溯性极好。

还差的三层：
1. **策略统一层**：P1 的 links 失败语义三分叉是「逐批局部最优」叠加出的新不一致，需要一次小规模的策略收敛（建议统一降级 + 可见化）。
2. **高频残留层**：TOP5 中的 V2/M5/G3 都落在用户每次生成/编辑的必经路径上，它们不修，「一致性仍有问题」的体感不会消失——建议按 V2 → M5 → G3 顺序排第五批（S7/V5 可并入），C5 顺手收。
3. **验证层**：生成链路的端到端验证（至少一条「mock provider 但走真实 DB+真实 ffmpeg 合成+SRT 对齐断言」的集成用例）和本机测试基础设施修复（P5），否则后续批次的「测试全绿」会越来越依赖不可复验的历史记录。

---

### 附：本次评审方法与可复验证据

- 全量 diff：506830ac..HEAD（81 文件，+9733/−670），源码部分逐块通读，测试部分按 spec 清单核对覆盖面。
- 实测：`npx vitest run tests/unit/episode-production tests/unit/core/platform/episode-production` → 71/125 spec 失败（全部 better-sqlite3 NODE_MODULE_VERSION 149 vs 137 ABI 错）；纯逻辑 spec 单独跑 9/9、30/30 绿。
- 工作区状态：ep 相关路径无未提交改动；仅 outputs/ 下若干无关未跟踪文件；stash@{0} 含第三批环境事件的抢救副本（用户 pop 时可能与已提交内容冲突，台账已留痕）。
