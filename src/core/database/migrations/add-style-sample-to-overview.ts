/**
 * lw_story_overviews 加 style_sample 列（W6.6 风格样章 few-shot，2026-10-17）
 *
 * 风格样章 = 作者粘贴的 1-2 段自认可文，注入章节生成的「写作风格要求」分区
 * 作为 few-shot（模仿文风与叙事腔调，禁止照抄内容）。与 style 字典短标签分开存储。
 * Nullable TEXT，幂等。
 */

import type { DataSource } from 'typeorm'

export async function addStyleSampleToOverview(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const table = 'lw_story_overviews'

  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    if (rows.length === 0) {
      console.log(`[add-style-sample] ${table} 不存在，跳过`)
      return
    }
    const cols = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'style_sample' AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    if (cols.length > 0) return
    await ds.query(`ALTER TABLE ${table} ADD COLUMN style_sample TEXT`)
  } else {
    const t = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
    if (t.length === 0) {
      console.log(`[add-style-sample] ${table} 不存在，跳过`)
      return
    }
    const c = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = 'style_sample' LIMIT 1`, [table])
    if (c.length > 0) return
    await ds.query(`ALTER TABLE ${table} ADD COLUMN style_sample TEXT`)
  }
  console.log('[add-style-sample] lw_story_overviews: 加列 style_sample')
}
