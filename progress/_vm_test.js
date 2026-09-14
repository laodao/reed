const vm = require('node:vm')
const fs = require('fs')

const SAFE_GLOBALS = { console, Math, JSON, Date, Number, String, Boolean, Array, Object, Error, TypeError, RangeError, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, RegExp, Map, Set }

const code = `const shots=inputs.shots||[]; const html='<h3>素材预览</h3><div>'+(shots.map((x,i)=>'<div style="margin:6px 0"><b>镜头'+(i+1)+'</b> · 时长'+(x.duration||'')+'s<br>画面：'+(x.visual||'')+'<br>字幕：'+(x.caption||'')+'</div>').join(''))+'</div>'; return { html }`

const shots = [
  { visual: 'v1', caption: 'c1', duration: 13 },
  { visual: 'v2', caption: 'c2', duration: 15 },
]
const inputs = { shots }

const context = { ...SAFE_GLOBALS, inputs, result: undefined }
vm.createContext(context)
const wrapped = `result = (function(inputs) {\n${code}\n})`
try {
  const script = new vm.Script(`${wrapped}(inputs)`, { filename: 'wf-code' })
  script.runInContext(context, { timeout: 5000 })
  console.log('RESULT:', JSON.stringify(context.result))
} catch (e) {
  console.log('ERROR:', e.message)
  console.log('stack:', e.stack)
}
