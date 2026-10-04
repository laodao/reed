/** 探测：Pixabay 图片/视频搜索结果页能否免 Key 程序化取到素材直链 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  const text = await r.text()
  return { status: r.status, text }
}

;(async () => {
  // 1) 图片搜索页
  const img = await get('https://pixabay.com/images/search/container%20port/')
  console.log('images page status', img.status, 'len', img.text.length)
  const cdnImg = [...new Set([...img.text.matchAll(/https:\/\/cdn\.pixabay\.com\/photo\/[^"'\\ )]+/g)].map((m) => m[0]))]
  console.log('cdn photo urls:', cdnImg.length)
  console.log(cdnImg.slice(0, 5).join('\n'))

  // 2) 视频搜索页
  const vid = await get('https://pixabay.com/videos/search/container%20port/')
  console.log('\nvideos page status', vid.status, 'len', vid.text.length)
  const cdnVid = [...new Set([...vid.text.matchAll(/https:\/\/cdn\.pixabay\.com\/(?:video|vimeo)\/[^"'\\ )]+/g)].map((m) => m[0]))]
  console.log('cdn video urls:', cdnVid.length)
  console.log(cdnVid.slice(0, 8).join('\n'))
})().catch((e) => console.log('ERR', e.message, e.cause && e.cause.message))