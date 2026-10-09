/**
 * 技能蒸馏服务测试：两遍流水线 / 判型 / 修复环 / 取消 / 失败语义 / 生产落盘
 * @module tests/unit/core/packs/skills/skill-distill.service
 * @description LLM 用脚本化假件（按 system 提示词标记或调用次序出牌），落盘分两层测：
 *              ① 注入假 writePackage 验证编排；② 注册真实 SkillService 到临时目录，
 *              走 skill-distill-defaults 的 defaultWritePackage 验证 SKILL.md + references 落盘。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpRoot = mkdtempSync(join(tmpdir(), 'skill-distill-'))
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({ getDataPath: () => tmpRoot }),
}))

import { SkillDistillService } from '@core/packs/skills/services/skill-distill.service'
import type { DistillLlmFn, SkillDistillDeps } from '@core/packs/skills/services/skill-distill.service'
import { defaultWritePackage } from '@core/packs/skills/services/skill-distill-defaults'
import { SkillService } from '@core/platform/workflow/skills/skill.service'
import { registerSkillService, resetSkillService } from '@core/platform/workflow/skills/skill-registry'
import type { SkillDistillRequest, SkillPackageDraft } from '@shared/types/skill-distill.types'

/** 轮询等待终态（run 是 fire-and-forget，快照驱动断言） */
async function waitFor(pred: () => boolean, timeoutMs = 3_000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await new Promise(r => setTimeout(r, 10))
  }
}

const NOTE_JSON = JSON.stringify({ chunk: 0, frameworks: [{ name: 'F1', anchor: '块#0' }] })

/** 合格组装产物（审计零 error） */
function validDraftJson(name = 'distilled-ok'): Record<string, unknown> {
  return {
    name,
    title: '蒸馏技能',
    category: '知识提炼',
    description: `把材料中的方法变成可执行技能；当需要按该方法做事时使用。`,
    whenToUse: '需要时',
    detectedType: 'methodology',
    body: [
      '# 蒸馏技能',
      '',
      '## 诚实边界',
      '',
      '- 材料未覆盖极端场景。',
      '',
      '## 参考卡片',
      '',
      '- [框架](references/frameworks.md)：需要套框架时打开',
    ].join('\n'),
    references: [{ filename: 'frameworks.md', content: '# 框架\n\n内容转述，不搬原文。' }],
  }
}

/** 按调用次序出牌的 LLM 假件（出牌用尽抛错——漏排 notes 会被立刻暴露） */
function scriptedLlm(responses: string[], calls?: Array<{ system: string; user: string; maxTokens?: number }>): DistillLlmFn {
  let i = 0
  return async req => {
    calls?.push(req)
    if (i >= responses.length) throw new Error('假 LLM 出牌用尽')
    return responses[i++]
  }
}

/** 按 system 标记出牌：笔记/组装/修复自动应答（调用次数不固定的场景用） */
function markerLlm(overrides: { notes?: string; assemble?: string; repairs?: string[] }, calls?: Array<{ system: string }>): DistillLlmFn {
  let repairIdx = 0
  return async req => {
    calls?.push(req)
    if (req.system.includes('阅读笔记员')) return overrides.notes ?? NOTE_JSON
    if (req.system.includes('组装师')) return overrides.assemble ?? JSON.stringify(validDraftJson())
    // 修复师
    const repairs = overrides.repairs ?? [JSON.stringify(validDraftJson())]
    return repairs[Math.min(repairIdx++, repairs.length - 1)]
  }
}

function makeService(llm: DistillLlmFn, deps: Partial<SkillDistillDeps> = {}): SkillDistillService {
  return new SkillDistillService({ llm, writePackage: async draft => `fake-${draft.name}`, ...deps })
}

const TEXT_REQ: SkillDistillRequest = { inputType: 'text', text: '一篇方法论文章的内容。'.repeat(30), contentType: 'methodology' }

