// UI-прогон в мобильном Chromium: два пользователя, приглашение, операции с чеком, доли, прогноз, удаление.
const path = require('path');
const G = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(G, 'playwright'));
const sharp = require(path.join(G, 'sharp'));
const BASE = 'http://localhost:3999';
const OUT = '/tmp/shots';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const receipt = '/tmp/receipt.jpg';
  await sharp({ create: { width: 900, height: 1400, channels: 3, background: '#f4f1ea' } })
    .composite([{ input: Buffer.from('<svg width="900" height="1400"><text x="80" y="160" font-size="56" font-family="monospace">ЧЕК № 0418</text><text x="80" y="300" font-size="40" font-family="monospace">Плитка 18 м2 ... 576.00</text><text x="80" y="380" font-size="40" font-family="monospace">Клей 5 шт ...... 70.00</text><text x="80" y="1200" font-size="60" font-family="monospace">ИТОГО 646.00</text></svg>'), top: 0, left: 0 }])
    .jpeg().toFile(receipt);

  const browser = await chromium.launch();
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|telegram\.org/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    p.on('dialog', (d) => d.accept());
    return p;
  };
  const shot = async (p, name) => { await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  const sfx = Date.now();

  const a = await mk();
  await a.goto(BASE + '/#/register');
  await shot(a, '01-register');
  await a.fill('#fname', 'Артём');
  await a.fill('#lname', 'Попов');
  await a.fill('#email', `a${sfx}@t.md`);
  await a.fill('#pw', 'secret1');
  await a.click('button.btn');
  await a.waitForSelector('text=Мои вложения');
  await shot(a, '02-home-empty');
  await a.click('text=Создать объект');
  await a.fill('#name', 'Ботаника, 2 комн.');
  await a.fill('#area', '54');
  await a.selectOption('#status', 'ремонт');
  await a.fill('#sale', '105000');
  await a.fill('#buy', '68000');
  await a.click('[data-rep="1"]');
  await a.fill('#repair', '14000');
  await a.setInputFiles('#coverIn', receipt);
  await a.waitForTimeout(500);
  await shot(a, '01b-object-form');
  await a.click('button.btn');
  await a.waitForSelector('h1.h');
  const oid = a.url().match(/#\/o\/(\d+)/)[1];

  // приглашение Дениса
  await a.goto(`${BASE}/#/o/${oid}/members`);
  await a.click('#mk');
  await a.waitForSelector('#link .field');
  const toWeb = (u) => u.includes('start=join_') ? `${BASE}/#/join/${u.split('start=join_')[1]}` : u;
  const link = toWeb((await a.textContent('#link .field')).trim());
  await shot(a, '03-members-invite');
  // приглашение Игоря (прораб)
  await a.selectOption('#irole', 'foreman');
  await a.click('#mk');
  await a.waitForTimeout(300);
  const link2 = toWeb((await a.textContent('#link .field')).trim());

  const d = await mk();
  await d.goto(link);
  await d.waitForSelector('text=Зарегистрироваться');
  await shot(d, '04-join');
  await d.click('text=Зарегистрироваться');
  await d.fill('#fname', 'Денис');
  await d.fill('#lname', 'Руссу');
  await d.fill('#email', `d${sfx}@t.md`);
  await d.fill('#pw', 'secret1');
  await d.click('button.btn');
  await d.waitForSelector('#acc');
  await d.click('#acc');
  await d.waitForSelector('h1.h');

  const i = await mk();
  await i.goto(link2);
  await i.click('text=Зарегистрироваться');
  await i.fill('#fname', 'Игорь');
  await i.fill('#lname', 'Чебан');
  await i.fill('#email', `i${sfx}@t.md`);
  await i.fill('#pw', 'secret1');
  await i.click('button.btn');
  await i.click('#acc');
  await i.waitForSelector('h1.h');

  // доли
  await a.goto(`${BASE}/#/o/${oid}/shares`);
  await a.waitForSelector('[data-p]');
  const ps = await a.$$('[data-p]');
  await ps[0].fill('50'); await ps[0].dispatchEvent('change');
  const ps2 = await a.$$('[data-p]');
  await ps2[1].fill('50'); await ps2[1].dispatchEvent('change');
  await a.click('[data-mode="pct"]');
  await shot(a, '05-shares-creator');
  await a.click('#save');
  await a.waitForSelector('h1.h');

  // операции Артёма
  const add = async (p, kind, amount, cat, note, source, photo) => {
    await p.goto(`${BASE}/#/o/${oid}/add`);
    await p.waitForSelector('#amt');
    if (await p.$(`[data-k="${kind}"]`)) await p.click(`[data-k="${kind}"]`);
    await p.fill('#amt', amount);
    if (cat) await p.click(`[data-c="${cat}"]`);
    if (source) await p.click(`[data-src="${source}"]`);
    if (note) await p.fill('#note', note);
    if (photo) {
      const inputs = await p.$$('[data-photo]');
      await inputs[1].setInputFiles(photo);
      await p.waitForSelector('.thumb');
    }
    if (photo) await shot(p, `06-add-${kind}`);
    await p.click('#save');
    await p.waitForSelector('h1.h');
  };
  await add(a, 'in', '44000', null, 'Перевод на общий счёт');
  await add(d, 'in', '38000', null, 'Перевод на общий счёт');
  await add(a, 'out', '68000', 'Покупка', 'Покупка по договору');
  await add(a, 'out', '1900', 'Нотариус и регистрация', 'Нотариус');
  await add(i, 'out', '1240', null, 'Плитка, санузел', null, receipt);

  await d.goto(`${BASE}/#/o/${oid}`);
  await d.waitForSelector('h1.h');
  await shot(d, '07-object-denis');
  await d.evaluate(() => window.scrollTo(0, 900));
  await d.screenshot({ path: `${OUT}/08-object-denis-scrolled.png` });

  await d.goto(`${BASE}/#/o/${oid}/forecast`);
  await d.waitForSelector('.section-h');
  await shot(d, '09-forecast');

  // чек: Денис открывает чек Игоря
  await d.goto(`${BASE}/#/o/${oid}`);
  await d.click('text=Плитка, санузел');
  await d.waitForSelector('[data-open]');
  await shot(d, '10-entry');
  await d.click('[data-open="0"]');
  await d.waitForSelector('.viewer img');
  await d.waitForTimeout(500);
  await shot(d, '11-viewer');

  // Денис не может менять доли
  await d.goto(`${BASE}/#/o/${oid}/shares`);
  await d.waitForSelector('h1.h');
  const editable = await d.$('[data-p]');
  console.log(editable ? 'FAIL: Денис видит редактор долей' : 'ok   Денис видит доли только для чтения');
  await shot(d, '12-shares-readonly');

  await a.goto(`${BASE}/#/`);
  await a.waitForSelector('.obj');
  await shot(a, '13-home');
  await a.goto(`${BASE}/#/o/${oid}`);
  await a.waitForSelector('.hero-photo');
  await shot(a, '15-object-photo');

  // удаление
  await a.goto(`${BASE}/#/o/${oid}/delete`);
  await a.click('#req');
  await a.waitForSelector('text=Согласие участников');
  await d.goto(`${BASE}/#/o/${oid}/delete`);
  await d.click('#yes');
  await d.waitForSelector('text=ждём 1');
  await shot(d, '14-delete-waiting');
  await i.goto(`${BASE}/#/o/${oid}/delete`);
  await i.click('#yes');
  await i.waitForSelector('text=Мои вложения');
  console.log('ok   объект удалён после согласия всех');

  await browser.close();
})().catch((e) => { console.error('UI FAIL', e); process.exit(1); });
