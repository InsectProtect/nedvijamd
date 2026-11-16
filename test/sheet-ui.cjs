const path = require('path'); const { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const BASE = 'http://localhost:3999';
(async () => {
  const b = await chromium.launch();
  for (const lang of ['ru', 'ro']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|telegram\.org|jsdelivr/, (r) => r.abort());
    await ctx.addInitScript((l) => localStorage.setItem('dolya_lang', l), lang);
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await p.goto(BASE + '/#/register'); await p.fill('#fname', 'Меню'); await p.fill('#lname', 'Тест'); await p.fill('#email', `sh${lang}${Date.now()}@s.md`); await p.fill('#pw', 'secret1'); await p.click('button.btn'); await p.waitForSelector('.hero-num');
    for (const n of ['Первый', 'Второй']) await p.evaluate(async (n) => fetch('/api/objects', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) }), n);
    await p.reload(); await p.waitForSelector('.obj');
    await p.click('#tb-plus'); await p.waitForSelector('.sheet-bg.open'); await p.waitForTimeout(300);
    await p.screenshot({ path: `/tmp/sheet-${lang}.png` });
    await p.click('[data-act="entry"]'); await p.waitForSelector('[data-oid]'); await p.waitForTimeout(250); await p.screenshot({ path: `/tmp/sheet-pick-${lang}.png` });
    await p.click('[data-oid] >> nth=0'); await p.waitForSelector('#amt'); console.log(lang, 'ok   pick object → add screen', p.url().split('#')[1]);
    await p.goto(BASE + '/#/'); await p.waitForSelector('.obj'); await p.click('.obj'); await p.waitForSelector('h1.h'); await p.click('#tb-plus'); await p.waitForSelector('#amt'); console.log(lang, 'ok   from object → direct add');
    await p.goto(BASE + '/#/market'); await p.waitForSelector('.seg'); await p.click('#tb-plus'); await p.click('[data-act="investor"]'); await p.waitForSelector('#ato'); console.log(lang, 'ok   investor from market');
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
