import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ss-helper/node_modules/puppeteer');
const chromePath = `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 800));

// Scroll to territory section
const y = await page.evaluate(() => {
  const el = document.querySelector('#territory');
  el.scrollIntoView({ behavior: 'instant', block: 'start' });
  return el.getBoundingClientRect().top + window.scrollY;
});
await new Promise(r => setTimeout(r, 1500));

await page.screenshot({
  path: path.join(__dirname, 'temporary screenshots', 'mob-zones-anim.png'),
  fullPage: false
});
console.log('Saved mob-zones-anim.png at y =', y);
await browser.close();
