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

| 节 | 原型 | 当前实现 | 状态 | P0 数 |
|---|---|---|---|---|
| §1 | 00-project-list.html | views/EpisodeProjectList.vue | ✅ 完成 | 2 |
| §2 | 01-stage-content.html | components/.../stage-content/StageContentView.vue | ✅ 完成 | 3 |
| §3 | 02-stage-asset.html | components/.../stage-asset/AssetStageView.vue | ✅ 完成 | 3 |
| §4 | 02-stage-asset-edit.html | components/.../stage-asset/character/CharacterAssetEditor.vue | ✅ 完成 | 2 |
| §5 | 02-stage-location-edit.html | components/.../stage-asset/location/LocationAssetEditor.vue | ✅ 完成 | 2 |
| §6 | 03-stage-script.html | components/.../stage-script/StageScriptView.vue | ✅ 完成 | 2 |
| §7 | 04-stage-storyboard.html | components/.../stage-storyboard/StageStoryboardView.vue | ✅ 完成 | 2 |
| §8 | 05-stage-production.html | components/.../stage-production/StageProductionTabContent.vue | ✅ 完成 | 3 |
| §9 | 06-stage-compose.html | components/.../stage-compose/StageComposeView.vue | ✅ 完成 | 2 |
| §10 | 汇总 + 整改 backlog + Phase 规划 | — | ✅ 完成 | (合计 21) |

---

## 全局工作台框架（公共结构 · 在每节开头都要核对）

按原型 `index.html` 设计要点 **+ user 5/6 当面修订**：

- **顶部进度条**：6 阶段始终可见，软引导（可任意跳转，缺前置时弹提示）
- **资产侧栏**（**修订原型**）：
  - ① 内容、② 资产 stage **不显示侧栏**（① 资产未就绪、② 主区即资产清单，重复）
  - ③ 剧本 / ④ 分镜 / ⑤ 画面+音频 / ⑥ 合成 **侧栏放右侧**（不是原型左侧）
  - 4 大类（角色 / 地点 / 物品 / 语音）+ 数字徽章 + 双来源 small tag
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

> 状态：✅ 已完成（FU5-T3 a）
> 当前实现文件：`src/renderer/src/components/episode-production/stage-asset/AssetStageView.vue` + `{Character,Location,Item,Voice}AssetCard.vue` + `workbench/AssetSidebar.vue`

### 3.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 3.A | main-header | 左：标题 `② 资产盘点` + 副标题 `本剧集出场要素：3 角色 · 2 地点 · 4 物品 · 5 语音 · 已就绪 9/14`<br>右：两个按钮 `跳过空缺 (3)` + `✨ 一键生成所有缺失主图`（主按钮） |
| 3.B | 整体进度卡 | `阶段进度` 标签 + 8px 渐变进度条（success → 浅绿）+ 文字 `主图齐备 9/14 · 图谱完整度 42%` + `完成本阶段 →` 主按钮 |
| 3.C | 4 个 asset-section（角色/地点/物品/语音） | 每节有 section-header：图标 + 标题 + count tag + 右侧 `批量派生图谱` / `批量派生变体` / `+ 复刻新音色` 等批操作按钮 |
| 3.D-card | asset-card 通用结构 | 上：缩略图 thumb + 右上 badge（`linked_lw` / `standalone` / `3D` / `系统` / `复刻`）<br>下：title + 状态 tag（`主图 ✓` / `缺主图` / `3D 已升级`） + meta（图谱进度 / 视角变体数 / 声音状态 / 绑定关系） + actions |
| 3.D-char | 角色卡 mock | 张三（linked_lw + 主图 ✓ + 图谱 8/12 + 声音 ✓） / 李四（linked_lw + 缺主图 + 图谱 0/12 + 声音 ⚠） / 老板娘（standalone + 主图 ✓ + 图谱 3/9 + 声音 ✓） |
| 3.D-loc | 地点卡 mock | 茶馆（linked_lw + 主图 ✓ + `3 时间 · 2 天气 · 4 视角`）/ 客栈（3D + `3D 已升级` + `360 全景 · 摆位场景 1` + 设定/3D 编辑） |
| 3.D-item | 物品卡 mock | 长剑（linked_lw + `4 视角 · 2 上下文`）/ 折扇 / 书信 / 玉佩（缺主图 + `0 视角` + `✨ 生成主图`） |
| 3.D-voice | 语音卡 mock | 5 张：3 系统（沉稳男声 / 温柔女声 / 苍老男声）+ 2 复刻（我自己 / 助理 A）；卡上显示 `绑定: 张三 / 旁白` 或 `未绑定`，所有卡都有 `▶ 试听` |
| 3.E-actions | 卡片按钮规则 | 已有主图：`设定` + `图谱`；缺图：仅 `✨ 生成主图`（蓝色 primary）；3D：`设定` + `3D 编辑`；语音：`▶ 试听` |
| 3.F-sidebar | 左侧资产侧栏 | 4 节（角色/地点/物品/语音）；每行：缩略图（带 ⚠ 状态变体）+ 名 + meta（双来源 small tag / `主角` / `缺图` / `3 个变体` / `系统` / `复刻`）；末尾 `+ 添加 XX` 链接 |

### 3.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 实.顶 | StageGapBanner（FU4-3 加） | 仅在 currentStatus < asset_prep 时显示 |
| 实.A | main-header | **没有** main-title / main-subtitle（直接进进度卡） |
| 实.B | 整体进度卡（el-card） | `阶段进度` 标签 + el-progress + 文字 `主图齐备 N/M · 图谱完整度 X%` + `完成本阶段 →` 按钮<br>**注：readyCount / overallProgress / galleryCompletion 全部占位为 0**（见 AssetStageView.vue line 175-177） |
| 实.C | 4 个 el-card asset-section | section-header：图标 + 名（`角色`） + count el-tag + `+ 新建XX` 按钮（**没有"批量派生"批操作按钮**） |
| 实.D-card | 各 *AssetCard | 缩略图 + 单个 el-tag badge（**只显示 source_type ：linked_lw / standalone**，没有 3D / 系统 / 复刻 区分；语音卡 badge 待确认）<br>title 旁有 `主图 ✓ / 缺主图`<br>meta：仅 `图谱 N 张` 一项<br>action：仅 `已生成 / 生成主图` 一个按钮 |
| 实.D-voice | VoiceAssetCard | 待确认是否有"试听"按钮 + 绑定信息显示 |
| 实.F-sidebar | AssetSidebar.vue | 待确认 4 节实现 + 项目数 + 缺图状态 |

### 3.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 3.D-1 | main-header 副标题 `本剧集出场要素：N 角色 · M 地点 · P 物品 · Q 语音 · 已就绪 X/Y` | 完全无 main-header | P0 | 用户进 ② 时第一眼看不到全局摘要 |
| 3.D-2 | header 右侧 `✨ 一键生成所有缺失主图` 主按钮 + `跳过空缺 (3)` | 完全没有；只能逐张点 | P0 | 缺图>3 时用户体验灾难（每张都要等 1-2min） |
| 3.D-3 | 进度卡 `主图齐备 9/14 · 图谱完整度 42%` 真实数据 | readyCount / overallProgress / galleryCompletion 写死为 0 | P0 | spec §3.9 要求展示真实完整度；当前是占位 |
| 3.D-4 | 角色 section 有 `批量派生图谱` 按钮（一键派生主图→视角/表情/姿势） | 没有 | P1 | spec §3.5/3.6 派生流是核心 ROI |
| 3.D-5 | 地点 section 有 `批量派生变体` 按钮（一键时间/天气/视角变体） | 没有 | P1 | spec §3.2/§3.3 |
| 3.D-6 | 卡片 badge 含 `linked_lw / standalone / 3D / 系统 / 复刻`（5 种） | 仅 source_type 一种（linked_lw / standalone） | P1 | 3D 标签 + 语音 系统/复刻 区分缺失 |
| 3.D-7 | 角色卡 meta：`图谱 N/M · 声音 ✓/⚠`（双指标） | 仅 `图谱 N 张`（绝对数，无目标） | P1 | 用户不知道一张卡需要多少图谱才"完整" |
| 3.D-8 | 地点卡 meta：`3 时间 · 2 天气 · 4 视角`（变体维度细分） | 不细分（继承角色卡风格） | P1 | 地点卡不该套角色卡模型 |
| 3.D-9 | 物品卡 meta：`N 视角 · M 上下文` | 沿用 `图谱 N 张` 风格 | P1 | 物品卡也不该套角色卡 |
| 3.D-10 | 语音卡显示 `绑定: 张三 / 旁白` 或 `未绑定` + `▶ 试听` 按钮 | 待确认 | P1 | 验声 + 跨剧集复用是核心 |
| 3.D-11 | 卡片 actions 双按钮 `设定` + `图谱`（编辑入口分离） | 单按钮 `已生成 / 生成主图` | P1 | "设定卡 vs 图谱"是 spec §3 关键概念，用户进编辑应有明确分支 |
| 3.D-12 | 缺图卡片 `✨ 生成主图`（蓝色 primary） | `生成主图` 默认色 | P2 | 视觉强度差异；缺图是"应当主推"的状态 |
| 3.D-13 | 角色卡 thumb 在缺主图时显示 `⚠` 警告占位 | 待确认 | P1 | 卡片缩略图本身应当一眼可识别状态 |
| 3.D-14 | 左侧 sidebar 行 meta 含双来源 small tag + 状态文字（`主角` / `缺图` / `3 个变体`） | 实现要确认 AssetSidebar 是否含同等信息 | P1 | sidebar 是 spec §2.1 全局公共组件，应跨 stage 一致 |
| 3.D-15 | 3D 占位（客栈卡 + sidebar） | 无 3D 任何标记 | P2 | 本期不实现 3D，但视觉上要预留 |
| 3.D-16 | sidebar 末尾 `+ 添加 XX` 链接 | 待确认 | P2 | sidebar 内可加入口减少跳转 |

