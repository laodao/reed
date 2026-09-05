# 资产生态关系模型设计（设计稿，未实现）

> 日期：2026-09-04
> 状态：**设计思考**，仅形成文档，尚未动代码。
> 目标：让"资产管理"能 **兼容任意类型数据**、**保持数据之间的逻辑关系**、并让其它功能 **快捷地检索 / 引用 / 处理** 资产，保存时也能 **保持资产间的逻辑关系**。

---

## 1. 背景与要解决的问题

现有通用资产库（`assets` + `asset_groups`）能存四种形态（file/url/text/json），但**只能表达"单条资产"和"套图归组"这两件事**。以下需求当前无法满足：

- **图文同源**：报告 = 原文(markdown) + 渲染长图。当前长图是预览时临时渲染的 `data:image/png;base64`，**不是一条持久化资产**，无法"原文↔长图"双向关联。
- **多渠道版本**：同一篇文案的微信版 / 今日头条版 / 微博版。当前是**三条彼此独立**的资产，仅能靠 `sub_category` 和 `source_ref` 松散归拢，无法形成一个"同一内容"的可折叠、可搜索、可整体管理的主题。
- **异构主题聚合**：某一类业务产出的文档 + 电子表格 + 结构化数据 + 报告图，属于同一个"业务批次/主题"，需要聚合管理。
- **跨模块引用**：其它功能（工作流 / 应用 / 报告）希望按"逻辑关系"而不是"资产 ID"来检索、引用、处理一批资产。

核心诉求归纳为四句话：
1. 兼容任意类型数据；
2. 保持数据之间的逻辑关系；
3. 其它功能能快捷检索、引用、处理；
4. 其它功能保存资产时能保持并建立逻辑关系。

---

## 2. 现有关联能力盘点与缺口

| 现有机制 | 字段 | 能表达 | 缺口 |
|---|---|---|---|
| 来源绑定 | `source_type` + `source_ref` | 同一工作流运行产出的多个资产 | 只是"同一次运行"松散绑定，无版本/渠道语义；跨运行即断 |
| 套图组 | `group_id` + `asset_groups`(`group_role`) | 一次流程多张图归为一组 | 只服务多图；按来源绑定；无"主题/版本/派生"语义 |
| 替换语义 | `save-asset.replaceAssetId` | 重生成时删旧存新 | 是"一换一"互斥，不是多版本并存 |

**结论**：需要一套**关系模型**把"资产与资产之间、资产与聚合单位之间"的关系显式化、可扩展、可检索。

---

## 3. 关系类型学：先分清三种本质不同的关系

设计最关键的认知是：用户描述的"关联"混杂了三种**本质不同**的关系，必须分别建模，才能既准确又可扩展。

| 类型 | 语义 | 方向性 | 例子 |
|---|---|---|---|
| **派生 Derived** | 一个资产是另一个资产的**加工/渲染/推导**结果 | 有向（母体→子） | 报告原文 → 渲染长图；文本 → 摘要；JSON → 导出的表 |
| **变体 Variant** | 同一内容面向不同渠道/用途的**等价版本**，彼此无先后 | 无向（平行） | 文案微信版 / 头条版 / 微博版；版本演进 v3→v4 |
| **聚合 Theme/Bundle** | 不同性质数据归到**同一业务主题** | 无向（集合） | "某项目资产包" = 文档 + 表格 + 结构化数据 + 报告图 |

- 派生是**有向边**（重要：谁产生谁）；
- 变体是**平行集合成员**；
- 聚合是**集合**（可能含异构资产）。

因此**单一字段（如平铺的 `series_id + variant`）无法同时表达"有向派生 + 平行变体 + 异构聚合"**。需要"集合"承载聚拢与浏览，"关系"承载语义方向。

---

## 4. 总体数据模型（三张面）

三张面各司其职，互不耦合：

