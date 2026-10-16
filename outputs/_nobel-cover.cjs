/** 图1 封面：系统 image-gen（Seedream-4.5）生成 → 轮询任务 → 落盘 */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)
const PROMPT = 'Editorial science illustration, clean minimalist style on warm paper background: a neuron cell with its cell membrane cross-section, a light-activated channel protein (channelrhodopsin) embedded in the membrane, a single beam of cool BLUE light shining onto the channel, the entire light beam is blue, ions flowing through the open channel into the cell, small electric pulse ripple along the membrane. Muted palette of deep slate blue, ink gray and warm cream. The light beam must be entirely cool blue, no red light. Flat vector editorial style, generous negative space, no text, no letters, no people, no faces.'
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  assert(page, '未找到渲染页')
  const g = await page.evaluate(async (req) => window.electronAPI.image.generate(req), {
    providerConfigId: 'pc_mmyf038f_3do48dnca', model: 'ep-20260329002741-4wjp7',
    prompt: PROMPT, negativePrompt: 'red light beam, red beam, warm light, text, letters, watermark, human, face', width: 1440, height: 810, count: 1,
  })
  assert(g.success !== false && g.data?.taskId, `生成请求失败 ${JSON.stringify(g).slice(0, 200)}`)
  log(`任务 ${g.data.taskId}`)
  let done = null
  for (let i = 0; i < 60; i++) {
    await sleep(5000)
    const st = await page.evaluate(async (tid) => window.electronAPI.image.getTaskStatus(tid), g.data.taskId)
    const status = st?.data?.status ?? st?.status
    if (i % 4 === 0) log(`状态 ${status}`)
    if (status === 'completed' || status === 'success' || status === 'succeeded') { done = st.data ?? st; break }
    if (status === 'failed' || status === 'error') throw new Error('生成失败: ' + JSON.stringify(st).slice(0, 300))
  }
  assert(done, '180 秒未完成')
  log('结果: ' + JSON.stringify(done).slice(0, 400))
  fs.writeFileSync('outputs/_nobel-cover-task.json', JSON.stringify(done, null, 1), 'utf-8')
})().catch(e => { console.error('❌', e.message); process.exit(1) })
