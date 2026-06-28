const { _electron: electron } = require('playwright');

(async () => {
  console.log('启动Electron应用...');
  const app = await electron.launch({
    args: ['.'],
    cwd: 'C:/Users/daoge/code/project/the-bot'
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('networkidle');
  await window.waitForTimeout(3000);

  // 1. 进入剧集制作
  console.log('点击剧集制作...');
  await window.click('text=剧集制作');
  await window.waitForTimeout(2000);

  // 2. 点击进入剧集（第 1 集）
  console.log('点击进入剧集...');
  await window.click('text=第 1 集');
  await window.waitForTimeout(3000);

  await window.screenshot({ path: 'step-episode-detail.png' });
  console.log('截图: step-episode-detail.png');

  // 3. 查找分镜阶段
  const bodyText = await window.evaluate(() => document.body.innerText);
  console.log('当前页面包含关键词:', {
    '分镜': bodyText.includes('分镜'),
    '④': bodyText.includes('④'),
    'Stage': bodyText.includes('Stage'),
    'AI 填充': bodyText.includes('AI 填充')
  });

  // 尝试点击分镜阶段
  try {
    // 查找并点击包含"分镜"的按钮
    const buttons = await window.$$('button');
    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.innerText);
      if (text.includes('分镜') || text.includes('④')) {
        console.log('找到分镜按钮:', text);
        await btn.click();
        await window.waitForTimeout(3000);
        break;
      }
    }
  } catch (e) {
    console.log('点击分镜阶段失败:', e.message);
  }

  await window.screenshot({ path: 'step-storyboard.png' });
  console.log('截图: step-storyboard.png');

  // 获取最终页面内容
  const finalText = await window.evaluate(() => document.body.innerText);
  console.log('\n最终页面内容（前3000字）:\n', finalText.substring(0, 3000));

  // 查找AI填充按钮
  const aiButtons = await window.$$('button');
  for (const btn of aiButtons) {
    const text = await btn.evaluate(el => el.innerText);
    if (text.includes('AI 填充')) {
      console.log('\n找到AI填充按钮!');

      // 先选择一个分镜卡片
      const cards = await window.$$('[class*="card"], [class*="storyboard"], [class*="shot"]');
      console.log('找到卡片数:', cards.length);

      if (cards.length > 0) {
        await cards[0].click();
        await window.waitForTimeout(1000);
        console.log('点击了第一个分镜卡片');
      }

      // 点击AI填充
      await btn.click();
      console.log('点击AI填充按钮');

      // 等待AI响应
      await window.waitForTimeout(15000);

      await window.screenshot({ path: 'after-ai-fill.png' });
      console.log('截图: after-ai-fill.png');

      // 查看填充后的内容
      const afterText = await window.evaluate(() => document.body.innerText);
      console.log('\nAI填充后页面内容变化:');
      console.log('- 景别:', afterText.includes('远景') || afterText.includes('中景'));
      console.log('- 角度:', afterText.includes('平视') || afterText.includes('俯拍'));
      console.log('- 运镜:', afterText.includes('固定') || afterText.includes('推'));
      break;
    }
  }

  await app.close();
  console.log('\n测试完成');
})();