1. **资产主体** `assets`（现有，微调补充）——"单个数据单元"是什么。
2. **集合 / 主题** `asset_series` + `asset_series_members`——"哪些资产属于同一逻辑主题"，是浏览与聚合单位，支持一个资产挂多个主题（多对多）。
3. **关系** `asset_relations`——"资产两两之间的语义边"（派生 / 引用 / 同源），支持有向与类型扩展。

```
                     ┌──────────────────────────┐
                     │  asset_series (主题/集合)  │
                     │  name / kind / desc/source│
                     └────────────┬─────────────┘
                                  │ asset_series_members (多对多)
                  ┌───────────────┼───────────────────────┐
      ┌───────────▼────────┐  ┌───▼──────────┐  ┌───────▼──────┐
      │ assets(原文 text)   │  │ assets(微信版) │  │ assets(长图) │
      └───────────┬────────┘  └───┬──────────┘  └───────┬──────┘
                  └────── asset_relations (有向边) ──────┘
                             derived / reference …
```

### 为什么用"集合 + 关系"两层而不是平铺一列

| 对比 | 平铺 `series_id + variant` | 集合 + 关系 |
|---|---|---|
| 派生方向 | 无法表达谁派生谁 | 关系表有向，明确 |
| 多对多 | 同一资产只能属一个 series | 集合成员表多对多（可被多主题引用） |
| 新增关系类型 | 加列（改 schema） | 加枚举数据（不改 schema） |
| 浏览聚合 | 可折叠 | 可折叠（集合 + role 徽标） |
| 查询复杂度 | 简单 | 稍复杂（一次聚合查询） |

贯彻 CLAUDE.md"第三范式 + 考虑扩展性"：**用数据扩充能力而不是改表结构**，故选集合 + 关系。

---

## 5. 表结构设计

### 5.1 `asset_series` —— 主题/集合（新增）

```sql
CREATE TABLE asset_series (
  id            varchar PRIMARY KEY,
  user_id       varchar,               -- 多租户（BaseRepository 注入）
  name          varchar NOT NULL,      -- 如「XX品牌618文案」/「某项目资产包」
  kind          varchar,               -- theme|batch|template_set|report…（可扩展）
  description   text,
  source_type   varchar,               -- 关联某次业务来源（workflow/app/manual/import）
  source_ref    varchar,               -- 运行 id / 应用 id
  created_at    datetime,
  updated_at    datetime
);
CREATE INDEX idx_asset_series_user ON asset_series (user_id);
CREATE INDEX idx_asset_series_source ON asset_series (source_type, source_ref);
```

### 5.2 `asset_series_members` —— 集合成员（新增，多对多）

```sql
CREATE TABLE asset_series_members (
  series_id   varchar NOT NULL,
  asset_id    varchar NOT NULL,
  role        varchar,               -- source/render/wechat/toutiao/weibo/document/spreadsheet/data…
  sort        integer DEFAULT 0,      -- 展示顺序
  created_at  datetime,
  PRIMARY KEY (series_id, asset_id)
);
CREATE INDEX idx_as_members_asset ON asset_series_members (asset_id);
```

- `role` 用**注册枚举**（`ASSET_SERIES_ROLES`）但允许自定义（`ASSET_SERIES_ROLES` 只是约定，不硬编码死）。
- 一个资产可加入多个 series（多对多）→ 满足"被多个功能引用"。

### 5.3 `asset_relations` —— 资产两两关系（新增，有向边）

```sql
CREATE TABLE asset_relations (
  id            varchar PRIMARY KEY,
  user_id       varchar,
  from_asset_id varchar NOT NULL,     -- 有向起点
  to_asset_id   varchar NOT NULL,     -- 有向终点
  relation_type varchar NOT NULL,     -- derived|reference|same_theme|mirror|versioned…
  rel_meta      text,                 -- JSON（渠道名/比例/生成器标识/重生成参数）
  created_at    datetime,
  updated_at    datetime
);
CREATE INDEX idx_asset_relations_from ON asset_relations (from_asset_id);
CREATE INDEX idx_asset_relations_to   ON asset_relations (to_asset_id);
CREATE UNIQUE INDEX idx_asset_relations_unique
  ON asset_relations (from_asset_id, to_asset_id, relation_type);
```

