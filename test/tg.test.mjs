// Проверка Telegram: вход из Mini App, приглашение через бота, уведомления, привязка аккаунта.
import http from 'http';
import crypto from 'crypto';
const BASE = 'http://localhost:3999';
const TOKEN = '123456:TEST_TOKEN';
const calls = [];
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else console.log('ok  ', m); };

const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    calls.push({ method, body: b ? JSON.parse(b) : {} });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: method === 'getMe' ? { username: 'dolya_test_bot' } : true }));
  });
}).listen(4001);

function initData(user, extra = {}) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), ...extra });
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
}
const secretHdr = crypto.createHash('sha256').update('dolya:' + TOKEN).digest('hex').slice(0, 48);
async function req(method, path, body, session, headers = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Session': session } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sfx = Date.now() % 100000;
const startMsg = (id, text) => ({ update_id: 1, message: { message_id: 1, chat: { id, type: 'private' }, from: { id, first_name: 'X' }, text } });

await wait(4000);
ok(calls.some((c) => c.method === 'setWebhook' && c.body.url === 'http://localhost:3999/tg/webhook'), 'webhook registered on startup');
ok(calls.some((c) => c.method === 'setChatMenuButton'), 'menu button set');

let r = await req('POST', '/api/tg-login', { initData: initData({ id: 9000 + sfx, first_name: 'Артём', username: 'artem' }) });
ok(r.status === 200 && r.data.user.name === 'Артём' && r.data.user.needs_name === true, 'tg-login creates account, asks for surname');
const sA = r.data.token;
r = await req('POST', '/api/tg-login', { initData: initData({ id: 9000 + sfx, first_name: 'Артём' }).replace(/hash=\w+/, 'hash=' + '0'.repeat(64)) });
ok(r.status === 401, 'forged initData rejected');
r = await req('POST', '/api/tg-login', { initData: initData({ id: 9000 + sfx, first_name: 'Артём' }) });
ok(r.data.user.id && r.data.token, 'same tg user logs in again');

r = await req('POST', '/api/objects', { name: 'Центр, 1 комн.' }, sA);
const oid = r.data.id;
r = await req('POST', `/api/objects/${oid}/invites`, { role: 'investor' }, sA);
ok(r.data.tg_url && r.data.tg_url.startsWith('https://t.me/dolya_test_bot?start=join_'), 'invite gives telegram link');
const inviteToken = r.data.token;

r = await req('POST', '/tg/webhook', startMsg(9100 + sfx, `/start join_${inviteToken}`), null, { 'X-Telegram-Bot-Api-Secret-Token': secretHdr });
ok(r.status === 200, 'webhook accepted');
await wait(300);
let last = calls.filter((c) => c.method === 'sendMessage').pop();
ok(last && last.body.reply_markup.inline_keyboard[0][0].web_app.url === `http://localhost:3999/#/join/${inviteToken}`, 'bot replies with join button');
r = await req('POST', '/tg/webhook', startMsg(1, '/start'), null, { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' });
ok(r.status === 403, 'webhook with wrong secret rejected');

r = await req('POST', '/api/tg-login', { initData: initData({ id: 9100 + sfx, first_name: 'Денис' }, { start_param: `join_${inviteToken}` }) });
const sD = r.data.token;
ok(r.data.startParam === `join_${inviteToken}`, 'start_param passed through');
const before = calls.length;
await req('POST', `/api/invites/${inviteToken}/accept`, null, sD);
await wait(300);
const joined = calls.slice(before).find((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(9000 + sfx));
ok(joined && /присоединился/.test(joined.body.text), 'creator notified about new member');

const b2 = calls.length;
await req('POST', `/api/objects/${oid}/entries`, { kind: 'out', category: 'Ремонт', amount: 1240, note: 'Плитка' }, sD);
await wait(300);
const exp = calls.slice(b2).find((c) => c.method === 'sendMessage');
ok(exp && String(exp.body.chat_id) === String(9000 + sfx) && /1 240/.test(exp.body.text) && /Плитка/.test(exp.body.text), 'partner notified about expense');
ok(!calls.slice(b2).some((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(9100 + sfx)), 'author not notified about own expense');

// привязка email-аккаунта
r = await req('POST', '/api/register', { email: `e${sfx}@t.md`, first_name: 'Почта', last_name: 'Тест', password: 'secret1' });
const sE = r.data.token;
r = await req('POST', '/api/tg-link', null, sE);
ok(/start=link_/.test(r.data.url), 'link url');
const lt = r.data.url.split('start=')[1];
await req('POST', '/tg/webhook', startMsg(9200 + sfx, `/start ${lt}`), null, { 'X-Telegram-Bot-Api-Secret-Token': secretHdr });
await wait(300);
r = await req('GET', '/api/me', null, sE);
ok(r.data.user.telegram === true, 'email account linked to telegram');
r = await req('POST', '/api/tg-login', { initData: initData({ id: 9200 + sfx, first_name: 'Почта' }) });
ok(r.data.user.email === `e${sfx}@t.md`, 'linked telegram logs into the email account');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
mock.close();
process.exit(failures ? 1 : 0);
