// UI: автозаполнение договора и подпись пальцем (мышью) двумя участниками.
const path = require('path');
const G = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(G, 'playwright'));
const BASE = 'http://localhost:3999';
const sql = (q) => require('child_process').execSync(`psql -h /tmp -p 5433 -U postgres -d dolya -c "${q}"`);
(async () => {
  const b = await chromium.launch();
  const mk = async (lang = 'ru') => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|telegram\.org/, (r) => r.abort());
    await ctx.addInitScript((l) => localStorage.setItem('dolya_lang', l), lang);
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); p.on('dialog', (d) => d.accept()); return p; };
  const reg = async (p, f, l) => { const em = `u${Date.now()}${Math.floor(Math.random()*1e6)}@t.md`; p.email = em; await p.goto(BASE + '/#/register'); await p.fill('#fname', f); await p.fill('#lname', l); await p.fill('#email', em); await p.fill('#pw', 'secret1'); await p.click('button.btn'); await p.waitForSelector('.hero-num'); };
  const a = await mk(), d = await mk();
  await reg(a, 'Артём', 'Попов'); await reg(d, 'Денис', 'Руссу');
  sql(`update users set is_admin = true where email = '${a.email}'`);
  await a.goto(BASE + '/#/profile'); await a.reload(); await a.waitForSelector('[data-pd]');
  await a.click('[data-pd="1"]'); await a.waitForSelector('details[data-fold="p-data"] summary'); await a.evaluate(() => { const d = document.querySelector('details[data-fold="p-data"]'); if (!d.open) d.open = true; }); await a.waitForSelector('#pd');
  await a.fill('#pd_phone', '+373 69 123456'); await a.fill('#pd_birth', '1990-05-01');
  await a.screenshot({ path: '/tmp/s-profile.png', fullPage: true });
  await d.reload(); await d.waitForTimeout(500);
  const oid = await a.evaluate(async () => (await (await fetch('/api/objects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ДМЗ', area: 43, purchase_price: 75250, installment: true, installment_monthly: 1200, sale_price: 90300 }) })).json()).id);
  const tok = await a.evaluate(async (oid) => (await (await fetch(`/api/objects/${oid}/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"role":"investor"}' })).json()).token, oid);
  await d.evaluate(async (t) => fetch(`/api/invites/${t}/accept`, { method: 'POST' }), tok);
  await a.evaluate(async ([oid]) => {
    const me = await (await fetch('/api/me')).json();
    const o = await (await fetch(`/api/objects/${oid}`)).json();
    const other = o.members.find((m) => m.user_id !== me.user.id);
    await fetch(`/api/objects/${oid}/shares`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members: [{ user_id: me.user.id, share_pct: 50 }, { user_id: other.user_id, share_pct: 50 }] }) });
    await fetch(`/api/objects/${oid}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'out', category: 'Покупка', amount: 25000 }) });
  }, [oid]);
  // создатель: данные договора + свои данные + отправка
  await a.goto(`${BASE}/#/o/${oid}/contract`); await a.waitForSelector('#cf');
  await a.fill('#cf_number', '7'); await a.fill('#cf_city', 'mun. Chișinău'); await a.fill('#cf_contract_date', '2026-11-16');
  await a.fill('#cf_property_address', 'str. Mihai Viteazul 15, ap. 42'); await a.fill('#cf_cadastral', '0100415.123.01.042');
  await a.selectOption('#cf_owner', { index: 1 }); await a.fill('#cf_installment_no', 'R-118'); await a.fill('#cf_installment_date', '2026-10-01');
  await a.fill('#cf_overrun_pct', '10'); await a.fill('#cf_payout_days', '15');
  await Promise.all([a.waitForResponse((r) => /\/contract$/.test(r.url()) && r.request().method() === 'GET'), a.click('#cf .btn')]); await a.waitForTimeout(300);
  await a.fill('#idnp', '2001234567890'); await a.fill('#addr', 'mun. Chișinău, str. Florilor 3, ap. 7'); await Promise.all([a.waitForResponse((r) => /\/contract$/.test(r.url()) && r.request().method() === 'GET'), a.click('#mine .btn')]); await a.waitForTimeout(300);
  await a.click('#fix'); await a.waitForSelector('#sign');
  const sign = async (p) => {
    await p.click('#sign'); try { await p.waitForSelector('.sign-pad canvas', { timeout: 5000 }); } catch (e) { await p.screenshot({ path: '/tmp/s-fail.png' }); console.log('TOAST:', await p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|'))); throw e; }
    const box = await (await p.$('.sign-pad canvas')).boundingBox();
    await p.mouse.move(box.x + 30, box.y + box.height * 0.6); await p.mouse.down();
    for (let i = 0; i <= 30; i++) await p.mouse.move(box.x + 30 + i * 9, box.y + box.height * (0.6 - 0.25 * Math.sin(i / 3)));
    await p.mouse.up();
    await p.check('[data-agree]'); await p.screenshot({ path: `/tmp/s-pad.png` });
    await p.click('[data-ok]'); await p.waitForSelector('.signed-pill');
  };
  await sign(a);
  await a.screenshot({ path: '/tmp/s1.png' });
  // второй участник
  await d.goto(`${BASE}/#/o/${oid}`); await d.waitForSelector('h1.h'); await d.screenshot({ path: '/tmp/s2.png' });
  await d.goto(`${BASE}/#/o/${oid}/contract`); await d.waitForSelector('#mine');
  await d.fill('#idnp', '2009876543210'); await d.fill('#addr', 'or. Ialoveni, str. Păcii 8'); await Promise.all([d.waitForResponse((r) => /\/contract$/.test(r.url()) && r.request().method() === 'GET'), d.click('#mine .btn')]); await d.waitForTimeout(300);
  await sign(d);
  await d.screenshot({ path: '/tmp/s3.png' });
  await d.evaluate(() => document.querySelector('#doc').scrollIntoView());
  await d.waitForTimeout(400);
  const frame = d.frame({ url: /about:srcdoc/ }) || d.frames()[1];
  await frame.evaluate(() => document.querySelector('h2:last-of-type').scrollIntoView());
  await d.screenshot({ path: '/tmp/s4.png' });
  await d.goto(`${BASE}/#/o/${oid}`); await d.waitForSelector('a.card.green[href$="/contract"]'); await d.screenshot({ path: '/tmp/s5.png' });
  console.log('ok   contract signed by both, green state visible');
  await b.close();
})().catch((e) => { console.error('SIGN UI FAIL', e); process.exit(1); });
