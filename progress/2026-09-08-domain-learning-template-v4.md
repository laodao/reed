# 领域学习：知识点内容模板 v4（类型化模板）+ 公式/著作/相关区（2026-09-08）

## 需求
1. 讲义支持数学公式显示；
2. 增加两个区：相关知识点、相关著作（论文等，有则显示）；
3. 用户指出：不同知识类型模板应不同——公式、著作不是每种类型都有。

## 收敛演进（设计文档 v4 重写）
- v2 17 小块（碎）→ v3 统一四区壳（抹平类型差异）→ **v4：按知识本质类型给模板，模板由粗粒度"区"组成**；
- 模板数=知识本质类型数（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open，6 类封顶），每类模板区集不同：
  - K-stmt（定理/法规）→ 本质/陈述条文/依据证明(公式+折叠)/示例反例/works(提出文献)；
  - K-concept → 本质/定义/机制(可公式)/示例注意/related；
  - K-agent → 主张/贡献/著作是主内容…
- 区=整段 md（图/表/mermaid/KaTeX），非碎片卡片；"有则显示、无则消失"；
- 公式只强配 K-stmt 与机制类；著作强配 K-agent/K-stmt，其余有则显示。

## 原型改动
- mock-data：CardSection{key,title?,style?('intro'|'body'|'note'|'review'),md,folded?}；ConceptCard+works[]、RelatedRef（父级由 relations 派生传入）；四个样例：MoE(K-concept full,works 论文)、贝叶斯定理(K-stmt 数学,works Bayes 1763,公式+证明折叠)、反洗钱法(K-stmt 法规,works 法规/FATF)、重排(lite)。
- SectionLesson.vue：重写为通用区渲染（标题/style 按模板）+ works 区 + related 区（chips 点击跳转）+ 深水折叠「展开全文」+ 区级没懂；key→默认标题映射。
- DomainLearningSpace：currentRelated computed（由 space.relations 直接邻居派生）+ gotoRelatedConcept 跳转。
- KaTeX：MarkdownViewer 已含 plugin-math（无需改动）；mock 块级公式按 `$$` 独立行规范书写。

## 验证（CDP，零页面错误）
- MoE：4 区+相关知识点区+相关著作区（Mixtral 论文）、行内+块级公式（katex-display=1）；
- 贝叶斯定理：区标题序列 本质/表述/推导依据/示例与注意/检验/相关著作，KaTeX 17 个（display=2），推导折叠→展开成功，works 显示 Bayes 1763；
- 反洗钱法：works 法规/FATF、条文折叠；related 点击跳「反洗钱」成功。
- 修复：块级公式 `$$` 同行会退化为行内 → 规范为独立成行（已写入设计文档 §2.2）。
- 截图：progress/_v4_bayes_math.png / _v4_moe_template.png。

## 状态
类型化模板 v4 完成待 GUI 走查；未提交；进度记录本文件；设计文档 content-template-design.md（v4）。
