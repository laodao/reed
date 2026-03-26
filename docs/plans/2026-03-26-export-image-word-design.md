# 消息导出功能设计文档

## 概述

为 AI 对话消息添加导出为图片和导出为 Word 文档功能。

## 功能需求

### 1. 导出为图片

- 简洁文本图片风格，白色背景
- 保留 Markdown 渲染后的格式（标题、代码块、列表等）
- 用户可选择保存路径，支持 PNG 和 JPEG 格式

### 2. 导出为 Word 文档

- 完整格式支持：标题、段落、列表、表格、图片
- 代码块使用等宽字体，灰色背景
- 用户可选择保存路径

## 技术方案

### 图片导出：html2canvas

在渲染进程中创建隐藏 DOM 元素渲染消息内容，使用 `html2canvas` 截图。

**流程：**
1. 用户点击"导出为图片"
2. 渲染进程创建隐藏 DOM 容器，渲染消息内容
3. 使用 `html2canvas` 截图生成 Canvas
4. 转换为 Base64 发送到主进程
5. 主进程弹出保存对话框，写入文件

**样式规范：**
- 白色背景，内边距 24px
- 字体：系统默认，代码块用等宽字体
- 代码块：浅灰色背景 (#f5f5f5)，圆角 4px
- 文字颜色：正文 #333，代码关键字 #d63384

### Word 导出：docx 库

使用 `marked` 的 Lexer 解析 Markdown，再用 `docx` 库生成 Word 文档。

**流程：**
1. 用户点击"导出为 Word"
2. 主进程弹出保存对话框
3. 使用 `marked.Lexer` 解析 Markdown 为 Token 数组
4. 遍历 Token，使用 `docx` 库构建文档元素
5. 写入 .docx 文件

**支持的 Markdown 元素：**
- 标题（h1-h6）→ Heading
- 段落 → Paragraph
- 粗体/斜体/删除线 → TextRun with formatting
- 有序列表 → NumberedBullet
- 无序列表 → Bullet
- 代码块 → Paragraph with monospace font, shading
- 表格 → Table
- 图片 → ImageRun (base64 或 URL)

## 依赖

```json
{
  "html2canvas": "^1.4.1",
  "docx": "^9.0.0"
}
```

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `package.json` | 添加依赖 |
| `src/renderer/src/components/chat/MessageItem.vue` | 图片导出逻辑，创建隐藏 DOM 并截图 |
| `src/main/ipc/handlers/export.handler.ts` | 图片保存逻辑，Word 生成逻辑 |
| `src/main/utils/markdown-to-docx.ts` | Markdown 转 Word 工具函数 |

## 接口设计

### IPC 接口

```typescript
// 导出消息为图片
ipcMain.handle('export:message-image', async (_event, data: {
  imageBase64: string  // Base64 编码的图片数据
  fileName?: string    // 建议的文件名
}) => {
  // 弹出保存对话框，写入文件
})

// 导出消息为 Word（已有，修改实现）
ipcMain.handle('export:message-word', async (_event, data: {
  content: string      // Markdown 内容
  title?: string       // 文档标题
  modelId?: string     // 模型 ID（可选）
}) => {
  // 解析 Markdown，生成 Word 文档
})
```

### 工具函数

```typescript
// markdown-to-docx.ts
export async function markdownToDocx(
  markdown: string,
  options?: {
    title?: string
    author?: string
  }
): Promise<Buffer>
```

## 测试要点

1. 图片导出
   - 纯文本消息正确渲染
   - 包含代码块的消息样式正确
   - 长消息自动换行
   - 中文、特殊字符正确显示

2. Word 导出
   - 各种 Markdown 元素正确转换
   - 表格格式正确
   - 代码块高亮样式
   - 文件可被 Word/WPS 正确打开