### 3.4 整改 task 草稿

- [ ] **P0-3.A** main-header 加副标题（资产摘要 + 已就绪进度）+ 顶部 `一键生成所有缺失主图` 按钮（异步队列；进度可见）
- [ ] **P0-3.B** 实现真实进度统计（接 `asset_image` 聚合 IPC，去掉 line 175 的占位 `0`）
- [ ] **P1-3.C** 角色/地点 section 加 `批量派生图谱 / 派生变体` 批操作（弹批量配置 dialog）
- [ ] **P1-3.D** 卡片 badge 扩展：linked_lw / standalone / 3D / 系统 / 复刻 五状态独立色 token
- [ ] **P1-3.E** 卡片 meta 按 4 类资产分别定制：
  - 角色：`图谱 N/M · 声音 ✓/⚠`
  - 地点：`N 时间 · M 天气 · P 视角`
  - 物品：`N 视角 · M 上下文`
  - 语音：`绑定: XX / YY` 或 `未绑定` + `▶ 试听`
- [ ] **P1-3.F** 卡片 actions 拆为 `设定` + `图谱` 双按钮（已有主图时）；地点 3D 模式 → `设定` + `3D 编辑`
- [ ] **P1-3.G** 缺主图缩略图 ⚠ 占位（已有 thumb.warn 类）
- [ ] **P1-3.H** AssetSidebar 增强：每行带双来源 small tag + 状态文字 + 末尾 `+ 添加` 链接
- [ ] **P2-3.I** 缺图卡片"生成主图"按钮改 primary 色 + ✨ 图标
- [ ] **P2-3.J** 3D 标签视觉占位（不实现 3D 编辑）
- [ ] **G1-3.K** 所有新增 / 改造 UI 走主题变量；亮/暗主题各手测一次

---

---

## §4. 02-stage-asset-edit.html · 角色资产卡编辑

> 状态：✅ 已完成（FU5-T3 b）
> 当前实现文件：`character/CharacterAssetEditor.vue` + `CharacterCardForm.vue` + `CharacterGalleryEditor.vue`

### 4.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 4.A | 顶部行 | `← 返回盘点` 按钮 / H2 角色名 `张三` / `linked_lw · 来自《江湖传》原著` tag / `主图齐备` tag<br>右：`↺ 拉取最新基础值` / `保存`（成功色） |
| 4.B | 长文同步提醒 banner | warning 背景，左 warning border：`ⓘ 长文中"张三"的设定 4 天前更新过 — 查看变更 / 同步基础值` |
| 4.C | 左 360px 设定卡 panel | H3 `📋 设定卡`<br>**身份**：姓名 / 别名 / 定位 / 性别 / 年龄（80px label + 值 grid）<br>**外貌**：自由文字描述 + 底部 `基础值来自长文` 提示 + `+ 添加 override` 链接<br>**服装**：默认 + 备选 文字描述<br>**声音**：音色 + ▶ 试听 / 语速 / 音调 / 情感（80px label + 值 grid）<br>**风格锚点**：tags（工笔国风 / 水墨 / 微写实）<br>底部按钮 `绑定 portrait_id` + 提示 `当前未绑定 — 主图由本剧集独立生成` |
| 4.D-head | 右图谱 panel header | `🖼 图谱` + `8/12 已生成` + `✨ 批量派生缺失` 按钮 |
| 4.D-main | 主图 row | 标题 + `✓ 已生成` tag<br>左 120×160 大图 + 右元信息（生成时间 / provider）+ ↺ 重生成 / ⬆ 上传替换 |
| 4.D-view | 视角 row | 标题 + `3/6 已生成` + `✨ 派生剩余`<br>6 列网格（aspect-ratio 3/4）：front / 3q_left / 3q_right / side_l / side_r / back（label 在缩略图下方） |
| 4.D-emotion | 表情 row | 6 列网格（aspect 1）：neutral / angry / happy / sad / surprised / confused |
| 4.D-outfit | 服装 row | `2/3 已生成` + `+ 添加服装`<br>3 列网格（自由 label）：玄袍 / 白衣 / + 便装 |
| 4.D-pose | 姿势 row | `1/4 已生成`<br>4 列网格：standing / sitting / walking / fighting |
| 4.E | 底部 tip | primary-light 背景 + 左 primary border：`💡 派生图都以"主图"为参考生成，保证人物形象跨视角/表情/服装一致` |

### 4.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 / 状态 |
|---|---|---|
| 实.A | header | `返回盘点` 按钮 + H2 角色名 + linked_lw / standalone el-tag<br>**没有**主图齐备 tag、`拉取最新基础值`、`保存` 按钮（保存在 CardForm 内部底部） |
| 实.B | 长文同步提醒 banner | **完全没有** |
| 实.C | CharacterCardForm 字段 | 名称 / 描述 / 外貌 / 服装 / 声音（el-select）/ 形象库 portrait_id<br>每个字段有 `+ override / 取消 override` 切换<br>**缺**：身份块（别名 / 定位 / 性别 / 年龄）、声音详细（语速 / 音调 / 情感）、风格锚点 |
| 实.D-head | CharacterGalleryEditor header | 仅显示标题，不在头部显示 `N/M 已生成` 全局进度 + 批量派生缺失按钮 |
| 实.D-main | 主图 | 缩略图 + `已就绪 / 缺主图` tag + `✨ 生成主图` / `↺ 重生成`<br>**待确认**：是否有元信息（生成时间 / provider） |
| 实.D-view | 视角维度 | 用 LABELS（key='view'）固定 label 列表展示进度网格<br>**待确认**：label 文字是否与原型 6 项一致；是否在缩略图下方显示 label |
| 实.D-emotion | 表情维度 | 同上 (key='expression') |
| 实.D-outfit | 服装维度 | 自由 label，与原型一致 |
| 实.D-pose | 姿势维度 | 同 view (key='pose')，**待确认 4 个 label** |
| 实.E | 底部 tip | **没有** "派生图以主图为参考保证一致性" 文案 |

### 4.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 4.D-1 | 长文同步提醒 banner（4 天前更新 + 同步基础值链接） | 完全没有 | P0 | spec §3.7 lw 同步是 linked_lw 模式核心；当前实现 lw 改了用户感知不到 |
| 4.D-2 | header 主图齐备状态 tag + 拉取最新基础值 + 显式保存按钮 | 三者都没有（保存藏在 CardForm 内部） | P1 | 用户对"我有没有改过 / 是否已保存" 心里没数 |
| 4.D-3 | 设定卡含完整身份块（姓名 / 别名 / 定位 / 性别 / 年龄） | CardForm 仅有 名称 + 描述 | P0 | 关键人物属性缺失，spec §3.1 明确身份字段 |
| 4.D-4 | 设定卡声音含语速 / 音调 / 情感参数 | 仅 voiceId 选择 | P1 | spec §3.4 声音域参数完整 |
| 4.D-5 | 设定卡风格锚点（tags） | 完全没有 | P1 | spec §3.6 风格 token 是派生一致性的关键 |
| 4.D-6 | 图谱 header 全局进度 `N/M 已生成` + `✨ 批量派生缺失` 按钮 | 待确认（grep 显示按钮存在但位置可能不同） | P1 | 用户应能在 header 看见整体进度并一键补缺 |
| 4.D-7 | 主图卡片元信息：生成时间 + provider + 重生成 + 上传替换 | 待确认元信息显示完整度 | P1 | 用户调试图片质量需要看时间和 provider |
| 4.D-8 | 维度网格：缩略图下方显示 label 文字（front / 3q_left / ...） | 待确认 | P1 | 没 label 文字用户不知道每张图代表哪个变体 |
| 4.D-9 | 维度 label 严格对齐 spec §3.5/§3.7 字段 | 实现 LABELS 列表是否与 spec 一致需 audit | P1 | 不一致会导致前后端字段不通 |
| 4.D-10 | 底部 tip：`派生图以主图为参考...` | 完全没有 | P2 | 教育性文案，引导用户理解派生流 |
| 4.D-11 | 设定卡每节用细线分隔 + 11px tertiary 标签 | 实现是 el-form-item 标准布局 | P2 | 视觉密度差异，原型紧凑、实现宽松 |
| 4.D-12 | 上传替换按钮（除生成外另开通道） | 待确认（line 240 注释说留 follow-up） | P2 | spec 允许用户上传自定义主图 |

### 4.4 整改 task 草稿

