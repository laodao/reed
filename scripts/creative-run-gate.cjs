/**
 * 创作任务运行门禁（阶段门禁 + 交付物内容启发式校验 + 交付前最终门禁）
 * @module scripts/creative-run-gate
 *
 * 思路移植自豆包网文 skill 的三个 Python 门禁脚本（workflow.py / check_lark_doc.py /
 * validate_run.py），适配本系统：交付物不是飞书文档，而是**本地 markdown 文件**
 * （长文写作导出、短剧剧本 / 分镜文档等）。图片不再是强制独立阶段。
 *
 * 阶段：brief → draft → delivery，全部完成后 state.current_stage = "done"。
 * 工作目录（runDir）默认 `<cwd>/.creative-run`，内含 state.json 与各阶段 <stage>_handoff.json。
 *
 * 用法（Node ≥18，零依赖）：
 *   node scripts/creative-run-gate.cjs init --topic "<任务简报>" [--dir <runDir>]
 *   node scripts/creative-run-gate.cjs enter <stage> [--dir <runDir>]
 *   node scripts/creative-run-gate.cjs accept <stage> <handoff.json> [--dir <runDir>]
 *   node scripts/creative-run-gate.cjs check <deliverable.md> [--write-handoff <out.json>] [--dir <runDir>]
 *   node scripts/creative-run-gate.cjs validate [--dir <runDir>]
 *   node scripts/creative-run-gate.cjs status [--dir <runDir>]
 *
 * 全部输出 JSON 到 stdout；退出码：0=ok/pass，1=blocked/fail（校验不通过），2=文件缺失/JSON 非法。
 */

const fs = require('fs')
const path = require('path')

const STAGES = ['brief', 'draft', 'delivery']
const PREREQ = { brief: [], draft: ['brief'], delivery: ['brief', 'draft'] }
const TASK_TYPES = ['正文', '方案', '卖点包装', '诊断']

const PLACEHOLDERS = ['图片待插入', '稍后补图', '这里放图', '待补充', 'TODO', '占位', '待完善', 'XXX待填']
const BANNED_INTERNAL = ['内部质量门禁', '一票否决项', '自检清单', '检查清单', 'creative-run-gate', 'workflow.py', 'validate_run']
const REQUIRED_ONE_OF = ['可复制正文', '可复制方案']
const BANNED_SECTIONS = ['可复制使用版', '核心设定与人物关系']
const MIN_BODY_CHARS = 200

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

function emit(payload, code) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
  process.exit(code === undefined ? 0 : code)
}

function readText(file) {
  let text = fs.readFileSync(file, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

function loadJson(file) {
  let data
  try {
    data = JSON.parse(readText(file))
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      emit({ status: 'blocked', blocked: 'MISSING_FILE', path: file }, 2)
    }
    emit({ status: 'blocked', blocked: 'INVALID_JSON', path: file, message: String(err && err.message || err) }, 2)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    emit({ status: 'blocked', blocked: 'JSON_MUST_BE_OBJECT', path: file }, 2)
  }
  return data
}

function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/** 相对路径按 cwd、runDir 依次解析 */
function resolveExistingPath(pathValue, runDir) {
  if (path.isAbsolute(pathValue)) return pathValue
  const candidates = [path.join(process.cwd(), pathValue), path.join(runDir, pathValue)]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}

function stateFile(runDir) {
  return path.join(runDir, 'state.json')
}

function loadState(runDir) {
  if (!fs.existsSync(stateFile(runDir))) {
    return { current_stage: 'not-initialized', completed: [], updated_at: null }
  }
  return loadJson(stateFile(runDir))
}

function saveState(runDir, state) {
  state.updated_at = nowIso()
  saveJson(stateFile(runDir), state)
}

function norm(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value === undefined || value === null ? '' : value).trim().toLowerCase()
}

function nonEmpty(value) {
  return String(value === undefined || value === null ? '' : value).trim().length > 0
}

/* ---------- 内容校验（check 命令与 draft/delivery 共用） ---------- */

function checkContent(text) {
  const failures = []
  const result = {}
  const hasCore = REQUIRED_ONE_OF.some((s) => text.includes(s))
  if (!hasCore) failures.push('content missing 可复制正文 or 可复制方案 section')
  result.core_section_checked = hasCore ? 'pass' : 'fail'
  for (const s of BANNED_SECTIONS) {
    if (text.includes(s)) failures.push(`content contains banned section ${s}`)
  }
  const hitPlaceholders = PLACEHOLDERS.filter((t) => text.includes(t))
  if (hitPlaceholders.length) failures.push(`content contains unfinished placeholder text: ${hitPlaceholders.join(', ')}`)
  result.placeholder_removed = hitPlaceholders.length ? 'no' : 'yes'
  const hitInternal = BANNED_INTERNAL.filter((t) => text.includes(t))
  if (hitInternal.length) failures.push(`content exposes internal workflow/check text: ${hitInternal.join(', ')}`)
  result.internal_checks_hidden = hitInternal.length ? 'no' : 'yes'
  const bodyChars = text.replace(/\s/g, '').length
  result.length_chars = bodyChars
  if (bodyChars < MIN_BODY_CHARS) failures.push(`content too short: ${bodyChars} chars < ${MIN_BODY_CHARS}`)
  return { failures, result }
}

