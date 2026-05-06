<template>
  <!--
    LocationAssetCardV2 · 地点资产卡（FU5-C1 / 原型 §3.D-loc）

    地点 meta 维度：N 时间 · M 天气 · P 视角；带 panorama_360 时标 3D。
  -->
  <article
    class="asset-card-v2 location-card"
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
      <div v-else-if="summary.hasMain" class="thumb-emoji">🏛</div>
      <div v-else class="thumb-empty">⚠</div>
      <AssetSourceTag
        :source="hasPanorama ? '3d' : summary.sourceType"
        variant="badge"
      />
    </div>

    <div class="card-body">
      <div class="card-title">
        <span class="title-name">{{ summary.name }}</span>
        <el-tag
          v-if="hasPanorama"
          type="danger"
          size="small"
          effect="light"
        >
          3D 已升级
        </el-tag>
        <el-tag
          v-else-if="summary.hasMain"
          type="success"
          size="small"
          effect="light"
        >
          主图 ✓
        </el-tag>
        <el-tag v-else type="warning" size="small" effect="light">缺主图</el-tag>
      </div>

      <div class="card-meta">
        <span>{{ timeCount }} 时间</span>
        <span class="meta-sep">·</span>
        <span>{{ weatherCount }} 天气</span>
        <span class="meta-sep">·</span>
        <span>{{ angleCount }} 视角</span>
        <template v-if="hasPanorama">
          <span class="meta-sep">·</span>
          <span class="meta-ok">360 全景</span>
        </template>
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

const timeCount = computed(() => props.summary.categoryCounts.time_variant ?? 0)
const weatherCount = computed(
  () => props.summary.categoryCounts.weather_variant ?? 0,
)
const angleCount = computed(
  () => props.summary.categoryCounts.angle_variant ?? 0,
)
const hasPanorama = computed(
  () => (props.summary.categoryCounts.panorama_360 ?? 0) > 0,
)

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
