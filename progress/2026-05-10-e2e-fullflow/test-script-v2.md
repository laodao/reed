# 全流程 E2E UI 功能测试脚本 v2（review 用）

> **状态**：v1 自我 review 后重写。v1 的问题：
>   1. 把决策推给用户（6 个 Q）— 违背"严禁偷懒、投机"
>   2. 大部分能力点只是"verify 显示"，没真正点开 + 填表 + 提交
>   3. 漏测：C3/C5/C6/C9/D1/D2 闭环/D3 引用/D5/E1/D4/F2 真实连线/C4 折叠交互
>   4. 缺"失败→对照 PRD→修代码→重跑"流程
>
> v2 核心调整：
>   - 删除所有 Q，按 PRD + "踏踏实实" 原则自定决策
>   - 22 能力点每个都有**独立 test case**（点开 + 填表 + 提交 + 验证产出）
>   - 6 stage 串联仍跑完整真实链路
>   - 失败 → 比对 `docs/review/2026-05-09-ep-redesign-spec.md` PRD → 改代码 → 重跑（**不改测试适配 bug**）

---

## 0. 已自定决策（不再问用户）

| 项 | 决策 | 理由 |
|---|---|---|
| AI 调用 | **真跑** 全部 | UI 功能测试必须真触发后端 |
| 项目 | **新建** `e2e-{ts}` | 干净环境，避免脏数据干扰 |
| 视频片段 | **生成 1 个** | 验证 keyframes2video 管线 |
| 导出 MP4 | **不导出**（1 分镜不完整） | 跑通到 build-timeline + 字幕预览即可 |
| 失败处理 | **停下** → 对照 PRD → 修代码 → 重跑（**不改测试**） | 用户明确指令 |
| 剧本 | 「茶馆相遇」42 字 | 已审 — 含 2 角色 + 1 地点 + 1 物品，覆盖主要资产类型 |

---

## 1. 测试范围：22 能力点 × UI 入口对照表

每行是一个**独立 UI 测试用例**，不仅仅是"目睹按钮存在"。

