/**
 * 内置预置技能（只读，代码内联 SKILL.md）
 * @module core/modules/workflow/skills/builtin-skills
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
  要求：只依据素材内容，不编造；事实/当事人自述/网传严格标注（【事实】【自述】【网传】）；
  口播语言口语化、有画面感；每个镜头时长合计等于目标时长。
output_desc: 输出 markdown：脚本概览 → 口播稿（按镜头分段）→ 分镜表（表格）→ 发布文案与话题标签
---
根据素材生成约 {{param.duration}} 秒的竖版短视频脚本，风格：{{param.style}}。

## 脚本概览
- 主题、时长、定位（信息/娱乐/干货）、目标人群

## 口播稿
按镜头分段：1 钩子开场（3 秒内抓人）→ 2 事件核心（讲清来龙去脉）→ 3 反转/金句（情绪高点）→ 4 结尾引导（关注/评论/下期预告）。每段标注口播文字。

## 分镜表
| 镜头 | 画面 | 口播 | 字幕 | 音效/BGM | 时长(秒) |
分镜时长合计 = {{param.duration}} 秒；画面给可执行描述（人物/场景/运镜/贴纸字幕）。

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
]
