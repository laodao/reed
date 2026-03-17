# F02-02 - 参数设置

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M02 - 图像生成 |
| 功能编号 | F02-02 |
| 功能名称 | 参数设置 |
| 优先级 | P0 |
| 功能描述 | 设置图像生成参数（尺寸、风格、品质、数量等） |

## 2. 界面设计

### 2.1 参数设置面板

```
┌─────────────────────────────────────────────────────────────────────────┐
│  生成参数                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  图像尺寸                                                                │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ ○ 512x512 (方形)      ○ 1024x1024 (大方形)                        ││
│  │ ● 1024x768 (横版)     ○ 768x1024 (竖版)                          ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  生成数量                                                                │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │  [1]  [2]  [4]                                                     ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ───────────────────────── 高级选项 ─────────────────────────           │
│                                                                          │
│  风格                                                                    │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ [写实 ▼]                                                            ││
│  │   写实、动漫、油画、水彩、素描、像素、赛博朋克...                   ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  品质                                                                    │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ [标准 ▼]                                                            ││
│  │   标准、高清、超高清                                                 ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  负面提示词（可选）                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ 不希望出现的内容，如：模糊、低质量、变形...                         ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  参考图（可选）                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │                        [上传图片]                                   ││
│  │              支持 JPG、PNG 格式，最大 5MB                           ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. 数据设计

### 3.1 参数类型

```typescript
// 图像尺寸选项
interface SizeOption {
  label: string          // 显示标签
  value: string          // 值 "宽x高"
  width: number
  height: number
}

// 风格选项
interface StyleOption {
  label: string          // 显示标签
  value: string          // 值
  preview?: string       // 预览图URL
}

// 品质选项
interface QualityOption {
  label: string
  value: string
  description: string    // 描述
}

// 生成参数
interface GenerateParams {
  size: string           // 尺寸 "宽x高"
  width: number
  height: number
  count: number          // 生成数量 1-4
  style?: string         // 风格
  quality?: string       // 品质
  negativePrompt?: string // 负面提示词
  referenceImage?: string // 参考图Base64或路径
}
```

### 3.2 预设配置

```typescript
// 尺寸选项
const sizeOptions: SizeOption[] = [
  { label: '512x512 (方形)', value: '512x512', width: 512, height: 512 },
  { label: '1024x1024 (大方形)', value: '1024x1024', width: 1024, height: 1024 },
  { label: '1024x768 (横版)', value: '1024x768', width: 1024, height: 768 },
  { label: '768x1024 (竖版)', value: '768x1024', width: 768, height: 1024 },
  { label: '1920x1080 (壁纸)', value: '1920x1080', width: 1920, height: 1080 }
]

// 风格选项
const styleOptions: StyleOption[] = [
  { label: '写实', value: 'realistic' },
  { label: '动漫', value: 'anime' },
  { label: '油画', value: 'oil_painting' },
  { label: '水彩', value: 'watercolor' },
  { label: '素描', value: 'sketch' },
  { label: '像素', value: 'pixel' },
  { label: '赛博朋克', value: 'cyberpunk' },
  { label: '3D渲染', value: '3d_render' }
]

// 品质选项
const qualityOptions: QualityOption[] = [
  { label: '标准', value: 'standard', description: '平衡速度和质量' },
  { label: '高清', value: 'hd', description: '更高质量，生成较慢' },
  { label: '超高清', value: 'ultra', description: '最高质量，生成最慢' }
]
```

## 4. 涉及文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/stores/image.ts` | 图像状态管理 |
| `src/renderer/src/components/image/ParamsPanel.vue` | 参数设置面板 |
| `src/renderer/src/components/image/SizeSelector.vue` | 尺寸选择器 |
| `src/renderer/src/components/image/StyleSelector.vue` | 风格选择器 |

## 5. 函数设计

### 5.1 前端函数

#### stores/image.ts

```typescript
/**
 * 生成参数
 */
const params = ref<GenerateParams>({
  size: '1024x1024',
  width: 1024,
  height: 1024,
  count: 1,
  style: undefined,
  quality: undefined,
  negativePrompt: undefined,
  referenceImage: undefined
})

/**
 * 更新参数
 * @param newParams - 新参数
 */
function updateParams(newParams: Partial<GenerateParams>): void

/**
 * 重置参数为默认值
 */
function resetParams(): void

/**
 * 设置参考图
 * @param file - 图片文件
 * @returns Promise<void>
 * 逻辑：
 * 1. 验证文件格式（JPG/PNG）
 * 2. 验证文件大小（≤5MB）
 * 3. 转换为Base64或保存到临时目录
 * 4. 设置 referenceImage
 */
async function setReferenceImage(file: File): Promise<void>

/**
 * 清除参考图
 */
function clearReferenceImage(): void
```

## 6. 边界检查

| 场景 | 验证规则 | 处理方式 |
|-----|---------|---------|
| 尺寸不支持 | Provider不支持该尺寸 | 显示警告或自动调整 |
| 数量超限 | count > maxCount | 限制为最大值 |
| 参考图格式错误 | 非JPG/PNG | 显示"不支持的格式" |
| 参考图过大 | size > 5MB | 显示"图片过大" |
| 负面提示词过长 | length > 500 | 截断或提示 |

## 7. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 选择尺寸 | 点击尺寸选项 | 更新参数 |
| TC002 | 选择数量 | 点击数量选项 | 更新数量 |
| TC003 | 选择风格 | 下拉选择风格 | 更新风格 |
| TC004 | 上传参考图 | 选择图片文件 | 显示预览 |
| TC005 | 清除参考图 | 点击清除 | 移除参考图 |
| TC006 | 重置参数 | 点击重置 | 恢复默认值 |
