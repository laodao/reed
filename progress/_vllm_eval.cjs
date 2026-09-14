/**
 * 只读评测：直连 vLLM（qwen3.8-27b）生成一段"知识内容"，验证鉴权与生成质量。
 * 运行: node_modules\.bin\electron.cmd progress/_vllm_eval.cjs [dbPath]
 *
 * 为什么走 Electron 主进程：vLLM 提供商的 api_key 用 Electron safeStorage 加密，
 * 只能在本机同用户的主进程内解密；这里 app.whenReady() 借 safeStorage 解密后直连 LAN vLLM。
 * 不写任何 dl_* 业务表，只打印模型输出，供人工判断"可否把知识生成默认模型切过来"。
 */
const { app, safeStorage } = require('electron')
const Database = require('better-sqlite3')
const http = require('http')
const os = require('os')
const path = require('path')

// 与真实应用同身份，safeStorage 才能解出它在运行期加密的 api_key
app.setName('the_bot')
app.setPath('userData', path.join(os.homedir(), 'AppData', 'Roaming', 'the_bot'))

const BASE = 'http://192.168.2.129:8001/v1'
const MODEL = 'qwen3.8-27b'
const dbPath = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const payload = body ? JSON.stringify(body) : null
    const r = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          let bodyText = Buffer.concat(chunks).toString('utf8')
          let json = null
          try {
            json = JSON.parse(bodyText)
          } catch {}
          resolve({ status: res.statusCode, json, bodyText })
        })
      },
    )
    r.on('error', reject)
    if (payload) r.write(payload)
    r.end()
  })
}

async function main() {
  const db = new Database(dbPath, { readonly: true })
  const row = db
    .prepare("SELECT api_key_encrypted, name FROM provider_configs WHERE name LIKE '%vllm%' OR short_id='vllm'")
    .get()
  db.close()
  if (!row || !row.api_key_encrypted) {
    console.log('[vllm] 找不到 vllm provider 或未配置 api_key_encrypted')
    app.exit(1)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    console.log('[vllm] safeStorage 不可用，无法解密（需在本机同用户 Electron 主进程运行）')
    app.exit(2)
    return
  }
  let key
  try {
    key = safeStorage.decryptString(Buffer.from(row.api_key_encrypted, 'base64'))
  } catch (e) {
    console.log('[vllm] 解密失败:', e.message)
    app.exit(3)
    return
  }
  const auth = { Authorization: `Bearer ${key}` }
  console.log(`[vllm] 密钥前缀 ${key.slice(0, 6)}… (len=${key.length})`)

  // 1) 验证鉴权 + 模型列表
  const models = await req('GET', '/models', null, auth)
  console.log('[vllm] /models ->', models.status)
  if (models.json?.data) {
    console.log('   ', models.json.data.map((m) => m.id).join(', '))
  } else {
    console.log('   ', models.bodyText.slice(0, 200))
  }

  // 2) 生成一段知识内容（讲课式、结构化，模拟领域学习研究产出）
  const prompt =
    '你是领域学习的研究助手。请为知识点「导数与链式法则」产出一份结构化讲义草稿，' +
    '要求：1) 首区是 meta 概述与前置要求；2) 用一个生活中的类比引入；3) 给出定义与公式；' +
    '4) 给出 2 个逐步演算的例子（含中间量）；5) 结尾 2 道自测题（只提问不写答案）。用 markdown。'
  const gen = await req(
    'POST',
    '/chat/completions',
    {
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: '你是一个面向零基础读者的中文讲师，讲清楚、有类比、算式要一步步回算。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      // 之前 1500 太小：思考型模型先消费大量 token 思考，正文没机会输出就被截断。
      // 这里放到接近 context 上限（8192），验证默认(思考)模式下思考完能否正常给出 content。
      max_tokens: 8192,
      // chat_template_kwargs: { enable_thinking: false },
    },
    auth,
  )
  console.log('[vllm] /chat/completions ->', gen.status)
  if (gen.json?.choices?.[0]) {
    const msg = gen.json.choices[0].message || {}
    console.log('\n================ 完整 message ================')
    console.log(JSON.stringify(msg, null, 2))
    if (msg.content) {
      console.log('\n--- 正文 content ---\n')
      console.log(msg.content)
    }
    if (msg.reasoning) {
      console.log('\n--- 思考 reasoning（前 3000 字）---\n')
      console.log(msg.reasoning.slice(0, 3000))
    }
    if (gen.json.usage) console.log('\n[usage]', JSON.stringify(gen.json.usage))
  } else {
    console.log('[vllm] 无 choices：', gen.bodyText.slice(0, 400))
  }

  // 3) 工具调用测试：dl agent 需要模型能输出 function_call / tool_calls
  console.log('\n\n================ 工具调用测试 ================')
  const tool = {
    type: 'function',
    function: {
      name: 'dl_save_concept',
      description: '把一个概念落为知识节点（含一句话定义与前置要求）',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          definitionShort: { type: 'string' },
          prerequisites: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
    },
  }
  const tc = await req(
    'POST',
    '/chat/completions',
    {
      model: MODEL,
      messages: [
        { role: 'system', content: '研究一个知识点时，需用 dl_save_concept 工具把它落为概念草稿。' },
        { role: 'user', content: '请研究知识点「导数的几何意义」并调用 dl_save_concept 落库：name=导数的几何意义，定义=切线的斜率，前置=极限概念、函数与图像。' },
      ],
      tools: [tool],
      tool_choice: 'auto',
      max_tokens: 1024,
      chat_template_kwargs: { enable_thinking: false },
    },
    auth,
  )
  console.log('[vllm] tool-call ->', tc.status)
  if (tc.json?.choices?.[0]?.message) {
    const m = tc.json.choices[0].message
    console.log('tool_calls:', JSON.stringify(m.tool_calls ?? m.function_call ?? null))
    console.log('content:', JSON.stringify((m.content ?? '').slice(0, 200)))
  } else {
    console.log('[vllm] tool-call 无 message：', (tc.bodyText || '').slice(0, 300))
  }
  app.exit(0)
}

app.whenReady().then(() => main().catch((e) => {
  console.error('[vllm] 异常:', e)
  app.exit(9)
}))