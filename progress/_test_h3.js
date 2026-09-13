// H3 视频链路验证：走 comfyui-video provider 的真实调用形态
// 无法直接调主进程 provider，改为经网关协议级验证：先跑一个最小工作流？
// 更直接：探测 video 生成的服务级入口。此处先确认 worklow startRun 可用（工作流将承载最终验证），
// 本脚本改为：提交单任务给网关验证三段式+refs 协议正确性。
const fs = require('fs')

const GW = 'http://192.168.2.128:8190'
const img = 'C:/Users/daoge/the-bot/images/2026/09/06/img_1788680955564_0.png'

async function main() {
  // 模拟 video-gen 节点处理后的 refs（data URL base64）
  const b64 = fs.readFileSync(img).toString('base64')
  const prompt = [
    'subject_definitions:',
    'Picture 1 作为 Subject 1（画面主体）外观来源，需保持其画面主体、构图与整体视觉风格；Subject 1 在视频中按画面描述自然运动，不做剧烈形变，画面不含任何文字。',
    '',
    'summary:',
    '[reference generation + audio reference] 金色奖杯特写，柔和舞台灯光缓慢推近，光斑在奖杯表面流动，庄重氛围，镜头稳定缓慢。镜头语言简洁，动作单一自然，画面保持与 Picture 1 一致、无文字。',
    '',
    'retention_analysis:',
    'Subject 1（Picture 1）：fully_preserved - 保持金色奖杯的外观、构图与整体风格，仅产生自然的镜头推近。',
  ].join('\n')

  console.log('提交 H3 任务…')
  const r = await fetch(`${GW}/api/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, refs: [`data:image/png;base64,${b64}`], quality: 'high', aspect: 'portrait', frames: 121, steps: 20 }),
  })
  const t = await r.text()
  console.log('提交响应:', r.status, t.slice(0, 300))
  const data = JSON.parse(t)
  if (!data.ok || !data.task_id) { console.log('提交失败'); return }

  // 轮询
  const t0 = Date.now()
  for (let i = 0; i < 80; i++) {
    await new Promise(res => setTimeout(res, 10000))
    const q = await fetch(`${GW}/api/task/${data.task_id}`)
    const st = await q.json()
    const el = Math.round((Date.now() - t0) / 1000)
    console.log(`[${el}s] status=${st.status}${st.path ? ' path=' + st.path : ''}${st.error ? ' err=' + st.error : ''}`)
    if (st.status === 'done') {
      const dl = await fetch(`${GW}/api/file?p=${st.path}`)
      const buf = Buffer.from(await dl.arrayBuffer())
      fs.writeFileSync('C:/Users/daoge/the-bot/videos/_h3_verify.mp4', buf)
      console.log('下载完成:', buf.length, 'bytes → videos/_h3_verify.mp4')
      return
    }
    if (st.status === 'error') { console.log('任务失败:', st.error); return }
  }
  console.log('轮询超时')
}
main().catch(e => { console.error(e); process.exit(1) })