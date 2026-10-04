/** 探测：用用户提供的 Key 判断是 Pixabay 还是 Pexels，并验证图片/视频检索可用 */
const KEY = process.env.SV_STOCK_KEY
if (!KEY) {
  console.log('NO KEY')
  process.exit(1)
}

async function probe(label, url, headers) {
  try {
    const r = await fetch(url, { headers: headers || {} })
    const text = await r.text()
    let summary = text.slice(0, 300).replace(/\s+/g, ' ')
    try {
      const j = JSON.parse(text)
      if (j.hits) summary = `hits=${j.hits.length} total=${j.totalHits} first=${JSON.stringify(j.hits[0] && { id: j.hits[0].id, tags: j.hits[0].tags, img: j.hits[0].largeImageURL || j.hits[0].videos && Object.keys(j.hits[0].videos) })}`
      else if (j.photos) summary = `photos=${j.photos.length} first=${JSON.stringify(j.photos[0] && { id: j.photos[0].id, alt: j.photos[0].alt, src: j.photos[0].src && j.photos[0].src.large2x })}`
      else if (j.videos) summary = `videos=${j.videos.length} first=${JSON.stringify(j.videos[0] && { id: j.videos[0].id, files: (j.videos[0].video_files || []).slice(0, 2) })}`
      else if (j.error) summary = 'error=' + j.error
    } catch {
      /* keep raw */
    }
    console.log(`[${label}] HTTP ${r.status} :: ${summary}`)
  } catch (e) {
    console.log(`[${label}] ERR ${e.message} ${e.cause && e.cause.message}`)
  }
}

;(async () => {
  await probe('pixabay-photo', `https://pixabay.com/api/?key=${KEY}&q=container+port&image_type=photo&per_page=3&safesearch=true`)
  await probe('pixabay-video', `https://pixabay.com/api/videos/?key=${KEY}&q=container+port&per_page=3&safesearch=true`)
  await probe('pexels-photo', `https://api.pexels.com/v1/search?query=container%20port&per_page=3&orientation=portrait`, { Authorization: KEY })
  await probe('pexels-video', `https://api.pexels.com/videos/search?query=container%20port&per_page=3&orientation=portrait`, { Authorization: KEY })
})()