import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ss-helper/node_modules/puppeteer');
const chromePath = `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 768, height: 900, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 800));

// Check what display value cta-title-wrap has and where it sits
const info = await page.evaluate(() => {
  const wrap = document.querySelector('.cta-title-wrap');
  const section = document.querySelector('.cta-section');
  return {
    wrapDisplay: getComputedStyle(wrap).display,
    wrapRect: JSON.stringify(wrap.getBoundingClientRect()),
    sectionTop: section.getBoundingClientRect().top + window.scrollY,
  };
});
console.log('CTA info:', info);

// Scroll to start of cta-section
const ctaTop = await page.evaluate(() => document.querySelector('#cta').getBoundingClientRect().top + window.scrollY);
console.log('CTA section page-Y:', ctaTop);
await page.evaluate((y) => window.scrollTo(0, y), ctaTop);
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: path.join(__dirname, 'temporary screenshots', 'cta-top.png'), fullPage: false });
console.log('Saved cta-top.png');

await browser.close();
