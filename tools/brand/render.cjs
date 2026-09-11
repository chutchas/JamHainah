const { chromium } = require('playwright');
(async () => {
  const jobs = [
    ['richmenu.html', 'richmenu.png', 2500, 843],
    ['icon.html', 'oa-icon.png', 640, 640],
  ];
  const b = await chromium.launch();
  for (const [html, out, w, h] of jobs) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto('file://' + process.cwd() + '/' + html);
    await p.waitForTimeout(500);
    await p.screenshot({ path: out });
    console.log(out, w + 'x' + h);
    await p.close();
  }
  await b.close();
})();
