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
await new Promise(r => setTimeout(r, 2000));

// Hero (stat cards + dumbbell)
const hero = await page.$('.hero');
await hero.screenshot({ path: path.join(__dirname, 'temporary screenshots/check-hero.png') });

// Philosophy (dumbbell section)
await page.evaluate(() => document.querySelector('.philosophy').scrollIntoView({ behavior: 'instant' }));
await new Promise(r => setTimeout(r, 800));
const phil = await page.$('.philosophy');
await phil.screenshot({ path: path.join(__dirname, 'temporary screenshots/check-philosophy.png') });

// Territory zones
await page.evaluate(() => document.querySelector('.territory').scrollIntoView({ behavior: 'instant' }));
await new Promise(r => setTimeout(r, 1000));
const terr = await page.$('.territory');
await terr.screenshot({ path: path.join(__dirname, 'temporary screenshots/check-territory.png') });

// Trainers
await page.evaluate(() => document.querySelector('.trainers-section').scrollIntoView({ behavior: 'instant' }));
await new Promise(r => setTimeout(r, 800));
const trainers = await page.$('.trainers-section');
await trainers.screenshot({ path: path.join(__dirname, 'temporary screenshots/check-trainers.png') });

// Comfort (sauna + events)
await page.evaluate(() => document.querySelector('.comfort').scrollIntoView({ behavior: 'instant' }));
await new Promise(r => setTimeout(r, 800));
const comfort = await page.$('.comfort');
await comfort.screenshot({ path: path.join(__dirname, 'temporary screenshots/check-comfort.png') });

await browser.close();
console.log('All done');
