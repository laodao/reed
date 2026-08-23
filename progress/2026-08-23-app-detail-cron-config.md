# 应用详情页定时触发直接配置

日期：2026-08-23
状态：完成（实测通过，已提交）

## 需求

应用详情页「⏰ 定时」的「配置触发器」原本跳转工作流编辑器，用户认为不合理——
应在详情页内直接配置定时。

## 实现

### 后端

- `WorkflowDefinitionService.updateTriggers(id, triggers)`：仅更新触发器——
  不改图、不 +1 发布版本（与 publish 不同）；校验（V1 单 cron/表达式合法性）后
  落库并刷新调度状态（cron 立即生效/停用立即失效）
- `WorkflowDefinitionRepository.updateTriggersOnly(id, patch)`：内置定义（user_id=NULL
  全局共享行）允许更新触发器——定时是全局调度配置；其余字段仍禁改
  （普通 update 对内置保持禁改）。⚠️ 内置行 scoped 更新附加 user_id 条件命中 0 行
  → 用裸 repo.update（调用方先经 getById 确认可见性）
- IPC `wf:update-triggers`；preload `updateTriggers(id, triggers)`

### 前端（AppDetail.vue）

定时行改为行内直接配置：
- 预设下拉：不启用 / 每小时 / 每天 / 每周 / 每月 / 自定义
- 选预设自动填充表达式（如 每天 → `0 8 * * *`）并默认启用开关
- cron 表达式输入框（自定义时手输）+ 启用开关 + 保存按钮
- 保存：保留非 cron 触发器（事件/webhook）+ 更新 cron 触发器 → validateTriggers
  预校验 → updateTriggers；保存后显示下次触发时间（triggerPreview next5[0] 格式化）
- 进入页面时读取定义 triggers，反解预设还原当前状态

## 测试

- workflow-definition-triggers.spec（7 项）：更新成功（不 +1 版本）、单 cron 限制、
  表达式非法拒绝、定义不存在、调度钩子刷新、停用落库、内置定义允许更新
- workflow-definition.repository.spec 增补（2 项）：内置定义 updateTriggersOnly 生效
  （普通 update 仍禁改）、不存在返回 null
- 相关回归通过；无新增类型错误（基线 TS2307/既有行除外）

## 实测（CDP + UI）

- updateTriggers 保存 → getDefinition 读回 triggers 落库 ✓
- 非法表达式拒绝（Validation error）✓
- UI：选「每天」→ 表达式自动填充 + 启用开关自动开 → 保存 → 下次触发
  「8/24周一 08:00」→ 落库 enabled:true ✓；恢复关闭 ✓
