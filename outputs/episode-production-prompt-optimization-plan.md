# 剧集制作模块提示词优化方案

> 基于 `outputs/episode-production-pipeline-deep-dive.md` 的全链路梳理 + 四组源码级审查 + 关键论断人工复核。
> 本文档分四部分：§0 复核结论（含对前版对照表的修正）、§1 优化总则、§2 基础设施改造、§3 逐提示词优化、§4 跨环节一致性专项、§5 实施顺序与验证。

---

## 0. 复核结论：前版对照表的验证与修正

对表格中支撑 P0 结论和方案设计的关键论断做了源码抽查，结果如下：

| 论断 | 复核结果 | 证据 |
|---|---|---|
| 批量分镜模式对话无 ID 却要求回填 dialogueIds | **属实（P0）** | `storyboard-generator.ts:486` 对话行 `- 角色: "台词" (情感)` 无 id；`:483` 旁白同样无 id；输出 schema 要求 `dialogueIds`/`narrationId` |
| 缩略图 count=16/25 与 9 拍指令矛盾 | **属实（P0）** | `storyboard-thumbnail-generator.ts:158-170`：`grid=Math.sqrt(count)` 支持 16/25，但节奏指令写死"第 1 帧…第 9 帧" |
| 剧本主提示词无故事背景注入 | **属实** | `script-generator.ts:230-300`：占位符仅 `{chapterContent}` + 三类花名册，无 era/region/extra |
| cogen 提示词正文含具体项目名 | **属实** | `storyboard-cogen.ts:227`（`@[沈云萝]`/`@[秦越@2]`）、`:232`（雪麓山庄书房/山门、白鹿城城门）；另 `:223` 约束 8 示例"曼陀罗花/忘忧草"、`:221` 约束 6"打脸/身份揭示/短剧留存底线" |
| VLM 运镜方向捏造 | **属实（P0）** | `vlm-shot-inferrer.ts:72-73`：`pan→pan_left`、`track→truck_right`，注释自承"默认方向"；`:139-141` 未命中静默回落 medium/eye_level/static 无告警 |

**对前版表格的修正与补充：**

1. **运镜词汇表实际有四种，不是三种**：VLM 推断器使用 `push/pull`（preset 词表）→ 映射为 `dolly_in/dolly_out`（cogen 词表）（`vlm-shot-inferrer.ts:70-71`），即 preset 词表 → cogen 词表 → fill 提示词虚构词表 → `camera-movements.ts` 真值，四套并存。
2. **表格遗漏的提示词行**（优化方案 §3 已补齐）：镜头数规划 `analyzeSceneStoryboardNeeds`；正文救援 `SCRIPT_BODY_ONLY_PROMPT`；截断续写提示词（`ai-call.ts:602-637`）；图像侧三个指令片段——多角色合成融合指令 `COMPOSITE_FUSION_PREFIX`、编号参考板说明 `buildBoardPromptNote()`、楼层平面图还原指令 `appendLocationFloorPlanReference`；故事锚点前缀 `buildStoryAnchorPrefix()`。
3. **一个有利事实前版未提及**：`script-generator.ts:228` 注释显示共享片段重构时曾"以 buildPrompt 输出哈希校验逐字节一致"——项目已有 prompt 快照验证的实践，本方案 §5 的验证策略可直接沿用此机制。
4. cogen 约束 9 的示例（`storyboard-cogen.ts:225`"素白衣裙/淡青披风"）虽非具体项目名，但同样是古风偏置示例，一并纳入中性化处理。

---

## 1. 优化总则

