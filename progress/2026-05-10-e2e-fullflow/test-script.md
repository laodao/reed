# 全流程 E2E 测试脚本（review 用，未执行）

> **状态**：待用户 review
> **创建时间**：2026-05-10
> **执行环境**：localhost:5174 (vite) + localhost:4201 (web server) + Docker PG (5432, the_bot_test)
> **测试账号**：test@local.dev / test123456
> **执行工具**：chrome-devtools-mcp（自动化点击 + snapshot + screenshot）

---

## 0. 目标 / 范围 / 限制

### 目标
验证 22 项能力点的端到端真实工作流：用户从「新建项目」开始 → 一条龙跑完 6 stage → 成片 MP4。每步真实调用 IPC + AI provider，验证数据正确流转 + 文件产出 + UI 交互全程通畅。

### 范围
| Stage | 测试动作 |
|---|---|
| ① 内容 | 创建项目 / 用 ✨ AI 一键 创建剧集 / 验证 AI 识别结果 / 确认要素 |
| ② 资产 | 验证识别角色/地点/物品的资产盘点显示 / 一键生成所有缺失主图 / 完成本阶段 |
| ③ 剧本 | AI 生成剧本 / 验证剧本 / 完成定稿 |
| ④ 分镜 | AI 一键拆所有场景 / 检查全局编号 + 镜头语言层 / 完成本阶段 |
| ⑤ 制作 | 关键帧生成 / 视频片段生成（**1 个分镜验证即可**） / 完成本阶段 |
| ⑥ 合成 | 构建 timeline / 导出 MP4 |

### **关键限制**
1. **极简素材**：剧本 30 字以上 + 30 秒时长 → 期望识别 1-2 角色 + 1 地点 + 0-1 物品。不刷"杜十娘"那种 5000 字大素材（避免烧 token + 时间）。
2. **AI 调用真实**：会消耗用户 quota（剧本 LLM + 主图 image gen + 关键帧 image gen + 视频片段 video gen + 配音 TTS）。预算估算：30-50 token 调用 + 10-20 张图 + 1-2 个视频片段。
3. **⑤ 制作 stage 限缩**：只生成 1 个分镜的 keyframes + video（验证管线打通即停），不全跑所有分镜（避免视频生成时长爆炸）。
4. **⑥ 合成可能跳过 export-mp4**：如果 ⑤ 只跑了 1 个分镜，build-timeline 能跑 + preview-subtitle 能跑，但 export-mp4 需要全部分镜都有 video → 可能跳过或仅跑到「构建 timeline」即停。
5. **不烧 quota 的 fallback**：如果用户 review 觉得真跑太贵，改为「干跑模式」— wizard / dialog 都点开但不真触发后端 AI 调用，仅验证 UI 流畅。

### 预算估计
| 项 | 估时 | 说明 |
|---|---|---|
| 创建项目 + 剧集 + AI 识别 | 30-60s | wizard 跑 createEpisode + identifyEntities |
| 一键生成主图（4-5 张）| 3-5min | 4 资产 × 30-60s/张 |
| AI 生成剧本 | 30-90s | LLM 单次调用（输入扩展）|
| AI 拆分镜 | 1-3min | 1-3 个场景 × 30s |
| 1 分镜 keyframes（2 张） | 1-2min | 2 张关键帧串行 |
| 1 视频片段生成 | 1-3min | keyframes2video |
| ⑥ build-timeline + preview-subtitle | 30s | 拼装 + 字幕 |
| **总计** | **~10-20min** | 最小可行流程 |

### 风险
| 风险 | 应对 |
|---|---|
| Provider quota 不足 | 提前 cancel + 报告该步失败，不阻塞下一 stage 验证 |
| AI 识别少识别要素（识别 0 个）| 跳过资产生成，直接进 ③ |
| 分镜生成失败 | 跳过 ⑤，仅记录失败原因 |
| 视频生成超时 | 等 5 分钟，超时跳过 |
| 任何 IPC 500 | 截屏 + 看 console + 看 4201 stderr，记录到报告 |

---

## 1. 准备阶段

### 1.0 Setup 检查（5min 内）
- [ ] 4201 web server 健康（curl /api/health → 200）
- [ ] 5174 vite dev 健康（GET / → 200）
- [ ] PG `the_bot_test` 可连
- [ ] test@local.dev 已登录（或登录拿 cookie）
- [ ] 项目 scriptModel 配好（可用 LLM provider）— 否则 wizard / generateScript 跳过

### 1.1 项目 scriptModel 配置确认
**前置**：登录 → 查 list-projects-summary → 选一个项目 → getProject 看 config.scriptModel。如缺则提示用户先配（不阻塞）。