- `relation_type` 是**注册类型**（枚举常量 + 中文标签），新增类型只加数据。
- 派生：`from=原文, to=长图, type='derived'`；引用：`from=文章, to=引用图, type='reference'`。
- 变体/版本：既可挂集合成员 `role`，也可用 `type='versioned'` 的边（两者按需选，见 5.4）。

### 5.4 变体/版本到底放哪：集合 `role` vs 关系 `edge`

- **浏览聚合**：变体归属用**集合成员 role**（主题一目了然：wechat/toutiao/weibo）。
- **语义演进**：版本先后用**关系 edge**（`type='versioned'`，可带 `rel_meta.version`）。
- 二者可共存：一个系列里三个变体用 role 标识，变体间的先后用 relation 表达。**集合管"属于谁"，关系管"先后/派生"**。

### 5.5 `assets` 表微调（补充，不推翻现状）

现状已能存四种形态与 metadata。为支撑"任意类型 + 引用/处理"，在 `metadata` **约定**字段而非新增列：

```ts
metadata: {
  schema?: Array<{ name: string; type: 'string'|'number'|'bool'|'object'|'array' }>,  // 结构化数据字段描述
  extension?: string,   // 文件扩展名（便于检索）
  width?/height?/duration?/format?  // 既有媒体探测
}
```

> 说明：`schema` 与 `extension` 都是**约定**（写入 `metadata` JSON），不动表结构；后续如需强类型可升级为独立 `asset_schema` 表（阶段 3 评估）。

### 5.6 与现有 `asset_groups` 的关系

现有套图 `asset_groups` 本质是"一种集合"（多图聚合）。为兼容存量，**建议演进策略**：把 `asset_groups` 视为 `asset_series` 的一个特例，或通过迁移将 `asset_groups` 导成 `asset_series(kind='group')` 并保留 `assets.group_id` 冗余。**阶段 1 先并存不破坏**，阶段 2 再决定合并（见 §10）。

---

## 6. 读写 / API / 节点契约

### 6.1 保存（Save）：一次保存"一个主题 + 多个变体/形态"

新增 `save-asset-set` 节点/IPC，一条消息原子写入"集合 + 成员 + 资产 + 关系"：

```ts
saveAssetSet(input: {
  series: { name: string; kind?: string; description?: string },
  sourceType?: string; sourceRef?: string,      // 业务来源（可选）
  members: Array<{
    role: string,                               // source/wechat/toutiao/weibo/render/…
    content: { kind: 'file'|'url'|'text'|'json', ... },
    category?: AssetCategory,
    name?: string, tags?: string[],
    derivedFrom?: { assetId: string; relationType?: 'derived' },  // 可选：挂派生关系
  }>,
  relations?: Array<{ fromRole?: string; toRole?: string; relationType: string; relMeta?: any }>
}): Promise<{ seriesId: string; memberAssetIds: Record<string, string> }>
```

- **原子性**：同一事务（服务层用事务）写入 series + members + assets + relations，任何一步失败整体回滚，避免半套数据。
- **返回值**：`memberAssetIds` 以 role 为键，供下游按 role 引用（`read-asset-set`）。

示例：文案多版本一次保存 —— 三个 member（role=wechat/toutiao/weibo，各自 kind=text）；报告图文 —— 两个 member（role=source 的 text，role=render 的 image，且 render 标记 derivedFrom=source）。

### 6.2 检索（Search）：按"逻辑关系"查询

`listAssets` 扩展过滤维度：

```ts
listAssets(params: {
  category?, subCategory?, keyword?,
  seriesId?,               // 按集合查
  relation?: { type: string; toAssetId?: string; fromAssetId?: string },  // 按关系查
  byRole?: string,         // 集合内角色过滤
  sourceRef?,              // 按业务来源查
  page, pageSize
})
```

返回记录在现有 `AssetRecord` 上**扩展携带关系信息**：

