# 剧集制作 · 原型 vs 实现 帧对照表（FU5）

- 日期：2026-05-06
- 触发：用户于 5/6 当面质问"为什么不按照原型开发"——R8 红线长期失效，决定停下打补丁，做完整对照
- 选用方案：方案 A（参见 `docs/superpowers/plans/2026-05-06-ep-fu4-progress-and-issues.md` §5）
- 原型来源：`docs/ui-prototypes/episode-production/`（高保真 HTML 静态原型）
- spec：`docs/superpowers/specs/2026-05-02-episode-production-pipeline-design.md`
- 当前实现：分支 `feat/episode-production-redesign`

---

## 0. 工作流程

每个原型页面单独立一节（§1~§9），每节按下面 4 步推进：

1. **原型 cell 表**：把原型 HTML 渲染开后，把"页面"拆成顶部 / 主区域 / 侧边 / 底部 / 浮层等若干 cell，每个 cell 列：可见元素 / 文字 / 操作按钮 / 状态。
2. **当前实现 cell 表**：对相应实现 view 做同样拆分，记录目前实际可见的元素。
3. **差异表**：原型有 / 实现没 / 文字不一致 / 行为不一致；逐条标注 P0（阻断流程）/ P1（影响理解）/ P2（视觉细节）。
4. **整改 task 草稿**：把 P0/P1 转成可执行 task（暂不开工，等 §10 汇总后让 user 拍板）。

> **截图说明**：因 Playwright 在云沙箱里跑 file:// 不便保存图片，本对照以"文字版 cell 表 + DOM snapshot 摘要"为主；user 本机想直接看图可访问 `file:///.../docs/ui-prototypes/episode-production/<页面>.html`。

---

## 索引

| 节 | 原型 | 当前实现 | 状态 |
|---|---|---|---|
| §1 | 00-project-list.html | views/EpisodeProjectList.vue + 工作台外壳 | ⬜ 待做 (FU5-T1) |
| §2 | 01-stage-content.html | components/episode-production/stage-content/StageContentView.vue | ⬜ 待做 (FU5-T2) |
| §3 | 02-stage-asset.html | components/episode-production/stage-asset/AssetStageView.vue | ⬜ 待做 (FU5-T3) |
| §4 | 02-stage-asset-edit.html | components/episode-production/stage-asset/character/CharacterAssetEditor.vue | ⬜ 待做 (FU5-T3) |
| §5 | 02-stage-location-edit.html | components/episode-production/stage-asset/location/LocationAssetEditor.vue | ⬜ 待做 (FU5-T3) |
| §6 | 03-stage-script.html | components/episode-production/stage-script/StageScriptView.vue | ⬜ 待做 (FU5-T4) |
| §7 | 04-stage-storyboard.html | components/episode-production/stage-storyboard/StageStoryboardView.vue | ⬜ 待做 (FU5-T5) |
| §8 | 05-stage-production.html | components/episode-production/stage-production/StageProductionTabContent.vue | ⬜ 待做 (FU5-T6) |
| §9 | 06-stage-compose.html | components/episode-production/stage-compose/StageComposeView.vue + TimelineEditor | ⬜ 待做 (FU5-T7) |
| §10 | — | — | ⬜ 汇总 + 整改 backlog (FU5-T8) |

---

## 全局工作台框架（公共结构 · 在每节开头都要核对）

按原型 `index.html` 设计要点：

- **顶部进度条**：6 阶段始终可见，软引导（可任意跳转，缺前置时弹提示）
- **左侧资产侧栏**：4 大类（角色 / 地点 / 物品 / 语音）+ 数字徽章，任何阶段都能查 / 编辑资产
- **底部迷你时间线**：始终可见，预览当前已生产分镜的累计时长
- **双来源标签**：linked_lw（来自长文）/ standalone（剧集独立）
- **九宫格**：时间顺序的 N 张关键帧（2~9，UI 默认 3×3 视觉布局）
- **3D 占位**：tag-3d 标签预留

每个 stage 都该满足这 5 条全局约束，对照时如发现某 stage 主区域**没**遵循（比如顶部进度条丢了 / 侧栏不可见 / 底部时间线缺失），单独在差异表里标注一次（不在每节重复）。

### 全局横切约束（每个整改 task 必须满足）

