const { _electron: electron } = require('playwright');

(async () => {
  console.log('启动 Electron...');
  const app = await electron.launch({
    args: ['.'],
    cwd: 'C:/Users/daoge/code/project/the-bot'
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('networkidle');
  await window.waitForTimeout(3000);

  // 监听所有console日志
  const allLogs = [];
  window.on('console', msg => {
    const text = msg.text();
    allLogs.push(text);
    // 实时打印AI填充相关的日志
    if (text.includes('[AI') || text.includes('填充') || text.includes('调试') || text.includes('IPC') || text.includes('meta') || text.includes('onMetaChange') || text.includes('error') || text.includes('Error') || text.includes('fail') || text.includes('返回') || text.includes('success') || text.includes('Success')) {
      console.log('[实时日志]', text.substring(0, 800));
    }
  });

  // 导航到剧集制作
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

  console.log('\n=== AI填充前状态 ===');
  const beforeState = await window.evaluate(() => {
    const panel = document.querySelector('.edit-panel');
    if (!panel) return 'no panel';

    const selects = panel.querySelectorAll('.el-select');
    const values = [];
    selects.forEach(s => {
      const wrapper = s.closest('.tool-item');
      const label = wrapper?.querySelector('.tool-label')?.innerText?.trim() || '';
      const input = s.querySelector('input');
      values.push({ label, value: input?.value || '' });
    });
    return values;
  });
  console.log(JSON.stringify(beforeState.filter(v => v.label), null, 2));

  // 只点击精确匹配的"AI 填充"按钮
  console.log('\n点击【AI 填充】按钮...');
  const clickResult = await window.evaluate(() => {
    let found = false;
    document.querySelectorAll('button').forEach(b => {
      const text = b.innerText.trim();
      if (text === '✨ AI 填充') {
        b.click();
        found = true;
      }
    });
    return found;
  });
  console.log('找到并点击:', clickResult);

  if (!clickResult) {
    console.log('没找到AI填充按钮！');
    await app.close();
    return;
  }

  // 等待2秒检查loading状态
  await window.waitForTimeout(2000);

  // 检查按钮是否进入loading状态
  const loadingState = await window.evaluate(() => {
    const btn = document.querySelector('button.el-button.is-loading');
    const btnText = document.querySelectorAll('button').forEach(b => {
      if (b.innerText.includes('AI 填充中') || b.innerText.includes('填充中')) {
        return b.innerText;
      }
    });
    // 检查是否有spinner
    const spinners = document.querySelectorAll('.el-loading-spinner, .el-icon.is-loading');
    return {
      hasLoadingBtn: !!btn,
      spinnerCount: spinners.length
    };
  });
  console.log('Loading状态:', JSON.stringify(loadingState));

  // 等待可能的确认对话框（3秒）
  await window.waitForTimeout(3000);

  // 检查是否有确认对话框并点击确认
  const dialogHandled = await window.evaluate(() => {
    // 检查是否有 el-dialog 或 el-message-box
    const dialog = document.querySelector('.el-dialog, .el-message-box');
    if (dialog) {
      console.log('发现对话框:', dialog.innerText.substring(0, 100));
      // 点击确认按钮
      const confirmBtn = dialog.querySelector('.el-button--primary, .el-dialog__footer button:last-child');
      if (confirmBtn) {
        confirmBtn.click();
        return true;
      }
    }
    return false;
  });
  console.log('处理对话框:', dialogHandled);

  // 等待AI响应
  console.log('\n等待AI响应（40秒）...\n');
  await window.waitForTimeout(40000);

  console.log('\n=== AI填充后状态 ===');
  const afterState = await window.evaluate(() => {
    const panel = document.querySelector('.edit-panel');
    if (!panel) return 'no panel';

    const selects = panel.querySelectorAll('.el-select');
    const values = [];
    selects.forEach(s => {
      const wrapper = s.closest('.tool-item');
      const label = wrapper?.querySelector('.tool-label')?.innerText?.trim() || '';
      const input = s.querySelector('input');
      values.push({ label, value: input?.value || '', placeholder: input?.placeholder || '' });
    });

    const messages = Array.from(document.querySelectorAll('.el-message')).map(m => m.innerText);
    return { selects: values.filter(v => v.label), messages };
  });
  console.log(JSON.stringify(afterState, null, 2));

  await window.screenshot({ path: 'test-ai-fill-precise.png' });
  console.log('\n截图: test-ai-fill-precise.png');

  // 打印所有收集的日志（最后100条）
  console.log('\n=== 所有日志（最后100条）===');
  allLogs.slice(-100).forEach(l => {
    console.log(l.substring(0, 500));
  });

  await app.close();
})();