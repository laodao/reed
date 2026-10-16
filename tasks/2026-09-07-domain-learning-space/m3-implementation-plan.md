# M3 实施计划:遗留质量修复 + 间隔复习 + 统计导出(领域共学空间)

依据 design-v3.md §15 M3、content-template-design、M2 遗留项;用户 2026-09 决策:
同分支 feat/domain-learning 继续,**顺序 = 遗留修复 → 间隔复习 → 统计导出**,每里程碑提交+汇报,push 待指令。

## 0. 范围与边界(本版 M3 决定)

- 复用评估类(跨领域节点复用/通用图谱层/记忆服务)与「KB/资产深度互通」**不排入本期前段**——先本地可闭环、再评估互通(设计 §15 M3 末尾“届时再评估”);模板可视化编辑(content_md 导出完善)若时间允许并入 M3-C 导出线,否则 M4。
- 硬约束不变:长程/上下文/规划/记忆环节仍基于 agent-harness;动作落库仍经 dl 服务校验。

## 1. 里程碑

### M3-A 遗留质量修复
1. **invoke_skill 对内置学习技能返回空骨架**(M1-E 遗留):排查 discover_capabilities 目录为空/参数模板未命中的链路(系统工具 discover/invoke_skill → workflow skill 服务解析/渲染),修复内置学习技能可被研究/教学宿主 invoke 出有效产出;含回归(能 mock 断言 invoke 返回结构化产出)与真机抽验一条。
2. **概念挂树根归属优化**:研究宿主快照/提示词补「领域根 group」上下文,引导 agent 把新概念挂到合理 group 之下(仍地图人审,design §7 不变)。
3. **平台缺口书面交接**:agent-harness pack 工具命名空间冒号被 LLM API 拒绝(影响 EP/LW/dl)记入 tasks/agent-harness 交接文档(含现绕行方案),不在本包自改平台。
- 验收:学习技能 invoke 有效产出(单测/真机一条);dl 研究新概念归属人审更顺;交接文档就位。

### M3-B 间隔复习(design §13「需复习」隔日回访 + §15 M3)
- 数据/服务:dl_project pace 复用或新增复习配置;「需复习」候选 = mastery=review 或 到期未复习概念;DlPaceSchedulerService 扩展或独立 DlReviewScheduler 按 interval 出复习任务(经 agent tutor/assessor 走 review);
- IPC/前端:空间设置加「间隔复习」组(开启/间隔/每轮条数);Space 页复习入口/复习队列展示(assessor 自测 → ack 推进 mastery review→learning/mastered 语义);
- TDD:候选选取、到期判定、ack 流转(复用 mastery 门控);真机一条复习问答。
- 与既有 ackMastered/ackConfused/mastery_log 语义对齐(trigger=review/expire)。

### M3-C 学习统计与导出(design §15 M3)
- 统计:空间级进度视图扩展(研究/掌握/复习曲线、未解队列趋势)——dl:get-space-stats(或 view 扩展)+ 前端面板;
- 导出:讲义合集(content_md 拼接,按目录/流程排序,md 导出)、Atlas 地图 PNG(浏览器端 svg→png 截图走查)、可选 PDF(视既有导出基建评估);
- IPC + store + UI 按钮;单测聚合/导出内容;真机导出文件生成与打开。
- (若纳入模板可视化编辑,另立 M4。)

## 2. 验收口径(汇总)
- 每里程碑:单元/回归绿 + vue-tsc 相关零新增;M3-C 加真机文件产物走查;重启持久化沿用例;push 待用户指令;进度记录 progress/2026-09-0x-domain-learning-m3-*.md。

## 3. 风险
- invoke_skill 链路涉及 workflow 技能服务与 agent 目录两套来源,排查可能牵连既有技能 → 改动最小化 + skill 回归全跑;
- 复习/掌握度语义易与现有门控耦合 → 只新增 review 状态转移,不碰 mastered 解锁逻辑;
- 导出 PNG/PDF 依赖渲染层能力 → 先 svg 序列化 + 保存对话框,PDF 视评估结果。
