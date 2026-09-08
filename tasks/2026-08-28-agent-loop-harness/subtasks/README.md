# 子任务索引（34/35 号的执行拆分）

> 拆分原则（用户指令）：迁移与飞轮都复杂，拆子任务、分别写 plan、逐个执行。
> 每个子任务：独立可验收、可回滚、测试先行。两轨可并行（EP 轨与 KE 轨无代码依赖；
> EP-1 的记忆装配留 stub，等 KE-2 的 scope 装配就位后接 L2/L3）。

## 执行顺序与依赖

```
EP 轨（35 号）：EP-1 ──→ EP-2 ──→ EP-3（实测）      EP-4 可与 EP-2/3 并行
KE 轨（34 号）：KE-1 ──→ KE-2 ──→ KE-3 ──→ KE-4
全局：两轨完成后做全面测试（34 号「验证」行，35 号 §6 策略）
```

| 子任务 | 文件 | 对应里程碑 | 状态 |
| --- | --- | --- | --- |
| EP-1 EP 工具化+宿主+四大能力（不含 choice） | ep-1-tools-host.md | M6.5-a | 代码完成，单测 6/6 绿；干跑待验（需应用重启） |
| EP-2 choice→审批通路 | ep-2-choice-approval.md | M6.5-b | 代码完成，单测 54/54 绿（1514d7d9）|
| EP-3 资产生成全链路实测 | ep-3-e2e-run.md | M6.5-c | 待开工 |
| EP-4 长文工具迁移共享注册 | ep-4-lw-migration.md | M6.5-d | 代码完成，单测 10/10 绿 |
| KE-1 数据模型与仓库 | ke-1-schema-repo.md | M-Ke1 前半 | 待开工 |
| KE-2 scope 装配+宿主补接 | ke-2-assembly-wiring.md | M-Ke1 后半 | 待开工 |
| KE-3 向量化检索 | ke-3-vector-retrieval.md | M-Ke2 主体 | 待开工 |
| KE-4 图谱 provider+L0+分层 UI | ke-4-graph-l0-ui.md | M-Ke3 | 待开工 |

共同纪律：每子任务实现→单测（mock 零 API 成本）→subagent 对抗 review→修复→文档同步→提交 push；
真模型验证只在 EP-3 与各 KE 子任务的冒烟步，遵守成本红线（34/35 号）。
