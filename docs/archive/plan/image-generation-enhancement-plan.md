# 图像生成模块完善计划

## 1. 概述

本文档基于 PRD `docs/prd/05-image-generation.md`，对比现有实现，列出需要完善的功能点及实现步骤。

## 2. 现状分析

### 2.1 已实现功能

| 功能编号 | 功能名称 | 实现状态 | 说明 |
|---------|---------|---------|------|
| FR-IMG-001 | 文生图 | ✅ 已实现 | 基本功能完整 |
| FR-IMG-002 | 高级选项配置 | ✅ 已实现 | 负面提示词、风格、质量、种子都有 |
| FR-IMG-003 | 生成进度显示 | ✅ 已实现 | 轮询机制已实现 |
| FR-IMG-004 | 停止生成 | ✅ 已实现 | 停止轮询和任务 |
| FR-IMG-005 | 查看生成历史 | ✅ 已实现 | 分页加载已实现 |
| FR-IMG-006 | 查看图像详情 | ✅ 已实现 | 详情对话框已实现 |
| FR-IMG-008 | 删除图像 | ✅ 已实现 | 删除文件和记录 |

### 2.2 需要完善的功能

| 功能编号 | 功能名称 | 问题描述 | 优先级 |
|---------|---------|---------|--------|
| FR-IMG-007 | 下载图像 | 目前只复制路径，需实现真正的文件保存对话框 | 高 |
| FR-IMG-009 | 重新生成 | 点击重新生成后没有自动填充参数到生成面板 | 高 |
| FR-IMG-010 | 提供商复用 | 当前使用独立的图像提供商配置，应复用现有的 AI 提供商配置 | 高 |
| FR-IMG-002 | 参考图片 | 参考图片上传功能未实现 | 中 |
| FR-IMG-005 | 历史分组 | 历史列表未按"今天/昨天/更早"分组显示 | 中 |
| 边界情况 | 无提供商 | 无可用提供商时的空状态和引导未完善 | 中 |
| 边界情况 | 错误处理 | 生成失败、网络中断等错误处理需完善 | 低 |

---

## 3. 实现计划

### 3.1 FR-IMG-007 下载图像功能

**需求描述**：用户可以下载生成的图像到本地，弹出文件保存对话框。

**实现步骤**：

#### 步骤 1：添加主进程下载 API

**文件**：`src/main/ipc/handlers/image.handler.ts`

添加新的 IPC 处理器：

```typescript
ipcMain.handle('image:download', handleImageDownload)

async function handleImageDownload(
  event: IpcMainInvokeEvent,
  imageId: string
): Promise<IpcResponse<string>> {
  // 1. 获取图像记录
  // 2. 弹出文件保存对话框
  // 3. 复制文件到目标位置
  // 4. 返回保存路径
}
```

#### 步骤 2：添加 preload API

**文件**：`src/preload/index.ts`

```typescript
image: {
  // ...existing APIs
  download: (imageId: string) => ipcRenderer.invoke('image:download', imageId)
}
```

#### 步骤 3：更新前端组件

**文件**：`src/renderer/src/components/image/ImageResult.vue`

```typescript
async function handleDownload(): Promise<void> {
  if (!currentImage.value) return

  try {
    const response = await window.electronAPI.image.download(currentImage.value.id)
    if (response.success) {
      ElMessage.success(`图像已保存到: ${response.data}`)
    } else {
      ElMessage.error(response.error || '下载失败')
    }
  } catch (err) {
    ElMessage.error('下载失败')
  }
}
```

---

### 3.2 FR-IMG-009 使用相同参数重新生成

**需求描述**：点击"重新生成"后，将历史图像的参数自动填充到生成面板。

**实现步骤**：

#### 步骤 1：更新 ImageGenerator 组件

**文件**：`src/renderer/src/components/image/ImageGenerator.vue`

添加公开方法 `setParams`：

