<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="创建人物形象"
    width="650px"
    :close-on-click-modal="false"
    :append-to-body="false"
    :modal-append-to-body="false"
    center
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
    >
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" placeholder="请输入人物姓名" />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="性别" prop="gender">
            <el-radio-group v-model="form.gender">
              <el-radio value="male">男</el-radio>
              <el-radio value="female">女</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="人种" prop="race">
            <el-select v-model="form.race" placeholder="请选择人种" style="width: 100%;">
              <el-option label="亚洲人" value="asian" />
              <el-option label="欧洲人" value="european" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="年龄" prop="age">
            <el-input-number v-model="form.age" :min="1" :max="150" controls-position="right" style="width: 100%;" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="身高" prop="height">
            <el-input-number v-model="form.height" :min="50" :max="250" controls-position="right" style="width: 100%;">
              <template #suffix>cm</template>
            </el-input-number>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="体重" prop="weight">
            <el-input-number v-model="form.weight" :min="20" :max="300" controls-position="right" style="width: 100%;">
              <template #suffix>kg</template>
            </el-input-number>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="简介">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="可选，描述人物特征、职业、性格等..."
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type { PortraitGender, PortraitRace } from '../../../shared/types/portrait.types'

// 初始数据类型
interface InitialData {
  name?: string
  gender?: PortraitGender
  race?: PortraitRace | 'other'
  age?: number
  height?: number
  weight?: number
  description?: string
}

const props = defineProps<{
  modelValue: boolean
  projectId: string
  initialData?: InitialData  // 初始数据，用于从长文角色带入
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': [characterId: string]
}>()

// 表单数据
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = ref({
  name: '',
  gender: 'male' as PortraitGender,
  race: 'asian' as PortraitRace,
  age: 25,
  height: 170,
  weight: 60,
  description: ''
})

// 验证规则
const rules: FormRules = {
  name: [{ required: true, message: '请输入人物姓名', trigger: 'blur' }],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
  race: [{ required: true, message: '请选择人种', trigger: 'change' }],
  age: [{ required: true, message: '请输入年龄', trigger: 'blur' }],
  height: [{ required: true, message: '请输入身高', trigger: 'blur' }],
  weight: [{ required: true, message: '请输入体重', trigger: 'blur' }]
}

// 提交创建
async function handleSubmit() {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    const result = await window.electronAPI.portrait.createCharacter({
      projectId: props.projectId,
      name: form.value.name,
      gender: form.value.gender,
      race: form.value.race,
      age: form.value.age,
      height: form.value.height,
      weight: form.value.weight,
      description: form.value.description || undefined
    })

    if (result.success && result.data) {
      ElMessage.success('人物形象创建成功')
      emit('update:modelValue', false)
      emit('success', result.data.id)
      resetForm()
    } else {
      ElMessage.error(result.error || '创建失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '创建失败')
  } finally {
    loading.value = false
  }
}

// 重置表单
function resetForm() {
  form.value = {
    name: '',
    gender: 'male',
    race: 'asian',
    age: 25,
    height: 170,
    weight: 60,
    description: ''
  }
}

// 应用初始数据到表单
function applyInitialData() {
  if (!props.initialData) return

  const data = props.initialData
  if (data.name) form.value.name = data.name
  // 性别：人像只有 male/female，角色有 other，若为 other 则不带入
  if (data.gender && data.gender !== 'other') {
    form.value.gender = data.gender
  }
  // 人种：人像只有 asian/european，角色有 other，若为 other 则不带入
  if (data.race && data.race !== 'other') {
    form.value.race = data.race as PortraitRace
  }
  if (data.age) form.value.age = data.age
  if (data.height) form.value.height = data.height
  if (data.weight) form.value.weight = data.weight
  if (data.description) form.value.description = data.description
}

// 监听对话框打开
watch(() => props.modelValue, (val) => {
  if (val) {
    resetForm()
    applyInitialData()
  }
})
</script>

<style lang="scss" scoped>
</style>