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
  ExternalHyperlink,
  convertInchesToTwip
} from 'docx'

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
            new TextRun({ text: (run as any).text || '', bold: true })
          )
        : [new TextRun({ text: token.text, bold: true })]

    case 'em':
      return token.tokens
        ? parseInlineTokens(token.tokens).map(run =>
            new TextRun({ text: (run as any).text || '', italics: true })
          )
        : [new TextRun({ text: token.text, italics: true })]

    case 'del':
      return token.tokens
        ? parseInlineTokens(token.tokens).map(run =>
            new TextRun({ text: (run as any).text || '', strike: true })
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
      }) as any]

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
      size: 20
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