- [ ] **P0-4.A** 长文同步提醒 banner：linked_lw 模式下查询 lw 实体 updatedAt 与 binding 同步时间；过期则显示 banner + 同步动作
- [ ] **P0-4.B** CardForm 增补身份块字段（别名 / 定位 / 性别 / 年龄）
- [ ] **P1-4.C** 顶部 header 加 `主图齐备` tag、`↺ 拉取最新基础值`、显式 `保存` 按钮（CardForm 内的保存挪上来）
- [ ] **P1-4.D** CardForm 增补声音参数（语速 / 音调 / 情感）
- [ ] **P1-4.E** CardForm 增补风格锚点 tags（多选 + 自由输入）
- [ ] **P1-4.F** GalleryEditor header 加全局进度 + `✨ 批量派生缺失` 按钮
- [ ] **P1-4.G** 维度网格在缩略图下方显示 label 文字 + 全 label 与 spec 字段对齐 audit
- [ ] **P1-4.H** 主图卡片显示元信息（generatedAt / provider / model）
- [ ] **P2-4.I** 底部 tip 文案
- [ ] **P2-4.J** 主图上传替换通道（multipart）
- [ ] **G1-4.K** 主题切换实测

---

---

## §5. 02-stage-location-edit.html · 地点资产卡编辑（场景图）

> 状态：✅ 已完成（FU5-T3 c）
> 当前实现文件：`location/LocationAssetEditor.vue` + `LocationCardForm.vue` + `LocationGalleryEditor.vue` + `PanoramaSnapshotEditor.vue`

### 5.1 原型 cell 表（精简）

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 5.A | 顶部 header | 返回 / H2 地点名 / linked_lw tag / 主图齐备 tag / 拉取最新基础值 / 保存 |
| 5.B | 长文同步提醒 banner | warning：`长文中"茶馆"的设定 2 天前更新过 — 查看变更` |
| 5.C | 左 360px 设定卡 panel | 6 节：**基础**（名称/类型/规模/描述）/ **视觉特征** + 来自长文 + 添加 override / **氛围** tags / **变体维度**（默认时间 / 默认天气 / 支持季节占位）/ **风格锚点** tags / **360 全景 + 3D 升级**说明区 |
| 5.D-main | 主图 | 标题 + `默认状态：黄昏 · 阴天` + ↺ 重生成 / ⬆ 上传替换<br>16:9 缩略图 + 生成时间 / provider / 分辨率 + `📌 派生变体都用本主图作为参考图` |
| 5.D-time | 时间变体 | 7 列网格：morning / noon / afternoon / evening★ / night / dawn / dusk（中文 label 在下方）+ `✨ 派生剩余` |
| 5.D-weather | 天气变体 | 6 列网格：sunny / cloudy★ / rainy / snowy / foggy / stormy |
| 5.D-angle | 视角变体 | 4 列网格：wide_shot 远景 / entrance 入口 / interior_a 临窗 / interior_b 后堂（自由 label，每张下方有中文）+ `✨ 派生剩余` |
| 5.E-pano | 360 全景图 panel | header：标题 + `已生成` tag + spec §4.5.10 引用 + ↺ 重新生成 / ⬆ 上传替换<br>21:9 拖拽预览区（pano-tag 显示 `panorama_360 · 6912×3456 · equirectangular` + 操作提示）<br>底部：生成时间 / provider / `用 photo-sphere-viewer.js 在浏览器内 360 拖动预览` |
| 5.E-snap | 视角截图（panorama_snapshot） | header：标题 + `3 张 · 给分镜当背景 ref` + 描述（spec §4.5.10）+ `+ 进入截图模式`（primary）<br>4 列网格：`snap_1.1 · yaw=0° pitch=-5° fov=70°` + 分镜 1.1 ribbon...<br>底部 success-banner：`✓ 3D 一致性效果：分镜 1.1/1.2/1.3 都从同一全景图截图，背景 3D 几何一致` |
| 5.F-priority | 一致性优先级提示 banner | primary-light：`💡 分镜如何用这些图？⑤ 画面+音频阶段每生成一张关键帧时，参考图按以下优先级注入：1. panorama_snapshot 2. 退回 angle 3. 退回主图` |
| 5.G-3d | 3D 摆位 Phase 8 占位 | 灰色 panel，标题 + 3D tag + `Phase 8 不实现` 说明文字 |

### 5.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 实.A | header | 返回按钮 + 标题 + linked_lw tag（与角色一致结构） |
| 实.B | banner | 没有长文同步提醒 |
| 实.C | LocationCardForm | 已有字段（待 audit）但**与原型 6 节结构不一致** |
| 实.D-main | 主图 | 已有（与角色卡同 LABELS 风格） |
| 实.D-cat | 3 个 category | time_variant ✓ / weather_variant ✓ / angle_variant ✓（label 与原型一致：morning/noon/afternoon/evening/night/dawn/dusk + sunny/cloudy/rainy/snowy/foggy/stormy + wide_shot/entrance/interior_a/interior_b） |
| 实.E-pano | 360 全景区 | `🌐 360 全景图（panorama_360）` + `已生成 N` tag + `✨ AI 生成 360 全景` + `⬆ 上传现成 360 图`<br>panorama-list 用 el-radio-button tab 切换<br>嵌入 PanoramaSnapshotEditor |
| 实.E-snap | PanoramaSnapshotEditor | 视角截图器，photo-sphere-viewer.js 已接入 |
| 实.F | 优先级提示 | **没有**"参考图按 panorama_snapshot → angle → 主图 优先级注入"提示文案 |
| 实.G | 3D 摆位 | **没有** Phase 8 占位 |

### 5.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 5.D-1 | 长文同步提醒 banner | 没有 | P0 | 与 §4.D-1 同根因 |
| 5.D-2 | header 主图齐备 tag + 拉取最新基础值 + 显式保存 | 没有 | P1 | 与 §4.D-2 同 |
| 5.D-3 | 设定卡 6 节结构（基础/视觉/氛围/变体维度/风格/360 升级） | LocationCardForm 字段需 audit | P1 | 字段映射可能不齐；spec §3.2/§3.3 |
| 5.D-4 | 主图区显示元信息（生成时间 / provider / 分辨率） | 待确认 | P1 | 同角色 §4.D-7 |
| 5.D-5 | 维度网格中文 label 在缩略图下方 | 待确认 | P1 | 同角色 §4.D-8 |
| 5.D-6 | 360 全景区 header 引用 spec §4.5.10 + 操作引导 | 仅功能按钮，无引导文案 | P2 | 文档性 |
| 5.D-7 | panorama 元信息：尺寸 / equirectangular / 操作提示 | 待确认 PanoramaSnapshotEditor 是否显示 | P2 | 视觉细节 |
| 5.D-8 | snapshot 卡片 ribbon `分镜 X.Y` 标记 + yaw/pitch/fov 详细 metadata | 待确认是否完整显示 | P1 | spec §4.5.10 关键 metadata |
| 5.D-9 | success-banner `3D 一致性效果：分镜 1.1/1.2/1.3 背景几何一致` | 没有 | P1 | 教育性文案，让用户理解为什么要"截图给分镜共享" |
| 5.D-10 | primary-banner 优先级提示（panorama_snapshot → angle → 主图） | 没有 | P0 | 这是 spec §4.5.10 核心机制；用户不知道优先级会导致结果不可预期 |
| 5.D-11 | 3D 摆位 Phase 8 占位 panel | 没有 | P2 | 视觉占位，不实现 |

### 5.4 整改 task 草稿

- [ ] **P0-5.A** 长文同步提醒 banner（与 P0-4.A 同实现，复用组件）
- [ ] **P0-5.B** 一致性优先级提示 banner：在 LocationGalleryEditor 加固定 banner 组件，明确说明 keyframe 渲染参考图优先级
- [ ] **P1-5.C** 顶部 header 统一改造（与 P1-4.C 复用同一 layout 组件）
- [ ] **P1-5.D** LocationCardForm 字段 audit 对齐原型 6 节
- [ ] **P1-5.E** 维度网格 label 下方中文文字（同 P1-4.G）
- [ ] **P1-5.F** snapshot 卡片完整 metadata 显示（yaw/pitch/fov + 分镜归属）
- [ ] **P1-5.G** 3D 一致性 success-banner 教育文案（在 PanoramaSnapshotEditor 内）
- [ ] **P2-5.H** 360 panel 引导文案 + 操作提示
- [ ] **P2-5.I** 3D 摆位 Phase 8 占位
- [ ] **G1-5.J** 主题切换实测

---

---

## §6. 03-stage-script.html · ③ 剧本

> 状态：✅ 已完成（FU5-T4）
> 当前实现文件：`stage-script/StageScriptView.vue` + `ScriptCompletenessPanel.vue`

