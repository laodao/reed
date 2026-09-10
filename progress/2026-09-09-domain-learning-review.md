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

## 5.1 第二批修复(2026-09-09 续;用户明确「不遗留」→ 继续清 P1,仍在推进)

1. **agent 事件 mode 隔离**:DlAgentEvent/DlAgentExecutionContext/runtimeContext 增 mode;harness/tools 全部 emit 带 mode;tap 只收本轮 mode 动作摘要(修复跨模式并发 actionSummaries 交叉收集);前端 DlAgentUiEvent 增 mode,三处订阅(ask/boot/researchConcept)按发起模式过滤——同 space+concept 并发不再互污气泡/流式/任务日志。
2. **qna 收藏归属闭环**:DlChatTurn 增 conceptId(view 组装带入问题真实归属);dl:create-note 对 qna 由 questionId 回填 question.conceptId(幂等键与真实归属一致);前端收藏态改为按 questionId 跨概念判定(notes+notesAll 合并)、落库用 turn.conceptId,loadSpace 预热 fetchNotesAll(静默失败),收藏失败给提示。
3. **published 发布闭环**:后端 dl:publish-card(属主+归属+仅最新版校验);preload/web channel-map/store/UI 三端同步(通道护栏 spec 绿);讲义头「确认发布 vN / 已发布 vN」;发布后刷新视图(统计"已发布 N"不再恒 0)。
4. **ackMastered 全清困惑**:清零 confusedCount 并删除 confusedSections(再次没懂从零累计)+ spec 用例。
5. **dl:list-questions DTO 化**:toDlQuestionView(剔 userId/Date→ISO),对齐 shared 契约。
6. **前端可用性**:UI 级互斥 guard(研究∥追问不同时起,防同空间双 agent 轮);ask「停止」按钮(补取消入口,cancel 后温和文案);卸载时按在途模式取消 research/tutor/task;发布失败/收藏失败提示。

验证:dl 域 17 文件 112 passed(含通道护栏 3 端一致、graph 新用例)、eslint 0 errors;vue-tsc 复核中。

## 5.2 第三/四/五批修复(2026-09-09 续;用户「不遗留」→ 全部清完)

- **第三批 80cc2a5e(性能与一致性)**:①N+1×3 消除(buildSpaceView/buildAtlasViews/scheduler → 一次 listByProject + resolveCurrentCards 内存解析);②verify 同概念多卡串行队列(verifyChain,修 busy 键无 cardId 的静默失败);③saveConcept 空间内同名(其他父/根层)→ skipped 防双份冗余;④dl_note 加 uniq(project_id,question_id) + repo 同题幂等(消除同题双行与 findByQuestion 同毫秒排序 flaky);⑤迁移注释/幂等 spec 表清单对齐 8 张。
- **第四批 48136bd5(前端体验小态)**:视图加载失败失败态+重试(不再永久"加载中")、切空间清 taskLog、答疑首载不闪空态、流式中断补标记、Home 列表失败独立失败态、选区笔记保存失败不静默不关窗。
- **第五批 eec9d925(核验结果消费)**:DlCardView 增 verification 摘要(未核验=null 可辨别),讲义头核验 tag(核验通过/待复核 N/未核验 + 悬停时间与范围注记),发布时待复核不阻断提示。

## 6. 剩余(均需平台层或产品口径,已明确边界)

- **[平台批]** run_workflow dl 域半闭环与 invoke_skill「无工具内层」语义:都改在 `agent-runtime`/`workflow-run` 平台层,影响 EP/LW/dl 三包;且当前有并行会话在改 workflow 引擎(journal-replay/workflow-engine/control-nodes),**建议单独立项并错开该批**。
- **[产品口径]** 产出难度门禁(入门空间遇研究生级概念:拒绝生成 vs 先补前置基础卡)与讲义区块模板的渲染端落地(隐藏 draft/概念 id/核验黑话;数字回算 lint)——技能侧教学法纪律已落地(concept-explainer 7 条 + bootstrap S4),链路侧待口径确认。
- **[增强]** learning-lesson-updater(增量修订)与练习生成技能;handler 错误码化;渠道名常量收敛;web CSP 收紧。

**推送状态(已完成)**
- 服务端 gitea 曾长时间无响应(advertisement 超时 / 连接抖动 / 内部 API 503),经自动重试于恢复窗口推送成功:`8ada1b93..718ca158`(原 10 提交 + 复盘前四批),随后 `718ca158..eec9d925`(第五批)。**本地 0 未推**。

## 7. 附:审计产物与素材

- 导出素材:progress/_dl_export/(贝叶斯/量子/走查等 5 空间全文 + 空间总览)。
- 数据取证:scripts/_dl_schema_probe.cjs、_dl_list_tables.cjs、_dl_export_lessons.cjs、_dl_audit_probe.cjs、_dl_orphan_probe.cjs(临时诊断,不入库)。
- 审计/评估报告全文由 5 个 subagent 输出,要点已并入上文;教育方法论调研报告全文可用。
