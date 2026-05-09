<template>
  <!--
    LineageOverlay · 局部子画布连线（spec 2026-05-09 ep-redesign §3.2 C2 · P-17）

    把分镜中心化的 4 个 panel（资产 / 关键帧 / 视频片段 / 视频预览）的数据流可视化：
      资产 → 关键帧（reference image）
      关键帧 → 视频（keyframes2video / image2video）
      （reference image 优先级链：binding → storyboard → keyframe override）

    只读 SVG overlay：
      - 绝对定位覆盖在父容器（StageProductionViewV2 的 content-grid）上
      - 通过 props 传 4 个 panel 的 ref（HTMLElement），用 getBoundingClientRect 反查位置
      - 用 ResizeObserver / window scroll/resize 监听位置变化重算 path

    双母语：
      大众用户 → debug 工具，看清 AI 怎么把素材组合的
      专业用户 → 排查"主图改了但变体没跟"等链路问题

    本 phase 实现：基础 SVG 连线 + 自动重算 + 标签 hover；不可编辑（只读）
  -->
  <div ref="overlayRef" class="lineage-overlay">
    <svg v-if="ready" :width="svgSize.w" :height="svgSize.h" class="lineage-svg" :style="svgStyle">
      <!-- 资产 → 关键帧 -->
      <g v-if="assetToKeyframe">
        <path
          :d="assetToKeyframe.path"
          stroke="#409eff"
          stroke-width="2"
          fill="none"
          stroke-dasharray="6 4"
          opacity="0.7"
        />
        <text
          :x="assetToKeyframe.midX"
          :y="assetToKeyframe.midY - 4"
          fill="#409eff"
          font-size="11"
          text-anchor="middle"
        >reference image</text>
      </g>

      <!-- 关键帧 → 视频 -->
      <g v-if="keyframeToVideo">
        <path
          :d="keyframeToVideo.path"
          stroke="#67c23a"
          stroke-width="2"
          fill="none"
          stroke-dasharray="6 4"
          opacity="0.7"
        />
        <text
          :x="keyframeToVideo.midX"
          :y="keyframeToVideo.midY - 4"
          fill="#67c23a"
          font-size="11"
          text-anchor="middle"
        >keyframes2video</text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface PanelRefs {
  /** 资产引用卡（缩略图 + 选图 dialog 入口） */
  assetCard?: HTMLElement | null
  /** 关键帧序列卡（KeyframeGrid） */
  keyframeCard?: HTMLElement | null
  /** 视频预览卡 */
  videoCard?: HTMLElement | null
  /** 父容器（用作 SVG 坐标基准） */
  containerEl?: HTMLElement | null
}

const props = defineProps<{ panelRefs: PanelRefs }>()

const overlayRef = ref<HTMLElement | null>(null)
const ready = ref(false)
const svgSize = ref<{ w: number; h: number }>({ w: 0, h: 0 })
const svgStyle = ref<Record<string, string>>({})

interface PathInfo {
  path: string
  midX: number
  midY: number
}

const assetToKeyframe = ref<PathInfo | null>(null)
const keyframeToVideo = ref<PathInfo | null>(null)

function rectIn(el: HTMLElement | null | undefined, container: DOMRect): DOMRect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return new DOMRect(r.left - container.left, r.top - container.top, r.width, r.height)
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x
  const c1x = from.x + dx * 0.5
  const c1y = from.y
  const c2x = from.x + dx * 0.5
  const c2y = to.y
  return `M${from.x},${from.y} C${c1x},${c1y} ${c2x},${c2y} ${to.x},${to.y}`
}

function recalc(): void {
  const container = props.panelRefs.containerEl
  if (!container) {
    ready.value = false
    return
  }
  const containerRect = container.getBoundingClientRect()
  svgSize.value = { w: containerRect.width, h: containerRect.height }
  svgStyle.value = {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    zIndex: '50',
  }

  const a = rectIn(props.panelRefs.assetCard, containerRect)
  const k = rectIn(props.panelRefs.keyframeCard, containerRect)
  const v = rectIn(props.panelRefs.videoCard, containerRect)

  // 资产 → 关键帧（资产 right-mid → 关键帧 left-mid 或 top-mid）
  if (a && k) {
    // 取最近边
    const fromRightMid = { x: a.x + a.width, y: a.y + a.height / 2 }
    const fromTopMid = { x: a.x + a.width / 2, y: a.y }
    const toLeftMid = { x: k.x, y: k.y + k.height / 2 }
    const toTopMid = { x: k.x + k.width / 2, y: k.y }
    // 简化：选 from-right → to-left（典型左右布局）
    let from = fromRightMid
    let to = toLeftMid
    // 如果 a 在 k 下方（垂直布局）→ 改用 from-top → to-bottom
    if (a.y > k.y + k.height) {
      from = fromTopMid
      to = { x: k.x + k.width / 2, y: k.y + k.height }
    }
    assetToKeyframe.value = {
      path: bezierPath(from, to),
      midX: (from.x + to.x) / 2,
      midY: (from.y + to.y) / 2,
    }
  } else {
    assetToKeyframe.value = null
  }

  // 关键帧 → 视频（k right-mid → v left-mid）
  if (k && v) {
    const from = { x: k.x + k.width, y: k.y + k.height / 2 }
    const to = { x: v.x, y: v.y + v.height / 2 }
    keyframeToVideo.value = {
      path: bezierPath(from, to),
      midX: (from.x + to.x) / 2,
      midY: (from.y + to.y) / 2,
    }
  } else {
    keyframeToVideo.value = null
  }

  ready.value = !!(assetToKeyframe.value || keyframeToVideo.value)
}

let ro: ResizeObserver | null = null
const onScrollOrResize = () => recalc()

onMounted(() => {
  recalc()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => recalc())
    if (props.panelRefs.containerEl) ro.observe(props.panelRefs.containerEl)
    if (props.panelRefs.assetCard) ro.observe(props.panelRefs.assetCard)
    if (props.panelRefs.keyframeCard) ro.observe(props.panelRefs.keyframeCard)
    if (props.panelRefs.videoCard) ro.observe(props.panelRefs.videoCard)
  }
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onScrollOrResize)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('scroll', onScrollOrResize, { capture: true } as any)
  window.removeEventListener('resize', onScrollOrResize)
})

// 监听 props 变化（panel ref 可能动态变化）
watch(
  () => props.panelRefs,
  () => recalc(),
  { deep: true },
)
</script>

<style scoped>
.lineage-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 50;
}

.lineage-svg {
  pointer-events: none;
}
</style>
