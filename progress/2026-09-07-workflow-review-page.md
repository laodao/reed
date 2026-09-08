# 2026-09-07 工作流「审核确认页 + 通知自动消失」落地

## 需求
1. 版本管理：动手前保存历史版本（已备份 scripts/backup-writerlayer-20260907/；并说明应用内“版本历史”用法）；
2. 通知点击应进入**审批确认界面**（类似审批流的表单页），而非只进运行详情；
3. 通知要**自动消失**，不能一直显示。

## 改动
### 核心/主进程
- `src/core/platform/services/notification.service.ts`：
  - workflow_review（待审核）通知 route 改 `/workflow/review/:runId`（直达审批页）；
  - 新增 `resolveRunNotices(runId)`：按运行把名下通知事件批量标已读（“自动消失”）。
- `src/core/platform/workflow/workflow-run.service.ts`：`reviewDecide` 成功后与 `cancelRun` 成功后调用 `resolveRunNotices`（fire-and-forget，失败不影响运行）。
### 渲染层
- 新增 `src/renderer/src/views/workflow/WorkflowReviewPage.vue`（审批页 /workflow/review/:runId）：
  - 左栏=待审环节列表（审批流步骤），自动聚焦首个待审；右栏=审核表单；
  - payload 形态自适应：payload.md（大纲/文案：可编辑 md + 批准/驳回/提交修改并批准）｜payload.cards（素材板：卡片网格图+逐条可改 caption/duration/visual/imagery/prompt）｜payload.visual（逐镜单卡）｜通用 JSON 兜底；
  - 全部决策走 workflow.reviewDecide；决策成功自动刷新并聚焦下一待审（支持连续审批，运行中每 6s 轻轮询）；
  - 无待审时给出运行状态与「查看运行详情」入口。
- `src/renderer/src/packs/workflow/index.ts`：注册 `/workflow/review/:runId` 路由 + routePaths。
- `WorkflowRunDetail.vue`：运行处于 waiting_review 且有 human-review 待审时，顶部警示条「N 个环节等待审核确认 → 去审核确认」。

## 验证（CDP 真机，wfrun_1788757250207_sedic29nu）
- 大纲待审后生成的通知 route=`/workflow/review/<runId>` ✓
- 打开审批页：待审步骤=1、大纲编辑框 1470 字可编辑 ✓
- 页面点「批准」→ outlineReview succeeded、run 继续 ✓（首次版本因按钮在视口外未点中，改用 locator 自动滚动后通过）
- 通知自动消失：决策后 unread 142→141（该运行待审核通知自动已读）✓；取消运行后 +1 是新的“运行已取消”通知（预期行为）。
- 素材板卡片表单/逐镜表单与 md 共用同一 decide 路径，本次未跑真实素材板 UI（代码路径同源）。

## 备份/版本说明
- 改动前已存：scripts/backup-writerlayer-20260907/{def-get-v3.json, script-to-video-v3.json, writer-skills.json, builtin-skills.ts.txt}
- 应用内版本管理：工作流编辑器 → 顶部「版本历史」（每次发布存不可变快照，可恢复到草稿）；内置定义由代码 JSON 启动同步，所以仓库内用 scripts/backup-* + git 做文件级备份。

## 备注
- 未提交推送；progress/_* 临时脚本不入库。
