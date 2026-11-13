const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const n of process.argv.slice(2)) {
    await p.goto('file://' + path.resolve('out', n + '.html'));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.pdf({ path: path.resolve('out', n + '.pdf'), preferCSSPageSize: true, printBackground: true });
  }
  await b.close();
})();
