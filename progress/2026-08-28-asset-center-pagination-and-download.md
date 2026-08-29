# 资产中心：分页/「全部」计数修复 + 下载功能 · 实施笔记

**日期：** 2026-08-28
**模块：** 通用资产（AssetCenter / AssetService / AssetRepository / IPC）

## 用户需求
1. 资产列表分页每页项数奇怪（第一页 4、第二页 3、第三页 11）→ 修复
2. 资产列表「全部」分类计数恒为 0 → 修复
3. 资产增加下载功能

## 根因

| 问题 | 根因 |
| --- | --- |
| 分页项数忽多忽少、组跨页重复 | `listAsset` 按**资产记录**分页（skip/take），前端把同 `groupId` 记录**聚合为一张组卡片**展示 → 每页实际卡片数 = pageSize − 被吸收的组内成员数；同一组被拆到多页、重复出现；total 是记录数而非卡片数 |
| 「全部」计数恒 0 | `AssetCenter.load()` 只把 `stats()` 响应的 `byCategory` 存进 state、丢 `total` → `stats.value.total` 恒 undefined → 0 |
| 测试环境跑不了（非功能问题） | `better-sqlite3` 原生模块 ABI=119（匹配 Electron 28），系统 node v22 ABI=127 → vitest 加载失败（ERR_DLOPEN_FAILED）。**用 Electron 28 跑测试**（测试环境 = 运行环境，ABI 完全一致） |

## 实施内容

### 1. 分页：按「展示卡片」为单位
- `AssetRepository.listAsset`：卡片键 = `CASE WHEN group_id IS NULL THEN id ELSE group_id END`；
  先按卡片键折叠分页（组按**组内最新成员时间**参与排序、内置资产靠后、卡片键稳定），
  再取本页卡片的完整记录；`total` = 卡片总数。
- 效果：每页恰好 pageSize 张卡片（末页除外）、组不跨页、total 与页码一致。
- 过滤语义保持：category/subCategory/keyword 在折叠前逐记录应用（组内任一成员命中即组卡片计入，
  取成员时同样过滤 → 组卡片只含当前过滤下可见的成员，与旧行为一致）。

### 2. 「全部」计数
- 新增 `renderer/views/asset/category-tabs.ts`：`buildCategoryTabs(stats, labels)` 把
  `{ total, byCategory }` 映射为分类标签——「全部」= total、各大类 = byCategory[c]（缺省 0）。
- `AssetCenter` 保存完整 stats（`stats.value = resp.data ?? { total: 0, byCategory: {} }`），
  分类标签走 `buildCategoryTabs`。

### 3. 下载功能（桌面端主进程 + Web 端浏览器降级）
- 共享纯函数 `core/modules/assets/asset-download.ts`：`sanitizeFileName`（剥离 Windows 非法字符）、
  `ensureExtension`（.md/.json/.url 不重复补）、`buildUrlShortcut`（InternetShortcut）、`AssetDownloadPayload`。
- `AssetService.buildDownloadPayload(record)`：按存储形态生成载荷——
  file → 复制源文件（sourcePath 绝对路径，文件名取存储文件名）；
  text → .md；json → .json；url → .url 快捷方式；无内容抛错。
- IPC `asset:download`（handler）：桌面端 `dialog.showSaveDialog`（默认名 + 过滤器）→
  `fs.copyFile` / `fs.writeFile`；Web 端通道返回不可用（由浏览器直接下载）。
- preload `assets.download` + `electron-api.ts` 类型。
- `AssetCenter`：资产卡片操作区 + 组画廊成员加「下载」按钮；
  `handleDownload`：Electron → `api.assets.download(id)`；Web → 渲染端
  `renderer/utils/asset-download.ts`（`buildWebAssetDownload`）+ `saveBlobAs`
  （file 型 fetch 资产 URL → Blob；text/json/url 组装文本 Blob）。

### 4. 预览弹窗改造（参考人像设计预览）
- 大图预览弹窗中的图片（原生 image / report 渲染长图）改用 `el-image` + `preview-src-list` +
  `preview-teleported`（与人像设计 PortraitWorkbench 同款 Element Plus 查看器）：
  点击图片进入全屏查看器，自带放大/缩小/旋转/全屏。
- 预览弹窗工具栏增加「下载」按钮（复用 `handleDownload`，对所有形态可用）；
  工具栏改为两端布局（左：markdown 预览/源码切换；右：下载）。
- 样式：`.big-preview :deep(.el-image__inner)` contain 适配（max-width/height 70vh）。

## 验证
- 资产相关 **9 个测试文件 64 用例全绿**（Electron 28 跑，ABI 匹配）：
  `asset.repository`（卡片级分页 6）、`category-tabs`（2）、`asset-download` 纯函数（3）、
  `asset-service-download`（6）、`renderer/utils/asset-download`（6）、
  `asset-service-group`（8）、`asset-service-category`（18）、`assets-sub-category`（9）、
  `create-asset-categories`（6）。
- eslint：新增文件 0 error / 0 warning。
- 顺带同步：`asset-service-category.spec.ts` 内置分类期望 9 → 10
  （对齐已提交的「吃瓜报告」分类迁移 902b015e，非本次改动引入的回归）。

## 环境备注
- 本项目 `better-sqlite3` 原生模块按 Electron 28 ABI（119）编译（2025-05）；
  系统默认 node v22 是 ABI 127，**不能用系统 node 跑 vitest**（ERR_DLOPEN_FAILED）。
- 正确验证方式：`npx electron node_modules/vitest/vitest.mjs run <spec>`（测试环境 = 运行环境）。
- 不可在本机 `npm rebuild better-sqlite3`：会重编为 127，Electron 28 应用下次启动将加载失败。
