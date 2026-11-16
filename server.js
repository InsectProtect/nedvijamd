const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { computeObject, CATEGORIES } = require('./calc');
const tg = require('./tg');

const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 30 * 1024 * 1024;
const MAX_PHOTO = 8 * 1024 * 1024;
const ROLES = ['investor', 'foreman', 'viewer'];

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Слишком большой запрос'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Некорректный JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function sessionCookie(req, token, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v, max = 200) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));

function positiveAmount(v) {
  const x = Number(v);
  if (!Number.isFinite(x) || x <= 0 || x > 1e10) fail(400, 'Введите сумму больше нуля');
  return Math.round(x * 100) / 100;
}

// ---------- auth ----------

async function currentUser(req) {
  const sid = parseCookies(req).sid || req.headers['x-session'];
  if (!sid) return null;
  const u = await db.one(
    'SELECT u.id, u.email, u.name, u.telegram_id, u.tg_username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1',
    [String(sid)]
  );
  if (u) u.telegram = !!u.telegram_id;
  if (u) delete u.telegram_id;
  return u;
}

// Сессия: cookie + токен в ответе (в Telegram WebView cookie иногда не сохраняются)
async function startSession(req, res, userId) {
  const t = token(32);
  await db.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [t, userId]);
  return { cookie: sessionCookie(req, t, 60 * 60 * 24 * 180), token: t };
}

const appUrl = (hashPath = '/') => `${PUBLIC_URL}/#${hashPath}`;

// Уведомить участников объекта в Telegram (кроме автора действия)
async function notifyObject(objectId, actorId, text, hashPath, onlyUserIds) {
  if (!tg.enabled()) return;
  try {
    const rows = await db.query(
      `SELECT u.id, u.telegram_id FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.object_id = $1 AND u.telegram_id IS NOT NULL`,
      [objectId]
    );
    for (const r of rows) {
      if (Number(r.id) === Number(actorId)) continue;
      if (onlyUserIds && !onlyUserIds.includes(Number(r.id))) continue;
      await tg.send(String(r.telegram_id), text, PUBLIC_URL ? appUrl(hashPath) : null);
    }
  } catch (e) {
    console.warn('notify failed', e.message);
  }
}

async function objectName(objectId) {
  const o = await db.one('SELECT name FROM objects WHERE id = $1', [objectId]);
  return o ? o.name : '';
}

// ---------- object access ----------

async function membership(objectId, userId) {
  const m = await db.one(
    `SELECT m.*, o.creator_id, o.delete_requested_at FROM members m JOIN objects o ON o.id = m.object_id
     WHERE m.object_id = $1 AND m.user_id = $2`,
    [objectId, userId]
  );
  if (!m) fail(404, 'Объект не найден или у вас нет доступа');
  m.isCreator = Number(m.creator_id) === Number(userId);
  return m;
}

async function loadObject(objectId) {
  const object = await db.one(
    `SELECT id, name, area, status, purchase_price, sale_price, repair_budget, installment, installment_monthly, creator_id, delete_requested_at, created_at,
            (photo IS NOT NULL) AS has_photo, photo_v FROM objects WHERE id = $1`,
    [objectId]
  );
  if (!object) fail(404, 'Объект не найден');
  const members = await db.query(
    `SELECT m.user_id, m.role, m.share_pct, m.foreman_mode, m.foreman_value, m.delete_vote, u.name, u.email, u.tg_username
     FROM members m JOIN users u ON u.id = m.user_id WHERE m.object_id = $1 ORDER BY m.joined_at, m.user_id`,
    [objectId]
  );
  const entries = await db.query(
    `SELECT e.id, e.user_id, e.kind, e.source, e.category, e.amount, e.note,
            to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date, u.name AS author,
            (SELECT count(*) FROM receipts r WHERE r.entry_id = e.id) AS receipts,
            (e.delete_requested_at IS NOT NULL) AS delete_pending,
            (SELECT coalesce(string_agg(v.user_id::text, ','), '') FROM entry_delete_votes v WHERE v.entry_id = e.id) AS delete_votes
     FROM entries e JOIN users u ON u.id = e.user_id
     WHERE e.object_id = $1 ORDER BY e.entry_date DESC, e.id DESC`,
    [objectId]
  );
  return { object, members, entries };
}

function memberView(m, calc) {
  return {
    user_id: Number(m.user_id),
    name: m.name,
    email: m.email,
    tg_username: m.tg_username || null,
    role: m.role,
    share_pct: Number(m.share_pct),
    foreman_mode: m.foreman_mode,
    foreman_value: Number(m.foreman_value),
    delete_vote: m.delete_vote === true || m.delete_vote === 't',
    invested: calc.invested[m.user_id] || 0,
    payout: calc.payout[m.user_id] === undefined ? null : calc.payout[m.user_id]
  };
}

const fmtEur = (v) => `${Math.round(Number(v) || 0).toLocaleString('ru-RU').replace(/\s/g, '\u00A0')}\u00A0€`;

async function deleteRecipients(objectId) {
  const rows = await db.query(
    `SELECT u.id, u.telegram_id, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.object_id = $1`,
    [objectId]
  );
  return {
    voters: rows.filter((r) => r.role !== 'viewer').map((r) => Number(r.id)),
    all: rows.filter((r) => r.telegram_id).map((r) => ({ id: Number(r.id), telegram_id: String(r.telegram_id) }))
  };
}

