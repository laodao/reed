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

  await window.screenshot({ path: 'ai-fill-test-01-init.png' });
  console.log('截图1: ai-fill-test-01-init.png');

  // 1. 点击剧集制作
  await window.getByRole('navigation').getByText('剧集制作').click({ timeout: 10000 });
  await window.waitForTimeout(3000);

  // 2. 点击项目
  await window.waitForTimeout(2000);
  await window.evaluate(() => {
    const articles = document.querySelectorAll('article');
    for (const article of articles) {
      if (article.innerText.includes('杜十娘')) {
        article.click();
        return;
      }
    }
  });
  await window.waitForTimeout(3000);

  // 3. 点击第 1 集
  await window.waitForTimeout(2000);
  await window.evaluate(() => {
    const elements = document.querySelectorAll('[class*="episode"]');
    for (const el of elements) {
      if (el.innerText.includes('第') && el.innerText.includes('集') && el.innerText.includes('1')) {
        el.click();
        return;
      }
    }
  });
  await window.waitForTimeout(5000);

  await window.screenshot({ path: 'ai-fill-test-02-episode-page.png' });
  console.log('截图2: ai-fill-test-02-episode-page.png');

  // 4. 点击分镜 tab
  await window.evaluate(() => {
    const tabs = document.querySelectorAll('.el-tabs__item');
    for (const tab of tabs) {
      if (tab.innerText.includes('分镜') || tab.innerText.includes('④')) {
        tab.click();
        return;
      }
    }
  });
  await window.waitForTimeout(3000);

  await window.screenshot({ path: 'ai-fill-test-03-storyboard-tab.png' });
  console.log('截图3: ai-fill-test-03-storyboard-tab.png');

  // 5. 点击第一个分镜卡片
  await window.waitForTimeout(2000);
  await window.evaluate(() => {
    const shotCards = document.querySelectorAll('.shot-card-v2');
    if (shotCards.length > 0) {
      shotCards[0].click();
    }
  });
  await window.waitForTimeout(2000);

  await window.screenshot({ path: 'ai-fill-test-04-card-selected.png' });
  console.log('截图4: ai-fill-test-04-card-selected.png (选中分镜后)');

  // 6. 点击 AI 填充按钮
  await window.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.innerText.includes('AI 填充') || btn.innerText.includes('✨')) {
        btn.click();
        return;
      }
    }
  });
  console.log('点击 AI 填充按钮，等待 30 秒...');

  await window.waitForTimeout(30000);

  await window.screenshot({ path: 'ai-fill-test-05-after-ai-fill.png' });
  console.log('截图5: ai-fill-test-05-after-ai-fill.png (AI 填充后)');

  // 检查编辑面板的字段值
  const editPanelContent = await window.evaluate(() => {
    const editPanel = document.querySelector('.edit-panel');
    if (!editPanel) return '没有找到编辑面板';

    // 找所有输入框和下拉框
    const inputs = editPanel.querySelectorAll('input, select, .el-select');
    const values = [];

    for (const input of inputs) {
      const label = input.closest('.form-item, .el-form-item')?.querySelector('label, .label')?.innerText || '';
      const value = input.value || input.innerText || '';
      if (label || value) {
        values.push({ label, value });
      }
    }

    return {
      fullText: editPanel.innerText.substring(0, 500),
      inputValues: values
    };
  });

  console.log('\n编辑面板内容:', JSON.stringify(editPanelContent, null, 2));

  await app.close();
  console.log('\n测试完成，请查看截图文件:');
  console.log('1. ai-fill-test-01-init.png - 应用启动');
  console.log('2. ai-fill-test-02-episode-page.png - 剧集详情页');
  console.log('3. ai-fill-test-03-storyboard-tab.png - 分镜 tab');
  console.log('4. ai-fill-test-04-card-selected.png - 选中分镜卡片后');
  console.log('5. ai-fill-test-05-after-ai-fill.png - AI 填充后');
})();