/**
 * AssetSettingEnrichmentService.extractFieldsFromDescription · spec（Phase 2 C5，spec 2026-05-09 §3.2 B2）
 * @module tests/unit/episode-production/assets/asset-setting-enrichment-extract
 *
 * 验证 AI 正向字段提取（用户在自由文本描述里写完，点 ✨ → LLM 抽出 name/gender/age/race/styleAnchors）。
 *
 * Service 层职责：
 *   - 调 callAI（mock）
 *   - parse JSON（jsonrepair 兜底畸形输出）
 *   - 校验枚举值（gender 必须 男/女/其他）
 *   - 不覆盖逻辑放在前端（service 只返回 LLM 结果）
 */

import { describe, it, expect, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { AssetSettingEnrichmentService } from '@core/platform/episode-production/assets/services/asset-setting-enrichment.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      EpisodeScriptEntity,
      SceneScriptEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('AssetSettingEnrichmentService.extractFieldsFromDescription', () => {
  it('character: LLM 返回完整 JSON → 全字段抽取（race 使用枚举值）', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue(JSON.stringify({
      name: '李白',
      gender: '男',
      age: 25,
      race: 'east_asian',  // BUG-3 修复（v2.3）：race 必须使用枚举值
      styleAnchors: ['国风工笔'],
    }))
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    const out = await svc.extractFieldsFromDescription({
      assetType: 'character',
      description: '二十多岁年轻男子，剑眉星目，束发，腰间佩剑，国风工笔风格',
      projectId: 'p1',
    })

    expect(out.name).toBe('李白')
    expect(out.gender).toBe('男')
    expect(out.age).toBe(25)
    expect(out.race).toBe('east_asian')
    expect(out.styleAnchors).toEqual(['国风工笔'])
    await ds.destroy()
  })

  it('character: LLM 返回部分字段 → 只返回有的', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue(JSON.stringify({
      gender: '女',
      age: 18,
    }))
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    const out = await svc.extractFieldsFromDescription({
      assetType: 'character',
      description: '少女',
      projectId: 'p1',
    })

    expect(out.gender).toBe('女')
    expect(out.age).toBe(18)
    expect(out.name).toBeUndefined()
    expect(out.race).toBeUndefined()
    expect(out.styleAnchors).toBeUndefined()
    await ds.destroy()
  })

  it('character: LLM 返回非法 gender → 丢弃该字段', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue(JSON.stringify({
      gender: 'invalid',
      age: 25,
    }))
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    const out = await svc.extractFieldsFromDescription({
      assetType: 'character',
      description: '随便',
      projectId: 'p1',
    })

    expect(out.gender).toBeUndefined()
    expect(out.age).toBe(25)
    await ds.destroy()
  })

  it('character: LLM 返回自由文本 race（如"东亚"）→ 丢弃（必须用枚举值）', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue(JSON.stringify({
      race: '东亚',  // 旧格式自由文本，不符合枚举定义
      age: 25,
    }))
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    const out = await svc.extractFieldsFromDescription({
      assetType: 'character',
      description: '随便',
      projectId: 'p1',
    })

    // BUG-3 修复（v2.3）：非法 race 值被丢弃
    expect(out.race).toBeUndefined()
    expect(out.age).toBe(25)
    await ds.destroy()
  })

  it('LLM 返回带 markdown 围栏的 JSON → jsonrepair 兜底解析成功', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue('```json\n{"gender":"男","age":30}\n```')
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    const out = await svc.extractFieldsFromDescription({
      assetType: 'character',
      description: 'whatever',
      projectId: 'p1',
    })

    expect(out.gender).toBe('男')
    expect(out.age).toBe(30)
    await ds.destroy()
  })

  it('LLM 返回完全非 JSON → 抛错', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue('I cannot extract')
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    await expect(
      svc.extractFieldsFromDescription({
        assetType: 'character',
        description: 'whatever',
        projectId: 'p1',
      }),
    ).rejects.toThrow(/JSON/)
    await ds.destroy()
  })

  it('location: 抽出 locationType / scale / moodTags / timeOfDay / weather', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue(JSON.stringify({
      name: '黄鹤楼',
      locationType: 'exterior',
      scale: '大',
      moodTags: ['古朴', '江景'],
      timeOfDay: 'evening',
      weather: 'cloudy',
      styleAnchors: ['国风'],
    }))
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    const out = await svc.extractFieldsFromDescription({
      assetType: 'location',
      description: '黄昏阴天的黄鹤楼，三层大楼阁，江景古朴',
      projectId: 'p1',
    })

    expect(out.name).toBe('黄鹤楼')
    expect((out as any).locationType).toBe('exterior')
    expect((out as any).scale).toBe('大')
    expect((out as any).moodTags).toEqual(['古朴', '江景'])
    expect((out as any).timeOfDay).toBe('evening')
    expect((out as any).weather).toBe('cloudy')
    expect(out.styleAnchors).toEqual(['国风'])
    await ds.destroy()
  })

  it('item: 抽出最少字段（name / styleAnchors）', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue(JSON.stringify({
      name: '青铜剑',
      styleAnchors: ['仿古'],
    }))
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    const out = await svc.extractFieldsFromDescription({
      assetType: 'item',
      description: '一把仿古青铜剑，剑身有铭文',
      projectId: 'p1',
    })

    expect(out.name).toBe('青铜剑')
    expect(out.styleAnchors).toEqual(['仿古'])
    await ds.destroy()
  })

  it('callAI 被传入 description 在 user prompt 中', async () => {
    const ds = await buildDb()
    const callAI = vi.fn().mockResolvedValue('{}')
    const svc = new AssetSettingEnrichmentService(ds, callAI as any)

    await svc.extractFieldsFromDescription({
      assetType: 'character',
      description: '少年阿白',
      projectId: 'p1',
    })

    expect(callAI).toHaveBeenCalledTimes(1)
    const [userPrompt, systemPrompt] = callAI.mock.calls[0]
    expect(userPrompt).toContain('少年阿白')
    expect(systemPrompt).toContain('JSON')
    await ds.destroy()
  })
})
