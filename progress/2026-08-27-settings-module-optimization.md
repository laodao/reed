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
