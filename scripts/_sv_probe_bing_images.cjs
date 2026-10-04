/** 探测：Bing 图片检索（免 Key）能否程序化取到图片直链 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function bingImages(q) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' } })
  const html = await r.text()
  const out = []
  const re = /m="(\{&quot;.*?&quot;\})"/g
  let m
  while ((m = re.exec(html))) {
    const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    try {
      const o = JSON.parse(json)
      if (o.murl) out.push({ murl: o.murl, t: o.t, purl: o.purl })
    } catch {
      /* ignore */
    }
  }
  return { status: r.status, len: html.length, items: out }
}

;(async () => {
  for (const q of ['集装箱码头 航拍', 'industrial factory production line']) {
    const r = await bingImages(q)
    console.log(`\n=== ${q} status=${r.status} html=${r.len} items=${r.items.length} ===`)
    for (const it of r.items.slice(0, 6)) console.log(' -', it.t, '|', it.murl.slice(0, 110))
  }
})().catch((e) => console.log('ERR', e.message, e.cause && e.cause.message))