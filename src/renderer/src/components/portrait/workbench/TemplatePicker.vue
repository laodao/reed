<template>
  <div class="template-picker">
    <div class="picker-row">
      <el-select
        v-model="selectedId"
        :placeholder="placeholder"
        clearable
        style="flex: 1"
        @change="onSelect"
      >
        <el-option
          v-for="tpl in templates"
          :key="tpl.id"
          :label="tpl.name"
          :value="tpl.id"
        >
          <div class="tpl-option">
            <span class="tpl-name">{{ tpl.name }}</span>
            <span class="tpl-builtin">{{ tpl.builtin ? '内置' : '自定义' }}</span>
          </div>
        </el-option>
      </el-select>
      <el-button size="small" :disabled="!resolvedContent" @click="emitContent('replace')">套用</el-button>
      <el-button size="small" :disabled="!resolvedContent" @click="emitContent('append')">追加</el-button>
    </div>
    <!-- 联动预览：选中模板后实时显示解析占位符后的完整内容 -->
    <div v-if="resolvedContent" class="tpl-preview">{{ resolvedContent }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type {
  PortraitPromptTemplate,
  PromptTemplateCategory,
  PortraitGenerationScene,
  PortraitCharacter
} from '../../../../../shared/types/portrait.types'

/**
 * 模板选择器（spec 2026-07-24 D6）：
 * 下拉 + 套用（覆盖）/ 追加（拼接）；选中即解析占位符并 emit preview 供父级联动预览。
 */
const props = withDefaults(defineProps<{
  category?: PromptTemplateCategory
  scene: PortraitGenerationScene
  character?: PortraitCharacter | null
  placeholder?: string
}>(), {
  category: undefined,
  character: null,
  placeholder: '— 不使用模板 —'
})

const emit = defineEmits<{
  replace: [content: string]
  append: [content: string]
  preview: [content: string | null]
}>()

const templates = ref<PortraitPromptTemplate[]>([])
const selectedId = ref<string>('')
const resolvedContent = ref<string>('')

async function loadTemplates() {
  const result = await window.electronAPI.portrait.promptTemplate.list(props.category)
  if (result.success && result.data) {
    // 按适用场景过滤
    templates.value = (result.data as PortraitPromptTemplate[]).filter(t =>
      t.applyTo.includes(props.scene)
    )
  }
}

async function onSelect(id: string) {
  resolvedContent.value = ''
  emit('preview', null)
  if (!id) return

  // 占位符变量（来自角色信息）
  const vars: Record<string, string | number> = {}
  if (props.character) {
    vars.name = props.character.name
    vars.gender = props.character.gender
    vars.age = props.character.age
  }

  const result = await window.electronAPI.portrait.promptTemplate.apply(id, vars)
  if (result.success && result.data) {
    resolvedContent.value = result.data
    emit('preview', result.data)
  }
}

function emitContent(mode: 'replace' | 'append') {
  if (!resolvedContent.value) return
  emit(mode, resolvedContent.value)
}

onMounted(loadTemplates)

// 暴露刷新（模板库编辑后可重载）
defineExpose({ reload: loadTemplates })
</script>

<style lang="scss" scoped>
.template-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tpl-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  .tpl-name {
    font-size: 13px;
    color: var(--text-primary);
  }

  .tpl-builtin {
    font-size: 11px;
    color: var(--text-placeholder);
  }
}

.tpl-preview {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-regular);
  background: var(--fill-color-light);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  max-height: 120px;
  overflow-y: auto;
  border-left: 3px solid var(--color-purple);
}
</style>
