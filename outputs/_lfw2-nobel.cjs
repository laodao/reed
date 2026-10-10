/** 长文写作 v2 真实长文实测：诺贝尔奖光遗传学（science-explainer 卡，6章） */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

const MATERIAL = fs.readFileSync('outputs/诺贝尔生理学或医学奖研究报告-2026-10-09.md', 'utf-8')
const APP = 'builtin_app_long_form_writing'
const TOPIC = '2026年诺贝尔生理学或医学奖：光遗传学与「用光操控大脑」的二十年'

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http') || p.url().includes('renderer'))
  assert(page, '未找到渲染页')

  const s1 = await page.evaluate(async (a) => {
    const c = await window.electronAPI.appSession.create({ appId: a.app })
    const st = await window.electronAPI.appSession.start({
      sessionId: c.data.id,
      inputs: {
        topic: a.topic,
        material: a.material,
        mode: 'nonfiction', chapterCount: 6, wordCountPerChapter: 900,
        style: '科普说明', style_card: 'science-explainer', premise: '', reader: '公众号深度读者',
        current_content: '', base_asset_id: '', feedback: '首次入链（v2 管线实测）',
        intensity: '标准', keep: '直接引语一字不动；数字、日期与口径标注不得改；三位获奖人姓名与机构不得写错',
        model: { providerConfigId: 'pc_muuwsf3q_kzesid6qr', modelId: 'qwen3.8-max' },
        libaiModel: { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' },
      },
    })
    return st.success !== false ? c.data.id : null
  }, { app: APP, topic: TOPIC, material: MATERIAL })
  assert(s1, '启动失败')
  log(`会话 ${s1}（素材 ${MATERIAL.length} 字符）`)
  fs.writeFileSync('outputs/_lfw2-nobel-session.txt', s1, 'utf-8')

  async function cards(sid) {
    return page.evaluate(async (sid) => {
      const m = await window.electronAPI.appSession.messages(sid)
      return (m.data ?? []).filter(x => x.metadata?.sessionCard).map(x => ({ id: x.id, ...x.metadata.sessionCard }))
    }, sid)
  }

  // 大纲确认
  let oc = null
  for (let i = 0; i < 15 * 12; i++) {
    oc = (await cards(s1)).find(c => c.card === 'review' && c.nodeId === 'outlineReview')
    if (oc) break
    if (i % 12 === 0) log(`等待大纲确认…(${Math.floor(i / 12)}min)`)
    await sleep(5000)
  }
  assert(oc, '大纲确认超时')
  log('大纲确认卡到达，批准（结构按 AI 方案执行）')
  await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: 'outlineReview', decision: 'approve' }), { sid: s1 })

  // 终稿确认
  let fc = null
  for (let i = 0; i < 45 * 12; i++) {
    fc = (await cards(s1)).find(c => c.card === 'review' && c.nodeId === 'finalReview')
    if (fc) break
    if (i % 24 === 0) log(`写作/评审/去AI味进行中…(${Math.floor(i / 12)}min)`)
    await sleep(5000)
  }
  assert(fc, '终稿确认超时')
  log('终稿确认卡到达，批准')
  await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: 'finalReview', decision: 'approve' }), { sid: s1 })

  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(async (sid) => (await window.electronAPI.appSession.get(sid)).data?.status, s1)
    if (st !== 'running') { log(`终态: ${st}`); break }
    await sleep(5000)
  }
  log('✅ 运行完成，等待外部 QA')
})().catch(e => { console.error('❌', e.message); process.exit(1) })
