<template>
  <el-dialog
    :model-value="visible"
    title="导出作品"
    width="500px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="export-dialog">
      <div class="export-info">
        <p class="info-text">将作品导出为以下格式：</p>
      </div>

      <div class="export-options">
        <div class="export-option" @click="handleExport('markdown')">
          <div class="option-icon">
            <el-icon size="32"><Document /></el-icon>
          </div>
          <div class="option-info">
            <h4>Markdown 文件</h4>
            <p>.md 格式，适合备份和二次编辑</p>
          </div>
        </div>

        <div class="export-option" @click="handleExport('word')">
          <div class="option-icon">
            <el-icon size="32"><Document /></el-icon>
          </div>
          <div class="option-info">
            <h4>Word 文档</h4>
            <p>.docx 格式，适合打印和分享</p>
          </div>
        </div>
      </div>

      <div v-if="exporting" class="export-progress">
        <el-progress :percentage="100" :indeterminate="true" />
        <p>正在导出...</p>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Document } from '@element-plus/icons-vue'

const props = defineProps<{
  visible: boolean
  projectId: string
  projectName: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const exporting = ref(false)

async function handleExport(format: 'markdown' | 'word') {
  if (exporting.value) return

  exporting.value = true

  try {
    let result
    if (format === 'markdown') {
      result = await window.electronAPI.longwriting.exportMarkdown(props.projectId)
    } else {
      result = await window.electronAPI.longwriting.exportWord(props.projectId)
    }

    if (result.success) {
      if (result.message === '用户取消') {
        // 用户取消，不做提示
      } else {
        ElMessage.success('导出成功')
        emit('update:visible', false)
      }
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (error: any) {
    ElMessage.error('导出失败：' + error.message)
  } finally {
    exporting.value = false
  }
}
</script>

<style lang="scss" scoped>
.export-dialog {
  padding: 8px 0;
}

.export-info {
  margin-bottom: 20px;

  .info-text {
    font-size: 14px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light-9);
  }
}

.option-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fill-color-light);
  border-radius: 8px;
  color: var(--color-primary);
}

.option-info {
  flex: 1;

  h4 {
    font-size: 15px;
    font-weight: 500;
    color: var(--text-color-primary);
    margin: 0 0 4px 0;
  }

  p {
    font-size: 13px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.export-progress {
  margin-top: 20px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  text-align: center;

  p {
    margin-top: 8px;
    font-size: 14px;
    color: var(--text-color-secondary);
  }
}
</style>