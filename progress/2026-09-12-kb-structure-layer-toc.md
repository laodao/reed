# 知识库章节结构：改走「文档结构层」权威目录（2026-09-12）

分支：`feat/kb-parse-chunking`

## 一、问题（用户反馈）

> 「提取章节和摘要这个功能效果不太好。深度学习知识库中这本书是有完整的章节大纲的，但是没有提取到。numpy-user.pdf 也是有章节大纲的。」
> 「epub 如果能够解析，就不用先转为 markdown，转 markdown 是否导致了大纲信息丢失？」

结论：用户的判断成立。**把富文档转成 Markdown 会丢掉结构层信息**，而章节树此前完全建立在「转出来的 Markdown 标题」上，
于是大纲越完整的文档，损失越明显（标题不是 `<h1>` 的书几乎只剩书名）。

## 二、诊断数据（先量化，再动手）

| 文档 | 结构层（权威） | 转换后 Markdown 里的标题 | 结果 |
|---|---|---|---|
| 深度学习（epub，Z-Library 版） | 容器目录 **363** 条（书名页/版权页/译者序/数学符号/第1章/1.1/1.2.1…） | **1** 个标题（只有书名，章节标题不是 `<h1>`） | 章节树 0 条 |
| numpy-user.pdf（721 页 Sphinx 手册） | PDF 书签 `/Outlines` **2137** 条、6 层、全部带目标页 | 版面启发式推出 3739 个标题行，但**层级错位、顺序错乱** | 章节树 1012 条且父级错乱（`1.1` 挂在书名下、`WHAT IS NUMPY?`/`NumPy User Guide` 被当 H1） |

修复前 numpy 实测章节树片段（错误）：

```
- [L1] NumPy User Guide
  - [L3] WHAT IS NUMPY?
  - [L2] 1.1 Why is NumPy fast?     ← 父级应是「1. What is NumPy?」
- [L1] 1. What is NumPy?           ← 出现在子节点之后，顺序错乱
```

## 三、修复方案（与既有 epub 方案对齐：结构来自元数据层，正文来自正文层）

### 3.1 EPUB（此前已在工作区，本次随批提交）

`extractEpubMarkdown`：容器目录（NCX / EPUB3 `nav`）→ 目录项标题 + 嵌套层级 → 按 `href#anchor` 在 xhtml 内切分正文 → 拼权威 Markdown。
层级优先用标题编号推导（`第N章`/`1.1`/`1.2.1` → `inferHeadingLevel`），扁平 NCX 也能还原真实层级。
目录为空或章节正文全空 → 抛错并回退 anydoc 整本 Markdown。

### 3.2 PDF（本次新增）

新增 `src/core/utils/pdf-outline.ts`：

| 函数 | 职责 |
|---|---|
| `readPdfOutline(buffer)` | 用 `pdfjs-dist`（legacy/CJS 构建）读 `/Outlines` 书签树：标题 + 嵌套深度 + 目标页（0 基）。无书签/解析失败返回 `[]`（不抛错） |
| `resolveOutlineLevels(entries)` | 层级：书签有真实嵌套（>1 层）时以嵌套深度为准；扁平书签才用标题编号推导（同 epub 策略）。避免附录里 `1.1 Baseline` 这类编号把深层小节抬成二级 |
| `mergeOutlineIntoMarkdown(pages, outline)` | 以大纲为骨架重排逐页 Markdown：正文里原有标题全部降级为普通段落；逐条在**该条目标页**起查找标题文本（空白折叠 + 大小写不敏感，命中即消费该文本），未命中则按目标页位置插入标题（结构与内容都不丢）；首个标题之前的封面/目录页原样保留 |

接入点 `src/core/utils/extract-text.ts` 的 pdf 分支：

```
classifyPdf（扫描版/图片版直接报错）
  → 书签条目 ≥ 3：extractPagesMarkdown + readPdfOutline → mergeOutlineIntoMarkdown → 后处理
  → 否则回退：processPdf 整本 Markdown + 标题归一化（原行为）
```

