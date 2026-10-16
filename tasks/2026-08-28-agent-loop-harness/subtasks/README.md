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
| EP-1 EP 工具化+宿主+四大能力（不含 choice） | ep-1-tools-host.md | M6.5-a | ✅ 代码完成+评审修复；干跑待应用重启后执行 |
| EP-2 choice→审批通路 | ep-2-choice-approval.md | M6.5-b | ✅ 代码完成+评审修复（decide 三件套/前端分流）|
| EP-3 资产生成全链路实测 | ep-3-e2e-run.md | M6.5-c | 文本链 ✅ 干跑通过；资产链 ⚠️ 待 tokenplan 密钥修复 |
| EP-4 长文工具迁移共享注册 | ep-4-lw-migration.md | M6.5-d | ✅ 完成（pack:lw-agent:* 全名工具，10/10）|
| KE-1 数据模型与仓库 | ke-1-schema-repo.md | M-Ke1 前半 | ✅ 完成（迁移双端+scope+手工录入/驳回）|
| KE-2 scope 装配+宿主补接 | ke-2-assembly-wiring.md | M-Ke1 后半 | ✅ 完成（分层装配+chat 补接+全宿主 ContextManager）|
| KE-3 向量化检索 | ke-3-vector-retrieval.md | M-Ke2 主体 | ✅ 完成（分区键+混合检索；AGENT_MEMORY_EMBEDDING 配置启用）|
| KE-4 图谱 provider+L0+分层 UI | ke-4-graph-l0-ui.md | M-Ke3 | 代码完成（契约+长文实现+L0 摘要+UI）|

共同纪律：每子任务实现→单测（mock 零 API 成本）→subagent 对抗 review→修复→文档同步→提交 push；
真模型验证只在 EP-3 与各 KE 子任务的冒烟步，遵守成本红线（34/35 号）。


## 对抗评审（2026-09-08，两路并行）

EP 轨 + KE 轨全部子任务实施完成后执行（范围 1ca4e851..223a4325）。结论：P0×4 / P1×4 / P2×16，
**全部修复**（d548493a）：
- EP：emitter on/off 不存在（改 tapEvents 惰性订阅）/审批转译裸名比较恒 false（改全名）/
  动作工具缺 executeTimeoutMs/越权与契约等
- KE：飞轮构造器丢弃 vector 端口（KE-3 整体失效）/am:reject 三件套契约错位/
  图谱 provider 未安装且名称-ID 错配（重写：resolveEntities 解析+getNode 关系段）/
  缺省装配全量泄漏/重规划丢 scopeTag/分区键 default 对称等
- 修复后回归：全部新套件 + 相关目录 263+ 绿（workflow 目录 12 个失败为既有基线，
  stash 验证与本次无关）

## 待办（下阶段）

1. 应用重启后：EP-1 干跑（真模型纯文本链）→ EP-3 全链路实测（成本红线见 ep-3 文件）
2. LW 侧 update/delete 的 byId 越权洞（评审 EP P2-4 同款，列下阶段）
3. L0 快照变更钩子与 24h 超龄重算（当前为最小摘要版）
