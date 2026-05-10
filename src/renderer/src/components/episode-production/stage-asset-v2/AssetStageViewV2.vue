<template>
  <!--
    AssetStageViewV2 · ② 资产盘点（FU5-C1）

    严格按对照表 §3 cell 表 + 16 条差异修订实施：
    - StageMainHeader：标题 + 副标题（4 类资产摘要 + 已就绪进度）+ 一键生成 / 跳过空缺 / 完成本阶段
    - 4 节 asset-section：角色 / 地点 / 物品 / 语音
      每节 header（沿用其他 stage 的 panel-header 风格：无下划线、无大号 icon block）
    - 卡片：缩略图 + AssetSourceTag(badge) + 状态 tag + meta 按 4 类定制 + 双按钮 actions
    - 主题切换：全 var(--el-*)（G1）

    数据：FU5-C1 ep:asset:project-summary 一次性拉聚合视图。
    旧 AssetStageView.vue 暂保留作参考，下个 phase 删。
  -->
  <div class="asset-stage-v2">
    <StageMainHeader title="② 资产盘点" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          v-if="missingMainCount > 0"
          :loading="generatingAll"
          :disabled="actionBusy"
          @click="onSkipEmpty"
        >
          <el-icon><Right /></el-icon>
          <span>跳过空缺（{{ missingMainCount }}）</span>
        </el-button>
        <el-button
          v-if="missingMainCount > 0"
          type="primary"
          :loading="generatingAll"
          :disabled="actionBusy"
          @click="onGenerateAllMissing"
        >
          <el-icon><MagicStick /></el-icon>
          <span>✨ 一键生成所有缺失主图（{{ missingMainCount }}）</span>
        </el-button>
        <el-button
          type="success"
          :disabled="!canComplete || actionBusy"
          @click="emit('complete')"
        >
          <span>完成本阶段 →</span>
        </el-button>
      </template>
    </StageMainHeader>

    <div class="content-body">
    <!-- 角色 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">👤</span>
          <span>角色</span>
          <el-tag size="small" round class="section-count">{{ summary.characters.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button
            size="small"
            :loading="batchDeriving && batchDerivingKind === 'character'"
            :disabled="summary.characters.length === 0 || actionBusy"
            @click="onBatchDerive('character')"
          >
            <el-icon><MagicStick /></el-icon>
            批量派生图谱
          </el-button>
          <el-button size="small" :disabled="actionBusy" @click="onAddCharacter">
            <el-icon><Plus /></el-icon>
            新建角色
          </el-button>
        </div>
      </header>
      <div v-if="summary.characters.length === 0" class="empty-hint">
        <el-empty description="还没有角色 — 点 + 新建" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <CharacterAssetCardV2
          v-for="c in summary.characters"
          :key="c.bindingId"
          :summary="c"
          @click="emit('open-character', c.bindingId)"
          @generate-main="emit('generate-main', { kind: 'character', id: c.bindingId })"
          @delete="onDeleteBinding('character', c.bindingId, c.name)"
          @add-to-library="onAddToLibrary('character', c.bindingId, c.name)"
        />
      </div>
    </section>

    <!-- 地点 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">🏛</span>
          <span>地点</span>
          <el-tag size="small" round class="section-count">{{ summary.locations.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button
            size="small"
            :loading="batchDeriving && batchDerivingKind === 'location'"
            :disabled="summary.locations.length === 0 || actionBusy"
            @click="onBatchDerive('location')"
          >
            <el-icon><MagicStick /></el-icon>
            批量派生变体
          </el-button>
          <el-button size="small" :disabled="actionBusy" @click="onAddLocation">
            <el-icon><Plus /></el-icon>
            新建地点
          </el-button>
        </div>
      </header>
      <div v-if="summary.locations.length === 0" class="empty-hint">
        <el-empty description="还没有地点 — 点 + 新建" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <LocationAssetCardV2
          v-for="l in summary.locations"
          :key="l.bindingId"
          :summary="l"
          @click="emit('open-location', l.bindingId)"
          @generate-main="emit('generate-main', { kind: 'location', id: l.bindingId })"
          @delete="onDeleteBinding('location', l.bindingId, l.name)"
          @add-to-library="onAddToLibrary('location', l.bindingId, l.name)"
        />
      </div>
    </section>

    <!-- 物品 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">⚔️</span>
          <span>物品</span>
          <el-tag size="small" round class="section-count">{{ summary.items.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button size="small" :disabled="actionBusy" @click="onAddItem">
            <el-icon><Plus /></el-icon>
            新建物品
          </el-button>
        </div>
      </header>
      <div v-if="summary.items.length === 0" class="empty-hint">
        <el-empty description="还没有物品 — 点 + 新建" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <ItemAssetCardV2
          v-for="it in summary.items"
          :key="it.bindingId"
          :summary="it"
          @click="emit('open-item', it.bindingId)"
          @generate-main="emit('generate-main', { kind: 'item', id: it.bindingId })"
          @delete="onDeleteBinding('item', it.bindingId, it.name)"
          @add-to-library="onAddToLibrary('item', it.bindingId, it.name)"
        />
      </div>
    </section>

    <!-- 语音 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">🎙</span>
          <span>语音</span>
          <el-tag size="small" round class="section-count">{{ summary.voices.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button size="small" :disabled="actionBusy" @click="onAddVoice">
            <el-icon><Plus /></el-icon>
            复刻新音色
          </el-button>
        </div>
      </header>
      <div v-if="summary.voices.length === 0" class="empty-hint">
        <el-empty description="还没有语音 — 点 + 复刻" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <VoiceAssetCardV2
          v-for="v in summary.voices"
          :key="v.voiceId"
          :summary="v"
          @click="emit('open-voice', v.voiceId)"
        />
      </div>
    </section>

    </div>

    <!-- 声音复刻对话框（"+ 复刻新音色"按钮触发；完成后 reload summary） -->
    <VoiceCloneDialog
      v-model="voiceCloneDialogVisible"
      use-case="asset-stage"
      @completed="onVoiceCloneCompleted"
      @failed="onVoiceCloneFailed"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Plus, Right } from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import CharacterAssetCardV2 from './CharacterAssetCardV2.vue'
import LocationAssetCardV2 from './LocationAssetCardV2.vue'
import ItemAssetCardV2 from './ItemAssetCardV2.vue'
import VoiceAssetCardV2 from './VoiceAssetCardV2.vue'
import VoiceCloneDialog from '@/components/voice/VoiceCloneDialog.vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'open-character', id: string): void
  (e: 'open-location', id: string): void
  (e: 'open-item', id: string): void
  (e: 'open-voice', id: string): void
  (e: 'add-character'): void
  (e: 'add-location'): void
  (e: 'add-item'): void
  (e: 'add-voice'): void
  (e: 'generate-main', payload: { kind: 'character' | 'location' | 'item'; id: string }): void
  (e: 'complete'): void
}>()

const summary = ref<{
  characters: any[]
  locations: any[]
  items: any[]
  voices: any[]
  totals: {
    bindingTotal: number
    bindingWithMain: number
    galleryTotal: number
    galleryCompletionPct: number
  }
}>({
  characters: [],
  locations: [],
  items: [],
  voices: [],
  totals: {
    bindingTotal: 0,
    bindingWithMain: 0,
    galleryTotal: 0,
    galleryCompletionPct: 0,
  },
})

const generatingAll = ref(false)

const headerSubtitle = computed(() => {
  const s = summary.value
  return `${s.characters.length} 角色 · ${s.locations.length} 地点 · ${s.items.length} 物品 · ${s.voices.length} 语音 · 已就绪 ${s.totals.bindingWithMain}/${s.totals.bindingTotal}`
})

const totalCount = computed(() => summary.value.totals.bindingTotal)
const missingMainCount = computed(
  () => totalCount.value - summary.value.totals.bindingWithMain,
)
const canComplete = computed(() => missingMainCount.value === 0 && totalCount.value > 0)

async function reload(): Promise<void> {
  if (!props.projectId) return
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.projectSummary) {
    ElMessage.warning('当前环境不支持 projectSummary IPC')
    return
  }
  const resp = await api.projectSummary(props.projectId)
  if (!resp.success) {
    ElMessage.error(resp.error || '获取资产摘要失败')
    return
  }
  summary.value = resp.data
}

defineExpose({ reload })

watch(() => props.projectId, () => void reload(), { immediate: true })
onMounted(() => void reload())

/*
 * FU8-C5 一键生成所有缺失主图：
 *   旧实现只 emit 给父组件，但父组件从未注册 generate-main handler →
 *   按钮点了什么都没发生。改在本组件内部实现并发受限的真任务队列：
 *
 *   遍历 character / location / item 三类 binding 中 hasMain=false 的，
 *   每条调 generateMainFor(kind, bindingId)（已封装 effective+prompt+IPC）。
 *   并发上限 2 避免压垮 provider；任意条失败不阻塞其他条。
 *   全部跑完后 reload() 拉最新 summary，让卡片立刻更新主图。
 */
async function onGenerateAllMissing(): Promise<void> {
  if (generatingAll.value) return
  const tasks: Array<{ kind: 'character' | 'location' | 'item'; id: string }> = []
  for (const c of summary.value.characters) {
    if (!c.hasMain) tasks.push({ kind: 'character', id: c.bindingId })
  }
  for (const l of summary.value.locations) {
    if (!l.hasMain) tasks.push({ kind: 'location', id: l.bindingId })
  }
  for (const i of summary.value.items) {
    if (!i.hasMain) tasks.push({ kind: 'item', id: i.bindingId })
  }
  if (tasks.length === 0) {
    ElMessage.info('没有缺失主图的资产')
    return
  }

  generatingAll.value = true

  // ── Stage 1: AI 设定反推（仅填空字段；任意 kind 失败不阻塞 stage 2） ──
  try {
    ElMessage.info('① AI 正在为缺失主图的资产反推设定卡…')
    const { enrichAssetSettings } = await import('@/api/asset-setting-enrichment')
    const enrichSummary = await enrichAssetSettings(props.projectId)
    const total =
      enrichSummary.enrichedCount.character +
      enrichSummary.enrichedCount.location +
      enrichSummary.enrichedCount.item
    if (enrichSummary.failures.length > 0) {
      ElMessage.warning(
        `部分 kind 反推失败：${enrichSummary.failures.map((f) => f.kind).join(', ')}（继续生成）`,
      )
    } else {
      ElMessage.success(`AI 反推完成，写入 ${total} 项设定`)
    }
  } catch (e: any) {
    generatingAll.value = false
    ElMessage.error(`AI 反推中止：${e?.message ?? e}`)
    return
  }

  // 重新拉 summary（反推可能改了 hasMain 周边的可见字段；hasMain 本身不变，但生成依据已更新）
  await reload()

  // ── Stage 2: 主图批量生成 ──
  ElMessage.info(`② 开始为 ${tasks.length} 个资产生成主图（并发 2）`)
  let okCount = 0
  let failCount = 0
  const failures: string[] = []
  const { generateMainFor } = await import('@/api/main-image-generator')
  const concurrency = 2
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const idx = cursor++
      const t = tasks[idx]
      try {
        await generateMainFor(t.kind, t.id)
        okCount++
      } catch (e: any) {
        failCount++
        failures.push(`${t.kind}/${t.id.slice(0, 8)}: ${e?.message ?? e}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))

  await reload()
  generatingAll.value = false

  if (failCount === 0) {
    ElMessage.success(`已为 ${okCount} 个资产生成主图`)
  } else {
    ElMessage.warning(
      `主图生成完成：成功 ${okCount}，失败 ${failCount}\n${failures.slice(0, 3).join('\n')}`,
    )
  }
}

function onSkipEmpty(): void {
  ElMessage.info('已跳过空缺（缺图 binding 仍在 ② 阶段保留；进 ⑤ 渲染前会硬卡）')
}

/**
 * stage 级"批量派生"：遍历该 kind 下所有 binding，对每个 binding 调 derive.batch
 * 派生该资产域全部 category 的缺失 label。串行（避免压垮 provider），单条失败不阻塞其他。
 *
 * 资产域 category：
 *   - character: view / expression / outfit / pose
 *   - location:  time_variant / weather_variant / angle_variant
 *   - item: view / context（不通过本入口；item 上没暴露此按钮）
 */
const CATEGORY_LABELS: Record<'character' | 'location', Array<{ key: string; labels: string[] }>> = {
  character: [
    { key: 'view', labels: ['front', 'back', 'left', 'right', 'three_quarter_left', 'three_quarter_right'] },
    { key: 'expression', labels: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'confused'] },
    { key: 'outfit', labels: [] }, // 自由 label，跳过批量
    { key: 'pose', labels: ['stand', 'sit', 'walk', 'lie'] },
  ],
  location: [
    { key: 'time_variant', labels: ['morning', 'noon', 'afternoon', 'evening', 'night', 'dawn', 'dusk'] },
    { key: 'weather_variant', labels: ['sunny', 'cloudy', 'rainy', 'snowy', 'foggy', 'stormy'] },
    { key: 'angle_variant', labels: ['wide_shot', 'entrance', 'interior_a', 'interior_b'] },
  ],
}

const batchDeriving = ref(false)
const batchDerivingKind = ref<'character' | 'location' | null>(null)
const deletingBinding = ref(false)

/** 全 stage 级繁忙：任一 action 进行中，所有按钮置灰 */
const actionBusy = computed(
  () => generatingAll.value || batchDeriving.value || deletingBinding.value,
)

async function onBatchDerive(kind: 'character' | 'location'): Promise<void> {
  if (actionBusy.value) return
  batchDerivingKind.value = kind
  const list = kind === 'character' ? summary.value.characters : summary.value.locations
  const eligible = list.filter((b: any) => b.hasMain) // 没主图无法派生
  if (eligible.length === 0) {
    ElMessage.warning(`${kind === 'character' ? '角色' : '地点'}缺主图，无法批量派生（请先生成主图）`)
    return
  }
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.derive?.batch) {
    ElMessage.error('derive.batch IPC 未暴露')
    return
  }
  batchDeriving.value = true
  let okBindings = 0
  let failBindings = 0
  const failures: string[] = []
  ElMessage.info(`开始批量派生 ${eligible.length} 个${kind === 'character' ? '角色' : '地点'}的图谱`)
  try {
    for (const b of eligible) {
      let bindingHadAny = false
      let bindingFailed = false
      for (const cat of CATEGORY_LABELS[kind]) {
        if (cat.labels.length === 0) continue // 跳过自由 label 类
        try {
          const resp = await api.derive.batch({
            assetType: kind,
            assetId: b.bindingId,
            category: cat.key,
            labels: cat.labels,
          })
          if (resp?.success) {
            bindingHadAny = true
          } else {
            bindingFailed = true
            failures.push(`${b.name} / ${cat.key}: ${resp?.error ?? '未知'}`)
          }
        } catch (e: any) {
          bindingFailed = true
          failures.push(`${b.name} / ${cat.key}: ${e?.message ?? e}`)
        }
      }
      if (bindingHadAny && !bindingFailed) okBindings++
      else if (bindingFailed) failBindings++
    }
    await reload()
  } finally {
    batchDeriving.value = false
    batchDerivingKind.value = null
  }
  if (failBindings === 0) {
    ElMessage.success(`已派生 ${okBindings} 个${kind === 'character' ? '角色' : '地点'}的图谱`)
  } else {
    ElMessage.warning(
      `批量派生完成：成功 ${okBindings} 失败 ${failBindings}\n${failures.slice(0, 3).join('\n')}`,
    )
  }
}

/*
 * FU6-T3 · 4 类资产新建按钮真功能
 * V1 版 stage-asset/AssetStageView.vue 已有 promptCreateStandalone 完整实现，
 * V2 重写时只 emit 没接，导致按钮全部"无反应"。
 *
 * 行为约定（spec §2.3）：
 *   - character / location / item · prompt 输名字 → asset.{kind}.createStandalone
 *     → reload + emit open-* 唤起 V2 编辑抽屉补充详情
 *   - voice · 复刻流程在 2026-05-08 T10 接通：直接打开 VoiceCloneDialog 完成全链路
 *     （上传样本 → DashScope CosyVoice → scheduler 轮询训练状态 → ready）。
 */
const voiceCloneDialogVisible = ref(false)
async function promptCreateStandalone(
  kind: 'character' | 'location' | 'item',
): Promise<void> {
  const labelMap = { character: '角色', location: '地点', item: '物品' } as const
  const label = labelMap[kind]
  let name: string
  try {
    const result = await ElMessageBox.prompt(`请输入${label}名称`, `新建${label}`, {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^.{1,80}$/,
      inputErrorMessage: '名称必填，最多 80 字符',
    })
    name = String(result.value ?? '').trim()
  } catch {
    return
  }
  if (!name) return

  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.[kind]?.createStandalone) {
    ElMessage.error(`${label}创建 IPC 不可用`)
    return
  }
  try {
    const resp = await api[kind].createStandalone({ projectId: props.projectId, name })
    if (!resp?.success) {
      ElMessage.error(resp?.error || `新建${label}失败`)
      return
    }
    ElMessage.success(`已创建${label}：${name}`)
    await reload()
    const id = resp.data?.id
    if (id) {
      emit(
        `open-${kind}` as 'open-character' | 'open-location' | 'open-item',
        id,
      )
    }
  } catch (e: any) {
    ElMessage.error(e?.message || `新建${label}失败`)
  }
}

function onAddCharacter(): void {
  void promptCreateStandalone('character')
}

function onAddLocation(): void {
  void promptCreateStandalone('location')
}

function onAddItem(): void {
  void promptCreateStandalone('item')
}

function onAddVoice(): void {
  // 直接打开复刻对话框（2026-05-08：T10 接通真实复刻链路）
  voiceCloneDialogVisible.value = true
}

async function onVoiceCloneCompleted(): Promise<void> {
  ElMessage.success('音色复刻完成')
  await reload()
}

async function onVoiceCloneFailed(payload: { errorMessage?: string }): Promise<void> {
  ElMessage.error(`复刻失败：${payload.errorMessage ?? '未知错误'}`)
  await reload()
}

/**
 * 资产卡 hover 删除入口（user mandate "还没有图也应该可以删除"）。
 * 复用 ep:asset:{kind}:delete IPC，删除时一并清理 asset_image 关联记录（service 层负责）。
 */
async function onDeleteBinding(
  kind: 'character' | 'location' | 'item',
  bindingId: string,
  name: string,
): Promise<void> {
  if (actionBusy.value) return
  const labelMap = { character: '角色', location: '地点', item: '物品' } as const
  const label = labelMap[kind]
  try {
    await ElMessageBox.confirm(
      `确认删除${label} "${name}"？相关图谱与设定一并删除，无法恢复。`,
      `删除${label}`,
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.[kind]?.delete) {
    ElMessage.error(`${label}删除 IPC 未暴露`)
    return
  }
  deletingBinding.value = true
  try {
    const resp = await api[kind].delete(bindingId)
    if (!resp?.success) {
      ElMessage.error(resp?.error || `删除${label}失败`)
      return
    }
    ElMessage.success(`已删除${label}：${name}`)
    await reload()
  } catch (e: any) {
    ElMessage.error(e?.message || `删除${label}失败`)
  } finally {
    deletingBinding.value = false
  }
}

/**
 * 加入我的库 — 把项目内 binding 拷到用户跨项目库（user_assets 表）。
 * 后端 service 拷快照 + 拷主图 + 拷形象组 ref images；用户可在「我的库」浏览 / 引用到其他项目。
 */
async function onAddToLibrary(
  kind: 'character' | 'location' | 'item',
  bindingId: string,
  name: string,
): Promise<void> {
  if (actionBusy.value) return
  const labelMap = { character: '角色', location: '地点', item: '物品' } as const
  const label = labelMap[kind]
  const api = (window as any).electronAPI?.episodeProduction?.asset?.userAsset
  if (!api?.addFromBinding) {
    ElMessage.error('「加入我的库」IPC 未暴露')
    return
  }
  try {
    const resp = await api.addFromBinding({ bindingId, bindingType: kind })
    if (!resp?.success) {
      ElMessage.error(resp?.error || `加入库失败`)
      return
    }
    ElMessage.success(`已把${label} "${name}" 加入我的库`)
  } catch (e: any) {
    ElMessage.error(e?.message || `加入库失败`)
  }
}
</script>

<style scoped lang="scss">
.asset-stage-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.content-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  overflow-y: auto;
}

.asset-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-icon {
  font-size: 14px;
}

.section-count {
  margin-left: 4px;
}

.section-actions {
  display: flex;
  gap: 8px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.empty-hint {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}
</style>