// Удаление: голосуют все участники сделки (инвесторы и прорабы).
async function maybeFinishDelete(objectId) {
  const voters = await db.query(
    `SELECT delete_vote FROM members WHERE object_id = $1 AND role IN ('investor','foreman')`,
    [objectId]
  );
  const allAgree = voters.length > 0 && voters.every((v) => v.delete_vote === true || v.delete_vote === 't');
  if (allAgree) {
    await db.query('DELETE FROM objects WHERE id = $1', [objectId]);
    return true;
  }
  return false;
}

const positiveOrNull = (v) => { const x = num(v); return Number.isFinite(x) && x > 0 ? x : null; };

// Ремонт: потрачено по факту против ориентировочной стоимости
function repairInfo(object, calc) {
  const cat = calc.categories.find((c) => c.category === 'Ремонт');
  const budget = cat ? cat.plan : 0;
  const spent = cat ? cat.fact : 0;
  if (!budget && !spent) return null;
  return { budget, spent, left: Math.round((budget - spent) * 100) / 100, pct: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null };
}

// Рассрочка: выплачено = фактические расходы по статье «Покупка», всего = стоимость покупки
function installmentInfo(object, calc) {
  if (!(object.installment === true || object.installment === 't')) return null;
  const total = Number(object.purchase_price) || 0;
  const cat = calc.categories.find((c) => c.category === 'Покупка');
  const paid = cat ? cat.fact : 0;
  const left = Math.max(0, Math.round((total - paid) * 100) / 100);
  const monthly = Number(object.installment_monthly) || 0;
  return {
    total,
    paid,
    left,
    monthly: monthly || null,
    payments_left: monthly > 0 ? Math.ceil(left / monthly) : null,
    pct: total > 0 ? Math.min(100, Math.round((paid / total) * 1000) / 10) : 0
  };
}

async function saveObjectPhoto(objectId, body) {
  if (body.remove_photo === true) {
    await db.query('UPDATE objects SET photo = NULL, photo_mime = NULL, photo_v = photo_v + 1 WHERE id = $1', [objectId]);
    return;
  }
  const p = body.photo;
  if (!p) return;
  if (!/^image\/(jpeg|png|webp)$/.test(p.mime || '') || typeof p.data !== 'string') fail(400, 'Неподдерживаемый формат фото');
  const buf = Buffer.from(p.data, 'base64');
  if (!buf.length || buf.length > MAX_PHOTO) fail(400, 'Фото слишком большое');
  await db.query(
    `UPDATE objects SET photo = decode($1, 'base64'), photo_mime = $2, photo_v = photo_v + 1 WHERE id = $3`,
    [buf.toString('base64'), p.mime, objectId]
  );
}

async function savePhotos(entryId, userId, photos) {
  if (!Array.isArray(photos)) return;
  for (const p of photos.slice(0, 10)) {
    const mime = /^image\/(jpeg|png|webp|heic|heif)$/.test(p && p.mime) ? p.mime : null;
    if (!mime || typeof p.data !== 'string') fail(400, 'Неподдерживаемый формат фото');
    const buf = Buffer.from(p.data, 'base64');
    if (!buf.length || buf.length > MAX_PHOTO) fail(400, 'Фото слишком большое');
    await db.query(
      `INSERT INTO receipts (entry_id, user_id, mime, data) VALUES ($1, $2, $3, decode($4, 'base64'))`,
      [entryId, userId, mime, buf.toString('base64')]
    );
  }
}

// ---------- routes ----------

const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp(
    '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$'
  );
  routes.push({ method, re, keys, handler, auth: opts.auth !== false });
};

