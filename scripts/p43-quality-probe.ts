/**
 * 43 号真模型质量探针（qwen-flash 便宜档；43 号文档 §四 的实测依据）
 * @module scripts/p43-quality-probe
 *
 * 场景：
 *   A  真 LoopRunner 端到端——43 号改动后真链路完好（工具循环→收敛，答案含关键事实）
 *   B  压缩摘要质量 A/B——codex 交接式新 prompt（43 号 O5）vs 旧 vendor prompt：
 *      同一段植入 5 项事实的长历史，各自 forceCompact，逐项核对摘要是否 verbatim 保留
 *   C  压缩后端到端可用性——用 A/B 中较好（应为新 prompt）的压缩史 + 追问，
 *      验证关键事实仍可答（O5 的最终用户价值）
 *
 * 运行：P4_API_KEY=<key> npx tsx scripts/p43-quality-probe.ts
 */

import { generateText } from 'ai'
import { readFileSync } from 'node:fs'
import type { ModelMessage } from 'ai'
import { ProviderAdapter } from '@core/platform/agent-runtime/provider/provider-adapter'
import { LoopRunner } from '@core/platform/agent-runtime/runtime/loop'
import { ContextManager } from '@core/platform/agent-runtime/context/context-manager'
import { DEFAULT_SUMMARY_PROMPT } from '@core/platform/agent-runtime/runtime/vendor/compaction'
import { estimateContextTokens } from '@core/platform/services/longwriting/chapter-context'
import type { AgentHost, AgentLoopState, AgentStreamEvent, AgentTask, TrajectoryEntry } from '@core/platform/agent-runtime/types'
import { z } from 'zod'

function readKey(): string {
  if (process.env.P4_API_KEY) return process.env.P4_API_KEY
  const env = readEnvFile('/home/ubuntu/workdir/ppt-master/.env')
  const key = env.QWEN_API_KEY
  if (!key) throw new Error('缺少 P4_API_KEY / QWEN_API_KEY')
  return key
}

function readEnvFile(path: string): Record<string, string> {
  try {
    const out: Record<string, string> = {}
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)\s*$/)
      if (m) out[m[1]] = m[2]
    }
    return out
  } catch {
    return {}
  }
}

const KEY = readKey()
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const MODEL = process.env.P4_MODEL ?? 'qwen-flash'

