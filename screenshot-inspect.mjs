import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ss-helper/node_modules/puppeteer');
const chromePath = `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 800));

const info = await page.evaluate(() => {
  const section = document.querySelector('.cta-section');
  const wrap = document.querySelector('.cta-title-wrap');
  const zapishy = document.querySelector('.cta-zapishy');
  const form = document.querySelector('.cta-form');
  const map = document.querySelector('.cta-map');
  const get = (el) => {
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { pos: cs.position, display: cs.display, opacity: cs.opacity, transform: cs.transform, left: cs.left, top: cs.top, w: cs.width, h: cs.height, pageY: r.top + window.scrollY };
  };
  return {
    section: get(section),
    wrap: get(wrap),
    zapishy: get(zapishy),
    form: get(form),
    map: get(map),
  };
});

console.log('CTA section:', JSON.stringify(info.section));
console.log('CTA wrap:', JSON.stringify(info.wrap));
console.log('CTA zapishy:', JSON.stringify(info.zapishy));
console.log('CTA form:', JSON.stringify(info.form));
console.log('CTA map:', JSON.stringify(info.map));

// Take full-page screenshot to see where everything is
const ctaY = await page.evaluate(() => document.querySelector('.cta-section').getBoundingClientRect().top + window.scrollY);
await page.evaluate((y) => window.scrollTo(0, y), ctaY);
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: path.join(__dirname, 'temporary screenshots', 'cta-mobile-debug.png') });
console.log('Saved cta-mobile-debug.png at scrollY =', ctaY);

await browser.close();
