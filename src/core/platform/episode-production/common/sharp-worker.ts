/**
 * sharp 子进程执行器（2026-09-21 · sharp/libvips 崩 Electron 主进程修复）
 * @module platform/episode-production/common/sharp-worker
 *
 * 背景：sharp/libvips 是 GLib 系 native 库，在 Electron 主进程事件循环里高频调用
 * （关键帧机器校验 + 参考板拼接引入后）实测 6 次 browser_main_loop 断言崩溃。
 * 所有 sharp 调用收口到常驻 node 子进程，主进程只发异步 RPC。
 *
 * 形态：
 *   - runner 是运行期 codegen 的纯 JS（写到 dataPath/.workers/sharp-worker.js，
 *     不依赖 electron-vite 打包形态；sharp 经主进程 require.resolve 的绝对路径加载，
 *     dev / 打包 / Web server / 单测（ELECTRON_RUN_AS_NODE）四种形态同一条路径）；
 *   - Electron 主进程优先 utilityProcess.fork（为跑 node 模块设计），不可用时
 *     （Web server / 单测）退回 child_process.fork + ELECTRON_RUN_AS_NODE=1；
 *   - 协议 {id, op, args} → {id, ok, result|error}；串行队列；单调用 60s 超时
 *     （超时/崩溃 → 拒绝该调用并自动重启子进程，后续调用不受影响）。
 *
 * op 清单（覆盖本轮新增 + 存量 4 处 sharp 调用的全集）：
 *   aHash(path)             → hex string | null        （image-hash）
 *   hashDistance(a, b)      → number | null            （image-hash / 主图照抄检测）
 *   imageStats(path)        → {aHash, stdev, edgeMean, edgeVar} | null  （关键帧机器校验）
 *   probe({path|bufferBase64}) → {width, height, format} | null         （上传探测）
 *   makeBoard({members, outPath})  → {width, height, members}           （编号参考板）
 *   compositeGrid({paths, layout, outPath}) → {width, height}           （人像宫格导出）
 *   extractRegions({imagePath, regions, format, quality}) → {written}   （分镜缩略图切片）
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'

/** 单调用超时：参考板/宫格合成涉及多图 IO，给足 60s */
const CALL_TIMEOUT_MS = 60_000

/*
 * runner 源码（纯 JS CommonJS，运行期落盘）。
 * 注意：不能用模板字符串 / ${}（会被外层 TS 模板串吃掉），一律字符串拼接。
 */
