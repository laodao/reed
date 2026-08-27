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
