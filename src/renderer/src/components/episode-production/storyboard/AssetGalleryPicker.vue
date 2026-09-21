<template>
  <div class="asset-gallery-picker">
    <!-- 左：资产树 -->
    <AssetTree
      :characters="summary.characters"
      :locations="summary.locations"
      :items="summary.items"
      :selected="selected"
      @select="onSelect"
    />

    <!-- 右：选中资产的图集（可拖拽引用） -->
    <div class="picker-body">
      <div v-if="!selected.id" class="picker-empty">
        <el-empty description="左侧选择资产查看图集，拖动图片到提示词框可 @ 引用" :image-size="70" />
      </div>

      <template v-else>
        <div class="picker-head">
          <span class="pk-title">{{ selected.name }}</span>
        </div>
        <div class="picker-grid">
          <div
            v-for="img in images"
            :key="img.id"
            class="asset-img"
            draggable="true"
            @dragstart="onDragStart(img, $event)"
          >
            <el-image
              :src="toUrl(img.imagePath)"
              fit="cover"
              class="asset-img-el"
              :preview-src-list="[toUrl(img.imagePath)]"
              :preview-teleported="true"
              hide-on-click-modal
              preview-z-index="3000"
            />
            <div class="asset-img-tag">{{ categoryLabel(img.category) }}</div>
          </div>
          <div v-if="images.length === 0" class="picker-empty-img">该资产暂无图片</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 资产图集选择器（分镜制作左侧栏）。
 * 左：资产树；右：选中资产的图集缩略网格。图片可拖拽，dragstart 时写入资产引用（含图索引）供提示词框 drop 精确引用。
 */
import { ref, reactive, watch, onMounted } from 'vue'
import AssetTree from '@/components/episode-production/asset/AssetTree.vue'
import { toImageUrl } from '@/utils/asset-url'

const props = defineProps<{
  projectId: string
}>()

const summary = reactive<{ characters: any[]; locations: any[]; items: any[] }>({ characters: [], locations: [], items: [] })
const selected = ref<{ kind: 'character' | 'location' | 'item'; id: string; name: string }>({ kind: 'character', id: '', name: '' })
const images = ref<any[]>([])

async function load(): Promise<void> {
  if (!props.projectId) return
  const root = (window as any).electronAPI?.episodeProduction?.asset
  const r = await root.projectSummary(props.projectId)
  if (r?.success && r.data) {
    summary.characters = r.data.characters || []
    summary.locations = r.data.locations || []
    summary.items = r.data.items || []
  }
  // 默认选中首个角色
  if (!selected.value.id) {
    const first = summary.characters[0] || summary.locations[0] || summary.items[0]
    if (first) {
      selected.value = {
        kind: summary.characters[0] ? 'character' : summary.locations[0] ? 'location' : 'item',
        id: first.bindingId || first.id,
        name: first.name,
      }
      await loadImages()
    }
  }
}

async function onSelect(asset: { kind: 'character' | 'location' | 'item'; id: string; name: string }): Promise<void> {
  selected.value = asset
  await loadImages()
}

async function loadImages(): Promise<void> {
  if (!selected.value.id) { images.value = []; return }
  const root = (window as any).electronAPI?.episodeProduction?.asset
  const r = await root.image.listByAsset(selected.value.kind, selected.value.id)
  images.value = r?.success ? r.data : []
}

function toUrl(path?: string): string {
  return path ? toImageUrl(path) : ''
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = { main: '主图', view: '造型', expression: '表情', outfit: '服装', pose: '姿势', variant: '变体', floor_plan: '平面图' }
  return map[cat] || cat
}

/** 拖拽开始：写入资产引用（含图索引；提示词框 drop 时按 @[名字@索引] 精确引用） */
function onDragStart(img: any, e: DragEvent): void {
  const idx = images.value.findIndex(im => im.id === img.id)
  const ref = { id: selected.value.id, name: selected.value.name, index: idx >= 0 ? idx + 1 : null }
  e.dataTransfer?.setData('text/asset-ref', JSON.stringify(ref))
  e.dataTransfer?.setData('text/asset-name', selected.value.name)
  e.dataTransfer?.setData('text/plain', selected.value.name)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

watch(() => props.projectId, () => void load())
onMounted(() => void load())
</script>

<style lang="scss" scoped>
.asset-gallery-picker {
  display: flex;
  height: 100%;
  min-height: 0;
  /* 树固定窄宽，避免长名字把图集网格挤没 */
  :deep(.asset-tree) {
    flex: 0 0 130px;
    min-width: 0;
    border-right: 1px solid var(--border-color-lighter);
    .item-name { font-size: 12px; }
    .done-tag { display: none; }
  }
}

.picker-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.picker-empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.picker-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border-color-lighter); }
.pk-title { font-size: 13px; font-weight: 600; color: var(--text-color-primary); }
.picker-grid {
  flex: 1; min-height: 0; overflow-y: auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 6px;
  padding: 8px 10px;
}
.asset-img {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color-lighter);
  cursor: grab;
  &:hover { border-color: var(--color-primary); }
  &:active { cursor: grabbing; }
  .asset-img-el { width: 100%; height: 100%; object-fit: cover; }
  .asset-img-tag {
    position: absolute; left: 4px; bottom: 4px;
    font-size: 10px; color: var(--text-color-secondary);
    background: rgba(255,255,255,.85); padding: 1px 5px; border-radius: var(--radius-full);
  }
}
.picker-empty-img { grid-column: 1 / -1; padding: 24px 0; text-align: center; color: var(--text-color-placeholder); font-size: 12px; }
</style>
