# 剧集制作模块：功能目标 vs 提示词实际组装 vs 差距分析

> 本文档替代此前对话中的简版对照表。"实际组装"栏全部摘自源码（行号对应 dev 分支），按代码中真实拼接顺序逐段列出，关键文本照抄。
> 每个提示词三节：**功能目标**（该步骤对下游承担的责任）→ **实际组装**（system + user/模板逐段 + 变量来源）→ **差距分析**（对照目标应然的组成）。
>
> 覆盖 22 个提示词点。配音（TTS）与合成（ffmpeg）无 LLM 提示词，不在列。

---

## 目录

- A. 驱动层：Agent 系统提示词 + 快照 / 旧决策 / 旧总结
- B. 内容步：故事原文生成
- C. 剧本步：7 个共享片段 + 6 个生成入口 + 润色
- D. 资产步：设定反推 / 身份段 / 三类约束 / 锚点前缀
- E. 分镜步：cogen / 纠错 / 镜头数规划 / 批量 / 单镜 / AI 填空 / VLM 推断 / 缩略图
- F. 制作步：关键帧 / VLM 审核 / 片段视频 / 资产引用三段式
- G. 公共底座：JSON 截断续写

---

# A. 驱动层

## A1. Agent 系统提示词 epAgentSystemPrompt()（ep-agent-harness.service.ts:55-72）

**功能目标**：让模型作为制作助理，正确驱动 13 个生产工具走完全流程；知道每轮项目状态；不越权、不浪费成本、不编造参数。

**实际组装**（纯静态模板，零变量插值）：
- [1] 角色段（:56-58）："你是剧集制作项目的制作助理，可以直接调用工具替用户完成制作任务。你驱动的是一条完整生产流水线：剧本 → 场景 → 分镜 → 关键帧 → 视频 → 配音 → 合成导出 MP4（配套能力：资产主图、实体增改、外部数据查询）。当前项目与剧集状态快照会随每轮注入。"
- [2] 纪律 1（:61）："简单请求直接执行对应工具，不要拆解规划；只有跨集/多环节的复杂目标才考虑 create_task_plan 拆任务树（创建后需用户在「Agent 任务树」页批准才会执行）。"
- [3] 纪律 2（:62）："固定可复用的制作流水线才考虑 create_workflow_draft 沉淀为工作流草稿；一次性的需求不要沉淀。"
- [4] 纪律 3（:63）："依赖不满足（如未生成分镜就想生成关键帧）时工具会返回暂缓原因，请向用户解释缺什么前置，或先执行前置动作。"
- [5] 纪律 4（:64）："成本意识：生成关键帧/视频/资产图/配音都按次计费。资产生成类每轮限 3 次且按参数去重……关键帧/视频类工具缺省只补缺失项，不要重复生成已有产物。"
- [6] 纪律 5（:65）："name 必须用状态快照或工具结果里的真实资产名，不要编造；工具找不到该名字时会报错并列出现有名单，请从名单中选择。"
- [7] 纪律 6（:66）："资产是项目级共享：跨集制作优先复用既有资产……生成资产图时沿用项目风格锚点（项目设定里的画风描述），保持全片画风一致。"
- [8] 纪律 7（:67）："不要重复调用刚刚成功过的同一工具；工具失败后可换参数重试一次，仍失败就如实告知。"
- [9] 纪律 8（:68）："所有动作完成后，用一段话向用户总结：本轮做了什么、结果如何、下一步建议。"
- [10] 纪律 9（:69）："用户意图或关键参数不明确时，先调用 ep_confirm_choice 发起选择卡或用一句话确认，不要编造参数。"
- [11] 纪律 10（:70）："状态快照是**轮初**快照：工具执行成功后的最新状态以工具返回结果为准。"
- [12] 纪律 11（:71）："生成视频/导出 MP4 是分钟级后台任务：工具返回「已启动」即代表成功开始，**不要**为等完成而重复调用同一目标……"

**配套快照 epStateToSnapshot()（:77-107，join('\n') 逐行）**：
1. `项目：${project.name}`（:81）
2. `剧集：${title} 第${n}集（状态：…，剧本：已有|未生成）`（:82）
3. `梗概：${synopsis.slice(0,80)}…`（条件行，:84-86）
4. `场景：${total} 个（${n} 个已绑定地点）`（:88）
5. `分镜：${total} 个，覆盖 ${x}/${y} 场`（:89）
6. `生产进度：关键帧 x/N 分镜、视频 x/N 分镜、配音 x/N 场景、成片已导出|未导出`（:92-93）
7. `阶段就绪：剧本✓✗ / 资产✓（n 项）✗ / 分镜✓✗ / 合成…`（:96, :110-127）
8. `资产：角色 ${count}（${names.slice(0,8).join('、')}）；地点 ${count}；物品 ${count}`（:97-99——**地点/物品只有计数没有名字**）
9. `候选数据源名单：…`（条件行，:100-102）
10. `用户当前界面：${contextHint}（用户说"这个/当前"时优先按此理解）`（条件行，:103-105）

**差距分析**：
- 缺（A 完整性）：快照无**风格词、画幅、目标集长**——纪律 6 要求"沿用项目风格锚点"但快照不提供风格文本，该纪律空转；无地点/物品名单使纪律 5 对地点/物品不可满足（旧版 epStateToSummary 反而有地点前 5 名、物品前 3 名，属回退）。
- 缺（纪律覆盖）：无**破坏性操作确认**纪律（delete/force 重写不需过 ep_confirm_choice）；无用户**取消语义**（代码有 cancel() 但提示词未告知）。
- 多余/漂移风险（B）：纪律 4 的"每轮限 3 次"与代码 `EP_TOOL_MAX_CALLS` 是同一约束的第二处硬编码，改常量即漂移。
- C 类型定制：无。这是全模块最干净的提示词之一。

## A2. 旧决策提示词 DECISION_SYSTEM_PROMPT + buildEpDecisionContext（ep-agent-context.ts:18-91，EP_AGENT_HARNESS='0' 时启用）

**功能目标**：回退路径下同 A1。

**实际组装**：
- System 静态全文：
  - [1] 角色（:18-19）："你是专业剧集制作项目的 AI 制作助手，通过对话帮用户完成**从"剧本"到"分镜/资产"**的制作流程。"
  - [2] 动作清单 9 条（:21-29）：generate_script / split_scenes / generate_storyboards / generate_char_asset / generate_location_asset / generate_item_asset / update_entity / delete_entity / query_database（**无关键帧/视频/配音/导出**）
  - [3] 决策规则 10 条（:31-44）：规则 0（生成资产未点名→必须输出 choice 禁止文字反问）；0.1（查库未点数据源→choice）；1（纯提问 actions 为空）；2（数据依赖顺序）；3（勿盲目重复生成）；4（一次最多 3 个动作）；5（reply 只一两句）；6（单资产图用 name 定位）；7（多轮确认 choice JSON 协议）；8（`"generate_char_asset param name=杜十娘"` 式带参指令直接执行——**示例含"杜十娘""金融库"**）
  - [4] 输出约束（:46-48）+ [5] 输出 JSON 格式（:50-51）
- User 五段（:53-91）：【项目当前状态】（epStateToSummary，含地点前 5/物品前 3 名单）→【候选资产名单】→【候选数据源名单】→【最近对话】（每条截 200 字）→【用户本条消息】→ 尾指令"请判断是否需要执行动作，输出 JSON。"
- 另有总结提示词 SUMMARY_SYSTEM_PROMPT（:95-100，4 条要求：顾问语气/先说做了什么/主动建议下一步/不复述摘要不输出 JSON）+ 四段 user（:102-127）。

