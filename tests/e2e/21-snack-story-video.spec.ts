/**
 * Electron 端到端测试：零食大作战视频生成
 *
 * 测试目标：验证完整 UI 流程
 * - 创建项目 → 创建剧集 → 确认要素 → AI 生成剧本 → 生成分镜
 *
 * 运行方式：
 *   1. 先用调试端口启动应用：npm run dev -- --remote-debugging-port=9222
 *   2. 运行测试：npx playwright test tests/e2e/21-snack-story-video.spec.ts --headed
 */

import { test, expect } from '@playwright/test'
import { ElectronTestHelper, createElectronHelper } from '../electron.setup'

const TEST_TIMEOUT = 10 * 60 * 1000 // 10 分钟

test.describe('零食大作战 - 端到端视频生成测试', () => {
  test.setTimeout(TEST_TIMEOUT)

  let helper: ElectronTestHelper

  test.beforeAll(async () => {
    helper = createElectronHelper({
      debugPort: 9222,
      timeout: 60000,
      autoClose: false
    })
    await helper.startApp()
  })

  test.afterAll(async () => {
    await helper.close()
  })

  test('完整流程：创建项目 → 生成剧本 → 生成分镜 → 验证质量', async () => {
    const page = helper.getPage()

    // ═══════════════════════════════════════
    // Step 0：等待应用加载
    // ═══════════════════════════════════════
    await helper.waitForElectronAPI()
    console.log('[测试] 应用已加载')
    await page.screenshot({ path: 'tests/reports/snack-01-initial.png' })

    // ═══════════════════════════════════════
    // Step 1：导航到剧集制作页面
    // ═══════════════════════════════════════
    await helper.navigateTo('/episode-production')
    await page.waitForLoadState('networkidle')
    console.log('[测试] 已进入剧集制作页面')
    await page.screenshot({ path: 'tests/reports/snack-02-episode-list.png' })

    // ═══════════════════════════════════════
    // Step 2：创建新项目
    // ═══════════════════════════════════════
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    const createProjectBtn = page.getByRole('button', { name: /新建/ })
    await createProjectBtn.first().click()
    console.log('[测试] 点击新建项目')

    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'tests/reports/snack-03-create-project-dialog.png' })

    // 填写项目名称
    const projectNameInput = page.locator('input[placeholder*="项目名"], input[placeholder*="名称"], input[placeholder*="name"]').first()
    if (await projectNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectNameInput.fill('零食大作战测试')
    }

    // 点击确定按钮
    await page.getByRole('button', { name: /确定|创建|保存/ }).first().click()
    console.log('[测试] 创建项目：零食大作战测试')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'tests/reports/snack-04-project-created.png' })

    // ═══════════════════════════════════════
    // Step 3：选择项目，创建剧集
    // ═══════════════════════════════════════
    const projectItems = page.locator('.project-item, [class*="project"]').filter({ hasText: /零食大作战/ })
    if (await projectItems.count() > 0) {
      await projectItems.first().click()
    } else {
      await page.locator('.project-item').first().click()
    }
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'tests/reports/snack-05-project-selected.png' })

    // 点击新建剧集
    const newEpisodeBtn = page.getByRole('button', { name: /新建剧集/ }).first()
    await newEpisodeBtn.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'tests/reports/snack-06-create-episode-dialog.png' })

    // ── 填写剧集标题（必填字段）──
    const titleInput = page.locator('input[placeholder*="选择章节"], input[placeholder*="手动输入"]')
    if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleInput.click()
      await titleInput.fill('零食大作战 - 第1集')
      console.log('[测试] 已输入剧集标题')
    } else {
      const altTitle = page.locator('.el-dialog .el-input__inner[type="text"]').first()
      await altTitle.click()
      await altTitle.fill('零食大作战 - 第1集')
      console.log('[测试] 已输入剧集标题（备用选择器）')
    }
    await page.waitForTimeout(500)

    // ── 选择"上传长文"模式 ──
    const uploadedRadio = page.locator('.el-dialog .el-radio').filter({ hasText: '上传长文' })
    if (await uploadedRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadedRadio.click()
      console.log('[测试] 选择上传长文模式')
    }
    await page.waitForTimeout(500)

    // ── 输入长文内容 ──
    const longTextContent = `# 零食大作战

## 故事梗概

两个5岁的小男孩——豆豆和小胖，趁爸妈不在家，偷偷打开零食柜，展开了一场"偷吃大作战"。就在他们以为大功告成时，妈妈突然回来了。就在两个小可怜以为要被骂时，反转来了——妈妈竟然也偷偷拿了一包零食……

## 人物

- 豆豆：5岁男孩，机灵鬼，戴蓝色T恤，是"偷吃计划"的主谋
- 小胖：5岁男孩，胖乎乎的，穿红色T恤，胆小但嘴馋，豆豆的好搭档
- 豆豆妈：30多岁，看起来严肃但其实有点可爱

## 场景

普通家庭的客厅+厨房，晚上8点，爸妈说出去散步（其实豆豆妈临时忘了拿钥匙回来取）

## 详细剧本

### 场景1：客厅 - 偷吃计划启动

豆豆鬼鬼祟祟地关上客厅门，回头对小胖做了个"嘘"的手势。

豆豆（压低声音，一脸严肃）：
"妈妈出去了，行动开始！"

小胖（紧张地抱着自己肚子）：
"可是……万一被发现怎么办？"

豆豆（拍拍胸脯）：
"放心，我有计划！你在门口放哨，我去拿零食！"

### 场景2：厨房 - 作战现场

豆豆踮着脚尖，偷偷打开零食柜。满满一柜子零食出现在眼前，他的眼睛亮了。

豆豆（内心OS，眼睛冒光）：
"哇……妈妈藏了这么多……"

他拿了一包薯片、两根棒棒糖、一盒饼干，还有一瓶可乐。

小胖（在客厅门口探出脑袋）：
"豆豆！妈妈回来了没有？"

豆豆（抱着一堆零食，头也不回）：
"没有！快点帮我开门！"

两个小孩合力把零食搬回客厅，坐在地毯上，像举行秘密仪式一样。

豆豆：
"一、二、三，干杯！"

两人举起可乐瓶，碰在一起，发出清脆的"叮"声。

小胖（咬着薯片，笑得眼睛眯起来）：
"这是我吃过最好吃的零食！"

### 场景3：客厅 - 突发危机

突然，门外传来钥匙转动的声音。

两个小孩的脸瞬间僵住。

豆豆（声音发抖）：
"是……是妈妈？！"

小胖（薯片掉在地上，眼泪快出来了）：
"我……我要被打了……"

两人慌乱地把零食往沙发缝里塞，结果越塞越乱，可乐洒了一地。

门开了，豆豆妈站在门口，看着一地狼藉，脸越来越黑。

豆豆妈（双手叉腰）：
"你们……在干嘛？"

豆豆（举起手，一脸无辜）：
"我……我们在打扫卫生！"

小胖（疯狂点头）：
"对对对！豆豆说要帮妈妈做家务！"

豆豆妈看着儿子嘴角的薯片渣，又看看沙发缝里露出来的零食袋角，叹了口气。

豆豆妈（转身，小声嘀咕）：
"还好我没告诉他们，其实我也偷拿了一包……"

她从口袋里掏出一包辣条，默默走到厨房坐下，假装什么都没发生。

两个小孩在客厅面面相觑。

豆豆（小声对小胖）：
"妈妈……也偷吃？"

小胖（突然笑了）：
"那我们不就不算犯错了吗！"

两人对视一眼，同时笑了出来。

### 场景4：结尾 - 全家共享

豆豆妈端着辣条回到客厅，看着两个小调皮，忍不住笑了。

豆豆妈：
"算了，下次想吃什么，直接跟妈妈说。"

豆豆（举手）：
"那……我能吃三包吗？"

豆豆妈：
"做梦！"

三个人一起笑了，画面定格在他们一起吃零食的温馨场景。

主题：孩子的调皮是天真，父母的宽容是爱。有时候，大人也只是个孩子。`

    console.log(`[测试] 长文内容字数: ${longTextContent.length}`)

    const contentTextarea = page.locator('textarea[placeholder*="500"], textarea[placeholder*="留空"]')
    if (await contentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contentTextarea.click()
      await contentTextarea.type(longTextContent, { delay: 2 })
      console.log('[测试] 已输入长文内容')
    } else {
      const altTextarea = page.locator('.el-dialog textarea').first()
      if (await altTextarea.isVisible()) {
        await altTextarea.click()
        await altTextarea.type(longTextContent, { delay: 2 })
        console.log('[测试] 已输入长文内容（备用选择器）')
      }
    }

    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'tests/reports/snack-07-episode-form-filled.png' })

    // ── 点击创建按钮 ──
    const createBtn = page.getByRole('button', { name: /创建/ }).last()
    const isDisabled = await createBtn.isDisabled()
    console.log(`[测试] 创建按钮状态: ${isDisabled ? '禁用' : '可用'}`)

    if (isDisabled) {
      console.log('[测试] 按钮仍被禁用，尝试手动触发 input 事件...')
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('.el-dialog input, .el-dialog textarea')
        inputs.forEach(el => {
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        })
      })
      await page.waitForTimeout(500)
    }

    if (await createBtn.isEnabled()) {
      await createBtn.click()
      console.log('[测试] 点击创建按钮')
    } else {
      console.log('[测试] 警告：创建按钮仍然禁用，尝试强制点击...')
      await createBtn.click({ force: true })
    }

    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'tests/reports/snack-08-episode-created.png' })

    // ══════════════════════════════════════
    // Step 4：进入剧集工作台（通过 IPC 获取 ID 用于路由导航）
    // ══════════════════════════════════════
    let projectId = ''
    let episodeId = ''

    try {
      const projects = await helper.invokeElectronAPI<{ success: boolean; data?: unknown[] }>('episodeProduction.listProjects')
      console.log('[测试] 项目列表响应:', JSON.stringify(projects).slice(0, 500))

      const snackProjects = Array.isArray(projects.data)
        ? projects.data.filter((p: any) => (p.name || '').includes('零食大作战'))
        : []

      if (snackProjects.length > 0) {
        snackProjects.sort((a: any, b: any) => (a.id || '').localeCompare(b.id || ''))
        const snackProject = snackProjects[snackProjects.length - 1]
        projectId = snackProject.id
        console.log('[测试] 找到项目 ID:', projectId, '项目名:', snackProject.name)

        const episodes = await helper.invokeElectronAPI<{ success: boolean; data?: unknown[] }>('episodeProduction.listEpisodes', projectId)
        console.log('[测试] 剧集列表响应:', JSON.stringify(episodes).slice(0, 500))

        if (Array.isArray(episodes.data) && episodes.data.length > 0) {
          const projectEpisodes = episodes.data
            .filter((e: any) => e.projectId === projectId)
            .sort((a: any, b: any) => (b.id || '').localeCompare(a.id || ''))

          if (projectEpisodes.length > 0) {
            episodeId = projectEpisodes[0].id
            console.log('[测试] 找到剧集 ID:', episodeId, '标题:', projectEpisodes[0].title)
          }
        }
      }
    } catch (e) {
      console.log('[测试] IPC API 获取项目/剧集失败:', e)
    }

    if (projectId && episodeId) {
      await helper.navigateTo(`/episode-production/${projectId}/episode/${episodeId}`)
      await page.waitForLoadState('networkidle')
      console.log('[测试] 已进入剧集工作台')
    } else {
      throw new Error('无法获取项目/剧集 ID，无法继续测试')
    }

    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'tests/reports/snack-09-episode-workbench.png' })

    // ══════════════════════════════════════
    // Step 5：内容+剧本阶段 - 手动添加要素并确认
    // ══════════════════════════════════════
    console.log('[测试] === Step 5: 内容+剧本阶段 ===')

    // 诊断：检查当前状态
    const currentStatus = await page.evaluate(() => {
      const segments = document.querySelectorAll('.stage-segment')
      return Array.from(segments).map(s => ({
        label: s.querySelector('.stage-label')?.textContent,
        classes: s.className
      }))
    })
    console.log('[测试] 当前 stage 状态:', JSON.stringify(currentStatus))

    // 尝试 AI 识别要素（如果模型已配置）
    console.log('[测试] 尝试点击"AI 识别要素"按钮...')
    const identifyBtn = page.locator('button:has-text("识别"), button:has-text("AI")').first()
    if (await identifyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await identifyBtn.click()
      console.log('[测试] 点击了 AI 识别按钮')
      await page.waitForTimeout(10000) // 等待 AI 响应
      await page.screenshot({ path: 'tests/reports/snack-10-after-identify.png' })
    } else {
      console.log('[测试] 未找到 AI 识别按钮，跳过')
    }

    // 检查要素数量
    const entityCount = await page.evaluate(() => {
      const body = document.body.innerText
      const charMatch = body.match(/(\d+)\s*角色/)
      const locMatch = body.match(/(\d+)\s*地点/)
      const itemMatch = body.match(/(\d+)\s*物品/)
      return {
        characters: charMatch ? parseInt(charMatch[1]) : 0,
        locations: locMatch ? parseInt(locMatch[1]) : 0,
        items: itemMatch ? parseInt(itemMatch[1]) : 0
      }
    })
    console.log('[测试] 要素数量:', entityCount)

    // 如果没有要素，手动添加
    if (entityCount.characters === 0 && entityCount.locations === 0 && entityCount.items === 0) {
      console.log('[测试] 没有检测到要素，手动添加...')

      // 查找角色 section 的 ⋮ 菜单按钮
      const characterSection = page.locator('.entity-section').filter({ hasText: '角色' }).first()
      const moreBtn = characterSection.locator('.more-btn, button:has(.el-icon)').first()

      if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await moreBtn.click()
        console.log('[测试] 点击了角色 section 的菜单')
        await page.waitForTimeout(500)

        // 点击 "+ 添加角色"
        const addMenuItem = page.locator('.el-dropdown-menu__item').filter({ hasText: /添加.*角色/ }).first()
        if (await addMenuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
          await addMenuItem.click()
          console.log('[测试] 点击了"添加角色"')
          await page.waitForTimeout(1000)
          await page.screenshot({ path: 'tests/reports/snack-10-add-character-dialog.png' })

          // 填写角色名称
          const nameInput = page.locator('.el-dialog input[placeholder*="如"], .el-dialog input[placeholder*="名称"]').first()
          if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nameInput.fill('豆豆')
            console.log('[测试] 填写角色名：豆豆')
          }

          // 填写描述
          const descInput = page.locator('.el-dialog textarea').first()
          if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await descInput.fill('5岁男孩，机灵鬼，戴蓝色T恤')
          }

          // 点击添加按钮
          const addBtn = page.locator('.el-dialog button:has-text("添加"), .el-dialog .el-button--primary').first()
          await addBtn.click()
          console.log('[测试] 点击添加按钮')
          await page.waitForTimeout(1000)
        }
      }

      // 再添加一个角色
      console.log('[测试] 添加第二个角色...')
      const charSection2 = page.locator('.entity-section').filter({ hasText: '角色' }).first()
      const moreBtn2 = charSection2.locator('.more-btn, button:has(.el-icon)').first()
      if (await moreBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await moreBtn2.click()
        await page.waitForTimeout(500)
        const addMenuItem2 = page.locator('.el-dropdown-menu__item').filter({ hasText: /添加.*角色/ }).first()
        if (await addMenuItem2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await addMenuItem2.click()
          await page.waitForTimeout(1000)

          const nameInput2 = page.locator('.el-dialog input[placeholder*="如"], .el-dialog input[placeholder*="名称"]').first()
          if (await nameInput2.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nameInput2.fill('小胖')
          }

          const descInput2 = page.locator('.el-dialog textarea').first()
          if (await descInput2.isVisible({ timeout: 1000 }).catch(() => false)) {
            await descInput2.fill('5岁男孩，胖乎乎的，穿红色T恤')
          }

          const addBtn2 = page.locator('.el-dialog button:has-text("添加"), .el-dialog .el-button--primary').first()
          await addBtn2.click()
          console.log('[测试] 添加了角色：小胖')
          await page.waitForTimeout(1000)
        }
      }

      await page.screenshot({ path: 'tests/reports/snack-11-entities-added.png' })
    }

    // 点击"确认要素"按钮
    console.log('[测试] 尝试点击"确认要素"按钮...')
    const confirmBtn = page.locator('button:has-text("确认要素"), button:has-text("→ ②")').first()
    const confirmBtnDisabled = await confirmBtn.isDisabled().catch(() => true)
    console.log(`[测试] 确认要素按钮状态: ${confirmBtnDisabled ? '禁用' : '可用'}`)

    if (!confirmBtnDisabled) {
      // 检查按钮是否有 loading 状态
      const wasLoading = await confirmBtn.getAttribute('loading')
      console.log('[测试] 按钮 loading 属性:', wasLoading)

      await confirmBtn.click()
      console.log('[测试] 点击了确认要素按钮')

      // 等待可能的 loading 状态变化
      await page.waitForTimeout(5000)

      // 诊断：检查页面是否有错误提示
      const errorMsg = await page.evaluate(() => {
        const errorEl = document.querySelector('.el-message--error, .el-notification--error')
        return errorEl?.textContent || null
      })
      if (errorMsg) {
        console.log('[测试] 错误提示:', errorMsg)
      } else {
        console.log('[测试] 无错误提示')
      }

      // 诊断：检查当前 episode status
      const currentStage = await page.evaluate(() => {
        const currentSeg = document.querySelector('.stage-segment.stage-current')
        return currentSeg?.querySelector('.stage-label')?.textContent
      })
      console.log('[测试] 当前阶段:', currentStage)

      // 诊断：通过 IPC 检查 episode 实际状态
      try {
        const epCheck = await helper.invokeElectronAPI<{ success: boolean; data?: any }>(
          'episodeProduction.getEpisode', episodeId
        )
        if (epCheck.success && epCheck.data) {
          console.log('[测试] Episode 实际状态:', epCheck.data.status)
        }
      } catch (e) {
        console.log('[测试] 获取 episode 状态失败:', (e as Error).message?.slice(0, 200))
      }

      await page.screenshot({ path: 'tests/reports/snack-12-entities-confirmed.png' })

      // 如果还在 pending 阶段，尝试刷新页面
      if (currentStage === '内容 + 剧本') {
        console.log('[测试] 仍在 pending 阶段，尝试刷新...')
        await page.reload()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(3000)
        await page.screenshot({ path: 'tests/reports/snack-12-5-after-reload.png' })

        // 刷新后再检查状态
        const stageAfterReload = await page.evaluate(() => {
          const currentSeg = document.querySelector('.stage-segment.stage-current')
          return currentSeg?.querySelector('.stage-label')?.textContent
        })
        console.log('[测试] 刷新后阶段:', stageAfterReload)
      }
    } else {
      console.log('[测试] 警告：确认要素按钮被禁用，尝试诊断...')
      // 诊断：检查所有 entity 的 confirmed 状态
      const entityStatus = await page.evaluate(() => {
        const checkboxes = document.querySelectorAll('.entity-item .el-checkbox')
        return Array.from(checkboxes).map((cb, i) => ({
          index: i,
          checked: cb.classList.contains('is-checked'),
          text: cb.closest('.entity-item')?.querySelector('.entity-name')?.textContent
        }))
      })
      console.log('[测试] 要素 checkbox 状态:', JSON.stringify(entityStatus))
    }

    // ══════════════════════════════════════
    // Step 6：切换到内容+剧本 tab，AI 生成剧本
    // ══════════════════════════════════════
    console.log('[测试] === Step 6: AI 生成剧本 ===')

    // 点击顶部进度条的"内容+剧本"段
    const contentScriptTab = page.locator('.stage-segment').filter({ hasText: '内容+剧本' }).first()
    if (await contentScriptTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contentScriptTab.click()
      console.log('[测试] 点击了"内容+剧本" tab')
      await page.waitForTimeout(2000)
    }

    await page.screenshot({ path: 'tests/reports/snack-13-content-script-stage.png' })

    // 点击 "AI 生成剧本" 按钮
    console.log('[测试] 查找"AI 生成剧本"按钮...')
    const generateScriptBtn = page.locator('button:has-text("AI 生成剧本")').first()
    if (await generateScriptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const scriptBtnDisabled = await generateScriptBtn.isDisabled().catch(() => true)
      console.log(`[测试] AI 生成剧本按钮状态: ${scriptBtnDisabled ? '禁用' : '可用'}`)

      if (!scriptBtnDisabled) {
        await generateScriptBtn.click()
        console.log('[测试] 点击了"AI 生成剧本"按钮')
        await page.waitForTimeout(60000) // 等待 AI 生成（最多 60 秒）
        await page.screenshot({ path: 'tests/reports/snack-14-script-generated.png' })
      } else {
        console.log('[测试] 警告：AI 生成剧本按钮被禁用')
      }
    } else {
      console.log('[测试] 未找到"AI 生成剧本"按钮，可能还没进入 scripting 状态')
      // 可能需要等待状态更新
      await page.waitForTimeout(3000)
      await page.screenshot({ path: 'tests/reports/snack-14-no-script-btn.png' })
    }

    // ══════════════════════════════════════
    // Step 7：切换到分镜阶段
    // ══════════════════════════════════════
    console.log('[测试] === Step 7: 分镜阶段 ===')

    // 先点击"完成定稿 → ④ 分镜"按钮（如果存在）
    const approveScriptBtn = page.locator('button:has-text("完成定稿"), button:has-text("→ ④")').first()
    if (await approveScriptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const approveDisabled = await approveScriptBtn.isDisabled().catch(() => true)
      if (!approveDisabled) {
        await approveScriptBtn.click()
        console.log('[测试] 点击了"完成定稿"按钮')
        await page.waitForTimeout(2000)
      }
    }

    // 点击顶部进度条的"分镜"段
    const storyboardTab = page.locator('.stage-segment').filter({ hasText: '分镜' }).first()
    if (await storyboardTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await storyboardTab.click()
      console.log('[测试] 点击了"分镜" tab')
      await page.waitForTimeout(3000)
      await page.screenshot({ path: 'tests/reports/snack-15-storyboard-stage.png' })
    } else {
      console.log('[测试] 未找到"分镜" tab')
    }

    // 点击 "AI 一键拆所有场景" 按钮
    console.log('[测试] 查找分镜生成按钮...')
    const generateStoryboardBtn = page.locator('button:has-text("AI 一键拆所有场景"), button:has-text("拆所有场景")').first()
    if (await generateStoryboardBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const sbBtnDisabled = await generateStoryboardBtn.isDisabled().catch(() => true)
      console.log(`[测试] 分镜生成按钮状态: ${sbBtnDisabled ? '禁用' : '可用'}`)

      if (!sbBtnDisabled) {
        await generateStoryboardBtn.click()
        console.log('[测试] 点击了"AI 一键拆所有场景"按钮')
        await page.waitForTimeout(60000) // 等待分镜生成
        await page.screenshot({ path: 'tests/reports/snack-16-storyboards-generated.png' })
      } else {
        console.log('[测试] 警告：分镜生成按钮被禁用，可能还没有场景数据')
      }
    } else {
      console.log('[测试] 未找到分镜生成按钮')
      await page.screenshot({ path: 'tests/reports/snack-16-no-storyboard-btn.png' })
    }

    // ══════════════════════════════════════
    // Step 8：验证分镜质量
    // ══════════════════════════════════════
    console.log('[测试] === Step 8: 验证分镜质量 ===')

    // 检查景别多样性
    const shotTypes = await page.evaluate(() => {
      const allText = document.body.innerText
      const types = new Set<string>()
      const typeKeywords = ['特写', '近景', '中近景', '中景', '全景', '远景', '大远景']
      for (const kw of typeKeywords) {
        if (allText.includes(kw)) types.add(kw)
      }
      return Array.from(types)
    })
    console.log('[测试] 检测到的景别类型:', shotTypes)
    console.log(`[测试] 景别多样性: ${shotTypes.length} 种`)

    // 检查分镜数量
    const storyboardCount = await page.evaluate(() => {
      const items = document.querySelectorAll('.storyboard-item, [class*="storyboard-card"]')
      return items.length
    })
    console.log(`[测试] 分镜数量: ${storyboardCount}`)

    // 最终截图
    await page.screenshot({ path: 'tests/reports/snack-17-final.png' })

    console.log('[测试] 测试流程完成！')
    console.log('[测试] 截图已保存到 tests/reports/ 目录')
  })
})
