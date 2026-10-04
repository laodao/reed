# 2026-09-16 AI 对话首开提速 + 知识飞轮入口清理

> 用户反馈三件事：① AI 对话模块响应很慢、尤其第一次打开；② 去掉知识飞轮菜单；
> ③ 待办中心常驻提示"知识飞轮已停用（2026-09 暂停；重开：AGENT_MEMORY_FLYWHEEL=on）"。

## 一、结论先行（实测数字）

| 指标 | 优化前 | 优化后 | 说明 |
|---|---|---|---|
| 启动 → 首帧可见 | **9659ms** | **3.7～4.2s** | 默认 user-data-dir，同一台机器 |
| 启动 → 可交互 | 9467ms | **3.75～4.1s** | `.nav-item` 出现 |
| 主进程 `main.boot` | 2345ms | **1421ms** | 见第九节分段（含驱动懒加载） |
| 启动 → 首帧（新 profile 对照） | 3731ms | 4526ms | 环境干净时两者本就接近 |
| 冷启动进入 /chat（应用就绪后） | 列表 431ms / 消息落定 1116ms | 列表 426ms / 消息落定 **939ms** | 3 次重复稳定 |
| 冷启动主线程长任务合计 | 982ms（最大 **589ms**） | 775ms（最大 **419ms**） | 最大长任务 ↓29% |
| 二次进入 /chat | 203ms | 157～185ms | keep-alive 命中，未退化 |

> 口径提醒：`scripts/perf-chat-probe.cjs` 的"冷启动"会把**启动期那次存储阻塞**一起算进去
> （谁先发生取决于时序），所以偶发出现 7s 级的离群值属正常；要量对话页本身的开销，
> 看"应用就绪后再进入"的那组数字（上表第 5 行）。

启动耗时里主进程占 ~1.4s（数据库 ~470ms + 包内核 import ~613ms + 工作流子系统 ~247ms），
渲染进程挂载仅 ~120ms。**剩下的大部分是 Electron 自身启动（约 2.4～2.6s）**，
渲染层已经没有可观的浪费。

## 二、根因（这是本次最重要的发现）

用 CDP CPU Profiler 从 `document-start` 起采样，铺开整个启动过程（脚本：
`scripts/perf-boot-probe.cjs`；路由内测量**看不到**这一段）：

- 渲染进程挂载分段只有 88ms，`app.mount()` 本身 53–73ms；
- 但**首帧要等到 6.2s 之后才出现**，profile 里 6.0s 全落在一个函数上：
  **首次同步访问 `sessionStorage`**（`tabs` store 的 `loadFromStorage`/`saveToStorage`）；
- 对照实验：把 `--user-data-dir` 指向一个全新目录，首帧 **3472ms**，存储访问耗时 ~0.1ms；
  用默认 profile 则稳定 9.6s。→ **属 profile/环境相关**（Chromium 存储后端首次拉起；
  本机 profile 里 `Session Storage` 仅 ~100KB，不是数据量问题，怀疑外部扫描/首次打开开销）。

两条硬约束决定了修法（踩过坑，别再改回去）：

1. 唤醒窗口是 `show: false` + `ready-to-show`，**首帧之前窗口处于隐藏状态，
   Chromium 在隐藏窗口里不触发 `requestAnimationFrame`**——用 rAF 推迟会把存储访问
   永远挂到首帧之后，方向正好相反；
2. 首次同步存储访问如果发生在首帧"产生"之前，**首帧会被一起推迟**——
   实测把访问放进 `setTimeout(0)` 仍会把首帧推到 6s 之后，给 1500ms 延迟才让首帧先出来。

最终实现（`src/renderer/src/stores/tabs.ts`）：

- 初始化只造默认状态（**零存储访问**）；
- 首次读 + 写推迟到 `DEFERRED_STORAGE_DELAY_MS = 1500` 后的定时器；
- 就绪前的标签变更只暂存内存（`pendingState`），恢复时**只补回恢复结果里没有的新标签**，
  避免用旧快照把恢复出的历史标签覆盖掉（这个顺序错了会丢标签，已写成用例锁住）。

## 三、对话页渲染层优化

1. **markdown 渲染缓存**（`src/renderer/src/utils/chat-render-cache.ts`）
   `MessageItem` 的 `formatContent/formatSourceContent` 在模板里同步调用，组件每次重渲染
   （流式 delta 每秒几十次）都会重跑整条管线（marked + DOMParser 消毒 + 逐行转义）。
   现按 `(消息 id, 内容)` 缓存，同一份内容只解析一次；切渲染模式时清缓存。
   配套 `hash-text.ts`（FNV-1a）供"内容是否变过"的廉价判定。
