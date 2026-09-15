# 领域学习「导出 PDF 里 graph TD 没渲染成图」—— 根因与修复（CSP 拦截隐藏渲染窗口）

日期：2026-09-15
类型：缺陷修复（真机 CDP 定位 + 独立 Electron 进程端到端 A/B 复验）
用户原话：「导出的pdf中，graph TD没有渲染成图」
关联：`progress/2026-09-15-domain-learning-lesson-export-clone-fix.md`（同一天上一个导出缺陷）

## 一、现象与定位（证据链）

| # | 观察 | 结论 |
| --- | --- | --- |
| 1 | 真库讲义正文确实是规范围栏：` ```mermaid\ngraph TD … ` | 不是"模型没写围栏" |
| 2 | 导出 HTML 侧完全正确：`<div class="mermaid">` 容器在、mermaid 运行库内联（3.16MB）、就绪标志 `__docRenderDone` 在；但现导 PDF 抽文本里是 `graph TD A[金融资产] --> B[…]` **源码** | HTML 生成没问题，问题在"页面里脚本没跑" |
| 3 | 用同一份 HTML 在**独立 Electron 隐藏窗口**（同 webPreferences）加载 → `mermaidGlobal: object`、1 容器 / 1 SVG，渲染正常 | 不是库/HTML/隐藏窗口本身的问题 |
| 4 | 轮询 CDP 目标列表**接入应用自己的隐藏渲染窗口**（导出进行中）→ `mermaidGlobal: undefined`、`svgs: 0`、`__docRenderDone: undefined`（3 个 script 标签都在，但都没执行） | 页面里的内联脚本被"环境"拦了 |
| 5 | 复刻应用的 CSP（装在默认 session 上）做 A/B：默认 session 窗口 → 控制台 `Refused to execute inline script … "script-src 'self' 'wasm-unsafe-eval'"`；同时暴露出 `Refused to load the font 'data:font/woff2;base64,…'`（`font-src` 缺省回落 `default-src 'self'`） | **根因坐实：CSP 装在 session 上，连带拦掉了隐藏渲染窗口的内联脚本与内联字体** |

**因果链**：CSP 是 `session.webRequest.onHeadersReceived` 装的 → 作用于该 session 的**所有 WebContents**（含 `electron-document-renderer` 的隐藏窗口、日记导出窗口）→ 内联脚本被拒 → mermaid 不执行、`window.__docRenderDone` 不存在 → 渲染器的就绪探针把它当"老页面"（注释里写的零等待分支）**立即放行** → 直接 `printToPDF`/`capturePage`，产物里只剩 `graph TD` 源码。整个过程**没有任何报错**，是静默降级。

顺带发现：KaTeX 公式的中文字体不走内联字体、英文/符号走 `data:font/woff2` 内联 —— 后者同样被这条 CSP 拒掉，公式排版实际已在降级（同一根因的第二个症状）。

## 二、修复

| 位置 | 改动 |
| --- | --- |
| `src/electron/platform/app-csp.ts`（新增） | CSP 策略单一来源：`APP_UI_CSP`（与原策略逐字一致，不放宽）+ `DOCUMENT_RENDER_CSP`（文档渲染窗口：放行**内联脚本/样式**与 **data: 字体**，但保持 `default-src 'none'` + `connect-src 'none'`，讲义正文来自模型，不许联网外发/加载外部资源）+ `cspForRequest(details, appWebContentsId)` 按 WebContents 分流（拿不到 id 时保守按应用界面处理） |
| `src/electron/index.ts` | `onHeadersReceived` 改为 `[cspForRequest(details, mainWindow?.webContents.id)]`，并写明"为什么必须分流" |
| `src/electron/platform/electron-document-renderer.ts` | 打印/截图前统一 `prepareForCapture()`：等就绪标志后，**再数一遍还有多少 `.mermaid` 容器没出 `<svg>`**，>0 就 `logger.warn`（同类静默降级以后会在日志里现形，而不是"图悄悄没了"） |
| `tests/unit/core/platform/services/document-templates.spec.ts` | 顺带修红：模板注册表清单补上 `ecommerceSellpoint`（HEAD 起就缺）与 `learningLesson`，计数 14 → 16（该用例本就是"新增模板必须同步"的护栏） |

## 三、测试与真机级复验

新增测试（先红后绿）：

| 文件 | 用例 |
| --- | --- |
| `tests/unit/electron/app-csp.spec.ts` | 6 例：主窗口→严格策略、其它 WebContents→渲染策略、拿不到 id 时保守；两条策略的关键指令（应用界面不得含 `unsafe-inline`、渲染策略**必须**放行内联脚本与 `font-src data:`、仍禁止 `http(s):` 与联网） |
| `tests/unit/core/platform/services/document-tools-selfcontained.spec.ts` | 3 例：讲义 HTML 自包含契约（`<div class="mermaid">` + 无 language-mermaid 代码块 + 内联运行脚本/就绪标志 + 无外链 script）、KaTeX HTML 与 `data:font/woff2` 内联、并落盘小样本给隐藏窗口端到端脚本 |

端到端复验 `progress/_mermaid_renderer_e2e.cjs`（在**独立 Electron 进程**里用**真实** `ElectronDocumentRenderer` 类 + **真实** `cspForRequest` 策略渲染）：

```
新策略   : PDF 文本 "graph TD" = false（图已渲染）；无告警
--old-csp: PDF 文本 "graph TD" = true （复现用户现象）；并打出告警
           [document-render] 仍有 1 个 mermaid 容器没渲染出图（内联脚本被 CSP 拦截或 mermaid 渲染失败）——本次产物会缺图
