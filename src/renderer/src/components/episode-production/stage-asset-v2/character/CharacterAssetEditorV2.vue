<template>
  <!--
    CharacterAssetEditorV2 · 角色资产编辑（FU5-C2 / 原型 §4）

    严格按对照表 §4 + §11 修订实施：
    - 顶部 header：返回 / 角色名 H2 / linked_lw 或 standalone tag / 主图齐备 tag /
      ↺ 拉取最新基础值 / 显式保存 按钮
    - LwSyncReminderBanner（FU5-A4）— linked_lw 模式下长文有更新时提醒
    - 双栏 grid 360px / 1fr：
      - 左 CharacterCardFormV2（设定卡 6 节）
      - 右 CharacterGalleryEditor wrapper：header 全局进度 + ✨ 批量派生缺失 +
        主图元信息 + 4 维度网格 + 底部派生流 tip
  -->
  <div v-loading="loading" class="character-editor-v2">
    <header class="editor-header">
      <el-button text class="back-btn" @click="emit('close')">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回盘点</span>
      </el-button>
      <h2 class="ch-name">{{ displayName }}</h2>
      <AssetSourceTag
        v-if="binding"
        :source="binding.sourceType ?? 'standalone'"
        :custom-label="
          binding.sourceType === 'linked_lw'
            ? `linked_lw · 来自长文`
            : 'standalone · 本剧独立'
        "
      />
      <el-tag
        v-if="hasMain"
        type="success"
        size="small"
        effect="light"
        class="status-tag"
      >主图齐备</el-tag>
      <el-tag v-else type="warning" size="small" effect="light" class="status-tag">缺主图</el-tag>

      <div class="header-spacer" />
      <el-button
        v-if="binding?.sourceType === 'linked_lw'"
        :loading="pulling"
        @click="onPullLatest"
      >
        <el-icon><Refresh /></el-icon>
        <span>↺ 拉取最新基础值</span>
      </el-button>
      <el-button
        type="success"
        :loading="saving"
        :disabled="!hasDirty"
        @click="onSave"
      >
        <el-icon><DocumentChecked /></el-icon>
        <span>保存{{ hasDirty ? `（${dirtyCount} 处）` : '' }}</span>
      </el-button>
    </header>

    <LwSyncReminderBanner
      v-if="binding?.sourceType === 'linked_lw'"
      entity-kind="character"
      :entity-name="displayName"
      :lw-updated-at="lwUpdatedAt"
      :binding-synced-at="bindingSyncedAt"
      :syncing="pulling"
      @view-changes="onViewChanges"
      @sync="onPullLatest"
    />

    <div class="body-grid">
      <CharacterCardFormV2
        v-if="binding"
        :binding="binding"
        @change="onFormChange"
      />
      <div class="gallery-wrapper">
        <CharacterGalleryEditor
          ref="galleryRef"
          :binding-id="bindingId"
          asset-type="character"
        />
        <div class="gallery-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>
            💡 派生图都以"主图"为参考生成 — 视角 / 表情 / 服装 / 姿势 跨变体保持人物形象一致
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  DocumentChecked,
  InfoFilled,
  Refresh,
} from '@element-plus/icons-vue'
import AssetSourceTag from '../../shared/AssetSourceTag.vue'
import LwSyncReminderBanner from '../../shared/LwSyncReminderBanner.vue'
import CharacterCardFormV2, { type FormChangePayload } from './CharacterCardFormV2.vue'
import CharacterGalleryEditor from '../../stage-asset/character/CharacterGalleryEditor.vue'

const props = defineProps<{ bindingId: string }>()
const emit = defineEmits<{
  close: []
  saved: []
}>()

const binding = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const pulling = ref(false)
const galleryRef = ref<any>(null)
const hasMain = ref(false)

// 表单脏检测：来自 CardFormV2 的 onChange payload
const formDraft = ref<Record<string, any>>({})
const dirtyKeys = ref<Set<string>>(new Set())

const hasDirty = computed(() => dirtyKeys.value.size > 0)
const dirtyCount = computed(() => dirtyKeys.value.size)

const displayName = computed(() => {
  const b = binding.value
  if (!b) return '加载中...'
  if (b.sourceType === 'standalone') return b.standaloneName || '(未命名)'
  return b.overrideName || b.standaloneName || '(未命名 lw)'
})

