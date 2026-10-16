# 消息导出图片和 Word 功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 AI 消息导出为图片和 Word 文档功能

**Architecture:** 图片导出使用 html2canvas 在渲染进程截图；Word 导出使用 marked 解析 Markdown，docx 库生成文档

**Tech Stack:** html2canvas, docx, marked (已有)

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装 html2canvas 和 docx**

```bash
npm install html2canvas docx
```

**Step 2: 验证安装**

```bash
npm ls html2canvas docx
```
Expected: 显示已安装的版本

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加 html2canvas 和 docx 依赖"
```

---

## Task 2: 创建 Markdown 转 Word 工具函数

**Files:**
- Create: `src/main/utils/markdown-to-docx.ts`

**Step 1: 创建工具函数文件**

```typescript
/**
 * Markdown 转 Word 文档工具
 * @module utils/markdown-to-docx
 */

import { Lexer } from 'marked'
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Packer,
  ImageRun,
  ExternalHyperlink,
  convertInchesToTwip
} from 'docx'
import * as fs from 'fs'
import * as path from 'path'

interface MarkdownToDocxOptions {
  title?: string
  author?: string
}

/**
 * 解析 Markdown 文本并转换为 Word 文档
 */
export async function markdownToDocx(
  markdown: string,
  options: MarkdownToDocxOptions = {}
): Promise<Buffer> {
  const lexer = new Lexer({})
  const tokens = lexer.lex(markdown)

  const children: (Paragraph | Table)[] = []

  for (const token of tokens) {
    const elements = await tokenToDocxElements(token)
    children.push(...elements)
  }

  const doc = new Document({
    creator: options.author || 'AI Assistant',
    title: options.title || 'AI 回答',
    sections: [{
      properties: {},
      children
    }]
  })

  return await Packer.toBuffer(doc)
}

/**
 * 将 Markdown token 转换为 Word 元素
 */
async function tokenToDocxElements(token: any): Promise<(Paragraph | Table)[]> {
  switch (token.type) {
    case 'heading':
      return [createHeading(token)]

    case 'paragraph':
      return [createParagraph(token)]

    case 'code':
      return [createCodeBlock(token)]

    case 'list':
      return createList(token)

    case 'table':
      return [createTable(token)]

    case 'blockquote':
      return [createBlockquote(token)]

    case 'hr':
      return [createHorizontalRule()]

    case 'space':
      return []

    default:
      // 对于未处理的 token，尝试渲染为段落
      if (token.text) {
        return [new Paragraph({
          children: [new TextRun(token.text)]
        })]
      }
      return []
  }
}

/**
 * 创建标题
 */
function createHeading(token: any): Paragraph {
  const levelMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6
  }

  return new Paragraph({
    heading: levelMap[token.depth] || HeadingLevel.HEADING_1,
    children: parseInlineTokens(token.tokens || [])
  })
}

/**
 * 创建段落
 */
function createParagraph(token: any): Paragraph {
  return new Paragraph({
    children: parseInlineTokens(token.tokens || [])
  })
}

/**
 * 解析内联 token 为 TextRun 数组
 */
function parseInlineTokens(tokens: any[]): TextRun[] {
  const runs: TextRun[] = []

  for (const token of tokens) {
    runs.push(...inlineTokenToTextRuns(token))
  }

  return runs
}

/**
 * 将内联 token 转换为 TextRun
 */
function inlineTokenToTextRuns(token: any): TextRun[] {
  switch (token.type) {
    case 'text':
      return [new TextRun(token.text)]

    case 'strong':
      return token.tokens
        ? parseInlineTokens(token.tokens).map(run =>
            new TextRun({ text: run.text || '', bold: true })
          )
        : [new TextRun({ text: token.text, bold: true })]

    case 'em':
      return token.tokens
        ? parseInlineTokens(token.tokens).map(run =>
            new TextRun({ text: run.text || '', italics: true })
          )
        : [new TextRun({ text: token.text, italics: true })]

    case 'del':
      return token.tokens
        ? parseInlineTokens(token.tokens).map(run =>
            new TextRun({ text: run.text || '', strike: true })
          )
        : [new TextRun({ text: token.text, strike: true })]

    case 'codespan':
      return [new TextRun({
        text: token.text,
        font: 'Consolas',
        shading: { fill: 'F0F0F0' }
      })]

    case 'link':
      const linkText = token.text || token.href
      return [new ExternalHyperlink({
        children: [new TextRun({ text: linkText, style: 'Hyperlink' })],
        link: token.href
      })]

    case 'br':
      return [new TextRun({ break: 1 })]

    default:
      if (token.text) {
        return [new TextRun(token.text)]
      }
      return []
  }
}

/**
 * 创建代码块
 */
function createCodeBlock(token: any): Paragraph {
  const codeText = token.text || ''
  const lines = codeText.split('\n')

  const children: TextRun[] = []
  for (let i = 0; i < lines.length; i++) {
    children.push(new TextRun({
      text: lines[i],
      font: 'Consolas',
      size: 20  // 10pt
    }))
    if (i < lines.length - 1) {
      children.push(new TextRun({ break: 1 }))
    }
  }

  return new Paragraph({
    shading: { fill: 'F5F5F5' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' }
    },
    spacing: { before: 200, after: 200 },
    children
  })
}

