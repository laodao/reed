/**
 * 规则网格变形渲染（WebGL2 版，照搬 face-sculpt-demo app.js 渲染层）
 * @module portrait/geometry/gridWarpGL
 * @description 120×150 规则网格，顶点着色器位移 + 纹理采样，GPU 加速。
 *   滑块变化只更新顶点缓冲区（DYNAMIC_DRAW），不重传纹理 -> 拖动零卡顿。
 *   canvas 内部分辨率限制 512 宽（与 demo 一致），CSS max-width/max-height 自适应 ->
 *   永不模糊、永不缩小。导出时临时放大到原图分辨率重渲。
 *
 *   逻辑层（measureFace/buildFieldParams/evalField）复用 displacementField/faceMeasure，
 *   本模块只负责 WebGL 渲染管线。
 */
import type { FaceMeasure } from './faceMeasure'
import type { FieldParams } from './displacementField'
import { evalField } from './displacementField'

/** 显示尺寸上限（照搬 face-sculpt-demo maxW=512） */
const MAX_DISPLAY_W = 512
/** 网格分辨率（与 demo 一致：120×150） */
const COLS = 120, ROWS = 150
const NX = COLS + 1, NY = ROWS + 1
const VCOUNT = NX * NY

const VERT_SRC = `#version 300 es
in vec2 a_uv;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() { outColor = texture(u_tex, v_uv); }`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    throw new Error('着色器编译失败: ' + log)
  }
  return s
}

/**
 * WebGL2 面容变形渲染器。
 * 生命周期：new FaceWarpRenderer(canvas) -> uploadTexture(source) -> renderWarp/renderIdentity
 *           -> exportFull(source, M, F) -> dispose()
 */
export class FaceWarpRenderer {
  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private posBuf: WebGLBuffer
  private tex: WebGLTexture
  private posArr = new Float32Array(VCOUNT * 2)
  private gridX = new Float32Array(VCOUNT)
  private gridY = new Float32Array(VCOUNT)
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 不可用，无法渲染面容变形')
    this.gl = gl

    // 着色器
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT_SRC))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(program))
    }
    gl.useProgram(program)
    this.program = program

    // 规则网格顶点（归一化 0..1）
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i
        const x = i / COLS, y = j / ROWS
        this.gridX[k] = x
        this.gridY[k] = y
      }
    }
    const uvArr = new Float32Array(VCOUNT * 2)
    for (let k = 0; k < VCOUNT; k++) {
      uvArr[k * 2] = this.gridX[k]
      uvArr[k * 2 + 1] = this.gridY[k]
    }

    // 索引（每 cell 2 三角形）
    const indices = new Uint32Array(COLS * ROWS * 6)
    let p = 0
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1
        indices[p++] = a; indices[p++] = b; indices[p++] = d
        indices[p++] = a; indices[p++] = d; indices[p++] = c
      }
    }

    const locUV = gl.getAttribLocation(program, 'a_uv')
    const locPos = gl.getAttribLocation(program, 'a_pos')

    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)

    const uvBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf)
    gl.bufferData(gl.ARRAY_BUFFER, uvArr, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(locUV)
    gl.vertexAttribPointer(locUV, 2, gl.FLOAT, false, 0, 0)

    const posBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, this.posArr, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(locPos)
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0)

    const idxBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    this.vao = vao
    this.posBuf = posBuf

    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.tex = tex
  }

  /** 上传纹理，并按 source 尺寸设置 canvas 内部分辨率（限制最大显示宽） */
  uploadTexture(source: HTMLImageElement | HTMLCanvasElement): void {
    const sw = source instanceof HTMLImageElement ? source.naturalWidth : source.width
    const sh = source instanceof HTMLImageElement ? source.naturalHeight : source.height
    const scale = Math.min(1, MAX_DISPLAY_W / sw)
    this.canvas.width = Math.max(1, Math.round(sw * scale))
    this.canvas.height = Math.max(1, Math.round(sh * scale))

    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  /** 变形渲染：对每个网格顶点用 evalField 求变形后位置，写入顶点缓冲区并绘制 */
  renderWarp(M: FaceMeasure, F: FieldParams): void {
    for (let k = 0; k < VCOUNT; k++) {
      const [X, Y] = evalField(this.gridX[k], this.gridY[k], F, M)
      this.posArr[k * 2] = X * 2 - 1
      this.posArr[k * 2 + 1] = 1 - Y * 2
    }
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.posArr)
    this.draw()
  }

  /** 原图渲染（无变形，顶点=网格原位） */
  renderIdentity(): void {
    for (let k = 0; k < VCOUNT; k++) {
      this.posArr[k * 2] = this.gridX[k] * 2 - 1
      this.posArr[k * 2 + 1] = 1 - this.gridY[k] * 2
    }
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.posArr)
    this.draw()
  }

  private draw(): void {
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, COLS * ROWS * 6, gl.UNSIGNED_INT, 0)
  }

  /**
   * 全分辨率导出 dataURL（照搬 demo 下载逻辑）。
   * 临时放大 canvas 到原图尺寸重渲，导出后恢复显示尺寸与纹理。
   * @param source 已合成妆容的纹理源（原图或妆容 canvas）
   */
  exportFull(source: HTMLImageElement | HTMLCanvasElement, M: FaceMeasure, F: FieldParams): string {
    const gl = this.gl
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    const sw = source instanceof HTMLImageElement ? source.naturalWidth : source.width
    const sh = source instanceof HTMLImageElement ? source.naturalHeight : source.height
    const scale = Math.min(1, maxTex / sw, maxTex / sh)
    const fullW = Math.max(1, Math.round(sw * scale))
    const fullH = Math.max(1, Math.round(sh * scale))

    const dispW = this.canvas.width, dispH = this.canvas.height
    // 上传全分辨率纹理 -> 放大 canvas -> 重渲 -> 导出
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    this.canvas.width = fullW
    this.canvas.height = fullH
    this.renderWarp(M, F)
    const url = this.canvas.toDataURL('image/png')
    // 恢复显示尺寸与显示纹理
    this.canvas.width = dispW
    this.canvas.height = dispH
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    this.renderWarp(M, F)
    return url
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    gl.deleteTexture(this.tex)
    gl.deleteBuffer(this.posBuf)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
  }
}
