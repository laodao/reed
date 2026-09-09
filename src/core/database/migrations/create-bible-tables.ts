/**
 * 设定集动态分组两表 + 人物别名列（P0-2026-09-09，设计文档 bible-p0-p3 §P0.1）
 *
 * - lw_bible_kinds —— 设定分类定义（驱动设定集 UI/整理器提炼/存储路由；
 *   不用字典：字典承载不了字段模板 schema 与路由行为）
 * - lw_custom_entities —— storage='custom' 分类的数据落点（fields/origin JSON）
 * - lw_characters.aliases —— 人物别名 JSON 数组（网文称呼刚需 + 提及检测地基）
 *
 * 兼容 SQLite + PG，幂等（表/列已存在则跳过）；内置 8 个 entity 分类种子
 * + 2 个 custom 示范分类（国别/阵营——原型 v3.1 承诺的"动态生长"最小验证）。
 *
 * 接入点：
 * - Electron：src/electron/database/index.ts runMultiTenantMigrations()
 * - Web：src/web/server/index.ts initDatabase()
 */

import type { DataSource } from 'typeorm'
import { checkTableExists } from './migration-utils'

const KIND_SEEDS: Array<{
  key: string
  label: string
  icon: string
  sortOrder: number
  storage: 'entity' | 'custom'
  entityRepo?: string
  fieldsSchema?: string
  promptHint?: string
}> = [
  { key: 'overview', label: '概要', icon: '📘', sortOrder: 1, storage: 'entity', entityRepo: 'lwStoryOverviews' },
  {
    key: 'character', label: '人物', icon: '🧑', sortOrder: 2, storage: 'entity', entityRepo: 'lwCharacters',
    fieldsSchema: JSON.stringify([
      { key: 'name', label: '姓名', type: 'text', required: true },
      { key: 'aliases', label: '别名/称呼', type: 'tags' },
      { key: 'gender', label: '性别', type: 'select', options: ['male', 'female', 'other'] },
      { key: 'age', label: '年龄', type: 'number' },
      { key: 'occupation', label: '身份', type: 'text' },
      { key: 'rolePosition', label: '定位', type: 'text' },
      { key: 'appearance', label: '外貌', type: 'textarea' },
      { key: 'background', label: '背景', type: 'textarea' },
      { key: 'personality', label: '性格', type: 'textarea' },
      { key: 'abilities', label: '能力', type: 'textarea' },
      { key: 'majorEvents', label: '重大事件', type: 'textarea' },
    ]),
    promptHint: '{"name":"人物名","aliases":["别名"],"gender":"male/female/other","age":0,"occupation":"身份","rolePosition":"protagonist/supporting/minor","appearance":"外貌","background":"背景","personality":"性格","arc":"人物弧光","relations":[{"targetName":"对方名","relationType":"关系","description":"备注"}]}',
  },
  {
    key: 'plot', label: '故事线', icon: '🧵', sortOrder: 3, storage: 'entity', entityRepo: 'lwPlots',
    promptHint: '{"title":"故事线名","summary":"起点→冲突升级→终点","involvedCharacters":["人物名"],"entityRelations":[{"sourceName":"实体","targetName":"实体","relationType":"关系","description":"备注"}]}',
  },
  { key: 'outline', label: '大纲', icon: '🌳', sortOrder: 4, storage: 'entity', entityRepo: 'lwOutlines' },
  {
    key: 'faction', label: '门派', icon: '⛩️', sortOrder: 5, storage: 'entity', entityRepo: 'lwFactions',
    promptHint: '{"name":"名称","factionType":"类型","description":"描述"}',
  },
  {
    key: 'skill', label: '武功', icon: '⚔️', sortOrder: 6, storage: 'entity', entityRepo: 'lwSkills',
    promptHint: '{"name":"名称","type":"类型","level":"等级","description":"描述"}',
  },
  {
    key: 'item', label: '物品', icon: '💎', sortOrder: 7, storage: 'entity', entityRepo: 'lwItems',
    promptHint: '{"name":"名称","type":"类型","level":"品级","description":"描述"}',
  },
  {
    key: 'location', label: '地点', icon: '🏔️', sortOrder: 8, storage: 'entity', entityRepo: 'lwLocations',
    promptHint: '{"name":"名称","type":"类型","importance":"core/main/auxiliary","description":"描述"}',
  },
  {
    key: 'nation', label: '国别', icon: '🏯', sortOrder: 9, storage: 'custom',
    fieldsSchema: JSON.stringify([
      { key: 'name', label: '国名', type: 'text', required: true },
      { key: 'stance', label: '立场', type: 'text' },
      { key: 'ruler', label: '君主', type: 'text' },
      { key: 'note', label: '概况', type: 'textarea' },
    ]),
    promptHint: '{"name":"国名","stance":"立场","ruler":"君主","note":"概况"}',
  },
  {
    key: 'camp', label: '阵营', icon: '🚩', sortOrder: 10, storage: 'custom',
    fieldsSchema: JSON.stringify([
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'stance', label: '立场', type: 'text' },
      { key: 'goal', label: '目标', type: 'textarea' },
      { key: 'note', label: '概况', type: 'textarea' },
    ]),
    promptHint: '{"name":"名称","stance":"立场","goal":"目标","note":"概况"}',
  },
]

