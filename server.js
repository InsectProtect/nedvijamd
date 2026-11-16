const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { computeObject, CATEGORIES } = require('./calc');
const tg = require('./tg');
const { buildContract, makeSnapshot, termsHash } = require('./contract');
const { buildAdvanceContract } = require('./advance_contract');
const { buildReport } = require('./report');

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
    'SELECT u.id, u.email, u.name, u.telegram_id, u.tg_username, u.lang, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1',
    [String(sid)]
  );
  if (u) { u.telegram = !!u.telegram_id; u.needs_name = needsName(u.name); u.is_admin = u.is_admin === true || u.is_admin === 't'; }
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

const L = (ru, ro) => ({ ru, ro });
const ROLE_L = { investor: L('инвестор', 'investitor'), foreman: L('прораб', 'diriginte de șantier'), viewer: L('просмотр', 'vizualizare') };
const CAT_RO = { 'Покупка': 'Cumpărare', 'Ремонт': 'Reparație', 'Мебель и техника': 'Mobilă și tehnică', 'Нотариус и регистрация': 'Notar și înregistrare', 'Налоги': 'Impozite', 'Риелтор': 'Agent imobiliar', 'Содержание': 'Întreținere', 'Прочее': 'Altele' };
const catL = (c) => L(c, CAT_RO[c] || c);
const pickLang = (v, lang) => (v && typeof v === 'object' ? v[lang === 'ro' ? 'ro' : 'ru'] : v);
const fullName = (first, last) => `${str(first, 40)} ${str(last, 40)}`.trim();
const needsName = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).length < 2;


// Уведомить участников объекта в Telegram (кроме автора действия)
async function notifyObject(objectId, actorId, text, hashPath, onlyUserIds) {
  if (!tg.enabled()) return;
  try {
    const rows = await db.query(
      `SELECT u.id, u.telegram_id, u.lang FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.object_id = $1 AND u.telegram_id IS NOT NULL`,
      [objectId]
    );
    for (const r of rows) {
      if (Number(r.id) === Number(actorId)) continue;
      if (onlyUserIds && !onlyUserIds.includes(Number(r.id))) continue;
      const lang = r.lang === 'ro' ? 'ro' : 'ru';
      const body = typeof text === 'function' ? text(lang) : pickLang(text, lang);
      await tg.send(String(r.telegram_id), body, PUBLIC_URL ? appUrl(hashPath) : null, lang === 'ro' ? 'Deschide în Dolya' : 'Открыть в Доле');
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
            sold_price, to_char(sold_at, 'YYYY-MM-DD') AS sold_at, sold_receiver_id,
            (photo IS NOT NULL) AS has_photo, photo_v, contract_fields FROM objects WHERE id = $1`,
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
            (SELECT coalesce(string_agg(v.user_id::text, ','), '') FROM entry_delete_votes v WHERE v.entry_id = e.id) AS delete_votes,
            (e.edit_requested_at IS NOT NULL) AS edit_pending,
            (SELECT coalesce(string_agg(v.user_id::text, ','), '') FROM entry_edit_votes v WHERE v.entry_id = e.id) AS edit_votes,
            e.orig_amount, e.orig_currency, e.rate
     FROM entries e JOIN users u ON u.id = e.user_id
     WHERE e.object_id = $1 ORDER BY e.entry_date DESC, e.id DESC`,
    [objectId]
  );
  const advances = await db.query(
    `SELECT a.id, a.user_id, u.name AS author, a.buyer, a.amount, to_char(a.received_date, 'YYYY-MM-DD') AS received_date,
            to_char(a.valid_until, 'YYYY-MM-DD') AS valid_until, a.status, a.note, (a.valid_until - current_date) AS days_left
     FROM advances a JOIN users u ON u.id = a.user_id WHERE a.object_id = $1 ORDER BY a.id DESC`,
    [objectId]
  );
  return { object, members, entries, advances };
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
    `SELECT u.id, u.telegram_id, u.lang, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.object_id = $1`,
    [objectId]
  );
  return {
    voters: rows.filter((r) => r.role !== 'viewer').map((r) => Number(r.id)),
    all: rows.filter((r) => r.telegram_id).map((r) => ({ id: Number(r.id), telegram_id: String(r.telegram_id), lang: r.lang }))
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

// ---------- курс лея (НБМ) ----------
const rateCache = new Map();
function parseBnmEur(xml) {
  const m = String(xml).match(/<CharCode>\s*EUR\s*<\/CharCode>[\s\S]*?<Nominal>\s*([\d.,]+)\s*<\/Nominal>[\s\S]*?<Value>\s*([\d.,]+)\s*<\/Value>/);
  if (!m) return null;
  const nominal = Number(m[1].replace(',', '.')) || 1;
  const value = Number(m[2].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round((value / nominal) * 10000) / 10000 : null;
}
async function eurRate(dateIso) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateIso || '') ? dateIso : new Date().toISOString().slice(0, 10);
  if (rateCache.has(d)) return rateCache.get(d);
  const [y, m, dd] = d.split('-');
  try {
    const r = await fetch(`https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=${dd}.${m}.${y}`, { signal: AbortSignal.timeout(8000) });
    const rate = parseBnmEur(await r.text());
    if (rate) rateCache.set(d, rate);
    return rate;
  } catch (e) {
    console.warn('BNM rate failed', e.message);
    return null;
  }
}

// Сумма из формы: в евро или в леях с переводом по курсу
async function amountFromBody(body) {
  if (body.currency === 'MDL') {
    const orig = positiveAmount(body.orig_amount !== undefined ? body.orig_amount : body.amount);
    let rate = Number(String(body.rate || '').replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0) rate = await eurRate(body.entry_date);
    if (!rate || rate < 5 || rate > 50) fail(400, 'Не удалось получить курс лея — укажите курс вручную');
    return { amount: Math.round((orig / rate) * 100) / 100, orig_amount: orig, orig_currency: 'MDL', rate };
  }
  return { amount: positiveAmount(body.amount), orig_amount: null, orig_currency: null, rate: null };
}


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
  const name = body.first_name !== undefined ? fullName(body.first_name, body.last_name) : str(body.name, 80);
  const password = String(body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Проверьте email');
  if (needsName(name)) fail(400, 'Введите имя и фамилию');
  if (password.length < 6) fail(400, 'Пароль — минимум 6 символов');
  const exists = await db.one('SELECT id FROM users WHERE email = $1', [email]);
  if (exists) fail(409, 'Такой email уже зарегистрирован');
  const user = await db.one(
    'INSERT INTO users (email, name, pass_hash, lang) VALUES ($1, $2, $3, $4) RETURNING id, email, name, lang',
    [email, name, hashPassword(password), body.lang === 'ro' ? 'ro' : 'ru']
  );
  const sess = await startSession(req, null, user.id);
  return { status: 200, data: { user, token: sess.token }, headers: { 'Set-Cookie': sess.cookie } };
}, { auth: false });

route('POST', '/api/login', async ({ req, body }) => {
  const email = str(body.email, 200).toLowerCase();
  const user = await db.one('SELECT id, email, name, pass_hash, lang FROM users WHERE email = $1', [email]);
  if (!user || !checkPassword(String(body.password || ''), user.pass_hash)) fail(401, 'Неверный email или пароль');
  const sess = await startSession(req, null, user.id);
  return { status: 200, data: { user: { id: user.id, email: user.email, name: user.name, lang: user.lang, needs_name: needsName(user.name) }, token: sess.token }, headers: { 'Set-Cookie': sess.cookie } };
}, { auth: false });

route('POST', '/api/logout', async ({ req }) => {
  const sid = parseCookies(req).sid;
  if (sid) await db.query('DELETE FROM sessions WHERE token = $1', [sid]);
  return { status: 200, data: { ok: true }, headers: { 'Set-Cookie': sessionCookie(req, '', 0) } };
}, { auth: false });

// Настройки приложения (переключает администратор)
async function getSetting(key, def) {
  const r = await db.one('SELECT value FROM app_settings WHERE key = $1', [key]);
  if (!r) return def;
  return typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
}
const personalDataOn = () => getSetting('personal_data', false);
const ADMIN_TG = String(process.env.ADMIN_TG_USERNAMES || '').split(',').map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);

