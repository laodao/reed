# 通知弹窗点击后自动消失（2026-09-06）

## 需求
用户选择范围：**右上角弹窗点击后自动关闭**（运行时 ElNotification：运行内 notify、
「待审核」review-requested——后者 duration=0 会一直挂着、点了也不关）。

## 改动
`src/renderer/src/stores/workflow.ts`：
- notify 分支：捕获实例 `ins`，加 `onClick: () => { ins.close(); if (e.runId) push(/workflow/run/<runId>) }`
  —— 点击即自动消失；有 runId 顺带直达运行详情（与通知中心点击语义一致）。
- review-requested 分支：保留 duration=0（不自动超时消失），onClick 增加 `ins.close()`
  后再跳转审核页。

## 测试（TDD）
新增 `tests/unit/renderer/workflow-notify-popup.spec.ts` 3 例（mock element-plus + router，
node 环境，无需 DOM）：notify 有 runId 点击→close+跳转 / notify 无 runId 点击→只关不跳 /
review-requested 保持 duration=0 且点击→close+跳审核页。全绿。
vue-tsc 基线 944 持平。

## 真机验证（CDP 9222 electron 渲染层）
- 改后 HMR 已推送（dev log 23:08:52，store 变更使 MainLayout/NotificationCenter/
  WorkflowRunDetail 触发 hmr update）。
- 起真实 V2 运行（wfrun_1788707436669_0fz59m1j1）触发「待审核」弹窗（count=1），
  用真实鼠标点击弹窗中心 → 1s 后剩余 0（**自动消失 ✓**），页面切到该运行详情（hash 路由，
  pathname 恒为 '/'，正文已显示运行详情/waiting_review）→ 跳转 ✓。
- 注：playwright 里 `el.click()`（合成事件）不触发该弹窗 onClick，真实 mouse.click 正常；
  已按真实用户手势验证。
- 验证后两趟运行均已取消清理。

## 后续
- 如需「通知中心列表条目点击后从列表移除」，属于另一项（需后端新增"已消除"持久标记），未做。
