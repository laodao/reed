/**
 * Markdown 转 Word 文档工具
 * @module utils/markdown-to-docx
 */

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
  convertInchesToTwip,
  LevelFormat,
  ExternalHyperlink,
  IRunOptions
} from 'docx'

interface MarkdownToDocxOptions {
  title?: string
  author?: string
}

// 缓存 marked 模块
let markedModule: typeof import('marked') | null = null

/**
 * 动态加载 marked 模块
 */
async function getMarked(): Promise<typeof import('marked')> {
  if (!markedModule) {
    markedModule = await import('marked')
  }
  return markedModule
}

/**
 * 解析 Markdown 文本并转换为 Word 文档
 */
export async function markdownToDocx(
  markdown: string,
  options: MarkdownToDocxOptions = {}
): Promise<Buffer> {
  const marked = await getMarked()
  const lexer = new marked.Lexer({})
  const tokens = lexer.lex(markdown)

  const children: (Paragraph | Table)[] = []

  for (const token of tokens) {
    const elements = tokenToDocxElements(token)
    children.push(...elements)
  }

  const doc = new Document({
    creator: options.author || 'AI Assistant',
    title: options.title || 'AI 回答',
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: '%2.',
              alignment: AlignmentType.START
            },
            {
              level: 2,
              format: LevelFormat.DECIMAL,
              text: '%3.',
              alignment: AlignmentType.START
            }
          ]
        },
        {
          reference: 'unordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.START
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: '○',
              alignment: AlignmentType.START
            },
            {
              level: 2,
              format: LevelFormat.BULLET,
              text: '■',
              alignment: AlignmentType.START
            }
          ]
        }
      ]
    },
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
function tokenToDocxElements(token: any): (Paragraph | Table)[] {
  switch (token.type) {
    case 'heading':
      return [createHeading(token)]

    case 'paragraph':
      return [createParagraph(token)]

    case 'code':
      return createCodeBlock(token)

    case 'list':
      return createList(token, 0)

    case 'table':
      return [createTable(token)]

    case 'blockquote':
      return createBlockquote(token)

    case 'hr':
      return [createHorizontalRule()]

    case 'space':
      return []

    case 'image':
      // 图片暂时用占位符文本
      return [new Paragraph({
        children: [new TextRun({
          text: `[图片: ${token.href || '图片'}]`,
          italics: true,
          color: '666666'
        })]
      })]

    default:
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
    children: parseInlineTokens(token.tokens || [], {})
  })
}

/**
 * 创建段落
 */
function createParagraph(token: any): Paragraph {
  return new Paragraph({
    children: parseInlineTokens(token.tokens || [], {})
  })
}

/**
 * 合并格式属性
 */
function mergeOptions(base: IRunOptions, extra: IRunOptions): IRunOptions {
  return { ...base, ...extra }
}

/**
 * 解析内联 token 为 TextRun 数组
 * @param tokens token 列表
 * @param inheritedOptions 从父级继承的格式选项
 */
function parseInlineTokens(tokens: any[], inheritedOptions: IRunOptions = {}): TextRun[] {
  const runs: TextRun[] = []

  for (const token of tokens) {
    const childRuns = inlineTokenToTextRuns(token, inheritedOptions)
    runs.push(...childRuns)
  }

  return runs
}

/**
 * 将内联 token 转换为 TextRun
 * @param token 当前 token
 * @param inheritedOptions 从父级继承的格式选项
 */
function inlineTokenToTextRuns(token: any, inheritedOptions: IRunOptions = {}): TextRun[] {
  switch (token.type) {
    case 'text':
      return [new TextRun(mergeOptions(inheritedOptions, { text: token.text }))]

    case 'strong':
      // 合并 bold 属性到继承的选项
      const strongOptions = mergeOptions(inheritedOptions, { bold: true })
      if (token.tokens && token.tokens.length > 0) {
        return parseInlineTokens(token.tokens, strongOptions)
      }
      return [new TextRun(mergeOptions(strongOptions, { text: token.text || '' }))]

    case 'em':
      // 合并 italics 属性到继承的选项
      const emOptions = mergeOptions(inheritedOptions, { italics: true })
      if (token.tokens && token.tokens.length > 0) {
        return parseInlineTokens(token.tokens, emOptions)
      }
      return [new TextRun(mergeOptions(emOptions, { text: token.text || '' }))]

    case 'del':
      // 合并 strike 属性
      const delOptions = mergeOptions(inheritedOptions, { strike: true })
      if (token.tokens && token.tokens.length > 0) {
        return parseInlineTokens(token.tokens, delOptions)
      }
      return [new TextRun(mergeOptions(delOptions, { text: token.text || '' }))]

    case 'codespan':
      return [new TextRun(mergeOptions(inheritedOptions, {
        text: token.text,
        font: 'Consolas',
        shading: { fill: 'F0F0F0' }
      }))]

    case 'link':
      // 创建超链接
      const linkText = token.text || token.href || ''
      return [new TextRun(mergeOptions(inheritedOptions, {
        text: linkText,
        color: '0563C1',
        underline: { type: 'single' }
      }))]

    case 'image':
      // 图片用占位符
      const altText = token.text || token.href || '图片'
      return [new TextRun(mergeOptions(inheritedOptions, {
        text: `[图片: ${altText}]`,
        italics: true,
        color: '666666'
      }))]

    case 'br':
      return [new TextRun({ break: 1 })]

    case 'html':
      // HTML 标签，尝试提取文本内容
      if (token.text) {
        // 移除 HTML 标签，只保留文本
        const plainText = token.text.replace(/<[^>]*>/g, '')
        if (plainText.trim()) {
          return [new TextRun(mergeOptions(inheritedOptions, { text: plainText }))]
        }
      }
      return []

    default:
      // 尝试获取文本内容
      if (token.text) {
        return [new TextRun(mergeOptions(inheritedOptions, { text: token.text }))]
      }
      // 如果有子 tokens，递归处理
      if (token.tokens && token.tokens.length > 0) {
        return parseInlineTokens(token.tokens, inheritedOptions)
      }
      return []
  }
}

