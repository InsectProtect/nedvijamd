// Доска сделок: анкеты, предложения, модерация, отклики и контакты.
import { execSync } from 'child_process';
const BASE = process.env.BASE || 'http://localhost:3999';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else console.log('ok  ', m); };
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}
const sfx = Date.now();
const ADM = client(), OWN = client(), INV = client(), X = client();
const reg = async (c, f, l) => (await c('POST', '/api/register', { email: `${f}${sfx}@m.md`, first_name: f, last_name: l, password: 'secret1' })).data.user.id;
const adm = await reg(ADM, 'Админ', 'Главный'); const own = await reg(OWN, 'Олег', 'Автор'); const inv = await reg(INV, 'Ирина', 'Инвестор'); await reg(X, 'Сергей', 'Сторонний');
execSync(`psql -h /tmp -p 5433 -U postgres -d dolya -c "update users set is_admin=true where id=${adm}; update users set phone='+37369000000' where id=${inv}"`);

let r = await INV('PUT', '/api/market/profile', { amount_to: '' });
ok(r.status === 400, 'profile needs amount');
r = await INV('PUT', '/api/market/profile', { amount_from: 20000, amount_to: 50000, note: 'Кишинёв, до года' });
ok(r.status === 200, 'investor profile submitted');
r = await OWN('GET', '/api/market');
ok(!r.data.investors.some((i) => i.user_id === inv), 'pending profile hidden from others');
r = await INV('GET', '/api/market');
ok(r.data.my_profile && r.data.my_profile.status === 'pending', 'own profile pending');

r = await OWN('POST', '/api/market/offers', { title: 'Ботаника, 2 комн. под ремонт', district: 'Ботаника', description: 'Покупка и ремонт, продажа через 8 месяцев', price: 62000, need_amount: 30000, expected_pct: 22, term_months: 8 });
ok(r.status === 200 && r.data.id, 'offer submitted');
const oid = r.data.id;
r = await X('GET', '/api/market');
ok(!r.data.offers.some((o) => o.id === oid), 'pending offer hidden');
r = await X('GET', `/api/market/offers/${oid}`);
ok(r.status === 404, 'pending offer not readable by others');
r = await X('POST', `/api/market/offers/${oid}/respond`, {});
ok(r.status === 400, 'cannot respond to pending offer');

r = await OWN('GET', '/api/market/admin');
ok(r.status === 403, 'admin only');
r = await ADM('GET', '/api/market');
ok(r.data.moderation >= 2, 'admin sees items to moderate');
r = await ADM('GET', '/api/market/admin');
ok(r.data.offers.length >= 1 && r.data.profiles.length >= 1, 'moderation list');
ok((await ADM('POST', `/api/market/admin/offer/${oid}`, { approve: true })).status === 200, 'offer approved');
ok((await ADM('POST', `/api/market/admin/profile/${inv}`, { approve: true })).status === 200, 'profile approved');

r = await X('GET', '/api/market');
ok(r.data.offers.some((o) => o.id === oid && o.author_deals === 0), 'approved offer visible');
ok(r.data.investors.some((i) => i.user_id === inv && i.amount_to === 50000), 'approved investor visible');

r = await OWN('POST', `/api/market/offers/${oid}/respond`, {});
ok(r.status === 400, 'owner cannot respond to own offer');
r = await INV('POST', `/api/market/offers/${oid}/respond`, { message: 'Готова 30 000' });
ok(r.status === 200, 'investor responded');
r = await INV('POST', `/api/market/offers/${oid}/respond`, {});
ok(r.status === 409, 'double response rejected');
r = await OWN('GET', '/api/market');
ok(r.data.inbox === 1, 'owner has 1 to answer');
r = await OWN('GET', `/api/market/offers/${oid}`);
const resp = r.data.offer.responses[0];
ok(resp && resp.can_answer && resp.amount_to === 50000 && resp.contact === null, 'owner sees response, contacts hidden');
r = await INV('POST', `/api/market/responses/${resp.id}/answer`, { accept: true });
ok(r.status === 403, 'investor cannot accept own response');
r = await OWN('POST', `/api/market/responses/${resp.id}/answer`, { accept: true });
ok(r.status === 200, 'owner accepted');
r = await OWN('GET', `/api/market/offers/${oid}`);
ok(r.data.offer.responses[0].contact && r.data.offer.responses[0].contact.phone === '+37369000000', 'owner sees investor contacts');
r = await INV('GET', `/api/market/offers/${oid}`);
ok(r.data.offer.responses.length === 1 && r.data.offer.responses[0].contact.name === 'Олег Автор', 'investor sees owner contacts');
r = await X('GET', `/api/market/offers/${oid}`);
ok(r.data.offer.responses.length === 0, 'outsider sees no responses');

