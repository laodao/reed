# 设置模块优化（2026-03-xx 会话）

> 对应需求：设置模块 7 项优化（底部 padding / 新闻来源按钮位置 / 主题折叠 /
> 来源 favicon / 搜索引擎对话框 padding / 搜索引擎预置+自定义 / 主题重设计）

## 完成内容

### 1. 设置内容底部 padding
- `src/renderer/src/views/Settings.vue`：`.el-tabs__content` padding 由
  `24px 32px` 改为 `24px 32px 56px`，滚动到底部时模块与容器下边框不再紧贴。

### 2. 新闻来源：添加主题按钮位置
- 新闻来源区块头部改为按钮组 `.section-header-actions`：「添加主题」在左、
  「添加来源」在右；删除原底部「添加主题」入口（`.news-topic-add`）。

### 3. 新闻来源：主题折叠
- 点击主题标题行可折叠/展开其下来源：`collapsedTopicIds`（Set）状态 +
  `toggleTopic` / `isTopicCollapsed`；标题行加箭头（`ArrowRight` 旋转 90°），
  内容区 `v-show` + `topic-collapse` 过渡；「改主题名/删除主题」按钮
  `@click.stop` 不触发折叠。

### 4. 新闻来源：网站 favicon 作为来源图标
- 新增 `src/core/services/favicon.service.ts`：服务端抓取 + 本地缓存
  （`dataPath/favicons/<domain>.bin`，data: URL 文本；内存缓存 + NOT_FOUND 标记
  防重复抓取；候选源：Google s2 favicons → 站点 `/favicon.ico`；魔数识别 MIME）。
- 新增 `src/electron/ipc/handlers/favicon.handler.ts`（channel `favicon:get`），
  注册于 Electron 主进程 + Web `register-channels.ts`。
- preload 增加 `favicon.get(url)`；Web `channel-map.ts` 增加 `favicon.get` 映射，
  并补齐此前缺失的 `newsSource:*` / `newsTopic:*` 映射（Web 端此前会按 kebab
  规则拼错 channel，属潜在 bug，一并修复）。
- 新增 `src/renderer/src/components/common/FaviconIcon.vue`：加载成功显示
  `<img>`（data: URL，CSP 允许），失败回落 emoji。
- `Settings.vue` 新闻来源列表图标由 `📰` 替换为 `<FaviconIcon :url="source.url" />`。

### 5. 搜索引擎对话框：类型选择区右侧 padding
- 根因：`.template-card` 内 nowrap 描述使 grid 列被内容撑出容器，卡片右缘溢出
  到对话框边框（实测卡片 right ≈ 对话框 right - 1px）。修复：`.template-card`
  加 `min-width: 0`，并把该对话框 body padding 调为 `20px 24px 24px`。

### 6. 搜索引擎：预置 + 自定义类型
- 共享类型 `SearchEngineType` 新增 `perplexity | 'deepseek-web' | 'bocha' | 'searxng'`。
- 新增引擎实现：
  - `openai-compat-preset-search-engine.ts`：Perplexity（apiUrl=
    https://api.perplexity.ai，model=sonar-pro）、DeepSeek 联网（apiUrl=
    https://api.deepseek.com，model=deepseek-chat）——复用 CustomApiSearchEngine
    （`baseUrl`/`model` 改为 protected getter，支持子类默认值回落；
    结果 `source` 由硬编码 'custom-api' 改为 `this.type`）。
  - `bocha-search-engine.ts`：博查 web-search API。
  - `searxng-search-engine.ts`：SearXNG JSON API（无需 Key，需实例地址）。
- `custom-api` 更名为「自定义搜索引擎」（id 不变，兼容存量配置）。
- `AddSearchEngineDialog.vue`：API 模板列表条件放宽为
  `requiresApiKey || requiresExtraConfig`（SearXNG 可出现在类型选择区）；
  API Key 字段仅 `needsApiKey` 时必填/显示。