**差距分析**：
- B（双份维护）：与 A1 是两套系统提示词+两套快照格式器+两套确认协议，内容已分叉（旧版快照有地点/物品名单但无生产进度；新版相反）；动作清单只覆盖前半程，**回退路径下 agent 无法生成视频**。
- C：示例"杜十娘/金融库"为具体名字（轻度）。
- 处置建议：退役，不优化。

---

# B. 内容步

## B1. 故事原文生成 STORY_TEXT_SYSTEM_PROMPT + buildStoryTextUserPrompt（story-text-generator.ts:24-56）

**功能目标**：一句创作要求 → 小说体裁故事底稿（回填 uploadedContent），供剧本生成做保真改编的原文。

**实际组装**：
- System（:24-31）："你是一位拥有10年以上经验的资深小说家，擅长影视化叙事。请根据用户给出的创作要求，撰写一段故事原文（小说体裁）。" + 5 条要求：①小说正文（场景描写/动作神态/对白/情节推进）；②`800–3000 字（中文字符计）`；③纯文本禁 Markdown、段落空行分隔；④只输出正文禁开场白；⑤给定背景需"自然体现该背景的氛围与质感"。
- User（:41-56）：
  - [1]【故事背景】（条件段，任一字段 trim 非空才拼）：`年代：${era}` / `地域：${region}` / `其他：${extra}` 逐行（:46-48, :52）
  - [2]【创作要求】（恒有）：`req.prompt.trim()`（:54）
  - join('\n\n')（:55）
- 数据来源：`EpAiGenerateTextRequest` 的 storyEra/storyRegion/storyBackgroundExtra/prompt；maxTokens 16000，非流式 callAI。

**差距分析**：
- 基本达标，全链路最干净。
- 缺（A）：无体裁/风格/受众入参（请求类型本身无 style 字段）；800-3000 字硬编码，与目标集长无关联。
- 缺（D 弱耦合）：下游 SCRIPT_FIDELITY_SPEC 要求"原文带引号对白必须全保留"，但本提示词**未声明对白需带引号**——若生成散文体少对白，下游保真校验形同虚设。契约只在下游声明，上游不知情。

---

# C. 剧本步

## C0. 七个共享片段（script-generator.ts:39-203，多个提示词复用，先列全）

**① BINDING_CONSTRAINT_SPEC（:39-48）**——4 条：三类 bindingId 引用规则（locationBindingId 从地点列表选/characterBindingId 从角色列表选/itemBindingId 从物品列表选）+ "清单找不到填 null（不要瞎编 ID），location/characterName 保留实际名字以便人工补全"。

**② SCENE_SPLIT_PRINCIPLES_SPEC（:53-59）**——5 条：地点变化拆/时间跳跃拆/角色组合变化可拆/氛围变化可拆/每场有明确视觉焦点。

**③ SCENE_JSON_EXAMPLE_SPEC（:64-117）**——完整单场景 JSON 示例。关键值：`location:"茶馆"`、`locationType:"interior"`、`timeOfDay:"morning"`、`weather:"sunny"`（英文枚举）；sceneDescription 示例"茶馆呈长方形，东侧柜台摆放茶罐……青花瓷茶具、水墨挂画、红木桌椅"；characters[0] `characterName:"张三"`、`outfit:"蓝色长衫（深蓝色，文人风格）"`；dialogues[0] `id:"dlg_1"`、`text:"请来一壶碧螺春"`、emotion/volume/pace/pause 齐；actions[0] `id:"act_1"`、timing/duration 齐；`narration:"旁白文本"`（**仅占位词，无质量要求**）。

**④ FIELD_QUALITY_SPEC（:122-160）**——5 节：sceneDescription 三要素（空间布局+材质+关键物件，示例"闺房呈方形，东侧梳妆台配铜镜……北侧百宝箱"）；locationKeyObjects 3-6 个；lighting 四要素（光源+方向+强度+色调，示例"晨光从南侧窗棂斜射入，柔和偏暗，冷蓝色调"）；outfit 格式"服装名称（颜色，风格）"（示例"素色衣裙（淡青色，古典仕女风格）"）；dialogues 规则"每条必须带 characterName……原文里对白前有说话人名的（**如"阿蘅：……"**或单独成行的角色名），必须保留该说话人，不得丢失……拿不准说话人时优先按上下文推断，仍无法确定才允许省略 characterName"。

**⑤ ROSTER_LIST_SPEC（:167-177）**——三段占位符：`## 可用角色列表 {characters}` / `## 可用地点列表 {locations}` / `## 可用物品列表 {items}`。

**⑥ SCRIPT_ADAPTATION_DISCIPLINE_SPEC（:185-187）**——外层自带标题 `## 短剧剧本改编纪律（原著正文 → 竖屏短剧剧本）`，内插 buildScriptGenerationDiscipline()（writing-methodology.ts:139-148），该函数**又返回同一标题**（渲染后 H2 连续出现两次），6 条：黄金三秒冲突开场/台词口语化每句≤20字+三句内浮冲突/集尾卡点切在问题上/首次出场完整外貌锚定/每场 mood 标注+转折场镜头建议/本集爽点正面展开。

**⑦ SCRIPT_FIDELITY_SPEC（:195-203）**——4 条：原文带引号对白必须全保留（可微调语气不得整句删除不得合并）/关键节拍（约定/伏笔/反转/笑点/关系揭示）必须有场次承接/省略必须在梗概末尾写「省略说明：…」/自检标准"逐句对照找不到对应台词即不合格"。

**片段级差距**：
- ⑥ 全片段是竖屏短剧专用纪律，无体裁开关（C）；标题双写（B）。
- ③④ 示例全古风偏置（茶馆/青花瓷/闺房/仕女），④含具体项目角色名"阿蘅"（C，此前漏记，本轮新发现）。
- ③ 的 weather/timeOfDay 用英文枚举值，与中文提示词混排，下游无对应约束（B 轻度）。
- ④ 只允许"拿不准才省略 characterName"与⑦"说话人正确"口径宽严不一（B 轻度）。
- narration 在③中无质量规范（A）。

## C1. 整集剧本生成 SCRIPT_GENERATION_PROMPT（script-generator.ts:230-300；调用 :924-934）

**功能目标**：底稿 → 结构化场景 JSON（下游分镜/资产/配音的数据源）+ 梗概 + 剧本正文（展示视图），全链路数据源头。

**实际组装**：
- System（:929-930 内联）："你是一位拥有10年以上一线影视工业经验的职业编剧。请严格按照要求的格式输出……所有引用必须使用提供的 binding ID，不要瞎编 ID。必须输出【场景数据开始】【场景数据结束】标记的 JSON 场景数据！"
- User/模板（:230-300 按拼接序）：
  - [1] 人设行（:230，与 system 人设重复）
  - [2] 最高优先级警告 + 三段输出顺序（:232-239："如果不输出 JSON 场景数据，整个任务就是失败的！"）
  - [3] 第一部分 JSON marker 契约（:243-250）
  - [4] 第二部分梗概 marker（:254-259，50-100 字）
  - [5] 第三部分正文 marker（:263-270，"中文场景标题；动作描写现在时；角色对白居中缩进"；禁 Markdown）
  - [6] 片段① binding 约束（:274）
  - [7] 片段② 拆分原则（:278）
  - [8] 片段⑥ 短剧纪律（:282，双标题）
  - [9] 片段⑦ 保真纪律（:286）
  - [10] 片段③ JSON 示例（:290）
  - [11] 片段④ 字段质量（:294）
  - [12] 片段⑤ 花名册占位（:296）
  - [13] `## 章节内容\n\n{chapterContent}`（:298-300）