```typescript
/**
 * 设置生成参数（用于重新生成）
 */
function setParams(params: {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  style?: string
  quality?: string
  seed?: number
  providerId?: string
  modelId?: string
}): void {
  prompt.value = params.prompt
  negativePrompt.value = params.negativePrompt || ''
  selectedSize.value = `${params.width}x${params.height}`
  selectedStyle.value = params.style || ''
  selectedQuality.value = params.quality || ''
  seed.value = params.seed ?? -1

  // 如果有提供商和模型，也设置
  if (params.providerId && params.providerId !== selectedProviderId.value) {
    selectProvider(params.providerId)
  }
  if (params.modelId) {
    selectedModelId.value = params.modelId
  }
}

// 暴露方法
defineExpose({
  setParams
})
```

#### 步骤 2：更新 Image.vue 页面

**文件**：`src/renderer/src/views/Image.vue`

```typescript
async function handleRegenerate(image: ImageRecord): Promise<void> {
  // 填充参数到生成器
  if (generatorRef.value) {
    generatorRef.value.setParams({
      prompt: image.prompt,
      negativePrompt: image.negativePrompt,
      width: image.width || 1024,
      height: image.height || 1024,
      style: image.style,
      quality: image.quality,
      seed: image.seed,
      providerId: image.providerId,
      modelId: image.modelId
    })
  }

  // 刷新列表
  await loadImages()
}
```

---

### 3.3 FR-IMG-010 图像提供商复用

**需求描述**：图像生成应使用现有的 AI 提供商配置系统，从包含 `image` 类型模型的提供商中选择。

**当前问题**：图像模块使用独立的 `image-*` 前缀的提供商配置，与 AI 对话的提供商配置分离。

**实现步骤**：

#### 步骤 1：更新 ImageService.getProviders

**文件**：`src/main/services/image.service.ts`

修改 `getProviders` 方法，从现有提供商配置中筛选包含图像模型的提供商：

```typescript
static async getProviders(): Promise<{ success: boolean; data?: ImageProvider[]; error?: string }> {
  const dbManager = getDatabaseManager()

  if (!dbManager.providerConfigs) {
    return { success: false, error: '数据库未初始化' }
  }

  try {
    // 获取所有已启用的提供商配置
    const enabledConfigs = await dbManager.providerConfigs.getEnabled()

    const providers: ImageProvider[] = []

    for (const config of enabledConfigs) {
      // 检查该提供商是否有图像类型的模型
      const models = config.models || []
      const imageModels = models.filter(m =>
        m.type === 'image' ||
        m.type === 'multimodal' // 多模态模型也可能支持图像生成
      )

      if (imageModels.length > 0) {
        providers.push({
          id: config.id,
          name: config.name,
          configured: !!config.apiKey,
          models: imageModels.map(m => ({
            id: m.id,
            name: m.name || m.id,
            providerId: config.id,
            providerName: config.name,
            features: {
              textToImage: true,
              imageToImage: false,
              imageEdit: false,
              maxResolution: m.contextWindow ? `${m.contextWindow}x${m.contextWindow}` : '1024x1024',
              supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024']
            }
          }))
        })
      }
    }

    return { success: true, data: providers }
  } catch (error: any) {
    console.error('[ImageService.getProviders] 错误:', error)
    return { success: false, error: error.message || '获取 Provider 列表失败' }
  }
}
```

#### 步骤 2：更新 ImageService.generateImage

**文件**：`src/main/services/image.service.ts`

修改生成图像方法，使用现有提供商配置和对应的 Provider 实现：

```typescript
static async generateImage(
  window: BrowserWindow,
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  // ...existing code...

  // 获取提供商配置
  const providerConfig = await dbManager.providerConfigs.getById(request.providerConfigId)

  if (!providerConfig) {
    return { success: false, error: '未找到提供商配置' }
  }

  // 根据 templateId 创建对应的 Provider
  const provider = createProvider(providerConfig.templateId, {
    // 使用统一的 Provider 工厂
  })

  // ...rest of the implementation
}
```

