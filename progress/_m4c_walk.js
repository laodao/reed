// M4-C 走查（重启后新 build）：Space 选区浮层/提问填充、笔记 IPC、设置组与 KB 选项、答疑收藏按钮
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const CONCEPT = '03f19637-d36a-4f8b-b0ba-c06799acc642' // 贝叶斯定理(有讲义)

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}`)
  await page.waitForTimeout(2000)

  // 选中树里的概念（讲义概念）：通过左侧树行文本点击
  await page.evaluate((cid) => {
    const row = [...document.querySelectorAll('.tree-row')].find((r) => r.textContent.includes('贝叶斯'))
    if (row) row.click()
  })
  await page.waitForTimeout(1200)

  // 1) 选区浮层：程序化选中讲义正文文字 → mouseup → 工具条出现；点「提问」填充输入框
  const sel = await page.evaluate(() => {
    const lesson = document.querySelector('.lesson-body')
    if (!lesson) return { err: 'no lesson body' }
    const walker = document.createTreeWalker(lesson, NodeFilter.SHOW_TEXT)
    let node = null
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.trim().length > 10) break
    }
    if (!node) return { err: 'no text node' }
    const textNode = node
    const r = document.createRange()
    r.setStart(textNode, 0)
    r.setEnd(textNode, Math.min(12, textNode.textContent.length))
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
    lesson.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return { selected: s.toString() }
  })
  await page.waitForTimeout(400)
  const bar = await page.evaluate(() => ({ visible: !!document.querySelector('.sel-bar'), text: document.querySelector('.sel-bar')?.textContent ?? '' }))
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sel-bar button')].find((b) => b.textContent.includes('提问'))
    btn?.click()
  })
  await page.waitForTimeout(300)
  const input = await page.evaluate(() => {
    const inner = document.querySelector('.pane-qa .el-textarea__inner')
    return inner ? (inner.value || '').slice(0, 40) : ''
  })

  // 2) 笔记 IPC 快速往返（selection 建→列→删）
  const note = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const created = await dl.createNote({ id: spaceId, conceptId: '03f19637-d36a-4f8b-b0ba-c06799acc642', source: 'selection', anchorText: '走查', contentMd: '测试笔记' })
    const list = await dl.listNotes({ id: spaceId })
    const del = created?.data?.note?.id ? await dl.deleteNote({ id: spaceId, noteId: created.data.note.id }) : null
    return { created: !!created?.data?.note, countBefore: list?.data?.total, deleted: !!del?.data?.ok }
  }, SPACE)

  // 3) 空间设置：打开设置，读组标题与知识库下拉选项/当前绑定
  const set = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.atlas-actions button, header button, .space-header button')].find((b) => b.textContent.includes('空间设置'))
    btn?.click()
    return !!btn
  })
  await page.waitForTimeout(600)
  const groups = await page.evaluate(() => [...document.querySelectorAll('.settings-body .set-title')].map((t) => t.textContent.trim()))
  const kb = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('.settings-body .el-select .el-option, .el-select-dropdown__item')].map((o) => o.textContent.trim())
    return { draft: (document.querySelector('.settings-body .el-input__inner')?.value ?? '') }
  })

  // 4) 答疑收藏按钮：切到已 answered 且概念匹配的概念（如贝叶斯）后读气泡区收藏按钮
  const fav = await page.evaluate(() => {
    const turn = [...document.querySelectorAll('.qa-turn')].find((t) => t.querySelector('.qa-fav'))
    return !!turn
  })

  console.log(JSON.stringify({ sel, bar, input, note, settingsOpened: set, groups, kbOptions: kb.opts || [], kbDraft: kb.draft, favVisible: fav }, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
