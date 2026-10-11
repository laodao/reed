<template>
  <div class="world-library-page">
    <div class="page-header">
      <h1>世界观库</h1>
      <div class="header-desc">先设计世界，再写故事——世界观可被多个长文项目引用</div>
      <div class="header-actions">
        <input ref="importFileInput" type="file" accept=".json,application/json" style="display: none" @change="onImportFile" />
        <el-button @click="importFileInput?.click()">
          <el-icon><Upload /></el-icon>
          导入世界包
        </el-button>
        <el-button type="primary" @click="showCreate = true">
          <el-icon><Plus /></el-icon>
          新建世界观
        </el-button>
      </div>
    </div>

    <div v-loading="store.worldsLoading" class="page-content">
      <div v-if="store.worlds.length > 0" class="world-list">
        <div
          v-for="world in store.worlds"
          :key="world.id"
          class="world-card"
          @click="openDetail(world.id)"
        >
          <div class="world-icon">
            <el-icon size="30"><Collection /></el-icon>
          </div>
          <div class="world-info">
            <h3 class="world-name">
              {{ world.name }}
              <el-tag v-if="world.genre" size="small" type="info">{{ genreLabel(world.genre) }}</el-tag>
            </h3>
            <div class="world-tagline">{{ world.tagline || '暂无一句话简介' }}</div>
          </div>
          <div class="world-actions">
            <el-tooltip content="导出为 JSON 世界包（分享/备份）" placement="top">
              <el-button text @click.stop="exportWorld(world)">
                <el-icon><Download /></el-icon>
              </el-button>
            </el-tooltip>
            <el-button text type="danger" @click.stop="confirmDelete(world)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <el-empty description="还没有世界观">
          <el-button type="primary" @click="showCreate = true">创建第一个世界观</el-button>
        </el-empty>
      </div>
    </div>

    <!-- 新建世界观 -->
    <el-dialog v-model="showCreate" title="新建世界观" width="520px">
      <el-form :model="createForm" label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="如：雪麓修真界" />
        </el-form-item>
        <el-form-item label="题材">
          <el-select v-model="createForm.genre" style="width: 100%">
            <el-option label="修真" value="xiuzhen" />
            <el-option label="玄幻" value="xuanhuan" />
            <el-option label="都市" value="urban" />
            <el-option label="科幻" value="scifi" />
            <el-option label="西幻" value="western_fantasy" />
            <el-option label="历史" value="history" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="一句话简介">
          <el-input v-model="createForm.tagline" placeholder="这个世界最核心的一条概念" />
        </el-form-item>
        <el-form-item label="起步模板">
          <el-select v-model="createForm.fromTemplate" clearable placeholder="不使用模板" style="width: 100%">
            <el-option label="修真世界模板（境界/灵根/门派/丹药/法宝…15 类 + 示范条目）" value="xiuzhen" />
            <el-option label="西幻世界模板（职业途径/种族/神祇/神奇物品…10 类）" value="western_fantasy" />
            <el-option label="都市异能模板（异能体系/组织/异物/规则…7 类）" value="urban" />
          </el-select>
          <div class="form-tip">模板播种的分类与示例条目均可自由修改、删除</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" :disabled="!createForm.name" @click="createWorld">创建</el-button>
      </template>
    </el-dialog>

    <!-- 世界观详情抽屉 -->
    <el-drawer v-model="showDetail" :title="detail?.name || '世界观详情'" size="62%" destroy-on-close>
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <div class="detail-meta">
            <el-tag v-if="detail.genre" size="small">{{ genreLabel(detail.genre) }}</el-tag>
            <span class="meta-text">{{ detail.tagline }}</span>
            <span class="meta-count">{{ detail.entries.length }} 个条目 · 被 {{ detail.referencingProjects }} 个项目引用</span>
          </div>
          <div
            v-for="kind in detail.kinds"
            :key="kind.key"
            class="kind-group"
          >
            <div class="kind-header">
              <span class="kind-label">{{ kind.icon }} {{ kind.label }}</span>
              <div class="kind-actions">
                <el-button size="small" text type="success" :loading="generatingKind === kind.key" @click="openGenerateDialog(kind)">
                  <el-icon v-if="generatingKind !== kind.key"><MagicStick /></el-icon>
                  AI 生成
                </el-button>
                <el-button size="small" text type="primary" @click="openEntryEditor(kind)">
                  <el-icon><Plus /></el-icon>
                  新增
                </el-button>
              </div>
            </div>
            <div class="entry-list">
              <div
                v-for="entry in entriesOfKind(kind.key)"
                :key="entry.id"
                class="entry-row"
                @click="openEntryEditor(kind, entry)"
              >
                <div class="entry-main">
                  <span class="entry-name">{{ entry.name }}</span>
                  <el-tag v-if="entry.pinned" size="small" type="warning" class="pin-tag">常驻</el-tag>
                  <span class="entry-summary">{{ entry.summary }}</span>
                </div>
                <el-button text type="danger" size="small" @click.stop="deleteEntry(entry)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
              <div v-if="entriesOfKind(kind.key).length === 0" class="kind-empty">暂无条目</div>
            </div>
          </div>
        </template>
      </div>
    </el-drawer>

    <!-- 条目编辑对话框 -->
    <el-dialog v-model="showEntryEditor" :title="entryForm.id ? `编辑条目：${entryForm.name}` : `新增条目：${entryEditorKind?.label}`" width="620px" append-to-body>
      <el-form :model="entryForm" label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="entryForm.name" />
        </el-form-item>
        <el-form-item label="别名">
          <el-select v-model="entryForm.aliases" multiple filterable allow-create default-first-option placeholder="输入后回车添加" style="width: 100%" />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="entryForm.summary" type="textarea" :rows="2" placeholder="一句话（进 prompt 的紧凑形态）" />
        </el-form-item>
        <FieldsSchemaForm v-if="entryEditorKind?.fieldsSchema?.length" v-model="entryFields" :schema="entryEditorKind.fieldsSchema" />
        <el-form-item label="常驻注入">
          <el-switch v-model="entryForm.pinned" />
          <div class="form-tip">开启后，绑定了本世界的项目写作时始终携带该条目</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEntryEditor = false">取消</el-button>
        <el-button type="primary" :disabled="!entryForm.name" @click="saveEntry">保存</el-button>
      </template>
    </el-dialog>

    <!-- AI 生成条目（P1：按 kind 分批生成，流式进度走 onGenerateEvent） -->
    <el-dialog v-model="showGenerate" :title="`AI 生成「${generateKind?.label}」条目`" width="520px" append-to-body :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="生成数量">
          <el-input-number v-model="generateCount" :min="1" :max="10" />
        </el-form-item>
        <el-form-item label="补充要求">
          <el-input v-model="generateRequirements" type="textarea" :rows="3" placeholder="可选：想要的方向/风格/与已有条目的关系" />
        </el-form-item>
        <el-form-item v-if="generateStreaming" label="生成中">
          <div class="stream-preview">{{ generatePreviewText.slice(-400) || '连接模型中…' }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="generateStreaming" @click="showGenerate = false">关闭</el-button>
        <el-button type="primary" :loading="generateStreaming" @click="runGenerate">
          {{ generateStreaming ? '生成中…' : '开始生成' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Collection, MagicStick, Download, Upload } from '@element-plus/icons-vue'
import { useLwLibraryStore } from '@/stores/lw-library'
import FieldsSchemaForm from '@/components/longwriting/library/FieldsSchemaForm.vue'
import type { World, WorldEntry, WorldKind } from '@shared/types/lw-library.types'

const GENRE_LABELS: Record<string, string> = {
  xiuzhen: '修真',
  xuanhuan: '玄幻',
  urban: '都市',
  scifi: '科幻',
  western_fantasy: '西幻',
  history: '历史',
  custom: '自定义',
}
const genreLabel = (g: string) => GENRE_LABELS[g] ?? g

const store = useLwLibraryStore()
const lib = () => window.electronAPI.longwriting.library

const showCreate = ref(false)
const createForm = ref({ name: '', genre: 'xiuzhen', tagline: '', fromTemplate: '' as string })

const showDetail = ref(false)
const detailLoading = ref(false)
const detail = ref<(World & { kinds: WorldKind[]; entries: WorldEntry[]; edges: unknown[]; referencingProjects: number }) | null>(null)

const showEntryEditor = ref(false)
const entryEditorKind = ref<WorldKind | null>(null)
const entryForm = ref<{ id: string; name: string; aliases: string[]; summary: string; pinned: boolean }>({ id: '', name: '', aliases: [], summary: '', pinned: false })
const entryFields = ref<Record<string, unknown>>({})

onMounted(() => {
  store.fetchWorlds(true)
})

// ==================== AI 生成（P1） ====================
const showGenerate = ref(false)
const generateKind = ref<WorldKind | null>(null)
const generateCount = ref(5)
const generateRequirements = ref('')
const generateStreaming = ref(false)
const generatePreviewText = ref('')
const generatingKind = ref('')

const openGenerateDialog = (kind: WorldKind) => {
  generateKind.value = kind
  generateCount.value = 5
  generateRequirements.value = ''
  generatePreviewText.value = ''
  showGenerate.value = true
}

const runGenerate = async () => {
  if (!detail.value || !generateKind.value) return
  const eventId = `library-gen-${Date.now()}`
  generateStreaming.value = true
  generatingKind.value = generateKind.value.key
  generatePreviewText.value = ''
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(eventId, (ev: any) => {
    if (ev?.type === 'content') generatePreviewText.value += ev.content || ''
  })
  try {
    const result = await lib().worldGenerate({
      eventId,
      worldId: detail.value.id,
      kindKey: generateKind.value.key,
      count: generateCount.value,
      requirements: generateRequirements.value || undefined,
    })
    if (result.success) {
      ElMessage.success(`已生成 ${result.created} 个条目`)
      showGenerate.value = false
      await openDetail(detail.value.id)
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    unsubscribe()
    generateStreaming.value = false
    generatingKind.value = ''
  }
}

const entriesOfKind = (kindKey: string) =>
  detail.value?.entries.filter(e => e.kindKey === kindKey) ?? []

// ==================== 导入导出（P2：JSON 世界包） ====================
const importFileInput = ref<HTMLInputElement | null>(null)

const exportWorld = async (world: World) => {
  const pkg = await lib().worldExport(world.id)
  if (!pkg || (pkg as { error?: string }).error) {
    ElMessage.error((pkg as { error?: string })?.error || '导出失败')
    return
  }
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${world.name}.lw-world.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出「${world.name}」世界包`)
}

const onImportFile = async (evt: Event) => {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    const result = await lib().worldImport(payload)
    if (result.success) {
      // 复核修复 P2-2：else 分支已用 result.error || ... 兜底，成功分支却直接取
      // result.world.name——world 缺失时抛错会被下方 catch 显示成误导性的
      //「无法解析世界包」。这里做同等防御。
      ElMessage.success(`已导入世界「${result.world?.name ?? '未命名'}」`)
      await store.fetchWorlds(true)
    } else {
      ElMessage.error(result.error || '导入失败')
    }
  } catch (e: any) {
    ElMessage.error(`无法解析世界包：${e?.message || e}`)
  }
}

const createWorld = async () => {
  const world = await lib().worldCreate({
    name: createForm.value.name,
    genre: createForm.value.genre,
    tagline: createForm.value.tagline || undefined,
    fromTemplate: createForm.value.fromTemplate || undefined,
  })
  ElMessage.success(`已创建「${world.name}」`)
  showCreate.value = false
  createForm.value = { name: '', genre: 'xiuzhen', tagline: '', fromTemplate: '' }
  await store.fetchWorlds(true)
}

const confirmDelete = (world: World) => {
  ElMessageBox.confirm(
    `删除世界观「${world.name}」？已导入项目的内容不受影响，但绑定与库条目将不可再用。`,
    '删除世界观',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).then(async () => {
    await lib().worldDelete(world.id)
    ElMessage.success('已删除')
    await store.fetchWorlds(true)
  }).catch(() => {})
}

const openDetail = async (id: string) => {
  showDetail.value = true
  detailLoading.value = true
  try {
    detail.value = await lib().worldGet(id)
  } finally {
    detailLoading.value = false
  }
}

const openEntryEditor = (kind: WorldKind, entry?: WorldEntry) => {
  entryEditorKind.value = kind
  entryForm.value = entry
    ? { id: entry.id, name: entry.name, aliases: [...entry.aliases], summary: entry.summary, pinned: entry.pinned }
    : { id: '', name: '', aliases: [], summary: '', pinned: false }
  entryFields.value = { ...(entry?.fields ?? {}) }
  showEntryEditor.value = true
}

const saveEntry = async () => {
  if (!detail.value || !entryEditorKind.value) return
  const payload = {
    name: entryForm.value.name,
    aliases: entryForm.value.aliases,
    summary: entryForm.value.summary,
    pinned: entryForm.value.pinned,
    fields: entryFields.value,
  }
  if (entryForm.value.id) {
    await lib().worldEntryUpdate(entryForm.value.id, payload)
  } else {
    await lib().worldEntryCreate({
      worldId: detail.value.id,
      kindKey: entryEditorKind.value.key,
      ...payload,
    })
  }
  ElMessage.success('已保存')
  showEntryEditor.value = false
  await openDetail(detail.value.id)
}

const deleteEntry = (entry: WorldEntry) => {
  ElMessageBox.confirm(`删除条目「${entry.name}」？`, '删除', { type: 'warning' }).then(async () => {
    await lib().worldEntryDelete(entry.id)
    if (detail.value) await openDetail(detail.value.id)
  }).catch(() => {})
}
</script>

<style scoped lang="scss">
.world-library-page {
  padding: 24px 32px;
  height: 100%;
  overflow-y: auto;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;

  h1 {
    margin: 0;
    font-size: 22px;
  }

  .header-desc {
    flex: 1;
    color: var(--text-secondary, #888);
    font-size: 13px;
  }
}

.world-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.world-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 10px;
  cursor: pointer;
  transition: box-shadow 0.15s;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .world-icon {
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--color-primary-light-bg, rgba(64, 158, 255, 0.1));
    color: var(--color-primary, #409eff);
  }

  .world-info {
    flex: 1;
    min-width: 0;

    .world-name {
      margin: 0 0 4px;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .world-tagline {
      color: var(--text-secondary, #888);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.empty-state {
  padding: 80px 0;
}

.detail-body {
  .detail-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;

    .meta-text {
      color: var(--text-secondary, #666);
      font-size: 13px;
    }

    .meta-count {
      margin-left: auto;
      color: var(--text-secondary, #999);
      font-size: 12px;
    }
  }

  .kind-group {
    margin-bottom: 18px;

    .kind-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dashed var(--border-color, #eee);

      .kind-label {
        font-weight: 600;
        font-size: 14px;
      }

      .kind-actions {
        display: flex;
        align-items: center;
      }
    }

    .entry-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 6px;
      border-radius: 6px;
      cursor: pointer;

      &:hover {
        background: var(--fill-color-light, #f5f7fa);
      }

      .entry-main {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: baseline;
        gap: 8px;

        .entry-name {
          font-weight: 500;
        }

        .entry-summary {
          color: var(--text-secondary, #888);
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }

    .kind-empty {
      padding: 10px 6px;
      color: var(--text-secondary, #aaa);
      font-size: 12px;
    }
  }
}

.form-tip {
  color: var(--text-secondary, #999);
  font-size: 12px;
  line-height: 1.5;
  margin-top: 4px;
}

.stream-preview {
  width: 100%;
  max-height: 140px;
  overflow-y: auto;
  padding: 8px;
  background: var(--fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary, #666);
  word-break: break-all;
}
</style>
