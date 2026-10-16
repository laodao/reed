/**
 * 数字人池 seed migration（spec 2026-05-09 ep-redesign §3.2 D3 · P-8）
 *
 * 插入 12 个内置数字人 binding（user_id=NULL + project_id=NULL 全局共享）。
 * 用户从池子引用 → 在自己 project 内创建普通 binding（拷 snapshot；不直接复用预设行）。
 *
 * 形象图来源：本 phase 暂不入 asset_image（需要 AI 生成 + 人工审核统一风格的图）；
 *           只插入 binding 字段，让 UI 列表能展示。形象图作为 follow-up 任务。
 *
 * 幂等：用 ON CONFLICT DO NOTHING / WHERE NOT EXISTS 双库兼容。
 */

import type { DataSource } from 'typeorm'

interface Preset {
  id: string
  name: string
  description: string
  appearance: string
  gender: '男' | '女' | '其他'
  age: number
  race: string
  styleAnchors: string[]
}

const PRESETS: Preset[] = [
  // 商务 / 职场
  { id: 'preset_male_anchor_25',  name: '青年男主播', description: '清爽商务风',
    appearance: '清爽短发 / 正装衬衫 / 干净商务气质', gender: '男', age: 25, race: '东亚',
    styleAnchors: ['现代写实'] },
  { id: 'preset_female_anchor_24',name: '青年女主播', description: '温柔知性',
    appearance: '齐肩长发 / 温柔知性 / 淡妆', gender: '女', age: 24, race: '东亚',
    styleAnchors: ['现代写实'] },
  { id: 'preset_male_business_45',name: '中年商务男', description: '成熟稳重',
    appearance: '小寸短发 / 商务正装 / 成熟稳重', gender: '男', age: 45, race: '东亚',
    styleAnchors: ['现代写实'] },
  { id: 'preset_female_business_38',name: '中年商务女', description: '干练职场',
    appearance: '盘发 / 职业套装 / 干练气场', gender: '女', age: 38, race: '东亚',
    styleAnchors: ['现代写实'] },

  // 学院 / 学生
  { id: 'preset_male_student_18', name: '少年学生男', description: '阳光高中生',
    appearance: '短发 / 校服 / 阳光向上', gender: '男', age: 18, race: '东亚',
    styleAnchors: ['现代写实'] },
  { id: 'preset_female_student_17',name: '少女学生女', description: '清纯校园',
    appearance: '马尾 / 校服 / 清纯灵动', gender: '女', age: 17, race: '东亚',
    styleAnchors: ['现代写实'] },

  // 老人
  { id: 'preset_male_elder_65',   name: '老年男长者', description: '慈祥书卷气',
    appearance: '银白短发 / 慈祥 / 戴老花镜 / 棉麻长衫', gender: '男', age: 65, race: '东亚',
    styleAnchors: ['现代写实'] },
  { id: 'preset_female_elder_60', name: '老年女长辈', description: '温和家慈',
    appearance: '盘发花白 / 温和 / 家居款长衫', gender: '女', age: 60, race: '东亚',
    styleAnchors: ['现代写实'] },

  // 古风
  { id: 'preset_male_ancient_25', name: '古风青年男', description: '剑客江湖',
    appearance: '束发 / 古装长袍 / 腰间佩剑 / 剑眉星目', gender: '男', age: 25, race: '东亚',
    styleAnchors: ['国风工笔'] },
  { id: 'preset_female_ancient_22',name: '古风青年女', description: '青衣淡雅',
    appearance: '云髻 / 青衣淡彩 / 步摇珠玉', gender: '女', age: 22, race: '东亚',
    styleAnchors: ['国风工笔'] },

  // 休闲 / 日常
  { id: 'preset_male_casual_30',  name: '青年男文青', description: '休闲文艺',
    appearance: '微卷短发 / 圆框眼镜 / 棉麻衬衫', gender: '男', age: 30, race: '东亚',
    styleAnchors: ['现代写实'] },
  { id: 'preset_female_casual_28',name: '青年女文青', description: '休闲文艺',
    appearance: '齐肩短发 / 简约连衣裙 / 文静气质', gender: '女', age: 28, race: '东亚',
    styleAnchors: ['现代写实'] },
]

export async function seedPresetDigitalHumans(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  let inserted = 0

  for (const p of PRESETS) {
    // 幂等检查
    const existing = await ds.query(
      `SELECT 1 FROM character_bindings WHERE id = ${isPg ? '$1' : '?'} LIMIT 1`,
      [p.id],
    )
    if (existing.length > 0) continue

    const now = isPg ? 'NOW()' : `datetime('now')`
    const params: any[] = [
      p.id,
      p.name,
      p.description,
      p.appearance,
      p.gender,
      p.age,
      p.race,
      JSON.stringify(p.styleAnchors),
    ]

    if (isPg) {
      await ds.query(
        `INSERT INTO character_bindings
          (id, user_id, project_id, source_type, is_preset,
           standalone_name, standalone_description,
           override_appearance, gender, age, race, style_anchors,
           voice_config, created_at, updated_at)
         VALUES ($1, NULL, NULL, 'preset_digital', 1,
                 $2, $3, $4, $5, $6, $7, $8::jsonb,
                 '{}'::jsonb, ${now}, ${now})
         ON CONFLICT (id) DO NOTHING`,
        params,
      )
    } else {
      await ds.query(
        `INSERT OR IGNORE INTO character_bindings
          (id, user_id, project_id, source_type, is_preset,
           standalone_name, standalone_description,
           override_appearance, gender, age, race, style_anchors,
           voice_config, created_at, updated_at)
         VALUES (?, NULL, NULL, 'preset_digital', 1,
                 ?, ?, ?, ?, ?, ?, ?,
                 '{}', ${now}, ${now})`,
        params,
      )
    }
    inserted++
  }

  if (inserted > 0) {
    console.log(`[seed-preset-digital-humans] 插入 ${inserted} 个预设角色（共 ${PRESETS.length}）`)
  }
}
