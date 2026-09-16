/**
 * 卷设计流编排单测（假 LLM 注入）：pass 序列 / 网格分批 / 修复回路 / 修复耗尽 /
 * gather 上下文（spine 章界解析、开放伏笔账入提示词）。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import {
  LwCharacterEntity,
  LwForeshadowEntity,
  LwEventEntity,
  LwStoryOverviewEntity,
  LwDesignDocumentEntity,
} from '@core/database/entities'
import { LwCharacterRepository } from '@core/database/repositories/lw-character.repository'
import { LwForeshadowRepository } from '@core/database/repositories/lw-foreshadow.repository'
import { LwEventRepository } from '@core/database/repositories/lw-event.repository'
import { LwStoryOverviewRepository } from '@core/database/repositories/lw-story-overview.repository'
import { LwDesignDocumentRepository } from '@core/database/repositories/lw-design-document.repository'
import { runVolumeDesignFlow, extractJsonObject } from '@core/platform/services/longwriting/design/volume-design-flow'
import type { VolumeDesignDoc } from '@shared/contracts/longwriting-design'

const PROJECT = 'proj_flow'

let ds: DataSource
let db: Record<string, any>

const spine = {
  core: { premise: '小捕快查身世', theme: '公道', ending: '真相大白' },
  main_lines: [{ id: 'p_main_1', title: '身世主线', stages: ['发现', '对决'] }],
  core_cast: ['c_chengye'],
  volumes: [{ id: 'v1', title: '初入汴京', chapter_range: { from: 1, to: 20 }, focus: '查案' }],
}

function makeDoc(gridChs: number[]): VolumeDesignDoc {
  return {
    volume: 'v1',
    cast: [{ id: 'c_chengye', kind: 'character', name: '程野', importance: 'core' }],
    threads: [{ id: 'hl_01', name: '身世线', involves: ['c_chengye'], plant: 2, develop: [8], payoff: 18 }],
    grid: gridChs.map((ch) => ({ ch, beats: [`第${ch}章节拍`] })),
    events: [],
  }
}

/** 假 LLM：按 system 提示词里的 pass 标记响应；维护"当前文档"状态 */
function makeFakeLlm(opts: { failSkeletonTimes?: number } = {}) {
  const calls: Array<{ sys: string; user: string }> = []
  let skeletonFails = opts.failSkeletonTimes ?? 0
  let current: VolumeDesignDoc | null = null

  const llm = async (sys: string, user: string): Promise<string> => {
    calls.push({ sys, user })
    const parseCurrent = (): VolumeDesignDoc | null => {
      const marker = '【当前卷设计文档】\n'
      const i = user.indexOf(marker)
      if (i < 0) return current
      try {
        return JSON.parse(user.slice(i + marker.length, user.lastIndexOf('}') + 1)) as VolumeDesignDoc
      } catch {
        return current
      }
    }

    if (sys.includes('修复全部错误')) {
      // 修复 pass：修正已知错误形态（骨架坏的 volume 字段），其余原样
      const base = current ?? makeDoc([])
      return JSON.stringify({ ...base, volume: 'v1' })
    }
    if (sys.includes('卷骨架')) {
      if (skeletonFails > 0) {
        skeletonFails -= 1
        current = { ...(makeDoc([1]) as any), volume: 'volume_one' } // 非法 volume id
        return JSON.stringify(current)
      }
      current = makeDoc(Array.from({ length: 20 }, (_, i) => i + 1))
      return JSON.stringify(current)
    }
    if (sys.includes('人物与实体层')) {
      current = { ...(parseCurrent() ?? makeDoc([])) }
      current.cast = [
        ...current.cast,
        { id: 'c_suwantang', kind: 'character', name: '苏晚棠', aliases: ['苏掌柜'], importance: 'volume' as const },
      ]
      current.threads = [{ ...current.threads[0], involves: ['c_chengye', 'c_suwantang'] }]
      return JSON.stringify(current)
    }
    if (sys.includes('章节网格')) {
      const m = /第 (\d+) 到 (\d+) 章/.exec(sys)
      const from = Number(m?.[1])
      const to = Number(m?.[2])
      current = { ...(parseCurrent() ?? makeDoc([])) }
      // 区间内替换（幂等语义），区间外保留
      const refined = new Map<number, VolumeDesignDoc['grid'][number]>()
      for (let ch = from; ch <= to; ch++) {
        refined.set(ch, {
          ch,
          beats: [`第${ch}章：细化节拍`],
          present: ['c_chengye'],
          line_actions: ch === 18 ? [{ line: 'hl_01', act: 'payoff' }] : [],
        })
      }
      current.grid = current.grid
        .filter((g) => !refined.has(g.ch))
        .concat([...refined.values()])
        .sort((a, b) => a.ch - b.ch)
      return JSON.stringify(current)
    }
    if (sys.includes('整合修订')) {
      current = { ...(parseCurrent() ?? makeDoc([])) }
      current.events = [{ id: 'ev_18_reveal', chapter: 18, story_time: '永昌三十一年冬', desc: '身份揭穿', participants: ['c_chengye'] }]
      return JSON.stringify(current)
    }
    throw new Error(`假 LLM 未识别的 pass：${sys.slice(0, 40)}`)
  }
  return { llm, calls }
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [LwCharacterEntity, LwForeshadowEntity, LwEventEntity, LwStoryOverviewEntity, LwDesignDocumentEntity],
    synchronize: true,
  })
  await ds.initialize()
  db = {
    lwCharacters: new LwCharacterRepository(ds),
    lwForeshadows: new LwForeshadowRepository(ds),
    lwEvents: new LwEventRepository(ds),
    lwStoryOverviews: new LwStoryOverviewRepository(ds),
    lwDesignDocuments: new LwDesignDocumentRepository(ds),
  }
  // 已确认 spine（gather 从这里取章界）+ 一条开放伏笔
  await db.lwDesignDocuments.create({ projectId: PROJECT, kind: 'spine', title: '总纲', doc: spine })
  const row = await db.lwDesignDocuments.listByProject(PROJECT)
  await db.lwDesignDocuments.setStatus(row[0].id, 'confirmed')
  await db.lwForeshadows.createRow(PROJECT, '断剑是父亲遗物', 1, { type: 'discussion' })
})

