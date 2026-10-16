/**
 * E2E 真实业务测试 #1：图片生成（真实 AI 调用）
 * 轮试三个图像端点直到一个成功：
 *   1. 阿里百炼-tokenplan / wan2.7-image（预期 key 无效）
 *   2. 火山引擎 / ep-20260804233757-mpnsg（Doubao-Seedream-5.0-pro）
 *   3. 火山引擎 / ep-20260324195047-cnpvj（Doubao-Seedream-5.0-lite）
 * 验证：成功 + 文件真实存在（magic bytes）+ 尺寸非 0
 * 产出: 打印 JSON 结果行 REAL_IMAGE_RESULT=... 供后续脚本复用（成功的 provider/model/imagePath）
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DB = path.join(os.homedir(), '.config/the_bot/the_bot.db')
const DATA_PATH = path.join(os.homedir(), '.config/the_bot')

const CANDIDATES = [
  { label: '阿里百炼-tokenplan', providerConfigId: 'pc_mtee10tz_ijz2yq1ro', model: 'wan2.7-image' },
  { label: '火山引擎/Seedream-5.0-pro', providerConfigId: 'pc_mtefri7z_gmou93g8m', model: 'ep-20260804233757-mpnsg' },
  { label: '火山引擎/Seedream-5.0-lite', providerConfigId: 'pc_mtefri7z_gmou93g8m', model: 'ep-20260324195047-cnpvj' },
]

function classifyError(msg) {
  const m = String(msg || '')
  if (/invalid.*api.*key|api-?key.*invalid|incorrect api key|unauthorized|401|authentication/i.test(m)) return 'key无效'
  if (/403|forbidden|access denied/i.test(m)) return '权限不足'
  if (/404|not found/i.test(m)) return '端点错误(404)'
  if (/超时|timeout|ETIMEDOUT|ECONNABORTED/i.test(m)) return '超时'
  if (/400|参数|invalid.*param|bad request/i.test(m)) return '参数错误'
  if (/未登记生成能力/.test(m)) return '能力未登记(代码缺口)'
  if (/ENOTFOUND|ECONNREFUSED|network/i.test(m)) return '网络错误'
  return '其他'
}

function magicOk(buf) {
  if (buf.length < 12) return false
  const hex = buf.subarray(0, 12).toString('hex')
  return hex.startsWith('89504e47') || hex.startsWith('ffd8ff') || hex.startsWith('47494638') ||
    (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') // RIFF....WEBP
}

function dbImagesByTask(taskId) {
  try {
    const out = execSync(
      `sqlite3 -json "${DB}" "SELECT id, file_path, file_size, status, error_message FROM images WHERE task_id='${taskId}'"`,
      { encoding: 'utf8' }).trim()
    return out ? JSON.parse(out) : []
  } catch { return [] }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')

  const results = []
  let winner = null

  for (const c of CANDIDATES) {
    if (winner) break
    console.log(`\n--- 尝试 ${c.label} (${c.model}) ---`)
    const gen = await page.evaluate(async (req) => {
      try {
        return await window.electronAPI.image.generate(req)
      } catch (e) { return { success: false, error: String(e && e.message || e) } }
    }, { providerConfigId: c.providerConfigId, model: c.model, prompt: '一只橘猫坐在木质窗台上晒太阳，写实摄影风格', width: 1024, height: 1024, count: 1 })

    console.log('generate 返回:', JSON.stringify(gen).slice(0, 400))
    if (!gen.success) {
      results.push({ ...c, ok: false, error: gen.error, category: classifyError(typeof gen.error === 'string' ? gen.error : JSON.stringify(gen.error)) })
      continue
    }
    const taskId = gen.data.taskId
    // 轮询任务状态（同步模式应已 completed；异步 bailian 需等）
    let final = null
    const deadline = Date.now() + 150000
    while (Date.now() < deadline) {
      const st = await page.evaluate((tid) => window.electronAPI.image.getTaskStatus(tid), taskId)
      const s = st && st.data
      if (s && (s.status === 'completed' || s.status === 'failed')) { final = s; break }
      await new Promise(r => setTimeout(r, 3000))
    }
    if (!final) {
      results.push({ ...c, ok: false, taskId, error: '轮询超时(150s)', category: '超时' })
      continue
    }
    if (final.status === 'failed') {
      results.push({ ...c, ok: false, taskId, error: final.error, category: classifyError(final.error) })
      continue
    }
    // 验证文件
    const rows = dbImagesByTask(taskId)
    const row = rows.find(r => r.status === 'completed' && r.file_path)
    if (!row) {
      results.push({ ...c, ok: false, taskId, error: 'DB 无 completed 记录', category: '其他', rows })
      continue
    }
    const abs = path.join(DATA_PATH, row.file_path)
    const exists = fs.existsSync(abs)
    const size = exists ? fs.statSync(abs).size : 0
    const magic = exists ? magicOk(fs.readFileSync(abs).subarray(0, 12)) : false
    const ok = exists && size > 0 && magic
    results.push({ ...c, ok, taskId, imageId: row.id, filePath: abs, size, magic, dbSize: row.file_size })
    if (ok) winner = { providerConfigId: c.providerConfigId, model: c.model, label: c.label, imageId: row.id, filePath: abs, taskId }
  }

  console.log('\n===== 结果汇总 =====')
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.label} [${r.model}]`,
      r.ok ? `file=${r.filePath} size=${r.size} magic=${r.magic}` : `error=${String(r.error).slice(0, 200)} 分类=${r.category}`)
  }
  console.log('REAL_IMAGE_RESULT=' + JSON.stringify(winner))
  await browser.close()
  if (!winner) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
