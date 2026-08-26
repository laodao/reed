<template>
  <!--
    新增正面全身（换装）对话框
    允许输入换装提示词 + 上传换装参考图；生成时以第一张主图为面容基准（reference），
    叠加用户上传的参考图与提示词，生成新的正面全身图（成为默认，不覆盖旧主图）。
  -->
  <el-dialog
    v-model="visible"
    title="新增正面全身（换装）"
    width="520px"
    destroy-on-close
    append-to-body
    @close="reset"
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="换装描述（提示词）">
        <el-input
          v-model="form.prompt"
          type="textarea"
          :rows="4"
          placeholder="描述新的造型 / 服饰，如：身穿红色绣花长裙，头戴金步摇…（留空则按资产设定生成）"
          :maxlength="800"
          show-word-limit
          resize="none"
        />
        <div class="dialog-hint">将以第一张正面全身图的面容/发型为基准，仅按描述更换造型</div>
      </el-form-item>

      <el-form-item label="换装参考图（可选）">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          :limit="1"
          accept="image/jpeg,image/png,image/webp"
          :on-change="onFilePicked"
        >
          <el-button :loading="uploading">
            <el-icon><Upload /></el-icon>
            {{ form.refPath ? '更换参考图' : '上传参考图' }}
          </el-button>
        </el-upload>
        <div v-if="form.refPath" class="ref-preview">
          <img :src="toImageUrl(form.refPath)" alt="参考图" class="ref-thumb" />
          <span class="dialog-hint">已上传，将作为生成参考</span>
        </div>
        <div v-else class="dialog-hint">支持 jpeg / png / webp · 最大 20MB</div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">
        ✨ 生成换装主图
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'
import { buildMainImagePrompt } from '@/api/main-image-generator'

const props = defineProps<{
  modelValue: boolean
  assetType: 'character' | 'location' | 'item'
  assetId: string
  /** 第一张主图的相对路径（作面容/形象基准） */
  firstMainPath: string | null
  /** 已有主图数量（用于生成"换装N"标签） */
  mainCount: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'submitted'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = reactive<{ prompt: string; refPath: string }>({ prompt: '', refPath: '' })
const uploading = ref(false)
const submitting = ref(false)

watch(visible, (v) => { if (v) reset() })

function reset(): void {
  form.prompt = ''
  form.refPath = ''
  uploading.value = false
  submitting.value = false
}

async function onFilePicked(file: UploadFile): Promise<void> {
  const raw = file.raw as File | undefined
  if (!raw) return
  if (!raw.type.startsWith('image/')) { ElMessage.warning('请选择图片文件'); return }
  if (raw.size > 20 * 1024 * 1024) { ElMessage.warning('图片过大（>20MB）'); return }
  uploading.value = true
  try {
    const base64 = await readAsBase64(raw)
    const api = (window as any).electronAPI?.episodeProduction?.asset
    const resp = await api?.image?.uploadReference({ fileName: raw.name, base64 })
    if (!resp?.success) { ElMessage.error(resp?.error || '上传参考图失败'); return }
    form.refPath = (resp.data?.path as string) ?? ''
    ElMessage.success('参考图已上传')
  } catch (e: any) {
    ElMessage.error('上传失败：' + (e?.message ?? '未知错误'))
  } finally {
    uploading.value = false
  }
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.image?.addMain) { ElMessage.error('addMain IPC 未暴露'); return }
    // 换装 prompt：用户描述优先，未编辑用系统拼接；均补 fullBody/年代约束
    const { prompt, negativePrompt } = await buildMainImagePrompt(
      props.assetType,
      props.assetId,
      { promptOverride: form.prompt.trim() || undefined },
    )
    // 参考图：第一张主图（面容基准）+ 用户上传的换装参考图
    const refs = [props.firstMainPath, form.refPath || null].filter((p): p is string => !!p)
    const label = `换装${props.mainCount + 1}`
    const resp = await api.image.addMain({
      assetType: props.assetType,
      assetId: props.assetId,
      prompt,
      negativePrompt: negativePrompt ?? undefined,
      referenceImagePaths: refs.length > 0 ? refs : undefined,
      label,
      makeDefault: true,
    })
    if (!resp?.success) { ElMessage.error(resp?.error || '生成失败'); return }
    ElMessage.success(`已新增正面全身（${label}）`)
    emit('submitted')
    visible.value = false
  } catch (e: any) {
    ElMessage.error('生成失败：' + (e?.message ?? '未知错误'))
  } finally {
    submitting.value = false
  }
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const idx = result.indexOf('base64,')
      resolve(idx >= 0 ? result.slice(idx + 7) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失败'))
    reader.readAsDataURL(file)
  })
}
</script>

<style scoped>
.dialog-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}
.ref-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.ref-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
}
</style>
