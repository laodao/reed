const { _electron: electron } = require('playwright');
const { spawn } = require('child_process');

(async () => {
  console.log('启动 Electron（前台模式，监听主进程日志）...');

  const app = await electron.launch({
    args: ['.'],
    cwd: 'C:/Users/daoge/code/project/the-bot',
    // 不捕获stdout/stderr，让日志输出到控制台
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('networkidle');
  await window.waitForTimeout(3000);

  // 监听渲染进程日志
  window.on('console', msg => {
    const text = msg.text();
    if (text.includes('AI') || text.includes('填充') || text.includes('调试') || text.includes('IPC') || text.includes('Watcher') || text.includes('metadata')) {
      console.log('[渲染进程]', text.substring(0, 500));
    }
  });

  // 导航到分镜界面
  await window.getByRole('navigation').getByText('剧集制作').click({ timeout: 10000 });
  await window.waitForTimeout(2000);
  await window.evaluate(() => {
    document.querySelectorAll('article').forEach(a => {
      if (a.innerText.includes('杜十娘')) a.click();
    });
  });
  await window.waitForTimeout(3000);
  await window.evaluate(() => {
    document.querySelectorAll('[class*="episode"]').forEach(e => {
      if (e.innerText.includes('第') && e.innerText.includes('1') && e.innerText.includes('集')) e.click();
    });
  });
  await window.waitForTimeout(5000);
  await window.evaluate(() => {
    document.querySelectorAll('.el-tabs__item').forEach(t => {
      if (t.innerText.includes('分镜') || t.innerText.includes('④')) t.click();
    });
  });
  await window.waitForTimeout(3000);
  await window.evaluate(() => {
    const cards = document.querySelectorAll('.shot-card-v2');
    if (cards.length > 0) cards[0].click();
  });
  await window.waitForTimeout(2000);

  console.log('\n=== 点击AI填充按钮 ===');
  await window.evaluate(() => {
    document.querySelectorAll('button').forEach(b => {
      if (b.innerText.trim() === '✨ AI 填充') b.click();
    });
  });

  console.log('等待60秒观察日志...\n');
  await window.waitForTimeout(60000);

  console.log('\n=== 最终状态 ===');
  const finalState = await window.evaluate(() => {
    const panel = document.querySelector('.edit-panel');
    if (!panel) return 'no panel';
    const selects = panel.querySelectorAll('.el-select');
    const values = [];
    selects.forEach(s => {
      const wrapper = s.closest('.tool-item');
      const label = wrapper?.querySelector('.tool-label')?.innerText?.trim() || '';
      // 多种方式获取 el-select 的值
      const input = s.querySelector('input');
      const inputValue = input?.value || '';
      const placeholder = input?.placeholder || '';
      // 获取 el-select 组件的选中值（Element Plus 在 .el-select__selected-item 或 placeholder 显示）
      const selectedText = s.querySelector('.el-select__selected-item')?.innerText || '';
      // 检查 input 的 aria-label 或其他属性
      const ariaLabel = input?.getAttribute('aria-label') || '';
      // 检查是否显示 placeholder（表示未选中）
      const showsPlaceholder = s.querySelector('.el-select__placeholder')?.innerText || '';
      values.push({
        label,
        inputValue,
        selectedText,
        placeholder,
        showsPlaceholder,
        ariaLabel
      });
    });
    return { selects: values.filter(v => v.label) };
  });
  console.log(JSON.stringify(finalState, null, 2));

  // 另外检查 Vue 组件状态
  console.log('\n=== Vue 组件状态 ===');
  const vueState = await window.evaluate(() => {
    const panel = document.querySelector('.edit-panel');
    if (!panel) return 'no panel';
    // 尝试获取 Vue 组件实例
    const selects = panel.querySelectorAll('.el-select');
    const vueValues = [];
    selects.forEach(s => {
      // Element Plus el-select 组件的内部状态
      const vueComp = s.__vueParentComponent || s.__vue__;
      if (vueComp) {
        const props = vueComp.props || vueComp.$props || {};
        vueValues.push({
          modelValue: props.modelValue || props.modelValue || vueComp.ctx?.modelValue,
          value: props.value || vueComp.ctx?.value,
        });
      }
    });
    return vueValues;
  });
  console.log('Vue组件状态:', JSON.stringify(vueState, null, 2));

  await app.close();
})();