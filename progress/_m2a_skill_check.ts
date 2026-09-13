/**
 * M2-A 临时校验：三个新研究侧 skill 的 frontmatter 可解析、id 唯一、输出契约存在
 * 运行：npx tsx -r tsconfig-paths/register progress/_m2a_skill_check.ts
 */
import { BUILTIN_SKILLS } from '../src/core/platform/workflow/skills/builtin-skills'
import { parseSkillMarkdown } from '../src/core/platform/workflow/skills/skill-parser'

const ids = new Set<string>()
let parsed = 0
const EXPECT = ['learning-source-collector', 'learning-question-generator', 'learning-relation-miner']
const found = new Set<string>()

for (const entry of BUILTIN_SKILLS) {
  if (ids.has(entry.id)) throw new Error(`重复 skill id: ${entry.id}`)
  ids.add(entry.id)
  const s = parseSkillMarkdown(entry.markdown, { source: 'builtin' })
  parsed++
  if (EXPECT.includes(s.id)) {
    found.add(s.id)
    // 契约抽查：output_desc 不以裸 { 开头
    if (s.outputDesc.trimStart().startsWith('{')) throw new Error(`${s.id} output_desc 以裸 { 开头`)
  }
}

const missing = EXPECT.filter((e) => !found.has(e))
if (missing.length) throw new Error(`缺少新 skill: ${missing.join(', ')}`)
console.log(`OK: 共解析 ${parsed} 个内置 skill；新研究侧三 skill 均已就位且契约合规`)
