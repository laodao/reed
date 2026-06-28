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

  await window.screenshot({ path: 'nav-01-init.png' });
  console.log('截图: nav-01-init.png');

  // 1. 点击导航菜单中的"剧集制作"（精确选择导航项）
  console.log('\n步骤1: 点击导航菜单中的剧集制作...');

  // 使用 role 选择导航项
  try {
    const navItem = window.getByRole('navigation').getByText('剧集制作');
    await navItem.click({ timeout: 10000 });
    console.log('点击导航菜单成功');
    await window.waitForTimeout(3000);
  } catch (e) {
    console.log('点击导航菜单失败:', e.message);

    // 备选方案：找 li 或导航项
    const navItems = await window.$$('li, .nav-item, [role="menuitem"]');
    console.log('找到导航项数:', navItems.length);
    for (const item of navItems) {
      const text = await item.evaluate(el => el.innerText);
      if (text.includes('剧集制作')) {
        await item.click();
        console.log('通过 li 点击剧集制作');
        break;
      }
    }
  }

  await window.screenshot({ path: 'nav-02-after-menu.png' });
  console.log('截图: nav-02-after-menu.png');

  // 获取页面内容
  const menuText = await window.evaluate(() => document.body.innerText);
  console.log('点击菜单后页面关键词:');
  console.log('- 杜十娘:', menuText.includes('杜十娘'));
  console.log('- 新建:', menuText.includes('新建'));
  console.log('- 项目:', menuText.includes('项目'));

  // 2. 查找并点击项目列表中的项目
  console.log('\n步骤2: 点击项目...');
  await window.waitForTimeout(2000);

  // 找项目列表容器
  const projectList = await window.$$('.project-list, .list, [class*="grid"], [class*="cards"]');
  console.log('找到列表容器数:', projectList.length);

  // 找所有可点击的项目项
  const allClickable = await window.$$('article, [class*="item"], [class*="entry"], .card, li');
  console.log('找到可点击元素数:', allClickable.length);

  // 打印每个元素的文本帮助识别
  for (let i = 0; i < Math.min(10, allClickable.length); i++) {
    const text = await allClickable[i].evaluate(el => el.innerText?.substring(0, 60));
    if (text && text.length > 5) {
      console.log(`元素${i}: ${text.replace(/\n/g, ' ').substring(0, 50)}`);
    }
  }

  // 点击第一个有意义的项目项
  for (const el of allClickable) {
    const text = await el.evaluate(el => el.innerText);
    // 排除标题和按钮
    if (text && text.length > 10 && !text.includes('剧集制作') && !text.includes('新建')) {
      try {
        await el.click({ timeout: 5000 });
        console.log('点击了:', text.substring(0, 30).replace(/\n/g, ' '));
        break;
      } catch (e) {
        // 继续尝试下一个
      }
    }
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'nav-03-after-project.png' });
  console.log('截图: nav-03-after-project.png');

  // 3. 查找剧集列表并点击某一集
  console.log('\n步骤3: 点击剧集...');
  await window.waitForTimeout(2000);

  const projectPageText = await window.evaluate(() => document.body.innerText);
  console.log('项目页面关键词:');
  console.log('- 第 1 集:', projectPageText.includes('第 1 集'));
  console.log('- 集:', projectPageText.includes('集'));
  console.log('- 剧集列表:', projectPageText.includes('剧集列表'));

  // 找剧集项
  const episodeItems = await window.$$('[class*="episode"], [class*="chapter"], [class*="part"]');
  console.log('找到剧集项数:', episodeItems.length);

  if (episodeItems.length > 0) {
    for (const item of episodeItems) {
      const text = await item.evaluate(el => el.innerText);
      console.log('剧集项:', text.substring(0, 30));
      if (text.includes('第') && text.includes('集')) {
        try {
          await item.click({ timeout: 5000 });
          console.log('点击了剧集:', text);
          break;
        } catch (e) {
          console.log('点击剧集失败:', e.message);
        }
      }
    }
  } else {
    // 尝试其他方式
    const allItems = await window.$$('li, .item, [role="listitem"]');
    for (const item of allItems) {
      const text = await item.evaluate(el => el.innerText);
      if (text.includes('第') && text.includes('集')) {
        await item.click();
        console.log('通过其他选择器点击:', text);
        break;
      }
    }
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'nav-04-after-episode.png' });
  console.log('截图: nav-04-after-episode.png');

  // 4. 查找分镜阶段
  console.log('\n步骤4: 查找分镜阶段...');
  await window.waitForTimeout(2000);

  const episodePageText = await window.evaluate(() => document.body.innerText);
  console.log('剧集页面关键词:');
  console.log('- ④:', episodePageText.includes('④'));
  console.log('- 分镜:', episodePageText.includes('分镜'));
  console.log('- Stage:', episodePageText.includes('Stage'));
  console.log('- 阶段:', episodePageText.includes('阶段'));

  // 找阶段导航（可能是进度条、步骤条等）
  const stageButtons = await window.$$('[class*="stage"], [class*="step"], [class*="phase"], [class*="progress"] button, [class*="stage"] div');
  console.log('找到阶段按钮数:', stageButtons.length);

  // 打印所有阶段按钮文本
  for (const btn of stageButtons) {
    const text = await btn.evaluate(el => el.innerText);
    if (text && text.length > 0) {
      console.log('阶段按钮:', text.substring(0, 30));
    }
  }

  // 点击分镜阶段
  for (const btn of stageButtons) {
    const text = await btn.evaluate(el => el.innerText);
    if (text.includes('分镜') || text.includes('④') || text.includes('4')) {
      try {
        await btn.click({ timeout: 5000 });
        console.log('点击了分镜阶段:', text);
        break;
      } catch (e) {
        console.log('点击分镜阶段失败:', e.message);
      }
    }
  }

  await window.waitForTimeout(3000);
  await window.screenshot({ path: 'nav-05-after-stage.png' });
  console.log('截图: nav-05-after-stage.png');

  // 5. 分镜界面
  console.log('\n步骤5: 检查分镜界面...');
  await window.waitForTimeout(2000);

  const storyboardText = await window.evaluate(() => document.body.innerText);
  console.log('分镜页面关键词:');
  console.log('- shot-card:', storyboardText.includes('shot-card'));
  console.log('- AI 填充:', storyboardText.includes('AI 填充'));
  console.log('- 分镜:', storyboardText.includes('分镜'));
  console.log('- 生成分镜:', storyboardText.includes('生成分镜'));

  // 找分镜卡片
  const shotCards = await window.$$('.shot-card-v2');
  console.log('找到 shot-card-v2 数:', shotCards.length);

  if (shotCards.length === 0) {
    // 尝试其他选择器
    const otherCards = await window.$$('[class*="shot"], [class*="storyboard"], article');
    console.log('找到其他卡片数:', otherCards.length);
  }

  // 检查是否需要先选择场景
  if (storyboardText.includes('选择场景') || storyboardText.includes('请选择')) {
    console.log('需要先选择场景...');
    const sceneItems = await window.$$('[class*="scene"], [class*="script"]');
    if (sceneItems.length > 0) {
      await sceneItems[0].click();
      await window.waitForTimeout(2000);
      console.log('点击了第一个场景');
    }
  }

  await window.screenshot({ path: 'nav-06-storyboard.png' });
  console.log('截图: nav-06-storyboard.png');

  // 再次检查分镜卡片
  const finalShotCards = await window.$$('.shot-card-v2');
  console.log('最终 shot-card-v2 数:', finalShotCards.length);

  if (finalShotCards.length > 0) {
    // 点击第一个分镜
    console.log('\n步骤6: 点击分镜卡片...');
    try {
      await finalShotCards[0].click({ timeout: 10000 });
      console.log('成功点击分镜卡片');
      await window.waitForTimeout(2000);
    } catch (e) {
      console.log('点击分镜卡片失败:', e.message);
    }

    await window.screenshot({ path: 'nav-07-card-selected.png' });
    console.log('截图: nav-07-card-selected.png');

    // 点击 AI 填充
    console.log('\n步骤7: 点击 AI 填充...');
    const buttons = await window.$$('button');
    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.innerText);
      if (text.includes('AI 填充') || text.includes('✨')) {
        console.log('找到 AI 填充按钮:', text);

        await window.screenshot({ path: 'nav-08-before-fill.png' });
        await btn.click({ timeout: 15000 });
        console.log('点击 AI 填充按钮成功');

        console.log('等待 AI 响应...');
        await window.waitForTimeout(30000);

        await window.screenshot({ path: 'nav-09-after-fill.png' });
        console.log('截图: nav-09-after-fill.png');

        // 检查结果
        const resultText = await window.evaluate(() => document.body.innerText);
        console.log('\nAI 填充结果检查:');
        console.log('- 景别:', resultText.includes('远景') || resultText.includes('中景'));
        console.log('- 角度:', resultText.includes('平视') || resultText.includes('俯拍'));
        console.log('- 运镜:', resultText.includes('固定') || resultText.includes('推'));
        break;
      }
    }
  } else {
    console.log('未找到分镜卡片');
  }

  await app.close();
  console.log('\n测试完成');
})();