<template>
  <el-dialog
    :model-value="modelValue"
    :title="template ? '编辑模板' : '新建模板'"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form :model="form" label-position="top">
      <el-form-item label="模板名称" required>
        <el-input v-model="form.name" placeholder="如：我的古装侠客 · 全身" />
      </el-form-item>

      <el-form-item label="分类" required>
        <el-select v-model="form.category" style="width: 100%">
          <el-option
            v-for="(label, key) in PROMPT_TEMPLATE_CATEGORY_LABELS"
            :key="key"
            :label="label"
            :value="key"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="适用场景（至少选 1 项）" required>
        <el-checkbox-group v-model="form.applyTo">
          <el-checkbox value="generate">首次生成</el-checkbox>
          <el-checkbox value="regenerate">重新生成</el-checkbox>
          <el-checkbox value="face">修改面部</el-checkbox>
          <el-checkbox value="clothes">换衣</el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="模板正文" required>
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="6"
          placeholder="提示词正文，建议英文..."
        />
        <div class="placeholder-hint">
          支持占位符，套用时自动替换为角色信息：
          <code>{name}</code> 姓名 · <code>{gender}</code> 性别 · <code>{age}</code> 年龄
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!canSubmit" @click="handleSubmit">
        {{ template ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { PROMPT_TEMPLATE_CATEGORY_LABELS } from '../../../../../shared/types/portrait.types'
import type {
  PortraitPromptTemplate,
  PromptTemplateCategory,
  PortraitGenerationScene
} from '../../../../../shared/types/portrait.types'

/**
 * 模板新建/编辑对话框（plan B3）：
 * 不传 template = 新建；传 = 编辑（内置模板由调用方拦截，不会到这里）。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  template?: PortraitPromptTemplate | null
}>(), {
  template: null
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const form = ref({
  name: '',
  category: 'face' as PromptTemplateCategory,
  applyTo: ['generate'] as PortraitGenerationScene[],
  content: ''
})
const saving = ref(false)

const canSubmit = computed(() =>
  form.value.name.trim() !== '' &&
  form.value.content.trim() !== '' &&
  form.value.applyTo.length > 0
)

watch(() => props.modelValue, (open) => {
  if (!open) return
  if (props.template) {
    form.value = {
      name: props.template.name,
      category: props.template.category,
      applyTo: [...props.template.applyTo],
      content: props.template.content
    }
  } else {
    form.value = { name: '', category: 'face', applyTo: ['generate'], content: '' }
  }
})

async function handleSubmit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    const result = await window.electronAPI.portrait.promptTemplate.save({
      id: props.template?.id,
      name: form.value.name.trim(),
      category: form.value.category,
      content: form.value.content.trim(),
      applyTo: [...form.value.applyTo]
    })
    if (result.success) {
      ElMessage.success(props.template ? '保存成功' : '创建成功')
      emit('update:modelValue', false)
      emit('saved')
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.placeholder-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--color-purple-light-9);
  border-radius: var(--radius-sm);
  padding: 8px 12px;

  code {
    color: var(--color-purple);
    font-weight: 600;
  }
}
</style>
