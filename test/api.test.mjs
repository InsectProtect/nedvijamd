// Сценарий: Артём создаёт объект, приглашает Дениса (инвестор) и Игоря (прораб),
// все вносят свои операции, проверяем права, расчёты и удаление по согласию.
const BASE = process.env.BASE || 'http://localhost:3999';
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', cookie },
      body: body ? JSON.stringify(body) : undefined
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.arrayBuffer();
    return { status: r.status, data };
  };
}

const sfx = Date.now();
const A = client(), D = client(), I = client(), B = client();
let r = await A('POST', '/api/register', { email: `artem${sfx}@t.md`, first_name: 'Артём', last_name: 'Попов', password: 'secret1' });
ok(r.status === 200, 'register Артём');
r = await client()('POST', '/api/register', { email: `solo${sfx}@t.md`, first_name: 'Один', last_name: '', password: 'secret1' });
ok(r.status === 400, 'surname required');
await D('POST', '/api/register', { email: `den${sfx}@t.md`, first_name: 'Денис', last_name: 'Руссу', password: 'secret1' });
await I('POST', '/api/register', { email: `igor${sfx}@t.md`, first_name: 'Игорь', last_name: 'Чебан', password: 'secret1' });
await B('POST', '/api/register', { email: `buh${sfx}@t.md`, first_name: 'Мария', last_name: 'Бухгалтер', password: 'secret1' });
r = await A('POST', '/api/login', { email: `artem${sfx}@t.md`, password: 'wrong' });
ok(r.status === 401, 'wrong password rejected');

r = await A('POST', '/api/objects', { name: 'Ботаника, 2 комн.', area: 54, purchase_price: 68000, sale_price: 105000, status: 'ремонт' });
const oid = r.data.id;
ok(oid, 'object created');

for (const [cl, role] of [[D, 'investor'], [I, 'foreman'], [B, 'viewer']]) {
  const inv = await A('POST', `/api/objects/${oid}/invites`, { role });
  const info = await cl('GET', `/api/invites/${inv.data.token}`);
  ok(info.data.object_name === 'Ботаника, 2 комн.', `invite info ${role}`);
  const acc = await cl('POST', `/api/invites/${inv.data.token}/accept`);
  ok(acc.data.object_id === oid, `accept ${role}`);
}
r = await D('POST', `/api/objects/${oid}/invites`, { role: 'investor' });
ok(r.status === 403, 'non-creator cannot invite');

// доли
let det = await A('GET', `/api/objects/${oid}`);
const ids = Object.fromEntries(det.data.members.map((m) => [m.name.split(' ')[0], m.user_id]));
r = await D('PUT', `/api/objects/${oid}/shares`, { members: [] });
ok(r.status === 403, 'only creator sets shares');
r = await A('PUT', `/api/objects/${oid}/shares`, { members: [
  { user_id: ids['Артём'], share_pct: 50 }, { user_id: ids['Денис'], share_pct: 40 }] });
ok(r.status === 400, 'shares must sum 100');
r = await A('PUT', `/api/objects/${oid}/shares`, { members: [
  { user_id: ids['Артём'], share_pct: 50 }, { user_id: ids['Денис'], share_pct: 50 },
  { user_id: ids['Игорь'], foreman_mode: 'pct', foreman_value: 10 }] });
ok(r.status === 200, 'shares saved');

// операции
const tiny = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex').toString('base64');
await A('POST', `/api/objects/${oid}/entries`, { kind: 'in', amount: 44000 });
await D('POST', `/api/objects/${oid}/entries`, { kind: 'in', amount: 38000 });
r = await A('POST', `/api/objects/${oid}/entries`, { kind: 'out', source: 'pool', category: 'Покупка', amount: 68000 });
ok(r.status === 200, 'expense (own money)');
await A('POST', `/api/objects/${oid}/entries`, { kind: 'out', source: 'pool', category: 'Нотариус и регистрация', amount: 1900 });
r = await I('POST', `/api/objects/${oid}/entries`, { kind: 'out', source: 'own', category: 'Мебель и техника', amount: 1240, note: 'Плитка', photos: [{ mime: 'image/jpeg', data: tiny }, { mime: 'image/jpeg', data: tiny }] });
ok(r.status === 200, 'foreman expense with photos');
const fEntry = r.data.id;
r = await I('POST', `/api/objects/${oid}/entries`, { kind: 'in', amount: 100 });
ok(r.status === 403, 'foreman cannot contribute');
r = await B('POST', `/api/objects/${oid}/entries`, { kind: 'out', amount: 100 });
ok(r.status === 403, 'viewer cannot add');