| # | 原则 | 含义 |
|---|---|---|
| P1 | **协议骨架代码内单一事实源** | 输出 marker、JSON schema、字段名、枚举词表是提示词与解析器的通信协议，必须留在代码且全库只定义一次；禁止复制（现状反例：运镜枚举 4 处、镜头语言说明 4 处、古风判定 2 处） |
| P2 | **业务变量全部注入** | 题材方法论、时代约束、语速、风格、背景、时长、画幅一律来自项目配置/DB，代码零硬编码；任何业务特定字符串全库只允许一个定义点 |
| P3 | **示例中性化或模板化** | 提示词正文示例不得含真实项目名/人名；用中性占位（角色甲/某府书房）或按体裁模板渲染 |
| P4 | **提示词与校验同源同口径** | 提示词声称的校验必须真实存在且口径一致（反例：约束 6 说 1~10s 校验只查正数；约束 13 禁引号台词无校验；纠错提示词与校验文案互相矛盾） |
| P5 | **跨环节一致性靠数据契约** | 台词、服饰、风格的一致性用结构化字段+机器校验保证，自然语言叮嘱只作辅助（反例：台词双载体无校验、服饰校验弱口径、风格四注入点） |

---

## 2. 基础设施改造（所有提示词优化的前置）

### 2.1 统一提示词上下文对象 `PromptContext`

新建 `episode-production/prompts/prompt-context.ts`，定义全链路统一注入上下文，所有 prompt builder 统一签名 `(input, ctx: PromptContext)`：

```ts
interface PromptContext {
  storyEra?: string; storyRegion?: string; storyExtra?: string;   // 故事背景（现有字段）
  genre: GenreProfile;          // 体裁档案，见 2.2
  language: string;             // 台词语言，决定语速与纪律
  speechCharsPerSec: number;    // 语速，按语言默认值可覆写
  stylePrompt?: string;         // 项目风格词（现有 config.stylePrompt）
  aspectRatio: string;          // 画幅（现有 config.aspectRatio）
  targetEpisodeDurationSec?: number; // 目标集长（新增配置）
}
```

由 `computeEpProductionState` 同源构建，保证 Agent 快照、剧本、分镜、关键帧、视频各环节拿到的是**同一份**上下文。

### 2.2 项目配置扩展与体裁档案注册表

- `project.config` 新增：`genre`（`short_drama | series | film | animation | custom`）、`language`（默认 `zh`）、`speechCharsPerSec`（缺省按语言表：zh=4.5、en≈15 chars/s≈2.5 words/s，可覆写）、`targetEpisodeDurationSec`。
- 新建 `prompts/genre-profiles.ts`：**体裁档案注册表**，每个体裁声明——剧本纪律片段（短剧纪律只挂 `short_drama`）、节奏密度偏好、时代约束模板（见 2.5）、示例集。`custom` 允许项目级覆写任意片段。`writing-methodology.ts` 的短剧内容整体迁入 `short_drama` 档案，不再是默认注入。

### 2.3 枚举注册表单一事实源

新建 `prompts/cinematic-registry.ts`，以 `camera-movements.ts` 的 25 预设为基准扩展为全量注册表：

```ts
// 每个枚举值一条记录，提示词文本、UI、映射全部由此生成
{ value: 'push', zhLabel: '推镜', enPhrase: 'slow push in', category: 'basic',
  promptHint: '...', vlmAliases: ['push', 'dolly_in'] }
```

覆盖：景别（8）、运镜（25）、角度（8+）、转场（8）、焦距（5 档）、光圈（5 档）、相机风格（4）、打光（12）。**消费点**：cogen/旧生成器/AI 填空/VLM 推断的提示词枚举段（自动生成）、`segment-planner` 中文标签表、VLM 映射表、UI 下拉、fillStoryboardFields 白名单校验——全部 `import` 同一注册表。废除 `dolly_in/dolly_out` 等平行词表（保留 alias 兼容存量数据）。

### 2.4 提示词片段注册表 + 快照测试

