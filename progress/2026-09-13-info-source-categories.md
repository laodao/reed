# 新闻来源 → 信息来源（类别 Tab 化 + 工作流适配）2026-09-13

> 用户需求原文：
> 「设置模块的新闻来源，改为信息来源，新闻来源作为其中一个类别，新闻来源内部结构不变，
> 这个界面设计成 tab 页形式，新闻来源是其中一个 tab，来源类别可以新增，新增一个类别，
> 就多一个 tab。系统中有大量功能需要信息来源，比如领域学习模块……不同领域都有不同的
> 信息来源，因此要允许创建众多的信息来源。之前有好几个工作流在使用新闻来源的连接爬取
> 数据，如果这次修改会影响这几个工作流，同步修改这几个工作流。」
>
> 用户补充裁决：
> 1. 类别内部**沿用两级**（分组 → 来源），但**允许不要分组**（领域来源不一定像新闻那样
>    再分国际/政治/经济/科技）；
> 2. 底层表**重命名为通用 info_source_\***（列结构不变，带存量数据迁移）；
> 3. 领域学习是否接入 → 先听现状说明再定（本次不动领域学习）。

## 一、数据模型（三层，第三范式）

| 层 | 表 | 说明 |
| --- | --- | --- |
| 类别 | `info_source_categories` | 设置界面**一个类别 = 一个 tab**；内置「新闻来源」(id=`news`, is_builtin=1) 全局共享、禁删禁改；用户可新增任意类别（金融/物理/数学…） |
| 分组 | `info_source_topics` | 类别内一级分组（原 `news_topics` + `category_id` + `is_default`）；每个类别的「未分组」默认分组 id 固定为 `ist_default_<categoryId>`（主键天然保证唯一） |
| 来源 | `info_sources` | 名称 + URL（原 `news_sources`，列结构不变） |

- **「允许不要分组」的落地**：来源仍归属分组（不新增冗余的 category_id，保持第三范式），
  但界面新增来源时分组可留空 → 后端 `ensureDefault(categoryId)` 按需建「未分组」分组并落入。
  默认分组是真实行、以「未分组」标签呈现，不可改名/删除（级联删类别时随类别一起清掉）。
- 迁移 `src/core/database/migrations/create-info-sources.ts`（取代 `create-news-sources.ts`）：
  - 新装：建三表 + 预置内置类别 1 + 分组 5 + 来源 75（与 `shared/types/news-topics.ts` 同源）；
  - 存量（Electron/SQLite 路径）：`news_topics → info_source_topics`、`news_sources → info_sources`
    **整体 RENAME**（用户自建分组/来源一条不丢），分组补 `category_id`（回填 `news`）与
    `is_default` 列，旧索引名清理后按新命名重建；
  - 存量（**Web/PG 路径，先 synchronize 再迁移**）：`web/server/index.ts:279-280` 是
    `createDataSource()` + `ds.synchronize()`，实体会**先建出空的 info_source_* 表**，
    此时迁移若只判断「新表已存在」就会跳过搬运，用户自建分组/来源将变成孤儿数据（界面上等于消失）。
    故迁移增加**幂等搬运分支**（`INSERT ... SELECT ... WHERE NOT EXISTS`，只补新表缺失的 id），
    且**不 DROP 旧表**（数据安全优先；旧表留着做安全网，日志打印搬运行数）。
    实测确认 TypeORM `synchronize` 不会删实体之外的未知表（探针：旧表 + 无关表行数均不变）。
  - 幂等：建表/补列/改名/搬运均先探测；预置按固定 id 查重；双端（Electron / Web）注册。
  - 顺序安全性：漂移检查在迁移之前跑，而改名后实体表名在旧库里「不存在」→ 漂移检查跳过
    （视为新装），不会误报 missingColumns。

## 二、设置界面（`src/renderer/src/views/Settings.vue`）

- 外层 tab「新闻来源」→「**信息来源**」；页面内改为**类别 Tab**（`el-tabs type="card"`）：
  一个类别一个 tab，tab 标题带内置标记与来源计数。
