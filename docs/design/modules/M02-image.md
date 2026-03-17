# M02 - 图像生成模块设计

## 1. 模块概述

| 属性 | 值 |
|-----|-----|
| 模块编号 | M02 |
| 模块名称 | 图像生成 |
| 模块代码 | image |
| 优先级 | P1 |
| 描述 | 提供AI图像生成功能，支持多种图像生成模型，管理生成历史 |

## 2. 功能列表

| 功能编号 | 功能名称 | 功能描述 | 优先级 |
|---------|---------|---------|-------|
| F02-01 | 图像生成 | 根据文字描述生成图像 | P0 |
| F02-02 | 参数设置 | 设置生成参数（尺寸、数量等） | P0 |
| F02-03 | 模型选择 | 选择图像生成模型 | P0 |
| F02-04 | 历史管理 | 查看和管理生成历史 | P1 |
| F02-05 | 图像下载 | 下载生成的图像 | P0 |
| F02-06 | 图像删除 | 删除历史图像 | P1 |

## 3. 界面设计

### 3.1 图像生成页面布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌────────────────────────────────────────────────────┐ │
│ │              │ │  AI生图                                             │ │
│ │   生成历史    │ ├────────────────────────────────────────────────────┤ │
│ │              │ │                                                    │ │
│ │  ┌────────┐  │ │  模型选择  [通义万相 ▼]                            │ │
│ │  │[img1] │  │ │                                                    │ │
│ │  │10:30  │  │ │  ┌────────────────────────────────────────────────┐ │ │
│ │  └────────┘  │ │  │                                                │ │ │
│ │              │ │  │                                                │ │ │
│ │  ┌────────┐  │ │  │               生成的图像                       │ │ │
│ │  │[img2] │  │ │  │                                                │ │ │
│ │  │昨天   │  │ │  │                                                │ │ │
│ │  └────────┘  │ │  │                                                │ │ │
│ │              │ │  └────────────────────────────────────────────────┘ │ │
│ │  ┌────────┐  │ │                                                    │ │
│ │  │[img3] │  │ │  [下载] [重新生成] [查看详情]                       │ │
│ │  │昨天   │  │ │                                                    │ │
│ │  └────────┘  │ ├────────────────────────────────────────────────────┤ │
│ │              │ │  提示词                                             │ │
│ │     ...      │ │  ┌────────────────────────────────────────────────┐ │ │
│ │              │ │  │ 一只可爱的猫咪，坐在窗台上，阳光透过窗户...    │ │ │
│ └──────────────┘ │  └────────────────────────────────────────────────┘ │ │
│                  │                                                    │ │
│                  │  尺寸 [512x512 ▼]  数量 [1 ▼]  [生成]              │ │
│                  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 生成参数设置

```
┌─────────────────────────────────────────────────────────────┐
│  生成参数                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  图像尺寸                                                    │
│  ○ 512x512 (方形)                                           │
│  ○ 1024x1024 (大方形)                                       │
│  ○ 1024x768 (横版)                                          │
│  ○ 768x1024 (竖版)                                          │
│                                                              │
│  生成数量                                                    │
│  [1] [2] [4]                                                │
│                                                              │
│  高级选项                                                    │
│  ────────────────────────────────────────────────────────── │
│  风格      [写实 ▼]                                          │
│  品质      [标准 ▼]                                          │
│  参考图    [上传] (可选)                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 生成详情对话框

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
│  一只可爱的猫咪，坐在窗台上，阳光透过窗户... │
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

### 4.1 数据结构

```typescript
// 图像记录
interface ImageRecord {
  id: string                    // 图像ID
  provider: string              // 提供商
  model: string                 // 使用的模型
  prompt: string                // 提示词
  negativePrompt?: string       // 负面提示词
  imageUrl: string              // 图像URL或本地路径
  localPath?: string            // 本地存储路径
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
  prompt: string                // 提示词
  negativePrompt?: string       // 负面提示词
  width: number                 // 宽度
  height: number                // 高度
  style?: string                // 风格
  quality?: string              // 品质
  count?: number                // 生成数量
  referenceImage?: string       // 参考图（Base64或路径）
}

// 生成响应
interface GenerateImageResponse {
  success: boolean
  images: ImageRecord[]         // 生成的图像列表
  error?: string                // 错误信息
}

// 图像提供商
interface ImageProvider {
  id: string                    // 提供商ID
  name: string                  // 显示名称
  models: ImageModel[]          // 可用模型
  configured: boolean           // 是否已配置API密钥
}

// 图像模型
interface ImageModel {
  id: string                    // 模型ID
  name: string                  // 显示名称
  sizes: string[]               // 支持的尺寸
  styles?: string[]             // 支持的风格
  maxCount: number              // 最大生成数量
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
  local_path TEXT,
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

## 5. IPC接口设计

### 5.1 图像生成

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| image:get-providers | GET | - | { success, providers: ImageProvider[] } | 获取提供商列表 |
| image:generate | GENERATE | request: GenerateImageRequest | { success, images } | 生成图像 |
| image:list | GET | page?, pageSize? | { success, images, total } | 获取历史列表 |
| image:delete | DELETE | id: string | { success } | 删除图像 |

## 6. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       └── image.repository.ts        # 图像数据访问
│   ├── ipc/
│   │   └── handlers/
│   │       └── image.handler.ts           # 图像IPC处理
│   ├── services/
│   │   └── image.service.ts               # 图像服务
│   └── providers/
│       └── image/
│           ├── base-image-provider.ts     # 图像提供商基类
│           ├── qwen-image-provider.ts     # 通义万相
│           └── volcengine-image-provider.ts # 火山引擎
├── renderer/
│   └── src/
│       ├── views/
│       │   └── ImageView.vue              # 图像生成页面
│       ├── stores/
│       │   └── image.ts                   # 图像状态管理
│       └── components/
│           └── image/
│               ├── ImageHistory.vue       # 生成历史组件
│               ├── ImageDisplay.vue       # 图像显示组件
│               ├── ImageParams.vue        # 参数设置组件
│               └── ImageDetail.vue        # 图像详情组件
└── shared/
    └── types/
        └── image.types.ts                 # 图像类型定义
```

## 7. 核心流程

### 7.1 图像生成流程

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
前端验证（提示词非空）
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
    ▼
调用对应Provider的生成API
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

### 7.2 图像下载流程

```
用户点击"下载"
    │
    ▼
选择保存位置（文件对话框）
    │
    ▼
调用 file:save IPC
    │
    ▼
复制本地图像文件到目标位置
    │
    ▼
显示下载成功提示
```

## 8. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| 提示词为空 | E201 | 请输入提示词 | 前端提示 |
| API密钥未配置 | E203 | 请先配置图像生成服务的API密钥 | 弹窗提示 |
| 生成失败 | E204 | 图像生成失败：{原因} | 弹窗提示 |
| 下载失败 | E205 | 图像下载失败 | 弹窗提示 |
| 内容违规 | E206 | 提示词包含敏感内容，请修改 | 前端提示 |

## 9. 测试要点

### 9.1 功能测试
- [ ] 输入提示词生成图像
- [ ] 切换不同模型
- [ ] 调整生成参数
- [ ] 下载图像
- [ ] 查看历史记录
- [ ] 删除图像

### 9.2 边界测试
- [ ] 空提示词处理
- [ ] 超长提示词处理
- [ ] 敏感词过滤
- [ ] 网络异常处理
