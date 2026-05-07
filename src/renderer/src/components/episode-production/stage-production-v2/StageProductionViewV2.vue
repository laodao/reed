<template>
  <!--
    StageProductionViewV2 · ⑤ 画面+音频（FU5-F1 / 原型 §8 · 全部真实功能）

    严格按对照表 §8 cell 表 12 条差异 + spec §4.5 实施：
    ✓ StageMainHeader 副标题（场景数 / 分镜数 / 已出片 N/M / 当前分镜）
    ✓ 双栏 220px scene-tree（替换原 horizontal pill）+ 1fr 主区域
    ✓ 镜头语言 panel inline（4 selector + 关键帧数 1-9 visual + 启用 3D 摆位 占位）
    ✓ 九宫格 KeyframeGrid wrapper：时间轴 bar + kf-role 比例 + 参考链顺序 banner
    ✓ 资产引用 panel + 提示词组装公式（spec §4.5.7 用户提示词全链路）
    ✓ 视频生成 VideoSegmentPanel（真实 provider / 模式 / 状态 — 已实现）
    ✓ 音频 AudioPanel（真实 旁白 / 对话 / BGM — 已实现）

    所有按钮真实接 IPC，不留 ElMessage stub：
    - 镜头语言保存 → ep:update-storyboard（FU5-E1 已有）
    - 关键帧重生成 / 资产引用 → 复用现有 KeyframeGrid 内置真实 IPC
    - 进入 ⑥ 合成跳转 → emit('jump-to-compose')
  -->
  <div class="stage-production-v2">
    <StageMainHeader title="⑤ 画面+音频生成" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          type="success"
          :disabled="!canComplete"
          @click="emit('complete')"
        >
          完成本阶段 → ⑥ 合成
        </el-button>
      </template>
    </StageMainHeader>

    <div v-if="scenes.length === 0" class="empty-state">
      <el-empty description="该剧集还没有分镜。请先在 ④ 分镜 stage 配置。" />
    </div>

    <div v-else class="content-grid">
      <!-- 左：scene-tree -->
      <aside class="scene-tree">
        <h4 class="tree-title">场景 / 分镜</h4>
        <div
          v-for="(scene, idx) in scenes"
          :key="scene.id"
          class="tree-scene"
        >
          <div
            class="tree-scene-head"
            :class="{ active: selectedSceneId === scene.id }"
            @click="selectScene(scene.id)"
          >
            <span class="scene-icon">📁</span>
            <span class="scene-name">场景 {{ idx + 1 }} · {{ scene.location ?? '?' }}</span>
          </div>
          <ul
            v-if="selectedSceneId === scene.id && storyboards.length > 0"
            class="tree-shots"
          >
            <li
              v-for="sb in storyboards"
              :key="sb.id"
              class="tree-shot"
              :class="{ active: selectedStoryboardId === sb.id }"
              @click="selectStoryboard(sb.id)"
            >
              <span class="shot-status-dot" :class="getStatusClass(sb)">●</span>
              <span class="shot-num">{{ idx + 1 }}.{{ sb.shotNumber }}</span>
              <span class="shot-type">{{ shotTypeLabel(sb.shotType) }}</span>
              <span class="shot-dur">{{ sb.duration }}s</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 右：主区域 -->
      <main class="main-area" v-if="selectedStoryboard">
        <!-- 镜头语言 panel -->
        <section class="panel lang-panel">
          <header class="panel-header">
            <span class="panel-title">
              分镜 {{ selectedSceneIndex + 1 }}.{{ selectedStoryboard.shotNumber }}
            </span>
            <span class="meta-sep">·</span>
            <span class="panel-meta">
              {{ shotTypeLabel(selectedStoryboard.shotType) }} ·
              {{ cameraAngleLabel(selectedStoryboard.cameraAngle) }} ·
              {{ cameraMovementLabel(selectedStoryboard.cameraMovement) }}
              <el-tag type="success" size="small" effect="light" class="dur-tag">
                {{ selectedStoryboard.duration }}s
              </el-tag>
            </span>
            <span class="header-spacer" />
            <el-button
              v-if="hasLangDirty"
              type="primary"
              size="small"
              :loading="savingLang"
              @click="onSaveLang"
            >
              保存修改
            </el-button>
          </header>

          <div class="lang-toolbar">
            <label class="tool-item">
              <span class="tool-label">景别</span>
              <el-select v-model="langDraft.shotType" size="small" @change="markLangDirty('shotType')">
                <el-option label="远景" value="long" />
                <el-option label="全景" value="full" />
                <el-option label="中景" value="medium" />
                <el-option label="近景" value="medium_close" />
                <el-option label="特写" value="close" />
                <el-option label="大特写" value="extreme_close" />
              </el-select>
            </label>
            <label class="tool-item">
              <span class="tool-label">角度</span>
              <el-select v-model="langDraft.cameraAngle" size="small" @change="markLangDirty('cameraAngle')">
                <el-option label="平视" value="eye_level" />
                <el-option label="俯拍" value="high" />
                <el-option label="仰拍" value="low" />
                <el-option label="鸟瞰" value="birds_eye" />
                <el-option label="蚁视" value="worms_eye" />
                <el-option label="斜角" value="dutch" />
              </el-select>
            </label>
            <label class="tool-item">
              <span class="tool-label">运镜</span>
              <el-select v-model="langDraft.cameraMovement" size="small" @change="markLangDirty('cameraMovement')">
                <el-option label="固定" value="static" />
                <el-option label="推镜" value="push" />
                <el-option label="拉镜" value="pull" />
                <el-option label="摇镜" value="pan" />
                <el-option label="移镜" value="track" />
                <el-option label="升降" value="crane" />
              </el-select>
            </label>
            <label class="tool-item">
              <span class="tool-label">时长</span>
              <el-input-number
                v-model="langDraft.duration"
                :min="0.5"
                :max="60"
                :step="0.5"
                size="small"
                controls-position="right"
                @change="markLangDirty('duration')"
              />
              <span class="suffix-x">s</span>
            </label>
            <label class="tool-item">
              <span class="tool-label">关键帧数</span>
              <div class="kf-buttons inline">
                <button
                  v-for="n in 9"
                  :key="n"
                  class="kf-btn-mini"
                  :class="{ active: langDraft.keyframeCount === n }"
                  @click="onSetKfCount(n)"
                >{{ n }}</button>
              </div>
            </label>
            <label class="tool-item disabled-3d">
              <el-checkbox :model-value="false" disabled>启用 3D 摆位</el-checkbox>
              <span class="hint-tertiary">{{ has3dStaging ? '' : '(地点非 3D)' }}</span>
            </label>
          </div>
        </section>

        <!-- 九宫格 KeyframeGrid wrapper -->
        <section class="panel keyframes-panel">
          <header class="panel-header">
            <span class="panel-title">关键帧序列</span>
            <span class="panel-hint">
              时间顺序的 {{ langDraft.keyframeCount }} 张快照（"九宫格"）· 用于 keyframesToVideo 模型
            </span>
            <span class="header-spacer" />
            <el-button size="small" :loading="regeneratingAll" @click="onRegenAll">
              <el-icon><Refresh /></el-icon>
              重生成全部
            </el-button>
          </header>

          <!-- 时间轴 bar -->
          <div class="timeline-bar">
            <div
              v-for="t in timelineTicks"
              :key="t.pct"
              class="timeline-tick"
              :style="{ left: `${t.pct}%` }"
            >
              <span class="tick-label">{{ t.label }}</span>
            </div>
          </div>

          <!-- KeyframeGrid 复用 -->
          <KeyframeGrid
            ref="kfGridRef"
            :key="`kfgrid-${selectedStoryboardId}`"
            :storyboard-id="selectedStoryboardId"
            :keyframe-count="langDraft.keyframeCount"
            @regenerate="onKeyframeRegenRequest"
            @generate-all="onKeyframesGenerateAll"
          />

          <!-- 参考链顺序 banner（spec §4.5 P0） -->
          <div class="chain-banner">
            <el-icon><InfoFilled /></el-icon>
            <span>
              💡 <strong>参考链顺序</strong>：先生成 1 (start) → {{ langDraft.keyframeCount }} (end，参考 1)
              → 中间帧（参考首尾），保证运动连贯
            </span>
          </div>
        </section>

        <!-- 资产引用 panel + 提示词组装公式（spec §4.5.7 P0） -->
        <section class="panel asset-ref-panel">
          <header class="panel-header">
            <span class="panel-title">本分镜引用的资产</span>
          </header>
          <div class="ref-tags">
            <el-tag
              v-if="locationRef"
              type="success"
              effect="light"
              class="ref-tag"
            >📍 {{ locationRef }}</el-tag>
            <el-tag
              v-for="c in characterRefs"
              :key="`c-${c.name}`"
              type="primary"
              effect="light"
              class="ref-tag"
            >👤 {{ c.name }}<span v-if="c.expression"> · {{ c.expression }}</span></el-tag>
            <el-tag
              v-for="it in itemRefs"
              :key="`it-${it.name}`"
              type="warning"
              effect="light"
              class="ref-tag"
            >⚔️ {{ it.name }}<span v-if="it.context"> · {{ it.context }}</span></el-tag>
            <span v-if="!locationRef && characterRefs.length === 0 && itemRefs.length === 0" class="hint-tertiary">
              本分镜暂无资产引用
            </span>
          </div>
          <div class="prompt-formula">
            每张关键帧自动按以下公式组装提示词：
            <code class="formula-code">
              style_anchor + 镜头语言 + 场景描述 + 地点变体图 + 角色图 + 物品图 + 上一帧
              <span v-if="hasUserPrompt"> + [user direction]</span>
            </code>
          </div>
        </section>

        <!-- 视频生成 VideoSegmentPanel 复用（真实 provider + 模式 + 状态） -->
        <VideoSegmentPanel
          v-if="selectedStoryboardId"
          :key="`vsp-${selectedStoryboardId}`"
          :storyboard-id="selectedStoryboardId"
          :provider-config-id="videoModelProviderConfigId"
          @done="onVideoDone"
        />

        <!-- 音频 AudioPanel 复用（真实 旁白 + 对话 + BGM） -->
        <AudioPanel
          v-if="selectedScene"
          :key="`audio-${selectedScene.id}`"
          :scene-id="selectedScene.id"
          :scene="selectedScene"
        />
      </main>

      <main v-else class="main-area-empty">
        <el-empty description="请先在左侧选一个场景 + 分镜" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled, Refresh } from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import KeyframeGrid from '../stage-production/KeyframeGrid.vue'
