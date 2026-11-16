const path = require('path');
const { execSync } = require('child_process');
const G = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(G, 'playwright'));
const BASE = 'http://localhost:3999';
(async () => {
  const b = await chromium.launch();
  for (const lang of ['ru', 'ro']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|telegram\.org|jsdelivr/, (r) => r.abort());
    await ctx.addInitScript((l) => localStorage.setItem('dolya_lang', l), lang);
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await p.goto(BASE + '/#/register'); await p.fill('#fname', 'Админ'); await p.fill('#lname', 'Статистика'); await p.fill('#email', `adm${lang}${Date.now()}@s.md`); await p.fill('#pw', 'secret1'); await p.click('button.btn'); await p.waitForSelector('.hero-num');
    const r0 = await p.evaluate(async () => (await fetch('/api/admin/stats', { credentials: 'include' })).status);
    console.log(r0 === 403 ? 'ok   non-admin gets 403' : 'FAIL non-admin ' + r0);
    const id = await p.evaluate(async () => (await (await fetch('/api/me', { credentials: 'include' })).json()).user.id);
    execSync(`psql -h /tmp -p 5433 -U postgres -d dolya -c "update users set is_admin=true where id=${id}"`);
    await p.goto(BASE + '/#/profile'); await p.reload(); await p.waitForSelector('#adm-total'); await p.waitForFunction(() => document.querySelector('#adm-total').textContent !== '…');
    console.log('profile total:', await p.textContent('#adm-total'), '|', await p.textContent('#adm-sub'));
    await p.click('#adm-stats'); await p.waitForSelector('.list .row'); await p.waitForTimeout(400);
    await p.screenshot({ path: `/tmp/adm-${lang}.png` });
    if (lang === 'ro') {
      const left = await p.evaluate(() => { const o = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const v = w.currentNode.nodeValue.trim(); if (/[А-Яа-яЁё]{2,}/.test(v) && !w.currentNode.parentElement.closest('.t')) o.push(v); } return [...new Set(o)]; });
      console.log('RO leftovers:', left.slice(0, 10));
    }
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