afterAll(async () => {
  await ds.destroy()
})

describe('volume-design flow', () => {
  it('全流程：骨架→人物层→网格分批(2 批)→整合，共 5 次调用，开放伏笔入提示词', async () => {
    const fake = makeFakeLlm()
    const progress: string[] = []
    const r = await runVolumeDesignFlow(db, PROJECT, {
      volumeId: 'v1',
      gridBatchSize: 10,
      llm: fake.llm,
      onProgress: (p) => progress.push(p.pass),
    })

    expect(r.ok, r.message).toBe(true)
    expect(r.passes).toEqual(['骨架', '人物层', '网格1-10', '网格11-20', '整合'])
    expect(fake.calls).toHaveLength(5)
    expect(r.repairs).toBe(0)
    expect(r.doc?.grid).toHaveLength(20)
    expect(r.doc?.events).toHaveLength(1)
    expect(progress).toContain('网格11-20')

    // gather 上下文：spine 章界/名册/开放伏笔账进提示词；无 confirmed 账本时不含账本段
    const skeletonCall = fake.calls[0]
    expect(skeletonCall.user).toContain('第 1-20 章')
    expect(skeletonCall.user).toContain('断剑是父亲遗物')
    expect(skeletonCall.user).not.toContain('共识账本')
    const gridCall = fake.calls[2]
    expect(gridCall.sys).toContain('第 1 到 10 章')
  }, 30_000)

  it('修复回路：骨架首次非法 → 修复一轮后通过（repairs=1）', async () => {
    const fake = makeFakeLlm({ failSkeletonTimes: 1 })
    const r = await runVolumeDesignFlow(db, PROJECT, { volumeId: 'v1', gridBatchSize: 20, llm: fake.llm })
    expect(r.ok, r.message).toBe(true)
    expect(r.repairs).toBe(1)
    expect(r.passes[0]).toBe('骨架')
    expect(r.passes[1]).toBe('骨架:repair1')
    // 修复调用带错误清单
    const repairCall = fake.calls[1]
    expect(repairCall.sys).toContain('修复全部错误')
    expect(repairCall.user).toContain('校验错误清单')
  }, 30_000)

  it('修复耗尽：持续非法 → 失败并带错误清单（不产出文档）', async () => {
    const brokenLlm = async (): Promise<string> =>
      JSON.stringify({ ...makeDoc([1]), volume: 'not-valid', cast: [], grid: [] })
    const r = await runVolumeDesignFlow(db, PROJECT, {
      volumeId: 'v1',
      gridBatchSize: 20,
      maxRepairRounds: 2,
      llm: brokenLlm,
    })
    expect(r.ok).toBe(false)
    expect(r.doc).toBeUndefined()
    expect(r.errors?.length).toBeGreaterThan(0)
    expect(r.passes.filter((p) => p.includes('repair'))).toHaveLength(2)
  }, 30_000)

  it('章界未知且无 spine 声明 → 响亮失败', async () => {
    await expect(
      runVolumeDesignFlow(db, PROJECT, { volumeId: 'v99', llm: makeFakeLlm().llm }),
    ).rejects.toThrow(/章界未知/)
  }, 30_000)
})

describe('extractJsonObject', () => {
  it('容忍围栏与尾部赘述', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```\n以上是结果')).toEqual({ a: 1 })
    expect(extractJsonObject('前言 {"a":{"b":"}"}} 后记')).toEqual({ a: { b: '}' } })
  })
  it('无 JSON 时抛错', () => {
    expect(() => extractJsonObject('没有对象')).toThrow(/未找到/)
  })
})
