# 统一资料登记层设计(2026-10-08)

> 状态:设计稿,待用户确认
> 关联:2026-10-08-info-collection-multimodal-assets.md(M1 资产登记方式按本文档修订)

## 1. 问题陈述(用户诉求原文提炼)

原始数据(原件)、保存到知识库的数据(内容化文本)、整理后保存到数据库的数据(结构化条目)——希望有一个**统一的地方可以登记**。长期使用会积累大量数据,散乱无序就利用不起来。期望:能存各种类型、能整理分类打标签、便于查询、方便 agent 调用。

核心疑问:现有「资产管理」模块能否担当,还是需要全新的存储方式?

## 2. 结论

**资产模块能担当,不需要全新存储方式。** 核对结果:它已经是"统一登记"的现成骨架,而且是平台级设计(`@core/platform/assets`,被工作流 save-asset/read-asset 节点、episode-production 共用),不是界面壳。

已有能力盘点(逐项核实):

| 用户要求 | 资产模块现状 | 判定 |
|---|---|---|
| 存各种类型 | `assets` 表:kind(file/url/text/json/image)+ storagePath 原件落盘(`dataPath/assets/<大类>/<yyyyMM>/`)+ textContent/jsonContent 内联 + mimeType/sizeBytes/metadata | ✅ |
| 分类整理 | 自定义分类体系(asset_categories,两级分类)+ 资产组(asset_groups,套图/组图)+ tags 标签列 | ✅ |
| 便于查询 | keyword 关键词 + 分类/子分类过滤 + 分页(asset:list) | ◑ 缺语义检索(见 §4) |
| 方便 agent 调用 | 仅工作流节点(save-asset/read-asset) | ❌ 无 agent 工具(见 §4) |
| 溯源 | source_type + source-link resolver(运行记录/应用会话跳转),可扩展 | ✅ 扩展点现成 |

## 3. 设计原则:登记与存储分离

"统一的地方登记" ≠ "把所有字节搬进一个物理仓库"。**原件留在自然位置,登记层只存指针+元数据**——`storagePath` 指向文件、`url` 指向网络出处、`metadata` 指向其它模块的记录 id。物理大一统会破坏现有模块的知识库存储与增量更新,没有收益。

一张登记卡(account of a datum)覆盖用户说的三层:

```
assets 表一行
├─ 原始资产:storagePath / url           (原件在哪)
├─ 知识库文档:metadata.kbDocumentId      (向量化文本在哪)
└─ 结构化条目:metadata.icRowIds 等        (整理出的数据在哪)
```

## 4. 真正的缺口与补法(三条线)

### 4.1 信息搜集没接入(最优先)

ic 目前自建 ic_source 表 + 自己的快照/资产目录,不进 assets 登记 → 搜集来的资料在资产中心不可见,统一登记从源头就断了。

**补法**:多模态设计的 M1 修订——**抓取成功即建资产卡**(原件那时已落盘;确认/驳回再改状态):
- `createAsset({ category:'document'(现有枚举,资产中心显示"文档"), subCategory:项目名, content:{kind:'file',path:原件}, textContent:内容化文本, url:来源URL(幂等查重), sourceType:'info-collection', sourceRef:projectId, metadata:{ mediaKind:'document', sourceId, tier, irHits } })`;
- 审阅确认 → 资产卡保留,kbDocumentId 回写在 ic_source(互链经 ic_source 查询得到,不冗余回写 asset.metadata——KB 文档的 sourceId 本就是 `ic:<sourceId>`,双向都能查到);
- 审阅驳回 → `deleteAsset`(卡与原件一起删,现有方法);
- ic_source 保留(采集治理元数据:审阅状态/引句回验/冲突归因),加一列 `asset_id` 外链,**登记卡与治理记录分离**,不重复建设。

### 4.2 三层互链 + 语义检索

数据量大了以后,"说不清什么时候有用"的数据靠标签/关键词找不回来,必须语义检索。知识库向量检索已存在,缺的是互链:

