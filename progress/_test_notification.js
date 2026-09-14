// 通知中心 IPC 验证脚本
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const api = await page.evaluate(() => {
    const w = window
    const n = w.electronAPI && w.electronAPI.notification
    return { hasApi: !!n, keys: n ? Object.keys(n) : [] }
  })
  console.log('notification API:', JSON.stringify(api))
  if (!api.hasApi) { await browser.close(); return }

  const unread = await page.evaluate(() => window.electronAPI.notification.unreadCount())
  console.log('unreadCount:', JSON.stringify(unread))

  const list = await page.evaluate(() => window.electronAPI.notification.list({ page: 1, pageSize: 10, unreadFirst: true }))
  const d = list && list.data
  console.log('list:', JSON.stringify({ success: list && list.success, error: list && list.error, total: d && d.total, unread: d && d.unread, hasMore: d && d.hasMore, items: (d && d.items || []).map(i => ({ seq: i.seq, category: i.category, title: i.title, read: i.read, route: i.route, msg: (i.message || '').slice(0, 50) })) }, null, 2))
  await browser.close()
}
main().catch(e => { console.error(e.message); process.exit(1) })