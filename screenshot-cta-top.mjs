import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ss-helper/node_modules/puppeteer');
const chromePath = `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });

await page.evaluate(() => {
  document.querySelector('.cta-section').scrollIntoView({ behavior: 'instant' });
});
await new Promise(r => setTimeout(r, 1500));

// Now take viewport screenshot (what user actually sees after scrolling to cta)
await page.screenshot({ path: path.join(__dirname, 'temporary screenshots/section-cta-heading.png') });
await browser.close();
console.log('Done');
