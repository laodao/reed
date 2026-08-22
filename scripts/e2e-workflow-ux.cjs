/**
 * 工作流使用体验改进 E2E（本批 4 点）：
 * 1. start 节点控件类型：新增「多行文本」（编辑器可选 + 运行表单渲染 textarea）
 * 2. start 输入校验：必填之外支持 minLength/maxLength/pattern/min/max（前端提示 + 服务端兜底）
 * 3. 组件边界：组件面板不再出现「长文·生成章节 / 长文·润色」黑盒节点
 * 4. 变量选择器统一：所有 text/textarea 字段默认提供「✕变量」选择器 + 支持{{}}角标
 */
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const DB_PATH = path.join('C:\\Users\\daoge\\the-bot', 'the_bot.db')
const BASE = 'http://localhost:5173'

function queryDb(sql, params = []) {
  const db = new DatabaseSync(DB_PATH)
  try { return db.prepare(sql).all(...params) } finally { db.close() }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // 找一个画布可用的工作流（含 start 节点即可）
  const def = queryDb("SELECT id, name FROM workflow_definitions WHERE name='数据分析请求' LIMIT 1")[0]
    || queryDb('SELECT id, name FROM workflow_definitions ORDER BY updated_at DESC LIMIT 1')[0]
  assert(def, '找不到可用工作流定义')
  const llmDef = queryDb("SELECT id, name FROM workflow_definitions WHERE draft_graph LIKE '%llm-chat%' LIMIT 1")[0]

  // ── 3. 组件面板无长文节点 ──
  await step('组件面板：不出现「长文·生成章节 / 长文·润色」，保留「开始」等常规组件', async () => {
    await page.goto(`${BASE}/#/workflow/editor/${def.id}`)
    await page.waitForTimeout(1800)
    const palette = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.palette-item')).map(e => e.textContent.trim()))
    assert(palette.length > 5, `组件面板条目过少（${palette.length}）`)
    assert(!palette.some(t => t.includes('长文')), `组件面板仍含长文节点: ${palette.filter(t => t.includes('长文'))}`)
    assert(palette.some(t => t.startsWith('开始')), '组件面板应有「开始」')
    assert(palette.some(t => t.startsWith('LLM 对话')), '组件面板应有「LLM 对话」')
    console.log(`   组件 ${palette.length} 个，无长文节点`)
  })

  // ── 1. start 节点 inputs-list：多行文本类型 + 校验按钮 ──
  await step('开始节点配置：类型可选「多行文本」，每行有「校验」配置入口', async () => {
    const clicked = await page.evaluate(() => {
      const node = Array.from(document.querySelectorAll('.wf-node')).find(e => e.textContent.includes('开始'))
      if (!node) return false
      node.click()
      return true
    })
    assert(clicked, '画布上没有 start 节点')
    await page.waitForTimeout(700)
    const ui = await page.evaluate(() => {
      const panel = document.querySelector('.config-area')
      const html = panel?.textContent ?? ''
      return {
        hasInputsList: html.includes('输入参数'),
        hasValidationBtn: html.includes('校验'),
        hasTypeSelect: !!panel?.querySelector('.input-card .el-select'),
      }
    })
    assert(ui.hasInputsList && ui.hasTypeSelect, `配置面板缺 inputs-list（${JSON.stringify(ui)}）`)
    assert(ui.hasValidationBtn, 'inputs-list 每行应有「校验」配置入口')
    const hasTextarea = await page.evaluate(async () => {
      const sel = document.querySelector('.input-card .el-select')
      if (!sel) return false
      sel.click()
      await new Promise(r => setTimeout(r, 400))
      const items = Array.from(document.querySelectorAll('.el-select-dropdown__item')).map(e => e.textContent.trim())
      document.body.click()
      return items.includes('多行文本')
    })
    assert(hasTextarea, '类型下拉缺少「多行文本」选项')
    console.log('   类型下拉含「多行文本」；每行有校验按钮')
  })

  // ── 4. 变量选择器统一：llm-chat 的文本字段都有「✕变量」+ 支持{{}}角标 ──
  if (llmDef) {
    await step('变量选择器：LLM 节点的文本字段提供「✕变量」与支持{{}}角标', async () => {
      await page.goto(`${BASE}/#/workflow/editor/${llmDef.id}`)
      await page.waitForTimeout(1800)
      const clicked = await page.evaluate(() => {
        // llm-chat 节点可能被改过显示名；按画布摘要里含「整理」/「生成」/「对话」等关键词匹配，失败则点含「风格」的节点
        const node = Array.from(document.querySelectorAll('.wf-node')).find(e => {
          const t = e.textContent ?? ''
          return t.includes('整理') || t.includes('LLM') || t.includes('对话')
        })
        if (!node) return false
        node.click()
        return true
      })
      assert(clicked, '画布上没有 LLM 节点')
      await page.waitForTimeout(700)
      const ui = await page.evaluate(() => {
        const panel = document.querySelector('.config-area')
        const html = panel?.textContent ?? ''
        return {
          hasPicker: html.includes('✕变量'),
          hasTplTag: html.includes('支持'),
          hasPromptLabel: html.includes('系统提示词'),
        }
      })
      assert(ui.hasPromptLabel, '未选中 LLM 节点配置')
      assert(ui.hasPicker && ui.hasTplTag, `文本字段缺变量选择器/角标（picker=${ui.hasPicker} tag=${ui.hasTplTag}）`)
      console.log('   系统提示词/用户消息字段均有变量选择器 + 支持{{}}角标')
    })
  } else {
    console.log('   ⚠ 无 llm-chat 工作流，跳过变量选择器检查')
  }

  // ── 1/2. 导入新版 translate-app 模板 → 编辑器试运行：textarea 渲染 + 校验 ──
  let importedId = null
  let importedName = ''
  await step('导入新版「文档翻译」模板（textarea + 长度校验）', async () => {
    const r = await page.evaluate(async () => {
      const content = await (await fetch('/src/assets/workflow-templates/translate-app.json')).text()
      return await window.electronAPI.workflow.importDefinition({ content, duplicatePolicy: 'copy' })
    })
    assert(r.success, `导入失败: ${r.error}`)
    importedId = r.data.id
    importedName = r.data.name
    // 结构断言：start inputs 含 textarea + validation
    const def = await page.evaluate(async (id) => {
      return await window.electronAPI.workflow.getDefinition(id)
    }, importedId)
    const inputs = def.data.draftGraph?.nodes?.find(n => n.type === 'start')?.config?.inputs ?? []
    const text = inputs.find(i => i.key === 'text')
    assert(text?.type === 'textarea', `text 输入类型应为 textarea（实际 ${text?.type}）`)
    assert(text.validation?.maxLength === 5000, `text 应带 maxLength=5000 校验（实际 ${JSON.stringify(text.validation)}）`)
    console.log(`   导入 ${importedName}（${importedId}）：text=textarea + maxLength=5000`)
  })

  await step('编辑器试运行表单：多行文本渲染 + 必填/长度角标 + 超长拦截', async () => {
    await page.goto(`${BASE}/#/workflow/editor/${importedId}`)
    await page.waitForTimeout(1800)
    await page.click('button:has-text("试运行")')
    await page.waitForTimeout(900)
    const info = await page.evaluate(() => {
      const drawer = document.querySelector('.el-drawer')
      if (!drawer) return { missing: true }
      const label = drawer.querySelector('.el-form-item__label')?.textContent ?? ''
      const textarea = drawer.querySelector('textarea')
      const tags = Array.from(drawer.querySelectorAll('.el-form-item__label .el-tag')).map(e => e.textContent.trim())
      return { missing: false, label, hasTextarea: !!textarea, tags }
    })
    assert(!info.missing, '试运行抽屉未打开')
    assert(info.hasTextarea, '「待翻译内容」应渲染为多行文本框')
    assert(info.tags.includes('必填') && info.tags.includes('1-5000 字'), `角标缺失（${info.tags.join(',')}）`)
    // 输入超长文本 → 错误提示 + 开始按钮禁用
    const err = await page.evaluate(async (longText) => {
      const drawer = document.querySelector('.el-drawer')
      const textarea = drawer.querySelector('textarea')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(textarea, longText)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('blur', { bubbles: true }))
      await new Promise(r => setTimeout(r, 300))
      const errEl = drawer.querySelector('.el-form-item__error')
      const btn = drawer.querySelector('.el-button--primary')
      return {
        errText: errEl?.textContent ?? '',
        btnDisabled: btn ? btn.disabled : null,
      }
    }, '长'.repeat(6000))
    assert(err.errText.includes('最多 5000 个字符'), `超长未提示（${err.errText}）`)
    assert(err.btnDisabled === true, `超长时开始按钮应禁用（disabled=${err.btnDisabled}）`)
    console.log(`   多行文本 ✅ 角标 ✅ 超长提示「${err.errText}」+ 按钮禁用 ✅`)
    // 关闭抽屉
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  // ── 2. 服务端兜底校验：超长文本被拒；合法文本正常启动 ──
  await step('服务端启动校验：超长 text 被拒，合法 text 正常启动', async () => {
    const r = await page.evaluate(async ({ defId, longText }) => {
      const wf = window.electronAPI.workflow
      const bad = await wf.startRun({ definitionId: defId, inputs: { text: longText, targetLang: 'zh', sourceLang: '' } })
      return { bad }
    }, { defId: importedId, longText: 'x'.repeat(6000) })
    assert(!r.bad.success && String(r.bad.error).includes('超出长度'), `超长应被服务端拒绝（${JSON.stringify(r.bad)?.slice(0, 200)}）`)
    console.log(`   超长被拒：${r.bad.error}`)
    const ok = await page.evaluate(async ({ defId }) => {
      const wf = window.electronAPI.workflow
      return await wf.startRun({ definitionId: defId, inputs: { text: 'Hello world', targetLang: 'zh', sourceLang: '' } })
    }, { defId: importedId })
    assert(ok.success, `合法文本应正常启动（${ok.error}）`)
    console.log(`   合法文本启动成功 run=${ok.data?.id} status=${ok.data?.status}`)
    // 清理：删除本次运行产生的「翻译结果」资产
    await page.evaluate(async () => {
      const assets = window.electronAPI.assets
      const list = await assets.list({ keyword: '翻译结果', page: 1, pageSize: 20 })
      for (const a of list.success ? (list.data.items ?? []) : []) {
        if (a.name === '翻译结果') await assets.delete(a.id)
      }
    })
  })

  // ── 清理：删除导入的测试定义 ──
  await step('清理：删除导入的测试定义', async () => {
    const r = await page.evaluate(async (id) => {
      return await window.electronAPI.workflow.deleteDefinition(id)
    }, importedId)
    assert(r.success || String(r.error).includes('不存在'), `清理失败: ${r.error}`)
    console.log(`   已删除 ${importedName}（${importedId}）`)
  })

  console.log('\n===== 工作流体验改进 E2E 全部通过 ✅ =====')
  await browser.close()
})().catch(e => { console.error('\nE2E 失败:', e.message); process.exit(1) })