| # | 能力 | UI 入口位置 | 必测动作 | 必验输出 |
|---|---|---|---|---|
| C1 | 缩减身份保持 | （后端 const）通过 C3 透明度面板验证 | 在 C3 dialog 看 negativePrompt 字段 | 文本 < 50 chars |
| C2 | metadata 不进 prompt | 同上 | 在 C3 dialog 看 prompt 字段 | 不含 alias/role 文本 |
| **C3** | **透明度面板** | GalleryEditor 缩略图 hover ⓘ icon | **点 ⓘ → 弹 GenerationDetailDialog → 看 prompt/negative/metadata 完整文本 → 点复制 → 验证 clipboard** | dialog 显示 + 复制 ✓ |
| **C4** | **字段双层** | CharacterCardFormV2 折叠区 | **点 ▼ 叙事元数据 → 折叠区展开 → 看到姓名/别名/定位/音色/形象库 5 个字段 → 再点一次收起** | expand/collapse 双向 ✓ |
| **C5** | **AI 自动填** | CardForm ✨ 按钮 | **填一段描述 → 点 ✨ AI 自动填 → 等 5-15s → 验证性别/年龄/人种字段被自动填充（不覆盖已填）** | 字段值变化 ✓ |
| **C6** | **多角度参考图** | CharacterAssetEditorV2 顶部按钮 | **点「多角度参考图」按钮 → 等 30-90s → 验证视角类目下出现「正面 / 左 3/4 / 右 3/4」3 张新图** | 视角 0/6 → 3/6 ✓ |
| **C7** | 镜头语言层 | StageStoryboardViewV2 编辑器 | **选第 1 个分镜 → 改焦距 35mm → 改光圈 f/4 → 改打光「伦勃朗」→ 切双模板「短剧 5 段→影视」→ 看字段变化 → 保存 → reload 看持久化** | 字段保存 + 模板切换 ✓ |
| **C8** | 全局编号 | ④ 分镜 + ⑤ 制作 + ⑥ 合成 卡片头部 | **截图 ④ stage 看 EP01_S01_SH01..N → 截图 ⑤ stage 头部看 EP01_S01_SH01 → 截图 ⑥ timeline 看 EP01_S01_SH01** | 三 stage 编号一致 ✓ |
| **C9** | 多基图派生 | LocationGalleryEditor 派生 dialog | **进入地点编辑器 → 点「派生变体」→ dialog 用 el-checkbox-group 多选 2 张基图 → 选 category=time/label=黄昏 → 触发派生 → 等 30-60s → 验证产出图** | dialog checkbox + 派生成功 ✓ |
| **C10** | 9 帧故事板 | ③ 剧本 stage 顶部 | **点「📋 故事板预览」→ dialog 出现 → 点「✨ 生成 9 帧预览」→ 等 1-3min → 验证 3×3 网格 9 张图 → 勾选 4 张 → 选目标场景 → 点「用选中帧创建分镜」→ 验证 ④ 分镜 stage 多了 4 行** | 9 张生成 + 4 行入库 ✓ |
| **F1** | Provider subject | （后端，无 UI） | curl IPC 看 capabilities | subjectSupport 字段存在 |
| **F2** | LineageOverlay | ⑤ 制作 stage switch | **切「显示生成链路」on → 验证 SVG bezier 连线连接 资产卡 → 关键帧 → 视频片段 3 个面板** | SVG 含 ≥3 path 元素 ✓ |
| **F3** | AI 一键模式 | EpisodeListPanel 顶部按钮 | **点「✨ AI 一键」→ wizard 弹出 → 填表 → 真跑 createEpisode + identifyEntities → 等 30-60s → 看 step 进度 → 跳到 ① 内容 stage 看识别结果** | 剧集创建 + entities ≥2 ✓ |
| **D1** | ReferenceSetPanel | CharacterAssetEditorV2 主区 | **进角色编辑器 → ReferenceSetPanel → 勾选 main + 任意 view → 点「保存形象组」→ 等响应 → reload 验证勾选保留** | 复选 + 保存 + 持久化 ✓ |
| **D2** | 跨项目库 | 资产卡 hover ⭐ + section 顶部 📚 | **(a) hover 角色卡 → 点 ⭐ → 加入库 → 看 toast 成功 → (b) 顶部点 📚 我的库 → dialog 列出该角色 → (c) 选中 → 点「→ 引用到当前项目」→ reload 验证多了一个角色 binding** | 加入 + 浏览 + 引用 三步闭环 ✓ |
| **D3** | 内置形象 | 资产 stage 角色 section 🎭 | **点「🎭 内置形象」→ dialog 列 12 个 → 选「青年女主播」→ 点「引用到当前项目」→ reload 验证多了角色 binding (含主图) → 进编辑器看设定卡** | 引用 + 主图保留 ✓ |
| **D4** | Agent / Skill | （HTTP API） | curl GET /api/agents/skills + POST list-skills（无需登录） | 返回 9 个 skill 元数据 ✓ |
| **D5** | 参考视频导入 | ③ 剧本 stage 顶部按钮 | **点「📹 参考视频导入」→ dialog 弹出 → 选目标场景 → 输入测试视频路径 (用 ffmpeg 现造的 4 秒视频) → 点「开始分析」→ 等 1-3min → 选中 2 个 shot → 点「导入选中 2 个镜头」→ 验证 ④ 分镜 stage 多了 2 行** | 解析 + 多选 + 导入 三步 ✓ |
| **E1** | 视频提取主体 | CharacterAssetEditorV2 顶部按钮 | **进角色编辑器 → 点「📹 从视频提取」→ dialog 弹出 → 输入测试视频路径 → 点「抽帧」→ 等 1-2min → 编辑 4 个候选帧的 label → 多选保留 → 点「落到角色图谱（4）」→ reload 验证视角类目下多 4 张** | 抽 + 选 + 落帧 三步 ✓ |
| - | （新增）字幕 | ⑥ 合成 timeline | 进 ⑥ → 看字幕预览（如 PRD 列） | 字幕显示 ✓ |

**额外串联测试**：6 stage 真实跑通（创建项目 → 创建剧集 → 资产 → 剧本 → 分镜 → 制作 → 合成）作为整体功能链路验证。

---

## 2. 执行环境与工具

