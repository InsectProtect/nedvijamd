'use strict';
/* Доля — клиент. Без сборки, без зависимостей. */

const app = document.getElementById('app');
const state = { me: null, categories: [], cache: {}, bot: null, settings: { personal_data: false } };
const TG = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
const sessionToken = {
  get() { try { return localStorage.getItem('dolya_session') || ''; } catch { return ''; } },
  set(t) { try { t ? localStorage.setItem('dolya_session', t) : localStorage.removeItem('dolya_session'); } catch { /* приватный режим */ } }
};
function openExternal(url) {
  if (TG && /^https:\/\/t\.me\//.test(url)) TG.openTelegramLink(url);
  else if (TG) TG.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

// ---------- утилиты ----------
const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const fmt = (n) => nf.format(Math.round(Number(n) || 0)).replace(/\s/g, ' ');
const money = (n) => `${fmt(n)} €`;
const signed = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const pct = (n) => `${String(Math.round(n * 10) / 10).replace('.', ',')} %`;
const PALETTE = ['#D4BF94', '#6F8AB0', '#7BA894', '#B88A9C', '#A9A6C9', '#C9A27A', '#8FB3B8'];
const colorOf = (id) => PALETTE[Math.abs(Number(id) || 0) % PALETTE.length];
const initial = (name) => esc((String(name || '?').trim()[0] || '?').toUpperCase());
const avatar = (id, name, cls = '') => `<span class="avatar ${cls}" style="background:${colorOf(id)}">${initial(name)}</span>`;
const ROLE = { investor: 'инвестор', foreman: 'прораб', viewer: 'просмотр' };
const KIND = { in: 'Взнос', out: 'Расход', plan: 'План', rent: 'Аренда' };
const STATUSES = ['покупка', 'ремонт', 'сдаётся', 'продаётся', 'продана'];
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dateRu = (d) => {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  const mon = I18N.months()[Number(m) - 1];
  return `${Number(dd)} ${mon}${y !== String(new Date().getFullYear()) ? ' ' + y : ''}`;
};

const I = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plusSm: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8E8E94" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="#D4BF94" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>',
  receipt: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  gallery: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h4M7 13h6M7 16.5h3"/><path d="M16 8.5v4"/><circle cx="16" cy="8" r="1.4" fill="currentColor"/></svg>',
  deals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18M11 12.5v1.5h2v-1.5"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7 8l5-5 5 5"/></svg>'
};

const ask = (m) => confirm(I18N.tr(m));
// Сворачиваемые блоки: состояние запоминается на устройстве
const foldOpen = (key, def) => { try { const v = localStorage.getItem('fold:' + key); return v === null ? def : v === '1'; } catch { return def; } };
function bindFolds() {
  app.querySelectorAll('details[data-fold]').forEach((el) => el.addEventListener('toggle', () => {
    try { localStorage.setItem('fold:' + el.dataset.fold, el.open ? '1' : '0'); } catch { /* нет доступа */ }
  }));
}
const monthTitle = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const t = new Intl.DateTimeFormat(I18N.lang === 'ro' ? 'ro-RO' : 'ru-RU', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)).replace(/\s*г\.?$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const langSwitch = () => `<div class="seg lang-seg" style="grid-template-columns:1fr 1fr" role="group" aria-label="Язык">
  <button type="button" data-lang="ru" class="${I18N.lang === 'ru' ? 'on' : ''}" data-nt>Русский</button>
  <button type="button" data-lang="ro" class="${I18N.lang === 'ro' ? 'on' : ''}" data-nt>Limba de stat</button></div>`;
function bindLang() {
  app.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', async () => {
    const l = b.dataset.lang;
    if (l === I18N.lang) return;
    if (state.me) { try { await api('PATCH', '/api/me', { lang: l }); } catch { /* не критично */ } }
    I18N.set(l);
    location.reload();
  }));
}

function toast(msg, good = false) {
  msg = I18N.tr(msg);
  const t = document.createElement('div');
  t.className = 'toast' + (good ? ' okay' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

async function api(method, path, body) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (sessionToken.get()) headers['X-Session'] = sessionToken.get();
  const r = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  let data = {};
  try { data = await r.json(); } catch { /* пусто */ }
  if (r.status === 401 && !path.startsWith('/api/login') && !path.startsWith('/api/register')) {
    state.me = null;
    go('#/login');
    throw new Error(data.error || 'Нужно войти');
  }
  if (!r.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const backBtn = (href, label = 'Назад') => `<a class="icon-btn back-btn" href="${href}" aria-label="${label}">${I.back}</a>`;
const tabbar = (active, objId) => `
  <nav class="tabbar" aria-label="Навигация">
    <a href="#/" class="${active === 'home' ? 'on' : ''}">${I.grid}<span>Объекты</span></a>
    <button type="button" class="plus" id="tb-plus" data-obj="${objId || ''}" aria-label="Добавить">${I.plus}</button>
    <a href="#/market" class="${active === 'market' ? 'on' : ''}">${I.board}<span>Доска</span></a>
    <a href="#/profile" class="${active === 'profile' ? 'on' : ''}">${I.user}<span>Профиль</span></a>
  </nav>`;

// Меню «+»: расход, объект, сделка на доску, анкета инвестора
function openActionSheet(objId) {
  const sheet = document.createElement('div');
  sheet.className = 'viewer sheet-bg';
  const item = (key, icon, title, sub) => `<button type="button" class="act" data-act="${key}"><span class="act-i">${icon}</span><span class="act-t"><b>${title}</b><small>${sub}</small></span></button>`;
  const mp = state.market && state.market.my_profile;
  const main = `<div class="sheet" role="dialog" aria-label="Добавить">
    <div class="sheet-grip"></div>
    ${item('entry', I.receipt.replace('width="12" height="12"', ''), 'Добавить расход или аренду', 'В один из ваших объектов')}
    ${item('object', I.grid, 'Новый объект', 'Квартира, дом, участок — с партнёрами или один')}
    ${item('offer', I.deals, 'Предложить сделку', 'Найти инвестора на доске сделок')}
    ${item('investor', I.trend, mp ? 'Моя анкета инвестора' : 'Хочу стать инвестором', mp ? 'Изменить сумму или убрать с доски' : 'Есть деньги — получать предложения сделок')}
  </div>`;
  sheet.innerHTML = main;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
  const close = () => sheet.remove();
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  const pickObject = async () => {
    if (objId) { close(); return go(`#/o/${objId}/add`); }
    let list = [];
    try { list = (await api('GET', '/api/objects')).objects.filter((o) => !o.closed && (o.role === 'investor' || o.role === 'foreman')); } catch (ex) { toast(ex.message); return; }
    if (!list.length) { close(); toast('Сначала создайте объект'); return go('#/new'); }
    if (list.length === 1) { close(); return go(`#/o/${list[0].id}/add`); }
    sheet.querySelector('.sheet').innerHTML = `<div class="sheet-grip"></div><div style="font-size:17px;font-weight:600;margin-bottom:6px">В какой объект?</div>
      ${list.map((o) => `<button type="button" class="act" data-oid="${o.id}">${o.photo ? `<span class="act-i" style="background:url('${o.photo}') center/cover"></span>` : `<span class="act-i">${I.grid}</span>`}<span class="act-t"><b data-nt>${esc(o.name)}</b><small>${esc(o.status)}</small></span></button>`).join('')}`;
    sheet.querySelectorAll('[data-oid]').forEach((b) => b.addEventListener('click', () => { close(); go(`#/o/${b.dataset.oid}/add`); }));
  };
  sheet.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'entry') return pickObject();
    close();
    go(a === 'object' ? '#/new' : a === 'offer' ? '#/market/new' : '#/market/profile');
  }));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#tb-plus');
  if (b) openActionSheet(b.dataset.obj ? Number(b.dataset.obj) : null);
});

function on(sel, ev, fn) {
  app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
}

// Сжатие фото на телефоне перед загрузкой
async function compressImage(file, max = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Не удалось прочитать фото'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', quality);
    return { mime: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- просмотр чеков на весь экран ----------
function openViewer(ids, start = 0, base = '/api/receipts/') {
  let i = start;
  const v = document.createElement('div');
  v.className = 'viewer';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-label', 'Просмотр чека');
  const draw = () => {
    v.innerHTML = `
      <div class="top">
        <button class="icon-btn" data-close aria-label="Закрыть">${I.close}</button>
        <div style="font-size:14px;font-weight:500">Чек ${i + 1} из ${ids.length}</div>
        <a class="icon-btn" href="${base}${ids[i]}/image" target="_blank" rel="noopener" aria-label="Открыть отдельно">${I.share}</a>
      </div>
      <div class="stage"><img src="${base}${ids[i]}/image" alt="Фото чека ${i + 1}"></div>
      <div class="muted" style="text-align:center;font-size:12px">Двойное касание — увеличить · свайп — следующий</div>
      <div class="strip">${ids.map((id, k) => `<button class="${k === i ? 'on' : ''}" data-k="${k}" aria-label="Чек ${k + 1}" style="background-image:url('${base}${id}/image')"></button>`).join('')}</div>`;
    v.querySelector('[data-close]').onclick = () => v.remove();
    v.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { i = Number(b.dataset.k); draw(); }));
    const img = v.querySelector('.stage img');
    let last = 0;
    img.addEventListener('click', () => {
      const now = Date.now();
      if (now - last < 350) img.classList.toggle('zoom');
      last = now;
    });
    let sx = null;
    const stage = v.querySelector('.stage');
    stage.addEventListener('touchstart', (e) => { if (e.touches.length === 1 && !img.classList.contains('zoom')) sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 60) { i = (i + (dx < 0 ? 1 : -1) + ids.length) % ids.length; draw(); }
    });
  };
  draw();
  document.body.appendChild(v);
}

// ---------- экраны ----------

function viewAuth(mode) {
  const reg = mode === 'register';
  const inviteNote = sessionStorage.getItem('invite') ? '<div class="card gold" style="margin-top:20px;font-size:14px">Вас пригласили в объект. Войдите или зарегистрируйтесь, чтобы присоединиться.</div>' : '';
  app.innerHTML = `
    <div class="auth-wrap">
      <div style="max-width:220px;margin-bottom:28px">${langSwitch()}</div>
      <div class="auth-logo">Доля</div>
      <div class="lead">Учёт совместных вложений в недвижимость: кто сколько вложил, на что потратил и сколько заработает.</div>
      ${inviteNote}
      <form id="f" style="margin-top:28px" novalidate>
        ${reg ? '<label class="label" for="fname">Имя</label><input class="field" id="fname" autocomplete="given-name" required><label class="label" for="lname">Фамилия</label><input class="field" id="lname" autocomplete="family-name" required>' : ''}
        <label class="label" for="email">Email</label>
        <input class="field" id="email" type="email" autocomplete="email" inputmode="email" required>
        <label class="label" for="pw">Пароль</label>
        <input class="field" id="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6">
        <div class="err" id="err" role="alert"></div>
        <button class="btn" style="margin-top:12px">${reg ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
      <a href="${reg ? '#/login' : '#/register'}" style="text-align:center;margin-top:18px;font-size:14px">${reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</a>
    </div>`;
  bindLang();
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const err = app.querySelector('#err');
    err.textContent = '';
    const body = { email: app.querySelector('#email').value, password: app.querySelector('#pw').value };
    if (reg) { body.first_name = app.querySelector('#fname').value; body.last_name = app.querySelector('#lname').value; body.lang = I18N.lang; }
    try {
      const d = await api('POST', reg ? '/api/register' : '/api/login', body);
      state.me = d.user;
      sessionToken.set(d.token);
      const inv = sessionStorage.getItem('invite');
      go(inv ? `#/join/${inv}` : '#/');
    } catch (ex) {
      err.textContent = I18N.tr(ex.message);
    }
  };
}

async function viewJoin(token) {
  let info;
  try {
    info = await api('GET', `/api/invites/${token}`);
  } catch (e) {
    app.innerHTML = `<div class="auth-wrap"><div class="auth-logo">Доля</div><div class="lead">${esc(e.message)}</div><a class="btn ghost" style="margin-top:24px" href="#/">На главную</a></div>`;
    return;
  }
  if (!state.me) {
    sessionStorage.setItem('invite', token);
    app.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-logo">Доля</div>
        <div class="lead">${esc(info.inviter)} приглашает вас в объект <b style="color:var(--text)">${esc(info.object_name)}</b> с ролью «${ROLE[info.role]}».</div>
        <a class="btn" style="margin-top:28px" href="#/register">Зарегистрироваться</a>
        <a class="btn ghost" style="margin-top:10px" href="#/login">У меня есть аккаунт</a>
      </div>`;
    return;
  }
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo">Доля</div>
      <div class="lead">${esc(info.inviter)} приглашает вас в объект <b style="color:var(--text)">${esc(info.object_name)}</b> с ролью «${ROLE[info.role]}».</div>
      <button class="btn" style="margin-top:28px" id="acc">Присоединиться</button>
      <a class="btn ghost" style="margin-top:10px" href="#/">Не сейчас</a>
    </div>`;
  app.querySelector('#acc').onclick = async () => {
    try {
      const d = await api('POST', `/api/invites/${token}/accept`);
      sessionStorage.removeItem('invite');
      toast('Вы присоединились к объекту', true);
      go(`#/o/${d.object_id}`);
    } catch (e) { toast(e.message); }
  };
}

async function viewHome() {
  const d = await api('GET', '/api/objects');
  const t = d.totals;
  const roleLine = (o) => {
    if (o.role === 'investor') return `моя доля ${pct(o.share_pct)}`;
    if (o.role === 'foreman') return o.foreman_mode === 'pct' ? `прораб · ${pct(o.foreman_value)} прибыли` : o.foreman_mode === 'fix' ? `прораб · ${money(o.foreman_value)}` : 'прораб';
    return 'просмотр';
  };
  const active = d.objects.filter((o) => !o.closed);
  const history = d.objects.filter((o) => o.closed).sort((a, b) => String(b.sold_at).localeCompare(String(a.sold_at)));
  const histRow = (o) => {
    const roi = o.my_invested > 0 && o.my_profit !== null ? (o.my_profit / o.my_invested) * 100 : null;
    const allPaid = !o.payouts || o.payouts.done === o.payouts.total;
    return `<a class="obj" href="#/o/${o.id}/deal">
      ${o.photo ? `<span class="obj-thumb" style="background-image:url('${o.photo}')"></span>` : `<span class="obj-thumb empty">${I.grid}</span>`}
      <div style="flex:1 1 auto;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="name">${esc(o.name)}</span><span class="badge продана">продана</span></div>
        <div class="muted" style="font-size:12px;margin-top:6px">${dateRu(o.sold_at)} · ${money(o.sold_price)}</div>
        <div style="font-size:12px;margin-top:4px" class="${allPaid ? 'okc' : 'muted'}">${allPaid ? 'выплаты завершены' : `выплаты ${o.payouts.done} из ${o.payouts.total}`}</div>
      </div>
      <div style="text-align:right;white-space:nowrap;flex:none">
        ${o.my_profit !== null ? `<div class="display num ${o.my_profit >= 0 ? 'okc' : 'red'}" style="font-weight:600;font-size:15px">${signed(o.my_profit)} €</div><div class="muted" style="font-size:12px;margin-top:4px">${roi !== null ? 'заработал · ' + pct(roi) : 'заработал'}</div>` : '<div class="muted" style="font-size:12px">просмотр</div>'}
      </div>
    </a>`;
  };
  const list = active.map((o) => `
    <a class="obj" href="#/o/${o.id}">
      ${o.photo ? `<span class="obj-thumb" style="background-image:url('${o.photo}')"></span>` : `<span class="obj-thumb empty">${I.grid}</span>`}
      <div style="flex:1 1 auto;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="name">${esc(o.name)}</span><span class="badge ${esc(o.status)}">${esc(o.status)}</span>${o.delete_requested ? '<span class="badge red">удаление</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <span style="display:flex">${o.people.slice(0, 5).map((p) => avatar(p.user_id, p.name, 'sm')).join('')}</span>
          <span class="muted" style="font-size:12px">${roleLine(o)}</span>
        </div>
        ${o.advance ? `<div style="font-size:12px;margin-top:6px"><span class="muted">Аванс ${money(o.advance.amount)} · </span><span class="${daysClass(o.advance.days_left)}">${daysLabel(o.advance.days_left)}</span></div>` : ''}
        ${o.installment ? `<div class="muted" style="font-size:12px;margin-top:6px">Рассрочка: осталось <span class="num" style="color:var(--text)">${money(o.installment.left)}</span></div>` : ''}
      </div>
      <div style="text-align:right;white-space:nowrap;flex:none">
        <div class="display num" style="font-weight:600;font-size:15px">${money(o.my_invested)}</div>
        ${o.my_profit !== null ? `<div class="gold num" style="font-size:12px;margin-top:4px">≈ ${signed(o.my_profit)} €</div>` : '<div class="muted" style="font-size:12px;margin-top:4px">нет прогноза</div>'}
      </div>
    </a>`).join('');
  app.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div class="logo">Доля</div>
        <a href="#/profile" aria-label="Профиль">${avatar(state.me.id, state.me.name, 'lg')}</a>
      </div>
      <div class="hero-label">Мои вложения</div>
      <div class="hero-num">${fmt(t.invested)} <span class="cur">€</span></div>
      <div class="muted" style="font-size:13px;margin-top:4px">${active.length} ${plural(active.length, 'объект', 'объекта', 'объектов')} в работе · ${t.partners} ${plural(t.partners, 'партнёр', 'партнёра', 'партнёров')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${active.some((o) => o.my_profit !== null) ? `<div class="chip">${I.trend}Прибыль ≈ ${signed(t.profit)} €</div>` : ''}
        ${history.length ? `<div class="chip" style="color:#8FC9A3">${I.check}Заработано ${signed(t.earned)} €</div>` : ''}
      </div>
      ${active.length ? `<a class="card" href="#/market" style="display:flex;align-items:center;gap:12px;margin-top:16px;padding-top:14px;padding-bottom:14px;color:var(--text);background:linear-gradient(135deg,#221E16,#17171A);border-color:#3A3324">
        <span class="gold" style="display:inline-flex;width:24px;height:24px">${I.deals}</span>
        <div style="flex:1;font-size:14px"><b style="font-weight:600">Доска объявлений</b> <span class="muted">· сделки и инвесторы</span></div>${I.chev}</a>` : `<a class="card" href="#/market" style="display:flex;align-items:center;gap:14px;margin-top:18px;color:var(--text);background:linear-gradient(135deg,#221E16,#17171A);border-color:#3A3324">
        <span class="gold" style="display:inline-flex;width:28px;height:28px">${I.deals}</span>
        <div style="flex:1"><div style="font-size:15px;font-weight:600">Хочу стать инвестором</div><div class="muted" style="font-size:12px;line-height:1.4;margin-top:2px">Есть деньги — найдите сделку. Есть объект — найдите инвестора.</div></div>${I.chev}</a>`}
      <div class="section-h"><h2>Объекты</h2><a class="pill" href="#/new">${I.plusSm}Объект</a></div>
      ${list || (history.length ? '<div class="card empty">Все сделки закрыты. Создайте новый объект.</div>' : `<div class="card empty">Пока нет объектов.<br>Создайте первый и пригласите партнёров по ссылке.<div style="margin-top:16px"><a class="btn sm" href="#/new" style="display:inline-flex">Создать объект</a></div></div>`)}
      ${history.length ? `<details class="fold" data-fold="home-history" style="margin-top:22px" ${foldOpen('home-history', true) ? 'open' : ''}>
        <summary><span class="chev" aria-hidden="true">${I.chev}</span><h2 style="font-size:17px;margin:0;flex:1">История сделок · ${history.length}</h2><span class="okc num" style="font-size:14px">${signed(t.earned)} €</span></summary>
        ${history.map(histRow).join('')}
      </details>` : ''}
    </div>
    ${tabbar('home')}`;
  bindFolds();
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function viewName() {
  const parts = String(state.me.name || '').trim().split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const forced = state.me.needs_name;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${forced ? '<div class="spacer44"></div>' : backBtn('#/profile')}<div class="spacer44"></div></div>
      <h1 class="h" style="margin-top:18px">Как вас зовут</h1>
      <div class="lead">Укажите имя и фамилию — они нужны для договора и видны партнёрам.</div>
      <form id="f" novalidate>
        <label class="label" for="fname">Имя</label><input class="field" id="fname" autocomplete="given-name" value="${esc(first)}">
        <label class="label" for="lname">Фамилия</label><input class="field" id="lname" autocomplete="family-name" value="${esc(last)}">
        <div class="err" id="err" role="alert"></div>
        <button class="btn" style="margin-top:12px">${forced ? 'Продолжить' : 'Сохранить'}</button>
      </form>
    </div>`;
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const d = await api('PATCH', '/api/me', { first_name: app.querySelector('#fname').value, last_name: app.querySelector('#lname').value });
      Object.assign(state.me, d.user);
      const inv = sessionStorage.getItem('invite');
      go(inv ? `#/join/${inv}` : forced ? '#/' : '#/profile');
    } catch (ex) { app.querySelector('#err').textContent = I18N.tr(ex.message); }
  };
}