- **G1 · 主题切换**（user 5/6 提醒）：所有 UI 必须同时支持亮 / 暗主题。颜色 / 背景 / 边框 / 状态色一律走 element-plus 变量（`var(--el-bg-color)` / `var(--el-color-primary)` / `var(--el-text-color-primary)` / `var(--el-fill-color-light)` / 等），禁止写死 hex。每个 P0/P1 整改 commit 必须切暗主题手测过。
- **G2 · 双端共用**（CLAUDE.md + memory）：写到 `core/` 的服务 / Repository / IPC 必须 PC + Web 都能跑；新组件不得使用 Electron 特有 API。
- **G3 · 主题变量审查**：在 P0/P1 整改的 self-check checklist 里加 "G1 主题切换实测"。原型本身 (`shell.css`) 用了一套自定义 token（`--color-primary` / `--color-text` / 等），实现时要换成 element-plus 的对应变量，不能直接 copy 原型 token。

---

## §1. 00-project-list.html · 剧集项目列表入口

> 状态：✅ 已完成（FU5-T1）
> 当前实现文件：`src/renderer/src/views/EpisodeProjectList.vue`

### 1.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 1.A | 顶部面包屑 | `← 原型导航`（链回 index.html，实际系统应替换为 "首页 > 剧集制作"） |
| 1.B | 页面头部 | 左侧：H1 `剧集制作 · 项目列表` + 副标题 `EpisodeProjectList — 选择已有项目或新建一个`；右侧：主按钮 `+ 新建项目` |
| 1.C | 项目卡 grid | grid 自适应（最小 280px），含 4 张 mock 项目卡 + 1 张"+ 新建"占位 |
| 1.C-card | 单张项目卡 | 上：130px 高彩色封面（4 种渐变色 + emoji 🎬/📖/🎥/📺）<br>下：标题（16px 粗）/ meta 行（**集数 · 类型 · 双来源标签**）/ 进度条 + 进度文字 |
| 1.C-mock | 4 张 mock 数据 | ① 江湖传·第一季 / 5 集 · 武侠 · linked_lw · 38% · 第 1 集进行中<br>② 人生苦短的故事 / 2 集 · 都市 · standalone · 100% · 已完成<br>③ 星海漫游记 / 1 集 · 科幻 · linked_lw · 12% · 资产准备中<br>④ 网红打卡推广 / 3 集 · 营销 · standalone · 65% · 第 2 集分镜中 |
| 1.C-new | 占位 | dashed 边框的"+ 新建剧集项目"卡（与 1.B 右上的按钮等价的次入口） |
| 1.D | 卡片交互 | 整张卡 click → 进入剧集工作台（按 spec 应当跳到该项目当前 stage） |

### 1.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 实.A | 面包屑 | **无**（直接进 page-header） |
| 实.B | 页面头部 | 左侧：H1 `剧集制作`（无副标题）；右侧：主按钮 `+ 新建项目` |
| 实.C | 项目卡 grid | grid 自适应（最小 360px） |
| 实.C-card | 单张项目卡 | 横向布局：左 64×64 图标（VideoCamera）/ 中 标题 + meta（**状态 + 创建日期**）+ 配置 tags（aspectRatio / resolution / fps）/ 右 FolderOpened + Delete 两个 icon button |
| 实.C-no-cover | 没有封面 | 没有视觉封面图，只有左侧 64×64 图标 |
| 实.C-no-progress | 没有进度条 | 卡片上看不到项目当前进度 / stage |
| 实.C-no-source | 没有双来源标签 | 看不到 linked_lw / standalone 区分 |
| 实.C-no-episode | 没有集数 meta | 看不到一个项目下有几集 |
| 实.C-extra | 多余元素 | 视频配置 tags（aspectRatio / resolution / fps）显示在卡片里；删除按钮直接显示 |
| 实.C-no-new-card | 没有占位卡 | 末尾没有"+ 新建项目"占位 |
| 实.D | 卡片交互 | click 卡片 → `router.push(/episode-production/{id})` → EpisodeWorkbench |
| 实.E | 新建对话框 | 字段：项目名 / 关联长文（select）/ 画幅比例 / 分辨率 / 帧率 / 默认转场 / 风格提示词 |