route('POST', '/api/register', async ({ req, body }) => {
  const email = str(body.email, 200).toLowerCase();
  const name = str(body.name, 80);
  const password = String(body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Проверьте email');
  if (!name) fail(400, 'Введите имя');
  if (password.length < 6) fail(400, 'Пароль — минимум 6 символов');
  const exists = await db.one('SELECT id FROM users WHERE email = $1', [email]);
  if (exists) fail(409, 'Такой email уже зарегистрирован');
  const user = await db.one(
    'INSERT INTO users (email, name, pass_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email, name, hashPassword(password)]
  );
  const sess = await startSession(req, null, user.id);
  return { status: 200, data: { user, token: sess.token }, headers: { 'Set-Cookie': sess.cookie } };
}, { auth: false });

route('POST', '/api/login', async ({ req, body }) => {
  const email = str(body.email, 200).toLowerCase();
  const user = await db.one('SELECT id, email, name, pass_hash FROM users WHERE email = $1', [email]);
  if (!user || !checkPassword(String(body.password || ''), user.pass_hash)) fail(401, 'Неверный email или пароль');
  const sess = await startSession(req, null, user.id);
  return { status: 200, data: { user: { id: user.id, email: user.email, name: user.name }, token: sess.token }, headers: { 'Set-Cookie': sess.cookie } };
}, { auth: false });

route('POST', '/api/logout', async ({ req }) => {
  const sid = parseCookies(req).sid;
  if (sid) await db.query('DELETE FROM sessions WHERE token = $1', [sid]);
  return { status: 200, data: { ok: true }, headers: { 'Set-Cookie': sessionCookie(req, '', 0) } };
}, { auth: false });

route('GET', '/api/me', async ({ user }) => ({ user, categories: CATEGORIES, bot: tg.username() || null }));

// Вход из Telegram Mini App: проверяем подпись initData, находим или создаём аккаунт
route('POST', '/api/tg-login', async ({ req, body }) => {
  const v = tg.verifyInitData(String(body.initData || ''));
  if (!v) fail(401, 'Не удалось подтвердить вход через Telegram');
  const tu = v.user;
  const name = [tu.first_name, tu.last_name].filter(Boolean).join(' ').slice(0, 80) || tu.username || 'Без имени';
  let user = await db.one('SELECT id, email, name FROM users WHERE telegram_id = $1', [String(tu.id)]);
  if (!user) {
    user = await db.one(
      'INSERT INTO users (name, telegram_id, tg_username) VALUES ($1, $2, $3) RETURNING id, email, name',
      [name, String(tu.id), tu.username || null]
    );
  } else {
    await db.query('UPDATE users SET tg_username = $1 WHERE id = $2', [tu.username || null, user.id]);
  }
  const sess = await startSession(req, null, user.id);
  return {
    status: 200,
    data: { user: { ...user, telegram: true, tg_username: tu.username || null }, token: sess.token, startParam: v.startParam },
    headers: { 'Set-Cookie': sess.cookie }
  };
}, { auth: false });

// Привязать Telegram к аккаунту, созданному через email
route('POST', '/api/tg-link', async ({ user }) => {
  if (!tg.enabled() || !tg.username()) fail(400, 'Telegram-бот не настроен');
  const t = token(18);
  await db.query(`INSERT INTO tg_links (token, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [t, user.id]);
  return { url: `https://t.me/${tg.username()}?start=link_${t}` };
});

route('GET', '/api/objects', async ({ user }) => {
  const rows = await db.query(
    `SELECT o.id FROM objects o JOIN members m ON m.object_id = o.id WHERE m.user_id = $1 ORDER BY o.created_at DESC`,
    [user.id]
  );
  const list = [];
  let myInvested = 0;
  let myProfit = 0;
  const partners = new Set();
  for (const r of rows) {
    const { object, members, entries } = await loadObject(r.id);
    const calc = computeObject(object, members, entries);
    const me = members.find((m) => Number(m.user_id) === Number(user.id));
    members.forEach((m) => Number(m.user_id) !== Number(user.id) && partners.add(Number(m.user_id)));
    const mine = calc.invested[user.id] || 0;
    const myPayout = calc.payout[user.id];
    myInvested += mine;
    if (typeof myPayout === 'number') myProfit += myPayout;
    list.push({
      id: object.id,
      name: object.name,
      status: object.status,
      area: num(object.area),
      photo: object.has_photo === true || object.has_photo === 't' ? `/api/objects/${object.id}/photo?v=${object.photo_v}` : null,
      installment: installmentInfo(object, calc),
      role: me.role,
      share_pct: Number(me.share_pct),
      foreman_mode: me.foreman_mode,
      foreman_value: Number(me.foreman_value),
      people: members.map((m) => ({ user_id: Number(m.user_id), name: m.name, role: m.role })),
      my_invested: mine,
      my_profit: typeof myPayout === 'number' ? myPayout : null,
      has_forecast: calc.profit !== null,
      delete_requested: !!object.delete_requested_at
    });
  }
  return { objects: list, totals: { invested: myInvested, profit: myProfit, partners: partners.size } };
});

route('POST', '/api/objects', async ({ user, body }) => {
  const name = str(body.name, 120);
  if (!name) fail(400, 'Введите название объекта');
  const area = num(body.area);
  const sale = num(body.sale_price);
  const buy = num(body.purchase_price);
  const monthly = num(body.installment_monthly);
  const obj = await db.one(
    `INSERT INTO objects (name, area, status, purchase_price, sale_price, installment, installment_monthly, repair_budget, creator_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [name, Number.isFinite(area) ? area : null, str(body.status, 40) || 'покупка', Number.isFinite(buy) ? buy : null, Number.isFinite(sale) ? sale : null,
      body.installment === true, Number.isFinite(monthly) && monthly > 0 ? monthly : null, positiveOrNull(body.repair_budget), user.id]
  );
  await saveObjectPhoto(obj.id, body);
  await db.query(
    `INSERT INTO members (object_id, user_id, role, share_pct) VALUES ($1, $2, 'investor', 100)`,
    [obj.id, user.id]
  );
  return { id: obj.id };
});

route('GET', '/api/objects/:id', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  const { object, members, entries } = await loadObject(params.id);
  const calc = computeObject(object, members, entries);
  const names = Object.fromEntries(members.map((m) => [m.user_id, m.name]));
  return {
    object: {
      id: object.id,
      name: object.name,
      area: num(object.area),
      status: object.status,
      purchase_price: num(object.purchase_price),
      sale_price: num(object.sale_price),
      photo: object.has_photo === true || object.has_photo === 't' ? `/api/objects/${object.id}/photo?v=${object.photo_v}` : null,
      installment: installmentInfo(object, calc),
      installment_monthly: num(object.installment_monthly),
      repair_budget: num(object.repair_budget),
      repair: repairInfo(object, calc),
      creator_id: Number(object.creator_id),
      delete_requested: !!object.delete_requested_at
    },
    me: {
      user_id: Number(user.id),
      role: me.role,
      isCreator: me.isCreator,
      canAdd: me.role === 'investor' || me.role === 'foreman',
      canVote: me.role === 'investor' || me.role === 'foreman'
    },
    members: members.map((m) => memberView(m, calc)),
    entries: entries.map((e) => ({
      id: e.id,
      user_id: Number(e.user_id),
      author: e.author,
      kind: e.kind,
      source: e.source,
      category: e.category,
      amount: Number(e.amount),
      note: e.note,
      entry_date: e.entry_date,
      receipts: Number(e.receipts),
      mine: Number(e.user_id) === Number(user.id),
      delete_pending: e.delete_pending === true || e.delete_pending === 't',
      need_my_vote: (e.delete_pending === true || e.delete_pending === 't') && (me.role === 'investor' || me.role === 'foreman') &&
        !String(e.delete_votes || '').split(',').includes(String(user.id))
    })),
    calc: { ...calc, invested: undefined, payout: undefined,
      settlement: calc.settlement.map((s) => ({ ...s, fromName: names[s.from], toName: names[s.to] })) },
    categories: CATEGORIES
  };
});

route('PATCH', '/api/objects/:id', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Менять объект может только создатель');
  const name = str(body.name, 120);
  if (!name) fail(400, 'Введите название объекта');
  const area = num(body.area);
  const sale = num(body.sale_price);
  const buy = num(body.purchase_price);
  const monthly = num(body.installment_monthly);
  await db.query(
    `UPDATE objects SET name = $1, area = $2, status = $3, sale_price = $4, purchase_price = $5, installment = $6, installment_monthly = $7, repair_budget = $8 WHERE id = $9`,
    [name, Number.isFinite(area) ? area : null, str(body.status, 40) || 'покупка', Number.isFinite(sale) ? sale : null, Number.isFinite(buy) ? buy : null,
      body.installment === true, Number.isFinite(monthly) && monthly > 0 ? monthly : null, positiveOrNull(body.repair_budget), params.id]
  );
  await saveObjectPhoto(params.id, body);
  return { ok: true };
});

route('PUT', '/api/objects/:id/shares', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Доли расставляет только создатель объекта');
  const { members } = await loadObject(params.id);
  const input = Array.isArray(body.members) ? body.members : [];
  const byId = Object.fromEntries(input.map((m) => [Number(m.user_id), m]));
  let sum = 0;
  const updates = [];
  for (const m of members) {
    const x = byId[Number(m.user_id)] || {};
    if (m.role === 'investor') {
      const pct = Number(x.share_pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) fail(400, 'Доля инвестора — от 0 до 100 %');
      sum += pct;
      updates.push([m.user_id, pct, 'none', 0]);
    } else if (m.role === 'foreman') {
      const mode = ['pct', 'fix', 'none'].includes(x.foreman_mode) ? x.foreman_mode : 'none';
      const val = Number(x.foreman_value) || 0;
      if (val < 0 || (mode === 'pct' && val > 100)) fail(400, 'Проверьте долю прораба');
      updates.push([m.user_id, 0, mode, mode === 'none' ? 0 : val]);
    }
  }
  if (Math.abs(sum - 100) > 0.01) fail(400, `Доли инвесторов должны давать 100 %, сейчас ${Math.round(sum * 100) / 100} %`);
  for (const [uid, pct, mode, val] of updates) {
    await db.query(
      `UPDATE members SET share_pct = $1, foreman_mode = $2, foreman_value = $3 WHERE object_id = $4 AND user_id = $5`,
      [pct, mode, val, params.id, uid]
    );
  }
  const lines = members.map((m) => {
    const u = updates.find((x) => Number(x[0]) === Number(m.user_id));
    if (!u) return null;
    if (m.role === 'investor') return `• ${tg.escHtml(m.name)} — ${u[1]} %`;
    return `• ${tg.escHtml(m.name)}, прораб — ${u[2] === 'pct' ? `${u[3]} % прибыли` : u[2] === 'fix' ? fmtEur(u[3]) : 'без доли'}`;
  }).filter(Boolean);
  notifyObject(params.id, user.id,
    `🏠 <b>${tg.escHtml(await objectName(params.id))}</b>\n${tg.escHtml(user.name)} изменил доли:\n${lines.join('\n')}`,
    `/o/${params.id}/shares`);
  return { ok: true };
});

route('POST', '/api/objects/:id/invites', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Приглашать может только создатель объекта');
  const role = ROLES.includes(body.role) ? body.role : 'investor';
  const t = token(18);
  await db.query(
    `INSERT INTO invites (token, object_id, role, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
    [t, params.id, role, user.id]
  );
  return { token: t, role, tg_url: tg.username() ? `https://t.me/${tg.username()}?start=join_${t}` : null };
});

route('GET', '/api/invites/:token', async ({ params }) => {
  const inv = await db.one(
    `SELECT i.role, o.name AS object_name, u.name AS inviter FROM invites i
     JOIN objects o ON o.id = i.object_id JOIN users u ON u.id = i.created_by
     WHERE i.token = $1 AND i.expires_at > now()`,
    [params.token]
  );
  if (!inv) fail(404, 'Приглашение не найдено или истекло');
  return inv;
}, { auth: false });

route('POST', '/api/invites/:token/accept', async ({ user, params }) => {
  const inv = await db.one(
    `SELECT object_id, role FROM invites WHERE token = $1 AND expires_at > now()`,
    [params.token]
  );
  if (!inv) fail(404, 'Приглашение не найдено или истекло');
  const exists = await db.one('SELECT 1 AS x FROM members WHERE object_id = $1 AND user_id = $2', [inv.object_id, user.id]);
  if (!exists) {
    await db.query(
      `INSERT INTO members (object_id, user_id, role, share_pct) VALUES ($1, $2, $3, 0)`,
      [inv.object_id, user.id, inv.role]
    );
    // Новый участник сбрасывает незавершённое голосование за удаление
    await db.query(`UPDATE members SET delete_vote = false WHERE object_id = $1`, [inv.object_id]);
    await db.query(`UPDATE objects SET delete_requested_at = NULL WHERE id = $1`, [inv.object_id]);
    const roleName = { investor: 'инвестор', foreman: 'прораб', viewer: 'просмотр' }[inv.role];
    notifyObject(inv.object_id, user.id,
      `🏠 <b>${tg.escHtml(await objectName(inv.object_id))}</b>\n👤 ${tg.escHtml(user.name)} присоединился (${roleName})`,
      `/o/${inv.object_id}/members`);
  }
  return { object_id: inv.object_id };
});

route('PATCH', '/api/objects/:id/members/:uid', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Роли меняет только создатель объекта');
  if (Number(params.uid) === Number(user.id)) fail(400, 'Свою роль создатель изменить не может');
  const role = ROLES.includes(body.role) ? body.role : null;
  if (!role) fail(400, 'Неизвестная роль');
  await db.query(
    `UPDATE members SET role = $1, share_pct = CASE WHEN $1 = 'investor' THEN share_pct ELSE 0 END,
       foreman_mode = CASE WHEN $1 = 'foreman' THEN foreman_mode ELSE 'none' END
     WHERE object_id = $2 AND user_id = $3`,
    [role, params.id, params.uid]
  );
  return { ok: true };
});

route('DELETE', '/api/objects/:id/members/:uid', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Удалять участников может только создатель');
  if (Number(params.uid) === Number(user.id)) fail(400, 'Создатель не может удалить себя');
  const has = await db.one('SELECT count(*) AS c FROM entries WHERE object_id = $1 AND user_id = $2', [params.id, params.uid]);
  if (Number(has.c) > 0) fail(400, 'У участника есть операции — смените ему роль на «Просмотр» вместо удаления');
  await db.query('DELETE FROM members WHERE object_id = $1 AND user_id = $2', [params.id, params.uid]);
  return { ok: true };
});

route('POST', '/api/objects/:id/entries', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (me.role === 'viewer') fail(403, 'Роль «Просмотр» не может добавлять операции');
  const kind = ['in', 'out', 'plan'].includes(body.kind) ? body.kind : fail(400, 'Неизвестный тип операции');
  let category = kind === 'in' ? null : str(body.category, 60) || 'Прочее';
  if (me.role === 'foreman') {
    if (kind === 'in') fail(403, 'Прораб не вносит взносы, только расходы на ремонт');
    category = 'Ремонт';
  }
  const source = body.source === 'pool' && kind === 'out' ? 'pool' : 'own';
  const amount = positiveAmount(body.amount);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.entry_date || '') ? body.entry_date : null;
  // Автор операции — всегда тот, кто вошёл. За другого внести нельзя.
  const entry = await db.one(
    `INSERT INTO entries (object_id, user_id, kind, source, category, amount, note, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, current_date)) RETURNING id`,
    [params.id, user.id, kind, source, category, amount, str(body.note, 300) || null, date]
  );
  if (kind === 'out') await savePhotos(entry.id, user.id, body.photos);
  if (kind !== 'plan') {
    const name = await objectName(params.id);
    const photos = kind === 'out' && Array.isArray(body.photos) ? body.photos.length : 0;
    const what = kind === 'in' ? `внёс взнос <b>${fmtEur(amount)}</b>` : `добавил расход <b>${fmtEur(amount)}</b> · ${tg.escHtml(category)}`;
    const note = str(body.note, 300);
    notifyObject(params.id, user.id,
      `🏠 <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} ${what}${note ? `\n«${tg.escHtml(note)}»` : ''}${photos ? `\n🧾 Чеков: ${photos}` : ''}`,
      `/e/${entry.id}`);
  }
  return { id: entry.id };
});

