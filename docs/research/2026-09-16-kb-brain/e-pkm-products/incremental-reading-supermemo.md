# 渐进阅读 Incremental Reading（SuperMemo / Wozniak）

- 链接：https://supermemo.guru/wiki/Incremental_reading（经 web.archive.org 存档抓取）；扩展阅读 https://help.supermemo.org/wiki/Incremental_reading
- 作者：Piotr Wozniak（SuperMemo 创始人；Incremental reading 2000 年提出）
- 时间：2000 起，页面持续更新至 2020 年代

## 原文摘录（保留原文不翻译，资料存档，经 Wayback Machine）

> Incremental reading is **"a system of tools and strategies used in assisting reading, learning and retention of written knowledge."**

> It uses **spaced repetition to ensure high recall with minimal effort**.

> The process is described as a **"funnel of knowledge"**: web information becomes a personalized "selection of material," then key highlights are distilled, converted into durable knowledge via **cloze deletion**, and ultimately applied creatively in problem-solving.

> Extracts are transformed into active knowledge through cloze deletion, and the resulting questions are **"reviewed along a spaced repetition schedule."**

> It **"enhances the speed of reading, while simultaneously improving comprehension, applicability, and knowledge retention."**

> It **"simplifies and accelerates the process of transforming written articles into knowledge that lasts for life."**

> Both incremental reading and spaced repetition were **"pioneered by SuperMemo,"** with incremental reading dating to **2000**.

（supermemo.guru 有 Cloudflare 防护，以上摘录来自 Wayback Machine 快照的 WebFetch 结果；更细的步骤/priority queue 细节在 help.supermemo.org 登录墙后。）

补充：SuperMemo 体系的相关概念（官方文档传统表述）：
- **Priority queue**：所有阅读材料按优先级排队，每次只读优先级最高的片段；
- **Extract**：阅读中把选中段落"抽提"为独立条目，留待以后继续处理；
- **Cloze deletion**：把论断句挖空成问答卡，进入间隔重复调度。

## 机制/方法论拆解（中文）

**核心概念**
- **渐进处理任何材料**：不要求一次读完/处理完一篇材料——阅读被切成片段，按优先级分散在时间轴上推进。处理深度也渐进：原文 → extract（摘段）→ cloze（挖空成卡）→ 记忆。
- **知识漏斗（funnel of knowledge）**：网络信息 → 个人选材 → 高亮要点（extract）→ 挖空卡（cloze）→ 间隔重复巩固 → 用于创造性问题求解。**这是一条显式的"从文档到可用知识"的管道**，与我们"入库→提炼→调用"同构。
- **优先级驱动注意力分配**：材料无限、时间有限，用 priority queue 决定"现在处理什么"，低优先级材料自动衰减。
- **间隔重复保证留存**：提炼产物必须被"复习"才会变成长期知识。

**工作流**：导入网页/PDF → 排优先级 → 每天队列推送阅读片段 → 阅读中做 extract → extract 再精炼成 cloze 卡 → 卡片按 SM-2/SM-18 调度复习 → 写作时调用。

**为什么有效**：把"处理大文档"这个可怕任务拆成无限小的片段，降低启动成本；优先级+间隔重复匹配遗忘曲线与注意力稀缺。

## 局限与批评

- 工具界面极其古老复杂（SuperMemo for Windows），学习曲线臭名昭著；Wozniak 自己承认 2020 年采用度仍很低。
- 优化目标是**长期记忆留存**（考试型学习），不是知识综合与创作——cloze 卡是"记住"而非"发展想法"。
- 渐进阅读可能割裂长文档的论证结构（小说/长论证尤其不适配）。
- 与 Zettelkasten 社区长期论战：IR 说 ZK 不保证记忆，ZK 说 IR 卡片无法长出洞见。

## 对我们的适用性

1. **"漏斗"是我们提炼管道的成熟参照**：原文 → extract（原子知识/证据卡）→ cloze/quiz（讲义卡的测验题）→ 调用（写作注入）。我们的领域学习包（讲义卡）天然处在漏斗中段。
2. **优先级队列思想可用于"大脑的消化调度"**：入库排队提炼、按当前创作项目的相关性决定提炼深度与顺序，而不是无差别全量提炼——节省 token 成本。
3. **间隔重复可以直接内建**：原子知识卡+讲义卡接入简单 SM-2 调度，做"作者复习自己的世界观/方法论"，服务长篇小说跨年写作的一致性。
4. IR 的教训：渐进不等于碎片——对叙事文档的提炼要保持章节论证结构的完整性（先结构大纲后原子卡）。
5. cloze 化思路可自动化：从原子论断卡自动生成填空/问答，是讲义卡"测验"部分的低成本实现。
