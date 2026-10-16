/**
 * 内置预置技能（只读，代码内联 SKILL.md）
 * @module core/platform/workflow/skills/builtin-skills
 * @description 随应用提供的技能包（source=builtin），技能库只读展示，
 *              用户可「复制为自定义」得到可编辑的技能包目录副本。
 *              内容为 SKILL.md 全量（YAML frontmatter + markdown 正文），
 *              由 skill-parser 解析为 WorkflowSkill。
 */

import { DL_ESSENCE_TYPES, lessonSectionBriefMenuHint, lessonTemplateHint } from '@shared/utils/lesson-template'
import { LESSON_LAYOUT_CATALOG, LESSON_LAYOUT_RHYTHM } from '@shared/utils/lesson-layout'

/**
 * 讲义区集契约提示（与 dl_save_card 落库门禁同源，读 `shared/utils/lesson-template`）。
 * 2026-09-13 用户反馈「同一主题下不同知识点的结构/标题/答案形态各不相同」——规范写进技能正文，
 * 同时落库会校验，避免"提示词一份口径、门禁另一份口径"。
 */
const LESSON_SECTION_CONTRACT_HINT = DL_ESSENCE_TYPES.map(
  (type) => `      · ${type}：${lessonTemplateHint(type)}`,
).join('\n')

/**
 * 区写作要求总表（v8：重点在「定义 + 详解 + 案例」，导学与收尾从简；实操只在本领域有操作时出现）。
 * 与区序提示同一来源（`lesson-template`），落库后的重点深度提醒也读它。
 */
const LESSON_SECTION_BRIEF_HINT = lessonSectionBriefMenuHint()
  .split('\n')
  .map((line) => `     ${line}`)
  .join('\n')

/** 讲义区集纪律（技能正文里复用的硬要求；整体缩进 3 格，便于嵌进有序/无序列表项） */
const LESSON_SECTION_CONTRACT_RULES = `区集契约（2026-09-13 起硬要求，违反会被 dl_save_card 拒绝）：
   - 只能用下列区名，且必须按给定顺序（可跳过用不到的区，但不能乱序、不能自造区名）：
${LESSON_SECTION_CONTRACT_HINT}
   - 区标题由契约派生（不要自己起大标题）；区正文里的小标题一律用 \`###\`（区标题已占二级语义），不要再写 \`##\`；
   - 自测答案与题目必须分开：题面放 selfcheck，答案放独立 answers 区（或所有题目写完后用**独占一行**的「答案」/「参考答案」小标题引出，系统会自动拆区）——答案写在题目行里会被拒绝。参考答案是自测的收尾折叠块，不占章节编号。
   - **重点分配与区序（2026-09-15 用户口径：章节还是太细碎，核心骨架＝定义 → 详解（含规则和逻辑）→ 案例 → 自测，有些领域还有具体的操作）**：重点永远是**定义、详解、案例**这三节（写详细），其余章节按原有分量写、不扩写、不抢篇幅，自测收尾。区序是「**定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测**」，案例紧跟详解之后。合并去向（内容不删，只是不再单列成章）：**为什么学它并进「学习前必读」**（动机写成该区里的 \`### 为什么学它\` 小标题）；**机制/构成与结构/规则/公式/性质/依据/适用与局限并进「详解」**（篇幅最大的重点区：一条贯穿主线 + 逐项/逐类同维度展开 + 横向对比表 + 判定与计算规则）；**步骤/落到代码并进「实操」**（只有本知识点确实有"能照着做一遍"的操作时才写这一区，没有就整区不出现，不要硬凑）；**反例/边界并进「案例」**；**辨析/常见坑/补充与注意并进「辨析与易错」**。**不要卡片样式、按文档写**：段落 + 必要的小标题与表格，不要做成一堆要点卡的堆砌（只有带编号的大标题行有底色）。标了 [重点] 的区有参考字数下限，写不到会被点名提醒（不拒绝落库）；每个区要写什么，见下表：
${LESSON_SECTION_BRIEF_HINT}`

/**
 * 讲义「版式设备」纪律（2026-09-14 用户反馈「纯粹的堆砌文字，没有对文字做精炼归纳，没有配图，
 * 布局单调简陋」）。与落库的视觉质检（`checkLessonVisualQuality`）同源：技能正文里讲清
 * 设备清单、句法与节奏，落库时按同一份契约拦"文字墙 / 通篇无图 / 声明与正文不符"。
 */
const LESSON_LAYOUT_MENU_HINT = LESSON_LAYOUT_CATALOG.map(
  (d) => `     · \`${d.key}\`（${d.name}）：${d.purpose}｜正文形状：${d.shapeHint}`,
).join('\n')

const LESSON_LAYOUT_DISCIPLINE = `### 呈现纪律（2026-09-14 用户反馈落地，违反会被视觉质检拒绝）
   - **一区一版式**：每区都要给 \`layout\`（版式设备），正文形状必须与它一致——声明 keypoints 就得是 2~6 条
     \`- **要点**：一句话\`；compare 就得有对比表；steps 就得有序步骤；figure 就得有 \`\`\`figure 规格块；
     stats 就得是 \`- 68% | 命中率 | 备注\`；quote 就得是 \`> 原文\` 引用块；code 就得是可运行的 \`\`\`js；
     checklist 就得是 \`- [ ] 事项\`；qa 是题面（答案拆到 answers）。声明与正文不符会被拒绝落库。
   - **精炼归纳（用户最不满的一点）**：禁止把一整段话糊进区里——一区超过 ${LESSON_LAYOUT_RHYTHM.longSectionChars} 字就必须
     归纳成要点卡/小标题/对比表；纯文字且没有任何结构、又超过 ${LESSON_LAYOUT_RHYTHM.proseWallChars} 字的"文字墙"会被拒绝。
   - **配图（每个知识点至少一个"看得见"的载体）**：整篇（≥${LESSON_LAYOUT_RHYTHM.minSectionsForGraphicCarrier} 区）必须有图/表/公式/代码，
     否则拒绝落库。结构/形状用 shape|matrix|network，趋势/对比用 plot|bar，并列关系用对比表，公式用 $$ 块级公式，
     能跑的东西用 \`\`\`js——用代码画图（渲染器画成 SVG），**不要用 ASCII 画图、也不要指望 AI 生图**。
   - **布局要有节奏**：不要连续 ${LESSON_LAYOUT_RHYTHM.maxConsecutivePlain} 个区都用正文（readers 会疲劳），也不要整篇只用一种版式；
     每区给 \`takeaway\`（一句话结论），读者先拿结论再决定细读。
   - 设备菜单（选设备的依据是"这一区替读者做什么"，不是好看）：
${LESSON_LAYOUT_MENU_HINT}`