- 共享片段（BINDING_CONSTRAINT、SCENE_JSON_EXAMPLE、FIELD_QUALITY、PACING_DENSITY、命名纪律、情绪外化、资产引用标记纪律）集中到 `prompts/specs/`，每片段单文件单导出；`shot-pacing.ts` 并入，cogen 约束 6 改为引用而非内联重写。
- 全链路占位符填充统一 `fillPromptTemplate`（消除 `String.replace` 的 `$&` 注入面）。
- 对关键 prompt 建立 **golden snapshot 测试**：固定 PromptContext + 固定输入 → 渲染结果哈希比对（沿用 `script-generator.ts:228` 既有哈希校验实践，扩展为测试基建）。此后任何片段改动必须显式更新快照，漂移可视化。

### 2.5 时代档案替代朝代正则

- 删除 `ANCIENT_ERA_PATTERN` / `ANCIENT_ERA_RE` 双实现，改为 `genre`/`eraProfile` 显式配置：`eraProfile { key, label, constraintSuffix, negativeExtra }`。内置 `ancient_chinese`（现古风后缀与 negative 词表迁入）、`modern`、`near_future` 等模板，项目可选或自定义。
- **所有时代都注入时代锚**，不只是古风：关键帧/资产图 prompt 无条件携带 `故事年代/地域` 文本（现在只有命中古风正则才有约束，"1980 年代""近未来"完全无锚）。
- `appendAssetSettingAnchors` 的关键词存在性检查改为**结构化判定**（检查 effective 数据字段是否已进 prompt，而非正则扫文本），消除"万岁"类假阴性；`stripSystemConstraints` 的剥离清单由约束常量本身自动生成，消除文案耦合。

---

## 3. 逐提示词优化方案

按流水线顺序，覆盖全部 22 个提示词点（含前版表格遗漏行）。每条给出：**现状问题 → 目标结构 → 改动清单**。

### 3.1 Agent 系统提示词 `epAgentSystemPrompt()` + 快照 `epStateToSnapshot()`

**现状**：纪律覆盖较好；但快照缺风格/画幅/时长、地点物品只有计数没名字（纪律 5/6 空转）；无删除确认与取消语义；频控数字与代码 `EP_TOOL_MAX_CALLS` 双写。

**目标结构**：
1. 角色与流水线认知（不变）
2. 纪律清单——数字全部从常量渲染（`资产生成每轮限 ${EP_TOOL_MAX_CALLS.short} 次`），新增：破坏性操作（删除/覆盖/force 重写）必须先经 `ep_confirm_choice`；用户可中断，中断后先重算状态再续作
3. 状态快照——注入完整 PromptContext 摘要（风格词、画幅、目标集长）+ 三类资产**全名名单**（地点/物品各给前 N 名，N=8 与角色对齐，超出注"+M 个"）

**改动**：快照格式器补字段；纪律文本模板化从常量渲染；新增删除确认纪律。

### 3.2 旧 Agent 决策提示词（`ep-agent-context.ts`）

**处置：退役，不优化。** 其动作清单只覆盖到分镜、快照/确认协议与主路径双份维护已分叉，优化它是负资产。建议：删除 `EP_AGENT_HARNESS='0'` 回退分支与 `DECISION_SYSTEM_PROMPT`（或冻结一个版本周期并标注 deprecated，确认无依赖后删除）。

### 3.3 故事原文生成 `STORY_TEXT_SYSTEM_PROMPT` + `buildStoryTextUserPrompt()`

**现状**：全链路最干净，背景变量注入完整。缺：体裁/风格/受众入参；未声明下游保真校验依赖"带引号对白"。

**改动**：
- `EpAiGenerateTextRequest` 增加可选 `genre`/`style` 字段，经 PromptContext 注入体裁档案的叙事要求片段。
- system 增加一条契约声明："**人物对白必须使用引号标出**（本故事将被改编为剧本，对白需可逐句提取）"——把 §4 保真校验的隐含前提显式化到上游。
- 长度 800–3000 字改为按目标集长推算（`targetEpisodeDurationSec` × 系数），保留硬上下限。

