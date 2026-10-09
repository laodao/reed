/**
 * 技能蒸馏真机验收（经 9222 调试口驱动真实 app，不进测试套件）：
 * 1) 在主窗口 renderer 里调用 window.electronAPI.skills.distillRun（真实 LLM 链路）
 * 2) 轮询 distill-status 至终态
 * 3) 校验落盘技能包（SKILL.md + references/）与技能库可见性
 * 运行：node outputs/_distill-acceptance.cjs
 */
const http = require('http')

const DATA_ROOT = process.env.THE_BOT_DATA_ROOT || 'C:/Users/daoge/the-bot'
const SAMPLE = `深度工作的四层方法论

一、节奏节律层。深度工作不是靠意志力，而是靠固定节律。把每天上午 9 点到 11 点半设为雷打不动的深度时段，日历上标红，任何会议不得侵占。同一时间、同一地点、同样仪式，重复 21 天后大脑会自动进入状态。判断标准很简单：如果还要靠"下决心"才能开始，说明节律没有建立。

二、防御层。干扰分两种：外部的和内部的。外部干扰用"三闸门"防御：通知全关（手机飞行模式放另一个房间）、邮件定时批量处理（只在 11:45 和 17:30 各一次）、同事打断用"停车牌"——把正在想的问题写下来贴在显示器上，处理完打断回来 30 秒内恢复。内部干扰用"干扰记事本"：工作中冒出的任何杂念（要买的东西、要回的消息）立刻写进本子，告诉自己下班后处理，实践证明 90% 的杂念写下就忘。

三、强度计量层。每天结束时给深度时长打分，记录在表格里：深度时长、产出、被打断次数。每周复盘一次。原则：宁可 90 分钟全神贯注，不要 4 小时心不在焉。当连续一周深度时长低于 10 小时，就要削减承诺，而不是加班。阈值：顶尖知识工作者每天有效深度工作约 4 小时是生理上限，超过的部分是伪工作。

四、产出定义层。每个深度时段开始前必须写下"今天这个时段的产出是什么"，而且必须是可验收的实体：一段写完的章节、一个解决的 bug、一份发出去的方案。写下"推进 X 项目"不算——那不是产出，是愿望。当产出连续三天无法验收，说明任务拆得太大，回到拆解层重新定义。

反模式：用加班时长感动自己；把"忙碌"当"深度"；在深度时段里刷"只刷五分钟"的手机；用咖啡因透支睡眠换取第二天更差的深度能力。深度工作的复利在第三个月才显现，大多数人死在第二十九天。`

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let buf = ''
      res.on('data', d => (buf += d))
      res.on('end', () => {
        try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function evaluate(wsUrl, expression) {
  const WebSocket = require('ws')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP evaluate 超时')) }, 600_000)
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }))
    })
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString())
      if (msg.id !== id) return
      clearTimeout(timer)
      ws.close()
      if (msg.error) reject(new Error(msg.error.message))
      else if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails).slice(0, 600)))
      else resolve(msg.result?.result?.value)
    })
    ws.on('error', reject)
  })
}

async function main() {
  const targets = await getTargets()
  const page = targets.find(t => t.type === 'page' && !/devtools/i.test(t.url))
  if (!page) throw new Error('找不到主窗口 page target：' + targets.map(t => `${t.type}:${t.url}`).join(' | '))
  console.log('[accept] 主窗口：', page.title, page.url)

  // 0) 预检：新 IPC 通道已注册（electron-vite dev 在主进程变更后会自动重启）
  const probe = await evaluate(page.webSocketDebuggerUrl, `typeof window.electronAPI?.skills?.distillRun`)
  if (probe !== 'function') {
    throw new Error(`distillRun 不可用（${probe}）——运行中的 app 是旧代码，需要重启 dev 实例`)
  }

  // 1) 发起真实蒸馏（auto 判型）
  console.log('[accept] 发起蒸馏任务…')
  const runResp = await evaluate(
    page.webSocketDebuggerUrl,
    `window.electronAPI.skills.distillRun({ inputType: 'text', text: ${JSON.stringify(SAMPLE)}, contentType: 'auto', hints: '蒸馏成知识提炼类技能' }).then(r => r)`,
  )
  if (!runResp?.success) throw new Error('发起失败：' + JSON.stringify(runResp))
  const taskId = runResp.data.id
  console.log('[accept] taskId =', taskId)

  // 2) 轮询至终态
  let snap = runResp.data
  const t0 = Date.now()
  while (snap.status === 'running') {
    await new Promise(r => setTimeout(r, 2000))
    const r = await evaluate(page.webSocketDebuggerUrl, `window.electronAPI.skills.distillStatus(${JSON.stringify(taskId)}).then(r => r)`)
    if (!r?.success) throw new Error('轮询失败：' + JSON.stringify(r))
    snap = r.data
    console.log(`[accept] ${Math.round((Date.now() - t0) / 1000)}s stage=${snap.stage} progress=${snap.progress}% ${snap.message}`)
  }
  console.log('[accept] 终态快照：', JSON.stringify(snap, null, 2))

  if (snap.status !== 'done') {
    throw new Error(`蒸馏未成功：${snap.status} ${snap.error ?? ''}`)
  }

  // 3) 校验落盘包
  const fs = require('fs')
  const path = require('path')
  const skillDir = path.join(DATA_ROOT, 'skills', snap.resultSkillId)
  const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')
  const refDir = path.join(skillDir, 'references')
  const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir) : []
  console.log('[accept] SKILL.md 字节数 =', Buffer.byteLength(skillMd), '| references =', refs.join(', '))
  console.log('--- SKILL.md 前 1200 字 ---\n' + skillMd.slice(0, 1200))
  if (refs.length) {
    for (const f of refs) {
      const c = fs.readFileSync(path.join(refDir, f), 'utf-8')
      console.log(`--- references/${f} 前 500 字 ---\n` + c.slice(0, 500))
    }
  }

  // 4) 技能库可见性（真实 SkillService 扫描）
  const visible = await evaluate(page.webSocketDebuggerUrl, `window.electronAPI.skills.get(${JSON.stringify(snap.resultSkillId)}).then(r => r)`)
  if (!visible?.success || !visible.data) throw new Error('技能库 get 不到蒸馏产物：' + JSON.stringify(visible))
  console.log('[accept] 技能库可见：', visible.data.name, '| 分类 =', visible.data.category, '| 描述 =', visible.data.description.slice(0, 80))

  // 5) 技能库页面截图存档
  const WebSocket = require('ws')
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: page.url.split('#')[0] + '#/skills' } }))
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }))
      }, 2500)
    })
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString())
      if (msg.id === 2) {
        fs.mkdirSync('C:/Users/daoge/code/project/the-bot/outputs', { recursive: true })
        fs.writeFileSync('C:/Users/daoge/code/project/the-bot/outputs/_distill-skill-library.png', Buffer.from(msg.result.data, 'base64'))
        console.log('[accept] 技能库截图已存 outputs/_distill-skill-library.png')
        ws.close()
        resolve()
      }
    })
    ws.on('error', reject)
  })

  console.log('[accept] ✅ 真机验收通过：taskId=' + taskId + ' skillId=' + snap.resultSkillId)
}

main().catch(e => {
  console.error('[accept] ❌ 验收失败：', e.message)
  process.exit(1)
})