async function viewContract(id) {
  const d = await api('GET', `/api/objects/${id}/contract`);
  const f = d.fields || {};
  const st = d.parties;
  const signed = st.filter((p) => p.signed_at).length;
  const allSigned = d.fixed && signed === st.length && st.length > 0;
  const meParty = st.find((p) => p.user_id === state.me.id);
  const iSigned = meParty && meParty.signed_at;
  const timeRu = (iso) => { const x = new Date(iso); return `${dateRu(iso.slice(0, 10))}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const fieldInput = (k, label, ph = '', type = 'text', mode = '') => `<label class="label" for="cf_${k}">${label}</label><input class="field" id="cf_${k}" type="${type}" ${mode ? `inputmode="${mode}"` : ''} value="${esc(f[k] ?? '')}" placeholder="${esc(ph)}">`;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${id}`)}<div class="title"><b>Договор дольщиков</b><small>Acord de investiție comună · RO</small></div><div class="spacer44"></div></div>

      <div class="card ${allSigned ? 'green' : d.fixed ? 'gold' : ''}" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b style="font-size:15px">${allSigned ? 'Подписан всеми сторонами' : d.fixed ? 'На подписи' : 'Черновик'}</b>
          ${d.fixed ? `<span class="num" style="font-size:13px">${signed} из ${st.length}</span>` : ''}
        </div>
        ${d.fixed ? `<div style="display:flex;gap:4px;margin-top:10px">${st.map((p) => `<i style="flex:1;height:4px;border-radius:2px;background:${p.signed_at ? 'var(--ok)' : 'var(--line2)'}"></i>`).join('')}</div>` : `<div class="muted" style="font-size:13px;line-height:1.45;margin-top:6px">${d.me.isCreator ? 'Заполните данные договора и отправьте его на подпись. Каждая сторона распишется в приложении.' : 'Создатель ещё не отправил договор на подпись. Пока заполните свои данные.'}</div>`}
        <div class="rows" style="margin-top:6px">${st.map((p) => `
          <div class="row" style="padding:10px 0">${avatar(p.user_id, p.name)}
            <div class="grow"><div class="t" style="font-size:14px">${esc(p.name)}${p.user_id === state.me.id ? ' <span class="muted" style="font-size:12px">(вы)</span>' : ''}</div>
              <div class="s">${ROLE[p.role]}${p.has_details || !d.personal_data ? '' : ' · <span class="red">нет IDNP или адреса</span>'}</div></div>
            ${p.signed_at ? `<span class="signed-pill">${I.check}Подписал · ${timeRu(p.signed_at)}</span>` : d.fixed ? '<span class="muted" style="font-size:12px">ждём подписи</span>' : ''}
          </div>`).join('')}</div>
        ${d.version && d.version.stale ? `<div class="warn">Условия объекта изменились после отправки договора на подпись (доли, суммы или данные).${d.me.isCreator ? ' Отправьте новую редакцию — подписи придётся поставить заново.' : ' Создатель может отправить новую редакцию.'}</div>` : ''}
        ${d.me.is_party && d.fixed && !iSigned ? `<button class="btn" id="sign" style="margin-top:14px">Подписать договор</button>` : ''}
        ${d.me.isCreator ? `<button class="btn ${d.fixed ? 'ghost' : ''}" id="fix" style="margin-top:10px">${d.fixed ? 'Отправить новую редакцию на подпись' : 'Отправить на подпись'}</button>` : ''}
      </div>

      ${!d.personal_data ? '<div class="card dashed" style="margin-top:12px;font-size:13px;line-height:1.5;color:#B5B5BA">IDNP и адреса сторон в приложении сейчас не собираются — в договоре для них оставлены пустые строки, их можно вписать от руки после печати.</div>' : ''}
      ${d.personal_data && (d.me.is_party || d.live_parties.some((p) => p.user_id === state.me.id)) ? `
      <details class="card fold" data-fold="c-mine" style="margin-top:12px" ${d.me.idnp && d.me.address ? (foldOpen('c-mine', false) ? 'open' : '') : 'open'}>
      <summary><div style="flex:1"><div style="font-weight:500">Мои данные для договора</div><div class="muted" style="font-size:12px;margin-top:2px">${d.me.idnp && d.me.address ? 'заполнено' : '<span class="red">нужно заполнить</span>'}</div></div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
      <form id="mine" novalidate>
        <label class="label" for="idnp" style="margin-top:0">IDNP</label>
        <input class="field" id="idnp" inputmode="numeric" maxlength="13" value="${esc(d.me.idnp)}" placeholder="13 цифр">
        <label class="label" for="addr">Адрес проживания (domiciliu)</label>
        <input class="field" id="addr" value="${esc(d.me.address)}" placeholder="Город, улица, дом, квартира">
        <button class="btn ghost sm" style="margin-top:12px;width:100%">Сохранить мои данные</button>
      </form></details>` : ''}

      ${d.me.isCreator ? `
      <details class="card fold" data-fold="c-fields-${id}" style="margin-top:10px" ${foldOpen('c-fields-' + id, !f.property_address) ? 'open' : ''}>
      <summary><div style="flex:1"><div style="font-weight:500">Данные договора</div><div class="muted" style="font-size:12px;margin-top:2px">${f.property_address && f.cadastral ? 'заполняет создатель · заполнено' : 'заполняет создатель · <span class="red">не всё заполнено</span>'}</div></div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
      <form id="cf" novalidate>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
          <div>${fieldInput('number', 'Номер договора', 'Напр. 1')}</div>
          <div>${fieldInput('city', 'Город', 'mun. Chișinău')}</div>
        </div>
        ${fieldInput('contract_date', 'Дата договора', '', 'date')}
        ${fieldInput('property_address', 'Адрес квартиры', 'Улица, дом, квартира')}
        ${fieldInput('cadastral', 'Кадастровый номер', '0100xxxxx.xx.xxx')}
        <label class="label" for="cf_owner">На кого оформлена квартира</label>
        <select class="field" id="cf_owner">
          <option value="">— указать вручную —</option>
          ${d.live_parties.map((p) => `<option value="${p.user_id}" ${Number(f.owner_user_id) === p.user_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <div id="ownerManual" style="${f.owner_user_id ? 'display:none' : ''}">${fieldInput('owner_name', 'ФИО владельца', 'Если не участник')}</div>
        ${d.installment ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px"><div>${fieldInput('installment_no', 'Договор рассрочки №')}</div><div>${fieldInput('installment_date', 'от', '', 'date')}</div></div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
          <div>${fieldInput('overrun_pct', 'Перерасход без согласия, %', '10', 'text', 'numeric')}</div>
          <div>${fieldInput('payout_days', 'Выплата после продажи, дней', '10', 'text', 'numeric')}</div>
        </div>
        <button class="btn ghost sm" style="margin-top:14px;width:100%">Сохранить данные договора</button>
      </form></details>` : ''}

      <details class="fold" data-fold="c-text" style="margin-top:18px" ${foldOpen('c-text', !iSigned) ? 'open' : ''}>
        <summary><span class="muted" style="font-size:13px;flex:1">Текст договора · Limba de stat</span><span class="chev" aria-hidden="true">${I.chev}</span></summary>
        <iframe id="doc" title="Acord de investiție comună" style="width:100%;height:70vh;border:0;border-radius:16px;background:#E9E7E1"></iframe>
      </details>
      <button class="btn ghost" id="print" style="margin-top:12px">Распечатать / PDF</button>
      <div class="muted" style="font-size:12px;line-height:1.45;margin-top:10px">Договор заполняется автоматически по данным объекта и участников. Это шаблон: перед подписанием покажите его юристу или нотариусу.</div>
    </div>`;
  bindFolds();
  const frame = app.querySelector('#doc');
  frame.srcdoc = d.html;
  app.querySelector('#print').onclick = async () => {
    if (TG) {
      try { const r = await api('POST', `/api/objects/${id}/contract-link`); openExternal(r.url); } catch (ex) { toast(ex.message); }
    } else {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { window.print(); }
    }
  };
  const mine = app.querySelector('#mine');
  if (mine) mine.onsubmit = async (e) => {
    e.preventDefault();
    try { await api('PATCH', '/api/me', { idnp: app.querySelector('#idnp').value, address: app.querySelector('#addr').value }); toast('Сохранено', true); viewContract(id); } catch (ex) { toast(ex.message); }
  };
  const cf = app.querySelector('#cf');
  if (cf) {
    const owner = app.querySelector('#cf_owner');
    owner.onchange = () => { app.querySelector('#ownerManual').style.display = owner.value ? 'none' : ''; };
    cf.onsubmit = async (e) => {
      e.preventDefault();
      const v = (k) => { const el = app.querySelector(`#cf_${k}`); return el ? el.value : ''; };
      try {
        await api('PUT', `/api/objects/${id}/contract-fields`, {
          number: v('number'), city: v('city'), contract_date: v('contract_date'), property_address: v('property_address'), cadastral: v('cadastral'),
          owner_user_id: owner.value || null, owner_name: owner.value ? '' : v('owner_name'), installment_no: v('installment_no'), installment_date: v('installment_date'),
          overrun_pct: v('overrun_pct'), payout_days: v('payout_days')
        });
        toast('Сохранено', true);
        viewContract(id);
      } catch (ex) { toast(ex.message); }
    };
  }
  const fix = app.querySelector('#fix');
  if (fix) fix.onclick = async () => {
    if (!ask(d.fixed ? 'Отправить новую редакцию? Все подписи придётся поставить заново.' : 'Отправить договор участникам на подпись? Текст зафиксируется в текущем виде.')) return;
    try { await api('POST', `/api/objects/${id}/contract/fix`); delete state.cache[id]; toast('Договор отправлен на подпись', true); viewContract(id); } catch (ex) { toast(ex.message); }
  };
  const sign = app.querySelector('#sign');
  if (sign) sign.onclick = () => {
    if (d.personal_data && (!d.me.idnp || !d.me.address)) { toast('Сначала заполните IDNP и адрес'); app.querySelector('#idnp').focus(); return; }
    openSignPad(async (png) => {
      await api('POST', `/api/objects/${id}/contract/sign`, { signature: png, agree: true, version_id: d.version.id });
      delete state.cache[id];
      toast('Договор подписан', true);
      viewContract(id);
    });
  };
}

// Подпись пальцем
function openSignPad(onDone, opts = {}) {
  const v = document.createElement('div');
  v.className = 'viewer sign-pad';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-label', 'Подпись');
  v.innerHTML = `
    <div class="top"><button class="icon-btn" data-close aria-label="Закрыть">${I.close}</button><div style="font-weight:600;text-align:center" ${opts.title ? 'data-nt' : ''}>${esc(opts.title || 'Ваша подпись')}</div><button class="link-btn" data-clear>Очистить</button></div>
    <div style="padding:0 16px"><div class="muted" style="font-size:13px;margin-bottom:10px">Распишитесь пальцем в рамке</div>
      <canvas aria-label="Поле для подписи"></canvas>
      <label class="agree"><input type="checkbox" data-agree> <span ${opts.agree ? 'data-nt' : ''}>${esc(opts.agree || 'Я прочитал договор и согласен с его условиями. Am citit Acordul și sunt de acord.')}</span></label>
      <button class="btn" data-ok disabled>Подписать</button></div>`;
  document.body.appendChild(v);
  const c = v.querySelector('canvas');
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.min(window.innerWidth - 32, 520);
  const h = Math.round(w * 0.45);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
  const ctx = c.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14213D';
  let drawing = false, strokes = 0, last = null;
  const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const ok = v.querySelector('[data-ok]');
  const agree = v.querySelector('[data-agree]');
  const update = () => { ok.disabled = !(strokes > 0 && agree.checked); };
  c.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
  c.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; e.preventDefault();
  });
  const end = () => { if (drawing) { drawing = false; strokes++; update(); } };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  agree.addEventListener('change', update);
  v.querySelector('[data-clear]').onclick = () => { ctx.clearRect(0, 0, c.width, c.height); strokes = 0; update(); };
  v.querySelector('[data-close]').onclick = () => v.remove();
  ok.onclick = async () => {
    ok.disabled = true;
    try { await onDone(c.toDataURL('image/png')); v.remove(); } catch (ex) { toast(ex.message); update(); }
  };
}

function viewProfile() {
  app.innerHTML = `
    <div class="screen">
      <div class="topbar">${backBtn('#/')}<div class="spacer44"></div></div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:20px">${avatar(state.me.id, state.me.name, 'lg')}
        <div style="flex:1"><div style="font-size:17px;font-weight:600">${esc(state.me.name)}</div><div class="muted" style="font-size:13px">${esc(state.me.email || (state.me.tg_username ? '@' + state.me.tg_username : 'вход через Telegram'))}</div></div></div>
      <a class="pill" href="#/name" style="margin-top:14px">Изменить имя</a>
      <div class="label">Язык</div>
      ${langSwitch()}
      ${state.settings.personal_data ? `
      <details class="card fold" data-fold="p-data" style="margin-top:20px" ${foldOpen('p-data', !(state.me.idnp || state.me.phone)) ? 'open' : ''}>
      <summary><div style="flex:1"><div style="font-weight:500">Мои данные</div><div class="muted" style="font-size:12px;margin-top:2px">Телефон, дата рождения, IDNP, адрес</div></div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
      <form id="pd" novalidate>
        <label class="label" for="pd_phone" style="margin-top:0">Телефон</label>
        <input class="field" id="pd_phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(state.me.phone)}" placeholder="+373 …">
        <label class="label" for="pd_birth">Дата рождения</label>
        <input class="field" id="pd_birth" type="date" value="${esc(state.me.birth_date)}">
        <label class="label" for="pd_idnp">IDNP</label>
        <input class="field" id="pd_idnp" inputmode="numeric" maxlength="13" value="${esc(state.me.idnp)}" placeholder="13 цифр">
        <label class="label" for="pd_addr">Адрес проживания (domiciliu)</label>
        <input class="field" id="pd_addr" autocomplete="street-address" value="${esc(state.me.address)}" placeholder="Город, улица, дом, квартира">
        <div class="muted" style="font-size:12px;line-height:1.45;margin-top:10px">Заполните один раз — данные автоматически подставятся во все ваши договоры, в том числе по будущим объектам. Видны только участникам ваших объектов.</div>
        <button class="btn ghost sm" style="margin-top:12px;width:100%">Сохранить мои данные</button>
      </form></details>` : ''}
      ${state.me.is_admin ? `
      <div class="label">Администрирование</div>
      <a class="card" href="#/admin/users" id="adm-stats" style="display:flex;align-items:center;gap:12px;margin-bottom:10px;color:var(--text)">
        <div style="flex:1"><div class="muted" style="font-size:12px">Пользователи</div><div class="display num" style="font-size:22px;font-weight:600;margin-top:2px" id="adm-total">…</div><div class="muted" style="font-size:12px;margin-top:2px" id="adm-sub"></div></div>${I.chev}</a>
      <div class="card">
        <div style="font-size:15px;font-weight:500">Ввод личных данных</div>
        <div class="muted" style="font-size:12px;line-height:1.45;margin-top:4px">Телефон, дата рождения, IDNP и адрес. Когда выключено, поля скрыты у всех, договор подписывается без них, а в тексте остаются пустые строки, чтобы вписать от руки.</div>
        <div class="seg" style="grid-template-columns:1fr 1fr;margin-top:12px"><button type="button" data-pd="0" class="${state.settings.personal_data ? '' : 'on'}">Выключен</button><button type="button" data-pd="1" class="${state.settings.personal_data ? 'on' : ''}">Включён</button></div>
      </div>` : ''}
      <details class="card fold" data-fold="p-help" style="margin-top:10px" ${foldOpen('p-help', false) ? 'open' : ''}>
        <summary><div style="flex:1;font-weight:500">Как это работает</div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
        <div style="font-size:14px;line-height:1.55;color:#B5B5BA">Вы видите все операции по своим объектам, но вносите только свои. Доли ставит создатель объекта, удалить объект можно только с согласия всех участников сделки. Для защиты от мошенничества администратор Доли может просматривать сделки (без права что-либо менять).</div>
        <div style="font-size:14px;line-height:1.55;color:#B5B5BA;margin-top:10px">Совет: добавьте «Долю» на экран телефона. На iPhone — «Поделиться» → «На экран Домой», на Android — меню браузера → «Установить приложение».</div>
      </details>
      ${state.bot ? (state.me.telegram
        ? `<div class="card" style="margin-top:10px;display:flex;align-items:center;gap:10px;font-size:14px"><span class="gold" style="display:inline-flex">${I.check}</span>Telegram подключён${state.me.tg_username ? ` · @${esc(state.me.tg_username)}` : ''}. Уведомления приходят в бот.</div>`
        : `<div class="card" style="margin-top:10px;font-size:14px;line-height:1.5;color:#B5B5BA">Подключите Telegram, чтобы получать уведомления о расходах, долях и удалении и входить в Долю прямо из бота.<button class="btn sm" id="tglink" style="margin-top:12px;display:flex">Подключить Telegram</button></div>`) : ''}
      ${TG ? '' : '<button class="btn ghost" id="out" style="margin-top:24px">Выйти</button>'}
    </div>
    ${tabbar('profile')}`;
  bindLang();
  bindFolds();
  const pd = app.querySelector('#pd');
  if (pd) pd.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('PATCH', '/api/me', { phone: app.querySelector('#pd_phone').value, birth_date: app.querySelector('#pd_birth').value, idnp: app.querySelector('#pd_idnp').value, address: app.querySelector('#pd_addr').value });
      Object.assign(state.me, r.user);
      toast('Сохранено', true);
    } catch (ex) { toast(ex.message); }
  };
  if (state.me.is_admin) api('GET', '/api/admin/stats').then((st) => {
    const t = app.querySelector('#adm-total'); if (!t) return;
    t.textContent = st.users_total;
    app.querySelector('#adm-sub').textContent = `${I18N.tr('за 7 дней:')} +${st.users_new_7} · ${I18N.tr('активны')} ${st.users_active_7} · ${I18N.tr('в боте')} ${st.bot_total}`;
  }).catch(() => {});
  on('[data-pd]', 'click', async (e) => {
    const onState = e.currentTarget.dataset.pd === '1';
    try {
      const r = await api('PUT', '/api/admin/settings', { personal_data: onState });
      state.settings = r.settings;
      toast(onState ? 'Ввод личных данных включён' : 'Ввод личных данных выключен', true);
      viewProfile();
    } catch (ex) { toast(ex.message); }
  });
  const out = app.querySelector('#out');
  if (out) out.onclick = async () => {
    await api('POST', '/api/logout');
    sessionToken.set('');
    state.me = null;
    go('#/login');
  };
  const link = app.querySelector('#tglink');
  if (link) link.onclick = async () => {
    try { const r = await api('POST', '/api/tg-link'); openExternal(r.url); } catch (ex) { toast(ex.message); }
  };
}

async function viewObjectForm(id) {
  let o = { name: '', area: '', status: 'покупка', purchase_price: '', sale_price: '', photo: null, installment: null, installment_monthly: '', repair_budget: '' };
  const ph = { data: null, preview: null, remove: false };
  if (id) {
    const d = await api('GET', `/api/objects/${id}`);
    if (!d.me.isCreator) { toast('Редактировать может только создатель'); return go(`#/o/${id}`); }
    o = d.object;
  }
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(id ? `#/o/${id}` : '#/')}<div class="title"><b>${id ? 'Объект' : 'Новый объект'}</b></div><div class="spacer44"></div></div>
      <form id="f">
        <div class="cover-pick" id="cover" style="${o.photo ? `background-image:url('${o.photo}')` : ''}">
          <label class="cover-btn">${I.camera}<span id="coverTxt">${o.photo ? 'Заменить фото' : 'Добавить фото объекта'}</span>
            <input type="file" accept="image/*" id="coverIn" aria-label="Фото объекта"></label>
          <button type="button" class="cover-rm" id="coverRm" aria-label="Убрать фото" style="${o.photo ? '' : 'display:none'}">${I.close}</button>
        </div>
        <label class="label" for="name">Название</label>
        <input class="field" id="name" placeholder="Например: Ботаника, 2 комн." value="${esc(o.name)}" required>
        <label class="label" for="area">Площадь, м²</label>
        <input class="field" id="area" inputmode="decimal" value="${esc(o.area ?? '')}">
        <label class="label" for="buy">Стоимость покупки, €</label>
        <input class="field" id="buy" inputmode="decimal" value="${esc(o.purchase_price ?? '')}" placeholder="Цена квартиры по договору">
        <span class="label">Ремонт</span>
        <div class="seg" style="grid-template-columns:1fr 1fr"><button type="button" data-rep="0" class="${o.repair_budget ? '' : 'on'}">Без ремонта</button><button type="button" data-rep="1" class="${o.repair_budget ? 'on' : ''}">Будет ремонт</button></div>
        <div id="repBox" style="${o.repair_budget ? '' : 'display:none'}">
          <label class="label" for="repair">Примерная стоимость ремонта, €</label>
          <input class="field" id="repair" inputmode="decimal" value="${esc(o.repair_budget ?? '')}" placeholder="Например: 12000">
          <div class="muted" style="font-size:12px;margin-top:6px;line-height:1.45">Это план по ремонту. Фактические расходы на ремонт сравниваются с ним, перерасход подсвечивается.</div>
        </div>
        <span class="label">Как покупаем</span>
        <div class="seg" style="grid-template-columns:1fr 1fr"><button type="button" data-inst="0" class="${o.installment ? '' : 'on'}">Сразу</button><button type="button" data-inst="1" class="${o.installment ? 'on' : ''}">В рассрочку</button></div>
        <div id="instBox" style="${o.installment ? '' : 'display:none'}">
          <label class="label" for="monthly">Ежемесячный платёж, €</label>
          <input class="field" id="monthly" inputmode="decimal" value="${esc(o.installment_monthly ?? '')}" placeholder="Необязательно — для расчёта, сколько платежей осталось">
          <div class="muted" style="font-size:12px;margin-top:6px;line-height:1.45">«Стоимость покупки» — полная сумма по договору рассрочки. Каждый платёж вносите как расход в категории «Покупка» — приложение покажет, сколько выплачено и сколько осталось.</div>
        </div>
        <label class="label" for="status">Статус</label>
        <select class="field" id="status">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <label class="label" for="sale">Ориентировочная цена продажи, €</label>
        <input class="field" id="sale" inputmode="decimal" value="${esc(o.sale_price ?? '')}" placeholder="Можно указать позже">
        ${id ? '' : '<div class="card gold" style="margin-top:20px;font-size:13px;line-height:1.5">Вы станете создателем: будете ставить доли, приглашать участников и управлять удалением.</div>'}
        <button class="btn" style="margin-top:24px">${id ? 'Сохранить' : 'Создать объект'}</button>
      </form>
    </div>`;
  let rep = !!o.repair_budget;
  on('[data-rep]', 'click', (e) => {
    rep = e.currentTarget.dataset.rep === '1';
    app.querySelectorAll('[data-rep]').forEach((b) => b.classList.toggle('on', (b.dataset.rep === '1') === rep));
    app.querySelector('#repBox').style.display = rep ? '' : 'none';
    if (rep) app.querySelector('#repair').focus();
  });
  let inst = !!o.installment;
  on('[data-inst]', 'click', (e) => {
    inst = e.currentTarget.dataset.inst === '1';
    app.querySelectorAll('[data-inst]').forEach((b) => b.classList.toggle('on', (b.dataset.inst === '1') === inst));
    app.querySelector('#instBox').style.display = inst ? '' : 'none';
  });
  const cover = app.querySelector('#cover');
  app.querySelector('#coverIn').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const p = await compressImage(f, 1400, 0.8);
      ph.data = p; ph.remove = false;
      cover.style.backgroundImage = `url('${p.preview}')`;
      app.querySelector('#coverRm').style.display = '';
      app.querySelector('#coverTxt').textContent = 'Заменить фото';
    } catch (ex) { toast(ex.message); }
  };
  app.querySelector('#coverRm').onclick = () => {
    ph.data = null; ph.remove = true;
    cover.style.backgroundImage = '';
    app.querySelector('#coverRm').style.display = 'none';
    app.querySelector('#coverTxt').textContent = 'Добавить фото объекта';
  };
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = app.querySelector('#f .btn');
    btn.disabled = true;
    const body = {
      photo: ph.data ? { mime: ph.data.mime, data: ph.data.data } : undefined,
      remove_photo: ph.remove || undefined,
      name: app.querySelector('#name').value,
      area: app.querySelector('#area').value.replace(',', '.'),
      status: app.querySelector('#status').value,
      purchase_price: app.querySelector('#buy').value.replace(/\s/g, '').replace(',', '.'),
      sale_price: app.querySelector('#sale').value.replace(/\s/g, '').replace(',', '.'),
      installment: inst,
      repair_budget: rep ? app.querySelector('#repair').value.replace(/\s/g, '').replace(',', '.') : '',
      installment_monthly: app.querySelector('#monthly').value.replace(/\s/g, '').replace(',', '.')
    };
    try {
      if (id) { await api('PATCH', `/api/objects/${id}`, body); go(`#/o/${id}`); }
      else { const r = await api('POST', '/api/objects', body); go(`#/o/${r.id}`); }
    } catch (ex) { toast(ex.message); btn.disabled = false; }
  };
}