### 3.4 剧本生成家族（6 个提示词，同契约）

覆盖：整集生成 `SCRIPT_GENERATION_PROMPT`、续写 `SCRIPT_CONTINUATION_PROMPT`、粘贴拆分 `SCENE_SPLIT_FROM_TEXT_PROMPT`、梗概→场景（内联）、单场景重拆（内联）、正文救援 `SCRIPT_BODY_ONLY_PROMPT`。

**现状**：缺故事背景注入；短剧纪律写死；纪律标题双写；主路径 `replace` 有 `$` 风险；梗概→场景手抄片段已漂移；台词双载体无一致性声明；narration 零质量规范；示例古风偏置。

**目标结构**（骨架 + 片段，全部来自注册表）：
1. 角色定位（通用"职业编剧"，删重复人设）
2. 输出协议骨架（marker/schema——P1 代码单源，不变）
3. **【故事背景】**（新增：era/region/extra 经 PromptContext 注入）
4. **体裁纪律片段**（按 `genre` 从体裁档案注入；非短剧项目不再出现"爽点/卡点"）
5. 保真纪律 + **台词单一来源声明**（新增，见 §4.1）
6. JSON 示例与字段质量规范（**示例中性化/多体裁**：闺房青花瓷改为中性示例或按体裁档案选示例集；narration 补质量规范：40-150 字、只写画面外信息、不与对白重复）
7. 花名册 + 章节内容

**改动清单**：
- 占位符填充全部改 `fillPromptTemplate`（`:924-927`、`:1037-1040`、`:1367-1371`）。
- 删 `SCRIPT_ADAPTATION_DISCIPLINE_SPEC` 外层重复标题，纪律片段由体裁档案提供（标题只出现一次）。
- `generateScenesFromSynopsis` 内联提示词改为复用共享片段拼装，输出 marker 统一为新【场景数据】格式（解析层保留旧格式兼容一个周期）。
- 台词长度标准收敛：剧本侧沿用"每句≤20字为宜"，删除 `writing-methodology.ts:115` 的 30 字口径（或统一为 25 字单值），避免上下游标准打架引发保真误报。
- 目标场景数/时长约束：按 `targetEpisodeDurationSec` 给出场景数与总时长指导区间（缺省不注入）。

### 3.5 场景润色 `scene-polisher.ts`

**现状**：注入最全；但无相邻场景上下文；合并代码容忍增删与提示词"禁增删"矛盾；无保真校验。

**改动**：
- user prompt 增加可选段【相邻场景摘要】（前后各一场的 location/mood/出场角色+服饰关键词，各截 200 字），供跨场服饰/情绪连续参考。
- 合并逻辑收紧：AI 返回条目数与输入不一致时**按 id 对齐后丢弃多余条目并记 warn**（与提示词"不增删"对齐），不再以 AI 数组为基准。
- 润色后对白与 `originalText` 做一次覆盖度比对（复用 `script-coverage.ts`），缺失降级为 warn 呈现在 UI。

### 3.6 设定反推 `setting-enrichment-prompt.ts`

**现状**：`_evidence` 溯源设计好；system 无故事背景（第一批资产无时代锚）；race schema 双份定义；role 枚举要求填下游丢弃字段。

**改动**：
- system 注入【故事背景】段（来自 PromptContext）。
- race 枚举收敛到注册表单份（`asset-setting-enrichment.service.ts:258` 改为 import）。
- role 字段保留（叙事元数据有独立用途），但在 prompt 中注明"role 仅用于叙事参考，不影响图像生成"，消除"填了被丢弃"的误导。

### 3.7 资产主图 prompt（身份段 + 三类约束 + 锚点前缀 + 平面图指令）

**现状**：字段齐、幂等追加可靠；古风正则硬编码且与关键帧侧词表漂移；宏观地点词表纯古风；幂等靠文案 includes 脆弱。

