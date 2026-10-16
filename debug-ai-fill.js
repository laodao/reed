const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: 'C:/Users/daoge/code/project/the-bot'
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('networkidle');
  await window.waitForTimeout(3000);

  // 导航到分镜界面
  await window.getByRole('navigation').getByText('剧集制作').click({ timeout: 10000 });
  await window.waitForTimeout(2000);

  // 点击项目
  await window.evaluate(() => {
    document.querySelectorAll('article').forEach(a => {
      if (a.innerText.includes('杜十娘')) a.click();
    });
  });
  await window.waitForTimeout(3000);

  // 点击第1集
  await window.evaluate(() => {
    document.querySelectorAll('[class*="episode"]').forEach(e => {
      if (e.innerText.includes('第') && e.innerText.includes('1') && e.innerText.includes('集')) e.click();
    });
  });
  await window.waitForTimeout(5000);

  // 点击分镜 tab
  await window.evaluate(() => {
    document.querySelectorAll('.el-tabs__item').forEach(t => {
      if (t.innerText.includes('分镜') || t.innerText.includes('④')) t.click();
    });
  });
  await window.waitForTimeout(3000);

  // 点击第一个分镜卡片
  await window.evaluate(() => {
    const cards = document.querySelectorAll('.shot-card-v2');
    if (cards.length > 0) cards[0].click();
  });
  await window.waitForTimeout(2000);

  // 截图：AI 填充前
  await window.screenshot({ path: 'debug-01-before-ai.png', fullPage: true });
  console.log('截图1: debug-01-before-ai.png');

  // 检查编辑面板当前状态
  const beforeState = await window.evaluate(() => {
    const panel = document.querySelector('.edit-panel');
    if (!panel) return '没有编辑面板';

    // 找焦距/光圈/相机风格/打光的下拉框
    const selects = panel.querySelectorAll('.el-select');
    const values = [];
    selects.forEach(s => {
      const label = s.closest('.tool-item')?.querySelector('.tool-label')?.innerText;
      const input = s.querySelector('input');
      values.push({ label: label || '', value: input?.value || '' });
    });

    return {
      panelText: panel.innerText.substring(0, 300),
      selectValues: values
    };
  });
  console.log('\nAI 填充前编辑面板状态:', JSON.stringify(beforeState, null, 2));

  // 点击 AI 填充按钮
  await window.evaluate(() => {
    document.querySelectorAll('button').forEach(b => {
      if (b.innerText.includes('AI 填充') || b.innerText.includes('✨')) b.click();
    });
  });
  console.log('点击了 AI 填充按钮，等待 40 秒...');
  await window.waitForTimeout(40000);

  // 截图：AI 填充后
  await window.screenshot({ path: 'debug-02-after-ai.png', fullPage: true });
  console.log('截图2: debug-02-after-ai.png');

  // 检查编辑面板填充后状态
  const afterState = await window.evaluate(() => {
    const panel = document.querySelector('.edit-panel');
    if (!panel) return '没有编辑面板';

    const selects = panel.querySelectorAll('.el-select');
    const values = [];
    selects.forEach(s => {
      const label = s.closest('.tool-item')?.querySelector('.tool-label')?.innerText;
      const input = s.querySelector('input');
      values.push({ label: label || '', value: input?.value || '', placeholder: input?.placeholder || '' });
    });

    // 检查是否有成功/失败提示
    const messages = document.querySelectorAll('.el-message');
    const msgTexts = messages.map(m => m.innerText);

    return {
      panelText: panel.innerText.substring(0, 400),
      selectValues: values,
      messages: msgTexts
    };
  });
  console.log('\nAI 填充后编辑面板状态:', JSON.stringify(afterState, null, 2));

  await app.close();
  console.log('\n测试完成，截图保存在项目根目录');
})();