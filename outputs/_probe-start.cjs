const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http') || p.url().includes('renderer'))
  const r = await page.evaluate(async (a) => {
    const c = await window.electronAPI.appSession.create({ appId: a.app })
    if (!c.success) return { at: 'create', error: c.error }
    const st = await window.electronAPI.appSession.start({ sessionId: c.data.id, inputs: a.inputs })
    if (st.success === false) return { at: 'start', error: st.error }
    return { ok: true, sid: c.data.id }
  }, { app: 'builtin_app_long_form_writing', inputs: {
    topic: '审计小样', material: '瑞利散射强度与波长四次方成反比。蓝光约450纳米。', mode: 'nonfiction',
    chapterCount: 2, wordCountPerChapter: 200, style: '科普说明', style_card: 'science-explainer',
    premise: '', reader: '', current_content: '', base_asset_id: '', feedback: '', intensity: '标准',
    keep: '直接引语一字不动', model: { providerConfigId: 'pc_muuwsf3q_kzesid6qr', modelId: 'qwen3.8-max' },
    libaiModel: { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' },
  } })
  console.log(JSON.stringify(r, null, 1))
  if (r.sid) await page.evaluate(async (sid) => window.electronAPI.appSession.delete(sid), r.sid)
})().catch(e => { console.error('❌', e.message); process.exit(1) })
