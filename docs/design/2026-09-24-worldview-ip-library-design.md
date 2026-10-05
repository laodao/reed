# 独立世界观库 + 角色 IP 库设计方案——先设计世界与人物，再写多个故事

- 日期：2026-09-24（2026-09-25 修订：模块定位改为长文写作子模块）
- 状态：P0+P1 已实施（2026-09-25，单测 17 项全过、typecheck 零新增错误）；P2 待排期
- 修订记录：2026-09-25 用户决策——两库作为**长文写作的子模块**实现，不新建一级业务包（理由：当前仅长文使用）。入口两轮演进：先定「项目列表页头部页签」；同日二次修订改为 **hover 展开二级菜单（主入口）+ 页内页签（页内导航）**——侧边栏「长文写作」项挂 `children`（项目 / 世界观库 / 角色 IP 库），鼠标悬停弹出浮层子菜单。后端不新建 pack，handler 并入 longwriting 包、领域服务放 `platform/services/longwriting/library/`。原「独立 pack + 两个一级菜单」方案废弃，依赖下沉原则保留（见 §3.1 决策四、§5.3、§6）。
- 诉求（用户原话要点）：①「不一定要剧情和设定一起做，可以只设计世界观，世界观设定好之后，可以设定很多故事。以修真为例，世界观包括修真的级别、门派、地域、国别、武器、丹药、仙草、法术、武功等等……是否可以有一个独立的世界观设计的功能，只设计世界观，然后写长文时引用？」②「人物角色也单独设计，作为 IP 设计功能，设计人物的背景、故事、性别、性格、灵根、天赋、技能等。」
- 上游：`2026-09-09-bible-p0-p3-design.md`（设定集动态分类）、`2026-09-09-story-bible-feature-gap.md`（对标矩阵，已标记「系列级共享 ❌ 项目隔离」缺口）、`2026-09-04-story-room-design.md`（研讨室）、`2026-09-23-knowledge-brain-narrative-addendum.md`（人物原型卡/设定卡，M0 未动工）

---

## 0. 结论摘要

