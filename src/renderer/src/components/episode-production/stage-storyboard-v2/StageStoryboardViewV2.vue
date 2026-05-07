<template>
  <!--
    StageStoryboardViewV2 · ④ 分镜（FU5-E1 / 原型 §7）

    严格按对照表 §7 cell 表 10 条差异 + spec §4.5 实施：
    ✓ StageMainHeader 副标题（场景数 / 分镜数 / 累计时长）
    ✓ 双栏：左 220px scene-tree（场景父项 + N.M 子项 + 状态色点） / 1fr 主区域
    ✓ 场景概览 banner（@地点 / 出场 @人物 / 原文摘要）— §7.D-3 P0
    ✓ 分镜网格：分镜卡 + 大缩略图（emoji） + 状态徽章三态（done/gen/todo） + 时长
    ✓ inline 编辑面板：
      - 镜头语言 toolbar（景别 / 角度 / 运镜 / 时长）
      - 关键帧数 1-9 visual 按钮组（推荐值高亮 §7.D-5 P0）
      - "参考链顺序" 提示文案
      - 画面描述 textarea
      - 镜头内角色 5 列 grid inline 编辑（spec §4.5.3）— §7.D-6 P1
      - 进入 ⑤ 画面+音频 跳转按钮
  -->
  <div class="stage-storyboard-v2">
    <StageMainHeader title="④ 分镜阶段" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          v-if="selectedSceneId"
          :loading="generating"
          @click="onGenerateForScene"
        >
          <el-icon><MagicStick /></el-icon>
          {{ generating && genProgress
            ? `生成中 ${genProgress.shotNumber}/${genProgress.total || '?'}`
            : '为本场景生成分镜' }}
        </el-button>
        <el-button
          type="primary"
          :loading="generatingAll"
          :disabled="scenes.length === 0"
          @click="onGenerateAllScenes"
        >
          <el-icon><MagicStick /></el-icon>
          {{ generatingAll && genProgress
            ? `批量生成 ${genProgress.shotNumber}/${genProgress.total || '?'}`
            : '✨ AI 一键拆所有场景' }}
        </el-button>
        <el-button
          type="success"
          :disabled="!canComplete"
          @click="onComplete"
        >
          完成本阶段 → ⑤ 制作
        </el-button>
      </template>
    </StageMainHeader>

    <div v-if="scenes.length === 0" class="empty-state">
      <el-empty description="该剧集还没有场景。请先在 ③ 剧本 stage 生成场景剧本" />
    </div>

    <div v-else class="content-grid">
      <!-- 左：scene-tree -->
      <aside class="scene-tree">
        <h4 class="tree-title">场景</h4>
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
            <span class="scene-num">场景 {{ idx + 1 }}</span>
            <span class="scene-loc">{{ scene.location ?? '?' }}</span>
            <span class="scene-tod">·{{ scene.timeOfDay ?? '?' }}</span>
            <span class="scene-cnt">({{ countSceneStoryboards(scene.id) }})</span>
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
              @click="selectedStoryboardId = sb.id"
            >
              <span class="shot-status-dot" :class="getStatusClass(sb)">●</span>
              <span class="shot-num">{{ idx + 1 }}.{{ sb.shotNumber }}</span>
              <span class="shot-type">{{ shotTypeLabel(sb.shotType) }}</span>
              <span class="shot-dur">{{ sb.duration }}s</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 中 + 右：主区域 -->
      <main class="main-area">
        <!-- 场景概览 banner（§7.D-3 P0） -->
        <section v-if="selectedScene" class="scene-overview">
          <div class="overview-line">
            <strong>场景 {{ selectedSceneIndex + 1 }}</strong>
            <span class="meta-sep">·</span>
            <EntityRefRenderer
              :text="`📍 @${selectedScene.location ?? '?'}`"
              :entities="entityList"
            />
            <span class="meta-sep">·</span>
            <span>{{ selectedScene.timeOfDay ?? '?' }} · {{ selectedScene.weather ?? '?' }}</span>
          </div>
          <div class="overview-line">
            出场:
            <EntityRefRenderer
              v-if="sceneCastNames(selectedScene).length > 0"
              :text="sceneCastNames(selectedScene).map(n => `@${n}`).join(' ')"
              :entities="entityList"
            />
            <span v-else class="hint-tertiary">未识别</span>
          </div>
          <div v-if="selectedScene.originalText" class="overview-line muted">
            原文: {{ selectedScene.originalText.slice(0, 80) }}{{ selectedScene.originalText.length > 80 ? '…' : '' }}
          </div>
        </section>

        <!-- 分镜网格 -->
        <section class="storyboard-grid">
          <div v-if="loadingStoryboards" class="loading-hint">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>加载分镜...</span>
          </div>
          <div v-else-if="storyboards.length === 0" class="empty-hint">
            该场景还没生成分镜，点上方"为本场景生成分镜"。
          </div>
          <div v-else class="grid-cards">
            <article
              v-for="sb in storyboards"
              :key="sb.id"
              class="shot-card-v2"
              :class="{ active: selectedStoryboardId === sb.id }"
              :title="'双击进入 ⑤ 画面+音频'"
              @click="selectedStoryboardId = sb.id"
              @dblclick="emit('jump-to-production', sb)"
            >
              <div class="shot-thumb" :class="getStatusClass(sb)">
                <span class="shot-no-badge">{{ selectedSceneIndex + 1 }}.{{ sb.shotNumber }}</span>
                <!--
                  FU6-T5 真实缩略图：
                    - 已生成首帧（frameImage.url）→ 真实图片预览
                    - 否则 → emoji + "未生成"文字标签（明确告诉 user 这是占位非示意图）
                -->
                <img
                  v-if="sb.frameImage?.url"
                  :src="sb.frameImage.url"
                  class="thumb-img"
                  :alt="`分镜 ${sb.shotNumber} 首帧`"
                />
                <template v-else>
                  <span class="thumb-emoji">{{ shotTypeEmoji(sb.shotType) }}</span>
                  <span class="thumb-empty-label">未生成首帧</span>
                </template>
                <span class="status-badge" :class="getStatusClass(sb)">
                  {{ getStatusEmoji(sb) }}
                </span>
                <span class="duration-badge">{{ sb.duration }}s</span>
              </div>
              <div class="shot-body">
                <div class="shot-title">
                  {{ shotTypeLabel(sb.shotType) }} · {{ cameraAngleLabel(sb.cameraAngle) }} · {{ cameraMovementLabel(sb.cameraMovement) }}
                </div>
                <div class="shot-meta">
                  关键帧 {{ keyframeCountOf(sb) }}
                  <span v-if="sb.frameDescription" class="shot-desc">
                    · {{ sb.frameDescription.slice(0, 30) }}{{ sb.frameDescription.length > 30 ? '…' : '' }}
                  </span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <!-- inline 编辑面板（选中分镜后展开）— §7.D-5/D-6 P0/P1 -->
        <section v-if="selectedStoryboard" class="edit-panel">
          <header class="edit-header">
            <h4 class="edit-title">
              分镜 {{ selectedSceneIndex + 1 }}.{{ selectedStoryboard.shotNumber }} 编辑
            </h4>
            <span class="edit-status" :class="getStatusClass(selectedStoryboard)">
              {{ getStatusLabel(selectedStoryboard) }}
            </span>
            <span class="header-spacer" />
            <el-button
              type="primary"
              size="small"
              @click="emit('jump-to-production', selectedStoryboard)"
            >
              <el-icon><ArrowRight /></el-icon>
              进入 ⑤ 画面+音频
            </el-button>
          </header>

          <!-- 所属场景剧情快照（默认收起；提供编辑分镜时的剧本上下文） -->
          <el-collapse v-if="selectedScene" class="scene-context-collapse">
            <el-collapse-item name="ctx">
              <template #title>
                <span class="scene-ctx-title">
                  📖 所属场景剧情
                  <span class="scene-ctx-meta">
                    · 场景 {{ selectedSceneIndex + 1 }}
                    <template v-if="selectedScene.location">· 📍 {{ selectedScene.location }}</template>
                  </span>
                </span>
              </template>
              <div class="scene-ctx-body">
                <div v-if="selectedScene.originalText" class="ctx-row">
                  <span class="ctx-label">原文</span>
                  <span class="ctx-text muted">{{ selectedScene.originalText }}</span>
                </div>
                <div v-if="selectedScene.narration" class="ctx-row">
                  <span class="ctx-label">旁白</span>
                  <span class="ctx-text">
                    <EntityRefRenderer :text="selectedScene.narration" :entities="entityList" />
                  </span>
                </div>
                <div
                  v-for="(d, di) in sceneDialoguesOf(selectedScene)"
                  :key="`ctx-d-${di}`"
                  class="ctx-row"
                >
                  <span class="ctx-label">对话</span>
                  <span class="ctx-text">
                    <strong>
                      <EntityRefRenderer
                        :text="`@${d.characterName ?? '?'}`"
                        :entities="entityList"
                      />
                    </strong>
                    <span v-if="d.emotion" class="ctx-attr">· {{ d.emotion }}</span>
                    <span class="ctx-dlg">· "{{ d.text }}"</span>
                  </span>
                </div>
                <div
                  v-for="(a, ai) in sceneActionsOf(selectedScene)"
                  :key="`ctx-a-${ai}`"
                  class="ctx-row"
                >
                  <span class="ctx-label">动作</span>
                  <span class="ctx-text">
                    <EntityRefRenderer :text="a.description ?? a.text ?? ''" :entities="entityList" />
                  </span>
                </div>
                <div
                  v-if="
                    !selectedScene.originalText &&
                    !selectedScene.narration &&
                    sceneDialoguesOf(selectedScene).length === 0 &&
                    sceneActionsOf(selectedScene).length === 0
                  "
                  class="ctx-empty"
                >
                  该场景没有原文 / 旁白 / 对话 / 动作信息
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>

          <!-- 镜头语言 toolbar -->
          <div class="lang-toolbar">
            <label class="tool-item">
              <span class="tool-label">景别</span>
              <el-select
                v-model="editDraft.shotType"
                size="small"
                @change="onEditChange('shotType', $event)"
              >
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
              <el-select
                v-model="editDraft.cameraAngle"
                size="small"
                @change="onEditChange('cameraAngle', $event)"
              >
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
              <el-select
                v-model="editDraft.cameraMovement"
                size="small"
                @change="onEditChange('cameraMovement', $event)"
              >
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
                v-model="editDraft.duration"
                :min="0.5"
                :max="60"
                :step="0.1"
                :precision="1"
                size="small"
                controls-position="right"
                @change="onEditChange('duration', $event)"
              />
              <span class="suffix-x">s</span>
            </label>
          </div>

          <!-- 关键帧数 1-9 visual 按钮组（§7.D-5 P0） -->
          <div class="kf-section">
            <div class="kf-label">
              关键帧数
              <span class="hint-tertiary">
                · 按复杂度选；UI 默认呈"九宫格"形态
              </span>
            </div>
            <div class="kf-buttons">
              <button
                v-for="n in 9"
                :key="n"
                class="kf-btn"
                :class="{
                  active: editDraft.keyframeCount === n,
                  recommended: n === 5,
                }"
                @click="setKeyframeCount(n)"
              >
                {{ n }}
                <span v-if="n === 5" class="recommend-tip">建议</span>
              </button>
            </div>
            <p class="kf-tip">
              💡 <strong>{{ kfTipForMovement(editDraft.cameraMovement) }}</strong>
            </p>
          </div>

          <!-- 画面描述 -->
          <div class="desc-section">
            <div class="desc-label">画面描述（AI 生成关键帧时用）</div>
            <el-input
              v-model="editDraft.frameDescription"
              type="textarea"
              :rows="3"
              placeholder="如：少年推门而入，从门口缓缓走向窗边的老者。镜头从少年脚部仰拍开始推近至面部"
              @input="onEditChange('frameDescription', editDraft.frameDescription)"
            />
          </div>

          <!-- 镜头内角色站位 / 表情 / 朝向 / 动作 inline 5 列 grid（§7.D-6 P1 / spec §4.5.3） -->
          <div class="characters-section">
            <div class="char-label">
              镜头内角色（独立配置）
              <span class="hint-tertiary">— 覆盖场景级；为空则继承</span>
            </div>
            <div v-if="storyboardCharacters.length === 0" class="empty-hint-inline">
              未配置分镜级独立角色 → 关键帧生成回退到场景级
              <code>scene.characters</code>
            </div>
            <div v-else class="characters-grid">
              <div class="char-grid-header">
                <span>角色</span>
                <span>位置</span>
                <span>表情</span>
                <span>朝向</span>
                <span>动作</span>
              </div>
              <div
                v-for="(c, i) in storyboardCharacters"
                :key="i"
                class="char-grid-row"
              >
                <span class="cg-name">
                  <!--
                    FU6-T5 真实角色名解析：
                    StoryboardCharacter 数据结构只存 characterId，没有 characterName。
                    旧代码 c.characterName ?? '?' 永远显示 "@?"，是数据契约误用。
                    改：通过 entityList 查 binding 拿真名；查不到说明 binding 已删 → 提示。
                  -->
                  <EntityRefRenderer
                    :text="`@${resolveCharName(c) ?? '(未绑定)'}`"
                    :entities="entityList"
                  />
                </span>
                <el-select v-model="c.position" size="small" placeholder="位置">
                  <el-option label="左" value="left" />
                  <el-option label="中" value="center" />
                  <el-option label="右" value="right" />
                  <el-option label="前" value="front" />
                  <el-option label="后" value="back" />
                </el-select>
                <el-select v-model="c.expression" size="small" placeholder="表情">
                  <el-option label="neutral" value="neutral" />
                  <el-option label="angry" value="angry" />
                  <el-option label="happy" value="happy" />
                  <el-option label="sad" value="sad" />
                  <el-option label="surprised" value="surprised" />
                  <el-option label="confused" value="confused" />
                </el-select>
                <el-select v-model="c.facing" size="small" placeholder="朝向">
                  <el-option label="front" value="front" />
                  <el-option label="3q_left" value="3q_left" />
                  <el-option label="3q_right" value="3q_right" />
                  <el-option label="side_l" value="side_l" />
                  <el-option label="side_r" value="side_r" />
                  <el-option label="back" value="back" />
                </el-select>
                <el-input
                  v-model="c.action"
                  size="small"
                  placeholder="如：持折扇 / 站立"
                />
              </div>
            </div>
            <div class="char-actions">
              <el-button size="small" @click="emit('edit-storyboard-characters', selectedStoryboard)">
                编辑分镜内角色（详细 dialog）
              </el-button>
              <el-button
                v-if="hasUnsavedEditChanges"
                type="primary"
                size="small"
                :loading="savingEdit"
                @click="onSaveEdit"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Loading,
  MagicStick,
} from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'
import type { EntityRefMeta } from '../shared/entity-ref-parser'
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
  (e: 'jump-to-production', sb: any): void
  (e: 'edit-storyboard-characters', sb: any): void
  (e: 'complete'): void
}>()

