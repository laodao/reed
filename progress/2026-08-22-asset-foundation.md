# 阶段一：通用资产库（资产地基）实现记录

日期：2026-08-22
状态：✅ 完成并通过 E2E

## 背景

用户方案：以工作流重构全部能力（图像生成/翻译/TTS/STT/语音复刻），新增资产管理统一沉淀生成物。
最终菜单：AI对话 / 应用 / 工作流 / 日记 / 知识库 / 资产管理（人像设计暂保留、首页保留）。
本文记录阶段一——通用资产库地基（数据模型 + 保存/读取资产节点 + 资产中心页面）。

## 交付内容

### 1. 数据模型
- `assets` 表（迁移 `src/core/database/migrations/create-assets-tables.ts`，Electron + Web 双端注册）
  - 列：category / name / description / tags(JSON) / kind(file|url|text|json) / storage_path(相对 dataPath) /
    url / text_content / json_content / mime_type / size_bytes / metadata(JSON) / source_type / source_ref
  - 索引：user / category / created / source
  - 大内容一律落盘 `dataPath/assets/<大类>/<yyyyMM>/<文件>`，DB 只存元数据（防膨胀）
- 共享类型 `src/shared/types/asset.types.ts`：ASSET_CATEGORIES（image/audio/video/document/text/json/other）+
  ASSET_CATEGORY_LABELS + ASSET_STORAGE_KINDS + AssetRecord + SaveAssetInput

### 2. 服务层（`src/core/modules/assets/`）
- `asset-storage.service.ts`：四种内容来源统一收敛（data: URI 解码 / local-*:// 协议解析 / http(s) 下载 / 本地路径复制）；
  文件名净化 + 重名去重（-1/-2）；sharp 探测图片宽高；魔数嗅探 MIME；删除磁盘文件
- `asset.service.ts`：createAsset（file/url/text/json 四形态，大类自动探测）、list/get/update/delete（连带磁盘）、
  stats（分类计数）、assetPreviewUrl / resolveAssetPath
- `asset-registry.ts`：workflow-boot 装配注册单例（同 ToolService 模式）

### 3. 工作流节点（`src/core/modules/workflow/nodes/asset-nodes.ts`）
- **save-asset**：content(模板) + kind(auto/file/url/text/json) + category(auto/显式) + name/tags/description
  → 输出 { assetId, name, category, kind, url }；auto 模式按内容形态探测（链接/路径→落盘，JSON→json，其余→text）
- **read-asset**：assetId(模板) + output(url/path/content/metadata) → 按模式输出链接/本地路径/文本/JSON/全量元数据
- 已注册到节点目录（catalog/forms/types/注册表），启动一致性自检通过

### 4. IPC + 渲染层
- `asset.handler.ts`（Electron + Web 双端注册）：asset:list / get / create / update / delete / stats / open-folder
- preload `assets.*` API + 渲染层类型
- **资产中心 `/assets`**（`src/renderer/src/views/asset/AssetCenter.vue`）：
  分类筛选（带计数）/ 内嵌预览（图片/音频/视频/文本/JSON/链接/文档图标）/ 搜索 / 分页(12/24/48) /
  打开目录 / 复制链接 / 删除 / 导入文件；不缓存（每次进入取最新数据）
- 菜单「资产管理」+ 路由 + 标题映射

## 关键技术决策

1. **存储形态四选一**（file/url/text/json）：文件型大内容落盘，链接型保留原链接不下载，文本/JSON 直接入库。
   资产中心按 kind 区分预览方式。
2. **save-asset 的 kind=auto**：http(s)/data:/local-*:///路径 → 落盘（保存语义）；JSON 形态 → json；其余 → text。
   用户可显式指定强制行为。
3. **节点输出只暴露轻量摘要**（assetId/name/category/kind/url），完整内容经 read-asset 按需读取——避免工作流
   变量上下文被大内容撑爆（checkpoint 序列化）。
4. **资产中心不参与 keep-alive 缓存**：资产实时变化（工作流随时保存新资产），每次进入取最新数据。
5. **文件重名去重**（-1/-2 后缀）而非覆盖——资产不可变追加语义，防止误覆盖历史成果。

## 验证

`scripts/e2e-asset.cjs` 全量通过：
- 工作流运行：save-asset（text/json/file 三形态）→ read-asset（content/path）→ message 串联，节点输出正确
  （msg1=读到:Hello 你好 / msg2=数据:你好/42 / msg3=文件:C:\...\E2E文件资产.txt）
- assets 表落库：三种形态各一行，内容/分类/来源(source_type=workflow, source_ref=runId)正确
- 磁盘文件真实存在且内容正确
- 资产 IPC：stats / list（关键词+分类过滤）/ update / delete（连带磁盘清理）
- 资产中心页面：3 卡片渲染、分类条带计数、分页、文本分类筛选
- 清理：E2E 工作流 + E2E 资产（含磁盘）+ 临时文件全部删除，DB 零残留

类型检查：`tsc -p tsconfig.node.json` 零错误；`vue-tsc` 仅预存 TS6305（electron.vite.config.d.ts）。

## 排障记录（重要经验）

1. **`wf:get-run` 返回 `{ data: { run, nodeRuns } }`**——运行记录在 `data.run` 而非 `data`（E2E 轮询踩坑）。
2. **渲染进程不能用 `@core/utils/asset-path` 的 `toAssetUrl`**——PathProvider 只在主进程注册，
   渲染端调用直接抛「未注册访问器」→ 组件渲染函数抛错 → 挂载中断（静默空数据）。
   渲染端统一用 `@/utils/asset-url` 的 toImageUrl/toFileUrl/toVideoUrl。
3. **Playwright `page.goto` 同 URL 不触发真实重载**——命中 keep-alive 缓存实例导致假失败；
   需要 `page.reload()` 才强制全新挂载。
4. **keep-alive 按 SFC 文件名推断组件名**（`__name`）——即使没写 defineOptions 也会被 include 匹配缓存。

## 下一步（阶段二）

- 图像生成 / 文档翻译 / TTS / STT 官方工作流模板（复用 image-gen/translate/tts/stt 节点）+ 保存资产收尾
- 语音复刻多阶段工作流
- 模板发布为应用 → 旧入口（图像生成/翻译/语音助手菜单）重定向
