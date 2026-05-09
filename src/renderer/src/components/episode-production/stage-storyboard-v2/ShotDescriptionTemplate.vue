<template>
  <!--
    ShotDescriptionTemplate · 双模板单镜画面描述（spec 2026-05-09 ep-redesign §3.2 B4 · P-11）

    替代分镜 stage 的空白 textarea，给用户两种结构化模板 + 自由文本：
      ⚡ 短剧 5 段（默认）：角色 / 场景情境 / 戏剧冲突 / 节奏 / 镜头偏好
      🎬 影视 shot-level：subject / action / camera / lighting / mood
      ✏️ 自由文本：保留原 textarea

    双母语：
      大众用户 → 短剧 5 段模板，placeholder 提供示例
      专业用户 → 影视 shot-level 用电影行业母语 / 自由文本完全自定义

    存储：仍写到 storyboards.frame_description（不动 schema）；
    模板字段折叠拼装到一行文本。模式选择不持久化到 metadata（保持简化；用户切换无副作用）。
  -->
  <div class="shot-desc-template">
    <header class="template-header">
      <el-radio-group v-model="mode" size="small">
        <el-radio-button value="short_drama">⚡ 短剧 5 段</el-radio-button>
        <el-radio-button value="film">🎬 影视 shot-level</el-radio-button>
        <el-radio-button value="free">✏️ 自由文本</el-radio-button>
      </el-radio-group>
      <el-tooltip placement="bottom-start" effect="light">
        <el-icon class="help-icon"><QuestionFilled /></el-icon>
        <template #content>
          <div style="max-width: 280px; line-height: 1.6;">
            <div><strong>短剧 5 段</strong>：大众短剧用户母语（角色/情境/冲突/节奏/镜头偏好）</div>
            <div><strong>影视 shot-level</strong>：电影分镜表标准（subject/action/camera/lighting/mood）</div>
            <div><strong>自由文本</strong>：完全自定义</div>
            <div style="margin-top: 4px; color: #aaa;">三种模板都拼装到 frame_description；切换不丢失数据</div>
          </div>
        </template>
      </el-tooltip>
    </header>

    <!-- ⚡ 短剧 5 段 -->
    <el-form v-if="mode === 'short_drama'" label-position="top" size="small" class="template-form">
      <el-form-item label="角色">
        <el-input v-model="shortDrama.character" placeholder="如：少年阿白" />
      </el-form-item>
      <el-form-item label="场景情境">
        <el-input v-model="shortDrama.scene" type="textarea" :rows="2" placeholder="如：黄昏的酒馆，煤油灯昏黄" />
      </el-form-item>
      <el-form-item label="戏剧冲突">
        <el-input v-model="shortDrama.conflict" type="textarea" :rows="2" placeholder="如：突遇追兵闯入" />
      </el-form-item>
      <el-form-item label="节奏">
        <el-radio-group v-model="shortDrama.pace" size="small">
          <el-radio-button value="slow">慢</el-radio-button>
          <el-radio-button value="medium">中</el-radio-button>
          <el-radio-button value="fast">快</el-radio-button>
          <el-radio-button value="twist">反转</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="镜头偏好">
        <el-input v-model="shortDrama.cameraHint" placeholder="如：低角度推镜 / 特写 / 全景" />
      </el-form-item>
    </el-form>

    <!-- 🎬 影视 shot-level -->
    <el-form v-if="mode === 'film'" label-position="top" size="small" class="template-form">
      <el-form-item label="Subject">
        <el-input v-model="film.subject" placeholder="who or what is in frame" />
      </el-form-item>
      <el-form-item label="Action">
        <el-input v-model="film.action" type="textarea" :rows="2" placeholder="what is happening" />
      </el-form-item>
      <el-form-item label="Camera">
        <el-input v-model="film.camera" placeholder="如：MS, low angle, dolly in" />
      </el-form-item>
      <el-form-item label="Lighting">
        <el-input v-model="film.lighting" placeholder="如：rembrandt, warm key" />
      </el-form-item>
      <el-form-item label="Mood">
        <el-input v-model="film.mood" placeholder="如：tense, melancholic" />
      </el-form-item>
    </el-form>

    <!-- ✏️ 自由文本 -->
    <el-input
      v-if="mode === 'free'"
      v-model="freeText"
      type="textarea"
      :rows="4"
      placeholder="如：少年推门而入，雨水顺着帽檐滴落..."
    />

    <!-- 拼装预览（短剧 / 影视模式下显示） -->
    <div v-if="mode !== 'free'" class="preview">
      <span class="preview-label">📄 拼装结果：</span>
      <code class="preview-text">{{ assembled || '（暂无）' }}</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

