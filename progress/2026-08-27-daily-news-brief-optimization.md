# 每日热点早报工作流优化 · 实施笔记

**日期：** 2026-08-27
**分支：** feat/workflow-engine
**模块：** workflow 引擎/节点、内置应用模板、报告渲染、运行详情展示、知识库

## 用户需求

1. 采集链路：首页 → AI 定位栏目/二级页 → AI 筛选新闻链接 → 爬正文；正文不轻易截断、长度可配置
2. 报告：完整长图渲染、内容不被截断、无滚动条式残缺展示
3. 采集网页信息与最终报告（原始文件，非渲染图）可保存到知识库

## 根因（调研结论）

| 问题 | 根因 |
| --- | --- |
| 首页链接直接当候选 | crawl-news 只抓首页+提取链接，无 AI 筛选环节 |
| 正文截断 | 工作流 extract1.maxLength=8000（太小）；htmlToText 后 slice 切半 |
| 报告内容少/被截断（最严重） | 引擎 handleNodeSuccess 对所有节点输出 truncateOutput（maxOutputChars=64k），且 exec.variables 存截断版；loop.results / report markdown / html 全被截断 |
| 长图被截断 | ElectronDocumentRenderer.htmlToImage 高度上限 20000px |
| 预览残缺/有滚动条 | WorkflowRunDetail.isReportRow 只认 'report'，report-image 节点走 JSON 弹窗 |
| 无法存知识库 | 工作流无 kb-ingest 环节（节点已存在未接入） |

## 实施内容

### 引擎/节点
- `WORKFLOW_DEFAULTS.maxOutputChars` 64k → 512k（工作流 settings 可再覆盖，上限 1M）
- 新增 `crawl-links` 节点：批量 URL → 并发抓取 → extractPageLinks 合并去重（两级采集第二步）；注册 catalog/forms/configMap/news-nodes
- `web-extract`：智能截断 `truncateTextSmart`（句末/段落边界优先，不切半，回退软边界，最后硬切 +「…[已截断]」）
- `kb-ingest`：加 `sourceKey`（(workflow, sourceKey) 幂等 upsert，重复运行覆盖不堆积）+ `passthrough`（循环体内透传正文供下游聚合引用）+ 知识库未选时 skipped
- `DocumentSource.type` 扩展 'workflow'（knowledge-base.types.ts）
- `report-image`：html 存储上限 100k → 1M
- `ElectronDocumentRenderer.htmlToImage`：高度上限 20000 → 100000，渲染稳定等待 250ms
- `CatalogFormField` 类型补齐 `keyPlaceholder`/`valuePlaceholder`（消除既有 kv-list 类型缺陷）

### 内置工作流（daily-news-brief.json 重写）
```
start(topic, sourceIds, customUrls, maxItems, request, templateAssetId, kbId?, model)
→ crawl1(首页) → pick1(AI 定位栏目/二级页, jsonMode)
→ col1(crawl-links 抓栏目页链接) → pick2(AI 筛选新闻 ≤maxItems 条, jsonMode)
→ loop1: extract1(web-extract maxLength=100000) + saveKb1(kb-ingest 存正文, sourceKey=url, passthrough=正文)
→ gen1(生成早报, 引用 {{loop1.results}} 含正文)
→ cond1 → report_default/report_custom(report-image)
→ saveKb2(kb-ingest 存报告 markdown 原始文件, sourceKey=report-主题-日期)
→ save1(save-asset 资产) → notify1 → end
settings.maxOutputChars = 800000
```
内置迁移幂等 UPDATE → 重启自动生效。

### 前端
- `WorkflowRunDetail.isReportRow` 识别 report-image；预览展示完整 PNG 长图（openImageWindow，整图加载无内容截断）

## 验证（TDD）

| 测试 | 结果 |
| --- | --- |
| crawl-links.spec（parseUrlList/handler/目录） | 12 ✓ |
| web-extract-truncate.spec（智能截断边界） | 6 ✓ |
| kb-ingest.spec（sourceKey/passthrough/跳过） | 4 ✓ |
| daily-news-brief-flow.spec（真实引擎端到端：两级采集+知识库保存+kbId 空跳过） | 2 ✓ |
| builtin-app-templates / node-registry-consistency / crawl-news 回归 | ✓ |
| renderer 套件 | 33 ✓（3 个既有失败与本次无关，HEAD 验证） |
| typecheck | 改动零新增错误（1354→1350，keyPlaceholder 修复反而减少 4 个） |

