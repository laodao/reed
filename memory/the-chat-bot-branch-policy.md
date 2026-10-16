---
name: the-chat-bot-branch-policy
description: the-chat-bot 分支定位与 dev→the-chat-bot 同步纪律（features.config.json 功能开关门控）
metadata:
  type: project
---

用户决策（2026-10-15，同日两次迭代）：**the-chat-bot 分支是独立的「对话机器人」产品发布分支，不是开发分支**。日常开发继续在 dev；同步方式 = `git merge dev` + 核对 features 配置。

**核心机制（2026-10-15 晚第二次迭代确立）：功能开关取代删代码。**
`features.config.json`（仓库根，单一事实源）按模块裁决启停：禁用模块不注册包（无 handler/路由/菜单）、参数设置隐藏对应 Tab、界面入口（Home 应用区/发布为应用/节点目录条目）自动消失。**本分支相对 dev 的唯一维护点就是这个配置文件**（preload 与 web channel-map 已恢复 dev 全量版，任何开关翻转无需额外同步）。

**the-chat-bot 当前启用的模块**：chat、knowledge-base（kb-brain 大脑流水线默认关闭）、workflow（含 Agent 任务树/控制台）、diary、capability（图像生成/文档翻译/语音助手）、asset-center（资产管理，2026-10-16 用户决策纳入）。
**禁用**：app、portrait、longwriting、episode-production、voice-design、skills、domain-learning、info-collection、podcast-video。

**Why:** 此前按「删代码」裁剪，每次从 dev 同步都要重新删一遍，难以维护；改用开关后同步 = merge，产品形态零代码改动。

**How to apply:**
- 同步流程：在 the-chat-bot worktree `git merge dev`；冲突一律取 dev 侧（保留完整代码，开关负责裁剪）；合并后核对 features.config.json 仍是本分支形态
- 新增「模块」时：在 features.config.json 登记 id；新包在 core builtin-packs 的 loadBuiltinPacks / renderer PACK_LOADERS 各加一行（带模块 id）；其参数登记表标注 feature 字段
- **不要**再从本分支删除禁用模块的代码；dev 侧新代码引用禁用模块时，用 isModuleEnabled 门控（参照 web /api/agents、Home 应用区的写法）
- 每次同步后验证：`npm run build` ✓ → 启动 → 首页无禁用模块残留、参数设置 Tab 正常、`providerConfig.list`/`voice.getProviders`/`workflow.listDefinitions` 响应正常（CDP 冒烟脚本 /tmp/chatbot-*.cjs 可复用）
- 知识：模型下拉为空通常是 profile 没配 provider（isolated userData 是全新库），不是代码问题
