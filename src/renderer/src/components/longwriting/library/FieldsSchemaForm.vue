<template>
  <el-form label-width="90px" class="fields-schema-form">
    <el-form-item
      v-for="field in schema"
      :key="field.key"
      :label="field.label"
      :required="field.required"
    >
      <el-input
        v-if="field.type === 'text'"
        v-model="model[field.key]"
        :placeholder="`请输入${field.label}`"
      />
      <el-input
        v-else-if="field.type === 'textarea'"
        v-model="model[field.key]"
        type="textarea"
        :rows="3"
        :placeholder="`请输入${field.label}`"
      />
      <el-input-number
        v-else-if="field.type === 'number'"
        v-model="model[field.key]"
        :placeholder="`请输入${field.label}`"
        style="width: 100%"
      />
      <el-select
        v-else-if="field.type === 'select'"
        v-model="model[field.key]"
        :placeholder="`请选择${field.label}`"
        clearable
        style="width: 100%"
      >
        <el-option
          v-for="opt in field.options || []"
          :key="opt"
          :label="opt"
          :value="opt"
        />
      </el-select>
      <el-select
        v-else-if="field.type === 'tags'"
        v-model="model[field.key]"
        multiple
        filterable
        allow-create
        default-first-option
        placeholder="输入后回车添加"
        style="width: 100%"
      />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
/**
 * fields_schema 驱动动态表单（设定资产库 P0）
 * 世界观条目 / IP 角色的题材扩展字段共用——与 lw_bible_kinds.fields_schema 同构。
 */
import { computed } from 'vue'
import type { LibraryFieldSchemaItem } from '@shared/types/lw-library.types'

const props = defineProps<{
  schema: LibraryFieldSchemaItem[]
  modelValue: Record<string, unknown>
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>): void }>()

const model = computed<Record<string, unknown>>({
  get: () => props.modelValue ?? {},
  set: v => emit('update:modelValue', v),
})
</script>

<style scoped>
.fields-schema-form :deep(.el-form-item) {
  margin-bottom: 12px;
}
</style>
