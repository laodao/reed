<template>
  <!--
    StageProductionViewV2 · ⑤ 画面+音频（FU5-F1 / 原型 §8 · 全部真实功能）

    严格按对照表 §8 cell 表 12 条差异 + spec §4.5 实施：
    ✓ StageMainHeader 副标题（场景数 / 分镜数 / 已出片 N/M / 当前分镜）
    ✓ 双栏 220px scene-tree（替换原 horizontal pill）+ 1fr 主区域
    ✓ 镜头语言 panel inline（4 selector + 关键帧数 1-9 visual + 启用 3D 摆位 占位）
    ✓ 九宫格 KeyframeGrid wrapper：时间轴 bar + kf-role 比例 + 参考链顺序 banner
    ✓ 上半部分双列布局：左 2/3（分镜信息 / 关键帧序列 / 视频生成）+ 右 1/3 视频预览
    ✓ 底部 full-width 资产卡（缩略图）+ 提示词组装公式
    ✓ AudioPanel 已迁回 ④ 分镜界面，按 storyboard.dialogueIds / narrationId 过滤

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

      <!-- 右：主区域 — 上半部分左右两栏，底部 full-width 资产卡 -->
      <main class="main-area" v-if="selectedStoryboard">
       <div class="upper-split">
        <!-- 左列（2/3）：分镜信息 + 关键帧序列 + 视频生成 -->
        <div class="upper-left">
        <!-- 分镜语言 panel · 只读展示
             所有镜头参数 / 关键帧数 / 生成模式都在 ④ 分镜界面定稿，这里仅展示。
             如需修改请回 ④ 分镜界面。 -->
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
            <span class="panel-readonly-hint">
              <el-icon><Lock /></el-icon>
              如需修改请回 ④ 分镜界面
            </span>
          </header>

          <div class="lang-readonly">
            <span class="ro-item">
              <span class="ro-label">生成模式</span>
              <el-tag size="small" :type="useKeyframes ? 'success' : 'info'" effect="light">
                {{ useKeyframes ? '首尾帧' : '文生图' }}
              </el-tag>
            </span>
            <span v-if="useKeyframes" class="ro-item">
              <span class="ro-label">关键帧数</span>
              <span class="ro-value">{{ selectedStoryboard.keyframeCount ?? 3 }}</span>
            </span>
            <span v-if="useKeyframes" class="ro-item">
              <span class="ro-label">3D 摆位</span>
              <span class="ro-value">{{ has3dStaging ? '已启用' : '未启用' }}</span>
            </span>
          </div>
        </section>

        <!-- 九宫格 KeyframeGrid wrapper · 仅"首尾帧"模式才显示；"文生图"模式整段隐藏 -->
        <section v-if="useKeyframes" class="panel keyframes-panel">
          <header class="panel-header">
            <span class="panel-title">关键帧序列</span>
            <span class="panel-hint">
              时间顺序的 {{ selectedStoryboard.keyframeCount ?? 3 }} 张快照（"九宫格"）· 用于 keyframesToVideo 模型
            </span>
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
            :keyframe-count="selectedStoryboard.keyframeCount ?? 3"
            @regenerate="onKeyframeRegenRequest"
            @generate-all="onKeyframesGenerateAll"
          />

          <!-- 参考链顺序 banner（spec §4.5 P0） -->
          <div class="chain-banner">
            <el-icon><InfoFilled /></el-icon>
            <span>
              💡 <strong>参考链顺序</strong>：先生成 1 (start) →
              {{ selectedStoryboard.keyframeCount ?? 3 }} (end，参考 1)
              → 中间帧（参考首尾），保证运动连贯
            </span>
          </div>
        </section>

        <!-- 视频生成 VideoSegmentPanel · 左列底部 -->
        <VideoSegmentPanel
          v-if="selectedStoryboard"
          :key="`vsp-${selectedStoryboardId}`"
          :storyboard="selectedStoryboard"
          :provider-config-id="videoModelProviderConfigId"
          :model-id="videoModelId"
          @generated="onVideoDone"
        />
        </div>

        <!-- 右列（1/3）：视频预览（取最新生成视频或 storyboard.videoPath） -->
        <aside class="upper-right">
          <section class="panel video-preview-panel">
            <header class="panel-header">
              <span class="panel-title">视频预览</span>
              <span v-if="latestVideoPath" class="panel-hint">— {{ selectedSceneIndex + 1 }}.{{ selectedStoryboard.shotNumber }}</span>
            </header>
            <div v-if="latestVideoPath" class="video-preview-body">
              <video
                :key="latestVideoPath"
                :src="toVideoUrl(latestVideoPath)"
                controls
                preload="metadata"
                class="video-preview-player"
              />
              <div class="video-preview-meta" :title="latestVideoPath">{{ latestVideoPath }}</div>
            </div>
            <div v-else class="video-preview-empty">
              <el-icon><VideoCamera /></el-icon>
              <span>本分镜还没有视频，点左侧"生成视频片段"</span>
            </div>
          </section>
        </aside>
       </div>

        <!-- 底部 full-width：本分镜引用的资产（缩略图卡片） -->
        <section class="panel asset-ref-panel">
          <header class="panel-header">
            <span class="panel-title">本分镜引用的资产</span>
            <span class="panel-hint">— 点击缩略图为该资产挑选参考图（覆盖默认评分挑图）</span>
          </header>
          <div class="ref-thumbs">
            <article
              v-if="locationRef"
              class="ref-thumb"
              :class="{ clickable: !!locationRefBindingId, picked: hasPickedImage('location', locationRefBindingId) }"
              :title="locationRefBindingId ? (hasPickedImage('location', locationRefBindingId) ? '已选定参考图 · 点击查看 / 修改' : '点击挑选地点参考图') : '该地点未在 ② 资产中创建'"
              @click="locationRefBindingId && openAssetImages('location', locationRefBindingId, locationRef)"
            >
              <div class="ref-thumb-frame">
                <img
                  v-if="getMainAssetThumbnail('location', locationRefBindingId)"
                  :src="toImageUrl(getMainAssetThumbnail('location', locationRefBindingId)!)"
                  :alt="locationRef"
                />
                <div v-else class="ref-thumb-emoji">📍</div>
                <span v-if="hasPickedImage('location', locationRefBindingId)" class="ref-thumb-picked">已挑图</span>
              </div>
              <div class="ref-thumb-meta">
                <el-tag size="small" type="success" effect="light">地点</el-tag>
                <span class="ref-thumb-name" :title="locationRef">{{ locationRef }}</span>
              </div>
            </article>
            <article
              v-for="(c, i) in characterRefs"
              :key="`c-${i}-${c.name}`"
              class="ref-thumb"
              :class="{ clickable: !!c.bindingId, picked: hasPickedImage('character', c.bindingId) }"
              :title="c.bindingId ? (hasPickedImage('character', c.bindingId) ? '已选定参考图 · 点击查看 / 修改' : '点击挑选角色参考图') : '该角色未在 ② 资产中创建'"
              @click="c.bindingId && openAssetImages('character', c.bindingId, c.name)"
            >
              <div class="ref-thumb-frame">
                <img
                  v-if="getMainAssetThumbnail('character', c.bindingId)"
                  :src="toImageUrl(getMainAssetThumbnail('character', c.bindingId)!)"
                  :alt="c.name"
                />
                <div v-else class="ref-thumb-emoji">👤</div>
                <span v-if="hasPickedImage('character', c.bindingId)" class="ref-thumb-picked">已挑图</span>
              </div>
              <div class="ref-thumb-meta">
                <el-tag size="small" type="primary" effect="light">角色</el-tag>
                <span class="ref-thumb-name" :title="c.name">{{ c.name }}<span v-if="c.expression"> · {{ c.expression }}</span></span>
              </div>
            </article>
            <article
              v-for="(it, i) in itemRefs"
              :key="`it-${i}-${it.name}`"
              class="ref-thumb"
              :class="{ clickable: !!it.bindingId, picked: hasPickedImage('item', it.bindingId) }"
              :title="it.bindingId ? (hasPickedImage('item', it.bindingId) ? '已选定参考图 · 点击查看 / 修改' : '点击挑选物品参考图') : '该物品未在 ② 资产中创建'"
              @click="it.bindingId && openAssetImages('item', it.bindingId, it.name)"
            >
              <div class="ref-thumb-frame">
                <img
                  v-if="getMainAssetThumbnail('item', it.bindingId)"
                  :src="toImageUrl(getMainAssetThumbnail('item', it.bindingId)!)"
                  :alt="it.name"
                />
                <div v-else class="ref-thumb-emoji">⚔️</div>
                <span v-if="hasPickedImage('item', it.bindingId)" class="ref-thumb-picked">已挑图</span>
              </div>
              <div class="ref-thumb-meta">
                <el-tag size="small" type="warning" effect="light">物品</el-tag>
                <span class="ref-thumb-name" :title="it.name">{{ it.name }}</span>
              </div>
            </article>
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
      </main>

      <main v-else class="main-area-empty">
        <el-empty description="请先在左侧选一个场景 + 分镜" />
      </main>
    </div>

    <!-- 资产图谱浏览 dialog（点击 ref-tag 触发，可挑一张图作为生成视频的依据） -->
    <el-dialog
      v-model="assetImagesDialog.open"
      :title="assetImagesDialog.title"
      width="80%"
      destroy-on-close
      append-to-body
    >
      <div class="asset-images-hint">
        💡 点击图片选定该图作为本分镜生成视频时的资产参考；再次点击取消选择回到自动评分挑图。
        <span v-if="selectedAssetImageId" class="asset-images-cur">
          当前已选定：<code>{{ selectedAssetImageId }}</code>
        </span>
        <el-button
          v-if="selectedAssetImageId"
          size="small"
          text
          type="danger"
          :loading="savingAssetImageSelection"
          @click="onClearAssetImageSelection"
        >
          清除选择（恢复自动）
        </el-button>
      </div>
      <div v-if="assetImagesDialog.loading" class="asset-images-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        加载中…
      </div>
      <div v-else-if="assetImagesDialog.images.length === 0" class="asset-images-empty">
        该资产还没有图（去 ② 资产生成主图 / 派生）
      </div>
      <div v-else class="asset-images-grid">
        <div
          v-for="img in assetImagesDialog.images"
          :key="img.id"
          class="asset-images-cell"
          :class="{ selected: selectedAssetImageId === img.id }"
          :title="selectedAssetImageId === img.id ? '已选定 · 点击取消选择' : '点击选定为本分镜参考图'"
          @click="onPickAssetImage(img.id)"
        >
          <img
            v-if="img.imagePath"
            :src="toImageUrl(img.thumbnailPath || img.imagePath)"
            :alt="img.label || img.category"
          />
          <span v-if="selectedAssetImageId === img.id" class="asset-images-selected-badge">
            <el-icon><Select /></el-icon>已选定
          </span>
          <div class="asset-images-meta">
            <span v-if="img.isMain" class="asset-images-main">主图</span>
            <span class="asset-images-cat">{{ img.category }}</span>
            <span v-if="img.label" class="asset-images-label">· {{ img.label }}</span>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled, Loading, Lock, Select, VideoCamera } from '@element-plus/icons-vue'
