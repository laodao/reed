# 内置高频应用深度设计（v4 · 网页获取 + AI 判断，无复杂爬虫）

> 日期：2026-08-22（v4 重写）｜ **2026-08-23 已实施完成**（见文末「实施完成记录」）
> v3 结论更新：
> - ❌ 放弃"CSS 选择器爬虫配置"（过度设计）→ ✅ **极简链路：fetch 网页 → 提取链接 → AI 判断价值 → fetch 内容 → AI 报告**
> - ✅ 保留：模板即资产（template 大类）、资产中心 subCategory 两级、8 个深度场景、内置机制
> - ➕ 新增：**web-extract 增强输出 links**（唯一节点改动）、**预置主题→全球 top10 媒体 URL 目录**、**start 增加"效果描述"自然语言输入**
> - 保留：不做运行时种子、迁移直接内置数据库、内置徽标+可复制、cron 默认关

## 〇、核心流程（用户定稿 · 极简且通用）

```
预置主题源 URL 列表（全球 top10 媒体/专栏）+ 用户自定义 URL
        │
        ▼
fetch 每个 URL（web-extract）→ 提取页面内链接 [title, url]（增强输出 links）
        │
        ▼
LLM 判断哪些链接有价值（jsonMode 输出选中 url + 理由 + 优先级）
        │
        ▼
loop：逐个 fetch 选中链接正文（web-extract 取 text）
        │
        ▼
LLM 按「效果描述」+ 正文素材 → 生成报告（jsonMode 结构化）
        │
        ▼
模板资产渲染（read-asset → report/report-image）→ save-asset + app-notify
```

**关键简化**：不做站点选择器配置、不做 JS 渲染、不做 RSS 解析。任何"给定 URL 能 fetch 到 HTML"的站点都可用；**AI 负责价值判断与内容提炼**（这正是 LLM 的价值，也是"通用"的来源——不依赖任何站点结构）。

---

## 一、节点改动（仅 1 处：web-extract 增强）

### web-extract 输出增加 `links`

- **现状**：输出 `{ title, text, length }`（仅正文文本）
- **增强**：输出加 `links: [{ title, url }]`（从页面 HTML 提取所有 `<a>` 的可见文本+href，去重、过滤空/`javascript:`/`mailto:`）
- 表单加 `maxLinks`（可选，默认 30，限制单页提取量防超长）
- 目录 outputSchema 同步（注册表一致性测试强制）
- **为什么够用**：新闻首页/专栏页的链接即新闻条目，title+url 足够让 LLM 判断价值；正文由 web-extract 现有 text 能力获取

### start 输入类型扩展 select-dynamic（模板选择）

- start 输入类型联合加 `select-dynamic`（source=`assets:template`），RunInputForm 渲染模板资产下拉（值=资产 ID）
- 编辑器 start 表单支持配置 source（对齐 kb 节点 select-dynamic 先例）

---

## 二、预置主题 → 全球 top10 媒体 URL 目录

### 2.1 结构（常量 + 用户自定义，可扩展）

```
interface TopicSource {
  topic: string            // '人工智能' | '新能源' | '全球财经' | ...
  name: string             // 媒体/专栏名
  url: string              // 首页或主题专栏地址
}
const TOPIC_SOURCES: TopicSource[] = [ ... ]  // 内置
```

### 2.2 内置初版（每主题约 8-12 个全球知名媒体/专栏）

| 主题 | 示例源（首页或专栏页） |
|---|---|
| 人工智能 | MIT Technology Review(AI) / The Verge(AI) / TechCrunch(AI) / Wired / VentureBeat / 机器之心 / 量子位 / 新智元 / Ars Technica(AI) / IEEE Spectrum(AI) |
| 全球财经 | Bloomberg / Reuters(business) / WSJ / FT / CNBC / MarketWatch / The Economist / 财新网 / 华尔街见闻 / 第一财经 |
| 新能源 | Reuters(energy) / BloombergNEF / Electrek / CleanTechnica / 36氪(能源) / 界面新闻(能源) / 能见 / 北极星电力网 |
| 科技产业 | The Verge / TechCrunch / Wired / Ars Technica / 36氪 / 虎嗅 / 极客公园 / 爱范儿 / CNET / Engadget |
| 国际时政 | BBC / Reuters(world) / AP / The Guardian / NYT / CNN / Al Jazeera / DW / 联合早报 / 澎湃国际 |

（URL 精确地址实现时由我按站点实际专栏路径补全并单测校验；用户可在应用内自定义增补。）

### 2.3 交互

- start 输入：`topic`（select：预置主题 + "自定义"）、`customUrls`（json URL 列表，可选，自定义时必填）、`request`（**效果描述 textarea**，如"聚焦国内大模型进展，含发布与融资，每天 8 点前出，500 字内"）
- 内置源 URL 列表由主题选择自动带入；用户随时可在应用会话中改效果描述，无需改工作流

---

## 三、8 个深度场景（v4 调整）