#### 步骤 3：更新前端模型选择

**文件**：`src/renderer/src/composables/useImage.ts`

确保 `loadProviders` 正确加载图像提供商：

```typescript
async function loadProviders(): Promise<void> {
  try {
    loading.value = true
    error.value = null

    const response = await window.electronAPI.image.getProviders()

    if (response.success && response.data) {
      providers.value = response.data

      // 自动选择第一个已配置的提供商
      const configuredProvider = providers.value.find(p => p.configured && p.models.length > 0)
      if (configuredProvider) {
        selectedProviderId.value = configuredProvider.id
        // 模型已经在 providers 中
        if (configuredProvider.models.length > 0) {
          selectedModelId.value = configuredProvider.models[0].id
        }
      }
    } else {
      error.value = response.error || '加载提供商失败'
    }
  } finally {
    loading.value = false
  }
}
```

---

### 3.4 FR-IMG-002 参考图片上传

**需求描述**：用户可以上传参考图片用于垫图生成。

**实现步骤**：

#### 步骤 1：添加主进程文件选择 API

**文件**：`src/main/ipc/handlers/image.handler.ts`

```typescript
ipcMain.handle('image:select-file', handleImageSelectFile)

async function handleImageSelectFile(
  event: IpcMainInvokeEvent
): Promise<IpcResponse<{ path: string; base64: string }>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const result = await dialog.showOpenDialog(window, {
    title: '选择参考图片',
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
    ],
    properties: ['openFile'],
    maxFileSize: 5 * 1024 * 1024 // 5MB
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' }
  }

  const filePath = result.filePaths[0]

  // 读取文件并转为 base64
  const buffer = fs.readFileSync(filePath)
  const base64 = buffer.toString('base64')
  const mimeType = getMimeType(filePath)

  return {
    success: true,
    data: {
      path: filePath,
      base64: `data:${mimeType};base64,${base64}`
    }
  }
}
```

#### 步骤 2：添加 preload API

**文件**：`src/preload/index.ts`

```typescript
image: {
  // ...existing APIs
  selectFile: () => ipcRenderer.invoke('image:select-file')
}
```

#### 步骤 3：更新 ImageGenerator 组件

**文件**：`src/renderer/src/components/image/ImageGenerator.vue`

```typescript
async function handleUploadReference(): Promise<void> {
  try {
    const response = await window.electronAPI.image.selectFile()
    if (response.success && response.data) {
      referenceImage.value = response.data.base64
    }
  } catch (err) {
    ElMessage.error('选择图片失败')
  }
}
```

---

### 3.5 FR-IMG-005 历史分组显示

**需求描述**：图像历史列表按"今天/昨天/更早"分组显示。

**实现步骤**：

#### 步骤 1：添加分组计算属性

**文件**：`src/renderer/src/components/image/ImageSidebar.vue`

```typescript
import { computed } from 'vue'

// 分组后的图像列表
const groupedImages = computed(() => {
  const today: ImageRecord[] = []
  const yesterday: ImageRecord[] = []
  const earlier: ImageRecord[] = []

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  for (const image of images.value) {
    const date = typeof image.createdAt === 'string' ? new Date(image.createdAt) : image.createdAt

    if (date >= todayStart) {
      today.push(image)
    } else if (date >= yesterdayStart) {
      yesterday.push(image)
    } else {
      earlier.push(image)
    }
  }

  return { today, yesterday, earlier }
})
```

#### 步骤 2：更新模板

```vue
<template v-if="images.length > 0">
  <!-- 今天 -->
  <div v-if="groupedImages.today.length > 0" class="image-group">
    <div class="group-title">今天</div>
    <div
      v-for="image in groupedImages.today"
      :key="image.id"
      class="image-card"
      ...
    >
      <!-- image card content -->
    </div>
  </div>

  <!-- 昨天 -->
  <div v-if="groupedImages.yesterday.length > 0" class="image-group">
    <div class="group-title">昨天</div>
    <!-- ... -->
  </div>

  <!-- 更早 -->
  <div v-if="groupedImages.earlier.length > 0" class="image-group">
    <div class="group-title">更早</div>
    <!-- ... -->
  </div>

  <!-- 加载更多 -->
  <div v-if="hasMore" class="load-more">
    <!-- ... -->
  </div>
</template>
```

