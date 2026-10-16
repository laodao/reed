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

  // 截图初始状态
  await window.screenshot({ path: 'test-01-init.png' });
  console.log('截图: test-01-init.png');

  // 1. 点击剧集制作
  console.log('点击剧集制作...');
  try {
    await window.click('text=剧集制作', { timeout: 10000 });
    await window.waitForTimeout(3000);
  } catch (e) {
    console.log('点击剧集制作失败:', e.message);
    // 尝试其他方式
    const menuItems = await window.$$('li, .menu-item, [role="menuitem"]');
    for (const item of menuItems) {
      const text = await item.evaluate(el => el.innerText);
      if (text.includes('剧集制作')) {
        await item.click();
        break;
      }
    }
  }

  await window.screenshot({ path: 'test-02-after-menu.png' });
  console.log('截图: test-02-after-menu.png');

  // 2. 点击进入剧集（选择第一个项目）
  console.log('查找并点击剧集...');
  await window.waitForTimeout(2000);

  // 找项目卡片或列表项
  const projectCards = await window.$$('[class*="project"], [class*="card"], [class*="episode"]');
  console.log('找到可能的剧集元素数:', projectCards.length);

  // 尝试找"第 1 集"或任何剧集项
  let clickedEpisode = false;
  for (const card of projectCards) {
    const text = await card.evaluate(el => el.innerText);
    console.log('元素文本:', text.substring(0, 50));
    if (text.includes('第') || text.includes('集') || text.includes('测试')) {
      try {
        await card.click({ timeout: 5000 });
        clickedEpisode = true;
        console.log('点击了:', text.substring(0, 30));
        break;
      } catch (e) {
        console.log('点击失败:', e.message);
      }
    }
  }

  if (!clickedEpisode) {
    // 尝试直接点击包含数字的元素
    await window.click('text=/第 \\d+ 集/', { timeout: 5000 }).catch(() => {});
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'test-03-after-episode.png' });
  console.log('截图: test-03-after-episode.png');

  // 3. 点击分镜阶段
  console.log('查找分镜阶段按钮...');
  await window.waitForTimeout(2000);

  // 查找阶段按钮
  const stageButtons = await window.$$('button, [role="button"], .stage-btn, .stage-item');
  console.log('找到可能的阶段按钮数:', stageButtons.length);

  for (const btn of stageButtons) {
    const text = await btn.evaluate(el => el.innerText || el.textContent);
    if (text.includes('分镜') || text.includes('④')) {
      console.log('找到分镜阶段按钮:', text);
      try {
        await btn.click({ timeout: 5000 });
        console.log('点击了分镜阶段');
        await window.waitForTimeout(3000);
        break;
      } catch (e) {
        console.log('点击分镜阶段失败:', e.message);
      }
    }
  }

  await window.screenshot({ path: 'test-04-after-stage.png' });
  console.log('截图: test-04-after-stage.png');

  // 4. 查找并点击分镜卡片
  console.log('查找分镜卡片...');
  await window.waitForTimeout(2000);

  // 使用精确的 shot-card-v2 选择器
  const shotCards = await window.$$('.shot-card-v2');
  console.log('找到 shot-card-v2 数:', shotCards.length);

  if (shotCards.length > 0) {
    // 点击第一个分镜卡片
    console.log('点击第一个分镜卡片...');
    try {
      await shotCards[0].click({ timeout: 10000 });
      console.log('成功点击分镜卡片');
      await window.waitForTimeout(2000);
    } catch (e) {
      console.log('点击分镜卡片失败:', e.message);
      // 尝试滚动后再点击
      await shotCards[0].evaluate(el => el.scrollIntoViewIfNeeded());
      await window.waitForTimeout(500);
      await shotCards[0].click({ timeout: 10000 }).catch(() => console.log('滚动后仍失败'));
    }
  } else {
    console.log('没有找到分镜卡片，尝试其他选择器...');
    const cards = await window.$$('[class*="shot"], [class*="card"]');
    console.log('找到其他卡片数:', cards.length);
    if (cards.length > 0) {
      await cards[0].click({ timeout: 10000 });
    }
  }

  await window.screenshot({ path: 'test-05-after-card-click.png' });
  console.log('截图: test-05-after-card-click.png');

  // 5. 查找并点击 AI 填充按钮
  console.log('查找 AI 填充按钮...');
  await window.waitForTimeout(2000);

  // AI 填充按钮应该在编辑面板中
  const aiButtons = await window.$$('button');
  let foundAiButton = false;

  for (const btn of aiButtons) {
    const text = await btn.evaluate(el => el.innerText);
    if (text.includes('AI 填充') || text.includes('✨')) {
      console.log('找到 AI 填充按钮:', text);
      foundAiButton = true;

      try {
        // 确保按钮可见
        await btn.evaluate(el => el.scrollIntoViewIfNeeded());
        await window.waitForTimeout(500);

        // 截图 AI 填充前状态
        await window.screenshot({ path: 'test-06-before-ai-fill.png' });
        console.log('截图: test-06-before-ai-fill.png');

        // 点击 AI 填充
        await btn.click({ timeout: 15000 });
        console.log('点击了 AI 填充按钮');

        // 等待 AI 响应（最多 30 秒）
        console.log('等待 AI 响应...');
        await window.waitForTimeout(30000);

        // 截图 AI 填充后状态
        await window.screenshot({ path: 'test-07-after-ai-fill.png' });
        console.log('截图: test-07-after-ai-fill.png');

        // 检查页面内容变化
        const afterText = await window.evaluate(() => document.body.innerText);
        console.log('\nAI 填充后页面关键词检查:');
        console.log('- 景别:', afterText.includes('远景') || afterText.includes('中景') || afterText.includes('特写'));
        console.log('- 角度:', afterText.includes('平视') || afterText.includes('俯拍') || afterText.includes('仰拍'));
        console.log('- 运镜:', afterText.includes('固定') || afterText.includes('推') || afterText.includes('摇'));
        console.log('- 焦距:', afterText.includes('mm') || afterText.includes('焦距'));
        console.log('- 光圈:', afterText.includes('f/') || afterText.includes('光圈'));
        console.log('- 光线:', afterText.includes('光线') || afterText.includes('照明'));

        break;
      } catch (e) {
        console.log('点击 AI 填充按钮失败:', e.message);
      }
    }
  }

  if (!foundAiButton) {
    console.log('未找到 AI 填充按钮，检查页面状态...');
    const pageText = await window.evaluate(() => document.body.innerText);
    console.log('页面包含的关键词:');
    console.log('- AI:', pageText.includes('AI'));
    console.log('- 填充:', pageText.includes('填充'));
    console.log('- 分镜:', pageText.includes('分镜'));
    console.log('- 编辑:', pageText.includes('编辑'));
  }

  await app.close();
  console.log('\n测试完成');
})();