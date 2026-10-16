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

  await window.screenshot({ path: 'full-01-init.png' });
  console.log('截图: full-01-init.png');

  // 1. 点击导航中的"剧集制作"
  console.log('\n步骤1: 点击剧集制作导航...');
  try {
    await window.getByRole('navigation').getByText('剧集制作').click({ timeout: 10000 });
    console.log('点击成功');
    await window.waitForTimeout(3000);
  } catch (e) {
    console.log('失败:', e.message);
  }

  await window.screenshot({ path: 'full-02-menu.png' });

  // 2. 点击项目卡片
  console.log('\n步骤2: 点击项目卡片...');
  await window.waitForTimeout(2000);

  // 找项目卡片（article 元素）
  const articles = await window.$$('article');
  console.log('找到 article 数:', articles.length);

  for (const article of articles) {
    const text = await article.evaluate(el => el.innerText);
    console.log('Article:', text.substring(0, 40).replace(/\n/g, ' '));
  }

  // 点击第一个包含"杜十娘"的 article
  for (const article of articles) {
    const text = await article.evaluate(el => el.innerText);
    if (text.includes('杜十娘')) {
      await article.click();
      console.log('点击杜十娘项目');
      break;
    }
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'full-03-project.png' });

  // 3. 点击剧集项（第 1 集）
  console.log('\n步骤3: 点击第 1 集...');
  await window.waitForTimeout(2000);

  // 查找剧集列表项
  const episodeItems = await window.$$('[class*="episode"]');
  console.log('找到 episode 元素数:', episodeItems.length);

  // 打印所有 episode 元素文本
  for (const item of episodeItems) {
    const text = await item.evaluate(el => el.innerText);
    console.log('Episode:', text.substring(0, 40).replace(/\n/g, ' '));
  }

  // 尝试精确点击"第 1 集"
  try {
    // 使用 locator 精确匹配
    const episodeLocator = window.locator('text=/第\\s*1\\s*集/');
    const count = await episodeLocator.count();
    console.log('找到"第 1 集"元素数:', count);

    if (count > 0) {
      await episodeLocator.first().click({ timeout: 10000 });
      console.log('点击第 1 集成功');
    }
  } catch (e) {
    console.log('Locator 点击失败:', e.message);

    // 备选：遍历 episode 元素
    for (const item of episodeItems) {
      const text = await item.evaluate(el => el.innerText);
      if (text.includes('第') && text.includes('集')) {
        await item.click();
        console.log('通过遍历点击:', text.substring(0, 20));
        break;
      }
    }
  }

  // 等待页面跳转
  await window.waitForTimeout(5000);
  await window.screenshot({ path: 'full-04-episode.png' });

  // 检查当前 URL（通过 evaluate）
  const currentUrl = await window.evaluate(() => window.location.href);
  console.log('当前 URL:', currentUrl);

  // 检查页面内容
  const episodePageText = await window.evaluate(() => document.body.innerText);
  console.log('\n剧集页面关键词检查:');
  console.log('- ④ 分镜:', episodePageText.includes('④ 分镜') || episodePageText.includes('分镜'));
  console.log('- Stage:', episodePageText.includes('Stage'));
  console.log('- el-tabs:', episodePageText.includes('el-tabs'));

  // 4. 尝试点击分镜 tab
  console.log('\n步骤4: 点击分镜 tab...');

  // 查找 el-tabs 结构
  const tabPanes = await window.$$('.el-tabs__item');
  console.log('找到 tab 项数:', tabPanes.length);

  for (const tab of tabPanes) {
    const text = await tab.evaluate(el => el.innerText);
    console.log('Tab:', text);
  }

  // 点击包含"分镜"的 tab
  for (const tab of tabPanes) {
    const text = await tab.evaluate(el => el.innerText);
    if (text.includes('分镜') || text.includes('④')) {
      await tab.click();
      console.log('点击分镜 tab');
      break;
    }
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'full-05-storyboard-tab.png' });

  // 5. 检查分镜界面
  console.log('\n步骤5: 检查分镜界面...');
  const storyboardText = await window.evaluate(() => document.body.innerText);
  console.log('分镜界面关键词:');
  console.log('- shot-card-v2:', storyboardText.includes('shot-card'));
  console.log('- AI 填充:', storyboardText.includes('AI 填充'));
  console.log('- 生成分镜:', storyboardText.includes('生成分镜'));
  console.log('- 选择场景:', storyboardText.includes('选择场景'));

  // 查找 shot-card-v2
  const shotCards = await window.$$('.shot-card-v2');
  console.log('找到 shot-card-v2 数:', shotCards.length);

  // 如果没有分镜卡片，检查是否需要先选择场景
  if (shotCards.length === 0) {
    // 查找场景选择器
    const sceneItems = await window.$$('[class*="scene-item"], [class*="scene"]');
    console.log('找到场景元素数:', sceneItems.length);

    if (sceneItems.length > 0) {
      // 点击第一个场景
      console.log('点击第一个场景...');
      await sceneItems[0].click();
      await window.waitForTimeout(3000);

      // 再次检查分镜卡片
      const shotCardsAfter = await window.$$('.shot-card-v2');
      console.log('选择场景后 shot-card-v2 数:', shotCardsAfter.length);

      if (shotCardsAfter.length > 0) {
        shotCards.length = shotCardsAfter.length;
        shotCards[0] = shotCardsAfter[0];
      }
    }
  }

  await window.screenshot({ path: 'full-06-storyboard-content.png' });

  // 6. 如果有分镜卡片，点击并测试 AI 填充
  if (shotCards.length > 0) {
    console.log('\n步骤6: 点击分镜卡片...');
    try {
      await shotCards[0].click({ timeout: 10000 });
      console.log('点击分镜卡片成功');
      await window.waitForTimeout(2000);
    } catch (e) {
      console.log('点击失败:', e.message);
    }

    await window.screenshot({ path: 'full-07-card-selected.png' });

    // 7. 点击 AI 填充按钮
    console.log('\n步骤7: 点击 AI 填充按钮...');
    const buttons = await window.$$('button');
    console.log('找到按钮数:', buttons.length);

    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.innerText);
      if (text.includes('AI 填充') || text.includes('✨ AI')) {
        console.log('找到 AI 填充按钮:', text);

        await window.screenshot({ path: 'full-08-before-ai.png' });

        try {
          await btn.click({ timeout: 15000 });
          console.log('点击 AI 填充成功');

          // 等待 AI 响应
          console.log('等待 AI 响应（30秒）...');
          await window.waitForTimeout(30000);

          await window.screenshot({ path: 'full-09-after-ai.png' });
          console.log('截图: full-09-after-ai.png');

          // 检查结果
          const resultText = await window.evaluate(() => document.body.innerText);
          console.log('\nAI 填充结果:');
          console.log('- 景别:', resultText.includes('远景') || resultText.includes('中景') || resultText.includes('特写'));
          console.log('- 角度:', resultText.includes('平视') || resultText.includes('俯拍') || resultText.includes('仰拍'));
          console.log('- 运镜:', resultText.includes('固定') || resultText.includes('推') || resultText.includes('摇'));
          console.log('- 焦距:', resultText.includes('mm'));
          console.log('- 光圈:', resultText.includes('f/'));
          console.log('- 光线:', resultText.includes('光线'));

          break;
        } catch (e) {
          console.log('点击按钮失败:', e.message);
        }
      }
    }
  } else {
    console.log('\n未找到分镜卡片，无法测试 AI 填充');

    // 打印页面完整内容（前 500 字）
    const fullText = await window.evaluate(() => document.body.innerText);
    console.log('\n页面内容前 500 字:');
    console.log(fullText.substring(0, 500));
  }

  await app.close();
  console.log('\n测试完成');
})();