```ts
interface AssetRecord {
  ...existing
  seriesRoles?: Array<{ seriesId: string; seriesName: string; role: string }>  // 该资产属于哪些主题、什么角色
  related?: Array<{ assetId: string; relationType: string; direction: 'out'|'in' }>  // 两两关系
  groupName?: string   // 既有
}
```

### 6.3 引用（Reference）：按"逻辑单位"取用

- `read-asset-set(seriesId, role?)`：读一个主题（可只取某 role）的资产。
- `read-asset` 扩展 `byRole`：`read-asset({ assetId, byRole: 'wechat' })` 或 `bySeries(seriesId, role)`。
- `resolveAssetRef({ seriesId, role }) → AssetHandle`：返回对某个资产的标准处理句柄，供下游消费（见 6.4）。

### 6.4 处理（Process）：统一 `AssetHandle`

其它功能拿到资产后，用统一句柄消费，**不关心来源**：

```ts
interface AssetHandle {
  assetId: string
  kind: 'file'|'url'|'text'|'json'
  url: string          // file/url 可访问链接
  path: string         // 文件型本地绝对路径
  content: string      // text
  json: any            // json
  mimeType: string
  metadata: Record<string, any>   // 含 schema/extension
}
```

`AssetService.toHandle(record)` 统一产出，`read-asset` / 节点 / IPC 复用，避免各模块各自拼装。

### 6.5 IPC 通道（新增）

```
asset:series-save          saveAssetSet
asset:series-list          按条件列集合
asset:series-detail        集合详情（全部成员含 role）
asset:series-delete        删集合（不动资产；决定是否级联清关系）
asset:relation-query       查资产两两/上下游关系
asset:reference-resolve    按 series/role 解析 AssetHandle
```

---

## 7. 检索与引用细节

**数据库检索能力**（按需分阶段引入）：

- 现有关键字：name/description/tags 的 `LIKE`（已具备）。
- 增强 A：`asset_series` / `asset_relations` 的**索引查询**（按 series_id / source_ref / relation_type）。
- 增强 B：**全文检索** —— 文档正文 / JSON 内容分词，用 SQLite **FTS5** 摘要表（`assets_fts(asset_id, name, description, text_content, json_content)`），支持对"内容"而非仅元数据搜索。新增资产时写 FTS 表，删除时清理（触发器或服务层同步）。
- 增强 C：结构化数据 `schema` 字段检索（优先 metadata 里约定，无需新表）。

**前端折叠与缓存**：列表把同 `series_id` 折叠成一张"主题卡片"，卡面显示 role 徽标 + 各形态缩略，点开艺廊看全部成员；卡片分页沿用现有"卡片键"思路（series 算一张卡，避免同主题拆到多页）。

---

## 8. 生命周期与一致性

- 删除资产：若被关系引用，需提示"该资产被 N 处引用"（或删除引用关系）；集合成员关系随资产删除清理。
- 删除集合：**不动成员资产**（只清 member 关联 + 可选清集合内关系），避免误删数据。
- 派生重生成：同一关系下"替换成新资产"（升级现有 `replaceAssetId` 语义，`rel_meta` 记录生成器/参数）。
- 多租户：`asset_series` / `asset_relations` 均带 `user_id`，查询复用 `(user_id = :uid OR is_builtin = 1)` 纪律；内置全局资产（`is_builtin=1`）可被加入用户主题。

---

## 9. 总体架构补充项（不推翻现状，在其上扩展）

| 层次 | 现有 | 扩展 |
|---|---|---|
| 数据 | `assets` + `asset_groups` | + `asset_series` + `asset_series_members` + `asset_relations`；`metadata` 约定 `schema/extension` |
| 服务 | `AssetService` | + `saveAssetSet` / `listSeries` / `getSeriesDetail` / `listRelated` / `toHandle` |
| 节点 | `save-asset` / `read-asset` | + `save-asset-set` / `read-asset-set`；`read-asset` 支持 `byRole/bySeries` |
| IPC | `asset:*` | + `asset:series-*` / `asset:relation-query` / `asset:reference-resolve` |
| 前端 | `AssetCenter`（分类 tab / 套图 / 预览） | + 主题卡片折叠 + 艺廊按 role 展示 + 相关资产面板 + 关系可视化 |

