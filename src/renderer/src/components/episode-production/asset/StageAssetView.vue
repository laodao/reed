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

    <!-- 新建资产弹窗：可选类型（角色/地点/物品）+ 名称，走 createStandalone -->
    <el-dialog v-model="createDialog.visible" title="新建资产" width="380px" append-to-body>
      <el-form label-width="60px" @submit.prevent>
        <el-form-item label="类型">
          <el-radio-group v-model="createDialog.kind">
            <el-radio-button value="character">角色</el-radio-button>
            <el-radio-button value="location">地点</el-radio-button>
            <el-radio-button value="item">物品</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称">
          <el-input
            v-model="createDialog.name"
            placeholder="输入资产名称"
            maxlength="50"
            autofocus
            @keyup.enter="submitCreate"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDialog.submitting" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * M3 资产页（tab 宿主内的完整左+中央工作区）。
 * 左：资产树（projectSummary 聚合，含 hasMain/缩略图）；中央：AssetGallery 图集。
 * 数据源：asset.projectSummary(projectId) → characters/locations/items。
 */
import { ref, reactive, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import AssetTree from '@/components/episode-production/asset/AssetTree.vue'
import AssetGallery from '@/components/episode-production/asset/AssetGallery.vue'

const props = defineProps<{
  projectId: string
  episodeId: string
  contextHint?: string | null
  /** 外部（如 Agent 助手"去查看"）指定要定位的资产 */
  externalAsset?: { kind: 'character' | 'location' | 'item'; id: string; name: string } | null
  /** 外部（EpisodeStudio agent data-changed）递增触发本页全量刷新 */
  refreshTick?: number
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

const createDialog = reactive<{
  visible: boolean
  kind: 'character' | 'location' | 'item'
  name: string
  submitting: boolean
}>({ visible: false, kind: 'character', name: '', submitting: false })

/** 打开新建弹窗：类型默认跟随当前选中，可改（空项目下默认 character，可切地点/物品） */
function onCreate(): void {
  createDialog.kind = selected.value.kind || 'character'
  createDialog.name = ''
  createDialog.visible = true
}

async function submitCreate(): Promise<void> {
  const name = createDialog.name.trim()
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  if (createDialog.submitting) return
  createDialog.submitting = true
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const kind = createDialog.kind
    const api = kind === 'character' ? root.character : kind === 'location' ? root.location : root.item
    const r = await api.createStandalone({ projectId: props.projectId, name })
    if (r?.success) {
      ElMessage.success('已创建')
      createDialog.visible = false
      await load()
      // 选中新创建的资产，方便直接进图集
      const list = kind === 'character' ? summary.characters : kind === 'location' ? summary.locations : summary.items
      const created = list.find((i: any) => i.name === name)
      if (created) {
        selected.value = { kind, id: created.bindingId || created.id, name: created.name, thumb: created.mainImagePath }
      }
    } else {
      ElMessage.error(r?.error || '创建失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    createDialog.submitting = false
  }
}

watch(() => [props.projectId, props.episodeId], () => void load())
// 外部（EpisodeStudio agent data-changed）通过 refreshTick 触发全量刷新
watch(() => props.refreshTick, () => { if (props.refreshTick != null) void load() })
// Agent 助手"去查看"跳转：按外部指定资产定位选中
watch(() => props.externalAsset, (asset) => {
  if (!asset?.id) return
  const item = findSummary(asset.kind, asset.id)
  selected.value = {
    kind: asset.kind,
    id: asset.id,
    name: asset.name,
    thumb: item?.mainImagePath,
  }
})
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
