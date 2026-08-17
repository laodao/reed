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

## 片5 ✅ 完成（6bc079e1，80/80 全绿）

全部 21 节点就绪（ai-nodes 10 个 + task 4 个 + control 9 个 - delay 归 control）；
createFullNodeRegistry 工厂 + assertNodeRegistryConsistent 启动自检；
8 处领域事件埋点（kb/image/translation/voice）；事件目录 payloadKeys 对齐。
遗留优化：kb-retrieve 取消为边界检查点语义（HTTP 级中断需 KB search 透传 signal）。

## 片6 ✅ 完成（0000bf5c，87/87 全绿）

cron 调度器（grace 错过跳过/只触发时写库/recomputeOne）+ 事件触发（内存索引/
同租户匹配/payload 过滤）+ workflow-boot 双端装配（boot 恢复/调度器/审核超时
ticker）+ Electron/Web 启动接线。

## 片7-8 待做

- 片7：workflow.handler.ts（wf: 19 通道）→ electron initIpcHandlers + web
  register-channels 双注册 → preload workflow 命名空间 + channel-map 严格同步
  → stores/workflow.ts + WorkflowList.vue + WorkflowRunDetail.vue + 路由/菜单
- 片8：@vue-flow 四包 + WorkflowEditor.vue 组件树 + catalog 驱动配置面板 +
  TriggerPanel（previewCronExpression）+ PublishDialog + 回放画布
