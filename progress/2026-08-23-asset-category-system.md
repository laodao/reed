# 资产分类体系升级（分类实体化 + 分类驱动预览）

日期：2026-08-23
状态：完成（实测通过，已提交）

## 需求

1. 资产分类可添加——每增加一类业务就增加一个分类（原来 subCategory 是自由文本、无管理入口）
2. 分类要有定义：文件类型（允许形态）、是否可预览、预览所需的能力（预览模式/渲染模板）
3. 每日早报、行业周报类资产，预览应看渲染后的效果（长图），而非原始 markdown

## 设计

### 数据模型：asset_categories 表（新迁移 create-asset-categories.ts）

| 列 | 含义 |
|---|---|
| name | 分类名（唯一；与资产 sub_category 文本匹配，老数据零迁移） |
| code | 业务编码（可选，如 morning_report） |
| allowed_kinds | 允许的存储形态（JSON 数组，空=不限） |
| allowed_categories | 允许的大类（JSON 数组，空=不限） |
| previewable | 是否可预览 |
| preview_mode | 预览模式（auto/text/markdown/html/json/image/audio/video/report/none） |
| preview_template_id | 预览渲染模板（report 模式必填，DOCUMENT_TEMPLATES key） |
| sort_order / is_builtin | 排序 / 内置标志（禁删禁改） |

内置 9 个业务分类种子（与既有内置应用 save-asset 的 subCategory 一致）：
早报(report+morningReport)、行业周报(report+industryWeekly)、报告模板(markdown)、
视频文案/文案/网页摘要/网页转写/图文卡片/润色稿(markdown)。

### 分类驱动预览

- `AssetService.previewInfoFor(record)`：按资产 subCategory 命中分类定义 → {mode, templateId}；未命中/auto → null（沿用按存储形态的旧逻辑）
- `AssetService.renderAssetPreview(record)`：
  - report 模式：markdown + 业务模板 → 桌面端 `document-tools` 渲染 PNG 长图（data URL）；Web 端降级渲染 HTML
  - markdown 模式：generic 模板渲染排版 HTML
  - html 模式：原样返回
  - text/json/image/audio/video/auto/none → null（前端原生呈现）
- 资产中心（AssetCenter.vue）：
  - report 资产卡片异步加载渲染长图缩略图；大图预览显示渲染图/排版 HTML（iframe srcdoc）
  - 子分类 tabs 由分类定义驱动（带计数），未定义但有资产的子分类显示「未定义」
  - 「分类管理」弹窗：列表（名称/允许形态/可预览/预览模式/渲染模板/资产数）+ 新建/编辑/删除（内置禁改禁删）
  - 分类编辑器：report 模式强制选渲染模板（选项来自 DOCUMENT_TEMPLATES 注册表）

### 工作流节点联动

- save-asset 的 subCategory 字段：自由文本 → select-dynamic（source=assetCategories），从已定义分类选择
- NodeConfigPanel / RunInputForm 增加 assetCategories 动态源

### IPC / 装配

- 新通道：asset:categories-list / asset:category-create / asset:category-update / asset:category-delete / asset:preview-render / asset:preview-templates
- AssetCategoryEntity 注册进 entities 索引（TypeORM DataSource 共享）
- DatabaseManager 双端（Electron + Web）装配 assetCategories 仓库；迁移双端注册

## 关键实现要点

- 分类为全局配置（无 user_id，不区分租户；与新闻来源库同构），Repository 走 scoped API（无 userId 列自动透传）
- updateAssetCategory 先剔除显式 undefined 再合并校验（IPC handler 展开传参会带 undefined 字段，曾导致「分类名不能为空」误报——实测发现并修复）
- 渲染模板选项单一数据源：IPC 从 DOCUMENT_TEMPLATES 读，前端动态拉取，避免 key 列表硬编码漂移
- 删除分类仅删定义，资产保留原 sub_category 文本（不破坏数据）

## 测试

- 迁移：create-asset-categories.spec.ts（建表/幂等/9 种子/report 定义/更新不重复/唯一索引）
- 仓库：asset-category.repository.spec.ts（CRUD/JSON 数组列/排序/内置禁删）
- 服务：asset-service-category.spec.ts（17+1 项：分类 CRUD 校验、内置禁改禁删、计数合并、previewInfoFor、renderAssetPreview 各模式分支、IPC undefined 场景）
- 全量：1798 通过 / 115 失败（全部为既有基线，无新增失败）

## 实测（CDP 实机，13/13 通过）

- listCategories → 9 内置分类，早报/行业周报 = report + morningReport/industryWeekly
- previewTemplates → 8 个渲染模板
- 既有早报资产 previewRender → `data:image/png;base64` 长图（650KB）
- 分类 CRUD（含 IPC undefined 场景）✓；内置禁改/禁删 ✓；report 缺模板报错 ✓

## 文件清单

- 新增：src/core/database/migrations/create-asset-categories.ts、entities/asset-category.entity.ts、repositories/asset-category.repository.ts、tests/unit/migrations/create-asset-categories.spec.ts、tests/unit/core/database/asset-category.repository.spec.ts、tests/unit/core/modules/assets/asset-service-category.spec.ts
- 修改：shared/types/asset.types.ts（预览模式/分类定义/预览结果）、workflow-node-forms.ts、workflow.types.ts、core/modules/assets/asset.service.ts、asset-storage.service.ts（readStoredText）、workflow-boot.ts、database/entities/index.ts、database-manager.interface.ts、electron/database/index.ts、web/server/index.ts、web/server/platform/web-database-manager.ts、electron/ipc/handlers/asset.handler.ts、preload/index.ts、renderer/types/electron-api.ts、renderer/views/asset/AssetCenter.vue、renderer/components/workflow/NodeConfigPanel.vue、RunInputForm.vue
