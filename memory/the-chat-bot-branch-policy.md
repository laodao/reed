---
name: the-chat-bot-branch-policy
description: the-chat-bot 分支定位与 dev→the-chat-bot 模块白名单同步纪律（2026-10-15 建立）
metadata:
  type: project
---

用户决策（2026-10-15）：**the-chat-bot 分支是独立的「对话机器人」产品发布分支，不是开发分支**。日常开发继续在 dev；只把指定模块的代码从 dev **定期同步**到 the-chat-bot。

**模块白名单**（同步时只带这些）：
- 基础设施：src/core/platform（providers/agent-runtime/workflow 引擎/services/settings/aihub）、src/core/database、src/core/packs 内核（kernel/registry/pack.service/ipc-guard）、src/electron、src/preload、src/web、src/shared、构建配置
- chat、知识库（knowledge-base）、工作流（workflow，含 Agent 任务树/控制台 at:/am:/ac:）
- 能力工具（renderer/core 的 capability 相关 + 平台级 image:/translation:/voice: handler）
- 日记（diary）、设置（壳 Settings）

**同步时不要带**：
- 其他功能模块：人像设计/长文写作/剧集制作/应用(app 包)/资产中心/领域学习/信息搜集/声音设计/技能库/播客视频（含各包的 core handlers、renderer 视图组件 store、preload 命名空间、web channel-map 条目、shared 工作流节点类型 chapter-writing/volume-design/video-gen/video-compose/video-preset/slide-render/podcast-compose）
- docs/ 目录
- 各类输出目录：outputs/ progress/ _bmad-output/ playwright-report-web/ test-results/ 等

**Why:** the-chat-bot 是精简的对话机器人产品形态（裁剪基线 commit 4af70a0b）；同步进未列明模块会破坏其产品边界，且双端装配（builtinPacks/packs/index.ts、preload、channel-map）必须与模块集一致才能编译运行。

**How to apply:**
- 每次同步后必须验证：`npm run build`、`npm run web:client:build` 通过；`vue-tsc` 无新增错误；`npm run test:unit` 无新增失败（对照当次同步前的失败清单）
- 同步按模块白名单逐个合入，不做整分支 merge；合入后若 dev 侧改动了已删模块的公共装配点（builtin-packs.ts、renderer packs/index.ts、workflow-boot、channel-map），需按 the-chat-bot 的裁剪口径重做对应删减
- 工作流表单的资产/技能选择器依赖已删包的 IPC 通道，运行时降级为空列表——这是裁剪后的预期行为，不要当作 bug 修复而把包加回来
