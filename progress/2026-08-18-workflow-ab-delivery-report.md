# 工作流 A+B 批交付报告（用户离线期间自主推进）

> 日期：2026-08-18 ｜ 分支 feat/workflow-engine ｜ A+B 全部 11 项交付，129/129 全绿

## 交付清单（6 个提交）

| 片 | 提交 | 内容 | TDD 抓出的引擎缺陷 |
|----|------|------|--------------------|
| A1 | c8fa41eb | sys 变量/条件运算符(regex·starts·ends)/maxNodeRuns 护栏/start select 参数 | ① 失败中止被误判用户取消（同步置位 pendingFailureError）② 重试期间被静默收敛误 finalize（pendingRetries） |
| A2 | c1854968 | kb-qa（RAG 一体：检索+context 拼接+生成+sources）/ report（markdown/docx 落盘+前端打印导出） | — |
| A3 | 4c91c72d | 审核三模式：choose（选项路由，复用 branch 边）/ input（文本编辑提交）/ review 不回归；P1 校验器放行 + P2 白名单放行 | ③ 续驱在任务在飞时 finalize → 后续节点被误标 cancelled |
| A4 | (本批) | RunInputForm 运行表单化（5 类型+必填+默认值）/ VariablePicker 变量选择器（sys/start/节点输出，光标插入+兜底） | — |
| B5 | (本批) | 编辑器试运行抽屉（画布节点实时着色）/ LLM 视觉模式（toImageDataUrl 三形态归一化——P6） | — |
| B6 | (本批) | 4 份内置模板（RAG/批量翻译/审核流/定时摘要）+ 从模板创建入口；模板单测（P11） | — |

## 评审修正案落地核对

| 修正项 | 落地片 | 状态 |
|--------|--------|------|
| P1 choose×校验器冲突 | A3 | ✅ 4 用例 |
| P2 input×白名单冲突 | A3 | ✅ 2 用例 |
| P3 report Web 端边界 | A2 | ✅ markdown+前端打印 |
| P4 kbQaContextMaxChars 常量 | A2 | ✅ |
| P5 maxNodeRuns 计数语义 | A1 | ✅ 专测（重试 maxNodeRuns=1 不误杀） |
| P6 imageInput 归一化 | B5 | ✅ |
| P7 sys 保留字/遮蔽 | A1 | ✅ |
| P8 required 类型感知 | A1 | ✅ |
| P9 inputs-list 随 A1 | A1 | ✅ |
| P10 光标插入兜底 | A4 | ✅ |
| P11 模板单测 | B6 | ✅ 4 用例 |
| P12 验收步骤 | 各片提交含验收 | ✅ |

## 引擎缺陷修复汇总（3 项，均为潜伏竞态）

1. 未恢复失败同步置位（失败中止 vs 用户取消区分）——A1
2. 重试等待期间禁止静默收敛（重试后失败误报 succeeded）——A1
3. 续驱等 settled 信号（任务在飞时 finalize 误标后续节点 cancelled）——A3

## 组件总数

24 → 26（kb-qa + report）。一致性自检全绿。

## 待续（任务清单）

C1 成环（先细化设计评审）→ C2 对话集成 → C3 REST API → C4 临时知识库 → C5 OAS → D1 QA 知识库 → D2 rerank → D3 权重暴露