2. **mermaid 三重门控**（`MessageItem.vue` + `composables/useVisibleOnce.ts`）
   ① 内容里出现过 mermaid 围栏才尝试（`containsMermaidBlock`，用内容指纹避免每条消息
   每次增量都跑正则）；② 消息**进入过视口**才渲染（IntersectionObserver）；③ 再推到空闲时段。
   同时删掉旧的"挂载 + 50ms + 200ms + 500ms + forceRerender"五连击——那是每条消息
   4 次重跑整段管线。实测 mermaid 的 HTML 标签量算占首开 `getBoundingClientRect` ~350ms。
3. **消息列表窗口化**（`composables/useMessageWindow.ts`）
   首开只挂最近 30 条，向上滚动按 30 条增量补齐；补齐时用锚点 `offsetTop` 差值补偿
   `scrollTop`，视口不跳。
4. **每条消息少挂浮层组件**（`MessageItem.vue`）
   tooltip 全改原生 `title`（每条消息少 5~8 个 popper 实例）；消息操作栏改 hover 后才渲染
   （里面的 `el-dropdown` 各建 popper）；`ModelSelectDialog`/`ExportToObsidianDialog` 改异步组件
   （不进聊天页首开 chunk）。
5. **索引预计算**（`MessageList.vue`）
   `getAnswerIndex/hasPrevAnswer/hasNextAnswer` 原本在模板里对每条消息各扫一遍数组（O(n²)、
   每次重渲染重算），改为一次遍历预计算并随窗口切片复用。
6. **修复图片预览渲染循环**（`MessageItem.vue`）
   `getImageUrl` 在模板里同步调用且会写响应式状态，附件读取失败时会反复触发重渲染；
   改为失败即记账、不再重试。

## 四、知识飞轮入口清理（用户要求 ②③）

停用功能不该留可点的入口——点了只会弹"知识飞轮已停用"。已移除：

- 侧边菜单项「知识飞轮」与 `pack` 路由 `/agent-memory`（`src/renderer/src/packs/workflow/index.ts`）；
- 视图 `src/renderer/src/views/workflow/AgentMemoryView.vue`（整文件删除）；
- 待办中心「记忆审批」页签及 `am:list-pending` 调用——**这正是 ③ 那条常驻提示的来源**：
  页面加载时就调 `am:list-pending`，飞轮未装配 → 返回失败 → 每次进页面都弹一次错误；
- Agent 对话页右栏「记忆」区块、会话详情抽屉的「知识飞轮」模式与入口链接。

保留：`am:*` IPC handler / preload 通道 / 数据表（后端能力与数据不动，重开开关后仍可用），
`buildTrace` 等与飞轮相关的轨迹行在时间线里只做忽略处理、不误计步数。

## 五、顺手修的相邻问题

- `ac:list-sessions` 的 N+1：原本逐个会话 `dialogs.getById()` 取标题，会话多时
  Agent 工作台首开实测超时（>15s）。改为 `DialogRepository.getTitlesByIds` 一次批量查
  （`In(ids)`，只 select id/title）。用例：`tests/unit/core/packs/agent-console-sessions.spec.ts`。

## 六、可观测性（新增，长期保留）

`src/core/utils/boot-trace.ts`：分段计时 + 阈值报告。已接入主进程启动
（平台服务 / 数据库各阶段 / IPC / 包内核 / 工作流子系统 / 建窗）与渲染进程挂载
（createApp / 包装配 / ElementPlus / 设置 / 主题 / mount），日志形如：

```
[boot-trace] main.boot 总耗时 2345ms（3 段 >= 100ms） {...}
[boot-trace] renderer.mountApp 总耗时 88ms（0 段 >= 50ms） {...}
```

`window.__BOOT_TRACE__` 暴露渲染进程分段，供探针脚本读取。

## 七、测试