既有失败（与本任务无关，HEAD 复现）：tool.service/tool-call/yt-dlp（工具服务）、knowledge-base.service（better-sqlite3 原生模块/PG 未启动）、renderer 3 文件（Element Plus 未注册）。

## 备注
- 开发过程中检测到工作区存在**外部并发修改**（news-nodes 增加 validateOutboundUrl SSRF 防护等），已核对我的改动未受影响、无冲突。

## 追加（2026-08-28）：三项问题根治

### 问题 1：逐条抓取正文报错（无法成功执行）——根因 + 修复

**根因（实测确认）**：
1. `pick2`（AI 筛选新闻链接）选出的 20 条里 **11 条是 x.com 推文**（55%）——这些来自栏目页内嵌的社交链接；
2. **x.com 无法用普通 fetch 抓取**（实测 `Connect Timeout Error`，国内网络被墙；即使可达也需登录/JS 渲染）→ web-extract 必失败；
3. 原工作流无迭代错误策略：任一迭代失败 → 整个循环失败（"循环体内节点失败且未恢复"），3 次运行全部中断。

**修复（三层，根治 + 兜底）**：
- **源头排除**：`extractPageLinks` 新增 `SOCIAL_MEDIA_HOSTS` 过滤（x.com/twitter/facebook/instagram/youtube/weibo/tiktok/reddit 等），新闻正文采集不再收录社交链接（通用声明式常量 + 3 用例测试）；
- **LLM 引导**：pick2 systemPrompt 明确"只选可抓取正文的新闻文章页；排除社交媒体与短内容平台链接"（双保险）；
- **迭代错误策略（用户要求）**：loop 新增 `errorPolicy: 'fail' | 'skip'`（与 emptyPolicy 平行）。`skip` = 失败迭代跳过（results 记 `{error, skipped:true}`），循环继续跑完其余迭代，整体成功。引擎实现：`ScopeState.loopOwnerId`/`iterationSkippedByPolicy` + `handleNodeFailure` 迭代级失败不 abort + `driveLoop`/`anyScopeFailure`/`anyUnrecoveredFailure` 联动 + 表单/类型/catalog 同步。测试 `loop-error-policy.spec.ts` 4 用例 ✓。
- 内置早报 `loop1.errorPolicy=skip`（JSON 模板 + 已接管的数据库定义均已同步）。

### 问题 2："AI 定位栏目页最多 8 个"语义错误（用户指出）

**确认**：原 pick1 prompt"最多 8 个"是**全局**最多 8 个栏目页——crawl1 合并 158 条链接（9 来源）后一次性挑 8 个，极易集中在 1-2 个网站，其余网站栏目页被漏。用户理解正确（应为**每个来源**最多 8 个）。

**修复（方案 A：LLM 分组输出，改动小、声明式）**：
- pick1 prompt 改为"**按来源分组输出**，每个 source 的 items 最多 8 个"，结构 `[{source, items:[{title,url}]}]`；
- `parseUrlList` 支持嵌套结构展平（`[{source, items|links:[...]}]`，source 作 name 兜底，跨组去重）——通用能力 + 3 用例测试；
- col1（crawl-links）`urls={{pick1.parsed}}` 自动展平，无需改节点配置。

### 问题 3：看不到详细日志

**根因**：节点失败只存一行错误文本（如"网页获取失败: fetch failed"）；循环失败时运行级 error 是笼统的"循环体内节点失败且未恢复"，不展开节点表看不到具体是哪个 URL/节点失败。

**修复**：
- `politeFetch` 错误包装：`请求失败 <host>（<cause>）`（附 URL + 底层原因 DNS/TLS/超时）；
- 引擎循环失败错误信息带上**第一个失败节点名+错误**：`循环体内节点失败且未恢复（抓取正文: 请求失败 x.com（Connect Timeout Error））`——运行详情页顶部 alert 直接可见，无需展开节点表；
- skip 策略下 `results` 占位含具体 error，可从循环输出追溯每条失败原因。

### 验证
- 新测试：loop-error-policy.spec（4）、web-extract-article 追加社交过滤（3）、crawl-links 追加嵌套展平（3）；
- workflow 全套件 416 passed（剩余 7 个失败均为既有：tool-call 3 / tool.service 1 / yt-dlp 3，HEAD 复现）；
- 数据库已接管定义（template_version=0）同步：pick1 分组 prompt、pick2 社交排除、loop1 errorPolicy=skip（draft+published 双图）；
- 应用已重启（dev:debug），新引擎/节点代码生效，迁移正确跳过被接管定义（0 新增）。