**改动**：
- 古风约束 → 时代档案（§2.5），`isAncientEra` 双实现删除，单实现按 `eraProfile.key` 判定。
- `FLOOR_PLAN_MACRO_KEYWORDS`/interior 词表迁入体裁/时代档案，补充现代词（大楼/商场/园区/loft）；判定逻辑不变。
- 约束常量化重构：所有约束文本集中导出，`append*`（includes 幂等）与 `stripSystemConstraints`（剥离）从**同一份常量**生成，文案改动自动同步。
- `buildStoryAnchorPrefix` 改为无条件注入时代/地域（不仅锚点缺失时），与 §2.5 对齐。

### 3.8 分镜 cogen `buildCogenPrompt()` + `buildCorrectionPrompt()`

**现状**（问题密度最高）：无背景/风格/总时长；项目名示例；4.5 字/秒硬编码；旁白无承接字段；节奏分档双份已分叉；duration 三处口径不一；约束 13 无校验；纠错指令与校验文案矛盾；约束编号 10a/13a 补丁号。

**目标结构**：
1. 任务说明（资产识别 + 分镜设计）
2. **【故事背景与风格】**（新增：era/region/extra + stylePrompt + 目标时长，来自 PromptContext）
3. 项目已有资产（不变）
4. 场景剧本（对话与**旁白均带 id**，见 §4.2）
5. 镜头语言枚举段（**由注册表自动生成**，§2.3）+ 输出 schema
6. 强约束（重排为连续编号；全部经快照测试锁定）

**改动清单**：
- 约束 6 节奏分档改为引用 `PACING_DENSITY_SPEC` 共享片段（与 `shot-pacing.ts` 单源）；"打脸/短剧留存底线"等短剧话术移入 short_drama 体裁档案；补"duration 之和 ≈ 目标场景时长"硬规则（现状提示词无目标根本无法执行）。
- 语速变量化：`校验会按 ${ctx.speechCharsPerSec} 字/秒硬核算`；`SPEECH_CHARS_PER_SEC` 常量、提示词、前端 `ShotPromptEditor.vue:152` 三处统一从配置读取。
- 示例中性化：`@[沈云萝]`→`@[角色甲]`、`@[秦越@2]`→`@[角色乙@2]`、"雪麓山庄书房"→"某山庄书房"、"曼陀罗花/忘忧草"→"剧本写"赤芍"就不得改成"白芍""式中性示例。
- `CogenShot` schema 增加 `narrationId?: string`；场景剧本的旁白行前加 `nrt_1` id；校验增加旁白覆盖检查（有旁白则必须被一个镜头承接）。
- duration 口径统一：提示词、校验、节奏告警统一 1~10s（呼吸镜头 3-8s 落在区间内，无需例外）。
- 约束 13 补机器校验：frameDescription 含引号包裹文本（复用 `stripDialogueQuotes` 的正则检测）→ 校验报错而非下游静默剥离。
- 纠错提示词与校验文案对齐：覆盖类错误的文案改为"**调整既有镜头**的 dialogueIds 分配或为既有镜头补充承接动作，仅当既有镜头确实无法容纳时才允许新增镜头"，消除与"不得增删镜头"的矛盾。
- 约束 9 服饰校验强化见 §4.3。

### 3.9 旧分镜生成器（镜头数规划 / 单镜 / 批量）+ AI 填空

**处置建议：分批收敛到 cogen，不平行优化。**
- UI 单场景"生成分镜"按钮改走 cogen（cogen 本就是单场景粒度，且校验强度全面优于旧路径），`storyboard.handler.ts:332-370` 改路由后，批量/单镜/镜头数规划三个提示词随旧生成器退役。
- **若需保留过渡**：必须修 P0——批量模式对话/旁白行加 id（与 cogen 的 `dialogueDisplayId` 同口径），schema 要求才有意义。
- **AI 填空 `fillStoryboardFields`（保留，UI 在用）**：
  - 运镜/角度/焦距/光圈/打光枚举段全部由注册表生成（修复 ~60% 虚构值）；
  - 输出校验加白名单：cameraMovement/aperture/cameraStyle/lighting 全部按注册表校验（焦距已有白名单，扩展同机制）；非法值拒绝落库并回喂纠错；
  - `@[沈云萝]`/`雪麓山庄书房` 示例中性化；
  - 枚举中文标签（detail/dutch 等）从注册表取，消除三套标签。