- `search-engine.service.ts`：非 Key 引擎的「测试」也透传 config（携带
  extraConfig，SearXNG 实例地址测试可用）。
- `src/core/constants/search-engine-templates.ts` 改为从 `@core/search-engines`
  再导出，避免模板双份漂移。
- 新增单测：bocha / searxng / openai-compat-preset / favicon.service（23 项全绿）。

### 7. 外观设置：主题重设计
- `useTheme.ts`：全新 10 套主题（清新色系：海盐蓝/薄荷青/松柏绿；暖色色系：
  落日橘/玫瑰粉/琥珀金/绯红；沉稳色系：薰衣紫/石墨灰/深海蓝），默认主题
  海盐蓝；`themeColorMap` 同步；主题名称直接使用 `availableThemes[].name`。
- `styles/index.scss`：`:root` 默认值 + 10 个 `[data-theme]` 块全部按新配色重写
  （含 `--color-primary-rgb` / 渐变 / 侧栏 / accent / 页面底色）。
- `Settings.vue`：删除失效的 `themeNames` 映射（旧 id 与可用主题不匹配导致
  卡片显示英文 id），直接展示 `theme.name`。

## 验证
- 单测：`npx vitest run tests/unit/search-engines tests/unit/core/services/favicon.service.spec.ts` → 35 passed。
- 构建：`npm run build` 成功（esbuild 不阻塞类型错误）。
- 截图脚本：`scripts/settings-screenshot.js`（DOM 测量验证对话框卡片不再溢出、
  底部 padding 生效）。
- 说明：仓库 `npm run typecheck` 基线已存在大量历史类型错误（工作树内多个
  未提交改动所致，1359 项，覆盖 ~100 个文件），本次改动未新增类型错误
  （FaviconIcon / favicon.service / 新搜索引擎 / useTheme 均无报错）。

## 第二轮修复（用户反馈）

### 1. 底部 padding 未生效（外观设置 / 工具 等 tab）
- 根因：`.el-tab-pane { height: 100% }` 恰好填满滚动区内容高度，滚动容器
  `.el-tabs__content` 的 padding-bottom 被 pane 顶掉，滚动到底后内容与
  容器下边框仅差 ~0.3px。
- 修复：底部留白移到 pane 上——`.el-tab-pane { min-height: 100%; padding-bottom: 56px }`，
  content 恢复 `padding: 24px 32px`。实测外观设置 / 工具 tab 滚动到底后
  间距 112px。

### 2. favicon 抓取优化（站点自身优先 + 更快）
- 候选顺序改为：站点 `/favicon.ico` → 解析 HTML `<link rel="icon">`（只读前
  128KB）→ DuckDuckGo icons → Google s2（境外兜底，国内不可达时自动跳过）。
- 超时 10s→6s、并发 8→16（首次抓取 75 源 120s → 30s 内完成）。
- 失败缓存 NOT_FOUND 带时间戳，24h 自动过期重试。
- UA 改为标准 Chrome UA（自定义 UA 触发 403）。
- 组件加 loading 占位（脉冲方块），避免加载期空白。
- 实测：49/75 源显示真实图标（~65%，境外被墙站点与 36kr 类 SPA 静态抓不到
  属网络/站点现实），其余回落 📰；缓存落盘
  `dataPath/favicons/<domain>.bin`（二次打开秒开）。

### 3. 搜索引擎新增 必应 API / Google CSE 预置
- 新增 `bing-api`（必应 Web Search API，Ocp-Apim-Subscription-Key）与
  `google-cse`（Google Custom Search JSON API，key + cx）模板与引擎实现，
  添加对话框现共 9 个 API 型模板。
- 说明：百度无官方公开搜索 API，保持网页抓取型（快速搜索）。
- 实测 9 个模板卡片全部无文字溢出（min-width:0 已生效）。

### 4. 主题再设计（淡雅 2 + 鲜艳 2）
- 淡雅系：云水蓝 cloud-blue（#6fa8dc，默认主题）、淡雾紫 light-lavender
  （#9b8ad6）——主色浅、整体柔和。