import { toImageUrl, toVideoUrl } from '@/utils/asset-url'
import StageMainHeader from '../shared/StageMainHeader.vue'
import KeyframeGrid from '../stage-production/KeyframeGrid.vue'
import VideoSegmentPanel from '../stage-production/VideoSegmentPanel.vue'
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
const kfGridRef = ref<any>(null)
const currentKeyframes = ref<any[]>([])

const scenes = computed(() => scriptStore.scenes ?? [])
const storyboards = computed(() => storyboardStore.storyboards ?? [])

const selectedScene = computed(() => scenes.value.find((s) => s.id === selectedSceneId.value) ?? null)
const selectedSceneIndex = computed(() =>
  selectedScene.value ? scenes.value.findIndex((s) => s.id === selectedSceneId.value) : 0,
)
const selectedStoryboard = computed(() => storyboards.value.find((s) => s.id === selectedStoryboardId.value) ?? null)

/** 是否走"首尾帧"模式（关键帧 → 视频）。否 = 文生图模式，整段关键帧序列隐藏。 */
const useKeyframes = computed(() => (selectedStoryboard.value as any)?.useKeyframes ?? true)

const has3dStaging = computed(() => Boolean((selectedStoryboard.value as any)?.use3dStaging))

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
  const n = (selectedStoryboard.value as any)?.keyframeCount ?? 5
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
// 角色名解析逻辑跟 ④ 分镜 / KeyframeGrid 一致：
//   1) c.characterName 直接是字符串就用
//   2) c.characterId === binding.id 严格匹配
//   3) LLM 自由填的 elder_01 / 中文角色名 → 模糊按 standaloneName / overrideName 匹配
function resolveCharNameFromAny(c: any): { name: string; bindingId: string | null } {
  if (typeof c?.characterName === 'string' && c.characterName.trim()) {
    return { name: c.characterName.trim(), bindingId: c.characterBindingId ?? c.characterId ?? null }
  }
  const id: string | undefined = c?.characterId ?? c?.characterBindingId
  if (!id) return { name: '?', bindingId: null }
  const all = (assetStore.epAssetCharacters as any[]) ?? []
  const byId = all.find((x) => x.id === id)
  if (byId) {
    return {
      name: byId.standaloneName ?? byId.overrideName ?? id.slice(0, 8),
      bindingId: byId.id,
    }
  }
  const idStr = String(id).trim().toLowerCase()
  const byName = all.find((x) => {
    const a = String(x.standaloneName ?? '').trim().toLowerCase()
    const b = String(x.overrideName ?? '').trim().toLowerCase()
    return (a && a === idStr) || (b && b === idStr)
  })
  if (byName) {
    return {
      name: byName.standaloneName ?? byName.overrideName ?? id.slice(0, 8),
      bindingId: byName.id,
    }
  }
  // 既匹配不上 binding id 也不上 name —— 至少把 LLM 填的字符串显示出来（不再"?")
  return { name: String(id), bindingId: null }
}

