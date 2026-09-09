# 设定集（Story Bible）P0-P3 详细设计与实施计划

- 日期：2026-09-09
- 状态：P0 实施中；P1-P3 待排期
- 前置：《设定功能对标调研》（story-bible-feature-gap.md）、《长文写作整体优化方案》（holistic-optimization.md）
- 决策记录：动态分组**不使用字典**（字典是租户级标签配置，无法承载字段模板/存储路由/提炼引导等结构化行为），**单独建表**。

---

## P0 动态分组 + 别名 + 关系小节（本轮实施）

### P0.1 数据结构（两张新表 + 一列）

```sql
-- 分类定义表：驱动设定集 UI、整理器提炼、存储路由
lw_bible_kinds (
  id          varchar PK,          -- bk_*
  key         varchar UNIQUE,      -- 'character' | 'nation' | ...（稳定标识）
  label       varchar,             -- '人物' | '国别'
  icon        varchar,             -- emoji
  sort_order  integer,
  storage     varchar,             -- 'entity'（映射既有 lw_* 表）| 'custom'（落 lw_custom_entities）
  entity_repo varchar NULL,        -- storage=entity 时：db manager 键名（lwCharacters/...）
  fields_schema text,              -- JSON: [{key,label,type:'text|textarea|number|select|tags',options?,required?}]
  prompt_hint text NULL,           -- 整理器提炼该类的引导（输出 JSON 说明）
  enabled     integer DEFAULT 1,
  user_id     varchar NULL, created_at, updated_at
)

-- 自定义实体表：storage='custom' 的分类数据落点
lw_custom_entities (
  id          varchar PK,          -- ce_*（与账本条目前缀区分：账本 ce_ 改名为 con_ 的事不做，历史数据无冲突——账本 id 带轮次后缀）
  project_id  varchar FK→lw_projects CASCADE,
  kind_key    varchar,             -- → lw_bible_kinds.key
  name        varchar,
  fields      text,                -- JSON（按 fields_schema）
  origin      text NULL,           -- JSON: {type:'discussion'|'manual'|'extract', cardId?, turns?}
  user_id     varchar NULL, created_at, updated_at
)
INDEX (project_id, kind_key)

-- 人物别名（既有强列表加列）
lw_characters ALTER ADD aliases text NULL   -- JSON: ["林师妹","晓哥"]
```

**内置种子（8 条，storage='entity'，幂等 upsert）**：overview→lwStoryOverviews / character→lwCharacters / plot→lwPlots / outline→lwOutlines / faction→lwFactions / skill→lwSkills / item→lwItems / location→lwLocations；**示范两个 custom kind**：nation(国别🏯)/camp(阵营🚩)（原型 v3.1 有、实现对缺）。用户可在设定集「＋管理分类」扩展。

fields_schema 初始值 = 既有强列的字段映射（如 character：name/gender/age/occupation/rolePosition/appearance/background/personality/abilities/majorEvents/aliases）；custom kind 自由定义。

### P0.2 后端

1. **实体/仓储**：`lw-bible-kind.entity.ts`、`lw-custom-entity.entity.ts` + 两 repository + 注册进 database-manager 接口。
2. **迁移**：`create-bible-tables.ts`（幂等，SQLite+PG 双方言；含建表 + 内置种子 upsert + lw_characters.aliases 加列）；Electron 挂 `runMultiTenantMigrations()`，Web 挂 `initDatabase()`。
3. **圣经统一读模型 `BibleQueryService`**（`src/core/platform/services/longwriting/bible.service.ts`——平台层，写作台 P1 直接复用）：
   - `listKinds(projectId)` → 启用分类列表（含每类条数）
   - `list(projectId)` → `[{kindKey, label, icon, entries:[{id,name,sub,origin,fields}]}]`：storage=entity 路由到既有仓储（含人物 aliases 合并进搜索/详情），storage=custom 查 lw_custom_entities
   - `detail(projectId, kindKey, id)` → 单实体全字段 + relations（lw_graph_edges 按实体）+ progression（P1 占位）
   - `customCreate/customUpdate/customDelete(projectId, kindKey, {...})`（custom 类；origin 由调用方带）
4. **IPC**（`longwriting:bible:` 前缀，守卫自动覆盖）：`bible:list / bible:detail / bible:custom:create / bible:custom:update / bible:custom:delete`；preload + web channel-map 同步（全路径键名）。
5. **整理器泛化**：`distill(projectId, scope)` 的 scope 扩展支持 `kind:<key>`——prompt 由该 kind 的 fields_schema（字段清单）+ prompt_hint 动态生成；卡片 `kind:'custom'`、`data._kindKey`；采纳落 `lw_custom_entities`（origin.type='discussion' 带 turns）。账本 scope→`kind:<key>` 推荐链路同步。
6. **人物别名贯通**：`persistCharacters` 写入 aliases；整理器人物 prompt 输出 aliases；设定集搜索与详情显示别名；提及检测（recognizeChapterEntities）后续批次接入。