/**
 * 建设定集两表 + lw_characters.aliases 列 + 内置分类种子（幂等）。
 */
export async function createBibleTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. lw_bible_kinds
  await ds.query(`
    CREATE TABLE IF NOT EXISTS lw_bible_kinds (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      key varchar NOT NULL,
      label varchar NOT NULL,
      icon varchar NULL,
      sort_order integer DEFAULT 100,
      storage varchar DEFAULT 'custom',
      entity_repo varchar NULL,
      fields_schema text NULL,
      prompt_hint text NULL,
      enabled integer DEFAULT 1,
      created_at ${isPg ? 'bigint' : 'bigint'} NULL,
      updated_at ${isPg ? 'bigint' : 'bigint'} NULL
    )
  `)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_bible_kinds_key ON lw_bible_kinds (key)`)

  // 2. lw_custom_entities
  await ds.query(`
    CREATE TABLE IF NOT EXISTS lw_custom_entities (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      project_id varchar NOT NULL,
      kind_key varchar NOT NULL,
      name varchar NOT NULL,
      fields text NULL,
      parent_id varchar NULL,
      origin text NULL,
      created_at bigint NULL,
      updated_at bigint NULL
    )
  `)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_custom_entities_project ON lw_custom_entities (project_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_custom_entities_project_kind ON lw_custom_entities (project_id, kind_key)`)

  // 2.5 lw_foreshadows（P1 伏笔追踪）
  await ds.query(`
    CREATE TABLE IF NOT EXISTS lw_foreshadows (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      project_id varchar NOT NULL,
      content text NOT NULL,
      planted_chapter integer NULL,
      payoff_chapter integer NULL,
      status varchar DEFAULT 'open',
      origin text NULL,
      created_at bigint NULL,
      updated_at bigint NULL
    )
  `)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_foreshadows_project ON lw_foreshadows (project_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_foreshadows_status ON lw_foreshadows (project_id, status)`)

  // 2.6 lw_custom_entities.parent_id（P2 层级；幂等加列）
  try {
    await ds.query(`ALTER TABLE lw_custom_entities ADD COLUMN parent_id varchar NULL`)
  } catch (e: any) {
    if (!/duplicate|already exists/i.test(String(e?.message || ''))) throw e
  }

  // 3. lw_story_characters.aliases（JSON 数组；幂等加列——PRAGMA/information_schema 经
  // TypeORM 的返回形态不稳定，直接 ALTER 并容忍 duplicate（实测教训））
  if (await checkTableExists(ds, 'lw_story_characters', isPg)) {
    try {
      await ds.query(`ALTER TABLE lw_story_characters ADD COLUMN aliases text NULL`)
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (!/duplicate|already exists/i.test(msg)) throw e
    }
  }

  // 4. 内置分类种子（按 key 幂等；kinds 是产品级配置——全局行，user_id NULL，不覆盖用户修改）
  const now = Date.now()
  for (const seed of KIND_SEEDS) {
    const exists = await ds.query(`SELECT id FROM lw_bible_kinds WHERE key = '${seed.key}'`)
    if (Array.isArray(exists) && exists.length > 0) continue
    const id = `bk_${seed.key}_${now.toString(36)}`
    const schema = seed.fieldsSchema ? `'${seed.fieldsSchema.replace(/'/g, "''")}'` : 'NULL'
    const hint = seed.promptHint ? `'${seed.promptHint.replace(/'/g, "''")}'` : 'NULL'
    const repo = seed.entityRepo ? `'${seed.entityRepo}'` : 'NULL'
    await ds.query(
      `INSERT INTO lw_bible_kinds (id, user_id, key, label, icon, sort_order, storage, entity_repo, fields_schema, prompt_hint, enabled, created_at, updated_at)
       VALUES ('${id}', NULL, '${seed.key}', '${seed.label}', '${seed.icon}', ${seed.sortOrder}, '${seed.storage}', ${repo}, ${schema}, ${hint}, 1, ${now}, ${now})`,
    )
  }
}
