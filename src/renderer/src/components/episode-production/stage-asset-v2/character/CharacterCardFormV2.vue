<template>
  <!--
    CharacterCardFormV2 · 角色设定卡（FU5-C2 / 原型 §4.C 6 节）

    严格按对照表 §4 cell 表 6 节实施：
      ① 身份（姓名 / 别名 / 定位 / 性别 / 年龄）
      ② 外貌（自由文字 + 来自长文 hint + 添加 override）
      ③ 服装（默认 + 备选数组）
      ④ 声音（音色 + 试听 / 语速 / 音调 / 情感）
      ⑤ 风格锚点（tags 数组）
      ⑥ 形象库 portrait_id 绑定

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
      </el-form>
    </section>

    <!-- ② 外貌 -->
    <section class="form-section">
      <div class="section-label">
        外貌
        <span v-if="isLw" class="lw-hint">基础值来自长文</span>
      </div>
      <el-input
        v-model="form.appearance"
        type="textarea"
        :rows="3"
        :placeholder="
          isLw
            ? '留空 = 用长文外貌；填写 = override（仅本剧集生效）'
            : '身高 · 身材 · 五官 · 发型 · 眼色 · 标志特征…'
        "
        @input="onChange('appearance', form.appearance, form.appearance !== initial.appearance)"
      />
    </section>

    <!-- ③ 服装 -->
    <section class="form-section">
      <div class="section-label">服装</div>
      <el-form label-width="60px" size="small" label-position="left">
        <el-form-item label="默认">
          <el-input
            v-model="form.outfit"
            placeholder="如：玄色长袍 + 玉冠 + 腰佩长剑"
            @input="onChange('outfit', form.outfit, form.outfit !== initial.outfit)"
          />
        </el-form-item>
        <el-form-item label="备选">
          <el-select
            v-model="form.outfitsExtra"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="可输入多个备选服装（按回车）"
            class="full-width"
            @change="onChange('outfitsExtra', form.outfitsExtra, !arraysEqual(form.outfitsExtra, initial.outfitsExtra))"
          />
        </el-form-item>
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
        <el-form-item label="语速">
          <el-input-number
            v-model="form.voiceSpeed"
            :min="0.5"
            :max="2.0"
            :step="0.1"
            @change="onChange('voiceSpeed', form.voiceSpeed, form.voiceSpeed !== initial.voiceSpeed)"
          />
          <span class="suffix-x">x</span>
        </el-form-item>
        <el-form-item label="音调">
          <el-input-number
            v-model="form.voicePitch"
            :min="-12"
            :max="12"
            :step="1"
            @change="onChange('voicePitch', form.voicePitch, form.voicePitch !== initial.voicePitch)"
          />
        </el-form-item>
        <el-form-item label="情感">
          <el-select
            v-model="form.voiceEmotion"
            placeholder="选择情感"
            clearable
            class="full-width"
            @change="onChange('voiceEmotion', form.voiceEmotion, form.voiceEmotion !== initial.voiceEmotion)"
          >
            <el-option label="neutral 中性" value="neutral" />
            <el-option label="angry 愤怒" value="angry" />
            <el-option label="happy 开心" value="happy" />
            <el-option label="sad 悲伤" value="sad" />
            <el-option label="surprised 惊讶" value="surprised" />
            <el-option label="confused 困惑" value="confused" />
          </el-select>
        </el-form-item>
      </el-form>
    </section>

    <!-- ⑤ 风格锚点 -->
    <section class="form-section">
      <div class="section-label">风格锚点</div>
      <el-select
        v-model="form.styleAnchors"
        multiple
        filterable
        allow-create
        default-first-option
        placeholder="如：工笔国风 / 水墨 / 微写实（按回车添加）"
        class="full-width"
        @change="onChange('styleAnchors', form.styleAnchors, !arraysEqual(form.styleAnchors, initial.styleAnchors))"
      />
    </section>

    <!-- ⑥ 形象库 portrait_id -->
    <section class="form-section last">
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
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

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

const form = reactive<{
  name: string
  alias: string
  role: string | null
  gender: string | null
  age: number | null
  appearance: string
  outfit: string
  outfitsExtra: string[]
  voiceId: string | null
  voiceSpeed: number
  voicePitch: number
  voiceEmotion: string | null
  styleAnchors: string[]
  portraitId: string | null
}>({
  name: '',
  alias: '',
  role: null,
  gender: null,
  age: null,
  appearance: '',
  outfit: '',
  outfitsExtra: [],
  voiceId: null,
  voiceSpeed: 1.0,
  voicePitch: 0,
  voiceEmotion: null,
  styleAnchors: [],
  portraitId: null,
})

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
    form.appearance =
      (isLwBinding ? b.overrideAppearance : b.standaloneDescription) ?? ''
    form.outfit = b.overrideOutfit ?? ''
    form.outfitsExtra = parseJsonArray(b.outfitsExtra)
    form.voiceId = b.voiceId ?? null
    form.voiceSpeed = b.voiceSpeed ?? 1.0
    form.voicePitch = b.voicePitch ?? 0
    form.voiceEmotion = b.voiceEmotion ?? null
    form.styleAnchors = parseJsonArray(b.styleAnchors)
    form.portraitId = b.portraitId ?? null
    initial.value = { ...form, outfitsExtra: [...form.outfitsExtra], styleAnchors: [...form.styleAnchors] }
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