import VideoSegmentPanel from '../stage-production/VideoSegmentPanel.vue'
import AudioPanel from '../stage-production/AudioPanel.vue'
import {
  useEpEpisodeStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpProjectStore,
  useEpAssetStore,
} from '@/stores/episode-production'

const props = defineProps<{
  episodeScriptId: string | null
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const episodeStore = useEpEpisodeStore()
const scriptStore = useEpScriptStore()
const storyboardStore = useEpStoryboardStore()
const projectStore = useEpProjectStore()
const assetStore = useEpAssetStore()

const selectedSceneId = ref<string | null>(null)
const selectedStoryboardId = ref<string | null>(null)
const savingLang = ref(false)
const regeneratingAll = ref(false)
const langDirty = ref<Set<string>>(new Set())
const kfGridRef = ref<any>(null)
const currentKeyframes = ref<any[]>([])

const scenes = computed(() => scriptStore.scenes ?? [])
const storyboards = computed(() => storyboardStore.storyboards ?? [])

const selectedScene = computed(() => scenes.value.find((s) => s.id === selectedSceneId.value) ?? null)
const selectedSceneIndex = computed(() =>
  selectedScene.value ? scenes.value.findIndex((s) => s.id === selectedSceneId.value) : 0,
)
const selectedStoryboard = computed(() => storyboards.value.find((s) => s.id === selectedStoryboardId.value) ?? null)

const langDraft = ref<any>({
  shotType: '',
  cameraAngle: '',
  cameraMovement: '',
  duration: 5,
  keyframeCount: 5,
})

const hasLangDirty = computed(() => langDirty.value.size > 0)

const has3dStaging = computed(() => Boolean((selectedStoryboard.value as any)?.use3dStaging))

watch(
  () => selectedStoryboard.value,
  (sb) => {
    if (!sb) return
    langDraft.value = {
      shotType: sb.shotType,
      cameraAngle: sb.cameraAngle,
      cameraMovement: sb.cameraMovement,
      duration: sb.duration,
      keyframeCount: sb.keyframeCount ?? 3,
    }
    langDirty.value = new Set()
  },
  { immediate: true },
)

const headerSubtitle = computed(() => {
  const sceneCount = scenes.value.length
  const sbCount = storyboards.value.length
  const ready = storyboards.value.filter((s) => !!s.videoPath).length
  const cur = selectedStoryboard.value
    ? `当前进入分镜 ${selectedSceneIndex.value + 1}.${selectedStoryboard.value.shotNumber}`
    : '未选分镜'
  return `${sceneCount} 个场景 · 当前场景 ${sbCount} 个分镜 · 已出片 ${ready}/${sbCount} · ${cur}`
})

const canComplete = computed(() => {
  if (storyboards.value.length === 0) return false
  return storyboards.value.every((s) => !!s.videoPath)
})

const timelineTicks = computed(() => {
  const n = langDraft.value.keyframeCount ?? 5
  if (n <= 1) return [{ pct: 0, label: 'START' }]
  const ticks: Array<{ pct: number; label: string }> = []
  for (let i = 0; i < n; i++) {
    const pct = (i / (n - 1)) * 100
    ticks.push({
      pct,
      label: i === 0 ? 'START' : i === n - 1 ? 'END' : `${Math.round(pct)}%`,
    })
  }
  return ticks
})

// 资产引用面板：从 storyboard.characters / scene.location 真实提取
const characterRefs = computed(() => {
  const sb = selectedStoryboard.value as any
  if (!sb || !Array.isArray(sb.characters)) return []
  return sb.characters.map((c: any) => ({
    name: c.characterName ?? '?',
    expression: c.expression ?? null,
  }))
})

const locationRef = computed(() => {
  const s = selectedScene.value as any
  if (!s) return ''
  return s.location ?? ''
})

/*
 * FU8-H3 物品引用真实解析：
 *   spec §4.1：场景中的物品挂在 scene.characters[].props（与角色绑定的道具）。
 *   ScenePropRef = { itemBindingId: string|null, name: string }；
 *   兼容老格式 string（仅 name）。
 *   去重：同一 itemBindingId 多次出现只显示一次。
 */
const itemRefs = computed(() => {
  const scene = selectedScene.value as any
  if (!scene || !Array.isArray(scene.characters)) return []
  const seen = new Set<string>()
  const refs: Array<{ name: string; bindingId: string | null }> = []
  for (const ch of scene.characters) {
    if (!Array.isArray(ch.props)) continue
    for (const p of ch.props) {
      let bindingId: string | null = null
      let name: string
      if (typeof p === 'string') {
        name = p
      } else if (p && typeof p === 'object') {
        bindingId = (p.itemBindingId ?? null) as string | null
        name = (p.name as string) ?? ''
      } else {
        continue
      }
      if (!name) continue
      const key = bindingId ?? `name:${name}`
      if (seen.has(key)) continue
      seen.add(key)
      refs.push({ name, bindingId })
    }
  }
  return refs
})

const hasUserPrompt = computed(() => {
  // 如果当前关键帧有 userPromptOverride，公式末尾追加 [user direction]
  return currentKeyframes.value.some((kf) => !!kf.userPromptOverride)
})

const videoModelProviderConfigId = computed(
  () => projectStore.currentProject?.config?.videoModel?.providerConfigId ?? null,
)

function selectScene(id: string): void {
  selectedSceneId.value = id
  void loadStoryboardsForSelected()
}

function selectStoryboard(id: string): void {
  selectedStoryboardId.value = id
}

async function loadStoryboardsForSelected(): Promise<void> {
  if (!selectedScene.value) return
  await storyboardStore.loadStoryboards(selectedScene.value.id)
  if (storyboards.value.length > 0) {
    selectedStoryboardId.value = storyboards.value[0].id
  } else {
    selectedStoryboardId.value = null
  }
}

function markLangDirty(key: string): void {
  langDirty.value = new Set([...langDirty.value, key])
}

function onSetKfCount(n: number): void {
  langDraft.value.keyframeCount = n
  markLangDirty('keyframeCount')
}

async function onSaveLang(): Promise<void> {
  if (!selectedStoryboard.value) return
  savingLang.value = true
  try {
    const oldKfCount = selectedStoryboard.value.keyframeCount ?? 3
    const newKfCount = langDraft.value.keyframeCount
    const kfCountChanged = newKfCount !== oldKfCount
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.updateStoryboard?.(selectedStoryboard.value.id, {
      shotType: langDraft.value.shotType,
      cameraAngle: langDraft.value.cameraAngle,
      cameraMovement: langDraft.value.cameraMovement,
      duration: langDraft.value.duration,
      keyframeCount: newKfCount,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '保存失败')
      return
    }
    ElMessage.success('已保存')
    langDirty.value = new Set()
    if (selectedScene.value) {
      await storyboardStore.loadStoryboards(selectedScene.value.id)
    }
    // 关键帧数变了 → 询问是否立即按新数量重生（清旧帧）
    if (kfCountChanged && currentKeyframes.value.length > 0) {
      try {
        await ElMessageBox.confirm(
          `关键帧数已改为 ${newKfCount}（原 ${oldKfCount}）。立即按新数量重新生成？\n旧的 ${currentKeyframes.value.length} 张关键帧会被清空。`,
          '关键帧数已变更',
          {
            type: 'warning',
            confirmButtonText: '立即重生',
            cancelButtonText: '稍后再说',
          },
        )
        await onRegenAll()
      } catch {
        ElMessage.info('已保存数量；点顶部"全部重新生成"按新数量出图')
      }
    }
  } finally {
    savingLang.value = false
  }
}

async function onRegenAll(): Promise<void> {
  if (!selectedStoryboard.value) return
  regeneratingAll.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateKeyframes) {
      ElMessage.error('当前环境不支持 generateKeyframes IPC')
      return
    }
    const resp = await api.generateKeyframes(
      selectedStoryboard.value.id,
      undefined,
      langDraft.value.keyframeCount,
    )
    if (resp?.success) {
      ElMessage.success(`已重新生成全部关键帧（${resp.data?.length ?? 0} 张）`)
      await kfGridRef.value?.reload?.()
      await refreshCurrentKeyframes()
    } else {
      ElMessage.error(resp?.error || '重生失败')
    }
  } finally {
    regeneratingAll.value = false
  }
}