function memberLine(m) {
  if (m.role === 'investor') return `${money(m.invested)} · ${pct(m.share_pct)}`;
  if (m.role === 'foreman') {
    const share = m.foreman_mode === 'pct' ? `${pct(m.foreman_value)} прибыли` : m.foreman_mode === 'fix' ? money(m.foreman_value) : 'без доли';
    return `<span style="color:var(--green)">${share}</span>`;
  }
  return '<span class="muted">просмотр</span>';
}

// Срок аванса: сколько дней осталось
const daysLabel = (n) => n < 0 ? `срок истёк ${Math.abs(n)} ${plural(Math.abs(n), 'день', 'дня', 'дней')} назад` : n === 0 ? 'истекает сегодня' : `осталось ${n} ${plural(n, 'день', 'дня', 'дней')}`;
const daysClass = (n) => (n < 0 ? 'red' : n <= 3 ? 'red' : n <= 7 ? 'gold' : 'okc');
const ADV_STATUS = { applied: 'зачтён в цену продажи', kept: 'остался у нас · в прибыль', returned: 'возвращён покупателю' };

function advanceBlock(d, id) {
  const list = d.advances || [];
  const active = list.filter((a) => a.status === 'active');
  const closed = list.filter((a) => a.status !== 'active');
  const canAdd = d.me.role === 'investor';
  const activeCards = active.map((a) => `
    <div class="card adv ${a.days_left < 0 ? 'expired' : ''}" style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="muted" style="font-size:13px">Аванс от покупателя${a.buyer ? ` · ${esc(a.buyer)}` : ''}</span><span class="${daysClass(a.days_left)}" style="font-size:12px;font-weight:600">${daysLabel(a.days_left)}</span></div>
      <div class="display num" style="font-weight:600;font-size:26px;margin-top:6px">${money(a.amount)}</div>
      <div class="muted" style="font-size:12px;margin-top:4px">Получил ${esc(a.author)} · ${dateRu(a.received_date)} · действует до <b style="color:var(--text)">${dateRu(a.valid_until)}</b></div>
      ${a.note ? `<div class="muted" style="font-size:12px;margin-top:4px">«${esc(a.note)}»</div>` : ''}
      <a class="btn ghost sm" href="#/adv/${a.id}" style="margin-top:12px;width:100%">Договор аванса · RO / RU</a>
      ${a.days_left < 0 ? '<div class="warn">Срок аванса истёк. Отметьте, что с ним: сделка состоялась, аванс остаётся у вас или его вернули.</div>' : ''}
      ${a.can_close ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        <button class="btn sm" data-adv="${a.id}" data-st="applied" style="width:100%">Сделка состоялась</button>
        <div class="btn-row" style="margin-top:0"><button class="btn ghost sm" data-adv="${a.id}" data-st="kept" style="flex:1">Покупатель отказался — аванс наш</button></div>
        <button class="link-btn" data-adv="${a.id}" data-st="returned" style="color:var(--muted)">Вернули покупателю</button></div>` : ''}
    </div>`).join('');
  const history = closed.length ? `<details class="card fold" data-fold="adv-${id}" style="margin-top:10px" ${foldOpen('adv-' + id, false) ? 'open' : ''}>
      <summary><div style="flex:1"><div class="muted" style="font-size:13px">История авансов · ${closed.length}</div>${d.calc.advanceKept ? `<div style="font-size:13px;margin-top:2px">в прибыль: <b class="okc num">+${fmt(d.calc.advanceKept)}\u00A0€</b></div>` : ''}</div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
      <div class="rows">${closed.map((a) => `<a class="row" href="#/adv/${a.id}" style="padding:9px 0;color:var(--text)"><div class="grow"><div class="t" style="font-size:14px">${money(a.amount)}${a.buyer ? ` · ${esc(a.buyer)}` : ''}</div><div class="s">${dateRu(a.received_date)} · ${ADV_STATUS[a.status]}</div></div>${a.status === 'kept' ? `<span class="okc num" style="font-size:13px">+${fmt(a.amount)}\u00A0€</span>` : ''}</a>`).join('')}</div></details>` : '';
  const addBtn = canAdd && !active.length ? `<a class="btn ghost sm" href="#/o/${id}/advance" style="margin-top:10px;width:100%">${I.plusSm}Аванс от покупателя</a>` : '';
  return activeCards + history + addBtn;
}

// Данные покупателя для договора аванса
function advDetailsForm(a, open = false) {
  return `<details class="card fold" data-fold="adv-form" style="margin-top:16px" ${open || foldOpen('adv-form', false) ? 'open' : ''}>
    <summary><div style="flex:1"><div style="font-weight:500">Данные для договора аванса</div><div class="muted" style="font-size:12px;margin-top:2px">Покупатель, цена, условия · можно заполнить позже</div></div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
    <label class="label" for="b_idnp" style="margin-top:0">IDNP покупателя</label><input class="field" id="b_idnp" inputmode="numeric" maxlength="13" value="${esc(a.buyer_idnp || '')}">
    <label class="label" for="b_addr">Адрес покупателя</label><input class="field" id="b_addr" value="${esc(a.buyer_address || '')}" placeholder="Город, улица, дом, квартира">
    <label class="label" for="b_phone">Телефон покупателя</label><input class="field" id="b_phone" type="tel" inputmode="tel" value="${esc(a.buyer_phone || '')}" placeholder="+373 …">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
      <div><label class="label" for="b_price">Цена продажи, €</label><input class="field" id="b_price" inputmode="decimal" value="${esc(a.sale_price ?? '')}"></div>
      <div><label class="label" for="b_city">Город</label><input class="field" id="b_city" value="${esc(a.city || '')}" placeholder="mun. Chișinău"></div>
    </div>
    <span class="label">Если продавец откажется, вернуть аванс</span>
    <div class="seg" style="grid-template-columns:1fr 1fr"><button type="button" data-ret="double" class="${a.return_mode !== 'single' ? 'on' : ''}">В двойном размере</button><button type="button" data-ret="single" class="${a.return_mode === 'single' ? 'on' : ''}">В том же размере</button></div>
  </details>`;
}
function advDetailsValues() {
  const v = (s) => (app.querySelector(s) ? app.querySelector(s).value : '');
  const ret = app.querySelector('[data-ret].on');
  return { buyer_idnp: v('#b_idnp'), buyer_address: v('#b_addr'), buyer_phone: v('#b_phone'), sale_price: v('#b_price').replace(/\s/g, '').replace(',', '.'), city: v('#b_city'), return_mode: ret ? ret.dataset.ret : 'double' };
}
function bindAdvDetails() {
  on('[data-ret]', 'click', (e) => app.querySelectorAll('[data-ret]').forEach((b) => b.classList.toggle('on', b === e.currentTarget)));
}

async function viewAdvContract(aid) {
  const d = await api('GET', `/api/advances/${aid}`);
  const a = d.advance;
  const sig = d.signatures;
  const both = sig.seller && sig.buyer;
  const timeRu = (iso) => { const x = new Date(iso); return `${dateRu(x.toISOString().slice(0, 10))}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const line = (label, name, s) => `<div class="row" style="padding:10px 0"><div class="grow"><div class="muted" style="font-size:12px">${label}</div><div class="t" style="font-size:14px">${esc(name || '—')}</div></div>${s ? `<span class="signed-pill">${I.check}Подписал · ${timeRu(s.signed_at)}</span>` : '<span class="muted" style="font-size:12px">ждём подписи</span>'}</div>`;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${a.object_id}`)}<div class="title"><b>Договор аванса</b><small>Contract de arvună · RO / RU</small></div><div class="spacer44"></div></div>
      <div class="card ${both ? 'green' : 'gold'}" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:15px">${both ? 'Подписан обеими сторонами' : 'Подписи'}</b><span class="num" style="font-size:13px">${money(a.amount)}</span></div>
        <div class="rows" style="margin-top:6px">${line('Продавец', a.seller, sig.seller)}${line('Покупатель', a.buyer, sig.buyer)}</div>
        ${d.can_sign_seller ? '<button class="btn" id="sgSeller" style="margin-top:12px">Подписать как продавец</button>' : ''}
        ${d.can_collect_buyer ? `<button class="btn ${d.can_sign_seller ? 'ghost' : ''}" id="sgBuyer" style="margin-top:10px">Дать подписать покупателю</button>` : ''}
        ${d.can_collect_buyer && !a.buyer ? '<div class="muted" style="font-size:12px;margin-top:8px">Сначала укажите имя покупателя ниже.</div>' : ''}
      </div>
      ${d.can_edit ? `<form id="advf" novalidate>
        <label class="label" for="buyer">Покупатель</label><input class="field" id="buyer" value="${esc(a.buyer || '')}" placeholder="Имя и фамилия покупателя">
        <label class="label" for="until">Действует до</label><input class="field" id="until" type="date" value="${esc(a.valid_until)}">
        ${advDetailsForm(a, !a.buyer_idnp)}
        <button class="btn ghost sm" style="margin-top:12px;width:100%">Сохранить данные</button></form>` : '<div class="muted" style="font-size:12px;margin-top:12px">После первой подписи данные договора менять нельзя.</div>'}
      <details class="fold" data-fold="adv-text" style="margin-top:18px" open>
        <summary><span class="muted" style="font-size:13px;flex:1">Текст договора · Limba de stat / Русский</span><span class="chev" aria-hidden="true">${I.chev}</span></summary>
        <iframe id="doc" title="Contract de arvună" style="width:100%;height:70vh;border:0;border-radius:16px;background:#E9E7E1"></iframe>
      </details>
      <div class="btn-row"><button class="btn ghost" id="print" style="flex:1">Распечатать / PDF</button><button class="btn ghost" id="shareBuyer" style="flex:1">Ссылка покупателю</button></div>
      <div class="muted" style="font-size:12px;line-height:1.45;margin-top:10px">Договор на двух языках: слева румынский, справа русский. Покупатель расписывается пальцем на вашем телефоне или получает ссылку на договор. Это шаблон — при необходимости покажите его юристу или нотариусу.</div>
    </div>`;
  bindFolds();
  bindAdvDetails();
  const frame = app.querySelector('#doc');
  frame.srcdoc = d.html;
  const link = async () => (await api('POST', `/api/advances/${aid}/contract-link`)).url;
  app.querySelector('#print').onclick = async () => {
    if (TG) { try { openExternal(await link()); } catch (ex) { toast(ex.message); } }
    else { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { window.print(); } }
  };
  app.querySelector('#shareBuyer').onclick = async () => {
    try {
      const url = await link();
      const text = `Contract de arvună / Договор задатка — ${a.buyer || ''}`;
      if (TG) openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      else if (navigator.share) navigator.share({ title: text, url }).catch(() => {});
      else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована', true); }
    } catch (ex) { toast(ex.message); }
  };
  const f = app.querySelector('#advf');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api('PATCH', `/api/advances/${aid}`, { buyer: app.querySelector('#buyer').value, valid_until: app.querySelector('#until').value, ...advDetailsValues() }); toast('Сохранено', true); viewAdvContract(aid); } catch (ex) { toast(ex.message); }
  };
  const sign = (party) => openSignPad(async (png) => {
    await api('POST', `/api/advances/${aid}/sign`, { party, signature: png, agree: true });
    delete state.cache[a.object_id];
    toast('Подписано', true);
    viewAdvContract(aid);
  }, party === 'buyer'
    ? { title: `Semnătura cumpărătorului / Подпись покупателя: ${a.buyer || ''}`, agree: 'Am citit contractul și sunt de acord cu condițiile lui. / Я прочитал договор и согласен с его условиями.' }
    : { agree: 'Я прочитал договор и согласен с его условиями. / Am citit contractul și sunt de acord.' });
  const ss = app.querySelector('#sgSeller');
  if (ss) ss.onclick = () => sign('seller');
  const sb = app.querySelector('#sgBuyer');
  if (sb) sb.onclick = () => { if (!a.buyer) { toast('Укажите имя покупателя'); return; } sign('buyer'); };
}

async function viewAdvance(id) {
  const d = state.cache[id] || (await api('GET', `/api/objects/${id}`));
  const plusDays = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return new Date(x - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${id}`, 'Закрыть')}<div class="title"><b>Аванс от покупателя</b><small>${esc(d.object.name)}</small></div><div class="spacer44"></div></div>
      <div style="text-align:center;margin-top:22px">
        <label for="amt" class="muted" style="font-size:13px">Сумма аванса, €</label>
        <input id="amt" class="amount-input" inputmode="decimal" placeholder="0" autocomplete="off">
      </div>
      <span class="label">Кто получил</span>
      <div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 14px">${avatar(state.me.id, state.me.name)}
        <div style="flex:1"><div style="font-weight:500">${esc(state.me.name)} <span class="muted" style="font-weight:400">· вы</span></div><div class="muted" style="font-size:12px;margin-top:2px">Деньги у вас на руках — это будет видно партнёрам</div></div></div>
      <label class="label" for="buyer">Покупатель</label>
      <input class="field" id="buyer" placeholder="Имя покупателя (необязательно)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
        <div><label class="label" for="rec">Дата получения</label><input class="field" id="rec" type="date" value="${today()}"></div>
        <div><label class="label" for="until">Действует до</label><input class="field" id="until" type="date" value="${plusDays(14)}"></div>
      </div>
      <div class="chips" style="margin-top:10px">${[7, 14, 30, 60].map((n) => `<button data-days="${n}">${n} дней</button>`).join('')}</div>
      <label class="label" for="note">Комментарий</label>
      <input class="field" id="note" placeholder="Например: до подписания у нотариуса">
      ${advDetailsForm({ sale_price: d.object.sale_price, city: '' })}
      <div class="muted" style="font-size:12px;line-height:1.45;margin-top:12px">Если покупатель откажется и аванс останется у вас, он пойдёт в прибыль и разделится по долям. Если сделка состоится — аванс зачтётся в цену продажи.</div>
      <button class="btn" id="save" style="margin-top:24px">Сохранить</button>
    </div>`;
  bindFolds();
  bindAdvDetails();
  on('[data-days]', 'click', (e) => {
    const base = new Date(app.querySelector('#rec').value || today());
    base.setDate(base.getDate() + Number(e.currentTarget.dataset.days));
    app.querySelector('#until').value = base.toISOString().slice(0, 10);
  });
  app.querySelector('#save').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api('POST', `/api/objects/${id}/advances`, {
        amount: app.querySelector('#amt').value.replace(/\s/g, '').replace(',', '.'),
        buyer: app.querySelector('#buyer').value, received_date: app.querySelector('#rec').value,
        valid_until: app.querySelector('#until').value, note: app.querySelector('#note').value, ...advDetailsValues()
      });
      delete state.cache[id];
      toast('Аванс сохранён', true);
      go(`#/o/${id}`);
    } catch (ex) { toast(ex.message); e.currentTarget.disabled = false; }
  };
}

