/**
 * 一次性验证脚本：用仓库真实 parser + SkillService 扫描逻辑验证
 * C:/Users/daoge/the-bot/skills/writing-styles 技能包能否被技能库识别。
 * 运行：npx tsx outputs/_verify-skill.mts（验证后可删）
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseSkillMarkdown } from '../src/core/platform/workflow/skills/skill-parser'

const SKILL_MD_FILENAME = 'SKILL.md'
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const root = 'C:/Users/daoge/the-bot/skills'

// 模拟 SkillService.userAll()：仅识别 <root>/<id>/SKILL.md，目录名须与 frontmatter name 一致
const skills: ReturnType<typeof parseSkillMarkdown>[] = []
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const md = join(root, entry.name, SKILL_MD_FILENAME)
  if (!existsSync(md)) continue
  const skill = parseSkillMarkdown(readFileSync(md, 'utf-8'), { dirPath: join(root, entry.name), source: 'user' })
  if (skill.id !== entry.name) throw new Error(`目录名 ${entry.name} 与 name ${skill.id} 不一致`)
  skills.push(skill)
}

const s = skills.find(x => x.id === 'writing-styles')
if (!s) throw new Error('writing-styles 未被识别')

// 模拟 withReferences：references/ 下 .md 拼装
const refDir = join(s.dirPath!, 'references')
const refs = existsSync(refDir)
  ? readdirSync(refDir).filter(f => /\.(md|txt)$/i.test(f)).map(f => ({ name: f, content: readFileSync(join(refDir, f), 'utf-8') }))
  : []

console.log('list() 结果:', skills.map(x => `${x.id}(${x.source})`).join(', '))
console.log('---')
console.log('id:', s.id, '| kebab-case:', SKILL_NAME_PATTERN.test(s.id))
console.log('name:', s.name, '| category:', s.category, '| modelInvocable:', s.modelInvocable)
console.log('description:', s.description.slice(0, 40) + '…')
console.log('whenToUse:', s.whenToUse)
console.log('inputs:', s.inputs.map(i => `${i.key}:${i.type}${i.required ? '*': ''}${i.options ? `(${i.options.length}项)` : ''}`).join(', '))
console.log('systemPrompt 长度:', s.systemPrompt.length, '| body 长度:', s.body.length)
console.log('references:', refs.map(r => r.name).join(', '))
console.log('references 总字数:', refs.reduce((a, r) => a + r.content.length, 0))

// 模拟 skill-call 节点渲染：{{param.xxx}} 占位都能被 inputs 覆盖
const bodyRefs = [...s.body.matchAll(/\{\{param\.([a-zA-Z0-9_]+)\}\}/g)].map(m => m[1])
const inputKeys = new Set(s.inputs.map(i => i.key))
const missing = bodyRefs.filter(k => !inputKeys.has(k))
console.log('body 占位符:', bodyRefs.join(', '), '| 未定义占位:', missing.length === 0 ? '无' : missing.join(','))
if (missing.length > 0) throw new Error('存在未定义的参数占位符')
console.log('=== 验证通过：writing-styles 可被技能库 list/resolve 正常识别 ===')
