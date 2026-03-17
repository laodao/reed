<template>
  <div class="main-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <!-- Logo 区域 -->
      <div class="sidebar-header">
        <div class="logo" v-if="!isCollapsed">
          <span class="logo-text">The Bot</span>
        </div>
        <el-button
          class="collapse-btn"
          :icon="isCollapsed ? Expand : Fold"
          text
          @click="toggleCollapse"
        />
      </div>

      <!-- 导航菜单 -->
      <el-menu
        :default-active="currentRoute"
        class="sidebar-menu"
        :collapse="isCollapsed"
        :collapse-transition="false"
        router
      >
        <el-menu-item index="/">
          <el-icon><HomeFilled /></el-icon>
          <template #title>首页</template>
        </el-menu-item>

        <el-menu-item index="/chat">
          <el-icon><ChatDotRound /></el-icon>
          <template #title>AI 对话</template>
        </el-menu-item>

        <el-menu-item index="/image">
          <el-icon><Picture /></el-icon>
          <template #title>图像生成</template>
        </el-menu-item>

        <el-menu-item index="/translate">
          <el-icon><Document /></el-icon>
          <template #title>文档翻译</template>
        </el-menu-item>

        <el-menu-item index="/voice">
          <el-icon><Microphone /></el-icon>
          <template #title>语音助手</template>
        </el-menu-item>

        <el-menu-item index="/assistant">
          <el-icon><MagicStick /></el-icon>
          <template #title>智能助手</template>
        </el-menu-item>
      </el-menu>

      <!-- 底部菜单 -->
      <div class="sidebar-footer">
        <el-menu
          :default-active="currentRoute"
          class="sidebar-menu"
          :collapse="isCollapsed"
          :collapse-transition="false"
          router
        >
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>设置</template>
          </el-menu-item>
        </el-menu>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  HomeFilled,
  ChatDotRound,
  Picture,
  Document,
  Microphone,
  MagicStick,
  Setting,
  Expand,
  Fold
} from '@element-plus/icons-vue'

const route = useRoute()
const isCollapsed = ref(false)

const currentRoute = computed(() => route.path)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}
</script>

<style lang="scss" scoped>
.main-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #f5f7fa;
}

.sidebar {
  width: 220px;
  height: 100%;
  background-color: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;

  &.collapsed {
    width: 64px;

    .sidebar-header {
      justify-content: center;
      padding: 12px;
    }
  }
}

.sidebar-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e4e7ed;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  color: #409eff;
}

.collapse-btn {
  font-size: 18px;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
  background-color: transparent;

  &:not(.el-menu--collapse) {
    width: 100%;
  }

  :deep(.el-menu-item) {
    height: 48px;
    line-height: 48px;
    margin: 4px 8px;
    border-radius: 8px;

    &.is-active {
      background-color: #ecf5ff;
      color: #409eff;
    }

    &:hover {
      background-color: #f5f7fa;
    }
  }
}

.sidebar-footer {
  border-top: 1px solid #e4e7ed;
  padding: 8px 0;
}

.main-content {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 页面切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
