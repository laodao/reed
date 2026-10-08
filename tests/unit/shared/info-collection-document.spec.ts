/** 文档直链探测纯函数测试（info-collection-document） */
import { describe, it, expect } from 'vitest'
import { detectDirectDocumentUrl, IC_DOCUMENT_MAX_BYTES } from '@shared/utils/info-collection-document'

describe('detectDirectDocumentUrl', () => {
  it('常见文档扩展名命中', () => {
    expect(detectDirectDocumentUrl('https://www.gov.cn/gongbao/2024/issue_11234.pdf')?.ext).toBe('pdf')
    expect(detectDirectDocumentUrl('https://example.com/forms/注销登记.docx')?.ext).toBe('docx')
    expect(detectDirectDocumentUrl('https://example.com/data/tourism.xlsx')?.ext).toBe('xlsx')
    expect(detectDirectDocumentUrl('https://example.com/report.epub')?.ext).toBe('epub')
    expect(detectDirectDocumentUrl('https://example.com/notes.md')?.ext).toBe('md')
  })

  it('忽略查询串与 hash', () => {
    expect(detectDirectDocumentUrl('https://example.com/a/b.pdf?token=x&from=rss#page=3')?.ext).toBe('pdf')
  })

  it('大小写不敏感', () => {
    expect(detectDirectDocumentUrl('https://example.com/Report.PDF')?.ext).toBe('pdf')
  })

  it('网页不命中', () => {
    expect(detectDirectDocumentUrl('https://example.com/article/123')).toBeNull()
    expect(detectDirectDocumentUrl('https://example.com/search?q=filetype%3Apdf')).toBeNull()
  })

  it('无扩展名/点开头文件名/裸串不命中', () => {
    expect(detectDirectDocumentUrl('https://example.com/download')).toBeNull()
    expect(detectDirectDocumentUrl('https://example.com/.hidden/')).toBeNull()
    expect(detectDirectDocumentUrl('not-a-url')).toBeNull()
    expect(detectDirectDocumentUrl('')).toBeNull()
  })

  it('doc(未实现)/csv(不在提取器清单)不命中', () => {
    expect(detectDirectDocumentUrl('https://example.com/old.doc')).toBeNull()
    expect(detectDirectDocumentUrl('https://example.com/data.csv')).toBeNull()
  })

  it('下载红线常量 = 50MB', () => {
    expect(IC_DOCUMENT_MAX_BYTES).toBe(50 * 1024 * 1024)
  })
})
