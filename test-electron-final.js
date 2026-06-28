const { _electron: electron } = require('playwright');

(async () => {
  console.log('启动 Electron 应用...');
  const app = await electron.launch({
    args: ['.'],
    cwd: 'C:/Users/daoge/code/project/the-bot'
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('networkidle');
  await window.waitForTimeout(5000);

  await window.screenshot({ path: 'final-01-init.png' });
  console.log('截图: final-01-init.png');

  // 1. 点击剧集制作导航
  console.log('\n步骤1: 点击剧集制作...');
  try {
    await window.getByRole('navigation').getByText('剧集制作').click({ timeout: 10000 });
    await window.waitForTimeout(3000);
  } catch (e) {
    console.log('失败:', e.message);
  }

  // 2. 点击项目（使用 locator）
  console.log('\n步骤2: 点击项目...');
  await window.waitForTimeout(2000);

  // 找项目卡片
  try {
    const projectCards = await window.locator('article').all();
    console.log('找到 article 数:', projectCards.length);

    for (const card of projectCards) {
      const text = await card.textContent();
      console.log('Article text:', text?.substring(0, 40));
    }

    // 点击包含杜十娘的卡片
    await window.locator('article').filter({ hasText: '杜十娘' }).first().click({ timeout: 10000 });
    console.log('点击杜十娘项目成功');
  } catch (e) {
    console.log('点击项目失败:', e.message);
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'final-02-project.png' });

  // 3. 点击第 1 集
  console.log('\n步骤3: 点击第 1 集...');
  await window.waitForTimeout(2000);

  try {
    await window.locator('text=/第\\s*1\\s*集/').first().click({ timeout: 10000 });
    console.log('点击第 1 集成功');
  } catch (e) {
    console.log('点击失败:', e.message);
  }

  // 等待页面跳转和加载
  await window.waitForTimeout(5000);
  await window.screenshot({ path: 'final-03-episode.png' });

  // 检查 URL
  const url = await window.evaluate(() => window.location.href);
  console.log('URL:', url);

  // 4. 使用 Playwright 的 tab 选择功能
  console.log('\n步骤4: 点击分镜 tab...');

  // 使用 getByRole 选择 tab
  try {
    // Element Plus tabs 使用 role="tab"
    const storyboardTab = window.getByRole('tab').filter({ hasText: '分镜' });
    const count = await storyboardTab.count();
    console.log('找到分镜 tab 数:', count);

    if (count > 0) {
      // 使用 force: true 绕过可见性检查
      await storyboardTab.first().click({ force: true, timeout: 10000 });
      console.log('点击分镜 tab 成功（force）');
    } else {
      // 备选：直接点击包含"④ 分镜"文本的元素
      const tabLocator = window.locator('.el-tabs__item').filter({ hasText: '分镜' });
      await tabLocator.click({ force: true, timeout: 10000 });
      console.log('通过 el-tabs__item 点击成功');
    }
  } catch (e) {
    console.log('点击分镜 tab 失败:', e.message);
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'final-04-storyboard-tab.png' });

  // 5. 检查分镜界面
  console.log('\n步骤5: 检查分镜界面...');
  await window.waitForTimeout(2000);

  const pageText = await window.evaluate(() => document.body.innerText);
  console.log('分镜页面关键词:');
  console.log('- AI 填充:', pageText.includes('AI 填充'));
  console.log('- shot-card:', pageText.includes('shot-card'));
  console.log('- 生成分镜:', pageText.includes('生成分镜'));
  console.log('- 选择场景:', pageText.includes('选择场景'));

  // 查找 shot-card-v2
  const shotCards = await window.$$('.shot-card-v2');
  console.log('shot-card-v2 数:', shotCards.length);

  // 检查场景选择器
  const sceneSelector = await window.$$('[class*="scene-selector"], [class*="scene-list"]');
  console.log('场景选择器数:', sceneSelector.length);

  // 如果需要选择场景
  if (shotCards.length === 0) {
    // 查找场景列表项
    const sceneItems = await window.$$('.scene-item, [class*="scene"]');
    console.log('场景元素数:', sceneItems.length);

    for (const item of sceneItems) {
      const text = await item.evaluate(el => el.innerText);
      if (text && text.length > 5) {
        console.log('场景:', text.substring(0, 30));
      }
    }

    // 点击第一个场景
    if (sceneItems.length > 0) {
      console.log('点击第一个场景...');
      try {
        await sceneItems[0].click({ timeout: 10000 });
        await window.waitForTimeout(3000);
        console.log('点击场景成功');
      } catch (e) {
        console.log('点击场景失败:', e.message);
      }
    }
  }

  await window.screenshot({ path: 'final-05-after-scene.png' });

  // 再次检查分镜卡片
  const shotCardsFinal = await window.$$('.shot-card-v2');
  console.log('最终 shot-card-v2 数:', shotCardsFinal.length);

  // 6. 点击分镜卡片
  if (shotCardsFinal.length > 0) {
    console.log('\n步骤6: 点击分镜卡片...');
    try {
      // 确保元素可见
      await shotCardsFinal[0].evaluate(el => el.scrollIntoViewIfNeeded());
      await window.waitForTimeout(500);
      await shotCardsFinal[0].click({ timeout: 10000 });
      console.log('点击分镜卡片成功');
      await window.waitForTimeout(2000);
    } catch (e) {
      console.log('点击失败:', e.message);
      // 尝试 force 点击
      try {
        await shotCardsFinal[0].click({ force: true, timeout: 5000 });
        console.log('Force 点击成功');
      } catch (e2) {
        console.log('Force 点击也失败:', e2.message);
      }
    }

    await window.screenshot({ path: 'final-06-card-selected.png' });

    // 7. 点击 AI 填充按钮
    console.log('\n步骤7: 点击 AI 填充...');
    await window.waitForTimeout(1000);

    // 使用 locator 精确查找
    const aiButton = window.locator('button').filter({ hasText: 'AI 填充' });
    const btnCount = await aiButton.count();
    console.log('找到 AI 填充按钮数:', btnCount);

    if (btnCount > 0) {
      const buttonText = await aiButton.first().textContent();
      console.log('按钮文本:', buttonText);

      await window.screenshot({ path: 'final-07-before-ai.png' });

      try {
        await aiButton.first().click({ timeout: 15000 });
        console.log('点击 AI 填充按钮成功');

        // 等待 AI 响应
        console.log('等待 AI 响应（30秒）...');
        await window.waitForTimeout(30000);

        await window.screenshot({ path: 'final-08-after-ai.png' });
        console.log('截图: final-08-after-ai.png');

        // 检查结果
        const resultText = await window.evaluate(() => document.body.innerText);
        console.log('\nAI 填充结果检查:');
        console.log('- 景别:', resultText.includes('远景') || resultText.includes('中景') || resultText.includes('特写'));
        console.log('- 角度:', resultText.includes('平视') || resultText.includes('俯拍') || resultText.includes('仰拍'));
        console.log('- 运镜:', resultText.includes('固定') || resultText.includes('推') || resultText.includes('摇'));
        console.log('- 焦距:', resultText.includes('mm'));
        console.log('- 光圈:', resultText.includes('f/'));
        console.log('- 光线:', resultText.includes('光线'));

        // 检查是否有填充错误提示
        console.log('- 填充失败:', resultText.includes('填充失败') || resultText.includes('失败'));
        console.log('- AI 填充中:', resultText.includes('AI 填充中'));

      } catch (e) {
        console.log('点击按钮失败:', e.message);
      }
    } else {
      // 备选：遍历所有按钮
      const allButtons = await window.$$('button');
      console.log('所有按钮数:', allButtons.length);

      for (const btn of allButtons) {
        const text = await btn.evaluate(el => el.innerText);
        if (text.includes('AI 填充') || text.includes('✨')) {
          console.log('找到按钮:', text);
          await btn.click({ force: true });
          console.log('点击成功');
          await window.waitForTimeout(30000);

          await window.screenshot({ path: 'final-08-after-ai.png' });
          break;
        }
      }
    }
  } else {
    console.log('\n未找到分镜卡片');

    // 打印页面结构帮助诊断
    const html = await window.evaluate(() => {
      const tabs = document.querySelectorAll('.el-tabs__content');
      let result = 'Tabs content 数: ' + tabs.length + '\n';
      for (const tab of tabs) {
        result += 'Tab content innerHTML 前 200 字: ' + tab.innerHTML.substring(0, 200) + '\n';
      }
      return result;
    });
    console.log('页面结构:', html);
  }

  await app.close();
  console.log('\n测试完成');
})();