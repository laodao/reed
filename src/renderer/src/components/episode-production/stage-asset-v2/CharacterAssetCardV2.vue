<template>
  <!--
    CharacterAssetCardV2 · 角色资产卡（FU5-C1 / 原型 §3.D-char）

    布局：缩略图（已有主图 → 真实主图缩略；缺主图 → ⚠ 占位）/ body（标题 + 状态 tag + meta + 设定）
  -->
  <article
    class="asset-card-v2 character-card"
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
      <div v-else-if="summary.hasMain" class="thumb-emoji">👨</div>
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
        >
          主图 ✓
        </el-tag>
        <el-tag v-else type="warning" size="small" effect="light">缺主图</el-tag>
      </div>

      <div class="card-meta">
        <span>图谱 {{ summary.galleryCount }}/{{ desiredCount }}</span>
        <span class="meta-sep">·</span>
        <span :class="hasVoice ? 'meta-ok' : 'meta-warn'">
          声音 {{ hasVoice ? '✓' : '⚠' }}
        </span>
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
    voiceId?: string | null
  }
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'generate-main'): void
}>()

// 角色 desired = 6 view + 6 expression + 3 outfit + 4 pose = 19
const desiredCount = computed(() => 6 + 6 + 3 + 4)

const hasVoice = computed(() => Boolean((props.summary as any).voiceId))

// 主图加载失败时回退到 emoji 占位
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