const RUNNER_SOURCE = [
  "'use strict'",
  '// sharp worker runner（codegen，勿手改；源在 common/sharp-worker.ts）',
  "const sharp = require(process.argv[2])",
  "const fs = require('fs')",
  '',
  '// utilityProcess：process.parentPort；child_process.fork：process.send',
  'const parentPort = process.parentPort',
  'function reply(msg) {',
  '  if (parentPort) parentPort.postMessage(msg)',
  '  else process.send(msg)',
  '}',
  '',
  'async function aHashHex(p) {',
  '  const r = await sharp(p).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true })',
  '  let sum = 0',
  '  for (const v of r.data) sum += v',
  '  const mean = sum / 64',
  '  let bits = 0n',
  '  for (let i = 0; i < 64; i++) { if (r.data[i] >= mean) bits |= 1n << BigInt(i) }',
  '  return bits.toString(16).padStart(16, "0")',
  '}',
  '',
  'function hammingHex(a, b) {',
  '  let x = BigInt("0x" + a) ^ BigInt("0x" + b)',
  '  let n = 0',
  '  while (x) { n += Number(x & 1n); x >>= 1n }',
  '  return n',
  '}',
  '',
  'async function imageStats(p) {',
  '  const stats = await sharp(p).stats()',
  '  const stdevs = stats.channels.map(function (c) { return c.stdev || 0 })',
  '  const stdev = stdevs.length ? stdevs.reduce(function (a, b) { return a + b }, 0) / stdevs.length : 0',
  '  const size = 32, ring = 3',
  '  const r = await sharp(p).resize(size, size, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true })',
  '  const vals = []',
  '  for (let y = 0; y < size; y++) {',
  '    for (let x = 0; x < size; x++) {',
  '      if (x < ring || x >= size - ring || y < ring || y >= size - ring) vals.push(r.data[y * size + x])',
  '    }',
  '  }',
  '  const mean = vals.reduce(function (a, b) { return a + b }, 0) / vals.length',
  '  const variance = vals.reduce(function (a, b) { return a + (b - mean) * (b - mean) }, 0) / vals.length',
  '  const aHash = await aHashHex(p)',
  '  return { aHash: aHash, stdev: stdev, edgeMean: mean, edgeVar: variance }',
  '}',
  '',
  '// 编号色块 SVG（红底白字圆形；阿拉伯数字 librsvg 渲染可靠）',
  'function badgeSvg(slot, withText, size) {',
  '  const c = size / 2',
  '  const text = withText',
  '    ? \'<text x="\' + c + \'" y="\' + Math.round(c + size * 0.19) + \'" font-size="\' + Math.round(size * 0.54) + \'" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif" fill="#ffffff" text-anchor="middle">\' + slot + \'</text>\'',
  '    : ""',
  '  return Buffer.from(\'<svg xmlns="http://www.w3.org/2000/svg" width="\' + size + \'" height="\' + size + \'">\' +',
  '    \'<circle cx="\' + c + \'" cy="\' + c + \'" r="\' + (c - 2) + \'" fill="#c0392b"/>\' + text + \'</svg>\')',
  '}',
  '',
  'const BOARD_IMAGE_HEIGHT = 768',
  'const BOARD_GAP = 8',
  'const BOARD_BADGE_BAND = 64',
  'const BOARD_MAX_WIDTH = 2048',
  '',
  'async function makeBoard(args) {',
  '  const members = args.members',
  '  const tiles = []',
  '  for (const m of members) {',
  '    if (!fs.existsSync(m.imagePath)) continue',
  '    try {',
  '      let buf = await sharp(m.imagePath).resize({ height: BOARD_IMAGE_HEIGHT }).png().toBuffer()',
  '      const meta = await sharp(buf).metadata()',
  '      tiles.push({ buf: buf, width: meta.width || BOARD_IMAGE_HEIGHT, member: m })',
  '    } catch (e) { /* 单张不可读跳过 */ }',
  '  }',
  '  if (tiles.length === 0) throw new Error("参考板成员图全部不可读")',
  '  const gapTotal = BOARD_GAP * (tiles.length - 1)',
  '  const totalWidthOf = function () { return tiles.reduce(function (w, t) { return w + t.width }, 0) + gapTotal }',
  '  let targetHeight = BOARD_IMAGE_HEIGHT',
  '  for (let guard = 0; guard < 4 && totalWidthOf() > BOARD_MAX_WIDTH; guard++) {',
  '    targetHeight = Math.max(1, Math.floor(targetHeight * (BOARD_MAX_WIDTH / totalWidthOf()) * 0.99))',
  '    for (const t of tiles) {',
  '      t.buf = await sharp(t.buf).resize({ height: targetHeight }).png().toBuffer()',
  '      t.width = (await sharp(t.buf).metadata()).width || targetHeight',
  '    }',
  '  }',
  '  const imageRowHeight = targetHeight',
  '  const badgeBand = Math.max(32, Math.round(BOARD_BADGE_BAND * (targetHeight / BOARD_IMAGE_HEIGHT)))',
  '  const badgeSize = Math.min(56, badgeBand - 8)',
  '  const totalWidth = tiles.reduce(function (w, t) { return w + t.width }, 0) + gapTotal',
  '  const totalHeight = imageRowHeight + badgeBand',
  '  const tileOverlays = []',
  '  const badgePositions = []',
  '  const outMembers = []',
  '  let x = 0',
  '  tiles.forEach(function (t, i) {',
  '    const slot = i + 1',
  '    tileOverlays.push({ input: t.buf, left: x, top: 0 })',
  '    badgePositions.push({ slot: slot, left: x + Math.max(0, Math.round((t.width - badgeSize) / 2)), top: imageRowHeight + Math.max(0, Math.round((badgeBand - badgeSize) / 2)) })',
  '    outMembers.push({ assetImageId: t.member.assetImageId, name: t.member.name, kind: t.member.kind, slot: slot })',
  '    x += t.width + BOARD_GAP',
  '  })',
  '  const compose = function (withText) {',
  '    return sharp({ create: { width: totalWidth, height: totalHeight, channels: 3, background: "#ffffff" } })',
  '      .composite(tileOverlays.concat(badgePositions.map(function (b) {',
  '        return { input: badgeSvg(b.slot, withText, badgeSize), left: b.left, top: b.top }',
  '      })))',
  '      .png()',
  '  }',
  '  try {',
  '    await compose(true).toFile(args.outPath)',
  '  } catch (e) {',
  '    // SVG 文字渲染失败退化纯色编号块',
  '    await compose(false).toFile(args.outPath)',
  '  }',
  '  return { width: totalWidth, height: totalHeight, members: outMembers }',
  '}',
  '',
  '// 人像宫格拼接（portrait.service 导出）：horizontal / vertical / 2x2',
  'async function compositeGrid(args) {',
  '  const images = []',
  '  for (const p of args.paths) {',
  '    images.push({ buffer: await sharp(p).png().toBuffer(), metadata: await sharp(p).metadata() })',
  '  }',
  '  const layout = args.layout || "horizontal"',
  '  let outputWidth = 0, outputHeight = 0',
  '  if (layout === "horizontal") {',
  '    outputWidth = images.reduce(function (s, i) { return s + (i.metadata.width || 0) }, 0)',
  '    outputHeight = Math.max.apply(null, images.map(function (i) { return i.metadata.height || 0 }))',
  '  } else if (layout === "vertical") {',
  '    outputWidth = Math.max.apply(null, images.map(function (i) { return i.metadata.width || 0 }))',
  '    outputHeight = images.reduce(function (s, i) { return s + (i.metadata.height || 0) }, 0)',
  '  } else {',
  '    const cols = 2',
  '    const rows = Math.ceil(images.length / cols)',
  '    const maxWidth = Math.max.apply(null, images.map(function (i) { return i.metadata.width || 0 }))',
  '    const maxHeight = Math.max.apply(null, images.map(function (i) { return i.metadata.height || 0 }))',
  '    outputWidth = maxWidth * cols',
  '    outputHeight = maxHeight * rows',
  '  }',
  '  const compositeOps = []',
  '  let x = 0, y = 0, col = 0',
  '  for (const img of images) {',
  '    compositeOps.push({ input: img.buffer, left: x, top: y })',
  '    if (layout === "horizontal") { x += img.metadata.width || 0 }',
  '    else if (layout === "vertical") { y += img.metadata.height || 0 }',
  '    else {',
  '      col++',
  '      if (col >= 2) { col = 0; x = 0; y += img.metadata.height || 0 }',
  '      else { x += img.metadata.width || 0 }',
  '    }',
  '  }',
  '  await sharp({ create: { width: outputWidth, height: outputHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })',
  '    .composite(compositeOps)',
  '    .png()',
  '    .toFile(args.outPath)',
  '  return { width: outputWidth, height: outputHeight }',
  '}',
  '',
  '// 分镜缩略图切片：大图按区域切 jpeg',
  'async function extractRegions(args) {',
  '  const written = []',
  '  for (const r of args.regions) {',
  '    let pipeline = sharp(args.imagePath).extract({ left: r.left, top: r.top, width: r.width, height: r.height })',
  '    if (args.format === "jpeg") pipeline = pipeline.jpeg({ quality: args.quality || 88 })',
  '    else pipeline = pipeline.png()',
  '    await pipeline.toFile(r.outPath)',
  '    written.push(r.outPath)',
  '  }',
  '  return { written: written }',
  '}',
  '',
  'async function handle(msg) {',
  '  const op = msg.op, args = msg.args || {}',
  '  try {',
  '    let result',
  '    if (op === "aHash") {',
  '      result = fs.existsSync(args.imagePath) ? await aHashHex(args.imagePath).catch(function () { return null }) : null',
  '    } else if (op === "hashDistance") {',
  '      if (!fs.existsSync(args.pathA) || !fs.existsSync(args.pathB)) { result = null }',
  '      else {',
  '        try {',
  '          const ha = await aHashHex(args.pathA)',
  '          const hb = await aHashHex(args.pathB)',
  '          result = hammingHex(ha, hb)',
  '        } catch (e) { result = null }',
  '      }',
  '    } else if (op === "imageStats") {',
  '      result = fs.existsSync(args.imagePath) ? await imageStats(args.imagePath).catch(function () { return null }) : null',
  '    } else if (op === "probe") {',
  '      try {',
  '        const input = args.path ? args.path : Buffer.from(args.bufferBase64, "base64")',
  '        const meta = await sharp(input).metadata()',
  '        result = { width: meta.width || null, height: meta.height || null, format: meta.format || null }',
  '      } catch (e) { result = null }',
  '    } else if (op === "makeBoard") {',
  '      result = await makeBoard(args)',
  '    } else if (op === "compositeGrid") {',
  '      result = await compositeGrid(args)',
  '    } else if (op === "extractRegions") {',
  '      result = await extractRegions(args)',
  '    } else {',
  '      throw new Error("unknown op: " + op)',
  '    }',
  '    reply({ id: msg.id, ok: true, result: result })',
  '  } catch (e) {',
  '    reply({ id: msg.id, ok: false, error: (e && e.message) ? e.message : String(e) })',
  '  }',
  '}',
  '',
  'if (parentPort) parentPort.on("message", function (e) { handle(e.data) })',
  'else process.on("message", handle)',
  '',
].join('\n')