route('GET', '/api/entries/:id', async ({ user, params }) => {
  const e = await db.one(
    `SELECT e.id, e.object_id, e.user_id, e.kind, e.source, e.category, e.amount, e.note,
            to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date, u.name AS author,
            (e.delete_requested_at IS NOT NULL) AS delete_pending
     FROM entries e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
    [params.id]
  );
  if (!e) fail(404, 'Операция не найдена');
  const me = await membership(e.object_id, user.id);
  const receipts = await db.query(
    `SELECT id, to_char(created_at, 'YYYY-MM-DD') AS created FROM receipts WHERE entry_id = $1 ORDER BY id`,
    [e.id]
  );
  const pending = e.delete_pending === true || e.delete_pending === 't';
  let deletion = null;
  if (pending) {
    const voters = await entryVoters(e.id, e.object_id);
    deletion = {
      votes: voters.map((v) => ({ user_id: Number(v.id), name: v.name, role: v.role, agreed: v.agreed === true || v.agreed === 't' })),
      canVote: me.role === 'investor' || me.role === 'foreman'
    };
  }
  return {
    entry: { ...e, delete_pending: pending, amount: Number(e.amount), user_id: Number(e.user_id), mine: Number(e.user_id) === Number(user.id) },
    receipts,
    deletion
  };
});

// Удаление операции: автор просит, все участники сделки (инвесторы и прорабы) подтверждают.
async function entryVoters(entryId, objectId) {
  return db.query(
    `SELECT u.id, u.name, m.role, EXISTS (SELECT 1 FROM entry_delete_votes v WHERE v.entry_id = $1 AND v.user_id = u.id) AS agreed
     FROM members m JOIN users u ON u.id = m.user_id
     WHERE m.object_id = $2 AND m.role IN ('investor','foreman') ORDER BY m.joined_at, u.id`,
    [entryId, objectId]
  );
}

async function maybeFinishEntryDelete(entryId, objectId) {
  const voters = await entryVoters(entryId, objectId);
  if (voters.length && voters.every((v) => v.agreed === true || v.agreed === 't')) {
    await db.query('DELETE FROM entries WHERE id = $1', [entryId]);
    return true;
  }
  return false;
}

const entryTitle = (e) => `${e.note || e.category || ({ in: 'Взнос', out: 'Расход', plan: 'План' })[e.kind]} · ${fmtEur(e.amount)}`;

route('DELETE', '/api/entries/:id', async ({ user, params }) => {
  const e = await db.one('SELECT id, object_id, user_id, kind, category, note, amount, delete_requested_at FROM entries WHERE id = $1', [params.id]);
  if (!e) fail(404, 'Операция не найдена');
  await membership(e.object_id, user.id);
  if (Number(e.user_id) !== Number(user.id)) fail(403, 'Запросить удаление может только автор операции');
  if (!e.delete_requested_at) {
    await db.query('UPDATE entries SET delete_requested_at = now() WHERE id = $1', [e.id]);
    await db.query('DELETE FROM entry_delete_votes WHERE entry_id = $1', [e.id]);
  }
  await db.query('INSERT INTO entry_delete_votes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.id, user.id]);
  const deleted = await maybeFinishEntryDelete(e.id, e.object_id);
  if (!deleted) {
    const voters = (await entryVoters(e.id, e.object_id)).map((v) => Number(v.id));
    notifyObject(e.object_id, user.id,
      `🗑 <b>${tg.escHtml(await objectName(e.object_id))}</b>\n${tg.escHtml(user.name)} просит удалить операцию «${tg.escHtml(entryTitle(e))}». Она удалится, только если согласятся все участники сделки.`,
      `/e/${e.id}`, voters);
  }
  return { deleted, pending: !deleted };
});

route('POST', '/api/entries/:id/delete-vote', async ({ user, params, body }) => {
  const e = await db.one('SELECT id, object_id, user_id, kind, category, note, amount, delete_requested_at FROM entries WHERE id = $1', [params.id]);
  if (!e) fail(404, 'Операция не найдена');
  const me = await membership(e.object_id, user.id);
  if (!e.delete_requested_at) fail(400, 'Запроса на удаление нет');
  if (me.role === 'viewer') fail(403, 'Роль «Просмотр» не голосует');
  const name = await objectName(e.object_id);
  if (body.agree === true) {
    await db.query('INSERT INTO entry_delete_votes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.id, user.id]);
    const recipients = await entryVoters(e.id, e.object_id);
    const deleted = await maybeFinishEntryDelete(e.id, e.object_id);
    if (deleted) {
      notifyObject(e.object_id, user.id,
        `🗑 <b>${tg.escHtml(name)}</b>\nОперация «${tg.escHtml(entryTitle(e))}» удалена: все участники согласились.`,
        `/o/${e.object_id}`, recipients.map((v) => Number(v.id)));
    }
    return { deleted };
  }
  await db.query('UPDATE entries SET delete_requested_at = NULL WHERE id = $1', [e.id]);
  await db.query('DELETE FROM entry_delete_votes WHERE entry_id = $1', [e.id]);
  notifyObject(e.object_id, user.id,
    `🏠 <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} против удаления операции «${tg.escHtml(entryTitle(e))}» — запрос отменён, операция остаётся.`,
    `/e/${e.id}`);
  return { deleted: false, cancelled: true };
});

route('POST', '/api/entries/:id/delete-cancel', async ({ user, params }) => {
  const e = await db.one('SELECT object_id, user_id FROM entries WHERE id = $1', [params.id]);
  if (!e) fail(404, 'Операция не найдена');
  await membership(e.object_id, user.id);
  if (Number(e.user_id) !== Number(user.id)) fail(403, 'Отозвать запрос может только автор');
  await db.query('UPDATE entries SET delete_requested_at = NULL WHERE id = $1', [params.id]);
  await db.query('DELETE FROM entry_delete_votes WHERE entry_id = $1', [params.id]);
  return { ok: true };
});

route('POST', '/api/entries/:id/receipts', async ({ user, params, body }) => {
  const e = await db.one('SELECT object_id, user_id, kind FROM entries WHERE id = $1', [params.id]);
  if (!e) fail(404, 'Операция не найдена');
  await membership(e.object_id, user.id);
  if (Number(e.user_id) !== Number(user.id)) fail(403, 'Чеки можно добавлять только к своим операциям');
  if (e.kind !== 'out') fail(400, 'Чеки прикладываются к фактическим расходам');
  await savePhotos(params.id, user.id, body.photos);
  return { ok: true };
});

route('DELETE', '/api/receipts/:id', async ({ user, params }) => {
  const r = await db.one(
    `SELECT r.user_id, e.object_id FROM receipts r JOIN entries e ON e.id = r.entry_id WHERE r.id = $1`,
    [params.id]
  );
  if (!r) fail(404, 'Чек не найден');
  await membership(r.object_id, user.id);
  if (Number(r.user_id) !== Number(user.id)) fail(403, 'Удалять можно только свои чеки');
  await db.query('DELETE FROM receipts WHERE id = $1', [params.id]);
  return { ok: true };
});

route('POST', '/api/objects/:id/delete-request', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Запросить удаление может только создатель');
  await db.query(`UPDATE objects SET delete_requested_at = now() WHERE id = $1`, [params.id]);
  await db.query(`UPDATE members SET delete_vote = (user_id = $2) WHERE object_id = $1`, [params.id, user.id]);
  const name = await objectName(params.id);
  const recipients = await deleteRecipients(params.id);
  const deleted = await maybeFinishDelete(params.id);
  if (!deleted) {
    notifyObject(params.id, user.id,
      `⚠️ <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} запросил удаление объекта. Объект удалится, только если согласятся все участники сделки.`,
      `/o/${params.id}/delete`, recipients.voters);
  }
  return { deleted };
});

route('POST', '/api/objects/:id/delete-vote', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (!me.delete_requested_at) fail(400, 'Запроса на удаление нет');
  if (me.role === 'viewer') fail(403, 'Роль «Просмотр» не голосует');
  if (body.agree === true) {
    await db.query(`UPDATE members SET delete_vote = true WHERE object_id = $1 AND user_id = $2`, [params.id, user.id]);
    const name = await objectName(params.id);
    const recipients = await deleteRecipients(params.id);
    const deleted = await maybeFinishDelete(params.id);
    if (deleted) {
      for (const r of recipients.all) {
        if (r.id !== Number(user.id)) tg.send(r.telegram_id, `🗑 Объект <b>${tg.escHtml(name)}</b> удалён: все участники согласились.`, null);
      }
    }
    return { deleted };
  }
  notifyObject(params.id, user.id,
    `🏠 <b>${tg.escHtml(await objectName(params.id))}</b>\n${tg.escHtml(user.name)} против удаления — запрос отменён.`,
    `/o/${params.id}`);
  // Любой отказ отменяет запрос целиком
  await db.query(`UPDATE objects SET delete_requested_at = NULL WHERE id = $1`, [params.id]);
  await db.query(`UPDATE members SET delete_vote = false WHERE object_id = $1`, [params.id]);
  return { deleted: false, cancelled: true };
});

route('POST', '/api/objects/:id/delete-cancel', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Отозвать запрос может только создатель');
  await db.query(`UPDATE objects SET delete_requested_at = NULL WHERE id = $1`, [params.id]);
  await db.query(`UPDATE members SET delete_vote = false WHERE object_id = $1`, [params.id]);
  return { ok: true };
});

// ---------- non-JSON routes ----------

async function serveReceipt(req, res, id) {
  const user = await currentUser(req);
  if (!user) fail(401, 'Нужно войти');
  const r = await db.one(
    `SELECT r.mime, encode(r.data, 'base64') AS b64, e.object_id FROM receipts r JOIN entries e ON e.id = r.entry_id WHERE r.id = $1`,
    [id]
  );
  if (!r) fail(404, 'Чек не найден');
  await membership(r.object_id, user.id);
  const buf = Buffer.from(r.b64, 'base64');
  res.writeHead(200, { 'Content-Type': r.mime, 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=86400' });
  res.end(buf);
}

async function serveObjectPhoto(req, res, id) {
  const user = await currentUser(req);
  if (!user) fail(401, 'Нужно войти');
  await membership(id, user.id);
  const r = await db.one(`SELECT photo_mime, encode(photo, 'base64') AS b64 FROM objects WHERE id = $1 AND photo IS NOT NULL`, [id]);
  if (!r) fail(404, 'Фото нет');
  const buf = Buffer.from(r.b64, 'base64');
  res.writeHead(200, { 'Content-Type': r.photo_mime, 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=604800' });
  res.end(buf);
}

async function serveExport(req, res, id) {
  const user = await currentUser(req);
  if (!user) fail(401, 'Нужно войти');
  await membership(id, user.id);
  const { object, entries } = await loadObject(id);
  const kinds = { in: 'Взнос', out: 'Расход (факт)', plan: 'План' };
  const esc = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  const lines = [['Дата', 'Тип', 'Категория', 'Сумма, €', 'Кто', 'Из чьих денег', 'Комментарий', 'Чеков'].map(esc).join(';')];
  for (const e of entries) {
    lines.push([e.entry_date, kinds[e.kind], e.category || '', String(e.amount).replace('.', ','), e.author,
      e.kind === 'out' ? (e.source === 'pool' ? 'общие' : 'свои') : '', e.note || '', e.receipts].map(esc).join(';'));
  }
  const body = '﻿' + lines.join('\r\n');
  const fname = encodeURIComponent(`${object.name}.csv`);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename*=UTF-8''${fname}`
  });
  res.end(body);
}

