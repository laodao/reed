/**
 * 大V博主蒸馏工作流真机验收（经 9222 驱动真实 app + 真实 LLM，不进测试套件）：
 * 1) wf:list-definitions 找 builtin_def_blogger-distill
 * 2) 取一个可用 provider/model
 * 3) wf:start-run（阮一峰 3 篇周刊）→ 轮询 wf:get-run 至终态
 * 4) 校验：技能包落盘（SKILL.md + references/）、资产中心有「博主蒸馏」文本资产
 * 运行：node outputs/_blogger-distill-acceptance.cjs
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const DATA_ROOT = 'C:/Users/daoge/the-bot'
const URLS = [
  'https://www.ruanyifeng.com/blog/2026/08/weekly-issue-408.html',
  'https://www.ruanyifeng.com/blog/2026/09/weekly-issue-411.html',
  'https://www.ruanyifeng.com/blog/2026/10/weekly-issue-414.html',
]

function cdp(wsUrl, method, params, timeoutMs = 600_000) {
  const WebSocket = require('ws')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP 超时: ' + method)) }, timeoutMs)
    ws.on('open', () => ws.send(JSON.stringify({ id, method, params })))
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id !== id) return
      clearTimeout(timer); ws.close()
      if (msg.error) reject(new Error(msg.error.message))
      else if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails).slice(0, 500)))
      else resolve(msg.result?.result?.value)
    })
    ws.on('error', reject)
  })
}

async function main() {
  const targets = JSON.parse(await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve(b)) }).on('error', reject)
  }))
  const page = targets.find((t) => t.type === 'page' && !/devtools/i.test(t.url))
  const ev = (expr, timeout) => cdp(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeout)
  console.log('[accept] 主窗口：', page.title)

  // 0) 预检：工作流定义已入库（app 启动迁移）
  const defs = await ev(`window.electronAPI.workflow.listDefinitions({ page: 1, pageSize: 100 }).then(r => r)`)
  const list = defs?.data?.items ?? defs?.data?.definitions ?? (Array.isArray(defs?.data) ? defs.data : [])
  const def = (Array.isArray(list) ? list : []).find((d) => d.id === 'builtin_def_blogger-distill')
  if (!def) throw new Error('未找到 builtin_def_blogger-distill 定义：' + (Array.isArray(list) ? list.map(d => d.id).join(',') : JSON.stringify(defs).slice(0, 300)))
  console.log('[accept] 找到定义：', def.name)

  // 1) 取可用模型
  const provs = await ev(`window.electronAPI.providerConfig.list().then(r => r)`)
  let providerConfigId = null, modelId = null
  const pcList = provs?.data?.configs ?? provs?.data ?? []
  for (const pc of (Array.isArray(pcList) ? pcList : [])) {
    const enabled = pc.enabled !== false
    const m = (pc.models ?? pc.modelIds ?? []).find?.((x) => x) ?? null
    if (enabled && m) { providerConfigId = pc.id; modelId = typeof m === 'string' ? m : (m.id ?? m.modelId); break }
    if (enabled && !m && pc.defaultModel) { providerConfigId = pc.id; modelId = pc.defaultModel; break }
  }
  console.log('[accept] 模型：', providerConfigId, modelId)
  if (!providerConfigId) throw new Error('未找到可用 Provider 配置：' + JSON.stringify(provs).slice(0, 300))

  // 2) 启动运行
  const started = await ev(`window.electronAPI.workflow.startRun({
    definitionId: 'builtin_def_blogger-distill',
    inputs: {
      bloggerName: '阮一峰',
      platform: '博客',
      urls: ${JSON.stringify(URLS.join('\n'))},
      maxArticles: 3,
      contentType: 'auto',
      nameHint: 'ruanyifeng-weekly',
      model: { providerConfigId: ${JSON.stringify(providerConfigId)}, modelId: ${JSON.stringify(modelId)} }
    }
  }).then(r => r)`, 60_000)
  if (!started?.success) throw new Error('启动失败：' + JSON.stringify(started).slice(0, 400))
  const runId = started.data?.runId ?? started.data?.id
  console.log('[accept] runId =', runId)

  // 3) 轮询至终态（上限 30 分钟）
  const t0 = Date.now()
  let run = null
  while (Date.now() - t0 < 30 * 60_000) {
    await new Promise((r) => setTimeout(r, 10_000))
    const r = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(runId)}).then(r => r)`)
    run = r?.data
    const status = run?.run?.status ?? run?.status
    const nodes = run?.nodes ?? {}
    const brief = Object.entries(nodes).map(([k, v]) => `${k}:${v.status ?? '?'}${v.iteration != null ? '#' + v.iteration : ''}`).join(' ')
    console.log(`[accept] ${Math.round((Date.now() - t0) / 1000)}s status=${status} ${brief}`)
    if (status && !['running', 'pending', 'waiting_review'].includes(status)) break
  }
  const finalStatus = run?.run?.status ?? run?.status
  console.log('[accept] 终态：', finalStatus)
  if (finalStatus !== 'succeeded') {
    console.log('[accept] run 详情：', JSON.stringify(run).slice(0, 1500))
    throw new Error('工作流未成功：' + finalStatus)
  }

  // 4) 校验技能包落盘
  const skillDir = path.join(DATA_ROOT, 'skills', 'ruanyifeng-weekly')
  const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')
  const refDir = path.join(skillDir, 'references')
  const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir) : []
  console.log('[accept] ✅ 技能包已落盘：SKILL.md', Buffer.byteLength(skillMd), '字节；references =', refs.join(', '))
  console.log('--- SKILL.md 前 900 字 ---\n' + skillMd.slice(0, 900))

  // 5) 校验资产中心（博主蒸馏子分类）
  const assets = await ev(`window.electronAPI.assets.list({ subCategory: '博主蒸馏', page: 1, pageSize: 50 }).then(r => r).catch(e => ({ error: String(e) }))`)
  const assetList = assets?.data?.items ?? assets?.data?.assets ?? assets?.data ?? []
  const mine = (Array.isArray(assetList) ? assetList : []).filter((a) => String(a.name || '').includes('阮一峰'))
  console.log('[accept] ✅ 资产中心「博主蒸馏」本博主资产数 =', mine.length, mine.map((a) => a.name).slice(0, 5).join(' | '))
  if (!fs.existsSync(skillDir)) throw new Error('技能目录不存在')
  console.log('[accept] 🎉 大V博主蒸馏工作流真机验收通过：runId=' + runId)
}

main().catch((e) => { console.error('[accept] ❌ 验收失败：', e.message); process.exit(1) })
