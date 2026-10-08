/**
 * 管线编排服务集成测试（ic-collection.service；真实 better-sqlite3 + 迁移 + 全内存假依赖）
 * @module tests/unit/core/packs/info-collection/ic-collection.service.spec
 *
 * 钉死主设计 §3 的核心质量机制在编排层的落点：
 * - 引句回验拒收（防编造）+ schema 拒收 + content_hash 分域 merged；
 * - 来源评估落库（tier+rationale）与 irHits 回写；
 * - 判停（负结果如实记录、覆盖率如实统计）；
 * - 入库闸门（无分级依据的源不允许确认）+ kb 导入（每源一文档、溯源头）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createInfoCollectionTables } from '@core/database/migrations/create-info-collection-tables'
import { IcProjectRepository } from '@core/database/repositories/ic-project.repository'
import { IcTaskRepository } from '@core/database/repositories/ic-task.repository'
import { IcTaskPassRepository } from '@core/database/repositories/ic-task-pass.repository'
import { IcSourceRepository } from '@core/database/repositories/ic-source.repository'
import { IcRowRepository } from '@core/database/repositories/ic-row.repository'
import { IcCollectionService } from '@core/packs/info-collection/services/ic-collection.service'
import type { IcRepos } from '@core/packs/info-collection/services/ic-deps'
import type { IcBlueprint } from '@shared/types/info-collection.types'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/info-collection/ic-project.entity'),
  () => import('@core/database/entities/info-collection/ic-task.entity'),
  () => import('@core/database/entities/info-collection/ic-task-pass.entity'),
  () => import('@core/database/entities/info-collection/ic-source.entity'),
  () => import('@core/database/entities/info-collection/ic-row.entity'),
]

async function buildRepos(): Promise<IcRepos> {
  const entities = []
  for (const imp of ENTITY_IMPORTS) {
    const mod = await imp()
    entities.push(Object.values(mod)[0] as new () => object)
  }
  const d = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: false })
  await d.initialize()
  await createInfoCollectionTables(d)
  ds = d
  return {
    projects: new IcProjectRepository(d),
    tasks: new IcTaskRepository(d),
    passes: new IcTaskPassRepository(d),
    sources: new IcSourceRepository(d),
    rows: new IcRowRepository(d),
  }
}

/** 正文 ≥300 字（提取过短会被转手动导入）；引句句嵌在中间 */
const PAGE_TEXT =
  '根据官方统计部门公布的数据，本年度经济运行总体平稳、稳中有进。'.repeat(6) +
  '全年出生人口954万人，出生率为6.77‰；死亡人口1093万人。' +
  '分地区看，东部地区贡献了主要的增量，中西部地区增速快于东部。'.repeat(6)

function htmlOf(text: string): string {
  return `<html><head><title>官方发布</title></head><body><article><p>${text}</p></article></body></html>`
}

function blueprintFixture(): IcBlueprint {
  return {
    version: 1,
    goal: '测试主题的公开数据搜集',
    assumptions: ['口径按常住人口理解'],
    requirements: [
      { id: 'R1', question: '逐年出生人口数值', form: 'data', priority: 'must', schemaId: 's1' },
      { id: 'R2', question: '政策变化时间线', form: 'fact', priority: 'should' },
    ],
    schemas: [
      {
        id: 's1',
        title: '数值行',
        jsonSchema: { type: 'object', properties: { v: { type: 'number' }, u: { type: 'string' }, p: { type: 'string' }, m: { type: 'string' }, region: { type: 'string' } } },
        convention: { type: 'measure', map: { value: 'v', unit: 'u', period: 'p', metric: 'm', dims: ['region'] } },
      },
    ],
    sourceStrategy: {
      channels: ['search'],
      minTier: 1,
      languages: ['zh'],
      seedQueries: ['测试主题 逐年数据'],
      primaryHint: [],
    },
    stopRules: { coverageTarget: 0.8, minIndependentSources: 2, marginalRounds: 2, budget: { maxToolCalls: 50, maxMinutes: 30 } },
    organizationSpec: [{ kind: 'data-table' }, { kind: 'source-list' }],
    autoConfirm: false,
  }
}