- 阈值 3：打印/合并工具产生的占位书签（1~2 条）不足以代表全篇结构，仍走版面推断。
- 不再对大纲路径做「标题归一化 / H4+ 降级」——深层小节是真实结构（numpy 有 L5/L6）。
- 依赖：`pdfjs-dist@3.11.174`（纯 JS，Electron 主进程与 Web 服务端同一份代码可用；
  `require('pdfjs-dist/legacy/build/pdf.js')`，pdf.js 明确拒收 Node `Buffer`，故复制为纯 `Uint8Array`）。

## 四、验证证据

### 4.1 单测（新增 20 条）

| 用例文件 | 条数 | 覆盖 |
|---|---|---|
| `tests/unit/core/utils/pdf-outline.spec.ts` | 14 | 层级推导三态、正文切分、大小写/换行匹配、目标页限定（目录页同名标题不误取）、未命中兜底、非大纲标题降级、同名重复标题顺序匹配、空大纲、**页码有空洞**、**目标页越界**、**真实 PDF 读大纲**（运行时生成的书签夹具） |
| `tests/unit/core/utils/extract-text.spec.ts` | +1 | pdf 分支整体走通（标题来自书签、正文不丢） |
| `tests/unit/core/platform/services/kb-chapter-summary.service.spec.ts` | +1 | 成本护栏 `maxSummaries` 的取舍顺序与 `remaining` |

夹具：`tests/unit/core/utils/fixtures/minipdf-outline.builder.ts` 在测试运行时生成 3 页 / 4 条 2 层书签的 PDF
（pdf-lib 等库不支持写书签，故按 PDF 1.4 语法手写对象 + 自动算 xref 偏移），**非手工伪造**。
不把 `.pdf` 入库的原因：本项目 `core.autocrlf=true`，而该 PDF 不含 NUL 字节（git 按文本处理），
入库后全新克隆会把 77 个 LF 改写成 CRLF，xref 偏移全部错位 → PDF 直接解析失败。

### 4.2 真实文档重处理（开发实例，CDP 触发）

| 指标 | 深度学习 epub | numpy-user.pdf |
|---|---|---|
| 章节数 | 0 → **364**（L1 书名 + L2 章/部分 + L3 节 + L4 小节，层级正确） | 1012（错乱）→ **2137**（= 书签条目数，层级/顺序与大纲一致） |
| 切片数 | 491 → **810**（全部带 `section_path`） | 1268 → **1744**（页码映射修复后；全部带 `section_path`，仅封面/目录前言 1 块为空） |
| 摘要 | 60/364 done（单次上限 60，其余 304 条 pending 可续跑） | 60/2137 done、2077 条 pending（单次上限 60，按层级优先，先覆盖 L1/L2；失败的可用「生成/重试摘要」续跑） |
| 内容量 | 解析 909,819 字符 | 逐页 Markdown 1,429,758 → 切分后 1,430,911 字符（含 2137 行标题，无正文丢失） |

numpy 修复后章节树片段（正确）：

```
- [L1] What is NumPy?
  - [L2] Why is NumPy fast?
  - [L2] Who else uses NumPy?
- [L1] NumPy quickstart
  - [L2] The basics
    - [L3] Array creation
```

### 4.3 UI（CDP 实测，`progress/_verify_kb_chapter_tree.cjs`）

打开 numpy 文档「文档分片」对话框（脚本可重复运行：先关闭残留对话框再操作）：

| 断言 | 实测 |
|---|---|
| 摘要进度 | 「摘要 60/2137」 |
| 树渲染节点数 | **234**（只展开一级 + 其子节点；`default-expand-all` 会一次渲染 2137 个节点导致卡顿） |
| 标题筛选框 | 存在；输入 `F2PY` → 可见节点 94 |
| 点章节联动切片 | 「仅看章节：NumPy fundamentals」+「共 8 个切片」（全量 1744 个） |

配套改动（`src/renderer/src/views/KnowledgeBase.vue`）：大树只默认展开一级（≤200 节点仍全展开）、新增标题筛选框、摘要结果提示剩余条数。
Web 端复用同一视图与核心服务（无新增 IPC 通道；`channel-map.ts` 的 chapter 通道早已就位），本次未另起 web 服务实测。

