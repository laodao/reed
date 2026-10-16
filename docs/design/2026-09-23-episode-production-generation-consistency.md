# 剧集制作模块：生成链路、提示词与一致性设计全解

> 日期：2026-09-23
> 范围：`src/core/platform/episode-production/`（业务核心）、`src/core/packs/episode-production/handlers/`（IPC）、`src/renderer/src/`（前端）、`resources/skills/ep-*`（技能包）
> 说明：本文基于当前最新代码（cogen 联合生成 + assetRef 视频路径为新主线）梳理，旧路径仅作对照标注。

---

## 第一部分：模块全景与业务流程

### 1. 模块定位

「剧本 → 资产 → 分镜 → 视频 → 配音 → 合成导出 MP4」的短剧 AI 生产流水线，桌面端（Electron）为主，Web 端共享部分组件（导出等依赖 ffmpeg 的能力仅桌面端）。

### 2. 七阶段状态机

`src/core/platform/episode-production/workflow/episode-status.machine.ts:23-41`

```
pending(①内容) → asset_prep(②资产) → scripting(③剧本) → storyboarding(④分镜)
  → producing(⑤制作) → composing(⑥合成) → completed(完成，终态)
```

门禁策略「软引导 + 末端硬锁」（`stage-gate.service.ts:81-126`）：

- 回退、同状态永远允许；前向跳中间阶段可 force（UI「仍要进入」）。
- 进 ⑤ producing 叠加「分镜完成 + 全部资产主图齐备」校验（仍可 force）。
- 进 completed 是唯一硬锁：所有分镜有 videoPath，`canForce=false`。
- 各阶段完成判定：① 有大纲或已识别要素；② ≥1 个资产绑定；③ 剧本 approved；④ 每场景 ≥1 分镜；⑤ 所有分镜 videoPath 非空；⑥ `composed_video_path` 非空。
- 状态写库原语：`advanceEpisodeStatus` 只前进 / `regressEpisodeStatus` 只回退（`episode-status-advance.ts`）。

### 3. 数据模型主线（19 张表）

```
video_projects 1─N video_episodes 1─1 episode_scripts 1─N scene_scripts 1─N storyboards
                                                              ├─N storyboard_keyframe
                                                              └─N ep_video_segments（片段归属）
character_bindings / location_bindings / item_bindings（挂 project，双轨制）
asset_image（统一图谱：category=main/view/expression/outfit/.../panorama_360，confirmed 定妆闸门）
```

关键字段：

- `storyboards`：shotType/cameraAngle/cameraMovement、frameDescription（四段式）、characters[].characterId（= binding.id）、dialogueIds/narrationId/actionIds、duration、transition_*、segment_id/seq、video_path、video_mode、referenceImageIds。
- `scene_scripts`：locationBindingId 强约束 + characters/dialogues/actions（JSON 列 + 归一化 bridge 表双写，读取归一化优先）。
- 资产双轨：`linked_lw`（关联长文写作实体 + override 覆盖列）/ `standalone`（独立创建）。
- 项目 config：分环节模型（scriptModel/storyboardModel/imageModel/videoModel/audioModel）、renderPath（默认 assetRef）、segmentDurationBudgetSec（默认 15s）、styleAnchors/stylePrompt。

### 4. 端到端主流程

1. **建项目/剧集**：首页粘贴剧本按章拆集 / creator 页上传或 AI 写原文 / 关联长文模块章节（outlineId）。
2. **剧本**：`generateFullScript` 一次 LLM 产出场景 JSON + 梗概 + 正文 → 事务化删旧建新 → 完整性校验（12 种违例）→ approved 定稿；支持增量追加（prepare→append）。
3. **资产**：AI 识别（前 5000 字）建 binding → 主图生成（身份段 + 定妆约束）→ 用户 confirmed 定妆 → 图集派生（三视图/表情/服饰）。
4. **分镜（cogen 主路径）**：每场景一次 LLM 同时产「资产清单 + 2~8 分镜」，ID 全部由代码回填 → 纠错重试 ≤2 次 → 替换式落库 + 落库后断言。
5. **分段**：场景边界必切 + 15s 时长预算切分（幂等，旧段 superseded）。
6. **视频（assetRef 默认路径）**：资产主图/编号参考板 + 三段式声明 prompt → imageToVideo → taskId 落库 + 轮询 ≤75min → 产物下载落盘。
7. **配音**：场景级编排（旁白 + 逐条对白，音色 dialogue > binding > 系统兜底），事务落库。
8. **合成导出**：时间线 → 按片段合并合成单元 → xfade 链 + loudnorm 混音 + SRT 烧录 → 一条 ffmpeg 命令出 MP4 → composed_video_path + completed。

