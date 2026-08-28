# 吃瓜热点事件分析报告 工作流（2026-08-28）

## 需求

开发一个工作流：输入互联网热点事件关键词 → 输出一份给吃瓜群众的**有吸引力的事件分析报告**。
用户要求参考网上网友的吃瓜文章与事件分析图风格，可做多个模板；并以最近的**孙宇晨 × 景甜事件**（2026-08-27/28 热搜：孙宇晨发长文《我的女友景甜》→ 起诉退 3000 万彩礼 → 景甜回应"不会为钱出卖爱情，更不会出卖灵魂"→ 孙宇晨回应"存在虚构成分"，含代孕/订婚/彩礼细节与"Claude 全责"梗）为例实际执行一遍。

## 设计（用户确认：按此开工，示例默认娱乐小报风）

内置工作流「[内置] 吃瓜热点事件分析报告」（category 娱乐八卦，app「吃瓜热点速报」🍉）：

```
start（事件关键词/报告模板/搜索引擎/抓取篇数/吃瓜偏好/知识库/模型）
  → search1 web-search（{{event}}） → search2 web-search（{{event}} 回应 最新进展）
  → merge1 array-merge（合并两组结果）
  → pick1 llm-chat jsonMode（AI 筛选高信息量报道，排除社交/短视频页，同 URL 去重，最多 maxItems 条）
  → loop1 loop（emptyPolicy=skip, errorPolicy=skip）
      └→ extract1 web-extract（onError=skip, maxLength=20000）→ loop-back
  → analyze1 llm-chat jsonMode（结构化分析：概述/时间线/人物/表态/争议/热评与梗/疑点/来源）
  → gen1 llm-chat（按所选模板风格写报告 markdown，事实/自述/网传严格区分）
  → report1 report-image（templateId={{start.template}} 动态版式）
  → cond1 condition（kbId 空 → 跳过知识库）
      ├→ saveKb1 kb-ingest（有 KB 分支）
      └→ save1 save-asset（text/吃瓜报告 分类）
  → notify1 → end
```

## 新增 3 个长图排版模板（DOCUMENT_TEMPLATES 注册表，新增场景 = 加模板对象，不改服务）

| templateId | 名称 | 风格 |
|---|---|---|
| `gossipTabloid` | 吃瓜·娱乐小报 | 港媒大字报：品红+明黄警示色、爆点标题块（黄底黑字+阴影）、锯齿饰边、感叹引用、深色页脚 |
| `gossipTimeline` | 吃瓜·事件梳理 | 专业事件分析图：藏青渐变头+琥珀色条、左竖线章节标题、信息卡片式分节 |
| `gossipArticle` | 吃瓜·公众号文 | 公众号长文：米白底橙字、卡片式小节、虚线分隔、引用块 |

- report-image 表单 templateId 选项同步 +3（防漂移测试覆盖）。
- 资产分类新增「吃瓜报告」（previewMode=report + gossipTabloid 渲染，迁移按 name 幂等，老库自动补种）。

## 引擎/渲染层改动（通用能力，非业务写死）

1. **web-search 节点引擎解析链**（配置驱动）：
   - `searchConfigId` 给出时自动解析其 `templateId`（原来必须显式 engineType）；
   - 支持 `quick:` 前缀 = 免 Key 快速引擎（百度/必应/Google 网页抓取型），无需用户配置；
   - 修复隐藏 bug：默认引擎回退检查了不存在的 `def.engineType` 字段（应为 `templateId`），导致"留空=系统默认"从未生效 → 现修复。
2. **select-dynamic 新增 `searchEngineConfigs` 数据源**（RunInputForm / NodeConfigPanel 双端）：免 Key 快速引擎（quick: 前缀，优先）+ 已配置引擎（值=配置 id），表单编辑器可选用。
3. 事件素材调研：确认孙宇晨景甜事件为真实热点（起诉 3000 万彩礼、长文、双方回应、代孕争议、"Claude 全责"梗），报道源包括澎湃/腾讯/新浪/凤凰/头条/星岛/三立等。

## 测试（TDD）

- `gossip-event-report.spec.ts`（新，9 例）：图结构校验、start 输入声明、搜索×2 互补、循环错误策略、分析/生成拆分、动态 templateId、KB 条件分支、变量引用全解析。
- `web-search-node.spec.ts`（新，6 例）：引擎解析优先级（engineType > configId > quick: > 默认）、未配置报错、429 透传。
- `document-templates.spec.ts`：EXPECTED_IDS +3（10 套）、报告族 +3、动态 templateId 防漂移检查、start 模板选项全部注册。
- `builtin-app-templates.spec.ts`：17 → 18 份模板；select-dynamic 合法源 + `searchEngineConfigs`。
- `create-builtin-apps.spec.ts`：17 → 18（工作流+应用）。
- `create-asset-categories.spec.ts`：9 → 10 个内置分类。
- 结果：workflow 目录 518 测试仅剩 7 个已知前置失败（tool-call 3 / tool.service 1 / yt-dlp 3，git stash 验证过与本次无关）；migrations 86 全绿；tsc --noEmit tsconfig.node.json 干净。

## 实跑验证（孙宇晨 × 景甜）

- 首次运行失败：智谱 AI 搜索 API **HTTP 429**（用户 API key 限流/配额，实测持续 429）→ 工作流改用免 Key **百度**引擎（`quick:baidu`）重跑。
- 第 1 次成功运行：`wfrun_1787889650266_fl4qnrsti`（234s），产出娱乐小报风报告（标题"🚨 爆！孙宇晨状告景甜索 3000 万彩礼！"）+ 长图 PNG（750px，1.5MB）+ 资产入库（asset_1787889884497_s9y9374r0，subCategory=吃瓜报告）。
- **发现并修复小瑕疵**：analyze1 的 sources 丢 URL（循环 results 只含正文，extract1 输出无 url 字段）→ 把含 URL 的链接清单 `{{pick1.parsed}}` 一并传给 analyze1（sources.url 原样复制）+ gen1（信息来源禁止写成 #）。定义已同步（template_version=1）。
- 第 2 次运行（验证来源链接修复）：`wfrun_1787889990276_1pjupap7v`（282s）✅ 成功——报告标题「💥 币圈大佬怒索 3000 万！景甜被诉退彩礼？文末一行字笑死人！」，4424 字，信息来源全部带真实 URL；长图 `workflow-reports/wfrun_1787889990276_1pjupap7v_report1.png`（1.66MB）；资产 `asset_1787890272347_to19rlwjk`。

## 实跑结论

工作流端到端跑通（两次运行均 succeeded，全程 ~4-5 分钟）：
- 搜索 → AI 筛选 5 篇高信息量报道（梳理文/当事人回应/长文剖析/商业版图）→ 逐条抓正文（空结果自动容错）→ 结构化分析（时间线 6+ / 人物 4 / 表态 4 / 争议 2 / 梗 3 / 疑点 4 / 来源 5）→ 小报风报告 + 长图。
- 报告质量：标题党标题、事实/当事人自述/网传严格标注、「Claude 背锅」「我依然眼光不行」「纯属虚构」等梗收录、可点击信息来源。

## 待办

- [x] 设计确认
- [x] 模板 + 表单 + 分类
- [x] 工作流 JSON + 注册
- [x] 测试全绿
- [x] 实跑（百度引擎，两轮成功）
- [x] 来源链接修复并重跑验证
- [x] 向用户展示报告 markdown + 长图
- [ ] 提交并推送（含上一批未提交的循环错误策略/社交过滤修复）
