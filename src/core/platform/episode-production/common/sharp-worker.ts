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
  '// R2 板复刻检测：红徽章统计（色相红 r>150 且 r-g>70 且 r-b>70；徽章 #c0392b 含抗锯齿边缘）',
  '// 返回 redRatio（占比）+ redConcentration（红点最密的两个 1/16 格子占全部红点比例，',
  '// 编号徽章是"集中于小圆点"，灯笼/红衣等真实红色元素是散开的）',
  'async function redBadgeStats(p) {',
  '  const r = await sharp(p).raw().toBuffer({ resolveWithObject: true })',
  '  const data = r.data, ch = r.info.channels, W = r.info.width, H = r.info.height',
  '  const gw = 16, gh = 16',
  '  const cellRed = new Array(gw * gh).fill(0)',
  '  let red = 0',
  '  for (let y = 0; y < H; y++) {',
  '    for (let x = 0; x < W; x++) {',
  '      const i = (y * W + x) * ch',
  '      const rr = data[i], gg = data[i + 1], bb = data[i + 2]',
  '      if (rr > 150 && rr - gg > 70 && rr - bb > 70) {',
  '        red++',
  '        const c = Math.min(gh - 1, Math.floor(y / H * gh)) * gw + Math.min(gw - 1, Math.floor(x / W * gw))',
  '        cellRed[c]++',
  '      }',
  '    }',
  '  }',
  '  const total = W * H',
  '  let m1 = 0, m2 = 0',
  '  for (const c of cellRed) { if (c > m1) { m2 = m1; m1 = c } else if (c > m2) { m2 = c } }',
  '  return { redRatio: total ? red / total : 0, redConcentration: red ? (m1 + m2) / red : 0 }',
  '}',
  '',
  '// R2：关键帧 vs 参考板（aHash 距离 + 红徽章统计），任一文件不可读 → null',
  'async function boardCopyCheck(args) {',
  '  if (!fs.existsSync(args.keyframePath) || !fs.existsSync(args.boardPath)) return null',
  '  try {',
  '    const ha = await aHashHex(args.keyframePath)',
  '    const hb = await aHashHex(args.boardPath)',
  '    const stats = await redBadgeStats(args.keyframePath)',
  '    return { dist: hammingHex(ha, hb), redRatio: stats.redRatio, redConcentration: stats.redConcentration }',
  '  } catch (e) { return null }',
  '}',
  '',
  '// 场景优先合成锚定（2026-09-21 设计转向：废弃拼板喂 kontext——编辑模型输入即画布，',
  '// 拼板→输出板。改为 T2I 场景草稿 + 白底角色抠图贴入 + kontext 融合）',
  '// 白底抠图：near-white（默认 r/g/b 全 >240）透明化 + alpha 通道 blur 羽化去白边',
  'async function cutoutWhiteBg(imagePath, whiteThreshold) {',
  '  const th = whiteThreshold || 240',
  '  const r = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })',
  '  const data = Buffer.from(r.data) // 拷贝，不动原 buffer',
  '  const W = r.info.width, H = r.info.height',
  '  for (let i = 0; i < data.length; i += 4) {',
  '    if (data[i] > th && data[i + 1] > th && data[i + 2] > th) data[i + 3] = 0',
  '  }',
  '  // 羽化：alpha 单独取出 blur ~1.5px 再贴回（边缘白环柔化，kontext 融合再处理残余）',
  '  const alpha = await sharp(data, { raw: { width: W, height: H, channels: 4 } })',
  '    .extractChannel(3).blur(1.5).toBuffer()',
  '  const rgb = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).removeAlpha().toBuffer()',
  '  return sharp(rgb, { raw: { width: W, height: H, channels: 3 } })',
  '    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })',
  '}',
  '',
  'async function compositeOntoScene(args) {',
  '  if (!fs.existsSync(args.scenePath)) throw new Error("场景草稿不可读: " + args.scenePath)',
  '  const sceneMeta = await sharp(args.scenePath).metadata()',
  '  const W = sceneMeta.width, H = sceneMeta.height',
  '  if (!W || !H) throw new Error("场景草稿尺寸不可读")',
  '  const heightRatio = args.heightRatio || 0.55',
  '  const bottomMargin = Math.round(H * (args.bottomMarginRatio || 0.08))',
  '  const targetH = Math.round(H * heightRatio)',
  '  const overlays = []',
  '  const outMembers = []',
  '  for (const m of args.members) {',
  '    if (!fs.existsSync(m.imagePath)) continue',
  '    try {',
  '      // 先落成 PNG 再缩放：raw+joinChannel 管线上直接 resize 会丢宽高比（实测 40x80→h55 得 40x55）',
  '      const cutPng = await (await cutoutWhiteBg(m.imagePath, args.whiteThreshold)).png().toBuffer()',
  '      let buf = await sharp(cutPng).resize({ height: targetH }).png().toBuffer()',
  '      const mMeta = await sharp(buf).metadata()',
  '      overlays.push({ input: buf, width: mMeta.width || targetH, height: mMeta.height || targetH, member: m })',
  '    } catch (e) { /* 单张抠图失败跳过 */ }',
  '  }',
  '  if (overlays.length === 0) throw new Error("合成锚定成员全部不可读")',
  '  // 总宽超画面 92% → 整体再缩一档',
  '  let sumW = overlays.reduce(function (s, o) { return s + o.width }, 0)',
  '  if (sumW > W * 0.92) {',
  '    const shrink = (W * 0.92) / sumW',
  '    for (const o of overlays) {',
  '      const nh = Math.max(1, Math.round(o.height * shrink))',
  '      o.input = await sharp(o.input).resize({ height: nh }).png().toBuffer()',
  '      const m2 = await sharp(o.input).metadata()',
  '      o.width = m2.width || nh',
  '      o.height = m2.height || nh',
  '    }',
  '    sumW = overlays.reduce(function (s, o) { return s + o.width }, 0)',
  '  }',
  '  // 从左到右按成员顺序均布，间距均分；基线对齐画面底部 8% 处',
  '  const gap = (W - sumW) / (overlays.length + 1)',
  '  let x = gap',
  '  const compositeOps = []',
  '  overlays.forEach(function (o, i) {',
  '    compositeOps.push({ input: o.input, left: Math.round(x), top: H - bottomMargin - o.height })',
  '    x += o.width + gap',
  '    outMembers.push({ assetImageId: o.member.assetImageId, name: o.member.name, slot: i + 1 })',
  '  })',
  '  await sharp(args.scenePath).composite(compositeOps).png().toFile(args.outPath)',
  '  return { path: args.outPath, width: W, height: H, members: outMembers }',
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
  '    } else if (op === "boardCopyCheck") {',
  '      result = await boardCopyCheck(args)',
  '    } else if (op === "compositeOntoScene") {',
  '      result = await compositeOntoScene(args)',
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

