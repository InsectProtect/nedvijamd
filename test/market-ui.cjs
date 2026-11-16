// Доска сделок через интерфейс: анкета, предложение, модерация, отклик, контакты.
const path = require('path');
const { execSync } = require('child_process');
const G = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(G, 'playwright'));
const BASE = 'http://localhost:3999';
const NAMES = /Админ|Главный|Олег|Автор|Ирина|Инвестор|Ботаника|Рышкановка|Готова|Кишин|2 комнаты|Покупка/;
(async () => {
  const b = await chromium.launch();
  const found = new Map();
  const mk = async (lang) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|telegram\.org|jsdelivr/, (r) => r.abort());
    await ctx.addInitScript((l) => localStorage.setItem('dolya_lang', l), lang);
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); p.on('dialog', (d) => d.type() === 'prompt' ? d.accept('Мало деталей') : d.accept()); p.lang = lang; return p;
  };
  const scan = async (p, where) => {
    if (p.lang !== 'ro') return;
    await p.waitForTimeout(300);
    const t = await p.evaluate(() => { const o = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const v = w.currentNode.nodeValue.trim(); if (/[А-Яа-яЁё]/.test(v) && !w.currentNode.parentElement.closest('[data-nt]')) o.push(v); } document.querySelectorAll('[placeholder],[aria-label]').forEach((el) => ['placeholder', 'aria-label'].forEach((a) => { const v = el.getAttribute(a); if (v && /[А-Яа-яЁё]/.test(v)) o.push('@' + v); })); return o; });
    for (const x of t) if (!NAMES.test(x) && /[А-Яа-яЁё]{2,}/.test(x) && !found.has(x)) found.set(x, where);
  };
  const reg = async (p, f, l) => { await p.goto(BASE + '/#/register'); await p.fill('#fname', f); await p.fill('#lname', l); await p.fill('#email', `${f}${Date.now()}@mu.md`); await p.fill('#pw', 'secret1'); await p.click('button.btn'); await p.waitForSelector('.hero-num'); };
  execSync(`psql -h /tmp -p 5433 -U postgres -d dolya -c "delete from market_responses; delete from market_offers; delete from investor_profiles"`);
  const adm = await mk('ru'), own = await mk('ru'), inv = await mk('ro');
  await reg(adm, 'Админ', 'Главный'); await reg(own, 'Олег', 'Автор'); await reg(inv, 'Ирина', 'Инвестор');
  const admId = await adm.evaluate(async () => (await (await fetch('/api/me', { credentials: 'include' })).json()).user.id);
  execSync(`psql -h /tmp -p 5433 -U postgres -d dolya -c "update users set is_admin=true where id=${admId}"`);
  await inv.screenshot({ path: '/tmp/m-home-empty.png' }); await scan(inv, 'home');
  // Инвестор: анкета
  await inv.click('a[href="#/market"]'); await inv.waitForSelector('.seg'); await scan(inv, 'market');
  await inv.screenshot({ path: '/tmp/m-market-empty.png', fullPage: true });
  await inv.click('a[href="#/market/profile"]'); await inv.waitForSelector('#ato'); await scan(inv, 'profile');
  await inv.fill('#afrom', '20000'); await inv.fill('#ato', '50 000'); await inv.fill('#anote', 'Кишинёв'); await inv.click('#f .btn'); await inv.waitForSelector('.seg'); await scan(inv, 'investors-pending');
  // Автор: предложение
  await own.goto(BASE + '/#/market/new'); await own.waitForSelector('#ttl');
  await own.fill('#ttl', '2 комнаты под ремонт'); await own.fill('#dst', 'Ботаника'); await own.fill('#prc', '62000'); await own.fill('#need', '30000'); await own.fill('#pctv', '22'); await own.fill('#term', '8'); await own.fill('#dsc', 'Покупка, ремонт за 3 месяца, продажа.');
  await own.click('#f .btn'); await own.waitForSelector('h1.h'); await own.screenshot({ path: '/tmp/m-offer-pending.png', fullPage: true });
  // Админ: проверка
  await adm.goto(BASE + "/#/market"); await adm.reload(); await adm.waitForSelector('a[href="#/market/admin"]'); await adm.click('a[href="#/market/admin"]'); await adm.waitForSelector('[data-ok]');
  await adm.screenshot({ path: '/tmp/m-admin.png', fullPage: true });
  await adm.click('[data-k="offer"][data-ok="1"]'); await adm.waitForTimeout(500); await adm.click('[data-k="profile"][data-ok="1"]'); await adm.waitForTimeout(500);
  // Инвестор видит сделку, откликается
  await inv.goto(BASE + '/#/market'); await inv.reload(); await inv.waitForSelector('a[href^="#/market/o/"]'); await scan(inv, 'market-deals');
  await inv.screenshot({ path: '/tmp/m-market-ro.png', fullPage: true });
  await inv.click('a[href^="#/market/o/"]'); await inv.waitForSelector('#respond'); await scan(inv, 'offer');
  await inv.fill('#rmsg', 'Готова 30 000'); await inv.click('#respond'); await inv.waitForTimeout(700); await scan(inv, 'offer-responded');
  // Автор видит инвестора и отклик
  await own.goto(BASE + '/#/market/investors'); await own.reload(); await own.waitForTimeout(1000); await own.screenshot({ path: '/tmp/m-dbg.png', fullPage: true }); await own.waitForSelector('[data-propose]');
  await own.screenshot({ path: '/tmp/m-investors.png', fullPage: true });
  await own.goto(BASE + '/#/market'); await own.waitForSelector('a[href="#/market/inbox"]'); await own.click('a[href="#/market/inbox"]'); await own.waitForSelector('.row');
  await own.click('.row'); await own.waitForSelector('[data-acc="1"]'); await own.screenshot({ path: '/tmp/m-owner-resp.png', fullPage: true });
  await own.click('[data-acc="1"]'); await own.waitForTimeout(800); await own.screenshot({ path: '/tmp/m-owner-contacts.png', fullPage: true });
  await inv.reload(); await inv.waitForSelector('h1.h'); await inv.waitForTimeout(500); await scan(inv, 'offer-accepted');
  await inv.screenshot({ path: '/tmp/m-inv-contacts.png', fullPage: true });
  await inv.goto(BASE + '/#/market/inbox'); await inv.waitForTimeout(600); await scan(inv, 'inbox');
  const okContacts = await own.locator('text=Контакты открыты').count();
  console.log(okContacts ? 'ok   contacts shown to owner' : 'FAIL contacts');
  for (const [t, w] of found) console.log(`[${w}] ${t}`);
  console.log('untranslated:', found.size);
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
