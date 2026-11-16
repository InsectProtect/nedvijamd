// Сброс пароля: ссылка от администратора, вход с новым паролем, старые сессии закрыты.
import { execSync } from 'child_process';
const BASE = 'http://localhost:3999';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else console.log('ok  ', m); };
function client() { let cookie = ''; return async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, data: await r.json().catch(() => null) }; }; }
const sfx = Date.now(); const ADM = client(), U = client(), U2 = client();
const adm = (await ADM('POST', '/api/register', { email: `ra${sfx}@r.md`, first_name: 'Ад', last_name: 'Мин', password: 'secret1' })).data.user.id;
const uid = (await U('POST', '/api/register', { email: `ru${sfx}@r.md`, first_name: 'Забыл', last_name: 'Пароль', password: 'oldpass1' })).data.user.id;
execSync(`psql -h /tmp -p 5433 -U postgres -d dolya -c "update users set is_admin=true where id=${adm}"`);
let r = await U2('POST', '/api/password/forgot', { email: `nobody${sfx}@r.md` });
ok(r.status === 200 && r.data.ok, 'forgot answers the same for unknown email');
ok((await U('POST', `/api/admin/users/${uid}/reset-link`)).status === 403, 'non-admin cannot make reset link');
r = await ADM('POST', `/api/admin/users/${uid}/reset-link`);
const t = r.data.url.split('#/reset/')[1];
ok(t && t.length > 20, 'admin gets reset link');
r = await U2('GET', `/api/password/reset/${t}`);
ok(r.status === 200 && r.data.name === 'Забыл Пароль', 'reset link shows account');
ok((await U2('POST', `/api/password/reset/${t}`, { password: '123' })).status === 400, 'short password rejected');
r = await U2('POST', `/api/password/reset/${t}`, { password: 'newpass1' });
ok(r.status === 200 && r.data.user.id === uid, 'password reset logs in');
ok((await U('GET', '/api/me')).status === 401, 'old sessions closed');
ok((await U2('GET', `/api/password/reset/${t}`)).status === 404, 'link single use');
ok((await client()('POST', '/api/login', { email: `ru${sfx}@r.md`, password: 'oldpass1' })).status === 401, 'old password fails');
ok((await client()('POST', '/api/login', { email: `ru${sfx}@r.md`, password: 'newpass1' })).status === 200, 'new password works');
r = await ADM('POST', `/api/objects`, { name: 'Пробелы', purchase_price: '68 000', sale_price: '105 000,50' });
const o = await ADM('GET', `/api/objects/${r.data.id}`);
ok(o.data.object.purchase_price === 68000 && o.data.object.sale_price === 105000.5, 'amounts with spaces and comma accepted');
console.log(failures ? `${failures} FAILED` : 'ALL PASSED'); process.exit(failures ? 1 : 0);