const adapter = new ProviderAdapter({
  getProviderConfig: async () => ({
    config: { id: 'p43-dashscope', baseUrl: BASE_URL, defaultModel: MODEL, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
    template: { id: 'dashscope', apiConfig: { baseUrl: BASE_URL }, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
    apiKey: KEY,
  }) as never,
  cacheCapacity: 1,
})

/** 旧 vendor 摘要 prompt（43 号 O5 改造前的原文——A/B 对照组） */
const OLD_SUMMARY_PROMPT = `Summarize this conversation for the next agent turn:
1. Goal: What the user is trying to accomplish
2. Instructions: Key directives and constraints mentioned
3. Discoveries: Important findings during the conversation
4. Accomplished: What's been completed, files changed, actions taken
5. Current State: Where things stand, pending work
6. Relevant Context: File paths, code snippets, specific details needed to continue`

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ==================== 场景 A：真 LoopRunner 端到端 ====================

async function scenarioA(): Promise<void> {
  console.log('\n========== 场景 A：真 LoopRunner 端到端（工具循环→收敛） ==========')
  const model = await adapter.resolveModel()

  const projectTool: AgentToolDef = {
    name: 'get_project',
    description: '查询夜莺三号项目的立项信息（代号/预算/仓库/负责人）',
    inputSchema: z.object({}),
    dangerLevel: 'read',
    execute: async () => ({ 代号: 'NIGHTINGALE-3', 预算元: 456200, 仓库: '/srv/nightingale3', 负责人: '赵明远' }),
  }
  const milestoneTool: AgentToolDef = {
    name: 'get_milestones',
    description: '查询夜莺三号项目的里程碑（含评审日期）',
    inputSchema: z.object({}),
    dangerLevel: 'read',
    execute: async () => [{ id: 'M1', name: '原型评审' }, { id: 'M2', name: '终审', due: '2026-11-05' }],
  }

  let stepCount = 0
  const host: AgentHost = {
    signal: new AbortController().signal,
    async loadState() {
      return null
    },
    async saveState(_s: AgentLoopState) {
      stepCount++
    },
    suspend: () => Promise.reject(new Error('不支持挂起')),
    emitTrajectory: (_e: TrajectoryEntry) => undefined,
    emitStream: (_e: AgentStreamEvent) => undefined,
  }
  const task: AgentTask = {
    definitionId: 'p43-probe',
    scopeId: 'p43-a',
    input: '分别调用两个工具了解夜莺三号项目，然后用不超过 60 字汇报：项目代号、预算、终审评审日期。',
    systemPrompt: '你是项目助理，回答前必须用工具核实，禁止编造。',
    tools: { get_project: projectTool, get_milestones: milestoneTool },
    maxSteps: 6,
  }
  const t0 = Date.now()
  const r = await new LoopRunner({ resolveModel: async () => model }).run(task, host)
  const answer = r.output
  // 接受格式归一化（模型常把 456200 说成 45.62万、2026-11-05 说成 2026年11月5日）
  const factChecks: Array<[string, RegExp]> = [
    ['项目代号', /NIGHTINGALE-3/],
    ['预算', /456200|45\.62万/],
    ['终审日期', /2026-11-05|2026年11月5日/],
  ]
  const hits = factChecks.filter(([, re]) => re.test(answer)).map(([n]) => n)
  console.log(
    `stopReason=${r.stopReason} steps=${r.iterations} savePoints=${stepCount} usage=${r.usage.promptTokens}in/${r.usage.completionTokens}out ${Date.now() - t0}ms`,
  )
  console.log(`答案：${answer.slice(0, 200)}`)
  console.log(`事实命中：${hits.length}/3 ${hits.join(' / ')}${r.usage.cachedInputTokens ? `（cached=${r.usage.cachedInputTokens}）` : ''}`)
  console.log(hits.length >= 2 ? '场景 A：PASS' : '场景 A：FAIL（关键事实缺失）')
}

// ==================== 场景 B：压缩摘要质量 A/B ====================

/** 植入事实（早期消息，压缩后只能靠摘要存活） */
const FACTS = ['NIGHTINGALE-3', '456200', '/srv/nightingale3', '赵明远', '2026-11-05']
const FACT_NAMES = ['项目代号', '预算(元)', '仓库路径', '负责人', '终审日期']

function filler(seed: number, chars: number): string {
  const base =
    '迭代评审组对当前分支的稳定性做了回归，接口耗时与内存曲线平稳，异常率维持在阈值以下；' +
    '后续两周的计划是补齐边缘用例、完善灰度开关并整理运维手册；风控侧反馈的三个问题已在本迭代内闭环。'
  let out = ''
  let i = seed
  while (out.length < chars) {
    out += `${base}（批注${i}）`
    i++
  }
  return out.slice(0, chars)
}

function buildLongHistory(): ModelMessage[] {
  const msgs: ModelMessage[] = []
  // 第 1 章：立项纪要（植入全部 5 项事实——压缩后只能靠摘要存活）
  msgs.push({
    role: 'user',
    content:
      '【项目立项纪要】夜莺三号数据平台正式立项。项目代号 NIGHTINGALE-3，总预算 456200 元，代码仓库 /srv/nightingale3，项目负责人 赵明远，终审评审日期 2026-11-05。请按此基线推进，后续所有纪要以此为准。\n' +
      filler(100, 300),
  })
  msgs.push({ role: 'assistant', content: `已登记立项基线：代号 NIGHTINGALE-3、预算 456200 元、仓库 /srv/nightingale3、负责人赵明远、终审 2026-11-05。${filler(101, 400)}` })
  // 第 2-14 章：常规迭代讨论（穿插真实形状的工具调用/结果，供剪枝 Bite）
  for (let ch = 2; ch <= 14; ch++) {
    msgs.push({ role: 'user', content: `第 ${ch} 周迭代要点：${filler(ch * 10, 500)}` })
    msgs.push({ role: 'assistant', content: [
      { type: 'tool-call', toolCallId: `c${ch}`, toolName: 'query_board', input: { week: ch } },
    ] } as never)
    msgs.push({ role: 'tool', content: [
      { type: 'tool-result', toolCallId: `c${ch}`, toolName: 'query_board', output: { type: 'text', value: `看板周报：${filler(ch * 20, 900)}` } },
    ] } as never)
    msgs.push({ role: 'assistant', content: `汇总：本周进度符合预期。${filler(ch * 30, 700)}` })
  }
  // 当轮问题（近端，受保护）
  msgs.push({ role: 'user', content: '上面信息很多，帮我准备项目基线速查卡。' })
  return msgs
}

function makeSummarizer(systemPrompt: string): (conversationText: string, signal?: AbortSignal) => Promise<string> {
  return async (conversationText, signal) => {
    const model = await adapter.resolveModel()
    const r = await generateText({
      model: model as never,
      system: systemPrompt,
      messages: [{ role: 'user', content: conversationText }],
      abortSignal: signal,
      maxOutputTokens: 2048,
    })
    return r.text
  }
}

function scoreSummary(tag: string, summary: string, tokensBefore: number, tokensAfter: number): number {
  let hits = 0
  const variants: RegExp[] = [/456200|45\.62万/, /\/srv\/nightingale3/, /NIGHTINGALE-3/, /赵明远/, /2026-11-05|2026年11月5/]
  for (let i = 0; i < FACTS.length; i++) {
    const verbatim = summary.includes(FACTS[i])
    const semantic = variants[i]?.test(summary) ?? false
    if (semantic) hits++
    console.log(`  ${semantic ? (verbatim ? '✓原样' : '✓语义') : '✗'} ${FACT_NAMES[i]}（${FACTS[i]}）`)
  }
  console.log(`${tag}：${hits}/${FACTS.length} 项事实 verbatim 保留；${tokensBefore}→${tokensAfter} tok；摘要 ${summary.length} 字`)
  return hits
}

async function scenarioB(): Promise<{ bestHistory: ModelMessage[] | null }> {
  console.log('\n========== 场景 B：压缩摘要质量 A/B（同一段历史，新旧 prompt 各压一次） ==========')
  const history = buildLongHistory()
  const before = estimateContextTokens(JSON.stringify(history))
  console.log(`历史规模：${history.length} 条消息 ≈ ${before} tok（窗口 16000，软限 14400）`)

  const run = async (tag: string, systemPrompt: string): Promise<{ hits: number; msgs: ModelMessage[] | null }> => {
    const cm = new ContextManager({ contextWindowTokens: 16_000, summarize: makeSummarizer(systemPrompt) })
    const t0 = Date.now()
    const out = await cm.forceCompact({ messages: history })
    if (!out) {
      console.log(`${tag}：forceCompact 返回 null（零收益）`)
      return { hits: 0, msgs: null }
    }
    const summaryMsg = out.find((m) => String(m.content).includes('[Previous conversation summary]'))
    const summary = String(summaryMsg?.content ?? '')
    console.log(`\n— ${tag}（${Date.now() - t0}ms）—`)
    const hits = scoreSummary(tag, summary, before, estimateContextTokens(JSON.stringify(out)))
    return { hits, msgs: out }
  }

  const newR = await run('B-新 prompt（43 号 O5·codex 交接式）', DEFAULT_SUMMARY_PROMPT)
  await sleep(2000)
  const oldR = await run('B-旧 prompt（改前 vendor 原文）', OLD_SUMMARY_PROMPT)
  console.log(`\nA/B 结论：新 ${newR.hits}/${FACTS.length} vs 旧 ${oldR.hits}/${FACTS.length}`)
  const best = newR.hits >= oldR.hits ? newR.msgs : oldR.msgs
  return { bestHistory: best }
}

// ==================== 场景 C：压缩后端到端可用性 ====================

async function scenarioC(compacted: ModelMessage[] | null): Promise<void> {
  console.log('\n========== 场景 C：压缩后追问（关键事实仍可答） ==========')
  if (!compacted) {
    console.log('场景 C：SKIP（压缩未产出）')
    return
  }
  const model = await adapter.resolveModel()
  const r = await generateText({
    model: model as never,
    system: '你是项目助理。只依据上下文回答，不确定就说不确定。',
    messages: [
      ...compacted,
      { role: 'user', content: '项目基线速查卡：代号、预算、仓库路径、负责人、终审日期各是多少？一行一项。' },
    ] as never,
    maxOutputTokens: 500,
  })
  const answer = r.text
  console.log(`答案：\n${answer.slice(0, 400)}`)
  const hits = FACTS.filter((f) => answer.includes(f))
  console.log(`事实命中：${hits.length}/5 → ${hits.join(' / ')}`)
  console.log(hits.length >= 3 ? '场景 C：PASS' : '场景 C：FAIL')
}

// ==================== main ====================

async function main(): Promise<void> {
  console.log(`模型=${MODEL} baseUrl=${BASE_URL}`)
  await scenarioA()
  const { bestHistory } = await scenarioB()
  await scenarioC(bestHistory)
  console.log('\n（43 号质量探针结束）')
}

void main().then(
  () => process.exit(0),
  (e) => {
    console.error('探针失败:', e)
    process.exit(1)
  },
)
