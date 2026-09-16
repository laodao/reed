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
| P2-7 设计包徽标 turn 末不同步 | `useStoryRoom.ts:153`（0915 忘川渡实跑发现） | turn 收尾仅在 `res.data?.mode === 'design'` 时 refreshState；忘川渡第 2 轮（人物卡批量入包）结束后「审核设计包(N)」停在旧计数，重进页面（roomHistory 全量拉取）才恢复。修法：收尾无条件 refreshState，或以"本轮 designPackages/pendingCards 是否变化"为锚 | 研讨室前端状态流 review |
| P2-8 章法工具 outlineId 不可自助获取（已修待提交） | `room-agent-tools.ts`（0915 忘川渡实跑发现） | 章法五工具只认大纲节点 id，agent 无任何工具可列出/解析大纲节点——实跑 agent 试遍「第1章/ch_1/标题」全失败后向用户求 id（真人同样拿不到）。已加 `lw_query_outline` 只读工具 + `resolveOutlineRef`（精确 id→文档序章号→标题唯一包含）接线五工具，第 1 章走通验证 | 待提交 |

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

## 忘川渡二轮实测补充登记（2026-09-15 下午）

| 项 | 位置 | 说明 | 状态 |
| --- | --- | --- | --- |
| 章法入口三轨并存（已收口） | `room-agent-tools.ts` | lw_write_chapter_full（直调 executor）/ lw_run_chapter_workflow（工作流）/ lw_write_chapter（旧分步）三入口并存、两个工具描述都自称"推荐入口"，agent 每轮随机选路。已收口：lw_write_chapter_full 改为启动工作流并在工具内等待终态（runChapterWorkflowSync，agent 零轮询步数——旧工作流路径 agent 轮询曾烧光 24 步触发 max_steps）；删除 lw_run_chapter_workflow；lw_write_chapter 限定为分步模式步骤 | 已改待提交 |
| 设计条目丢失（P1 候选） | `room-design.ts` / `room-session.ts` | 忘川渡二轮实测：第 2 轮 4 张人物卡 lw_save_card 全部返回 ok（itemId di_1-4），但确认时包内无此人卡、人物表 0 行——卡片在"轮末→下轮首"窗口被移除，机制未定位（写路径均已走 mutateRoomState 串行队列；agent_session_events 可复原时序）。同书重落第 2 次成功，问题单发 | **待查根因** |
| 主编幻觉式完成 | room host（模型行为） | qwen3.8-27b 曾整轮未调任何工具却报告"已重落 4 张人物卡"；另有"正文已落库"与 DB 不符。章法改工作流驱动的动因即此；对 lw_save_card 类写操作可考虑工具结果回执对账 | 登记观察 |
| R1/R5 死亡误判（已修） | `consistency.service.ts` | hasDeathSemantics 纯子串匹配，将来时/假设句（"七日后肉身死亡"）误判为已死亡（与 0915 上午程野/苏晚棠假死同根）。已加前 8 字守卫词表；另 extractEntityStates 提示词加接地约束（禁推断未揭示设定/将来时不得写为已发生），extractChapterForeshadows 加正文锚定硬约束（content 须附原句片段） | 已改待提交 |
| R10 字面词匹配误报（已按用户拍板语义化） | `consistency.service.ts` R10 + `chapter-writing-executor.ts` | "拒渡/启动/初遇"按结果词字面匹配，正文语义已实现仍报。用户拍板（2026-09-15 晚）：落点判定程序难以胜任、交给 agent——字面扫描降级为候选生成器（宁漏勿错），章法写后新增 verifyUnlandedBeatsWithAI 语义复核：模型按"允许同义改写/对话侧写"逐拍判定，已落点的自动知情保留（带证据登记），确未落点的维持拦截。附：BEAT_ANNOTATION_RE 漏剥 U+2018/2019 弯引号致谓词成「过'」必然误报——语义复核路径覆盖后暂不改字面规则 | 已改待提交 |
| 疑点抽屉 UX | `StoryRoom.vue` | ①知情保留按钮在 AI 解题出 plan 前不可见（保留需求无需先解题）；②列表刷新后已出的 plan 丢失；③已保留疑点仍显示、角标不减——③已修（2026-09-15 晚）：scanContradictions handler 默认只返回 pending（主进程 join 保留记录，渲染层无需感知保留数据），status='all' 供抽屉「已保留」分区+撤销保留（unacknowledge_conflict 动作，保留不再只进不出）；graph-knowledge-provider 同步改只注入 pending——此前已保留疑点仍以"已知设定矛盾（生成时规避）"喂给生成上下文（忘川渡 8 疑点=7 已保留+1 误报实证）。①②待修 | ③已修待提交，①②待修 |
| 保留记录 key 随大纲改写漂移（已修） | `conflict-gate.ts` | conflictKey 哈希覆盖消息全文，R10 消息嵌大纲节拍原文——大纲一改旧保留全失效重生（忘川渡实证：21:27 保留 3 条、21:42 大纲修订后 1 条复活）。已锚点化：ResolutionRow 增 chapterNumber+beatText，R10 按归一化 bigram 非对称重叠系数（min 边，容忍"同拍补细节变长"）≥0.6 且同章即顺延保留；unacknowledgeConflict 同锚点语义撤销；存量无锚点行按 key 精确匹配不受影响 | 已改待提交 |
| 单章大纲卡误建卷（已修） | `story-persist.ts` + `room-distiller.ts` | persistByKind outline 分支只会建卷，主编逐章落卡时每张误建一个「第一卷」空卷节点。已加 matchOutlineChapterCard 识别单章卡（章号键/标题前缀），挂首卷下按章号幂等 upsert | 已改待提交 |
| 设计包徽标 turn 末不同步（P2-7 根因确认） | `useStoryRoom.ts:153` + `room-session.ts:383-388` | mode 判定=「本轮是否新建了 draft 包」（createdAt >= turnStartTs），复用旧包追加条目的轮次一律 mode=chat → 不 refreshState、不发 design:ready。与 P2-3 同根 | 已有登记，根因补充 |

