/**
 * E2E 真实业务测试 #2：人像制作真实流程
 * 建项目(E2E真实-人像) → 建角色 → 真实生成一张人像（复用 #1 成功的火山 Seedream-5.0-pro，仅 front 单角度控成本）
 * 验证：variant 落库 + 图片文件真实存在且 magic bytes 有效
 * 输出 PORTRAIT_RESULT=... 供后续复用
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_PATH = path.join(os.homedir(), '.config/the_bot')
const PROVIDER = { providerConfigId: 'pc_mtefri7z_gmou93g8m', model: 'ep-20260804233757-mpnsg' }

function magicOk(buf) {
  if (buf.length < 12) return false
  const hex = buf.subarray(0, 12).toString('hex')
  return hex.startsWith('89504e47') || hex.startsWith('ffd8ff') || hex.startsWith('47494638') ||
    (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250')
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')

  // 建项目
  const proj = await page.evaluate(() => window.electronAPI.portrait.createProject({ name: 'E2E真实-人像', description: 'e2e 真实流程测试' }))
  if (!proj.success) throw new Error('建项目失败: ' + JSON.stringify(proj.error))
  const projectId = proj.data.id
  console.log('项目:', projectId)

  // 建角色
  const ch = await page.evaluate((p) => window.electronAPI.portrait.createCharacter({
    projectId: p, name: '林小满', gender: 'female', age: 22, height: 165, weight: 48, race: 'asian',
    description: 'E2E真实测试角色：短黑发、圆脸的年轻女性',
  }), projectId)
  if (!ch.success) throw new Error('建角色失败: ' + JSON.stringify(ch.error))
  const characterId = ch.data.id
  console.log('角色:', characterId)

  // 真实生成（仅 front 单角度，1 张图）
  const gen = await page.evaluate(async ({ characterId, provider }) => {
    try {
      return await window.electronAPI.portrait.generate({
        characterId,
        prompt: 'young Asian woman, short black hair, round face, gentle smile, casual white shirt',
        providerId: provider.providerConfigId,
        modelId: provider.model,
        config: { angles: ['front'], backgroundType: 'solid', backgroundColor: '#FFFFFF', width: 1024, height: 1024 },
      })
    } catch (e) { return { success: false, error: String(e && e.message || e) } }
  }, { characterId, provider: PROVIDER })
  console.log('生成返回:', JSON.stringify(gen).slice(0, 500))

  if (!gen.success) {
    console.error('❌ 人像生成失败:', gen.error)
    console.log('PORTRAIT_RESULT=null')
    await browser.close(); process.exit(1)
  }

  // 验证变体
  const variants = await page.evaluate((cid) => window.electronAPI.portrait.listVariants(cid), characterId)
  const vlist = variants.success ? variants.data : []
  console.log('变体数:', vlist.length)
  const v = vlist[0]
  if (!v) { console.error('❌ 无变体'); await browser.close(); process.exit(1) }

  // imagePath 可能是相对路径（存库）或 local-image:// URL；DB 里 portrait_variants.image_path 是实际存储值
  const { execSync } = require('child_process')
  const row = JSON.parse(execSync(
    `sqlite3 -json "${DATA_PATH}/the_bot.db" "SELECT image_path FROM portrait_variants WHERE id='${v.id}'"`,
    { encoding: 'utf8' }).trim() || '[]')[0]
  const rel = row && row.image_path
  const abs = rel && (path.isAbsolute(rel) ? rel : path.join(DATA_PATH, rel))
  const exists = abs && fs.existsSync(abs)
  const size = exists ? fs.statSync(abs).size : 0
  const magic = exists ? magicOk(fs.readFileSync(abs).subarray(0, 12)) : false
  console.log(`variant 图片: ${abs} exists=${exists} size=${size} magic=${magic}`)

  const ok = !!(exists && size > 0 && magic)
  console.log(ok ? '✅ 人像制作真实流程通过' : '❌ 人像图片文件校验失败')
  console.log('PORTRAIT_RESULT=' + JSON.stringify({ projectId, characterId, variantId: v.id, imagePath: abs, size, ok }))
  await browser.close()
  if (!ok) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
