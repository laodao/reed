/**
 * 资产分类定义表（asset_categories）迁移
 *
 * 用途：资产中心「业务分类」实体化——每增加一类业务（早报/周报/文案…）就增加一条分类定义，
 *       定义允许的文件形态、是否可预览、预览模式与预览渲染模板。
 *       资产仍以 sub_category 文本关联分类（分类名唯一，与 sub_category 值匹配），
 *       老库资产无需搬迁；未命中分类定义的 sub_category 继续按旧逻辑展示。
 *
 * 预览模式（preview_mode）：
 * - auto    按存储形态自动（旧行为）
 * - text/markdown/html/json/image/audio/video/none 按定义呈现
 * - report  markdown + 业务排版模板 → 长图（桌面端）/ HTML（Web 降级）
 *
 * 幂等。兼容 SQLite + PG（datetime/timestamp、varchar/TEXT、布尔整数）。
 */

import type { DataSource } from 'typeorm'

/** 内置分类定义（name 与现有内置应用 save-asset 的 subCategory 值一致） */
const BUILTIN_CATEGORIES: Array<{
  code: string
  name: string
  previewMode: string
  previewTemplateId: string | null
  sortOrder: number
  /** 允许的存储形态（缺省 ['text']，与 INSERT 旧硬编码一致） */
  allowedKinds?: string[]
  /** 允许的资产大类（可选，缺省不限定） */
  allowedCategories?: string[]
}> = [
  { code: 'morning_report', name: '早报', previewMode: 'auto', previewTemplateId: null, sortOrder: 10 },
  { code: 'industry_weekly', name: '行业周报', previewMode: 'auto', previewTemplateId: null, sortOrder: 20 },
  { code: 'report_template', name: '报告模板', previewMode: 'markdown', previewTemplateId: null, sortOrder: 30 },
  { code: 'video_script', name: '视频文案', previewMode: 'markdown', previewTemplateId: null, sortOrder: 40 },
  { code: 'copywriting', name: '文案', previewMode: 'markdown', previewTemplateId: null, sortOrder: 50 },
  { code: 'webpage_summary', name: '网页摘要', previewMode: 'markdown', previewTemplateId: null, sortOrder: 60 },
  { code: 'webpage_transcript', name: '网页转写', previewMode: 'markdown', previewTemplateId: null, sortOrder: 70 },
  { code: 'image_card', name: '图文卡片', previewMode: 'markdown', previewTemplateId: null, sortOrder: 80 },
  { code: 'polished_article', name: '润色稿', previewMode: 'markdown', previewTemplateId: null, sortOrder: 90 },
  { code: 'gossip_report', name: '吃瓜报告', previewMode: 'auto', previewTemplateId: null, sortOrder: 95 },
  // 网页收藏：single-file HTML（kind=file 落盘）+ markdown 正文（text_content 列），html 原样预览
  {
    code: 'webpage_collect',
    name: '网页收藏',
    previewMode: 'html',
    previewTemplateId: null,
    sortOrder: 65,
    allowedKinds: ['file', 'text'],
    allowedCategories: ['document', 'text'],
  },
]