const episodeStore = useEpEpisodeStore()
const scriptStore = useEpScriptStore()
const storyboardStore = useEpStoryboardStore()
const projectStore = useEpProjectStore()
const assetStore = useEpAssetStore()

const generating = ref(false)
const generatingAll = ref(false)
/** 分镜生成进度（来自 ep:storyboard-progress 事件，逐个分镜推送） */
const genProgress = ref<{ shotNumber: number; total: number } | null>(null)
let unsubStoryboardProgress: (() => void) | null = null
const savingEdit = ref(false)
const loadingStoryboards = ref(false)

const selectedSceneId = ref<string | null>(null)
const selectedStoryboardId = ref<string | null>(null)

const scenes = computed(() => scriptStore.scenes ?? [])
const storyboards = computed(() => storyboardStore.storyboards ?? [])

const selectedScene = computed(() =>
  scenes.value.find((s) => s.id === selectedSceneId.value) ?? null,
)
const selectedSceneIndex = computed(() =>
  selectedScene.value
    ? scenes.value.findIndex((s) => s.id === selectedSceneId.value)
    : 0,
)
const selectedStoryboard = computed(() =>
  storyboards.value.find((s) => s.id === selectedStoryboardId.value) ?? null,
)

const editDraft = reactive<any>({
  shotType: '',
  cameraAngle: '',
  cameraMovement: '',
  duration: 5,
  keyframeCount: 5,
  frameDescription: '',
})

