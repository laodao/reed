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

      <!-- 我的应用（用户固定到首页的快捷入口） -->
      <section v-if="pinnedApps.length" class="section">
        <div class="section-head">
          <h2 class="section-title">📌 我的应用</h2>
          <el-button text type="primary" size="small" @click="navigateTo('/apps')">管理应用 →</el-button>
        </div>
        <div class="pinned-grid">
          <div
            v-for="app in pinnedApps"
            :key="app.id"
            class="pinned-card"
            @click="launchApp(app)"
          >
            <span class="pinned-emoji">{{ app.icon || '📦' }}</span>
            <div class="pinned-info">
              <div class="pinned-name" :title="app.name">{{ app.name }}</div>
              <div class="pinned-desc" :title="app.description ?? ''">{{ app.category || app.description || '点击启动' }}</div>
            </div>
            <el-icon class="pinned-arrow" :size="16"><ArrowRight /></el-icon>
          </div>
        </div>
      </section>

      <!-- 功能网格 -->
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">功能</h2>
        </div>
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
              <h3 class="feature-title">{{ feature.label }}</h3>
              <p class="feature-desc">{{ feature.description }}</p>
            </div>
            <div class="feature-arrow">
              <el-icon :size="20"><ArrowRight /></el-icon>
            </div>
          </div>
        </div>
      </section>
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

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'Home' })
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import { mainMenuItems, flattenMenuItems } from '@/config/menu'
import { electronApi } from '@/types/electron-api'
import type { AppRecord } from '@shared/types/app.types'

const router = useRouter()
const api = electronApi()
const hoveredCard = ref<string | null>(null)

/** 固定到首页的应用（快捷入口；登录即拉取） */
const pinnedApps = ref<Array<AppRecord & { sessionCount: number }>>([])

/**
 * 功能卡片列表：与侧边栏共用同一份菜单数据源（@/config/menu），
 * 应用 hidden/hideSelf 过滤后，两处入口天然保持一致。
 * 首页不展示"首页"自身入口。
 */
const features = computed(() =>
  flattenMenuItems(mainMenuItems).filter(item => item.path !== '/')
)

const navigateTo = (path: string) => {
  router.push(path)
}

/** 首页固定应用：点击启动会话（不可启动时进详情） */
async function launchApp(app: AppRecord): Promise<void> {
  if (app.enabled === 1 && app.channelSession === 1) {
    const resp = await api.appSession.create({ appId: app.id })
    if (resp.success) {
      router.push(`/apps/${app.id}/session/${resp.data?.id}?from=home`)
      return
    }
    ElMessage.error(resp.error ?? '启动失败')
    return
  }
  router.push(`/apps/${app.id}`)
}

// keep-alive 下每次进入首页都刷新固定应用（用户在应用列表固定/取消后回首页即时生效）
onActivated(async () => {
  const resp = await api.app.list({ pinned: true, page: 1, pageSize: 50 })
  if (resp.success) pinnedApps.value = resp.data?.items ?? []
})
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
  padding: 40px 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

// 欢迎区域
.welcome-section {
  text-align: center;
  margin-bottom: 36px;
}

.welcome-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  animation: float 3s ease-in-out infinite;

  svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 4px 20px var(--color-glow));
  }
}

.welcome-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 10px 0;
  letter-spacing: -0.5px;
}

.welcome-subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

// 分区
.section {
  width: 100%;
  max-width: 1200px;
  margin-bottom: 32px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

// 固定应用（我的应用）
.pinned-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.pinned-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-2px);
    border-color: var(--color-primary);
    box-shadow: var(--shadow-card-hover);

    .pinned-arrow {
      color: var(--color-primary);
      transform: translateX(2px);
    }
  }
}

.pinned-emoji {
  font-size: 26px;
  width: 46px;
  height: 46px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color-page);
  flex-shrink: 0;
}

.pinned-info {
  flex: 1;
  min-width: 0;
}

.pinned-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pinned-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pinned-arrow {
  color: var(--text-placeholder);
  transition: all var(--transition-normal);
  flex-shrink: 0;
}

// 功能网格
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
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
