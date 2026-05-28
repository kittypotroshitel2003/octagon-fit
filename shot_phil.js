const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('cookieConsent', 'accepted'));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));
  
  // Check if .pt spans are visible
  const ptDisplay = await page.evaluate(() => {
    const pt = document.querySelector('.pt');
    return pt ? window.getComputedStyle(pt).display : 'not found';
  });
  console.log('pt display:', ptDisplay);
  
  await page.evaluate(() => document.getElementById('about').scrollIntoView({ behavior: 'instant' }));
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/Users/Diana/Desktop/октагон фит/temporary screenshots/screenshot-24-phil-final.png' });
  await browser.close();
  console.log('Done');
})().catch(e => { console.error(e); process.exit(1); });
