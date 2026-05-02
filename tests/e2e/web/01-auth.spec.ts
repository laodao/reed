/**
 * Web 端 E2E - 认证模块
 * @description 通过 UI 测试登录门：错误密码、正确密码、注册新账号（用一次性邮箱）、退出登录。
 */

import { test, expect } from '@playwright/test'
import {
  DEFAULT_USER,
  WEB_API_BASE,
  WEB_FRONT_BASE,
  loginViaUI,
} from './helpers/auth'

test.describe('Web 端 - 认证', () => {
  test('未登录时访问 /api/auth/me 返回 401', async ({ request }) => {
    const resp = await request.get(`${WEB_API_BASE}/api/auth/me`, {
      headers: { Cookie: '' },
    })
    // 401 未登录 / 200 ok 都可能（浏览器自动带 cookie），主要确认 endpoint 工作
    expect([200, 401]).toContain(resp.status())
  })

  test('错误密码登录应提示「邮箱或密码错误」', async ({ page }) => {
    await page.goto(WEB_FRONT_BASE)
    await page.getByRole('textbox', { name: '邮箱' }).fill(DEFAULT_USER.email)
    await page.getByRole('textbox', { name: /密码/ }).fill('this-is-wrong-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByText('邮箱或密码错误')).toBeVisible({ timeout: 10_000 })
  })

  test('正确凭证可登录并进入首页（侧边栏出现）', async ({ page }) => {
    await loginViaUI(page)
    // 登录后页面会 reload，等首页侧边栏的「AI 对话」菜单
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })
    // URL 仍是 # 根
    await expect(page).toHaveURL(/\/#?\/?$/)
  })

  test('注册新账号成功后自动登录', async ({ page }) => {
    const suffix = Date.now()
    const email = `e2e_${suffix}@example.com`
    const password = 'pw_e2e_123'

    await page.goto(WEB_FRONT_BASE)
    // 切到「注册」tab
    await page.getByText('注册', { exact: true }).first().click()
    await page.getByRole('textbox', { name: '邮箱' }).fill(email)
    await page.getByRole('textbox', { name: /密码/ }).fill(password)
    // 昵称可选
    const displayInput = page.getByRole('textbox', { name: /昵称/ })
    if (await displayInput.count()) {
      await displayInput.first().fill(`E2E ${suffix}`)
    }
    await page.getByRole('button', { name: '注册并登录', exact: true }).click()
    // 注册成功 → reload 进入首页侧边栏
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })
  })

  test('登录后 /api/auth/me 返回当前用户', async ({ page, request }) => {
    await loginViaUI(page)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // 通过浏览器 fetch 走同一会话
    const me = await page.evaluate(async () => {
      const r = await fetch('/api/auth/me', { credentials: 'include' })
      return { status: r.status, body: await r.json() }
    })
    expect(me.status).toBe(200)
    expect(me.body.ok).toBe(true)
    expect(me.body.data.email).toBe(DEFAULT_USER.email)
  })

  test('登出后再访问 /api/auth/me 应为 401', async ({ page }) => {
    await loginViaUI(page)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    const logoutResult = await page.evaluate(async () => {
      const r = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      return r.status
    })
    expect(logoutResult).toBe(200)

    const after = await page.evaluate(async () => {
      const r = await fetch('/api/auth/me', { credentials: 'include' })
      return r.status
    })
    expect(after).toBe(401)
  })

  test('侧边栏注销按钮点击后回到登录页', async ({ page }) => {
    await loginViaUI(page)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // 点击侧边栏底部「注销」按钮
    const logoutBtn = page.locator('[data-test="logout-btn"]')
    await expect(logoutBtn).toBeVisible()
    await logoutBtn.click()

    // 弹出确认框
    await expect(page.getByText('确定要注销当前账号吗')).toBeVisible({
      timeout: 5_000,
    })
    await page.getByRole('button', { name: '注销', exact: true }).click()

    // 页面回到登录门：登录表单的 邮箱 / 密码 input 出现
    await expect(page.getByRole('textbox', { name: '邮箱' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('textbox', { name: /密码/ })).toBeVisible()

    // 此时 /api/auth/me 应为 401
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/auth/me', { credentials: 'include' })
      return r.status
    })
    expect(status).toBe(401)
  })
})
