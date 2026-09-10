/**
 * 输出质量评估采集（42 号 M9）
 * 真机 + 真实 LLM：三轮研讨 → 提炼概要卡/人物卡 → 采纳 → 全量输出落盘供评估。
 * 用法：node scripts/e2e-story-room-quality.cjs
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('@playwright/test')

const OUT = path.resolve(__dirname, '../docs/design/output-quality-sample.json')
const INDEX_HTML = path.resolve(__dirname, '../out/renderer/index.html')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  if (!page) throw new Error('no page')

  const call = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
    return fn(window.electronAPI.longwriting, args)
  }, { expr, args })

  let PID = ''
  let MODEL_OPTS = {}
  const waitReply = async (beforeCount) => {
    let hist = null
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(2000)
      hist = await call('roomHistory', PID)
      const msgs = hist.data.messages
      if (msgs.length >= beforeCount + 2 && msgs[msgs.length - 1].role === 'assistant') break
    }
    return hist.data.messages
  }

  try {
    const created = await call('createProject', { name: `质量评估-${Date.now() % 10000}`, type: 'story' })
    PID = created.data.id

    await page.evaluate((h) => { location.hash = h }, `#/longwriting/room/${PID}`)
    await page.reload()
    await page.waitForSelector('.input-box', { timeout: 15000 })
    await page.waitForTimeout(1500)

    const rounds = [
      '我想写一个玄幻故事：主角是青云宗外门弟子林晓，被冤偷窃宗门至宝玄天鉴逐出师门，十年后归来洗冤复仇。你觉得这个设定作为故事核够不够？缺什么？',
      '我想加一个反派：现任宗主的首徒顾长风，十年前做伪证陷害林晓。你觉得他和林晓的关系怎么设计张力最强？给两个方案。',
      '世界观再开阔一点：青云宗之外，设计两三个有名字的势力，以及它们和玄天鉴失窃案的关联。',
    ]
    const replies = []
    let count = 0
    for (const msg of rounds) {
      const before = count
      await page.fill('.input-box', msg)
      await page.click('.send-btn')
      const msgs = await waitReply(before)
      count = msgs.length
      const last = msgs[msgs.length - 1]
      replies.push({ user: msg, editor: last.content })
    }

    // 提炼概要卡 + 人物卡
    // UI 路径提炼（与真实用户一致：modelSel 经 useStoryRoom 自动携带）
    await page.click('.ledger-distill')
    await page.waitForTimeout(600)
    await page.click('.el-dropdown-menu__item:has-text("概要卡")')
    await page.waitForTimeout(4000)
    await page.click('.ledger-distill')
    await page.waitForTimeout(600)
    await page.click('.el-dropdown-menu__item:has-text("人物卡")')
    await page.waitForTimeout(4000)

    const final = await call('roomHistory', PID)
    const state = final.data.state

    // 采纳前两张 pending 卡
    const adoptResults = []
    for (const c of state.pendingCards.filter((c) => c.status === 'pending').slice(0, 2)) {
      const r = await call('roomAdoptCard', PID, c.id, null, MODEL_OPTS)
      adoptResults.push({ cardTitle: c.title, kind: c.kind, data: c.data, result: r })
    }

    const overview = await call('getStoryOverview', PID)
    const characters = await call('getCharacters', PID)

    const dump = {
      capturedAt: new Date().toISOString(),
      model: '（应用当前主编模型）',
      rounds: replies,
      ledger: state.ledger,
      gateEvents: '（若触发见 ledger/事件）',
      pendingCards: state.pendingCards,
      adoptResults,
      dbOverview: overview.data,
      dbCharacters: characters.data,
    }
    fs.writeFileSync(OUT, JSON.stringify(dump, null, 2))
    console.log('[quality] 轮次:', replies.length, '| 账本:', state.ledger.length, '| 卡片:', state.pendingCards.length, '| 采纳:', adoptResults.length)
    console.log('[quality] 采样已写入', OUT)

    await call('deleteProject', PID)
    await page.evaluate(() => { location.hash = '#/' })
    await page.reload()
    console.log('[quality] cleaned')
  } catch (e) {
    console.error('[quality] FAILED:', e.message)
    process.exitCode = 1
  }
  process.exit(0)
})().catch((e) => { console.error(e.message); process.exit(1) })