- 每个 tab 内保持原有「分组折叠列表 + 来源条目（favicon/启停/编辑/删除）」结构不变；
  默认分组显示为「未分组」并带 info 标签。
- **踩坑（已修）：类别 tab 文字被裁一半**。真因不是新写的样式，而是设置页外层左侧 tab 的
  `:deep()` 规则用了**后代选择器**（`.settings-tabs[data-v] .el-tabs__item` 等），
  同样命中 pane 里嵌套的类别 tab：
  - `:deep(.el-tabs__nav-scroll) { height:100%; padding:16px 8px }` —— 内层 tab 表头被
    塞进 16px 上内边距，而卡片式 header 是固定高 + `overflow:hidden` → 标签文字被顶出可视区，
    只剩一半；
  - `:deep(.el-tabs__nav) { flex-direction: column }` —— 内层 tab 被强制竖排。
  修法：把这些规则限定为**直接子元素**（`:deep(> .el-tabs__header ...)` /
  `:deep(> .el-tabs__content > .el-tab-pane)`），从根上禁止向嵌套 tab 泄漏。
  验证：`npm run build` 后检查编译产物 `out/renderer/assets/Settings-*.css`，
  外层规则全部变成 `... > .el-tabs__header .el-tabs__item`，泄漏型后代选择器计数为 0。
  同时把类别 tab 标题简化为「类别名 + 来源数」（内置标记移到内容区顶部）。
  排查中一度给该组 tab 加过 `--el-tabs-header-height: 46px` 余量，泄漏根治后已删除——
  类别 tab 恢复 Element 默认 40px 表头与默认字号/内边距，与其它 tab 视觉一致。
- 页头三个入口：**添加类别 / 添加分组 / 添加来源**；非内置类别可「改类别名 / 删除类别」
  （删除级联清空其下分组与来源，二次确认）。
- 来源对话框：类别 + 分组（下拉里不列「未分组」，留空即表示不分组）+ 名称 + URL
  （http(s) 前缀前端先校验一次）；编辑时若来源在默认分组，下拉显示为空。

## 三、IPC / 双端接线

- handler：`src/electron/ipc/handlers/info-source.handler.ts`（原 `news-source.handler.ts`），
  通道 `infoSourceCategory:*` / `infoSourceTopic:*` / `infoSource:*`；业务规则（级联、
  默认分组、内置保护、名称与 URL 校验）都在 handler，数据访问在仓库层。
- preload `electronAPI.infoSourceCategory/infoSourceTopic/infoSource`；
  Web `channel-map.ts` 同步映射；渲染端类型 `types/electron-api.ts` 同步。
- DB 管理器三处装配：`electron/database/index.ts`、`web/server/platform/web-database-manager.ts`、
  `core/database/database-manager.interface.ts`（字段 `infoSourceCategories` / `infoSourceTopics` / `infoSources`）。
- 平台级 handler：Electron `registerInfoSourceHandlers()` + Web `registerAllWebChannels()`。

## 四、工作流适配（受影响的采集链路）

1. **节点数据源改为以库为准**：`core/platform/workflow/nodes/news-nodes.ts`
   `resolveSourceUrls` 的 `topicId` 现在先查信息来源库（任意类别的分组，含用户自建），
   查不到（库不可用/分组为空）才回落到 `NEWS_TOPICS` 内置目录；`sourceIds` 走 `infoSources.listByIds`。
   → 采集不再被内置新闻目录锁死，任意领域类别都能被工作流采集。
   节点目录标签「新闻采集」→「**信息采集**」（节点类型 `crawl-news` 不变，老定义照常可用）。
2. **动态下拉新增三级来源**：`infoSourceCategories` / `infoSourceTopics` / `infoSources`
   （`RunInputForm.vue`、`NodeConfigPanel.vue`、`FormFieldRenderer.vue` 的数据源选项）；
   旧标识 `newsTopics` / `newsSources` 保留为**兼容别名**（等价于限定内置「新闻来源」类别），
   已存在的用户工作流定义无需迁移。
