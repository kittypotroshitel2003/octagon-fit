import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:8080';
const label = process.argv[3] ? `-${process.argv[3]}` : '';

const dir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const existing = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0')).filter(n => !isNaN(n));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const filename = `screenshot-${next}${label}.png`;
const filepath = path.join(dir, filename);

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

/* headless shell: обычный headless Chrome в этом окружении подвисает на captureScreenshot */
const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 120000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars']
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: filepath, fullPage: true });
await browser.close();
console.log(`Saved: ${filepath}`);