/**
 * 创建列表
 */
function createList(token: any): Paragraph[] {
  const paragraphs: Paragraph[] = []

  for (const item of token.items) {
    const textRuns = parseInlineTokens(item.tokens?.[0]?.tokens || [])

    if (token.ordered) {
      paragraphs.push(new Paragraph({
        numbering: { reference: 'ordered-list', level: 0 },
        children: textRuns
      }))
    } else {
      paragraphs.push(new Paragraph({
        numbering: { reference: 'unordered-list', level: 0 },
        children: textRuns
      }))
    }
  }

  return paragraphs
}

/**
 * 创建表格
 */
function createTable(token: any): Table {
  const rows: TableRow[] = []

  // 表头
  if (token.header) {
    const headerCells = token.header.map((cell: any) =>
      new TableCell({
        width: { size: 100 / token.header.length, type: WidthType.PERCENTAGE },
        shading: { fill: 'F0F0F0' },
        children: [new Paragraph({
          children: parseInlineTokens(cell.tokens || []),
          alignment: AlignmentType.CENTER
        })]
      })
    )
    rows.push(new TableRow({ children: headerCells, tableHeader: true }))
  }

  // 表格内容
  for (const row of token.rows || []) {
    const cells = row.map((cell: any) =>
      new TableCell({
        width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          children: parseInlineTokens(cell.tokens || [])
        })]
      })
    )
    rows.push(new TableRow({ children: cells }))
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows
  })
}

/**
 * 创建引用块
 */
function createBlockquote(token: any): Paragraph {
  return new Paragraph({
    indent: { left: convertInchesToTwip(0.5) },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' }
    },
    shading: { fill: 'FAFAFA' },
    children: parseInlineTokens(token.tokens?.[0]?.tokens || [])
  })
}

/**
 * 创建水平分隔线
 */
function createHorizontalRule(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' }
    },
    spacing: { before: 200, after: 200 }
  })
}
```

**Step 2: Commit**

```bash
git add src/main/utils/markdown-to-docx.ts
git commit -m "feat(export): 添加 Markdown 转 Word 工具函数"
```

---

## Task 3: 实现 Word 导出功能

**Files:**
- Modify: `src/main/ipc/handlers/export.handler.ts`

**Step 1: 导入工具函数**

在文件顶部添加导入：

```typescript
import { markdownToDocx } from '../../utils/markdown-to-docx'
```

**Step 2: 实现 Word 导出处理器**

替换 `export:message-word` 处理器的 TODO 部分：

```typescript
ipcMain.handle('export:message-word', async (_event, data: { content: string; modelId?: string }) => {
  try {
    // 选择保存路径
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `AI回答_${timestamp}.docx`

    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
      defaultPath: defaultName,
      filters: [
        { name: 'Word 文档', extensions: ['docx'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: true, message: '用户取消' }
    }

    // 生成 Word 文档
    const buffer = await markdownToDocx(data.content, {
      title: 'AI 回答'
    })

    // 写入文件
    fs.writeFileSync(result.filePath, buffer)

    return { success: true, filePath: result.filePath }
  } catch (error: any) {
    console.error('[export:message-word] 错误:', error)
    return { success: false, error: error.message }
  }
})
```

**Step 3: 测试 Word 导出**

手动测试：
1. 启动应用：`npm run dev`
2. 获取 AI 回答后点击导出菜单
3. 选择"导出为 Word"
4. 选择保存路径
5. 用 Word/WPS 打开生成的文件验证格式

**Step 4: Commit**

```bash
git add src/main/ipc/handlers/export.handler.ts
git commit -m "feat(export): 实现 Word 文档导出功能"
```

---

## Task 4: 实现图片导出 - 前端截图逻辑

**Files:**
- Modify: `src/renderer/src/components/chat/MessageItem.vue`

**Step 1: 添加 html2canvas 导入**

```typescript
import html2canvas from 'html2canvas'
```

**Step 2: 添加图片容器模板**

在模板中添加隐藏的截图容器（放在 `</template>` 之前）：

```vue
<!-- 图片导出用的隐藏容器 -->
<div
  ref="imageExportContainer"
  class="image-export-container"
  :style="{ position: 'fixed', left: '-9999px', top: '0', width: '600px', background: '#fff', padding: '24px', zIndex: -1 }"
  v-html="imageExportContent"
/>
```

**Step 3: 添加响应式变量**

```typescript
const imageExportContainer = ref<HTMLElement | null>(null)
const imageExportContent = ref('')
```

**Step 4: 实现图片导出函数**

```typescript
// 导出为图片
async function exportAsImage() {
  if (!props.message.content) {
    ElMessage.warning('消息内容为空')
    return
  }

  try {
    // 准备渲染内容
    imageExportContent.value = renderContentForImage(props.message.content)

    // 等待 DOM 更新
    await nextTick()

    if (!imageExportContainer.value) {
      ElMessage.error('无法创建图片容器')
      return
    }

    // 使用 html2canvas 截图
    const canvas = await html2canvas(imageExportContainer.value, {
      backgroundColor: '#ffffff',
      scale: 2,  // 高清
      useCORS: true,
      logging: false
    })

    // 转换为 Base64
    const base64 = canvas.toDataURL('image/png')

    // 调用主进程保存
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const response = await window.electronAPI.export.messageAsImage({
      imageBase64: base64,
      fileName: `AI回答_${timestamp}.png`
    })

    if (response.success) {
      ElMessage.success('图片已保存')
    } else if (response.error) {
      ElMessage.error(response.error)
    }

    // 清理
    imageExportContent.value = ''
  } catch (error) {
    console.error('导出图片失败:', error)
    ElMessage.error('导出图片失败')
  }
}

// 渲染内容为图片用的 HTML
function renderContentForImage(content: string): string {
  // 简单的 Markdown 到 HTML 转换
  let html = content

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto;font-family:Consolas,monospace;font-size:13px;line-height:1.5;"><code>${escapeHtml(code.trim())}</code></pre>`
  })

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f5f5f5;padding:2px 6px;border-radius:3px;font-family:Consolas,monospace;">$1</code>')

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;font-weight:600;">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:20px 0 10px;font-size:18px;font-weight:600;">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:24px 0 12px;font-size:22px;font-weight:700;">$1</h1>')

  // 粗体和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 列表
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:20px;">$1</li>')
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px;">$1</li>')

  // 换行
  html = html.replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;">')
  html = html.replace(/\n/g, '<br>')

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333;line-height:1.6;">
    <p style="margin:0 0 12px;line-height:1.6;">${html}</p>
  </div>`
}

// HTML 转义
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
```

