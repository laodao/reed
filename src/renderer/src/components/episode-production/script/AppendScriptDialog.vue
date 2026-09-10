<template>
  <el-dialog
    :model-value="modelValue"
    :title="step === 'input' ? '追加剧本' : '确认追加内容'"
    width="720px"
    top="6vh"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="onVisibleChange"
    @closed="reset"
  >
    <!-- ==================== 第一步：录入 ==================== -->
    <div v-if="step === 'input'" class="append-input">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="tip"
      >
        <template #title>
          已有 {{ existingSceneCount }} 个场次不会被改动，新增内容接在最后一幕之后（从第
          {{ nextSceneNumberHint }} 场开始编号）。
        </template>
      </el-alert>

      <el-radio-group v-model="mode" class="mode-group">
        <el-radio-button value="ai-continue">AI 续写</el-radio-button>
        <el-radio-button value="manual-text">粘贴剧本正文</el-radio-button>
      </el-radio-group>

      <!-- AI 续写 -->
      <template v-if="mode === 'ai-continue'">
        <div class="field-label">续写要求</div>
        <el-input
          v-model="instruction"
          type="textarea"
          :rows="6"
          resize="none"
          maxlength="2000"
          show-word-limit
          placeholder="例如：接着往下写李四登场，与张三在茶馆发生冲突，最终不欢而散；本段大约 3 场戏。"
        />
        <div class="hint">
          AI 会带着已有剧情正文与场次一览续写，只输出新增部分，不会覆盖已有内容。
        </div>
      </template>

      <!-- 手动粘贴 -->
      <template v-else>
        <div class="field-label">要追加的剧本正文</div>
        <el-input
          v-model="manualText"
          type="textarea"
          :rows="10"
          resize="none"
          placeholder="把新写好的剧本正文粘贴到这里（标准剧本格式或小说体都可以），系统会把它拆成新场次接在已有场次之后。"
        />
        <div class="hint">
          正文会原样追加到剧本末尾，同时由 AI 拆分成结构化场次（正文里没写明的视觉细节会按规范补全）。
        </div>
      </template>

      <div v-if="!hasProjectScriptModel" class="hint warn">
        项目未配置「剧本模型」，将使用默认模型。
      </div>
    </div>

    <!-- ==================== 第二步：预览确认 ==================== -->
    <div v-else-if="preview" class="append-preview">
      <el-descriptions :column="2" border size="small" class="summary">
        <el-descriptions-item label="已有场次">
          {{ preview.existingSceneCount }} 场
        </el-descriptions-item>
        <el-descriptions-item label="本次新增场次">
          <el-tag :type="preview.draft.scenes.length > 0 ? 'success' : 'warning'" size="small">
            {{ preview.draft.scenes.length }} 场
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="正文">
          {{ preview.existingContentLength }} 字 →
          {{ preview.existingContentLength + preview.draft.scriptContent.length }} 字
        </el-descriptions-item>
        <el-descriptions-item label="新增文字数">
          {{ preview.draft.scriptContent.length }} 字
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="preview.draft.scenes.length === 0"
        type="warning"
        :closable="false"
        show-icon
        class="tip"
        title="没有识别出新场次：将只追加剧本正文，之后可在 ④ 分镜 stage 手动补场次。"
      />

      <template v-if="preview.draft.scenes.length > 0">
        <div class="field-label">新增场次</div>
        <div class="scene-chips">
          <el-tag
            v-for="sc in preview.draft.scenes"
            :key="sc.sceneNumber"
            size="small"
            effect="plain"
            round
          >
            第 {{ sc.sceneNumber }} 场 · {{ sc.location || '未指定地点' }}
          </el-tag>
        </div>
      </template>

      <div v-if="preview.draft.scriptContent" class="field-label">新增正文预览</div>
      <pre v-if="preview.draft.scriptContent" class="preview-text">{{ preview.draft.scriptContent }}</pre>

      <el-checkbox v-if="scriptApproved" v-model="keepApproved" class="keep-approved">
        保持「已定稿」状态（默认追加后回到草稿态，需要重新定稿）
      </el-checkbox>
    </div>

    <template #footer>
      <el-button @click="onVisibleChange(false)">取消</el-button>
      <el-button v-if="step === 'preview'" @click="step = 'input'">返回修改</el-button>
      <el-button
        v-if="step === 'input'"
        type="primary"
        :loading="generating"
        :disabled="!canGenerate"
        @click="onGenerate"
      >
        生成追加内容
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="appending"
        @click="onConfirm"
      >
        确认追加
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 追加剧本对话框（③ 剧本 stage）。
 *
 * 场景：剧本没写完就先开机制作了，后续要陆续往剧本里加内容。
 * 两条路径都只做**增量**：已有场次与已有正文不动，新增内容接在最后。
 *
 * 流程：录入 → 调 ep:prepare-script-append 生成草稿（不落库）→ 预览确认
 *       → 调 ep:append-script 落库 → emit('appended')。
 *
 * @see platform/episode-production/narrative/services/script-append.service
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useEpProjectStore } from '@/stores/episode-production'
import type { ScriptAppendMode, ScriptAppendPreview } from '@shared/types/episode-production'

