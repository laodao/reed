# 原子能力盘点与统一能力层重构方案

> 日期：2026-08-19 ｜ 来源：用户指示——"把系统中的原子能力梳理一遍，列清单，重构放到一个包中，供所有模块使用"
> 状态：盘点完成；分阶段实施（Phase 1 已批准方向）

## 一、目标架构

```
src/core/capabilities/            # 统一能力层（消费方：工作流组件 / AI对话 / 日记 / 剧本 / 未来 harness）
├── http/                         # httpFetch：超时+UA+重试+错误规整（收拢 30+ 处裸 fetch）
├── markdown/                     # mdToHtml（marked 唯一加载点）/ mdToDocx / 模板渲染
├── document/                     # 文档产物：长图/PDF/docx（DocumentToolsService + 平台 IHtmlRenderer）
├── extract/                      # 文件正文提取（extract-text 唯一化）+ 网页正文提取（node-html-parser 唯一化）
├── media/                        # urlToDataUrl 等（toImageDataUrl 收拢 6+ 处手写）
├── search/                       # search-engines（已是单一实现）
├── text/                         # 中文分词/停用词（从 KB 服务抽出）
└── notify/                       # 应用内 + OS 级通知
```

不新建 npm 包（`@the-bot/core` 已是双端共享层，别名/依赖就绪）；capabilities 是 core 内的顶层能力目录，
每个能力一个"接口 + 默认实现"，平台相关（BrowserWindow/OS 通知）由 electron/web 注入。

## 二、盘点清单（现状 → 目标）

### 高优先（重复/散落严重）

| # | 能力 | 现状 | 动作 |
|---|------|------|------|
| 1 | HTTP 客户端 | 30+ 处裸 fetch（providers/搜索/工作流/KB 各自为政：超时/UA/重试不统一） | 新建 capabilities/http，逐步替换调用点（providers 改造量大，分批） |
| 2 | markdown 渲染 | getMarked 样板 ×3（markdown-to-docx / diary-export / document-tools）+ renderer 2 处直引 | capabilities/markdown 统一 `mdToHtml`；document-tools 已接 |
| 3 | URL→base64 | toImageDataUrl（ai-call）已是正式实现，但 voice-clone/voice-design/video-bridge/前端 ≥6 处手写重复 | 全部改调 capabilities/media/urlToDataUrl |
| 4 | 死代码 web-search.service | 硬编码 bing/google、零调用方 | 删除 |
| 5 | 网页正文提取 | KB 用 node-html-parser；工作流 web-extract 正则手撕 | 统一 extractor（node-html-parser） |
| 6 | 文件提取双份 | extract-text 是 knowledge-base.parseFile 的拷贝（且拷贝版修了 pdf/epub 漏洞，母版仍漏） | KB 反向引用 extract-text；PDF 分支升级 pdf-inspector（大纲切片，任务 #24） |
| 7 | HTML→PDF/长图 | printToPDF 流程锁在 DiaryExportService | 已下沉 document-tools（任务 #26 进行中）；日记导出重构为消费方 |

### 中优先

| # | 能力 | 现状 | 动作 |
|---|------|------|------|
| 8 | OS 级通知 | 仅工作流事件通道→ElNotification | capabilities/notify：Electron Notification + Web Notification |
| 9 | 向量索引两套 | pgvector/lancedb（KB）+ lw-vector-index 序列化（长文写作） | 存储层收拢（大工程，单独立项） |
| 10 | dashscope TTS 轮询同构 | dashscope-tts 与 cosyvoice-tts 几乎同构 | 提取共享基类 |
| 11 | logger/console 混用 | 结构化 logger 已有，console.log 大量存在 | 逐步替换（随改随换，不专项） |

### 已收拢良好（作为能力层雏形）

markdown-to-docx / extract-text / ai-call（callAIStream/callVLM/getProviderConfig/toImageDataUrl）/ search-engines / voice-providers

## 三、消费方矩阵

| 能力 | 工作流组件 | AI 对话 | 日记 | 剧本/长文 | harness(未来) |
|------|-----------|---------|------|----------|--------------|
| http | http-request/oas-tool/web-search 节点 | 联网搜索 | - | - | ✅ 工具 |
| markdown/document | report / **report-image(新)** | **对话导出 PDF/长图(#25)** | 日记导出(重构) | 导出 | ✅ 工具 |
| extract | kb 节点 / 对话附件检索(C4) | 附件上下文 | - | 剧本导入 | ✅ 工具 |
| media/urlToDataUrl | vision 节点 | 图片消息 | - | 分镜图 | ✅ 工具 |
| search | web-search 节点 | 联网搜索 | - | - | ✅ 工具 |
| notify | app-notify 节点 | - | - | - | ✅ 工具 |

## 四、实施阶段

- **Phase 1（当前）**：document-tools 层落地（接口+模板+electron 渲染器）→ 日记导出重构为消费方 + report-image 节点 + 对话导出；死代码 web-search.service 删除；marked 统一。
- **Phase 2**：http 客户端 + urlToDataUrl 收拢 + 网页提取统一 + extract-text 唯一化（含 #24 PDF 大纲）。
- **Phase 3**：notify、TTS 基类、向量存储收拢（单独立项）。

## 五、纪律

- 每项收拢先加测试再替换调用点（TDD）；重构不改行为
- 能力接口放 capabilities，平台实现 electron/web 各一套（与 IRepository 模式同构）
- 严禁新建第二套实现——新需求先查能力层，缺能力就先建能力
