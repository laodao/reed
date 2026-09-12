// 调试：真实《深度学习》epub 走 resourceDir 时图片是否落盘、正文引用长什么样
// 运行：npx tsx progress/_debug_epub_assets.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractTextFromFile } from '../src/core/utils/extract-text'

const EPUB =
  'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/69f415bc-0c62-43f8-a4e5-67eafeb44750.epub'

async function main(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epub-assets-dbg-'))
  const resourceDir = path.join(root, 'assets', 'doc1')
  console.log('resourceDir:', resourceDir)
  const t0 = Date.now()
  const md = await extractTextFromFile(EPUB, 'epub', {
    asMarkdown: true,
    resourceDir,
    resourceRefPrefix: 'knowledge-base/kb1/documents/assets/doc1',
  })
  console.log(`解析耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，Markdown ${md.length} 字符`)

  const exists = fs.existsSync(resourceDir)
  const entries = exists ? fs.readdirSync(resourceDir) : []
  console.log(`资源目录存在=${exists} 顶层条目=${entries.length}`)
  if (exists) {
    const all = fs.readdirSync(resourceDir, { recursive: true }) as string[]
    console.log(`  递归条目数=${all.length}`)
    all.slice(0, 8).forEach(f => console.log('   ', f))
  }

  const refs = [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1])
  console.log(`正文图片引用 ${refs.length} 条，前 5 条:`)
  refs.slice(0, 5).forEach(r => console.log('  ', r))
  console.log('是否残留绝对/临时路径:', /[A-Za-z]:[\\/]/.test(md), '| 含 kb-epub-:', md.includes('kb-epub-'))

  fs.rmSync(root, { recursive: true, force: true })
}

void main()
