<template>
  <!--
    CharacterCardFormV2 · 角色设定卡（spec 2026-05-08 v3 简化）

    spec 2026-05-08 v3 修订：原型里"外貌 + 服装（默认 + 备选）"两节合并为单一
    "人物描述"自由文本（落到 appearance / overrideAppearance / standaloneDescription
    同一字段位）。outfit / outfitsExtra 字段在 entity 上仍保留兼容旧数据，但 UI 不再
    暴露——新写入永远是空，prompt builder 见空就跳过。

    现在的 section：
      ① 身份（姓名 / 别名 / 定位 / 性别 / 年龄 / 人种）
      ② 人物描述（外貌 + 服装 + 任何其他描述合并的自由文本）
      ③ 风格（styleAnchors 多选）
      ④ 声音（音色 — 语速 / 音调 / 情感按场景在分镜阶段配置）
      ⑤ 形象库 portrait_id 绑定

    每个字段独立 onChange → emit('change', { key, value, dirty })，
    父组件 EditorV2 收集成 patch 一次性提交（按 IPC 类型分发）。
  -->
  <div class="card-form-v2">
    <h3 class="form-title">📋 设定卡</h3>

    <!-- ① 身份 -->
    <section class="form-section">
      <div class="section-label">身份</div>
      <el-form label-width="60px" size="small" label-position="left">
        <el-form-item label="姓名">
          <el-input
            v-model="form.name"
            :placeholder="isLw ? '空 = 用长文姓名' : '请输入姓名'"
            @input="onChange('name', form.name, form.name !== initial.name)"
          />
        </el-form-item>
        <el-form-item label="别名">
          <el-input
            v-model="form.alias"
            placeholder="如：三爷 / 浪剑客（多个用 / 分隔）"
            @input="onChange('alias', form.alias, form.alias !== initial.alias)"
          />
        </el-form-item>
        <el-form-item label="定位">
          <el-select
            v-model="form.role"
            placeholder="选择定位"
            clearable
            @change="onChange('role', form.role, form.role !== initial.role)"
          >
            <el-option label="主角" value="主角" />
            <el-option label="配角" value="配角" />
            <el-option label="反派" value="反派" />
            <el-option label="旁白" value="旁白" />
            <el-option label="群演" value="群演" />
          </el-select>
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group
            v-model="form.gender"
            @change="onChange('gender', form.gender, form.gender !== initial.gender)"
          >
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
            <el-radio value="其他">其他</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="年龄">
          <el-input-number
            v-model="form.age"
            :min="0"
            :max="200"
            :placeholder="undefined"
            @change="onChange('age', form.age, form.age !== initial.age)"
          />
        </el-form-item>
        <el-form-item label="人种">
          <el-input
            v-model="form.race"
            placeholder="如：东亚 / 欧洲 / 半人马 / 自定义种族"
            clearable
            class="full-width"
            @input="onChange('race', form.race, form.race !== initial.race)"
            @clear="onChange('race', null, initial.race !== null)"
          />
        </el-form-item>
      </el-form>
    </section>

    <!-- ② 人物描述（外貌 + 服装 + 其他描述合并；落 appearance / overrideAppearance / standaloneDescription） -->
    <section class="form-section">
      <div class="section-label">
        人物描述
        <span v-if="isLw" class="lw-hint">基础值来自长文</span>
      </div>
      <el-input
        v-model="form.appearance"
        type="textarea"
        :rows="6"
        :placeholder="
          isLw
            ? '留空 = 用长文描述；填写 = override（仅本剧集生效）。可包含外貌（身高/五官/发型/眼色/标志特征）+ 服装（默认 / 备选）+ 任何其他描述。'
            : '可包含外貌（身高 · 身材 · 五官 · 发型 · 眼色 · 标志特征）+ 服装（默认 / 备选）+ 性格 / 标签 等任何描述。'
        "
        @input="onChange('appearance', form.appearance, form.appearance !== initial.appearance)"
      />
    </section>

    <!-- ③ 风格 -->
    <section class="form-section">
      <div class="section-label">风格</div>
      <el-form label-width="60px" size="small" label-position="left">
        <el-form-item label="风格">
          <el-select
            v-model="form.styleAnchors"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入主流风格（多选；按回车自定义）"
            class="full-width"
            @change="onChange('styleAnchors', form.styleAnchors, !arraysEqual(form.styleAnchors, initial.styleAnchors))"
          >
            <el-option v-for="s in STYLE_PRESETS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <p class="section-note">主流风格（卡通 / 二次元 / 写实 等）会作为 prompt 锚点，影响主图与所有派生图的整体观感。</p>
      </el-form>
    </section>

    <!-- ④ 声音 -->
    <section class="form-section">
      <div class="section-label">声音</div>
      <el-form label-width="60px" size="small" label-position="left">
        <el-form-item label="音色">
          <el-select
            v-model="form.voiceId"
            placeholder="选择音色"
            clearable
            class="full-width"
            @change="onChange('voiceId', form.voiceId, form.voiceId !== initial.voiceId)"
          >
            <el-option
              v-for="v in availableVoices"
              :key="v.id"
              :label="v.name"
              :value="v.id"
            />
          </el-select>
        </el-form-item>
        <p class="section-note">
          语速 / 音调 / 情感按场景在分镜阶段配置 — 同一角色不同场景可不同。
        </p>
      </el-form>
    </section>

    <!-- ⑤ 形象库 portrait_id -->
    <section class="form-section">
      <div class="section-label">形象库</div>
      <div class="portrait-row">
        <el-tag v-if="form.portraitId" type="info" size="small">
          已绑定 portrait: {{ form.portraitId }}
        </el-tag>
        <span v-else class="hint-tertiary">未绑定 — 主图由本剧集独立生成</span>
        <el-button
          size="small"
          @click="onSelectPortrait"
        >
          {{ form.portraitId ? '更换' : '选择' }} portrait
        </el-button>
        <el-button
          v-if="form.portraitId"
          size="small"
          type="danger"
          plain
          @click="onClearPortrait"
        >
          解绑
        </el-button>
      </div>
    </section>

    <!-- ⑥ 参考图（spec 2026-05-09）— 主图生成时作为 AI reference -->
    <section class="form-section last">
      <ReferenceImageField
        asset-type="character"
        :binding-id="binding?.id"
        :model-value="form.referenceImagePath"
        @update:model-value="onReferenceImageChange"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { STYLE_PRESETS } from '@core/modules/episode-production/assets/constants/style-presets'
