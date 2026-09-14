// ComfyUI H3 视频链路验证：提交 → 轮询 → 下载
// 用刚生成的本地图做首帧参考图（走 comfyui-video provider 同款请求形态）
const { chromium } = require('playwright-core')
const fs = require('fs')

// 读取刚生成的本地图 → base64（模拟 video-gen 节点传给 provider 的 data URL）
const img = 'C:/Users/daoge/the-bot/images/2026/09/06/img_1788680955564_0.png'
const b64 = fs.readFileSync(img).toString('base64')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  // 探测 video 相关 electronAPI
  const vkeys = await page.evaluate(() => {
    const root = window.electronAPI || {}
    return { video: Object.keys(root.video || {}), episode: Object.keys(root.episode || {}) }
  })
  console.log('video API:', JSON.stringify(vkeys))
  await browser.close()
}
main().catch(e => { console.error(e.message); process.exit(1) })