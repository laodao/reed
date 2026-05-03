<template>
  <el-card class="asset-card" shadow="hover" body-style="padding: 8px;" @click="onCardClick">
    <div class="thumb">
      <img v-if="mainImagePath" :src="mainImagePath" :alt="displayName" />
      <el-icon v-else size="32"><User /></el-icon>
      <el-tag
        class="badge"
        size="small"
        :type="hasMain ? 'success' : 'info'"
        effect="dark"
      >
        {{ hasMain ? '主图齐备' : '缺主图' }}
      </el-tag>
    </div>

    <div class="body">
      <div class="title">
        <el-tag
          size="small"
          :type="binding?.sourceType === 'linked_lw' ? 'primary' : 'warning'"
          effect="plain"
        >
          {{ binding?.sourceType === 'linked_lw' ? 'linked' : 'standalone' }}
        </el-tag>
        <span class="name-text">{{ displayName }}</span>
      </div>
      <div class="meta">图谱 {{ galleryCount }} 张</div>
      <el-button
        size="small"
        type="primary"
        plain
        :disabled="hasMain"
        @click.stop="onGenerateMain"
      >
        {{ hasMain ? '已生成' : '生成主图' }}
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 角色资产卡（P3a Task 11）
 * @module renderer/components/episode-production/stage-asset/CharacterAssetCard
 * @description 单张角色资产卡片，显示缩略主图 / 主图状态 / 图谱数 / 生成主图按钮。
 *              主图与图谱列表通过 episodeProduction.asset.image.* IPC 拉取。
 *              注意：IPC 返回 IpcResponse<T>，需先判 success 再解 data。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { User } from '@element-plus/icons-vue'

const props = defineProps<{ binding: any }>()
const emit = defineEmits<{
  click: []
  'generate-main': []
}>()

const mainImagePath = ref<string | null>(null)
const galleryCount = ref(0)

const hasMain = computed(() => mainImagePath.value !== null)

const displayName = computed(() => {
  const b = props.binding
  if (!b) return '(未命名)'
  if (b.sourceType === 'standalone') return b.standaloneName || '(未命名)'
  if (b.sourceType === 'linked_lw') return b.overrideName || '(未命名 lw)'
  return b.standaloneName || b.overrideName || '(未命名)'
})

async function loadStats() {
  const id = props.binding?.id
  if (!id) return
  const api = (window as any).electronAPI?.episodeProduction?.asset?.image
  if (!api) return
  try {
    const mainResp = await api.getMain('character', id)
    if (mainResp && mainResp.success) {
      mainImagePath.value = mainResp.data?.imagePath ?? null
    } else {
      mainImagePath.value = null
    }
    const listResp = await api.listByAsset('character', id)
    if (listResp && listResp.success && Array.isArray(listResp.data)) {
      galleryCount.value = listResp.data.length
    } else {
      galleryCount.value = 0
    }
  } catch (e) {
    console.warn('[CharacterAssetCard] 加载图谱统计失败', e)
  }
}

function onCardClick() {
  emit('click')
}

function onGenerateMain() {
  emit('generate-main')
}

onMounted(loadStats)
watch(() => props.binding?.id, loadStats)
</script>

<style scoped>
.asset-card {
  cursor: pointer;
  transition: transform 0.15s;
}

.asset-card:hover {
  transform: translateY(-2px);
}

.asset-card .thumb {
  width: 100%;
  height: 100px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  color: var(--el-text-color-secondary);
}

.asset-card .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-card .thumb .badge {
  position: absolute;
  top: 4px;
  right: 4px;
}

.asset-card .body {
  padding-top: 8px;
}

.asset-card .title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.asset-card .title .name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.asset-card .meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0 8px;
}
</style>