/** 归一化的子进程句柄（utilityProcess 与 child_process 消息 API 差异抹平） */
interface ChildHandle {
  send(msg: unknown): void
  onMessage(cb: (msg: { id: number; ok: boolean; result?: unknown; error?: string }) => void): void
  onExit(cb: (code: number | null) => void): void
  kill(): void
}

interface PendingEntry {
  resolve: (v: any) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

/** runner 落盘目录：dataPath/.workers；PathProvider 未初始化（单测）→ 系统临时目录 */
function runnerDir(): string {
  try {
    return path.join(getPathProvider().getDataPath(), '.workers')
  } catch {
    return path.join(os.tmpdir(), 'the-bot-sharp-worker')
  }
}

/** runner 落盘（内容变化才重写），返回 runner 路径 */
function ensureRunnerFile(): string {
  const dir = runnerDir()
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'sharp-worker.js')
  try {
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === RUNNER_SOURCE) return p
  } catch { /* 读失败按重写处理 */ }
  fs.writeFileSync(p, RUNNER_SOURCE)
  return p
}

/** sharp 的绝对解析路径传给子进程（子进程 cwd 不在项目内也能加载） */
function resolveSharpPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require.resolve('sharp')
}

/** 优先 utilityProcess（Electron 主进程），退回 child_process.fork（Web / 单测） */
function forkChild(runnerPath: string, sharpPath: string): ChildHandle {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const e = require('electron')
    if (e?.utilityProcess) {
      const child = e.utilityProcess.fork(runnerPath, [sharpPath], {
        serviceName: 'sharp-worker',
      })
      return {
        send: (m) => child.postMessage(m),
        onMessage: (cb) => child.on('message', cb),
        onExit: (cb) => child.on('exit', cb),
        kill: () => child.kill(),
      }
    }
  } catch {
    // 非 Electron 端 / utilityProcess 不可用 → 走 child_process
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { fork } = require('child_process') as typeof import('child_process')
  const child = fork(runnerPath, [sharpPath], {
    // Electron 二进制当纯 node 跑（Web 端该变量无害）；stdio 带 ipc 通道
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  return {
    send: (m) => child.send(m as any),
    onMessage: (cb) => child.on('message', cb as any),
    onExit: (cb) => child.on('exit', cb),
    kill: () => child.kill(),
  }
}

export class SharpWorker {
  private child: ChildHandle | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingEntry>()
  /** 串行队列：任一时刻子进程只跑一个 op（libvips 线程池在子进程内自己并发无益） */
  private chain: Promise<unknown> = Promise.resolve()

  /**
   * 调一个 op（串行排队，60s 超时）。子进程崩溃/超时自动重启，后续调用不受影响。
   * op 级错误（图不可读等）按各 op 约定返回 null 或 reject。
   */
  call<T>(op: string, args: Record<string, unknown>, timeoutMs = CALL_TIMEOUT_MS): Promise<T> {
    const run = this.chain.then(() => this.callNow<T>(op, args, timeoutMs))
    this.chain = run.catch(() => {})
    return run
  }

  /** 测试/关机用：杀掉子进程 */
  dispose(): void {
    const c = this.child
    this.child = null
    if (c) {
      try { c.kill() } catch { /* 已退出 */ }
    }
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('sharp worker 已 dispose'))
    }
    this.pending.clear()
  }

  private callNow<T>(op: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
    this.ensureChild()
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        // 超时视为子进程卡死：重启，避免后续调用全部堵死
        this.restart()
        reject(new Error(`sharp worker 调用超时（${timeoutMs}ms，op=${op}）`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.child!.send({ id, op, args })
    })
  }

  private ensureChild(): void {
    if (this.child) return
    const runnerPath = ensureRunnerFile()
    const child = forkChild(runnerPath, resolveSharpPath())
    child.onMessage((msg) => {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.ok) p.resolve(msg.result)
      else p.reject(new Error(msg.error ?? 'sharp worker op 失败'))
    })
    child.onExit((code) => {
      // 崩溃：拒绝全部在途调用，句柄清空（下次调用自动重启）
      this.child = null
      for (const [, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error(`sharp worker 子进程退出（code=${code}）`))
      }
      this.pending.clear()
      console.warn('[sharp-worker] 子进程退出（code=%s），后续调用将自动重启', code)
    })
    this.child = child
  }

  private restart(): void {
    const c = this.child
    this.child = null
    if (c) {
      try { c.kill() } catch { /* 忽略 */ }
    }
  }
}

