// 探针：epub 解析后正文里的图片引用长什么样（临时目录路径 / 文件名规则）
// 运行：npx tsx progress/_probe_epub_images.ts
import { extractTextFromFile } from '../src/core/utils/extract-text'

const FIXTURE = 'tests/unit/core/utils/fixtures/minibook.epub'

async function main(): Promise<void> {
  const md = await extractTextFromFile(FIXTURE, 'epub', { asMarkdown: true })
  console.log('=== 提取结果 ===')
  console.log(md)
  console.log('\n=== 图片引用 ===')
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) console.log('  ', m[1])
}

void main()