describe('SkillDistillService 流水线', () => {
  it('短文直通：判型跳过、笔记→组装各一次、组装只看笔记、落盘成功', async () => {
    const calls: Array<{ system: string; user: string }> = []
    const written: SkillPackageDraft[] = []
    // 出牌次序 = [笔记, 组装]
    const svc = makeService(
      scriptedLlm([NOTE_JSON, JSON.stringify(validDraftJson())], calls),
      { writePackage: async d => (written.push(d), `fake-${d.name}`) },
    )
    const t0 = svc.createTask({ ...TEXT_REQ, contentType: 'style' })
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    const snap = svc.getTask(t0.id)!
    expect(snap.status).toBe('done')
    expect(snap.stage).toBe('done')
    expect(snap.resultSkillId).toBe('fake-distilled-ok')
    expect(snap.stats).toMatchObject({ chunksTotal: 1, chunksDone: 1, llmCalls: 2, repairPasses: 0 })
    expect(snap.issues).toEqual([])
    // 两遍纪律：第一遍看原文，第二遍只含笔记、不含原文全文
    expect(calls[0].system).toContain('阅读笔记员')
    expect(calls[1].system).toContain('组装师')
    expect(calls[1].user).toContain('阅读笔记')
    expect(calls[1].user).not.toContain('一篇方法论文章的内容')
    expect(written[0].detectedType).toBe('methodology')
  })

  it('auto 判型：判型 JSON 两次坏掉降级 methodology，不拖死任务，判型计入 llmCalls', async () => {
    // 出牌次序 = [判型×2（坏）, 笔记, 组装]
    const svc = makeService(scriptedLlm(['这不是JSON', '随便文本', NOTE_JSON, JSON.stringify(validDraftJson())]))
    const t0 = svc.createTask({ ...TEXT_REQ, contentType: 'auto' })
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    const snap = svc.getTask(t0.id)!
    expect(snap.status).toBe('done')
    expect(snap.detectedType).toBe('methodology')
    expect(snap.stats.llmCalls).toBe(3)
  })

  it('长文按标题分块逐块笔记，组装收到全部笔记', async () => {
    const longText = Array.from({ length: 8 }, (_, i) => `# 第${i}章\n\n${'章节内容'.repeat(400)}\n`).join('\n')
    const calls: Array<{ user: string }> = []
    const svc = makeService(markerLlm({}, calls))
    const t0 = svc.createTask({ inputType: 'text', text: longText, contentType: 'methodology' })
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    const snap = svc.getTask(t0.id)!
    expect(snap.status).toBe('done')
    expect(snap.stats.chunksTotal).toBeGreaterThan(1)
    expect(snap.stats.chunksDone).toBe(snap.stats.chunksTotal)
    expect(snap.stats.llmCalls).toBe(snap.stats.chunksTotal + 1)
    // 每块都进了组装输入（notesJson）
    const assembleUser = calls[calls.length - 1].user
    for (let i = 0; i < snap.stats.chunksTotal; i++) expect(assembleUser).toContain(`"chunk": ${i}`)
  })

  it('审计不过触发修复环：一轮修复后 done，repairPasses=1', async () => {
    const broken = { ...validDraftJson('distilled-fix'), references: [{ filename: 'orphan.md', content: '没人链接我' }] }
    const svc = makeService(markerLlm({ assemble: JSON.stringify(broken), repairs: [JSON.stringify(validDraftJson('distilled-fix'))] }))
    const t0 = svc.createTask(TEXT_REQ)
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    const snap = svc.getTask(t0.id)!
    expect(snap.status).toBe('done')
    expect(snap.stats.repairPasses).toBe(1)
    expect(snap.stats.llmCalls).toBe(3)
    expect(snap.issues).toEqual([])
  })

  it('诚实失败：修复 2 轮仍不过 → failed + error 问题清单（不静默放行）', async () => {
    const broken = { ...validDraftJson('distilled-bad'), references: [{ filename: 'orphan.md', content: 'x' }] }
    const svc = makeService(markerLlm({ assemble: JSON.stringify(broken), repairs: [JSON.stringify(broken)] }))
    const t0 = svc.createTask(TEXT_REQ)
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    const snap = svc.getTask(t0.id)!
    expect(snap.status).toBe('failed')
    expect(snap.stats.repairPasses).toBe(2)
    expect(snap.issues.some(i => i.code === 'orphan-reference')).toBe(true)
    expect(snap.error).toContain('审计未通过')
  })

  it('组装输出非 JSON → 响亮失败（中文错误）', async () => {
    const svc = makeService(markerLlm({ assemble: '我不会输出JSON' }))
    const t0 = svc.createTask(TEXT_REQ)
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    const snap = svc.getTask(t0.id)!
    expect(snap.status).toBe('failed')
    expect(snap.error).toContain('无法解析为 JSON')
  })

  it('取消：LLM 调用间隙生效，终态 cancelled', async () => {
    let resolveFirst!: (v: string) => void
    const gate = new Promise<string>(r => (resolveFirst = r))
    const svc = makeService(async () => gate)
    const t0 = svc.createTask(TEXT_REQ)
    // 等到第一个 LLM 调用在飞 → 请求取消 → 放行
    await waitFor(() => svc.getTask(t0.id)!.stage === 'noting')
    svc.cancelTask(t0.id)
    resolveFirst(NOTE_JSON)
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    const snap = svc.getTask(t0.id)!
    expect(snap.status).toBe('cancelled')
    expect(snap.resultSkillId).toBeUndefined()
  })

  it('入参校验：空文本 / 非 http 链接 / 非法类型同步报错', () => {
    const svc = makeService(scriptedLlm([]))
    expect(() => svc.createTask({ inputType: 'text', text: '  ', contentType: 'style' })).toThrow(/源内容为空/)
    expect(() => svc.createTask({ inputType: 'url', url: 'ftp://x', contentType: 'auto' })).toThrow(/http/)
    expect(() => svc.createTask({ inputType: 'text', text: '内容', contentType: 'poem' as never })).toThrow(/蒸馏类型/)
  })

  it('URL 输入：fetchUrl 拉正文进笔记；抓取失败任务 failed', async () => {
    const seen: string[] = []
    const svc = makeService(scriptedLlm([NOTE_JSON, JSON.stringify(validDraftJson('distilled-url'))]), {
      fetchUrl: async () => {
        seen.push('fetched')
        return '网页抓到的正文内容。'.repeat(20)
      },
    })
    const t0 = svc.createTask({ inputType: 'url', url: 'https://example.com/a', contentType: 'methodology' })
    await waitFor(() => svc.getTask(t0.id)!.status !== 'running')
    expect(svc.getTask(t0.id)!.status).toBe('done')
    expect(seen).toEqual(['fetched'])

    const svc2 = makeService(scriptedLlm([]), {
      fetchUrl: async () => {
        throw new Error('超时')
      },
    })
    const t1 = svc2.createTask({ inputType: 'url', url: 'https://example.com/b', contentType: 'auto' })
    await waitFor(() => svc2.getTask(t1.id)!.status !== 'running')
    expect(svc2.getTask(t1.id)!.status).toBe('failed')
    expect(svc2.getTask(t1.id)!.error).toContain('网页抓取失败')
  })

  it('listTasks 按创建时间倒序；getTask 未知 id 返回 null', async () => {
    const svc = makeService(markerLlm({}))
    const a = svc.createTask(TEXT_REQ)
    await new Promise(r => setTimeout(r, 15)) // createdAt 是毫秒精度，拉开避免同毫秒排序抖动
    const b = svc.createTask({ ...TEXT_REQ, contentType: 'style' })
    await waitFor(() => svc.getTask(a.id)!.status !== 'running' && svc.getTask(b.id)!.status !== 'running')
    const list = svc.listTasks()
    expect(list[0].id).toBe(b.id)
    expect(svc.getTask('nope')).toBeNull()
  })
})

