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
      <div v-if="summary.hasMain" class="thumb-emoji">🏛</div>
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

      <div class="card-actions" @click.stop>
        <el-button
          v-if="!summary.hasMain"
          size="small"
          type="primary"
          @click="emit('generate-main')"
        >
          <el-icon><MagicStick /></el-icon>
          ✨ 生成主图
        </el-button>
        <template v-else>
          <el-button size="small" @click="emit('click')">设定</el-button>
          <el-button size="small" @click="emit('click')">
            {{ hasPanorama ? '3D 编辑' : '图谱' }}
          </el-button>
        </template>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MagicStick } from '@element-plus/icons-vue'
import AssetSourceTag from '../shared/AssetSourceTag.vue'

const props = defineProps<{
  summary: {
    bindingId: string
    name: string
    sourceType: 'linked_lw' | 'standalone'
    hasMain: boolean
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
</script>

<style scoped lang="scss">
@use './asset-card-v2.scss';
</style>
