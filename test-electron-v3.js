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
  await window.screenshot({ path: 'e2e-01-init.png' });
  console.log('截图: e2e-01-init.png');

  // 获取初始页面内容
  const initText = await window.evaluate(() => document.body.innerText);
  console.log('初始页面关键词:');
  console.log('- 剧集制作:', initText.includes('剧集制作'));
  console.log('- 剧集项目:', initText.includes('剧集项目'));

  // 1. 点击剧集制作菜单
  console.log('\n步骤1: 点击剧集制作...');
  try {
    // 精确匹配"剧集制作"文本
    await window.locator('text=剧集制作').click({ timeout: 10000 });
    await window.waitForTimeout(3000);
    console.log('点击剧集制作成功');
  } catch (e) {
    console.log('点击剧集制作失败:', e.message);
    // 尝试其他方式
    const buttons = await window.$$('button');
    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.innerText);
      if (text === '剧集制作') {
        await btn.click();
        console.log('通过 button 点击剧集制作');
        break;
      }
    }
  }

  await window.screenshot({ path: 'e2e-02-after-menu.png' });
  console.log('截图: e2e-02-after-menu.png');

  // 2. 点击具体剧集（杜十娘2 或其他）
  console.log('\n步骤2: 点击具体剧集...');
  await window.waitForTimeout(2000);

  // 尝试点击项目卡片
  const projectCards = await window.$$('[class*="project-card"], [class*="project-item"], .card');
  console.log('找到项目卡片数:', projectCards.length);

  for (const card of projectCards) {
    const text = await card.evaluate(el => el.innerText);
    console.log('卡片文本:', text.substring(0, 50).replace(/\n/g, ' '));
  }

  // 使用 locator 点击包含"杜十娘"的项目
  try {
    await window.locator('text=/杜十娘/').first().click({ timeout: 10000 });
    console.log('点击杜十娘项目成功');
    await window.waitForTimeout(2000);
  } catch (e) {
    console.log('点击杜十娘失败:', e.message);
    // 尝试点击其他项目
    try {
      await window.locator('[class*="card"]').first().click({ timeout: 5000 });
      console.log('点击第一个卡片');
    } catch (e2) {
      console.log('点击第一个卡片失败:', e2.message);
    }
  }

  await window.screenshot({ path: 'e2e-03-after-project.png' });
  console.log('截图: e2e-03-after-project.png');

  // 3. 点击具体的集数
  console.log('\n步骤3: 点击具体集数...');
  await window.waitForTimeout(2000);

  const pageText = await window.evaluate(() => document.body.innerText);
  console.log('当前页面关键词:');
  console.log('- 第 1 集:', pageText.includes('第 1 集'));
  console.log('- 第 2 集:', pageText.includes('第 2 集'));

  try {
    await window.locator('text=/第 1 集/').click({ timeout: 10000 });
    console.log('点击第 1 集成功');
    await window.waitForTimeout(3000);
  } catch (e) {
    console.log('点击第 1 集失败:', e.message);
    // 尝试其他方式
    const items = await window.$$('[class*="episode-item"], [class*="episode"], li, .item');
    for (const item of items) {
      const text = await item.evaluate(el => el.innerText);
      if (text.includes('第') && text.includes('集')) {
        await item.click();
        console.log('点击了:', text);
        break;
      }
    }
  }

  await window.screenshot({ path: 'e2e-04-after-episode.png' });
  console.log('截图: e2e-04-after-episode.png');

  // 4. 查找并点击分镜阶段按钮
  console.log('\n步骤4: 点击分镜阶段...');
  await window.waitForTimeout(2000);

  const stagePageText = await window.evaluate(() => document.body.innerText);
  console.log('剧集详情页面关键词:');
  console.log('- ④:', stagePageText.includes('④'));
  console.log('- 分镜:', stagePageText.includes('分镜'));
  console.log('- Stage:', stagePageText.includes('Stage'));

  // 查找阶段导航
  const stageNav = await window.$$('[class*="stage"], [class*="nav-step"], [class*="progress"]');
  console.log('找到阶段导航元素数:', stageNav.length);

  // 尝试精确点击"④ 分镜"
  try {
    // 先找包含"④"的元素
    const stage4Locator = window.locator('text=/④/');
    const count = await stage4Locator.count();
    console.log('找到包含④的元素数:', count);

    if (count > 0) {
      // 点击包含分镜的那个
      for (let i = 0; i < count; i++) {
        const el = stage4Locator.nth(i);
        const text = await el.textContent();
        if (text.includes('分镜')) {
          await el.click({ timeout: 10000 });
          console.log('点击了 ④ 分镜');
          break;
        }
      }
    }
  } catch (e) {
    console.log('点击④分镜失败:', e.message);
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'e2e-05-after-stage-click.png' });
  console.log('截图: e2e-05-after-stage-click.png');

  // 5. 查找分镜卡片
  console.log('\n步骤5: 查找分镜卡片...');
  await window.waitForTimeout(2000);

  const storyboardPageText = await window.evaluate(() => document.body.innerText);
  console.log('分镜页面关键词:');
  console.log('- shot-card:', storyboardPageText.includes('shot-card'));
  console.log('- 分镜列表:', storyboardPageText.includes('分镜列表') || storyboardPageText.includes('分镜'));
  console.log('- AI 填充:', storyboardPageText.includes('AI 填充'));
  console.log('- 为本场景生成分镜:', storyboardPageText.includes('为本场景生成分镜'));

  // 使用精确选择器
  const shotCards = await window.$$('.shot-card-v2');
  console.log('找到 shot-card-v2 数:', shotCards.length);

  // 如果没有找到，检查是否有其他卡片
  if (shotCards.length === 0) {
    const otherCards = await window.$$('[class*="shot"], [class*="storyboard"]');
    console.log('找到其他分镜相关元素数:', otherCards.length);
  }

  // 检查是否有"选择场景"的提示
  if (storyboardPageText.includes('选择场景') || storyboardPageText.includes('选择一个场景')) {
    console.log('页面提示需要先选择场景，尝试点击场景...');
    // 尝试点击场景列表
    try {
      const sceneItems = await window.$$('[class*="scene-item"], [class*="scene"]');
      if (sceneItems.length > 0) {
        await sceneItems[0].click();
        await window.waitForTimeout(2000);
        console.log('点击了第一个场景');
      }
    } catch (e) {
      console.log('点击场景失败:', e.message);
    }
  }

  await window.screenshot({ path: 'e2e-06-storyboard-page.png' });
  console.log('截图: e2e-06-storyboard-page.png');

  // 再次检查分镜卡片
  const shotCardsAfter = await window.$$('.shot-card-v2');
  console.log('选择场景后 shot-card-v2 数:', shotCardsAfter.length);

  if (shotCardsAfter.length > 0) {
    // 6. 点击分镜卡片选中
    console.log('\n步骤6: 点击分镜卡片...');
    try {
      await shotCardsAfter[0].click({ timeout: 10000 });
      console.log('成功点击第一个分镜卡片');
      await window.waitForTimeout(2000);
    } catch (e) {
      console.log('点击分镜卡片失败:', e.message);
    }

    await window.screenshot({ path: 'e2e-07-after-select-card.png' });
    console.log('截图: e2e-07-after-select-card.png');

    // 7. 点击 AI 填充按钮
    console.log('\n步骤7: 点击 AI 填充按钮...');
    await window.waitForTimeout(1000);

    // 查找编辑面板中的 AI 填充按钮
    const aiButtons = await window.$$('button');
    console.log('找到按钮数:', aiButtons.length);

    for (const btn of aiButtons) {
      const text = await btn.evaluate(el => el.innerText);
      if (text.includes('AI 填充') || text.includes('✨ AI 填充')) {
        console.log('找到 AI 填充按钮:', text);

        await window.screenshot({ path: 'e2e-08-before-fill.png' });
        console.log('截图: e2e-08-before-fill.png');

        try {
          await btn.click({ timeout: 15000 });
          console.log('点击了 AI 填充按钮');

          // 等待 AI 响应
          console.log('等待 AI 响应（30秒）...');
          await window.waitForTimeout(30000);

          await window.screenshot({ path: 'e2e-09-after-fill.png' });
          console.log('截图: e2e-09-after-fill.png');

          // 检查填充结果
          const resultText = await window.evaluate(() => document.body.innerText);
          console.log('\nAI 填充后检查:');
          console.log('- 景别:', resultText.includes('远景') || resultText.includes('中景') || resultText.includes('特写'));
          console.log('- 角度:', resultText.includes('平视') || resultText.includes('俯拍') || resultText.includes('仰拍'));
          console.log('- 运镜:', resultText.includes('固定') || resultText.includes('推') || resultText.includes('摇'));
          console.log('- 焦距:', resultText.includes('mm') || resultText.includes('焦距'));
          console.log('- 光圈:', resultText.includes('f/') || resultText.includes('光圈'));
          console.log('- 光线:', resultText.includes('光线') || resultText.includes('照明'));

          break;
        } catch (e) {
          console.log('点击 AI 填充按钮失败:', e.message);
        }
      }
    }
  } else {
    console.log('没有找到分镜卡片，无法测试 AI 填充');
  }

  await app.close();
  console.log('\n测试完成');
})();