r = await A('POST', `/api/objects/${oid}/entries`, { kind: 'plan', category: 'Ремонт', amount: 14000 });
ok(r.status === 400, 'plan operations are no longer allowed');
await A('PATCH', `/api/objects/${oid}`, { name: 'Ботаника, 2 комн.', area: 54, purchase_price: 68000, repair_budget: 14000, sale_price: 105000, status: 'ремонт' });
r = await D('DELETE', `/api/entries/${fEntry}`);
ok(r.status === 403, 'cannot delete others entry');

det = await A('GET', `/api/objects/${oid}`);
const c = det.data.calc;
console.log(JSON.stringify(c, null, 1).slice(0, 1500));
ok(c.factTotal === 71140, 'fact total');
ok(c.planTotal === 82000, 'plan total from purchase price + repair estimate');
ok(det.data.entries.find((e) => e.id === fEntry).category === 'Ремонт', 'foreman category forced to Ремонт');
// forecast costs = Покупка 68000 + Ремонт max(14000,1240) + Нотариус 1900 = 83900
ok(c.forecastCosts === 83900, 'forecast costs uses max(plan,fact)');
ok(c.profit === 21100, 'profit');
const igor = det.data.members.find((m) => m.name.startsWith('Игорь'));
ok(igor.payout === 2110, 'foreman 10%');
ok(det.data.members.find((m) => m.name.startsWith('Артём')).payout === 9495, 'investor half of rest');
ok(c.settlement.length > 0, 'settlement computed: ' + JSON.stringify(c.settlement));

// чеки
const ent = await D('GET', `/api/entries/${fEntry}`);
ok(ent.data.receipts.length === 2, 'two receipts listed');
const img = await D('GET', `/api/receipts/${ent.data.receipts[0].id}/image`);
ok(img.status === 200 && img.data.byteLength === 22, 'receipt image served to member');
const out = client();
r = await out('GET', `/api/receipts/${ent.data.receipts[0].id}/image`);
ok(r.status === 401, 'receipt hidden from anonymous');

// список
r = await A('GET', '/api/objects');
ok(r.data.objects.length === 1 && r.data.totals.invested === 44000 + 68000 + 1900 && r.data.totals.profit === 9495, 'home totals: ' + JSON.stringify(r.data.totals));

// договор
r = await D('GET', `/api/objects/${oid}/contract`);
ok(r.status === 200 && r.data.html.includes('ACORD DE INVESTIȚIE COMUNĂ') && r.data.html.includes('Денис Руссу') && r.data.html.includes('Diriginte de șantier'), 'contract generated with names');
r = await B('GET', `/api/objects/${oid}/contract`);
ok(r.status === 200, 'viewer can see contract');
r = await A('POST', `/api/objects/${oid}/contract-link`);
const cl = await fetch(BASE + '/c/' + r.data.url.split('/c/')[1]);
const ch = await cl.text();
ok(cl.status === 200 && ch.includes('window.print()'), 'printable contract link works without session');
r = await A('PATCH', '/api/me', { lang: 'ro' });
ok(r.data.user.lang === 'ro', 'language saved');

