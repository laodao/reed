# 学习科学 / 认知科学证据存档索引（知识库"大脑"专项）

日期: 2026-09-16 ｜ 调研焦点: 知识提炼形态、复习节奏、验证机制的循证结论 ｜ 共 15 条目

所有"原文摘录"均从标注来源实际抓取并逐句核验（PDF 全文 / PubMed efetch / ERIC API / Semantic Scholar API / Nature 页面 / Anki 官方文档 / arXiv HTML）；未能核验原文的内容在条目内显式标注。

| # | 文件 | 主题 | 核心结论 | 证据等级 | 年份 |
|---|------|------|----------|----------|------|
| 01 | retrieval-practice-adesope-2017.md | 检索练习/测试效应 | 检索练习 > 重读与一切对照；反馈放大、回忆式>识别式；附 Yang 2021 课堂元分析 g=0.499 | meta-analysis ×2 | 2017/2021 |
| 02 | ai-tutor-rct-kestin-2025.md | AI 导师（Bloom 2σ 的 LLM 版） | 结构化 AI 导师 vs 主动学习课堂：0.73–1.3σ，用时更少；依赖预写答案+脚手架，仅限 understand/apply/analyze | RCT | 2025 |
| 03 | fsrs-algorithm-and-papers.md | 间隔重复调度算法 | DSR 三变量记忆模型 + 个性化参数 + 目标保持率；Anki 官方采用；幂律遗忘曲线 | 工业级实证系统（KDD/TKDE 论文） | 2022–2026 |
| 04 | distributed-practice-cepeda-2006.md | 间隔效应 | 最优间隔 ≈ 保持期的 10–20%，ISI 与保持期联合作用；间隔不是越长越好 | meta-analysis（317 实验） | 2006 |
| 05 | dunlosky-2013-ten-techniques-utility.md | 十大学习技法评级 | 高效用=检索+间隔；中=精细询问/自我解释/交错；低=总结/高亮/重读（流畅错觉） | 系统综述 | 2013 |
| 06 | bjork-1994-desirable-difficulties.md | 合意困难理论 | 训练期表现 ≠ 长期保持；五类困难（间隔/交错/稀反馈/测试/扩展提取）反向提升长期表现 | 理论（奠基） | 1994 |
| 07 | forgetting-adaptive-richards-frankland-2017.md | 遗忘的适应性价值 | 遗忘提升灵活性、防止过拟合、促进泛化；记忆目标是优化决策而非无损传输 | 理论综述（Neuron） | 2017 |
| 08 | protege-effect-chase-2009.md | 学习 by teaching / protégé effect | "教代理"比"为自己学"投入更多、学得更多，低成就者获益最大；需代理真实可考可错 | 实验研究 ×2 | 2009 |
| 09 | cognitive-load-theory-sweller-2019.md | 认知负荷理论 | 工作记忆 ~4 组块；图式=压缩；卡片粒度=元素交互性；expertise reversal：呈现方式须随掌握状态反转 | 综述 | 2019 |
| 10 | sleep-consolidation-rasch-born-2013.md | 睡眠与巩固 | SWS 中再激活→系统巩固→细节让位于要义；巩固需跨夜时间，当日重复≠巩固 | 综述（Physiol Rev） | 2013 |
| 11 | self-explanation-bisra-2018.md | 自我解释 + 理解分级 | 诱导自我解释 g=0.55；作者建议研究"计算机生成解释提示"（LLM 落点）；SOLO/Bloom 分级参照 | meta-analysis（69 效应量） | 2018 |
| 12 | llm-generated-retrieval-practice-2025.md | 2024-2026 LLM 学习工具 | LLM 出题的增益来自检索练习本身（89% vs 73%）；质量闸门与溯源校验是硬边界；领域证据尚弱 | 准实验+观点综述 | 2025 |
| 13 | bloom-1984-two-sigma-mastery.md | Bloom 2σ + 掌握学习 | 辅导×掌握学习=2σ（现代复现 0.4–1.0σ）；固定标准+可变时间；失败归因于教学 | 经典实验报告 | 1984 |
| 14 | expert-novice-chunking-chi-1981.md | 专家-新手 / 图式组织 | 专家按深层原理索引知识，新手按表面特征；知识组织方式（而非数量）决定专长 | 经典实验 | 1981 |
| 15 | retrieval-vs-elaboration-karpicke-2011.md | 生成式检索 vs 精细加工 | 凭记忆重建 > 开卷概念图整理；检索特异性机制；含概念图学派反方评论与双编码背景 | RCT（+同刊争议） | 2011 |

## 主题覆盖对照

1. 检索练习/生成效应 → 01, 15（生成效应的边界在 15 内说明）
2. 间隔重复/FSRS/desirable difficulties → 03, 04, 06
3. 精细加工/理解分级 → 05, 11, 15（SOLO/Bloom 在 11、13 内说明）
4. 图式/专家-新手/认知负荷 → 09, 14
5. 睡眠巩固/遗忘适应性 → 10, 07
6. 主动学习/产出式学习/Bloom 2σ/AI 导师 → 08, 13, 02
7. 2024-2026 LLM 个性化学习 → 12, 02（LECTOR/NotebookLM 评估线索在 12 内标注）

## 未尽事项（诚实声明）

- Bertsch 2007 生成效应元分析、Mayer 2022 多媒体原则、SOLO taxonomy 原始文献：未能抓到可引用原文（出版方拦截），仅在相关条目内以次级来源/背景方式提及并标注。
- ACM SIGDOC 2025 NotebookLM 论文（Albrecht-Crane）：ACM 页面 403，仅存标题与线索。
- Bloom 1984 原文 PDF 为扫描件无法提取，摘录经 Wikipedia 中转（内嵌 Bloom 原句并标页码）。