// Автор предлагает сделку инвестору с доски
const X2 = client(); const x2 = await reg(X2, 'Павел', 'Второй');
await X2('PUT', '/api/market/profile', { amount_to: 15000 });
r = await OWN('POST', `/api/market/investors/${x2}/propose`, { offer_id: oid });
ok(r.status === 404, 'cannot propose to unapproved investor');
await ADM('POST', `/api/market/admin/profile/${x2}`, { approve: true });
r = await X('POST', `/api/market/investors/${x2}/propose`, { offer_id: oid });
ok(r.status === 403, 'cannot propose someone else\'s offer');
r = await OWN('POST', `/api/market/investors/${x2}/propose`, { offer_id: oid, message: 'Посмотрите' });
ok(r.status === 200, 'owner proposed to investor');
r = await X2('GET', '/api/market/inbox');
const it = r.data.items.find((i) => i.offer_id === oid);
ok(it && it.incoming && it.can_answer, 'investor sees incoming proposal');
r = await X2('GET', `/api/market/offers/${oid}`);
ok(r.data.offer.responses[0].can_answer, 'investor can answer on offer page');
r = await X2('POST', `/api/market/responses/${it.id}/answer`, { accept: false });
ok(r.status === 200, 'investor declined');
r = await OWN('GET', `/api/market/offers/${oid}`);
ok(r.data.offer.responses.find((x) => x.investor_id === x2).status === 'declined' && !r.data.offer.responses.find((x) => x.investor_id === x2).contact, 'declined: no contacts');

// Редактирование отправляет на повторную проверку, снятие убирает с доски
r = await OWN('PUT', `/api/market/offers/${oid}`, { title: 'Ботаника, 2 комн.', need_amount: 25000 });
ok(r.status === 200, 'offer edited');
r = await X('GET', '/api/market');
ok(!r.data.offers.some((o) => o.id === oid), 'edited offer hidden until re-approved');
await ADM('POST', `/api/market/admin/offer/${oid}`, { approve: false, reason: 'Нет фото' });
r = await OWN('GET', '/api/market');
ok(r.data.offers.find((o) => o.id === oid).status === 'rejected' && r.data.offers.find((o) => o.id === oid).reject_reason === 'Нет фото', 'rejection reason visible to author');
r = await OWN('POST', `/api/market/offers/${oid}/close`);
ok(r.status === 200, 'offer closed');

// Фото и комментарии
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await OWN('POST', '/api/market/offers', { title: 'Рышкановка с фото', need_amount: 10000, photos: [{ mime: 'image/png', data: PNG }, { mime: 'image/png', data: PNG }] });
const pid = r.data.id;
r = await OWN('GET', `/api/market/offers/${pid}`);
ok(r.data.offer.photos.length === 2, 'offer created with 2 photos');
const ph = r.data.offer.photos[0];
let raw = await fetch(`${BASE}/api/market/photos/${ph}/image`);
ok(raw.status === 401, 'photo needs login');
ok((await X('GET', `/api/market/offers/${pid}`)).status === 404, 'pending offer hidden incl. photos');
r = await X('POST', `/api/market/offers/${pid}/comments`, { text: 'вопрос' });
ok(r.status === 404, 'cannot comment pending offer of others');
await ADM('POST', `/api/market/admin/offer/${pid}`, { approve: true });
r = await X('POST', `/api/market/offers/${pid}/comments`, { text: 'Какой этаж?' });
ok(r.status === 200, 'outsider comments approved offer');
r = await OWN('POST', `/api/market/offers/${pid}/comments`, { text: '3 этаж из 9' });
ok(r.status === 200, 'author replies');
r = await INV('GET', `/api/market/offers/${pid}`);
ok(r.data.offer.comments.length === 2 && r.data.offer.comments[1].is_author && !r.data.offer.comments[0].can_delete, 'comments visible, author marked, cannot delete others');
r = await INV('GET', '/api/market');
const card = r.data.offers.find((o) => o.id === pid);
ok(card && card.photos.length === 2 && card.comments === 2, 'list shows photos and comment count');
const cid = (await X('GET', `/api/market/offers/${pid}`)).data.offer.comments[0].id;
ok((await INV('DELETE', `/api/market/comments/${cid}`)).status === 403, 'cannot delete others comment');
ok((await X('DELETE', `/api/market/comments/${cid}`)).status === 200, 'delete own comment');
ok((await INV('POST', `/api/market/offers/${pid}/photos`, { photos: [{ mime: 'image/png', data: PNG }] })).status === 403, 'only author adds photos');
r = await OWN('POST', `/api/market/offers/${pid}/photos`, { photos: [{ mime: 'image/png', data: PNG }] });
ok(r.status === 200 && r.data.added === 1, 'author adds photo');
r = await X('GET', `/api/market/offers/${pid}`);
ok(r.status === 404, 'new photos send offer back to moderation');
ok((await X('DELETE', `/api/market/photos/${ph}`)).status === 403, 'others cannot delete photo');
ok((await OWN('DELETE', `/api/market/photos/${ph}`)).status === 200, 'author deletes photo');
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
