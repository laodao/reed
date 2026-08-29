# 主图重新生成后新旧对比保留（方案A）（2026-08-29）

## 背景

剧集制作模块中，分镜制作界面的资产图集选择器（`AssetGalleryPicker`）通过 `image.listByAsset`
展示某资产**全部** `asset_image` 行；而资产界面的图谱编辑器（`CharacterGalleryEditor` /
`ItemGalleryEditor`）只按槽位显示——主图只认 `is_main=1`。

根因：**每次「重生成主图」都会新增一行主图，旧主图只被降级为 `is_main=0`（原 `category='main'`
记录保留），既不删行也不删磁盘文件。** 因此反复重生成会堆积大量历史主图，分镜界面把它们全量
展示出来，就比资产界面（只看当前主图）多很多。

## 目标（方案A）

「重新生成」后弹出新旧两张图对比，让用户确认保留哪张；选完后执行方案A——把被舍弃的那张
**连同磁盘图片文件**一并删除。

- 保留新图 → 删除旧主图（行 + 文件）；新图已是 `is_main=1`
- 保留旧图 → 删除本次新生成的主图（行 + 文件），并恢复旧主图为 `is_main=1`
- 首张主图（原本无图）→ 不弹对比，直接成功

## 改动文件

### 修改（后端）
- `src/core/modules/episode-production/assets/services/asset-image.service.ts`
  - `deleteImage`：删记录前先读行，调用新增模块级辅助 `deleteImageFiles`，连带删除
    `imagePath` / `thumbnailPath` 磁盘文件
  - `deleteImageFiles`：容错清理（文件缺失/解析失败/删除失败静默忽略，孤儿文件由磁盘清理兜底）；
    仅在解析为绝对路径时才 unlink（避免 dataPath 提供者缺失时误删进程工作目录下同名文件）
  - 该改动同时让「派生图重生成」(AssetGallery.onRegenerate) 与「手动删图」也清理磁盘文件

### 新建（渲染端）
- `src/renderer/src/composables/use-main-regenerate-compare.ts`
  - 封装「生成新主图 → 弹对比 → 按选择删除被舍弃那张」流程，双端兼容（走
    `episodeProduction.asset.image.delete` / `.setAsMain`）
- `src/renderer/src/components/episode-production/stage-asset/shared/MainRegenerateCompareDialog.vue`
  - 新旧对比弹窗（关闭 X/ESC/点遮罩均禁用，必须二选一）

### 修改（渲染端）
- `src/renderer/src/components/episode-production/stage-asset/character/CharacterGalleryEditor.vue`
- `src/renderer/src/components/episode-production/stage-asset/item/ItemGalleryEditor.vue`
  - `doGenerateMain` 改用 `useMainRegenerateCompare`；模板增加 `MainRegenerateCompareDialog`

### 修改（渲染端 · 分镜图集选择器补充删除）
- `src/renderer/src/components/episode-production/storyboard/AssetGalleryPicker.vue`
  - 「分镜制作界面」左侧资产图集选择器原本只展示/拖拽、无删除按钮；新增每张图片的
    hover 右上角删除按钮（`onDeleteImage`：`ElMessageBox` 确认 → `image.delete`，主图给出
    "将进入缺主图状态"警告），删除后刷新图集；复用方案A的 `deleteImage` 磁盘文件清理。

## 变更（分镜删除回退 + 资产界面删除常驻）

按用户要求：图片删除入口放在**资产**功能里，不要放在分镜界面。

### 回退（分镜选择器删除功能去掉）
- `src/renderer/src/components/episode-production/storyboard/AssetGalleryPicker.vue`
  - 还原为原始形态：移除删除按钮 / `onDeleteImage` / `ElMessageBox` / `Delete` / `deleting`
    及 `.asset-img-del` 样式，恢复纯展示 + 拖拽引用。

### 资产界面删除常驻可见
- `src/renderer/src/components/episode-production/stage-asset/character/CharacterGalleryEditor.vue`
- `src/renderer/src/components/episode-production/stage-asset/item/ItemGalleryEditor.vue`
- `src/renderer/src/components/episode-production/stage-asset/location/LocationGalleryEditor.vue`
  - 这三个图谱编辑器（进入单个资产后的图片网格）本就有「详情/下载/删除」工具条，但仅 hover
    显示、不易发现；现将 `.thumb-tools` 的 `opacity` 由 0 改为 1（常驻可见），删除功能在资产
    界面一目了然。

## 说明（存量主图清理）
该删除入口基于方案A的 `deleteImage`，删图会连同磁盘文件一并清理。但**功能上线前已堆积**的
`category='main' && is_main=0` 历史主图在图谱网格里不展示（主图槽位只认 `is_main=1`），
因此这类存量行无法在资产界面直接看到并删除；如需处理可另加数据迁移或「清理历史主图」入口。

### 测试
- `tests/unit/episode-production/assets/asset-image.service.spec.ts`
  - 新增「删除记录时连带清理落盘图片与缩略图文件」与「文件缺失时删除不抛错（容错）」两用例

## 验证

- `asset-image.service.spec.ts`：13 用例全绿（含新增 2 个文件清理用例）
- `vue-tsc`：本次改动的文件无新增类型错误（仓库既有 `electron.vite.config.d.ts` 未构建 +
  大量存量类型错误与本改动无关）
- 其余 9 个失败用例（asset-import / character-asset / item-asset / location-asset /
  gallery-derivation / main-image-upload）已用 `git stash` 复现：**无本改动时同样失败**，
  均为既有环境/测试夹具问题（`VideoProjectEntity` 元数据缺失、main-upload 文件名格式断言与实现不符）

## 说明 / 待办

- 仅解决「以后重生成不再堆积 + 被替换的旧主图立即删除」。**存量**历史主图（本功能上线前
  已堆积的 `category='main' && is_main=0` 行）本次不自动清理，避免误删用户在「新增主图/换装」
  （多主图模型）中刻意保留的其它主图；如需要可另行提供数据迁移或手工清理入口。
