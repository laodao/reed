# 讲义: 经验贝叶斯（Empirical Bayes）

- 概念 id: 4297f2bf-ff22-424a-82e8-7884b0937bca
- 本质类型: K-concept
- 状态: draft | version: 1
- 更新时间: 2026-09-08 16:23:43.689

## [区:essence] 本质是什么

**经验贝叶斯（Empirical Bayes, EB）**：先验 G(θ) 未知，先用数据把它估成 Ĝ，再代入贝叶斯公式：

$$p_{EB}(θ|y) ∝ f(y|θ)·Ĝ(θ)$$

与完整贝叶斯的关键差别：完整贝叶斯还要对 G 上的超先验积分，EB 直接把 Ĝ 当作真先验（plug-in）。

按数据来源分两型（务必区分）：
- **Robbins 型（经典 EB / 可交换设定）**：存在多个同型问题 (θ_i,X_i)，θ_i~G 可交换。估当前 θ 时只用**别的单元/历史数据**估 G——先验数据与当前似然数据分离。
- **plug-in 自用型（单一样本 EB）**：同一批数据既估 Ĝ 又做后验——这里才出现下文要判定的“双重使用”。

## [区:doubleUse] 为什么有“循环论证”质疑

质疑的本质不是逻辑循环（贝叶斯公式的推导无循环），而是**同一份证据被数了两次**：数据 y 既决定了先验 Ĝ(y)，又进入似然 f(y|θ)。后果：
1. 证据被重复计入 → 后验过自信、区间过窄；
2. Ĝ 的估计不确定性被当成 0（把随机量当已知）。

文献中“double use of the data”是被明确定义要避免的缺陷（Ignatiadis & Ma, 2025/26，arXiv:2512.08847）：他们的部分贝叶斯 p 值通过**只对主参数的(近似)冗余统计量做条件化**、并把 nuisance/先验部分分层建模来避免双重使用——“the partially Bayes p-values avoid double use of the data (unlike posterior predictive p-values)…the sharing of information across problems leads to improved calibration”。

## [区:noncircular] 何时不算循环

当先验估计所用的数据与后验所用数据**可分/条件独立**时，EB 不循环：它等价于“给先验套一个点估计超参的分层贝叶斯”，每条观测只进一次似然。

对应做法：历史/其他可交换单元数据估先验（Robbins）、留一（honest EB / LOO）、训练-测试切分（实证中常用，如 arXiv:2608.15619 用 annotator split 约束 EB 天花板估计）。

另一条思路：把 EB 看成完整分层贝叶斯的极限近似——当超参后验在 Ĝ 处集中（如组数 n→∞）时，∫p(θ|y,G)dΠ(G|y) → p(θ|y,Ĝ)，双重使用在渐近意义下消失。

## [区:criterion] 严格的可判定标准

**判据① 信息流/数据隔离（可机械判定）**
设 D_p=估先验的数据、D_c=进似然的数据。若 Ĝ 只依赖与 D_c 条件独立/不相交的 D_p（去掉当前观测后 Ĝ 不变）→ 判**不循环**；若 Ĝ 在函数上依赖当前观测本身 → 判**双重使用/伪循环**。

**判据② 相干性（coherence，形式刻画）**
plug-in 后验 p(θ|y,Ĝ(y)) 能否写成某超先验 Π 下的分层贝叶斯后验 ∫p(θ|y,G)dΠ(G|y)？固定 n 一般不能（Π(G|y) 不会恰在 Ĝ(y) 退化同时是数据真后验）。**两者之差 = 双重使用的度量**：差为 0 ⇒ EB 是合法贝叶斯近似；差非 0 ⇒ EB 不是任何联合先验下的相干贝叶斯规则（此判据属贝叶斯相干性传统，见待核验项）。

**判据③ 频率校准（可计算的统计检验）**
把 EB 当复合决策规则，在可交换单元/重复问题上检验覆盖率与风险是否达声称水平：覆盖系统性偏离标称 ⇔ 先验不确定性未传播 ⇔ 双重使用的可检验后果。

## [区:evidence] 依据与待核验

**已实读一手材料**：
- Ignatiadis & Ma, *Partially Bayes p-values for large scale inference*, arXiv:2512.08847（摘要）——对 double use of the data 的规避（分层共享 + 冗余统计量条件化）；
- arXiv:2608.15619（摘要）——经验贝叶斯天花板估计中采用 annotator split（数据切分）约束。

**待核验（needs_verification）**：Robbins(1956)、Casella(1985)、Berger(1985 §4.5)、Carlin & Louis(2000)、Efron(2010/2014)、Gelman et al. BDA3 §5.5 等教科书/综述对“数据用两次”的具体表述及判据②的相干性文献（如 Dawid 1982 well-calibrated/coherent rules）本回合未抓到一手原文引文，措辞以标准知识概括，需原文复核。

## 证据来源

- [paper] Partially Bayes p-values for large scale inference (Ignatiadis & Ma, arXiv:2512.08847) (https://arxiv.org/abs/2512.08847)
  引文: Similarly to the conditional predictive p-values of Bayarri and Berger, the partially Bayes p-values avoid double use of the data (unlike posterior predictive p-values). A key ingredient of our approach is that we model nuisance parameters hierarchically across problems; the sharing of information across problems leads to improved calibration.
- [paper] Bias-Corrected Ceilings of Emotion Predictability from Human Label Variation Based on Instance-Level Fano Bounds (arXiv:2608.15619) (https://arxiv.org/abs/2608.15619)
  引文: An anchored Dirichlet-mixture empirical Bayes estimator, bracketed between plug-in and NSB, recovers the human-consensus distribution; an annotator split, a noise deconvolution, and a fixed claim gate then attr…（抓取摘要片段）

## 相关著作

- Partially Bayes p-values for large scale inference — Nikolaos Ignatiadis; Li Ma (2025)
- Bayesian Data Analysis (3rd ed.), §5.5 Empirical Bayes — Gelman, Carlin, Stern, Dunson, Vehtari, Rubin (2013)