// личные данные: выключены по умолчанию, включает администратор
(await import('child_process')).execSync(`psql -h /tmp -p 5433 -U postgres -d ${process.env.TEST_DB || 'dolya'} -c "delete from app_settings"`);
r = await A('PATCH', '/api/me', { idnp: '2001234567890' });
ok(r.status === 403, 'personal data input is off by default');
r = await A('PUT', '/api/admin/settings', { personal_data: true });
ok(r.status === 403, 'only app admin toggles personal data');
const { execSync } = await import('child_process');
execSync(`psql -h /tmp -p 5433 -U postgres -d ${process.env.TEST_DB || 'dolya'} -c "update users set is_admin = true where email = 'artem${sfx}@t.md'"`);
r = await A('PUT', '/api/admin/settings', { personal_data: true });
ok(r.status === 200 && r.data.settings.personal_data === true, 'admin enabled personal data');
r = await A('PATCH', '/api/me', { phone: '+373 69 123456', birth_date: '1990-05-01' });
ok(r.status === 200 && r.data.user.phone === '+373 69 123456' && r.data.user.birth_date === '1990-05-01', 'phone and birth date saved');

// подписание договора
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 1)]).toString('base64');
r = await D('GET', `/api/objects/${oid}/contract`);
ok(r.data.fixed === false && r.data.parties.length === 3, 'draft contract with 3 parties (viewer excluded)');
r = await D('PUT', `/api/objects/${oid}/contract-fields`, { number: 'X' });
ok(r.status === 403, 'only creator fills contract fields');
r = await A('PUT', `/api/objects/${oid}/contract-fields`, { number: '7', city: 'mun. Chișinău', property_address: 'str. Testului 1, ap. 5', cadastral: '0100123.456.01', owner_user_id: ids['Артём'], overrun_pct: 10, payout_days: 15 });
ok(r.status === 200, 'contract fields saved');
r = await A('POST', `/api/objects/${oid}/contract/sign`, { signature: png, agree: true });
ok(r.status === 400, 'cannot sign before contract is sent');
r = await D('POST', `/api/objects/${oid}/contract/fix`);
ok(r.status === 403, 'only creator sends contract');
r = await A('POST', `/api/objects/${oid}/contract/fix`);
ok(r.status === 200 && r.data.version_id, 'contract fixed');
r = await A('POST', `/api/objects/${oid}/contract/sign`, { signature: png, agree: true });
ok(r.status === 400, 'IDNP required to sign');
r = await A('PATCH', '/api/me', { idnp: '123', address: 'x' });
ok(r.status === 400, 'bad IDNP rejected');
await A('PATCH', '/api/me', { idnp: '2001234567890', address: 'mun. Chișinău, str. Florilor 3' });
r = await A('POST', `/api/objects/${oid}/contract/sign`, { signature: png, agree: true });
ok(r.status === 200 && r.data.signed === 1 && !r.data.all_signed, 'Артём signed 1/3');
r = await B('POST', `/api/objects/${oid}/contract/sign`, { signature: png, agree: true });
ok(r.status === 403, 'viewer is not a party');
await D('PATCH', '/api/me', { idnp: '2009876543210', address: 'or. Ialoveni' });
await I('PATCH', '/api/me', { idnp: '2005555555555', address: 'or. Orhei' });
await D('POST', `/api/objects/${oid}/contract/sign`, { signature: png, agree: true });
r = await I('POST', `/api/objects/${oid}/contract/sign`, { signature: png, agree: true });
ok(r.data.all_signed === true, 'all parties signed');
r = await B('GET', `/api/objects/${oid}`);
ok(r.data.object.contract.all_signed === true, 'object shows contract signed');
r = await B('GET', `/api/objects/${oid}/contract`);
ok(r.data.html.includes('semnat electronic') && r.data.html.includes('str. Testului 1, ap. 5') && r.data.html.includes('2009876543210') && r.data.html.includes('0100123.456.01') && !r.data.html.includes('PROIECT'), 'signed contract filled in');
ok(r.data.version.stale === false, 'contract not stale');
await A('PUT', `/api/objects/${oid}/shares`, { members: [{ user_id: ids['Артём'], share_pct: 60 }, { user_id: ids['Денис'], share_pct: 40 }, { user_id: ids['Игорь'], foreman_mode: 'pct', foreman_value: 10 }] });
r = await D('GET', `/api/objects/${oid}/contract`);
ok(r.data.version.stale === true, 'changing shares marks contract stale');
await A('PUT', `/api/objects/${oid}/shares`, { members: [{ user_id: ids['Артём'], share_pct: 50 }, { user_id: ids['Денис'], share_pct: 50 }, { user_id: ids['Игорь'], foreman_mode: 'pct', foreman_value: 10 }] });
r = await D('GET', `/api/objects/${oid}/contract`);
ok(r.data.version.stale === false, 'reverting shares clears stale');
r = await A('GET', `/api/objects/${oid}/contract`);
ok(r.data.html.includes('născut(ă) la <b>01.05.1990</b>'), 'birth date in contract');
await A('PUT', '/api/admin/settings', { personal_data: false });
r = await D('GET', `/api/objects/${oid}/contract`);
ok(r.data.personal_data === false, 'switch off visible to participants');

