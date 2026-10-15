<template>
  <div class="dictionary-editor">
    <!-- 表格显示字典项 -->
    <el-table :data="items" size="small" border stripe>
      <el-table-column prop="code" label="编码" width="120">
        <template #default="{ row }">
          <el-input
            v-if="editingId === row.id"
            v-model="editForm.code"
            size="small"
            placeholder="编码"
          />
          <span v-else class="item-code">{{ row.code }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称">
        <template #default="{ row }">
          <el-input
            v-if="editingId === row.id"
            v-model="editForm.name"
            size="small"
            placeholder="名称"
          />
          <span v-else class="item-name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="center">
        <template #default="{ row }">
          <template v-if="editingId === row.id">
            <el-button size="small" type="primary" link @click="saveEdit">保存</el-button>
            <el-button size="small" link @click="cancelEdit">取消</el-button>
          </template>
          <template v-else>
            <el-button size="small" link @click="startEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="handleRemove(row)">删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增区域 -->
    <div class="add-section">
      <el-input
        v-model="newItemCode"
        size="small"
        placeholder="编码"
        class="add-input"
        @keyup.enter="handleAdd"
      />
      <el-input
        v-model="newItemName"
        size="small"
        placeholder="名称"
        class="add-input"
        @keyup.enter="handleAdd"
      />
      <el-button size="small" type="primary" @click="handleAdd">新增</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

interface DictionaryItem {
  id: string
  categoryCode: string
  code: string
  name: string
  sortOrder: number
}

const props = defineProps<{
  items: DictionaryItem[]
  categoryCode: string
}>()

const emit = defineEmits<{
  add: [categoryCode: string, code: string, name: string]
  update: [id: string, data: { code?: string; name?: string }]
  remove: [categoryCode: string, id: string]
}>()

// 新增相关
const newItemCode = ref('')
const newItemName = ref('')

// 编辑相关
const editingId = ref<string | null>(null)
const editForm = ref({
  code: '',
  name: ''
})

// 添加新项
async function handleAdd() {
  if (!newItemCode.value.trim() || !newItemName.value.trim()) {
    ElMessage.warning('请输入编码和名称')
    return
  }

  emit('add', props.categoryCode, newItemCode.value.trim(), newItemName.value.trim())
  newItemCode.value = ''
  newItemName.value = ''
}

// 开始编辑
function startEdit(item: DictionaryItem) {
  editingId.value = item.id
  editForm.value = {
    code: item.code,
    name: item.name
  }
}

// 取消编辑
function cancelEdit() {
  editingId.value = null
  editForm.value = { code: '', name: '' }
}

// 保存编辑
function saveEdit() {
  if (!editForm.value.code.trim() || !editForm.value.name.trim()) {
    ElMessage.warning('编码和名称不能为空')
    return
  }

  emit('update', editingId.value!, {
    code: editForm.value.code.trim(),
    name: editForm.value.name.trim()
  })
  editingId.value = null
  editForm.value = { code: '', name: '' }
}

// 删除项
async function handleRemove(item: DictionaryItem) {
  try {
    await ElMessageBox.confirm(
      `确定要删除字典项「${item.name}」吗？`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    emit('remove', props.categoryCode, item.id)
  } catch {
    // 用户取消
  }
}
</script>

<style lang="scss" scoped>
.dictionary-editor {
  .el-table {
    margin-bottom: 12px;
  }

  .item-code {
    font-family: monospace;
    color: var(--text-color-secondary);
  }

  .item-name {
    color: var(--text-color-primary);
  }
}

.add-section {
  display: flex;
  gap: 8px;
  align-items: center;

  .add-input {
    width: 120px;
  }
}
</style>