# 领域学习「知识点正文导出」报 An object could not be cloned —— 根因与修复

日期：2026-09-15
类型：缺陷修复（TDD，含真机 CDP 复现/复验）
用户原话：「领域学习模块，知识点正文的导出功能报错：An object could not be cloned.」

## 一、根因（一句话）

导出下拉用 `el-dropdown`，其 `command` 事件的**真实签名是 3 个参数**：

```js
// element-plus（node_modules/.vite/deps/element-plus.js，dropdown-item）
elDropdown.commandHandler(props.command, _instance, e)
//                          ↑ 格式      ↑ ElDropdownItem 组件实例  ↑ 原生事件
```

而视图里写的是：

```vue
<el-dropdown @command="handleExportLesson">        <!-- 旧写法 -->
async function handleExportLesson(format, cardId)  // 第 2 个形参收到的是「组件实例」
```

于是 `cardId` = **Vue 组件实例**（含 `uid/vnode/type/parent/appContext/root/next/subTree` 与函数、循环引用），
一路透传到 `ipcRenderer.invoke('dl:export-lesson', { …, cardId })`——
结构化克隆（V8 serializer）**克隆不了 Proxy/含函数的对象**，直接抛
`An object could not be cloned.`，导出 100% 失败（与知识点、格式、版本都无关）。

这也解释了为什么"只有导出炸"：

| 路径 | cardId 实参 | 结果 |
| --- | --- | --- |
| 导出下拉（md/pdf/长图） | 组件实例 | ❌ 必炸 |
| 版本抽屉「导出该版」 | `v.cardId`（字符串） | ✅ 正常 |
| 直连 IPC / 其它 dl 通道 | `null` / 字符串 | ✅ 正常 |

## 二、真机证据链（CDP 连运行中的 dev 实例）

1. 控制台历史（带时间戳）：失败发生在 09:47:17 / 09:47:35，栈顶为
   `Proxy.exportLessonOf (stores/domain-learning.ts:334:25)` ← 即 `await a.exportLesson(...)` 那一行，
   调用链 `handleExportLesson ← emit('command') ← ElDropdown.commandHandler`——坐实是 UI 下拉路径。
2. 直连 IPC（`window.electronAPI.domainLearning.exportLesson({…, cardId: null})`）：md/pdf/image 全部成功
   （9718 字符 / 594KB / 6MB）——排除后端与渲染管线。
3. 在 store 出站口装探针后**真点 UI**「导出 → Markdown」，捕获到的实参：

```
spaceId   : string
conceptId : string
format    : string 'md'
cardId    : object  keys = uid,vnode,type,parent,appContext,root,next,subTree
structuredClone(input) → FAIL: …function _sfc_render7(…)… could not be cloned.
```

## 三、修复（三层，规则单一来源）

| 位置 | 改动 |
| --- | --- |
| `src/shared/types/domain-learning.types.ts` | 新增运行时白名单 `DL_LESSON_EXPORT_FORMATS`（与 `DlLessonExportFormat` 同源） |
| `src/shared/utils/domain-learning-lesson-export.ts`（新增） | 纯守卫：`parseLessonExportFormat`（白名单，未知格式拒绝）+ `normalizeLessonCardId`（只认非空字符串，其余归 `null`=当前版） |
| `DomainLearningSpace.vue` | ① 模板改绑 `@command="onExportCommand"`；② `onExportCommand(command: unknown)` **只声明一个形参**（Element Plus 第 2 参不再有机会进来）；③ `handleExportLesson(format, cardId?: unknown)` 全程走守卫；④ 形参类型改用 shared `DlLessonExportFormat` |
| `stores/domain-learning.ts` | `exportLessonOf` 出站守卫：格式白名单校验（非法即拒绝、不发 IPC、给出可读错误）、`spaceId/conceptId` 必须是字符串、`cardId` 归一；**并在入口复位 `error`**（原先失败文案会残留，UI 会把旧错误当成新失败提示） |
| `core/packs/domain-learning/handlers/domain-learning.handler.ts` | `dl:export-lesson` 入站守卫：复用同一份纯规则（格式白名单 + cardId 归一），脏载荷在进入渲染管线前就被拒 |
| `services/dl-lesson-export.service.ts` | 顺带修掉本特性既有的 2 处类型错误：平台渲染器产出显式收窄为 `'pdf'|'image'|'html'`（原先把 `DocumentOutputFormat` 的 `'docx'` 带进了导出结果契约） |

## 四、测试（先红后绿）

新增/扩展：