type ShotMode = 'short_drama' | 'film' | 'free'
const mode = ref<ShotMode>('short_drama')

const shortDrama = reactive<{
  character: string
  scene: string
  conflict: string
  pace: 'slow' | 'medium' | 'fast' | 'twist'
  cameraHint: string
}>({
  character: '',
  scene: '',
  conflict: '',
  pace: 'medium',
  cameraHint: '',
})

const film = reactive<{
  subject: string
  action: string
  camera: string
  lighting: string
  mood: string
}>({
  subject: '',
  action: '',
  camera: '',
  lighting: '',
  mood: '',
})

const freeText = ref('')

// 初始化：从 modelValue 同步到 freeText（默认 mode=short_drama，但 modelValue 可能是老的非结构化文本）
watch(
  () => props.modelValue,
  (v) => {
    if (mode.value === 'free') {
      if (v !== freeText.value) freeText.value = v ?? ''
    }
  },
  { immediate: true },
)

const PACE_LABELS: Record<typeof shortDrama.pace, string> = {
  slow: '慢',
  medium: '中',
  fast: '快',
  twist: '反转',
}

const assembled = computed(() => {
  if (mode.value === 'short_drama') {
    const s = shortDrama
    const parts: string[] = []
    if (s.character.trim()) parts.push(s.character.trim())
    if (s.scene.trim()) parts.push(`场景情境：${s.scene.trim()}`)
    if (s.conflict.trim()) parts.push(`戏剧冲突：${s.conflict.trim()}`)
    if (s.pace) parts.push(`节奏：${PACE_LABELS[s.pace]}`)
    if (s.cameraHint.trim()) parts.push(`镜头偏好：${s.cameraHint.trim()}`)
    return parts.join('；')
  }
  if (mode.value === 'film') {
    const f = film
    const parts: string[] = []
    if (f.subject.trim()) parts.push(`Subject: ${f.subject.trim()}`)
    if (f.action.trim()) parts.push(`Action: ${f.action.trim()}`)
    if (f.camera.trim()) parts.push(`Camera: ${f.camera.trim()}`)
    if (f.lighting.trim()) parts.push(`Lighting: ${f.lighting.trim()}`)
    if (f.mood.trim()) parts.push(`Mood: ${f.mood.trim()}`)
    return parts.join('. ')
  }
  return freeText.value
})

watch(assembled, (v) => emit('update:modelValue', v))

// 切换模式时不主动写入（保持当前值；切回模式时各自字段保留）
watch(mode, (m) => {
  if (m === 'free') {
    // 切到自由文本时，把当前 assembled 拷到 freeText（让用户能继续编辑）
    if (!freeText.value) freeText.value = props.modelValue ?? ''
  }
})
</script>

<style scoped lang="scss">
.shot-desc-template {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  cursor: help;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}

.template-form {
  background: var(--el-fill-color-lighter);
  padding: 8px 10px;
  border-radius: 4px;
}

.template-form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.preview {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: 11px;
  padding: 6px 8px;
  background: var(--el-color-primary-light-9);
  border-radius: 4px;
}

.preview-label {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.preview-text {
  font-family: ui-monospace, monospace;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
