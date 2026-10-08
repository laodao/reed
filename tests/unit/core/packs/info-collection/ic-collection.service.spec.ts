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
import { fingerprintText } from '@shared/utils/info-collection-fingerprint'

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
      // 第二模型复核缺省全一致（复核不一致的场景在专门用例注入）
      reviewLlm: async () => '{"rows":[]}',
      search: async () => ({ items: [{ title: '测试主题 官方发布', url: 'https://stats.example.com/2024?a=1&utm_source=x', snippet: '测试主题 逐年数据官方口径' }] }),
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

  it('双模型复核：第二模型判不一致 → 行降 low confidence + needs_review + 备注；整源超 20% 降级', async () => {
    const repos = await buildRepos()
    const snapshots = new Map<string, string>()
    let reviewCalls = 0
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      reviewLlm: async () => {
        reviewCalls += 1
        // 第一条（有效行）被判不一致：模拟第二模型不同意
        return JSON.stringify({ rows: [{ index: 0, verdict: 'inconsistent', reason: '数值与正文段落上下文不符' }] })
      },
      search: async () => ({ items: [{ title: '测试主题 官方发布', url: 'https://stats.example.com/2024', snippet: '' }] }),
      fetch: async () => ({ ok: true, status: 200, body: htmlOf(PAGE_TEXT) }),
      extract: (html: string) => html.replace(/<[^>]+>/g, ''),
      kb: { addDocument: async () => ({ documentId: null }) },
      snapshotStore: {
        write: async (_p, sourceId, html) => {
          snapshots.set(sourceId, html)
          return `snap/${sourceId}`
        },
        read: async () => null,
      },
      newId: id,
    })
    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-rev', name: 'n', goal: 'g', blueprint: blueprintFixture() })
      const { done } = await service.runTask('p-rev')
      await done
      const rows = await repos.rows.listByProject('p-rev')
      expect(rows).toHaveLength(1)
      expect(rows[0].confidence).toBe('low')
      expect(rows[0].needsReview).toBe(true)
      expect(rows[0].reviewNote).toBe('数值与正文段落上下文不符')
      const task = (await repos.tasks.listByProject('p-rev'))[0]
      const stats = task.stats as Record<string, number>
      expect(stats['reviewTotal']).toBe(1)
      expect(stats['reviewInconsistent']).toBe(1)
      expect(reviewCalls).toBe(1)
    })
  })

  it('裁决：转载簇 + 主源选择 + 冲突归因 revision 关旧开新 + 孤证标记', async () => {
    const repos = await buildRepos()
    const fp = JSON.stringify(fingerprintText(PAGE_TEXT))
    const bp = blueprintFixture()
    bp.requirements.push({ id: 'R3', question: '必须项（单源）', form: 'fact', priority: 'must' })
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async req =>
        req.system.includes('仲裁员')
          ? JSON.stringify({ type: 'revision', keepRowId: 'r-1', note: '后期核实数替代初步数' })
          : extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      fetch: async () => ({ ok: true, status: 200, body: htmlOf(PAGE_TEXT) }),
      extract: (html: string) => html.replace(/<[^>]+>/g, ''),
      kb: { addDocument: async () => ({ documentId: null }) },
      newId: id,
    })
    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-adj', name: 'n', goal: 'g', blueprint: bp })
      // 两个同文源（转载簇）+ 一个无指纹单例
      await repos.sources.create({ id: 's-a', projectId: 'p-adj', taskId: 't', url: 'https://a.example/1', urlNormalized: 'https://a.example/1', fetchStatus: 'ok', textFingerprint: fp, publishedAt: new Date('2025-01-01') })
      await repos.sources.create({ id: 's-b', projectId: 'p-adj', taskId: 't', url: 'https://b.example/1', urlNormalized: 'https://b.example/1', fetchStatus: 'ok', textFingerprint: fp, publishedAt: new Date('2025-02-01') })
      await repos.sources.create({ id: 's-c', projectId: 'p-adj', taskId: 't', url: 'https://c.example/1', urlNormalized: 'https://c.example/1', fetchStatus: 'ok' })
      // 同数据点冲突：s-a=900（初步数）、s-b=954（核实数）
      await repos.rows.create({ id: 'r-1', projectId: 'p-adj', taskId: 't', schemaId: 's1', row: { v: 900, u: '万人', p: '2024', m: '出生人口', region: '全国' }, measure: { value: 900, unit: '万人', period: '2024', metric: '出生人口', dims: { region: '全国' } }, sourceId: 's-a', requirementId: 'R1', quote: 'q1', contentHash: 'h1' })
      await repos.rows.create({ id: 'r-2', projectId: 'p-adj', taskId: 't', schemaId: 's1', row: { v: 954, u: '万人', p: '2024', m: '出生人口', region: '全国' }, measure: { value: 954, unit: '万人', period: '2024', metric: '出生人口', dims: { region: '全国' } }, sourceId: 's-b', requirementId: 'R1', quote: 'q2', contentHash: 'h2' })
      await repos.rows.create({ id: 'r-3', projectId: 'p-adj', taskId: 't', schemaId: 's1', row: { m: '事实' }, measure: null, sourceId: 's-a', requirementId: 'R3', quote: 'q3', contentHash: 'h3' })

      const result = await service.adjudicateProject('p-adj')
      expect(result.clusters).toBe(1)
      expect(result.conflictsFound).toBe(1)
      expect(result.conflictsAttributed).toBe(1)

      // 簇主源：发布最早者当主源
      const sa = await repos.sources.getById('s-a')
      const sb = await repos.sources.getById('s-b')
      expect(sa?.isPrimary).toBe(true)
      expect(sb?.isPrimary).toBe(false)
      expect(sa?.clusterId).toBe(sb?.clusterId)

      // revision 归因：keepRowId 保留，另一行 superseded（关旧开新，历史可回溯）
      const r1 = await repos.rows.getById('r-1')
      const r2 = await repos.rows.getById('r-2')
      expect(r2?.status).toBe('superseded')
      expect(r2?.supersededBy).toBe('r-1')
      expect(r1?.reviewNote).toContain('修订关系')

      // 孤证：R3 仅 s-a 支撑，s-a/s-b 同簇 → 独立来源单位只有 1 个 → 标记孤证
      const r3 = await repos.rows.getById('r-3')
      expect(r3?.singleSource).toBe(true)
    })
  })

  it('裁决：归因失败 → 全组按真矛盾进人审（fail-soft，不猜测）', async () => {
    const repos = await buildRepos()
    const service = new IcCollectionService({
      repos: () => repos,
      // 归因调用返回无 type 字段的 JSON → attributeConflict 抛错 → 兜底真矛盾
      llm: async () => extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      fetch: async () => ({ ok: true, status: 200, body: htmlOf(PAGE_TEXT) }),
      extract: (html: string) => html.replace(/<[^>]+>/g, ''),
      kb: { addDocument: async () => ({ documentId: null }) },
      newId: id,
    })
    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-conf', name: 'n', goal: 'g', blueprint: blueprintFixture() })
      await repos.sources.create({ id: 's-x', projectId: 'p-conf', taskId: 't', url: 'https://x.example/1', urlNormalized: 'https://x.example/1', fetchStatus: 'ok' })
      await repos.sources.create({ id: 's-y', projectId: 'p-conf', taskId: 't', url: 'https://y.example/1', urlNormalized: 'https://y.example/1', fetchStatus: 'ok' })
      await repos.rows.create({ id: 'r-x', projectId: 'p-conf', taskId: 't', schemaId: 's1', row: { v: 954, m: '出生人口' }, measure: { value: 954, unit: '万人', period: '2024', metric: '出生人口', dims: null }, sourceId: 's-x', requirementId: 'R1', quote: 'qx', contentHash: 'hx' })
      await repos.rows.create({ id: 'r-y', projectId: 'p-conf', taskId: 't', schemaId: 's1', row: { v: 900, m: '出生人口' }, measure: { value: 900, unit: '万人', period: '2024', metric: '出生人口', dims: null }, sourceId: 's-y', requirementId: 'R1', quote: 'qy', contentHash: 'hy' })

      const result = await service.adjudicateProject('p-conf')
      expect(result.conflictsFound).toBe(1)
      expect(result.conflictsAttributed).toBe(0)

      // 两行都进人审，备注指向归因失败
      const rx = await repos.rows.getById('r-x')
      const ry = await repos.rows.getById('r-y')
      expect(rx?.needsReview).toBe(true)
      expect(ry?.needsReview).toBe(true)
      expect(rx?.reviewNote).toContain('归因失败')
      // 不做静默 supersede——历史保留，交人审裁决
      expect(ry?.status).toBe('draft')
    })
  })

  it('整理报告：要点卡反查剔幻觉数值 + 确定性区块齐全 + 第二模型审备注 + 入 kb', async () => {
    const repos = await buildRepos()
    const kbCalls: KbCall[] = []
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async req => {
        if (req.system.includes('整理撰稿人')) {
          return JSON.stringify({
            cards: [
              {
                irId: 'R1',
                title: '出生人口要点',
                statements: [
                  { text: '2024 年出生人口 954 万人', evidenceRowIds: ['r-c1'] },
                  { text: '2024 年出生人口 999 万人（幻觉数字）', evidenceRowIds: ['r-c1'] },
                ],
              },
            ],
          })
        }
        if (req.system.includes('审稿人')) return JSON.stringify({ issues: ['R2 无对应内容且未说明缺失'] })
        return extractionOutput()
      },
      reviewLlm: async req =>
        req.system.includes('审稿人') ? JSON.stringify({ issues: ['R2 无对应内容且未说明缺失'] }) : '{"rows":[]}',
      fetch: async () => ({ ok: true, status: 200, body: htmlOf(PAGE_TEXT) }),
      extract: (html: string) => html.replace(/<[^>]+>/g, ''),
      kb: {
        addDocument: async (kbId: string, doc: { name: string; content: string; sourceId: string }) => {
          kbCalls.push({ kbId, ...doc })
          return { documentId: 'kbdoc-report' }
        },
      },
      newId: id,
    })
    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-rep', name: '报告项目', goal: 'g', blueprint: blueprintFixture(), kbId: 'kb-1' })

      // 无已确认条目 → 响亮拒绝（不生成空报告）
      await expect(service.generateReport('p-rep')).rejects.toThrow('还没有已确认的条目')

      // 造已确认源 + 行
      await repos.sources.create({ id: 'src-r', projectId: 'p-rep', taskId: 't', url: 'https://r.example/1', urlNormalized: 'https://r.example/1', fetchStatus: 'ok' })
      await repos.sources.patch('src-r', { tier: 1, tierRationale: '官方统计机构', reviewStatus: 'confirmed' })
      const row = await repos.rows.create({
        id: 'r-c1',
        projectId: 'p-rep',
        taskId: 't',
        schemaId: 's1',
        row: { v: 954, u: '万人', p: '2024', m: '出生人口', region: '全国' },
        measure: { value: 954, unit: '万人', period: '2024', metric: '出生人口', dims: { region: '全国' } },
        sourceId: 'src-r',
        requirementId: 'R1',
        quote: '全年出生人口954万人',
        contentHash: 'h-rep',
      })
      await repos.rows.confirmRows([row.id])

      const result = await service.generateReport('p-rep')
      // 反查：幻觉数字 999 被剔（条目里只有 954）
      expect(result.strippedStatements).toBe(1)
      expect(result.markdown).toContain('2024 年出生人口 954 万人')
      expect(result.markdown).not.toContain('999')
      // 确定性区块齐全
      expect(result.markdown).toContain('## 一、要点卡')
      expect(result.markdown).toContain('## 二、数据表')
      expect(result.markdown).toContain('## 三、时间线')
      expect(result.markdown).toContain('## 四、引用清单')
      expect(result.markdown).toContain('## 五、质量报告')
      expect(result.markdown).toContain('T1')
      // 第二模型审：标注制随稿交付
      expect(result.reviewIssues).toEqual(['R2 无对应内容且未说明缺失'])
      expect(result.markdown).toContain('## 审核备注')
      // 入 kb
      expect(result.imported).toBe(true)
      expect(result.documentId).toBe('kbdoc-report')
      expect(kbCalls[0].kbId).toBe('kb-1')
      expect(kbCalls[0].content).toContain('【信息搜集】报告项目')
    })
  })
})

