# 知识点内容模型：块化结构与知识点模板设计（2026-09-08）

## 任务
用户反馈：当前"简单图文"不足以展示复杂知识点；应归纳知识点通常包含哪几方面内容（不同领域不同 → 多种知识点模板），并重新设计知识点内容展示为分块/卡片式。

## 依据（web 验证）
- Frayer Model（概念教学四格：定义/特征/例子/非例子）+ NSW examples & non-examples：概念边界靠 例↔反例 界定。
- 概念卡模板实践、Bloom/Marzano 知识维度（事实/概念/程序/元认知）、领域类型学 T1~T7。

## 设计要点（tasks/2026-09-07-domain-learning-space/content-template-design.md）
1. 知识点 = 有序"内容块"集合；块类型有限可枚举，哪些块/顺序由"模板"决定。
2. 块类型三族：认知基础族 12 种（overview/definition/analogy/mechanism/structure/formula/procedure/example/counterexample/property/evidence/relations）+ 领域扩展族 15 种（theorem/proof/paper/finding/data/standard/regulation/compliance/case/risk/history/school/controversy/practice/critique）+ 教学互动族 3 种（misconception/selfcheck/feynman，模板自动追加）。
3. 模板 = 画像 × 节点类型 → 有序块集 + 折叠策略；示例展开 3 个（T5 regulation、T1 axiom、T7 paper/method、通用 concept）。模板=软配置系统侧注册表，技能产出符合契约的块 JSON。
4. 展示 = 块卡片流：块目录 chips + 每块卡片（组件按块类型分发）+ 可折叠 + 块级「这块没懂」→ 精准没懂信号。
5. 数据影响：dl_card 增 blocks(json) 为主产物，content_md 降为派生（保留导出/兼容）。
6. skill 契约：explainer 输出 blocks；lesson-writer 打磨为可读块流；tutor/assessor 消费块与"这块没懂"。
7. 没懂拆解（D9 细化）：同块 ≥2 次 → 该块主题拆子概念入队。
8. 阶段：M1 基础族+3 模板+BlockViewer+blocks 建模+块级反馈；M2 扩展族全量+模板编辑+导出；M3 块级复习/引用/市场。
9. 风险：块 schema 宽松渲染容错、旧内容兼容兜底、M1 不做模板编辑器、与 Atlas 档案双视图同源不双写。

## 状态
- content-template-design.md 落盘待评审；v3 design.md 头部已加子设计索引。
- 未编码、未提交。

## v2 修正（2026-09-08，用户要专业判断，据此重写）

用户对 3 条自评"说不清楚"，要求基于教学设计与认知科学专业知识判断。补充检索 Merrill CDT/首要教学原理、Ausubel 先行组织者、概念辨别。修正结论并重写 content-template-design.md：

1. **块类型收敛**：原"基础12+领域15+互动3"平级集合 → **17 种通用原子**（认知 14：补 `origin`（先行组织者-为什么学）+`distinguish`（概念辨别-邻近对照）；领域差异不走新块类型，走"块的表现变体 variant"（definition statutory/formal、example case/benchmark 等）。
2. **模板主键**：画像×节点类型笛卡尔积（N×M 表）→ **本质类型（6 类：K-concept/K-oper/K-stmt/K-inst/K-agent/K-open）× 复杂度档位（lite/standard/full）**；画像只做默认档位/variant/排序偏好三项微调，不参与建模板。
3. **M1 克制确认正确**：不做模板编辑器；但默认模板质量=教学天花板 → M1 验收加"三类样例（K-stmt 法规 full / 深水概念 full / lite）真机走查优于线性图文"。
4. design-v3 §9 dl_card 与 §10 skill 契约同步块化（essence_type + blocks + content_md 派生）。
