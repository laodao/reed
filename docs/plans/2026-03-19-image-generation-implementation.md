# 图像生成功能实现计划

## 1. 概述

### 1.1 目标
实现图像生成功能，首批支持百炼平台文生图 API，后续逐步扩展其他平台（火山引擎、Minimax、智谱 AI）。

### 1.2 参考文档
- 百炼平台 API 文档：https://bailian.console.aliyun.com
- 现有设计文档：`docs/design/modules/M02-image.md`
- 功能设计文档：`docs/design/functions/F02-01-image-generate.md`

### 1.3 实现策略
- **首批**：只接入百炼平台，验证架构
- **迭代**：逐步添加火山引擎、Minimax、智谱 AI
- **复用**：复用现有的 Provider 配置系统

---

## 2. 架构设计

### 2.1 目录结构

```
src/
├── main/                                    # 主进程
│   ├── image-providers/                     # 图像生成 Provider 模块（新增）
│   │   ├── base-image-provider.ts          # 图像生成基类
│   │   ├── bailian-image.provider.ts        # 百炼图像 Provider
│   │   ├── volcengine-image.provider.ts     # 火山引擎（后期）
│   │   ├── minimax-image.provider.ts        # Minimax（后期）
│   │   ├── zhipu-image.provider.ts          # 智谱 AI（后期）
│   │   └── index.ts                         # Provider 工厂
│   ├── services/
│   │   └── image.service.ts                 # 图像生成服务
│   ├── ipc/handlers/
│   │   └── image.handler.ts                 # 图像 IPC 处理器
│   └── database/repositories/
│       └── image.repository.ts              # 已有，需扩展
│
├── shared/types/
│   ├── image.types.ts                       # 已有，需扩展
│   └── image-provider.types.ts              # 新增：图像 Provider 类型
│
└── renderer/src/                            # 渲染进程
    ├── views/
    │   └── Image.vue                        # 图像生成页面（重构）
    ├── components/image/                    # 图像组件目录
    │   ├── ImageSidebar.vue                 # 侧边栏（历史记录）
    │   ├── ImageGenerator.vue               # 生成控制面板
    │   ├── ImageResult.vue                  # 结果展示区域
    │   └── ImageCard.vue                    # 单张图片卡片
    └── composables/
        └── useImage.ts                      # 图像生成 Composable
```

### 2.2 与现有架构的关系

| 模块 | 关系 |
|------|------|
| Provider 配置 | 复用现有 `provider_configs` 表，通过 `template_id` 区分图像类 Provider |
| 图像存储 | 扩展现有 `images` 表，添加生成参数字段 |
| IPC 通道 | 新增图像专用 IPC 通道，不影响现有通道 |
| 前端状态 | 使用 Composable 模式，参考 `useChat.ts` |

---

## 3. 数据模型扩展

### 3.1 扩展 images 表

```sql
-- 新增字段
ALTER TABLE images ADD COLUMN prompt TEXT;              -- 生成提示词
ALTER TABLE images ADD COLUMN negative_prompt TEXT;      -- 负面提示词
ALTER TABLE images ADD COLUMN style TEXT;                -- 风格
ALTER TABLE images ADD COLUMN quality TEXT;              -- 品质
ALTER TABLE images ADD COLUMN provider_id TEXT;          -- 提供商 ID
ALTER TABLE images ADD COLUMN model_id TEXT;             -- 模型 ID
ALTER TABLE images ADD COLUMN generation_params TEXT;    -- 其他生成参数 JSON
ALTER TABLE images ADD COLUMN seed INTEGER;              -- 随机种子
ALTER TABLE images ADD COLUMN task_id TEXT;              -- 异步任务 ID
ALTER TABLE images ADD COLUMN status TEXT DEFAULT 'completed'; -- 状态
ALTER TABLE images ADD COLUMN error_message TEXT;        -- 错误信息
```

### 3.2 扩展 ImageRecord 类型

