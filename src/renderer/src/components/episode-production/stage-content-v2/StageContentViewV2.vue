<template>
  <!--
    StageContentViewV2 · ① 内容识别 stage（FU5-B2）

    严格按对照表 §2 + §11 修订实施：
    - StageMainHeader：title + 副标题摘要 + actions
    - 来源 source-area（uploaded / outline 双 tab；当前模式只读显示，切换给 hint）
    - 原文片段 + 实体高亮 + 重新 AI 分析按钮
    - 识别要素 3 列网格：checkbox 取舍 + AssetSourceTag + 改 source 链接 + "+ 手动加"
    - 完成 banner：统计 + 双来源分布 + 进入 ② 按钮

    复用 FU5-A 通用组件：
      StageMainHeader / AssetSourceTag / EntityRefRenderer-style highlight
  -->
  <div class="stage-content-v2">
    <StageMainHeader title="① 内容识别" :subtitle="headerSubtitle">
      <template #actions>
        <el-tag
          v-if="episode"
          :type="episode.sourceType === 'outline' ? 'info' : 'warning'"
          :title="
            episode.sourceType === 'outline'
              ? '本剧来自长文项目章节；如需切换来源请新建剧集'
              : '本剧由上传长文创建；如需切换来源请新建剧集'
          "
          round
          class="source-type-tag"
        >
          {{ episode.sourceType === 'outline' ? '📚 长文项目' : '📝 上传长文' }}
        </el-tag>
        <el-button
          v-if="canIdentify"
          :type="totalEntities === 0 ? 'primary' : 'default'"
          :loading="identifying && !reidentifyingKind"
          @click="onIdentify"
        >
          <el-icon><MagicStick /></el-icon>
          <span>{{ totalEntities === 0 ? 'AI 识别要素' : '重新识别全部' }}</span>
        </el-button>
        <el-button
          v-if="hasDirty"
          :loading="saving"
          @click="saveEntities"
        >
          <el-icon><DocumentChecked /></el-icon>
          <span>保存改动</span>
        </el-button>
        <el-button
          v-if="canConfirm"
          type="success"
          :loading="confirming"
          @click="onConfirm"
        >
          <el-icon><Check /></el-icon>
          <span>确认要素 → ② 资产</span>
        </el-button>
        <el-tag v-else-if="alreadyConfirmed" type="success" round>已确认</el-tag>
      </template>
    </StageMainHeader>

    <div v-if="!episode" class="empty-state">
      <el-empty description="请先选择剧集" />
    </div>

    <div v-else class="content-body">
      <!-- 原文片段 panel（只读高亮 / 编辑双模式） -->
      <section v-if="episode.sourceType === 'uploaded' && episode.uploadedContent" class="excerpt-panel">
        <div class="panel-header">
          <span class="panel-title">原文片段</span>
          <span class="panel-actions">
            <template v-if="!editingContent">
              <el-button size="small" @click="enterEditContent">
                <el-icon><EditPen /></el-icon>
                <span>编辑</span>
              </el-button>
              <el-button size="small" :loading="identifying" @click="onIdentify">
                <el-icon><Refresh /></el-icon>
                <span>✨ 重新 AI 分析</span>
              </el-button>
            </template>
            <template v-else>
              <el-button size="small" :disabled="savingContent" @click="cancelEditContent">
                取消
              </el-button>
              <el-button
                size="small"
                type="primary"
                :loading="savingContent"
                :disabled="!editContentDirty || !isEditContentValid"
                @click="saveEditContent"
              >
                保存
              </el-button>
            </template>
          </span>
        </div>

        <div v-if="!editingContent" class="excerpt-body">
          <span
            v-for="(seg, i) in highlightedExcerpt"
            :key="i"
          >
            <mark
              v-if="seg.type === 'entity'"
              class="entity-mark"
              :class="`mark-${seg.kind}`"
              :title="`${seg.kind === 'character' ? '角色' : seg.kind === 'location' ? '地点' : '物品'}：${seg.entity?.description ?? seg.name}`"
            >{{ seg.name }}</mark>
            <template v-else>{{ seg.text }}</template>
          </span>
        </div>
        <el-input
          v-else
          v-model="editContentDraft"
          type="textarea"
          :rows="14"
          resize="vertical"
          placeholder="原文内容（500–15000 字）"
          class="excerpt-editor"
        />

        <div class="excerpt-footer">
          <template v-if="!editingContent">
            字数：约 {{ contentWordCount }} 字 ·
            AI 已扫描，识别出
            <strong>{{ characters.length }}</strong> 角色 ·
            <strong>{{ locations.length }}</strong> 地点 ·
            <strong>{{ items.length }}</strong> 物品 — 见下方
          </template>
          <template v-else>
            字数：{{ editContentDraft.length }} 字
            <span :class="['word-count-hint', { warn: !isEditContentValid }]">
              （需 500–15000 字）
            </span>
            <span v-if="editContentDirty" class="dirty-tip">· 未保存</span>
          </template>
        </div>
      </section>

      <!-- 识别要素清单标题 -->
      <div class="entities-section-header">
        <h3 class="section-title">识别要素清单</h3>
      </div>

      <!-- 3 列要素网格 -->
      <div class="entity-row">
        <EntityColumn
          kind="character"
          icon="👤"
          title="角色"
          :entities="characters"
          :can-reidentify="canReidentifyKind"
          :reidentifying="reidentifyingKind === 'character'"
          @toggle="(idx) => toggleConfirmed('character', idx)"
          @toggle-source="(idx) => toggleSource('character', idx)"
          @add="onManualAdd('character')"
          @edit="(idx) => onEdit('character', idx)"
          @delete="(idx) => onDelete('character', idx)"
          @reidentify="onIdentify(['character'])"
        />
        <EntityColumn
          kind="location"
          icon="🏛"
          title="地点"
          :entities="locations"
          :can-reidentify="canReidentifyKind"
          :reidentifying="reidentifyingKind === 'location'"
          @toggle="(idx) => toggleConfirmed('location', idx)"
          @toggle-source="(idx) => toggleSource('location', idx)"
          @add="onManualAdd('location')"
          @edit="(idx) => onEdit('location', idx)"
          @delete="(idx) => onDelete('location', idx)"
          @reidentify="onIdentify(['location'])"
        />
        <EntityColumn
          kind="item"
          icon="⚔️"
          title="物品"
          :entities="items"
          :can-reidentify="canReidentifyKind"
          :reidentifying="reidentifyingKind === 'item'"
          @toggle="(idx) => toggleConfirmed('item', idx)"
          @toggle-source="(idx) => toggleSource('item', idx)"
          @add="onManualAdd('item')"
          @edit="(idx) => onEdit('item', idx)"
          @delete="(idx) => onDelete('item', idx)"
          @reidentify="onIdentify(['item'])"
        />
      </div>

      <!-- 完成提示 banner（已确认进 ② 后不再展示；header 已有 "已确认" tag） -->
      <section
        v-if="confirmedCount > 0 && !alreadyConfirmed"
        class="finish-banner"
        :class="{ ok: canConfirm }"
      >
        <el-icon class="banner-icon" :size="28">
          <CircleCheckFilled v-if="canConfirm" />
          <InfoFilled v-else />
        </el-icon>
        <div class="banner-text">
          <div class="banner-title">
            <template v-if="canConfirm">
              已确认 {{ confirmedCount }} 个要素 — 可以进入资产准备
            </template>
            <template v-else>
              已勾选 {{ confirmedCount }} 个要素，{{
                hasDirty ? '点"保存改动"持久化后再进入 ②' : '可以确认进入 ②'
              }}
            </template>
          </div>
          <div class="banner-meta">
            {{ confirmedBreakdown.characters }} 角色 ·
            {{ confirmedBreakdown.locations }} 地点 ·
            {{ confirmedBreakdown.items }} 物品
            <span v-if="confirmedBreakdown.linkedLw + confirmedBreakdown.standalone > 0">
              · 其中 {{ confirmedBreakdown.linkedLw }} 个 linked_lw / {{ confirmedBreakdown.standalone }} 个 standalone
            </span>
          </div>
        </div>
        <el-button
          v-if="canConfirm"
          type="success"
          :loading="confirming"
          @click="onConfirm"
        >
          确认要素 → ② 资产
        </el-button>
      </section>
    </div>

    <!-- 手动添加要素对话框 -->
    <ManualAddEntityDialog
      v-model="addDialog.open"
      :kind="addDialog.kind"
      :initial="addDialog.initial"
      @confirm="onManualAddConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Check,
  CircleCheckFilled,
  DocumentChecked,
  EditPen,
  InfoFilled,
  MagicStick,
  Refresh,
} from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import EntityColumn from './EntityColumn.vue'
import ManualAddEntityDialog from './ManualAddEntityDialog.vue'
import {
  useEpEpisodeStore,
  useEpProjectStore,
  useEpWorkbenchStore,
} from '@/stores/episode-production'
import type {
  EpisodeStatus,
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
  VideoEpisode,
} from '../../../../../shared/types/episode-production'

