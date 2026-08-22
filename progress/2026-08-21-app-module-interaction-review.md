# 应用模块交互逻辑梳理（2026-08-21）

> 目的：梳理应用模块（应用/会话/分享/渠道）的交互路径与数据流，定位"乱"的根源，给出分级改进建议。

---

## 一、总体架构（一句话）

**应用 = 发布单元（与已发布工作流一对一，幂等创建 + 版本演进），四渠道分发（会话/分享/API/定时）；会话 = 应用内的对话流**（复用 dialogs/messages 表，双表同主键 + role_id 标记与对话页隔离）。

## 二、页面与路由

| 路由 | 页面 | 职责 | 入口 |
|------|------|------|------|
| `/apps` | AppList | 应用列表（分页/从工作流创建/删除） | 侧边菜单 |
| `/apps/:id` | AppDetail | 渠道开关/分享令牌/会话记录/开始会话/查看工作流 | AppList「详情」 |
| `/apps/:id/session` | AppSession | ⚠️ 无 sessionId 的"空会话页"——**疑似死路由**（AppDetail 新建会话跳的是带 id 路由） | 无入口 |
| `/apps/:id/session/:sessionId` | AppSession | 具体会话：卡片消息流/表单/审核/快速输入 | AppDetail 开始会话/会话记录 |
| `/app-share/:token` | WorkflowGuestRun | 应用分享（免登录） | AppDetail 复制链接 |
| `/workflow-run/:token` | WorkflowGuestRun | 工作流分享（免登录，旧） | 编辑器分享按钮 |

## 三、交互路径（正常流程）

```
创建：AppList「从工作流创建」→ 选已发布工作流 → createFromWorkflow（幂等/版本跟随）→ AppDetail
渠道：AppDetail「渠道」Tab：会话开关 / 分享开关+令牌生成·复制·停用 / API 开关（仅描述） / 定时（跳编辑器配触发器）
会话：AppDetail「开始会话」→ create → 跳 /apps/:id/session/:sessionId
  ├─ start-form 卡：填参数 → 运行（appSession.start）
  ├─ run-status / node-status 卡：进度
  ├─ review 卡：批准 / 取消 / 表单提交
  ├─ report / message 卡：结果（markdown 渲染）
  └─ 底部快速输入框：自由文本兜底（{quickInput: text}，与表单字段不对位）
  └─ 实时：订阅 wf:run-event 命中 last_run_id → 重拉消息
管理：AppDetail「会话记录」Tab：打开 / 重命名 / 删除（运行中拒绝）
分享：AppDetail 复制链接 → 免登录页填表单 → invoke → SSE 实时看节点状态
API：外部 POST /api/workflow/invoke/:definitionId（无 UI）
```

## 四、"乱"的根源（逐条定位）

1. **死路由 / 入口分散**：`/apps/:id/session`（无 sessionId）与带 id 路由共用同一组件，前者实际无入口（新建会话动作在 AppDetail，跳的是带 id 路由）——路由表存在语义混乱的"空壳"。
2. **分享双路由 + 组件复用**：`/app-share/:token` 与 `/workflow-run/:token` 指向**同一组件**；数据面统一走 `/api/workflow/share/:token`，后端 `resolveShare` **一个函数同时解析应用令牌与工作流令牌**（appMode 标志）。前端路径（app-share）与后端语义（share）错位，页面无法区分当前是"应用分享"还是"工作流分享"。
3. **会话与对话数据表混用**：应用会话复用 `dialogs`/`messages` 表（role_id 标记隔离对话页）。但会话页（卡片渲染）与对话页（纯文本）**同一数据表两套渲染**，且历史遗留无标记的孤儿 dialog 曾混入对话页（已修复）。架构上"共用表 + 隔离标记"维护成本高、边界脆弱。
4. **会话创建入口不直观**：新建会话按钮在 AppDetail（「开始会话」+ 会话记录 Tab 内），会话页内**没有**"新建会话"；且快速输入框与 start-form 卡并存，quickInput 键名与表单字段不对位——两种"运行"方式语义重复。
5. **四渠道交互方式不一**：会话/分享有开关与操作，API 渠道只有描述无反馈（也无 invoke URL 展示），定时渠道直接跳编辑器——渠道配置体验碎片化。
6. **分享链接的本机语义**：`AppDetail` 复制 `origin/#/app-share/token`——Electron 端 origin 是 dev server/file 地址，**本机打开无意义**（分享实际面向 Web 部署）；免登录页在 Electron 内也能导航到（后端 guest 白名单是 web 端概念）。
7. **卡片消息无角色区分**：会话消息流所有卡片（start-form/review/结果）都是"assistant"角色同侧渲染，无用户/助手气泡区分（表单卡、结果卡混排，视觉上难以快速定位"我填了什么/系统回了什么"）。

