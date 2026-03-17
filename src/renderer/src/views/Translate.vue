<template>
  <div class="translate-page">
    <div class="page-header">
      <h2>文档翻译</h2>
      <p>智能翻译多种语言文档</p>
    </div>

    <div class="translate-container">
      <el-empty description="文档翻译功能开发中...">
        <el-button type="primary">上传文档</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
// 文档翻译功能待开发
</script>

<style lang="scss" scoped>
.translate-page {
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

.translate-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
