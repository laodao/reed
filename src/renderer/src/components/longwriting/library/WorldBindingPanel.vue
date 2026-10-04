<template>
  <div class="world-binding-panel">
    <!-- 已绑定世界 -->
    <div class="section-title">本项目引用的世界观</div>
    <div v-loading="loading" class="binding-list">
      <div v-if="bindings.length === 0" class="empty-hint">
        未绑定世界观——绑定后，体系/规则类设定会在章节生成时自动注入，库条目可一键导入项目
      </div>
      <div v-for="b in bindings" :key="b.id" class="binding-row">
        <div class="binding-main">
          <span class="world-name">
            {{ b.worldName || '（已删除的世界）' }}
            <el-tag v-if="b.isPrimary" size="small" type="primary">主世界</el-tag>
            <el-tag v-if="!worldAlive(b.worldId)" size="small" type="info">来源已删</el-tag>
          </span>
        </div>
        <div class="binding-actions">
          <el-button v-if="!b.isPrimary" size="small" text type="primary" @click="setPrimary(b)">设为主世界</el-button>
          <el-button size="small" text type="danger" @click="unbind(b)">解绑</el-button>
        </div>
      </div>
    </div>

    <!-- 添加绑定 -->
    <div class="add-binding">
      <el-select
        v-model="selectedWorldId"
        placeholder="选择要添加的世界观"
        clearable
        filterable
        style="flex: 1"
      >
        <el-option
          v-for="w in unboundWorlds"
          :key="w.id"
          :label="`${w.name}（${genreLabel(w.genre)}）`"
          :value="w.id"
        />
      </el-select>
      <el-button type="primary" :disabled="!selectedWorldId" @click="bind">添加引用</el-button>
      <el-button text @click="goWorldLibrary">去世界观库逛逛</el-button>
    </div>
    <div class="form-tip">主世界与参考世界并存：注入时主世界在前；条目可从世界观库一键导入本项目。</div>

    <!-- 同步 diff（库→项目，单向） -->
    <template v-if="bindings.length > 0">
      <el-divider />
      <div class="section-title with-action">
        与库同步
        <el-button size="small" :loading="syncing" @click="loadSyncPreview">检查更新</el-button>
      </div>
      <div v-if="syncItems === null" class="empty-hint">
        点「检查更新」比对项目内已导入条目与世界观库当前版本的差异
      </div>
      <template v-else>
        <div v-if="syncItems.length === 0" class="empty-hint">项目内没有来自世界观库的条目</div>
        <template v-else>
          <el-checkbox-group v-model="selectedSyncIds">
            <div
              v-for="(item, i) in syncItems"
              :key="item.projectEntityId"
              class="sync-row"
              :class="{ orphaned: item.orphaned, unchanged: !item.changed && !item.orphaned }"
            >
              <el-checkbox :value="String(i)" :disabled="!item.changed">
                <span class="sync-name">{{ item.projectName }}</span>
                <el-tag size="small" type="info">{{ entityLabel(item.entityType) }}</el-tag>
                <span v-if="item.orphaned" class="sync-status danger">库条目已删除——项目内容保留，不再同步</span>
                <span v-else-if="!item.changed" class="sync-status ok">已是最新</span>
              </el-checkbox>
              <div v-if="item.changed" class="sync-diffs">
                <div v-for="(d, di) in item.diffs" :key="di" class="diff-line">
                  <span class="diff-field">{{ d.field }}</span>
                  <span class="diff-from" :title="d.from">项目：{{ d.from || '（空）' }}</span>
                  <span class="diff-arrow">←</span>
                  <span class="diff-to" :title="d.to">库：{{ d.to || '（空）' }}</span>
                </div>
              </div>
            </div>
          </el-checkbox-group>
          <div class="sync-actions">
            <el-button
              type="primary"
              size="small"
              :disabled="selectedSyncIds.length === 0"
              :loading="applying"
              @click="applySelected"
            >
              同步所选（{{ selectedSyncIds.length }}）
            </el-button>
            <span class="form-tip">单向：用库的最新值覆盖项目内的名称/摘要（项目侧其余改动保留），项目内容永远不会写回库。</span>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 世界观绑定管理面板（P2，设计 §5.3 / §6）
 * 项目设定的「世界观」tab：绑定/解绑/主世界 + 库→项目同步 diff（P1 后端 previewSync/applySync 的 UI）。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useLwLibraryStore } from '@/stores/lw-library'

interface BindingRow {
  id: string
  projectId: string
  worldId: string
  worldName: string
  isPrimary: boolean
}

interface SyncRow {
  entityType: 'location' | 'faction' | 'skill' | 'item' | 'custom'
  projectEntityId: string
  projectName: string
  entryName: string
  worldName: string
  orphaned: boolean
  changed: boolean
  diffs: Array<{ field: string; from: string; to: string }>
}

const props = defineProps<{ projectId: string }>()

const router = useRouter()
const store = useLwLibraryStore()
const lib = () => window.electronAPI.longwriting.library

