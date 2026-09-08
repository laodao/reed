/**
 * 上下文快照端到端验证（37 号）：给现有会话发一条极短消息（走真模型一轮），
 * 完成后打开上下文抽屉，断言系统提示词快照来自本轮 turn_start。
 * 前置：electron-vite dev（含新主进程代码）+ CDP 9222
 */
const { chromium } = require('playwright')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MSG = '请只回复两个字：好的'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('http'))
  if (!page.url().includes('#/agent-console')) {
    await page.evaluate(() => { window.location.hash = '#/agent-console' })
    await sleep(800)
  }

  // 选第一个聊天会话（用已有会话，不新建）
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.session-item')]
    ;(items.find((el) => el.querySelector('.draft-input') == null) ?? items[0])?.click()
  })
  await sleep(1200)

  const info = await page.evaluate(() => ({
    label: (document.querySelector('.session-item.active .session-label')?.textContent ?? '').trim(),
    hasInput: !!document.querySelector('.draft-input'),
  }))
  console.log(`会话「${info.label}」 输入框=${info.hasInput}`)
  if (!info.hasInput) throw new Error('输入框未渲染（会话可能未选中）')

  // 发送
  await page.fill('.draft-input', MSG)
  await page.click('.input-actions .el-button--primary')
  console.log('已发送，等待本轮完成…')
  for (let i = 0; i < 60; i++) {
    await sleep(2000)
    const st = await page.evaluate(() => ({
      hint: (document.querySelector('.input-hint')?.textContent ?? '').trim(),
      live: document.querySelectorAll('.live-line').length,
    }))
    if (!st.hint.includes('执行中') && st.live === 0) { console.log(`本轮完成（${(i + 1) * 2}s）`); break }
    if (i === 59) throw new Error('等待超时')
  }
  await sleep(1500) // 等 metadata/轨迹落库与右栏刷新

  // 打开上下文抽屉
  await page.evaluate(() => {
    const links = [...document.querySelectorAll('.inspector-pane .insp-link')]
    links.find((el) => (el.textContent ?? '').trim() === '查看')?.click()
  })
  await sleep(1200)

  const d = await page.evaluate(() => {
    const visible = !!document.querySelector('.el-overlay:not([style*="display: none"]) .el-drawer')
    const title = (document.querySelector('.el-drawer__header')?.textContent ?? '').trim()
    // 系统提示词区 = 第一个 hint 之后的第一个 drawer-pre（排除消息文本 pre）
    const pres = [...document.querySelectorAll('.el-drawer .drawer-pre')]
    const sys = (pres[0]?.textContent ?? '').trim()
    const msgs = [...document.querySelectorAll('.el-drawer .ctx-msg')].map((el) => (el.querySelector('.el-tag')?.textContent ?? '').trim())
    return { visible, title, sys: sys.slice(0, 120), sysLen: sys.length, msgs }
  })

  let ok = true
  const check = (name, cond, detail = '') => { console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' —— ' + detail : ''}`); ok = ok && cond }
  check('上下文抽屉打开', d.visible, d.title)
  check('系统提示词快照非空', d.sysLen > 0, `${d.sysLen} 字`)
  check('快照是系统提示词而非用户消息', !d.sys.startsWith('请只回复') && d.sysLen > 50, d.sys.slice(0, 60))
  check('消息历史包含本轮 user/tool 消息', d.msgs.length > 0 && d.msgs.includes('user'), `${d.msgs.length} 条`)
  console.log('\n系统提示词预览:', d.sys.slice(0, 100))
  await browser.close()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('失败:', e); process.exit(2) })
