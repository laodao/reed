<template>
  <!--
    AiWriteScriptPromptDialog · 「AI 写剧本」提示词对话框

    在「创建剧集」对话框里由「✨ AI 写剧本」按钮唤起：
      输入创作要求（+ 复用上方故事背景）→ 调 ep:ai-generate-text 生成小说体裁原文
      → emit('generated', text) 回填到 CreateEpisodeDialog 的「长文内容」(uploadedContent)。

    设计：只产出自由文本，不创建剧集、不做场景拆分（那些分别由 createEpisode 与
    剧本 stage 的 EpisodeScriptGenerator 负责）。provider/model 取自项目 config.scriptModel，
    与 AIQuickModeWizard 一致；未配置时禁用生成并提示。
  -->
  <el-dialog
    v-model="visible"
    title="✨ AI 写剧本"
    width="600px"
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
  >
    <div class="ai-write-body">
      <div class="hint-row">
        输入创作要求，AI 会生成一段小说体裁的故事原文，回填到「长文内容」。后续在剧本 stage 会自动拆成场景 / 对白。
      </div>

      <!-- 故事背景（只读，取自创建对话框上方填写的内容） -->
      <div v-if="hasBackground" class="bg-box">
        <div class="bg-title">故事背景（取自上方，如需修改请关闭后在上下方调整）</div>
        <div class="bg-lines">
          <span v-if="storyEra">年代：{{ storyEra }}</span>
          <span v-if="storyRegion">地域：{{ storyRegion }}</span>
          <span v-if="storyBackgroundExtra">其他：{{ storyBackgroundExtra }}</span>
        </div>
      </div>

      <el-form label-position="top">
        <el-form-item label="创作要求" required>
          <el-input
            v-model="prompt"
            type="textarea"
            :rows="6"
            :maxlength="2000"
            show-word-limit
            :disabled="loading"
            placeholder="描述你想写的故事 — 越具体效果越好&#10;例：民国江南，茶馆老板娘周玉珍为亡夫复仇，与神秘客张慕白在茶馆暗中博弈..."
          />
        </el-form-item>
      </el-form>

      <div v-if="!hasScriptModel" class="warn-row">
        ⚠️ 当前项目未配置「剧本生成模型」，请先在项目设置里配置 AI 提供商与模型后再使用。
      </div>
    </div>

    <template #footer>
      <el-button :disabled="loading" @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="!canGenerate"
        @click="onGenerate"
      >
        {{ loading ? '生成中...' : '生成故事原文' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useEpProjectStore } from '@/stores/episode-production'
import type { EpAiGenerateTextRequest } from '@shared/types/episode-production'

const props = defineProps<{
  modelValue: boolean
  /** 故事背景三字段（由 CreateEpisodeDialog 传入，拼入提示词） */
  storyEra?: string
  storyRegion?: string
  storyBackgroundExtra?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** 生成成功 → 回填文本到父组件 */
  (e: 'generated', text: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const projectStore = useEpProjectStore()
const prompt = ref('')
const loading = ref(false)

const sm = computed(() => projectStore.currentProject?.config?.scriptModel)
const hasScriptModel = computed(() => !!sm.value?.providerConfigId && !!sm.value?.modelId)

const hasBackground = computed(
  () =>
    !!(props.storyEra?.trim() || props.storyRegion?.trim() || props.storyBackgroundExtra?.trim()),
)

const canGenerate = computed(
  () => !loading.value && prompt.value.trim().length > 0 && hasScriptModel.value,
)

// 每次打开清空提示词
watch(
  () => props.modelValue,
  (v) => {
    if (v) prompt.value = ''
  },
)

async function onGenerate(): Promise<void> {
  if (!canGenerate.value) return
  loading.value = true
  try {
    const req: EpAiGenerateTextRequest = {
      prompt: prompt.value.trim(),
      storyEra: props.storyEra?.trim() || undefined,
      storyRegion: props.storyRegion?.trim() || undefined,
      storyBackgroundExtra: props.storyBackgroundExtra?.trim() || undefined,
      providerConfigId: sm.value?.providerConfigId,
      modelId: sm.value?.modelId,
    }
    const resp = await window.electronAPI.episodeProduction.aiGenerateText(req)
    if (resp.success && resp.data?.text) {
      emit('generated', resp.data.text as string)
      visible.value = false
    } else {
      ElMessage.error(resp.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.ai-write-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hint-row {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 10px 12px;
  border-radius: 6px;
  border-left: 3px solid var(--el-color-primary);
}

.bg-box {
  font-size: 13px;
  background: var(--el-fill-color-lighter);
  padding: 8px 12px;
  border-radius: 6px;

  .bg-title {
    color: var(--el-text-color-secondary);
    margin-bottom: 4px;
    font-size: 12px;
  }

  .bg-lines {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    color: var(--el-text-color-primary);
  }
}

.warn-row {
  font-size: 13px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 8px 12px;
  border-radius: 4px;
}
</style>
