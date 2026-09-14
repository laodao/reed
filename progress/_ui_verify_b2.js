// B 复核 2：从多个 el-drawer 中找「运行产物」抽屉
const { chromium } = require('playwright-core')
const DEF_ID = 'builtin_def_script-to-video-v2'
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const wait = (ms) => new Promise(r => setTimeout(r, ms))
  await p.evaluate(`location.hash = '#/workflow/runs/${DEF_ID}'`)
  await wait(2500)
  await p.evaluate(`document.querySelector('.el-table__body button.el-button--info.is-circle').click()`)
  await wait(500)
  let found = null
  for (let i = 0; i < 12; i++) {
    const drawers = await p.evaluate(`Array.from(document.querySelectorAll('.el-drawer')).map(d => ({
      header: ((d.querySelector('.el-drawer__header') || {}).textContent || '').trim().slice(0, 50),
      assets: (d.textContent.match(/asset_[0-9a-z]+/g) || []).slice(0, 8),
      names: ['脚本成片', '视频大纲', '素材板'].filter(x => d.textContent.includes(x)),
    }))`)
    found = drawers.find(d => d.header.includes('运行产物'))
    if (found && found.assets && found.assets.length) break
    await wait(700)
  }
  console.log('B drawers:', JSON.stringify(found || 'not-found'))
  await b.close()
  process.exit(found && found.assets && found.assets.length ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
