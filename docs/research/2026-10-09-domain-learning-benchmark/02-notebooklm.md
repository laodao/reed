# NotebookLM（2026-07 起更名 Gemini Notebook）深度调研

> 调研日期：2026-10-09 ｜ 方法：blog.google / support.google.com / workspaceupdates / Google Cloud docs 一手来源为主，TechCrunch、9to5Google、The Verge 体系、Android Authority、CNET 等为辅，中文学术与评测补充。关键结论附来源。
> ⚠️ 已独立核验：2026-07-16 NotebookLM 更名 Gemini Notebook 属实（30M+ 用户、600k+ 组织），见 [Google Blog](https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook)、[NC State OIT 通告](https://oit.ncsu.edu/2026/07/17/notebooklm-changes-name-to-gemini-notebook)。本档沿用 NotebookLM 指称其全部历史。

## 0. 产品现状速览（2026-10）

NotebookLM 已从"源驱动 AI 笔记本"演进为"**源驱动 + 代理式研究工作台**"：三栏界面（Sources / Chat / Studio）未变，Studio 膨胀为多模态产出矩阵（音频、视频、思维图、闪卡、测验、报告、信息图、幻灯片、数据表）；2026-06 起每个笔记本内置"安全云电脑"（写并运行代码、生成文件）；2026-07 起与 Gemini App、Google 搜索 AI 模式三方同步。定位始终是 grounded in your sources——所有回答/产出物约束在用户给的源上，回答带可点击原文引用锚点。

来源：[Google Blog: Do better research with NotebookLM（2026-06-08）](https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm)、[更名公告（2026-07-16）](https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook)、[Wikipedia](https://en.wikipedia.org/wiki/Gemini_Notebook)

## 1. 演进时间线（2023 → 2026-10）

| 时间 | 事件 | 来源 |
|---|---|---|
| 2023-06/07 | I/O 以 Project Tailwind 亮相；以 NotebookLM 名义上线（Google Labs） | [开发故事](https://blog.google/technology/ai/notebooklm-google-ai/) |
| 2024-03/09 | Audio Overview（Deep Dive 双 AI 主持播客）成为爆款；全量开放 | 同上 |
| 2024-10 | 定制音频（听前给指令）、Business 试点 | [Wikipedia](https://en.wikipedia.org/wiki/Gemini_Notebook) |
| 2024-12-13 | 三栏新 UI + **Interactive Audio（Join 加入播客对话）** + Plus 订阅档 + Gemini 2.0 Flash；官方披露用户生成"超过 350 年时长"音频 | [官方博客](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-new-features-december-2024/) |
| 2025-03-20 | **Mind Map**（免费全量） | [9to5Google](https://9to5google.com/2025/03/20/notebooklm-mind-maps/) |
| 2025-04-02 | **Discover sources**：描述主题→自动找 ≤10 源+注释摘要→一键导入 | [官方博客](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-discover-sources) |
| 2025-04-29 | 音频扩至 50+ 语言 | [Workspace Updates](https://workspaceupdates.googleblog.com/2025/04/language-expansion-audio-overviews-notebooklm.html) |
| 2025-05-19 | **iOS/Android App**（后台播放、离线下载） | [TechCrunch](https://techcrunch.com/2025/05/19/google-launches-standalone-notebooklm-app-for-android) |
| 2025-05-23 | 音频长度控制（Shorter/Default/Longer） | [9to5Google](https://9to5google.com/2025/05/23/notebooklm-audio-overviews-length/) |
| 2025-06-04 | **公开分享笔记本**（链接只读+可聊天） | [官方博客](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-public-notebooks) |
| 2025-07-11 | **Video Overviews** 全量（AI 旁白幻灯式讲解视频）；Studio 改版 | [官方博客](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-video-overviews-studio-upgrades/) |
| 2025-07-14 | **Featured notebooks**（The Economist/The Atlantic/Eric Topol/Ethan Mollick 等 8 家） | [TechCrunch](https://techcrunch.com/2025/07/14/notebooklm-adds-featured-notebooks-from-the-economist-the-atlantic-and-others) |
| 2025-08 | 成为 Workspace for Education 核心服务；向青少年开放 | [Workspace Updates](https://workspaceupdates.googleblog.com/2025/08/notebooklm-is-now-available-to-all.html) |
| 2025-09-02/08 | **闪卡 + 测验（Quizzes）+ Reports 改版**；Learning Guide 聊天预设；**OpenStax 精选笔记本**（6 门课）；音频四格式（Deep Dive/Brief/Critique/Debate） | [官方博客（一手）](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/) |
| 2025-10 | **100 万 token 上下文**（含免费档）、保存聊天历史、自定义角色/目标扩至 5000 字符 | [Fello AI 更新账](https://felloai.com/notebooklm-update-1m-token-chat-goals-saved-history) |
| 2025-11 | **Deep Research / Fast Research 进驻**（规划→浏览数百网站→带引用报告→一键存为源）；新源类型（DOCX/Sheets/CSV/图片 OCR）；**与 Gemini App 互通**；**Nano Banana Pro 接入：信息图 + 幻灯片**；LTI 1.3 集成 + Classroom 派课 | [官方博客](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-deep-research-file-types) |
| 2025-12 | Gemini 3 上车；**Data Tables**（定性文本→对比表，可导出 Sheets） | [9to5Google](https://9to5google.com/2025/12/19/notebooklm-gemini-3-data-tables/) |
| 2026-02/03 | 幻灯片逐页提示词修改 + PPTX 导出；**Cinematic Video Overviews**（Ultra 专属动态视频） | [Android Authority](https://www.androidauthority.com/notebooklm-cinematic-video-overviews-3646734/) |
| 2026-06-08 | **史上最大升级：Gemini 3.5 + 全面 Agentic**——每笔记本配"安全云电脑"、自主找源、100+ 技能、生成/编辑文件 | [官方博客](https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm) |
| 2026-07-16 | **更名 Gemini Notebook**；笔记本在 Gemini App 与搜索 AI Mode 三方自动同步 | [官方博客](https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook) |
| 2026-07 下旬 | Short Video Overviews（60 秒竖版） | [eesel.ai](https://www.eesel.ai/blog/notebooklm-short-video-overviews) |
| 2026-09-02 | 限额制改革：按日计数→**计算量预算**（每 5 小时刷新+周上限），重操作扣更多 | [Elephas](https://elephas.app/blog/notebooklm-source-limits) |

## 2. 重点特性详解

### Video Overviews
两种格式：**Explainer**（5-10 分钟）与 **Brief**（60 秒，2026 演化为竖版）；80+ 语言旁白；生成前可选语言/视觉风格/steering prompt；2025-11 起六种视觉风格（Watercolor/Papercraft/Anime/Whiteboard/Retro Print/Heritage）+ Classic + 自定义。普通版本质是"带旁白的可导航幻灯片"。
来源：[官方](https://blog.google/innovation-and-ai/models-and-research/google-labs/video-overviews-nano-banana)、[support 页](https://support.google.com/gemininotebook/answer/16454555?hl=en)

### Mind Map（对我们最相关）
- 每个节点可点击：点节点打开**聚焦该分支的 grounded 聊天面板**，可在子话题内继续追问；支持缩放/展开收起。
- **关键限制**：不可手动编辑节点（改字/挪位/删边都不行）；想"修图"只能整体删除重新生成；社区靠第三方导出 Markdown 进 XMind 续命，被骂两年。约 10 条/天（免费）/20 条/天（付费）。
来源：[官方帮助](https://support.google.com/gemininotebook/answer/16212283?hl=en)、[Reddit 抱怨](https://www.reddit.com/r/notebooklm/comments/1pnuvzq/notebooklm_mind_maps_are_great_but_not_editable)、[XMind 导出方案](https://xmind.com/blog/export-notebooklm-mind-map)

### Flashcards / Quizzes（2025-09）
从源一键生成，可选**难度、数量、主题聚焦**；测验以选择题为主，即时判分，每题带解释与提示；**每个错题/卡片有 "explain" 按钮——点击给出带引用的解释并可回链原文**；可生成分享链接。
来源：[官方博客 6 ways to use NotebookLM to master any subject（2025-09-08）](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/)

### Reports（报告模板全列表）
固定模板：**Briefing doc / Study guide（测验题+论述题+术语表）/ FAQ / Timeline / Blog post** + **动态 Suggested Formats**（AI 按源推荐）+ **自定义格式**（提示词→存为个人格式模板）。所有报告可转笔记/导出。
来源：[XDA](https://www.xda-developers.com/notebooklm-reports-feature)、[DataCamp](https://www.datacamp.com/tutorial/notebooklm)

### Interactive Audio Overview
播放中点 **"Join"** 加入对话，AI 主持人"点名"让你语音提问；2025-09 起四格式：**Deep Dive**（双主持深潜）/ **Brief**（单主持快过）/ **Critique**（双主持批判你的内容）/ **Debate**（两个 AI 互辩）。移动端后台播放+离线。
来源：[官方 Dec 2024](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-new-features-december-2024/)、[Android Authority](https://www.androidauthority.com/notebooklm-new-audio-overview-formats-3593717/)

### Discover sources / Deep Research（自动找料双档）
- Discover（2025-04）：主题→≤10 网络源+每源注释摘要→勾选导入；另有"I'm feeling curious"随机探索。
- Deep Research（2025-11）：问题→研究计划→**自主浏览数百网站**→带引用报告→**一键存为源**；Fast Research 秒级版。第三方实测 Deep Research 弱于 Perplexity/ChatGPT 同类。
来源：[官方博客](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-deep-research-file-types)、[jeffsu.org 评测](https://www.jeffsu.org/notebooklm-changed-completely-heres-what-matters-in-2026)

### Featured notebooks
官方运营的专家策展公开笔记本（2025-07 起 8 家媒体/专家；2025-09 加 **OpenStax 教材系列** 6 门课）。产品从工具走向"内容分发平台"。
来源：[TechCrunch](https://techcrunch.com/2025/07/14/notebooklm-adds-featured-notebooks-from-the-economist-the-atlantic-and-others)、[官方](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-featured-notebooks)

### 分享与权限
邮件邀请：**Viewer**（可聊不可改）/ **Editor**；公开链接只读；企业版额外 **Chat View**（可聊天但看不到源文件，保护版权）；共享本聊天历史私有。
来源：[Google Cloud docs](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/share-notebooks)

### 额度（免费 vs 付费；2026-09 起逐步改计算量预算）

| 项 | Free | Plus | Pro | Ultra |
|---|---|---|---|---|
| 笔记本 | 100 | 200 | 500 | 500 |
| 每本源数 | 50 | 100 | 300 | 500/600 |
| 每源字数 | 50 万词/200MB | 同 | 同 | 同 |
| 聊天/音频/视频等 | 50 chats/日、3 音频、3 视频 | 2x | 4x | 5-20x |

来源：[Elephas（2026-09 核对）](https://elephas.app/blog/notebooklm-source-limits)、[Fello AI](https://felloai.com/notebooklm-pricing/)。企业版 ~$9/用户/月；**API 只在企业侧存在**（可编程建笔记本/加源/生成音频），消费级无 API。

## 3. 源体系与聊天体验

**源类型**：PDF（≤200MB）/TXT/Markdown/DOCX/CSV/ePub、Google Docs（活文档，改动自动同步）/Slides/Sheets、音频、图片（OCR）、网页 URL、YouTube URL（字幕转写）、粘贴文本、Discover 推荐源、Deep Research 报告。导入后自动生成**源摘要+关键主题导览**；单源可单独提问。

**引用机制（核心交互）**：回答断言挂**编号引用 chip**，点击→右侧源查看器打开并**高亮原始段落**，形成"断言→原文"秒级核验闭环。局限：chip 不可编辑，无 APA/MLA 参考文献导出（第三方补）。

**源边界行为**：官方口径只依据源回答、超界明说"不在源中"。社区实录两种失灵：过度拒绝；检索漏源时的自信错答（"错误穿着引用外衣更难识破"，[Medium 批评](https://medium.com/write-a-catalyst/notebooklm-confidently-wrong-d102ed356a01)）。

**聊天**：保存到笔记（上限 1000 条/本、可置顶、**已保存笔记不可再编辑**）；**Configure Chat 预设响应风格：Default / Analyst / Learning Guide（引导你走向答案而非直接给答案）/ Critic + 自定义指令（5000 字符，支持 chat goals）**；响应长度可调；2025-10 起保存聊天历史（可删避免上下文污染）；100 万 token 上下文。

## 4. 作为"学习工具"的真实用法与学术批评

**官方教育叙事**（2025-09-08 一手博客）：卖点是**主动回忆**——闪卡练习回忆、测验 "practice recall"、错题 explain 带引用回链、Learning Guide"带你走向答案"。配套：OpenStax、LTI 1.3（Canvas/Schoology）、Classroom 派课。
**但：没有掌握度追踪、没有间隔复习、没有前置关系图**——学习功能是"一次性出题器"，测完即止，测评结果不反哺任何状态。这是它与 Quizlet/Anki/RemNote 的结构性空档，也是第三方对它的定位（[MUO: Turning NotebookLM into a better Quizlet](https://www.makeuseof.com/notebooklm-learning-techniques)）。

**真实学生用法**：上传课件→Mind Map 概览→生成闪卡/测验→通勤听 Brief→考前 Quiz 抽查；写作课用 Critique 音频拿批改；研究生用 Deep Research+Data Tables 做文献初筛。

**学术批评**：
1. **Albrecht-Crane, ACM SIGDOC '25（DOI 10.1145/3711670.3764628）**：NotebookLM 的"统计压缩"机制与人类阅读/分析根本不同——**它压缩文本而非理解文本**，与教育价值系统性错位（[ACM DL](https://dl.acm.org/doi/10.1145/3711670.3764628)）。
2. **Rettberg, Media, Culture & Society 47(5)（2026-05，DOI 10.1177/01634437261452160）**：Audio Overview 的"**合成亲密感**"（AI 主持人伪造谈话默契）与"**文化误译**"（非英语源被美式口语化重构）；公开数据集 [arXiv:2511.08654](https://arxiv.org/abs/2511.08654)。
3. 教学咨询界"AI 代读"批评：密歇根大学 LSA（2026-03）指其诱导"用摘要替代精读"（[原文](https://sites.lsa.umich.edu/learningteachingconsulting/2026/03/12/a-critical-look-at-notebooklm)）。
4. 滥用与诉讼：2026-02 NPR 前主持人 David Greene 起诉 Google 称 Audio Overview 男声克隆其声线（[Washington Post](https://www.washingtonpost.com/technology/2026/02/15/david-greene-google-ai-podcast)）。

**行业趋势对照**：NotebookLM 本身**没有强制的 Study Mode**——全行业趋势是 ChatGPT Study Mode（2025-07-29）、Gemini Guided Learning（2025-08）、Claude Learning Mode（2025-04）；它的对应物只是可开关的 Learning Guide 预设，不阻止"直接要答案"。

## 5. 商业与生态

- 用户量：官方口径"数百万用户、数万组织"（2024-12）；2024 Q4 MAU 环比 +120%；第三方估 2025 年末 ~1700 万 MAU；更名时 **30M+ 用户、600k+ 组织**。热度一度超过 Gemini App 本身（Google Trends）。
- 定价：并入 Google AI 订阅（Plus $4.99-7.99 / Pro $19.99 / Ultra $99.99+）；教育 Plus 5x 额度；企业 ~$9/用户/月。
- 与 Gemini 生态（2025-11 起双向）：笔记本可作为 Gemini App 的源；2026-07 起在 Gemini App 与搜索 AI Mode 三方自动同步；反之 Deep Research 报告可导入做源。NotebookLM 保持"源接地"人格、Gemini 保持通用助手人格——刻意分离。
- 竞品格局：开创 source-grounded AI notebook 品类并引发模仿潮（Humata、ChatDOC、AFFiNE AI、Napkin、NoteGPT、TurboLearn、Knowt、Recall、RemNote、Otio…）；2025-09 学习功能直接踩进 Quizlet/Anki/TurboLearn 地盘。

## 6. 与"领域学习"模块的对位分析

**哲学差异：以源为中心 vs 以图谱为中心。**
- NotebookLM 的知识组织单位是"笔记本=源集合"，**从不预规划结构**：Mind Map 是导入源后的即时衍生品（层级树，非 DAG，无前置边），角色是"导航器+提问入口"而非学习路线。它没有掌握度、没有 SRS、没有困惑记录——**学习闭环到"出题"为止**。
- 它把结构生成做成**零仪式的即时动作**，把修图做成"补源+重生成"而非手动编辑（且因不可手动编辑被骂两年——**图的"可修复性"是真需求**）。
- 它的防御是引用锚点+离源拒绝；我们的防御是图谱先验+掌握度。可借鉴其"边界诚实"。
- 2026 年全面 agentic 化（自主找源、云电脑）证明方向：**规划不该是前置仪式，而应是后台持续的代理行为**。

**机制→环节映射**：

| 我们的环节 | NotebookLM 对应机制 | 借鉴点 |
|---|---|---|
| 画图 | Mind Map（即时生成、点节点聚焦提问、不可手编） | 图=导航器而非交付物；生成要零仪式 |
| 沿图学 | 点节点→该分支 grounded chat；Learning Guide；Audio/Video 多文体 | 讲义按需+多形态，而非单一讲义流 |
| 测 | 一键 Quiz/闪卡（难度/数量/主题可选，explain 带引用） | 低摩擦出题+每题回链原文；掌握度留给我们差异化 |
| 修图 | （不能修，用户怨声载道）+ Discover/Deep Research 自动补源 | 修图=补料重生成+局部对话修改，两条腿都要 |
| 巩固 | （不做 SRS）Featured 模板库做冷启动 | 间隔复习是我们的护城河；模板库可借 |

## 7. 同类"以源为中心的 AI 笔记本"一览

| 产品 | 定位 | 值得注意的机制 |
|---|---|---|
| Humata | 团队版文档问答 | 页级引用高亮+团队权限 |
| ChatDOC | PDF 深度问答 | 框选表格/区域后定向提问 |
| AFFiNE AI | 开源文档+白板+wiki | 画布上框选任意内容触发 AI；可自托管 |
| Napkin AI | 文本→信息图/流程图 | 从叙述文本生成**可编辑**图示 |
| NoteGPT | YouTube/PDF 摘要+笔记+闪卡 | 视频时间戳级笔记 |
| Recall | 内容→知识图谱卡片+SRS | **图谱与复习卡从同一内容双向生成**（与我们最同构，另见 04 号档） |
| Perplexity Spaces / ChatGPT Projects | "源集+系统指令"封装为项目空间 | notebook 范式反向吸收进通用助手 |
| Elicit / SciSpace | 论文工作流 | 结构化字段抽取成表 |
| Otio | 研究者 AI 工作流 | 因 NotebookLM 无消费级 API 而存活的空间 |

## 8. 对"领域学习"最值得借鉴的 Top 8

1. **Mind Map 即导航器：点节点=局部接地对话**——图不是要维护的文档，而是提问的坐标系。落地：概念图每个节点支持"在此子图内提问/生成讲义"，上下文自动限定为该节点+前置闭包；点击行为替代"先选阶段再学"的仪式。
2. **图的"可修复性"做一等公民**（它因不可编辑被骂两年）——节点级对话式修改（"把这个概念拆成两个"）+ 局部重生成（只重建该子树）+ 手动微调，三路并存；改图后受影响卡片/测验**增量更新**。
3. **引用锚点（citation chip→原文高亮）**——讲义卡、测验解析、图上概念描述的关键断言挂源锚点；测后 explain 直达原文段。对抗幻觉批评、建立信任的最便宜手段。
4. **一键多文体综合（5 固定模板+动态推荐+自定义格式沉淀）**——对任一节点/子图提供文体选择器（概念卡/对比表/FAQ/时间线/苏格拉底问答稿），自定义格式存为个人模板库。直接解决"讲义形态单一"，零边际成本。
5. **音频多格式+低维可控参数（Deep Dive/Brief/Critique/Debate × 长度 × 主题聚焦）**——巩固队列接通勤场景：复习到期生成 60 秒 Brief 音频卡；Critique/Debate 用于易混概念对比。**低维可控生成参数优于开放式 prompt**。
6. **Discover sources / Deep Research 的"补料即修图"**——图谱检测到概念稀疏/前置缺失/连续困惑时自动触发"找资料"：推荐 ≤10 带注释摘要的源→一键入源→增量重生成该子图与卡片。修图从"手动编辑"升维成"补证据"。
7. **用"模式预设"取代"阶段仪式"**——一个可开关的 Learning Guide（带你走向答案）+ 自定义 persona/goal 实现教学行为约束，不强迫固定流程。把"规划→学→测"三阶段改为随时可切的模式（导航/讲解/苏格拉底/测验），掌握度只决定**默认推荐**不构成门禁。
8. **精选模板库做冷启动**（Featured notebooks / OpenStax 做法）——高频领域提供"策展源+预配图+预配题"的开箱包；冷启动质量从"用户自己喂料"变成"模板 70%+个性化 30%"。

**反面清单（别学的）**：不可编辑的图；测完即弃（无掌握度/SRS——这是我们的差异化，别被"一键出题"带偏成工具化）；无消费级 API 生态封闭；Deep Research 不必自研到同等深度（可后置）。

## 9. 主要来源汇总

[Google Blog NotebookLM/Gemini Notebook 系列](https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm) ｜ [support.google.com/gemininotebook](https://support.google.com/gemininotebook/answer/16215270) ｜ [Wikipedia](https://en.wikipedia.org/wiki/Gemini_Notebook) ｜ [TechCrunch](https://techcrunch.com/2025/07/14/notebooklm-adds-featured-notebooks-from-the-economist-the-atlantic-and-others) ｜ [9to5Google](https://9to5google.com/2026/06/08/notebooklm-gemini-3-5-antigravity) ｜ [Workspace Updates](https://workspaceupdates.googleblog.com/2025/09/flashcards-quizzes-reports-notebook-lm-google-education.html) ｜ [Fello AI 年度账](https://felloai.com/notebooklm-update-1m-token-chat-goals-saved-history) ｜ [Elephas 限额](https://elephas.app/blog/notebooklm-source-limits) ｜ [jeffsu.org](https://www.jeffsu.org/notebooklm-changed-completely-heres-what-matters-in-2026) ｜ [ACM SIGDOC '25](https://dl.acm.org/doi/10.1145/3711670.3764628) ｜ [Rettberg 2026](https://journals.sagepub.com/doi/abs/10.1177/01634437261452160) ｜ [Washington Post](https://www.washingtonpost.com/technology/2026/02/15/david-greene-google-ai-podcast) ｜ [NC State OIT（独立核验更名）](https://oit.ncsu.edu/2026/07/17/notebooklm-changes-name-to-gemini-notebook)