type Kind = 'character' | 'location' | 'item'

const props = defineProps<{
  episode: VideoEpisode | null
}>()

const emit = defineEmits<{
  (e: 'confirmed'): void
}>()

const episodeStore = useEpEpisodeStore()
const projectStore = useEpProjectStore()

const identifying = ref(false)
const confirming = ref(false)
const saving = ref(false)
/** 当前正在单类型重识别的 kind；null = 未在单类型识别中（可能在全量识别） */
const reidentifyingKind = ref<Kind | null>(null)

// ===== 原文片段编辑态 =====
const editingContent = ref(false)
const savingContent = ref(false)
const editContentDraft = ref('')
const editContentOriginal = ref('')

const editContentDirty = computed(
  () => editContentDraft.value !== editContentOriginal.value,
)
const isEditContentValid = computed(() => {
  const len = editContentDraft.value.length
  return len >= 500 && len <= 15000
})

// ===== 本地编辑态（数组深拷贝；保存时回写） =====
const characters = ref<UploadedCharacter[]>([])
const locations = ref<UploadedLocation[]>([])
const items = ref<UploadedItem[]>([])

const addDialog = ref<{
  open: boolean
  kind: Kind
  initial: Partial<UploadedCharacter & UploadedLocation & UploadedItem>
  editIndex: number | null
}>({ open: false, kind: 'character', initial: {}, editIndex: null })

