<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="600px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      v-loading="loading"
    >
      <!-- 角色/地点/物品名称 -->
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入名称" />
      </el-form-item>

      <!-- 描述 -->
      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="请输入描述"
        />
      </el-form-item>

      <!-- 角色/地点/物品特有字段 -->
      <template v-if="entityType === 'character'">
        <el-form-item label="性别">
          <el-radio-group v-model="form.gender">
            <el-radio value="male">男性</el-radio>
            <el-radio value="female">女性</el-radio>
            <el-radio value="other">其他</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="年龄">
          <el-input-number v-model="form.age" :min="0" :max="200" />
        </el-form-item>
        <el-form-item label="外貌描述">
          <el-input
            v-model="form.appearance"
            type="textarea"
            :rows="2"
            placeholder="请输入外貌描述"
          />
        </el-form-item>
        <el-form-item label="性格特点">
          <el-input
            v-model="form.personality"
            type="textarea"
            :rows="2"
            placeholder="请输入性格特点"
          />
        </el-form-item>
        <el-form-item label="角色定位">
          <el-select v-model="form.rolePosition" placeholder="请选择角色定位">
            <el-option value="protagonist" label="主角" />
            <el-option value="supporting" label="配角" />
            <el-option value="antagonist" label="反派" />
            <el-option value="minor" label="次要角色" />
          </el-select>
        </el-form-item>
      </template>

      <template v-if="entityType === 'location'">
        <el-form-item label="地点类型">
          <el-select v-model="form.type" placeholder="请选择地点类型">
            <el-option value="city" label="城市" />
            <el-option value="village" label="村庄" />
            <el-option value="mountain" label="山脉" />
            <el-option value="palace" label="宫殿" />
            <el-option value="forest" label="森林" />
            <el-option value="sea" label="海域" />
            <el-option value="building" label="建筑" />
            <el-option value="other" label="其他" />
          </el-select>
        </el-form-item>
      </template>

      <template v-if="entityType === 'item'">
        <el-form-item label="物品类型">
          <el-select v-model="form.type" placeholder="请选择物品类型">
            <el-option value="weapon" label="武器" />
            <el-option value="artifact" label="神器" />
            <el-option value="medicine" label="丹药" />
            <el-option value="manual" label="秘籍" />
            <el-option value="token" label="信物" />
            <el-option value="other" label="其他" />
          </el-select>
        </el-form-item>
      </template>

      <!-- 人像选择（仅角色） -->
      <template v-if="entityType === 'character'">
        <el-form-item label="人像">
          <el-select
            v-model="form.portraitId"
            placeholder="请选择人像"
            clearable
          >
            <el-option
              v-for="portrait in portraits"
              :key="portrait.id"
              :value="portrait.id"
              :label="portrait.name"
            />
          </el-select>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="$emit('update:visible', false)">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">
          保存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type {
  StoryCharacter,
  StoryLocation,
  StoryItem
} from '../../../shared/types/longwriting.types'

// Props
const props = defineProps<{
  visible: boolean
  entityType: 'character' | 'location' | 'item'
  entityId: string
  entityData?: StoryCharacter | StoryLocation | StoryItem | null
  projectId: string
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved', entity: StoryCharacter | StoryLocation | StoryItem): void
}>()

// 状态
const formRef = ref<FormInstance>()
const loading = ref(false)
const saving = ref(false)
const portraits = ref<{ id: string; name: string }[]>([])

// 表单数据
const form = ref({
  name: '',
  description: '',
  // 角色特有
  gender: 'other' as 'male' | 'female' | 'other',
  age: 25,
  appearance: '',
  personality: '',
  rolePosition: 'supporting' as 'protagonist' | 'supporting' | 'antagonist' | 'minor',
  portraitId: '',
  // 地点特有
  type: 'other' as any,
  // 物品特有
  // type 字段共用
})

// 表单校验规则
const rules: FormRules = {
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' }
  ]
}

// 对话框标题
const dialogTitle = computed(() => {
  switch (props.entityType) {
    case 'character':
      return '编辑角色'
    case 'location':
      return '编辑地点'
    case 'item':
      return '编辑物品'
    default:
      return '编辑实体'
  }
})

// 监听 entityData 变化，更新表单
watch(() => props.entityData, (data) => {
  if (data) {
    form.value.name = data.name || ''
    form.value.description = data.description || ''

    if (props.entityType === 'character') {
      const char = data as StoryCharacter
      form.value.gender = char.gender || 'other'
      form.value.age = char.age || 25
      form.value.appearance = char.appearance || ''
      form.value.personality = char.personality || ''
      form.value.rolePosition = char.rolePosition || 'supporting'
      form.value.portraitId = char.portraitId || ''
    }

    if (props.entityType === 'location') {
      const loc = data as StoryLocation
      form.value.type = loc.type || 'other'
    }

    if (props.entityType === 'item') {
      const item = data as StoryItem
      form.value.type = item.type || 'other'
    }
  }
}, { immediate: true })

// 加载人像列表
async function loadPortraits() {
  try {
    // TODO: 调用 API 加载人像列表
    // 这里暂时为空数组，后续需要实现人像管理功能
    portraits.value = []
  } catch (error: any) {
    console.error('[EntityEditDialog] 加载人像列表失败:', error)
  }
}

// 保存
async function handleSave() {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    // 构建更新数据
    const updateData: any = {
      name: form.value.name,
      description: form.value.description
    }

    if (props.entityType === 'character') {
      updateData.gender = form.value.gender
      updateData.age = form.value.age
      updateData.appearance = form.value.appearance
      updateData.personality = form.value.personality
      updateData.rolePosition = form.value.rolePosition
      updateData.portraitId = form.value.portraitId || null
    }

    if (props.entityType === 'location') {
      updateData.type = form.value.type
    }

    if (props.entityType === 'item') {
      updateData.type = form.value.type
    }

    // 调用更新 API
    const result = await window.electronAPI.storyToVideo.updateUploadedEntity(
      props.entityId,
      props.entityType,
      updateData
    )

    if (result.success) {
      ElMessage.success('保存成功')
      emit('saved', result.data)
      emit('update:visible', false)
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 关闭对话框
function handleClose() {
  formRef.value?.resetFields()
}

// 初始化
onMounted(() => {
  loadPortraits()
})
</script>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>