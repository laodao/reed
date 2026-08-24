# 互联网 AI 高频使用场景调研（2026-08-23）

> 目的：调研当前互联网上 AI 应用的高频使用场景，据此设计新的高频工作流并发布为应用。

## 一、调研来源（多源交叉验证）

| 来源 | 关键结论 |
|---|---|
| [OpenAI 首次公开 ChatGPT 使用报告（2025-09）](https://www.36kr.com/p/3469029766567300) | 7 亿周活、每周 180 亿条消息；最常用场景：写代码、写作、学习、搜索信息 |
| [Anthropic Economic Index（Claude 3.7）](https://www.anthropic.com/news/anthropic-economic-index-insights-from-claude-sonnet-3-7) | 工作场景占比：编程（软件开发）最高 ~37%、写作/编辑 ~10%、数据分析、客户支持、运营 |
| [艾媒咨询：2025 中国白领 AI 工具使用率](https://www.iimedia.cn/c1020/109733.html) | 办公 AI 助手使用率 57.27%，位列所有 AI 工具类型第一 |
| [近8成职场人每周都用AI工具](https://news.hsw.cn/system/2025/0924/1875301.shtml) | 高频渗透：周报/会议/文案/资料总结等办公场景 |
| [德国研究：ChatGPT 最常见用途](https://www.notebookcheck.net/German-study-reveals-the-most-common-uses-for-ChatGPT-and-other-AI-tools.1173046.0.html) | 常见用途：信息搜索、写作、翻译、编程、学习 |
| [WPS AI 企业版场景](http://plus.wps.cn/blog/p106770.html) | 企业高频：文档写作、会议纪要、PPT、数据分析 |
| [2025年AI应用场景全景盘点](https://developer.aliyun.com/article/1755228) | 内容创作、办公增效、学习辅助、代码生成四大方向 |

## 二、高频场景汇总（按出现频次排序）

1. **写作/文案**：营销文案、公众号/小红书/知乎内容、邮件、报告、润色改写 —— 全源第一梯队
2. **编程/代码**：代码生成、解释、调试、审查 —— OpenAI 与 Anthropic 双报告榜首
3. **学习/教育**：资料总结、知识点讲解、答疑、翻译 —— 个人用户高频
4. **信息检索/总结**：网页摘要、文档总结、会议纪要 —— 办公高频
5. **数据分析**：报表解读、趋势分析、可视化建议
6. **办公效率**：周报/日报、PPT 大纲、简历优化、面试准备
7. **内容创作扩展**：视频脚本、图文、配音、数字人

## 三、与现有 8 个内置应用的差距分析

现有内置应用：每日热点早报📰 / 行业动态周报📈 / 多平台文案生成✍️ / 网页摘要入库📄 / 文章润色改写🪄 / 图文卡片生成🖼️ / 网页正文转写📑 / 视频文案提取🎬

**已覆盖**：新闻采集类、多平台文案、网页工具、图文生成、视频转写。
**缺口（调研高频但未覆盖）**：

| 缺口场景 | 调研依据 |
|---|---|
| 会议纪要生成 | 办公第一高频（录音/文字 → 决议/待办） |
| 周报/日报生成 | 职场高频（流水记录 → 结构化周报） |
| 邮件助手 | 办公高频（要点 → 正式邮件，多语气多用途） |
| 简历优化 + 面试准备 | 求职高频 |
| 代码审查/解释/重构 | Anthropic 榜首场景 |
| 翻译本地化 | 个人+办公高频（多语言互译 + 本地化润色） |
| 学习笔记/知识总结 | 个人用户高频（资料 → 结构化笔记/复习卡） |
| 数据分析洞察报告 | 办公高频（数据 → 洞察 → 报告） |

## 四、设计原则

- 全部复用现有工作流引擎节点（llm-chat / translate / web-search / human-review / report / save-asset / stt 等），**不新增后端能力**，纯 JSON 定义发布
- 每条工作流：开始（用户输入）→ AI 处理 → 人工审核（可选）→ 报告输出 → 保存资产，符合本应用"深度工作流"形态
- 严禁写死/假数据：所有 prompt 走真实模型调用，输入来自用户表单
- 数据落库：报告与成果存资产库，可复用

## 五、第二轮调研（开拓思路：最新方向与热门行业）

### 5.1 深度调研报告（Deep Research）——2025-2026 最火方向

| 来源 | 关键结论 |
|---|---|
| [OpenAI Deep Research / Perplexity / NotebookLM 对比](https://radarai.top/articles/2026%e5%b9%b4ai%e7%a0%94%e7%a9%b6%e5%8a%a9%e6%89%8b%e5%af%b9%e6%af%94perplexity-notebooklm-chatgpt%e6%80%8e%e4%b9%88%e9%80%89) | 深度研究=规划研究步骤→多轮联网搜索→信息整合→结构化报告，已成标配 |
| [通义 Qwen-Deep-Research](https://help.aliyun.com/zh/model-studio/qwen-deep-research?mode=pure) | 自动规划、多轮搜索、生成结构化研究报告 |
| [deep-research 开源 Skill](https://github.com/hoolulu/deep-research) | 一条命令出券商级深度调研报告 |
| [langgraph-deepresearch](https://github.com/ditingdapeng/langgraph-deepresearch) | LangGraph 实现：搜索→批判→再搜索→综合 |
| [华为 DWS RAG 生成行业调研报告](https://support.huaweicloud.com/bestpractice-dws/dws_05_0153.html) | 企业级 RAG + 行业报告生成 |

**设计要点**：开始（主题/范围/深度）→ 拆解研究子问题（llm-chat jsonMode）→ 多轮搜索（loop + web-search）→ 逐轮摘要积累 → 综合结构化报告（llm-chat）→ 报告 + 存资产。完全可用现有节点实现。

### 5.2 电商视觉/内容生产全链路——热门商业化方向

| 来源 | 关键结论 |
|---|---|
| [PSAI 企业版：AI 全链路电商视觉生产平台](https://ex.chinadaily.com.cn/exchange/partners/82/rss/channel/cn/columns/sz8srm/stories/WS693a5ffca310942cc49961cc.html) | 商品图→主图/详情页/海报/视频，电商视觉全链路 |
| [ecommerce-content-agent（GitHub）](https://github.com/aaadanzghe/ecommerce-content-agent) | 商品理解→文案、图片、短视频全链路 |
| [AI 带货工作流实践](https://cloud.tencent.cn/developer/article/2680745) | 卖点提炼→素材生成→发布 |
| [中小卖家 AI 破局指南](http://www.ec100.cn/detail--6654833.html) | 2026 跨境 AI 决策链 |

**设计要点**：商品信息 + 商品图片 → 卖点提炼（llm-chat）→ 海报/主图生成（image-gen）→ 多平台电商文案 → 保存资产。⚠️ 当前 image-gen 节点 config **不支持参考图**（referenceImages），需扩展节点能力（读 file 输入 → base64 → 传给 ImageService）。

### 5.3 内容转音频/播客（NotebookLM 形态）——独立开发者变现热点

| 来源 | 关键结论 |
|---|---|
| [独立开发者 AI 播客矩阵月入10万](https://m.toutiao.com/w/1839849756149767/) | 文章→NotebookLM 双人对话脚本→AI 数字人+配音→播客矩阵 |
| [NotebookLM Audio Overview 指南](https://notebooklm.hk/zh-tw/blog/notebooklm-audio-overview-guide/) | 资料→音频概览（双主持对话） |
| [AI 副业增收书籍](https://www.tenlong.com.tw/products/9787115693112) | AI 音频/播客是副业热点赛道 |

**设计要点**：文章/资料 → 提取要点（llm-chat）→ 生成双人对话脚本（llm-chat jsonMode）→ 逐角色 TTS 合成音频（loop + tts）→ 保存音频资产。本应用有 tts/voice-clone/stt 能力，可完整实现。

### 5.4 垂直领域智能体渗透图谱（北航&清华）

来源：[垂直领域智能体2026：从编程到医疗、从法律到电商的全面渗透图谱](https://www.sgpjbg.com/labelsyh/chuizhilingyuzhinengti/1/6707718.html)、[2026 智能体进化简史](https://www.sgpjbg.com/info/b224e295a123866bd177aa525e822b09.html)

高频渗透领域：编程、法律（合同审查/文书）、医疗健康（病历/报告解读）、教育（教案/学习）、金融（财报/研报）、电商（选品/素材）、运营（数据分析）。

### 5.5 新增场景候选（第二轮拓展）

| 场景 | 定位 | 可行性（现有节点） |
|---|---|---|
| 🔍 行业深度调研报告 | 2026 最火形态，用户举例方向 | ✅ 全部现有节点 |
| 🛍️ 电商商品海报/主图 | 用户举例方向，商业化强 | ⚠️ 需扩展 image-gen 参考图 |
| 🎙️ 文章转播客（双人对话音频） | NotebookLM 形态变现热点 | ✅ tts 现有 |
| 🧾 合同审查 | 法律垂直高频 | ✅ 全部现有节点 |
| 📈 竞品分析报告 | 商业决策高频 | ✅ 全部现有节点 |

## 六、待确认

13 个候选应用（8 基础 + 5 拓展）设计详情见 `tasks/2026-08-23-ai-high-frequency-workflow-apps-design.md`，用户确认后再实施。

## 七、方案审查记录（2026-08-23 用户要求 review）

- **代码审查**：用户确认真实场景是 git 增量 review（未评审提交），全量 review 排二期。方案已完整记录（git-log/git-diff 节点 + simple-git + Rubric 维度体系），**暂缓实施**。
- **12 场景深度审查**：发现 7 类共性问题（C1 条件分支伪代码不可行 / C2 表单互斥必填缺失 / C3 parallel-merge 误用 / C4 长文本超限 / C5 嵌套循环禁止 / C6 文本转数组 / C7 select-dynamic 来源不足）。
- **审查结论**：✅ 周报/邮件/简历/数据分析可行；⚠️ 会议纪要/行业调研需补分支；❌ 学习笔记/竞品分析/文章转播客需 redesign 或降期。
- **用户确认移除 2 个**：6 翻译（已有完整「文档翻译」应用：Translate.vue + 文本/文件翻译 + 翻译历史，重复）；12 合同审查（难度大不做）。
- **学习笔记重定位**：用户质疑"结构化笔记+复习题+记忆卡之后在哪阅读"（无阅读器闭环）→ 重定位为「知识提炼存日记」：对一篇或多篇文章做读后感/书评式提炼，保存到日记（/diary 即阅读器，已有导出能力）。需新增 save-diary 节点（DiaryService.createEntry 服务层已就绪）。
- **最终候选 11 个 → 可实施 10 个**（代码审查暂缓）：第一批 6 个零依赖（周报/邮件/简历/数据分析/会议纪要/行业调研）+ 第二批 3 个（知识提炼存日记新增 save-diary/竞品单层 loop/电商海报扩 image-gen）+ 第三批二期（播客/代码审查）。
- **第二批已实施（2026-08-23）**：新增 save-diary 节点（DiaryService 薄适配，缺省自动建「AI 提炼」文件夹）+ image-gen 扩展 referenceImages（文件→base64 透传）+ 3 个新内置应用（知识提炼存日记/竞品分析/电商商品海报）已注册，17 个内置应用 TDD 全绿。
- 详情见设计文档 §七 与各场景【审查修订】。