async function viewObject(id, filter = 'all') {
  const d = await api('GET', `/api/objects/${id}`);
  state.cache[id] = d;
  const { object: o, calc: c, me } = d;
  const meName = (m) => esc(m.name) + (m.user_id === me.user_id ? ' <span class="muted" style="font-size:12px">(вы)</span>' : '');
  const filters = [['all', 'Все'], ['out', 'Расходы'], ...(d.entries.some((e) => e.kind === 'rent') ? [['rent', 'Аренда']] : []), ...(d.entries.some((e) => e.kind === 'in') ? [['in', 'Взносы']] : [])];
  const entries = d.entries.filter((e) => filter === 'all' || e.kind === filter);
  const entryRow = (e) => {
    const title = e.note || e.category || KIND[e.kind];
    const sub = [e.kind === 'plan' ? 'план' : e.kind === 'in' ? 'взнос' : e.kind === 'rent' ? 'аренда' : null, e.kind === 'out' && e.note ? e.category : null, dateRu(e.entry_date)].filter(Boolean).join(' · ');
    const amt = (e.kind === 'in' ? `<span class="gold">+${fmt(e.amount)}\u00A0€</span>` : e.kind === 'rent' ? `<span class="okc">+${fmt(e.amount)}\u00A0€</span>` : e.kind === 'out' ? `−${fmt(e.amount)}\u00A0€` : `<span class="muted">${fmt(e.amount)}\u00A0€</span>`)
      + (e.orig_currency === 'MDL' ? `<div class="muted" style="font-size:11px">${fmt(e.orig_amount)} lei</div>` : '');
    return `<a class="row" href="#/e/${e.id}">${avatar(e.user_id, e.author)}
      <div class="grow"><div class="t" style="font-size:14px">${esc(title)}</div>
      <div class="s">${esc(sub)}${e.receipts ? ` · <span class="gold" style="display:inline-flex;align-items:center;gap:3px">${I.receipt}${e.receipts}</span>` : ''}</div>
      ${e.delete_pending ? `<div style="margin-top:4px"><span class="badge red">${e.need_my_vote ? 'удаление · нужен ваш ответ' : 'на удалении'}</span></div>` : ''}
      ${e.edit_pending ? `<div style="margin-top:4px"><span class="badge gold">${e.need_my_edit_vote ? 'исправление · нужен ваш ответ' : 'исправление на согласовании'}</span></div>` : ''}</div>
      <div class="r num" style="font-size:14px">${amt}</div></a>`;
  };
  app.innerHTML = `
    <div class="screen">
      <div class="topbar">${backBtn(me.adminView ? '#/admin/objects' : '#/')}
        <div style="display:flex;gap:8px">
          ${me.isCreator ? `<a class="icon-btn" href="#/o/${id}/edit" aria-label="Редактировать объект"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></a>` : ''}
          <a class="icon-btn ${o.contract && o.contract.all_signed ? 'ok' : o.contract && o.contract.fixed ? 'pending' : ''}" href="#/o/${id}/contract" aria-label="Договор дольщиков">${o.contract && o.contract.fixed ? `<span class="dot-badge">${o.contract.all_signed ? '✓' : `${o.contract.signed}/${o.contract.total}`}</span>` : ''}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg></a>
          <a class="icon-btn" href="#/o/${id}/delete" aria-label="Удаление и выгрузка">${I.more}</a>
        </div>
      </div>
      ${o.photo ? `<div class="hero-photo" style="background-image:url('${o.photo}')"></div>` : me.isCreator ? `<a class="hero-photo empty" href="#/o/${id}/edit">${I.camera}<span>Добавить фото объекта</span></a>` : ''}
      <div class="h-sub" style="margin-top:18px">${o.area ? `${fmt(o.area)} м² · ` : ''}${esc(o.status)}${o.purchase_price ? (o.installment ? ` · в рассрочку за ${money(o.purchase_price)}` : ` · куплена за ${money(o.purchase_price)}`) : ''}</div>
      <h1 class="h">${esc(o.name)}</h1>
      ${me.adminView ? `<div class="warn" style="display:flex;gap:10px;align-items:center"><span style="display:inline-flex;width:20px;height:20px;flex:none">${I.shield}</span><span>Режим администратора: только просмотр. Вы не участник этой сделки, изменить ничего нельзя.</span></div>` : ''}
      ${(() => { const w = d.entries.filter((e) => e.need_my_vote || e.need_my_edit_vote); return w.length ? `<a class="card gold" href="#/e/${w[0].id}" style="display:block;margin-top:14px;font-size:14px">${w.length === 1 ? 'Операция ждёт' : `${w.length} ${plural(w.length, 'операция ждёт', 'операции ждут', 'операций ждут')}`} вашего ответа: удаление или исправление →</a>` : ''; })()}
      ${o.delete_requested ? `<a class="card gold" href="#/o/${id}/delete" style="display:block;margin-top:14px;font-size:14px">Создатель запросил удаление объекта. ${me.canVote ? 'Нужен ваш ответ →' : 'Идёт голосование →'}</a>` : ''}
      ${o.installment ? (() => {
        const ins = o.installment;
        return `<details class="card fold" data-fold="inst" style="margin-top:16px" ${foldOpen('inst', false) ? 'open' : ''}>
          <summary><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="muted" style="font-size:13px">Рассрочка</span><span style="font-size:13px">осталось <b class="num">${money(ins.left)}</b></span></div>
          <div class="bar" style="height:6px;margin-top:10px"><i style="width:${ins.pct}%"></i></div></div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px">
            <div><div class="muted" style="font-size:11px">Выплачено</div><div class="display num gold" style="font-weight:600;font-size:16px;margin-top:4px">${fmt(ins.paid)}</div></div>
            <div><div class="muted" style="font-size:11px">Осталось</div><div class="display num" style="font-weight:600;font-size:16px;margin-top:4px">${fmt(ins.left)}</div></div>
            <div><div class="muted" style="font-size:11px">Всего</div><div class="display num" style="font-weight:600;font-size:16px;margin-top:4px">${fmt(ins.total)}</div></div>
          </div>
          ${ins.total ? '' : '<div class="red" style="font-size:12px;margin-top:8px">Укажите стоимость покупки в настройках объекта</div>'}
          ${ins.payments_left !== null && ins.left > 0 ? `<div class="muted" style="font-size:12px;margin-top:8px">≈ ${ins.payments_left} ${plural(ins.payments_left, 'платёж', 'платежа', 'платежей')} по ${money(ins.monthly)}</div>` : ''}
          ${ins.left <= 0 && ins.total ? '<div class="gold" style="font-size:13px;margin-top:8px">Рассрочка полностью выплачена</div>' : ''}
          ${me.canAdd && me.role !== 'foreman' && ins.left > 0 ? `<a class="btn sm" href="#/o/${id}/add/pay" style="margin-top:12px;width:100%">Внести платёж</a>` : ''}
        </details>`;
      })() : ''}
      ${o.repair ? (() => {
        const rp = o.repair;
        const over = rp.budget > 0 && rp.spent > rp.budget;
        return `<details class="card fold" data-fold="repair" style="margin-top:10px" ${foldOpen('repair', false) ? 'open' : ''}>
          <summary><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="muted" style="font-size:13px">Ремонт</span><span style="font-size:13px" class="${over ? 'red' : ''}">${over ? 'перерасход' : rp.budget > 0 ? 'осталось' : 'потрачено'} <b class="num">${money(over ? -rp.left : rp.budget > 0 ? rp.left : rp.spent)}</b></span></div>
          <div class="bar" style="height:6px;margin-top:10px"><i class="${over ? 'over' : ''}" style="width:${rp.budget > 0 ? Math.min(100, rp.pct) : 100}%"></i></div></div><span class="chev" aria-hidden="true">${I.chev}</span></summary>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px">
            <div><div class="muted" style="font-size:11px">Потрачено</div><div class="display num gold" style="font-weight:600;font-size:16px;margin-top:4px">${fmt(rp.spent)}</div></div>
            <div><div class="muted" style="font-size:11px">${over ? 'Перерасход' : 'Осталось'}</div><div class="display num ${over ? 'red' : ''}" style="font-weight:600;font-size:16px;margin-top:4px">${rp.budget > 0 ? fmt(Math.abs(rp.left)) : '—'}</div></div>
            <div><div class="muted" style="font-size:11px">Ориентир</div><div class="display num" style="font-weight:600;font-size:16px;margin-top:4px">${rp.budget > 0 ? fmt(rp.budget) : '—'}</div></div>
          </div>
          <a class="link-btn" href="#/o/${id}/forecast" style="display:block;margin-top:6px">Все расходы по статьям →</a></details>`;
      })() : ''}
      ${advanceBlock(d, id)}
      <div class="stats">
        <div class="stat"><div class="k">Вложено</div><div class="v">${fmt(c.totalInvested)}</div></div>
        <div class="stat"><div class="k">Затраты · факт</div><div class="v gold">${fmt(c.factTotal)}</div></div>
        <div class="stat"><div class="k">Затраты · план</div><div class="v">${fmt(c.planTotal)}</div></div>
      </div>

      ${c.rentTotal ? `<div class="muted" style="font-size:12px;margin-top:8px">Аренда получено: <b class="okc num">+${fmt(c.rentTotal)}\u00A0€</b> · идёт в прибыль</div>` : ''}
      ${d.deal ? `<a class="card green" href="#/o/${id}/deal" style="display:flex;align-items:center;gap:12px;margin-top:12px;color:var(--text)">
        <div style="flex:1"><div style="font-size:12px;color:#8FC9A3">Сделка закрыта · ${dateRu(d.deal.sold_at)}</div>
        <div style="font-size:15px;font-weight:500;margin-top:4px">Продано за ${money(d.deal.sold_price)} · прибыль <span class="${c.profit >= 0 ? 'okc' : 'red'} num">${signed(c.profit)}\u00A0€</span></div>
        ${(() => { const r = d.deal.rows.find((x) => x.user_id === me.user_id); return r ? `<div style="font-size:13px;margin-top:4px">Вы заработали <b class="num ${r.profit >= 0 ? 'okc' : 'red'}">${signed(r.profit)}\u00A0€</b> · получаете ${money(r.total)}</div>` : ''; })()}
        <div class="muted" style="font-size:12px;margin-top:2px">Выплаты: ${d.deal.transfers.filter((t) => t.paid_at).length} из ${d.deal.transfers.length}${d.deal.outdated ? ' · <span class="red">нужно пересчитать</span>' : ''}</div></div>${I.chev}</a>` : ''}
      ${d.deal ? '' : `<a class="card" href="#/o/${id}/forecast" style="display:flex;align-items:center;gap:14px;margin-top:12px;color:var(--text)">
        <div style="flex:1">${c.profit !== null
          ? `<div class="muted" style="font-size:12px">Прогноз продажи · ≈ ${money(c.salePrice)}</div>
             <div style="font-size:15px;font-weight:500;margin-top:4px">Прибыль ≈ <span class="${c.profit >= 0 ? 'gold' : 'red'} num">${signed(c.profit)} €</span>${c.roi !== null ? ` <span class="muted" style="font-size:13px;font-weight:400">· ${pct(c.roi)}</span>` : ''}</div>`
          : `<div class="muted" style="font-size:12px">Прогноз продажи</div><div style="font-size:15px;margin-top:4px">План, факт и ${me.isCreator ? 'цена продажи' : 'прибыль'}</div>`}</div>${I.chev}
      </a>`}

      <div class="card list" style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 4px;font-size:13px">
          <a href="#/o/${id}/members" class="muted">Участники · ${d.members.length}</a>
          <span style="display:flex;gap:16px"><a href="#/o/${id}/shares">Доли</a><a href="#/o/${id}/members">${me.isCreator ? 'Пригласить' : 'Все'}</a></span>
        </div>
        ${(() => {
          const row = (m) => `<div class="row" style="padding:9px 0">${avatar(m.user_id, m.name)}
            <div class="grow"><div class="t" style="font-size:14px">${meName(m)}</div><div class="s">${ROLE[m.role]}${m.user_id === o.creator_id ? ' · создатель' : ''}</div></div>
            <div class="r num" style="font-size:13px">${memberLine(m)}</div></div>`;
          const head = d.members.slice(0, 3), rest = d.members.slice(3);
          return `<div class="rows">${head.map(row).join('')}</div>${rest.length ? `<details class="fold plain" data-fold="members-${id}" ${foldOpen('members-' + id, false) ? 'open' : ''}><summary class="more">Показать всех · ещё ${rest.length}</summary><div class="rows" style="border-top:1px solid #222225">${rest.map(row).join('')}</div></details>` : ''}`;
        })()}
      </div>

      ${o.contract && o.contract.fixed ? `<a class="card ${o.contract.all_signed ? 'green' : 'gold'}" href="#/o/${id}/contract" style="display:flex;align-items:center;gap:12px;margin-top:10px;color:var(--text)">
        <span style="width:22px;height:22px;display:inline-flex;color:${o.contract.all_signed ? 'var(--ok)' : 'var(--gold)'}">${I.check}</span>
        <div style="flex:1"><div style="font-size:15px;font-weight:500">${o.contract.all_signed ? 'Договор подписан всеми' : 'Договор на подписи'}</div>
        <div class="muted" style="font-size:12px;margin-top:2px">Подписали ${o.contract.signed} из ${o.contract.total}${!o.contract.all_signed && !o.contract.signers.includes(state.me.id) && d.members.some((m) => m.user_id === state.me.id && m.role !== 'viewer') ? ' · нужна ваша подпись' : ''}</div></div>${I.chev}</a>` : ''}
      ${c.settlement.length ? `<div class="card gold" style="margin-top:10px">
        <div style="font-size:12px;color:#B8A98A">Взаиморасчёт: чтобы вложения совпали с долями</div>
        ${c.settlement.map((s) => `<div style="font-size:15px;font-weight:500;margin-top:6px">${esc(s.fromName)} → ${esc(s.toName)} · <span class="num">${money(s.amount)}</span></div>`).join('')}
      </div>` : ''}

      <div class="btn-row" style="margin-top:14px">
        <a class="btn ghost sm" href="#/o/${id}/report" style="flex:1">Отчёт · PDF / Excel</a>
        ${me.isCreator && !d.deal ? `<a class="btn ghost sm" href="#/o/${id}/deal" style="flex:1">Закрыть сделку</a>` : ''}
      </div>
      <div class="section-h"><h2>Операции</h2>${me.canAdd ? `<a class="pill" href="#/o/${id}/add">${I.plusSm}Добавить</a>` : ''}</div>
      <div class="chips" style="margin-bottom:6px">${filters.map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${entries.length ? (() => {
        if (entries.length <= 6) return `<div class="rows">${entries.map(entryRow).join('')}</div>`;
        const groups = [];
        for (const e of entries) {
          const k = (e.entry_date || '').slice(0, 7);
          let g = groups[groups.length - 1];
          if (!g || g.k !== k) { g = { k, items: [] }; groups.push(g); }
          g.items.push(e);
        }
        return groups.map((g, gi) => {
          const sumOut = g.items.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
          const sumIn = g.items.filter((e) => e.kind === 'in' || e.kind === 'rent').reduce((s, e) => s + e.amount, 0);
          const pending = g.items.some((e) => e.need_my_vote || e.need_my_edit_vote);
          return `<details class="fold month" data-fold="m-${id}-${g.k}" ${foldOpen(`m-${id}-${g.k}`, gi === 0 || pending) ? 'open' : ''}>
            <summary><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:15px">${monthTitle(g.k)}</div>
              <div class="muted" style="font-size:12px;margin-top:2px">${g.items.length} ${plural(g.items.length, 'операция', 'операции', 'операций')}${sumOut ? ` · −${fmt(sumOut)}\u00A0€` : ''}${sumIn ? ` · +${fmt(sumIn)}\u00A0€` : ''}${pending ? ' · <span class="red">нужен ваш ответ</span>' : ''}</div></div>
              <span class="chev" aria-hidden="true">${I.chev}</span></summary>
            <div class="rows">${g.items.map(entryRow).join('')}</div></details>`;
        }).join('');
      })() : `<div class="empty">${filter === 'all' ? 'Операций пока нет.' : 'Нет операций этого типа.'}${me.canAdd && filter === 'all' ? '<br>Добавьте взнос или расход.' : ''}</div>`}
    </div>
    ${tabbar('', me.canAdd ? id : null)}`;
  on('[data-f]', 'click', (e) => viewObject(id, e.currentTarget.dataset.f));
  on('[data-adv]', 'click', async (e) => {
    const st = e.currentTarget.dataset.st;
    const q = { applied: 'Отметить, что сделка состоялась и аванс зачтён в цену продажи?', kept: 'Покупатель отказался и аванс остаётся у вас? Сумма пойдёт в прибыль и разделится по долям.', returned: 'Отметить, что аванс вернули покупателю?' }[st];
    if (!ask(q)) return;
    try { await api('POST', `/api/advances/${e.currentTarget.dataset.adv}/status`, { status: st }); toast('Сохранено', true); viewObject(id, filter); } catch (ex) { toast(ex.message); }
  });
  bindFolds();
}

// Блок суммы: евро или леи (по курсу НБМ на дату операции)
function amountBlock(st, label) {
  const lei = st.currency === 'MDL';
  const eurVal = lei && st.rate && st.amountVal ? Math.round((Number(String(st.amountVal).replace(/\s/g, '').replace(',', '.')) / st.rate) * 100) / 100 : null;
  return `<div style="text-align:center;margin-top:22px">
      <label for="amt" class="muted" style="font-size:13px">${label}${lei ? ', lei' : ', €'}</label>
      <input id="amt" class="amount-input" inputmode="decimal" placeholder="0" value="${esc(st.amountVal || '')}" autocomplete="off">
      <div class="cur-seg" role="group" aria-label="Валюта"><button type="button" data-cur="EUR" class="${lei ? '' : 'on'}" data-nt>€</button><button type="button" data-cur="MDL" class="${lei ? 'on' : ''}" data-nt>lei</button></div>
      ${lei ? `<div class="muted" style="font-size:12px;margin-top:8px" id="leiInfo">${st.rate ? `≈ <b style="color:var(--text)" class="num">${eurVal !== null && !Number.isNaN(eurVal) ? fmt(eurVal) + ' €' : '—'}</b> · курс НБМ ${String(st.rate).replace('.', ',')}` : st.rateError ? 'Курс НБМ недоступен — укажите вручную' : 'Загружаю курс НБМ…'}</div>
        <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:6px"><label for="rate" class="muted" style="font-size:12px">Курс, lei за 1 €</label><input id="rate" class="field" inputmode="decimal" style="width:110px;height:38px;font-size:14px;text-align:center" value="${esc(st.rate || '')}"></div>` : ''}
      ${st.ocr ? `<div class="ocr-note ${st.ocr.err ? '' : 'ok'}">${esc(st.ocr.text)}</div>` : ''}
    </div>`;
}
function bindAmount(st, redraw) {
  const amt = app.querySelector('#amt');
  amt.addEventListener('input', () => {
    st.amountVal = amt.value;
    if (st.currency === 'MDL' && st.rate) {
      const v = Number(amt.value.replace(/\s/g, '').replace(',', '.')) / st.rate;
      const info = app.querySelector('#leiInfo b');
      if (info) info.textContent = Number.isFinite(v) && v > 0 ? `${fmt(Math.round(v * 100) / 100)} €` : '—';
    }
  });
  const rate = app.querySelector('#rate');
  if (rate) rate.addEventListener('input', () => {
    const r = Number(rate.value.replace(/\s/g, '').replace(',', '.'));
    st.rate = r > 0 ? r : null; st.rateError = false;
    const info = app.querySelector('#leiInfo');
    const v = Number((amt.value || '').replace(/\s/g, '').replace(',', '.'));
    if (info) info.innerHTML = st.rate ? `≈ <b style="color:var(--text)" class="num">${v > 0 ? fmt(Math.round((v / st.rate) * 100) / 100) + ' €' : '—'}</b> · курс ${String(st.rate).replace('.', ',')}` : 'Укажите курс';
  });
  on('[data-cur]', 'click', async (e) => {
    st.currency = e.currentTarget.dataset.cur;
    redraw();
    if (st.currency === 'MDL' && !st.rate) await loadRate(st, redraw);
  });
}
async function loadRate(st, redraw) {
  const dateEl = app.querySelector('#date');
  try { const r = await api('GET', `/api/rate?date=${dateEl ? dateEl.value : today()}`); st.rate = r.rate; st.rateError = false; } catch { st.rateError = true; }
  redraw();
}
function amountPayload(st) {
  const raw = (app.querySelector('#amt').value || '').replace(/\s/g, '').replace(',', '.');
  const rateEl = app.querySelector('#rate');
  const rate = rateEl && rateEl.value ? rateEl.value.replace(/\s/g, '').replace(',', '.') : st.rate || '';
  return st.currency === 'MDL' ? { currency: 'MDL', orig_amount: raw, rate } : { amount: raw };
}

async function viewAdd(id, presetKind) {
  const d = state.cache[id] || (await api('GET', `/api/objects/${id}`));
  if (!d.me.canAdd) { toast('Ваша роль не позволяет добавлять операции'); return go(`#/o/${id}`); }
  const foreman = d.me.role === 'foreman';
  const kinds = foreman ? [['out', 'Расход']] : [['out', 'Расход'], ['rent', 'Аренда · доход']];
  const isPay = presetKind === 'pay' && !foreman;
  const s = {
    kind: presetKind === 'rent' && !foreman ? 'rent' : 'out',
    category: isPay ? 'Покупка' : 'Ремонт',
    photos: [],
    currency: 'EUR',
    rate: null,
    amountVal: isPay && d.object.installment && d.object.installment.monthly ? String(Math.min(d.object.installment.monthly, d.object.installment.left)) : '',
    ocr: null
  };
  const presetNote = isPay ? 'Платёж по рассрочке' : '';
  const draw = () => {
    if (app.querySelector('#amt')) s.amountVal = app.querySelector('#amt').value;
    const noteVal = app.querySelector('#note') ? app.querySelector('#note').value : presetNote;
    const dateVal = app.querySelector('#date') ? app.querySelector('#date').value : s.ocrDate || today();
    const isRent = s.kind === 'rent', isOut = s.kind === 'out';
    app.innerHTML = `
      <div class="screen no-tab">
        <div class="topbar">${backBtn(`#/o/${id}`, 'Закрыть')}<div class="title"><b>Новая операция</b><small>${esc(d.object.name)}</small></div><div class="spacer44"></div></div>
        ${kinds.length > 1 ? `<div class="seg" style="grid-template-columns:repeat(${kinds.length},minmax(0,1fr));margin-top:20px">${kinds.map(([k, l]) => `<button data-k="${k}" class="${k === s.kind ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
        ${amountBlock(s, isRent ? 'Получено за аренду' : 'Сумма расхода')}
        <span class="label">${isRent ? 'Кто получил' : 'Кто оплатил'}</span>
        <div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 14px">${avatar(state.me.id, state.me.name)}
          <div style="flex:1"><div style="font-weight:500">${esc(state.me.name)} <span class="muted" style="font-weight:400">· вы</span></div><div class="muted" style="font-size:12px;margin-top:2px">Только свои операции, за партнёра нельзя</div></div>
          <span class="muted" style="width:16px;height:16px;display:inline-flex" role="img" aria-label="Нельзя изменить">${I.lock}</span></div>
        <div class="muted" style="font-size:12px;margin-top:8px">${isRent ? 'Аренда идёт в прибыль и делится по долям. Деньги у вас на руках — это учтётся во взаиморасчёте.' : 'Оплачено из ваших денег — сумма засчитается как ваше вложение.'}</div>
        ${isOut ? `<span class="label">Категория${foreman ? ' · прораб вносит только ремонт' : ''}</span>
          <div class="chips">${(foreman ? ['Ремонт'] : d.categories).map((c) => `<button data-c="${esc(c)}" class="${c === s.category ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
        <label class="label" for="note">Комментарий</label>
        <input id="note" class="field" placeholder="${isRent ? 'Например: аренда за ноябрь' : 'Например: плитка, санузел'}" value="${esc(noteVal)}">
        <label class="label" for="date">Дата</label>
        <input id="date" class="field" type="date" value="${esc(dateVal)}">
        ${isOut ? `<div class="label" style="display:flex;justify-content:space-between"><span>Чеки и документы</span><span>${s.photos.length ? s.photos.length + ' фото' : ''}</span></div>
          <div class="thumbs">
            ${s.photos.map((p, k) => `<div class="thumb" style="background-image:url('${p.preview}')"><button class="x" data-rm="${k}" aria-label="Убрать фото">×</button></div>`).join('')}
            <label class="add-tile">${I.camera}<span>Камера</span><input type="file" accept="image/*" capture="environment" data-photo aria-label="Сфотографировать чек"></label>
            <label class="add-tile">${I.gallery}<span>Галерея</span><input type="file" accept="image/*" multiple data-photo aria-label="Загрузить фото из галереи"></label>
          </div>
          <div class="muted" style="font-size:12px;margin-top:8px">Сумму и дату с первого фото чека приложение попробует прочитать само — проверьте их.</div>` : ''}
        <button class="btn" id="save" style="margin-top:28px">Сохранить</button>
      </div>`;
    bindAmount(s, draw);
    on('[data-k]', 'click', (e) => { s.kind = e.currentTarget.dataset.k; draw(); });
    on('[data-c]', 'click', (e) => { s.category = e.currentTarget.dataset.c; draw(); });
    on('[data-rm]', 'click', (e) => { s.photos.splice(Number(e.currentTarget.dataset.rm), 1); draw(); });
    app.querySelector('#date').addEventListener('change', () => { if (s.currency === 'MDL') { s.rate = null; loadRate(s, draw); } });
    on('[data-photo]', 'change', async (e) => {
      const files = Array.from(e.target.files || []);
      const wasEmpty = !s.photos.length;
      for (const f of files.slice(0, 10 - s.photos.length)) {
        try { s.photos.push(await compressImage(f)); } catch (ex) { toast(ex.message); }
      }
      const needAmount = !(app.querySelector('#amt').value || '').trim();
      if (wasEmpty && s.photos.length && needAmount && window.Receipt) {
        s.ocr = { text: 'Читаю сумму с чека…' };
        draw();
        try {
          const r = await Receipt.recognize(s.photos[0].preview);
          if (r.amount) {
            s.amountVal = String(r.amount).replace('.', ',');
            if (r.currency === 'MDL') { s.currency = 'MDL'; }
            if (r.date) s.ocrDate = r.date;
            s.ocr = { text: `С чека: ${s.amountVal} ${r.currency === 'MDL' ? 'lei' : r.currency === 'EUR' ? '€' : ''}${r.date ? ` · ${dateRu(r.date)}` : ''} — проверьте` };
            if (r.date && app.querySelector('#date')) app.querySelector('#date').value = r.date;
            draw();
            if (s.currency === 'MDL' && !s.rate) await loadRate(s, draw);
            return;
          }
          s.ocr = { text: 'Сумму на чеке не нашли — введите вручную', err: true };
        } catch { s.ocr = { text: 'Не удалось прочитать чек — введите сумму вручную', err: true }; }
      }
      draw();
    });
    app.querySelector('#save').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Сохраняю…';
      try {
        await api('POST', `/api/objects/${id}/entries`, {
          kind: s.kind,
          category: s.category,
          ...amountPayload(s),
          note: app.querySelector('#note').value,
          entry_date: app.querySelector('#date').value,
          photos: s.kind === 'out' ? s.photos.map((p) => ({ mime: p.mime, data: p.data })) : []
        });
        delete state.cache[id];
        toast('Сохранено', true);
        go(`#/o/${id}`);
      } catch (ex) {
        toast(ex.message);
        btn.disabled = false;
        btn.textContent = 'Сохранить';
      }
    };
  };
  draw();
}

// Исправление операции: предложение уходит на согласование всем участникам сделки
async function viewEntryEdit(eid) {
  const d = await api('GET', `/api/entries/${eid}`);
  const e = d.entry;
  if (!e.mine) { toast('Исправить операцию может только её автор'); return go(`#/e/${eid}`); }
  const foreman = (state.cache[e.object_id] && state.cache[e.object_id].me.role === 'foreman');
  const s = { currency: e.orig_currency === 'MDL' ? 'MDL' : 'EUR', rate: e.rate || null, amountVal: String(e.orig_currency === 'MDL' ? e.orig_amount : e.amount).replace('.', ','), category: e.category || 'Ремонт' };
  const draw = () => {
    if (app.querySelector('#amt')) s.amountVal = app.querySelector('#amt').value;
    const noteVal = app.querySelector('#note') ? app.querySelector('#note').value : e.note || '';
    const dateVal = app.querySelector('#date') ? app.querySelector('#date').value : e.entry_date;
    app.innerHTML = `
      <div class="screen no-tab">
        <div class="topbar">${backBtn(`#/e/${eid}`, 'Закрыть')}<div class="title"><b>Исправить операцию</b><small>нужно согласие участников</small></div><div class="spacer44"></div></div>
        ${amountBlock(s, e.kind === 'rent' ? 'Получено за аренду' : 'Сумма расхода')}
        ${e.kind === 'out' && !foreman ? `<span class="label">Категория</span><div class="chips">${d.categories.map((c) => `<button data-c="${esc(c)}" class="${c === s.category ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
        <label class="label" for="note">Комментарий</label><input id="note" class="field" value="${esc(noteVal)}">
        <label class="label" for="date">Дата</label><input id="date" class="field" type="date" value="${esc(dateVal)}">
        <div class="card dashed" style="margin-top:16px;font-size:13px;line-height:1.5;color:#B5B5BA">Исправление применится, когда согласятся все участники сделки. До этого в расчётах остаётся прежняя версия.</div>
        <button class="btn" id="save" style="margin-top:20px">Отправить на согласование</button>
      </div>`;
    bindAmount(s, draw);
    on('[data-c]', 'click', (ev) => { s.category = ev.currentTarget.dataset.c; draw(); });
    app.querySelector('#save').onclick = async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        const r = await api('POST', `/api/entries/${eid}/edit`, { ...amountPayload(s), category: s.category, note: app.querySelector('#note').value, entry_date: app.querySelector('#date').value });
        delete state.cache[e.object_id];
        toast(r.applied ? 'Исправлено' : 'Отправлено участникам на согласование', true);
        go(`#/e/${eid}`);
      } catch (ex) { toast(ex.message); ev.currentTarget.disabled = false; }
    };
  };
  draw();
}