**Step 5: 添加 nextTick 导入**

```typescript
import { ref, computed, watch, nextTick } from 'vue'
```

**Step 6: Commit**

```bash
git add src/renderer/src/components/chat/MessageItem.vue
git commit -m "feat(export): 实现图片导出前端截图逻辑"
```

---

## Task 5: 实现图片导出 - 主进程保存逻辑

**Files:**
- Modify: `src/main/ipc/handlers/export.handler.ts`
- Modify: `src/preload/index.ts`

**Step 1: 修改 IPC 接口定义**

在 `export.handler.ts` 中替换 `export:message-image` 处理器：

```typescript
ipcMain.handle('export:message-image', async (_event, data: {
  imageBase64: string
  fileName?: string
}) => {
  try {
    // 选择保存路径
    const defaultName = data.fileName || `AI回答_${Date.now()}.png`

    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
      defaultPath: defaultName,
      filters: [
        { name: 'PNG 图片', extensions: ['png'] },
        { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: true, message: '用户取消' }
    }

    // 解析 Base64 数据
    const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // 如果选择了 JPEG 格式，转换格式
    let finalBuffer = buffer
    if (result.filePath.endsWith('.jpg') || result.filePath.endsWith('.jpeg')) {
      // PNG 到 JPEG 转换需要 sharp 库，暂时直接保存为 PNG
      // 或者要求用户选择 PNG 格式
      finalBuffer = buffer
    }

    // 写入文件
    fs.writeFileSync(result.filePath, finalBuffer)

    return { success: true, filePath: result.filePath }
  } catch (error: any) {
    console.error('[export:message-image] 错误:', error)
    return { success: false, error: error.message }
  }
})
```

**Step 2: 更新 preload 接口**

确保 `src/preload/index.ts` 中的接口正确：

```typescript
messageAsImage: (data: { imageBase64: string; fileName?: string }) =>
  ipcRenderer.invoke('export:message-image', data),
```

**Step 3: 测试图片导出**

手动测试：
1. 启动应用：`npm run dev`
2. 获取 AI 回答后点击导出菜单
3. 选择"导出为图片"
4. 选择保存路径
5. 查看生成的图片

**Step 4: Commit**

```bash
git add src/main/ipc/handlers/export.handler.ts src/preload/index.ts
git commit -m "feat(export): 实现图片导出主进程保存逻辑"
```

---

## Task 6: 最终测试和清理

**Step 1: 运行完整功能测试**

测试清单：
- [ ] 导出纯文本消息为图片
- [ ] 导出包含代码块的消息为图片
- [ ] 导出包含列表的消息为图片
- [ ] 导出为 Word 文档
- [ ] Word 文档能在 Word/WPS 中正确打开

**Step 2: 运行 lint 检查**

```bash
npm run lint
```

**Step 3: 提交设计文档**

```bash
git add docs/plans/2026-03-26-export-image-word-design.md docs/plans/2026-03-26-export-image-word.md
git commit -m "docs: 添加导出图片和 Word 功能设计文档"
```

---

## 验收标准

1. 图片导出功能正常工作，生成的图片清晰可读
2. Word 导出功能正常工作，支持标题、段落、列表、代码块、表格
3. 导出的文件可以正常打开
4. 代码通过 lint 检查