---

## 第二部分：各环节「遵循什么、提示词、上下文」详解

一致性总原则：**凡能由代码保证的绝不让模型保证**——ID 回填、编号接续、参考图选择、时长预算全部由代码侧收口；模型只负责创作，输出经 schema 校验 + 纠错重试 + 落库后断言三道关。

### 环节一：剧本生成

代码：`narrative/ai/script-generator.ts`（1373 行）

**应遵循的内容规范**（6 个共享 prompt 片段，生成/续写/拆分三入口复用防规范漂移，`:29-218`）：

1. **binding 强约束**（BINDING_CONSTRAINT_SPEC）：所有引用必须填 binding ID，找不到填 null，「不要瞎编 ID」。
2. **场景拆分原则**：地点变 / 时间跳 / 主要角色组合变 / 氛围变 → 拆新场；每场有明确视觉焦点。
3. **场景 JSON 示例**：sceneNumber/location/locationBindingId/timeOfDay/weather/sceneDescription/mood/lighting/characters/dialogues/actions 完整字段示范。
4. **字段质量要求**：sceneDescription 按「空间布局+陈设材质+关键物件」三段式；outfit 格式「服装名称（颜色，风格）」；对白必带 characterName 且逐字一致。
5. **短剧改编纪律**（SCRIPT_ADAPTATION_DISCIPLINE_SPEC）：黄金三秒（第一场直接冲突切入，禁环境铺垫）、台词口语化短句 ≤20 字、每场三句对白内浮出冲突、集尾「切在问题上不切在答案上」、角色首出场给完整外貌锚定。
6. **原文保真纪律**（SCRIPT_FIDELITY_SPEC，丢对白事故驱动）：每句带引号对白必须出现在 dialogues、不得整句删除或合并两句；约定/伏笔/反转/口头禅全保留；确需省略须在梗概末尾写「省略说明」；自检标准「任意一句原文对白找不到对应台词即不合格」。

**上下文清单**：章节正文（uploaded 文本或长文 outline 递归聚合 lw_chapters）+ 资产花名册 roster（`- bindingId: xxx, 名称: xxx, 描述: xxx`，空则输出 `(无)` 防格式幻觉）。

**输出约定**：三段 marker【场景数据开始】【梗概开始】【剧本正文开始】；maxTokens 16000、temperature 0.3。

**代码侧后处理（一致性防线）**：