### 1.2 进度目录建立
mkdir -p `progress/2026-05-10-e2e-fullflow/screenshots/`
所有截图按 `S<stage>-<step>-<desc>.png` 命名（如 `S1-01-create-project.png`）。

---

## 2. 主流程 — 18 步详细脚本

### Stage 0: 创建项目 + 进入剧集

#### Step 0.1 — 进入剧集制作首页
- **Action**: `navigate http://localhost:5174/#/episode-production`
- **Wait for**: "新建" 按钮可见（左侧 sidebar 的「新建项目」）
- **Screenshot**: `S0-01-project-list.png`
- **Verify**: sidebar 显示已有项目 + 主区显示空态或上次 selected 项目

#### Step 0.2 — 创建新项目
- **Action**: 点 sidebar「新建」按钮 → 弹「新建剧集项目」对话框
- **Fill**:
  - 项目名称: `e2e-全流程-{timestamp}`（用 ms 时间戳避免冲突）
  - 关联长文: 留空
  - 画幅比例: `9:16 竖屏`（短剧默认）
  - 分辨率: `1080`（HD，平衡质量+速度）
  - 帧率: `24 fps`
  - 项目风格: `现代写实`（一个，方便 prompt 拼接）
- **Screenshot**: `S0-02-create-project-form.png`
- **Action**: 点「创建」
- **Wait for**: 主区显示新项目 + EpisodeListPanel 顶部 actions 区出现 ✨ AI 一键 / + 新建剧集
- **Verify**: URL 不变（仍 /episode-production），sidebar 高亮新项目

#### Step 0.3 — 验证项目设置 scriptModel
- **Action**: 点「项目设置」
- **Verify**: scriptModel 已配（否则在 dialog 内选 provider + model）
- **Action**: 关闭设置 dialog
- **Screenshot**: `S0-03-project-settings.png`（showing config.scriptModel）

### Stage 1: ① 内容 — 用 F3 ✨ AI 一键 创建剧集

#### Step 1.1 — 触发 ✨ AI 一键
- **Action**: 点「✨ AI 一键」按钮
- **Wait for**: AIQuickModeWizard dialog 显示
- **Screenshot**: `S1-01-quick-mode-empty.png`

#### Step 1.2 — 填 wizard 表单
- **Fill**:
  - 剧集标题: `e2e-茶馆相遇`
  - 一句话剧本（≥30 字）:
    > `一个寒冷的冬夜，年轻书生李墨在京城茶馆偶遇神秘女子苏白，因丢失家传玉佩被卷入江湖恩怨。`
    （42 字，含 2 角色：李墨、苏白；1 地点：京城茶馆；1 物品：玉佩）
  - 目标时长: `30 秒`
  - 风格: `现代写实`
- **Screenshot**: `S1-02-quick-mode-filled.png`
- **Action**: 点「✨ 开始」
- **Wait for**: 进度条出现 + step 1 「创建剧集」 running

#### Step 1.3 — 等待 wizard 跑完
- **Wait for**: 「打开剧集」按钮（phase = 'done'）— **预期 30-60s**
- **Screenshot**: `S1-03-quick-mode-done.png`
- **Verify**: 两个 step 都是 ✓ done（或 identify 是 skipped 如未配 scriptModel）
- **Action**: 点「打开剧集」

#### Step 1.4 — 进入 workbench ① 内容 stage
- **Wait for**: URL 含 `/episode/ve_xxx` + 顶部 stage tabs
- **Screenshot**: `S1-04-stage1-content.png`
- **Verify**:
  - "内容+剧本" tab 选中
  - 显示 ExcerptPanel + StoryBackgroundPanel
  - AI 识别已跑（若 scriptModel 配好）→ 右侧 EntitySidebar 列出识别角色 / 地点 / 物品
  - 主区显示「✨ AI 生成剧本」CTA（subState = 'scripting' 因为 entities 已 confirm）
  - 或主区显示「确认要素」CTA（subState = 'pending'，未自动 confirm）

### Stage 2: ② 资产 — 验证 + 一键生成主图

#### Step 2.1 — 切到 ② 资产 tab
- **Action**: 点 "资产" tab
- **Wait for**: ② 资产盘点 header
- **Screenshot**: `S2-01-stage2-asset-empty.png`
- **Verify**:
  - 顶部统计: `N 角色 · M 地点 · K 物品`（应 ≥1，看 AI 识别结果）
  - 角色 section 顶部有「📚 我的库」「🎭 内置形象」「+ 新建角色」
  - 地点 section: 「📚 我的库」「+ 新建地点」
  - 物品 section: 「📚 我的库」「+ 新建物品」
  - 顶部「✨ 一键生成所有缺失主图（N）」按钮（N 表示缺主图数）

