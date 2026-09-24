/**
 * M0 评测 runner（详细设计 §9.1 门线）
 *
 * 用法（真机基线，需已导库+标注 expectedDocumentIds + 可用模型）：
 *   node scripts/vitest-electron.cjs run tests/unit/services/kb-brain/eval-runner.spec.ts  # 评分器单测
 *   npx tsx src/core/platform/services/kb-brain/eval/run-eval.ts --kb <kbId>              # 真机跑双模式并出报告
 *
 * 门线：综合型 recall@5 提升 ≥5pt 且事实型无回退（−0 容忍）→ 才允许 M1 批量消化。
 * 状态：骨架已就绪，基线待真机执行（L1 遗留登记 docs/plan/2026-09-18-kb-brain-review-findings.md）。
 */
import fs from 'fs'
import path from 'path'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import {
  evaluateCase,
  summarize,
  type EvalReport,
  type EvalSet,
} from './fixtures'

export type SearchFn = (args: {
  knowledgeBaseId: string
  query: string
  include: Array<'chunk' | 'atom' | 'note'>
  intent: 'lookup' | 'synthesize'
}) => Promise<{ success: boolean; data?: Array<{ documentId: string; content: string }> }>

/** 对单个评测集跑双模式并对比 */
export async function runEvalSet(set: EvalSet, searchFn: SearchFn): Promise<{ chunk: EvalReport; brain: EvalReport; delta: number }> {
  const chunkResults = []
  const brainResults = []
  for (const c of set.cases) {
    const chunkRes = await searchFn({ knowledgeBaseId: set.kbId ?? '', query: c.query, include: ['chunk'], intent: c.intent })
    const brainRes = await searchFn({
      knowledgeBaseId: set.kbId ?? '',
      query: c.query,
      include: ['chunk', 'atom', 'note'],
      intent: c.intent,
    })
    chunkResults.push(evaluateCase(chunkRes.data ?? [], c))
    brainResults.push(evaluateCase(brainRes.data ?? [], c))
  }
  const chunk = summarize(set.kbName, 'chunk', set.cases, chunkResults)
  const brain = summarize(set.kbName, 'brain', set.cases, brainResults)
  const delta = brain.recallAt5 - chunk.recallAt5
  return { chunk, brain, delta }
}

function loadSets(fixturesDir: string): EvalSet[] {
  const sets: EvalSet[] = []
  for (const f of fs.readdirSync(fixturesDir).filter((x) => x.endsWith('.json'))) {
    sets.push(JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf-8')) as EvalSet)
  }
  return sets
}

/** CLI 入口：npx tsx ... --kb <kbId> [--out docs/progress/] */
export async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const kbIdx = argv.indexOf('--kb')
  if (kbIdx === -1 || !argv[kbIdx + 1]) {
    console.error('用法: npx tsx run-eval.ts --kb <knowledgeBaseId> [--out <dir>]')
    process.exit(1)
  }
  const kbId = argv[kbIdx + 1]
  const outDirIdx = argv.indexOf('--out')
  const outDir = outDirIdx !== -1 ? argv[outDirIdx + 1] : 'docs/progress'
  const fixturesDir = path.join(__dirname, 'fixtures')
  const svc = new KnowledgeBaseService()
  const searchFn: SearchFn = async (args) =>
    svc.search({ knowledgeBaseId: args.knowledgeBaseId, query: args.query, topK: 5, include: args.include, intent: args.intent })
  const lines: string[] = [`# KB-Brain M0 基线报告（${new Date().toISOString()}）\n`]
  let allPass = true
  for (const set of loadSets(fixturesDir)) {
    set.kbId = kbId
    const { chunk, brain } = await runEvalSet(set, searchFn)
    const synthDelta = (brain.byIntent['synthesize']?.recallAt5 ?? 0) - (chunk.byIntent['synthesize']?.recallAt5 ?? 0)
    const lookupDelta = (brain.byIntent['lookup']?.recallAt5 ?? 0) - (chunk.byIntent['lookup']?.recallAt5 ?? 0)
    const pass = synthDelta >= 0.05 && lookupDelta >= 0
    if (!pass) allPass = false
    lines.push(
      `## ${set.kbName}：综合型 Δrecall@5=${(synthDelta * 100).toFixed(1)}pt，事实型 Δ=${(lookupDelta * 100).toFixed(1)}pt → ${pass ? 'PASS' : 'FAIL'}（门线：综合≥+5pt 且 事实≥0）`,
      `- chunk 模式：recall@5=${(chunk.recallAt5 * 100).toFixed(1)}% MRR=${chunk.mrr.toFixed(3)}`,
      `- brain 模式：recall@5=${(brain.recallAt5 * 100).toFixed(1)}% MRR=${brain.mrr.toFixed(3)}`,
      '',
    )
  }
  lines.push(`## 结论：${allPass ? 'PASS——允许进入 M1 批量消化' : 'FAIL——不得进入 M1 批量（先修 prompt/检索）'}`)
  const report = lines.join('\n')
  console.log(report)
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `2026-09-kb-brain-m0-baseline.md`)
  fs.writeFileSync(outFile, report)
  console.log(`报告已写入 ${outFile}`)
}

// 仅 CLI 直跑执行（被 import 时不执行）
if (process.argv[1] && process.argv[1].includes('run-eval')) {
  void main()
}