const lwUpdatedAt = computed(() => null) // TODO 后端拉取 lw 实体 updatedAt
const bindingSyncedAt = computed(() => binding.value?.updatedAt ?? null)

async function load(): Promise<void> {
  if (!props.bindingId) return
  loading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api) {
      ElMessage.error('资产 API 不可用')
      return
    }
    const resp = await api.character.get(props.bindingId)
    if (!resp?.success) {
      ElMessage.error(resp?.error ?? '加载角色失败')
      return
    }
    binding.value = resp.data
    formDraft.value = {}
    dirtyKeys.value = new Set()

    // 主图状态
    const imgList = await api.image
      ?.listByAsset?.('character', props.bindingId)
      .catch(() => null)
    if (imgList?.success && Array.isArray(imgList.data)) {
      hasMain.value = imgList.data.some((i: any) => i.isMain === 1)
    }
  } finally {
    loading.value = false
  }
}

function onFormChange(payload: FormChangePayload): void {
  formDraft.value[payload.key] = payload.value
  if (payload.dirty) dirtyKeys.value.add(payload.key)
  else dirtyKeys.value.delete(payload.key)
  // trigger reactive
  dirtyKeys.value = new Set(dirtyKeys.value)
}

async function onSave(): Promise<void> {
  if (!binding.value) return
  saving.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset?.character
    if (!api) {
      ElMessage.error('character API 不可用')
      return
    }

    // 拆分到对应 IPC：
    // - name/description 走 updateStandalone（standalone 模式）或 updateOverride（linked_lw 模式）
    // - alias/role/gender/age/voiceSpeed/voicePitch/voiceEmotion/styleAnchors/outfitsExtra 走 updateExtra
    // - voiceId 走 setVoice
    // - portraitId 走 setPortrait
    const draft = formDraft.value
    const isLw = binding.value.sourceType === 'linked_lw'

    const namePart: any = {}
    if ('name' in draft) namePart.name = draft.name
    if ('description' in draft) namePart.description = draft.description
    if ('appearance' in draft) namePart.appearance = draft.appearance
    if ('outfit' in draft) namePart.outfit = draft.outfit

    if (Object.keys(namePart).length > 0) {
      if (isLw) await api.updateOverride(binding.value.id, namePart)
      else
        await api.updateStandalone(binding.value.id, {
          name: namePart.name,
          description: namePart.description,
        })
    }

    const extra: any = {}
    for (const k of [
      'alias',
      'role',
      'gender',
      'age',
      'voiceSpeed',
      'voicePitch',
      'voiceEmotion',
      'styleAnchors',
      'outfitsExtra',
    ]) {
      if (k in draft) extra[k] = draft[k]
    }
    if (Object.keys(extra).length > 0) {
      await api.updateExtra(binding.value.id, extra)
    }

    if ('voiceId' in draft) {
      await api.setVoice(binding.value.id, draft.voiceId ?? null)
    }
    if ('portraitId' in draft) {
      await api.setPortrait(binding.value.id, draft.portraitId ?? null)
    }

    ElMessage.success('已保存')
    await load()
    emit('saved')
  } catch (e: any) {
    ElMessage.error(e?.message ?? '保存失败')
  } finally {
    saving.value = false
  }
}

async function onPullLatest(): Promise<void> {
  pulling.value = true
  try {
    ElMessage.info('拉取最新长文基础值 — IPC 待 phase F 接入（StoryToVideoAIService.syncLwBinding）')
  } finally {
    pulling.value = false
  }
}

function onViewChanges(): void {
  ElMessage.info('查看长文变更对照 — 留 follow-up（依赖 lw 域 diff API）')
}

onMounted(load)
watch(() => props.bindingId, load)
</script>

<style scoped lang="scss">
.character-editor-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.back-btn {
  flex-shrink: 0;
}

.ch-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.status-tag {
  margin-left: 4px;
}

.header-spacer {
  flex: 1;
}

.body-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
}

.gallery-wrapper {
  display: flex;
  flex-direction: column;
  overflow: auto;
  min-height: 0;
}

.gallery-tip {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 1024px) {
  .body-grid {
    grid-template-columns: 1fr;
  }
}
</style>
