<template>
  <div class="fgp-page">
    <!-- query 参数齐全才渲染工作室；缺失时给出提示，避免 variant 为 null 导致
         FaceGeometryStudio 读取 imagePath 崩溃 -->
    <FaceGeometryStudio v-if="variant" :variant="variant" @saved="onSaved" />
    <div v-else class="fgp-error">
      <div class="fgp-error-ico">?</div>
      <p>缺少有效的面容分析参数（变体/图片信息）。</p>
      <el-button @click="$router.push('/portrait')">返回人像设计</el-button>
    </div>
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
.fgp-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);

  .fgp-error-ico {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--fill-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    color: var(--text-placeholder);
  }
}
</style>