### 4.4 首次落库后发现的第二个缺陷（已修，含回归用例）

第一次 reprocess 后核对切片时发现：numpy 的 6 个切片 `section_path=[]`，且正文与章节路径**整体错位一节**
（"What is NumPy?" 段只剩 16 字符、其正文被标成前一段路径）。

根因在 `mergeOutlineIntoMarkdown` 的页码映射：调用方会剔除空页（numpy 第 2 页无文本），
而函数内把「书签页码」直接当成「页数组下标」使用 → 页码与实际序号错位 1 位，此后每个书签的检索窗口
都整体前移，标题被插到了错误的正文位置。**测试没抓到的原因**：单测夹具的页面连续、没有空洞。

修复：页码 → 序号的显式映射（`Map` + 「目标页起第一个实际存在的页」两个辅助函数），
并补两条回归用例（页码有空洞 / 书签目标页超出范围）。

修复前后（numpy，本地复现脚本 `progress/_diag_split_repro.ts`）：

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 章节「What is NumPy?」内容长度 | 16 字（只剩标题行） | 3664 字（含正文） |
| 空 sectionPath 切片 | 6 | 1（仅封面/目录前言，符合预期） |
| <100 字切片 | 228 | 35 |
| 切片总数 | 1796 | 1744 |

### 4.5 顺带修掉的一个真实缺陷

`knowledge-base.service.ts` 的 QA 更新补偿路径调用了向量仓库**不存在**的方法
（`getByChunkId` / `deleteByChunkIds`，真实仓库为 `findByChunkId` / `deleteByChunkId`），
线上必然抛 `TypeError`；单测之所以全绿，是因为假仓库（`MemVectors`）自己实现了这两个不存在的方法——**mock 与实现漂移**。

处理：
1. 生产代码改用真实方法（删除接口逐条 `deleteByChunkId`，`Promise.all` 并发）；
2. 假仓库删掉两个「臆造」方法；
3. 新增回归用例「假仓库不漂移」：用真实 `KbVectorRepository.prototype` 校验服务用到的方法名双向存在；
4. 顺手删除已迁入 `extract-text` 的僵尸私有方法（`decodeTextFile`/`hasGarbledChars`/`splitText` 及其专属常量）。
   `vue-tsc` 全项目错误数 901 → 894，本次触碰文件 0 错误。

### 4.6 检索评估影响（诚实记录，未美化）

golden 集 32 条（走真实检索管线，`tests/eval/run-baseline.cjs`）：

| 时点 | recall@1 | recall@3 | recall@10 | NDCG@10 |
|---|---|---|---|---|
| 结构改造前（旧切片：epub 491 / numpy 1268） | 96.9% | 100% | 100% | 98.8% |
| 大纲路径 + 页码映射**有缺陷**（numpy 1796 / epub 810） | 90.6% | 100% | 100% | 96.5% |
| 大纲路径 + 页码映射**已修复**（numpy 1744 / epub 810） | **87.5%** | **100%** | **100%** | **95.4%** |
| 同上，但判定放宽为「正文或所属章节路径含关键词」 | 90.6% | 100% | 100% | 96.5% |

关键词型 10 条子集**完全不变**（纯向量 70/70/80、NDCG 74.3%；auto-route RRF 80/90/90、NDCG 86.3%）。

recall@1 下降的 4 条逐条核查（`progress/_diag_eval_rank.cjs`）：

| 条目 | rank1 实际内容 | 判定 |
|---|---|---|
| np-03 广播规则 | 正是「General broadcasting rules」小节（正文未出现 broadcasting 字样，章节名有） | **判定口径问题**，放宽后 @1 |
| np-07 矩阵乘法 | 《深度学习》第2章「矩阵和向量相乘」（跨文档近似度 0.295 vs 0.288） | 跨文档近似平局，两篇都相关 |
| np-01 数组 vs 列表 | 同章导语段（精确答案「fixed size … unlike Python lists」在 rank5，同文档） | 切片变细后同章内排序变化 |
| dl-06 梯度下降 | 同章「8.7.1 批标准化」（与正确段 0.408 平分） | 改造前即为 @2 |