/* ---------- 各阶段 handoff 校验 ---------- */

function checkBrief(data) {
  const failures = []
  const warnings = []
  for (const field of ['task_type', 'deliverable', 'title', 'user_intent']) {
    if (!nonEmpty(data[field])) failures.push(`brief: missing ${field}`)
  }
  if (norm(data.deliverable) !== 'markdown_file') {
    failures.push(`brief: deliverable must be 'markdown_file', got ${JSON.stringify(data.deliverable)}`)
  }
  if (nonEmpty(data.task_type) && !TASK_TYPES.some((t) => String(data.task_type).includes(t))) {
    warnings.push(`brief: task_type ${JSON.stringify(data.task_type)} not in ${TASK_TYPES.join('/')}`)
  }
  return { failures, warnings }
}

function checkDraft(data, runDir) {
  const failures = []
  const warnings = []
  if (!('ready_for_delivery' in data)) failures.push('draft: missing ready_for_delivery')
  else if (norm(data.ready_for_delivery) !== 'yes') {
    failures.push(`draft: ready_for_delivery must be 'yes', got ${JSON.stringify(data.ready_for_delivery)}`)
  }
  for (const field of ['title', 'task_type', 'content_path']) {
    if (!nonEmpty(data[field])) failures.push(`draft: missing ${field}`)
  }
  const core = String(data.core_section || '').trim()
  if (!REQUIRED_ONE_OF.includes(core)) {
    failures.push('draft: core_section must be 可复制正文 or 可复制方案')
  }
  if (nonEmpty(data.task_type) && !TASK_TYPES.some((t) => String(data.task_type).includes(t))) {
    warnings.push(`draft: task_type ${JSON.stringify(data.task_type)} not in ${TASK_TYPES.join('/')}`)
  }
  if (nonEmpty(data.content_path)) {
    const resolved = resolveExistingPath(String(data.content_path).trim(), runDir)
    if (!fs.existsSync(resolved)) {
      failures.push(`draft: content_path does not exist: ${data.content_path}`)
    } else {
      const { failures: contentFailures } = checkContent(readText(resolved))
      for (const f of contentFailures) failures.push(`draft content: ${f}`)
    }
  }
  return { failures, warnings }
}

function checkDelivery(data, runDir) {
  const failures = []
  const warnings = []
  for (const field of ['delivery_path']) {
    if (!nonEmpty(data[field])) failures.push(`delivery: missing ${field}`)
  }
  if (!('read_back' in data)) failures.push('delivery: missing read_back')
  else if (norm(data.read_back) !== 'pass') {
    failures.push(`delivery: read_back must be 'pass', got ${JSON.stringify(data.read_back)}`)
  }
  if (!('ready_for_final' in data)) failures.push('delivery: missing ready_for_final')
  else if (norm(data.ready_for_final) !== 'yes') {
    failures.push(`delivery: ready_for_final must be 'yes', got ${JSON.stringify(data.ready_for_final)}`)
  }
  if (!['no', 'false'].includes(norm(data.chat_fulltext_output || 'no'))) {
    failures.push('delivery: final reply must not paste full text in chat (chat_fulltext_output must be no/false)')
  }
  if (nonEmpty(data.delivery_path)) {
    const resolved = resolveExistingPath(String(data.delivery_path).trim(), runDir)
    if (!fs.existsSync(resolved)) {
      failures.push(`delivery: delivery_path does not exist: ${data.delivery_path}`)
    } else {
      const text = readText(resolved)
      if (!text.trim()) {
        failures.push(`delivery: delivery_path is empty: ${data.delivery_path}`)
      } else {
        const { failures: contentFailures } = checkContent(text)
        for (const f of contentFailures) failures.push(`delivery content: ${f}`)
      }
    }
  }
  return { failures, warnings }
}

const CHECKS = { brief: checkBrief, draft: checkDraft, delivery: checkDelivery }

/* ---------- 命令 ---------- */

function parseArgs(argv) {
  const positional = []
  const opts = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--topic') opts.topic = argv[++i]
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a === '--write-handoff') opts.writeHandoff = argv[++i]
    else positional.push(a)
  }
  return { positional, opts }
}

function cmdInit(opts) {
  if (!nonEmpty(opts.topic)) {
    emit({ status: 'blocked', blocked: 'MISSING_ARG', message: 'init requires --topic' }, 2)
  }
  const runDir = path.resolve(opts.dir || '.creative-run')
  fs.mkdirSync(runDir, { recursive: true })
  const state = { topic: opts.topic, current_stage: 'brief', completed: [], updated_at: nowIso() }
  saveState(runDir, state)
  emit({ status: 'ok', runDir, current_stage: 'brief' })
}