#### Step 2.2 — 一键生成所有主图
- **Action**: 点「✨ 一键生成所有缺失主图（N）」
- **Wait for**: 每个资产卡的占位 ⚠ 逐个变成实际缩略图
- **Predicted time**: 4 资产 × 30-60s = **2-4 分钟**
- **Screenshot 多张**:
  - `S2-02-stage2-generating.png`（中途，部分已生成）
  - `S2-03-stage2-all-main-done.png`（全部主图齐备）
- **Verify**:
  - 所有资产卡显示「主图 ✓」
  - 顶部 "已就绪 N/N"
  - 「完成本阶段 →」按钮启用

#### Step 2.3 — 完成本阶段
- **Action**: 点「完成本阶段 →」
- **Wait for**: 跳到 "内容+剧本" tab 但 subState 升级到 scripting（或保持 ② 资产 + 状态变 readonly）
- **Screenshot**: `S2-04-stage2-done.png`

### Stage 3: ③ 剧本

#### Step 3.1 — 切到 "内容+剧本" tab
- **Action**: 点 "内容+剧本" tab
- **Verify**: 顶部 actions 区显示 「📋 故事板预览」「📹 参考视频导入」「完成定稿 → ④ 分镜」

#### Step 3.2 — 触发 AI 生成剧本
- **Action**: 主区点「✨ AI 生成剧本」CTA
- **Predicted time**: **30-90s**
- **Wait for**: 主区显示 SceneListPanel + 剧本文本（有场景列表）
- **Screenshot**: `S3-01-stage3-script-generated.png`
- **Verify**:
  - 概要文本生成
  - 场景数 ≥1（30s 短剧约 2-3 个场景）
  - 每个场景含 角色 / 地点 / 物品 引用

#### Step 3.3 — 完成定稿
- **Action**: 点「完成定稿 → ④ 分镜」
- **Wait for**: confirmation 或自动跳 ④ 分镜 tab
- **Screenshot**: `S3-02-stage3-approved.png`

### Stage 4: ④ 分镜

#### Step 4.1 — 切到 "分镜" tab
- **Action**: 点 "分镜" tab
- **Verify**:
  - 顶部统计: `N 个场景 · 共 0 个分镜 · 当前场景预估 0s`
  - 顶部「为本场景生成分镜」「✨ AI 一键拆所有场景」「完成本阶段」
  - 左侧 sidebar 列场景

#### Step 4.2 — 一键拆所有场景
- **Action**: 点「✨ AI 一键拆所有场景」
- **Predicted time**: 2-3 场景 × 30s = **1-3 分钟**
- **Wait for**: 进度条完成 + 左侧 sidebar 每个场景出现分镜列表
- **Screenshot**: `S4-01-stage4-storyboards-generated.png`
- **Verify**:
  - 每场景含 N 分镜（每个 ≥1）
  - 全局编号: `EP01_S01_SH01..` 等
  - 镜头语言字段（景别 / 角度 / 运镜 / 时长）已填

#### Step 4.3 — 检查 C7 镜头语言层显示
- **Action**: 选第一个分镜（侧边点 1.1）
- **Verify**: 编辑器显示
  - 景别 / 角度 / 运镜 / 时长
  - **焦距 / 光圈 / 相机风格 / 打光**（C7 新加）
  - 双模板切换器（短剧 5 段 / 影视 / 自由）
  - 关键帧数 1-9 选择器
- **Screenshot**: `S4-02-stage4-shot-language.png`

#### Step 4.4 — 完成本阶段
- **Action**: 点「完成本阶段 → ⑤ 制作」
- **Wait for**: 自动跳 ⑤ 制作 tab
- **Screenshot**: `S4-03-stage4-done.png`

### Stage 5: ⑤ 制作（**仅跑 1 个分镜，验证管线**）

#### Step 5.1 — 切到 "制作" tab
- **Verify**:
  - 顶部「显示生成链路」switch
  - 顶部「完成本阶段 → ⑥ 合成」（disabled，所有分镜没出片）
  - 左侧 sidebar 列分镜
  - 主区显示当前分镜（默认 1.1）的关键帧 + 视频片段 + 资产引用面板

#### Step 5.2 — 切 F2 LineageOverlay 验证
- **Action**: 点开「显示生成链路」switch
- **Verify**: 主区出现 SVG 连线（`<svg class="lineage-svg">`）
- **Screenshot**: `S5-01-stage5-lineage-on.png`
- **Action**: 关掉 switch（避免后续截图干扰）

#### Step 5.3 — 生成第一个分镜的关键帧
- **Action**: 主区「关键帧 (2 张)」section 点「全部重新生成」（或如果 0 张则点「生成首帧 / 末帧」）
- **Predicted time**: 2 张 × 30-60s = **1-2 分钟**
- **Wait for**: 2 张关键帧缩略图都显示
- **Screenshot**:
  - `S5-02-keyframes-start.png`（生成中）
  - `S5-03-keyframes-done.png`（完成）