const editDirty = ref<Set<string>>(new Set())
const hasUnsavedEditChanges = computed(() => editDirty.value.size > 0)

watch(
  () => selectedStoryboard.value,
  (sb) => {
    if (!sb) return
    editDraft.shotType = sb.shotType
    editDraft.cameraAngle = sb.cameraAngle
    editDraft.cameraMovement = sb.cameraMovement
    editDraft.duration = sb.duration
    editDraft.keyframeCount = sb.keyframeCount ?? 3
    editDraft.frameDescription = sb.frameDescription ?? ''
    editDirty.value = new Set()
  },
  { immediate: true },
)

const storyboardCharacters = computed(() => selectedStoryboard.value?.characters ?? [])

/*
 * 通过 characterId 反查 binding 拿真名。
 *
 * 三层 fallback：
 *   1. c.characterName 直接是字符串就用（兼容老结构）
 *   2. c.characterId / c.characterBindingId === binding.id 严格匹配（理想契约）
 *   3. LLM 生成 storyboard 时常把 characterId 填成"角色名字"或自创短 id（如 "elder_01" / "少年"），
 *      字面 id 不在 binding.id 集合里 → 这里再按 standaloneName / overrideName 模糊匹配回真 binding，
 *      让 UI 显示正确名字（避免"未绑定"假象）。匹配不到才返 null。
 */