## 忘川渡三轮实测补充登记（2026-09-16 凌晨，qwen3.8-max 主编）

**已修复（本轮）：**
1. **章法生成无视 stage 模型配置**（P1）：章法三处生成调用（设计卡/正文/图谱提取）全传 undefined provider——静默落到应用默认提供商，项目设置里的 stage 模型对章法形同虚设。修复：chapter-writing-executor 统一 resolveStageModelOpts('chapters') 并贯通三处。
2. **同名人物卡落库被吞**（P1，即前轮登记的"设计条目丢失"根因）：persistCharacters 对已存在人物返回 skipped + persistDesignItem 把 skipped 当成功移出草稿包 = 修正卡整体丢失。圣经永远得不到修正→设计卡每轮把旧口径织回来（第2章六轮回退的完整闭环）。修复：同名人物卡=权威更新（upsert 覆盖可归档字段）；normalizeCharacterInput 自由键（secret/写法约束等）不再仅在 background 为空时拼入——始终追加，防修正内容丢失。
3. **账本 conflict op 被静默丢弃**（P1，测试抓出）：静默提取的 conflict op 无 title 字段，在 `if (!title) continue` 处被提前跳过——提取器报告的"推翻某条共识"从未生效。修复：conflict 分流先于 title 检查。
4. **R10 旧稿疑点与重写互为死锁**（P1）：写前门禁拿旧正文的未落点疑点拦 overwrite 重写，而 R10 语义复核只在写后运行。修复：overwrite 时写前门禁放行「仅引用本章」的疑点（设计卡+正文两处同口径；跨章疑点仍拦）。
5. **新能力：lw_update_ledger 写账本工具**（用户拍板）：set-status（id/标题定位，多命中不猜给候选）+ add（缺省 confirmed，同题查重）；回执由代码生成真实数据；机制层纯函数在 room-ledger.ts，87 测试全过。

**待修（新登记）：**
- **多实例共库时工作流节点双派发**（P1）：两应用实例共库时，同一 run 的 write 节点被派发两次（journal: node_launched×2 间隔 10.4s，run_finished×2），两套执行并发写 journal 撞 (run_id,seq) 唯一约束→run 误判 failed。引擎需要 run 属主/认领机制。复现：忘川渡 wfrun_1789489768898。
- **R9 名册外人名误报两类**（P2）：①物品名被当人名（「孟婆汤」）；②名册功能人物（李二/孙婆/周贵——引渡名册记录的死人本就是设定内存在）被要求补圣经。R9 需要物品词表 + 名册死人白名单语义。
- **主编重复调用工具**（P2，模型可靠性）：明确"只调用一次"后仍出现 45s 内二次调用撞互斥、且把 skipped 回执当成 run 终态汇报（成功 run 的结果被无视）。工具回执应携带 runId 并在 skipped 时引导查询已有 run；或工具层对同 (章节,定义) 的 in-flight run 直接返回其句柄。