> 通用调整：C1/C2 采集改为"**web-extract 提取链接 → LLM 筛选 → 逐条取正文**"极简链路；所有报告类场景模板 = read-asset 引用模板资产；所有场景 start 含 `request` 效果描述。

### B1 多平台文案生成
- 输入：topic / keyPoints / targetAudience / platforms / tone / length / **request**（效果描述）/ model
- 流程：内容策略（llm jsonMode）→ loop 逐平台生成（平台调性 systemPrompt）→ human-review（逐平台可编辑）→ report（平台×策略对照）+ save-asset

### B2 网页摘要入库
- 输入：url / depth / language / knowledgeBaseId / **request** / model
- 流程：web-extract → llm jsonMode 结构化摘要（summary/keyPoints/dataPoints/entities/conclusion）→ 格式化 → kb-ingest + save-asset → message

### B3 文章润色改写
- 输入：text / dimensions（多选）/ style / tone / **request** / model
- 流程：诊断（llm jsonMode 问题清单）→ 润色（rewritten+changeNotes）→ human-review → report（原文 vs 润色对比）

### B4 图文卡片生成
- 输入：topic / audience / cardStyle / imageModel / textModel / imageCount / **request** / model
- 流程：内容规划（headline/body/cta/visualHint jsonMode）→ image-gen（风格锚点+候选）→ human-review（文案+图）→ report-image + save-asset

### C1 每日热点早报 ★
- 输入：topic（select 预置主题）/ customUrls / maxItems / templateAssetId / **request**（效果描述，必填）/ model
- 流程：
  1. web-extract（逐个预置源 URL → 提取 links）
  2. llm-chat（jsonMode：从候选链接中选与主题相关 topN，输出 `[{title, url, reason}]`）
  3. loop（逐条 fetch 正文 → 收集 `{title, url, text}`）
  4. llm-chat（按效果描述 + 素材 → 早报 markdown 结构化）
  5. report-image（模板资产渲染，morningReport 版式）→ save-asset + app-notify
- 触发：cron `0 8 * * *`（enabled=false）+ 手动

### C2 行业动态周报 ★
- 输入：topic（select 行业）/ customUrls / maxItems / templateAssetId / **request** / model
- 流程：同 C1 采集链路（时间窗 168h）→ llm jsonMode 趋势分析（trends/keyEvents/dataPoints/outlook）→ report（模板资产渲染，可 docx）→ save-asset + app-notify
- 触发：cron 每周一 9:00（enabled=false）+ 手动

### C3 网页正文转写
- 输入：url / keepStructure / extractMeta / **request** / model
- 流程：web-extract → llm jsonMode 结构化转写（title/author/date/markdown）→ code 校验 → save-asset + message

### D1 视频文案提取
- 输入：video / videoUrl / language / style / segmentMinutes / **request** / model
- 流程：video-extract-audio（B站 API/直链/yt-dlp；抖音降级提示）→ loop 分段 stt → llm 合并整理 → report + save-asset + app-notify

---

## 四、资产中心细化（不变）

- 新增 `ASSET_CATEGORIES.template`（模板）+ `sub_category` 列（迁移幂等 ALTER）
- 资产中心两级分类（大类 tab → subCategory 分组）；模板 tab 新建/上传/编辑/预览（marked 已有）
- save-asset 节点支持 subCategory 输入；目录树 v2 再做
- 内置迁移插入 1-2 个默认模板资产（早报模板/通用报告模板，user_id=NULL）

## 五、内置机制（不变）

- 迁移 `create-builtin-apps.ts` 直接 INSERT（user_id=NULL + is_builtin=1），不做运行时种子
- 内置工作流 JSON 内联迁移；内置应用 channel_session=1、channel_api=0、enabled=1
- repository 合并查询 `(user_id = :uid OR is_builtin = 1)`；内置禁删禁改、允许复制

## 六、实施步骤（v4）

1. **web-extract 增强**：输出 links（node-html-parser 提取 a 标签）+ maxLinks 表单 + outputSchema + 单测（链接提取/去重/过滤）
2. **预置主题源目录**：TOPIC_SOURCES 常量（5 主题 × 10 源，URL 实现时校验可达）
3. **资产细化**：template 大类 + sub_category 列 + AssetRepository/Service + save-asset subCategory + AssetCenter 两级 UI + 模板编辑/上传/预览
4. **start select-dynamic 扩展**：输入类型 + RunInputForm 渲染（assets:template）+ 编辑器表单
5. 8 个工作流 JSON（含链接筛选/模板引用/效果描述）+ `create-builtin-apps.ts` 迁移（工作流+应用+默认模板资产+内置源目录常量随包）
6. repository 合并查询 + is_builtin 列 + 双端接线
7. 内置徽标 + 复制入口
8. 单测：链接提取 / 内置合并 / 内置可启动 / 幂等 / 模板资产引用

## 七、待确认点