- 截断续写：正文无结束标记时取末尾 1200 字续写一次；JSON 括号未闭合走 `callAIWithContinue`（≤2 次）。
- 解析多级兜底：新中文 marker → 旧 ===XXX=== → ```json → 括号配平，全程 pathTrace 日志。
- binding 三级兜底：AI 给的 ID 命中 → 按名反查 → null 交 validator 标违例。
- **原文覆盖度校验**（`script-coverage.ts`）：正则提原文带引号对白（4-120 字），归一化后包含匹配，长句首尾各 8 字命中即算覆盖；缺失只 warn 不阻断（提示词纪律之外的代码双保险）。
- 落库事务化：删旧场景（级联清分镜/关键帧/片段 supersede）+ 建新场景同事务。

**续写（增量追加）**：SCRIPT_CONTINUATION_PROMPT 注入三段只读上下文——已有正文全文 + 已有场次一览（每场「第N场|地点|内外景|时段|描述前60字」）+ 续写要求；强约束「场次号接续、严禁重复已有场次/正文」。写库前 `offsetSceneNumbers` 不信 AI 编号强制重排、`reassignRefIds` 重发 dlg_/act_ id 防主键冲突。

### 环节二：资产识别（角色/地点/物品）

代码：`src/core/packs/episode-production/services/story-to-video-ai.service.ts`

**应遵循的识别原则**：

- 角色：主角=核心+出场频率最高；配角=重要互动；反派=制造冲突；次要=有名或特定身份；**「无名无姓的路人、群体描述不计入」**。schema：name/description(外貌/性格/身份)/role/age/gender/race。
- 地点：忽略模糊空间（"远方""某处"），同一地点不同描述合并。schema 加 type（city/village/palace/forest…）。
- 物品：只收推动情节/特殊意义/主角使用的关键物品，忽略日常用品，同名合并。

**上下文**：只取正文前 5000 字；`callAIWithContinue` 防截断。

**一致性保障**：落库按归一化名字项目级 + 批次内去重，`createStandalone` 内部 find-or-create 兜底（角色含 alias）——保证「同一实体全项目只有一份 binding」，这是后续一切引用一致性的地基。

### 环节三：分镜生成（cogen 联合生成，主路径）

代码：`narrative/ai/storyboard-cogen.ts`（637 行）+ `services/storyboard-cogen.service.ts`

**核心设计**：一次 LLM 调用同时产出「本场景资产清单 + 2~8 个分镜」，**ID 回填全部由代码侧完成（D2 原则，不让模型回填 ID）**。

**上下文清单**（`buildCogenPrompt :98-218`）：

- 项目已有资产段：`- [角色] 名称（ID: cb_xxx）：描述`，段标题即强约束「直接引用，禁止改名、禁止重复创建」；描述过薄的已有资产会被新资产卡富化回填（带宏观地点污染守卫）。
- 场景剧本段：场景号/地点/时间/天气/场景描述/氛围/光线/出场角色/旁白/对话列表（**每行带 dialogueId**：`- {id} · {characterName}: "{text}" ({emotion})`）/动作列表。
- 镜头语言字典：景别 8 档、角度 6 档、运镜 14 档。

**14+ 条强约束**（`:199-217`）：

1. 镜头 2~8 个；开场远景建场、对话中近景、情感特写。
2. 角色名白名单 ⊆ 本响应资产 ∪ 已有资产。
3. 已有资产 existing=true、名称逐字一致、描述照抄可补充不得矛盾。
4. 新资产描述必须完整——**「这份描述就是定妆图与后续所有分镜文本的唯一依据」**（资产卡是单一事实源）。
5. frameDescription 四段式【场景】【人物】【动作】【氛围】，人物段服饰跨镜头不得漂移。
6. 镜头密度分档：钩子/冲突 1-1.5s（15s 片段 8-12 镜）；对话 1.5-2.5s（6-9 镜）；蓄势 2.5-4s；呼吸镜头 3-8s；**「每 2 秒 1 镜是短剧留存底线」**。
7. 地点恰好一个；物品只列需视觉一致性的关键物品。
8. 专有名词/药名/对白/数字/称谓逐字照抄原文，禁同义转述。
9. **服饰/外貌逐字引用资产卡原文**——代码侧 `appearanceFragments` 校验：资产卡按标点切成 ≥4 字片段，【人物】段须至少逐字命中一个片段，否则报错并列出可照抄片段。
10. 命名纪律：全程登记名一字不差，禁代词（"他/那个男人"）、禁群体量词（"三个人""众人"）。
10a. `@[登记名]` 资产引用标记（可选 `@[名字@图序号]` 指定槽位），代码解析为参考图后替换纯名。
11. 情绪具象外化词库（悲伤=低头/肩膀微颤/眼眶泛红…），禁抽象情绪词。
12. 台词长度适配镜头时长（3s 内只容一两句短语）。
13. 每句台词必须落在某镜头（说话角色+神态+听者反应），密集对白用对切。
13a. **对白全覆盖硬校验**：每条 dialogueId 恰好被一个镜头承接一次——遗漏/重复/引用不存在 id 均阻断。
14. 地点命名「大地名+区域名」（"雪麓山庄书房"），禁裸名。

**校验与纠错重试**：`validateCogenOutput` 产出编号错误清单 → `buildCorrectionPrompt` 把错误清单+上次完整输出喂回模型（「保持结构只修问题」「所有镜头全部角色自查」「已合规的保持原样」）→ 最多 2 次 → 仍失败 throw「旧分镜保留，宁缺毋滥」。落库后 D4-2 断言：复读发现任一 characterId 为空即 throw。

**旧路径对照**（`storyboard-generator.ts`）：先 AI 估镜头数（只给旁白长度/对话数等统计量）再逐镜生成（注入上一镜信息防重复）；`normalizeAiCharacters` 三级反查修 characterId；对白未分配时纯代码平均兜底。

### 环节四：资产图制作（主图/图集/三视图/全景）

代码：`assets/prompts/asset-identity-prompt.ts` + `assets/services/main-image-generator.service.ts` + `gallery-derivation.service.ts`

**身份段拼装器（三类资产共用）**：`buildAssetIdentityPrompt` 固定顺序——name → description → （角色专属）性别/年龄/人种(中英双写)/外貌/服装/备选服装 → 风格（styleAnchors 中英双写）→ 故事年代/地域/背景。alias/role 明确不进 prompt（叙事 metadata 非视觉概念）。

**各类型专属约束**：

- 角色主图：`直立全身 + 纯白背景 + 正面均匀光照无阴影`（定妆照范式）；negative 合入背景杂物+全套阴影词+裁切词。
- 地点主图：**无人约束**（`no people, empty scene…` + negative 13 个人物词）+ 标准场地全景构图锚（水平线稳定、无畸变）。子区域自动取父级主图作参考（保持建筑群风格一致）；根地点**平面布局图先行**（宏观→鸟瞰总平面、室内→顶视平面图，禁文字标注），再以「俯视图转地面人视写实场景」指令生成主图；室内单间跳过平面图直接 T2I。
- 物品主图：居中清晰、标准产品视角、纯白背景、无文字水印 logo。

**横切一致性机制**：

| 机制 | 说明 |
|---|---|
| 故事锚点前缀 | binding.projectId → 项目最新一集 storyEra/Region/Extra → `时代背景：…；地域：…。` 头部注入（幂等） |
| 古风硬约束 | storyEra 命中古/武侠/朝代词 → 尾加「严禁现代建筑/服饰/物品/交通工具」+ negative 现代词 |
| 设定锚点补全（F1） | 性别/年龄/人种/外貌/服装缺失时自动补「人物设定锚点：…」段 |
| 钉模型 | 解析序：显式 > 项目 config.imageModel > 自动；自动挑到与主图不同源模型是风格分叉根因，故主图/派生/三视图全部钉同一解析序 |
| I2I 派生 + 身份保持 | 图集派生以主图为基图走 I2I，prompt 加极简「保持人物身份」；有视角映射的 slot 忽略用户提示词（同角色跨角度仅角度变化） |
| 定妆确认闸门 | 只有 confirmed=1 的图进入下游参考图池 |
| 照抄检测重拍 | 地点主图与参考图 aHash ≤10 判照抄，弃图改无参考重拍 |
| 占位行复用 | 用户预编辑 prompt 落在空 imagePath 占位行，生成成功直接回填，防孤儿行 |

### 环节五：关键帧生成（回切路径，当前默认停用但机制完整）

代码：`render/keyframe/keyframe-prompt-builder.ts` + `keyframe-generation.service.ts`

**链式策略**：先 start（无参考）→ 再 end（参考 start）→ 再 middle（参考首尾）；帧间不互喂图片，参考依赖只体现在 prompt「时刻语言」：start=「人物刚进入位置/动作即将展开」、end=「动作完成/情绪到位/镜头将切换」、middle=「场景中段（约X%）：动作过程」。重生成传播：改 start 建议连带重拍全部 middle+end。

**prompt 15 段拼接顺序**（`buildKeyframePrompt :328-435`）：

1. 风格前缀（**有角色参考图时让位**为 `REFERENCE_MATCH_STYLE_PREFIX`「画面风格、人物外观与参考图保持一致」——防写实风格词把 Q 版定妆照写实化）
2. 场景描述 → 3.【关键帧时刻】时刻语言 → 4. 地点段 → 5. frameDescription+主体 → 6. 角色段（name+外貌+wearing outfit+表情+动作+位置）
7. **角色形象一致性硬约束段**（原文：「同一角色在不同镜头/景别/时刻下必须容貌、装扮、发型、配饰完全相同」）
8. 物品段 → 9. 氛围/时间/天气 → 10. 构图 → 11. 景别/角度英文映射 → 12. 镜头扩展元数据（焦距/光圈/打光预设 promptHint）→ 13. 用户额外提示词 `[user direction]` → 14. 质量后缀 → 15. 古风硬约束
项目 config.stylePrompt 追加在完整 prompt 尾部。

**参考图选择**（collectReferenceImages）：顺序角色→物品→地点（地点最后，单图网关截断时保住角色）；每资产先看用户 override，否则 confirmed 池内评分（角色：视角+4/表情+3/服装+2；角色主图优先=身份权威锚点）；形象组其余 confirmed 成员一并入列。

**多角色锚定**（maxRefs==1 网关时）：合成锚定三步链——T2I 生成无人物场景草稿 → sharp 子进程抠图贴入角色主图 → 合成图作唯一参考 + 融合指令喂 kontext（「统一光影、去贴纸感、面容严格一致、场景布局不变、不得多余人物」）。

**E2 重拍闭环**：每帧最多 3 张——机检（aHash 照抄/空图纯色/参考板复刻/合成未融合）→ VLM 审核（人物一致性/内容覆盖/穿帮，输出 JSON）→ 不通过把问题摘要追加进 prompt 重拍；3 张全败则证据落 metadata 交视频闸门拦截。

### 环节六：视频片段提示词编写

代码：`render/video/segment-planner.ts` + `asset-ref-resolver.ts`

**多镜头提示词**（`buildSegmentPrompt :160-193`）：

```
镜头1（约5s，全景，推镜）：<frameDescription，台词引文已剥离>；台词：{沈云萝：…}；镜头2（…）：…。
总时长约9s，画面比例 16:9（1920x1080），多个镜头之间保持人物、场景、光影与风格一致，
镜头切换自然连贯，台词由对应人物以自然语速清晰说出，语音与各镜头时长匹配，不得加速、不得含糊、
不得念错字，画面风格：<stylePrompt>，画面中不得出现字幕、文字、水印、LOGO。
```

- 景别/角度/运镜枚举映射中文标签（15 档运镜全表）；`@[资产]` 标记剥成纯名（「界面所见即模型所得」）。
- 负向尾巴默认追加（字幕在合成阶段后加，烧进画面是事故）；`allowOnScreenText` 豁免剧情确需（手机屏/信件特写）。
- **台词结构化提交（2026-10-05 台词乱码修复）**：frameDescription 中 `说道："…"` 形式的台词引文在拼 prompt 时剥离（`stripDialogueQuotes`，只剥"言语动词+引号"结构，匾额类引号保留，DB 原文不动）；台词改由 `shots[].dialogues` 以声音符号协议 `{说话人：原文}` 附在所属镜头时段后——音视频联合模型拿到的是"镜头时段→说话人→台词"的精确对应，而不是埋在散文里的引文。台词数据源与字幕同口径：`storyboard_dialogue_links` 优先、`dialogue_ids` JSON 列兜底（`shot-dialogue-loader.ts`），不做池均分猜测。音频约束随台词有无切换：有台词→清晰发声要求；无台词→显式「人物不说话，仅环境音」防幻觉配音。

**资产引用三段式声明**（`buildAssetRefPrompt :190-224`，assetRef 路径核心）：

```
subject_definitions:
Picture 1 为资产参考板（多个编号分块…），仅作为画面主体外观来源：1号=雪麓山庄书房（场景：…）；2号=沈云萝（角色：…）。
要求：人物长相、发型、服装、配饰必须与对应编号资产完全一致；场景中每个人物只出现一次，
不得出现重复的人物、分身或残影；物品道具仅出现在其归属人物身上（见编号清单的归属约束），
不得套用到其他人物；不要求保留 Picture 1 的拼贴构图，画面按 summary 描述的机位、场景与动作自然呈现。

