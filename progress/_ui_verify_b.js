// B 段复核：历史页「查看产物」按钮（info/plain/circle）→ 抽屉列出 asset_* 产物
const { chromium } = require('playwright-core')
const DEF_ID = 'builtin_def_script-to-video-v2'
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const wait = (ms) => new Promise(r => setTimeout(r, ms))
  await p.evaluate(`location.hash = '#/workflow/runs/${DEF_ID}'`)
  await wait(2500)
  const info = await p.evaluate(`({
    rows: document.querySelectorAll('.el-table__body tr').length,
    artifactBtns: document.querySelectorAll('.el-table__body button.el-button--info.is-circle').length,
    runIdCell0: ((document.querySelector('.el-table__body tr') || {}).textContent || '').slice(0, 40),
  })`)
  console.log('B0 table:', JSON.stringify(info))
  // 点第一行「查看产物」
  await p.evaluate(`document.querySelector('.el-table__body button.el-button--info.is-circle').click()`)
  await wait(400)
  let drawer = null
  for (let i = 0; i < 10; i++) {
    drawer = await p.evaluate(`(() => {
      const d = document.querySelector('.el-drawer')
      if (!d) return null
      return {
        header: ((document.querySelector('.el-drawer__header') || {}).textContent || '').trim().slice(0, 60),
        bodyLen: d.textContent.length,
        assets: (d.textContent.match(/asset_[0-9a-z]+/g) || []).slice(0, 8),
        hasNames: ['脚本成片', '视频大纲', '素材板'].filter(x => d.textContent.includes(x)),
      }
    })()`)
    if (drawer && drawer.assets && drawer.assets.length) break
    await wait(700)
  }
  console.log('B1 drawer:', JSON.stringify(drawer))
  // 关闭抽屉
  await p.evaluate(`(() => { const b = Array.from(document.querySelectorAll('.el-drawer button')).find(x => x.className.includes('close')); if (b) b.click(); })()`).catch(() => {})
  await b.close()
  process.exit(drawer && drawer.assets && drawer.assets.length ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