function onKeyframeRegenRequest(_payload: any): void {
  // KeyframeGrid 内部已经走 RegenerateDialog + IPC，重生完会 reload
  void refreshCurrentKeyframes()
}

function onKeyframesGenerateAll(_storyboardId: string): void {
  // KeyframeGrid 自身触发的 generate-all 事件 — 同样刷新公式段
  void refreshCurrentKeyframes()
}

async function refreshCurrentKeyframes(): Promise<void> {
  if (!selectedStoryboardId.value) {
    currentKeyframes.value = []
    return
  }
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.listKeyframes) return
  const resp = await api.listKeyframes(selectedStoryboardId.value).catch(() => null)
  if (resp?.success && Array.isArray(resp.data)) {
    currentKeyframes.value = resp.data
  } else {
    currentKeyframes.value = []
  }
}

watch(() => selectedStoryboardId.value, () => void refreshCurrentKeyframes(), { immediate: true })

function onVideoDone(_result: any): void {
  // VideoSegmentPanel 完成后刷新 storyboards 拿新 videoPath
  if (selectedScene.value) {
    void storyboardStore.loadStoryboards(selectedScene.value.id)
  }
}

function getStatusClass(sb: any): string {
  if (sb.videoPath) return 'status-done'
  if (sb.status === 'generating') return 'status-gen'
  return 'status-todo'
}

