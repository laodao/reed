<template>
  <div class="annotator" ref="wrapRef">
    <img :src="imageSrc" class="base-img" @load="draw" />
    <canvas ref="canvasRef" class="overlay" />
    <div class="annotator-toolbar">
      <label class="toggle">
        <input v-model="showPointsInner" type="checkbox" @change="draw" /> 关键点
      </label>
      <label class="toggle">
        <input v-model="showThirdsInner" type="checkbox" @change="draw" /> 三庭线
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { Point, FaceMetrics } from './faceMetrics'
import {
  LM_GLABELLA,
  LM_SUBNASALE,
  LM_CHIN_BOTTOM,
} from './landmarkIndices'

/**
 * 面容标注层（spec §F2）：
 * 照片 + canvas 叠加关键点（可开关）与三庭分割线（上庭虚线标"估计"）。
 */
const props = withDefaults(defineProps<{
  imageSrc: string
  landmarks?: Point[]
  metrics?: FaceMetrics | null
  showPoints?: boolean
  showThirds?: boolean
}>(), {
  landmarks: () => [],
  metrics: null,
  showPoints: true,
  showThirds: true,
})

const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const showPointsInner = ref(props.showPoints)
const showThirdsInner = ref(props.showThirds)

function draw() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const img = wrap.querySelector('img')!
  const w = img.clientWidth
  const h = img.clientHeight
  if (!w || !h) return

  // 图片可能按 clientWidth 显示，按 natural 尺寸换算
  const scaleX = w / img.naturalWidth
  const scaleY = h / img.naturalHeight
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)

  // 三庭分割线
  if (showThirdsInner.value && props.metrics && props.landmarks.length) {
    const glabella = props.landmarks[LM_GLABELLA]
    const subnasale = props.landmarks[LM_SUBNASALE]
    const chin = props.landmarks[LM_CHIN_BOTTOM]
    const upperY = glabella.y - props.metrics.upperThird.px

    const lines = [
      { y: upperY, label: `上庭 ${props.metrics.upperThird.px}px（估计）`, dashed: true, color: '#f0ad4e' },
      { y: glabella.y, label: `眉心`, dashed: false, color: '#4a90e2' },
      { y: subnasale.y, label: `中庭 ${props.metrics.midThird.px}px`, dashed: false, color: '#4a90e2' },
      { y: chin.y, label: `下庭 ${props.metrics.lowerThird.px}px`, dashed: false, color: '#4a90e2' },
    ]

    ctx.font = '11px sans-serif'
    for (const line of lines) {
      const y = line.y * scaleY
      ctx.strokeStyle = line.color
      ctx.lineWidth = 1.5
      ctx.setLineDash(line.dashed ? [5, 4] : [])
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = line.color
      ctx.fillText(line.label, 4, y - 4)
    }
  }

  // 关键点
  if (showPointsInner.value && props.landmarks.length) {
    ctx.fillStyle = 'rgba(74, 144, 226, 0.45)'
    for (const p of props.landmarks) {
      ctx.beginPath()
      ctx.arc(p.x * scaleX, p.y * scaleY, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

watch(() => [props.landmarks, props.metrics], draw, { deep: true })
onMounted(draw)
</script>

<style lang="scss" scoped>
.annotator {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.base-img {
  display: block;
  max-width: 100%;
  border-radius: var(--radius-md);
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
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