// аванс от покупателя
r = await I('POST', `/api/objects/${oid}/advances`, { amount: 2000, valid_until: '2099-01-01' });
ok(r.status === 403, 'foreman cannot register advance');
r = await D('POST', `/api/objects/${oid}/advances`, { amount: 2000 });
ok(r.status === 400, 'advance needs valid-until date');
r = await D('POST', `/api/objects/${oid}/advances`, { amount: 2000, buyer: 'Покупатель', valid_until: '2099-01-01' });
const adv1 = r.data.id;
let before = (await A('GET', `/api/objects/${oid}`)).data;
ok(before.calc.advanceActive === 2000 && before.advances[0].days_left > 1000 && before.advances[0].status === 'active', 'active advance visible with days left');
const profit0 = before.calc.profit;
const denInv0 = before.members.find((m) => m.name.startsWith('Денис')).invested;
r = await B('POST', `/api/advances/${adv1}/status`, { status: 'kept' });
ok(r.status === 403, 'viewer cannot close advance');
r = await D('POST', `/api/advances/${adv1}/status`, { status: 'kept' });
ok(r.status === 200, 'advance kept');
let after = (await A('GET', `/api/objects/${oid}`)).data;
ok(after.calc.profit === profit0 + 2000 && after.calc.advanceKept === 2000, 'kept advance adds to profit: ' + after.calc.profit);
ok(after.members.find((m) => m.name.startsWith('Денис')).invested === denInv0, 'holder investment unchanged');
ok(JSON.stringify(after.calc.settlement) !== JSON.stringify(before.calc.settlement), 'kept advance cash is shared in settlement: ' + JSON.stringify(before.calc.settlement) + ' / ' + JSON.stringify(after.calc.settlement));
r = await D('POST', `/api/advances/${adv1}/status`, { status: 'returned' });
ok(r.status === 400, 'closed advance cannot change');
r = await D('POST', `/api/objects/${oid}/advances`, { amount: 1500, valid_until: '2020-01-01' });
const adv2 = r.data.id;
after = (await A('GET', `/api/objects/${oid}`)).data;
ok(after.advances.find((a) => a.id === adv2).days_left < 0, 'expired advance has negative days');
r = await A('POST', `/api/advances/${adv2}/status`, { status: 'returned' });
ok(r.status === 200, 'creator can close partner advance');
after = (await A('GET', `/api/objects/${oid}`)).data;
ok(after.calc.profit === profit0 + 2000, 'returned advance does not change profit');

