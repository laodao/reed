<template>
  <el-dialog v-model="visible" title="新建剧集项目" width="560px" :close-on-click-modal="false">
    <el-form :model="form" label-width="96px">
      <el-form-item label="项目名称" required>
        <el-input v-model="form.name" placeholder="请输入项目名称" />
      </el-form-item>
      <el-form-item label="关联长文">
        <el-select
          v-model="form.longWritingProjectId"
          placeholder="可选 — 关联后剧集可用长文实体作 linked_lw"
          clearable
          style="width: 100%"
        >
          <el-option v-for="lw in longWritingProjects" :key="lw.id" :label="lw.name" :value="lw.id" />
        </el-select>
      </el-form-item>
      <el-divider content-position="left">视频配置</el-divider>
      <el-form-item label="画幅比例">
        <el-select v-model="form.config.aspectRatio" style="width: 100%">
          <el-option label="16:9 横屏" value="16:9" />
          <el-option label="9:16 竖屏" value="9:16" />
          <el-option label="4:3 标准" value="4:3" />
          <el-option label="1:1 方形" value="1:1" />
        </el-select>
      </el-form-item>
      <el-form-item label="分辨率">
        <el-select v-model="form.config.resolution" style="width: 100%">
          <el-option label="4K (3840×2160)" :value="2160" />
          <el-option label="2K (2560×1440)" :value="1440" />
          <el-option label="Full HD (1920×1080)" :value="1080" />
          <el-option label="HD (1280×720)" :value="720" />
        </el-select>
      </el-form-item>
      <el-form-item label="帧率">
        <el-select v-model="form.config.fps" style="width: 100%">
          <el-option label="24 fps（电影）" :value="24" />
          <el-option label="30 fps（标准）" :value="30" />
          <el-option label="60 fps（高帧率）" :value="60" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!form.name.trim()" :loading="creating" @click="onCreate">
        创建
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * M1 首页 · 新建项目弹窗（与现有 create 字段对齐：name + longWritingProjectId + config）。
 */
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'created', project: { id: string }): void
}>()

const creating = ref(false)
const longWritingProjects = ref<Array<{ id: string; name: string }>>([])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const defaultConfig = () => ({
  aspectRatio: '16:9' as string,
  resolution: 1080 as number,
  fps: 30 as number,
  styleAnchors: [] as string[],
})

const form = ref({
  name: '',
  longWritingProjectId: '',
  config: defaultConfig(),
})

watch(() => props.modelValue, (v) => {
  if (v) {
    form.value = { name: '', longWritingProjectId: '', config: defaultConfig() }
    void loadLongWriting()
  }
})

async function loadLongWriting(): Promise<void> {
  try {
    const anyWin = window as any
    const api = anyWin.electronAPI?.longwriting
    if (!api) { longWritingProjects.value = []; return }
    const r = await api.getProjects()
    if (r?.success) {
      longWritingProjects.value = r.data?.map((p: any) => ({ id: p.id, name: p.name })) || []
    } else {
      longWritingProjects.value = []
    }
  } catch {
    longWritingProjects.value = []
  }
}

async function onCreate(): Promise<void> {
  if (!form.value.name.trim() || creating.value) return
  creating.value = true
  try {
    const config = JSON.parse(JSON.stringify(form.value.config))
    const resp = await window.electronAPI.episodeProduction.createProject(
      form.value.name.trim(),
      form.value.longWritingProjectId || undefined,
      config,
    )
    if (!resp.success || !resp.data) {
      ElMessage.error(resp.error || '创建失败')
      return
    }
    ElMessage.success('项目已创建')
    emit('created', { id: resp.data.id })
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    creating.value = false
  }
}
</script>

<style lang="scss" scoped>
:deep(.el-divider__text) { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
