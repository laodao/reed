<template>
  <!--
    SceneInlineEditor · 场景就地编辑器（spec 2026-05-08 v3 — 展开即编辑）

    职责：
      - 在 SceneListPanel 展开场景时直接渲染本组件，让用户就地改全部字段
      - 字段：基础组（地点/时间/天气/氛围/光线/场景描述）+ 剧情（原文/旁白）
        + 对话列表（增删改）+ 动作列表（增删改）
      - 顶部 saveBar 显示 dirty 标记 + "保存" + "重置" 按钮，仅 dirty 时可点保存
      - 出场角色 characters：本期只读显示 chip，编辑留 follow-up（涉及 binding picker）

    与 SceneEditDialog 的关系：
      - 字段集与 SceneEditDialog 一致，但**这个是内联视图**，按区块顺序铺开（不再分 tab）
      - SceneListPanel 展开后默认就地编辑；"编辑场景"按钮保留为"放大编辑"入口
        （仍打开 SceneEditDialog，便于在小窗口里专注编辑某一段）

    保存契约：
      - emit('save', sceneId, partial)：父容器（StageContentScriptView）调 ep:update-scene 落库
      - emit('polish-requested', sceneId)：AI 场景级润色（与 SceneEditDialog 共用通道）
  -->
  <div v-if="form" class="scene-inline-editor">
    <!-- 顶部保存条：dirty 时高亮 -->
    <div v-if="!readonly" class="save-bar" :class="{ dirty: isDirty }">
      <span class="dirty-indicator">
        <el-icon v-if="isDirty"><EditPen /></el-icon>
        {{ isDirty ? '有未保存的修改' : '编辑模式' }}
      </span>
      <div class="save-actions">
        <el-button
          size="small"
          :disabled="saving"
          @click="onCancel"
        >
          取消
        </el-button>
        <el-button
          size="small"
          plain
          :disabled="!isDirty || saving"
          @click="onReset"
        >
          重置
        </el-button>
        <el-button
          size="small"
          type="warning"
          plain
          :loading="polishing"
          @click="emit('polish-requested', sceneId)"
        >
          <el-icon><MagicStick /></el-icon>
          ✨ AI 润色
        </el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!isDirty"
          :loading="saving"
          @click="onSave"
        >
          保存
        </el-button>
      </div>
    </div>

    <!-- 基础信息组 -->
    <section class="editor-section">
      <div class="section-header">基础信息</div>
      <el-form label-width="76px" label-position="left" size="small" class="basic-form">
        <el-form-item label="地点">
          <el-input
            v-model="form.location"
            :disabled="readonly"
            placeholder="如：茶馆 / 长安城东市"
          />
        </el-form-item>
        <el-form-item label="地点类型">
          <el-radio-group v-model="form.locationType" :disabled="readonly">
            <el-radio value="interior">内景</el-radio>
            <el-radio value="exterior">外景</el-radio>
            <el-radio value="mixed">内外混合</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="时间段">
          <el-select v-model="form.timeOfDay" :disabled="readonly" placeholder="选择时间段">
            <el-option label="清晨" value="dawn" />
            <el-option label="上午" value="morning" />
            <el-option label="正午" value="noon" />
            <el-option label="下午" value="afternoon" />
            <el-option label="黄昏" value="dusk" />
            <el-option label="傍晚" value="evening" />
            <el-option label="夜晚" value="night" />
          </el-select>
        </el-form-item>
        <el-form-item label="天气">
          <el-select v-model="form.weather" :disabled="readonly" placeholder="可空" clearable>
            <el-option label="晴" value="sunny" />
            <el-option label="多云" value="cloudy" />
            <el-option label="雨" value="rainy" />
            <el-option label="雪" value="snowy" />
            <el-option label="雾" value="foggy" />
            <el-option label="风暴" value="stormy" />
          </el-select>
        </el-form-item>
        <el-form-item label="氛围">
          <el-input
            v-model="form.mood"
            :disabled="readonly"
            placeholder="如：紧张 / 温馨 / 悲伤"
          />
        </el-form-item>
        <el-form-item label="光线">
          <el-input
            v-model="form.lighting"
            :disabled="readonly"
            placeholder="如：晨光斜射 / 烛光昏黄 / 霓虹闪烁"
          />
        </el-form-item>
        <el-form-item label="场景描述">
          <el-input
            v-model="form.sceneDescription"
            type="textarea"
            :rows="2"
            :disabled="readonly"
            placeholder="场景视觉描述（含空间布局/陈设/材质/色调/关键视觉元素）"
          />
        </el-form-item>
      </el-form>
    </section>

    <!-- 出场角色（只读 chip，编辑留 follow-up） -->
    <section
      v-if="(scene?.characters ?? []).length > 0"
      class="editor-section"
    >
      <div class="section-header">
        出场角色
        <span class="section-hint">— 角色细节（表情/服装/道具）暂在「编辑场景」对话框内改</span>
      </div>
      <div class="chips-row">
        <el-tag
          v-for="(c, i) in (scene?.characters ?? [])"
          :key="`scene-char-${i}`"
          size="small"
          type="info"
        >
          {{ c.characterName || '未命名角色' }}
        </el-tag>
      </div>
    </section>

    <!-- 剧情正文：原文 + 旁白 -->
    <section class="editor-section">
      <div class="section-header">剧情正文</div>
      <div class="narrative-field">
        <label class="field-label">原文片段</label>
        <el-input
          v-model="form.originalText"
          type="textarea"
          :rows="4"
          :disabled="readonly"
          placeholder="对应到这一场的小说原文（可空）"
        />
      </div>
      <div class="narrative-field">
        <label class="field-label">旁白</label>
        <el-input
          v-model="form.narration"
          type="textarea"
          :rows="3"
          :disabled="readonly"
          placeholder="本场的旁白文本（叙述/独白）"
        />
      </div>
    </section>

    <!-- 对话列表 -->
    <section class="editor-section">
      <div class="section-header">
        <span>对话 ({{ form.dialogues.length }})</span>
        <el-button
          v-if="!readonly"
          size="small"
          link
          type="primary"
          @click="addDialogue"
        >
          <el-icon><Plus /></el-icon>
          新增对话
        </el-button>
      </div>
      <div v-if="form.dialogues.length === 0" class="empty-list">
        还没有对话，点上方"新增对话"添加
      </div>
      <div
        v-for="(d, idx) in form.dialogues"
        :key="d.id ?? `dlg-${idx}`"
        class="line-item"
      >
        <div class="line-item-header">
          <span class="line-index">#{{ idx + 1 }}</span>
          <el-input
            v-model="d.characterName"
            size="small"
            :disabled="readonly"
            placeholder="角色名"
            class="speaker-input"
          />
          <el-input
            v-model="d.emotion"
            size="small"
            :disabled="readonly"
            placeholder="情感（如：愤怒）"
            class="emotion-input"
          />
          <el-button
            v-if="!readonly"
            size="small"
            link
            type="danger"
            @click="form.dialogues.splice(idx, 1)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <el-input
          v-model="d.text"
          type="textarea"
          :rows="2"
          size="small"
          :disabled="readonly"
          placeholder="对话内容"
          class="line-text"
        />
      </div>
    </section>

    <!-- 动作列表 -->
    <section class="editor-section">
      <div class="section-header">
        <span>动作 ({{ form.actions.length }})</span>
        <el-button
          v-if="!readonly"
          size="small"
          link
          type="primary"
          @click="addAction"
        >
          <el-icon><Plus /></el-icon>
          新增动作
        </el-button>
      </div>
      <div v-if="form.actions.length === 0" class="empty-list">
        还没有动作描述，点上方"新增动作"添加
      </div>
      <div
        v-for="(a, idx) in form.actions"
        :key="a.id ?? `act-${idx}`"
        class="line-item"
      >
        <div class="line-item-header">
          <span class="line-index">#{{ idx + 1 }}</span>
          <el-input
            v-model="a.characterId"
            size="small"
            :disabled="readonly"
            placeholder="执行者（角色名/id，可空）"
            class="speaker-input"
          />
          <el-select
            v-model="a.timing"
            size="small"
            :disabled="readonly"
            class="timing-select"
          >
            <el-option label="对话之前" value="before" />
            <el-option label="对话之中" value="during" />
            <el-option label="对话之后" value="after" />
          </el-select>
          <el-button
            v-if="!readonly"
            size="small"
            link
            type="danger"
            @click="form.actions.splice(idx, 1)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <el-input
          v-model="a.description"
          type="textarea"
          :rows="2"
          size="small"
          :disabled="readonly"
          placeholder="动作描述"
          class="line-text"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Delete, EditPen, MagicStick, Plus } from '@element-plus/icons-vue'
