<template>
  <!--
    CharacterAssetCardV2 · 角色资产卡（FU5-C1 / 原型 §3.D-char）

    布局：缩略图（120 高 + 来源 badge + 缺图 ⚠ 占位）/ body（标题 + 状态 tag + meta + actions）

    状态：
    - 主图 ✓（success tag）：actions = [设定] [图谱]
    - 缺主图（warning tag）：actions = [✨ 生成主图]（primary）
  -->
  <article
    class="asset-card-v2 character-card"
    :class="{ 'no-main': !summary.hasMain }"
    @click="emit('click')"
  >
    <div class="card-thumb" :class="{ warn: !summary.hasMain }">
      <div v-if="summary.hasMain" class="thumb-emoji">👨</div>
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
</script>

<style scoped lang="scss">
@use './asset-card-v2.scss';
</style>
