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
- **4 项资产/执行记录增强已实施（2026-08-24，commit e95a8eca）**：
  1. 执行记录：运行详情页展示「用户提交数据」+ 节点展开输入/输出
  2. 资产分组（套图）：asset_groups 表 + assets.group_id/group_role；save-asset groupName 归组；资产中心组卡片+画廊
  3. 资产来源跳转：resolveSourceLink 反查 run→app/运行详情，卡片徽标点击跳转（执行历史）
  4. 保存开关：save-asset enabled（false 不落库）+ 电商套图产物方式（仅图片/图文文档）
- 详情见设计文档 §七 与各场景【审查修订】。

---

## 2026-08-24 追加：资产中心套图展示美化（提交 d309c161）

### 背景
用户反馈「套图展示样式太丑陋」。CDP 实测定位三处问题：
1. **画廊零样式**：`.gallery-grid/.gallery-item/.gallery-name` 在 CSS 中完全不存在
   → 默认 block 布局，6 张 1024×1024 原图竖排堆叠，dialog 高 **6444px**（每张 788×1052，滚 6 屏）
2. **组卡片名错误**：显示「promo-5 等」（最新成员文件名 + 等），而非组真实名称「套图-2026-08-24」
   —— 后端 list 不返回组名，前端无从展示
3. **组卡片视觉平淡**：单张封面 + 无样式徽标，无「套图」感

### 改动
- **后端**：`AssetRecord` 加 `groupName` 字段；`AssetGroupRepository.findByIds(ids)` 批量查组；
  `AssetService.listAssets` 对本页 groupId 批量填充组名（缺省 undefined）
- **前端**（AssetCenter.vue）：
  - 组卡片：真实组名 + 右上角「N 张」半透明徽标 + 右下角成员缩略图叠放（除封面外最多 2 张 44px）
  - 画廊重做：`gallery-grid` 网格（minmax(200px,1fr) + 14px gap）、卡片圆角/hover 阴影/统一 1:1 封面、
    组头部信息（组名 + 张数 + 子分类）、封面角标、整卡点击放大预览；dialog max-height 70vh 内滚动
- **测试**：asset-service-group.spec.ts 新增「listAssets 组内资产携带组名」用例（6/6 绿）

### 验证（CDP 实测）
- 修复前：dialog 6444px 高 / 组名「promo-5 等」
- 修复后：dialog **666px** 3 列网格（255×292 卡片×6）一屏尽收 / 组名「套图-2026-08-24」/
  徽标「6 张」+ 2 张缩略图叠放
- 回归：assets 全量 28 测试绿；`tsc -p tsconfig.node.json` 无错；electron-vite build 全绿
- better-sqlite3 切换顺序：kill electron → rebuild:node（跑测试）→ rebuild:electron → 重启 dev

---

## 2026-08-24 追加：电商套图商品一致性修复（提交 28dbbab9）

### 问题
用户反馈：套图中商品（杯子）每张外观都不同，要求「物品不变、只改变场景」。

### 根因排查（双处）
1. **prompt_extend 默认开启**：DashScope 多模态路径 `prompt_extend: request.promptExtend ?? true`
   —— 该功能由 LLM 扩写/改写 prompt，会弱化参考图约束导致主体漂移。
   人像一致性场景（portrait.service）正是显式传 `promptExtend: false` 才保证一致的，
   电商套图工作流未传此参数（image-gen 节点当时不支持）。
2. **提示词设计错误**：plan1 用 DeepSeek 文本模型，**看不到参考图**；
   旧 systemPrompt 却要求「从参考图提取商品外观描述段」——无法执行，
   模型只能凭 productInfo 文字想象，每张图的商品描述自然不同。
   且未要求各 shot 复用同一段商品描述、未加商品一致性否定词。

### 修复
- **image-gen 节点**：支持 `promptExtend` 配置透传（缺省 undefined 保持兼容）
- **ecommerce-poster.json**：
  - img1 显式 `promptExtend: false`（关闭扩写，保留参考图约束）
  - plan1 systemPrompt 重写【商品外观锁定】：基于商品信息写英文外观描述段（40-70 词、
    不臆造细节）、所有 shot 逐字复用同一段、只允许改背景/场景/光线/角度/构图/氛围、
    商品本体禁止改变、生成时以参考图为准、negativePrompt 追加
    different product / changed product / altered design / variant product / wrong color / wrong shape