summary:
[reference generation + audio reference] <buildSegmentPrompt 产出，资产名首现处标注「（参考板第N号）」>

retention_analysis:
Subject 1（Picture 1 各编号主体）：fully_preserved - 仅保持主体外观与整体风格一致，画面按 summary 运动。
```

语义红线：**refs 只承载"主体外观来源"，绝不承载首帧构图**——必须显式声明「不要求保留拼贴构图」，否则模型照抄拼板版式。资产顺序固定「地点→角色→道具」；appearance 摘要 80 字截断；物品带归属约束（「仅沈云萝背负」类）压制道具串位；正文资产名标注长名优先防嵌套误标。

### 环节七：视频生成调用

代码：`render/video/segment-video.service.ts` + `provider-capability-matcher.ts` + `base-video-provider-bridge.ts` + `providers/video/sdk/comfyui-video.provider.ts`

**路径分流**：项目 renderPath 默认 assetRef；0 资产报错（ComfyUI H3 纯文生不可用）、1 资产原图直传、≥2 资产拼编号参考板（红底白字编号色块）。注意：assetRef 三段式声明段只有较弱措辞「不要求保留 Picture 1 的拼贴构图」，「严禁输出参考板本身的分栏/白底/编号」硬提示目前只在关键帧路径的 buildBoardPromptNote 中存在。另：2026-09-25 起 assetRef 路径新增 provider 守卫（subjectReference 能力声明），不支持「参考图=主体外观」语义的 provider（火山/百炼等首帧语义）会被明确拦截并报错引导。

**帧数→模式**：0 帧 text2video / 1 帧 image2video / ≥2 帧 keyframes2video，降级链 keyframes→image→text；超 maxKeyframes 按 timePercent 均匀采样保首尾；keyframe 路径只取首镜头 start+end 帧，且先过 E3 闸门（机检+审核未过抛 KeyframeGateBlockedError，可 force）。

**H3 网关协议**：refs 截断前 2 张 = 首帧/尾帧；prompt 已含三段式则原样透传，否则自动包三段骨架；能力声明 maxDuration 15s、maxKeyframes 2。

**工程保障**：taskId 即时落库（崩溃恢复凭据，启动时回查网关终态）；轮询 2s 间隔 ≤75min；产物临时 URL 立即下载落盘（签名 URL ~1h 过期）；成功后片段+片段内全部分镜置 completed、剧集状态推进 producing。

---

## 第三部分：一致性保障体系总结（横切视角）

一致性不是单个 prompt 的产物，而是五层防线的叠加：

1. **单一事实源**：资产卡 description 是定妆图与所有分镜文本的唯一依据（cogen 约束 4）；项目级去重保证一个实体一份 binding。
2. **提示词层纪律**：binding 强约束、命名纪律（禁代词/禁群体量词）、服饰逐字引用、@[登记名] 标记、原文保真纪律、密度分档。
3. **代码层收口**：ID 全部由代码回填、编号强制重排、dlg_/act_ id 重发、三级兜底反查、参考图代码侧评分选择、分段纯函数切分。
4. **校验层拦截**：schema 校验 + 纠错重试（≤2 次）、appearanceFragments 逐字命中校验、对白全覆盖硬校验、落库后断言、剧本完整性 12 违例码、机检 + VLM 审核 + 重拍闭环、E3 视频闸门、覆盖度校验。
5. **工程层兜底**：事务化落库（删旧建新同事务）、钉模型防风格分叉、定妆确认闸门、启动恢复、taskId 崩溃恢复、占位行复用。

**演化脉络**（每次事故驱动一道防线）：Bug C（characterId 反查）→ 命名纪律 → 服饰逐字命中校验 → @[登记名] 标记 → 对白全覆盖硬校验 → 原文保真双保险 → 关键帧废帧事故 → assetRef 默认路径 + 三段式声明。

### 已知边界

- 关键帧链路默认停用（renderPath=assetRef），关键帧机制完整但属回切路径。
- ep-keyframe-planner / ep-video-prompt 技能的部分规则（10 条帧数判定、声音符号协议、时间锚点声明）未内联进代码，属人工/LLM 撰写规范。
- BGM 为 stub、无 ducking、staging-3d 占位、quick-mode 后端编排器未接线。