### 6.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 6.A | main-header | 标题 `③ 剧本编辑` + 副标题 `3 个场景 · 12 段对白 · 8 个动作 · 实体引用 100% 解析`<br>右：`✨ AI 重写场景` + `完成本阶段 →` |
| 6.B | 章节梗概 panel | 标题 + `✨ AI 重新生成` 按钮<br>梗概文本含 `@张三 / @李四 / @折扇 / @老板娘 / @书信` 实体引用 tag（linked_lw / standalone 区分） |
| 6.C | 场景列表 panel | 标题 `场景列表`，按场景卡折叠/展开（场景 1 默认展开） |
| 6.C-head | 场景卡 header | primary-light 背景：`场景 N` + `📍 @地点 · 时间 · 天气` + `出场: @人物1 @人物2` + `编辑` 按钮 |
| 6.C-body | 场景卡展开内容 | 4 类小段，每段 50px 左侧 label + 右侧文本：<br>`原文`（来自长文，灰色）<br>`旁白`（primary 色）<br>`对话` × N（`@角色 · emotion · "..."`，success 色 label）<br>`动作`（warning 色 label，含 @ 引用） |
| 6.C-3d | Scene 3 含 3D 标签 | `@客栈` 后追加 `3D` tag |
| 6.D | 添加场景按钮 | 100% 宽度 dashed border `+ 添加场景` |
| 6.E | 完整性检查 success-banner | 底部 success-light 背景 + ✓<br>主文：`完整性检查通过 — 可以进入分镜`<br>副文：`所有 N 角色 · M 地点 · P 物品 · Q 语音 引用都解析到资产；所有引用资产的主图均已就绪`<br>右侧 `→ 进入 ④ 分镜` 按钮 |

### 6.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 实.A | view-header | H3 `③ 剧本` + `已定稿/草稿` el-tag<br>右 view-actions：`AI 生成剧本 / 重新生成 / 修复缺失绑定 / 剧本定稿`<br>**没有**副标题 / 没有 `AI 重写场景`（spec 概念上等同 重新生成） |
| 实.B | 章节梗概 panel | **完全不存在** |
| 实.C | 场景列表 双栏 | 左 scene-list-panel：场景卡（编号 + location + time/weather/locationType tags + sceneDescription）<br>右 scene-detail-panel：el-descriptions（地点 / 时间-天气 / 描述 / 氛围）+ 角色 / 旁白 / 对话 sections |
| 实.C-action | 动作 | 实现把 `action` 字段并入角色 li 的 `char-attr`，**没有**独立的"动作" section |
| 实.C-ref | 实体引用样式 | 角色用 `已绑定 / 缺 binding` 文字 tag<br>**没有** `@张三` 形式的 @ 引用 tag、没有 linked_lw / standalone 区分 |
| 实.D | 添加场景 | **没有** 直接加场景按钮（依赖 AI 生成全场景） |
| 实.E | 完整性提示 | ScriptCompletenessPanel 在右侧详情底部，**位置 + 视觉**与原型 success-banner 不同（应当是底部全宽 banner） |

### 6.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 6.D-1 | 章节梗概独立 panel + AI 重新生成 | 完全没有 | P0 | spec §4.1 章节梗概是剧本入口；用户看不到全集"骨架" |
| 6.D-2 | 实体引用 `@角色 / @地点 / @物品` 强约束 tag（含双来源色） | 用文字 + `已绑定 / 缺 binding` 替代 | P0 | spec §4.1 强约束的视觉表达；缺它用户不知道实体是不是 lw 来源 / 不知道 @ 是 spec 关键概念 |
| 6.D-3 | main-header 副标题（场景数 / 对白数 / 动作数 / 引用解析率） | 没有 | P1 | 用户进 ③ 时看不到剧本规模 |
| 6.D-4 | 场景卡折叠 / 展开（包括 4 类内容） | 双栏 list+detail 模式 | P1 | 视觉范式不同，但实现的双栏模式用户体验也合理；保留实现也行，但要确认有 `原文 / 旁白 / 对话 / 动作` 四段完整 |
| 6.D-5 | 场景卡 header 紧凑展示 `📍 @地点 · 时间 · 天气` + `出场: @人物1 @人物2` + `3D` tag | 实现：location text + time/weather/locationType el-tag 但**无 @** | P1 | @ 引用是核心；3D 标签缺 |
| 6.D-6 | 独立"动作" section（warning 色 label）含 @ 引用 | action 字段并入角色 attr | P1 | 动作是 spec §4.1 一类独立内容（角色驱动事件），不该折叠到角色行 |
| 6.D-7 | 旁白 / 对话 / 动作 用色彩区分（primary / success / warning label） | 用 h5 标题区分 | P2 | 视觉密度差异 |
| 6.D-8 | 对话显示 `@角色 · emotion · "..."` | 实现：`角色名 / emotion / 文本` | P2 | 视觉细节 |
| 6.D-9 | 添加场景按钮（dashed） | 没有 | P1 | 用户不能手动加场景；spec §4.1 应允许手动编辑场景列表 |
| 6.D-10 | 底部 success-banner（完整性 + 进入 ④ 分镜） | ScriptCompletenessPanel 在右侧详情底部 | P1 | 位置错位；用户在场景列表页找不到完成提示 |

### 6.4 整改 task 草稿

- [ ] **P0-6.A** 章节梗概 panel：新增 `episode_scripts.synopsis` 字段（已有 outline_id 但不是同一概念）+ AI 生成 + 渲染含 @ 引用
- [ ] **P0-6.B** 实体引用 tag 渲染器：写一个 `<EntityRefRenderer>` 组件，把文本里的 `@xxx` 替换为 linked_lw / standalone 双色 tag；用于梗概 / 场景描述 / 旁白 / 对话 / 动作
- [ ] **P1-6.C** main-header 副标题（场景数 / 对白数 / 动作数 / 引用解析率）
- [ ] **P1-6.D** 场景详情区增加独立"动作"section（warning 色），从角色 char-attr 提取
- [ ] **P1-6.E** 场景卡 header 用 @ 引用 tag 紧凑显示位置 / 出场（保留双栏布局，只改 header 内容）
- [ ] **P1-6.F** 添加场景按钮（弹小表单或调 API 加空场景）
- [ ] **P1-6.G** 底部 success-banner：完整性通过时显示横跨全宽 banner + 进入 ④ 分镜 按钮
- [ ] **P2-6.H** 旁白 / 对话 / 动作 色彩区分 label
- [ ] **G1-6.I** 主题切换实测

---

---

## §7. 04-stage-storyboard.html · ④ 分镜

> 状态：✅ 已完成（FU5-T5）
> 当前实现文件：`stage-storyboard/StageStoryboardView.vue`（852 行） + `dialogs/StoryboardCharacterEditDialog.vue`

### 7.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 7.A | main-header | 标题 `④ 分镜阶段` + 副标题 `3 个场景共 12 个分镜 · 累计预估 56s`<br>右：`✨ AI 一键拆所有场景` + `完成本阶段 →` |
| 7.B | 双栏布局 | 200px 场景树 / 1fr 主区域 |
| 7.C | 场景树 | `📁 场景 N · 地点 · 时段 · (M 镜)` 父项 + `N.M 景别 · Ks` 子项；active 状态高亮 |
| 7.D | 场景概览 banner | primary-light，1 行：`场景 1 · 茶馆 · 黄昏 · 阴天 ｜地点: @茶馆 ｜出场: @张三 @李四 ｜原文: "夕阳下..."` |
| 7.E | 分镜网格 (4 列) | shot-card：左缩略图（大 emoji + shot-no + 状态徽章 ✓⏳○ + duration） / 右 body（标题`远景 · 平视 · 固定` + meta `2 关键帧 · 张三 + 李四 · 折扇`） |
| 7.F | 分镜编辑面板（选中分镜后展开） | header `分镜 N.M 编辑` + `→ 进入画面+音频`<br>toolbar 4 selectors：景别 / 角度 / 运镜 / 时长<br>关键帧数 1-9 按钮（"5 (建议)" primary 高亮）+ `推镜 + 推荐 3-5 帧 → keyframesToVideo` 提示<br>`画面描述` textarea<br>`镜头内角色站位 / 表情 / 动作` 5 列 grid（角色名 + 4 个 select：位置 / 表情 / 朝向 / 动作） |
| 7.G | 底部 footer | `12 分镜已布局 · 1 已出片 · 累计预计 56s` + 试播按钮（active） |

### 7.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 实.A | view-header | H3 `④ 分镜` + `场景 N · 地点` el-tag<br>右 view-actions：`为本场景生成分镜` + `批量生成全部场景`（≈ AI 一键拆所有场景） |
| 实.B | 三栏布局 | 场景树 + 分镜网格 + 详情面板（独立第三栏，不在网格下方） |
| 实.C | 场景树 | `场景 N` + `地点` + `time · weather` el-tag + 选中时显示`N 个分镜`<br>**没有**子项 `N.M 景别 · Ks` 树状结构 |
| 实.D | 场景概览 banner | **完全没有**（用户不能在分镜网格 header 看到场景上下文） |
| 实.E | 分镜网格 | sb-card：sb-num + 已出片/未出片 tag + 景别/角度/运镜 tag + frame-desc + duration + 关键帧数<br>**没有**缩略图（emoji or AI 生成关键帧首帧） |
| 实.F | 分镜详情面板 | el-descriptions（景别 / 角度 / 运镜 / 时长 / 关键帧数 / 视频状态） + 画面描述 + 分镜内角色 + 编辑分镜配置 / 编辑分镜内角色 button<br>**没有**关键帧数 1-9 visual 按钮组（用 el-descriptions 文字显示）<br>**没有**镜头内角色 5 列 grid（用 dialog 编辑） |
| 实.G | 底部 footer | 全局 BottomTimeline，已实现 |

