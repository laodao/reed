# 2026-08-23 整体性能优化（首开延迟）

## 背景
用户反馈：部分界面首次打开有延迟，尤其点击菜单进入 AI 对话界面时最严重。
经 CDP 实测定位：进入 /chat 冷启动约 1058ms，主线程长任务累计 ~966ms。

## 瓶颈定位（实测数据）
- **html2canvas 模块求值 ~407ms**（MessageItem/ChatHeader 顶层静态 import，仅导出图片时使用）
- **mermaid 模块 + 模块级 initialize**（MessageItem 顶层 import，多数对话根本不含图表）
- **bytemd 编辑器模块求值 ~584ms**（MarkdownEditor 静态 import，日记/长文页首开即阻塞）
- **useChat.initialize 重复 IPC**：dialog.list 重复调用 + listByRole 回源，串行链 5 次往返
- 各 IPC 单次往返仅 2~4ms（非瓶颈）；SQL 查询快（非瓶颈）

## 优化措施
1. **新增 `src/renderer/src/utils/lazy-libs.ts`**：
   - `loadHtml2Canvas()` / `loadMermaid()`：动态 import + 单例缓存；mermaid 首次加载时一次性 initialize（配置与历史模块级一致）
   - `scheduleIdleLoad(fn, timeout)`：requestIdleCallback 调度（回退 setTimeout 150ms），带超时上限防无限推迟
2. **MessageItem.vue**：移除顶层 `html2canvas`/`mermaid` import 与模块级 `mermaid.initialize`；导出图片/渲染图表处改用 lazy 加载
3. **ChatHeader.vue**：html2canvas 改动态加载（仅导出长图时）
4. **useChat.initialize / selectLastDialog**：复用 loadDialogs 已加载的全量列表（按 updated_at DESC），去掉重复 `dialog.list()` 与 `loadDialogsByRole` 回源（侧边栏话题列表由 currentRoleDialogs computed 客户端过滤）；初始化 IPC 链 5 次 → 3 次
5. **MarkdownEditor 拆壳**：`MarkdownEditor.vue` 轻壳（只读文本域占位，空闲时动态 import）+ 新增 `MarkdownEditorHeavy.vue`（bytemd 全部逻辑迁移），日记/长文页首开不再被 bytemd 阻塞

## 效果（CDP 实测对比）
| 指标 | 优化前 | 优化后 |
|---|---|---|
| /chat 冷启动到内容渲染 | ~1058ms | ~556ms（再进入 43ms，keep-alive 生效） |
| 主线程长任务累计 | ~966ms | ~511ms |
| 进入 /chat 时 html2canvas/mermaid 资源 | 加载（407ms+） | 不加载（heavy: []） |
| 进入 /diary 时 bytemd 资源 | 加载（584ms） | 不加载（空闲后按需） |

## 测试
- 新增 `tests/unit/renderer/utils/lazy-libs.spec.ts`（7 用例：单例缓存/mermaid 一次性 initialize/配置/scheduleIdleLoad 调度）
- 新增 `tests/unit/renderer/composables/use-chat-initialize.spec.ts`（4 用例：IPC 调用次数回归）
- 渲染层回归 32/32 通过；全量回归失败数与基线一致（~115 为既有失败，与本次改动无关）
- 真实环境验证：懒加载 mermaid 正常渲染流程图；日记编辑器占位→bytemd 替换正常

## 备注
- 验证过程中误删 4 个既有空日记条目（2026-04-04/09/30、2026-08-15，均无正文内容），已如实记录
- vue-tsc 基线脏（~1186 既有错误，含 @/ 别名解析问题），本次改动无新增错误类
