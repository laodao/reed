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
        <span>拉取最新基础值</span>
      </el-button>
      <!-- 一键多角度参考图（spec 2026-05-09 ep-redesign §3.2 B3） -->
      <el-tooltip placement="bottom" effect="light">
        <template #content>
          <div style="max-width: 240px;">
            <div>一次生成正面 / 3q 左 / 3q 右 三视图</div>
            <div>跨分镜画同一角色时不走样的视觉锚点</div>
            <div style="margin-top:4px;color:#aaa;font-size:11px;">专业用户：character bible / three-view sheet</div>
          </div>
        </template>
        <el-button
          :disabled="!hasMain"
          :loading="generatingThreeViews"
          @click="onGenerateThreeViews"
        >
          <el-icon><Picture /></el-icon>
          <span>多角度参考图</span>
        </el-button>
      </el-tooltip>
      <!-- 视频提取主体（spec 2026-05-09 ep-redesign §3.2 E1 · Phase 5） -->
      <el-tooltip placement="bottom" effect="light">
        <template #content>
          <div style="max-width: 240px;">
            <div>上传短视频抽 4 帧候选 → 挑选要保留的帧</div>
            <div>降级版（时间均匀采样；future 接 face 聚类）</div>
          </div>
        </template>
        <el-button @click="extractDialogVisible = true">
          <el-icon><VideoCamera /></el-icon>
          <span>从视频提取</span>
        </el-button>
      </el-tooltip>
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

    <!-- 角色形象组（spec 2026-05-09 ep-redesign §3.2 D1） -->
    <ReferenceSetPanel
      v-if="binding && hasMain"
      ref="referenceSetRef"
      :binding-id="bindingId"
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
      </div>
    </div>

    <!-- 视频提取主体对话框（spec 2026-05-09 ep-redesign §3.2 E1） -->
    <CharacterExtractionDialog
      v-model="extractDialogVisible"
      :binding-id="bindingId"
      @imported="onExtractImported"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  DocumentChecked,
  Picture,
  Refresh,
  VideoCamera,
} from '@element-plus/icons-vue'
import AssetSourceTag from '../../shared/AssetSourceTag.vue'
import LwSyncReminderBanner from '../../shared/LwSyncReminderBanner.vue'
import CharacterCardFormV2, { type FormChangePayload } from './CharacterCardFormV2.vue'
import CharacterGalleryEditor from '../../stage-asset/character/CharacterGalleryEditor.vue'
// spec 2026-05-09 ep-redesign §3.2 D1 · 角色形象组
import ReferenceSetPanel from './ReferenceSetPanel.vue'
// spec 2026-05-09 ep-redesign §3.2 E1 · Phase 5 视频提取主体
import CharacterExtractionDialog from '@/components/episode-production/dialogs/CharacterExtractionDialog.vue'

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
const referenceSetRef = ref<any>(null)
const hasMain = ref(false)

// 表单脏检测：来自 CardFormV2 的 onChange payload
const formDraft = ref<Record<string, any>>({})
const dirtyKeys = ref<Set<string>>(new Set())

const hasDirty = computed(() => dirtyKeys.value.size > 0)
const dirtyCount = computed(() => dirtyKeys.value.size)

// effectiveName 来自后端 effective 投影：
// - standalone：standaloneName
// - linked_lw：overrideName ?? lw.name（lw 表的真实角色名）
// 单独存一个 ref 是因为 binding.value 是 raw entity，不含 LW 投影；
// load 后追加调一次 effective IPC 即可拿到正确显示名。
const effectiveName = ref<string | null>(null)

const displayName = computed(() => {
  const b = binding.value
  if (!b) return '加载中...'
  if (effectiveName.value) return effectiveName.value
  // effective 还没拉到 / 拉失败时按 raw 字段兜底（老逻辑保留作 fallback）
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

    // 拉 effective 投影后的 name（linked_lw 时会取 LW 表的真实角色名）
    // 失败不阻塞 — displayName computed 会按 raw binding 字段兜底
    api.character.effective?.(props.bindingId)
      .then((eff: any) => {
        if (eff?.success && eff.data?.name) {
          effectiveName.value = eff.data.name
        }
      })
      .catch(() => {
        /* 静默忽略；fallback 到 raw 字段 */
      })

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
      'race',
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

// ===== 一键多角度参考图（spec 2026-05-09 ep-redesign §3.2 B3） =====
const generatingThreeViews = ref(false)
const extractDialogVisible = ref(false)

/** 视频提取完成 → reload gallery 让用户看到新增帧（spec E1） */
function onExtractImported(payload: { count: number }): void {
  ElMessage.success(`已添加 ${payload.count} 张代表帧到角色图谱`)
  galleryRef.value?.reload?.()
  referenceSetRef.value?.reload?.()
}

async function onGenerateThreeViews(): Promise<void> {
  if (!hasMain.value) {
    ElMessage.warning('请先生成主图')
    return
  }
  if (!binding.value?.id) return
  generatingThreeViews.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.character?.generateThreeViews) {
      ElMessage.error('generateThreeViews IPC 未暴露（请重启）')
      return
    }
    // 拉 effective 用作 prompt 基底（同主图生成）
    const effResp = await api.character.effective(binding.value.id)
    if (!effResp?.success) {
      ElMessage.error(effResp?.error || '加载 effective 失败')
      return
    }
    const eff = effResp.data ?? {}
    // 简单拼装：name + appearance + gender + race（主入口 generateMainFor 装得更全；
    // 这里关键是给 view label 加视角语义，本身就是 character 多角度补丁，base ref 决定一致性）
    const parts: string[] = []
    if (eff.name) parts.push(String(eff.name))
    if (eff.appearance) parts.push(String(eff.appearance))
    if (eff.gender) parts.push(`性别：${eff.gender}`)
    if (eff.age != null) parts.push(`年龄：${eff.age}`)
    const prompt = parts.join('，').trim() || '保持人物身份特征'

    const resp = await api.character.generateThreeViews({
      assetType: 'character',
      assetId: binding.value.id,
      prompt,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '多角度参考图生成失败')
      return
    }
    ElMessage.success(`已生成 ${resp.data?.length ?? 3} 张多角度参考图`)
    // 通知 GalleryEditor reload（V1 GalleryEditor 暴露了 reload 方法）
    galleryRef.value?.reload?.()
    // Bug #3 修复（2026-05-10 e2e）：三视图生成后同步 reload ReferenceSetPanel，
    // 否则形象组只显示 main 一张，新生成的 view 类目图不可勾选作为参考集。
    referenceSetRef.value?.reload?.()
  } catch (e: any) {
    ElMessage.error('生成异常：' + (e?.message ?? String(e)))
  } finally {
    generatingThreeViews.value = false
  }
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
  gap: 8px;
  padding: 6px 14px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
  min-height: 36px;
}

.back-btn {
  flex-shrink: 0;
  padding: 4px 6px;
}

.ch-name {
  margin: 0;
  font-size: 15px;
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

@media (max-width: 1024px) {
  .body-grid {
    grid-template-columns: 1fr;
  }
}
</style>