```typescript
export interface ImageRecord {
  // 已有字段
  id: string
  dialogId?: string
  messageId?: string
  filePath: string
  fileName?: string
  fileSize?: number
  mimeType?: string
  width?: number
  height?: number
  favorite: boolean
  createdAt: Date

  // 新增字段
  prompt?: string
  negativePrompt?: string
  style?: string
  quality?: string
  providerId?: string
  modelId?: string
  generationParams?: Record<string, any>
  seed?: number
  taskId?: string
  status: 'pending' | 'completed' | 'failed'
  errorMessage?: string
}
```

---

## 4. IPC 接口设计

### 4.1 IPC 通道定义

```typescript
export const IMAGE_IPC_CHANNELS = {
  // 生成相关
  GENERATE_IMAGE: 'image:generate',
  GET_TASK_STATUS: 'image:task-status',
  STOP_GENERATION: 'image:stop',

  // 图像管理
  LIST_IMAGES: 'image:list',
  GET_IMAGE: 'image:get',
  DELETE_IMAGE: 'image:delete',
  TOGGLE_FAVORITE: 'image:toggle-favorite',

  // Provider 相关
  LIST_IMAGE_PROVIDERS: 'image:providers',
  GET_IMAGE_MODELS: 'image:models',
  TEST_IMAGE_PROVIDER: 'image:test-provider'
} as const
```

### 4.2 请求/响应类型

```typescript
// 生成图像请求
interface GenerateImageRequest {
  providerId: string
  modelId: string
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  style?: string
  quality?: string
  count?: number  // 默认 1
  seed?: number
}

// 生成图像响应
interface GenerateImageResponse {
  success: boolean
  taskId?: string
  images?: ImageRecord[]
  error?: string
}

// 图像 Provider 信息
interface ImageProvider {
  id: string
  name: string
  configured: boolean
  models: ImageModel[]
}

// 图像模型信息
interface ImageModel {
  id: string
  name: string
  providerId: string
  providerName: string
  features: {
    textToImage: boolean
    imageToImage: boolean
    imageEdit: boolean
    maxResolution: string
    supportedSizes: string[]
  }
}
```

---

## 5. 百炼平台 API 实现

### 5.1 API 特点
- 使用阿里云 API 签名认证
- 异步任务模式，需要轮询获取结果
- 支持文生图、图生图

### 5.2 BaseImageProvider 基类

```typescript
export abstract class BaseImageProvider {
  protected config: ImageProviderConfig

  constructor(config: ImageProviderConfig) {
    this.config = config
  }

  // 核心方法
  abstract get id(): string
  abstract get name(): string
  abstract getModels(): Promise<ImageModel[]>
  abstract generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>
  abstract getTaskStatus(taskId: string): Promise<ImageTaskStatus>
  abstract testConnection(): Promise<{ success: boolean; message: string }>

  // 工具方法
  protected abstract buildHeaders(): Record<string, string>
  protected abstract buildUrl(endpoint: string): string
}
```

### 5.3 百炼 Provider 实现

```typescript
export class BailianImageProvider extends BaseImageProvider {
  private static API_BASE_URL = 'https://bailian.cn-beijing.aliyuncs.com'

  get id() { return 'bailian' }
  get name() { return '百炼平台' }

  async getModels(): Promise<ImageModel[]> {
    return [
      {
        id: 'wanx-v1',
        name: '通义万相 v1',
        providerId: 'bailian',
        providerName: '百炼平台',
        features: {
          textToImage: true,
          imageToImage: true,
          imageEdit: false,
          maxResolution: '2048x2048',
          supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024']
        }
      }
    ]
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    // 1. 构建请求参数
    // 2. 调用百炼 API 创建任务
    // 3. 返回任务 ID
  }

  // 阿里云 API 签名
  private signRequest(params: any): string { ... }
}
```

---

## 6. 前端界面设计

### 6.1 组件拆分

| 组件 | 功能 |
|------|------|
| `Image.vue` | 主页面，组合 Sidebar 和主区域 |
| `ImageSidebar.vue` | 左侧历史记录列表，支持收藏筛选 |
| `ImageGenerator.vue` | 生成控制面板（模型选择、提示词、参数） |
| `ImageResult.vue` | 结果展示区域，支持下载、收藏、删除 |
| `ImageCard.vue` | 单张图片卡片，显示缩略图和操作按钮 |

### 6.2 状态管理

