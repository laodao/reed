<template>
  <div class="chat-page">
    <div class="page-header">
      <h2>AI 对话</h2>
      <p>与 AI 进行智能对话，支持多种模型</p>
    </div>

    <div class="chat-container">
      <div class="chat-main">
        <div class="empty-state">
          <el-empty description="选择或创建一个对话开始聊天">
            <el-button type="primary" @click="createNewDialog">新建对话</el-button>
          </el-empty>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'

const createNewDialog = () => {
  ElMessage.info('创建对话功能开发中...')
}
</script>

<style lang="scss" scoped>
.chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.page-header {
  padding: 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;

  h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 600;
    color: #303133;
  }

  p {
    margin: 0;
    color: #909399;
    font-size: 14px;
  }
}

.chat-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