export async function createAssetCategories(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'asset_categories', isPg))) {
    await ds.query(`
      CREATE TABLE asset_categories (
        id                  ${vc} PRIMARY KEY,
        name                ${vc} NOT NULL,
        code                ${vc},
        allowed_kinds       ${vc},
        allowed_categories  ${vc},
        previewable         INTEGER DEFAULT 1,
        preview_mode        ${vc} NOT NULL DEFAULT 'auto',
        preview_template_id ${vc},
        sort_order          INTEGER DEFAULT 0,
        is_builtin          INTEGER DEFAULT 0,
        created_at          ${dt},
        updated_at          ${dt}
      )
    `)
    // 分类名唯一（资产 sub_category 匹配键）
    await ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_categories_name ON asset_categories (name)`)
    console.log('[create-asset-categories] 表 asset_categories 创建完成')
  }

  // 幂等补列（老库演进防御）
  await ensureColumn(ds, 'asset_categories', 'code', vc, isPg)
  await ensureColumn(ds, 'asset_categories', 'allowed_kinds', vc, isPg)
  await ensureColumn(ds, 'asset_categories', 'allowed_categories', vc, isPg)
  await ensureColumn(ds, 'asset_categories', 'previewable', isPg ? 'integer DEFAULT 1' : 'INTEGER DEFAULT 1', isPg)
  await ensureColumn(ds, 'asset_categories', 'preview_mode', isPg ? "varchar NOT NULL DEFAULT 'auto'" : `TEXT NOT NULL DEFAULT 'auto'`, isPg)
  await ensureColumn(ds, 'asset_categories', 'preview_template_id', vc, isPg)
  await ensureColumn(ds, 'asset_categories', 'sort_order', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)
  await ensureColumn(ds, 'asset_categories', 'is_builtin', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_asset_categories_sort ON asset_categories (sort_order)`)

  // 内置分类种子（按 name 幂等：已存在则更新定义，缺失则插入）
  // 占位符按方言生成：PG 只认 $n（node-pg 不做 ? → $n 转换，? 在 PG 是 jsonb 运算符），
  // SQLite 用 ?。SELECT 查重分支此前已按 isPg 处理，INSERT/UPDATE 漏了——Web 端首启必崩。
  const ph = (n: number) => (isPg ? `$${n}` : '?')
  const now = new Date().toISOString()
  let inserted = 0
  for (const c of BUILTIN_CATEGORIES) {
    const existing = await ds.query(
      isPg ? `SELECT 1 FROM asset_categories WHERE name = $1 LIMIT 1` : `SELECT 1 FROM asset_categories WHERE name = ? LIMIT 1`,
      [c.name],
    )
    if (existing.length === 0) {
      const id = `builtin_cat_${c.code}`
      const kinds = JSON.stringify(c.allowedKinds ?? ['text'])
      const allowedCategories = c.allowedCategories?.length ? JSON.stringify(c.allowedCategories) : null
      await ds.query(
        `INSERT INTO asset_categories
          (id, name, code, allowed_kinds, allowed_categories, previewable, preview_mode, preview_template_id, sort_order, is_builtin, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ${ph(10)}, ${ph(11)}, ${ph(12)})`,
        [id, c.name, c.code, kinds, allowedCategories, 1, c.previewMode, c.previewTemplateId, c.sortOrder, 1, now, now],
      )
      inserted++
    } else {
      // 同步定义（含允许形态/大类）：老库以旧定义先插过的行也能收敛到最新约束
      const kinds = JSON.stringify(c.allowedKinds ?? ['text'])
      const allowedCategories = c.allowedCategories?.length ? JSON.stringify(c.allowedCategories) : null
      await ds.query(
        `UPDATE asset_categories SET
           allowed_kinds = ${ph(1)}, allowed_categories = ${ph(2)}, preview_mode = ${ph(3)},
           preview_template_id = ${ph(4)}, sort_order = ${ph(5)}, updated_at = ${ph(6)}
         WHERE name = ${ph(7)}`,
        [kinds, allowedCategories, c.previewMode, c.previewTemplateId, c.sortOrder, now, c.name],
      )
    }
  }

  console.log(`[create-asset-categories] 完成：内置分类 ${inserted} 新增`)
}

/** 幂等补列（SQLite: PRAGMA 查列；PG: information_schema） */
async function ensureColumn(
  ds: DataSource,
  table: string,
  column: string,
  colDef: string,
  isPg: boolean,
): Promise<void> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    if (rows.length === 0) {
      await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
      console.log(`[create-asset-categories] ${table} 补列 ${column}`)
    }
    return
  }
  const cols = await ds.query(`PRAGMA table_info(${table})`)
  if (!cols.some((c: { name: string }) => c.name === column)) {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
    console.log(`[create-asset-categories] ${table} 补列 ${column}`)
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}
