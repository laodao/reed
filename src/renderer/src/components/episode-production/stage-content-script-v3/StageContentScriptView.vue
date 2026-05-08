<template>
  <!--
    StageContentScriptView · ① 内容 + ③ 剧本 合并容器（v3）

    Plan Task 9 实施：把 stage-content-v2 / stage-script-v2 两个 stage 合并成一个容器，
    通过 episode.status 切换 sub-state（pending / scripting / readonly），
    渲染同一个左主区两栏 + 右侧 EntitySidebar。

    sub-state 行为：
      - pending  ：只看到要素识别 + Excerpt + StoryBg；左侧 placeholder hint，
                   header 显示「确认要素 → ② 资产」按钮
      - scripting：左侧显示 Synopsis + SceneList（含 AI 生成剧本 CTA），
                   header 显示「完成定稿 → ④ 分镜」按钮
      - readonly：剧集已 asset_prep 或后续阶段，所有交互锁住，header 显示状态 tag

    联动：
      - 点要素 → 高亮该要素出现的所有场景
      - 展开场景 → 高亮场景内的要素
  -->
  <div class="stage-content-script-v3">
    <StageMainHeader title="内容+剧本" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          v-if="subState === 'pending'"
          type="success"
          :loading="confirming"
          :disabled="!canConfirmEntities"
          @click="onConfirmEntities"
        >
          <el-icon><Check /></el-icon>
          确认要素 → ② 资产
        </el-button>
        <el-button
          v-else-if="subState === 'scripting'"
          type="success"
          :loading="approving"
          :disabled="!canApproveScript"
          @click="onApproveScript"
        >
          <el-icon><Check /></el-icon>
          完成定稿 → ④ 分镜
        </el-button>
        <el-tag v-else type="success" round>{{ readonlyTagLabel }}</el-tag>
      </template>
    </StageMainHeader>

    <div v-if="!episode" class="empty-state">
      <el-empty description="请先选择剧集" />
    </div>

    <div v-else class="content-body">
      <!-- 顶部内容行：原文 + 故事背景（仅 uploaded 模式 + 有原文时显示） -->
      <div
        v-if="episode.sourceType === 'uploaded' && episode.uploadedContent"
        class="excerpt-row"
      >
        <ExcerptPanel
          :episode="episode"
          :characters="characters"
          :locations="locations"
          :items="items"
          :identifying="identifying"
          :readonly="readonly"
          :synopsis="subState !== 'pending' ? synopsisDraft : undefined"
          :regenerating="regenSynopsis"
          @reidentify="onIdentifyAll()"
          @save-content="onSaveContent"
          @regenerate-synopsis="onRegenSynopsis"
        />
        <StoryBackgroundPanel :episode-id="episode.id" :readonly="readonly" />
      </div>

      <!-- 主区两栏：左主区 + 右侧 EntitySidebar -->
      <div class="main-row">
        <div class="left-col">
          <!-- pending sub-state：仅显示 placeholder hint -->
          <div v-if="subState === 'pending'" class="pending-hint">
            <el-icon :size="48" color="var(--el-text-color-placeholder)">
              <InfoFilled />
            </el-icon>
            <p>
              识别并确认要素后，进入资产准备阶段；资产准备完成后回到此页面
              ✨ AI 生成剧本
            </p>
          </div>

          <template v-else>
            <div v-if="!script" class="generate-script-cta">
              <el-button
                type="primary"
                size="large"
                :loading="generating"
                :disabled="readonly"
                @click="onGenerateScript"
              >
                <el-icon><MagicStick /></el-icon>
                ✨ AI 生成剧本
              </el-button>
            </div>

            <SceneListPanel
              v-else
              :scenes="scenes"
              :entities="entityList"
              :characters="characters"
              :locations="locations"
              :items="items"
              :highlighted-entity="highlightedEntity"
              :readonly="readonly"
              @add-scene="onAddScene"
              @rewrite-scenes="onGenerateScript"
              @fix-bindings="onFixBindings"
              @edit-scene="onEditScene"
              @expand="onExpandScene"
              @collapse="onCollapseScene"
              @click-entity="onClickEntity"
            />
          </template>
        </div>

        <EntitySidebar
          :characters="characters"
          :locations="locations"
          :items="items"
          :scenes="scenes"
          :highlighted-entity="highlightedEntity"
          :highlighted-scene-id="highlightedSceneId"
          :readonly="readonly"
          @click-entity="onClickEntity"
          @toggle="onToggleEntity"
          @toggle-source="onToggleSource"
          @edit="onEditEntity"
          @delete="onDeleteEntity"
          @reidentify="onReidentifyKind"
          @add="onManualAdd"
        />
      </div>
    </div>

    <!-- 手动添加 / 编辑 entity 对话框 -->
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
import { Check, InfoFilled, MagicStick } from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import EntitySidebar from './EntitySidebar.vue'
import SceneListPanel from './SceneListPanel.vue'
import ExcerptPanel from './ExcerptPanel.vue'
import StoryBackgroundPanel from './StoryBackgroundPanel.vue'
import ManualAddEntityDialog from './ManualAddEntityDialog.vue'
import {
  useEpAssetStore,
  useEpEpisodeStore,
  useEpProjectStore,
  useEpScriptStore,
  useEpWorkbenchStore,
} from '@/stores/episode-production'
import type {
  EpisodeStatus,
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
  VideoEpisode,
} from '../../../../../shared/types/episode-production'
import type { EntityRef } from './scene-entity-utils'