const characterRefs = computed(() => {
  const sb = selectedStoryboard.value as any
  if (!sb || !Array.isArray(sb.characters)) return []
  return sb.characters.map((c: any) => {
    const resolved = resolveCharNameFromAny(c)
    return {
      name: resolved.name,
      bindingId: resolved.bindingId,
      expression: c.expression ?? null,
    }
  })
})

/** 按地点名解析对应的 location binding（用于点击查看图） */
function resolveLocationBindingId(name: string | null | undefined): string | null {
  if (!name) return null
  const all = (assetStore.epAssetLocations as any[]) ?? []
  const target = all.find((b) => {
    const a = String(b.standaloneName ?? '').trim()
    const c = String(b.overrideName ?? '').trim()
    const d = String(b.locationName ?? '').trim()
    return [a, c, d].some((n) => n && n === name)
  })
  return target?.id ?? null
}

const locationRef = computed(() => {
  const s = selectedScene.value as any
  if (!s) return ''
  return s.location ?? ''
})

/** 当前分镜是否为该资产挑过参考图（用于资产标签显示绿点 + 切换 title 文案） */
function hasPickedImage(
  kind: 'character' | 'location' | 'item',
  bindingId: string | null | undefined,
): boolean {
  if (!bindingId) return false
  const refs = (selectedStoryboard.value as any)?.referenceImageIds as
    | Record<string, string>
    | null
    | undefined
  if (!refs) return false
  return Boolean(refs[`${kind}:${bindingId}`])
}