// ==================== 多模态 M1：文档直链分支 ====================

describe('IcCollectionService 文档直链分支（下载原件 → 提文本 → 统一资产建卡）', () => {
  afterEach(async () => {
    if (ds) {
      await ds.destroy()
      ds = null
    }
  })

  it('端到端：直链命中 → 下载落盘 → extract-text 提文本 → 建资产卡(assetId 回写) → 抽取照常；驳回删卡', async () => {
    const repos = await buildRepos()
    const createdAssets: Array<Record<string, unknown>> = []
    const removedAssets: string[] = []
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'ic-doc-test-'))
    const docPath = join(dir, '2024-report.txt')
    // >300 字（文档正文过短会标 failed）；引句句嵌在其中供抽取回验
    const docText = PAGE_TEXT + '全年出生人口954万人，出生率为6.77‰。'
    await writeFile(docPath, docText, 'utf-8')
    const snapshotsDoc = new Map<string, string>()

    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      search: async () => ({
        items: [{ title: '2024 年统计公报（PDF 原件）', url: 'https://stats.example.com/files/2024-report.txt', snippet: '测试主题 filetype:pdf 官方文件' }],
      }),
      documentFetch: async () => ({ ok: true, status: 200, filePath: docPath, mimeType: 'text/plain', bytes: Buffer.byteLength(docText) }),
      extract: (html: string) => html.replace(/<[^>]+>/g, ''),
      snapshotStore: {
        write: async (_p, sourceId, html, _md) => {
          snapshotsDoc.set(sourceId, html)
          return `info-collection/snapshots/${sourceId}.mht`
        },
        read: async () => null,
      },
      assets: {
        create: async input => {
          createdAssets.push({ ...input })
          return { id: `asset-${createdAssets.length}` }
        },
        remove: async id => {
          removedAssets.push(id)
        },
      },
      newId: id,
    })

    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({
        id: 'p-doc',
        name: '文档项目',
        goal: 'g',
        blueprint: blueprintFixture(),
        kbId: null,
      })
      const { done } = await service.runTask('p-doc')
      await done

      // 源：ok + assetId 回写；快照 html 段为空串（文档无 HTML）
      const sources = await repos.sources.listByProject('p-doc')
      expect(sources).toHaveLength(1)
      const src = sources[0]
      expect(src.fetchStatus).toBe('ok')
      expect(src.assetId).toBe('asset-1')
      expect(snapshotsDoc.get(src.id)).toBe('')

      // 资产卡：一资产一文件一正文 + 溯源元数据
      expect(createdAssets).toHaveLength(1)
      const card = createdAssets[0] as Record<string, unknown>
      expect(card['category']).toBe('document')
      expect(card['subCategory']).toBe('文档项目')
      expect(card['sourceType']).toBe('info-collection')
      expect(card['sourceRef']).toBe('p-doc')
      expect(card['url']).toBe('https://stats.example.com/files/2024-report.txt')
      expect(String(card['textContent'])).toContain('全年出生人口954万人')
      expect((card['metadata'] as Record<string, unknown>)['mediaKind']).toBe('document')

      // 抽取照常跑在文档文本上
      const rows = await repos.rows.listByProject('p-doc')
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0].quote).toContain('954')

      // 驳回 → 删卡删件
      await service.rejectBatch('p-doc', [src.id], '测试驳回')
      expect(removedAssets).toEqual(['asset-1'])
      const after = await repos.sources.getById(src.id)
      expect(after?.reviewStatus).toBe('rejected')
    })
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('扫描版文档（提不出文本）→ 如实标 failed，不建卡', async () => {
    const repos = await buildRepos()
    const createdAssets: Array<unknown> = []
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'ic-doc-scan-'))
    const docPath = join(dir, 'scan.txt')
    await writeFile(docPath, '短文本', 'utf-8')

    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      search: async () => ({
        items: [{ title: '扫描版文件', url: 'https://example.com/files/scan.txt', snippet: '测试主题 文件' }],
      }),
      documentFetch: async () => ({ ok: true, status: 200, filePath: docPath, mimeType: 'text/plain', bytes: 9 }),
      snapshotStore: { write: async () => null, read: async () => null },
      assets: {
        create: async input => {
          createdAssets.push(input)
          return { id: 'asset-x' }
        },
        remove: async () => undefined,
      },
      newId: id,
    })

    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-scan', name: '扫描项目', goal: 'g', blueprint: blueprintFixture(), kbId: null })
      const { done } = await service.runTask('p-scan')
      await done
      const sources = await repos.sources.listByProject('p-scan')
      expect(sources).toHaveLength(1)
      expect(sources[0].fetchStatus).toBe('failed')
      expect(sources[0].assetId).toBeNull()
      expect(sources[0].tierRationale).toContain('扫描版')
      expect(createdAssets).toHaveLength(0)
    })
  })
})

