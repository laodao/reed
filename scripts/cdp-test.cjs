// CDP 调试脚本：通过 WebSocket 连接渲染进程，执行 IPC 调用测试导出功能
const WebSocket = require('ws')

const cdpUrl = process.argv[2]
if (!cdpUrl) { console.error('用法: node cdp-test.cjs <wsUrl>'); process.exit(1) }

const ws = new WebSocket(cdpUrl)
let msgId = 1

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++
    ws.send(JSON.stringify({ id, method, params }))
    const handler = (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.id === id) {
        ws.off('message', handler)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    }
    ws.on('message', handler)
  })
}

async function evalInPage(expr) {
  const result = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails, null, 2))
  }
  return result.result.value
}

ws.on('open', async () => {
  try {
    // 1. 列出所有领域学习空间
    console.log('=== 1. 列出空间 ===')
    const spaces = await evalInPage(`(async () => {
      const r = await window.electronAPI.domainLearning.listSpaces()
      return JSON.stringify(r)
    })()`)
    const spacesData = JSON.parse(spaces)
    console.log('spaces success:', spacesData.success)
    if (!spacesData.success || !spacesData.data) {
      console.log('无空间数据:', spacesData)
      ws.close()
      return
    }
    const spaceList = spacesData.data
    console.log('空间数:', spaceList.length)
    for (const s of spaceList) console.log(`  - ${s.id} ${s.name}`)

    // 2. 取第一个空间的视图，找一个有讲义的concept
    const spaceId = spaceList[0].id
    console.log(`\n=== 2. 取空间视图 ${spaceId} ===`)
    const view = await evalInPage(`(async () => {
      const r = await window.electronAPI.domainLearning.getSpaceView('${spaceId}')
      return JSON.stringify(r)
    })()`)
    const viewData = JSON.parse(view)
    if (!viewData.success || !viewData.data) {
      console.log('视图加载失败:', viewData)
      ws.close()
      return
    }
    const conceptsWithCard = (viewData.data.concepts || []).filter(c => c.hasCard)
    console.log('有讲义的概念数:', conceptsWithCard.length)
    for (const c of conceptsWithCard.slice(0, 5)) {
      console.log(`  - ${c.id} ${c.name} card v${c.card?.version} (${c.card?.status})`)
    }

    if (conceptsWithCard.length === 0) {
      console.log('无有讲义的概念，无法测试导出')
      ws.close()
      return
    }

    const conceptId = conceptsWithCard[0].id
    const conceptName = conceptsWithCard[0].name
    console.log(`\n=== 3. 测试导出 md（concept=${conceptName}）===`)

    // 3. 测试 md 导出
    const mdResult = await evalInPage(`(async () => {
      try {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: '${spaceId}', conceptId: '${conceptId}', format: 'md' })
        return JSON.stringify({ success: r?.success, format: r?.data?.format, filename: r?.data?.filename, markdownLen: r?.data?.markdown?.length, error: r?.error })
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack }) }
    })()`)
    console.log('md 结果:', mdResult)

    // 4. 测试 image 导出（最可能报错的）
    console.log(`\n=== 4. 测试导出 image（concept=${conceptName}）===`)
    const imgResult = await evalInPage(`(async () => {
      try {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: '${spaceId}', conceptId: '${conceptId}', format: 'image' })
        return JSON.stringify({ success: r?.success, format: r?.data?.format, htmlLen: r?.data?.html?.length, contentBase64Len: r?.data?.contentBase64?.length, error: r?.error })
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack }) }
    })()`)
    console.log('image 结果:', imgResult)

    // 5. 测试 pdf 导出
    console.log(`\n=== 5. 测试导出 pdf ===`)
    const pdfResult = await evalInPage(`(async () => {
      try {
        const r = await window.electronAPI.domainLearning.exportLesson({ id: '${spaceId}', conceptId: '${conceptId}', format: 'pdf' })
        return JSON.stringify({ success: r?.success, format: r?.data?.format, htmlLen: r?.data?.html?.length, contentBase64Len: r?.data?.contentBase64?.length, error: r?.error })
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack }) }
    })()`)
    console.log('pdf 结果:', pdfResult)

    // 6. 测试版本历史
    console.log(`\n=== 6. 测试 listCardVersions ===`)
    const verResult = await evalInPage(`(async () => {
      try {
        const r = await window.electronAPI.domainLearning.listCardVersions({ id: '${spaceId}', conceptId: '${conceptId}' })
        return JSON.stringify({ success: r?.success, count: r?.data?.length, first: r?.data?.[0], error: r?.error })
      } catch (e) { return JSON.stringify({ error: e.message, stack: e.stack }) }
    })()`)
    console.log('versions 结果:', verResult)

    ws.close()
  } catch (e) {
    console.error('测试失败:', e.message)
    ws.close()
  }
})

ws.on('error', (e) => console.error('WebSocket error:', e.message))