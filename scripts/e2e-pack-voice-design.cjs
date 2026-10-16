/**
 * 业务包 e2e：voice-design（声音设计）—— providers/voices/history/cloned-list 查询 + TTS（依赖 provider）
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

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用页面')

  let ttsRecordId = null
  try {
    await step('1. voice:providers 提供商列表', async () => {
      const r = await page.evaluate(() => window.electronAPI.voice.getProviders())
      assert(r.success && Array.isArray(r.data), JSON.stringify(r.error || r))
      console.log(`   ${r.data.length} 个语音提供商（configured: ${r.data.filter(p => p.configured).length}）`)
    })

    await step('2. voice:voices 发音人列表（全局 + 指定 provider）', async () => {
      const all = await page.evaluate(() => window.electronAPI.voice.getVoices())
      assert(all.success, `getVoices() 失败: ${JSON.stringify(all.error || all).slice(0, 200)}`)
      const byP = await page.evaluate((pid) => window.electronAPI.voice.getVoices(pid), PROVIDER_ID)
      assert(byP.success, `getVoices(provider) 失败: ${JSON.stringify(byP.error || byP).slice(0, 200)}`)
    })

    await step('3. voice:history 历史记录', async () => {
      const r = await page.evaluate(() => window.electronAPI.voice.history({ page: 1, pageSize: 10 }))
      assert(r.success, JSON.stringify(r.error || r))
    })

    await step('4. voice:cloned-list 复刻声音列表', async () => {
      const r = await page.evaluate(() => window.electronAPI.voice.getClonedVoices())
      assert(r.success, JSON.stringify(r.error || r))
      const f = await page.evaluate(() => window.electronAPI.voice.getClonedVoices('ready'))
      assert(f.success, JSON.stringify(f.error || f))
    })

    await step('5. voice:tts 文本转语音（真实 provider）', async () => {
      // 取一个可用 voiceId
      const v = await page.evaluate((pid) => window.electronAPI.voice.getVoices(pid), PROVIDER_ID)
      const voices = v.data || v.voices || []
      assert(voices.length > 0, '该 provider 无可用发音人')
      const voiceId = voices[0].id || voices[0].voiceId
      const r = await page.evaluate(({ vid, pid }) => window.electronAPI.voice.tts({
        text: 'E2E 测试语音', voiceId: vid, providerId: pid, language: 'zh'
      }), { vid: voiceId, pid: PROVIDER_ID })
      assert(r.success, `tts 失败: ${JSON.stringify(r.error || r).slice(0, 300)}`)
      const rec = r.data || r.record || r
      ttsRecordId = rec.id || null
    }, true) // TTS 依赖 provider 额度，失败按环境记

    await step('6. voice:toggle-favorite + delete 清理 TTS 记录', async () => {
      if (!ttsRecordId) {
        // 没有新记录则对历史第一条做幂等验证（不改数据则跳过）
        console.log('   无 TTS 新记录（步骤5未成功），跳过')
        return
      }
      const f = await page.evaluate((id) => window.electronAPI.voice.toggleFavorite(id), ttsRecordId)
      assert(f.success, `toggleFavorite 失败: ${JSON.stringify(f.error || f)}`)
      const d = await page.evaluate((id) => window.electronAPI.voice.delete(id), ttsRecordId)
      assert(d.success, `delete 失败: ${JSON.stringify(d.error || d)}`)
      ttsRecordId = null
    })
  } finally {
    if (ttsRecordId) await page.evaluate((id) => window.electronAPI.voice.delete(id).catch(() => {}), ttsRecordId)
    await browser.close()
  }
  console.log(fails.length ? `\n失败 ${fails.length} 项:\n- ${fails.join('\n- ')}` : '\nvoice-design 包测试全部通过')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1) })