describe('IcCollectionService 图片直链分支（多模态 M2）', () => {
  afterEach(async () => {
    if (ds) {
      await ds.destroy()
      ds = null
    }
  })

  it('直链命中 → 下载 → VLM 描述 → 建卡(category=image, 描述即内容化文本) → 预算外图片不再描述', async () => {
    const repos = await buildRepos()
    const createdAssets: Array<Record<string, unknown>> = []
    const visionCalls: string[] = []
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'ic-img-test-'))
    const desc = '图片显示一张柱状图：2024 年出生人口 954 万人（读自图表，可能有读数误差）。'
    let imgSeq = 0
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      search: async () => ({
        items: [
          { title: '出生人口统计图', url: 'https://example.com/charts/birth-2024.png', snippet: '测试主题 图表' },
          { title: '出生人口统计图二', url: 'https://example.com/charts/birth-2024-b.png', snippet: '测试主题 图表' },
          { title: '出生人口统计图三', url: 'https://example.com/charts/birth-2024-c.png', snippet: '测试主题 图表' },
        ],
      }),
      documentFetch: async url => {
        imgSeq += 1
        const p = join(dir, `img-${imgSeq}.png`)
        await writeFile(p, 'fake-png-bytes')
        return { ok: true, status: 200, filePath: p, mimeType: 'image/png', bytes: 13 }
      },
      vision: async req => {
        visionCalls.push(req.imagePath)
        return { ok: true, text: desc }
      },
      snapshotStore: { write: async () => null, read: async () => null },
      assets: {
        create: async input => {
          createdAssets.push({ ...input })
          return { id: `asset-img-${createdAssets.length}` }
        },
        remove: async () => undefined,
      },
      newId: id,
    })

    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-img', name: '图片项目', goal: 'g', blueprint: blueprintFixture(), kbId: null })
      const { done } = await service.runTask('p-img')
      await done
      const sources = await repos.sources.listByProject('p-img')
      expect(sources).toHaveLength(3)
      expect(sources.every(s => s.fetchStatus === 'ok' && s.assetId)).toBe(true)
      expect(sources[0].tier).toBe(3)
      // 熔断：IC_MAX_IMAGE_DESCRIPTIONS=20 > 3 → 全部描述；描述即卡片正文
      expect(visionCalls).toHaveLength(3)
      const card = createdAssets[0] as Record<string, unknown>
      expect(card['category']).toBe('image')
      expect(card['textContent']).toContain('954')
      expect((card['metadata'] as Record<string, unknown>)['mediaKind']).toBe('image')
      const task = (await repos.tasks.listByProject('p-img'))[0]
      expect((task.stats as Record<string, unknown>)['imageDescriptions']).toBe(3)
    })
  })

  it('视觉描述失败（模型无 vision）→ 源仍 ok、卡只存原件、标注内容化待补', async () => {
    const repos = await buildRepos()
    const createdAssets: Array<Record<string, unknown>> = []
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'ic-img-nv-'))
    const p0 = join(dir, 'img.png')
    await writeFile(p0, 'fake-png-bytes')
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      search: async () => ({
        items: [{ title: '未描述图', url: 'https://example.com/plain.png', snippet: '测试主题 图片' }],
      }),
      documentFetch: async () => ({ ok: true, status: 200, filePath: p0, mimeType: 'image/png', bytes: 13 }),
      vision: async () => ({ ok: false, error: '模型不支持 vision' }),
      snapshotStore: { write: async () => null, read: async () => null },
      assets: {
        create: async input => {
          createdAssets.push({ ...input })
          return { id: 'asset-nodesc' }
        },
        remove: async () => undefined,
      },
      newId: id,
    })
    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-img2', name: '图片项目二', goal: 'g', blueprint: blueprintFixture(), kbId: null })
      const { done } = await service.runTask('p-img2')
      await done
      const sources = await repos.sources.listByProject('p-img2')
      expect(sources[0].fetchStatus).toBe('ok')
      expect(sources[0].assetId).toBe('asset-nodesc')
      expect(sources[0].tierRationale).toContain('待补')
      const card = createdAssets[0] as Record<string, unknown>
      expect(card['textContent']).toBeUndefined()
      expect((card['metadata'] as Record<string, unknown>)['described']).toBe(false)
    })
  })
})


