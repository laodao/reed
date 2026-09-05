# 2026-09-04 · 吃瓜热点事件分析报告：多平台文章 + 多平台视频脚本

## 需求
用户希望「吃瓜热点事件分析报告」工作流：
1. 文章端能同时生成**微信、今日头条**等媒体文章（原只有公众号/小红书/微博/通用，缺头条）。
2. 视频端能**同步生成抖音、B站、快手、视频号、YouTube**等平台的视频脚本（原只有 1 份通用竖版脚本，不区分平台）。

用户确认平台范围：文章 = 微信公众号/今日头条/小红书/微博；视频 = 抖音/B站/快手/视频号/YouTube + 保留通用脚本。要求「直接实施，但要保留现有版本、确保可回退」。

## 改动
### 文件
- `src/core/database/migrations/builtin-apps/gossip-event-report.json`（内置工作流模板）
- `tests/unit/migrations/create-builtin-apps.spec.ts`（新增 1 条断言覆盖新能力）

### JSON 变更
1. `start.platforms` 选项：`公众号` → `微信公众号`，新增 `今日头条`；defaultValue `["微信公众号","今日头条"]`。
2. `start` 新增 `videoPlatforms`（多选）：选项 `抖音/B站/快手/视频号/YouTube`，defaultValue `["抖音","B站"]`。
3. `copyN`（文章文案）提示词：新增 `今日头条` 分支（资讯流、适标题党、800-2000 字），`公众号` 分支改名 `微信公众号`。
4. 新增视频脚本平台循环：`loop3`（listExpression `{{start.videoPlatforms}}`）→ `scriptN`（按 `{{loop3.item}}` 区分抖音/B站/快手/视频号/YouTube/通用）→ `saveScriptN`；保留原 `script1/saveScript1` 通用脚本。
5. 节点数 23 → 26，边 27 → 32（新增 e28–e32）。

`copyN` 提示词平台分支：微信公众号/今日头条/小红书/微博/通用。
`scriptN` 提示词平台分支：抖音（竖屏快切）/B站（中长视频分镜）/快手（极短大字幕）/视频号（私域温和）/YouTube（中长视频+章节）/通用。

## 运行库同步
- 运行中 app 的 `builtin_def_gossip-event-report` 定义已从旧图（23 节点）同步为新图（26 节点），`template_version` 保持 0（接管态，固定新版，不随模板覆盖）。
- 同步脚本：`scripts/sync-gossip-db.py`（可复用）。

## 回退
- JSON 模板备份：`scripts/backup-gossip-20260904-205613.json`
- 运行库旧图备份：`scripts/backup-gossip-db-20260904-205918.json`
- git：`src/core/database/migrations/builtin-apps/gossip-event-report.json` 已纳入版本管理，可 `git checkout` 回退模板；运行库旧图可从上述备份文件恢复。

## 测试
- 新增断言 `吃瓜工作流支持多平台文章 + 多平台视频脚本（头条/视频平台循环）`：校验 `videoPlatforms` 输入、平台选项（含今日头条/微信公众号）、`loop3/scriptN/saveScriptN` 节点、`copyN` 含「今日头条」、`scriptN` 含 `{{loop3.item}}`。
- ⚠️ 本环境无法跑 `better-sqlite3` 相关 vitest：`NODE_MODULE_VERSION 119`（Electron 内置 Node）vs `127`（系统 CLI Node）不匹配，为既有环境问题，需在匹配 Node（或 `npm rebuild` 后）执行 `npx vitest run tests/unit/migrations/create-builtin-apps.spec.ts`。JSON 结构已用 `scripts/validate-gossip.py` 独立校验通过（26 节点/32 边）。

## 使用
- 运行工作流时，`自媒体平台（多选）` 现在含微信公众号/今日头条/小红书/微博/通用，勾选即多份文章。
- `短视频平台（多选）` 含抖音/B站/快手/视频号/YouTube，逐平台生成一份脚本；`短视频时长` 继续控制通用脚本时长。
- 所有自媒体产出（文章/长图/脚本/报告）统一打 **`自媒体文案`** tag（跨「图片/文本」检索：资产中心搜索"自媒体文案"或查看 `#自媒体文案` 标签），且保留各自子分类（自媒体文案/吃瓜长图/短视频脚本/吃瓜报告）。

## 自媒体文案 tag（2026-09-04 追加）
- 给 gossip 工作流 5 个 save 节点（save1/saveImg1/saveCopyN/saveScript1/saveScriptN）的 `tags` 统一追加 `自媒体文案`。
- 运行库已同步；并给存量 `tags LIKE '%吃瓜%'` 的 59 个资产补上该 tag（幂等）。
- 因一个资产仅一个子分类，无法让"图片长图"同时归入「吃瓜长图」与「自媒体文案」，故采用**统一 tag** 实现跨类归属（文章/脚本/报告为文本、长图为图片，均带同一 tag）。

## 背景介绍 + 5 分钟时长（2026-09-04 再增强）
- 用户反馈：脚本太简单、希望 5 分钟长脚本；报告缺背景介绍。
- 改动：
  - `videoDuration` 选项新增 **5 分钟（300 秒）**。
  - `analyze1` 结构化分析新增 **`background` 字段**（事件主体简介/所属行业与时代背景/为何引发公众关注）。
  - `gen1` 报告新增 **「背景速览」** 小节（依据 background，让不了解的读者能跟上）。
  - `script1`/`scriptN` 口播**按时长充实**（约「时长秒数×4」字，如 300 秒约 1200-1500 字），并**加入开场背景铺垫**；`scriptN` 注明时长以用户设定为准、设定 300 秒则按 5 分钟充实。
- 重新运行星宇事件验证（videoDuration=300）。

## 实测验证（2026-09-04 · 星宇股份事件）
- run `wfrun_1788527209326_d8knt2ayc` 状态 **succeeded**，完整产出并全部存入资产库：
  - 文章：微信公众号（研报风）+ 今日头条（资讯流风），风格分明。
  - 视频脚本：通用脚本 + **抖音**（60s 竖屏快节奏）+ **B站**（中长分析、口径对比卡、三连引导），按平台差异化。
  - 报告 markdown、报告长图 PNG。
- 环境说明：当前模型（DeepSeek）每轮 LLM 调用明显偏慢（数分钟），完整 run 需较长等待；`qwen3.5-flash` 在本环境 `pick1` 卡死、`cancelRun/getRun` 存在 scoped SQL 缺陷（`Too few parameter values`），均非工作流本身问题。
