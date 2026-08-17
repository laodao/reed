# 工作流引擎 片1-6 全面评审报告

> 日期：2026-08-17 ｜ 评审方式：5 维度并行评审代理（完整性/架构/扩展性、代码质量、字面量、基础设施一致性、重复实现）+ 逐项人工核验
> 结论：44 项发现（2 critical / 9 high / ~20 medium / 其余 low）。**critical + high 已全部修复并回归（88/88 全绿）**；medium/low 列入待办。

## 已修复（本轮提交）

| # | 级别 | 问题 | 修复 |
|---|------|------|------|
| 1 | critical | 看门狗先 abort() 后查 suspended——污染挂起运行的取消信号，批准后续驱被误转 cancelled | suspended 检查前移 |
| 2 | critical | 审核超时读原始 config（模板未解析→Invalid Date→永不超时），忽略 handler 返回的 result.timeoutMs | 改用 result.timeoutMs |
| 3 | high | 发布→调度器接线断裂：publish 清 nextFireAt 后 recomputeOne 零调用方，cron 发布后永不触发、事件索引不刷新 | definitionService 增加调度器钩子（boot 注入），publish/update(triggers) 后刷新 |
| 4 | high | waiting_review 重启后死路：reviewDecide 提示"先续跑"但 resumeRun 白名单不含 waiting_review（自相矛盾） | 白名单加入 waiting_review；续跑时审核节点重跑等待 |
| 5 | high | resumeRun 绕过同工作流互斥 | 补 findMutexHolders 检查 + 回归测试 |
| 6 | high | 挂起运行占用全局并发槽（3 个挂起堵死全子系统） | 引擎新增 activeRunningCount（非挂起计数），并发判定改用它；互斥仍由 DB 查询保证 |
| 7 | high | pump requeue / settleScope 浮空 finalize 无兜底（DB 异常→unhandled rejection/挂起至看门狗） | 统一加兜底 finalize('failed') |
| 8 | high | 审核 ticker 无 ALS 上下文（Web 端写库 0 行、事件路由失败） | tickReviewTimeouts 按 exec.userId 重建上下文 |
| 9 | high | Web boot try 嵌套错误（VoiceClone 抛错连带跳过工作流初始化） | 与 Electron 端对齐为平级 try |
| 10 | high | scanExpiredWaitingReview 死代码（重启后过期审核永久挂起） | recoverOnBoot 接线：过期 waiting → interrupted |
| 11 | high | scheduler tick 无整体异常捕获 + 死赋值；多 cron 触发器语义损坏 | tick 兜底 + V1 明确"仅首个 cron 生效"（校验层限单 cron 为 V2 项） |
| 12 | medium | catalog 漂移：stt 默认引用不存在的 audioBase64（开箱即坏）、tts voiceId 无配置期校验 | 修正默认值/补校验 |
| 13 | medium | userId ?? '' 空串兜底阻断 Electron defaultUser 回落并污染 scoped 过滤 | 统一 LOCAL_DEFAULT_USER_ID |

## 待办清单（按优先级）

### P1（片7 前应做）
- **llm-chat 依赖 episode-production 私有 _helpers**（第 5 个跨模块借用者）且手拼 callAI 丢失 modelId fallback 链 → 提升为公共 AI 调用层（core/services/ai-call.service.ts，含 signal 流式变体），longwriting-ai 的逐字副本同步收编
- **start 输入参数 required 校验 + defaultValue 填充**未实现（cron 触发时必填参数静默为空）→ startRun 按图快照 start.config.inputs 校验/合并
- **审核 editableFields 白名单**未校验（可篡改任意顶层字段）→ applyReviewDecision 过滤 editedValues
- **resumeSuspended 后看门狗丢失**（恢复后无限时长）→ 续驱时重建 watchdog
- 'wf:run-event' 通道名与领域事件名常量化（shared 导出，埋点/目录/emit 同源）

### P2（质量债）
- settings 表 wf:defaults 全局配置层未实现（配置链承诺三处落空）
- 导入导出 duplicatePolicy（覆盖/副本二选一）未实现；导入未跑结构校验
- 引擎 1400 行拆分（审核生命周期 ≈300 行、循环驱动 ≈150 行可独立）；as never 17 处收口
- 测试魔法等待改 vi.waitFor；三套测试假实现抽 workflow-testkit
- 工作流模块日志改用项目 createLogger；repo LIKE 大小写方言处理
- 引擎死代码清理（恒真条件/死三元/setlle 拼写）

### P3（V2 规划）
- 多 cron 触发器 per-trigger 调度状态表；控制流引擎扩展点抽象（RouteEvaluator）；子工作流；嵌套循环命名空间链
- kb-retrieve HTTP 级取消（KB search 透传 signal）

## 一致性确认（无需整改）

datetime+integer 时间字段符合项目规范；wf:run-event 单通道与 image:/portrait: 模式一致；迁移/接入点/generateId/toDto 与 lw-vector 基准同构；{{}} 模板/cron 解析/事件总线均为单一实现；节点扩展点（3-4 处+一致性自检）与存储可替换性（ports 倒置）优秀。
