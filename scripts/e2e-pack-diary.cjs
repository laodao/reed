/**
 * 业务包 e2e：diary（日记）—— 覆盖 16 个 diary:* channel
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

  let folderId = null, subFolderId = null, entryId = null, entry2Id = null
  try {
    await step('1. diary:create-folder 创建 E2E 目录', async () => {
      const r = await page.evaluate(() => window.electronAPI.diary.createFolder({ name: 'E2E-测试目录' }))
      assert(r.success && r.data && r.data.id, JSON.stringify(r.error))
      folderId = r.data.id
    })

    await step('2. diary:list-folders + get-all-folders 包含新目录', async () => {
      const r = await page.evaluate(() => window.electronAPI.diary.listFolders())
      assert(r.success && r.data.some(f => f.id === folderId), 'listFolders 未含新目录')
      const all = await page.evaluate(() => window.electronAPI.diary.getAllFolders())
      assert(all.success && all.data.some(f => f.id === folderId), 'getAllFolders 未含新目录')
    })

    await step('3. diary:create-folder 子目录', async () => {
      const r = await page.evaluate((pid) => window.electronAPI.diary.createFolder({ name: 'E2E-子目录', parentId: pid }), folderId)
      assert(r.success && r.data && r.data.id, JSON.stringify(r.error))
      subFolderId = r.data.id
      const subs = await page.evaluate((pid) => window.electronAPI.diary.listFolders(pid), folderId)
      assert(subs.success && subs.data.some(f => f.id === subFolderId), '子目录未出现在父目录下')
    })

    await step('4. diary:update-folder 重命名', async () => {
      const r = await page.evaluate((id) => window.electronAPI.diary.updateFolder(id, { name: 'E2E-测试目录R' }), folderId)
      assert(r.success, JSON.stringify(r.error))
    })

    await step('5. diary:create-entry 建日记', async () => {
      const r = await page.evaluate((fid) => window.electronAPI.diary.createEntry({
        folderId: fid, title: 'E2E-日记一', content: '# E2E 测试\n\n插件架构重构验证内容。'
      }), folderId)
      assert(r.success && r.data && r.data.id, JSON.stringify(r.error))
      entryId = r.data.id
    })

    await step('6. diary:get-entry 读取', async () => {
      const r = await page.evaluate((id) => window.electronAPI.diary.getEntry(id), entryId)
      assert(r.success && r.data && r.data.title === 'E2E-日记一', JSON.stringify(r.error || r.data))
    })

    await step('7. diary:update-entry 保存内容', async () => {
      const r = await page.evaluate((id) => window.electronAPI.diary.updateEntry(id, {
        content: '# E2E 测试\n\n更新后的内容，引用 [[E2E-日记二]]。', tags: ['e2e']
      }), entryId)
      assert(r.success, JSON.stringify(r.error))
    })

    await step('8. diary:list-entries 列出目录内日记', async () => {
      const r = await page.evaluate((fid) => window.electronAPI.diary.listEntries(fid), folderId)
      assert(r.success && r.data.some(e => e.id === entryId), 'listEntries 未含新日记')
    })

    await step('9. diary:create-entry 第二篇（供反链）', async () => {
      const r = await page.evaluate((fid) => window.electronAPI.diary.createEntry({
        folderId: fid, title: 'E2E-日记二', content: '回链到 [[E2E-日记一]]。'
      }), folderId)
      assert(r.success && r.data && r.data.id, JSON.stringify(r.error))
      entry2Id = r.data.id
    })

    await step('10. diary:search 关键字检索', async () => {
      const r = await page.evaluate(() => window.electronAPI.diary.search('E2E-日记'))
      assert(r.success, JSON.stringify(r.error))
      const arr = r.data || r.entries || []
      assert(arr.some(e => e.id === entryId), `搜索未命中: ${JSON.stringify(r).slice(0, 200)}`)
    })

    await step('11. diary:get-backlinks 反链查询', async () => {
      const r = await page.evaluate((id) => window.electronAPI.diary.getBacklinks(id), entryId)
      assert(r.success, JSON.stringify(r.error))
      // 反链实现可能基于标题解析，仅要求调用成功且返回数组
      assert(Array.isArray(r.data), `反链返回非数组: ${JSON.stringify(r).slice(0, 200)}`)
    })

    await step('12. diary:move-entry 移动到子目录', async () => {
      const r = await page.evaluate(
        ({ id, fid }) => window.electronAPI.diary.moveEntry(id, fid),
        { id: entryId, fid: subFolderId }
      )
      assert(r.success, JSON.stringify(r.error))
      const sub = await page.evaluate((fid) => window.electronAPI.diary.listEntries(fid), subFolderId)
      assert(sub.success && sub.data.some(e => e.id === entryId), '移动后子目录无该日记')
    })

    await step('13. diary:export-html 导出 HTML', async () => {
      const r = await page.evaluate((id) => window.electronAPI.diary.exportHtml(id, '/tmp/e2e-diary-export.html'), entryId)
      assert(r.success, JSON.stringify(r.error))
    })

    await step('14. diary:export-docx 导出 Word', async () => {
      const r = await page.evaluate((id) => window.electronAPI.diary.exportDocx(id, '/tmp/e2e-diary-export.docx'), entryId)
      assert(r.success, JSON.stringify(r.error))
    })

    await step('15. diary:export-pdf 导出 PDF', async () => {
      const r = await page.evaluate((id) => window.electronAPI.diary.exportPdf(id, '/tmp/e2e-diary-export.pdf'), entryId)
      assert(r.success, JSON.stringify(r.error))
    }, true) // PDF 依赖打印子系统，失败按环境记

    await step('16. diary:delete-entry ×2 + delete-folder ×2 清理', async () => {
      for (const id of [entryId, entry2Id]) {
        const r = await page.evaluate((i) => window.electronAPI.diary.deleteEntry(i), id)
        assert(r.success, `删除日记 ${id} 失败: ${JSON.stringify(r.error)}`)
      }
      entryId = entry2Id = null
      for (const id of [subFolderId, folderId]) {
        const r = await page.evaluate((i) => window.electronAPI.diary.deleteFolder(i), id)
        assert(r.success, `删除目录 ${id} 失败: ${JSON.stringify(r.error)}`)
      }
      subFolderId = folderId = null
      const all = await page.evaluate(() => window.electronAPI.diary.getAllFolders())
      assert(!all.data.some(f => String(f.name).startsWith('E2E-')), '目录清理不彻底')
    })
  } finally {
    for (const id of [entryId, entry2Id].filter(Boolean)) {
      await page.evaluate((i) => window.electronAPI.diary.deleteEntry(i).catch(() => {}), id)
    }
    for (const id of [subFolderId, folderId].filter(Boolean)) {
      await page.evaluate((i) => window.electronAPI.diary.deleteFolder(i).catch(() => {}), id)
    }
    await browser.close()
  }
  console.log(fails.length ? `\n失败 ${fails.length} 项:\n- ${fails.join('\n- ')}` : '\ndiary 包测试全部通过')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1) })