async function viewEntry(eid) {
  const d = await api('GET', `/api/entries/${eid}`);
  const e = d.entry;
  const ids = d.receipts.map((r) => r.id);
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${e.object_id}`)}<div class="title"><b>${KIND[e.kind]}</b></div><div class="spacer44"></div></div>
      <div style="text-align:center;margin-top:24px">
        <div class="muted" style="font-size:13px">${esc(e.category || (e.kind === 'in' ? 'Взнос' : e.kind === 'rent' ? 'Аренда · доход' : ''))}</div>
        <div class="hero-num ${e.kind === 'rent' ? 'okc' : ''}" style="font-size:42px">${e.kind === 'in' || e.kind === 'rent' ? '+' : e.kind === 'out' ? '−' : ''}${fmt(e.amount)} <span class="cur">€</span></div>
        ${e.orig_currency === 'MDL' ? `<div class="muted" style="font-size:13px">${fmt(e.orig_amount)} lei · курс НБМ ${String(e.rate).replace('.', ',')}</div>` : ''}
      </div>
      <div class="card list" style="margin-top:20px">
        <div class="row">${avatar(e.user_id, e.author)}<div class="grow"><div class="t">${esc(e.author)}${e.mine ? ' <span class="muted" style="font-size:12px">(вы)</span>' : ''}</div><div class="s">${e.kind === 'in' ? 'внёс' : e.kind === 'out' ? 'оплатил' : e.kind === 'rent' ? 'получил' : 'запланировал'} · ${dateRu(e.entry_date)}</div></div></div>
        ${e.note ? `<div class="row"><div class="grow muted" style="font-size:14px">Комментарий</div><div class="r" style="max-width:60%;text-align:right">${esc(e.note)}</div></div>` : ''}
      </div>
      ${e.kind === 'out' ? `
        <div class="label">Чеки · ${ids.length}</div>
        <div class="thumbs">
          ${ids.map((rid, k) => `<button class="thumb" data-open="${k}" aria-label="Открыть чек ${k + 1}" style="background-image:url('/api/receipts/${rid}/image')"></button>`).join('')}
          ${e.mine ? `<label class="add-tile">${I.camera}<span>Камера</span><input type="file" accept="image/*" capture="environment" data-photo aria-label="Сфотографировать чек"></label>
            <label class="add-tile">${I.gallery}<span>Галерея</span><input type="file" accept="image/*" multiple data-photo aria-label="Загрузить фото"></label>` : ''}
          ${!ids.length && !e.mine ? '<div class="muted" style="font-size:13px">Чеков нет</div>' : ''}
        </div>` : ''}
      ${d.edit ? (() => {
        const v = d.edit.votes;
        const p = d.edit.proposal;
        const b = p.before || {};
        const agreed = v.filter((x) => x.agreed).length;
        const mineVote = v.find((x) => x.user_id === state.me.id);
        const diff = [];
        if (p.amount !== b.amount) diff.push(`<div class="kv"><span class="muted">Сумма</span><span class="num">${fmt(b.amount)} € → <b>${fmt(p.amount)} €</b></span></div>`);
        if ((p.category || '') !== (b.category || '')) diff.push(`<div class="kv"><span class="muted">Категория</span><span>${esc(b.category || '—')} → <b>${esc(p.category || '—')}</b></span></div>`);
        if ((p.note || '') !== (b.note || '')) diff.push(`<div class="kv"><span class="muted">Комментарий</span><span>«${esc(p.note || '')}»</span></div>`);
        if (p.entry_date !== b.entry_date) diff.push(`<div class="kv"><span class="muted">Дата</span><span>${dateRu(b.entry_date)} → <b>${dateRu(p.entry_date)}</b></span></div>`);
        return `<div class="card gold" style="margin-top:24px">
          <div style="display:flex;justify-content:space-between"><b style="font-size:15px">Предложено исправление</b><b>${agreed} из ${v.length}</b></div>
          <div style="margin-top:8px">${diff.join('') || '<div class="muted" style="font-size:13px">Без изменений</div>'}</div>
          <div class="rows" style="margin-top:6px">${v.map((x) => `<div class="row" style="padding:8px 0">${avatar(x.user_id, x.name)}<div class="grow"><div class="t" style="font-size:14px">${esc(x.name)}${x.user_id === state.me.id ? ' <span class="muted">· вы</span>' : ''}</div></div>${x.agreed ? `<span class="gold" style="display:flex;align-items:center;gap:6px;font-size:13px">${I.check}Да</span>` : '<span class="muted" style="font-size:13px">ждём ответа</span>'}</div>`).join('')}</div>
          <div class="muted" style="font-size:12px;line-height:1.45;margin-top:6px">Применится, когда согласятся все участники сделки. Любой отказ отменяет исправление.</div>
          ${d.edit.canVote && mineVote && !mineVote.agreed ? '<div class="btn-row" style="margin-top:12px"><button class="btn sm" id="eyes" style="flex:1">Согласен</button><button class="btn ghost sm" id="eno" style="flex:1">Против</button></div>' : ''}
          ${e.mine ? '<button class="link-btn" id="ecancel" style="display:block;margin:10px auto 0;color:var(--text)">Отозвать исправление</button>' : ''}
        </div>`;
      })() : ''}
      ${e.mine && !d.edit && !d.deletion ? `<a class="btn ghost" href="#/e/${eid}/edit" style="margin-top:28px">Исправить операцию</a>` : ''}
      ${d.deletion ? (() => {
        const v = d.deletion.votes;
        const agreed = v.filter((x) => x.agreed).length;
        const mineVote = v.find((x) => x.user_id === state.me.id);
        return `<div class="label" style="display:flex;justify-content:space-between;margin-top:28px"><span>Запрошено удаление</span><b style="color:var(--text)">${agreed} из ${v.length}</b></div>
          <div style="display:flex;gap:4px">${v.map((x) => `<i style="flex:1;height:4px;border-radius:2px;background:${x.agreed ? 'var(--gold)' : 'var(--line2)'}"></i>`).join('')}</div>
          <div class="card list" style="margin-top:12px">${v.map((x) => `<div class="row">${avatar(x.user_id, x.name)}<div class="grow"><div class="t">${esc(x.name)}${x.user_id === state.me.id ? ' <span class="muted">· вы</span>' : ''}</div><div class="s">${ROLE[x.role]}${x.user_id === e.user_id ? ' · автор' : ''}</div></div>
            ${x.agreed ? `<span class="gold" style="display:flex;align-items:center;gap:6px;font-size:13px">${I.check}Да</span>` : '<span class="muted" style="font-size:13px">ждём ответа</span>'}</div>`).join('')}</div>
          <div class="muted" style="font-size:12px;margin-top:8px;line-height:1.45">Операция удалится, когда согласятся все участники сделки. Пока она учитывается в расчётах. Любой отказ отменяет запрос.</div>
          ${d.deletion.canVote && mineVote && !mineVote.agreed ? '<div class="btn-row" style="margin-top:16px"><button class="btn danger" id="vyes" style="flex:1">Согласен удалить</button><button class="btn ghost" id="vno" style="flex:1">Против</button></div>' : ''}
          ${e.mine ? '<button class="link-btn" id="vcancel" style="display:block;margin:14px auto 0;color:var(--text)">Отозвать запрос</button>' : ''}`;
      })()
      : e.mine && !d.edit ? '<button class="btn danger" id="del" style="margin-top:10px">Удалить операцию</button><div class="muted" style="font-size:12px;margin-top:8px;text-align:center">Удалится после согласия всех участников сделки</div>'
      : '<div class="muted" style="font-size:12px;margin-top:28px;text-align:center">Изменить или удалить операцию может только её автор — с согласия всех участников</div>'}
    </div>`;
  on('[data-open]', 'click', (ev) => openViewer(ids, Number(ev.currentTarget.dataset.open)));
  on('[data-photo]', 'change', async (ev) => {
    const files = Array.from(ev.target.files || []);
    try {
      const photos = [];
      for (const f of files.slice(0, 10)) { const p = await compressImage(f); photos.push({ mime: p.mime, data: p.data }); }
      if (photos.length) {
        toast('Загружаю…', true);
        await api('POST', `/api/entries/${eid}/receipts`, { photos });
        delete state.cache[e.object_id];
        viewEntry(eid);
      }
    } catch (ex) { toast(ex.message); }
  });
  const eyes = app.querySelector('#eyes');
  if (eyes) eyes.onclick = async () => { try { const r = await api('POST', `/api/entries/${eid}/edit-vote`, { agree: true }); delete state.cache[e.object_id]; if (r.applied) toast('Исправление применено', true); viewEntry(eid); } catch (ex) { toast(ex.message); } };
  const eno = app.querySelector('#eno');
  if (eno) eno.onclick = async () => { try { await api('POST', `/api/entries/${eid}/edit-vote`, { agree: false }); toast('Исправление отклонено', true); viewEntry(eid); } catch (ex) { toast(ex.message); } };
  const ec = app.querySelector('#ecancel');
  if (ec) ec.onclick = async () => { try { await api('POST', `/api/entries/${eid}/edit-cancel`); viewEntry(eid); } catch (ex) { toast(ex.message); } };
  const del = app.querySelector('#del');
  const after = (r) => {
    delete state.cache[e.object_id];
    if (r.deleted) { toast('Операция удалена', true); go(`#/o/${e.object_id}`); } else viewEntry(eid);
  };
  if (del) del.onclick = async () => {
    if (!ask('Отправить участникам запрос на удаление? Операция удалится вместе с чеками, когда согласятся все.')) return;
    try { const r = await api('DELETE', `/api/entries/${eid}`); if (!r.deleted) toast('Запрос отправлен участникам', true); after(r); } catch (ex) { toast(ex.message); }
  };
  const vyes = app.querySelector('#vyes');
  if (vyes) vyes.onclick = async () => {
    if (!ask('Согласны удалить эту операцию?')) return;
    try { after(await api('POST', `/api/entries/${eid}/delete-vote`, { agree: true })); } catch (ex) { toast(ex.message); }
  };
  const vno = app.querySelector('#vno');
  if (vno) vno.onclick = async () => {
    try { await api('POST', `/api/entries/${eid}/delete-vote`, { agree: false }); toast('Запрос отклонён, операция остаётся', true); after({}); } catch (ex) { toast(ex.message); }
  };
  const vc = app.querySelector('#vcancel');
  if (vc) vc.onclick = async () => {
    try { await api('POST', `/api/entries/${eid}/delete-cancel`); after({}); } catch (ex) { toast(ex.message); }
  };
}

