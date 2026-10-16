# 剧集制作功能全链路梳理：每一步的提示词组装与执行过程

> 基于对 `src/core/platform/episode-production/` 全部源码的逐文件阅读整理。
> 覆盖从"一句话/一章原文"进，到"整集 MP4 成片"出的完整流水线，重点是**每一步的提示词怎么拼、数据从哪来、输出怎么解析校验**。
> 文中 `文件:行号` 均可直接跳转源码。
>
> **v2 修订记录（2026-10-06）**：经 3 个并行 subagent 对照源码深度审查后修订——修正主提示词填充方式（String.replace 而非 fillPromptTemplate）、共享片段计数（7 非 6）、QuickMode 未装配、末端硬锁口径、旧分镜生成器仍在役、补配音场景口径、burnSubtitles 默认值等表述；补 cogen 落库编排、参考视频镜头推断、缩略图网格、地点主图层级链路、ai-call 补充函数等遗漏。

---

## 目录

1. [总览：流水线结构与驱动方式](#1-总览)
2. [驱动层：剧集制作 Agent（对话入口）](#2-驱动层agent)
3. [第①步 内容：AI 写故事原文](#3-第步内容ai-写故事原文)
4. [第③步 剧本：整集剧本生成（核心）](#4-第步剧本整集剧本生成)
5. [剧本的四个变体入口（续写/拆分/重拆/润色）](#5-剧本的四个变体入口)
6. [第②步 资产：设定反推 + 主图生成](#6-第步资产)
7. [第④步 分镜：资产+分镜联合生成（cogen 主路径）](#7-第步分镜cogen-主路径)
8. [分镜旧生成器与 AI 填空（辅助路径）](#8-分镜旧生成器与-ai-填空)
9. [视频分段：场景内镜头切成 ≤15s 片段](#9-视频分段)
10. [第⑤步 制作（上）：关键帧图生成](#10-关键帧图生成)
11. [第⑤步 制作（下）：视频片段生成](#11-视频片段生成)
12. [第⑤步 制作（附）：场景配音（TTS）](#12-场景配音tts)
13. [第⑥步 合成：整集导出 MP4](#13-第步合成整集导出-mp4)
14. [公共底座：ai-call 调用层](#14-公共底座ai-call-调用层)
15. [附：全链路提示词一览表](#15-附全链路提示词一览表)

---

## 1. 总览

### 1.1 七阶段状态机

`workflow/episode-status.machine.ts:23-31` 定义了整条流水线的阶段顺序（软引导 + 末端硬锁）：

```
pending（① 内容）→ asset_prep（② 资产）→ scripting（③ 剧本）→
storyboarding（④ 分镜）→ producing（⑤ 制作）→ composing（⑥ 合成）→ completed（✓ 完成）
```

正向推进需过 `stage-gate.service.ts` 的阶段门槛；composing → completed 是"末端硬锁"（`checkProducingComplete` 按**全部**分镜校验，双口径：分镜自身 videoPath 或所属片段已出片；导出器一侧另按 includeInFinal 过滤后重算，见 §13）。

### 1.2 三条驱动路径（同一套底层服务）

| 路径 | 入口 | 说明 |
|---|---|---|
| **EP Agent（默认）** | `agent/ep-agent-harness.service.ts` | HostKit LoopRunner 多轮工具循环，对话式驱动；13 个生产动作工具 |
| 旧三段式（回退） | `agent/ep-agent-workflow.service.ts:169`（`EP_AGENT_HARNESS='0'` 时启用） | "AI 决策(JSON) → 批量执行 → AI 总结"三段 |
| 页面手工 / QuickMode | 各 stage 的 UI handler | 各制作页按钮直调对应服务。`quick-mode/orchestrator.service.ts` 是预留的 DI 纯编排器（8 个 step 名：episode → script → assets → thumbnails → storyboards → keyframes → videos → compose），**当前仓库内无任何调用方装配**；UI 实际的"AI 一键模式"（AIQuickModeWizard.vue）只做建剧集 + 识别要素两步后跳转工作台，并不跑完整 8 步 |

无论哪条路径，**真正的"提示词组装 + 生成执行"都收口在同一批服务里**（narrative/ai、assets、render/keyframe、render/video、compose），下文逐步展开。

---

## 2. 驱动层：Agent

### 2.1 默认路径：HostKit LoopRunner（ep-agent-harness.service.ts）

一轮对话 `sendMessage()`（`ep-agent-harness.service.ts:203`）的完整过程：

1. **会话与历史**：conversationId 约定 `ep-agent:${episodeId}`，历史存 `lw_design_messages` 表；取最近 N 条并分级截断（assistant 4000 字 / user 600 字，`:46-48`）。
2. **状态快照**：`computeEpProductionState()` 汇总项目/剧集/场景/分镜/资产/生产进度 → `epStateToSnapshot()`（`:77-107`）拼成约 10 行的中文快照文本，包含：项目名、剧集状态、场景数、分镜覆盖、**四阶段就绪粗判**（剧本/资产/分镜/合成 ✓✗）、资产名单（角色前 8 个名字）、候选数据源名单、用户当前界面 contextHint。
3. **工具装配**：`registerEpAgentTools()`（`ep-agent-tools.ts:192`）把 13 个生产动作注册为 `pack:ep-agent:*` 命名空间工具 + `ep_confirm_choice` 审批工具 + `kb_brain_query`（查知识大脑）。每个工具带 `maxCalls` 频控（`:35-50`：剧本/分镜类 3、关键帧 6、视频 8、导出 2…）和 `dedupArgs` 同参去重；动作超时 120s–30min 分级（`:78-94`）。
4. **模型解析**：未显式指定时，取第一个启用提供商的 text 模型兜底（`:253-268`）。
5. **HostKit 装配**（`:359-418`）：系统提示词 + 快照 + 种子历史 + 32K 上下文窗口 + 记忆 scope（`episode-production` 域）+ 审批协调器（`ep_confirm_choice` 挂起选择卡，30 分钟超时自动拒绝）。
6. **runTurn 循环**：模型每轮看到「系统提示词 + 快照 + 历史 + 用户消息」，自主决定调用哪些工具；工具结果回流进下一轮上下文，直到模型给出纯文本总结。流式正文走 `longwriting:generate:${eventId}` 通道推给前端。

**Agent 系统提示词**（`epAgentSystemPrompt()`，`ep-agent-harness.service.ts:55-72`）全文结构：

- 角色：剧集制作项目的制作助理，驱动完整流水线"剧本 → 场景 → 分镜 → 关键帧 → 视频 → 配音 → 合成导出 MP4"。
- 11 条纪律，要点：简单请求直接执行工具不拆解规划；跨集复杂目标才用 create_task_plan、固定可复用流水线才沉淀 create_workflow_draft（两个规划工具均为能力透出、按复杂度自主决定）；成本意识（资产生成每轮限 3 次且按参数去重、关键帧/视频缺省只补缺不重烧）；name 必须用快照里的真实资产名，编造会报错并回列名单；资产项目级共享优先复用；同工具失败只能换参重试一次；动作完成后必须总结"做了什么+结果+下一步建议"；参数不明先发 `ep_confirm_choice` 选择卡；快照是轮初快照以工具返回为准；**视频/导出是分钟级后台任务，返回"已启动"即成功，不要为等完成重复调用**（在途任务会被去重拦截）。

### 2.2 回退路径：旧三段式（ep-agent-workflow.service.ts + ep-agent-context.ts）

仅在 `EP_AGENT_HARNESS='0'` 时启用。三个环节：

1. **规则型 choice 前置拦截**（`:317-384`）：正则识别"用户想生成定妆图/主图但没点名"（排除疑问/否定句式）、"想查外部数据库但没点数据源" → 不经 AI 直接发候选选择卡。
2. **AI 决策**（`ep-agent-context.ts:18-91`）：系统提示词列出 9 种动作类型与参数约定 + 决策规则（未指定实体必须输出 choice 禁止文字反问、遵守数据依赖、一次最多 3 个动作）+ 严格 JSON 输出格式；用户提示词 = 【项目当前状态】【候选资产名单】【候选数据源名单】【最近对话】【用户本条消息】五段拼接。输出经 `normalizeEpDecision()` 容错解析（未知动作丢弃、限 3 个）。
3. **AI 总结**（`ep-agent-context.ts:95-128`）：动作执行完后，用【用户消息】【决策时回应】【本轮执行结果】【项目最新状态】拼上下文，流式生成自然语言总结。

### 2.3 动作执行层（ep-agent-actions.ts，1589 行）

`dispatchEpAction()`（`:193-214`）把 13 种动作路由到具体实现。关键执行策略：

- **每次调用前重算生产状态做依赖检查**（工具层，`ep-agent-tools.ts:105-112`）。
- **批量动作分页执行**：关键帧每轮限 8 个分镜、视频限 4 段、配音限 6 场景，超出部分返回"剩余 N 个未生成（再次调用继续）"（`:982-987`）。
- **分钟级任务 started 语义**（`:989-1033`）：视频生成/导出 MP4 在 12s/15s grace 窗口内同步捕获前置校验失败；越过窗口立即返回"已启动"，后台完成后补发 `action:done` 事件。进程内 `inFlightVideoTargets`/`inFlightExports` Set 防重复点火。
- **越权防线**：模型给的 segmentId/storyboardId 都校验属于当前剧集；`export_mp4` 的 outputPath 只接受文件名，拒绝绝对路径与 `..`（`:1510-1523`）。
- **写后核验**（H11）：资产生成后回查 DB 行是否真实存在，防止向用户虚报成功（`:473-486`）。

---

## 3. 第①步 内容：AI 写故事原文

**文件**：`narrative/ai/story-text-generator.ts`（78 行，职责单一）

**用途**：创建剧集对话框里，用户凭一句提示词生成小说体裁的故事原文，回填 `episode.uploadedContent`，作为后续剧本生成的底稿。此阶段通常还没有资产，所以不做场景拆分和 binding 引用。

**提示词组装**：

- **System**（`STORY_TEXT_SYSTEM_PROMPT`，`:24-31`）：定位"10 年以上经验的资深小说家，擅长影视化叙事"；5 条要求——小说体裁（场景描写/人物动作神态/对白/情节推进）、800–3000 字、纯文本禁 Markdown、只输出正文不加开场白、故事背景要在情节中自然体现。
- **User**（`buildStoryTextUserPrompt()`，`:41-56`，纯函数便于单测）：
  - `【故事背景】`段：`年代：${era}` / `地域：${region}` / `其他：${extra}`，只有 trim 后非空的字段才拼入；全空则整段省略。
  - `【创作要求】`段：用户 prompt 原文（始终存在）。
  - 段落间空行分隔。

**执行**：`callAI(userPrompt, systemPrompt, maxTokens=16000)`，非流式返回纯文本。provider/model 缺省走 callAI 内部 fallback；未配置 provider 时 throw 由调用方 catch。

---

## 4. 第③步 剧本：整集剧本生成

**文件**：`narrative/ai/script-generator.ts`（1377 行）— 整条流水线里最复杂的提示词。

### 4.1 调用链

```
agent 动作 generate_script（ep-agent-actions.ts:218）
  → resolveChapterContent()          # 底稿来源：uploaded 原文 或 关联长文大纲的章节内容拼接（:279-301）
  → buildAssetRosterForProject()     # 项目三类资产（角色/地点/物品 binding）花名册
  → EpisodeScriptGenerator.generateFullScript()
  → upsertScriptAndRebuildScenes()   # 单事务：剧本 upsert + 删旧分镜 + 删旧场景建新场景 + 状态收敛
```

### 4.2 主提示词 SCRIPT_GENERATION_PROMPT 的组装（`:230-300`）

模板是"骨架 + 7 个共享片段 + 4 个占位符"拼装的（共享片段抽常量，避免三处提示词各自漂移）：

| 片段 | 内容要点 |
|---|---|
| 骨架 | 角色定位"10 年以上一线影视工业经验的职业编剧"；**三段输出顺序强约束**：①【场景数据开始/结束】包裹的 JSON（"最重要，跳过即失败"）②【梗概开始/结束】50-100 字 ③【剧本正文开始/结束】标准剧本格式、禁 Markdown |
| ① `BINDING_CONSTRAINT_SPEC`（`:39-48`） | 所有引用必须用 binding ID：locationBindingId/characterBindingId/itemBindingId 从三类清单选；清单里没有的填 null 保留裸名，**禁止瞎编 ID** |
| ② `SCENE_SPLIT_PRINCIPLES_SPEC`（`:53-59`） | 场景拆分 5 原则：地点变化/时间跳跃/角色组合变化/氛围变化拆新场，每场有视觉焦点 |
| ③ `SCRIPT_ADAPTATION_DISCIPLINE_SPEC`（`:185-187`） | 短剧改编纪律（来自 `services/writing-methodology.ts:139-147`）：黄金三秒冲突开场、台词口语化每句≤20字、集尾卡点切在问题上、首场完整外貌锚定、每场 mood 标注、爽点正面展开 |
| ④ `SCRIPT_FIDELITY_SPEC`（`:195-203`） | 原文保真纪律（2026-09-21 雪麓山庄实测丢对白后加）：原文带引号对白必须全保留不得合并；约定/伏笔/反转/笑点节拍必须有场次承接；省略必须写「省略说明」；自检标准"逐句对照找不到对应台词即不合格" |
| ⑤ `SCENE_JSON_EXAMPLE_SPEC`（`:64-117`） | 完整 JSON 结构示例：scenes[] 含 sceneNumber/location/bindingId/locationType/timeOfDay/weather/sceneDescription/locationKeyObjects/mood/lighting/characters[]（含 props[]）/originalText/narration/dialogues[]（含 emotion/volume/pace/pause）/actions[]（含 timing/duration） |
| ⑥ `FIELD_QUALITY_SPEC`（`:122-160`） | 字段质量硬要求：sceneDescription 必须含"空间布局+材质+关键物件"三要素并给示例；lighting 必须含"光源+方向+强度+色调"；outfit 格式"服装名称（颜色，风格）"；每条对白必须带 characterName 且原文有说话人的不得丢失 |
| ⑦ `ROSTER_LIST_SPEC`（`:167-177`） | 三段占位符：`## 可用角色列表 {characters}` / `## 可用地点列表 {locations}` / `## 可用物品列表 {items}`（`## 章节内容 {chapterContent}` 属骨架尾段，`:298-300`，拼装时接在 ROSTER 之后） |

**占位符填充**（`generateFullScript`，`:924-927`）：
- 花名册渲染 `formatRosterList()`（`:468-473`）：每行 `- bindingId: cb_xxx, 名称: 张三, 描述: ...`；空清单输出 `(无)` 防 AI 格式幻觉。
- 主生成路径用 **`String.replace` 链**填充 4 个占位符（`:924-927`；旧入口 `:1037-1040` 与正文救援 `:978-981` 同）；`fillPromptTemplate`（split/join 实现，`:211-219`，规避 `$&`/`$'` 被当特殊模式改写替换值）只用于续写/粘贴拆分/单场景重拆三个变体（`:541`/`:556`/`:1299`）——即 replace 的 `$` 系列隐患在主路径依然存在，属潜在改进点。

**System 提示词**（`:929-930`）："你是职业编剧…所有引用必须使用提供的 binding ID，不要瞎编 ID。必须输出【场景数据开始】【场景数据结束】标记的 JSON 场景数据！"

**模型调用**：`callAIWithContinue(prompt, systemPrompt, 16000, ..., 2 次续写, temperature=0.3)`。

### 4.3 生成后的五道处理

1. **正文截断续写**（`:938-954`）：检测到【剧本正文开始】但没有【剧本正文结束】→ 单独发一次"从截断处直接继续输出剩余剧本正文，不要重复已输出内容"的续写调用，拼接（fail-soft，失败保留原样）。
2. **多格式解析** `extractFullScriptFromResponse()`（`:596-729`）：按优先级尝试 4 种标记——新【场景数据开始】→ 旧 `===SCENES_JSON===` → \`\`\`json 代码块（DeepSeek 常用）→ 裸 `"scenes": [` 括号配平提取；梗概/正文同样新旧两套 marker 兼容。全程输出 pathTrace 结构化日志。
3. **binding 解析** `resolveBindingId()`（`:496-507`）：AI 给的 ID 命中 roster → 采用；不命中/为空 → 按 name 归一化反查（书名号/全角空格/大小写差异可命中）；仍查不到 → null（validator 标违例，UI 提示手动绑）。对白有兜底：场景只有一个角色时漏填说话人自动归给它（`:813-817`）。
4. **正文救援**（`:976-996`）：场景 JSON 吃光输出预算导致正文缺失 → 用 `SCRIPT_BODY_ONLY_PROMPT`（`:439-460`，只要正文不要 JSON）小预算单独补写；补不上则抛错（缺正文/缺场景都会抛错阻断落库，防止"删旧场景后建 0 个新场景"）。
5. **原文覆盖度校验**（`:1014-1023`，`script-coverage.ts`）：原文对白 vs 生成台词+旁白+正文做覆盖比对，缺失只 `console.warn` 不阻断。

---

## 5. 剧本的四个变体入口

同一个类里还有四个提示词变体，共享同一套输出契约片段：

| 入口 | 提示词 | 特殊点 |
|---|---|---|
| **AI 续写** `continueScript()`（`:1065-1100`） | `SCRIPT_CONTINUATION_PROMPT`（`:312-387`） | "为已开拍剧集续写"定位；场次号从 `{startSceneNumber}` 接续严禁重编号；只输出新增内容；只读上下文注入已有正文 + 已有场次一览 + 用户续写要求 + 花名册 |
| **粘贴正文拆场景** `splitScriptTextToScenes()`（`:1109-1145`） | `SCENE_SPLIT_FROM_TEXT_PROMPT`（`:395-433`） | 正文用户提供所以不产正文/梗概只拆场景；"严禁补写正文里没有的内容"、"每一句对白都必须进入 dialogues"、视觉细节允许合理补全 |
| **梗概→场景** `generateScenesFromSynopsis()`（`:1153-1272`） | 内联简化提示词（`:1162-1264`） | split_scenes 动作走这里；只要 `===SCENES_JSON===` 包裹的场景数组；source 参数区分"章节梗概"还是"剧本正文"语义；同样注入 binding 强约束 + JSON 示例 + 字段质量要求 + 花名册 |
| **单场景重拆** `regenerateScene()`（`:1280-1328`） | 内联提示词（`:1286-1314`） | 以该场景现有内容（原文/旁白/对白/动作 JSON）为源材料重出全部结构化字段；**sceneNumber 强制回写原值**（不信任 AI 回填） |

**场景润色**（独立文件 `narrative/ai/scene-polisher.ts`）：
- System（`:41-49`）："10 年以上职业编剧…把粗糙场景润色成富有画面感、情感张力和潜台词的成熟剧本"；纪律：保持时空/地点/角色出场不变，id 与 binding 字段原样不动，不增删条目数量，与年代/地域/世界观一致。
- User（`buildPrompt`，`:57-118`）：故事背景三行（年代/地域/其他）→ `===SCENE_JSON===` 包裹的原始场景 JSON（输入侧含 sceneNumber/location 等骨架字段作只读上下文，locationBindingId 等不进）→ 输出格式要求 `===POLISHED_JSON===` 包裹的 **JSON 子集**——"不碰骨架字段"是输出契约（sceneNumber/location/locationBindingId 不被改写），各字段带长度建议（sceneDescription 120-300 字、narration 40-150 字…）。
- 解析后 `mergeDialogues/mergeActions` 按 id 对齐合并，任一 binding 字段缺失回退原值；`voiceId`/`audioAsset` 不让 AI 碰（`:217-218`）。

---

## 6. 第②步 资产

### 6.1 设定反推（AI 设计师）

**文件**：`assets/prompts/setting-enrichment-prompt.ts`

给一批待补设定的资产（binding）从原文反推视觉字段：

- **System**（`buildSettingEnrichmentSystemPrompt`，`:63-88`）："你是这部剧的{角色|地点|物品}设计师"；5 条强制规则——原文明确细节必须忠实、未明说但必需的字段基于氛围合理设计、无依据输出 null 切勿编造、严格 JSON、同项目已有同类资产是"已定下的世界观"必须相容。角色 schema 含 description/appearance/outfit/role/gender/age/race/styleAnchors/outfitsExtra 九字段。
- **User**（`:90-111`）：【原文片段】+【同项目已有同类资产（世界观参考）】+【待设计清单（id/名字/别名）】三段；输出每条带 `_evidence` 字段标注证据来源（"原文片段"或"设计：理由"）。

### 6.2 资产主图生成（图片提示词）

**调用链**（agent 动作 `executeGenerateAsset`，`ep-agent-actions.ts:408-501`）：

```
按 name/id 定位 binding（找不到直接报错并列出现有名单 ≤8 个，不静默建卡）
→ 取 effective 生效数据 + 故事背景
→ buildAssetIdentityPrompt() 拼身份段
→ 按类型追加硬约束（appendCharacterConstraints / appendLocationNoHumanConstraint / appendItemConstraints）
→ MainImageGeneratorService.generateMain()（落盘 + 关联 asset_image 行）
→ DB 写后核验
```

**身份段拼装** `buildAssetIdentityPrompt()`（`assets/prompts/asset-identity-prompt.ts:114-157`）——用 `，` 连接的顺序化片段：

```
名字，描述，[角色专属：性别：x，年龄：x，人种：东亚（East Asian...），外貌：x，服装：x，备选服装：a / b]，
风格：{styleAnchors→中文（english）双写}，故事年代：x，故事地域：x，故事背景：x
```

- alias/role 故意不进 image prompt（别名与"主角/反派"定位是叙事概念非视觉概念）。
- race 旧英文枚举双写中英文（`:77-96`）。

**三类硬约束**（各自独立文件，均幂等追加 + 中英双写）：

- **角色** `character-constraints.ts`：构图 framing（fullBody="直立全身 standing full body, head to toe in frame" / upperBody）+ 纯白背景 + 正面均匀光照无阴影；negative 压制一切阴影/戏剧光/杂背景 + framing 对应裁切禁令。派生图另加极简身份保持锚点"保持人物身份（preserve character identity）"（`:135-142`，刻意从 6 锚点缩减为 1 条，理由：参考图 latent 主导一致性，长文本反而稀释）。
- **地点** `location-constraints.ts`：追加"画面中不出现人物"约束（`appendLocationNoHumanConstraint`）。
- **物品** `item-constraints.ts`：物品特写约束。

**主图服务层的再加工**（`main-image-generator.service.ts`）：
- `buildStoryAnchorPrefix()`：锚点串**前置**到 prompt 前（`:380` `effectivePrompt = anchor + input.prompt`）；锚点内容按"prompt 未含才拼入"幂等补时代背景/地域/故事背景/项目全局风格 config.stylePrompt（`:150-158`，把死设置接活）。
- 地点类是层级链路（2026-09-21 地点一致性修复）：根地点先生成平面图 → 主图以平面图为参考 + `appendLocationFloorPlanReference` 布局还原指令（`:411-421`，指令文本在 `location-constraints.ts:224-229`）；子区域引用父级已确认主图（`:324-328`）；室内单间跳过平面图链路（`:330-341`）；生成后 aHash 照抄检测（阈值 10）不过则无参考重拍（`:442-462`）；参考图能力回退 F1b（`:429-431`）。
- `appendAssetSettingAnchors()`（`asset-identity-prompt.ts:282-343`）：2026-09-21 资产图守设定事故后加的关键词存在性检查——prompt 里没出现性别/年龄/人种/外貌/服装/备选服装关键词时追加「人物设定锚点：…」段；地点补类型/规模/氛围锚点。
- **古风硬约束**：storyEra 命中 `/古|武侠|仙侠|玄幻|宋|唐|汉|明|清|朝代|古装/` → prompt 追加"严格古代中国风，严禁出现任何现代建筑、现代服饰…"（`:349-376`），negative 合并 `modern buildings, modern clothing, cars...`。

---

## 7. 第④步 分镜：cogen 主路径

### 7.1 为什么是 cogen

Agent 的 `generate_storyboards` 动作与 UI"批量生成分镜"按钮走 **StoryboardCogenService**（`ep-agent-actions.ts:355-368`，O4 优化）：**一次 LLM 调用同时产出「资产清单 + 分镜」**，binding 的建/复用与全部 ID 回填由代码完成（不让模型回填 ID）。旧逐镜生成器（见 §8）无绑定能力，但**并未退役**——UI 单场景"生成分镜"按钮仍走它（`packs/episode-production/handlers/narrative/storyboard.handler.ts:332-370`）。

### 7.2 联合生成提示词 `buildCogenPrompt()`（`narrative/ai/storyboard-cogen.ts:113-233`）

结构四段：

1. **任务说明**："同时完成两件事：① 识别本场景需要的视觉资产（角色/地点/物品）产出资产卡；② 基于这些资产设计全部分镜（2~8 个镜头）"。
2. **项目已有资产注入**：每行 `- [角色] 沈云萝（ID: cb_xxx）：描述`；空则声明"本场景所需资产全部按新资产产出"。
3. **场景剧本**：场景号/地点/类型/时间/天气/描述/氛围/光线 + 出场角色 + 旁白 + **带 id 的对话列表**（`- dlg_5 · 沈云萝: "..." (怒)`，id 口径统一走 `dialogueDisplayId()`，`:98-102`）+ 动作列表。
4. **镜头语言说明**（景别/角度/运镜枚举速查）+ **输出 JSON schema**（assets.characters[]/location/items[] + shots[]）+ **14 条强约束**。

**14 条强约束要点**（`:214-232`）：

| # | 约束 |
|---|---|
| 1 | shots 2~8 个；开场远景/全景、对话中近景、情感特写 |
| 2-4 | 角色名必须 ⊆ 资产清单∪已有名单；引用已有资产 existing=true 且名字逐字一致描述照抄；新资产描述必须完整（=定妆图唯一依据） |
| 5 | frameDescription 四段式【场景】【人物】【动作】【氛围】；【人物】段服饰/外貌与资产卡完全一致跨镜头不漂移 |
| 6 | duration 1~10s + **节奏密度分档**（钩子/冲突 1-1.5s、对话 1.5-2.5s、关键台词 2.5-4s、呼吸镜头 3-8s 少用；"每 2 秒 1 镜是短剧留存底线"） |
| 7 | assets.location 恰好一个；items 只列需要视觉一致性的关键物品 |
| 8 | 剧本细节照抄原文（药理名/数字/称谓逐字一致，禁止同义转述） |
| 9 | 【人物】段服饰必须**逐字引用**资产卡 description/outfit 原文 |
| 10/10a | 命名纪律（禁代词/群体量词）+ **资产引用标记 `@[登记名]`**（系统解析为参考图后替换为纯名；指定某张图写 `@[名@2]`） |
| 11 | 情绪具象外化（词库：悲伤=低头/肩膀微颤/眼眶泛红…） |
| 12 | 台词长度适配镜头时长（校验按 **4.5 字/秒**硬核算） |
| 13/13a | 每条对白必须有镜头承接；frameDescription **不得引用台词原文**（台词与镜头对应只由 dialogueIds 表达）；dialogueIds 逐镜填写、恰好被一个镜头引用一次 |
| 14 | 地点命名"大地名+区域名"（"雪麓山庄书房"不写裸名"书房"） |

### 7.3 生成→校验→纠错闭环（`generateCogenForScene()`，`:625-687`）

```
callAI(prompt, COGEN_SYSTEM_PROMPT, 16000)        # 系统提示词："专业导演+分镜师兼美术设定师，严格 JSON"
  → JSON 截断？→ callAIWithContinue 自动续写
  → extractJsonFromResponse 解析
  → validateCogenOutput() 逐条校验（:295-547）：
      schema 校验 / 名单⊆校验 / 重名校验 /
      四段式 frameDescription 校验 /
      约束9服饰逐字命中校验（appearanceFragments 切资产卡成≥4字片段，**整个 frameDescription** 去空白后包含至少一片段即过——实际口径比"限【人物】段"更宽松，`:465-473`）/
      台词时长硬校验（字数÷4.5 > duration → 报错"请拆对切镜头或加长"）/
      对白全覆盖校验（遗漏/重复/引用不存在 id 都算错）
  → 有错 → buildCorrectionPrompt(errors, previousResponse) 喂回模型纠错
            （"只修复问题，所有镜头所有出镜角色都要自查一遍"，最多重试 2 次）
  → 仍不合法 → 抛错（旧分镜保留，宁缺毋滥）
  → 合法 → normalizeCogenOutput 归一化 + validateShotPacing 节奏校验（只警告）
```

`buildCorrectionPrompt()`（`:236-249`）的特别设计：错误清单编号列出 + 上次完整输出附后 + 明确"已合规的内容保持原样，不得增删镜头或资产"。

### 7.4 落库编排（StoryboardCogenService，`narrative/services/storyboard-cogen.service.ts`）

AI 层之上的 service 编排决定动作语义：

- **O2 增量模式**（`:154-160`）：默认跳过已有合格分镜的场景；agent 的 `generate_storyboards` 传 `force: true` 全量重写（助手语境"生成分镜"=重写语义，与 renderer 批量按钮一致）。
- **LLM 超时重试**：60s 超时原样重试 1 次（`:531-558`）。
- **O3 复用资产富化**：复用 binding 的描述过薄（<30 字或不含服饰关键词）时用新资产卡富化回填 + 宏观地点污染守卫（`:562-619`）。
- **M3 对白 id 回填**：生成前为无 id 老对白回填真实 id 并落库（`backfillDialogueIds`，`:780-835`）——prompt 渲染与全覆盖校验共用 `dialogueDisplayId` 口径。
- **M1 事务换入**：删旧分镜 + 插新分镜 + dialogue_links 同一事务（`replaceSceneStoryboards`，`:850-917`）——§7.3"仍不合法 → 抛错（旧分镜保留）"依赖的正是这个事务。
- **D4-2 落库断言**：落库后复读并断言 characterId 全非空（`:985-997`）。

---

## 8. 分镜旧生成器与 AI 填空

### 8.1 逐镜生成器（`narrative/ai/storyboard-generator.ts`，回退路径）

- **镜头数规划** `analyzeSceneStoryboardNeeds()`（`:375-423`）：小提示词把场景信息（描述/氛围/角色/对白数/动作数）喂给 AI，输出 `{shotCount, shotTypes[], notes}` JSON——先规划再逐镜生成。
- **单镜提示词** `SINGLE_STORYBOARD_GENERATION_PROMPT`（`:220-347`）：完整镜头语言枚举表（8 景别/15 运镜/6 角度/8 转场）+ 分镜设计原则 + **节奏密度分档 + 命名情绪纪律两个共享片段**（来自 `shot-pacing.ts`）+ frameDescription 四段式格式要求与示例 + 单镜 JSON schema。上下文注入：整体规划信息 + "这是第一镜/上一镜的景别角度运镜主体时长，避免重复"。
- **批量提示词** `STORYBOARD_GENERATION_PROMPT`（`:96-215`）：一次输出全场景分镜的 storyboards 数组。
- **后处理**：`normalizeAiCharacters()`（`:34-89`，Bug C 修复）把 AI 常写错的 characterId（角色中文名/长文角色 ID/占位符）反查替换为真实 bindingId，查不到置空让下游 fallback；`distributeDialoguesToStoryboards()`（`:429-457`）AI 没分配对白时按镜数均分；dialogueIds/actionIds 过滤只留场景内真实 id；节奏校验只警告。

### 8.2 AI 填空 `fillStoryboardFields()`（`:743-983`）

UI"一键填充"分镜空白字段用。提示词特点：
- 只要求输出**需要填充的字段**；
- 附带完整参数预设说明——运镜预设（prompt 自称 25 条，实际枚举 basic 7 + narrative 8 + dynamic 5 + special 4 = **24 条**，且与 `assets/constants/camera-movements.ts` 的正式 25 预设值集不同源——源码自身瑕疵）、焦距 5 档（24mm 超广角…125mm 长焦）、光圈 5 档、相机风格 4 种、**12 种打光预设**（rembrandt/three_point/noir_hard/cyberpunk_neon…）、转场类型/时长/方向、关键帧数与运镜复杂度对应关系（static 2-3 帧…特殊运镜 5-9 帧）；
- frameDescription 的资产引用纪律段（`@[登记名]` 标记 + 服饰逐字一致 + 地点完整登记名，2026-09-21 一致性修复）；
- 输出校验：**仅焦距做预设白名单**（数字/缺后缀统一转 "85mm" 格式且必须在 5 档内，`:955-968`）；aperture/cameraStyle/lighting 等其余字段只做 typeof 检查（`:969-976`）。

### 8.3 另外两条分镜输入路径（主线之外，简记）

- **参考视频镜头推断**：`reference-video/vlm-shot-inferrer.ts:20-63` 有完整 VLM 提示词（抽代表帧 → shotType/cameraAngle/cameraMovement/frameDescription/emotion 简化枚举 JSON，`:68-86` 再映射到标准枚举），配合 `analysis.service.ts`（ffmpeg 场景/镜头切分）与 `narrative/import-from-parsed-shots.service.ts` 构成"上传参考视频 → 解析 → 导入分镜"的第三条分镜入口；`character-extraction.service.ts` 还能从视频抽帧提取角色定妆图。
- **分镜缩略图网格**：`narrative/ai/storyboard-thumbnail-generator.ts`（剧本→分镜过渡入口）：拼"全剧概要 + 风格 + 9 段叙事节奏"图像 prompt，一次生成 3×3 网格大图后 sharp 切 9 张（QuickMode step 列表中的 thumbnails 即此）。

---

## 9. 视频分段

**文件**：`render/video/segment-planner.ts`（纯函数）+ `render/video/ep-segmentation.service.ts`（落库）

**为什么分段**：视频模型单次生成时长有限（Seedance/MiniMax-H3 ≤15s），一集的分镜必须切成片段逐段出片。

**切分规则** `splitShotsIntoSegments()`（`segment-planner.ts:44-75`）：

1. 场景边界必切（调用方按场景分组后逐场景调用，天然不跨场景）；
2. 场景内按镜头 duration 顺序累加，加入下一镜会**严格大于**预算（默认 15s，项目 `config.segmentDurationBudgetSec` 可配 5-30s）就切分；
3. 单镜超预算独成一段。

**落库** `EpSegmentationService.recompute()`（`ep-segmentation.service.ts:124-190`）：幂等重算——generating 段跳过不删（在途 provider 任务有落点）；completed 段做有效性校验（关联分镜全没了 → superseded，不参与合成导出）；pending/error 删除重切，seq 续排。另提供手动 mergeSegments（同场景相邻段合并 ≤15s）/ splitSegment（断点镜后拆两段）/ moveSegment（同场景内相邻换序），合并/拆分后 prompt 重算、状态重置 pending。

---

## 10. 关键帧图生成

**文件**：`render/keyframe/keyframe-generation.service.ts`（1703 行）+ `keyframe-prompt-builder.ts`（474 行）+ `keyframe-chain-strategy.ts`

### 10.1 链式计划 `planKeyframes()`（`keyframe-chain-strategy.ts:46-82`）

每个分镜的关键帧数 N（1-9，默认 3）转化为生成顺序与参考依赖：

```
N=3 → ① frameIndex=0 start（0%，无参考）
      ② frameIndex=2 end（100%，参考[start]）
      ③ frameIndex=1 middle（50%，参考[start,end]）
```

改帧的传播：改 start → 建议重生成全部；改 middle → 只重生成自己；改 end → 建议重生成 middles。时刻语言 `describeFrameMoment()`（`:139-147`）：start="场景开始时刻：人物刚进入位置/动作即将展开"；end="场景结束时刻：动作完成/情绪到位/镜头将切换"；middle="场景中段（约 N%）：动作过程/表情过渡/走位中"。

### 10.2 批量生成主入口 `generateKeyframesForStoryboard()`（`keyframe-generation.service.ts:331-428`）

```
读分镜 + 场景 → pickStyle 选风格配置
→ planKeyframes(N)
→ resolveSceneAssets()（一次性解析角色/地点/物品 effective 数据）
→ assertCharactersBound()（D4-3 守卫：场景有角色但一个绑定都解析不出 → 拒绝生成）
→ resolveKeyframeDimensions()（画幅跟随项目 config.aspectRatio）
→ 合并参考图覆盖：storyboard.referenceImageIds（用户挑图）+ frameDescription 里 @[名@索引] 显式标记
→ 按 plan 逐帧 generateOneKeyframe()
   （复核修复 P1-8：全部生成成功后才删旧帧换入；中途失败回滚半成品新帧保留旧帧）
→ 全部成功 → 分镜状态置 image_ready
```

### 10.3 单帧生成 `generateOneKeyframe()`（`:1156-1479`）——本链路最复杂的提示词现场

**① 参考图选择** `collectReferenceImages()`（`:1491`）：每类资产先看用户 override，没有再按维度评分挑变体（shotType/facing 映射 view 维度：近景镜优先半身派生图、远景镜全身主图）；角色在 confirmed 池内 **is_main 主图优先于维度评分**（B4，`reference-image-selector.ts:6-11`），且形象组其余 confirmed 图会追加进 refs 让多参考 provider 吃满（`:1550-1569`）——即单个资产可贡献多张参考图。

**② 参考图预算与路径预判**（`:1220-1236`）：
- `maxRefs==1` 且有角色参考图 → **多角色合成锚定三步链**（2026-09-21 设计转向）：T2I 场景草稿（同 provider 纯文生图）→ sharp worker 把角色白底抠图贴入合成 → 编辑模型以合成图为唯一参考做融合（利用编辑模型"保持输入"天性）。融合指令前缀 `COMPOSITE_FUSION_PREFIX` + 原 prompt 剥掉风格前缀（`:1322-1324`）。
- `maxRefs>1` 且 refs 超上限 → 编号参考板（ReferenceBoardService 拼板 + `buildBoardPromptNote()` 板成员说明段）。
- **风格前缀让位（F4/C6 + K2）**：按最终模型预算截断后仍有角色参考图存活 → 风格前缀从 `cinematic, high quality...` 换成 **REFERENCE_MATCH_STYLE_PREFIX**（`keyframe-prompt-builder.ts:55-56`）："画面风格、人物外观与参考图保持一致（match the reference images exactly…）"——防止写实风格词把 Q 版参考图写实化。

**③ 提示词组装** `buildKeyframePrompt()`（`keyframe-prompt-builder.ts:328-435`），13 段顺序：

```
1  风格前缀（styleConfig.stylePrefix 或参考图一致前缀）
2  sceneDescription（场景视觉描述）
3  [关键帧时刻] describeFrameMoment(role, timePercent)
4  location: {地点名}，{地点描述}
5  {frameDescription}（K1：先剥 @[名@索引] 标记为纯名——图像模型不认识引用语法）
   main subject: {subject}
6  character: {名字, 外貌, wearing 服装（场景临时换装优先于 effective）, 表情 expression, 动作, positioned 位置}
   ×N 个角色
6b [角色形象一致性] 严格保持每个角色面部特征/衣着/发型/饰品与参考图一致；不同镜头景别时刻下完全相同
7  prop: {物品名 描述 (上下文)}
8  {mood} atmosphere，{timeOfDay} lighting，{weather}
9  {composition 构图}
10 景别英文短语（close: 'close-up shot, face and shoulders...'）+ 角度英文短语
10b 镜头扩展元数据 hint（焦距/光圈/相机风格/打光四 preset 的 promptHint，从 storyboard.metadata 解析）
11 [user direction] {用户 UI 输入的额外提示词}
12 质量后缀（masterpiece, best quality...）
13 古风硬约束（storyEra 命中 → "严格古代中国风场景，严禁现代建筑…" + negative 追加）

最终：项目 config.stylePrompt 再追加到尾部（:1266）
```

5 套预设风格 `PRESET_STYLES`（`:61-87`）：cinematic / anime / realistic / fantasy / ancient_chinese，各含 stylePrefix + qualitySuffix + negativePrompt。

**④ 生成循环（重拍机制；MAX_KEYFRAME_ATTEMPTS = 3：首拍 + 2 次重拍，`:85`）**（`:1345-1417`）：

```
for attempt in 1..MAX_KEYFRAME_ATTEMPTS:
    attemptPrompt = (融合指令 | 板说明+basePrompt) + retryNote ? "\n[上一张图的问题] {问题}，必须修正" : ""
    imageGenerator.generate({ referenceImagePaths, prompt, negativePrompt, 画幅, provider/model })
    → 机器校验 runKeyframeMachineChecks（照抄参考图检测/空图检测/拼板复刻检测/合成图未融合检测）
    → 机器校验过了且配置了多模态审核模型 → VLM 审核（见下）
    → 双过 → break；否则 discard 图片，把问题清单（截 500 字）作为 retryNote 重拍
```

**⑤ VLM 审核**（`keyframe-review.service.ts`）——以"生成时实际使用的 prompt + 实际生效的参考图"为基准：

- System（`:76-99`）："你是剧集制作的一致性审核员…判断关键帧是否可以直接进入视频生成"；三项检查：人物一致性（面容/发型/服饰/配饰 vs 参考图，无参考图的对照文字描述）、内容覆盖（出场人物/核心动作/场景/关键物品是否都在）、明显穿帮（多余人物/文字乱码/肢体畸形）；输出 `{"consistent", "issues[]", "summary"}` 纯 JSON；规则"主观偏好不算问题、无问题 issues 为空"。
- User（`:224-228`）：`【该帧生成提示词】`+`【图片说明】第 1 张=待审核关键帧；其余 N 张=生成时实际使用的参考图`。
- 最多 1+4 张图；temperature 0.1；模型必须是多模态（`isVisionCapable` 按名字匹配 vl/vision/4o/gemini/claude，纯文本模型直接 skipped——雪麓山庄 v2 根因修复）。

**⑥ 落库**：`image_assets`（metadata 含 subType、**actualPrompt 实发完整 prompt**、参考图全量 id 与生效 id、resolvedModel、机器校验与 VLM 审核结果、拼板/合成锚定信息）+ `storyboard_keyframe` 行（prompt/negativePrompt/userPromptOverride/referenceOverrides）。

---

## 11. 视频片段生成

**文件**：`render/video/segment-video.service.ts` + `segment-planner.ts` + `asset-ref-resolver.ts`

### 11.1 片段级正文提示词 `buildSegmentPrompt()`（`segment-planner.ts:198-243`）

这是**发给视频模型的多镜头正文**，格式：

```
镜头1（约5s，全景，平视，推镜）：{frameDescription}；台词：{沈云萝：你怎么来了}；
镜头2（约3.5s，近景）：{frameDescription}。
总时长约8.5s，画面比例 16:9（1920x1080），多个镜头之间保持人物、场景、光影与风格一致，镜头切换自然连贯，
台词由对应人物以自然语速清晰说出，语音与各镜头时长匹配，不得加速、不得含糊、不得念错字，
画面风格：{项目 config.stylePrompt}，画面中不得出现字幕、文字、水印、LOGO。
```

关键处理：
- **镜头头**：`镜头N（约Xs，景别中文，角度中文，运镜中文）`——枚举→中文标签映射（`:138-172`），只放认识的枚举值，界面所见即模型所得。
- **frameDescription 预处理**（`:209` 实际执行序）：先 `stripDialogueQuotes()`（`:117-123`，2026-10-05 台词乱码修复）剥离"说道：'…'"式台词引文——台词统一由结构化台词段承载，散文版会被音视频模型念成乱码；正则按六种引号类型各自成支、允许弯双引号一层嵌套，非言语语境引号（匾额写着"雪麓山庄"）保留。随后 `replaceAssetRefMarkers()` 剥掉 `@[资产@索引]` 标记为纯名文本（两者正交）。
- **台词段**（声音符号协议 `{}`）：`台词：{说话人：原文}，{说话人：原文}`，数据来自 `loadShotDialogues()`（storyboard_dialogue_links 表 / JSON 列）。
- **音频口径**：有台词 → "台词由对应人物以自然语速清晰说出，语音与各镜头时长匹配…"；无台词 → 显式"画面中人物不说话，无人物对白语音，仅环境音"（防幻觉配音）。
- **负向尾巴**：默认"画面中不得出现字幕、文字、水印、LOGO"（字幕合成阶段后加，烧进画面是事故）；`allowOnScreenText` 可豁免。

### 11.2 两条渲染路径（`generateForSegment()`，`segment-video.service.ts:103-225`）

**路径 A：assetRef2video（缺省路径，2026-09-21 一致性修复 v2 起唯一开通）**

背景：关键帧链路实测 11/11 废帧（flux-kontext 照抄参考板），故图源改用**资产主图**而非关键帧：

```
collectSegmentAssetRefs()（asset-ref-resolver.ts:79-189）
  # 从分镜结构化字段收集本段资产（地点→角色→道具去重）；getEffectiveData 投影名字/描述（截 80 字）
  # 选图口径与 confirmed 闸门同源：confirmed=1 池强制（池内 is_main 优先）→ 回退主图 → 无图跳过
→ ≥2 资产：ReferenceBoardService 拼编号参考板；1 资产：原图直传；0 资产：报错
→ annotateRefsWithSlots()（:200-214）：镜头正文里每个资产名首次出现标注
   「沈云萝（参考板第2号）」——长名优先正则避免嵌套名误标
→ buildAssetRefPrompt()（:224-258）组装三段式：
   subject_definitions: Picture 1 为资产参考板（各编号分块）…仅作为画面主体外观来源：1号=沈云萝（角色：外貌摘要）；2号=…
                       要求：人物长相发型服装配饰与对应编号资产完全一致；每个人物只出现一次不得有分身残影；
                             物品仅出现在归属人物身上；不要求保留 Picture 1 的拼贴构图，画面按 summary 描述自然呈现。
   summary:           [reference generation + audio reference] {buildSegmentPrompt 正文}
   retention_analysis: Subject 1: fully_preserved - 仅保持主体外观与整体风格一致，画面按 summary 运动。
→ adapter.imageToVideo({ imagePath: 参考板/原图, prompt, durationSec, quality, steps })
```

语义红线（模块头注，`:15-16`）：refs 只承载"主体外观来源"，绝不承载首帧构图——声明段必须显式"不要求保留 Picture 1 的拼贴构图"，否则模型照抄拼板版式。另有 provider 守卫：不支持"参考图=主体外观"语义的 provider（火山/百炼会把参考图当首帧烙进成片）显式拦截并引导切换（`segment-video.service.ts:246-253`）。

**路径 B：关键帧路径（renderPath='keyframe' 回切换）**

```
tryEnsureEndKeyframe()（R4，前置 :130：forceMode≠text2video 且 provider 支持 keyframes 才执行）
  首镜头 end 帧缺失/无图 → 自动补生成（走完整生成+校验+重拍闭环），补不上才降级
→ E3 关键帧闸门（text2video 模式跳过；force=true 人工跳过）：
  实际消费的首尾帧必须 machineCheck.pass + review ∈ pass/skipped，不过则拦截
→ pickVideoMode()：首镜有 start+end 两帧 → keyframes2video（首尾帧锚定）；只有首帧 → image2video；
   无关键帧 → text2video
→ 对应 adapter.keyframesToVideo / imageToVideo / textToVideo
```

**共同后置**：generating + prompt 快照先落库（崩溃可追）→ provider 异步任务 `onTaskId` 立刻回写 `provider_task_id`（H5 崩溃恢复：30-45 分钟轮询期间进程崩溃，重启后凭 taskId 回查终态）→ 完成写 videoPath/videoMode/duration，联动片段内分镜 status=completed，推进剧集状态到 producing。

### 11.3 Agent 侧启动语义

`executeGenerateSegmentVideo()`（`ep-agent-actions.ts:1137-1394`）：
- 模型解析序：显式参数 > 项目 config.videoModel > 第一个启用 provider 的 video 模型；全落空报错引导配置。
- 单段/单镜：归属校验 + 在途去重 → `launchLongRunning`（12s grace）→"已启动（后台执行，需数分钟，不要重复调用）"。
- 批量（V3，2026-10-04）：缺视频片段逐段后台执行，每轮上限 4 段；无 live 片段或有孤儿分镜先幂等 recompute 分段；"双口径"——片段无成片但片内分镜各有单镜视频时不重烧。

---

## 12. 场景配音（TTS）

**文件**：`render/audio/scene-audio-orchestrator.service.ts` + `narration-synthesis.service.ts` / `dialogue-synthesis.service.ts`

**这一步没有 LLM 提示词**——是纯 TTS（VoiceService.generateSpeech）+ 音色解析编排：

```
orchestrateScene(sceneScriptId, outputDir)（:92-154）
1. 旁白：音色 = 入参 defaultNarratorVoiceId ?? 系统第一个可用音色
   → narrationSvc.generateNarrationAudio(旁白文本, {voiceId, speed:1.0, pitch:0}, dir)
2. 对白逐条（每条间隔 500ms 限流防御）：
   音色解析 resolveDialogueVoice()（:203-217）三级优先：
     ① dialogue.voiceId（场景级覆盖）
     ② character_binding.voiceId（ReferenceResolver 按 bindingId 取）
     ③ VoiceService 第一个可用音色（运行时取，不硬编码；无任何音色直接报错引导配置 TTS provider）
   → 同 narration 服务合成（text + voiceConfig 等价复用）
3. persistToScene()（:165-193）：对白写 dialogues[].audioAsset、旁白写 scene.narration_audio_path，
   同一事务；一律转相对路径（数据目录迁移不成死路径——X4 成片无声修复）
```

Agent 动作 `generate_scene_audio`（`ep-agent-actions.ts:1401-1472`）：缺省只补"完全未配音"的场景（`旁白无音频 且 没有任何一条对白已有音频附件`，`:1416-1419`——部分配音的场景会被整体跳过、不补缺），每轮上限 6 个场景；假成功防线——有待合成内容却一条产物都没有视为失败；统计 fallback 音色条数提示"可在资产页为角色绑定音色"。

---

## 13. 第⑥步 合成：整集导出 MP4

**文件**：`compose/episode-mp4-exporter.service.ts`（800 行）+ `timeline-builder.service.ts` + `subtitle.service.ts`；ffmpeg 执行器由调用方注入——agent 路径装配 packs 侧 `episode-mp4-exporter.runner.ts` 的 `FluentFfmpegRunner`（`ep-agent-actions.ts:1504-1506` 惰性 import）。`compose/ffmpeg-assembler.service.ts` 只服务旧 shot/scene 级合成链，不在整集导出主链上。

**无 LLM 提示词**——纯 ffmpeg 装配，但它是全链路的验收关口：

### 13.1 时间线装配（`timeline-builder.service.ts:89-171`）

纯查询纯计算：剧本 → 场景（sceneNumber 升序）→ 分镜（shotNumber 升序），时间从 0 逐镜累加；**转场不吃时长**（fade/dissolve 是渲染期重叠，ffmpeg 用 transition.duration 做 crossfade overlap）；每镜带 includeInFinal（用户可时间线上剔除）、segmentId、transition 配置；**缺失视频清单 missingVideoStoryboardIds** 是导出硬关卡——分镜自身无视频但所属片段已出片（非 superseded）不算缺失。

### 13.2 导出流程（`exportEpisodeToMp4`）

```
buildEpisodeTimeline
→ 按 includeInFinal 过滤 + 片段合成单元合并（同片段分镜合一个单元，段内不 xfade）
→ 末端硬锁：入选分镜缺视频 → 立即报错（agent 动作在 grace 窗口内同步拿到）
→ collectUnitAudioFiles：收集场景旁白 + 对白音频文件（probe 有声过滤坏文件）
→ SubtitleService.buildSrt：字幕时间轴不是原始展示时间线，而是按导出单元与 xfade 转场重叠扣减重建的（buildExportSubtitleTimeline，D1 修复，`:231-233`）
→ buildFilterComplex：concat + 转场 xfade + 音频混流 + 字幕烧录（burnSubtitles 按入参：agent 动作层默认 true，`ep-agent-actions.ts:1537`；exportEpisodeToMp4 本身未传不烧，UI 直调缺省不烧）
→ ffmpegRunner.run → 产出 MP4 写入导出目录
→ 回写：episode.composedVideoPath + 状态 composing→completed
```

Agent 动作 `export_mp4`（`ep-agent-actions.ts:1482-1580`）：outputPath 安全收口（只收文件名，绝对路径/`..` 拒绝，固定写应用导出目录）；同集同时只允许一个导出任务；15s grace 后返回"已启动"，完成后补发 action:done。导出后另有可选「质量自检」（`services/quality-check.service.ts`）：四项指标 + 一次 VLM 相似度打分（1-5 分）。

---

## 14. 公共底座：ai-call 调用层

**文件**：`src/core/platform/services/ai-call.ts`（865 行），narrative/ai 的 `_helpers.ts` 只是 re-export。

| 函数 | 用途 |
|---|---|
| `callAI(prompt, systemPrompt, maxTokens, provider, model, {temperature})` | 通用文本调用；provider/model 缺省自动解析；temperature 透传（结构化抽取场景各生成器统一传 0.3） |
| `callVLM` / `callVLMMulti` | 单图/多图 VLM 调用（关键帧审核用，temperature 0.1） |
| `callAIWithContinue(...)`（`:602-637`） | **JSON 截断自动续写**：`isJsonTruncated()` 检测 → 续写提示词"这是你上次输出的内容（被截断）：{jsonSoFar}，请直接继续输出剩余 JSON，不要重复已输出部分" → `mergeContinuationResponse()` 重叠去重拼接（最多 2 次） |
| `callAIStream`（`:729-815`） | 流式文本调用（AbortSignal 真取消、增量回调、messages 前置历史）——旧三段式 agent 总结流式回复的底座 |
| `toImageDataUrl`（`:832-865`） | VLM 图片输入归一（URL/本地路径/base64 → data URL，含 SSRF 防护） |
| `extractJsonFromResponse()`（`:643+`） | 三格式提取：\`\`\`json 块 → \`\`\` 块 → 裸 JSON |
| `parseJsonString()` | 容错 JSON.parse（处理尾逗号等常见模型输出瑕疵） |

---

## 15. 附：全链路提示词一览表

| 步骤 | 模板/函数 | 文件:行 | 输入数据源 | LLM 输出 | 解析与校验 | 失败兜底 |
|---|---|---|---|---|---|---|
| Agent 系统提示词 | `epAgentSystemPrompt()` | ep-agent-harness.service.ts:55 | —（+每轮状态快照 :77） | 工具调用流 | LoopRunner 频控/去重/审批 | max_steps/stagnant 停止注记 |
| Agent 决策（旧路径） | `DECISION_SYSTEM_PROMPT` + `buildEpDecisionContext` | ep-agent-context.ts:18/53 | 状态摘要+资产名单+数据源+历史+消息 | 单个 JSON（reply/actions/choice） | normalizeEpDecision 白名单过滤 | 决策失败降级纯对话 |
| 故事原文 | `STORY_TEXT_SYSTEM_PROMPT` + `buildStoryTextUserPrompt` | story-text-generator.ts:24/41 | 用户 prompt + 年代/地域/背景 | 纯文本小说 | 无（自由文本） | provider 未配置 throw |
| 整集剧本 | `SCRIPT_GENERATION_PROMPT`（7 共享片段拼装） | script-generator.ts:230 | 章节内容 + 三类资产花名册 | 三段 marker（JSON 场景/梗概/正文） | 4 格式 marker 解析 + binding 三级解析 + 覆盖度警告 | 正文截断续写 / 正文救援补写 / 缺场景抛错 |
| 剧本续写 | `SCRIPT_CONTINUATION_PROMPT` | script-generator.ts:312 | 已有正文+场次一览+续写要求+花名册 | 同上三段（只含新增） | 同上 | 正文场景全缺才抛错 |
| 粘贴正文拆场景 | `SCENE_SPLIT_FROM_TEXT_PROMPT` | script-generator.ts:395 | 用户正文+场次一览+花名册 | 场景 JSON | 同上 + 覆盖度警告 | 解析 0 场景返回空数组不抛 |
| 场景润色 | `SYSTEM_PROMPT` + `buildPrompt` | scene-polisher.ts:41/57 | 场景 JSON + 故事背景 | `===POLISHED_JSON===` JSON 子集 | marker 提取 + 按 id 对齐合并 + binding 回退原值 | 缺字段回退原值 |
| 设定反推 | `buildSettingEnrichmentSystemPrompt/UserPrompt` | setting-enrichment-prompt.ts:63/90 | 原文片段+已有同类资产+待补清单 | results[]（fields+_evidence） | 严格 JSON schema | 无依据字段 null |
| 资产主图 prompt | `buildAssetIdentityPrompt` + 三类 constraints | asset-identity-prompt.ts:114 + character/location/item-constraints.ts | effective 投影 + 故事背景 + 项目风格 | （图像） | — | 定位失败报错列名单；DB 写后核验 |
| 分镜联合生成 | `buildCogenPrompt`（14 强约束） | storyboard-cogen.ts:113 | 场景剧本 + 已有资产快照 | assets + shots 单 JSON | `validateCogenOutput` 全量校验 | 纠错重试 2 次（错误清单回喂） |
| 纠错重试 | `buildCorrectionPrompt` | storyboard-cogen.ts:236 | 校验错误清单 + 上次输出 | 修正后完整 JSON | 复验 | 仍失败抛错保旧分镜 |
| 镜头数规划 | `analyzeSceneStoryboardNeeds` | storyboard-generator.ts:375 | 场景摘要 | {shotCount, shotTypes, notes} | 缺省 shotCount=5 | — |
| 单镜生成 | `SINGLE_STORYBOARD_GENERATION_PROMPT` | storyboard-generator.ts:220 | 场景描述+上下文+规划 | 单镜 JSON | 必填字段校验+id 过滤+normalizeAiCharacters | 逐镜失败继续下一镜 |
| 分镜 AI 填空 | `fillStoryboardFields` | storyboard-generator.ts:743 | 场景上下文+已有字段+空白字段清单 | 需填字段 JSON | 仅焦距预设白名单，其余字段类型检查 | 不适合填充可不输出 |
| 参考视频镜头推断 | VLM 提示词（简化枚举镜头 JSON） | reference-video/vlm-shot-inferrer.ts:20 | 参考视频代表帧 | shotType/frameDescription 等简化枚举 JSON | 映射到标准枚举 | — |
| 分镜缩略图网格 | 全剧概要+风格+9 段节奏图像 prompt | narrative/ai/storyboard-thumbnail-generator.ts:1 | 剧本概要+风格词 | 3×3 网格大图 | sharp 切 9 张 | — |
| 关键帧 prompt | `buildKeyframePrompt`（13 段） | keyframe-prompt-builder.ts:328 | 分镜+场景+解析后资产+帧计划+用户提示词+相机元数据+storyEra | （图像） | 机器校验+VLM 审核+重拍 | 重拍 N 次仍不过按 review 状态落库 |
| VLM 审核 | `SYSTEM_PROMPT` + userPrompt | keyframe-review.service.ts:76/224 | 生成图+生效参考图+该帧 prompt | {consistent, issues, summary} | 非多模态模型 skipped | error 不阻断（门禁另拦截） |
| 片段视频正文 | `buildSegmentPrompt` | segment-planner.ts:198 | 片段内各镜 frameDescription/duration/镜头语言/台词链接 + 项目风格 | （视频） | — | — |
| 资产引用三段式 | `buildAssetRefPrompt` + `annotateRefsWithSlots` | asset-ref-resolver.ts:224/200 | 正文 + 解析出的资产参考 | （视频） | 0 资产报错 | provider 不支持主体参考语义拦截 |
| 截断续写 | `callAIWithContinue` 续写提示词 | ai-call.ts:622 | 上次截断的 JSON | 剩余 JSON | mergeContinuationResponse 重叠去重 | 最多 2 次 |
| 配音 | —（无提示词） | scene-audio-orchestrator.service.ts | 对白/旁白文本 + 三级音色解析 | （TTS 音频） | 假成功防线（零产物=失败） | fallback 系统音色并计数提示 |
| 合成导出 | —（无提示词） | episode-mp4-exporter.service.ts | 时间线+音频+字幕 | （MP4） | 末端硬锁（缺视频即报错） | grace 窗口内同步报错 |

---

## 结语：几条贯穿全链路的设计主线

1. **binding ID 强约束贯穿始终**：剧本（AI 用 ID 引用资产）→ 分镜（cogen 由代码回填 ID，模型只给名字）→ 关键帧（effective 投影拼 prompt）→ 视频（资产主图作参考）→ 配音（binding 查音色）。每一层的解析都有"AI 给 ID → name 归一化反查 → null 标违例"三级兜底。
2. **"生成→校验→纠错重试"闭环**是标配：剧本（多格式解析+正文救援）、分镜（14 条约束校验+2 次纠错重试）、关键帧（机器校验+VLM 审核+重拍循环）、视频（E3 闸门+R4 补帧）。
3. **提示词即界面**：界面上选的景别/角度/运镜/风格词，全部通过各 builder 到达模型（"界面所见即模型所得"）；同时 `@[资产@索引]` 这类系统引用语法在出境前一律剥成纯名——图像/视频模型不认识引用语法。
4. **一致性是最大主题**：服饰逐字引用校验、资产引用标记、参考板编号声明段、风格前缀让位、古风硬约束、命名纪律（禁代词/群体量词）……大量提示词规则来自真实事故复盘（雪麓山庄 v1/v2/v3、台词乱码、忘川场次等，源码注释中均有记录）。
5. **成本纪律**：agent 频控+同参去重、关键帧"只补缺失不重烧"、视频在途去重、started 语义（分钟级任务不阻塞对话轮）。
