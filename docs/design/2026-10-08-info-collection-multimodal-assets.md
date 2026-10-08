# 信息搜集 · 多模态资料资产设计(2026-10-08)

> 状态:设计稿,待用户确认后分期实施
> 前置文档:2026-10-07-info-collection-design.md(通用蓝图模型)、info-collection-storage-design.md(存储/约定列)

## 1. 问题陈述

用户指出(2026-10-08):搜集的"资料"类型很多——**即便是数据,网络上也是网页,原始文件往往还是文档**;此外搜集对象还应包括**图片、视频、语音**。

现状实现的隐含假设是"一个来源 = 一个网页 = 一份 markdown 快照 + 若干结构化行":

- fetch 只处理 HTML→markdown(`executeHttpFetch` + `htmlToMarkdown`);
- 网页里引用的 PDF/DOCX/图片一律丢弃;
- 图片/音频/视频没有任何获取与存储路径;
- 知识库入库只有"markdown 文本 + 溯源头"一种形态。

这违背了模块的通用性纪律:资料的第一形态是**文档与媒体**,结构化数据只是从文档里投影出来的二次产物。

## 2. 设计原则

1. **一切资料皆资产(asset)**:搜集到的每份资料是一个资产,`kind ∈ webpage | document | image | audio | video`。来源(source)是资产的出处,资产是资料本体。
2. **双轨存储**:原件(asset file)落本地资产目录;内容化文本(canonical text)入知识库向量化。二者用 `asset_hash` / `kb_document_id` 互链。
3. **抽取与资产类型解耦**:引文卡/数据 schema 抽取只面向"内容化文本"工作,与资产是什么类型无关。图片的 VLM 描述文本同样能出引文卡、同样带 quote 回验(quote 对描述文本回验)。
4. **成本红线前置**:媒体获取与内容化都有显著成本(下载带宽、VLM 按张计费、ASR 按时长计费),必须由蓝图声明预算并在任务执行中熔断,沿用 maxToolCalls 的做法。

## 3. 资产模型

```
ic_source(升级为"资料资产"登记表)
  kind            webpage | document | image | audio | video   ← 新列
  content_type    mime 或扩展名(pdf/docx/png/mp4/…)            ← 新列
  origin_url      资产直链(媒体)或网页 URL(网页)                ← 复用 url
  container_url   所在网页 URL(网页内嵌媒体时有值)              ← 新列
  asset_path      原件相对路径 <yyyyMM>/<sourceId>.<ext>        ← 新列(复用快照目录约定)
  asset_hash      原件 sha256(去重 + 完整性)                    ← 新列
  media_json      时长/分辨率/页数/字幕语言等媒体元数据           ← 新列
  snapshot_path   内容化文本快照(现有列,语义扩为"canonical text 快照")
  kb_document_id  内容化文本入 KB 后的文档 id(现有列)
```

- 原件目录:`<dataPath>/info-collection/assets/<yyyyMM>/<sourceId>.<ext>`;webpage 类型不落原件(正文即快照),其余四类落原件。
- 内容化文本快照沿用现有 `snapshots/` 目录与双段标记,不再只是网页 markdown。

## 4. 内容化矩阵(各类型怎么变成可检索文本)

| kind | 获取 | 内容化(→文本) | 复用现状 | 成本档 |
|---|---|---|---|---|
| webpage | HTTP GET + htmlToMarkdown | 现状直出 | 已实现 | 低 |
| document | 下载原件(PDF/DOCX/XLSX/EPUB…) | **复用知识库文档解析器**提取文本 | KB upload 已支持 docx/xlsx/pdf/epub/mobi/azw3 | 低-中 |
| image | 下载原件 | VLM 图片描述/OCR(描述文本即 canonical text)。复用**平台层** `FileService.buildMultimodalContent`(core/platform/services/file.service.ts)组装多模态消息;vision 模型探测 `detectVisionSupport` 现居 chat 包,实施时提升到平台层 | 平台层多模态管道(全项目唯一使用方目前是聊天页,非依赖) | 中(按张计费) |
| audio | 下载原件 | ASR 转写(项目当前**无** ASR 能力,需接入) | 无 | 高(按时长) |
| video | 默认只取元数据+字幕;显式授权才下载原件 | 字幕→文本直用;无字幕走 ASR/关键帧 VLM(成本高,默认关闭) | 无 | 高 |

