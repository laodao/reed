# KE-4 · 图谱 provider + L0 系统知识 + 分层 UI（M-Ke3）

> 前置：KE-3。三块相对独立，可再按 A/B/C 顺序分三次提交。

## A. 长文图谱结构化提供方（评审 P1-4 修正后的真实工作量）

| 文件 | 内容 |
| --- | --- |
| `src/core/platform/agent-runtime/memory/structured-provider.ts`（新） | `StructuredKnowledgeProvider` 契约（id/supports/query + KnowledgeSegment） |
| `src/core/platform/services/longwriting/graph/graph-knowledge-provider.ts`（新） | 长文实现：**名称→ID 解析是主要工作量**（resolveEntities 要求 {type,name} 精确匹配，graph.service.ts:379——组装器做别名/部分名容错，逐类尝试失败跳过）；当前章推导（最新章节或入参携带）；组装 getRelations/stateAt/edgesAt 紧凑事实段；scanContradictions 在 **ConsistencyService**（:128）注入矛盾作为风险知识；budget（maxSegments/maxChars）硬截断 |
| 长文宿主 | 注册 provider + structuredQuery 通道进装配（通道A 结构化优先，通道B 记忆续装） |
| `chapter-graph.processor` 完成路径 | 本章事件摘要经知识模块写入 API 沉淀为 L3 记忆（source=chapter_graph，零额外 LLM） |

## B. L0 系统知识

- 快照：注册表计数摘要（模块/直连工具/pack 工具/工作流/技能 数量+要点），变更钩子（工具注册/工作流发布/skill 变更）刷新，generatedAt>24h 强制重算
- 注入：装配时几百字节摘要；详细目录仍走 discover_capabilities（catalogPacks 过滤已实现 da9cf5fb）

## C. 分层 UI（评审 P2-7 清单）

- `AgentMemoryView.vue`：pending/active 两 tab 改四层切换；`MemoryRow` 加 scope/source
- IPC 三件套：am:list-by-scope / am:add-manual（KE-1 已建）/ am:deactivate → preload + channel-map + handler 三处
- 审批卡升级：层级/来源标识

## 测试

- provider：topics→实体解析容错（别名/未命中跳过）；budget 截断；当前章推导
- L0：变更钩子刷新断言；超龄重算
- UI：四层浏览 + 手工录入 + deactivate 全链
- 冒烟：长文装配含图谱事实段（真实项目数据直查断言，零 LLM 成本）