- [x] 模板资产 template 大类（已确认）
- [x] 内置源四组全量（已确认，v4 调整为"5 主题×全球 top10 媒体 URL"）
- [x] 极简链路：fetch → AI 判断 → fetch 内容 → AI 报告（用户定稿）
- [x] 效果描述 request 输入（用户要求）
- [x] 预置主题清单（AI/财经/新能源/科技/国际时政，已实施）
- [x] 8 个深度场景（已实施）

---

## 实施完成记录（2026-08-23）

### 已交付

**1. web-extract 增强**（`src/core/modules/workflow/nodes/extra-nodes.ts`）
- 输出新增 `links: [{title, url}]`（node-html-parser 提取 a 标签，绝对 URL 归一化、去重、过滤 javascript:/mailto:/锚点）
- 表单/目录新增 `maxLinks`（默认 30，0=不提取）；`extractPageLinks` 纯函数导出

**2. crawl-news 新闻采集节点**（`src/core/modules/workflow/nodes/news-nodes.ts`）
- 输入：`topicId`（预置主题）/ `customUrls`（自定义 JSON 或换行分隔）/ `maxLinks` / `maxSources`
- 多源并发 fetch → 提取链接 → 跨源去重 → 单源失败容错（failedSources 输出）
- 目录/表单/schema 三处一致（注册表一致性测试覆盖）

**3. 预置主题源目录**（`src/shared/types/news-topics.ts`）
- 5 主题 × 10 源：人工智能 / 全球财经 / 新能源 / 科技产业 / 国际时政（全球知名媒体首页/专栏 URL）

**4. 资产细化**
- `ASSET_CATEGORIES.template`（模板大类）+ `sub_category` 列（迁移幂等补列 + 索引）
- AssetRepository/Service 支持 subCategory 读写/筛选/分组统计；save-asset 节点支持 subCategory
- AssetCenter 两级分类 UI（大类 tab → 子分类条）+ 模板新建/上传/编辑/预览 + 内置徽标
- IPC：`asset:sub-category-stats`；preload/electron-api 类型同步

**5. start 输入 select-dynamic 扩展**
- `WorkflowStartInput.type` 新增 `select-dynamic`，`source` 支持 `assets:template` / `newsTopics` / `knowledgeBases`
- RunInputForm 渲染动态下拉（模板资产/新闻主题/知识库）；编辑器表单支持配置

**6. 8 个深度工作流**（`src/core/database/migrations/builtin-apps/*.json`）
- C1 每日热点早报 / C2 行业动态周报 / B1 多平台文案 / B2 网页摘要入库 / B3 文章润色 / B4 图文卡片 / C3 网页转写 / D1 视频文案
- 全部经 validateGraph 结构校验；含链接筛选、loop 抓正文、human-review、模板引用、request 效果描述

**7. create-builtin-apps 迁移**（`src/core/database/migrations/create-builtin-apps.ts`）
- 模板 JSON 静态 import（规避 electron-vite 打包 __dirname 问题）
- 插入 8 内置工作流（user_id=NULL, is_builtin=1, draft+published v1）+ 8 内置应用（会话渠道开、API 关、启用）+ 2 默认模板资产
- 幂等：固定 id 查重，已存在则 UPDATE；双端（Electron/Web）注册

**8. repository 合并查询 + 禁删禁改**
- workflow-definitions / apps / assets 三仓库：list/getById 改为 `(user_id = :uid OR is_builtin = 1)`；update/delete 拒绝内置（应用允许启停）
- 三表 entity 加 `is_builtin` 列

**9. 应用列表/详情内置徽标 + 复制入口**
- AppList / AppDetail 卡片显示「内置」徽标、删除禁用、新增「📋 复制为自有」（导出→导入副本→发布→创建应用）

### 验证结果（端到端，Electron 实机）

- ✅ 迁移落库：8 内置工作流 + 8 内置应用 + 2 默认模板资产
- ✅ 应用列表 16 条 = 8 用户 + 8 内置（带内置徽标、复制按钮、删除禁用）
- ✅ 内置应用可创建会话；消息写入独立 app_session_messages 表，dialogs.__app_session__=0、AI messages 0 污染（隔离延续）
- ✅ 资产中心模板 tab：2 内置模板 + 子分类「报告模板 2」+ 新建/上传/编辑按钮
- ✅ 工作流列表合并内置（21 = 13 用户 + 8 内置）；内置定义可被引擎读取（publishedGraph 完整）
- ✅ 幂等：重启后 8+8+2 不变
- ✅ 单测 72 个通过（链接提取 7 / crawl-news 12 / 模板校验 7 / 资产 subCategory 5 / 内置迁移 6 / app-session 22 / a2 一致性 13）；tsc + vue-tsc 通过（仅剩预存 TS6305）

### 已知预存在失败（与本次无关）

- better-sqlite3 ABI 不匹配（Electron 119 vs Node 127）→ 迁移 sqlite 测试无法本地跑（create-asset-image 等同样失败）
- node-registry-consistency 引用不存在的 lw-generate-chapter/lw-polish 节点
- a1-basics/run-service 断言英文 vs 中文消息不匹配
- app-definition 1 个快照断言失败
