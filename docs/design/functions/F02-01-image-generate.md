# F02-01 - 图像生成

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M02 - 图像生成 |
| 功能编号 | F02-01 |
| 功能名称 | 图像生成 |
| 优先级 | P0 |
| 功能描述 | 根据文字描述生成图像，支持多种图像生成模型 |

## 2. 操作流程

### 2.1 生成图像

```
用户输入提示词
    │
    ▼
设置生成参数（尺寸、风格等）
    │
    ▼
点击"生成"按钮
    │
    ▼
前端验证提示词非空
    │
    ├── 为空 → 显示错误提示
    │
    ▼
显示生成中状态
    │
    ▼
调用 image:generate IPC
    │
    ▼
主进程接收请求
    │
    ├── 检查API密钥是否配置
    │
    ├── 未配置 → 返回错误
    │
    ▼
调用图像生成 Provider API
    │
    ▼
等待API返回图像URL
    │
    ▼
下载图像到本地存储
    │
    ▼
保存记录到数据库
    │
    ▼
返回图像信息
    │
    ▼
前端显示生成的图像
```

### 2.2 重新生成

```
用户点击"重新生成"按钮
    │
    ▼
使用相同参数再次调用生成API
    │
    ▼
显示新生成的图像
    │
    ▼
保存新的记录
```

## 3. 界面设计

### 3.1 图像生成区域

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AI生图                                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  模型: [通义万相 ▼]                                                      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │                                                                    ││
│  │                                                                    ││
│  │                         生成的图像                                 ││
│  │                                                                    ││
│  │                       [点击查看大图]                               ││
│  │                                                                    ││
│  │                                                                    ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  [下载] [重新生成] [查看详情]                                           │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  提示词                                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ 一只可爱的猫咪，坐在窗台上，阳光透过窗户洒进来，温馨的氛围，       ││
│  │ 油画风格，细节丰富                                                  ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  尺寸 [1024x1024 ▼]  风格 [写实 ▼]  数量 [1 ▼]        [生成]           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 生成中状态

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                                                                    │
│                         ⏳ 生成中...                               │
│                                                                    │
│                       ████████░░░░ 45%                            │
│                                                                    │
│                       预计需要 15 秒                               │
│                                                                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 3.3 图像详情对话框

```
┌─────────────────────────────────────────────┐
│  图像详情                                    │
├─────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │                                        │ │
│  │           [生成的图像]                 │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  提示词                                      │
│  一只可爱的猫咪，坐在窗台上...               │
│                                              │
│  模型: 通义万相-v2                           │
│  尺寸: 1024x1024                             │
│  风格: 写实                                  │
│  生成时间: 2024-01-15 10:30:25              │
│                                              │
├─────────────────────────────────────────────┤
│  [下载] [复制提示词] [重新生成] [删除]       │
└─────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 图像记录
interface ImageRecord {
  id: string                    // 图像ID
  provider: string              // 提供商
  model: string                 // 使用的模型
  prompt: string                // 提示词
  negativePrompt?: string       // 负面提示词
  imageUrl: string              // 图像URL
  localPath: string             // 本地存储路径
  width: number                 // 宽度
  height: number                // 高度
  style?: string                // 风格
  quality?: string              // 品质
  seed?: number                 // 随机种子
  createdAt: Date               // 创建时间
  favorite: boolean             // 是否收藏
}

// 生成请求
interface GenerateImageRequest {
  provider: string              // 提供商
  model: string                 // 模型
  prompt: string                // 提示词
  negativePrompt?: string       // 负面提示词
  width: number                 // 宽度
  height: number                // 高度
  style?: string                // 风格
  quality?: string              // 品质
  count?: number                // 生成数量（默认1）
}

// 生成响应
interface GenerateImageResponse {
  success: boolean
  images?: ImageRecord[]        // 生成的图像列表
  error?: string                // 错误信息
}
```

### 4.2 数据库表

```sql
-- 图像记录表
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  image_url TEXT,
  local_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  style TEXT,
  quality TEXT,
  seed INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  favorite INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX idx_images_created_at ON images(created_at DESC);
CREATE INDEX idx_images_favorite ON images(favorite, created_at DESC);
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/views/ImageView.vue` | 图像生成页面 |
| `src/renderer/src/stores/image.ts` | 图像状态管理 |
| `src/renderer/src/components/image/ImageDisplay.vue` | 图像显示组件 |
| `src/renderer/src/components/image/ImageDetail.vue` | 图像详情对话框 |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/image.handler.ts` | 图像IPC处理器 |
| `src/main/services/image.service.ts` | 图像服务 |
| `src/main/database/repositories/image.repository.ts` | 图像数据访问 |
| `src/main/providers/image/base-image-provider.ts` | 图像Provider基类 |

### 5.3 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/image.types.ts` | 图像类型定义 |

