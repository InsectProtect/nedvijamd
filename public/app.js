'use strict';
/* Доля — клиент. Без сборки, без зависимостей. */

const app = document.getElementById('app');
const state = { me: null, categories: [], cache: {}, bot: null };
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
const KIND = { in: 'Взнос', out: 'Расход', plan: 'План' };
const STATUSES = ['покупка', 'ремонт', 'сдаётся', 'продаётся', 'продана'];
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dateRu = (d) => {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  const mon = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][Number(m) - 1];
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
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7 8l5-5 5 5"/></svg>'
};

function toast(msg, good = false) {
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

const backBtn = (href, label = 'Назад') => `<a class="icon-btn" href="${href}" aria-label="${label}">${I.back}</a>`;
const tabbar = (active, plusHref) => `
  <nav class="tabbar" aria-label="Навигация">
    <a href="#/" class="${active === 'home' ? 'on' : ''}" aria-label="Объекты">${I.grid}</a>
    ${plusHref ? `<a href="${plusHref}" class="plus" aria-label="Добавить">${I.plus}</a>` : ''}
    <a href="#/profile" class="${active === 'profile' ? 'on' : ''}" aria-label="Профиль">${I.user}</a>
  </nav>`;

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
function openViewer(ids, start = 0) {
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
        <a class="icon-btn" href="/api/receipts/${ids[i]}/image" target="_blank" rel="noopener" aria-label="Открыть отдельно">${I.share}</a>
      </div>
      <div class="stage"><img src="/api/receipts/${ids[i]}/image" alt="Фото чека ${i + 1}"></div>
      <div class="muted" style="text-align:center;font-size:12px">Двойное касание — увеличить · свайп — следующий</div>
      <div class="strip">${ids.map((id, k) => `<button class="${k === i ? 'on' : ''}" data-k="${k}" aria-label="Чек ${k + 1}" style="background-image:url('/api/receipts/${id}/image')"></button>`).join('')}</div>`;
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
      <div class="auth-logo">Доля</div>
      <div class="lead">Учёт совместных вложений в недвижимость: кто сколько вложил, на что потратил и сколько заработает.</div>
      ${inviteNote}
      <form id="f" style="margin-top:28px" novalidate>
        ${reg ? '<label class="label" for="name">Имя</label><input class="field" id="name" autocomplete="name" required>' : ''}
        <label class="label" for="email">Email</label>
        <input class="field" id="email" type="email" autocomplete="email" inputmode="email" required>
        <label class="label" for="pw">Пароль</label>
        <input class="field" id="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6">
        <div class="err" id="err" role="alert"></div>
        <button class="btn" style="margin-top:12px">${reg ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
      <a href="${reg ? '#/login' : '#/register'}" style="text-align:center;margin-top:18px;font-size:14px">${reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</a>
    </div>`;
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const err = app.querySelector('#err');
    err.textContent = '';
    const body = { email: app.querySelector('#email').value, password: app.querySelector('#pw').value };
    if (reg) body.name = app.querySelector('#name').value;
    try {
      const d = await api('POST', reg ? '/api/register' : '/api/login', body);
      state.me = d.user;
      sessionToken.set(d.token);
      const inv = sessionStorage.getItem('invite');
      go(inv ? `#/join/${inv}` : '#/');
    } catch (ex) {
      err.textContent = ex.message;
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
  const list = d.objects.map((o) => `
    <a class="obj" href="#/o/${o.id}">
      <div style="flex:1 1 auto;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="name">${esc(o.name)}</span><span class="badge ${esc(o.status)}">${esc(o.status)}</span>${o.delete_requested ? '<span class="badge red">удаление</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <span style="display:flex">${o.people.slice(0, 5).map((p) => avatar(p.user_id, p.name, 'sm')).join('')}</span>
          <span class="muted" style="font-size:12px">${roleLine(o)}</span>
        </div>
      </div>
      <div style="text-align:right">
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
      <div class="muted" style="font-size:13px;margin-top:4px">${d.objects.length} ${plural(d.objects.length, 'объект', 'объекта', 'объектов')} · ${t.partners} ${plural(t.partners, 'партнёр', 'партнёра', 'партнёров')}</div>
      ${d.objects.some((o) => o.my_profit !== null) ? `<div class="chip">${I.trend}Моя прибыль ≈ ${signed(t.profit)} €</div>` : ''}
      <div class="section-h"><h2>Объекты</h2><a class="pill" href="#/new">${I.plusSm}Объект</a></div>
      ${list || `<div class="card empty">Пока нет объектов.<br>Создайте первый и пригласите партнёров по ссылке.<div style="margin-top:16px"><a class="btn sm" href="#/new" style="display:inline-flex">Создать объект</a></div></div>`}
    </div>
    ${tabbar('home', '#/new')}`;
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function viewProfile() {
  app.innerHTML = `
    <div class="screen">
      <div class="topbar">${backBtn('#/')}<div class="spacer44"></div></div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:20px">${avatar(state.me.id, state.me.name, 'lg')}
        <div><div style="font-size:17px;font-weight:600">${esc(state.me.name)}</div><div class="muted" style="font-size:13px">${esc(state.me.email || (state.me.tg_username ? '@' + state.me.tg_username : 'вход через Telegram'))}</div></div></div>
      <div class="card" style="margin-top:24px;font-size:14px;line-height:1.55;color:#B5B5BA">
        Вы видите все операции по своим объектам, но вносите только свои. Доли ставит создатель объекта, удалить объект можно только с согласия всех участников сделки.
      </div>
      <div class="card" style="margin-top:10px;font-size:14px;line-height:1.55;color:#B5B5BA">
        Совет: добавьте «Долю» на экран телефона. На iPhone — «Поделиться» → «На экран Домой», на Android — меню браузера → «Установить приложение».
      </div>
      ${state.bot ? (state.me.telegram
        ? `<div class="card" style="margin-top:10px;display:flex;align-items:center;gap:10px;font-size:14px"><span class="gold" style="display:inline-flex">${I.check}</span>Telegram подключён${state.me.tg_username ? ` · @${esc(state.me.tg_username)}` : ''}. Уведомления приходят в бот.</div>`
        : `<div class="card" style="margin-top:10px;font-size:14px;line-height:1.5;color:#B5B5BA">Подключите Telegram, чтобы получать уведомления о расходах, долях и удалении и входить в Долю прямо из бота.<button class="btn sm" id="tglink" style="margin-top:12px;display:flex">Подключить Telegram</button></div>`) : ''}
      ${TG ? '' : '<button class="btn ghost" id="out" style="margin-top:24px">Выйти</button>'}
    </div>
    ${tabbar('profile', null)}`;
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
  let o = { name: '', area: '', status: 'покупка', sale_price: '' };
  if (id) {
    const d = await api('GET', `/api/objects/${id}`);
    if (!d.me.isCreator) { toast('Редактировать может только создатель'); return go(`#/o/${id}`); }
    o = d.object;
  }
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(id ? `#/o/${id}` : '#/')}<div class="title"><b>${id ? 'Объект' : 'Новый объект'}</b></div><div class="spacer44"></div></div>
      <form id="f">
        <label class="label" for="name">Название</label>
        <input class="field" id="name" placeholder="Например: Ботаника, 2 комн." value="${esc(o.name)}" required>
        <label class="label" for="area">Площадь, м²</label>
        <input class="field" id="area" inputmode="decimal" value="${esc(o.area ?? '')}">
        <label class="label" for="status">Статус</label>
        <select class="field" id="status">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <label class="label" for="sale">Ориентировочная цена продажи, €</label>
        <input class="field" id="sale" inputmode="decimal" value="${esc(o.sale_price ?? '')}" placeholder="Можно указать позже">
        ${id ? '' : '<div class="card gold" style="margin-top:20px;font-size:13px;line-height:1.5">Вы станете создателем: будете ставить доли, приглашать участников и управлять удалением.</div>'}
        <button class="btn" style="margin-top:24px">${id ? 'Сохранить' : 'Создать объект'}</button>
      </form>
    </div>`;
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name: app.querySelector('#name').value,
      area: app.querySelector('#area').value.replace(',', '.'),
      status: app.querySelector('#status').value,
      sale_price: app.querySelector('#sale').value.replace(/\s/g, '').replace(',', '.')
    };
    try {
      if (id) { await api('PATCH', `/api/objects/${id}`, body); go(`#/o/${id}`); }
      else { const r = await api('POST', '/api/objects', body); go(`#/o/${r.id}`); }
    } catch (ex) { toast(ex.message); }
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

async function viewObject(id, filter = 'all') {
  const d = await api('GET', `/api/objects/${id}`);
  state.cache[id] = d;
  const { object: o, calc: c, me } = d;
  const meName = (m) => esc(m.name) + (m.user_id === me.user_id ? ' <span class="muted" style="font-size:12px">(вы)</span>' : '');
  const filters = [['all', 'Все'], ['in', 'Взносы'], ['out', 'Факт'], ['plan', 'План']];
  const entries = d.entries.filter((e) => filter === 'all' || e.kind === filter);
  const entryRow = (e) => {
    const title = e.note || e.category || KIND[e.kind];
    const sub = [e.kind === 'plan' ? 'план' : e.kind === 'in' ? 'взнос' : e.source === 'pool' ? 'из общих' : 'из своих', e.kind !== 'in' && e.note ? e.category : null, dateRu(e.entry_date)].filter(Boolean).join(' · ');
    const amt = e.kind === 'in' ? `<span class="gold">+${fmt(e.amount)} €</span>` : e.kind === 'out' ? `−${fmt(e.amount)} €` : `<span class="muted">${fmt(e.amount)} €</span>`;
    return `<a class="row" href="#/e/${e.id}">${avatar(e.user_id, e.author)}
      <div class="grow"><div class="t" style="font-size:14px">${esc(title)}</div>
      <div class="s">${esc(sub)}${e.receipts ? ` · <span class="gold" style="display:inline-flex;align-items:center;gap:3px">${I.receipt}${e.receipts}</span>` : ''}</div></div>
      <div class="r num" style="font-size:14px">${amt}</div></a>`;
  };
  app.innerHTML = `
    <div class="screen">
      <div class="topbar">${backBtn('#/')}
        <div style="display:flex;gap:8px">
          ${me.isCreator ? `<a class="icon-btn" href="#/o/${id}/edit" aria-label="Редактировать объект"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></a>` : ''}
          <a class="icon-btn" href="#/o/${id}/delete" aria-label="Удаление и выгрузка">${I.more}</a>
        </div>
      </div>
      <div class="h-sub" style="margin-top:18px">${o.area ? `${fmt(o.area)} м² · ` : ''}${esc(o.status)}</div>
      <h1 class="h">${esc(o.name)}</h1>
      ${o.delete_requested ? `<a class="card gold" href="#/o/${id}/delete" style="display:block;margin-top:14px;font-size:14px">Создатель запросил удаление объекта. ${me.canVote ? 'Нужен ваш ответ →' : 'Идёт голосование →'}</a>` : ''}
      <div class="stats">
        <div class="stat"><div class="k">Вложено</div><div class="v">${fmt(c.totalInvested)}</div></div>
        <div class="stat"><div class="k">Затраты · факт</div><div class="v gold">${fmt(c.factTotal)}</div></div>
        <div class="stat"><div class="k">Затраты · план</div><div class="v">${fmt(c.planTotal)}</div></div>
      </div>
      ${c.totalIn > 0 ? `<div class="muted" style="font-size:12px;margin-top:8px">В общем котле: <span class="num" style="color:var(--text)">${money(c.poolBalance)}</span></div>` : ''}

      <a class="card" href="#/o/${id}/forecast" style="display:flex;align-items:center;gap:14px;margin-top:12px;color:var(--text)">
        <div style="flex:1">${c.profit !== null
          ? `<div class="muted" style="font-size:12px">Прогноз продажи · ≈ ${money(c.salePrice)}</div>
             <div style="font-size:15px;font-weight:500;margin-top:4px">Прибыль ≈ <span class="${c.profit >= 0 ? 'gold' : 'red'} num">${signed(c.profit)} €</span>${c.roi !== null ? ` <span class="muted" style="font-size:13px;font-weight:400">· ${pct(c.roi)}</span>` : ''}</div>`
          : `<div class="muted" style="font-size:12px">Прогноз продажи</div><div style="font-size:15px;margin-top:4px">План, факт и ${me.isCreator ? 'цена продажи' : 'прибыль'}</div>`}</div>${I.chev}
      </a>

      <div class="card list" style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 4px;font-size:13px">
          <a href="#/o/${id}/members" class="muted">Участники · ${d.members.length}</a>
          <span style="display:flex;gap:16px"><a href="#/o/${id}/shares">Доли</a><a href="#/o/${id}/members">${me.isCreator ? 'Пригласить' : 'Все'}</a></span>
        </div>
        <div class="rows">${d.members.map((m) => `
          <div class="row" style="padding:9px 0">${avatar(m.user_id, m.name)}
            <div class="grow"><div class="t" style="font-size:14px">${meName(m)}</div><div class="s">${ROLE[m.role]}${m.user_id === o.creator_id ? ' · создатель' : ''}</div></div>
            <div class="r num" style="font-size:13px">${memberLine(m)}</div></div>`).join('')}</div>
      </div>

      ${c.settlement.length ? `<div class="card gold" style="margin-top:10px">
        <div style="font-size:12px;color:#B8A98A">Взаиморасчёт: чтобы вложения совпали с долями</div>
        ${c.settlement.map((s) => `<div style="font-size:15px;font-weight:500;margin-top:6px">${esc(s.fromName)} → ${esc(s.toName)} · <span class="num">${money(s.amount)}</span></div>`).join('')}
      </div>` : ''}

      <div class="section-h"><h2>Операции</h2>${me.canAdd ? `<a class="pill" href="#/o/${id}/add">${I.plusSm}Добавить</a>` : ''}</div>
      <div class="chips" style="margin-bottom:6px">${filters.map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${entries.length ? `<div class="rows">${entries.map(entryRow).join('')}</div>` : `<div class="empty">${filter === 'all' ? 'Операций пока нет.' : 'Нет операций этого типа.'}${me.canAdd && filter === 'all' ? '<br>Добавьте взнос, расход или плановую сумму.' : ''}</div>`}
    </div>
    ${tabbar('', me.canAdd ? `#/o/${id}/add` : null)}`;
  on('[data-f]', 'click', (e) => viewObject(id, e.currentTarget.dataset.f));
}

async function viewAdd(id, presetKind) {
  const d = state.cache[id] || (await api('GET', `/api/objects/${id}`));
  if (!d.me.canAdd) { toast('Ваша роль не позволяет добавлять операции'); return go(`#/o/${id}`); }
  const foreman = d.me.role === 'foreman';
  const kinds = foreman ? [['out', 'Расход · факт'], ['plan', 'План']] : [['in', 'Взнос'], ['out', 'Расход · факт'], ['plan', 'План']];
  const s = {
    kind: presetKind && kinds.some((k) => k[0] === presetKind) ? presetKind : foreman ? 'out' : 'out',
    source: 'own',
    category: foreman ? 'Ремонт' : 'Ремонт',
    photos: []
  };
  const draw = () => {
    const amountVal = app.querySelector('#amt') ? app.querySelector('#amt').value : '';
    const noteVal = app.querySelector('#note') ? app.querySelector('#note').value : '';
    const dateVal = app.querySelector('#date') ? app.querySelector('#date').value : today();
    const isIn = s.kind === 'in', isPlan = s.kind === 'plan', isOut = s.kind === 'out';
    app.innerHTML = `
      <div class="screen no-tab">
        <div class="topbar">${backBtn(`#/o/${id}`, 'Закрыть')}<div class="title"><b>Новая операция</b><small>${esc(d.object.name)}</small></div><div class="spacer44"></div></div>
        <div class="seg" style="grid-template-columns:repeat(${kinds.length},minmax(0,1fr));margin-top:20px">${kinds.map(([k, l]) => `<button data-k="${k}" class="${k === s.kind ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div style="text-align:center;margin-top:22px">
          <label for="amt" class="muted" style="font-size:13px">${isPlan ? 'Ориентировочная сумма, €' : isOut ? 'Фактическая сумма расхода, €' : 'Сумма взноса, €'}</label>
          <input id="amt" class="amount-input" inputmode="decimal" placeholder="0" value="${esc(amountVal)}" autocomplete="off">
        </div>
        ${isPlan ? `<div class="card dashed" style="font-size:13px;line-height:1.5;color:#B5B5BA;margin-top:8px">Ориентировочный расход попадёт в план и в прогноз прибыли. Когда оплатите — добавьте фактический расход с чеком, план и факт сравнятся автоматически.</div>` : `
          <span class="label">${isIn ? 'Кто внёс' : 'Кто оплатил'}</span>
          <div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 14px">${avatar(state.me.id, state.me.name)}
            <div style="flex:1"><div style="font-weight:500">${esc(state.me.name)} <span class="muted" style="font-weight:400">· вы</span></div><div class="muted" style="font-size:12px;margin-top:2px">Только свои операции, за партнёра нельзя</div></div>
            <span class="muted" style="width:16px;height:16px;display:inline-flex" role="img" aria-label="Нельзя изменить">${I.lock}</span></div>`}
        ${isOut ? `<span class="label">Из чьих денег</span>
          <div class="seg" style="grid-template-columns:1fr 1fr"><button data-src="own" class="${s.source === 'own' ? 'on' : ''}">Из своих</button><button data-src="pool" class="${s.source === 'pool' ? 'on' : ''}">Из общих</button></div>
          <div class="muted" style="font-size:12px;margin-top:6px">${s.source === 'own' ? 'Сумма засчитается как ваше вложение.' : 'Сумма спишется из общего котла (взносов).'}</div>` : ''}
        ${!isIn ? `<span class="label">Категория${foreman ? ' · прораб вносит только ремонт' : ''}</span>
          <div class="chips">${(foreman ? ['Ремонт'] : d.categories).map((c) => `<button data-c="${esc(c)}" class="${c === s.category ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
        <label class="label" for="note">Комментарий</label>
        <input id="note" class="field" placeholder="${isIn ? 'Например: перевод на общий счёт' : 'Например: плитка, санузел'}" value="${esc(noteVal)}">
        <label class="label" for="date">Дата</label>
        <input id="date" class="field" type="date" value="${esc(dateVal)}">
        ${isOut ? `<div class="label" style="display:flex;justify-content:space-between"><span>Чеки и документы</span><span>${s.photos.length ? s.photos.length + ' фото' : ''}</span></div>
          <div class="thumbs">
            ${s.photos.map((p, k) => `<div class="thumb" style="background-image:url('${p.preview}')"><button class="x" data-rm="${k}" aria-label="Убрать фото">×</button></div>`).join('')}
            <label class="add-tile">${I.camera}<span>Камера</span><input type="file" accept="image/*" capture="environment" data-photo aria-label="Сфотографировать чек"></label>
            <label class="add-tile">${I.gallery}<span>Галерея</span><input type="file" accept="image/*" multiple data-photo aria-label="Загрузить фото из галереи"></label>
          </div>` : ''}
        <button class="btn" id="save" style="margin-top:28px">Сохранить</button>
      </div>`;
    on('[data-k]', 'click', (e) => { s.kind = e.currentTarget.dataset.k; draw(); });
    on('[data-src]', 'click', (e) => { s.source = e.currentTarget.dataset.src; draw(); });
    on('[data-c]', 'click', (e) => { s.category = e.currentTarget.dataset.c; draw(); });
    on('[data-rm]', 'click', (e) => { s.photos.splice(Number(e.currentTarget.dataset.rm), 1); draw(); });
    on('[data-photo]', 'change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files.slice(0, 10 - s.photos.length)) {
        try { s.photos.push(await compressImage(f)); } catch (ex) { toast(ex.message); }
      }
      draw();
    });
    app.querySelector('#save').onclick = async (e) => {
      const btn = e.currentTarget;
      const amount = app.querySelector('#amt').value.replace(/\s/g, '').replace(',', '.');
      btn.disabled = true;
      btn.textContent = 'Сохраняю…';
      try {
        await api('POST', `/api/objects/${id}/entries`, {
          kind: s.kind,
          source: s.source,
          category: s.category,
          amount,
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

async function viewEntry(eid) {
  const d = await api('GET', `/api/entries/${eid}`);
  const e = d.entry;
  const ids = d.receipts.map((r) => r.id);
  app.innerHTML = `
    <div class="screen no-tab">
      <div class="topbar">${backBtn(`#/o/${e.object_id}`)}<div class="title"><b>${KIND[e.kind]}${e.kind === 'out' ? ' · факт' : ''}</b></div><div class="spacer44"></div></div>
      <div style="text-align:center;margin-top:24px">
        <div class="muted" style="font-size:13px">${esc(e.category || (e.kind === 'in' ? 'Взнос' : ''))}</div>
        <div class="hero-num" style="font-size:42px">${e.kind === 'in' ? '+' : e.kind === 'out' ? '−' : ''}${fmt(e.amount)} <span class="cur">€</span></div>
      </div>
      <div class="card list" style="margin-top:20px">
        <div class="row">${avatar(e.user_id, e.author)}<div class="grow"><div class="t">${esc(e.author)}${e.mine ? ' <span class="muted" style="font-size:12px">(вы)</span>' : ''}</div><div class="s">${e.kind === 'in' ? 'внёс' : e.kind === 'out' ? 'оплатил' : 'запланировал'} · ${dateRu(e.entry_date)}</div></div></div>
        ${e.kind === 'out' ? `<div class="row"><div class="grow muted" style="font-size:14px">Из чьих денег</div><div class="r">${e.source === 'pool' ? 'из общих' : 'из своих'}</div></div>` : ''}
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
      ${e.mine ? '<button class="btn danger" id="del" style="margin-top:32px">Удалить операцию</button>' : '<div class="muted" style="font-size:12px;margin-top:28px;text-align:center">Изменить или удалить операцию может только её автор</div>'}
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
  const del = app.querySelector('#del');
  if (del) del.onclick = async () => {
    if (!confirm('Удалить эту операцию вместе с чеками?')) return;
    try { await api('DELETE', `/api/entries/${eid}`); delete state.cache[e.object_id]; go(`#/o/${e.object_id}`); } catch (ex) { toast(ex.message); }
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
        ${me.canAdd ? `<a class="icon-btn" href="#/o/${id}/add/plan" aria-label="Добавить плановый расход">${I.plus}</a>` : '<div class="spacer44"></div>'}</div>
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
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #3A3428">${dist}</div>
        ${c.shareSum !== 100 ? '<div class="red" style="font-size:12px;margin-top:10px">Доли инвесторов не равны 100 % — создатель должен их поправить.</div>' : ''}
      </div>` : ''}
      <div class="section-h" style="margin-bottom:4px"><h2>Расходы</h2><div class="num" style="font-size:13px"><span class="muted">факт</span> ${fmt(c.factTotal)} <span class="muted">/ план</span> ${fmt(c.planTotal)} €</div></div>
      <div style="display:flex;gap:14px;font-size:11px;color:var(--muted);margin-bottom:6px">
        <span style="display:flex;align-items:center;gap:6px"><i style="width:12px;height:4px;border-radius:2px;background:var(--gold);display:inline-block"></i>Факт</span>
        <span style="display:flex;align-items:center;gap:6px"><i style="width:12px;height:4px;border-radius:2px;background:var(--line2);display:inline-block"></i>План</span>
        <span style="display:flex;align-items:center;gap:6px"><i style="width:12px;height:4px;border-radius:2px;background:var(--red);display:inline-block"></i>Перерасход</span></div>
      ${rows ? `<div class="rows">${rows}</div>` : '<div class="empty">Добавьте плановые и фактические расходы — здесь появится сравнение.</div>'}
      <div class="muted" style="font-size:12px;line-height:1.5;margin-top:16px">Прогноз затрат: по каждой статье берётся план, а если факт уже больше — факт. Итого ≈ ${money(c.forecastCosts)}.</div>
    </div>`;
  const save = app.querySelector('#saveSale');
  if (save) save.onclick = async () => {
    try {
      await api('PATCH', `/api/objects/${id}`, { name: o.name, area: o.area, status: o.status, sale_price: app.querySelector('#sale').value.replace(/\s/g, '').replace(',', '.') });
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
    if (!confirm('Убрать участника из объекта?')) return;
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
      app.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована', true); } catch { prompt('Скопируйте ссылку', url); } };
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
  if (req) req.onclick = async () => { if (confirm('Отправить участникам запрос на удаление объекта?')) try { done(await api('POST', `/api/objects/${id}/delete-request`)); } catch (ex) { toast(ex.message); } };
  const yes = app.querySelector('#yes');
  if (yes) yes.onclick = async () => { if (confirm('Подтверждаете удаление объекта?')) try { done(await api('POST', `/api/objects/${id}/delete-vote`, { agree: true })); } catch (ex) { toast(ex.message); } };
  const no = app.querySelector('#no');
  if (no) no.onclick = async () => { try { await api('POST', `/api/objects/${id}/delete-vote`, { agree: false }); toast('Запрос на удаление отклонён', true); viewDelete(id); } catch (ex) { toast(ex.message); } };
  const cancel = app.querySelector('#cancel');
  if (cancel) cancel.onclick = async () => { try { await api('POST', `/api/objects/${id}/delete-cancel`); viewDelete(id); } catch (ex) { toast(ex.message); } };
}

// ---------- роутер ----------
const routes = [
  [/^#\/login$/, () => viewAuth('login'), true],
  [/^#\/register$/, () => viewAuth('register'), true],
  [/^#\/join\/([\w-]+)$/, (m) => viewJoin(m[1]), true],
  [/^#\/profile$/, () => viewProfile()],
  [/^#\/new$/, () => viewObjectForm(null)],
  [/^#\/o\/(\d+)$/, (m) => viewObject(m[1])],
  [/^#\/o\/(\d+)\/edit$/, (m) => viewObjectForm(m[1])],
  [/^#\/o\/(\d+)\/add(?:\/(\w+))?$/, (m) => viewAdd(m[1], m[2])],
  [/^#\/o\/(\d+)\/forecast$/, (m) => viewForecast(m[1])],
  [/^#\/o\/(\d+)\/members$/, (m) => viewMembers(m[1])],
  [/^#\/o\/(\d+)\/shares$/, (m) => viewShares(m[1])],
  [/^#\/o\/(\d+)\/delete$/, (m) => viewDelete(m[1])],
  [/^#\/e\/(\d+)$/, (m) => viewEntry(m[1])],
  [/^#?\/?$/, () => viewHome()]
];

async function render() {
  const hash = location.hash || '#/';
  document.querySelectorAll('.viewer').forEach((v) => v.remove());
  for (const [re, fn, isPublic] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    if (!isPublic && !state.me) return go('#/login');
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
    }
  } catch { /* офлайн */ }
  window.addEventListener('hashchange', render);
  if (startParam.startsWith('join_')) return go(`#/join/${startParam.slice(5)}`);
  if (TG) {
    const inv = sessionStorage.getItem('invite');
    if (inv && (location.hash || '#/') === '#/') return go(`#/join/${inv}`);
  }
  render();
})();
