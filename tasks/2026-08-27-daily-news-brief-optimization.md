# 每日热点早报工作流优化 · 设计

**日期：** 2026-08-27
**分支：** feat/workflow-engine
**模块：** workflow 引擎/节点、内置应用模板、报告渲染、运行详情展示、知识库

## 用户需求

1. **采集链路**：不要简单抓网站首页链接 → 应为「抓首页 → AI 选与主题相关的二级页/专栏首页 → AI 从专栏页选新闻链接 → 系统爬正文」。正文不应轻易截断，长度可配置。
2. **报告输出**：长图应为完整渲染（内容少/被截断/有滚动条均视为缺陷）。
3. **知识库**：每次采集的网页信息与最终报告（原始文件，非渲染图）可保存到知识库。

## 现状根因（代码调研结论）

| 问题 | 根因 |
| --- | --- |
| 首页链接直接当候选 | `crawl-news` 只抓首页 + `extractPageLinks`，无 AI 筛选环节 |
| 正文截断 | 工作流 `extract1.maxLength=8000`（太小）；`htmlToText` 后 `slice` 切半 |
| 内容少/被截断（最严重） | 引擎 `handleNodeSuccess` 对**所有节点输出** `truncateOutput(maxOutputChars=64k)`，且 `exec.variables` 存截断版——loop.results、report markdown/html 全被截断 |
| 长图被截断 | `ElectronDocumentRenderer.htmlToImage` 高度上限 `Math.min(20000, …)`；report-image 的 `html.slice(0,100_000)` |
| 预览有滚动条/看不到图 | `WorkflowRunDetail.isReportRow` 只认 `nodeType==='report'`，`report-image` 节点走 JSON 弹窗（有滚动条） |
| 无法存知识库 | 工作流无 kb-ingest 环节（节点已存在，未接入） |

## 方案

### A. 新增 `crawl-links` 节点（批量 URL → 页面内链接）
- config：`urls`（数组，模板）、`maxLinks`（每页上限，默认 50）、`maxConcurrent`（默认 5）
- 行为：并发 fetch → `extractPageLinks`（复用）→ 合并去重
- 输出：`links [{title,url,source}]`、`count`、`failedUrls [{url,error}]`
- 注册：catalog + forms + configMap + NEWS_NODE_HANDLERS

### B. 截断修复
1. `WORKFLOW_DEFAULTS.maxOutputChars` 64k → 512k（工作流可再覆盖，上限 1M）
2. `web-extract`：截断按段落/句子边界（不切半）+「…[已截断]」标记；maxLength 表单可配（工作流配 200_000）
3. `report-image`：html 截断 100_000 → 1_000_000
4. `ElectronDocumentRenderer.htmlToImage`：高度上限 20000 → 100_000；渲染稳定等待

### C. 知识库保存（复用 `kb-ingest` 节点）
- `DocumentSource.type` 扩展 `'workflow'`
- `kb-ingest` 增加可选 `sourceKey`：传 `source:{type:'workflow',id:sourceKey}` → `addDocument` upsert（同 key 覆盖，多次运行不堆积）
- 工作流：start 增加 `kbId`（select-dynamic knowledgeBases，可选）；loop 内 `saveKb1` 保存网页正文；报告生成后 `saveKb2` 保存 markdown 原始文件

### D. 工作流定义重写（daily-news-brief.json）
```
start(topic, sourceIds, customUrls, maxItems, request, templateAssetId, model, kbId?)
→ crawl1(crawl-news, maxLinks=50)
→ pick1(llm-chat): 首页链接 → 与主题相关的专栏/二级页 JSON 数组
→ col1(crawl-links): 抓专栏页 → 新闻链接
→ pick2(llm-chat): 选有价值新闻（≤maxItems 条，JSON 数组）
→ loop1: extract1(web-extract, maxLength=200000) + saveKb1(kb-ingest, sourceKey=url)
→ gen1(llm-chat): 生成早报
→ cond1 → report_default/report_custom(report-image)
→ saveKb2(kb-ingest, sourceKey=report-主题-日期): 报告 markdown → 知识库（原始文件）
→ save1(save-asset): 图片资产（保留）
→ notify1 → end
settings.maxOutputChars = 800_000
```

### E. 运行详情报告展示
- `isReportRow` 同时识别 `report-image`
- 预览：桌面端展示完整 PNG 长图（`local-image://`/文件读取，无滚动条）；Web 端降级 markdown
- `reportToPdf` 对 report-image 同样可用（markdown 源）

## 测试
- `crawl-links` 节点单测（extractPageLinks 复用）
- `web-extract` 智能截断（句子/段落边界）单测
- `kb-ingest` sourceKey upsert 测试
- node-registry-consistency（自动覆盖新节点）
- builtin-app-templates 校验（JSON 结构合法）
- 引擎集成：新链路端到端（mock fetch）

## 生效
- 内置应用迁移幂等 UPDATE → 重启应用自动更新工作流图
- 需要重新构建 + 重启