function shotTypeLabel(t: string): string {
  return ({
    long: '远景',
    full: '全景',
    medium: '中景',
    medium_close: '近景',
    close: '特写',
    extreme_close: '大特写',
  } as any)[t] ?? t
}

function cameraAngleLabel(a: string): string {
  return ({
    eye_level: '平视',
    high: '俯拍',
    low: '仰拍',
    dutch: '斜角',
    birds_eye: '鸟瞰',
    worms_eye: '蚁视',
  } as any)[a] ?? a
}

function cameraMovementLabel(m: string): string {
  return ({
    static: '固定',
    push: '推镜',
    pull: '拉镜',
    pan: '摇镜',
    track: '移镜',
    crane: '升降',
  } as any)[m] ?? m
}

watch(
  () => scenes.value,
  (list) => {
    if (list.length > 0 && !selectedSceneId.value) {
      selectScene(list[0].id)
    }
  },
  { immediate: true },
)

watch(
  () => props.projectId,
  () => {
    if (props.projectId) void assetStore.loadAssetsByProject(props.projectId)
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.stage-production-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
}

/* scene-tree（与 ④ 分镜 V2 一致风格） */
.scene-tree {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 8px;
  overflow-y: auto;
}

.tree-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  letter-spacing: 0.05em;
}