3. **联动升级为「候选收窄 + 自动填充」**：`utils/form-linkage.ts` 新增
   `filterLinkageOptions`，RunInputForm 用它对声明了 `linkage` 的字段收窄候选——
   用户看到的候选正是会被选中的候选（此前只自动填充、候选仍是全量，跨类别时会误导）。
4. **两个内置应用模板同步改造**：
   - `daily-news-brief.json`（每日热点早报）：start 新增「信息来源类别」`sourceCategory`
     （默认 `news`），「关注主题」→「来源分组」并挂 `linkage{watch:sourceCategory,matchBy:categoryId}`
     （默认值 `ai`，定时触发也能凑齐必填项），「新闻来源」→「信息来源」挂
     `linkage{watch:topic,matchBy:topicId}`；
   - `industry-weekly.json`（行业动态周报）：同上（分组默认 `finance`）。
   - 内置工作流模板更新由 `create-builtin-apps` 迁移按 `template_version != 0` 自动落到未接管定义。
5. 其他使用来源库的链路未受影响：`WorkflowRunDetail.vue` 仅把 `crawl-news` 当 HTTP 类节点展示；
   `builtin-app-templates.spec.ts` 的白名单同步新增三个数据源标识 + 新增「linkage 跟随字段
   必须存在」的模板护栏测试。

## 五、测试与验证

新增/改写：
- `tests/unit/migrations/create-info-sources.spec.ts`（11 项）：新装（1 类别 + 5 分组 + 75 源、幂等）
  + 存量升级（旧表整搬、用户数据不丢、category_id 回填、旧表与旧索引消失）
  + **升级后漂移检查通过**（文件库上跑 `checkSchemaDrift`：三表列/类型与实体完全对齐，
  应用启动不会因 schema 漂移被拦）
  + **Web 端路径**（synchronize 先建空表 → 迁移幂等搬运存量分组/来源，启停状态保留，
  旧表保留不删，二次运行不重复）。
- `tests/unit/repositories/info-source.repository.spec.ts`（8 项，双方言矩阵）：类别/分组/来源
  三层 CRUD、内置与默认分组护栏、按类别跨分组列表（回填 categoryId）、按 id 批量取仅启用、
  分组占用计数与级联删除。
- `tests/unit/electron/ipc/info-source-handler.spec.ts`（5 项）：类别删除级联（含默认分组）、
  内置与默认护栏、URL 校验、编辑移入未分组、按类别列表。
- `tests/unit/core/platform/workflow/crawl-news.spec.ts`（21 项）：新增「库内分组优先」
  「库空回落内置目录」。
- `tests/unit/renderer/utils/form-linkage.spec.ts`（11 项）：新增 `filterLinkageOptions`
  （含类别 → 分组 → 来源三级联动）。
- 删除：`create-news-sources.spec.ts`（迁移已重写）。

结果：本次相关 **7 个测试文件 / 67 项全绿**；`npm run build` 成功（main + preload + renderer
全量打包）；`npx eslint` 在新增代码上零 error（触及文件里的存量 error 均在未改动区域，
已用 `git show HEAD:` 比对确认）；`vue-tsc --noEmit` 新增代码零错误
（仓库基线存量 898 条，与本次无关，运行时仅 NodeConfigPanel 一处新错并已修）。
全量 `tests/unit` 剩余失败已用 **HEAD 基线工作区**对比确认全部为存量/并发会话在改的
模块（`gossip-event-report`、`asset-service-category`、`user-asset`、`workflow-repositories`
的 SQLite 串行门、`multi-tenant` 的 dialog/CharacterBinding），本次未触碰；
`system-agent-service` 的全量运行 10 红在单跑下 16 全绿，属并行测试下与并发会话改动的互相干扰。

## 六、未做（待用户决策）

领域学习接入信息来源：现状是 DL 只读 `wf_kb_retrieve` / `wf_web_extract` / `http_get` /
`web_search`，采集结果**不落库**、只作单轮上下文；`dl_project` 无来源字段，
全仓库没有「领域/空间 ↔ 固定站点清单」模型。本次只把通用信息来源能力做好，
是否给 DL 增加「领域信息来源（类别/分组/来源）」与本库打通，待用户决策。