### 3.10 VLM 镜头推断 `vlm-shot-inferrer.ts`

**现状**："短剧分镜助手"定位；pan/track 方向捏造；静默兜底；`durationSec` 注入无消费。

**改动**：
- system 定位改"专业影视分镜分析师"。
- 运镜枚举直接采用注册表值（含方向：`pan_left/pan_right/truck_left/truck_right`），让 VLM 判断方向而非默认捏造；映射表从注册表 `vlmAliases` 生成。
- 未命中映射时**记 warn 并落 `metadata.vlmUnmapped`**，不再无声变默认值。
- `durationSec` 从 user prompt 移除（schema 无消费字段），或 schema 增加"该帧建议镜头数"字段消费之——二选一，消除无效上下文。

### 3.11 分镜缩略图网格 `storyboard-thumbnail-generator.ts`

**改动**：
- **修 P0**：节奏拍数按 `count` 动态生成（9→setup×1/dev×2/conflict×2/climax×2/result×1/coda×1；16/25 按比例展开），或干脆限定 count=9（UI 只暴露 9）——二选一，消除指令矛盾。
- 画幅：cell 尺寸按 `aspectRatio` 计算（16:9 剧集用 480×270 cell），grid 布局指令写明横竖比。
- 一致性：若项目已有角色主图，取前 2 张作参考图注入（`referenceImagePaths` 不再恒空），"同一角色每帧脸型一致"的要求才具备可兑现的输入。

### 3.12 关键帧 prompt `buildKeyframePrompt()`（含融合指令、参考板说明）

**现状**：13 段组装清晰、风格让位机制合理；但角色段性别/年龄/人种/styleAnchors 断链；非古风时代无锚；风格词四注入点；古风第二实现；审核示例含"阿蘅"。

**改动**：
- 角色段（第 6 段）扩展为完整身份：`名字, 性别, 年龄, 人种, 外貌, wearing 服装, 表情, 动作, positioned 位置`（数据从 effective 投影取，与资产身份段同源）；styleAnchors 并入第 1 段风格前缀的组成。
- 时代锚：第 4 段地点后新增时代/地域文本（无条件注入，§2.5）；古风硬约束段（第 13 段）改由时代档案驱动，与资产图侧同一份后缀文本。
- **风格单一来源**（§4.4）：明确优先级并写入代码注释——有角色参考图时用 REFERENCE_MATCH_STYLE_PREFIX 管主体、qualitySuffix + stylePrompt 管非主体区域；`keyframe-generation.service.ts:1266` 的尾部追加改为 builder 内部统一组装，prompt 只在 builder 一处成型。
- `COMPOSITE_FUSION_PREFIX` 与 `buildBoardPromptNote`：内容通用无需改；纳入快照测试防漂移。

### 3.13 VLM 审核 `keyframe-review.service.ts`

**改动**：
- issues 示例中性化："阿蘅的服饰：参考图是素白医袍，关键帧是红色长裙"→"角色甲的服饰：参考图是白色长袍，关键帧是红色短裙"。
- 检查项增加**时代一致性**（"画面元素不得与提示词声明的时代背景矛盾"，如古装出现手表）与**地点/物品相似性**（不仅"在不在"还要"像不像"）。
- `isVisionCapable`：从 provider 配置的模型元数据（capabilities 字段）读取多模态能力，废除模型名正则猜测；无元数据时才回落名字启发式并记 warn。