内容化文本统一带溯源头后入 KB(每资产一文档),与现状 webpage 的入库逻辑同一条代码路径。

## 5. 蓝图扩展

- `sourceStrategy.media`:声明本主题需要哪些资料形态及优先级(例:法规主题 → document 优先;识别主题 → image)。缺省仅 webpage(向后兼容)。
- `sourceStrategy.seedQueries` 按 media 附加检索算子:document → `filetype:pdf 主题词`;image → 图片搜索渠道;video → 视频站渠道(渠道枚举扩 `image-search` / `video-sites`)。
- requirements 的 form 已有 `document/case`,补充可选字段 `expectKinds: ('document'|'image'|…)[]`,让"要一张示意图"能成为一条显式需求。
- 预算:`stopRules.budget` 增加 `maxAssetBytes` 与 `maxImageDescriptions`(VLM 张数上限),任务执行中熔断。

## 6. 抽取层(不变,只扩输入)

- EXTRACT 提示词的输入从"网页正文"变为"内容化文本 + 资产元信息(kind/来源)"。
- 引文卡 {statement, context, quote} 机制、quote 逐字回验、schema/ajv 校验全部不变。
- 图片资产额外产一条"本体行":`{描述文本, 分辨率, 内容概要}`,quote 对描述文本回验。

## 7. UI 变更(本模块)

- 审阅工作台:来源表加"类型"列(webpage/document/image/audio/video 图标);图片行内缩略图预览;音视频/文档提供打开原件入口。
- 资料库 tab:条目关联的资产类型可见;图片条目可看缩略图。
- 整理报告:引用清单区分资料类型;图片可在报告中内嵌(原件相对路径)。

## 8. 复用清单(已核实)

| 能力 | 位置 | 用途 |
|---|---|---|
| KB 文档解析(pdf/docx/xlsx/epub/mobi/azw3) | knowledge-base 上传管线 | document → 文本,零新解析代码 |
| 视觉多模态消息构建 | 平台层 `FileService.buildMultimodalContent`(file.service.ts);`detectVisionSupport` 提升至平台层 | image → 描述文本(信息搜集与 chat 并列共用平台层,互不依赖) |
| HTTP 抓取(含 403/429 拦截判定) | ic-defaults `defaultIcFetch` | 所有直链下载的底座 |
| 快照存储(双段标记/逃逸防护/fail-soft) | ic-snapshot-store | canonical text 快照,扩为资产清单 |
| 去重(content_hash 域内判重) | ic-content-hash | 扩到 asset_hash 原件去重 |
| 分级/审阅闸门/引文回验/冲突归因 | 现有管线 | 全部原样生效(对象从"网页"换成"资产") |

缺口:ASR(音频转写)与视频字幕获取,项目当前无现成能力,需外部接入(云 ASR API 或本地 whisper;字幕走 bilibili/YouTube 字幕接口)。

## 9. 分期与成本红线

- **M1(document)**:直链与网页内文档抓取(HEAD 探测 content-type / `filetype:` 算子)→ 下载原件 → KB 解析器提文本 → 入库。全部复用现有解析,新代码集中在 fetch 分档与资产登记。DB 用 ensureColumn 加 6 列(两处 migration 同步:electron/database/index.ts + web/server/index.ts)。
- **M2(image)**:图片搜索渠道 + 网页内主图抓取 → VLM 描述(模型须过 vision 探测,未配 vision 模型时资产只存原件、内容化标记"待补")→ 缩略图审阅。
- **M3(video 字幕档)**:视频站字幕获取 → 文本管线;默认不下载视频原件。
- **M4(ASR)**:音频转写服务接入(选型另议:云 API vs 本地 whisper;数据出境与成本需用户拍板)。

红线:M1-M3 全程不下载视频原件;VLM 描述受 `maxImageDescriptions` 熔断;单资产下载上限 `maxAssetBytes`(缺省 50MB)。

## 10. 开放问题(实施前需确认)

1. ASR 选型与预算(影响 M4 是否立项);
2. 图片搜索渠道的引擎可用性(bing-web 首词缺陷修复是否顺带);
3. 报告内嵌图片的相对路径在 KB 文档渲染端是否可解析(KB 端协议支持范围)。