### P0.3 前端（研讨室设定集）

- 设定集数据源从 8 路并行 IPC 改为 `bible:list` 单通道；分组/图标/待讨论提示全部由 kinds 驱动（动态分组达成）。
- 「＋新增」下拉由 kinds 动态生成；custom 类新增 → 轻表单（fields_schema 驱动，el-form 动态渲染）直接落库（origin.type='manual'）——与「对话中生长」并存：表单入口是补充，不是主路径。
- 详情抽屉：字段由 fields_schema 驱动渲染；**关系小节**（lw_graph_edges：谁↔谁/关系/起始章）；aliases 显示；溯源回看不变。
- 搜索匹配 name + aliases + sub。

### P0.4 测试

- 迁移幂等（跑两遍结构一致）+ 种子 upsert。
- BibleQueryService：entity/custom 两路由聚合、aliases 进搜索、detail 带 relations。
- custom entity 仓储 CRUD + 租户隔离。
- 整理器 `kind:nation`：动态 prompt 含字段清单、卡片产出、采纳落 custom_entities 且 origin 正确。
- 别名：persistCharacters 落库形状。

### P0.5 验收

真机：研讨室出现「国别」分组（空组待讨论提示）→ 说「设计一个大周王朝的国别」→ 卡片采纳 → 设定集出现条目 → 详情抽屉显示字段+溯源；人物详情见别名与关系小节。

---

## P1 状态时间线 + 引用可观测 + 伏笔（配合写作台重构）

### P1.1 progression 时间线（详情抽屉「演进」tab）
- 数据：`lw_entity_states`（快照）+ `lw_graph_edges.valid_from/until_chapter`（关系起讫）+ `lw_events`（事件）。
- 后端：`bible:progression`(projectId, kindKey, id) → 按章节排序的状态/事件序列。
- 写入闭环：研讨室改设定（卡片轻编辑/详情编辑）加可选「从第 ? 章起生效」→ 写 entity_states；章节提取管线已有。
- UI：详情抽屉第三区「演进」：竖向时间轴（章节号 + 状态变化）。

### P1.2 引用可观测（NovelAI Context Viewer 的可信感）
- 38 号上下文预览面板：每条目标注入选原因（`来源：人物卡·林晓（提及 3 次）/图谱关系/关键词命中`）——`assembleChapterGeneration` 各段已知来源，补标记即可。
- 反向：设定详情显示「被哪些章引用」（vectorIndex/entityState 关联查询）。

### P1.3 伏笔追踪
- 表 `lw_foreshadows`：id/project_id/content/planted_chapter/payoff_chapter(NULL=未收)/status('open'|'paid'|'dropped')/origin。
- 写入双通道：研讨室（对话提出 → 卡片采纳）；章节提取管线（ChapterGraphProcessor 增伏笔识别段）。
- UI：写作台章节队列徽标（"第 12 章有 2 个伏笔待收"）+ 洞察 tab 伏笔列表；研讨室设定集独立分组。

## P2 自定义字段进阶 + 层级 + 时间线视图
- fields_schema 类型系统完善（number/select/tags/引用其他实体），自定义实体详情按类型渲染编辑控件。
- 层级：custom_entities + locations 加 parent_id，设定集树状缩进；World Anvil 式「世界→大陆→国家→城市」。
- 时间线视图：lw_events 按 story_time 排轴，挂写作台洞察 tab。

## P3 系列级共享 + 实体快照 + per-scene 可见性
- `lw_bible_kinds.project_id` 可空=系列级（跨书共享宇宙设定）；
- 实体快照（Scrivener snapshots 式）；
- per-scene 可见性（自动引用 + 相关度覆盖后按需评估）。

---

## 实施计划

| 步骤 | 内容 | 验证 |
|---|---|---|
| 1 | 实体/仓储/迁移（两表+aliases 列+种子）+ 注册 | 迁移幂等单测 |
| 2 | BibleQueryService + IPC/preload/channel-map | 聚合/隔离单测 |
| 3 | 整理器 `kind:<key>` 泛化 + 采纳落 custom + 别名贯通 | 单测（动态 prompt/落库/origin） |
| 4 | 设定集 UI 动态化 + 新增表单 + 详情关系小节 | typecheck/build |
| 5 | 真机验收（国别全链路）+ 提交 | 视觉脚本扩展国别场景 |