import type {
  SceneScript,
  Dialogue,
  ActionDescription,
} from '../../../../../shared/types/episode-production/narrative.types'

defineOptions({ name: 'SceneInlineEditor' })

const props = defineProps<{
  /** 当前场景。父组件传入展开的那一条 SceneScript */
  scene: SceneScript | null
  /** 父容器在 ep:update-scene 调用期间传入，让保存按钮 loading */
  saving?: boolean
  /** AI 润色调用期间，按钮 loading + 锁定 */
  polishing?: boolean
  /** episode 进入 producing 后只读 */
  readonly?: boolean
}>()

const emit = defineEmits<{
  /** 保存：父容器收到后调 ep:update-scene 落库；payload 是变更后的字段子集 */
  (e: 'save', sceneId: string, partial: Partial<SceneScript>): void
  /** 用户点 "✨ AI 润色"；父容器调 ep:polish-scene 把结果通过 applyPolishResult 回填 */
  (e: 'polish-requested', sceneId: string): void
  /** 用户点"取消"退出编辑模式（dirty 时弹确认）；父容器切回浏览模式 */
  (e: 'cancel', sceneId: string): void
}>()

const sceneId = computed<string>(() => props.scene?.id ?? '')

/**
 * 本地表单副本——浅拷贝 props.scene 各字段。
 * 用 ref<any> 是为了避开 SceneScript 可选字段层层 narrowing 导致的体操；
 * 类型边界由 onSave 出口处的 Partial<SceneScript> 收紧。
 */
