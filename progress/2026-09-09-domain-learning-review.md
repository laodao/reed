# 领域共学空间全面复盘:底层逻辑闭环审查 + 内容质量评估(定稿)

> 日期:2026-09-09 | 分支:feat/domain-learning | 目标:①业务闭环②功能质量(agent/skill/workflow 支撑各类型领域知识的搜集/整理/总结/输出学习内容)③教育方法论调研 + 初学者视角评估生成内容。
> 结论:底层设计红线与工程质量高,**无 P0 崩溃级问题**;但存在两类实质缺口——(a)**执行层断点**:bootstrap 经 invoke_skill 有"假完成"风险、saveCard 覆盖丢历史、动作无归属校验、verify 事件污染用户通道、意图路由 3/5 误判、published 无写入者;(b)**内容层缺口**:生成人格是"严谨研究助手"而非"教学设计者",讲义缺元信息/先例后律/记号热身/自测答案,同卡数字自相矛盾,入门空间混入研究生级内容。本批已按 TDD 修复核心项,其余如实列遗留。

## 1. 方法

- 5 个并行 subagent 深度审计:会话层(dl-agent harness/bindings/tools/actions)、服务与规则与存储与 IPC、skill+workflow 链路、渲染层状态机、以及(先调研教育方法论后)零基础初学者体验评估;本人对 harness/deps/actions/bindings/意图路由/技能正文做主线自查交叉,并用真机库 `C:\Users\daoge\the-bot\the_bot.db` 导出 5 个空间(贝叶斯 10 概念/10 卡/10 问答、量子物理、走查起步主题等)做数据质量取证。
- 教育方法论:web 调研 10 条成熟方法(M1 先验激活/前置组织、M2 认知负荷、M3 支架渐隐、M4 Bloom+逆向设计、M5 示例驱动先例后练、M6 具体-抽象-具体情境化、M7 检索练习、M8 间隔交错、M9 生成式学习、M10 动机/错误正常化),附讲义 11 块结构模板与 14 项初学者检查表(来源:CMU Eberly/APA Top20/Dunlosky PSPI/The Learning Scientists/Vanderbilt/ERIC 等,详见调研报告)。

## 2. 业务闭环审计(按层结论 + 证据要点)

### agent 会话层(审计 A)
- 生命周期:同 scope 防重入正确、finally 清理到位;缺轮级超时看门狗;cancel 后事件仍回流且"用户取消"文案被基座桥改写;tutor 取消残留 open 问题入未解队列;非法 mode 静默降级 tutor。
- bindings:research/task/tutor/verify 四模式绑定与 spec 一致;**DL_TOOL_MAX_CALLS 的 discover=2/invoke=6 为死配置**(systemBindings 不带 maxCalls);discover/invoke_skill 全模式透出(verify 只读纯 JSON 也应透出存疑)。
- 能力覆盖:**教程/How-to 与理论/学术基本可支撑**;资讯/新闻类缺时效载体(evidenceSources 无日期/检索时间,提示词无时效纪律);动作层缺笔记落库、证据增量、读侧查询工具(tutor 只见单概念前 6 区×300 字符);dev 离线时网络读工具照绑必失败。
- 证据纪律:提示词强、card evidenceSources≥1 硬校验;动作层有兜底默认值(概念 source 硬编码 'ai_verified'、answerSource ?? 'lesson')。
- 意图路由:字面正则 5 句实测误判 3/5("梳理一遍"答疑误伤 task、"对比表/查最近新论文"漏检)。

### 服务/规则/存储/IPC 层(审计 B)
- 数据模型:分层清晰、DTO 化、ALS 租户护栏 + 真库回归测试;**DDL 零外键零级联**(删概念联动靠"删不掉"掩盖,无删概念 IPC);三处冗余(dl_concept.card_id 双口径、dl_card.content_md 恒 null、dl_doc 全休眠面);枚举裸字符串三方漂移。
- 状态机:**card draft→published 无写入者**(统计恒 0,发布闭环断头);research_state 5 值只落 2 值;verification 只写不读;复习闭环(expire/self_test 无人推进);pace scheduler 真实在跑(桌面 60s tick、冷却 10min、全局并发帽 3)。
- service:三处 N+1;turns 顺序已修并测试钉死;ackMastered 清 count 不清 confusedSections。
- IPC:dl: 前缀 + 统一 wrap + 静态通道护栏合规;缺运行时校验(任意 status/relationType);dl:list-questions 直吐仓储行泄漏 userId/Date。
- 事务:**全模块 check-then-insert 竞态**(双开同概念重复卡/重复收藏/审计缺)。

