// Доска сделок: «Хочу стать инвестором» и предложения сделок.
// Всё публикуется только после проверки администратором. Контакты открываются,
// когда вторая сторона принимает отклик.

module.exports = function registerMarket({ route, db, fail, str, num, tg, appUrl, PUBLIC_URL, fmtEur }) {
  const amountOrNull = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(x) || x < 0 || x > 1e10) fail(400, 'Проверьте сумму');
    return Math.round(x);
  };
  const needAmount = (v, msg) => {
    const x = amountOrNull(v);
    if (!x) fail(400, msg);
    return x;
  };

  async function userLang(id) {
    const u = await db.one('SELECT telegram_id, lang FROM users WHERE id = $1', [id]);
    return u || {};
  }
  // Сообщение одному пользователю в бот
  async function notifyUser(userId, text, hashPath) {
    if (!tg.enabled()) return;
    try {
      const u = await userLang(userId);
      if (!u.telegram_id) return;
      const lang = u.lang === 'ro' ? 'ro' : 'ru';
      await tg.send(String(u.telegram_id), text(lang), PUBLIC_URL ? appUrl(hashPath) : null, lang === 'ro' ? 'Deschide în Dolya' : 'Открыть в Доле');
    } catch (e) { console.warn('market notify failed', e.message); }
  }
  async function notifyAdmins(text) {
    const admins = await db.query('SELECT id FROM users WHERE is_admin = true AND telegram_id IS NOT NULL');
    for (const a of admins) await notifyUser(a.id, text, '/market/admin');
  }

  // Сколько сделок человек закрыл в Доле — для доверия
  async function dealsClosed(userIds) {
    if (!userIds.length) return {};
    const rows = await db.query(
      `SELECT m.user_id, COUNT(*)::int AS n FROM members m JOIN objects o ON o.id = m.object_id
       WHERE o.sold_at IS NOT NULL AND m.role <> 'viewer' AND m.user_id IN (${[...new Set(userIds.map((x) => Number(x) | 0))].join(',')}) GROUP BY m.user_id`
    );
    return Object.fromEntries(rows.map((r) => [Number(r.user_id), Number(r.n)]));
  }

  async function contacts(userId) {
    const u = await db.one('SELECT id, name, email, tg_username, telegram_id, phone FROM users WHERE id = $1', [userId]);
    if (!u) return null;
    return {
      name: u.name,
      telegram: u.tg_username ? `https://t.me/${u.tg_username}` : u.telegram_id ? `tg://user?id=${u.telegram_id}` : null,
      tg_username: u.tg_username || null,
      phone: u.phone || null,
      email: u.email || null
    };
  }
  const contactLine = (c, lang) => {
    if (!c) return '';
    const parts = [];
    if (c.tg_username) parts.push(`@${c.tg_username}`);
    if (c.phone) parts.push(c.phone);
    if (!parts.length && c.email) parts.push(c.email);
    return `${tg.escHtml(c.name)}${parts.length ? ' — ' + tg.escHtml(parts.join(', ')) : lang === 'ro' ? ' — scrieți-i în aplicație' : ''}`;
  };

  const offerOut = (o, closedMap) => ({
    id: o.id,
    user_id: Number(o.user_id),
    author: o.author,
    author_deals: closedMap[Number(o.user_id)] || 0,
    title: o.title,
    district: o.district,
    description: o.description,
    price: num(o.price),
    need_amount: num(o.need_amount),
    expected_pct: num(o.expected_pct),
    term_months: num(o.term_months),
    status: o.status,
    reject_reason: o.reject_reason,
    created_at: o.created_at
  });

  // ---------- главная доски ----------
  route('GET', '/api/market', async ({ user }) => {
    const offers = await db.query(
      `SELECT mo.*, u.name AS author FROM market_offers mo JOIN users u ON u.id = mo.user_id
       WHERE mo.status = 'approved' OR mo.user_id = $1 ORDER BY mo.created_at DESC`,
      [user.id]
    );
    const investors = await db.query(
      `SELECT ip.*, u.name FROM investor_profiles ip JOIN users u ON u.id = ip.user_id
       WHERE ip.status = 'approved' OR ip.user_id = $1 ORDER BY ip.updated_at DESC`,
      [user.id]
    );
    const ids = [...new Set([...offers.map((o) => Number(o.user_id)), ...investors.map((i) => Number(i.user_id))])];
    const closed = await dealsClosed(ids);
    const mine = await db.query(
      `SELECT r.offer_id, r.investor_id, r.status, r.initiator FROM market_responses r JOIN market_offers mo ON mo.id = r.offer_id
       WHERE r.investor_id = $1 OR mo.user_id = $1`,
      [user.id]
    );
    // Заявки, на которые должен ответить я
    const inbox = await db.query(
      `SELECT r.id FROM market_responses r JOIN market_offers mo ON mo.id = r.offer_id
       WHERE r.status = 'pending' AND ((r.initiator = 'investor' AND mo.user_id = $1) OR (r.initiator = 'owner' AND r.investor_id = $1))`,
      [user.id]
    );
    let moderation = 0;
    if (user.is_admin) {
      const p = await db.one(`SELECT (SELECT COUNT(*) FROM market_offers WHERE status = 'pending') + (SELECT COUNT(*) FROM investor_profiles WHERE status = 'pending') AS n`);
      moderation = Number(p.n);
    }
    const myProfile = investors.find((i) => Number(i.user_id) === Number(user.id)) || null;
    return {
      offers: offers.filter((o) => o.status !== 'closed' || Number(o.user_id) === Number(user.id)).map((o) => {
        const out = offerOut(o, closed);
        out.mine = out.user_id === Number(user.id);
        const r = mine.find((x) => Number(x.offer_id) === o.id && Number(x.investor_id) === Number(user.id));
        out.my_response = r ? r.status : null;
        out.responses = mine.filter((x) => Number(x.offer_id) === o.id).length;
        return out;
      }),
      investors: investors.filter((i) => i.status === 'approved' && Number(i.user_id) !== Number(user.id)).map((i) => ({
        user_id: Number(i.user_id), name: i.name, amount_from: num(i.amount_from), amount_to: num(i.amount_to), note: i.note,
        deals: closed[Number(i.user_id)] || 0
      })),
      my_profile: myProfile ? { amount_from: num(myProfile.amount_from), amount_to: num(myProfile.amount_to), note: myProfile.note, status: myProfile.status, reject_reason: myProfile.reject_reason } : null,
      inbox: inbox.length,
      moderation
    };
  });

  // ---------- анкета инвестора ----------
  route('PUT', '/api/market/profile', async ({ user, body }) => {
    const to = needAmount(body.amount_to, 'Укажите, сколько готовы вложить');
    const from = amountOrNull(body.amount_from);
    if (from !== null && from > to) fail(400, 'Сумма «от» больше суммы «до»');
    const note = str(body.note, 500) || null;
    await db.query(
      `INSERT INTO investor_profiles (user_id, amount_from, amount_to, note, status, reject_reason, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', NULL, now())
       ON CONFLICT (user_id) DO UPDATE SET amount_from = $2, amount_to = $3, note = $4, status = 'pending', reject_reason = NULL, updated_at = now()`,
      [user.id, from, to, note]
    );
    const range = `${from ? fmtEur(from) + ' – ' : ''}${fmtEur(to)}`;
    notifyAdmins((lang) => lang === 'ro'
      ? `🆕 Profil de investitor spre verificare: <b>${tg.escHtml(user.name)}</b>, ${range}.`
      : `🆕 Анкета инвестора на проверку: <b>${tg.escHtml(user.name)}</b>, ${range}.`);
    return { ok: true };
  });
  route('DELETE', '/api/market/profile', async ({ user }) => {
    await db.query('DELETE FROM investor_profiles WHERE user_id = $1', [user.id]);
    return { ok: true };
  });

  // ---------- предложения сделок ----------
  function offerFields(body) {
    const title = str(body.title, 120);
    if (title.length < 3) fail(400, 'Опишите объект в заголовке');
    return {
      title,
      district: str(body.district, 120) || null,
      description: str(body.description, 2000) || null,
      price: amountOrNull(body.price),
      need: needAmount(body.need_amount, 'Укажите, сколько денег нужно от инвестора'),
      pct: (() => { const x = amountOrNull(body.expected_pct); if (x !== null && x > 1000) fail(400, 'Проверьте доходность'); return x; })(),
      term: (() => { const x = amountOrNull(body.term_months); if (x !== null && x > 240) fail(400, 'Проверьте срок'); return x; })()
    };
  }
  route('POST', '/api/market/offers', async ({ user, body }) => {
    const f = offerFields(body);
    const open = await db.one(`SELECT COUNT(*)::int AS n FROM market_offers WHERE user_id = $1 AND status IN ('pending', 'approved')`, [user.id]);
    if (open.n >= 10) fail(400, 'Не больше 10 активных предложений');
    const o = await db.one(
      `INSERT INTO market_offers (user_id, title, district, description, price, need_amount, expected_pct, term_months)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [user.id, f.title, f.district, f.description, f.price, f.need, f.pct, f.term]
    );
    notifyAdmins((lang) => lang === 'ro'
      ? `🆕 Ofertă spre verificare: <b>${tg.escHtml(f.title)}</b> de la ${tg.escHtml(user.name)}, necesar ${fmtEur(f.need)}.`
      : `🆕 Предложение на проверку: <b>${tg.escHtml(f.title)}</b> от ${tg.escHtml(user.name)}, нужно ${fmtEur(f.need)}.`);
    return { id: o.id };
  });

  async function loadOffer(id) {
    const o = await db.one('SELECT mo.*, u.name AS author FROM market_offers mo JOIN users u ON u.id = mo.user_id WHERE mo.id = $1', [id]);
    if (!o) fail(404, 'Предложение не найдено');
    return o;
  }

  route('PUT', '/api/market/offers/:id', async ({ user, params, body }) => {
    const o = await loadOffer(params.id);
    if (Number(o.user_id) !== Number(user.id)) fail(403, 'Изменить может только автор');
    if (o.status === 'closed') fail(400, 'Предложение снято');
    const f = offerFields(body);
    await db.query(
      `UPDATE market_offers SET title = $1, district = $2, description = $3, price = $4, need_amount = $5, expected_pct = $6, term_months = $7,
         status = 'pending', reject_reason = NULL, updated_at = now() WHERE id = $8`,
      [f.title, f.district, f.description, f.price, f.need, f.pct, f.term, o.id]
    );
    notifyAdmins((lang) => lang === 'ro'
      ? `✏️ Oferta modificată, verificați din nou: <b>${tg.escHtml(f.title)}</b>.`
      : `✏️ Предложение изменено, нужна повторная проверка: <b>${tg.escHtml(f.title)}</b>.`);
    return { ok: true };
  });

  route('POST', '/api/market/offers/:id/close', async ({ user, params }) => {
    const o = await loadOffer(params.id);
    if (Number(o.user_id) !== Number(user.id) && !user.is_admin) fail(403, 'Снять может только автор');
    await db.query(`UPDATE market_offers SET status = 'closed', updated_at = now() WHERE id = $1`, [o.id]);
    await db.query(`UPDATE market_responses SET status = 'declined', answered_at = now() WHERE offer_id = $1 AND status = 'pending'`, [o.id]);
    return { ok: true };
  });

  route('GET', '/api/market/offers/:id', async ({ user, params }) => {
    const o = await loadOffer(params.id);
    const mine = Number(o.user_id) === Number(user.id);
    if (o.status !== 'approved' && !mine && !user.is_admin) fail(404, 'Предложение не найдено');
    const closed = await dealsClosed([Number(o.user_id)]);
    const out = offerOut(o, closed);
    out.mine = mine;
    const rows = await db.query(
      `SELECT r.*, u.name, ip.amount_from, ip.amount_to, ip.status AS profile_status FROM market_responses r
       JOIN users u ON u.id = r.investor_id LEFT JOIN investor_profiles ip ON ip.user_id = r.investor_id
       WHERE r.offer_id = $1 ${mine ? '' : 'AND r.investor_id = $2'} ORDER BY r.created_at DESC`,
      mine ? [o.id] : [o.id, user.id]
    );
    const invDeals = await dealsClosed(rows.map((r) => Number(r.investor_id)));
    out.responses = [];
    for (const r of rows) {
      const accepted = r.status === 'accepted';
      out.responses.push({
        id: r.id,
        investor_id: Number(r.investor_id),
        name: r.name,
        initiator: r.initiator,
        message: r.message,
        status: r.status,
        created_at: r.created_at,
        amount_from: r.profile_status === 'approved' ? num(r.amount_from) : null,
        amount_to: r.profile_status === 'approved' ? num(r.amount_to) : null,
        deals: invDeals[Number(r.investor_id)] || 0,
        can_answer: r.status === 'pending' && ((r.initiator === 'investor' && mine) || (r.initiator === 'owner' && Number(r.investor_id) === Number(user.id))),
        contact: accepted ? await contacts(mine ? r.investor_id : o.user_id) : null
      });
    }
    return { offer: out };
  });

  // Инвестор откликается на предложение
  route('POST', '/api/market/offers/:id/respond', async ({ user, params, body }) => {
    const o = await loadOffer(params.id);
    if (o.status !== 'approved') fail(400, 'Предложение сейчас не принимает отклики');
    if (Number(o.user_id) === Number(user.id)) fail(400, 'Это ваше предложение');
    const exists = await db.one('SELECT id, status FROM market_responses WHERE offer_id = $1 AND investor_id = $2', [o.id, user.id]);
    if (exists && exists.status !== 'declined') fail(409, 'Вы уже откликнулись');
    const message = str(body.message, 500) || null;
    if (exists) await db.query(`UPDATE market_responses SET initiator = 'investor', message = $1, status = 'pending', created_at = now(), answered_at = NULL WHERE id = $2`, [message, exists.id]);
    else await db.query(`INSERT INTO market_responses (offer_id, investor_id, initiator, message) VALUES ($1, $2, 'investor', $3)`, [o.id, user.id, message]);
    const prof = await db.one(`SELECT amount_from, amount_to FROM investor_profiles WHERE user_id = $1 AND status = 'approved'`, [user.id]);
    const range = prof ? ` (${prof.amount_from ? fmtEur(prof.amount_from) + ' – ' : ''}${fmtEur(prof.amount_to)})` : '';
    notifyUser(o.user_id, (lang) => lang === 'ro'
      ? `🤝 Investitorul <b>${tg.escHtml(user.name)}</b>${range} este interesat de oferta «${tg.escHtml(o.title)}». Acceptați — și veți primi contactele reciproc.`
      : `🤝 Инвестор <b>${tg.escHtml(user.name)}</b>${range} заинтересовался предложением «${tg.escHtml(o.title)}». Примите отклик — и вы получите контакты друг друга.`,
    `/market/o/${o.id}`);
    return { ok: true };
  });

  // Автор сделки предлагает её инвестору с доски
  route('POST', '/api/market/investors/:uid/propose', async ({ user, params, body }) => {
    const investorId = Number(params.uid);
    if (investorId === Number(user.id)) fail(400, 'Нельзя предложить сделку себе');
    const prof = await db.one(`SELECT user_id FROM investor_profiles WHERE user_id = $1 AND status = 'approved'`, [investorId]);
    if (!prof) fail(404, 'Анкета инвестора не найдена');
    const o = await loadOffer(body.offer_id);
    if (Number(o.user_id) !== Number(user.id)) fail(403, 'Предложить можно только свою сделку');
    if (o.status !== 'approved') fail(400, 'Сделка ещё не прошла проверку');
    const exists = await db.one('SELECT id, status FROM market_responses WHERE offer_id = $1 AND investor_id = $2', [o.id, investorId]);
    if (exists && exists.status !== 'declined') fail(409, 'Этому инвестору сделка уже предложена');
    const message = str(body.message, 500) || null;
    if (exists) await db.query(`UPDATE market_responses SET initiator = 'owner', message = $1, status = 'pending', created_at = now(), answered_at = NULL WHERE id = $2`, [message, exists.id]);
    else await db.query(`INSERT INTO market_responses (offer_id, investor_id, initiator, message) VALUES ($1, $2, 'owner', $3)`, [o.id, investorId, message]);
    notifyUser(investorId, (lang) => lang === 'ro'
      ? `💼 <b>${tg.escHtml(user.name)}</b> vă propune o tranzacție: «${tg.escHtml(o.title)}», necesar ${fmtEur(o.need_amount)}. Acceptați — și veți primi contactele reciproc.`
      : `💼 <b>${tg.escHtml(user.name)}</b> предлагает вам сделку: «${tg.escHtml(o.title)}», нужно ${fmtEur(o.need_amount)}. Примите — и вы получите контакты друг друга.`,
    `/market/o/${o.id}`);
    return { ok: true };
  });

  // Ответ на отклик: принять — открыть контакты, отклонить
  route('POST', '/api/market/responses/:id/answer', async ({ user, params, body }) => {
    const r = await db.one(
      `SELECT r.*, mo.user_id AS owner_id, mo.title FROM market_responses r JOIN market_offers mo ON mo.id = r.offer_id WHERE r.id = $1`,
      [params.id]
    );
    if (!r) fail(404, 'Отклик не найден');
    const answerer = r.initiator === 'investor' ? Number(r.owner_id) : Number(r.investor_id);
    if (answerer !== Number(user.id)) fail(403, 'Ответить может только вторая сторона');
    if (r.status !== 'pending') fail(400, 'На отклик уже ответили');
    const accept = body.accept === true;
    await db.query(`UPDATE market_responses SET status = $1, answered_at = now() WHERE id = $2`, [accept ? 'accepted' : 'declined', r.id]);
    const other = r.initiator === 'investor' ? Number(r.investor_id) : Number(r.owner_id);
    const title = tg.escHtml(r.title);
    if (accept) {
      const [cOwner, cInv] = [await contacts(r.owner_id), await contacts(r.investor_id)];
      notifyUser(r.investor_id, (lang) => lang === 'ro'
        ? `✅ Contact deschis pentru «${title}».\nAutorul ofertei: ${contactLine(cOwner, lang)}`
        : `✅ Контакты открыты по сделке «${title}».\nАвтор предложения: ${contactLine(cOwner, lang)}`, `/market/o/${r.offer_id}`);
      notifyUser(r.owner_id, (lang) => lang === 'ro'
        ? `✅ Contact deschis pentru «${title}».\nInvestitor: ${contactLine(cInv, lang)}`
        : `✅ Контакты открыты по сделке «${title}».\nИнвестор: ${contactLine(cInv, lang)}`, `/market/o/${r.offer_id}`);
    } else {
      notifyUser(other, (lang) => lang === 'ro'
        ? `Răspunsul pentru «${title}» a fost refuzat.`
        : `По сделке «${title}» отклик отклонён.`, `/market`);
    }
    return { ok: true };
  });

  // Мои отклики и предложения, ждущие ответа
  route('GET', '/api/market/inbox', async ({ user }) => {
    const rows = await db.query(
      `SELECT r.id, r.offer_id, r.investor_id, r.initiator, r.status, r.message, r.created_at, mo.title, mo.user_id AS owner_id,
              ui.name AS investor_name, uo.name AS owner_name
       FROM market_responses r JOIN market_offers mo ON mo.id = r.offer_id
       JOIN users ui ON ui.id = r.investor_id JOIN users uo ON uo.id = mo.user_id
       WHERE r.investor_id = $1 OR mo.user_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [user.id]
    );
    return {
      items: rows.map((r) => {
        const iAmOwner = Number(r.owner_id) === Number(user.id);
        return {
          id: r.id, offer_id: r.offer_id, title: r.title, status: r.status, message: r.message, created_at: r.created_at,
          incoming: (r.initiator === 'investor') === iAmOwner,
          other_name: iAmOwner ? r.investor_name : r.owner_name,
          role: iAmOwner ? 'owner' : 'investor',
          can_answer: r.status === 'pending' && ((r.initiator === 'investor' && iAmOwner) || (r.initiator === 'owner' && !iAmOwner))
        };
      })
    };
  });

  // ---------- модерация ----------
  route('GET', '/api/market/admin', async ({ user }) => {
    if (!user.is_admin) fail(403, 'Только для администратора приложения');
    const offers = await db.query(
      `SELECT mo.*, u.name AS author FROM market_offers mo JOIN users u ON u.id = mo.user_id WHERE mo.status = 'pending' ORDER BY mo.updated_at`
    );
    const profiles = await db.query(
      `SELECT ip.*, u.name FROM investor_profiles ip JOIN users u ON u.id = ip.user_id WHERE ip.status = 'pending' ORDER BY ip.updated_at`
    );
    const closed = await dealsClosed([...offers.map((o) => Number(o.user_id)), ...profiles.map((p) => Number(p.user_id))]);
    return {
      offers: offers.map((o) => offerOut(o, closed)),
      profiles: profiles.map((p) => ({ user_id: Number(p.user_id), name: p.name, amount_from: num(p.amount_from), amount_to: num(p.amount_to), note: p.note, deals: closed[Number(p.user_id)] || 0 }))
    };
  });

  route('POST', '/api/market/admin/:kind/:id', async ({ user, params, body }) => {
    if (!user.is_admin) fail(403, 'Только для администратора приложения');
    const approve = body.approve === true;
    const reason = approve ? null : str(body.reason, 300) || null;
    const status = approve ? 'approved' : 'rejected';
    if (params.kind === 'offer') {
      const o = await loadOffer(params.id);
      await db.query('UPDATE market_offers SET status = $1, reject_reason = $2, updated_at = now() WHERE id = $3', [status, reason, o.id]);
      notifyUser(o.user_id, (lang) => approve
        ? (lang === 'ro' ? `✅ Oferta «${tg.escHtml(o.title)}» a fost publicată pe panou.` : `✅ Предложение «${tg.escHtml(o.title)}» опубликовано на доске.`)
        : (lang === 'ro' ? `Oferta «${tg.escHtml(o.title)}» nu a fost publicată.${reason ? ' Motiv: ' + tg.escHtml(reason) : ''}` : `Предложение «${tg.escHtml(o.title)}» не опубликовано.${reason ? ' Причина: ' + tg.escHtml(reason) : ''}`),
      `/market/o/${o.id}`);
    } else if (params.kind === 'profile') {
      const p = await db.one('SELECT user_id FROM investor_profiles WHERE user_id = $1', [params.id]);
      if (!p) fail(404, 'Анкета не найдена');
      await db.query('UPDATE investor_profiles SET status = $1, reject_reason = $2, updated_at = now() WHERE user_id = $3', [status, reason, p.user_id]);
      notifyUser(p.user_id, (lang) => approve
        ? (lang === 'ro' ? '✅ Profilul dvs. de investitor a fost publicat. Autorii ofertelor vă pot propune tranzacții.' : '✅ Ваша анкета инвестора опубликована. Авторы сделок смогут предлагать вам сделки.')
        : (lang === 'ro' ? `Profilul de investitor nu a fost publicat.${reason ? ' Motiv: ' + tg.escHtml(reason) : ''}` : `Анкета инвестора не опубликована.${reason ? ' Причина: ' + tg.escHtml(reason) : ''}`),
      '/market');
    } else fail(404, 'Не найдено');
    return { ok: true };
  });
};