## 五、改进建议（分级）

**P0（体验，小改）**
1. 删除死路由 `/apps/:id/session`（或改为真正的"新建会话"页，二选一）
2. AppSession 页头部加「＋ 新建会话」入口（与 AppDetail 一致）
3. 快速输入框与表单统一：保留 start-form 卡为主交互，quickInput 移除或改为"仅无表单应用可见"

**P1（结构，中等）**
4. 分享路由/后端语义对齐：`resolveShare` 拆 `resolveAppShare` / `resolveWorkflowShare`，页面按来源展示不同品牌与说明
5. API 渠道补反馈：展示 invoke URL + 开关状态说明
6. 评估会话消息独立表（session_messages）与对话表解耦（消除 role_id 标记隔离的脆弱性）——大改需评估

**P2（产品）**
7. 分享链接在 Electron 端引导（提示复制到浏览器/Web 部署地址），或提供"复制分享链接"与"本机打开预览"两态
8. 会话消息流加用户/助手角色气泡区分（表单提交内容回显为"用户"侧）

---

## 结论

应用模块功能链路完整（创建→渠道→会话→分享→API），"乱"主要来自三处：
① 路由层存在死路由与双语义分享路径；
② 会话/对话共用数据表的架构边界；
③ 交互入口分散（会话创建、快速输入、渠道配置）。
P0 三项为纯前端小改，可快速收敛；P1 涉及后端语义与数据结构，建议按迭代评估。

---

## 重构实施记录（2026-08-21，用户确认 1/2/3 + P0/P1/P2）

| 项 | 内容 | 状态 |
|----|------|------|
| ① 应用卡片化 | AppList 表格 → 卡片网格（图标/名称/版本/会话数/渠道点/启用），内部滚动 + 底部固定分页 | ✅ |
| ② 卡片直接启动 | 卡片「▶ 启动」→ 创建会话并跳会话页（无需进详情）；未开会话渠道禁用并提示 | ✅ |
| ③ 发布入口迁移 | AppList「从工作流创建」移除；WorkflowEditor 新增「发布为应用」**配置对话框**（名称/图标/会话/分享/API 渠道开关）——发布即配置；再次发布幂等更新配置 | ✅ |
| P0 | 删死路由 `/apps/:id/session`；AppSession 页「＋新建会话」；快速输入仅对无表单应用显示 | ✅ |
| P1 | `resolveShare` 拆 `resolveAppShare`/`resolveWorkflowShare` + 响应带 `appMode`；分享页显示「应用分享/工作流分享」来源标签；AppDetail API 渠道展示可复制 invoke URL | ✅ |
| P2 | startRun 回显 user 消息（提交参数摘要，会话内「我」侧气泡）；分享链接复制提示面向 Web 部署 | ✅ |
| 专项 | 会话消息独立表解耦（架构重写，涉及事件桥/分享/迁移）——**列入后续专项**，本次未做 | 📋 |

**验证**：后端 tsc ✅ / 前端 vue-tsc ✅（仅预存 TS6305）；`scripts/e2e-app-refactor.cjs` 全过（发布配置创建/幂等更新/卡片启动/user 回显气泡）；
`app-list.spec.ts` 更新为卡片化测试（渲染/启动/未开渠道提示）。

**当前交互（重构后）**：
```
创建：工作流编辑器「发布为应用」（配置名称/图标/渠道）→ 应用列表
启动：应用列表卡片「▶ 启动」→ 直接进入会话
详情：卡片「详情」→ 渠道调整 / 会话记录 / API 地址
会话：会话页内「＋新建会话」；表单卡驱动运行；user 提交回显气泡
```