### skill + workflow 链路(审计 C)
- 设计层质量高:learning-* 十个技能证据纪律一致,topic-research 是真工具链模板(draft+published 双图),测试覆盖文本/结构契约。
- **P0-1(bootstrap 假完成)**:invoke_skill 唯一实现=内层一次**无工具单次生成**回文本(system-agent-tools.ts:351-386);bootstrap 是需真调工具推阶段的过程型技能 → 空领域起步可能"静默假完成、零落库",外层无产物核验。
- **P1-1(run_workflow 半闭环)**:topic-research 模板真实可跑但 start.model 必填无默认、人工闸门停 waiting_review、产出在全局资产库与 dl 空间无桥 → "dl 域 workflow 闭环"仍未闭合。
- 内层模型取 turnModel 而 dl runtimeContext 未注入(落全局默认);bootstrap 首卡不自动核验(原条件 research+conceptId)。

### 渲染层(审计 D)
- 状态机:后端 busy 按 mode 隔离、事件通道无 mode 维度 → **研究/答疑同概念并发事件互相污染**;UI 从不查 agentBusy(死能力);无取消入口;research 无产出静默。
- 契约:preload 签名与 handler 一致(未见对象/多参错配);`{success,data,error}` 处理不完全处(笔记保存失败静默、首载失败永久"加载中")。
- 安全:无 v-html、bytemd 默认 sanitize+CSP 双保险;订阅管理规范;通道名 4 处手写无测试守护。

## 3. 各类领域知识支撑矩阵(审计 A/C 综合)

| 类型 | 支撑 | 缺口(本批遗留) |
|---|---|---|
| 教程/How-to | K-oper 区集/步骤;topic-research 维度化;lesson-writer 自测 | 无练习生成/排错指南技能;动手进度靠人工确认 |
| 理论/学术/数据 | K-stmt/KaTeX/folded;arXiv http_get;works/evidence;自动 verify | 无图表渲染管线;推导正确性靠 verify;跨卡算例参数漂移 |
| 资讯/新闻 | 平台 daily-news 模板;web_search 有源才绑 | 无时效载体(日期/检索时间);无"更新已有讲义";无来源清单实体 |
| 三类共通 | 骨架/讲义/答疑/任务/复习/笔记/核验闭环基本齐 | 更新讲义、练习生成、来源清单管理缺失;saveCard 整卡覆盖 |

## 4. 初学者视角评估(核心发现;评估员=零基础高中生)

- 评分:贝叶斯空间新手友好 3/10、教会程度 3/10;量子物理友好 1.5/10、教会 1/10;走查起步(非数学)约 6/10 —— 说明短板集中在"数学符号脚手架与教学法",不是只会复述。
- P0:"入门"空间塞入研究生级"经验贝叶斯"(∫/N(Θ,1)/oracle/Type-II ML 零铺垫)且进学习路线;同卡数字自相矛盾(1.67% vs 17% vs 16.7%)新手一验算即失去信任;Σ/∝/∧/∫/|ψ⟩ 记号零热身;量子唯一讲义=资料采集纪要 + 自我标注未核实。
- P1:一律"定义→推导→(才)例子";医学筛检跨卡参数漂移(99% vs 90%);概念清单重复+系统状态黑话;答疑同问重复 4 遍、研究级长文;example 不给演算。
- 优点(真实有效):医学筛检完整算例、同构变体练习题、先验 v2 卡的改进、跨卡复用同一场景、走查的口诀/对照表。
- 结论:像"研究员的核查笔记",不是"写给新手的教材";留住与劝退的都是刚点亮好奇心的读者。
- 系统级建议(六条,可写入技能):①meta 元信息首块 ②先例后律顺序约束 ③记号渐进政策+符号表 ④标准算例库+数字回算校验 ⑤自测规范(覆盖全概念/应用级题/带答案) ⑥研究态/学习态双层隔离+难度门禁。

## 5. 本批已修复(TDD;commit 待用户指令推送)

1. **意图路由误判**(shared/utils/domain-learning-intent.ts + spec):"梳理/整理/归纳"移出强词改弱词(须产出宾语),新增时效检索强词(查最近/最新+资讯词)、对比表、做成;审计 5 句反例 + 边界用例全绿(9/9)。
2. **saveCard 升版留档 + 归属校验**(dl-agent-actions.ts + spec):已有卡一律新建 version+1 行(旧稿/旧核验保留,新稿 verification=null),不再原地覆盖;save_card 校验概念存在且属本空间、研究模式须与当前概念一致;save_relation 端点存在校验;save_concept parentId 存在校验;saveCard summary 补 conceptId(供空空间核验)。7/7 绿。
3. **bootstrap 宿主注入 + 产物断言**(dl-agent-deps.ts + harness + empty-start spec):空空间 research 由宿主直接把 learning-space-bootstrap 技能正文注入快照(不再依赖 invoke_skill 的无工具内层执行,mission 同步改文案);轮末产物断言——仍空且零 dl_* 成功 → 内容明确"零产出"+warn,不静默成功;新增 dlBootstrapSkillBody 契约用例。
4. **verify 内部会话不上用户通道**(harness):verify 模式抑制 reply:start/stage/流式/reply:done/error 的通道广播(仍累积 allText 供 verifyCard 解析写库)。
5. **空空间起步首卡自动核验 + card-ready 通知**(harness):research 按落库卡的 conceptId 逐个自动 verifyCard 并发 card-ready,不再要求 scope 有 conceptId。
6. **教学法技能正文增强**(builtin-skills.ts):learning-concept-explainer 新增"面向读者的教学纪律"7 条(先例后律/记号热身/每节一个新概念/meta 元信息/数字回算+跨卡算例一致/自测带答案/双层隔离);learning-space-bootstrap S4 要求首卡遵守上述纪律。
7. **builtin-skills 全量守卫**(新增 builtin-skills-pedagogy.spec,11 用例):全部技能 frontmatter 可解析/id 唯一 kebab/name=id;learning-* 分组断言纪律;explainer/bootstrap 教学法契约。