### 7.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 7.D-1 | main-header 副标题（场景数 / 分镜数 / 累计时长） | 仅 `场景 N · 地点` tag | P1 | 用户进 ④ 时缺全局摘要 |
| 7.D-2 | 场景树包含子项树状结构（N.M 景别 · Ks） | 仅父项；分镜列表在中间网格区 | P2 | 视觉范式差异；实现的 list+grid 也合理 |
| 7.D-3 | 场景概览 banner（`@地点 / 出场 @人物 / 原文摘要`） | 完全没有 | P0 | 用户在分镜网格里看不到该场景的剧本上下文 → 配镜头时只能凭印象 |
| 7.D-4 | 分镜卡缩略图（emoji 或后续 AI 出图首帧） | 没有缩略图 | P1 | 12 个分镜并排时缺缩略图就只能读文字，效率低 |
| 7.D-5 | 关键帧数 1-9 visual 按钮组（"5 (建议)" primary 高亮 + 推荐说明） | 在 el-descriptions 显示数字 | P0 | spec §4.5 关键帧数是核心配置，应当 visual 选择不是数字框 |
| 7.D-6 | 镜头内角色 5 列 grid（角色 / 位置 / 表情 / 朝向 / 动作）紧凑直接编辑 | 用独立 dialog 编辑 | P1 | 用户配镜头时频繁调角色位置；dialog 增加点击成本 |
| 7.D-7 | 分镜编辑面板含"→ 进入画面+音频"快速跳转 | 没有快速跳转 | P1 | 编辑完一个分镜想立即生成关键帧很常见 |
| 7.D-8 | 分镜卡 meta 含资产引用（`张三 + 李四 · 折扇`） | 仅 frame-desc 文字 | P2 | 资产引用不可视化；spec §4.5.3 强调分镜内角色 |
| 7.D-9 | 状态徽章在缩略图上（✓ done / ⏳ generating / ○ todo） | 仅 `已出片 / 未出片` 标签 | P1 | 缺"生成中"中间态 |
| 7.D-10 | 编辑面板 toolbar 4 selector 紧凑显示 | el-descriptions 只读 + dialog 编辑 | P1 | 配镜头是高频操作；只读 + 弹框增加成本 |

### 7.4 整改 task 草稿

- [ ] **P0-7.A** 场景概览 banner：分镜网格上方加 banner，含 `@地点 / 出场 @人物 / 原文摘要`（复用 §6 EntityRefRenderer）
- [ ] **P0-7.B** 关键帧数 1-9 visual 按钮组（推荐值高亮）+ 推荐说明文案
- [ ] **P1-7.C** main-header 副标题（场景数 / 分镜数 / 累计时长聚合）
- [ ] **P1-7.D** 分镜卡缩略图（先用 shot type emoji 占位；P5+ 接 AI 关键帧首帧）
- [ ] **P1-7.E** 分镜内角色 inline 编辑（5 列 grid 替代 dialog）
- [ ] **P1-7.F** 分镜编辑面板加 `→ 进入 ⑤ 画面+音频` 跳转按钮
- [ ] **P1-7.G** 分镜状态三态徽章（done / generating / todo）+ 卡片可视化
- [ ] **P1-7.H** 分镜编辑面板 toolbar 改 inline 4 selector + 直接编辑
- [ ] **P2-7.I** 场景树子项 `N.M` 树状展示
- [ ] **P2-7.J** 分镜卡 meta 行用 EntityRefRenderer 渲染资产 @ 引用
- [ ] **G1-7.K** 主题切换实测

---

---

## §8. 05-stage-production.html · ⑤ 画面+音频（九宫格）

> 状态：✅ 已完成（FU5-T6）
> 当前实现文件：`stage-production/StageProductionTabContent.vue` + `KeyframeGrid.vue` (515 行) + `VideoSegmentPanel.vue` (739 行) + `AudioPanel.vue` (275 行) + `ShotDetailPanel / ShotListPanel`

### 8.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 8.A | main-header | 标题 `⑤ 画面+音频生成` + 副标题 `12 个分镜 · 已出片 5/12 · 当前进入分镜 1.2` + `完成本阶段 →` |
| 8.B | 双栏 220px + 1fr | 左：scene-tree（场景父项 + N.M 镜头子项，每个子项左侧色点表状态：● success/warning/灰 todo）<br>右：5 个 panel 垂直堆叠 |
| 8.C | 镜头语言 panel | header：`分镜 N.M` + `中景 · 仰拍 · 推镜` + `5.0s` tag + `编辑分镜` 按钮<br>toolbar inline：景别 / 角度 / 运镜 / 时长 / 关键帧数 select / `启用 3D 摆位` checkbox（disabled，提示 `(地点非 3D)`） |
| 8.D | **九宫格关键帧 panel（核心）** | header：`关键帧序列` + `时间顺序的 5 张快照（"九宫格"）· 用于 keyframesToVideo 模型` + `重生成全部` + `+ 添加帧`<br>**时间轴 bar**：横向，5 个 tick 在 0/25/50/75/100% 位置<br>**九宫格本体**：5 cell（动态 N=2~9）；每 cell：kf-no + 缩略图 emoji + kf-role（`START · 0%` / `25%` / `50% (生成中)` / `75% (待生成)` / `END · 100% (待生成)`），含 4 状态（role-start / 默认 / gen / empty / role-end empty）<br>底部 primary-banner：`💡 参考链顺序：先生成 1 (start) → 5 (end，参考 1) → 2/3/4 中间帧（参考首尾），保证运动连贯` |
| 8.E | 资产引用 panel | 标题 `本分镜引用的资产`<br>tag list：`📍 茶馆 · interior_a · 黄昏阴天` / `👤 张三 · face/angry · default_outfit` / `⚔️ 折扇 · held`<br>提示词组装公式（code block）：`style_anchor + 镜头语言 + 场景描述 + 地点变体图 + 角色图 + 物品图 + 上一帧` |
| 8.F | 视频生成 panel | header + `把上面 5 张关键帧喂给视频模型，输出 5 秒连续片段` 提示<br>toolbar：Provider select / 模式 select（keyframesToVideo 推荐 / imageToVideo） / `🎥 生成视频片段` / 状态 tag（`⏳ 关键帧未齐` 等） |
| 8.G | 音频 panel | 4 行 grid（label / 内容 / ▶ ↺ 操作）：<br>**旁白**（primary tag）：文字 + 音色·语速 + 控制按钮<br>**对话** × N（success tag）：`@角色 · emotion · "..."` + 音色 + 控制<br>**BGM**（warning tag）：BGM 描述 + 音量 + ▶ |

### 8.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 实.A | view-header | （StageProductionTabContent 没有 main-title / 副标题） |
| 实.B | 布局 | 顶部 storyboard horizontal pill 列表（不是 scene-tree 双栏）：每个 pill `镜 N` + `frame-desc 缩略`<br>下方：KeyframeGrid + VideoSegmentPanel<br>**没有 sceneTree** 父子结构；**也没有 ShotListPanel 装配**（独立组件存在但未被 TabContent 引用） |
| 实.C | 镜头语言 panel | **没有**独立 panel；分镜配置在 ④ 分镜 stage 内 |
| 实.D | 九宫格 KeyframeGrid | 实现 515 行，含关键帧网格 + 重生成 dialog；**待 audit**：是否有时间轴 bar / 是否显示 kf-role 比例（START / 25% / 50% / END）/ 是否有"参考链顺序"提示 |
| 实.E | 资产引用 panel | **没有**独立 panel，关键帧背后的"资产引用 + 提示词公式"对用户不可见 |
| 实.F | 视频生成 VideoSegmentPanel | 实现 739 行，含 provider / 模式选择 / 生成 / 状态等 |
| 实.G | 音频 AudioPanel | 实现 275 行，**待 audit**：旁白 / 对话 / BGM 三类是否齐全；视觉是否对齐原型的 80px label + 1fr 内容 + auto 操作三栏 |

