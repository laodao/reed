<template>
  <div class="stage-asset">
    <!-- 主体：左资产树 + 中央图集 -->
    <div class="asset-body">
      <aside class="asset-left">
        <AssetTree
          :characters="summary.characters"
          :locations="summary.locations"
          :items="summary.items"
          :selected="selected"
          @select="onSelect"
          @create="onCreate"
        />
      </aside>
      <main class="asset-center">
        <AssetGallery
          :asset-id="selected.id"
          :kind="selected.kind"
          :asset-name="selected.name"
          :project-id="projectId"
          :initial-thumb="selected.thumb"
        />
      </main>
    </div>

    <!-- 新建资产（阶段 C：用 ElMessageBox 输入名称，走 createStandalone） -->
  </div>
</template>

<script setup lang="ts">
/**
 * M3 资产页（tab 宿主内的完整左+中央工作区）。
 * 左：资产树（projectSummary 聚合，含 hasMain/缩略图）；中央：AssetGallery 图集。
 * 数据源：asset.projectSummary(projectId) → characters/locations/items。
 */
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AssetTree from '@/components/episode-production/asset/AssetTree.vue'
import AssetGallery from '@/components/episode-production/asset/AssetGallery.vue'

const props = defineProps<{
  projectId: string
  episodeId: string
  contextHint?: string | null
}>()

const summary = reactive<{ characters: any[]; locations: any[]; items: any[] }>({ characters: [], locations: [], items: [] })
const selected = ref<{ kind: 'character' | 'location' | 'item'; id: string; name: string; thumb?: string }>({ kind: 'character', id: '', name: '' })

async function load(): Promise<void> {
  if (!props.projectId) return
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const r = await root.projectSummary(props.projectId)
    if (r?.success && r.data) {
      summary.characters = r.data.characters || []
      summary.locations = r.data.locations || []
      summary.items = r.data.items || []
    }
    // 默认选中首个角色（若有）
    if (!selected.value.id) {
      const first = summary.characters[0] || summary.locations[0] || summary.items[0]
      if (first) {
        selected.value = {
          kind: summary.characters[0] ? 'character' : summary.locations[0] ? 'location' : 'item',
          id: first.bindingId || first.id,
          name: first.name,
          thumb: first.mainImagePath,
        }
      }
    }
  } catch (e: any) {
    console.error('[StageAsset] 加载项目资产失败', e)
  }
}

function onSelect(asset: { kind: 'character' | 'location' | 'item'; id: string; name: string }): void {
  const item = findSummary(asset.kind, asset.id)
  selected.value = { ...asset, thumb: item?.mainImagePath }
}

function findSummary(kind: string, id: string): any | null {
  const list = kind === 'character' ? summary.characters : kind === 'location' ? summary.locations : summary.items
  return list.find((i: any) => (i.bindingId || i.id) === id) || null
}

async function onCreate(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('输入资产名称', '新建资产', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    })
    if (!value?.trim()) return
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const kind = selected.value.kind
    const api = kind === 'character' ? root.character : kind === 'location' ? root.location : root.item
    const r = await api.createStandalone({ projectId: props.projectId, name: value.trim() })
    if (r?.success) {
      ElMessage.success('已创建')
      await load()
    } else {
      ElMessage.error(r?.error || '创建失败')
    }
  } catch {
    // 取消
  }
}

watch(() => [props.projectId, props.episodeId], () => void load())
onMounted(() => void load())
</script>

<style lang="scss" scoped>
.stage-asset {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.asset-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.asset-left {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  min-height: 0;
}

.asset-center {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