**补法**:
- asset.metadata 增加 `kbDocumentId`(内容化文本入 KB 后回写);
- 检索双通道:**精确过滤**(分类/标签/kind/时间/来源)走 asset 表;**语义找内容**拿 kbDocumentId 集合走 KB 向量检索,命中后回链登记卡展示元数据;
- 结构化条目侧:ic_row 已有 sourceId,天然能通过"来源 → 登记卡"找到 KB 文档,不必每行登记。

### 4.3 Agent 调用入口

**补法**:新增两个 agent 工具(挂在平台资产服务上,不专属 ic):
- `asset_search({query, kind?, category?, tags?, timeRange?})` → 语义+过滤混合检索,返回登记卡摘要;
- `asset_read({assetId})` → 返回内容化文本(textContent 或 KB 文档内容)与原件引用。

原多模态设计的 M3 计划中的 `ic_search/ic_collect` 并入这两个工具,不另起炉灶。

## 5. 处理结果的登记与查看(数据集资产)

处理结果(整理进数据库的表格数据、整理报告)与原始资料形态不同,登记与查看方式单独设计。

### 5.1 登记粒度:逻辑数据集一张卡,不是每行一张卡

行是数据的细胞,不是资料;登记粒度 = 人类能"取用"的最小单位。

- **表格数据** → `kind='dataset'` 登记卡(注:现有存储值域为 file/url/text/json,dataset 是**新枚举值**,资产中心 UI 需新增渲染分支,列 M1.5):项目 × schema(表结构)一张卡。卡上不复制数据,metadata 记 `{ projectId, schemaId, stats: { rowCount, draft, singleSource, conflicts } }`,指向数据库活数据。
- **整理报告** → `kind='text'` 登记卡:textContent = 报告 markdown,metadata 带 `kbDocumentId`(语义检索走它)与审稿结论。
- 登记时机:项目首次确认来源时建数据集卡;生成报告时建报告卡。

### 5.2 查看:按 kind 分发渲染器,数据集是"活卡"

资产中心已有按类别分发预览渲染的机制(`renderAssetPreview`,早报/周报长图),扩展 dataset 渲染器:点开数据集卡 → 按 metadata 回数据库**实时查询** → 内嵌表格视图,要求三件事:

1. 结构化列(指标/数值/单位/期间/维度)——与信息搜集详情页"资料库"tab 同一套渲染;
2. 质量标记列(孤证/低置信/已取代)——可信度与数据同呈现;
3. 溯源链——点一行 → 来源 → 原文。这是"整理后数据"与"原始资料"在查看层的连接点。

### 5.3 活数据 vs 定格快照

数据集卡默认永远反映最新数据(增量搜集自动更新)。需要定格时(报告引用版本/对外交付/归档)显式"导出 CSV/XLSX":当场物化文件(哈希+导出时间),作为**派生资产**登记,`metadata.derivedFrom` 指回数据集卡。与既有"文本报告固化为长图"(materialize-image)同一思路的推广。

## 6. 落地顺序(并入多模态分期)

- M1(文档类搜集):**修订**——资产直接登记 assets 表(本设计 §4.1,category='document'),原件落 `dataPath/assets/document/`(资产服务统一目录),ic_source 只做治理 + asset_id 外链;数据集卡/报告卡按 §5 登记;
- M1.5(互链):资产中心 UI 加"来源:信息搜集"过滤与跳转 + dataset 渲染器;
- M2(图片)/M3(视频字幕):登记卡带缩略图/媒体元数据(asset 表已有 kind/mime/sizeBytes,media_json 进 metadata);
- M3.5(agent 面):asset_search / asset_read 工具 + 权限(只读优先);数据集导出 CSV/XLSX(派生资产)。

## 7. 开放问题

1. 资产中心的分类体系是全局单表——搜集资料、写作产出、工作流成果共用心智是否可行,还是搜集资料要独立子空间(倾向:共用,靠 subCategory 隔离);
2. assets 表与 ic_source 的"登记卡/治理记录"边界要在实现时守住:凡审阅状态、引句、冲突归因一律只进 ic_source;
3. KB 文档删除时登记卡的失效标记策略(软删除 + 检索时探活)。