验证:dl 域 + 技能相关 15 文件 111 passed、相关组 41 passed、intent 9/9、actions 7/7、pedagogy 11/11;eslint 0 errors;vue-tsc 类型检查结果见后(相关零新增口径)。

## 6. 遗留与建议(未本批修复;按影响排序)

**数据/一致性与执行层**
- [P1] card draft→published 无写入者(统计恒 0、人审发布闭环缺失):补 dl:publish-card 通道 + graph.publishCard + 前端发布入口与"已发布 N"口径。
- [P1] 无事务 + check-then-insert 竞态族(saveCard 版本、note 幂等、ack attrs 读改写):写路径包 transaction;note 加 (project_id,question_id) 唯一索引(存量去重后);dl_card 加 (project,concept,version) 唯一索引(先清洗孤儿/重复)。
- [P1] 事件通道无 mode/runId 维度:同 space+concept 跨 mode 并发 actionSummaries 交叉收集、前端混流。建议事件加 runId/mode 过滤或通道级隔离(已缓解 verify,未覆盖 research∥tutor 并发)。
- [P1] 前端:agentBusy 零消费 + 无取消按钮 + research 无产出静默 + 视图加载失败永久"加载中";qna 收藏概念归属错位(view.turns 需携带 conceptId,前端按 questionId 判定)。
- [P2] verify 并发同 concept 双卡 key 冲突(busy 键无 cardId);verify busy 无超时看门狗;自动核验切片 30 区上限。
- [P2] 意图路由仍为启发式(误判已收敛,边界留 LLM 复核);技能正文引用与注册一致性建议加自动清单测试。
- [P2] N+1×3(view/atlas/scheduler);dl:list-questions DTO 泄漏(userId/Date);handler 错误文案直透;迁移注释"7 张"与实际 8 张;mastery trigger 三方文档不一致;dl_doc 休眠面治理。
- [P2] run_workflow dl 域闭环(模板默认模型/discover 附选项/run 输出→dl_save_* 桥/人工闸门语义);invoke 内层 turnModel 注入(跨包,需平台侧配合)。
- [P2] 概念冗余(根层同名不唯一;saveConcept 幂等放宽至空间同名提示)与"贝叶斯定理（当前概念）"式污染名治理;孤儿数据留档说明(历史调试产物,现无删概念路径)。

**内容/教学法(下一轮生成质量增强)**
- [P1] 产出难度门禁:目标=入门 时,需未教记号(∫/分布族/iid)的概念不得直接生成讲义,须先补前置卡或拒绝;同概念同名卡/同问答自动去重。
- [P1] 讲义区块模板落地:meta 元信息块/记号热身区/标准算例全局唯一/自测带答案+覆盖映射(可做成 learning-lesson-writer 与模板区 key 白名单校验;前端渲染隐藏 draft/id/核验黑话)。
- [P2] 增加"更新已有讲义(增量 diff)"与"练习生成"技能(learning-lesson-updater / learning-practice-builder);来源清单实体化。
- [P2] verify 结果消费(needs_review → 提示修订或阻断发布)与 published 门禁联动。

**推送状态**
- 待推提交(用户授权后 push 曾数次尝试,服务端 git-upload-pack advertisement 极慢/超时;本批新提交暂未计入):原 11 提交 + 本批修复提交(待用户指令再 push)。

## 7. 附:审计产物与素材

- 导出素材:progress/_dl_export/(贝叶斯/量子/走查等 5 空间全文 + 空间总览)。
- 数据取证:scripts/_dl_schema_probe.cjs、_dl_list_tables.cjs、_dl_export_lessons.cjs、_dl_audit_probe.cjs、_dl_orphan_probe.cjs(临时诊断,不入库)。
- 审计/评估报告全文由 5 个 subagent 输出,要点已并入上文;教育方法论调研报告全文可用。