### 1.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 1.D-1 | 项目卡顶部彩色封面 + emoji | 横向布局，仅左侧 64×64 图标 | P1 | 卡片视觉风格差异大；原型偏"卡片名片"，实现偏"列表行" |
| 1.D-2 | meta 显示 **集数 · 类型 · 双来源标签** | meta 显示 状态 + 创建日期 | P1 | 集数 / 类型 / 双来源是产品语义信息，原型核心；状态 / 日期是技术信息 |
| 1.D-3 | 卡片底部有进度条 + 进度文字（"第 1 集进行中" / "已完成"等） | **完全没有**进度可视化 | P0 | 项目列表的核心价值是"快速判断 N 个项目各自的进度"——缺这个等于失明 |
| 1.D-4 | 末尾有 dashed "+ 新建项目"占位卡 | 无，仅靠右上按钮 | P2 | 多一个入口，视觉引导更清晰 |
| 1.D-5 | 卡片**不显示**视频配置（aspectRatio/resolution/fps） | 显示在卡片里 | P2 | 技术参数在列表是噪音，应放详情/编辑页 |
| 1.D-6 | 卡片**不显示**删除按钮 | 直接显示 Delete icon | P2 | 增加误操作风险；应在 hover 浮层 / 右键菜单 / 详情页 |
| 1.D-7 | 没有"状态"字段（draft/in_progress/...） | 有状态标签 | P2 | 状态信息可被进度条 + 进度文字取代，更直观 |
| 1.D-8 | grid 最小 280px | 360px | P2 | 280px 主流屏 3-4 列、360px 只能 2-3 列；卡片密度差异 |
| 1.D-9 | 顶部面包屑 | 无 | P2 | 系统级面包屑应有，与全局导航一致 |
| 1.D-10 | mock 数据含 集数 / 类型 / 进度% / 进度文字 | 数据模型不带这些聚合字段 | P0 | 需要数据层支持：`videoProject` 增 `episodeCount / projectType / progressPct / currentStageLabel` 字段或新增聚合 IPC |

### 1.4 整改 task 草稿（待 §10 汇总后让 user 拍板）

- [ ] **P0-1.A** 设计 + 实现"项目进度"聚合字段（episodeCount / progressPct / currentStageLabel），后端 listProjects 返回时填充
- [ ] **P0-1.B** 改写 EpisodeProjectList.vue：卡片改成"封面 + 标题 + 集数·类型·双来源 + 进度条"垂直布局
- [ ] **P1-1.C** 加 4 种渐变色封面（按 projectType / 集数 hash 选色）+ 默认 emoji
- [ ] **P1-1.D** 加双来源标签（项目级 source_type 字段，linked_lw / standalone）
- [ ] **P2-1.E** 加末尾"+ 新建项目"占位卡 / 删除按钮挪 hover / 视频配置移到详情页 / 加面包屑
- [ ] **G1-1.F** 所有新增 UI 走 `var(--el-*)` 主题变量；亮/暗主题各手测一次

---

---

## §2. 01-stage-content.html · ① 内容（识别要素）

> 状态：✅ 已完成（FU5-T2）
> 当前实现文件：`src/renderer/src/components/episode-production/stage-content/StageContentView.vue`
> 工作台外壳（topbar / sidebar / footer）已由 §0 全局约束统一覆盖，本节只看 stage 主区域。

### 2.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 2.A | main-header | 左：标题 `① 内容识别` + 副标题 `从长文项目或上传文本中识别出本剧集的角色 / 地点 / 物品`<br>右：主按钮 `确认要素 → ② 资产`（成功色） |
| 2.B | 来源选择 source-area | title 左 `来源`，右辅助 `sourceType = 'outline'（来自长文项目）`<br>**source-tabs（可切换）**：`📚 长文项目`(active) / `📝 上传文本`<br>长文模式：两个 select 并排——`长文项目` + `章节` |
| 2.C | 原文片段 source-area | title 左 `原文片段`，右内嵌按钮 `✨ 重新 AI 分析`<br>main 区：渲染 4 段原文，**用 `<strong>` + 黄色背景高亮已识别实体**（张三 / 茶馆 / 李四 / 老板娘 / 折扇 / 书信 / 长剑）<br>footer 提示：`字数：约 120 字 · AI 已扫描，识别出 3 角色 / 1 地点 / 3 物品 — 见下方` |
| 2.D | 识别要素清单标题行 | 左 H3 `识别要素清单`<br>右说明：`勾选要进入剧集的要素，可以为每个选 linked_lw（来自长文）或 standalone（本剧集独立）` |
| 2.E | entity-row（3 列等宽） | 角色 / 地点 / 物品 三列；每列上方 `+ 手动加` 按钮 |
| 2.E-card | entity-card-mini | 4 元素：复选框 + name + desc（含 `来自长文 lw_character_id=lwc_001` 之类来源说明） + **双来源标签**（linked_lw / standalone）<br>standalone 卡上有小链接 `改为 linked_lw`<br>视觉：checked 卡背景为 success-light，hover 为浅灰 |
| 2.E-mock | mock 数据 | 角色 3：张三 (linked_lw) / 李四 (linked_lw) / 老板娘 (standalone)<br>地点 2：茶馆 (linked_lw) / 客栈 (linked_lw + 3D 标签)<br>物品 4：折扇 / 书信 / 长剑（linked_lw）+ 玉佩（手动加） |
| 2.F | 完成提示 banner | success-light 背景 + 左 success border<br>大 ✓ 图标 + 标题 `已确认 9 个要素 — 可以进入资产准备`<br>副文 `3 角色 + 2 地点 + 4 物品。其中 8 个 linked_lw…1 个 standalone…`<br>右侧再放一次 `确认要素 → ② 资产` 按钮 |

