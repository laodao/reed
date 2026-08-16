<template>
  <div class="fgp-page">
    <FaceGeometryStudio :variant="variant!" @saved="onSaved" />
  </div>
</template>

<script setup lang="ts">

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'FaceGeometryPage' })
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import FaceGeometryStudio from '@/components/portrait/geometry/FaceGeometryStudio.vue'
import type { PortraitVariant } from '@shared/types/portrait.types'

const route = useRoute()

// 从 query 读取变体属性，构造最小 PortraitVariant 对象
const variant = computed((): PortraitVariant | null => {
  const id = route.query.variantId as string
  const characterId = route.query.characterId as string
  const imagePath = route.query.imagePath as string
  const angle = route.query.angle as string
  if (!id || !characterId || !imagePath) return null
  return {
    id,
    characterId,
    imagePath: decodeURIComponent(imagePath),
    angle: (angle as PortraitVariant['angle']) || 'front',
    type: 'base',
    prompt: '',
    config: {},
    createdAt: 0,
  }
})

function onSaved() {}
</script>

<style lang="scss" scoped>
.fgp-page { height: 100%; overflow: auto; }
</style>
