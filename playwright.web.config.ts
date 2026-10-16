/**
 * Web 端 E2E Playwright 配置
 * @description 用浏览器测试 Web 端（http://localhost:5174 由 vite dev 提供，
 *              代理 /api、/events 到 web-server :4201）。
 *              与 playwright.config.ts（Electron 调试端口模式）独立。
 *
 * 运行：
 *   npx playwright test --config=playwright.web.config.ts
 *   npx playwright test --config=playwright.web.config.ts -g "登录"
 */

import { defineConfig, devices } from '@playwright/test'

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:5174'

export default defineConfig({
  testDir: './tests/e2e/web',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-web' }],
  ],

  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: WEB_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 不启动 webServer：vite + web-server 由用户手动 / 现有进程提供
})
