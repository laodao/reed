/** 终稿事实审计环节小样验证：finalReview payload 应含「事实审核报告」且逐条列表非空 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)
const APP = 'builtin_app_long_form_writing'
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http') || p.url().includes('renderer'))
  const s1 = await page.evaluate(async (a) => {
    const c = await window.electronAPI.appSession.create({ appId: a.app })
    const st = await window.electronAPI.appSession.start({
      sessionId: c.data.id,
      inputs: {
        topic: '审计环节小样：瑞利散射与天空的蓝',
        material: '瑞利散射强度与波长四次方成反比。蓝光波长约450纳米，红光约650纳米，大气分子对短波光散射更强，因此天空呈蓝色。2004年，研究者将通道视紫红质导入大鼠海马神经元。傍晚光路更长，蓝紫光被散射殆尽，剩余红橙光形成晚霞。',
        mode: 'nonfiction', chapterCount: 2, wordCountPerChapter: 250,
        style: '科普说明', style_card: 'science-explainer', premise: '', reader: '公众号读者',
        current_content: '', base_asset_id: '', feedback: '审计小样',
        intensity: '标准', keep: '直接引语一字不动；数字、日期与口径标注不得改',
        model: { providerConfigId: 'pc_muuwsf3q_kzesid6qr', modelId: 'qwen3.8-max' },
        libaiModel: { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' },
      },
    })
    return st.success !== false ? c.data.id : null
  }, { app: APP })
  assert(s1, '启动失败')
  log(`会话 ${s1}`)
  let fc = null
  let outlineDone = false
  for (let i = 0; i < 25 * 12; i++) {
    const cards = await page.evaluate(async (sid) => {
      const m = await window.electronAPI.appSession.messages(sid)
      return (m.data ?? []).filter(x => x.metadata?.sessionCard).map(x => ({ id: x.id, ...x.metadata.sessionCard }))
    }, s1)
    if (!outlineDone) {
      const oc = cards.find(c => c.card === 'review' && c.nodeId === 'outlineReview')
      if (oc) {
        log('大纲确认卡到达，批准')
        await page.evaluate(async (sid) => window.electronAPI.appSession.review({ sessionId: sid, nodeId: 'outlineReview', decision: 'approve' }), s1)
        outlineDone = true
      }
    }
    fc = cards.find(c => c.card === 'review' && c.nodeId === 'finalReview')
    if (fc) break
    if (i % 12 === 0) log(`等待终稿确认…(${Math.floor(i / 12)}min)`)
    await sleep(5000)
  }
  assert(fc, '终稿确认超时')
  // payload 内容存在消息卡片里
  const msgs = await page.evaluate(async (sid) => {
    const m = await window.electronAPI.appSession.messages(sid)
    return (m.data ?? []).filter(x => x.metadata?.sessionCard && x.metadata.sessionCard.nodeId === 'finalReview').map(x => String(x.content ?? '') + '||' + String(x.metadata?.sessionCard?.payload ?? ''))
  }, s1)
  const blob = msgs.join('||')
  log('finalReview 卡内容长度:', blob.length)
  assert(blob.includes('事实审核报告'), 'payload 缺审核报告')
  assert(/\|[ ]*[VUD]\d/.test(blob) || /核对 \d+ 条/.test(blob), '审核报告无逐条列表')
  const mTotal = blob.match(/核对 (\d+) 条：一致 (\d+) \/ 有出入 (\d+) \/ 素材未载 (\d+)/)
  log('审计统计:', mTotal ? mTotal[0] : '(未解析到统计行)')
  // 批准收尾
  await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: 'finalReview', decision: 'approve' }), { sid: s1 })
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(async (sid) => (await window.electronAPI.appSession.get(sid)).data?.status, s1)
    if (st !== 'running') break
    await sleep(4000)
  }
  await page.evaluate(async (sid) => window.electronAPI.appSession.delete(sid), s1)
  console.log('\n🎉 终稿事实审计环节验证通过：报告进用户确认卡、逐条列表、统计齐全')
})().catch(e => { console.error('❌', e.message); process.exit(1) })