---

## 10. 分阶段演进路径（避免一次性大改）

| 阶段 | 范围 | 交付 |
|---|---|---|
| **阶段 1（最小闭环）** | `asset_series` + `asset_series_members` + `save-asset-set`（一次存一套）+ 前端"主题卡片"折叠 | 解决文案多版本、报告图文同源（长图**落盘成资产** + 挂 role=render） |
| **阶段 2（关系语义）** | `asset_relations` + 关系类型注册 + 派生/引用检索 | "谁由谁派生/谁引用谁"可查、可视化 |
| **阶段 3（检索与处理）** | FTS5 全文检索 + `metadata.schema` 约定 + `AssetHandle` 统一句柄 | 内容级搜索、跨模块标准化引用/处理 |
| **阶段 4（存量合并）** | `asset_groups` 导成 `asset_series(kind='group')` | 统一集合模型，移除历史双轨 |

---

## 11. 关键取舍与说明

1. **用"集合 + 关系"两层，而非平铺一列**：为的是表达有向派生、平行变体、异构聚合，并让新增关系类型"加数据而非改表"（第三范式 + 扩展性）。
2. **`asset_groups` 不立即废弃**：阶段 1 并存，阶段 4 再合并，避免破坏现有套图。
3. **`metadata.schema` 用约定而非强表**：阶段 3 评估是否升级为独立表，避免过早重设计。
4. **阶段 3 之前不做 FTS**：先保证关系与聚合闭环，再补内容级检索。

---

## 12. 待确认事项（请评审）

- [ ] 集合 `asset_series.kind` 需覆盖哪些初始枚举（theme/batch/template_set/report/…）？
- [ ] 变体是否还需独立 `versioned` 边，还是统一用集合 `role` 表达即可？
- [ ] 阶段 1 是否就应把报告长图**落盘成独立资产**（而非继续临时渲染）？——这是"图文同源"成立的前提。
- [ ] 删除集合 / 删除被引用资产时的默认行为（级联清关系 vs 仅提示）？

---

## 13. 可借鉴 Palantir Ontology：三条设计原则（已采纳）

