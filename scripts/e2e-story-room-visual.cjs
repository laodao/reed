/**
 * 故事研讨室可视化验收（42 号 M7b）
 * 前置：electron . --remote-debugging-port=9333 已运行（与 38 号脚本同一约定）。
 * 行为：新开独立窗口（不动既有窗口），创建一次性项目 → 种子账本+卡片 →
 * 打开研讨室截图（浅色/深色）→ 真实 LLM 研讨一轮 → 截图 → 删除项目 → 关窗。
 * 用法：node scripts/e2e-story-room-visual.cjs
 */
const path = require('path')
const { chromium } = require('@playwright/test')

const INDEX_HTML = path.resolve(__dirname, '../out/renderer/index.html')
const SHOT_DIR = path.resolve(__dirname, '../docs/screenshot')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const ctx = browser.contexts()[0]
  // 复用既有应用页面（Electron CDP 不支持 Target.createTarget——38 号同款）
  const page = ctx.pages().find((p) => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  page.setDefaultTimeout(60_000)

  const call = (expr, ...args) => page.evaluate(
    ({ expr, args }) => {
      const lw = window.electronAPI.longwriting
      const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
      return fn(lw, args)
    }, { expr, args })

  const url = (hash) => `file://${INDEX_HTML}${hash}`
  const shot = (name) => page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })

  try {
    // 0. 清理历史残留（前次运行可能超时未删）
    const all = await call('getProjects')
    if (all.success && Array.isArray(all.data)) {
      for (const pj of all.data) {
        if (String(pj.name || '').startsWith('视觉验收-研讨室-')) {
          await call('deleteProject', pj.id)
          console.log('[visual] 残留清理:', pj.id)
        }
      }
    }

    // 1. 一次性项目
    const created = await call('createProject', { name: `视觉验收-研讨室-${Date.now() % 10000}`, type: 'story' })
    if (!created.success) throw new Error('建项目失败: ' + created.error)
    const pid = created.data.id

    // 2. 种子房间状态：账本（含已定/已否决）+ 一张 pending 概要卡
    await call('updateProject', pid, {
      wizardState: {
        room: {
          ledger: [
            { id: 'ce_1', kind: 'premise', title: '主角动机 = 洗冤复仇', points: ['被冤偷宗门至宝', '对大师兄怀恨'], status: 'confirmed', sourceTurn: 1, updatedAt: 1 },
            { id: 'ce_2', kind: 'character', title: '大师兄 = 伪君子反派', points: [], status: 'tentative', sourceTurn: 2, updatedAt: 2 },
            { id: 'ce_3', kind: 'taboo', title: '开局无敌', points: [], status: 'rejected', sourceTurn: 2, updatedAt: 3 },
          ],
          summary: '',
          summarizedTurn: 0,
          turnNo: 3,
          phase: 'story-core',
          contentTarget: 'novel',
          pendingCards: [{
            id: 'card_v1', kind: 'overview', title: '概要卡 · 洗冤录',
            data: { title: '洗冤录', storyType: '玄幻', summary: '外门弟子林晓被冤偷窃宗门至宝逐出师门，十年后携真相归来。', coreConflict: '个人洗冤 vs 宗门秩序', hook: '开棺验尸，尸体竟是十年前的自己', estimatedChapters: 120 },
            status: 'pending', sourceTurns: [3], createdAt: Date.now(),
          }],
          cardSeq: 1,
        },
      },
    })

    // 3. 打开研讨室（reload 以加载最新 out/renderer——含 StoryRoom 路由）
    await page.evaluate((h) => { location.hash = h }, `#/longwriting/room/${pid}`)
    await page.reload()
    await page.waitForSelector('.artifact', { timeout: 20_000 })
    await page.waitForSelector('.artifact', { timeout: 15_000 })
    await page.waitForTimeout(800)
    await shot('story-room-01-overview.png')

    // 4. 真实 LLM 研讨一轮——走 UI 输入框（乐观气泡 + 流式 + done 全链路）
    const before = await call('roomHistory', pid)
    const beforeCount = before.data.messages.length
    await page.fill('.input-box', '我先定个基调：主角是被冤逐出的弟子，洗冤复仇为主线。你觉得这个故事最大的风险是什么？')
    await page.click('.send-btn')
    // 等主编回复真正落库（DOM 气泡可能是流中态；以 history 落库为准）
    let after = null
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(2000)
      after = await call('roomHistory', pid)
      const msgs = after.data.messages
      if (msgs.length >= beforeCount + 2 && msgs[msgs.length - 1].role === 'assistant') break
    }
    await page.waitForTimeout(1500)
    const lastMsg = after.data.messages[after.data.messages.length - 1]
    console.log('[visual] messages =', after.data.messages.length, '| 尾条角色 =', lastMsg.role,
      '| 尾条前 40 字 =', String(lastMsg.content).slice(0, 40).replace(/\n/g, ' '))
    await shot('story-room-02-chat.png')

    // 5. 深色模式
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(800)
    await shot('story-room-03-dark.png')
    await page.emulateMedia({ colorScheme: 'light' })

    // 6. 历史核对（账本落库）
    const history = await call('roomHistory', pid)
    console.log('[visual] ledger =', history.data.state.ledger.length,
      '| turnNo =', history.data.state.turnNo)

    // 7. 清理：删项目 + 把窗口送回首页（保持并行会话原状）
    await call('deleteProject', pid)
    await page.evaluate(() => { location.hash = '#/' })
    await page.reload()
    await page.waitForTimeout(1500)
    console.log('[visual] done, project removed, window restored')
  } catch (e) {
    console.error('[visual] FAILED:', e.message)
    try { await shot('story-room-99-failure.png') } catch { /* ignore */ }
    process.exitCode = 1
  } finally {
    // 借用的窗口绝不 close（page.close=关应用窗口！）；连接随进程退出自动断开
  }
})()