- 占位符填充（:924-927，**String.replace 链**）：{characters}/{locations}/{items} ← formatRosterList（空 → `(无)`，格式 `- bindingId: xxx, 名称: xxx, 描述: …`）；{chapterContent} ← 入参原文。
- 调用：callAIWithContinue(16000, 2 次续写, temperature 0.3)；后置：正文截断续写（:938-954）→ 4 格式解析 → binding 三级解析 → 正文救援 → 覆盖度校验（仅 warn）。

**差距分析**：
- 缺（A）：**无故事背景（era/region/extra）注入**——对比润色器（C7）有，决定基调的生成环节反而没有；无目标场景数/总时长约束；无体裁变量（短剧纪律写死）。
- 错（B）：`String.replace` 填充——chapterContent 含 `$&`/`$'`/`$1` 会被静默改写（安全函数 fillPromptTemplate 就在同文件 :211-219 却不用）；人设与 system 重复。
- C：片段⑥短剧纪律 + 片段③④古风示例 + "阿蘅"。
- D：台词存于 dialogues 与正文两处，提示词未声明两者必须逐字一致；覆盖校验 haystack 含正文（正文命中即算覆盖，dialogues 里可以是改写版），且长句"首尾各 8 字命中"即算覆盖、仅 console.warn。

## C2. AI 续写 SCRIPT_CONTINUATION_PROMPT（:312-387；调用 :1065-1100）

**功能目标**：在已有剧本尾部追加新场次，编号接续、不重复已有内容。

**实际组装**：
- System（:1071-1075）：同 C1 + "正在为一部已开拍的剧集续写剧本……只输出本次新增的场景"。
- User（:312-387）：[1] 续写人设（"与已有剧情、人物性格、世界观、伏笔完全连贯"）→ [2] 三段输出顺序（标注"本次新增"）→ [3] JSON 契约 + `场次号从第 {startSceneNumber} 场开始按顺序递增（严禁从 1 重新编号）` + `只输出本次新增的场景` → [4] 本段梗概 → [5] 本段正文（"严禁重复或改写已有正文"）→ [6] 片段① → [7] 片段② → [8] 片段③ → [9] 片段④ → [10] `## 已有剧情正文（只读上下文）{existingScriptContent}` → [11] `## 已有场次一览（只读上下文）{existingScenesSummary}` → [12] `## 本次续写要求 {instruction}` → [13] 片段⑤（模板尾部）。
- 填充用 **fillPromptTemplate**（:541-550）；**不含片段⑥⑦**（注释 :183-184 声明"输入已是剧本，不适用"）。

**差距分析**：
- 缺（A）：同样无故事背景；**有意不含保真纪律**——续写=改编新章节内容时恰恰需要保真纪律，"输入已是剧本"的假设在"按大纲续写新章节"场景不成立。
- B（轻度）：片段⑤在模板尾部、instruction 之后，与 C1 顺序不一致。

## C3. 粘贴正文拆场景 SCENE_SPLIT_FROM_TEXT_PROMPT（:395-433；调用 :1109-1145）

**功能目标**：用户已有正文 → 结构化场景（不产正文/梗概）。

**实际组装**：
- System（:1117-1119）："你是一位专业的影视编剧。请把给定的剧本正文拆成结构化场景数据……"
- User：[1] 任务（"可能是标准剧本格式，也可能是小说体叙述"）→ [2] JSON 契约 + `只拆分这段正文里已有的情节，严禁补写` + `每一句对白都必须进入 dialogues` + `视觉细节按字段质量要求合理补全，不要留空字符串` → [3] 片段② → [4] 片段① → [5] 片段③ → [6] 片段④ → [7] 已有场次一览 → [8] `## 待拆分的剧本正文 {scriptText}` → [9] 片段⑤。
- fillPromptTemplate 填充（:556）；覆盖校验仅 warn，且 **haystack 只有 dialogues+narration、不含正文**（:1135-1143——与 C1 口径不同）。

**差距分析**：
- 纪律设计好（严禁补写+对白全收+视觉合理补全，是拆分场景的正确契约）。
- 缺（A）：无故事背景。
- B：覆盖校验口径与 C1 不一致（一处含正文一处不含），同一名称的校验两种语义。

## C4. 梗概→场景 generateScenesFromSynopsis 内联提示词（:1162-1264）

**功能目标**：split_scenes 动作，从梗概或正文拆场景。

**实际组装**：
- System（:1266-1267）："你是一位专业的影视编剧。请严格按照要求格式输出场景数据……"
- User（**内联手写，不复用共享片段**）：[1] 任务（sourceLabel="剧本正文"|"章节梗概"）→ [2] **旧 marker** `===SCENES_JSON===`（:1164-1167）→ [3] binding 约束手抄版（与片段①逐字相同，仅标题多"（不允许裸字符串）"）→ [4] JSON 示例手抄版（actions 缩写 `[...]`）→ [5] 字段质量手抄精简版（示例截短；多一条"text 不得为空"为片段④所无）→ [6-8] 三类花名册内插 → [9] 输入。

**差距分析**：
- B（典型漂移）：共享片段机制被绕开，手抄版已分叉（marker 旧、标题异、字段多一条、示例截短）——注释宣称的"避免各自漂移"在此被自己破坏。

## C5. 单场景重拆 regenerateScene 内联提示词（:1286-1314）

**实际组装**：[1] 任务（"剧情走向与场景编号保持不变，重出全部结构化字段"）→ [2] 旧 marker + `sceneNumber 必须为 ${n}`（内插数值）→ [3-5] 片段①③④ → [6] 片段⑤现场渲染 → [7] 场景源材料（sceneNumber/location/sceneDescription/mood/originalText/narration/现有对白 JSON/现有动作 JSON 逐行）。返回后 sceneNumber 强制回写原值（:1326）。

**差距分析**：设计合理（不信任 AI 回填编号是对的）；用旧 marker 靠解析层兼容（B 轻度）。

## C6. 正文救援 SCRIPT_BODY_ONLY_PROMPT（:439-460；调用 :978-995）

**功能目标**：C1 输出预算被场景 JSON 吃光导致正文缺失时，小预算单独补写正文。

**实际组装**：[1] 任务（"只输出剧本正文，不要输出 JSON 场景数据，不要输出梗概"）→ [2] 正文 marker（"角色对白"——**无"居中缩进"，与 C1 :268 措辞不同**）→ [3] 片段⑥ → [4] 角色列表 → [5] 地点列表 → [6] 章节内容（**无物品列表、无片段①③④⑦**）。

**差距分析**：
- B：与 C1 的正文格式措辞不一致（救援产出的正文与主路径正文格式可能不同，而两者会拼接进同一剧集）；缺保真纪律意味着救援正文的对白无保真约束——而它的产出恰恰用于覆盖度比对。
- C：片段⑥短剧纪律同样写死。

## C7. 场景润色 scene-polisher.ts（system :41-49；buildPrompt :57-118）

**功能目标**：单场景文本提质（画面感/潜台词），不改结构、不动 binding。

