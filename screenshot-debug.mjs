import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ss-helper/node_modules/puppeteer');
const chromePath = `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const dir = path.join(__dirname, 'temporary screenshots');
const browser = await puppeteer.launch({
  executablePath: chromePath, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const configs = [
  { vp: 375, name: 'mob-hero',     selector: '#hero' },
  { vp: 375, name: 'mob-phil',     selector: '#about' },
  { vp: 375, name: 'mob-zones',    selector: '#territory' },
  { vp: 375, name: 'mob-trainers', selector: '#trainers' },
  { vp: 375, name: 'mob-comfort',  selector: '#comfort' },
  { vp: 375, name: 'mob-cta',      selector: '.cta-title-wrap' },
  { vp: 375, name: 'mob-footer',   selector: '.site-footer' },
  { vp: 768, name: 'tab-hero',     selector: '#hero' },
  { vp: 768, name: 'tab-phil',     selector: '#about' },
  { vp: 768, name: 'tab-zones',    selector: '#territory' },
  { vp: 768, name: 'tab-trainers', selector: '#trainers' },
  { vp: 768, name: 'tab-comfort',  selector: '#comfort' },
  { vp: 768, name: 'tab-cta',      selector: '.cta-title-wrap' },
  { vp: 768, name: 'tab-footer',   selector: '.site-footer' },
];

for (const c of configs) {
  const page = await browser.newPage();
  await page.setViewport({ width: c.vp, height: 900, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, c.selector);
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(dir, `${c.name}.png`), fullPage: false });
  await page.close();
  console.log(`✓ ${c.name}`);
}

await browser.close();
