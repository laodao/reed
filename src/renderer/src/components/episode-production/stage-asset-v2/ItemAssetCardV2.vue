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
      <div v-if="summary.hasMain" class="thumb-emoji">📦</div>
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
          <el-button size="small" @click="emit('click')">图谱</el-button>
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

const viewCount = computed(() => props.summary.categoryCounts.view ?? 0)
const contextCount = computed(() => props.summary.categoryCounts.context ?? 0)
</script>

<style scoped lang="scss">
@use './asset-card-v2.scss';
</style>
