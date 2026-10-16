/**
 * 端到端复验：用**真实的** ElectronDocumentRenderer 类 + **真实的** CSP 分流策略，
 * 在独立 Electron 进程里把讲义 HTML 渲染成 PDF/长图，验证 mermaid 图真的出来了。
 *
 * 前置：progress/_dl_export_sample.html（真实讲义）与 progress/_dl_mermaid_only.html
 *       由 tests/unit/core/platform/services/document-tools-mermaid-export.spec.ts 生成。
 *
 * 用法：node_modules/electron/dist/electron.exe progress/_mermaid_renderer_e2e.cjs
 */
const { app, BrowserWindow } = require('electron')
const esbuild = require('esbuild')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(os.tmpdir(), 'dl-renderer-e2e')
app.setPath('userData', path.join(os.tmpdir(), 'dl-renderer-e2e-userdata'))

/** 把 TS 源码打成 CJS（external electron），供本脚本 require */
function bundle(entry, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const outfile = path.join(OUT_DIR, `${name}.cjs`)
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    alias: { '@core': path.join(ROOT, 'src/core'), '@shared': path.join(ROOT, 'src/shared') },
    logLevel: 'silent',
  })
  return outfile
}

/** 与 src/electron/index.ts 中的安装方式一致：CSP 按 WebContents 分流 */
function installCsp(appWindow, cspForRequest) {
  const { session } = require('electron')
  // --old-csp：复刻修复前的行为（所有 WebContents 都用应用界面严格策略），做负向对照
  const oldBehavior = process.argv.includes('--old-csp')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          oldBehavior ? require(path.join(OUT_DIR, 'app-csp.cjs')).APP_UI_CSP : cspForRequest(details, appWindow.webContents.id),
        ],
      },
    })
  })
  return oldBehavior
}

app.whenReady().then(async () => {
  const { cspForRequest, APP_UI_CSP, DOCUMENT_RENDER_CSP } = require(bundle('src/electron/platform/app-csp.ts', 'app-csp'))
  const { ElectronDocumentRenderer } = require(bundle('src/electron/platform/electron-document-renderer.ts', 'renderer'))

  // 造一个"主窗口"，让渲染窗口落在非主窗口分支（与真实应用一致）
  const appWindow = new BrowserWindow({ width: 400, height: 300, show: false, webPreferences: { sandbox: false } })
  await appWindow.loadURL('data:text/html,<h1>app window</h1>')
  const oldBehavior = installCsp(appWindow, cspForRequest)
  console.log(`[e2e] CSP 安装完成（模式：${oldBehavior ? '旧行为=全部用应用界面策略' : '新行为=按 WebContents 分流'}）`)
  console.log('[e2e]  主窗口策略 :', APP_UI_CSP.slice(0, 60), '...')
  console.log('[e2e]  渲染窗口策略:', DOCUMENT_RENDER_CSP.slice(0, 60), '...')

  const renderer = new ElectronDocumentRenderer()
  const miniHtml = fs.readFileSync(path.join(__dirname, '_dl_mermaid_only.html'), 'utf-8')

  console.log('\n[e2e] 1) 讲义样本（含 mermaid graph TD）→ PDF')
  const pdf = await renderer.htmlToPdf(miniHtml)
  const pdfName = oldBehavior ? '_e2e_lesson_oldcsp.pdf' : '_e2e_lesson.pdf'
  fs.writeFileSync(path.join(__dirname, pdfName), pdf)
  console.log('[e2e] PDF 字节:', pdf.length, '->', pdfName)

  console.log('\n[e2e] 2) 同一样本 → PNG 长图')
  const png = await renderer.htmlToImage(miniHtml, { width: 820 })
  const pngName = oldBehavior ? '_e2e_mermaid_oldcsp.png' : '_e2e_mermaid.png'
  fs.writeFileSync(path.join(__dirname, pngName), png)
  console.log('[e2e] PNG 字节:', png.length, '->', pngName, '（可肉眼对比两张图：旧 CSP 是 graph TD 源码，新策略是渲染后的图）')

  appWindow.destroy()
  app.quit()
}).catch((e) => { console.error('[e2e] 失败:', e); app.quit() })
