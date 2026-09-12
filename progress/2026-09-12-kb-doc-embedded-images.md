# 文档内嵌图片：落到应用数据目录 + 正文只写相对路径（2026-09-12）

分支：`feat/kb-parse-chunking`

## 一、问题（用户反馈）

> 「上传文档中有图片的，图片应该放到 app 的数据目录下，而不是放到系统的 temp 目录下，而且应该只展示相对路径。」

实测确认：知识库里带图片的文档（深度学习 epub）内容中残留 **系统临时目录的绝对路径**，
而且临时目录早已被删除——引用全是死链，同时把本机绝对路径写进了知识库内容。

诊断（`progress/_diag_image_refs.cjs`，改造前）：

| 检查项 | 结果 |
|---|---|
| 含 `kb-epub-*` 临时目录引用的切片 / 章节 | **487 / 257** |
| 含 `AppData\Local\Temp` 的切片 / 章节 | 487 / 257 |
| 形如 `C:\Users\daoge\AppData\Local\Temp\kb-epub-C22NXz\OEBPS_Images_image00748.jpeg` | 是（临时目录已不存在） |

## 二、根因（两层，第二层是真正的坑）

**第一层（显而易见）**：`extractEpubMarkdown` / `extractMobiLikeText` 把解析器的 `resourceSaveDir`
指到 `os.tmpdir()` 的 `kb-epub-*`，解析完在 `finally` 里 `rm -rf`，于是正文里的图片引用指向已删除的临时目录。

**第二层（第一版修复踩到的坑）**：`@lingo-reader/epub-parser` 把 `resourceSaveDir` 当**临时工作区**——
`destroy()` 会把它解压出来的每个资源文件 `unlink` 掉（源码 `dist/index.node.js`：`savedResourcePath.forEach(... unlink)`，异步且吞错）。
所以「把 resourceSaveDir 直接指向应用数据目录」并不成立：图片会在解析返回后几秒内被解析器自己删光。

证据链（`progress/_watch_assets.cjs` + 服务内埋点）：

| 观测 | 结果 |
|---|---|
| 解析返回时磁盘文件数 | 1226（`[KB] 内嵌资源落盘`） |
| 解析后 5~15 秒（`syncChapters` 期间） | 1889 → **0**（watcher 实测） |
| 处理结束时 | `[KB] 内嵌资源校验: 0/1226 仍在磁盘` |
| 第一次修复（resourceSaveDir=数据目录） | 磁盘 0 个文件，DB 里却是相对路径 → **死链** |

## 三、修复方案

### 3.1 解析层（`src/core/utils/extract-text.ts`）

- 解析器的资源目录**始终用临时工作区**（`os.tmpdir()/kb-epub-*`），解析完照常清理。
- 新增 `persistLocalImages(markdown, { workspaceDir, targetDir, refPrefix })`：
  1. 收集正文**真正引用到**的工作区图片（去重）；
  2. 逐张 `copyFile` 到 `<dataPath>/knowledge-base/<kbId>/documents/assets/<docId>/`（目标目录自动创建、同名覆盖）；
  3. 引用改写为 `knowledge-base/<kbId>/documents/assets/<docId>/<文件名>`（dataPath 相对、正斜杠）；
  4. 复制失败的（源文件已被清理）**剔除引用**，宁缺勿留死链。
- 新增纯函数 `rewriteImageRefs(markdown, { resourceDir?, refPrefix? })` 与内部统一实现 `mapImageRefs`：
  - 远程/内联图片（`http(s):`/`data:`/`blob:`）原样保留；
  - 资源目录内的绝对路径 → 相对路径；
  - 其它本地绝对路径 / `file://` → 删除引用；
  - 本来就是相对路径 → 保留。
- 未提供 `resourceDir`（剧本导入等非知识库场景）时走 `rewriteImageRefs(md)` 只做清理，不落盘、不留绝对路径。

### 3.2 业务层（`knowledge-base.service.ts`）