defineOptions({ name: 'StageContentScriptView' })

type Kind = 'character' | 'location' | 'item'

const props = defineProps<{
  episode: VideoEpisode | null
  /** 项目 id —— SceneListPanel 实体引用 binding 字典需要按项目加载 */
  projectId?: string
}>()

const emit = defineEmits<{
  (e: 'confirmed-entities'): void
  (e: 'approved-script'): void
  (
    e: 'go-asset-stage',
    payload: { kind: Kind | 'voice'; bindingId?: string },
  ): void
}>()

const episodeStore = useEpEpisodeStore()
const projectStore = useEpProjectStore()
const scriptStore = useEpScriptStore()
const assetStore = useEpAssetStore()

// ===== sub-state 派生 =====
const subState = computed<'pending' | 'scripting' | 'readonly'>(() => {
  const s = props.episode?.status as EpisodeStatus | undefined
  if (!s) return 'pending'
  if (s === 'pending' || s === 'scripting') return s
  return 'readonly'
})

const readonly = computed(() => subState.value === 'readonly')

const readonlyTagLabel = computed(() => {
  const s = props.episode?.status as EpisodeStatus | undefined
  if (s === 'asset_prep') return '已确认（在阶段 ②）'
  return '已定稿'
})

// ===== 要素状态：从 episode 同步到本地 ref（保留旧 v2 的服务端快照 / dirty 检测）=====
const characters = ref<UploadedCharacter[]>([])
const locations = ref<UploadedLocation[]>([])
const items = ref<UploadedItem[]>([])

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

function applyEntityDefaults<
  T extends UploadedCharacter | UploadedLocation | UploadedItem,
