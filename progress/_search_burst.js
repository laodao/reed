const { chromium } = require('playwright-core')
async function main(){
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const list = await p.evaluate(() => window.electronAPI.searchEngine.list().then(x=>x))
  const cfg = (list?.data ?? []).find(c=>c.isDefault)
  console.log('默认引擎:', cfg.name, cfg.templateId)
  for (let i=1;i<=5;i++){
    const r = await p.evaluate(({q,engine,id}) => window.electronAPI.searchEngine.search({query:q, engine, configId:id, maxResults:5}).then(x=>x).catch(e=>({success:false,error:String(e)})), {q:'TikTok Shop 佣金 费率 '+i, engine:cfg.templateId, id:cfg.id})
    const rs = r?.data?.results ?? r?.results ?? []
    console.log(`#${i} success=${r?.success} count=${Array.isArray(rs)?rs.length:0} error=${r?.error ?? ''}`)
    await new Promise(r2=>setTimeout(r2,1500))
  }
  await b.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