function resolveCharName(c: any): string | null {
  if (typeof c?.characterName === 'string' && c.characterName.trim()) return c.characterName
  const id: string | undefined = c?.characterId ?? c?.characterBindingId
  if (!id) return null
  const all = assetStore.epAssetCharacters ?? []
  // 2. 严格 id 匹配
  const byId = all.find((x: any) => x.id === id)
  if (byId) {
    return (byId as any).standaloneName ?? (byId as any).overrideName ?? null
  }
  // 3. 兜底：把 id 当作"名字"按 standaloneName / overrideName 匹配
  const idStr = String(id).trim().toLowerCase()
  const byName = all.find((x: any) => {
    const a = String((x as any).standaloneName ?? '').trim().toLowerCase()
    const b = String((x as any).overrideName ?? '').trim().toLowerCase()
    return (a && a === idStr) || (b && b === idStr)
  })
  if (byName) {
    return (byName as any).standaloneName ?? (byName as any).overrideName ?? null
  }
  return null
}

const entityList = computed<EntityRefMeta[]>(() => {
  const list: EntityRefMeta[] = []
  for (const b of assetStore.epAssetCharacters ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  for (const b of assetStore.epAssetLocations ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? (b as any).locationName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  for (const b of assetStore.epAssetItems ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? (b as any).itemName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  return list
})

const headerSubtitle = computed(() => {
  const sceneCount = scenes.value.length
  let totalSb = 0
  // FU8-H2 真实总分镜数取自 sceneCounts；时长估算仅当前场景已加载（不强求全集时长聚合，
  // 时长由 ⑤/⑥ stage 落到 storyboard.duration 字段后才准）
  totalSb = totalStoryboardsAcrossScenes.value
  const curDur = storyboards.value.reduce((acc, sb) => acc + (sb.duration ?? 0), 0)
  return `${sceneCount} 个场景 · 共 ${totalSb} 个分镜 · 当前场景预估 ${curDur.toFixed(1)}s`
})

/*
 * FU8-H2 跨场景 canComplete + countSceneStoryboards 真实数据：
 *   设计要求每场至少 1 个 Storyboard 才能进 ⑤。旧实现只看当前选中场景分镜数。
 *   新实现：scenes 加载完毕后，并发拉每个场景的分镜，缓存到 sceneCounts。
 *   - canComplete: 所有 scene 在 sceneCounts 中都 ≥1
 *   - countSceneStoryboards: 显示真实数量，未加载完显示 "..."
 */
const sceneCounts = ref<Record<string, number>>({})
const sceneCountsLoading = ref(false)

async function reloadSceneCounts(): Promise<void> {
  const list = scenes.value
  if (!list || list.length === 0) {
    sceneCounts.value = {}
    return
  }
  sceneCountsLoading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listStoryboards) return
    const results = await Promise.all(
      list.map(async (s: any) => {
        try {
          const resp = await api.listStoryboards(s.id)
          if (resp?.success && Array.isArray(resp.data)) return [s.id, resp.data.length] as const
        } catch {
          /* 单条失败不影响其他场景计数 */
        }
        return [s.id, 0] as const
      }),
    )
    const next: Record<string, number> = {}
    for (const [id, cnt] of results) next[id] = cnt
    sceneCounts.value = next
  } finally {
    sceneCountsLoading.value = false
  }
}

watch(
  () => scenes.value.map((s: any) => s.id).join('|'),
  () => { void reloadSceneCounts() },
  { immediate: true },
)

const totalStoryboardsAcrossScenes = computed(() =>
  Object.values(sceneCounts.value).reduce((acc, n) => acc + n, 0),
)

const canComplete = computed(() => {
  if (scenes.value.length === 0) return false
  return scenes.value.every((s: any) => (sceneCounts.value[s.id] ?? 0) > 0)
})

function selectScene(id: string): void {
  selectedSceneId.value = id
  void loadStoryboardsForSelected()
}

async function loadStoryboardsForSelected(): Promise<void> {
  if (!selectedScene.value) return
  loadingStoryboards.value = true
  try {
    await storyboardStore.loadStoryboards(selectedScene.value.id)
    if (storyboards.value.length > 0) {
      selectedStoryboardId.value = storyboards.value[0].id
    } else {
      selectedStoryboardId.value = null
    }
  } finally {
    loadingStoryboards.value = false
  }
}

function countSceneStoryboards(sceneId: string): string {
  // FU8-H2 真实数据：选中场景以 store 实时计为准（含刚生成未刷的）
  if (selectedSceneId.value === sceneId) return `${storyboards.value.length} 镜`
  const n = sceneCounts.value[sceneId]
  if (n === undefined) return sceneCountsLoading.value ? '...' : '0 镜'
  return `${n} 镜`
}

function getStatusClass(sb: any): string {
  if (sb.videoPath) return 'status-done'
  if (sb.status === 'generating') return 'status-gen'
  return 'status-todo'
}

function getStatusEmoji(sb: any): string {
  if (sb.videoPath) return '✓'
  if (sb.status === 'generating') return '⏳'
  return '○'
}

function getStatusLabel(sb: any): string {
  if (sb.videoPath) return '已出片'
  if (sb.status === 'generating') return '生成中'
  return '待出片'
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

function shotTypeEmoji(t: string): string {
  return ({
    long: '🏞',
    full: '🧍',
    medium: '🚶',
    medium_close: '👤',
    close: '👁',
    extreme_close: '👁',
  } as any)[t] ?? '🎬'
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

function keyframeCountOf(sb: any): number {
  return sb.keyframeCount ?? 3
}

/** 当前选中场景的对白 / 动作列表 helper（与剧本视图逻辑一致） */
function sceneDialoguesOf(scene: any): any[] {
  return Array.isArray(scene?.dialogues) ? scene.dialogues : []
}

function sceneActionsOf(scene: any): any[] {
  return Array.isArray(scene?.actions) ? scene.actions : []
}

function sceneCastNames(scene: any): string[] {
  const cs = scene.characters
  if (!Array.isArray(cs)) return []
  return Array.from(
    new Set(cs.map((c: any) => c.characterName).filter((n: any): n is string => !!n)),
  )
}

function setKeyframeCount(n: number): void {
  editDraft.keyframeCount = n
  onEditChange('keyframeCount', n)
}

function onEditChange(key: string, _value: any): void {
  editDirty.value = new Set([...editDirty.value, key])
}

function kfTipForMovement(m: string): string {
  if (m === 'push' || m === 'pull') return '推/拉镜推荐 3-5 帧 → keyframesToVideo（首尾 + 中间过渡）'
  if (m === 'pan' || m === 'track') return '摇/移镜推荐 5-7 帧（捕捉路径关键节点）'
  if (m === 'static') return '固定镜头推荐 2-3 帧（首 + 尾即可）'
  return '按运镜复杂度选关键帧数量；推荐 5 帧'
}

async function onSaveEdit(): Promise<void> {
  if (!selectedStoryboard.value) return
  savingEdit.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.updateStoryboard?.(selectedStoryboard.value.id, {
      shotType: editDraft.shotType,
      cameraAngle: editDraft.cameraAngle,
      cameraMovement: editDraft.cameraMovement,
      duration: editDraft.duration,
      keyframeCount: editDraft.keyframeCount,
      frameDescription: editDraft.frameDescription,
    })
    if (resp?.success) {
      ElMessage.success('已保存')
      editDirty.value = new Set()
      await storyboardStore.loadStoryboards(selectedScene.value!.id)
    } else {
      ElMessage.error(resp?.error || '保存失败')
    }
  } finally {
    savingEdit.value = false
  }
}

/*
 * FU8-C1 单场景 AI 拆分镜：调 ep:generate-storyboard(sceneId)
 * 后端 handler 内部走 generateStoryboardsIncremental + 落库 + 推送 ep:storyboard-progress
 * 完成后 reload storyboards 让本场景的分镜列表立即出现。
 */
async function onGenerateForScene(): Promise<void> {
  if (!selectedScene.value) return
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型（用于 AI 分镜）')
    return
  }
  generating.value = true
  genProgress.value = { shotNumber: 0, total: 0 }
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateStoryboard) {
      ElMessage.error('分镜生成 IPC 不可用')
      return
    }
    const resp = await api.generateStoryboard(
      selectedScene.value.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (!resp?.success) {
      ElMessage.error(resp?.error || '生成分镜失败')
      return
    }
    const cnt = Array.isArray(resp.data) ? resp.data.length : 0
    ElMessage.success(`已为本场景生成 ${cnt} 个分镜`)
    await storyboardStore.loadStoryboards(selectedScene.value.id)
  } catch (e: any) {
    ElMessage.error(e?.message || '生成分镜失败')
  } finally {
    generating.value = false
    genProgress.value = null
  }
}