// договор аванса с покупателем
r = await D('POST', `/api/objects/${oid}/advances`, { amount: 3000, buyer: 'Ion Rusu', buyer_idnp: '2003333333333', buyer_address: 'or. Bălți', buyer_phone: '+37369000000', sale_price: 105000, valid_until: '2099-02-01', return_mode: 'double', city: 'mun. Chișinău' });
const adv3 = r.data.id;
r = await D('GET', `/api/advances/${adv3}`);
ok(r.data.html.includes('CONTRACT DE ARVUNĂ') && r.data.html.includes('ДОГОВОР ЗАДАТКА') && r.data.html.includes('Ion Rusu') && r.data.html.includes('în mărime dublă') && r.data.html.includes('в двойном размере'), 'bilingual advance contract');
ok(r.data.can_sign_seller && r.data.can_collect_buyer && r.data.can_edit, 'receiver can sign and collect buyer signature');
r = await A('GET', `/api/advances/${adv3}`);
ok(!r.data.can_sign_seller && r.data.can_collect_buyer, 'creator can collect buyer signature but not sign as seller');
r = await B('POST', `/api/advances/${adv3}/sign`, { party: 'buyer', signature: png, agree: true });
ok(r.status === 403, 'viewer cannot collect signatures');
r = await D('POST', `/api/advances/${adv3}/sign`, { party: 'seller', signature: png, agree: true });
ok(r.status === 200, 'seller signed');
r = await D('PATCH', `/api/advances/${adv3}`, { buyer: 'X' });
ok(r.status === 400, 'cannot edit after signing');
r = await D('POST', `/api/advances/${adv3}/sign`, { party: 'buyer', signature: png, agree: true });
ok(r.data.signed.length === 2, 'buyer signed on seller device');
r = await D('POST', `/api/advances/${adv3}/contract-link`);
const al = await fetch(BASE + '/a/' + r.data.url.split('/a/')[1]);
const alh = await al.text();
ok(al.status === 200 && (alh.match(/semnat electronic/g) || []).length === 2, 'printable advance contract with both signatures');

// удаление операции с согласия всех
r = await I('POST', `/api/objects/${oid}/entries`, { kind: 'out', amount: 300, note: 'Ошибка' });
const bad = r.data.id;
r = await D('DELETE', `/api/entries/${bad}`);
ok(r.status === 403, 'only author can request entry deletion');
r = await I('DELETE', `/api/entries/${bad}`);
ok(r.data.pending === true && r.data.deleted === false, 'deletion request pending');
r = await A('GET', `/api/objects/${oid}`);
let be = r.data.entries.find((e) => e.id === bad);
ok(be && be.delete_pending && be.need_my_vote, 'Артём sees pending entry needing his vote');
ok(r.data.calc.factTotal === 71140 + 300, 'pending entry still counted');
r = await B('POST', `/api/entries/${bad}/delete-vote`, { agree: true });
ok(r.status === 403, 'viewer cannot vote on entry');
r = await D('POST', `/api/entries/${bad}/delete-vote`, { agree: true });
ok(r.data.deleted === false, 'Денис agreed, still waiting');
r = await A('POST', `/api/entries/${bad}/delete-vote`, { agree: false });
ok(r.data.cancelled === true, 'Артём refused → request cancelled');
r = await A('GET', `/api/entries/${bad}`);
ok(r.status === 200 && !r.data.entry.delete_pending, 'entry kept after refusal');
await I('DELETE', `/api/entries/${bad}`);
r = await D('GET', `/api/entries/${bad}`);
ok(r.data.deletion && r.data.deletion.votes.filter((v) => v.agreed).length === 1, 'new request resets votes');
await D('POST', `/api/entries/${bad}/delete-vote`, { agree: true });
r = await A('POST', `/api/entries/${bad}/delete-vote`, { agree: true });
ok(r.data.deleted === true, 'all agreed → entry deleted');
r = await A('GET', `/api/entries/${bad}`);
ok(r.status === 404, 'entry gone');

// аренда
r = await I('POST', `/api/objects/${oid}/entries`, { kind: 'rent', amount: 500 });
ok(r.status === 403, 'foreman cannot add rent');
let pre = (await A('GET', `/api/objects/${oid}`)).data.calc;
r = await D('POST', `/api/objects/${oid}/entries`, { kind: 'rent', amount: 600, note: 'Аренда за ноябрь' });
ok(r.status === 200, 'rent added');
let post = (await A('GET', `/api/objects/${oid}`)).data.calc;
ok(post.rentTotal === 600 && post.profit === pre.profit + 600 && post.factTotal === pre.factTotal, 'rent adds to profit, not to costs');

