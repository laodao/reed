# E2E 全流程执行日志

> **执行开始**：2026-05-10
> **测试脚本**：`test-script-v2.md`
> **PRD 对照**：`docs/review/2026-05-09-ep-redesign-spec.md`

每步实时记录：开始时间 / 结束时间 / 耗时 / 验证结果 / 截图链接 / 备注。

---

## Phase A — 准备

### A.1 服务健康检查 ✓ (13:37:52)

| 服务 | 状态 |
|---|---|
| 4201 web server | 200 ✓ |
| 5174 vite dev | 200 ✓ |
| PostgreSQL `the_bot_test` | 连接成功 ✓ |

### A.2 浏览器登录 ✓ (13:38)

- 已登录 `test@local.dev`
- URL `http://localhost:5174/#/episode-production`
- 截图: `screenshots/A2-logged-in.png`
- 已存项目: 杜十娘2 / 杜十娘 / e2e-茶馆相遇 / 完整测试项目（4 个）

### A.3 D4 Agent API ✓ (13:38:35)

- `GET /api/agents/skills` → ok=true, count=9
- 9 个 skill: character-three-views, derive-variant, set-character-reference-set, analyze-reference-video, list-user-assets, add-to-user-library, create-binding-from-library, list-preset-digital-humans, list-skills
- 输出: `screenshots/A3-skills.json`

**Phase A 完成 — D4 ✓**

---

## Phase B — 项目创建

### B.1-B.2 创建项目 ✓ (13:38-13:39)

- 项目名: `e2e-fullflow-1778391540`
- 画幅 16:9 / 1080p / 30fps
- 截图: `screenshots/B2-create-project-form.png`, `B3-project-created.png`

### B.3 配 5 个 model **(发现 Bug #1 + 修复)** ✓ (13:39-13:48)

**Bug #1**：项目设置 dialog 加载错的项目数据（显示上一个选中项目）

- 原因：`EpisodeProjectListV2.selectProject()` 只更新本地 `selectedProject` ref，没同步 `projectStore.currentProject`
- SettingsDialog 内部从 `projectStore.currentProject` 读项目数据 → 加载上次进入的项目
- 修复：commit `1f5d6416` — selectProject 调 `projectStore.selectProject(project)` 同步 store
- HMR reload 后验证：dialog 正确显示新项目 `e2e-fullflow-1778391540`
- 截图: `screenshots/B4-settings-empty-models.png`（修复后空 models）

**配模型** (5 个全部配):
- 剧本生成: bailian/qwen3.6-27b
- 分镜生成: bailian/qwen3.6-27b
- 画面生成: bailian/wan2.7-image-pro
- 视频合成: bailian/wan2.7-i2v
- 音频生成: bailian/qwen3-tts-instruct-flash
- 截图: `screenshots/B5-settings-models-filled.png`

**注**：误选了「关联长文 = 小说」（el-select 自动选第一项的 evaluate script bug），保存。

**Phase B 完成 — 修了 1 个真实 UI bug**

---

## Phase C — F3 ✨ AI 一键模式
