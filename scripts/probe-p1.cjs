/** P1 验收：伏笔合成组 + progression 通道真机验证 */
const path = require('path')
const { chromium } = require('@playwright/test')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  const call = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
    return fn(window.electronAPI.longwriting, args)
  }, { expr, args })
  try {
    const created = await call('createProject', { name: `P1验收-${Date.now() % 10000}`, type: 'story' })
    const pid = created.data.id
    const list = await call('bibleList', pid)
    const fbGroup = (list.data || []).find((g) => g.kindKey === 'foreshadow')
    console.log('[p1] 伏笔组存在:', !!fbGroup, '| 条目:', fbGroup ? fbGroup.entries.length : 0)
    const groups = await call('bibleList', pid)
    const charGroup = (groups.data || []).find((g) => g.kindKey === 'character')
    console.log('[p1] 分组数:', groups.data.length, '| 人物组:', charGroup ? '有' : '无')
    // progression 通道（无数据也应 success）
    const prog = await call('bibleProgression', pid, 'character', 'no-such-id')
    console.log('[p1] progression success:', prog.success, '| states:', prog.data.states.length, 'events:', prog.data.events.length, 'relations:', prog.data.relations.length)
    // 真实项目（星际快递员等）若有人物，取第一个验证 progression 有数据形态
    const projects = await call('getProjects')
    const target = (projects.data || []).find((p) => p.id !== pid)
    if (target) {
      const chars = await call('getCharacters', target.id)
      if (Array.isArray(chars.data) && chars.data.length > 0) {
        const p2 = await call('bibleProgression', target.id, 'character', chars.data[0].id)
        console.log('[p1] 真实项目 progression:', p2.success, '| states:', p2.data.states.length, 'events:', p2.data.events.length, 'relations:', p2.data.relations.length)
      }
    }
    await call('deleteProject', pid)
    console.log('[p1] done')
  } catch (e) {
    console.error('[p1] FAILED:', e.message)
    process.exitCode = 1
  }
  process.exit(0)
})().catch((e) => { console.error(e.message); process.exit(1) })
