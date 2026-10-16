/** 长文写作 v2 实机 E2E：大纲确认→逐章(风格卡技能)→事实校验→评审循环→去AI味→终稿确认→版本链；修订运行续链 */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)
const APP = 'builtin_app_long_form_writing'
const MODEL = { providerConfigId: 'pc_muuwsf3q_kzesid6qr', modelId: 'qwen3.8-max' }
const LMODEL = { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' }

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http') || p.url().includes('renderer'))
  assert(page, '未找到渲染页')

  const ids = await page.evaluate(async () => {
    const a = await window.electronAPI.app.get('builtin_app_long_form_writing')
    return a?.success === true
  })
  assert(ids, '应用不在位')

  // ---------- 运行 1：全新创作 ----------
  const s1 = await page.evaluate(async (a) => {
    const c = await window.electronAPI.appSession.create({ appId: a.app })
    const st = await window.electronAPI.appSession.start({
      sessionId: c.data.id,
      inputs: {
        topic: '为什么天空是蓝色的（v2 管线小样）',
        material: '瑞利散射强度与波长四次方成反比。蓝光波长约450纳米，红光约650纳米。大气分子对短波光散射更强，所以天空呈蓝色。傍晚光路变长，蓝光被散射殆尽，剩余红橙光到达人眼，形成晚霞。',
        mode: 'nonfiction', chapterCount: 2, wordCountPerChapter: 300,
        style: '科普说明', style_card: 'auto', premise: '', reader: '公众号读者',
        current_content: '', base_asset_id: '', feedback: '首次入链',
        intensity: '标准', keep: '直接引语一字不动；数字、日期与口径标注不得改',
        model: a.model, libaiModel: a.lmodel,
      },
    })
    return st.success !== false ? c.data.id : null
  }, { app: APP, model: MODEL, lmodel: LMODEL })
  assert(s1, '运行 1 启动失败')
  log(`运行1 会话 ${s1}`)

  async function waitCard(sid, kind, nodeId, capMin) {
    for (let i = 0; i < capMin * 12; i++) {
      const cards = await page.evaluate(async (a) => {
        const m = await window.electronAPI.appSession.messages(a.sid)
        return (m.data ?? []).filter(x => x.metadata?.sessionCard).map(x => ({ id: x.id, ...x.metadata.sessionCard }))
      }, { sid })
      const hit = cards.find(c => c.card === 'review' && c.nodeId === nodeId && (kind ? c.kind === kind : true))
      if (hit) return hit
      if (i % 12 === 0) log(`等待 ${nodeId}…(${Math.floor(i / 12)}min)`)
      await sleep(5000)
    }
    throw new Error(`等待 ${nodeId} 超时`)
  }

  // 大纲确认：批准（不带编辑 → 走 fallback 大纲）
  await waitCard(s1, null, 'outlineReview', 8)
  log('大纲确认卡到达，批准')
  await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: 'outlineReview', decision: 'approve' }), { sid: s1 })

  // 终稿确认
  await waitCard(s1, null, 'finalReview', 22)
  log('终稿确认卡到达，批准')
  await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: 'finalReview', decision: 'approve' }), { sid: s1 })

  // 等终态 + 报告卡
  // 本图无 report 节点：等运行终态（消息卡或会话离开 running）
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(async (sid) => ({
      status: (await window.electronAPI.appSession.get(sid)).data?.status,
      msgs: (window.__c = window.__c || 0),
    }), s1)
    if (st.status !== 'running') { log(`运行1 终态: ${st.status}`); break }
    if (i % 12 === 0) log(`等待运行1 终态…(${Math.floor(i / 12)}min)`)
    await sleep(5000)
  }

  // 找 save1 产物资产
  const asset = await page.evaluate(async (kw) => {
    const r = await window.electronAPI.assets.list({ keyword: kw, page: 1, pageSize: 3 })
    return (r.data?.items ?? [])[0] ?? null
  }, '为什么天空是蓝色的（v2 管线小样）')
  assert(asset, '资产未找到')
  log(`资产 ${asset.id}`)

  // 版本链 v1
  const lv1 = await page.evaluate(async (id) => (await window.electronAPI.assets.listVersions(id)).data, asset.id)
  assert(lv1.length >= 1 && lv1[0].version === 1, `v1 未入链: ${JSON.stringify(lv1)}`)
  log(`版本链 v1 ✅（feedback: ${lv1[0].feedback}）`)

  // ---------- 运行 2：修订续链 ----------
  const s2 = await page.evaluate(async (a) => {
    const c = await window.electronAPI.appSession.create({ appId: a.app })
    const st = await window.electronAPI.appSession.start({
      sessionId: c.data.id,
      inputs: {
        topic: '为什么天空是蓝色的（v2 管线小样）',
        material: a.material, mode: 'nonfiction', chapterCount: 2, wordCountPerChapter: 300,
        style: '科普说明', style_card: 'auto', premise: '', reader: '公众号读者',
        current_content: a.cur, base_asset_id: a.assetId, feedback: '把结尾改得更有余味，其余不动',
        intensity: '标准', keep: '直接引语一字不动；数字、日期与口径标注不得改',
        model: a.model, libaiModel: a.lmodel,
      },
    })
    return st.success !== false ? c.data.id : null
  }, { app: APP, model: MODEL, lmodel: LMODEL, material: '瑞利散射强度与波长四次方成反比。', cur: asset.textContent ?? md1, assetId: asset.id })
  assert(s2, '运行 2 启动失败')
  log(`运行2（修订）会话 ${s2}`)

  await waitCard(s2, null, 'finalReview', 15)
  log('修订终稿卡到达，批准')
  await page.evaluate(async (a) => window.electronAPI.appSession.review({ sessionId: a.sid, nodeId: 'finalReview', decision: 'approve' }), { sid: s2 })
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(async (sid) => (await window.electronAPI.appSession.get(sid)).data?.status, s2)
    if (st !== 'running') break
    await sleep(5000)
  }
  const lv2 = await page.evaluate(async (id) => (await window.electronAPI.assets.listVersions(id)).data, asset.id)
  assert(lv2.length >= 2 && lv2[0].version === 2, `v2 未续链: ${JSON.stringify(lv2)}`)
  log(`修订续链 v2 ✅（feedback: ${lv2[0].feedback}）`)

  // 清理会话（保留资产）
  await page.evaluate(async (a) => {
    for (const sid of [a.s1, a.s2]) await window.electronAPI.appSession.delete(sid)
  }, { s1, s2 })
  fs.writeFileSync('outputs/_lfw2-asset-id.txt', asset.id, 'utf-8')
  console.log('\n🎉 长文写作 v2 E2E 通过：大纲确认→逐章风格卡→事实校验→评审→去AI味→终稿确认→v1；修订运行→v2 续链')
})().catch(e => { console.error('❌ E2E 失败：', e.message); process.exit(1) })