#### Step 5.4 — 生成第一个分镜的视频片段
- **Action**: 主区「视频片段生成」section 点「生成视频片段」
- **Predicted time**: **1-3 分钟**
- **Wait for**: 「视频预览」section 显示 `<video>` 元素
- **Screenshot**: `S5-04-video-segment-done.png`
- **Verify**: video 元素 src 指向 generated mp4

#### Step 5.5 — 验证后续分镜骨架已就绪（不真跑）
- **Action**: 点 sidebar 第二个分镜（1.2）
- **Verify**: 主区显示 1.2 的关键帧 + 视频片段（默认未生成）
- **Screenshot**: `S5-05-stage5-shot-1-2-skeleton.png`
- **Note**: 不真跑 1.2 的 keyframes / video，节省 quota

### Stage 6: ⑥ 合成（**最小验证**）

#### Step 6.1 — 切到 "合成" tab
- **Action**: 点 "合成" tab
- **Verify**: 显示 timeline 视图（即使没分镜也应有空 timeline）
- **Screenshot**: `S6-01-stage6-empty.png`

#### Step 6.2 — 构建 timeline
- **Action**: 点 timeline 区域的「构建 timeline」按钮（如有）
- **Predicted time**: 30-60s
- **Wait for**: timeline cells 显示分镜（已出片的显示 video，未出片的显示占位）
- **Screenshot**: `S6-02-stage6-timeline.png`

#### Step 6.3 — 字幕预览
- **Action**: 如有「预览字幕」按钮 → 点击
- **Predicted time**: <30s
- **Verify**: 字幕轨道 / 字幕预览
- **Screenshot**: `S6-03-stage6-subtitle.png`

#### Step 6.4 — 导出 MP4（**视情况跳过**）
- **判断**: 如果只跑了 1 个分镜，export 出来的视频不完整，**跳过**
- **如执行**: 点「导出 MP4」 → 等 1-3 分钟 → 验证有产出文件路径
- **Screenshot**（如执行）: `S6-04-stage6-export-mp4.png`

---

## 3. Cleanup

### 3.1 不删除项目
保留新创建的项目（用户可后续手动检查 / 删除）。

### 3.2 任务列表更新
- mark task #61（写脚本）completed
- 创建 task #62 写测试报告

---

## 4. 测试报告产出

按以下结构 mkdir + 写 `progress/2026-05-10-e2e-fullflow/report.md`:

```
# E2E 全流程测试报告
1. 测试环境
2. 测试范围（22 项能力点对应表）
3. 步骤执行记录（按上述 18 步骤逐项记录）
   - 每步耗时
   - 截图链接
   - Verify 通过 / 失败原因
4. 发现的问题（含 bug 修复建议）
5. 22 项能力点达成度评估
6. 总耗时统计 + 资源消耗（token / image gen / video gen 数量）
```

---

## 5. 待 review 事项 — 请用户确认

> 在执行前请确认以下决策：

### Q1. 是否真跑 AI 调用？
- (a) **真跑 happy path**（推荐）：所有 stage 真调 AI，预算 10-20 分钟 + 真实 token 消耗
- (b) **干跑模式**：所有 wizard / dialog 都点开但 cancel 而不触发 AI（5 分钟内完成）
- (c) **混合**：① 内容 + ② 资产真跑（验证视觉），③④⑤⑥ 仅打开 UI 验证不触发

### Q2. 创建新项目还是用现有项目？
- (a) **创建新项目**（推荐）：干净环境，避免脏数据
- (b) 用现有 `e2e-茶馆相遇` 项目（已有部分数据，可能省时间）

### Q3. ⑤ 制作 stage 是否生成视频？
- (a) **生成 1 个视频片段**（推荐）：验证 keyframes2video 管线打通
- (b) 仅生成 keyframes 不生成视频
- (c) 完全跳过 ⑤

### Q4. ⑥ 合成 stage 是否导出 MP4？
- (a) 仅 build-timeline + preview-subtitle，**不导出 MP4**（推荐）
- (b) 完整导出 MP4（依赖 ⑤ 是否所有分镜都生成）

### Q5. 失败处理策略？
- (a) **任一 stage 失败立即停止 + 报告**（推荐）
- (b) 失败后跳过当前 stage 继续下一个

### Q6. 用什么剧本？
- (a) 上面草拟的「茶馆相遇」42 字（推荐）
- (b) 用户给定其他剧本

---

**等待用户 review + 回答 Q1-Q6 后开始执行。**