// ---------- Telegram-бот ----------

async function handleWebhook(req, res) {
  if (!tg.enabled() || req.headers['x-telegram-bot-api-secret-token'] !== tg.webhookSecret()) {
    res.writeHead(403);
    return res.end();
  }
  const update = await readBody(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{}');
  const msg = update.message;
  if (!msg || !msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return;
  const chatId = String(msg.chat.id);
  const from = msg.from || {};
  const [cmd, param = ''] = msg.text.trim().split(/\s+/);
  if (cmd !== '/start') {
    return tg.send(chatId, 'Откройте «Долю» кнопкой ниже.', PUBLIC_URL ? appUrl('/') : null, 'Открыть Долю');
  }
  try {
    if (param.startsWith('link_')) {
      const link = await db.one(`SELECT user_id FROM tg_links WHERE token = $1 AND expires_at > now()`, [param.slice(5)]);
      if (!link) return tg.send(chatId, 'Ссылка для привязки устарела. Создайте новую в профиле.', null);
      const taken = await db.one('SELECT id FROM users WHERE telegram_id = $1', [String(from.id)]);
      if (taken && Number(taken.id) !== Number(link.user_id)) {
        return tg.send(chatId, 'Этот Telegram уже привязан к другому аккаунту Доли.', null);
      }
      await db.query('UPDATE users SET telegram_id = $1, tg_username = $2 WHERE id = $3', [String(from.id), from.username || null, link.user_id]);
      await db.query('DELETE FROM tg_links WHERE token = $1', [param.slice(5)]);
      return tg.send(chatId, '✅ Telegram привязан. Теперь вы будете получать уведомления и можете входить в Долю прямо отсюда.', PUBLIC_URL ? appUrl('/') : null, 'Открыть Долю');
    }
    if (param.startsWith('join_')) {
      const t = param.slice(5);
      const inv = await db.one(
        `SELECT i.role, o.name AS object_name, u.name AS inviter FROM invites i
         JOIN objects o ON o.id = i.object_id JOIN users u ON u.id = i.created_by
         WHERE i.token = $1 AND i.expires_at > now()`,
        [t]
      );
      if (!inv) return tg.send(chatId, 'Приглашение не найдено или истекло. Попросите новую ссылку.', null);
      const roleName = { investor: 'инвестор', foreman: 'прораб', viewer: 'просмотр' }[inv.role];
      return tg.send(chatId,
        `${tg.escHtml(inv.inviter)} приглашает вас в объект <b>${tg.escHtml(inv.object_name)}</b> с ролью «${roleName}».`,
        PUBLIC_URL ? appUrl(`/join/${t}`) : null, 'Присоединиться');
    }
    return tg.send(chatId,
      '<b>Доля</b> — учёт совместных вложений в недвижимость: кто сколько вложил, план и факт расходов, чеки, доли и прогноз прибыли.\n\nСюда будут приходить уведомления по вашим объектам.',
      PUBLIC_URL ? appUrl('/') : null, 'Открыть Долю');
  } catch (e) {
    console.warn('webhook error', e.message);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) file = path.join(PUBLIC_DIR, 'index.html');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) file = path.join(PUBLIC_DIR, 'index.html');
    const ext = path.extname(file);
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(500);
        return res.end('error');
      }
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
      });
      res.end(data);
    });
  });
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  try {
    if (pathname === '/healthz') return send(res, 200, { ok: true });
    let m;
    if (req.method === 'POST' && pathname === '/tg/webhook') return await handleWebhook(req, res);
    if (req.method === 'GET' && (m = pathname.match(/^\/api\/receipts\/(\d+)\/image$/))) return await serveReceipt(req, res, m[1]);
    if (req.method === 'GET' && (m = pathname.match(/^\/api\/objects\/(\d+)\/export\.csv$/))) return await serveExport(req, res, m[1]);
    if (req.method === 'GET' && (m = pathname.match(/^\/api\/objects\/(\d+)\/photo$/))) return await serveObjectPhoto(req, res, m[1]);
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const match = pathname.match(r.re);
      if (!match) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(match[i + 1])));
      if (params.id && !/^\d+$/.test(params.id) && r.keys.includes('id')) fail(404, 'Не найдено');
      const user = await currentUser(req);
      if (r.auth && !user) fail(401, 'Нужно войти');
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const out = await r.handler({ req, res, user, params, body });
      if (out && out.status && out.data) return send(res, out.status, out.data, out.headers);
      return send(res, 200, out || { ok: true });
    }
    fail(404, 'Не найдено');
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: 'Ошибка сервера, попробуйте ещё раз' });
  }
});

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
  // Чистим старые сессии
  await db.query(`DELETE FROM sessions WHERE created_at < now() - interval '180 days'`);
  server.listen(PORT, () => {
    console.log(`Доля запущена на порту ${PORT}`);
    tg.setup(PUBLIC_URL).catch((e) => console.warn('telegram setup', e.message));
  });
}

main().catch((e) => {
  console.error('Не удалось запустить:', e);
  process.exit(1);
});
