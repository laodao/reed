# 领域共学空间 M2-C 进度记录:周期推进调度器 DlPaceSchedulerService

日期:2026-09-08 · 分支 feat/domain-learning · 依据 m2-implementation-plan.md §2 M2-C

## 完成内容

1. **数据模型**:dl_project 增 `pace_settings` 列(JSON:DlPaceSettings)
   - `migration-utils.ts` 新增 `ensureColumn`/`checkColumnExists`(SQLite PRAGMA table_info + PG information_schema,双方言);
   - `create-domain-learning-tables.ts` DDL 补列 + 迁移尾 ensureColumn(老库升级路径幂等);
   - `dl-project.entity.ts` 补实体列;`dl-project.repository.ts` Row 增 `pace: DlPaceSettings|null`(含非法值归一化 parse),create/patch 支持。
2. **共享类型**:`shared/types/domain-learning.types.ts` 增 `DlPaceSettings` + `DEFAULT_DL_PACE_SETTINGS`。
3. **调度器** `services/dl-pace-scheduler.service.ts`(新增,单例 + 依赖注入):
   - tick 主循环:active 且 pace.enabled 的空间,按 intervalMin 到期(从未推进视为到期)每周期至多推进 1 个任务;概念研究优先,无候选时未解问题开子研究;
   - 候选口径:概念 = 非 group 且尚无卡片(listConceptsNeedingResearch);问题 = dl_question open;
   - 护栏:在途集合去重 + 任务级冷却(cooldownMs 防失败风暴,顺延到下一候选)+ 全局并发帽 + 每空间 lastSpaceRun 周期;
   - 任务 = DlAgentHarnessService.sendMessage('research')(概念带概念名消息;问题带 focusQuestionId/所属概念,message 引问题原文)——动作仍经 dl 服务校验落库;
   - 可注入 timer/clock/tickMs/cooldownMs/maxConcurrent;桌面端自动启停,Web 多租户不启动定时器(IPC 读写配置可用)。
4. **IPC/接线**:dl:get-space-pace / dl:set-space-pace / dl:scheduler-state;handler services() configure runJob(默认模型注入)+ 桌面端 start;preload/channel-map/store 类型与通道同步(UI 开关随 M2-E 露出)。

## 测试与回归

- 新增 `dl-pace-scheduler.spec.ts`(9):normalize 兜底、pace 关/非 active 不推进、到期推进与周期、候选排除 group/有卡、未解问题开子研究、概念优先、冷却顺延、在途去重、pace 仓储往返 —— 真实 sqlite + runJob stub;
- 新增 `migration-utils.spec.ts`(1):老库缺列 → 迁移补列幂等;
- dl 全套 7 文件 37 passed(含 dl-repositories 11);定向 tsc 零新增错误(存量 preload arity/channel-map 等与本次无关)。

## 变更文件

- 新增:`services/dl-pace-scheduler.service.ts`、`tests/.../dl-pace-scheduler.spec.ts`、`tests/unit/core/database/migration-utils.spec.ts`
- 修改:`migration-utils.ts`、`create-domain-learning-tables.ts`、`dl-project.entity.ts`、`dl-project.repository.ts`、`shared/types/domain-learning.types.ts`、`handlers/domain-learning.handler.ts`、`src/preload/index.ts`、`src/web/client/channel-map.ts`、`stores/domain-learning.ts`

## 下一步

- M2-D:ForceGraph 公共抽取(长文 GraphView 与 AtlasGraph 同源化到 components/common/ForceGraph.vue)。