.tree-scene {
  margin-bottom: 6px;
}

.tree-scene-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}

.tree-scene-head:hover {
  background: var(--el-fill-color-light);
}

.tree-scene-head.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}

.tree-shots {
  list-style: none;
  margin: 4px 0 0;
  padding: 0 0 0 14px;
}

.tree-shot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}

.tree-shot:hover {
  background: var(--el-fill-color-light);
}

.tree-shot.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}

.shot-status-dot {
  font-size: 8px;
}
.shot-status-dot.status-done { color: var(--el-color-success); }
.shot-status-dot.status-gen { color: var(--el-color-warning); }
.shot-status-dot.status-todo { color: var(--el-text-color-placeholder); }

.shot-dur {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}

/* main */
.main-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
}

.main-area-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.panel-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.panel-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.dur-tag {
  margin-left: 4px;
}

.meta-sep {
  color: var(--el-text-color-placeholder);
}

.header-spacer {
  flex: 1;
}

.lang-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.tool-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.tool-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

/* 控件给最小宽度，避免标签 + 控件挤变形（与分镜界面对齐） */
.tool-item :deep(.el-select),
.tool-item :deep(.el-input-number) {
  min-width: 110px;
  width: 110px;
}

.suffix-x {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-left: -2px;
}

.kf-buttons.inline {
  display: flex;
  gap: 3px;
}

.kf-btn-mini {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  cursor: pointer;
}

.kf-btn-mini.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.disabled-3d {
  opacity: 0.6;
}

.hint-tertiary {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

/* 时间轴 */
.timeline-bar {
  position: relative;
  height: 28px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 10px;
}

.timeline-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--el-border-color);
}

.timeline-tick:first-of-type,
.timeline-tick:last-of-type {
  background: var(--el-color-primary);
}

.tick-label {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  margin-top: 2px;
}

/* 参考链 banner */
.chain-banner {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.chain-banner .el-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

/* 资产引用 panel */
.ref-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ref-tag {
  font-size: 12px;
}

.prompt-formula {
  margin-top: 10px;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}

.formula-code {
  display: block;
  margin-top: 4px;
  padding: 6px 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
  color: var(--el-text-color-primary);
  word-break: break-word;
}
</style>
