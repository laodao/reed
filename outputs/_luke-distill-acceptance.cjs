/**
 * 大V博主蒸馏工作流真机验收·卢克文（头条）：
 * 浏览器渲染兜底版全流程——8 篇头条文章 → 渲染抓正文 → 入库 → 判类 → 蒸馏出「卢克文」技能。
 * 头条对纯 HTTP 返回反爬挑战页，extract1 配 render=auto 由新兜底自动接管。
 * 运行：node outputs/_luke-distill-acceptance.cjs
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const DATA_ROOT = 'C:/Users/daoge/the-bot'
const URLS = [
  'https://www.toutiao.com/article/7690522736719938099/',
  'https://www.toutiao.com/article/7687905199133966874/',
  'https://www.toutiao.com/article/7686039605452128803/',
  'https://www.toutiao.com/article/7685682579177062948/',
  'https://www.toutiao.com/article/7685237147921547782/',
  'https://www.toutiao.com/article/7683782997610463798/',
  'https://www.toutiao.com/article/7681672283861942784/',
  'https://www.toutiao.com/article/7681128461661929990/',
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

  const defs = await ev(`window.electronAPI.workflow.listDefinitions({ page: 1, pageSize: 100 }).then(r => r)`)
  const list = defs?.data?.items ?? defs?.data?.definitions ?? (Array.isArray(defs?.data) ? defs.data : [])
  const def = (Array.isArray(list) ? list : []).find((d) => d.id === 'builtin_def_blogger-distill')
  if (!def) throw new Error('未找到 builtin_def_blogger-distill 定义')
  console.log('[accept] 找到定义：', def.name)

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
  if (!providerConfigId) throw new Error('未找到可用 Provider 配置')

  const started = await ev(`window.electronAPI.workflow.startRun({
    definitionId: 'builtin_def_blogger-distill',
    inputs: {
      bloggerName: '卢克文',
      platform: '今日头条',
      urls: ${JSON.stringify(URLS.join('\n'))},
      maxArticles: 8,
      contentType: 'auto',
      nameHint: '卢克文',
      model: { providerConfigId: ${JSON.stringify(providerConfigId)}, modelId: ${JSON.stringify(modelId)} }
    }
  }).then(r => r)`, 60_000)
  if (!started?.success) throw new Error('启动失败：' + JSON.stringify(started).slice(0, 400))
  const runId = started.data?.runId ?? started.data?.id
  console.log('[accept] runId =', runId)

  // 轮询至终态（上限 40 分钟：8 篇渲染抓取 + 逐块笔记蒸馏，比阮一峰纯 HTTP 慢）
  const t0 = Date.now()
  let run = null
  while (Date.now() - t0 < 40 * 60_000) {
    await new Promise((r) => setTimeout(r, 15_000))
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

  // 节点输出摘要（入库几篇/判类结论/蒸馏产物）
  const digestOut = run?.nodes?.digest1?.output ?? null
  if (digestOut) console.log('[accept] digest1:', JSON.stringify({ total: digestOut.total, count: digestOut.count, chars: (digestOut.fullText ?? '').length }))
  const classifyOut = run?.nodes?.classify1?.parsed ?? run?.nodes?.classify1?.output?.parsed ?? null
  if (classifyOut) console.log('[accept] classify1:', JSON.stringify(classifyOut).slice(0, 300))
  const distillOut = run?.nodes?.distill1?.output ?? null
  if (distillOut) console.log('[accept] distill1:', JSON.stringify({ skillId: distillOut.skillId, skillName: distillOut.skillName, detectedType: distillOut.detectedType, issues: (distillOut.issues ?? []).length }))
  if (finalStatus !== 'succeeded') {
    console.log('[accept] run 详情：', JSON.stringify(run).slice(0, 1500))
    throw new Error('工作流未成功：' + finalStatus)
  }

  // 校验技能包落盘（id 是 kebab slug，显示名=卢克文；从技能库按名找）
  const skills = await ev(`window.electronAPI.skills.list().then(r => r)`)
  const skillList = skills?.data?.skills ?? skills?.data ?? []
  const mine = (Array.isArray(skillList) ? skillList : []).find((s) => s.name === '卢克文' || s.title === '卢克文' || s.id === '卢克文')
  if (!mine) throw new Error('技能库中未找到「卢克文」：' + (Array.isArray(skillList) ? skillList.map(s => `${s.id}(${s.name})`).slice(0, 20).join(',') : JSON.stringify(skills).slice(0, 200)))
  const skillDir = path.join(DATA_ROOT, 'skills', mine.id)
  const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')
  const refDir = path.join(skillDir, 'references')
  const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir) : []
  console.log('[accept] ✅ 技能已创建：id =', mine.id, '，显示名 =', mine.name, '；SKILL.md', Buffer.byteLength(skillMd), '字节；references =', refs.join(', '))
  console.log('--- SKILL.md 前 600 字 ---\n' + skillMd.slice(0, 600))

  // 校验资产中心
  const assets = await ev(`window.electronAPI.assets.list({ subCategory: '博主蒸馏', page: 1, pageSize: 50 }).then(r => r).catch(e => ({ error: String(e) }))`)
  const assetList = assets?.data?.items ?? assets?.data?.assets ?? assets?.data ?? []
  const mineAssets = (Array.isArray(assetList) ? assetList : []).filter((a) => String(a.name || '').includes('卢克文'))
  console.log('[accept] ✅ 资产中心「博主蒸馏」本博主资产数 =', mineAssets.length, mineAssets.map((a) => a.name).slice(0, 8).join(' | '))
  console.log('[accept] 🎉 卢克文（头条）大V蒸馏工作流真机验收通过：runId=' + runId)
}

main().then(() => process.exit(0)).catch((e) => { console.error('[accept] ❌ 验收失败：', e.message); process.exit(1) })