// сумма в леях (курс вручную)
r = await A('POST', `/api/objects/${oid}/entries`, { kind: 'out', category: 'Ремонт', currency: 'MDL', orig_amount: 1960, rate: 19.6, note: 'Краска' });
const lei = r.data.id;
r = await A('GET', `/api/entries/${lei}`);
ok(r.data.entry.amount === 100 && r.data.entry.orig_amount === 1960 && r.data.entry.orig_currency === 'MDL', 'lei converted by rate: ' + r.data.entry.amount);

// исправление операции с согласия всех
r = await D('POST', `/api/entries/${lei}/edit`, { amount: 200 });
ok(r.status === 403, 'only author proposes edit');
r = await A('POST', `/api/entries/${lei}/edit`, { amount: 150, category: 'Ремонт', note: 'Краска и грунт' });
ok(r.data.pending === true, 'edit proposal pending');
r = await D('GET', `/api/objects/${oid}`);
ok(r.data.entries.find((e) => e.id === lei).need_my_edit_vote === true, 'partner sees edit needing vote');
r = await D('GET', `/api/entries/${lei}`);
ok(r.data.edit && r.data.edit.proposal.amount === 150 && r.data.entry.amount === 100, 'old value kept until approved');
r = await A('DELETE', `/api/entries/${lei}`);
ok(r.status === 400, 'no delete while edit pending');
await D('POST', `/api/entries/${lei}/edit-vote`, { agree: true });
r = await I('POST', `/api/entries/${lei}/edit-vote`, { agree: true });
ok(r.data.applied === true, 'edit applied after all agreed');
r = await A('GET', `/api/entries/${lei}`);
ok(r.data.entry.amount === 150 && r.data.entry.note === 'Краска и грунт' && !r.data.edit, 'entry updated');
await A('POST', `/api/entries/${lei}/edit`, { amount: 999 });
r = await I('POST', `/api/entries/${lei}/edit-vote`, { agree: false });
ok(r.data.cancelled === true, 'any refusal cancels edit');
r = await A('GET', `/api/entries/${lei}`);
ok(r.data.entry.amount === 150, 'refused edit not applied');

// отчёт
r = await B('GET', `/api/objects/${oid}/report?lang=ro`);
ok(r.status === 200 && r.data.html.includes('Raport pe obiect') && r.data.html.includes('Venit din chirie'), 'report in Romanian');
r = await A('POST', `/api/objects/${oid}/report-link`, { lang: 'ru' });
const rl = await fetch(BASE + '/r/' + r.data.url.split('/r/')[1]);
ok(rl.status === 200 && (await rl.text()).includes('Отчёт по объекту'), 'printable report link');

