/* UI 级驱动器：只做界面操作（点击/输入/读界面/截图），禁止一切 electronAPI 调用。
 * 用法：node scripts/ui-driver.cjs <cmd> [args...]
 *   url                     当前页面 URL 与标题
 *   snap                    ARIA 结构快照（截断输出）
 *   click <选择器>          点击（playwright 选择器，如 text=新建项目 / role=button[name="x"]）
 *   fill <选择器> <文本>    清空并输入
 *   press <键名>            按键（配合已聚焦元素）
 *   key <选择器> <键名>     点击后按键
 *   text <选择器>           读 innerText（第一个匹配）
 *   wait <选择器> <毫秒>    等待出现
 *   waitgone <选择器> <毫秒> 等待消失（如流式 loading）
 *   shot <文件名>           截图到 /tmp/ui-shots/
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('/home/ubuntu/workdir/the-bot/node_modules/playwright')

const SHOT_DIR = '/tmp/ui-shots'

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  if (!page) throw new Error('未找到应用页面')
  const sel = (s) => page.locator(s).first()

  if (cmd === 'url') {
    console.log(JSON.stringify({ url: page.url(), title: await page.title() }))
  } else if (cmd === 'snap') {
    const snap = await page.locator('body').ariaSnapshot()
    const limit = Number(args[0] || 6000)
    console.log(snap.length > limit ? snap.slice(0, limit) + `\n…[截断，共 ${snap.length}]` : snap)
  } else if (cmd === 'click') {
    await sel(args[0]).click({ timeout: 8000 })
    console.log('clicked', args[0])
  } else if (cmd === 'fill') {
    await sel(args[0]).fill(args[1] || '', { timeout: 8000 })
    console.log('filled', args[0], `${(args[1] || '').length} 字`)
  } else if (cmd === 'press') {
    await page.keyboard.press(args[0])
    console.log('pressed', args[0])
  } else if (cmd === 'key') {
    await sel(args[0]).click({ timeout: 8000 })
    await page.keyboard.press(args[1])
    console.log('clicked+pressed', args[0], args[1])
  } else if (cmd === 'text') {
    console.log(await sel(args[0]).innerText({ timeout: 8000 }))
  } else if (cmd === 'wait') {
    await sel(args[0]).waitFor({ state: 'visible', timeout: Number(args[1] || 8000) })
    console.log('visible', args[0])
  } else if (cmd === 'waitgone') {
    await sel(args[0]).waitFor({ state: 'detached', timeout: Number(args[1] || 30000) })
    console.log('gone', args[0])
  } else if (cmd === 'shot') {
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    const out = path.join(SHOT_DIR, args[0] || `shot-${Date.now()}.png`)
    await page.screenshot({ path: out, fullPage: false })
    console.log('shot ->', out)
  } else if (cmd === 'roomsay') {
    // 研讨室发言 v2：识别互斥 toast 自动重试；以「停止键消失+画布新增内容」为完成依据
    const text = fs.readFileSync(args[0], 'utf8')
    if (!page.url().includes('/room/')) {
      await page.getByText('研讨室 · 大宋女捕·研讨室版', { exact: true }).first().click()
      await page.waitForTimeout(1200)
    }
    const stop = page.getByRole('button', { name: '停止' })
    const pre = (await page.locator('main').innerText()).length
    let accepted = false
    for (let i = 0; i < 6 && !accepted; i++) {
      await page.getByRole('textbox').first().fill(text)
      await page.getByRole('button', { name: '发送' }).click()
      try { await stop.waitFor({ state: 'visible', timeout: 4000 }); accepted = true }
      catch {
        const toast = await page.locator('.el-message').allTextContents().catch(() => [])
        console.log(`[attempt ${i + 1}] 未进入流式，toast:`, toast.join(' | ').slice(0, 120))
        await page.waitForTimeout(20000)
      }
    }
    if (!accepted) throw new Error('发送 6 次均被拒绝（主编仍忙）')
    console.log('已进入流式…')
    await stop.waitFor({ state: 'detached', timeout: 900000 }).catch(() => {})
    let last = -1, stable = 0
    for (let i = 0; i < 80; i++) {
      const t = await page.locator('main').innerText()
      if (t.length > pre + 200 && t.length === last) { stable++; if (stable >= 2) break } 
      else stable = 0
      last = t.length
      await page.waitForTimeout(6000)
    }
    const t = await page.locator('main').innerText()
    console.log('画布长度:', t.length, '(发送前', pre + ')')
    console.log('=== 尾部 1200 字 ===')
    console.log(t.slice(-1200))
  } else {
    throw new Error('未知命令 ' + cmd)
  }
  await browser.close()
}

main().catch((e) => { console.error('UI-DRIVER FAILED:', String(e && e.message || e).slice(0, 400)); process.exit(1) })