- 每篇文档的资源目录：`<dataPath>/knowledge-base/<kbId>/documents/assets/<docId>/`（与文档本体同级）。
- 处理前清空该目录；处理完若为空（文档无图片）顺手删除，不留空目录。
- 删除文档时连同资源目录一起清理；删除知识库沿用整目录删除。
- 日志：`[KB] 内嵌资源落盘: N 个 → <相对路径>`（可直接核对）。
- 顺带修正：`uploadDocuments` / `addDocument` / `addWebpage` 入库的 `file_path` 现在**立即写 dataPath 相对路径**
  （此前存绝对路径、靠启动迁移 `asset-paths-to-relative` 事后改写；迁移只负责历史数据）；
  并修复 upsert 分支用相对路径 `writeFile`（会按进程 CWD 写到别处）的缺陷，改用 `resolveAssetPath`。

Web 端复用同一套核心逻辑（无新增 IPC/通道）：`toAssetUrl` 在 Electron 给 `local-image://`、Web 给 `/assets/...`，
相对路径两边都能解析。

## 四、验证

### 4.1 真实文档（深度学习 epub，重新处理）

| 指标 | 结果 |
|---|---|
| 图片落盘 | **1995 张 / 35.7 MB**，位于 `C:\Users\daoge\the-bot\knowledge-base\3dca5cae-…\documents\assets\5bf8f597-…` |
| DB 图片引用（去重） | **1995 条，100% 相对路径，0 条绝对路径，0 条远程** |
| 引用 → 文件存在性 | **缺失 0 条**（`progress/_verify_image_refs.cjs`） |
| 临时目录引用 | 切片 487 → **0**，章节 257 → **0** |
| `%TEMP%` 残留 `kb-epub-*` | 0（工作区照常清理） |
| 无图片文档 | 不产生 `assets` 目录（知识库下当前仅 1 个资源目录） |
| UI（CDP 实测 `progress/_verify_kb_image_path_ui.cjs`） | 切片内容显示 `![](knowledge-base/…/assets/…/OEBPS_Images_image00748.jpeg)`；不含 `Temp`、不含盘符绝对路径 |

### 4.2 单测

| 用例文件 | 新增/覆盖 |
|---|---|
| `tests/unit/core/utils/extract-text.spec.ts` | epub 提供 resourceDir：图片复制到目标目录、正文只写相对路径、**解析结束 600ms 后文件仍在**（这条正是第一版修复会失败的回归点）；不提供 resourceDir：不残留临时/绝对路径；`persistLocalImages` 4 条（去重复制、源文件缺失剔除引用、远程/相对保留、目标目录自动创建） |
| `tests/unit/core/utils/asset-path.spec.ts` | 补齐既有 `toRelativeAssetPath` / `resolveAssetPath` / `toAssetUrl` 的用例（入库转相对、读取解析绝对、往返一致） |

相关 5 个 spec / 66 条用例全部通过；`vue-tsc` 本次触碰文件 0 错误。

## 五、复现 / 回归命令

```powershell
# 单测
node scripts/vitest-electron.cjs run tests/unit/core/utils/extract-text.spec.ts tests/unit/core/utils/asset-path.spec.ts

# 真实文档验证（需 dev 实例 + CDP 9222）
node progress/_reprocess_and_show.cjs 5bf8f597-2042-4966-989e-ce6505851353
$env:ELECTRON_RUN_AS_NODE='1'; npx electron progress/_verify_image_refs.cjs   # 引用全部相对 + 文件齐全
node progress/_verify_kb_image_path_ui.cjs                                   # UI 只显示相对路径

# 根因复现（监视资源目录被解析器清空的过程）
node progress/_watch_assets.cjs "<assets 目录>" 170
```

## 六、遗留

1. **mobi / azw3 仍只取纯文本**（正文抽取阶段就丢弃图片，历史行为）；如需支持，按同一模式（工作区 → 复制引用到的图片 → 相对路径）扩展即可。
2. **前端未渲染图片**：按用户要求当前只展示相对路径；渲染可在切片查看/对话引用处用 `src/renderer/src/utils/asset-url.ts` 的 `toImageUrl()` 把相对路径转成 `local-image://`（Web 为 `/assets/...`）。
3. **历史死链数据**：临时目录里的图片已被删除、无法恢复，处理方式为「重新处理该文档」；
   知识库 UI 已有单文档「重新处理」入口（本次已对深度学习 epub 执行）。
4. 图片按原样保存（未做压缩/缩略图）：该书 1995 张 35.7 MB；若后续文档图片量更大，可加「超限压缩」策略。