1. **可行，且底盘比预期好**。现有代码里图谱边（多态 type+id）、实体状态切片、向量索引、bible 动态分类（`lw_bible_kinds`+`fields_schema`）、跨模块绑定表（剧集制作 `character_bindings` 的 linked/standalone 双态）都不要求改动就能承接「库」概念；真正的结构性缺口只有一个——**所有业务表硬挂 `project_id ON DELETE CASCADE`，没有 user→库→项目的中间层**（`src/electron/database/index.ts:1538-2216`）。
2. **总设计原则一句话：库存「世界常量」，项目存「故事变量」**。世界观与人物 IP 的静态设定（境界体系、门派沿革、人物背景/灵根/性格）放库（user 作用域，跨项目复用）；一切随故事变化的东西（人物受伤/死亡、关系演变、事件、伏笔）仍留在项目内既有机制（`lw_entity_state_snapshots`/`lw_graph_edges`/`lw_events`），零迁移。
3. **引用模式分层**：结构化实体条目（门派/地点/物品/功法/**人物**）走「导入即实例化 + 血缘（lineage）」——落成项目内既有表的一行，带 `source_type='library'` + 库 id 血缘列，现有名册解析/R9/状态切片/向量序列化全部无感；体系与规则类文本（力量体系、境界、规则禁忌）走「活引用直注入」——写作时从库直接读进 prompt，不落项目表。人物必须实例化（状态机需要项目内 id），体系必须活引用（永不产生故事内状态）。
4. **对标结论**：头部网文的世界观=「力量体系+地理+势力+种族+物品体系+功法体系+历史+规则禁忌+经济+日常」十维度闭环，且体系必须自带叙事功能（诡秘之主「选途径=选阵营=选敌人」）；AI 工具侧 NovelAI Lorebook / SillyTavern World Info 的「关键词触发+注入预算+优先级」是设定注入的事实标准，Novelcrafter 的 series 级共享正是本项目要补的库概念（对标矩阵见 §2）。
5. **模块定位（2026-09-25 定案）**：长文写作**子模块**，零新包。侧边栏「长文写作」挂 **hover 二级菜单**（主入口：项目 / 世界观库 / 角色 IP 库三项，鼠标悬停父项弹出浮层；**子项只存在于浮层，绝不进顶级菜单**——首版误用 flattenMenuItems 把三个子项拍平成顶级图标已修正：`config/menu.ts` 列表函数改为 `visibleMenuItems` 仅返回顶级项，侧边栏/首页共用；**浮层白屏复盘**：teleport 到 body 脱离 `.main-layout` 的 `[data-theme]` 作用域，而 `data-skin` 在 documentElement 上仍把 `--sidebar-item-active-bg` 覆盖成半透明渐变，半透明底+白字=白屏，浮层颜色已全部硬编码深色并对视口底部防溢出夹取）；`/longwriting` 页内保留页签做页内导航；另有两处内嵌入口（新建项目对话框「选世界观/选主角」；研讨室/写作台内的导入与沉淀按钮）。后端 handler 并入 longwriting 包（`longwriting:library:*` 通道族，沿用既有 ipcChannelPrefixes，web channel-map 按既有 232 条 `longwriting.*` 惯例追加）；领域服务独立成 `platform/services/longwriting/library/` 目录，不塞进 4000 行的 `longwriting-ai.service.ts`。数据层不变：8 张新表（6 库表 + 2 绑定表）+ 2 组血缘列 + 1 个新 prompt 分区。
6. **二级菜单的实现依据**：菜单注册表本就有 `children`/`hideSelf` 字段（`config/menu.ts:33,41`），当初子项被拍平纯粹因为侧边栏是自绘纯图标栏且无展开功能（`MainLayout.vue:150-152` 注释「子菜单若不平铺将不可达」）。悬停浮层（hover flyout）**不需要引入 el-menu 重构**：在现有 `li` 渲染上为含 `children` 的项加 mouseenter/mouseleave 浮层即可，改动收敛在 `MainLayout.vue` 的 nav 段 + 少量 CSS；`flattenMenuItems` 保留不动（Home.vue 首页卡片继续消费拍平列表）。

---

## 1. 现状盘点：设定与角色今天在哪里

### 1.1 数据：全部是「项目内」，没有「库」

| 概念 | 现状落点 | 作用域 |
|---|---|---|
| 世界观单行 | `lw_story_backgrounds`（era_type/social_structure/special_rules…） | 项目 |
| 地点/势力/地图 | `lw_story_locations` / `lw_project_factions`（country\|camp\|sect）/ `lw_project_maps` | 项目 |
| 技能/物品 | `lw_story_skills` / `lw_story_items` | 项目 |
| 自定义设定分类 | `lw_bible_kinds`（key/fields_schema/prompt_hint）+ `lw_custom_entities`（kind_key/fields JSON/parent_id） | kinds 全局、数据项目 |
| 角色 | `lw_story_characters`（含 aliases/role_position/source_type/source_episode_id） | 项目 |
| 无 project 先例 | `lw_global_settings`、`lw_temp_character/location_templates`（全局图像模板） | 全局 |

关键事实（backend 调研 §7）：所有业务表 raw DDL 都是 `project_id REFERENCES lw_projects(id) ON DELETE CASCADE`；仓储查询入口清一色 `getByProjectId`。**把 project_id 放开 nullable 会波及全部读路径，成本高——不做**。正确路径是：库用**新的无 project 表**（仿 `lw_global_settings` 先例，仅 user_id 隔离），项目侧用**绑定/血缘**衔接。

### 1.2 生成链路：设定如何进 prompt（引用点清单）

`assembleChapterGeneration`（`longwriting-ai.service.ts:1753-2032`）九段式：
- 「二、世界观设定」= `lw_story_backgrounds` → `buildBackgroundContext`（:2372-2405）——**这就是本次要挂库的注入点**；
- 「三、涉及角色」= 大纲 involved → `lw_story_characters` + 状态切片 → `buildCharacterFullInfo`（:2297）——**人物库导入后此路径零改动**；
- 图谱段（:2039-2196）吃 `lw_graph_edges`/`lw_events`/状态切片——项目作用域，不动。

一致性规则 R1-R11+RV（`graph/consistency.service.ts:11-18`）、R9 名册外人名、提及检测 `recognizeChapterEntities` 全部按「项目内实体表+别名」工作——导入实例化模式天然兼容。

### 1.3 前端：可照搬的现成模式

- 业务包注册：照抄 `src/renderer/src/packs/longwriting/index.ts`（manifest+routes+menuItems+`menuInsertBefore`），后端对称建 `src/core/packs/<id>/`；Web 端补 `src/web/client/channel-map.ts` 映射（longwriting 有 232 条先例）。**本方案已定案子模块形态，不新建包——此条仅作机制备注**，实际只需在既有 longwriting 包内追加路由与 handler（见 §6）。
- 库列表页模板：`src/renderer/src/views/LongWriting.vue`（卡片网格+创建对话框+封面）；条目编辑：`CharacterStage.vue`（1863 行，编辑对话框+关系+AI 生成+portrait 关联）；分组面板：`BiblePanel.vue` + `BibleQueryService`（kinds 驱动 + entity/custom 双存储投影）。
- 「引用外部库实体 vs 项目内独立实体」先例：剧集制作 `character_bindings.source_type='linked_lw'|'standalone'` + `bindCharacter(longWritingCharacterId,…)`——绑定表设计直接照搬。
- 角色挂独立形象库先例：`lw_story_characters.portraitId` + `linkPortrait/syncCharacterToPortrait`。
- 遗留勿学：`components/longwriting/wizard/*`（无 view 挂载的 v1 向导）；StoryEditor「设定集」按钮仍是占位（`StoryEditor.vue:114-124`）。

---

## 2. 行业调研：头部网文怎么搭世界观，AI 工具怎么做库

### 2.1 头部网文的世界观构成（拆到可建模的维度）

| 作品 | 标志性设定 | 对建模的启示 |
|---|---|---|
| 凡人修仙传（阅读量过亿级） | 灵根体系（五行属性×数量品质：天灵根/真灵根/伪灵根，变异灵根）、境界链（炼气13层→筑基→结丹→元婴→化神→炼虚→合体→大乘→真仙）、七大派/乱星海/大晋势力格局 | ①「资质体系」（灵根）与「境界体系」是两个独立维度，人物卡要分别挂；②境界分层要与地图分层联动（人界/灵界各有阶段） |
| 诡秘之主（起点月票纪录级） | 22 条非凡途径 × 10 序列（220 个序列），魔药+扮演法消化，教会/秘密组织阵营绑定 | ①体系自洽是口碑核心，且**体系自带叙事功能：选途径=选阵营=自动树敌**——好设定是冲突发生器；②途径→序列是「体系→条目」两级结构，正对应 world（体系）→ entry（条目） |
| 斗破苍穹（收藏榜常驻第一梯队） | 斗气十境、异火榜（23 种排序稀缺资源）、炼药师品阶体系、远古八族 | ③「榜单化稀缺资源」（异火榜）是强记忆点与长线爽点引擎——条目需要「排行/品阶」字段；④副职业体系（炼药师）也是力量体系子维度 |
| 遮天 | 轮海→道宫→四极→化龙→仙台→大帝，帝经/禁区/圣体 | ⑤功法（帝经）与境界解耦，作为独立条目类型；「禁区」= 地理×规则复合条目 |
| 大奉打更人 / 道诡异仙 / 十日终焉（近年月票榜头部） | 多体系并行（儒/道/佛/巫/术士）、心识疯癫规则、终焉之地规则怪谈 | ⑥一个世界允许**多套力量体系并存**（world_entries 的 kind 可多实例）；⑦「规则/禁忌」是一等维度，不是背景装饰 |

**十维度模板**（综合知乎世界观构造系列、17k 创作指南、作家网玄幻设定美学分析）：力量体系（境界+突破+代价）、资质/血脉、功法/技能、物品体系（法宝/丹药/灵草×品阶）、地理（世界→大陆→国→地域→地点层级）、势力（国别/门派/阵营+关系）、种族、历史（纪元/大事件）、规则禁忌（天劫/飞升/禁制）、经济与日常（灵石/货币、衣食住行礼俗）。每维度都要有「层级/品阶」字段——网文爽点的本质是层级差。

### 2.2 AI 写作工具的「库」机制

| 工具 | 机制 | 值得抄的点 |
|---|---|---|
| NovelAI Lorebook | 多 lorebook 并挂；关键词触发注入；Context Viewer 可见每条设定是否入了上下文 | ①一个项目挂多个库（正是本次需求）；②**注入可观测** |
| SillyTavern World Info | 扫描深度（最近 N 条消息内命中才注入）、递归扫描（条目内容再触发条目→知识图谱式展开）、优先级/插入位置/触发概率 | ③惰性加载省上下文；④别名/次级关键词（二次概率触发） |
| Novelcrafter Codex | 自定义分类+自定义字段；series 级共享（跨书复用实体）；每场可见性控制 | ⑤**库=series 层**；字段模板驱动表单 |
| 蛙蛙/彩云/笔灵 | 世界观/人物卡/CP 线、词条锁规则、时间线 | ⑥国内用户对「世界设定自定义+角色卡」已有心智 |

本项目 `story-bible-feature-gap.md` 的对标矩阵已给出自我诊断：「系列级共享 ❌ 项目隔离」是明确缺口；「引用可观测、状态演进 UI」是睡资产。本方案 P0 补第一条，P1 顺带补第二、三条（触发式注入在 bible 面板标注命中原因）。

---

## 3. 总体设计

### 3.1 三个核心决策

**决策一：库的作用域 = user（仿 `lw_global_settings`），绝不放开既有表的 project_id。**
新建 6 张无 project 表（§4），项目侧只加「绑定表 + 血缘列」。既有 200+ IPC 通道、九段 prompt 组装、一致性规则全部不动。

**决策二：引用分层——「实体导入实例化，体系活引用」。**

| 内容形态 | 模式 | 理由 |
|---|---|---|
| 人物（IP 角色） | **导入实例化**：绑定即在 `lw_story_characters` 建行，血缘列记库 id/版本 | 故事内人物必然演变（受伤/死亡/关系），一致性机（状态切片 UNIQUE(project,type,id,chapter)、R1/R6、R9 名册）需要项目内稳定 id；库与项目**单向**：库改模板，项目不自动变 |
| 结构化实体条目（门派/地点/物品/功法/丹药/灵草/国别…） | **导入实例化**（同上，落既有对应表或 custom_entities） | 参与图谱/名册/向量序列化/involved 关联表，活引用会把 10+ 读路径全部改成交叉解析，爆炸半径太大 |
| 体系/规则文本（力量体系总述、境界说明、规则禁忌、经济） | **活引用直注入**：prompt 组装时按绑定读库，作为「二、世界观设定」的库子段 | 永不产生故事内状态，不进图谱；库更新即时生效，免同步 |

**决策三：写故事的变量，读世界的常量；沉淀走显式动作。**
- 库→项目：绑定/导入/重新同步（diff 预览后人审，不做自动写穿）；
- 项目→库：**反向沉淀**——故事中长出来的新设定（研讨室卡片、章节提取的新实体）可一键「沉淀到世界观库/IP 库」，带 origin 溯源（沿用 `origin` JSON 惯例）。这与研讨室「对话是源、数据库是投影、投影由用户触发」哲学一致，也与知识大脑「AI 提议、人批准」红线一致。

**决策四（2026-09-25 用户定案）：子模块形态，但服务与数据仍保持下沉分层。**
不新建 pack、不加菜单；但**不**因此把库逻辑写进 `longwriting-ai.service.ts`（4000 行）或 `longwriting.handler.ts`（3482 行，202 通道）——领域服务独立成 `platform/services/longwriting/library/` 目录（world-library.service / ip-library.service / binding.service / library-ai-flow），handler 独立成 `packs/longwriting/handlers/library.handler.ts` 由既有 `longwritingPack.activate()` 追加注册。这样保留了两个低成本退路：若未来剧集制作/知识大脑要消费库，把 `library/` 服务目录平移为独立 platform 顶级目录即可，pack 侧零改动；数据表（`lw_world_*`/`lw_ip_*`）从第一天就是包无关的。

### 3.2 概念模型

```
用户 (user_id)
 └── 世界观库 lw_worlds（修真世界·雪麓 / 西幻世界·…）
      └── lw_world_entries（kind_key 分维度：力量体系/境界/门派/地域/…）
           └── lw_world_edges（库内静态关系：门派—驻于—地域）
 └── 角色 IP 库 lw_ip_characters（可 solo，可挂 world_id 取题材字段模板）
      └── lw_ip_edges（人物关系：师徒/敌对…，静态原型关系）
 └── 长文项目 lw_projects
      ├── lw_world_bindings (project_id, world_id, config)      ← 绑定 1..n 个世界（1 主世界）
      ├── lw_ip_bindings (project_id, ip_character_id, project_character_id, role_position)
      │      └→ 导入生成 lw_story_characters 行（source_type='library', library_entry_id, library_version）
      ├── lw_story_backgrounds / locations / factions / …       ← 现状不变，导入的行带血缘列
      └── 故事变量：状态切片/图谱边/事件/伏笔                    ← 完全不变
```

写作时的信息流：`assembleChapterGeneration` 读绑定 → 库体系段直注入；项目内实体（含导入行）走原路径。人物导入行同时把 IP 卡的动机/软肋/弧光带进新列（§4.3）——**（2026-09-26 审计修正：四层字段当时只落库未注入 buildCharacterFullInfo，即 M2，已于审计批补齐三行输出）**（对标人设卡四层结构：辨识资讯→内在驱动→世界观定位→成长弧光）。

---

## 4. 数据模型

### 4.1 世界观库（3 张新表）

```sql
-- 世界（库主表）
lw_worlds (
  id varchar PK,            -- wld_*
  name varchar,             -- '雪麓修真界'
  genre varchar,            -- story_type 对齐：xiuzhen|xuanhuan|urban|scifi|western_fantasy|history|custom
  tagline varchar,          -- 一句话概念
  description text,         -- 世界总述（可 AI 生成）
  cover_path varchar NULL,
  status varchar DEFAULT 'active',   -- active|archived
  version integer DEFAULT 1,         -- 条目变更即 bump，血缘同步用
  tags text NULL,                    -- JSON ['低魔','群像','慢热']
  user_id varchar NULL, created_at, updated_at
)

-- 世界条目（一切维度共用，kind 驱动——复用 bible kinds 的元数据思想）
lw_world_entries (
  id varchar PK,            -- we_*
  world_id varchar FK→lw_worlds ON DELETE CASCADE,
  kind_key varchar,         -- power_system|realm|sect|region|country|race|weapon|pill|herb|spell|art|history_event|rule|economy|daily_life|<custom>
  name varchar,
  aliases text NULL,        -- JSON：['青云门','青门']，提及检测/触发注入地基
  summary varchar,          -- 一句话（进 prompt 的紧凑形态）
  fields text,              -- JSON，按 kind 的 fields_schema（rank/品阶/层级/属性…）
  parent_id varchar NULL,   -- 层级：地域>国>门派驻地；体系>条目（途径→序列）
  sort_order integer,
  rank_value integer NULL,  -- 榜单化排序（异火榜式），NULL=无序
  pinned integer DEFAULT 0, -- 常驻注入（体系/规则类置 1）
  origin text NULL,         -- JSON {type:'ai'|'manual'|'promoted', projectId?, conversationId?}
  user_id varchar NULL, created_at, updated_at
)
INDEX (world_id, kind_key); INDEX (world_id, pinned)

-- 库内静态关系（复制 lw_graph_edges 多态形态，去掉时间线列——库是常量）
lw_world_edges (
  id varchar PK,            -- we_*
  world_id varchar FK→lw_worlds CASCADE,
  source_type varchar, source_id varchar,   -- 库内统一为 'entry'（世界边不指人物，人物关系在 lw_ip_edges）
  target_type varchar, target_id varchar,
  relation_type varchar,    -- 位于|隶属|敌对|炼制|需求|克制|晋阶…
  label varchar NULL,
  origin text NULL, user_id varchar NULL, created_at
)
```

`kind_key` 的注册与 `fields_schema`/`prompt_hint` 复用 `lw_bible_kinds` 的机制形态，但**作用域升为 world 级**：新增表 `lw_world_kinds`（world_id + key/label/icon/fields_schema/prompt_hint/sort_order/enabled），内置按题材播种（§4.4）。不复用全局 `lw_bible_kinds` 行本身——bible kinds 是项目设定集语义，混挂库语义会造成两边 fields_schema 漂移；只抄机制。

### 4.2 角色 IP 库（2 张新表）

```sql
lw_ip_characters (
  id varchar PK,            -- ipc_*
  name varchar,
  aliases text NULL,        -- JSON
  world_id varchar NULL FK→lw_worlds,   -- 可空：可做无世界归属的通用 IP
  -- 第一层：辨识资讯
  gender varchar NULL, age varchar NULL, race varchar NULL,
  occupation varchar NULL, appearance text NULL,
  portrait_id varchar NULL,             -- 挂人像设计模块（先例：linkPortrait）
  -- 第二层：内在驱动
  personality text NULL,                -- 性格
  motivation text NULL,                 -- 核心欲望（人设卡第二层）
  flaw text NULL,                       -- 软肋/缺陷
  background text NULL,                 -- 背景故事
  values_notes text NULL,               -- 价值观/底线
  -- 第三层：能力与世界观定位
  talents text NULL,        -- JSON 天赋（灵根/体质/血脉等，值须在该世界资质体系合法值内）
  abilities text NULL,      -- 技能/功法（可引用 lw_world_entries id 的 JSON [{entryId?, name, level}]）
  signature_items text NULL,-- 标志性物品
  -- 第四层：弧光
  character_arc text NULL,  -- 成长弧光（信念如何不可逆转变）
  catchphrases text NULL,   -- JSON 口头禅/语言习惯
  fields text NULL,         -- 题材扩展（fields_schema 驱动：序列/途径/灵根五行…）
  tags text NULL, status varchar DEFAULT 'active',
  origin text NULL, user_id varchar NULL, created_at, updated_at
)

lw_ip_edges (
  id varchar PK,            -- ipe_*
  source_id varchar FK→lw_ip_characters CASCADE, target_id varchar FK→lw_ip_characters CASCADE,
  relation_type varchar,    -- 师徒|挚友|敌对|血亲|隶属…
  label varchar NULL, description text NULL,
  user_id varchar NULL, created_at
)
```

设计取舍：**强列只放全题材通用的四层字段，题材字段（灵根/序列/血脉）进 `fields` JSON**，schema 由所挂世界的 `lw_world_kinds(character)` 的 fields_schema 驱动——这是 gap 文档「可定义性」方向在库上的落地，避免加一种题材就 ALTER 一轮表。

### 4.3 项目侧：绑定表 + 血缘列（对既有表的唯一侵入）

```sql
-- 世界绑定（world_id 不加 FK：库删除不级联到项目，语义见 4.5）
lw_world_bindings (
  id varchar PK, project_id varchar FK→lw_projects CASCADE,
  world_id varchar,                        -- 无 FK；库删除后行保留（悬空）
  world_name varchar,                      -- 冗余快照：库删除/改名后的展示兜底
  is_primary integer DEFAULT 1,            -- 主世界 1 个，可挂参考世界 n 个
  config text NULL,                        -- JSON {pinnedKindKeys:[], disabledEntryIds:[], overrides:[{entryId, note}]}
  user_id varchar NULL, created_at
)
UNIQUE (project_id, world_id)

-- IP 角色绑定（导入产生项目角色后回填 project_character_id；ip_character_id 同样无 FK）
lw_ip_bindings (
  id varchar PK, project_id varchar FK→lw_projects CASCADE,
  ip_character_id varchar,                 -- 库角色 id（库删则行保留，见 4.5）
  ip_name varchar,                         -- 冗余快照
  project_character_id varchar NULL,      -- → lw_story_characters.id
  role_position varchar NULL,             -- 导入时建议位（protagonist/…），可改
  added_at, user_id varchar NULL
)
UNIQUE (project_id, ip_character_id)
```

血缘列（幂等 ALTER，Electron raw DDL + PG migration 双侧）：

```sql
-- 既有实体表统一加（characters/locations/factions/skills/items/custom_entities）：
ALTER TABLE lw_story_characters ADD COLUMN library_world_id varchar NULL;
ALTER TABLE lw_story_characters ADD COLUMN library_entry_id varchar NULL;   -- 世界条目来源
ALTER TABLE lw_story_characters ADD COLUMN library_ip_id varchar NULL;      -- IP 角色来源
ALTER TABLE lw_story_characters ADD COLUMN library_version integer NULL;
ALTER TABLE lw_story_characters ADD COLUMN motivation/flaw/character_arc text NULL;  -- 四层人设进项目（原生角色也可填）
-- locations/factions/skills/items/custom_entities：加 library_world_id/library_entry_id/library_version
-- characters.items 已有 source_type（'longwriting'|'uploaded'），扩展枚举值 'library'（TS 层 union 扩展，无 DDL）
```

**读路径兼容**：所有导入行都是普通项目行，id 是项目内新 id（不复用库 id，避免跨域主键混淆）；`characters.find(c=>c.id===…)`、R9 名册、状态切片、向量序列化（`lw-vector-serializer.ts`）零改动。唯一新增是展示层的「库」徽章（UI 按 `library_ip_id` 判定）与「同步」动作（按 `library_entry_id + library_version` 与库当前 version 比对出 diff）。

### 4.4 题材种子：修真世界模板（回答用户举例）

内置一个「修真」模板（`builtin/world-templates/xiuzhen.ts`，随迁移幂等 upsert 为可选新建世界的种子，不自动建库），kinds 与 fields_schema：

| kind_key | label | fields_schema 要点 | 播种示例条目（可删） |
|---|---|---|---|
| power_system | 力量体系 | 体系名/能量源/核心规则/突破机制/力量代价 | 修真体系（炼气→…→真仙，pinned=1） |
| realm | 境界 | 阶位序号/名称/寿元/神识强度/突破条件 | 炼气~大乘 9 条（rank_value 序） |
| aptitude | 资质体系 | 属性（五行/变异）/品级（天/真/伪）/影响 | 灵根体系（pinned=1） |
| sect | 门派 | 等级/驻地(可挂 region parent)/功法倾向/镇派底蕴 | 示例门派 1 条 |
| region / country | 地域 / 国别 | 隶属层级/地貌/灵气浓度 / 政体/军力/与宗门关系 | 各 1 条 |
| weapon / pill / herb | 法宝 / 丹药 / 仙草 | 品阶（rank_value）/材料/禁忌 / 药性/年份 / 产地 | 各 1 条 |
| spell / art | 法术 / 功法 | 品阶/属性/修炼条件/来源 | 各 1 条 |
| rule | 规则禁忌 | 规则内容/违反代价/涉及境界 | 天劫规则（pinned=1） |
| economy | 经济 | 货币/兑换/灵石产出 | 灵石体系 |
| history_event | 历史 | 纪元/影响/遗留物 | 1 条 |
| daily_life | 日常 | 寿命/衣食住行/礼俗 | 1 条 |

西幻（职业/序列途径/种族/神祇）、都市（异能/组织/隐世规则）模板 P1 再补；模板=纯数据，无代码差异。

### 4.5 删除与一致性策略

- **删库**：`lw_worlds` 删除 → 条目/边 CASCADE；项目侧 `lw_world_bindings.world_id` 设 SET NULL？——**不**：绑定表 world_id 不加 FK，应用层删除库时校验「被 N 个项目引用」，提示后：绑定行保留 + 冗余 `world_name` 快照列（防悬挂显示），导入行不受影响（血缘 id 成悬空指针，仅用于「来源已删除」灰显）。IP 角色同理。**库删除永远不级联到项目**——这是「项目存变量」原则的兜底。
- **库级一致性检查**（P1，`world-consistency.service.ts`）：cross-entry 规则——条目 parent 存在、功法品阶值在境界体系枚举内、门派驻地指向真实 region、人物境界不越级、人物灵根值在资质体系合法集内。规则表驱动（复用 `lw_design_documents` 的 L0 校验 + DesignIssue 形态）。
- **别名**：导入时库 aliases 复制进项目行；`lw_predicate_registry`（scope+synonyms）P2 接库级 scope，供跨项目术语归一。

---

## 5. AI 生成与写作集成

### 5.1 世界观库自己的 AI 能力（世界观向导）

确定性多 pass 流（照 `design/volume-design-flow.ts` 的 gather→骨架→分批 loop→整合 + L0 校验 + 修复回路范式）：

1. **gather**：题材 + 一句话愿景 + 可选参考资料（素材/知识库文本）；
2. **骨架 pass**：产出世界「高概念」——力量体系核心创意、世界分层（地图/境界对应）、核心冲突种子、差异化记忆点（对标「异火榜」式设计）；输出 JSON 过 `lw:library/world-skeleton` schema；
3. **分维度 loop**：按 kind 分批生成条目（每批一个 kind，吃骨架 + 已生成条目摘要做互指），每条含 name/aliases/summary/fields，驱动 fields_schema 出字段；
4. **整合 pass**：补库内关系边（门派—驻于—地域）、pinned 标记、一致性自检（§4.5 规则）→ 修复回路 ≤2 轮；
5. **人审**：条目卡片逐条采纳（复用研讨室 ArtifactCard 交互语义），落 `lw_world_entries`，origin.type='ai'。

人物 IP 向导（`ip-character-flow`）：灵感输入 或 **从原型出发**（原型骨架=知识大脑增订的 character-pattern 五维：欲望×缺陷×能力来路×关系位×弧线终点——M0 未实现，先内置 6-8 个静态原型卡播种）→ 一次生成四层完整卡 → 若挂世界，能力/资质字段受该世界体系约束（prompt 里注入该 world 的 pinned 条目 + 枚举校验）→ 人审采纳。

### 5.2 写长文时的引用（对 `assembleChapterGeneration` 的唯一改动）

「二、世界观设定」分区扩展为两段：

```
二、世界观设定
  2a. 本书背景（现状 buildBackgroundContext，不动）
  2b. 世界观库·体系与规则（新增，活引用）：
      对每个 lw_world_bindings：
        - pinned=1 的条目全量注入（力量体系/境界/资质/规则/经济，summary+fields 紧凑序列化）
        - 世界总述（lw_worlds.description）
        - Token 预算：段级封顶（新参数 longwriting.worldContext.maxTokens，默认 2000，
          沿 LONGWRITING_PARAMS 声明式注册先例）
  2c. 世界观库·本相关条目（P1，触发式）：以本章大纲+设计卡+上一章结尾为扫描窗口，
      命中条目 name+aliases（复用提及检测形态）→ 注入其 summary+fields；
      命中详情进 ChapterContextItem 说明（对标 Context Viewer「可观测」）
```

实现落点：`buildBackgroundContext` 旁新增 `buildWorldLibraryContext(projectId, chapterNumber)`（`platform/services/longwriting/` 下新文件），`assembleChapterGeneration` 在 :1841 附近并行调用；分区仍是可勾选 `ChapterContextItem`——**预览=实际**原则不破。人物侧零改动（导入行走原路径；motivation/flaw/character_arc 由 `buildCharacterFullInfo` 增加三行输出）。

### 5.3 研讨室与写作台的入口改造

- **主入口：侧边栏 hover 二级菜单**：「长文写作」菜单项挂 `children`（`项目 /longwriting`、`世界观库 /longwriting/worlds`、`角色 IP 库 /longwriting/ip`）。侧边栏保持纯图标模式，含 `children` 的项在 mouseenter 时右侧弹出浮层子菜单（label 列表，mouseleave/点击后收起；teleport 到 body 防裁切）；父项高亮规则 = 当前路由命中任一子项 path 前缀；父项自身点击 = 进默认子项（项目列表）。改动收敛在 `MainLayout.vue` nav 段渲染 + CSS，`flattenMenuItems` 与 Home.vue 首页卡片逻辑不动（首页会多出两张库卡片，视觉可接受；如需收敛 P1 再改父卡+子链接）。
- **页内导航**：`/longwriting` 页头保留「项目 | 世界观库 | 角色 IP 库」页签（与二级菜单同路由），从首页卡片或标签栏进入时无需回侧边栏。世界/IP 库列表页照 `LongWriting.vue` 卡片网格模板；「新建世界观」入口提供模板选择（修真/西幻/都市，P0 先修真）。
- **新建项目流**（创建对话框 → StoryRoom）：新增可选步「选世界观 / 选主角」——世界下拉（lw_worlds）+ IP 角色多选；对话框内加「去库里逛逛」链接跳 `/longwriting/worlds`；跳过后行为与今天完全一致。
- **研讨室**：BiblePanel 增「库」分组段（只读，详情抽屉跳库编辑页）；阶段门 characters 前若无绑定 IP 且库里有候选，主编 prompt 提示「可从 IP 库导入」；提炼下拉增「沉淀到世界观库/IP 库」（反向沉淀，卡片确认制）。
- **写作台**：CharacterStage 顶部加「从 IP 库导入」按钮 + 导入行徽章；BackgroundStage 顶部显示主世界名（点击跳库）；StoryEditor 的「设定集」占位（:114-124）直接用 BiblePanel 补齐并带库段。
- **ProjectSettingsDialog**：新增「世界观绑定」tab（绑定/解绑/主世界切换/参考世界）。

---

## 6. IPC / 前端 / 工作流落点清单（子模块形态）

**后端（并入 longwriting 包，零新 pack）**：
- handler：新文件 `packs/longwriting/handlers/library.handler.ts`（`registerLibraryHandlers()`），由既有 `longwritingPack.activate()` 追加调用（`packs/longwriting/index.ts:41-47` 同处）。
- 领域服务：`platform/services/longwriting/library/`（world-library.service / ip-library.service / binding.service / lineage-sync.service / world-consistency.service / library-ai-flow）。**不并入** `longwriting-ai.service.ts`；AI 流复用其 `callAIStream` 与事件通道形态。
- 通道前缀用 `longwriting:library:*`——落在既有 `ipcChannelPrefixes:'longwriting:'` 声明内，守卫自动覆盖；Web 端 `channel-map.ts` 按既有 `longwriting.*` 惯例追加约 30 条（如 `longwriting.library.worldList` → `longwriting:library:world:list`）。

```
longwriting:library:world:list|get|create|update|delete|archive
longwriting:library:worldEntry:list|get|create|update|delete|reorder|pin|moveParent
longwriting:library:worldEdge:list|create|delete
longwriting:library:worldKind:list|upsert|delete
longwriting:library:world:generate           // 向导（走既有 longwriting:generate:{eventId} 流式事件）
longwriting:library:worldConsistency:scan
longwriting:library:ip:list|get|create|update|delete
longwriting:library:ipEdge:list|create|delete
longwriting:library:ip:generate
longwriting:library:bindWorld|unbindWorld|listWorldBindings|setPrimaryWorld|updateBindingConfig
longwriting:library:importIpCharacter|unbindIpCharacter|listIpBindings
longwriting:library:importWorldEntry|syncEntryPreview|syncEntryApply     // 同步 diff
longwriting:library:promoteToLibrary|promoteToIp                         // 反向沉淀
```

模型治理：库级生成新增两个 stage（`library-worldgen`/`library-ipgen`）进现有 stage 模型配置体系；不新增表。

**前端（并入 longwriting 包 + 一处侧边栏通用改造）**：
- 路由：`packs/longwriting/index.ts` 的 routes 数组追加两条子路由——`/longwriting/worlds`（世界观库列表+详情）、`/longwriting/ip`（角色 IP 库列表+详情）。
- 菜单：同文件 `menuItems` 的「长文写作」项加 `children`（项目/世界观库/角色 IP 库三项，注册表 schema 已支持，零改造）。
- 侧边栏 hover 浮层（唯一通用组件改动）：`MainLayout.vue` nav 段为含 `children` 的项渲染 mouseenter 浮层子菜单（teleport 到 body、路由前缀匹配高亮父项）；其它无 `children` 的菜单项渲染逻辑不变，`flattenMenuItems`/Home.vue 不动。
- 页面组件：`components/longwriting/library/`（WorldLibraryPage / WorldDetailPage / IpLibraryPage / IpDetailPage + fields_schema 动态表单组件）。列表页照 `LongWriting.vue` 卡片网格模板；IP 详情页照 `CharacterStage.vue` 编辑对话框与形象选择器（portrait 关联）；条目分组面板照 `BiblePanel.vue` + kinds 驱动读模型。
- 长文侧嵌入点：CharacterStage「从 IP 库导入」、BackgroundStage 主世界展示、BiblePanel「库」分组段、StoryRoom 提炼下拉「沉淀到库」。
- preload：不新增顶层命名空间，在既有 `longwriting` 命名空间（`src/preload/index.ts:1739` 起）内追加 `library` 子对象（`window.electronAPI.longwriting.library.*`）；Web 端 channel-map + register-channels 同步。
- 状态：库列表全局缓存照 `stores/knowledge-base.ts` 先例建 `stores/lw-library.ts`；详情直调 IPC。

**shared**：`src/shared/types/lw-library.types.ts`（World/WorldEntry/IpCharacter/Binding DTO + `LibraryEntryKind` union）；contracts 增 `src/shared/contracts/lw-library/`（world-skeleton / world-entry-batch / ip-character-card 三 schema + validate，照 longwriting-design 形态）。工作流侧 P0 不加节点（内部 internal 节点留 P2）。

---

## 7. 分期实施

| 期 | 内容 | 验收 |
|---|---|---|
| **P0（MVP）** | 6 新表 + kinds 种子（修真模板）+ 血缘列迁移；库 CRUD IPC + 前端两页（手动编辑为主）；世界绑定 + IP 导入；prompt 2b 段（仅 pinned + 总述 + 预算）；CharacterStage「从 IP 库导入」；项目删除/库删除隔离语义 | 修真库手动建 20 条目 → 新项目绑库 → 研讨室出概要时 prompt 预览可见体系段 → 导入 2 个 IP 当主角配角 → 写 3 章无 R9/名册回归 |
| **P1** | 世界观向导 + IP 向导（多 pass 流 + 卡片人审）；2c 触发式注入 + 命中可观测；同步 diff（syncEntryPreview/Apply）；反向沉淀（研讨室 + 实体右键）；库级一致性扫描；研讨室/写作台全入口；西幻/都市模板 | 「一句话+修真模板」生成 40+ 条目过一致性检查；改库丹药品阶 → 项目内 diff 预览 → 选择性同步；故事新门派沉淀回库 |
| **P2** | 世界/角色导入导出分享（JSON 包）；知识大脑接通（setting-pattern/character-pattern 卡 → 库模板与原型库播种，M0 落地后）；库级向量检索（lw_vector_indices 作用域方案：哨兵 project_id 或新 namespace，参考 `'__lw__'` 先例）；多世界绑定的高级规则；`lw_predicate_registry` 库 scope | 跨用户模板导入可用；知识大脑产出的「木讷坚韧型底层主角」原型卡出现在 IP 向导原型选择器 |

**风险与开放问题**：
1. 库条目导入后「项目改了、库也改了」的双头编辑——P1 同步 diff 只做单向（库→项目），项目侧改动永不上传，用「已分叉」徽章明示；是否需要项目→库的合并回写，评审定。
2. 体系段预算与九段总 token 的挤占——2b/2c 共用一个预算参数并在 ContextPanel 显示占比，超限按 pinned > 命中 > 字母序裁剪。
3. `lw_bible_kinds` 与 `lw_world_kinds` 的长期关系（两套 kinds 元数据）——P2 评估是否统一为「scope 列」，P0 不动（避免动项目设定集）。
4. Web 端多租户下库的共享（团队库）——当前 user 作用域即可，团队共享留待产品定义。
5. IP 库「无世界归属的通用角色」与挂世界角色的 fields_schema 差异——无世界时用「通用模板」（仅四层强列），UI 隐去题材字段组。

---

## 8. 参考资料

- [诡秘之主 Wiki·非凡途径](https://lordofthemysteries.fandom.com)（22 途径×10 序列）、[百度百科·神之途径](https://baike.baidu.com)
- [数学修仙：《凡人修仙传》境界/神识/法力数值化 - 知乎](https://zhuanlan.zhihu.com)、[凡人修仙传灵根等级划分 - 搜狐](https://www.sohu.com)
- [玄幻仙侠小说 AI 创作指南：世界观构建+力量体系设计](https://maliangwriter.com)、[小说世界观构造第 10 课：力量体系 - 知乎专栏](https://zhuanlan.zhihu.com)、[17k 作者专区·玄幻小说创作入门](https://author.17k.com)、[中国网络文学论：玄幻设定美学 - 作家网](https://zuojiawang.com)
- [SillyTavern 官方文档·World Info](https://docs.sillytavern.app)、[SillyTavern 中文文档·世界信息](https://sillytavern.wiki)、[NovelAI 官方文档·Lorebook](https://docs.novelai.net)、[世界书机制深度指南 - 知乎](https://zhuanlan.zhihu.com)
- [LitMemo·角色設定表範本](https://litmemo.com)、[小说角色塑造指南：从脸谱化到「活人感」](https://maliangwriter.com)、[什么是人物弧光 - 网文写作](https://www.wangwen666.com)、[维基百科·角色弧線](https://zh.wikipedia.org)
- [起点中文网月票排行榜](https://www.qidian.com)、[起点收藏榜前十经典（斗破/遮天/诡秘）- 搜狐](https://www.sohu.com)、[阅读量过亿小说盘点 - 知乎](https://zhuanlan.zhihu.com)、[起点阅读指数·道诡异仙第二 - B站](https://www.bilibili.com)
- [蛙蛙写作实测（全链路 Agent）- CSDN](https://www.csdn.net)、[彩云小梦（世界设定自定义）- 微软应用商店](https://apps.microsoft.com)、[8 款 AI 写小说神器横评 - 知乎](https://zhuanlan.zhihu.com)


---

## 9. P0 实施记录（2026-09-25）

**落点对照 §6**（全部按方案落地）：

| 块 | 文件 |
|---|---|
| shared 类型 | `src/shared/types/lw-library.types.ts` |
| 8 张实体 | `src/core/database/entities/lw-world(.kind/.entry/.edge).entity.ts`、`lw-ip-(character/edge).entity.ts`、`lw-world-binding.entity.ts`、`lw-ip-binding.entity.ts` |
| 8 个仓储 | `src/core/database/repositories/lw-world*.repository.ts`、`lw-ip-*.repository.ts`（含绑定反查/事务 setPrimary/bumpVersion） |
| 注册 | `entities/index.ts`、`database-manager.interface.ts`、Electron `database/index.ts`、Web `web-database-manager.ts` |
| 迁移 | `migrations/create-lw-library-tables.ts`（8 表 + 6 既有表血缘列 + 表存在性守卫；Electron/Web 双侧接线） |
| 血缘 | `lw_story_characters` 加 library_ip_id/motivation/flaw/character_arc；locations/factions/skills/items/custom_entities 加三列血缘（custom 走 origin JSON）；`EntitySourceType` 扩 `'library'` |
| 修真模板 | `platform/services/longwriting/library/world-templates.ts`（15 kinds + 示范条目，境界/灵根/规则/经济 pinned） |
| 服务 | 同目录 `world-library.service` / `ip-library.service` / `binding.service` / `library-context.ts` |
| prompt 注入 | ~~assembleChapterGeneration 新增 worldLibrary 上下文分区~~ **（2026-09-26 审计修正：当时只接了 items 预览数组，未进 composeChapterPrompt 的 parts——正文实际收不到库设定，即 H1，已于审计批修复并补集成测试）** |
| IPC | `packs/longwriting/handlers/library.handler.ts` 36 通道（`longwriting:library:*`），pack activate 注册；preload `longwriting.library` 子命名空间；Web channel-map 36 条映射 |
| 前端 | 路由 `/longwriting/worlds`、`/longwriting/ip`；侧边栏「长文写作」hover 二级浮层（MainLayout 唯一通用改动）；`views/WorldLibrary.vue`、`views/IpLibrary.vue`（四层人设卡编辑）、`FieldsSchemaForm.vue` 动态表单、`stores/lw-library.ts`；LongWriting 页头入口按钮；CharacterStage「从 IP 库导入」（多选 + 定位 + 已导入去重 + IP库徽标） |

**测试**：`tests/unit/migrations/create-lw-library-tables.spec.ts`（4 项：建表/血缘列/幂等/守卫）+ `tests/unit/longwriting/lw-library.spec.ts`（6 项：模板播种/版本自增/条目序列化/IP 导入实例化与幂等/条目导入映射/删库不级联项目）——10 项全过。
既有 lw-memory/dialog 等仓储测试失败为分支基线问题（stash 对照验证，与本次无关）。


---

## 10. P1 实施记录（2026-09-25）

**落点对照 §5/§6**（本轮交付：AI 向导、2c 触发式注入、反向沉淀、同步 diff、三模板）：

| 块 | 文件 | 说明 |
|---|---|---|
| 库 AI 服务 | `platform/services/longwriting/library/library-ai.service.ts` | 自含 provider 解析（含密钥解密与免密钥挡板）+ 流式调用，事件复用 `longwriting:generate:{eventId}`（前端零新增订阅面）；`generateWorldEntries`（按 kind 分批 ≤10 条，注入世界总述+pinned+已有条目防重，fieldsSchema 驱动字段约定，origin='ai'，bump 版本）；`generateIpCharacter`（四层人设卡，挂世界时注入 pinned 作资质/能力约束）；`extractJsonArray/extractJsonObject` 纯函数容忍 markdown 围栏与杂文 |
| 2c 触发式注入 | `library-context.ts` | `matchEntriesInText` 纯函数（name/aliases≥2 字命中、封顶 8）；`buildWorldLibraryContext(projectId, scanText?)` 新增【本章相关条目】段，命中清单随文本可见（可观测）；调用点扫描窗口 = 本章大纲 + 设计卡 + 上一章结尾 |
| 反向沉淀 | `library-sync.service.ts` | `promoteCharacterToIp`（四层人设随行，库源角色拒绝）；`promoteEntityToLibrary`（location/faction/skill/item→region/sect/art/weapon 映射，custom 按 kind_key 原样，已导入行拒绝，origin='promoted'） |
| 同步 diff | 同上 | `previewSync`（扫描全部血缘行：name/描述/品阶逐字段 diff，悬空标 orphaned，空仓储 null-safe 跳过）；`applySync`（单向库→项目覆写 name/摘要级字段 + 刷新血缘版本，项目侧其余字段保留） |
| 新通道 | `library.handler.ts` +6，preload/channel-map +6 | `world:generate` / `ip:generate` / `promoteToIp` / `promoteToLibrary` / `syncPreview` / `syncApply` |
| 模板 | `world-templates.ts` | +西幻（职业途径/种族/神祇/神奇物品 10 kinds）+都市异能（异能体系/组织/异物 7 kinds），注册表 3 套 |
| 前端 | `WorldLibrary.vue` / `IpLibrary.vue` / `CharacterStage.vue` | 世界详情每个 kind 一键「AI 生成」（数量/补充要求/流式预览）；IP 库「AI 生成角色」（灵感+挂世界+要求，流式预览）；角色卡「沉淀」按钮（确认后 promote，库源角色自动隐藏按钮）；新建世界模板下拉三选 |
| 仓储补丁 | `lw-custom-entity.repository.ts` | +`getById` / `getByProjectId`（沉淀与同步依赖） |

**测试**：`tests/unit/longwriting/lw-library-p1.spec.ts` 7 项（JSON 提取三形态/命中器与封顶/角色沉淀与拒绝/地点沉淀映射与版本自增/同步 diff 检出与 apply 覆写/悬空 orphaned）——连同 P0 共 17 项全过。

**遗留到 P2**（§7 原计划不变）：模板导入导出分享、知识大脑设定卡/人物原型卡回灌、库级向量检索、BiblePanel 库分组段与 ProjectSettingsDialog 绑定管理 tab、`lw_predicate_registry` 库 scope、世界级一致性 AI 扫描（结构校验已随 previewSync 顺带覆盖悬空检测）。

---

## 11. 修订记录（2026-09-25 晚）

**① 二级菜单两次回归的根修（结构性）**：此前把子菜单挂在 `MenuItem.children` 上，先后两次被消费方拍平渲染成顶级图标（第二次发生在修复已验证落盘并测试通过之后——工作区文件被外部还原，此现象已与用户说明）。本轮改为**结构级杜绝**：
- `config/menu.ts`：`MenuItem` **删除 `children` 字段**；新增 `menuSubmenus` 独立响应式注册表（`registerMenuSubmenus` / `getMenuSubmenu`，key=父项 path）；删除拍平函数，改为 `visibleMenuItems`（仅过滤 hidden）；重置函数同步清子菜单表。
- `packs/registry.ts`：`RendererPackDefinition` 新增 `menuSubmenus` 贡献项，applyPacks 装配时注册。
- `packs/longwriting/index.ts`：长文包 menuItems 只剩顶级项；三个子项（项目/世界观库/角色 IP 库）声明在 `menuSubmenus`。
- `MainLayout.vue`：顶级 v-for 消费 `visibleMenuItems`；浮层数据源 `getMenuSubmenu(item.path)`；父项点击进默认子项。
- `Home.vue`：消费 `visibleMenuItems`（顶级项卡片）。
- **隔离测试**（packs-registry.spec.ts）：断言顶级列表不含子项 path、子菜单只存在于注册表、MenuItem 上无 children——子项进顶级菜单从此在数据结构上不可能。

**② 交互式创建角色（替代一次性复杂表单）**：
- 步骤定义 `IP_WIZARD_STEPS`（4 层：辨识资讯/内在驱动/能力定位/成长弧光）+ `validateIpStepData` 移至 `shared/types/lw-library.types.ts`——**字段、label、给用户看的一句话解释（hint）与后端 prompt 同源**，杜绝两处漂移；每个字段都有"这是什么意思"的白话提示。
- 后端 `LibraryAIService.generateIpCharacterLayer(step, seedIdea, worldId, confirmed, requirements, variation)`：每层出提案（注入已确认前层保证连贯；挂世界时注入 pinned 约束资质；variation 明确要求换明显不同的方案）；新通道 `longwriting:library:ip:generateLayer`（handler/preload/channel-map 同步）。
- 前端 `IpCreateWizard.vue`：el-steps 四步引导，每步 AI 提案渲染为**可编辑小表单**（字段下方即白话 hint），「换一批」重出方案、「上一步」回退、逐步确认后入库；灵感输入步支持「没有想法，让 AI 自由发挥」与「懒得一步步来，AI 一次成卡」（复用一次成卡后跳第 4 步总览微调）。
- `IpLibrary.vue`：主入口改为「AI 引导创建」（向导），「手动新建」保留原表单供熟练用户；一次性 AI 对话框移除（其能力并入向导）。
- 测试：`validateIpStepData` 校验与四步定义完整性并入 lw-library-p1.spec.ts（全套 4 文件 31 项全过）。

---

## 12. P2 实施记录（2026-09-25 深夜批次）

| 块 | 文件 | 说明 |
|---|---|---|
| 绑定管理 tab | `components/longwriting/library/WorldBindingPanel.vue` + ProjectSettingsDialog 挂「世界观」tab | 项目设定的世界观绑定管理：添加/解绑引用、设主世界（悬空绑定标「来源已删」）；**同步 diff UI**（P1 previewSync/applySync 通道的界面）：检查更新→逐条勾选→库值单向覆盖，diff 行内对比「项目：旧值 ← 库：新值」，悬空条目标红不再同步 |
| BiblePanel 库分组段 | `room/BiblePanel.vue` | 分类视图尾部新增「世界观库」分组：绑定世界的 pinned 条目只读展示（🌏 标记、主世界 badge、来源=库）；面板底部提示改库入口——研讨室内可见「本章正文会注入哪些世界设定」 |
| 世界包导入导出 | `world-library.service.ts` export/import + 通道 ×3（handler/preload/channel-map） + WorldLibrary 页 | 导出 `{format:'lw-world-package', version:1, world/kinds/entries/edges}` JSON（浏览器下载 `*.lw-world.json`）；层级以 **parentName** 引用、边以名称对重建（跨库 id 无意义）；导入全部落新 id，同名世界自动加「（导入）」后缀；条目 origin='imported' |
| 测试 | lw-library-p1.spec.ts +2 | 导出→导入回路（kinds/条目/pinned/边名称重建/同名后缀）与非法包报错；全套 20 项全过 |

**P2 剩余**（后续批次）：知识大脑设定卡/人物原型卡回灌（等 M0 落地）、库级向量检索（`'__lw__'` namespace 复用方案）、`lw_predicate_registry` 库 scope、世界级一致性 AI 扫描。


---

## 13. 深度审计与修复记录（2026-09-26）

**审计方法**：逐文件核验盘面（防回退）+ 追运行时链路（不止 typecheck）+ 重点复查 items/parts 双轨、oneShot 副作用、类型转换点、他人增量改动。

**发现与处置**（按修复序）：

| 级别 | 问题 | 处置 |
|---|---|---|
| H1 我方·核心链路断裂 | worldLibrary 上下文只进 items（预览 UI）未进 parts——正文收不到库设定，正是本设计 §5.2 立的"预览=实际"红线 | `ChapterPromptParts` 增 `worldLibraryText`，compose 在「世界观设定」下渲染受控段（id='worldLibrary'，禁用回占位文案）；**新增集成测试**：真实仓储建世界+条目+绑定 → buildWorldLibraryContext → composeChapterPrompt，断言启用含条目文本/禁用回占位 |
| M1 我方·数据重复 | 向导"一次成卡"：ipGenerate 已建库行，最终步再 ipCreate → 同角色两条 | oneShot 记录 createdId，最终步 `ipUpdate`（分层路径仍 ipCreate） |
| M2 我方·文档夸大 | motivation/flaw/characterArc 只落库未注入 prompt | buildCharacterFullInfo 增三行（弧光标注"成长方向，非既成事实——勿一步到位"） |
| M3 我方·数据丢失 | IP 导入 age（string）静默丢成 25、gender 默认男 | 数字解析可解析则用；不可解析并入外貌"看上去约十七岁"；gender 非 male/female 落 'other' |
| H2 存量（他人 111f8384）·运行时崩溃 | buildGraphContextSection 道具口径段在 `const parts` 声明前 push（TDZ）——有物品状态切片的项目章节生成直接 ReferenceError；TS2448/2454 长期在场被当噪音 | parts 声明上移至道具口径段之前；typecheck 两错误消失 |
| 低危 | `disabled as Set` 无意义强转；预算截断腰斩行；`fieldsSchema as never` 绕过类型 | 强转删除；截断退到最近行边界/句读；类型改 `LibraryFieldSchemaItem[] | null` |
| 意外收获（他人未提交改动） | lw-world.repository.bumpVersion 被改为 `scoped.qb('w').update()`——SQLite UPDATE 不支持别名，实测 `no such column: w.id`，测试 4 项炸 | 改 scoped 读出行后自增回存（租户收口意图保留 + 方言安全）；该改动同时是在收口审计低危项"raw repo 无租户过滤"，方向正确 |

**测试**：全套 4 文件 **34 项全过**（新增 compose 集成 1 项）；typecheck：修复文件零错误，TS2448/TS2454 消失。

**流程教训**：① "预览=实际"红线必须配集成测试——本次 H1 正是从"测了 builder 纯函数、没测组装→compose 闭环"的盲区漏过；② 文档验收声明须与代码同批落，§9 两处夸大即"文档先于代码"；③ 并行会话的工作区里，typecheck 噪音中藏着真炸弹（H2），基线错误也值得定期清。
