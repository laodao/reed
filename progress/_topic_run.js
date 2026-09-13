// 「主题深度研究」真机驱动：通过 CDP 驱动已打开的 App，跑「在 TikTok 上开店怎么做」
// 用法：先 npm run dev:debug（9222 端口），再 node progress/_topic_run.js
const { chromium } = require('playwright-core')
const fs = require('fs')

const TOPIC = '在 TikTok 上开店怎么做'
const DEF_ID = 'builtin_def_topic-research'
const OUT_MD = 'C:/Users/daoge/code/project/the-bot/progress/_topic_run_report.md'
const RUN_ID_FILE = 'C:/Users/daoge/code/project/the-bot/progress/_topic_run_id.txt'
const MAX_WAIT_MS = 45 * 60 * 1000
const POLL_MS = 15000

const CLARIFY_ANSWER = {
  goal: '决定是否要在 TikTok 开店，并为开店准备可执行的落地材料（要具体到主体/市场/步骤/费用/合规）',
  entityType: 'cn-individual',
  licenseStatus: 'none-plan',
  targetMarkets: ['MY', 'TH', 'PH', 'US'],
  category: '家居收纳 / 宠物用品（轻小件）',
  contentAbility: 'video-only',
  lossTolerance: '3w-5w',
  context: '中国大陆个人/初创团队；启动预算 5 万元以内；无自有货源（考虑一件代发）；无跨境电商经验；优先东南亚、美国作为第二阶段',
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  console.log('[topic-run] 已连接 App')

  // 1) 定义与 start 输入
  const def = await page.evaluate((id) => window.electronAPI.workflow.getDefinition(id).then(x => (x.success ? x.data : null)), DEF_ID)
  if (!def) throw new Error('找不到定义 ' + DEF_ID)
  const start = (def.publishedGraph?.nodes ?? []).find(n => n.id === 'start')
  const inputs = start?.config?.inputs ?? []
  console.log('[topic-run] 定义:', def.name, '| start 输入:', inputs.map(i => `${i.key}:${i.type}`).join(', '))

  // 2) 选模型（研究/评估尽量不同模型）
  const pcRes = await page.evaluate(() => window.electronAPI.providerConfig.list().then(x => x))
  const providers = (pcRes?.data ?? []).filter(p => p.isEnabled !== false && (p.models ?? []).length > 0)
  if (!providers.length) throw new Error('没有可用的 Provider 配置（请先在设置里配置模型）')
  const pickText = (models) => models.find(m => /text|chat|multimodal/i.test(String(m.type ?? ''))) ?? models[0]
  const pDefault = providers.find(p => p.isDefault) ?? providers[0]
  const researchModel = { providerConfigId: pDefault.id, modelId: pickText(pDefault.models).id }
  // 评估模型：优先换一个不同模型（同 provider 内其他模型，或第二个 provider）
  let evalModel = null
  const otherInSame = pDefault.models.find(m => m.id !== researchModel.modelId)
  if (otherInSame) evalModel = { providerConfigId: pDefault.id, modelId: otherInSame.id }
  else if (providers[1]) evalModel = { providerConfigId: providers[1].id, modelId: pickText(providers[1].models).id }
  else evalModel = { ...researchModel }
  console.log('[topic-run] 研究模型:', researchModel, '| 评估模型:', evalModel)

  // 3) 启动运行
  const runInputs = {
    topic: TOPIC,
    focus: [],
    depth: 'standard',
    maxRounds: 8,
    kbs: [],
    researcherModel: researchModel,
    evaluatorModel: evalModel,
    // L3/L4：产出规格/要求/参照样本（可选；支持环境变量注入便于验证）
    outputSpecs: process.env.TOPIC_SPECS ? process.env.TOPIC_SPECS.split(',').filter(Boolean) : [],
    outputRequirements: process.env.TOPIC_REQS || '',
    referenceSample: process.env.TOPIC_REF || '',
  }
  const started = await page.evaluate(({ defId, ins }) => window.electronAPI.workflow.startRun({ definitionId: defId, inputs: ins }), { defId: DEF_ID, ins: runInputs })
  const runId = started?.data?.id
  console.log('[topic-run] startRun:', JSON.stringify({ success: started?.success, runId, status: started?.data?.status, error: started?.data?.error }))
  if (!runId) throw new Error('启动失败：' + JSON.stringify(started))
  fs.writeFileSync(RUN_ID_FILE, runId, 'utf-8')

  // 4) 轮询：自动提交澄清表单 / 终稿确认；打印轮次进度
  const t0 = Date.now()
  let lastLog = ''
  let approvedClarify = false
  let approvedFinal = false
  while (Date.now() - t0 < MAX_WAIT_MS) {
    const res = await page.evaluate((id) => window.electronAPI.workflow.getRun(id).then(x => x), runId)
    const detail = res?.data
    const run = detail?.run
    const nodeRuns = detail?.nodeRuns ?? []
    const status = run?.status
    const round = nodeRuns.find(n => n.nodeId === 'round1')
    const roundOut = round?.output
    const line = `[topic-run] status=${status} 轮次=${roundOut?.iterations ?? '-'} 研究=${nodeRuns.find(n => n.nodeId === 'r1')?.status ?? '-'} 评估=${nodeRuns.find(n => n.nodeId === 'e1')?.status ?? '-'}`
    if (line !== lastLog) { console.log(line); lastLog = line }

    if (status === 'waiting_review') {
      const waiting = nodeRuns.filter(n => n.status === 'waiting_review')
      for (const w of waiting) {
        if (w.nodeId === 'clarify' && !approvedClarify) {
          const r = await page.evaluate((p) => window.electronAPI.workflow.reviewDecide(p), {
            runId, nodeId: 'clarify', decision: 'approve', editedValues: CLARIFY_ANSWER,
            comment: '自动填写研究契约（真机脚本）',
          })
          approvedClarify = true
          console.log('[topic-run] 已提交澄清表单:', JSON.stringify(r?.success ?? r))
        } else if (w.nodeId === 'final1' && !approvedFinal) {
          const r = await page.evaluate((p) => window.electronAPI.workflow.reviewDecide(p), {
            runId, nodeId: 'final1', decision: 'approve', comment: '自动确认终稿（真机脚本）',
          })
          approvedFinal = true
          console.log('[topic-run] 已确认终稿:', JSON.stringify(r?.success ?? r))
        }
      }
    }
    if (status && ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(status)) {
      console.log('[topic-run] 终态:', status, run?.error ? ('错误: ' + run.error) : '')
      break
    }
    await sleep(POLL_MS)
  }

  // 5) 取终稿（资产库里 name = 主题+深度研究）
  const assets = await page.evaluate(() => window.electronAPI.assets.list({ category: 'text', page: 1, pageSize: 50 }).then(x => x))
  const item = (assets?.data?.items ?? []).find(a => String(a.name ?? '').includes('深度研究') && String(a.name ?? '').includes('TikTok'))
  if (item) {
    const full = await page.evaluate((id) => window.electronAPI.assets.get(id).then(x => x), item.id)
    const content = full?.data?.textContent ?? full?.data?.content ?? ''
    fs.writeFileSync(OUT_MD, String(content || JSON.stringify(full?.data ?? {})), 'utf-8')
    console.log('[topic-run] 终稿已导出:', OUT_MD, '长度:', String(content).length, '字')
  } else {
    console.log('[topic-run] 未在资产库找到终稿（可能未确认或失败）')
  }
  console.log('[topic-run] runId:', runId)
  await browser.close()
}
main().catch(e => { console.error('[topic-run] 失败:', e); process.exit(1) })
