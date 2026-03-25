# 图像生成模块完善进度 (2026-03-23)

## 已完成功能

### 1. FR-IMG-007 下载图像功能 ✅

**实现内容：**
- 主进程添加 `handleImageDownload` IPC 处理器
- `ImageService.downloadImage` 方法实现文件保存对话框
- `preload/index.ts` 添加 `download` API
- `useImage.ts` 添加 `downloadImage` 方法
- `ImageResult.vue` 更新为真正的下载功能

**文件变更：**
- `src/main/ipc/handlers/image.handler.ts`
- `src/main/services/image.service.ts`
- `src/preload/index.ts`
- `src/renderer/src/composables/useImage.ts`
- `src/renderer/src/components/image/ImageResult.vue`

---

### 2. FR-IMG-009 使用相同参数重新生成 ✅

**实现内容：**
- `ImageGenerator.vue` 添加 `setParams` 方法并暴露给父组件
- `Image.vue` 的 `handleRegenerate` 方法填充参数到生成器

**文件变更：**
- `src/renderer/src/components/image/ImageGenerator.vue`
- `src/renderer/src/views/Image.vue`

---

### 3. FR-IMG-010 提供商复用 ✅

**实现内容：**
- 修改 `ImageService.getProviders` 从现有 AI 提供商配置中筛选包含图像模型的提供商
- 添加 `checkImageCapability` 方法检测模板是否支持图像生成
- 更新 `ImageService.getModels` 支持从复用的提供商获取模型

**文件变更：**
- `src/main/services/image.service.ts`

---

### 4. FR-IMG-002 参考图片上传 ✅

**实现内容：**
- 主进程添加 `handleImageSelectFile` IPC 处理器
- `preload/index.ts` 添加 `selectFile` API
- `useImage.ts` 添加 `selectReferenceImage` 方法
- `ImageGenerator.vue` 实现 `handleUploadReference` 调用文件选择

**文件变更：**
- `src/main/ipc/handlers/image.handler.ts`
- `src/preload/index.ts`
- `src/renderer/src/composables/useImage.ts`
- `src/renderer/src/components/image/ImageGenerator.vue`

---

### 5. FR-IMG-005 历史分组显示 ✅

**实现内容：**
- `ImageSidebar.vue` 添加 `groupedImages` 计算属性
- 按"今天"、"昨天"、"更早"分组显示图像
- 添加分组标题样式

**文件变更：**
- `src/renderer/src/components/image/ImageSidebar.vue`

---

## 待完成功能

### 边界情况处理

1. **无可用提供商空状态**
   - 显示引导用户去设置
   - 待实现

2. **错误处理优化**
   - 更详细的错误提示（内容违规、限流、网络问题等）
   - 待实现

---

## 文件变更总结

| 文件 | 变更行数 | 说明 |
|------|---------|------|
| `src/main/ipc/handlers/image.handler.ts` | +109 | 下载和文件选择处理器 |
| `src/main/services/image.service.ts` | +179 | 提供商复用和下载功能 |
| `src/preload/index.ts` | +12 | 新的 IPC API |
| `src/renderer/src/components/image/ImageGenerator.vue` | +61 | setParams 和参考图片 |
| `src/renderer/src/components/image/ImageResult.vue` | +11 | 真正的下载功能 |
| `src/renderer/src/components/image/ImageSidebar.vue` | +286 | 历史分组显示 |
| `src/renderer/src/composables/useImage.ts` | +45 | 下载和选择图片方法 |
| `src/renderer/src/views/Image.vue` | +18 | 重新生成参数填充 |

**总计：** 8 个文件，+633 行，-88 行

---

## 测试要点

- [ ] 下载图像：选择保存位置，文件正确保存
- [ ] 重新生成：参数正确填充，可修改后生成
- [ ] 提供商复用：从设置配置的提供商中正确筛选图像模型
- [ ] 参考图片：选择图片后正确显示
- [ ] 历史分组：今天/昨天/更早正确分组