### 验证
- 测试：image-gen-reference 新增 promptExtend 透传 + 缺省 2 用例（10 绿）；
  builtin-app-templates 7 绿；tsc 无错
- 真实库（C:/Users/daoge/the-bot/the_bot.db）：dev 启动迁移自动同步，
  draft + published 双图确认 img1.promptExtend=false、plan1 含外观锁定/逐字复用/以参考图为准
- 注意：脚本查库需 `DataPathService.getInstance().initialize()`（读 data-path-config.json
  自定义路径）+ apps.source_id 关联 workflow_definitions（非 definition_id）

---

## 2026-08-24 追加：套图支持打开所在目录（提交 b88e78ae）

### 背景
用户反馈「套图为什么不能打开文件夹」：普通资产卡片有 FolderOpened 按钮，
组卡片只有「查看套图 + 删除组」两个按钮，缺打开目录入口。

### 改动
- AssetService.resolveGroupFolderPath(groupId)：组详情 → 首个文件型成员
  （kind=file && storagePath）→ resolveAssetPath；组不存在/无文件成员返回空串
- asset.handler 新增 asset:group-open-folder：Electron shell.showItemInFolder
  定位组文件；Web 端返回不可用错误
- preload/electron-api 增加 assets.groupOpenFolder
- AssetCenter 组卡片操作区改为：查看套图 + 图标区（打开目录 + 删除组）

### 验证
- 测试 8 绿（新增 resolveGroupFolderPath 文件成员/纯文本/不存在组 2 用例；
  注意 Windows 路径断言用 replace(/\\\\/g,'/') 兼容反斜杠）
- tsc 无错、electron-vite build 全绿
- CDP 实测：组卡片有 2 个图标按钮（文件夹+删除）；点击打开目录无错误提示
  （success 分支静默，shell 已定位到套图文件）

---

## 2026-08-24 追加：电商套图场景设计环节深化（提交 5e0f2c3e 等）

### 需求
1. 场景数量可配置：默认值（经验值 4）+ 允许修改（1-8）
2. 先根据商品提示词/商品类型/商品图片设计 n 个场景（文字描述）
3. 场景设计后向用户确认
4. 确认后按场景生成套图
5. 用户确认：场景仅用于「场景图」——其他类型（主图/白底/促销等）仍按「类型×数量」

### 流程（ecommerce-poster.json v2，17 节点）
start(+sceneCount) → scenePlan(llm jsonMode 设计 n 场景) → sceneText(llm 渲染清单)
→ sceneReview(human-review 挂起确认；approve→sceneParse / reject→end)
→ sceneParse(llm jsonMode 文本解析回结构化) → plan1(非场景规划) → loop1(非场景图)
→ loop-done → loop2(场景图) → loop-done → report1 → review1 → condSave → end

- 商品一致性延续：两个 image-gen 都带 referenceImages + promptExtend:false
- 场景图与非场景图归同一组（groupName 套图-{{sys.today}}）

### UX 补缺口（关键）
审核卡片原本不展示送审内容（用户盲批）→ SessionMessageCard 渲染 review
payload（content 字段 markdown 展示），场景确认可见清单。

### 验证
- 测试：场景链结构断言 8 用例 + 双 loop 串联引擎测试 + 模板 7（18 全绿）
- 真实库验证 v2 模板已同步（sceneCount/scenePlan/loop2 均在）
- 注意：template-transform 不支持 each 循环 → 场景清单用 llm-chat 生成文本
- 引擎单测陷阱：fake handler 直接 return 对象会导致引擎 pump 卡住（task 节点
  fire-and-forget 语义），llm-chat 需走真实 handler + mock callAIStream

---

## 2026-08-25 追加：电商套图逐张确认 + 重生成循环（提交 744f03cf）

### 需求
1. 生成后有确认环节：每张图一个确认按钮（icon），点击=保留，未点击=重新生成
2. **必须通用**：流程和表单不能为电商业务写死（用户明确要求）

### 通用能力（非电商专用，任何「生成一批产物逐项确认」可复用）
- **array-merge 节点**：sources 多数组按序拼接 → merged（control 级纯计算，
  不占 runningTasks——否则后续挂起节点 execute 不返回，踩坑已修）