describe('defaultWritePackage 生产落盘', () => {
  beforeAll(() => {
    registerSkillService(new SkillService())
  })
  afterAll(() => {
    resetSkillService()
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('SKILL.md + references/ 落盘并被技能库识别；重名自动加后缀', async () => {
    const draft: SkillPackageDraft = {
      name: 'prod-distilled',
      title: '生产蒸馏',
      description: '当需要生产落盘验证时使用',
      whenToUse: '验证时',
      category: '知识提炼',
      body: '# 生产蒸馏\n\n## 诚实边界\n\n- 测试材料\n\n## 参考卡片\n\n- [卡](references/card.md)：需要时打开',
      references: [{ filename: 'card.md', content: '# 卡片内容' }],
      detectedType: 'methodology',
    }
    const id = await defaultWritePackage(draft)
    expect(id).toBe('prod-distilled')
    expect(existsSync(join(tmpRoot, 'skills', 'prod-distilled', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(tmpRoot, 'skills', 'prod-distilled', 'references', 'card.md'))).toBe(true)
    expect(readFileSync(join(tmpRoot, 'skills', 'prod-distilled', 'references', 'card.md'), 'utf-8')).toContain('卡片内容')

    // 重名 → -2 后缀，原技能不动
    const id2 = await defaultWritePackage(draft)
    expect(id2).toBe('prod-distilled-2')
    expect(existsSync(join(tmpRoot, 'skills', 'prod-distilled-2', 'SKILL.md'))).toBe(true)
  })
})
