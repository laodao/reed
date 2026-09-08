# 42 · 全量对抗评审修复（40/41 号 + LW-9e 证据链）+ renderer 直达层 byId 发现登记

> 三路独立 subagent 对抗评审（40 号上下文成本 / 41 号线上名 / LW-9e 证据链与系统性发现）
> 总账 **P0×0、P1×2、P2×10、P3×1**，全部处置：8 项代码修复 + 2 项测试修复 + 文档登记。
> 同轮 LW-9e 补负控断言后揪出并修复 **background 死开关**（真实面板契约缺陷）。

## 1. 修复清单（代码）

### 40 号线

| 级 | 发现 | 修法 |
|---|---|---|
| P1-1 | `collapseSupersededToolResults` 原地变异共享 content 数组——stepMessages 与 pendingAppended 共享对象，同步并行同签名场景下「尚未入流水的原文」被占位符覆盖，违反 append-only 承诺 | 折叠命中消息深一层拷贝（content.map 新数组 + 消息浅拷），原对象不动 |
| P2-1 | HostKit 流水写入绕过 `truncateTranscriptContent`（agent-service/workflow-boot 都有）——512KB 占位纪律在该链失效 | host-kit appendTranscript 套同款截断 |
| P2-2 | registry 归档 `ok:true` 硬编码——业务失败形态（不 throw 的 `{ok:false}` 返回，如 tool.service）被当成功归档，与 collapse 判定口径矛盾 | 归档前按 `raw.ok === false` 跳过；args 口径（effective=执行口径 vs 审计面 LLM 原始入参）在注释中双口径登记 |
| P2-3 | `get_tool_result` 无 scope 钉扎——租户内跨会话可互读产物（提示注入携带他会话 toolCallId 即可探） | execute 按 ctx.scopeId 校验：本会话或父子前缀（`${scope}:`）才可回查，否则 NOT_FOUND |
| P2-4 | HostKit 流水 `maxSeq().catch(()=>0)` 吞错——瞬时故障 → seeded 宿主误判首轮整段重种子 + seq 碰撞静默丢行 | fail-close：maxSeq 失败本 turn 停写流水（warn 留痕）；seeded 迁移检查失败按续聊处理不重种子 |
| P2-5 | 子代理轨迹/产物挂 `${parent}:sub_*`，父会话 reset 级联只精确匹配 → 孤儿残留；子代理 ContextManager 各读各的 env 不继承宿主窗口 | 轨迹/产物仓储加 `deleteByScopeTree`（scoped SELECT 校验属主 → 裸删 scope 前缀集合），agent-service reset 接线；SpawnSubagentDeps 加 contextWindowTokens 由 kit 传入 |
| P2-6 | `parseModelTierEnv` 多段输入静默截断（openrouter 形态 modelId 含 `/`） | >2 段 warn + 返回 undefined 回退默认模型 |

### 41 号线

| 级 | 发现 | 修法 |
|---|---|---|
| P1-1 | 碰撞消解 `_N` 序号后缀无长度复核——折叠长 ≥63 的碰撞对叠出 65 字符，击穿 `^[a-zA-Z0-9_-]{1,64}$`（正是本提交要消灭的 400 类别），且无校验无告警 | 摘要后缀统一走 `withDigestSuffix`（截断+digest 恒 ≤64）；回归测试：碰撞×63 字符 → 恒合法 |
| P2-1 | 序号后缀按集合顺序派生——`pack:a:b`/`pack_a_b` 折叠对的「谁加后缀」随工具集顺序翻转，模型按历史线上名重发会静默换绑 | **两遍法**：按折叠名分组 → 组内按 `sha1(规范名)` 排序定归属（最小者保留裸折叠名）→ 其余内容派生摘要后缀（4→8→16→32 逐级加长防撞）。归属与声明顺序/到达序完全解耦 |
| P2-2 | 还原 miss 原样穿透——模型照抄目录/提示里的规范冒号名（discover_capabilities 原样列出）必败且产生悬空轨迹 | 决策还原二次查表：miss 时按同规则折叠后再查（`pack:demo:read` → `pack_demo_read` 命中）；tool-error part 的 tool_result 轨迹缺口为存量问题另行登记 |
| P2-3 | wire-name.spec 恒真断言（`toBe(x === wa ? wa : wa)`）零锚定力 | 改为截断前缀同形断言 |
| P3-1 | 空/全非法规范名折叠为空串违反 `{1,64}` 下限 | 折叠空落 `'_'` |

## 2. LW-9e 证据链评审 → background 死开关（本轮最有价值发现）

评审指出：E2E 断言无负控——「参数被忽略、全量上下文生成」与「重组生效」观测结果相同；
且实证 `chapter-context.ts` 的 compose 没有 `isEnabled('background')`——**背景文本内嵌于
概要文本（service 曾拼 `overviewText` 内），'background' 勾选是死开关**，而 E2E 停用的
恰是数组头部的 overview+background，掩盖了缺陷。

修复与补证：
- **修法**：背景拆出独立受控段——service 的 overviewText 不再内嵌 backgroundContext；
  `ChapterPromptParts.backgroundText` 新字段；compose §一### 世界观设定 按
  `isEnabled('background')` 门控（禁用→占位文案「世界观设定已由用户禁用」）；
- **负控断言**（e2e-lw9e）：停用 background / overview 分别断言 promptText 出现对应
  占位文案——死开关从此测得出；重跑 LW9E_RESULT=PASS（含负控全绿，真模型 487 字）；
- 回归锚：chapter-context.spec（7 例，含「background 独立门控」用例）。

### LW-9e 结论修订（38 号 §6 已同步）

如实登记：分区 8→6 差异（'outline' 死键、'recall' 并入 graph、prewrite 数据驱动）、
promptText 默认分支=全部条目（设计漂移，面板恒显式传勾选集影响可忽略）、预览一致性
与 token 预算条未测、背景夹具且被测轮次停用 background（背景→生成链路未真模型覆盖）。

## 3. 系统性发现登记（本批不修，独立批次设计）

**renderer 直达层 byId 裸变更（约 38 个方法）**：`longwriting.service.ts` 的
update/deleteXxx(id) 经 handler 直达 IPC，仅 ALS 用户级隔离，无同租户跨项目归属校验
（`updateEntityStateSnapshot`/`deleteEntityStateSnapshot` 等；EP 侧同形态）。

三路评审独立定级一致：**完整性加固 P2，非安全越权**——跨用户边界由 ALS + requireAuth
把守（scoped 读写双侧生效），残余风险是同租户跨项目完整性；且不止对抗路径：渲染层
陈旧 id/项目切换竞态（A 项目列表页缓存 id → 切到 B 项目保存）可静默改写 A 项目数据。

推荐修法（小爆炸半径，对齐 M8 会话绑定先例）：`lw:bindProject(projectId)` 一次性通道
+ service 端 `assertOwned(repo, id)` 守卫 + ~40 处机械接入；renderer/preload/web-map
零变更。声明式表（channel → {idArgIndex, repoKey}）可收敛单文件。EP 侧同批登记。

## 4. 测试与回归

- 新增/修订：wire-name.spec（碰撞 64 上限回归/顺序解耦/空名下限）、chapter-context.spec
  （background 独立门控）、subagent/loop 既有用例随实现同步；
- 全量：agent-runtime 17 文件 262 用例 + chapter-context 7 例全绿；typecheck 0 新增错误；
- LW-9e 真机重跑：LW9E_RESULT=PASS（含负控）。
