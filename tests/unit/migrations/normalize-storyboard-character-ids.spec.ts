/**
 * normalize-storyboard-character-ids migration 单测
 *
 * 验证 4 类老数据的修复路径：
 *   1. 真实 binding.id（无需改）
 *   2. characterName / 长文 ID（按 scene 反查）
 *   3. 空字符串 + 强 expression 匹配（兜底）
 *   4. 真无法识别（保留 + warn）
 *
 * 顺便验证幂等：再跑一次不会改任何行。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { normalizeStoryboardCharacterIds } from '@core/database/migrations/normalize-storyboard-character-ids'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  await ds.query(`
    CREATE TABLE scene_scripts (id TEXT PRIMARY KEY, characters TEXT)
  `)
  await ds.query(`
    CREATE TABLE storyboards (
      id TEXT PRIMARY KEY,
      scene_script_id TEXT,
      characters TEXT,
      updated_at TEXT
    )
  `)
  return ds
}

const sceneCharsJson = JSON.stringify([
  {
    characterBindingId: 'cb_li_mo',
    characterId: 'lwc_li_mo',
    characterName: '李墨',
    expression: '焦虑不安',
  },
  {
    characterBindingId: 'cb_su_bai',
    characterId: 'lwc_su_bai',
    characterName: '苏白',
    expression: '平静深邃',
  },
])

describe('normalizeStoryboardCharacterIds', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  async function seedScene(ds: DataSource): Promise<void> {
    await ds.query(`INSERT INTO scene_scripts (id, characters) VALUES (?, ?)`, [
      'ss1',
      sceneCharsJson,
    ])
  }

  async function seedSb(
    ds: DataSource,
    id: string,
    chars: unknown[],
  ): Promise<void> {
    await ds.query(
      `INSERT INTO storyboards (id, scene_script_id, characters) VALUES (?, ?, ?)`,
      [id, 'ss1', JSON.stringify(chars)],
    )
  }

  it('真实 binding.id 跳过，不写库', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [{ characterId: 'cb_li_mo', expression: '焦虑' }])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedById).toBe(1)
    expect(stat.storyboardsUpdated).toBe(0)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    const parsed = JSON.parse(rows[0].characters)
    expect(parsed[0].characterId).toBe('cb_li_mo')
    await ds.destroy()
  })

  it('characterName 反查替换为 binding.id', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [{ characterId: '李墨', expression: '焦虑' }])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByName).toBe(1)
    expect(stat.storyboardsUpdated).toBe(1)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    const parsed = JSON.parse(rows[0].characters)
    expect(parsed[0].characterId).toBe('cb_li_mo')
    expect(parsed[0].expression).toBe('焦虑') // 其他字段保留
    await ds.destroy()
  })

  it('长文写作 ID 反查替换为 binding.id', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [{ characterId: 'lwc_su_bai', expression: '平静' }])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByLwId).toBe(1)
    expect(stat.storyboardsUpdated).toBe(1)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(rows[0].characters)[0].characterId).toBe('cb_su_bai')
    await ds.destroy()
  })

  it('空 characterId + expression 包含 scene 级 → 兜底匹配', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    // storyboard expression "焦虑不安，眉头紧锁，眼神游移" 包含 scene "焦虑不安"
    await seedSb(ds, 'sb1', [
      { characterId: '', expression: '焦虑不安，眉头紧锁，眼神游移' },
    ])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByExpression).toBe(1)
    expect(stat.storyboardsUpdated).toBe(1)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(rows[0].characters)[0].characterId).toBe('cb_li_mo')
    await ds.destroy()
  })

  it('空 characterId + 完全相同 expression → 兜底匹配苏白', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [{ characterId: '', expression: '平静深邃' }])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByExpression).toBe(1)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(rows[0].characters)[0].characterId).toBe('cb_su_bai')
    await ds.destroy()
  })

  it('未知名字 → 保留原值 + warn + 不计 fixed', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [
      { characterId: '完全不认识的角色', expression: '完全不相关的奇异表情' },
    ])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.unfixedUnknown).toBe(1)
    expect(stat.storyboardsUpdated).toBe(0)
    expect(warnSpy).toHaveBeenCalled()

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(rows[0].characters)[0].characterId).toBe('完全不认识的角色')
    await ds.destroy()
  })

  it('互补兜底：第一条已修复 + 第二条 unknown → scene 剩余唯一 binding 自动补', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    // 第一条 cb_li_mo 占用李墨；第二条 "unknown_id" + expression 无关 →
    // identity / expression 都失败 → 互补兜底应用 cb_su_bai
    await seedSb(ds, 'sb1', [
      { characterId: 'cb_li_mo', expression: '焦虑' },
      { characterId: 'unknown_id', expression: '某种无关情绪' },
    ])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByComplement).toBe(1)
    expect(stat.storyboardsUpdated).toBe(1)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    const parsed = JSON.parse(rows[0].characters)
    expect(parsed[0].characterId).toBe('cb_li_mo')
    expect(parsed[1].characterId).toBe('cb_su_bai')
    await ds.destroy()
  })

  it('互补兜底：scene 剩 2 个未占用 → 不动（避免错配）', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    // 唯一一条 unknown，scene 有 2 个 binding 都没占用 → 互补不能确定
    await seedSb(ds, 'sb1', [
      { characterId: 'unknown_id', expression: '某种无关情绪' },
    ])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByComplement).toBe(0)
    expect(stat.unfixedUnknown).toBe(1)
    await ds.destroy()
  })

  it('英文音译代号（li_mo）反查不到 + expression 强匹配 → 兜底替换', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    // characterId="li_mo" 既不是 binding.id 也不是 name/lwc，但 expression
    // 包含 scene 级 "焦虑不安" → expression 兜底应命中李墨
    await seedSb(ds, 'sb1', [
      { characterId: 'li_mo', expression: '焦虑不安，眼神警惕' },
    ])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByExpression).toBe(1)
    expect(stat.storyboardsUpdated).toBe(1)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(rows[0].characters)[0].characterId).toBe('cb_li_mo')
    await ds.destroy()
  })

  it('空 characterId + expression 无关 → 不兜底，计 unfixedEmpty', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [
      { characterId: '', expression: '完全不相关的奇异表情' },
    ])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.unfixedEmpty).toBe(1)
    expect(stat.storyboardsUpdated).toBe(0)
    await ds.destroy()
  })

  it('幂等：第二次跑不变更', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [{ characterId: '李墨', expression: '焦虑' }])

    const first = await normalizeStoryboardCharacterIds(ds)
    expect(first.storyboardsUpdated).toBe(1)

    const second = await normalizeStoryboardCharacterIds(ds)
    expect(second.storyboardsUpdated).toBe(0)
    expect(second.fixedById).toBe(1) // cb_li_mo 已是 binding.id

    await ds.destroy()
  })

  it('多角色混合：每条独立处理', async () => {
    const ds = await buildDb()
    await seedScene(ds)
    await seedSb(ds, 'sb1', [
      { characterId: '李墨', expression: '焦虑' },
      { characterId: 'cb_su_bai', expression: '平静' },
      { characterId: '路人甲', expression: '神秘' },
    ])

    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.fixedByName).toBe(1)
    expect(stat.fixedById).toBe(1)
    expect(stat.unfixedUnknown).toBe(1)

    const rows = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    const parsed = JSON.parse(rows[0].characters)
    expect(parsed[0].characterId).toBe('cb_li_mo')
    expect(parsed[1].characterId).toBe('cb_su_bai')
    expect(parsed[2].characterId).toBe('路人甲') // 保留
    await ds.destroy()
  })

  it('storyboards / scene_scripts 表不存在 → 安全跳过', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
    const stat = await normalizeStoryboardCharacterIds(ds)
    expect(stat.storyboardsScanned).toBe(0)
    await ds.destroy()
  })
})
