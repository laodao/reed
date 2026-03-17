# M04 - OCR识别模块功能设计

## F04-01 图片上传

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F04-01 |
| 功能名称 | 图片上传 |
| 优先级 | P0 |
| 描述 | 上传待识别的图片 |

### 界面
```
┌─────────────────────────────────────────────┐
│                                              │
│           📷                                │
│                                              │
│      点击或拖拽图片到此处                   │
│                                              │
│      支持 JPG、PNG、BMP 格式                │
│      最大 10MB                              │
│                                              │
│                                              │
└─────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 上传图片
 * @param file - 图片文件
 * @returns Promise<string> - 图片路径
 */
async function uploadImage(file: File): Promise<string>

/**
 * 验证图片
 * @param file - 图片文件
 * @returns boolean
 * 逻辑：检查格式(JPG/PNG/BMP)和大小(≤10MB)
 */
function validateImage(file: File): boolean
```

---

## F04-02 文字识别

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F04-02 |
| 功能名称 | 文字识别 |
| 优先级 | P0 |
| 描述 | 识别图片中的文字 |

### 流程
```
上传图片 → 选择OCR引擎 → 点击识别 → 显示结果
```

### 函数
```typescript
/**
 * 识别文字
 * @param imagePath - 图片路径
 * @param provider - OCR提供商
 * @returns Promise<OcrResult>
 */
async function recognizeText(imagePath: string, provider?: string): Promise<OcrResult>

interface OcrResult {
  success: boolean
  text: string           // 识别的文字
  confidence: number     // 置信度
  blocks?: TextBlock[]   // 文字块（带位置）
}
```

---

## F04-03 结果编辑

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F04-03 |
| 功能名称 | 结果编辑 |
| 优先级 | P1 |
| 描述 | 编辑识别结果 |

### 界面
```
┌─────────────────────────────────────────────┐
│  识别结果                                   │
│  ┌────────────────────────────────────────┐ │
│  │ 这是从图片中识别出的文字...            │ │
│  │                                        │ │
│  │ 可以在这里编辑修改...                  │ │
│  └────────────────────────────────────────┘ │
│  [复制] [清空] [导出]                       │
└─────────────────────────────────────────────┘
```

---

## F04-04 结果复制

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F04-04 |
| 功能名称 | 结果复制 |
| 优先级 | P0 |
| 描述 | 复制识别的文字 |

### 函数
```typescript
/**
 * 复制到剪贴板
 * @param text - 文字内容
 */
async function copyToClipboard(text: string): Promise<void>
```
