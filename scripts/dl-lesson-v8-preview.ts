/**
 * 一次性验证脚本：把 v7 期讲义样例按 v8 契约归一，打印前后章节对照
 *
 * 用途（2026-09-15 v8「章节再合并 + 核心骨架」验收）：真机上已有的讲义是 v7 形状
 * （学习前必读 → … → 辨析 → 常见坑 → 自测 → 参考答案），本脚本用**真实样例正文**
 * 走一遍 `normalizeCardSections`，证明：
 *   ① 章节数下降（为什么学它并进学习前必读、辨析+常见坑并进辨析与易错）；
 *   ② 内容一字不删（原区标题作为 `### 小标题` 保留）；
 *   ③ 落库门禁 `checkLessonSectionsShape` 放行且无附注。
 *
 * 运行：npx tsx -r tsconfig-paths/register scripts/dl-lesson-v8-preview.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LESSON_MERGED_SECTION_SPECS,
  LESSON_SECTION_CATALOG,
  LESSON_TEMPLATE_VERSION_CURRENT,
  checkLessonDepth,
  checkLessonSectionsShape,
  lessonBodyChars,
  normalizeCardSections,
  type LessonSectionShape,
} from '../src/shared/utils/lesson-template'

const SAMPLE = resolve(__dirname, '../progress/2026-09-15-sample2-jinrong-zichan-jiben-leixing-v7.md')

/**
 * 标题 → key（样例正文用中文标题分段，这里按契约标题反查）。
 * 生效区 + 已合并的历史区都收：v7 形状的样例里还留着「为什么学它 / 辨析 / 常见坑」这些历史区标题。
 */
const KEY_BY_TITLE = new Map<string, string>(
  [...LESSON_SECTION_CATALOG, ...LESSON_MERGED_SECTION_SPECS].map((s) => [s.title, s.key]),
)

/** 按二级标题（`## `）把样例讲义切成区；首行 `# 标题` 与元信息块之前的内容归入首个区之前 */
function sectionsOf(md: string): LessonSectionShape[] {
  const lines = md.split(/\r?\n/)
  const out: LessonSectionShape[] = []
  let title = ''
  let buf: string[] = []
  const flush = (): void => {
    const body = buf.join('\n').trim()
    if (!title && !body) return
    const key = KEY_BY_TITLE.get(title) ?? title
    out.push({ key, title, md: body })
  }
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) {
      flush()
      title = m[1]
      buf = []
      continue
    }
    if (title) buf.push(line)
  }
  flush()
  return out
}

const raw = readFileSync(SAMPLE, 'utf-8')
const before = sectionsOf(raw)
const { sections, changes } = normalizeCardSections({ essenceType: 'K-concept', sections: before })
const shape = checkLessonSectionsShape({ essenceType: 'K-concept', sections })
const depth = checkLessonDepth({ essenceType: 'K-concept', sections })

const line = (s: string): string => s.padEnd(24, ' ')
console.log(`契约版本：${LESSON_TEMPLATE_VERSION_CURRENT}`)
console.log(`样例：${SAMPLE}`)
console.log(`\n归一前 ${before.length} 区 → 归一后 ${sections.length} 区\n`)
console.log(line('归一后区（key/标题）') + '字数')
for (const s of sections) console.log(line(`${s.key} / ${s.title ?? ''}`) + lessonBodyChars(s.md))
console.log('\n合并与重排记录：')
for (const c of changes) console.log(`  · ${c}`)
console.log(`\n门禁：ok=${shape.ok}${shape.note ? ` note=${shape.note}` : ''}`)
console.log(`重点深度：${depth.summary}`)
for (const i of depth.issues) console.log(`  ! [${i.code}] ${i.sectionKey ?? '全文'}：${i.message}`)