// ---------- закрытие сделки ----------
async function viewDeal(id) {
  const d = await api('GET', `/api/objects/${id}`);
  state.cache[id] = d;
  const { me, object: o, calc: c } = d;
  const deal = d.deal;
  const parties = d.members.filter((m) => m.role !== 'viewer');
  if (!deal) {
    if (!me.isCreator) { app.innerHTML = `<div class="screen no-tab"><div class="topbar">${backBtn(`#/o/${id}`)}</div><div class="empty">Сделку закрывает создатель объекта.</div></div>`; return; }
    app.innerHTML = `
      <div class="screen no-tab">
        <div class="topbar">${backBtn(`#/o/${id}`)}<div class="spacer44"></div></div>
        <div class="h-sub" style="margin-top:18px">${esc(o.name)}</div>
        <h1 class="h">Закрыть сделку</h1>
        <div class="lead">Укажите фактическую цену продажи и кто получил деньги от покупателя. Приложение посчитает, кто кому сколько должен выплатить: каждый получает назад свои вложения плюс свою долю прибыли.</div>
        <form id="f" novalidate>
          <label class="label" for="price">Фактическая цена продажи, €</label>
          <input class="field" id="price" inputmode="decimal" value="${esc(o.sale_price ?? '')}">
          <label class="label" for="sdate">Дата продажи</label>
          <input class="field" id="sdate" type="date" value="${today()}">
          <label class="label" for="recv">Деньги от покупателя получил</label>
          <select class="field" id="recv">${parties.map((m) => `<option value="${m.user_id}" ${m.user_id === me.user_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
          <div class="card dashed" style="margin-top:16px;font-size:13px;line-height:1.5;color:#B5B5BA">Расходы на продажу (риелтор, нотариус, налоги) внесите как обычные расходы — до или после закрытия, итог пересчитается. Действующий аванс отметьте «Сделка состоялась».</div>
          <button class="btn" style="margin-top:20px">Закрыть сделку и посчитать выплаты</button>
        </form>
      </div>`;
    app.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      if (!ask('Закрыть сделку? Статус объекта станет «продана», участники получат расчёт выплат.')) return;
      try {
        await api('POST', `/api/objects/${id}/close`, { sold_price: app.querySelector('#price').value.replace(/\s/g, '').replace(',', '.'), sold_at: app.querySelector('#sdate').value, receiver_id: app.querySelector('#recv').value });
        delete state.cache[id];
        toast('Сделка закрыта', true);
        viewDeal(id);
      } catch (ex) { toast(ex.message); }
    };
    return;
  }
  const paidCount = deal.transfers.filter((t) => t.paid_at).length;
  const earners = [...deal.rows].sort((x, y) => y.profit - x.profit);
  const months = (() => { const st = new Date(o.created_at), en = new Date(deal.sold_at); const m = Math.round((en - st) / (30.44 * 864e5)); return m >= 1 ? m : null; })();
  const roiAll = c.totalInvested > 0 ? (c.profit / c.totalInvested) * 100 : null;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${id}`)}<div class="spacer44"></div></div>
      <div class="h-sub" style="margin-top:18px">${esc(o.name)} · продана ${dateRu(deal.sold_at)}</div>
      <h1 class="h">Итог сделки</h1>
      <div class="card green" style="margin-top:16px">
        <div class="kv"><span class="muted">Продано за</span><b class="num">${money(deal.sold_price)}</b></div>
        <div class="kv"><span class="muted">Затраты · факт</span><span class="num">−${fmt(c.factTotal)}\u00A0€</span></div>
        ${c.rentTotal ? `<div class="kv"><span class="muted">Аренда</span><span class="num okc">+${fmt(c.rentTotal)}\u00A0€</span></div>` : ''}
        ${c.advanceKept ? `<div class="kv"><span class="muted">Аванс, оставшийся у нас</span><span class="num okc">+${fmt(c.advanceKept)}\u00A0€</span></div>` : ''}
        <div class="kv" style="border-top:1px solid #2E6B45;margin-top:6px;padding-top:8px"><b>Прибыль</b><b class="num ${c.profit >= 0 ? 'okc' : 'red'}">${signed(c.profit)}\u00A0€</b></div>
        ${roiAll !== null ? `<div class="kv"><span class="muted">Доходность</span><span class="num">${pct(roiAll)}${months ? ` · <span data-nt>${I18N.lang === 'ro' ? `în ${months} ${months === 1 ? 'lună' : 'luni'}` : `за ${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`}</span>` : ''}</span></div>` : ''}
        <div class="muted" style="font-size:12px;margin-top:6px">Деньги от покупателя у: ${esc(deal.receiver_name || '—')}</div>
      </div>
      ${deal.outdated ? `<div class="warn">После закрытия изменились операции — суммы выплат устарели.${me.isCreator ? '' : ' Создатель может пересчитать.'}</div>${me.isCreator ? '<button class="btn sm" id="recalc" style="margin-top:10px;width:100%">Пересчитать выплаты</button>' : ''}` : ''}
      <div class="label">Кто сколько заработал</div>
      <div class="card list">${earners.map((r) => `<div class="row">${avatar(r.user_id, r.name)}
        <div class="grow"><div class="t" style="font-size:14px">${esc(r.name)}${r.user_id === me.user_id ? ' <span class="muted" style="font-size:12px">(вы)</span>' : ''}</div>
          <div class="s num">вложил ${fmt(r.invested)} € → получает ${fmt(r.total)} €</div>
          ${r.cash ? `<div class="s num" style="font-size:11px">уже на руках ${fmt(r.cash)} €</div>` : ''}</div>
        <div class="r"><div class="display num ${r.profit >= 0 ? 'okc' : 'red'}" style="font-weight:600;font-size:17px">${signed(r.profit)} €</div>${r.invested > 0 ? `<div class="muted num" style="font-size:11px">${pct((r.profit / r.invested) * 100)} на вложения</div>` : ''}</div></div>`).join('')}</div>
      <div class="label" style="display:flex;justify-content:space-between"><span>Выплаты</span><span>${paidCount} из ${deal.transfers.length}</span></div>
      ${deal.transfers.length ? `<div class="card list">${deal.transfers.map((t) => `<div class="row">
        <div class="grow"><div class="t" style="font-size:14px">${esc(t.fromName)} → ${esc(t.toName)}</div><div class="s">${t.paid_at ? `выплачено · ${dateRu(String(t.paid_at).slice(0, 10))}` : 'ещё не выплачено'}</div></div>
        <div class="r"><div class="display num" style="font-weight:600">${money(t.amount)}</div>
        ${t.can_mark ? `<button class="link-btn" data-pay="${t.from}-${t.to}" data-paid="${t.paid_at ? '0' : '1'}" style="padding:4px 0;font-size:13px">${t.paid_at ? 'Отменить отметку' : 'Отметить выплату'}</button>` : t.paid_at ? `<span class="okc" style="font-size:12px">${I.check}</span>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">Выплаты не нужны — у каждого уже на руках его сумма.</div>'}
      ${paidCount === deal.transfers.length && deal.transfers.length ? '<div class="card green" style="margin-top:12px;font-size:14px">Все выплаты сделаны — сделка завершена.</div>' : ''}
      <a class="btn ghost" href="#/o/${id}/report" style="margin-top:20px">Отчёт по сделке · PDF / Excel</a>
      ${me.isCreator ? '<button class="link-btn" id="reopen" style="display:block;margin:14px auto 0;color:var(--muted)">Отменить закрытие сделки</button>' : ''}
    </div>`;
  on('[data-pay]', 'click', async (e) => {
    const [from, to] = e.currentTarget.dataset.pay.split('-').map(Number);
    const paid = e.currentTarget.dataset.paid === '1';
    try { await api('POST', `/api/objects/${id}/payouts/mark`, { from, to, paid }); toast(paid ? 'Выплата отмечена' : 'Отметка снята', true); viewDeal(id); } catch (ex) { toast(ex.message); }
  });
  const rc = app.querySelector('#recalc');
  if (rc) rc.onclick = async () => { try { await api('POST', `/api/objects/${id}/recalc`); toast('Пересчитано', true); viewDeal(id); } catch (ex) { toast(ex.message); } };
  const ro = app.querySelector('#reopen');
  if (ro) ro.onclick = async () => { if (!ask('Отменить закрытие сделки? Отметки о выплатах будут сброшены.')) return; try { await api('POST', `/api/objects/${id}/reopen`); delete state.cache[id]; go(`#/o/${id}`); } catch (ex) { toast(ex.message); } };
}

// ---------- отчёт ----------
async function viewReport(id, lang) {
  lang = lang || I18N.lang;
  const d = await api('GET', `/api/objects/${id}/report?lang=${lang}`);
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${id}`)}<div class="title"><b>Отчёт по объекту</b><small>для партнёров и бухгалтера</small></div><div class="spacer44"></div></div>
      <div class="seg" style="grid-template-columns:1fr 1fr;margin-top:18px"><button data-rl="ru" class="${lang === 'ru' ? 'on' : ''}" data-nt>Русский</button><button data-rl="ro" class="${lang === 'ro' ? 'on' : ''}" data-nt>Limba de stat</button></div>
      <div class="btn-row"><button class="btn" id="pdf" style="flex:1">PDF / Печать</button><a class="btn ghost" id="xls" href="/api/objects/${id}/export.csv?lang=${lang}" style="flex:1">Excel</a></div>
      <button class="btn ghost sm" id="share" style="width:100%;margin-top:10px">Отправить ссылку на отчёт</button>
      <iframe id="doc" title="Отчёт" style="width:100%;height:72vh;border:0;border-radius:16px;margin-top:14px;background:#E9E7E1"></iframe>
      <div class="muted" style="font-size:12px;line-height:1.45;margin-top:10px">Excel — все операции таблицей (открывается в Excel и Google Таблицах). Ссылка на отчёт работает 7 дней без входа в приложение.</div>
    </div>`;
  const frame = app.querySelector('#doc');
  frame.srcdoc = d.html;
  on('[data-rl]', 'click', (e) => viewReport(id, e.currentTarget.dataset.rl));
  const link = async () => (await api('POST', `/api/objects/${id}/report-link`, { lang })).url;
  app.querySelector('#pdf').onclick = async () => {
    if (TG) { try { openExternal(await link()); } catch (ex) { toast(ex.message); } }
    else { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { window.print(); } }
  };
  app.querySelector('#xls').onclick = async (e) => {
    if (!TG) return;
    e.preventDefault();
    toast('Excel скачивается в браузере: откройте отчёт по ссылке', true);
    try { openExternal(await link()); } catch (ex) { toast(ex.message); }
  };
  app.querySelector('#share').onclick = async () => {
    try {
      const url = await link();
      const text = lang === 'ro' ? 'Raport pe obiect' : 'Отчёт по объекту';
      if (TG) openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      else if (navigator.share) navigator.share({ title: text, url }).catch(() => {});
      else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована', true); }
    } catch (ex) { toast(ex.message); }
  };
}

async function viewForecast(id) {
  const d = await api('GET', `/api/objects/${id}`);
  const { calc: c, me, object: o } = d;
  const foremen = d.members.filter((m) => m.role === 'foreman' && m.payout !== null);
  const investors = d.members.filter((m) => m.role === 'investor');
  const dist = [...foremen, ...investors].map((m) => `
    <div style="display:flex;align-items:center;gap:8px;font-size:13px"><span class="dot" style="background:${colorOf(m.user_id)}"></span>${esc(m.name)}
      <span style="color:#B8A98A">· ${m.role === 'foreman' ? (m.foreman_mode === 'pct' ? `прораб, ${pct(m.foreman_value)} прибыли` : m.foreman_mode === 'fix' ? `прораб, ${money(m.foreman_value)}` : 'прораб') : `${pct(m.share_pct)} остатка`}</span>
      <span class="num" style="margin-left:auto">${m.payout === null ? '—' : signed(m.payout) + ' €'}</span></div>`).join('');
  const rows = c.categories.map((k) => {
    const over = k.fact > k.plan;
    const w = k.plan > 0 ? Math.min(100, Math.round((k.fact / k.plan) * 100)) : k.fact > 0 ? 100 : 0;
    return `<div class="row" style="padding:9px 0">
      <div class="grow"><div style="font-size:14px">${esc(k.category)}</div><div class="bar"><i class="${over ? 'over' : ''}" style="width:${w}%"></i></div></div>
      <div class="r" style="width:110px"><div class="num" style="font-size:14px">${k.fact ? fmt(k.fact) : '—'}</div>
      <div class="num" style="font-size:12px;margin-top:2px;color:${over ? 'var(--red)' : 'var(--muted)'}">${over ? `${signed(k.fact - k.plan)} сверх плана` : k.plan ? `план ${fmt(k.plan)}` : 'без плана'}</div></div></div>`;
  }).join('');
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${id}`)}<div class="title"><b>Прогноз продажи</b><small>${esc(o.name)}</small></div>
        <div class="spacer44"></div></div>
      <div class="card" style="margin-top:20px">
        <div class="muted" style="font-size:12px;display:flex;justify-content:space-between"><span>Ориентировочная цена продажи</span>${o.area && o.sale_price ? `<span>${fmt(o.sale_price / o.area)} € / м²</span>` : ''}</div>
        ${me.isCreator ? `<div style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <input id="sale" class="field" inputmode="decimal" style="font-family:Manrope;font-weight:600;font-size:22px" value="${o.sale_price ?? ''}" placeholder="Например: 105000">
            <button class="btn sm" id="saveSale">OK</button></div>`
          : `<div class="display num" style="font-weight:600;font-size:30px;margin-top:6px">${o.sale_price !== null ? money(o.sale_price) : '<span class="muted" style="font-size:16px">создатель ещё не указал</span>'}</div>`}
      </div>
      ${c.profit !== null ? `<div class="card gold" style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#B8A98A"><span>Ориентировочная прибыль</span>${c.roi !== null ? `<span>${pct(c.roi)} на затраты</span>` : ''}</div>
        <div class="display num" style="font-weight:600;font-size:30px;margin-top:6px;color:${c.profit >= 0 ? 'var(--gold)' : 'var(--red)'}">${signed(c.profit)} €</div>
        ${c.advanceKept ? `<div style="font-size:12px;color:#B8A98A;margin-top:4px">в т.ч. аванс, оставшийся у нас: <b class="okc">+${fmt(c.advanceKept)}\u00A0€</b></div>` : ''}
        ${c.advanceActive ? `<div style="font-size:12px;color:#B8A98A;margin-top:4px">действующий аванс покупателя: ${money(c.advanceActive)}</div>` : ''}
        ${c.rentTotal ? `<div style="font-size:12px;color:#B8A98A;margin-top:4px">в т.ч. аренда: <b class="okc">+${fmt(c.rentTotal)}\u00A0€</b></div>` : ''}
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #3A3428">${dist}</div>
        ${c.shareSum !== 100 ? '<div class="red" style="font-size:12px;margin-top:10px">Доли инвесторов не равны 100 % — создатель должен их поправить.</div>' : ''}
      </div>` : ''}
      <div class="section-h" style="margin-bottom:4px"><h2>Расходы</h2><div class="num" style="font-size:13px"><span class="muted">факт</span> ${fmt(c.factTotal)} <span class="muted">/ план</span> ${fmt(c.planTotal)} €</div></div>
      <div style="display:flex;gap:14px;font-size:11px;color:var(--muted);margin-bottom:6px">
        <span style="display:flex;align-items:center;gap:6px"><i style="width:12px;height:4px;border-radius:2px;background:var(--gold);display:inline-block"></i>Факт</span>
        <span style="display:flex;align-items:center;gap:6px"><i style="width:12px;height:4px;border-radius:2px;background:var(--line2);display:inline-block"></i>План</span>
        <span style="display:flex;align-items:center;gap:6px"><i style="width:12px;height:4px;border-radius:2px;background:var(--red);display:inline-block"></i>Перерасход</span></div>
      ${rows ? `<div class="rows">${rows}</div>` : '<div class="empty">Укажите в объекте стоимость покупки и примерную стоимость ремонта, затем добавляйте расходы — здесь появится сравнение плана и факта.</div>'}
      <div class="muted" style="font-size:12px;line-height:1.5;margin-top:16px">Прогноз затрат: по каждой статье берётся план, а если факт уже больше — факт. Итого ≈ ${money(c.forecastCosts)}.</div>
    </div>`;
  const save = app.querySelector('#saveSale');
  if (save) save.onclick = async () => {
    try {
      await api('PATCH', `/api/objects/${id}`, { name: o.name, area: o.area, status: o.status, purchase_price: o.purchase_price, installment: !!o.installment, installment_monthly: o.installment_monthly, repair_budget: o.repair_budget, sale_price: app.querySelector('#sale').value.replace(/\s/g, '').replace(',', '.') });
      delete state.cache[id];
      toast('Цена сохранена', true);
      viewForecast(id);
    } catch (ex) { toast(ex.message); }
  };
}

async function viewMembers(id) {
  const d = await api('GET', `/api/objects/${id}`);
  const { me, object: o } = d;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${id}`)}<div class="spacer44"></div></div>
      <div class="h-sub" style="margin-top:18px">${esc(o.name)}</div>
      <h1 class="h">Участники</h1>
      <div class="lead">Состав у каждого объекта свой. Все видят одни цифры, но вносят только свои операции. Прораб вносит расходы на ремонт, «Просмотр» только смотрит.</div>
      <div class="card list" style="margin-top:20px">${d.members.map((m) => `
        <div class="row">${avatar(m.user_id, m.name)}
          <div class="grow"><div class="t">${esc(m.name)}${m.user_id === me.user_id ? ' <span class="muted" style="font-size:12px">(вы)</span>' : ''}</div>
            <div class="s">${m.user_id === o.creator_id ? 'Создатель · ставит доли и доступ' : esc(m.email || (m.tg_username ? '@' + m.tg_username : 'через Telegram'))}</div></div>
          ${me.isCreator && m.user_id !== o.creator_id
            ? `<select class="field" data-role="${m.user_id}" aria-label="Роль ${esc(m.name)}" style="width:auto;height:40px;font-size:13px;padding:0 34px 0 12px">${Object.entries(ROLE).map(([k, l]) => `<option value="${k}" ${k === m.role ? 'selected' : ''}>${l[0].toUpperCase() + l.slice(1)}</option>`).join('')}</select>
               <button class="icon-btn" data-rm="${m.user_id}" aria-label="Удалить ${esc(m.name)}" style="width:40px;height:40px">${I.close}</button>`
            : `<span class="badge ${m.user_id === o.creator_id ? 'gold' : ''}">${m.user_id === o.creator_id ? 'Создатель' : ROLE[m.role]}</span>`}
        </div>`).join('')}</div>
      ${me.isCreator ? `
        <div class="label">Пригласить по ссылке</div>
        <div class="card">
          <label class="muted" style="font-size:13px" for="irole">Роль приглашённого</label>
          <select class="field" id="irole" style="margin-top:8px"><option value="investor">Инвестор — вкладывает деньги, получает долю</option><option value="foreman">Прораб — ремонт, доля с прибыли</option><option value="viewer">Просмотр — только смотрит</option></select>
          <button class="btn" id="mk" style="margin-top:12px">Создать ссылку</button>
          <div id="link"></div>
        </div>` : `<div class="card gold lock-note" style="margin-top:16px">${I.shield}<span>Приглашать участников и менять роли может только создатель объекта.</span></div>`}
    </div>`;
  on('[data-role]', 'change', async (e) => {
    try { await api('PATCH', `/api/objects/${id}/members/${e.target.dataset.role}`, { role: e.target.value }); toast('Роль изменена. Проверьте доли.', true); delete state.cache[id]; } catch (ex) { toast(ex.message); viewMembers(id); }
  });
  on('[data-rm]', 'click', async (e) => {
    if (!ask('Убрать участника из объекта?')) return;
    try { await api('DELETE', `/api/objects/${id}/members/${e.currentTarget.dataset.rm}`); delete state.cache[id]; viewMembers(id); } catch (ex) { toast(ex.message); }
  });
  const mk = app.querySelector('#mk');
  if (mk) mk.onclick = async () => {
    try {
      const r = await api('POST', `/api/objects/${id}/invites`, { role: app.querySelector('#irole').value });
      const url = r.tg_url || `${location.origin}/#/join/${r.token}`;
      const text = `Приглашение в объект «${o.name}» в Доле`;
      app.querySelector('#link').innerHTML = `
        <div class="field" style="display:flex;align-items:center;margin-top:12px;font-size:13px;color:#B5B5BA;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(url)}</div>
        ${r.tg_url ? '<button class="btn sm" style="width:100%;margin-top:10px" id="tgs">Отправить в Telegram</button>' : ''}
        <div class="btn-row"><button class="btn ghost sm" style="flex:1" id="cp">Скопировать</button>${navigator.share && !TG ? `<button class="btn ${r.tg_url ? 'ghost ' : ''}sm" style="flex:1" id="sh">Поделиться</button>` : ''}</div>
        <div class="muted" style="font-size:12px;margin-top:8px">Ссылка действует 7 дней, роль: ${ROLE[r.role]}.${r.tg_url ? ' Откроется в Telegram-боте.' : ''}</div>`;
      const tgs = app.querySelector('#tgs');
      if (tgs) tgs.onclick = () => openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      app.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована', true); } catch { prompt(I18N.tr('Скопируйте ссылку'), url); } };
      const sh = app.querySelector('#sh');
      if (sh) sh.onclick = () => navigator.share({ title: 'Доля', text, url }).catch(() => {});
    } catch (ex) { toast(ex.message); }
  };
}

async function viewShares(id) {
  const d = await api('GET', `/api/objects/${id}`);
  const { me, object: o, calc: c } = d;
  const creator = d.members.find((m) => m.user_id === o.creator_id);
  const inv = d.members.filter((m) => m.role === 'investor').map((m) => ({ ...m }));
  const frm = d.members.filter((m) => m.role === 'foreman').map((m) => ({ ...m }));
  const edit = me.isCreator;
  const draw = () => {
    const sum = inv.reduce((s, m) => s + (Number(m.share_pct) || 0), 0);
    let preview = '';
    if (c.profit !== null) {
      let fm = 0;
      const lines = [];
      for (const f of frm) {
        let v = 0;
        if (c.profit > 0) v = f.foreman_mode === 'pct' ? (c.profit * f.foreman_value) / 100 : f.foreman_mode === 'fix' ? Number(f.foreman_value) : 0;
        v = Math.max(0, Math.min(v, c.profit - fm));
        fm += v;
        if (f.foreman_mode !== 'none') lines.push([f.name + ', прораб', v]);
      }
      const rest = c.profit - fm;
      for (const m of inv) lines.push([`${m.name} · ${pct(m.share_pct)}`, sum > 0 ? (rest * m.share_pct) / sum : 0]);
      preview = `<div class="card dashed" style="margin-top:16px;font-size:13px"><div class="muted">При прогнозной прибыли ${money(c.profit)}</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${lines.map(([n, v]) => `<div class="kv" style="padding:0"><span>${esc(n)}</span><span class="num">${signed(v)} €</span></div>`).join('')}</div></div>`;
    }
    const stepper = (attr, uid, val, label) => edit
      ? `<div class="stepper"><button data-${attr}-dn="${uid}" aria-label="Уменьшить: ${esc(label)}">${I.minus}</button><input data-${attr}="${uid}" inputmode="decimal" value="${val}" aria-label="${esc(label)}"><button data-${attr}-up="${uid}" aria-label="Увеличить: ${esc(label)}">${I.plusSm}</button></div>`
      : `<div class="display num" style="font-weight:600;font-size:17px">${val}</div>`;
    app.innerHTML = `
      <div class="screen no-tab">
        <div class="topbar">${backBtn(`#/o/${id}`)}<div class="spacer44"></div></div>
        <div class="h-sub" style="margin-top:18px">${esc(o.name)}</div>
        <h1 class="h">Доли</h1>
        <div class="card gold lock-note" style="margin-top:14px">${I.shield}<span>${edit ? 'Доли ставите только вы как создатель объекта. Участники их видят, но изменить не могут.' : `Доли ставит создатель объекта — ${esc(creator ? creator.name : '')}. Вы их видите, но изменить не можете.`}</span></div>
        <div class="label" style="display:flex;justify-content:space-between"><span>Инвесторы · делят прибыль после прораба</span><span class="${Math.abs(sum - 100) > 0.01 ? 'red' : ''}">${pct(sum)}</span></div>
        <div class="card list">${inv.map((m) => `<div class="row">${avatar(m.user_id, m.name)}<div class="grow">${esc(m.name)}${m.user_id === me.user_id ? ' <span class="muted" style="font-size:12px">(вы)</span>' : ''}</div>${stepper('p', m.user_id, m.share_pct, 'Доля ' + m.name + ', %')}<span class="muted">%</span></div>`).join('')}</div>
        ${frm.map((f) => `
          <div class="label" style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:${colorOf(f.user_id)}"></span>${esc(f.name)}, прораб</div>
          ${edit ? `<div class="seg" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[['pct', '% прибыли'], ['fix', 'Сумма'], ['none', 'Без доли']].map(([k, l]) => `<button data-fm="${f.user_id}" data-mode="${k}" class="${f.foreman_mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
          ${f.foreman_mode !== 'none' ? `<div class="card" style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:10px 12px 10px 16px"><div class="grow muted" style="font-size:14px;flex:1">${f.foreman_mode === 'pct' ? 'Доля от прибыли, %' : 'Фиксированная сумма, €'}</div>${stepper('f', f.user_id, f.foreman_value, 'Доля прораба ' + f.name)}</div>`
            : `<div class="muted" style="font-size:13px;margin-top:8px">${edit ? 'Прораб не получает долю с продажи.' : 'Без доли с продажи.'}</div>`}`).join('')}
        ${frm.length === 0 ? '<div class="muted" style="font-size:13px;margin-top:16px">Прораба нет. Его можно пригласить на экране «Участники» с ролью «Прораб».</div>' : ''}
        ${preview}
        ${edit ? `<button class="btn" id="save" style="margin-top:24px">Сохранить доли</button><div class="muted" style="font-size:12px;text-align:center;margin-top:8px">Все участники увидят новые доли сразу</div>` : ''}
      </div>`;
    if (!edit) return;
    const setP = (uid, v) => { const m = inv.find((x) => x.user_id === uid); m.share_pct = Math.max(0, Math.min(100, Math.round(v * 100) / 100)); };
    const setF = (uid, v) => { const f = frm.find((x) => x.user_id === uid); f.foreman_value = Math.max(0, f.foreman_mode === 'pct' ? Math.min(100, v) : v); };
    on('[data-p-dn]', 'click', (e) => { const u = Number(e.currentTarget.dataset.pDn); setP(u, inv.find((x) => x.user_id === u).share_pct - 5); draw(); });
    on('[data-p-up]', 'click', (e) => { const u = Number(e.currentTarget.dataset.pUp); setP(u, inv.find((x) => x.user_id === u).share_pct + 5); draw(); });
    on('[data-p]', 'change', (e) => { setP(Number(e.target.dataset.p), Number(e.target.value.replace(',', '.')) || 0); draw(); });
    const fstep = (f) => (f.foreman_mode === 'pct' ? 1 : 100);
    on('[data-f-dn]', 'click', (e) => { const f = frm.find((x) => x.user_id === Number(e.currentTarget.dataset.fDn)); setF(f.user_id, f.foreman_value - fstep(f)); draw(); });
    on('[data-f-up]', 'click', (e) => { const f = frm.find((x) => x.user_id === Number(e.currentTarget.dataset.fUp)); setF(f.user_id, f.foreman_value + fstep(f)); draw(); });
    on('[data-f]', 'change', (e) => { setF(Number(e.target.dataset.f), Number(e.target.value.replace(',', '.')) || 0); draw(); });
    on('[data-fm]', 'click', (e) => {
      const f = frm.find((x) => x.user_id === Number(e.currentTarget.dataset.fm));
      f.foreman_mode = e.currentTarget.dataset.mode;
      if (f.foreman_mode === 'pct' && (!f.foreman_value || f.foreman_value > 100)) f.foreman_value = 10;
      if (f.foreman_mode === 'fix' && f.foreman_value <= 100) f.foreman_value = 1000;
      draw();
    });
    app.querySelector('#save').onclick = async () => {
      try {
        await api('PUT', `/api/objects/${id}/shares`, { members: [...inv, ...frm].map((m) => ({ user_id: m.user_id, share_pct: m.share_pct, foreman_mode: m.foreman_mode, foreman_value: m.foreman_value })) });
        delete state.cache[id];
        toast('Доли сохранены', true);
        go(`#/o/${id}`);
      } catch (ex) { toast(ex.message); }
    };
  };
  draw();
}

async function viewDelete(id) {
  const d = await api('GET', `/api/objects/${id}`);
  const { me, object: o } = d;
  const voters = d.members.filter((m) => m.role !== 'viewer');
  const agreed = voters.filter((m) => m.delete_vote).length;
  const mine = d.members.find((m) => m.user_id === me.user_id);
  const exportBtn = `<a class="btn ghost" href="/api/objects/${id}/export.csv" style="margin-top:12px">Скачать выгрузку (CSV)</a>`;
  let body;
  if (!o.delete_requested) {
    body = `
      <div class="lead">Объект удалится, только когда согласятся все участники сделки — инвесторы и прорабы. Пока хоть один не подтвердил, все данные остаются.</div>
      ${me.isCreator ? `<button class="btn danger" id="req" style="margin-top:28px">Запросить удаление</button>` : `<div class="card gold lock-note" style="margin-top:20px">${I.shield}<span>Запросить удаление может только создатель объекта. После этого вас попросят подтвердить.</span></div>`}
      ${exportBtn}`;
  } else {
    body = `
      <div class="lead">Объект удалится, только когда согласятся все участники сделки. Любой отказ отменяет запрос.</div>
      <div style="display:flex;justify-content:space-between;margin-top:22px;font-size:13px"><span class="muted">Согласие участников</span><b>${agreed} из ${voters.length}</b></div>
      <div style="display:flex;gap:4px;margin-top:10px">${voters.map((m) => `<i style="flex:1;height:4px;border-radius:2px;background:${m.delete_vote ? 'var(--gold)' : 'var(--line2)'}"></i>`).join('')}</div>
      <div class="card list" style="margin-top:14px">${voters.map((m) => `
        <div class="row">${avatar(m.user_id, m.name)}<div class="grow"><div class="t">${esc(m.name)}${m.user_id === me.user_id ? ' <span class="muted">· вы</span>' : ''}</div><div class="s">${ROLE[m.role]}${m.user_id === o.creator_id ? ' · отправил запрос' : ''}</div></div>
        ${m.delete_vote ? `<span class="gold" style="display:flex;align-items:center;gap:6px;font-size:13px">${I.check}Да</span>` : '<span class="muted" style="font-size:13px">ждём ответа</span>'}</div>`).join('')}</div>
      <div class="card dashed" style="margin-top:14px;font-size:13px;line-height:1.5;color:#B5B5BA">Будут удалены ${d.entries.length} ${plural(d.entries.length, 'операция', 'операции', 'операций')}, все чеки, прогноз и доли. До удаления каждый может скачать выгрузку.</div>
      ${me.canVote && mine && !mine.delete_vote ? `<div class="btn-row" style="margin-top:20px"><button class="btn danger" id="yes" style="flex:1">Согласен удалить</button><button class="btn ghost" id="no" style="flex:1">Против</button></div>` : ''}
      ${me.canVote && mine && mine.delete_vote ? `<button class="btn danger" disabled style="margin-top:20px">Удалить объект · ждём ${voters.length - agreed}</button>` : ''}
      ${me.isCreator ? '<button class="link-btn" id="cancel" style="display:block;margin:12px auto 0;color:var(--text)">Отозвать запрос</button>' : ''}
      ${exportBtn}`;
  }
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${id}`)}<div class="spacer44"></div></div>
      <div class="h-sub" style="margin-top:18px">${esc(o.name)}</div>
      <h1 class="h">Удаление объекта</h1>
      ${body}
    </div>`;
  const done = (r) => {
    if (r.deleted) { toast('Объект удалён', true); go('#/'); } else viewDelete(id);
  };
  const req = app.querySelector('#req');
  if (req) req.onclick = async () => { if (ask('Отправить участникам запрос на удаление объекта?')) try { done(await api('POST', `/api/objects/${id}/delete-request`)); } catch (ex) { toast(ex.message); } };
  const yes = app.querySelector('#yes');
  if (yes) yes.onclick = async () => { if (ask('Подтверждаете удаление объекта?')) try { done(await api('POST', `/api/objects/${id}/delete-vote`, { agree: true })); } catch (ex) { toast(ex.message); } };
  const no = app.querySelector('#no');
  if (no) no.onclick = async () => { try { await api('POST', `/api/objects/${id}/delete-vote`, { agree: false }); toast('Запрос на удаление отклонён', true); viewDelete(id); } catch (ex) { toast(ex.message); } };
  const cancel = app.querySelector('#cancel');
  if (cancel) cancel.onclick = async () => { try { await api('POST', `/api/objects/${id}/delete-cancel`); viewDelete(id); } catch (ex) { toast(ex.message); } };
}

// ---------- роутер ----------
// ---------- доска сделок ----------
const OFFER_STATUS = { pending: 'на проверке', approved: 'опубликовано', rejected: 'не опубликовано', closed: 'снято' };
const offerStatusBadge = (s) => `<span class="badge ${s === 'approved' ? 'green' : s === 'rejected' ? 'red' : s === 'pending' ? 'gold' : ''}">${OFFER_STATUS[s] || s}</span>`;
const dealsLine = (n) => (n ? `${n} ${plural(n, 'закрытая сделка', 'закрытые сделки', 'закрытых сделок')} в Доле` : 'новичок в Доле');
const rangeText = (from, to) => (from ? `${fmt(from)} – ${fmt(to)} €` : `до ${fmt(to)} €`);

function contactBlock(c) {
  if (!c) return '';
  const links = [];
  if (c.telegram) links.push(`<button class="btn sm" data-ext="${esc(c.telegram)}" style="flex:1">Написать в Telegram</button>`);
  if (c.phone) links.push(`<a class="btn ghost sm" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}" style="flex:1">${esc(c.phone)}</a>`);
  if (!links.length && c.email) links.push(`<a class="btn ghost sm" href="mailto:${esc(c.email)}" style="flex:1">${esc(c.email)}</a>`);
  return `<div class="card green" style="margin-top:10px"><div style="font-size:12px;color:#8FC9A3">Контакты открыты</div>
    <div style="font-size:15px;font-weight:500;margin-top:4px">${esc(c.name)}${c.tg_username ? ` <span class="muted" style="font-weight:400">@${esc(c.tg_username)}</span>` : ''}</div>
    ${links.length ? `<div class="btn-row" style="margin-top:10px">${links.join('')}</div>` : '<div class="muted" style="font-size:12px;margin-top:6px">Контактов в профиле нет — договоритесь через бота или общих знакомых.</div>'}</div>`;
}
function bindExt() { on('[data-ext]', 'click', (e) => openExternal(e.currentTarget.dataset.ext)); }

async function viewMarket(tab) {
  tab = tab === 'investors' ? 'investors' : 'deals';
  const d = await api('GET', '/api/market');
  state.market = d;
  const myApproved = d.offers.filter((o) => o.mine && o.status === 'approved');
  const offerCard = (o) => `
    <a class="card" href="#/market/o/${o.id}" style="display:block;margin-top:10px;color:var(--text)${o.photos && o.photos.length ? ';padding-top:0;overflow:hidden' : ''}">
      ${o.photos && o.photos.length ? `<div class="offer-cover" style="background-image:url('/api/market/photos/${o.photos[0]}/image')">${o.photos.length > 1 ? `<span class="offer-count">${I.gallery} ${o.photos.length}</span>` : ''}</div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span data-nt style="font-size:16px;font-weight:600">${esc(o.title)}</span>${o.mine ? offerStatusBadge(o.status) : ''}${o.my_response ? `<span class="badge ${o.my_response === 'accepted' ? 'green' : ''}">${o.my_response === 'accepted' ? 'контакты открыты' : o.my_response === 'declined' ? 'отклонено' : 'вы откликнулись'}</span>` : ''}</div>
      ${o.district ? `<div class="muted" data-nt style="font-size:13px;margin-top:4px">${esc(o.district)}</div>` : ''}
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:12px">
        <div><div class="muted" style="font-size:12px">Нужно от инвестора</div><div class="display num" style="font-size:20px;font-weight:600">${money(o.need_amount)}</div></div>
        <div style="text-align:right">${o.expected_pct !== null ? `<div class="gold num" style="font-size:15px;font-weight:500">≈ ${pct(o.expected_pct)}</div>` : ''}${o.term_months ? `<div class="muted" style="font-size:12px">${o.term_months} ${plural(o.term_months, 'месяц', 'месяца', 'месяцев')}</div>` : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)">${avatar(o.user_id, o.author, 'sm')}<span data-nt style="font-size:13px">${esc(o.author)}</span>${o.comments ? `<span class="muted" style="font-size:12px">· 💬 ${o.comments}</span>` : ''}<span class="muted" style="font-size:12px;margin-left:auto">${o.mine ? (o.responses ? `откликов: ${o.responses}` : 'откликов пока нет') : dealsLine(o.author_deals)}</span></div>
    </a>`;
  const investorCard = (i) => `
    <div class="card" style="margin-top:10px">
      <div style="display:flex;align-items:center;gap:12px">${avatar(i.user_id, i.name)}
        <div style="flex:1;min-width:0"><div data-nt style="font-size:15px;font-weight:500">${esc(i.name)}</div><div class="muted" style="font-size:12px">${dealsLine(i.deals)}</div></div>
        <div class="display num" style="font-weight:600;font-size:16px;white-space:nowrap">${rangeText(i.amount_from, i.amount_to)}</div></div>
      ${i.note ? `<div data-nt style="font-size:13px;line-height:1.45;color:#B5B5BA;margin-top:10px">${esc(i.note)}</div>` : ''}
      ${myApproved.length ? `<button class="btn ghost sm" data-propose="${i.user_id}" style="width:100%;margin-top:12px">Предложить сделку</button>` : ''}
    </div>`;
  const mp = d.my_profile;
  const myProfileCard = mp
    ? `<a class="card ${mp.status === 'approved' ? 'green' : ''}" href="#/market/profile" style="display:flex;align-items:center;gap:12px;margin-top:14px;color:var(--text)">
        <div style="flex:1"><div style="font-size:12px" class="${mp.status === 'approved' ? '' : 'muted'}">${mp.status === 'approved' ? 'Моя анкета инвестора опубликована' : mp.status === 'pending' ? 'Моя анкета на проверке' : 'Анкета не опубликована'}</div>
        <div style="font-size:16px;font-weight:600;margin-top:4px" class="num">${rangeText(mp.amount_from, mp.amount_to)}</div>
        ${mp.status === 'rejected' && mp.reject_reason ? `<div class="red" style="font-size:12px;margin-top:4px">${esc(mp.reject_reason)}</div>` : ''}</div>${I.chev}</a>`
    : `<div class="card" style="margin-top:14px;background:linear-gradient(135deg,#221E16,#17171A)">
        <div style="font-size:17px;font-weight:600">Есть деньги — хотите заработать?</div>
        <div style="font-size:13px;line-height:1.5;color:#B5B5BA;margin-top:6px">Заполните анкету: сколько готовы вложить. Авторы сделок увидят её и предложат вам объекты, а вы откликайтесь на сделки ниже.</div>
        <a class="btn sm" href="#/market/profile" style="margin-top:14px;display:flex">Хочу стать инвестором</a></div>`;
  const deals = d.offers.filter((o) => o.status === 'approved' && !o.mine);
  const mine = d.offers.filter((o) => o.mine && o.status !== 'closed');
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><div class="logo">Доска объявлений</div>${d.moderation ? `<a class="pill" href="#/market/admin">На проверке · ${d.moderation}</a>` : ''}</div>
      <div class="lead" style="margin-top:6px">Объявления о сделках и анкеты инвесторов. Всё публикуется после проверки, контакты открываются, когда обе стороны согласны.</div>
      ${d.inbox ? `<a class="card gold-b" href="#/market/inbox" style="display:flex;align-items:center;gap:10px;margin-top:14px;color:var(--text);border-color:#5A4E33"><span style="flex:1;font-size:14px">Ждут вашего ответа: <b class="gold">${d.inbox}</b></span>${I.chev}</a>` : `<a href="#/market/inbox" class="muted" style="display:block;font-size:13px;margin-top:12px">Мои отклики и предложения →</a>`}
      <div class="seg" style="grid-template-columns:1fr 1fr;margin-top:16px"><button data-mt="deals" class="${tab === 'deals' ? 'on' : ''}">Сделки · ${deals.length}</button><button data-mt="investors" class="${tab === 'investors' ? 'on' : ''}">Инвесторы · ${d.investors.length}</button></div>
      ${tab === 'deals' ? `
        ${myProfileCard}
        <div class="section-h"><h2>Предложения</h2><a class="pill" href="#/market/new">${I.plusSm}Предложить сделку</a></div>
        ${mine.length ? `<div class="label" style="margin-top:4px">Мои предложения</div>${mine.map(offerCard).join('')}<div class="label">От других</div>` : ''}
        ${deals.length ? deals.map(offerCard).join('') : '<div class="card empty">Пока нет опубликованных сделок. Предложите свою — инвесторы увидят её после проверки.</div>'}`
      : `
        ${myProfileCard}
        <div class="section-h"><h2>Инвесторы</h2></div>
        ${myApproved.length ? '' : '<div class="muted" style="font-size:12px;line-height:1.45;margin-bottom:4px">Чтобы предложить сделку инвестору, сначала опубликуйте её во вкладке «Сделки».</div>'}
        ${d.investors.length ? d.investors.map(investorCard).join('') : '<div class="card empty">Пока нет опубликованных анкет инвесторов.</div>'}`}
    </div>
    ${tabbar('market')}`;
  on('[data-mt]', 'click', (e) => go(e.currentTarget.dataset.mt === 'investors' ? '#/market/investors' : '#/market'));
  on('[data-propose]', 'click', (e) => proposeSheet(Number(e.currentTarget.dataset.propose), myApproved));
}

function proposeSheet(investorId, offers) {
  const inv = state.market.investors.find((i) => i.user_id === investorId);
  const sheet = document.createElement('div');
  sheet.className = 'viewer sheet-bg';
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-label="Предложить сделку">
    <div style="font-size:17px;font-weight:600">Предложить сделку</div>
    <div class="muted" style="font-size:13px;margin-top:4px">${esc(inv.name)} · ${rangeText(inv.amount_from, inv.amount_to)}</div>
    <div class="label">Какую сделку</div>
    <div class="chips" style="flex-direction:column;align-items:stretch">${offers.map((o, k) => `<button data-of="${o.id}" class="${k === 0 ? 'on' : ''}" style="text-align:left">${esc(o.title)} · ${money(o.need_amount)}</button>`).join('')}</div>
    <label class="label" for="pmsg">Сообщение (необязательно)</label><input class="field" id="pmsg" maxlength="500">
    <div class="muted" style="font-size:12px;line-height:1.45;margin-top:8px">Инвестор получит уведомление. Если он согласится, вы оба увидите контакты друг друга.</div>
    <div class="btn-row" style="margin-top:16px"><button class="btn ghost" id="pcancel" style="flex:1">Отмена</button><button class="btn" id="psend" style="flex:1">Отправить</button></div>
  </div>`;
  document.body.appendChild(sheet);
  let chosen = offers[0].id;
  sheet.querySelectorAll('[data-of]').forEach((b) => b.addEventListener('click', () => { chosen = Number(b.dataset.of); sheet.querySelectorAll('[data-of]').forEach((x) => x.classList.toggle('on', x === b)); }));
  sheet.querySelector('#pcancel').onclick = () => sheet.remove();
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.remove(); });
  sheet.querySelector('#psend').onclick = async () => {
    try { await api('POST', `/api/market/investors/${investorId}/propose`, { offer_id: chosen, message: sheet.querySelector('#pmsg').value }); sheet.remove(); toast('Предложение отправлено', true); }
    catch (ex) { toast(ex.message); }
  };
}

async function viewMarketProfile() {
  const d = await api('GET', '/api/market');
  const p = d.my_profile || {};
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn('#/market')}<div class="spacer44"></div></div>
      <h1 class="h" style="margin-top:18px">Хочу стать инвестором</h1>
      <div class="lead">Укажите, сколько готовы вложить. После проверки анкету увидят авторы сделок и смогут предложить вам объект. Ваши контакты откроются, только когда вы сами примете предложение.</div>
      ${p.status ? `<div class="${p.status === 'rejected' ? 'warn' : 'card dashed'}" style="margin-top:14px;font-size:13px">${p.status === 'approved' ? 'Анкета опубликована. Если измените её, она снова уйдёт на проверку.' : p.status === 'pending' ? 'Анкета на проверке у администратора.' : `Анкета не опубликована${p.reject_reason ? ': ' + esc(p.reject_reason) : ''}. Исправьте и отправьте снова.`}</div>` : ''}
      <form id="f" novalidate>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="label" for="afrom">От, €</label><input class="field" id="afrom" inputmode="numeric" value="${esc(p.amount_from ?? '')}" placeholder="необязательно"></div>
          <div><label class="label" for="ato">До, €</label><input class="field" id="ato" inputmode="numeric" value="${esc(p.amount_to ?? '')}" placeholder="например 30000"></div>
        </div>
        <label class="label" for="anote">Комментарий (необязательно)</label>
        <input class="field" id="anote" maxlength="500" value="${esc(p.note || '')}" placeholder="Например: Кишинёв, срок до года">
        <button class="btn" style="margin-top:20px">${p.status ? 'Сохранить и отправить на проверку' : 'Отправить на проверку'}</button>
      </form>
      ${p.status ? '<button class="link-btn" id="del" style="display:block;margin:16px auto 0;color:var(--muted)">Убрать анкету с доски</button>' : ''}
    </div>`;
  const clean = (v) => v.replace(/\s/g, '');
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('PUT', '/api/market/profile', { amount_from: clean(app.querySelector('#afrom').value), amount_to: clean(app.querySelector('#ato').value), note: app.querySelector('#anote').value });
      toast('Анкета отправлена на проверку', true); go('#/market/investors');
    } catch (ex) { toast(ex.message); }
  };
  const del = app.querySelector('#del');
  if (del) del.onclick = async () => { if (!ask('Убрать анкету инвестора с доски?')) return; try { await api('DELETE', '/api/market/profile'); go('#/market'); } catch (ex) { toast(ex.message); } };
}

async function viewOfferForm(id) {
  let o = {};
  if (id) { o = (await api('GET', `/api/market/offers/${id}`)).offer; if (!o.mine) return go(`#/market/o/${id}`); }
  const st = { photos: [], existing: o.photos ? [...o.photos] : [] };
  const fields = ['ttl', 'dst', 'prc', 'need', 'pctv', 'term', 'dsc'];
  const keep = () => { const v = {}; fields.forEach((f) => { const el = app.querySelector('#' + f); if (el) v[f] = el.value; }); return v; };
  let vals = { ttl: o.title || '', dst: o.district || '', prc: o.price ?? '', need: o.need_amount ?? '', pctv: o.expected_pct ?? '', term: o.term_months ?? '', dsc: o.description || '' };
  const draw = () => {
    app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(id ? `#/market/o/${id}` : '#/market', 'Закрыть')}<div class="title"><b>${id ? 'Изменить предложение' : 'Предложить сделку'}</b><small>публикуется после проверки</small></div><div class="spacer44"></div></div>
      <form id="f" novalidate>
        <span class="label">Фото объекта</span>
        <div class="thumbs">
          ${st.existing.map((pid) => `<div class="thumb" style="background-image:url('/api/market/photos/${pid}/image')"><button type="button" class="x" data-rmx="${pid}" aria-label="Удалить фото">×</button></div>`).join('')}
          ${st.photos.map((p, k) => `<div class="thumb" style="background-image:url('${p.preview}')"><button type="button" class="x" data-rm="${k}" aria-label="Убрать фото">×</button></div>`).join('')}
          ${st.existing.length + st.photos.length < 10 ? `<label class="add-tile">${I.camera}<span>Камера</span><input type="file" accept="image/*" capture="environment" data-ph aria-label="Сфотографировать объект"></label>
          <label class="add-tile">${I.gallery}<span>Галерея</span><input type="file" accept="image/*" multiple data-ph aria-label="Загрузить фото из галереи"></label>` : ''}
        </div>
        <div class="muted" style="font-size:12px;margin-top:6px">До 10 фото. Первое станет обложкой на доске.</div>
        <label class="label" for="ttl">Объект</label><input class="field" id="ttl" maxlength="120" value="${esc(vals.ttl)}" placeholder="Например: 2 комнаты под ремонт и продажу">
        <label class="label" for="dst">Район, город</label><input class="field" id="dst" maxlength="120" value="${esc(vals.dst)}" placeholder="Ботаника, Кишинёв">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="label" for="prc">Цена объекта, €</label><input class="field" id="prc" inputmode="numeric" value="${esc(vals.prc)}"></div>
          <div><label class="label" for="need">Нужно от инвестора, €</label><input class="field" id="need" inputmode="numeric" value="${esc(vals.need)}"></div>
          <div><label class="label" for="pctv">Ожидаемая доходность, %</label><input class="field" id="pctv" inputmode="decimal" value="${esc(vals.pctv)}"></div>
          <div><label class="label" for="term">Срок, месяцев</label><input class="field" id="term" inputmode="numeric" value="${esc(vals.term)}"></div>
        </div>
        <label class="label" for="dsc">Описание</label>
        <textarea class="field" id="dsc" maxlength="2000" rows="5" style="height:auto;padding-top:12px;line-height:1.45" placeholder="Что за объект, план: покупка, ремонт, продажа или аренда; кто ведёт ремонт; как делится прибыль">${esc(vals.dsc)}</textarea>
        <div class="card dashed" style="margin-top:14px;font-size:12px;line-height:1.5;color:#B5B5BA">Предложение увидят все пользователи Доли после проверки администратором. Ваши контакты откроются только тому инвестору, чей отклик вы примете. Доходность — ваш прогноз, а не гарантия.</div>
        <button class="btn" id="save" style="margin-top:18px">${id ? 'Сохранить и отправить на проверку' : 'Отправить на проверку'}</button>
      </form>
    </div>`;
    on('[data-ph]', 'change', async (e) => {
      vals = keep();
      const files = Array.from(e.target.files || []).slice(0, 10 - st.existing.length - st.photos.length);
      for (const f of files) { try { st.photos.push(await compressImage(f, 1600, 0.8)); } catch (ex) { toast(ex.message); } }
      draw();
    });
    on('[data-rm]', 'click', (e) => { vals = keep(); st.photos.splice(Number(e.currentTarget.dataset.rm), 1); draw(); });
    on('[data-rmx]', 'click', async (e) => {
      if (!ask('Удалить это фото?')) return;
      vals = keep();
      const pid = Number(e.currentTarget.dataset.rmx);
      try { await api('DELETE', `/api/market/photos/${pid}`); st.existing = st.existing.filter((x) => x !== pid); draw(); } catch (ex) { toast(ex.message); }
    });
    const v = (sel) => app.querySelector(sel).value.replace(/\s/g, '').replace(',', '.');
    app.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const btn = app.querySelector('#save'); btn.disabled = true;
      const body = { title: app.querySelector('#ttl').value, district: app.querySelector('#dst').value, description: app.querySelector('#dsc').value, price: v('#prc'), need_amount: v('#need'), expected_pct: v('#pctv'), term_months: v('#term') };
      const photos = st.photos.map((p) => ({ mime: p.mime, data: p.data }));
      try {
        if (photos.length) toast('Загружаю фото…', true);
        let oid = id;
        if (id) { await api('PUT', `/api/market/offers/${id}`, body); if (photos.length) await api('POST', `/api/market/offers/${id}/photos`, { photos }); }
        else oid = (await api('POST', '/api/market/offers', { ...body, photos })).id;
        toast('Отправлено на проверку', true);
        go(`#/market/o/${oid}`);
      } catch (ex) { toast(ex.message); btn.disabled = false; }
    };
  };
  draw();
}

async function viewOffer(id) {
  const o = (await api('GET', `/api/market/offers/${id}`)).offer;
  const mineResp = !o.mine ? o.responses[0] : null;
  const respRow = (r) => `
    <div class="card" style="margin-top:10px">
      <div style="display:flex;align-items:center;gap:12px">${avatar(r.investor_id, r.name)}
        <div style="flex:1;min-width:0"><div data-nt style="font-size:15px;font-weight:500">${esc(r.name)}</div>
        <div class="muted" style="font-size:12px">${r.initiator === 'owner' ? 'вы предложили' : 'отклик'} · ${dateRu(String(r.created_at).slice(0, 10))}${r.amount_to ? ` · ${rangeText(r.amount_from, r.amount_to)}` : ''}</div>
        <div class="muted" style="font-size:12px">${dealsLine(r.deals)}</div></div>
        <span class="badge ${r.status === 'accepted' ? 'green' : r.status === 'declined' ? 'red' : 'gold'}">${r.status === 'accepted' ? 'принят' : r.status === 'declined' ? 'отклонён' : 'ждёт ответа'}</span></div>
      ${r.message ? `<div data-nt style="font-size:13px;line-height:1.45;color:#B5B5BA;margin-top:10px">«${esc(r.message)}»</div>` : ''}
      ${r.can_answer ? `<div class="btn-row" style="margin-top:12px"><button class="btn sm" data-ans="${r.id}" data-acc="1" style="flex:1">Принять — открыть контакты</button><button class="btn ghost sm" data-ans="${r.id}" data-acc="0" style="flex:none;padding:0 16px">Отклонить</button></div>` : ''}
      ${r.contact ? contactBlock(r.contact) : ''}
    </div>`;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn('#/market')}<div class="spacer44"></div></div>
      ${o.photos.length ? `<div class="offer-gallery">${o.photos.map((pid, k) => `<button data-gal="${k}" style="background-image:url('/api/market/photos/${pid}/image')" aria-label="Фото ${k + 1}"></button>`).join('')}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">${o.mine ? offerStatusBadge(o.status) : ''}</div>
      <h1 class="h" data-nt style="margin-top:8px">${esc(o.title)}</h1>
      ${o.district ? `<div class="h-sub" data-nt style="margin-top:4px">${esc(o.district)}</div>` : ''}
      ${o.mine && o.status === 'rejected' && o.reject_reason ? `<div class="warn">Не опубликовано: ${esc(o.reject_reason)}. Исправьте и отправьте снова.</div>` : ''}
      ${o.mine && o.status === 'pending' ? '<div class="card dashed" style="margin-top:12px;font-size:13px">На проверке у администратора. После публикации предложение увидят все инвесторы.</div>' : ''}
      <div class="stats" style="margin-top:16px">
        <div class="stat"><div class="k">Нужно</div><div class="v">${fmt(o.need_amount)}</div></div>
        <div class="stat"><div class="k">Доходность</div><div class="v gold">${o.expected_pct !== null ? '≈ ' + pct(o.expected_pct) : '—'}</div></div>
        <div class="stat"><div class="k">Срок</div><div class="v">${o.term_months ? `${o.term_months} мес.` : '—'}</div></div>
      </div>
      ${o.price ? `<div class="muted" style="font-size:13px;margin-top:10px">Цена объекта: <span class="num" style="color:var(--text)">${money(o.price)}</span></div>` : ''}
      ${o.description ? `<div class="card" data-nt style="margin-top:14px;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(o.description)}</div>` : ''}
      <div class="card" style="display:flex;align-items:center;gap:12px;margin-top:12px">${avatar(o.user_id, o.author)}<div><div style="font-size:15px;font-weight:500"><span data-nt>${esc(o.author)}</span>${o.mine ? ' <span class="muted" style="font-size:12px">(вы)</span>' : ''}</div><div class="muted" style="font-size:12px">${dealsLine(o.author_deals)}</div></div></div>
      ${o.mine ? `
        <div class="label" style="display:flex;justify-content:space-between"><span>Отклики инвесторов</span><span>${o.responses.length}</span></div>
        ${o.responses.length ? o.responses.map(respRow).join('') : '<div class="card empty">Пока откликов нет. Можно самому предложить сделку инвестору во вкладке «Инвесторы».</div>'}
        ${o.status !== 'closed' ? `<div class="btn-row" style="margin-top:20px"><a class="btn ghost sm" href="#/market/o/${o.id}/edit" style="flex:1">Изменить</a><button class="btn ghost sm" id="close" style="flex:1">Снять с доски</button></div>` : '<div class="muted" style="text-align:center;margin-top:20px;font-size:13px">Предложение снято с доски.</div>'}`
      : mineResp ? `
        <div class="label">${mineResp.initiator === 'owner' ? 'Автор предложил вам эту сделку' : 'Ваш отклик'}</div>
        <div class="card" style="margin-top:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="muted" style="font-size:13px">${dateRu(String(mineResp.created_at).slice(0, 10))}</span><span class="badge ${mineResp.status === 'accepted' ? 'green' : mineResp.status === 'declined' ? 'red' : 'gold'}">${mineResp.status === 'accepted' ? 'контакты открыты' : mineResp.status === 'declined' ? 'отклонено' : mineResp.can_answer ? 'ждёт вашего ответа' : 'ждёт ответа автора'}</span></div>
          ${mineResp.message ? `<div data-nt style="font-size:13px;line-height:1.45;color:#B5B5BA;margin-top:8px">«${esc(mineResp.message)}»</div>` : ''}
          ${mineResp.can_answer ? `<div class="btn-row" style="margin-top:12px"><button class="btn sm" data-ans="${mineResp.id}" data-acc="1" style="flex:1">Принять — открыть контакты</button><button class="btn ghost sm" data-ans="${mineResp.id}" data-acc="0" style="flex:none;padding:0 16px">Отклонить</button></div>` : ''}
          ${mineResp.contact ? contactBlock(mineResp.contact) : ''}
        </div>
        ${mineResp.status === 'declined' && o.status === 'approved' ? '<button class="btn ghost" id="respond" style="margin-top:14px">Откликнуться снова</button>' : ''}`
      : o.status === 'approved' ? `
        <label class="label" for="rmsg">Сообщение автору (необязательно)</label><input class="field" id="rmsg" maxlength="500" placeholder="Например: готов вложить 20 000 €">
        <button class="btn" id="respond" style="margin-top:14px">Интересно — откликнуться</button>
        <div class="muted" style="font-size:12px;line-height:1.45;margin-top:10px;text-align:center">Автор получит уведомление. Если он примет отклик, вы оба увидите контакты друг друга.</div>` : ''}
      <div class="label" style="display:flex;justify-content:space-between"><span>Комментарии</span><span>${o.comments.length}</span></div>
      ${o.comments.length ? `<div class="card list">${o.comments.map((c) => `<div class="row" style="align-items:flex-start">${avatar(c.user_id, c.name, 'sm')}
        <div class="grow"><div class="s" style="margin:0"><span data-nt>${esc(c.name)}</span>${c.is_author ? ' <span class="badge gold">автор</span>' : ''} · ${dateRu(String(c.created_at).slice(0, 10))}</div>
        <div data-nt style="font-size:14px;line-height:1.45;margin-top:4px;white-space:pre-wrap;word-break:break-word">${esc(c.text)}</div></div>
        ${c.can_delete ? `<button class="link-btn" data-cdel="${c.id}" aria-label="Удалить комментарий" style="color:var(--muted);font-size:18px;padding:0 4px">×</button>` : ''}</div>`).join('')}</div>` : '<div class="muted" style="font-size:13px">Задайте вопрос автору или добавьте уточнение — комментарии видят все, кто смотрит сделку.</div>'}
      ${o.status !== 'closed' && (o.status === 'approved' || o.mine) ? `<div style="display:flex;gap:8px;margin-top:10px"><textarea class="field" id="ctext" rows="1" maxlength="1000" placeholder="${o.mine ? 'Уточнение к сделке' : 'Вопрос или комментарий'}" style="flex:1;height:auto;min-height:48px;padding-top:13px;line-height:1.4;resize:none"></textarea><button class="btn sm" id="csend" style="flex:none;padding:0 18px;height:48px">Отправить</button></div>` : ''}
      ${state.me.is_admin && o.status === 'pending' ? `<div class="label">Проверка</div><div class="btn-row"><button class="btn sm" data-mod="1" style="flex:1">Опубликовать</button><button class="btn ghost sm" data-mod="0" style="flex:1">Отклонить</button></div>` : ''}
    </div>`;
  bindExt();
  on('[data-gal]', 'click', (e) => openViewer(o.photos, Number(e.currentTarget.dataset.gal), '/api/market/photos/'));
  const ct = app.querySelector('#ctext');
  if (ct) ct.addEventListener('input', () => { ct.style.height = 'auto'; ct.style.height = Math.min(ct.scrollHeight, 160) + 'px'; });
  const cs = app.querySelector('#csend');
  if (cs) cs.onclick = async () => {
    const text = ct.value.trim(); if (!text) return;
    cs.disabled = true;
    try { await api('POST', `/api/market/offers/${id}/comments`, { text }); await viewOffer(id); const l = app.querySelector('#ctext'); if (l) l.scrollIntoView({ block: 'center' }); } catch (ex) { toast(ex.message); cs.disabled = false; }
  };
  on('[data-cdel]', 'click', async (e) => {
    if (!ask('Удалить комментарий?')) return;
    try { await api('DELETE', `/api/market/comments/${e.currentTarget.dataset.cdel}`); viewOffer(id); } catch (ex) { toast(ex.message); }
  });
  const rb = app.querySelector('#respond');
  if (rb) rb.onclick = async () => {
    const msg = app.querySelector('#rmsg');
    try { await api('POST', `/api/market/offers/${id}/respond`, { message: msg ? msg.value : '' }); toast('Отклик отправлен автору', true); viewOffer(id); } catch (ex) { toast(ex.message); }
  };
  on('[data-ans]', 'click', async (e) => {
    const acc = e.currentTarget.dataset.acc === '1';
    if (!acc && !ask('Отклонить?')) return;
    try { await api('POST', `/api/market/responses/${e.currentTarget.dataset.ans}/answer`, { accept: acc }); toast(acc ? 'Контакты открыты' : 'Отклонено', true); viewOffer(id); } catch (ex) { toast(ex.message); }
  });
  const cl = app.querySelector('#close');
  if (cl) cl.onclick = async () => { if (!ask('Снять предложение с доски? Ожидающие отклики будут отклонены.')) return; try { await api('POST', `/api/market/offers/${id}/close`); go('#/market'); } catch (ex) { toast(ex.message); } };
  on('[data-mod]', 'click', (e) => moderate('offer', id, e.currentTarget.dataset.mod === '1', () => viewOffer(id)));
}

async function moderate(kind, id, approve, after) {
  let reason = '';
  if (!approve) { reason = prompt(I18N.tr('Причина (автор её увидит):')); if (reason === null) return; }
  try { await api('POST', `/api/market/admin/${kind}/${id}`, { approve, reason }); toast(approve ? 'Опубликовано' : 'Отклонено', true); after(); } catch (ex) { toast(ex.message); }
}

async function viewMarketInbox() {
  const d = await api('GET', '/api/market/inbox');
  const st = { pending: 'ждёт ответа', accepted: 'контакты открыты', declined: 'отклонено' };
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn('#/market')}<div class="title"><b>Отклики и предложения</b></div><div class="spacer44"></div></div>
      ${d.items.length ? `<div class="card list" style="margin-top:16px">${d.items.map((i) => `<a class="row" href="#/market/o/${i.offer_id}" style="color:var(--text)">
        <div class="grow"><div class="t" data-nt style="font-size:14px">${esc(i.title)}</div>
        <div class="s">${i.incoming ? (i.role === 'owner' ? 'Отклик от' : 'Вам предлагает') : (i.role === 'owner' ? 'Вы предложили' : 'Вы откликнулись')}: ${esc(i.other_name)}</div></div>
        <div class="r">${i.can_answer ? '<span class="badge gold">ответить</span>' : `<span class="muted" style="font-size:12px">${st[i.status]}</span>`}</div></a>`).join('')}</div>`
      : '<div class="empty">Пока нет откликов и предложений.</div>'}
    </div>`;
}

async function viewMarketAdmin() {
  if (!state.me.is_admin) return go('#/market');
  const d = await api('GET', '/api/market/admin');
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn('#/market')}<div class="title"><b>Проверка</b><small>доска сделок</small></div><div class="spacer44"></div></div>
      <div class="label">Предложения сделок · ${d.offers.length}</div>
      ${d.offers.length ? d.offers.map((o) => `<div class="card" style="margin-top:10px">
        <a href="#/market/o/${o.id}" style="color:var(--text);font-size:15px;font-weight:600">${esc(o.title)}</a>
        <div class="muted" style="font-size:12px;margin-top:4px">${esc(o.author)} · ${dealsLine(o.author_deals)}${o.district ? ' · ' + esc(o.district) : ''}</div>
        <div style="font-size:13px;margin-top:6px">Нужно <b class="num">${money(o.need_amount)}</b>${o.expected_pct !== null ? ` · ≈ ${pct(o.expected_pct)}` : ''}${o.term_months ? ` · ${o.term_months} мес.` : ''}</div>
        ${o.description ? `<div data-nt style="font-size:13px;line-height:1.45;color:#B5B5BA;margin-top:6px;white-space:pre-wrap">${esc(o.description)}</div>` : ''}
        <div class="btn-row" style="margin-top:12px"><button class="btn sm" data-k="offer" data-id="${o.id}" data-ok="1" style="flex:1">Опубликовать</button><button class="btn ghost sm" data-k="offer" data-id="${o.id}" data-ok="0" style="flex:1">Отклонить</button></div></div>`).join('') : '<div class="card empty">Нет новых предложений.</div>'}
      <div class="label">Анкеты инвесторов · ${d.profiles.length}</div>
      ${d.profiles.length ? d.profiles.map((p) => `<div class="card" style="margin-top:10px">
        <div style="display:flex;align-items:center;gap:12px">${avatar(p.user_id, p.name)}<div style="flex:1"><div data-nt style="font-size:15px;font-weight:500">${esc(p.name)}</div><div class="muted" style="font-size:12px">${dealsLine(p.deals)}</div></div><b class="num">${rangeText(p.amount_from, p.amount_to)}</b></div>
        ${p.note ? `<div data-nt style="font-size:13px;color:#B5B5BA;margin-top:8px">${esc(p.note)}</div>` : ''}
        <div class="btn-row" style="margin-top:12px"><button class="btn sm" data-k="profile" data-id="${p.user_id}" data-ok="1" style="flex:1">Опубликовать</button><button class="btn ghost sm" data-k="profile" data-id="${p.user_id}" data-ok="0" style="flex:1">Отклонить</button></div></div>`).join('') : '<div class="card empty">Нет новых анкет.</div>'}
    </div>`;
  on('[data-ok]', 'click', (e) => { const b = e.currentTarget.dataset; moderate(b.k, b.id, b.ok === '1', viewMarketAdmin); });
}


async function viewAdminUsers() {
  if (!state.me.is_admin) return go('#/profile');
  const st = await api('GET', '/api/admin/stats');
  const tile = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="muted" style="font-size:11px;margin-top:2px">${sub}</div>` : ''}</div>`;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn('#/profile')}<div class="title"><b>Пользователи</b><small>статистика Доли</small></div><div class="spacer44"></div></div>
      <div class="stats" style="margin-top:18px">${tile('Всего', st.users_total, `+${st.users_new_7} за 7 дней`)}${tile('Активны', st.users_active_7, 'за 7 дней')}${tile('В боте', st.bot_total, st.bot_only ? `${st.bot_only} без входа` : 'все вошли')}</div>
      <a class="btn ghost sm" href="#/admin/objects" style="width:100%;margin-top:10px">Все сделки и объекты · проверка</a>
      <div class="stats" style="margin-top:8px">${tile('Объекты', st.objects_active, 'в работе')}${tile('Продано', st.objects_closed, 'сделок')}${tile('Доска', st.offers + st.investors, `${st.offers} ${plural(st.offers, 'сделка', 'сделки', 'сделок')} · ${st.investors} инв.`)}</div>
      <div class="muted" style="font-size:12px;line-height:1.45;margin-top:10px">«В боте» — все, кто открывал бота${state.bot ? ` <span data-nt>@${esc(state.bot)}</span>` : ''}; «без входа» — написали боту, но ещё не открыли приложение. Подсчёт написавших боту ведётся с этого обновления.</div>
      <div class="label" style="display:flex;justify-content:space-between"><span>Зарегистрированы</span><span>${st.users.length}</span></div>
      <div class="card list">${st.users.map((u) => `<a class="row" href="#/admin/u/${u.id}" style="color:var(--text)">${avatar(u.id, u.name)}
        <div class="grow"><div class="t" style="font-size:14px">${esc(u.name)}${u.is_admin ? ' <span class="badge gold">админ</span>' : ''}</div>
          <div class="s">${u.tg_username ? `<span data-nt>@${esc(u.tg_username)}</span>` : u.tg ? 'Telegram' : 'email'} · ${dateRu(u.joined)}${u.seen ? ` · ${I18N.tr('был')} ${dateRu(u.seen)}` : ''}</div></div>
        <div class="r"><div class="num" style="font-size:14px">${u.objects}</div><div class="muted" style="font-size:11px">${plural(u.objects, 'объект', 'объекта', 'объектов')}</div></div></a>`).join('')}</div>
    </div>`;
}