- **form-collect 新增 list-check 字段**：source 模板解析为数组，每行渲染
  label + 确认按钮（icon），默认全确认；提交 {checked, unchecked, items, uncheckedItems}
- **image-gen 输出回传 prompt + 支持 seed**：重生成需原 prompt；seed 固定保一致性
- **save-asset 支持 passthrough**：{字段: 值} 合并进输出（loop 结果携带生成参数）

### 工作流 v3 拓扑
loop1/loop2 生成 → merge1(array-merge 汇总) → check1(form-collect list-check 逐张确认)
→ condCheck(unchecked not_empty?) → regen → loop3(遍历 uncheckedItems) → img3(seed=42)
→ saveImg3(-v2) → report；allOk → 直接 report

### 验证
- 测试 69 全绿（array-merge 4 / list-check 2 / confirm 链引擎 2 / passthrough 2 / 场景链 8 / 模板 7）
- 真实执行 v3：5 张图 → 套图确认取消第 1 张(main-0) → condCheck branch:regen
  → 重生成 main-0-v2(seed 42) → succeeded（138s）
- 注意：node-registry-consistency 的 validateConfig 抽检为既有基线失败（与改动无关）；
  表单 Schema 测试因 array-merge 需补 NODE_CONFIG_FORMS 声明（已修）

---

## 2026-08-25 追加：电商套图三改进（提交 8ee83afa）

### 1. 重生成替换旧图
- 之前：saveImg3 存 -v2 新资产，旧图保留（用户质疑「每次重新生成删旧图了吗」）
- 现在：save-asset 新增 replaceAssetId——保存新资产成功后删除被替换旧资产（含文件）
- saveImg3 配置 replaceAssetId={{loop3.item.assetId}}，同名替换，不再 -v2

### 2. 外观一致性（重点）
- 根因：qwen-image-2.0 参考图遵循度有限（图生图能力弱）
- 方案：qwen-image-edit-max（专为「保持主体换场景」设计的图像编辑模型）
  - provider 注册 edit-max 系列 + isMultimodalImageModel 覆盖 qwen-image-edit 前缀
  - scenePlan/sceneParse prompt 改为【编辑指令式】：「Keep the product in the
    reference image completely unchanged... Only change the background/scene to...」
    ——编辑模型从参考图直接复制商品主体，不再重述外观（重述反而干扰）
- 实测：edit-max 走同一多模态 API 成功；对比图在
  C:\Users\daoge\the-bot\.exp-consistency\（compare.png 三策略对比）

### 3. 编辑器 UX
- 四向锚点：in-left/in-top/out-right/out-bottom（Vue Flow Handle）
- 一键整理：Kahn 分层拓扑布局（同层纵向排列、层间横向推进、环/孤岛回退）
- CDP 实测：23 节点 4 锚点 + 一键整理生效

### 待用户确认
- 看 .exp-consistency 对比图确认 edit-max 商品保持效果是否达标；
  若不理想可再试 wan2.7-image-pro 或调 edit 指令措辞

---

## 2026-08-25 追加：编辑器撤销/连线编辑 + 设置模块主题入库/搜索引擎通用（提交 5c2a3ebd / a1e5b6c9）

### 编辑器（5c2a3ebd）
- 撤销/重做：历史栈快照（Ctrl+Z/Y + 工具栏），变更点自动入栈
- 连线编辑：点击边 → 属性面板（类型/文字/来源/删除）；自定义文字存 data.label
- 连线文字来源：edgeLabel(kind,branchId) 映射，现可覆盖
- CDP 实测：删除边 30→29、撤销恢复 30

### 设置模块（a1e5b6c9）
1. 新闻主题入库：news_topics 表 + 实体/仓库/迁移种子 5 内置主题；
   设置页主题从库读取，自定义主题可改名/删除（内置有来源禁删、删除级联删来源）
2. 搜索引擎通用配置：custom-api 类型 + CustomApiSearchEngine
   （通用 OpenAI 兼容 /chat/completions，可配 apiUrl/Key/model）
   ——任意兼容端点（Perplexity/Exa/DeepSeek 联网等）免写代码接入

### 验证
- custom-api 单测 5 + 迁移 7 绿；tsc/构建全绿
- 真实库 news_topics 5 主题 + 75 来源；IPC custom-api 配置创建/删除走通
