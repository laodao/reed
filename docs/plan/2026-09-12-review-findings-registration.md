# 2026-09-12 深度 review 遗留项登记

> 背景：feat/story-room 合并 feat/kb-parse-chunking 前后，对最近 3-5 天 31 个实质提交做了三路深度 review（KB 线 / workflow·领域学习线 / agent-runtime·长文线），完整报告见当日会话记录。本文登记**未随本次修复闭环**的发现，按档位与前置条件分组。每条附提交哈希与代码位置，已核实到行级。

## 已随本次修复闭环（2026-09-12，feat/story-room）

- P1-1 租户破洞（对抗评审后扩大收口）：`lw-plot.repository.ts` batchCreate 主行/桥表行补 userId 注入、reorderPlots 补租户过滤；**同根的 `lw-plot-character.repository.ts` / `lw-plot-location.repository.ts` 的 replaceAll + migrateFromJson 裸 manager 写入一并收口**（replaceAll 是 update() 每次保存情节的必经主线路径，比 batchCreate 更致命）+ 回归测试 `tests/unit/repositories/lw-plot.repository.spec.ts`（5 用例：注入断言/跨租户不可见/NULL 口径/replaceAll 清理/reorder 不跨租户）
- P1-2 kb_chapters 删除缺位：deleteDocument / deleteKnowledgeBase / clearDocumentArtifacts 三个清理点补齐 + 回归测试
- P2-1 沙箱遮蔽缺口：`code-runner.ts` IIFE 遮蔽清单补 self/globalThis/navigator（worker 里 `self.fetch` 可绕过、`navigator.sendBeacon` 是网络出口），再补 postMessage（防片段伪造 `__dl` 消息骗主线程提前收尾）+ 输出收集硬上限 + 收包侧单条 payload 截断
- P2-7 同名图片落盘互相覆盖：`extract-text.ts` persistLocalImages 同名不同源加序号去重
- P2-8 建图意图正则过宽：结构名词后跟讲义/定义/解释等内容词时不再误路由 task + 用例（含"概念节点 vs 概念的说明"边界口径用例）
- P3-3 沙箱输出缓冲无上限（随 P2-1 一并修）
- P3 mobi/azw3 整文件预读后不用（二次读盘白占内存）
- P3 `ctx.toolBudget.used` 快照过期 → 改活 getter

## 二档：改法明确，待前置确认后跟进

| 项 | 位置 | 说明 | 前置 |
| --- | --- | --- | --- |
| P1-1 存量 NULL 回填 | `lw_plots` / `lw_plot_characters` | 若 web 多租户曾实际用过批量建情节，存量行 user_id=NULL（scoped 读不到、级联删留孤儿）。修复后写入已正确，但存量要按需回填 | **确认 web 多租户是否实际启用过**；未启用则无需回填 |
| P2-2 resumeTurn 无平台级互斥 | `host-kit.ts:512`（d20ecb8b） | 重复触发续跑会对同一会话并发跑两个 loop（预算双花/副作用重复落库）。目前零调用方属"埋雷"状态；现有契约是"互斥归业务 busy 守卫" | 设计决策：占用标记放 host-kit 还是业务层；**接线前必须补** |
| P2-3 设计轮 mode 回填锚点失真 | `room-session.ts:382-385` + `room-design.ts:47`（298d4aee） | 复用旧 draft 包时本轮设计产物误判为 chat（不发 design:ready、产物卡死草稿）。修法：回填锚点改"本轮是否有设计产物写入"而非"是否新建包" | 研讨室确认流程语义 review |
| P2-4 confirmDesignPackage 非原子 | `room-design.ts:118-150`（298d4aee） | 正式表先直写、wizardState 后落库，中途失败重确认会重复建行；失败条目无重试入口 | 同上 |
| P2-5 章节链路整本载入内存 | `kb-chapter.repository.ts` treeOf/findByDocument 带 content 列（ba180b8d/d51cdb32） | IPC 树接口与检索 lookup 只需 title/level/summary，缺瘦列查询 | 动检索热路径，改完跑 `tests/eval/kb-eval-golden.json` 评估基线对照 |
| P2-6 M4 文档级过滤 N+1 | `knowledge-base.service.ts:1076-1082`（c709ba33） | 每候选 2 次串行 findById 后才丢弃；应先取 documentId 集合再批量查 | 同上 |

