/**
 * Playwright 配置文件
 * 用于 Electron 应用 E2E 测试
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // 超时设置
  timeout: 30000,
  expect: {
    timeout: 10000
  },

  // 项目配置
  projects: [
    {
      name: 'electron',
      use: {},
    },
  ],

  // 不使用 webServer，因为我们连接到已运行的 Electron 应用
})