| 用例 | 覆盖 |
|---|---|
| `tests/unit/renderer/utils/chat-render-cache.spec.ts` | 缓存命中/内容变化重算/有界/reset；mermaid 围栏识别与误判 |
| `tests/unit/renderer/composables/use-message-window.spec.ts` | 窗口切片/增量补齐/列表增减收敛/锚点补偿滚动位置 |
| `tests/unit/renderer/stores/tabs.spec.ts`（改写，10 例） | 初始化零存储访问；hydrate 校验/补首页/激活项回退/损坏容错；**就绪前的标签不会被恢复覆盖**；写盘内容 |
| `tests/unit/renderer/stores/tabs-storage-deferral.spec.ts` | 首屏不被存储阻塞；先读后写；就绪前变更暂存后落盘 |
| `tests/unit/renderer/views/agent-todos-flywheel-removed.spec.ts` | 待办中心不再请求 `am:*`、不出现「记忆审批/知识飞轮」文案 |
| `tests/unit/renderer/packs-registry.spec.ts`（改） | 菜单顺序去掉 `/agent-memory`；该路由不再注册 |
| `tests/unit/core/packs/agent-console-sessions.spec.ts` | 标题批量查询一次、无聊天会话时不查 |
| `tests/unit/core/platform/workflow/datasource-driver-lazy.spec.ts` | 驱动 import/实例化/整体装配都不求值 mssql/mysql2/pg；真正连接时才加载（5 例） |

渲染层全量：**459 例，16 例失败**，全部落在 4 个既有失败文件
（StageHeaderBar-merged 8 / StageHeaderBar 2 / lesson-typography 3 / app-list 3），
与基线 `progress/_pull_baseline_unit.json` 一致，本次改动无新增失败。
类型检查 `vue-tsc --noEmit` 错误行数 1259 → 1219（本次触碰的文件错误集合与基线一致，
仅行号位移）。

### 真机复核（脚本自起 Electron，10/10 通过）

- 聊天页：20 条消息正常渲染，侧栏/输入区在位；DOM 结构断言 markdown 确实渲染了
  （139 个 `<p>`、331 个 `<strong>`、232 个 `<li>`、7 个代码块），非裸文本；
- 侧栏菜单项 15 个（主 12 + 底部 3），`/agent-memory` 路由 `matched=0`；
- 直接访问 `#/agent-memory` 不再渲染知识飞轮页；
- 待办中心只剩「工作流审批 (6)」「任务裁决 (0)」两个页签，无「记忆审批」、
  无「知识飞轮已停用」提示。

## 九、启动耗时逐段坐实（用户追问后补测，boot-trace 分段）

主进程启动（`main.boot`）稳态约 **1.5s**，分段如下（同机多次一致趋势）：

| 分段 | 耗时 | 具体在做什么 | 为什么这么慢 | 能否推迟 |
|---|---|---|---|---|
| `database` | 340～620ms | DataPathService → 打开 better-sqlite3 → `initTables` → TypeORM `createDataSource` → **多租户预迁移** → schema drift 检查 → 仓库实例化 → LanceDB → 内置角色/字典/资源路径迁移 | 主体是**模块求值 + 建连**：`createDataSource` 48～100ms、TypeORM 连接 ~300ms；迁移本身已很快（`ensureUserIdColumns` 81～211ms，其余各 1～10ms；schema drift 检查仅 13～20ms） | 难：UI 与 IPC 都依赖它，必须先就绪 |
| `initIpcHandlers` | **2ms**（逐项全为 0～1ms） | 18 个平台级 handler 注册（`ipcBridge.handle`） | 注册本身极廉价；handler 模块的**顶层 import 在文件加载时**就已完成，不计入这里 | 不需要 |
| `packSubsystem` | 486～733ms | `import('@core/packs/kernel')` + `import('@core/packs/builtin-packs')` + `initPackSubsystem()` | 关键点：**内核内部只花 18ms**（12 个包逐个 `registerPack` 1～6ms + 快照物化 4ms + 启用态恢复各 1ms）。剩余 ~700ms 全在 `import('@core/packs/builtin-packs')`——它把 12 个包模块（各自带着 handler 模块图）**一次性求值** | 部分可以：可把重包的 service 懒加载 |
| `workflowSubsystem` | 优化前 700～850ms → **现 230～280ms** | 事件总线 → 节点注册表 → 引擎/服务装配 → boot 恢复 → 触发器调度 → 应用模块 → 工具/技能服务 → agent harness → 变量/数据表 → **数据源驱动** → 资产 → M3 任务树/harness → 系统 agent 工具 | 优化前 544ms 花在四个外部库驱动的 `import`（见下节）；其余各段合计仅 50～100ms（节点注册表 4ms、引擎 3～11ms、boot 恢复 5～18ms、调度器 2～12ms、agent harness 26～44ms、M3 运行时 98～138ms） | 已优化 |