// 服务端最近一次状态（脏检测）
const lastSaved = ref<{
  characters: string
  locations: string
  items: string
} | null>(null)

watch(
  () => props.episode,
  (ep) => {
    syncFromEpisode(ep)
  },
  { immediate: true, deep: true },
)

function syncFromEpisode(ep: VideoEpisode | null): void {
  if (!ep) {
    characters.value = []
    locations.value = []
    items.value = []
    lastSaved.value = null
    return
  }
  characters.value = applyEntityDefaults(
    Array.isArray(ep.uploadedCharacters) ? ep.uploadedCharacters : [],
  )
  locations.value = applyEntityDefaults(
    Array.isArray(ep.uploadedLocations) ? ep.uploadedLocations : [],
  )
  items.value = applyEntityDefaults(
    Array.isArray(ep.uploadedItems) ? ep.uploadedItems : [],
  )
  lastSaved.value = snapshot()
}

function applyEntityDefaults<T extends UploadedCharacter | UploadedLocation | UploadedItem>(
  arr: T[],
): T[] {
  return arr.map((e, i) => ({
    ...e,
    id: e.id ?? `ent_${Date.now()}_${i}`,
    confirmed: e.confirmed ?? true,
    sourceType:
      e.sourceType ??
      ((e as any).longWritingCharacterId ||
      (e as any).longWritingLocationId ||
      (e as any).longWritingItemId
        ? 'linked_lw'
        : 'standalone'),
  }))
}

function snapshot(): {
  characters: string
  locations: string
  items: string
} {
  return {
    characters: JSON.stringify(characters.value),
    locations: JSON.stringify(locations.value),
    items: JSON.stringify(items.value),
  }
}

const hasDirty = computed(() => {
  if (!lastSaved.value) return false
  const cur = snapshot()
  return (
    cur.characters !== lastSaved.value.characters ||
    cur.locations !== lastSaved.value.locations ||
    cur.items !== lastSaved.value.items
  )
})

// ===== 派生 =====
const totalEntities = computed(
  () => characters.value.length + locations.value.length + items.value.length,
)

const confirmedCount = computed(
  () =>
    characters.value.filter((c) => c.confirmed).length +
    locations.value.filter((l) => l.confirmed).length +
    items.value.filter((it) => it.confirmed).length,
)