const locationRefBindingId = computed(() => resolveLocationBindingId(locationRef.value))

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

const videoModelId = computed(
  () => projectStore.currentProject?.config?.videoModel?.modelId ?? null,
)

/**
 * 右侧视频预览：优先用本会话最新生成的 videoPath（onVideoDone 回填），
 * 其次回退到 storyboard.videoPath（持久化的）；两者都没则空。
 */
const latestGeneratedPath = ref<string | null>(null)
const latestVideoPath = computed<string | null>(
  () => latestGeneratedPath.value || (selectedStoryboard.value as any)?.videoPath || null,
)

watch(
  () => selectedStoryboardId.value,
  () => {
    latestGeneratedPath.value = null
  },
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

function onVideoDone(videoPath: string): void {
  // 立即让右侧预览区刷新；同时 reload storyboards 让 storyboard.videoPath 持久化值同步
  latestGeneratedPath.value = videoPath || null
  if (selectedScene.value) {
    void storyboardStore.loadStoryboards(selectedScene.value.id)
  }
}

/**
 * 取某资产 binding 的"主图"作为缩略图（用于资产卡的缩略图展示）。
 * 顺序：portraitId / portrait 字段 → 第一张可见图。
 *
 * 当前 epAssetCharacters / epAssetLocations / epAssetItems 数组中每条 binding 的
 * 主图字段命名不统一（character 用 portraitId / portrait；location/item 可能用 mainImage），
 * 这里用宽松的字段查找：portrait → portraitPath → mainImagePath → mainImage.imagePath。
 */
function getMainAssetThumbnail(
  kind: 'character' | 'location' | 'item',
  bindingId: string | null | undefined,
): string | null {
  if (!bindingId) return null
  const list =
    kind === 'character'
      ? assetStore.epAssetCharacters
      : kind === 'location'
        ? assetStore.epAssetLocations
        : assetStore.epAssetItems
  const b: any = (list as any[])?.find((x: any) => x.id === bindingId)
  if (!b) return null
  return (
    b.portrait ??
    b.portraitPath ??
    b.mainImagePath ??
    b.mainImage?.imagePath ??
    b.mainImage?.thumbnailPath ??
    null
  )
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

// ===== 资产图谱浏览 dialog（含 ⑤ stage "为本分镜挑参考图" 选定逻辑）=====
interface AssetImageRow {
  id: string
  imagePath: string
  thumbnailPath: string | null
  category: string
  label: string | null
  isMain: boolean
}

const assetImagesDialog = reactive<{
  open: boolean
  loading: boolean
  title: string
  images: AssetImageRow[]
  // 当前打开的资产种类 + bindingId — 关闭时清空，避免脏数据残留
  kind: 'character' | 'location' | 'item' | null
  bindingId: string | null
}>({
  open: false,
  loading: false,
  title: '',
  images: [],
  kind: null,
  bindingId: null,
})

const savingAssetImageSelection = ref(false)

/** 当前 dialog 上下文（kind+bindingId）在 storyboard.referenceImageIds 里已选定的 imageId */
const selectedAssetImageId = computed<string | null>(() => {
  if (!assetImagesDialog.kind || !assetImagesDialog.bindingId) return null
  const refs = (selectedStoryboard.value as any)?.referenceImageIds as
    | Record<string, string>
    | null
    | undefined
  if (!refs) return null
  return refs[`${assetImagesDialog.kind}:${assetImagesDialog.bindingId}`] ?? null
})

async function openAssetImages(
  kind: 'character' | 'location' | 'item',
  bindingId: string,
  name: string,
): Promise<void> {
  const kindLabel = kind === 'character' ? '角色' : kind === 'location' ? '地点' : '物品'
  assetImagesDialog.title = `${kindLabel}：${name}`
  assetImagesDialog.kind = kind
  assetImagesDialog.bindingId = bindingId
  assetImagesDialog.images = []
  assetImagesDialog.open = true
  assetImagesDialog.loading = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listAssetImages) {
      ElMessage.error('listAssetImages IPC 未暴露')
      return
    }
    const resp = await api.listAssetImages(kind, bindingId)
    if (resp?.success && Array.isArray(resp.data)) {
      assetImagesDialog.images = resp.data as AssetImageRow[]
    } else {
      ElMessage.warning(resp?.error || '资产图加载失败')
    }
  } catch (e: any) {
    ElMessage.error('资产图加载失败：' + (e?.message ?? '未知错误'))
  } finally {
    assetImagesDialog.loading = false
  }
}

