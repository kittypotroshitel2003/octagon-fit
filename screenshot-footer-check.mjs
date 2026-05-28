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
await new Promise(r => setTimeout(r, 1200));

// Clip screenshot directly at the CTA+footer page coordinates (no scroll needed)
// CTA: pageY=4534, height=1099
// This shows what's rendered at those page coordinates
await page.screenshot({
  path: '/Users/Diana/Desktop/октагон фит/temporary screenshots/cta-direct-clip.png',
  clip: { x: 0, y: 4534, width: 375, height: 500 }
});
console.log('Saved cta-direct-clip.png (pageY 4534-5034)');

await page.screenshot({
  path: '/Users/Diana/Desktop/октагон фит/temporary screenshots/footer-direct-clip.png',
  clip: { x: 0, y: 5200, width: 375, height: 433 }
});
console.log('Saved footer-direct-clip.png (pageY 5200-5633)');

// Check z-index and overlapping elements at CTA center
const info = await page.evaluate(() => {
  const els = document.elementsFromPoint(187, 5083 - window.scrollY);
  return els.slice(0, 5).map(el => ({
    tag: el.tagName,
    id: el.id,
    cls: [...el.classList].slice(0, 3).join('.'),
    bg: getComputedStyle(el).backgroundColor,
    z: getComputedStyle(el).zIndex,
    pos: getComputedStyle(el).position,
    pageY: el.getBoundingClientRect().top + window.scrollY,
  }));
});
console.log('Elements at page center (5083):', JSON.stringify(info, null, 2));

await browser.close();
