// M6 走查：①Home 卡片进度/按钮底部固定 ②Space 空间设置入口+面板 ③答疑顺序(新消息在底) ④Atlas 无设置入口
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]

  // ① Home 卡片
  await page.goto('http://localhost:5173/#/domain-learning')
  await page.waitForTimeout(2600)
  const home = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.topic-card')]
    const rows = cards.map((c) => {
      const btn = c.querySelector('.card-actions button')
      const prog = c.querySelector('.card-progress')
      const r = btn?.getBoundingClientRect()
      return {
        name: c.querySelector('.topic-name span')?.textContent?.trim() ?? '',
        btnY: r ? Math.round(r.top) : -1,
        btnBottom: r ? Math.round(r.bottom) : -1,
        hasProg: !!prog,
      }
    })
    return rows
  })
  await page.screenshot({ path: 'progress/_m6_home_cards.png' })

  // ② Space 设置入口
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}`)
  await page.waitForTimeout(2600)
  const header = await page.evaluate(() => [...document.querySelectorAll('.space-header button')].map((b) => b.textContent.trim()))
  const setOpened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.space-header button')].find((b) => b.textContent.includes('空间设置'))
    btn?.click()
    return !!btn
  })
  await page.waitForTimeout(800)
  const dialog = await page.evaluate(() => ({
    title: document.querySelector('.el-dialog__title')?.textContent?.trim() ?? '',
    groups: [...document.querySelectorAll('.settings-body .set-title')].map((t) => t.textContent.trim()),
    kbSel: !!document.querySelector('.settings-body .el-select'),
  }))
  await page.screenshot({ path: 'progress/_m6_space_settings.png' })
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('.el-dialog button')].find((b) => b.textContent.trim() === '取消')
    close?.click()
    if (!close) document.querySelector('.el-dialog__headerbtn')?.click()
  })
  await page.waitForTimeout(400)

  // ③ 答疑顺序：发一条新消息，等待回复，验证其在列表最底部
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.tree-row')].find((r) => r.textContent.includes('贝叶斯'))
    row?.click()
  })
  await page.waitForTimeout(1400)
  const before = await page.evaluate(() => [...document.querySelectorAll('.qa-turn .qa-text')].map((t) => t.textContent?.trim().slice(0, 20)))
  const asked = await page.evaluate(() => {
    const ta = document.querySelector('.pane-qa .el-textarea__inner')
    if (!ta) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, '走查M6：回答一句话即可，用一句话解释贝叶斯定理的意义。')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    const send = [...document.querySelectorAll('.qa-send-row button')].find((b) => /追问|回答中/.test(b.textContent))
    send?.click()
    return !!send
  })
  // 轮询直到:文本区清空(发送完成)或出现兜底/流式结束;上限 120s
  let fin = null
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(5000)
    const s = await page.evaluate(() => {
      const texts = [...document.querySelectorAll('.qa-turn .qa-text')].map((t) => t.textContent?.trim() ?? '')
      const ta = document.querySelector('.pane-qa .el-textarea__inner')
      const lastText = texts[texts.length - 1] ?? ''
      return {
        len: texts.length,
        lastText: lastText.slice(-120),
        inputCleared: !(ta?.value ?? '').length,
        hasDots: lastText === '…' || lastText === '',
        busy: !!document.querySelector('.qa-streaming'),
      }
    })
    if (s.inputCleared && !s.busy && s.lastText && !s.hasDots) { fin = s; break }
    if (s.lastText.startsWith('（未收到') || s.lastText.startsWith('（追问失败')) { fin = s; break }
  }
  if (!fin) {
    fin = await page.evaluate(() => ({
      len: document.querySelectorAll('.qa-turn .qa-text').length,
      lastText: [...document.querySelectorAll('.qa-turn .qa-text')].map((t) => t.textContent?.trim() ?? '').slice(-1)[0]?.slice(-160) ?? '',
      timeout: true,
    }))
  }
  const after = await page.evaluate(() => [...document.querySelectorAll('.qa-turn .qa-text')].map((t) => t.textContent?.trim().slice(0, 24)))
  console.log(JSON.stringify({ step1_home: home, step2: { header, setOpened, dialog }, step3: { asked, beforeCount: before.length, fin, first: after[0], last: after[after.length - 1], afterCount: after.length } }, null, 2))

  // ④ Atlas 无设置入口
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}/atlas`)
  await page.waitForTimeout(2400)
  const atlas = await page.evaluate(() => [...document.querySelectorAll('.atlas-header .atlas-actions button')].map((b) => b.textContent.trim()))
  console.log(JSON.stringify({ step4_atlasButtons: atlas }, null, 2))
  await page.screenshot({ path: 'progress/_m6_atlas_no_settings.png' })
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