/**
 * 用户点图：
 *   - 同一张图再次点 → 清空（回到自动评分）
 *   - 切换 / 新选 → 设为本分镜该资产的参考图
 *
 * 立即写库（不需要 "保存" 按钮），更新 storyboard.referenceImageIds JSON 字段。
 * 写完 reload storyboards 让 selectedStoryboard 同步刷新。
 */
async function onPickAssetImage(imageId: string): Promise<void> {
  if (!selectedStoryboard.value || !assetImagesDialog.kind || !assetImagesDialog.bindingId) return
  const key = `${assetImagesDialog.kind}:${assetImagesDialog.bindingId}`
  const cur = (selectedStoryboard.value as any).referenceImageIds as
    | Record<string, string>
    | null
    | undefined
  const next: Record<string, string> = { ...(cur ?? {}) }
  if (next[key] === imageId) {
    delete next[key]
  } else {
    next[key] = imageId
  }
  await persistReferenceImageIds(Object.keys(next).length === 0 ? null : next)
}

async function onClearAssetImageSelection(): Promise<void> {
  if (!selectedStoryboard.value || !assetImagesDialog.kind || !assetImagesDialog.bindingId) return
  const key = `${assetImagesDialog.kind}:${assetImagesDialog.bindingId}`
  const cur = (selectedStoryboard.value as any).referenceImageIds as
    | Record<string, string>
    | null
    | undefined
  if (!cur || cur[key] === undefined) return
  const next = { ...cur }
  delete next[key]
  await persistReferenceImageIds(Object.keys(next).length === 0 ? null : next)
}