const adminObjRow = (o) => `<a class="row" href="#/o/${o.id}" style="color:var(--text)">
  <div class="grow"><div class="t" style="font-size:14px"><span data-nt>${esc(o.name)}</span> <span class="badge ${esc(o.status)}">${esc(o.status)}</span>${o.role ? ` <span class="muted" style="font-size:12px">· ${esc(ROLE_RU[o.role] || o.role)}</span>` : ''}</div>
    <div class="s">${esc(o.creator)} · ${dateRu(o.created)} · ${o.people} ${plural(o.people, 'участник', 'участника', 'участников')} · ${o.ops} ${plural(o.ops, 'операция', 'операции', 'операций')} · ${o.receipts} ${plural(o.receipts, 'чек', 'чека', 'чеков')}</div>
    ${o.checked ? `<div class="s okc" style="font-size:11px">проверено ${dateRu(o.checked)}</div>` : ''}</div>
  <div class="r"><div class="num" style="font-size:14px">${money(o.spent)}</div><div class="muted" style="font-size:11px">расходы</div></div></a>`;
const ROLE_RU = { investor: 'инвестор', foreman: 'прораб', viewer: 'просмотр' };

async function viewAdminObjects() {
  if (!state.me.is_admin) return go('#/profile');
  const d = await api('GET', '/api/admin/objects');
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn('#/admin/users')}<div class="title"><b>Все сделки</b><small>проверка на мошенничество</small></div><div class="spacer44"></div></div>
      <div class="muted" style="font-size:12px;line-height:1.45;margin-top:14px">Только просмотр: операции, чеки, доли, договоры и авансы. Каждый ваш просмотр записывается в журнал.</div>
      ${d.objects.length ? `<div class="card list" style="margin-top:12px">${d.objects.map(adminObjRow).join('')}</div>` : '<div class="empty">Объектов пока нет.</div>'}
    </div>`;
}

async function viewAdminUser(uid) {
  if (!state.me.is_admin) return go('#/profile');
  const d = await api('GET', `/api/admin/users/${uid}`);
  const u = d.user;
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn('#/admin/users')}<div class="spacer44"></div></div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:18px">${avatar(u.id, u.name, 'lg')}<div><h1 class="h" style="margin:0;font-size:24px">${esc(u.name)}</h1>
        <div class="muted" style="font-size:13px">${u.tg_username ? `<span data-nt>@${esc(u.tg_username)}</span> · ` : ''}в Доле с ${dateRu(u.joined)}${u.seen ? ` · был ${dateRu(u.seen)}` : ''}</div></div></div>
      <div class="card" style="margin-top:14px;font-size:14px">
        <div class="kv"><span class="muted">Email</span><span data-nt>${esc(u.email)}</span></div>
        ${u.phone ? `<div class="kv"><span class="muted">Телефон</span><span>${esc(u.phone)}</span></div>` : ''}
        ${d.investor ? `<div class="kv"><span class="muted">Анкета инвестора</span><span class="num">${rangeText(d.investor.amount_from, d.investor.amount_to)} · ${OFFER_STATUS[d.investor.status] || d.investor.status}</span></div>` : ''}
      </div>
      ${u.tg_username ? `<button class="btn ghost sm" data-ext="https://t.me/${esc(u.tg_username)}" style="width:100%;margin-top:10px">Написать в Telegram</button>` : ''}
      <div class="label" style="display:flex;justify-content:space-between"><span>Объекты</span><span>${d.objects.length}</span></div>
      ${d.objects.length ? `<div class="card list">${d.objects.map(adminObjRow).join('')}</div>` : '<div class="card empty">Нет объектов.</div>'}
      ${d.offers.length ? `<div class="label">Предложения на доске</div><div class="card list">${d.offers.map((o) => `<a class="row" href="#/market/o/${o.id}" style="color:var(--text)"><div class="grow"><div class="t" data-nt style="font-size:14px">${esc(o.title)}</div><div class="s">${OFFER_STATUS[o.status] || o.status}</div></div><div class="r num">${money(o.need_amount)}</div></a>`).join('')}</div>` : ''}
    </div>`;
  bindExt();
}

