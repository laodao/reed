# Categorization and Representation of Physics Problems by Experts and Novices（专家-新手差异 / 图式与组块奠基研究）

- 链接: http://matt.colorado.edu/teaching/highcog/spr10/readings/cfg81.pdf （全文 PDF 已抓取转换；原刊 DOI: 10.1207/s15516709cog0502_2）
- 作者: Michelene T. H. Chi, Paul J. Feltovich, Robert Glaser
- 时间: 1981（Cognitive Science, 5(2), 121–152）
- 来源: Cognitive Science（被引 ~9800，专家-新手研究的奠基实验）
- 证据等级: 经典实验研究（排序任务 + 口语协议，8 专家 vs 8 新手，两个研究）

## 原文摘录（保留原文不翻译）

> "Results from sorting tasks and protocols reveal that experts and novices begin their problem representations with specifiably different problem categories, and completion of the representations depends on the knowledge associated with the categories. For, the experts initially abstract physics principles to approach and solve a problem representation, whereas novices base their representation and approaches on the problem's literal features."

> "For experts, surface features do not seem to be the bases for categorization. ... It appears that the experts classify according to the major physics principle governing the solution of each problem. ... If 'deep structure' is defined as the underlying physics law applicable to a problem; then, clearly, this deep structure is the basis by which experts group the problems."

> "[experts] 'see' a great number of problems [as similar], whereas the novices 'see' a variety of problems that they consider to be dissimilar because the surface features are different."

> "Our prediction was that novices would group together problems that have the same surface structure, regardless of the deep structure, and experts would group together those problems with similar deep structures, regardless of the surface structure. Individuals of intermediate competence should exhibit some characteristics of each."

（配套经典：Larkin et al. 1980 —— 专家把知识以"大组块（chunks）"形式存储与提取，表现为工作记忆处理单元更大；de Groot 1965 棋类实验同源。）

## 机制拆解（条件→机制→效果量）

- 条件：对同一组问题材料做分类/表征，比较专家与新手。
- 机制：长时记忆中知识的组织方式决定知觉与表征——专家的图式以"深层原理"为索引（conservation of energy...），新手的图式以"表面特征"为索引（滑轮、斜面、转盘）；组块 = 把多个表面元素绑定到一个原理节点，绕过工作记忆 4 组块限制（与 CLT 条目互洽）。
- 效果量：定性奠基研究；后续 expertise 文献把"知识组织质量"确立为专长核心成分（而非知识数量）。
- 中等水平者表现出两类特征的混合 —— 表征质量是连续变量，不是二元身份。

## 边界与反例

- 领域特定：物理专家在非本领域即退化为新手；不存在通用"专家思维"可平移。
- 表面相似并非总是误导——在"同族问题"练习中表面模式有预测价值（novice 利用表面特征有时正确）。
- 跨 40 年复现良好，但"教新手按深结构分类"能否直接提升解题，证据中等（需要配合练习与反馈）。

## 对我们的适用性

1. 概念图（dl_concept）的边不应按"词面/主题相似"连接，而应按深层结构连接："同为反馈机制""同为降复杂度手段""互为反例"。提炼管线给 AI 的 linking prompt 应要求显式给出连接的"原理类型"（因果/方法/反例/前提…），这直接复刻 Chi 的 deep-structure 索引。
2. AI 自动聚类知识时用 embedding 相似度（≈表面特征）做初筛可以，但成图前必须经 LLM 二次判断"结构关系"——否则给用户一张"新手式概念图"。
3. mastery 状态里"已理解"的操作化定义可以是"能按深结构归类"：验证题出"这两条知识哪个与 X 同属一类原理？"，比复述更能区分真假理解。
4. 用户成长路径 = 概念图从平面主题网络向分层原理网络的演化——这个结构指标（如"按原理聚类的模块度"）可作为学习包质量的量化信号。
5. 中等水平者混合两类表征 → 给不同 mastery 的用户渲染不同抽象层级的概念图（新手多表面示例锚点，熟手直接原理视图），也是 expertise reversal 在组织层的体现。