import ReferenceImageField from '../shared/ReferenceImageField.vue'

export interface FormChangePayload {
  key: string
  value: any
  dirty: boolean
}

const props = defineProps<{
  binding: any
}>()

const emit = defineEmits<{
  (e: 'change', payload: FormChangePayload): void
}>()

const isLw = computed(() => props.binding?.sourceType === 'linked_lw')

// spec 2026-05-08 v3：UI 不再暴露 outfit / outfitsExtra；entity 上的旧字段保持向后兼容
// 但本表单不读、不写、不 emit 这两 key（旧数据 prompt builder 见空就跳过）。
const form = reactive<{
  name: string
  alias: string
  role: string | null
  gender: string | null
  age: number | null
  race: string | null
  appearance: string
  voiceId: string | null
  voiceSpeed: number
  voicePitch: number
  voiceEmotion: string | null
  styleAnchors: string[]
  portraitId: string | null
  /** spec 2026-05-09：用户上传的参考图相对路径（主图生成 reference） */
  referenceImagePath: string | null
}>({
  name: '',
  alias: '',
  role: null,
  gender: null,
  age: null,
  race: null,
  appearance: '',
  voiceId: null,
  voiceSpeed: 1.0,
  voicePitch: 0,
  voiceEmotion: null,
  styleAnchors: [],
  portraitId: null,
  referenceImagePath: null,
})

// 旧版 RACE_OPTIONS 已移除（spec 2026-05-08 v5：人种改为自由输入）。
// 旧英文 key（east_asian 等）的老数据由 main-image-generator.describeCharacterRace 兼容翻译。

const initial = ref<any>({})

const availableVoices = ref<Array<{ id: string; name: string }>>([])

watch(
  () => props.binding,
  (b) => {
    if (!b) return
    const isLwBinding = b.sourceType === 'linked_lw'
    form.name = (isLwBinding ? b.overrideName : b.standaloneName) ?? ''
    form.alias = b.alias ?? ''
    form.role = b.role ?? null
    form.gender = b.gender ?? null
    form.age = b.age ?? null
    form.race = b.race ?? null
    form.appearance =
      (isLwBinding ? b.overrideAppearance : b.standaloneDescription) ?? ''
    form.voiceId = b.voiceId ?? null
    form.voiceSpeed = b.voiceSpeed ?? 1.0
    form.voicePitch = b.voicePitch ?? 0
    form.voiceEmotion = b.voiceEmotion ?? null
    form.styleAnchors = parseJsonArray(b.styleAnchors)
    form.portraitId = b.portraitId ?? null
    form.referenceImagePath = b.referenceImagePath ?? null
    initial.value = { ...form, styleAnchors: [...form.styleAnchors] }
  },
  { immediate: true, deep: true },
)

onMounted(async () => {
  try {
    const resp = await window.electronAPI.episodeProduction.asset.voice.listReady()
    if (resp?.success && Array.isArray(resp.data)) {
      availableVoices.value = resp.data.map((v: any) => ({ id: v.id, name: v.name }))
    }
  } catch (e) {
    console.warn('[CharacterCardFormV2] 加载音色列表失败', e)
  }
})

function onChange(key: string, value: any, dirty: boolean): void {
  emit('change', { key, value, dirty })
}

function onSelectPortrait(): void {
  ElMessage.info('选择 portrait 入口 — 留 follow-up 接 portrait picker')
}

function onClearPortrait(): void {
  form.portraitId = null
  onChange('portraitId', null, initial.value.portraitId !== null)
}

/**
 * 参考图上传 / 清除完成回调：
 * 子组件已通过 setReferenceImage IPC 直接落库，这里只把本地 form 同步上，
 * 并 emit 一个 change 给父组件做必要刷新（不需要再二次走 patch 流程）。
 */
function onReferenceImageChange(newPath: string | null): void {
  form.referenceImagePath = newPath
  // dirty=false：已立即落库，没有"待保存"语义
  emit('change', { key: 'referenceImagePath', value: newPath, dirty: false })
}

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
</script>

<style scoped lang="scss">
.card-form-v2 {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.form-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.form-section {
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);

  &:first-of-type {
    padding-top: 0;
    border-top: none;
  }

  &.last {
    padding-bottom: 4px;
  }
}

.section-label {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  letter-spacing: 0.05em;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.lw-hint {
  font-size: 10px;
  color: var(--el-color-primary);
}

.section-note {
  margin: 4px 0 0 60px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
}

.full-width {
  width: 100%;
}

.suffix-x {
  margin-left: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.portrait-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.hint-tertiary {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
</style>