### 2.2 当前实现 cell 表（FU4-1 之后）

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 实.A | view-header | 左 H3 `① 内容`（**没有副标题**）；右 view-actions：`AI 识别要素` 按钮（FU4-1 加）+ `确认要素 → 进入 ② 资产` 按钮 / `已确认` 标签 |
| 实.B | 内容来源（左 320px source-panel） | h4 `内容来源` + el-tag（`上传长文` / `大纲章节`）；不可切换<br>uploaded 模式：`上传长文（N 字）` + 滚动框显示原文<br>outline 模式：`outline ID: xxx` 静态标签 + outline-note 文字 |
| 实.C | AI 识别要素（右 entities-panel） | h4 `AI 识别的要素`；outline 模式下显示 outline-hint 提示而非三栏 |
| 实.C-grid | entities-grid（3 列） | 角色 / 地点 / 物品 col-header（`👤/🏛/📦 + count tag`）+ 卡片列表 |
| 实.C-card | entity-card | name + role（如 `主角`） + desc<br>**无 checkbox / 无双来源标签 / 无 source 切换链接** |
| 实.D | rebuild-note | FU4-1 之后：空时 `还未识别到任何要素。请点上方"AI 识别要素"按钮跑 AI 识别`，有数据时 `已识别 N 个要素。如需调整可点"重新识别"重跑。` |

### 2.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 2.D-1 | 用户可取舍 entity（checkbox） | 实现仅展示 AI 识别结果，**不能取消选** | P0 | spec §0.4 流程明确"用户确认要素清单"——确认 = 可取舍。当前是"AI 识别什么就是什么" |
| 2.D-2 | 每列 `+ 手动加` 按钮，弹小表单写入 uploadedX | 完全没有手动添加入口 | P0 | AI 漏识别时用户没法补 |
| 2.D-3 | 双来源标签（linked_lw / standalone）显示在每张 entity-card | 完全没有标签 | P0 | spec §1.2 双来源是核心概念；UI 看不到等于断开心智模型 |
| 2.D-4 | standalone → linked_lw 的切换链接 | 没有 | P1 | 用户没法把 AI 识别的"老板娘"绑回长文已有 lw_character |
| 2.D-5 | 原文中已识别实体用 `<strong>` + 黄色背景高亮 | 原文是纯文本，没有任何高亮 | P1 | 这是 ① 内容 stage 最直观的"AI 看见了什么"反馈 |
| 2.D-6 | source-area 里嵌 `来源 tabs`：长文项目 / 上传文本 | 创建剧集后 sourceType 锁定，stage 内不能切换 | P1 | 用户不能在 stage 里切换尝试不同来源 |
| 2.D-7 | 长文模式下两个 select：长文项目 + 章节（可改章节） | 只显示静态 outline ID 标签 | P1 | 改章节要回创建对话框；探索性弱 |
| 2.D-8 | 标题副文："勾选要进入剧集的要素 / 双来源含义" | 完全无说明 | P1 | 用户不知道双来源是什么、为什么要选 |
| 2.D-9 | 底部 success banner：`已确认 9 个要素 — 3 角色 + 2 地点 + 4 物品 + 来源分布` | 没有总结 / 统计 banner | P1 | 用户不知道自己确认了什么；进 ② 时无心理预期 |
| 2.D-10 | 原文区内嵌 `✨ 重新 AI 分析` 按钮 | FU4-1 在顶部 view-actions 加了"重新识别"按钮 | P2 | 等价但位置远离原文；可保留现状 |
| 2.D-11 | 字数 + 识别统计提示 `约 120 字 · 识别 3/1/3` | 仅显示字数（侧栏），无 AI 识别统计 | P2 | 提示性文案差异 |
| 2.D-12 | 3D 标签预留（客栈卡上的 tag-3d） | 完全没 3D 标签设施 | P2 | 本期不实现 3D，留空兼容即可 |
| 2.D-13 | main-header 副标题说明 stage 用途 | 仅 H3 一行，没有副标题 | P2 | 文案细节，影响首次用户引导 |

### 2.4 整改 task 草稿（待 §10 汇总后让 user 拍板）