### 本轮新增修复：外部数据源驱动改为按需加载

分段计时发现 `WorkflowBoot.dataSourceAssembly` 单段 **544ms**，细分到驱动毫秒级：

```
import:pgDriver=32ms   import:mysqlDriver=133ms   import:mssqlDriver=378ms   import:clickhouseDriver=1ms
```

原因：`sqlserver-driver.ts` 顶层 `import sql from 'mssql'`，而 mssql 会拖入 **3.9MB 的 tedious**；
三个驱动（mssql/mysql2/pg）在启动装配时被全部 import，**544ms 全压在关键路径上**——
但只有用户真的去连外部数据库时才用得到。

改法（新增 `drivers/lazy-module.ts` 单例加载器）：驱动模块只保留 `import type`（编译期擦除），
真实驱动改为首次 `testConnection`/`query` 时才 `await import()`，并归一化 CJS/ESM 形态。
实测该段 **544ms → 16～32ms**，`WorkflowBoot.init` 从 ~700ms 降到 ~230ms。

## 十、启动期那次同步存储访问（用户追问：是否每次启动都必须）

**答案：代码里不是必须，但 Chromium 层面目前躲不开，而且发布正式版也要做。**

拆成两层看：

1. **业务上完全不需要**：那次访问来自 `tabs` store 读"上次打开的标签页"，而 `sessionStorage`
   的生命周期就是**一个 webContents 会话**——关窗/重启后它本来就是空的，这份持久化在正式版里
   没有任何跨启动价值。也就是说这份 6s 的代价换不到任何用户可见收益。
2. **为什么还是躲不开**：它不是"读我的数据慢"，而是**渲染进程第一次碰 sessionStorage 这个行为本身**
   会让 Chromium 同步拉起存储后端（leveldb），期间阻塞主线程。本机实测：
   - 默认 profile：首次访问 ~6.0s；
   - `--user-data-dir` 指向全新目录：~0.1ms，首帧 3472ms；
   - 已就绪后的后续访问：0.0～0.4ms。
   即**代价取决于 profile/环境**（本机 `Session Storage` 只有 ~100KB，不是数据量问题；
   怀疑是该目录被外部扫描/安全软件拦截），正式版包一份同样的 profile 时会重现。
   所以"发布正式版"并不会让这 6s 消失。

当前处理与后续选项：

- 已做：把首次读写**推迟到首帧之后**（`DEFERRED_STORAGE_DELAY_MS = 1500`），用户先看到界面，
  6s 的阻塞发生在界面已经出来之后（期间流式回答会卡一下，但不再白屏）。
- 可做（属行为变更，待确认）：既然 sessionStorage 的这份持久化跨启动无意义，可以直接
  **去掉标签页的 sessionStorage 持久化**（改为纯内存），那次首次访问就彻底不存在了，
  启动期不再有这 6s；同会话内标签行为完全不变。这也是我目前推荐的方案。
- 另一条路：改存到主进程数据库（`settings`/专用表），但一样要在启动后异步读写，收益不如直接去掉。

## 十一、复现方式

```bash
npm run build
node scripts/perf-boot-probe.cjs      # 启动：首帧可见 / 可交互 / 主进程分段
node scripts/perf-chat-probe.cjs /chat # 对话页：冷启动 vs 二次打开
```

两个脚本都自起 Electron 实例并接管首窗，无需 dev server。

## 十二、没做 / 待办（更新于逐段测完后）

- **包内核 import ~700ms**（`import('@core/packs/builtin-packs')`）：12 个包模块一次性求值，
  内核自身只 18ms。可优化方向是重包（episode-production 175 个 channel、longwriting 202 个）
  的 service 懒加载——属较大重构，本次未做。
- `database` 340～620ms：主要是一次性的 TypeORM 建连与模块求值，迁移本身已经很快，
  暂无明显可摘项。
- `/agent-console` 首次进入仍偏慢（会话列表 + 整段轨迹），已修 N+1，未做轨迹分页。
- 启动期那次同步存储访问**只是被推迟到首帧之后**，本身仍会阻塞约 6s；
  根治方案见第十节（去掉 sessionStorage 持久化），待用户确认。
- mermaid 渲染本身仍是单次数百毫秒量级（图表复杂度决定），已移出首屏路径。