async function myProfile(userId) {
  const u = await db.one(
    `SELECT id, email, name, tg_username, lang, telegram_id, is_admin, idnp, address, phone, to_char(birth_date, 'YYYY-MM-DD') AS birth_date FROM users WHERE id = $1`,
    [userId]
  );
  return {
    id: u.id, email: u.email, name: u.name, tg_username: u.tg_username, lang: u.lang, telegram: !!u.telegram_id,
    needs_name: needsName(u.name), is_admin: u.is_admin === true || u.is_admin === 't',
    idnp: u.idnp || '', address: u.address || '', phone: u.phone || '', birth_date: u.birth_date || ''
  };
}

route('GET', '/api/me', async ({ user }) => ({
  user: await myProfile(user.id), categories: CATEGORIES, bot: tg.username() || null,
  settings: { personal_data: await personalDataOn() }
}));

route('PUT', '/api/admin/settings', async ({ user, body }) => {
  if (!user.is_admin) fail(403, 'Только для администратора приложения');
  if (typeof body.personal_data === 'boolean') {
    await db.query(
      `INSERT INTO app_settings (key, value) VALUES ('personal_data', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(body.personal_data)]
    );
  }
  return { settings: { personal_data: await personalDataOn() } };
});

route('GET', '/api/rate', async ({ req }) => {
  const date = new URL(req.url, 'http://x').searchParams.get('date');
  const rate = await eurRate(date);
  if (!rate) fail(503, 'Курс НБМ сейчас недоступен — укажите курс вручную');
  return { rate, date: date || new Date().toISOString().slice(0, 10), source: 'BNM' };
});

// Имя, фамилия и язык
route('PATCH', '/api/me', async ({ user, body }) => {
  if (body.first_name !== undefined || body.last_name !== undefined) {
    const name = fullName(body.first_name, body.last_name);
    if (needsName(name)) fail(400, 'Введите имя и фамилию');
    await db.query('UPDATE users SET name = $1 WHERE id = $2', [name, user.id]);
  }
  if (body.lang === 'ru' || body.lang === 'ro') await db.query('UPDATE users SET lang = $1 WHERE id = $2', [body.lang, user.id]);
  const personal = ['idnp', 'address', 'phone', 'birth_date'].some((k) => body[k] !== undefined);
  if (personal && !(await personalDataOn())) fail(403, 'Ввод личных данных сейчас выключен');
  if (body.idnp !== undefined) {
    const idnp = String(body.idnp || '').replace(/\s/g, '');
    if (idnp && !/^\d{13}$/.test(idnp)) fail(400, 'IDNP — 13 цифр');
    await db.query('UPDATE users SET idnp = $1 WHERE id = $2', [idnp || null, user.id]);
  }
  if (body.address !== undefined) await db.query('UPDATE users SET address = $1 WHERE id = $2', [str(body.address, 300) || null, user.id]);
  if (body.phone !== undefined) {
    const phone = str(body.phone, 30);
    if (phone && !/^\+?[\d\s()-]{6,20}$/.test(phone)) fail(400, 'Проверьте номер телефона');
    await db.query('UPDATE users SET phone = $1 WHERE id = $2', [phone || null, user.id]);
  }
  if (body.birth_date !== undefined) {
    const bd = /^\d{4}-\d{2}-\d{2}$/.test(body.birth_date || '') ? body.birth_date : null;
    await db.query('UPDATE users SET birth_date = $1::date WHERE id = $2', [bd, user.id]);
  }
  return { user: await myProfile(user.id) };
});

// Вход из Telegram Mini App: проверяем подпись initData, находим или создаём аккаунт
route('POST', '/api/tg-login', async ({ req, body }) => {
  const v = tg.verifyInitData(String(body.initData || ''));
  if (!v) fail(401, 'Не удалось подтвердить вход через Telegram');
  const tu = v.user;
  const name = [tu.first_name, tu.last_name].filter(Boolean).join(' ').slice(0, 80) || tu.username || 'Без имени';
  let user = await db.one('SELECT id, email, name, lang FROM users WHERE telegram_id = $1', [String(tu.id)]);
  if (!user) {
    user = await db.one(
      'INSERT INTO users (name, telegram_id, tg_username, lang) VALUES ($1, $2, $3, $4) RETURNING id, email, name, lang',
      [name, String(tu.id), tu.username || null, String(tu.language_code || '').startsWith('ro') ? 'ro' : 'ru']
    );
  } else {
    await db.query('UPDATE users SET tg_username = $1 WHERE id = $2', [tu.username || null, user.id]);
  }
  if (tu.username && ADMIN_TG.includes(String(tu.username).toLowerCase())) {
    await db.query('UPDATE users SET is_admin = true WHERE id = $1', [user.id]);
  }
  const sess = await startSession(req, null, user.id);
  return {
    status: 200,
    data: { user: { ...user, telegram: true, tg_username: tu.username || null, needs_name: needsName(user.name) }, token: sess.token, startParam: v.startParam },
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
    const { object, members, entries, advances } = await loadObject(r.id);
    const calc = computeObject(object, members, entries, advances);
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
      advance: (() => { const act = advances.find((x) => x.status === 'active'); return act ? { amount: Number(act.amount), valid_until: act.valid_until, days_left: Number(act.days_left) } : null; })(),
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
  const { object, members, entries, advances } = await loadObject(params.id);
  const calc = computeObject(object, members, entries, advances);
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
      contract: await contractStatus(object.id),
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
        !String(e.delete_votes || '').split(',').includes(String(user.id)),
      edit_pending: e.edit_pending === true || e.edit_pending === 't',
      need_my_edit_vote: (e.edit_pending === true || e.edit_pending === 't') && (me.role === 'investor' || me.role === 'foreman') &&
        !String(e.edit_votes || '').split(',').includes(String(user.id)),
      orig_amount: e.orig_amount === null || e.orig_amount === undefined ? null : Number(e.orig_amount),
      orig_currency: e.orig_currency || null
    })),
    calc: { ...calc, invested: undefined, payout: undefined,
      settlement: calc.settlement.map((s) => ({ ...s, fromName: names[s.from], toName: names[s.to] })) },
    advances: advances.map(advanceView(user, me)),
    deal: await dealView(object, calc, names, user),
    categories: CATEGORIES
  };
});

// ---------- отчёт по объекту ----------
async function reportHtml(objectId, lang, printable) {
  const { object, members, entries, advances } = await loadObject(objectId);
  const calc = computeObject(object, members, entries, advances);
  const names = Object.fromEntries(members.map((m) => [m.user_id, m.name]));
  calc.settlement = calc.settlement.map((s) => ({ ...s, fromName: names[s.from], toName: names[s.to] }));
  return buildReport({
    object, members: members.map((m) => memberView(m, calc)), entries, advances, calc,
    installment: installmentInfo(object, calc), deal: await dealView(object, calc, names, { id: 0 }), lang, printable
  });
}

route('GET', '/api/objects/:id/report', async ({ req, user, params }) => {
  await membership(params.id, user.id);
  const lang = new URL(req.url, 'http://x').searchParams.get('lang') === 'ro' ? 'ro' : 'ru';
  return { html: await reportHtml(params.id, lang, false) };
});

route('POST', '/api/objects/:id/report-link', async ({ user, params, body }) => {
  await membership(params.id, user.id);
  const t = token(24);
  await db.query(`INSERT INTO report_links (token, object_id, lang, expires_at) VALUES ($1, $2, $3, now() + interval '7 days')`, [t, params.id, body.lang === 'ro' ? 'ro' : 'ru']);
  return { url: `${PUBLIC_URL}/r/${t}` };
});

// ---------- закрытие сделки ----------
async function dealView(object, calc, names, user) {
  if (!calc.closed) return null;
  const stored = await db.query('SELECT from_user, to_user, amount, paid_at FROM deal_payouts WHERE object_id = $1', [object.id]);
  const key = (f, t) => `${f}-${t}`;
  const storedMap = Object.fromEntries(stored.map((r) => [key(Number(r.from_user), Number(r.to_user)), r]));
  const computed = calc.closing ? calc.closing.transfers : [];
  const same = computed.length === stored.length && computed.every((t) => {
    const s = storedMap[key(t.from, t.to)];
    return s && Math.abs(Number(s.amount) - t.amount) < 1;
  });
  return {
    sold_price: Number(object.sold_price),
    sold_at: object.sold_at,
    receiver_id: object.sold_receiver_id === null ? null : Number(object.sold_receiver_id),
    receiver_name: names[object.sold_receiver_id] || null,
    rows: (calc.closing ? calc.closing.rows : []).map((r) => ({ ...r, name: names[r.user_id] })),
    transfers: stored.map((r) => ({
      from: Number(r.from_user), to: Number(r.to_user), amount: Number(r.amount), paid_at: r.paid_at,
      fromName: names[r.from_user], toName: names[r.to_user],
      can_mark: Number(r.from_user) === Number(user.id) || Number(r.to_user) === Number(user.id)
    })),
    outdated: !same
  };
}

async function storePayouts(objectId) {
  const { object, members, entries, advances } = await loadObject(objectId);
  const calc = computeObject(object, members, entries, advances);
  await db.query('DELETE FROM deal_payouts WHERE object_id = $1', [objectId]);
  for (const t of (calc.closing ? calc.closing.transfers : [])) {
    await db.query('INSERT INTO deal_payouts (object_id, from_user, to_user, amount) VALUES ($1, $2, $3, $4)', [objectId, t.from, t.to, t.amount]);
  }
  return calc;
}

route('POST', '/api/objects/:id/close', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Закрыть сделку может только создатель объекта');
  const price = positiveAmount(body.sold_price);
  const receiver = Number(body.receiver_id);
  const rm = await db.one(`SELECT role FROM members WHERE object_id = $1 AND user_id = $2`, [params.id, receiver]);
  if (!rm || rm.role === 'viewer') fail(400, 'Укажите участника, который получил деньги от покупателя');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.sold_at || '') ? body.sold_at : null;
  await db.query(
    `UPDATE objects SET sold_price = $1, sold_at = COALESCE($2::date, current_date), sold_receiver_id = $3, status = 'продана' WHERE id = $4`,
    [price, date, receiver, params.id]
  );
  const calc = await storePayouts(params.id);
  const oname = tg.escHtml(await objectName(params.id));
  notifyObject(params.id, user.id, (lang) => lang === 'ro'
    ? `🏁 <b>${oname}</b>\nTranzacția a fost închisă: vândut cu <b>${fmtEur(price)}</b>, profit ${fmtEur(calc.profit)}. Vedeți cine cui plătește în aplicație.`
    : `🏁 <b>${oname}</b>\nСделка закрыта: продано за <b>${fmtEur(price)}</b>, прибыль ${fmtEur(calc.profit)}. Кто кому сколько платит — в приложении.`,
    `/o/${params.id}/deal`);
  return { ok: true };
});

route('POST', '/api/objects/:id/recalc', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Пересчитать может только создатель объекта');
  await storePayouts(params.id);
  return { ok: true };
});

route('POST', '/api/objects/:id/reopen', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Вернуть сделку может только создатель объекта');
  await db.query(`UPDATE objects SET sold_price = NULL, sold_at = NULL, sold_receiver_id = NULL, status = 'продаётся' WHERE id = $1`, [params.id]);
  await db.query('DELETE FROM deal_payouts WHERE object_id = $1', [params.id]);
  return { ok: true };
});

route('POST', '/api/objects/:id/payouts/mark', async ({ user, params, body }) => {
  await membership(params.id, user.id);
  const from = Number(body.from), to = Number(body.to);
  if (Number(user.id) !== from && Number(user.id) !== to) fail(403, 'Отметить выплату может тот, кто платит, или тот, кто получает');
  const r = await db.one('SELECT amount FROM deal_payouts WHERE object_id = $1 AND from_user = $2 AND to_user = $3', [params.id, from, to]);
  if (!r) fail(404, 'Выплата не найдена');
  await db.query(
    `UPDATE deal_payouts SET paid_at = CASE WHEN $1 THEN now() ELSE NULL END, marked_by = $2 WHERE object_id = $3 AND from_user = $4 AND to_user = $5`,
    [body.paid === true, user.id, params.id, from, to]
  );
  if (body.paid === true) {
    const oname = tg.escHtml(await objectName(params.id));
    const names = Object.fromEntries((await db.query('SELECT id, name FROM users WHERE id = ANY($1::int[])', [`{${from},${to}}`])).map((u) => [Number(u.id), u.name]));
    notifyObject(params.id, user.id, (lang) => lang === 'ro'
      ? `💸 <b>${oname}</b>\n${tg.escHtml(names[from])} → ${tg.escHtml(names[to])}: ${fmtEur(r.amount)} — achitat.`
      : `💸 <b>${oname}</b>\n${tg.escHtml(names[from])} → ${tg.escHtml(names[to])}: ${fmtEur(r.amount)} — выплачено.`,
      `/o/${params.id}/deal`, [from, to]);
  }
  return { ok: true };
});

const advanceView = (user, me) => (a) => ({
  id: Number(a.id), user_id: Number(a.user_id), author: a.author, buyer: a.buyer, amount: Number(a.amount),
  received_date: a.received_date, valid_until: a.valid_until, status: a.status, note: a.note,
  days_left: Number(a.days_left),
  can_close: a.status === 'active' && (Number(a.user_id) === Number(user.id) || me.isCreator)
});

// Аванс от покупателя: вносит тот, кто получил деньги
route('POST', '/api/objects/:id/advances', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (me.role !== 'investor') fail(403, 'Аванс вносит инвестор, который его получил');
  const amount = positiveAmount(body.amount);
  const until = /^\d{4}-\d{2}-\d{2}$/.test(body.valid_until || '') ? body.valid_until : fail(400, 'Укажите, до какого числа действует аванс');
  const received = /^\d{4}-\d{2}-\d{2}$/.test(body.received_date || '') ? body.received_date : null;
  const sp = num(body.sale_price);
  const a = await db.one(
    `INSERT INTO advances (object_id, user_id, buyer, amount, received_date, valid_until, note, buyer_idnp, buyer_address, buyer_phone, sale_price, return_mode, city)
     VALUES ($1, $2, $3, $4, COALESCE($5::date, current_date), $6::date, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [params.id, user.id, str(body.buyer, 120) || null, amount, received, until, str(body.note, 300) || null,
      str(body.buyer_idnp, 20) || null, str(body.buyer_address, 300) || null, str(body.buyer_phone, 30) || null,
      Number.isFinite(sp) && sp > 0 ? sp : null, body.return_mode === 'single' ? 'single' : 'double', str(body.city, 80) || null]
  );
  const oname = tg.escHtml(await objectName(params.id));
  const [y, m, d] = until.split('-');
  notifyObject(params.id, user.id, (lang) => lang === 'ro'
    ? `💶 <b>${oname}</b>\n${tg.escHtml(user.name)} a primit un avans de la cumpărător: <b>${fmtEur(amount)}</b>, valabil până la ${d}.${m}.${y}.`
    : `💶 <b>${oname}</b>\n${tg.escHtml(user.name)} получил аванс от покупателя: <b>${fmtEur(amount)}</b>, действует до ${d}.${m}.${y}.`,
    `/o/${params.id}`);
  return { id: a.id };
});

// ---------- договор аванса с покупателем ----------

async function loadAdvance(id, user) {
  const a = await db.one(
    `SELECT a.*, to_char(a.received_date, 'YYYY-MM-DD') AS received_date, to_char(a.valid_until, 'YYYY-MM-DD') AS valid_until
     FROM advances a WHERE a.id = $1`,
    [id]
  );
  if (!a) fail(404, 'Аванс не найден');
  const me = await membership(a.object_id, user.id);
  return { a, me, canEdit: Number(a.user_id) === Number(user.id) || me.isCreator };
}

async function advanceHtml(a, printable) {
  const o = await db.one('SELECT id, name, area, contract_fields FROM objects WHERE id = $1', [a.object_id]);
  const u = await db.one('SELECT name, idnp, address FROM users WHERE id = $1', [a.user_id]);
  const pd = await personalDataOn();
  const sigRows = await db.query(`SELECT party, name, encode(signature, 'base64') AS image, signed_at FROM advance_signatures WHERE advance_id = $1`, [a.id]);
  const signatures = Object.fromEntries(sigRows.map((r) => [r.party, { image: r.image, name: r.name, signed_at: r.signed_at }]));
  const fields = typeof o.contract_fields === 'string' ? JSON.parse(o.contract_fields) : o.contract_fields || {};
  return {
    html: buildAdvanceContract({
      adv: { ...a, amount: Number(a.amount), sale_price: a.sale_price === null ? null : Number(a.sale_price) },
      object: { name: o.name, area: o.area === null ? null : Number(o.area) },
      fields,
      seller: { name: u.name, idnp: pd ? u.idnp : null, address: pd ? u.address : null },
      signatures,
      printable
    }),
    signatures: Object.fromEntries(Object.entries(signatures).map(([k, v]) => [k, { name: v.name, signed_at: v.signed_at }]))
  };
}

route('GET', '/api/advances/:id', async ({ user, params }) => {
  const { a, canEdit } = await loadAdvance(params.id, user);
  const { html, signatures } = await advanceHtml(a, false);
  const seller = await db.one('SELECT name FROM users WHERE id = $1', [a.user_id]);
  return {
    advance: {
      id: a.id, object_id: a.object_id, user_id: Number(a.user_id), seller: seller.name, buyer: a.buyer, buyer_idnp: a.buyer_idnp, buyer_address: a.buyer_address,
      buyer_phone: a.buyer_phone, amount: Number(a.amount), sale_price: a.sale_price === null ? null : Number(a.sale_price),
      received_date: a.received_date, valid_until: a.valid_until, return_mode: a.return_mode, city: a.city, status: a.status, note: a.note
    },
    html, signatures,
    can_edit: canEdit && !Object.keys(signatures).length,
    can_sign_seller: Number(a.user_id) === Number(user.id) && !signatures.seller,
    can_collect_buyer: canEdit && !signatures.buyer
  };
});

route('PATCH', '/api/advances/:id', async ({ user, params, body }) => {
  const { a, canEdit } = await loadAdvance(params.id, user);
  if (!canEdit) fail(403, 'Изменить аванс может тот, кто его получил, или создатель объекта');
  const signed = await db.one('SELECT count(*) AS c FROM advance_signatures WHERE advance_id = $1', [a.id]);
  if (Number(signed.c) > 0) fail(400, 'Договор уже подписан — данные менять нельзя');
  const sp = num(body.sale_price);
  const until = /^\d{4}-\d{2}-\d{2}$/.test(body.valid_until || '') ? body.valid_until : a.valid_until;
  await db.query(
    `UPDATE advances SET buyer = $1, buyer_idnp = $2, buyer_address = $3, buyer_phone = $4, sale_price = $5, return_mode = $6, city = $7, valid_until = $8::date WHERE id = $9`,
    [str(body.buyer, 120) || null, str(body.buyer_idnp, 20) || null, str(body.buyer_address, 300) || null, str(body.buyer_phone, 30) || null,
      Number.isFinite(sp) && sp > 0 ? sp : null, body.return_mode === 'single' ? 'single' : 'double', str(body.city, 80) || null, until, a.id]
  );
  return { ok: true };
});

route('POST', '/api/advances/:id/sign', async ({ user, params, body }) => {
  const { a, canEdit } = await loadAdvance(params.id, user);
  const party = body.party === 'buyer' ? 'buyer' : 'seller';
  if (party === 'seller' && Number(a.user_id) !== Number(user.id)) fail(403, 'Как продавец подписывает тот, кто получил аванс');
  if (party === 'buyer' && !canEdit) fail(403, 'Подпись покупателя собирает тот, кто получил аванс');
  if (party === 'buyer' && !a.buyer) fail(400, 'Укажите имя покупателя');
  if (body.agree !== true) fail(400, 'Подтвердите, что прочитали договор');
  const img = String(body.signature || '').replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(img, 'base64');
  if (buf.length < 200 || buf.length > 400 * 1024 || buf.readUInt32BE(0) !== 0x89504e47) fail(400, 'Подпись не распознана — распишитесь ещё раз');
  const name = party === 'seller' ? user.name : a.buyer;
  await db.query(
    `INSERT INTO advance_signatures (advance_id, party, name, signature) VALUES ($1, $2, $3, decode($4, 'base64')) ON CONFLICT (advance_id, party) DO NOTHING`,
    [a.id, party, name, buf.toString('base64')]
  );
  const rows = await db.query('SELECT party FROM advance_signatures WHERE advance_id = $1', [a.id]);
  if (rows.length === 2) {
    const oname = tg.escHtml(await objectName(a.object_id));
    notifyObject(a.object_id, user.id, (lang) => lang === 'ro'
      ? `✍️ <b>${oname}</b>\nContractul de arvună cu cumpărătorul ${tg.escHtml(a.buyer || '')} (${fmtEur(a.amount)}) a fost semnat de ambele părți.`
      : `✍️ <b>${oname}</b>\nДоговор аванса с покупателем ${tg.escHtml(a.buyer || '')} (${fmtEur(a.amount)}) подписан обеими сторонами.`,
      `/adv/${a.id}`);
  }
  return { signed: rows.map((r) => r.party) };
});

route('POST', '/api/advances/:id/contract-link', async ({ user, params }) => {
  const { a } = await loadAdvance(params.id, user);
  const t = token(24);
  await db.query(`INSERT INTO advance_links (token, advance_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`, [t, a.id]);
  return { url: `${PUBLIC_URL}/a/${t}` };
});

// Закрыть аванс: сделка состоялась / остался у нас / вернули
route('POST', '/api/advances/:id/status', async ({ user, params, body }) => {
  const a = await db.one('SELECT id, object_id, user_id, amount, status FROM advances WHERE id = $1', [params.id]);
  if (!a) fail(404, 'Аванс не найден');
  const me = await membership(a.object_id, user.id);
  if (Number(a.user_id) !== Number(user.id) && !me.isCreator) fail(403, 'Изменить аванс может тот, кто его получил, или создатель объекта');
  if (a.status !== 'active') fail(400, 'Аванс уже закрыт');
  const status = ['applied', 'kept', 'returned'].includes(body.status) ? body.status : fail(400, 'Неизвестный статус');
  await db.query('UPDATE advances SET status = $1, closed_at = now() WHERE id = $2', [status, a.id]);
  const oname = tg.escHtml(await objectName(a.object_id));
  const what = {
    applied: ['сделка состоялась, аванс зачтён в цену продажи', 'tranzacția a avut loc, avansul a fost inclus în prețul de vânzare'],
    kept: ['покупатель отказался — аванс остался у нас и идёт в прибыль', 'cumpărătorul a renunțat — avansul rămâne la noi și intră în profit'],
    returned: ['аванс возвращён покупателю', 'avansul a fost returnat cumpărătorului']
  }[status];
  notifyObject(a.object_id, user.id, (lang) => `💶 <b>${oname}</b>\n${lang === 'ro' ? 'Avans' : 'Аванс'} ${fmtEur(a.amount)}: ${what[lang === 'ro' ? 1 : 0]}.`, `/o/${a.object_id}`);
  return { ok: true };
});

// ---------- договор: черновик, редакции, подписи ----------

async function liveSnapshot(objectId) {
  const { object, members, entries, advances } = await loadObject(objectId);
  const calc = computeObject(object, members, entries, advances);
  return makeSnapshot({ object, members, calc, installment: installmentInfo(object, calc), repair: repairInfo(object, calc) });
}

async function latestVersion(objectId) {
  return db.one('SELECT id, data, terms_hash, created_at FROM contract_versions WHERE object_id = $1 ORDER BY id DESC LIMIT 1', [objectId]);
}

async function signaturesOf(versionId) {
  const rows = await db.query(
    `SELECT user_id, encode(signature, 'base64') AS image, idnp, address, signed_at FROM contract_signatures WHERE version_id = $1`,
    [versionId]
  );
  return Object.fromEntries(rows.map((r) => [Number(r.user_id), { image: r.image, idnp: r.idnp, address: r.address, signed_at: r.signed_at }]));
}

async function partyDetails(userIds) {
  if (!userIds.length) return {};
  if (!(await personalDataOn())) return {};
  const rows = await db.query(`SELECT id, idnp, address, to_char(birth_date, 'YYYY-MM-DD') AS birth_date FROM users WHERE id = ANY($1::int[])`, [`{${userIds.join(',')}}`]);
  return Object.fromEntries(rows.map((r) => [Number(r.id), { idnp: r.idnp, address: r.address, birth_date: r.birth_date }]));
}

async function contractStatus(objectId) {
  const v = await latestVersion(objectId);
  if (!v) return { fixed: false, signed: 0, total: 0, all_signed: false, signers: [] };
  const data = typeof v.data === 'string' ? JSON.parse(v.data) : v.data;
  const sigs = await db.query('SELECT user_id FROM contract_signatures WHERE version_id = $1', [v.id]);
  const signers = sigs.map((s) => Number(s.user_id));
  const total = data.parties.length;
  return { fixed: true, version_id: v.id, signed: signers.length, total, all_signed: total > 0 && signers.length >= total, signers };
}

async function contractHtml(objectId, printable) {
  const v = await latestVersion(objectId);
  if (v) {
    const data = typeof v.data === 'string' ? JSON.parse(v.data) : v.data;
    const signatures = await signaturesOf(v.id);
    const details = await partyDetails(data.parties.map((p) => p.user_id));
    return buildContract(data, { signatures, details, printable });
  }
  const snap = await liveSnapshot(objectId);
  return buildContract(snap, { details: await partyDetails(snap.parties.map((p) => p.user_id)), printable, draft: true });
}

route('GET', '/api/objects/:id/contract', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  const live = await liveSnapshot(params.id);
  const v = await latestVersion(params.id);
  const data = v ? (typeof v.data === 'string' ? JSON.parse(v.data) : v.data) : null;
  const sigs = v ? await signaturesOf(v.id) : {};
  const parties = (data || live).parties;
  const details = await partyDetails(parties.map((p) => p.user_id));
  const mine = await db.one('SELECT idnp, address FROM users WHERE id = $1', [user.id]);
  return {
    html: await contractHtml(params.id, false),
    fixed: !!v,
    version: v ? { id: v.id, created_at: v.created_at, stale: v.terms_hash !== termsHash(live) } : null,
    parties: parties.map((p) => ({
      user_id: p.user_id, name: p.name, role: p.role,
      signed_at: sigs[p.user_id] ? sigs[p.user_id].signed_at : null,
      has_details: !!((sigs[p.user_id] || details[p.user_id] || {}).idnp && (sigs[p.user_id] || details[p.user_id] || {}).address)
    })),
    fields: live.fields,
    installment: !!live.installment,
    personal_data: await personalDataOn(),
    me: { idnp: mine.idnp || '', address: mine.address || '', is_party: parties.some((p) => p.user_id === Number(user.id)), isCreator: me.isCreator },
    live_parties: live.parties.map((p) => ({ user_id: p.user_id, name: p.name }))
  };
});

// Данные договора, которые заполняет создатель
route('PUT', '/api/objects/:id/contract-fields', async ({ user, params, body }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Данные договора заполняет создатель объекта');
  const f = {};
  for (const k of ['number', 'city', 'property_address', 'cadastral', 'owner_name', 'installment_no']) {
    const v = str(body[k], 300);
    if (v) f[k] = v;
  }
  for (const k of ['contract_date', 'installment_date']) if (/^\d{4}-\d{2}-\d{2}$/.test(body[k] || '')) f[k] = body[k];
  for (const k of ['overrun_pct', 'payout_days']) { const n = Number(body[k]); if (Number.isFinite(n) && n > 0 && n < 10000) f[k] = Math.round(n); }
  if (body.owner_user_id) f.owner_user_id = Number(body.owner_user_id);
  await db.query('UPDATE objects SET contract_fields = $1::jsonb WHERE id = $2', [JSON.stringify(f), params.id]);
  return { ok: true };
});

// Зафиксировать редакцию для подписи (старые подписи остаются у прежней редакции)
route('POST', '/api/objects/:id/contract/fix', async ({ user, params }) => {
  const me = await membership(params.id, user.id);
  if (!me.isCreator) fail(403, 'Отправить договор на подпись может только создатель объекта');
  const snap = await liveSnapshot(params.id);
  if (!snap.parties.length) fail(400, 'В договоре нет сторон');
  const sum = snap.parties.filter((p) => p.role === 'investor').reduce((s, p) => s + p.share_pct, 0);
  if (Math.abs(sum - 100) > 0.01) fail(400, 'Сначала доведите доли инвесторов до 100 %');
  const v = await db.one(
    'INSERT INTO contract_versions (object_id, data, terms_hash, created_by) VALUES ($1, $2::jsonb, $3, $4) RETURNING id',
    [params.id, JSON.stringify(snap), termsHash(snap), user.id]
  );
  const oname = tg.escHtml(snap.object.name);
  notifyObject(params.id, user.id, (lang) => lang === 'ro'
    ? `✍️ <b>${oname}</b>\n${tg.escHtml(user.name)} a trimis Acordul de investiție comună spre semnare. Verificați-l și semnați în aplicație.`
    : `✍️ <b>${oname}</b>\n${tg.escHtml(user.name)} отправил договор дольщиков на подпись. Проверьте его и подпишите в приложении.`,
    `/o/${params.id}/contract`, snap.parties.map((p) => p.user_id));
  return { version_id: v.id };
});

// Подписать текущую редакцию
route('POST', '/api/objects/:id/contract/sign', async ({ user, params, body }) => {
  await membership(params.id, user.id);
  const v = await latestVersion(params.id);
  if (!v) fail(400, 'Договор ещё не отправлен на подпись');
  if (body.version_id && Number(body.version_id) !== Number(v.id)) fail(409, 'Договор изменился — откройте его заново');
  const data = typeof v.data === 'string' ? JSON.parse(v.data) : v.data;
  if (!data.parties.some((p) => p.user_id === Number(user.id))) fail(403, 'Вы не сторона этого договора');
  if (body.agree !== true) fail(400, 'Подтвердите, что прочитали договор');
  const pd = await personalDataOn();
  const u = pd ? await db.one('SELECT idnp, address FROM users WHERE id = $1', [user.id]) : { idnp: null, address: null };
  if (pd && (!u.idnp || !u.address)) fail(400, 'Заполните IDNP и адрес');
  const img = String(body.signature || '').replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(img, 'base64');
  if (buf.length < 200 || buf.length > 400 * 1024 || buf.readUInt32BE(0) !== 0x89504e47) fail(400, 'Подпись не распознана — распишитесь ещё раз');
  await db.query(
    `INSERT INTO contract_signatures (version_id, user_id, signature, idnp, address) VALUES ($1, $2, decode($3, 'base64'), $4, $5)
     ON CONFLICT (version_id, user_id) DO NOTHING`,
    [v.id, user.id, buf.toString('base64'), u.idnp, u.address]
  );
  const st = await contractStatus(params.id);
  const oname = tg.escHtml(data.object.name);
  notifyObject(params.id, user.id, (lang) => st.all_signed
    ? (lang === 'ro' ? `✅ <b>${oname}</b>\nAcordul a fost semnat de toate Părțile.` : `✅ <b>${oname}</b>\nДоговор подписан всеми сторонами.`)
    : (lang === 'ro' ? `✍️ <b>${oname}</b>\n${tg.escHtml(user.name)} a semnat Acordul (${st.signed} din ${st.total}).` : `✍️ <b>${oname}</b>\n${tg.escHtml(user.name)} подписал договор (${st.signed} из ${st.total}).`),
    `/o/${params.id}/contract`, data.parties.map((p) => p.user_id));
  return st;
});

// Ссылка, чтобы открыть договор в обычном браузере (из Telegram) и сохранить в PDF
route('POST', '/api/objects/:id/contract-link', async ({ user, params }) => {
  await membership(params.id, user.id);
  const t = token(24);
  await db.query(`INSERT INTO contract_links (token, object_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')`, [t, params.id]);
  return { url: `${PUBLIC_URL}/c/${t}` };
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
    if (m.role === 'investor') return L(`• ${tg.escHtml(m.name)} — ${u[1]} %`, `• ${tg.escHtml(m.name)} — ${u[1]} %`);
    return L(`• ${tg.escHtml(m.name)}, прораб — ${u[2] === 'pct' ? `${u[3]} % прибыли` : u[2] === 'fix' ? fmtEur(u[3]) : 'без доли'}`,
      `• ${tg.escHtml(m.name)}, diriginte — ${u[2] === 'pct' ? `${u[3]} % din profit` : u[2] === 'fix' ? fmtEur(u[3]) : 'fără cotă'}`);
  }).filter(Boolean);
  const oname = tg.escHtml(await objectName(params.id));
  notifyObject(params.id, user.id,
    (lang) => `🏠 <b>${oname}</b>\n${tg.escHtml(user.name)} ${lang === 'ro' ? 'a modificat cotele' : 'изменил доли'}:\n${lines.map((l) => l[lang]).join('\n')}`,
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
    const oname = tg.escHtml(await objectName(inv.object_id));
    notifyObject(inv.object_id, user.id,
      (lang) => `🏠 <b>${oname}</b>\n👤 ${tg.escHtml(user.name)} ${lang === 'ro' ? 's-a alăturat' : 'присоединился'} (${ROLE_L[inv.role][lang]})`,
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
  const kind = ['in', 'out', 'rent'].includes(body.kind) ? body.kind : fail(400, 'Неизвестный тип операции');
  let category = kind === 'out' ? str(body.category, 60) || 'Прочее' : null;
  if (me.role === 'foreman') {
    if (kind !== 'out') fail(403, 'Прораб вносит только расходы на ремонт');
    category = 'Ремонт';
  }
  const source = 'own'; // общего котла нет: каждый платит из своих денег
  const money = await amountFromBody(body);
  const amount = money.amount;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.entry_date || '') ? body.entry_date : null;
  // Автор операции — всегда тот, кто вошёл. За другого внести нельзя.
  const entry = await db.one(
    `INSERT INTO entries (object_id, user_id, kind, source, category, amount, note, entry_date, orig_amount, orig_currency, rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, current_date), $9, $10, $11) RETURNING id`,
    [params.id, user.id, kind, source, category, amount, str(body.note, 300) || null, date, money.orig_amount, money.orig_currency, money.rate]
  );
  if (kind === 'out') await savePhotos(entry.id, user.id, body.photos);
  if (kind !== 'plan') {
    const name = await objectName(params.id);
    const photos = kind === 'out' && Array.isArray(body.photos) ? body.photos.length : 0;
    const note = str(body.note, 300);
    notifyObject(params.id, user.id, (lang) => {
      const what = kind === 'rent'
        ? (lang === 'ro' ? `a primit chiria <b>${fmtEur(amount)}</b>` : `получил аренду <b>${fmtEur(amount)}</b>`)
        : kind === 'in'
        ? (lang === 'ro' ? `a depus o contribuție <b>${fmtEur(amount)}</b>` : `внёс взнос <b>${fmtEur(amount)}</b>`)
        : (lang === 'ro' ? `a adăugat o cheltuială <b>${fmtEur(amount)}</b> · ${tg.escHtml(catL(category).ro)}` : `добавил расход <b>${fmtEur(amount)}</b> · ${tg.escHtml(category)}`);
      return `🏠 <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} ${what}${note ? `\n«${tg.escHtml(note)}»` : ''}${photos ? `\n🧾 ${lang === 'ro' ? 'Bonuri' : 'Чеков'}: ${photos}` : ''}`;
    }, `/e/${entry.id}`);
  }
  return { id: entry.id };
});