- [ ] **P0-2.A** 设计 entity 取舍 UI：每张 entity-card 加 checkbox，确认时把 **未勾选**的从 episode.uploadedX 移除
- [ ] **P0-2.B** 加 `+ 手动加` 按钮（每列一个）：弹 ElMessageBox.prompt（name / role|type / desc 三字段）→ 写回 uploadedX
- [ ] **P0-2.C** 在 entity-card 显示双来源标签（linked_lw / standalone）；新加 `entity.sourceType` 字段（standalone 默认；如有 lw_character_id 则 linked_lw）
- [ ] **P1-2.D** 加 `改为 linked_lw / 改为 standalone` 切换链接，弹长文实体 picker
- [ ] **P1-2.E** 原文区高亮：渲染 uploadedContent 时把 entity.name 用 `<mark>`（或类似）包起来 + 黄色高亮
- [ ] **P1-2.F** 来源 tabs（长文 / 上传）让用户在 stage 内切换 sourceType；改要弹"切来源会清空当前要素"确认
- [ ] **P1-2.G** 标题区加副标题 + 双来源说明文案
- [ ] **P1-2.H** 底部加 success banner：统计 + 来源分布 + 再次"确认要素 → ② 资产"按钮
- [ ] **P2-2.I** 原文区内嵌"✨ 重新 AI 分析"按钮（与顶部按钮指向同一 action）
- [ ] **P2-2.J** entity 卡片预留 3D 标签结构（不实现行为）
- [ ] **G1-2.K** 所有新增 UI 走 `var(--el-*)` 主题变量；亮/暗主题各手测一次

---

---

## §3. 02-stage-asset.html · ② 资产（4 类盘点）

> 状态：⬜ 待做（FU5-T3 a）

### 3.1 原型 cell 表

待填。

### 3.2 当前实现 cell 表

待填。

### 3.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|

待填。

---

## §4. 02-stage-asset-edit.html · 角色资产卡编辑

> 状态：⬜ 待做（FU5-T3 b）

### 4.1 原型 cell 表

待填。

### 4.2 当前实现 cell 表

待填。

### 4.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|

待填。

---

## §5. 02-stage-location-edit.html · 地点资产卡编辑（场景图）

> 状态：⬜ 待做（FU5-T3 c）

### 5.1 原型 cell 表

待填。

### 5.2 当前实现 cell 表

待填。

### 5.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|

待填。

---

## §6. 03-stage-script.html · ③ 剧本

> 状态：⬜ 待做（FU5-T4）

### 6.1 原型 cell 表

待填。

### 6.2 当前实现 cell 表

待填。

### 6.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|

待填。

---

## §7. 04-stage-storyboard.html · ④ 分镜

> 状态：⬜ 待做（FU5-T5）

### 7.1 原型 cell 表

待填。

### 7.2 当前实现 cell 表

待填。

### 7.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|

待填。

---

## §8. 05-stage-production.html · ⑤ 画面+音频（九宫格）

> 状态：⬜ 待做（FU5-T6）

### 8.1 原型 cell 表

待填。

### 8.2 当前实现 cell 表

待填。

### 8.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|

待填。

---

## §9. 06-stage-compose.html · ⑥ 合成

> 状态：⬜ 待做（FU5-T7）

### 9.1 原型 cell 表

待填。

### 9.2 当前实现 cell 表

待填。

### 9.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|

待填。

---

## §10. 差异汇总 + 整改 backlog

> 状态：⬜ 待做（FU5-T8）

### 10.1 P0（阻断流程，必须修）

待汇总。

### 10.2 P1（影响理解，应该修）

待汇总。

### 10.3 P2（视觉细节，可延后）

待汇总。

### 10.4 整改 task backlog（待 user 审）

待汇总。

---

## 优先级定义

- **P0 · 阻断流程**：用户按原型预期操作时无法继续 / 找不到入口 / 行为错误。例如：① 内容空态没有识别按钮（已修）、② 资产 stage 顶部 gap banner 缺失（已修）。
- **P1 · 影响理解**：能用，但 UX 跟原型相去甚远，会导致用户认知偏差。例如：双来源标签缺失、九宫格视觉布局未遵守、左侧资产侧栏不可见。
- **P2 · 视觉细节**：纯样式 / 文案差异。例如：badge 颜色不一致、按钮位置偏移、间距不准。

---

## 进展跟踪

| 日期 | 节 | 完成情况 | 提交 hash |
|---|---|---|---|
| 2026-05-06 | §0 骨架 + §10 汇总区 | ✓ 建立 | (本次) |
