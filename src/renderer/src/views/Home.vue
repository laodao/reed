<template>
  <div class="home-page">
    <div class="welcome-section">
      <h1>欢迎使用 The Bot</h1>
      <p>AI 工具箱 - 集成多种 AI 能力的跨平台桌面应用</p>
    </div>

    <div class="feature-grid">
      <div class="feature-card" @click="navigateTo('/chat')">
        <div class="feature-icon">
          <el-icon :size="32"><ChatDotRound /></el-icon>
        </div>
        <div class="feature-info">
          <h3>AI 对话</h3>
          <p>与 AI 进行智能对话，支持多种模型</p>
        </div>
      </div>

      <div class="feature-card" @click="navigateTo('/image')">
        <div class="feature-icon">
          <el-icon :size="32"><Picture /></el-icon>
        </div>
        <div class="feature-info">
          <h3>图像生成</h3>
          <p>使用 AI 生成创意图像</p>
        </div>
      </div>

      <div class="feature-card" @click="navigateTo('/translate')">
        <div class="feature-icon">
          <el-icon :size="32"><Document /></el-icon>
        </div>
        <div class="feature-info">
          <h3>文档翻译</h3>
          <p>智能翻译多种语言文档</p>
        </div>
      </div>

      <div class="feature-card" @click="navigateTo('/voice')">
        <div class="feature-icon">
          <el-icon :size="32"><Microphone /></el-icon>
        </div>
        <div class="feature-info">
          <h3>语音助手</h3>
          <p>语音识别与语音合成</p>
        </div>
      </div>

      <div class="feature-card" @click="navigateTo('/assistant')">
        <div class="feature-icon">
          <el-icon :size="32"><MagicStick /></el-icon>
        </div>
        <div class="feature-info">
          <h3>智能助手</h3>
          <p>自动化任务与智能推荐</p>
        </div>
      </div>

      <div class="feature-card" @click="navigateTo('/settings')">
        <div class="feature-icon">
          <el-icon :size="32"><Setting /></el-icon>
        </div>
        <div class="feature-info">
          <h3>系统设置</h3>
          <p>配置 API 密钥、主题和语言</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  ChatDotRound,
  Picture,
  Document,
  Microphone,
  MagicStick,
  Setting
} from '@element-plus/icons-vue'

const router = useRouter()

const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<style lang="scss" scoped>
.home-page {
  height: 100%;
  padding: 40px;
  overflow-y: auto;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
}

.welcome-section {
  text-align: center;
  margin-bottom: 40px;

  h1 {
    font-size: 32px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 12px;
  }

  p {
    font-size: 16px;
    color: #606266;
  }
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: #fff;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }
}

.feature-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #409eff 0%, #66b1ff 100%);
  border-radius: 12px;
  color: #fff;
  flex-shrink: 0;
}

.feature-info {
  flex: 1;

  h3 {
    font-size: 18px;
    font-weight: 500;
    color: #303133;
    margin: 0 0 8px 0;
  }

  p {
    font-size: 14px;
    color: #909399;
    margin: 0;
  }
}
</style>