const form = ref<any>(null)
const baseline = ref<string>('')

watch(
  () => props.scene,
  (s) => {
    if (s) initForm(s)
    else form.value = null
  },
  { immediate: true, deep: true },
)

function initForm(s: SceneScript): void {
  form.value = {
    location: s.location ?? '',
    locationType: s.locationType ?? 'interior',
    timeOfDay: s.timeOfDay ?? 'day',
    weather: s.weather ?? '',
    sceneDescription: s.sceneDescription ?? '',
    mood: s.mood ?? '',
    lighting: s.lighting ?? '',
    originalText: s.originalText ?? '',
    narration: s.narration ?? '',
    dialogues: (s.dialogues ?? []).map((d) => ({ ...d })),
    actions: (s.actions ?? []).map((a) => ({ ...a })),
  }
  baseline.value = JSON.stringify(form.value)
}

const isDirty = computed(() => {
  if (!form.value) return false
  return JSON.stringify(form.value) !== baseline.value
})

function onReset(): void {
  if (props.scene) initForm(props.scene)
}

async function onCancel(): Promise<void> {
  if (isDirty.value) {
    try {
      await ElMessageBox.confirm(
        '有未保存的修改，确定取消编辑？',
        '退出编辑',
        {
          type: 'warning',
          confirmButtonText: '丢弃修改',
          cancelButtonText: '继续编辑',
        },
      )
    } catch {
      return
    }
  }
  emit('cancel', sceneId.value)
}

function addDialogue(): void {
  form.value.dialogues.push({
    id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    characterId: '',
    characterName: '',
    text: '',
    emotion: '',
  } as Dialogue)
}

function addAction(): void {
  form.value.actions.push({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    characterId: '',
    description: '',
    timing: 'during',
  } as ActionDescription)
}

function onSave(): void {
  if (!form.value || !sceneId.value || !isDirty.value) return
  const payload: Partial<SceneScript> = {
    location: form.value.location?.trim() || '未命名地点',
    locationType: form.value.locationType,
    timeOfDay: form.value.timeOfDay,
    weather: form.value.weather || undefined,
    sceneDescription: form.value.sceneDescription ?? '',
    mood: form.value.mood ?? '',
    lighting: form.value.lighting || undefined,
    originalText: form.value.originalText ?? '',
    narration: form.value.narration ?? '',
    dialogues: form.value.dialogues.map((d: Dialogue) => ({
      ...d,
      text: (d.text ?? '').trim(),
    })),
    actions: form.value.actions.map((a: ActionDescription) => ({
      ...a,
      description: (a.description ?? '').trim(),
    })),
  }
  emit('save', sceneId.value, payload)
}

/**
 * AI 润色返回值回填到本地 form。父容器 polishScene 成功 → 通过 ref 调本方法。
 */
function applyPolishResult(patch: Partial<SceneScript>): void {
  if (!form.value) return
  if (typeof patch.sceneDescription === 'string') {
    form.value.sceneDescription = patch.sceneDescription
  }
  if (typeof patch.originalText === 'string') {
    form.value.originalText = patch.originalText
  }
  if (typeof patch.narration === 'string') {
    form.value.narration = patch.narration
  }
  if (Array.isArray(patch.dialogues)) {
    form.value.dialogues = patch.dialogues.map((d) => ({ ...d }))
  }
  if (Array.isArray(patch.actions)) {
    form.value.actions = patch.actions.map((a) => ({ ...a }))
  }
}

defineExpose({ applyPolishResult, sceneId })
</script>

<style scoped lang="scss">
.scene-inline-editor {
  padding: 8px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.save-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: all 0.2s;

  &.dirty {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning-dark-2);
  }
}

.dirty-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.save-actions {
  display: inline-flex;
  gap: 6px;
}

.editor-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 8px 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.section-hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.basic-form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.narrative-field {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.field-label {
  display: block;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 3px;
}

.empty-list {
  padding: 12px 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.line-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 6px 8px;
  margin-bottom: 6px;
  background: var(--el-fill-color-blank);
}

.line-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.line-index {
  font-weight: 600;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  min-width: 26px;
}

.speaker-input {
  width: 130px;
}

.emotion-input {
  width: 130px;
}

.timing-select {
  width: 110px;
}

.line-text {
  width: 100%;
}
</style>