- 鲜艳系：活力橙 vivid-orange（#f26b2e）、电光紫 electric-purple
  （#7c4df0）——辅色深饱和（secondary 不浅）。
- 保留清新（海盐蓝/薄荷青）、暖色（落日橘/玫瑰粉）、沉稳（深海蓝/石墨灰），
  共 10 套五类配色；默认主题改为云水蓝。

## 第三轮：品牌真实图标（AI 提供商 / 搜索引擎）
- `ProviderTemplate` / `SearchEngineTemplate` 类型新增 `siteUrl`（品牌官网）。
- 提供商模板（单一事实源 `src/core/services/provider-template.service.ts`，
  顺带把孤儿文件 `constants/provider-templates.ts` 改为再导出，避免两份漂移）
  补齐 9 家官网：openai/deepseek/zhipu/bailian/moonshot/volcengine/minimax/
  anthropic/gemini。
- 搜索引擎模板补齐 11 家官网：baidu/bing-web/bing-api/google-web/google-cse/
  zhipu/tavily/perplexity/deepseek-web/bocha/searxng。
- 渲染层统一改用 FaviconIcon（复用 favicon 服务缓存）：
  - 设置页：AI 提供商列表、已配置搜索引擎列表、快速搜索列表
  - 添加提供商/添加搜索引擎对话框：模板卡片 + 选中模板图标
  - ChatInput：快速搜索 / 已配置搜索引擎下拉选项（16px 品牌图标）
- `FaviconIcon` 修复空 URL 时 loading 卡住的问题（直接回落兜底 emoji）。
- 实测：DeepSeek/火山/智谱/百炼/百度/必应/Tavily 等显示真实图标；
  Google（被墙）、vllm（custom-model 无官网）回落原 emoji，符合预期。

## 第四轮：每日热点早报抓取容错（bug 修复）

### 现象
用户重跑「每日热点早报」（id wfrun_1787849366563_829fl3f4t 等）两次均失败，
错误「循环体内节点失败且未恢复」；此前 14:21 同参数运行成功。

### 根因（数据库 workflow_node_runs 排查）
- loop1「逐条抓取正文」循环体的 extract1（web-extract「抓取正文」）抓
  `https://x.com/amir/status/...`（X/Twitter 帖子链接）时网络失败
  （`网页获取失败: fetch failed`，被墙/反爬）。
- web-extract 节点对网络失败直接返回 `status: 'failed'`，引擎把失败上抛为
  循环体失败 → loop1 失败 → 整个早报运行失败。
- 即：**单个 URL 抓取失败导致整个早报流程失败**，缺少采集容错。

### 修复
1. `extra-nodes.ts` web-extract 节点新增 `onError: 'fail' | 'skip'` 配置
   （默认 fail 保持兼容）：
   - `skip`：网络/超时/HTTP 非 2xx 失败时返回空结果
     `{ title:'', text:'', length:0, links:[], skipped:true }`，不报错；
   - SSRF/URL 校验失败仍报错（配置问题不静默吞掉）。
2. `daily-news-brief.json`（内置早报模板）：
   - extract1 配置 `onError: "skip"`；
   - saveKb1 passthrough 增加 `skipped` 字段，循环结果可感知跳过项。
3. 用户数据库同步：内置定义 `builtin_def_daily-news-brief` 已被用户接管
   （template_version=0，模板不同步），用脚本直接更新
   draft_graph/published_graph（先备份
   `dataPath/workflow_definitions_backup_<ts>.json`）。
4. 新增流程级容错测试：循环内某个 URL fetch 抛错 → 该项被跳过
   （skipped=true 空结果）、正常项照常抓取、链路仍 succeeded。

### 验证
- `daily-news-brief-flow.spec.ts` 4 用例全过（含新增容错用例）；
  web-extract 相关测试 21 项全过；`npm run build` 成功。
- 数据库读回确认：extract1.config.onError="skip"、
  saveKb1.passthrough.skipped 已生效。


---