route('GET', '/api/entries/:id', async ({ user, params }) => {
  const e = await db.one(
    `SELECT e.id, e.object_id, e.user_id, e.kind, e.source, e.category, e.amount, e.note,
            to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date, u.name AS author,
            (e.delete_requested_at IS NOT NULL) AS delete_pending, e.edit_proposal, e.orig_amount, e.orig_currency, e.rate
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
  let edit = null;
  const proposal = e.edit_proposal ? (typeof e.edit_proposal === 'string' ? JSON.parse(e.edit_proposal) : e.edit_proposal) : null;
  if (proposal) {
    const votes = await db.query(
      `SELECT u.id, u.name, m.role, EXISTS (SELECT 1 FROM entry_edit_votes v WHERE v.entry_id = $1 AND v.user_id = u.id) AS agreed
       FROM members m JOIN users u ON u.id = m.user_id WHERE m.object_id = $2 AND m.role IN ('investor','foreman') ORDER BY m.joined_at, u.id`,
      [e.id, e.object_id]
    );
    edit = {
      proposal,
      votes: votes.map((v) => ({ user_id: Number(v.id), name: v.name, role: v.role, agreed: v.agreed === true || v.agreed === 't' })),
      canVote: me.role === 'investor' || me.role === 'foreman'
    };
  }
  const { edit_proposal, ...rest } = e;
  return {
    entry: { ...rest, delete_pending: pending, edit_pending: !!proposal, amount: Number(e.amount), user_id: Number(e.user_id), mine: Number(e.user_id) === Number(user.id),
      orig_amount: e.orig_amount === null ? null : Number(e.orig_amount), rate: e.rate === null ? null : Number(e.rate) },
    receipts,
    deletion,
    edit,
    categories: CATEGORIES
  };
});

// ---------- исправление операции: автор предлагает, все участники сделки подтверждают ----------

async function applyEditIfAgreed(entryId, objectId) {
  const voters = await db.query(
    `SELECT u.id, EXISTS (SELECT 1 FROM entry_edit_votes v WHERE v.entry_id = $1 AND v.user_id = u.id) AS agreed
     FROM members m JOIN users u ON u.id = m.user_id WHERE m.object_id = $2 AND m.role IN ('investor','foreman')`,
    [entryId, objectId]
  );
  if (!voters.length || !voters.every((v) => v.agreed === true || v.agreed === 't')) return false;
  const e = await db.one('SELECT edit_proposal FROM entries WHERE id = $1', [entryId]);
  const p = typeof e.edit_proposal === 'string' ? JSON.parse(e.edit_proposal) : e.edit_proposal;
  await db.query(
    `UPDATE entries SET amount = $1, category = $2, note = $3, entry_date = $4::date, orig_amount = $5, orig_currency = $6, rate = $7,
       edit_proposal = NULL, edit_requested_at = NULL WHERE id = $8`,
    [p.amount, p.category, p.note, p.entry_date, p.orig_amount, p.orig_currency, p.rate, entryId]
  );
  await db.query('DELETE FROM entry_edit_votes WHERE entry_id = $1', [entryId]);
  return true;
}

route('POST', '/api/entries/:id/edit', async ({ user, params, body }) => {
  const e = await db.one(
    `SELECT id, object_id, user_id, kind, category, note, amount, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, delete_requested_at, edit_requested_at FROM entries WHERE id = $1`,
    [params.id]
  );
  if (!e) fail(404, 'Операция не найдена');
  const me = await membership(e.object_id, user.id);
  if (Number(e.user_id) !== Number(user.id)) fail(403, 'Исправить операцию может только её автор');
  if (e.delete_requested_at) fail(400, 'По операции уже идёт запрос на удаление');
  const money = await amountFromBody({ ...body, entry_date: body.entry_date || e.entry_date });
  let category = e.kind === 'out' ? str(body.category, 60) || e.category || 'Прочее' : null;
  if (me.role === 'foreman') category = 'Ремонт';
  const proposal = {
    amount: money.amount, orig_amount: money.orig_amount, orig_currency: money.orig_currency, rate: money.rate,
    category, note: str(body.note, 300) || null,
    entry_date: /^\d{4}-\d{2}-\d{2}$/.test(body.entry_date || '') ? body.entry_date : e.entry_date,
    before: { amount: Number(e.amount), category: e.category, note: e.note, entry_date: e.entry_date }
  };
  await db.query('UPDATE entries SET edit_proposal = $1::jsonb, edit_requested_at = now() WHERE id = $2', [JSON.stringify(proposal), e.id]);
  await db.query('DELETE FROM entry_edit_votes WHERE entry_id = $1', [e.id]);
  await db.query('INSERT INTO entry_edit_votes (entry_id, user_id) VALUES ($1, $2)', [e.id, user.id]);
  const applied = await applyEditIfAgreed(e.id, e.object_id);
  if (!applied) {
    const oname = tg.escHtml(await objectName(e.object_id));
    const changes = (lang) => {
      const out = [];
      if (proposal.amount !== Number(e.amount)) out.push(`${lang === 'ro' ? 'suma' : 'сумма'}: ${fmtEur(e.amount)} → <b>${fmtEur(proposal.amount)}</b>`);
      if (proposal.category !== e.category) out.push(`${lang === 'ro' ? 'categoria' : 'категория'}: ${tg.escHtml(e.category || '—')} → ${tg.escHtml(proposal.category || '—')}`);
      if ((proposal.note || '') !== (e.note || '')) out.push(`${lang === 'ro' ? 'comentariu' : 'комментарий'}: «${tg.escHtml(proposal.note || '')}»`);
      if (proposal.entry_date !== e.entry_date) out.push(`${lang === 'ro' ? 'data' : 'дата'}: ${proposal.entry_date}`);
      return out.join('\n');
    };
    notifyObject(e.object_id, user.id, (lang) => lang === 'ro'
      ? `✏️ <b>${oname}</b>\n${tg.escHtml(user.name)} propune corectarea operațiunii:\n${changes('ro')}\nEste necesar acordul tuturor participanților.`
      : `✏️ <b>${oname}</b>\n${tg.escHtml(user.name)} предлагает исправить операцию:\n${changes('ru')}\nНужно согласие всех участников сделки.`,
      `/e/${e.id}`);
  }
  return { applied, pending: !applied };
});

route('POST', '/api/entries/:id/edit-vote', async ({ user, params, body }) => {
  const e = await db.one('SELECT id, object_id, user_id, edit_requested_at FROM entries WHERE id = $1', [params.id]);
  if (!e) fail(404, 'Операция не найдена');
  const me = await membership(e.object_id, user.id);
  if (!e.edit_requested_at) fail(400, 'Исправлений на согласовании нет');
  if (me.role === 'viewer') fail(403, 'Роль «Просмотр» не голосует');
  if (body.agree === true) {
    await db.query('INSERT INTO entry_edit_votes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.id, user.id]);
    const applied = await applyEditIfAgreed(e.id, e.object_id);
    if (applied) {
      const oname = tg.escHtml(await objectName(e.object_id));
      notifyObject(e.object_id, user.id, (lang) => lang === 'ro' ? `✏️ <b>${oname}</b>\nCorectarea operațiunii a fost aplicată: toți au fost de acord.` : `✏️ <b>${oname}</b>\nИсправление операции применено: все согласились.`, `/e/${e.id}`);
    }
    return { applied };
  }
  await db.query('UPDATE entries SET edit_proposal = NULL, edit_requested_at = NULL WHERE id = $1', [e.id]);
  await db.query('DELETE FROM entry_edit_votes WHERE entry_id = $1', [e.id]);
  const oname = tg.escHtml(await objectName(e.object_id));
  notifyObject(e.object_id, user.id, (lang) => lang === 'ro' ? `✏️ <b>${oname}</b>\n${tg.escHtml(user.name)} este împotriva corectării — operațiunea rămâne neschimbată.` : `✏️ <b>${oname}</b>\n${tg.escHtml(user.name)} против исправления — операция остаётся как была.`, `/e/${e.id}`);
  return { applied: false, cancelled: true };
});

route('POST', '/api/entries/:id/edit-cancel', async ({ user, params }) => {
  const e = await db.one('SELECT object_id, user_id FROM entries WHERE id = $1', [params.id]);
  if (!e) fail(404, 'Операция не найдена');
  await membership(e.object_id, user.id);
  if (Number(e.user_id) !== Number(user.id)) fail(403, 'Отозвать исправление может только автор');
  await db.query('UPDATE entries SET edit_proposal = NULL, edit_requested_at = NULL WHERE id = $1', [params.id]);
  await db.query('DELETE FROM entry_edit_votes WHERE entry_id = $1', [params.id]);
  return { ok: true };
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

const entryTitle = (e, lang) => `${e.note || (e.category ? (lang === 'ro' ? catL(e.category).ro : e.category) : null) || (lang === 'ro' ? { in: 'Contribuție', out: 'Cheltuială', plan: 'Plan' } : { in: 'Взнос', out: 'Расход', plan: 'План' })[e.kind]} · ${fmtEur(e.amount)}`;

route('DELETE', '/api/entries/:id', async ({ user, params }) => {
  const e = await db.one('SELECT id, object_id, user_id, kind, category, note, amount, delete_requested_at FROM entries WHERE id = $1', [params.id]);
  if (!e) fail(404, 'Операция не найдена');
  await membership(e.object_id, user.id);
  if (Number(e.user_id) !== Number(user.id)) fail(403, 'Запросить удаление может только автор операции');
  const ed = await db.one('SELECT edit_requested_at FROM entries WHERE id = $1', [e.id]);
  if (ed && ed.edit_requested_at) fail(400, 'По операции уже идёт согласование исправления');
  if (!e.delete_requested_at) {
    await db.query('UPDATE entries SET delete_requested_at = now() WHERE id = $1', [e.id]);
    await db.query('DELETE FROM entry_delete_votes WHERE entry_id = $1', [e.id]);
  }
  await db.query('INSERT INTO entry_delete_votes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.id, user.id]);
  const deleted = await maybeFinishEntryDelete(e.id, e.object_id);
  if (!deleted) {
    const voters = (await entryVoters(e.id, e.object_id)).map((v) => Number(v.id));
    const oname = tg.escHtml(await objectName(e.object_id));
    notifyObject(e.object_id, user.id, (lang) => lang === 'ro'
      ? `🗑 <b>${oname}</b>\n${tg.escHtml(user.name)} cere ștergerea operațiunii «${tg.escHtml(entryTitle(e, 'ro'))}». Va fi ștearsă doar dacă sunt de acord toți participanții.`
      : `🗑 <b>${oname}</b>\n${tg.escHtml(user.name)} просит удалить операцию «${tg.escHtml(entryTitle(e))}». Она удалится, только если согласятся все участники сделки.`,
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
      notifyObject(e.object_id, user.id, (lang) => lang === 'ro'
        ? `🗑 <b>${tg.escHtml(name)}</b>\nOperațiunea «${tg.escHtml(entryTitle(e, 'ro'))}» a fost ștearsă: toți participanții au fost de acord.`
        : `🗑 <b>${tg.escHtml(name)}</b>\nОперация «${tg.escHtml(entryTitle(e))}» удалена: все участники согласились.`,
        `/o/${e.object_id}`, recipients.map((v) => Number(v.id)));
    }
    return { deleted };
  }
  await db.query('UPDATE entries SET delete_requested_at = NULL WHERE id = $1', [e.id]);
  await db.query('DELETE FROM entry_delete_votes WHERE entry_id = $1', [e.id]);
  notifyObject(e.object_id, user.id, (lang) => lang === 'ro'
    ? `🏠 <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} este împotriva ștergerii operațiunii «${tg.escHtml(entryTitle(e, 'ro'))}» — cererea a fost anulată, operațiunea rămâne.`
    : `🏠 <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} против удаления операции «${tg.escHtml(entryTitle(e))}» — запрос отменён, операция остаётся.`,
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
    notifyObject(params.id, user.id, (lang) => lang === 'ro'
      ? `⚠️ <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} a cerut ștergerea obiectului. Obiectul va fi șters doar dacă sunt de acord toți participanții.`
      : `⚠️ <b>${tg.escHtml(name)}</b>\n${tg.escHtml(user.name)} запросил удаление объекта. Объект удалится, только если согласятся все участники сделки.`,
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
        if (r.id !== Number(user.id)) tg.send(r.telegram_id, r.lang === 'ro' ? `🗑 Obiectul <b>${tg.escHtml(name)}</b> a fost șters: toți participanții au fost de acord.` : `🗑 Объект <b>${tg.escHtml(name)}</b> удалён: все участники согласились.`, null);
      }
    }
    return { deleted };
  }
  const oname = tg.escHtml(await objectName(params.id));
  notifyObject(params.id, user.id, (lang) => lang === 'ro'
    ? `🏠 <b>${oname}</b>\n${tg.escHtml(user.name)} este împotriva ștergerii — cererea a fost anulată.`
    : `🏠 <b>${oname}</b>\n${tg.escHtml(user.name)} против удаления — запрос отменён.`,
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

async function serveExport(req, res, id, viaLink, lang) {
  if (!viaLink) {
    const user = await currentUser(req);
    if (!user) fail(401, 'Нужно войти');
    await membership(id, user.id);
  }
  const { object, entries } = await loadObject(id);
  if (!lang) lang = new URL(req.url, 'http://x').searchParams.get('lang') === 'ro' ? 'ro' : 'ru';
  const ro = lang === 'ro';
  const kinds = ro ? { in: 'Contribuție', out: 'Cheltuială', plan: 'Plan', rent: 'Chirie (venit)' } : { in: 'Взнос', out: 'Расход', plan: 'План', rent: 'Аренда (доход)' };
  const esc = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  const head = ro ? ['Data', 'Tip', 'Categorie', 'Suma, €', 'Suma, lei', 'Cursul BNM', 'Cine', 'Comentariu', 'Bonuri'] : ['Дата', 'Тип', 'Категория', 'Сумма, €', 'Сумма, lei', 'Курс НБМ', 'Кто', 'Комментарий', 'Чеков'];
  const lines = [head.map(esc).join(';')];
  for (const e of entries) {
    lines.push([e.entry_date, kinds[e.kind], (ro && CAT_RO[e.category]) || e.category || '', String(e.amount).replace('.', ','),
      e.orig_currency === 'MDL' ? String(e.orig_amount).replace('.', ',') : '', e.orig_currency === 'MDL' && e.rate ? String(e.rate).replace('.', ',') : '',
      e.author, e.note || '', e.receipts].map(esc).join(';'));
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
  const known = await db.one('SELECT lang FROM users WHERE telegram_id = $1', [String(from.id)]).catch(() => null);
  const ro = known ? known.lang === 'ro' : String(from.language_code || '').startsWith('ro');
  const T = (ruText, roText) => (ro ? roText : ruText);
  const OPEN = T('Открыть Долю', 'Deschide Dolya');
  if (cmd !== '/start') {
    return tg.send(chatId, T('Откройте «Долю» кнопкой ниже.', 'Deschideți «Dolya» cu butonul de mai jos.'), PUBLIC_URL ? appUrl('/') : null, OPEN);
  }
  try {
    if (param.startsWith('link_')) {
      const link = await db.one(`SELECT user_id FROM tg_links WHERE token = $1 AND expires_at > now()`, [param.slice(5)]);
      if (!link) return tg.send(chatId, T('Ссылка для привязки устарела. Создайте новую в профиле.', 'Linkul de conectare a expirat. Creați unul nou în profil.'), null);
      const taken = await db.one('SELECT id FROM users WHERE telegram_id = $1', [String(from.id)]);
      if (taken && Number(taken.id) !== Number(link.user_id)) {
        return tg.send(chatId, T('Этот Telegram уже привязан к другому аккаунту Доли.', 'Acest Telegram este deja conectat la alt cont Dolya.'), null);
      }
      await db.query('UPDATE users SET telegram_id = $1, tg_username = $2 WHERE id = $3', [String(from.id), from.username || null, link.user_id]);
      await db.query('DELETE FROM tg_links WHERE token = $1', [param.slice(5)]);
      return tg.send(chatId, T('✅ Telegram привязан. Теперь вы будете получать уведомления и можете входить в Долю прямо отсюда.', '✅ Telegram conectat. Acum veți primi notificări și puteți intra în Dolya direct de aici.'), PUBLIC_URL ? appUrl('/') : null, OPEN);
    }
    if (param.startsWith('join_')) {
      const t = param.slice(5);
      const inv = await db.one(
        `SELECT i.role, o.name AS object_name, u.name AS inviter FROM invites i
         JOIN objects o ON o.id = i.object_id JOIN users u ON u.id = i.created_by
         WHERE i.token = $1 AND i.expires_at > now()`,
        [t]
      );
      if (!inv) return tg.send(chatId, T('Приглашение не найдено или истекло. Попросите новую ссылку.', 'Invitația nu a fost găsită sau a expirat. Cereți un link nou.'), null);
      const roleName = ROLE_L[inv.role][ro ? 'ro' : 'ru'];
      return tg.send(chatId,
        T(`${tg.escHtml(inv.inviter)} приглашает вас в объект <b>${tg.escHtml(inv.object_name)}</b> с ролью «${roleName}».`,
          `${tg.escHtml(inv.inviter)} vă invită în obiectul <b>${tg.escHtml(inv.object_name)}</b> cu rolul «${roleName}».`),
        PUBLIC_URL ? appUrl(`/join/${t}`) : null, T('Присоединиться', 'Alăturați-vă'));
    }
    return tg.send(chatId,
      T('<b>Доля</b> — учёт совместных вложений в недвижимость: кто сколько вложил, план и факт расходов, чеки, доли и прогноз прибыли.\n\nСюда будут приходить уведомления по вашим объектам.',
        '<b>Dolya</b> — evidența investițiilor comune în imobiliare: cine cât a investit, cheltuieli planificate și reale, bonuri, cote și prognoza profitului.\n\nAici veți primi notificări despre obiectele dvs.'),
      PUBLIC_URL ? appUrl('/') : null, OPEN);
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
    if (req.method === 'GET' && (m = pathname.match(/^\/r\/([\w-]+)\.csv$/))) {
      const link = await db.one('SELECT object_id, lang FROM report_links WHERE token = $1 AND expires_at > now()', [m[1]]);
      if (!link) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Linkul a expirat. / Ссылка устарела.'); }
      return await serveExport(req, res, link.object_id, true, link.lang);
    }
    if (req.method === 'GET' && (m = pathname.match(/^\/r\/([\w-]+)$/))) {
      const link = await db.one('SELECT object_id, lang FROM report_links WHERE token = $1 AND expires_at > now()', [m[1]]);
      if (!link) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<p style="font-family:sans-serif;padding:24px">Linkul a expirat. / Ссылка устарела.</p>'); }
      const html = await reportHtml(link.object_id, link.lang, `/r/${m[1]}.csv`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return res.end(html);
    }
    if (req.method === 'GET' && (m = pathname.match(/^\/a\/([\w-]+)$/))) {
      const link = await db.one('SELECT advance_id FROM advance_links WHERE token = $1 AND expires_at > now()', [m[1]]);
      if (!link) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<p style="font-family:sans-serif;padding:24px">Linkul a expirat. / Ссылка устарела.</p>'); }
      const a = await db.one(`SELECT a.*, to_char(a.received_date, 'YYYY-MM-DD') AS received_date, to_char(a.valid_until, 'YYYY-MM-DD') AS valid_until FROM advances a WHERE a.id = $1`, [link.advance_id]);
      const { html } = await advanceHtml(a, true);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return res.end(html);
    }
    if (req.method === 'GET' && (m = pathname.match(/^\/c\/([\w-]+)$/))) {
      const link = await db.one('SELECT object_id FROM contract_links WHERE token = $1 AND expires_at > now()', [m[1]]);
      if (!link) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<p style="font-family:sans-serif;padding:24px">Linkul a expirat. Deschideți contractul din nou în aplicație. / Ссылка устарела, откройте договор в приложении ещё раз.</p>'); }
      const html = await contractHtml(link.object_id, true);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return res.end(html);
    }
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
  if (ADMIN_TG.length) {
    await db.query(`UPDATE users SET is_admin = true WHERE lower(tg_username) = ANY($1::text[])`, [`{${ADMIN_TG.join(',')}}`]);
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