## 三档：吹毛求疵 / 低概率，登记备查

- **countMatchedWords 对恰好 2 字 CJK 查询双重计数**（`memory-flywheel.ts:108-127`，5f2c0690）——L1 门槛可被单词命中击穿；飞轮缺省停用，重开前修
- **流重试丢弃失败尝试的 usage**（`loop.ts:330-339`，b6c5e50a）——预算口径系统性偏低；且重试重放对 lw_save_* 非幂等工具会重复副作用（代码注释已自认，靠工具幂等纪律覆盖）
- **手动摘要与自动调度可并发跑同一批章节**（`knowledge-base.service.ts:757-766`，4893db0b）——双倍 token，写回幂等无损坏；加在途标记即可
- **章节 LIKE 过滤未转义 `%`/`_`**（`kb-chunk.repository.ts:69-73`，4893db0b）——仅过滤范围变宽，非注入
- **pdf-outline 未命中书签全文档 indexOf 扫描**（`pdf-outline.ts:184-195`，18ec5380/fa3805de，存疑）——书签多且命中率低时 O(章节数×文档长)；numpy 实测能跑通
- **markdownToPlainText strips 星号吃掉数学文本**（`extract-text.ts:557-559`，75096f5d）——"2\*3\*4" → "234"
- **domain-learning 手工建点多笔写库无事务**（`learning-graph.service.ts:223-306`，ad342ac9）——任一条抛错留下"有点无边"；单人串行点击概率低
- **「运行 JS」沙箱残余攻击面**（code-runner.ts）——本次已补 self/globalThis/navigator 遮蔽；剩余为未来新增 Worker 全局 API 的长尾风险，CSP connect-src 仍兜底
- **progress/ 临时物入库**（18ec5380/fa3805de）——`_msg.txt`、`_diag_*/_probe*` 脚本 10+ 个混入主干；建议下次清理并考虑 gitignore 规则
- **lw-plot 裸读无租户过滤**（对抗评审补充登记）——`lw-plot.repository.ts` getByProjectId 裸 qb、create 里裸 MAX(plot_order)、两桥表 migrateFromJson 裸读 plots/characters 表；读侧洞，与写侧同根，建议随多租户确认一并收口
- **base-repository.ts 存在不带 IsNull 的废弃 scopeWhere 死代码**（:230-254 附近）——易误导后来者按错误口径写租户过滤，建议删除
- **intent 正则的结构词链边界脆弱**——"完善这个概念的说明"→tutor 与"完善这个概念节点的说明"→task 并存是语料相关的脆弱边界（已用 spec 钉死现口径）；长期应把启发式正则升级为小模型意图分类
- **lw-plot-outline update/delete 串行门存量**（c3b63a11 commit message 自登记，归因 TypeORM 迁移批 104c34b0）——静态读码与 batchCreate 嵌套 BEGIN 非同类，需实跑确认，勿随迁移批遗失；`lw-plot-outline.repository.spec.ts` 现状即红（6 例）

## 教训沉淀（对齐架构统一原则）

1. **生命周期对称**：实体新增必须同步接入 deleteDocument / deleteKnowledgeBase / clearDocumentArtifacts 三个清理点——建议做成 checklist 或测试守卫，否则下一个一级表还会重演 P1-2。
2. **事务回调内禁止裸 getRepository 直写带 user_id 的表**：scoped 注入只覆盖 BaseRepository 路径；建议加 lint 规则或评审守卫（本次 P1-1 根因）。
3. **多租户视角缺位是系统性盲区**：Electron 单用户形态验证不出 user_id 缺失类缺陷，涉及租户的修复要专门走 web 多用户口径用例。