/*
 * FU8-C2 全剧本批量拆分镜：调 ep:generate-storyboards(scriptId)
 * 后端 handler 顺序遍历所有 scene 调 generateStoryboards + 推送 ep:storyboards-progress
 * 完成后 reload 当前选中场景的分镜列表（其他场景待选中时按需加载）
 */
async function onGenerateAllScenes(): Promise<void> {
  if (!script.value?.id) {
    ElMessage.warning('请先生成剧本')
    return
  }
  if (scenes.value.length === 0) {
    ElMessage.warning('剧本没有场景，请先 ✨ AI 重新生成剧本')
    return
  }
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型（用于 AI 分镜）')
    return
  }
  generatingAll.value = true
  genProgress.value = { shotNumber: 0, total: 0 }
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateStoryboards) {
      ElMessage.error('分镜批量生成 IPC 不可用')
      return
    }
    const resp = await api.generateStoryboards(
      script.value.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (!resp?.success) {
      ElMessage.error(resp?.error || '批量生成分镜失败')
      return
    }
    const totalShots = Array.isArray(resp.data)
      ? resp.data.reduce((acc: number, r: any) => acc + (r?.storyboards?.length ?? 0), 0)
      : 0
    ElMessage.success(`已为 ${scenes.value.length} 个场景生成共 ${totalShots} 个分镜`)
    if (selectedScene.value) {
      await storyboardStore.loadStoryboards(selectedScene.value.id)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '批量生成分镜失败')
  } finally {
    generatingAll.value = false
    genProgress.value = null
  }
}