function cmdEnter(positional, opts) {
  const stage = positional[0]
  if (!STAGES.includes(stage)) {
    emit({ status: 'blocked', blocked: 'UNKNOWN_STAGE', stage, stages: STAGES }, 2)
  }
  const runDir = path.resolve(opts.dir || '.creative-run')
  const state = loadState(runDir)
  const completed = new Set(state.completed || [])
  const missing = PREREQ[stage].filter((s) => !completed.has(s))
  if (missing.length) {
    emit({ status: 'blocked', blocked: 'NEED_UPSTREAM_STAGE', stage, missing }, 1)
  }
  state.current_stage = stage
  saveState(runDir, state)
  emit({ status: 'ok', stage })
}

function cmdAccept(positional, opts) {
  const stage = positional[0]
  const handoff = positional[1]
  if (!STAGES.includes(stage)) {
    emit({ status: 'blocked', blocked: 'UNKNOWN_STAGE', stage, stages: STAGES }, 2)
  }
  if (!handoff) {
    emit({ status: 'blocked', blocked: 'MISSING_ARG', message: 'accept requires a handoff.json path' }, 2)
  }
  const runDir = path.resolve(opts.dir || '.creative-run')
  const data = loadJson(path.resolve(handoff))
  const { failures, warnings } = CHECKS[stage](data, runDir)
  if (failures.length) {
    emit({ status: 'blocked', blocked: 'INVALID_HANDOFF', stage, failures, warnings }, 1)
  }
  const target = path.join(runDir, `${stage}_handoff.json`)
  saveJson(target, data)
  const state = loadState(runDir)
  state.completed = [...new Set([...(state.completed || []), stage])]
  state.current_stage = stage === 'delivery' ? 'done' : STAGES[STAGES.indexOf(stage) + 1]
  saveState(runDir, state)
  emit({ status: 'ok', stage, saved: target, next_stage: state.current_stage, warnings })
}

function cmdCheck(positional, opts) {
  const file = positional[0]
  if (!file) {
    emit({ status: 'blocked', blocked: 'MISSING_ARG', message: 'check requires a deliverable.md path' }, 2)
  }
  const runDir = path.resolve(opts.dir || '.creative-run')
  const resolved = resolveExistingPath(file, runDir)
  if (!fs.existsSync(resolved)) {
    emit({ status: 'blocked', blocked: 'MISSING_FILE', path: file }, 2)
  }
  const { failures, result } = checkContent(readText(resolved))
  const payload = { status: failures.length ? 'fail' : 'pass', failures, result }
  if (opts.writeHandoff) {
    const handoff = {
      delivery_path: file,
      read_back: failures.length ? 'fail' : 'pass',
      ready_for_final: failures.length ? 'no' : 'yes',
      chat_fulltext_output: 'no',
      ...result,
    }
    const out = path.resolve(opts.writeHandoff)
    saveJson(out, handoff)
    payload.handoff = out
  }
  emit(payload, failures.length ? 1 : 0)
}

function cmdValidate(opts) {
  const runDir = path.resolve(opts.dir || '.creative-run')
  const failures = []
  if (!fs.existsSync(stateFile(runDir))) {
    failures.push(`missing file: ${stateFile(runDir)}`)
  } else {
    const state = loadJson(stateFile(runDir))
    const completed = Array.isArray(state.completed) ? state.completed : []
    if (!Array.isArray(state.completed)) failures.push('state.completed must be a list')
    for (const stage of STAGES) {
      if (!completed.includes(stage)) failures.push(`state.completed missing stage: ${stage}`)
    }
    if (state.current_stage !== 'done') {
      failures.push(`state.current_stage must be 'done', got ${JSON.stringify(state.current_stage)}`)
    }
  }
  for (const stage of STAGES) {
    const file = path.join(runDir, `${stage}_handoff.json`)
    if (!fs.existsSync(file)) {
      failures.push(`missing file: ${file}`)
      continue
    }
    const data = loadJson(file)
    const { failures: stageFailures } = CHECKS[stage](data, runDir)
    for (const f of stageFailures) failures.push(`${stage}_handoff: ${f}`)
  }
  if (failures.length) {
    emit({ status: 'fail', runDir, failures }, 1)
  }
  emit({ status: 'pass', runDir })
}

function cmdStatus(opts) {
  const runDir = path.resolve(opts.dir || '.creative-run')
  const state = loadState(runDir)
  emit({ status: 'ok', runDir, ...state })
}

function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { positional, opts } = parseArgs(rest)
  switch (command) {
    case 'init': return cmdInit(opts)
    case 'enter': return cmdEnter(positional, opts)
    case 'accept': return cmdAccept(positional, opts)
    case 'check': return cmdCheck(positional, opts)
    case 'validate': return cmdValidate(opts)
    case 'status': return cmdStatus(opts)
    default:
      emit({
        status: 'blocked',
        blocked: 'UNKNOWN_COMMAND',
        command: command || null,
        usage: 'node scripts/creative-run-gate.cjs <init|enter|accept|check|validate|status> [--dir <runDir>]',
      }, 2)
  }
}

main()
