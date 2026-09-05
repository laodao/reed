/**
 * 业务包 e2e：skills（技能库）—— 技能 list/create/get/resolve/update/forkBuiltin/remove
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

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用页面')

  let createdId = null, forkedId = null
  try {
    await step('1. skills.list → 返回技能数组且含内置技能', async () => {
      const r = await page.evaluate(() => window.electronAPI.skills.list())
      assert(r.success, `list 失败: ${JSON.stringify(r.error)}`)
      assert(Array.isArray(r.data) && r.data.length > 0, '技能列表为空')
      const builtin = r.data.filter(s => s.source === 'builtin')
      assert(builtin.length > 0, '无内置技能')
      console.log(`   共 ${r.data.length} 个技能（内置 ${builtin.length}）`)
    })

    await step('2. skills.create 创建 E2E 技能', async () => {
      const r = await page.evaluate(() => window.electronAPI.skills.create({
        name: 'e2e-test-skill',
        title: 'E2E-测试技能',
        description: 'E2E 插件架构验证用',
        category: 'test',
        body: '# E2E 测试技能\n\n这是 e2e 测试创建的技能正文。',
        inputs: [{ key: 'topic', label: '主题', type: 'string', required: true }]
      }))
      assert(r.success, `create 失败: ${JSON.stringify(r.error)}`)
      assert(r.data && r.data.id, '未返回 id')
      createdId = r.data.id
    })

    await step('3. skills.get 读取创建的技能', async () => {
      const r = await page.evaluate((id) => window.electronAPI.skills.get(id), createdId)
      assert(r.success && r.data && r.data.id === 'e2e-test-skill' && r.data.name === 'E2E-测试技能', JSON.stringify(r.error || r.data))
      assert(Array.isArray(r.data.inputs) && r.data.inputs.some(i => i.key === 'topic'), `inputs 未持久化: ${JSON.stringify(r.data.inputs)}`)
    })

    await step('4. skills.resolve 解析完整定义', async () => {
      const r = await page.evaluate((id) => window.electronAPI.skills.resolve(id), createdId)
      assert(r.success && r.data, JSON.stringify(r.error))
      assert(String(r.data.body || '').includes('e2e 测试创建'), 'resolve 正文不符')
    })

    await step('5. skills.update 更新描述', async () => {
      const r = await page.evaluate((id) => window.electronAPI.skills.update(id, { description: 'E2E-更新后的描述' }), createdId)
      assert(r.success && r.data && r.data.description === 'E2E-更新后的描述', JSON.stringify(r.error || r.data))
    })

    await step('6. skills.forkBuiltin 复制内置技能', async () => {
      const r = await page.evaluate(() => window.electronAPI.skills.list())
      const builtin = r.data.find(s => s.source === 'builtin')
      assert(builtin, '无内置技能可 fork')
      const f = await page.evaluate((id) => window.electronAPI.skills.forkBuiltin(id), builtin.id)
      assert(f.success && f.data && f.data.id, `fork 失败: ${JSON.stringify(f.error)}`)
      forkedId = f.data.id
    })

    await step('7. skills.remove 删除 fork 副本', async () => {
      const r = await page.evaluate((id) => window.electronAPI.skills.remove(id), forkedId)
      assert(r.success, JSON.stringify(r.error))
      forkedId = null
    })

    await step('8. skills.remove 删除 E2E 技能 + 列表复核', async () => {
      const r = await page.evaluate((id) => window.electronAPI.skills.remove(id), createdId)
      assert(r.success, JSON.stringify(r.error))
      createdId = null
      const l = await page.evaluate(() => window.electronAPI.skills.list())
      assert(!l.data.some(s => s.name === 'e2e-test-skill'), '删除后仍存在于列表')
    })
  } finally {
    // 兜底清理
    for (const id of [createdId, forkedId].filter(Boolean)) {
      await page.evaluate((id) => window.electronAPI.skills.remove(id).catch(() => {}), id)
    }
    await browser.close()
  }
  console.log(fails.length ? `\n失败 ${fails.length} 项:\n- ${fails.join('\n- ')}` : '\nskills 包测试全部通过')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1) })
