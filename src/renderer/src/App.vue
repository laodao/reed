<template>
  <div class="app-container">
    <el-config-provider :locale="zhCn">
      <MainLayout />
    </el-config-provider>
  </div>
</template>

<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import MainLayout from '@/layouts/MainLayout.vue'
</script>

<style lang="scss">
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-container {
  width: 100%;
  height: 100%;
  background-color: var(--el-bg-color);
}
</style>