let singleton: SharpWorker | null = null

/** 全局唯一 worker（sharp 调用全收口到一个子进程） */
export function getSharpWorker(): SharpWorker {
  if (!singleton) singleton = new SharpWorker()
  return singleton
}

/** 测试/关机用 */
export function disposeSharpWorker(): void {
  singleton?.dispose()
  singleton = null
}

// ─── 类型化 op 封装（调用方只面对这些函数） ─────────────────

/** aHash(path) → 64-bit 哈希 hex（16 字符）；不可读 → null */
export async function workerAHash(imagePath: string): Promise<string | null> {
  return getSharpWorker().call<string | null>('aHash', { imagePath })
}

/** 两图 aHash 汉明距离；任一不可读 → null */
export async function workerHashDistance(
  pathA: string,
  pathB: string,
): Promise<number | null> {
  return getSharpWorker().call<number | null>('hashDistance', { pathA, pathB })
}

export interface WorkerImageStats {
  /** aHash hex（16 字符） */
  aHash: string
  /** 整图通道标准差均值 */
  stdev: number
  /** 边缘 10% 环灰度均值/方差 */
  edgeMean: number
  edgeVar: number
}

/** 机器校验用统计包（aHash + 标准差 + 边缘白度）；不可读 → null */
export async function workerImageStats(imagePath: string): Promise<WorkerImageStats | null> {
  return getSharpWorker().call<WorkerImageStats | null>('imageStats', { imagePath })
}

