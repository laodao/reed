# 任务：新闻来源 → 信息来源（类别 Tab 化 + 工作流适配）

- 日期：2026-09-13
- 状态：已交付（领域学习接入待决策）
- 进度记录：`progress/2026-09-13-info-source-categories.md`

## 需求

1. 设置模块的「新闻来源」改为「信息来源」，新闻来源成为其中一个**类别**；
2. 界面 tab 化：一个类别一个 tab，可新增类别（新增即多一个 tab）；
3. 新闻来源内部结构不变（分组 → 来源）；
4. 系统有大量功能需要信息来源（如领域学习：金融/物理/数学各不同），要允许创建众多类别；
5. 受影响的既有爬取工作流同步修改。

## 用户裁决

| 问题 | 裁决 |
| --- | --- |
| 类别内部层级 | 沿用两级（分组 → 来源），但**允许不要分组** |
| 底层表命名 | 重命名为通用 `info_source_*`（列结构不变，带存量数据迁移） |
| 领域学习是否接入 | 先说明现状，用户再决策（本次不动） |

## 设计要点

- 三层模型：`info_source_categories`（tab）→ `info_source_topics`（分组，含每类别唯一的
  「未分组」默认分组）→ `info_sources`（名称 + URL）。
- 「不要分组」= 新增来源时分组留空 → 后端按需创建默认分组（`ist_default_<categoryId>`），
  不引入 `info_sources.category_id` 冗余列，保持第三范式。
- 存量升级用 RENAME 而非搬数据：用户自建分组/来源零丢失；分组补 `category_id`/`is_default`。
- crawl-news 节点的 `topicId` 解析改为「库优先、内置目录兜底」，使任意类别（含用户自建）
  的分组都能被工作流采集。
- 工作流动态源新增 `infoSourceCategories/Topics/Sources`；旧 `newsTopics/newsSources`
  保留为兼容别名（限定内置新闻来源类别）。
- 联动机制升级：`linkage` 现在同时**收窄候选**与自动填充（跨类别三级联动可用）。

## 影响面清单

- 数据库：迁移 `create-info-sources.ts`（新增，替代 `create-news-sources.ts`）；实体/仓库三套改名。
- 装配：`electron/database/index.ts`、`web/server/platform/web-database-manager.ts`、
  `core/database/database-manager.interface.ts`、`web/server/index.ts`。
- IPC：`electron/ipc/handlers/info-source.handler.ts`、`electron/index.ts`、
  `web/server/api/register-channels.ts`、`preload/index.ts`、`web/client/channel-map.ts`、
  `renderer/src/types/electron-api.ts`。
- 界面：`renderer/src/views/Settings.vue`（信息来源页 + 三个对话框）。
- 工作流：`nodes/news-nodes.ts`、`shared/types/workflow.types.ts`、`workflow-node-forms.ts`、
  `workflow-node-catalog.ts`、`RunInputForm.vue`、`NodeConfigPanel.vue`、`FormFieldRenderer.vue`、
  `utils/form-linkage.ts`、内置应用 `daily-news-brief.json` / `industry-weekly.json`。
- 测试：迁移 / 仓库 / handler / crawl-news / form-linkage 五处 + 模板护栏。

## 验证

- 本次相关测试全绿（62 项）；`vue-tsc` 新增代码零错误；全量单测仅余 3 条存量红（无关模块）。
- 手工验证建议：设置 → 信息来源（切类别 tab / 新增类别 / 不选分组添加来源 / 删除类别）→
  工作流「[内置] 每日热点早报」运行表单（类别 → 分组 → 来源三级联动）。
