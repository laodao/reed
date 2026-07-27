<template>
  <div class="fgp-page">
    <div v-if="loading" class="fgp-loading">加载变体数据…</div>
    <div v-else-if="error" class="fgp-error">{{ error }}</div>
    <FaceGeometryStudio v-else :variant="variant!" @saved="onSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import FaceGeometryStudio from '@/components/portrait/geometry/FaceGeometryStudio.vue'
import type { PortraitVariant } from '@shared/types/portrait.types'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const variant = ref<PortraitVariant | null>(null)

onMounted(async () => {
  const characterId = route.query.characterId as string
  const variantId = route.query.variantId as string
  if (!characterId || !variantId) { error.value = '缺少参数'; loading.value = false; return }
  try {
    const result = await window.electronAPI.portrait.getVariant(variantId)
    if (result.success && result.data) {
      variant.value = result.data
    } else {
      error.value = result.error || '变体加载失败'
    }
  } catch (e: any) {
    error.value = e.message || '加载失败'
  }
  loading.value = false
})

function onSaved() { /* emit nothing — 父页面通过 api 刷新数据 */ }
</script>

<style lang="scss" scoped>
.fgp-page { height: 100%; overflow: auto; }
.fgp-loading, .fgp-error { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-secondary); }
.fgp-error { color: var(--color-danger); }
</style>