function onComplete(): void {
  emit('complete')
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

// 监听后端逐个分镜的进度推送（generateStoryboardsIncremental 内部 send）
onMounted(() => {
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.onStoryboardProgress) return
  unsubStoryboardProgress = api.onStoryboardProgress(
    (_event: any, data: { sceneId: string; shotNumber: number; total: number; storyboard: any }) => {
      genProgress.value = {
        shotNumber: data.shotNumber ?? 0,
        total: data.total ?? 0,
      }
      // 当前选中场景命中时立即追加新分镜，免等整批完
      if (selectedScene.value && data.sceneId === selectedScene.value.id) {
        void storyboardStore.loadStoryboards(selectedScene.value.id)
      }
    },
  )
})

onBeforeUnmount(() => {
  if (unsubStoryboardProgress) unsubStoryboardProgress()
  unsubStoryboardProgress = null
})
</script>

<style scoped lang="scss">
.stage-storyboard-v2 {
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

/* ── scene-tree ── */
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
  transition: background 0.15s;
}

.tree-scene-head:hover {
  background: var(--el-fill-color-light);
}

.tree-scene-head.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}

.scene-icon {
  font-size: 12px;
}

.scene-cnt {
  margin-left: auto;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
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
  color: var(--el-text-color-regular);
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

.shot-status-dot.status-done {
  color: var(--el-color-success);
}
.shot-status-dot.status-gen {
  color: var(--el-color-warning);
}
.shot-status-dot.status-todo {
  color: var(--el-text-color-placeholder);
}

.shot-dur {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}

/* ── 主区域 ── */
.main-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
}

