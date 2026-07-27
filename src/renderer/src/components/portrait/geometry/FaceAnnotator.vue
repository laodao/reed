<template>
  <div class="annotator">
    <div class="canvas-wrap">
      <canvas ref="glCanvas" class="gl-canvas"></canvas>
      <canvas ref="overlayCanvas" class="overlay"></canvas>
    </div>
    <div class="annotator-toolbar">
      <label class="toggle">
        <input v-model="showPointsInner" type="checkbox" @change="drawOverlay" /> 关键点
      </label>
      <label class="toggle">
        <input v-model="showThirdsInner" type="checkbox" @change="drawOverlay" /> 三庭线
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 面容标注 + 变形渲染层（照搬 face-sculpt-demo WebGL2 架构）：
 *   - glCanvas：WebGL2 规则网格变形渲染（120×150 顶点，GPU 加速）
 *   - overlayCanvas：关键点 + 三庭线标注
 *   滑块变化只更新顶点缓冲区（不重传纹理）-> 零防抖、零卡顿。
 *   canvas 用 max-width/max-height 自适应容器 -> 永不模糊、永不缩小。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Point, FaceMetrics } from './faceMetrics'
import { measureFace } from './faceMeasure'
import type { FaceMeasure } from './faceMeasure'
import { buildFieldParams } from './displacementField'
import { FaceWarpRenderer } from './gridWarpGL'
import { renderMakeup } from './makeupRenderer'
import type { MakeupState } from './makeupRenderer'
import type { WarpParams } from './bandWarp'
import { LM_GLABELLA, LM_SUBNASALE, LM_CHIN_BOTTOM } from './landmarkIndices'

const props = withDefaults(defineProps<{
  /** 原图 URL（纹理源） */
  imageSrc: string
  /** 原始关键点（像素坐标，基于原图尺寸） */
  landmarks: Point[]
  /** 变形参数 */
  warpParams: WarpParams
  /** 妆容状态 */
  makeupState: MakeupState
  /** 变形后关键点（像素坐标，用于 overlay 画点） */
  overlayLandmarks: Point[]
  /** 变形后面容指标（用于三庭线） */
  overlayMetrics: FaceMetrics | null
  showPoints?: boolean
  showThirds?: boolean
}>(), {
  showPoints: true,
  showThirds: true,
})

const glCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const showPointsInner = ref(props.showPoints)
const showThirdsInner = ref(props.showThirds)

let renderer: FaceWarpRenderer | null = null
let imgEl: HTMLImageElement | null = null
let M: FaceMeasure | null = null
let normLM: Point[] = []
let makeupCanvas: HTMLCanvasElement | null = null
let imgReady = false

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

function normalizeLM(lm: Point[], srcW: number, srcH: number): Point[] {
  return lm.map(p => ({ x: p.x / srcW, y: p.y / srcH, z: p.z }))
}

/** 合成妆容纹理（显示尺寸 512 上限）并上传到 GPU */
function rebuildTexture() {
  if (!renderer || !imgEl) return
  const maxW = 512
  const scale = Math.min(1, maxW / imgEl.naturalWidth)
  const W = Math.max(1, Math.round(imgEl.naturalWidth * scale))
  const H = Math.max(1, Math.round(imgEl.naturalHeight * scale))
  if (!makeupCanvas) makeupCanvas = document.createElement('canvas')
  makeupCanvas.width = W
  makeupCanvas.height = H
  const mctx = makeupCanvas.getContext('2d')!
  renderMakeup(mctx, imgEl, normLM, W, H, props.makeupState)
  renderer.uploadTexture(makeupCanvas)
}

/** 变形渲染（滑块变化只走这里--不重传纹理，GPU 顶点更新极快，无需防抖） */
function renderWarpView() {
  if (!renderer || !imgReady) return
  if (M) {
    const F = buildFieldParams(M, props.warpParams)
    renderer.renderWarp(M, F)
  } else {
    renderer.renderIdentity()
  }
  drawOverlay()
}