async function persistReferenceImageIds(
  next: Record<string, string> | null,
): Promise<void> {
  if (!selectedStoryboard.value) return
  savingAssetImageSelection.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.updateStoryboard?.(selectedStoryboard.value.id, {
      referenceImageIds: next,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '保存选图失败')
      return
    }
    if (selectedScene.value) {
      await storyboardStore.loadStoryboards(selectedScene.value.id)
    }
  } finally {
    savingAssetImageSelection.value = false
  }
}
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

/* 镜头语言只读展示行：生成模式 / 关键帧数 / 3D 摆位 */
.lang-readonly {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 24px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 12px;
}

.ro-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ro-label {
  color: var(--el-text-color-secondary);
}

.ro-value {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-readonly-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.panel-readonly-hint .el-icon {
  font-size: 12px;
}

/* 上半部分左右两栏：左 2/3 装信息+关键帧+视频生成；右 1/3 视频预览 */
.upper-split {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
  align-items: start;
}

.upper-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.upper-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  position: sticky;
  top: 0;
}

@media (max-width: 1100px) {
  .upper-split {
    grid-template-columns: 1fr;
  }
  .upper-right {
    position: static;
  }
}

/* 视频预览面板 */
.video-preview-panel {
  display: flex;
  flex-direction: column;
}

.video-preview-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.video-preview-player {
  width: 100%;
  background: #000;
  border-radius: 4px;
  display: block;
  outline: none;
  aspect-ratio: 16 / 9;
}

.video-preview-meta {
  font-family: monospace;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.video-preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 30px 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

.video-preview-empty .el-icon {
  font-size: 32px;
}

/* 底部资产缩略图卡 */
.ref-thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.ref-thumb {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.15s;
}

.ref-thumb.clickable {
  cursor: pointer;
}

.ref-thumb.clickable:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.ref-thumb.picked {
  border-color: var(--el-color-success);
  box-shadow: 0 0 0 1px var(--el-color-success-light-7);
}

.ref-thumb-frame {
  position: relative;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, var(--el-fill-color), var(--el-fill-color-light));
  display: flex;
  align-items: center;
  justify-content: center;
}

.ref-thumb-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ref-thumb-emoji {
  font-size: 36px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.15));
}

.ref-thumb-picked {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--el-color-success);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

.ref-thumb-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  font-size: 12px;
}

.ref-thumb-name {
  color: var(--el-text-color-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.ref-tag.clickable {
  cursor: pointer;
  transition: all 0.15s;
}

.ref-tag.clickable:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.ref-tag.picked {
  box-shadow: 0 0 0 1px var(--el-color-success-light-5);
}

.picked-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-success);
  margin-left: 4px;
  vertical-align: middle;
}

/* 资产图谱浏览 dialog */
.asset-images-loading,
.asset-images-empty {
  text-align: center;
  padding: 30px 0;
  color: var(--el-text-color-secondary);
}

.asset-images-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.asset-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.asset-images-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.asset-images-cur code {
  background: var(--el-bg-color);
  padding: 0 6px;
  border-radius: 2px;
  font-family: monospace;
  font-size: 11px;
}

.asset-images-cell {
  position: relative;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}

.asset-images-cell:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.asset-images-cell.selected {
  border-color: var(--el-color-success);
  box-shadow: 0 0 0 2px var(--el-color-success-light-7);
}

.asset-images-selected-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  background: var(--el-color-success);
  color: #fff;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}

.asset-images-cell img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}

.asset-images-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--el-text-color-regular);
}

.asset-images-main {
  background: var(--el-color-success);
  color: #fff;
  padding: 0 4px;
  border-radius: 2px;
  font-size: 10px;
}

.asset-images-cat {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.asset-images-label {
  color: var(--el-text-color-secondary);
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