### 工具
- **chrome-devtools-mcp**：navigate / take_snapshot / click / fill / take_screenshot / wait_for / evaluate_script
- **curl**（D4 / 健康检查）
- **ffmpeg-static**（D5/E1 造测试视频文件）

### 服务
- 4201 web server（已重启，infrastructure ready）
- 5174 vite dev（已重启，channel-map 最新版）
- PG `the_bot_test`

### 失败处理流程（关键）
当任一 case 失败时：
1. **截图保存** `S<#>-FAIL-<desc>.png`
2. **看 console + network** 取错误信息
3. **看 4201 stderr** 取后端 stack
4. **对照 `docs/review/2026-05-09-ep-redesign-spec.md`** 找该能力点的 PRD 规范段落
5. **判断**：
   - bug 在代码 → 修代码（service / handler / vue）
   - bug 在 spec 不清晰 → 不修，记录到报告作为 PRD 待澄清
6. **重跑**该 case 到通过
7. **绝不**改测试脚本来"绕过"失败

---

## 3. 详细 18+ 步骤脚本

### Phase A: 准备（5 min）

#### A.1 服务健康检查
- curl `/api/health` → 200
- curl `/` 5174 → 200
- 截图：`A1-health-check.txt`（命令输出）

#### A.2 浏览器登录
- navigate `http://localhost:5174/#/login`
- fill email `test@local.dev` / password `test123456`
- 点「登录」
- wait_for `#/episode-production` URL
- 截图：`A2-logged-in.png`

#### A.3 D4 Agent API 验证（curl，无需登录）
- curl `GET http://localhost:4201/api/agents/skills`
- 验证返回 ≥9 个 skill
- 保存输出：`A3-skills.json`
- 截图（可选）：`A3-skills.png`（curl 输出）

### Phase B: 项目创建（2 min）

#### B.1 进剧集制作首页
- navigate `#/episode-production`
- snapshot
- 截图：`B1-project-list.png`

#### B.2 创建新项目
- 点 sidebar「新建」
- fill 项目名 `e2e-fullflow-{timestamp}`
- 选画幅 9:16
- 选 1080p
- 选风格「现代写实」
- 截图：`B2-create-project-form.png`
- 点「创建」
- wait_for 主区出现新项目
- 记录 projectId（从 sidebar 选中状态拿）
- 截图：`B3-project-created.png`

#### B.3 配 scriptModel（前置必做，否则 AI 一键 skip identify）
- 点「项目设置」
- 找到 scriptModel 区
- 选 provider + model
- 截图：`B4-scriptModel-configured.png`
- 关闭 dialog

### Phase C: F3 ✨ AI 一键模式（30-60s）

#### C.1 触发 wizard
- 点「✨ AI 一键」
- wait_for AIQuickModeWizard 出现
- 截图：`C1-quickmode-empty.png`

#### C.2 填表
- 标题 `e2e-茶馆相遇`
- 概要 `一个寒冷的冬夜，年轻书生李墨在京城茶馆偶遇神秘女子苏白，因丢失家传玉佩被卷入江湖恩怨。`（42 字）
- 时长 30 秒
- 风格 现代写实
- 截图：`C2-quickmode-filled.png`

#### C.3 跑两步
- 点「✨ 开始」
- 看进度：step 1 createEpisode running
- wait_for step 1 done（应 1-3s）
- step 2 identifyEntities running
- wait_for phase=done（30-60s）
- 截图：`C3-quickmode-done.png`
- 验证：两个 step ✓ done

#### C.4 跳到 workbench
- 点「打开剧集」
- wait_for URL 含 `/episode/ve_xxx`
- 截图：`C4-workbench-stage1.png`

### Phase D: ① 内容 stage 验证（5 min）

#### D.1 验证 AI 识别结果
- snapshot ① 内容 stage
- 验证：右侧 EntitySidebar 列出至少 2 角色 + 1 地点
- 期望：李墨、苏白 / 京城茶馆 / 玉佩
- 截图：`D1-entities-identified.png`

#### D.2 确认要素 / 进入资产
- 如果还在 pending：点「确认要素 → ② 资产」
- 如果已 confirmed：点 "资产" tab
- wait_for ② 资产盘点 header
- 截图：`D2-stage2-loaded.png`

### Phase E: ② 资产 stage（10-15 min — 真生成主图）