export interface WorkerBoardCopyCheck {
  /** 关键帧 vs 参考板的 aHash 汉明距离 */
  dist: number
  /** 色相红像素占比（编号徽章红） */
  redRatio: number
  /** 红点最密两个 1/16 格子占全部红点比例（小圆点集中度） */
  redConcentration: number
}

/**
 * R2 板复刻检测信号：关键帧 vs 参考板的 aHash 距离 + 红徽章统计。
 * 任一文件不可读 / sharp 失败 → null（调用方按"无法判定"放行）。
 */
export async function workerBoardCopyCheck(
  keyframePath: string,
  boardPath: string,
): Promise<WorkerBoardCopyCheck | null> {
  return getSharpWorker().call<WorkerBoardCopyCheck | null>('boardCopyCheck', {
    keyframePath,
    boardPath,
  })
}

export interface WorkerCompositeMemberInput {
  /** 角色主图绝对路径（白底全身像） */
  imagePath: string
  assetImageId: string
  name: string
}

export interface WorkerCompositeResult {
  path: string
  width: number
  height: number
  /** 实际贴入成员（跳过不可读的），slot 从左到右 1-based */
  members: Array<{ assetImageId: string; name: string; slot: number }>
}

/**
 * 场景优先合成锚定：把白底角色主图抠图（near-white 透明 + alpha 羽化）后
 * 等比缩放到画面高度 55%，从左到右均布在画面下半部（基线对齐底部 8%），
 * 合成到 T2I 场景草稿上。场景草稿不可读 / 成员全部不可读 → reject（调用方退化）。
 */
export async function workerCompositeOntoScene(args: {
  scenePath: string
  members: WorkerCompositeMemberInput[]
  outPath: string
  /** near-white 抠图阈值（默认 240） */
  whiteThreshold?: number
  /** 人物目标高度占画面比（默认 0.55） */
  heightRatio?: number
  /** 基线距画面底部占比（默认 0.08） */
  bottomMarginRatio?: number
}): Promise<WorkerCompositeResult> {
  return getSharpWorker().call<WorkerCompositeResult>('compositeOntoScene', { ...args })
}
