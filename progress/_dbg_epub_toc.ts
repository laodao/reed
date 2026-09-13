// 调试 @lingo-reader/epub-parser 的 API 返回结构
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FILE = 'tests/unit/core/utils/fixtures/minibook.epub'

async function main(): Promise<void> {
  const saveDir = mkdtempSync(path.join(os.tmpdir(), 'dbg-epub-'))
  const mod: any = await import('@lingo-reader/epub-parser')
  console.log('模块导出:', Object.keys(mod))
  const book: any = await mod.initEpubFile(FILE, saveDir)
  console.log('book 方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(book)))
  try {
    console.log('metadata:', JSON.stringify(book.getMetadata?.() ?? null))
    const toc = book.getToc?.() ?? []
    console.log('toc 长度:', toc.length)
    console.log('toc[0]:', JSON.stringify(toc[0] ?? null, null, 1)?.slice(0, 500))
    const spine = book.getSpine?.() ?? []
    console.log('spine[0]:', JSON.stringify(spine[0] ?? null)?.slice(0, 300))
    if (spine[0]) {
      const ch = await book.loadChapter(spine[0].id)
      console.log('loadChapter keys:', ch ? Object.keys(ch) : null)
      console.log('html 头:', (ch as any)?.html?.slice(0, 160))
    }
  } finally {
    book.destroy()
    rmSync(saveDir, { recursive: true, force: true })
  }
  process.exit(0)
}
setTimeout(() => { void main() }, 100)