>(arr: T[]): T[] {
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

function snapshot(): { characters: string; locations: string; items: string } {
  return {
    characters: JSON.stringify(characters.value),
    locations: JSON.stringify(locations.value),
    items: JSON.stringify(items.value),
  }
}

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

const hasDirty = computed(() => {
  if (!lastSaved.value) return false
  const cur = snapshot()
  return (
    cur.characters !== lastSaved.value.characters ||
    cur.locations !== lastSaved.value.locations ||
    cur.items !== lastSaved.value.items
  )
})

// ===== 剧本 / 场景 / synopsis =====
const script = computed(() => scriptStore.currentScript)
const scenes = computed(() => scriptStore.scenes ?? [])
const synopsisDraft = computed(() => (script.value as any)?.synopsis ?? '')

// 实体清单（给 SceneListPanel EntityRefRenderer 用）
const entityList = computed(() => {
  const list: any[] = []
  characters.value.forEach((c) =>
    list.push({ kind: 'character', name: c.name, id: c.id, sourceType: c.sourceType ?? 'standalone' }),
  )
  locations.value.forEach((l) =>
    list.push({ kind: 'location', name: l.name, id: l.id, sourceType: l.sourceType ?? 'standalone' }),
  )
  items.value.forEach((i) =>
    list.push({ kind: 'item', name: i.name, id: i.id, sourceType: i.sourceType ?? 'standalone' }),
  )
  return list
})

// ===== 联动：高亮要素 / 高亮场景 =====
const highlightedEntity = ref<EntityRef | null>(null)
const highlightedSceneId = ref<string | null>(null)

function onClickEntity(entity: EntityRef): void {
  if (
    highlightedEntity.value &&
    highlightedEntity.value.kind === entity.kind &&
    highlightedEntity.value.name === entity.name
  ) {
    highlightedEntity.value = null
  } else {
    highlightedEntity.value = entity
  }
}

function onClickEntityFromText(meta: any): void {
  if (meta?.kind && meta?.name) {
    onClickEntity({ kind: meta.kind, name: meta.name, id: meta.id })
  }
}

function onExpandScene(sceneId: string): void {
  highlightedSceneId.value = sceneId
}

function onCollapseScene(sceneId: string): void {
  if (highlightedSceneId.value === sceneId) highlightedSceneId.value = null
}

// ===== loading / disabled 状态 =====
const identifying = ref(false)
const reidentifyingKind = ref<Kind | null>(null)
const confirming = ref(false)
const saving = ref(false)
const approving = ref(false)
const generating = ref(false)
const regenSynopsis = ref(false)
const fixingBindings = ref(false)

const canConfirmEntities = computed(() => {
  if (subState.value !== 'pending') return false
  return [...characters.value, ...locations.value, ...items.value].some(
    (e) => e.confirmed,
  )
})

const canApproveScript = computed(() => {
  if (subState.value !== 'scripting') return false
  return !!script.value && scenes.value.length > 0
})

const headerSubtitle = computed(() => {
  if (!props.episode) return ''
  const c = characters.value.length
  const l = locations.value.length
  const i = items.value.length
  const m = scenes.value.length
  return `已识别 ${c} 角色 / ${l} 地点 / ${i} 物品 · ${m} 个场景`
})

// ===== 手动添加 / 编辑对话框状态 =====
const addDialog = ref<{
  open: boolean
  kind: Kind
  initial: Partial<UploadedCharacter & UploadedLocation & UploadedItem>
  editIndex: number | null
}>({ open: false, kind: 'character', initial: {}, editIndex: null })

function arrayFor(kind: Kind) {
  if (kind === 'character') return characters
  if (kind === 'location') return locations
  return items
}

function kindLabel(k: Kind): string {
  return k === 'character' ? '角色' : k === 'location' ? '地点' : '物品'
}

// ====================================================================
// 业务函数（从 stage-content-v2 / stage-script-v2 拷贝并适配）
// ====================================================================

/**
 * AI 识别（全部三类或子集）。从 stage-content-v2 拷贝。
 * @param kinds 不传 = 全部；传子集 = 只重新识别该类
 */
async function onIdentifyAll(kinds?: Kind[]): Promise<void> {
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
  const totalForTarget = isPartial
    ? targetKinds!.reduce((sum, k) => sum + arrayFor(k).value.length, 0)
    : characters.value.length + locations.value.length + items.value.length
  if (totalForTarget > 0) {
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

/** 单类型重识别。EntitySidebar emit('reidentify', kind) 回调。 */
function onReidentifyKind(kind: Kind): void {
  void onIdentifyAll([kind])
}

/** 取舍勾选。从 stage-content-v2 toggleConfirmed 拷贝。 */
function onToggleEntity(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  arr[idx] = { ...arr[idx], confirmed: !arr[idx].confirmed }
}

/** 切换 source（standalone ↔ linked_lw）。从 stage-content-v2 toggleSource 拷贝。 */
function onToggleSource(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  const cur = arr[idx]
  if (cur.sourceType === 'standalone') {
    ElMessage.info(
      '改为 linked_lw 需要选择长文实体（picker 留 phase 实施；当前仅支持 standalone → 已绑 lw → standalone）',
    )
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

/** 编辑 entity（开 dialog）。从 stage-content-v2 onEdit 拷贝并改名。 */
function onEditEntity(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  addDialog.value = {
    open: true,
    kind,
    initial: { ...arr[idx] },
    editIndex: idx,
  }
}

/** 删除 entity。从 stage-content-v2 onDelete 拷贝并改名。 */
function onDeleteEntity(kind: Kind, idx: number): void {
  const arr = arrayFor(kind).value
  if (!arr[idx]) return
  const name = arr[idx].name
  ElMessageBox.confirm(`确定移除${kindLabel(kind)}"${name}"？`, '移除要素', {
    type: 'warning',
    confirmButtonText: '移除',
    cancelButtonText: '取消',
  })
    .then(() => {
      arr.splice(idx, 1)
    })
    .catch(() => {})
}

/** 手动添加 entity（开 dialog）。从 stage-content-v2 onManualAdd 拷贝。 */
function onManualAdd(kind: Kind): void {
  addDialog.value = {
    open: true,
    kind,
    initial: { sourceType: 'standalone', confirmed: true },
    editIndex: null,
  }
}

/** dialog confirm 回调。从 stage-content-v2 onManualAddConfirm 拷贝。 */
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

/** 把本地 characters/locations/items 落库。从 stage-content-v2 saveEntities 拷贝。 */
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

/** 确认要素 → ② 资产。从 stage-content-v2 onConfirm 拷贝并改名 + emit 通知父级。 */
async function onConfirmEntities(): Promise<void> {
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
      emit('confirmed-entities')
    } else {
      ElMessage.error('确认失败，请重试')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '确认失败')
  } finally {
    confirming.value = false
  }
}

/** 保存原文。ExcerptPanel 触发 save-content 事件后由容器实际调 IPC。 */
async function onSaveContent(content: string): Promise<void> {
  if (!props.episode) return
  try {
    const ok = await episodeStore.updateEpisode(props.episode.id, {
      uploadedContent: content,
    } as any)
    if (ok) {
      ElMessage.success('原文已保存 — 如要据此刷新角色 / 地点 / 物品，请点"重新 AI 分析"')
    } else {
      ElMessage.error(useEpWorkbenchStore().error || '保存原文失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '保存原文失败')
  }
}

/**
 * AI 生成剧本（首次生成 / 重写）。从 stage-script-v2 onGenerateScript 拷贝。
 * 已有剧本 → 弹覆盖确认。
 */
async function onGenerateScript(): Promise<void> {
  if (!props.episode) return
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型')
    return
  }
  if (script.value) {
    try {
      await ElMessageBox.confirm('已有剧本将被覆盖，是否继续？', '重新生成剧本', {
        type: 'warning',
        confirmButtonText: '重新生成',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
  }
  generating.value = true
  try {
    const result = await scriptStore.generateScript(
      props.episode.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (result) {
      ElMessage.success('剧本已生成')
      // store.generateScript 已把 currentScript 设进 store；保险起见再 reload
      const sid = scriptStore.currentScript?.id
      if (sid) await scriptStore.loadScript(sid)
    } else {
      ElMessage.error('生成失败')
    }
  } finally {
    generating.value = false
  }
}

/**
 * 重新生成章节梗概。当前后端 generateScript 是覆盖式（重写 synopsis + 重建 scenes），
 * 没独立的 regenerateSynopsis IPC，所以诚实告知 user 会同时重建场景。
 * 从 stage-script-v2 onRegenSynopsis 拷贝。
 */
async function onRegenSynopsis(): Promise<void> {
  if (!script.value) {
    await onGenerateScript()
    return
  }
  try {
    await ElMessageBox.confirm(
      '章节梗概重生成会重新拆解整集剧本，已有的场景修改将被覆盖。\n如果只想微调梗概文字，建议直接编辑现有梗概块。\n\n仍要让 AI 重新生成？',
      '重生成梗概',
      {
        type: 'warning',
        confirmButtonText: '重新生成（覆盖）',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  regenSynopsis.value = true
  try {
    await onGenerateScript()
  } finally {
    regenSynopsis.value = false
  }
}

/** 修复缺失绑定。从 stage-script-v2 onFixBindings 拷贝。 */
async function onFixBindings(): Promise<void> {
  if (!script.value) return
  fixingBindings.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.fixScriptBindingsByName?.(script.value.id)
    if (resp?.success) {
      ElMessage.success(`已修复 ${resp.data?.fixed ?? 0} 处 binding`)
      await scriptStore.loadScript(script.value.id)
    } else {
      ElMessage.error(resp?.error || '修复失败')
    }
  } finally {
    fixingBindings.value = false
  }
}

/** 完成定稿 → ④ 分镜。从 stage-script-v2 onApprove 拷贝并改名 + emit。 */
async function onApproveScript(): Promise<void> {
  if (!script.value) return
  approving.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.updateScript?.(script.value.id, { status: 'approved' })
    if (resp?.success) {
      ElMessage.success('已定稿 → 可进入 ④ 分镜')
      await scriptStore.loadScript(script.value.id)
      emit('approved-script')
    } else {
      ElMessage.error(resp?.error || '定稿失败')
    }
  } finally {
    approving.value = false
  }
}

/**
 * 手动添加场景（两步 prompt）。从 stage-script-v2 onAddScene 拷贝。
 * 弹两步 prompt 输地点 + 时间，调 ep:create-scene 落库（自动追加 sceneNumber），
 * reload 后让 user 在新场景上点"编辑"细化。
 */
async function onAddScene(): Promise<void> {
  if (!script.value?.id) {
    ElMessage.warning('请先生成剧本')
    return
  }
  let location = ''
  let timeOfDay: 'day' | 'night' | 'dawn' | 'dusk' = 'day'
  try {
    const r1 = await ElMessageBox.prompt(
      '请输入新场景的地点名称（可后续细化）',
      '添加场景 (1/2)',
      {
        confirmButtonText: '下一步',
        cancelButtonText: '取消',
        inputPattern: /^.{1,80}$/,
        inputErrorMessage: '地点必填，最多 80 字符',
      },
    )
    location = String(r1.value ?? '').trim()
    const r2 = await ElMessageBox.prompt(
      '时间段（day / night / dawn / dusk，默认 day）',
      '添加场景 (2/2)',
      {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValue: 'day',
        inputPattern: /^(day|night|dawn|dusk)$/,
        inputErrorMessage: '只能是 day / night / dawn / dusk 之一',
      },
    )
    timeOfDay = r2.value as typeof timeOfDay
  } catch {
    return
  }
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.createScene) {
    ElMessage.error('createScene IPC 不可用')
    return
  }
  const resp = await api.createScene(script.value.id, { location, timeOfDay })
  if (!resp?.success) {
    ElMessage.error(resp?.error || '创建场景失败')
    return
  }
  ElMessage.success(`已添加场景：${location}`)
  await scriptStore.loadScript(script.value.id)
}

/**
 * 单场景"编辑"：弹 prompt 让 user 改地点。
 * 完整 dialog（含 mood/lighting/characters）留 follow-up。
 * 从 stage-script-v2 onEditScene 拷贝。
 */
async function onEditScene(id: string): Promise<void> {
  const scene = scenes.value.find((s: any) => s.id === id)
  if (!scene) {
    ElMessage.error('场景未找到')
    return
  }
  let location: string
  try {
    const r = await ElMessageBox.prompt(
      '修改地点名称',
      `编辑场景 #${(scene as any).sceneNumber}`,
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: (scene as any).location ?? '',
        inputPattern: /^.{1,80}$/,
        inputErrorMessage: '地点必填，最多 80 字符',
      },
    )
    location = String(r.value ?? '').trim()
  } catch {
    return
  }
  const api = (window as any).electronAPI?.episodeProduction
  const resp = await api?.updateScene?.(id, { location })
  if (!resp?.success) {
    ElMessage.error(resp?.error || '更新场景失败')
    return
  }
  ElMessage.success('场景已更新')
  if (script.value?.id) await scriptStore.loadScript(script.value.id)
}

// projectId 变更时加载资产（剧本 EntityRefRenderer 需要 binding 字典；
// 当前 entityList 直接用 uploaded 三件套，但保留这一行预留 follow-up）
watch(
  () => props.projectId,
  (pid) => {
    if (pid) void assetStore.loadAssetsByProject(pid)
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.stage-content-script-v3 {
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
  /* 整体不滚动；左/右栏各自独立滚动，让两栏高度自适应 main-row */
  overflow: hidden;
  padding: 8px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.excerpt-row {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  /* 固定高度 300px（StoryBackgroundPanel 自然内容约 300px 也合适）。
     两侧 panel 都设 height: 100% 占满该行；ExcerptPanel 内 body
     用 height:0 + flex:1 撑满 panel 内剩余高度。 */
  height: 300px;
}

.excerpt-row > * {
  height: 100%;
}

@media (max-width: 1100px) {
  .excerpt-row {
    flex-direction: column;
  }
}

.main-row {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: stretch;
  min-height: 0;
}

.left-col {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.pending-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 48px 24px;
  background: var(--el-bg-color);
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 6px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.pending-hint p {
  margin: 0;
  max-width: 480px;
}

.generate-script-cta {
  display: flex;
  justify-content: center;
  padding: 32px 0;
  background: var(--el-bg-color);
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 6px;
}
</style>