/**
 * 创建代码块（多段落）
 */
function createCodeBlock(token: any): Paragraph[] {
  const codeText = token.text || ''
  const lines = codeText.split('\n')

  // 将所有代码行放在一个段落中，保持格式
  const children: TextRun[] = []
  for (let i = 0; i < lines.length; i++) {
    children.push(new TextRun({
      text: lines[i],
      font: 'Consolas',
      size: 20
    }))
    if (i < lines.length - 1) {
      children.push(new TextRun({ break: 1 }))
    }
  }

  return [new Paragraph({
    shading: { fill: 'F5F5F5' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' }
    },
    spacing: { before: 200, after: 200 },
    indent: { left: convertInchesToTwip(0.25) },
    children
  })]
}

/**
 * 创建列表（支持嵌套）
 * @param token 列表 token
 * @param level 当前嵌套层级
 */
function createList(token: any, level: number): Paragraph[] {
  const paragraphs: Paragraph[] = []

  for (const item of token.items) {
    // 处理列表项的所有内容
    const itemContent: TextRun[] = []

    // 遍历列表项的所有 tokens
    if (item.tokens && item.tokens.length > 0) {
      for (const itemToken of item.tokens) {
        if (itemToken.type === 'list') {
          // 嵌套列表，先添加当前列表项的内容
          if (itemContent.length > 0) {
            paragraphs.push(new Paragraph({
              numbering: token.ordered
                ? { reference: 'ordered-list', level }
                : { reference: 'unordered-list', level },
              children: itemContent
            }))
            itemContent.length = 0
          }
          // 递归处理嵌套列表
          paragraphs.push(...createList(itemToken, Math.min(level + 1, 2)))
        } else if (itemToken.type === 'text' || itemToken.type === 'paragraph') {
          // 文本或段落内容
          const runs = parseInlineTokens(itemToken.tokens || [], {})
          itemContent.push(...runs)
        } else {
          // 其他类型，尝试提取内容
          const runs = inlineTokenToTextRuns(itemToken, {})
          itemContent.push(...runs)
        }
      }
    }

    // 添加剩余的内容
    if (itemContent.length > 0) {
      paragraphs.push(new Paragraph({
        numbering: token.ordered
          ? { reference: 'ordered-list', level }
          : { reference: 'unordered-list', level },
        children: itemContent
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
  const colCount = token.header?.length || token.rows?.[0]?.length || 1

  if (token.header) {
    const headerCells = token.header.map((cell: any) =>
      new TableCell({
        width: { size: 100 / colCount, type: WidthType.PERCENTAGE },
        shading: { fill: 'F0F0F0' },
        children: [new Paragraph({
          children: parseInlineTokens(cell.tokens || [], {}),
          alignment: AlignmentType.CENTER
        })]
      })
    )
    rows.push(new TableRow({ children: headerCells, tableHeader: true }))
  }

  for (const row of token.rows || []) {
    const cells = row.map((cell: any) =>
      new TableCell({
        width: { size: 100 / colCount, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          children: parseInlineTokens(cell.tokens || [], {})
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
 * 创建引用块（支持多段落）
 */
function createBlockquote(token: any): Paragraph[] {
  const paragraphs: Paragraph[] = []

  // 处理引用块的所有内容
  if (token.tokens && token.tokens.length > 0) {
    for (const childToken of token.tokens) {
      if (childToken.type === 'paragraph') {
        paragraphs.push(new Paragraph({
          indent: { left: convertInchesToTwip(0.5) },
          border: {
            left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' }
          },
          shading: { fill: 'FAFAFA' },
          children: parseInlineTokens(childToken.tokens || [], {})
        }))
      } else if (childToken.type === 'text') {
        paragraphs.push(new Paragraph({
          indent: { left: convertInchesToTwip(0.5) },
          border: {
            left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' }
          },
          shading: { fill: 'FAFAFA' },
          children: parseInlineTokens(childToken.tokens || [], {})
        }))
      } else {
        // 其他类型，尝试处理
        const elements = tokenToDocxElements(childToken)
        for (const elem of elements) {
          if (elem instanceof Paragraph) {
            // 为引用块内容添加缩进和边框
            paragraphs.push(new Paragraph({
              indent: { left: convertInchesToTwip(0.5) },
              border: {
                left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' }
              },
              shading: { fill: 'FAFAFA' },
              children: (elem as any).children || []
            }))
          }
        }
      }
    }
  }

  // 如果没有生成任何段落，使用原始文本
  if (paragraphs.length === 0 && token.text) {
    paragraphs.push(new Paragraph({
      indent: { left: convertInchesToTwip(0.5) },
      border: {
        left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' }
      },
      shading: { fill: 'FAFAFA' },
      children: [new TextRun(token.text)]
    }))
  }

  return paragraphs
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