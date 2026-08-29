# 评审遗留问题修复执行记录（2026-08-29）

- **输入**：`tasks/2026-08-29-review-fix-plan.md`（46 条遗留问题的修复计划）
- **执行**：按批逐条修复，每条含回归测试，独立提交（commit 内标注评审编号）
- **结果**：46 条中 **44 条已处理完毕**，2 条按计划留档（#53 架构级延期、#96 历史不可改）
- **全量验证**：`SKIP_PG_TESTS=1 npx vitest run tests/unit` = 2510 通过 / 75 失败；与拉取基线
  `d25fca29` 逐文件对比，**失败集完全一致**（全部为存量环境/串行门问题），0 回归，
  新增/修复测试约 +67 通过

## 修复清单（提交对应）

| 批 | 问题 | 提交 | 测试 |
|---|---|---|---|
| 安全 | #24 ClickHouse SQL/参数移出 URL | d3f122a7 | clickhouse-driver 8 例 |
| 安全 | #100 响应体 50MB 限长读取 | (e0a…后并入) 563f3ccb 前 | response-body 6 例 |
| 安全 | #16 passEnc 不出仓库 DTO 层 | (同上批) | email-account.repo 5 例 |
| 安全 | #75 updateQaPair 失败补偿回滚 | 5ee25f4a | kb-qa-pairs +2 例 |
| 安全 | #77 xlsx 导入 10MB/1 万行上限 | 563f3ccb | kb-qa-pairs +2 例 |
| 引擎 | #37 删除定义刷新事件索引 | 80192fc2 | trigger-scheduler +1 |
| 引擎 | #33/#34/#35 续跑设置/原子取消/审核死线 | ec21fad5 | run-service +3、repo +1 |
| 引擎 | #32 续跑 mergeArrivals + completedSeq | 4edddc10 | run-service +1 |
| 引擎 | #31/#40 互斥部分唯一索引兜底 | 15234200 | repo +1、service +1 |
| 引擎 | #36 cron IANA timezone | 3d9a315d | scheduler +3、triggers +1 |
| 引擎 | #25 连接池指纹复用 | (datasource 批) | pool-cache 5 例 + 2 驱动复言 |
| 多租户 | #72 渠道关闭禁止 startRun | c0ce0549 | app-session +1 |
| 多租户 | #70/#71 内置工作流 Web 端禁改 | d7adb6eb | triggers +2 |
| 多租户 | #42/#43 项目级串行 + 全量可打断 | f5656d80 | agent-workflow +1 |
| 数据 | #74/#69 分享令牌明文清理 + pinned 归零 | (数据批) | sanitize 迁移 2 例 |
| 数据 | #78 kb-folder 死代码删除 + 测试 | (数据批) | kb-folder.repo 4 例 |
| 长文 | #58/#62/#63/#66/#61/#64 | cd20da20 | processor +1、迁移 +1 |
| EP | #92/#56/#57/#48 | (EP 批) | batch-summary 3、orphan 2、parse-asset-refs +2 |
| 工程 | #91 TS6305 解除 + missing_variant | 70cb8859 | vue-tsc 实跑验证 |
| 工程 | #101 form-collect 服务端校验 | (工程批) | loop-review +4 |
| 工程 | #102 MarkdownEditor 失败可见可重试 | (工程批) | 类型检查验证 |
| 工程 | #82/#89 撤销补洞 + token 纯函数测试 | (工程批) | undo-merge 2、token 8 |
| 工程 | #97 Gitea Actions CI + lefthook | (工程批) | YAML 校验 + 本地等价命令 |

## 环境发现与处置

1. **node_modules 缺失 188 包**（cron-parser 等）：`npm install` 补齐，此前 trigger 系测试因模块缺失整体失败。
2. **better-sqlite3 ABI 冲突**：postinstall 按 Electron ABI 编译，测试需系统 Node ABI——
   `npm rebuild better-sqlite3` 切换；Electron 运行前需 `npm run rebuild:electron`。该乒乓是评审 #97 的根因之一。
3. **PG 测试**：宿主 5432 被其他进程占用，`test-pg-up` 无法启动，本批测试按仓库约定跑 SQLite 矩阵。
4. **存量失败 75 条**（与基线一致）：串行门误报家族（scanDueCronTriggers、lw-temp-template 等）、
   tool-call/yt-dlp/tool.service 环境依赖（PathProvider 未注册）、部分渲染组件 spec。
   另：修复过程中发现 typecheck 解除阻断后暴露 **1035 条历史类型错误**，属长期欠账，建议专项清偿后再入 CI 阻断。

## 遗留（计划内留档）

- **#53** prompt 列混存两种格式：架构级中期方案，需存储格式迁移，本期不动。
- **#96** 巨型合并提交：历史事实，无法修复，留档作纪律案例。
- **#74 过期机制**：分享令牌 expiry/轮换策略属产品决策，本期只完成 hash 化 + 明文清理。
- **xlsx CVE**：修复版仅发布于 sheetjs 官方源（npm registry 无升级），以导入上限缓解，升级待 registry 策略。
