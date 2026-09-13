// 调试 2：EPUB3（nav）与 EPUB2（ncx）的目录 API 差异
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function probe(file: string, label: string): Promise<void> {
  const saveDir = mkdtempSync(path.join(os.tmpdir(), 'dbg-epub2-'))
  const mod: any = await import('@lingo-reader/epub-parser')
  const book: any = await mod.initEpubFile(file, saveDir)
  try {
    console.log(`\n===== ${label} =====`)
    console.log('getToc():', JSON.stringify(book.getToc?.() ?? null)?.slice(0, 400))
    console.log('getNavList():', JSON.stringify(book.getNavList?.() ?? null)?.slice(0, 500))
    console.log('getGuide():', JSON.stringify(book.getGuide?.() ?? null)?.slice(0, 300))
    console.log('resolveHref(epub:OEBPS/chapter1.xhtml):', JSON.stringify(book.resolveHref?.('epub:OEBPS/chapter1.xhtml') ?? null))
  } finally {
    book.destroy()
    rmSync(saveDir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  await probe('tests/unit/core/utils/fixtures/minibook.epub', 'EPUB3 (nav 文档)')
  await probe('tests/unit/core/utils/fixtures/minibook2.epub', 'EPUB2 (ncx)')
  process.exit(0)
}
setTimeout(() => { void main() }, 100)