**实际组装**：
- System（:41-49）：人设 + 6 条：时空/地点/角色出场不变；dialogue/action 的 id 与 binding 字段原样不动；**不增删条目数量**；旁白有叙事节奏、对白精炼有潜台词、动作有画面感；与年代/地域/世界观一致；直接输出 JSON。
- User：[1] "请润色下面这一场戏。" → [2] 故事背景三行（【故事年代】【故事地域】【其他背景】，条件行，:58-61）→ [3] `===SCENE_JSON===` 包裹的输入 JSON（含 sceneNumber/location/…/originalText/narration/dialogues/actions，骨架字段作只读上下文）→ [4] `===POLISHED_JSON===` 输出模板：逐字段标注约束（sceneDescription 120-300 字/originalText 60-200 字/narration 40-150 字；dialogue 的 id/binding "原值不变"、volume/pace "原值或 normal"；action timing "保持原值或合理调整"）。
- 解析后 mergeDialogues/mergeActions 按 id 对齐合并；voiceId/audioAsset 不让 AI 碰（:217-218）。

**差距分析**：
- 信息注入最全（唯一带故事背景的剧本侧提示词）；输出契约"不碰骨架字段"清晰；字段长度规范是 narration 唯一的质量要求来源。
- 缺（A）：无相邻场景上下文（跨场服饰/情绪连续只能靠猜）。
- B（矛盾）：system 禁增删条目，合并代码却"AI 多/少返了条目，以 AI 的为准"（:203-204）——提示词禁令与代码口径相反，AI 多返一条对白会静默进库。
- D：润色可改 dialogue.text 但无对照 originalText 的保真校验，伏笔台词可被悄悄润色掉。

---

# D. 资产步

## D1. 设定反推 setting-enrichment-prompt.ts（system :63-88；user :90-111）

**功能目标**：原文 + 已有同类资产 → 待补资产的视觉字段（生成图的唯一依据）。

