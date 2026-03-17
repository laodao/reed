# F02-03 - 模型选择

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M02 - 图像生成 |
| 功能编号 | F02-03 |
| 功能名称 | 模型选择 |
| 优先级 | P0 |
| 功能描述 | 选择图像生成模型，模型来自已配置的图像提供商 |

## 2. 界面设计

### 2.1 模型选择器

```
┌─────────────────────────────────────────────┐
│  模型: [通义万相-v2                     ▼]  │
└─────────────────────────────────────────────┘

下拉列表：
┌─────────────────────────────────────────────┐
│  通义千问                                    │
│  ├── wanx-v1          (通用图像生成)        │
│  └── wanx-v2          (高质量图像生成)      │
│                                              │
│  火山引擎                                    │
│  └── doubao-image     (多风格支持)          │
│                                              │
│  Stability AI                               │
│  └── sd-xl            (Stable Diffusion)    │
└─────────────────────────────────────────────┘
```

## 3. 数据设计

```typescript
// 图像模型
interface ImageModel {
  id: string                    // 模型ID
  provider: string              // 提供商标识
  providerName: string          // 提供商名称
  name: string                  // 显示名称
  description: string           // 描述
  sizes: string[]               // 支持的尺寸
  styles: string[]              // 支持的风格
  maxCount: number              // 最大生成数量
  supportsImageToImage: boolean // 是否支持图生图
}

// 图像提供商
interface ImageProvider {
  id: string
  name: string
  configured: boolean
  models: ImageModel[]
}
```

## 4. 函数设计

```typescript
/**
 * 加载可用图像模型
 * @returns Promise<void>
 */
async function loadImageModels(): Promise<void>

/**
 * 选择模型
 * @param model - 模型对象
 */
function selectModel(model: ImageModel): void

/**
 * 获取当前模型支持的参数
 * @returns { sizes, styles, maxCount }
 */
function getModelCapabilities(): { sizes: string[], styles: string[], maxCount: number }
```

## 5. 测试用例

| 用例ID | 描述 | 预期结果 |
|-------|------|---------|
| TC001 | 查看模型列表 | 显示所有可用模型 |
| TC002 | 选择模型 | 更新当前模型 |
| TC003 | 切换模型 | 参数选项随之更新 |
