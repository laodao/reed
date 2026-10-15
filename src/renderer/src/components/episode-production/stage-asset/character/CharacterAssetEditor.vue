<template>
  <div v-loading="loading" class="character-asset-editor">
    <div class="header">
      <el-button text @click="emit('close')">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回盘点</span>
      </el-button>
      <h2 class="title">{{ displayName }}</h2>
      <el-tag
        v-if="binding"
        :type="binding.sourceType === 'linked_lw' ? 'primary' : 'warning'"
        effect="plain"
      >
        {{ binding.sourceType === 'linked_lw' ? 'linked_lw · 来自长文' : 'standalone · 本剧独立' }}
      </el-tag>
    </div>

    <div class="body-grid">
      <CharacterCardForm
        :binding-id="bindingId"
        class="form-pane"
        @saved="onSaved"
      />
      <CharacterGalleryEditor
        ref="galleryRef"
        :binding-id="bindingId"
        asset-type="character"
        class="gallery-pane"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 角色资产编辑器（P3a Task 12）
 * @module renderer/components/episode-production/stage-asset/character/CharacterAssetEditor
 * @description 双栏布局壳：左侧 CharacterCardForm（设定卡） + 右侧 CharacterGalleryEditor（图谱）。
 *              IPC: episodeProduction.asset.character.get(id) → IpcResponse<CharacterBinding>。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import CharacterCardForm from './CharacterCardForm.vue'
import CharacterGalleryEditor from './CharacterGalleryEditor.vue'

const props = defineProps<{ bindingId: string }>()
const emit = defineEmits<{
  close: []
  saved: []
}>()

const loading = ref(false)
const binding = ref<any>(null)
const galleryRef = ref<InstanceType<typeof CharacterGalleryEditor> | null>(null)

const displayName = computed(() => {
  const b = binding.value
  if (!b) return '加载中...'
  if (b.sourceType === 'standalone') {
    return b.standaloneName || '(未命名)'
  }
  return b.overrideName || '(未命名 lw)'
})

async function load() {
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api) return
  if (!props.bindingId) return
  loading.value = true
  try {
    const resp = await api.character.get(props.bindingId)
    if (!resp || !resp.success) {
      ElMessage.error(resp?.error || '加载角色失败')
      binding.value = null
    } else {
      binding.value = resp.data
    }
  } catch (e: any) {
    console.error('[CharacterAssetEditor] load 失败', e)
    ElMessage.error(e?.message || '加载角色失败')
  } finally {
    loading.value = false
  }
}

async function onSaved() {
  await load()
  // 同步刷新图谱（部分保存动作可能影响主图状态）
  galleryRef.value?.reload?.()
  emit('saved')
}

onMounted(load)
watch(() => props.bindingId, load)
</script>

<style scoped>
.character-asset-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(360px, 1.4fr);
  gap: 16px;
  padding: 16px;
  overflow: hidden;
  box-sizing: border-box;
}

.form-pane,
.gallery-pane {
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 960px) {
  .body-grid {
    grid-template-columns: 1fr;
    overflow: auto;
  }
}
</style>