### 3.14 片段视频 prompt `buildSegmentPrompt()`

**现状**：全链路组成最合理（台词单一来源真正落地）。缺口：运镜只认 cogen 词表，25 预设静默丢失；言语动词表 24 个有限。

**改动**：
- 镜头头枚举→中文标签从注册表生成（§2.3），25 个预设全部可达视频模型。
- `stripDialogueQuotes` 动词表改为**开放模式**：`[说道问喊叫骂喝冷笑道等]+[""''「」『』]` 的动词部分改为通用"任意 1-6 个汉字动词+冒号/地说"模式匹配，配合约束 13 的机器校验（§3.8），双保险后散文台词基本绝迹，动词表退为补充。

### 3.15 资产引用三段式 `buildAssetRefPrompt()`

**现状**：协议完整、红线显式、选图跨链路同口径，是设计标杆。改动仅两条：
- 外观摘要 80 字硬截断改为按句截断（不截半个词）。
- 道具归属：物品资产卡增加结构化字段 `ownerBindingId?`（设定反推 schema 同步增加），"物品仅出现在归属人物身上"从自然语言推断升级为数据契约。

### 3.16 截断续写提示词（`ai-call.ts:602-637`）

**现状**：机制通用可靠，无需功能改动。改动：纳入共享片段注册表与快照测试（它服务的 marker 协议变更时需同步）。

---

## 4. 跨环节一致性专项

### 4.1 台词单一来源立法

- **剧本层**：`SCRIPT_GENERATION_PROMPT` 增加声明——"`scenes[].dialogues[].text` 是台词的唯一事实源；剧本正文中的对白必须与 dialogues 逐字一致（正文是展示视图，dialogues 是数据）"。
- **校验层**：`script-coverage.ts` 的 haystack 剔除剧本正文（正文命中不再算覆盖）；新增正文↔dialogues 双向一致性比对（对白在正文出现但不在 dialogues → warn；dialogues 文本与正文对应行不一致 → warn）。长句"首尾各 8 字命中即算覆盖"收紧为"完整包含或编辑距离 ≤10%"。
- **下游**：配音（dialogues[].text）、视频台词段（dialogue_links）、cogen 校验（dialogueIds）已是单一来源，不变。

### 4.2 旁白获得一等公民地位

剧本 schema 的 `narration` 改为 `{ id: 'nrt_1', text: string }`（存量数据迁移时回填 id）；cogen prompt 旁白带 id 注入、`CogenShot.narrationId` 承接、校验覆盖；视频段旁白音频与镜头对齐有数据依据（现状旁白音频是场景级一条，与分镜时间轴无关联，合成时靠场景边界对齐）。

### 4.3 服饰/外貌一致性校验强化

cogen 约束 9 校验从"整个 frameDescription 任意位置命中 1 个 ≥4 字片段"升级为：
1. 限定【人物】段（四段式解析后取人物段做匹配）；
2. 资产卡按服饰/外貌**分要素**切片段（outfit 字段独立校验，description 的外貌句独立校验），每个要素至少命中 1 个片段；
3. 片段长度下限从 4 字降为 2 字（"红衣""玉簪"可参与），同时对 2-3 字片段要求**词边界命中**（避免"红衣"命中"红衣架上"式假命中——中文可按标点/停顿切分后比对）；
4. 关键帧侧：VLM 审核检查项已含人物一致性（§3.13 加强后形成第二道闸）。

### 4.4 风格单一来源

