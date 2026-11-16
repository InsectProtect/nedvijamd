// Проходит все экраны на румынском и ищет непереведённый русский текст.
const path = require('path');
const G = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(G, 'playwright'));
const BASE = 'http://localhost:3999';
const USER = /Артём|Попов|Денис|Руссу|Игорь|Чебан|Ботаника|Плитка|санузел|Перевод на общий счёт|Покупка по договору|Нотариус$/;
(async () => {
  const b = await chromium.launch();
  const mk = async (lang) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|telegram\.org/, (r) => r.abort());
    await ctx.addInitScript((l) => localStorage.setItem('dolya_lang', l), lang);
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); p.on('dialog', (d) => d.accept()); return p;
  };
  const found = new Map();
  const scan = async (p, where) => {
    await p.waitForTimeout(400);
    const texts = await p.evaluate(() => {
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const t = w.currentNode.nodeValue.trim(); if (t && /[А-Яа-яЁё]/.test(t) && !w.currentNode.parentElement.closest('[data-nt]')) out.push(t); }
      document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => ['placeholder', 'aria-label', 'title'].forEach((a) => { const v = el.getAttribute(a); if (v && /[А-Яа-яЁё]/.test(v)) out.push('@' + a + ': ' + v); }));
      return out;
    });
    for (const t of texts) if (!USER.test(t) || /[А-Яа-яЁё]{3,}/.test(t.replace(new RegExp(USER.source, 'g'), ''))) { if (!found.has(t)) found.set(t, where); }
  };
  const a = await mk('ro'), d = await mk('ro');
  await a.goto(BASE + '/#/register'); await scan(a, 'register');
  await a.goto(BASE + '/#/login'); await scan(a, 'login');
  await a.goto(BASE + '/#/register');
  await a.fill('#fname', 'Артём'); await a.fill('#lname', 'Попов'); await a.fill('#email', `ro${Date.now()}@t.md`); await a.fill('#pw', 'secret1'); await a.click('button.btn');
  await a.waitForSelector('.hero-num'); await scan(a, 'home-empty');
  await a.goto(BASE + '/#/new'); await scan(a, 'new');
  await a.click('[data-inst="1"]'); await scan(a, 'new-inst');
  await a.fill('#name', 'Ботаника'); await a.fill('#area', '54'); await a.fill('#buy', '68000'); await a.click('[data-rep="1"]'); await a.fill('#repair', '14000'); await a.fill('#sale', '105000'); await a.fill('#monthly', '1000');
  await a.click('#f .btn'); await a.waitForSelector('h1.h');
  const oid = a.url().match(/#\/o\/(\d+)/)[1];
  await a.goto(`${BASE}/#/o/${oid}/members`); await scan(a, 'members');
  await a.click('#mk'); await a.waitForSelector('#link .field'); await scan(a, 'members-link');
  const tok = (await a.textContent('#link .field')).trim().split(/join[\/_]/).pop();
  await d.goto(`${BASE}/#/join/${tok}`); await scan(d, 'join-anon');
  await d.click('text=Înregistrare'); await d.fill('#fname', 'Денис'); await d.fill('#lname', 'Руссу'); await d.fill('#email', `rod${Date.now()}@t.md`); await d.fill('#pw', 'secret1'); await d.click('button.btn');
  await d.waitForSelector('#acc'); await scan(d, 'join'); await d.click('#acc'); await d.waitForSelector('h1.h');
  for (const k of ['out', 'rent']) {
    await a.goto(`${BASE}/#/o/${oid}/add`); await a.waitForSelector('#amt'); await a.click(`[data-k="${k}"]`); await scan(a, 'add-' + k);
    await a.fill('#amt', k === 'out' ? '1500' : '400'); if (k === 'out') await a.click('[data-c="Мебель и техника"]');
    await a.fill('#note', 'Плитка'); await a.click('#save'); await a.waitForSelector('h1.h');
  }
  await a.goto(`${BASE}/#/o/${oid}/add`); await a.waitForSelector('#amt'); await a.click('[data-cur="MDL"]'); await a.waitForTimeout(800); await scan(a, 'add-lei');
  await a.screenshot({ path: '/tmp/ro-lei.png' });
  if (await a.$('#rate')) await a.fill('#rate', '19,6');
  await a.fill('#amt', '1960'); await a.fill('#note', 'Плитка'); await a.click('#save'); await a.waitForSelector('h1.h');
  await a.goto(`${BASE}/#/o/${oid}`); await a.waitForSelector('h1.h'); await scan(a, 'object');
  await a.goto(`${BASE}/#/o/${oid}/forecast`); await scan(a, 'forecast');
  await a.goto(`${BASE}/#/o/${oid}/shares`); await scan(a, 'shares');
  await a.goto(`${BASE}/#/o/${oid}/contract`); await a.waitForSelector('#doc'); await scan(a, 'contract');
  await a.screenshot({ path: '/tmp/ro-contract.png' });
  await a.goto(`${BASE}/#/o/${oid}`); await a.click('text=Плитка >> nth=0'); await a.waitForSelector('#del'); await scan(a, 'entry');
  const eUrl = a.url();
  await a.goto(eUrl + '/edit'); await a.waitForSelector('#amt'); await scan(a, 'entry-edit');
  await a.fill('#amt', '1600'); await a.click('#save'); await a.waitForSelector('#ecancel'); await scan(a, 'entry-edit-pending');
  await a.screenshot({ path: '/tmp/ro-edit.png' });
  const eid = eUrl.match(/#\/e\/(\d+)/)[1];
  await d.goto(`${BASE}/#/e/${eid}`); await d.waitForSelector('#eyes'); await scan(d, 'entry-edit-vote'); await d.click('#eyes'); await d.waitForTimeout(600);
  await a.goto(eUrl); await a.reload(); await a.waitForSelector('#del'); await a.click('#del'); await a.waitForSelector('#vcancel'); await scan(a, 'entry-pending');
  await d.goto(`${BASE}/#/o/${oid}`); await d.waitForSelector('h1.h'); await scan(d, 'object-denis');
  await d.screenshot({ path: '/tmp/ro-object.png' });
  await d.goto(`${BASE}/#/o/${oid}/shares`); await scan(d, 'shares-ro');
  await a.goto(`${BASE}/#/o/${oid}/report`); await a.waitForSelector('#doc'); await a.waitForTimeout(800); await scan(a, 'report');
  const rep = await a.$eval('#doc', (f) => f.contentDocument.body.innerText); const ru = (rep.match(/[А-Яа-яЁё]{3,}[^\n]*/g) || []).filter((t) => !USER.test(t)); if (ru.length) found.set('REPORT: ' + ru.slice(0, 8).join(' | '), 'report-doc');
  await a.screenshot({ path: '/tmp/ro-report.png' });
  await a.goto(`${BASE}/#/o/${oid}/deal`); await a.waitForSelector('#price'); await scan(a, 'deal-form');
  await a.fill('#price', '110000'); await a.click('#f .btn'); await a.waitForSelector('h1.h'); await a.waitForTimeout(600); await scan(a, 'deal');
  await a.screenshot({ path: '/tmp/ro-deal.png', fullPage: true });
  const pay = await a.$('[data-pay]'); if (pay) { await pay.click(); await a.waitForTimeout(600); await scan(a, 'deal-marked'); }
  await a.goto(`${BASE}/#/o/${oid}`); await a.waitForSelector('h1.h'); await scan(a, 'object-sold');
  await a.goto(`${BASE}/#/o/${oid}/delete`); await scan(a, 'delete');
  await a.click('#req'); await a.waitForSelector('#cancel'); await scan(a, 'delete-req');
  await a.goto(`${BASE}/#/profile`); await scan(a, 'profile');
  await a.goto(`${BASE}/#/name`); await scan(a, 'name');
  await a.goto(`${BASE}/#/`); await a.waitForSelector('.obj'); await scan(a, 'home');
  await a.screenshot({ path: '/tmp/ro-home.png' });
  for (const [t, w] of found) console.log(`[${w}] ${t}`);
  console.log('untranslated:', found.size);
  await b.close();
})().catch(async (e) => { console.error('SCAN FAIL', e); process.exit(1); });