### 8.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 8.D-1 | scene-tree 双栏布局（左 220px 含 12 个分镜的扁平树） | 顶部 horizontal pill 列表 | P0 | 12+ 分镜横向 pill 在窄屏会撑爆；用户跨场景跳镜头不便；原型左树是核心 navigation |
| 8.D-2 | 镜头语言独立 panel + 4 selector + 启用 3D 摆位（占位） | 完全没有；要回 ④ 分镜改 | P1 | 用户在 ⑤ 调试关键帧时需要快速调景别 / 时长 |
| 8.D-3 | 九宫格时间轴 bar（5 tick 表 START/25%/50%/75%/END） | 待确认 KeyframeGrid 是否实现 | P1 | spec 强调"时间顺序"语义，时间轴是直观表达 |
| 8.D-4 | kf-cell 含 frameRole 显示（`START · 0%` / `END · 100%`） | 待确认 | P1 | spec §4.5 关键帧角色（首/中/尾）影响参考链 |
| 8.D-5 | 4 状态 cell（done / gen / todo / empty） | 待确认 | P1 | 用户应当能在网格上看到每帧状态 |
| 8.D-6 | "参考链顺序" primary-banner 提示（先 1 → 5 → 2/3/4） | 没有 | P0 | 关键 spec §4.5 机制；不告知用户会困惑生成顺序 |
| 8.D-7 | 资产引用 panel（tag list + 提示词公式 code block） | 没有 | P0 | 用户调 prompt 时看不到关键帧背后的引用结构；spec §4.5.7 用户提示词全链路应可视化 |
| 8.D-8 | 视频生成"模式"select（keyframesToVideo / imageToVideo） | 待确认 VideoSegmentPanel | P1 | 业务关键差异，应可选 |
| 8.D-9 | 视频状态 tag（⏳ 关键帧未齐 / ✓ 已生成 / ⚠ 失败 等多状态） | 待确认 | P1 | 单状态不足以指导用户行动 |
| 8.D-10 | 音频 panel 4 行 grid（80px tag + 1fr 内容 + 控制按钮） | 待确认 AudioPanel 视觉 + BGM | P1 | spec §4.7 三类音频应该都有 |
| 8.D-11 | 旁白 / 对话 / BGM 用色彩区分 tag | 待确认 | P2 | 视觉 |
| 8.D-12 | 启用 3D 摆位 checkbox（占位 + 不可用提示） | 完全无 | P2 | 占位 |

### 8.4 整改 task 草稿

- [ ] **P0-8.A** scene-tree 双栏布局：把顶部 pill list 改为左侧 220px scene-tree（场景父项 + 镜头子项，子项含状态色点）
- [ ] **P0-8.B** 资产引用 panel：在 KeyframeGrid 之后加 panel，列出当前分镜的所有 asset 引用 + 提示词组装公式 code block（spec §4.5.7）
- [ ] **P0-8.C** 参考链顺序提示 banner（在 KeyframeGrid 底部）
- [ ] **P1-8.D** 镜头语言 panel：在 ⑤ stage 顶部加 panel，含 4 selector inline 编辑（mirror ④ 分镜的配置）
- [ ] **P1-8.E** KeyframeGrid 时间轴 bar + kf-role 比例显示 + 4 状态 cell
- [ ] **P1-8.F** 视频生成模式选择 + 多状态 tag
- [ ] **P1-8.G** AudioPanel audit：旁白 / 对话 / BGM 三类齐全 + 视觉对齐
- [ ] **P2-8.H** 旁白 / 对话 / BGM 色彩区分
- [ ] **P2-8.I** 3D 摆位 checkbox 占位
- [ ] **G1-8.J** 主题切换实测

---

---

## §9. 06-stage-compose.html · ⑥ 合成

> 状态：✅ 已完成（FU5-T7）
> 当前实现文件：`stage-compose/StageComposeView.vue` + `TimelineEditor.vue` + `ExportDialog.vue`

### 9.1 原型 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 9.A | main-header | 标题 `⑥ 合成成片` + 副标题 `12 个分镜全部出片 · 累计 56 秒 · 即将合成 1080p MP4` + 主按钮 `📥 导出 MP4` |
| 9.B | 上半双栏 1fr / 320px | 左：preview-area 16:9（深色背景 + ▶ 大按钮 + timecode 显示 `00:08.25 / 00:56.00` + 当前帧元信息覆盖层）<br>右：导出参数 panel（分辨率 / 帧率 / 编码 / 字幕烧入checkbox + .srt 输出checkbox + 预估文件大小 + 渲染时长） |
| 9.C | 时间线 panel header | 标题 + 快捷键提示（`Space 播放 / ←/→ 跳帧 / M 标记`） |
| 9.D | 时间标尺 | 横向 ruler：0s / 10s / 20s / 30s / 40s / 50s / 60s（按总时长动态） |
| 9.E | 多轨道 row（80px label + 1fr 内容） | **视频 V1**（彩色 clip 按场景分色 + 转场标记 ⇄）<br>**字幕**（暗红 clip + 字幕文本 ellipsis）<br>**旁白 A1 🔊**（灰色 clip）<br>**对话 A2 🔊**（灰色 clip）<br>**BGM A3 🔊**（淡灰 clip + 音量 / loop / 描述）<br>所有 row 共享 playhead（红色竖线，30% 位置） |
| 9.F | 时间线底部统计 | `🎬 12 视频片段 · ⇄ 9 转场 · 📄 12 字幕 · 🔊 3 音轨 · 总时长 56s` |
| 9.G | 完成 banner | success-light + ✓<br>主：`所有素材就绪 — 可以导出`<br>副：`12/12 分镜出片 · 字幕 / 旁白 / 对话 / BGM 全部混音 · 转场配置完成`<br>右：`▶ 完整预览` + `📥 导出 MP4` |

### 9.2 当前实现 cell 表

| Cell | 区域 | 元素 / 文字 |
|---|---|---|
| 实.A | StageComposeView | hero 区：大图标 + 标题 `整剧合成与导出` + desc + 主按钮 `导出 MP4`（弹 ExportDialog） + lastExport 区显示上次导出结果<br>**没有** main-header 副标题（聚合摘要） |
| 实.B | 预览窗口 | **完全没有** preview-area / play 按钮 / timecode |
| 实.C | 导出参数 | 在 ExportDialog 内（弹出层），不是常驻面板 |
| 实.D | TimelineEditor | 4 轨：视频 / 旁白 / 对话 / 字幕；read-only V1<br>**没有** BGM 轨<br>**没有** playhead<br>**没有** 时间标尺（ruler）<br>**没有** 转场标记 ⇄<br>**没有** 快捷键提示<br>**没有** 底部统计 |
| 实.E | 完成 banner | **完全没有** |

### 9.3 差异表

| # | 原型有 | 实现 | 优先级 | 备注 |
|---|---|---|---|---|
| 9.D-1 | 预览窗口 + ▶ 播放按钮 + timecode | 完全没有 | P0 | 用户合成前看不到效果；只能盲导出 |
| 9.D-2 | 导出参数常驻 panel（侧边 320px） | 仅在 ExportDialog 弹出 | P1 | 用户调参数频繁，不该每次都弹框 |
| 9.D-3 | TimelineEditor 时间标尺 ruler（0~60s） | 没有 | P1 | 用户看不到具体时间位置 |
| 9.D-4 | playhead（红色竖线）所有轨同步 | 没有 | P1 | 配合预览的关键交互 |
| 9.D-5 | BGM 轨道（A3） | 没有 | P0 | 多轨混音必须；spec §5.3 三类音轨 |
| 9.D-6 | 转场标记 ⇄ 在视频 clip 之间 | 没有 | P1 | 用户看不到转场位置 / 类型 |
| 9.D-7 | 视频 clip 按场景分色（video1 / video2 / video3 各色） | 待确认 | P2 | 视觉分组 |
| 9.D-8 | 时间线底部统计行（12 视频 / 9 转场 / 12 字幕 / 3 音轨 / 56s） | 没有 | P1 | 用户进合成 stage 时缺总览 |
| 9.D-9 | 快捷键提示（Space / ←→ / M） | 没有 | P2 | 文档性 |
| 9.D-10 | 完成 success-banner（所有素材就绪 + 完整预览 + 导出） | 没有 | P1 | 与其他 stage 一致的"完成确认"语义 |
| 9.D-11 | 字幕 clip 显示文字 ellipsis（"夕阳下他..."） | 待确认 | P2 | 视觉细节 |

### 9.4 整改 task 草稿

- [ ] **P0-9.A** 预览窗口：在 StageComposeView 上半部加 16:9 video preview（先用占位，等待真实导出后接 video 元素），含 timecode + ▶ 播放
- [ ] **P0-9.B** TimelineEditor 增 BGM 轨道（接 ⑤ stage 的 bgm.service stub）
- [ ] **P1-9.C** 导出参数常驻侧边 panel（保留 ExportDialog 兜底但默认 inline）
- [ ] **P1-9.D** TimelineEditor 加时间标尺 + playhead + 多轨同步
- [ ] **P1-9.E** TimelineEditor 加转场标记 ⇄
- [ ] **P1-9.F** 时间线底部统计行（视频 / 转场 / 字幕 / 音轨 / 总时长聚合）
- [ ] **P1-9.G** 完成 success-banner（所有素材就绪 → 完整预览 + 导出）
- [ ] **P2-9.H** 视频 clip 按场景分色
- [ ] **P2-9.I** 快捷键支持（Space / ←→ / M）+ 提示
- [ ] **P2-9.J** 字幕 clip 文字 ellipsis
- [ ] **G1-9.K** 主题切换实测

---

---

## §10. 差异汇总 + 整改 backlog

> 状态：✅ 已完成（FU5-T8）

### 10.1 P0 · 阻断流程（必须修）

