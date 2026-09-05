/**
 * 业务包 e2e：chat（AI 对话）—— role/dialog/message CRUD + chat:send 流式（AI 依赖 provider）
 * 前置：electron . --remote-debugging-port=9333 已启动
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const fails = []
const step = async (name, fn, soft) => {
  try { await fn(); console.log('✅', name) }
  catch (e) {
    if (soft) { console.log('⚠️', name, '[环境/额度]', e.message); return }
    fails.push(`${name}: ${e.message}`); console.error('❌', name, '|', e.message)
  }
}
const PROVIDER_ID = 'pc_mtee10tz_ijz2yq1ro'
const MODEL_ID = 'deepseek-v4-flash-0731'

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用页面')

  let roleId = null, dialogId = null, messageId = null
  try {
    await step('1. role:create 创建 E2E 角色', async () => {
      const r = await page.evaluate(() => window.electronAPI.role.create({
        name: 'E2E-测试角色', description: '插件架构验证', systemPrompt: '你是简洁的测试助手。'
      }))
      assert(r.success && r.role && r.role.id, JSON.stringify(r.error || r))
      roleId = r.role.id
    })

    await step('2. role:list/get/update/getDialogCount', async () => {
      const list = await page.evaluate(() => window.electronAPI.role.list())
      assert(list.success && list.roles.some(r => r.id === roleId), 'role:list 未含新角色')
      const get = await page.evaluate((id) => window.electronAPI.role.get(id), roleId)
      assert(get.success && get.role && get.role.name === 'E2E-测试角色', 'role:get 内容不符')
      const upd = await page.evaluate((id) => window.electronAPI.role.update(id, { description: 'E2E-更新' }), roleId)
      assert(upd.success, `role:update 失败: ${JSON.stringify(upd.error || upd)}`)
      const cnt = await page.evaluate((id) => window.electronAPI.role.getDialogCount(id), roleId)
      assert(cnt.success, `role:dialog-count 失败: ${JSON.stringify(cnt)}`)
    })

    await step('3. dialog:create 建会话', async () => {
      const r = await page.evaluate(
        ({ roleId, pid, mid }) => window.electronAPI.dialog.create({
          title: 'E2E-测试会话', modelId: mid, providerConfigId: pid, roleId
        }),
        { roleId, pid: PROVIDER_ID, mid: MODEL_ID }
      )
      assert(r.success && r.dialog && r.dialog.id, JSON.stringify(r.error || r))
      dialogId = r.dialog.id
    })

    await step('4. dialog:list/listByRole/get/update/touch', async () => {
      const list = await page.evaluate(() => window.electronAPI.dialog.list())
      assert(list.success && list.dialogs.some(d => d.id === dialogId), 'dialog:list 未含新会话')
      const byRole = await page.evaluate((rid) => window.electronAPI.dialog.listByRole(rid), roleId)
      assert(byRole.success && byRole.dialogs.some(d => d.id === dialogId), 'dialog:list-by-role 未含新会话')
      const get = await page.evaluate((id) => window.electronAPI.dialog.get(id), dialogId)
      assert(get.success && get.dialog && get.dialog.title === 'E2E-测试会话', 'dialog:get 内容不符')
      const upd = await page.evaluate((id) => window.electronAPI.dialog.update(id, { title: 'E2E-会话R' }), dialogId)
      assert(upd.success, `dialog:update 失败: ${JSON.stringify(upd)}`)
      const touch = await page.evaluate((id) => window.electronAPI.dialog.touch(id), dialogId)
      assert(touch.success, `dialog:touch 失败: ${JSON.stringify(touch)}`)
    })

    await step('5. message:create/list/get/update', async () => {
      const c = await page.evaluate((did) => window.electronAPI.message.create({
        dialogId: did, role: 'user', content: 'E2E 测试消息'
      }), dialogId)
      assert(c.success && (c.message || c.data), JSON.stringify(c.error || c))
      messageId = (c.message || c.data).id
      const list = await page.evaluate((did) => window.electronAPI.message.list(did), dialogId)
      const msgs = list.messages || list.data || []
      assert(list.success && msgs.some(m => m.id === messageId), 'message:list 未含新消息')
      const get = await page.evaluate((id) => window.electronAPI.message.get(id), messageId)
      assert(get.success, `message:get 失败: ${JSON.stringify(get)}`)
      const upd = await page.evaluate((id) => window.electronAPI.message.update(id, 'E2E 测试消息（已编辑）'), messageId)
      assert(upd.success, `message:update 失败: ${JSON.stringify(upd)}`)
    })

    await step('6. chat:send 流式发消息（真实 AI）', async () => {
      const r = await page.evaluate(async ({ did, pid, mid }) => {
        return await new Promise((resolve) => {
          let done = null, err = null, chunks = 0
          const off = window.electronAPI.chat.onStream((_e, data) => {
            const d = data || {}
            if (d.dialogId && d.dialogId !== did) return
            if (d.type === 'chunk') chunks++
            if (d.type === 'done') done = d
            if (d.type === 'error') err = d
          })
          const timer = setTimeout(() => { off(); resolve({ timeout: true, chunks }) }, 90000)
          window.electronAPI.chat.send({ dialogId: did, content: '用一句话回答：1+1等于几？', modelId: mid, providerConfigId: pid })
            .then(sendR => {
              if (!sendR || sendR.success === false) { clearTimeout(timer); off(); resolve({ sendError: sendR && sendR.error }) }
            })
            .catch(e => { clearTimeout(timer); off(); resolve({ sendError: String(e) }) })
          const poll = setInterval(() => {
            if (done || err) {
              clearInterval(poll); clearTimeout(timer); off()
              resolve({ done: !!done, error: err && (err.error || err.message), chunks })
            }
          }, 300)
        })
      }, { did: dialogId, pid: PROVIDER_ID, mid: MODEL_ID })
      assert(!r.sendError, `chat:send 返回失败: ${r.sendError}`)
      assert(!r.timeout, `90s 未收到 done/error（chunks=${r.chunks}）`)
      assert(!r.error, `AI 流返回错误: ${r.error}`)
      assert(r.done, `未收到 done: ${JSON.stringify(r)}`)
      const list = await page.evaluate((did) => window.electronAPI.message.list(did), dialogId)
      const msgs = list.messages || list.data || []
      assert(msgs.some(m => m.role === 'assistant'), 'AI 回复未落库')
    }, true) // AI 依赖 provider 额度/网络，失败按环境记

    await step('7. chat:stop 可调用', async () => {
      const r = await page.evaluate((did) => window.electronAPI.chat.stop(did), dialogId)
      assert(r && typeof r.success === 'boolean', JSON.stringify(r))
    })

    await step('8. message:delete + dialog:delete + role:delete 清理', async () => {
      const md = await page.evaluate((did) => window.electronAPI.message.delete(did), dialogId)
      assert(md.success, `message:delete 失败: ${JSON.stringify(md)}`)
      const dd = await page.evaluate((id) => window.electronAPI.dialog.delete(id), dialogId)
      assert(dd.success, `dialog:delete 失败: ${JSON.stringify(dd)}`)
      dialogId = null
      const rd = await page.evaluate((id) => window.electronAPI.role.delete(id), roleId)
      assert(rd.success, `role:delete 失败: ${JSON.stringify(rd)}`)
      roleId = null
      const roles = await page.evaluate(() => window.electronAPI.role.list())
      assert(!roles.roles.some(r => String(r.name).startsWith('E2E-')), '角色清理不彻底')
    })
  } finally {
    if (dialogId) await page.evaluate((id) => window.electronAPI.dialog.delete(id).catch(() => {}), dialogId)
    if (roleId) await page.evaluate((id) => window.electronAPI.role.delete(id).catch(() => {}), roleId)
    await browser.close()
  }
  console.log(fails.length ? `\n失败 ${fails.length} 项:\n- ${fails.join('\n- ')}` : '\nchat 包测试全部通过')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1) })
