# 领域共学空间 M2-F 进度记录:真机纵线验收(2026-09-08)

分支 feat/domain-learning · 真实 DeepSeek 提供商 + 真实 SQLite(dev:debug CDP 9222,验收空间「验收·贝叶斯入门」源自 M1)。

## 验收结果

### 确定性 IPC/服务链路(全部通过)
- dl:get-space-pace 默认 {enabled:false,30,true,true};dl:set-space-pace 存 {enabled:true,5,true,true} 成功;dl:scheduler-state → **mode=desktop, running=true**(桌面端首次 handler 调用自动启调度,零错误)。
- dl:set-space-profile(theory 预设:理论体系/特质/侧重[流程,三层结构])→ dl:get-space-view.profile 回读一致。
- dl:get-atlas-views → available=[flow,matrix,layers]、enabled=[flow,layers](画像侧重 ∩ 可用生效);flow.stages=3 阶段(先验→贝叶斯→后验,source/sink 正确);matrix 计数(concept/theory × prerequisite);layers 分组含卡片/著作计数;timeline=null(节点无时间 attrs,正确)。
- dl:list-questions 队列行读回一致(open 5 在开子研究后)。

### Agent 真机链路(基于 agent-harness,通过)
1. **无卡概念自动研究(研究引擎自动化的工具链实证)**:触发 research「先验概率」→ 宿主实际调用读工具白名单(wf_web_extract/http_get 维基/SEP/Yale/arxiv 尝试、超时重试、maxCalls 护栏触顶)与 KB 探测;本环境**无外网**(渲染层 fetch 全部 Failed to fetch)+ KB 无文档 → 依纪律无证据不落卡、不编造(「先验概率」仍无卡,researchState 不变)。**证据门禁与优雅降级行为符合 design §13**(网络可用环境应能完成出卡,见遗留)。
2. **未解问题自动开子研究(全闭环,通过)**:open 问题「讲义里贝叶斯公式分母 P(B) 怎么用全概率展开」→ research+focusQuestionId → 模型读讲义快照(dl_save_card/概念等动作齐全)后 dl_answer_question **questionId 由 runtimeContext 兜底回填**,该问题 status=open→answered(answerSource=ai_verified,答案含全概率公式 markdown);并自动沉淀草稿:新概念「全概率公式」+ 5 区讲义 v1(证据 3 条,均引自讲义,needs_verification=false)。重启后状态完好(total 3→4,openQ 6→5)。
3. **重启持久化(通过)**:杀 dev 干净重启后——pace(启用/5 分钟)、profile(theory)、新增概念与讲义、openQ=5、views enabled 全量恢复;better-sqlite3 保持 Electron ABI 无切换;boot 迁移 ensureColumn 对既有库幂等补 pace_settings 列无报错。

### UI 真机走查(CDP 截图 _m2f_atlas_flow.png)
- Atlas 页:ForceGraph 渲染(3 节点/2 边 svg)、画像 tag「理论体系」、视图切换条 [图谱/流程/三层结构];
- 切「流程」→ 3 阶段渲染 + 提示条;「空间设置」弹层:画像侧重 chips(时间线 off/流程 on/矩阵 off/三层 on)+ 3 个自动推进开关(启用/自动研究无卡概念/自动开子研究)。

## 遗留(环境受限,待网络可用环境复验;不阻塞代码功能)
- 自动采集「出卡」leg:本验收环境无出网(fetch 全失败)且 KB 无文档,未能让自动研究抓取真实外部资料后产出新卡;已实证的是工具白名单绑定/执行、超时重试、频控护栏、**无来源不落卡**的硬门禁与「不假装搜索」行为。联网复验方案:在可出网机器或已接入 KB 文档后跑同款 research 触发即应出卡。
- web_search 分支:无默认搜索引擎(设置未配置)→ 按计划跳过并提示(事件/快照含「web_search 不可用」),符合 §0 决策。
- 长文 GraphView(ForceGraph 另一宿主)视觉回归:本次未走查长文项目页(与 dl 验收域无关),建议在长文包日常使用时自检;代码层面 vue-tsc 已零新增错误。

## 变更
- 仅新增验收脚本/截图于 progress/(不入库):_m2f_probe1..10b.js、_m2f_atlas_flow.png。

## 结论
M2-F 核心验收达成:研究自动化(宿主读工具链+开子研究回填)、周期推进配置与调度运行态、重启持久化、图谱与增强视图、画像配置全部真机通过;自动「出卡」的联网 legs 因环境无网记录如上。push 待用户指令。
