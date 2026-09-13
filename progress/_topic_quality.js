// 「主题深度研究」输出质量评估：结构指标 + 运行指标 + 参照对比
// 用法：node progress/_topic_quality.js
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const REPORT = 'C:/Users/daoge/code/project/the-bot/progress/_topic_run_report.md'
const REFERENCE = 'C:/Users/daoge/Downloads/TikTok跨境电商从零开店实操指南.md'
const RUN_ID_FILE = 'C:/Users/daoge/code/project/the-bot/progress/_topic_run_id.txt'

function metrics(md, label) {
  const lines = md.split(/\r?\n/)
  const headings = lines.filter(l => /^#{1,4}\s/.test(l))
  const h2 = lines.filter(l => /^##\s/.test(l))
  const tableRows = lines.filter(l => l.trim().startsWith('|')).length
  const tableBlocks = (md.match(/\n\|[^\n]*\|\r?\n\|[\s:|-]+\|/g) ?? []).length
  const checkboxes = lines.filter(l => /^\s*[-*]\s*\[[ x]\]/.test(l)).length
  const bullets = lines.filter(l => /^\s*[-*]\s/.test(l) && !/^\s*[-*]\s*\[[ x]\]/.test(l)).length
  const urls = [...new Set(md.match(/https?:\/\/[^\s)\]|，。；、]+/g) ?? [])]
  const domains = {}
  for (const u of urls) {
    const host = u.replace(/^https?:\/\//, '').split('/')[0]
    domains[host] = (domains[host] ?? 0) + 1
  }
  const count = (re) => (md.match(re) ?? []).length
  return {
    label,
    chars: md.length,
    lines: lines.length,
    headings: headings.length,
    h2: h2.length,
    tableBlocks,
    tableRows,
    checkboxes,
    bullets,
    urls: urls.length,
    topDomains: Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 8),
    tier: {
      official: count(/官方一手/g),
      backendCheck: count(/平台后台需复核|需后台(确认|复核)/g),
      secondhand: count(/二手估算|二手线索|二手\s*\|/g),
      notFound: count(/未查到/g),
      prior: count(/先验-待验证|先验待验证/g),
    },
    patterns: {
      decisionTree: count(/决策树/g),
      threshold: count(/门槛/g),
      stopLoss: count(/止损|何时停/g),
      formula: count(/公式|＝|=.*×.*−/g),
      matrix: count(/矩阵/g),
      sop: count(/SOP|分步|步骤/g),
      timeline: count(/时间线|甘特|D\+?\d+|第\s?\d+\s?天/g),
      checklist: count(/检查清单|清单/g),
      uncertainty: count(/不确定|未决/g),
      action: count(/下一步行动|下一步/g),
      conflict: count(/冲突|矛盾|两说/g),
      counterpoint: count(/反方|反驳|另一种观点/g),
    },
  }
}

function line(title, obj) {
  console.log(`\n===== ${title} =====`)
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'label' || k === 'topDomains') continue
    if (typeof v === 'object') { console.log(`  ${k}: ${JSON.stringify(v)}`); continue }
    console.log(`  ${k}: ${v}`)
  }
  if (obj.topDomains) console.log('  topDomains:', obj.topDomains.map(([d, n]) => `${d}×${n}`).join(', '))
}

async function main() {
  // 1) 报告结构指标
  if (!fs.existsSync(REPORT)) { console.error('报告不存在：', REPORT); process.exit(1) }
  const md = fs.readFileSync(REPORT, 'utf-8')
  const report = metrics(md, '本次 run（运行级总预算）')
  line('报告结构指标（本次）', report)

  // 2) 参照对比（元宝样本，若存在）
  if (fs.existsSync(REFERENCE)) {
    const ref = metrics(fs.readFileSync(REFERENCE, 'utf-8'), '元宝参照样本')
    line('参照样本结构指标（元宝）', ref)
    console.log('\n===== 对比（本次 / 元宝）=====')
    for (const k of ['chars', 'headings', 'h2', 'tableBlocks', 'tableRows', 'checkboxes', 'urls']) {
      console.log(`  ${k}: ${report[k]} / ${ref[k]}`)
    }
    for (const k of Object.keys(report.tier)) console.log(`  tier.${k}: ${report.tier[k]} / ${ref.tier[k]}`)
    for (const k of Object.keys(report.patterns)) console.log(`  pat.${k}: ${report.patterns[k]} / ${ref.patterns[k]}`)
  } else {
    console.log('\n（未找到元宝参照样本，跳过对比）')
  }

  // 3) 运行指标（轮次/每轮 verdict/工具调用/预算消耗）
  const runId = fs.readFileSync(RUN_ID_FILE, 'utf-8').trim()
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const res = await p.evaluate((id) => window.electronAPI.workflow.getRun(id).then(x => x), runId)
  const d = res?.data
  const round = (d?.nodeRuns ?? []).find(n => n.nodeId === 'round1')
  const r1 = (d?.nodeRuns ?? []).filter(n => n.nodeId === 'r1').sort((a, c) => a.iterationIndex - c.iterationIndex)
  const e1 = (d?.nodeRuns ?? []).filter(n => n.nodeId === 'e1').sort((a, c) => a.iterationIndex - c.iterationIndex)
  console.log('\n===== 运行指标 =====')
  console.log('  runId:', runId, '| status:', d?.run?.status, '| iterations:', round?.output?.iterations)
  let toolTotal = 0, promptTotal = 0, completionTotal = 0
  for (const row of r1) {
    const u = row.output?.usage ?? {}
    toolTotal += u.toolCalls ?? 0
    promptTotal += u.promptTokens ?? 0
    completionTotal += u.completionTokens ?? 0
  }
  console.log(`  工具调用合计: ${toolTotal}（运行级预算 120）| prompt tokens: ${promptTotal} | completion tokens: ${completionTotal}`)
  console.log('  每轮：iter | verdict | 差距数 | 工具调用 | 迭代轮数')
  for (let i = 0; i < Math.max(e1.length, r1.length); i++) {
    const ev = e1[i]?.output?.parsed
    const gaps = Array.isArray(ev?.gaps) ? ev.gaps.length : 0
    console.log(`    ${i} | ${ev?.verdict ?? '-'} | ${gaps} | ${r1[i]?.output?.usage?.toolCalls ?? '-'} | ${r1[i]?.output?.iterations ?? '-'}`)
  }
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