## 图床 OSS：阿里云测试连接失败 + 编辑留空密钥被清（2026-09-07）

### 现象
- 图床设置添加阿里云 OSS（region=cn-chengdu，endpoint=`oss-cn-chengdu.aliyuncs.com`，
  bucket=the-bot）后点「测试」失败；用户确认 AK/SK 有效。
- 编辑配置时 AccessKey Secret 不显示（掩码），保存又因必填校验无法保存；
  用户期望「留空 = 不修改」。

### 根因（均为代码缺陷，非用户配置错误）
1. **endpoint 未归一化**：用户按阿里云控制台习惯填不带协议的 host
   （`oss-cn-chengdu.aliyuncs.com`）。`oss.service.ts` 直接拼
   `${endpoint}/${bucket}/?max-keys=1` → `fetch` 抛 `Failed to parse URL`。
2. **寻址风格错误**：阿里云 OSS 要求 bucket 三级域名（vhost）寻址；
   即使补协议用 path 式 `endpoint/bucket/` 也实测返回
   403 `SecondLevelDomainForbidden`（"must be addressed using OSS third level domain"）。
   而 `https://{bucket}.{endpoint}/...` + 正确 V1 签名实测 **PUT=200 / DELETE=204**。
3. **测试方法依赖 ListObjects 权限**：旧测试 GET bucket list，可能因 RAM 授权
   不含 list 而误报失败。
4. **编辑保存会清空密钥（隐性 bug）**：旧 UI rules 必填拦截只是表象；后端
   handler/repo 用空字符串覆盖已有 `access_key_secret` / `access_key_id` 才是隐患。

### 修复
- `src/core/platform/services/oss.service.ts`：重写为
  - `normalizeEndpointHost()`：兼容不带协议 / 带 https / 已是三级域名 / 自定义域名，
    统一输出 `https://{bucket}.{host}/...`（官方地域域名自动加 bucket 前缀）。
  - `sendSignedRequest()`：统一 V1 签名请求（PUT/DELETE/GET）。
  - 测试连接改为**真实上传探针** `.connection-test/probe-*.txt`（PUT 成功后
    best-effort DELETE，无删除权限不判失败），更贴近真实用途、不依赖 list 权限。
  - `describeOssError()`：解析 OSS 错误 XML，把 SignatureDoesNotMatch /
    AccessDenied / NoSuchBucket 等映射为可读中文提示。
- `src/core/database/repositories/oss-config.repository.ts`：
  - `update` 仅在 `accessKeyId/Secret` 非空时更新（空串不再清空）；
  - `getDefault` 在无默认标记时回退到唯一启用配置（单配置场景可直接上传）。
- `src/electron/ipc/handlers/oss.handler.ts`：update 时空串 secret/akid 直接剔除，
  不传给 repo。
- `src/renderer/src/views/Settings.vue`：编辑模式 Secret/AccessKeyID 留空 =
  不修改（动态 placeholder + 动态必填校验 + 保存时不提交空字段）。

### 验证
- 新增单测 `tests/unit/core/platform/services/oss.service.spec.ts`（9 例）：
  无协议/带协议/已是三级域名/留空 region/自定义域名/403 错误解析/探针成功/403/网络异常。
- repository spec 新增 2 例（update 空值不清空、getDefault 回退），
  Electron Node 下 7/7 通过（宿主 Node 因 better-sqlite3 ABI 不匹配需用
  `ELECTRON_RUN_AS_NODE=1 npx electron node_modules/vitest/vitest.mjs run ...`）。
- `npm run typecheck` / lint：改动文件无新增错误（仓库存在并行会话遗留的
  workflow/shared-types 类型错误，与本任务无关）。
- `npm run build` 成功。
- **真机 CDP 验证**（dev 实例重启后）：`oss.testConnection` 返回
  `success:true`「连接成功：Bucket 可读可写（已上传探针并清理）」；
  模拟编辑保存（secret 空串 / 不提交字段）均 success，库中密文
  `djEw...`（84 字符）未被覆盖。