```typescript
// composables/useImage.ts
export function useImage() {
  const images = ref<ImageRecord[]>([])
  const currentTask = ref<ImageGenerationTask | null>(null)
  const providers = ref<ImageProvider[]>([])
  const selectedProvider = ref<string>('')
  const selectedModel = ref<string>('')

  // 生成相关方法
  async function generateImage(request: GenerateImageRequest) { ... }
  async function stopGeneration() { ... }

  // 图像管理方法
  async function loadImages(page: number) { ... }
  async function deleteImage(id: string) { ... }
  async function toggleFavorite(id: string) { ... }

  // Provider 方法
  async function loadProviders() { ... }
  async function loadModels(providerId: string) { ... }

  return { ... }
}
```

---

## 7. 实现计划

### 7.1 阶段一：基础架构（Day 1-2）

| 任务 | 描述 | 文件 |
|------|------|------|
| 1.1 | 扩展类型定义 | `src/shared/types/image.types.ts` |
| 1.2 | 新增图像 Provider 类型 | `src/shared/types/image-provider.types.ts` |
| 1.3 | 扩展数据库表结构 | `src/main/database/index.ts` |
| 1.4 | 扩展 ImageRepository | `src/main/database/repositories/image.repository.ts` |
| 1.5 | 创建 BaseImageProvider | `src/main/image-providers/base-image-provider.ts` |

### 7.2 阶段二：百炼 Provider（Day 3-4）

| 任务 | 描述 | 文件 |
|------|------|------|
| 2.1 | 实现百炼 Provider | `src/main/image-providers/bailian-image.provider.ts` |
| 2.2 | 创建 Provider 工厂 | `src/main/image-providers/index.ts` |
| 2.3 | 创建图像服务 | `src/main/services/image.service.ts` |
| 2.4 | 创建 IPC 处理器 | `src/main/ipc/handlers/image.handler.ts` |
| 2.5 | 注册 IPC 通道 | `src/main/ipc/index.ts` |

### 7.3 阶段三：前端界面（Day 5-7）

| 任务 | 描述 | 文件 |
|------|------|------|
| 3.1 | 创建 useImage Composable | `src/renderer/src/composables/useImage.ts` |
| 3.2 | 创建 ImageSidebar 组件 | `src/renderer/src/components/image/ImageSidebar.vue` |
| 3.3 | 创建 ImageGenerator 组件 | `src/renderer/src/components/image/ImageGenerator.vue` |
| 3.4 | 创建 ImageResult 组件 | `src/renderer/src/components/image/ImageResult.vue` |
| 3.5 | 创建 ImageCard 组件 | `src/renderer/src/components/image/ImageCard.vue` |
| 3.6 | 重构 Image.vue 主页面 | `src/renderer/src/views/Image.vue` |

### 7.4 阶段四：集成测试（Day 8）

| 任务 | 描述 |
|------|------|
| 4.1 | 端到端测试 |
| 4.2 | 错误处理测试 |
| 4.3 | 边界条件测试 |

---

## 8. 文件存储策略

```
用户数据目录/
└── images/
    └── {year}/
        └── {month}/
            └── {day}/
                └── {uuid}.png
```

---

## 9. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| 提示词为空 | E201 | 请输入提示词 | 前端提示 |
| API密钥未配置 | E203 | 请先配置API密钥 | 弹窗提示 |
| 生成失败 | E204 | 图像生成失败：{原因} | 弹窗提示 |
| 内容违规 | E206 | 提示词包含敏感内容 | 前端提示 |

---

## 10. 后续扩展

### 10.1 火山引擎 Provider
- API 文档：https://www.volcengine.com/docs/85621/1616429
- 实现方式类似百炼

### 10.2 Minimax Provider
- API 文档：https://platform.minimaxi.com/docs/api-reference/image-generation-t2i
- 实现方式类似百炼

### 10.3 智谱 AI Provider
- API 文档：https://docs.bigmodel.cn/api-reference
- 实现方式类似百炼

### 10.4 图生图功能
- 需要图片上传组件
- 需要扩展 API 参数

### 10.5 图片编辑功能
- 需要图片编辑器组件
- 需要蒙版绘制功能