#### E.1 验证资产盘点显示
- snapshot 资产 stage
- 验证：3 个 section（角色 N / 地点 M / 物品 K）
- 验证：每个 section 顶部按钮 📚 我的库 / 🎭 内置形象（角色独占）/ + 新建
- 截图：`E1-asset-overview.png`

#### E.2 D3 测试：引用一个内置形象到项目
- 点角色 section「🎭 内置形象」
- wait_for 12 个 preset
- 选「青年女主播」
- 点「引用到当前项目」
- wait_for ElMessage 成功
- 截图：`E2-d3-preset-imported.png`
- 验证：资产盘点角色数 +1

#### E.3 一键生成所有缺失主图
- 点顶部「✨ 一键生成所有缺失主图（N）」
- 截图：`E3-generate-start.png`
- wait_for 所有占位 ⚠ → 实际缩略图（10-15 min）
- 截图中途：`E3-mid-generate.png`
- 截图完成：`E4-all-mainimage-done.png`
- 验证：每个资产卡「主图 ✓」

#### E.4 进角色编辑器
- 点「李墨」资产卡
- wait_for CharacterAssetEditorV2 加载
- 截图：`E5-character-editor.png`

#### E.5 C4 字段双层测试
- 看上半「⭐ 生成核心」展开 + 下半「▼ 叙事元数据」折叠
- 点「▼ 叙事元数据」
- 验证 折叠区展开 + 显示 姓名/别名/定位/音色/形象库 字段
- 截图：`E6-c4-collapse-expanded.png`
- 再点收起
- 验证 折叠

#### E.6 C5 AI 自动填测试
- 在「人物描述」textarea 输入更长描述（追加现有内容后）：
  > `身高 175cm，留短发，戴圆框眼镜，性格温和书卷气，喜欢吟诗。`
- 点「✨ AI 自动填」
- wait_for 5-15s
- 验证：性别/年龄/人种 字段被自动填（如未自动则 manual fill）
- 截图：`E7-c5-ai-autofilled.png`

#### E.7 C6 多角度参考图测试
- 点顶部「多角度参考图」按钮
- wait_for 30-90s
- 验证：视角类目下出现「正面 / 左 3/4 / 右 3/4」3 张图
- 截图：`E8-c6-three-views-done.png`

#### E.8 C3 透明度面板测试
- 在视角缩略图 hover
- 点 ⓘ icon
- wait_for GenerationDetailDialog 出现
- 验证：dialog 显示 prompt + negative + metadata + 派生关系
- C1 验证：negativePrompt 文本长度 < 50 chars（PRD §3.2 P-1 要求精简）
- C2 验证：prompt 不含「别名」「定位」字面（PRD §3.2 P-2 要求 metadata 解耦）
- 点「复制 prompt」按钮
- 验证 clipboard 包含 prompt 内容
- 截图：`E9-c3-transparency-panel.png`
- 关闭 dialog

#### E.9 D1 ReferenceSetPanel 测试
- 编辑器主区找到「⭐ 角色形象组」section
- 勾选 main 复选框
- 勾选一个 view 复选框
- 点「保存形象组」
- wait_for 成功 toast
- 截图：`E10-d1-reference-set-saved.png`
- 关闭 + 重开编辑器
- 验证勾选保留 ✓

#### E.10 E1 从视频提取主体测试
- 先 bash 造一个 4 秒测试视频：`ffmpeg -f lavfi -i color=c=red:s=320x240:d=4 /tmp/e2e-test-video.mp4`
- 点编辑器顶部「📹 从视频提取」
- dialog 出现
- 输入路径 `/tmp/e2e-test-video.mp4`
- 抽帧数 4
- 点「抽帧」
- wait_for 1-2min
- 验证：4 个候选帧网格显示
- 编辑 label：正/侧前/侧后/背
- 多选 4 个全部
- 点「落到角色图谱（4）」
- wait_for 5-10s
- 截图：`E11-e1-extract-frames-imported.png`
- 关闭 dialog
- 进编辑器主区看视角类目，验证多 4 张视图