/** 抽取输出（模拟模型）：1 有效 + 1 幻觉引句 + 1 与有效行重复 + 1 悬空 schema + 来源评估 */
function extractionOutput(): string {
  return (
    '```json\n' +
    JSON.stringify({
      source: { tier: 1, rationale: '官方统计机构域名与署名', publishedAt: '2025-01-17' },
      rows: [
        { requirementId: 'R1', schemaId: 's1', row: { v: 954, u: '万人', p: '2024', m: '出生人口', region: '全国' }, quote: '全年出生人口954万人', confidence: 'high' },
        { requirementId: 'R1', schemaId: 's1', row: { v: 800, u: '万人', p: '2024', m: '出生人口', region: '全国' }, quote: '全年出生人口800万人（编造）', confidence: 'high' },
        { requirementId: 'R1', schemaId: 's1', row: { v: 954, u: '万人', p: '2024', m: '出生人口', region: '全国' }, quote: '全年出生人口954万人', confidence: 'high' },
        { requirementId: 'R2', schemaId: 'ghost', row: { x: 1 }, quote: '出生率为6.77‰', confidence: 'high' },
      ],
    }) +
    '\n```'
  )
}

let seq = 0
function id(prefix: string): string {
  seq += 1
  return `${prefix}-${seq}`
}

interface KbCall {
  kbId: string
  name: string
  content: string
  sourceId: string
}

