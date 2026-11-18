const puppeteer = require('puppeteer');
const path = require('path');
const url = f => 'file://' + path.resolve('brand', f);
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files', '--font-render-hinting=none'] });
  const shot = async (file, w, h, out) => {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.goto(url(file), { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 300));
    await p.screenshot({ path: out });
    await p.close();
    console.log(out, w + 'x' + h);
  };
  await shot('banner.html', 640, 360, 'brand/banner_640x360.png');
  await shot('avatar.html', 640, 640, 'brand/avatar_640x640.png');
  await shot('avatar.html', 512, 512, 'brand/avatar_512x512.png');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
