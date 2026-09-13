// M2-F 探测 6：环境出网能力（renderer fetch 直测代表性源）
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  const r = await page.evaluate(async () => {
    const urls = [
      'https://example.com',
      'https://export.arxiv.org/api/query?search_query=all:bayes&max_results=1',
      'https://zh.wikipedia.org/w/api.php?action=query&format=json&titles=%E5%85%88%E9%AA%8C%E6%A6%82%E7%8E%87',
    ]
    const out = {}
    for (const u of urls) {
      try {
        const ctl = new AbortController()
        const t = setTimeout(() => ctl.abort(), 8000)
        const resp = await fetch(u, { signal: ctl.signal })
        clearTimeout(t)
        out[u] = { status: resp.status, ok: resp.ok }
      } catch (e) {
        out[u] = { err: String(e).slice(0, 120) }
      }
    }
    return out
  })
  console.log(JSON.stringify(r, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
