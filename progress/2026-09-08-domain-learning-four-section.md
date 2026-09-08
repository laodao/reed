# 领域学习：知识点内容模型收敛为四区式（2026-09-08）

## 评审与收敛
用户评审 17 种小块 × 每块卡片 + 目录 chips + variant 徽标：**"太细太碎、复杂"**。

收敛为 **四区固定外壳**（content-template-design v3 重写）：
1. `essence` 本质：一句话是什么 + 为什么学（引言段，衬底弱化）
2. `detail` 详解：定义+机制/条文/公式/步骤（正文大段含图/表/mermaid；长条文/证明可整段折叠）
3. `edge` 边界：正例/反例/辨析/风险/易错 合成"示例与注意"（注意卡 + 对比表）
4. `review` 检验：出处与关联 + 自测

原则：外观统一（同外壳）、粒度=区（非小块）、领域差异下沉到区内写法（K-本质类型决定 detail 侧重与折叠点；画像只微调语气）。删 17 类型/chips/variant/逐块边框。交互只留：深水折叠 + 区级「这块没懂」。

## 原型改动
- `content-template-design.md`：v3 收敛版（取代 v2）。
- `mock-data.ts`：ConceptCard = essenceType + `sections[4 区]`（CardSection{key,md,folded?}），删除 KnowledgeBlock/blocks；3 样例重写为四区（rerank lite 4 区、moe full 4 区含 mermaid、law stmt full 4 区 detail 折叠）。
- `SectionLesson.vue`（新）：四区讲义渲染（essence 衬底/edge 注意卡边色/review 分割线 + 各区 hover「这块没懂」）；删除 BlockViewer.vue。
- `DomainLearningSpace.vue`：card → SectionLesson；区级没懂事件。

## 验证（CDP 零错误）
- MoE：四区齐全（本质/详解含 mermaid/示例与注意/检验标题），4 个区级没懂；
- Law：四区（条文 detail 折叠属性保留展示为折叠样式）、无 statutory 徽标残留；
- 区级「这块没懂」反馈生效。
- 截图：progress/_4sec_moe.png / _4sec_law.png。

## 状态
四区收敛版待 GUI 走查；未提交。