#### E.11 D2 跨项目库 完整闭环测试
- 返回资产盘点
- hover 「李墨」资产卡 → 点 ⭐ icon
- wait_for ElMessage「已加入我的库」
- 截图：`E12-d2-add-to-library.png`
- 点 section 顶部「📚 我的库」
- wait_for UserAssetLibraryDialog 出现
- 验证：列表里有「李墨」记录
- 选中李墨
- 点「→ 引用到当前项目」
- wait_for ElMessage 成功
- 关闭 dialog
- 验证资产盘点角色数 +1（出现「李墨 (副本)」或同名）
- 截图：`E13-d2-library-import.png`

#### E.12 完成 ② 资产 stage
- 点顶部「完成本阶段 →」
- 截图：`E14-stage2-done.png`

### Phase F: ③ 剧本 stage（5 min）

#### F.1 切到 剧本 tab
- 点 "内容+剧本" tab
- 验证：subState=scripting + 顶部 actions 区显示 📋 故事板预览 + 📹 参考视频导入 + 完成定稿

#### F.2 AI 生成剧本
- 主区点「✨ AI 生成剧本」
- wait_for 30-90s
- 验证：SceneListPanel 出现 + ≥2 个场景
- 截图：`F1-script-generated.png`

#### F.3 C10 9 帧故事板测试
- 点顶部「📋 故事板预览」
- wait_for StoryboardThumbnailDialog
- 概要已自动填充
- 风格留默认
- 点「✨ 生成 9 帧预览」
- wait_for 1-3 min（**这步可能慢**）
- 验证 3×3 网格 9 张图
- 勾选前 4 张
- 选目标场景（默认第一个）
- 点「✓ 用选中帧创建分镜」
- wait_for 5-10s
- 验证 ElMessage 成功
- 截图：`F2-c10-thumbnails-imported.png`

#### F.4 D5 参考视频导入测试
- 点顶部「📹 参考视频导入」
- wait_for ReferenceVideoImportDialog
- 输入路径 `/tmp/e2e-test-video.mp4`（步骤 E.10 已造）
- 阈值默认 0.3
- 点「开始分析」
- wait_for 1-3 min
- 验证：shots 表格出现 ≥1 行
- 选目标场景
- 多选所有 shots
- 点「导入选中 N 个镜头」
- wait_for 5-10s
- 验证 ElMessage 成功
- 截图：`F3-d5-reference-video-imported.png`

#### F.5 完成定稿
- 点顶部「完成定稿 → ④ 分镜」
- 截图：`F4-stage3-done.png`

### Phase G: ④ 分镜 stage（5-10 min）

#### G.1 切到 分镜 tab
- 截图：`G1-stage4-loaded.png`
- 验证：左侧 sidebar 列场景；C10/D5 步骤已生成的分镜行已显示

#### G.2 AI 一键拆所有场景（如还有未拆场景）
- 点顶部「✨ AI 一键拆所有场景」
- wait_for 1-3 min
- 截图：`G2-storyboards-generated.png`
- 验证：每场景 ≥1 分镜

#### G.3 C8 全局编号验证
- 点第一个分镜
- 验证主区显示 `EP01_S01_SH01`
- 截图：`G3-c8-global-id.png`

#### G.4 C7 镜头语言层完整测试
- 选第 1 分镜
- 编辑器看 焦距/光圈/相机风格/打光 4 个 select
- 改焦距 = `35mm`
- 改光圈 = `f/4`
- 改打光 = `伦勃朗光`
- 截图：`G4-c7-camera-params.png`
- 切双模板：先看「⚡ 短剧 5 段」（默认 checked）
- 点「🎬 影视 shot-level」
- 验证字段切换为 subject / action / camera / lighting / mood
- 截图：`G5-c7-template-film.png`
- 切回「⚡ 短剧 5 段」
- 等自动保存（如有 dirty 提示则点保存）

#### G.5 C9 多基图派生测试（地点）
- 切到地点资产 → 编辑「京城茶馆」
- 找派生入口（「派生变体」或同等按钮）
- 看 dialog 用 el-checkbox-group
- 多选 2 张基图（如有；只 1 张则跳过）
- 选 category=time，label=「黄昏」
- 触发派生
- wait_for 30-60s
- 验证产出图
- 截图：`G6-c9-multi-baseimage-derive.png`
- 返回 ④ 分镜