const confirmedBreakdown = computed(() => {
  const all = [
    ...characters.value.filter((c) => c.confirmed),
    ...locations.value.filter((l) => l.confirmed),
    ...items.value.filter((it) => it.confirmed),
  ]
  return {
    characters: characters.value.filter((c) => c.confirmed).length,
    locations: locations.value.filter((l) => l.confirmed).length,
    items: items.value.filter((it) => it.confirmed).length,
    linkedLw: all.filter((e) => e.sourceType === 'linked_lw').length,
    standalone: all.filter((e) => e.sourceType !== 'linked_lw').length,
  }
})

const headerSubtitle = computed(() => {
  if (!props.episode) return ''
  // 字数后缀（仅 uploaded 模式有意义）
  const wcSuffix =
    props.episode.sourceType === 'uploaded' && contentWordCount.value > 0
      ? ` · 约 ${contentWordCount.value} 字`
      : ''
  if (totalEntities.value === 0) {
    return `从长文项目或上传文本中识别出本剧集的角色 / 地点 / 物品${wcSuffix}`
  }
  return `${characters.value.length} 角色 · ${locations.value.length} 地点 · ${items.value.length} 物品（已确认 ${confirmedCount.value}）${wcSuffix}`
})

const contentWordCount = computed(
  () => props.episode?.uploadedContent?.length ?? 0,
)

const alreadyConfirmed = computed(() => {
  if (!props.episode) return false
  return (props.episode.status as EpisodeStatus) !== 'pending'
})

const canIdentify = computed(() => {
  if (!props.episode) return false
  if (alreadyConfirmed.value) return false
  if (props.episode.sourceType === 'uploaded' && !props.episode.uploadedContent) return false
  return true
})

/**
 * 单类型"重新识别"的可见性。
 * 比 canIdentify 更宽松：剧集已确认（status≠pending）也允许，仍可对单类要素重新跑 AI；
 * 仅要求 uploaded 模式 + 有长文原文（后端只支持 uploaded 模式识别）。
 */
const canReidentifyKind = computed(() => {
  if (!props.episode) return false
  if (props.episode.sourceType !== 'uploaded') return false
  if (!props.episode.uploadedContent) return false
  return true
})

const canConfirm = computed(() => {
  if (!props.episode || alreadyConfirmed.value) return false
  if (hasDirty.value) return false
  return confirmedCount.value > 0
})

// ===== 原文实体高亮 =====
type ExcerptSeg =
  | { type: 'text'; text: string }
  | {
      type: 'entity'
      name: string
      kind: Kind
      entity: UploadedCharacter | UploadedLocation | UploadedItem
    }

const highlightedExcerpt = computed<ExcerptSeg[]>(() => {
  const text = props.episode?.uploadedContent ?? ''
  if (!text) return []
  const matches: Array<{
    name: string
    kind: Kind
    entity: any
    start: number
    end: number
  }> = []
  const allEntities = [
    ...characters.value.map((e) => ({ entity: e, kind: 'character' as Kind })),
    ...locations.value.map((e) => ({ entity: e, kind: 'location' as Kind })),
    ...items.value.map((e) => ({ entity: e, kind: 'item' as Kind })),
  ].filter(({ entity }) => entity.name && entity.name.length > 0)

  for (const { entity, kind } of allEntities) {
    const name = entity.name
    let pos = 0
    while ((pos = text.indexOf(name, pos)) !== -1) {
      matches.push({ name, kind, entity, start: pos, end: pos + name.length })
      pos += name.length
    }
  }

  // 去重叠：按 start 升序排序，丢弃重叠（保留先到的较长匹配）
  matches.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start))
  const accepted: typeof matches = []
  for (const m of matches) {
    if (accepted.length === 0 || m.start >= accepted[accepted.length - 1].end) {
      accepted.push(m)
    }
  }

  const segs: ExcerptSeg[] = []
  let last = 0
  for (const m of accepted) {
    if (m.start > last) segs.push({ type: 'text', text: text.slice(last, m.start) })
    segs.push({ type: 'entity', name: m.name, kind: m.kind, entity: m.entity })
    last = m.end
  }
  if (last < text.length) segs.push({ type: 'text', text: text.slice(last) })
  return segs
})

// ===== AI 识别 =====
/**
 * @param kinds 不传 = 全部三类；传子集 = 只重新识别该类（其余保留现状）
 */
