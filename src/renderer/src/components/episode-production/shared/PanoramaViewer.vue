<template>
  <div ref="container" class="panorama-viewer" :style="{ height: height + 'px' }"></div>
</template>

<script setup lang="ts">
/**
 * 360 全景图查看器（P3c Task 6）
 * @module renderer/components/episode-production/shared/PanoramaViewer
 * @description 封装 @photo-sphere-viewer/core，提供：
 *   - 360 全景图渲染（鼠标 / 触屏拖拽 + 滚轮缩放）；
 *   - 视角变化事件 viewpoint-change（含 yaw/pitch/fov，单位：度）；
 *   - getCurrentViewpoint() 获取当前视角；
 *   - captureCanvas() 截取当前视口为 base64 jpeg。
 *
 * 注意：
 *   - photo-sphere-viewer 内部使用 radians，组件对外统一使用 degrees；
 *   - fov 与 zoom level 之间通过线性映射换算（zoom 0 ≈ fov 120°，zoom 100 ≈ fov 30°）；
 *   - captureCanvas 依赖 WebGL preserveDrawingBuffer，已在构造时开启。
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Viewer } from '@photo-sphere-viewer/core'
import '@photo-sphere-viewer/core/index.css'

const props = withDefaults(
  defineProps<{
    imagePath: string
    height?: number
    initialYaw?: number
    initialPitch?: number
    initialFov?: number
  }>(),
  {
    height: 400,
    initialYaw: 0,
    initialPitch: 0,
    initialFov: 70,
  },
)

const emit = defineEmits<{
  'viewpoint-change': [viewpoint: { yaw: number; pitch: number; fov: number }]
}>()

const container = ref<HTMLElement | null>(null)
let viewer: Viewer | null = null

function degToRad(d: number): number {
  return (d * Math.PI) / 180
}
function radToDeg(r: number): number {
  return (r * 180) / Math.PI
}

// photo-sphere-viewer 的 zoomLevel 范围 0~100：
//   zoom 0  → fov ≈ 120°（最广）
//   zoom 100 → fov ≈ 30°（最窄）
// 采用线性映射：fov = 120 - zoom * 0.9 ⇒ zoom = (120 - fov) / 0.9
function fovToZoomLvl(fovDeg: number): number {
  return Math.max(0, Math.min(100, (120 - fovDeg) / 0.9))
}
function zoomLvlToFov(zoom: number): number {
  return 120 - zoom * 0.9
}

function getCurrentViewpoint(): { yaw: number; pitch: number; fov: number } {
  if (!viewer) {
    return { yaw: 0, pitch: 0, fov: 70 }
  }
  const pos = viewer.getPosition()
  const zoom = viewer.getZoomLevel()
  return {
    yaw: Math.round(radToDeg(pos.yaw) * 100) / 100,
    pitch: Math.round(radToDeg(pos.pitch) * 100) / 100,
    fov: Math.round(zoomLvlToFov(zoom) * 100) / 100,
  }
}

async function captureCanvas(): Promise<string> {
  if (!viewer || !container.value) {
    throw new Error('Viewer 未初始化')
  }
  // photo-sphere-viewer 的 canvas 由 three.js WebGLRenderer 创建，挂在 container 内部
  const canvas = container.value.querySelector('canvas') as HTMLCanvasElement | null
  if (!canvas) {
    throw new Error('找不到全景渲染 canvas')
  }
  return canvas.toDataURL('image/jpeg', 0.92)
}

onMounted(() => {
  if (!container.value) return
  viewer = new Viewer({
    container: container.value,
    panorama: props.imagePath,
    defaultYaw: degToRad(props.initialYaw),
    defaultPitch: degToRad(props.initialPitch),
    defaultZoomLvl: fovToZoomLvl(props.initialFov),
    navbar: ['zoom', 'fullscreen'],
    // 开启 preserveDrawingBuffer 以便 toDataURL 能拿到当前画面
    rendererParameters: {
      preserveDrawingBuffer: true,
      antialias: true,
      alpha: true,
    },
  })

  viewer.addEventListener('position-updated', () => {
    emit('viewpoint-change', getCurrentViewpoint())
  })
  viewer.addEventListener('zoom-updated', () => {
    emit('viewpoint-change', getCurrentViewpoint())
  })
})

onBeforeUnmount(() => {
  viewer?.destroy()
  viewer = null
})

watch(
  () => props.imagePath,
  (newPath) => {
    if (viewer && newPath) {
      viewer.setPanorama(newPath)
    }
  },
)

defineExpose({ getCurrentViewpoint, captureCanvas })
</script>

<style scoped>
.panorama-viewer {
  width: 100%;
  min-height: 300px;
  background-color: var(--el-fill-color-darker);
  border-radius: 4px;
  overflow: hidden;
}
</style>