结论：**召回没变（recall@3/@10 均 100%，无内容丢失）**，变化集中在 rank-1 排序：
一部分是评估判定只看字面关键词、一部分是跨文档/同章近似平局。是否要为此改检索策略，属独立课题，
不在本次结构改造范围内（可选方向见第六节）。

## 五、复现 / 回归命令

```powershell
# 单测（Electron Node，无需切 ABI）
node scripts/vitest-electron.cjs run tests/unit/core/utils/pdf-outline.spec.ts tests/unit/core/utils/extract-text.spec.ts
node scripts/vitest-electron.cjs --sqlite-only run tests/unit/core/platform/services/kb-qa-pairs.spec.ts

# 真实文档重处理 + 章节树（需 dev 实例 + CDP 9222）
node progress/_reprocess_and_show.cjs 4bf87762-a1e3-424f-8f3f-441dfcd9f341   # numpy-user.pdf
node progress/_verify_kb_chapter_tree.cjs                                     # UI 断言
node tests/eval/run-baseline.cjs                                              # 检索评估（golden 32 条）
node progress/_eval_section_aware.cjs --dataset=golden                        # 严格 vs 章节感知判定对照

# 只看解析/切分层（不落库、不花 LLM 费用）
npx tsx progress/_dbg_pdf_outline.ts     # 大纲路径 vs 版面推断对比
npx tsx progress/_diag_split_repro.ts    # 结构检测 + 切分结果（定位切片错位用）
```

诊断脚本：`progress/_pdf_outline_probe2.cjs`（pdfjs-dist 读大纲）、`progress/_pdf_parse_probe.cjs`（pdf-inspector 接口耗时对比）、
`progress/_kb_chapter_stats.cjs`（直连 SQLite 看章节/摘要/切片）、`progress/_diag_chunk_quality.cjs`（切片质量体检）、
`progress/_diag_eval_rank.cjs`（评估未命中条目逐条核查）、`progress/_cleanup_kb_service.cjs`（本次一次性清理）。

## 六、遗留与后续

1. **存量文档仍需重处理**：章节结构只在处理流程中生成，已有 17+ 篇文档要逐个「重新处理」才会得到权威目录（UI 已有入口）。
2. **摘要成本**：单次上限 60 条是刻意护栏（2137 章逐条调 LLM 不可接受）；未生成的可续跑，UI 会提示剩余条数。
   若需全量摘要，建议后续加「后台批量摘要任务 + 配额」而不是取消上限。
3. **PDF 正文层的字词粘连**：pdf-inspector 对两端对齐/斜体相邻的文本会丢空格
   （实测 `AtthecoreoftheNumPypackage`、`Thisencapsulates*n*-dimensional`、跨行连字符 `multidi- mensional`），
   影响英文关键词召回。属正文抽取层问题（可用 `extractTextWithPositions` 的 x 间距重建），本次未动。
4. **目录页噪声**：PDF 目录页/页码横幅会作为普通段落留在正文（标题已不再误判），后续可在后处理里识别「点导引 + 页码」行并归并。
5. **极短切片**：numpy 仍有 35 个 <100 字切片（其中 22 个近似纯标题，如「### ctypes」10 字）。
   成因是 `HybridSplitter.mergeSmallSections` 的合并上限（合并后 ≤1500 字才合并），
   而这些小节后面紧跟一个接近上限的章节。可考虑「极短(<50字)无条件并入邻段」，
   但该合并器为全文档共用，改动需单独评估（本次未动）。
6. **rank-1 排序**：召回已满（recall@3=100%），若要把 recall@1 拉回，方向是
   父小节检索/返回父块（parent-child retrieval，方案文档 P1-1）或对同章兄弟块做聚合，
   属于检索策略课题，与结构提取解耦。
7. **M6 Agentic 升级通道**（workflow 编排模板）仍未启用，保持骨架。
