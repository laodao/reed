# 进度：领域学习「讲义导出 + 版本管理」实施完成

日期：2026-09-15
类型：功能实施（TDD 全程，258 tests 全绿）
关联文档：`tasks/2026-09-07-domain-learning-space/content-version-management-audit.md`

## 交付清单

### A. 知识点讲义正文导出（md / PDF / 长图）

| 步骤 | 产物 | 测试 |
|---|---|---|
| A1 纯规则 | `src/core/packs/domain-learning/rules/learning-lesson-export.rules.ts` | 7 tests |
| A2 平台渲染增强 | `src/core/platform/services/document-tools/markdown-enhance.ts`（KaTeX + mermaid） | 14 tests |
| A3 导出服务 | `src/core/packs/domain-learning/services/dl-lesson-export.service.ts` | 13 tests |
| A4 IPC + UI | handler/preload/channel-map/store + DomainLearningSpace.vue 讲义头导出下拉 | 通道一致性 ✓ |

关键设计：
- 复用平台 document-tools（严禁各业务自建渲染），新增 `learningLesson` 模板；
- KaTeX 字体只内联 woff2（Chromium 实际只用它），HTML 体积从 1.4MB → 372KB；
- Web 端无渲染器时降级为排版 HTML（与工作流长图节点同口径），前端提示打印；
- 公式提取按文档顺序编号、跳过 fenced/inline code、排除货币写法与转义 `\$`。

### B. 讲义版本管理（历史查看 / 预览 / 恢复）

| 步骤 | 产物 | 测试 |
|---|---|---|
| B1 迁移 | dl_card 唯一索引 `(project_id, concept_id, version)` + revision_note/change_source/changed_json 列 | 迁移幂等 ✓ |
| B2 版本服务 | `src/core/packs/domain-learning/services/dl-lesson-version.service.ts` | 5 tests |
| B3 IPC + UI | 3 通道 + 历史抽屉（预览/恢复/导出指定版本） | 通道一致性 ✓ |
| B4 节点审计 | dl_concept_log 表 + entity/repository + DlConceptAuditService | 6 tests |

关键设计：
- 恢复语义对齐平台范式（workflow_definition_versions / lw_chapter_versions）：**新建最新版、旧版永不删改**、verification 不继承、changeSource='restore'、revisionNote='恢复自 v{n}'；
- 节点审计 diffAndLog(before, after) 自动对比受监控字段，值相等跳过，attrs 整体 JSON 比较；
- mastery 变更仍走 dl_mastery_log（不重复）。

## 验证结果

- **26 个测试文件、258 个测试全部通过**（含真库迁移、真 KaTeX 渲染、通道一致性）
- typecheck 无新增错误（既有 workflow/web-server 错误与本次无关）
- 通道一致性护栏通过（handler/preload/channel-map 三端 dl: 键集合相等）

## 共享资产沉淀

- `src/shared/utils/domain-learning-labels.ts`：掌握度/讲义状态/本质类型/节点类型文案单一来源，前端 domain-learning-ui.ts 已改为引用（消除双端漂移）
- `src/renderer/src/utils/file-saver.ts`：新增 `base64ToBlob()`（PDF/PNG 经 IPC 传 base64，前端转 Blob 保存）

## 已知限制与后续建议

1. **dl_concept_log 接入点**：当前仅基础设施就绪，saveConcept/createConcept 等调用点尚未替换为 diffAndLog（避免大规模回归风险）；建议下一轮在 agent 动作与手工建点路径接入。
2. **dl_doc 仍休眠**：若启用需先补 version 与写入者。
3. **dl_project.prerequisites 全量替换**：尚无审计，建议复用 dl_concept_log 模式加空间级审计表。
4. **删除常态化**：仍缺 dl:delete-card / dl:delete-concept IPC（progress/2026-09-13 已列为建议）。
5. **真实 PDF/长图渲染验证**：单测用 fake renderer 验证契约；真实 Electron 隐藏窗口渲染需在 GUI 环境手工验证（CI 无显示器）。

## 状态

两项需求**完整交付**，可进入用户验收。