| 文件 | 用例 |
| --- | --- |
| `tests/unit/shared/domain-learning-lesson-export.spec.ts`（新增） | 7 例：格式白名单（含 `'MD'`/`'docx'`/组件实例一律拒）、cardId 归一（字符串保留、组件实例/数字/空串→null）、**回归钉子**（按守卫组装的 IPC 载荷可克隆）+ 反证（组件实例本身确实克隆不了） |
| `tests/unit/renderer/domain-learning/store-ipc-payload.spec.ts`（扩展） | +5 例：组件实例当 cardId → 出站归一为 null 且导出真的送达、字符串 cardId 原样透传、非法格式不发 IPC、缺知识点标识报错、成功后 `error` 复位 |
| `tests/unit/renderer/domain-learning/lesson-export-command.spec.ts`（新增） | 4 例源码契约：下拉必须绑单参 `onExportCommand`、`onExportCommand` 形参恰好 1 个、版本抽屉仍传 `v.cardId`、`handleExportLesson` 走守卫 |

结果：

- 相关套件（`tests/unit/core/packs/domain-learning` + 上述 3 个）**26 文件 / 259 例全绿**；
- `npx vue-tsc --noEmit`：改动文件 **0 报错**，全仓错误行 1214 → 1210（收窄掉的正是本特性那 2 条）；
- **真机复验**（整页 reload 后，pinia store 不会随 HMR 重建，必须刷新）：
  - 真点「导出 → Markdown」捕获到的 `cardId` = `null`、`structuredClone` = OK；
  - 老故障载荷（组件实例当 cardId）走 store + 真 IPC → 成功导出（9718 字符），`store.error` = null；
  - md / pdf / image 三格式直连 IPC 全部成功；指定 `cardId`（版本抽屉路径）导出该版正常；
  - 复验后控制台无任何新增错误（只剩 vite 连接与 mermaid 语言警告）。

配套脚本（真机复现/复验，留在 `progress/`）：

- `_dl_export_probe6.cjs`：真点下拉并捕获 store 出站实参（根因取证）
- `_dl_export_probe3.cjs`：控制台历史（带时间戳，用于区分"旧错误 vs 新错误"）
- `_dl_export_verify2.cjs`：整页 reload + 全路径复验

## 五、注意事项 / 遗留

1. **主进程进度**：本机 dev 实例的 `out/main/index.js` 仍是 09:33 构建（该实例的 electron-vite 未重建主进程，
   我的 handler 入参守卫**尚未跑在运行中的主进程里**）。渲染端修复已真机验证、导出现在可用；
   **重启 `npm run dev` 后**主进程入站守卫一并生效。守卫本身已被纯函数单测覆盖。
2. **原生保存对话框那一步**未在自动化里点过（`saveBlobAs` → `dialog.showSaveDialog` 是既有基础设施，
   会弹系统窗口）；建议你点一次真实导出确认落盘。
3. **同类缺陷筛查**：全仓 21 处 `@command=` 处理器逐一核对——其余 20 处要么只声明一个形参，
   要么用 `@command="handler($event, row)"` 显式传参，**未受同一缺陷影响**；仅本处导出下拉中招。
4. **既有、与本次无关的失败**（未动，登记备查）：
   - `tests/unit/renderer/domain-learning/lesson-typography.spec.ts` 3 例（`lesson-markdown.scss` 缺
     `th,td` / `ul,ol` / `h1,h2` 选择器块，该 scss 与 `MarkdownViewer.vue` 本次未改）；
   - `tests/unit/packs/workflow-pack.spec.ts` 1 例（workflow manifest 前缀集合缺 `ac:`，实际 handler 已注册 `ac:`）；
   - `src/core/packs/domain-learning/services/dl-concept-audit.service.ts` 2 处类型错误
     （`ICoreDatabaseManager` 未声明 `dlConceptLogs`）。
5. `scripts/cdp-test.cjs` / `cdp-test2.cjs` / `cdp-test3.cjs` / `test-export-clone.{cjs,ts}` 是上一轮排查留下的
   未跟踪调试脚本（不在本次改动内），按本仓惯例这类脚本宜收进 `progress/_*.cjs` 或删除。

## 六、状态

缺陷已修复：**根因定位 → 三层守卫 → 单测钉子 → 真机复验**闭环完成，可进入用户验收
（重启 dev 后主进程守卫生效；点一次真实导出确认落盘即可）。

> 后续（同日）：用户验收时发现「导出 PDF 里 graph TD 没渲染成图」——那是另一处根因
> （应用 CSP 装在 session 上，连带拦掉隐藏渲染窗口的内联脚本/内联字体，导致 mermaid 静默不渲染），
> 修复记录见 `progress/2026-09-15-domain-learning-export-mermaid-csp-fix.md`。