| # | 节 | 问题 | 影响 |
|---|---|---|---|
| P0-1 | §1 | 项目卡片缺进度可视化（进度条 + 进度文字） | 用户在多项目间切换时看不到状态 |
| P0-2 | §1 | VideoProject 缺聚合字段（episodeCount / progressPct / currentStageLabel / sourceType） | 数据层不支持原型展示 |
| P0-3 | §2 | ① 内容：用户不能取舍识别出的 entity（缺 checkbox） | spec §0.4 "确认要素" 等于"可取舍" |
| P0-4 | §2 | ① 内容：缺手动加 entity 入口 | AI 漏识别时无法补 |
| P0-5 | §2 | ① 内容：缺 linked_lw / standalone 双来源标签 | spec §1.2 心智模型断开 |
| P0-6 | §3 | ② 资产：main-header 缺资产摘要副标题 | 第一眼看不到全局 |
| P0-7 | §3 | ② 资产：缺"一键生成所有缺失主图" | 缺图>3 时操作灾难 |
| P0-8 | §3 | ② 资产：进度统计写死为 0（line 175） | spec §3.9 真实完整度未实现 |
| P0-9 | §4 | 角色编辑：长文同步提醒 banner 缺 | spec §3.7 lw 同步用户感知不到 |
| P0-10 | §4 | 角色编辑：身份块（别名 / 定位 / 性别 / 年龄）字段缺 | spec §3.1 关键属性 |
| P0-11 | §5 | 地点编辑：长文同步提醒 banner 缺（同 P0-9） | 同 |
| P0-12 | §5 | 地点编辑：一致性优先级 banner 缺（panorama_snapshot → angle → 主图） | spec §4.5.10 核心机制；用户行为不可预期 |
| P0-13 | §6 | ③ 剧本：章节梗概独立 panel 完全缺 | spec §4.1 剧本入口 |
| P0-14 | §6 | ③ 剧本：实体引用 `@角色 / @地点 / @物品` 强约束 tag 缺 | spec §4.1 强约束视觉表达 |
| P0-15 | §7 | ④ 分镜：场景概览 banner（@地点 / 出场 @人物 / 原文摘要）缺 | 配镜头时缺剧本上下文 |
| P0-16 | §7 | ④ 分镜：关键帧数 1-9 visual 按钮组缺 | spec §4.5 核心配置走文字而非视觉 |
| P0-17 | §8 | ⑤ 渲染：scene-tree 双栏布局缺（用 horizontal pill 替代） | 12+ 分镜横排撑爆，跨场景跳镜不便 |
| P0-18 | §8 | ⑤ 渲染：资产引用 panel + 提示词组装公式缺 | spec §4.5.7 用户提示词全链路应可视化 |
| P0-19 | §8 | ⑤ 渲染：参考链顺序 banner（先 1 → 5 → 中间帧）缺 | spec §4.5 关键机制；用户困惑生成顺序 |
| P0-20 | §9 | ⑥ 合成：预览窗口 + ▶ 播放 + timecode 缺 | 用户合成前看不到效果，盲导出 |
| P0-21 | §9 | ⑥ 合成：BGM 轨道缺 | spec §5.3 三类音轨；多轨混音必须 |

**共 21 项 P0**。

### 10.2 P1 · 影响理解（应该修）

约 60 项跨 9 节。涉及：
- 各 stage main-header 副标题（聚合摘要） — §1/§3/§6/§7/§8/§9 共 6 处
- linked_lw / standalone / 3D / 系统 / 复刻 视觉占位 5 状态 — §3/§4/§5/§7
- 长文同步提醒 banner（除 P0 列出的角色/地点）— 也涉及实体值传递
- 资产卡片 meta 按 4 类资产分别定制（角色/地点/物品/语音 维度不同）— §3
- 卡片 actions 双按钮（设定 / 图谱）— §3/§4/§5
- 分镜状态三态徽章 + inline 编辑 — §7
- ⑤ stage 镜头语言 panel + 时间轴 bar + kf-role 比例 — §8
- ⑥ stage 时间标尺 + playhead + 转场标记 + 底部统计 + 完成 banner — §9

详见各节 ".3 差异表" 中标 P1 的条目。

### 10.3 P2 · 视觉细节（可延后）

约 40 项。涉及：
- 视觉密度 / 颜色 / 间距差异
- 教育性文案 / 提示文字
- 3D 占位（Phase 8 不实现，仅视觉位）
- 快捷键支持 / 文字 ellipsis 等细节

### 10.4 整改 phase 规划（待 user 拍板节奏）

按"全局组件 → 数据层 → 各 stage 应用"顺序排，避免同样工作做 6 遍：

```
Phase A · 全局组件 + 数据层（基础设施）
  ├─ VideoProject 聚合字段 + listProjects 接口
  ├─ EntityRefRenderer 通用组件（@xxx → tag）
  ├─ StageMainHeader 通用组件（title + subtitle + actions）
  ├─ LwSyncReminderBanner 通用组件（长文同步）
  ├─ AssetSourceTag 通用组件（5 状态：linked_lw/standalone/3D/系统/复刻）
  └─ 双主题 audit + 颜色 token 整理（G1）

Phase B · ① 内容 + 项目列表
  ├─ EpisodeProjectList 卡片改造（封面 + 进度 + 集数·类型·双来源）
  └─ StageContentView 取舍 checkbox + 手动加 + 双来源 + 原文高亮 + 完成 banner

Phase C · ② 资产 + 编辑器（最大块）
  ├─ AssetStageView main-header + 一键生成 + 真实进度 + 批量派生
  ├─ CharacterAssetEditor 长文同步 + 身份块 + 风格锚点 + 显式保存
  ├─ LocationAssetEditor 长文同步 + 字段补全 + 一致性优先级 banner
  └─ {Character,Location,Item,Voice}AssetCard meta 按 4 类定制

Phase D · ③ 剧本
  ├─ 章节梗概 panel
  ├─ @ 实体引用渲染 (用 EntityRefRenderer)
  ├─ 添加场景
  └─ 完成 banner

Phase E · ④ 分镜
  ├─ 场景概览 banner
  ├─ 关键帧数 1-9 visual 按钮组
  ├─ 状态徽章三态
  └─ inline 编辑面板

Phase F · ⑤ 渲染（核心改造，工作量最大）
  ├─ scene-tree 双栏布局
  ├─ 镜头语言 panel
  ├─ 资产引用 panel + 提示词公式
  ├─ KeyframeGrid 时间轴 + kf-role + 4 状态
  ├─ 参考链顺序 banner
  └─ 视频生成模式 + 多状态

Phase G · ⑥ 合成
  ├─ 预览窗口
  ├─ TimelineEditor 加 BGM 轨道 + 时间标尺 + playhead + 转场标记
  ├─ 导出参数常驻 panel
  └─ 完成 banner

Phase H · 全局收尾
  ├─ 主题切换全量手测（每个 stage）
  ├─ 残余 P2 细节
  └─ 写 e2e 覆盖（21-stage-prototype-conformance.spec.ts）
```

**工作量估计**：
- Phase A：3-5 天（全局组件 + 数据层）
- Phase B/C/D/E/F/G：每个 phase 2-4 天，**核心是 Phase C（资产）和 Phase F（渲染）**，工作量最大
- Phase H：1-2 天

总计预估 **20-30 工作日**（按之前 P5/P6 的实际节奏）。

### 10.5 user 决策建议

请在以下节奏中选择，决定后我立即开 phase A 第一个 task：

| 节奏 | 描述 | 风险 |
|---|---|---|
| **节奏 1 · 严格阶段** | 严格按 Phase A → B → ... → H 推；每 phase 内多 task 并发 | 工作量分布最均衡，但 phase A 期间用户看不到 stage 视觉变化 |
| **节奏 2 · 用户路径优先** | 先做 ① / ② / ③ 用户最常进的 3 个 stage（含必要全局组件），再做 ④/⑤/⑥ | 用户能更快看到改进 |
| **节奏 3 · P0 优先** | 跨 phase 先全部修 P0（21 项），再回头做 P1 | 全栈打补丁感；phase A 全局组件可能要做两遍 |
| **节奏 4 · stage 试点** | 先选 1 个 stage（建议 ② 资产，差异最多）做完整改造作为 reference，user 审过后批量复制范式到其他 stage | 风险最小，最稳；周期可能稍长 |

**我的推荐**：**节奏 4**。理由：
- 先在一个 stage 上把 phase A 全局组件 + phase C（资产）的细节都跑一遍，**形成可复制的范式**；
- user 审完 reference 后，剩 7 个 stage 复用同样套路，速度比"节奏 1 严格阶段"快；
- 比"节奏 3 P0 优先"少返工。

### 10.6 备注

- 整改不是一次性工程，每个 PR 必须勾完 R1-R8 红线 + G1 主题切换。
- 每个 stage 改造完，commit 必须附原型对照截图 / DOM snapshot diff。
- 不再把"骨架打勾"算作 done — 必须 DOM 验证 + e2e 覆盖。

---

## §11. 原型流程合理性 review（user 要求 · 不只看 UI 一致性）

> 状态：✅ 已完成（user 5/6 当面要求）
>
> 单纯按原型实施有可能继承原型本身的逻辑漏洞。本节挑战原型的内在合理性：
> ① 是否与 spec §0.4 流程匹配；② 各阶段输入输出是否自洽；③ 跨阶段衔接是否有漏洞。

### 11.1 大流程一致性核对

