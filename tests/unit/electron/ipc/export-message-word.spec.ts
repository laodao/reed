/**
 * export:message-word IPC 通道单测
 *
 * 用户反馈"导出 Word 也有问题"。排查结论：
 * 1. Word 导出与图片导出在 saveBlobAs(blob) 的 Blob 分支汇合，
 *    之前 file:write-binary 通道缺失导致两个导出都失败 —— 已修复。
 * 2. handler 侧 markdownToDocx → base64 → 前端 atob → Blob 的数据流
 *    经 roundtrip 验证逐字节一致，docx 库在主进程 externalize 正常。
 *
 * 本测试把 handler 链路固定下来，防止回归。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerExportHandlers } from '@electron/ipc/handlers/export.handler'

interface WordResponse {
  success: boolean
  error?: string
  data?: { base64: string; defaultName: string; mimeType: string }
}

const F = '```'

describe('export:message-word', () => {
  beforeAll(() => {
    registerExportHandlers()
  })

  it('通道已注册且能生成有效 docx（ZIP 魔数 PK）', async () => {
    const md = ['# 标题', '', '正文', '', F + 'js', 'console.log(1)', F, ''].join('\n')

    const result = (await invokeIpc('export:message-word', [
      { content: md },
    ])) as WordResponse

    expect(result.success).toBe(true)
    expect(result.data?.base64).toBeTruthy()
    // base64 长度至少对应一个最小 zip 结构
    expect(result.data!.base64.length).toBeGreaterThan(100)

    // docx 是 ZIP 容器，魔数必须是 PK（0x50 0x4B）
    const bytes = Uint8Array.from(atob(result.data!.base64), ch => ch.charCodeAt(0))
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  it('返回 defaultName（.docx 后缀）和 Word MIME', async () => {
    const result = (await invokeIpc('export:message-word', [
      { content: '简单内容' },
    ])) as WordResponse

    expect(result.success).toBe(true)
    expect(result.data!.defaultName).toMatch(/^AI回答_.+\.docx$/)
    expect(result.data!.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('空内容返回明确错误', async () => {
    const result = (await invokeIpc('export:message-word', [
      { content: '' },
    ])) as WordResponse

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('复杂 markdown（表格/列表/粗体/代码块）不抛异常', async () => {
    const md = [
      '## 方案',
      '',
      '**加粗**、*斜体*、`行内代码`',
      '',
      F + 'typescript',
      'function hello(): void {',
      '  console.log("world")',
      '}',
      F,
      '',
      '1. 第一步',
      '2. 第二步',
      '',
      '| 列A | 列B |',
      '| --- | --- |',
      '| 1   | 2   |',
      '',
      '> 引用块',
    ].join('\n')

    const result = (await invokeIpc('export:message-word', [
      { content: md },
    ])) as WordResponse

    expect(result.success).toBe(true)
    expect(result.data?.base64).toBeTruthy()
  })
})