describe('IcCollectionService 管线编排', () => {
  afterEach(async () => {
    if (ds) {
      await ds.destroy()
      ds = null
    }
  })

  async function setup(opts?: { kbId?: string | null; blueprint?: IcBlueprint }) {
    const repos = await buildRepos()
    const kbCalls: KbCall[] = []
    const snapshots = new Map<string, string>()
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      search: async () => ({ items: [{ title: '官方发布', url: 'https://stats.example.com/2024?a=1&utm_source=x', snippet: '' }] }),
      fetch: async () => ({ ok: true, status: 200, body: htmlOf(PAGE_TEXT) }),
      extract: (html: string) => html.replace(/<[^>]+>/g, ''),
      kb: {
        addDocument: async (kbId: string, doc: { name: string; content: string; sourceId: string }) => {
          kbCalls.push({ kbId, ...doc })
          return { documentId: `kbdoc-${kbCalls.length}` }
        },
      },
      snapshotStore: {
        write: async (_p, sourceId, html, _md) => {
          snapshots.set(sourceId, html)
          return `info-collection/snapshots/${sourceId}.mht`
        },
        read: async path => {
          const sid = path.replace('info-collection/snapshots/', '').replace('.mht', '')
          return snapshots.get(sid) ?? null
        },
      },
      newId: id,
    })
    let projectRow
    await runWithUserAsync('user-a', async () => {
      projectRow = await repos.projects.create({
        id: 'p-1',
        name: '测试项目',
        goal: 'g',
        blueprint: opts?.blueprint ?? blueprintFixture(),
        kbId: opts?.kbId === undefined ? 'kb-1' : opts.kbId,
      })
    })
    return { repos, service, kbCalls, snapshots, project: projectRow! }
  }

  it('端到端：检索→抓取→快照→提取→抽取裁决（引句拒收/merged/schema 拒收）→ reviewing + 负结果如实', async () => {
    const { repos, service, snapshots } = await setup()
    let taskId = ''
    await runWithUserAsync('user-a', async () => {
      const { taskId: t, done } = await service.runTask('p-1')
      taskId = t
      await done

      const task = await repos.tasks.getById(taskId)
      expect(task?.status).toBe('reviewing')
      const stats = task?.stats as Record<string, unknown>
      expect(stats['rowsDraft']).toBe(1)
      expect(stats['rowsRejectedQuote']).toBe(1) // 幻觉引句被回验拒收
      expect(stats['rowsMerged']).toBe(1) // 同内容重复 → merged
      expect(stats['rowsSchemaRejected']).toBe(1) // 悬空 schema 拒收
      expect(stats['toolCalls']).toBeGreaterThan(0)
      expect(stats['coverage']).toBeCloseTo(0.5, 6) // R1 满足 / R2 负结果

      // 源：规范化 URL 入库、快照先落、tier+rationale 回写、irHits 指向 R1
      const sources = await repos.sources.listByProject('p-1')
      expect(sources).toHaveLength(1)
      const src = sources[0]
      expect(src.urlNormalized).toBe('https://stats.example.com/2024?a=1')
      expect(src.reviewStatus).toBe('staged')
      expect(src.tier).toBe(1)
      expect(src.tierRationale).toContain('官方')
      expect(src.publishedAt?.toISOString().slice(0, 10)).toBe('2025-01-17')
      expect(src.snapshotPath).toBeTruthy()
      expect(snapshots.get(src.id)).toContain('<html')
      expect(src.irHits).toEqual(['R1'])

      // 行：draft + measure 约定列投影 + quote 落库
      const rows = await repos.rows.listByProject('p-1')
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('draft')
      expect(rows[0].measure).toMatchObject({ value: 954, unit: '万人', period: '2024', metric: '出生人口' })
      expect(rows[0].quote).toBe('全年出生人口954万人')

      // 负结果：R2 未满足如实记录（不许装作没发生）
      const negative = stats['negativeResults'] as Array<{ irId: string }>
      expect(negative.map(n => n.irId)).toEqual(['R2'])
    })
    void taskId
  })

  it('增量：已采 URL 二次运行直接跳过（normalizeUrl 去重）', async () => {
    const { repos, service } = await setup()
    await runWithUserAsync('user-a', async () => {
      const first = await service.runTask('p-1')
      await first.done
      const second = await service.runTask('p-1')
      await second.done
      const sources = await repos.sources.listByProject('p-1')
      expect(sources).toHaveLength(1) // 同 URL 未重复入库
      expect((await repos.rows.listByProject('p-1')).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('入库闸门：无分级依据的源被拦下；合规源确认后 kb 收录（每源一文档 + 溯源头）且行转 confirmed', async () => {
    const { repos, service, kbCalls } = await setup()
    await runWithUserAsync('user-a', async () => {
      const { done } = await service.runTask('p-1')
      await done
      const sources = await repos.sources.listByProject('p-1', 'staged')
      // 造一个无 tier 的合规源（快照在、正文 ok）验证闸门
      await repos.sources.create({
        id: 'src-manual',
        projectId: 'p-1',
        taskId: 't-manual',
        url: 'https://x.example.com/a',
        urlNormalized: 'https://x.example.com/a',
        fetchStatus: 'ok',
      })
      const result = await service.confirmBatch('p-1', [sources[0].id, 'src-manual'])
      expect(result.confirmed).toEqual([sources[0].id])
      expect(result.skipped[0].id).toBe('src-manual')
      expect(result.skipped[0].reason).toContain('分级依据')

      // kb 收录：溯源头 + 正文；行转 confirmed
      expect(kbCalls).toHaveLength(1)
      expect(kbCalls[0].kbId).toBe('kb-1')
      expect(kbCalls[0].content).toContain('> 来源：https://stats.example.com/2024?a=1')
      expect(kbCalls[0].content).toContain('T1')
      expect(kbCalls[0].sourceId).toBe(`ic:${sources[0].id}`)
      const confirmed = await repos.sources.getById(sources[0].id)
      expect(confirmed?.reviewStatus).toBe('confirmed')
      expect(confirmed?.kbDocumentId).toBe('kbdoc-1')
      const rows = await repos.rows.listBySource(sources[0].id)
      expect(rows.every(r => r.status === 'confirmed')).toBe(true)
    })
  })

  it('蓝图自检不过 → runTask 响亮拒绝（种子查询缺失）', async () => {
    const bp = blueprintFixture()
    bp.sourceStrategy.seedQueries = []
    const { service } = await setup({ blueprint: bp, kbId: null })
    await runWithUserAsync('user-a', async () => {
      await expect(service.runTask('p-1')).rejects.toThrow('蓝图自检未通过')
    })
  })
})