const loading = ref(false)
const bindings = ref<BindingRow[]>([])
const selectedWorldId = ref('')
const syncing = ref(false)
const applying = ref(false)
const syncItems = ref<SyncRow[] | null>(null)
const selectedSyncIds = ref<string[]>([])

const GENRE_LABELS: Record<string, string> = {
  xiuzhen: '修真', xuanhuan: '玄幻', urban: '都市', scifi: '科幻',
  western_fantasy: '西幻', history: '历史', custom: '自定义',
}
const genreLabel = (g: string) => GENRE_LABELS[g] ?? g

const ENTITY_LABELS: Record<string, string> = {
  location: '地点', faction: '势力', skill: '技能', item: '物品', custom: '设定',
}
const entityLabel = (t: string) => ENTITY_LABELS[t] ?? t

const worldAlive = (worldId: string) => store.worlds.some(w => w.id === worldId)

const unboundWorlds = computed(() =>
  store.worlds.filter(w => !bindings.value.some(b => b.worldId === w.id)),
)

onMounted(async () => {
  await Promise.all([loadBindings(), store.fetchWorlds()])
})

const loadBindings = async () => {
  loading.value = true
  try {
    bindings.value = await lib().listWorldBindings(props.projectId)
  } finally {
    loading.value = false
  }
}

const bind = async () => {
  if (!selectedWorldId.value) return
  await lib().bindWorld({ projectId: props.projectId, worldId: selectedWorldId.value })
  ElMessage.success('已添加引用')
  selectedWorldId.value = ''
  await loadBindings()
}

const unbind = async (b: BindingRow) => {
  try {
    await ElMessageBox.confirm(
      `解除「${b.worldName}」的引用？已导入项目的内容不受影响，只是不再注入更新。`,
      '解除引用',
      { type: 'warning', confirmButtonText: '解绑', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await lib().unbindWorld(props.projectId, b.worldId)
  ElMessage.success('已解绑')
  await loadBindings()
}

const setPrimary = async (b: BindingRow) => {
  await lib().setPrimaryWorld(props.projectId, b.id)
  ElMessage.success(`已将「${b.worldName}」设为主世界`)
  await loadBindings()
}

const loadSyncPreview = async () => {
  syncing.value = true
  try {
    const items: SyncRow[] = await lib().syncPreview(props.projectId)
    syncItems.value = items
    selectedSyncIds.value = items
      .map((item, i) => (item.changed ? String(i) : ''))
      .filter(Boolean)
  } finally {
    syncing.value = false
  }
}

const applySelected = async () => {
  const targets = selectedSyncIds.value
    .map(i => syncItems.value![Number(i)])
    .filter(Boolean)
    .map(item => ({ entityType: item.entityType, projectEntityId: item.projectEntityId }))
  if (targets.length === 0) return
  applying.value = true
  try {
    const result = await lib().syncApply(props.projectId, targets)
    ElMessage.success(`已同步 ${result.applied} 条`)
    await loadSyncPreview()
  } finally {
    applying.value = false
  }
}

const goWorldLibrary = () => {
  void router.push('/longwriting/worlds')
}
</script>

<style scoped lang="scss">
.world-binding-panel {
  padding: 4px 8px;

  .section-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 10px;

    &.with-action {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  }

  .empty-hint {
    color: var(--text-secondary, #999);
    font-size: 13px;
    padding: 10px 0;
  }

  .binding-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 8px;
    margin-bottom: 8px;

    .binding-main {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;

      .world-name {
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .entry-count {
        color: var(--text-secondary, #999);
        font-size: 12px;
      }
    }
  }

  .add-binding {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }

  .form-tip {
    color: var(--text-secondary, #999);
    font-size: 12px;
    line-height: 1.5;
    margin-top: 6px;
  }

  .sync-row {
    padding: 8px 12px;
    border: 1px solid var(--border-color, #eee);
    border-radius: 8px;
    margin-bottom: 6px;

    &.orphaned {
      background: var(--el-color-danger-light-9, #fef0f0);
    }

    &.unchanged {
      opacity: 0.75;
    }

    .sync-name {
      font-weight: 500;
      margin-right: 6px;
    }

    .sync-status {
      font-size: 12px;
      margin-left: 8px;

      &.ok { color: var(--el-color-success, #67c23a); }
      &.danger { color: var(--el-color-danger, #f56c6c); }
    }

    .sync-diffs {
      margin: 6px 0 0 24px;

      .diff-line {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 12px;
        padding: 2px 0;

        .diff-field {
          flex-shrink: 0;
          width: 70px;
          color: var(--text-secondary, #999);
        }

        .diff-from, .diff-to {
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .diff-from { color: var(--el-color-danger, #c45656); text-decoration: line-through; }
        .diff-arrow { color: var(--text-secondary, #999); }
        .diff-to { color: var(--el-color-success, #529b2e); }
      }
    }
  }

  .sync-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
  }
}
</style>
