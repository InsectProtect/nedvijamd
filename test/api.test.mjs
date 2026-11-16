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
let r = await A('POST', '/api/register', { email: `artem${sfx}@t.md`, name: 'Артём', password: 'secret1' });
ok(r.status === 200, 'register Артём');
await D('POST', '/api/register', { email: `den${sfx}@t.md`, name: 'Денис', password: 'secret1' });
await I('POST', '/api/register', { email: `igor${sfx}@t.md`, name: 'Игорь', password: 'secret1' });
await B('POST', '/api/register', { email: `buh${sfx}@t.md`, name: 'Бухгалтер', password: 'secret1' });
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
const ids = Object.fromEntries(det.data.members.map((m) => [m.name, m.user_id]));
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
ok(r.status === 200, 'pool expense');
await A('POST', `/api/objects/${oid}/entries`, { kind: 'out', source: 'pool', category: 'Нотариус и регистрация', amount: 1900 });
r = await I('POST', `/api/objects/${oid}/entries`, { kind: 'out', source: 'own', category: 'Мебель и техника', amount: 1240, note: 'Плитка', photos: [{ mime: 'image/jpeg', data: tiny }, { mime: 'image/jpeg', data: tiny }] });
ok(r.status === 200, 'foreman expense with photos');
const fEntry = r.data.id;
r = await I('POST', `/api/objects/${oid}/entries`, { kind: 'in', amount: 100 });
ok(r.status === 403, 'foreman cannot contribute');
r = await B('POST', `/api/objects/${oid}/entries`, { kind: 'out', amount: 100 });
ok(r.status === 403, 'viewer cannot add');

await A('POST', `/api/objects/${oid}/entries`, { kind: 'plan', category: 'Ремонт', amount: 14000 });
await A('POST', `/api/objects/${oid}/entries`, { kind: 'plan', category: 'Нотариус и регистрация', amount: 1800 });
r = await D('DELETE', `/api/entries/${fEntry}`);
ok(r.status === 403, 'cannot delete others entry');

det = await A('GET', `/api/objects/${oid}`);
const c = det.data.calc;
console.log(JSON.stringify(c, null, 1).slice(0, 1500));
ok(c.factTotal === 71140, 'fact total');
ok(c.planTotal === 83800, 'plan total');
ok(det.data.entries.find((e) => e.id === fEntry).category === 'Ремонт', 'foreman category forced to Ремонт');
// forecast costs = Покупка 68000 + Ремонт max(14000,1240) + Нотариус max(1800,1900) = 83900
ok(c.forecastCosts === 83900, 'forecast costs uses max(plan,fact)');
ok(c.profit === 21100, 'profit');
const igor = det.data.members.find((m) => m.name === 'Игорь');
ok(igor.payout === 2110, 'foreman 10%');
ok(det.data.members.find((m) => m.name === 'Артём').payout === 9495, 'investor half of rest');
ok(c.poolBalance === 12100, 'pool balance');
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
ok(r.data.objects.length === 1 && r.data.totals.invested === 44000 && r.data.totals.profit === 9495, 'home totals: ' + JSON.stringify(r.data.totals));

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

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
