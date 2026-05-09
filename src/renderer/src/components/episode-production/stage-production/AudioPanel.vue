<template>
  <!--
    AudioPanel · 场景音频生成面板（spec §4.7 + P5-T21）

    展示当前场景的旁白 + 对话清单（来自 scene_scripts.dialogues JSON），
    并提供"生成全部音频"按钮，触发 V3 binding-aware 编排（spec §4.1）：
      - dialogue.voiceId（场景级覆盖）→ 用
      - 否则 character_binding.voiceId → 用
      - 否则 fallback 'Cherry'

    生成完成后展示每条对话/旁白的 audioPath（含试听 audio 标签）。
  -->
  <div class="audio-panel">
    <div class="panel-header">
      <h4>{{ storyboard ? '本分镜音频' : '场景音频' }}</h4>
      <el-button
        v-if="sceneId"
        size="small"
        type="primary"
        :loading="generating"
        @click="onGenerateAll"
      >
        <el-icon><MagicStick /></el-icon>
        生成全部音频
      </el-button>
    </div>

    <div v-if="!sceneId" class="empty-state">
      请先选择一个场景
    </div>
    <div
      v-else-if="storyboard && !narration && dialogues.length === 0"
      class="empty-state"
    >
      本分镜没有关联的旁白 / 对白
    </div>

    <div v-else>
      <div v-if="narration?.text" class="row narration-row">
        <el-tag size="small" type="info">旁白</el-tag>
        <span class="text">{{ narration.text }}</span>
        <audio
          v-if="narration.audioPath"
          :src="toAudioUrl(narration.audioPath)"
          controls
          class="audio-player"
        />
      </div>

      <div
        v-for="d in dialogues"
        :key="d.id"
        class="row dialogue-row"
      >
        <el-tag size="small" :type="hasVoiceTagType(d)">{{ d.characterName || '?' }}</el-tag>
        <span class="text">{{ d.text }}</span>
        <span v-if="d.voiceId" class="voice-hint">voice={{ d.voiceId }}</span>
        <audio
          v-if="d.audioPath"
          :src="toAudioUrl(d.audioPath)"
          controls
          class="audio-player"
        />
      </div>

      <div v-if="result" class="result-summary" :class="resultLevel">
        <el-icon v-if="resultLevel === 'ok'"><CircleCheck /></el-icon>
        <el-icon v-else><Warning /></el-icon>
        <span v-if="dialogueAttempted === 0">
          本场景无对话需要生成
          <template v-if="result.narrationPath"> · 旁白已生成</template>
        </span>
        <span v-else>
          {{ dialogueSucceeded }} / {{ dialogueAttempted }} 条对话生成成功
          <span v-if="dialogueFailed > 0" class="warn">
            · {{ dialogueFailed }} 条失败
          </span>
          <span v-if="result.fallbackDialogueCount > 0" class="warn">
            · 其中 {{ result.fallbackDialogueCount }} 条用了备用音色（角色未绑专属音色）
          </span>
        </span>
      </div>

      <div v-if="errorMessage" class="error-banner">
        <el-icon><Warning /></el-icon>
        {{ errorMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AudioPanel（P5-T21）
 *
 * Props：
 *   - sceneId：当前选中场景 ID
 *   - scene：可选场景对象（含 narration / dialogues），父组件已加载时传入避免重复 IPC
 *
 * Emits：
 *   - generated(result)：生成完成；父组件可触发刷新或进展状态
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, MagicStick, Warning } from '@element-plus/icons-vue'
import { toAssetUrl } from '@core/utils/asset-path'
import { useEpAssetStore } from '@/stores/episode-production'

interface Dialogue {
  id: string
  text: string
  characterName?: string
  characterBindingId?: string | null
  voiceId?: string | null
  audioPath?: string | null
}

interface SceneInput {
  narration?: string | null
  dialogues?: Dialogue[]
}

/** 分镜级筛选：只显示该分镜引用的旁白 + 对话 */
interface StoryboardScope {
  id: string
  narrationId?: string | null
  dialogueIds?: string[] | null
}

interface OrchestrateResult {
  narrationPath: string | null
  dialoguePaths: Record<string, string>
  fallbackDialogueCount: number
}

const props = defineProps<{
  sceneId: string | null
  scene?: SceneInput | null
  /**
   * 当前分镜（可选）。传入后 AudioPanel 仅显示该分镜引用的旁白 + 对白
   * （对话按 storyboard.dialogueIds 过滤；旁白仅当 storyboard.narrationId 非空才显示）。
   * 不传则展示场景全部对白（兼容旧调用方）。
   */
  storyboard?: StoryboardScope | null
}>()

const emit = defineEmits<{
  (e: 'generated', result: OrchestrateResult): void
}>()

const assetStore = useEpAssetStore()

const generating = ref(false)
const result = ref<OrchestrateResult | null>(null)
const errorMessage = ref<string | null>(null)

/**
 * 旁白显示规则：
 *   - 传了 storyboard：只在 storyboard.narrationId 非空时才显示场景旁白文本
 *     （storyboard.narrationId 是分镜从 AI 生成时拿到的 narration ref；空则代表本分镜不含旁白）
 *   - 没传 storyboard：兼容旧逻辑，只要场景有 narration 就显示
 */
const narration = computed(() => {
  const text = props.scene?.narration ?? ''
  if (!text) return null
  if (props.storyboard && !props.storyboard.narrationId) return null
  return {
    text,
    audioPath: result.value?.narrationPath ?? null,
  }
})

/**
 * 对话显示规则：
 *   - 传了 storyboard：只显示 dialogueIds 列表里包含的对话；空数组 → 不显示
 *   - 没传 storyboard：兼容旧逻辑，显示场景全部对话
 */
const dialogues = computed<Dialogue[]>(() => {
  const arr = props.scene?.dialogues ?? []
  let scoped = arr
  if (props.storyboard) {
    const allow = new Set(props.storyboard.dialogueIds ?? [])
    scoped = arr.filter((d) => allow.has(d.id))
  }
  return scoped.map((d) => ({
    ...d,
    audioPath: result.value?.dialoguePaths[d.id] ?? d.audioPath ?? null,
  }))
})

/** 本面板应尝试生成的对话条数（受 storyboard 过滤） */
const dialogueAttempted = computed(() => dialogues.value.length)

/** 实际成功生成的对话条数（含 fallback 也算成功 — 至少出了音频） */
const dialogueSucceeded = computed(
  () => Object.keys(result.value?.dialoguePaths ?? {}).length,
)

/** 失败条数 = 应该生成 - 实际成功 */
const dialogueFailed = computed(
  () => Math.max(0, dialogueAttempted.value - dialogueSucceeded.value),
)

/** 整体状态：全部成功为 ok（绿）；部分 / 全部失败为 warn（黄） */
const resultLevel = computed<'ok' | 'warn'>(() => {
  if (!result.value) return 'ok'
  if (dialogueAttempted.value === 0) return 'ok'
  return dialogueFailed.value === 0 ? 'ok' : 'warn'
})

function hasVoiceTagType(d: Dialogue): 'success' | 'warning' | 'info' {
  if (d.voiceId) return 'success'
  if (d.characterBindingId) return 'info'
  return 'warning' // 都没绑定，会走 fallback
}

function toAudioUrl(p: string | null | undefined): string {
  if (!p) return ''
  return toAssetUrl(p, 'audio')
}

/**
 * 生成前校验：本场景每个对话角色都必须能解析到 voiceId（不能依赖 fallback）。
 * 解析顺序：
 *   1. dialogue.voiceId（场景级覆盖）
 *   2. character_binding.voiceId（assetStore.epAssetCharacters 里查 binding）
 *
 * 任一对话两条路径都没有 → 列出具体未绑定音色的角色名让用户去修。
 */
function findCharactersMissingVoice(): string[] {
  // 用过滤后的 dialogues（按 storyboard 范围）— 不在本分镜的对白没必要校验
  const dlgs = dialogues.value
  if (dlgs.length === 0) return []
  const bindings = (assetStore.epAssetCharacters as any[]) ?? []
  const missing = new Set<string>()
  for (const d of dlgs) {
    if (d.voiceId) continue
    const bid = d.characterBindingId
    if (bid) {
      const b = bindings.find((x) => x.id === bid)
      if (b?.voiceId) continue
    }
    missing.add(d.characterName?.trim() || '(未命名)')
  }
  return Array.from(missing)
}

async function onGenerateAll(): Promise<void> {
  if (!props.sceneId) return
  // 4. 先做音色绑定校验：未绑定直接拒绝并提示，不发 IPC
  const missing = findCharactersMissingVoice()
  if (missing.length > 0) {
    ElMessage.warning(
      `未绑定音色：${missing.join(' / ')} — 请先到 ② 资产 stage 给角色绑定音色后再生成`,
    )
    return
  }
  generating.value = true
  errorMessage.value = null
  result.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateSceneAudioV3) {
      throw new Error('IPC generateSceneAudioV3 未暴露')
    }
    /*
     * 注：generateSceneAudioV3 仍处理整个 scene 的对话与旁白（数据本身就在 scene 级），
     * 但本面板按 storyboard 过滤后只展示 / 校验本分镜涉及的部分。
     * 后端结果回填后在 dialoguePaths/narrationPath 里挑出本分镜的回放即可。
     */
    const resp = await api.generateSceneAudioV3(props.sceneId, {})
    if (!resp?.success) throw new Error(resp?.error || '生成失败')
    result.value = resp.data as OrchestrateResult
    emit('generated', result.value)
    // 仅以本分镜过滤后的对白条数作为成败口径
    const attempted = dialogues.value.length
    const dialoguePathIds = result.value.dialoguePaths
      ? new Set(Object.keys(result.value.dialoguePaths))
      : new Set<string>()
    const succeeded = dialogues.value.filter((d) => dialoguePathIds.has(d.id)).length
    const failed = Math.max(0, attempted - succeeded)
    if (attempted === 0) {
      ElMessage.success('本场景无对话；旁白处理完成')
    } else if (failed === 0) {
      const fb = result.value.fallbackDialogueCount > 0
        ? `（其中 ${result.value.fallbackDialogueCount} 条用了备用音色）`
        : ''
      ElMessage.success(`音频生成完成：${succeeded} / ${attempted} 条对话${fb}`)
    } else {
      ElMessage.warning(
        `音频部分失败：${succeeded} / ${attempted} 条成功 · ${failed} 条失败`,
      )
    }
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    generating.value = false
  }
}

watch(
  () => props.sceneId,
  () => {
    result.value = null
    errorMessage.value = null
  },
)
</script>

<style scoped>
.audio-panel {
  padding: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-header h4 {
  margin: 0;
  font-size: 14px;
}

.empty-state {
  padding: 20px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  font-size: 13px;
  flex-wrap: wrap;
}

.row:last-child {
  border-bottom: none;
}

.text {
  flex: 1;
  min-width: 200px;
}

.voice-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.audio-player {
  height: 32px;
  max-width: 240px;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  font-size: 13px;
  border-radius: 4px;
}

.result-summary.ok {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.result-summary.warn {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.warn {
  color: var(--el-color-warning);
  margin-left: 4px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
}
</style>