定义风格解析函数 `resolveStyle(ctx) → { prefix, suffix, negative }`，全链路唯一入口：
- 组成：`styleConfig.stylePrefix`（或无参考图时）/ REFERENCE_MATCH_STYLE_PREFIX（有参考图时管主体）+ styleAnchors（资产级）+ `config.stylePrompt`（项目级）+ qualitySuffix + negative。
- 消费点收敛：资产主图（`buildStoryAnchorPrefix` 并入）、关键帧（builder 内成型，删 `:1266` 尾部追加）、视频段（`segment-planner:236` 改调同一函数）、缩略图（§3.11）。
- 分镜【氛围】段的色调描述定位为"叙事氛围"，与风格词职责区分，在 cogen 提示词中写明"色调词只描述情绪基调，画风由系统统一注入"，避免模型在文本里重复定义画风。

### 4.5 保真校验可见性

覆盖度校验结果从 `console.warn` 升级为：落 `script.metadata.coverageReport` + UI 剧集页显示覆盖率徽章（点击看缺失清单）；agent 动作的总结中附带覆盖率数字。校验本身不阻断（保持现状语义），但让"丢对白"从事故变为可见指标。

---

## 5. 实施顺序与验证

### 阶段划分

| 阶段 | 内容 | 风险 |
|---|---|---|
| **Phase 0 活 bug**（1-2 天） | AI 填空运镜枚举接注册表+白名单（§3.9）；批量模式对话/旁白带 id 或按钮改走 cogen（§3.9）；缩略图 count 矛盾（§3.11）；VLM 方向枚举（§3.10）；示例中性化全部（§3.8/3.9/3.13） | 低，均为局部改动 |
| **Phase 1 基础设施**（3-5 天） | PromptContext（§2.1）、体裁档案注册表（§2.2）、枚举注册表（§2.3）、片段注册表+快照测试（§2.4）、时代档案（§2.5） | 中，快照测试先行可锁住行为 |
| **Phase 2 注入补齐**（2-3 天） | 剧本家族+背景与体裁片段（§3.4）、cogen 背景/风格/时长（§3.8）、关键帧身份与时代锚（§3.12）、Agent 快照（§3.1）、故事原文契约（§3.3）、设定反推背景（§3.6） | 中，prompt 变更需重跑实测 |
| **Phase 3 一致性专项**（3-4 天） | 台词单一来源（§4.1）、旁白 id（§4.2，含数据迁移）、服饰校验强化（§4.3）、风格单一来源（§4.4）、保真可见性（§4.5） | 高，§4.2 涉及 schema 迁移 |
| **Phase 4 退役清理**（1-2 天） | 旧 agent 路径（§3.2）、旧分镜生成器（§3.9）、新旧 marker 兼容层、双写常量清理 | 低，先冻结观察一个版本 |

### 验证策略

1. **快照测试**：Phase 1 落地后，对现有全部 prompt 先生成基线快照（锁定当前行为），后续每个改动只应产生预期 diff——这是防止"优化引入新漂移"的核心机制。
2. **回归实测**：用历史事故项目（雪麓山庄、忘川渡、杜十娘案例的底稿）各跑一遍 剧本→分镜→关键帧 三步，比对：台词覆盖率（§4.5 的报表直接给数）、服饰命中率（约束 9 校验日志）、运镜落库合法率（fillStoryboardFields 白名单拦截数应为 0 漏网）。
3. **通用性验证**：虚构一个现代都市题材 + 一个英文题材项目跑剧本→分镜，检查点：prompt 快照中无"短剧/古风/朝代"字样、语速校验按配置值、无中文专属话术出现在英文项目 prompt 中。
4. **一致性指标**：约束 9 强化后，用历史分镜数据离线重放校验，统计"旧口径过/新口径不过"的比例，评估误伤率后再定是否启用硬拦截（可先 warn 一周）。

### 明确不做的事

- 不把协议 marker/JSON schema 挪入 DB 或系统变量——它们是代码契约（原则 P1），挪出只会重现运镜枚举式漂移。
- 不为旧路径（旧 agent、旧分镜生成器）做任何提示词优化——直接退役。
- 不在本方案改动 TTS 与 ffmpeg 合成（无 LLM 提示词）；其一致性收益来自 §4.1/§4.2 的数据契约改善。