async function onIdentify(kinds?: Kind[]): Promise<void> {
  if (!props.episode) return
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型（用于 AI 识别）')
    return
  }

  const targetKinds: Kind[] | undefined =
    Array.isArray(kinds) && kinds.length > 0 ? kinds : undefined
  const isPartial = !!targetKinds && targetKinds.length < 3
  const kindLabels = targetKinds?.map(kindLabel).join(' / ') ?? ''

  // 仅当当前 kind 已有结果时才弹覆盖确认；首次识别（该 kind 为空）直接执行
  const existingForTarget = isPartial
    ? targetKinds!.reduce((sum, k) => sum + arrayFor(k).value.length, 0)
    : totalEntities.value
  if (existingForTarget > 0) {
    try {
      await ElMessageBox.confirm(
        isPartial
          ? `已有的"${kindLabels}"识别结果将被覆盖（包括已勾选 / 手动添加的同类 entity），其他类型保持不变。是否继续？`
          : '已有识别结果将被覆盖（包括已勾选 / 手动添加的 entity），是否继续？',
        isPartial ? `重新识别${kindLabels}` : '重新识别要素',
        { type: 'warning', confirmButtonText: '重新识别', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }

  identifying.value = true
  if (isPartial && targetKinds!.length === 1) {
    reidentifyingKind.value = targetKinds![0]
  }
  try {
    const result = await episodeStore.identifyEntities(
      props.episode.id,
      sm.providerConfigId,
      sm.modelId,
      targetKinds,
    )
    if (result) {
      if (isPartial) {
        const parts: string[] = []
        if (targetKinds!.includes('character')) parts.push(`${result.characters} 角色`)
        if (targetKinds!.includes('location')) parts.push(`${result.locations} 地点`)
        if (targetKinds!.includes('item')) parts.push(`${result.items} 物品`)
        ElMessage.success(`重新识别完成：${parts.join(' / ')}`)
      } else {
        ElMessage.success(
          `识别完成：${result.characters} 角色 / ${result.locations} 地点 / ${result.items} 物品`,
        )
      }
    } else {
      ElMessage.error('识别失败，请检查模型配置或稍后重试')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? 'AI 识别失败')
  } finally {
    identifying.value = false
    reidentifyingKind.value = null
  }
}

// ===== 取舍 / 改 source / 删 / 改 =====
function arrayFor(kind: Kind) {
  if (kind === 'character') return characters
  if (kind === 'location') return locations
  return items
}

function toggleConfirmed(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  arr[idx] = { ...arr[idx], confirmed: !arr[idx].confirmed }
}

function toggleSource(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  const cur = arr[idx]
  if (cur.sourceType === 'standalone') {
    ElMessage.info('改为 linked_lw 需要选择长文实体（picker 留 phase 实施；当前仅支持 standalone → 已绑 lw → standalone）')
    return
  }
  // linked_lw → standalone：清 lw_*_id
  arr[idx] = {
    ...cur,
    sourceType: 'standalone',
    longWritingCharacterId: undefined,
    longWritingLocationId: undefined,
    longWritingItemId: undefined,
  } as any
}

function onDelete(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  const name = arr[idx].name
  ElMessageBox.confirm(
    `确定移除${kindLabel(kind)}"${name}"？`,
    '移除要素',
    { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
  )
    .then(() => {
      arr.splice(idx, 1)
    })
    .catch(() => {})
}

function onEdit(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  addDialog.value = {
    open: true,
    kind,
    initial: { ...arr[idx] },
    editIndex: idx,
  }
}

function onManualAdd(kind: Kind): void {
  addDialog.value = {
    open: true,
    kind,
    initial: { sourceType: 'standalone', confirmed: true },
    editIndex: null,
  }
}

function onManualAddConfirm(payload: any): void {
  const kind = addDialog.value.kind
  const arr = arrayFor(kind).value
  const editIdx = addDialog.value.editIndex
  const finalEntity: any = {
    ...payload,
    id: payload.id ?? `ent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    confirmed: payload.confirmed ?? true,
    sourceType: payload.sourceType ?? 'standalone',
  }
  if (editIdx !== null) {
    arr[editIdx] = finalEntity
  } else {
    arr.push(finalEntity)
  }
  addDialog.value.open = false
}

function kindLabel(k: Kind): string {
  return k === 'character' ? '角色' : k === 'location' ? '地点' : '物品'
}

// ===== 原文片段编辑 =====
function enterEditContent(): void {
  if (!props.episode || props.episode.sourceType !== 'uploaded') return
  const cur = props.episode.uploadedContent ?? ''
  editContentOriginal.value = cur
  editContentDraft.value = cur
  editingContent.value = true
}

function cancelEditContent(): void {
  editingContent.value = false
  editContentDraft.value = ''
  editContentOriginal.value = ''
}

async function saveEditContent(): Promise<void> {
  if (!props.episode) return
  if (!editContentDirty.value) {
    cancelEditContent()
    return
  }
  if (!isEditContentValid.value) {
    ElMessage.warning('原文字数需在 500–15000 字之间')
    return
  }
  savingContent.value = true
  try {
    const updated = await episodeStore.updateEpisode(props.episode.id, {
      uploadedContent: editContentDraft.value,
    })
    if (!updated) {
      ElMessage.error(useEpWorkbenchStore().error || '保存原文失败')
      return
    }
    ElMessage.success('原文已保存 — 如要据此刷新角色 / 地点 / 物品，请点"重新识别"')
    cancelEditContent()
  } finally {
    savingContent.value = false
  }
}

// ===== 保存 =====
async function saveEntities(): Promise<boolean> {
  if (!props.episode) return false
  saving.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.updateUploadedEntities) {
      ElMessage.error('当前环境不支持 updateUploadedEntities')
      return false
    }
    const resp = await api.updateUploadedEntities(props.episode.id, {
      uploadedCharacters: characters.value,
      uploadedLocations: locations.value,
      uploadedItems: items.value,
    })
    if (!resp.success) {
      ElMessage.error(resp.error || '保存失败')
      return false
    }
    lastSaved.value = snapshot()
    ElMessage.success('已保存')
    return true
  } finally {
    saving.value = false
  }
}

// ===== 确认进入 ② =====
async function onConfirm(): Promise<void> {
  if (!props.episode) return
  if (hasDirty.value) {
    const ok = await saveEntities()
    if (!ok) return
  }
  confirming.value = true
  try {
    const ok = await episodeStore.updateEpisode(props.episode.id, {
      status: 'asset_prep' as EpisodeStatus,
    } as any)
    if (ok) {
      ElMessage.success('要素已确认 → 进入 ② 资产 stage')
      emit('confirmed')
    } else {
      ElMessage.error('确认失败，请重试')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '确认失败')
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped lang="scss">
.stage-content-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-body {
  flex: 1;
  overflow: auto;
  padding: 16px 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.excerpt-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 标题栏类型 tag — 与 actions 按钮对齐，靠近右端 */
.source-type-tag {
  margin-right: 4px;
}

/* 原文片段 */
.excerpt-body {
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  max-height: 220px;
  overflow-y: auto;
}

.entity-mark {
  background: var(--el-color-warning-light-7);
  color: var(--el-text-color-primary);
  padding: 0 3px;
  border-radius: 2px;
  font-weight: 500;
  cursor: help;
}

.mark-character {
  background: var(--el-color-primary-light-7);
}
.mark-location {
  background: var(--el-color-success-light-7);
}
.mark-item {
  background: var(--el-color-warning-light-7);
}

.excerpt-editor {
  /* el-input textarea 容器自适应；保持与 .excerpt-body 视觉同高 */
  width: 100%;
}

.excerpt-editor :deep(.el-textarea__inner) {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.85;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
}

.excerpt-footer {
  margin-top: 8px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.word-count-hint {
  margin-left: 4px;
  color: var(--el-text-color-placeholder);
}

.word-count-hint.warn {
  color: var(--el-color-warning);
}

.dirty-tip {
  margin-left: 6px;
  color: var(--el-color-warning);
}

.entities-section-header {
  margin: 4px 0 -4px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.entity-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 1100px) {
  .entity-row {
    grid-template-columns: 1fr;
  }
}

/* 完成 banner */
.finish-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--el-color-info-light-9);
  border-left: 3px solid var(--el-color-info);
  border-radius: 0 4px 4px 0;
}

.finish-banner.ok {
  background: var(--el-color-success-light-9);
  border-left-color: var(--el-color-success);
}

.banner-icon {
  flex-shrink: 0;
  color: var(--el-color-info);
}

.finish-banner.ok .banner-icon {
  color: var(--el-color-success);
}

.banner-text {
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.banner-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