```

产物（可直接肉眼对比）：

- `progress/_e2e_mermaid.png`（修复后：画出了流程图）
- `progress/_e2e_mermaid_oldcsp.png`（修复前：`graph TD …` 源码文本）
- `progress/_e2e_lesson.pdf` / `_e2e_lesson_oldcsp.pdf`（配套 PDF，可用 `progress/_dl_pdf_text.cjs` 抽查文本）

回归：`tests/unit/{electron,core/platform/services,core/packs/domain-learning,renderer/domain-learning,shared,packs}` —— 修复前红着的 `document-templates.spec.ts` 已转绿；剩余失败均为**既有、与本次无关**（postgres 变体两处需真 PG、`lesson-typography.spec.ts` 3 例 scss 选择器缺失、`workflow-pack.spec.ts` 1 例 manifest 前缀缺 `ac:`）。`vue-tsc` 改动文件 0 报错。

## 四、重启 PC 端后的真机验收（并从验收里又抓出一个缺陷）

按用户要求重启 PC 端（`npx electron-vite dev -- --remote-debugging-port=9223`）后，在**运行中的应用**里
直接调 `dl:export-lesson` 导出真实讲义并检查产物：

| 格式 | 结果 |
| --- | --- |
| md | ✅ 9718 字符 |
| pdf | ✅ 457,206 字节；抽文本 **`graph TD` 已消失**，节点标签（原生资产/衍生品/股权…）都在 → 图真的渲染出来了 |
| 长图 png | ⚠️ 第一次导出**空产物**（见下），修复后 ✅ 4.47MB 有效 PNG |

主进程日志中**没有**出现「仍有 N 个 mermaid 容器没渲染出图」告警 → CSP 分流修复在真机生效。
（产物留档：`progress/_accept_lesson.pdf` / `_accept_lesson.png`，可用 `_dl_pdf_text.cjs` 抽查文本。）

### 4.1 顺带修掉：长图导出的空图（首帧未合成）

验收时发现：**应用启动后的第一次长图导出**拿到的是空 base64 → 前端只能提示"导出产物异常"；
紧接着再导一次就正常（`capturePage()` 对隐藏窗口首帧返回空 NativeImage）。连测 3 次复现规律：
第 1 次空、第 2/3 次正常。

修复（`electron-document-renderer.ts` 新增 `captureLongImage()`）：按「催重绘重试 ×3 → 屏幕外
`showInactive()` 强拍 → 仍为空则**明确抛错**」逐级兜底，绝不把空产物交给上层。重启后实测日志：

```
[document-render] 第 1 次截图得到空图（隐藏窗口首帧未合成？）——催一次重绘再试
[document-render] 第 2 次截图得到空图（隐藏窗口首帧未合成？）——催一次重绘再试
[document-render] 第 3 次截图得到空图（隐藏窗口首帧未合成？）——催一次重绘再试
[document-render] 空图兜底生效：离屏显示后截图成功
```

即：本例里 `invalidate()` 重试并不能救回首帧，**真正生效的是离屏显示兜底**——没有这层兜底，
用户每次重启应用后的第一次长图导出都会拿到空产物。

## 五、注意事项

1. **重启 `npm run dev` 才生效**：本修复在主进程（`src/electron/**`）。⚠️ 本机实测：这个 dev 进程
   **不会**热重建主进程（改了 `src/electron/**` 后 `out/main/index.js` 时间戳不变，需要重启才生效），
   所以主进程改动一律按"重启后再验"处理。本次已重启并完成真机验收（见第四节）。
2. **同类窗口**：日记导出（`diary-export.service.ts`）同样是自己开隐藏窗口打印本地 HTML，走的是同一条 CSP 分流（现在自动拿到渲染策略），无需单独改；将来若新增渲染窗口且需要更严的策略，在 `cspForRequest` 里按 WebContents 细分即可。
3. **诊断资产**：`progress/_dl_render_window_probe.cjs`（导出进行中接入应用隐藏窗口，看 `mermaidGlobal/svgs/__docRenderDone`）是这次定位的关键工具；`progress/_dl_image_meta.cjs`（只取长图元信息，不把 base64 拉过 CDP）、`progress/_dl_export_accept.cjs`（真机三格式导出落盘）留档备用。
4. 上一轮"导出可用"的真机复验只走了 store→IPC→返回值，**没有校验产物内容**，所以没暴露这个问题——教训：导出类修复要连产物文本/图像一起验。
5. `progress/_dev_restart.log` / `_dev_restart2.log` 是本次重启的 dev 端日志（含主进程输出），排查用。
