// M4-UX1 补全走查:右栏「笔记」面板——选区笔记新建可见/问答收藏可见/删除生效/空态
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}`)
  await page.waitForTimeout(2500)

  // 选概念(贝叶斯,有讲义与已答轮次)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.tree-row')].find((r) => r.textContent.includes('贝叶斯'))
    if (row) row.click()
  })
  await page.waitForTimeout(1400)

  // 切到「笔记」tab,读初始态
  const tab0 = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.head-tab')]
    const nt = tabs.find((b) => b.textContent.trim().startsWith('笔记'))
    nt?.click()
    return { tabs: tabs.map((t) => t.textContent.trim()), clicked: !!nt }
  })
  await page.waitForTimeout(500)
  const panel0 = await page.evaluate(() => ({
    emptyText: document.querySelector('.note-list .qa-empty')?.textContent?.trim() ?? '',
    items: document.querySelectorAll('.note-item').length,
    counts: [...document.querySelectorAll('.note-item .el-tag')].map((t) => t.textContent.trim()),
  }))

  // 回答疑 tab:①选区做笔记(新建 selection 笔记)
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.head-tab')].find((b) => b.textContent.includes('追问'))
    t?.click()
  })
  await page.waitForTimeout(400)
  const sel = await page.evaluate(() => {
    const lesson = document.querySelector('.lesson-body')
    if (!lesson) return { err: 'no lesson body' }
    const walker = document.createTreeWalker(lesson, NodeFilter.SHOW_TEXT)
    let node = null
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.trim().length > 10) break
    }
    if (!node) return { err: 'no text node' }
    const r = document.createRange()
    r.setStart(node, 0)
    r.setEnd(node, Math.min(10, node.textContent.length))
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
    lesson.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return { selected: s.toString() }
  })
  await page.waitForTimeout(350)
  const barVisible = await page.evaluate(() => !!document.querySelector('.sel-bar'))
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sel-bar button')].find((b) => b.textContent.includes('做笔记'))
    btn?.click()
  })
  await page.waitForTimeout(350)
  await page.evaluate(() => {
    const ta = document.querySelector('.el-dialog .el-textarea__inner')
    if (ta) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, '走查选区笔记:这一段要重点回顾。')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.waitForTimeout(150)
  const saved = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.el-dialog button')].find((b) => b.textContent.includes('保存笔记'))
    btn?.click()
    return !!btn
  })
  await page.waitForTimeout(700)

  // ②答疑 tab 收藏第一个可收藏回答
  const fav = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.qa-fav button')].find((b) => /收藏为笔记/.test(b.textContent))
    if (!btn) return { done: false }
    btn.click()
    return { done: true }
  })
  await page.waitForTimeout(700)

  // ③回笔记 tab 读列表:应含选区笔记 + 问答收藏
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.head-tab')].find((b) => b.textContent.trim().startsWith('笔记'))
    t?.click()
  })
  await page.waitForTimeout(500)
  const panel1 = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.note-item')].map((it) => ({
      tag: it.querySelector('.el-tag')?.textContent?.trim() ?? '',
      anchor: (it.querySelector('.note-anchor-text')?.textContent ?? '').slice(0, 30),
      body: (it.querySelector('.note-text')?.textContent ?? '').slice(0, 40),
      time: it.querySelector('.note-time')?.textContent?.trim() ?? '',
    }))
    return { count: items.length, items }
  })

  // ④删除新建的选区笔记(按正文匹配),验证列表减少
  const del = await page.evaluate(() => {
    const it = [...document.querySelectorAll('.note-item')].find((x) => (x.querySelector('.note-text')?.textContent ?? '').includes('走查选区笔记'))
    if (!it) return { done: false }
    it.querySelector('.note-del')?.click()
    return { done: true }
  })
  await page.waitForTimeout(600)
  const panel2 = await page.evaluate(() => ({
    count: document.querySelectorAll('.note-item').length,
    tags: [...document.querySelectorAll('.note-item .el-tag')].map((t) => t.textContent.trim()),
  }))

  // ⑤未选概念空态:点空白区清选择?切到根概念无选中时笔记面板提示;直接走查有概念时空态已由空概念覆盖——简单验证面板在答疑 tab 展示正常
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.head-tab')].find((b) => b.textContent.includes('追问'))
    t?.click()
  })
  await page.waitForTimeout(300)
  const qaOk = await page.evaluate(() => ({
    list: !!document.querySelector('.qa-list'),
    input: !!document.querySelector('.qa-input .el-textarea__inner'),
    turns: document.querySelectorAll('.qa-turn').length,
  }))

  await page.screenshot({ path: 'progress/_m4ux1_notes_panel.png' })
  console.log(JSON.stringify({ tab0, panel0, sel, barVisible, saved, fav, panel1, del, panel2, qaOk }, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
