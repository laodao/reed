/**
 * 设置页验证脚本 v4（第二轮修复后）
 * 1. 底部 padding：外观设置 / 工具 tab 滚动到底 gap
 * 2. 搜索引擎对话框：模板卡片数量/名称/文字溢出检查
 * 3. 新闻来源 favicon：站点自身图标（/favicon.ico 优先）加载情况
 * 4. 主题名称
 */
const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({ args: ['.'], cwd: 'C:/Users/daoge/code/project/the-bot' });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(5000);
  await win.locator('.sidebar-footer .nav-item').nth(0).click();
  await win.waitForTimeout(2500);

  // 1. 底部 padding（滚动到底）
  const gapOf = async (tab) => {
    await win.locator('.el-tabs__item', { hasText: tab }).click();
    await win.waitForTimeout(700);
    return win.evaluate(() => {
      const content = document.querySelector('.el-tabs__content');
      content.scrollTop = content.scrollHeight;
      const cRect = content.getBoundingClientRect();
      const pane = Array.from(content.querySelectorAll('.el-tab-pane')).find((p) => getComputedStyle(p).display !== 'none');
      let lastBottom = null;
      if (pane) {
        for (const el of pane.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.bottom <= cRect.bottom + 1 && (!lastBottom || r.bottom > lastBottom)) lastBottom = r.bottom;
        }
      }
      return {
        maxScroll: content.scrollHeight - content.clientHeight,
        actual: content.scrollTop,
        gap: lastBottom ? (cRect.bottom - lastBottom).toFixed(1) : null,
      };
    });
  };
  console.log('外观设置底部:', JSON.stringify(await gapOf('外观设置')));
  console.log('工具底部:', JSON.stringify(await gapOf('工具')));

  // 2. 搜索引擎对话框
  await win.locator('.el-tabs__item', { hasText: '搜索引擎' }).click();
  await win.waitForTimeout(700);
  await win.getByRole('button', { name: '添加配置' }).click();
  await win.waitForTimeout(900);
  const dlg = await win.evaluate(() => {
    const d = document.querySelector('.el-dialog');
    if (!d) return null;
    const cards = Array.from(d.querySelectorAll('.template-card'));
    return {
      dialogRight: d.getBoundingClientRect().right,
      cardRights: cards.map((c) => c.getBoundingClientRect().right),
      cardNames: cards.map((c) => c.querySelector('.template-name')?.textContent.trim()),
      // 文字是否溢出卡片：比较 desc 右缘与卡片右缘
      descOverflow: cards.map((c) => {
        const desc = c.querySelector('.template-desc');
        const name = c.querySelector('.template-name');
        if (!desc || !name) return null;
        return {
          nameOverflow: (name.scrollWidth > name.clientWidth + 1),
          descOverflow: (desc.scrollWidth > desc.clientWidth + 1),
        };
      }),
    };
  });
  console.log('对话框:', JSON.stringify(dlg, null, 1));
  await win.keyboard.press('Escape');
  await win.waitForTimeout(600);

  // 3. 新闻来源 favicon
  await win.locator('.el-tabs__item', { hasText: '新闻来源' }).click();
  await win.waitForTimeout(6000);
  const news = await win.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.favicon-img'));
    const loading = document.querySelectorAll('.favicon-loading').length;
    const fallbacks = document.querySelectorAll('.favicon-fallback').length;
    const total = document.querySelectorAll('.favicon-icon').length;
    const sample = imgs.slice(0, 4).map((img) => img.src.slice(0, 22));
    return { total, loaded: imgs.length, loading, fallbacks, sample };
  });
  console.log('favicon:', JSON.stringify(news));
  await win.screenshot({ path: 'scripts/.settings-shots/v4-news-favicon.png' });

  // 4. 主题名称
  await win.locator('.el-tabs__item', { hasText: '外观设置' }).click();
  await win.waitForTimeout(700);
  const themes = await win.evaluate(() =>
    Array.from(document.querySelectorAll('.theme-name')).map((el) => el.textContent.trim())
  );
  console.log('主题:', JSON.stringify(themes));
  await win.screenshot({ path: 'scripts/.settings-shots/v4-appearance.png' });

  await app.close();
  console.log('完成');
})().catch((e) => { console.error('脚本失败:', e); process.exit(1); });