**实际组装**：
- System：[1] "你是这部剧的${角色|地点|物品}设计师。" → [2] 任务句 → [3] 强制规则 5 条（原文明确细节必须忠实/未明说字段基于氛围与已有同类资产合理设计/无线索输出 null 切勿编造/严格 JSON/**已有同类资产代表"已经定下来的世界观"，新设计必须与之相容**）→ [4] SCHEMA_HINT 按 kind 三选一（character 九字段：description/appearance/outfit/role("主角/配角/反派/旁白")/gender/age/race(7 枚举)/styleAnchors/outfitsExtra；location 与 item 各仅 description 一字段）→ [5] 输出示例（results[] 带 `_evidence` 逐字段标注"原文片段 或 '设计：理由'"）。
- User：[1]【原文片段】→ [2]【同项目已有同类资产（世界观参考）】（`- name：{fields JSON}`，空则"（暂无）"）→ [3]【待设计清单】（`- id=… 名字="…" 别名="…"`）→ [4] "请按 system prompt 中给出的 schema 输出严格 JSON。"

**差距分析**：
- 好设计：_evidence 溯源、null 防编造、世界观相容约束。
- 缺（A）：**system/user 均无故事年代/地域**——第一批资产（无同类参考时）反推人种/服装完全无时代锚。
- B：race 7 枚举在本文件 :54 与 asset-setting-enrichment.service.ts:258 双份定义；role 枚举要求填"旁白"等值，但身份段明确 alias/role 不进图像 prompt（填了被下游丢弃，prompt 未说明其叙事用途）。

## D2. 资产身份段 buildAssetIdentityPrompt（asset-identity-prompt.ts:114-157）

**功能目标**：把资产 effective 数据投影为图像模型的身份描述段。

**实际组装**（`，` 连接，空字段跳过）：
[1] name → [2] description → [3-8] 仅角色：`性别：x`，`年龄：x`，`人种：${describeCharacterRace(race)}`，`外貌：x`，`服装：x`，`备选服装：a / b` → [9] `风格：${styleAnchors 双写}`（`中文（english）`）→ [10] `故事年代：x` → [11] `故事地域：x` → [12] `故事背景：x`。
- race 双写实际文本（:77-96）：east_asian → "东亚（East Asian, Han Chinese / Japanese / Korean facial features）"，african → "非洲（African, dark skin tone）"……共 7 枚举 + 自由文本兜底。
- alias/role 显式不进（:124-128 注释："叙事概念非视觉概念"）。

**差距分析**：字段完整、双写是刻意的 provider 兼容策略；alias/role 排除有明确理由。无实质差距（本段是全模块设计的正面样板）。

## D3. 三类硬约束 + 设定锚点 + 古风约束（character/location/item-constraints.ts；asset-identity-prompt.ts:282-387）

**实际组装**（均为幂等 includes 追加 + 中英双写，择要）：
- 角色：framing 后缀（fullBody="直立全身（standing full body, head to toe in frame）"）+ 公共约束（"纯白背景（pure white background…），正面均匀光照、无任何阴影（front flat even lighting, shadowless…）"）+ negative 23 词（busy background…shadow…silhouette…chiaroscuro…）+ 身份保持单锚点"保持人物身份（preserve character identity）"。
- 地点：无人约束（"场景中不能有任何人物，仅环境本身（no people, empty scene…）"+ negative 13 词）；主图构图锚（"标准场地全景（wide establishing shot…）水平构图、地平线稳定"）；平面图分档（site="建筑群总平面布局图（aerial site plan…）"/interior="室内平面布局图（top-down orthographic floor plan…）"）+ 禁文字约束；平面图→主图还原指令（"将参考的俯视平面布局图转换为地面人视角度的写实电影质感场景画面……严禁输出俯视视角、示意图、线稿"）；父级参考段（"与参考图为同一建筑群的不同区域，保持建筑风格、材质、色调一致"）；三维锁（角度/时间/天气各配正向+negative）。
- 物品：居中/白底/产品视角/无文字/无阴影 + negative 18 词 + 身份保持。
- 设定锚点 appendAssetSettingAnchors（:282-343）：关键词存在性检查后追加"人物设定锚点：性别/年龄/人种/外貌/服装…"或"地点设定锚点：类型/规模/氛围"。
- 古风（:345-387）：判定 `ANCIENT_ERA_PATTERN = /古|武侠|仙侠|玄幻|宋|唐|汉|明|清|朝代|古装/`；后缀"严格古代中国风，严禁出现任何现代建筑、现代服饰、现代物品、现代交通工具（strictly ancient Chinese style…）"；negative "modern buildings, modern clothing, cars, electricity, glass curtain wall"。
- 时代约束 appendEraConstraint（:186-188）："人物服饰、发型、妆容符合${era}、${region}的时代特征（period-appropriate clothing, hairstyle and accessories）"。

**差距分析**：
- 约束体系本身完备（地点链路是全模块最完备的一套）。
- C（类型定制核心）：古风判定按中国朝代名硬编码正则，"汉"误伤现代词（武汉）；宏观地点分档词表（门派/山庄/寨/宫/观/阁/斋）整体是武侠古风词汇，现代题材词为零；且与关键帧侧 ANCIENT_ERA_RE（含修真/秦/隋/晋/三国/架空，不含玄幻）**词表互不包含、后缀文案不同**（B 漂移已实锤）。
- B（脆弱耦合）：幂等依赖文案 includes 一字不差；stripSystemConstraints 剥离清单与约束文案硬编码耦合且漏古风后缀；AGE_WORD_PATTERN=/岁|年龄|年纪|age/ 存在假阴性（任何"岁"字跳过年龄锚点）。

## D4. 主图服务锚点前缀 buildStoryAnchorPrefix（main-image-generator.service.ts:118-164）

**实际组装**：单段前缀，`；` 连接：`时代背景：${era}`（prompt 未含才拼）→ `地域：${region}` → `故事背景：${extra}` → `风格：${config.stylePrompt}`；`effectivePrompt = anchor + input.prompt`（:380）。

**差距分析**：
- B/D（本轮新发现）：这是项目 stylePrompt 的**第五个注入点**（资产身份段风格项/锚点前缀/关键帧尾部/视频段/缩略图）；且锚点标签"时代背景："与身份段标签"故事年代："用词不同，幂等靠值 includes 而非段名——两套标签可并存于同一 prompt。
- "prompt 未含 era 才拼"的存在性检查与 D3 锚点检查是两套幂等机制，口径不一。

---

# E. 分镜步

## E1. cogen 联合生成 buildCogenPrompt（storyboard-cogen.ts:113-233）+ COGEN_SYSTEM_PROMPT（:86-87）+ buildCorrectionPrompt（:236-249）

**功能目标**：一次 LLM 调用产出"资产卡 + 全部分镜"，是分镜主路径；输出直接进校验-纠错闭环与事务落库。

**实际组装**：
- System（:86-87）："你是一位专业的影视导演、分镜师兼美术设定师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。"
- User 四段：
  - [1] 任务说明（:148-150）："同时完成两件事（一次输出）：1) 识别本场景需要的视觉资产……产出资产卡；2) 基于这些资产设计本场景的全部分镜（2~8 个镜头）。"
  - [2] 项目已有资产（:152-154）：标题"直接引用，禁止改名、禁止重复创建"；每行 `- [角色] 沈云萝（ID: cb_xxx）：描述` 格式（`- [${kindLabel}] ${name}（ID: ${id}）：${description}`，:117-126）；空则"（项目暂无已有资产，本场景所需资产全部按新资产产出）"。
  - [3] 场景剧本（:128-146）：场景号/地点/地点类型/时间/天气/场景描述/氛围/光线 + 出场角色（顿号 join）+ **旁白（无 id）** + 对话行 `- dlg_5 · 沈云萝: "..." (怒)`（**带 id**，dialogueDisplayId 口径 :98-102）+ 动作行（**无 id**）。
  - [4] 镜头语言说明（:160-173）：景别 8 值（extreme_long/long/full/medium/medium_close/close/extreme_close/detail）+ 角度 6 值（eye_level/high/low/dutch/birds_eye/worms_eye）+ 运镜 15 值（static/pan_left/…/dolly_in/dolly_out/…/tracking_left/tracking_right/handheld/steadicam）。
  - [5] 输出 schema（:175-212）：assets.characters[]{name,description,gender,age,outfit,existing} + location 单对象 + items[]；shots[]{shotType,cameraAngle,cameraMovement,duration,frameDescription 四段式,subject,composition,characters[]{name,position,expression,action,facing},itemNames,dialogueIds}。
  - [6] 强约束 16 条（编号 1-10、10a、11-13、13a、14；:214-232），逐条核心原文：
    1. shots 2~8 个；开场远景/全景、对话中近景、情感特写。
    2. 角色名必须 ⊆ 资产清单∪已有名单。
    3. 引用已有资产 existing=true、名字逐字一致、description 照抄（可补充不得矛盾）。
    4. 新资产 description 必须完整（外貌+服饰），"是定妆图与后续所有分镜文本的唯一依据"。
    5. frameDescription 四段式【场景】【人物】【动作】【氛围】；【人物】段服饰/外貌与资产卡完全一致跨镜头不漂移。
    6. duration 1~10s + 密度分档（"钩子开场/冲突爆发/**打脸/身份揭示/高潮清算** → 1-1.5s（15s 片段 8-12 镜）……常规叙事段镜头平均时长不得超过 2.5s（**每 2 秒 1 镜是短剧留存底线**）"）。
    7. location 恰好一个；items 只列需视觉一致性的关键物品。
    8. 剧本细节照抄原文（"药理名/药名、对白、数字、称谓……例如剧本写**"曼陀罗花""忘忧草"**，就不得改写成"断魂草"）。
    9. 【人物】段服饰/外貌**逐字引用**资产卡原文（示例"素白衣裙，外披淡青披风"）。
    10. 命名纪律：禁代词/别称/群体量词，多角色逐个写登记名。
    10a. 资产引用标记 `@[登记名]`（示例「**@[沈云萝]** 坐在床榻边」「**@[秦越@2]**」）。
    11. 情绪具象外化（悲伤=低头/肩膀微颤/眼眶泛红/攥紧衣角……五组词库）。
    12. 台词长度适配镜头时长（"校验会按 **4.5 字/秒**硬核算"）。
    13. 每条对白/**旁白**必须有镜头承接；frameDescription 不得引用台词原文、不得出现引号包裹的台词。
    13a. dialogueIds 逐镜填写、恰好被一个镜头引用一次。
    14. 地点命名"大地名+区域名"（示例"**雪麓山庄书房**""雪麓山庄山门""**白鹿城**城门"）。
- 纠错 prompt（:236-249）：[1] 编号错误清单 → [2] "只修复上述问题" → [3] 特别注意（所有镜头所有角色自查服饰片段 + "**不得增删镜头或资产**"）→ [4] 只输出 JSON → [5] 附上次完整输出。最多重试 2 次。
- 数据来源：scene（SceneScript）+ existingAssets（binding 快照）；**无项目风格词、无故事背景、无目标总时长注入**（源码确认）。

**差距分析**：
- 缺（A）：无故事背景/风格/目标时长——约束 6 要求"15s 片段 8-12 镜"却没给场景目标秒数，节奏规则无法执行；shot-pacing.ts 的"duration 之和=目标总时长"硬规则在本提示词缺席（两处文本已分叉）。
- 错（B）：约束 13 要求旁白有承接但 schema 无 narrationId、校验无旁白覆盖（旁白悬空）；约束 13 禁引号台词但无对应机器校验（靠 segment 层剥离兜底）；duration 提示词 1~10/校验只查正数/节奏告警 1-8s 三处不一；纠错"不得增删镜头"与覆盖错误文案"请为它们补建对切镜头"矛盾；约束编号 10a/13a 补丁号。
- C（最重）：约束 6 短剧话术、约束 8 药理示例、约束 10a/14 具体项目名、约束 12 中文语速硬编码（且 SPEECH_CHARS_PER_SEC 常量在 cogen:287 与前端 ShotPromptEditor.vue:152 三处定义）。
- D：约束 9 校验实际口径=frameDescription 任意位置命中资产卡任意 ≥4 字片段 1 个即过（非【人物】段限定、非全要素、<4 字豁免、非服饰片段也算命中）——比提示词宣称的"逐字引用"弱得多；强项是纠错回路会把可用片段清单喂回模型。

## E2. 镜头数规划 analyzeSceneStoryboardNeeds（storyboard-generator.ts:375-423）

**实际组装**：[1] 场景注入块（场景号/地点/地点类型/时间/描述/氛围 + 出场角色 + **旁白长度（字符数）/对话数量/动作数量**——只有计数无原文，且无天气无光线）→ [2] 任务（5 条考虑：建立镜头/对话正反打/情感特写/动作展示/结束镜头）→ 输出 `{shotCount, shotTypes[], notes}` → system"你是一个专业的影视导演……"（1024 tokens，temperature 0.3）。缺省 shotCount=5。

**差距分析**：轻量辅助提示词，输入只给计数不给对白原文——"每段重要对话需要镜头"的判断没有对话内容依据，规划质量先天受限（A 缺）；属旧链路，建议随旧生成器一起退役。

## E3. 批量分镜 STORYBOARD_GENERATION_PROMPT（storyboard-generator.ts:96-215；sceneDescription :471-490）

**实际组装**：[1] 角色头 → [2] 镜头语言四枚举表（景别 8/运镜 15/角度 6/转场 8，值与 cogen 一致系全文复制）→ [3] 分镜设计原则 6 条 → [4] PACING_DENSITY_PROMPT（shot-pacing.ts:18-23，含"duration 之和=目标总时长"硬规则——但本模板未注入目标时长）→ [5] NAMING_EMOTION_PROMPT → [6] 四段式格式要求 + **杜十娘示例**（"杜十娘闺房，轻纱环绕……手持镶金百宝箱……复仇前夕的决绝感"）→ [7] 输出 schema（**要求 narrationId/dialogueIds/actionIds/characters[].characterId**）→ [8] 场景注入（角色行带 ID，:480-481；**旁白无 ID** :483；**对话行无 ID** `- 角色: "台词" (情感)` :486；**动作无 ID** :489）。

**差距分析**：
- 错（B，P0）：schema 要求回填 dialogueIds/actionIds/narrationId，但输入的对话/动作/旁白**全部没有给 ID**——模型只能瞎编，这正是 distributeDialoguesToStoryboards"按镜数均分"兜底存在的原因，而均分与镜头内容无关。
- C：杜十娘示例（具体故事+强古风情绪暗示）。
- B：与单镜版（E4）的四段式示例文本已不一致（"手持镶金百宝箱"有无）。

## E4. 单镜生成 SINGLE_STORYBOARD_GENERATION_PROMPT（:220-347；注入 :527-574）

**实际组装**：[1] 角色头（第 {shotNumber} 个分镜）→ [2] 枚举表（与批量版全文复制）→ [3] 设计原则（首镜特化）→ [4] PACING+NAMING 片段 → [5] 上下文信息（整体规划 shotCount/shotTypes/notes + 首镜说明或上一镜 5 参数"避免重复"）→ [6] 场景注入（**对话/动作/旁白均带 ID**，:540-546——与批量版口径不同）→ [7] 任务要求 → [8] 四段式+杜十娘精简示例 → [9] 单镜 schema（多 movementDuration 字段，批量版与结果处理均无对应，孤儿字段）→ [10] 注意 3 条。

**差距分析**：上下文衔接设计合理（规划+上一镜防重复）；但两种模式输入口径不一致（E3 无 ID/E4 有 ID）本身就是缺陷；孤儿字段 movementDuration（B）。

## E5. AI 填空 fillStoryboardFields（:794-941）

**功能目标**：UI"一键填充"分镜空白字段（镜头参数推荐）。

**实际组装**：[1] 角色头 → [2] 场景上下文（含资产卡服饰原文）→ [3] 场景信息（地点/时间/氛围）→ [4] 资产引用纪律段（"@[登记名]"标记 + 服饰逐字 + "雪麓山庄书房"完整登记名示例）→ [5] 已有字段 → [6] 需填充字段清单 → [7] 镜头语言说明（**实际列出值**：景别 8（detail 标"细节特写"与他处"大特写"不同）/角度 5（漏 worms_eye；dutch 标"斜角"与他处"荷兰角"不同）/运镜自称"25 命名预设"实际列 24 项——basic 7（`push_in/pull_out`…）、narrative 8（`reveal_push/long_take_tracking/master_shot_push/spiral_up/pov/ots_left/ots_right`…）、dynamic 5（`whip_pan_left/crash_zoom`…）、special 4（`slow_motion_static/time_lapse_pan/freeze_frame/impact_zoom`）/焦距 5 档/光圈 5 档/相机风格 4/打光 12/转场 7（少 iris）/转场时长/方向/关键帧数对应表）→ [8] 设计原则 8 条 → [9] PACING+NAMING 片段 → [10] 输出要求（只输出需填字段 13 个；"不适合填充可以不输出"）。
- 后处理：仅 lensFocalMm 走白名单 ['24mm','35mm','50mm','85mm','125mm']（:964）；cameraMovement/cameraStyle/lighting/aperture **原样透传无校验**（:948-976）。

**差距分析**：
- 错（B，全模块最严重活 bug）：运镜 24 项与 camera-movements.ts 的 25 真值大面积不符——`push_in`（真值 push）、`reveal_push/long_take_tracking/master_shot_push/spiral_up/pov/ots_left/ots_right`（7 项全虚构）、`whip_pan_left/whip_pan_right/crash_zoom`（虚构）、special 4 项全虚构；漏真值 dolly_zoom/circle_360/track_left/crane_up/aerial_descend 等。配合输出无白名单校验，**AI 输出的虚构运镜值直接落库**，下游 findCameraMovementPreset 查不到、segment-planner 标签表不认识，运镜信息静默丢失。
- C：@[沈云萝]/雪麓山庄书房示例。
- B：枚举中文标签三套并存（detail/dutch）；转场少 iris。

## E6. VLM 镜头推断 vlm-shot-inferrer.ts（SYSTEM_PROMPT :20-63；user :114）

**功能目标**：上传参考视频 → 抽代表帧 → 反推镜头语言，导入为分镜。

**实际组装**：
- System：[1] "**你是专业短剧分镜助手**。给你一张视频代表帧，请分析并输出该镜头的镜头语言字段。" → [2] shotType 5 值（big_close_up/close_up/medium/long/wide——**第 5 套景别词表**，与标准 8 值不同）→ [3] cameraAngle 5 值（eye_level/high/low/overhead/dutch）→ [4] cameraMovement 6 值（static/push/pull/pan/track/handheld——**第 6 套运镜词表**）→ [5] frameDescription"用一句中文描述画面内容（25 字以内）" → [6] emotion"2-4 个字" → [7] 输出 schema。
- User：`镜头时长 ${durationSec} 秒。请分析这张代表帧并按 schema 输出 JSON。`
- 映射：push→dolly_in、pull→dolly_out、**pan→pan_left（"默认左摇"）、track→truck_right（"默认右移"）**、overhead→birds_eye；未命中静默兜底 medium/eye_level/static（:139-141）。

**差距分析**：
- 错（B，P0）：提示词运镜枚举不给方向选项，映射层却必须落到有方向的枚举——所有横摇静默变成左摇、所有跟拍变成右移，**系统性数据失真**；未命中静默兜底无告警掩盖漂移。
- C："短剧"定位（该工具分析任意参考视频）；frameDescription 硬编码中文输出。
- B：durationSec 注入但 schema 无字段消费（无效上下文）；景别/角度/运镜至此共 6 套词表并存。

## E7. 分镜缩略图网格 buildThumbnailPrompt（storyboard-thumbnail-generator.ts:149-173）

**功能目标**：剧本概要 → 3×3（或 4×4/5×5）故事板预览图，供剧本→分镜过渡。

**实际组装**（全文）：[1] "基于以下剧本生成 ${count} 帧连贯故事板，${grid}×${grid} 网格布局：" → [2] "剧本概要：${synopsis}" + 可选风格行 → [3] 节奏指令固定 6 条 9 拍（第 1 帧开场/2-3 展开/4-5 冲突/6-7 高潮/第 8 帧结果/第 9 帧尾声）→ [4] "输出 ${count} 帧并排（${grid}×${grid} 网格）。" → [5] "图像间无文字、无序号、纯背景间隔。" → [6] "保持人物/地点跨帧一致性（同一角色每帧脸型一致）"。negative 硬编码 "low quality, blurry, watermark, text, numbers"。参数：count ∈ {9,16,25}（:68-71）、cellSize=512 恒正方形（:89）、**referenceImagePaths 固定 []**（:92）。

**差距分析**：
- 错（B，P0）：count=16/25 时节奏指令仍写死"第 9 帧：尾声"——指令自相矛盾，第 10-25 格内容无约束。
- 缺（A）：无参考图、无角色外观描述，"同一角色每帧脸型一致"是不可兑现的空指令；无画幅概念（16:9/9:16 剧集得到正方形格子）。

---

# F. 制作步

## F1. 关键帧 prompt buildKeyframePrompt（keyframe-prompt-builder.ts:328-435）+ 配套片段

**功能目标**：分镜 + 资产 + 帧计划 → 与资产形象一致的关键帧图提示词（视频生成的视觉锚）。

**实际组装**（13 段，join(', ')，:430）：
1. 风格前缀（:333-338）：有角色参考图 → REFERENCE_MATCH_STYLE_PREFIX（"画面风格、人物外观与参考图保持一致（match the reference images exactly: same character face, hairstyle, outfit and art style）"）；否则 styleConfig.stylePrefix（五预设之一：cinematic "cinematic, high quality, 8k…" / anime / realistic / fantasy / ancient_chinese "ancient Chinese style, traditional Chinese painting…"，:61-87）。
2. sceneDescription 原文（:341）。
3. 时刻语言（:344）："[关键帧时刻] 场景开始时刻：人物刚进入位置/动作即将展开"（start）/"场景中段（约 N%）：动作过程/表情过渡/走位中"（middle）/"场景结束时刻：动作完成/情绪到位/镜头将切换"（end）。
4. `location: {name}` + `{description}`（:347-351）。
5. frameDescription 原文（@[...] 已剥为纯名）+ `main subject: {subject}`（:354-355）。
6. 角色段 ×N（:358-373）：`character: {name}, {appearance}, wearing {场景临时换装 ?? eff.outfit}, {expression} expression, {action}, positioned {position}`（缺项跳过——**无性别/年龄/人种/styleAnchors**）。
6b. 角色一致性段（:378-383）："[角色形象一致性] 严格保持上述每个角色的面部特征、衣着、发型、饰品与参考图一致；同一角色在不同镜头/景别/时刻下必须容貌、装扮、发型、配饰完全相同……"（与第 1 段让位前缀语义重叠）。
7. 物品段（:386-395）：`prop: {name} {description} ({context})`。
8. 氛围（:398-400）：`{mood} atmosphere` / `{timeOfDay} lighting` / `{weather}`。
9. 构图原文（:403）。
10. 景别/角度英文短语映射（:406-409, :92-119）。
10b. 镜头扩展（焦距/光圈/相机风格/打光 preset 的 promptHint，:412-473）。
11. `[user direction] {用户输入}`（:418-420）。
12. 质量后缀 styleConfig.qualitySuffix（:423，如 "masterpiece, best quality, highly detailed"）。
13. 古风段（:425-427）：判定 ANCIENT_ERA_RE=/古|武侠|仙侠|修真|朝代|历史|唐|宋|元|明|清|汉|秦|隋|晋|三国|春秋|战国|五代|架空/（**与 D3 词表互不包含**）；后缀"严格古代中国风场景，严禁现代建筑……电线杆、玻璃幕墙"；negative "modern buildings, modern clothing, cars, power lines, glass"（与 D3 negative 不同）。
- 调用方尾部再拼 `，${projectStyle}`（keyframe-generation.service.ts:1266）——prompt 在 builder 外还有一道拼接。
- 配套：COMPOSITE_FUSION_PREFIX（合成锚定融合指令，"将拼贴入画面的人物自然融入场景……每个人物的面容、发型、服装必须与贴入形象严格一致"）；buildBoardPromptNote（编号参考板说明，"严禁输出参考图本身的分栏布局、白色底、编号标记"）；stripStylePrefix 只剥 REFERENCE_MATCH_STYLE_PREFIX。

**差距分析**：
- 缺（A，关键帧链路最大缺口）：角色段无性别/年龄/人种/styleAnchors——资产阶段精心反推的身份字段在此断链（D2 身份段的字段与 F1 角色段的字段不对称）；故事年代/地域不注入（仅 storyEra 用于古风判定）——非古风时代（1980s/近未来）完全无时代锚。
- B：风格词注入点多达 5 处（D2 风格项/D4 锚点/F1 第 1 段/F1 第 12 段/:1266 尾部追加）互不对账；6b 与让位前缀重复；ancient_chinese 风格预设 + 古风硬约束双机制可四重叠加；古风双实现词表/文案/negative 均不同（已实锤漂移）；老入口 buildImagePrompt 未知 shotType push 空串致连续逗号。
- 好设计：时刻语言、风格让位（防写实词毁 Q 版参考图）、融合指令"保持贴入形象严格一致"、板说明"严禁输出参考板本身"——都来自真实事故，语义正确。

## F2. VLM 审核 keyframe-review.service.ts（system :76-99；user :224-228）

**功能目标**：以"实际发出的 prompt + 实际生效的参考图"为基准，机审关键帧能否进视频生成。

**实际组装**：
- System：[1] 角色与输入说明（"第一张图是待审核关键帧，后续是生成该帧时实际使用的参考图……用户消息里附有该帧的完整生成提示词"）→ [2] 任务（"判断关键帧是否可以直接进入视频生成"）→ [3] 检查项 3 条（人物一致性：面容/发型/服饰/配饰 vs 参考图，无参考图对照文字描述/内容覆盖：出场人物、核心动作、场景、关键物品是否都在/明显穿帮：多余人物、文字乱码、肢体畸形、与提示词矛盾的元素）→ [4] 输出 `{"consistent", "issues[]", "summary"}` → [5] 规则 4 条（consistent=false 当且仅当实质问题/主观偏好不算问题/issues 用人话写"哪里不一致"（示例「**阿蘅**的服饰：参考图是**素白医袍**，关键帧是红色长裙」）/无问题 issues 为空）。
- User：`【该帧生成提示词】{prompt}` + `【图片说明】第 1 张 = 待审核关键帧；其余 N 张 = 生成时实际使用的参考图`；≤5 图，temperature 0.1。

**差距分析**：
- 基准选取是全链路最佳实践（审真实发送内容，非重新组装）。
- 缺（A）：检查项无**时代一致性**（古风现代穿帮只能蹭"与提示词矛盾的元素"）；地点/物品只查"在不在"不查"像不像"。
- C：issues 示例含"阿蘅/素白医袍"（忘川渡项目）。
- B：isVisionCapable 靠模型名正则 /vl|vision|4o|gemini|claude/i 猜能力，新型号误判即静默 skipped。

## F3. 片段视频 prompt buildSegmentPrompt（segment-planner.ts:198-243）+ stripDialogueQuotes（:117-123）

**功能目标**：片段内各镜 → 视频模型的多镜头正文（界面所见即模型所得）。

**实际组装**（`${parts.join('；')}。${constraints.join('，')}。`）：
- 镜头正文 ×N：`镜头N（约Xs，景别中文，角度中文，运镜中文）：{frameDescription 经 stripDialogueQuotes 剥台词引文 + replaceAssetRefMarkers 剥 @[...] 为纯名}`（:202-215）；台词段（有台词时）：`；台词：{说话人：原文}，{说话人：原文}`（花括号声音符号协议，数据来自 storyboard_dialogue_links）。
- 约束尾依序：`总时长约 Xs` → `画面比例 16:9（1920x1080）` →（多镜时）`多个镜头之间保持人物、场景、光影与风格一致，镜头切换自然连贯` → 音频口径二选一（有台词"台词由对应人物以自然语速清晰说出，语音与各镜头时长匹配，不得加速、不得含糊、不得念错字"/无台词"画面中人物不说话，无人物对白语音，仅环境音"）→ `画面风格：{config.stylePrompt}` → `画面中不得出现字幕、文字、水印、LOGO`。
- 枚举→中文标签表（:138-172）：景别 8/角度 6/运镜 15（dolly_in:"推镜"、tracking_left:"左移"…——**cogen 词表，注释自称"取值域与 storyboard-cogen 一致"**）；未知值静默省略（:174 注释自认）。
- 台词剥离 SPEECH_QUOTE_RE：24 个言语动词（说道|说|问道|问|答道|答|回答道|回答|喊道|喊|叫道|叫|嚷道|嚷|喝道|怒道|笑道|叹道|嘀咕|嘟囔|念叨|沉声|轻声|低声|回应|开口）× 6 种引号配对；表外动词（喝问/冷笑/低语/质问…）漏剥。

**差距分析**：
- 全链路组成最合理的提示词：台词单一来源真正落地、音频口径防幻觉配音、负向尾巴防字幕烧录、时长/画幅/风格齐。
- 错（B）：运镜标签只覆盖 cogen 15 词表——camera-movements.ts 的 25 预设值（push/dolly_zoom/whip_pan…）和 E5 落库的虚构值全部静默省略，"界面所见即模型所得"对这部分运镜不成立。
- B（轻度）：动词表封闭集合，表外动词漏剥（有约束 13 校验补上后风险可控）。

## F4. 资产引用三段式 buildAssetRefPrompt（asset-ref-resolver.ts:224-258）+ annotateRefsWithSlots（:200-214）

**功能目标**：把资产主图/参考板以"主体外观来源"语义传给视频模型（assetRef2video 路径）。

**实际组装**（join('\n') 逐行）：
1. `subject_definitions:`
2. `{picDesc}，仅作为画面主体外观来源：{list}。`——picDesc 二选一（拼板"Picture 1 为资产参考板（多个编号分块，各分块是一张独立的资产图）"/单资产"Picture 1 为资产「{name}」的参考图"）；list 项 `{i}号={name}（{角色|场景|物品}：{外观摘要截 80 字}）`，'；' 连接。
3. 要求行四条："人物长相、发型、服装、配饰必须与对应编号资产完全一致；场景风格与地点资产一致；画面中每个人物只出现一次，不得出现重复的人物、分身或残影；物品道具仅出现在其归属人物身上……不要求保留 Picture 1 的拼贴构图，画面按 summary 描述的机位、场景与动作自然呈现。"
4. `summary:` + `[reference generation + audio reference] {buildSegmentPrompt 完整产出}`
5. `retention_analysis:` + `Subject 1（Picture 1 各编号主体）：fully_preserved - 仅保持主体外观与整体风格一致，画面按 summary 运动。`
- 编号标注 annotateRefsWithSlots：资产名按长度降序正则交替（防"雪麓山庄书房"vs"雪麓山庄"嵌套误标），每名标首次出现，替换为 `{名}（参考板第{N}号）`，编号与 subject_definitions 清单序号一致。
- 选图口径：confirmed=1 池强制（is_main 优先）→ 回退主图 → 无图跳过（与关键帧链路同源）。

**差距分析**：协议完整、红线显式（"仅主体外观来源""不要求保留拼贴构图"）、编号标注机制严谨、选图跨链路同口径——与 F3 并列全链路最成熟的两段。轻微问题：外观摘要 80 字硬截断可截在半截词上；道具"归属约束"依赖物品 description 里的自然语言（资产卡没写归属时无据可依）。

---

# G. 公共底座

## G1. JSON 截断续写 callAIWithContinue（ai-call.ts:602-637）

**实际组装**：截断判定（isJsonTruncated 逐字符括号配平）→ 续写提示词全文："上一轮你的 JSON 输出被截断了，请继续输出，从上次截断的地方继续完成 JSON。\n\n这是你上次输出的内容（被截断）：\n${jsonSoFar}\n\n请直接继续输出剩余的 JSON 内容，不要重复已经输出的部分，不要添加任何解释说明。"（jsonSoFar = 首个 `{` 起全部已输出内容）→ 同一 systemPrompt 原样复用，最多续 2 次 → mergeContinuationResponse 三分支拼接（从头重输出检测→最大重叠拼接→无重叠直拼）。

**差距分析**：机制通用可靠（重输出检测修复了"拼出两份 JSON"的旧 bug）。代价（B 轻度）：整份已输出 JSON 回贴使续写轮 prompt 体量近翻倍，上下文紧张时是双重占用；可优化为只回贴尾部 N 字符 + 括号配平上下文。

---

# 汇总：跨提示词的结构性结论

1. **输入饥饿集中在源头两步**：剧本生成（C1-C6 全系）与分镜 cogen（E1）——全链路最重要的两个生成环节——都没有故事背景/风格/目标时长注入；而润色器（C7）反而有背景。身份信息（性别/年龄/人种）到关键帧（F1）断链。
2. **写死的业务内容分四层**：具体项目名（沈云萝/秦越/雪麓山庄/白鹿城/阿蘅×2 处/杜十娘——其中阿蘅出现在 C0④与 F2 两处）＞短剧纪律（C0⑥、E1 约束 6、E6 定位）＞中文专属（4.5 字/秒、24 个言语动词、中文输出硬编码）＞古风偏置示例（C0③④、E3/E4 杜十娘、F1 古风双实现）。
3. **枚举词表共 6 套并存**：cogen 15 运镜 / camera-movements.ts 25 预设 / E5 填空虚构 24 项 / E6 VLM 6 值 / segment-planner 标签表 / fillStoryboardFields 角度 5 值（漏 worms_eye）——E5 的虚构值无校验直接落库是正在发生的活 bug。
4. **提示词与校验口径脱节 4 处**：E1 约束 6（说 1~10 查正数）、约束 13（禁引号台词无校验）、约束 6 与 shot-pacing 双份分叉、C7 禁增删 vs 合并代码容忍增删；另有纠错 prompt 与校验文案互相矛盾（E1）。
5. **风格词 5 个注入点**：D2 风格项 / D4 锚点前缀（标签"时代背景："与 D2"故事年代："还不同名）/ F1 第 1 段 / F1 第 12 段 / F1 调用方 :1266 尾部追加 / E7 风格行——无单一来源。
6. **成熟样板**：D2 身份段、F3 片段正文（台词单一来源落地）、F4 三段式（红线显式）、F2 审核基准选取、G1 续写三分支——优化应以这些为基准范式推广，而非推倒重来。
