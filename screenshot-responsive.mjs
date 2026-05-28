import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ss-helper/node_modules/puppeteer');
const chromePath = `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const viewports = [
  { name: 'mobile-375', width: 375, height: 812, full: true },
  { name: 'tablet-768', width: 768, height: 1024, full: true },
];

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

for (const vp of viewports) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const out = path.join(dir, `${vp.name}.png`);
  await page.screenshot({ path: out, fullPage: vp.full });
  await page.close();
  console.log(`Saved: ${out}`);
}

await browser.close();