对标 [Palantir Foundry Ontology](https://www.palantir.com/docs/foundry/ontology/core-concepts)（[Object/Link/Action/Function](https://www.palantir.com/docs/foundry/object-link-types/link-types-overview/index.html)，[Link metadata](https://www.palantir.com/docs/foundry/object-link-types/link-type-metadata)），我们在"Link 一等公民"上已与它一致（`asset_relations` 类型化 + `rel_meta`），但之前缺了它最关键的三点，现全部采纳为**贯穿各阶段的设计原则**：

### 原则 ① Action：所有写路径收敛到唯一入口（"没有执行力的本体只是数字盆景"）
- **所有资产变更**（单资产或一套）统一走 `saveAssetSet`（即 Action），各模块**不得直接散调** `createAsset/update/delete`。
- Action 内承担：合法性校验（category/kind/role/relation_type 枚举）、**原子事务**（assets + series + members + relations 同事务提交）、记录来源（sourceType/sourceRef）与关系、可选审计。
- 单资产场景 = "只有 1 个 member 的 set"，统一建模，避免"单条"与"一套"两套逻辑。
- **兼容策略（§14 策略 1）**：现有 `save-asset` 节点、`asset:create` IPC 保留为对 `saveAssetSet` 的**薄封装**（单 member），**对外签名与行为不变** → 存量调用方零改动。

### 原则 ② Function：所有读/处理收敛到统一句柄
- `read-asset-set(seriesId, role)` + `AssetHandle` 是**唯一消费入口**：任何模块要"这篇文案的微信版"= `resolveRef(seriesId, 'wechat')`，不关心底层 `kind`。
- `renderAssetPreview` 归入 Function 族；`AssetService.toHandle(record)` 统一产出句柄（id/kind/url/path/content/json/mimeType/metadata），避免各模块自行拼装。

### 原则 ③ 面向业务语义编码（而非物理形态）
- 顶层词汇用**业务语义**：`role`（source/render/wechat/toutiao/weibo/document/spreadsheet/data）、`relation_type`（derived/reference/versioned）。
- 各功能据此检索、折叠、编程，而不是对着 `kind=file/url/text/json` 编码；语义名用**注册常量**（允许扩展），一改即可全局生效。

### 明确不照搬（克制，避免过重）
- 不做**多源身份解析/联邦聚合**（单 SQLite 无此需求）；
- 不做**强类型 schema 演化治理**（用 `category/sub_category + metadata.schema 约定` 即可）；
- 不做**全套血缘/审计/合规治理栈**（已有 `user_id` 多租户 + `is_builtin` 够用）；
- **不拉满关系代数**（先 `relation_type + rel_meta`，cardinality 待阶段 2 再评估）。

---

## 14. 对其它模块的工作量影响评估

### 14.1 先划清边界：本次只动"通用资产生态"

仓库里存在**两套并行的资产域**，必须区分：

| 资产域 | 载体 | 是否受本次影响 |
|---|---|---|
| **通用资产中心**（本方案） | `assets` / `asset_groups` / `asset_categories`，走 `AssetService` | ✅ 本次改动主体 |
| **剧集/剧集生成领域** | `CharacterAssetService` / `LocationAssetService` / `ItemAssetService` / `VoiceAssetService` / `UserAssetService` / `TempAssetService` / `AssetImageService` …（操作 `asset-image` / `user-asset` / `cloned_voice` 等表） | ❌ **完全平行、不受影响**（除非将来统一，那是一个独立大命题，本次不在范围） |

> 结论：用户说的"资产多了难管理"主要指**通用资产中心**；剧集领域那套 *AssetService 有自己的数据模型，本次不改。

### 14.2 两条落地策略与代价差异

| 策略 | 做法 | 对其它模块影响 | 成本 |
|---|---|---|---|
| **策略 1（推荐）** | 新增集合+关系+`save-asset-set`/`read-asset-set`+`AssetHandle` 为**加法**；老接口（`save-asset`/`read-asset`/`asset:create`/`api.assets.create`/`getAsset`/`resolveAssetPath`）签名行为不变，内部转委托 `saveAssetSet`/`toHandle` | **强制改动≈0**（仅装配点必改）；存量流程/页面不崩 | 资产模块自身承担大头 |
| **策略 2（彻底收敛）** | 把一切写收敛到 Action、读收敛到 Function，改掉对外契约 | 所有 `save-asset` 使用方、IPC、前端、`file.service` 都要改造 | 显著上升（涉及全部消费方） |

**推荐策略 1**：符合"不破坏现有功能 + TDD 增量"，`save-asset-set` 作为新能力开放给想用关系的新功能。

### 14.3 逐模块工作量（按策略 1）

**① 通用资产模块自身（改动主体）**

| 文件 | 改动 | 复杂度 |
|---|---|---|
| 新增 `asset-series.entity.ts` / `asset-series-member.entity.ts` / `asset-relation.entity.ts` | 新建 3 实体 | M |
| 迁移（`create-assets-tables` 或新迁移） | 建 3 表 + 索引 + 幂等 | M |
| 新增 `asset-series.repository.ts` / `asset-series-member.repository.ts` / `asset-relation.repository.ts` | 新建 3 repo（CRUD + 按 series/source/relation 查询） | M–L |
| `asset.repository.ts` | + `listRelated` / `bySeries` / 卡片键扩展 | M |
| `asset.service.ts` | + `saveAssetSet` / `getSeriesDetail` / `listRelated` / `resolveRef` / `toHandle`；`createAsset` 转委托 | L（核心） |
| `asset.types.ts` | + series/relation/role/`AssetHandle`、扩展 `AssetRecord` | M |
| `asset-nodes.ts` | + `save-asset-set` / `read-asset-set` 节点；`read-asset` 支持 `byRole/bySeries` | M |
| `asset.handler.ts` | + `asset:series-*`、`asset:relation-query`、`asset:reference-resolve` | M |
| `AssetCenter.vue` | + 主题卡片折叠 + 相关资产面板 + 系列艺廊；抽公共折叠逻辑 | L |
| 新增前端组件（series-card / relation-panel） | 新建 | M |
| 关联测试（repos / service / 节点 / 迁移 / 前端组件） | TDD 新增 | M–L |

**② 其它模块（改动点很少）**

| 模块 / 文件 | 角色 | 改动 | 是否必改 |
|---|---|---|---|
| `src/core/modules/workflow/workflow-boot.ts`（191–199 装配） | 构造 `AssetService` | **注入新 repo 依赖**（`db.assetSeries` / `db.assetRelations`，可选参数） | ✅ **唯一必须改的其它模块**（加法，小） |
| `src/preload/index.ts` + `src/renderer/src/types/electron-api.ts` | 暴露前端 API | + 新增 `assets.seriesSave/seriesDetail/related/...` 方法 | 小（加法） |
| `src/web/client/channel-map.ts` | Web 通道映射 | + `assets.*` 新通道映射 | 小（加法） |
| `src/core/services/file.service.ts`（附件引用资产，88–126） | 用 `getAsset`/`resolveAssetPath` | 签名行为不变 → **零改动**；如需按 series 引用再小扩 | 否（可选） |
| `workflow` 存量流程 / 其它调用方 | 用 `save-asset`/`read-asset` | 不崩（老节点保留） | 否 |
| `episode-production` 全套 `*AssetService` | 平行领域 | **零改动** | 否 |

### 14.4 风险与意外耦合点（评估需重点盯这几处）

1. **装配注入**：`workflow-boot` 是唯一"别处必改"，改动小但**必做**；漏了会导致 `getAssetService` 抛"未注册/缺 repo"。
2. **卡片折叠逻辑重复**：前端套图 `group` 折叠与新的 `series` 折叠思路相似，**必须抽公共函数**（CLAUDE.md 反复制粘贴），否则出现第二份折叠分页实现。
3. **老库幂等迁移**：`create-assets-tables`/`create-asset-categories` 已有 `checkTableExists`/`ensureColumn` 模式可复用，但三张新表要保证**升级老库不炸**。
4. **Web 端通道注释（既有历史坑）**：`channel-map.ts` 第 283 行注释提到 `assets:list`（复数）与后端 `asset:list` 不匹配，Web 资产中心整体不可用——属既有问题，非本次引入，但加新通道时留意不要沿用复数命名。
5. **分页与统计语义**：`listAssets` 卡片键、`getStats`、`countBySubCategory` 在引入 `series` 后，需明确"一套主题算一张卡 / 一个计数单位"，避免重蹈"每页卡片数忽多忽少"的旧 bug（正是本项目早前修复过的点）。

### 14.5 工作量量化（按复杂度分级，非精确人日）

| 阶段 | 工作重点 | 体积 |
|---|---|---|
| 阶段 1（集合+一次存一套+主题卡片） | 3 实体/3 repo/迁移 + `saveAssetSet` + 节点/IPC + 前端折叠 + 测试 | **大**（核心投入在此） |
| 阶段 2（relation+派生引用检索+可视化） | `asset_relations` 打通 + 关系面板 | M |
| 阶段 3（FTS+schema+AssetHandle 全面） | 全文检索 + 统一句柄 | M–L |
| 阶段 4（`asset_groups` 合并迁移） | 存量迁移 + 前端兼容 | M |

- **风险高度集中在阶段 1**：它是"资产模块自身扩展"的大头，但**不向其它模块扩散**（策略 1 下其它模块仅装配处 1 点）。
- **若选择策略 2（彻底收敛），额外成本**是"改造全部 `save-asset` 使用方 + 前端 + `file.service`"——工作量会从"集中在资产模块"变成"扩散到所有调用方"，**不建议**作为第一阶段。
