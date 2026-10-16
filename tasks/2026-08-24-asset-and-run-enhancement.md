# 资产与执行记录增强方案（4 项需求）

> 日期：2026-08-24
> 来源：用户对电商套图实测后的 4 点反馈
> 原则：TDD、复用现有能力、避免写死、考虑扩展性

## 一、需求与现状对照

| # | 需求 | 现状 | 差距 |
|---|---|---|---|
| 1 | 执行记录可见执行过程数据（用户提交数据/各环节输入输出/最终产物） | 运行详情页有节点表（可看 input/output），无 startInputs 展示 | 补 startInputs 展示；节点 input/output 已有但体验可优化 |
| 2 | 资产支持套图/组图（一次流程多图 = 一个套图） | 资产扁平，无组概念 | 新增资产分组模型 |
| 3 | 资产关联产出它的功能（应用/工作流），点击跳转 | 资产有 sourceType/sourceRef（=runId），无跳转 | 反查 runId→session→app，加跳转入口 |
| 4 | 产出物哪些保存到资产可由用户配置；套图产物（清单+图）应整体呈现或按需不保存 | save-asset 节点无条件保存；清单与图分离显示无关联 | 保存开关 + 组图整体呈现 |

## 二、方案设计

### 2.1 需求 1：执行记录完整展示

**现状**：`WorkflowRunDetail.vue` 已有节点表格（列：节点/迭代/状态/错误/路由/耗时/操作[输出/预览/审核]），点击"输出"可看节点 output。`getRunDetail` 返回 run（含 startInputs）+ nodeRuns（含 input/output）。

**增强**：
1. **顶部新增「用户提交数据」折叠区**：展示 `run.startInputs`（JSON 格式化），文件字段显示文件名。
2. **节点行展开「输入/输出」**：表格加展开行，显示该节点 `input`（解析后 config）与 `output`（JSON 格式化/图片预览）。
3. **最终产物标识**：report/report-image/save-asset/save-diary 节点的输出标记"产物"，可跳转对应资产。

**改动面**：仅前端 `WorkflowRunDetail.vue`（数据已有，无需后端）。

### 2.2 需求 2：资产套图/组图

**模型扩展**（`assets` 表加列）：
```
asset_groups 表（新）：
  id, user_id, name, category, sub_category, description,
  cover_asset_id, source_type, source_ref, created_at, updated_at

assets 表加列：
  group_id (nullable, FK → asset_groups)
  group_role ('cover' | 'member' | null)   # 封面图/组内成员
```

**保存语义**：save-asset 节点新增 `groupName`（模板可用）——同一次运行内、同名 group 的资产自动归组（组名=应用名+运行序号自动生成，或用户指定）。运行时按 runId 聚合。

**资产中心展示**：子分类 Tab 下，组资产以"组卡片"展示（封面图 + 组名 + 成员数），点击展开组内全部图（画廊式）；非组资产保持单卡片。

**改动面**：迁移（asset_groups 表 + assets.group_id/group_role 列）+ AssetService（组聚合/建组/查组）+ save-asset 节点（groupName）+ 资产中心前端（组卡片/画廊）。

### 2.3 需求 3：资产来源关联跳转

**现状**：资产 `source_type=workflow|app|manual|import`，`source_ref=runId`。

**增强**：
1. 资产卡片显示来源徽标：「来自应用：电商商品套图」/「来自工作流：周报生成器」。
2. 点击跳转：
   - workflow 来源：`source_ref=runId` → 反查 run → definitionId → 跳到运行详情页 `/workflow/run/:runId`（或工作流编辑器）
   - app 来源：`source_ref=runId` → 反查 session → appId → 跳到应用会话页 `/apps/:appId/session/:sessionId`
3. **后端**：AssetService 新增 `resolveSourceLink(asset)` → `{ type: 'app'|'workflow', appId?, sessionId?, runId?, definitionId? }`；前端渲染跳转。
4. save-asset 保存时：`source_type` 区分——由应用会话触发（triggerInfo.source=app-session）→ 'app'；手动/定时 → 'workflow'。

**改动面**：AssetService（resolveSourceLink）+ save-asset 节点（sourceType 判定）+ 资产中心前端（来源徽标/跳转）。

### 2.4 需求 4：保存到资产可配置 + 套图整体呈现

**A. 保存开关**：save-asset 节点新增 `enabled`（boolean，默认 true）——false 时不落库（跳过保存，运行仍成功）。电商套图应用把「清单 report」的保存设为 false，或改为组内文档。

**B. 组图整体呈现**（与 2.2 联动）：电商套图应用配置：
- 每张图 save-asset `groupName=套图-{runId}` → 自动归组
- 清单 report 不单独存 text 资产，而是**作为组的文档描述**（组卡片显示清单摘要）
- 资产中心组卡片 = 封面图 + 组名 + 成员数 + 清单摘要，点击展开全部图

**C. 备选（图文文档整体）**：如用户倾向"一个整体文档"，可新增 report 节点输出"图文合集"（图片 URL 嵌入 markdown）保存为单个 document 资产——但文档内嵌图是外链，体验不如组图。

**推荐**：A（保存开关）+ B（组图整体呈现）组合。电商套图产物 = 1 个组（图 + 清单摘要），资产中心一组卡片，不再零散。

## 三、实施顺序（建议）

1. **需求 1**（纯前端，最快）：运行详情补 startInputs + 节点输入/输出展开
2. **需求 2 + 4B**（组图模型）：迁移 + AssetService + save-asset groupName + 资产中心组卡片
3. **需求 4A**（保存开关）：save-asset enabled 字段
4. **需求 3**（来源跳转）：resolveSourceLink + 前端徽标/跳转

## 四、待用户确认

1. 套图模型：**资产分组（asset_groups）**方案是否认可？还是倾向"图文文档整体"方案？
2. 保存开关：save-asset 加 `enabled` 开关是否足够？（或需要"仅不保存清单类"的更细粒度）
3. 电商套图应用配置：图归组 + 清单作组摘要（不单独存）——是否按此调整？
4. 需求 3 跳转目标：workflow 来源跳到**运行详情**还是**工作流编辑器**？
5. 四项全部实施，还是先做某几项？