const props = withDefaults(
  defineProps<{
    /** 弹窗显隐（v-model） */
    modelValue: boolean
    /** 目标剧本 ID（未生成剧本时为 null，此时弹窗打不开） */
    scriptId: string | null
    /** 项目 ID（用于取项目配置的剧本模型 / 续写模型） */
    projectId?: string
    /** 已有场次数量（父组件传入，用于首屏提示） */
    existingSceneCount?: number
    /** 剧本是否已定稿（决定是否显示"保持定稿"选项） */
    scriptApproved?: boolean
    /** 打开时的默认模式 */
    defaultMode?: ScriptAppendMode
  }>(),
  {
    existingSceneCount: 0,
    scriptApproved: false,
    defaultMode: 'ai-continue',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 追加落库成功（父组件据此刷新场次 / 选中新场次） */
  (e: 'appended', payload: { addedSceneCount: number; addedContentLength: number }): void
}>()

const projectStore = useEpProjectStore()

const step = ref<'input' | 'preview'>('input')
const mode = ref<ScriptAppendMode>(props.defaultMode)
const instruction = ref('')
const manualText = ref('')
const keepApproved = ref(false)
const preview = ref<ScriptAppendPreview | null>(null)
const generating = ref(false)
const appending = ref(false)

const hasProjectScriptModel = computed(() => {
  const sm = projectStore.currentProject?.config?.scriptModel
  return Boolean(sm?.providerConfigId && sm?.modelId)
})

/** 新增场次的起始编号提示（首屏即让用户知道会接第几场） */
const nextSceneNumberHint = computed(() => props.existingSceneCount + 1)

const canGenerate = computed(() =>
  mode.value === 'ai-continue'
    ? instruction.value.trim().length > 0
    : manualText.value.trim().length > 0,
)

/** 打开时同步父组件给的默认模式，并确保项目配置已载入（取剧本模型用） */
watch(
  () => [props.modelValue, props.defaultMode] as const,
  ([visible, defMode]) => {
    if (!visible) return
    mode.value = defMode
    void ensureProjectLoaded()
  },
  { immediate: true },
)

/** 项目配置没载入时按 projectId 拉一次，保证能读到 config.scriptModel */
async function ensureProjectLoaded(): Promise<void> {
  const id = props.projectId
  if (!id || projectStore.currentProject?.id === id) return
  try {
    await projectStore.loadProject(id)
  } catch (e) {
    console.warn('[AppendScriptDialog] 加载项目配置失败:', e)
  }
}

function onVisibleChange(value: boolean): void {
  emit('update:modelValue', value)
}

function reset(): void {
  step.value = 'input'
  instruction.value = ''
  manualText.value = ''
  keepApproved.value = false
  preview.value = null
  generating.value = false
  appending.value = false
}

async function onGenerate(): Promise<void> {
  if (!props.scriptId || generating.value) return
  if (!canGenerate.value) {
    ElMessage.warning(
      mode.value === 'ai-continue' ? '请先填写续写要求' : '请先粘贴要追加的剧本正文',
    )
    return
  }
  const sm = projectStore.currentProject?.config?.scriptModel
  generating.value = true
  try {
    const resp = await window.electronAPI.episodeProduction.prepareScriptAppend(
      props.scriptId,
      {
        mode: mode.value,
        instruction: mode.value === 'ai-continue' ? instruction.value : undefined,
        text: mode.value === 'manual-text' ? manualText.value : undefined,
        providerConfigId: sm?.providerConfigId,
        modelId: sm?.modelId,
      },
    )
    if (!resp?.success || !resp.data) {
      ElMessage.error(resp?.error || '生成追加内容失败')
      return
    }
    preview.value = resp.data as ScriptAppendPreview
    step.value = 'preview'
  } catch (e: any) {
    ElMessage.error(e?.message || '生成追加内容失败')
  } finally {
    generating.value = false
  }
}

async function onConfirm(): Promise<void> {
  if (!props.scriptId || !preview.value || appending.value) return
  appending.value = true
  try {
    const resp = await window.electronAPI.episodeProduction.appendScript(
      props.scriptId,
      preview.value.draft,
      { keepApproved: keepApproved.value },
    )
    if (!resp?.success) {
      ElMessage.error(resp?.error || '追加剧本失败')
      return
    }
    const addedSceneCount = resp.data?.addedScenes?.length ?? 0
    ElMessage.success(
      `已追加${addedSceneCount > 0 ? ` ${addedSceneCount} 个新场次` : '剧本正文'}`,
    )
    emit('appended', {
      addedSceneCount,
      addedContentLength: preview.value.draft.scriptContent.length,
    })
    emit('update:modelValue', false)
  } catch (e: any) {
    ElMessage.error(e?.message || '追加剧本失败')
  } finally {
    appending.value = false
  }
}
</script>

<style lang="scss" scoped>
.append-input,
.append-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

.tip {
  :deep(.el-alert__title) {
    font-size: 12px;
    line-height: 1.6;
  }
}

.mode-group {
  margin-bottom: 2px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  letter-spacing: 0.3px;
}

.hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-placeholder);

  &.warn {
    color: var(--el-color-warning);
  }
}

.summary {
  margin-bottom: 2px;
}

.scene-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-text {
  margin: 0;
  max-height: 240px;
  overflow-y: auto;
  padding: 10px 12px;
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-color-regular);
}

.keep-approved {
  margin-top: 2px;
}
</style>
