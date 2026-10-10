/**
 * 正式跑内置应用「深度长文写作（风格库）」(builtin_app_styled_long_form)
 * material = 主题深度研究报告全文；等待内置应用种子就绪（重启后生效）
 * 输出：outputs/content/ 下落盘终稿
 */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

const REPORT = 'outputs/诺贝尔生理学或医学奖研究报告-2026-10-09.md'
const APP_ID = 'builtin_app_styled_long_form'
const OUT_DIR = 'outputs/content'

;(async () => {
  const material = fs.readFileSync(REPORT, 'utf-8')
  assert(material.length > 3000, `报告太短: ${material.length}`)
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  assert(page, '未找到应用窗口')

  // 等内置应用种子就绪（重启后迁移播种）
  let ok = false
  for (let i = 0; i < 60; i++) {
    ok = await page.evaluate(async (id) => (await window.electronAPI.app.get(id))?.success === true, APP_ID)
    if (ok) break
    log(`内置应用未就绪，30s 后重试（${i + 1}/60）`)
    await sleep(30000)
  }
  assert(ok, '内置应用未就绪')
  log('内置应用在位')

  const s = await page.evaluate(async (args) => {
    const c = await window.electronAPI.appSession.create({ appId: args.appId })
    if (!c.success) return { error: c.error }
    const st = await window.electronAPI.appSession.start({
      sessionId: c.data.id,
      inputs: {
        topic: '2026年诺贝尔生理学或医学奖：光遗传学与「用光操控大脑」的二十年',
        material: args.material,
        style: 'auto',
        platform: '公众号',
        word_count: '4000字左右',
        intensity: '标准',
        keep: '直接引语一字不动；数字、日期与口径标注不得改；三位获奖人姓名与机构不得写错',
        extra: '科普特稿向：原理讲清楚、发现史有叙事、人物分工明确、应用与临床转化写足、争议（优先权/专利/落选者/延迟认可）写透。文末按 illustration.md 产出「配图清单」（需要才配，宁缺毋滥，含每图三问结论）与「配图审核单」模板。',
        current_content: '',
        feedback: '',
        model: { providerConfigId: 'pc_muuwsf3q_kzesid6qr', modelId: 'qwen3.8-max' },
        libaiModel: { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' },
      },
    }, )
    return st.success !== false ? { sid: c.data.id } : { error: st.error }
  }, { appId: APP_ID, material })
  assert(s.sid, `启动失败 ${JSON.stringify(s)}`)
  log(`会话 ${s.sid} 已启动（material ${material.length} 字符）`)
  fs.writeFileSync('outputs/_nobel-writing-session.txt', s.sid, 'utf-8')

  const t0 = Date.now()
  let report = null
  let fail = null
  const seen = new Set()
  while (Date.now() - t0 < 40 * 60 * 1000) {
    await sleep(5000)
    const cards = await page.evaluate(async (sid) => {
      const m = await window.electronAPI.appSession.messages(sid)
      return (m.data ?? []).filter(x => x.metadata?.sessionCard).map(x => ({ id: x.id, ...x.metadata.sessionCard }))
    }, s.sid)
    for (const c of cards) {
      if (c.card === 'node-status' && !seen.has(`${c.nodeId}:${c.status}`)) { seen.add(`${c.nodeId}:${c.status}`); log(`节点 ${c.nodeId} → ${c.status}`) }
      if (c.card === 'report') report = c
      if (c.card === 'message' && /运行(failed|timed_out|cancelled|interrupted)/.test(String(c.content ?? ''))) fail = c.content
    }
    if (report || fail) break
  }
  assert(!fail, `运行失败: ${fail}`)
  assert(report, '40 分钟未拿到报告卡')

  const md = String(report.markdown ?? '')
  assert(!md.includes('=====FINAL====='), '终稿仍含分隔符')
  const title = String(report.title ?? '长文').replace(/[\/:*?"<>|]/g, '')
  const out = `${OUT_DIR}/长文-${title}.md`
  fs.writeFileSync(out, md, 'utf-8')
  log(`✅ 长文落盘 ${out}（${md.length} 字符）`)
})().catch(e => { console.error('❌', e.message); process.exit(1) })
