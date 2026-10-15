/**
 * 人像提示词内置模板 seeder。
 * 内容抽取自 docs/prompt.txt（专业面部/全身比例/发型服装描述）。
 * 幂等：按 name 查重，已存在则跳过。
 *
 * 注册：Electron（src/electron/database/index.ts）与 Web（src/web/server/index.ts）
 * 在数据库初始化、迁移执行之后调用 PortraitTemplateSeederService.seed()。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { PromptTemplateCategory, PortraitGenerationScene } from '@shared/types/portrait.types'

interface BuiltinTemplate {
  name: string
  category: PromptTemplateCategory
  applyTo: PortraitGenerationScene[]
  content: string
  sortOrder: number
}

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    name: '少年清爽风 · 面部',
    category: 'face',
    applyTo: ['generate', 'regenerate', 'face'],
    sortOrder: 1,
    content:
      'young male face, balanced three-section face proportion, slightly shorter mid-section, clean forehead, small tight chin; soft facial bone structure, gentle jawline without sharp angles; light flat eyebrows; standard round almond eyes, clear and lively gaze; slim straight nose with rounded tip; refreshing youthful temperament',
  },
  {
    name: '成熟硬朗风 · 面部',
    category: 'face',
    applyTo: ['generate', 'regenerate', 'face'],
    sortOrder: 2,
    content:
      'mature masculine face, well-proportioned three sections, full mid-section, square firm chin; prominent bone structure, defined jaw angle, three-dimensional cheekbones; thick sword eyebrows, prominent brow bone; deep determined gaze; high nose bridge; mature硬朗 male presence',
  },
  {
    name: '温婉柔美风 · 面部',
    category: 'face',
    applyTo: ['generate', 'regenerate', 'face'],
    sortOrder: 3,
    content:
      'gentle feminine face, soft rounded facial lines, balanced three sections; willow-leaf eyebrows, peach-blossom eyes with tender affectionate gaze; delicate nose; full soft lips; small rounded chin; gentle graceful female temperament',
  },
  {
    name: '少年清爽风 · 8头身全身',
    category: 'body',
    applyTo: ['generate', 'regenerate'],
    sortOrder: 4,
    content:
      '8-head body proportion, balanced and light head-to-body ratio; clean stretched torso, long slender limbs; flat thin chest, slim straight neck and shoulders; smooth waist-hip transition; light muscle volume, refreshing youthful posture',
  },
  {
    name: '韩式清爽碎盖 + 日系少年服装',
    category: 'clothing',
    applyTo: ['generate', 'regenerate', 'clothes'],
    sortOrder: 5,
    content:
      'black hair, Korean style fluffy textured crop, light airy strands; Japanese casual youthful outfit, light blue denim shirt over plain white loose tee, relaxed straight pants, light-colored sneakers, clean fresh palette',
  },
]

export class PortraitTemplateSeederService {
  static async seed(): Promise<void> {
    const db = getCoreDatabaseManager()
    const repo = db.portraitPromptTemplates
    if (!repo) {
      console.warn('[PortraitTemplateSeeder] portraitPromptTemplates 未初始化，跳过')
      return
    }
    let created = 0
    for (const tpl of BUILTIN_TEMPLATES) {
      const exists = await repo.findByName(tpl.name)
      if (exists) continue
      await repo.create({ ...tpl, builtin: true })
      created++
    }
    if (created > 0) {
      console.log(`[PortraitTemplateSeeder] 注入内置模板 ${created} 条`)
    }
  }
}