describe('IcCollectionService 视频页分支（多模态 M3 元数据档）', () => {
  afterEach(async () => {
    if (ds) {
      await ds.destroy()
      ds = null
    }
  })

  it('B站视频 → 元数据+CC字幕为内容化文本 → 纯文本资产卡(category=video)', async () => {
    const repos = await buildRepos()
    const createdTexts: Array<Record<string, unknown>> = []
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      search: async () => ({
        items: [{ title: '公司法解读视频', url: 'https://www.bilibili.com/video/BV1xx411c7mD', snippet: '测试主题 视频' }],
      }),
      videoMeta: async () => ({
        ok: true,
        platform: 'bilibili',
        title: '新公司法十大变化',
        desc: '逐条解读 2023 修订要点。',
        owner: '法律Up主',
        durationSec: 754,
        subtitleText: '大家好，今天讲公司法。2024 年 7 月 1 日起新公司法施行。',
      }),
      snapshotStore: { write: async () => null, read: async () => null },
      assets: {
        create: async () => ({ id: 'unused' }),
        createText: async input => {
          createdTexts.push({ ...input })
          return { id: 'asset-video-1' }
        },
        remove: async () => undefined,
      },
      newId: id,
    })
    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-video', name: '视频项目', goal: 'g', blueprint: blueprintFixture(), kbId: null })
      const { done } = await service.runTask('p-video')
      await done
      const sources = await repos.sources.listByProject('p-video')
      expect(sources[0].fetchStatus).toBe('ok')
      expect(sources[0].assetId).toBe('asset-video-1')
      expect(sources[0].tier).toBe(3)
      const card = createdTexts[0]
      expect(card['category']).toBe('video')
      expect(String(card['text'])).toContain('字幕全文')
      expect(String(card['text'])).toContain('2024 年 7 月 1 日')
      expect((card['metadata'] as Record<string, unknown>)['hasSubtitle']).toBe(true)
    })
  })

  it('视频元数据获取失败(API 限流等) → 如实 failed 不建卡', async () => {
    const repos = await buildRepos()
    const service = new IcCollectionService({
      repos: () => repos,
      llm: async () => extractionOutput(),
      reviewLlm: async () => '{"rows":[]}',
      search: async () => ({
        items: [{ title: 'bv 视频', url: 'https://www.bilibili.com/video/BV1zz411c7mX', snippet: '测试主题' }],
      }),
      videoMeta: async () => ({ ok: false, platform: 'bilibili', error: 'B站 API code=-412 风控' }),
      snapshotStore: { write: async () => null, read: async () => null },
      assets: { create: async () => ({ id: 'x' }), createText: async () => ({ id: 'y' }), remove: async () => undefined },
      newId: id,
    })
    await runWithUserAsync('user-a', async () => {
      await repos.projects.create({ id: 'p-video2', name: '视频项目二', goal: 'g', blueprint: blueprintFixture(), kbId: null })
      const { done } = await service.runTask('p-video2')
      await done
      const sources = await repos.sources.listByProject('p-video2')
      expect(sources[0].fetchStatus).toBe('failed')
      expect(sources[0].tierRationale).toContain('风控')
    })
  })
})
