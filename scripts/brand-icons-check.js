/**
 * 验证：AI 模型配置 / 搜索引擎设置界面 真实品牌图标加载
 */
const { _electron: electron } = require('playwright');
const fs = require('fs');

(async () => {
  const app = await electron.launch({ args: ['.'], cwd: 'C:/Users/daoge/code/project/the-bot' });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(5000);
  await win.locator('.sidebar-footer .nav-item').nth(0).click();
  await win.waitForTimeout(2500);

  // 1. AI 模型配置
  await win.locator('.el-tabs__item', { hasText: 'AI 模型配置' }).click();
  await win.waitForTimeout(12000);
  const providers = await win.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.provider-config-item'));
    return items.map((it) => {
      const name = it.querySelector('.config-name')?.textContent.trim();
      const img = it.querySelector('.favicon-img');
      const fb = it.querySelector('.favicon-fallback');
      const loading = it.querySelector('.favicon-loading');
      return {
        name,
        img: img ? img.src.slice(0, 24) : null,
        fallback: fb ? fb.textContent.trim() : null,
        loading: !!loading,
      };
    });
  });
  console.log('AI 模型配置:', JSON.stringify(providers, null, 1));
  await win.screenshot({ path: 'scripts/.settings-shots/v7-providers.png' });

  // 2. 搜索引擎 tab
  await win.locator('.el-tabs__item', { hasText: '搜索引擎' }).click();
  await win.waitForTimeout(10000);
  const engines = await win.evaluate(() => {
    const quick = Array.from(document.querySelectorAll('.quick-engine-item')).map((it) => {
      const img = it.querySelector('.favicon-img');
      return {
        name: it.querySelector('.engine-name')?.textContent.trim(),
        img: img ? img.src.slice(0, 24) : null,
        fallback: it.querySelector('.favicon-fallback')?.textContent.trim() ?? null,
      };
    });
    const configured = Array.from(document.querySelectorAll('.provider-config-item')).map((it) => {
      const img = it.querySelector('.favicon-img');
      return {
        name: it.querySelector('.config-name')?.textContent.trim(),
        img: img ? img.src.slice(0, 24) : null,
        fallback: it.querySelector('.favicon-fallback')?.textContent.trim() ?? null,
      };
    });
    return { quick, configured };
  });
  console.log('搜索引擎快速搜索:', JSON.stringify(engines.quick));
  console.log('搜索引擎已配置:', JSON.stringify(engines.configured));
  await win.screenshot({ path: 'scripts/.settings-shots/v7-search-engines.png' });

  // 3. 添加配置对话框模板卡片
  await win.getByRole('button', { name: '添加配置' }).click();
  await win.waitForTimeout(8000);
  const dlg = await win.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.template-card'));
    return cards.map((c) => {
      const img = c.querySelector('.favicon-img');
      return {
        name: c.querySelector('.template-name')?.textContent.trim(),
        img: img ? img.src.slice(0, 24) : null,
        fallback: c.querySelector('.favicon-fallback')?.textContent.trim() ?? null,
        loading: !!c.querySelector('.favicon-loading'),
      };
    });
  });
  console.log('添加配置模板卡片:', JSON.stringify(dlg, null, 1));
  await win.screenshot({ path: 'scripts/.settings-shots/v7-search-dialog.png' });

  await app.close();
  console.log('完成');
})().catch((e) => { console.error('脚本失败:', e); process.exit(1); });
