<template>
  <div class="voice-page">
    <div class="page-header">
      <h2>语音助手</h2>
      <p>语音识别与语音合成</p>
    </div>

    <div class="voice-container">
      <el-empty description="语音助手功能开发中...">
        <el-button type="primary">开始录音</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
// 语音助手功能待开发
</script>

<style lang="scss" scoped>
.voice-page {
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

.voice-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
