<template>
  <div class="image-page">
    <div class="page-header">
      <h2>图像生成</h2>
      <p>使用 AI 生成创意图像</p>
    </div>

    <div class="image-container">
      <el-empty description="图像生成功能开发中...">
        <el-button type="primary">开始生成</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
// 图像生成功能待开发
</script>

<style lang="scss" scoped>
.image-page {
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

.image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
