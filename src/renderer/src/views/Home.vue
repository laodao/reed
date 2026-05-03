<template>
  <div class="home-page">
    <div class="home-content">
      <!-- 欢迎区域 -->
      <div class="welcome-section">
        <div class="welcome-icon">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="28" fill="url(#homeGradient)" />
            <path d="M24 32L30 38L40 26" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="homeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:var(--color-primary-light)"/>
                <stop offset="100%" style="stop-color:var(--color-primary-dark)"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 class="welcome-title gradient-text">欢迎使用 The Bot</h1>
        <p class="welcome-subtitle">AI 工具箱 - 集成多种 AI 能力的跨平台桌面应用</p>
      </div>

      <!-- 功能网格 -->
      <div class="feature-grid">
        <div
          v-for="feature in features"
          :key="feature.path"
          class="feature-card"
          @click="navigateTo(feature.path)"
          @mouseenter="hoveredCard = feature.path"
          @mouseleave="hoveredCard = null"
        >
          <div class="feature-icon" :class="{ hovered: hoveredCard === feature.path }">
            <component :is="feature.icon" />
            <div class="icon-glow"></div>
          </div>
          <div class="feature-content">
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-desc">{{ feature.description }}</p>
          </div>
          <div class="feature-arrow">
            <el-icon :size="20"><ArrowRight /></el-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部信息 -->
    <div class="home-footer">
      <div class="footer-info">
        <span class="version-tag">v0.1.0</span>
        <span class="footer-text">按 <kbd>Ctrl</kbd> + <kbd>K</kbd> 快速打开命令面板</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChatDotRound,
  Picture,
  User,
  EditPen,
  Notebook,
  VideoCamera,
  Document,
  Microphone,
  FolderOpened,
  ArrowRight
} from '@element-plus/icons-vue'

const router = useRouter()
const hoveredCard = ref<string | null>(null)

// 功能列表
const features = [
  {
    path: '/chat',
    title: 'AI 对话',
    description: '与 AI 进行智能对话，支持多种大模型',
    icon: markRaw(ChatDotRound)
  },
  {
    path: '/image',
    title: '图像生成',
    description: '使用 AI 生成创意图像',
    icon: markRaw(Picture)
  },
  {
    path: '/portrait',
    title: '人像设计',
    description: 'AI 角色人像设计与生成',
    icon: markRaw(User)
  },
  {
    path: '/longwriting',
    title: '长文写作',
    description: 'AI 辅助长篇小说创作',
    icon: markRaw(EditPen)
  },
  {
    path: '/episode-production',
    title: '剧集制作',
    description: '剧本生成与视频制作',
    icon: markRaw(VideoCamera)
  },
  {
    path: '/translate',
    title: '文档翻译',
    description: '智能翻译多种语言文档',
    icon: markRaw(Document)
  },
  {
    path: '/voice',
    title: '语音助手',
    description: '语音识别与语音合成',
    icon: markRaw(Microphone)
  },
  {
    path: '/knowledge-base',
    title: '知识库',
    description: '个人知识管理与检索',
    icon: markRaw(FolderOpened)
  },
  {
    path: '/diary',
    title: '日记',
    description: '智能日记记录与管理',
    icon: markRaw(Notebook)
  }
]

const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<style lang="scss" scoped>
.home-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color-page);
  overflow: hidden;
}

.home-content {
  flex: 1;
  overflow-y: auto;
  padding: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

// 欢迎区域
.welcome-section {
  text-align: center;
  margin-bottom: 48px;
}

.welcome-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 24px;
  animation: float 3s ease-in-out infinite;

  svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 4px 20px var(--color-glow));
  }
}

.welcome-title {
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 12px 0;
  letter-spacing: -0.5px;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

// 功能网格
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1200px;
}

.feature-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  background: var(--bg-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
  border: 1px solid var(--border-color-lighter);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--color-gradient);
    opacity: 0;
    transition: opacity var(--transition-normal);
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-card-hover);
    border-color: transparent;

    &::before {
      opacity: 0.03;
    }

    .feature-icon {
      background: var(--color-gradient);
      color: #fff;
      box-shadow: var(--shadow-glow);

      .icon-glow {
        opacity: 1;
      }
    }

    .feature-arrow {
      transform: translateX(4px);
      color: var(--color-primary);
    }
  }

  &:active {
    transform: translateY(-2px);
  }
}

.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: var(--bg-color-page);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
  transition: all var(--transition-normal);
  position: relative;

  :deep(svg) {
    width: 28px;
    height: 28px;
  }

  &.hovered {
    background: var(--color-gradient);
    color: #fff;
  }
}

.icon-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--color-glow);
  filter: blur(12px);
  opacity: 0;
  transition: opacity var(--transition-normal);
  pointer-events: none;
}

.feature-content {
  flex: 1;
  min-width: 0;
}

.feature-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
}

.feature-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.feature-arrow {
  color: var(--text-placeholder);
  transition: all var(--transition-normal);
  flex-shrink: 0;
}

// 底部信息
.home-footer {
  padding: 16px 48px;
  border-top: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
}

.footer-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.version-tag {
  padding: 4px 12px;
  background: var(--bg-color-page);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.footer-text {
  font-size: 13px;
  color: var(--text-placeholder);

  kbd {
    display: inline-block;
    padding: 2px 6px;
    background: var(--bg-color-page);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: 12px;
    color: var(--text-secondary);
  }
}

// 动画
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
</style>