// закрытие сделки
r = await D('POST', `/api/objects/${oid}/close`, { sold_price: 110000, receiver_id: ids['Артём'] });
ok(r.status === 403, 'only creator closes deal');
r = await A('POST', `/api/objects/${oid}/close`, { sold_price: 110000, receiver_id: ids['Бухгалтер'] || 999999 });
ok(r.status === 400, 'receiver must be a deal participant');
r = await A('POST', `/api/objects/${oid}/close`, { sold_price: 110000, sold_at: '2026-12-01', receiver_id: ids['Артём'] });
ok(r.status === 200, 'deal closed');
r = await D('GET', `/api/objects/${oid}`);
const deal = r.data.deal;
ok(r.data.object.status === 'продана' && deal && deal.transfers.length > 0 && !deal.outdated, 'deal with transfers');
const sumT = deal.transfers.filter((t) => t.from === ids['Артём']).reduce((x, t) => x + t.amount, 0);
const totals = deal.rows.reduce((x, rr) => x + rr.total, 0);
ok(Math.abs(totals - (r.data.calc.totalInvested + r.data.calc.profit)) < 2, 'everyone gets investment + profit');
const myT = deal.transfers.find((t) => t.to === ids['Денис'] || t.from === ids['Денис']);
r = await I('POST', `/api/objects/${oid}/payouts/mark`, { from: myT.from, to: myT.to, paid: true });
ok(r.status === 403 || myT.from === ids['Игорь'] || myT.to === ids['Игорь'], 'third party cannot mark payout');
r = await D('POST', `/api/objects/${oid}/payouts/mark`, { from: myT.from, to: myT.to, paid: true });
ok(r.status === 200, 'payout marked');
r = await A('GET', `/api/objects/${oid}`);
ok(r.data.deal.transfers.find((t) => t.from === myT.from && t.to === myT.to).paid_at, 'payout shows as paid');
await A('POST', `/api/objects/${oid}/entries`, { kind: 'out', category: 'Налоги', amount: 500 });
r = await A('GET', `/api/objects/${oid}`);
ok(r.data.deal.outdated === true, 'new expense after close marks deal outdated');
await A('POST', `/api/objects/${oid}/recalc`);
r = await A('GET', `/api/objects/${oid}`);
ok(r.data.deal.outdated === false, 'recalc refreshes payouts');
r = await A('POST', `/api/objects/${oid}/reopen`);
r = await A('GET', `/api/objects/${oid}`);
ok(r.data.deal === null && r.data.object.status === 'продаётся', 'deal reopened');

// удаление
r = await D('POST', `/api/objects/${oid}/delete-request`);
ok(r.status === 403, 'only creator requests delete');
r = await A('POST', `/api/objects/${oid}/delete-request`);
ok(r.data.deleted === false, 'request created');
r = await D('POST', `/api/objects/${oid}/delete-vote`, { agree: true });
ok(r.data.deleted === false, 'Денис agreed, still waiting');
r = await B('POST', `/api/objects/${oid}/delete-vote`, { agree: true });
ok(r.status === 403, 'viewer does not vote');
r = await I('POST', `/api/objects/${oid}/delete-vote`, { agree: true });
ok(r.data.deleted === true, 'all agreed → deleted');
r = await A('GET', `/api/objects/${oid}`);
ok(r.status === 404, 'object gone');

// рассрочка
r = await A('POST', '/api/objects', { name: 'Рассрочка', purchase_price: 60000, installment: true, installment_monthly: 1500 });
const inst = r.data.id;
await A('POST', `/api/objects/${inst}/entries`, { kind: 'out', category: 'Покупка', amount: 20000, note: 'Первый взнос' });
await A('POST', `/api/objects/${inst}/entries`, { kind: 'out', category: 'Покупка', amount: 1500, note: 'Платёж' });
r = await A('GET', `/api/objects/${inst}`);
const ins = r.data.object.installment;
ok(ins && ins.paid === 21500 && ins.left === 38500 && ins.payments_left === 26, 'installment progress: ' + JSON.stringify(ins));
r = await A('GET', '/api/objects');
ok(r.data.objects.find((o) => o.id === inst).installment.left === 38500, 'installment in list');
r = await A('PATCH', `/api/objects/${inst}`, { name: 'Рассрочка', purchase_price: 60000, installment: false });
r = await A('GET', `/api/objects/${inst}`);
ok(r.data.object.installment === null, 'installment can be turned off');

// бюджет ремонта
r = await A('POST', '/api/objects', { name: 'Ремонт', purchase_price: 50000, repair_budget: 14000 });
const rep = r.data.id;
await A('POST', `/api/objects/${rep}/entries`, { kind: 'out', category: 'Ремонт', amount: 6500 });
r = await A('GET', `/api/objects/${rep}`);
const rp = r.data.object.repair;
ok(rp && rp.budget === 14000 && rp.spent === 6500 && rp.left === 7500, 'repair progress: ' + JSON.stringify(rp));
ok(r.data.calc.planTotal === 64000, 'repair budget goes to plan');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