---

### 3.6 边界情况处理

#### 3.6.1 无可用提供商

**文件**：`src/renderer/src/components/image/ImageGenerator.vue`

```vue
<!-- 无可用提供商提示 -->
<div v-if="providers.length === 0 && !loading" class="no-provider-state">
  <el-empty description="暂无可用的图像生成提供商">
    <template #image>
      <el-icon :size="48"><WarningFilled /></el-icon>
    </template>
    <el-button type="primary" @click="goToSettings">
      去设置
    </el-button>
  </el-empty>
</div>

<!-- 正常的生成面板 -->
<div v-else class="image-generator">
  <!-- ...existing content -->
</div>
```

```typescript
import { useRouter } from 'vue-router'

const router = useRouter()

function goToSettings(): void {
  router.push('/settings?tab=providers')
}
```

#### 3.6.2 生成失败错误处理

**文件**：`src/renderer/src/composables/useImage.ts`

```typescript
// 在 generateImage 方法中
if (response.success && response.data?.taskId) {
  // ...existing code
} else {
  // 根据错误类型提供更详细的提示
  const errorMessage = response.error || '生成图像失败'

  if (errorMessage.includes('内容违规') || errorMessage.includes('sensitive')) {
    error.value = '提示词包含不适当内容，请修改'
  } else if (errorMessage.includes('限流') || errorMessage.includes('rate limit')) {
    error.value = 'API 调用频率超限，请稍后重试'
  } else if (errorMessage.includes('网络') || errorMessage.includes('timeout')) {
    error.value = '网络连接失败，请检查网络'
  } else {
    error.value = errorMessage
  }

  return null
}
```

---

## 4. 实现顺序

按优先级和依赖关系，建议按以下顺序实现：

1. **FR-IMG-007 下载图像** - 独立功能，用户体验关键
2. **FR-IMG-009 重新生成** - 独立功能，用户体验关键
3. **FR-IMG-010 提供商复用** - 需要调整架构，影响较大
4. **FR-IMG-002 参考图片** - 独立功能
5. **FR-IMG-005 历史分组** - UI 优化
6. **边界情况处理** - 最后完善

---

## 5. 测试要点

### 5.1 功能测试

- [ ] 下载图像：选择保存位置，文件正确保存
- [ ] 重新生成：参数正确填充，可修改后生成
- [ ] 提供商复用：从设置配置的提供商中正确筛选图像模型
- [ ] 参考图片：选择图片后正确显示和发送
- [ ] 历史分组：今天/昨天/更早正确分组

### 5.2 边界测试

- [ ] 无提供商时显示引导
- [ ] 提示词违规时显示明确错误
- [ ] 网络中断时正确处理
- [ ] 大文件上传处理

---

## 6. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/ipc/handlers/image.handler.ts` | 修改 | 添加下载和文件选择处理器 |
| `src/main/services/image.service.ts` | 修改 | 更新 getProviders 和 generateImage |
| `src/preload/index.ts` | 修改 | 添加新的 IPC API |
| `src/renderer/src/composables/useImage.ts` | 修改 | 完善错误处理 |
| `src/renderer/src/views/Image.vue` | 修改 | 实现重新生成参数填充 |
| `src/renderer/src/components/image/ImageGenerator.vue` | 修改 | 添加 setParams 方法和空状态处理 |
| `src/renderer/src/components/image/ImageSidebar.vue` | 修改 | 实现历史分组显示 |
| `src/renderer/src/components/image/ImageResult.vue` | 修改 | 实现真正的下载功能 |
