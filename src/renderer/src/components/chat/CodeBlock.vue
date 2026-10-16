<template>
  <div class="code-block">
    <div class="code-header">
      <span class="language">{{ language || 'code' }}</span>
      <el-button
        class="copy-btn"
        @click="copyCode"
        size="small"
        text
        :title="copied ? '已复制' : '复制代码'"
      >
        <el-icon><Check v-if="copied" /><CopyDocument v-else /></el-icon>
        <span class="copy-text">{{ copied ? '已复制' : '复制' }}</span>
      </el-button>
    </div>
    <div class="code-content">
      <div class="line-numbers" v-if="showLineNumbers">
        <span v-for="n in lineCount" :key="n" class="line-number">{{ n }}</span>
      </div>
      <pre><code>{{ code }}</code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { CopyDocument, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = withDefaults(
  defineProps<{
    code: string
    language?: string
    showLineNumbers?: boolean
  }>(),
  {
    language: '',
    showLineNumbers: true
  }
)

const copied = ref(false)

// 计算行数
const lineCount = computed(() => {
  if (!props.code) return 0
  return props.code.split('\n').length
})

// 复制代码
async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    ElMessage.success('代码已复制到剪贴板')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage.error('复制失败')
  }
}
</script>

<style lang="scss" scoped>
.code-block {
  background: #1e293b;
  border-radius: 8px;
  overflow: hidden;
  margin: 10px 0;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #334155;
  border-bottom: 1px solid #475569;

  .language {
    font-size: 12px;
    color: #94a3b8;
    text-transform: lowercase;
  }

  .copy-btn {
    color: #94a3b8;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;

    &:hover {
      color: #e2e8f0;
    }

    .copy-text {
      font-size: 12px;
    }
  }
}

.code-content {
  display: flex;
  overflow-x: auto;

  .line-numbers {
    display: flex;
    flex-direction: column;
    padding: 12px 0;
    min-width: 40px;
    text-align: right;
    user-select: none;
    border-right: 1px solid #475569;
    background: #1e293b;

    .line-number {
      padding: 0 8px;
      font-size: 13px;
      line-height: 1.5;
      color: #475569;
      font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
    }
  }

  pre {
    margin: 0;
    padding: 12px 14px;
    flex: 1;
    overflow-x: auto;

    code {
      font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      line-height: 1.5;
      color: #e2e8f0;
      white-space: pre;
    }
  }
}
</style>