/* 场景概览 banner */
.scene-overview {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 0 4px 4px 0;
  padding: 10px 14px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overview-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.overview-line.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.meta-sep {
  color: var(--el-text-color-placeholder);
}

.hint-tertiary {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

/* 分镜网格 */
.storyboard-grid {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
}

.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.shot-card-v2 {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}

.shot-card-v2:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.shot-card-v2.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.shot-thumb {
  position: relative;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--el-color-primary-light-7), var(--el-color-primary-light-5));
}

.shot-thumb.status-todo {
  background: linear-gradient(135deg, var(--el-fill-color), var(--el-fill-color-light));
}

.shot-thumb.status-gen {
  background: linear-gradient(135deg, var(--el-color-warning-light-7), var(--el-color-warning-light-5));
}

.shot-thumb.status-done {
  background: linear-gradient(135deg, var(--el-color-success-light-7), var(--el-color-success-light-5));
}

.shot-no-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}

.thumb-emoji {
  font-size: 36px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.15));
}

/* FU6-T5 真实首帧图片占满 thumb 区域 */
.thumb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* FU6-T5 未生成时显式标签：避免 user 把 emoji 当真实"示意图" */
.thumb-empty-label {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  white-space: nowrap;
}

.status-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.duration-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.shot-body {
  padding: 8px 10px;
}

