<template>
  <!--
    ItemAssetCardV2 · 物品资产卡（FU5-C1 / 原型 §3.D-item）

    物品 meta 维度：N 视角 · M 上下文（held / on_table / 等）
  -->
  <article
    class="asset-card-v2 item-card"
    :class="{ 'no-main': !summary.hasMain }"
    @click="emit('click')"
  >
    <div class="card-thumb" :class="{ warn: !summary.hasMain }">
      <img
        v-if="summary.hasMain && mainImageUrl"
        :src="mainImageUrl"
        class="thumb-image"
        :alt="summary.name"
        @error="onImgError"
      />
      <div v-else-if="summary.hasMain" class="thumb-emoji">📦</div>
      <div v-else class="thumb-empty">⚠</div>
      <AssetSourceTag :source="summary.sourceType" variant="badge" />
    </div>

    <div class="card-body">
      <div class="card-title">
        <span class="title-name">{{ summary.name }}</span>
        <el-tag
          v-if="summary.hasMain"
          type="success"
          size="small"
          effect="light"
        >主图 ✓</el-tag>
        <el-tag v-else type="warning" size="small" effect="light">缺主图</el-tag>
      </div>

      <div class="card-meta">
        <span>{{ viewCount }} 视角</span>
        <span class="meta-sep">·</span>
        <span>{{ contextCount }} 上下文</span>
      </div>

    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AssetSourceTag from '../shared/AssetSourceTag.vue'
import { toImageUrl } from '@/utils/asset-url'

const props = defineProps<{
  summary: {
    bindingId: string
    name: string
    sourceType: 'linked_lw' | 'standalone'
    hasMain: boolean
    mainImagePath?: string
    galleryCount: number
    categoryCounts: Record<string, number>
  }
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'generate-main'): void
}>()

const viewCount = computed(() => props.summary.categoryCounts.view ?? 0)
const contextCount = computed(() => props.summary.categoryCounts.context ?? 0)

const imgFailed = ref(false)
watch(() => props.summary.mainImagePath, () => { imgFailed.value = false })
const mainImageUrl = computed(() =>
  imgFailed.value ? '' : toImageUrl(props.summary.mainImagePath),
)
function onImgError(): void {
  imgFailed.value = true
}
</script>

<style scoped lang="scss">
@use './asset-card-v2.scss';
</style>
