const { chromium } = require('playwright')
const SCRIPT_ID = 'es_1788518923911_x77letrxs'
const PC_TEXT = 'pc_mtee10tz_ijz2yq1ro'
const MODEL_TEXT = 'deepseek-v4-flash-0731'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  const ev = (fn, arg) => page.evaluate(fn, arg)
  let done = false
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    console.log(`批量生成第 ${attempt} 次（显式百炼 deepseek）...`)
    const t0 = Date.now()
    const r = await ev(({ s, pc, m }) =>
      window.electronAPI.episodeProduction.generateStoryboards(s, pc, m)
        .catch((e) => ({ success: false, error: String(e && e.message || e) })),
      { s: SCRIPT_ID, pc: PC_TEXT, m: MODEL_TEXT })
    const dur = (Date.now() - t0) / 1000 | 0
    const created = Array.isArray(r?.data) ? r.data.length : 0
    console.log(`  返回(${dur}s): success=${r?.success} created=${created} err=${String(r?.error || '').slice(0, 200)}`)
    const per = await ev(async (scriptId) => {
      const api = window.electronAPI.episodeProduction
      const scenes = (await api.listScenes(scriptId))?.data || []
      const out = []
      for (const sc of scenes) {
        const sbs = (await api.listStoryboards(sc.id))?.data || []
        out.push(sbs.map((s) => s.shotNumber))
      }
      return out
    }, SCRIPT_ID)
    console.log('  shotNumbers:', JSON.stringify(per))
    if (r?.success && created > 0 && per.every((nums) => nums.length && nums.every((n, i) => n === i + 1))) {
      done = true
      console.log('F2/F1 ✅: 批量生成成功且编号连续', JSON.stringify(per))
    } else if (attempt < 3) {
      await sleep(20000) // 避开 RPM/空响应抖动
    }
  }
  console.log('F2_RETRY_RESULT=' + JSON.stringify({ ok: done }))
  process.exit(done ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
