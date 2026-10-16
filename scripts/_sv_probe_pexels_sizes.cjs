/** 探针：确认 Pexels 图片各尺寸直链的真实形态与下载体积（决定下载用哪个尺寸） */
const KEY = process.env.SV_STOCK_KEY || ''
const UA = { Authorization: KEY, Accept: 'application/json' }

;(async () => {
  const r = await fetch('https://api.pexels.com/v1/search?query=container%20port%20terminal&per_page=2&orientation=portrait', { headers: UA })
  const j = await r.json()
  for (const p of j.photos || []) {
    console.log(`\n#${p.id} 源尺寸 ${p.width}x${p.height} alt=${p.alt}`)
    for (const [k, v] of Object.entries(p.src)) {
      // HEAD 取体积
      let size = '?'
      try {
        const h = await fetch(v, { method: 'GET', headers: { Range: 'bytes=0-0' } })
        const len = h.headers.get('content-range')?.split('/')[1] || h.headers.get('content-length')
        size = len ? `${(Number(len) / 1024 / 1024).toFixed(2)}MB` : '未知'
      } catch (e) {
        size = 'ERR'
      }
      console.log(`  ${k.padEnd(9)} ${size.padStart(8)}  ${v}`)
    }
  }
})().catch(e => console.error(e))