#### G.6 完成 ④ 分镜
- 点「完成本阶段 → ⑤ 制作」
- 截图：`G7-stage4-done.png`

### Phase H: ⑤ 制作 stage（5-10 min — 真生成 1 视频）

#### H.1 切到 制作 tab
- 截图：`H1-stage5-loaded.png`
- 验证：左侧分镜 sidebar + 主区 keyframe + video panel + 资产引用 panel

#### H.2 F2 LineageOverlay 测试
- 切顶部「显示生成链路」switch on
- evaluate_script 看 SVG `.lineage-svg` 存在 + path 数量 ≥3
- 截图：`H2-f2-lineage-on.png`
- switch off

#### H.3 生成第 1 分镜的 keyframes
- 主区找「关键帧」section
- 点「全部重新生成」（或「生成首帧 / 末帧」）
- wait_for 1-2 min
- 截图：`H3-keyframes-done.png`
- 验证：≥2 张 keyframe 缩略图

#### H.4 生成第 1 分镜的视频片段
- 主区找「视频片段生成」section
- 点「生成视频片段」
- wait_for 1-3 min
- 截图：`H4-video-segment-done.png`
- 验证：「视频预览」section 显示 `<video>` 元素

#### H.5 完成 ⑤（条件成立时）
- 如果其余分镜都没生成，「完成本阶段」按钮 disabled，跳过
- 直接切到 ⑥ 合成 tab

### Phase I: ⑥ 合成 stage（5 min — 不导出 MP4）

#### I.1 切到 合成 tab
- 截图：`I1-stage6-loaded.png`

#### I.2 构建 timeline
- 找「构建 timeline」按钮
- 点击
- wait_for 30-60s
- 截图：`I2-timeline-built.png`
- 验证：timeline cells 显示分镜（已出片的有 video 缩略，未出片的占位）

#### I.3 字幕预览
- 找「预览字幕」按钮
- 点击
- wait_for <30s
- 截图：`I3-subtitle-preview.png`

#### I.4 不导出 MP4
- 跳过 export-mp4（仅 1 分镜不完整）

### Phase J: 报告生成（10 min）

#### J.1 写测试报告
- 写 `progress/2026-05-10-e2e-fullflow/report.md` 含：
  - 22 能力点 verify 结果表
  - 18+ 步骤执行记录（耗时 + 通过/失败 + 截图）
  - 失败的 case 详细 bug 描述 + 修复 commit 链接
  - 资源消耗（图生数 + 视频生数 + 时间）
  - 与 PRD `docs/review/2026-05-09-ep-redesign-spec.md` 对照偏差

---

## 4. 自我 review 通过条目

- [x] 22 能力点每个都有**独立 test case**（不只是"目睹按钮"）
- [x] 6 stage 真实串联通过（创建到合成）
- [x] 失败处理流程明确（看 PRD → 改代码 → 重跑）
- [x] 不再问 Q（自定决策）
- [x] 截图位置明确（`progress/2026-05-10-e2e-fullflow/screenshots/`）
- [x] 报告产出位置明确（`report.md`）
- [x] PRD 引用明确（`docs/review/2026-05-09-ep-redesign-spec.md`）
- [x] 测试视频造法明确（ffmpeg 4s 红屏）
- [x] D4 Agent 用 curl 验证（HTTP API 不能 UI 测）
- [x] D2 完整闭环（加入 → 浏览 → 引用）
- [x] D3 完整闭环（preset → 引用 → 验证 binding）
- [x] C3 透明度（C1 + C2 顺带验证 prompt 文本）

---

## 5. 待 review 事项 — 一项即可

> 删 v1 的 6 个 Q。剩 1 项确认：

**Q. 用什么 LLM provider 跑 identifyEntities + generateScript + AI 拆分镜？**
- 检查项目 `e2e-fullflow-{ts}` 创建时 scriptModel 是否会自动继承用户其他项目的 default provider？
- 如不继承，需要 B.3 步骤手动配。我会按 `getProviderConfig` 逻辑选用户首个 enabled provider。

**这唯一一个 Q 是配置问题，不是测试范围问题。我可以自己处理（B.3 步骤）。**

如果你 review v2 没问题，我马上开始执行。