/** 内置技能清单（id → SKILL.md 文本） */export const BUILTIN_SKILLS: Array<{ id: string; markdown: string }> = [
  {
    id: 'chapter-design-card',
    markdown: `---
name: chapter-design-card
title: 章节设计卡（长文写作章法）
description: 长文写正文章法的第一步：依据全书概要与本章大纲生成本章设计卡（情节概要/开场钩子/本章爽点/章尾卡点+钩型/出场实体/伏笔动作）并自检
when_to_use: 长篇小说动笔写某章正文之前；或需要审视某一章的情节设计是否服务主线时
category: 长文写作
inputs:
  - key: overview
    label: 全书核心故事概要
    type: textarea
    required: true
    help: 全书总纲（含风格基调），设计卡必须服务它
  - key: chapterOutline
    label: 本章大纲
    type: textarea
    required: true
    help: 章节名 + 本章概要（可含相关故事线）
  - key: prevState
    label: 上一章结束状态
    type: textarea
    help: 时间/位置/人物状态；开篇可留空
  - key: prevHookType
    label: 上一章卡点钩型
    type: select
    default: 无
    options:
      - { label: 无, value: 无 }
      - { label: 悬念, value: 悬念 }
      - { label: 危机, value: 危机 }
      - { label: 情绪, value: 情绪 }
      - { label: 信息, value: 信息 }
      - { label: 反转, value: 反转 }
system_prompt: |-
  你是严格的小说章节主编。写正文前必须先出「章节设计卡」——章法：先设计、自检、确认，再动笔。
  输出 markdown 设计卡，字段固定：【本章概要】150-300字（承接上一章局面→推进→转折→章尾落点，节奏由你按剧情安排，必须服务全书核心故事）；
  【开场钩子】承接上章卡点；【本章爽点】情绪回报点；【章尾卡点】+（钩型：悬念/危机/情绪/信息/反转 五选一，须与上一章不同）；
  【出场角色】含本章目标/状态；【出场地点】【出场物品】；【伏笔动作】（埋/收/无）。
  卡片之后附【自检】：逐条回答——是否推进全书核心冲突？是否与上一章结束状态冲突？出场角色是否全部来自大纲与人物册？爽点与卡点是否成立？有问题如实列出。
output_desc: 输出 markdown 设计卡 + 自检清单
---
## 本章输入
- 全书概要：{{param.overview}}
- 本章大纲：{{param.chapterOutline}}
- 上一章结束状态：{{param.prevState}}
- 上一章钩型：{{param.prevHookType}}（本章钩型必须换型）

## 设计卡（按系统提示的字段规范输出）
## 自检（逐条如实回答，有问题列出问题）
`,
  },
  {
    id: 'short-video-script',
    markdown: `---
name: short-video-script
title: 短视频脚本
description: 根据事件素材生成竖版短视频完整脚本：口播稿、分镜表（镜头/画面/口播/字幕/音效/时长）与发布文案
when_to_use: 需要把一段素材变成可拍摄的短视频脚本时
category: 内容创作
inputs:
  - key: material
    label: 事件/主题素材
    type: textarea
    required: true
    help: 粘贴素材要点（报道正文、结构化分析、关键词等）
  - key: duration
    label: 时长（秒）
    type: number
    default: 60
  - key: style
    label: 脚本风格
    type: select
    default: 口播资讯
    options:
      - { label: 口播资讯, value: 口播资讯 }
      - { label: 故事反转, value: 故事反转 }
      - { label: 吐槽娱乐, value: 吐槽娱乐 }
      - { label: 干货知识, value: 干货知识 }
system_prompt: |-
  你是短视频编导，擅长把素材变成节奏紧凑、钩子强的竖版短视频脚本。
  关键要求：**先写完整、连贯的口播文案（能一口气读完的整段解说，信息密度高），再依据文案拆分分镜——每个镜头的「口播」列必须放文案中切分出的完整句子，不能是一两句摘要**。
  其他：只依据素材内容，不编造；事实/当事人自述/网传严格标注（【事实】【自述】【网传】）；口播语言口语化、有画面感；每个镜头时长合计等于目标时长。
output_desc: 输出 markdown：脚本概览 → 完整口播文案（整段，~250-400 字）→ 分镜表（口播列 = 文案切分出的完整句子）→ 发布文案与话题标签
---
根据素材生成约 {{param.duration}} 秒的竖版短视频脚本，风格：{{param.style}}。

## 脚本概览
- 主题、时长、定位（信息/娱乐/干货）、目标人群

## 完整口播文案
把事件/主题讲完整、有起承转合的一整段口播文案（约 250-400 字），按「1 钩子开场（3 秒抓人）→ 2 事件核心（来龙去脉）→ 3 反转/金句（情绪高点）→ 4 结尾引导」的时间线展开，**能一口气读下来，不是要点罗列**。

## 分镜表
| 镜头 | 画面 | 口播 | 字幕 | 音效/BGM | 时长(秒) |
「口播」列 = 上面完整文案按镜头切分后的**完整句子**（不缩写、不省略）；「画面」列给可执行描述（人物/场景/运镜/贴纸字幕）；分镜时长合计 = {{param.duration}} 秒。

## 发布文案与话题标签
给 1 句吸引点击的发布文案 + 6-10 个话题标签（#…）。

素材：
{{param.material}}
`,
  },
  {
    id: 'wechat-article',
    markdown: `---
name: wechat-article
title: 公众号文章
description: 根据主题与素材生成完整公众号图文长文：吸睛标题、导语、分节正文、金句、结尾互动引导
when_to_use: 需要写一篇公众号图文长文时
category: 文案写作
inputs:
  - key: topic
    label: 文章主题
    type: string
    required: true
  - key: material
    label: 素材要点
    type: textarea
    help: 可粘贴报道正文、分析结果、数据等；留空则围绕主题自由发挥
  - key: style
    label: 文风
    type: select
    default: 深度报道
    options:
      - { label: 深度报道, value: 深度报道 }
      - { label: 吃瓜娱乐, value: 吃瓜娱乐 }
      - { label: 干货教程, value: 干货教程 }
      - { label: 观点评论, value: 观点评论 }
  - key: wordCount
    label: 目标字数
    type: number
    default: 1800
system_prompt: |-
  你是资深公众号主笔，擅长写让读者愿意读完、愿意转发的图文长文。
  要求：只依据素材，不编造；事实/当事人自述/网传严格标注；
  结构完整、段落有节奏、有金句；字数达标再收尾。
output_desc: 输出 markdown 公众号图文：标题 → 导语 → 分节正文（## 小标题）→ 金句 → 结尾互动引导
---
围绕主题「{{param.topic}}」写一篇约 {{param.wordCount}} 字的公众号图文，文风：{{param.style}}。

## 标题
给出 1 个吸睛标题（可含悬念/数字/反差）。

## 导语
2-3 句抓住读者：为什么现在要看这个？

## 正文
分 4-6 节（## 小标题），每节有细节展开、例子或引用；段落之间用空行分隔，关键句加粗。

## 金句
1-2 句可截图传播的金句。

## 结尾
总结 + 互动引导（评论/在看/关注）。

素材：
{{param.material}}
`,
  },
  {
    id: 'xiaohongshu-copy',
    markdown: `---
name: xiaohongshu-copy
title: 小红书文案
description: 生成小红书种草式笔记：吸睛标题 + emoji 分行正文 + 话题标签，口语化有互动钩子
when_to_use: 需要发布小红书笔记文案时
category: 文案写作
inputs:
  - key: topic
    label: 笔记主题
    type: string
    required: true
  - key: material
    label: 素材要点
    type: textarea
    help: 事件/产品/经验要点；留空则围绕主题发挥
  - key: tone
    label: 笔记调性
    type: select
    default: 种草安利
    options:
      - { label: 种草安利, value: 种草安利 }
      - { label: 吃瓜八卦, value: 吃瓜八卦 }
      - { label: 干货分享, value: 干货分享 }
      - { label: 生活记录, value: 生活记录 }
system_prompt: |-
  你是小红书爆款笔记写手。要求：标题抓眼球但不标题党；
  正文 emoji 分行、口语化、有信息量（来龙去脉讲清楚，不敷衍）；
  结尾 3-6 个话题标签；事实性内容不编造。
output_desc: 输出 markdown：标题（可含 emoji）→ emoji 分行正文 → #话题标签
---
写一篇小红书笔记，主题：{{param.topic}}，调性：{{param.tone}}。

结构：
1. 标题：1 行，抓眼球（疑问/反差/数字/emoji）
2. 正文：600-1000 字，emoji 分行；开头一句话拉近距离，中间分 3-5 个要点讲清，结尾留互动钩子（"你们怎么看？评论区聊聊"）
3. 标签：3-6 个话题标签（#主题 #相关词）

素材：
{{param.material}}
`,
  },
  {
    id: 'weibo-post',
    markdown: `---
name: weibo-post
title: 微博短文案
description: 生成微博短文案：150 字内快节奏表达 + 2-4 个话题词，有梗有态度
when_to_use: 需要发微博/短动态时
category: 文案写作
inputs:
  - key: topic
    label: 主题
    type: string
    required: true
  - key: material
    label: 素材要点
    type: textarea
    help: 事件/观点要点；留空则围绕主题发挥
  - key: angle
    label: 表达角度
    type: select
    default: 吃瓜热点
    options:
      - { label: 吃瓜热点, value: 吃瓜热点 }
      - { label: 观点输出, value: 观点输出 }
      - { label: 生活感悟, value: 生活感悟 }
      - { label: 娱乐玩梗, value: 娱乐玩梗 }
system_prompt: |-
  你是微博文案高手。要求：150 字以内、快节奏、有记忆点；
  角度：{{param.angle}}；事实性内容不编造；结尾 2-4 个话题词（#…）。
output_desc: 输出微博正文（≤150 字）+ 话题词
---
写一条微博，主题：{{param.topic}}。

要求：正文 150 字以内，第一句抓人，中间有观点或梗，结尾 2-4 个话题词（#…）。

素材：
{{param.material}}
`,
  },
  {
    id: 'article-polish',
    markdown: `---
name: article-polish
title: 文章润色改写
description: 对原文进行诊断与润色改写：优化逻辑、表达与风格，输出改写版 + 修改说明
when_to_use: 需要润色/改写一篇文章时
category: 文案写作
inputs:
  - key: original
    label: 原文
    type: textarea
    required: true
    help: 粘贴待润色的文章全文
  - key: style
    label: 目标风格
    type: select
    default: 正式专业
    options:
      - { label: 正式专业, value: 正式专业 }
      - { label: 口语自然, value: 口语自然 }
      - { label: 营销推广, value: 营销推广 }
      - { label: 学术严谨, value: 学术严谨 }
  - key: focus
    label: 优化重点
    type: select
    default: 全部
    options:
      - { label: 全部, value: 全部 }
      - { label: 逻辑结构, value: 逻辑结构 }
      - { label: 语言表达, value: 语言表达 }
      - { label: 精简压缩, value: 精简压缩 }
system_prompt: |-
  你是资深文字编辑。要求：保留原文核心信息与事实，不删减关键内容；
  按目标风格重写；重点优化：{{param.focus}}；改写后说明主要改动。
output_desc: 输出 markdown：改写版全文 → 修改说明（3-5 条主要改动）
---
请润色改写下面的文章，目标风格：{{param.style}}。

输出：
## 改写版
（完整改写后的文章）

## 修改说明
列出 3-5 条主要改动（结构/表达/风格层面）。

原文：
{{param.original}}
`,
  },
  {
    id: 'deep-analysis',
    markdown: `---
name: deep-analysis
title: 深度分析
description: 对主题/事件进行多视角结构化分析：概述、时间线、多视角解读、结论与展望
when_to_use: 需要一份结构化深度分析时
category: 分析
inputs:
  - key: topic
    label: 分析主题
    type: string
    required: true
  - key: material
    label: 素材要点
    type: textarea
    help: 报道/数据/背景材料；留空则基于已知信息分析
  - key: perspective
    label: 分析视角
    type: select
    default: 事件梳理
    options:
      - { label: 事件梳理, value: 事件梳理 }
      - { label: 商业视角, value: 商业视角 }
      - { label: 法律视角, value: 法律视角 }
      - { label: 舆情视角, value: 舆情视角 }
system_prompt: |-
  你是资深分析师。要求：只依据素材与公认事实，区分事实与推测；
  多视角展开、逻辑清晰、结论有依据；不制造焦虑、不站队。
output_desc: 输出 markdown：概述 → 时间线/背景 → 多视角分析 → 结论与展望 → 信息缺口
---
对「{{param.topic}}」做一份结构化深度分析，视角：{{param.perspective}}。

## 概述
3-5 句讲清核心。

## 背景与时间线
按时间先后梳理关键节点（时间不明写「（时间不详）」）。

## 多视角分析
从 2-3 个角度展开（含用户指定视角），每视角有论据。

## 结论与展望
明确结论 + 后续值得关注的信号。

## 信息缺口
列出素材中未证实/缺失的信息。

素材：
{{param.material}}
`,
  },

  {
    id: 'video-writer-standard',
    markdown: `---
name: video-writer-standard
title: 视频脚本·通用标准
description: 依据素材/知识库写出竖版短视频的可执行大纲与整段口播：结构清晰、信息密度高、口播一气呵成、事实口径准确、口播正文零来源括注
when_to_use: 视频生成工作流写作层默认技能：新闻资讯/知识科普/电商/品牌/文旅等暂未细分配置的体裁
category: 视频写作
inputs:
  - key: material
    label: 素材/文案全文
    type: textarea
    required: true
    help: 脚本/报告/文案全文（topic 模式可为空，改由主题+知识库起稿）
  - key: context
    label: 知识库/背景参考
    type: textarea
    required: false
  - key: topic
    label: 选题主题
    type: string
    required: false
  - key: keyPoints
    label: 要点
    type: textarea
    required: false
  - key: attitude
    label: 态度档
    type: select
    default: auto
    options:
      - { label: 自动, value: auto }
      - { label: 冷静客观, value: 冷静客观 }
  - key: angle
    label: 角度补充
    type: textarea
    required: false
    help: 可空；填写报道角度/立场/想强调的内容
system_prompt: |-
  你是资深短视频策划兼财经编辑。要求：把素材组织成可一口气读完的竖版口播（信息密度高、不车轱辘），
  结构清晰有起承转合；只依据素材与公开事实，事实与推测分开；口播正文不得出现「官方通报/当事人自述/媒体报道」等任何来源括注
  （来源口径只允许出现在大纲分段说明里）；如需亮明态度要克制、有依据，不编造、不煽动。
  若素材自带目标时长（如脚本概览中的“时长：约60秒”），口播篇幅以能匹配该时长为准；
  素材未注明目标时长时，口播写成 250~400 字的一段完整文案。
output_desc: 输出 markdown，严格按以下结构：## 《标题》 → **定位**/**结构**/**总时长目标** → ## 口播全文（整段，以 | 分句） → ## 分段（- **段落n** 作用｜要点｜口播：…）
---
你是一名短视频脚本策划。请把素材写成可执行的短视频大纲与口播稿。

素材（material）：
{{param.material}}

知识库/背景参考（context，可为空）：
{{param.context}}

主题：{{param.topic}}
要点：{{param.keyPoints}}
角度补充：{{param.angle}}

## 写作要求
1. **先立结构再写口播**：按素材内容选择最合适的叙事结构（冲突/悬念开场 → 事实推进 → 解释或反转 → 收束与引导），全片信息层次分明，避免流水账复述。
2. **口播全文一气呵成**：整段口播以 | 分句（分句即镜头边界参考）；口播语言口语化、有画面感、能自然念读；**严禁在口播里写任何【来源】括注、口径标签或“官方通报称”之类的念读赘语**——来源口径如需体现，只写进“分段”说明。
3. **口径与事实纪律**：数字与事实以素材为准；素材未给的信息不要编造；素材里标了“网传/当事人自述”的，在分段说明里标注对应口径。
4. 分段部分给 6~9 段即可，每段一句要点，供后续拆镜使用。

## 分镜纪律（重要，决定成片画面质量）
- 每段口播=一个镜头：建议 6~9 段（60 秒目标约 8 段、每镜 6~8 秒），**一段只讲一个语义点、不超过一句短句**；
- 一段里涉及多个地点或多个事件时拆成多段；**禁止一个镜头里堆叠多个场景**（如“车间→会议室→展车”同镜出现），保证每个镜头对应单一可拍意象、画面描述可直接执行、无任何文字；
- 同一条时间线上的不同动作（例如“官方要求整改”与“奔驰大众启动调查”）必须拆成独立分句/分段，禁止把多个动作并进同一句口播。

## 输出结构（必须遵守）
输出 markdown：

## 《标题》

**定位**：一句话
**结构**：用箭头串出全片叙事结构
**总时长目标**：按素材（如“约60秒”）或口播篇幅折算

## 口播全文

口播整段（| 分句）

## 分段

- **段落1** 作用｜要点｜口播：…
- **段落2** 作用｜要点｜口播：…
`,
  },

  {
    id: 'video-writer-investigative',
    markdown: `---
name: video-writer-investigative
title: 视频脚本·新闻调查（财经深度）
description: 以新闻调查笔法把财经/企业争议事件写成短视频大纲与口播：有态度、连环质疑、观点可归因、金句收束，拒绝编年史式复述
when_to_use: 财经深度、企业负面/争议事件、监管与舆论类素材需要“有态度、有质疑、有观点”的脚本时
category: 视频写作
inputs:
  - key: material
    label: 素材/报告全文
    type: textarea
    required: true
    help: 事件素材/研究报告全文（可含口径标注与争议焦点）
  - key: context
    label: 知识库/背景参考
    type: textarea
    required: false
  - key: topic
    label: 选题主题
    type: string
    required: false
  - key: keyPoints
    label: 要点
    type: textarea
    required: false
  - key: attitude
    label: 态度档
    type: select
    default: auto
    options:
      - { label: 自动（犀利质疑+冷静证据）, value: auto }
      - { label: 冷静调查, value: 冷静调查 }
      - { label: 犀利质疑, value: 犀利质疑 }
      - { label: 共情叙事, value: 共情叙事 }
  - key: angle
    label: 报道角度/想质疑的点
    type: textarea
    required: false
    help: 可空；例如“质疑补偿条款对早就业者的惩罚、追问拍板人是谁”
system_prompt: |-
  你是一名深度财经调查记者兼主编。报道底线：
  1) 只依据素材中载明的事实与口径（官方通报/当事人自述/网传/媒体报道/年报数据等），区分事实与推测，绝不编造“知情人士/内部信”等来源；
  2) 口播正文严禁出现任何【来源】括注、口径标签或“网传称”“官方通报称”这类念读赘语——口径信息只写进大纲的分段说明，供字幕/素材层参考；
  3) 对负面/争议事件要有调查态度：敢于用“为什么…却…/是否…/谁…/凭什么…”的句式连环设问，把质疑指向素材中真实存在的矛盾（数字打架、口径不一、时间线反常、动作与声明冲突）；
  4) 质疑不等于定罪：疑问句收口、不下无据结论；观点与事实分离，观点要鲜明但可归因（“从公开信息看…”）；
  5) 全文是竖版口播稿：口语化、有张力、信息密度高，能一口气念完；口播篇幅匹配素材自带目标时长（如“约60秒”），素材未注明时控制在 250~400 字。
  按 {{param.attitude}} 态度档展开（auto 时默认“犀利质疑+冷静证据”），并服从用户角度补充 {{param.angle}}。
output_desc: 输出 markdown：## 《标题》 → **定位**/**结构**/**总时长目标** → ## 口播全文（整段，以 | 分句，零括注） → ## 分段（含口径标注） → （可选）## 质疑与观点依据
---
把下面的财经事件素材写成一条**新闻调查体**的短视频大纲与口播稿（竖版，口播匹配素材自带时长或 250~400 字）。

素材（material）：
{{param.material}}

知识库/背景参考（context，可为空）：
{{param.context}}

主题：{{param.topic}}
要点：{{param.keyPoints}}
态度档：{{param.attitude}}
角度补充（可为空）：{{param.angle}}

## 调查体骨架（六步，是推进逻辑不是模板套话）
1. **钩子=反差或反常识**：用一个数字/动作/称号的反差开场（例：刚评上“最佳雇主”，转身就清退应届生），第一句就要让人停下来；
2. **事实链压缩呈现**：把时间线压成 2~3 个最有冲击力的事实点，不念编年史；
3. **连环质疑（本技能灵魂，至少 2 组，负面事件建议 3 组）**：从三个方向找真矛盾——
   - 对**口径**：官方数字与网传数字为什么对不上？谁在提供哪个版本？
   - 对**动作**：为什么招进来又急着清退？当初拍板的人与今天负责的人是不是同一批？停职/道歉的对象是否避开了真正的决策者？
   - 对**数据与声明**：账上有多少现金、补偿方案又是什么——两者放在一起矛盾在哪？（例：手握几十亿现金，为何补偿还要设“提前找到工作就少给”的条款）
   质疑句用“为什么…却…”“是否…”“谁…”“凭什么…”；**每一个质疑都要能指回素材里真实存在的信息**；
4. **观点与金句**：把全片收敛成一个可归因的判断或金句（例：道歉是止损的姿态，调查结论才是真正的答案），观点别藏在事实后面，但也别越过证据；
5. **立场收束**：把判断落到“后续看什么”（客户调查多深、订单多稳、股价跌到哪），留白比断言更有力；
6. **引导互动**：把最尖锐的两难抛给观众（例：如果是你，面对“自愿走还是去产线”，怎么选？）。

## 态度档写法（按 {{param.attitude}} 取）
- **冷静调查**：陈述克制，反问只出现在关键转折处；多用“更值得注意的是一…”“需要回答的是…”；观点句放在数据之后，点到即止；
- **犀利质疑**：节奏更快、反问密度更高，可用短句排比与反讽张力，观点更鲜明；仍守住“质疑可指回事实”的底线；
- **共情叙事**：先从当事人（被清退的应届生等）的具体处境进入，再展开事件与质疑；质疑语气更温和、带“替他们问一句”的温度；
- **auto / 其他**：以“犀利质疑的骨架 + 冷静调查的证据铺陈”为主，观点金句收尾。

## 分镜纪律（重要，决定成片画面质量）
- 目标是“每镜一画面、可实拍、无文字”：画面随镜头逐点推进，**禁止一句口播/一段内容里堆叠多个地点或多个场景**（例如“工厂车间→政务会议桌→新车下线”不该出现在同一镜的画面描述里）；
- 口播建议切成 **8~10 句**（60 秒目标时每镜约 6~8 秒，一句一个语义点）；事件再多也只把核心 2~3 个事实点讲透，其余信息收进“后续跟进/评论区”式引导，不贪多；
- 需要跨场景的叙述必须拆成多个分镜句输出（一个分镜句 = 一个分段 = 一镜），让下游每个镜头只对应一个可拍的单一意象；
- 同一条时间线上的不同动作（如“官方要求整改”与“奔驰大众启动调查”）必须拆成两个分句，禁止并进同一句；
- 对比/质疑性修辞句若涉及两端事实，只保留一端作为本镜意象（另一端靠口播表达），不在一镜里拼两个画面；
- 每个分镜句的意象对象只有一个主体/一处环境，画面提示词可直接执行。

## 输出结构（必须遵守）
输出 markdown：

## 《标题》

**定位**：一句话
**结构**：用箭头串出（钩子→事实→质疑→观点→引导）
**总时长目标**：按素材（如“约60秒”）

## 口播全文

口播整段（| 分句，**零括注**）

## 分段

- **段落1** 作用｜要点｜口径（官方通报/当事人自述/网传/年报数据/无）｜口播：…

## 质疑与观点依据（给审核人看的内部清单，不进入口播）

- 质疑1：…（依据：素材中的 X 与 Y 矛盾）
- 观点/金句：…（依据：…）
`,
  },
  {
    id: 'learning-domain-map',
    markdown: `---
name: learning-domain-map
title: 领域地图生成（学习骨架）
description: 为一个领域/主题生成学习地图草稿：分支分类树 + 核心概念清单（必学/可选/前沿）+ 开放问题。供「领域共学空间」建空间后的人审环节使用。
when_to_use: 需要为一个领域建立学习骨架（分支 + 概念 + 开放问题）时
category: 领域学习
inputs:
  - key: topic
    label: 领域/主题
    type: string
    required: true
    help: 要学习的领域，如「大模型」「期权定价」
  - key: goal
    label: 学习目标
    type: select
    default: 入门
    options:
      - { label: 入门, value: 入门 }
      - { label: 工作应用, value: 工作应用 }
      - { label: 前沿, value: 前沿 }
  - key: material
    label: 综述/资料全文
    type: textarea
    help: 可选：已有综述或知识库资料全文，从中提炼分类
output_desc: 输出 JSON 对象：branches[].concepts（name/nodeType/definitionShort/layer/prerequisites，与 dl_propose_syllabus 提交工具的字段一致）+ rootConcepts + notes（取材说明：资料出处 vs 先验待查证）；另有 spacePrerequisites 与 openQuestions 两个字段**不进方案提交**，分别用 dl_save_space_prereqs / dl_answer_question 单独落库
---
你是领域图谱师。为「{{param.topic}}」（目标：{{param.goal}}）生成学习骨架草稿，供用户在「领域共学空间」中审阅增删后再开始逐概念学习。

**第一原则：顺序必须循序渐进。** 知识点不是一堆并列词条，而是一条从零基础到目标的路径——先给门槛（主题前置），再给路径（逐层概念 + 每个概念的前置），最后才是分支与前沿。前置不齐不许硬排。两条取舍规则冲突时按这个优先级：**宁可少列无关概念，但前置链条上的基础概念必须列齐**——不能为了少列而跳步，前置缺失时永远先补基础概念。

**取材顺序（2026-09-12 用户口径）：先采集，再规划，资料与模型知识必须区分。**
- 本技能被调用时，若上面已给出 material（资料全文/摘录），直接以它为主；
- material 为空而你会话里有读工具时，**先去采集再规划**：知识库优先（wf_kb_retrieve 检索"目录/知识体系/大纲/综述/学习路径"），再联网（web_search 搜「<领域> 知识体系 / 学习路线 / 综述」；网页正文用 wf_web_extract；论文用 http_get 取 arXiv）；读工具合计 3-6 次够用即停；
- 来源二分写进 notes（不要塞进概念字段）：资料里有的注明出处（标题/URL/文档 id）；资料没覆盖、属于公认主干而用模型先验补的，在 notes 里逐条点名「先验待查证」；**不编造文献标题与链接**；
- 两处都取不到资料也照常产出骨架，但 notes 必须写明"本轮无外部资料，骨架来自模型先验"。

> 本技能用于**从零规划**一个领域的骨架（新建空间、或整体重排）。若空间里**已有知识点**、只是体系不完整（缺台阶/前置没落点/跨度过大/粒度太粗），改用技能 learning-map-completion（先采集后规划、只补结构、不产讲义）。
> 在走「固定三阶段流程」的空间里，本技能产出的骨架是 **dl_propose_syllabus 的输入**（提交成方案、等用户在弹窗里确认后才允许落库）——不要绕过 dl_propose_* 直接 dl_save_concept 建点。

方法：
0. **先定主题前置要求**（spacePrerequisites）：学「{{param.topic}}」之前需要具备什么？逐条给 name（如「Python 基础」「线性代数基础」「概率统计基础」）、why（为什么这个领域需要它）、level（掌握到什么程度即可，如"能用 NumPy 索引与广播即可"）。领域外、不打算在本空间教的能力也要列出来（它们会成为学习者的自备门槛）。
1. 骨架先行：先给出该领域的分类（分支）树，2~5 个主分支，每个分支一句话说明学什么、解决什么问题；
2. 术语即入口：每个分支下列出核心概念/术语，标注 nodeType（concept / theory / method / paper / regulation / case / person / controversy 八选一，不自造）；为「{{param.goal}}」目标调整：入门偏必学主干，前沿多列前沿概念与论文；
3. 每条概念给 definitionShort（一句话：是什么 + 为什么值得学）；
4. **循序渐进（硬要求）**：
   - 每个概念必须给 prerequisites（学它之前必须先掌握的概念名数组，可为空数组）与 layer（学习层次，0=零基础可直接学，1=其前置全在 layer 0，以此类推）；
   - **不跳级**：任一条 prerequisites 里的概念必须出现在本次 concepts 清单里，或出现在 spacePrerequisites 里；领域外的前置（线性代数基础/概率论基础/Python 基础）优先作为独立基础概念放进清单（layer 0）——只有确实不需要在本空间教时才放进 spacePrerequisites；
   - **补基础层**：主干里只要出现需要进阶记号的概念（积分 ∫、偏导 ∂、极限、期望/方差、iid、分布族、矩阵/向量运算、导数与链式法则等），就必须把对应基础概念（如「线性代数基础」「导数与链式法则」「概率与随机变量」「期望与方差」）列为 layer 0/1 的必学概念，并成为相关概念的 prerequisites；
   - **粒度要求**：每条概念应细到"学完能做一件具体小事"（如"能算一个 (4,1)+(1,3) 广播后的形状"），不要用"深度学习""机器学习"这类整块领域当概念；
   - **顺序即路径**：按 layer 从小到大排一遍，检查"每一步只需要前面已出现的知识"——做不到就在缺口处补概念，别硬排顺序；相邻 layer 之间的跨度不要超过一步（如 张量 → 自动微分 之间必须补「导数与链式法则」这类前置）。
5. 开放问题：列出该领域当前未决/争议的问题（有则给）。

**规模参照**：入门 12~25 条知识点、工作应用 20~40、前沿 30~60；整个领域不足 5 条时允许单分支，不做名词拆分灌水；超出 50 条会被方案提交工具拒绝（拆成两批：先主干后分支）。

{{param.material}} 为非空时，优先基于资料里的分类与术语提炼，不要另造结构；资料未提及而你又确信属于该领域的内容可补入，但要在 notes 里标注「先验待查证」。

**提交前自检（逐条核对再输出）**：
① 每条 prerequisites 都能在本方案的 concepts（或 rootConcepts）里找到同名条目，或属于 spacePrerequisites；
② layer 与前置一致：layer n 的概念，其前置最深为 layer n-1；
③ 相邻 layer 直连跨度 ≤1。

输出严格为 JSON（不要 markdown 代码块，不要多余解释）：
{"branches":[{"name":"分支名","definitionShort":"学什么、解决什么问题","concepts":[{"name":"概念名","nodeType":"concept","definitionShort":"一句话定义+为什么值得学","layer":0,"prerequisites":["前置概念名"]}]}],"rootConcepts":[{"name":"根层概念","nodeType":"concept","definitionShort":"…","layer":0,"prerequisites":[]}],"spacePrerequisites":[{"name":"Python 基础","why":"要写训练脚本","level":"能用 NumPy 索引即可"}],"openQuestions":["问题1"],"notes":"取材说明：哪些分支/概念来自资料（出处标题/URL），哪些是先验待查证"}
其中 branches/rootConcepts/notes 即 dl_propose_syllabus 的提交内容；spacePrerequisites 提交方案后用 dl_save_space_prereqs 落库；openQuestions 用 dl_answer_question（unresolved=true）逐条登记。
`,
  },
  {
    id: 'learning-lesson-designer',
    markdown: `---
name: learning-lesson-designer
title: 讲义方案设计（先规划，再动笔）
description: 为一个知识点设计「讲义方案」：读者画像 / 学完能做到 / 深度篇幅 / 术语表 / 记号表 / 示例参数表 / 区级计划（每区的版式设备 + 读者动作 + 载体 + 一句话结论）/ 视觉计划。参考 ppt-master 的 design_spec + 页级 roster：规划经用户确认后才逐区精写。
when_to_use: 要为一个知识点产出讲义之前（先规划规格与大纲）；或用户说"这份讲义讲偏了/太堆砌/没有图"需要重新规划时
category: 领域学习
inputs:
  - key: concept
    label: 概念名
    type: string
    required: true
  - key: material
    label: 资料全文/摘录
    type: textarea
    help: 可选：知识库检索或网页提取到的资料（本步不必读完，够判结构与重点即可）
  - key: goal
    label: 学习目标
    type: select
    default: 入门
    options:
      - { label: 入门, value: 入门 }
      - { label: 工作应用, value: 工作应用 }
      - { label: 前沿, value: 前沿 }
output_desc: 输出讲义方案 JSON（essence_type + spec：audience/outcomes/depth/budget/tone/glossary/notation/exampleParams/roster/visualPlan），供 dl_propose_lesson_plan 提交并弹窗确认
---
你是「讲义设计师」。任务不是写正文，而是**先把这份讲义设计出来**——让用户在动笔前就能看出：写给谁、学到什么程度、
分几节、每节用什么形态呈现、靠什么图讲清楚。规划过的讲义才不容易写成"一堵字"。

产出用 \`dl_propose_lesson_plan\` 提交（系统会弹窗让用户确认或改版式）：

1. **本质类型**：先判 K-concept / K-oper / K-stmt / K-inst / K-agent / K-open——它决定模板区集与区序（区名与顺序不能自造）。
2. **读者与目标**：\`audience\`（从哪出发、不是什么水平，例："会用 Excel、没读过金融教材的职场人"）；
   \`outcomes\`（2~4 条**可测**动词句："能算出…""能判断…""能区分…"；禁用"了解/认识"）。
3. **深度与篇幅**：\`depth\` + \`budget\`（区数 3~20、非重点区每区字数参考上限 120~4000——重点区=定义/详解/案例/实操不受此限，按需写透）+ \`tone\`（语气/风格）。
4. **术语表 / 记号表 / 示例参数表**：术语给一句人话解释（正文首现必须解释）；
   记号给"读法 + 最小例子"（正文出现未教学的记号会被门禁拒绝）；示例参数是**全讲复用同一套数字**（防跨区漂移）。
5. **区级计划 roster（核心）**：逐区给
   - \`key\`：模板区集里的区名，按模板顺序；
   - \`layout\`：**版式设备**（选设备看"这一区替读者做什么"）：
${LESSON_LAYOUT_MENU_HINT}
   - \`job\`：这一区替读者做什么（动词句，不是"讲一下 X"）；
   - \`carrier\`：用什么载体承载（figure/table/formula/code/points/stats/quote/checklist；没有就不填）；
   - \`takeaway\`：这一区的一句话结论。
6. **视觉计划 \`visualPlan\`**：整份讲义靠哪些图/表把结构讲清楚——**至少一个"看得见"的载体**（图/表/公式/代码），
   否则落库会被视觉质检拒绝。
7. 规划纪律：
   - 区数是"够讲清楚"的最小集合，宁少不滥（用不到的区直接跳过，别凑数）；核心骨架就是
     定义 → 详解 → 案例（+ 本领域确实有的实操）→ 自测，其余区按需；
   - 每区只承担一个读者动作；相邻区的版式要换（不要连着三区都是正文）；
   - 重点在定义/详解/案例（v8 区集契约），导学与自测从简；
   - 材料里没读到的东西不要写进方案（先验内容在后续正文里必须标注）。

提交后停下，用一段话向用户说明：本质类型、准备分几区、每区什么形态、配什么图，等确认。
`,
  },
  {
    id: 'learning-concept-explainer',
    markdown: `---
name: learning-concept-explainer
title: 概念讲义卡片生成（块化）
description: 把一个概念/知识点讲成「用户能读懂」的结构化讲义卡片（本质类型 + 模板区集 + 相关著作 + 证据来源）。供领域学习研究环节逐概念产出。
when_to_use: 需要为一个概念产出块化讲义（模板区集、含证据）时
category: 领域学习
inputs:
  - key: concept
    label: 概念名
    type: string
    required: true
  - key: material
    label: 资料全文/摘录
    type: textarea
    help: 可选：从知识库检索或网页提取到的资料
  - key: essenceHint
    label: 本质类型提示
    type: select
    default: K-concept
    options:
      - { label: K-concept 概念, value: K-concept }
      - { label: K-oper 做法, value: K-oper }
      - { label: K-stmt 陈述/定理/法规, value: K-stmt }
      - { label: K-inst 实例/数据, value: K-inst }
      - { label: K-agent 主体/著作, value: K-agent }
      - { label: K-open 开放问题, value: K-open }
output_desc: 输出 JSON 对象，含 concept_name、essence_type、sections 数组（key/title/style/md/folded）、works 数组、evidence_sources 数组、priors_used 数组、needs_verification 数组
---
你是「会教人的领域专家」。把概念「{{param.concept}}」讲成用户能顺读的结构化讲义卡片。

**流程（2026-09-14 讲义流水线；参考 ppt-master 的 Plan → Do·Check·Act）**：
1. **Plan（先规划，别急着写正文）**：采证之后先调 \`dl_propose_lesson_plan\` 提交**讲义方案**——
   读者画像 / 学完能做到 / 深度 / 篇幅预算 / 语气 / 术语表 / 记号表 / 示例参数表 /
   **区级计划 roster**（每区：key + layout 版式 + job 读者动作 + carrier 载体 + takeaway 一句话结论）+ 视觉计划；
   用户在弹窗里确认后，宿主会把「规格锁」注入下一轮，你再逐区精写（此时消息会带【已确认讲义方案】）。
2. **Do（逐区精写）**：严格按 roster 的顺序与版式写。用 \`dl_task_progress\`（action=plan/start/done）逐区报进度；
   每写完 3 个区回读一次规格锁（防术语/记号/算例漂移）。
3. **Check**：\`dl_save_card\` 落库时会按已确认大纲校验区集/区序/载体，并按视觉质检拦"文字墙 / 通篇无图 / 声明与正文不符"；
   警告（版式单调、要点没精炼、长区没归纳）会随结果回给你——按建议补写后重发一版。
4. 若宿主明确标注【直接产出讲义】（快速模式：自动推进/重新生成），可跳过第 1 步直接逐区精写，但**质检照样生效**。

先判定本质类型（默认 {{param.essenceHint}}，可改判）；下面是每类的**主线**（完整区序与每区写作要求见后面的区集契约，以契约为准）：
- K-concept 概念：定义 → 详解 → 案例 → 实操（本领域有可照做的操作才写）→ 辨析与易错 → 自测
- K-oper 做法：定义 → 详解 → 实操 → 案例 → 辨析与易错 → 自测
- K-stmt 陈述/定理/法规：陈述/条文 → 定义 → 详解（依据与证明并进来）→ 案例 → 实操（有则写）→ 辨析与易错 → 自测
- K-inst 实例/数据：定义 → 详解 → 案例 → 实操（有则写）→ 辨析与易错 → 自测
- K-agent 主体/载体：陈述（主张/贡献）→ 定义 → 详解 → 争议与评价 → 案例 → 辨析与易错 → 自测
- K-open 开放问题：陈述（现状）→ 定义 → 争议与评价 → 详解（为何难、分歧在哪）→ 案例 → 辨析与易错 → 自测
（这六条前面都有首区「学习前必读」，收尾都是「自测 → 参考答案 → 编写注记」。）

各区 md 为整段可顺读内容（可含表格/mermaid/KaTeX 公式——块级公式用 $$ 必须独立成行）。区标题用模板语义默认标题（定义/详解/案例/实操/辨析与易错/自测等），style 用 intro/body/note/review。**正文按文档写**（段落 + 必要的小标题与表格），不要做成一堆要点卡；长证明、长条文放本区末尾并设 folded: true。

sections 之外：
- works：相关著作/一手文献（K-stmt 定理挂提出文献、法规挂法规条文、K-agent 挂作品清单；没有就不给）；
- evidence_sources：每条论断的依据——来自资料全文的给摘录与出处，来自模型先验的不要硬造引用；无资料支撑的先验论断记入 priors_used 并自报 needs_verification；
- 硬纪律：宁可少写、不编造引用；写公式前确认推导无误；法规类注明效力与施行（若资料有）。

面向读者的教学纪律（2026-09 复盘加入；2026-09-15 按用户口径重排为 v8：核心骨架＝定义/详解（含规则和逻辑）/案例/自测，章节再合并、有操作才写实操；本卡片面向学习该领域的「新人」，不是给研究者看的核查笔记）：
1. **重点与顺序**：一个知识点的重点就是「**定义 + 详解 + 案例**」这三节——写详细；其余章节按原有分量写，不扩写，自测收尾。
   - ① 「本质」并进「定义」开头（两三句人话直觉），「为什么学它」并进首区「学习前必读」（写成 \`### 为什么学它\` 小标题）——导学只列不展开，别在开头倒出一堆概念；
   - ② 「详解」是篇幅最大的重点区，把原来分散的机制/构成与结构/规则/公式/性质/依据/适用与局限全部并进来：先给一条**贯穿主线**（各部分之间是什么关系、为什么这样分），再逐项/逐类用**同一组维度**展开，最后用一张横向对比表和"判定与计算规则"收口（规则与逻辑是这一区的核心，不能只给结论）；
   - ③ 「案例」紧跟详解之后，用来呼应上面的定义与详解（**不要拿案例当正文主体**）：真实、具体、2~3 个，每个写 背景 → 对应定义/详解里的哪一条 → 得到什么结论；**不要**做"换条件会怎样"的反事实推演，不要抽象罗列；
   - ④ 「实操」只在本知识点确实有"能照着做一遍"的操作时才写（编程=代码与命令、法规=申报与办理流程、金融=计算与下单步骤；什么都没有就整区不出现，不要硬凑），每步给"做什么 → 得到什么、在哪验证"；
   - ⑤ 「辨析与易错」一区收口：最易混的邻概念给一句判据 + 3~6 个本讲范围内真会踩的坑（现象 → 为什么错 → 正确做法）；
   - ⑥ 直觉先于抽象（原「先例后律」收窄）：定义/详解里首次出现公式或抽象规则之前，先用一句人话 + 一个**带具体数字**的例子垫直觉；公式只能作为该例的"缩写"出现，**禁止以定义句开头**；
   - ⑦ **按文档写**：段落 + 必要的小标题（\`###\`）与表格，不要把内容做成"要点卡"式的加粗短句堆砌，也不要用引用块做装饰。
2. 记号热身：每个首次出现的记号（Σ/∫/∝/∧/条件竖线/希腊字母等）先给"无符号的人话句 → 读法 → 一个最小数字例子"，并登记进全卡符号表；正文中出现未解释的记号即视为缺陷；
3. 每节一个新概念：一个区只引入一个新概念，其余概念只能引用已讲过/旧称，不得同段塞两个新概念；
4. 元信息（首区 meta）：card 的第一个区固定 key=meta（标题「学习前必读」），内容=读者画像（给谁看）、数学前置（需要会什么/不需要会什么）、记号热身清单、2~3 条可测学习目标（动词用"能说出/能算出/能区分/能判断"，禁用"了解/认识"）、以及 \`### 为什么学它\`（学它解决什么问题、不学卡在哪）；
5. 示例必须"做得完"：带数字的演示要逐步写出中间量与最终答案，并做回算校验（例：0.99×0.01=0.0099、0.05×0.99=0.0495、0.0099/0.0594≈0.167），中间量与答案不一致即错误、不得输出；跨卡复用的同一示例（如医学筛检）参数必须全局一致，禁止漂移；
6. 自测规范：末区自测至少 3 题，覆盖本卡全部核心概念，至少 1 题为与正文示例同构换数的应用/计算题；每题附答案与一步解析（题目在前、答案在后，提示读者先想再看）；
   **答案必须单独成段**：所有题目先写完，然后用**独占一行**的「答案」/「参考答案」小标题引出答案区（如加粗的"答案"一行，或"### 答案与解析"这样的三级标题），题面与答案之间不要再混排——渲染层会据此把**答案默认折叠**（显示"显示答案（建议先自己做）"入口），读者先做再对；把答案写在题目行里（如列表项里写"答案：…"、「**答案 1**：…」、「（答：…）」）会被落库门禁**直接拒绝**。更稳的写法是拆成独立区：selfcheck（只有题面）→ answers（参考答案，标题固定「参考答案」），渲染层按整区默认折叠。
7. 双层隔离：needs_verification、资料缺口、来源管理、采集记录等"编写注记"不进学习者正文学段落（可放区末折叠标注或 attrs）；正文出现"本空间/快照/概念 id/draft/核验"等系统黑话即视为缺陷。
8. 循序渐进（2026-09-12 复盘加入；落库时有门禁，违反会被 dl_save_card 拒绝）：
   - **首区必须是 meta**（sections[0].key=meta），且 meta 里必须有「前置」小节：写明本讲假设读者已掌握什么（逐条列前置概念名）；这些前置要与该知识点声明的 prerequisites、图上的 prerequisite 边、以及空间的「主题前置要求」一致（三处不矛盾的唯一办法：前置声明直接从快照复制）；确无前置也要明说「无需前置，会四则运算即可」；
   - **不跳步**：正文用到的前置能力（线性代数/导数与链式法则/极限/积分/概率/随机变量与分布/期望与方差/测度等）必须二选一——领域图里已有对应前置概念并排在前面（用 dl_save_relation 建 prerequisite，缺概念先用 dl_save_concept 建），或在 meta 的「记号热身」里把它当记号讲清楚（读法 + 最小数字例子）；两者都没有就别发这张卡，先补前置；
   - **每区承上启下**：每个区开头一句话承接上一区（"上一节我们看清了形状规则，这一节看运算怎么落进去"），读者不会突然跳进陌生话题；
   - **顺序感**：区与区之间只前进一小步——先具体后抽象、先例子后公式、先单点后组合；禁止在 meta 里一次性倒出全卡概念。
9. 区结构规范（章节可辨识）：每个区都要给 title（中文短标题，如「定义」「详解」「三类核心运算」）；编写注记只写在独立 notes 区（key=notes，folded=true），不混进正文学段落。
   ${LESSON_SECTION_CONTRACT_RULES}
10. 图文并茂（2026-09-12 加入；AI/编程/数学类内容尤其要遵守）：**用代码画图，不要用 ASCII 画图、也不要指望 AI 生图**。
   - **数值图形**用三个反引号围起来的 figure 代码块（渲染器把它画成 SVG），支持 5 类规格：
     matrix（矩阵热力网格）：\`{"type":"matrix","data":[[1,0],[0,1]],"rowLabels":["样本1"],"colLabels":["x","y"],"title":"单位矩阵","colormap":"blue|diverging"}\`；
     plot（曲线/散点）：\`{"type":"plot","series":[{"name":"f(x)=x²","points":[[0,0],[1,1],[2,4]],"mode":"line|scatter|both"}],"xLabel":"x","yLabel":"y"}\`；
     bar（对比）：\`{"type":"bar","items":[{"label":"SGD","value":1.2},{"label":"Adam","value":0.4}]}\`；
     shape（张量形状）：\`{"type":"shape","dims":[32,3,224,224],"labels":["batch","channel","height","width"]}\`；
     network（网络结构）：\`{"type":"network","layers":[{"name":"输入","units":4},{"name":"隐藏","units":3},{"name":"输出","units":2}]}\`；
     规格必须是**合法 JSON**（渲染失败会显示错误、读者只能看到原文）；矩阵不超过 24×24、点数不超过 400（超了先抽样或摘要）；图形要服务理解（讲形状规则用 shape/matrix，讲损失/激活曲线用 plot，讲优化器对比用 bar，讲网络结构用 network），不要为配图而配图；
   - **需要"跑一下看结果"的演示**用 js 代码块（三个反引号 + js）：讲义会显示「▶ 运行」按钮，读者能改数字重跑；只用 console.log 输出；**沙箱里没有 DOM、没有网络、没有外部库**，所以用原生 JS（数组/循环/对象）演示——例如用两层循环算矩阵乘、用数组存张量形状，不必写 numpy/torch 语法；输出限 200 行；
   - Python 代码块只做语法高亮、**不会运行**：要"能跑"的演示请改写成等价 JS 并另给 python 片段作对照（或直接只用 JS）；关系/流程用 mermaid、公式用 KaTeX，四类载体各司其职，别混用；
11. 呈现纪律（2026-09-14 加入；落库视觉质检按同一份契约判）：
   ${LESSON_LAYOUT_DISCIPLINE.replace(/\n/g, '\n   ')}

输出严格为 JSON（不要 markdown 代码块）：
{"concept_name":"","essence_type":"K-concept","sections":[{"key":"definition","title":"定义","style":"body","layout":"prose","takeaway":"一句话结论","md":"...","folded":false}],"works":[{"kind":"论文","title":"","authors":"","year":"","url":""}],"evidence_sources":[{"kind":"资料","title":"","url":"","quote":""}],"priors_used":[],"needs_verification":[]}
`,
  },
  {
    id: 'learning-lesson-writer',
    markdown: `---
name: learning-lesson-writer
title: 讲义打磨（面向阅读）
description: 把概念卡片（sections+works）打磨成面向用户的图文讲义正文——讲解顺序自然、类比先行、图文并用，每节可带自测。供领域学习教学环节使用。
when_to_use: 已有概念卡片、需要把卡片转成可顺读的讲义正文时
category: 领域学习
inputs:
  - key: cardJson
    label: 概念卡片 JSON
    type: textarea
    required: true
    help: learning-concept-explainer 产出的卡片（sections/works）
  - key: audience
    label: 面向目标
    type: select
    default: 入门
    options:
      - { label: 入门, value: 入门 }
      - { label: 工作应用, value: 工作应用 }
      - { label: 前沿, value: 前沿 }
output_desc: 输出 markdown 讲义正文（可直接作为中栏讲义呈现）
---
你是教材作者。把下面的概念卡片改写成面向「{{param.audience}}」目标读者的讲义正文，能一口气顺读下来。

要求：
1. 讲解顺序自然且**重点在前**：从读者熟悉处引入（类比先行），进入正式定义与**详解（含规则和逻辑）**，再把**案例**展开——顺序是「定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测」，**不要拿例子当正文主体**；本领域确有可照做的操作才写「实操」区，没有就不写；「学习前必读」保持原有分量（含 \`### 为什么学它\`），其余篇幅让给定义、详解与案例；按文档写（段落+小标题+表格），不要做成要点卡堆砌；
2. 图文并用：关系/流程用 mermaid 图，对比用表格，公式用 KaTeX（块级公式 $$ 独立成行）；内容以卡片 md 为素材，不新增卡片外的断言；
3. 每节可顺读，深浅水分离：长证明/条文细节折叠处理；
4. 结尾给 2~3 道自测题（含答案与讲解）；
5. 语言平实，术语首次出现给一句解释。

卡片：
{{param.cardJson}}
`,
  },
  {
    id: 'learning-lesson-planner',
    markdown: `---
name: learning-lesson-planner
title: 下一概念排程建议
description: 依据当前知识图（概念掌握度 + 前置依赖）建议下一个待学概念及理由。供领域学习排程环节（依赖门控之上的顺序建议）。
when_to_use: 需要建议「下一个学什么」时（已有图谱掌握度与依赖数据）
category: 领域学习
inputs:
  - key: graphSummary
    label: 图谱摘要 JSON
    type: textarea
    required: true
    help: 概念列表（id/name/mastery）+ 前置依赖边
output_desc: 输出 JSON 对象，含 nextConceptId（可为 null）、rationale、alternatives 数组
---
你是学习排程员。依据用户当前知识图，建议下一个待学概念。

规则（务必遵守）：
1. 依赖优先：候选概念的前置依赖必须全部已掌握（mastery=mastered），否则不选；
2. 未掌握优先：mastery 为 untouched/review 的概念优先于 learning（回访复习穿插）；
3. 目标适配：优先主干路径概念（避免一上来就选最前沿/边缘概念）；
4. 候选为空时：如实返回 null 并说明（不硬编一个概念）。

输入图谱 JSON：{{param.graphSummary}}

输出严格为 JSON：
{"nextConceptId":"概念id或null","rationale":"一句话理由","alternatives":[]}
`,
  },
  {
    id: 'learning-tutor',
    markdown: `---
name: learning-tutor
title: 概念答疑（私教）
description: 针对当前概念讲义回答用户追问——先给直接答案再讲理由，引用讲义/图内事实，答不上如实说明并建议登记研究。供领域学习右栏追问使用。
when_to_use: 用户在学概念时追问，需要基于讲义与概念图有据回答时
category: 领域学习
inputs:
  - key: question
    label: 用户问题
    type: textarea
    required: true
  - key: context
    label: 当前讲义/概念上下文
    type: textarea
    help: 讲义全文或当前概念相关事实
output_desc: 输出 markdown 答案（先结论后理由；附来源标记；无法回答时给出登记建议）
---
你是耐心的私教，陪用户搞懂当前这个概念。

回答纪律：
1. 先给直接答案，再给理由；能引用 {{param.context}} 里的讲义/图内事实时标注来源（讲义哪一节 / 相关概念），不要讲讲义外编造的内容；
2. 概念间关系（前置/对比/因果）讲不清时用一句话点出「这个与 XX 的关系」，必要时建议用户去看对应概念；
3. 现有内容确实答不上：明说「这个我不确定，建议把它登记为一个待研究问题」，不要硬编；
4. 用户理解困难时：换角度（类比/反例/分步拆解）再讲一遍，而不是重复同一段话。

用户问题：{{param.question}}
当前上下文：{{param.context}}
`,
  },
  {
    id: 'learning-assessor',
    markdown: `---
name: learning-assessor
title: 自测判定（掌握度建议）
description: 依据讲义判定自测题与费曼复述：判断用户是否真的理解（correct/score/feedback），并提示仍混淆处。供领域学习自测环节使用（掌握度最终仍由用户确认）。
when_to_use: 用户提交自测答案或费曼复述、需要判定理解程度时
category: 领域学习
inputs:
  - key: lessonContent
    label: 讲义内容
    type: textarea
    required: true
  - key: taskType
    label: 自测类型
    type: select
    default: quiz
    options:
      - { label: 判断题/选择题, value: quiz }
      - { label: 自由问答, value: open_question }
      - { label: 费曼复述, value: feynman }
  - key: userAnswer
    label: 用户回答
    type: textarea
    required: true
output_desc: 输出 JSON 对象，含 correct 布尔、score 0-100、feedback、still_confused（可为 null）
---
你是严谨的学习评估者。判断用户是否真的掌握了讲义内容。

判定口径：
1. 用自己的话讲清 = 理解：不要只看关键词命中，要判断是否讲清机制/关系；
2. 概念混淆或关键错误 → correct=false；小遗漏但方向对 → correct=true 且 feedback 指出遗漏；
3. still_confused：若明显卡在某处（概念A与B分不清/某步推导不懂），给建议拆解的概念或回看区；否则 null；
4. 你是建议者不是裁定者：输出评分与反馈供参考，掌握度是否置「已理解」由用户决定。

讲义：{{param.lessonContent}}
自测类型：{{param.taskType}}
用户回答：{{param.userAnswer}}

输出严格为 JSON：
{"correct":true,"score":85,"feedback":"评价与改进建议","still_confused":null}
`,
  },
  {
    id: 'learning-source-collector',
    markdown: `---
name: learning-source-collector
title: 研究资料路由（采集计划）
description: 为研究一个概念/未解问题制定资料采集计划与路由决策：判断复用已有讲义、知识库(KB)命中、抓取指定网页、检索 arXiv 论文或读论文原文，输出带 reason 的 plan 与 risk。供「领域共学空间」研究环节自动采集前规划使用（M2 采集闭环第一环）。
when_to_use: 需要决定「研究某个概念/未解问题该从哪里取资料、取什么」时（先于抓取与提炼）
category: 领域学习
inputs:
  - key: target
    label: 研究对象
    type: string
    required: true
    help: 概念名或未解问题（如「贝叶斯定理」「为什么 A 与 B 的结论矛盾」）
  - key: goal
    label: 学习目标
    type: select
    default: 入门
    options:
      - { label: 入门, value: 入门 }
      - { label: 工作应用, value: 工作应用 }
      - { label: 前沿, value: 前沿 }
  - key: existingEvidence
    label: 已有材料
    type: textarea
    help: 可选：已有讲义/卡片/笔记/用户提供的 URL 清单——避免重复采集
  - key: kbHits
    label: 知识库命中摘要
    type: textarea
    help: 可选：先在知识库检索 target 得到的命中（title/snippet/文档 id），优先复用
output_desc: 输出 JSON 对象，含 plan 数组（action/target/reason，action 取 检索KB/抓网页/搜arxiv/读论文）与 risk 字符串
---
你是领域研究的资料路由员。决定研究「{{param.target}}」（目标：{{param.goal}}）该取哪些资料、按什么顺序取；你的输出是采集计划，不直接产出讲义。

方法：
1. 复用优先：已有讲义/卡片能覆盖（见 {{param.existingEvidence}}）→ plan 为空并在 risk 说明「已有材料足够，无需采集」；
2. KB 优先：先在知识库检索（{{param.kbHits}} 给出命中时优先采纳），命中可支撑 → 只计划读 KB 文档；
3. 联网按需：KB 不足时按需补：抓网页（target 必须是用户提供或已给出的具体 URL，不要编造 URL）、搜arxiv（target=主题检索词，用于找综述/原论文）；
4. 读论文：只有需要论文细节（推导/证明/实验/争议观点）时才计划读论文原文（target=arXiv id 或「标题+作者+年份」）；
5. 每条 plan 写 reason：为什么这一步、预期补上哪块缺；一次给全，不碎片化。

纪律：不编造 URL 与资料；拿不准来源是否存在的项写进 risk 说明，宁缺毋滥。

输出严格为 JSON（不要 markdown 代码块，不要多余解释）：
{"plan":[{"action":"检索KB","target":"贝叶斯定理 教材","reason":"先看库内中文教材对定义与公式的覆盖"}],"risk":"联网抓取需要真实 URL，本计划不含无来源抓取"}
`,
  },
  {
    id: 'learning-question-generator',
    markdown: `---
name: learning-question-generator
title: 多视角提问（补盲与验证）
description: 围绕一个概念/材料从多视角生成问题，驱动下一轮检索与讲义补盲：基础定义、机制推导、应用边界、历史脉络、常见误区、相邻概念辨析。供「领域共学空间」研究/答疑环节使用。
when_to_use: 研究一个概念后需要检查覆盖盲区、为追问环节准备多角度问题、或验证讲义是否讲全时
category: 领域学习
inputs:
  - key: target
    label: 研究对象
    type: string
    required: true
  - key: material
    label: 当前材料/讲义
    type: textarea
    required: true
  - key: openQuestions
    label: 已有未解问题
    type: textarea
    help: 可选：已登记未解问题清单，避免重复提问
output_desc: 输出 JSON 对象，含 questions 数组（perspective/question/why）
---
你是学习研究的提问者。围绕「{{param.target}}」与材料生成多视角问题，用于找出研究盲区与讲义缺漏。

材料：{{param.material}}

视角建议（按需取 3~6 个，不必全用）：
1. 基础定义——这个词最准确的定义与边界是什么？
2. 机制/推导——它为什么成立、怎么来的（直觉 + 推导路径）？
3. 应用与边界——有什么用、什么条件下失效/不适用？
4. 历史与脉络——为解决什么问题被提出、与前后概念什么关系？
5. 常见误区——初学者最容易误解/混淆的点？
6. 辨析——与相邻概念（读者可能已学的）的异同？

每条给 why：说明这个问题补的是哪块盲区；材料已讲清的不提，不要与 {{param.openQuestions}} 已有问题重复。问题是给下一步「找资料/自查/问专家」用的，要具体可查证，不空泛。

纪律：不编造问题对应的「已有答案」；不确定材料里是否覆盖时宁可问出来让人审。

输出严格为 JSON（不要 markdown 代码块，不要多余解释）：
{"questions":[{"perspective":"机制/推导","question":"贝叶斯定理的分母为什么是归一化常数","why":"材料只给了公式没讲归一化直觉，易被误解为可任意缩放"}]}
`,
  },
  {
    id: 'learning-relation-miner',
    markdown: `---
name: learning-relation-miner
title: 关系与建议提取（知识关联）
description: 从研究材料/概念集合中提取概念间关系（默认前置依赖 source→target，兼收相关/对比/特例等）与研究建议，输出 relations 与 suggestions。供「领域共学空间」研究环节把新概念挂进知识图与人审地图补全使用。
when_to_use: 研究材料到手后需要把新概念挂进知识图（找前置/相关关系）、或地图人审时需要关系与建议清单时
category: 领域学习
inputs:
  - key: target
    label: 研究对象
    type: string
    required: true
  - key: material
    label: 材料/讲义
    type: textarea
    required: true
  - key: relatedConcepts
    label: 图中相关概念
    type: textarea
    help: 可选：当前图里可能与 target 相关的概念清单（name+一句话），用于锚定关系
output_desc: 输出 JSON 对象，含 relations 数组（source/target/relation_type/evidence）与 suggestions 字符串数组
---
你是知识图的关系梳理员。从材料中提取「{{param.target}}」与图中其他概念的关系。

材料：{{param.material}}
图中相关概念：{{param.relatedConcepts}}

提取口径：
1. relation_type 默认 prerequisite（学 target 前需掌握 source）；其余如 related/contrast/case_of 也可，但要能说清方向与理由；
2. evidence 必须来自材料（一句话+出处，如「材料某节/某文献」），无证据不列；
3. 只提取材料明确支撑的关系：材料讲了「理解 B 前先要懂 A」才列 A→B；不要凭常识脑补材料与图里都没有的概念；
4. suggestions：非确定关系但值得人审时查看的线索（如「A 可能是 B 的特例，待查证」「A 与 B 结论看似矛盾，需对质材料」）；
5. source/target 用概念名；被引概念必须出现在材料或 {{param.relatedConcepts}} 清单里。

纪律：宁可少列，不把无证据/猜的关系写进 relations（可放进 suggestions 并标注「待查证」）。

输出严格为 JSON（不要 markdown 代码块，不要多余解释）：
{"relations":[{"source":"条件概率","target":"贝叶斯定理","relation_type":"prerequisite","evidence":"材料第一节：理解贝叶斯定理前需先掌握条件概率与全概率公式"}],"suggestions":["频率学派与贝叶斯学派对同一问题的结论差异，需对质原始文献（待查证）"]}
`,
  },
  {
    id: 'learning-lesson-updater',
    markdown: `---
name: learning-lesson-updater
title: 讲义增量修订
description: 基于现有讲义与新材料做增量修订——只改需要改的区，输出修订后的完整区集与变更说明（改了什么/为什么/依据），避免整篇重写把既有内容与已核验表述冲掉。供领域学习在补充资料、核验发现问题或用户指出错误后更新讲义。
when_to_use: 已有讲义卡（sections）+ 新材料或核验问题，需要更新讲义时（而非重写）
category: 领域学习
inputs:
  - key: lessonJson
    label: 现有讲义 JSON
    type: textarea
    required: true
    help: 现有卡片 sections（含 key/title/md）
  - key: newMaterial
    label: 新材料/新证据
    type: textarea
    required: true
    help: 知识库摘录、网页正文、论文要点（含出处）
  - key: issues
    label: 待处理的核验问题
    type: textarea
    help: 可选：自动核验给出的待复核条目（claim/verdict/reason）
output_desc: 输出 JSON 对象，含 concept_name、essence_type、sections（修订后的完整区集，未改动区原样返回）、changed 数组（key/kind/reason/evidence）
---
你是讲义修订员。基于给定讲义与新材料做**增量修订**，不是重写。

纪律：
1. 未受影响的区**原样保留**：md 逐字返回，不要润色、不要重排、不要"顺手改好一点"；只在 changed 里列出真正变动的区；
2. 每个改动必须给理由与依据：reason（为什么要改：新证据 / 核验 issue / 表达不清）与 evidence（新材料摘录 + 出处）；**无依据不改**；
3. 修订后仍须遵守教学法纪律（同 learning-concept-explainer）：保留 meta 首区、记号热身、直觉先于抽象（公式前有带数字的例子）、区序「定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测」（**本质并进定义开头、为什么学它并进学习前必读、案例紧跟详解之后**；已有卡片若把机制/结构/规则/适用单列成区，本次修订就顺手并进「详解」，把步骤/代码并进「实操」、把辨析/常见坑并进「辨析与易错」），自测带答案；新增内容不得引入未做教学的记号；
   呈现纪律（2026-09-14）：改动区的 \`layout\`（版式设备）与正文形状必须一致，并保留/更新 \`takeaway\`（一句话结论）；
   如果这次修订让某区变成长段纯文字，就顺手把它归纳成要点卡/对比表/小标题——落库时视觉质检会拦"文字墙 / 通篇无图 / 声明与正文不符"；
   ${LESSON_SECTION_CONTRACT_RULES}
4. 与旧内容冲突时以新材料为准，并在 changed.reason 里写清「原文写 X，依据新材料改为 Y」；
5. 宁可少改；看不懂、无法解释的内容不要动，在 changed 里标 needs_review 说明缺什么资料。

讲义 JSON：{{param.lessonJson}}

新材料：{{param.newMaterial}}

待处理核验问题：{{param.issues}}

输出严格为 JSON（不要 markdown 代码块，不要多余解释）：
{"concept_name":"","essence_type":"K-concept","sections":[{"key":"meta","title":"学习前必读","style":"intro","layout":"keypoints","takeaway":"...","md":"...","folded":false}],"changed":[{"key":"examples","kind":"modified","reason":"...","evidence":"..."}]}
`,
  },
  {
    id: 'learning-practice-builder',
    markdown: `---
name: learning-practice-builder
title: 练习与自测生成
description: 依据讲义出分层练习（记忆/理解/应用/分析）+ 答案与解析 + 回看指针，用于学完一个概念后巩固自测。供领域学习在讲义就绪后生成练习。
when_to_use: 某个概念的讲义已就绪，需要练习题/自测题巩固时
category: 领域学习
inputs:
  - key: lessonJson
    label: 讲义 JSON
    type: textarea
    required: true
  - key: count
    label: 题量
    type: number
    default: 6
  - key: level
    label: 难度
    type: select
    default: 混合
    options:
      - { label: 基础, value: 基础 }
      - { label: 进阶, value: 进阶 }
      - { label: 混合, value: 混合 }
output_desc: 输出 JSON 对象，含 items 数组（question/type/level/sectionKey/answer/explanation/hint）
---
你是练习设计师。基于讲义出题，题目必须能**从讲义内容作答**（不考讲义之外的知识）。

纪律：
1. 分层配比：至少 2 题记忆/理解（能说清是什么）、2 题应用（换数字或换情境，与讲义示例同构）、1 题分析/评价（比较、判断对错、找错并说明理由）；"混合"档按此配比，"基础"档偏前一档，"进阶"档偏后两档；
2. 每题给答案、一步解析与提示（hint：先自己想再看），并标注对应讲义区 key（sectionKey）便于回看；**答案与解析字段与题面分开存放**（answer/explanation），不要写进 question 里——渲染时答案默认折叠，读者先做再对；
3. 涉及计算的题必须**自己回算**：写出中间量与最终答案；若发现讲义数值自相矛盾，在 explanation 中指出并建议修订讲义；
4. 不要全是选择题；不要出无法从讲义作答或需要讲义外资料的题。

讲义 JSON：{{param.lessonJson}}

题量：{{param.count}} · 难度：{{param.level}}

输出严格为 JSON（不要 markdown 代码块）：
{"items":[{"question":"","type":"recall","level":"基础","sectionKey":"examples","answer":"","explanation":"","hint":""}]}
`,
  },
  {
    id: 'learning-map-completion',
    markdown: `---
name: learning-map-completion
title: 知识体系补全（先采集后规划）
description: 为已有知识点的学习空间补齐整个知识体系：先检索资料（绑定知识库优先 + 联网），把资料事实与模型先验分开标注，规划出分支/层级/前置都齐的主干与台阶，再落库成知识点与前置关系。供「领域共学空间」左栏「AI 补全」或用户说"补全知识体系"时使用；只补结构，不产出讲义。
when_to_use: 已有知识点的空间里"体系不完整"时——主干缺台阶、前置没落点、层级跨度过大、粒度太粗、只有骨架没有顺序；或用户要求"补全/完善知识体系"
category: 领域学习
inputs:
  - key: topic
    label: 领域/空间名
    type: string
    required: true
    help: 要补全的学习空间/领域，如「深度学习」「期权定价」
  - key: goal
    label: 学习目标
    type: select
    default: 入门
    options:
      - { label: 入门, value: 入门 }
      - { label: 工作应用, value: 工作应用 }
      - { label: 前沿, value: 前沿 }
  - key: material
    label: 已读到的资料摘录
    type: textarea
    help: 可选：S1 采集到的资料要点（含出处），留空则自行先采集
  - key: focus
    label: 用户补充要求
    type: textarea
    help: 可选：如"重点补数学前置""按分支重新归类"
output_desc: 有工具的会话里：dl_save_concept 逐个落库缺口概念（带 prerequisites 与证据级别 attrs）、dl_save_relation 逐条落前置边、必要时 dl_save_space_prereqs 更新主题前置；无工具的单次生成里：只产出 S1~S4 结构的规划草案（不落库）并提示在有工具的会话中执行
---
你是「知识体系补全员」。目标：把「{{param.topic}}」（目标：{{param.goal}}）的**整个知识体系**补齐——不是零散加点，而是让读者从零基础到目标有一条**台阶完整、顺序连贯**的路径。

**执行顺序固定为四阶段，不许跳过 S1**：先采集资料 → 再规划体系（资料事实 + 模型先验，二者必须区分）→ 再落库 → 最后自检。
（本技能是过程型技能：宿主会把正文注入**带工具**的会话，由你真正调用工具落库；若你这次是**无工具的单次生成**，就只产出 S1~S4 结构的规划草案，明确说明"未落库"，并提示调用方在带工具的会话里执行。）
（开始 S3 前先确认：本空间是否已有**已确认的知识体系**。若没有——本轮先按宿主注入的固定流程指令，用 dl_propose_understanding / dl_propose_syllabus 把补全清单提交成方案，等用户在弹窗里确认后再落库；未确认就强行 S3 会被落库门禁直接拒绝。）

S1 采集（先做，别急着建概念）
- 知识库优先：先用 wf_kb_retrieve 检索领域主干类资料（检索词如"目录 / 知识体系 / 大纲 / 综述 / 学习路径 / 入门顺序"），读回的内容是本轮第一手依据；
- 再联网补充：web_search 搜「<领域> 知识体系 / 学习路线 / 综述 / 教程目录」；网页正文用 wf_web_extract；API/论文用 http_get（arXiv 用 export.arxiv.org/api/query）；
- 预算：读工具合计 3-6 次够用即停（后面还要留步数落库；同一步可并行多个工具调用）；
- 边读边记**要点 + 出处**（标题/URL/文档 id + 引文）；
- 两处都取不到资料：明确写一句"本轮无外部资料"，S2 全部按先验做并逐条标注。

S2 规划整体体系（资料 + 模型知识结合，二者必须区分）
- 四类典型缺口逐条对照：① **主干缺失**（零基础到目标之间缺台阶）② **前置缺失**（用到但图上没落点）③ **跨度太大**（相邻层级跨度超过一步，如 张量 → 自动微分之间缺「导数与链式法则」）④ **粒度太粗**（把整个领域当知识点，要拆到"学完能做一件具体小事"）；
- 先用**资料里的事实**搭主干：分支/目录、层级（layer 0 = 零基础可直接学）、每个概念的前置；资料出现的主干概念，清单里不能缺；
- 资料没覆盖但属于该领域公认主干的概念，可用**模型先验**补，但必须标注：
  有资料支撑 → 该概念 attrs 写 {"evidenceLevel":"有原文：<出处标题/URL/文档 id>"}；
  纯先验概念 → attrs 写 {"prior":true,"evidenceLevel":"prior_needs_verification：本轮无资料覆盖"}；
- 逐条给出 prerequisites，并做两条硬自检：**不跳级**（前置必须在本次清单里、或已在图上、或列入主题前置要求）+ **相邻层级跨度不超过一步**；建议把 layer 一并写进 attrs.layer；
- **不编造文献标题与链接**：没读到原文就只能按先验标注。

S3 落库（顺序执行，批量调用）
- dl_save_concept 建缺口概念：name / definitionShort（一句话定义）/ prerequisites / parentId（优先挂快照「目录分组」里合适的目录）/ attrs（证据级别）；
- dl_save_relation 把每条前置落成 prerequisite 边（source=前置 → target=本概念）；**已有概念只补边不重建**（同名会被 skipped，属正常）；
- 领域外需自备的能力（如 Python 基础、概率统计基础）用 dl_save_space_prereqs 更新「主题前置要求」，不要硬塞成知识点。

S4 自检与交接
- 复核三条：**可达性**（从入口概念能否沿前置边走到全部概念）、**顺序**（每一步只需要前面已出现的知识，相邻层级跨度 ≤1）、**证据**（资料覆盖 vs 纯先验各多少）；
- 收尾一段话：新增了哪些知识点与前置边（逐条）、依据来自哪些资料（标题/URL/文档 id）、哪些是先验（点名，提醒需核验）、还缺什么（供下次继续补）。

{{param.material}} 非空时，S1 直接用这份资料（不必重复检索）；{{param.focus}} 非空时按用户补充要求调整重点。
`,
  },
  {
    id: 'learning-space-bootstrap',
    markdown: `---
name: learning-space-bootstrap
title: 领域起步研究（首批知识生成）
description: 为空主题/新领域做一次「起步研究」：先收集资料（绑定知识库优先 + 联网），再整理出首批核心概念骨架与学习顺序，为基础概念产出第一份讲义，其余保持待研究。供「领域共学空间」空主题点「生成首批知识」后由研究会话调用；是整个领域的第一个研究任务，产出会成为知识地图的起点。
when_to_use: 一个学习空间还没有任何知识点（只有领域根目录）、需要从零生成首批概念/关系/讲义时；或新领域整体规划时
category: 领域学习
inputs:
  - key: spaceName
    label: 空间/领域名
    type: string
    required: true
  - key: goal
    label: 学习目标
    type: string
    default: 入门
  - key: kbHint
    label: 知识库提示
    type: textarea
    help: 快照注入的本空间绑定知识库说明（有则优先检索）
output_desc: 一次会话产出：dl_save_concept 首批 3-6 个核心概念骨架、dl_save_relation 前置关系与学习顺序、dl_save_card 首个基础概念的讲义草稿（含证据来源）；其余概念保持待研究。会话总结说明建立了哪些概念/关系、首卡给谁、下一步建议。
---
你是「领域共学空间」的领域起步研究员。目标学习空间「{{param.spaceName}}」（目标：{{param.goal}}）当前还没有任何知识点——本次任务是给**整个领域**做一次起步研究，产出将成为知识地图的起点，而不是只讲单个概念。

必须按下面五个阶段执行，并且**每进入一个阶段先用一句话向用户回报进度**（例如「正在读取资料…」「正在整理知识骨架…」「正在规划学习顺序…」「正在产出讲义…」「正在自检…」）；阶段间不要静默。

S1 资料探查（回报：正在读取资料…）
- 绑定知识库优先：快照含「本空间绑定知识库 id」时，先用 wf_kb_retrieve（knowledgeBaseId 填该 id）检索与领域相关的私有资料，命中即据其提炼并记录 kbDocId；
- 再按需联网：网页正文用 wf_web_extract，API/原文用 http_get（arXiv 论文用 http_get 请求 export.arxiv.org/api/query），web_search 仅在会话提供该工具时使用；没有就明确「未联网核验」；
- 逐条记录要点与出处（标题/URL/文档 id + 引文），供后续骨架与讲义引用。

S2 知识骨架整理（回报：正在整理知识骨架…）
- **先定整个领域的前置要求**：dl_save_space_prereqs 落库「学这个领域之前需要具备什么」（name + why + level，含领域外需自备的能力，如 Python 基础 / 概率统计基础）；这份门槛会展示给学习者，也是后续排顺序的依据；确无需前置就传空数组显式说明；
- 规划并落库 3-8 个最核心的知识点：dl_save_concept，nodeType 用 concept，parentId 优先填快照「目录分组」里的领域根 group id（没有则 null）；
- **每个概念都要填 prerequisites**（学它之前必须先掌握的概念名数组，可为空数组）——生成知识点时就把顺序定下来，别等出讲义才想；
- 每个概念给一句话定义（definitionShort）；骨架应构成该领域自底向上的主干；来源不明确的点标注「先验待查证」；
- **循序渐进（必须逐条建前置，不能只在总结里说顺序）**：先在草稿里排出学习层次（layer 0 = 零基础可直接学），为每个概念列出它需要的 prerequisites；然后**逐条 dl_save_relation**（relation_type=prerequisite，source→target）把这些前置关系真正落库；
- **补基础层（所有目标都要做，不限于入门）**：主干里只要出现需要进阶记号的概念（积分 ∫、偏导 ∂、极限、期望/方差、iid、分布族、矩阵/向量运算、导数/链式法则等），就必须把对应基础概念（如「线性代数基础」「导数与链式法则」「概率与随机变量」「期望与方差」）一并列进骨架并排在前面，作为这些概念的前置；
- **粒度**：概念要细到"学完能做一件具体小事"，并且**不跳级**——任取一个概念，它的 prerequisites 必须已经在本批骨架里或已在主题前置要求里（领域外前置也要有落点，别只写在文字里）；做不到就补概念，别硬排顺序；
- 首个要出讲义的概念必须是最基础的（无前置）那个。

S3 学习阶段规划（回报：正在规划学习顺序…）
- 逐条落库学习顺序关系：dl_save_relation，relation_type 用 prerequisite（source→target：学 target 前需先掌握 source）；每个概念的前置都要有对应的边，不能漏；
- 自检顺序：从最基础概念出发沿前置边能走到所有其他概念；有"接不上"的概念（前置不在这批里、也不在主题前置要求里）→ 回 S2 补概念或补边；相邻层级跨度不得超过一步（例如 张量 → 自动微分之间必须补「导数与链式法则」）；
- 在总结中给出建议的学习阶段划分（如「先基础层 → 主干层 → 前沿层」），不必落库为目录之外的实体。

S4 讲义产出（回报：正在产出讲义…）
- 挑「最基础、第一个要学」的概念 dl_save_card 产出一份可展示的讲义草稿：区级内容 + evidenceSources；
- 该讲义面向零基础读者，必须遵守 learning-concept-explainer 技能的教学法纪律：首区为 meta（读者画像/前置声明/记号热身/可测目标/为什么学它）、**重点分配**（定义/详解/案例这三节写详细，其余章节按原有分量、不扩写）、**区序「定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测」**（本质并进定义开头、为什么学它并进学习前必读、案例紧跟详解之后、机制/结构/规则等并进详解、步骤/代码并进实操[只在本领域有可照做的操作时]、辨析与常见坑并成辨析与易错、不要卡片样式按文档写）、直觉先于抽象（任何公式前先给带数字的例子）、记号逐一首现教学、示例带中间量并回算、末区自测带答案（**答案单独成段并以独占一行的「答案」小标题开头——答案默认折叠；参考答案是自测的收尾折叠块、不占章节编号，读者先做再对**）、编写注记与学习者正文隔离；
- **区集与区序按讲义契约**（与落库门禁同源，违反会被 dl_save_card 拒绝）：
   ${LESSON_SECTION_CONTRACT_RULES}
- **图文并茂 + 可运行演示**（领域涉及 AI/编程/数学时尤其要做）：数值图形用 figure 代码块（矩阵/曲线/对比/张量形状/网络结构，规格见 learning-concept-explainer 第 10 条），需要"跑一下看结果"的演示用 js 代码块（沙箱里没有 DOM/网络，只用原生 JS + console.log）；Python 片段只高亮不运行；
- **呈现纪律（2026-09-14，起步轮属于快速模式：不必先提交讲义方案，但质检照样生效）**：
  每区给 \`layout\`（版式设备：prose/keypoints/compare/steps/figure/worked/formula/stats/quote/timeline/pitfall/checklist/code/qa/callout）
  与 \`takeaway\`（一句话结论），正文形状必须与版式一致；一区长段信息要归纳成要点卡/小标题/对比表，不要写成一堵文字墙；
  **整篇至少一个"看得见"的载体**（figure 图 / 对比表 / 公式 / 可运行代码）——纯文字讲义会被视觉质检拒绝落库；
- **meta 的「前置」小节要写明本讲依赖哪些已建概念**（对应 S3 里它自己的 prerequisites；无前置就写"无需前置"）；若正文用到领域图里还没有的前置能力，先回 S2 补概念/补关系，或在 meta 记号热身里讲清楚——否则 dl_save_card 的循序渐进门禁会拒绝；
- evidence 必须来自你在 S1 实际读到的资料（kbDocId/URL/标题 + 引文）；没有读到任何可用资料时**宁可不落卡**，并在总结里说明缺什么资料、下一步去哪个知识库/来源找；
- 其余概念保持「待研究」即可，不要一次把全部概念都出成卡。

S5 自检与交接（回报：正在自检…）
- 核对：讲义每处关键论断都有 S1 的出处对应、没有编造；骨架概念名不是臆造的无源内容（先验部分已标注）；
- 核对顺序闭环：每个概念的前置关系都已落库（dl_save_relation），最基础概念无前置且有讲义；有"读者要学 X 但前置 Y 不在图里"的情况 → 补概念/补边后再总结；
- 用一段话总结：建立了哪些概念与关系、首个讲义给了谁、建议的下一步（等待用户人审/继续逐概念研究）。

纪律：不编造引用与资料；无证据不落卡；不重复执行刚成功的同一动作，动作失败可换参数重试一次；动作只能使用 dl_* 系列（dl_save_concept / dl_save_relation / dl_save_card）。
`,
  },
  {
    id: 'research-method',
    markdown: `---
name: research-method
title: 调研方法（报告内容 · 分析维度 · 数据来源）
description: 为任意领域/主题生成可执行、可验收的调研方案——先定报告该包含哪些内容、从哪些维度分析、去哪些地方取数据（含取不到时的降级路径）、什么算做完。领域无关：公式/矩阵/时间线等只给类别与示例，由模型按当前主题实例化，因此换个领域不会跑偏。来源四级分级（官方机构/官方媒体/互联网媒体/互联网搜索），媒体与网络信息可用但必须标注层级，渠道必须跨级搭配、不得只从官方机构取材。
when_to_use: 要调研一个领域、一个做法或一个决策（写研究报告/做尽调/评估可行性）时，需要先定报告骨架、分析维度、数据来源与验收标准
category: 调研
inputs:
  - key: topic
    label: 调研主题/领域
    type: textarea
    required: true
    help: 要研究什么，尽量写清对象、地区、时间范围；多个子问题可一并列出
  - key: goal
    label: 决策目标/交付物
    type: string
    help: 这次研究为哪个决定或哪份交付物服务（如要不要做、选哪个、怎么落地）
  - key: domainType
    label: 主题类型
    type: select
    default: 自适应
    options:
      - { label: 自适应, value: 自适应 }
      - { label: 事件与现象, value: 事件与现象 }
      - { label: 人物与组织, value: 人物与组织 }
      - { label: 做法流程, value: 做法流程 }
      - { label: 概念知识, value: 概念知识 }
      - { label: 决策选型, value: 决策选型 }
      - { label: 行业趋势, value: 行业趋势 }
      - { label: 技能方法, value: 技能方法 }
  - key: depth
    label: 深度档
    type: select
    default: 标准
    options:
      - { label: 速览, value: 速览 }
      - { label: 标准, value: 标准 }
      - { label: 深度, value: 深度 }
  - key: constraints
    label: 已知约束
    type: textarea
    help: 主体身份、地区、时间窗、预算、已有资源、合规限制等，方案必须围绕这些约束定制
  - key: requiredOutputs
    label: 必达产出
    type: textarea
    help: 用户点名要的产出（例：成本与收益的量化公式、逐日或分阶段时间线、对比矩阵、可点击来源），逐条转成验收项
  - key: knownContext
    label: 已知信息与已有材料
    type: textarea
    help: 已掌握的结论、已有资料与出处、可复用的私有知识库，用于先验标注与避免重复检索
output_desc: 输出 markdown 调研方案，固定六节——范围与决策目标（含不回答什么）／报告骨架（章节 × 每章要回答什么 × 呈现形态）／分析维度矩阵（维度 × 问题 × 关键指标 × 常见误区）／数据来源路由（来源 × 去哪取与取哪些字段 × 可靠性 × 时效 × 取不到时的降级路径）／取证与呈现纪律／执行计划与验收标准（must-answer、证据层级、停手条件）
---
你是调研方案设计者。为「{{param.topic}}」设计一份可直接执行的调研方案——目标：{{param.goal}}；主题类型：{{param.domainType}}；深度档：{{param.depth}}。你的输出是**方案**而不是研究结论：不要提前下结论，也不要罗列与主题无关的模板段落。

已知约束：{{param.constraints}}
用户必达产出：{{param.requiredOutputs}}
已知信息与已有材料：{{param.knownContext}}

按下面六节输出（用二级标题，逐节写实，不要空话）。

## 1. 范围与决策目标
- 一句话写清这次研究要支持的决定与交付物；列出**必须回答的问题（must-answer）**，每问写明要回答到的颗粒度（定义／机制／步骤／数字与区间／边界与反例）；
- 明确**不回答的问题**与口径（地区、时间、主体、计价单位、统计范围），避免读者误用；
- 约束逐条入方案（主体身份、地区、预算、时间窗、合规限制）：与约束相关的结论必须分主体／分地区／分场景给，不给笼统的单一答案。

## 2. 报告骨架（报告应包含哪些内容）
按主题类型裁剪下列章节，逐章写「这一章要回答什么 + 用什么形态呈现」（表格／矩阵／公式／时间线／清单／决策树）；类型不符的章节直接删掉，不要硬凑：
- 0 执行摘要：结论先行（结论与立场 + 总体可信度 + 适用条件 + 关键数字），读者只读这一节也能做判断；
- 1 范围与口径：研究边界、口径定义、方法概述；
- 2 现状与背景：事实基线（时间点、规模、主要参与者）；
- 3 主体分析：按第 3 节挑出的分析维度分章展开；
- 4 数据与证据：关键数据做成表格／对比矩阵／公式／时间线，每个数字带口径与来源；
- 5 路径与方案：可执行的做法（分场景／分主体／分地区的路径与决策树 + 门槛条件）；
- 6 成本与收益：成本结构与单位经济（能算就算，给公式与变量口径；算不出就说明缺哪些数据）；
- 7 风险与合规红线：风险清单（概率／影响／可逆性）+ 不可碰的红线 + 失败模式；
- 8 行动清单与门槛条件：分优先级的下一步 + 何时可做／何时该停／何时可扩的判定条件；
- 9 局限与待核验：未决问题、无法检索确认的点（写明需谁在哪个后台或官方渠道确认）、时效提示；
- 10 参考来源：分层（官方一手／平台后台需复核／二手估算）+ 可点击链接 + 采集时间；
- 11 附录：术语表、工具与资源清单、可复用模板与检查清单。
取裁口径：速览档保留 0/1/2/4/9/10；标准档另加 3/5/6/7/8；深度档全保留，并补交叉验证与反方观点。
事件/现象/人物类主题（深度报道、专题资料研究）改用下列骨架裁剪，逐章写「要回答什么 + 用什么形态呈现」；类型不符的章节直接删掉，不要硬凑：
- 0 执行摘要：核心发现与总体可信度，读者只读这一节也能抓住全貌；
- 1 来龙去脉：主题是什么、为何重要、涉及谁；
- 2 时间线：关键事件按时间排列（每条带日期与来源层级标注）；
- 3 人物与组织：关键角色、背景、关系网、现状（名录或表格，人名/机构名逐一可溯源）；
- 4 运作机制与手法：怎么运作/怎么发生（流程、链条、套路逐步拆解）；
- 5 数据与规模：关键数字（人数/金额/范围等，给量级与口径，标注来源层级）；
- 6 各方说法与争议：官方机构、官方媒体、互联网媒体、网络传言并列，冲突点逐条注明；
- 7 影响与后续：已发生的后果、趋势判断、待观察问题；
- 8 案例与细节素材库：可入文的具体事例、当事人说法、引语与生动细节（逐条带来源与层级）；
- 9 局限与待核验：未决问题、传言与未证实说法清单、时效提示；
- 10 参考来源：分层（官方机构／官方媒体／互联网媒体／互联网搜索与其他网络信息）+ 可点击链接 + 采集时间；
- 11 附录：术语表、名录补全、可复用清单。
事件类取裁口径：速览档保留 0/1/2/5/9/10；标准档另加 3/4/6/7；深度档全保留，并补 8（案例与细节素材库）与交叉验证。

## 3. 分析维度矩阵（从哪些方面分析）
先按主题类型选定维度，再逐维度输出矩阵：维度 × 要回答的问题 × 关键指标或字段 × 常见误区。通用维度库（命中才留，不硬凑）：
- 定义与边界：研究对象到底是什么、邻近概念如何区分；误区＝名词含糊导致口径漂移；
- 主体与角色：参与方、各自诉求与利益结构；误区＝把不同角色混为一体谈；
- 全流程环节：从准入到交付的每一步（做什么／需要什么／卡点在哪）；误区＝只讲结果不讲环节；
- 准入与资质合规：谁能做、需要哪些资质备案许可、地区差异；误区＝拿一地规则套全部；
- 成本与单位经济：一次性投入、固定与可变成本、单位经济（贡献利润／盈亏平衡／回本周期）、由售价或采购价倒推；误区＝只算显性成本、把估算当事实；
- 定价与收益：价格带、分成与费率佣金、结算周期与账期；误区＝忽略平台抽成与税费；
- 需求与规模：真实需求信号（搜索量／销量／预算／政策驱动）与自下而上估算；误区＝用总量市场代替可触达市场；
- 竞争与替代：直接竞争、间接替代、不做的替代方案、进入壁垒；误区＝只看头部玩家；
- 供给与供应链：货源或服务供给、质量稳定性、履约与售后；
- 渠道与流量：获客渠道、内容与投放机制、单位获客成本、转化链路；
- 运营节奏与时间线：分阶段推进节奏（按日／周／月给里程碑与验收点）；
- 工具与技术：可用工具、自动化与数据来源、学习成本；
- 人才与组织：需要谁、哪些可外包、管理半径；
- 风险与红线：合规／资金／履约／声誉风险与不可碰的底线；
- 门槛与退出：进入门槛、盈亏门槛、止损与退出条件；
- 时效与趋势：规则、费率、政策的有效期与变化方向；
- 分歧与不确定性：业界分歧点、证据冲突点、未知量；
- 常见失败模式：最典型怎么失败、失败前兆是什么；
- 事件脉络与时间线：起点、转折、关键节点、现状；误区＝只有结论没有日期与先后顺序；
- 人物与组织：关键角色、背景、关系网、现状；误区＝人名机构名不核实、张冠李戴；
- 手法与机制：怎么运作、链条怎么串、套路逐步拆解；误区＝只讲危害与定性、不讲过程；
- 规模与数据：人数/金额/范围等硬数据的量级与口径；误区＝把最大估计当确定值、不注来源；
- 信源生态与信息冲突：官方机构/官方媒体/互联网媒体/网络传言各自说了什么、哪里冲突；误区＝把传言当定论，或反过来因层级低直接丢弃；
- 细节与案例：可入文的具体事例、当事人说法、场景细节；误区＝只有概括没有故事。

## 4. 数据来源路由（从哪些地方获取数据）
**来源四级分级**（每条信息标注层级，层级代表可信度加权而不是可用性门槛）：官方机构（政府/司法/监管等一手通报、法规与判决）→ 官方媒体（国家通讯社与官方媒体机构的报道与通稿）→ 互联网媒体（商业媒体、门户、垂直媒体、行业媒体）→ 互联网搜索（搜索引擎直接命中的网页、聚合结果、论坛帖与自媒体，未深读原文时也标此级）。
**渠道必须跨级搭配**：官方机构只覆盖通报、口径与判决等一手信息；事件经过、当事人说法、案例与引语等叙事素材主要在官方媒体与互联网媒体/搜索里——sourcePlan 必须同时安排官方渠道与媒体/网络渠道，**不得只从官方机构渠道取材**。
为每个 must-answer 指定来源，逐行输出：来源类型 × 去哪取（具体渠道／站点／库名）× 取哪些字段 × 渠道分级 × 时效要求 × **取不到时的降级路径**。来源类型：
- 官方机构：监管与政府部门站点（法规原文、通报与判决、统计口径与年鉴）、官方公告与政策解读；一手口径来源，优先；
- 官方媒体：国家通讯社与官方媒体机构的报道（转述官方口径、通稿与调查报道）；事件叙事的主要来源；
- 互联网媒体：商业与行业媒体报道、门户与垂直媒体深度稿；叙事、数据与多方说法的主要载体；
- 互联网搜索与网络信息：搜索引擎命中的网页、社交平台帖、自媒体文章、视频纪录片与解说、当事人自述、网友整理与复盘；层级最低但**可用**——引用时标注「互联网搜索」或「网络信息」，关键事实尽量与其他来源交叉，与官方或权威来源矛盾时并列说明；
- 平台后台与账户内：只有登录后才能看到的费率、结算、报表与后台规则；属**需后台核验**一类，只有用户本人能做，检索不到不算失败；
- 行业与市场数据：研究机构报告、行业协会、咨询与研报、招投标与展会资料；注意样本与口径差异；
- 公开财务与公告：上市公司财报与年报、公告、工商与司法公开信息；用于验证规模、成本结构与风险事件；
- 学术与专利：论文库、专利库、标准与白皮书；用于机制、前沿与争议；
- 从业者与社区：垂直论坛、问答社区、从业者社群、访谈与实操分享；信息密度高但必须交叉验证；
- 竞品与实测：公开页面与帮助文档、官方广告与创意库、第三方流量与榜单工具、自行注册试用或小规模实测；
- 工具与数据库：关键词与需求工具、数据平台、物流支付等基础设施文档。
检索策略：中英双语关键词各一轮；必要时加站点限定与时间限定；官方机构与官方媒体优先，互联网媒体与搜索补足叙事素材；关键事实尽量两个独立来源交叉，交叉不到的标注「单一来源」保留——**不因来源层级不够权威而丢弃信息**；来源互相**矛盾**时并列说明，不要择一当定论；预期登录墙与反爬会导致部分来源不可达，此时按降级路径换来源，并登记「未查到（已试来源）+ 需谁核验」。

## 5. 取证与呈现纪律
- 三态标注：每条结论标【已验证】（有可追溯来源）／【先验-待验证】（模型知识，需核验）／【未查到】（查过但无果，写明已试来源）；
- **禁止编造**：标题、URL、数字、引文、机构名一律不得臆造——这是唯一红线；
- 来源分级标注（而不是来源门槛）：逐条标四级来源层级——官方机构／官方媒体／互联网媒体／互联网搜索（业务相关时另加：平台后台需复核）；层级低的信息**保留并如实标注**（例「互联网媒体报道，未经官方证实」「网络信息，未见权威来源」），孤证标「单一来源」；估算与传闻明确标「估算／传闻，未经证实」，不得写成定论；
- 渠道跨级核查：成稿前自查来源结构——若叙事素材全部来自官方机构渠道，必须补媒体与网络检索，不能只有官方口径；
- 数字与费率：给量级或区间 + 口径 + 取证时间；易变信息标注「以官方最新为准」；
- 反方与边界：给出对立观点或反例并逐条回应；给适用边界（什么条件下结论不成立）；
- 素材密度：为每个 must-answer 收集可入文的具体材料（时间/人名/机构/数字/案例/引语），只有定性概括视为未完成；
- 可点击来源：参考来源用 Markdown 链接并给采集时间，私有资料标注文档名；确无链接的网络信息标注「网络信息，未留链接」；
- 呈现：能用表格／矩阵／清单就不用长段落；公式给变量定义与取值口径；时间线给里程碑与验收点。

## 6. 执行计划与验收标准
- 研究步骤：按依赖排序（每步写明要得出什么 + 首选来源 + 预估难度），标出哪些步骤可并行、哪些必须等用户提供信息；
- 轮次计划：按深度档给节奏（速览 1 轮、标准 2-3 轮、深度可到轮数上限），每轮聚焦上一轮遗留缺口，不为凑轮数重复已解决问题；
- 验收标准（逐条可判定有／无、够／不够）：must-answer 清单 + 每问颗粒度 + 来源层级标注要求（四级分级逐条标）+ **素材密度要求**（每个 must-answer 都要有具体事实/数据/案例支撑，而不是只有定性结论）+ **必达产出清单**（用户点名项逐条成验收项）+ 呈现形态要求；
- 停手条件：关键问题已覆盖、证据可溯源（层级低但已标注即可）、素材足够成稿、剩余差距只能靠用户后台或官方核验（属**非阻塞项**）时即可成稿；仍有可检索的关键缺口则继续研究；
- 深度档差异：速览＝关键结论 + 来源；标准＝加矩阵／公式／时间线／清单；深度＝加交叉验证、反方观点与门槛式决策条件。
`,
  },
]
