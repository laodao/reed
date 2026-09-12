// 定位：numpy 大纲 Markdown 在结构检测/切分后为何出现「内容与章节路径错位 + 纯标题切片」
// 运行：npx tsx progress/_diag_split_repro.ts
import { extractTextFromFile } from '../src/core/utils/extract-text'
import { StructureDetector } from '../src/core/platform/services/chunk-splitter/structure-detector'
import { HybridSplitter, DEFAULT_SPLIT_CONFIG } from '../src/core/platform/services/chunk-splitter'

const FILE =
  'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/97087ac1-b5ca-4b65-b3d9-d6287c2427c6.pdf'

async function main(): Promise<void> {
  const md = await extractTextFromFile(FILE, 'pdf', { asMarkdown: true })
  console.log('Markdown 长度:', md.length, '标题行数:', md.split('\n').filter(l => /^#{1,6}\s/.test(l)).length)

  const detector = new StructureDetector()
  const structure = detector.detect(md)
  console.log('检测结果: hasStructure=', structure.hasStructure, 'type=', structure.structureType, 'sections=', structure.sections.length)
  console.log('\n前 12 个 section（结构检测层）:')
  structure.sections.slice(0, 12).forEach((s, i) => {
    console.log(`  [${i}] L${s.level} title=「${s.title}」 parent=「${s.parentTitle ?? '-'}」 len=${s.content.length}`)
    console.log(`       content 头: ${s.content.replace(/\s+/g, ' ').slice(0, 90)}`)
  })

  const splitter = new HybridSplitter({ embed: async (t: string[]) => t.map(() => [0]) } as never)
  const chunks = await splitter.split(md, { ...DEFAULT_SPLIT_CONFIG, strategy: 'hybrid' })
  console.log('\n切分结果 chunks =', chunks.length)
  console.log('\n前 12 个 chunk:')
  chunks.slice(0, 12).forEach(c => {
    console.log(`  #${c.index} L${c.level} title=「${c.title ?? '-'}」 path=${JSON.stringify(c.sectionPath)} len=${c.content.length} split=${c.splitMethod}`)
    console.log(`       ${c.content.replace(/\s+/g, ' ').slice(0, 90)}`)
  })
  const noPath = chunks.filter(c => !c.sectionPath || c.sectionPath.length === 0).length
  const tiny = chunks.filter(c => c.content.trim().length < 100).length
  console.log(`\n空 sectionPath: ${noPath} | <100 字: ${tiny}`)
}

void main()
