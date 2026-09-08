# 领域学习：知识点块化展示原型（2026-09-08）

## 任务
content-template-design v2 定稿后，用户确认并更新原型界面——真机走查块化展示是否优于线性图文。

## 改动

### mock-data.ts
- 新增类型：`EssenceType`（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open）、`KnowledgeBlock`（type/title?/variant?/collapsed?/md）、`ConceptCard`（essenceType+blocks）；ConceptNode +`card?`。
- `attachCard(spaceId, conceptId, card)` + 三个块化样例（对齐 content-template-design §3.3）：
  - **rag·rerank**：K-concept **lite**（本质/定义/示例/反例/自测 5 块）；
  - **llmfrontier·moe**：K-concept **full**（本质/为什么学/定义/类比/机制[含 mermaid]/结构/辨析/示例/反例/易错/自测 11 块）；
  - **fincompliance·law**：K-stmt **full**（本质/为什么学/陈述条文[statutory]/依据/应用/案例/风险红线/边界/自测 9 块，条文与案例默认折叠）。

### BlockViewer.vue（新）
块化渲染器：块卡片流（按 type 图标/标题映射 + variant 徽标）、顶部**块目录 chips**（锚点滚动）、**深水块默认折叠**（mechanism/justification/case 等 + 手动开关）、块级**「没懂」按钮** → emit notUnderstand；反例/自测/风险三类视觉区分（左边框色）。正文复用 MarkdownViewer（图/表/mermaid/公式均可用）。

### DomainLearningSpace.vue（中栏）
有 `currentConcept.card` → BlockViewer；否则旧 lesson（MarkdownViewer）作对照/兼容；都无 → 讲义生成中。`onBlockNotUnderstand` 演示块级没懂反馈文案。

## 验证（CDP，零页面错误）
- K-stmt law：9 块渲染、statutory variant 标注、条文/案例默认折叠（body 隐藏）正确；
- K-concept moe：11 块（含辨析/易错）、mermaid svg 渲染、机制块默认折叠 → 点折叠按钮展开成功；
- 「没懂」按钮 → 反馈"已记下：你在「…」的「…」没懂"；
- K-concept rerank lite：5 块渲染（先展开检索链路分支后可见）；
- 修复：BLOCK_META 补 `boundary` 映射（原裸显 type）。
- 截图：progress/_block_moe_full.png / _block_law_stmt.png / _block_rerank_lite.png（不入库）。

## 状态
块化展示原型完成待 GUI 走查；未提交；进度记录本文件。
