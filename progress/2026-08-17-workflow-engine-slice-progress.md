# 工作流引擎开发进度（自主推进记录）

> 日期：2026-08-17（用户离线期间自主推进）
> 分支：feat/workflow-engine（自 master 分出，含此前 6 个整理提交）
> 依据：`progress/2026-08-16-workflow-engine-feature-design.md`（功能终稿）+ 已批准实施计划

## 已完成切片（每片 TDD + 测试全绿 + 评审后提交）

| 片 | 提交 | 测试 | 关键内容 |
|----|------|------|----------|
| 1 | `5aaa7ff5` | 29 | 领域类型 + 21 节点目录 + 图校验器（环检测/循环体支配定义/显式并行/嵌套禁止） |
| 2 | `a5198419` | 19（sqlite） | 三表 Entity/Repository/双语种迁移 + 双端接入 + 跨租户扫描 |
| 3 | `e69df878` | 57 | 引擎核心：pump 调度/就绪判定/重试/fail边恢复/截断/看门狗/依赖倒置端口 |
| 4 | `02f92cd6` | 72 | 作用域架构 + 循环 + 审核挂起/恢复/超时 + 取消 + 续跑装配 |

片3 做了完整 8 角度 code-review（20 项发现全部处理，含 5 个时序缺陷：
终态返回值不一致、DB 异常悬死互斥、模板二次解析注入、终态后副作用、看门狗缺失）。

## 关键语义决策（已固化在代码/测试）

1. 显式并行：仅 parallel 节点可多条 normal 出边
2. 循环体边界=支配节点定义（graph-topology 单一实现，校验器/引擎共用）
3. 嵌套循环 V1 禁止；续跑时未完成循环整体重跑
4. 作用域架构：每迭代独立 Scope，变量解析局部优先回退根
5. 驳回无 reject 边 ⇒ run failed；审核等待不计看门狗时长
6. 声明的条件分支必须有出边（防静默吞分支）
7. varchar 不带 length（schema-drift 兼容，项目惯例）

## 环境备忘

- better-sqlite3 双 ABI：跑测试用 `npm run rebuild:node`，跑应用前 `npm run rebuild:electron`（当前已恢复 electron 模式；仓库测试需再切）
- PG 测试需 `PGHOST` 等环境（SKIP_PG_TESTS=1 跳过）
- 既有失败与本次无关：panorama 等 better-sqlite3 ABI 相关、episode-production 资产服务若干

## 片5 进行中（5e3bcb9d 已交付上半，77/77 全绿）

已交付：definition/run 服务（互斥/并发/续跑/boot恢复）、makeEngineDeps 端口适配、
domain-event-bus、首批任务节点（delay/http-request/llm-chat/human-review）。

片5 剩余（下轮继续）：
- 9 个 AI 任务节点：kb-retrieve/kb-ingest/web-search/translate/image-gen/tts/stt/lw-generate-chapter/lw-polish
- 8 处领域事件埋点（kb/image/translation/voice 终态处各一行 safePublish）
- KnowledgeBaseService.search 加可选 signal（向后兼容）
- 全目录一致性测试（21 节点 handler 与 catalog 对齐）

片6-8：cron 调度器+事件触发接线 / IPC 19 通道+前端列表详情 / Vue Flow 编辑器