/** 三庭线 + 关键点 overlay（坐标与 gl canvas 内部分辨率对齐） */
function drawOverlay() {
  const overlay = overlayCanvas.value
  const gl = glCanvas.value
  if (!overlay || !gl || !imgEl) return
  overlay.width = gl.width
  overlay.height = gl.height
  const ctx = overlay.getContext('2d')!
  ctx.clearRect(0, 0, overlay.width, overlay.height)
  if (!props.overlayLandmarks.length) return
  const srcW = imgEl.naturalWidth, srcH = imgEl.naturalHeight

  // 三庭线
  if (showThirdsInner.value && props.overlayMetrics) {
    const glabella = props.overlayLandmarks[LM_GLABELLA]
    const subnasale = props.overlayLandmarks[LM_SUBNASALE]
    const chin = props.overlayLandmarks[LM_CHIN_BOTTOM]
    if (glabella && subnasale && chin) {
      const upperY = glabella.y - props.overlayMetrics.upperThird.px
      const lines = [
        { y: upperY, label: `上庭 ${props.overlayMetrics.upperThird.px}px（估计）`, dashed: true, color: '#f0ad4e' },
        { y: glabella.y, label: `眉心`, dashed: false, color: '#4a90e2' },
        { y: subnasale.y, label: `中庭 ${props.overlayMetrics.midThird.px}px`, dashed: false, color: '#4a90e2' },
        { y: chin.y, label: `下庭 ${props.overlayMetrics.lowerThird.px}px`, dashed: false, color: '#4a90e2' },
      ]
      ctx.font = '11px sans-serif'
      for (const line of lines) {
        const y = line.y / srcH * overlay.height
        ctx.strokeStyle = line.color
        ctx.lineWidth = 1.5
        ctx.setLineDash(line.dashed ? [5, 4] : [])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(overlay.width, y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = line.color
        ctx.fillText(line.label, 4, y - 4)
      }
    }
  }

  // 关键点
  if (showPointsInner.value) {
    ctx.fillStyle = 'rgba(74, 144, 226, 0.45)'
    for (const p of props.overlayLandmarks) {
      ctx.beginPath()
      ctx.arc(p.x / srcW * overlay.width, p.y / srcH * overlay.height, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

async function initImage(url: string) {
  imgReady = false
  try {
    imgEl = await loadImg(url)
    imgReady = true
    if (props.landmarks.length) {
      normLM = normalizeLM(props.landmarks, imgEl.naturalWidth, imgEl.naturalHeight)
      M = measureFace(normLM)
    }
    rebuildTexture()
    renderWarpView()
  } catch (e) {
    console.warn('[FaceAnnotator] 图片加载失败:', e)
  }
}

// 图片变化：重新加载 + 重测
watch(() => props.imageSrc, (url) => { if (url) initImage(url) })

// 关键点变化：归一化 + 测量 + 渲染
watch(() => props.landmarks, (lm) => {
  if (!imgEl || !lm.length) return
  normLM = normalizeLM(lm, imgEl.naturalWidth, imgEl.naturalHeight)
  M = measureFace(normLM)
  renderWarpView()
}, { deep: true })

// 滑块变化：只更新顶点缓冲区（WebGL 足够快，零防抖）
watch(() => props.warpParams, renderWarpView, { deep: true })

// 妆容变化：重合成纹理上传
watch(() => props.makeupState, () => {
  if (!imgReady) return
  rebuildTexture()
  renderWarpView()
}, { deep: true })

// overlay 数据变化
watch(() => [props.overlayLandmarks, props.overlayMetrics], drawOverlay, { deep: true })

onMounted(async () => {
  if (!glCanvas.value) return
  try {
    renderer = new FaceWarpRenderer(glCanvas.value)
  } catch (e) {
    console.error('[FaceAnnotator] WebGL2 初始化失败:', e)
    return
  }
  if (props.imageSrc) await initImage(props.imageSrc)
})

onBeforeUnmount(() => {
  renderer?.dispose()
  renderer = null
})

/** 全分辨率导出 dataURL（保存/AI 生成用，照搬 demo 下载逻辑） */
defineExpose({
  exportFull(): string | null {
    if (!renderer || !M || !imgEl) return null
    const mc = document.createElement('canvas')
    mc.width = imgEl.naturalWidth
    mc.height = imgEl.naturalHeight
    const mctx = mc.getContext('2d')!
    renderMakeup(mctx, imgEl, normLM, mc.width, mc.height, props.makeupState)
    const F = buildFieldParams(M, props.warpParams)
    return renderer.exportFull(mc, M, F)
  },
})
</script>

<style lang="scss" scoped>
.annotator {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.canvas-wrap {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  line-height: 0;
}
.gl-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: var(--radius-md);
  background: #1a1d24;
}
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.annotator-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 10px;
  background: rgba(15, 20, 25, 0.55);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  pointer-events: auto;
  z-index: 2;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--fill-color-blank);
  cursor: pointer;
  user-select: none;
}
</style>
