<template>
  <!--
    ManualAddEntityDialog · 手动添加 / 编辑识别要素（FU5-B2）

    给 ① 内容 stage 用：用户主动新增 AI 没识别到的 entity，或编辑已有 entity。
    字段按 kind 区分：
      character — name / role / description
      location  — name / type / description
      item      — name / type / description

    提交时 emit('confirm', payload)，父组件决定 push 到 uploadedX 还是 splice 替换。
  -->
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      label-position="right"
    >
      <el-form-item label="名称" prop="name" required>
        <el-input v-model="form.name" :placeholder="namePlaceholder" />
      </el-form-item>

      <el-form-item :label="subFieldLabel" :prop="subFieldKey">
        <el-input
          v-model="form[subFieldKey]"
          :placeholder="subFieldPlaceholder"
        />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          :placeholder="`简要描述这个${kindLabel}（可选）`"
        />
      </el-form-item>

      <el-form-item label="来源">
        <el-radio-group v-model="form.sourceType">
          <el-radio value="standalone">standalone（剧集独立）</el-radio>
          <el-radio value="linked_lw" disabled>
            linked_lw（picker 留 follow-up）
          </el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="onSubmit">
        {{ initial?.id ? '保存' : '添加' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

type Kind = 'character' | 'location' | 'item'

const props = defineProps<{
  modelValue: boolean
  kind: Kind
  initial?: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', payload: Record<string, any>): void
}>()

const formRef = ref<FormInstance | null>(null)

const form = reactive<Record<string, any>>({
  id: undefined,
  name: '',
  role: '',
  type: '',
  description: '',
  sourceType: 'standalone',
  confirmed: true,
})

watch(
  () => [props.modelValue, props.kind, props.initial],
  () => {
    if (props.modelValue) {
      form.id = props.initial?.id
      form.name = props.initial?.name ?? ''
      form.role = props.initial?.role ?? ''
      form.type = props.initial?.type ?? ''
      form.description = props.initial?.description ?? ''
      form.sourceType = props.initial?.sourceType ?? 'standalone'
      form.confirmed = props.initial?.confirmed ?? true
    }
  },
  { immediate: true, deep: true },
)

const kindLabel = computed(() =>
  props.kind === 'character' ? '角色' : props.kind === 'location' ? '地点' : '物品',
)

const dialogTitle = computed(() => {
  const action = props.initial?.id ? '编辑' : '手动添加'
  return `${action}${kindLabel.value}`
})

const namePlaceholder = computed(() => {
  if (props.kind === 'character') return '如：张三 / 老板娘'
  if (props.kind === 'location') return '如：茶馆 / 客栈'
  return '如：折扇 / 长剑'
})

const subFieldKey = computed(() => (props.kind === 'character' ? 'role' : 'type'))
const subFieldLabel = computed(() =>
  props.kind === 'character' ? '定位' : props.kind === 'location' ? '场景类型' : '物品类型',
)
const subFieldPlaceholder = computed(() => {
  if (props.kind === 'character') return '如：主角 / 配角 / 反派（可选）'
  if (props.kind === 'location') return '如：内景 / 外景 / 街市（可选）'
  return '如：道具 / 武器 / 信物（可选）'
})

const rules: FormRules = {
  name: [{ required: true, message: '名称必填', trigger: 'blur' }],
}

async function onSubmit(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  // 只把对应 kind 的子字段拷贝出去（character→role, others→type）
  const payload: Record<string, any> = {
    id: form.id,
    name: form.name.trim(),
    description: form.description?.trim() || undefined,
    sourceType: form.sourceType,
    confirmed: form.confirmed,
  }
  if (props.kind === 'character') {
    payload.role = form.role?.trim() || undefined
  } else {
    payload.type = form.type?.trim() || undefined
  }
  emit('confirm', payload)
}
</script>
