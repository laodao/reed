/**
 * 系统功能模块能力目录（注册制登记处）
 * @module core/platform/workflow/tools/module-capability-catalog
 *
 * 「系统有什么能力」的单一事实源：每个功能模块一张能力卡（契约见
 * ModuleCapability），汇总后有两个消费面——
 * ① 系统 Agent 宿主（聊天 Agent 模式）把 renderModuleCapabilityDigest() 的有界
 *    摘要注入系统提示词：模型先按「意图→模块」匹配，再按卡上的调用路径执行
 *    （复用既有工作流 / 调技能 / 直连工具 / 引导到 UI），不必先盲查目录；
 * ② discover_capabilities 返回 filterModuleCapabilityCards() 全量详情（keyword
 *    收窄），agent 需要参数级细节时再查。
 *
 * 登记处模式（与 builtin-packs.ts / BUILTIN_SKILLS 同构）：新增模块或能力随该
 * 模块的 PR 同步改卡；卡内容必须与代码实况一致（能力写多了=诱导必败调用，
 * 写少了=agent 不知道能用——两边都以本文件为 review 基准）。
 */

import type { ModuleCapability } from '@shared/types/module-capability.types'

/** 全部内置能力卡（顺序即摘要展示顺序：agent 可直调的排前，UI 引导类排后） */
export const MODULE_CAPABILITY_CARDS: ModuleCapability[] = [
  {
    moduleId: 'workflow',
    name: '工作流引擎',
    tagline:
      '把能力节点编排成可复用流程：已有工作流用 run_workflow 直接运行，没有的用 create_workflow_draft 按描述现写草稿（用户在编辑器检查发布后可复用）；节点库覆盖 LLM、知识库检索/问答/入库、联网搜索、网页提取、新闻抓取、翻译、文生图、TTS、语音转写、音色复刻、视频生成、视频合成、HTTP、代码、数据表、人工审核、循环/并行/条件、技能调用、子工作流、agent 循环',
    intents: [
      '帮我把这套流程自动化 / 定期执行',
      '做一个「抓新闻→写稿→存库」的流程',
      '现有工作流能不能帮我做这件事',
    ],
    capabilities: [
      '运行既有工作流并等待终态（run_workflow，先 discover_capabilities 查 id 与参数）',
      '查询运行状态与节点摘要（get_workflow_run）',
      '按自然语言描述生成工作流草稿（create_workflow_draft，含 code/HTTP 节点时会提醒用户重点检查）',
      '一次性多步任务用 create_task_plan 建任务树（用户在「Agent 任务树」页批准后执行）',
    ],
    invocation: [
      { via: 'workflow', how: 'run_workflow / create_workflow_draft（先 discover_capabilities 确认 id 与参数）' },
      { via: 'tool', how: 'create_task_plan（跨模块长程目标，需用户批准）' },
    ],
  },
  {
    moduleId: 'data',
    name: '信息与数据',
    tagline: '联网搜索、网页正文提取、HTTP 请求、数据表查询、本地文件读取——聊天宿主可直调；新闻/链接批量抓取走工作流（crawl-news/crawl-links/web-search/web-extract 节点）',
    intents: ['查一下最近的报道', '生成关于某事件的报告（先搜资料再写）', '读这个网页/接口的内容'],
    capabilities: [
      'web_search：联网搜索（给来源）',
      'wf_web_extract：网页正文提取',
      'http_get：HTTP GET 请求',
      'data_table_query：数据表查询',
      'fs_read_file / fs_list_dir：本地只读',
      '新闻抓取/批量采集：crawl-news、crawl-links 节点入工作流',
    ],
    invocation: [
      { via: 'tool', how: 'web_search / wf_web_extract / http_get / data_table_query / fs_read_file / fs_list_dir（本宿主直调）' },
      { via: 'workflow', how: 'crawl-news / crawl-links / web-search / web-extract / http-request 节点（批量或定时场景）' },
    ],
  },
  {
    moduleId: 'skills',
    name: '技能包',
    tagline: '参数化提示词模板，invoke_skill 直接出内容：短视频脚本、公众号图文、小红书/微博文案、文章润色、事件深度分析（多视角报告）、短视频大纲/口播（标准与调查体）、学习地图/讲义/概念卡片',
    intents: ['给这个事件写篇深度分析报告', '生成一条短视频脚本', '写一篇公众号文章/小红书笔记', '把这段文字润色一下'],
    capabilities: [
      'deep-analysis：事件/主题多视角结构化分析（概述、时间线、多视角、结论）',
      'short-video-script：竖版短视频完整脚本（口播稿+分镜表+发布文案）',
      'video-writer-standard / video-writer-investigative：短视频大纲与整段口播',
      'wechat-article / xiaohongshu-copy / weibo-post：图文与短文案',
      'article-polish：诊断式润色改写',
      'learning-*：学习地图、讲义方案、概念讲义、讲义正文',
      'chapter-design-card：长文章节设计卡',
    ],
    invocation: [
      { via: 'skill', how: 'invoke_skill（先 discover_capabilities 查技能 id 与必填参数，缺参先问用户）' },
    ],
  },
  {
    moduleId: 'longwriting',
    name: '长文写作',
    tagline: '长篇小说/网文创作：故事研讨室（多轮研讨→设计包→确认落库）、设定集/大纲/一致性图谱、章法写正文——重交互在 UI，「故事研讨室」里直接说「我要写什么」即可；chapter-writing / volume-design 节点可把章节写作、卷设计编排进工作流（需项目 projectId）',
    intents: ['我想写一本小说', '帮我设计人物/世界观/大纲', '写第 N 章正文', '修正第 N 章的一处情节错误'],
    capabilities: [
      '故事研讨室：与「主编」agent 研讨收敛故事，设计包整体确认后落库',
      '章节写作章法：设计卡→自检→一致性检查→生成正文（chapter-writing 工作流节点）',
      '卷设计：骨架→人物层→章节网格→整合（volume-design 工作流节点）',
      '正文局部修正与一致性疑点管理',
    ],
    invocation: [
      { via: 'ui', how: '/longwriting 建项目 → 故事研讨室直接对话', note: '项目域工具（lw_*）只在研讨室宿主内开放；跨模块组合用 create_task_plan' },
      { via: 'workflow', how: 'chapter-writing / volume-design 节点入工作流（需 projectId 入参）' },
    ],
  },
  {
    moduleId: 'episode-production',
    name: '短剧制作',
    tagline: '短剧/视频生产线：剧本→场景→分镜→关键帧→视频→配音→合成导出 MP4——项目内「制作助理」agent 可直接驱动全流水线；生成类按次计费、有频控',
    intents: ['把这个故事做成短剧视频', '给这一集生成分镜/关键帧', '配音并导出成片'],
    capabilities: [
      '剧本/场景/分镜生成与绑定',
      '关键帧（文生图）、分镜视频生成、场景配音',
      '资产卡（角色/地点/物品）与资产图生成，项目级复用',
      '合成导出 MP4（分钟级后台任务）',
    ],
    invocation: [
      { via: 'ui', how: '/episode-production 建项目/剧集 → 制作助理对话直接驱动', note: '制作工具为项目域（需项目上下文），不在聊天宿主直调' },
    ],
  },
  {
    moduleId: 'voice',
    name: '语音',
    tagline: '语音合成（文字→语音）、语音识别（语音/音频→文字）、音色复刻（克隆音色）、视频抽音频——tts/stt/voice-clone/video-extract-audio 工作流节点承载，语音工作台手动使用',
    intents: ['把这段文字读成音频', '把这段录音转成文字', '用我的音色给文案配音'],
    capabilities: [
      'TTS 文本转语音（多 Provider/多音色）',
      'STT 语音转文字',
      '音色复刻：上传样本克隆音色，再用于合成',
      '视频文件抽取音频（转写前置）',
    ],
    invocation: [
      { via: 'workflow', how: 'tts / stt / voice-clone / video-extract-audio 节点（create_workflow_draft 现写或既有工作流）' },
      { via: 'ui', how: '/voice 语音工作台' },
    ],
  },
  {
    moduleId: 'image',
    name: '图像生成',
    tagline: '文生图（多 Provider）：image-gen 工作流节点承载，批量/流程化出图走工作流',
    intents: ['画一张…的图', '给这段故事每个角色出一张立绘'],
    capabilities: ['image-gen：按提示词生成图片，可入工作流批量执行'],
    invocation: [
      { via: 'workflow', how: 'image-gen 节点（create_workflow_draft 现写或既有工作流）' },
      { via: 'ui', how: '应用页图像应用 / 资产中心' },
    ],
  },
  {
    moduleId: 'translate',
    name: '翻译',
    tagline: '多语言文本翻译：translate 工作流节点承载（任务树执行器内为 wf_translate 直连工具）',
    intents: ['把这篇文章翻译成英文'],
    capabilities: ['translate 节点：文本/批量翻译入工作流'],
    invocation: [
      { via: 'workflow', how: 'translate 节点' },
      { via: 'tool', how: 'wf_translate（任务树执行器内可用）' },
    ],
  },
  {
    moduleId: 'knowledge-base',
    name: '知识库',
    tagline: '文档知识库：入库、检索、问答——kb-ingest / kb-retrieve / kb-qa 工作流节点承载，「先查资料再产出」类任务与知识库组合',
    intents: ['根据我的资料回答…', '把这份文档收进知识库', '在知识库里查一下…'],
    capabilities: ['kb-ingest：文档入库', 'kb-retrieve / kb-query-multi：检索', 'kb-qa：知识库问答'],
    invocation: [
      { via: 'workflow', how: 'kb-ingest / kb-retrieve / kb-qa 节点（需知识库 id，向用户澄清）' },
      { via: 'ui', how: '/knowledge-base' },
    ],
  },
  {
    moduleId: 'asset-center',
    name: '资产中心',
    tagline: '模板/素材/图片等创作资产管理：save-asset / read-asset / read-assets 工作流节点承载',
    intents: ['把生成的图存为资产', '取模板资产给流程用'],
    capabilities: ['save-asset：产物入资产库', 'read-asset(s)：读资产供流程引用'],
    invocation: [
      { via: 'workflow', how: 'save-asset / read-asset / read-assets 节点' },
      { via: 'ui', how: '/asset 资产中心' },
    ],
  },
  {
    moduleId: 'diary',
    name: '日记',
    tagline: '日记记录：save-diary 工作流节点可把工作流产出自动物化成日记',
    intents: ['把今天的总结写进日记'],
    capabilities: ['save-diary 节点：流程产物落日记'],
    invocation: [{ via: 'workflow', how: 'save-diary 节点' }, { via: 'ui', how: '/diary' }],
  },
  {
    moduleId: 'portrait',
    name: '人设工坊',
    tagline: '角色人设卡与形象模板管理（界面能力）',
    intents: ['给我这个故事的角色做人设'],
    capabilities: ['人设卡模板与人设管理'],
    invocation: [{ via: 'ui', how: '/portrait 人设工坊' }],
  },
  {
    moduleId: 'domain-learning',
    name: '领域共学',
    tagline: '领域学习空间：学习地图、概念讲义、教学讲义生成与复习——learning-* 技能可产出草稿，空间管理在界面',
    intents: ['我要系统地学某个领域', '帮我出一份学习地图'],
    capabilities: ['学习地图/讲义方案/概念讲义/讲义正文（learning-domain-map / learning-lesson-designer / learning-concept-explainer / learning-lesson-writer 技能）'],
    invocation: [
      { via: 'skill', how: 'invoke_skill（learning-* 技能，先 discover_capabilities 查参数）' },
      { via: 'ui', how: '领域共学空间页面' },
    ],
  },
]

/**
 * 提示词摘要（有界）：每模块一行「名称：tagline」——tagline 已含主调用路径，
 * 模型按它做意图匹配；参数级细节让它再查 discover_capabilities。全量卡注：
 * 新增模块随卡自动进摘要，无需改宿主。
 */
export function renderModuleCapabilityDigest(cards: ModuleCapability[] = MODULE_CAPABILITY_CARDS): string {
  return cards.map((c) => `- ${c.name}：${c.tagline}`).join('\n')
}

/**
 * 按 keyword 过滤能力卡（命中面：id/名称/职责/意图/能力条目/调用路径——
 * 大小写不敏感；空 keyword 返回全量）。discover_capabilities 用。
 */
export function filterModuleCapabilityCards(keyword?: string, cards: ModuleCapability[] = MODULE_CAPABILITY_CARDS): ModuleCapability[] {
  const kw = keyword?.trim().toLowerCase()
  if (!kw) return cards
  return cards.filter((c) =>
    [c.moduleId, c.name, c.tagline, ...c.intents, ...c.capabilities, ...c.invocation.map((i) => `${i.via} ${i.how}`)]
      .join('\n')
      .toLowerCase()
      .includes(kw),
  )
}