## 6. 函数设计

### 6.1 前端函数

#### stores/image.ts

```typescript
/**
 * 当前生成的图像
 */
const currentImage = ref<ImageRecord | null>(null)

/**
 * 是否正在生成
 */
const isGenerating = ref(false)

/**
 * 生成进度
 */
const generateProgress = ref(0)

/**
 * 生成图像
 * @param request - 生成请求
 * @returns Promise<void>
 * 逻辑：
 * 1. 验证提示词非空
 * 2. 设置 isGenerating = true
 * 3. 调用 window.electronAPI.generateImage(request)
 * 4. 成功后设置 currentImage
 * 5. 添加到历史列表
 * 6. 设置 isGenerating = false
 */
async function generateImage(request: GenerateImageRequest): Promise<void>

/**
 * 重新生成
 * @returns Promise<void>
 * 逻辑：
 * 1. 使用当前参数重新调用生成
 */
async function regenerate(): Promise<void>

/**
 * 下载图像
 * @param image - 图像记录
 * @returns Promise<void>
 */
async function downloadImage(image: ImageRecord): Promise<void>

/**
 * 删除图像
 * @param imageId - 图像ID
 * @returns Promise<void>
 */
async function deleteImage(imageId: string): Promise<void>
```

### 6.2 后端函数

#### image.handler.ts

```typescript
/**
 * 处理生成图像请求
 * @param event - IPC事件
 * @param request - 生成请求
 * @returns Promise<GenerateImageResponse>
 * 逻辑：
 * 1. 验证 provider 和 model
 * 2. 检查 API 密钥
 * 3. 获取 Provider 实例
 * 4. 调用 Provider.generate()
 * 5. 下载图像到本地
 * 6. 保存记录到数据库
 * 7. 返回图像信息
 */
async function handleGenerateImage(
  event: IpcMainInvokeEvent,
  request: GenerateImageRequest
): Promise<GenerateImageResponse>

/**
 * 处理获取图像列表
 */
async function handleListImages(
  event: IpcMainInvokeEvent,
  page?: number,
  pageSize?: number
): Promise<{ success: boolean, images: ImageRecord[], total: number }>

/**
 * 处理删除图像
 */
async function handleDeleteImage(
  event: IpcMainInvokeEvent,
  imageId: string
): Promise<{ success: boolean }>
```

#### services/image.service.ts

```typescript
/**
 * 下载图像到本地
 * @param url - 图像URL
 * @param fileName - 文件名
 * @returns Promise<string> - 本地路径
 * 逻辑：
 * 1. 发起 HTTP 请求下载图像
 * 2. 保存到应用数据目录
 * 3. 返回本地路径
 */
async function downloadImage(url: string, fileName: string): Promise<string>

/**
 * 生成唯一文件名
 * @param extension - 文件扩展名
 * @returns string
 */
function generateFileName(extension: string): string
```

#### providers/image/base-image-provider.ts

```typescript
/**
 * 图像生成 Provider 基类
 */
abstract class BaseImageProvider {
  /**
   * 生成图像
   * @param request - 生成请求
   * @returns Promise<string[]> - 图像URL列表
   */
  abstract async generate(request: GenerateImageRequest): Promise<string[]>

  /**
   * 获取支持的尺寸
   * @returns string[]
   */
  abstract getSupportedSizes(): string[]

  /**
   * 获取支持的风格
   * @returns string[]
   */
  abstract getSupportedStyles(): string[]
}
```

## 7. 边界检查

| 场景 | 验证规则 | 处理方式 |
|-----|---------|---------|
| 提示词为空 | `!prompt.trim()` | 显示"请输入提示词" |
| 提示词过长 | `prompt.length > 1000` | 显示"提示词过长" |
| API密钥未配置 | - | 显示"请先配置API密钥" |
| 生成失败 | API返回错误 | 显示具体错误信息 |
| 内容违规 | 敏感词检测 | 显示"提示词包含敏感内容" |

## 8. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 正常生成 | 输入提示词→生成 | 显示生成的图像 |
| TC002 | 空提示词 | 不输入→生成 | 显示错误提示 |
| TC003 | 重新生成 | 点击重新生成 | 生成新图像 |
| TC004 | 下载图像 | 点击下载 | 保存到本地 |
| TC005 | 生成多张 | 设置数量为4 | 生成4张图像 |
| TC006 | 切换尺寸 | 选择不同尺寸 | 按指定尺寸生成 |
| TC007 | 违规内容 | 输入敏感词 | 显示违规提示 |
