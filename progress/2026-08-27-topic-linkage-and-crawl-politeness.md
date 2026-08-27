# 主题联动选源 + 爬取礼貌（随机间隔/同站单线程）· 实施笔记

**日期：** 2026-08-27
**分支：** feat/workflow-engine
**模块：** 表单引擎（RunInputForm）、工作流类型、抓取节点、共享抓取工具

## 用户需求（确认后实施）

1. 每日热点早报：选择主题后自动选中该主题下所有新闻来源（**切换即覆盖**，用户可再手动增减）
2. 爬取新闻：随机间隔时间（默认 0.8~2.5s）+ 同一网站单线程（**全部抓取节点**应用）
3. **必须通用**：不写死在流程引擎/表单引擎，由工作流数据声明/配置驱动

## 方案与实现

### 需求 1：声明式表单联动（表单引擎通用机制）
- `WorkflowStartInput` 增加可选 `linkage?: { watch: string; matchBy: string }`（类型扩展，工作流数据声明）
- 纯函数 `src/renderer/src/utils/form-linkage.ts`：`resolveLinkageValues`（按选项元数据过滤）/ `linkageFieldValue`（multi 全选 / 单选填值 / 源空清空）
- `RunInputForm.vue` 通用实现：扫描字段的 `linkage` 声明 → watch 源字段值 → 过滤目标字段选项自动填充；动态选项缓存**保留完整元数据**（如 newsSources 的 topicId）供过滤
- `daily-news-brief.json` 的 sourceIds 字段加 `"linkage": { "watch": "topic", "matchBy": "topicId" }`（数据声明，代码零业务写死）
- 引擎零改动

### 需求 2：爬取礼貌（节点侧共享工具，非引擎逻辑）
- 新建 `src/core/modules/workflow/nodes/http-politeness.ts`：`politeFetch`——按 host 信号量限并发（默认 1=同站单线程）+ 请求前随机间隔；**由各节点在 execute 内显式调用**（引擎调度/执行器不感知不介入）
- `crawl-news` / `crawl-links` / `web-extract` 统一接入 politeFetch（保留各自 SSRF 防护/超时/取消语义）
- 参数走标准配置链：节点 config（delayMsMin/delayMsMax/hostConcurrency）→ WORKFLOW_DEFAULTS（800/2500/1）→ WORKFLOW_LIMITS（60s/10）
- 节点 config 类型 / catalog / 表单（「爬取礼貌」分组）同步更新

## 验证

| 测试 | 结果 |
| --- | --- |
| form-linkage（过滤/清空/多选/单选） | 7 ✓ |
| http-politeness（同站串行/异站并行/并发上限/随机间隔/默认值） | 6 ✓ |
| crawl-links / crawl-news / daily-news-brief-flow / builtin-app-templates 回归 | ✓ |
| typecheck | 我的改动零新增错误 |

既有失败（与本次无关）：tool.service/tool-call/yt-dlp。

## 备注
- 用户确认设计：联动"切换主题即覆盖"、间隔 0.8~2.5s、全部抓取节点
- 礼貌抓取明确为**节点内显式调用**（工具放 nodes/ 目录，非引擎层）
- 期间修复：PowerShell 改写测试文件导致编码损坏（中文乱码）→ 用 write 重写恢复