| spec §0.4 阶段 | EpisodeStatus | 原型页 | 输入 | 产出 | 一致性 |
|---|---|---|---|---|---|
| ① 内容识别 | pending | 01 | 长文章节 / 上传文本 | 已确认要素清单（4 类 + binding） | ✓ |
| ② 资产准备 | asset_prep | 02 | 已确认要素清单 | 4 类资产卡（含主图 + 图谱） | ✓ |
| ③ 剧本编辑 | scripting | 03 | 资产 binding | 剧本（场景列表，含 @ 引用） | ✓ |
| ④ 分镜配置 | storyboarding | 04 | 剧本场景 | 分镜列表（每场景 N 个） | ✓ |
| ⑤ 画面+音频 | producing | 05 | 分镜配置 | 关键帧序列 + 视频片段 + 音频 | ✓ |
| ⑥ 合成 | composing → completed | 06 | 所有分镜片段 | 单段 MP4 | ✓ |

大流程方向与 spec 一致。下面挑战细节。

### 11.2 发现的 11 个潜在逻辑漏洞 / 不一致

| # | 阶段 | 问题 | 严重性 | 建议 |
|---|---|---|---|---|
| **L1** | ② → ③ 依赖强度 | 原型让用户在 ② 把 4 类资产**主图全齐备**才能进 ③；但 ③ 的完整性校验（spec §4.1）只要求"剧本 @ 的 entity 都有 binding"——**主图不齐**也能写剧本 | P0 | 把 ② → ③ 软化：binding 创建即可进 ③，主图齐备只在 ⑤ 渲染前硬卡 |
| **L2** | ② panorama_snapshot 的"分镜 X.Y" 标记 | 02-stage-location-edit 显示 `snap_1.1 · 分镜 1.1`，但分镜在 **④ 阶段**才生成。② 阶段还不知道有哪些分镜 | P0 | 改成"自由命名 snapshot"或回路：② 截图（无归属）→ ④ 分镜配置时用 picker 绑定 snapshot；删除原型那种"② 阶段直接绑分镜"的视觉 |
| **L3** | ④ 分镜内角色 vs ② 资产图谱 关系不清 | ④ 让用户配 `表情=angry`，但 ② 的角色图谱里 angry 可能没生成。**用 ② 已有图 vs ⑤ 实时新生成？** spec §4.5.3 没明确 | P1 | 在 ④ 分镜内角色 selector 上加状态：`angry ✓（已就绪）/ angry ⏳（⑤ 生成）/ angry ⚠（无该变体）`；用户能预知有没有 |
| **L4** | ⑤ 资产引用提示词 read-only | ⑤ 的 `style_anchor + 镜头语言 + 场景描述 + 地点变体图 + 角色图 + 物品图 + 上一帧` 公式只是展示，但 spec §4.5.7 是"用户提示词全链路"——**用户的可编辑提示词在哪？** | P0 | ⑤ 关键帧 panel 加"分镜级追加 prompt"输入框；写入 `keyframe.userPromptOverride`，组装时拼到末尾 |
| **L5** | ⑥ BGM 粒度 | ⑤ 音频 panel 显示 BGM 是 per-shot（"古风弦乐 缓 · loop"），⑥ 时间线 BGM 轨却跨多分镜（"古风弦乐 缓 · 30%"）——粒度不一致 | P1 | 决策：BGM 是 per-scene（不是 per-shot），⑤ 音频不显示 BGM，只在 ⑥ 配；或反过来。spec 应当先定，UI 跟随 |
| **L6** | ① 文本高亮 vs ③ @ 引用 视觉不一致 | ① 用 `<strong>` 黄色高亮已识别实体；③ 用 `@张三` tag。**同一概念用两套视觉**，用户切换 stage 时认知断 | P2 | 统一：① 也改用 `@xxx` tag 渲染（复用 EntityRefRenderer），③ ④ ⑤ 同款 |
| **L7** | sidebar"语音"和角色不分组 | 4 类侧栏并列；但用户语义上"张三的声音"是绑定关系，把语音单列会让用户在分镜阶段反复对照"哪个角色用哪个音色" | P2 | sidebar 角色 row 直接显示绑定的音色 small tag（spec §4.5 角色含 voiceId）；语音独立类只为"未绑定的备用音色" |
| **L8** | 项目级配置（aspectRatio / fps / resolution）只在创建时填 | 实现把 4 个视频参数放在创建项目对话框里；但 spec 显示这些应当能后改（不同剧集可能不同分辨率）。原型 00 项目卡也没显示这些 | P1 | 项目设置入口（已有"项目设置"按钮）必须能改；项目卡可隐藏这些参数 |
| **L9** | ③ 剧本与 ② 资产的"反向同步" | 用户在 ③ 写剧本时引用了 ② 没有的实体（如手动加的"折扇"忘了在 ② 创建 binding）→ 完整性校验失败 → **让用户回 ② 补 binding**。这个回路在原型 ③ 完整性 banner 描述了，但**没有"一键创建缺失 binding"按钮** | P1 | ③ 完整性 banner 失败时显示具体缺哪些 binding + "✨ 一键创建到 ② 资产" 按钮（参考 FU1 ScriptBindingFixerService 已实现） |
| **L10** | ④ → ⑤ 状态衔接 | ④ 完成本阶段意味"分镜定稿"，但 ⑤ 阶段用户经常需要回 ④ 改分镜（景别 / 时长 / 关键帧数）。**status 已经 producing 了，应当能自由回退到 storyboarding 吗？** | P1 | `EpisodeStatus` 转换允许 producing → storyboarding 回退（不丢已生成的关键帧；只清"该分镜未来未生成的关键帧"）。stage-gate.service 应允许 |
| **L11** | "试播"按钮在 ④ 之前都 disabled | 原型底部时间线"试播"在 ④ 之前都 disabled，但 ⑤ 阶段用户每生成几个分镜片段后想"试播看看连贯性"是常见需求 | P2 | ⑤ 阶段试播：拼接已出片的连续分镜（含填空白占位），允许用户预览 |

### 11.3 全局结构的两处建议（更深层的修订）

**B1 · sidebar 在 ① ②不显示 + ③④⑤⑥ 改右侧**（user 5/6 决定，已在 §0 全局约束修订）。
具体执行：
- 工作台 layout 增 `<asset-sidebar :side="right">` 参数
- ① ② stage 容器加 `<workbench :hide-asset-sidebar>`
- ③④⑤⑥ stage 默认右侧；用户可折叠
- 主区域宽度从原 1fr 变 1fr（侧栏在右）；CSS 调整简单

**B2 · "在 stage 内编辑资产"应在右侧侧栏点击直接弹浮层（不跳出 stage）**。
- 比如用户在 ⑤ 想看角色"张三"细节，点右侧 sidebar 张三 → 弹一个右抽屉显示设定卡（CardForm 复用）+ 图谱缩略，关闭抽屉回 ⑤
- 不再像原型那样"全屏跳到 02-stage-asset-edit"——在 ⑤ 跳出去，回来 stage 状态丢失
- 这条改动比 B1 大，但能让"侧栏可点 + 不脱离当前 stage"语义自洽

### 11.4 综合判断

**原型整体方向 OK**，6 阶段映射 spec §0.4 是对的。
但有 **11 个细节漏洞**，按原样实施会让用户在使用中遇到 4 个 P0 严重问题（L1/L2/L4 + B1/B2）：

1. **L1**：② → ③ 强卡导致用户在 ② 不必要地等待主图齐备
2. **L2**：② 阶段截图绑分镜（分镜还没存在）—— **数据模型层面错了**
3. **L4**：⑤ 用户提示词全链路缺可编辑入口—— spec §4.5.7 落空
4. **B1/B2**：sidebar 左侧 + 在 stage 跳出去——UX 不可用

**结论**：把 §10 的整改 backlog 加上 §11 的 11 条问题，**总 P0 从 21 → 25**（L1/L2/L4 升 P0 + B1 已在 §0 修订）。

### 11.5 给 user 的决策点

请在以下 4 点上拍板，决定后立即开 phase A：

1. **L1（② → ③ 软化）**：是否同意"binding 即可进 ③，主图只在 ⑤ 前硬卡"？
2. **L2（② panorama_snapshot 不绑分镜）**：是否同意"② 截图无归属 → ④ 分镜配置时绑"？
3. **L4（⑤ userPrompt 字段）**：是否同意加 `keyframe.userPromptOverride`？
4. **B2（资产编辑弹抽屉）**：是否同意改成"右侧侧栏点击 → 弹右抽屉"模式（不跳全屏）？

我推荐 4 点全 yes，理由都是"按原型实施会形成新债，一次性修对成本最低"。

---

## 进展跟踪

| 日期 | 节 | 完成情况 | 提交 hash |
|---|---|---|---|
| 2026-05-06 | §0 骨架 + §10 汇总区 | ✓ 建立 | d6163be |
| 2026-05-06 | §1-§2 样板 | ✓ 完成（11 + 13 差异） | d6163be |
| 2026-05-06 | §3-§9 全部 | ✓ 完成（共约 80 差异，含 21 P0） | 7d63369 |
| 2026-05-06 | §10 汇总 + Phase 规划 | ✓ 完成 | 7d63369 |
| 2026-05-06 | §0 修订（侧栏新规则）+ §11 流程 review（11 个漏洞 + 4 决策） | ✓ 完成 | (本次) |

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