export interface WorkerProbeResult {
  width: number | null
  height: number | null
  format: string | null
}

/** 图像 metadata 探测（path 或 base64 buffer 二选一）；解析失败 → null */
export async function workerProbe(input: {
  path?: string
  bufferBase64?: string
}): Promise<WorkerProbeResult | null> {
  return getSharpWorker().call<WorkerProbeResult | null>('probe', { ...input })
}

export interface WorkerBoardMemberInput {
  /** 绝对路径 */
  imagePath: string
  assetImageId: string
  name: string
  kind: 'character' | 'location' | 'item'
}

export interface WorkerBoardResult {
  width: number
  height: number
  /** 实际入板成员（跳过不可读的），slot 已重排 */
  members: Array<{ assetImageId: string; name: string; kind: string; slot: number }>
}

/** 编号参考板拼接；全部不可读 → reject */
export async function workerMakeBoard(args: {
  members: WorkerBoardMemberInput[]
  outPath: string
}): Promise<WorkerBoardResult> {
  return getSharpWorker().call<WorkerBoardResult>('makeBoard', { ...args })
}

/** 人像宫格拼接（horizontal / vertical / 2x2）；任一图不可读 → reject */
export async function workerCompositeGrid(args: {
  paths: string[]
  layout: string
  outPath: string
}): Promise<{ width: number; height: number }> {
  return getSharpWorker().call<{ width: number; height: number }>('compositeGrid', { ...args })
}

/** 区域切片（分镜缩略图）；返回成功写出的路径 */
export async function workerExtractRegions(args: {
  imagePath: string
  regions: Array<{ left: number; top: number; width: number; height: number; outPath: string }>
  format?: 'jpeg' | 'png'
  quality?: number
}): Promise<{ written: string[] }> {
  return getSharpWorker().call<{ written: string[] }>('extractRegions', { ...args })
}
