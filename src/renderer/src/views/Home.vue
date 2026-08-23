<template>
  <div class="home-page">
    <!-- 紧凑页头：小标志 + 一行标题，不再占用大块空间 -->
    <div class="home-header">
      <div class="brand">
        <span class="brand-dot"></span>
        <span class="brand-name">The Bot</span>
        <span class="brand-sub">{{ greeting }}，今天想做点什么？</span>
      </div>
      <div class="header-actions">
        <el-button text size="small" @click="navigateTo('/apps')">
          <el-icon :size="14" style="margin-right: 4px"><Box /></el-icon> 管理应用
        </el-button>
      </div>
    </div>

    <div class="home-body">
      <!-- 我的应用：固定到首页的应用快捷入口（主导区域，可容纳较多应用） -->
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">📌 我的应用</h2>
          <span v-if="pinnedApps.length" class="section-count">{{ pinnedApps.length }} 个固定应用</span>
        </div>
        <div v-if="pinnedApps.length" class="pinned-grid">
          <div
            v-for="app in pinnedApps"
            :key="app.id"
            class="pinned-card"
            :title="app.description ?? app.name"
            @click="launchApp(app)"
          >
            <span class="pinned-emoji">{{ app.icon || '📦' }}</span>
            <div class="pinned-info">
              <div class="pinned-name">{{ app.name }}</div>
              <div class="pinned-cat">{{ app.category || '点击启动' }}</div>
            </div>
          </div>
        </div>
        <div v-else class="pinned-empty" @click="navigateTo('/apps')">
          <span class="empty-icon">📌</span>
          <span>还没有固定应用——去「应用」列表把常用的固定到首页，一键启动</span>
          <el-icon :size="14"><ArrowRight /></el-icon>
        </div>
      </section>

      <!-- 全部功能：大卡片入口 -->
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
  </div>
</template>

<script setup lang="ts">

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'Home' })
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Box } from '@element-plus/icons-vue'
import { mainMenuItems, footerMenuItems, flattenMenuItems } from '@/config/menu'
import { electronApi } from '@/types/electron-api'
import type { AppRecord } from '@shared/types/app.types'

const router = useRouter()
const api = electronApi()
const hoveredCard = ref<string | null>(null)

/** 固定到首页的应用（快捷入口；每次进入首页刷新） */
const pinnedApps = ref<Array<AppRecord & { sessionCount: number }>>([])

/**
 * 功能卡片列表：与侧边栏共用同一份菜单数据源（@/config/menu），
 * 应用 hidden/hideSelf 过滤后，两处入口天然保持一致；不展示"首页"自身。
 */
const features = computed(() =>
  flattenMenuItems(mainMenuItems)
    .filter((item: { path: string }) => item.path !== '/')
    // 首页同时提供「设置」入口（侧边栏底部菜单；两处共用同一份配置）
    .concat(flattenMenuItems(footerMenuItems))
)

/** 时段问候（页面更生动） */
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

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

// 紧凑页头（一行高度）
.home-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-gradient, linear-gradient(135deg, #409eff, #7c3aed));
  align-self: center;
  flex-shrink: 0;
  box-shadow: 0 0 8px var(--color-glow, rgba(64, 158, 255, .5));
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: .2px;
}

.brand-sub {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  flex-shrink: 0;
}

// 主体（滚动区）
.home-body {
  flex: 1;
  overflow-y: auto;
  padding: 22px 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.section-count {
  font-size: 12px;
  color: var(--text-placeholder);
}

// 我的应用（主导网格，紧凑卡片可容纳较多应用）
.pinned-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
}

.pinned-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-2px);
    border-color: var(--color-primary);
    box-shadow: var(--shadow-card-hover);

    .pinned-emoji {
      background: var(--color-gradient);
      box-shadow: var(--shadow-glow);
    }
  }
}

.pinned-emoji {
  font-size: 22px;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color-page);
  flex-shrink: 0;
  transition: all var(--transition-normal);
}

.pinned-info {
  flex: 1;
  min-width: 0;
}

.pinned-name {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pinned-cat {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// 空态引导（可点击跳转应用列表）
.pinned-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  background: var(--bg-color);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.empty-icon {
  font-size: 18px;
}

// 全部功能（大卡片：图标 + 标题 + 描述 + 箭头）
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.feature-card {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
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
    transform: translateY(-3px);
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
}

.feature-icon {
  width: 52px;
  height: 52px;
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
    width: 26px;
    height: 26px;
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
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.feature-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feature-arrow {
  color: var(--text-placeholder);
  transition: all var(--transition-normal);
  flex-shrink: 0;
}
</style>
