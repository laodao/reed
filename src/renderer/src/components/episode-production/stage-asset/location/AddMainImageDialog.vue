<template>
  <!--
    地点添加主图 Dialog（spec 2026-05-09 多主图模型）

    - label：自由输入 + 预设建议下拉（平面图 / 正面外景 / 正面内景 / 鸟瞰 / 侧面 / 纵深）
    - 描述：附加 user direction 到 prompt
    - metadata（可选）：angle / time / weather 让该主图参与场景维度评分
    - 模式：✨ AI 生成 或 ⬆ 文件上传
    - 确认提交后调对应 IPC（addMain → 调 generateMainFor wrapper / 上传走 uploadMainFile + addImage 备用路径）
  -->
  <el-dialog
    v-model="visible"
    title="添加主图"
    width="540px"
    destroy-on-close
    append-to-body
    @close="reset"
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="主图用途（label，必填）">
        <el-select
          v-model="form.label"
          filterable
          allow-create
          default-first-option
          placeholder="选择预设或输入自定义（如：平面图 / 正面外景 / 鸟瞰）"
          class="full-width"
        >
          <el-option v-for="p in PRESETS" :key="p" :label="p" :value="p" />
        </el-select>
        <div class="dialog-hint">
          区分多张主图的标签；同一资产 label 不要重复
        </div>
      </el-form-item>
      <el-form-item label="附加描述（可选）">
        <el-input
          v-model="form.userPrompt"
          type="textarea"
          :rows="3"
          placeholder="如：白天平视角度 / 上方鸟瞰俯视 / 入口正对镜头"
          :maxlength="500"
          show-word-limit
          resize="none"
        />
      </el-form-item>
      <el-form-item label="评分维度 metadata（可选）">
        <div class="meta-row">
          <span class="meta-label">视角 (angle)</span>
          <el-input v-model="form.metaAngle" placeholder="wide_shot / entrance / front_yard ..." />
        </div>
        <div class="meta-row">
          <span class="meta-label">时间 (time)</span>
          <el-input v-model="form.metaTime" placeholder="morning / noon / night ..." />
        </div>
        <div class="meta-row">
          <span class="meta-label">天气 (weather)</span>
          <el-input v-model="form.metaWeather" placeholder="sunny / rainy / snowy ..." />
        </div>
        <div class="dialog-hint">
          填了维度的主图可被对应分镜直接命中，省一次派生（例：填 angle=entrance 后，"入口"分镜会优先选它）
        </div>
      </el-form-item>
      <el-form-item label="生成方式">
        <el-radio-group v-model="form.mode">
          <el-radio value="generate">✨ AI 生成</el-radio>
          <el-radio value="upload">⬆ 上传文件</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.mode === 'upload'">
        <el-upload
          :auto-upload="false"
          :show-file-list="true"
          :limit="1"
          :on-change="onFilePicked"
          :on-remove="onFileRemoved"
          accept="image/jpeg,image/png,image/webp"
        >
          <el-button>选择文件</el-button>
        </el-upload>
        <div class="dialog-hint">支持 jpeg / png / webp · 最大 20MB</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="onSubmit"
      >
        {{ form.mode === 'generate' ? '✨ 生成' : '⬆ 上传' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'

const PRESETS = ['平面图', '正面外景', '正面内景', '鸟瞰', '侧面', '纵深', '入口']

const props = defineProps<{
  modelValue: boolean
  /** 第一次为该资产添加主图时为 true（写入时 makeDefault=true）；之后为 false */
  isFirstMain: boolean
  /** 资产 binding 信息 — submit 时透传到 IPC */
  assetType: 'character' | 'location' | 'item'
  bindingId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  /** 生成 / 上传成功后通知父组件 reload 图谱列表 */
  'submitted': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

interface FormState {
  label: string
  userPrompt: string
  metaAngle: string
  metaTime: string
  metaWeather: string
  mode: 'generate' | 'upload'
  pickedFile: File | null
}

const form = reactive<FormState>({
  label: '',
  userPrompt: '',
  metaAngle: '',
  metaTime: '',
  metaWeather: '',
  mode: 'generate',
  pickedFile: null,
})

const submitting = ref(false)

watch(visible, (v) => {
  if (v) reset()
})

function reset(): void {
  form.label = ''
  form.userPrompt = ''
  form.metaAngle = ''
  form.metaTime = ''
  form.metaWeather = ''
  form.mode = 'generate'
  form.pickedFile = null
  submitting.value = false
}

function onFilePicked(file: UploadFile): void {
  form.pickedFile = (file.raw as File) ?? null
}

function onFileRemoved(): void {
  form.pickedFile = null
}

const canSubmit = computed(() => {
  if (!form.label.trim()) return false
  if (form.mode === 'upload') return form.pickedFile !== null
  return true // generate 模式：label 有就够（描述非必填，prompt 由 effective 拼）
})

function buildMetadata(): Record<string, string> | undefined {
  const meta: Record<string, string> = {}
  if (form.metaAngle.trim()) meta.angle = form.metaAngle.trim()
  if (form.metaTime.trim()) meta.time = form.metaTime.trim()
  if (form.metaWeather.trim()) meta.weather = form.metaWeather.trim()
  return Object.keys(meta).length > 0 ? meta : undefined
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.image?.addMain) {
      ElMessage.error('image.addMain IPC 未暴露')
      return
    }
    if (form.mode === 'generate') {
      // 复用 effective → prompt 拼装：直接走 generateMainFor 风格的 IPC（addMain），prompt 由后端 effective 投影
      // 这里需要传 prompt，但 addMain 后端期待完整 prompt。先简单实现：调 effective 拼最少 label-only prompt + userPrompt
      // 完整 prompt 拼装通过 main-image-generator client 来做，避免重复逻辑
      const promptResult = await buildPrompt()
      const resp = await api.image.addMain({
        assetType: props.assetType,
        assetId: props.bindingId,
        prompt: appendUserPrompt(promptResult.prompt, form.userPrompt),
        negativePrompt: promptResult.negativePrompt,
        referenceImagePath: promptResult.referenceImagePath ?? null,
        label: form.label.trim(),
        makeDefault: props.isFirstMain,
        metadata: buildMetadata(),
      })
      if (!resp?.success) {
        ElMessage.error(resp?.error || '生成主图失败')
        return
      }
      ElMessage.success('主图已生成')
    } else {
      // 上传分支：先把文件 base64 → 先 uploadMainFile 走默认主图替换路径
      // 这条路径会走 setAsMain 把旧主图降为 view（与多主图模型不兼容）
      // 当前最小实现：上传后立刻调 switchMain（如非 first），保留原主图为 main+isMain=0
      // 注：上传完美方案需要新建独立 upload-additional-main IPC；本次先以"AI 生成"为主路径
      ElMessage.warning('上传方式暂未接入多主图模型；当前请使用 ✨ AI 生成')
      return
    }
    emit('submitted')
    visible.value = false
  } catch (e: any) {
    ElMessage.error('提交失败：' + (e?.message ?? '未知错误'))
  } finally {
    submitting.value = false
  }
}

/** 轻量 prompt 拼装：调 effective 拿基础描述，与 AddMainImageDialog 自身的 user prompt 拼接 */
async function buildPrompt(): Promise<{
  prompt: string
  negativePrompt?: string
  referenceImagePath?: string | null
}> {
  const root = (window as any).electronAPI?.episodeProduction?.asset
  if (!root) throw new Error('asset API 未暴露')
  const resp =
    props.assetType === 'character'
      ? await root.character.effective(props.bindingId)
      : props.assetType === 'location'
        ? await root.location.effective(props.bindingId)
        : await root.item.effective(props.bindingId)
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || '加载 effective 失败')
  }
  const eff = resp.data as Record<string, any>
  const parts: string[] = []
  if (eff.name) parts.push(String(eff.name))
  if (eff.description) parts.push(String(eff.description))
  // label 自身作为 prompt 一部分：让 AI 根据"平面图"/"正面外景"区分
  parts.push(`视角：${form.label}`)
  return {
    prompt: parts.filter(Boolean).join('，'),
    referenceImagePath: eff.referenceImagePath ?? null,
  }
}

function appendUserPrompt(base: string, extra: string): string {
  const e = extra.trim()
  if (!e) return base
  return `${base}，${e}`
}
</script>

<style scoped>
.full-width {
  width: 100%;
}

.dialog-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.meta-label {
  flex: 0 0 100px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
