# M04 - OCR识别模块设计

## 1. 模块概述

| 属性 | 值 |
|-----|-----|
| 模块编号 | M04 |
| 模块名称 | OCR识别 |
| 模块代码 | ocr |
| 优先级 | P1 |
| 描述 | 提供图片文字识别功能，支持多种OCR引擎，支持批量识别 |

## 2. 功能列表

| 功能编号 | 功能名称 | 功能描述 | 优先级 |
|---------|---------|---------|-------|
| F04-01 | 图片上传 | 上传待识别的图片 | P0 |
| F04-02 | 文字识别 | 识别图片中的文字 | P0 |
| F04-03 | 结果编辑 | 编辑识别结果 | P1 |
| F04-04 | 结果复制 | 复制识别的文字 | P0 |
| F04-05 | 结果导出 | 导出为文本文件 | P2 |
| F04-06 | 批量识别 | 批量上传多张图片识别 | P2 |

## 3. 界面设计

### 3.1 OCR识别页面布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│  OCR识别                                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐│
│  │                              │  │  识别结果                         ││
│  │                              │  │  ──────────────────────────────── ││
│  │                              │  │                                   ││
│  │      上传的图片              │  │  这是从图片中识别出的文字...      ││
│  │                              │  │                                   ││
│  │                              │  │  可以在这里编辑修改...            ││
│  │                              │  │                                   ││
│  │                              │  │                                   ││
│  └──────────────────────────────┘  │                                   ││
│                                    │                                   ││
│  [重新上传] [识别]                 │                                   ││
│                                    │                                   ││
│  OCR引擎: [通义千问 ▼]             │                                   ││
│                                    │                                   ││
│                                    │  [复制] [清空] [导出]             ││
│                                    └──────────────────────────────────┘│
│                                                                          │
│  识别历史                                                                │
│  ────────────────────────────────────────────────────────────────────── │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                           │
│  │ [img1] │ │ [img2] │ │ [img3] │ │ [img4] │                           │
│  │ 10:30  │ │ 昨天   │ │ 01-12  │ │ 01-10  │                           │
│  └────────┘ └────────┘ └────────┘ └────────┘                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 图片上传区域

```
┌─────────────────────────────────────────────┐
│                                              │
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

## 4. 数据设计

### 4.1 数据结构

```typescript
// OCR记录
interface OcrRecord {
  id: string                    // 记录ID
  provider: string              // 提供商
  imagePath: string             // 图片路径
  result: string                // 识别结果
  confidence?: number           // 置信度
  language?: string             // 识别语言
  createdAt: Date               // 创建时间
}

// OCR请求
interface OcrRequest {
  imagePath: string             // 图片路径
  provider?: string             // 提供商（可选）
  language?: string             // 语言（可选）
}

// OCR响应
interface OcrResponse {
  success: boolean
  text: string                  // 识别的文字
  confidence?: number           // 置信度
  blocks?: TextBlock[]          // 文字块（带位置）
  error?: string                // 错误信息
}

// 文字块（带位置信息）
interface TextBlock {
  text: string                  // 文字内容
  x: number                     // 左上角X
  y: number                     // 左上角Y
  width: number                 // 宽度
  height: number                // 高度
  confidence?: number           // 置信度
}

// OCR提供商
interface OcrProvider {
  id: string                    // 提供商ID
  name: string                  // 显示名称
  languages: string[]           // 支持的语言
  configured: boolean           // 是否已配置
}
```

### 4.2 数据库表

```sql
-- OCR记录表
CREATE TABLE ocr_records (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  image_path TEXT NOT NULL,
  result TEXT NOT NULL,
  confidence REAL,
  language TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_ocr_created_at ON ocr_records(created_at DESC);
```

## 5. IPC接口设计

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| ocr:get-providers | GET | - | { success, providers: OcrProvider[] } | 获取提供商列表 |
| ocr:recognize | RECOGNIZE | request: OcrRequest | { success, result: OcrResponse } | 识别图片 |
| ocr:list | GET | page?, pageSize? | { success, records, total } | 获取历史记录 |
| ocr:delete | DELETE | id: string | { success } | 删除记录 |

## 6. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       └── ocr.repository.ts          # OCR数据访问
│   ├── ipc/
│   │   └── handlers/
│   │       └── ocr.handler.ts             # OCR IPC处理
│   ├── services/
│   │   └── ocr.service.ts                 # OCR服务
│   └── providers/
│       └── ocr/
│           ├── base-ocr-provider.ts       # OCR提供商基类
│           ├── qwen-ocr-provider.ts       # 通义千问OCR
│           └── volcengine-ocr-provider.ts # 火山引擎OCR
├── renderer/
│   └── src/
│       ├── views/
│       │   └── OcrView.vue                # OCR识别页面
│       ├── stores/
│       │   └── ocr.ts                     # OCR状态管理
│       └── components/
│           └── ocr/
│               ├── ImageUploader.vue      # 图片上传组件
│               ├── ResultEditor.vue       # 结果编辑组件
│               └── OcrHistory.vue         # 识别历史组件
└── shared/
    └── types/
        └── ocr.types.ts                   # OCR类型定义
```

## 7. 核心流程

### 7.1 OCR识别流程

```
用户上传图片
    │
    ▼
显示图片预览
    │
    ▼
用户选择OCR引擎
    │
    ▼
点击"识别"按钮
    │
    ▼
显示识别中状态
    │
    ▼
调用 ocr:recognize IPC
    │
    ▼
主进程接收请求
    │
    ├── 检查API密钥是否配置
    │
    ▼
读取图片文件
    │
    ▼
调用对应Provider的OCR API
    │
    ▼
解析返回结果
    │
    ▼
保存记录到数据库
    │
    ▼
返回识别结果
    │
    ▼
前端显示识别文字
```

## 8. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| 图片为空 | E401 | 请上传图片 | 前端提示 |
| 图片格式不支持 | E402 | 不支持的图片格式 | 前端提示 |
| 图片过大 | E403 | 图片大小不能超过10MB | 前端提示 |
| API密钥未配置 | E404 | 请先配置OCR服务的API密钥 | 弹窗提示 |
| 识别失败 | E405 | 识别失败：{原因} | 弹窗提示 |

## 9. 测试要点

### 9.1 功能测试
- [ ] 上传图片
- [ ] 识别文字
- [ ] 编辑结果
- [ ] 复制结果
- [ ] 导出文本
- [ ] 查看历史

### 9.2 边界测试
- [ ] 空图片处理
- [ ] 大图片处理
- [ ] 无文字图片
- [ ] 多语言文字
