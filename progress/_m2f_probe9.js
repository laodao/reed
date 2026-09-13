// M2-F 探测 9：确认 qid 行 answered 状态（直接读取）
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const QID = 'q_1788878259712_7ddk5v'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  const out = await page.evaluate(async (a) => {
    const dl = window.electronAPI?.domainLearning
    const rows = (await dl.listQuestions(a.spaceId))?.data ?? []
    const row = rows.find((r) => r.id === a.qid) ?? null
    if (!row) return { found: false, total: rows.length }
    return { found: true, status: row.status, source: row.answerSource, answerHead: (row.answerMd ?? '').slice(0, 200) }
  }, { spaceId: SPACE, qid: QID })
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
