// 调试 3：《深度学习》epub 的目录可提取性（lingo-reader getToc vs anydoc markdown 目录链接）
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractTextFromFile } from '../src/core/utils/extract-text'

const FILE = 'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/69f415bc-0c62-43f8-a4e5-67eafeb44750.epub'

async function main(): Promise<void> {
  // 1) lingo-reader 的目录
  const saveDir = mkdtempSync(path.join(os.tmpdir(), 'dbg-epub3-'))
  const mod: any = await import('@lingo-reader/epub-parser')
  const book: any = await mod.initEpubFile(FILE, saveDir)
  try {
    const toc = book.getToc?.() ?? []
    console.log('getToc() 长度:', toc.length)
    console.log('前 8 项:', JSON.stringify(toc.slice(0, 8), null, 1))
    const spine = book.getSpine?.() ?? []
    console.log('spine 长度:', spine.length, '| nav 项:', spine.filter((s: any) => s.properties === 'nav').length)
    console.log('metadata.title:', book.getMetadata?.()?.title)
  } finally {
    book.destroy()
    rmSync(saveDir, { recursive: true, force: true })
  }

  // 2) anydoc markdown 里的目录链接（回退路径）
  const md = await extractTextFromFile(FILE, 'epub', { asMarkdown: true })
  const links = [...md.matchAll(/\[([^\]]{1,60})\]\(#?(oebps-[^)]+)\)/g)].slice(0, 20)
  console.log('\nmarkdown 中的内部链接数:', [...md.matchAll(/\[([^\]]{1,60})\]\(#?(oebps-[^)]+)\)/g)].length)
  links.forEach((m, i) => console.log(`  ${i}. ${m[1]} → ${m[2].slice(0, 60)}`))
  console.log('\nmarkdown 前 800 字符:')
  console.log(md.slice(0, 800))
  process.exit(0)
}
setTimeout(() => { void main() }, 100)