.shot-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 3px;
}

.shot-meta {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.shot-desc {
  color: var(--el-text-color-secondary);
}

.loading-hint,
.empty-hint {
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 24px;
  font-style: italic;
}

/* inline 编辑面板 */
.edit-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.edit-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.edit-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
}

.edit-status.status-done {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.edit-status.status-gen {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.header-spacer {
  flex: 1;
}

/* 所属场景剧情折叠面板 */
.scene-context-collapse {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  margin-bottom: 10px;
  background: var(--el-fill-color-lighter);
}

.scene-context-collapse :deep(.el-collapse-item__header) {
  padding: 0 12px;
  background: transparent;
  border-bottom: none;
  font-size: 13px;
  height: 36px;
  line-height: 36px;
}

.scene-context-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
}

.scene-context-collapse :deep(.el-collapse-item__content) {
  padding: 6px 12px 12px;
}

.scene-ctx-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.scene-ctx-meta {
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
}

.scene-ctx-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}

.ctx-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.ctx-label {
  flex-shrink: 0;
  width: 36px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  border-radius: 3px;
  padding: 1px 0;
  text-align: center;
}

.ctx-text {
  flex: 1;
  min-width: 0;
}

.ctx-text.muted {
  color: var(--el-text-color-placeholder);
}

.ctx-attr {
  margin-left: 4px;
  color: var(--el-color-primary);
}

.ctx-dlg {
  margin-left: 4px;
}

.ctx-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
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

/* 控件给最小宽度，避免标签 + 控件挤变形 */
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

/* 关键帧数 1-9 visual 按钮 */
.kf-section {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 10px;
}

.kf-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.kf-buttons {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.kf-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.15s;
}

.kf-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.kf-btn.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.kf-btn.recommended:not(.active) {
  border-color: var(--el-color-primary-light-3);
  color: var(--el-color-primary);
}

.recommend-tip {
  position: absolute;
  bottom: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: var(--el-color-primary);
  white-space: nowrap;
}

.kf-tip {
  margin: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 12px;
}

.desc-section {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 10px;
}

.desc-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.characters-section {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 10px;
}

.char-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.empty-hint-inline {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
  padding: 6px 0;
}

.empty-hint-inline code {
  background: var(--el-fill-color-light);
  padding: 0 4px;
  border-radius: 2px;
  font-family: monospace;
}

.characters-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-grid-header,
.char-grid-row {
  display: grid;
  grid-template-columns: 80px 1fr 1fr 1fr 1fr;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}

.char-grid-header {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.cg-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.char-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