const routes = [
  [/^#\/admin\/objects$/, () => viewAdminObjects()],
  [/^#\/admin\/u\/(\d+)$/, (m) => viewAdminUser(m[1])],
  [/^#\/admin\/users$/, () => viewAdminUsers()],
  [/^#\/market$/, () => viewMarket('deals')],
  [/^#\/market\/investors$/, () => viewMarket('investors')],
  [/^#\/market\/profile$/, () => viewMarketProfile()],
  [/^#\/market\/new$/, () => viewOfferForm()],
  [/^#\/market\/inbox$/, () => viewMarketInbox()],
  [/^#\/market\/admin$/, () => viewMarketAdmin()],
  [/^#\/market\/o\/(\d+)$/, (m) => viewOffer(m[1])],
  [/^#\/market\/o\/(\d+)\/edit$/, (m) => viewOfferForm(m[1])],
  [/^#\/login$/, () => viewAuth('login'), true],
  [/^#\/register$/, () => viewAuth('register'), true],
  [/^#\/join\/([\w-]+)$/, (m) => viewJoin(m[1]), true],
  [/^#\/profile$/, () => viewProfile()],
  [/^#\/name$/, () => viewName()],
  [/^#\/o\/(\d+)\/contract$/, (m) => viewContract(m[1])],
  [/^#\/new$/, () => viewObjectForm(null)],
  [/^#\/o\/(\d+)$/, (m) => viewObject(m[1])],
  [/^#\/o\/(\d+)\/edit$/, (m) => viewObjectForm(m[1])],
  [/^#\/o\/(\d+)\/add(?:\/(\w+))?$/, (m) => viewAdd(m[1], m[2])],
  [/^#\/o\/(\d+)\/forecast$/, (m) => viewForecast(m[1])],
  [/^#\/o\/(\d+)\/advance$/, (m) => viewAdvance(m[1])],
  [/^#\/o\/(\d+)\/deal$/, (m) => viewDeal(m[1])],
  [/^#\/o\/(\d+)\/report$/, (m) => viewReport(m[1])],
  [/^#\/adv\/(\d+)$/, (m) => viewAdvContract(m[1])],
  [/^#\/o\/(\d+)\/members$/, (m) => viewMembers(m[1])],
  [/^#\/o\/(\d+)\/shares$/, (m) => viewShares(m[1])],
  [/^#\/o\/(\d+)\/delete$/, (m) => viewDelete(m[1])],
  [/^#\/e\/(\d+)$/, (m) => viewEntry(m[1])],
  [/^#\/e\/(\d+)\/edit$/, (m) => viewEntryEdit(m[1])],
  [/^#?\/?$/, () => viewHome()]
];

async function render() {
  const hash = location.hash || '#/';
  document.querySelectorAll('.viewer').forEach((v) => v.remove());
  for (const [re, fn, isPublic] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    if (!isPublic && !state.me) return go('#/login');
    if (state.me && state.me.needs_name && hash !== '#/name') return go('#/name');
    try {
      await fn(m);
      window.scrollTo(0, 0);
    } catch (e) {
      if (state.me) {
        app.innerHTML = `<div class="screen"><div class="topbar">${backBtn('#/')}</div><div class="empty">${esc(e.message)}</div></div>`;
      }
    }
    return;
  }
  go('#/');
}

function setupTelegram() {
  document.body.classList.add('tg');
  TG.ready();
  TG.expand();
  try { TG.setHeaderColor('#0D0D0E'); TG.setBackgroundColor('#0D0D0E'); } catch { /* старый клиент */ }
  const syncBack = () => {
    const h = location.hash || '#/';
    if (h === '#/' || h === '#') TG.BackButton.hide(); else TG.BackButton.show();
  };
  TG.BackButton.onClick(() => history.length > 1 ? history.back() : go('#/'));
  window.addEventListener('hashchange', syncBack);
  syncBack();
}

(async function boot() {
  let startParam = '';
  if (TG) {
    setupTelegram();
    try {
      const d = await api('POST', '/api/tg-login', { initData: TG.initData });
      state.me = d.user;
      sessionToken.set(d.token);
      startParam = d.startParam || '';
    } catch (e) {
      app.innerHTML = `<div class="auth-wrap"><div class="auth-logo">Доля</div><div class="lead">${esc(e.message)}</div></div>`;
      return;
    }
  }
  try {
    const headers = sessionToken.get() ? { 'X-Session': sessionToken.get() } : {};
    const d = await fetch('/api/me', { credentials: 'same-origin', headers });
    if (d.ok) {
      const j = await d.json();
      state.me = j.user;
      state.categories = j.categories;
      state.bot = j.bot;
      state.settings = j.settings || state.settings;
    }
  } catch { /* офлайн */ }
  if (state.me && state.me.lang) {
    let explicit = '';
    try { explicit = localStorage.getItem('dolya_lang') || ''; } catch { /* нет доступа */ }
    if (!explicit && state.me.lang !== I18N.lang) { I18N.set(state.me.lang); location.reload(); return; }
    if (explicit && explicit !== state.me.lang) api('PATCH', '/api/me', { lang: explicit }).catch(() => {});
  }
  window.addEventListener('hashchange', render);
  if (startParam.startsWith('join_')) return go(`#/join/${startParam.slice(5)}`);
  if (TG) {
    const inv = sessionStorage.getItem('invite');
    if (inv && (location.hash || '#/') === '#/') return go(`#/join/${inv}`);
  }
  render();
})();
