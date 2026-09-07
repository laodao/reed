/**
 * 内置预置技能（只读，代码内联 SKILL.md）
 * @module core/platform/workflow/skills/builtin-skills
 * @description 随应用提供的技能包（source=builtin），技能库只读展示，
 *              用户可「复制为自定义」得到可编辑的技能包目录副本。
 *              内容为 SKILL.md 全量（YAML frontmatter + markdown 正文），
 *              由 skill-parser 解析为 WorkflowSkill。
 */

/** 内置技能清单（id → SKILL.md 文本） */
export const BUILTIN_SKILLS: Array<{ id: string; markdown: string }> = [
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
]
